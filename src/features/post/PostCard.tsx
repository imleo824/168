import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, FlameKindling, Link2, MapPin, Megaphone, MessageCircle, Quote, RadioTower, RefreshCw, Share, ThumbsUp } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { PostOptionsMenu } from '@/features/post/AnchoredActionMenu';
import PostMediaGrid from '@/features/post/PostMediaGrid';
import PostCommentSheet from '@/features/post/PostCommentSheet';
import PostQuoteSheet from '@/features/post/PostQuoteSheet';
import QuotedPostPreviewCard from '@/features/post/QuotedPostPreviewCard';
import TelegramSyncConfirmSheet from '@/features/post/TelegramSyncConfirmSheet';
import { HashtagText } from '@/features/post/HashtagText';
import { useDelayedHoverAction } from '@/hooks/useDelayedHoverAction';
import { useActionLock } from '@/hooks/useActionLock';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { useLikeFeedback } from '@/hooks/useLikeFeedback';
import { useConfig, usePostStats, usePrefetchPost } from '@/hooks/useData';
import AvatarImage from '@/ui/AvatarImage';
import TelegramContactIconButton from '@/ui/TelegramContactIconButton';
import { FollowButton } from '@/features/social/FollowButton';
import { PostStructuredMetaValue } from '@/features/post/PostStructuredMetaValue';
import type { Post, TelegramSyncStatus } from '@/types';
import * as api from '@/services/api';
import { getTelegramContactUrl, openTelegramContact } from '@/utils/contact';
import { formatCompactChineseEngagementCount } from '@/utils/engagement';
import { clampMediaIndex, dedupeUnique, normalizeImageList } from '@/utils/media';
import { withCurrentBackground } from '@/utils/navigationState';
import { resolveUserAvatarUrl } from '@/utils/avatarResolver';
import { buildDisplayLocationTags, isLocationTag, normalizeLocationName, normalizeTagName, stripInlineHashtags, toLocationCategoryId } from '@/utils/postPresentation';
import { buildPostStructuredMetaItems, isPostStructuredLocationMeta, type PostStructuredMetaItem } from '@/utils/postStructuredMeta';
import { getPostMetaChipClass, LOCATION_TAG_CHIP_CLASS, NORMAL_TAG_CHIP_CLASS, POST_TAG_ROW_CLASS, resolvePostMetaChipKind } from '@/utils/postTagStyles';
import { rememberListReturnPosition } from '@/utils/listReturnScroll';
import { resolveVisiblePostText } from '@/utils/postDisplayText';
import { primePostCreateComposerFocus } from '@/utils/postCreateFocusBridge';
import { formatRelativeTime } from '@/utils/time';

const ImageLightbox = React.lazy(() => import('@/ui/ImageLightbox'));

const ANONYMOUS_USER_ID = 'anonymous';
const CONTENT_WITH_MEDIA_CLAMP_LINES = 4;
const CONTENT_TEXT_ONLY_CLAMP_LINES = 6;
const POST_DETAIL_PREFETCH_DELAY = 120;
const POST_PROMOTION_LINK_META_KEY = '__postPromotionLink';

type ExpandedContentStatus = 'idle' | 'loading' | 'loaded' | 'error';
type PostPromotionLink = { title: string; url: string };

const CARD_NESTED_INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[data-card-interactive="true"]',
  '[data-no-card-click="true"]',
  '[data-stop-card-navigation="true"]',
].join(',');

export interface FeedPost {
  id: string;
  userId?: string;
  content?: string;
  title?: string;
  location?: string | null;
  source?: string | null;
  contact?: string;
  showContact?: boolean;
  images?: string[];
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  quoteCount?: number;
  quotedPostId?: string | null;
  quotedPost?: Post['quotedPost'];
  heatScore?: number;
  viewCount?: number;
  hasLiked?: boolean;
  isPinned?: boolean;
  isPublished?: boolean;
  isFeedPreview?: boolean;
  syncToTelegram?: boolean;
  telegramSyncStatus?: TelegramSyncStatus;
  telegramSyncedAt?: string | null;
  telegramSyncRequestedAt?: string | null;
  telegramSyncLastError?: string | null;
  country?: string;
  categoryId?: string;
  createdAt?: string | Date;
  user?: {
    id?: string;
    displayName?: string;
    username?: string;
    name?: string;
    photoUrl?: string;
    avatarUrl?: string;
    avatar?: string;
    imageUrl?: string;
    profileImageUrl?: string;
    profilePhotoUrl?: string;
    photoURL?: string;
    userType?: 'NORMAL' | 'ROBOT' | 'OFFICIAL';
    hasRecentPost?: boolean;
    recentPostCreatedAt?: string | Date | null;
    isTuiPlus?: boolean;
    plusStatus?: string | null;
    plusExpiresAt?: string | Date | null;
  };
  category?: { id: string; name: string; slug?: string };
  categories?: Array<{ categoryId: string; category: { id: string; name: string } }>;
  primaryCategory?: { id: string; name: string };
  subCategories?: Array<{ id: string; name: string }>;
  categoryMeta?: Record<string, unknown> | null;
  [key: string]: unknown;
}

interface PostCardProps {
  post: Post | FeedPost;
  isOwner?: boolean;
  showStatus?: boolean;
  onStatusChange?: (post: Post, isPublished: boolean) => void;
  onDelete?: (post: Post) => void;
  hideContact?: boolean;
  hideCategoryTag?: boolean;
  priorityMedia?: boolean;
  enableRecommendationControls?: boolean;
  onTelegramSync?: (post: Post | FeedPost) => Promise<void> | void;
  telegramChannelUrl?: string | null;
}

interface PostActionBarProps {
  hasLiked: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  quoteCount: number;
  heatScore: number;
  isPending: boolean;
  isSharePending: boolean;
  canShowTelegramSync: boolean;
  telegramSyncStatus: TelegramSyncStatus;
  isTelegramSyncSubmitting: boolean;
  canShowPromote: boolean;
  isLikeFeedbackActive: boolean;
  onToggleLike: (event: React.MouseEvent) => void;
  onComment: (event: React.MouseEvent) => void;
  onShare: (event: React.MouseEvent) => void;
  onQuote: (event: React.MouseEvent) => void;
  onTelegramSync: (event: React.MouseEvent) => void;
  onPromote: (event: React.MouseEvent) => void;
}

interface TagRowProps {
  locationTags: Array<{ id: string; name: string; isLocation?: boolean }>;
  categoryChips: Array<{ id: string; name: string }>;
  structuredMetaItems: PostStructuredMetaItem[];
  className?: string;
  onTagClick: (event: React.MouseEvent, id: string, name: string, type: 'category' | 'location') => void;
  onStructuredMetaClick: (event: React.MouseEvent, item: PostStructuredMetaItem) => void;
}

interface AuthorAvatarLinkProps {
  authorId: string;
  canOpenProfile: boolean;
  profileTo: string;
  profileState?: unknown;
  userAvatarUrl: string;
  userDisplayName: string;
  hasRecentPost: boolean;
  isTuiPlus: boolean;
}

function cleanString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function cleanDisplayName(value: unknown): string {
  const displayName = cleanString(value).replace(/^@+/, '').trim();
  return displayName || '未知用户';
}

function isTuiPlusUserLike(user: any) {
  if (!user) return false;
  if (user.isTuiPlus) return true;
  const expiresAt = user.plusExpiresAt ? new Date(user.plusExpiresAt).getTime() : 0;
  const status = cleanString(user.plusStatus).toUpperCase();
  return Boolean(expiresAt && expiresAt > Date.now() && (status === 'TRIALING' || status === 'ACTIVE'));
}

function stopAndPrevent(event: React.SyntheticEvent) {
  event.stopPropagation();
  event.preventDefault();
}

function isNestedInteractiveTarget(target: EventTarget | null, currentTarget: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element) || !(currentTarget instanceof Element)) return false;
  const interactive = target.closest(CARD_NESTED_INTERACTIVE_SELECTOR);
  return Boolean(interactive && interactive !== currentTarget && currentTarget.contains(interactive));
}

function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.className = 'ui-clipboard-buffer';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return Promise.resolve();
}

function buildPostShareText(post: FeedPost) {
  const content = stripInlineHashtags(resolveVisiblePostText(post));
  const title = content.slice(0, 48) || '推推圈内事';
  const url = typeof window !== 'undefined' ? `${window.location.origin}/post/${post.id}` : `/post/${post.id}`;
  return { title, text: `${title}\n\n来自推推：圈内事 · 发推推`, url };
}

function normalizePost(post: Post | FeedPost, hideContact: boolean): FeedPost {
  const next = post as FeedPost;
  return { ...next, contact: hideContact ? '' : cleanString(next.contact), showContact: hideContact ? false : next.showContact };
}

function normalizePostTelegramSyncStatus(post: Pick<FeedPost, 'telegramSyncStatus' | 'syncToTelegram'>): TelegramSyncStatus {
  const status = cleanString(post.telegramSyncStatus).toUpperCase();
  if (status === 'PENDING' || status === 'SENT' || status === 'FAILED' || status === 'NONE') return status;
  return post.syncToTelegram === true ? 'SENT' : 'NONE';
}

function normalizePromotionUrl(raw: unknown) {
  const value = cleanString(raw);
  if (!value) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function getPostPromotionLink(categoryMeta: unknown): PostPromotionLink | null {
  if (!categoryMeta || typeof categoryMeta !== 'object' || Array.isArray(categoryMeta)) return null;
  const raw = (categoryMeta as Record<string, unknown>)[POST_PROMOTION_LINK_META_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const title = cleanString((raw as Record<string, unknown>).title).slice(0, 40);
  const url = normalizePromotionUrl((raw as Record<string, unknown>).url);
  return title && url ? { title, url } : null;
}

function dedupeTagItems(items: Array<{ id: string; name: string }>): Array<{ id: string; name: string }> {
  const seen = new Set<string>();
  return items.filter((item) => {
    const label = normalizeTagName(item.name);
    if (!label) return false;
    const key = `${item.id || label}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCategoryChips(post: FeedPost): Array<{ id: string; name: string }> {
  const items: Array<{ id: string; name: string }> = [];
  const categoryId = cleanString(post.categoryId);
  if (categoryId && post.category?.id === categoryId && post.category?.name) items.push({ id: post.category.id, name: post.category.name });
  if (post.category?.id && post.category?.name) items.push({ id: post.category.id, name: post.category.name });
  if (post.primaryCategory?.id && post.primaryCategory?.name) items.push({ id: post.primaryCategory.id, name: post.primaryCategory.name });
  const matchedCategory = categoryId ? (post.categories || []).find((item) => item?.category?.id === categoryId)?.category : null;
  if (matchedCategory?.id && matchedCategory?.name) items.push({ id: matchedCategory.id, name: matchedCategory.name });
  (post.categories || []).forEach((item) => { if (item?.category?.id && item?.category?.name) items.push({ id: item.category.id, name: item.category.name }); });
  (post.subCategories || []).forEach((item) => { if (item?.id && item?.name) items.push({ id: item.id, name: item.name }); });
  return dedupeTagItems(items).slice(0, 1);
}

function TagRow({ locationTags, categoryChips, structuredMetaItems, className, onTagClick, onStructuredMetaClick }: TagRowProps) {
  if (!locationTags.length && !categoryChips.length && !structuredMetaItems.length) return null;
  return (
    <div className={`${POST_TAG_ROW_CLASS}${className ? ` ${className}` : ''}`}>
      {locationTags.map((tag) => {
        const label = normalizeLocationName(tag.name);
        if (!label) return null;
        return (
          <button type="button" key={`loc-${tag.id}-${label}`} onClick={(event) => onTagClick(event, tag.id, label, 'location')} className={LOCATION_TAG_CHIP_CLASS} data-chip-kind="location" aria-label={`查看地点：${label}`}>
            <MapPin className="x-card-tag-icon" />
            <span>{label}</span>
          </button>
        );
      })}
      {categoryChips.map((tag) => (
        <button type="button" key={`category-${tag.id}`} onClick={(event) => onTagClick(event, tag.id, tag.name, 'category')} className={NORMAL_TAG_CHIP_CLASS} data-chip-kind="category" aria-label={`查看分类：${tag.name}`}>
          <span>{normalizeTagName(tag.name)}</span>
        </button>
      ))}
      {structuredMetaItems.map((item) => {
        const chipKind = resolvePostMetaChipKind(item);
        return (
          <button type="button" key={`meta-${item.key}`} onClick={(event) => onStructuredMetaClick(event, item)} className={`${getPostMetaChipClass(chipKind)} post-tag-chip--meta`} data-chip-kind={chipKind} title={`${item.label}：${item.value}`} aria-label={`查看${item.label}：${item.value}`}>
            <PostStructuredMetaValue item={item} />
          </button>
        );
      })}
    </div>
  );
}

const AuthorAvatarLink = memo(function AuthorAvatarLink({ authorId, canOpenProfile, profileTo, profileState, userAvatarUrl, userDisplayName, hasRecentPost, isTuiPlus }: AuthorAvatarLinkProps) {
  const handleClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
    if (!canOpenProfile) event.preventDefault();
    else rememberListReturnPosition(event.currentTarget);
  }, [canOpenProfile]);

  return (
    <div className="feed-card-author-avatar-menu" data-card-interactive="true" data-no-card-click="true">
      <Link to={profileTo} state={profileState} onClick={handleClick} aria-disabled={!canOpenProfile} className="feed-card-author-avatar-link" title={userDisplayName} data-tui-plus={isTuiPlus ? 'true' : undefined}>
        <AvatarImage src={userAvatarUrl} name={userDisplayName} id={authorId} alt={`${userDisplayName} 的头像`} className="feed-card-author-avatar" variant="thumb" isTuiPlus={isTuiPlus} />
      </Link>
      {hasRecentPost ? <span className="feed-card-author-recent-badge" aria-label="近期有发布" /> : null}
    </div>
  );
});

const PostPromotionLinkCard = memo(function PostPromotionLinkCard({ link }: { link: PostPromotionLink }) {
  return (
    <a
      className="pressable post-card-promotion-link"
      data-link-type="website"
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      data-card-interactive="true"
      data-no-card-click="true"
      onClick={(event) => { event.stopPropagation(); }}
    >
      <Link2 className="post-card-promotion-link-icon" aria-hidden="true" />
      <span className="post-card-promotion-link-label">{link.title}</span>
    </a>
  );
});

const PostActionBar = memo(function PostActionBar({
  hasLiked,
  likeCount,
  commentCount,
  shareCount,
  quoteCount,
  heatScore,
  isPending,
  isSharePending,
  canShowTelegramSync,
  telegramSyncStatus,
  isTelegramSyncSubmitting,
  canShowPromote,
  isLikeFeedbackActive,
  onToggleLike,
  onComment,
  onShare,
  onQuote,
  onTelegramSync,
  onPromote,
}: PostActionBarProps) {
  const likeCountText = formatCompactChineseEngagementCount(likeCount);
  const commentCountText = formatCompactChineseEngagementCount(commentCount);
  const shareCountText = formatCompactChineseEngagementCount(shareCount);
  const quoteCountText = formatCompactChineseEngagementCount(quoteCount);
  const heatCountText = formatCompactChineseEngagementCount(heatScore) || '0';
  const telegramSyncTitle = telegramSyncStatus === 'SENT' ? '已同步到频道' : telegramSyncStatus === 'PENDING' ? '已提交同步' : '同步到频道';
  const isTelegramSyncDisabled = isTelegramSyncSubmitting;
  const isTelegramSyncReady = telegramSyncStatus === 'NONE' || telegramSyncStatus === 'FAILED';
  const TelegramSyncIcon = telegramSyncStatus === 'PENDING' ? RefreshCw : RadioTower;
  const hasManagementActions = canShowTelegramSync || canShowPromote;

  return (
    <div className={['x-card-action-row', hasManagementActions ? 'x-card-action-row--with-management' : ''].filter(Boolean).join(' ')} data-card-interactive="true" data-no-card-click="true">
      <div className="x-card-action-primary">
        <span className="ui-action-cell x-card-action-cell x-card-action-stat x-card-action-stat--heat" aria-label={`热度 ${heatCountText}`}><FlameKindling className="feed-action-heat-icon" aria-hidden="true" /><span className="feed-action-count">{heatCountText}</span></span>
        <button type="button" onClick={onToggleLike} disabled={isPending} aria-label={hasLiked ? '取消点赞' : '点赞'} aria-pressed={hasLiked} className={`ui-action-cell x-card-action-cell feed-action-btn feed-action-btn--like ${isLikeFeedbackActive ? 'is-like-feedback-active' : ''} ${isPending ? 'feed-action-btn--pending' : ''}`}><ThumbsUp className="feed-action-like-icon" fill={hasLiked ? 'currentColor' : 'none'} />{likeCountText ? <span className="feed-action-count">{likeCountText}</span> : null}</button>
        <button type="button" onClick={onComment} aria-label={`查看评论，${commentCountText || '0'} 条`} className="ui-action-cell x-card-action-cell feed-action-btn feed-action-btn--comment"><MessageCircle />{commentCountText ? <span className="feed-action-count">{commentCountText}</span> : null}</button>
        <button type="button" onClick={onShare} disabled={isSharePending} aria-label="分享" className={`ui-action-cell x-card-action-cell feed-action-btn feed-action-btn--share ${isSharePending ? 'feed-action-btn--pending' : ''}`}><Share />{shareCountText ? <span className="feed-action-count">{shareCountText}</span> : null}</button>
        <button type="button" onClick={onQuote} aria-label={`查看引用，${quoteCountText || '0'} 条`} className="ui-action-cell x-card-action-cell feed-action-btn feed-action-btn--quote"><Quote />{quoteCountText ? <span className="feed-action-count">{quoteCountText}</span> : null}</button>
      </div>
      {hasManagementActions ? (
        <div className="x-card-action-management" aria-label="发布管理操作">
          {canShowTelegramSync ? <button type="button" onClick={onTelegramSync} disabled={isTelegramSyncDisabled} aria-label={telegramSyncTitle} title={telegramSyncTitle} data-sync-ready={isTelegramSyncReady ? 'true' : undefined} data-sync-status={telegramSyncStatus.toLowerCase()} className={`ui-action-cell x-card-action-cell feed-action-btn feed-action-btn--icon-only feed-action-btn--telegram-sync ${isTelegramSyncDisabled ? 'feed-action-btn--disabled' : ''}`}><TelegramSyncIcon /></button> : null}
          {canShowPromote ? <button type="button" onClick={onPromote} aria-label="推广" title="推广" className="ui-action-cell x-card-action-cell feed-action-btn feed-action-btn--icon-only feed-action-btn--promote"><Megaphone /></button> : null}
        </div>
      ) : null}
    </div>
  );
});

const PostCard = memo(function PostCard({ post: inputPost, isOwner = false, showStatus = false, onStatusChange, onDelete, hideContact = false, hideCategoryTag = false, priorityMedia = false, enableRecommendationControls = false, onTelegramSync, telegramChannelUrl }: PostCardProps) {
  const post = useMemo(() => normalizePost(inputPost, hideContact), [hideContact, inputPost]);
  const navigate = useNavigate();
  const location = useLocation();
  const prefetchPost = usePrefetchPost();
  const { data: config } = useConfig();
  const { requireAuth, user: currentUser, showToast } = useAuth();
  const postId = cleanString(post.id);
  const isPublished = post.isPublished !== false;
  const isFeedPreview = post.isFeedPreview === true;
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [isContentOverflowing, setIsContentOverflowing] = useState(false);
  const [isTelegramSyncConfirmOpen, setIsTelegramSyncConfirmOpen] = useState(false);
  const [isQuoteSheetOpen, setIsQuoteSheetOpen] = useState(false);
  const [isCommentSheetOpen, setIsCommentSheetOpen] = useState(false);
  const [expandedContent, setExpandedContent] = useState('');
  const [expandedContentStatus, setExpandedContentStatus] = useState<ExpandedContentStatus>('idle');
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
  const expandedContentRequestRef = useRef(0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [localShareCount, setLocalShareCount] = useState(post.shareCount || 0);
  const [localCommentCount, setLocalCommentCount] = useState(Math.max(0, Number(post.commentCount || 0)));

  useEffect(() => setLocalShareCount(post.shareCount || 0), [post.shareCount]);
  useEffect(() => setLocalCommentCount(Math.max(0, Number(post.commentCount || 0))), [post.commentCount]);

  const quoteCount = Math.max(0, Number(post.quoteCount || 0));

  useEffect(() => {
    expandedContentRequestRef.current += 1;
    setIsContentExpanded(false);
    setExpandedContent('');
    setExpandedContentStatus('idle');
  }, [postId]);

  const postImages = useMemo(() => dedupeUnique(normalizeImageList(post.images)), [post.images]);
  const hasMedia = postImages.length > 0;
  const postPromotionLink = useMemo(() => getPostPromotionLink(post.categoryMeta), [post.categoryMeta]);
  const previewDisplayText = useMemo(() => resolveVisiblePostText(post), [post]);
  const displayText = isContentExpanded && expandedContent ? expandedContent : previewDisplayText;
  const contentClampLines = hasMedia ? CONTENT_WITH_MEDIA_CLAMP_LINES : CONTENT_TEXT_ONLY_CLAMP_LINES;
  const shouldShowMore = isContentOverflowing || isContentExpanded || isFeedPreview;
  const contentStyle = { '--x-card-content-clamp-lines': contentClampLines } as CSSProperties;

  const ensureExpandedContent = useCallback(() => {
    if (!postId || !isFeedPreview || expandedContent || expandedContentStatus === 'loading') return;
    const requestId = expandedContentRequestRef.current + 1;
    expandedContentRequestRef.current = requestId;
    setExpandedContentStatus('loading');
    void api.getPost(postId).then((fullPost) => {
      if (expandedContentRequestRef.current !== requestId) return;
      const fullText = resolveVisiblePostText(fullPost as FeedPost);
      setExpandedContent(fullText || previewDisplayText);
      setExpandedContentStatus('loaded');
    }).catch(() => {
      if (expandedContentRequestRef.current !== requestId) return;
      setExpandedContentStatus('error');
    });
  }, [expandedContent, expandedContentStatus, isFeedPreview, postId, previewDisplayText]);

  useLayoutEffect(() => {
    if (isContentExpanded) return;
    const element = contentRef.current;
    if (!element) {
      setIsContentOverflowing(false);
      return;
    }
    const measure = () => {
      setIsContentOverflowing(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [displayText, contentClampLines, isContentExpanded]);

  const handleToggleContentExpanded = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    stopAndPrevent(event);
    const nextExpanded = !isContentExpanded;
    setIsContentExpanded(nextExpanded);
    if (nextExpanded) ensureExpandedContent();
  }, [ensureExpandedContent, isContentExpanded]);

  const postTimeLabel = useMemo(() => (post.createdAt ? formatRelativeTime(post.createdAt) : ''), [post.createdAt]);
  const isSponsoredPost = Boolean(post.isPinned);
  const authorInlineMetaLabel = isSponsoredPost ? '' : postTimeLabel;
  const authorId = cleanString(post.userId || post.user?.id || (post as any).authorId || (post as any).creatorId);
  const isAnon = authorId === ANONYMOUS_USER_ID || !authorId;
  const userDisplayName = isAnon ? '匿名发布' : cleanDisplayName(post.user?.displayName || post.user?.username || post.user?.name || (post as any).userName || (post as any).username || (post as any).authorName || (post as any).authorUsername || '用户');
  const userAvatarUrl = isAnon ? '' : resolveUserAvatarUrl(post);
  const canOpenProfile = !isAnon && Boolean(authorId);
  const authorTuiPlusActive = Boolean(canOpenProfile && isTuiPlusUserLike(post.user));
  const hasRecentAuthorPost = Boolean(canOpenProfile && post.isAnonymous !== true && post.user?.hasRecentPost);
  const profileTo = !canOpenProfile ? '#' : currentUser?.id === authorId ? '/profile' : `/user/${authorId}`;
  const profileState = canOpenProfile && currentUser?.id !== authorId ? withCurrentBackground(location) : undefined;
  const canShowContact = Boolean(post.showContact !== false && cleanString(post.contact));
  const contactUrl = canShowContact ? getTelegramContactUrl(post.contact || '') : '';
  const categoryChips = useMemo(() => (hideCategoryTag ? [] : buildCategoryChips(post)), [hideCategoryTag, post]);
  const displayTags = useMemo(() => buildDisplayLocationTags(post.location), [post.location]);
  const locationTags = useMemo(() => displayTags.filter((tag) => isLocationTag(tag)), [displayTags]);
  const structuredMetaItems = useMemo(() => buildPostStructuredMetaItems(post.categoryMeta), [post.categoryMeta]);
  const visibleLocationTags = useMemo(() => structuredMetaItems.some(isPostStructuredLocationMeta) ? [] : locationTags, [locationTags, structuredMetaItems]);
  const hasVisibleTags = visibleLocationTags.length > 0 || categoryChips.length > 0 || structuredMetaItems.length > 0;
  const hasBodyContent = Boolean(displayText || hasVisibleTags || post.quotedPost);
  const { toggleLike, isPending, hasLiked, likeCount, viewCount } = usePostStats(postId, { hasLiked: !!post.hasLiked, likeCount: post.likeCount || 0, viewCount: post.viewCount || 0 });
  const { isLikeFeedbackActive, triggerLikeFeedback } = useLikeFeedback();
  const likeLock = useActionLock(async () => { await toggleLike(); }, { cooldownMs: 220, mode: 'drop', onError: () => showToast('点赞失败，请稍后重试', 'error') });
  const shareLock = useActionLock(async () => {
    const sharePayload = buildPostShareText(post);
    if (navigator.share) await navigator.share(sharePayload);
    else {
      await copyToClipboard(`${sharePayload.title}\n\n${sharePayload.text}\n\n${sharePayload.url}`);
      showToast('分享内容已复制', 'success');
    }
    setLocalShareCount((count) => count + 1);
  }, { cooldownMs: 1200, mode: 'drop', onError: (error) => { if (error instanceof DOMException && error.name === 'AbortError') return; showToast('分享失败，请稍后重试', 'error'); } });
  const telegramSyncLock = useActionLock(async () => { if (!onTelegramSync) return; await onTelegramSync(inputPost); setIsTelegramSyncConfirmOpen(false); }, { cooldownMs: 1200, mode: 'drop', onError: (error: any) => showToast(error?.message || '同步提交失败，请稍后重试', 'error') });
  const telegramSyncStatus = normalizePostTelegramSyncStatus(post);
  const currentUserTuiPlusActive = isTuiPlusUserLike(currentUser);
  const baseTelegramSyncPrice = Number.isFinite(Number(config?.prices?.telegram_sync)) ? Math.max(0, Math.floor(Number(config?.prices?.telegram_sync))) : 0;
  const telegramSyncPrice = currentUserTuiPlusActive ? 0 : baseTelegramSyncPrice;
  const currentPoints = Number.isFinite(Number(currentUser?.points)) ? Math.max(0, Math.floor(Number(currentUser?.points))) : 0;
  const canAffordTelegramSync = telegramSyncPrice === 0 || currentPoints >= telegramSyncPrice;
  const canShowTelegramSync = Boolean(isOwner && showStatus && onTelegramSync);
  const canShowPromoteAction = Boolean(isOwner && showStatus);
  const resolvedPost = useMemo(() => ({ ...post, viewCount, commentCount: localCommentCount }), [post, viewCount, localCommentCount]);
  const openPostDetail = useCallback((event?: React.MouseEvent<HTMLElement>) => { if (!postId) return; if (event) rememberListReturnPosition(event.currentTarget); prefetchPost(postId); navigate(`/post/${postId}`, { state: withCurrentBackground(location) }); }, [location, navigate, postId, prefetchPost]);
  const { schedule: schedulePrefetch, cancel: cancelPrefetch } = useDelayedHoverAction(() => { if (postId) prefetchPost(postId); }, POST_DETAIL_PREFETCH_DELAY);

  useEffect(() => cancelPrefetch, [cancelPrefetch]);

  const handleCardClick = useCallback((event: React.MouseEvent<HTMLElement>) => { if (event.defaultPrevented || isNestedInteractiveTarget(event.target, event.currentTarget)) return; openPostDetail(event); }, [openPostDetail]);
  const handleProfileClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => { event.stopPropagation(); if (!canOpenProfile) event.preventDefault(); else rememberListReturnPosition(event.currentTarget); }, [canOpenProfile]);
  const handleAnonymousTryClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => { stopAndPrevent(event); requireAuth(() => { primePostCreateComposerFocus(); navigate('/create', { state: { from: `${location.pathname}${location.search}`, defaultAnonymous: true } }); }); }, [location.pathname, location.search, navigate, requireAuth]);
  const handleTagClick = useCallback((event: React.MouseEvent, id: string, name: string, type: 'category' | 'location') => { event.stopPropagation(); event.preventDefault(); const cleanId = cleanString(id); const cleanName = cleanString(name); const targetId = type === 'location' ? toLocationCategoryId(cleanName) : cleanId || cleanName; if (!targetId) return; rememberListReturnPosition(event.currentTarget as HTMLElement); navigate(type === 'location' ? `/category/${targetId}?view=location` : `/category/${encodeURIComponent(targetId)}`, { state: withCurrentBackground(location, { name: cleanName || targetId, resultType: type }) }); }, [location, navigate]);
  const handleStructuredMetaClick = useCallback((event: React.MouseEvent, item: PostStructuredMetaItem) => { event.stopPropagation(); event.preventDefault(); const filters = item.filterValues && Object.keys(item.filterValues).length > 0 ? item.filterValues : { [item.key]: item.rawValue ?? item.value }; if (Object.keys(filters).length === 0) return; const params = new URLSearchParams(); params.set('view', 'tag'); params.set('categoryMetaFilters', JSON.stringify(filters)); rememberListReturnPosition(event.currentTarget as HTMLElement); navigate(`/category/search?${params.toString()}`, { state: withCurrentBackground(location, { name: item.value, resultType: 'tag' }) }); }, [location, navigate]);
  const handleToggleLike = useCallback((event: React.MouseEvent) => { stopAndPrevent(event); requireAuth(() => { if (!hasLiked) triggerLikeFeedback(); void likeLock.run(); }); }, [hasLiked, likeLock, requireAuth, triggerLikeFeedback]);
  const handleComment = useCallback((event: React.MouseEvent) => { stopAndPrevent(event); setIsQuoteSheetOpen(false); setIsCommentSheetOpen(true); }, []);
  const handleCloseCommentSheet = useCallback(() => setIsCommentSheetOpen(false), []);
  const handleCommentCountChange = useCallback((count: number) => { setLocalCommentCount(Math.max(0, Math.floor(Number(count) || 0))); }, []);
  const handleShare = useCallback((event: React.MouseEvent) => { stopAndPrevent(event); void shareLock.run(); }, [shareLock]);
  const handleQuote = useCallback((event: React.MouseEvent) => { stopAndPrevent(event); setIsCommentSheetOpen(false); setIsQuoteSheetOpen(true); }, []);
  const handleCloseQuoteSheet = useCallback(() => setIsQuoteSheetOpen(false), []);
  const requestTelegramSync = useCallback(() => { if (!canShowTelegramSync) return; if (telegramSyncStatus === 'SENT') { showToast('已成功同步1次', 'success'); return; } if (telegramSyncStatus === 'PENDING') { showToast('已提交同步', 'success'); return; } if (!canAffordTelegramSync) { showToast(`积分不足，需 ${telegramSyncPrice} 积分，当前剩余 ${currentPoints} 积分`, 'error'); return; } requireAuth(() => { setIsTelegramSyncConfirmOpen(true); }); }, [canAffordTelegramSync, canShowTelegramSync, currentPoints, requireAuth, showToast, telegramSyncPrice, telegramSyncStatus]);
  const handleTelegramSync = useCallback((event: React.MouseEvent) => { stopAndPrevent(event); requestTelegramSync(); }, [requestTelegramSync]);
  const handleCloseTelegramSyncConfirm = useCallback(() => { if (telegramSyncLock.isPending) return; setIsTelegramSyncConfirmOpen(false); }, [telegramSyncLock.isPending]);
  const handleConfirmTelegramSync = useCallback(() => { if (!canAffordTelegramSync) { showToast(`积分不足，需 ${telegramSyncPrice} 积分，当前剩余 ${currentPoints} 积分`, 'error'); return; } void telegramSyncLock.run(); }, [canAffordTelegramSync, currentPoints, showToast, telegramSyncLock, telegramSyncPrice]);
  const handleContactClick = useCallback((event: React.MouseEvent) => { stopAndPrevent(event); if (!canShowContact || !post.contact) return; requireAuth(() => { openTelegramContact(post.contact || ''); }); }, [canShowContact, post.contact, requireAuth]);
  const handlePromote = useCallback(() => { navigate('/promote', { state: { postId: post.id, from: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined } }); }, [navigate, post.id]);
  const handleStatusChange = useCallback(() => { onStatusChange?.(inputPost as Post, !isPublished); }, [inputPost, isPublished, onStatusChange]);
  const handleDelete = useCallback(() => { onDelete?.(inputPost as Post); }, [inputPost, onDelete]);
  const { guarded: guardedPromote } = useInteractionGuard(handlePromote, 320);
  const { guarded: guardedStatusChange } = useInteractionGuard(handleStatusChange, 420);
  const { guarded: guardedDelete } = useInteractionGuard(handleDelete, 420);
  const handlePromoteClick = useCallback((event: React.MouseEvent) => { stopAndPrevent(event); guardedPromote(); }, [guardedPromote]);
  const ownerMenuOptions = useMemo(() => ({ enabled: showStatus && isOwner, isPublished, onTelegramSync: canShowTelegramSync ? requestTelegramSync : undefined, onPromote: canShowPromoteAction ? guardedPromote : undefined, onStatusChange: guardedStatusChange, onDelete: guardedDelete }), [canShowPromoteAction, canShowTelegramSync, guardedDelete, guardedPromote, guardedStatusChange, isOwner, isPublished, requestTelegramSync, showStatus]);
  const handleOpenLightbox = useCallback((index: number) => setLightboxIndex(clampMediaIndex(index, postImages.length)), [postImages.length]);
  const handleCloseLightbox = useCallback(() => setLightboxIndex(-1), []);
  const handleLightboxChange = useCallback((nextIndex: number) => setLightboxIndex(clampMediaIndex(nextIndex, postImages.length)), [postImages.length]);

  useEffect(() => { setLightboxIndex(-1); }, [location.hash, location.key, location.pathname, location.search]);
  useEffect(() => { if (lightboxIndex >= postImages.length) setLightboxIndex(-1); }, [lightboxIndex, postImages.length]);
  useEffect(() => { likeLock.reset(); shareLock.reset(); telegramSyncLock.reset(); }, [likeLock, postId, shareLock, telegramSyncLock]);

  return (
    <div className="unified-post-card-wrap">
      <article
        data-feed-post-id={postId}
        role="button"
        tabIndex={0}
        aria-label={`查看内容：${(displayText || (hasMedia ? '图片内容' : '内容')).slice(0, 48)}`}
        onClick={handleCardClick}
        onMouseEnter={schedulePrefetch}
        onMouseLeave={cancelPrefetch}
        onKeyDown={(event) => {
          if (event.defaultPrevented || isNestedInteractiveTarget(event.target, event.currentTarget)) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openPostDetail(event as any);
        }}
        className={['ins-post-card', hasMedia ? 'ins-post-card--media' : 'ins-post-card--text', isSponsoredPost ? 'ins-post-card--sponsored' : '', canShowContact ? 'ins-post-card--with-contact-action' : '', post.quotedPost ? 'ins-post-card--quoted' : '', isOptionsMenuOpen ? 'ins-post-card--menu-open' : ''].filter(Boolean).join(' ')}
      >
        <div className="x-card-layout">
          <div className="x-card-avatar-column">
            <AuthorAvatarLink authorId={authorId} canOpenProfile={canOpenProfile} profileTo={profileTo} profileState={profileState} userAvatarUrl={userAvatarUrl} userDisplayName={userDisplayName} hasRecentPost={hasRecentAuthorPost} isTuiPlus={authorTuiPlusActive} />
          </div>
          <div className="x-card-main">
            <div className="feed-card-author">
              <div className="feed-card-author-identity">
                <div className={['feed-card-author-name-line', isAnon ? 'feed-card-author-name-line--anonymous' : ''].filter(Boolean).join(' ')}>
                  <Link to={profileTo} state={profileState} onClick={handleProfileClick} aria-disabled={!canOpenProfile} data-no-card-click="true" className="pressable feed-card-author-name" title={userDisplayName}>{userDisplayName}</Link>
                  {isAnon ? <button type="button" onClick={handleAnonymousTryClick} className="feed-card-anonymous-try-button pressable" data-card-interactive="true" data-no-card-click="true" aria-label="我也试试匿名发布">我也试试</button> : null}
                  {authorInlineMetaLabel ? <span className="feed-card-author-meta-dot" aria-hidden="true">·</span> : null}
                  {authorInlineMetaLabel ? <span className="feed-card-author-time">{authorInlineMetaLabel}</span> : null}
                </div>
                {isSponsoredPost ? <span className="feed-card-author-sponsor">赞助内容</span> : null}
              </div>
              <div className="feed-card-author-actions" data-card-interactive="true" data-no-card-click="true">
                {canShowContact ? (
                  <TelegramContactIconButton onClick={handleContactClick} variant="compactText" className="feed-card-inline-contact" ariaLabel="联系发布人" title={contactUrl || '联系发布人'} />
                ) : null}
                {canOpenProfile ? <FollowButton userId={authorId} size="sm" className="feed-card-inline-follow" /> : null}
                <PostOptionsMenu postId={postId} authorId={authorId} authorName={userDisplayName} recommendationEnabled={enableRecommendationControls} onOpenStateChange={setIsOptionsMenuOpen} ownerOptions={ownerMenuOptions} />
              </div>
            </div>
            <div className={['x-card-body', hasMedia ? 'x-card-body--media' : 'x-card-body--text', shouldShowMore ? 'x-card-body--with-expand' : '', hasBodyContent ? '' : 'x-card-body--empty'].filter(Boolean).join(' ')} data-card-body-empty={hasBodyContent ? undefined : 'true'}>
              {displayText ? (
                <div style={contentStyle} className={isContentExpanded ? 'x-card-content-frame x-card-content-frame--expanded' : 'x-card-content-frame x-card-content-frame--collapsed'}>
                  <div ref={contentRef} className={isContentExpanded ? 'x-card-content x-card-content--expanded' : 'x-card-content x-card-content--collapsed'}>
                    <HashtagText text={displayText} className="x-card-content-text" />
                  </div>
                  {shouldShowMore ? <button type="button" onClick={handleToggleContentExpanded} aria-label={isContentExpanded ? '收起全文' : '展开全文'} aria-expanded={isContentExpanded} aria-busy={expandedContentStatus === 'loading' || undefined} className="x-card-expand-button"><ChevronDown className="x-card-expand-icon" aria-hidden="true" /></button> : null}
                </div>
              ) : null}
              <TagRow locationTags={visibleLocationTags} categoryChips={categoryChips} structuredMetaItems={structuredMetaItems} className="x-card-tags" onTagClick={handleTagClick} onStructuredMetaClick={handleStructuredMetaClick} />
              {post.quotedPost ? <QuotedPostPreviewCard post={post.quotedPost} className="x-card-quoted-post" /> : null}
            </div>
            {hasMedia ? <div className="x-card-media-block"><PostMediaGrid images={postImages} onOpen={handleOpenLightbox} priority={priorityMedia} stableAspectRatio /></div> : null}
            {postPromotionLink ? <PostPromotionLinkCard link={postPromotionLink} /> : null}
            <div className="x-card-footer">
              <PostActionBar
                hasLiked={hasLiked}
                likeCount={likeCount}
                commentCount={localCommentCount}
                shareCount={localShareCount}
                quoteCount={quoteCount}
                heatScore={resolvedPost.heatScore || 0}
                isPending={isPending || likeLock.isPending}
                isSharePending={shareLock.isPending}
                canShowTelegramSync={canShowTelegramSync}
                telegramSyncStatus={telegramSyncStatus}
                isTelegramSyncSubmitting={telegramSyncLock.isPending}
                canShowPromote={canShowPromoteAction}
                isLikeFeedbackActive={isLikeFeedbackActive}
                onToggleLike={handleToggleLike}
                onComment={handleComment}
                onShare={handleShare}
                onQuote={handleQuote}
                onTelegramSync={handleTelegramSync}
                onPromote={handlePromoteClick}
              />
            </div>
          </div>
        </div>
      </article>
      <PostCommentSheet open={isCommentSheetOpen} postId={postId} commentCount={localCommentCount} onCommentCountChange={handleCommentCountChange} onClose={handleCloseCommentSheet} />
      <PostQuoteSheet open={isQuoteSheetOpen} quoteCount={quoteCount} targetPost={resolvedPost} onClose={handleCloseQuoteSheet} />
      <TelegramSyncConfirmSheet open={isTelegramSyncConfirmOpen} channelUrl={telegramChannelUrl} isSubmitting={telegramSyncLock.isPending} isInsufficientBalance={telegramSyncPrice > 0 && currentPoints < telegramSyncPrice} telegramSyncPrice={telegramSyncPrice} onConfirm={handleConfirmTelegramSync} onClose={handleCloseTelegramSyncConfirm} />
      {lightboxIndex >= 0 && postImages.length > 0 ? <React.Suspense fallback={null}><ImageLightbox images={postImages} index={lightboxIndex} onClose={handleCloseLightbox} onChange={handleLightboxChange} /></React.Suspense> : null}
    </div>
  );
});

PostCard.displayName = 'PostCard';
export default PostCard;
