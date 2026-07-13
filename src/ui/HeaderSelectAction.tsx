import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

export type HeaderSelectActionOption<TValue extends string = string> = {
  value: TValue;
  label: string;
};

interface HeaderSelectActionProps<TValue extends string = string> {
  value: TValue;
  options: Array<HeaderSelectActionOption<TValue>>;
  onChange: (value: TValue) => void;
  ariaLabel: string;
  className?: string;
  selectClassName?: string;
}

export default function HeaderSelectAction<TValue extends string = string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  selectClassName = '',
}: HeaderSelectActionProps<TValue>) {
  return (
    <label className={cn('record-header-control-wrap ui-header-select-action ui-topbar-select-action', className)}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
        className={cn('record-header-select ui-header-select-action-control ui-topbar-compact-action', selectClassName)}
        aria-label={ariaLabel}
      >
        {options.map((item) => (
          <option key={item.value || 'ALL'} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <ChevronDown className="record-header-caret ui-header-select-action-caret" aria-hidden="true" />
    </label>
  );
}
