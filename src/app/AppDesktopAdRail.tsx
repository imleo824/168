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
import { getAllActivePromotions, getHomeAds } from '@/services/api';
import { APP_ROUTES } from '@/app/routePaths';
import { PromotionType, type PromotionBooking } from '@/types';
import { warmupNavigationIntent, warmupRoutePath } from '@/utils/routeWarmups';
import { resolveAdTargetUrlInput } from '@/utils/adTargetUrl';
import { useHomeBootstrap } from '@/hooks/useDataConfig';
import AvatarImage from '@/ui/AvatarImage';

function getPromotionTag(type: string, booking?: PromotionBooking) {
  if (type === PromotionType.AD_HOME) {
    return { label: '横幅广告', tagClass: 'app-desktop-ad-rail-tag-amber' };
  }
  if (type === PromotionType.PIN_HOME) {
    return { label: '热门置顶', tagClass: 'app-desktop-ad-rail-tag-rose' };
  }
  if (type === PromotionType.PIN_CATEGORY) {
    const categoryName = booking?.post?.category?.name || (booking as any)?.category?.name;
    return {
      label: categoryName ? `${categoryName}置顶` : '分类置顶',
      tagClass: 'app-desktop-ad-rail-tag-indigo',
    };
  }
  if (type === PromotionType.PIN_CHAT) {
    return { label: '聊天室置顶', tagClass: 'app-desktop-ad-rail-tag-emerald' };
  }
  return { label: '精选推广', tagClass: 'app-desktop-ad-rail-tag-amber' };
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

export const AppDesktopAdRail: React.FC = () => {
  const navigate = useNavigate();
  const { data: homeBootstrap } = useHomeBootstrap();

  const { data: promotions, isLoading: isLoadingPromos } = useQuery<PromotionBooking[]>({
    queryKey: ['promotions', 'all-active'],
    queryFn: () => getAllActivePromotions(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: homeAds, isLoading: isLoadingHomeAds } = useQuery<PromotionBooking[]>({
    queryKey: ['promotions', 'home-ads'],
    queryFn: () => getHomeAds(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const activePromotions = useMemo(() => {
    const list: PromotionBooking[] = [];
    const seenKeys = new Set<string>();

    const addBooking = (item: PromotionBooking | null | undefined) => {
      if (!item) return;
      const key = item.id || `${item.type}:${item.slotIndex}:${item.postId || ''}:${item.adTargetUrl || ''}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        list.push(item);
      }
    };

    if (promotions && Array.isArray(promotions)) {
      promotions.forEach(addBooking);
    }
    if (homeAds && Array.isArray(homeAds)) {
      homeAds.forEach(addBooking);
    }
    if (homeBootstrap?.homeAds && Array.isArray(homeBootstrap.homeAds)) {
      homeBootstrap.homeAds.forEach(addBooking);
    }

    return list;
  }, [promotions, homeAds, homeBootstrap?.homeAds]);

  const isLoading = (isLoadingPromos || isLoadingHomeAds) && activePromotions.length === 0;

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
      className="app-desktop-ad-rail app-desktop-ad-rail-container"
      aria-label="热门推广与广告"
    >
      {/* Rail Header */}
      <div className="app-desktop-ad-rail-header flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--ui-brand)]/10 flex items-center justify-center text-[var(--ui-brand)]">
            <Flame className="w-4 h-4 fill-[var(--ui-brand)]/20" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--ui-text-primary)] leading-none flex items-center gap-1.5">
              实时推广
              {activePromotions && activePromotions.length > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-[var(--ui-brand)]/10 text-[var(--ui-brand)]">
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
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-[var(--ui-brand)] bg-[var(--ui-brand)]/10 hover:bg-[var(--ui-brand)]/20 transition-colors cursor-pointer"
          title="发起新推广"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>我要推广</span>
        </button>
      </div>

      {/* Rail Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {isLoading ? (
          /* Loading Skeleton */
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-3 rounded-xl border border-[var(--ui-line-hairline)] bg-[var(--ui-surface-muted)] animate-pulse space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="w-16 h-4 bg-[var(--ui-line-hairline)] rounded-md" />
                  <div className="w-12 h-3 bg-[var(--ui-line-hairline)] rounded-md" />
                </div>
                <div className="w-3/4 h-4 bg-[var(--ui-line-hairline)] rounded-md" />
                <div className="w-full h-16 bg-[var(--ui-line-hairline)] rounded-lg" />
              </div>
            ))}
          </div>
        ) : !activePromotions || activePromotions.length === 0 ? (
          /* Empty State */
          <div className="app-desktop-ad-rail-empty">
            <div className="app-desktop-ad-rail-empty-icon">
              <Megaphone className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--ui-text-primary)] mb-1">暂无广告</h3>
            <p className="text-xs text-[var(--ui-text-muted)] mb-4 max-w-48 leading-relaxed">抢占黄金曝光位，让更多人发现您的优质内容</p>
            <button
              type="button"
              onClick={handleSponsorClick}
              onMouseEnter={() => warmupNavigationIntent('sponsor')}
              className="pressable app-desktop-ad-rail-empty-btn"
            >
              <TrendingUp className="w-3.5 h-3.5" />
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
            const coverPhoto = post?.photos?.[0] || (post as any)?.image || (post as any)?.images?.[0];

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
                className="app-desktop-ad-rail-card group"
              >
                {/* Header Row: Badge & Type */}
                <div className="flex items-center justify-between mb-2 gap-2">
                  <span
                    className={`app-desktop-ad-rail-tag ${tag.tagClass}`}
                  >
                    {item.type === PromotionType.AD_HOME ? (
                      <ImageIcon className="w-2.5 h-2.5" />
                    ) : item.type === PromotionType.PIN_CATEGORY ? (
                      <LayoutGrid className="w-2.5 h-2.5" />
                    ) : (
                      <Pin className="w-2.5 h-2.5" />
                    )}
                    <span>{tag.label}</span>
                  </span>

                  {item.adTargetUrl && (
                    <span className="text-xs text-[var(--ui-text-muted)] group-hover:text-[var(--ui-brand)] flex items-center gap-0.5 transition-colors">
                      <span className="truncate max-w-28">{formatAdTargetDisplay(item.adTargetUrl)}</span>
                      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                    </span>
                  )}
                </div>

                {/* Banner Ad Display */}
                {hasBannerImage && (
                  <div className="relative mb-2 rounded-lg overflow-hidden bg-[var(--ui-surface-muted)] aspect-[21/9]">
                    <img
                      src={adImageUrl!}
                      alt="广告Banner"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

                {/* Post Promotion Display */}
                {post ? (
                  <div className="space-y-1.5">
                    {/* Author Row */}
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
                        <AvatarImage
                          src={post.user?.photoUrl || ''}
                          name={post.user?.displayName || post.user?.username}
                          id={post.user?.id || post.userId}
                          alt={post.user?.displayName || post.user?.username || '用户'}
                          className="w-full h-full object-cover"
                          variant="thumb"
                        />
                      </span>
                      <span className="text-xs font-medium text-[var(--ui-text-primary)] truncate max-w-32">
                        {post.user?.displayName || post.user?.username || '匿名用户'}
                      </span>
                    </div>

                    {/* Post Title or Content */}
                    {post.title ? (
                      <h4 className="text-xs font-semibold text-[var(--ui-text-primary)] line-clamp-1 group-hover:text-[var(--ui-brand)] transition-colors">
                        {post.title}
                      </h4>
                    ) : null}
                    <p className="text-xs text-[var(--ui-text-muted)] line-clamp-2 leading-relaxed">
                      {post.content}
                    </p>

                    {/* Post Image Thumbnail */}
                    {coverPhoto && !hasBannerImage && (
                      <div className="rounded-lg overflow-hidden bg-[var(--ui-surface-muted)] aspect-[16/9] mt-1.5">
                        <img
                          src={coverPhoto}
                          alt={post.title || '帖子图文'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    {/* Post Stats Footer */}
                    <div className="flex items-center justify-between text-xs text-[var(--ui-text-muted)] pt-1">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3 opacity-60 flex-shrink-0" />
                          <span>{post.viewCount || 0}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 opacity-60 flex-shrink-0" />
                          <span>{post.commentCount || 0}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3 opacity-60 flex-shrink-0" />
                          <span>{post.likeCount || 0}</span>
                        </span>
                      </div>
                      <span className="flex items-center text-[var(--ui-brand)] opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                        查看详情 <ChevronRight className="w-3 h-3 flex-shrink-0" />
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Banner/URL only without post attached */
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-xs font-medium text-[var(--ui-text-primary)] group-hover:text-[var(--ui-brand)] transition-colors truncate">
                      {item.adTargetUrl || '点击了解详情'}
                    </span>
                    <span className="flex items-center text-xs text-[var(--ui-brand)] font-medium flex-shrink-0 ml-1">
                      点击访问 <ChevronRight className="w-3 h-3 flex-shrink-0" />
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
