import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatPrice, formatNumber, formatAssetChange } from '@/lib/format';
import { getAssetMetadata } from '@/lib/market/mockAssets';
import AssetLogo from './AssetLogo';
import Icon from './Icon';

interface AssetRowProps {
  symbol: string;
  name?: string;
  logoUrl?: string | null;
  quantity?: number;
  marketValue?: number;
  changePct?: number;
  price?: number;
  currency?: string;
  watch?: boolean;
  showWatchAction?: boolean;
  onToggleWatch?: () => void;
  href?: string;
  mock?: boolean;
  trailing?: ReactNode;
  density?: 'compact';
  showTag?: boolean;
}

function getCategoryLabel(symbol: string): string {
  const market = getAssetMetadata(symbol).market;
  if (market === 'TH') return 'หุ้นไทย';
  if (market === 'FUND') return 'กองทุนรวม';
  if (market === 'GOLD') return 'ทองคำ';
  return 'หุ้นสหรัฐ';
}

export default function AssetRow({ symbol, name, logoUrl, quantity, marketValue, changePct, price, currency, watch, showWatchAction = true, onToggleWatch, href, mock, trailing, density = 'compact', showTag = true }: AssetRowProps) {
  const asset = getAssetMetadata(symbol);
  const detail = [
    name?.trim() || undefined,
    quantity !== undefined ? `${formatNumber(quantity)} ${asset.unit}` : undefined,
  ].filter(Boolean).join(' · ');
  const shownCurrency = currency ?? asset.currency;
  const shownValue = marketValue !== undefined ? marketValue : price;
  const change = formatAssetChange(changePct);
  const changeTone = !change || change.direction === 0 ? 'neutral' : change.direction > 0 ? 'positive' : 'negative';
  const hasTrailing = Boolean(trailing || (showWatchAction && onToggleWatch));
  const currencyLabel = shownCurrency === 'USD' ? 'ดอลลาร์สหรัฐ' : shownCurrency === 'THB' ? 'บาท' : shownCurrency;
  const changeLabel = !change ? '' : change.direction === 0 ? 'ไม่เปลี่ยนแปลง 0.00 เปอร์เซ็นต์' : `${change.direction > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${change.absolute} เปอร์เซ็นต์`;

  return <div className={`asset-row asset-row-${density}${showTag ? '' : ' asset-row-no-tag'}${hasTrailing ? ' has-trailing' : ''}`}>
    <Link href={href ?? `/stock/${symbol}`} className="asset-row-main" aria-label={`${symbol} ${detail} ราคา ${formatPrice(shownValue)} ${currencyLabel} ${changeLabel} เปิดรายละเอียด`}>
      <AssetLogo symbol={symbol} logoUrl={logoUrl} size={36} />
      <span className="asset-row-info">
        {showTag && <span className="asset-row-category">{getCategoryLabel(symbol)}</span>}
        <span className="asset-row-symbol">{symbol}{mock && <em className="mock-label">จำลอง</em>}</span>
        {detail && <span className="asset-row-name">{detail}</span>}
      </span>
      <span className="asset-row-value">
        <span className="asset-row-price"><strong>{formatPrice(shownValue)}</strong>{shownValue !== undefined && <span className="asset-row-currency">{shownCurrency}</span>}</span>
        {change && <small className={`asset-row-change ${changeTone}`}>
          {change.direction > 0 ? <Icon name="arrowUp" size={12} /> : change.direction < 0 ? <Icon name="arrowDown" size={12} /> : null}
          {change.text}
        </small>}
      </span>
    </Link>
    {hasTrailing && <span className="asset-row-trailing">{trailing}{showWatchAction && onToggleWatch && <button type="button" aria-label={watch ? 'นำออกจากรายการติดตาม' : 'เพิ่มในรายการติดตาม'} aria-pressed={watch} onClick={onToggleWatch} className="watch-button">
      <Icon name="sparkles" size={18} />
    </button>}</span>}
  </div>;
}

export function AssetRowSkeleton({ showTag = true, withTrailing = false }: { showTag?: boolean; withTrailing?: boolean }) {
  return <div className={`asset-row asset-row-compact asset-row-loading${showTag ? '' : ' asset-row-no-tag'}${withTrailing ? ' has-trailing' : ''}`} aria-hidden="true">
    <div className="asset-row-main"><span className="asset-row-logo skeleton" />
      <span className="asset-row-info">{showTag && <span className="asset-row-category skeleton" />}<span className="asset-row-symbol skeleton" /><span className="asset-row-name skeleton" /></span>
      <span className="asset-row-value"><span className="asset-row-price skeleton" /><span className="asset-row-change skeleton" /></span>
    </div>{withTrailing && <span className="asset-row-trailing" />}
  </div>;
}
