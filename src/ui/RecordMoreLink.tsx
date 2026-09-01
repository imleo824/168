import { ChevronRight } from 'lucide-react';

export default function RecordMoreLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ui-record-more-link pressable">
      <span>{label}</span>
      <ChevronRight className="ui-record-more-link-icon" aria-hidden="true" />
    </button>
  );
}
