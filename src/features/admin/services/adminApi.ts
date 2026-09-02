import { apiFetch } from '@/services/api';

export async function fetchAdminConfigApi() {
  const res = await apiFetch('/api/admin/config');
  if (!res.ok) throw new Error('配置加载失败');
  return res.json();
}

export async function saveAdminConfigApi(sanitizedConfig: any) {
  const res = await apiFetch('/api/admin/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sanitizedConfig),
  });
  return res;
}

export async function fetchOpsReportApi() {
  const res = await apiFetch('/api/admin/ops-report');
  if (!res.ok) throw new Error('报表加载失败');
  return res.json();
}

export async function fetchDepositAddressStatsApi() {
  const res = await apiFetch('/api/admin/deposit-addresses/stats');
  if (!res.ok) throw new Error('地址统计加载失败');
  return res.json();
}

export async function importDepositAddressesApi(addresses: string) {
  const res = await apiFetch('/api/admin/deposit-addresses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '地址导入失败');
  return payload;
}

export async function updateDepositAddressStatusApi(id: string, status: 'AVAILABLE' | 'DISABLED') {
  const res = await apiFetch(`/api/admin/deposit-addresses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '状态更新失败');
  return payload;
}

export async function createSweepJobApi() {
  const res = await apiFetch('/api/admin/deposit-sweep-jobs', { method: 'POST' });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '创建归集任务失败');
  return payload;
}

export async function creditRechargeOrderApi(orderId: string, requestBody: Record<string, any>) {
  const res = await apiFetch(`/api/admin/orders/${orderId}/credit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '确认到账失败');
  return payload;
}

export async function updateUserDisabledStateApi(userId: string, isDisabled: boolean) {
  const res = await apiFetch(`/api/admin/users/${userId}/disabled`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isDisabled }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '用户状态更新失败');
  return payload;
}

export async function adjustUserPointsApi(userId: string, changeType: 'INCREASE' | 'DECREASE', amount: number, remark: string) {
  const res = await apiFetch(`/api/admin/users/${userId}/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changeType, amount, remark }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '用户积分调整失败');
  return payload;
}

export async function updatePostPublishStateApi(postId: string, isPublished: boolean) {
  const res = await apiFetch(`/api/admin/posts/${postId}/publish`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPublished }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '内容状态更新失败');
  return payload;
}

export async function deletePostPermanentlyApi(postId: string) {
  const res = await apiFetch(`/api/admin/posts/${postId}/permanent`, {
    method: 'DELETE',
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '内容永久删除失败');
  return payload;
}

export async function updatePostCategoryApi(postId: string, categoryId: string) {
  const res = await apiFetch(`/api/admin/posts/${postId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryId }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '内容分类更新失败');
  return payload;
}

export async function updatePromotionApi(id: string, payloadData: Record<string, string | boolean>) {
  const res = await apiFetch(`/api/admin/promotions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadData),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '广告更新失败');
  return payload;
}

export async function togglePromotionDisplayStateApi(id: string, isActive: boolean) {
  const res = await apiFetch(`/api/admin/promotions/${id}/display-state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '投放展示状态更新失败');
  return payload;
}

export async function cancelPromotionApi(id: string) {
  const res = await apiFetch(`/api/admin/promotions/${id}`, {
    method: 'DELETE',
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '投放取消失败');
  return payload;
}

export async function fetchChatConfigApi() {
  const res = await apiFetch('/api/admin/chat/config');
  if (!res.ok) throw new Error('聊天控制台加载失败');
  return res.json();
}

export async function saveChatConfigApi(chatConfigDraft: any) {
  const res = await apiFetch('/api/admin/chat/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatConfigDraft),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '聊天配置保存失败');
  return payload;
}

export async function updateChatMessageStatusApi(id: string, status: 'VISIBLE' | 'HIDDEN' | 'DELETED') {
  const res = await apiFetch(`/api/admin/chat/messages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || '消息处理失败');
  return payload;
}

export async function muteChatAuthorApi(payload: { userId: string; minutes?: number; permanent?: boolean; reason?: string }) {
  const res = await apiFetch('/api/admin/chat/mutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const payloadData = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payloadData?.error || '禁言失败');
  return payloadData;
}

export async function fetchAdminListApi(url: string, params: URLSearchParams) {
  const query = params.toString();
  const fullUrl = query ? `${url}?${query}` : url;
  const res = await apiFetch(fullUrl);
  return res;
}

export async function fetchPublicConfigApi(cacheBust: number) {
  const res = await apiFetch(`/api/config?adminRefresh=${cacheBust}`, { cache: 'no-store', retry: false });
  if (!res.ok) throw new Error('refresh failed');
  return res.json();
}

export async function fetchPublicCategoriesApi(cacheBust: number) {
  const res = await apiFetch(`/api/categories?adminRefresh=${cacheBust}`, { cache: 'no-store', retry: false });
  if (!res.ok) throw new Error('refresh failed');
  return res.json();
}

export async function fetchHomeBootstrapApi(cacheBust: number) {
  const res = await apiFetch(`/api/home/bootstrap?adminRefresh=${cacheBust}`, { cache: 'no-store', retry: false });
  if (!res.ok) throw new Error('refresh failed');
  return res.json();
}
