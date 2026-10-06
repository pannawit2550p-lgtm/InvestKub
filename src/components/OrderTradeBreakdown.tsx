import { formatAssetPrice, formatBaht } from '@/lib/currency';
import { formatNumber } from '@/lib/format';
import type { TradeSettlement } from '@/lib/orders/trade-summary';

export default function OrderTradeBreakdown({ side, quantity, price, currency, unit, fee, trade_value, cash_total }: TradeSettlement) {
  return <div className="order-trade-breakdown">
    <p className="order-trade-equation">{side === 'buy' ? 'ราคาซื้อจริง' : 'ราคาขายจริง'} {formatAssetPrice(price, currency)} × {formatNumber(quantity, 6)} {unit}</p>
    <dl>
      <div><dt>มูลค่าหุ้น</dt><dd>{formatBaht(trade_value)}</dd></div>
      <div><dt>ค่าธรรมเนียม</dt><dd>{formatBaht(fee)}</dd></div>
      <div className="order-trade-net"><dt>{side === 'buy' ? 'ยอดเงินสดที่หัก' : 'ยอดเงินสดที่ได้รับ'}</dt><dd>{formatBaht(cash_total)}</dd></div>
    </dl>
  </div>;
}
