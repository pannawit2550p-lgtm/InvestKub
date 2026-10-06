import type { Ref } from 'react';
import Avatar from '@/components/Avatar';
import LeaderboardPerformance from '@/components/LeaderboardPerformance';
import { formatBaht } from '@/lib/currency';
import { t } from '@/lib/i18n';
import type { PublicLeaderboardEntry } from '@/lib/rank/calculations';

interface LeaderboardRowProps {
  player: PublicLeaderboardEntry;
  isSelf: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onSelect: () => void;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(value));
}

export default function LeaderboardRow({ player, isSelf, buttonRef, onSelect }: LeaderboardRowProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`leaderboard-player-row${isSelf ? ' is-self' : ''}`}
      onClick={onSelect}
      aria-label={`${t('viewPlayerProfile')} ${player.display_name} ${t('profileRank')} ${player.rank}`}
    >
      <span className="leaderboard-row-rank">{player.rank}</span>
      <Avatar
        name={player.display_name}
        id={player.public_id}
        size={50}
        ringColor={isSelf ? 'var(--accent-purple)' : undefined}
        avatarType={player.avatar_type}
        avatarCharacter={player.avatar_character}
        avatarUrl={player.avatar_url}
      />
      <span className="leaderboard-row-name">
        <strong title={player.display_name}><span>{player.display_name}</span>{isSelf && <span className="leader-you-pill">{t('rankYou')}</span>}</strong>
        <small>{t('sessionStarted')} {shortDate(player.session_started_at)}</small>
      </span>
      <span className="leaderboard-row-value">
        <strong>{formatBaht(player.portfolio_value)}</strong>
        <LeaderboardPerformance value={player.total_pl_pct} amount={player.total_pl} />
      </span>
    </button>
  );
}
