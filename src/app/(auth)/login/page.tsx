'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FocusEvent as ReactFocusEvent, FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { t } from '@/lib/i18n';
import AuthLayout from '@/components/AuthLayout';
import Icon from '@/components/Icon';

function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="var(--auth-google-blue)" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.1v5.1h6.7c3.9-3.6 6-8.8 6-14.9Z"/><path fill="var(--auth-google-green)" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.8 1.2-4.1 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z"/><path fill="var(--auth-google-yellow)" d="M12.8 27.9a12 12 0 0 1 0-7.8v-5.2H5.9a20 20 0 0 0 0 18.2l6.9-5.2Z"/><path fill="var(--auth-google-red)" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.9-5.9A19.8 19.8 0 0 0 24 4 20 20 0 0 0 5.9 14.9l6.9 5.2c1.6-4.7 6-8.2 11.2-8.2Z"/></svg>;
}

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/';
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) emailRef.current?.focus();
  }, []);

  function scrollMobileInputIntoView(event: ReactFocusEvent<HTMLInputElement>) {
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    const input = event.currentTarget;
    window.setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: authError } = await createClient().auth.signInWithPassword({ email, password });
      if (authError) setError(authError.message);
      else router.push(next);
    } catch {
      setError('เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setLoading(true);
    setError('');
    try {
      const { error: authError } = await createClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } });
      if (authError) setError(authError.message);
    } catch {
      setError('เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setLoading(false);
    }
  }

  return <AuthLayout><div className="auth-form-content">
    <h1 className="auth-title">{t('login')}</h1>
    <p className="auth-subtitle">เริ่มต้นลงทุนจำลองด้วยเงินสมมติ ฟรี</p>
    <form onSubmit={submit} className="auth-form">
      <label htmlFor="login-email">{t('email')}<span className="auth-input-wrap"><Icon name="mail" size={20} className="auth-input-icon" /><input ref={emailRef} id="login-email" required type="email" inputMode="email" autoComplete="email" placeholder="name@email.com" value={email} onChange={(event) => setEmail(event.target.value)} onFocus={scrollMobileInputIntoView} aria-invalid={Boolean(error)} /></span></label>
      <label htmlFor="login-password">{t('password')}<span className="auth-input-wrap"><Icon name="key" size={20} className="auth-input-icon" /><input id="login-password" required minLength={6} type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} onFocus={scrollMobileInputIntoView} aria-invalid={Boolean(error)} /><button type="button" className="auth-password-toggle" aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} onClick={() => setShowPassword((visible) => !visible)}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={20} /></button></span></label>
      {error && <p className="auth-error" role="alert"><Icon name="alert" size={18} />{error}</p>}
      <button className="auth-submit" type="submit" disabled={loading || !email.trim() || !password}>{loading ? <><span className="auth-spinner" aria-hidden="true" />กำลังเข้าสู่ระบบ…</> : t('login')}</button>
    </form>
    <div className="auth-divider"><span>หรือดำเนินการต่อด้วย</span></div>
    <button type="button" className="auth-google-button" onClick={google} disabled={loading}><GoogleMark />ดำเนินการต่อด้วย Google</button>
    <p className="auth-switch muted">ยังไม่มีบัญชี? <Link href="/signup">สมัครสมาชิกฟรี</Link></p>
    <p className="auth-disclaimer">{t('disclaimer')}</p>
  </div></AuthLayout>;
}

export default function LoginPage() {
  return <Suspense fallback={<main className="auth-shell"><div className="auth-card auth-loading-card"><span className="auth-spinner" /></div></main>}><LoginForm /></Suspense>;
}
