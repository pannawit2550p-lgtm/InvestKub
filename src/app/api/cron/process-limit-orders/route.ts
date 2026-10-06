import { fail, isCronAuthorized, ok } from '@/lib/http';
import { processLimitOrders } from '@/lib/limit-orders/process';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return fail('UNAUTHORIZED', 'Invalid cron secret', 401);
  try { return ok(await processLimitOrders()); }
  catch (error) { return fail('LIMIT_ORDER_PROCESSING_FAILED', error instanceof Error ? error.message : 'Processing failed', 500); }
}
