import { Calendar, LineChart, Pin } from 'lucide-react';

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
      <SEO title="广告推广｜推推" description="登录推推账号后，即可选择广告位置、绑定帖子并预约投放日期。" />
      <PageHeader title="广告推广" onBack={onBack} />

      <PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">
        <AuthRequiredState
          icon={<Pin />}
          context="promote"
          tone="panel"
          density="compact"
          title="登录后开启广告推广"
          description="登录推推账号后，即可选择广告位置、绑定帖子并预约投放日期。"
          actionLabel="登录 / 注册"
          previewItems={[
            { icon: <Calendar aria-hidden="true" />, label: '排期预约', description: '选择热门曝光位置并锁定投放日期' },
            { icon: <Pin aria-hidden="true" />, label: '精准绑定', description: '支持置顶个人优秀帖子或商业介绍' },
            { icon: <LineChart aria-hidden="true" />, label: '效果分析', description: '实时查看曝光量、点击率与转化数据' },
          ]}
          onAction={onLogin}
        />
      </PageContentShell>
    </AppPage>
  );
}
