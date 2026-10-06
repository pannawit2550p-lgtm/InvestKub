import { getLesson } from '@/content/lessons';
import { PASS_RATIO } from '@/content/lesson-settings';
import { fail, ok, requireUser } from '@/lib/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { scoreLessonQuiz } from '@/lib/learn/scoring';

export async function POST(request: Request) {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  let body: { lessonId?: string; answers?: number[] };
  try { body = await request.json() as { lessonId?: string; answers?: number[] }; } catch { return fail('INVALID_BODY', 'ข้อมูลไม่ถูกต้อง'); }
  const lesson = body.lessonId ? getLesson(body.lessonId) : undefined;
  if (!lesson) return fail('INVALID_QUIZ', 'คำตอบควิซไม่ครบหรือไม่ถูกต้อง');
  let scoreResult: ReturnType<typeof scoreLessonQuiz>;
  try { scoreResult = scoreLessonQuiz(lesson, body.answers ?? [], PASS_RATIO); } catch { return fail('INVALID_QUIZ', 'คำตอบควิซไม่ครบหรือไม่ถูกต้อง'); }
  const { score, total, passed } = scoreResult;
  const { data, error } = await createAdminClient().rpc('record_lesson_attempt', {
    p_user_id: user.id,
    p_lesson_id: lesson.id,
    p_score: score,
    p_passed: passed,
  });
  if (error) return fail('QUIZ_SAVE_FAILED', 'บันทึกผลควิซไม่สำเร็จ กรุณาลองอีกครั้ง', 500);
  return ok({ score, total, passed, bestScore: Number(data?.best_score ?? score), attempts: Number(data?.attempts ?? 1), rewardClaimed: Boolean(data?.reward_claimed_at) });
}
