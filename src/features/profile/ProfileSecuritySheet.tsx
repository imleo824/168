import { useCallback, useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ShieldCheck, X } from 'lucide-react';
import AvatarImage from '@/ui/AvatarImage';
import SettingRow from '@/ui/SettingRow';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { subscribeProfileSettingsOpen } from './profileSettingsIntent';

type ProfileSecuritySheetProps = {
  open: boolean;
  user: any;
  avatarUrl: string;
  isAvatarUpdating: boolean;
  avatarInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onEditDisplayName: (value: string) => void;
  onOpenDisplayNameEditor: () => void;
  onEditLoginAccount: (value: string) => void;
  onOpenLoginAccountEditor: () => void;
  onResetPasswordFields: () => void;
  onOpenPasswordEditor: () => void;
  onResetPaymentPasswordFields: () => void;
  onOpenPaymentPasswordEditor: () => void;
  onEditContact?: (value: string) => void;
  onOpenContactEditor?: () => void;
  onLogout: () => void;
};

const PROFILE_SECURITY_SHEET_ROOT_ID = 'profile-security-sheet-root';

function getProfileSecuritySheetRoot() {
  if (typeof document === 'undefined') return null;

  let root = document.getElementById(PROFILE_SECURITY_SHEET_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = PROFILE_SECURITY_SHEET_ROOT_ID;
    document.body.appendChild(root);
  }

  return root;
}

export default function ProfileSecuritySheet({
  open,
  user,
  avatarUrl,
  isAvatarUpdating,
  avatarInputRef,
  onClose,
  onEditDisplayName,
  onOpenDisplayNameEditor,
  onEditLoginAccount,
  onOpenLoginAccountEditor,
  onResetPasswordFields,
  onOpenPasswordEditor,
  onResetPaymentPasswordFields,
  onOpenPaymentPasswordEditor,
  onLogout,
}: ProfileSecuritySheetProps) {
  const [isIntentOpen, setIsIntentOpen] = useState(false);
  const isOpen = open || isIntentOpen;

  useEffect(() => subscribeProfileSettingsOpen(() => setIsIntentOpen(true)), []);

  const closeSheet = useCallback(() => {
    setIsIntentOpen(false);
    onClose();
  }, [onClose]);

  const handleLogout = useCallback(() => {
    setIsIntentOpen(false);
    onLogout();
  }, [onLogout]);
  const handleAvatarClick = useCallback(() => {
    avatarInputRef.current?.click();
  }, [avatarInputRef]);
  const openDisplayNameEditor = useCallback(() => {
    closeSheet();
    onEditDisplayName(user?.displayName || '');
    onOpenDisplayNameEditor();
  }, [closeSheet, onEditDisplayName, onOpenDisplayNameEditor, user?.displayName]);
  const openLoginAccountEditor = useCallback(() => {
    closeSheet();
    onEditLoginAccount(user?.loginAccount || '');
    onOpenLoginAccountEditor();
  }, [closeSheet, onEditLoginAccount, onOpenLoginAccountEditor, user?.loginAccount]);
  const openPasswordEditor = useCallback(() => {
    onResetPasswordFields();
    closeSheet();
    onOpenPasswordEditor();
  }, [closeSheet, onOpenPasswordEditor, onResetPasswordFields]);
  const openPaymentPasswordEditor = useCallback(() => {
    onResetPaymentPasswordFields();
    closeSheet();
    onOpenPaymentPasswordEditor();
  }, [closeSheet, onOpenPaymentPasswordEditor, onResetPaymentPasswordFields]);
  const { guarded: guardedAvatarClick } = useInteractionGuard(handleAvatarClick, {
    policy: 'instant',
    cooldownMs: 520,
    mode: 'drop',
  });
  const { guarded: guardedOpenDisplayNameEditor } = useInteractionGuard(openDisplayNameEditor, 520);
  const { guarded: guardedOpenLoginAccountEditor } = useInteractionGuard(openLoginAccountEditor, 520);
  const { guarded: guardedOpenPasswordEditor } = useInteractionGuard(openPasswordEditor, 520);
  const { guarded: guardedOpenPaymentPasswordEditor } = useInteractionGuard(openPaymentPasswordEditor, 520);
  const { guarded: guardedLogout } = useInteractionGuard(handleLogout, {
    policy: 'critical',
    cooldownMs: 720,
    minPendingMs: 120,
    mode: 'drop',
  });

  if (!isOpen) return null;

  const sheet = (
    <div className="profile-security-overlay">
      <div
        onClick={closeSheet}
        className="ui-modal-scrim ui-modal-scrim-soft profile-security-scrim"
      />
      <div
        className="ui-layer-panel account-info-sheet"
      >
        <div className="ui-layer-panel-header account-info-header">
          <div className="account-info-header-title">
            <ShieldCheck className="account-info-header-icon" aria-hidden="true" />
            <h3 className="ui-layer-panel-title">编辑主页</h3>
          </div>
          <button
            type="button"
            onClick={closeSheet}
            className="ui-layer-close-action ui-icon-action"
            aria-label="关闭编辑主页"
          >
            <X className="account-info-close-icon ui-icon-action-glyph" aria-hidden="true" />
          </button>
        </div>

        <div className="account-info-list">
          <div className="account-info-row account-info-row-avatar ui-control">
            <div className="account-info-avatar-row">
              <button
                type="button"
                onClick={() => void guardedAvatarClick()}
                disabled={isAvatarUpdating}
                className="account-info-avatar-action pressable ui-avatar-action"
                aria-label="更换头像"
              >
                <AvatarImage
                  src={avatarUrl}
                  name={user?.displayName}
                  id={user?.id}
                  alt={`${user?.displayName || '用户'}的个人头像`}
                  className="account-info-avatar-image relative z-0"
                  variant="thumb"
                />
              </button>
              <div className="account-info-avatar-copy">
                <div className="account-info-label">头像</div>
                <div className="account-info-hint">
                  点击头像可直接更换图片
                </div>
              </div>
            </div>
          </div>

          <SettingRow
            className="account-info-row ui-control"
            title="显示昵称"
            titleClassName="account-info-label"
            description={<span className="account-info-value account-info-value--truncate">{user?.displayName || '未设置'}</span>}
            descriptionClassName="ui-description-clamp"
            showChevron={false}
            trailing={
              <button
                type="button"
                onClick={() => void guardedOpenDisplayNameEditor()}
                className="pressable ui-action ui-action-sm ui-action-muted account-info-action"
              >
                修改
              </button>
            }
          />

          <SettingRow
            className="account-info-row ui-control"
            title="登录账号"
            titleClassName="account-info-label"
            description={<span className="account-info-value">{user?.loginAccount || '未设置'}</span>}
            showChevron={false}
            trailing={
              <button
                type="button"
                onClick={() => void guardedOpenLoginAccountEditor()}
                className="pressable ui-action ui-action-sm ui-action-muted account-info-action"
              >
                修改
              </button>
            }
          />

          <SettingRow
            className="account-info-row ui-control"
            title="安全密码"
            titleClassName="account-info-label"
            description={
              <span className="account-info-status">
                {Boolean(user?.hasPassword) ? (
                  <span className="account-info-status-state account-info-status-state--success">
                    <CheckCircle2 className="account-info-status-icon" aria-hidden="true" /> 保护中
                  </span>
                ) : (
                  <span className="account-info-status-state account-info-status-state--warning">
                    <ShieldCheck className="account-info-status-icon" aria-hidden="true" /> 待加固
                  </span>
                )}
              </span>
            }
            showChevron={false}
            trailing={
              <button
                type="button"
                onClick={() => void guardedOpenPasswordEditor()}
                className="pressable ui-action ui-action-sm ui-action-muted account-info-action"
              >
                修改
              </button>
            }
          />

          <SettingRow
            className="account-info-row ui-control"
            title="支付密码"
            titleClassName="account-info-label"
            description={
              <span className="account-info-status">
                {user?.hasPaymentPassword ? (
                  <span className="account-info-status-state account-info-status-state--success">
                    <CheckCircle2 className="account-info-status-icon" aria-hidden="true" /> 已设置
                  </span>
                ) : (
                  <span className="account-info-status-state account-info-status-state--warning">
                    <ShieldCheck className="account-info-status-icon" aria-hidden="true" /> 待设置
                  </span>
                )}
              </span>
            }
            showChevron={false}
            trailing={
              <button
                type="button"
                onClick={() => void guardedOpenPaymentPasswordEditor()}
                className="pressable ui-action ui-action-sm ui-action-muted account-info-action"
              >
                修改
              </button>
            }
          />

          <SettingRow
            className="account-info-row ui-control"
            title="退出登录"
            titleClassName="account-info-label"
            description={
              <span className="account-info-status account-info-status--strong">
                <CheckCircle2 className="account-info-status-icon account-info-status-icon--success" aria-hidden="true" />
                <span>登录中</span>
              </span>
            }
            descriptionClassName="ui-description-clamp"
            showChevron={false}
            trailing={
              <button
                type="button"
                className="pressable ui-action ui-action-sm ui-action-muted account-info-action"
                onClick={() => void guardedLogout()}
              >
                <span>退出</span>
              </button>
            }
          />
        </div>

        <div className="account-info-footnote">
          * 请妥善保管账号与密码。
        </div>
      </div>
    </div>
  );

  const root = getProfileSecuritySheetRoot();
  return root ? createPortal(sheet, root) : sheet;
}
