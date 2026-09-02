import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, UserRound } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { APP_ROUTES } from '@/app/routePaths';
import SEO from '@/platform/SEO';
import AppPage from '@/ui/AppPage';
import { PageLoader } from '@/ui/PageLoader';
import PageHeader from '@/ui/PageHeader';
import PageContentShell from '@/ui/PageContentShell';
import { writeStoredReferralInvite } from '@/utils/referralInvite';
import { REFERRAL_INVITE_SOURCES, readReferralInviteCodeFromSearch } from '../../shared/referral';

type AuthRouteMeta = {
  documentTitle: string;
  pageTitle: string;
  showBack: boolean;
};

const AUTH_ROUTE_META: Record<string, AuthRouteMeta> = {
  [APP_ROUTES.create]: { documentTitle: '登录后发布｜推推', pageTitle: '发布分类信息', showBack: true },
  [APP_ROUTES.messages]: { documentTitle: '登录后查看消息｜推推', pageTitle: '消息', showBack: false },
  [APP_ROUTES.sponsor]: { documentTitle: '登录后进入推广｜推推', pageTitle: '推广', showBack: false },
  [APP_ROUTES.invite]: { documentTitle: '登录后邀请好友｜推推', pageTitle: '邀请好友', showBack: true },
  [APP_ROUTES.inviteRecords]: { documentTitle: '登录后查看邀请记录｜推推', pageTitle: '邀请记录', showBack: true },
  [APP_ROUTES.promote]: { documentTitle: '登录后推广内容｜推推', pageTitle: '付费推广', showBack: true },
  [APP_ROUTES.promotions]: { documentTitle: '登录后查看推广记录｜推推', pageTitle: '推广记录', showBack: true },
  [APP_ROUTES.promotionEffects]: { documentTitle: '登录后查看效果分析｜推推', pageTitle: '效果分析', showBack: true },
  [APP_ROUTES.recharge]: { documentTitle: '登录后充值积分｜推推', pageTitle: '充值积分', showBack: true },
  [APP_ROUTES.transactions]: { documentTitle: '登录后查看交易记录｜推推', pageTitle: '交易记录', showBack: true },
  [APP_ROUTES.tuiPlus]: { documentTitle: '登录后开通推推会员｜推推', pageTitle: '推推会员', showBack: true },
  [APP_ROUTES.tuiPlusLinkEditor]: { documentTitle: '登录后管理会员主页外链｜推推', pageTitle: '会员主页外链', showBack: true },
  [APP_ROUTES.notificationSettings]: { documentTitle: '登录后管理通知｜推推', pageTitle: '通知设置', showBack: true },
};

function getAuthRouteMeta(pathname: string) {
  return AUTH_ROUTE_META[pathname] || { documentTitle: '登录后继续｜推推', pageTitle: '需要登录', showBack: true };
}

type AppRequireAuthRouteProps = {
  children: ReactNode;
  /**
   * Lets a route render its own guest state after authentication has resolved.
   * The route remains inside the shared loading and referral-attribution flow;
   * this only preserves a task-specific sign-in explanation when it exists.
   */
  allowContextualGuestState?: boolean;
};

export default function AppRequireAuthRoute({ children, allowContextualGuestState = false }: AppRequireAuthRouteProps) {
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

    if (!allowContextualGuestState) {
      const targetPath = location.pathname + location.search;
      navigate(APP_ROUTES.home, { replace: true });
      requireAuth(() => {
        navigate(targetPath);
      });
    }
  }, [loading, user, navigate, location.pathname, location.search, requireAuth, allowContextualGuestState]);

  if (loading) return <PageLoader />;
  if (!user && !allowContextualGuestState) {
    return null;
  }
  return <>{children}</>;
}
