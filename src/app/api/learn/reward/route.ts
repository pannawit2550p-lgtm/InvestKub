import { lessons } from '@/content/lessons';
import { REWARD_PER_LESSON } from '@/content/lesson-settings';
import { fail, ok, requireUser } from '@/lib/http';
import { claimLessonReward } from '@/lib/learn/rewards';

export async function POST(request: Request) {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  let body: { lessonId?: string };
  try { body = await request.json() as { lessonId?: string }; } catch { return fail('INVALID_BODY', 'ข้อมูลไม่ถูกต้อง'); }
  if (!body.lessonId || !lessons.some((lesson) => lesson.id === body.lessonId)) return fail('INVALID_LESSON', 'ไม่พบบทเรียนนี้');
  try {
    const result = await claimLessonReward(user.id, body.lessonId);
    return ok({ ...result, rewardTHB: REWARD_PER_LESSON });
  } catch (error) {
    if (error instanceof Error && error.message === 'LESSON_NOT_PASSED') return fail('LESSON_NOT_PASSED', 'ต้องผ่านควิซก่อนจึงจะรับรางวัลได้', 409);
    return fail('REWARD_CLAIM_FAILED', 'รับรางวัลไม่สำเร็จ ลองอีกครั้ง', 500);
  }
}
