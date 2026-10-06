import { describe, expect, it } from 'vitest';
import { getLesson } from '@/content/lessons';
import { PASS_RATIO } from '@/content/lesson-settings';
import { scoreLessonQuiz } from './scoring';

const lesson = getLesson('what-is-stock');
if (!lesson) throw new Error('Test lesson missing');

describe('scoreLessonQuiz', () => {
  it('passes at exactly three correct answers out of four', () => {
    expect(scoreLessonQuiz(lesson, [1, 1, 0, 0], PASS_RATIO)).toEqual({ score: 3, total: 4, passed: true });
  });

  it('does not pass at two correct answers', () => {
    expect(scoreLessonQuiz(lesson, [1, 0, 0, 0], PASS_RATIO)).toEqual({ score: 2, total: 4, passed: false });
  });

  it('rejects missing, extra, or invalid choice values', () => {
    expect(() => scoreLessonQuiz(lesson, [1, 1], PASS_RATIO)).toThrow('INVALID_QUIZ');
    expect(() => scoreLessonQuiz(lesson, [1, 1, 0, 0, 2], PASS_RATIO)).toThrow('INVALID_QUIZ');
    expect(() => scoreLessonQuiz(lesson, [1, 1, 0, 9], PASS_RATIO)).toThrow('INVALID_QUIZ');
  });
});
