'use client';
import { queryOptions, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import type { PublicLeaderboardEntry } from './calculations';

export interface ViewerRank { visible: boolean; rank: number | null; public_id: string | null; total_pl_pct: number | null; }
export interface LeaderboardPageData { top: PublicLeaderboardEntry[]; total: number; viewer: ViewerRank; }
export const VIEWER_RANK_KEY = ['rank', 'viewer'] as const;

export function seedViewerRank(client: QueryClient, viewer: ViewerRank, updatedAt = Date.now()) {
  const current = client.getQueryState(VIEWER_RANK_KEY);
  if (!current || current.dataUpdatedAt <= updatedAt) client.setQueryData(VIEWER_RANK_KEY, viewer, { updatedAt });
}
export function viewerRankOptions(client: QueryClient) {
  return queryOptions({ queryKey: VIEWER_RANK_KEY,
    queryFn: async ({ signal }): Promise<ViewerRank> => {
      const response = await fetch('/api/rank?viewer=1', { signal });
      const body = await response.json() as { data?: ViewerRank };
      if (!response.ok || !body.data) throw new Error('โหลดอันดับไม่สำเร็จ');
      return body.data;
    },
    initialData: () => client.getQueryData<InfiniteData<LeaderboardPageData>>(['rank'])?.pages[0]?.viewer,
    initialDataUpdatedAt: () => { const state = client.getQueryState(['rank']); return state?.isInvalidated ? 0 : state?.dataUpdatedAt; },
    staleTime: 2 * 60_000, gcTime: 15 * 60_000, refetchOnMount: true,
  });
}
export function useViewerRank(enabled: boolean) {
  const client = useQueryClient();
  return useQuery({ ...viewerRankOptions(client), enabled });
}
