import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { APP_ROUTES } from '@/app/routePaths';
import { useAuth } from '@/context/AuthContext';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import SEO from '@/platform/SEO';
import { apiFetch } from '@/services/api';
import ActionButton from '@/ui/ActionButton';
import AppPage from '@/ui/AppPage';
import PageContentShell from '@/ui/PageContentShell';
import PageHeader from '@/ui/PageHeader';
import { InlineSpinner } from '@/ui/LoadingState';

const PROFILE_BIO_MAX_LENGTH = 160;

export default function ProfileBioEditorMobile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, refreshUser, patchUser, showToast } = useAuth();
  const [bio, setBio] = useState(() => String(user?.bio || '').slice(0, PROFILE_BIO_MAX_LENGTH));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setBio(String(user?.bio || '').slice(0, PROFILE_BIO_MAX_LENGTH));
  }, [user?.bio, user?.id]);

  const cleanBio = bio.trim();
  const isDirty = cleanBio !== String(user?.bio || '').trim();
  const remainingCount = useMemo(() => Math.max(0, PROFILE_BIO_MAX_LENGTH - bio.length), [bio.length]);

  const goBack = useCallback(() => {
    navigate(APP_ROUTES.profile, { replace: true });
  }, [navigate]);

  const saveBio = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/me/bio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: cleanBio }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || body?.message || '保存失败');
      }
      patchUser({ bio: cleanBio });
      await refreshUser(true);
      if (user?.id) queryClient.invalidateQueries({ queryKey: ['user-profile', user.id] });
      showToast('简介保存成功', 'success');
      navigate(APP_ROUTES.profile, { replace: true });
    } catch (error: any) {
      showToast(error?.message || '保存简介失败', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [cleanBio, isSaving, navigate, patchUser, queryClient, refreshUser, showToast, user?.id]);

  const { guarded: guardedSaveBio, isPending: saveGuardPending } = useInteractionGuard(saveBio, {
    policy: 'critical',
    cooldownMs: 640,
    minPendingMs: 180,
    mode: 'drop',
  });
  const saveBusy = isSaving || saveGuardPending;

  return (
    <AppPage mobileAddressBarScroll bottomSafe className="profile-bio-editor-page surface-page">
      <SEO title="编辑简介｜推推" description="编辑推推个人主页简介。" noindex />
      <PageHeader title="编辑简介" showBack titleAlign="center" onBack={goBack} />

      <PageContentShell as="main" className="profile-bio-editor-main ui-app-page-main">
        <section className="profile-bio-editor-card" aria-label="编辑个人简介">
          <label className="profile-bio-editor-label" htmlFor="profile-bio-editor-field">个人简介</label>
          <textarea
            id="profile-bio-editor-field"
            className="profile-bio-editor-field"
            value={bio}
            maxLength={PROFILE_BIO_MAX_LENGTH}
            onChange={(event) => setBio(event.target.value.slice(0, PROFILE_BIO_MAX_LENGTH))}
            placeholder="介绍一下自己，让大家更快认识你"
            disabled={saveBusy}
            autoFocus
          />
          <div className="profile-bio-editor-meta">
            <span>会展示在你的个人主页。</span>
            <span>{remainingCount}</span>
          </div>
        </section>
      </PageContentShell>

      <section className="profile-bio-editor-sticky ui-checkout-bar" aria-label="保存个人简介">
        <div className="profile-bio-editor-sticky-shell">
          <ActionButton
            type="button"
            variant={isDirty && !saveBusy ? 'brand' : 'disabled'}
            disabled={!isDirty || saveBusy}
            state={saveBusy ? 'loading' : 'idle'}
            className="profile-bio-editor-save"
            onClick={() => void guardedSaveBio()}
          >
            {saveBusy ? <InlineSpinner /> : null}
            {saveBusy ? '保存中...' : '保存'}
          </ActionButton>
        </div>
      </section>
    </AppPage>
  );
}
