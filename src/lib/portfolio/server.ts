import { createAdminClient } from '@/lib/supabase/admin';
import { calculateDayPerformance, calculatePortfolio, type HoldingInput } from './calc';
import { getCachedQuotes } from '@/lib/market/cache';
import { startOfUsTradingDay } from '@/lib/market/hours';
import { getAssetMetadata } from '@/lib/market/mockAssets';
import { toAccountCurrency } from '@/lib/currency';
import type { Quote } from '@/lib/market/provider';

interface ProfileRow { id: string; display_name: string; currency: string; cash_balance: number; starting_balance: number; reward_balance?: number; realized_pl: number; current_session_id: string; session_started_at: string; }
interface HoldingRow { user_id: string; symbol: string; quantity: number; avg_cost: number; }
interface StockRecord { symbol: string; name: string; logo_url: string | null; currency?: string | null; }

export async function loadPortfolio(userId: string) {
  const admin = createAdminClient();
  const [profileResponse, holdingsResponse, snapshotsResponse, rewardsResponse] = await Promise.all([
    admin.from('profiles').select('*').eq('id', userId).single(),
    admin.from('holdings').select('*').eq('user_id', userId),
    admin.from('portfolio_snapshots').select('snapshot_at, snapshot_date, portfolio_value, portfolio_session_id').eq('user_id', userId).order('snapshot_at', { ascending: false }).limit(365),
    admin.from('lesson_progress').select('reward_claimed_at, reward_amount').eq('user_id', userId).not('reward_claimed_at', 'is', null),
  ]);
  if (profileResponse.error || !profileResponse.data) throw new Error('PROFILE_NOT_FOUND');
  const profile = profileResponse.data as ProfileRow;
  const holdingRows = (holdingsResponse.data ?? []) as HoldingRow[];
  const symbols = [...new Set(holdingRows.map((row) => row.symbol))];
  const stockResponse = symbols.length ? await admin.from('stocks').select('symbol, name, logo_url, currency').in('symbol', symbols) : { data: [], error: null };
  const stocks = (stockResponse.data ?? []) as StockRecord[];
  const stockBySymbol = Object.fromEntries(stocks.map((stock) => [stock.symbol, stock]));
  const cachedQuotes = await getCachedQuotes(symbols);
  const quotes: Record<string, Quote> = Object.fromEntries([...cachedQuotes].map(([symbol, quote]) => {
    const currency = stockBySymbol[symbol]?.currency ?? getAssetMetadata(symbol).currency;
    return [symbol, { ...quote, price: toAccountCurrency(quote.price, currency), prevClose: toAccountCurrency(quote.prevClose, currency), change: toAccountCurrency(quote.change, currency), open: quote.open === undefined ? undefined : toAccountCurrency(quote.open, currency), high: quote.high === undefined ? undefined : toAccountCurrency(quote.high, currency), low: quote.low === undefined ? undefined : toAccountCurrency(quote.low, currency) } as Quote];
  }));
  const holdingInputs: HoldingInput[] = holdingRows.map((row) => ({ symbol: row.symbol, name: stockBySymbol[row.symbol]?.name ?? row.symbol, logo_url: stockBySymbol[row.symbol]?.logo_url, quantity: Number(row.quantity), avg_cost: Number(row.avg_cost) }));
  const rewardBalance = Number(profile.reward_balance ?? 0);
  const investmentBase = Number(profile.starting_balance) + rewardBalance;
  const calculated = calculatePortfolio(Number(profile.cash_balance), investmentBase, holdingInputs, quotes, Number(profile.realized_pl));
  const rewardRows = (rewardsResponse.data ?? []) as Array<{ reward_claimed_at: string; reward_amount: number }>;
  const rewardsAt = (date: string) => rewardRows.reduce((sum, reward) => sum + (new Date(reward.reward_claimed_at) <= new Date(date) ? Number(reward.reward_amount ?? 0) : 0), 0);
  const start = startOfUsTradingDay();
  const snapshotRows = (snapshotsResponse.data ?? []) as Array<{ snapshot_at: string; snapshot_date: string; portfolio_session_id: string; portfolio_value: number }>;
  const dayStartSnapshot = snapshotRows.find((snapshot) => snapshot.portfolio_session_id === profile.current_session_id && new Date(snapshot.snapshot_at) <= start);
  const day = calculateDayPerformance(calculated.portfolioValue - rewardBalance, dayStartSnapshot ? Number(dayStartSnapshot.portfolio_value) - rewardsAt(dayStartSnapshot.snapshot_at) : null);
  const history = snapshotRows.filter((snapshot) => snapshot.portfolio_session_id === profile.current_session_id).map((snapshot) => ({ date: snapshot.snapshot_date, portfolio_value: Number(snapshot.portfolio_value) - rewardsAt(snapshot.snapshot_at) }));
  return {
    cash_balance: Number(profile.cash_balance),
    starting_balance: Number(profile.starting_balance),
    reward_balance: rewardBalance,
    investment_base: investmentBase,
    holdings_value: calculated.holdingsValue,
    portfolio_value: calculated.portfolioValue,
    total_pl: calculated.totalPl,
    total_pl_pct: calculated.totalPlPct,
    day_pl_total: day.dayPlTotal,
    day_pl_pct: day.dayPlPct,
    realized_pl: calculated.realizedPl,
    display_name: profile.display_name,
    session_started_at: profile.session_started_at,
    holdings: calculated.holdings,
    history,
  };
}

export async function createPortfolioSnapshot(userId: string) {
  const admin = createAdminClient();
  const portfolio = await loadPortfolio(userId);
  const { data: profile } = await admin.from('profiles').select('current_session_id').eq('id', userId).single();
  if (!profile) return;
  await admin.from('portfolio_snapshots').insert({ user_id: userId, portfolio_session_id: profile.current_session_id, snapshot_date: new Date().toISOString().slice(0, 10), portfolio_value: portfolio.portfolio_value, total_pl_pct: portfolio.total_pl_pct });
}
