import Image from 'next/image';
import type { Ref } from 'react';
import Avatar from '@/components/Avatar';
import LeaderboardPerformance from '@/components/LeaderboardPerformance';
import { formatBaht } from '@/lib/currency';
import type { PublicLeaderboardEntry } from '@/lib/rank/calculations';
import { formatPercent } from '@/lib/format';
import { t } from '@/lib/i18n';

const ASSET_BY_RANK: Record<number, string> = {
  1: '/leaderboard/rank-1.png',
  2: '/leaderboard/rank-2.png',
  3: '/leaderboard/rank-3.png',
};
const MEDAL_COLORS: Record<number, string> = { 1: '#F5B301', 2: '#C7CBD6', 3: '#D98A4E' };

interface PodiumRankProps {
  rank: 1 | 2 | 3;
  player: PublicLeaderboardEntry | null;
  isSelf: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onSelect: () => void;
}

export default function PodiumRank({ rank, player, isSelf, buttonRef, onSelect }: PodiumRankProps) {
  const visual = (
    <span className="lb-podium-visual" aria-hidden="true">
      {player ? (
        <Avatar
          name={player.display_name}
          id={player.public_id}
          size={rank === 1 ? 120 : 96}
          ringColor={MEDAL_COLORS[rank]}
          className="lb-podium-avatar"
          avatarType={player.avatar_type}
          avatarCharacter={player.avatar_character}
          avatarUrl={player.avatar_url}
        />
      ) : <span className="lb-podium-avatar-empty" />}
      <Image src={ASSET_BY_RANK[rank]} alt="" aria-hidden="true" fill sizes="(max-width: 699px) 42vw, (max-width: 1100px) 36vw, 420px" className="lb-podium-frame" />
    </span>
  );

  const info = (
    <>
      <strong className="lb-podium-name" title={player?.display_name ?? undefined}>
        <span className="lb-podium-name-text">{player?.display_name ?? t('podiumEmpty')}</span>
        {isSelf && <span className="leader-you-pill">{t('rankYou')}</span>}
      </strong>
      {player ? (
        <>
          <span className="lb-podium-total">
            <small>{t('portfolioValue')}</small>
            <strong>{formatBaht(player.portfolio_value)}</strong>
          </span>
          <LeaderboardPerformance value={player.total_pl_pct} amount={player.total_pl} />
        </>
      ) : <span className="lb-podium-waiting">#{rank}</span>}
    </>
  );

  const label = player
    ? `${player.display_name}, ${t('profileRank')} ${rank}, ${t('portfolioValue')} ${formatBaht(player.portfolio_value)}, ${formatPercent(player.total_pl_pct)}, ${formatBaht(player.total_pl)}`
    : `${t('profileRank')} ${rank}: ${t('podiumEmpty')}`;

  return (
    <div className={`lb-podium-item lb-podium-item-${rank}`}>
      {player ? (
        <button ref={buttonRef} type="button" className={`lb-podium-rank lb-podium-rank-${rank}`} onClick={onSelect} aria-label={`${player.display_name}, ${t('profileRank')} ${rank}`}>
          {visual}
        </button>
      ) : (
        <div className={`lb-podium-rank lb-podium-rank-${rank} is-empty`} aria-label={label}>
          {visual}
        </div>
      )}
      {player ? (
        <button type="button" className="lb-podium-info" onClick={onSelect} aria-label={label}>
          {info}
        </button>
      ) : (
        <div className="lb-podium-info is-empty">{info}</div>
      )}
    </div>
  );
}
