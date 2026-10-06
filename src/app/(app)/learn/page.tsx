'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/Icon';
import { REWARD_PER_LESSON } from '@/content/lesson-settings';
import { learnLessonsQueryOptions, learnProgressQueryOptions } from '@/lib/learn/client';
import { t } from '@/lib/i18n';

export default function LearnPage() {
  const lessonsQuery = useQuery(learnLessonsQueryOptions());
  const progressQuery = useQuery(learnProgressQueryOptions());
  const lessons = lessonsQuery.data?.lessons ?? [];
  const progress = progressQuery.data;
  const passedCount = progress?.passedCount ?? 0;
  const lessonCount = lessonsQuery.data?.lessonCount ?? 8;
  const percent = lessonCount ? Math.round(passedCount / lessonCount * 100) : 0;
  const isLoading = lessonsQuery.isLoading || progressQuery.isLoading;
  const error = (!lessonsQuery.data ? lessonsQuery.error : null) ?? (!progressQuery.data ? progressQuery.error : null);

  return <div className="app-content learn-page">
    <div className="page-header">
      <div><h1 className="page-title">{t('learn')}</h1><p className="muted tiny">บทเรียนสั้น ๆ เพื่อเข้าใจแนวคิดพื้นฐาน</p></div>
      <span className="chip active learn-counter">{passedCount}/{lessonCount}</span>
    </div>

    <section className="card learn-progress-card" aria-label="ความคืบหน้าบทเรียน">
      <div className="section-heading"><strong>{t('lessonProgress')}</strong><span className="tiny muted">{percent}%</span></div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={lessonCount} aria-valuenow={passedCount}><span style={{ width: `${percent}%` }} /></div>
      <p className="tiny muted learn-reward-total">รางวัลที่ได้รับแล้ว {progress?.rewardEarnedTHB ?? 0} / {lessonCount * REWARD_PER_LESSON} บาท</p>
    </section>

    {isLoading && <div className="card learn-state-card" role="status">กำลังโหลดบทเรียน…</div>}
    {error && <div className="card learn-state-card learn-error" role="alert"><p>{error instanceof Error ? error.message : 'โหลดบทเรียนไม่สำเร็จ'}</p><button className="outline-button" onClick={() => { void lessonsQuery.refetch(); void progressQuery.refetch(); }}>ลองอีกครั้ง</button></div>}
    {!isLoading && !error && <section className="section stack learn-list" aria-label="รายการบทเรียน">
      {lessons.map((lesson, index) => {
        const item = progress?.progress.find((entry) => entry.lessonId === lesson.id);
        const claimed = Boolean(item?.rewardClaimedAt);
        return <Link href={`/learn/${lesson.id}`} className="card learn-lesson-card" key={lesson.id}>
          <span className="learn-lesson-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <span className="learn-lesson-copy"><strong>{lesson.title}</strong><span className="tiny muted">อ่าน {lesson.minutes} นาที · ควิซ 4 ข้อ</span></span>
          {claimed ? <span className="learn-claimed"><Icon name="check" size={17} /><span>รับรางวัลแล้ว</span></span> : <span className="learn-reward-pill">+{REWARD_PER_LESSON.toLocaleString('en-US')} บาท</span>}
          <Icon name="chevronRight" size={18} className="learn-lesson-arrow" />
        </Link>;
      })}
      {!lessons.length && <div className="card learn-state-card">ยังไม่มีบทเรียนในขณะนี้</div>}
    </section>}
  </div>;
}
