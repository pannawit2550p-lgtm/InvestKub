import Link from 'next/link';
import Icon, { type IconName } from './Icon';
import { formatBaht } from '@/lib/currency';
import { formatMoney, formatPercent } from '@/lib/format';

interface AssetCardProps {
  icon: IconName;
  tone: 'cash' | 'us' | 'th' | 'fund' | 'gold';
  title: string;
  subtitle: string;
  total: number;
  currency?: string;
  plPct?: number;
  plValue?: number;
  hidden?: boolean;
  showPerformance?: boolean;
  href: string;
}

export default function AssetCard({ icon, tone, title, subtitle, total, currency = 'USD', plPct = 0, plValue = 0, hidden = false, showPerformance = true, href }: AssetCardProps) {
  const positive = plPct >= 0;
  return <Link href={href} className="asset-card-link"><article className="asset-card"><div className="asset-card-top"><span className={`asset-icon ${tone}`}><Icon name={icon} size={24} /></span><div className="asset-info"><div className="asset-name">{title}</div><div className="asset-subtitle">{subtitle}</div></div><div className="asset-total">{hidden ? '••••' : currency === 'USD' ? formatBaht(total) : formatMoney(total, currency)}</div><Icon name="chevronRight" size={20} className="muted" /></div>{showPerformance && <div className="asset-card-bottom"><span>{'กำไรของสินทรัพย์ที่ถืออยู่'}</span><strong className={plPct === 0 ? 'muted' : positive ? 'gain' : 'loss'}>{hidden ? '••••' : <>{formatPercent(plPct)} ({currency === 'USD' ? formatBaht(plValue) : formatMoney(plValue, currency)})</>}</strong></div>}</article></Link>;
}
