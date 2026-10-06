import { fail, ok, requireUser } from '@/lib/http';
import { getPublicProfile } from '@/lib/rank/server';

const PUBLIC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: { publicId: string } }) {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  if (!PUBLIC_ID_PATTERN.test(params.publicId)) return fail('PROFILE_NOT_FOUND', 'ไม่สามารถแสดงโปรไฟล์นี้ได้', 404);
  try {
    const profile = await getPublicProfile(user.id, params.publicId);
    if (!profile) return fail('PROFILE_NOT_FOUND', 'ไม่สามารถแสดงโปรไฟล์นี้ได้', 404);
    return ok(profile, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return fail('PUBLIC_PROFILE_FAILED', 'ไม่สามารถแสดงโปรไฟล์นี้ได้', 500);
  }
}
