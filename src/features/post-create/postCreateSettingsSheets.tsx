import { Pencil } from 'lucide-react';

import ActionButton from '@/ui/ActionButton';
import AppPage from '@/ui/AppPage';
import BottomSheet from '@/ui/BottomSheet';
import PageContentShell from '@/ui/PageContentShell';
import PageHeader from '@/ui/PageHeader';

import { POST_CREATE_SETTINGS_LABEL } from './postCreateConstants';
import { PostCreateSwitch } from './postCreateComponents';

export function PostCreatePrivacySettingsSheet({
  open,
  isPublicPublish,
  onClose,
  onTogglePublicPublish,
}: {
  open: boolean;
  isPublicPublish: boolean;
  onClose: () => void;
  onTogglePublicPublish: () => void;
}) {
  return (
    <BottomSheet
      open={open}
      title={POST_CREATE_SETTINGS_LABEL}
      ariaLabel={POST_CREATE_SETTINGS_LABEL}
      onClose={onClose}
      overlayClassName="ui-sheet-overlay-contact"
      panelClassName="ui-sheet-panel post-create-sheet post-create-contact-sheet post-create-contact-picker-sheet"
      headerClassName="mb-3"
      bodyClassName="post-create-sheet-stack"
      closeClassName="quiet-button ui-icon-action post-create-sheet-close"
      lockScrollFixed={false}
      showHandle
    >
      <PostCreatePrivacySettingsContent
        isPublicPublish={isPublicPublish}
        onTogglePublicPublish={onTogglePublicPublish}
      />
    </BottomSheet>
  );
}

export function PostCreatePrivacySettingsContent({
  isPublicPublish,
  onTogglePublicPublish,
}: {
  isPublicPublish: boolean;
  onTogglePublicPublish: () => void;
}) {
  return (
    <div data-post-create-stable-focus="true" className="post-create-stable-focus post-create-settings-list">
      <button
        type="button"
        role="switch"
        aria-checked={isPublicPublish}
        onClick={onTogglePublicPublish}
        className="post-create-settings-row"
      >
        <span className="post-create-settings-copy">
          <span className="post-create-settings-title">公开身份发布</span>
          <span className="post-create-settings-value">{isPublicPublish ? '公开（展示昵称与头像）' : '匿名（隐藏个人信息）'}</span>
        </span>
        <PostCreateSwitch checked={isPublicPublish} />
      </button>
    </div>
  );
}

export function PostCreateTelegramSettingsSheet({
  open,
  isRobotUser,
  showContactButton,
  customContact,
  contactDisplay,
  isTuiPlusContactUnlimited,
  onClose,
  onToggleContactButton,
  onOpenContactEditor,
}: {
  open: boolean;
  isRobotUser: boolean;
  showContactButton: boolean;
  customContact: string;
  contactDisplay: string;
  isTuiPlusContactUnlimited: boolean;
  onClose: () => void;
  onToggleContactButton: () => void;
  onOpenContactEditor: () => void;
}) {
  void isTuiPlusContactUnlimited;
  return (
    <BottomSheet
      open={open}
      title="联系方式设置"
      ariaLabel="联系方式设置"
      onClose={onClose}
      overlayClassName="ui-sheet-overlay-contact"
      panelClassName="ui-sheet-panel post-create-sheet post-create-contact-sheet post-create-contact-picker-sheet"
      headerClassName="mb-3"
      bodyClassName="post-create-sheet-stack"
      closeClassName="quiet-button ui-icon-action post-create-sheet-close"
      lockScrollFixed={false}
      showHandle
    >
      <PostCreateContactSettingsContent
        isRobotUser={isRobotUser}
        showContactButton={showContactButton}
        customContact={customContact}
        contactDisplay={contactDisplay}
        onToggleContactButton={onToggleContactButton}
        onOpenContactEditor={onOpenContactEditor}
      />
    </BottomSheet>
  );
}

export function PostCreateContactSettingsContent({
  isRobotUser,
  showContactButton,
  customContact,
  contactDisplay,
  onToggleContactButton,
  onOpenContactEditor,
}: {
  isRobotUser: boolean;
  showContactButton: boolean;
  customContact: string;
  contactDisplay: string;
  onToggleContactButton: () => void;
  onOpenContactEditor: () => void;
}) {
  return (
    <div data-post-create-stable-focus="true" className="post-create-stable-focus post-create-settings-list">
      {!isRobotUser ? (
        <button
          type="button"
          role="switch"
          aria-checked={showContactButton}
          onClick={showContactButton ? onToggleContactButton : onOpenContactEditor}
          className={`post-create-settings-row${showContactButton ? ' post-create-settings-row--before-followup' : ''}`}
        >
          <span className="post-create-settings-copy">
            <span className="post-create-settings-title">在帖子中展示联系按钮</span>
            <span className="post-create-settings-value">{showContactButton ? '已开启' : '已关闭'}</span>
          </span>
          <PostCreateSwitch checked={showContactButton} />
        </button>
      ) : null}

      {!isRobotUser && showContactButton ? (
        <button
          type="button"
          onClick={onOpenContactEditor}
          className="post-create-settings-row post-create-settings-row--link"
        >
          <span className="post-create-settings-copy">
            <span className="post-create-settings-title">Telegram 账号</span>
            <span className={`post-create-settings-value ${
              customContact ? 'post-create-settings-value-filled' : 'post-create-settings-value-error'
            }`}>
              {customContact ? contactDisplay : '未设置（点击添加）'}
            </span>
          </span>
          <span className="post-create-edit-icon" aria-hidden="true">
            <Pencil className="post-create-edit-icon-graphic" />
          </span>
        </button>
      ) : null}

    </div>
  );
}

export function PostCreateContactEditorDialog({
  open,
  editContact,
  hasInvalidEditingContact,
  isSavingContact,
  onEditContactChange,
  onClose,
  onSave,
}: {
  open: boolean;
  editContact: string;
  hasInvalidEditingContact: boolean;
  isSavingContact: boolean;
  onEditContactChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return (
    <AppPage className="post-create-page post-create-contact-editor-page" bottomSafe>
      <PageHeader
        title="设置 Telegram 账号"
        showBack
        onBack={onClose}
        right={(
          <ActionButton
            type="button"
            variant="brand"
            size="header"
            onClick={onSave}
            disabled={isSavingContact || hasInvalidEditingContact}
            state={isSavingContact ? 'loading' : isSavingContact || hasInvalidEditingContact ? 'disabled' : 'idle'}
            className="post-create-contact-editor-save"
          >
            保存
          </ActionButton>
        )}
      />
      <PageContentShell bottomSafe className="post-create-contact-editor-main ui-app-page-main">
        <section data-post-create-stable-focus="true" className="post-create-stable-focus post-create-contact-editor-card">
          <div className="post-create-contact-editor-copy">
            <h2>设置 Telegram 账号</h2>
            <p>保存后，帖子底部将展示专属联系按钮，方便感兴趣的读者直接与你沟通。</p>
          </div>

          <label className="post-create-contact-editor-field">
            <span className="post-create-contact-editor-label">Telegram 用户名</span>
            <span className="post-create-contact-input-wrap">
              <span className="post-create-contact-prefix">@</span>
              <input
                autoFocus
                value={editContact}
                onChange={(event) => onEditContactChange(event.target.value)}
                placeholder="your_username"
                className="post-create-contact-input"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </span>
          </label>

          {hasInvalidEditingContact ? (
            <p className="post-create-option-error">
              格式错误：Telegram 用户名为 5-32 位，需以字母开头，可包含数字与下划线
            </p>
          ) : (
            <p className="post-create-option-hint">
              支持 5-32 位字母、数字与下划线，无需输入 @ 符号
            </p>
          )}
        </section>
      </PageContentShell>
    </AppPage>
  );
}

export function PostCreatePromoteChoiceSheet({
  open,
  onSkip,
  onGoPromote,
}: {
  open: boolean;
  onSkip: () => void;
  onGoPromote: () => void;
}) {
  return (
    <BottomSheet
      open={open}
      title="发布成功"
      ariaLabel="发布成功"
      onClose={onSkip}
      overlayClassName="ui-sheet-overlay-contact"
      panelClassName="ui-sheet-panel post-create-sheet post-create-contact-sheet post-create-contact-picker-sheet"
      headerClassName="mb-3"
      bodyClassName="post-create-sheet-stack"
      closeClassName="quiet-button ui-icon-action post-create-sheet-close"
      lockScrollFixed={false}
      showHandle
    >
      <div className="post-create-promote-choice">
        <div className="post-create-promote-handle ui-sheet-handle" aria-hidden="true" />
        <h2 className="post-create-promote-title">发布成功</h2>
        <p className="post-create-promote-copy">
          你的内容已成功发出！是否需要推广置顶，让更多人第一时间看到？
        </p>
        <div className="post-create-promote-actions">
          <ActionButton
            type="button"
            variant="muted"
            size="md"
            onClick={onSkip}
            className="post-create-promote-action"
          >
            返回首页
          </ActionButton>
          <ActionButton
            type="button"
            variant="brand"
            size="md"
            onClick={onGoPromote}
            className="post-create-promote-action"
          >
            立即推广
          </ActionButton>
        </div>
      </div>
    </BottomSheet>
  );
}
