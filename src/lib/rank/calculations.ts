import type { ProfileAvatarId, ProfileAvatarType } from '@/lib/profile/avatars';

export interface PublicAllocation {
  key: string;
  kind: 'asset' | 'other' | 'cash';
  symbol?: string;
  name: string;
  logo_url?: string | null;
  percent: number;
  less_than_one: boolean;
}

export interface LeaderboardSortEntry {
  total_pl_pct: number;
  portfolio_value: number;
  session_started_at: string;
  public_id: string;
}

export interface PublicLeaderboardEntry extends LeaderboardSortEntry {
  display_name: string;
  total_pl: number;
  starting_balance: number;
  reward_total: number;
  holdings_count: number;
  rank: number;
  avatar_type?: ProfileAvatarType;
  avatar_character?: ProfileAvatarId | null;
  avatar_url?: string | null;
}

export function toPublicLeaderboardEntry(leader: PublicLeaderboardEntry): PublicLeaderboardEntry {
  return {
    public_id: leader.public_id,
    display_name: leader.display_name,
    session_started_at: leader.session_started_at,
    portfolio_value: leader.portfolio_value,
    total_pl: leader.total_pl,
    total_pl_pct: leader.total_pl_pct,
    starting_balance: leader.starting_balance,
    reward_total: leader.reward_total,
    holdings_count: leader.holdings_count,
    rank: leader.rank,
    ...(leader.avatar_type ? { avatar_type: leader.avatar_type } : {}),
    ...(leader.avatar_character !== undefined ? { avatar_character: leader.avatar_character } : {}),
    ...(leader.avatar_url !== undefined ? { avatar_url: leader.avatar_url } : {}),
  };
}

export function compareLeaderboardEntries(a: LeaderboardSortEntry, b: LeaderboardSortEntry): number {
  return b.portfolio_value - a.portfolio_value
    || b.total_pl_pct - a.total_pl_pct
    || a.session_started_at.localeCompare(b.session_started_at)
    || a.public_id.localeCompare(b.public_id);
}

export interface AllocationInput {
  assets: Array<{ symbol: string; name: string; logo_url: string | null; market_value: number }>;
  cash_balance: number;
  portfolio_value: number;
}

export function makePortfolioAllocations(leader: AllocationInput): PublicAllocation[] {
  const sortedAssets = leader.assets
    .filter((asset) => Number.isFinite(asset.market_value) && asset.market_value > 0)
    .sort((a, b) => b.market_value - a.market_value || a.symbol.localeCompare(b.symbol));
  const displayedAssets = sortedAssets.slice(0, 8);
  const otherValue = sortedAssets.slice(8).reduce((sum, asset) => sum + asset.market_value, 0);
  const positiveCash = Math.max(0, Number(leader.cash_balance) || 0);
  const positivePortfolioValue = Math.max(0, Number(leader.portfolio_value) || 0);

  const holdings = [
    ...displayedAssets.map((asset) => ({
      key: asset.symbol,
      kind: 'asset' as const,
      symbol: asset.symbol,
      name: asset.name,
      logo_url: asset.logo_url,
      value: asset.market_value,
    })),
    ...(otherValue > 0 ? [{ key: 'other', kind: 'other' as const, name: 'อื่นๆ', value: otherValue }] : []),
  ].sort((a, b) => {
    const valueOrder = b.value - a.value;
    if (valueOrder !== 0) return valueOrder;
    if (a.kind !== b.kind) return a.kind === 'asset' ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
  const rawItems = [...holdings, { key: 'cash', kind: 'cash' as const, name: 'เงินสด', value: positiveCash }];

  const totalValue = rawItems.reduce((sum, item) => sum + item.value, 0);
  if (totalValue <= 0 || positivePortfolioValue <= 0) {
    return [{ key: 'cash', kind: 'cash', name: 'เงินสด', percent: 100, less_than_one: false }];
  }

  const remainders = rawItems.map((item, index) => {
    const exact = item.value / totalValue * 100;
    const floor = Math.floor(exact);
    return { ...item, index, exact, percent: floor, remainder: exact - floor };
  });
  const pointsLeft = 100 - remainders.reduce((sum, item) => sum + item.percent, 0);
  const byRemainder = [...remainders].sort((a, b) => b.remainder - a.remainder || b.value - a.value || a.index - b.index);
  for (let index = 0; index < pointsLeft; index += 1) byRemainder[index].percent += 1;
  const roundedByIndex = new Map(byRemainder.map((item) => [item.index, item.percent]));

  return remainders.map((item) => ({
    key: item.key,
    kind: item.kind,
    ...(item.kind === 'asset' ? { symbol: item.symbol, logo_url: item.logo_url } : {}),
    name: item.name,
    percent: roundedByIndex.get(item.index) ?? 0,
    less_than_one: item.exact < 0.5,
  }));
}
