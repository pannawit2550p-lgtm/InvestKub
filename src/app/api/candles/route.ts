import { getCachedCandles } from '@/lib/market/cache';
import { fail, ok } from '@/lib/http';
import { rangeSchema } from '@/lib/trade/schema';
import { getAssetMetadata } from '@/lib/market/mockAssets';
import { filterCandlesToLatestSession } from '@/lib/market/candles';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = (params.get('symbol') ?? '').toUpperCase();
  const range = rangeSchema.safeParse(params.get('range') ?? '1D');
  if (!symbol || !range.success) return fail('INVALID_INPUT', 'พารามิเตอร์กราฟไม่ถูกต้อง');
  try {
    const candles = await getCachedCandles(symbol, range.data);
    const timeZone = getAssetMetadata(symbol).market === 'TH' ? 'Asia/Bangkok' : 'America/New_York';
    const data = range.data === '1D' ? filterCandlesToLatestSession(candles, timeZone) : candles;
    return ok(data, { headers: { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', Expires: '0' } });
  } catch (error) { return fail('CANDLES_UNAVAILABLE', error instanceof Error ? error.message : 'ไม่สามารถโหลดกราฟได้', 502); }
}
