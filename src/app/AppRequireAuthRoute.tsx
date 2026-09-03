import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import { APP_ROUTES } from '@/app/routePaths';
import { PageLoader } from '@/ui/PageLoader';
import { writeStoredReferralInvite } from '@/utils/referralInvite';
import { REFERRAL_INVITE_SOURCES, readReferralInviteCodeFromSearch } from '../../shared/referral';

type AppRequireAuthRouteProps = {
  children: ReactNode;
};

export default function AppRequireAuthRoute({ children }: AppRequireAuthRouteProps) {
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

    const targetPath = location.pathname + location.search;
    navigate(APP_ROUTES.home, { replace: true });
    requireAuth(() => {
      navigate(targetPath);
    });
  }, [loading, user, navigate, location.pathname, location.search, requireAuth]);

  if (loading) return <PageLoader />;
  if (!user) {
    return null;
  }
  return <>{children}</>;
}
