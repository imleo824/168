import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { APP_ROUTES } from '@/app/routePaths';
import { useAuth } from '@/context/AuthContext';
import { useConfig } from '@/hooks/useDataConfig';
import { useAsyncFlow } from '@/hooks/useAsyncFlow';
import SEO from '@/platform/SEO';
import ActionButton from '@/ui/ActionButton';
import AppPage from '@/ui/AppPage';
import PageContentShell from '@/ui/PageContentShell';
import PageHeader from '@/ui/PageHeader';
import { PageLoader } from '@/ui/PageLoader';
import { checkPostContactEligibility, createPost, getPost } from '@/services/api';
import {
  buildTuiPlusBenefitRouteState,
  isTuiPlusActive,
  type TuiPlusBenefitKey,
} from '@/features/tui-plus/tuiPlusBenefits';
import { formatTelegramContactDisplay, normalizeTelegramContactHandle } from '@/utils/contact';
import { focusPostCreateComposer } from '@/utils/postCreateFocusRestore';
import type { QuotePostPreview } from '@/types';

import {
  POST_CREATE_CATEGORY_META_INCOMPLETE_TOAST,
  POST_CONTENT_MAX_LENGTH,
  POST_CREATE_PAGE_TITLE,
  POST_CREATE_TITLE_MAX_LENGTH,
} from './postCreateConstants';
import {
  clearPostCreateDraft,
  loadPostCreateDraft,
  savePostCreateDraft,
} from './postCreateDraft';
import {
  POST_CREATE_LOCATION_PRESETS,
  buildLocationPresetValueSet,
  formatCreateLocationCity,
  normalizeCreateLocation,
  type PostCreateLocationOption,
} from './postCreateLocation';
import {
  findCategoryMetaSchema,
  getCategoryMetaFieldKey,
  getOrderedCategoryMetaFields,
  normalizePublishCategorySchema,
  validatePublishCategoryMetaPayload,
} from './postCreateCategoryMeta';
import {
  PostCreateAuthRequiredState,
  PostCreateComposerSection,
  PostCreatePublishingLock,
  type PostCreateFormState,
  type PostCreateToolSummary,
} from './postCreatePageSections';
const INITIAL_FORM: PostCreateFormState = {
  content: '',
  contact: '',
  location: '',
  categoryId: '',
  categoryMeta: {},
  isAnonymous: false,
  showContactButton: false,
  images: [],
  promotionLinkTitle: '',
  promotionLinkUrl: '',
};

const POST_CREATE_IMAGE_MAX_COUNT = 9;
const POST_CREATE_COMPOSER_FOCUS_MAX_ATTEMPTS = 18;
const POST_CREATE_COMPOSER_FOCUS_RETRY_MS = 45;
const POST_CREATE_QUOTE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LazyTuiPlusBenefitPromptDialog = lazy(() => import('@/features/tui-plus/TuiPlusBenefitPromptDialog'));
const loadPostCreatePickerSheets = () => import('./postCreatePickerSheets');
const loadPostCreateSettingsSheets = () => import('./postCreateSettingsSheets');
const LazyPostCreateCategoryMetaSheet = lazy(() =>
  loadPostCreatePickerSheets().then((module) => ({ default: module.PostCreateCategoryMetaSheet })),
);
const LazyPostCreateCategoryPickerSheet = lazy(() =>
  loadPostCreatePickerSheets().then((module) => ({ default: module.PostCreateCategoryPickerSheet })),
);
const LazyPostCreateCategorySelectSheet = lazy(() =>
  loadPostCreatePickerSheets().then((module) => ({ default: module.PostCreateCategorySelectSheet })),
);
const LazyPostCreateLocationPickerSheet = lazy(() =>
  loadPostCreatePickerSheets().then((module) => ({ default: module.PostCreateLocationPickerSheet })),
);
const LazyPostCreateContactEditorDialog = lazy(() =>
  loadPostCreateSettingsSheets().then((module) => ({ default: module.PostCreateContactEditorDialog })),
);
const LazyPostCreatePrivacySettingsSheet = lazy(() =>
  loadPostCreateSettingsSheets().then((module) => ({ default: module.PostCreatePrivacySettingsSheet })),
);
const LazyPostCreatePromoteChoiceSheet = lazy(() =>
  loadPostCreateSettingsSheets().then((module) => ({ default: module.PostCreatePromoteChoiceSheet })),
);
const LazyPostCreateTelegramSettingsSheet = lazy(() =>
  loadPostCreateSettingsSheets().then((module) => ({ default: module.PostCreateTelegramSettingsSheet })),
);

type PostCreateProps = {
  defaultAnonymous?: boolean;
  anonymousIntentKey?: string;
};

function normalizeQuotePostId(search: string) {
  const value = new URLSearchParams(search).get('quote')?.trim() || '';
  return POST_CREATE_QUOTE_ID_PATTERN.test(value) ? value : '';
}

function collapseContentForTitle(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function usePublishingNavigationGuard(isPublishingLocked: boolean, onBlocked: () => void) {
  useEffect(() => {
    if (!isPublishingLocked) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isPublishingLocked]);

  useEffect(() => {
    if (!isPublishingLocked) return undefined;
    const guardState = { ...(window.history.state || {}), postCreatePublishingGuard: true };
    window.history.pushState(guardState, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(guardState, '', window.location.href);
      onBlocked();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isPublishingLocked, onBlocked]);
}

function flattenLocationPresets(): PostCreateLocationOption[] {
  return POST_CREATE_LOCATION_PRESETS.flatMap((group) =>
    group.cities.map((city) => ({
      country: group.country,
      city,
      value: `${group.country} · ${city}`,
    })),
  );
}

function isProbablyNetworkError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof TypeError) return true;
  return false;
}

function createPostClientNonce() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

function focusPostCreateComposerElement(textarea: HTMLTextAreaElement | null) {
  if (!textarea || textarea.disabled) return false;
  return focusPostCreateComposer(textarea);
}

function getConfiguredPublishCategories(schemas: ReturnType<typeof normalizePublishCategorySchema>) {
  const seen = new Set<string>();
  return schemas
    .map((schema, index) => {
      const slug = String(schema.categorySlug || schema.slug || '').trim();
      if (!slug || seen.has(slug)) return null;
      seen.add(slug);
      const name = String(schema.name || schema.slug || slug).trim() || slug;
      return {
        id: slug,
        slug,
        name,
        order: index + 1,
        schemaVersion: schema.schemaVersion || 1,
      };
    })
    .filter(Boolean) as Array<{ id: string; slug: string; name: string; order: number; schemaVersion: number }>;
}

function isContactOptionalCategory(category: { slug?: string; name?: string } | null) {
  const ref = String(category?.slug || category?.name || '').trim().toLowerCase();
  return ref === 'exposure' || ref === '爆料' || ref === '曝光';
}

export default function PostCreate({
  defaultAnonymous = false,
  anonymousIntentKey = '',
}: PostCreateProps = {}) {
  const { user, loading, requireAuth, refreshUser, showToast } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: config } = useConfig(true, { alwaysFresh: true });
  const quotePostId = useMemo(() => normalizeQuotePostId(location.search), [location.search]);
  const isRobotUser = user?.userType === 'ROBOT';
  const isTuiPlusContactUnlimited = useMemo(() => isTuiPlusActive(user), [user]);

  const [form, setForm] = useState<PostCreateFormState>(INITIAL_FORM);
  const [quotedPost, setQuotedPost] = useState<QuotePostPreview | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteLoadFailed, setQuoteLoadFailed] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [isCategoryMetaOpen, setIsCategoryMetaOpen] = useState(false);
  const [categoryDraftId, setCategoryDraftId] = useState('');
  const [categoryMetaDraft, setCategoryMetaDraft] = useState<Record<string, string>>({});
  const [categoryMetaErrors, setCategoryMetaErrors] = useState<Record<string, string>>({});
  const [categoryMetaLocationField, setCategoryMetaLocationField] = useState<{ key: string; label: string } | null>(null);
  const [categoryMetaSelectField, setCategoryMetaSelectField] = useState<{ key: string; label: string; options: string[] } | null>(null);
  const [isPrivacySettingsOpen, setIsPrivacySettingsOpen] = useState(false);
  const [isTelegramSettingsOpen, setIsTelegramSettingsOpen] = useState(false);
  const [isLocationEditorOpen, setIsLocationEditorOpen] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [isCheckingContactEligibility, setIsCheckingContactEligibility] = useState(false);
  const [editContact, setEditContact] = useState('');
  const [isPromoteChoiceOpen, setIsPromoteChoiceOpen] = useState(false);
  const [publishedPostId, setPublishedPostId] = useState('');
  const [tuiPlusPromptBenefit, setTuiPlusPromptBenefit] = useState<TuiPlusBenefitKey | null>(null);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const defaultFormUserIdRef = useRef('');
  const defaultAnonymousIntentRef = useRef('');
  const submitNonceRef = useRef('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusedComposerLocationKeyRef = useRef('');
  const hasLoadedDraftRef = useRef(false);

  const patchForm = useCallback(<K extends keyof PostCreateFormState>(key: K, value: PostCreateFormState[K]) => {
    submitNonceRef.current = '';
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (!quotePostId) {
      setQuotedPost(null);
      setIsQuoteLoading(false);
      setQuoteLoadFailed(false);
      return undefined;
    }

    const controller = new AbortController();
    setIsQuoteLoading(true);
    setQuoteLoadFailed(false);
    setForm((prev) => prev.images.length > 0 ? { ...prev, images: [] } : prev);

    void getPost(quotePostId, { signal: controller.signal })
      .then((post) => { setQuotedPost(post as QuotePostPreview); })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setQuoteLoadFailed(true);
        setQuotedPost({ id: quotePostId, unavailable: true } as QuotePostPreview);
      })
      .finally(() => setIsQuoteLoading(false));

    return () => controller.abort();
  }, [quotePostId]);

  useEffect(() => {
    if (!user?.id) {
      defaultFormUserIdRef.current = '';
      defaultAnonymousIntentRef.current = '';
      submitNonceRef.current = '';
      hasLoadedDraftRef.current = false;
      setHasRestoredDraft(false);
      setForm(INITIAL_FORM);
      return;
    }

    if (defaultFormUserIdRef.current !== user.id) {
      defaultFormUserIdRef.current = user.id;
      defaultAnonymousIntentRef.current = '';
      submitNonceRef.current = '';

      const draft = !quotePostId ? loadPostCreateDraft(user.id) : null;
      if (draft) {
        hasLoadedDraftRef.current = true;
        setHasRestoredDraft(true);
        setForm({
          ...INITIAL_FORM,
          ...draft,
          contact: draft.contact || normalizeTelegramContactHandle(user.contact || '') || '',
          isAnonymous: typeof draft.isAnonymous === 'boolean' ? draft.isAnonymous : defaultAnonymous && user.userType !== 'ROBOT',
        });
      } else {
        hasLoadedDraftRef.current = true;
        setHasRestoredDraft(false);
        setForm({
          ...INITIAL_FORM,
          contact: normalizeTelegramContactHandle(user.contact || '') || '',
          isAnonymous: defaultAnonymous && user.userType !== 'ROBOT',
        });
      }
      return;
    }

    const nextContact = normalizeTelegramContactHandle(user.contact || '') || '';
    setForm((prev) => prev.contact === nextContact ? prev : { ...prev, contact: nextContact });
  }, [defaultAnonymous, quotePostId, user?.contact, user?.id, user?.userType]);

  // Auto-save draft on form change (debounced)
  useEffect(() => {
    if (!user?.id || !hasLoadedDraftRef.current || quotePostId || publishedPostId) return;
    const timer = setTimeout(() => {
      savePostCreateDraft(form, user.id);
    }, 400);
    return () => clearTimeout(timer);
  }, [form, publishedPostId, quotePostId, user?.id]);

  const handleClearDraft = useCallback(() => {
    clearPostCreateDraft();
    setHasRestoredDraft(false);
    setForm({
      ...INITIAL_FORM,
      contact: normalizeTelegramContactHandle(user?.contact || '') || '',
      isAnonymous: defaultAnonymous && user?.userType !== 'ROBOT',
    });
    showToast('已清除未保存的草稿', 'info');
  }, [defaultAnonymous, showToast, user?.contact, user?.userType]);

  useEffect(() => {
    if (!user?.id || !defaultAnonymous || isRobotUser) return;
    const intentKey = anonymousIntentKey || location.key;
    if (!intentKey) return;
    if (defaultAnonymousIntentRef.current === intentKey) return;
    defaultAnonymousIntentRef.current = intentKey;
    submitNonceRef.current = '';
    setForm((prev) => prev.isAnonymous ? prev : { ...prev, isAnonymous: true });
  }, [anonymousIntentKey, defaultAnonymous, isRobotUser, location.key, user?.id]);

  const publishCategorySchemas = useMemo(
    () => normalizePublishCategorySchema((config as any)?.publish_category_schema),
    [config],
  );
  const publishCategories = useMemo(
    () => getConfiguredPublishCategories(publishCategorySchemas),
    [publishCategorySchemas],
  );
  const selectedCategory = publishCategories.find((item) => item.id === form.categoryId) || null;
  const hasSelectedCategory = Boolean(selectedCategory);
  const isSelectedCategoryContactOptional = isContactOptionalCategory(selectedCategory);
  const shouldRecommendContact = hasSelectedCategory && !isSelectedCategoryContactOptional && !isRobotUser;
  const selectedCategoryLabel = selectedCategory?.name?.trim() || '';
  const selectedTopicLabel = selectedCategoryLabel;
  const locationOptions = useMemo<PostCreateLocationOption[]>(flattenLocationPresets, []);
  const locationPresetValueSet = useMemo(() => buildLocationPresetValueSet(POST_CREATE_LOCATION_PRESETS), []);
  const selectedCategoryMetaSchema = useMemo(
    () => findCategoryMetaSchema(form.categoryId, publishCategorySchemas, publishCategories),
    [form.categoryId, publishCategories, publishCategorySchemas],
  );
  const selectedCategoryFields = useMemo(
    () => getOrderedCategoryMetaFields(selectedCategoryMetaSchema?.fields || []),
    [selectedCategoryMetaSchema?.fields],
  );
  const categoryDraft = publishCategories.find((item) => item.id === categoryDraftId) || null;
  const categoryDraftLabel = categoryDraft?.name?.trim() || '';
  const categoryDraftMetaSchema = useMemo(
    () => findCategoryMetaSchema(categoryDraftId, publishCategorySchemas, publishCategories),
    [categoryDraftId, publishCategories, publishCategorySchemas],
  );
  const categoryDraftFields = useMemo(
    () => getOrderedCategoryMetaFields(categoryDraftMetaSchema?.fields || []),
    [categoryDraftMetaSchema?.fields],
  );
  const categoryMetaValidation = useMemo(
    () => validatePublishCategoryMetaPayload(selectedCategoryMetaSchema, form.categoryMeta, locationPresetValueSet),
    [form.categoryMeta, locationPresetValueSet, selectedCategoryMetaSchema],
  );
  const locationDisplayLabel = useMemo(() => formatCreateLocationCity(form.location), [form.location]);
  const customContact = normalizeTelegramContactHandle(form.contact || '');
  const contactDisplay = formatTelegramContactDisplay(customContact);
  const normalizedEditingContact = normalizeTelegramContactHandle(editContact);
  const hasTypedEditingContact = Boolean(editContact.trim());
  const hasInvalidEditingContact = hasTypedEditingContact && !normalizedEditingContact;
  const hasResolvedTextContent = form.content.trim().length > 0;
  const hasResolvedMediaContent = form.images.some((image) => image.trim().length > 0);
  const isQuoteMode = Boolean(quotePostId);
  const quoteIsReady = isQuoteMode && Boolean(quotedPost?.id) && !quotedPost.unavailable && !quoteLoadFailed && !isQuoteLoading;
  const hasResolvedContent = isQuoteMode ? hasResolvedTextContent : (hasResolvedTextContent || hasResolvedMediaContent);

  const toolSummary: PostCreateToolSummary = useMemo(() => ({
    image: {
      key: 'image',
      state: form.images.length > 0 ? 'on' : 'off',
      label: form.images.length > 0 ? `${form.images.length}` : '图片',
      isVisible: Boolean(form.images.length > 0),
    },
    category: {
      key: 'category',
      state: selectedTopicLabel ? 'on' : 'idle',
      label: selectedTopicLabel || '分类',
      isVisible: Boolean(selectedTopicLabel),
    },
    location: {
      key: 'location',
      state: locationDisplayLabel ? 'on' : 'idle',
      label: locationDisplayLabel || '位置',
      isVisible: Boolean(locationDisplayLabel),
    },
    link: {
      key: 'link',
      state: form.promotionLinkUrl ? 'on' : 'idle',
      label: '链接',
      isVisible: Boolean(form.promotionLinkUrl),
    },
    privacy: {
      key: 'privacy',
      state: form.isAnonymous ? 'on' : 'idle',
      label: form.isAnonymous ? '匿名' : '公开',
      isVisible: true,
    },
    telegram: {
      key: 'telegram',
      state: form.showContactButton ? 'on' : 'idle',
      label: form.showContactButton ? '显示' : '隐藏',
      isVisible: true,
    },
  }), [form.images.length, form.isAnonymous, form.promotionLinkUrl, form.showContactButton, locationDisplayLabel, selectedTopicLabel]);

  const {
    run: runSubmit,
    isBusy: isSubmitting,
  } = useAsyncFlow(
    async ({ isActive, signal }) => {
      if (!isActive()) return;

      if (isUploadingImages) {
        showToast('图片正在上传中，请稍候完成即可发布', 'error');
        return;
      }

      if (!hasResolvedContent) {
        showToast(isQuoteMode ? '请输入引用评述内容' : '请分享些文字或上传图片后再发布', 'error');
        return;
      }

      if (isQuoteMode && !quoteIsReady) {
        showToast('被引用的帖子已失效或被删除', 'error');
        return;
      }

      const metaValidation = validatePublishCategoryMetaPayload(
        selectedCategoryMetaSchema,
        form.categoryMeta,
        locationPresetValueSet,
      );
      if (metaValidation.errors.length > 0) {
        void loadPostCreatePickerSheets();
        setCategoryDraftId(form.categoryId);
        setCategoryMetaErrors(metaValidation.fieldErrors);
        setCategoryMetaDraft(form.categoryMeta);
        setIsCategoryMetaOpen(true);
        showToast(metaValidation.errors[0] || POST_CREATE_CATEGORY_META_INCOMPLETE_TOAST, 'error');
        return;
      }

      const clientNonce = submitNonceRef.current || createPostClientNonce();
      submitNonceRef.current = clientNonce;
      const cleanContent = collapseContentForTitle(form.content);
      const hasPromotionLink = Boolean(form.promotionLinkTitle?.trim() && form.promotionLinkUrl?.trim());
      const payload = {
        clientNonce,
        content: form.content,
        categoryId: form.categoryId || null,
        images: isQuoteMode ? [] : form.images,
        quotedPostId: isQuoteMode ? quotePostId : null,
        location: normalizeCreateLocation(form.location) || null,
        categoryMeta: metaValidation.normalized,
        promotionLink: hasPromotionLink ? {
          title: form.promotionLinkTitle?.trim(),
          url: form.promotionLinkUrl?.trim(),
        } : null,
        title: cleanContent.slice(0, POST_CREATE_TITLE_MAX_LENGTH),
        contact: isRobotUser ? '' : customContact,
        isAnonymous: isRobotUser ? false : form.isAnonymous,
        showContact: !isRobotUser && form.showContactButton && Boolean(customContact),
      };

      try {
        const parsed = await createPost(payload, {
          idempotencyKey: clientNonce,
          signal,
        });

        if (!parsed?.post || typeof parsed.post.id !== 'string') {
          showToast('发布成功，但返回数据异常，请刷新查看', 'error');
          return;
        }

        if (!isActive()) return;

        submitNonceRef.current = '';
        const createdPostId = parsed.post.id;
        clearPostCreateDraft();
        setHasRestoredDraft(false);
        setPublishedPostId(createdPostId);
        showToast('发布成功', 'success');
        void refreshUser(true).catch((error) => console.warn('[PostCreate] 刷新用户数据失败', error));
        void queryClient.invalidateQueries({ queryKey: ['posts'] });
        void queryClient.invalidateQueries({ queryKey: ['notifications', 'feed-counts'] });

        if (form.categoryId) {
          void loadPostCreateSettingsSheets();
          setIsPromoteChoiceOpen(true);
          return;
        }

        navigate(APP_ROUTES.home, { replace: true });
      } catch (error: any) {
        if (!isActive()) return;
        if (isProbablyNetworkError(error)) {
          showToast(error?.name === 'AbortError' ? '操作已取消' : '网络连接异常，请检查后重试', 'error');
          return;
        }
        if (error instanceof SyntaxError) {
          showToast('响应解析异常，请稍后重试', 'error');
          return;
        }
        console.error('[PostCreate] 发布失败', error);
        showToast(error?.message || '发布遇到问题，请重试', 'error');
      }
    },
    {
      cooldownMs: 160,
      minBusyMs: 120,
    },
  );

  const isPublishingLocked = isSubmitting;
  const notifyPublishingNavigationBlocked = useCallback(() => {
    showToast('内容正在提交中，请稍候...', 'info');
  }, [showToast]);
  usePublishingNavigationGuard(isPublishingLocked, notifyPublishingNavigationBlocked);
  const isSubmitBusy = isSubmitting || (isQuoteMode && isQuoteLoading);
  const submitLabel = isSubmitting ? '发表中' : isQuoteMode && isQuoteLoading ? '载入中' : '发表';
  const submitDisabled = isSubmitBusy || isUploadingImages || !hasResolvedContent || (isQuoteMode && !quoteIsReady);
  const warmPostCreatePickerSheets = useCallback(() => {
    void loadPostCreatePickerSheets();
  }, []);
  const warmPostCreateSettingsSheets = useCallback(() => {
    void loadPostCreateSettingsSheets();
  }, []);

  useEffect(() => {
    if (loading || !user?.id || isPublishingLocked) return undefined;
    if (focusedComposerLocationKeyRef.current === location.key) return undefined;

    let attempts = 0;
    let frame = 0;
    let timer = 0;

    const run = () => {
      attempts += 1;
      if (focusPostCreateComposerElement(textareaRef.current)) {
        focusedComposerLocationKeyRef.current = location.key;
        return;
      }
      if (attempts >= POST_CREATE_COMPOSER_FOCUS_MAX_ATTEMPTS) return;
      frame = window.requestAnimationFrame(() => {
        timer = window.setTimeout(run, POST_CREATE_COMPOSER_FOCUS_RETRY_MS);
      });
    };

    frame = window.requestAnimationFrame(run);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [isPublishingLocked, loading, location.key, user?.id]);

  const commitCategory = useCallback((nextCategoryId: string, nextCategoryMeta?: Record<string, string>) => {
    submitNonceRef.current = '';
    const nextSchema = findCategoryMetaSchema(nextCategoryId, publishCategorySchemas, publishCategories);
    const nextFields = getOrderedCategoryMetaFields(nextSchema?.fields || []);
    const nextFieldKeys = new Set(nextFields.map(getCategoryMetaFieldKey).filter(Boolean));

    setForm((prev) => {
      const sourceMeta = nextCategoryMeta ?? (nextCategoryId === prev.categoryId ? prev.categoryMeta : {});
      return {
        ...prev,
        categoryId: nextCategoryId,
        categoryMeta: Object.fromEntries(Object.entries(sourceMeta).filter(([key]) => nextFieldKeys.has(key))),
      };
    });
    setCategoryMetaErrors({});
    setCategoryDraftId(nextCategoryId);
  }, [publishCategories, publishCategorySchemas]);

  const handleOpenCategory = useCallback(() => {
    warmPostCreatePickerSheets();
    setCategoryDraftId(form.categoryId);
    setCategoryMetaDraft(form.categoryMeta);
    setCategoryMetaErrors({});
    setIsCategoryPickerOpen(true);
  }, [form.categoryId, form.categoryMeta, warmPostCreatePickerSheets]);

  const handleCloseCategoryPicker = useCallback(() => {
    setIsCategoryPickerOpen(false);
  }, []);

  const handleClearCategory = useCallback(() => {
    submitNonceRef.current = '';
    setForm((prev) => ({ ...prev, categoryId: '', categoryMeta: {} }));
    setCategoryDraftId('');
    setCategoryMetaDraft({});
    setCategoryMetaErrors({});
    setIsCategoryMetaOpen(false);
    setIsCategoryPickerOpen(false);
  }, []);

  const handleSelectCategory = useCallback((categoryId: string) => {
    setCategoryDraftId(categoryId);
    setCategoryMetaDraft(categoryId === form.categoryId ? form.categoryMeta : {});
    setCategoryMetaErrors({});
  }, [form.categoryId, form.categoryMeta]);

  const handleSaveCategory = useCallback(() => {
    if (!categoryDraftId) {
      showToast('请选择分类', 'error');
      return;
    }
    const nextSchema = findCategoryMetaSchema(categoryDraftId, publishCategorySchemas, publishCategories);
    const nextFields = getOrderedCategoryMetaFields(nextSchema?.fields || []);
    const nextMeta = categoryDraftId === form.categoryId ? form.categoryMeta : {};
    setCategoryMetaDraft(nextMeta);
    setCategoryMetaErrors({});

    if (nextFields.length > 0) {
      setIsCategoryPickerOpen(false);
      setIsCategoryMetaOpen(true);
      return;
    }

    commitCategory(categoryDraftId, {});
    setIsCategoryPickerOpen(false);
  }, [categoryDraftId, commitCategory, form.categoryId, form.categoryMeta, publishCategories, publishCategorySchemas, showToast]);

  const handleOpenCategoryMeta = useCallback(() => {
    if (!form.categoryId || selectedCategoryFields.length === 0) return;
    warmPostCreatePickerSheets();
    setCategoryDraftId(form.categoryId);
    setCategoryMetaDraft(form.categoryMeta);
    setCategoryMetaErrors(categoryMetaValidation.fieldErrors);
    setIsCategoryMetaOpen(true);
  }, [categoryMetaValidation.fieldErrors, form.categoryId, form.categoryMeta, selectedCategoryFields.length, warmPostCreatePickerSheets]);

  const handleCloseCategoryMeta = useCallback(() => {
    setCategoryMetaLocationField(null);
    setCategoryMetaSelectField(null);
    setIsCategoryMetaOpen(false);
  }, []);

  const handleSaveCategoryMeta = useCallback(() => {
    const result = validatePublishCategoryMetaPayload(categoryDraftMetaSchema, categoryMetaDraft, locationPresetValueSet);
    setCategoryMetaErrors(result.fieldErrors);
    if (result.errors.length > 0) {
      showToast(result.errors[0] || POST_CREATE_CATEGORY_META_INCOMPLETE_TOAST, 'error');
      return;
    }
    commitCategory(categoryDraftId, result.normalized);
    setCategoryMetaDraft(result.normalized);
    setIsCategoryMetaOpen(false);
  }, [categoryDraftId, categoryDraftMetaSchema, categoryMetaDraft, commitCategory, locationPresetValueSet, showToast]);

  const handleChangeCategoryMetaDraft = useCallback((key: string, value: string) => {
    setCategoryMetaDraft((prev) => ({ ...prev, [key]: value }));
    setCategoryMetaErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleSaveContact = useCallback(() => {
    if (hasInvalidEditingContact) return;
    patchForm('contact', normalizedEditingContact || '');
    if (normalizedEditingContact) patchForm('showContactButton', true);
    setIsEditingContact(false);
  }, [hasInvalidEditingContact, normalizedEditingContact, patchForm]);

  const handleOpenContactEditor = useCallback(async () => {
    warmPostCreateSettingsSheets();
    if (isCheckingContactEligibility) return;
    if (!isRobotUser && !isTuiPlusContactUnlimited) {
      setIsCheckingContactEligibility(true);
      try {
        const parsed = await checkPostContactEligibility();
        if (!parsed?.canShowContact) {
          setIsTelegramSettingsOpen(false);
          setTuiPlusPromptBenefit('postContact');
          return;
        }
      } catch (error: any) {
        showToast(error?.message || '联系方式权益检查失败，请稍后重试', 'error');
        return;
      } finally {
        setIsCheckingContactEligibility(false);
      }
    }

    setEditContact(customContact);
    setIsTelegramSettingsOpen(false);
    setIsEditingContact(true);
  }, [customContact, isCheckingContactEligibility, isRobotUser, isTuiPlusContactUnlimited, showToast, warmPostCreateSettingsSheets]);

  const handleToggleContactButton = useCallback(() => {
    if (form.showContactButton) {
      patchForm('showContactButton', false);
      return;
    }
    void handleOpenContactEditor();
  }, [form.showContactButton, handleOpenContactEditor, patchForm]);

  const handlePromotionLinkChange = useCallback((link: { title: string; url: string }) => {
    submitNonceRef.current = '';
    setForm((prev) => ({
      ...prev,
      promotionLinkTitle: link.title,
      promotionLinkUrl: link.url,
    }));
  }, []);

  const handleCloseTuiPlusPrompt = useCallback(() => {
    setTuiPlusPromptBenefit(null);
  }, []);

  const handleConfirmTuiPlusPrompt = useCallback(() => {
    const benefit = tuiPlusPromptBenefit || 'postContact';
    setTuiPlusPromptBenefit(null);
    navigate(APP_ROUTES.tuiPlus, { state: buildTuiPlusBenefitRouteState(benefit, APP_ROUTES.create) });
  }, [navigate, tuiPlusPromptBenefit]);

  const handleLogin = useCallback(() => {
    requireAuth(() => undefined);
  }, [requireAuth]);

  const handleSkipPromote = useCallback(() => {
    setIsPromoteChoiceOpen(false);
    navigate(APP_ROUTES.home, { replace: true });
  }, [navigate]);

  const handleGoPromote = useCallback(() => {
    setIsPromoteChoiceOpen(false);
    navigate(APP_ROUTES.promote, { state: { postId: publishedPostId } });
  }, [navigate, publishedPostId]);

  if (loading) {
    return <PageLoader text="正在准备发布" />;
  }

  if (!user) {
    return (
      <AppPage className="post-create-page" bottomSafe>
        <SEO title={POST_CREATE_PAGE_TITLE} noindex />
        <PageHeader title={POST_CREATE_PAGE_TITLE} />
        <PageContentShell bottomSafe className="post-create-page-main ui-app-page-main">
          <PostCreateAuthRequiredState onAction={handleLogin} />
        </PageContentShell>
      </AppPage>
    );
  }

  return (
    <AppPage className="post-create-page" bottomSafe>
      <SEO title={POST_CREATE_PAGE_TITLE} noindex />
      <PageHeader
        title={POST_CREATE_PAGE_TITLE}
        right={(
          <ActionButton
            type="button"
            variant="brand"
            size="header"
            onClick={() => void runSubmit()}
            disabled={submitDisabled}
            state={isSubmitting ? 'loading' : submitDisabled ? 'disabled' : 'idle'}
            aria-busy={isSubmitting || undefined}
            className={`post-create-header-submit-button ${!submitDisabled ? 'is-ready' : ''}`}
          >
            <span className="post-create-submit-label">{submitLabel}</span>
          </ActionButton>
        )}
      />
      <PageContentShell
        bottomSafe
        className="post-create-page-main ui-app-page-main"
        data-contact-recommended={shouldRecommendContact || undefined}
      >
        <PostCreateComposerSection
          form={form}
          textareaRef={(node) => { textareaRef.current = node; }}
          isPublishingLocked={isPublishingLocked}
          isQuoteMode={isQuoteMode}
          isQuoteLoading={isQuoteLoading}
          quotedPost={quotedPost}
          quotePostId={quotePostId}
          selectedCategoryLabel={selectedCategoryLabel}
          selectedTopicLabel={selectedTopicLabel}
          orderedCategoryFieldsCount={selectedCategoryFields.length}
          toolSummary={toolSummary}
          imageMaxCount={POST_CREATE_IMAGE_MAX_COUNT}
          onContentChange={(value) => patchForm('content', value.slice(0, POST_CONTENT_MAX_LENGTH))}
          onImagesChange={(urls) => patchForm('images', urls)}
          onUploadingImagesChange={setIsUploadingImages}
          onPromotionLinkChange={handlePromotionLinkChange}
          onOpenCategory={handleOpenCategory}
          onOpenCategoryMeta={handleOpenCategoryMeta}
          onOpenLocation={() => {
            warmPostCreatePickerSheets();
            setIsLocationEditorOpen(true);
          }}
          onOpenPrivacy={() => {
            warmPostCreateSettingsSheets();
            setIsPrivacySettingsOpen(true);
          }}
          onOpenTelegram={() => {
            warmPostCreateSettingsSheets();
            setIsTelegramSettingsOpen(true);
          }}
          onSubmitShortcut={() => void runSubmit()}
          hasRestoredDraft={hasRestoredDraft}
          onClearDraft={handleClearDraft}
        />
      </PageContentShell>

      {isCategoryPickerOpen ? (
        <Suspense fallback={null}>
          <LazyPostCreateCategoryPickerSheet
            open={isCategoryPickerOpen}
            categories={publishCategories}
            selectedCategoryId={categoryDraftId}
            onClose={handleCloseCategoryPicker}
            onClear={handleClearCategory}
            onSelect={handleSelectCategory}
            onSave={handleSaveCategory}
          />
        </Suspense>
      ) : null}

      {isCategoryMetaOpen ? (
        <Suspense fallback={null}>
          <LazyPostCreateCategoryMetaSheet
            open={isCategoryMetaOpen}
            categoryLabel={categoryDraftLabel}
            fields={categoryDraftFields}
            values={categoryMetaDraft}
            firstErrorKey={Object.keys(categoryMetaErrors)[0] || ''}
            onClose={handleCloseCategoryMeta}
            onChange={handleChangeCategoryMetaDraft}
            onOpenLocation={(key, label) => {
              warmPostCreatePickerSheets();
              setCategoryMetaLocationField({ key, label });
            }}
            onOpenSelect={(key, label, options) => {
              warmPostCreatePickerSheets();
              setCategoryMetaSelectField({ key, label, options });
            }}
            onSave={handleSaveCategoryMeta}
            saveDisabled={false}
          />
        </Suspense>
      ) : null}

      {categoryMetaLocationField ? (
        <Suspense fallback={null}>
          <LazyPostCreateLocationPickerSheet
            open={Boolean(categoryMetaLocationField)}
            title={`选择${categoryMetaLocationField.label}`}
            ariaLabel={`选择${categoryMetaLocationField.label}`}
            selectedValue={categoryMetaDraft[categoryMetaLocationField.key] || ''}
            options={locationOptions}
            onClose={() => setCategoryMetaLocationField(null)}
            onClear={() => {
              handleChangeCategoryMetaDraft(categoryMetaLocationField.key, '');
              setCategoryMetaLocationField(null);
            }}
            onSelect={(value) => {
              handleChangeCategoryMetaDraft(categoryMetaLocationField.key, value);
              setCategoryMetaLocationField(null);
            }}
          />
        </Suspense>
      ) : null}

      {categoryMetaSelectField ? (
        <Suspense fallback={null}>
          <LazyPostCreateCategorySelectSheet
            open={Boolean(categoryMetaSelectField)}
            title={`选择${categoryMetaSelectField.label}`}
            ariaLabel={`选择${categoryMetaSelectField.label}`}
            options={categoryMetaSelectField.options}
            selectedValue={categoryMetaDraft[categoryMetaSelectField.key] || ''}
            onClose={() => setCategoryMetaSelectField(null)}
            onSelect={(value) => {
              handleChangeCategoryMetaDraft(categoryMetaSelectField.key, value);
              setCategoryMetaSelectField(null);
            }}
          />
        </Suspense>
      ) : null}

      {isLocationEditorOpen ? (
        <Suspense fallback={null}>
          <LazyPostCreateLocationPickerSheet
            open={isLocationEditorOpen}
            title="选择地点"
            ariaLabel="选择地点"
            selectedValue={form.location}
            options={locationOptions}
            onClose={() => setIsLocationEditorOpen(false)}
            onClear={() => {
              patchForm('location', '');
              setIsLocationEditorOpen(false);
            }}
            onSelect={(value) => {
              patchForm('location', value);
              setIsLocationEditorOpen(false);
            }}
          />
        </Suspense>
      ) : null}

      {isPrivacySettingsOpen ? (
        <Suspense fallback={null}>
          <LazyPostCreatePrivacySettingsSheet
            open={isPrivacySettingsOpen}
            isPublicPublish={!form.isAnonymous}
            onClose={() => setIsPrivacySettingsOpen(false)}
            onTogglePublicPublish={() => patchForm('isAnonymous', !form.isAnonymous)}
          />
        </Suspense>
      ) : null}

      {isTelegramSettingsOpen ? (
        <Suspense fallback={null}>
          <LazyPostCreateTelegramSettingsSheet
            open={isTelegramSettingsOpen}
            isRobotUser={isRobotUser}
            showContactButton={form.showContactButton}
            customContact={customContact}
            contactDisplay={contactDisplay}
            isTuiPlusContactUnlimited={isTuiPlusContactUnlimited}
            onClose={() => setIsTelegramSettingsOpen(false)}
            onToggleContactButton={handleToggleContactButton}
            onOpenContactEditor={() => void handleOpenContactEditor()}
          />
        </Suspense>
      ) : null}

      {isEditingContact ? (
        <Suspense fallback={null}>
          <LazyPostCreateContactEditorDialog
            open={isEditingContact}
            editContact={editContact}
            hasInvalidEditingContact={hasInvalidEditingContact}
            isSavingContact={false}
            onEditContactChange={setEditContact}
            onClose={() => setIsEditingContact(false)}
            onSave={handleSaveContact}
          />
        </Suspense>
      ) : null}

      {isPromoteChoiceOpen ? (
        <Suspense fallback={null}>
          <LazyPostCreatePromoteChoiceSheet
            open={isPromoteChoiceOpen}
            onSkip={handleSkipPromote}
            onGoPromote={handleGoPromote}
          />
        </Suspense>
      ) : null}

      {tuiPlusPromptBenefit ? (
        <Suspense fallback={<PageLoader />}>
          <LazyTuiPlusBenefitPromptDialog
            open
            benefit={tuiPlusPromptBenefit}
            onClose={handleCloseTuiPlusPrompt}
            onConfirm={handleConfirmTuiPlusPrompt}
          />
        </Suspense>
      ) : null}

      {isPublishingLocked ? <PostCreatePublishingLock /> : null}
    </AppPage>
  );
}
