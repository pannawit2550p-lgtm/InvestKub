import { z } from 'zod';
import { getCachedMarketStatus, getCachedQuote, refreshCachedQuote } from '@/lib/market/cache';
import { getInstrument } from '@/lib/market/instrument';
import { fail, ok } from '@/lib/http';

const schema = z.object({ symbol: z.string().trim().min(1).max(10) });

export async function GET(request: Request) {
  const parsed = schema.safeParse({ symbol: new URL(request.url).searchParams.get('symbol') ?? '' });
  if (!parsed.success) return fail('INVALID_INPUT', 'กรุณาระบุสัญลักษณ์หุ้น');
  try {
    const symbol = parsed.data.symbol.toUpperCase();
    const instrument = getInstrument(symbol);
    const marketStatus = await getCachedMarketStatus(instrument.market);
    const forceFresh = new URL(request.url).searchParams.get('fresh') === '1';
    const quote = forceFresh || marketStatus.phase !== 'closed'
      ? await refreshCachedQuote(symbol)
      : await getCachedQuote(symbol);
    return ok({ ...quote, is_market_open: marketStatus.isOpen, market_status: marketStatus, market: instrument.market, asset_type: instrument.assetType, currency: instrument.currency, exchange: instrument.exchange, unit: instrument.unit, supports_limit: instrument.supportsLimit, simulated: instrument.simulated, server_now: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', Expires: '0' } });
  } catch (error) { return fail('QUOTE_UNAVAILABLE', error instanceof Error ? error.message : 'ไม่สามารถโหลดราคาได้', 502); }
}
