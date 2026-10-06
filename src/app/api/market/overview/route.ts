import { fail, ok, requireUser } from '@/lib/http';
import { getMarketOverview } from '@/lib/market/overview-server';

export const dynamic = 'force-dynamic';
export async function GET() {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  try { return ok(await getMarketOverview(), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return fail('MARKET_OVERVIEW_UNAVAILABLE', 'ไม่สามารถโหลดข้อมูลตลาดได้', 503); }
}
