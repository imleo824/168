import ProfileMobilePage from '@/features/profile/ProfileMobilePage';
import { PageHeaderPolicyProvider } from '@/ui/PageHeaderPolicy';

import '@/features/profile/ProfileRoute.css';

const PROFILE_HEADER_POLICY = {
  topbarMode: 'static',
} as const;

export default function ProfileMobileRoute() {
  return (
    <PageHeaderPolicyProvider value={PROFILE_HEADER_POLICY}>
      <ProfileMobilePage />
    </PageHeaderPolicyProvider>
  );
}
