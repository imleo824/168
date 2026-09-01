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

type AutoLikeConfig = {
  enabled: boolean;
  intervalMinutes: number;
  batchSize: number;
  dailyLimit: number;
  recentDays: number;
  maxLikesPerPost: number;
  maxLikesPerRobotPerDay: number;
  categoryIds: string[];
  robotUserIds: string[];
};

const AUTO_LIKE_FIELDS: Array<{ key: keyof AutoLikeConfig; label: string; min: number; max: number; help: string; recommendation: string; actual?: string }> = [
  { key: 'intervalMinutes', label: '执行间隔（分钟）', min: 30, max: 720, help: '系统多久执行一次自动点赞。', recommendation: '60–180 分钟。', actual: '后端当前按填写值调度；低于 30 分钟容易显得机器化，不建议。' },
  { key: 'batchSize', label: '每次最多点赞数', min: 1, max: 50, help: '一次任务最多尝试产生多少个站内点赞。', recommendation: '5–20。', actual: '实际执行还受每日总上限、单帖上限、单机器人上限影响。' },
  { key: 'dailyLimit', label: '每日总点赞上限', min: 0, max: 10000, help: '一天最多自动点赞多少次。', recommendation: '冷启动 100–300，大流量阶段可按运营节奏提高。', actual: '后端强制限制 0–10000；达到后当天不再继续点赞。' },
  { key: 'recentDays', label: '候选帖子最近天数', min: 1, max: 30, help: '只从最近 N 天的已发布真人帖子里挑选。', recommendation: '3–7 天。', actual: '天数越大，候选越多，但可能点赞旧帖。' },
  { key: 'maxLikesPerPost', label: '单帖最多机器人点赞数', min: 1, max: 50, help: '同一帖子最多允许多少个机器人点赞。', recommendation: '3–10。', actual: '达到后该帖子会被跳过。' },
  { key: 'maxLikesPerRobotPerDay', label: '单机器人每日最多点赞数', min: 1, max: 200, help: '单个机器人账号一天最多点赞多少次。', recommendation: '10–50。', actual: '达到后该机器人当天不再参与点赞。' },
];

export function AdminAutoLikePanel() {
  const { showToast } = useAuth();
  const [likeDraft, setLikeDraft] = useState<Partial<AutoLikeConfig>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadAutoLike = useCallback(async () => {
    setIsLoading(true);
    try {
      const configRes = await apiFetch('/api/admin/auto-like/config');
      const configPayload = await configRes.json().catch(() => ({}));
      if (!configRes.ok) throw new Error(configPayload?.error || '自动点赞配置加载失败');
      setLikeDraft(configPayload);
    } catch (error: any) {
      showToast(error?.message || '自动点赞后台加载失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void loadAutoLike(); }, [loadAutoLike]);

  const updateLikeDraft = (key: keyof AutoLikeConfig, value: unknown) => setLikeDraft((current) => ({ ...current, [key]: value }));

  const saveAutoLike = async () => {
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/admin/auto-like/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(likeDraft) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '自动点赞配置保存失败');
      setLikeDraft(payload);
      showToast('自动点赞配置已保存', 'success');
    } catch (error: any) {
      showToast(error?.message || '自动点赞配置保存失败', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminAutomationConfigShell>
      <AdminAutomationConfigCard
        summary="频率、批量、每日上限和单帖/单机器人限制。"
        titleActions={<label className="admin-quote-toggle"><input type="checkbox" checked={Boolean(likeDraft.enabled)} onChange={(event) => updateLikeDraft('enabled', event.target.checked)} />启用自动点赞</label>}
      >
        <div className="admin-quote-config-grid">{AUTO_LIKE_FIELDS.map((field) => <ConfigItem key={field.key} label={field.label} value={likeDraft[field.key] ?? ''} min={field.min} max={field.max} help={field.help} actual={field.actual} recommendation={field.recommendation} onChange={(value) => updateLikeDraft(field.key, value)} />)}</div>
        <AdminAutomationActions>
          <button type="button" onClick={saveAutoLike} disabled={isSaving || isLoading} className="pressable admin-quote-action" data-variant="primary"><Save size={15} /> {isSaving ? '保存中' : '保存'}</button>
        </AdminAutomationActions>
      </AdminAutomationConfigCard>
    </AdminAutomationConfigShell>
  );
}
