import { Copy } from 'lucide-react';

import { formatRecordId } from './recordDisplay';

type RecordIdRowProps = {
  label: string;
  value: string;
  onCopy?: (value: string) => void;
  className?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function RecordIdRow({ label, value, onCopy, className }: RecordIdRowProps) {
  if (!value) return null;

  return (
    <div className={cx('record-id-row', className)}>
      <span className="record-id-value">
        {label}：<span className="record-id-token">{formatRecordId(value)}</span>
      </span>
      {onCopy ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onCopy(value);
          }}
          className="record-id-copy pressable"
          aria-label={`复制${label}`}
        >
          <Copy className="record-id-copy-icon" />
        </button>
      ) : null}
    </div>
  );
}
