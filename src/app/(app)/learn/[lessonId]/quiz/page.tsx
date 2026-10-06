'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/Icon';
import { REWARD_PER_LESSON } from '@/content/lesson-settings';
import { learnRequest, learnLessonsQueryOptions, learnProgressQueryOptions, type PublicLesson } from '@/lib/learn/client';

interface AnswerFeedback { correct: boolean; correctChoiceIndex: number; why: string; }
interface QuizResult { score: number; total: number; passed: boolean; bestScore: number; attempts: number; rewardClaimed: boolean; }
interface RewardResponse { paid: boolean; already_claimed: boolean; rewardTHB: number; }
const choiceLetters = ['ก', 'ข', 'ค', 'ง'];

function shuffledChoices(lesson: PublicLesson): number[][] {
  return lesson.quiz.map((question) => question.choices.map((_, index) => index).sort(() => Math.random() - 0.5));
}

export default function LessonQuizPage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params.lessonId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const lessonQuery = useQuery(learnLessonsQueryOptions());
  const progressQuery = useQuery(learnProgressQueryOptions());
  const lesson = lessonQuery.data?.lessons.find((item) => item.id === lessonId);
  const allLessons = lessonQuery.data?.lessons ?? [];
  const questions = lesson?.quiz ?? [];
  const lessonIndex = allLessons.findIndex((item) => item.id === lessonId);
  const nextLesson = allLessons[lessonIndex + 1];
  const [questionIndex, setQuestionIndex] = useState(0);
  const [optionOrder, setOptionOrder] = useState<number[][]>([]);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [feedback, setFeedback] = useState<Record<string, AnswerFeedback>>({});
  const [pendingAnswer, setPendingAnswer] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState('');
  const [rewardOpen, setRewardOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [toast, setToast] = useState('');
  const [animatedReward, setAnimatedReward] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const claimButtonRef = useRef<HTMLButtonElement>(null);
  const rewardTriggerRef = useRef<HTMLButtonElement>(null);
  const choiceGroupRef = useRef<HTMLDivElement>(null);
  const initializedLessonId = useRef<string | null>(null);
  const activeQuestion = questions[questionIndex];
  const activeOrder = useMemo(() => optionOrder[questionIndex] ?? [0, 1, 2, 3], [optionOrder, questionIndex]);
  const selectedIndex = answers[questionIndex] ?? null;
  const answerFeedback = activeQuestion ? feedback[activeQuestion.id] : undefined;
  const modalVisible = Boolean(rewardOpen && result?.passed && !rewardClaimed);

  useEffect(() => {
    if (!lesson) return;
    if (initializedLessonId.current === lesson.id) return;
    initializedLessonId.current = lesson.id;
    setQuestionIndex(0);
    setOptionOrder(shuffledChoices(lesson));
    setAnswers(lesson.quiz.map(() => null));
    setFeedback({});
    setPendingAnswer(false);
    setSavingResult(false);
    setResult(null);
    setRewardOpen(false);
    setClaiming(false);
    setRewardClaimed(false);
    setError('');
    setClaimError('');
    setToast('');
  }, [lesson]);

  const submitAnswer = useCallback(async (displayIndex: number) => {
    if (!lesson || !activeQuestion || pendingAnswer || selectedIndex !== null || !Number.isInteger(displayIndex) || displayIndex < 0 || displayIndex > 3) return;
    const originalChoiceIndex = activeOrder[displayIndex];
    setPendingAnswer(true);
    setError('');
    try {
      const feedbackResult = await learnRequest<AnswerFeedback>('/api/learn/answer', { method: 'POST', body: JSON.stringify({ lessonId: lesson.id, questionId: activeQuestion.id, choiceIndex: originalChoiceIndex }) });
      setAnswers((current) => current.map((answer, index) => index === questionIndex ? originalChoiceIndex : answer));
      setFeedback((current) => ({ ...current, [activeQuestion.id]: feedbackResult }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'ตรวจคำตอบไม่สำเร็จ');
    } finally { setPendingAnswer(false); }
  }, [lesson, activeQuestion, pendingAnswer, selectedIndex, activeOrder, questionIndex]);

  const finishQuiz = useCallback(async () => {
    if (!lesson || savingResult || answers.length !== lesson.quiz.length || answers.some((answer) => answer === null)) return;
    setSavingResult(true);
    setError('');
    try {
      const resultData = await learnRequest<QuizResult>('/api/learn/quiz', { method: 'POST', body: JSON.stringify({ lessonId: lesson.id, answers }) });
      setResult(resultData);
      setRewardClaimed(resultData.rewardClaimed);
      void queryClient.invalidateQueries({ queryKey: ['learn-progress'] });
      if (resultData.passed && !resultData.rewardClaimed) setRewardOpen(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'บันทึกผลควิซไม่สำเร็จ');
    } finally { setSavingResult(false); }
  }, [lesson, savingResult, answers, queryClient]);

  const advance = useCallback(() => {
    if (!answerFeedback || pendingAnswer || savingResult) return;
    if (questionIndex < questions.length - 1) setQuestionIndex((value) => value + 1);
    else void finishQuiz();
  }, [answerFeedback, pendingAnswer, savingResult, questionIndex, questions.length, finishQuiz]);

  useEffect(() => {
    if (!activeQuestion || result) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      if (event.key === 'Enter' && answerFeedback) {
        if (target?.closest('button:not(:disabled), a[href]')) return;
        event.preventDefault(); advance(); return;
      }
      if (selectedIndex !== null || pendingAnswer) return;
      const keyIndex = /^[1-4]$/.test(event.key) ? Number(event.key) - 1 : choiceLetters.indexOf(event.key.toLowerCase());
      if (keyIndex >= 0) { event.preventDefault(); void submitAnswer(keyIndex); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeQuestion, result, answerFeedback, advance, selectedIndex, pendingAnswer, submitAnswer]);

  useEffect(() => {
    if (!result && activeQuestion) choiceGroupRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [questionIndex, lesson?.id, result, activeQuestion]);

  useEffect(() => {
    if (!modalVisible) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    claimButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !claiming) { event.preventDefault(); setRewardOpen(false); rewardTriggerRef.current?.focus(); }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) { event.preventDefault(); modalRef.current.focus(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = originalOverflow; };
  }, [modalVisible, claiming]);

  useEffect(() => {
    if (!modalVisible) { setAnimatedReward(0); return; }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) { setAnimatedReward(REWARD_PER_LESSON); return; }
    const start = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / 600);
      setAnimatedReward(Math.round(REWARD_PER_LESSON * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [modalVisible]);

  async function claimReward() {
    if (!lesson || claiming || rewardClaimed) return;
    setClaiming(true); setClaimError('');
    try {
      const claimed = await learnRequest<RewardResponse>('/api/learn/reward', { method: 'POST', body: JSON.stringify({ lessonId: lesson.id }) });
      setRewardClaimed(true); setRewardOpen(false); setToast(claimed.paid ? `เงินสดเพิ่มขึ้น ${REWARD_PER_LESSON.toLocaleString('en-US')} บาท` : 'บทเรียนนี้รับรางวัลแล้ว');
      void Promise.all([queryClient.invalidateQueries({ queryKey: ['learn-progress'] }), queryClient.invalidateQueries({ queryKey: ['profile-settings'] }), queryClient.invalidateQueries({ queryKey: ['portfolio'] }), queryClient.invalidateQueries({ queryKey: ['orders'] }), queryClient.invalidateQueries({ queryKey: ['rank'] }), queryClient.invalidateQueries({ queryKey: ['public-profile'] })]);
      rewardTriggerRef.current?.focus();
      window.setTimeout(() => setToast(''), 3500);
    } catch (claimErrorValue) {
      setClaimError(claimErrorValue instanceof Error ? claimErrorValue.message : 'รับรางวัลไม่สำเร็จ ลองอีกครั้ง');
    } finally { setClaiming(false); }
  }

  function restartQuiz() {
    if (!lesson) return;
    setQuestionIndex(0); setOptionOrder(shuffledChoices(lesson)); setAnswers(lesson.quiz.map(() => null)); setFeedback({}); setResult(null); setError(''); setRewardOpen(false); setClaimError('');
  }

  if (lessonQuery.isLoading || progressQuery.isLoading) return <div className="app-content learn-state-card" role="status">กำลังโหลดควิซ…</div>;
  if ((lessonQuery.error && !lessonQuery.data) || (progressQuery.error && !progressQuery.data)) return <div className="app-content"><div className="card learn-state-card learn-error" role="alert"><p>โหลดควิซไม่สำเร็จ</p><button className="outline-button" onClick={() => { void lessonQuery.refetch(); void progressQuery.refetch(); }}>ลองอีกครั้ง</button></div></div>;
  if (!lesson) return <div className="app-content"><div className="card learn-state-card"><p>ไม่พบบทเรียนนี้</p><Link className="outline-button" href="/learn">กลับหน้าเรียนรู้</Link></div></div>;

  const exitQuiz = () => { if (window.confirm('ออกจากควิซ? ความคืบหน้าในรอบนี้จะหายไป')) router.push(`/learn/${lesson.id}`); };
  const correctCount = result?.score ?? 0;

  return <div className="app-content lesson-quiz-page">
    <header className="quiz-topbar">
      <button className="quiz-exit-button" aria-label="ออกจากควิซ" onClick={exitQuiz}><Icon name="x" size={20} /></button>
      <strong>{lesson.title}</strong>
      <span className="quiz-step">{result ? 'ผลคะแนน' : `ข้อ ${questionIndex + 1}/${questions.length}`}</span>
    </header>
    {!result && <div className="quiz-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={questionIndex + (answerFeedback ? 1 : 0)}><span style={{ width: `${((questionIndex + (answerFeedback ? 1 : 0)) / questions.length) * 100}%` }} /></div>}

    {!result && activeQuestion && <section className="quiz-question-area" aria-live="polite">
      <p className="page-kicker">{lesson.title}</p>
      <h1>{activeQuestion.question}</h1>
      <div className="quiz-choice-list" role="radiogroup" aria-label="เลือกคำตอบ" ref={choiceGroupRef}>
        {activeOrder.map((originalIndex, displayIndex) => {
          const feedbackForQuestion = feedback[activeQuestion.id];
          const isCorrect = Boolean(feedbackForQuestion && originalIndex === feedbackForQuestion.correctChoiceIndex);
          const isWrongSelection = Boolean(feedbackForQuestion && answers[questionIndex] === originalIndex && !feedbackForQuestion.correct);
          const dim = Boolean(feedbackForQuestion && !isCorrect && !isWrongSelection);
          const stateClass = isCorrect ? 'is-correct' : isWrongSelection ? 'is-wrong' : dim ? 'is-dimmed' : '';
          return <button type="button" role="radio" aria-checked={selectedIndex === originalIndex} disabled={pendingAnswer || selectedIndex !== null} onClick={() => void submitAnswer(displayIndex)} className={`quiz-choice ${stateClass}`} key={originalIndex}>
            <span className="quiz-choice-letter">{choiceLetters[displayIndex]}</span><span className="quiz-choice-text">{activeQuestion.choices[originalIndex]}</span>
            {isCorrect && <><Icon name="check" size={19} className="gain" /><span className="sr-only">คำตอบถูก</span></>}
            {isWrongSelection && <><Icon name="x" size={19} className="loss" /><span className="sr-only">คำตอบนี้ไม่ถูก</span></>}
          </button>;
        })}
      </div>
      {pendingAnswer && <p className="tiny muted quiz-feedback-loading" role="status">กำลังตรวจคำตอบ…</p>}
      {answerFeedback && <div className={`quiz-explanation ${answerFeedback.correct ? 'is-correct' : 'is-wrong'}`} aria-live="polite">
        <strong><Icon name={answerFeedback.correct ? 'check' : 'x'} size={17} />{answerFeedback.correct ? 'ทำไมถึงถูก' : 'คำตอบที่ถูกต้อง'}</strong>
        <p>{answerFeedback.why}</p>
        <button className="primary-button" onClick={advance} disabled={savingResult}>{questionIndex === questions.length - 1 ? (savingResult ? 'กำลังบันทึกผล…' : 'ดูผลคะแนน') : 'ข้อถัดไป'} <Icon name="arrowRight" size={18} /></button>
      </div>}
      {error && <p className="learn-inline-error" role="alert">{error}</p>}
      <p className="quiz-key-hint tiny muted">กด 1–4 หรือ ก–ง เพื่อตอบ · Enter เพื่อไปต่อ</p>
    </section>}

    {result && <section className="quiz-result-area" aria-live="polite">
      <div className={`quiz-result-icon ${result.passed ? 'is-passed' : 'is-failed'}`}><Icon name={result.passed ? 'check' : 'book'} size={30} /></div>
      <p className="page-kicker">ผลควิซ · {lesson.title}</p>
      <h1 className="quiz-score">{correctCount}<span>/{result.total}</span></h1>
      <p className="quiz-result-message">{result.passed ? (rewardClaimed ? 'ผ่านอีกครั้ง! (รางวัลบทนี้รับไปแล้ว)' : 'ยินดีด้วย! คุณผ่านควิซ') : 'ยังไม่ผ่าน ลองอีกครั้งได้เลย'}</p>
      <p className="tiny muted">คะแนนดีที่สุด {result.bestScore}/{result.total} · ทำแล้ว {result.attempts} ครั้ง</p>
      {result.passed && !rewardClaimed && <div className="quiz-reward-result">
        <span>รางวัลบทเรียน</span><strong>+{REWARD_PER_LESSON.toLocaleString('en-US')} บาท</strong>
        <button ref={rewardTriggerRef} className="primary-button" onClick={() => { setClaimError(''); setRewardOpen(true); }}>รับรางวัล</button>
      </div>}
      {!result.passed && <div className="quiz-wrong-list">
        {questions.map((question, index) => answers[index] !== null && answers[index] !== feedback[question.id]?.correctChoiceIndex && <details className="quiz-wrong-item" key={question.id}><summary>{question.question}</summary><p>คำตอบที่ถูก: {question.choices[feedback[question.id]?.correctChoiceIndex ?? 0]}</p><p className="muted">{feedback[question.id]?.why}</p></details>)}
      </div>}
      <div className="quiz-result-actions">
        {!result.passed && <button className="primary-button" onClick={restartQuiz}>ทำควิซอีกครั้ง <Icon name="rotate" size={18} /></button>}
        {!result.passed && <Link className="outline-button" href={`/learn/${lesson.id}`}>กลับไปอ่านบทเรียน</Link>}
        {result.passed && nextLesson && <Link className="primary-button" href={`/learn/${nextLesson.id}`}>ไปบทถัดไป <Icon name="arrowRight" size={18} /></Link>}
        <Link className="outline-button" href="/learn">กลับหน้าเรียนรู้</Link>
      </div>
      {error && <p className="learn-inline-error" role="alert">{error}</p>}
    </section>}

    {toast && <div className="learn-toast" role="status">{toast}</div>}
    {modalVisible && <div className="learn-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !claiming) { setRewardOpen(false); rewardTriggerRef.current?.focus(); } }}>
      <div className="learn-reward-modal" role="dialog" aria-modal="true" aria-labelledby="learn-reward-title" tabIndex={-1} ref={modalRef}>
        <button className="learn-modal-close" aria-label="ปิดหน้าต่างรางวัล" disabled={claiming} onClick={() => { setRewardOpen(false); rewardTriggerRef.current?.focus(); }}><Icon name="x" size={20} /></button>
        <span className="learn-modal-coin"><Icon name="coins" size={30} /></span>
        <h2 id="learn-reward-title">ยินดีด้วย! คุณผ่านควิซ</h2>
        <p className="learn-modal-amount">+{animatedReward.toLocaleString('en-US')} บาท</p>
        <p className="tiny muted">รางวัลเงินสมมติสำหรับบทเรียนนี้</p>
        {claimError && <p className="learn-inline-error" role="alert">{claimError}</p>}
        <button ref={claimButtonRef} className="primary-button learn-claim-button" onClick={() => void claimReward()} disabled={claiming}>
          {claiming && <span className="learn-spinner" aria-hidden="true" />}{claiming ? 'กำลังรับรางวัล…' : 'รับรางวัล'}
        </button>
        {!claiming && <button className="learn-modal-later" onClick={() => { setRewardOpen(false); rewardTriggerRef.current?.focus(); }}>ไว้ภายหลัง</button>}
      </div>
    </div>}
  </div>;
}
