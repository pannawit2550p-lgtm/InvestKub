import type { Quote } from '@/lib/market/provider';

export interface HoldingInput {
  symbol: string;
  name: string;
  logo_url?: string | null;
  quantity: number;
  avg_cost: number;
}

export interface HoldingCalculation extends HoldingInput {
  price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
  stock_day_change: number;
}

export interface HoldingState { quantity: number; avgCost: number; }

export function applyBuyToHolding(holding: HoldingState | null, quantity: number, executionPrice: number): HoldingState {
  const tradeValue = quantity * executionPrice;
  if (!holding) return { quantity, avgCost: Math.round(executionPrice * 10000) / 10000 };
  const newQuantity = holding.quantity + quantity;
  return { quantity: newQuantity, avgCost: Math.round(((holding.quantity * holding.avgCost + tradeValue) / newQuantity) * 10000) / 10000 };
}

export function applySellToHolding(holding: HoldingState, quantity: number, executionPrice: number, fee: number): { holding: HoldingState | null; realizedPl: number } {
  if (quantity > holding.quantity) throw new Error('INSUFFICIENT_SHARES');
  const realizedPl = Math.round(((executionPrice - holding.avgCost) * quantity - fee) * 100) / 100;
  const remaining = holding.quantity - quantity;
  return { holding: remaining < 0.000001 ? null : { quantity: remaining, avgCost: holding.avgCost }, realizedPl };
}

export function calculateHolding(holding: HoldingInput, quote: Quote): HoldingCalculation {
  const marketValue = holding.quantity * quote.price;
  const costBasis = holding.quantity * holding.avg_cost;
  const unrealizedPl = marketValue - costBasis;
  return {
    ...holding,
    price: quote.price,
    market_value: marketValue,
    cost_basis: costBasis,
    unrealized_pl: unrealizedPl,
    unrealized_pl_pct: costBasis > 0 ? (unrealizedPl / costBasis) * 100 : 0,
    stock_day_change: quote.price - quote.prevClose,
  };
}

export function calculatePortfolio(
  cashBalance: number,
  startingBalance: number,
  holdings: HoldingInput[],
  quotes: Record<string, Quote>,
  realizedPl: number,
) {
  const calculatedHoldings = holdings.flatMap((holding) => {
    const quote = quotes[holding.symbol];
    return quote ? [calculateHolding(holding, quote)] : [];
  });
  const holdingsValue = calculatedHoldings.reduce((sum, holding) => sum + holding.market_value, 0);
  const portfolioValue = cashBalance + holdingsValue;
  const totalPl = portfolioValue - startingBalance;
  return {
    holdings: calculatedHoldings,
    holdingsValue,
    portfolioValue,
    totalPl,
    totalPlPct: startingBalance > 0 ? (totalPl / startingBalance) * 100 : 0,
    realizedPl,
  };
}

export function calculateDayPerformance(portfolioValue: number, dayStartValue: number | null) {
  if (dayStartValue === null || dayStartValue <= 0) return { dayPlTotal: null, dayPlPct: null };
  const dayPlTotal = portfolioValue - dayStartValue;
  return { dayPlTotal, dayPlPct: (dayPlTotal / dayStartValue) * 100 };
}

export function calculatePeRatio(price: number, epsTtm: number | null | undefined): number | null {
  return epsTtm !== null && epsTtm !== undefined && epsTtm > 0 ? price / epsTtm : null;
}
