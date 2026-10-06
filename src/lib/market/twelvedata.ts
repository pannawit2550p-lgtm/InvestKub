import type { Candle, MarketProvider, Range } from './provider';
import { guardProviderCall, markProviderCooldown } from './provider-limit';
import { getAssetMetadata } from './mockAssets';
import { filterCandlesToLatestSession } from './candles';
import { parseExchangeDateTime } from '@/lib/time';

function getApiKey(): string {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new Error('TWELVEDATA_API_KEY is not configured');
  return key;
}

function rangeParams(range: Range): { interval: string; outputsize: number } {
  if (range === '1D') return { interval: '5min', outputsize: 78 };
  if (range === '5D') return { interval: '30min', outputsize: 260 };
  if (range === '1M') return { interval: '1day', outputsize: 30 };
  if (range === '6M') return { interval: '1day', outputsize: 130 };
  if (range === '5Y') return { interval: '1week', outputsize: 260 };
  return { interval: '1day', outputsize: 252 };
}

export const twelveDataProvider: MarketProvider = {
  async getQuote(symbol) { throw new Error(`Twelve Data quote not configured for ${symbol}`); },
  async getFundamentals(symbol) { throw new Error(`Twelve Data fundamentals not configured for ${symbol}`); },
  async getCandles(symbol, range): Promise<Candle[]> {
    const params = rangeParams(range);
    const market = getAssetMetadata(symbol).market;
    const timeZone = market === 'TH' ? 'Asia/Bangkok' : 'America/New_York';
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', params.interval);
    url.searchParams.set('outputsize', String(params.outputsize));
    url.searchParams.set('timezone', timeZone);
    url.searchParams.set('apikey', getApiKey());
    await guardProviderCall('twelvedata');
    let response: Response;
    try { response = await fetch(url, { next: { revalidate: 0 }, cache: 'no-store' }); }
    catch (error) { markProviderCooldown('twelvedata', 10_000); throw error; }
    if (!response.ok) {
      if (response.status === 429) markProviderCooldown('twelvedata', 60_000);
      else if (response.status >= 500) markProviderCooldown('twelvedata', 15_000);
      throw new Error(`Twelve Data request failed (${response.status})`);
    }
    const data = (await response.json()) as { status?: string; message?: string; meta?: { exchange_timezone?: string }; values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }> };
    if (!data.values) {
      if (/rate|credit|quota|limit/i.test(data.message ?? '')) markProviderCooldown('twelvedata', 60_000);
      throw new Error(data.message ?? `No candles returned for ${symbol}`);
    }
    const exchangeTimeZone = data.meta?.exchange_timezone || timeZone;
    const candles = data.values.map((item) => ({
      t: Math.floor(parseExchangeDateTime(item.datetime, exchangeTimeZone) / 1_000),
      o: Number(item.open), h: Number(item.high), l: Number(item.low), c: Number(item.close), v: Number(item.volume ?? 0),
    })).filter((candle) => Number.isFinite(candle.t)).sort((a, b) => a.t - b.t);
    return range === '1D' ? filterCandlesToLatestSession(candles, exchangeTimeZone) : candles;
  },
  async listSymbols(): Promise<never[]> { return []; },
};
