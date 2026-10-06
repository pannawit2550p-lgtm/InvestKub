import { describe, expect, it } from 'vitest';
import { formatAssetPrice, formatBaht, STARTING_BALANCE_ACCOUNT, STARTING_BALANCE_THB, usdToThb } from './currency';

describe('formatAssetPrice', () => {
  it('shows the stored precision of USD prices up to four decimals', () => {
    expect(formatAssetPrice(3.1816, 'USD')).toBe('$3.1816 USD');
  });

  it('keeps two decimal places for prices already rounded to cents', () => {
    expect(formatAssetPrice(3.18, 'USD')).toBe('$3.18 USD');
  });

  it('shows Thai baht prices to two decimals', () => {
    expect(formatAssetPrice(3.1816, 'THB')).toBe('3.18 บาท');
  });

  it('sets the starting balance to exactly 100,000 baht at the configured exchange rate', () => {
    expect(usdToThb(STARTING_BALANCE_ACCOUNT)).toBeCloseTo(STARTING_BALANCE_THB, 4);
    expect(formatBaht(STARTING_BALANCE_ACCOUNT)).toBe('100,000 บาท');
  });
});
