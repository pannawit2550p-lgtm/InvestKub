'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Icon from '@/components/Icon';
import LeaderboardPerformance from '@/components/LeaderboardPerformance';
import LeaderboardRow from '@/components/LeaderboardRow';
import LeaderboardProfileModal from '@/components/LeaderboardProfileModal';
import PodiumRank from '@/components/PodiumRank';
import type { PublicLeaderboardEntry } from '@/lib/rank/calculations';
import { t } from '@/lib/i18n';
import { seedViewerRank, type LeaderboardPageData } from '@/lib/rank/client';

const MEDAL_COLORS: Record<number, string> = { 1: '#F5B301', 2: '#C7CBD6', 3: '#D98A4E' };
const PODIUM_ORDER = [2, 1, 3];

function LeaderboardBackground() {
  return <div className="leaderboard-background" aria-hidden="true"><Image src="/leaderboard/background.png" alt="" fill priority sizes="100vw" /></div>;
}

function LoadingState() {
  return (
    <div className="app-content leaderboard-page">
      <LeaderboardBackground />
      <div className="page-header"><div className="skeleton leaderboard-title-skeleton" /><div className="skeleton leaderboard-caption-skeleton" /></div>
      <div className="leaderboard-podium leaderboard-podium-skeleton">{[2, 1, 3].map((rank) => <div key={rank} className={`podium-skeleton podium-skeleton-${rank}`}><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>)}</div>
      <div className="leaderboard-list-skeleton">{Array.from({ length: 5 }, (_, index) => <div className="skeleton" key={index} />)}</div>
    </div>
  );
}

export default function RankPage() {
  const queryClient = useQueryClient();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [selfAnchorVisible, setSelfAnchorVisible] = useState(false);
  const selfAnchorRef = useRef<HTMLElement | null>(null);
  const query = useInfiniteQuery({
    queryKey: ['rank'],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const response = await fetch(`/api/rank?offset=${pageParam}`, { cache: 'no-store', signal });
      const body = await response.json() as { data?: LeaderboardPageData; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? 'โหลดอันดับไม่สำเร็จ');
      if (pageParam === 0 && !signal.aborted) seedViewerRank(queryClient, body.data.viewer);
      return body.data;
    },
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.top.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: false,
  });

  const players = query.data?.pages.flatMap((page) => page.top) ?? [];
  const firstPage = query.data?.pages[0];
  const viewer = firstPage?.viewer;
  const total = firstPage?.total ?? 0;
  const viewerRank = viewer?.visible ? viewer.rank : null;

  useEffect(() => {
    if (!viewer?.visible || viewerRank === null) {
      setSelfAnchorVisible(false);
      return;
    }
    const anchor = selfAnchorRef.current;
    if (!anchor) {
      setSelfAnchorVisible(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setSelfAnchorVisible(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [viewer?.visible, viewer?.public_id, viewerRank, players.length]);

  const closeProfile = useCallback(() => setActiveProfileId(null), []);

  async function scrollToOwnRank() {
    if (!viewerRank) return;
    let loaded = players.length;
    while (loaded < viewerRank && query.hasNextPage) {
      const result = await query.fetchNextPage();
      if (result.isError) return;
      loaded = result.data?.pages.reduce((sum, page) => sum + page.top.length, 0) ?? loaded;
    }
    requestAnimationFrame(() => selfAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  const selfScrollRequested = useRef(false);
  useEffect(() => {
    if (selfScrollRequested.current || !viewerRank || new URLSearchParams(window.location.search).get('self') !== '1') return;
    selfScrollRequested.current = true;
    void scrollToOwnRank();
    // The existing scroll action also loads pages until the viewer is visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRank]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError && !query.data) {
    return <div className="app-content leaderboard-page"><LeaderboardBackground /><h1 className="page-title">{t('rank')}</h1><div className="card leaderboard-error"><p>{t('rankLoadFailed')}</p><button type="button" className="secondary-button" onClick={() => void query.refetch()}>{t('retry')}</button></div><p className="leaderboard-footer">{t('disclaimer')}</p></div>;
  }

  const podium = PODIUM_ORDER.map((rank) => ({ rank, player: players.find((player) => player.rank === rank) ?? null }));
  const lowerRanked = players.filter((player) => player.rank >= 4);

  return (
    <div className="app-content leaderboard-page">
      <LeaderboardBackground />
      <header className="leaderboard-heading">
        <div className="leaderboard-heading-copy">
          <h1>{t('rank')}</h1>
          <p>{t('leaderboardSubtitle')}</p>
        </div>
        <label className="leaderboard-period">
          <span className="sr-only">ช่วงเวลาการจัดอันดับ</span>
          <select aria-label="ช่วงเวลาการจัดอันดับ" defaultValue="all"><option value="all">ทุกช่วงเวลา</option></select>
          <Icon name="chevronDown" size={14} aria-hidden="true" />
        </label>
      </header>

      {viewer && !viewer.visible && (
        <div className="leaderboard-hidden-note">
          <span>{t('rankPrivacyHidden')}</span>
          <Link href="/settings#leaderboard-privacy">{t('rankPrivacyLink')}</Link>
        </div>
      )}

      <section className="leaderboard-podium" aria-label={t('leaderboard')}>
        {podium.map(({ rank, player }) => {
          const isSelf = Boolean(player && viewer?.public_id === player.public_id);
          return (
            <PodiumRank
              key={rank}
              rank={rank as 1 | 2 | 3}
              player={player}
              isSelf={isSelf}
              buttonRef={isSelf ? (node) => { selfAnchorRef.current = node; } : undefined}
              onSelect={() => player && setActiveProfileId(player.public_id)}
            />
          );
        })}
      </section>

      {total === 0 && <p className="leaderboard-no-players">{t('rankNoPlayers')}</p>}
      {lowerRanked.length > 0 ? (
        <section className="leaderboard-lower-list" aria-label={t('lowerLeaderboard')}>
          {lowerRanked.map((player) => {
            const isSelf = Boolean(viewer?.public_id === player.public_id);
            return (
              <LeaderboardRow
                key={player.public_id}
                player={player}
                isSelf={isSelf}
                buttonRef={isSelf ? (node) => { selfAnchorRef.current = node; } : undefined}
                onSelect={() => setActiveProfileId(player.public_id)}
              />
            );
          })}
        </section>
      ) : total > 0 && <p className="leaderboard-no-fourth">{t('fourthPlaceEmpty')}</p>}

      {query.hasNextPage && (
        <button type="button" className="leaderboard-more-button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {query.isFetchingNextPage ? t('loadingMore') : t('viewMore')}
        </button>
      )}

      <p className="leaderboard-footer">{t('disclaimer')}</p>

      {viewer?.visible && viewerRank !== null && viewerRank !== undefined && !selfAnchorVisible && (
        <button type="button" className="leaderboard-self-bar" onClick={() => void scrollToOwnRank()}>
          <span>{t('yourRank')} #{viewerRank}</span><LeaderboardPerformance value={viewer.total_pl_pct ?? 0} amount={0} compact />
          <Icon name="arrowUp" size={18} />
        </button>
      )}
      {activeProfileId && <LeaderboardProfileModal publicId={activeProfileId} onClose={closeProfile} />}
    </div>
  );
}
