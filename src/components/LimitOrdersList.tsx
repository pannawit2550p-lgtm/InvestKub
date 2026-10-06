'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatStockPrice } from '@/lib/currency';
import { formatNumber } from '@/lib/format';

type LimitOrderStatus = 'pending' | 'processing' | 'filled' | 'expired' | 'failed' | 'cancelled';
interface LimitOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  limit_price: number;
  status: LimitOrderStatus;
  market_opens_at: string;
  expires_at: string;
  execution_price?: number | null;
  failure_message?: string | null;
  created_at: string;
}

const statusText: Record<LimitOrderStatus, string> = {
  pending: 'รอเปิดตลาด',
  processing: 'กำลังตรวจราคา',
  filled: 'จับคู่สำเร็จ',
  expired: 'จับคู่ไม่สำเร็จ',
  failed: 'จับคู่ไม่สำเร็จ',
  cancelled: 'ยกเลิกแล้ว',
};

async function loadLimitOrders(): Promise<LimitOrder[]> {
  const response = await fetch('/api/limit-orders');
  const body = await response.json() as { data?: LimitOrder[]; error?: { message: string } };
  if (!response.ok || !body.data) throw new Error(body.error?.message ?? 'โหลดรายการคำสั่งไม่สำเร็จ');
  return body.data;
}

export default function LimitOrdersList({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['limit-orders'], queryFn: loadLimitOrders });
  async function cancel(id: string) {
    if (!window.confirm('ยืนยันยกเลิกคำสั่งล่วงหน้า?')) return;
    await fetch(`/api/limit-orders?id=${id}`, { method: 'DELETE' });
    await queryClient.invalidateQueries({ queryKey: ['limit-orders'] });
  }
  if (query.isLoading) return <div className="card"><div className="skeleton" /></div>;
  if (query.isError) return <div className="card"><p className="error-text">{query.error instanceof Error ? query.error.message : 'โหลดรายการคำสั่งไม่สำเร็จ'}</p></div>;
  if (!query.data?.length) return <div className="card center muted">ยังไม่มีคำสั่งล่วงหน้า</div>;
  const visibleOrders = compact ? query.data.slice(0, 2) : query.data;
  return <div className="card">{visibleOrders.map((order) => <div className="limit-order-row" key={order.id}><Link href={`/stock/${order.symbol}`} className="limit-order-symbol-badge" aria-label={`เปิด ${order.symbol}`}>{order.symbol.slice(0, 1)}</Link><div className="limit-order-main"><div><strong>{order.side === 'buy' ? 'ซื้อ' : 'ขาย'} {order.symbol}</strong> <span className={`order-status status-${order.status}`}>{statusText[order.status]}</span></div><div className="limit-order-stock-detail">{formatNumber(Number(order.quantity))} หุ้น · Limit {formatStockPrice(Number(order.limit_price))}</div>{order.status === 'filled' && <div className="tiny gain">จับคู่ที่ {formatStockPrice(Number(order.execution_price))}</div>}{(order.status === 'expired' || order.status === 'failed') && <div className="tiny loss">{order.failure_message ?? 'ราคาไม่เข้าเงื่อนไขภายในเวลาที่กำหนด'}</div>}{order.status === 'pending' && <div className="tiny muted">หมดอายุ {new Date(order.expires_at).toLocaleString('th-TH')}</div>}</div>{order.status === 'pending' && <button className="outline-button" onClick={() => cancel(order.id)}>ยกเลิก</button>}</div>)}</div>;
}
