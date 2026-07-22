import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { APP_ROUTES } from '@/app/routePaths';
import { useAuth } from '@/context/AuthContext';
import PageContentShell from '@/ui/PageContentShell';
import { PageLoader } from '@/ui/PageLoader';
import TuiPlusBenefitPromptDialog from '@/features/tui-plus/TuiPlusBenefitPromptDialog';
import {
  buildTuiPlusBenefitRouteState,
  isTuiPlusActive,
  type TuiPlusBenefitKey,
} from '@/features/tui-plus/tuiPlusBenefits';

type AppRequireTuiPlusRouteProps = {
  children: ReactNode;
  benefit?: TuiPlusBenefitKey;
};

function defaultFallbackForBenefit(benefit: TuiPlusBenefitKey) {
  if (benefit === 'profileLinks') return APP_ROUTES.profile;
  if (benefit === 'promotionBooking') return APP_ROUTES.sponsor;
  return APP_ROUTES.home;
}

function getFallbackFrom(location: ReturnType<typeof useLocation>, benefit: TuiPlusBenefitKey) {
  const stateFrom = typeof (location.state as any)?.from === 'string' ? (location.state as any).from : '';
  return stateFrom || defaultFallbackForBenefit(benefit);
}

export default function AppRequireTuiPlusRoute({ children, benefit = 'generic' }: AppRequireTuiPlusRouteProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = `${location.pathname}${location.search}`;

  if (loading) return <PageLoader />;
  if (isTuiPlusActive(user)) return <>{children}</>;

  return (
    <PageContentShell className="ui-auth-required-wrap ui-app-page-main">
      <TuiPlusBenefitPromptDialog
        open
        benefit={benefit}
        onClose={() => navigate(getFallbackFrom(location, benefit), { replace: true })}
        onConfirm={() => navigate(APP_ROUTES.tuiPlus, { replace: true, state: buildTuiPlusBenefitRouteState(benefit, currentPath) })}
      />
    </PageContentShell>
  );
}
