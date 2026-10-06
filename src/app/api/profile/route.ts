import { z } from 'zod';
import { fail, ok, requireUser } from '@/lib/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { PROFILE_FIELDS, profileResponse } from '@/lib/profile/response';
import { isValidDisplayName, sanitizeDisplayName } from '@/lib/rank/privacy';
import { invalidateLeaderboardCache } from '@/lib/rank/cache';

const displayNameSchema = z.string().transform(sanitizeDisplayName).refine(isValidDisplayName, 'ชื่อที่แสดงต้องมี 3–20 ตัวอักษรและห้ามมี @');
const updateSchema = z.object({
  display_name: displayNameSchema.optional(),
  leaderboard_visible: z.boolean().optional(),
}).refine((value) => value.display_name !== undefined || value.leaderboard_visible !== undefined);

export async function GET() {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', user.id)
    .single();
  if (error || !data) return fail('PROFILE_NOT_FOUND', 'ไม่พบโปรไฟล์', 404);

  return ok(await profileResponse(admin, data));
}

export async function POST(request: Request) {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');

  const updates: { display_name?: string; display_name_custom?: boolean; leaderboard_visible?: boolean } = {};
  if (parsed.data.display_name !== undefined) {
    updates.display_name = parsed.data.display_name;
    updates.display_name_custom = true;
  }
  if (parsed.data.leaderboard_visible !== undefined) updates.leaderboard_visible = parsed.data.leaderboard_visible;

  const { data, error } = await createAdminClient()
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select(PROFILE_FIELDS)
    .single();
  if (error || !data) return fail('PROFILE_UPDATE_FAILED', 'บันทึกการตั้งค่าไม่สำเร็จ', 400);

  invalidateLeaderboardCache();
  return ok(await profileResponse(createAdminClient(), data));
}
