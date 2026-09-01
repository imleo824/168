import { lazy, Suspense, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { APP_ROUTES } from '@/app/routePaths';
import { useAuth } from '@/context/AuthContext';
import AppPage from '@/ui/AppPage';
import PageHeader from '@/ui/PageHeader';
import PageContentShell from '@/ui/PageContentShell';
import { PageLoader } from '@/ui/PageLoader';
import {
  buildTuiPlusBenefitRouteState,
  isTuiPlusActive,
  type TuiPlusBenefitKey,
} from '@/features/tui-plus/tuiPlusBenefits';

type AppRequireTuiPlusRouteProps = {
  children: ReactNode;
  benefit?: TuiPlusBenefitKey;
};

const LazyTuiPlusBenefitPromptDialog = lazy(() => import('@/features/tui-plus/TuiPlusBenefitPromptDialog'));

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
  const fallbackPath = getFallbackFrom(location, benefit);

  if (loading) return <PageLoader />;
  // Membership is an entitlement check for an authenticated account. Let a
  // contextual guest state explain the task and open the shared sign-in flow.
  if (!user) return <>{children}</>;
  if (isTuiPlusActive(user)) return <>{children}</>;

  return (
    <AppPage mobileAddressBarScroll bottomSafe className="tui-plus-required-page surface-page">
      <PageHeader title="推推会员" titleAlign="center" onBack={() => navigate(fallbackPath, { replace: true })} />
      <PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">
        <Suspense fallback={<PageLoader />}>
          <LazyTuiPlusBenefitPromptDialog
            open
            benefit={benefit}
            onClose={() => navigate(fallbackPath, { replace: true })}
            onConfirm={() => navigate(APP_ROUTES.tuiPlus, { replace: true, state: buildTuiPlusBenefitRouteState(benefit, currentPath) })}
          />
        </Suspense>
      </PageContentShell>
    </AppPage>
  );
}
