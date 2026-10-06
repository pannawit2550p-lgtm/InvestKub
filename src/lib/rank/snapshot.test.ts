import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  profiles: [] as Array<Record<string, unknown>>,
  visibilityError: false,
  fullRead: vi.fn(), holdingsRead: vi.fn(), visibilityRead: vi.fn(),
  cacheOptions: vi.fn(), clearCache: () => {},
}));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
  revalidateTag: () => mocks.clearCache(),
  // Model persistent hits/invalidation; real Next controls the SWR timer.
  unstable_cache: (load: () => Promise<unknown>, _key: string[], options: unknown) => {
    mocks.cacheOptions(options);
    let value: unknown;
    mocks.clearCache = () => { value = undefined; };
    return async () => {
      if (value === undefined) value = await load();
      return value;
    };
  },
}));
vi.mock('@/lib/market/cache', () => ({ getCachedQuote: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (fields: string) => {
        if (table === 'profiles') {
          const fresh = fields === 'id, public_id, leaderboard_visible';
          (fresh ? mocks.visibilityRead : mocks.fullRead)();
          return Promise.resolve({ data: structuredClone(mocks.profiles), error: fresh && mocks.visibilityError ? {} : null });
        }
        if (table === 'holdings') return { in: () => {
          mocks.holdingsRead();
          return Promise.resolve({ data: [], error: null });
        } };
        throw new Error(`Unexpected table: ${table}`);
      },
    }),
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.visibilityError = false;
  mocks.profiles = ['a', 'b'].map((id, index) => ({
    id, public_id: `public-${id}`, display_name: `Player ${id}`, display_name_custom: true,
    leaderboard_visible: true, cash_balance: 120 - index * 10,
    starting_balance: 100, reward_balance: 0, realized_pl: 0,
    session_started_at: '2026-01-01', avatar_type: 'initial', avatar_character: null, avatar_storage_path: null,
  }));
});

describe('server leaderboard snapshot integration', () => {
  it('shares valuation across pages/viewers/details but keeps each viewer response separate', async () => {
    const { getPublicLeaderboard, getPublicProfile } = await import('./server');
    const [a, b] = await Promise.all([getPublicLeaderboard('a', 0, 1), getPublicLeaderboard('b', 1, 1)]);
    const viewerOnly = await getPublicLeaderboard('b', 0, 0);
    const detail = await getPublicProfile('b', 'public-a');
    expect(a.viewer.rank).toBe(1);
    expect(b.viewer.rank).toBe(2);
    expect(a.top[0].public_id).toBe('public-a');
    expect(b.top[0].public_id).toBe('public-b');
    expect(viewerOnly.top).toEqual([]);
    expect(detail?.viewer_is_owner).toBe(false);
    expect(mocks.fullRead).toHaveBeenCalledTimes(1);
    expect(mocks.holdingsRead).toHaveBeenCalledTimes(1);
    expect(mocks.visibilityRead).toHaveBeenCalledTimes(4);
    expect(mocks.cacheOptions).toHaveBeenCalledWith({ revalidate: 60, tags: ['leaderboard-snapshot-v2'] });
    expect(JSON.stringify(a)).not.toMatch(/authId|avatar_storage_path|cash_balance/);
  });

  it('hides a player immediately even if the cached snapshot still contains that player', async () => {
    const { getPublicLeaderboard, getPublicProfile } = await import('./server');
    await getPublicLeaderboard('b', 0);
    mocks.profiles[0].leaderboard_visible = false;
    const result = await getPublicLeaderboard('a', 0);
    expect(result.top.map((entry) => entry.public_id)).toEqual(['public-b']);
    expect(result.top[0].rank).toBe(1);
    expect(result.viewer).toEqual({ visible: false, rank: null, public_id: null, total_pl_pct: null });
    expect(await getPublicProfile('b', 'public-a')).toBeNull();
    expect(mocks.fullRead).toHaveBeenCalledTimes(1);
  });

  it('refreshes the snapshot after profile invalidation', async () => {
    const { getPublicLeaderboard } = await import('./server');
    const { invalidateLeaderboardCache } = await import('./cache');
    await getPublicLeaderboard('a', 0);
    mocks.profiles[0].display_name = 'Updated name';
    invalidateLeaderboardCache();
    const result = await getPublicLeaderboard('a', 0);
    expect(result.top[0].display_name).toBe('Updated name');
    expect(mocks.fullRead).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the fresh privacy lookup fails', async () => {
    const { getPublicLeaderboard } = await import('./server');
    await getPublicLeaderboard('a', 0);
    mocks.visibilityError = true;
    await expect(getPublicLeaderboard('a', 0)).rejects.toThrow('LEADERBOARD_VISIBILITY_FAILED');
  });
});
