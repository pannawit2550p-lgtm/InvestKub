import type { Lesson } from '@/content/lessons';

export function scoreLessonQuiz(lesson: Lesson, answers: number[], passRatio: number) {
  if (!Array.isArray(answers) || answers.length !== lesson.quiz.length || answers.some((answer, index) => !Number.isInteger(answer) || answer < 0 || answer >= lesson.quiz[index].choices.length)) {
    throw new Error('INVALID_QUIZ');
  }
  const score = lesson.quiz.reduce((total, question, index) => total + (answers[index] === question.answer ? 1 : 0), 0);
  return { score, total: lesson.quiz.length, passed: score / lesson.quiz.length >= passRatio };
}
