import { formatBaht } from '@/lib/currency';
import { formatPercent } from '@/lib/format';

export default function LeaderboardPerformance({ value, amount, compact = false }: { value: number; amount: number; compact?: boolean }) {
  const tone = value > 0 ? 'gain' : value < 0 ? 'loss' : 'muted';
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '—';
  return (
    <span className={`leader-performance ${tone}${compact ? ' is-compact' : ''}`}>
      <span>{arrow} {formatPercent(value)}</span>
      {!compact && <small>{amount > 0 ? '+' : ''}{formatBaht(amount)}</small>}
    </span>
  );
}
