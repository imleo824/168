import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { MapPin } from 'lucide-react';

import {
  usePost,
  usePostLikers,
  usePostStats,
  useRecordShare,
  useRecordView,
  useFollowStatus,
} from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import SEO from '@/platform/SEO';
import { buildPostSeo } from '@/platform/brand';
import { FollowButton } from '@/features/social/FollowButton';
import { HashtagText } from '@/features/post/HashtagText';
import { openTelegramContact } from '@/utils/contact';
import { buildSharePayload, type SharePayload } from '@/utils/share';
import {
  isLocationTag,
  normalizeLocationName,
  toLocationCategoryId,
} from '@/utils/postPresentation';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useIsDesktopViewport } from '@/hooks/useIsDesktopViewport';
import AvatarImage from '@/ui/AvatarImage';
import TelegramContactIconButton from '@/ui/TelegramContactIconButton';
import PostMediaGrid from '@/features/post/PostMediaGrid';
import { PostStructuredMetaValue } from '@/features/post/PostStructuredMetaValue';
import PostCommentSheet from '@/features/post/PostCommentSheet';
import PostQuoteSheet from '@/features/post/PostQuoteSheet';
import QuotedPostPreviewCard from '@/features/post/QuotedPostPreviewCard';
import AppPage from '@/ui/AppPage';
import PageHeader from '@/ui/PageHeader';
import PageContentShell from '@/ui/PageContentShell';
import { clampMediaIndex } from '@/utils/media';
import { formatEngagementCount } from '@/utils/engagement';
import { getOverlayBackgroundLocation, withOverlayBackground } from '@/utils/navigationState';
import {
  getPostMetaChipClass,
  POST_TAG_ROW_CLASS,
  LOCATION_TAG_CHIP_CLASS,
  NORMAL_TAG_CHIP_CLASS,
  resolvePostMetaChipKind,
} from '@/utils/postTagStyles';
import { buildPostStructuredMetaItems, isPostStructuredLocationMeta } from '@/utils/postStructuredMeta';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { useLikeFeedback } from '@/hooks/useLikeFeedback';
import { formatRelativeTime } from '@/utils/time';
import {
  buildPostDetailContentModel,
  resolvePostDetailContentKind,
  type PostDetailContentKind,
} from '@/features/post-detail/postDetailModel';
import {
  DetailBackButton,
  DetailBottomBar,
  DetailLikeWall,
  DetailLoadingPage,
  DetailStatePage,
} from '@/features/post-detail/PostDetailLegacySections';
import PostDetailInteractionsSection from '@/features/post-detail/PostDetailInteractionsSection';
import { usePostDetailLikeWall } from '@/features/post-detail/usePostDetailLikeWall';
import { usePostDetailReturn } from '@/features/post-detail/usePostDetailReturn';
import { usePostDetailShare } from '@/features/post-detail/usePostDetailShare';
import { usePostDetailViewTracking } from '@/features/post-detail/usePostDetailViewTracking';
import {
  buildAbsoluteUrl,
  buildSortedDetailLocationTags,
  getRouteState,
  isAnonymousAuthor,
  joinKeywords,
  normalizeAuthorId,
  resolveDetailSourceText,
} from '@/features/post-detail/postDetailLegacyUtils';

const ImageLightbox = lazy(() => import('@/ui/ImageLightbox'));

const DETAIL_LIKE_WALL_LIMIT = 24;

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, requireAuth, showToast } = useAuth();
  const isMobile = useIsMobile();
  const isDesktopViewport = useIsDesktopViewport();
  const routeState = getRouteState(location.state);
  const isOverlayDetail = !isDesktopViewport && Boolean(routeState?.backgroundLocation?.pathname);
  const shouldUseDetailPageScroll = isMobile && !isOverlayDetail && !isDesktopViewport;

  const { data: post, isLoading, isFetching, isError, error, refetch: refetchPost } = usePost(id);

  const {
    toggleLike,
    hasLiked,
    likeCount,
    isPending: likePending,
  } = usePostStats(id || '', {
    hasLiked: !!post?.hasLiked,
    likeCount: post?.likeCount || 0,
  });

  const recordShare = useRecordShare(id || '');
  const recordView = useRecordView(id || '');
  const shouldLoadPostLikers = Boolean(id && post?.id);
  const {
    data: postLikeSummary,
    isLoading: isPostLikersLoading,
    isFetching: isPostLikersFetching,
    isFetched: isPostLikersFetched,
  } = usePostLikers(id, shouldLoadPostLikers, DETAIL_LIKE_WALL_LIMIT);
  const {
    isLikeWallLoading,
    visibleLikeWallLikers,
    visibleLikeWallTotal,
  } = usePostDetailLikeWall({
    currentUser,
    hasLiked,
    isPostLikersFetched,
    isPostLikersFetching,
    isPostLikersLoading,
    likeCount,
    likers: postLikeSummary?.items,
  });
  const postAuthorId = normalizeAuthorId(post);
  const isSelfAuthor = !!(currentUser?.id && postAuthorId && currentUser.id === postAuthorId);
  const { data: postAuthorFollowStatus } = useFollowStatus(
    postAuthorId,
    !!currentUser && !!postAuthorId && postAuthorId !== 'anonymous' && !isSelfAuthor,
  );

  const [activeImageIndex, setActiveImageIndex] = useState(-1);
  const [isQuoteSheetOpen, setIsQuoteSheetOpen] = useState(false);
  const [isCommentSheetOpen, setIsCommentSheetOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  const { handleBack } = usePostDetailReturn(location, navigate);

  const detailContent = useMemo(() => buildPostDetailContentModel(post), [post]);
  const postImages = detailContent.images;
  const sourceText = resolveDetailSourceText(post);
  const sharePayload: SharePayload | null = useMemo(() => {
    if (!post?.id) return null;
    return buildSharePayload({
      postId: post.id,
      title: post.title,
      content: post.content,
      maxTextLength: 72,
    });
  }, [post?.id, post?.title, post?.content]);

  const shareState = usePostDetailShare({
    post,
    recordShare,
    sharePayload,
    showToast,
  });

  const sortedTags = useMemo(() => {
    return buildSortedDetailLocationTags(post?.location);
  }, [post?.location]);
  const locationTags = useMemo(
    () => sortedTags.filter((tag) => isLocationTag(tag)),
    [sortedTags],
  );
  const structuredMetaItems = useMemo(
    () => buildPostStructuredMetaItems((post as any)?.categoryMeta),
    [post],
  );
  const visibleLocationTags = useMemo(
    () => structuredMetaItems.some(isPostStructuredLocationMeta) ? [] : locationTags,
    [locationTags, structuredMetaItems],
  );
  const hasDetailMetadata = Boolean(
    post?.category ||
    visibleLocationTags.length > 0 ||
    structuredMetaItems.length > 0 ||
    sourceText,
  );
  const detailContentKind: PostDetailContentKind = resolvePostDetailContentKind({
    ...detailContent,
    hasMetadata: hasDetailMetadata,
  });

  usePostDetailViewTracking(post?.id ? String(post.id) : undefined, recordView);

  const navigateToUser = useCallback(
    (uid: string | undefined) => {
      const normalizedUid = String(uid || '').trim();
      if (!normalizedUid || normalizedUid === 'anonymous') return;
      if (currentUser?.id === normalizedUid) {
        navigate('/profile');
        return;
      }
      navigate(`/user/${normalizedUid}`, {
        state: withOverlayBackground(location),
      });
    },
    [currentUser?.id, location, navigate],
  );
  const { guarded: guardedNavigateToUser } = useInteractionGuard(
    (uid?: string) => navigateToUser(uid),
    220,
  );
  const overlayBackgroundLocation = getOverlayBackgroundLocation(location);

  const handleContact = useCallback(() => {
    if (!post) return;
    requireAuth(() => {
      if (!openTelegramContact(post.contact)) {
        showToast('联系方式格式不正确或未提供', 'error');
      }
    });
  }, [post, requireAuth, showToast]);
  const { guarded: guardedContact } = useInteractionGuard(handleContact, 260);

  const { guarded: guardedShare } = useInteractionGuard(shareState.handleShare, 420);
  const handleOpenQuoteSheet = useCallback(() => {
    setIsCommentSheetOpen(false);
    setIsQuoteSheetOpen(true);
  }, []);
  const handleCloseQuoteSheet = useCallback(() => setIsQuoteSheetOpen(false), []);
  const handleOpenCommentSheet = useCallback(() => {
    setIsQuoteSheetOpen(false);
    setIsCommentSheetOpen(true);
  }, []);
  const handleCloseCommentSheet = useCallback(() => setIsCommentSheetOpen(false), []);
  const { guarded: guardedOpenQuoteSheet } = useInteractionGuard(handleOpenQuoteSheet, 260);
  const { guarded: guardedOpenCommentSheet } = useInteractionGuard(handleOpenCommentSheet, 260);
  const { isLikeFeedbackActive, triggerLikeFeedback } = useLikeFeedback();

  const handlePostLike = useCallback(() => {
    requireAuth(() => {
      if (!hasLiked) triggerLikeFeedback();
      toggleLike();
    });
  }, [hasLiked, requireAuth, toggleLike, triggerLikeFeedback]);
  const { guarded: guardedPostLike } = useInteractionGuard(handlePostLike, 320);

  useEffect(() => {
    setActiveImageIndex(-1);
    setIsQuoteSheetOpen(false);
    setIsCommentSheetOpen(false);
  }, [id]);

  useEffect(() => {
    setCommentCount(Math.max(0, Number((post as any)?.commentCount || 0)));
  }, [post?.id, (post as any)?.commentCount]);

  useEffect(() => {
    if (postImages.length === 0 && activeImageIndex >= 0) {
      setActiveImageIndex(-1);
      return;
    }

    if (activeImageIndex >= postImages.length) {
      setActiveImageIndex(-1);
    }
  }, [activeImageIndex, postImages.length]);


  const openImage = useCallback(
    (index: number) => {
      const safeIndex = clampMediaIndex(index, postImages.length);
      setActiveImageIndex(safeIndex < 0 ? -1 : safeIndex);
    },
    [postImages.length],
  );
  const { guarded: guardedOpenImage } = useInteractionGuard(openImage, 260);
  const { guarded: guardedCloseImage } = useInteractionGuard(() => setActiveImageIndex(-1), 260);

  const isInitialDetailLoading = Boolean(id) && (isLoading || (isFetching && !post));

  if (isInitialDetailLoading) {
    return (
      <DetailLoadingPage
        isMobile={isMobile}
        isOverlayDetail={isOverlayDetail}
        shouldUseDetailPageScroll={shouldUseDetailPageScroll}
        onBack={handleBack}
      />
    );
  }

  if (!post) {
    const errorMessage = error instanceof Error ? error.message : '';
    const isNotFoundError = /(^|\D)404(\D|$)|不存在|not found/i.test(errorMessage);

    if (isError && !isNotFoundError) {
      return (
        <>
          <SEO
            title="内容加载失败｜推推"
            description="这条内容暂时无法加载，请稍后重试。"
          />
          <DetailStatePage
            isMobile={isMobile}
            isOverlayDetail={isOverlayDetail}
            shouldUseDetailPageScroll={shouldUseDetailPageScroll}
            onBack={handleBack}
            stateBlock={{
              title: '内容加载失败',
              description: '网络恢复后可重新加载这条内容。',
              tone: 'error',
              actionLabel: '重新加载',
              onAction: () => void refetchPost(),
              secondaryActionLabel: '返回广场',
              onSecondaryAction: handleBack,
            }}
          />
        </>
      );
    }

    return (
      <>
        <SEO
          title="帖子不存在｜推推"
          description="该帖子已被下架、删除，或暂时无法访问。"
        />
        <DetailStatePage
          isMobile={isMobile}
          isOverlayDetail={isOverlayDetail}
          shouldUseDetailPageScroll={shouldUseDetailPageScroll}
          onBack={handleBack}
          stateBlock={{
            title: isMobile ? '帖子不存在' : '该帖子已被下架或不存在',
            tone: 'empty',
            actionLabel: '返回广场',
            onAction: handleBack,
          }}
        />
      </>
    );
  }

  const postIsAnonymous = isAnonymousAuthor(post);
  const headerAuthorId = normalizeAuthorId(post);
  const authorDisplayName = post.isAnonymous || postIsAnonymous ? '匿名用户' : (post.user?.displayName || '用户');
  const canNavigateAuthor = !postIsAnonymous;
  const canShowFollowAction = canNavigateAuthor && !!headerAuthorId;
  const canShowContactAction =
    post.showContact !== false &&
    Boolean(String(post.contact || '').trim());

  const headerLeft = (
    <>
      <DetailBackButton onBack={handleBack} />
      <button
        type="button"
        onClick={() => canNavigateAuthor && guardedNavigateToUser(headerAuthorId)}
        className="detail-topbar-author pressable detail-topbar-author-row"
        aria-label={canNavigateAuthor ? `查看用户主页：${authorDisplayName}` : '匿名用户'}
        disabled={!canNavigateAuthor}
      >
        <AvatarImage
          src={postIsAnonymous ? '' : (post.user?.photoUrl || '')}
          name={authorDisplayName}
          id={headerAuthorId || 'anonymous'}
          alt={authorDisplayName}
          className="detail-topbar-author-avatar"
          variant="thumb"
          loading="eager"
        />
        <div className="detail-topbar-author-meta">
          <div className="detail-topbar-author-name">{authorDisplayName}</div>
          <div className="detail-topbar-author-time">{formatRelativeTime(post.createdAt)}</div>
        </div>
      </button>
    </>
  );

  const followContact = (
    <div className="detail-topbar-actions">
      {canShowFollowAction && !isSelfAuthor && (!currentUser || postAuthorFollowStatus?.following !== true) ? (
        <FollowButton
          userId={headerAuthorId}
          size="sm"
          className="detail-topbar-follow-button"
        />
      ) : null}
      {canShowContactAction ? (
        <TelegramContactIconButton
          onClick={guardedContact}
          className="detail-topbar-contact-button"
          ariaLabel="联系发布人"
          title="联系发布人"
        />
      ) : null}
    </div>
  );

  const { titleText, contentText } = detailContent;
  const detailDescription = (contentText || titleText).substring(0, isMobile ? 100 : 120);
  const likeCountText = formatEngagementCount(likeCount);
  const shareCountText = formatEngagementCount(shareState.shareCount);
  const quoteCount = detailContent.quoteCount;
  const interactionCount = quoteCount + commentCount;
  const quoteCountText = formatEngagementCount(quoteCount);
  const commentCountText = formatEngagementCount(commentCount);
  const heatCountText = formatEngagementCount((post as any).heatScore) || '0';
  const shareImage = postImages[0] ?? '';
  const categoryName = (post as any).category?.name || (post as any).categoryName || '圈内信息';
  const keywordText = joinKeywords([
    categoryName,
    (post as any).location,
    ...structuredMetaItems.map((item) => item.value),
    '分类信息',
    '圈内信息',
    '推推',
  ]);
  const postSeo = buildPostSeo(titleText || detailDescription || '帖子详情');
  const postJsonLd = (() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const postUrl = origin ? `${origin}/post/${post.id}` : undefined;
    const imageUrl = shareImage
      ? buildAbsoluteUrl(shareImage, origin)
      : origin
        ? `${origin}/share/post/${post.id}/preview.jpg`
        : undefined;
    const categoryId = post.categoryId || (post as any).category?.id || categoryName;

    return [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: titleText || postSeo.title,
        description: postSeo.description,
        image: imageUrl ? [imageUrl] : undefined,
        datePublished: post.createdAt,
        dateModified: (post as any).updatedAt || post.createdAt,
        author: {
          '@type': 'Person',
          name: authorDisplayName,
        },
        publisher: {
          '@type': 'Organization',
          name: '推推',
          logo: origin ? `${origin}/icon-512.png` : undefined,
        },
        keywords: keywordText,
        articleSection: categoryName,
        interactionStatistic: [
          {
            '@type': 'InteractionCounter',
            interactionType: { '@type': 'LikeAction' },
            userInteractionCount: likeCount || 0,
          },
          {
            '@type': 'InteractionCounter',
            interactionType: { '@type': 'ShareAction' },
            userInteractionCount: shareState.shareCount || 0,
          },
          {
            '@type': 'InteractionCounter',
            interactionType: { '@type': 'ViewAction' },
            userInteractionCount: post.viewCount || 0,
          },
        ],
        mainEntityOfPage: postUrl,
        inLanguage: 'zh-CN',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: '推推',
            item: origin || undefined,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: categoryName,
            item: origin ? `${origin}/category/${encodeURIComponent(categoryId)}` : undefined,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: titleText || '帖子详情',
            item: postUrl,
          },
        ],
      },
    ];
  })();
  const hasMetaRow = Boolean(post.category || visibleLocationTags.length > 0 || structuredMetaItems.length > 0);
  const showPublishedAt = !isMobile && Boolean(contentText || hasMetaRow || !postImages.length);
  const hasArticleBody = Boolean(contentText || hasMetaRow || showPublishedAt);

  return (
    <AppPage
      data-route-overlay={isOverlayDetail ? '' : undefined}
      data-route-overlay-scroll={isOverlayDetail ? '' : undefined}
      mobileAddressBarScroll={shouldUseDetailPageScroll}
      className={`detail-page detail-page--ready ${isMobile ? 'detail-page--mobile' : 'detail-page--desktop'}`}
    >
      <SEO
        title={postSeo.title}
        description={postSeo.description}
        keywords={keywordText}
        image={shareImage}
        id={post.id}
        type="article"
        jsonLd={postJsonLd}
      />

      <PageHeader
        title=""
        left={headerLeft}
        right={followContact}
        showBack={false}
        className="detail-page-topbar"
        contentClassName="detail-topbar-inner"
        leftClassName="detail-topbar-left"
        rightClassName="detail-topbar-right"
      />

      <PageContentShell
        as="main"
        variant="fluid"
        className={`detail-page-main ui-app-page-main ${isMobile ? 'detail-page-main--mobile' : 'detail-page-main--desktop'}`}
      >
        <article
          className={`detail-article ${isMobile ? 'detail-article--mobile' : 'detail-article--desktop'}`}
          data-detail-content-kind={detailContentKind}
          data-has-media={postImages.length > 0 ? 'true' : undefined}
          data-has-quote-preview={(post as any).quotedPost ? 'true' : undefined}
          data-has-source={sourceText ? 'true' : undefined}
          data-has-quotes={interactionCount > 0 ? 'true' : undefined}
        >
          {hasArticleBody ? (
            <div className="detail-article-body">
              {contentText ? (
                <div className="detail-content">
                  <HashtagText text={contentText} />
                </div>
              ) : null}

              {hasMetaRow ? (
                <div className={`${POST_TAG_ROW_CLASS} detail-tag-row`}>
                {visibleLocationTags.map((tag: any) => {
                  const label = normalizeLocationName(tag.name);
                  if (!label) return null;
                  return (
                    <button
                      type="button"
                      key={tag.id || `location-${label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/category/${toLocationCategoryId(label)}?view=location`, {
                          state: { name: label, resultType: 'location', backgroundLocation: overlayBackgroundLocation },
                        });
                      }}
                      className={LOCATION_TAG_CHIP_CLASS}
                      data-chip-kind="location"
                      aria-label={`查看地点：${label}`}
                    >
                      <MapPin className="detail-location-chip-icon" aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  );
                })}

                {post.category?.id ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/category/${post.category!.id}`, {
                        state: { name: post.category!.name, resultType: 'category', backgroundLocation: overlayBackgroundLocation },
                      });
                    }}
                    className={NORMAL_TAG_CHIP_CLASS}
                    data-chip-kind="category"
                    aria-label={`查看分类：${post.category.name}`}
                  >
                    <span>{post.category.name}</span>
                  </button>
                ) : null}

                {structuredMetaItems.map((item) => {
                  const chipKind = resolvePostMetaChipKind(item);
                  return (
                    <span key={`meta-${item.key}`} className={`${getPostMetaChipClass(chipKind)} post-tag-chip--meta`} data-chip-kind={chipKind} title={`${item.label}：${item.value}`}>
                      <PostStructuredMetaValue item={item} />
                    </span>
                  );
                })}
                </div>
              ) : null}

              {showPublishedAt ? <div className="detail-published-at">发布于 {formatRelativeTime(post.createdAt)}</div> : null}
            </div>
          ) : null}

          {postImages.length > 0 ? (
            <div className="detail-media-wrap">
              <PostMediaGrid images={postImages} onOpen={guardedOpenImage} priority stableAspectRatio />
            </div>
          ) : null}

          {(post as any).quotedPost ? (
            <QuotedPostPreviewCard
              post={(post as any).quotedPost}
              className="detail-quoted-post"
            />
          ) : null}

          {sourceText ? (
            <div className="detail-source-line">
              <span>来自</span>
              <span className="detail-source-text">{sourceText}</span>
            </div>
          ) : null}

          <DetailLikeWall
            likers={visibleLikeWallLikers}
            total={visibleLikeWallTotal}
            loading={isLikeWallLoading}
          />

          {interactionCount > 0 ? (
            <PostDetailInteractionsSection
              postId={post.id}
              quoteCount={quoteCount}
              commentCount={commentCount}
            />
          ) : null}
        </article>
      </PageContentShell>

      <DetailBottomBar
        isMobile={isMobile}
        heatCountText={heatCountText}
        hasLiked={hasLiked}
        likePending={likePending}
        isLikeFeedbackActive={isLikeFeedbackActive}
        likeCountText={likeCountText}
        commentCountText={commentCountText}
        isSharing={shareState.isSharing}
        shareCountText={shareCountText}
        quoteCountText={quoteCountText}
        onLike={guardedPostLike}
        onOpenCommentSheet={guardedOpenCommentSheet}
        onShare={guardedShare}
        onOpenQuoteSheet={guardedOpenQuoteSheet}
      />

      <PostQuoteSheet
        open={isQuoteSheetOpen}
        postId={post.id}
        quoteCount={quoteCount}
        targetPost={post as any}
        onClose={handleCloseQuoteSheet}
      />

      <PostCommentSheet
        open={isCommentSheetOpen}
        postId={post.id}
        commentCount={commentCount}
        onCommentCountChange={setCommentCount}
        onClose={handleCloseCommentSheet}
      />

      {postImages.length > 0 && activeImageIndex >= 0 && (
        <Suspense fallback={null}>
          <ImageLightbox
            images={postImages}
            index={activeImageIndex}
            onClose={guardedCloseImage}
            onChange={openImage}
          />
        </Suspense>
      )}
    </AppPage>
  );
}
