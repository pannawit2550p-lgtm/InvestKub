import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ quote: vi.fn(), candles: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./finnhub', () => ({ finnhubProvider: { getQuote: mocks.quote } }));
vi.mock('./cache', () => ({ getCachedCandles: mocks.candles }));
vi.mock('./overview-store', () => ({ createOverviewStore: () => ({
  read: async () => null, acquire: async () => 'test-token', publish: async () => true, fail: async () => undefined,
}) }));
beforeEach(() => {
  vi.resetModules();
  mocks.quote.mockReset().mockImplementation(async (symbol: string) => ({ symbol, price: 102, prevClose: 100,
    change: 999, changePct: 999, updatedAt: new Date().toISOString(), providerUpdatedAt: '2026-10-05T20:00:00Z' }));
  mocks.candles.mockReset().mockResolvedValue([
    { t: 1791210600, c: 100 }, { t: 1791210900, c: 102 },
  ]);
});
describe('overview provider integration', () => {
  it('50 visitors share exactly one three-symbol quote/chart refresh', async () => {
    const { getMarketOverview } = await import('./overview-server');
    const results = await Promise.all(Array.from({ length: 50 }, () => getMarketOverview()));
    expect(mocks.quote).toHaveBeenCalledTimes(3);
    expect(mocks.candles).toHaveBeenCalledTimes(3);
    expect(mocks.quote.mock.calls.map((args) => args[0])).toEqual(['SPY', 'QQQ', 'DIA']);
    expect(results[0].items[0]).toMatchObject({ change: 2, changePercent: 2, seriesRange: '1D' });
    expect(results[0].asOf).toBe(Date.parse('2026-10-05T20:00:00Z'));
    expect(results[0].mode).toBe('etf-proxy');
  });
  it('falls back to the last 30 daily closes if intraday history is unavailable', async () => {
    mocks.candles.mockImplementation(async (_symbol: string, range: string) => {
      if (range === '1D') throw new Error('unsupported');
      return Array.from({ length: 50 }, (_, i) => ({ t: 1791210600 + i * 86400, c: i + 1 }));
    });
    const { getMarketOverview } = await import('./overview-server');
    const result = await getMarketOverview();
    expect(result.items.every((item) => item.seriesRange === '30D' && item.series.length === 30)).toBe(true);
    expect(result.items[0].series[0].v).toBe(21);
  });
  it('returns an empty graph without invented points if both history requests fail', async () => {
    mocks.candles.mockRejectedValue(new Error('429'));
    const { getMarketOverview } = await import('./overview-server');
    const result = await getMarketOverview();
    expect(result.items.every((item) => item.series.length === 0 && item.seriesRange === null)).toBe(true);
    expect(result.items[0].price).toBe(102);
  });
  it('does not substitute fetch time when provider time is missing', async () => {
    mocks.quote.mockResolvedValue({ price: 100, prevClose: 100, updatedAt: new Date().toISOString() });
    const { getMarketOverview } = await import('./overview-server');
    expect((await getMarketOverview()).asOf).toBeNull();
  });
});
