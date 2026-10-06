import { describe, expect, it } from 'vitest';
import { getOrderCashSummary } from './trade-summary';

describe('recorded trade cash breakdown', () => {
  it('matches the recorded MSFT purchase without including fees in its price', () => {
    expect(getOrderCashSummary('buy', 100, 528.9844, 52.9)).toEqual({ trade_value: 52898.44, cash_total: 52951.34 });
  });

  it('subtracts the fee from sale proceeds', () => {
    expect(getOrderCashSummary('sell', 100, 528.9844, 52.9)).toEqual({ trade_value: 52898.44, cash_total: 52845.54 });
  });

  it('rounds share value once, then adds the recorded fee', () => {
    expect(getOrderCashSummary('buy', 0.000123, 528.9844, 0.5)).toEqual({ trade_value: 0.07, cash_total: 0.57 });
  });

  it('does not recalculate historical fees using the current minimum or rate', () => {
    expect(getOrderCashSummary('buy', 1, 100, 0)).toEqual({ trade_value: 100, cash_total: 100 });
    expect(getOrderCashSummary('buy', 1, 100, 3)).toEqual({ trade_value: 100, cash_total: 103 });
  });
});
