import { useState } from 'react';
import { Info } from 'lucide-react';

import SEO from '@/platform/SEO';
import AppPage from '@/ui/AppPage';
import PageHeader from '@/ui/PageHeader';
import PageContentShell from '@/ui/PageContentShell';
import TopbarIconButton from '@/ui/TopbarIconButton';
import ReferralInvitePageContent from '@/features/sponsor/ReferralInvitePageContent';

import '@/features/sponsor/ReferralRoute.css';

export default function ReferralInviteMobile() {
  const [isRulesOpen, setIsRulesOpen] = useState(false);

  return (
    <AppPage surface="workspace" mobileAddressBarScroll bottomSafe className="referral-page surface-page">
      <SEO title="邀请好友｜推推" description="邀请好友注册并充值后获得返佣，可提现或转为积分。" noindex />
      <PageHeader
        title="邀请好友"
        showBack
        titleAlign="center"
        right={(
          <TopbarIconButton
            icon={<Info aria-hidden="true" />}
            onClick={() => setIsRulesOpen(true)}
            ariaLabel="邀请规则"
            title="邀请规则"
          />
        )}
      />
      <PageContentShell as="main" className="referral-page-main ui-app-page-main">
        <ReferralInvitePageContent
          isRulesOpen={isRulesOpen}
          onCloseRules={() => setIsRulesOpen(false)}
        />
      </PageContentShell>
    </AppPage>
  );
}
