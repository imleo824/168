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

type AutoPostTopic = 'QUOTE' | 'FACT' | 'RIDDLE' | 'JOKE';
type AutoPostTopicConfig = {
  enabled: boolean;
  authorUserId: string;
  categoryId: string;
  dailyLimit: number;
};
type AutoPostConfig = {
  enabled: boolean;
  checkIntervalMinutes: number;
  syncToTelegram: boolean;
  topicConfigs: Record<string, AutoPostTopicConfig>;
};
const TOPICS: Array<{ key: AutoPostTopic; label: string }> = [
  { key: 'QUOTE', label: '名人名言' },
  { key: 'FACT', label: '冷知识' },
  { key: 'RIDDLE', label: '脑筋急转弯' },
  { key: 'JOKE', label: '冷笑话' },
];

function defaultTopicConfig(): AutoPostTopicConfig {
  return { enabled: false, authorUserId: '', categoryId: '', dailyLimit: 12 };
}

function normalizeTopicConfigsForSave(source: Partial<AutoPostConfig>) {
  const currentConfigs = source.topicConfigs || {};
  return Object.fromEntries(TOPICS.map((topic) => {
    const cfg = { ...defaultTopicConfig(), ...(currentConfigs[topic.key] || {}) };
    return [topic.key, { ...cfg, categoryId: '' }];
  }));
}

export function AdminAutoPostPanel() {
  const { showToast } = useAuth();
  const [postDraft, setPostDraft] = useState<Partial<AutoPostConfig>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadAutoPost = useCallback(async () => {
    setIsLoading(true);
    try {
      const configRes = await apiFetch('/api/admin/auto-post/config');
      const configPayload = await configRes.json().catch(() => ({}));
      if (!configRes.ok) throw new Error(configPayload?.error || '自动发帖配置加载失败');
      setPostDraft(configPayload);
    } catch (error: any) {
      showToast(error?.message || '自动发帖后台加载失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void loadAutoPost(); }, [loadAutoPost]);

  const updatePostDraft = (key: keyof AutoPostConfig, value: unknown) => {
    setPostDraft((current) => ({ ...current, [key]: value }));
  };

  const updateTopicDraft = (topic: AutoPostTopic, patch: Partial<AutoPostTopicConfig>) => {
    setPostDraft((current) => {
      const topicConfigs = { ...(current.topicConfigs || {}) };
      topicConfigs[topic] = { ...defaultTopicConfig(), ...(topicConfigs[topic] || {}), ...patch, categoryId: '' };
      return { ...current, topicConfigs };
    });
  };

  const saveAutoPost = async () => {
    setIsSaving(true);
    try {
      const payload = {
        ...postDraft,
        topicConfigs: normalizeTopicConfigsForSave(postDraft),
      };
      const res = await apiFetch('/api/admin/auto-post/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saved = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(saved?.error || '自动发帖配置保存失败');
      setPostDraft(saved);
      showToast('自动发帖配置已保存', 'success');
    } catch (error: any) {
      showToast(error?.message || '自动发帖配置保存失败', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminAutomationConfigShell>
      <AdminAutomationConfigCard
        summary="主题、发布账号、每日上限和同步规则。"
        titleActions={(
          <>
            <label className="admin-quote-toggle"><input type="checkbox" checked={Boolean(postDraft.enabled)} onChange={(event) => updatePostDraft('enabled', event.target.checked)} />启用自动发帖</label>
            <label className="admin-quote-toggle"><input type="checkbox" checked={Boolean(postDraft.syncToTelegram)} onChange={(event) => updatePostDraft('syncToTelegram', event.target.checked)} />同步 Telegram</label>
          </>
        )}
      >
        <div className="admin-quote-config-grid">
          <ConfigItem label="检查间隔（分钟）" value={postDraft.checkIntervalMinutes ?? ''} min={30} max={720} help="自动发帖多久检查一次内容池。" actual="后端当前会按填写值保存；建议按 30–720 分钟控制。" recommendation="60–180 分钟。" onChange={(value) => updatePostDraft('checkIntervalMinutes', Number(value) || 60)} />
        </div>
      </AdminAutomationConfigCard>

      <div className="admin-config-surface admin-config-surface--comfortable admin-auto-post-section">
        <div className="admin-auto-post-section-header">
          <h5 className="admin-text-title-sm">主题发布规则</h5>
          <p className="admin-form-note">每个主题独立设置账号和每日上限。自动发帖不需要绑定发布分类，帖子会以无分类发布。</p>
        </div>
        <div className="admin-auto-post-topic-list">
          {TOPICS.map((topic) => {
            const cfg = (postDraft.topicConfigs || {})[topic.key] || defaultTopicConfig();
            return (
              <div key={topic.key} className="admin-config-card admin-auto-post-topic-card">
                <div className="admin-auto-post-topic-header">
                  <div>
                    <div className="admin-text-title-sm">{topic.label}</div>
                    <div className="admin-card-kicker">{topic.key}</div>
                  </div>
                  <label className="admin-chat-toggle">
                    <input type="checkbox" checked={Boolean(cfg.enabled)} onChange={(event) => updateTopicDraft(topic.key, { enabled: event.target.checked })} />
                    启用
                  </label>
                </div>
                <div className="admin-auto-post-topic-fields">
                  <label className="admin-field-label admin-auto-post-field">
                    发布账号ID
                    <input className="admin-form-control admin-form-control--field" value={cfg.authorUserId || ''} onChange={(event) => updateTopicDraft(topic.key, { authorUserId: event.target.value })} placeholder="机器人/官方账号 userId" />
                  </label>
                  <label className="admin-field-label admin-auto-post-field">
                    每日上限
                    <input type="number" min={0} max={50} className="admin-form-control admin-form-control--field" value={cfg.dailyLimit ?? 12} onChange={(event) => updateTopicDraft(topic.key, { dailyLimit: Number(event.target.value) || 0 })} />
                    <span className="admin-form-note mt-1 block">范围：最小 0，最大 50；推荐 8–24。</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AdminAutomationActions>
        <button type="button" onClick={saveAutoPost} disabled={isSaving || isLoading} className="pressable admin-quote-action" data-variant="primary"><Save className="admin-quote-action-icon" /><span>{isSaving ? '保存中' : '保存'}</span></button>
      </AdminAutomationActions>
    </AdminAutomationConfigShell>
  );
}
