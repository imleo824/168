import type { PostCreateFormState } from './postCreatePageSections';
import { POST_CREATE_DRAFT_STORAGE_KEY, POST_CREATE_DRAFT_TTL_MS } from './postCreateConstants';

interface StoredPostDraft {
  userId?: string;
  form: Partial<PostCreateFormState>;
  updatedAt: number;
}

export function hasValidDraftContent(form: Partial<PostCreateFormState>): boolean {
  if (form.content && form.content.trim().length > 0) return true;
  if (Array.isArray(form.images) && form.images.length > 0) return true;
  if (form.categoryId && form.categoryId.trim().length > 0) return true;
  if (form.location && form.location.trim().length > 0) return true;
  if (form.promotionLinkUrl && form.promotionLinkUrl.trim().length > 0) return true;
  return false;
}

export function loadPostCreateDraft(userId?: string): Partial<PostCreateFormState> | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(POST_CREATE_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredPostDraft = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.updatedAt && Date.now() - parsed.updatedAt > POST_CREATE_DRAFT_TTL_MS) {
      clearPostCreateDraft();
      return null;
    }
    if (userId && parsed.userId && parsed.userId !== userId) {
      return null;
    }
    if (hasValidDraftContent(parsed.form || {})) {
      return parsed.form;
    }
  } catch (error) {
    console.warn('[PostCreateDraft] Failed to load draft', error);
  }
  return null;
}

export function savePostCreateDraft(form: PostCreateFormState, userId?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (!hasValidDraftContent(form)) {
      clearPostCreateDraft();
      return;
    }
    const data: StoredPostDraft = {
      userId,
      form: {
        content: form.content,
        categoryId: form.categoryId,
        categoryMeta: form.categoryMeta,
        location: form.location,
        isAnonymous: form.isAnonymous,
        showContactButton: form.showContactButton,
        contact: form.contact,
        images: form.images,
        promotionLinkTitle: form.promotionLinkTitle,
        promotionLinkUrl: form.promotionLinkUrl,
      },
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(POST_CREATE_DRAFT_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('[PostCreateDraft] Failed to save draft', error);
  }
}

export function clearPostCreateDraft(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(POST_CREATE_DRAFT_STORAGE_KEY);
  } catch (error) {
    console.warn('[PostCreateDraft] Failed to clear draft', error);
  }
}
