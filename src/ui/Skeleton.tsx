import { memo, type CSSProperties } from 'react';
import AppPage from '@/ui/AppPage';
import { HomeChrome } from '@/features/home/HomeChrome';
import { DEFAULT_HOME_TOPIC_TAB_ID } from '@/features/home/HomeTopicTabs';
import PageHeader from '@/ui/PageHeader';
import PageContentShell from '@/ui/PageContentShell';
import { cn } from '@/utils/cn';
import {
  FEED_INITIAL_ANIMATED_ITEM_COUNT,
  HOME_INITIAL_FEED_SKELETON_COUNT,
  HOME_PAGE_FEED_SKELETON_COUNT,
} from '@/features/feed/feedContracts';

const HOME_FEED_PRIMARY_ACTION_PLACEHOLDERS = ['heat', 'like', 'comment', 'share', 'quote'] as const;

const HOME_FEED_ACTIONS_WITH_COUNT = new Set<(typeof HOME_FEED_PRIMARY_ACTION_PLACEHOLDERS)[number]>([
  'heat',
  'like',
  'comment',
]);

type HomeFeedSkeletonItemStyle = CSSProperties & {
  '--feed-list-item-index'?: number;
};

function getHomeFeedSkeletonItemStyle(index: number): HomeFeedSkeletonItemStyle | undefined {
  if (index >= FEED_INITIAL_ANIMATED_ITEM_COUNT) return undefined;
  return { '--feed-list-item-index': index } as HomeFeedSkeletonItemStyle;
}

interface SkeletonProps {
  className?: string;
  circle?: boolean;
}

export const Skeleton = memo(function Skeleton({
  className = '',
  circle = false,
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('ui-skeleton-shell', circle ? 'ui-skeleton-circle' : 'ui-skeleton-block', className)}
    >
      <div className="ui-skeleton-shimmer" />
    </div>
  );
});

function FeedSkeletonMoreAction() {
  return (
    <span className="ui-feed-skeleton-more-action" aria-hidden="true">
      <span className="ui-feed-skeleton-more-dot" />
      <span className="ui-feed-skeleton-more-dot" />
      <span className="ui-feed-skeleton-more-dot" />
    </span>
  );
}

function FeedSkeletonAuthorActions() {
  return (
    <span className="ui-feed-skeleton-author-actions" aria-hidden="true">
      <Skeleton className="ui-feed-skeleton-inline-action ui-feed-skeleton-inline-action--contact" />
      <Skeleton className="ui-feed-skeleton-inline-action ui-feed-skeleton-inline-action--follow" />
      <FeedSkeletonMoreAction />
    </span>
  );
}

function FeedSkeletonActionCell({
  action,
}: {
  action: (typeof HOME_FEED_PRIMARY_ACTION_PLACEHOLDERS)[number];
}) {
  const hasCount = HOME_FEED_ACTIONS_WITH_COUNT.has(action);

  return (
    <span className={`ui-feed-skeleton-action-cell ui-feed-skeleton-action-cell--${action}`}>
      <Skeleton className="ui-feed-skeleton-action-glyph" />
      {hasCount ? <Skeleton className="ui-feed-skeleton-action-count" /> : null}
    </span>
  );
}

export const PaymentInfoSkeleton = memo(function PaymentInfoSkeleton() {
  return (
    <div className="recharge-step recharge-step--instructions recharge-payment-skeleton" aria-label="付款信息加载中">
      <div className="recharge-payment-panel">
        <div className="recharge-token-panel">
          <div className="recharge-token-row">
            <div className="recharge-token-main">
              <Skeleton className="ui-skeleton-copy-line ui-skeleton-copy-line--short" />
              <Skeleton className="recharge-token-amount ui-skeleton-copy-line ui-skeleton-copy-line--wide" />
              <Skeleton className="ui-skeleton-chip ui-skeleton-chip--short" />
            </div>
            <Skeleton className="ui-skeleton-chip" />
          </div>
        </div>

        <div className="recharge-instruction-body">
          <div className="recharge-qr-wrap">
            <div className="ui-token-qr-card recharge-qr-card">
              <Skeleton className="recharge-qr-skeleton" />
            </div>
            <Skeleton className="ui-skeleton-copy-line ui-skeleton-copy-line--short" />
          </div>

          <div className="recharge-address-row">
            <Skeleton className="ui-mono-value recharge-address-value" />
            <Skeleton circle className="recharge-copy-button recharge-copy-button--icon-only" />
          </div>

          <Skeleton className="ui-skeleton-copy-line ui-skeleton-copy-line--wide" />
        </div>
      </div>
    </div>
  );
});

export const PostSkeleton = memo(function PostSkeleton({
  sponsored = false,
}: {
  sponsored?: boolean;
}) {
  return (
    <article
      className={cn(
        'ui-feed-skeleton-card ui-feed-skeleton-card--compact',
        sponsored && 'ui-feed-skeleton-card--sponsored',
      )}
      aria-label="内容加载中"
    >
      <div className="ui-feed-skeleton-layout">
        <div className="ui-feed-skeleton-avatar-column" aria-hidden="true">
          <span className="ui-feed-skeleton-avatar-frame">
            <Skeleton circle className="ui-feed-skeleton-avatar" />
          </span>
        </div>

        <div className="ui-feed-skeleton-main">
          <div className="ui-feed-skeleton-author">
            <div className="ui-feed-skeleton-identity">
              <div className="ui-feed-skeleton-name-line">
                <Skeleton className="ui-feed-skeleton-author-name" />
                <span className="ui-feed-skeleton-meta-dot" aria-hidden="true" />
                <Skeleton className="ui-feed-skeleton-author-time" />
              </div>
              {sponsored ? <Skeleton className="ui-feed-skeleton-sponsored-line" /> : null}
            </div>
            <FeedSkeletonAuthorActions />
          </div>

          <div className="ui-feed-skeleton-body">
            <div className="ui-skeleton-copy-stack">
              <Skeleton className="ui-skeleton-copy-line ui-skeleton-copy-line--full" />
              <Skeleton className="ui-skeleton-copy-line ui-skeleton-copy-line--wide" />
            </div>
            <div className="ui-feed-skeleton-tags" aria-hidden="true">
              <Skeleton className="ui-skeleton-chip" />
              <Skeleton className="ui-skeleton-chip ui-skeleton-chip--short" />
            </div>
          </div>

          <div className="ui-feed-skeleton-media-block">
            <Skeleton className="ui-skeleton-media ui-skeleton-media--feed" />
          </div>

          <div className="ui-feed-skeleton-footer" aria-hidden="true">
            <div className="ui-feed-skeleton-action-row">
              <span className="ui-feed-skeleton-action-group">
                {HOME_FEED_PRIMARY_ACTION_PLACEHOLDERS.map((action) => (
                  <span key={action}>
                    <FeedSkeletonActionCell action={action} />
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
});

export const HomeFeedSkeleton = memo(function HomeFeedSkeleton({
  count = HOME_INITIAL_FEED_SKELETON_COUNT,
  className = '',
}: {
  count?: number;
  className?: string;
}) {
  const itemCount = Math.max(1, Math.floor(count || HOME_INITIAL_FEED_SKELETON_COUNT));

  return (
    <div
      aria-label="正在加载内容"
      className={cn('post-feed-list-panel ui-skeleton-feed-list ui-skeleton-feed-list--home ui-home-feed-skeleton', className)}
    >
      {Array.from({ length: itemCount }).map((_, index) => (
        <div
          key={index}
          className="feed-list-item feed-list-item--animated ui-feed-skeleton-list-item"
          role="article"
          style={getHomeFeedSkeletonItemStyle(index)}
        >
          <PostSkeleton sponsored={index === 0} />
        </div>
      ))}
    </div>
  );
});

const noopHomeTopicTabSelect = () => undefined;
const noopHomeTopicFilterApply = () => undefined;

export const HomePageSkeleton = memo(function HomePageSkeleton({
  includeBottomNavigation = false,
}: {
  includeBottomNavigation?: boolean;
}) {
  return (
    <section
      className={cn(
        'home-page-skeleton home-mobile-shell home-document-scroll-shell home-has-sticky-topic-tabs surface-page',
        includeBottomNavigation && 'home-page-skeleton--with-bottom-nav',
      )}
      role="status"
      aria-live="polite"
      aria-label="首页正在加载"
    >
      <HomeChrome
        homeAds={[]}
        hasHomeAdBanner={false}
        categories={[]}
        activeHomeTopicTabId={DEFAULT_HOME_TOPIC_TAB_ID}
        loadingHomeTopicTabId={null}
        activeHomeTopicFilterCount={0}
        activeHomeTopicFilterFieldItems={[]}
        activeHomeTopicCategoryMetaFilters={{}}
        activeHomeTopicFilterSchema={null}
        locationPresets={[]}
        onlineCount={null}
        showHomeTopicFilters={false}
        onHomeTopicTabSelect={noopHomeTopicTabSelect}
        onHomeTopicCategoryMetaFilterApply={noopHomeTopicFilterApply}
      />

      <div className="home-mobile-feed-panel home-page-skeleton-feed-panel">
        <HomeFeedSkeleton count={HOME_PAGE_FEED_SKELETON_COUNT} className="home-page-skeleton-feed" />
      </div>

      {includeBottomNavigation ? (
        <div className="home-page-skeleton-bottom-nav" aria-hidden="true">
          <div className="home-page-skeleton-bottom-nav-inner">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} circle className="home-page-skeleton-bottom-nav-item" />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
});

type UserSpaceSkeletonProps = {
  mobile?: boolean;
};

export const UserSpaceSkeleton = memo(function UserSpaceSkeleton(_props: UserSpaceSkeletonProps) {
  return (
    <PageContentShell variant="fluid" className="user-space-body ui-app-page-main">
      <div className="profile-section profile-identity-section user-space-profile-section">
        <Skeleton className="profile-header-cover profile-header-cover--skeleton" />
        <section className="profile-identity-card user-space-profile-card user-space-profile-card--skeleton" aria-label="个人空间加载中">
          <div className="profile-identity-main user-space-profile-main">
            <div className="profile-avatar-stack user-space-avatar-stack">
              <Skeleton circle className="profile-avatar-button user-space-avatar-next user-space-avatar--skeleton" />
            </div>

            <div className="profile-stats-row user-space-stats user-space-stats-next" aria-hidden="true">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="profile-stat-item user-space-stat-item">
                  <Skeleton className="profile-stat-value ui-stat-value user-space-stat-value-skeleton" />
                  <Skeleton className="profile-stat-label ui-stat-label user-space-stat-label-skeleton" />
                </div>
              ))}
            </div>
          </div>

          <div className="profile-identity-copy user-space-profile-copy">
            <div className="profile-name-row user-space-name-row">
              <Skeleton className="profile-name-mobile profile-name-desktop user-space-name-mobile user-space-name-desktop user-space-name-skeleton" />
            </div>

            <div className="profile-bio-button profile-bio-inline user-space-bio-mobile user-space-bio-desktop">
              <Skeleton className="profile-bio-text user-space-bio-line-skeleton" />
            </div>

            <div className="user-space-plus-links" aria-hidden="true">
              <div className="user-space-plus-link-list">
                <Skeleton className="user-space-plus-link user-space-plus-text-link user-space-plus-link-skeleton" />
              </div>
            </div>
          </div>

          <div className="user-space-actions-next" data-contact-layout="split" aria-hidden="true">
            <Skeleton className="user-space-action user-space-action--skeleton" />
            <Skeleton className="user-space-action user-space-action--skeleton" />
          </div>
        </section>
      </div>

      <div className="user-space-posts-panel">
        <HomeFeedSkeleton count={3} className="user-space-post-list-skeleton" />
      </div>
    </PageContentShell>
  );
});

export const PageShellSkeleton = memo(function PageShellSkeleton() {
  return (
    <AppPage className="surface-page">
      <PageHeader title="加载中" />
      <PageContentShell>
        <HomeFeedSkeleton count={2} />
      </PageContentShell>
    </AppPage>
  );
});
