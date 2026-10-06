'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { isValidDisplayName } from '@/lib/rank/privacy';
import { t, type TranslationKey } from '@/lib/i18n';
import Avatar from '@/components/Avatar';
import ProfileCard from '@/components/ProfileCard';
import { usePortfolio } from '@/lib/portfolio/client';
import { useProfileSettings } from '@/lib/profile/client';
import { useViewerRank } from '@/lib/rank/client';
import type { ProfileSettings } from '@/lib/profile/response';
import { copyPlayerNumber } from '@/lib/profile/clipboard';
import Icon from '@/components/Icon';
import { profileAvatars, type ProfileAvatarId, type ProfileAvatarType } from '@/lib/profile/avatars';

const avatarMeaningKeys: Record<ProfileAvatarId, TranslationKey> = {
  bull: 'avatarBull', bear: 'avatarBear', cat: 'avatarCat', fox: 'avatarFox', turtle: 'avatarTurtle',
  squirrel: 'avatarSquirrel', owl: 'avatarOwl', wolf: 'avatarWolf', rabbit: 'avatarRabbit',
  penguin: 'avatarPenguin', shark: 'avatarShark', dragon: 'avatarDragon',
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [copyToast, setCopyToast] = useState('');
  const [editorMessage, setEditorMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [language, setLanguage] = useState<'th' | 'en'>('th');
  const [open, setOpen] = useState<'language' | null>(null);
  const [editing, setEditing] = useState(false);
  const [editorFocus, setEditorFocus] = useState<'name' | 'avatar'>('name');
  const [avatarType, setAvatarType] = useState<ProfileAvatarType>('initial');
  const [avatarCharacter, setAvatarCharacter] = useState<ProfileAvatarId | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const profileEditButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const profileSettings = useProfileSettings();
  const portfolio = usePortfolio();
  const viewerRank = useViewerRank(profileSettings.data?.leaderboard_visible === true);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!copyToast) return;
    const timeout = window.setTimeout(() => setCopyToast(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [copyToast]);
  useEffect(() => {
    if (!avatarFile) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  useEffect(() => {
    if (!editing) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const element = modalRef.current?.querySelector<HTMLElement>(editorFocus === 'avatar' ? '.profile-avatar-choice' : '[data-autofocus]');
      element?.focus();
      if (editorFocus === 'avatar') element?.scrollIntoView({ block: 'center' });
    });

    function trapFocus(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!saving) setEditing(false);
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [editing, saving, editorFocus]);

  function openEditor(focus: 'name' | 'avatar' = 'name') {
    const current = profileSettings.data;
    setName(current?.display_name_custom ? current.display_name : '');
    setAvatarType(current?.avatar_type ?? 'initial');
    setAvatarCharacter(current?.avatar_character ?? null);
    setAvatarFile(null);
    setEditorMessage('');
    setEditorFocus(focus);
    setEditing(true);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = profileSettings.data;
    const trimmedName = name.trim();
    const nameChanged = Boolean(trimmedName) && (!current?.display_name_custom || trimmedName !== current.display_name);
    const avatarChanged = Boolean(avatarFile)
      || avatarType !== (current?.avatar_type ?? 'initial')
      || (avatarType === 'character' && avatarCharacter !== current?.avatar_character);

    if (nameChanged && !isValidDisplayName(trimmedName)) {
      setEditorMessage(t('displayNameRule'));
      return;
    }
    if (!nameChanged && !avatarChanged) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setEditorMessage('');
    try {
      if (nameChanged) {
        const response = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name: trimmedName }),
        });
        const body = await response.json() as { data?: ProfileSettings; error?: { message: string } };
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? 'บันทึกไม่สำเร็จ');
        queryClient.setQueryData(['profile-settings'], body.data);
        setName(body.data.display_name);
      }

      if (avatarChanged) {
        const request = avatarFile
          ? (() => {
            const form = new FormData();
            form.set('file', avatarFile);
            return fetch('/api/profile/avatar', { method: 'POST', body: form });
          })()
          : fetch('/api/profile/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(avatarType === 'character'
              ? { avatar_type: 'character', avatar_character: avatarCharacter }
              : { avatar_type: 'initial' }),
          });
        const response = await request;
        const body = await response.json() as { data?: ProfileSettings; error?: { message: string } };
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? t('avatarUploadFailed'));
        queryClient.setQueryData(['profile-settings'], body.data);
      }

      void queryClient.invalidateQueries({ queryKey: ['rank'] });
      void queryClient.invalidateQueries({ queryKey: ['public-profile'] });
      if (nameChanged) void queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      setMessage(t('saved'));
      setEditing(false);
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : t('avatarUploadFailed'));
      void queryClient.invalidateQueries({ queryKey: ['profile-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['rank'] });
      void queryClient.invalidateQueries({ queryKey: ['public-profile'] });
      if (nameChanged) void queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    } finally {
      setSaving(false);
    }
  }

  async function changeVisibility(visible: boolean) {
    setVisibilitySaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboard_visible: visible }),
      });
      const body = await response.json() as { data?: ProfileSettings; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? 'บันทึกการตั้งค่าไม่สำเร็จ');
      queryClient.setQueryData(['profile-settings'], body.data);
      void queryClient.invalidateQueries({ queryKey: ['rank'] });
      void queryClient.invalidateQueries({ queryKey: ['public-profile'] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    queryClient.clear();
    router.push('/login');
    router.refresh();
  }

  function setLang(value: 'th' | 'en') {
    setLanguage(value);
    window.localStorage.setItem('papertrade-language', value);
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setEditorMessage(t('avatarFileTooLarge'));
      event.target.value = '';
      return;
    }
    if (!IMAGE_TYPES.includes(file.type)) {
      setEditorMessage(t('avatarFileTypeInvalid'));
      event.target.value = '';
      return;
    }
    setEditorMessage('');
    setAvatarFile(file);
    setAvatarType('upload');
    setAvatarCharacter(null);
    event.target.value = '';
  }

  const displayName = profileSettings.data?.display_name || 'Trader';
  const leaderboardVisible = profileSettings.data?.leaderboard_visible ?? true;
  const activeImage = filePreview
    ?? (avatarType === 'character' && avatarCharacter ? `/avatars/${avatarCharacter}.png` : null)
    ?? (avatarType === 'upload' ? profileSettings.data?.avatar_url ?? null : null);

  return (
    <div className="app-content settings-profile-page">
      <div className="settings-profile-background" aria-hidden="true" />
      {copyToast && <div className="trade-toast" role="status">{copyToast}</div>}
      <header className="settings-profile-heading">
        <div><p>InvestKub</p><h1>{t('me')}</h1><span>จัดการบัญชีและการตั้งค่าของคุณ</span></div>
        <button type="button" className="settings-heading-avatar" aria-label="แก้ไขโปรไฟล์" disabled={!profileSettings.data} onClick={() => openEditor()}><Avatar name={displayName} id={profileSettings.data?.public_id ?? 'profile'} size={56} ringColor="var(--accent-purple)" avatarType={profileSettings.data?.avatar_type} avatarCharacter={profileSettings.data?.avatar_character} avatarUrl={profileSettings.data?.avatar_url} /></button>
      </header>
      <ProfileCard profile={profileSettings.data} portfolio={portfolio.data} rank={viewerRank.data?.visible ? viewerRank.data.rank : null}
        loading={profileSettings.isLoading} portfolioLoading={portfolio.isLoading} error={profileSettings.isError || portfolio.isError || viewerRank.isError}
        retrying={profileSettings.isFetching || portfolio.isFetching || viewerRank.isFetching} editRef={profileEditButtonRef}
        onEdit={() => openEditor()} onAvatarEdit={() => openEditor('avatar')}
        onCopy={(number) => void copyPlayerNumber(number).then((copied) => setCopyToast(copied ? 'คัดลอกรหัสผู้เล่นแล้ว' : `คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอกรหัส #${number}`))}
        onRetry={() => { void profileSettings.refetch(); void portfolio.refetch(); if (leaderboardVisible) void viewerRank.refetch(); }} />
      <div className="section settings-menu">
        <button className="settings-row" onClick={() => setOpen(open === 'language' ? null : 'language')}>
          <span className="settings-icon"><Icon name="globe" size={20} /></span><span>{t('language')}</span><span className="settings-value">{language === 'th' ? 'ไทย' : 'English'}</span><Icon name="chevronRight" size={19} className="muted" />
        </button>
        {open === 'language' && <div className="settings-panel"><div className="segmented"><button className={language === 'th' ? 'active' : ''} onClick={() => setLang('th')}>{t('thai')}</button><button className={language === 'en' ? 'active' : ''} onClick={() => setLang('en')}>{t('english')}</button></div></div>}
        <button className="settings-row" onClick={() => void signOut()}>
          <span className="settings-icon danger-icon"><Icon name="logOut" size={20} /></span><span className="negative">{t('signOut')}</span><Icon name="chevronRight" size={19} className="muted" />
        </button>
      </div>
      <section className="section card privacy-setting" id="leaderboard-privacy">
        <label className="privacy-setting-control">
          <span className="privacy-setting-copy"><strong>{t('leaderboardPrivacyTitle')}</strong><small className="tiny muted">{t('leaderboardPrivacyHint')}</small></span>
          <input type="checkbox" className="privacy-switch-input" checked={leaderboardVisible} disabled={profileSettings.isLoading || visibilitySaving} onChange={(event) => void changeVisibility(event.target.checked)} aria-label={t('leaderboardPrivacyTitle')} />
          <span className="privacy-switch" aria-hidden="true" />
        </label>
        {profileSettings.data && !profileSettings.data.leaderboard_visible && <Link className="text-link profile-hidden-rank-link" href="/rank">{t('rankPrivacyHidden')} · {t('rankPrivacyLink')}</Link>}
      </section>
      {message && <p className="success-text section" role="status">{message}</p>}
      <p className="auth-disclaimer">{t('disclaimer')}</p>

      {editing && mounted && createPortal(
        <div className="profile-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(false); }}>
          <div ref={modalRef} className="profile-editor-modal" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
            <div className="profile-editor-heading">
              <span className="profile-editor-heading-icon"><Icon name="user" size={20} /></span>
              <div><h2 id="profile-editor-title">{t('editProfile')}</h2><p className="tiny muted">{t('profilePhoto')} · {t('displayName')}</p></div>
              <button type="button" className="profile-editor-close" aria-label={t('profileClose')} onClick={() => setEditing(false)} disabled={saving}><Icon name="x" size={20} /></button>
            </div>
            <form className="profile-editor-form" onSubmit={(event) => void saveProfile(event)}>
              <label className="profile-editor-label" htmlFor="profile-editor-name">{t('displayName')}</label>
              <input
                id="profile-editor-name"
                data-autofocus
                value={name}
                minLength={3}
                maxLength={20}
                placeholder={t('displayNamePlaceholder')}
                onChange={(event) => setName(event.target.value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ''))}
              />
              <p className="tiny muted profile-editor-hint">{t('displayNameRule')}</p>

              <div className="profile-avatar-preview-row">
                <span className="profile-avatar-preview">
                  {activeImage ? <Image src={activeImage} width={64} height={64} alt="" unoptimized /> : Array.from((name.trim() || displayName).trim())[0]?.toLocaleUpperCase('th-TH') ?? 'ผ'}
                </span>
                <div><strong>{t('profilePhoto')}</strong><p className="tiny muted">{avatarType === 'character' ? profileAvatars.find((item) => item.id === avatarCharacter)?.character : avatarType === 'upload' ? t('uploadPhoto') : t('defaultAvatar')}</p></div>
              </div>

              <div className="profile-editor-section-head"><h3>{t('chooseCharacter')}</h3><span>{profileAvatars.length}</span></div>
              <div className="profile-avatar-grid" role="group" aria-label={t('chooseCharacter')}>
                {profileAvatars.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    className={`profile-avatar-choice${avatarType === 'character' && avatarCharacter === avatar.id ? ' is-selected' : ''}`}
                    aria-pressed={avatarType === 'character' && avatarCharacter === avatar.id}
                    onClick={() => { setAvatarType('character'); setAvatarCharacter(avatar.id); setAvatarFile(null); setEditorMessage(''); }}
                  >
                    <span className="profile-avatar-choice-image"><Image src={`/avatars/${avatar.id}.png`} width={66} height={66} alt="" loading="lazy" unoptimized /></span>
                    <strong>{avatar.name}</strong>
                    <small>{t(avatarMeaningKeys[avatar.id])}</small>
                  </button>
                ))}
              </div>

              <div className="profile-editor-actions">
                <label className="profile-upload-button">
                  <Icon name="plus" size={18} />{t('uploadPhoto')}
                  <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} />
                </label>
                <button type="button" className={`profile-initial-button${avatarType === 'initial' ? ' is-selected' : ''}`} onClick={() => { setAvatarType('initial'); setAvatarCharacter(null); setAvatarFile(null); setEditorMessage(''); }}>
                  {t('defaultAvatar')}
                </button>
              </div>
              <p className="tiny muted profile-editor-hint">{t('avatarUploadHint')}</p>
              {editorMessage && <p className="profile-editor-error" role="alert">{editorMessage}</p>}
              <button className="primary-button profile-editor-save" type="submit" disabled={saving || (!name.trim() && !avatarFile && avatarType === (profileSettings.data?.avatar_type ?? 'initial') && (avatarType !== 'character' || avatarCharacter === profileSettings.data?.avatar_character))}>
                {saving ? t('loading') : t('save')}
              </button>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
