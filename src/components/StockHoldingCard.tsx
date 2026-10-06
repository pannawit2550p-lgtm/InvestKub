import Link from 'next/link';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { usdToThb } from '@/lib/currency';
import AssetLogo from '@/components/AssetLogo';
import Icon from '@/components/Icon';

interface StockHoldingCardProps {
  symbol: string;
  logoUrl?: string | null;
  allocation: number;
  assetValueUSD: number;
  positionProfitLossPercent: number;
  positionProfitLossUSD: number;
  sharesHeld: number;
  currentPriceUSD: number;
  dailyChangePercent: number;
  averageCostUSD: number;
  totalCostUSD: number;
  expanded: boolean;
  onToggle: () => void;
}

function signedAmount(value: number) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatNumber(Math.abs(value), 2)} USD`;
}

function fixedFour(value: number) {
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export default function StockHoldingCard({
  symbol,
  logoUrl,
  allocation,
  assetValueUSD,
  positionProfitLossPercent,
  positionProfitLossUSD,
  sharesHeld,
  currentPriceUSD,
  dailyChangePercent,
  averageCostUSD,
  totalCostUSD,
  expanded,
  onToggle,
}: StockHoldingCardProps) {
  const positionTone = positionProfitLossUSD > 0 ? 'positive' : positionProfitLossUSD < 0 ? 'negative' : 'neutral';
  const dailyTone = dailyChangePercent > 0 ? 'positive' : dailyChangePercent < 0 ? 'negative' : 'neutral';
  const detailsId = `holding-details-${symbol.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  return (
    <article className={`stock-holding-card${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="stock-holding-summary"
        id={`holding-summary-${detailsId}`}
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={`${symbol} · ${formatNumber(allocation, 2)}% · ${expanded ? 'ยุบรายละเอียด' : 'ดูรายละเอียดหุ้น'}`}
      >
        <span className="stock-holding-identity">
          <AssetLogo symbol={symbol} logoUrl={logoUrl} size={40} className="stock-holding-logo" />
          <span className="stock-holding-identity-text">
            <strong className="stock-holding-symbol">{symbol}</strong>
            <small className="stock-holding-allocation"><Icon name="pieChart" size={13} />{formatNumber(allocation, 2)}%</small>
          </span>
        </span>
        <span className="stock-holding-value">
          <strong>{formatMoney(assetValueUSD, 'USD')}</strong>
          <small>≈ {formatNumber(usdToThb(assetValueUSD), 2)} THB</small>
        </span>
        <span className={`stock-holding-performance ${positionTone}`} title="กำไร/ขาดทุนหุ้นที่ถืออยู่ ไม่รวมค่าธรรมเนียม">
          <strong>{positionProfitLossUSD !== 0 && <Icon name={positionProfitLossUSD < 0 ? 'arrowDown' : 'arrowUp'} size={14} />}{formatPercent(positionProfitLossPercent)}</strong>
          <small>({signedAmount(positionProfitLossUSD)})</small>
        </span>
      </button>

      <div
        id={detailsId}
        className="stock-holding-drawer"
        role="region"
        aria-labelledby={`holding-summary-${detailsId}`}
        aria-hidden={!expanded}
      >
        <div className="stock-holding-drawer-clip">
          <div className="stock-holding-details">
            <div className="stock-holding-detail-item">
              <span>จำนวนหุ้นคงเหลือ</span>
              <strong>{formatNumber(sharesHeld, 7)}</strong>
            </div>
            <div className="stock-holding-detail-item">
              <span>ราคา (USD) · เปลี่ยนแปลง 1 วัน</span>
              <strong>{formatNumber(currentPriceUSD, 2)}</strong>
              <small className={dailyTone}>{dailyChangePercent !== 0 && <Icon name={dailyChangePercent < 0 ? 'arrowDown' : 'arrowUp'} size={13} />}{formatPercent(dailyChangePercent)}</small>
            </div>
            <div className="stock-holding-detail-item">
              <span>ต้นทุนต่อหุ้น (USD)</span>
              <strong>{fixedFour(averageCostUSD)}</strong>
            </div>
            <div className="stock-holding-detail-item">
              <span>ต้นทุนรวม (USD)</span>
              <strong>{formatNumber(totalCostUSD, 2)}</strong>
            </div>
            <p className="stock-holding-cost-note">ต้นทุนและกำไร/ขาดทุนหุ้นไม่รวมค่าธรรมเนียม ดูผลตอบแทนหลังหักค่าธรรมเนียมที่ผลตอบแทนสุทธิของพอร์ต</p>
            <div className="stock-holding-detail-action">
              <Link href={`/stock/${encodeURIComponent(symbol)}/trade?side=buy`} tabIndex={expanded ? 0 : -1} aria-label={`ซื้อ-ขาย ${symbol}`}>
                ซื้อ-ขาย
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
