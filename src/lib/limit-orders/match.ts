import type { TradeSide } from '@/lib/trade/fees';

export function shouldFillLimitOrder(side: TradeSide, executionPrice: number, limitPrice: number): boolean {
  return side === 'buy' ? executionPrice <= limitPrice : executionPrice >= limitPrice;
}
