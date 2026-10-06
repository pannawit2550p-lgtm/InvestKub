import 'server-only';
import { unstable_cache, unstable_noStore as noStore } from 'next/cache';

import { createAdminClient } from '@/lib/supabase/admin';
import { calculatePortfolio, type HoldingInput } from '@/lib/portfolio/calc';
import { getCachedQuote } from '@/lib/market/cache';
import { getAssetMetadata } from '@/lib/market/mockAssets';
import { toAccountCurrency } from '@/lib/currency';
import { resolveDisplayName } from './privacy';
import { compareLeaderboardEntries, makePortfolioAllocations, toPublicLeaderboardEntry, type PublicAllocation, type PublicLeaderboardEntry } from './calculations';
import type { Quote } from '@/lib/market/provider';
import { isProfileAvatarId, type ProfileAvatarId, type ProfileAvatarType } from '@/lib/profile/avatars';
import { LEADERBOARD_CACHE_SECONDS, LEADERBOARD_CACHE_TAG, singleFlight, visibleRankedEntries } from './cache';

interface ProfileRecord {
  id: string;
  public_id: string;
  display_name: string;
  display_name_custom: boolean;
  leaderboard_visible: boolean;
  cash_balance: number;
  starting_balance: number;
  reward_balance: number;
  realized_pl: number;
  session_started_at: string;
  avatar_type: string;
  avatar_character: ProfileAvatarId | null;
  avatar_storage_path: string | null;
}

interface HoldingRecord {
  user_id: string;
  symbol: string;
  quantity: number;
  avg_cost: number;
}

interface StockRecord {
  symbol: string;
  name: string;
  logo_url: string | null;
  currency: string | null;
}

interface InternalLeader {
  authId: string;
  public_id: string;
  display_name: string;
  avatar_type: ProfileAvatarType;
  avatar_character: ProfileAvatarId | null;
  avatar_storage_path: string | null;
  session_started_at: string;
  portfolio_value: number;
  total_pl: number;
  total_pl_pct: number;
  starting_balance: number;
  reward_total: number;
  holdings_count: number;
  cash_balance: number;
  assets: Array<{ symbol: string; name: string; logo_url: string | null; market_value: number }>;
  rank: number;
}

async function loadInternalLeaders(admin = createAdminClient()) {
  const profilesResult = await admin.from('profiles').select(
    'id, public_id, display_name, display_name_custom, leaderboard_visible, cash_balance, starting_balance, reward_balance, realized_pl, session_started_at, avatar_type, avatar_character, avatar_storage_path',
  );
  if (profilesResult.error) throw new Error('LEADERBOARD_PROFILES_FAILED');
  const profiles = (profilesResult.data ?? []) as ProfileRecord[];
  const visibleProfiles = profiles.filter((profile) => profile.leaderboard_visible);
  if (!visibleProfiles.length) return { profiles, leaders: [] as InternalLeader[] };

  const visibleIds = visibleProfiles.map((profile) => profile.id);
  const holdingsResult = await admin.from('holdings').select('user_id, symbol, quantity, avg_cost').in('user_id', visibleIds);
  if (holdingsResult.error) throw new Error('LEADERBOARD_HOLDINGS_FAILED');
  const holdingRows = (holdingsResult.data ?? []) as HoldingRecord[];
  const symbols = [...new Set(holdingRows.map((holding) => holding.symbol))];
  let stocks: StockRecord[] = [];
  if (symbols.length) {
    const stocksResult = await admin.from('stocks').select('symbol, name, logo_url, currency').in('symbol', symbols);
    if (stocksResult.error) throw new Error('LEADERBOARD_STOCKS_FAILED');
    stocks = (stocksResult.data ?? []) as StockRecord[];
  }

  const stockBySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));
  const quoteEntries: Array<readonly [string, Quote] | null> = await Promise.all(symbols.map(async (symbol): Promise<readonly [string, Quote] | null> => {
    try {
      const quote = await getCachedQuote(symbol);
      const currency = stockBySymbol.get(symbol)?.currency ?? getAssetMetadata(symbol).currency;
      const accountQuote: Quote = {
        ...quote,
        price: toAccountCurrency(quote.price, currency),
        prevClose: toAccountCurrency(quote.prevClose, currency),
        change: toAccountCurrency(quote.change, currency),
        open: quote.open === undefined ? undefined : toAccountCurrency(quote.open, currency),
        high: quote.high === undefined ? undefined : toAccountCurrency(quote.high, currency),
        low: quote.low === undefined ? undefined : toAccountCurrency(quote.low, currency),
      };
      return [symbol, accountQuote];
    } catch {
      // Match the portfolio screen: a holding without a usable quote is omitted from valuation.
      return null;
    }
  }));
  const quotes: Record<string, Quote> = Object.fromEntries(quoteEntries.filter((entry) => entry !== null));
  const holdingsByUser = new Map<string, HoldingRecord[]>();
  for (const holding of holdingRows) {
    const rows = holdingsByUser.get(holding.user_id) ?? [];
    rows.push(holding);
    holdingsByUser.set(holding.user_id, rows);
  }

  const leaders = visibleProfiles.map((profile) => {
    const avatarType: ProfileAvatarType = profile.avatar_type === 'upload' || profile.avatar_type === 'character' ? profile.avatar_type : 'initial';
    const avatarCharacter = avatarType === 'character' && isProfileAvatarId(profile.avatar_character) ? profile.avatar_character : null;
    const rows = holdingsByUser.get(profile.id) ?? [];
    const holdingInputs: HoldingInput[] = rows.map((holding) => ({
      symbol: holding.symbol,
      name: stockBySymbol.get(holding.symbol)?.name ?? holding.symbol,
      logo_url: stockBySymbol.get(holding.symbol)?.logo_url,
      quantity: Number(holding.quantity),
      avg_cost: Number(holding.avg_cost),
    }));
    const rewardTotal = Number(profile.reward_balance ?? 0);
    const startingBalance = Number(profile.starting_balance) + rewardTotal;
    const calculated = calculatePortfolio(
      Number(profile.cash_balance),
      startingBalance,
      holdingInputs,
      quotes,
      Number(profile.realized_pl),
    );
    return {
      authId: profile.id,
      public_id: profile.public_id,
      display_name: resolveDisplayName(profile.display_name, profile.display_name_custom, profile.public_id),
      avatar_type: avatarType,
      avatar_character: avatarCharacter,
      avatar_storage_path: profile.avatar_storage_path,
      session_started_at: profile.session_started_at,
      portfolio_value: calculated.portfolioValue,
      total_pl: calculated.totalPl,
      total_pl_pct: calculated.totalPlPct,
      starting_balance: Number(profile.starting_balance),
      reward_total: rewardTotal,
      holdings_count: rows.length,
      cash_balance: Number(profile.cash_balance),
      assets: calculated.holdings.map((holding) => ({
        symbol: holding.symbol,
        name: holding.name,
        logo_url: holding.logo_url ?? null,
        market_value: holding.market_value,
      })),
    };
  });

  leaders.sort(compareLeaderboardEntries);
  return { profiles, leaders: leaders.map((leader, index) => ({ ...leader, rank: index + 1 })) };
}

async function publicEntries(admin: ReturnType<typeof createAdminClient>, leaders: InternalLeader[]) {
  const uploadPaths = [...new Set(leaders
    .filter((leader) => leader.avatar_type === 'upload' && leader.avatar_storage_path)
    .map((leader) => leader.avatar_storage_path as string))];
  const avatarUrls = new Map<string, string>();
  if (uploadPaths.length) {
    const { data, error } = await admin.storage.from('profile-avatars').createSignedUrls(uploadPaths, 60 * 60);
    if (!error) {
      for (const avatar of data ?? []) {
        if (avatar.path && avatar.signedUrl) avatarUrls.set(avatar.path, avatar.signedUrl);
      }
    }
  }

  return leaders.map((leader) => toPublicLeaderboardEntry({
    ...leader,
    avatar_url: leader.avatar_type === 'upload' && leader.avatar_storage_path
      ? avatarUrls.get(leader.avatar_storage_path) ?? null
      : null,
  }));
}

// No request cookies or viewer identity may enter this shared cache. Only
// expensive portfolio valuation/sorting is cached; permission checks are not.
const loadCachedLeaders = singleFlight(unstable_cache(
  async () => (await loadInternalLeaders()).leaders,
  ['leaderboard-snapshot-v1'],
  { revalidate: LEADERBOARD_CACHE_SECONDS, tags: [LEADERBOARD_CACHE_TAG] },
));

async function loadVisibleLeaders(admin: ReturnType<typeof createAdminClient>) {
  noStore();
  const { data, error } = await admin.from('profiles')
    .select('id, public_id, leaderboard_visible');
  if (error) throw new Error('LEADERBOARD_VISIBILITY_FAILED');
  const profiles = (data ?? []) as Array<Pick<ProfileRecord, 'id' | 'public_id' | 'leaderboard_visible'>>;
  const leaders = visibleRankedEntries(await loadCachedLeaders(), profiles);
  return { profiles, leaders };
}

export async function getPublicLeaderboard(viewerAuthId: string, offset: number, pageSize = 50) {
  const admin = createAdminClient();
  const { profiles, leaders } = await loadVisibleLeaders(admin);
  const viewer = profiles.find((profile) => profile.id === viewerAuthId);
  if (!viewer) throw new Error('VIEWER_PROFILE_NOT_FOUND');
  const viewerEntry = leaders.find((leader) => leader.authId === viewerAuthId);
  const safeViewer = {
    visible: viewer.leaderboard_visible,
    rank: viewerEntry?.rank ?? null,
    public_id: viewer.leaderboard_visible ? viewer.public_id : null,
    total_pl_pct: viewerEntry?.total_pl_pct ?? null,
  };

  return {
    top: await publicEntries(admin, leaders.slice(offset, offset + pageSize)),
    total: leaders.length,
    viewer: safeViewer,
  };
}

export async function getPublicProfile(viewerAuthId: string, publicId: string) {
  const admin = createAdminClient();
  const { profiles, leaders } = await loadVisibleLeaders(admin);
  const viewer = profiles.find((profile) => profile.id === viewerAuthId);
  if (!viewer) throw new Error('VIEWER_PROFILE_NOT_FOUND');
  const leader = leaders.find((entry) => entry.public_id === publicId);
  if (!leader) return null;
  const [publicLeader] = await publicEntries(admin, [leader]);
  const assets = makePortfolioAllocations(leader);
  const cashAllocation = assets.find((asset) => asset.kind === 'cash');
  return {
    ...publicLeader,
    viewer_is_owner: viewer?.public_id === leader.public_id,
    cash_percent: cashAllocation?.percent ?? 0,
    allocations: assets,
  };
}
