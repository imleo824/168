import { ExternalLink } from 'lucide-react';
import BottomSheet from '@/ui/BottomSheet';
import ActionButton from '@/ui/ActionButton';

export interface TelegramSyncConfirmSheetPanelProps {
  open: boolean;
  channelUrl?: string | null;
  isSubmitting: boolean;
  isInsufficientBalance: boolean;
  telegramSyncPrice?: number;
  onConfirm: () => void;
  onClose: () => void;
}

function normalizeChannelUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:\/\/|tg:\/\/)/i.test(raw)) return raw;
  return '';
}

export default function TelegramSyncConfirmSheetPanel({
  open,
  channelUrl,
  isSubmitting,
  isInsufficientBalance,
  telegramSyncPrice,
  onConfirm,
  onClose,
}: TelegramSyncConfirmSheetPanelProps) {
  const safeChannelUrl = normalizeChannelUrl(channelUrl);
  const normalizedPrice = Number.isFinite(telegramSyncPrice as number)
    ? Math.max(0, Math.floor(telegramSyncPrice as number))
    : 0;
  const copy = normalizedPrice > 0
    ? `需消耗${normalizedPrice}积分，确认后会发布到官方飞机频道，成功发送后该帖子不能再次同步。`
    : '确认后会发布到官方飞机频道，成功发送后该帖子不能再次同步。';

  return (
    <BottomSheet
      open={open}
      title="同步到频道"
      ariaLabel="同步到频道确认"
      onClose={onClose}
      overlayClassName="ui-sheet-overlay-contact"
      panelClassName="ui-sheet-panel telegram-sync-confirm-sheet"
      bodyClassName="telegram-sync-confirm-body"
      closeClassName="quiet-button ui-icon-action telegram-sync-confirm-close"
      showHandle
      footer={(
        <div className="telegram-sync-confirm-actions">
          <ActionButton
            type="button"
            variant="muted"
            onClick={onClose}
            disabled={isSubmitting}
          >
            取消
          </ActionButton>
          <ActionButton
            type="button"
            variant="brand"
            onClick={onConfirm}
            disabled={isSubmitting || isInsufficientBalance}
            aria-busy={isSubmitting || undefined}
          >
            {isSubmitting ? '提交中' : '确认同步'}
          </ActionButton>
        </div>
      )}
    >
      <div className="telegram-sync-confirm-copy">
        <p>{copy}</p>
        {safeChannelUrl ? (
          <a
            href={safeChannelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="telegram-sync-confirm-channel-link"
          >
            <span>查看频道</span>
            <ExternalLink aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </BottomSheet>
  );
}
