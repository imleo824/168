import { ChevronRight } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type SettingRowButtonProps = Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'className' | 'disabled' | 'onClick' | 'type'
> & {
  [key: `data-${string}`]: string | number | boolean | undefined;
};

interface SettingRowProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  iconClassName?: string;
  value?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  contentClassName?: string;
  valueClassName?: string;
  showChevron?: boolean;
  disabled?: boolean;
  active?: boolean;
  buttonProps?: SettingRowButtonProps;
}

export default function SettingRow({
  title,
  description,
  icon,
  iconClassName = '',
  value,
  trailing,
  onClick,
  className = '',
  titleClassName = '',
  descriptionClassName = '',
  contentClassName = '',
  valueClassName = '',
  showChevron = Boolean(onClick),
  disabled = false,
  active = false,
  buttonProps,
}: SettingRowProps) {
  const content = (
    <>
      <div className={`setting-row-content ${contentClassName}`.trim()}>
        {icon ? (
          <span className={`setting-row-icon ${iconClassName}`.trim()}>
            {icon}
          </span>
        ) : null}

        <span className="setting-row-copy">
          <span className={`setting-row-title ${titleClassName}`.trim()}>
            {title}
          </span>
          {description ? (
            <span className={`setting-row-description ${descriptionClassName}`.trim()}>
              {description}
            </span>
          ) : null}
        </span>
      </div>

      <span className="setting-row-trailing">
        {value ? <span className={`setting-row-value ${valueClassName}`.trim()}>{value}</span> : null}
        {trailing}
        {showChevron ? (
          <span className={`setting-row-chevron ${active ? 'is-active' : ''}`}>
            <ChevronRight aria-hidden="true" />
          </span>
        ) : null}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        {...buttonProps}
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`setting-row pressable ${className}`.trim()}
        aria-expanded={active || undefined}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`setting-row ${className}`.trim()}>
      {content}
    </div>
  );
}
