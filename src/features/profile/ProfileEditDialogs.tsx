import type { User } from "@/types";
import ActionButton from "@/ui/ActionButton";
import ProfileDialog from "@/features/profile/ProfileDialog";
import { normalizeTelegramContactHandle } from "@/utils/contact";
import { LOGIN_PASSWORD_MAX_LENGTH } from "@/features/profile/profileHelpers";

type ProfileEditDialogsProps = {
  user: User;
  isEditingLoginAccount: boolean;
  editLoginAccount: string;
  isSavingLoginAccount: boolean;
  onEditLoginAccount: (value: string) => void;
  onLoginAccountOpenChange: (open: boolean) => void;
  onSaveLoginAccount: () => void;
  isEditingDisplayName: boolean;
  editDisplayName: string;
  isSavingProfile: boolean;
  onEditDisplayName: (value: string) => void;
  onDisplayNameOpenChange: (open: boolean) => void;
  onSaveProfile: () => void;
  isEditingContact: boolean;
  editContact: string;
  hasTypedContactInput: boolean;
  hasInvalidEditingContact: boolean;
  isSavingContact: boolean;
  onEditContact: (value: string) => void;
  onContactOpenChange: (open: boolean) => void;
  onSaveContact: () => void;
  isEditingPassword: boolean;
  oldPassword: string;
  editPassword: string;
  confirmPassword: string;
  isSavingPassword: boolean;
  canSavePassword: boolean;
  onEditOldPassword: (value: string) => void;
  onEditPassword: (value: string) => void;
  onEditConfirmPassword: (value: string) => void;
  onPasswordOpenChange: (open: boolean) => void;
  onSavePassword: () => void;
  isEditingPaymentPassword: boolean;
  oldPaymentPassword: string;
  editPaymentPassword: string;
  confirmPaymentPassword: string;
  isSavingPaymentPassword: boolean;
  onEditOldPaymentPassword: (value: string) => void;
  onEditPaymentPassword: (value: string) => void;
  onEditConfirmPaymentPassword: (value: string) => void;
  onPaymentPasswordOpenChange: (open: boolean) => void;
  onSavePaymentPassword: () => void;
};

export default function ProfileEditDialogs({
  user,
  isEditingLoginAccount,
  editLoginAccount,
  isSavingLoginAccount,
  onEditLoginAccount,
  onLoginAccountOpenChange,
  onSaveLoginAccount,
  isEditingDisplayName,
  editDisplayName,
  isSavingProfile,
  onEditDisplayName,
  onDisplayNameOpenChange,
  onSaveProfile,
  isEditingContact,
  editContact,
  hasTypedContactInput,
  hasInvalidEditingContact,
  isSavingContact,
  onEditContact,
  onContactOpenChange,
  onSaveContact,
  isEditingPassword,
  oldPassword,
  editPassword,
  confirmPassword,
  isSavingPassword,
  canSavePassword,
  onEditOldPassword,
  onEditPassword,
  onEditConfirmPassword,
  onPasswordOpenChange,
  onSavePassword,
  isEditingPaymentPassword,
  oldPaymentPassword,
  editPaymentPassword,
  confirmPaymentPassword,
  isSavingPaymentPassword,
  onEditOldPaymentPassword,
  onEditPaymentPassword,
  onEditConfirmPaymentPassword,
  onPaymentPasswordOpenChange,
  onSavePaymentPassword,
}: ProfileEditDialogsProps) {
  const resetLoginAccount = () => {
    onLoginAccountOpenChange(false);
    onEditLoginAccount(user.loginAccount || "");
  };
  const resetDisplayName = () => {
    onDisplayNameOpenChange(false);
    onEditDisplayName(user.displayName || "");
  };
  const resetContact = () => {
    onContactOpenChange(false);
    onEditContact(normalizeTelegramContactHandle(user.contact || ""));
  };
  const resetPassword = () => {
    onPasswordOpenChange(false);
    onEditPassword("");
    onEditConfirmPassword("");
    onEditOldPassword("");
  };
  const resetPaymentPassword = () => {
    onPaymentPasswordOpenChange(false);
    onEditPaymentPassword("");
    onEditConfirmPaymentPassword("");
    onEditOldPaymentPassword("");
  };

  return (
    <>
      <ProfileDialog
        open={isEditingLoginAccount}
        title="修改登录账号"
        onClose={resetLoginAccount}
      >
        <input
          type="text"
          value={editLoginAccount}
          onChange={(e) => onEditLoginAccount(e.target.value)}
          className="profile-dialog-field"
          placeholder="请输入3-32位字母、数字或下划线账号"
          autoComplete="username"
          autoFocus
        />
        <div className="profile-dialog-actions">
          <ActionButton type="button" onClick={resetLoginAccount} disabled={isSavingLoginAccount} variant="muted">
            取消
          </ActionButton>
          <ActionButton
            type="button"
            onClick={onSaveLoginAccount}
            disabled={isSavingLoginAccount || !editLoginAccount.trim()}
            variant={editLoginAccount.trim() && !isSavingLoginAccount ? "brand" : "disabled"}
            className="ui-dialog-action-min"
          >
            {isSavingLoginAccount ? "保存中..." : "确认保存"}
          </ActionButton>
        </div>
      </ProfileDialog>

      <ProfileDialog
        open={isEditingDisplayName}
        title="修改昵称"
        onClose={resetDisplayName}
      >
        <input
          type="text"
          value={editDisplayName}
          onChange={(e) => onEditDisplayName(e.target.value)}
          className="profile-dialog-field"
          placeholder="请输入公开昵称"
          maxLength={40}
          autoFocus
        />
        <div className="profile-dialog-actions">
          <ActionButton type="button" onClick={resetDisplayName} disabled={isSavingProfile} variant="muted">
            取消
          </ActionButton>
          <ActionButton
            type="button"
            onClick={onSaveProfile}
            disabled={
              isSavingProfile ||
              !editDisplayName.trim() ||
              editDisplayName.trim() === (user.displayName || "")
            }
            variant={
              editDisplayName.trim() && editDisplayName.trim() !== (user.displayName || "") && !isSavingProfile
                ? "brand"
                : "disabled"
            }
            className="ui-dialog-action-min"
          >
            {isSavingProfile ? "保存中..." : "确认保存"}
          </ActionButton>
        </div>
      </ProfileDialog>

      <ProfileDialog
        open={isEditingContact && user.userType !== "ROBOT"}
        title="设置联系方式"
        onClose={resetContact}
      >
        <div className="profile-dialog-contact-field">
          <span className="profile-dialog-contact-prefix">@</span>
          <input
            type="text"
            value={editContact}
            onChange={(e) => onEditContact(e.target.value.replace(/@/g, "").replace(/[^a-zA-Z0-9_]/g, ""))}
            className="profile-dialog-contact-input"
            placeholder="请输入 Telegram 用户名"
            maxLength={32}
            autoFocus
          />
        </div>
        {hasInvalidEditingContact ? (
          <p className="profile-dialog-field-error">仅支持 Telegram 用户名：5-32位，字母开头，可含数字或下划线。</p>
        ) : null}
        <div className="profile-dialog-actions">
          <ActionButton type="button" onClick={resetContact} disabled={isSavingContact} variant="muted">
            取消
          </ActionButton>
          <ActionButton
            type="button"
            onClick={onSaveContact}
            disabled={isSavingContact || !hasTypedContactInput || hasInvalidEditingContact}
            variant={hasTypedContactInput && !hasInvalidEditingContact && !isSavingContact ? "brand" : "disabled"}
            className="ui-dialog-action-min"
          >
            {isSavingContact ? "保存中..." : "确认保存"}
          </ActionButton>
        </div>
      </ProfileDialog>

      <ProfileDialog
        open={isEditingPassword}
        title={Boolean(user.hasPassword) ? "修改登录密码" : "设置登录密码"}
        onClose={resetPassword}
        scrollable
      >
        <div className="profile-dialog-field-stack">
          {Boolean(user.hasPassword) && (
            <div>
              <label className="profile-dialog-field-label">原始密码</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => onEditOldPassword(e.target.value)}
                className="profile-dialog-field"
                placeholder="原密码"
                maxLength={128}
                autoFocus
              />
            </div>
          )}

          <div>
            <label className="profile-dialog-field-label">
              {Boolean(user.hasPassword) ? "新密码" : "登录密码"}
            </label>
            <input
              type="password"
              value={editPassword}
              onChange={(e) => onEditPassword(e.target.value)}
              className="profile-dialog-field"
              placeholder="至少 8 位的新密码"
              maxLength={LOGIN_PASSWORD_MAX_LENGTH}
              autoFocus={!Boolean(user.hasPassword)}
            />
          </div>

          <div>
            <label className="profile-dialog-field-label">确认密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => onEditConfirmPassword(e.target.value)}
              className="profile-dialog-field"
              placeholder="请再次输入以确认"
              maxLength={128}
            />
          </div>
        </div>

        <div className="profile-dialog-actions">
          <ActionButton type="button" onClick={resetPassword} disabled={isSavingPassword} variant="muted">
            取消
          </ActionButton>
          <ActionButton
            type="button"
            onClick={onSavePassword}
            disabled={isSavingPassword || !canSavePassword}
            variant={canSavePassword && !isSavingPassword ? "brand" : "disabled"}
            className="ui-dialog-action-min"
          >
            {isSavingPassword ? "保存中..." : "确认保存"}
          </ActionButton>
        </div>
      </ProfileDialog>

      <ProfileDialog
        open={isEditingPaymentPassword}
        title={user.hasPaymentPassword ? "修改支付密码" : "设置支付密码"}
        onClose={resetPaymentPassword}
        scrollable
      >
        <div className="profile-dialog-field-stack">
          {user.hasPaymentPassword && (
            <div>
              <label className="profile-dialog-field-label">原支付密码</label>
              <input
                type="password"
                inputMode="numeric"
                value={oldPaymentPassword}
                onChange={(e) => onEditOldPaymentPassword(e.target.value)}
                className="profile-dialog-field"
                placeholder="原支付密码"
                autoFocus
              />
            </div>
          )}

          <div>
            <label className="profile-dialog-field-label">新支付密码</label>
            <input
              type="password"
              inputMode="numeric"
              value={editPaymentPassword}
              onChange={(e) => onEditPaymentPassword(e.target.value)}
              className="profile-dialog-field"
              placeholder="至少 6 位"
              autoFocus={!user.hasPaymentPassword}
            />
          </div>

          <div>
            <label className="profile-dialog-field-label">确认支付密码</label>
            <input
              type="password"
              inputMode="numeric"
              value={confirmPaymentPassword}
              onChange={(e) => onEditConfirmPaymentPassword(e.target.value)}
              className="profile-dialog-field"
              placeholder="再次输入"
            />
          </div>
        </div>

        <div className="profile-dialog-actions">
          <ActionButton type="button" onClick={resetPaymentPassword} disabled={isSavingPaymentPassword} variant="muted">
            取消
          </ActionButton>
          <ActionButton
            type="button"
            onClick={onSavePaymentPassword}
            disabled={
              isSavingPaymentPassword ||
              (user.hasPaymentPassword && !oldPaymentPassword.trim()) ||
              !editPaymentPassword.trim() ||
              editPaymentPassword.trim().length < 6 ||
              !confirmPaymentPassword.trim() ||
              editPaymentPassword.trim() !== confirmPaymentPassword.trim() ||
              (user.hasPaymentPassword && editPaymentPassword.trim() === oldPaymentPassword.trim())
            }
            variant={
              editPaymentPassword.trim() &&
              confirmPaymentPassword.trim() &&
              editPaymentPassword.trim() === confirmPaymentPassword.trim() &&
              (!user.hasPaymentPassword || oldPaymentPassword.trim()) &&
              (!user.hasPaymentPassword || editPaymentPassword.trim() !== oldPaymentPassword.trim()) &&
              !isSavingPaymentPassword
                ? "brand"
                : "disabled"
            }
            className="ui-dialog-action-min"
          >
            {isSavingPaymentPassword ? "保存中..." : "确认保存"}
          </ActionButton>
        </div>
      </ProfileDialog>
    </>
  );
}
