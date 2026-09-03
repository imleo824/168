import { lazy, Suspense, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ChevronRight, Crown, Edit2, MessageCircle, SlidersHorizontal, UserRound } from 'lucide-react';

import { APP_ROUTES } from '@/app/routePaths';
import AvatarImage from '@/ui/AvatarImage';
import EmptyStateCard from '@/ui/EmptyStateCard';
import LinkifiedText from '@/ui/LinkifiedText';
import ListLoadMoreState from '@/ui/ListLoadMoreState';
import { PageLoadingState } from '@/ui/LoadingState';
import UserSpaceTuiPlusLinks from '@/features/profile/UserSpaceTuiPlusLinks';
import { isTuiPlusActive } from '@/features/tui-plus/tuiPlusBenefits';
import { formatRelativeTime } from '@/utils/time';
import type { MyCommentItem } from '@/services/api';

import ProfileHeaderCover from './ProfileHeaderCover';
import { getProfileRelationName, getProfileRelationUsername } from './profileMobileUtils';

const LazyPostFeedList = lazy(() => import('@/features/feed/PostFeedList'));

export type ProfileTabType = 'POSTS' | 'COMMENTS' | 'QUOTES' | 'LIKED' | 'FOLLOWING' | 'FANS';

type ProfileStatItem = {
  key: string;
  label: string;
  value: string | number;
  tab?: ProfileTabType;
};

function getTuiPlusProfileLabel(user: any) {
  if (isTuiPlusActive(user)) {
    return user?.plusStatus === 'TRIALING' ? '会员试用中' : '推推会员';
  }
  return user?.plusTrialUsed ? '续费会员' : '免费试用7天';
}

export function ProfileIdentitySection({
  user,
  avatarUrl,
  coverUrl,
  profileStats,
  activeTab,
  isUploadingAvatar,
  onCoverClick,
  onAvatarClick,
  onEditHome,
  onTabChange,
}: {
  user: any;
  avatarUrl: string;
  coverUrl: string;
  profileStats: ProfileStatItem[];
  activeTab: ProfileTabType;
  isUploadingAvatar: boolean;
  onCoverClick: () => void;
  onAvatarClick: () => void;
  onEditHome: () => void;
  onTabChange: (tab: ProfileTabType) => void;
}) {
  const navigate = useNavigate();
  const tuiPlusActive = isTuiPlusActive(user);
  const tuiPlusLabel = getTuiPlusProfileLabel(user);
  const openBioEditor = () => navigate(APP_ROUTES.profileBioEditor);

  return (
    <div className="profile-section profile-identity-section">
      <ProfileHeaderCover
        coverUrl={coverUrl}
        onClick={onCoverClick}
        showEditBadge={false}
      />
      <button
        type="button"
        onClick={onEditHome}
        className="profile-cover-settings-button pressable"
        aria-label="编辑个人信息"
        title="编辑个人信息"
      >
        <SlidersHorizontal aria-hidden="true" />
      </button>
      <section className="profile-identity-card" aria-label="个人资料">
        <div className="profile-identity-main">
          <div className="profile-avatar-stack">
            <button
              type="button"
              onClick={onAvatarClick}
              className="profile-avatar-button pressable ui-avatar-action focus-brand-ring"
              data-tui-plus={tuiPlusActive ? 'true' : undefined}
              aria-label="更换头像"
              disabled={isUploadingAvatar}
            >
              <AvatarImage
                src={avatarUrl}
                name={user?.displayName}
                id={user?.id}
                alt={`${user?.displayName || '用户'}的个人头像`}
                className="ui-avatar-lg profile-avatar-image"
                variant="thumb"
                isTuiPlus={tuiPlusActive}
              />
              <div className="profile-avatar-hover-mask" />
              <span className="profile-avatar-camera-badge" aria-hidden="true">
                <Camera className="profile-avatar-camera-icon" />
              </span>
            </button>
          </div>
          <div className="profile-stats-row" aria-label="个人数据">
            {profileStats.map((item) => {
              const statContent = (
                <>
                  <span className="profile-stat-value">{item.value}</span>
                  <span className="profile-stat-label">{item.label}</span>
                </>
              );
              return item.tab ? (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onTabChange(item.tab as ProfileTabType)}
                  className="profile-stat-item pressable"
                  aria-pressed={activeTab === item.tab}
                >
                  {statContent}
                </button>
              ) : (
                <div key={item.key} className="profile-stat-item" aria-label={`${item.label} ${item.value}`}>
                  {statContent}
                </div>
              );
            })}
          </div>
        </div>

        <div className="profile-identity-copy">
          <div className="profile-name-row">
            <span className="profile-name-mobile profile-name-desktop">
              {user.displayName || '我的'}
            </span>
            <button
              type="button"
              onClick={() => navigate(APP_ROUTES.tuiPlus)}
              className="profile-tui-plus-chip pressable"
              data-state={tuiPlusActive ? 'active' : 'trial'}
              aria-label="打开 Tui Plus 会员"
            >
              <Crown className="profile-tui-plus-chip-icon" aria-hidden="true" />
              {tuiPlusLabel}
            </button>
          </div>

          {user.bio ? (
            <div className="profile-bio-button profile-bio-inline">
              <LinkifiedText text={user.bio} className="profile-bio-text" />
              <button
                type="button"
                onClick={openBioEditor}
                className="profile-bio-edit-button pressable"
                aria-label="编辑个人简介"
              >
                <Edit2 className="profile-bio-edit-icon" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openBioEditor}
              className="profile-bio-button profile-bio-inline pressable"
            >
              <span className="profile-bio-text">点击添加简介，让大家认识你</span>
              <Edit2 className="profile-bio-edit-icon" aria-hidden="true" />
            </button>
          )}

          <UserSpaceTuiPlusLinks
            safeId={user.id}
            displayUser={user}
            isOwnProfile
          />
        </div>
      </section>
    </div>
  );
}

function ProfileRelationList({
  users,
  loading,
  hasMore,
  loadingText,
  emptyTitle,
  onLoadMore,
  onOpenUser,
}: {
  users: any[];
  loading: boolean;
  hasMore: boolean;
  loadingText: string;
  emptyTitle: string;
  onLoadMore: () => void;
  onOpenUser: (userId: string) => void;
}) {
  if (loading && users.length === 0) return <PageLoadingState text={loadingText} className="profile-tab-loading" />;
  if (users.length === 0) return <EmptyStateCard title={emptyTitle} />;

  return (
    <div className="profile-relation-list-shell">
      {users.map((u: any) => {
        const displayName = getProfileRelationName(u);
        const username = getProfileRelationUsername(u);
        const tuiPlusActive = isTuiPlusActive(u);
        return (
          <button
            type="button"
            key={u.id}
            onClick={() => onOpenUser(u.id)}
            className="surface-card surface-card-hover pressable ui-user-list-row"
            aria-label={`查看用户${displayName}`}
          >
            <div className="profile-relation-person">
              <AvatarImage
                src={u.photoUrl || ''}
                name={displayName}
                id={u.id}
                alt={displayName}
                className="profile-user-list-avatar"
                variant="thumb"
                isTuiPlus={tuiPlusActive}
              />
              <div className="profile-relation-copy">
                <h4 className="profile-relation-name">{displayName}</h4>
                {username ? (
                  <p className="profile-relation-username">@{username}</p>
                ) : null}
              </div>
            </div>
            <ChevronRight className="profile-relation-chevron" aria-hidden="true" />
          </button>
        );
      })}
      <ListLoadMoreState
        loading={loading}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        loadingText={loadingText}
        loadMoreText="加载更多"
        className={hasMore || loading ? 'profile-relation-load-more' : 'profile-relation-load-more is-hidden'}
      />
    </div>
  );
}

function ProfileCommentList({
  comments,
  loading,
}: {
  comments: MyCommentItem[];
  loading: boolean;
}) {
  if (loading) return <PageLoadingState text="正在加载评论" className="profile-tab-loading" />;
  if (comments.length === 0) return <EmptyStateCard title="暂无评论" />;

  return (
    <div className="profile-comment-list">
      {comments.map((comment) => (
        <article key={comment.id} className="surface-card profile-comment-card">
          <div className="profile-comment-card-header">
            <span>评论了</span>
            <time>{formatRelativeTime(comment.createdAt)}</time>
          </div>
          <p className="profile-comment-card-content">{comment.content}</p>
          <div className="profile-comment-card-post">
            <span>{comment.post?.title || comment.post?.content || '原帖内容'}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

export function ProfileListSection({
  activeTab,
  posts,
  comments,
  quotePosts,
  likedPosts,
  followingUsers,
  fans,
  postsLoading,
  commentsLoading,
  quotePostsLoading,
  likedLoading,
  followingLoading,
  fansLoading,
  isFetchingNextFollowingUsers,
  hasMoreFollowingUsers,
  isFetchingNextFans,
  hasMoreFans,
  telegramChannelUrl,
  loadingFallback,
  onStatusChange,
  onDelete,
  onTelegramSync,
  onFetchNextFollowingUsers,
  onFetchNextFans,
  onOpenUser,
}: {
  activeTab: ProfileTabType;
  posts: any[];
  comments: MyCommentItem[];
  quotePosts: any[];
  likedPosts: any[];
  followingUsers: any[];
  fans: any[];
  postsLoading: boolean;
  commentsLoading: boolean;
  quotePostsLoading: boolean;
  likedLoading: boolean;
  followingLoading: boolean;
  fansLoading: boolean;
  isFetchingNextFollowingUsers: boolean;
  hasMoreFollowingUsers: boolean;
  isFetchingNextFans: boolean;
  hasMoreFans: boolean;
  telegramChannelUrl: string | null;
  loadingFallback?: ReactNode;
  onStatusChange: (post: any, isPublished: boolean) => void;
  onDelete: (post: any) => void;
  onTelegramSync: (post: any) => void;
  onFetchNextFollowingUsers: () => void;
  onFetchNextFans: () => void;
  onOpenUser: (userId: string) => void;
}) {
  const commonProps = { onStatusChange, onDelete, onTelegramSync, telegramChannelUrl };
  const renderLoading = (text: string) => loadingFallback || <PageLoadingState text={text} className="profile-tab-loading" />;
  const renderPostFeed = (postsToRender: any[], extraProps = {}) => (
    <Suspense fallback={renderLoading('正在加载内容')}>
      <LazyPostFeedList
        posts={postsToRender}
        enableRecommendationControls={false}
        {...commonProps}
        {...extraProps}
      />
    </Suspense>
  );

  if (activeTab === 'POSTS') {
    if (postsLoading) return <>{renderLoading('正在加载动态内容...')}</>;
    if (posts.length === 0) return <EmptyStateCard title="暂无发布内容" description="您发布的帖子动态将在此展示" />;
    return renderPostFeed(posts);
  }

  if (activeTab === 'COMMENTS') {
    return <ProfileCommentList comments={comments} loading={commentsLoading} />;
  }

  if (activeTab === 'QUOTES') {
    if (quotePostsLoading) return <>{renderLoading('正在加载引用内容...')}</>;
    if (quotePosts.length === 0) return <EmptyStateCard title="暂无引用内容" />;
    return renderPostFeed(quotePosts);
  }

  if (activeTab === 'LIKED') {
    if (likedLoading) return <>{renderLoading('正在加载赞过的内容...')}</>;
    if (likedPosts.length === 0) return <EmptyStateCard title="暂无点赞内容" description="您表达赞赏的帖子将在此展示" />;
    return renderPostFeed(likedPosts, { onStatusChange: undefined, onDelete: undefined, onTelegramSync: undefined, telegramChannelUrl: undefined });
  }

  if (activeTab === 'FOLLOWING') {
    return (
      <ProfileRelationList
        users={followingUsers}
        loading={followingLoading || isFetchingNextFollowingUsers}
        hasMore={hasMoreFollowingUsers}
        loadingText="正在加载关注列表..."
        emptyTitle="暂无关注用户"
        onLoadMore={onFetchNextFollowingUsers}
        onOpenUser={onOpenUser}
      />
    );
  }

  return (
    <ProfileRelationList
      users={fans}
      loading={fansLoading || isFetchingNextFans}
      hasMore={hasMoreFans}
      loadingText="正在加载粉丝列表..."
      emptyTitle="暂无粉丝关注"
      onLoadMore={onFetchNextFans}
      onOpenUser={onOpenUser}
    />
  );
}
