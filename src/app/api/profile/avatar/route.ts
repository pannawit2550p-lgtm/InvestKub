import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { fail, ok, requireUser } from '@/lib/http';
import { PROFILE_FIELDS, profileResponse } from '@/lib/profile/response';
import { isProfileAvatarId } from '@/lib/profile/avatars';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateLeaderboardCache } from '@/lib/rank/cache';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const selectionSchema = z.discriminatedUnion('avatar_type', [
  z.object({ avatar_type: z.literal('initial') }),
  z.object({ avatar_type: z.literal('character'), avatar_character: z.string().refine(isProfileAvatarId) }),
]);

function detectImage(buffer: Buffer): { extension: 'png' | 'jpg' | 'webp'; contentType: string } | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', contentType: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', contentType: 'image/jpeg' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: 'webp', contentType: 'image/webp' };
  }
  return null;
}

async function profileData(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return profileResponse(admin, data);
}

export async function POST(request: Request) {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);

  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin.from('profiles')
    .select('avatar_storage_path')
    .eq('id', user.id)
    .single();
  if (currentError || !current) return fail('PROFILE_NOT_FOUND', 'ไม่พบโปรไฟล์', 404);

  const oldPath = current.avatar_storage_path as string | null;
  let newPath: string | null = null;
  let updates: { avatar_type: string; avatar_character: string | null; avatar_storage_path: string | null };

  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return fail('INVALID_IMAGE', 'กรุณาเลือกรูปภาพ');
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) return fail('INVALID_IMAGE_SIZE', 'รูปภาพต้องมีขนาดไม่เกิน 5 MB');

    const bytes = Buffer.from(await file.arrayBuffer());
    const image = detectImage(bytes);
    if (!image) return fail('INVALID_IMAGE_TYPE', 'รองรับเฉพาะไฟล์ PNG, JPG และ WebP');

    newPath = `${user.id}/${crypto.randomUUID()}.${image.extension}`;
    const { error: uploadError } = await admin.storage.from('profile-avatars').upload(newPath, bytes, {
      contentType: image.contentType,
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) return fail('AVATAR_UPLOAD_FAILED', 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่', 400);
    updates = { avatar_type: 'upload', avatar_character: null, avatar_storage_path: newPath };
  } else {
    const parsed = selectionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail('INVALID_AVATAR', 'เลือกรูปโปรไฟล์ไม่ถูกต้อง');
    updates = parsed.data.avatar_type === 'initial'
      ? { avatar_type: 'initial', avatar_character: null, avatar_storage_path: null }
      : { avatar_type: 'character', avatar_character: parsed.data.avatar_character, avatar_storage_path: null };
  }

  const { error: updateError } = await admin.from('profiles').update(updates).eq('id', user.id);
  if (updateError) {
    if (newPath) await admin.storage.from('profile-avatars').remove([newPath]);
    return fail('AVATAR_SAVE_FAILED', 'บันทึกรูปโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่', 400);
  }

  invalidateLeaderboardCache();
  if (oldPath && oldPath !== newPath) await admin.storage.from('profile-avatars').remove([oldPath]);
  const saved = await profileData(user.id);
  if (!saved) return fail('AVATAR_SAVE_FAILED', 'บันทึกรูปโปรไฟล์แล้ว แต่โหลดข้อมูลกลับมาไม่สำเร็จ', 500);
  return ok(saved);
}
