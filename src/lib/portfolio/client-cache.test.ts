import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { portfolioQueryOptions, type PortfolioData } from './client';
import { profileQueryOptions } from '@/lib/profile/client';
import { seedViewerRank, viewerRankOptions, VIEWER_RANK_KEY } from '@/lib/rank/client';

afterEach(() => vi.unstubAllGlobals());
describe('shared navigation cache', () => {
  it('does not fetch a fresh portfolio again when another page mounts', async () => {
    const client = new QueryClient();
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ data: { cash_balance: 100, holdings: [] } }) }));
    vi.stubGlobal('fetch', fetcher);
    await client.fetchQuery(portfolioQueryOptions);
    const observer = new QueryObserver(client, { ...portfolioQueryOptions, refetchInterval: false });
    const stop = observer.subscribe(() => {});
    expect(observer.getCurrentResult().data?.cash_balance).toBe(100);
    expect(fetcher).toHaveBeenCalledTimes(1);
    stop(); client.clear();
  });
  it('keeps stale portfolio visible while revalidating, coalescing two consumers', async () => {
    const client = new QueryClient();
    client.setQueryData(['portfolio'], { cash_balance: 100, holdings: [] } as unknown as PortfolioData, { updatedAt: Date.now() - 120000 });
    let finish!: (value: unknown) => void;
    const fetcher = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const first = new QueryObserver(client, { ...portfolioQueryOptions, refetchInterval: false });
    const second = new QueryObserver(client, { ...portfolioQueryOptions, refetchInterval: false });
    const stop1 = first.subscribe(() => {}); const stop2 = second.subscribe(() => {});
    expect(first.getCurrentResult().data?.cash_balance).toBe(100);
    expect(first.getCurrentResult().isFetching).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    finish({ ok: true, json: async () => ({ data: { cash_balance: 200, holdings: [] } }) });
    await vi.waitFor(() => expect(second.getCurrentResult().data?.cash_balance).toBe(200));
    stop1(); stop2(); client.clear();
  });
  it('uses the viewer from the full leaderboard without an extra viewer request', () => {
    const client = new QueryClient();
    const viewer = { visible: true, rank: 2, public_id: 'public-id', total_pl_pct: 3 };
    client.setQueryData(['rank'], { pages: [{ viewer, top: [], total: 2 }], pageParams: [0] });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const observer = new QueryObserver(client, viewerRankOptions(client));
    const stop = observer.subscribe(() => {});
    expect(observer.getCurrentResult().data).toEqual(viewer);
    expect(fetcher).not.toHaveBeenCalled();
    stop(); client.clear();
  });
  it('does not let older viewer data overwrite a newer cache result', () => {
    const client = new QueryClient();
    const viewer = { visible: true, rank: 2, public_id: 'public-id', total_pl_pct: 3 };
    seedViewerRank(client, viewer, 2000);
    seedViewerRank(client, { ...viewer, rank: 9 }, 1000);
    expect(client.getQueryData(VIEWER_RANK_KEY)).toEqual(viewer);
    expect(profileQueryOptions.queryKey).toEqual(['profile-settings']);
    expect(portfolioQueryOptions.refetchOnMount).toBe(true);
    client.clear();
  });
});
