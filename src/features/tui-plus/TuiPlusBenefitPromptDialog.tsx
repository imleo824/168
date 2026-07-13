import { Crown } from 'lucide-react';

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
      description={copy.description}
      onClose={onClose}
      className="tui-plus-benefit-prompt-dialog"
      footer={(
        <div className="post-create-dialog-actions">
          <ActionButton type="button" variant="muted" size="sm" onClick={onClose}>
            {copy.cancelLabel}
          </ActionButton>
          <ActionButton type="button" variant="brand" size="sm" onClick={onConfirm}>
            {copy.confirmLabel}
          </ActionButton>
        </div>
      )}
    >
      <div className="post-create-stable-focus" data-post-create-stable-focus="true">
        <p className="post-create-option-hint">
          <Crown aria-hidden="true" />
          <span>{copy.detail}</span>
        </p>
      </div>
    </ProfileDialog>
  );
}
