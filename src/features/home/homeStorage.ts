import type { Category } from '@/types';
import { isDocumentFeedScrollMode, scrollFeedToTop } from '@/utils/feedScroll';
import type { MainTabId } from './homeTypes';

const HOME_SELECTED_CATEGORY_IDS_KEY_PREFIX = 'home-selected-category-ids';
const HOME_CATEGORY_COUNTRY_FILTER_KEY_PREFIX = 'home-category-country-filters';
export const HOME_SELECTED_CATEGORIES_CHANGED_EVENT = 'home-selected-categories-changed';

export function formatCategoryLabel(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return '#';
  return trimmed;
}

export function isCountryFilterableCategoryName(label: string) {
  const normalized = String(label || '')
    .replace(/[\s\u3000#＃_-]+/g, '')
    .trim()
    .toLowerCase();

  if (!normalized) return false;

  return /租房|房屋|房产|买房|二手|招聘|求职|工作|岗位|兼职/.test(normalized);
}

export function getHomeCategoryStorageKey(userId?: string | null) {
  return `${HOME_SELECTED_CATEGORY_IDS_KEY_PREFIX}:${userId || 'guest'}`;
}

export function getHomeCategoryLabelStorageKey(userId?: string | null) {
  return `${HOME_SELECTED_CATEGORY_IDS_KEY_PREFIX}:labels:${userId || 'guest'}`;
}

export function getHomeCategoryCountryFilterStorageKey(userId?: string | null) {
  return `${HOME_CATEGORY_COUNTRY_FILTER_KEY_PREFIX}:${userId || 'guest'}`;
}

export function readHomeSelectedCategoryIds(storageKey: string) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function writeHomeSelectedCategoryIds(storageKey: string, categoryIds: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(categoryIds));
    window.dispatchEvent(
      new CustomEvent(HOME_SELECTED_CATEGORIES_CHANGED_EVENT, {
        detail: { storageKey, categoryIds },
      }),
    );
  } catch {
    // Ignore blocked storage; the category strip still works for the current session.
  }
}

export function readStoredCategoryLabels(storageKey: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] =>
          typeof entry[0] === 'string' &&
          typeof entry[1] === 'string' &&
          entry[0].length > 0 &&
          entry[1].length > 0,
        ),
    );
  } catch {
    return {};
  }
}

export function writeStoredCategoryLabels(storageKey: string, labels: Record<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(labels));
  } catch {
    // Ignore blocked storage; fetched category names still render for this session.
  }
}

function normalizeStoredCountryKeys(value: unknown) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || '').split(/[,，\s]+/);
  const seen = new Set<string>();

  return rawItems
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((key) => key.length > 0 && key.length <= 40 && key !== 'all')
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function readHomeCategoryCountryFilters(storageKey: string): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const result: Record<string, string[]> = {};
    for (const [categoryId, countryKeys] of Object.entries(parsed)) {
      const normalizedCategoryId = String(categoryId || '').trim();
      const normalizedKeys = normalizeStoredCountryKeys(countryKeys);
      if (normalizedCategoryId && normalizedKeys.length > 0) {
        result[normalizedCategoryId] = normalizedKeys;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function writeHomeCategoryCountryFilters(storageKey: string, filters: Record<string, string[]>) {
  if (typeof window === 'undefined') return;
  try {
    const normalized: Record<string, string[]> = {};
    for (const [categoryId, countryKeys] of Object.entries(filters)) {
      const normalizedCategoryId = String(categoryId || '').trim();
      const normalizedKeys = normalizeStoredCountryKeys(countryKeys);
      if (normalizedCategoryId && normalizedKeys.length > 0) {
        normalized[normalizedCategoryId] = normalizedKeys;
      }
    }
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  } catch {
    // Ignore blocked storage; country filtering still works for the current session.
  }
}

export function normalizeHomeSelectedCategoryIds(
  categoryIds: string[],
  categories: Category[],
  storedLabels: Record<string, string> = {},
) {
  const allowedIds = categories.length
    ? new Set(categories.map((category) => category.id).filter(Boolean))
    : null;
  const seen = new Set<string>();

  return categoryIds.filter((categoryId) => {
    if (!categoryId || seen.has(categoryId)) return false;
    if (allowedIds && !allowedIds.has(categoryId) && !storedLabels[categoryId]) return false;
    seen.add(categoryId);
    return true;
  });
}

export function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function areStringRecordsEqual(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

export function normalizeMainTab(categoryId: string): MainTabId {
  if (categoryId === 'following') return 'following';
  return 'discover';
}

let homeFeedScrollRoot: HTMLElement | null = null;

export function registerHomeFeedScrollRoot(node: HTMLElement | null) {
  homeFeedScrollRoot = node;
}

export function scrollHomeFeedToTop(behavior: ScrollBehavior = 'auto') {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    scrollFeedToTop(homeFeedScrollRoot, behavior, isDocumentFeedScrollMode());
  });
}
