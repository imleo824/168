import { Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import SEO from '@/platform/SEO';
import AppPage from '@/ui/AppPage';
import PageContentShell from '@/ui/PageContentShell';
import PageHeader from '@/ui/PageHeader';
import { StateBlock } from '@/ui/LoadingState';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <AppPage mobileAddressBarScroll className="notfound-page">
      <SEO title="页面走丢了｜推推" description="你访问的页面不存在或已下线，请返回首页继续浏览。" noindex />

      <PageHeader title="页面走丢了" />

      <PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">
        <StateBlock
          title="页面走丢了"
          titleAs="h2"
          description="这个链接无效、已过期，或页面暂时不可用。"
          icon={<Home className="ui-state-icon-graphic" aria-hidden="true" />}
          tone="empty"
          className="notfound-state"
          actionLabel="返回首页"
          onAction={() => navigate('/', { replace: true })}
          secondaryActionLabel="返回上一页"
          onSecondaryAction={() => navigate(-1)}
          actionSize="md"
        />
      </PageContentShell>
    </AppPage>
  );
}
