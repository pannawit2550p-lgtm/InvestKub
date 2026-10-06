import { fail, ok, requireUser } from '@/lib/http';
import { getPublicLeaderboard } from '@/lib/rank/server';

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);

  const requestedOffset = Number(new URL(request.url).searchParams.get('offset') ?? 0);
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
  try {
    const viewerOnly = new URL(request.url).searchParams.get('viewer') === '1';
    const result = await getPublicLeaderboard(user.id, viewerOnly ? 0 : offset, viewerOnly ? 0 : PAGE_SIZE);
    return ok(viewerOnly ? result.viewer : result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return fail('RANK_FAILED', 'โหลดอันดับไม่สำเร็จ กรุณาลองใหม่', 500);
  }
}
