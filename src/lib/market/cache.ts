import { createAdminClient } from '@/lib/supabase/admin';
import { getMarketStatus, type MarketStatus } from './hours';
import { finnhubProvider, getFinnhubMarketStatus } from './finnhub';
import { twelveDataProvider } from './twelvedata';
import { getAssetMetadata, getMockQuote } from './mockAssets';
import { enqueueMarketDataRefresh, releaseMarketDataLock, tryAcquireMarketDataLock, type RefreshJob } from './refresh-queue';
import type { Candle, Fundamentals, Quote, Range } from './provider';

type CachedQuote = Quote & { stale?: boolean; refreshFailed?: boolean };
type QuoteRow = { symbol: string; price: number; prev_close: number; change: number; change_pct: number; open: number | null; high: number | null; low: number | null; volume: number | null; updated_at: string; provider_updated_at?: string | null };
type FundamentalsRow = { symbol: string; market_cap: number | null; eps_ttm: number | null; week52_high: number | null; week52_low: number | null; dividend_yield: number | null; sector: string | null; updated_at: string };

const inFlight = new Map<string, Promise<unknown>>();
const memoryCache = new Map<string, { value: unknown; expiresAt: number }>();
const marketStatusMemory = new Map<string, { value: MarketStatus; expiresAt: number }>();
const MAX_MEMORY_ENTRIES = 500;
const STALE_MEMORY_TTL_MS = 5_000;
const LIST_QUOTE_TTL_MS = 5 * 60_000;
const STALE_LIST_QUOTE_MEMORY_TTL_MS = 30_000;
const QUOTE_BATCH_SIZE = 20;

function readMemoryCache<T>(key: string): T | undefined {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function writeMemoryCache<T>(key: string, value: T, ttlMs: number): void {
  if (memoryCache.size >= MAX_MEMORY_ENTRIES && !memoryCache.has(key)) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function shouldUseCache(updatedAt: string, ttlMs: number): boolean {
  return Date.now() - new Date(updatedAt).getTime() < ttlMs;
}

function remainingTtl(updatedAt: string, ttlMs: number): number {
  return Math.max(0, ttlMs - (Date.now() - new Date(updatedAt).getTime()));
}

function quoteTtlMs(symbol: string, date = new Date()) {
  const phase = getMarketStatus(getAssetMetadata(symbol).market, date).phase;
  return phase === 'closed' ? 5 * 60_000 : 15_000;
}

function candleTtlMs(range: Range) {
  return range === '1D' ? 60_000 : range === '5D' ? 600_000 : 21_600_000;
}

function rowToQuote(row: QuoteRow): CachedQuote {
  const providerUpdatedAt = row.provider_updated_at ?? undefined;
  const providerTimestampRaw = providerUpdatedAt ? Math.floor(Date.parse(providerUpdatedAt) / 1_000) : undefined;
  return { symbol: row.symbol, price: Number(row.price), prevClose: Number(row.prev_close), change: Number(row.price) - Number(row.prev_close), changePct: Number(row.prev_close) > 0 ? (Number(row.price) - Number(row.prev_close)) / Number(row.prev_close) * 100 : 0, open: row.open ?? undefined, high: row.high ?? undefined, low: row.low ?? undefined, volume: row.volume ?? undefined, updatedAt: row.updated_at, providerUpdatedAt, providerTimestampRaw, providerTimestampUnit: providerTimestampRaw === undefined ? undefined : 'seconds' };
}

function withFreshness(quote: CachedQuote, symbol: string): CachedQuote {
  const providerTime = quote.providerUpdatedAt ? Date.parse(quote.providerUpdatedAt) : Date.parse(quote.updatedAt);
  const providerAge = Number.isFinite(providerTime) ? Date.now() - providerTime : Number.POSITIVE_INFINITY;
  const duringRegularSession = getMarketStatus(getAssetMetadata(symbol).market).phase === 'open';
  const providerIsStale = duringRegularSession && providerAge > 20 * 60_000;
  return { ...quote, stale: quote.stale === true || providerIsStale };
}

function rowToFundamentals(row: FundamentalsRow): Fundamentals {
  return { symbol: row.symbol, marketCap: row.market_cap ?? undefined, epsTtm: row.eps_ttm ?? undefined, week52High: row.week52_high ?? undefined, week52Low: row.week52_low ?? undefined, dividendYield: row.dividend_yield ?? undefined, sector: row.sector ?? undefined };
}

async function enqueue(admin: ReturnType<typeof createAdminClient>, kind: 'quote' | 'fundamentals' | 'candles', symbol: string, range: Range | '' = '') {
  try { return await enqueueMarketDataRefresh(admin, kind, symbol, range); }
  catch { return false; }
}

async function readQuoteRow(symbol: string) {
  const admin = createAdminClient();
  const { data } = await admin.from('quotes_cache').select('*').eq('symbol', symbol).maybeSingle();
  return data as QuoteRow | null;
}

async function readAfterConcurrentQuoteRefresh(symbol: string, previousUpdatedAt?: string, ttlMs = quoteTtlMs(symbol)): Promise<CachedQuote | null> {
  for (const delay of [100, 200, 350, 500]) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const row = await readQuoteRow(symbol);
    if (row) {
      if (previousUpdatedAt && row.updated_at === previousUpdatedAt) continue;
      const quote = rowToQuote(row);
      return shouldUseCache(row.updated_at, ttlMs) ? withFreshness(quote, symbol) : { ...withFreshness(quote, symbol), stale: true };
    }
  }
  return null;
}

export async function getCachedQuote(symbol: string): Promise<CachedQuote> {
  if (getMockQuote(symbol)) return loadQuote(symbol);

  const key = `quote:${symbol}`;
  const cached = readMemoryCache<CachedQuote>(key);
  if (cached) return withFreshness(cached, symbol);
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<CachedQuote>;
  const promise = loadQuote(symbol).then((loaded) => {
    const quote = withFreshness(loaded, symbol);
    const ttl = quote.stale ? STALE_MEMORY_TTL_MS : remainingTtl(quote.updatedAt, quoteTtlMs(symbol));
    if (ttl > 0) writeMemoryCache(key, quote, ttl);
    return quote;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

/** A slower-moving snapshot for browse/list views; detail and order flows use the live quote cache. */
export async function getCachedListQuote(symbol: string): Promise<CachedQuote> {
  const quotes = await getCachedListQuotes([symbol]);
  const quote = quotes.get(symbol);
  if (!quote) throw new Error(`Quote unavailable for ${symbol}`);
  return quote;
}

/** Uses the same quote freshness policy and in-flight requests as the single-symbol cache. */
export async function getCachedQuotes(symbols: string[]): Promise<Map<string, CachedQuote>> {
  return getCachedQuotesBatch(symbols, 'live');
}

/** Reads list-view quote snapshots in batches of at most 20 symbols. */
export async function getCachedListQuotes(symbols: string[]): Promise<Map<string, CachedQuote>> {
  return getCachedQuotesBatch(symbols, 'list');
}

async function getCachedQuotesBatch(symbols: string[], mode: 'live' | 'list'): Promise<Map<string, CachedQuote>> {
  const quotes = new Map<string, CachedQuote>();
  const pending = new Map<string, Promise<CachedQuote>>();
  const toBatch: string[] = [];
  const cacheKey = (symbol: string) => mode === 'list' ? `quote:list:${symbol}` : `quote:${symbol}`;
  const cacheTtl = (symbol: string) => mode === 'list' ? LIST_QUOTE_TTL_MS : quoteTtlMs(symbol);
  const staleMemoryTtl = mode === 'list' ? STALE_LIST_QUOTE_MEMORY_TTL_MS : STALE_MEMORY_TTL_MS;

  for (const symbol of [...new Set(symbols)]) {
    if (getMockQuote(symbol)) {
      pending.set(symbol, loadQuote(symbol));
      continue;
    }

    const key = cacheKey(symbol);
    const cached = readMemoryCache<CachedQuote>(key);
    if (cached) {
      pending.set(symbol, Promise.resolve(withFreshness(cached, symbol)));
      continue;
    }

    const existing = inFlight.get(key) as Promise<CachedQuote> | undefined;
    if (existing) {
      pending.set(symbol, existing);
      continue;
    }
    toBatch.push(symbol);
  }

  if (toBatch.length > 0) {
    const batchPromise = (async () => {
      let rowsBySymbol: Map<string, QuoteRow> | null = null;
      try {
        const admin = createAdminClient();
        const batches = Array.from({ length: Math.ceil(toBatch.length / QUOTE_BATCH_SIZE) }, (_, index) =>
          toBatch.slice(index * QUOTE_BATCH_SIZE, (index + 1) * QUOTE_BATCH_SIZE));
        const responses = await Promise.all(batches.map((batch) => admin.from('quotes_cache').select('*').in('symbol', batch)));
        if (responses.every((response) => !response.error)) {
          const rows = responses.flatMap((response) => (response.data ?? []) as QuoteRow[]);
          rowsBySymbol = new Map(rows.map((row) => [row.symbol, row]));
        }
      } catch {
        // Fall back to the regular per-symbol cache path if batch reads are unavailable.
      }

      const loaded = new Map<string, CachedQuote>();
      let cursor = 0;
      const workers = Array.from({ length: Math.min(5, toBatch.length) }, async () => {
        while (cursor < toBatch.length) {
          const symbol = toBatch[cursor++];
          try {
            const row = rowsBySymbol?.get(symbol);
            const ttlMs = cacheTtl(symbol);
            const quote = await loadQuote(symbol, false, ttlMs, rowsBySymbol ? row ?? null : undefined);
            const freshQuote = withFreshness(quote, symbol);
            const ttl = freshQuote.stale ? staleMemoryTtl : remainingTtl(freshQuote.updatedAt, ttlMs);
            if (ttl > 0) writeMemoryCache(cacheKey(symbol), freshQuote, ttl);
            loaded.set(symbol, freshQuote);
          } catch {
            // Keep other symbols available when a single symbol/provider request fails.
          }
        }
      });
      await Promise.all(workers);
      return loaded;
    })();

    for (const symbol of toBatch) {
      const key = cacheKey(symbol);
      let symbolPromise: Promise<CachedQuote>;
      symbolPromise = batchPromise.then((loaded) => {
        const quote = loaded.get(symbol);
        if (!quote) throw new Error(`Quote unavailable for ${symbol}`);
        return quote;
      }).finally(() => {
        if (inFlight.get(key) === symbolPromise) inFlight.delete(key);
      });
      inFlight.set(key, symbolPromise);
      pending.set(symbol, symbolPromise);
    }
  }

  await Promise.all([...pending].map(async ([symbol, promise]) => {
    try { quotes.set(symbol, await promise); } catch { /* omit unavailable symbols */ }
  }));
  return quotes;
}

export async function getCachedMarketStatus(market: string, date = new Date()): Promise<MarketStatus> {
  const fallback = getMarketStatus(market, date);
  if (market !== 'US') return fallback;
  const cached = marketStatusMemory.get(market);
  if (cached && cached.expiresAt > Date.now()) return { ...fallback, ...cached.value, nextOpenAt: cached.value.phase === 'open' ? null : fallback.nextOpenAt, marketDate: fallback.marketDate };
  const requestKey = `market-status:${market}`;
  const existing = inFlight.get(requestKey) as Promise<MarketStatus> | undefined;
  if (existing) return existing;
  const promise = (async () => {
    try {
      const response = await getFinnhubMarketStatus(market);
      const phase = response.holiday ? 'closed'
        : response.session === 'pre-market' ? 'pre'
          : response.session === 'post-market' ? fallback.earlyClose ? 'closed' : 'post'
            : response.session === 'regular' && response.isOpen !== false ? 'open'
              : response.session === 'regular' ? 'closed' : fallback.phase;
      const labels: Record<MarketStatus['phase'], string> = { pre: 'ก่อนตลาดเปิด', open: 'เปิดอยู่', post: 'หลังตลาดปิด', closed: 'ปิดอยู่' };
      const status: MarketStatus = {
        ...fallback,
        phase,
        label: labels[phase],
        isOpen: phase === 'open',
        isHoliday: Boolean(response.holiday) || fallback.isHoliday,
        nextOpenAt: phase === 'open' ? null : fallback.nextOpenAt,
      };
      marketStatusMemory.set(market, { value: status, expiresAt: Date.now() + 30_000 });
      return status;
    } catch {
      return fallback;
    } finally {
      inFlight.delete(requestKey);
    }
  })();
  inFlight.set(requestKey, promise);
  return promise;
}

export async function refreshCachedQuote(symbol: string): Promise<CachedQuote> {
  if (getMockQuote(symbol)) return loadQuote(symbol);
  const key = `quote:${symbol}`;
  const recentMemoryQuote = readMemoryCache<CachedQuote>(key);
  if (recentMemoryQuote && Date.now() - Date.parse(recentMemoryQuote.updatedAt) < 10_000) return withFreshness(recentMemoryQuote, symbol);
  const existing = inFlight.get(key);
  if (existing) {
    const concurrent = await existing as CachedQuote;
    if (Date.now() - Date.parse(concurrent.updatedAt) < 10_000 && !concurrent.stale) return concurrent;
  }
  const recentRow = await readQuoteRow(symbol);
  if (recentRow && Date.now() - Date.parse(recentRow.updated_at) < 10_000) {
    const quote = withFreshness(rowToQuote(recentRow), symbol);
    writeMemoryCache(key, quote, 10_000 - (Date.now() - Date.parse(recentRow.updated_at)));
    return quote;
  }
  const promise = loadQuote(symbol, true).then((loaded) => {
    const quote = withFreshness(loaded, symbol);
    writeMemoryCache(key, quote, quote.stale ? STALE_MEMORY_TTL_MS : Math.min(10_000, remainingTtl(quote.updatedAt, quoteTtlMs(symbol))));
    return quote;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function loadQuote(symbol: string, forceRefresh = false, ttlOverrideMs?: number, prefetchedRow?: QuoteRow | null): Promise<CachedQuote> {
  const simulatedQuote = getMockQuote(symbol);
  if (simulatedQuote) return simulatedQuote;
  const admin = createAdminClient();
  let row = prefetchedRow;
  if (prefetchedRow === undefined) {
    const { data } = await admin.from('quotes_cache').select('*').eq('symbol', symbol).maybeSingle();
    row = data as QuoteRow | null;
  }
  const ttl = ttlOverrideMs ?? quoteTtlMs(symbol);
  if (!forceRefresh && row && shouldUseCache(row.updated_at, ttl)) return withFreshness(rowToQuote(row), symbol);

  if (!forceRefresh && row && await enqueue(admin, 'quote', symbol)) return { ...withFreshness(rowToQuote(row), symbol), stale: true };

  const lockKey = `quote:${symbol}`;
  const lock = await tryAcquireMarketDataLock(admin, lockKey);
  if (lock === false) {
    await enqueue(admin, 'quote', symbol);
    const previousUpdatedAt = row?.updated_at;
    const concurrentQuote = await readAfterConcurrentQuoteRefresh(symbol, previousUpdatedAt, ttl);
    if (concurrentQuote && (!forceRefresh || concurrentQuote.updatedAt !== previousUpdatedAt)) return withFreshness(concurrentQuote, symbol);
    if (forceRefresh) throw new Error('Quote refresh is already running; retry shortly');
    throw new Error('Market data refresh is in progress; retry shortly');
  }

  try {
    const quote = await finnhubProvider.getQuote(symbol);
    const { error } = await admin.from('quotes_cache').upsert({ symbol, price: quote.price, prev_close: quote.prevClose, change: quote.change, change_pct: quote.changePct, open: quote.open ?? null, high: quote.high ?? null, low: quote.low ?? null, volume: quote.volume ?? null, updated_at: quote.updatedAt, provider_updated_at: quote.providerUpdatedAt ?? null });
    if (error) throw new Error('Quote cache write failed');
    return withFreshness(quote, symbol);
  } catch (error) {
    await enqueue(admin, 'quote', symbol);
    if (row) return { ...withFreshness(rowToQuote(row), symbol), stale: true, refreshFailed: true };
    throw error;
  } finally {
    if (lock === true) await releaseMarketDataLock(admin, lockKey);
  }
}

export async function getCachedFundamentals(symbol: string): Promise<Fundamentals> {
  const key = `fundamentals:${symbol}`;
  const cached = readMemoryCache<Fundamentals>(key);
  if (cached) return cached;
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<Fundamentals>;
  const promise = loadFundamentals(symbol).then(({ fundamentals, ttlMs }) => {
    if (ttlMs > 0) writeMemoryCache(key, fundamentals, ttlMs);
    return fundamentals;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function loadFundamentals(symbol: string): Promise<{ fundamentals: Fundamentals; ttlMs: number }> {
  const admin = createAdminClient();
  const { data } = await admin.from('fundamentals_cache').select('*').eq('symbol', symbol).maybeSingle();
  const row = data as FundamentalsRow | null;
  const ttl = 86_400_000;
  if (row && shouldUseCache(row.updated_at, ttl)) return { fundamentals: rowToFundamentals(row), ttlMs: remainingTtl(row.updated_at, ttl) };

  if (row && await enqueue(admin, 'fundamentals', symbol)) {
    return { fundamentals: rowToFundamentals(row), ttlMs: STALE_MEMORY_TTL_MS };
  }

  const lockKey = `fundamentals:${symbol}`;
  const lock = await tryAcquireMarketDataLock(admin, lockKey);
  if (lock === false) {
    await enqueue(admin, 'fundamentals', symbol);
    if (row) return { fundamentals: rowToFundamentals(row), ttlMs: STALE_MEMORY_TTL_MS };
    throw new Error('Market data refresh is in progress; retry shortly');
  }

  try {
    const fundamentals = await finnhubProvider.getFundamentals(symbol);
    const { error } = await admin.from('fundamentals_cache').upsert({ symbol, market_cap: fundamentals.marketCap ?? null, eps_ttm: fundamentals.epsTtm ?? null, week52_high: fundamentals.week52High ?? null, week52_low: fundamentals.week52Low ?? null, dividend_yield: fundamentals.dividendYield ?? null, sector: fundamentals.sector ?? null, updated_at: new Date().toISOString() });
    if (error) throw new Error('Fundamentals cache write failed');
    return { fundamentals, ttlMs: ttl };
  } catch (error) {
    await enqueue(admin, 'fundamentals', symbol);
    if (row) return { fundamentals: rowToFundamentals(row), ttlMs: STALE_MEMORY_TTL_MS };
    throw error;
  } finally {
    if (lock === true) await releaseMarketDataLock(admin, lockKey);
  }
}

export async function getCachedCandles(symbol: string, range: Range): Promise<Candle[]> {
  const key = `candles:${symbol}:${range}`;
  const cached = readMemoryCache<Candle[]>(key);
  if (cached) return cached;
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<Candle[]>;
  const promise = loadCandles(symbol, range).then(({ candles, ttlMs }) => {
    if (ttlMs > 0) writeMemoryCache(key, candles, ttlMs);
    return candles;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function loadCandles(symbol: string, range: Range): Promise<{ candles: Candle[]; ttlMs: number }> {
  const admin = createAdminClient();
  const { data } = await admin.from('candles_cache').select('*').eq('symbol', symbol).eq('range', range).maybeSingle();
  const row = data as { data: Candle[]; updated_at: string } | null;
  const ttl = candleTtlMs(range);
  if (row && shouldUseCache(row.updated_at, ttl)) return { candles: row.data, ttlMs: remainingTtl(row.updated_at, ttl) };

  // Keep the 1D chart anchored to the latest intraday session. For expired 1D
  // data, refresh inline instead of serving yesterday's bars while waiting for cron.
  if (row && range !== '1D' && await enqueue(admin, 'candles', symbol, range)) return { candles: row.data, ttlMs: STALE_MEMORY_TTL_MS };

  const lockKey = `candles:${symbol}:${range}`;
  const lock = await tryAcquireMarketDataLock(admin, lockKey);
  if (lock === false) {
    await enqueue(admin, 'candles', symbol, range);
    if (row) return { candles: row.data, ttlMs: STALE_MEMORY_TTL_MS };
    throw new Error('Market data refresh is in progress; retry shortly');
  }

  try {
    const candles = await twelveDataProvider.getCandles(symbol, range);
    const { error } = await admin.from('candles_cache').upsert({ symbol, range, data: candles, updated_at: new Date().toISOString() });
    if (error) {
      console.error('[candles_cache] upsert failed', { symbol, range, code: error.code, message: error.message });
      throw new Error('Candles cache write failed');
    }
    return { candles, ttlMs: ttl };
  } catch (error) {
    await enqueue(admin, 'candles', symbol, range);
    if (row) return { candles: row.data, ttlMs: STALE_MEMORY_TTL_MS };
    throw error;
  } finally {
    if (lock === true) await releaseMarketDataLock(admin, lockKey);
  }
}

export async function refreshQueuedMarketData(admin: ReturnType<typeof createAdminClient>, job: RefreshJob) {
  const lockKey = job.data_type === 'candles' ? `candles:${job.symbol}:${job.data_range}` : `${job.data_type}:${job.symbol}`;
  const lock = await tryAcquireMarketDataLock(admin, lockKey, 120);
  if (lock === false) throw new Error('REFRESH_ALREADY_RUNNING');

  try {
    if (job.data_type === 'quote') {
      const quote = await finnhubProvider.getQuote(job.symbol);
      const { error } = await admin.from('quotes_cache').upsert({ symbol: job.symbol, price: quote.price, prev_close: quote.prevClose, change: quote.change, change_pct: quote.changePct, open: quote.open ?? null, high: quote.high ?? null, low: quote.low ?? null, volume: quote.volume ?? null, updated_at: quote.updatedAt, provider_updated_at: quote.providerUpdatedAt ?? null });
      if (error) throw new Error('CACHE_WRITE_FAILED');
      return;
    }
    if (job.data_type === 'fundamentals') {
      const fundamentals = await finnhubProvider.getFundamentals(job.symbol);
      const { error } = await admin.from('fundamentals_cache').upsert({ symbol: job.symbol, market_cap: fundamentals.marketCap ?? null, eps_ttm: fundamentals.epsTtm ?? null, week52_high: fundamentals.week52High ?? null, week52_low: fundamentals.week52Low ?? null, dividend_yield: fundamentals.dividendYield ?? null, sector: fundamentals.sector ?? null, updated_at: new Date().toISOString() });
      if (error) throw new Error('CACHE_WRITE_FAILED');
      return;
    }
    if (!job.data_range) throw new Error('INVALID_CANDLE_RANGE');
    const candles = await twelveDataProvider.getCandles(job.symbol, job.data_range);
    const { error } = await admin.from('candles_cache').upsert({ symbol: job.symbol, range: job.data_range, data: candles, updated_at: new Date().toISOString() });
    if (error) {
      console.error('[candles_cache] queued upsert failed', { symbol: job.symbol, range: job.data_range, code: error.code, message: error.message });
      throw new Error('CACHE_WRITE_FAILED');
    }
  } finally {
    if (lock === true) await releaseMarketDataLock(admin, lockKey);
  }
}
