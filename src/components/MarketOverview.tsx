'use client';

import { useEffect, useId, useState } from 'react';
import './market-overview.css';
import { useQuery } from '@tanstack/react-query';
import Icon from './Icon';
import { formatThaiDateTime } from '@/lib/time';
import { getUsMarketStatus } from '@/lib/market/hours';
import { overviewDirection, overviewInterval, OVERVIEW_ETFS, signedOverviewNumber, type OverviewData, type OverviewItem } from '@/lib/market/overview';

function Sparkline({ item }: { item: OverviewItem }) {
  const id = useId().replace(/:/g, ''); const points = item.series;
  if (points.length < 2) return <svg className="market-overview-sparkline" viewBox="0 0 140 44" preserveAspectRatio="none" aria-hidden="true"><path d="M0 28H140" className="market-overview-empty-line" /></svg>;
  const values = points.map((p) => p.v); const min = Math.min(...values); const max = Math.max(...values);
  const span = max - min || Math.max(Math.abs(max) * .01, 1);
  const positions = points.map((p, i) => [i / (points.length - 1) * 140, 40 - ((p.v - min + span * .06) / (span * 1.12)) * 36]);
  const line = positions.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const last = positions[positions.length - 1];
  const direction = item.seriesRange === '30D' ? overviewDirection((values[values.length - 1] - values[0]) / values[0] * 100) : overviewDirection(item.changePercent);
  const color = direction > 0 ? 'var(--accent-green)' : direction < 0 ? 'var(--negative)' : 'var(--text-muted)';
  return <svg className="market-overview-sparkline" viewBox="0 0 140 44" preserveAspectRatio="none" aria-hidden="true" style={{ color }}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".35" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    <path d={`${line} L140 44 L0 44 Z`} fill={`url(#${id})`} /><path className="market-overview-line" d={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" pathLength="1" />
    <circle cx={last[0] - 2} cy={last[1]} r="1.5" fill="currentColor" />
  </svg>;
}

export function MarketOverviewView({ data, loading = false, error = false, retry }: { data?: OverviewData; loading?: boolean; error?: boolean; retry?: () => void }) {
  const heading = useId(); const labels = { open: 'ตลาดเปิด', pre: 'ก่อนตลาดเปิด', post: 'หลังตลาดปิด', closed: 'ตลาดปิด' };
  const items = data?.items ?? OVERVIEW_ETFS.map((item) => ({ ...item, price: null, previousClose: null, change: 0, changePercent: 0, series: [], seriesRange: null, source: '' } as OverviewItem));
  const mode = data?.mode ?? 'etf-proxy';
  const time = data?.asOf == null ? 'ไม่ทราบเวลา' : `${formatThaiDateTime(data.asOf)} น.`;
  return <section className="market-overview" aria-labelledby={heading} aria-busy={loading}>
    <div className="market-overview-heading"><div><h2 id={heading}>ภาพรวมตลาด</h2>{data && <span className={`market-overview-status is-${data.session}`}><i aria-hidden="true" />{labels[data.session]}</span>}</div><span className="market-overview-time">{loading ? 'กำลังโหลดข้อมูล…' : data ? `อัปเดตล่าสุด ${time}` : '—'}</span></div>
    {data?.items.some((item) => item.seriesRange === '30D') && <p className="market-overview-note">กราฟ 30 วันล่าสุด (เฉพาะการ์ดที่ระบุ 30 วัน)</p>}
    {data?.isDelayed && <p className="market-overview-warning"><Icon name="info" size={14} />{data.delayMinutes === null ? 'ไม่ทราบเวลาข้อมูล' : `ข้อมูลล่าช้า ${data.delayMinutes} นาที`} · <span tabIndex={0} title="เวลาราคาจากผู้ให้บริการเก่ากว่า 20 นาทีในช่วงซื้อขาย">ข้อมูลอาจล่าช้า</span></p>}
    {(error || data?.refreshFailed) && <p className="market-overview-warning" role="status">{data ? `เชื่อมต่อข้อมูลไม่ได้ ใช้ข้อมูลเมื่อ ${time}` : 'ไม่สามารถโหลดข้อมูลตลาดได้'} <button type="button" onClick={retry}>ลองอีกครั้ง</button></p>}
    {data?.stale && !data.refreshFailed && !error && <p className="market-overview-note">กำลังอัปเดตข้อมูล · แสดงข้อมูลรอบก่อน</p>}
    <div className="market-overview-grid">{items.map((item) => {
      const direction = overviewDirection(item.changePercent); const arrow = direction > 0 ? 'เพิ่มขึ้น' : direction < 0 ? 'ลดลง' : 'ไม่เปลี่ยนแปลง';
      const value = item.price === null ? '—' : mode === 'etf-proxy' ? `${signedOverviewNumber(item.changePercent)}%` : item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const label = item.price === null ? `${item.name} ไม่มีข้อมูล` : mode === 'etf-proxy' ? `${item.name} อิงจาก ${item.symbol} ${arrow} ${Math.abs(Number(item.changePercent.toFixed(2)))} เปอร์เซ็นต์` : `${item.name} ${value} ${arrow} ${Math.abs(item.change).toFixed(2)} จุด หรือ ${Math.abs(item.changePercent).toFixed(2)} เปอร์เซ็นต์`;
      return <div className={`market-overview-card is-${direction > 0 ? 'positive' : direction < 0 ? 'negative' : 'neutral'}`} role="group" aria-label={loading ? `${item.name} กำลังโหลด` : label} key={item.id}>
        {loading ? <><span className="market-overview-skeleton skeleton" /><span className="market-overview-skeleton skeleton" /><span className="market-overview-skeleton skeleton" /><div className="market-overview-sparkline skeleton" /></> : <>
          <span className="market-overview-name" tabIndex={0} title={item.id === 'ixic' ? mode === 'etf-proxy' ? 'NASDAQ-100 อ้างอิง QQQ ไม่ใช่ Nasdaq Composite' : 'Nasdaq Composite' : `${item.name} · ${item.source}`}>{item.name}</span>
          <strong className={`market-overview-value${mode === 'etf-proxy' ? ' is-proxy' : ''}`}>{mode === 'etf-proxy' && item.price !== null && direction !== 0 && <Icon name={direction > 0 ? 'arrowUp' : 'arrowDown'} size={14} />}{value}</strong>
          {mode === 'etf-proxy' ? <span className="market-overview-reference">อิงจาก {item.symbol}</span> : <div className="market-overview-change">{direction !== 0 && <Icon name={direction > 0 ? 'arrowUp' : 'arrowDown'} size={12} />}<span>{signedOverviewNumber(item.change)}</span> <span>({signedOverviewNumber(item.changePercent)}%)</span></div>}
          {item.seriesRange === '30D' && <span className="market-overview-range">30 วัน</span>}
          <Sparkline item={item} />
        </>}
      </div>;
    })}</div>
  </section>;
}

export default function MarketOverview() {
  const [clock, setClock] = useState(() => Date.now());
  const session = getUsMarketStatus(new Date(clock)).phase;
  const query = useQuery<OverviewData>({ queryKey: ['market-overview'], queryFn: async ({ signal }) => {
    const response = await fetch('/api/market/overview', { signal });
    if (!response.ok) throw new Error('Market overview unavailable');
    const body = await response.json() as { data: OverviewData }; return body.data;
  }, staleTime: overviewInterval(session), gcTime: 60 * 60_000, retry: false,
  refetchInterval: overviewInterval(session), refetchIntervalInBackground: false, refetchOnWindowFocus: 'always' });
  const { refetch } = query;
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') { setClock(Date.now()); void refetch(); } };
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') setClock(Date.now()); }, 60_000);
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [refetch]);
  const delayMinutes = query.data?.asOf == null ? null : Math.max(0, Math.floor((clock - query.data.asOf) / 60_000));
  const data = query.data ? { ...query.data, session, delayMinutes,
    isDelayed: session !== 'closed' && (delayMinutes === null || delayMinutes > 20) } : undefined;
  return <MarketOverviewView data={data} loading={query.isPending} error={query.isError} retry={() => void query.refetch()} />;
}
