import { describe, expect, it } from 'vitest';
import { filterCandlesToLatestSession } from './candles';
import type { Candle } from './provider';

describe('intraday session filtering', () => {
  it('keeps only the latest exchange-local trading date', () => {
    const candles: Candle[] = [
      { t: Date.parse('2026-10-05T19:55:00.000Z') / 1_000, o: 1, h: 1, l: 1, c: 1, v: 1 },
      { t: Date.parse('2026-10-06T13:30:00.000Z') / 1_000, o: 2, h: 2, l: 2, c: 2, v: 2 },
    ];
    expect(filterCandlesToLatestSession(candles, 'America/New_York')).toHaveLength(1);
    expect(filterCandlesToLatestSession(candles, 'America/New_York')[0].c).toBe(2);
  });
});
