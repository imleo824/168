import { memo, type CSSProperties, type ReactNode } from 'react';

export type SegmentTabItem = {
  key: string;
  label: string;
  meta?: string | number;
  icon?: ReactNode;
  disabled?: boolean;
};

export type SegmentTabsVariant = 'default' | 'underline';

interface SegmentTabsProps {
  items: SegmentTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  ariaLabel: string;
  className?: string;
  showLabels?: boolean;
  labelDisplay?: 'truncate' | 'full';
  variant?: SegmentTabsVariant;
}

function getClassSet(className?: string) {
  return new Set(String(className || '').split(/\s+/).filter(Boolean));
}

function shouldShowLabels(className?: string, explicitShowLabels?: boolean) {
  if (typeof explicitShowLabels === 'boolean') return explicitShowLabels;
  return !getClassSet(className).has('profile-tabbar');
}

function resolveSegmentVariant(className?: string, explicitVariant: SegmentTabsVariant = 'default') {
  if (explicitVariant !== 'default') return explicitVariant;
  return getClassSet(className).has('ui-page-tabs-bar') ? 'underline' : 'default';
}

function SegmentTabs({
  items,
  activeKey,
  onChange,
  ariaLabel,
  className,
  showLabels,
  labelDisplay = 'truncate',
  variant = 'default',
}: SegmentTabsProps) {
  const resolvedShowLabels = shouldShowLabels(className, showLabels);
  const resolvedVariant = resolveSegmentVariant(className, variant);
  const labelClassName = labelDisplay === 'full'
    ? 'ui-segment-tab-label ui-segment-tab-label--full'
    : 'ui-segment-tab-label';
  const tabsStyle = {
    '--segment-tab-count': Math.max(1, items.length),
  } as CSSProperties & Record<'--segment-tab-count', number>;

  return (
    <div
      className={`ui-segment-tabs ${className || ''}`}
      data-segment-variant={resolvedVariant}
      style={tabsStyle}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-label={item.label}
            title={resolvedShowLabels ? undefined : item.label}
            aria-selected={active}
            aria-pressed={active}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) onChange(item.key);
            }}
            className="ui-segment-tab pressable"
            data-labels={resolvedShowLabels ? 'visible' : 'hidden'}
          >
            {item.icon ? (
              <span className="ui-segment-tab-icon" aria-hidden="true">{item.icon}</span>
            ) : null}
            {resolvedShowLabels ? (
              <span className={labelClassName}>{item.label}</span>
            ) : null}
            {item.meta !== undefined ? (
              <span className="ui-segment-tab-meta">{item.meta}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default memo(SegmentTabs);
