import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { PageLoader } from '@/ui/PageLoader';
import PageContentShell from '@/ui/PageContentShell';
import AuthRequiredState from '@/ui/AuthRequiredState';
import { writeStoredReferralInvite } from '@/utils/referralInvite';
import { REFERRAL_INVITE_SOURCES, readReferralInviteCodeFromSearch } from '../../shared/referral';

type AppRequireAuthRouteProps = {
  children: ReactNode;
  allowContextualGuestState?: boolean;
};

export default function AppRequireAuthRoute({
  children,
  allowContextualGuestState = false,
}: AppRequireAuthRouteProps) {
  const { user, loading, requireAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const handledInviteCodeRef = useRef('');

  useEffect(() => {
    if (loading || user) return;

    const inviteCode = readReferralInviteCodeFromSearch(location.search);
    if (inviteCode && handledInviteCodeRef.current !== inviteCode) {
      handledInviteCodeRef.current = inviteCode;
      writeStoredReferralInvite({ code: inviteCode, source: REFERRAL_INVITE_SOURCES.LINK });
    }
  }, [loading, user, location.search]);

  if (loading) return <PageLoader />;

  if (!user && !allowContextualGuestState) {
    return (
      <PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">
        <AuthRequiredState
          titleAs="h1"
          title="需要登录后继续"
          description="该功能需要登录账号后使用，请先登录或注册"
          actionLabel="立即登录"
          onAction={() => requireAuth(() => navigate(location.pathname + location.search))}
          icon={<LogIn />}
          context="records"
          tone="panel"
          density="compact"
        />
      </PageContentShell>
    );
  }

  return <>{children}</>;
}
