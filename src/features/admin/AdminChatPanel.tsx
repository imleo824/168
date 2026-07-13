import { Save } from 'lucide-react';

import { ConfigItem } from './adminChrome';
import {
  AdminAutomationActions,
  AdminAutomationConfigCard,
  AdminAutomationConfigShell,
} from './AdminAutomationShared';

type AdminChatPanelProps = {
  chatConfigDraft: any;
  isSaving: boolean;
  saveChatConfig: () => void | Promise<void>;
  setChatConfigDraft: (updater: any) => void;
};

const CHAT_FIELDS = [
  { key: 'botMaxPerMinute', label: '每分钟最多自动发言数', min: 1, max: 30, recommendation: '1–5。', help: '限制机器人每分钟自动发言总量，避免聊天区刷屏。' },
  { key: 'botConcurrency', label: '同时生成回复数', min: 1, max: 10, recommendation: '1–3。', help: '同时并发生成多少条回复；越大越容易触发模型压力。' },
  { key: 'botCooldownSeconds', label: '同一机器人冷却（分钟）', min: 1, max: 1440, recommendation: '10–60 分钟。', help: '同一个机器人两次自动发言之间的冷却。', toDisplayValue: (value: unknown) => Number(value || 0) / 60, fromDisplayValue: (value: unknown) => Math.round((Number(value) || 0) * 60) },
  { key: 'botReplyMinDelayMs', label: '最快回复延迟（分钟）', min: 0, max: 60, recommendation: '0.5–3 分钟。', help: '机器人最早多久回复。', toDisplayValue: (value: unknown) => Number(value || 0) / 60000, fromDisplayValue: (value: unknown) => Math.round((Number(value) || 0) * 60000) },
  { key: 'botReplyMaxDelayMs', label: '最慢回复延迟（分钟）', min: 1, max: 240, recommendation: '3–15 分钟。', help: '机器人最晚多久回复；应大于最快回复延迟。', toDisplayValue: (value: unknown) => Number(value || 0) / 60000, fromDisplayValue: (value: unknown) => Math.round((Number(value) || 0) * 60000) },
];

export function AdminChatPanel({
  chatConfigDraft,
  isSaving,
  saveChatConfig,
  setChatConfigDraft,
}: AdminChatPanelProps) {
  const handleSave = () => {
    void Promise.resolve(saveChatConfig());
  };

  return (
    <AdminAutomationConfigShell>
      <AdminAutomationConfigCard
        summary="机器人开关、发言频率、并发、冷却和回复延迟。"
        titleActions={(
          <label className="admin-quote-toggle">
            <input
              type="checkbox"
              checked={Boolean(chatConfigDraft?.aiEnabled)}
              onChange={(event) => setChatConfigDraft((prev: any) => ({ ...prev, enabled: true, aiEnabled: event.target.checked }))}
            />
            启用自动聊天
          </label>
        )}
      >
        <div className="admin-quote-config-grid">
          {CHAT_FIELDS.map((field) => (
            <ConfigItem
              key={field.key}
              label={field.label}
              value={field.toDisplayValue ? field.toDisplayValue(chatConfigDraft?.[field.key]) : chatConfigDraft?.[field.key] ?? ''}
              min={field.min}
              max={field.max}
              help={field.help}
              recommendation={field.recommendation}
              onChange={(value) => {
                const nextValue = field.fromDisplayValue ? field.fromDisplayValue(value) : Number(value);
                setChatConfigDraft((prev: any) => ({ ...prev, enabled: true, [field.key]: Number.isFinite(nextValue) ? nextValue : value }));
              }}
            />
          ))}
        </div>
        <AdminAutomationActions>
          <button type="button" onClick={handleSave} disabled={isSaving} className="pressable admin-quote-action" data-variant="primary">
            <Save size={15} aria-hidden="true" />
            <span>{isSaving ? '保存中' : '保存'}</span>
          </button>
        </AdminAutomationActions>
      </AdminAutomationConfigCard>
    </AdminAutomationConfigShell>
  );
}
