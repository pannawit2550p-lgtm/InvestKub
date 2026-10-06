import { describe, expect, it } from 'vitest';
import { getNextUsMarketOpen } from '@/lib/market/hours';
import { shouldFillLimitOrder } from './match';

describe('limit order matching', () => {
  it('fills buys at or below the limit', () => {
    expect(shouldFillLimitOrder('buy', 99.99, 100)).toBe(true);
    expect(shouldFillLimitOrder('buy', 100, 100)).toBe(true);
    expect(shouldFillLimitOrder('buy', 100.01, 100)).toBe(false);
  });

  it('fills sells at or above the limit', () => {
    expect(shouldFillLimitOrder('sell', 100.01, 100)).toBe(true);
    expect(shouldFillLimitOrder('sell', 100, 100)).toBe(true);
    expect(shouldFillLimitOrder('sell', 99.99, 100)).toBe(false);
  });

  it('finds Monday open after a Sunday during US daylight saving time', () => {
    expect(getNextUsMarketOpen(new Date('2026-10-04T12:00:00Z')).toISOString()).toBe('2026-10-05T13:30:00.000Z');
  });
});
