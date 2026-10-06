'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type Ref } from 'react';
import Avatar from './Avatar';
import Icon from './Icon';
import { usdToThb } from '@/lib/currency';
import { formatThaiShortDate } from '@/lib/time';
import type { ProfileSettings } from '@/lib/profile/response';
import type { PortfolioData } from '@/lib/portfolio/client';
import { profileReturnPresentation } from '@/lib/profile/presentation';

interface Props {
  profile?: ProfileSettings;
  portfolio?: PortfolioData;
  rank: number | null;
  loading: boolean;
  portfolioLoading: boolean;
  error: boolean;
  retrying: boolean;
  editRef?: Ref<HTMLButtonElement>;
  onEdit: () => void;
  onAvatarEdit: () => void;
  onCopy: (number: number) => void;
  onRetry: () => void;
}

function Money({ value, integer = false, sign = '' }: { value: number | null; integer?: boolean; sign?: string }) {
  if (value === null || !Number.isFinite(value)) return <>—</>;
  const text = new Intl.NumberFormat('en-US', { minimumFractionDigits: integer ? 0 : 2, maximumFractionDigits: integer ? 0 : 2 }).format(value);
  return <><span className="profile-stat-number">{sign}{text}</span>{' '}<small>บาท</small></>;
}

export default function ProfileCard({ profile, portfolio, rank, loading, portfolioLoading, error, retrying, editRef, onEdit, onAvatarEdit, onCopy, onRetry }: Props) {
  const [showRewardInfo, setShowRewardInfo] = useState(false);
  const [stackStats, setStackStats] = useState(false);
  const statsRef = useRef<HTMLDListElement>(null);
  const returns = portfolio ? profileReturnPresentation(portfolio.total_pl, portfolio.total_pl_pct) : null;
  const start = profile ? usdToThb(profile.starting_balance) : null;
  const reward = portfolio?.reward_balance ?? profile?.reward_balance ?? 0;
  useEffect(() => {
    const stats = statsRef.current;
    if (!stats) return;
    const measure = () => {
      const columnWidth = stats.getBoundingClientRect().width / 3;
      const cells = [...stats.children];
      setStackStats(cells.some((cell, index) => {
        const number = cell.querySelector('.profile-stat-number');
        const available = columnWidth - (index === 1 ? 24 : 12);
        const arrow = cell.querySelector('.profile-return-amount > svg') ? 17 : 0;
        return number ? number.getBoundingClientRect().width + arrow > available : false;
      }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stats);
    void document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, [start, portfolio?.portfolio_value, returns?.amount, loading, portfolioLoading]);
  const visibleRank = profile?.leaderboard_visible ? rank : null;
  const medal = visibleRank === 1 ? 'var(--gold)' : visibleRank === 2 ? 'var(--silver)' : visibleRank === 3 ? 'var(--bronze)' : '#c4b5fd';
  return <section className="investkub-profile-card" aria-label="โปรไฟล์และสถิติบัญชี" aria-busy={loading || portfolioLoading}>
    <svg className="profile-card-chart" viewBox="0 0 240 120" fill="none" aria-hidden="true"><path d="m10 106 48-38 36 15 40-49 30 19 53-42M194 11h23v24" stroke="var(--accent-green)" strokeWidth="2" /><path d="m16 117 52-22 35 10 64-35 58-32" stroke="var(--accent-purple)" strokeWidth="2" /></svg>
    <div className="profile-card-header">
      <div className="profile-card-identity">
        <div className="profile-card-avatar-wrap">
          {loading ? <span className="skeleton profile-card-avatar-skeleton" /> : <span className="profile-card-avatar-ring"><Avatar name={profile?.display_name ?? 'Trader'} id={profile?.public_id ?? 'profile'} size={84} className="profile-card-avatar" avatarType={profile?.avatar_type} avatarCharacter={profile?.avatar_character} avatarUrl={profile?.avatar_url} /></span>}
          <button type="button" className="profile-avatar-pencil" aria-label="เปลี่ยนรูปโปรไฟล์" onClick={onAvatarEdit} disabled={!profile}><span><Icon name="pencil" size={15} /></span></button>
        </div>
        <div className="profile-card-identity-copy">
          {loading ? <div className="skeleton profile-name-skeleton" /> : <h2 title={profile?.display_name}>{profile?.display_name ?? 'Trader'}</h2>}
          {visibleRank !== null && <Link className="profile-rank-link" href="/rank?self=1" aria-label={`ดูอันดับของคุณ อันดับ ${visibleRank}`}><span className="profile-rank-pill"><Icon name="trophy" size={14} style={{ color: medal }} />{visibleRank === 1 ? 'อันดับ 1' : `อันดับ #${visibleRank}`} ของพอร์ตจำลอง</span></Link>}
          <div className="profile-card-meta"><span>เริ่มใช้งาน {profile?.created_at ? formatThaiShortDate(Date.parse(profile.created_at)) : '—'}</span>
            {profile && profile.player_number > 0 && <span className="profile-player-id"><span aria-hidden="true">•</span><button type="button" onClick={() => onCopy(profile.player_number)} aria-label={`คัดลอกรหัสผู้เล่น ${profile.player_number}`}>ID: #{profile.player_number}</button></span>}
          </div>
        </div>
      </div>
      <button ref={editRef} type="button" className="profile-card-edit" onClick={onEdit} disabled={!profile}><Icon name="user" size={17} />แก้ไขโปรไฟล์</button>
    </div>
    <dl ref={statsRef} className={`profile-card-stats${stackStats ? ' is-stacked' : ''}`}>
      <div><dt>เงินเริ่มต้น</dt><dd>{loading ? <span className="skeleton profile-stat-skeleton" /> : <Money value={start} integer />}</dd>
        {reward > 0 && <div className="profile-reward-note"><span>+ รางวัลบทเรียน {new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(usdToThb(reward))}</span><button type="button" aria-label="วิธีคำนวณผลตอบแทน" aria-expanded={showRewardInfo} aria-describedby={showRewardInfo ? 'profile-reward-tooltip' : undefined} onClick={() => setShowRewardInfo((value) => !value)} onBlur={() => setShowRewardInfo(false)}><Icon name="info" size={14} /></button>{showRewardInfo && <span id="profile-reward-tooltip" role="tooltip">ผลตอบแทนคำนวณจากเงินเริ่มต้นรวมเงินรางวัล</span>}</div>}
      </div>
      <div><dt>มูลค่าพอร์ตปัจจุบัน</dt><dd>{portfolioLoading && !portfolio ? <span className="skeleton profile-stat-skeleton" /> : <Money value={portfolio ? usdToThb(portfolio.portfolio_value) : null} />}</dd></div>
      <div><dt>ผลตอบแทน</dt><dd className={returns?.tone ?? 'muted'}>{portfolioLoading && !portfolio ? <span className="skeleton profile-stat-skeleton" /> : returns ? <><span className="profile-return-amount">{returns.direction && <Icon name={returns.direction} size={14} />}<span><Money value={Math.abs(returns.amount)} sign={returns.sign} /></span></span><span className="profile-return-percent">({returns.percent})</span></> : '—'}</dd></div>
    </dl>
    {error && <div className="profile-card-error" role="status"><span>โหลดข้อมูลไม่สำเร็จ</span><button type="button" onClick={onRetry} disabled={retrying}>ลองอีกครั้ง</button></div>}
  </section>;
}
