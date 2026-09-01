import { RefreshCcw } from 'lucide-react';
import type { ReactNode } from 'react';

export type AdminAutomationSection = 'config' | 'sources' | 'logs';

export const ADMIN_AUTOMATION_SECTIONS: Array<{ id: AdminAutomationSection; label: string }> = [
  { id: 'config', label: '参数配置' },
  { id: 'logs', label: '执行日志' },
];

export function AdminAutomationModuleFrame({
  activeSection,
  onSectionChange,
  sections = ADMIN_AUTOMATION_SECTIONS,
  children,
}: {
  activeSection: AdminAutomationSection;
  onSectionChange: (section: AdminAutomationSection) => void;
  sections?: Array<{ id: AdminAutomationSection; label: string }>;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6 pb-20">
      <section className="admin-section-card admin-system-config-card admin-system-config-card--tabs-only">
        <div className="admin-system-config-tabs">
          {sections.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSectionChange(tab.id)}
              className="admin-system-config-tab"
              data-state={activeSection === tab.id ? 'active' : 'idle'}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>
      {children}
    </div>
  );
}

export function AdminAutomationConfigShell({ children }: { children: ReactNode }) {
  return (
    <div className="admin-quote-shell pb-20">
      <section className="admin-section-card">
        <div className="space-y-6">{children}</div>
      </section>
    </div>
  );
}

export function AdminAutomationConfigCard({
  title = '开关与参数',
  summary,
  titleActions,
  children,
}: {
  title?: string;
  summary: string;
  titleActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="admin-quote-card admin-quote-card--muted">
      <div className="admin-quote-card-header">
        <div>
          <div className="admin-quote-card-title">{title}</div>
          <div className="admin-quote-card-summary">{summary}</div>
        </div>
        {titleActions ? <div className="flex flex-wrap justify-end gap-2">{titleActions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function AdminAutomationActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-center gap-3 pt-4">{children}</div>;
}

export function AdminAutomationLogsShell({
  isLoading,
  onRefresh,
  actions,
  children,
}: {
  isLoading: boolean;
  onRefresh?: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="admin-config-surface admin-config-surface--comfortable">
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        {actions}
        <button type="button" onClick={onRefresh} disabled={isLoading || !onRefresh} className="pressable admin-quote-action">
          <RefreshCcw size={15} aria-hidden="true" />
          {isLoading ? '刷新中' : '刷新日志'}
        </button>
      </div>
      <div className="admin-quote-latest-list">{children}</div>
    </div>
  );
}

export function AdminAutomationEmptyLogs({ loading }: { loading?: boolean }) {
  return <div className="admin-state-inline">{loading ? '执行日志加载中' : '暂无执行日志'}</div>;
}
