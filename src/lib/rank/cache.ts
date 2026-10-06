import 'server-only';

import { revalidateTag } from 'next/cache';

export const LEADERBOARD_CACHE_TAG = 'leaderboard-snapshot-v2';
export const LEADERBOARD_CACHE_SECONDS = 60;

// Deduplicate concurrent cache misses within this server instance. The stored
// snapshot itself lives in Next's Data Cache, not in this promise map.
export function singleFlight<T>(load: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  return () => {
    if (!pending) {
      const request = Promise.resolve().then(load).finally(() => {
        if (pending === request) pending = undefined;
      });
      pending = request;
    }
    return pending;
  };
}

export function invalidateLeaderboardCache() {
  revalidateTag(LEADERBOARD_CACHE_TAG);
}

// Never mutate the shared snapshot. Visibility is read fresh before each
// response, including public portfolio detail, and ranks remain contiguous.
export function visibleRankedEntries<T extends { authId: string; public_id: string; rank: number }>(
  entries: T[],
  profiles: Array<{ id: string; public_id: string; leaderboard_visible: boolean }>,
): T[] {
  const visible = new Map(profiles.filter((profile) => profile.leaderboard_visible)
    .map((profile) => [profile.id, profile.public_id]));
  return entries.filter((entry) => visible.get(entry.authId) === entry.public_id)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
