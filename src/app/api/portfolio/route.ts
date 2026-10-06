import { fail, ok, requireUser } from '@/lib/http';
import { loadPortfolio } from '@/lib/portfolio/server';

export async function GET() {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  try { return ok(await loadPortfolio(user.id)); } catch (error) { return fail('PORTFOLIO_FAILED', error instanceof Error ? error.message : 'ไม่สามารถโหลดพอร์ตได้', 500); }
}
