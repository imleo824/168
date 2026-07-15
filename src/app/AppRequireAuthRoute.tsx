import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldCheck, UserRound } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import SEO from '@/platform/SEO';
import { PageLoader } from '@/ui/PageLoader';
import PageContentShell from '@/ui/PageContentShell';
import AuthRequiredState from '@/ui/AuthRequiredState';
import { writeStoredReferralInvite } from '@/utils/referralInvite';
import { REFERRAL_INVITE_SOURCES, readReferralInviteCodeFromSearch } from '../../shared/referral';

const AUTH_ROUTE_TITLES: Record<string, string> = {
  '/create': '登录后发布｜推推',
  '/messages': '登录后查看消息｜推推',
  '/sponsor': '登录后进入推广｜推推',
  '/invite': '登录后邀请好友｜推推',
  '/invite/records': '登录后查看邀请记录｜推推',
  '/promote': '登录后推广内容｜推推',
  '/promotions': '登录后查看推广记录｜推推',
  '/promotion-effects': '登录后查看效果分析｜推推',
  '/recharge': '登录后充值积分｜推推',
  '/transactions': '登录后查看交易记录｜推推',
  '/settings/notifications': '登录后管理通知｜推推',
};

function getAuthRouteTitle(pathname: string) {
  return AUTH_ROUTE_TITLES[pathname] || '登录后继续｜推推';
}

export default function AppRequireAuthRoute({ children }: { children: ReactNode }) {
  const { user, loading, requireAuth } = useAuth();
  const location = useLocation();
  const handledInviteCodeRef = useRef('');

  useEffect(() => {
    if (loading || user) return;
    const inviteCode = readReferralInviteCodeFromSearch(location.search);
    if (!inviteCode || handledInviteCodeRef.current === inviteCode) return;
    handledInviteCodeRef.current = inviteCode;
    writeStoredReferralInvite({ code: inviteCode, source: REFERRAL_INVITE_SOURCES.LINK });
    requireAuth();
  }, [loading, location.search, requireAuth, user]);

  if (loading) return <PageLoader />;
  if (!user) {
    return (
      <>
        <SEO
          title={getAuthRouteTitle(location.pathname)}
          description="登录推推后继续访问发布、推广、充值和个人记录等账号功能。"
          canonicalPath={location.pathname}
          noindex
        />
        <PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">
          <AuthRequiredState
            titleAs="h1"
            title="需要登录"
            description="登录后可查看仅属于你的记录与操作历史。"
            actionLabel="登录 / 注册"
            onAction={() => requireAuth()}
            icon={<ShieldCheck />}
            context="records"
            tone="panel"
            density="compact"
            previewItems={[
              { icon: <ShieldCheck aria-hidden="true" />, label: '私有记录', description: '只展示当前账号可见的数据' },
              { icon: <UserRound aria-hidden="true" />, label: '账号同步', description: '登录后恢复个人资料和历史操作' },
            ]}
          />
        </PageContentShell>
      </>
    );
  }
  return <>{children}</>;
}
