import { usdToThb } from '@/lib/currency';
import { roundMoney } from '@/lib/trade/fees';

// Presentation only: calculations come from calculatePortfolio on the server.
export function profileReturnPresentation(accountAmount: number, percentage: number) {
  const amount = roundMoney(usdToThb(accountAmount));
  const direction = amount > 0 ? 'arrowUp' as const : amount < 0 ? 'arrowDown' as const : null;
  const sign = amount < 0 ? '−' : '+';
  const percent = amount === 0 ? '0.00%' : `${sign}${Math.abs(roundMoney(percentage)).toFixed(2)}%`;
  return { amount, direction, sign, percent, tone: amount > 0 ? 'positive' : amount < 0 ? 'negative' : 'muted' };
}
