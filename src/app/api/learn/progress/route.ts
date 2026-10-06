import { lessons } from '@/content/lessons';
import { REWARD_PER_LESSON } from '@/content/lesson-settings';
import { createAdminClient } from '@/lib/supabase/admin';
import { fail, ok, requireUser } from '@/lib/http';

const lessonIds = new Set(lessons.map((lesson) => lesson.id));

export async function GET() {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  const admin = createAdminClient();
  const [{ data, error }, { data: profile }] = await Promise.all([
    admin.from('lesson_progress').select('lesson_id, read_at, passed, best_score, attempts, reward_claimed_at, reward_amount').eq('user_id', user.id),
    admin.from('profiles').select('reward_balance').eq('id', user.id).single(),
  ]);
  if (error) return fail('LEARN_PROGRESS_FAILED', 'โหลดความคืบหน้าบทเรียนไม่สำเร็จ', 500);
  const progress = (data ?? []).filter((row) => lessonIds.has(row.lesson_id)).map((row) => ({
    lessonId: row.lesson_id,
    read: Boolean(row.read_at),
    passed: Boolean(row.passed),
    bestScore: Number(row.best_score ?? 0),
    attempts: Number(row.attempts ?? 0),
    rewardClaimedAt: row.reward_claimed_at as string | null,
    rewardAmount: row.reward_amount === null ? null : Number(row.reward_amount),
  }));
  const claimedCount = progress.filter((item) => item.rewardClaimedAt).length;
  return ok({ progress, passedCount: progress.filter((item) => item.passed).length, claimedCount, rewardEarnedTHB: claimedCount * REWARD_PER_LESSON, rewardBalance: Number(profile?.reward_balance ?? 0) });
}

export async function POST(request: Request) {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  let body: { lessonId?: string; action?: string };
  try { body = await request.json() as { lessonId?: string; action?: string }; } catch { return fail('INVALID_BODY', 'ข้อมูลไม่ถูกต้อง'); }
  if (body.action !== 'read' || !body.lessonId || !lessonIds.has(body.lessonId)) return fail('INVALID_LESSON', 'ไม่พบบทเรียนนี้');
  const { error } = await createAdminClient().rpc('mark_lesson_read', { p_user_id: user.id, p_lesson_id: body.lessonId });
  if (error) return fail('LESSON_READ_FAILED', 'บันทึกความคืบหน้าไม่สำเร็จ', 500);
  return ok({ lessonId: body.lessonId, read: true });
}
