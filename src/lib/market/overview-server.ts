import 'server-only';
import { finnhubProvider } from './finnhub';
import { getCachedCandles } from './cache';
import { getUsMarketStatus } from './hours';
import { filterCandlesToLatestSession } from './candles';
import { downsampleSeries, OVERVIEW_ETFS, type OverviewData, type OverviewItem } from './overview';
import { createSharedOverviewCache } from './overview-shared';
import { createOverviewStore } from './overview-store';

// Reuse chart data for 15 minutes instead of spending 3 credits each minute.
const charts = new Map<string, { series: OverviewItem['series']; range: OverviewItem['seriesRange']; expires: number }>();
async function loadChart(symbol: string) {
  const old = charts.get(symbol);
  if (old && old.expires > Date.now()) return old;
  let series: OverviewItem['series'] = []; let range: OverviewItem['seriesRange'] = null;
  try {
    series = downsampleSeries(filterCandlesToLatestSession(await getCachedCandles(symbol, '1D'), 'America/New_York'));
    if (series.length >= 2) range = '1D';
  } catch { /* Daily history is an honest fallback, never synthetic points. */ }
  if (series.length < 2) {
    try {
      series = downsampleSeries((await getCachedCandles(symbol, '1M')).slice(-30));
      if (series.length >= 2) range = '30D';
    } catch { /* Preserve prior chart if both sources fail. */ }
  }
  const value = { series: series.length >= 2 ? series : old?.series ?? [], range: range ?? old?.range ?? null,
    expires: Date.now() + 15 * 60_000 };
  charts.set(symbol, value);
  return value;
}
async function loadOverview(previous: OverviewData | null): Promise<OverviewData> {
  // Seed charts from the shared snapshot on cold instances, preserving the 15-minute reuse window.
  const shared = previous as (OverviewData & { chartsExpireAt?: number }) | null;
  if (shared?.chartsExpireAt && shared.chartsExpireAt > Date.now()) {
    for (const item of shared.items) charts.set(item.symbol, { series: item.series, range: item.seriesRange, expires: shared.chartsExpireAt });
  }
  // Existing Finnhub quote API is single-symbol, not a batch quote endpoint.
  const quotes = await Promise.all(OVERVIEW_ETFS.map((item) => finnhubProvider.getQuote(item.symbol)));
  if (quotes.some((quote) => !Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(quote.prevClose) || quote.prevClose <= 0)) throw new Error('Incomplete market overview quotes');
  const items = await Promise.all(OVERVIEW_ETFS.map(async (item, index): Promise<OverviewItem> => {
    const quote = quotes[index]; const chart = await loadChart(item.symbol);
    const change = quote.price - quote.prevClose;
    return { ...item, price: quote.price, previousClose: quote.prevClose, change, changePercent: change / quote.prevClose * 100,
      series: chart.series, seriesRange: chart.range, source: 'Finnhub · Twelve Data' };
  }));
  const timestamps = quotes.map((q) => q.providerUpdatedAt ? Date.parse(q.providerUpdatedAt) : Number.NaN);
  // Oldest contributing timestamp conservatively represents the whole snapshot.
  const asOf = timestamps.every(Number.isFinite) ? Math.min(...timestamps) : null;
  const result = { asOf, fetchedAt: Date.now(), session: getUsMarketStatus().phase,
    isDelayed: false, delayMinutes: null, mode: 'etf-proxy' as const, stale: false, refreshFailed: false, items,
    chartsExpireAt: Math.min(...OVERVIEW_ETFS.map((item) => charts.get(item.symbol)?.expires ?? Date.now())) };
  return result;
}
export const getMarketOverview = createSharedOverviewCache(createOverviewStore(), loadOverview, () => getUsMarketStatus().phase);
