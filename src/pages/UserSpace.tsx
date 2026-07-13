import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type Ref } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useInfinitePosts, useUser, useFollowStatus } from "@/hooks/useData";
import { useAuth } from "@/context/AuthContext";
import PageHeader from '@/ui/PageHeader';
import PostFeedList from "@/features/feed/PostFeedList";
import SEO from "@/platform/SEO";
import { FollowButton } from "@/features/social/FollowButton";
import { StateBlock } from "@/ui/LoadingState";
import { useIsMobile } from "@/hooks/useIsMobile";
import { HomeFeedSkeleton, UserSpaceSkeleton } from "@/ui/Skeleton";
import AvatarImage from "@/ui/AvatarImage";
import { useListReturnScroll } from "@/utils/listReturnScroll";
import ListLoadMoreState from "@/ui/ListLoadMoreState";
import AppPage from '@/ui/AppPage';
import PageContentShell from '@/ui/PageContentShell';
import { formatTelegramContactDisplay, openTelegramContact } from '@/utils/contact';
import LinkifiedText from '@/ui/LinkifiedText';
import ActionButton from '@/ui/ActionButton';
import ProfileHeaderCover from '@/features/profile/ProfileHeaderCover';
import UserSpaceTuiPlusLinks, {
  getActiveProfileChannels,
  getActiveProfileWebsites,
} from '@/features/profile/UserSpaceTuiPlusLinks';
import { isTuiPlusActive } from '@/features/tui-plus/tuiPlusBenefits';
import { apiFetch } from '@/services/api';
import {
  ACCEPTED_IMAGE_TYPES,
  COVER_UPLOAD_RETRY_OPTIONS,
  getImageValidationError,
  normalizeImageUploadError,
  uploadImageFile,
} from '@/features/upload/imageUploadPipeline';
import {
  clearObjectUrl,
  normalizePersistentImageUrl,
  parseResponseError,
  warmImageUrl,
} from '@/features/profile/profileHelpers';

function UserSpaceHeader({
  safeId,
  displayUser,
  postsCount,
  isOwnProfile,
  canContact,
  onContact,
  onCoverClick,
  profileRef,
  coverUrl,
}: {
  safeId: string;
  displayUser: any;
  postsCount: number;
  isOwnProfile: boolean;
  canContact: boolean;
  onContact: () => void;
  onCoverClick?: () => void;
  coverUrl?: string;
  profileRef?: Ref<HTMLDivElement>;
}) {
  const displayName = String(displayUser?.displayName || '').trim() || '用户';
  const bioText = displayUser?.userType === 'ROBOT'
    ? ''
    : String(displayUser?.bio || '').trim();
  const tuiPlusActive = isTuiPlusActive(displayUser);

  return (
    <div ref={profileRef} className="profile-section profile-identity-section user-space-profile-section">
      <ProfileHeaderCover
        coverUrl={coverUrl ?? displayUser?.coverUrl}
        onClick={isOwnProfile ? onCoverClick : undefined}
      />
      <section className="profile-identity-card user-space-profile-card" aria-label="个人资料">
        <div className="profile-identity-main user-space-profile-main">
          <div className="profile-avatar-stack user-space-avatar-stack">
            <div className="profile-avatar-button user-space-avatar-next" data-tui-plus={tuiPlusActive ? 'true' : undefined} aria-label="用户头像">
              <AvatarImage
                src={displayUser?.photoUrl || ''}
                name={displayUser?.displayName}
                id={safeId}
                alt="Avatar"
                className="ui-avatar-lg user-space-avatar-image"
                variant="thumb"
                isTuiPlus={tuiPlusActive}
              />
            </div>
          </div>

          <div className="profile-stats-row user-space-stats user-space-stats-next" aria-label="个人数据">
            <div className="profile-stat-item user-space-stat-item">
              <span className="profile-stat-value ui-stat-value">{displayUser?.viewCount ?? 0}</span>
              <span className="profile-stat-label ui-stat-label">热度</span>
            </div>
            <div className="profile-stat-item user-space-stat-item">
              <span className="profile-stat-value ui-stat-value">{displayUser?.postCount ?? postsCount}</span>
              <span className="profile-stat-label ui-stat-label">发布</span>
            </div>
            <div className="profile-stat-item user-space-stat-item">
              <span className="profile-stat-value ui-stat-value">{displayUser?.followerCount ?? 0}</span>
              <span className="profile-stat-label ui-stat-label">粉丝</span>
            </div>
            <div className="profile-stat-item user-space-stat-item">
              <span className="profile-stat-value ui-stat-value">{displayUser?.followingCount ?? 0}</span>
              <span className="profile-stat-label ui-stat-label">关注</span>
            </div>
          </div>
        </div>

        <div className="profile-identity-copy user-space-profile-copy">
          <div className="profile-name-row user-space-name-row">
            <span className="profile-name-mobile profile-name-desktop user-space-name-mobile user-space-name-desktop">{displayName}</span>
          </div>

          {bioText ? (
            <p className="profile-bio-button profile-bio-inline user-space-bio-mobile user-space-bio-desktop">
              <LinkifiedText text={bioText} className="profile-bio-text" />
            </p>
          ) : null}

          <UserSpaceTuiPlusLinks
            safeId={safeId}
            displayUser={displayUser}
            isOwnProfile={false}
          />
        </div>

        {!isOwnProfile && (
          <div className="user-space-actions-next" data-contact-layout={canContact ? 'split' : 'single'}>
            <FollowButton userId={safeId} size="md" hideWhenFollowing={false} className="user-space-action" />
            {canContact ? (
              <button
                type="button"
                onClick={onContact}
                className="user-space-action user-space-contact-action pressable"
                aria-label={`联系${displayName}`}
              >
                联系
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

export default function UserSpace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user: currentUser, requireAuth, showToast, patchUser } = useAuth();
  const isMobile = useIsMobile();
  const listReturnScope = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (!id) navigate('/404', { replace: true });
  }, [id, navigate]);

  const safeId = id || "";
  const isOwnProfile = currentUser?.id === safeId;
  const {
    data: userProfile,
    isLoading: userLoading,
    isError: userError,
    error: userLoadError,
    refetch: refetchUser,
  } = useUser(safeId);
  const { data: followStatus } = useFollowStatus(safeId, !!currentUser?.id && currentUser.id !== safeId);
  const postsQuery = useInfinitePosts({ userId: safeId, enabled: !!safeId });
  const {
    data: postsData,
    fetchNextPage: fetchMorePosts,
    hasNextPage: hasMorePostsRaw,
    isFetchingNextPage: isLoadingMorePosts,
    isLoading: postsLoading,
    isError: postsError,
    refetch: refetchPosts,
  } = postsQuery;
  const postsLoadMoreInFlightRef = useRef(false);
  const [postsLoadMoreError, setPostsLoadMoreError] = useState(false);
  const posts = useMemo(() => postsData?.pages.flatMap((page) => page.items || []) || [], [postsData]);
  const hasMorePosts = Boolean(hasMorePostsRaw);
  const displayUser = userProfile || (!userError && posts.length > 0 && posts[0].user ? posts[0].user : null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string>(() => normalizePersistentImageUrl(displayUser?.coverUrl || ''));
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const coverUploadTokenRef = useRef(0);
  const coverUploadObjectUrlRef = useRef("");
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const resolvedUserName = displayUser?.displayName?.trim() || "";

  const pageUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const normalizedSearch = location.search || '';
    return `${window.location.origin}${location.pathname}${normalizedSearch}`;
  }, [location.pathname, location.search]);

  const userProfileJsonLd = useMemo(() => {
    if (!displayUser || !pageUrl) return [] as Array<Record<string, unknown>>;

    const resolvedName = resolvedUserName || '用户';
    const resolvedBio = String(displayUser?.bio || '').trim();
    const profileImage = (displayUser?.photoUrl || '').trim();
    const coverImage = (displayUser?.coverUrl || '').trim();
    const profileLinks = [
      ...getActiveProfileChannels(displayUser).map((channel: any) => channel.channelUrl),
      ...getActiveProfileWebsites(displayUser).map((website: any) => website.url),
    ].filter(Boolean);
    const toAbsoluteImage = (value: string) => {
      if (!value) return '';
      if (/^https?:\/\//i.test(value)) return value;
      return `${window.location.origin}${value.startsWith('/') ? '' : '/'}${value}`;
    };

    const profileJson: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': `${pageUrl}#person`,
      name: resolvedName,
      description: resolvedBio || `查看${resolvedName}的公开主页与分类信息。`,
      url: pageUrl,
      mainEntityOfPage: pageUrl,
      sameAs: [pageUrl, ...profileLinks],
      inLanguage: 'zh-CN',
      image: [profileImage ? toAbsoluteImage(profileImage) : undefined].filter(Boolean),
      worksFor: coverImage ? {
        '@type': 'Organization',
        name: '推推',
        url: typeof window === 'undefined' ? undefined : window.location.origin,
        logo: `${window.location.origin}/icon-512.png`,
      } : {
        '@type': 'Organization',
        name: '推推',
        url: typeof window === 'undefined' ? undefined : window.location.origin,
      },
      interactionStatistic: [
        {
          '@type': 'InteractionCounter',
          interactionType: { '@type': 'ViewAction' },
          userInteractionCount: Number(displayUser?.viewCount || 0),
        },
        {
          '@type': 'InteractionCounter',
          interactionType: { '@type': 'FollowAction' },
          userInteractionCount: Number(displayUser?.followerCount || 0),
        },
      ],
      memberOf: {
        '@type': 'WebSite',
        name: '推推',
        url: typeof window === 'undefined' ? undefined : window.location.origin,
      },
    };

    return [
      profileJson,
      {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        '@id': pageUrl,
        url: pageUrl,
        name: `${resolvedName}的个人主页`,
        isPartOf: {
          '@type': 'WebSite',
          '@id': `${window.location.origin}/`,
          name: '推推',
        },
        mainEntity: {
          '@id': `${pageUrl}#person`,
        },
        inLanguage: 'zh-CN',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${resolvedName}的最近发布`,
        itemListElement: (posts.slice(0, 12)).map((post, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: post.title || post.content || `${resolvedName}的帖子`,
          url: `${pageUrl}/#post-${post.id}`,
        })),
      },
    ].filter((item) => item && (!Array.isArray((item as { itemListElement?: unknown }).itemListElement) || (item as { itemListElement?: Array<unknown> }).itemListElement.length > 0));
  }, [displayUser, posts, resolvedUserName, pageUrl]);

  const requestMorePosts = useCallback(() => {
    if (!hasMorePostsRaw || isLoadingMorePosts || postsLoadMoreInFlightRef.current) return;

    postsLoadMoreInFlightRef.current = true;
    const release = () => {
      postsLoadMoreInFlightRef.current = false;
    };

    setPostsLoadMoreError(false);

    void Promise.resolve(fetchMorePosts())
      .catch(() => setPostsLoadMoreError(true))
      .finally(() => {
        if (typeof window === 'undefined') {
          release();
          return;
        }
        window.setTimeout(release, 260);
      });
  }, [fetchMorePosts, hasMorePostsRaw, isLoadingMorePosts]);

  const isTitleLoading = !resolvedUserName && (userLoading || postsLoading);
  const isLoading = userLoading || postsLoading;
  const shouldEnableStickyFollow = Boolean(displayUser) && currentUser?.id !== safeId && !followStatus?.following;
  const [showStickyFollow, setShowStickyFollow] = useState(false);
  const profileHeaderRef = useRef<HTMLDivElement | null>(null);
  const stickyFollowRafRef = useRef<number | null>(null);
  const pendingStickyFollowRef = useRef(false);
  const contactDisplay = formatTelegramContactDisplay(displayUser?.contact);
  const canContactUser = Boolean(contactDisplay) && currentUser?.id !== safeId;

  useEffect(() => {
    setCoverPreviewUrl((current) => {
      const nextCanonical = normalizePersistentImageUrl(displayUser?.coverUrl || '');
      const currentCanonical = normalizePersistentImageUrl(current);

      if (!nextCanonical) return currentCanonical ? current : '';
      if (currentCanonical && currentCanonical !== nextCanonical && isUploadingCover) return current;
      return displayUser?.coverUrl || '';
    });
  }, [displayUser?.coverUrl, displayUser?.id, isUploadingCover]);

  useEffect(() => {
    return () => {
      if (coverUploadObjectUrlRef.current) {
        clearObjectUrl(coverUploadObjectUrlRef.current);
        coverUploadObjectUrlRef.current = '';
      }
    };
  }, []);

  const handleContact = useCallback(() => {
    requireAuth(() => {
      if (!openTelegramContact(displayUser?.contact)) {
        showToast('对方暂未公开联系方式', 'info');
      }
    });
  }, [displayUser?.contact, requireAuth, showToast]);

  const handleCoverButtonClick = useCallback(() => {
    if (!isOwnProfile) return;
    requireAuth(() => {
      coverInputRef.current?.click();
    });
  }, [isOwnProfile, requireAuth]);

  const handleCoverFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (isUploadingCover) return;

    const validationError = getImageValidationError(file, 'cover');
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    const sessionId = ++coverUploadTokenRef.current;
    const previousCover = normalizePersistentImageUrl(displayUser?.coverUrl || coverPreviewUrl);
    if (coverUploadObjectUrlRef.current) {
      clearObjectUrl(coverUploadObjectUrlRef.current);
      coverUploadObjectUrlRef.current = '';
    }

    const nextLocalPreview = URL.createObjectURL(file);
    coverUploadObjectUrlRef.current = nextLocalPreview;
    setCoverPreviewUrl(nextLocalPreview);
    setIsUploadingCover(true);

    try {
      const finalCoverUrl = await uploadImageFile(file, {
        purpose: 'cover',
        ...COVER_UPLOAD_RETRY_OPTIONS,
      });
      if (sessionId !== coverUploadTokenRef.current) return;

      const normalizedCoverUrl = normalizePersistentImageUrl(finalCoverUrl || '');
      if (!normalizedCoverUrl) {
        throw new Error('上传服务返回地址无效');
      }

      setCoverPreviewUrl(normalizedCoverUrl);

      const saveRes = await apiFetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverUrl: normalizedCoverUrl }),
      });

      if (sessionId !== coverUploadTokenRef.current) return;

      if (!saveRes.ok) {
        const saveMessage = await parseResponseError(saveRes, '封面保存失败');
        setCoverPreviewUrl(previousCover);
        patchUser({ coverUrl: previousCover || null });
        showToast(saveMessage, 'error');
        return;
      }

      const savedUser = await saveRes.json().catch(() => ({ coverUrl: normalizedCoverUrl }));
      const savedCoverUrl = normalizePersistentImageUrl(String(savedUser?.coverUrl || normalizedCoverUrl).trim());
      const nextCoverUrl = savedCoverUrl || normalizedCoverUrl;

      setCoverPreviewUrl(nextCoverUrl);
      patchUser({ coverUrl: nextCoverUrl || null });
      queryClient.setQueryData(["user-profile", safeId], (old: any) => ({
        ...(old || displayUser || {}),
        coverUrl: nextCoverUrl || '',
      }));
      queryClient.invalidateQueries({ queryKey: ["user-profile", safeId], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ["user-profile"], refetchType: 'none' });
      if (nextCoverUrl) {
        void warmImageUrl(nextCoverUrl, 'cover');
      }
      showToast('封面已更新', 'success');
    } catch (error: any) {
      if (sessionId !== coverUploadTokenRef.current) return;
      const uploadError = normalizeImageUploadError(error);
      setCoverPreviewUrl(previousCover);
      patchUser({ coverUrl: previousCover || null });
      showToast(uploadError, 'error');
    } finally {
      if (sessionId === coverUploadTokenRef.current) {
        if (coverUploadObjectUrlRef.current === nextLocalPreview) {
          clearObjectUrl(nextLocalPreview);
          coverUploadObjectUrlRef.current = '';
        }
        setIsUploadingCover(false);
      }

      if (sessionId !== coverUploadTokenRef.current && coverUploadObjectUrlRef.current === nextLocalPreview) {
        clearObjectUrl(nextLocalPreview);
        coverUploadObjectUrlRef.current = '';
      }
    }
  };

  const handleRetryUserSpace = useCallback(() => {
    void refetchUser();
    void refetchPosts();
  }, [refetchPosts, refetchUser]);

  useEffect(() => {
    postsLoadMoreInFlightRef.current = false;
    setPostsLoadMoreError(false);
  }, [safeId]);

  useEffect(() => {
    setShowStickyFollow(false);
    pendingStickyFollowRef.current = false;
  }, [safeId, followStatus?.following]);

  useEffect(() => {
    const target = profileHeaderRef.current;
    if (!shouldEnableStickyFollow || !target || typeof window === 'undefined') {
      setShowStickyFollow(false);
      pendingStickyFollowRef.current = false;
      return undefined;
    }

    const scheduleStickyState = (next: boolean) => {
      pendingStickyFollowRef.current = next;
      if (stickyFollowRafRef.current !== null) return;
      stickyFollowRafRef.current = window.requestAnimationFrame(() => {
        stickyFollowRafRef.current = null;
        setShowStickyFollow((current) => (
          current === pendingStickyFollowRef.current ? current : pendingStickyFollowRef.current
        ));
      });
    };

    const computeFromLayout = () => scheduleStickyState(target.getBoundingClientRect().bottom <= 0);

    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(([entry]) => {
        if (!entry) {
          computeFromLayout();
          return;
        }
        scheduleStickyState(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
      }, { threshold: 0 });

      observer.observe(target);
      computeFromLayout();

      return () => {
        observer.disconnect();
        if (stickyFollowRafRef.current !== null) {
          window.cancelAnimationFrame(stickyFollowRafRef.current);
          stickyFollowRafRef.current = null;
        }
      };
    }

    const onScrollOrResize = () => computeFromLayout();
    onScrollOrResize();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      if (stickyFollowRafRef.current !== null) {
        window.cancelAnimationFrame(stickyFollowRafRef.current);
        stickyFollowRafRef.current = null;
      }
    };
  }, [shouldEnableStickyFollow]);

  useListReturnScroll(listReturnScope, !isLoading, posts.length);

  const stickyFollowButton = shouldEnableStickyFollow && showStickyFollow ? <FollowButton userId={safeId} size="sm" /> : undefined;
  const userErrorMessage = userLoadError instanceof Error ? userLoadError.message : '';
  const isNotFoundError = /(^|\D)404(\D|$)|不存在|not found/i.test(userErrorMessage);

  if (userError && !displayUser) {
    return (
      <AppPage className={`user-space-page user-space-page-next ${isMobile ? 'user-space-page-mobile' : 'user-space-page-desktop ui-page-card-shell'}`}>
        <PageHeader title="个人空间" titleAlign="center" />
        <SEO title="个人空间｜推推" description="查看用户在推推发布的圈内分类信息与资源。" />
        <PageContentShell variant="fluid" className="user-space-body ui-app-page-main">
          <StateBlock
            title={isNotFoundError ? '用户不存在或暂不可访问' : '用户资料加载失败'}
            description={isNotFoundError ? '这个用户可能已不存在，或暂时无法公开访问。' : '网络恢复后可重新加载这个用户的资料。'}
            tone={isNotFoundError ? 'empty' : 'error'}
            compact
            className="user-space-state-block"
            action={
              <ActionButton type="button" variant="muted" onClick={handleRetryUserSpace}>
                重新加载
              </ActionButton>
            }
          />
        </PageContentShell>
      </AppPage>
    );
  }

  if (isLoading && !displayUser) {
    return (
      <AppPage className={`user-space-loading-page user-space-page user-space-page-next ${isMobile ? 'user-space-page-mobile' : 'user-space-page-desktop ui-page-card-shell'}`}>
        <PageHeader title="个人空间" titleAlign="center" right={stickyFollowButton} />
        <UserSpaceSkeleton mobile={isMobile} />
      </AppPage>
    );
  }

  const header = (
    <UserSpaceHeader
      safeId={safeId}
      displayUser={displayUser}
      postsCount={posts.length}
      isOwnProfile={isOwnProfile}
      canContact={canContactUser}
      onContact={handleContact}
      onCoverClick={handleCoverButtonClick}
      coverUrl={coverPreviewUrl}
      profileRef={profileHeaderRef}
    />
  );

  const postsContent = isLoading ? (
    <HomeFeedSkeleton count={3} className="user-space-post-list-skeleton" />
  ) : postsError && posts.length === 0 ? (
    <StateBlock
      title="内容加载失败"
      description="网络恢复后可重新加载这个用户的内容。"
      tone="error"
      compact
      className="user-space-state-block"
      action={
        <ActionButton type="button" variant="muted" onClick={() => void refetchPosts()}>
          重新加载
        </ActionButton>
      }
    />
  ) : posts.length === 0 ? (
    <StateBlock title="暂无内容" tone="empty" compact className="user-space-state-block" />
  ) : (
    <div className={isMobile ? 'user-space-posts-mobile-wrap' : 'user-space-posts-desktop-wrap'}>
      <PostFeedList posts={posts} enableRecommendationControls={currentUser?.id !== safeId} />
      <ListLoadMoreState error={postsLoadMoreError} loading={isLoadingMorePosts} hasMore={hasMorePosts} onRetry={requestMorePosts} onLoadMore={requestMorePosts} loadingText="正在加载更多" doneText="已经到底啦" />
    </div>
  );

  return (
    <AppPage className={`user-space-page user-space-page-next ${isMobile ? 'user-space-page-mobile' : 'user-space-page-desktop ui-page-card-shell'}`}>
      <PageHeader title="个人空间" titleAlign="center" right={stickyFollowButton} isTitleLoading={isTitleLoading} />
      <SEO
        title={resolvedUserName ? `${resolvedUserName}的空间｜推推` : '个人空间｜推推'}
        description={resolvedUserName ? `查看${resolvedUserName}在推推发布的圈内分类信息、资源和动态。` : '查看用户在推推发布的圈内分类信息与资源。'}
        canonicalPath={`/user/${safeId}`}
        jsonLd={userProfileJsonLd}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="ui-file-input-hidden"
        onChange={handleCoverFileChange}
        disabled={isUploadingCover || !isOwnProfile}
      />
      <PageContentShell variant="fluid" className="user-space-body ui-app-page-main">
        {header}
        <div className="user-space-posts-panel">{postsContent}</div>
      </PageContentShell>
    </AppPage>
  );
}
