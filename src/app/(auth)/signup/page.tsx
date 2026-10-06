'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { t } from '@/lib/i18n';
import AuthLayout from '@/components/AuthLayout';
import Icon from '@/components/Icon';
import { isValidDisplayName } from '@/lib/rank/privacy';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() && !isValidDisplayName(name)) {
      setError('ชื่อที่แสดงต้องมี 3–20 ตัวอักษรและห้ามมี @');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error: authError } = await createClient().auth.signUp({ email, password, options: { data: { display_name: name.trim() } } });
      if (authError) setError(authError.message);
      else router.push('/');
    } catch {
      setError('สมัครสมาชิกไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setLoading(false);
    }
  }

  return <AuthLayout><div className="auth-form-content auth-signup-content">
    <h1 className="auth-title">{t('signup')}</h1>
    <p className="auth-subtitle">รับเงินสมมติเริ่มต้น $100,000 เพื่อฝึกลงทุน</p>
    <form onSubmit={submit} className="auth-form">
      <label htmlFor="signup-name">{t('displayName')}<span className="auth-input-wrap"><Icon name="user" size={20} className="auth-input-icon" /><input id="signup-name" autoComplete="nickname" maxLength={20} value={name} onChange={(event) => setName(event.target.value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ''))} placeholder="เว้นว่างได้" /></span></label>
      <label htmlFor="signup-email">{t('email')}<span className="auth-input-wrap"><Icon name="mail" size={20} className="auth-input-icon" /><input id="signup-email" required type="email" inputMode="email" autoComplete="email" placeholder="name@email.com" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(error)} /></span></label>
      <label htmlFor="signup-password">{t('password')}<span className="auth-input-wrap"><Icon name="key" size={20} className="auth-input-icon" /><input id="signup-password" required minLength={6} type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="อย่างน้อย 6 ตัวอักษร" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(error)} /><button type="button" className="auth-password-toggle" aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} onClick={() => setShowPassword((visible) => !visible)}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={20} /></button></span></label>
      {error && <p className="auth-error" role="alert"><Icon name="alert" size={18} />{error}</p>}
      <button className="auth-submit" type="submit" disabled={loading || !email.trim() || !password}>{loading ? <><span className="auth-spinner" aria-hidden="true" />กำลังสมัคร…</> : t('signup')}</button>
    </form>
    <p className="auth-switch muted">มีบัญชีแล้ว? <Link href="/login">เข้าสู่ระบบ</Link></p>
    <p className="auth-disclaimer">{t('disclaimer')}</p>
  </div></AuthLayout>;
}
