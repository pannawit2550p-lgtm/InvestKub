import { queryOptions } from '@tanstack/react-query';

export interface PublicQuestion { id: string; question: string; choices: [string, string, string, string]; why: string; }
export interface PublicLesson {
  id: string;
  title: string;
  minutes: number;
  sections: Array<{ heading: string; body: string; example?: string }>;
  summary: [string, string, string];
  quiz: [PublicQuestion, PublicQuestion, PublicQuestion, PublicQuestion];
}
export interface LessonProgress { lessonId: string; read: boolean; passed: boolean; bestScore: number; attempts: number; rewardClaimedAt: string | null; rewardAmount: number | null; }
export interface LearnProgress { progress: LessonProgress[]; passedCount: number; claimedCount: number; rewardEarnedTHB: number; rewardBalance: number; }
export interface LessonListResponse { lessons: PublicLesson[]; lessonCount: number; }

// All learning screens share these keys and cache lifetimes when navigating between them.
export function learnLessonsQueryOptions() {
  return queryOptions({
    queryKey: ['learn-lessons'],
    queryFn: ({ signal }) => learnRequest<LessonListResponse>('/api/learn/lessons', { signal }),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function learnProgressQueryOptions() {
  return queryOptions({
    queryKey: ['learn-progress'],
    queryFn: ({ signal }) => learnRequest<LearnProgress>('/api/learn/progress', { signal }),
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
  });
}

export async function learnRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok || body.data === undefined) throw new Error(body.error?.message ?? 'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง');
  return body.data;
}
