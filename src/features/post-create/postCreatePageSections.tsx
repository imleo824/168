import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Link as LinkIcon, LockKeyhole, MapPin, Send, ShieldCheck, Zap } from 'lucide-react';

import { APP_ROUTES } from '@/app/routePaths';
import { useAuth } from '@/context/AuthContext';
import QuotedPostPreviewCard from '@/features/post/QuotedPostPreviewCard';
import { buildTuiPlusBenefitRouteState, isTuiPlusActive } from '@/features/tui-plus/tuiPlusBenefits';
import ActionButton from '@/ui/ActionButton';
import AppPage from '@/ui/AppPage';
import PageContentShell from '@/ui/PageContentShell';
import PageHeader from '@/ui/PageHeader';
import { PageLoader } from '@/ui/PageLoader';
import { useInstantPress } from '@/hooks/useInstantPress';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import type { QuotePostPreview } from '@/types';
import {
  POST_PROMOTION_LINK_TITLE_MAX_LENGTH,
  cleanPostPromotionLinkTitle,
  normalizePostPromotionLinkUrl,
} from '../../../shared/postPublishing';

import { POST_CONTENT_MAX_LENGTH } from './postCreateConstants';
import type { PostCreateLocationOption } from './postCreateLocation';

const LazyTuiPlusBenefitPromptDialog = lazy(() => import('@/features/tui-plus/TuiPlusBenefitPromptDialog'));
const LazyImageUpload = lazy(() => import('@/features/upload/ImageUpload'));

export interface PostCreateFormState {
  content: string;
  contact: string;
  location: string;
  categoryId: string;
  categoryMeta: Record<string, string>;
  isAnonymous: boolean;
  showContactButton: boolean;
  images: string[];
  promotionLinkTitle?: string;
  promotionLinkUrl?: string;
}

export type PostCreateToolSummaryKey = 'category' | 'location' | 'privacy' | 'telegram' | 'link' | 'image';
export type PostCreateToolSummaryState = 'off' | 'on' | 'loading' | 'error' | 'idle';
export type PostCreateToolSummaryItem = { key: PostCreateToolSummaryKey; label: string; state: PostCreateToolSummaryState; isVisible: boolean };
export type PostCreateToolSummary = {
  image: PostCreateToolSummaryItem;
  category: PostCreateToolSummaryItem;
  location: PostCreateToolSummaryItem;
  privacy: PostCreateToolSummaryItem;
  telegram: PostCreateToolSummaryItem;
  link?: PostCreateToolSummaryItem;
};
export type CategoryDraftState = { categoryId: string; categoryMeta: Record<string, string> };
export type PostCreateRouteState = { from?: string; quotedPost?: QuotePostPreview | null };
export type { PostCreateLocationOption };

export function PostCreateComposerSection({
  form,
  textareaRef,
  isPublishingLocked,
  isQuoteMode,
  isQuoteLoading,
  quotedPost,
  quotePostId,
  selectedCategoryLabel,
  selectedTopicLabel,
  orderedCategoryFieldsCount,
  toolSummary,
  imageMaxCount,
  onContentChange,
  onImagesChange,
  onUploadingImagesChange,
  onPromotionLinkChange,
  onOpenCategory,
  onOpenCategoryMeta,
  onOpenLocation,
  onOpenPrivacy,
  onOpenTelegram,
  onOpenPromotionLink,
  onSubmitShortcut,
  hasRestoredDraft = false,
  onClearDraft,
}: {
  form: PostCreateFormState;
  textareaRef: (node: HTMLTextAreaElement | null) => void;
  isPublishingLocked: boolean;
  isQuoteMode: boolean;
  isQuoteLoading: boolean;
  quotedPost: QuotePostPreview | null;
  quotePostId: string;
  selectedCategoryLabel: string;
  selectedTopicLabel: string;
  orderedCategoryFieldsCount: number;
  toolSummary: PostCreateToolSummary;
  imageMaxCount: number;
  onContentChange: (value: string) => void;
  onImagesChange: (urls: string[]) => void;
  onUploadingImagesChange: (isUploading: boolean) => void;
  onPromotionLinkChange?: (link: { title: string; url: string }) => void;
  onOpenCategory: () => void;
  onOpenCategoryMeta: () => void;
  onOpenLocation: () => void;
  onOpenPrivacy: () => void;
  onOpenTelegram: () => void;
  onOpenPromotionLink?: () => void;
  onSubmitShortcut?: () => void;
  hasRestoredDraft?: boolean;
  onClearDraft?: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLinkEditorOpen, setIsLinkEditorOpen] = useState(false);
  const [isLinkPromptOpen, setIsLinkPromptOpen] = useState(false);
  const [draftLinkTitle, setDraftLinkTitle] = useState('');
  const [draftLinkUrl, setDraftLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const activePromotionTitle = form.promotionLinkTitle || '';
  const activePromotionUrl = form.promotionLinkUrl || '';
  const tuiPlusActive = isTuiPlusActive(user);
  const linkSummary = toolSummary.link || {
    key: 'link' as const,
    state: activePromotionUrl ? 'on' as const : 'idle' as const,
    label: '链接',
    isVisible: Boolean(activePromotionUrl),
  };
  const categoryActionLabel = selectedTopicLabel
    ? orderedCategoryFieldsCount > 0
      ? `编辑${selectedCategoryLabel}信息`
      : `分类：${selectedCategoryLabel}`
    : '选择分类';
  const categoryPressHandlers = useInstantPress<HTMLButtonElement>(onOpenCategory, isPublishingLocked);
  const locationPressHandlers = useInstantPress<HTMLButtonElement>(onOpenLocation, isPublishingLocked);
  const privacyPressHandlers = useInstantPress<HTMLButtonElement>(onOpenPrivacy, isPublishingLocked);
  const telegramPressHandlers = useInstantPress<HTMLButtonElement>(onOpenTelegram, isPublishingLocked);
  const openPromotionLinkEditorCard = useCallback(() => {
    setDraftLinkTitle(activePromotionTitle || '');
    setDraftLinkUrl(activePromotionUrl || '');
    setLinkError('');
    setIsLinkEditorOpen(true);
  }, [activePromotionTitle, activePromotionUrl]);
  const openPromotionLinkPanel = useCallback(() => {
    if (onOpenPromotionLink) {
      onOpenPromotionLink();
      return;
    }
    if (!tuiPlusActive) {
      setIsLinkPromptOpen(true);
      return;
    }
    openPromotionLinkEditorCard();
  }, [onOpenPromotionLink, openPromotionLinkEditorCard, tuiPlusActive]);
  const linkPressHandlers = useInstantPress<HTMLButtonElement>(openPromotionLinkPanel, isPublishingLocked);
  const normalizedDraftLinkUrl = useMemo(() => normalizePostPromotionLinkUrl(draftLinkUrl), [draftLinkUrl]);
  const savePromotionLink = useCallback(() => {
    const safeTitle = cleanPostPromotionLinkTitle(draftLinkTitle);
    if (!safeTitle) {
      setLinkError('请输入链接标题（最多40字）');
      return;
    }
    if (!normalizedDraftLinkUrl) {
      setLinkError('请输入有效的网址链接（以 http:// 或 https:// 开头）');
      return;
    }
    onPromotionLinkChange?.({ title: safeTitle, url: normalizedDraftLinkUrl });
    setIsLinkEditorOpen(false);
  }, [draftLinkTitle, normalizedDraftLinkUrl, onPromotionLinkChange]);
  const { guarded: guardedSavePromotionLink, isPending: savePromotionLinkPending } = useInteractionGuard(savePromotionLink, {
    policy: 'optimistic',
    cooldownMs: 420,
    minPendingMs: 120,
    mode: 'drop',
  });
  const promotionLinkSaveDisabled = isPublishingLocked || savePromotionLinkPending || !draftLinkTitle.trim() || !draftLinkUrl.trim();

  return (
    <>
      <div className="post-create-shell post-create-shell-card ui-page-card-shell">
        <div className="post-create-composer">
          <section className="post-create-input-section post-create-input-section-pad">
            {hasRestoredDraft ? (
              <div className="post-create-draft-banner" role="status">
                <span className="post-create-draft-banner-text">已自动恢复上次未发布的草稿</span>
                {onClearDraft ? (
                  <button
                    type="button"
                    className="post-create-draft-clear-button"
                    onClick={onClearDraft}
                  >
                    放弃草稿
                  </button>
                ) : null}
              </div>
            ) : null}

            <textarea
              ref={textareaRef}
              autoFocus
              rows={4}
              placeholder="分享新鲜事、交流心得或发布需求…"
              maxLength={POST_CONTENT_MAX_LENGTH}
              className="post-create-textarea"
              value={form.content}
              disabled={isPublishingLocked}
              aria-busy={isPublishingLocked}
              onChange={(event) => onContentChange(event.target.value.slice(0, POST_CONTENT_MAX_LENGTH))}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  onSubmitShortcut?.();
                }
              }}
            />

            <Suspense fallback={<PostCreateImageUploadFallback />}>
              <LazyImageUpload
                onImagesChange={onImagesChange}
                onUploadingChange={onUploadingImagesChange}
                maxCount={imageMaxCount}
                defaultImages={isQuoteMode ? [] : form.images}
                layout="field"
                tileClassName="post-create-image-preview-tile"
                disabled={isQuoteMode || isPublishingLocked}
                disabledReason={isQuoteMode ? '引用发布暂不添加图片' : '发布中暂不可添加图片'}
              />
            </Suspense>

            <div className="post-create-tool-row" aria-label="发布工具">
              <button type="button" className="post-create-tool-button post-create-category-tool-button" data-tool="category" data-state={toolSummary.category.state} aria-label={categoryActionLabel} title={categoryActionLabel} disabled={isPublishingLocked} {...categoryPressHandlers}>
                <Hash className="post-create-tool-icon" aria-hidden="true" />
                {toolSummary.category.isVisible ? <span className="post-create-tool-summary">{toolSummary.category.label}</span> : null}
              </button>
              <button type="button" className="post-create-tool-button" data-tool="location" data-state={toolSummary.location.state} aria-label={toolSummary.location.isVisible ? `地点：${toolSummary.location.label}` : '添加地点'} title={toolSummary.location.isVisible ? `地点：${toolSummary.location.label}` : '添加地点'} disabled={isPublishingLocked} {...locationPressHandlers}>
                <MapPin className="post-create-tool-icon" aria-hidden="true" />
                {toolSummary.location.isVisible ? <span className="post-create-tool-summary">{toolSummary.location.label}</span> : null}
              </button>
              <button type="button" className="post-create-tool-button" data-tool="link" data-state={linkSummary.state} aria-label={linkSummary.isVisible ? '推广链接：已添加' : '添加推广链接'} title={linkSummary.isVisible ? '推广链接：已添加' : '添加推广链接'} disabled={isPublishingLocked} {...linkPressHandlers}>
                <LinkIcon className="post-create-tool-icon" aria-hidden="true" />
                {linkSummary.isVisible ? <span className="post-create-tool-summary">链接</span> : null}
              </button>
              <button type="button" className="post-create-tool-button" data-tool="privacy" data-state={toolSummary.privacy.state} aria-label={toolSummary.privacy.label} title={toolSummary.privacy.label} disabled={isPublishingLocked} {...privacyPressHandlers}>
                <LockKeyhole className="post-create-tool-icon" aria-hidden="true" />
                {toolSummary.privacy.isVisible ? <span className="post-create-tool-summary">{toolSummary.privacy.label}</span> : null}
              </button>
              <button type="button" className="post-create-tool-button" data-tool="telegram" data-state={toolSummary.telegram.state} aria-label={`联系方式：${toolSummary.telegram.label}`} title={`联系方式：${toolSummary.telegram.label}`} disabled={isPublishingLocked} {...telegramPressHandlers}>
                <Send className="post-create-tool-icon" aria-hidden="true" />
                {toolSummary.telegram.isVisible ? <span className="post-create-tool-summary">{toolSummary.telegram.label}</span> : null}
              </button>
            </div>

            {form.content.length > 0 ? (
              <div className="post-create-footer-meta">
                <span
                  className={`post-create-char-counter ${
                    form.content.length >= POST_CONTENT_MAX_LENGTH
                      ? 'is-limit'
                      : form.content.length >= POST_CONTENT_MAX_LENGTH * 0.9
                      ? 'is-warning'
                      : ''
                  }`}
                  aria-live="polite"
                >
                  {form.content.length}/{POST_CONTENT_MAX_LENGTH}
                </span>
              </div>
            ) : null}

            {isQuoteMode ? (
              <div className="post-create-quoted-post-wrap" aria-live="polite">
                {isQuoteLoading && !quotedPost ? (
                  <div className="post-create-quote-loading">正在加载被引用的帖子...</div>
                ) : (
                  <QuotedPostPreviewCard post={quotedPost || { id: quotePostId, unavailable: true, isPublished: false }} className="post-create-quoted-post" />
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {isLinkEditorOpen ? (
        <AppPage className="post-create-page post-create-contact-editor-page post-create-link-editor-page" bottomSafe>
          <PageHeader title="添加推广链接" showBack onBack={() => setIsLinkEditorOpen(false)} right={<ActionButton type="button" variant="brand" size="header" disabled={promotionLinkSaveDisabled} state={savePromotionLinkPending ? 'loading' : 'idle'} onClick={() => void guardedSavePromotionLink()}>{savePromotionLinkPending ? '保存中' : '保存'}</ActionButton>} />
          <PageContentShell bottomSafe className="post-create-contact-editor-main ui-app-page-main">
            <section data-post-create-stable-focus="true" className="post-create-stable-focus post-create-contact-editor-card post-create-link-editor-card">
              <label className="post-create-contact-editor-field">
                <span className="post-create-contact-editor-label">链接标题</span>
                <span className="post-create-contact-input-wrap">
                  <input autoFocus value={draftLinkTitle} onChange={(event) => { setDraftLinkTitle(event.target.value); setLinkError(''); }} placeholder="例如：查看详情 / 立即访问" maxLength={POST_PROMOTION_LINK_TITLE_MAX_LENGTH} className="post-create-contact-input" autoComplete="off" />
                </span>
              </label>
              <label className="post-create-contact-editor-field">
                <span className="post-create-contact-editor-label">目标网址</span>
                <span className="post-create-contact-input-wrap">
                  <input value={draftLinkUrl} onChange={(event) => { setDraftLinkUrl(event.target.value); setLinkError(''); }} placeholder="https://example.com" className="post-create-contact-input" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                </span>
              </label>
              {linkError ? <p className="post-create-option-error">{linkError}</p> : null}
            </section>
          </PageContentShell>
        </AppPage>
      ) : null}

      {isLinkPromptOpen ? (
        <Suspense fallback={<PageLoader />}>
          <LazyTuiPlusBenefitPromptDialog open benefit="postPromotionLink" onClose={() => setIsLinkPromptOpen(false)} onConfirm={() => navigate(APP_ROUTES.tuiPlus, { state: buildTuiPlusBenefitRouteState('postPromotionLink', APP_ROUTES.create) })} />
        </Suspense>
      ) : null}
    </>
  );
}

function PostCreateImageUploadFallback() {
  return (
    <div className="image-upload image-upload--field post-create-image-upload-fallback" aria-hidden="true">
      <div className="image-upload-grid">
        <div className="image-upload-add post-create-image-preview-tile post-create-image-upload-placeholder">
          <span className="ui-skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

export function PostCreatePublishingLock() {
  return (
    <div className="post-create-publishing-lock" role="status" aria-live="polite" aria-label="正在发布，请稍候...">
      <div className="post-create-publishing-lock-panel">
        <span className="post-create-publishing-lock-spinner" aria-hidden="true" />
        <span className="post-create-publishing-lock-text">正在发布，请稍候...</span>
      </div>
    </div>
  );
}
