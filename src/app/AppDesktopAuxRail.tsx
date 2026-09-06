import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Flame,
  TrendingUp,
  ExternalLink,
  Pin,
  Image as ImageIcon,
  Eye,
  MessageSquare,
  Heart,
  Megaphone,
  ChevronRight,
  LayoutGrid,
} from 'lucide-react';
import { getAllActivePromotions } from '@/services/api';
import { APP_ROUTES } from '@/app/routePaths';
import { PromotionType, type PromotionBooking } from '@/types';
import { warmupNavigationIntent, warmupRoutePath } from '@/utils/routeWarmups';
import { resolveAdTargetUrlInput } from '@/utils/adTargetUrl';
import { useHomeBootstrap } from '@/hooks/useDataConfig';
import AvatarImage from '@/ui/AvatarImage';
import '@/styles/features/aux-rail.css';

function getPromotionTag(type: string, booking?: PromotionBooking) {
  if (type === PromotionType.AD_HOME) {
    return { label: '横幅广告', tagClass: 'app-desktop-aux-rail-tag-amber' };
  }
  if (type === PromotionType.PIN_HOME) {
    return { label: '热门置顶', tagClass: 'app-desktop-aux-rail-tag-rose' };
  }
  if (type === PromotionType.PIN_CATEGORY) {
    const categoryName = booking?.post?.category?.name || (booking as any)?.category?.name;
    return {
      label: categoryName ? `${categoryName}置顶` : '分类置顶',
      tagClass: 'app-desktop-aux-rail-tag-indigo',
    };
  }
  if (type === PromotionType.PIN_CHAT) {
    return { label: '聊天室置顶', tagClass: 'app-desktop-aux-rail-tag-emerald' };
  }
  return { label: '精选推广', tagClass: 'app-desktop-aux-rail-tag-amber' };
}

function formatAdTargetDisplay(raw?: string | null) {
  if (!raw) return '';
  const resolved = resolveAdTargetUrlInput(raw);
  const target = resolved.value || raw;
  try {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      const parsed = new URL(target);
      return parsed.hostname.replace(/^www\./, '');
    }
    if (target.startsWith('tg://')) {
      return 'Telegram';
    }
    return target;
  } catch {
    return target;
  }
}

export const AppDesktopAuxRail: React.FC = () => {
  const navigate = useNavigate();
  // The home first-screen request is the only network owner for bootstrap data.
  // Other routes can still consume an already-populated snapshot without
  // creating a duplicate request solely for the desktop rail.
  const { data: homeBootstrap } = useHomeBootstrap(false);

  const { data: promotions, isLoading: isLoadingPromos } = useQuery<PromotionBooking[]>({
    queryKey: ['promotions', 'all-active'],
    queryFn: () => getAllActivePromotions(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const activePromotions = useMemo(() => {
    const list: PromotionBooking[] = [];
    const seenKeys = new Set<string>();

    const addBooking = (item: PromotionBooking | null | undefined) => {
      if (!item) return;
      // Never display fake/fallback ads
      if (String(item.id || '').startsWith('fallback-')) return;

      const dedupeKey = item.postId
        ? `post:${item.postId}`
        : (item.adImageUrl || item.adTargetUrl)
          ? `ad:${item.adImageUrl || ''}:${item.adTargetUrl || ''}`
          : (item.id || `${item.type}:${item.slotIndex}`);

      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        list.push(item);
      }
    };

    if (promotions && Array.isArray(promotions)) {
      promotions.forEach(addBooking);
    }
    if (homeBootstrap?.homeAds && Array.isArray(homeBootstrap.homeAds)) {
      homeBootstrap.homeAds.forEach(addBooking);
    }

    return list;
  }, [promotions, homeBootstrap?.homeAds]);

  const isLoading = isLoadingPromos && activePromotions.length === 0;

  const handleSponsorClick = () => {
    warmupNavigationIntent('sponsor');
    navigate(APP_ROUTES.sponsor);
  };

  const handleItemClick = (item: PromotionBooking) => {
    if (item.postId) {
      navigate(`/post/${item.postId}`);
      return;
    }

    if (item.adTargetUrl) {
      const resolved = resolveAdTargetUrlInput(item.adTargetUrl);
      const target = resolved.value || item.adTargetUrl;
      const isExternal = /^(?:https?:\/\/|tg:\/\/)/i.test(target);
      if (isExternal) {
        window.open(target, '_blank', 'noopener,noreferrer');
      } else {
        navigate(target);
      }
    }
  };

  return (
    <aside
      className="app-desktop-aux-rail app-desktop-aux-rail-container"
      aria-label="热门推广与广告"
    >
      {/* Rail Header */}
      <div className="app-desktop-aux-rail-header">
        <div className="app-desktop-aux-rail-heading">
          <div className="app-desktop-aux-rail-heading-icon">
            <Flame className="app-desktop-aux-rail-flame-icon" />
          </div>
          <div>
            <h2 className="app-desktop-aux-rail-title">
              实时推广
              {activePromotions && activePromotions.length > 0 && (
                <span className="app-desktop-aux-rail-live-badge">
                  {activePromotions.length} 生效中
                </span>
              )}
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSponsorClick}
          onMouseEnter={() => warmupNavigationIntent('sponsor')}
          className="app-desktop-aux-rail-new-action pressable"
          title="发起新推广"
        >
          <TrendingUp className="app-desktop-aux-rail-small-icon" />
          <span>我要推广</span>
        </button>
      </div>

      {/* Rail Content Area */}
      <div className="app-desktop-aux-rail-content custom-scrollbar">
        {isLoading ? (
          /* Loading Skeleton */
          <div className="app-desktop-aux-rail-loading-list">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="app-desktop-aux-rail-skeleton-card"
              >
                <div className="app-desktop-aux-rail-skeleton-row">
                  <div className="app-desktop-aux-rail-skeleton-line app-desktop-aux-rail-skeleton-line--tag" />
                  <div className="app-desktop-aux-rail-skeleton-line app-desktop-aux-rail-skeleton-line--meta" />
                </div>
                <div className="app-desktop-aux-rail-skeleton-line app-desktop-aux-rail-skeleton-line--title" />
                <div className="app-desktop-aux-rail-skeleton-line app-desktop-aux-rail-skeleton-line--media" />
              </div>
            ))}
          </div>
        ) : !activePromotions || activePromotions.length === 0 ? (
          /* Empty State */
          <div className="app-desktop-aux-rail-empty">
            <div className="app-desktop-aux-rail-empty-icon">
              <Megaphone className="app-desktop-aux-rail-empty-graphic" />
            </div>
            <h3 className="app-desktop-aux-rail-empty-title">暂无广告</h3>
            <p className="app-desktop-aux-rail-empty-copy">抢占黄金曝光位，让更多人发现您的优质内容</p>
            <button
              type="button"
              onClick={handleSponsorClick}
              onMouseEnter={() => warmupNavigationIntent('sponsor')}
              className="pressable app-desktop-aux-rail-empty-btn"
            >
              <TrendingUp className="app-desktop-aux-rail-small-icon" />
              <span>我要推广</span>
            </button>
          </div>
        ) : (
          /* Promotion Items List (Sorted newest top to bottom) */
          activePromotions.map((item) => {
            const tag = getPromotionTag(item.type, item);
            const hasBannerImage = Boolean(item.adImageUrl || item.adMobileImageUrl);
            const adImageUrl = item.adImageUrl || item.adMobileImageUrl;
            const post = item.post;
            const coverPhoto = (post as any)?.images?.[0] || post?.photos?.[0] || (post as any)?.image;

            return (
              <div
                key={item.id || `${item.type}:${item.slotIndex}:${item.postId || ''}`}
                role="button"
                tabIndex={0}
                onClick={() => handleItemClick(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleItemClick(item);
                  }
                }}
                onMouseEnter={() => {
                  if (item.postId) {
                    warmupRoutePath(`/post/${item.postId}`);
                  }
                }}
                className="app-desktop-aux-rail-card"
              >
                {/* Header Row: Badge & Type */}
                <div className="app-desktop-aux-rail-card-header">
                  <span
                    className={`app-desktop-aux-rail-tag ${tag.tagClass}`}
                  >
                    {item.type === PromotionType.AD_HOME ? (
                      <ImageIcon className="app-desktop-aux-rail-tag-icon" />
                    ) : item.type === PromotionType.PIN_CATEGORY ? (
                      <LayoutGrid className="app-desktop-aux-rail-tag-icon" />
                    ) : (
                      <Pin className="app-desktop-aux-rail-tag-icon" />
                    )}
                    <span>{tag.label}</span>
                  </span>

                  {item.adTargetUrl && (
                    <span className="app-desktop-aux-rail-target">
                      <span className="app-desktop-aux-rail-target-label">{formatAdTargetDisplay(item.adTargetUrl)}</span>
                      <ExternalLink className="app-desktop-aux-rail-tag-icon" />
                    </span>
                  )}
                </div>

                {/* Banner Ad Display */}
                {hasBannerImage && (
                  <div className="app-desktop-aux-rail-media app-desktop-aux-rail-media--banner">
                    <img
                      src={adImageUrl!}
                      alt="广告Banner"
                      className="app-desktop-aux-rail-media-image"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

                {/* Post Promotion Display */}
                {post ? (
                  <div className="app-desktop-aux-rail-post">
                    {/* Author Row */}
                    <div className="app-desktop-aux-rail-author">
                      <span className="app-desktop-aux-rail-avatar">
                        <AvatarImage
                          src={post.user?.photoUrl || ''}
                          name={post.user?.displayName || post.user?.username}
                          id={post.user?.id || post.userId}
                          alt={post.user?.displayName || post.user?.username || '用户'}
                          className="app-desktop-aux-rail-avatar-image"
                          variant="thumb"
                        />
                      </span>
                      <span className="app-desktop-aux-rail-author-name">
                        {post.user?.displayName || post.user?.username || '匿名用户'}
                      </span>
                    </div>

                    {/* Post Title or Content */}
                    {post.title ? (
                      <h4 className="app-desktop-aux-rail-post-title">
                        {post.title}
                      </h4>
                    ) : null}
                    <p className="app-desktop-aux-rail-post-copy">
                      {post.content}
                    </p>

                    {/* Post Image Thumbnail */}
                    {coverPhoto && !hasBannerImage && (
                      <div className="app-desktop-aux-rail-media app-desktop-aux-rail-media--post">
                        <img
                          src={coverPhoto}
                          alt={post.title || '帖子图文'}
                          className="app-desktop-aux-rail-media-image"
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    {/* Post Stats Footer */}
                    <div className="app-desktop-aux-rail-stats">
                      <div className="app-desktop-aux-rail-stats-group">
                        <span className="app-desktop-aux-rail-stat">
                          <Eye className="app-desktop-aux-rail-stat-icon" />
                          <span>{post.viewCount || 0}</span>
                        </span>
                        <span className="app-desktop-aux-rail-stat">
                          <MessageSquare className="app-desktop-aux-rail-stat-icon" />
                          <span>{post.commentCount || 0}</span>
                        </span>
                        <span className="app-desktop-aux-rail-stat">
                          <Heart className="app-desktop-aux-rail-stat-icon" />
                          <span>{post.likeCount || 0}</span>
                        </span>
                      </div>
                      <span className="app-desktop-aux-rail-view-action">
                        查看详情 <ChevronRight className="app-desktop-aux-rail-stat-icon" />
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Banner/URL only without post attached */
                  <div className="app-desktop-aux-rail-link-row">
                    <span className="app-desktop-aux-rail-link-label">
                      {item.adTargetUrl || '点击了解详情'}
                    </span>
                    <span className="app-desktop-aux-rail-link-action">
                      点击访问 <ChevronRight className="app-desktop-aux-rail-stat-icon" />
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
