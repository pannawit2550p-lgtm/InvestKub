export type TradeSide = 'buy' | 'sell';
export type OrderMode = 'amount' | 'shares';

export const SLIPPAGE_BPS = 5;
export const FEE_RATE = 0.001;
export const MIN_FEE = 0.5;
export const MIN_ORDER_VALUE = 1;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundPrice(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function roundShares(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function getQuantity(mode: OrderMode, value: number, quotedPrice: number): number {
  if (mode === 'shares') return roundShares(value);
  return roundShares(value / quotedPrice);
}

export function getExecutionPrice(side: TradeSide, quotedPrice: number): number {
  const multiplier = side === 'buy' ? 1 + SLIPPAGE_BPS / 10000 : 1 - SLIPPAGE_BPS / 10000;
  return roundPrice(quotedPrice * multiplier);
}

export function getTradeValue(quantity: number, executionPrice: number): number {
  return roundMoney(quantity * executionPrice);
}

export function getFee(tradeValue: number): number {
  return Math.max(MIN_FEE, roundMoney(tradeValue * FEE_RATE));
}

// Budget and price use account currency. Round shares down and check the
// rounded cash debit (including the minimum fee), never exceeding the budget.
export function getBuyQuantity(budget: number, executionPrice: number): number {
  if (!Number.isFinite(budget) || !Number.isFinite(executionPrice) || budget <= MIN_FEE || executionPrice <= 0) return 0;
  const budgetCents = Math.floor((budget + Number.EPSILON) * 100);
  let low = 0;
  let high = Math.min(Number.MAX_SAFE_INTEGER - 1, Math.floor(budget / executionPrice * 1_000_000));
  while (low < high) {
    const middle = low + Math.ceil((high - low) / 2);
    const tradeValue = getTradeValue(middle / 1_000_000, executionPrice);
    const debitCents = Math.round((tradeValue + getFee(tradeValue)) * 100);
    if (debitCents <= budgetCents) low = middle;
    else high = middle - 1;
  }
  return low / 1_000_000;
}

export function getTradePreview(side: TradeSide, mode: OrderMode, value: number, quotedPrice: number) {
  const executionPrice = getExecutionPrice(side, quotedPrice);
  const quantity = side === 'buy' && mode === 'amount' ? getBuyQuantity(value, executionPrice) : getQuantity(mode, value, quotedPrice);
  const tradeValue = getTradeValue(quantity, executionPrice);
  const fee = getFee(tradeValue);
  const total = side === 'buy' ? roundMoney(tradeValue + fee) : roundMoney(tradeValue - fee);
  return { quantity, quotedPrice, executionPrice, tradeValue, fee, total };
}

export function getTradePreviewWithConversion(
  side: TradeSide,
  mode: OrderMode,
  nativeValue: number,
  quotedPrice: number,
  toAccountCurrency: (value: number) => number,
  fromAccountCurrency: (value: number) => number,
) {
  const executionPrice = getExecutionPrice(side, quotedPrice);
  const quantity = side === 'buy' && mode === 'amount'
    ? getBuyQuantity(toAccountCurrency(nativeValue), toAccountCurrency(executionPrice))
    : getQuantity(mode, nativeValue, quotedPrice);
  const tradeValue = getTradeValue(quantity, toAccountCurrency(executionPrice));
  const nativeTradeValue = fromAccountCurrency(tradeValue);
  const fee = getFee(tradeValue);
  const total = side === 'buy' ? roundMoney(tradeValue + fee) : roundMoney(tradeValue - fee);
  return { quantity, quotedPrice, executionPrice, tradeValue, fee, total, nativeTradeValue };
}
