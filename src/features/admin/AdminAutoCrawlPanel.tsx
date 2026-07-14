import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useCategories } from '@/hooks/useData';
import { apiFetch } from '@/services/api';
import { ConfigItem } from './adminChrome';
import { AdminAutoCrawlExecutionLogsCompactPanel } from './AdminAutoCrawlExecutionLogsCompactPanel';

type SourceType = 'telegram' | 'rss';
type CursorKind = 'message_id' | 'timestamp' | 'baseline_pending';
type AutoCrawlView = 'config' | 'sources' | 'executionLogs';
type AutoCrawlSource = {
  id: string;
  source: string;
  type: SourceType;
  sourceName: string;
  categoryId: string;
  categoryName: string;
  authorUserId: string;
  showContact: boolean;
  disabled: boolean;
  cursor: string;
  cursorKind: CursorKind;
  pollIntervalMinutes: number;
  nextRunAt?: string | null;
  lastSyncAt?: string | null;
  lastParsedCount?: number;
  lastCandidateCount?: number;
  lastDeliveredCount?: number;
  lastDuplicateCount?: number;
  failCount?: number;
  lastError?: string | null;
};
type AutoCrawlRun = {
  id: string;
  status: string;
  trigger: string;
  startedAt: string;
  finishedAt?: string | null;
  scanned?: number;
  delivered?: number;
  filtered?: number;
  duplicate?: number;
  error?: number;
  sourceCount?: number;
  skipReason?: string | null;
  errorMessage?: string | null;
  latestTitle?: string | null;
};
type AutoCrawlConfig = {
  enabled: boolean;
  checkIntervalMinutes: number;
  maxItemsPerSource: number;
  maxSourcesPerRun: number;
  sources: AutoCrawlSource[];
  recentRuns: AutoCrawlRun[];
};
type AdminCategoryOption = { id: string; name: string; slug?: string | null; order?: number };

const EMPTY_SOURCE: Partial<AutoCrawlSource> = {
  source: '',
  type: 'telegram',
  sourceName: '',
  categoryId: '',
  categoryName: '',
  authorUserId: '',
  showContact: true,
  disabled: false,
  cursor: '',
  cursorKind: 'baseline_pending',
  pollIntervalMinutes: 30,
};

function numberOrRaw(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}
function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function fmt(value?: string | null) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '-';
}
function shortId(id?: string | null) {
  if (!id) return '';
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export function AdminAutoCrawlPanel({ view = 'config' }: { view?: AutoCrawlView }) {
  const { showToast } = useAuth();
  const { data: categories } = useCategories();
  const [config, setConfig] = useState<AutoCrawlConfig | null>(null);
  const [draft, setDraft] = useState<Partial<AutoCrawlConfig>>({});
  const [sourceDraft, setSourceDraft] = useState<Partial<AutoCrawlSource>>(EMPTY_SOURCE);
  const [editingSourceId, setEditingSourceId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [togglingSourceId, setTogglingSourceId] = useState('');

  const sortedCategories = useMemo(
    () => [...(categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [categories],
  );
  const sources = config?.sources || [];
  const editingSource = sources.find((source) => source.id === editingSourceId) || null;

  const categoryName = (source: Partial<AutoCrawlSource>) => {
    const category = sortedCategories.find((item) => item.id === source.categoryId);
    return category?.name || cleanText(source.categoryName) || '未绑定分类';
  };

  const loadConfig = useCallback(async () => {
    try {
      const response = await apiFetch('/api/admin/auto-crawl/config');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || '自动抓取配置加载失败');
      setConfig(payload);
      setDraft(payload);
    } catch (error: any) {
      showToast(error?.message || '自动抓取配置加载失败', 'error');
    }
  }, [showToast]);

  useEffect(() => { void loadConfig(); }, [loadConfig]);

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const response = await apiFetch('/api/admin/auto-crawl/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: Boolean(draft.enabled),
          checkIntervalMinutes: draft.checkIntervalMinutes,
          maxItemsPerSource: draft.maxItemsPerSource,
          maxSourcesPerRun: draft.maxSourcesPerRun,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || '自动抓取配置保存失败');
      setConfig(payload);
      setDraft(payload);
      showToast('自动抓取配置已保存', 'success');
    } catch (error: any) {
      showToast(error?.message || '自动抓取配置保存失败', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const closeDialog = () => {
    if (savingSource) return;
    setDialogOpen(false);
    setEditingSourceId('');
    setSourceDraft(EMPTY_SOURCE);
  };
  const openCreate = () => {
    setEditingSourceId('');
    setSourceDraft(EMPTY_SOURCE);
    setDialogOpen(true);
  };
  const openEdit = (source: AutoCrawlSource) => {
    setEditingSourceId(source.id);
    setSourceDraft({
      ...source,
      categoryName: categoryName(source),
      cursorKind: source.cursorKind || 'baseline_pending',
      pollIntervalMinutes: source.pollIntervalMinutes || 30,
      showContact: source.showContact !== false,
      disabled: Boolean(source.disabled),
    });
    setDialogOpen(true);
  };

  const saveSource = async () => {
    const source = cleanText(sourceDraft.source);
    const categoryId = cleanText(sourceDraft.categoryId);
    const authorUserId = cleanText(sourceDraft.authorUserId);
    if (!source) return showToast('请填写来源地址', 'error');
    if (!categoryId) return showToast('请选择发布分类', 'error');
    if (!sourceDraft.disabled && !authorUserId) return showToast('启用的数据源必须填写发布账号ID', 'error');

    setSavingSource(true);
    try {
      const editing = Boolean(editingSourceId);
      const response = await apiFetch(
        editing ? `/api/admin/auto-crawl/sources/${editingSourceId}` : '/api/admin/auto-crawl/sources',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingSourceId || undefined,
            source,
            type: sourceDraft.type,
            sourceName: cleanText(sourceDraft.sourceName) || source,
            categoryId,
            authorUserId,
            showContact: sourceDraft.showContact !== false,
            disabled: Boolean(sourceDraft.disabled),
            cursor: cleanText(sourceDraft.cursor),
            cursorKind: sourceDraft.cursorKind,
            pollIntervalMinutes: numberOrRaw(String(sourceDraft.pollIntervalMinutes ?? 30)),
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || '数据源保存失败');
      setConfig(payload);
      setDraft(payload);
      setDialogOpen(false);
      setEditingSourceId('');
      setSourceDraft(EMPTY_SOURCE);
      showToast(editing ? '数据源已更新' : '数据源已添加', 'success');
    } catch (error: any) {
      showToast(error?.message || '数据源保存失败', 'error');
    } finally {
      setSavingSource(false);
    }
  };

  const toggleSource = async (source: AutoCrawlSource) => {
    setTogglingSourceId(source.id);
    try {
      const response = await apiFetch(`/api/admin/auto-crawl/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...source, disabled: !source.disabled }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || '数据源状态更新失败');
      setConfig(payload);
      setDraft(payload);
      showToast(source.disabled ? '数据源已启用' : '数据源已停用', 'success');
    } catch (error: any) {
      showToast(error?.message || '数据源状态更新失败', 'error');
    } finally {
      setTogglingSourceId('');
    }
  };

  const deleteSource = async (source: AutoCrawlSource) => {
    if (!window.confirm(`确认删除数据源「${source.sourceName || source.source}」？`)) return;
    try {
      const response = await apiFetch(`/api/admin/auto-crawl/sources/${source.id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || '数据源删除失败');
      setConfig(payload);
      setDraft(payload);
      showToast('数据源已删除', 'success');
    } catch (error: any) {
      showToast(error?.message || '数据源删除失败', 'error');
    }
  };

  const renderConfig = () => (
    <div className="admin-quote-shell pb-20">
      <section className="admin-section-card">
        <div className="space-y-6">
          <div className="admin-quote-card admin-quote-card--muted">
            <div className="admin-quote-card-header">
              <div>
                <div className="admin-quote-card-title">开关与参数</div>
                <div className="admin-quote-card-summary">分类来自数据源绑定的数据库 categoryId；Meta来自该分类后台Schema。</div>
              </div>
              <label className="admin-chat-toggle"><input type="checkbox" checked={Boolean(draft.enabled)} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />启用自动抓取</label>
            </div>
          </div>
          <div className="admin-chat-field-grid">
            <ConfigItem label="检查间隔（分钟）" value={draft.checkIntervalMinutes ?? ''} onChange={(value) => setDraft((current) => ({ ...current, checkIntervalMinutes: numberOrRaw(value) as any }))} />
            <ConfigItem label="单来源数量" value={draft.maxItemsPerSource ?? ''} onChange={(value) => setDraft((current) => ({ ...current, maxItemsPerSource: numberOrRaw(value) as any }))} />
            <ConfigItem label="单轮来源数量" value={draft.maxSourcesPerRun ?? ''} onChange={(value) => setDraft((current) => ({ ...current, maxSourcesPerRun: numberOrRaw(value) as any }))} />
          </div>
          <div className="flex justify-center pt-4"><button type="button" onClick={saveConfig} disabled={savingConfig} className="pressable admin-submit-button"><Save size={20} />{savingConfig ? '保存中' : '保存'}</button></div>
        </div>
      </section>
    </div>
  );

  const renderSources = () => (
    <div className="admin-quote-shell pb-20">
      <section className="admin-section-card">
        <div className="admin-config-surface admin-config-surface--comfortable">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h5 className="admin-text-title-sm">数据源列表</h5><div className="admin-form-note mt-1">共 {sources.length} 个数据源，全部由后台手动配置。</div></div>
            <div className="flex gap-2"><button type="button" onClick={loadConfig} className="pressable admin-quote-action">刷新</button><button type="button" onClick={openCreate} className="pressable admin-quote-action" data-variant="primary"><Plus size={15} />新增数据源</button></div>
          </div>
          <div className="admin-quote-latest-list">
            {sources.length ? sources.map((source) => (
              <div key={source.id} className="admin-config-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="admin-text-strong-xs">{source.sourceName || source.source}</div>
                    <div className="admin-form-note mt-1">{source.type.toUpperCase()} · {source.source} · {categoryName(source)}</div>
                    <div className="admin-form-note mt-1">发布账号：{shortId(source.authorUserId) || '未绑定'} · {source.disabled ? '已停用' : '正常'}</div>
                    <div className="admin-form-note mt-1">最近同步：{fmt(source.lastSyncAt)} · 下次运行：{fmt(source.nextRunAt)}</div>
                    <div className="admin-form-note mt-1">解析 {source.lastParsedCount || 0} · 候选 {source.lastCandidateCount || 0} · 发布 {source.lastDeliveredCount || 0} · 重复 {source.lastDuplicateCount || 0}</div>
                    {source.lastError ? <div className="admin-form-note mt-1">最近错误：{source.lastError}</div> : null}
                  </div>
                  <div className="flex gap-2"><button type="button" onClick={() => openEdit(source)} className="pressable admin-quote-action">编辑</button><button type="button" onClick={() => toggleSource(source)} disabled={togglingSourceId === source.id} className="pressable admin-quote-action">{togglingSourceId === source.id ? '处理中' : source.disabled ? '启用' : '停用'}</button><button type="button" onClick={() => deleteSource(source)} className="pressable admin-quote-action"><Trash2 size={15} />删除</button></div>
                </div>
              </div>
            )) : <div className="admin-state-inline">暂无数据源，请手动新增。</div>}
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <>
      {view === 'executionLogs' ? <AdminAutoCrawlExecutionLogsCompactPanel /> : view === 'sources' ? renderSources() : renderConfig()}
      {view === 'sources' && dialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={editingSourceId ? '编辑数据源' : '新增数据源'}>
          <div className="admin-config-surface admin-config-surface--comfortable max-h-[88vh] w-full max-w-4xl overflow-y-auto">
            <div className="mb-4 flex items-start justify-between gap-3"><div><h5 className="admin-text-title-sm">{editingSourceId ? '编辑数据源' : '新增数据源'}</h5><div className="admin-form-note mt-1">{editingSourceId ? `${editingSource?.sourceName || sourceDraft.sourceName || '当前数据源'} · ${shortId(editingSourceId)}` : '保存后仅按 categoryId 绑定数据库分类。'}</div></div><button type="button" onClick={closeDialog} disabled={savingSource} className="pressable admin-quote-action"><X size={15} />关闭</button></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="admin-field-label">类型<select className="mt-1 admin-form-control admin-form-control--field" value={sourceDraft.type || 'telegram'} onChange={(event) => setSourceDraft((current) => ({ ...current, type: event.target.value as SourceType }))}><option value="telegram">Telegram</option><option value="rss">RSS</option></select></label>
              <label className="admin-field-label">来源地址<input className="mt-1 admin-form-control admin-form-control--field" value={sourceDraft.source || ''} onChange={(event) => setSourceDraft((current) => ({ ...current, source: event.target.value }))} placeholder="https://t.me/s/channel 或 RSS URL" /></label>
              <label className="admin-field-label">数据源名称<input className="mt-1 admin-form-control admin-form-control--field" value={sourceDraft.sourceName || ''} onChange={(event) => setSourceDraft((current) => ({ ...current, sourceName: event.target.value }))} /></label>
              <label className="admin-field-label">发布分类<select className="mt-1 admin-form-control admin-form-control--field" value={sourceDraft.categoryId || ''} onChange={(event) => setSourceDraft((current) => ({ ...current, categoryId: event.target.value }))}><option value="">选择分类</option>{sortedCategories.map((category: AdminCategoryOption) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="admin-field-label">发布账号ID<input className="mt-1 admin-form-control admin-form-control--field" value={sourceDraft.authorUserId || ''} onChange={(event) => setSourceDraft((current) => ({ ...current, authorUserId: event.target.value }))} /></label>
              <label className="admin-field-label">抓取间隔（分钟）<input type="number" className="mt-1 admin-form-control admin-form-control--field" value={sourceDraft.pollIntervalMinutes ?? 30} onChange={(event) => setSourceDraft((current) => ({ ...current, pollIntervalMinutes: numberOrRaw(event.target.value) as any }))} /></label>
              <label className="admin-field-label">Cursor 类型<select className="mt-1 admin-form-control admin-form-control--field" value={sourceDraft.cursorKind || 'baseline_pending'} onChange={(event) => setSourceDraft((current) => ({ ...current, cursorKind: event.target.value as CursorKind }))}><option value="baseline_pending">首次基线</option><option value="message_id">消息 ID</option><option value="timestamp">时间戳</option></select></label>
              <label className="admin-field-label sm:col-span-2">Cursor<input className="mt-1 admin-form-control admin-form-control--field" value={sourceDraft.cursor || ''} onChange={(event) => setSourceDraft((current) => ({ ...current, cursor: event.target.value }))} /></label>
              <label className="admin-quote-toggle"><input type="checkbox" checked={sourceDraft.showContact !== false} onChange={(event) => setSourceDraft((current) => ({ ...current, showContact: event.target.checked }))} />展示联系方式</label>
              <label className="admin-quote-toggle"><input type="checkbox" checked={Boolean(sourceDraft.disabled)} onChange={(event) => setSourceDraft((current) => ({ ...current, disabled: event.target.checked }))} />停用数据源</label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={closeDialog} disabled={savingSource} className="pressable admin-quote-action">取消</button><button type="button" onClick={saveSource} disabled={savingSource} className="admin-submit-button"><Save size={18} />{savingSource ? '保存中' : editingSourceId ? '保存修改' : '保存数据源'}</button></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
