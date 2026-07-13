import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, RefreshCcw, Save } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/services/api';
import { ConfigItem } from './adminChrome';

type ModelConfigState = {
  chat: any;
  comment: any;
  quote: any;
};

const DEFAULT_MODEL = 'gemini-2.5-flash';

export function AdminModelConfigPanel() {
  const { showToast } = useAuth();
  const [configs, setConfigs] = useState<ModelConfigState | null>(null);
  const [draftModel, setDraftModel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentModel = useMemo(() => {
    const model =
      configs?.chat?.aiModel ||
      configs?.comment?.model ||
      configs?.quote?.aiModel ||
      DEFAULT_MODEL;
    return String(model || DEFAULT_MODEL);
  }, [configs]);

  const fetchModelConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const [chatRes, commentRes, quoteRes] = await Promise.all([
        apiFetch('/api/admin/chat/config'),
        apiFetch('/api/admin/comment-publish/config'),
        apiFetch('/api/admin/quote-publish/config'),
      ]);
      if (!chatRes.ok || !commentRes.ok || !quoteRes.ok) throw new Error('模型配置加载失败');
      const nextConfigs = {
        chat: await chatRes.json(),
        comment: await commentRes.json(),
        quote: await quoteRes.json(),
      };
      setConfigs(nextConfigs);
      setDraftModel(String(nextConfigs.chat?.aiModel || nextConfigs.comment?.model || nextConfigs.quote?.aiModel || DEFAULT_MODEL));
    } catch (error: any) {
      showToast(error?.message || '模型配置加载失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchModelConfig();
  }, [fetchModelConfig]);

  const saveModelConfig = async () => {
    const model = draftModel.trim() || DEFAULT_MODEL;
    const baseConfigs = configs || { chat: {}, comment: {}, quote: {} };
    setIsSaving(true);
    try {
      const [chatRes, commentRes, quoteRes] = await Promise.all([
        apiFetch('/api/admin/chat/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...baseConfigs.chat, aiModel: model }),
        }),
        apiFetch('/api/admin/comment-publish/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...baseConfigs.comment, model }),
        }),
        apiFetch('/api/admin/quote-publish/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...baseConfigs.quote, aiModel: model }),
        }),
      ]);
      if (!chatRes.ok || !commentRes.ok || !quoteRes.ok) throw new Error('模型配置保存失败');
      const nextConfigs = {
        chat: await chatRes.json(),
        comment: await commentRes.json(),
        quote: await quoteRes.json(),
      };
      setConfigs(nextConfigs);
      setDraftModel(String(nextConfigs.chat?.aiModel || model));
      showToast('模型配置已保存', 'success');
    } catch (error: any) {
      showToast(error?.message || '模型配置保存失败', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="admin-section-card">
      <div className="admin-system-config-header">
        <div className="admin-system-config-title-group">
          <span className="admin-system-config-icon" data-scope="chat-config">
            <Bot className="admin-system-config-icon-graphic" aria-hidden="true" />
          </span>
          <div className="admin-system-config-copy">
            <h3 className="admin-system-config-title">模型配置</h3>
            <p className="admin-system-config-summary">统一维护自动聊天、自动评论、自动引用使用的模型。</p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchModelConfig}
          disabled={isLoading}
          className="pressable admin-chat-refresh-button"
        >
          <RefreshCcw className="admin-chat-refresh-icon" aria-hidden="true" />
          <span>{isLoading ? '刷新中' : '刷新'}</span>
        </button>
      </div>

      <div className="admin-chat-panel-body">
        <div className="admin-chat-config-card">
          <div className="admin-chat-config-header">
            <div>
              <div className="admin-chat-config-title">统一模型</div>
              <div className="admin-chat-config-summary">当前模型：{currentModel}</div>
            </div>
          </div>
          <div className="admin-chat-field-grid">
            <ConfigItem
              label="模型名称"
              type="text"
              value={draftModel}
              onChange={setDraftModel}
            />
          </div>
          <button
            type="button"
            onClick={saveModelConfig}
            disabled={isSaving}
            className="pressable admin-chat-action"
          >
            <Save size={18} /> {isSaving ? '保存中' : '保存模型配置'}
          </button>
        </div>
      </div>
    </section>
  );
}
