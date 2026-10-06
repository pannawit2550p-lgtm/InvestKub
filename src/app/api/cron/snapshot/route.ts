import { isCronAuthorized, fail, ok } from '@/lib/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCachedQuote } from '@/lib/market/cache';
import { calculatePortfolio, type HoldingInput } from '@/lib/portfolio/calc';

interface Profile { id: string; cash_balance: number; starting_balance: number; reward_balance: number; realized_pl: number; current_session_id: string; }
interface Holding { user_id: string; symbol: string; quantity: number; avg_cost: number; }

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return fail('UNAUTHORIZED', 'Invalid cron secret', 401);
  try {
    const admin = createAdminClient();
    const [{ data: profiles }, { data: holdings }, { data: stocks }] = await Promise.all([
      admin.from('profiles').select('id, cash_balance, starting_balance, reward_balance, realized_pl, current_session_id'),
      admin.from('holdings').select('user_id, symbol, quantity, avg_cost'),
      admin.from('stocks').select('symbol, name, logo_url'),
    ]);
    const holdingRows = (holdings ?? []) as Holding[];
    const stockMap = Object.fromEntries(((stocks ?? []) as Array<{ symbol: string; name: string; logo_url: string | null }>).map((stock) => [stock.symbol, stock]));
    const uniqueSymbols = [...new Set(holdingRows.map((holding) => holding.symbol))];
    const quoteEntries = await Promise.all(uniqueSymbols.map(async (symbol) => { try { return [symbol, await getCachedQuote(symbol)] as const; } catch { return null; } }));
    const quotes = Object.fromEntries(quoteEntries.filter((entry): entry is readonly [string, Awaited<ReturnType<typeof getCachedQuote>>] => entry !== null));
    const date = new Date().toISOString().slice(0, 10);
    for (const profile of (profiles ?? []) as Profile[]) {
      const userHoldings: HoldingInput[] = holdingRows.filter((holding) => holding.user_id === profile.id).map((holding) => ({ ...holding, quantity: Number(holding.quantity), avg_cost: Number(holding.avg_cost), name: stockMap[holding.symbol]?.name ?? holding.symbol, logo_url: stockMap[holding.symbol]?.logo_url }));
      const portfolio = calculatePortfolio(Number(profile.cash_balance), Number(profile.starting_balance) + Number(profile.reward_balance ?? 0), userHoldings, quotes, Number(profile.realized_pl));
      await admin.from('portfolio_snapshots').insert({ user_id: profile.id, portfolio_session_id: profile.current_session_id, snapshot_date: date, portfolio_value: portfolio.portfolioValue, total_pl_pct: portfolio.totalPlPct });
    }
    return ok({ count: (profiles ?? []).length, date });
  } catch (error) { return fail('SNAPSHOT_FAILED', error instanceof Error ? error.message : 'Snapshot failed', 500); }
}
