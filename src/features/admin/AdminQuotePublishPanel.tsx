import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/services/api';
import { ConfigItem } from './adminChrome';
import {
  AdminAutomationActions,
  AdminAutomationConfigCard,
  AdminAutomationConfigShell,
} from './AdminAutomationShared';

type QuotePublishConfig = {
  enabled: boolean;
  checkIntervalMinutes: number;
  dailyLimit: number;
  candidateWindowHours: number;
  repeatSourceCooldownHours: number;
  humanCommentSkipThreshold: number;
  humanQuoteSkipThreshold: number;
  humanShareSkipThreshold: number;
  humanTotalEngagementSkipThreshold: number;
  syncToTelegram: boolean;
};

const QUOTE_CONFIG_FIELDS = [
  { key: 'checkIntervalMinutes', label: '检查间隔（分钟）', min: 30, max: 720, help: '自动引用多久醒来检查一次。醒来不代表一定发布，低质原帖、重复内容、真人互动够了都会跳过。', actual: '后端强制限制 30–720 分钟。', recommendation: '30–120 分钟。', warning: '调得更小只会增加空跑和机器感，不会提高内容质量。' },
  { key: 'dailyLimit', label: '每日最多成功引用数', min: 0, max: 1000, help: '只统计 SUCCEEDED 的引用帖，不包含 SKIPPED。', actual: '后端强制限制 0–1000。', recommendation: '冷启动 8–24，大流量阶段可按运营节奏提高。' },
  { key: 'candidateWindowHours', label: '候选原帖时间窗（天）', min: 1, max: 14, help: '只从最近多少天内的真人原帖里挑选。', actual: '后端按小时保存，强制限制 1–14 天。', recommendation: '3–7 天。帖子少时用 7 天，内容变多后降到 3 天。', toDisplayValue: (value: unknown) => value === '' ? '' : Number(value || 0) / 24, fromDisplayValue: (value: unknown) => String(value).trim() === '' ? '' : Math.round(Number(value) * 24) },
  { key: 'repeatSourceCooldownHours', label: '同一原帖引用冷却（天）', min: 1, max: 14, help: '一条原帖被自动引用或质量门跳过后，多少天内不再作为自动引用来源。', actual: '后端按小时保存，强制限制 1–14 天。', recommendation: '3–7 天。质量优先当前 7 天合理。', warning: '这是全局源帖冷却，比“同机器人不重复”更严格。', toDisplayValue: (value: unknown) => value === '' ? '' : Number(value || 0) / 24, fromDisplayValue: (value: unknown) => String(value).trim() === '' ? '' : Math.round(Number(value) * 24) },
  { key: 'humanCommentSkipThreshold', label: '真人评论达到多少后跳过', min: 0, max: 20, help: '真人已经在聊，就不需要机器人继续引用。0 表示关闭这项拦截。', actual: '后端强制限制 0–20。', recommendation: '3。超过 3 说明帖子已有真人讨论。' },
  { key: 'humanQuoteSkipThreshold', label: '真人引用达到多少后跳过', min: 0, max: 20, help: '真人已经引用过，就不再让机器人引用。0 表示关闭。', actual: '后端强制限制 0–20。', recommendation: '2。引用比评论更强，阈值应该低一点。' },
  { key: 'humanShareSkipThreshold', label: '分享达到多少后跳过', min: 0, max: 100, help: '分享多说明帖子已经被扩散，不需要机器人继续推。0 表示关闭。', actual: '后端强制限制 0–100。', recommendation: '5。' },
  { key: 'humanTotalEngagementSkipThreshold', label: '真人总互动达到多少后跳过', min: 0, max: 100, help: '真人评论 + 真人引用 + 分享的总拦截线。0 表示关闭。', actual: '后端强制限制 0–100。', recommendation: '6。这个是防止热帖被机器人继续打扰的总保险。' },
];

export function AdminQuotePublishPanel() {
  const { showToast } = useAuth();
  const [draft, setDraft] = useState<Partial<QuotePublishConfig>>({});
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadConfig = useCallback(async () => { setIsLoadingConfig(true); try { const res = await apiFetch('/api/admin/quote-publish/config'); const payload = await res.json().catch(() => ({})); if (!res.ok) throw new Error(payload?.error || '自动引用配置加载失败'); setDraft(payload); } catch (error: any) { showToast(error?.message || '自动引用配置加载失败', 'error'); } finally { setIsLoadingConfig(false); } }, [showToast]);
  useEffect(() => { void loadConfig(); }, [loadConfig]);

  const saveConfig = async () => { setIsSaving(true); try { const res = await apiFetch('/api/admin/quote-publish/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }); const payload = await res.json().catch(() => ({})); if (!res.ok) throw new Error(payload?.error || '自动引用配置保存失败'); setDraft(payload); showToast('自动引用配置已保存', 'success'); } catch (error: any) { showToast(error?.message || '自动引用配置保存失败', 'error'); } finally { setIsSaving(false); } };
  const updateDraft = (key: keyof QuotePublishConfig, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <AdminAutomationConfigShell>
      <AdminAutomationConfigCard
        summary="候选窗口、冷却、每日上限和真人互动跳过阈值。"
        titleActions={(
          <>
            <label className="admin-quote-toggle"><input type="checkbox" checked={Boolean(draft.enabled)} onChange={(event) => updateDraft('enabled', event.target.checked)} />启用自动引用</label>
            <label className="admin-quote-toggle"><input type="checkbox" checked={Boolean(draft.syncToTelegram)} onChange={(event) => updateDraft('syncToTelegram', event.target.checked)} />同步 Telegram</label>
          </>
        )}
      >
        <div className="admin-quote-config-grid">{QUOTE_CONFIG_FIELDS.map((field) => <ConfigItem key={field.key} label={field.label} value={field.toDisplayValue ? field.toDisplayValue(draft[field.key as keyof QuotePublishConfig]) : draft[field.key as keyof QuotePublishConfig]} min={field.min} max={field.max} help={field.help} actual={field.actual} recommendation={field.recommendation} warning={field.warning} onChange={(value) => updateDraft(field.key as keyof QuotePublishConfig, field.fromDisplayValue ? field.fromDisplayValue(value) : value)} />)}</div>
        <AdminAutomationActions><button type="button" onClick={saveConfig} disabled={isSaving || isLoadingConfig} className="pressable admin-quote-action" data-variant="primary"><Save size={15} /><span>{isSaving ? '保存中' : '保存'}</span></button></AdminAutomationActions>
      </AdminAutomationConfigCard>
    </AdminAutomationConfigShell>
  );
}
