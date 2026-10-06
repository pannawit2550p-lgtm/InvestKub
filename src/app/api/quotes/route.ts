import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCachedListQuotes } from '@/lib/market/cache';
import { fail, ok } from '@/lib/http';

const schema = z.object({ symbols: z.string().min(1).transform((value) => [...new Set(value.split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))]).refine((symbols) => symbols.length <= 20, 'สูงสุด 20 สัญลักษณ์') });

export async function GET(request: Request) {
  const parsed = schema.safeParse({ symbols: new URL(request.url).searchParams.get('symbols') ?? '' });
  if (!parsed.success) return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'รายการหุ้นไม่ถูกต้อง');
  const [quotes, stockRows] = await Promise.all([
    getCachedListQuotes(parsed.data.symbols),
    (async () => {
      try {
        const admin = createAdminClient();
        const { data } = await admin.from('stocks').select('symbol, name, logo_url, currency').in('symbol', parsed.data.symbols);
        return data ?? [];
      } catch {
        // Quotes remain available even if optional display metadata cannot be read.
        return [];
      }
    })(),
  ]);
  const stocksBySymbol = new Map(stockRows.map((stock) => [stock.symbol, stock]));
  return ok(Object.fromEntries([...quotes].map(([symbol, quote]) => {
    const stock = stocksBySymbol.get(symbol);
    return [symbol, { ...quote, ...(stock ? { name: stock.name, logo_url: stock.logo_url, currency: stock.currency } : {}) }];
  })), { headers: { 'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=240' } });
}
