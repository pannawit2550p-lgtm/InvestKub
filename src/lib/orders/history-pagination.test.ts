import { describe, expect, it } from 'vitest';
import { historyPage } from './history-pagination';

interface Entry { id: string; kind: 'trade' | 'lesson_reward'; created_at: string; }
const trade = (index: number, created_at: string): Entry => ({
  id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
  kind: 'trade', created_at,
});

describe('order history pagination', () => {
  it('merges rewards and trades into one chronological 20-item page', () => {
    const start = Date.parse('2026-10-06T12:00:00Z');
    const trades = Array.from({ length: 21 }, (_, index) => trade(index, new Date(start - index * 1000).toISOString()));
    const rewards: Entry[] = [0, 1, 2].map((index) => ({
      id: `lesson-reward-${index}`, kind: 'lesson_reward',
      created_at: new Date(start - (index * 5 + 0.5) * 1000).toISOString(),
    }));
    const page = historyPage([...trades, ...rewards]);
    expect(page.items).toHaveLength(20);
    expect(page.items[0].id).toBe(trades[0].id);
    expect(page.items[1].id).toBe(rewards[0].id);
    expect(page.items.filter((item) => item.kind === 'lesson_reward')).toHaveLength(3);
    expect(page.nextCursor).toEqual({ before: trades[16].created_at, tradeSkip: 1, rewardSkip: 0 });
  });

  it('does not lose or repeat rows when trades and rewards share a boundary timestamp', () => {
    const timestamp = '2026-10-06T12:00:00.123456+00:00';
    const trades = Array.from({ length: 45 }, (_, index) => trade(45 - index, timestamp));
    const rewards: Entry[] = [3, 2, 1].map((index) => ({ id: `lesson-reward-${index}`, kind: 'lesson_reward', created_at: timestamp }));
    const first = historyPage([...trades.slice(0, 21), ...rewards]);
    expect(first.nextCursor).toEqual({ before: timestamp, tradeSkip: 17, rewardSkip: 3 });
    const second = historyPage([...trades.slice(17, 38), ...rewards.slice(3)], first.nextCursor!);
    expect(second.nextCursor).toEqual({ before: timestamp, tradeSkip: 37, rewardSkip: 3 });
    const third = historyPage(trades.slice(37, 58), second.nextCursor!);
    const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);
    expect(ids).toHaveLength(48);
    expect(new Set(ids).size).toBe(48);
    expect(third.nextCursor).toBeNull();
  });

  it('preserves PostgreSQL microsecond ordering and counts only exact timestamp ties', () => {
    const entries = Array.from({ length: 21 }, (_, index) => trade(index, `2026-10-06T12:00:00.000${101 + index}+00:00`));
    const page = historyPage(entries);
    expect(page.items[0].created_at).toBe('2026-10-06T12:00:00.000121+00:00');
    expect(page.nextCursor).toEqual({ before: '2026-10-06T12:00:00.000102+00:00', tradeSkip: 1, rewardSkip: 0 });
  });

  it('stops pagination for empty and complete final pages', () => {
    expect(historyPage([])).toEqual({ items: [], nextCursor: null });
    const entries = Array.from({ length: 20 }, (_, index) => trade(index, '2026-10-06T12:00:00Z'));
    expect(historyPage(entries).nextCursor).toBeNull();
  });
});
