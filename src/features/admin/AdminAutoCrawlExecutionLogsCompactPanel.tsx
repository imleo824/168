import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { apiFetch } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { AdminAutomationEmptyLogs, AdminAutomationLogsShell } from './AdminAutomationShared';

type LogSummary = { runId: string; trigger: string; startedAt: string; finishedAt?: string | null; status: string; eventCount: number };
type LogEvent = { timestamp: string; runId: string; level: string; phase: string; message: string; sourceId?: string | null; sourceName?: string | null; itemId?: string | null; sourcePostId?: string | null; fingerprint?: string | null; status?: string | null; reason?: string | null; error?: string | null; details?: Record<string, unknown> | null };
type ContentLogGroup = { key: string; title: string; status: string; reason: string; latestAt: string; events: LogEvent[] };
type SourceLogGroup = { key: string; name: string; latestAt: string; items: ContentLogGroup[] };
type RunLogGroup = { key: string; title: string; status: string; reason: string; latestAt: string; events: LogEvent[] };
type DetailRow = { label: string; value: string };

function fmt(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length) return record;
  }
  return {} as Record<string, any>;
}

function formatValue(value: unknown, max = 220) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value.length > max ? `${value.slice(0, max)}...` : value;
  try {
    const json = JSON.stringify(value);
    return json.length > max ? `${json.slice(0, max)}...` : json;
  } catch {
    return String(value);
  }
}

function statusLabel(status?: string | null) {
  const map: Record<string, string> = {
    SUCCEEDED: '成功',
    PARTIAL_FAILED: '部分失败',
    FAILED: '失败',
    SKIPPED: '跳过',
    RUNNING: '运行中',
    PUBLISHED: '已发布',
    REJECTED: '已过滤',
    DUPLICATE: '重复舍弃',
    RAW: '已入库',
    PASSED: '通过',
    pass: '通过',
    processed: '已处理',
    disabled: '未启用',
    success: '成功',
    fallback: '降级处理',
  };
  return map[String(status || '')] || status || '-';
}

function phaseLabel(phase?: string | null) {
  const map: Record<string, string> = {
    item_seen: '解析到单条内容',
    duplicate_detected: '重复内容判断',
    raw_stored: '写入原始抓取记录',
    raw_store_failed: '原始记录写入失败',
    quality_checked: '质量检查',
    ai_processed: 'AI 处理',
    post_payload_ready: '生成发布入参',
    publish_succeeded: '发布成功',
    publish_failed: '发布失败',
    reprocess_item_seen: '历史内容重跑开始',
    reprocess_item_failed: '历史内容重跑失败',
  };
  return map[String(phase || '')] || String(phase || '执行过程');
}

function levelLabel(level?: string) {
  if (level === 'error') return '错误';
  if (level === 'warn') return '提醒';
  return '信息';
}

function reasonLabel(reason?: string | null, error?: string | null) {
  const value = reason || error || '';
  const aiJsonParseFailed = `ai_json_parse_${'failed'}`;
  const map: Record<string, string> = {
    author_missing: '未绑定发布账号',
    duplicate_published: '同一内容已经发布过',
    locked: '已有任务正在运行',
    disabled: '自动抓取未开启',
    no_items: '没有符合条件的历史内容',
    [aiJsonParseFailed]: 'AI 返回内容不是可解析 JSON',
    pass: '',
    PASSED: '',
    category_meta_incomplete: 'meta 缺失仅记录，不再阻断发布',
  };
  return map[value] ?? value ?? '';
}

function compactRows(rows: DetailRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.value) return false;
    const key = `${row.label}:${row.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function decisionFrom(details: Record<string, unknown>) {
  const meta = asRecord(details.meta);
  return firstRecord(details.categoryDecisionSummary, details.categoryDecision, meta.categoryDecision);
}

function cleanReason(raw: unknown) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.includes('来源分类本身得分足够')) return '来源分类命中充分';
  return value.length > 80 ? `${value.slice(0, 80)}...` : value;
}

function fieldFrom(records: Array<Record<string, any>>, keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = formatValue(record[key]);
      if (value) return value;
    }
  }
  return '';
}

function contactLabel(value: unknown) {
  return textValue(value) || '未识别';
}

function metaSummary(meta: Record<string, any>) {
  const hidden = new Set([
    'extractor',
    'hasCategoryMeta',
    'categoryMetaKeys',
    'metaSource',
    'metaStandardization',
    'categoryDecision',
    'categoryDecisionSummary',
    'aiStatus',
    'aiReason',
    'aiSuggestedCategory',
    'aiCategoryUsed',
    'aiCategoryNote',
    'aiProvider',
    'aiModel',
    'aiRequest',
    'aiResult',
    'rawAiMeta',
    'normalizedAiMeta',
  ]);
  const entries = Object.entries(meta || {})
    .filter(([key, value]) => !hidden.has(key) && value !== null && value !== undefined && value !== '')
    .slice(0, 12)
    .map(([key, value]) => `${key}=${formatValue(value, 80)}`);
  return entries.join('；');
}

function aiRows(event: LogEvent): DetailRow[] {
  const details = asRecord(event.details);
  const meta = asRecord(details.meta);
  const standardization = asRecord(meta.metaStandardization);
  const salary = asRecord(standardization.salary);
  const decision = decisionFrom(details);
  const sourceCategory = formatValue(decision.sourceCategoryName) || formatValue(details.sourceCategoryName);
  const finalCategory = formatValue(decision.effectiveCategoryName) || formatValue(details.categoryName) || formatValue(meta.categoryName) || sourceCategory;
  const title = formatValue(details.title) || formatValue(details.titlePreview) || formatValue(details.rawTitle);
  const salaryValue = fieldFrom([meta, details, salary], ['salaryRange', 'salary', 'rangeLabel', 'price']);
  const jobValue = fieldFrom([meta, details], ['position', 'jobTitle', 'job', 'title']);
  const rawText = `${details.contentPreview || ''} ${details.rawContent || ''}`;
  const anomaly = [
    !textValue(details.contact) && !textValue(meta.contact) ? '联系方式缺失' : '',
    /面议|^1$/.test(salaryValue) && /\d+\s*k|\d+转\d+/i.test(rawText) ? '薪资解析疑似异常' : '',
  ].filter(Boolean).join('；');

  return compactRows([
    { label: '来源', value: event.sourceName || formatValue(details.sourceName) || 'Telegram' },
    { label: '原文链接', value: formatValue(details.sourceUrl) },
    { label: '原分类', value: sourceCategory },
    { label: '最终分类', value: finalCategory },
    { label: '分类调整', value: sourceCategory && finalCategory ? (sourceCategory === finalCategory ? '否' : '是') : '' },
    { label: '原因', value: cleanReason(decision.selectedRuleLabel || decision.reason || event.reason) },
    { label: '标题', value: title },
    { label: '正文预览', value: formatValue(details.contentPreview) },
    { label: '地点', value: formatValue(details.location) || formatValue(meta.location) },
    { label: '岗位', value: jobValue && jobValue !== title ? jobValue : '' },
    { label: '薪资/价格', value: salaryValue },
    { label: '联系方式', value: contactLabel(details.contact || meta.contact) },
    { label: '结构化Meta', value: metaSummary(meta) },
    { label: '异常', value: anomaly },
  ]);
}

function qualityRows(event: LogEvent): DetailRow[] {
  const details = asRecord(event.details);
  return compactRows([
    { label: '状态', value: statusLabel(event.status) },
    { label: '质量分', value: formatValue(details.score) },
    { label: '是否过滤', value: event.status === 'REJECTED' ? '是' : '否' },
    { label: '原因', value: reasonLabel(event.reason, event.error) || formatValue(details.reason) },
    { label: '标题', value: formatValue(details.cleanedTitle) || formatValue(details.titlePreview) },
    { label: '正文预览', value: formatValue(details.cleanedContentPreview) || formatValue(details.contentPreview) },
    { label: '原文链接', value: formatValue(details.sourceUrl) },
  ]);
}

function postPayloadRows(event: LogEvent): DetailRow[] {
  const details = asRecord(event.details);
  const payload = firstRecord(details.createPostPayload, details.postPayload, details.finalPayload);
  const source = Object.keys(payload).length ? payload : details;
  return compactRows([
    { label: '标题', value: formatValue(source.title) },
    { label: '分类', value: formatValue(source.categoryName) || formatValue(source.categoryId) },
    { label: '地点', value: formatValue(source.location) },
    { label: '联系方式', value: contactLabel(source.contact) },
    { label: '图片数', value: formatValue(source.imagesCount ?? (Array.isArray(source.images) ? source.images.length : '')) },
    { label: '发布账号', value: formatValue(source.authorUserId) },
    { label: '是否发布', value: formatValue(source.isPublished) },
    { label: 'categoryMeta', value: formatValue(source.categoryMeta) },
  ]);
}

function publishRows(event: LogEvent): DetailRow[] {
  const details = asRecord(event.details);
  return compactRows([
    { label: '状态', value: statusLabel(event.status) },
    { label: 'postId', value: formatValue(details.postId) },
    { label: '标题', value: formatValue(details.title) || formatValue(details.titlePreview) },
    { label: '分类', value: formatValue(details.categoryName) },
    { label: '图片数', value: formatValue(details.imagesCount) },
    { label: '原文链接', value: formatValue(details.sourceUrl) },
    { label: '错误', value: event.error || formatValue(details.error) },
  ]);
}

function defaultRows(event: LogEvent): DetailRow[] {
  const details = asRecord(event.details);
  return compactRows([
    { label: '状态', value: statusLabel(event.status) },
    { label: '原因', value: reasonLabel(event.reason, event.error) },
    { label: '来源', value: event.sourceName || formatValue(details.sourceName) },
    { label: '原文链接', value: formatValue(details.sourceUrl) },
    { label: '标题', value: formatValue(details.titlePreview) || formatValue(details.title) || formatValue(details.rawTitle) },
    { label: '正文预览', value: formatValue(details.contentPreview) || formatValue(details.cleanedContentPreview) },
    { label: '错误', value: event.error || formatValue(details.error) },
  ]);
}

function keyRowsForEvent(event: LogEvent) {
  if (event.phase === 'ai_processed') return aiRows(event);
  if (event.phase === 'quality_checked') return qualityRows(event);
  if (event.phase === 'post_payload_ready') return postPayloadRows(event);
  if (event.phase === 'publish_succeeded' || event.phase === 'publish_failed') return publishRows(event);
  return defaultRows(event);
}

function itemKey(event: LogEvent) {
  const details = asRecord(event.details);
  return event.fingerprint || event.itemId || event.sourcePostId || textValue(details.sourceUrl) || textValue(details.titlePreview) || textValue(details.title) || '';
}

function contentTitle(events: LogEvent[]) {
  for (const event of events) {
    const details = asRecord(event.details);
    const title = textValue(details.titlePreview) || textValue(details.title) || textValue(details.rawTitle) || textValue(details.contentPreview);
    if (title) return title.slice(0, 80);
  }
  return '未命名内容';
}

function finalStatus(events: LogEvent[]) {
  if (events.some((event) => event.phase === 'publish_succeeded')) return '已发布';
  if (events.some((event) => event.phase === 'publish_failed')) return '发布失败';
  const duplicate = [...events].reverse().find((event) => event.status === 'DUPLICATE');
  if (duplicate) return statusLabel(duplicate.status);
  const rejected = [...events].reverse().find((event) => event.status === 'REJECTED');
  if (rejected) return statusLabel(rejected.status);
  if (events.some((event) => event.phase === 'post_payload_ready')) return '已生成发布内容';
  const final = [...events].reverse().find((event) => event.status && event.status !== 'disabled' && event.status !== 'pass' && event.status !== 'PASSED');
  return statusLabel(final?.status);
}

function finalReason(events: LogEvent[]) {
  const final = [...events].reverse().find((event) => reasonLabel(event.reason, event.error));
  return reasonLabel(final?.reason, final?.error);
}

function buildSourceContentGroups(events: LogEvent[]) {
  const sourceMap = new Map<string, Map<string, LogEvent[]>>();
  const sourceNameMap = new Map<string, string>();
  const sorted = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  for (const event of sorted) {
    const key = itemKey(event);
    if (!key) continue;
    const sourceKey = event.sourceId || event.sourceName || 'unknown-source';
    sourceNameMap.set(sourceKey, event.sourceName || '未命名数据源');
    const itemMap = sourceMap.get(sourceKey) || new Map<string, LogEvent[]>();
    itemMap.set(key, [...(itemMap.get(key) || []), event]);
    sourceMap.set(sourceKey, itemMap);
  }
  return [...sourceMap.entries()].map(([sourceKey, itemMap]) => {
    const items = [...itemMap.entries()].map(([key, itemEvents]) => ({
      key,
      title: contentTitle(itemEvents),
      status: finalStatus(itemEvents),
      reason: finalReason(itemEvents),
      latestAt: itemEvents[itemEvents.length - 1]?.timestamp || '',
      events: itemEvents,
    })).sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
    return { key: sourceKey, name: sourceNameMap.get(sourceKey) || '未命名数据源', latestAt: items[0]?.latestAt || '', items } as SourceLogGroup;
  }).filter((group) => group.items.length).sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
}

function buildRunGroups(events: LogEvent[]) {
  const runMap = new Map<string, LogEvent[]>();
  for (const event of events) {
    if (itemKey(event)) continue;
    runMap.set(event.runId, [...(runMap.get(event.runId) || []), event]);
  }
  return [...runMap.entries()].map(([runId, runEvents]) => {
    const sorted = [...runEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const latest = sorted[sorted.length - 1];
    const started = sorted[0];
    return {
      key: runId,
      title: `运行批次 ${runId.length > 12 ? `${runId.slice(0, 8)}…${runId.slice(-4)}` : runId}`,
      status: statusLabel(latest?.status),
      reason: finalReason(sorted),
      latestAt: latest?.timestamp || started?.timestamp || '',
      events: sorted,
    } as RunLogGroup;
  }).sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
}

function InfoRows({ rows }: { rows: DetailRow[] }) {
  if (!rows.length) return <div className="admin-form-note">细节：本步骤没有关键字段</div>;
  return <div className="mt-2 grid gap-1">{rows.map((row) => <div key={`${row.label}:${row.value}`} className="admin-form-note"><span className="admin-text-strong-xs">{row.label}：</span>{row.value}</div>)}</div>;
}

export function AdminAutoCrawlExecutionLogsCompactPanel() {
  const { showToast } = useAuth();
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/admin/auto-crawl/execution-logs?limit=20');
      const summaries = await res.json().catch(() => [] as LogSummary[]);
      if (!res.ok) throw new Error((summaries as any)?.error || '执行日志加载失败');
      const rows = Array.isArray(summaries) ? summaries : [];
      const detailPayloads = await Promise.all(rows.map(async (row) => {
        const detailRes = await apiFetch(`/api/admin/auto-crawl/execution-logs/${encodeURIComponent(row.runId)}`);
        const payload = await detailRes.json().catch(() => ({}));
        if (!detailRes.ok) return [];
        return Array.isArray(payload?.events) ? payload.events as LogEvent[] : [];
      }));
      setEvents(detailPayloads.flat());
    } catch (error: any) {
      showToast(error?.message || '执行日志加载失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const runNow = useCallback(async () => {
    setIsRunning(true);
    try {
      const res = await apiFetch('/api/admin/auto-crawl/run-now', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '自动抓取手动执行失败');
      const run = payload?.run || payload;
      showToast(`自动抓取：${statusLabel(run.status)}，扫描 ${run.scanned || 0} 条，发布 ${run.delivered || 0} 条，错误 ${run.error || 0} 条`, run.status === 'FAILED' || run.status === 'PARTIAL_FAILED' ? 'error' : 'success');
      await loadLogs();
    } catch (error: any) {
      showToast(error?.message || '自动抓取手动执行失败', 'error');
    } finally {
      setIsRunning(false);
    }
  }, [loadLogs, showToast]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);
  const sourceGroups = useMemo(() => buildSourceContentGroups(events), [events]);
  const runGroups = useMemo(() => buildRunGroups(events), [events]);
  const hasLogs = sourceGroups.length > 0 || runGroups.length > 0;

  return (
    <AdminAutomationLogsShell isLoading={isLoading} onRefresh={loadLogs} actions={<button type="button" onClick={runNow} disabled={isRunning || isLoading} className="pressable admin-quote-action"><Play size={15} aria-hidden="true" />{isRunning ? '执行中' : '手动执行一次'}</button>}>
      {isLoading ? <AdminAutomationEmptyLogs loading /> : sourceGroups.length ? sourceGroups.map((source) => (
        <section key={source.key} className="admin-config-card">
          <div className="admin-text-strong-xs">数据源：{source.name}</div>
          <div className="admin-form-note mt-1">最近执行：{fmt(source.latestAt)} · 内容 {source.items.length} 条</div>
          <div className="mt-3 space-y-3">{source.items.map((item) => (
            <details key={item.key} className="admin-config-card">
              <summary className="cursor-pointer"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="admin-text-strong-xs">内容：{item.title}</div><div className="admin-form-note mt-1">状态：{item.status}{item.reason ? ` · 原因：${item.reason}` : ''} · 关键节点 {item.events.length} 个</div></div><div className="admin-form-note">{fmt(item.latestAt)}</div></div></summary>
              <div className="mt-3 space-y-2">{item.events.map((event, index) => {
                const reason = reasonLabel(event.reason, event.error);
                return <details key={`${event.runId}-${event.timestamp}-${event.phase}-${index}`} className="admin-config-card"><summary className="cursor-pointer"><div className="flex flex-wrap items-center justify-between gap-2"><div className="admin-text-strong-xs">{index + 1}. {phaseLabel(event.phase)} · {levelLabel(event.level)}</div><div className="admin-form-note">{fmt(event.timestamp)}</div></div>{event.status || reason ? <div className="admin-form-note mt-1">状态：{statusLabel(event.status)}{reason ? ` · 原因：${reason}` : ''}</div> : null}</summary><InfoRows rows={keyRowsForEvent(event)} /></details>;
              })}</div>
            </details>
          ))}</div>
        </section>
      )) : null}
      {!isLoading && runGroups.length ? runGroups.map((run) => (
        <section key={run.key} className="admin-config-card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="admin-text-strong-xs">{run.title}</div>
              <div className="admin-form-note mt-1">状态：{run.status}{run.reason ? ` · 原因：${run.reason}` : ''} · 节点 {run.events.length} 个</div>
            </div>
            <div className="admin-form-note">{fmt(run.latestAt)}</div>
          </div>
          <div className="mt-3 space-y-2">{run.events.map((event, index) => {
            const reason = reasonLabel(event.reason, event.error);
            return <details key={`${event.runId}-${event.timestamp}-${event.phase}-${index}`} className="admin-config-card"><summary className="cursor-pointer"><div className="flex flex-wrap items-center justify-between gap-2"><div className="admin-text-strong-xs">{index + 1}. {phaseLabel(event.phase)} · {levelLabel(event.level)}</div><div className="admin-form-note">{fmt(event.timestamp)}</div></div>{event.status || reason ? <div className="admin-form-note mt-1">状态：{statusLabel(event.status)}{reason ? ` · 原因：${reason}` : ''}</div> : null}</summary><InfoRows rows={keyRowsForEvent(event)} /></details>;
          })}</div>
        </section>
      )) : null}
      {!isLoading && !hasLogs ? <AdminAutomationEmptyLogs /> : null}
    </AdminAutomationLogsShell>
  );
}
