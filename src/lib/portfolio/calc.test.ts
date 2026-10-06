import { describe, expect, it } from 'vitest';
import { applyBuyToHolding, applySellToHolding, calculateDayPerformance, calculatePeRatio, calculatePortfolio } from './calc';
import { getExecutionPrice, getFee, getTradePreview, roundShares } from '@/lib/trade/fees';
import { idempotent } from '@/lib/trade/idempotency';

const quote = { symbol: 'AAPL', price: 101, prevClose: 100, change: 1, changePct: 1, updatedAt: new Date().toISOString() };

describe('portfolio calculations', () => {
  it('separates zero share gains from a portfolio loss caused by the buy fee', () => {
    const result = calculatePortfolio(8999, 10000, [{ symbol: 'AAPL', name: 'Apple', quantity: 10, avg_cost: 100 }], { AAPL: { ...quote, price: 100 } }, -1);
    expect(result.holdings[0].unrealized_pl).toBe(0);
    expect(result.totalPl).toBe(-1);
    expect(result.totalPlPct).toBe(-0.01);
  });

  it('includes sold-share gains and both fees in net portfolio returns', () => {
    // Buy 10 @ 100 + fee 1, then sell 4 @ 110 - fee .5.
    const result = calculatePortfolio(9438.5, 10000, [{ symbol: 'AAPL', name: 'Apple', quantity: 6, avg_cost: 100 }], { AAPL: { ...quote, price: 110 } }, 38.5);
    expect(result.holdings[0].unrealized_pl).toBe(60);
    expect(result.totalPl).toBe(98.5);
    expect(result.totalPl).toBe(result.holdings[0].unrealized_pl + result.realizedPl);
    expect(calculatePortfolio(10098.5, 10000, [], {}, 98.5).totalPl).toBe(98.5);
  });

  it('does not treat reward cash included in the investment base as gains', () => {
    const result = calculatePortfolio(9099, 10100, [{ symbol: 'AAPL', name: 'Apple', quantity: 10, avg_cost: 100 }], { AAPL: { ...quote, price: 100 } }, -1);
    expect(result.portfolioValue).toBe(10099);
    expect(result.totalPl).toBe(-1);
  });

  it('calculates a first buy and zero holdings', () => {
    const result = calculatePortfolio(98999.5, 100000, [{ symbol: 'AAPL', name: 'Apple', quantity: 9.995, avg_cost: 100.05 }], { AAPL: quote }, 0);
    expect(result.holdingsValue).toBeCloseTo(1009.495);
    expect(result.portfolioValue).toBeCloseTo(100008.995);
    expect(calculatePortfolio(100000, 100000, [], {}, 0).holdings).toHaveLength(0);
  });

  it('uses null for day P/L without a valid day-start snapshot', () => {
    expect(calculateDayPerformance(101, null)).toEqual({ dayPlTotal: null, dayPlPct: null });
    expect(calculateDayPerformance(101, 100)).toEqual({ dayPlTotal: 1, dayPlPct: 1 });
  });

  it('does not inherit pre-purchase movement into day P/L', () => {
    const dayStart = 100_000;
    const portfolioAfterBuy = 99_999;
    expect(calculateDayPerformance(portfolioAfterBuy, dayStart)).toEqual({ dayPlTotal: -1, dayPlPct: -0.001 });
  });

  it('shows no P/E for negative or zero EPS', () => {
    expect(calculatePeRatio(100, -2)).toBeNull();
    expect(calculatePeRatio(100, 0)).toBeNull();
    expect(calculatePeRatio(100, 5)).toBe(20);
  });
});

describe('holding lifecycle', () => {
  it('uses execution prices only for first and weighted-average subsequent buys', () => {
    const first = applyBuyToHolding(null, 10, 100.05);
    expect(first).toEqual({ quantity: 10, avgCost: 100.05 });
    const second = applyBuyToHolding(first, 5, 90.05);
    expect(second.quantity).toBe(15);
    expect(second.avgCost).toBeCloseTo(96.7167, 4);
  });

  it('keeps the purchase price exact even for fractional shares', () => {
    expect(applyBuyToHolding(null, 0.000123, 528.9844).avgCost).toBe(528.9844);
    expect(applyBuyToHolding(null, 100, 528.9844).avgCost).toBe(528.9844);
  });

  it('keeps average cost on partial sell and realizes P/L', () => {
    const result = applySellToHolding({ quantity: 10, avgCost: 100 }, 4, 110, 0.5);
    expect(result.holding).toEqual({ quantity: 6, avgCost: 100 });
    expect(result.realizedPl).toBe(39.5);
  });

  it('deletes full or dust sells and rejects oversells', () => {
    expect(applySellToHolding({ quantity: 10, avgCost: 100 }, 10, 100, 0.5).holding).toBeNull();
    expect(applySellToHolding({ quantity: 10.0000005, avgCost: 100 }, 10, 100, 0.5).holding).toBeNull();
    expect(() => applySellToHolding({ quantity: 1, avgCost: 100 }, 2, 100, 0.5)).toThrow('INSUFFICIENT_SHARES');
  });
});

describe('trade math', () => {
  it('applies buy and sell slippage', () => {
    expect(getExecutionPrice('buy', 100)).toBe(100.05);
    expect(getExecutionPrice('sell', 100)).toBe(99.95);
  });

  it('uses fee-aware amount previews and fractional shares', () => {
    const preview = getTradePreview('buy', 'amount', 1000, 100);
    expect(preview.quantity).toBeLessThan(10);
    expect(preview.tradeValue).toBe(999);
    expect(preview.fee).toBe(1);
    expect(preview.total).toBe(1000);
    expect(roundShares(0.1234567)).toBe(0.123457);
  });

  it('enforces the minimum fee', () => {
    expect(getFee(10)).toBe(0.5);
  });

  it('returns the same order and runs the creator once for a duplicate client order id', () => {
    const store = new Map<string, { id: string }>(); let executions = 0;
    const create = () => { executions += 1; return { id: 'order-1' }; };
    expect(idempotent(store, 'client-1', create)).toBe(idempotent(store, 'client-1', create));
    expect(executions).toBe(1);
  });
});
