import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/services/api';
import { AdminAutoCrawlPanel } from './AdminAutoCrawlPanel';
import { AdminAutoCrawlExecutionLogsCompactPanel } from './AdminAutoCrawlExecutionLogsCompactPanel';
import { AdminAutoLikePanel } from './AdminAutoLikePanel';
import { AdminAutoPostPanel } from './AdminAutoPostPanel';
import { AdminCommentPublishPanel } from './AdminCommentPublishPanel';
import { AdminQuotePublishPanel } from './AdminQuotePublishPanel';
import {
  ADMIN_AUTOMATION_SECTIONS,
  AdminAutomationEmptyLogs,
  AdminAutomationLogsShell,
  AdminAutomationModuleFrame,
  type AdminAutomationSection,
} from './AdminAutomationShared';

type InteractionTab = 'quote-publish' | 'comment-publish' | 'auto-like' | 'auto-post' | 'auto-crawl';
type ManualRunModule = 'quote-publish' | 'comment-publish' | 'auto-like' | 'auto-post';

type AdminInteractionConfigPanelProps = {
  initialTab?: InteractionTab;
};

const AUTO_CRAWL_SECTIONS: Array<{ id: AdminAutomationSection; label: string }> = [
  { id: 'config', label: '参数配置' },
  { id: 'sources', label: '数据源列表' },
  { id: 'logs', label: '执行日志' },
];

const MODULE_LABELS: Record<ManualRunModule, string> = {
  'quote-publish': '自动引用',
  'comment-publish': '自动评论',
  'auto-like': '自动点赞',
  'auto-post': '自动发帖',
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function runStatusLabel(status?: string | null) {
  if (status === 'SUCCEEDED') return '成功';
  if (status === 'SKIPPED') return '跳过';
  if (status === 'FAILED') return '失败';
  if (status === 'PARTIAL_FAILED') return '部分失败';
  if (status === 'PENDING') return '执行中';
  return status || '运行中';
}

function reasonLabel(reason?: string | null) {
  const map: Record<string, string> = {
    disabled: '未启用：当前模块开关关闭，所以没有进入内容生产。',
    another_instance_running: '任务锁占用：同一模块已有运行锁，本次未进入候选筛选或 AI 生成。',
    module_backoff_active: '连续失败或空跑后自动降频：系统进入保护期。',
    daily_limit_zero: '每日上限为 0：当前配置不允许自动生产内容。',
    daily_limit_reached: '已达到每日上限：今天不再继续生产内容。',
    platform_ai_key_missing: '平台 AI Key 缺失：无法调用模型生成内容。',
    platform_ai_not_ready: '平台 AI 未就绪：生成流程被中断。',
    no_available_robot: '没有可用机器人：没有账号可以承接本次动作。',
    no_robot_user: '没有可用机器人：机器人账号池为空或不可用。',
    no_candidate_post: '没有合适原帖：候选池筛选后没有可互动内容。',
    no_quality_candidate_post: '没有可用候选原帖：筛选后没有帖子进入 AI 生成。',
    no_robot_without_prior_engagement: '有候选原帖，但机器人都已互动过：为避免重复互动，本次跳过。',
    no_quality_reaction: 'AI 没有生成合格内容：生成结果没有通过质量门。',
    human_engagement_saturated: '真人互动已达到阈值：该帖已有足够真人评论/引用/分享，所以舍弃。',
    quality_gate_rejected: '内容质量未通过：生成内容被质量门拦截。',
    content_signature_recently_used: '近 14 天出现过相似内容：为避免重复刷屏，舍弃。',
    quality_failed: '质量不合格：AI 回复太水、太短、像机器人，或命中禁止话术。',
    ai_failed: 'AI 调用失败：模型没有返回可用内容。',
    bot_rate_limited_local: '本地频控拦截：一分钟内机器人发言太多。',
    bot_rate_limited_global: '全局频控拦截：机器人发言太密。',
    author_required: '缺少发布账号：无法发布内容。',
    category_required: '缺少发布分类：无法创建帖子。',
    no_topic_enabled: '没有开启任何主题：自动发帖没有可执行主题。',
    no_available_topic_content: '没有可发布内容：主题内容池为空或已消耗。',
    published: '已发布',
  };
  return map[String(reason || '')] || String(reason || '-') || '-';
}

function generatedText(run: any) {
  return String(run?.generatedContent || run?.content || run?.comment || run?.quoteContent || run?.postContent || run?.finalContent || run?.outputMessage?.body || '').trim();
}

function runReason(run: any) {
  return reasonLabel(run.error || run.skipReason || run.reason);
}

function robotLabel(run: any) {
  return String(run?.robotUser?.displayName || run?.robotName || run?.outputMessage?.authorName || run?.robotUserId || run?.authorUserId || '-').trim() || '-';
}

function postLabel(run: any) {
  if (run?.inputMessage?.body) return String(run.inputMessage.body).trim().slice(0, 100);
  if (run?.outputMessage?.body) return String(run.outputMessage.body).trim().slice(0, 100);
  const post = run?.sourcePost || run?.createdPost;
  return String(post?.title || post?.content || run?.postTitle || run?.sourcePostId || run?.postId || run?.createdPostId || '-').trim().slice(0, 100) || '-';
}

function runSummary(payload: any, label: string) {
  if (payload?.run) return runSummary(payload.run, label);
  if (payload?.status) return `${label}运行完成：${runStatusLabel(payload.status)}`;
  const success = payload?.created ?? payload?.liked ?? payload?.boosted ?? payload?.delivered ?? 0;
  const skipped = payload?.skipped ?? 0;
  const failed = payload?.failed ?? payload?.error ?? 0;
  return `${label}执行完成：成功 ${success}，跳过 ${skipped}，失败 ${failed}`;
}

function numericText(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '';
}

function processRows(run: any, module: ManualRunModule) {
  const rows = [
    { label: '开始时间', value: formatDateTime(run.startedAt || run.createdAt) },
    { label: '完成时间', value: run.finishedAt ? formatDateTime(run.finishedAt) : '' },
    { label: '执行结果', value: runStatusLabel(run.status) },
    { label: '处理原因', value: runReason(run) === '-' ? '' : runReason(run) },
    { label: module === 'auto-post' ? '发布账号' : '机器人账号', value: robotLabel(run) === '-' ? '' : robotLabel(run) },
    { label: module === 'auto-post' ? '发布内容' : '互动对象', value: postLabel(run) === '-' ? '' : postLabel(run) },
    { label: module === 'auto-like' ? '点赞数' : module === 'auto-post' ? '发布数' : '生成数', value: numericText(run.liked ?? run.boosted ?? run.created ?? run.delivered) },
    { label: '跳过数', value: numericText(run.skipped) },
    { label: '失败数', value: numericText(run.failed ?? run.error) },
    { label: '质量分', value: numericText(run.qualityScore ?? run.candidateScore) },
    { label: '生成内容', value: module === 'auto-like' ? '' : generatedText(run) },
    { label: '触发消息', value: String(run.inputMessage?.body || '').trim() },
    { label: '输出消息', value: String(run.outputMessage?.body || '').trim() },
  ];
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.value || row.value === '-') return false;
    const key = `${row.label}:${row.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ProcessRows({ rows }: { rows: Array<{ label: string; value: string }> }) {
  if (!rows.length) return <div className="admin-form-note">本次执行没有返回更多过程信息</div>;
  return <div className="mt-3 grid gap-2">{rows.map((row) => <div key={`${row.label}:${row.value}`} className="admin-form-note"><span className="admin-text-strong-xs">{row.label}：</span>{row.value}</div>)}</div>;
}

function ModuleRunLogsPanel({ module }: { module: ManualRunModule }) {
  const { showToast } = useAuth();
  const [runs, setRuns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const label = MODULE_LABELS[module];
  const endpoint = `/api/admin/${module}/runs?limit=20`;

  const loadRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(endpoint, { cache: 'no-store', retry: false });
      const payload = await res.json().catch(() => []);
      setRuns(res.ok && Array.isArray(payload) ? payload : []);
    } catch {
      setRuns([]);
    } finally {
      setIsLoading(false);
    }
  }, [endpoint]);

  const runNow = useCallback(async () => {
    setIsRunning(true);
    try {
      const res = await apiFetch(`/api/admin/${module}/run-now`, { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `${label}手动执行失败`);
      const status = payload?.status || payload?.run?.status;
      showToast(runSummary(payload, label), status === 'FAILED' || status === 'PARTIAL_FAILED' || payload?.failed || payload?.error ? 'error' : 'success');
      await loadRuns();
    } catch (error: any) {
      showToast(error?.message || `${label}手动执行失败`, 'error');
    } finally {
      setIsRunning(false);
    }
  }, [label, loadRuns, module, showToast]);

  useEffect(() => { void loadRuns(); }, [loadRuns]);

  const summary = useMemo(() => ({
    total: runs.length,
    success: runs.filter((run) => run.status === 'SUCCEEDED').length,
    skipped: runs.filter((run) => run.status === 'SKIPPED').length,
    failed: runs.filter((run) => run.status === 'FAILED').length,
    generated: runs.filter((run) => Boolean(generatedText(run))).length,
  }), [runs]);

  return (
    <AdminAutomationLogsShell
      isLoading={isLoading}
      onRefresh={loadRuns}
      actions={(
        <button type="button" onClick={runNow} disabled={isRunning || isLoading} className="pressable admin-quote-action">
          <Play size={15} aria-hidden="true" />
          {isRunning ? '执行中' : '手动执行一次'}
        </button>
      )}
    >
      <div className="space-y-3">
        {runs.length ? (
          <>
            <div className="admin-config-card">
              <div className="admin-text-strong-xs">{label}执行过程</div>
              <div className="admin-form-note mt-1">最近 {summary.total} 次 · 成功 {summary.success} · 跳过 {summary.skipped} · 失败 {summary.failed} · 有生成内容 {summary.generated}</div>
            </div>
            {runs.map((run, index) => (
              <details key={run.id || `${run.createdAt || run.startedAt || index}`} className="admin-config-card">
                <summary className="cursor-pointer">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="admin-text-strong-xs">{index + 1}. {runStatusLabel(run.status)} · {robotLabel(run)}</div>
                    <div className="admin-form-note">{formatDateTime(run.createdAt || run.startedAt)}</div>
                  </div>
                  <div className="admin-form-note mt-1">{postLabel(run)}</div>
                  {runReason(run) !== '-' ? <div className="admin-form-note mt-1">原因：{runReason(run)}</div> : null}
                </summary>
                <ProcessRows rows={processRows(run, module)} />
              </details>
            ))}
          </>
        ) : <AdminAutomationEmptyLogs loading={isLoading} />}
      </div>
    </AdminAutomationLogsShell>
  );
}

function AutoCrawlLogsPanel() {
  return <AdminAutoCrawlExecutionLogsCompactPanel />;
}

export function AdminInteractionConfigPanel({
  initialTab = 'quote-publish',
}: AdminInteractionConfigPanelProps) {
  const activeInteractionTab = initialTab;
  const [activeSection, setActiveSection] = useState<AdminAutomationSection>('config');
  const sections = activeInteractionTab === 'auto-crawl' ? AUTO_CRAWL_SECTIONS : ADMIN_AUTOMATION_SECTIONS;

  useEffect(() => {
    setActiveSection('config');
  }, [activeInteractionTab]);

  const renderConfig = () => {
    if (activeInteractionTab === 'quote-publish') return <AdminQuotePublishPanel />;
    if (activeInteractionTab === 'comment-publish') return <AdminCommentPublishPanel />;
    if (activeInteractionTab === 'auto-like') return <AdminAutoLikePanel />;
    if (activeInteractionTab === 'auto-post') return <AdminAutoPostPanel />;
    if (activeInteractionTab === 'auto-crawl') return <AdminAutoCrawlPanel view="config" />;
    return null;
  };

  const renderSources = () => {
    if (activeInteractionTab === 'auto-crawl') return <AdminAutoCrawlPanel view="sources" />;
    return renderConfig();
  };

  const renderLogs = () => {
    if (activeInteractionTab === 'auto-crawl') return <AutoCrawlLogsPanel />;
    if (activeInteractionTab === 'quote-publish') return <ModuleRunLogsPanel module="quote-publish" />;
    if (activeInteractionTab === 'comment-publish') return <ModuleRunLogsPanel module="comment-publish" />;
    if (activeInteractionTab === 'auto-like') return <ModuleRunLogsPanel module="auto-like" />;
    if (activeInteractionTab === 'auto-post') return <ModuleRunLogsPanel module="auto-post" />;
    return <ModuleRunLogsPanel module="quote-publish" />;
  };

  return (
    <AdminAutomationModuleFrame
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      sections={sections}
    >
      {activeSection === 'sources' ? renderSources() : activeSection === 'config' ? renderConfig() : renderLogs()}
    </AdminAutomationModuleFrame>
  );
}
