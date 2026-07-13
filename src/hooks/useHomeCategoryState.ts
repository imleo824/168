/**
 * useHomeCategoryState - 统一管理首页分类相关的所有状态和同步逻辑
 * 减少 Home.tsx 中的复杂度
 */
import { useEffect, useMemo, useCallback, useState } from 'react';
import type { Category } from '@/types';
import {
  HOME_SELECTED_CATEGORIES_CHANGED_EVENT,
  areStringArraysEqual,
  areStringRecordsEqual,
  getHomeCategoryCountryFilterStorageKey,
  getHomeCategoryLabelStorageKey,
  getHomeCategoryStorageKey,
  normalizeHomeSelectedCategoryIds,
  readHomeCategoryCountryFilters,
  readHomeSelectedCategoryIds,
  readStoredCategoryLabels,
  writeHomeCategoryCountryFilters,
  writeHomeSelectedCategoryIds,
  writeStoredCategoryLabels,
} from '@/features/home/homeStorage';

interface UseHomeCategoryStateOptions {
  categories: Category[];
  userId?: string;
}

interface UseHomeCategoryStateResult {
  // 分类选择状态
  selectedHomeCategoryIds: string[];
  selectedHomeCategories: Category[];
  selectedHomeCategoryIdSet: Set<string>;

  // 国家偏好状态
  categoryCountryFilters: Record<string, string[]>;
  setHomeCategoryCountryFilter: (categoryId: string, countryKeys: string[]) => void;

  // 操作方法
  toggleHomeCategory: (categoryId: string) => void;

  // 管理器状态
  isCategoryManagerOpen: boolean;
  setIsCategoryManagerOpen: (open: boolean) => void;
}

function normalizeCountryKeys(countryKeys: string[]) {
  const seen = new Set<string>();
  return countryKeys
    .map((key) => String(key || '').trim().toLowerCase())
    .filter((key) => key.length > 0 && key.length <= 40 && key !== 'all')
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function useHomeCategoryState({
  categories,
  userId,
}: UseHomeCategoryStateOptions): UseHomeCategoryStateResult {
  // 存储 key（依赖用户 ID）
  const categoryPreferenceKey = useMemo(
    () => getHomeCategoryStorageKey(userId),
    [userId]
  );
  const categoryLabelPreferenceKey = useMemo(
    () => getHomeCategoryLabelStorageKey(userId),
    [userId]
  );
  const categoryCountryFilterPreferenceKey = useMemo(
    () => getHomeCategoryCountryFilterStorageKey(userId),
    [userId]
  );

  // 本地状态
  const [rawSelectedCategoryIds, setRawSelectedCategoryIds] = useState<string[]>(
    () => readHomeSelectedCategoryIds(categoryPreferenceKey)
  );
  const [selectedCategoryLabels, setSelectedCategoryLabels] = useState<
    Record<string, string>
  >(() => readStoredCategoryLabels(categoryLabelPreferenceKey));
  const [categoryCountryFilters, setCategoryCountryFilters] = useState<Record<string, string[]>>(
    () => readHomeCategoryCountryFilters(categoryCountryFilterPreferenceKey)
  );

  // 管理器状态
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  // 用户变更时同步存储 key
  useEffect(() => {
    setRawSelectedCategoryIds(
      readHomeSelectedCategoryIds(categoryPreferenceKey)
    );
    setSelectedCategoryLabels(
      readStoredCategoryLabels(categoryLabelPreferenceKey)
    );
    setCategoryCountryFilters(
      readHomeCategoryCountryFilters(categoryCountryFilterPreferenceKey)
    );
    setIsCategoryManagerOpen(false);
  }, [categoryCountryFilterPreferenceKey, categoryLabelPreferenceKey, categoryPreferenceKey]);

  // 归一化选择的分类
  const normalizedSelectedCategoryIds = useMemo(
    () => normalizeHomeSelectedCategoryIds(rawSelectedCategoryIds, categories, selectedCategoryLabels),
    [categories, rawSelectedCategoryIds, selectedCategoryLabels]
  );

  const selectedHomeCategoryIdSet = useMemo(
    () => new Set(normalizedSelectedCategoryIds),
    [normalizedSelectedCategoryIds]
  );

  // 构建选择的分类对象数组
  const selectedHomeCategories = useMemo<Category[]>(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return normalizedSelectedCategoryIds
      .map(
        (id) =>
          byId.get(id) ??
          (selectedCategoryLabels[id]
            ? { id, name: selectedCategoryLabels[id], slug: '', order: 0 }
            : null)
      )
      .filter((c): c is Category => Boolean(c));
  }, [categories, normalizedSelectedCategoryIds, selectedCategoryLabels]);

  // 保存选择的分类
  const saveSelectedCategoryIds = useCallback(
    (nextIds: string[]) => {
      const normalized = normalizeHomeSelectedCategoryIds(nextIds, categories, selectedCategoryLabels);
      setRawSelectedCategoryIds(normalized);
      writeHomeSelectedCategoryIds(categoryPreferenceKey, normalized);
    },
    [categories, categoryPreferenceKey, selectedCategoryLabels]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncSelectedCategories = (event: Event) => {
      const detail = (event as CustomEvent<{ storageKey?: string }>).detail;
      if (detail?.storageKey && detail.storageKey !== categoryPreferenceKey) return;
      setRawSelectedCategoryIds(readHomeSelectedCategoryIds(categoryPreferenceKey));
      setSelectedCategoryLabels(readStoredCategoryLabels(categoryLabelPreferenceKey));
    };

    window.addEventListener(HOME_SELECTED_CATEGORIES_CHANGED_EVENT, syncSelectedCategories);
    return () => {
      window.removeEventListener(HOME_SELECTED_CATEGORIES_CHANGED_EVENT, syncSelectedCategories);
    };
  }, [categoryLabelPreferenceKey, categoryPreferenceKey]);

  const setHomeCategoryCountryFilter = useCallback(
    (categoryId: string, countryKeys: string[]) => {
      const normalizedCategoryId = String(categoryId || '').trim();
      if (!normalizedCategoryId) return;

      const normalizedCountryKeys = normalizeCountryKeys(countryKeys);
      setCategoryCountryFilters((current) => {
        const next = { ...current };
        if (normalizedCountryKeys.length > 0) {
          next[normalizedCategoryId] = normalizedCountryKeys;
        } else {
          delete next[normalizedCategoryId];
        }
        writeHomeCategoryCountryFilters(categoryCountryFilterPreferenceKey, next);
        return next;
      });
    },
    [categoryCountryFilterPreferenceKey]
  );

  // 分类选择同步
  useEffect(() => {
    if (!categories.length) return;
    if (
      areStringArraysEqual(
        rawSelectedCategoryIds,
        normalizedSelectedCategoryIds
      )
    )
      return;
    saveSelectedCategoryIds(normalizedSelectedCategoryIds);
  }, [
    categories.length,
    normalizedSelectedCategoryIds,
    rawSelectedCategoryIds,
    saveSelectedCategoryIds,
  ]);

  // 保持标签与分类名称同步
  useEffect(() => {
    if (!categories.length) return;
    const byId = new Map(categories.map((c) => [c.id, c]));
    const nextLabels: Record<string, string> = {};
    for (const id of normalizedSelectedCategoryIds) {
      const name = byId.get(id)?.name ?? selectedCategoryLabels[id] ?? '';
      if (name) nextLabels[id] = name;
    }
    if (!areStringRecordsEqual(selectedCategoryLabels, nextLabels)) {
      setSelectedCategoryLabels(nextLabels);
      writeStoredCategoryLabels(categoryLabelPreferenceKey, nextLabels);
    }
  }, [
    categories,
    categoryLabelPreferenceKey,
    normalizedSelectedCategoryIds,
    selectedCategoryLabels,
  ]);

  // 切换分类
  const toggleHomeCategory = useCallback(
    (categoryId: string) => {
      if (!categoryId) return;
      const next = selectedHomeCategoryIdSet.has(categoryId)
        ? normalizedSelectedCategoryIds.filter((id) => id !== categoryId)
        : [...normalizedSelectedCategoryIds, categoryId];
      saveSelectedCategoryIds(next);
    },
    [
      normalizedSelectedCategoryIds,
      saveSelectedCategoryIds,
      selectedHomeCategoryIdSet,
    ]
  );

  return {
    selectedHomeCategoryIds: normalizedSelectedCategoryIds,
    selectedHomeCategories,
    selectedHomeCategoryIdSet,
    categoryCountryFilters,
    setHomeCategoryCountryFilter,
    toggleHomeCategory,
    isCategoryManagerOpen,
    setIsCategoryManagerOpen,
  };
}
