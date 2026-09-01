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

type CommentConfig = {
  enabled: boolean;
  intervalMinutes: number;
  batchSize: number;
  dailyLimit: number;
  maxPerPost: number;
  recentDays: number;
  categoryIds: string[];
  robotUserIds: string[];
  humanCommentSkipThreshold: number;
  humanQuoteSkipThreshold: number;
  humanShareSkipThreshold: number;
  humanTotalEngagementSkipThreshold: number;
};

const COMMENT_CONFIG_FIELDS = [
  { key: 'intervalMinutes', label: '检查间隔（分钟）', min: 30, max: 720, help: '自动评论多久醒来检查一次。醒来不等于一定评论，低质源帖、重复内容、真人互动够了都会跳过。', actual: '后端强制限制 30–720 分钟。', recommendation: '30–120 分钟。', warning: '降低间隔只会增加空跑和机器感，不会提升评论质量。' },
  { key: 'batchSize', label: '每次最多成功评论数', min: 1, max: 1000, help: '一次自动运行最多尝试发布几条评论。', actual: '后端强制限制 1–1000。', recommendation: '质量优先，建议按内容池和机器人数量逐步提高。' },
  { key: 'dailyLimit', label: '每日最多成功评论数', min: 0, max: 1000, help: '一天内自动评论成功落库的总上限。', actual: '后端强制限制 0–1000。', recommendation: '冷启动 8–24，大流量阶段可按运营节奏提高。' },
  { key: 'maxPerPost', label: '每条原帖最多机器人评论数', min: 1, max: 2, help: '同一条原帖最多允许多少条机器人评论。', actual: '后端强制限制 1–2。', recommendation: '固定 1。不要让同一帖子出现多个机器人排队评论。' },
  { key: 'recentDays', label: '候选原帖最近天数', min: 1, max: 14, help: '只从最近多少天的真人原帖里挑选。', actual: '后端强制限制 1–14 天。', recommendation: '3–7 天。内容少用 7，内容变多后降到 3。' },
  { key: 'humanCommentSkipThreshold', label: '真人评论达到多少后跳过', min: 0, max: 20, help: '真人已经开始讨论，就不再用机器人补评论。0 表示关闭这项拦截。', actual: '后端强制限制 0–20。', recommendation: '3。超过 3 基本不需要机器人冷启动。' },
  { key: 'humanQuoteSkipThreshold', label: '真人引用达到多少后跳过', min: 0, max: 20, help: '真人已经引用过，就不再让机器人继续补互动。0 表示关闭。', actual: '后端强制限制 0–20。', recommendation: '2。引用权重比评论强，阈值应该低。' },
  { key: 'humanShareSkipThreshold', label: '分享达到多少后跳过', min: 0, max: 100, help: '分享多说明帖子已经扩散，不需要机器人继续补。0 表示关闭。', actual: '后端强制限制 0–100。', recommendation: '5。' },
  { key: 'humanTotalEngagementSkipThreshold', label: '真人总互动达到多少后跳过', min: 0, max: 100, help: '真人评论 + 真人引用 + 分享的总保险线。0 表示关闭。', actual: '后端强制限制 0–100。', recommendation: '6。避免热帖被机器人继续打扰。' },
];

export function AdminCommentPublishPanel() {
  const { showToast } = useAuth();
  const [draft, setDraft] = useState<Partial<CommentConfig>>({});
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadConfig = useCallback(async () => { setIsLoadingConfig(true); try { const res = await apiFetch('/api/admin/comment-publish/config'); const payload = await res.json().catch(() => ({})); if (!res.ok) throw new Error(payload?.error || '自动评论配置加载失败'); setDraft(payload); } catch (error: any) { showToast(error?.message || '自动评论配置加载失败', 'error'); } finally { setIsLoadingConfig(false); } }, [showToast]);
  useEffect(() => { void loadConfig(); }, [loadConfig]);

  const saveConfig = async () => { setIsSaving(true); try { const res = await apiFetch('/api/admin/comment-publish/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }); const payload = await res.json().catch(() => ({})); if (!res.ok) throw new Error(payload?.error || '自动评论配置保存失败'); setDraft(payload); showToast('自动评论配置已保存', 'success'); } catch (error: any) { showToast(error?.message || '自动评论配置保存失败', 'error'); } finally { setIsSaving(false); } };
  const updateDraft = (key: keyof CommentConfig, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <AdminAutomationConfigShell>
      <AdminAutomationConfigCard
        summary="频率、上限、候选范围和真人互动跳过阈值。"
        titleActions={<label className="admin-quote-toggle"><input type="checkbox" checked={Boolean(draft.enabled)} onChange={(event) => updateDraft('enabled', event.target.checked)} />启用自动评论</label>}
      >
        <div className="admin-quote-config-grid">{COMMENT_CONFIG_FIELDS.map((field) => <ConfigItem key={field.key} label={field.label} value={draft[field.key as keyof CommentConfig]} min={field.min} max={field.max} help={field.help} actual={field.actual} recommendation={field.recommendation} warning={field.warning} onChange={(value) => updateDraft(field.key as keyof CommentConfig, value)} />)}</div>
        <AdminAutomationActions><button type="button" onClick={saveConfig} disabled={isSaving || isLoadingConfig} className="pressable admin-quote-action" data-variant="primary"><Save size={15} /><span>{isSaving ? '保存中' : '保存'}</span></button></AdminAutomationActions>
      </AdminAutomationConfigCard>
    </AdminAutomationConfigShell>
  );
}
