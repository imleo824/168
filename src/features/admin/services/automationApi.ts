import { apiFetch } from '@/services/api';

export type AutomationModule = 'auto_crawl' | 'auto_post' | 'auto_like' | 'quote_publish' | 'comment_publish';
export type BatchStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'SKIPPED' | 'PARTIAL_FAILED' | 'FAILED';

export type BatchModuleResult = {
  module: AutomationModule;
  status: 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
  reason?: string | null;
  durationMs?: number;
  result?: Record<string, unknown>;
};

export type AutomationBatch = {
  id: string;
  status: BatchStatus;
  modules: AutomationModule[];
  results: BatchModuleResult[];
  currentModule: AutomationModule | null;
  totalModules: number;
  completedModules: number;
  succeededModules: number;
  skippedModules: number;
  failedModules: number;
  progressPercent: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

type AutomationStatusResponse = {
  batch?: {
    active: AutomationBatch | null;
    latest: AutomationBatch | null;
  };
};

type StartAutomationBatchResponse = {
  started: boolean;
  reused: boolean;
  batchId: string;
  batch: AutomationBatch;
};

async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...init, cache: 'no-store', retry: false });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || '自动化请求失败');
  return payload as T;
}

export function getAdminAutomationStatus(signal?: AbortSignal) {
  return readJson<AutomationStatusResponse>('/api/admin/automation/status', { signal });
}

export function startAdminAutomationBatch() {
  return readJson<StartAutomationBatchResponse>('/api/admin/automation/run-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export function getAdminAutomationBatch(id: string, signal?: AbortSignal) {
  return readJson<AutomationBatch>(`/api/admin/automation/batches/${encodeURIComponent(id)}`, { signal });
}
