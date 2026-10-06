import { lessons } from '@/content/lessons';
import { LESSON_COUNT, LESSON_REWARD_CURRENCY, PASS_RATIO, REWARD_PER_LESSON } from '@/content/lesson-settings';
import { fail, ok, requireUser } from '@/lib/http';

export async function GET() {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  const safeLessons = lessons.map(({ quiz, ...lesson }) => ({
    ...lesson,
    quiz: quiz.map(({ answer: _answer, ...question }) => question),
  }));
  return ok({ lessons: safeLessons, lessonCount: LESSON_COUNT, passRatio: PASS_RATIO, rewardPerLesson: REWARD_PER_LESSON, rewardCurrency: LESSON_REWARD_CURRENCY });
}
