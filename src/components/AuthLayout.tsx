import type { ReactNode } from 'react';
import Image from 'next/image';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="auth-shell">
    <div className="auth-ambient-art" aria-hidden="true" />
    <section className="auth-card">
      <div className="auth-form-panel">
        <div className="auth-form-brand">
          <Image className="auth-brand-image" src="/investkub-brand-mark.png" alt="InvestKub" width={1774} height={887} priority />
        </div>
        {children}
      </div>
      <aside className="auth-art-panel" aria-label="ฝึกลงทุนด้วยเงินสมมติ">
        <div className="auth-art-glow" aria-hidden="true" />
        <div className="auth-art-illustration" aria-hidden="true" />
        <div className="auth-art-footer">
          <p className="auth-art-caption">ฝึกลงทุนด้วยเงินสมมติ เรียนรู้ได้จริง ไม่เสี่ยงเงินจริง</p>
          <p className="auth-art-disclaimer">นี่คือเกมจำลอง ไม่ใช่คำแนะนำการลงทุน</p>
        </div>
      </aside>
    </section>
  </main>;
}
