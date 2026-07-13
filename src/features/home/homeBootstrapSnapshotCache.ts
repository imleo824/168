import { safeLocalStorage } from '@/utils/storage';
import type { HomeBootstrap } from '@/types';

const HOME_BOOTSTRAP_SNAPSHOT_KEY = 'tuitui:home-bootstrap-snapshot:v3';
const HOME_BOOTSTRAP_SNAPSHOT_TTL_MS = 1000 * 60 * 60 * 12;
const HOME_BOOTSTRAP_SNAPSHOT_VERSION = 'v3';

type HomeBootstrapSnapshot = {
  version: typeof HOME_BOOTSTRAP_SNAPSHOT_VERSION;
  updatedAt: number;
  data: HomeBootstrap;
};

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isValidSnapshot(snapshot: HomeBootstrapSnapshot | null) {
  if (!snapshot || snapshot.version !== HOME_BOOTSTRAP_SNAPSHOT_VERSION) return false;
  if (!snapshot.updatedAt || Date.now() - snapshot.updatedAt > HOME_BOOTSTRAP_SNAPSHOT_TTL_MS) return false;
  if (!snapshot.data || !Array.isArray(snapshot.data.categories)) return false;
  return true;
}

export function readHomeBootstrapSnapshot() {
  const snapshot = safeJsonParse<HomeBootstrapSnapshot>(safeLocalStorage.getItem(HOME_BOOTSTRAP_SNAPSHOT_KEY));
  if (!isValidSnapshot(snapshot)) return null;
  return snapshot;
}

export function stabilizeHomeBootstrapReferenceData(data: HomeBootstrap | undefined | null) {
  if (!data || !Array.isArray(data.categories)) return data || null;
  if (data.categories.length > 0) return data;
  const previousCategories = readHomeBootstrapSnapshot()?.data?.categories || [];
  if (previousCategories.length === 0) return data;
  return {
    ...data,
    categories: previousCategories,
  };
}

export function writeHomeBootstrapSnapshot(data: HomeBootstrap | undefined | null) {
  const stableData = stabilizeHomeBootstrapReferenceData(data);
  if (!stableData || !Array.isArray(stableData.categories) || stableData.categories.length === 0) return;

  const snapshot: HomeBootstrapSnapshot = {
    version: HOME_BOOTSTRAP_SNAPSHOT_VERSION,
    updatedAt: Date.now(),
    data: stableData,
  };

  try {
    safeLocalStorage.setItem(HOME_BOOTSTRAP_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota/private-mode failures. Network bootstrap remains the source of truth.
  }
}
