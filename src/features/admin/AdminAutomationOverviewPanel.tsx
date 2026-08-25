import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, LoaderCircle, Play, RefreshCcw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  getAdminAutomationBatch,
  getAdminAutomationStatus,
  startAdminAutomationBatch,
  type AutomationBatch,
  type AutomationModule,
  type BatchModuleResult,
  type BatchStatus,
} from './services/automationApi';

const MODULE_META: Record<AutomationModule, { label: string; description: string }> = {
  auto_crawl: { label: '自动抓取', description: '抓取配置的数据源并入库' },
  auto_post: { label: '自动发帖', description: '从内容池选择并发布' },
  auto_like: { label: '自动点赞', description: '按配置执行机器人互动' },
  quote_publish: { label: '自动引用', description: '生成并发布引用内容' },
  comment_publish: { label: '自动评论', description: '生成并发布评论内容' },
};

const MODULE_ORDER: AutomationModule[] = ['auto_crawl', 'auto_post', 'auto_like', 'quote_publish', 'comment_publish'];

function isActive(status?: string | null) {
  return status === 'PENDING' || status === 'RUNNING';
}

function statusLabel(status?: string | null) {
  if (status === 'SUCCEEDED') return '已完成';
  if (status === 'PARTIAL_FAILED') return '部分失败';
  if (status === 'FAILED') return '失败';
  if (status === 'SKIPPED') return '已跳过';
  if (status === 'RUNNING') return '执行中';
  if (status === 'PENDING') return '排队中';
  return '未执行';
}

function reasonLabel(reason?: string | null) {
  const value = String(reason || '').trim();
  if (!value) return '';
  const labels: Record<string, string> = {
    disabled: '模块开关关闭，安全跳过',
    another_instance_running: '已有同类任务执行中',
    no_available_pair: '没有可执行的机器人和内容组合',
    no_available_topic_content: '没有可发布内容',
    no_quality_candidate_post: '没有符合条件的候选内容',
    platform_ai_not_ready: '平台 AI 尚未就绪',
    automation_batch_already_running: '已有一键自动化批次执行中',
  };
  return labels[value] || value;
}

function resultMetric(result?: BatchModuleResult) {
  const data = result?.result || {};
  const values = [
    ['抓取', data.delivered ?? data.scanned],
    ['发帖', data.created],
    ['点赞', data.liked ?? data.boosted],
    ['跳过', data.skipped],
    ['失败', data.failed ?? data.errorCount],
  ].filter(([, value]) => value !== undefined && value !== null);
  return values.map(([label, value]) => `${label} ${String(value)}`).join(' · ');
}

function formatTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : '-';
}

export function AdminAutomationOverviewPanel() {
  const { showToast } = useAuth();
  const [batch, setBatch] = useState<AutomationBatch | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const poll = async () => {
      try {
        let nextBatch: AutomationBatch | null = null;
        if (batchId) {
          nextBatch = await getAdminAutomationBatch(batchId, controller.signal);
        } else {
          const payload = await getAdminAutomationStatus(controller.signal);
          nextBatch = payload.batch?.active || payload.batch?.latest || null;
        }
        if (!nextBatch || disposed) return;
        setBatch(nextBatch);
        if (!batchId && isActive(nextBatch.status)) setBatchId(nextBatch.id);
        if (isActive(nextBatch.status) && !disposed) timer = setTimeout(() => { void poll(); }, 2_000);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('[admin-automation] batch status refresh failed:', error);
          // Keep monitoring after transient auth/network failures without
          // creating a tight retry loop; cleanup aborts this timer on unmount.
          timer = setTimeout(() => { void poll(); }, batchId ? 3_000 : 5_000);
        }
      }
    };

    void poll();
    return () => {
      disposed = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [batchId, refreshNonce]);

  const runAll = useCallback(async () => {
    setIsStarting(true);
    try {
      const payload = await startAdminAutomationBatch();
      const nextBatch = payload.batch as AutomationBatch | undefined;
      if (!nextBatch) throw new Error('服务器没有返回自动化批次');
      setBatch(nextBatch);
      setBatchId(nextBatch.id);
      showToast(payload.reused ? '已有自动化批次，已接管进度监控' : '一键自动化已启动', 'success');
    } catch (error: any) {
      showToast(error?.message || '一键自动化启动失败', 'error');
    } finally {
      setIsStarting(false);
    }
  }, [showToast]);

  const results = useMemo(() => new Map((batch?.results || []).map((item) => [item.module, item])), [batch?.results]);
  const running = isStarting || isActive(batch?.status);

  return (
    <section className="admin-section-card admin-automation-overview">
      <div className="admin-system-config-header">
        <div className="admin-system-config-copy">
          <h2 className="admin-system-config-title">自动化总控</h2>
          <p className="admin-system-config-summary">按“抓取 → 发帖 → 点赞 → 引用 → 评论”顺序执行。每个模块遵循自己的开关、频控和质量门，失败会隔离并继续后续任务。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setRefreshNonce((value) => value + 1)} className="pressable admin-quote-action" disabled={running}>
            <RefreshCcw size={15} aria-hidden="true" />
            刷新状态
          </button>
          <button type="button" onClick={() => { void runAll(); }} className="pressable admin-quote-action" data-variant="primary" disabled={running}>
            {running ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
            {running ? '自动化执行中' : '一键运行全部自动化'}
          </button>
        </div>
      </div>

      {batch ? (
        <div className="mt-5 space-y-4">
          <div className="admin-config-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="admin-text-strong-xs">批次状态：{statusLabel(batch.status)}</div>
                <div className="admin-form-note mt-1">开始于 {formatTime(batch.createdAt)} · 已完成 {batch.completedModules}/{batch.totalModules} 个模块</div>
              </div>
              <div className="admin-text-strong-xs">{batch.progressPercent}%</div>
            </div>
            <div className="admin-automation-progress mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={batch.progressPercent}>
              <div className="admin-automation-progress__value" style={{ width: `${batch.progressPercent}%` }} />
            </div>
            {batch.error ? <div className="admin-form-note admin-automation-error mt-2">{reasonLabel(batch.error)}</div> : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {MODULE_ORDER.map((module) => {
              const result = results.get(module);
              const isCurrent = batch.currentModule === module;
              const moduleStatus = isCurrent ? 'RUNNING' : result?.status;
              const iconClass = moduleStatus === 'SUCCEEDED'
                ? 'admin-automation-status-icon admin-automation-status-icon--success'
                : moduleStatus === 'FAILED'
                  ? 'admin-automation-status-icon admin-automation-status-icon--danger'
                  : moduleStatus === 'RUNNING'
                    ? 'admin-automation-status-icon admin-automation-status-icon--info'
                    : 'admin-automation-status-icon admin-automation-status-icon--neutral';
              const icon = moduleStatus === 'SUCCEEDED'
                ? <CheckCircle2 size={17} className={iconClass} aria-hidden="true" />
                : moduleStatus === 'FAILED'
                  ? <AlertTriangle size={17} className={iconClass} aria-hidden="true" />
                  : moduleStatus === 'RUNNING'
                    ? <LoaderCircle size={17} className={`${iconClass} animate-spin`} aria-hidden="true" />
                    : <Circle size={17} className={iconClass} aria-hidden="true" />;
              return (
                <div key={module} className="admin-config-card">
                  <div className="flex items-center gap-2">{icon}<span className="admin-text-strong-xs">{MODULE_META[module].label}</span></div>
                  <div className="admin-form-note mt-2">{isCurrent ? '正在执行' : statusLabel(moduleStatus)}</div>
                  <div className="admin-form-note mt-1">{result ? reasonLabel(result.reason) || resultMetric(result) || MODULE_META[module].description : MODULE_META[module].description}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="admin-form-note mt-5">尚未执行一键自动化。各模块的详细参数仍可在下方分别配置。</div>
      )}
    </section>
  );
}
