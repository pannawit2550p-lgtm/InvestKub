'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { t } from '@/lib/i18n';
import Icon, { type IconName } from './Icon';

const items = [
  { href: '/', icon: 'home' as IconName, activeIcon: 'homeFilled' as IconName, label: 'home' as const },
  { href: '/explore', icon: 'chart' as IconName, activeIcon: 'chartFilled' as IconName, label: 'invest' as const },
  { href: '/orders', icon: 'receipt' as IconName, activeIcon: 'receiptFilled' as IconName, label: 'orders' as const },
  { href: '/rank', icon: 'trophy' as IconName, activeIcon: 'trophyFilled' as IconName, label: 'rank' as const },
  { href: '/learn', icon: 'book' as IconName, activeIcon: 'bookFilled' as IconName, label: 'learn' as const },
  { href: '/settings', icon: 'user' as IconName, activeIcon: 'userFilled' as IconName, label: 'me' as const },
];

interface LimitOrderStatus { status: string; }

async function loadLimitOrderStatuses(): Promise<LimitOrderStatus[]> {
  const response = await fetch('/api/limit-orders');
  if (response.status === 401) return [];
  const body = await response.json() as { data?: LimitOrderStatus[]; error?: { message: string } };
  if (!response.ok) throw new Error(body.error?.message ?? 'โหลดสถานะคำสั่งไม่สำเร็จ');
  return body.data ?? [];
}

export default function BottomNav() {
  const pathname = usePathname();
  const limitOrders = useQuery({
    queryKey: ['limit-orders'],
    queryFn: loadLimitOrderStatuses,
    retry: false,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const orders = query.state.data as LimitOrderStatus[] | undefined;
      const hasPending = orders?.some((order) => ['pending', 'processing'].includes(order.status)) ?? false;
      return hasPending ? 60_000 : 5 * 60_000;
    },
    refetchIntervalInBackground: false,
  });
  const hasPending = limitOrders.data?.some((order) => ['pending', 'processing'].includes(order.status)) ?? false;
  return <nav className="bottom-nav" aria-label="เมนูหลัก"><div className="bottom-nav-inner">{items.map((item) => { const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)); return <Link key={item.href} href={item.href} className={`nav-item ${active ? 'active' : ''}`} aria-label={t(item.label)}><span className="nav-icon-wrap"><Icon name={active ? item.activeIcon : item.icon} size={28} />{item.href === '/' && hasPending && <span className="nav-dot" />}</span><span>{t(item.label)}</span></Link>; })}</div></nav>;
}
