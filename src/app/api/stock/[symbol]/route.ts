import { createAdminClient } from '@/lib/supabase/admin';
import { getCachedFundamentals, getCachedMarketStatus, getCachedQuote, refreshCachedQuote } from '@/lib/market/cache';
import { getAssetMetadata } from '@/lib/market/mockAssets';
import { calculatePeRatio } from '@/lib/portfolio/calc';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: { symbol: string } }) {
  const symbol = context.params.symbol.toUpperCase();
  try {
    const admin = createAdminClient();
    const { data: stock } = await admin.from('stocks').select('symbol, name, exchange, market, currency, logo_url').eq('symbol', symbol).single();
    if (!stock) return fail('NOT_FOUND', 'ไม่พบหุ้นนี้', 404);
    const marketStatus = await getCachedMarketStatus(stock.market ?? getAssetMetadata(symbol).market);
    const [quote, fundamentals] = await Promise.all([
      marketStatus.phase === 'closed' ? getCachedQuote(symbol) : refreshCachedQuote(symbol),
      getCachedFundamentals(symbol),
    ]);
    return ok({ stock, quote, fundamentals, pe_ratio: calculatePeRatio(quote.price, fundamentals.epsTtm), is_market_open: marketStatus.isOpen, market_status: marketStatus, server_now: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', Expires: '0' } });
  } catch (error) { return fail('STOCK_UNAVAILABLE', error instanceof Error ? error.message : 'ไม่สามารถโหลดข้อมูลหุ้นได้', 502); }
}
