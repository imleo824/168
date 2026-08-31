import { fetcher, apiFetch, type ApiRequestOptions } from './apiCore';

export const getAdminConfig = () => fetcher<any>('/api/admin/config');
export const updateAdminConfig = (payload: any) =>
  fetcher<any>('/api/admin/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getAdminOpsReport = (options?: ApiRequestOptions) =>
  fetcher<any>('/api/admin/ops-report', options);

export const getAdminDepositAddressStats = () =>
  fetcher<any>('/api/admin/deposit-addresses/stats');

export const getAdminDepositAddresses = () =>
  fetcher<any>('/api/admin/deposit-addresses');

export const deleteAdminDepositAddress = (id: string) =>
  fetcher<any>(`/api/admin/deposit-addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const getAdminAutoCrawlConfig = () =>
  fetcher<any>('/api/admin/auto-crawl/config');

export const updateAdminAutoCrawlConfig = (payload: any) =>
  fetcher<any>('/api/admin/auto-crawl/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const saveAdminAutoCrawlSource = (payload: any, editingSourceId?: string | null) => {
  const url = editingSourceId
    ? `/api/admin/auto-crawl/sources/${encodeURIComponent(editingSourceId)}`
    : '/api/admin/auto-crawl/sources';
  return fetcher<any>(url, {
    method: editingSourceId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

export const deleteAdminAutoCrawlSource = (id: string) =>
  fetcher<any>(`/api/admin/auto-crawl/sources/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const toggleAdminAutoCrawlSource = (id: string, enabled: boolean) =>
  fetcher<any>(`/api/admin/auto-crawl/sources/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });

export const getAdminAutoCrawlExecutionLogs = (limit = 20) =>
  fetcher<any>(`/api/admin/auto-crawl/execution-logs/details?limit=${limit}`);

export const runAdminAutoCrawlNow = (sourceId?: string) =>
  fetcher<any>('/api/admin/auto-crawl/run-now', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sourceId ? { sourceId } : {}),
  });

export const getAdminAutoLikeConfig = () =>
  fetcher<any>('/api/admin/auto-like/config');

export const updateAdminAutoLikeConfig = (payload: any) =>
  fetcher<any>('/api/admin/auto-like/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getAdminAutoPostConfig = () =>
  fetcher<any>('/api/admin/auto-post/config');

export const updateAdminAutoPostConfig = (payload: any) =>
  fetcher<any>('/api/admin/auto-post/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getAdminCommentPublishConfig = () =>
  fetcher<any>('/api/admin/comment-publish/config');

export const updateAdminCommentPublishConfig = (payload: any) =>
  fetcher<any>('/api/admin/comment-publish/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getAdminQuotePublishConfig = () =>
  fetcher<any>('/api/admin/quote-publish/config');

export const updateAdminQuotePublishConfig = (payload: any) =>
  fetcher<any>('/api/admin/quote-publish/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getAdminReferralWithdrawals = (params: { page?: number; limit?: number; status?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.status) query.set('status', params.status);
  return fetcher<any>(`/api/admin/referral-withdrawals?${query.toString()}`);
};

export const updateAdminReferralWithdrawal = (id: string, payload: any) =>
  fetcher<any>(`/api/admin/referral-withdrawals/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getAdminInteractionRuns = (module: string, limit = 20) =>
  fetcher<any>(`/api/admin/${encodeURIComponent(module)}/runs?limit=${limit}`);

export const runAdminInteractionNow = (module: string) =>
  fetcher<any>(`/api/admin/${encodeURIComponent(module)}/run-now`, { method: 'POST' });
