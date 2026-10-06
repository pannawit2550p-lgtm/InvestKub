'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/Icon';
import { REWARD_PER_LESSON } from '@/content/lesson-settings';
import { learnRequest, learnLessonsQueryOptions, learnProgressQueryOptions, type LearnProgress } from '@/lib/learn/client';

export default function LessonContentPage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params.lessonId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const lessonQuery = useQuery(learnLessonsQueryOptions());
  const progressQuery = useQuery(learnProgressQueryOptions());
  const [readError, setReadError] = useState('');
  const readOnce = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lessons = lessonQuery.data?.lessons ?? [];
  const lesson = lessons.find((item) => item.id === lessonId);
  const index = lessons.findIndex((item) => item.id === lessonId);
  const progress = progressQuery.data?.progress.find((item) => item.lessonId === lessonId);
  const claimed = Boolean(progress?.rewardClaimedAt);
  const previous = index > 0 ? lessons[index - 1] : undefined;
  const next = index >= 0 ? lessons[index + 1] : undefined;
  const nextHref = useMemo(() => `/learn/${lessonId}/quiz`, [lessonId]);

  useEffect(() => { readOnce.current = false; setReadError(''); }, [lessonId]);

  const markRead = useCallback(async (): Promise<boolean> => {
    if (readOnce.current || progress?.read) return true;
    readOnce.current = true;
    setReadError('');
    try {
      await learnRequest(`/api/learn/progress`, { method: 'POST', body: JSON.stringify({ lessonId, action: 'read' }) });
      queryClient.setQueryData<LearnProgress>(['learn-progress'], (old) => old ? ({ ...old, progress: old.progress.some((item) => item.lessonId === lessonId) ? old.progress.map((item) => item.lessonId === lessonId ? { ...item, read: true } : item) : [...old.progress, { lessonId, read: true, passed: false, bestScore: 0, attempts: 0, rewardClaimedAt: null, rewardAmount: null }] }) : old);
      return true;
    } catch { readOnce.current = false; setReadError('บันทึกการอ่านไม่สำเร็จ กรุณาลองอีกครั้ง'); return false; }
  }, [lessonId, progress?.read, queryClient]);

  useEffect(() => {
    if (!lesson || !endRef.current || progress?.read) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void markRead(); }, { rootMargin: '0px 0px -24px 0px' });
    observer.observe(endRef.current);
    return () => observer.disconnect();
  }, [lesson, progress?.read, markRead]);

  if (lessonQuery.isLoading || progressQuery.isLoading) return <div className="app-content learn-state-card" role="status">กำลังโหลดบทเรียน…</div>;
  if ((lessonQuery.error && !lessonQuery.data) || (progressQuery.error && !progressQuery.data)) return <div className="app-content"><div className="card learn-state-card learn-error" role="alert"><p>โหลดบทเรียนไม่สำเร็จ</p><button className="outline-button" onClick={() => { void lessonQuery.refetch(); void progressQuery.refetch(); }}>ลองอีกครั้ง</button></div></div>;
  if (!lesson) return <div className="app-content"><div className="card learn-state-card"><p>ไม่พบบทเรียนนี้</p><Link className="outline-button" href="/learn">กลับหน้าเรียนรู้</Link></div></div>;

  return <div className="app-content lesson-content-page">
    <header className="lesson-topbar">
      <Link href="/learn" className="lesson-back-button" aria-label="กลับหน้าเรียนรู้"><Icon name="arrowLeft" size={20} /></Link>
      <strong>{lesson.title}</strong><span aria-hidden="true" />
    </header>
    <main>
      <div className="lesson-intro">
        <p className="page-kicker">บทเรียน {String(index + 1).padStart(2, '0')} / {lessons.length}</p>
        <h1>{lesson.title}</h1>
        <p className="muted">อ่าน {lesson.minutes} นาที · ควิซ 4 ข้อ</p>
        <span className={`lesson-reward-status ${claimed ? 'is-claimed' : ''}`}><Icon name={claimed ? 'check' : 'coins'} size={17} />{claimed ? 'รับรางวัลแล้ว' : `ทำควิซผ่านรับ +${REWARD_PER_LESSON.toLocaleString('en-US')} บาท`}</span>
      </div>
      <div className="lesson-sections">
        {lesson.sections.map((section, sectionIndex) => <section className="card lesson-section-card" key={section.heading}>
          <span className="lesson-section-index">{String(sectionIndex + 1).padStart(2, '0')}</span>
          <h2>{section.heading}</h2><p>{section.body}</p>
          {section.example && <div className="lesson-example"><span>ตัวอย่าง</span><p>{section.example}</p></div>}
        </section>)}
      </div>
      <section className="card lesson-summary-card">
        <h2><Icon name="sparkles" size={18} />สรุปประเด็นสำคัญ</h2>
        <ul>{lesson.summary.map((point) => <li key={point}>{point}</li>)}</ul>
      </section>
      <div ref={endRef} className="lesson-read-sentinel" aria-hidden="true" />
      {readError && <p className="learn-inline-error" role="alert">{readError}</p>}
      <div className="lesson-quiz-cta"><button type="button" className="primary-button" onClick={() => void markRead().then((saved) => { if (saved) router.push(nextHref); })}>เริ่มทำควิซ <Icon name="arrowRight" size={18} /></button></div>
      <nav className="lesson-next-links" aria-label="นำทางบทเรียน">
        {previous ? <Link href={`/learn/${previous.id}`}><Icon name="arrowLeft" size={15} />บทก่อนหน้า</Link> : <span />}
        {next ? <Link href={`/learn/${next.id}`}>บทถัดไป<Icon name="arrowRight" size={15} /></Link> : <Link href="/learn">กลับหน้าเรียนรู้<Icon name="arrowRight" size={15} /></Link>}
      </nav>
    </main>
  </div>;
}
