import type { ReactNode } from 'react';
import type { ConfigScope } from './adminTypes';
import { systemConfigMeta } from './adminMeta';

type SectionItem<T extends string> = {
  id: T;
  label: string;
};

type SystemConfigHeaderProps<T extends string> = {
  scope: ConfigScope;
  badge: ReactNode;
  sections: Array<SectionItem<T>>;
  activeSection: T;
  onSwitchSection: (section: T) => void;
};

export function SystemConfigHeader<T extends string>({
  scope,
  badge,
  sections,
  activeSection,
  onSwitchSection,
}: SystemConfigHeaderProps<T>) {
  const meta = systemConfigMeta[scope];

  return (
    <section className="admin-section-card admin-system-config-card">
      <div className="admin-system-config-header">
        <div className="admin-system-config-title-group">
          <span className="admin-system-config-icon" data-scope={scope}>
            {meta.icon(20)}
          </span>
          <div className="admin-system-config-copy">
            <h3 className="admin-system-config-title">系统配置 · {meta.title}</h3>
            <p className="admin-system-config-summary">{meta.summary}</p>
          </div>
        </div>
        <span className="admin-system-config-badge">
          {badge}
        </span>
      </div>
      <div className="admin-system-config-tabs">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => onSwitchSection(section.id)}
            className="admin-system-config-tab"
            data-state={activeSection === section.id ? 'active' : 'idle'}
          >
            {section.label}
          </button>
        ))}
      </div>
    </section>
  );
}
