import { finnhubProvider } from '@/lib/market/finnhub';
import { isCronAuthorized, fail, ok } from '@/lib/http';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return fail('UNAUTHORIZED', 'Invalid cron secret', 401);
  try {
    const symbols = await finnhubProvider.listSymbols('US');
    const admin = createAdminClient();
    for (let index = 0; index < symbols.length; index += 500) {
      const batch = symbols.slice(index, index + 500).map((item) => ({ symbol: item.symbol, name: item.name, exchange: item.exchange ?? null, market: 'US', currency: item.currency, is_active: true }));
      await admin.from('stocks').upsert(batch, { onConflict: 'symbol' });
    }
    return ok({ count: symbols.length });
  } catch (error) { return fail('SYNC_FAILED', error instanceof Error ? error.message : 'Symbol sync failed', 500); }
}
