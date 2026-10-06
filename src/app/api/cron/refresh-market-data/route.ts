import { fail, isCronAuthorized, ok } from '@/lib/http';
import { refreshQueuedMarketData } from '@/lib/market/cache';
import type { RefreshJob } from '@/lib/market/refresh-queue';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMarketOverview } from '@/lib/market/overview-server';

export const runtime = 'nodejs';

const BATCH_SIZE = 40;
const CONCURRENCY = 5;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return fail('UNAUTHORIZED', 'Invalid cron secret', 401);

  const admin = createAdminClient();
  // Await the shared refresh even when there are no queued symbol jobs.
  let overview: 'fresh' | 'stale' | 'unavailable';
  try { overview = (await getMarketOverview()).stale ? 'stale' : 'fresh'; }
  catch { overview = 'unavailable'; }
  const { data, error } = await admin.rpc('claim_market_data_refresh_jobs', { p_limit: BATCH_SIZE });
  if (error) return fail('REFRESH_QUEUE_UNAVAILABLE', 'Refresh queue is unavailable; apply migration 0008_market_data_scaling.sql', 503);

  const jobs = (data ?? []) as RefreshJob[];
  let cursor = 0;
  let refreshed = 0;
  let deferred = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      try {
        await refreshQueuedMarketData(admin, job);
        const { error: finishError } = await admin.rpc('finish_market_data_refresh_job', {
          p_job_id: job.id,
          p_success: true,
          p_error_code: null,
        });
        if (finishError) throw new Error('QUEUE_ACK_FAILED');
        refreshed += 1;
      } catch (error) {
        const errorCode = error instanceof Error ? error.message : 'PROVIDER_ERROR';
        await admin.rpc('finish_market_data_refresh_job', {
          p_job_id: job.id,
          p_success: false,
          p_error_code: errorCode,
        });
        deferred += 1;
      }
    }
  });
  await Promise.all(workers);

  return ok({ claimed: jobs.length, refreshed, deferred, overview });
}
