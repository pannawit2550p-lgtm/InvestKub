import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

import { revalidateTag } from 'next/cache';
import { invalidateLeaderboardCache, LEADERBOARD_CACHE_TAG, singleFlight, visibleRankedEntries } from './cache';

describe('leaderboard cache', () => {
  it('coalesces concurrent requests and releases the pending promise after success', async () => {
    const load = vi.fn(async () => ['snapshot']);
    const read = singleFlight(load);
    const [a, b] = await Promise.all([read(), read()]);
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    await read();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('allows retry after a failed snapshot computation', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce([]);
    const read = singleFlight(load);
    await expect(read()).rejects.toThrow('database unavailable');
    await expect(read()).resolves.toEqual([]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('invalidates the shared cache tag after a profile change', () => {
    invalidateLeaderboardCache();
    expect(revalidateTag).toHaveBeenCalledWith(LEADERBOARD_CACHE_TAG);
  });

  it('removes hidden/deleted profiles and re-ranks without mutating cached entries', () => {
    const entries = [
      { authId: 'a', public_id: 'pa', rank: 1 },
      { authId: 'b', public_id: 'pb', rank: 2 },
      { authId: 'c', public_id: 'pc', rank: 3 },
    ];
    const profiles = [
      { id: 'a', public_id: 'pa', leaderboard_visible: false },
      { id: 'b', public_id: 'pb', leaderboard_visible: true },
    ];
    expect(visibleRankedEntries(entries, profiles)).toEqual([{ authId: 'b', public_id: 'pb', rank: 1 }]);
    expect(entries[1].rank).toBe(2);
    expect(visibleRankedEntries(entries, [{ ...profiles[0], leaderboard_visible: true }])[0].authId).toBe('a');
  });

  it('rejects an entry if the public identity has changed', () => {
    expect(visibleRankedEntries([{ authId: 'a', public_id: 'old', rank: 1 }],
      [{ id: 'a', public_id: 'new', leaderboard_visible: true }])).toEqual([]);
  });
});
