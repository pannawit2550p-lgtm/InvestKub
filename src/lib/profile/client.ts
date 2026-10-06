'use client';
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { ProfileSettings } from './response';

export const profileQueryOptions = queryOptions({
  queryKey: ['profile-settings'],
  queryFn: async ({ signal }): Promise<ProfileSettings> => {
    const response = await fetch('/api/profile', { signal });
    const body = await response.json() as { data?: ProfileSettings; error?: { message: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? 'โหลดโปรไฟล์ไม่สำเร็จ');
    return body.data;
  },
  staleTime: 5 * 60_000, gcTime: 15 * 60_000,
  refetchOnMount: true, refetchOnWindowFocus: false,
});
export function useProfileSettings() { return useQuery(profileQueryOptions); }
