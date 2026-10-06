import { getLesson } from '@/content/lessons';
import { fail, ok, requireUser } from '@/lib/http';

export async function POST(request: Request) {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  let body: { lessonId?: string; questionId?: string; choiceIndex?: number };
  try { body = await request.json() as { lessonId?: string; questionId?: string; choiceIndex?: number }; } catch { return fail('INVALID_BODY', 'ข้อมูลไม่ถูกต้อง'); }
  const lesson = body.lessonId ? getLesson(body.lessonId) : undefined;
  const question = lesson?.quiz.find((item) => item.id === body.questionId);
  if (!question || !Number.isInteger(body.choiceIndex) || Number(body.choiceIndex) < 0 || Number(body.choiceIndex) >= question.choices.length) return fail('INVALID_ANSWER', 'คำตอบไม่ถูกต้อง');
  return ok({ correct: body.choiceIndex === question.answer, correctChoiceIndex: question.answer, why: question.why });
}
