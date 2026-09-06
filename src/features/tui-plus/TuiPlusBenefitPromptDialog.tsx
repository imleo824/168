import { Crown } from 'lucide-react';
import '@/styles/features/tui-plus.css';

import ProfileDialog from '@/features/profile/ProfileDialog';
import ActionButton from '@/ui/ActionButton';
import { getTuiPlusBenefitCopy, type TuiPlusBenefitKey } from './tuiPlusBenefits';

type TuiPlusBenefitPromptDialogProps = {
  open: boolean;
  benefit?: TuiPlusBenefitKey;
  onClose: () => void;
  onConfirm: () => void;
};

export default function TuiPlusBenefitPromptDialog({
  open,
  benefit = 'generic',
  onClose,
  onConfirm,
}: TuiPlusBenefitPromptDialogProps) {
  const copy = getTuiPlusBenefitCopy(benefit);

  return (
    <ProfileDialog
      open={open}
      title={copy.title}
      onClose={onClose}
      className="tui-plus-benefit-prompt-dialog"
      footer={(
        <div className="tui-plus-benefit-prompt-actions">
          <ActionButton type="button" variant="muted" size="sm" onClick={onClose}>
            {copy.cancelLabel}
          </ActionButton>
          <ActionButton type="button" variant="brand" size="sm" onClick={onConfirm}>
            {copy.confirmLabel}
          </ActionButton>
        </div>
      )}
    >
      <div className="tui-plus-benefit-prompt-detail">
        <p className="tui-plus-benefit-prompt-copy">
          <Crown aria-hidden="true" />
          <span>{copy.detail}</span>
        </p>
      </div>
    </ProfileDialog>
  );
}
