import { SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { PageHeaderPolicyProvider } from '@/ui/PageHeaderPolicy';
import TopbarIconButton from '@/ui/TopbarIconButton';
import ProfileMobilePage from '@/features/profile/ProfileMobilePage';
import { requestProfileSettingsOpen } from '@/features/profile/profileSettingsIntent';

export default function ProfileMobileRoute() {
  const { user } = useAuth();
  const { guarded: guardedOpenProfileSettings } = useInteractionGuard(requestProfileSettingsOpen, {
    policy: 'critical',
    cooldownMs: 520,
    minPendingMs: 120,
    mode: 'drop',
  });

  return (
    <PageHeaderPolicyProvider
      value={{
        forceShowBack: false,
        topbarMode: 'static',
        right: user ? (
          <TopbarIconButton
            icon={<SlidersHorizontal aria-hidden="true" />}
            onClick={() => void guardedOpenProfileSettings()}
            ariaLabel="编辑个人信息"
            title="编辑个人信息"
            tone="default"
          />
        ) : undefined,
      }}
    >
      <ProfileMobilePage />
    </PageHeaderPolicyProvider>
  );
}
