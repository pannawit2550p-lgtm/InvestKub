import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  batchRead: vi.fn(),
  singleRead: vi.fn(),
  upsert: vi.fn(),
  getQuote: vi.fn(),
  enqueue: vi.fn(),
  lock: vi.fn(),
  release: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: mocks.batchRead,
        eq: (_column: string, symbol: string) => ({ maybeSingle: () => mocks.singleRead(symbol) }),
      }),
      upsert: mocks.upsert,
    }),
  }),
}));
vi.mock('./hours', () => ({ getMarketStatus: () => ({ phase: 'open' }) }));
vi.mock('./mockAssets', () => ({ getMockQuote: () => undefined, getAssetMetadata: () => ({ market: 'US' }) }));
vi.mock('./finnhub', () => ({ finnhubProvider: { getQuote: mocks.getQuote }, getFinnhubMarketStatus: vi.fn() }));
vi.mock('./twelvedata', () => ({ twelveDataProvider: {} }));
vi.mock('./refresh-queue', () => ({
  enqueueMarketDataRefresh: mocks.enqueue,
  tryAcquireMarketDataLock: mocks.lock,
  releaseMarketDataLock: mocks.release,
}));

function quoteRow(symbol: string, ageMs = 0) {
  const timestamp = new Date(Date.now() - ageMs).toISOString();
  return { symbol, price: 120, prev_close: 100, change: 20, change_pct: 20,
    open: null, high: null, low: null, volume: null, updated_at: timestamp, provider_updated_at: timestamp };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T15:00:00Z'));
  mocks.rows.clear();
  mocks.batchRead.mockReset().mockImplementation(async (_column: string, symbols: string[]) => ({
    data: symbols.flatMap((symbol) => mocks.rows.has(symbol) ? [mocks.rows.get(symbol)] : []), error: null,
  }));
  mocks.singleRead.mockReset().mockImplementation(async (symbol: string) => ({ data: mocks.rows.get(symbol) ?? null, error: null }));
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.getQuote.mockReset().mockImplementation(async (symbol: string) => ({
    symbol, price: 125, prevClose: 100, change: 25, changePct: 25,
    updatedAt: new Date().toISOString(), providerUpdatedAt: new Date().toISOString(),
  }));
  mocks.enqueue.mockReset().mockResolvedValue(true);
  mocks.lock.mockReset().mockResolvedValue(true);
  mocks.release.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

describe('batch quote cache', () => {
  it('reads at most 20 symbols per batch and shares memory with single-symbol requests', async () => {
    const symbols = Array.from({ length: 21 }, (_, index) => `STOCK${index}`);
    for (const symbol of symbols) mocks.rows.set(symbol, quoteRow(symbol));
    const { getCachedQuotes, getCachedQuote } = await import('./cache');
    const quotes = await getCachedQuotes([...symbols, symbols[0]]);
    expect(quotes.size).toBe(21);
    expect(mocks.batchRead).toHaveBeenCalledTimes(2);
    expect(mocks.batchRead.mock.calls.map((call) => call[1].length)).toEqual([20, 1]);
    expect(mocks.singleRead).not.toHaveBeenCalled();
    expect(mocks.getQuote).not.toHaveBeenCalled();
    expect((await getCachedQuote(symbols[0])).price).toBe(120);
    expect((await getCachedQuotes(symbols)).size).toBe(21);
    expect(mocks.batchRead).toHaveBeenCalledTimes(2);
  });

  it('keeps live quote freshness separate from the five-minute browse snapshot', async () => {
    mocks.rows.set('AAPL', quoteRow('AAPL', 30_000));
    const { getCachedQuotes, getCachedListQuotes } = await import('./cache');
    expect((await getCachedQuotes(['AAPL'])).get('AAPL')?.stale).toBe(true);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect((await getCachedListQuotes(['AAPL'])).get('AAPL')?.stale).toBe(false);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.getQuote).not.toHaveBeenCalled();
  });

  it('coalesces a concurrent single-symbol request with its batch', async () => {
    const row = quoteRow('AAPL');
    let resolveRead!: (value: { data: typeof row[]; error: null }) => void;
    mocks.batchRead.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    const { getCachedQuotes, getCachedQuote } = await import('./cache');
    const batch = getCachedQuotes(['AAPL']);
    const single = getCachedQuote('AAPL');
    resolveRead({ data: [row], error: null });
    const [quotes, quote] = await Promise.all([batch, single]);
    expect(quotes.get('AAPL')).toEqual(quote);
    expect(mocks.batchRead).toHaveBeenCalledTimes(1);
    expect(mocks.singleRead).not.toHaveBeenCalled();
  });

  it('refreshes missing quotes without re-reading the row, and isolates provider failures', async () => {
    mocks.rows.set('AAPL', quoteRow('AAPL'));
    mocks.getQuote.mockImplementation(async (symbol: string) => {
      if (symbol === 'BAD') throw new Error('Provider unavailable');
      return { symbol, price: 125, prevClose: 100, change: 25, changePct: 25, updatedAt: new Date().toISOString() };
    });
    const { getCachedQuotes } = await import('./cache');
    const quotes = await getCachedQuotes(['AAPL', 'MSFT', 'BAD']);
    expect(quotes.get('AAPL')?.price).toBe(120);
    expect(quotes.get('MSFT')?.price).toBe(125);
    expect(quotes.has('BAD')).toBe(false);
    expect(mocks.singleRead).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it('falls back to per-symbol reads if the batch query fails', async () => {
    mocks.rows.set('AAPL', quoteRow('AAPL'));
    mocks.batchRead.mockResolvedValue({ data: null, error: { message: 'Batch unavailable' } });
    const { getCachedQuotes } = await import('./cache');
    expect((await getCachedQuotes(['AAPL'])).get('AAPL')?.price).toBe(120);
    expect(mocks.singleRead).toHaveBeenCalledWith('AAPL');
    expect(mocks.getQuote).not.toHaveBeenCalled();
  });
});
