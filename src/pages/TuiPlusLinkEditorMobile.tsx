import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { APP_ROUTES } from '@/app/routePaths';
import { useAuth } from '@/context/AuthContext';
import SEO from '@/platform/SEO';
import { apiFetch } from '@/services/api';
import ActionButton from '@/ui/ActionButton';
import AppPage from '@/ui/AppPage';
import PageContentShell from '@/ui/PageContentShell';
import PageHeader from '@/ui/PageHeader';
import { InlineSpinner, LoadingBlock } from '@/ui/LoadingState';
import TuiPlusBenefitPromptDialog from '@/features/tui-plus/TuiPlusBenefitPromptDialog';
import { buildTuiPlusBenefitRouteState } from '@/features/tui-plus/tuiPlusBenefits';
import { parseResponseError } from '@/features/profile/profileHelpers';

type LinkTarget = 'contact' | 'website' | 'channel';
type ContactKind = 'telegram' | 'whatsapp' | 'line';
type AddQuota = { used: number; limit: number; remaining: number };
type SlotRow = {
  key: string;
  id?: string;
  title: string;
  value: string;
  originalTitle: string;
  originalValue: string;
  contactKind?: ContactKind;
  autoPostEnabled?: boolean;
  originalAutoPostEnabled?: boolean;
};

type TargetCopy = {
  target: LinkTarget;
  label: string;
  tabLabel: string;
  valueLabel: string;
  valuePlaceholder: string;
  endpoint: string;
  payloadKey: 'contacts' | 'websites' | 'channels';
};

type ContactMethod = {
  kind: ContactKind;
  label: string;
  valueLabel: string;
  valuePlaceholder: string;
};

type SaveOperation = {
  target: LinkTarget;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: any;
};

const CONTACT_METHODS: ContactMethod[] = [
  {
    kind: 'telegram',
    label: 'Telegram',
    valueLabel: 'Telegram ID',
    valuePlaceholder: '@tuitui888 或 https://t.me/tuitui888',
  },
  {
    kind: 'whatsapp',
    label: 'WhatsApp',
    valueLabel: 'WhatsApp',
    valuePlaceholder: 'WhatsApp 号码或链接',
  },
  {
    kind: 'line',
    label: 'Line',
    valueLabel: 'Line ID',
    valuePlaceholder: 'tuitui888 或 Line 个人链接',
  },
];
const SINGLE_PROFILE_LINK_LIMIT = 1;

const TARGETS: TargetCopy[] = [
  {
    target: 'contact',
    label: '联系方式',
    tabLabel: '联系方式',
    valueLabel: '联系方式',
    valuePlaceholder: '@telegram 或 https://t.me/username',
    endpoint: '/api/tui-plus/contacts',
    payloadKey: 'contacts',
  },
  {
    target: 'website',
    label: '网址链接',
    tabLabel: '网址',
    valueLabel: '链接',
    valuePlaceholder: 'https://tuitui888.com',
    endpoint: '/api/tui-plus/websites',
    payloadKey: 'websites',
  },
  {
    target: 'channel',
    label: '频道',
    tabLabel: '频道',
    valueLabel: '频道链接',
    valuePlaceholder: '@channel 或 https://t.me/channel',
    endpoint: '/api/tui-plus/channels',
    payloadKey: 'channels',
  },
];

function safeCount(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : 0;
}

function normalizeRouteTarget(raw: unknown): LinkTarget {
  const target = String(raw || '').trim().toLowerCase();
  if (target === 'website' || target === 'websites' || target === 'url') return 'website';
  if (target === 'channel' || target === 'channels' || target === 'telegram') return 'channel';
  return 'contact';
}

function contactMethod(kind?: ContactKind) {
  return CONTACT_METHODS.find((method) => method.kind === kind) || CONTACT_METHODS[0];
}

function getTelegramHandle(value: string) {
  const raw = value.trim();
  const fromUrl = raw.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?([^/?#]+)/i)?.[1];
  return (fromUrl || raw).replace(/^@+/, '').trim();
}

function getLineId(value: string) {
  const raw = value.trim();
  const fromUrl = raw.match(/^(?:https?:\/\/)?(?:www\.)?line\.me\/ti\/p\/~?([^/?#]+)/i)?.[1];
  return (fromUrl || raw).replace(/^@+/, '').trim();
}

function normalizeWhatsAppValue(value: string) {
  const raw = value.trim();
  const fromUrl = raw.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)([0-9+]+)/i)?.[1];
  const digits = (fromUrl || raw).replace(/[^0-9]/g, '');
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
}

function normalizeContactValue(kind: ContactKind, value: string) {
  const cleanValue = value.trim();
  if (!cleanValue) return '';
  if (kind === 'telegram') {
    const handle = getTelegramHandle(cleanValue);
    return handle ? `@${handle}` : '';
  }
  if (kind === 'whatsapp') return normalizeWhatsAppValue(cleanValue);
  if (kind === 'line') return getLineId(cleanValue);
  return cleanValue;
}

function normalizeValueForPayload(target: LinkTarget, value: string, contactKind?: ContactKind) {
  const cleanValue = value.trim();
  if (!cleanValue) return '';
  if (target === 'contact') return normalizeContactValue(contactKind || 'telegram', cleanValue);
  if (target === 'website' && !/^https?:\/\//i.test(cleanValue)) return `https://${cleanValue}`;
  return cleanValue;
}

function getDefaultTitle(target: LinkTarget, value: string, contactKind?: ContactKind) {
  if (target === 'contact') return contactMethod(contactKind).label;
  if (target === 'channel') {
    const handle = value
      .replace(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?/i, '')
      .replace(/^@+/, '')
      .split(/[/?#]/)[0]
      .trim();
    return handle ? `@${handle}` : '';
  }

  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withProtocol).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function getContactValueFormatError(kind: ContactKind, value: string, label: string) {
  const cleanValue = normalizeContactValue(kind, value);
  if (!cleanValue) return `${label}格式不正确`;
  if (kind === 'telegram') {
    const handle = cleanValue.replace(/^@+/, '');
    return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(handle) ? '' : `${label}格式不正确，请填写 Telegram ID`;
  }
  if (kind === 'whatsapp') {
    return /^\+[0-9]{8,15}$/.test(cleanValue) ? '' : `${label}格式不正确，请填写 WhatsApp 号码`;
  }
  if (kind === 'line') {
    return /^[A-Za-z0-9._-]{3,50}$/.test(cleanValue) ? '' : `${label}格式不正确，请填写 Line ID`;
  }
  return '';
}

function getValueFormatError(target: LinkTarget, value: string, label: string, contactKind?: ContactKind) {
  const cleanValue = value.trim();
  if (!cleanValue) return '';

  if (target === 'contact') return getContactValueFormatError(contactKind || 'telegram', cleanValue, label);

  if (target === 'website') {
    try {
      const url = new URL(normalizeValueForPayload(target, cleanValue));
      if (!/^https?:$/i.test(url.protocol) || !url.hostname.includes('.')) return `${label}格式不正确`;
      return '';
    } catch {
      return `${label}格式不正确`;
    }
  }

  if (target === 'channel') {
    const isHandle = /^@[a-zA-Z0-9_]{4,64}$/.test(cleanValue);
    const isTelegramUrl = /^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?[a-zA-Z0-9_]{4,64}(?:[/?#].*)?$/i.test(cleanValue);
    return isHandle || isTelegramUrl ? '' : `${label}格式不正确`;
  }

  return '';
}

function getContactKindFromItem(item: any): ContactKind | null {
  const label = String(item?.label || item?.title || item?.kind || item?.contactKind || '').toLowerCase();
  const value = String(item?.contact || item?.contactUrl || '').trim();
  const lowerValue = value.toLowerCase();
  if (/telegram|纸飞机|\btg\b/.test(label) || /(?:t\.me|telegram\.me)\//i.test(lowerValue) || /^@[a-zA-Z]/.test(value)) return 'telegram';
  if (/whatsapp|whats app|\bwa\b/.test(label) || /(?:wa\.me|whatsapp\.com)\//i.test(lowerValue)) return 'whatsapp';
  if (/\bline\b/.test(label) || /line\.me\//i.test(lowerValue)) return 'line';
  return null;
}

function getQuotaFromPayload(payload: any, target: LinkTarget): AddQuota {
  const usage = payload?.usage || {};
  const used = target === 'contact'
    ? safeCount(usage.ownedContactsUsed)
    : target === 'channel'
    ? safeCount(usage.ownedChannelsUsed)
    : safeCount(usage.ownedWebsitesUsed);
  const limit = target === 'contact'
    ? safeCount(usage.ownedContactsLimit)
    : SINGLE_PROFILE_LINK_LIMIT;
  const normalizedUsed = target === 'contact' ? used : Math.min(SINGLE_PROFILE_LINK_LIMIT, used);
  return { used: normalizedUsed, limit, remaining: Math.max(0, limit - normalizedUsed) };
}

function titleFromItem(target: LinkTarget, item: any) {
  if (target === 'contact') return String(item?.label || '').trim();
  if (target === 'channel') return String(item?.title || '').trim();
  return String(item?.label || '').trim();
}

function valueFromItem(target: LinkTarget, item: any) {
  if (target === 'contact') return String(item?.contact || item?.contactUrl || '').trim();
  if (target === 'channel') return String(item?.channelUrl || item?.channelHandle || '').trim();
  return String(item?.url || '').trim();
}

function buildContactRows(payload: any) {
  const items = Array.isArray(payload?.contacts) ? payload.contacts : [];
  const consumed = new Set<number>();
  return CONTACT_METHODS.map((method) => {
    const itemIndex = items.findIndex((item: any, index: number) => !consumed.has(index) && getContactKindFromItem(item) === method.kind);
    const item = itemIndex >= 0 ? items[itemIndex] : null;
    if (itemIndex >= 0) consumed.add(itemIndex);
    const value = item ? valueFromItem('contact', item) : '';
    return {
      key: `contact-${method.kind}-${item?.id || 'empty'}`,
      id: item?.id ? String(item.id) : '',
      title: method.label,
      value,
      originalTitle: item ? titleFromItem('contact', item) : method.label,
      originalValue: value,
      contactKind: method.kind,
    } satisfies SlotRow;
  });
}

function buildSlotRows(target: LinkTarget, payload: any) {
  if (target === 'contact') return buildContactRows(payload);
  const config = TARGETS.find((item) => item.target === target)!;
  const items = Array.isArray(payload?.[config.payloadKey]) ? payload[config.payloadKey].slice(0, SINGLE_PROFILE_LINK_LIMIT) : [];
  const quota = getQuotaFromPayload(payload, target);
  const rows: SlotRow[] = items.map((item: any, index: number) => {
    const title = titleFromItem(target, item);
    const value = valueFromItem(target, item);
    return {
      key: `${target}-${item?.id || index}`,
      id: String(item?.id || ''),
      title,
      value,
      originalTitle: title,
      originalValue: value,
      autoPostEnabled: target === 'channel' ? Boolean(item?.autoPostEnabled) : undefined,
      originalAutoPostEnabled: target === 'channel' ? Boolean(item?.autoPostEnabled) : undefined,
    };
  });
  const slotCount = Math.max(quota.limit, rows.length, 1);
  while (rows.length < slotCount) {
    const index = rows.length;
    rows.push({
      key: `${target}-empty-${index}`,
      title: '',
      value: '',
      originalTitle: '',
      originalValue: '',
      autoPostEnabled: target === 'channel' ? false : undefined,
      originalAutoPostEnabled: target === 'channel' ? false : undefined,
    });
  }
  return rows;
}

function buildRowsByType(payload: any) {
  return TARGETS.reduce((next, config) => {
    next[config.target] = buildSlotRows(config.target, payload);
    return next;
  }, {} as Record<LinkTarget, SlotRow[]>);
}

function makePayload(target: LinkTarget, cleanValue: string, cleanTitle: string, row?: SlotRow) {
  if (target === 'contact') return { contact: cleanValue, label: cleanTitle, contactKind: row?.contactKind };
  if (target === 'channel') return { channelUrl: cleanValue, title: cleanTitle, autoPostEnabled: Boolean(row?.autoPostEnabled) };
  return { url: cleanValue, label: cleanTitle };
}

function getSlotSaveIntent(target: LinkTarget, row: SlotRow) {
  const rawValue = row.value.trim();
  const cleanValue = normalizeValueForPayload(target, rawValue, row.contactKind);
  const cleanTitle = (row.title.trim() || getDefaultTitle(target, cleanValue, row.contactKind)).slice(0, 40);
  const hasValue = Boolean(rawValue);
  const touchedEmpty = !row.id && hasValue;
  const deletedExisting = Boolean(row.id) && !hasValue && Boolean(row.originalValue);
  const changedExisting = Boolean(row.id) && hasValue && (cleanTitle !== row.originalTitle || cleanValue !== normalizeValueForPayload(target, row.originalValue, row.contactKind));
  const changedAutoPost = target === 'channel' && Boolean(row.id) && hasValue && Boolean(row.autoPostEnabled) !== Boolean(row.originalAutoPostEnabled);
  return {
    cleanValue,
    cleanTitle,
    touchedEmpty,
    deletedExisting,
    changedExisting,
    shouldSave: touchedEmpty || deletedExisting || changedExisting || changedAutoPost,
  };
}

function getLinkEditorMetrics(rowsByType: Record<LinkTarget, SlotRow[]>) {
  return TARGETS.reduce((metrics, config) => {
    const rows = rowsByType[config.target] || [];
    rows.forEach((row) => {
      const intent = getSlotSaveIntent(config.target, row);
      if ((row.id && !intent.deletedExisting) || row.value.trim()) metrics.filled += 1;
      if (intent.shouldSave) metrics.changed += 1;
      metrics.total += 1;
    });
    return metrics;
  }, { filled: 0, changed: 0, total: 0 });
}

function getTargetMeta(target: LinkTarget, quota: AddQuota) {
  if (target === 'contact') return '';
  return quota.limit > 0 ? '仅支持 1 条' : '';
}

async function readJsonResponse(res: Response) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default function TuiPlusLinkEditorMobile() {
  const { target } = useParams<{ target?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, patchUser, showToast } = useAuth();
  const routeTarget = useMemo(() => normalizeRouteTarget(target), [target]);
  const [statusPayload, setStatusPayload] = useState<any | null>(null);
  const [rowsByType, setRowsByType] = useState<Record<LinkTarget, SlotRow[]>>(() => buildRowsByType({}));
  const [activeTarget, setActiveTarget] = useState<LinkTarget>(() => routeTarget);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setActiveTarget(routeTarget);
  }, [routeTarget]);

  const quotas = useMemo(() => ({
    contact: getQuotaFromPayload(statusPayload, 'contact'),
    website: getQuotaFromPayload(statusPayload, 'website'),
    channel: getQuotaFromPayload(statusPayload, 'channel'),
  }), [statusPayload]);

  const activeConfig = useMemo(() => TARGETS.find((item) => item.target === activeTarget) || TARGETS[0], [activeTarget]);
  const activeRows = rowsByType[activeConfig.target] || [];
  const activeQuota = quotas[activeConfig.target];
  const activeMeta = getTargetMeta(activeConfig.target, activeQuota);
  const metrics = useMemo(() => getLinkEditorMetrics(rowsByType), [rowsByType]);
  const hasUnsavedChanges = metrics.changed > 0;
  const statusReady = Boolean(statusPayload);
  const activeMember = Boolean(statusPayload?.active);
  const currentPath = `${APP_ROUTES.tuiPlusLinkEditor}/${activeTarget}`;

  const applyPayload = useCallback((payload: any | null) => {
    setStatusPayload(payload || null);
    if (payload) setRowsByType(buildRowsByType(payload));
    if (user?.id && payload) {
      patchUser({
        tuiPlusContacts: Array.isArray(payload.contacts) ? payload.contacts : [],
        tuiPlusChannels: Array.isArray(payload.channels) ? payload.channels.slice(0, SINGLE_PROFILE_LINK_LIMIT) : [],
        tuiPlusWebsites: Array.isArray(payload.websites) ? payload.websites.slice(0, SINGLE_PROFILE_LINK_LIMIT) : [],
        isTuiPlus: Boolean(payload.active),
        plusStatus: payload.status,
        plusPlan: payload.plan,
        plusExpiresAt: payload.expiresAt,
        plusTrialUsed: payload.trialUsed,
      } as any);
    }
  }, [patchUser, user?.id]);

  const refreshStatus = useCallback(async () => {
    const res = await apiFetch('/api/tui-plus/status', { cache: 'no-store' });
    const payload = res.ok ? await readJsonResponse(res).catch(() => null) : null;
    applyPayload(payload);
    return payload;
  }, [applyPayload]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch('/api/tui-plus/status', { cache: 'no-store' });
        const payload = res.ok ? await readJsonResponse(res).catch(() => null) : null;
        if (!cancelled && payload) applyPayload(payload);
      } catch {
        if (!cancelled) setStatusPayload({ active: false });
      }
    })();
    return () => { cancelled = true; };
  }, [applyPayload]);

  const updateSlot = useCallback((target: LinkTarget, index: number, field: 'title' | 'value', nextValue: string) => {
    setRowsByType((current) => ({
      ...current,
      [target]: (current[target] || []).map((row, rowIndex) => (
        rowIndex === index ? { ...row, [field]: nextValue } : row
      )),
    }));
  }, []);

  const updateChannelAutoPost = useCallback((index: number, nextValue: boolean) => {
    setRowsByType((current) => ({
      ...current,
      channel: (current.channel || []).map((row, rowIndex) => (
        rowIndex === index ? { ...row, autoPostEnabled: nextValue } : row
      )),
    }));
  }, []);

  const saveAll = useCallback(async () => {
    if (isSaving || !activeMember) return;
    const operations: SaveOperation[] = [];

    for (const config of TARGETS) {
      const rows = rowsByType[config.target] || [];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const intent = getSlotSaveIntent(config.target, row);

        if (!intent.shouldSave) continue;
        if (intent.deletedExisting) {
          operations.push({
            target: config.target,
            endpoint: `${config.endpoint}/${row.id}`,
            method: 'DELETE',
          });
          continue;
        }

        const formatError = getValueFormatError(config.target, row.value, `${config.label}第 ${index + 1} 条`, row.contactKind);
        if (formatError) {
          setActiveTarget(config.target);
          showToast(formatError, 'error');
          return;
        }
        operations.push({
          target: config.target,
          endpoint: row.id ? `${config.endpoint}/${row.id}` : config.endpoint,
          method: row.id ? 'PATCH' : 'POST',
          body: makePayload(config.target, intent.cleanValue, intent.cleanTitle, row),
        });
      }
    }

    if (operations.length === 0) {
      showToast('已保存', 'success');
      return;
    }

    setIsSaving(true);
    try {
      for (const operation of operations) {
        const res = await apiFetch(operation.endpoint, {
          method: operation.method,
          headers: operation.method === 'DELETE' ? undefined : { 'Content-Type': 'application/json' },
          body: operation.method === 'DELETE' ? undefined : JSON.stringify(operation.body),
        });
        if (!res.ok) throw new Error(await parseResponseError(res, operation.method === 'DELETE' ? '删除失败' : '保存失败'));
      }
      await refreshStatus();
      if (user?.id) queryClient.invalidateQueries({ queryKey: ['user-profile', user.id] });
      queryClient.invalidateQueries({ queryKey: ['tui-plus'] });
      showToast('联系方式与链接已保存', 'success');
    } catch (error: any) {
      showToast(error?.message || '保存失败', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [activeMember, isSaving, queryClient, refreshStatus, rowsByType, showToast, user?.id]);

  if (!statusReady) {
    return (
      <AppPage mobileAddressBarScroll bottomSafe className="tui-plus-link-editor-page surface-page">
        <SEO title="添加链接｜Tui Plus" noindex />
        <PageHeader title="添加链接" showBack titleAlign="center" />
        <PageContentShell as="main" className="tui-plus-link-editor-main ui-app-page-main">
          <LoadingBlock text="正在校验会员权益" />
        </PageContentShell>
      </AppPage>
    );
  }

  if (!activeMember) {
    return (
      <AppPage mobileAddressBarScroll bottomSafe className="tui-plus-link-editor-page surface-page">
        <SEO title="添加链接｜Tui Plus" noindex />
        <PageHeader title="添加链接" showBack titleAlign="center" />
        <PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">
          <TuiPlusBenefitPromptDialog
            open
            benefit="profileLinks"
            onClose={() => navigate('/profile', { replace: true })}
            onConfirm={() => navigate(APP_ROUTES.tuiPlus, { replace: true, state: buildTuiPlusBenefitRouteState('profileLinks', currentPath) })}
          />
        </PageContentShell>
      </AppPage>
    );
  }

  return (
    <AppPage mobileAddressBarScroll bottomSafe className="tui-plus-link-editor-page surface-page">
      <SEO title="添加链接｜Tui Plus" noindex />
      <PageHeader title="添加链接" showBack titleAlign="center" />
      <PageContentShell as="main" className="tui-plus-link-editor-main ui-app-page-main">
        <section className="tui-plus-link-editor-card" aria-label="添加链接">
          <div className="tui-plus-link-editor-tabs" role="tablist" aria-label="选择链接类型">
            {TARGETS.map((config) => (
              <button
                key={config.target}
                type="button"
                role="tab"
                aria-selected={activeTarget === config.target}
                data-state={activeTarget === config.target ? 'active' : 'idle'}
                className="tui-plus-link-editor-tab"
                onClick={() => setActiveTarget(config.target)}
              >
                {config.tabLabel}
              </button>
            ))}
          </div>

          <section key={activeConfig.target} className="tui-plus-link-editor-section" aria-label={activeConfig.label}>
            <div className="tui-plus-link-editor-section-header">
              <strong>{activeConfig.label}</strong>
              {activeMeta ? <span>{activeMeta}</span> : null}
            </div>
            <div className="tui-plus-link-editor-slots">
              {activeRows.map((row, index) => {
                const method = contactMethod(row.contactKind);
                return (
                  <div key={row.key} className="tui-plus-link-editor-slot" data-filled={row.id || row.value.trim() ? 'true' : undefined} data-dirty={getSlotSaveIntent(activeConfig.target, row).shouldSave ? 'true' : undefined} data-contact-kind={row.contactKind}>
                    <span className="tui-plus-link-editor-slot-index">{index + 1}</span>
                    <div className="tui-plus-link-editor-slot-fields">
                      {activeConfig.target === 'contact' ? (
                        <label className="tui-plus-link-editor-field">
                          <span>{method.valueLabel}</span>
                          <input
                            value={row.value}
                            onChange={(event) => updateSlot(activeConfig.target, index, 'value', event.target.value)}
                            placeholder={method.valuePlaceholder}
                            autoComplete="off"
                            inputMode={row.contactKind === 'whatsapp' ? 'tel' : 'text'}
                          />
                        </label>
                      ) : (
                        <>
                          <label className="tui-plus-link-editor-field">
                            <span>标题</span>
                            <input
                              value={row.title}
                              onChange={(event) => updateSlot(activeConfig.target, index, 'title', event.target.value)}
                              placeholder="标题"
                              maxLength={40}
                              autoComplete="off"
                            />
                          </label>
                          <label className="tui-plus-link-editor-field">
                            <span>{activeConfig.valueLabel}</span>
                            <input
                              value={row.value}
                              onChange={(event) => updateSlot(activeConfig.target, index, 'value', event.target.value)}
                              placeholder={activeConfig.valuePlaceholder}
                              autoComplete={activeConfig.target === 'website' ? 'url' : 'off'}
                              inputMode={activeConfig.target === 'website' ? 'url' : 'text'}
                            />
                          </label>
                          {activeConfig.target === 'channel' ? (
                            <label className="tui-plus-link-editor-check">
                              <input
                                type="checkbox"
                                checked={Boolean(row.autoPostEnabled)}
                                onChange={(event) => updateChannelAutoPost(index, event.target.checked)}
                              />
                              <span>频道内容自动发帖</span>
                            </label>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </section>
      </PageContentShell>
      <div className="tui-plus-link-editor-sticky-action ui-checkout-bar" data-bottom-nav-spacer="true">
        <div className="tui-plus-link-editor-sticky-shell" data-compact="true">
          <ActionButton className="tui-plus-link-editor-save" variant="brand" disabled={isSaving} state={isSaving ? 'loading' : 'idle'} onClick={() => void saveAll()}>
            {isSaving ? <InlineSpinner /> : null}
            {hasUnsavedChanges ? '保存修改' : '保存'}
          </ActionButton>
        </div>
      </div>
    </AppPage>
  );
}
