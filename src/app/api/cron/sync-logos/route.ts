import { getCompanyProfile } from '@/lib/market/finnhub';
import { isCronAuthorized, fail, ok } from '@/lib/http';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_BATCH_SIZE = 20;
const CONCURRENCY = 4;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return fail('UNAUTHORIZED', 'Invalid cron secret', 401);

  const params = new URL(request.url).searchParams;
  const requestedSymbols = params.get('symbols');
  const symbols = requestedSymbols
    ? [...new Set(requestedSymbols.split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))]
    : null;

  if (symbols && (symbols.length > MAX_BATCH_SIZE || symbols.some((symbol) => !/^[A-Z0-9.-]{1,12}$/.test(symbol)))) {
    return fail('INVALID_INPUT', `ส่งสัญลักษณ์ได้ไม่เกิน ${MAX_BATCH_SIZE} ตัวต่อครั้ง`);
  }

  try {
    const admin = createAdminClient();
    let query = admin.from('stocks').select('symbol, logo_url').eq('market', 'US').order('symbol').limit(MAX_BATCH_SIZE);
    if (symbols) query = query.in('symbol', symbols);
    else query = query.is('logo_url', null);

    const { data: stocks, error } = await query;
    if (error) throw error;

    const stocksBySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));
    const candidateSymbols = symbols
      ? symbols.filter((symbol) => !stocksBySymbol.get(symbol)?.logo_url)
      : stocks.map((stock) => stock.symbol);
    const updates: Array<{ symbol: string; name?: string; exchange?: string; currency?: string; logo_url: string }> = [];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, candidateSymbols.length) }, async () => {
      while (cursor < candidateSymbols.length) {
        const symbol = candidateSymbols[cursor++];
        try {
          const profile = await getCompanyProfile(symbol);
          if (profile.logoUrl) updates.push({ symbol, name: profile.name, exchange: profile.exchange, currency: profile.currency, logo_url: profile.logoUrl });
        } catch {
          // Skip transient/provider errors; the next scheduled batch can retry.
        }
      }
    });
    await Promise.all(workers);

    const saved = await Promise.all(updates.map(async ({ symbol, name, exchange, currency, logo_url }) => {
      const existing = stocksBySymbol.get(symbol);
      const result = existing
        ? await admin.from('stocks').update({ logo_url }).eq('symbol', symbol)
        : await admin.from('stocks').upsert({ symbol, name: name ?? symbol, exchange: exchange ?? null, market: 'US', currency: currency ?? 'USD', logo_url, is_active: true }, { onConflict: 'symbol' });
      const { error: updateError } = result;
      return updateError ? null : symbol;
    }));

    return ok({ scanned: candidateSymbols.length, updated: saved.filter(Boolean).length, symbols: saved.filter((symbol): symbol is string => Boolean(symbol)) });
  } catch (error) {
    return fail('LOGO_SYNC_FAILED', error instanceof Error ? error.message : 'Logo sync failed', 500);
  }
}
