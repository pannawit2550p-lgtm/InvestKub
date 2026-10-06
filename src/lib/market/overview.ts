import type { MarketPhase } from './hours';
import type { Candle } from './provider';

export interface OverviewItem {
  id: 'spx' | 'ixic' | 'dji'; name: string; symbol: string;
  price: number | null; previousClose: number | null; change: number; changePercent: number;
  series: Array<{ t: number; v: number }>; seriesRange: '1D' | '30D' | null; source: string;
}
export interface OverviewData {
  asOf: number | null; fetchedAt: number; session: MarketPhase;
  isDelayed: boolean; delayMinutes: number | null; mode: 'index' | 'etf-proxy';
  stale: boolean; refreshFailed: boolean; items: OverviewItem[];
}
export const OVERVIEW_ETFS = [
  { id: 'spx', name: 'S&P 500', symbol: 'SPY' },
  { id: 'ixic', name: 'NASDAQ-100', symbol: 'QQQ' },
  { id: 'dji', name: 'DOW JONES', symbol: 'DIA' },
] as const;
export function overviewInterval(phase: MarketPhase): number {
  return phase === 'open' ? 60_000 : phase === 'closed' ? 900_000 : 300_000;
}
export function downsampleSeries(candles: Candle[], maximum = 78) {
  const points = candles.filter((c) => Number.isFinite(c.t) && Number.isFinite(c.c) && c.c > 0)
    .sort((a, b) => a.t - b.t).map((c) => ({ t: c.t * 1000, v: c.c }));
  if (points.length <= maximum) return points;
  return Array.from({ length: maximum }, (_, i) => points[Math.round(i * (points.length - 1) / (maximum - 1))]);
}
export function overviewDirection(percent: number): -1 | 0 | 1 {
  const rounded = Number(percent.toFixed(2));
  return rounded > 0 ? 1 : rounded < 0 ? -1 : 0;
}
export function signedOverviewNumber(value: number) {
  const rounded = Number(value.toFixed(2));
  return `${rounded > 0 ? '+' : ''}${Object.is(rounded, -0) ? '0.00' : rounded.toFixed(2)}`;
}

/** Shared per-process SWR snapshot, single-flight and failure backoff. */
export function createOverviewCache(load: () => Promise<OverviewData>, phase: () => MarketPhase, now = Date.now) {
  let snapshot: OverviewData | undefined;
  let expires = 0; let retryAt = 0; let failures = 0;
  let pending: Promise<OverviewData> | undefined;
  const present = (value: OverviewData): OverviewData => {
    const session = phase();
    const delayMinutes = value.asOf === null ? null : Math.max(0, Math.floor((now() - value.asOf) / 60_000));
    return { ...value, session, delayMinutes, isDelayed: session !== 'closed' && (delayMinutes === null || delayMinutes > 20),
      stale: now() >= expires, refreshFailed: failures > 0 };
  };
  const refresh = () => {
    if (pending) return pending;
    pending = Promise.resolve().then(load).then((data) => {
      snapshot = data; failures = 0; retryAt = 0; expires = now() + overviewInterval(phase());
      return present(data);
    }).catch((error: unknown) => {
      failures += 1; retryAt = now() + Math.min(900_000, 60_000 * 2 ** Math.min(failures - 1, 4));
      if (snapshot) return present(snapshot);
      throw error;
    }).finally(() => { pending = undefined; });
    return pending;
  };
  return async (): Promise<OverviewData> => {
    if (snapshot) {
      expires = Math.min(expires, snapshot.fetchedAt + overviewInterval(phase()));
      if (now() >= expires && now() >= retryAt) void refresh().catch(() => undefined);
      return present(snapshot);
    }
    if (now() < retryAt) throw new Error('Market overview temporarily unavailable; retry later');
    return refresh();
  };
}
