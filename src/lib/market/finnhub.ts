import type { Fundamentals, MarketProvider, Quote } from './provider';
import { guardProviderCall, markProviderCooldown } from './provider-limit';
import { timestampToMilliseconds } from '@/lib/time';

function getApiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error('FINNHUB_API_KEY is not configured');
  return key;
}

async function request<T>(path: string): Promise<T> {
  const url = new URL(`https://finnhub.io/api/v1${path}`);
  url.searchParams.set('token', getApiKey());
  await guardProviderCall('finnhub');
  let response: Response;
  try { response = await fetch(url, { next: { revalidate: 0 }, cache: 'no-store' }); }
  catch (error) { markProviderCooldown('finnhub', 10_000); throw error; }
  if (!response.ok) {
    if (response.status === 429) markProviderCooldown('finnhub', 60_000);
    else if (response.status >= 500) markProviderCooldown('finnhub', 15_000);
    throw new Error(`Finnhub request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

interface FinnhubQuote { c: number; d: number; dp: number; o: number; h: number; l: number; pc: number; t?: number; }
export interface FinnhubMarketStatus { exchange: string; timezone?: string; session?: 'pre-market' | 'regular' | 'post-market' | null; holiday?: string | null; isOpen?: boolean; t?: number; }
interface FinnhubMetric { epsTTM?: number; '52WeekHigh'?: number; '52WeekLow'?: number; dividendYieldIndicatedAnnual?: number; }
interface FinnhubProfile { marketCapitalization?: number; finnhubIndustry?: string; logo?: string; name?: string; exchange?: string; currency?: string; }
interface FinnhubSymbol { symbol: string; description: string; displaySymbol: string; exchange: string; type: string; currency?: string; }

export async function getCompanyProfile(symbol: string): Promise<{ name?: string; exchange?: string; currency?: string; logoUrl: string | null }> {
  const profile = await request<FinnhubProfile>(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`);
  const logo = profile.logo?.trim();
  let logoUrl: string | null = null;
  try {
    if (logo && new URL(logo).protocol === 'https:') logoUrl = logo;
  } catch { /* Ignore malformed provider image URLs. */ }
  return { name: profile.name?.trim() || undefined, exchange: profile.exchange?.trim() || undefined, currency: profile.currency?.trim() || undefined, logoUrl };
}

export async function getFinnhubMarketStatus(exchange = 'US'): Promise<FinnhubMarketStatus> {
  return request<FinnhubMarketStatus>(`/stock/market-status?exchange=${encodeURIComponent(exchange)}`);
}

export const finnhubProvider: MarketProvider = {
  async getQuote(symbol): Promise<Quote> {
    const data = await request<FinnhubQuote>(`/quote?symbol=${encodeURIComponent(symbol)}`);
    if (!data.c) throw new Error(`No quote returned for ${symbol}`);
    const providerTimestampRaw = data.t && Number.isFinite(data.t) && data.t > 0 ? data.t : undefined;
    const providerDate = providerTimestampRaw !== undefined ? new Date(timestampToMilliseconds(providerTimestampRaw, 'seconds')) : null;
    const providerUpdatedAt = providerDate && Number.isFinite(providerDate.getTime()) ? providerDate.toISOString() : undefined;
    const previousClose = data.pc;
    const change = data.c - previousClose;
    const changePct = previousClose > 0 ? change / previousClose * 100 : 0;
    return { symbol, price: data.c, prevClose: previousClose, change, changePct, open: data.o, high: data.h, low: data.l, updatedAt: new Date().toISOString(), providerUpdatedAt, providerTimestampRaw, providerTimestampUnit: providerTimestampRaw === undefined ? undefined : 'seconds' };
  },
  async getFundamentals(symbol): Promise<Fundamentals> {
    const [metric, profile] = await Promise.all([
      request<{ metric?: FinnhubMetric }>(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`),
      request<FinnhubProfile>(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`),
    ]);
    const m = metric.metric ?? {};
    return { symbol, marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1e6 : undefined, epsTtm: m.epsTTM, week52High: m['52WeekHigh'], week52Low: m['52WeekLow'], dividendYield: m.dividendYieldIndicatedAnnual, sector: profile.finnhubIndustry };
  },
  async getCandles(): Promise<never[]> {
    throw new Error('Finnhub is not used for candles in this MVP');
  },
  async listSymbols(market): Promise<{ symbol: string; name: string; exchange?: string; currency: string }[]> {
    const data = await request<FinnhubSymbol[]>(`/stock/symbol?exchange=${encodeURIComponent(market === 'US' ? 'US' : market)}`);
    return data.filter((item) => item.type === 'Common Stock' && item.symbol.length <= 8).map((item) => ({ symbol: item.symbol, name: item.description, exchange: item.exchange, currency: item.currency ?? 'USD' }));
  },
};
