export const ORDER_HISTORY_PAGE_SIZE = 20;

export interface HistoryCursor {
  before: string;
  tradeSkip: number;
  rewardSkip: number;
}

interface HistoryEntry {
  id: string;
  kind: 'trade' | 'lesson_reward';
  created_at: string;
}

// PostgreSQL timestamps can include microseconds, which Date.parse alone truncates.
function compareTimes(left: string, right: string) {
  const milliseconds = Date.parse(left) - Date.parse(right);
  if (milliseconds !== 0) return milliseconds;
  const microseconds = (value: string) => Number((value.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
  return microseconds(left) - microseconds(right);
}

export function historyPage<T extends HistoryEntry>(entries: T[], cursor?: HistoryCursor) {
  const sorted = [...entries].sort((left, right) => compareTimes(right.created_at, left.created_at)
    || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0));
  const items = sorted.slice(0, ORDER_HISTORY_PAGE_SIZE);
  const last = items[items.length - 1];
  let nextCursor: HistoryCursor | null = null;
  if (last && sorted.length > ORDER_HISTORY_PAGE_SIZE) {
    // Skip only entries already consumed at the boundary timestamp. Older entries
    // are queried independently of newer inserts, including ties across both sources.
    const sameBoundary = cursor && compareTimes(cursor.before, last.created_at) === 0;
    const boundaryItems = items.filter((item) => compareTimes(item.created_at, last.created_at) === 0);
    nextCursor = {
      before: last.created_at,
      tradeSkip: (sameBoundary ? cursor.tradeSkip : 0) + boundaryItems.filter((item) => item.kind === 'trade').length,
      rewardSkip: (sameBoundary ? cursor.rewardSkip : 0) + boundaryItems.filter((item) => item.kind === 'lesson_reward').length,
    };
  }
  return { items, nextCursor };
}
