import { Pin } from 'lucide-react';

import SEO from '@/platform/SEO';
import AppPage from '@/ui/AppPage';
import AuthRequiredState from '@/ui/AuthRequiredState';
import PageHeader from '@/ui/PageHeader';
import PageContentShell from '@/ui/PageContentShell';

export function PromoteAuthRequiredPage({
  onBack,
  onLogin,
}: {
  onBack: () => void;
  onLogin: () => void;
}) {
  return (
    <AppPage bottomSafe className="promote-mobile-page promote-page surface-page">
      <SEO title="买曝光｜推推" description="登录后在推推预约曝光位置。" />
      <PageHeader title="买曝光" onBack={onBack} />

      <PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">
        <AuthRequiredState
          icon={<Pin />}
          context="promote"
          tone="panel"
          density="compact"
          title="登录后买曝光"
          description="登录后选择投放位置、帖子和日期。"
          actionLabel="登录 / 注册"
          onAction={onLogin}
        />
      </PageContentShell>
    </AppPage>
  );
}
