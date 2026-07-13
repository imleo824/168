import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';
import type { AdminTab } from './adminTypes';
import { adminTabs, interactionSubTabs, systemConfigTabs } from './adminMeta';

type ConfigItemProps = {
  key?: string;
  label: string;
  value: any;
  onChange?: (v: string) => void;
  disabled?: boolean;
  type?: string;
  help?: string;
  recommendation?: string;
  actual?: string;
  warning?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

const LEGACY_LIMITS: Record<string, { min: number; max: number; actual?: string; recommendation?: string }> = {
  '检查间隔（分钟）': { min: 5, max: 240, actual: '自动抓取后端强制限制 5–240 分钟；其他模块会单独覆盖自己的范围。', recommendation: '30–120 分钟。' },
  '单来源数量': { min: 1, max: 50, actual: '自动抓取后端强制限制 1–50 条。', recommendation: '10–30 条。' },
  '单轮来源数量': { min: 1, max: 50, actual: '自动抓取后端强制限制 1–50 个来源。', recommendation: '5–20 个来源。' },
};

function limitText(min?: number, max?: number, unit?: string) {
  if (typeof min === 'number' && typeof max === 'number') return `范围：最小 ${min}${unit || ''}，最大 ${max}${unit || ''}`;
  if (typeof min === 'number') return `范围：最小 ${min}${unit || ''}`;
  if (typeof max === 'number') return `范围：最大 ${max}${unit || ''}`;
  return '';
}

export function ConfigItem({
  label,
  value,
  onChange,
  disabled,
  type = 'number',
  help,
  recommendation,
  actual,
  warning,
  min,
  max,
  unit,
}: ConfigItemProps) {
  const inputValue = value === undefined || value === null ? '' : String(value);
  const inferred = min === undefined && max === undefined ? LEGACY_LIMITS[label] : undefined;
  const effectiveMin = min ?? inferred?.min;
  const effectiveMax = max ?? inferred?.max;
  const effectiveActual = actual ?? inferred?.actual;
  const effectiveRecommendation = recommendation ?? inferred?.recommendation;
  const limits = limitText(effectiveMin, effectiveMax, unit);

  return (
    <div className="admin-config-item">
      <label className="admin-config-label">{label}</label>
      <input
        type={type}
        disabled={disabled}
        inputMode={type === 'number' ? 'decimal' : 'text'}
        className="ui-control ui-glass-input admin-config-input"
        value={inputValue}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {limits ? <div className="admin-form-note mt-1">{limits}</div> : null}
      {effectiveRecommendation ? <div className="admin-form-note mt-1">推荐：{effectiveRecommendation}</div> : null}
      {effectiveActual ? <div className="admin-form-note mt-1">规则：{effectiveActual}</div> : null}
      {help ? <div className="admin-form-note mt-1">说明：{help}</div> : null}
      {warning ? <div className="admin-form-note mt-1">注意：{warning}</div> : null}
    </div>
  );
}

type AdminSidebarProps = {
  activeTab: AdminTab;
  onSwitchTab: (tab: AdminTab) => void;
};

export function AdminSidebar({ activeTab, onSwitchTab }: AdminSidebarProps) {
  const isInteractionTab = interactionSubTabs.some((item) => item.id === activeTab) || activeTab === 'interaction-config';
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'interaction-config': isInteractionTab,
  });

  useEffect(() => {
    if (!isInteractionTab) return;
    setExpandedGroups((current) => ({ ...current, 'interaction-config': true }));
  }, [isInteractionTab]);

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand">
        <div className="admin-brand-mark">
          <ShieldCheck className="admin-brand-mark-icon" aria-hidden="true" />
        </div>
        <div className="admin-brand-copy">
          <h1 className="admin-brand-title">旺财</h1>
          <p className="admin-brand-kicker">Admin Console</p>
        </div>
      </div>

      <nav className="admin-sidebar-nav scrollbar-hide">
        <div className="admin-nav-section-label">业务管理</div>
        {adminTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const icon = tab.icon();
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => onSwitchTab(tab.id)}
              className="pressable admin-nav-item"
              data-state={isActive ? 'active' : 'idle'}
            >
              <span className="admin-nav-icon">
                {icon}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}

        <div className="admin-nav-section-label">系统配置</div>
        {systemConfigTabs.map((tab) => {
          const isInteraction = tab.id === 'interaction-config';
          const isActive = activeTab === tab.id || (isInteraction && interactionSubTabs.some((item) => item.id === activeTab));
          const isExpanded = Boolean(expandedGroups[tab.id]);
          const icon = tab.icon();
          return (
            <div key={tab.id}>
              <button
                type="button"
                onClick={() => {
                  if (isInteraction) {
                    setExpandedGroups((current) => ({ ...current, [tab.id]: !current[tab.id] }));
                    return;
                  }
                  onSwitchTab(tab.id);
                }}
                className="pressable admin-nav-item"
                data-state={isActive ? 'active' : 'idle'}
                aria-expanded={isInteraction ? isExpanded : undefined}
              >
                <span className="admin-nav-icon">
                  {icon}
                </span>
                <span>{tab.label}</span>
                {isInteraction && (
                  <span className="admin-nav-expand-icon" aria-hidden="true">
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </span>
                )}
              </button>
              {isInteraction && isExpanded && (
                <div className="admin-nav-submenu">
                  {interactionSubTabs.map((child) => (
                    <button
                      type="button"
                      key={child.id}
                      onClick={() => onSwitchTab(child.id)}
                      className="pressable admin-nav-item admin-nav-subitem"
                      data-state={activeTab === child.id ? 'active' : 'idle'}
                    >
                      <span className="admin-nav-icon">
                        {child.icon(14)}
                      </span>
                      <span>{child.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

    </aside>
  );
}

export function AdminMobileTopBar({ activeTabMeta }: { activeTabMeta: { label: string } }) {
  return (
    <div className="admin-mobile-topbar lg:hidden">
      <div className="admin-mobile-brand">
        <div className="admin-brand-mark admin-brand-mark--dark">
          <ShieldCheck className="admin-brand-mark-icon" aria-hidden="true" />
        </div>
        <div className="admin-brand-copy">
          <h1 className="admin-brand-title">旺财</h1>
          <p className="admin-mobile-subtitle">{activeTabMeta.label}</p>
        </div>
      </div>
    </div>
  );
}

export function AdminTabStrip({ activeTab, onSwitch }: { activeTab: AdminTab; onSwitch: (tab: AdminTab) => void }) {
  return (
    <div className="admin-mobile-tabstrip scrollbar-hide lg:hidden">
      <div className="admin-mobile-tabstrip-inner">
        {[...adminTabs, ...systemConfigTabs].map((tab) => {
          const isActive = activeTab === tab.id;
          const icon = tab.icon();
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSwitch(tab.id)}
              className="pressable admin-mobile-tab"
              data-state={isActive ? 'active' : 'idle'}
            >
              <span className="admin-mobile-tab-icon">{icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
