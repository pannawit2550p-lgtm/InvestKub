'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatAssetPrice, toAccountCurrency } from '@/lib/currency';
import { formatNumber } from '@/lib/format';
import { getAssetMetadata } from '@/lib/market/mockAssets';
import { t } from '@/lib/i18n';
import Icon from '@/components/Icon';
import OrderTradeBreakdown from '@/components/OrderTradeBreakdown';
import { getOrderCashSummary, type TradeSettlement } from '@/lib/orders/trade-summary';
import { ORDER_HISTORY_PAGE_SIZE, type HistoryCursor } from '@/lib/orders/history-pagination';

type Tab = 'all' | 'pending' | 'completed' | 'cancelled';
type LimitStatus = 'pending' | 'processing' | 'filled' | 'expired' | 'failed' | 'cancelled';
interface LimitOrder { id: string; symbol: string; side: 'buy' | 'sell'; quantity: number; limit_price: number; status: LimitStatus; execution_price?: number | null; failure_message?: string | null; created_at: string; expires_at: string; settlement?: TradeSettlement; }
interface MarketOrder { id: string; kind: 'trade'; symbol: string; side: 'buy' | 'sell'; quantity: number; price: number; quoted_price: number; fee: number; realized_pl: number; currency?: string; unit?: string; created_at: string; trade_value?: number; cash_total?: number; }
interface LessonReward { id: string; kind: 'lesson_reward'; lessonId: string; title: string; amount: number; amountTHB: number; created_at: string; }
type HistoryItem = MarketOrder | LessonReward;
interface HistoryPage { items: HistoryItem[]; nextCursor: HistoryCursor | null; }

async function load<T>(url: string, fallback: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const body = await response.json() as { data?: T; error?: { message: string } }; if (!response.ok || body.data === undefined) throw new Error(body.error?.message ?? fallback); return body.data; }
const limitStatusText: Record<LimitStatus, string> = { pending: 'รอเปิดตลาด', processing: 'กำลังตรวจราคา', filled: 'จับคู่สำเร็จ', expired: 'จับคู่ไม่สำเร็จ', failed: 'จับคู่ไม่สำเร็จ', cancelled: 'ยกเลิกแล้ว' };

function marketSettlement(order: MarketOrder): TradeSettlement {
  const currency = order.currency ?? getAssetMetadata(order.symbol).currency;
  const fallback = getOrderCashSummary(order.side, Number(order.quantity), toAccountCurrency(Number(order.price), currency), Number(order.fee));
  return { side: order.side, quantity: Number(order.quantity), price: Number(order.price), currency, unit: order.unit ?? 'หุ้น', fee: Number(order.fee),
    trade_value: order.trade_value ?? fallback.trade_value, cash_total: order.cash_total ?? fallback.cash_total };
}

export default function OrdersPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [filterReady, setFilterReady] = useState(false);
  const [visibleLimitCount, setVisibleLimitCount] = useState(ORDER_HISTORY_PAGE_SIZE);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState('');
  const queryClient = useQueryClient();
  useEffect(() => { setSymbolFilter(new URLSearchParams(window.location.search).get('symbol')?.toUpperCase() ?? ''); setFilterReady(true); }, []);
  useEffect(() => { setVisibleLimitCount(ORDER_HISTORY_PAGE_SIZE); }, [tab, symbolFilter]);
  const showMarket = tab === 'all' || tab === 'completed';
  const limits = useQuery({ queryKey: ['limit-orders'], queryFn: ({ signal }) => load<LimitOrder[]>('/api/limit-orders', 'โหลดคำสั่งล่วงหน้าไม่สำเร็จ', { signal }), staleTime: 30_000, gcTime: 15 * 60_000 });
  const market = useInfiniteQuery({
    queryKey: ['orders', symbolFilter],
    initialPageParam: null as HistoryCursor | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (symbolFilter) params.set('symbol', symbolFilter);
      if (pageParam) {
        params.set('before', pageParam.before);
        params.set('tradeSkip', String(pageParam.tradeSkip));
        params.set('rewardSkip', String(pageParam.rewardSkip));
      }
      return load<HistoryPage>(`/api/orders?${params}`, 'โหลดประวัติรายการไม่สำเร็จ', { signal });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: filterReady && showMarket,
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
  });
  async function cancel(id: string) {
    if (cancellingId || !window.confirm('ยืนยันยกเลิกคำสั่งล่วงหน้า?')) return;
    setCancellingId(id);
    setCancelError('');
    try {
      const cancelled = await load<LimitOrder>(`/api/limit-orders?id=${id}`, 'ยกเลิกคำสั่งไม่สำเร็จ', { method: 'DELETE' });
      queryClient.setQueryData<LimitOrder[]>(['limit-orders'], (orders) => orders?.map((order) => order.id === id ? cancelled : order));
      void queryClient.invalidateQueries({ queryKey: ['limit-orders'] });
    } catch (error) { setCancelError(error instanceof Error ? error.message : 'ยกเลิกคำสั่งไม่สำเร็จ'); }
    finally { setCancellingId(null); }
  }
  const filteredLimits = (limits.data ?? []).filter((order) => !symbolFilter || order.symbol === symbolFilter);
  const history = [...new Map((market.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item])).values()];
  const filteredMarket = history.filter((order) => order.kind === 'lesson_reward' ? !symbolFilter : !symbolFilter || order.symbol === symbolFilter);
  const pending = filteredLimits.filter((order) => ['pending', 'processing'].includes(order.status));
  const completed = filteredLimits.filter((order) => order.status === 'filled');
  const cancelled = filteredLimits.filter((order) => ['cancelled', 'expired', 'failed'].includes(order.status));
  const visibleLimits = tab === 'pending' ? pending : tab === 'completed' ? completed : tab === 'cancelled' ? cancelled : filteredLimits;
  const shownLimits = visibleLimits.slice(0, visibleLimitCount);

  return <div className="app-content">
    <div className="page-header"><div><p className="page-kicker">InvestKub</p><h1 className="page-title">{t('orders')}</h1>{symbolFilter && <p className="tiny muted">กรองเฉพาะ {symbolFilter}</p>}</div><Link href="/explore" className="primary-button"><Icon name="chart" size={18} />{t('goInvest')}</Link></div>
    <div className="chip-row">{(['all', 'pending', 'completed', 'cancelled'] as Tab[]).map((value) => <button key={value} className={`chip ${tab === value ? 'active' : ''}`} onClick={() => setTab(value)}>{t(value === 'all' ? 'all' : value)}</button>)}</div>
    {limits.isError && <p className="error-text section">{limits.error instanceof Error ? limits.error.message : 'โหลดคำสั่งล่วงหน้าไม่สำเร็จ'} · กรุณารัน migration 0002 ใน Supabase</p>}
    {cancelError && <p className="error-text section" role="alert">{cancelError}</p>}
    {showMarket && market.isError && <p className="error-text section" role="alert">{market.error instanceof Error ? market.error.message : 'โหลดประวัติรายการไม่สำเร็จ'} <button className="text-link" onClick={() => void (market.isFetchNextPageError ? market.fetchNextPage() : market.refetch())}>ลองอีกครั้ง</button></p>}
    <>
      <section className="section">
        <div className="section-heading"><h2>คำสั่งล่วงหน้า</h2><span className="tiny muted">{visibleLimits.length} รายการ</span></div>
        {limits.isLoading ? <div className="card stack"><div className="skeleton" /><div className="skeleton" /></div> : visibleLimits.length ? <div className="stack">{shownLimits.map((order) => { const metadata = getAssetMetadata(order.symbol); return <article className={`card order-card ${['pending', 'processing'].includes(order.status) ? '' : 'is-final'} ${['filled', 'cancelled'].includes(order.status) ? 'is-muted' : ''}`} key={order.id}>
          <div className="order-card-top"><div><span className={order.side === 'buy' ? 'order-side-buy' : 'order-side-sell'}><strong>{order.side === 'buy' ? 'ซื้อ' : 'ขาย'}</strong></span> <Link href={`/stock/${order.symbol}`}><strong>{order.symbol}</strong></Link></div><span className={`order-status status-${order.status}`}>{limitStatusText[order.status]}</span></div>
          <div className="order-meta"><span>{formatNumber(Number(order.quantity))} {metadata.unit} · Limit {formatAssetPrice(Number(order.limit_price), metadata.currency)}</span><span>{new Date(order.created_at).toLocaleString('th-TH')}</span>{order.status === 'filled' && <span className="gain">จับคู่ที่ {formatAssetPrice(Number(order.execution_price), metadata.currency)}</span>}{['expired', 'failed'].includes(order.status) && <span className="loss">{order.failure_message ?? 'ราคาไม่เข้าเงื่อนไข'}</span>}</div>
          {order.status === 'filled' && order.settlement && <OrderTradeBreakdown {...order.settlement} />}
          {order.status === 'pending' && <button className="outline-button" disabled={cancellingId !== null} onClick={() => void cancel(order.id)}>{cancellingId === order.id ? 'กำลังยกเลิก…' : 'ยกเลิกคำสั่ง'}</button>}
        </article>; })}</div> : <div className="card empty-card"><p>{t('noOrders')}</p>{tab !== 'pending' && <Link className="primary-button" href="/explore">{t('goInvest')}</Link>}</div>}
        {visibleLimitCount < visibleLimits.length && <button className="load-more-button" onClick={() => setVisibleLimitCount((count) => count + ORDER_HISTORY_PAGE_SIZE)}>ดูเพิ่ม <Icon name="chevronDown" size={18} /></button>}
      </section>
      {showMarket && <section className="section">
        <div className="section-heading"><h2>รายการที่สำเร็จ</h2><span className="tiny muted">{filteredMarket.length} รายการ</span></div>
        {market.isLoading || !filterReady ? <div className="card stack"><div className="skeleton" /><div className="skeleton" /></div> : filteredMarket.length ? <div className="stack">{filteredMarket.map((order) => order.kind === 'lesson_reward' ? <article className="card order-card lesson-reward-order is-final is-muted" key={order.id}>
          <div className="order-card-top"><div className="lesson-reward-order-label"><Icon name="coins" size={19} /><strong>รางวัลบทเรียน</strong></div><span className="order-status status-filled">รับแล้ว</span></div>
          <div className="lesson-reward-order-amount">รางวัลจากบทเรียน: {order.title} <strong>+{formatNumber(order.amountTHB, 0)} บาท</strong></div>
          <div className="order-meta"><span>{new Date(order.created_at).toLocaleString('th-TH')}</span><span className="gain">เงินสดเพิ่มขึ้น</span></div>
        </article> : <article className="card order-card is-final is-muted" key={order.id}>
          <div className="order-card-top"><div><span className={order.side === 'buy' ? 'order-side-buy' : 'order-side-sell'}><strong>{order.side === 'buy' ? 'ซื้อ' : 'ขาย'}</strong></span> <strong>{order.symbol}</strong></div><span className="order-status status-filled">สำเร็จ</span></div>
          <div className="order-meta"><span>{new Date(order.created_at).toLocaleString('th-TH')}</span></div>
          <OrderTradeBreakdown {...marketSettlement(order)} />
        </article>)}</div> : <div className="card empty-card"><p>{t('noOrders')}</p><Link className="primary-button" href="/explore">{t('goInvest')}</Link></div>}
        {market.hasNextPage && <button className="load-more-button" disabled={market.isFetching} onClick={() => void market.fetchNextPage()}>{market.isFetchingNextPage ? 'กำลังโหลด…' : 'ดูเพิ่ม'} <Icon name="chevronDown" size={18} /></button>}
      </section>}
    </>
  </div>;
}
