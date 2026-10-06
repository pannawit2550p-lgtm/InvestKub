'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatAssetPrice, formatAssetPriceValue, formatBaht, formatStockPrice, usdToThb } from '@/lib/currency';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { formatOpenCountdown, getMarketStatus } from '@/lib/market/hours';
import { getAssetMetadata, mockAssets, type MockAsset } from '@/lib/market/mockAssets';
import type { Candle, Fundamentals, Range, Quote } from '@/lib/market/provider';
import { filterCandlesToLatestSession } from '@/lib/market/candles';
import { getChangePresentation } from '@/lib/market/quote-change';
import { formatThaiDate, formatThaiDateTime, formatThaiTime, zonedDateKey } from '@/lib/time';
import { getAssetTypeLabel, getDividends, getMockFundamentals, type DividendSnapshot } from '@/lib/stock-detail';
import { t } from '@/lib/i18n';
import AssetLogo from '@/components/AssetLogo';
import Icon from '@/components/Icon';

const PriceChart = dynamic(() => import('@/components/PriceChart'), {
  ssr: false,
  loading: () => <div className="stock-detail-chart-skeleton skeleton" role="status" aria-label="กำลังโหลดกราฟ" />,
});

interface Detail {
  stock: { symbol: string; name: string; exchange?: string; market?: string; currency?: string; logo_url?: string | null };
  quote: Quote & { stale?: boolean; refreshFailed?: boolean };
  fundamentals: Fundamentals;
  pe_ratio: number | null;
  is_market_open: boolean;
  market_status?: { phase: 'pre' | 'open' | 'post' | 'closed'; label: string; nextOpenAt: string | null; marketDate: string };
  server_now?: string;
  currency?: string;
  mock?: boolean;
}

interface SearchMatch { symbol: string; logo_url?: string | null; }

interface Holding {
  symbol: string;
  quantity: number;
  avg_cost: number;
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
}

interface LimitOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  limit_price: number;
  status: 'pending' | 'processing' | 'filled' | 'expired' | 'failed' | 'cancelled';
  market_opens_at: string;
  expires_at: string;
  created_at: string;
}

const ranges: Array<{ value: Range; label: string }> = [
  { value: '1D', label: '1D' }, { value: '5D', label: '5D' }, { value: '1M', label: '1M' },
  { value: '6M', label: '6M' }, { value: 'YTD', label: 'YTD' }, { value: '1Y', label: '1Y' }, { value: '5Y', label: '5Y' },
];

const rangeLabels: Record<Range, string> = {
  '1D': 'วันนี้',
  '5D': '5 วัน',
  '1M': '1 เดือน',
  '6M': '6 เดือน',
  YTD: 'ตั้งแต่ต้นปี',
  '1Y': '1 ปี',
  '5Y': '5 ปี',
};

function assetMoney(value: number | null | undefined, currency: string): string {
  return formatAssetPrice(value, currency);
}

function accountMoneyAsAsset(value: number | null | undefined, currency: string): string {
  return assetMoney(currency === 'THB' && value !== null && value !== undefined ? usdToThb(value) : value, currency);
}

function approximateBaht(value: number | null | undefined, currency: string): string | null {
  if (currency !== 'USD' || value === null || value === undefined || Number.isNaN(value)) return null;
  return `≈ ${formatNumber(usdToThb(value), 2)} บาท`;
}

function compactValue(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const absolute = Math.abs(value);
  const suffix = absolute >= 1e12 ? 'ล้านล้าน' : absolute >= 1e9 ? 'พันล้าน' : absolute >= 1e6 ? 'ล้าน' : '';
  const divisor = suffix === 'ล้านล้าน' ? 1e12 : suffix === 'พันล้าน' ? 1e9 : suffix === 'ล้าน' ? 1e6 : 1;
  return `${formatNumber(value / divisor, suffix ? 2 : 0)} ${suffix} ${currency === 'THB' ? 'บาท' : 'USD'}`.trim();
}

function rangePosition(low: number | undefined, high: number | undefined, price: number): number | null {
  if (low === undefined || high === undefined || high <= low) return null;
  return Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
}

function SectionHeading({ title, muted, action }: { title: string; muted?: string; action?: React.ReactNode }) {
  return <div className="stock-detail-section-heading"><h2>{title}</h2>{muted && <span className="stock-detail-heading-muted">{muted}</span>}{action}</div>;
}

function DataRow({ label, value, className = '' }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return <div className="stock-detail-data-row"><span>{label}</span><strong className={className}>{value}</strong></div>;
}

function RangeBar({ label, low, high, price, currency }: { label: string; low?: number; high?: number; price: number; currency: string }) {
  const position = rangePosition(low, high, price);
  return <div className="stock-detail-range-bar">
    <div className="stock-detail-range-label"><strong>{label}</strong><span>ราคาปัจจุบัน</span></div>
    <div className="stock-detail-range-track" role="img" aria-label={`${label}: ราคาต่ำสุด ${assetMoney(low, currency)}, ราคาสูงสุด ${assetMoney(high, currency)}, ราคาปัจจุบัน ${assetMoney(price, currency)}`}>
      {position !== null && <span className="stock-detail-range-marker" style={{ left: `${position}%` }} />}
    </div>
    <div className="stock-detail-range-values">
      <span className="stock-detail-range-endpoint"><small>ต่ำสุด</small><strong>{assetMoney(low, currency)}</strong></span>
      <span className="stock-detail-range-endpoint is-high"><small>สูงสุด</small><strong>{assetMoney(high, currency)}</strong></span>
    </div>
  </div>;
}

function LoadingSection() {
  return <div className="stock-detail-section-skeleton"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>;
}

function ErrorSection({ message }: { message: string }) {
  return <div className="stock-detail-error"><Icon name="info" size={18} /><span>{message}</span></div>;
}

function DividendSheet({ open, data, onClose }: { open: boolean; data: DividendSnapshot | null; onClose: () => void }) {
  if (!open) return null;
  return <div className="stock-detail-sheet-backdrop" role="presentation" onClick={onClose}>
    <section className="stock-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="dividend-sheet-title" onClick={(event) => event.stopPropagation()}>
      <div className="stock-detail-sheet-handle" />
      <div className="stock-detail-sheet-heading"><h2 id="dividend-sheet-title">ประวัติเงินปันผล</h2><button className="stock-detail-icon-button" onClick={onClose} aria-label="ปิด"><Icon name="x" size={22} /></button></div>
      {!data?.history.length ? <div className="stock-detail-empty"><Icon name="wallet" size={30} /><p>ยังไม่มีข้อมูลเงินปันผลย้อนหลัง</p><span>ข้อมูลส่วนนี้จะเชื่อมต่อ API จริงภายหลัง</span></div> : data.history.map((row) => <DataRow key={row.exDate} label={`XD ${row.exDate}`} value={`${formatMoney(row.amount, 'USD')} USD · จ่าย ${row.paymentDate}`} />)}
    </section>
  </div>;
}

function mockDetail(asset: MockAsset): Detail {
  const change = asset.price * asset.changePct / 100;
  return {
    stock: { symbol: asset.symbol, name: asset.name, exchange: 'ข้อมูลจำลอง', market: asset.category === 'us' ? 'US' : asset.category.toUpperCase(), currency: asset.currency },
    quote: { symbol: asset.symbol, price: asset.price, prevClose: asset.price - change, change, changePct: asset.changePct, updatedAt: new Date().toISOString() },
    fundamentals: getMockFundamentals(asset), pe_ratio: null, is_market_open: false, currency: asset.currency, mock: true,
  };
}

export default function StockPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = params.symbol.toUpperCase();
  const [debugEnabled, setDebugEnabled] = useState(false);
  const mock = mockAssets.find((asset) => asset.symbol === symbol);
  const queryClient = useQueryClient();
  const [range, setRange] = useState<Range>('1D');
  const [scrolled, setScrolled] = useState(false);
  const [toast, setToast] = useState('');
  const [tradeMenuOpen, setTradeMenuOpen] = useState(false);
  const [expandedHolding, setExpandedHolding] = useState(false);
  const [dividendSheetOpen, setDividendSheetOpen] = useState(false);
  const [activeOverviewCard, setActiveOverviewCard] = useState(0);
  const portfolioTriggerRef = useRef<HTMLDivElement>(null);
  const overviewGridRef = useRef<HTMLDivElement>(null);
  const [loadPortfolio, setLoadPortfolio] = useState(false);
  const [chartHeight, setChartHeight] = useState(220);

  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)');
    const narrow = window.matchMedia('(max-width: 380px)');
    const updateChartHeight = () => setChartHeight(wide.matches ? 250 : narrow.matches ? 205 : 220);
    updateChartHeight();
    wide.addEventListener('change', updateChartHeight);
    narrow.addEventListener('change', updateChartHeight);
    return () => {
      wide.removeEventListener('change', updateChartHeight);
      narrow.removeEventListener('change', updateChartHeight);
    };
  }, []);

  const detail = useQuery<Detail>({ queryKey: ['stock', symbol], queryFn: async () => {
    if (mock) return mockDetail(mock);
    const response = await fetch(`/api/stock/${symbol}`, { cache: 'no-store' });
    const body = await response.json() as { data?: Detail; error?: { message: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? 'โหลดข้อมูลไม่สำเร็จ');
    return body.data;
  }, staleTime: 15_000, refetchOnMount: 'always', retry: 1, retryDelay: (attempt) => Math.min(2_000 * 2 ** attempt, 10_000), refetchInterval: (query) => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return false;
    const data = query.state.data as Detail | undefined;
    return data?.market_status?.phase === 'closed' ? 5 * 60_000 : 60_000;
  }, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
  const item = detail.data;
  const candles = useQuery<Candle[]>({ queryKey: ['candles', symbol, range], queryFn: async () => {
    if (mock) return [];
    const response = await fetch(`/api/candles?symbol=${symbol}&range=${range}`, { cache: 'no-store' });
    const body = await response.json() as { data?: Candle[]; error?: { message: string } };
    if (!response.ok) throw new Error(body.error?.message ?? 'โหลดกราฟไม่สำเร็จ');
    return body.data ?? [];
  }, enabled: !mock, staleTime: 5 * 60_000, refetchOnMount: 'always', retry: 1, retryDelay: (attempt) => Math.min(2_000 * 2 ** attempt, 10_000), refetchInterval: (query) => {
    if (range !== '1D' || typeof document === 'undefined' || document.visibilityState !== 'visible') return false;
    const current = query.state.data as Candle[] | undefined;
    return detail.data?.market_status?.phase === 'closed' ? 5 * 60_000 : current ? 5 * 60_000 : false;
  }, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
  const portfolio = useQuery<{ holdings: Holding[] }>({ queryKey: ['portfolio'], queryFn: async () => {
    const response = await fetch('/api/portfolio');
    const body = await response.json() as { data?: { holdings: Holding[] }; error?: { message: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? 'โหลดพอร์ตไม่สำเร็จ');
    return body.data;
  }, enabled: loadPortfolio, staleTime: 60_000, retry: false });
  const limitOrders = useQuery<LimitOrder[]>({ queryKey: ['limit-orders'], queryFn: async () => {
    const response = await fetch('/api/limit-orders');
    if (response.status === 401) return [];
    const body = await response.json() as { data?: LimitOrder[]; error?: { message: string } };
    if (!response.ok) throw new Error(body.error?.message ?? 'โหลดคำสั่งล่วงหน้าไม่สำเร็จ');
    return body.data ?? [];
  }, enabled: Boolean(loadPortfolio && expandedHolding && portfolio.data?.holdings.some((entry) => entry.symbol === symbol)), staleTime: 60_000, retry: false });
  const logoFallback = useQuery<string | null>({
    queryKey: ['stock-logo-fallback', symbol],
    queryFn: async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(symbol)}&market=US`);
      const body = await response.json() as { data?: SearchMatch[] };
      return body.data?.find((match) => match.symbol === symbol)?.logo_url ?? null;
    },
    enabled: !mock && Boolean(detail.data && !detail.data.stock.logo_url),
    staleTime: 86_400_000,
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 120);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    const target = portfolioTriggerRef.current;
    if (!target || loadPortfolio) return;
    if (typeof IntersectionObserver === 'undefined') {
      setLoadPortfolio(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setLoadPortfolio(true);
        observer.disconnect();
      }
    }, { rootMargin: '350px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [item, loadPortfolio]);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') setDebugEnabled(new URLSearchParams(window.location.search).get('debug') === '1');
  }, []);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void queryClient.invalidateQueries({ queryKey: ['stock', symbol] });
      if (range === '1D') void queryClient.invalidateQueries({ queryKey: ['candles', symbol, range] });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [queryClient, range, symbol]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const currency = item?.currency ?? item?.stock.currency ?? 'USD';
  const holding = portfolio.data?.holdings.find((entry) => entry.symbol === symbol);
  const marketCode = item?.stock.market ?? getAssetMetadata(symbol).market;
  const marketTimeZone = marketCode === 'TH' ? 'Asia/Bangkok' : 'America/New_York';
  const marketStatus = item?.market_status ? item.market_status : getMarketStatus(marketCode);
  const chartCandles = useMemo(() => {
    if (!candles.data?.length) return [];
    const session = range === '1D' ? filterCandlesToLatestSession(candles.data, marketTimeZone) : candles.data;
    if (range === '1D' && marketStatus.phase === 'open' && session.length) {
      const latestDate = zonedDateKey(session[session.length - 1].t * 1_000, marketTimeZone);
      if (latestDate !== marketStatus.marketDate) return [];
    }
    return session;
  }, [candles.data, marketStatus.marketDate, marketStatus.phase, marketTimeZone, range]);
  const rangeBasePrice = item ? range === '1D' ? item.quote.prevClose : chartCandles[0]?.c : undefined;
  const rangeChange = item && rangeBasePrice ? getChangePresentation(item.quote.price, rangeBasePrice) : null;
  const positive = rangeChange === null || rangeChange.direction > 0;
  const chartLineColor = rangeChange?.direction === 0 ? '#9A9AA0' : positive ? '#2EE66B' : '#FF5C8A';
  const chartTrendClass = rangeChange?.direction === 0 ? 'is-neutral' : positive ? 'is-positive' : 'is-negative';
  const quoteTimeMs = item ? Date.parse(item.quote.providerUpdatedAt ?? item.quote.updatedAt) : Number.NaN;
  const quoteDateLabel = Number.isFinite(quoteTimeMs) ? formatThaiDate(quoteTimeMs) : '—';
  const quoteAgeMs = Number.isFinite(quoteTimeMs) ? Math.max(0, Date.now() - quoteTimeMs) : Number.POSITIVE_INFINITY;
  const staleAfterThreshold = marketStatus.phase === 'open' && quoteAgeMs > 20 * 60_000;
  const quoteConnectionFailed = detail.isError || item?.quote.refreshFailed === true;
  const quoteWarning = quoteConnectionFailed
    ? `เชื่อมต่อข้อมูลไม่ได้ ใช้ราคาเมื่อ ${item ? formatThaiDateTime(Date.parse(item.quote.providerUpdatedAt ?? item.quote.updatedAt)) : '—'}`
    : staleAfterThreshold
      ? 'ข้อมูลอาจล่าช้า'
      : item?.quote.stale ? 'กำลังอัปเดตราคา' : '';
  const tags = useMemo(() => {
    if (!item) return [];
    const result: Array<{ icon: 'briefcase' | 'chart' | 'globe' | 'wallet'; label: string }> = [{ icon: 'briefcase', label: getAssetTypeLabel(mock) }];
    if (item.fundamentals.marketCap !== undefined) result.push({ icon: 'chart', label: item.fundamentals.marketCap >= 200e9 ? 'ขนาดใหญ่มาก' : 'ขนาดใหญ่' });
    if (item.fundamentals.sector) result.push({ icon: 'globe', label: item.fundamentals.sector });
    if ((item.fundamentals.dividendYield ?? 0) > 0) result.push({ icon: 'wallet', label: 'จ่ายปันผล' });
    return result;
  }, [item, mock]);
  const dividends = getDividends(symbol);
  const showDividends = !mock && item?.fundamentals.dividendYield !== undefined;
  const pendingOrders = (limitOrders.data ?? []).filter((order) => order.symbol === symbol && ['pending', 'processing'].includes(order.status));
  const selectedCurrencyApprox = approximateBaht(item?.quote.price, currency);

  useEffect(() => {
    if (!debugEnabled || !item) return;
    const tradeTimeMs = Date.parse(item.quote.providerUpdatedAt ?? item.quote.updatedAt);
    const latestCandle = chartCandles[chartCandles.length - 1];
    const providerLatestCandle = candles.data?.[candles.data.length - 1];
    const timeZoneLabel = (timestamp: number, timeZone: string) => new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).format(new Date(timestamp));
    const classification = quoteConnectionFailed ? 'cached quote; provider/API refresh failed'
      : staleAfterThreshold ? 'provider timestamp is over 20 minutes old during regular session'
        : marketStatus.phase === 'closed' ? 'last provider-reported quote while market is closed; plan delay entitlement not present in payload'
          : 'provider-reported quote timestamp; plan delay entitlement not present in payload';
    console.groupCollapsed(`[InvestKub market debug] ${symbol}`);
    console.table([{
      provider: 'Finnhub /quote',
      providerRawTimestamp: item.quote.providerTimestampRaw ?? (Number.isFinite(tradeTimeMs) ? Math.floor(tradeTimeMs / 1_000) : null),
      unit: item.quote.providerTimestampUnit ?? (Number.isFinite(tradeTimeMs) ? 'seconds (reconstructed from stored ISO timestamp)' : 'not supplied'),
      UTC: Number.isFinite(tradeTimeMs) ? new Date(tradeTimeMs).toISOString() : '—',
      America_New_York: Number.isFinite(tradeTimeMs) ? timeZoneLabel(tradeTimeMs, 'America/New_York') : '—',
      Asia_Bangkok: Number.isFinite(tradeTimeMs) ? formatThaiDateTime(tradeTimeMs) : '—',
      clientNow: formatThaiDateTime(Date.now()),
      serverNow: item.server_now ?? 'not provided for simulated quote',
      dataAgeSeconds: Number.isFinite(quoteAgeMs) ? Math.round(quoteAgeMs / 1_000) : 'unknown',
      lastChartCandleThailand: latestCandle ? `${formatThaiDateTime(latestCandle.t * 1_000)} (${formatThaiTime(latestCandle.t * 1_000)})` : 'none',
      lastProviderCandleThailand: providerLatestCandle ? `${formatThaiDateTime(providerLatestCandle.t * 1_000)} (${formatThaiTime(providerLatestCandle.t * 1_000)})` : 'none',
      marketPhase: mock ? 'simulated' : marketStatus.phase,
      quoteClassification: mock ? 'simulated quote' : classification,
    }]);
    console.groupEnd();
  }, [candles.data, chartCandles, debugEnabled, item, marketStatus, mock, quoteAgeMs, quoteConnectionFailed, staleAfterThreshold, symbol]);

  async function sharePage() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${symbol} · InvestKub`, url });
      else { await navigator.clipboard.writeText(url); setToast('คัดลอกลิงก์แล้ว'); }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') { await navigator.clipboard.writeText(url); setToast('คัดลอกลิงก์แล้ว'); }
    }
  }

  if (detail.isLoading) return <div className="app-content stock-detail-page"><div className="stock-detail-topbar"><Link href="/explore" className="stock-detail-icon-button" aria-label="ย้อนกลับ"><Icon name="arrowLeft" size={24} /></Link></div><LoadingSection /><LoadingSection /><LoadingSection /></div>;
  if (!item) return <div className="app-content stock-detail-page"><div className="stock-detail-topbar"><Link href="/explore" className="stock-detail-icon-button" aria-label="ย้อนกลับ"><Icon name="arrowLeft" size={24} /></Link></div><ErrorSection message={detail.error instanceof Error ? detail.error.message : 'ไม่พบข้อมูลหุ้น'} /></div>;

  return <div className="app-content stock-detail-page" style={{ paddingBottom: 150 }}>
    <header className={`stock-detail-topbar ${scrolled ? 'is-scrolled' : ''}`}>
      <Link href="/explore" className="stock-detail-icon-button" aria-label="ย้อนกลับ"><Icon name="arrowLeft" size={24} /></Link>
      <div className="stock-detail-topbar-center"><strong>{symbol}</strong><span>{assetMoney(item.quote.price, currency)}</span></div>
      <button className="stock-detail-icon-button" onClick={() => void sharePage()} aria-label="แชร์หุ้น"><Icon name="share" size={22} /></button>
    </header>

    <main>
      <section className="stock-detail-hero">
        <div className="stock-detail-company-row">
          <div className="stock-detail-company"><p>{item.stock.name}</p><div className="stock-detail-symbol-row"><AssetLogo symbol={symbol} logoUrl={item.stock.logo_url ?? logoFallback.data} size={56} className="stock-detail-logo" /><h1>{symbol}</h1></div></div>
          <div className="stock-detail-market-chips"><span className="stock-detail-type-chip">{mock ? getAssetTypeLabel(mock) : 'หุ้นสหรัฐฯ'}</span><span className="stock-detail-market-chip">{item.stock.exchange ?? 'NASDAQ'}</span></div>
        </div>
        <div className="stock-detail-price"><strong>{formatAssetPriceValue(item.quote.price, currency)}</strong><span>{currency}</span>{selectedCurrencyApprox && <small>{selectedCurrencyApprox}</small>}</div>
        <div className="stock-detail-updated-row"><p className="stock-detail-updated">{item.quote.providerUpdatedAt ? 'ซื้อขายล่าสุด ณ:' : 'อัปเดตล่าสุด (เวลาดึงข้อมูล) ณ:'} {formatThaiDateTime(Date.parse(item.quote.providerUpdatedAt ?? item.quote.updatedAt))} <span className="stock-detail-timezone">เวลาไทย</span></p>{quoteWarning && <span className={`stock-detail-stale-badge ${quoteConnectionFailed ? 'is-error' : ''}`} title={staleAfterThreshold ? 'เวลา quote จากผู้ให้บริการเก่ากว่า 20 นาทีในช่วงตลาดปกติ' : quoteConnectionFailed ? 'แสดงราคา cache ล่าสุด เพราะเชื่อมต่อผู้ให้บริการไม่ได้' : 'กำลังขอ quote ล่าสุดจากผู้ให้บริการ'}><Icon name="info" size={14} />{quoteWarning}</span>}</div>
        <div className="stock-detail-market-status"><strong>{mock ? 'ข้อมูลจำลอง' : item.stock.exchange ?? 'ตลาดสหรัฐฯ'}</strong><span className={`stock-detail-market-dot ${marketStatus.phase === 'open' ? 'open' : marketStatus.phase === 'pre' || marketStatus.phase === 'post' ? 'extended' : ''}`} />{mock ? 'ข้อมูลจำลอง' : marketStatus.label}{!mock && formatOpenCountdown(marketStatus.nextOpenAt) && <span className="stock-detail-market-countdown">{formatOpenCountdown(marketStatus.nextOpenAt)}</span>}</div>
        <div className="stock-detail-change-row"><div className={rangeChange ? rangeChange.direction === 0 ? 'muted' : rangeChange.direction > 0 ? 'gain' : 'loss' : 'muted'}>{rangeChange && rangeChange.direction !== 0 && <Icon name={rangeChange.direction > 0 ? 'arrowUp' : 'arrowDown'} size={24} />}<strong>{rangeChange?.text ?? '—'}</strong><span>{rangeLabels[range]}</span></div></div>
      </section>

      <section className={`stock-detail-chart-section ${chartTrendClass}`}>
        {candles.isLoading ? <div className="stock-detail-chart-skeleton skeleton" style={{ height: chartHeight }} /> : candles.isError ? <ErrorSection message={candles.error instanceof Error ? candles.error.message : 'โหลดกราฟไม่สำเร็จ'} /> : chartCandles.length ? <PriceChart candles={chartCandles} currentPrice={item.quote.price} lineColor={chartLineColor} height={chartHeight} currency={currency} range={range} marketTimeZone={marketTimeZone} /> : <div className="stock-detail-no-chart" style={{ height: chartHeight }}>{mock ? 'กราฟจะแสดงเมื่อมีข้อมูลตลาดจริง' : 'ยังไม่มีข้อมูลกราฟช่วงนี้'}</div>}
        <div className="stock-detail-range-tabs" role="tablist" aria-label="ช่วงเวลาของกราฟ">{ranges.map((option) => <button key={option.value} role="tab" aria-selected={range === option.value} disabled={Boolean(mock)} className={range === option.value ? 'active' : ''} onClick={() => setRange(option.value)}>{option.label}</button>)}</div>
      </section>

      {tags.length > 0 && <section className="stock-detail-tag-scroll" aria-label="หมวดหมู่หุ้น">{tags.map((tag) => <div className="stock-detail-tag-card" key={tag.label}><Icon name={tag.icon} size={28} /><strong>{tag.label}</strong>{mock && <small>ข้อมูลจำลอง</small>}</div>)}</section>}

      <section className="stock-detail-section stock-detail-order-book"><SectionHeading title="รายการซื้อขาย" muted="ที่ราคาดีที่สุด" action={<button className="stock-detail-info-button" aria-label="อธิบายรายการซื้อขาย"><Icon name="info" size={16} /></button>} /><div className="stock-detail-order-book-grid"><div><span>ราคาเสนอซื้อ</span><strong className="gain">— USD</strong><small>ปริมาณ —</small></div><div><span>ราคาเสนอขาย</span><strong className="loss">— USD</strong><small>ปริมาณ —</small></div></div></section>

      <div ref={portfolioTriggerRef} className="stock-detail-lazy-trigger" aria-hidden="true" />
      {loadPortfolio && portfolio.isLoading && <section className="stock-detail-section"><LoadingSection /></section>}
      {loadPortfolio && portfolio.isError && <section className="stock-detail-section"><ErrorSection message="โหลดข้อมูลพอร์ตไม่สำเร็จ" /></section>}
      {holding && <section className="stock-detail-section"><SectionHeading title="การลงทุนของฉัน" action={<Link href={`/orders?symbol=${symbol}`} className="stock-detail-history-link"><Icon name="clock" size={16} />ประวัติรายการ</Link>} /><div className="stock-detail-holding-card"><div className="stock-detail-holding-head"><span className="stock-detail-holding-icon"><Icon name="briefcase" size={22} /></span><div><strong>{mock ? getAssetTypeLabel(mock) : 'พอร์ตหุ้นสหรัฐอเมริกา'}</strong><span>{formatNumber(holding.quantity)} {getAssetMetadata(symbol).unit}</span></div></div><div className="stock-detail-holding-columns"><div><span>มูลค่าล่าสุด</span><strong>{accountMoneyAsAsset(holding.market_value, currency)}</strong><em className={holding.unrealized_pl >= 0 ? 'gain' : 'loss'}><Icon name={holding.unrealized_pl >= 0 ? 'arrowUp' : 'arrowDown'} size={14} />{formatPercent(Math.abs(holding.unrealized_pl_pct))}</em></div><div><span>ราคาต้นทุน</span><strong>{accountMoneyAsAsset(holding.avg_cost, currency)}</strong><small>ต่อหน่วย</small></div></div><button className="stock-detail-expand-button" onClick={() => setExpandedHolding((value) => !value)} aria-label={expandedHolding ? 'ย่อรายละเอียดการลงทุน' : 'ขยายรายละเอียดการลงทุน'}><Icon name="chevronDown" size={20} className={expandedHolding ? 'rotated' : ''} /></button>{expandedHolding && <div className="stock-detail-holding-details"><DataRow label="มูลค่าต้นทุนรวม" value={accountMoneyAsAsset(holding.cost_basis, currency)} /><DataRow label="กำไร/ขาดทุนเป็นเงิน" value={<span className={holding.unrealized_pl >= 0 ? 'gain' : 'loss'}>{accountMoneyAsAsset(holding.unrealized_pl, currency)}</span>} />{limitOrders.isLoading ? <LoadingSection /> : limitOrders.isError ? <ErrorSection message="โหลดคำสั่งที่รอดำเนินการไม่สำเร็จ" /> : pendingOrders.length ? pendingOrders.map((order) => <DataRow key={order.id} label={`${order.side === 'buy' ? 'ซื้อ' : 'ขาย'} ${formatNumber(order.quantity)} ${getAssetMetadata(symbol).unit}`} value={<span>{formatAssetPrice(order.limit_price, currency)} <button className="stock-detail-cancel" onClick={() => void (async () => { if (!window.confirm('ยืนยันยกเลิกคำสั่งล่วงหน้า?')) return; await fetch(`/api/limit-orders?id=${order.id}`, { method: 'DELETE' }); await queryClient.invalidateQueries({ queryKey: ['limit-orders'] }); })()}>ยกเลิก</button></span>} />) : <p className="stock-detail-no-pending">ไม่มีคำสั่งที่รอดำเนินการ</p>}</div>}</div></section>}

      <section className="stock-detail-section stock-detail-overview-section"><SectionHeading title="ภาพรวม" muted={`ข้อมูล ณ วันที่ ${quoteDateLabel}`} /><div className="stock-detail-range-bars"><RangeBar label="วันทำการล่าสุด" low={item.quote.low} high={item.quote.high} price={item.quote.price} currency={currency} /><RangeBar label="52 สัปดาห์ล่าสุด" low={item.fundamentals.week52Low} high={item.fundamentals.week52High} price={item.quote.price} currency={currency} /></div><div ref={overviewGridRef} className="stock-detail-overview-grid" aria-label="ข้อมูลภาพรวม" onScroll={(event) => { const step = event.currentTarget.clientWidth + 12; setActiveOverviewCard(Math.min(1, Math.round(event.currentTarget.scrollLeft / step))); }}>
        <article className="stock-detail-overview-card"><h3>ตลาด <small>{mock ? 'ข้อมูลจำลอง' : quoteDateLabel}</small></h3><DataRow label="ราคาเปิด" value={assetMoney(item.quote.open, currency)} /><DataRow label="ราคาปิด" value={assetMoney(item.quote.prevClose, currency)} /><DataRow label="มูลค่าตามราคาตลาด" value={compactValue(item.fundamentals.marketCap, currency)} /><DataRow label="ปริมาณการซื้อขายเฉลี่ยต่อวัน (30 วัน)" value="—" /></article>
        <article className="stock-detail-overview-card"><h3>ข้อมูลและสัดส่วนการเงิน <button className="stock-detail-info-button" aria-label="อธิบายข้อมูลการเงิน"><Icon name="info" size={16} /></button><small>{mock ? 'ข้อมูลจำลอง' : 'ข้อมูลจาก fundamentals'}</small></h3><DataRow label="การเติบโตยอดขาย" value="—" /><DataRow label="EPS" value={assetMoney(item.fundamentals.epsTtm, currency)} /><DataRow label="P/E" value={item.pe_ratio === null ? '—' : `${formatNumber(item.pe_ratio, 2)} เท่า`} /><DataRow label="P/S" value="—" /></article>
      </div><div className="stock-detail-overview-pagination" aria-label="เลือกข้อมูลภาพรวม">{[0, 1].map((index) => <button key={index} type="button" className={activeOverviewCard === index ? 'is-active' : ''} aria-label={index === 0 ? 'ดูข้อมูลตลาด' : 'ดูข้อมูลการเงิน'} aria-current={activeOverviewCard === index ? 'true' : undefined} onClick={() => { const grid = overviewGridRef.current; if (grid) grid.scrollTo({ left: index * (grid.clientWidth + 12), behavior: 'smooth' }); }}><span /></button>)}</div></section>

      {showDividends && <section className="stock-detail-section"><SectionHeading title="เงินปันผล" action={<button className="stock-detail-history-link" onClick={() => setDividendSheetOpen(true)}><Icon name="chart" size={16} />ข้อมูลการจ่ายเงินปันผล</button>} /><div className="stock-detail-dividend-card"><div className="stock-detail-dividend-gradient" /><div className="stock-detail-dividend-columns"><div><span>อัตราเงินปันผล</span><strong>{formatNumber(item.fundamentals.dividendYield, 2)}%</strong><small>ของมูลค่าหุ้นที่ซื้อ (ต่อปี)</small></div><div><span>เงินปันผลต่อปี</span><strong>—</strong><small>เงินปันผลย้อนหลัง 12 เดือน (ต่อหุ้น)</small></div></div><DataRow label="ความถี่ในการจ่ายเงินปันผล" value="—" /></div><DividendSheet open={dividendSheetOpen} data={dividends} onClose={() => setDividendSheetOpen(false)} /></section>}

      <section className="stock-detail-section"><SectionHeading title="ข้อมูลทั่วไป" /><div className="stock-detail-general-card"><DataRow label={<span><Icon name="info" size={15} />ตลาดหลักทรัพย์</span>} value={<span className="stock-detail-exchange"><Icon name="flag" size={16} />{item.stock.exchange ?? 'NASDAQ'}</span>} /><DataRow label="กลุ่มอุตสาหกรรม" value={item.fundamentals.sector ?? '—'} /><DataRow label="อุตสาหกรรม" value="—" /></div><a className="stock-detail-report-link" href={`mailto:support@papertrade.local?subject=แจ้งปัญหา ${symbol}`}>แจ้งปัญหาการใช้งาน</a></section>
    </main>

    <div className={`stock-detail-bottom-bar ${tradeMenuOpen ? 'is-open' : ''}`}>
      {tradeMenuOpen && <div id="stock-detail-trade-options" className="stock-detail-trade-options"><Link href={`/stock/${symbol}/trade?side=buy`} className="stock-detail-trade-option buy"><strong>ซื้อ</strong><span>{item.mock ? 'Paper Trading' : `ซื้อ${getAssetTypeLabel(mock)}`}</span></Link><Link href={`/stock/${symbol}/trade?side=sell`} className="stock-detail-trade-option sell"><strong>ขาย</strong><span>{item.mock ? 'Paper Trading' : `ขาย${getAssetTypeLabel(mock)}`}</span></Link></div>}
      <button className="stock-detail-trade-button" onClick={() => setTradeMenuOpen((open) => !open)} aria-expanded={tradeMenuOpen} aria-controls="stock-detail-trade-options"><strong>{tradeMenuOpen ? 'ปิด' : 'ซื้อ-ขาย'}</strong><span>{item.mock ? 'ราคาจำลองสำหรับ Paper Trading' : tradeMenuOpen ? 'เลือกประเภทคำสั่ง' : 'เริ่มต้นง่ายๆ ด้วย $1 ก็ลงทุนได้!'}<i /></span></button>
    </div>
    {toast && <div className="stock-detail-toast" role="status">{toast}</div>}
  </div>;
}
