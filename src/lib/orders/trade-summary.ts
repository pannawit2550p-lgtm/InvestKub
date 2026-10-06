import { getTradeValue, roundMoney, type TradeSide } from '@/lib/trade/fees';

export interface TradeSettlement {
  side: TradeSide;
  quantity: number;
  price: number;
  currency: string;
  unit: string;
  fee: number;
  trade_value: number;
  cash_total: number;
}

// All inputs and monetary outputs here use account currency (USD).
// Use the recorded execution price and fee, never today's quote/fee schedule.
export function getOrderCashSummary(side: TradeSide, quantity: number, accountPrice: number, fee: number) {
  const trade_value = getTradeValue(quantity, accountPrice);
  return { trade_value, cash_total: roundMoney(side === 'buy' ? trade_value + fee : trade_value - fee) };
}
