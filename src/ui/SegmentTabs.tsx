import { memo, useCallback, useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { useInstantPress } from '@/hooks/useInstantPress';

export type SegmentTabItem = {
  key?: string;
  id?: string;
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

function centerTabIfNeeded(tabList: HTMLElement | null, activeButton: HTMLElement | null) {
  if (!tabList || !activeButton) return;
  const listRect = tabList.getBoundingClientRect();
  const buttonRect = activeButton.getBoundingClientRect();
  if (listRect.width <= 0 || buttonRect.width <= 0) return;

  const safeInset = Math.min(listRect.width * 0.22, Math.max(0, (listRect.width - buttonRect.width) / 2));
  const safeLeft = listRect.left + safeInset;
  const safeRight = listRect.right - safeInset;
  const isComfortablyVisible = buttonRect.left >= safeLeft && buttonRect.right <= safeRight;
  if (isComfortablyVisible) return;

  const nextScrollLeft = tabList.scrollLeft +
    (buttonRect.left - listRect.left) -
    ((listRect.width - buttonRect.width) / 2);

  tabList.scrollTo({
    left: Math.max(0, nextScrollLeft),
    behavior: 'smooth',
  });
}

interface SegmentTabButtonProps {
  item: SegmentTabItem;
  itemKey: string;
  active: boolean;
  showLabels: boolean;
  labelClassName: string;
  buttonRef?: Ref<HTMLButtonElement>;
  onSelect: (key: string) => void;
  onNavigate: (key: string, direction: 'next' | 'previous' | 'first' | 'last') => void;
}

const SegmentTabButton = memo(function SegmentTabButton({
  item,
  itemKey,
  active,
  showLabels,
  labelClassName,
  buttonRef,
  onSelect,
  onNavigate,
}: SegmentTabButtonProps) {
  const pressHandlers = useInstantPress<HTMLButtonElement>(() => {
    if (!item.disabled) onSelect(itemKey);
  });

  return (
    <button
      type="button"
      {...pressHandlers}
      ref={buttonRef}
      role="tab"
      aria-label={item.label}
      title={showLabels ? undefined : item.label}
      aria-selected={active}
      aria-pressed={active}
      data-active={active ? 'true' : 'false'}
      data-topic={itemKey}
      disabled={item.disabled}
      className={`home-topic-tab ui-segment-tab pressable ${
        active ? 'home-topic-tab--active ui-segment-tab--active' : 'home-topic-tab--idle ui-segment-tab--idle'
      }`}
      data-labels={showLabels ? 'visible' : 'hidden'}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onNavigate(itemKey, 'next');
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onNavigate(itemKey, 'previous');
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          onNavigate(itemKey, event.key === 'Home' ? 'first' : 'last');
        }
      }}
    >
      {item.icon ? (
        <span className="ui-segment-tab-icon" aria-hidden="true">{item.icon}</span>
      ) : null}
      {showLabels ? (
        <span className={`home-topic-tab-label ${labelClassName}`}>{item.label}</span>
      ) : null}
      {item.meta !== undefined ? (
        <span className="ui-segment-tab-meta">{item.meta}</span>
      ) : null}
    </button>
  );
});

function SegmentTabs({
  items,
  activeKey,
  onChange,
  ariaLabel,
  className,
  showLabels = true,
  labelDisplay = 'truncate',
  variant = 'default',
}: SegmentTabsProps) {
  const tabsListRef = useRef<HTMLDivElement | null>(null);
  const activeTabButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const frame = window.requestAnimationFrame(() => {
      centerTabIfNeeded(tabsListRef.current, activeTabButtonRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeKey]);

  const labelClassName = labelDisplay === 'full'
    ? 'ui-segment-tab-label ui-segment-tab-label--full'
    : 'ui-segment-tab-label';
  const tabsStyle = {
    '--segment-tab-count': Math.max(1, items.length),
  } as CSSProperties & Record<'--segment-tab-count', number>;
  const handleNavigate = useCallback((currentKey: string, direction: 'next' | 'previous' | 'first' | 'last') => {
    const enabledItems = items.filter((item) => !item.disabled);
    if (enabledItems.length === 0) return;
    const currentIndex = enabledItems.findIndex((item) => (item.key || item.id || '') === currentKey);
    const nextIndex = direction === 'first'
      ? 0
      : direction === 'last'
        ? enabledItems.length - 1
        : currentIndex < 0
          ? 0
          : (currentIndex + (direction === 'next' ? 1 : -1) + enabledItems.length) % enabledItems.length;
    const nextItem = enabledItems[nextIndex];
    const nextKey = nextItem.key || nextItem.id || '';
    if (!nextKey) return;
    onChange(nextKey);
    window.requestAnimationFrame(() => {
      tabsListRef.current?.querySelector<HTMLButtonElement>(`[data-topic="${CSS.escape(nextKey)}"]`)?.focus();
    });
  }, [items, onChange]);

  return (
    <div
      ref={tabsListRef}
      className={`home-topic-tabs-list ui-segment-tabs ${className || ''}`}
      data-segment-variant={variant}
      data-segment-labels={showLabels ? 'visible' : 'hidden'}
      style={tabsStyle}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const itemKey = item.key || item.id || '';
        const active = itemKey === activeKey;
        return (
          <SegmentTabButton
            key={itemKey}
            item={item}
            itemKey={itemKey}
            active={active}
            showLabels={showLabels}
            labelClassName={labelClassName}
            buttonRef={active ? activeTabButtonRef : undefined}
            onSelect={onChange}
            onNavigate={handleNavigate}
          />
        );
      })}
    </div>
  );
}

export default memo(SegmentTabs);
