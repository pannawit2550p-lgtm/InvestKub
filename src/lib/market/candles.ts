import type { Candle } from './provider';
import { zonedDateKey } from '@/lib/time';

export function filterCandlesToLatestSession(candles: Candle[], timeZone: string): Candle[] {
  if (!candles.length) return [];
  const sorted = [...candles].sort((a, b) => a.t - b.t);
  const latestSession = zonedDateKey(sorted[sorted.length - 1].t * 1_000, timeZone);
  return sorted.filter((candle) => zonedDateKey(candle.t * 1_000, timeZone) === latestSession);
}
