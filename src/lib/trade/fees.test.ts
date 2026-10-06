import { describe, expect, it } from 'vitest';
import { getBuyQuantity, getFee, getTradePreview, getTradePreviewWithConversion, getTradeValue, MIN_FEE } from './fees';
import { fromAccountCurrency, thbToUsd, toAccountCurrency, usdToThb } from '@/lib/currency';

describe('fee-inclusive buy budgets', () => {
  it('spends 999 on shares and 1 on fees for a 1000 account-currency budget', () => {
    const quantity = getBuyQuantity(1000, 100);
    expect(getTradeValue(quantity, 100)).toBe(999);
    expect(getFee(getTradeValue(quantity, 100))).toBe(1);
  });

  it('handles minimum fees and invalid or insufficient budgets', () => {
    expect(getBuyQuantity(MIN_FEE, 100)).toBe(0);
    expect(getBuyQuantity(0, 100)).toBe(0);
    expect(getBuyQuantity(1000, 0)).toBe(0);
    expect(getBuyQuantity(Infinity, 100)).toBe(0);
    expect(getBuyQuantity(1000, NaN)).toBe(0);
    const preview = getTradePreview('buy', 'amount', 10, 100);
    expect(preview.tradeValue).toBe(9.5);
    expect(preview.fee).toBe(0.5);
    expect(preview.total).toBe(10);
  });

  it('never exceeds the budget after rounding, including near fee boundaries', () => {
    for (const budget of [0.51, 1.5, 10, 499.99, 500, 500.5, 1000, 1234.567, 100000]) {
      for (const price of [0.0001, 0.3, 10, 100.05, 528.9844, 100000]) {
        const quantity = getBuyQuantity(budget, price);
        const value = getTradeValue(quantity, price);
        expect(value + getFee(value)).toBeLessThanOrEqual(budget + 1e-9);
        expect(Math.round(quantity * 1e6)).toBeCloseTo(quantity * 1e6, 4);
      }
    }
  });

  it('uses the same math for USD stock previews and server-side account budgets', () => {
    const budget = thbToUsd(1000);
    const preview = getTradePreviewWithConversion('buy', 'amount', budget, 528.72, (value) => value, (value) => value);
    expect(preview.quantity).toBe(getBuyQuantity(budget, preview.executionPrice));
    expect(preview.total).toBe(getTradeValue(preview.quantity, preview.executionPrice) + preview.fee);
    expect(usdToThb(preview.total)).toBeLessThanOrEqual(1000);
  });

  it('rounds in account currency, not native currency, for converted assets', () => {
    const preview = getTradePreviewWithConversion('buy', 'amount', 1000, 123.45,
      (value) => toAccountCurrency(value, 'THB'), (value) => fromAccountCurrency(value, 'THB'));
    expect(preview.tradeValue).toBe(getTradeValue(preview.quantity, thbToUsd(preview.executionPrice)));
    expect(usdToThb(preview.total)).toBeLessThanOrEqual(1000);
  });

  it('keeps share-mode purchases and sell-mode amounts unchanged', () => {
    expect(getTradePreview('buy', 'shares', 10, 100)).toMatchObject({ quantity: 10, tradeValue: 1000.5, fee: 1, total: 1001.5 });
    expect(getTradePreview('sell', 'amount', 1000, 100)).toMatchObject({ quantity: 10, tradeValue: 999.5, fee: 1, total: 998.5 });
  });
});
