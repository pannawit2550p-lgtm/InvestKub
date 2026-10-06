'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import AssetLogo from '@/components/AssetLogo';
import Avatar from '@/components/Avatar';
import Icon from '@/components/Icon';
import { formatNumber, formatPercent } from '@/lib/format';
import { formatBaht } from '@/lib/currency';
import { t } from '@/lib/i18n';
import type { ProfileAvatarId, ProfileAvatarType } from '@/lib/profile/avatars';

interface Allocation {
  key: string;
  kind: 'asset' | 'other' | 'cash';
  symbol?: string;
  name: string;
  logo_url?: string | null;
  percent: number;
  less_than_one: boolean;
}

interface PublicProfile {
  public_id: string;
  display_name: string;
  session_started_at: string;
  portfolio_value: number;
  total_pl: number;
  total_pl_pct: number;
  starting_balance: number;
  reward_total: number;
  holdings_count: number;
  rank: number;
  viewer_is_owner: boolean;
  cash_percent: number;
  allocations: Allocation[];
  avatar_type?: ProfileAvatarType;
  avatar_character?: ProfileAvatarId | null;
  avatar_url?: string | null;
}

interface LeaderboardProfileModalProps {
  publicId: string;
  onClose: () => void;
}

const ASSET_COLORS = ['#2EE66B', '#A78BFA', '#38BDF8', '#FACC15', '#F472B6', '#FB923C', '#5EEAD4', '#60A5FA'];
const COLOR_GOLD = '#F5B301';
const COLOR_SILVER = '#C7CBD6';
const COLOR_BRONZE = '#D98A4E';
const CIRCUMFERENCE = 2 * Math.PI * 74;

function medalColor(rank: number): string | undefined {
  if (rank === 1) return COLOR_GOLD;
  if (rank === 2) return COLOR_SILVER;
  if (rank === 3) return COLOR_BRONZE;
  return undefined;
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}

function allocationName(allocation: Allocation) {
  if (allocation.kind === 'cash') return t('cashAllocation');
  if (allocation.kind === 'other') return t('otherAssets');
  return allocation.symbol ? `${allocation.symbol} · ${allocation.name}` : allocation.name;
}

function AllocationChart({ allocations }: { allocations: Allocation[] }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const colors = useMemo(() => {
    let assetIndex = 0;
    return new Map(allocations.map((allocation) => {
      if (allocation.kind === 'cash') return [allocation.key, '#94A3B8'];
      if (allocation.kind === 'other') return [allocation.key, '#64748B'];
      const color = ASSET_COLORS[assetIndex % ASSET_COLORS.length];
      assetIndex += 1;
      return [allocation.key, color];
    }));
  }, [allocations]);
  const active = allocations.find((item) => item.key === activeKey);
  const chartLabel = allocations.map((item) => `${allocationName(item)} ${item.less_than_one ? '<1' : item.percent}%`).join(', ');
  let offset = 0;

  return (
    <>
      <div className="leader-allocation-chart">
        <svg className="leader-donut" viewBox="0 0 200 200" role="img" aria-label={`${t('portfolioAllocation')}: ${chartLabel}`}>
          {allocations.filter((item) => item.percent > 0).map((item) => {
            const segmentSize = item.percent / 100 * CIRCUMFERENCE;
            const visibleSize = Math.max(0, segmentSize - 2);
            const dashOffset = offset;
            offset += segmentSize;
            return (
              <circle
                key={item.key}
                cx="100"
                cy="100"
                r="74"
                fill="none"
                stroke={colors.get(item.key)}
                strokeWidth="26"
                strokeDasharray={`${visibleSize} ${CIRCUMFERENCE - visibleSize}`}
                strokeDashoffset={-dashOffset}
                transform="rotate(-90 100 100)"
                onMouseEnter={() => setActiveKey(item.key)}
                onMouseLeave={() => setActiveKey(null)}
                onClick={() => setActiveKey(activeKey === item.key ? null : item.key)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
        </svg>
        <div className="leader-donut-center" aria-live="polite">
          <span>{active ? allocationName(active) : t('portfolioAllocation')}</span>
          <strong>{active ? (active.less_than_one ? '<1%' : `${active.percent}%`) : '100%'}</strong>
        </div>
      </div>
      <div className="leader-allocation-legend">
        {allocations.map((allocation) => (
          <button
            key={allocation.key}
            type="button"
            className={`leader-allocation-row${activeKey === allocation.key ? ' is-active' : ''}`}
            onMouseEnter={() => setActiveKey(allocation.key)}
            onMouseLeave={() => setActiveKey(null)}
            onFocus={() => setActiveKey(allocation.key)}
            onBlur={() => setActiveKey(null)}
            onClick={() => setActiveKey(activeKey === allocation.key ? null : allocation.key)}
            aria-label={`${allocationName(allocation)}: ${allocation.less_than_one ? 'น้อยกว่า 1%' : `${allocation.percent}%`}`}
          >
            <span className="leader-allocation-dot" style={{ background: colors.get(allocation.key) }} />
            {allocation.kind === 'asset' && allocation.symbol
              ? <AssetLogo symbol={allocation.symbol} logoUrl={allocation.logo_url} size={32} />
              : allocation.kind === 'cash'
              ? <span className="leader-cash-icon"><Icon name="wallet" size={18} /></span>
                : <span className="leader-other-icon" aria-hidden="true"><Icon name="briefcase" size={16} /></span>}
            <span className="leader-allocation-name">
              <strong>{allocationName(allocation)}</strong>
            </span>
            <strong className="leader-allocation-percent">{allocation.less_than_one ? '<1%' : `${allocation.percent}%`}</strong>
          </button>
        ))}
      </div>
    </>
  );
}

export default function LeaderboardProfileModal({ publicId, onClose }: LeaderboardProfileModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const query = useQuery({
    queryKey: ['public-profile', publicId],
    queryFn: async () => {
      const response = await fetch(`/api/rank/${encodeURIComponent(publicId)}`, { cache: 'no-store' });
      const body = await response.json() as { data?: PublicProfile; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t('profileUnavailable'));
      return body.data;
    },
    retry: false,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [mounted, onClose]);

  if (!mounted || typeof document === 'undefined') return null;
  const profile = query.isError ? null : query.data;
  const rankColor = profile ? medalColor(profile.rank) : undefined;
  const percentClass = profile ? (profile.total_pl_pct > 0 ? 'gain' : profile.total_pl_pct < 0 ? 'loss' : 'muted') : '';

  return createPortal(
      <div className="leader-profile-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div ref={dialogRef} className="leader-profile-modal" role="dialog" aria-modal="true" aria-labelledby="leader-profile-name" tabIndex={-1}>
          <button ref={closeRef} type="button" className="leader-profile-close" aria-label={t('profileClose')} onClick={onClose}><Icon name="x" size={20} /></button>
          <h2 id="leader-profile-name" className="sr-only">{profile?.display_name ?? t('profileUnavailable')}</h2>
          {query.isLoading && <div className="leader-profile-loading"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>}
        {query.isError && <div className="leader-profile-error"><p>{t('profileUnavailable')}</p><button type="button" className="secondary-button" onClick={onClose}>{t('profileClose')}</button></div>}
        {profile && (
          <>
            <header className="leader-profile-header">
              <Avatar name={profile.display_name} id={profile.public_id} size={96} ringColor={profile.viewer_is_owner ? 'var(--accent-purple)' : rankColor} className={profile.viewer_is_owner ? 'is-self' : ''} avatarType={profile.avatar_type} avatarCharacter={profile.avatar_character} avatarUrl={profile.avatar_url} />
              <span className="leader-profile-rank" style={{ color: rankColor ?? 'var(--accent-purple)' }}>{t('profileRank')} #{profile.rank}</span>
              <h2>{profile.display_name}</h2>
              <p>{t('profileStarted')} {formatFullDate(profile.session_started_at)}</p>
              {profile.viewer_is_owner && <span className="leader-profile-self">{t('publicProfileOwn')}</span>}
            </header>
            <section className="leader-profile-summary">
              <span className="tiny muted">{t('profileBalance')}</span>
              <strong className="leader-profile-value">{formatBaht(profile.portfolio_value)}</strong>
              <span className={`leader-profile-return ${percentClass}`}>
                {profile.total_pl_pct > 0 ? '↑ ' : profile.total_pl_pct < 0 ? '↓ ' : '— '}
                {formatPercent(profile.total_pl_pct)} ({formatBaht(profile.total_pl)})
              </span>
              <div className="leader-profile-divider" />
              <div className="leader-profile-summary-row"><span>{t('startingBalance')}</span><strong>{formatBaht(profile.starting_balance)}</strong></div>
              {profile.reward_total > 0 && <>
                <div className="leader-profile-summary-row"><span>{t('lessonRewards')}</span><strong>+{formatBaht(profile.reward_total)}</strong></div>
                <small className="leader-profile-reward-note">{t('rewardsIncludedNote')}</small>
              </>}
              <div className="leader-profile-summary-row leader-profile-assets-count"><span>{t('assetCount')} {profile.holdings_count} รายการ</span><span>{t('cashPercent')} {profile.cash_percent}%</span></div>
            </section>
            <section className="leader-profile-allocation-section">
              <h3>{t('portfolioAllocation')}</h3>
              <p className="tiny muted">{t('allocationEducation')}</p>
              {profile.holdings_count === 0 && <p className="leader-profile-no-holdings">{t('noHoldings')}</p>}
              <AllocationChart allocations={profile.allocations} />
            </section>
            <p className="leader-profile-disclaimer">{t('profileEducationNote')}</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
