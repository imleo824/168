import React, { useState } from 'react';
import { X, Lock, User, ChevronDown, ChevronUp, Gift } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  DEFAULT_HOME_TOPIC_TAB_ID,
  writeHomeTopicTabId,
} from '@/features/home/HomeTopicTabs';
import { SITE_NAME, SITE_SLOGAN } from '@/platform/brand';
import SEO from '@/platform/SEO';
import ActionButton from '@/ui/ActionButton';
import IconButton from '@/ui/IconButton';
import {
  LOGIN_ACCOUNT_MAX_LENGTH,
  LOGIN_ACCOUNT_MIN_LENGTH,
  LOGIN_PASSWORD_MAX_LENGTH,
  LOGIN_PASSWORD_MIN_LENGTH,
  normalizeLoginAccount,
  validateLoginAccountForWrite,
  validateLoginPasswordForWrite,
} from '@/utils/accountCredentials';
import { clearStoredReferralInvite, readEffectiveReferralInvite } from '@/utils/referralInvite';
import { useScrollLock } from '@/utils/scrollLock';
import {
  REFERRAL_INVITE_CODE_MAX_LENGTH,
  REFERRAL_INVITE_SOURCES,
  type ReferralInviteSource,
  isReferralInviteCodeTooShort,
  sanitizeReferralInviteCodeInput,
} from '../../../shared/referral';

const USER_AGREEMENT_SECTIONS = [
  {
    title: '1. 服务说明',
    body: '推推是面向圈内信息发布、浏览、互动与联系的社交信息服务。你可以发布文字、图片、联系方式等内容，也可以浏览、关注、点赞、分享或联系其他用户。',
  },
  {
    title: '2. 账号与安全',
    body: '注册时请提供真实、准确、可用的信息。你需要自行保管账号、密码及登录状态，因账号保管不当产生的操作与风险，由账号使用者自行承担。',
  },
  {
    title: '3. 内容责任',
    body: '你对自己发布、上传或通过推推展示的内容负责。请确保你拥有相关内容的合法权利，且内容不侵犯他人知识产权、隐私权、名誉权或其他合法权益。',
  },
  {
    title: '4. 禁止行为',
    body: '不得发布违法违规、欺诈、侵权、骚扰、仇恨、暴力威胁、色情低俗、恶意引流、垃圾广告、恶意爬取、冒充他人、破坏系统安全或干扰平台正常运行的内容或行为。',
  },
  {
    title: '5. 平台处理权',
    body: '如内容或账号存在违规、侵权、欺诈、风险投诉或影响平台秩序的情况，推推可根据实际情况采取提醒、限制展示、删除内容、暂停功能、限制账号、封禁账号等处理措施。',
  },
  {
    title: '6. 内容授权',
    body: '你仍然拥有自己内容的合法权利。为提供展示、分发、推荐、搜索、备份、安全审核及平台运营服务，你授权推推在必要范围内使用、复制、展示、传播、改编或处理你在平台发布的内容。',
  },
  {
    title: '7. 隐私与数据',
    body: '推推会根据功能需要处理账号资料、发布内容、互动记录、设备与访问日志等信息，用于登录、安全风控、内容展示、服务优化和必要的合规处理。',
  },
  {
    title: '8. 免责声明',
    body: '平台内容主要由用户自行发布，推推不保证用户内容的真实性、准确性、完整性或适用性。你基于平台内容进行联系、交易或决策时，应自行判断并承担相应风险。',
  },
  {
    title: '9. 协议更新',
    body: '推推可能根据产品功能、运营规则或法律要求更新本协议。更新后继续使用推推，即视为你接受更新后的协议。',
  },
];

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAuthenticating: boolean;
}

function selectDefaultHomeTopicTab() {
  writeHomeTopicTabId(DEFAULT_HOME_TOPIC_TAB_ID);

  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent('home-topic-tab-select', {
      detail: { tabId: DEFAULT_HOME_TOPIC_TAB_ID },
    }),
  );
}

export default function AuthModal({ isOpen, onClose, isAuthenticating }: AuthModalProps) {
  const initialReferralInvite = readEffectiveReferralInvite();
  const { loginWithPassword, registerWithPassword } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'password' | 'register'>(() => initialReferralInvite ? 'register' : 'password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(initialReferralInvite?.code || '');
  const [inviteSource, setInviteSource] = useState<ReferralInviteSource>(initialReferralInvite?.source || REFERRAL_INVITE_SOURCES.MANUAL);
  const [formError, setFormError] = useState('');
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [isAgreementOpen, setIsAgreementOpen] = useState(false);
  const canSubmitLogin = !isAuthenticating && Boolean(username.trim()) && Boolean(password);
  const cleanRegisterUsername = normalizeLoginAccount(username);
  const cleanInviteCode = sanitizeReferralInviteCodeInput(inviteCode);
  const hasInvalidInviteCode = isReferralInviteCodeTooShort(inviteCode);
  const canSubmitRegister =
    !isAuthenticating &&
    agreementAccepted &&
    !hasInvalidInviteCode &&
    cleanRegisterUsername.length >= LOGIN_ACCOUNT_MIN_LENGTH &&
    password.length >= LOGIN_PASSWORD_MIN_LENGTH &&
    Boolean(confirmPassword);

  const handleRequestClose = () => {
    if (isAuthenticating) return;
    onClose();
  };

  useScrollLock(isOpen, {
    fixed: true,
    allowTouchMove: (target) =>
      target instanceof Element && Boolean(target.closest('[data-auth-scroll]')),
  });

  const handleTabChange = (nextTab: 'password' | 'register') => {
    setTab(nextTab);
    setFormError('');
    if (nextTab === 'password') {
      setConfirmPassword('');
      setIsAgreementOpen(false);
    }
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    if (formError) setFormError('');
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (formError) setFormError('');
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    if (formError) setFormError('');
  };

  const handleInviteCodeChange = (value: string) => {
    setInviteCode(sanitizeReferralInviteCodeInput(value));
    setInviteSource(REFERRAL_INVITE_SOURCES.MANUAL);
    if (formError) setFormError('');
  };

  const handleAgreementChange = (checked: boolean) => {
    setAgreementAccepted(checked);
    if (formError) setFormError('');
  };

  const goToDefaultHomeAfterAuth = () => {
    selectDefaultHomeTopicTab();
    navigate('/', { replace: true });
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setFormError('请输入登录账号和密码');
      return;
    }
    const result = await loginWithPassword(cleanUsername, password);
    if (result.ok) {
      goToDefaultHomeAfterAuth();
      return;
    }
    setFormError('error' in result ? result.error : '登录失败，请稍后重试');
  };

  const handlePasswordRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = normalizeLoginAccount(username);
    if (!cleanUsername || !password || !confirmPassword) {
      setFormError('请输入登录账号和两次密码');
      return;
    }
    const accountError = validateLoginAccountForWrite(cleanUsername);
    if (accountError) {
      setFormError(accountError);
      return;
    }
    const passwordError = validateLoginPasswordForWrite(password, cleanUsername);
    if (passwordError) {
      setFormError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setFormError('两次输入的密码不一致');
      return;
    }
    if (hasInvalidInviteCode) {
      setFormError('邀请码至少需要4位');
      return;
    }
    if (!agreementAccepted) {
      setFormError(`请先阅读并同意《${SITE_NAME}用户协议》`);
      return;
    }
    const result = await registerWithPassword(
      cleanUsername,
      password,
      cleanInviteCode,
      cleanInviteCode ? inviteSource : undefined,
    );
    if (result.ok) {
      clearStoredReferralInvite();
      goToDefaultHomeAfterAuth();
      return;
    }
    setFormError('error' in result ? result.error : '注册失败，请稍后重试');
  };

  if (!isOpen) return null;

  return (
    <>
      <SEO
        title={`登录${SITE_NAME}｜推推`}
        description="登录或注册推推账号，继续发布、互动和管理个人记录。"
        noindex
      />
      <div className="ui-auth-overlay">
        <div onClick={handleRequestClose} className="ui-auth-scrim" />

        <div role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" className="ui-panel ui-auth-panel">
          <IconButton onClick={handleRequestClose} disabled={isAuthenticating} className="ui-layer-close-action ui-auth-close-action" aria-label="关闭登录弹窗" title="关闭">
            <X />
          </IconButton>

          <div data-auth-scroll className="ui-auth-scroll">
            <div className="ui-auth-brand-lockup">
              <div id="auth-modal-title" className="ui-auth-brand-name">{SITE_NAME}</div>
              <div className="ui-auth-brand-slogan">{SITE_SLOGAN}</div>
            </div>

          <div className="ui-auth-tablist">
            <button type="button" onClick={() => handleTabChange('password')} aria-pressed={tab === 'password'} className={`ui-auth-tab ${tab === 'password' ? 'ui-auth-tab-active' : 'ui-auth-tab-inactive'}`}>登录</button>
            <button type="button" onClick={() => handleTabChange('register')} aria-pressed={tab === 'register'} className={`ui-auth-tab ${tab === 'register' ? 'ui-auth-tab-active' : 'ui-auth-tab-inactive'}`}>注册</button>
          </div>

          {tab === 'password' ? (
            <div key="password-tab" className="ui-auth-tab-panel">
              <form onSubmit={handlePasswordLogin} className="ui-auth-form">
                <div><div className="ui-control ui-auth-field"><div className="ui-auth-input-icon"><User /></div><input type="text" value={username} onChange={(e) => handleUsernameChange(e.target.value)} placeholder="登录账号" autoComplete="username" className="ui-auth-input" required aria-invalid={Boolean(formError)} /></div></div>
                <div><div className="ui-control ui-auth-field"><div className="ui-auth-input-icon"><Lock /></div><input type="password" value={password} onChange={(e) => handlePasswordChange(e.target.value)} placeholder="密码" autoComplete="current-password" className="ui-auth-input" required aria-invalid={Boolean(formError)} /></div></div>
                {formError ? <p className="ui-auth-error">{formError}</p> : null}
                <ActionButton type="submit" disabled={!canSubmitLogin} variant={canSubmitLogin ? 'primary' : 'disabled'} className="ui-auth-submit">{isAuthenticating ? '登录中...' : '立即登录'}</ActionButton>
              </form>
            </div>
          ) : (
            <div key="register-tab" className="ui-auth-tab-panel">
              <form onSubmit={handlePasswordRegister} className="ui-auth-form">
                <div><div className="ui-control ui-auth-field"><div className="ui-auth-input-icon"><User /></div><input type="text" value={username} onChange={(e) => handleUsernameChange(e.target.value)} placeholder="请输入3-32位登录账号" autoComplete="username" className="ui-auth-input" required minLength={LOGIN_ACCOUNT_MIN_LENGTH} maxLength={LOGIN_ACCOUNT_MAX_LENGTH} aria-invalid={Boolean(formError)} /></div></div>
                <div><div className="ui-control ui-auth-field"><div className="ui-auth-input-icon"><Lock /></div><input type="password" value={password} onChange={(e) => handlePasswordChange(e.target.value)} placeholder="请设置至少8位密码" autoComplete="new-password" className="ui-auth-input" required minLength={LOGIN_PASSWORD_MIN_LENGTH} maxLength={LOGIN_PASSWORD_MAX_LENGTH} aria-invalid={Boolean(formError)} /></div></div>
                <div><div className="ui-control ui-auth-field"><div className="ui-auth-input-icon"><Lock /></div><input type="password" value={confirmPassword} onChange={(e) => handleConfirmPasswordChange(e.target.value)} placeholder="请再次输入密码" autoComplete="new-password" className="ui-auth-input" required minLength={LOGIN_PASSWORD_MIN_LENGTH} maxLength={LOGIN_PASSWORD_MAX_LENGTH} aria-invalid={Boolean(formError)} /></div></div>
                <div><div className="ui-control ui-auth-field"><div className="ui-auth-input-icon"><Gift /></div><input type="text" value={inviteCode} onChange={(e) => handleInviteCodeChange(e.target.value)} placeholder="邀请码 / 推荐码（选填）" autoComplete="off" className="ui-auth-input" maxLength={REFERRAL_INVITE_CODE_MAX_LENGTH} aria-invalid={Boolean(formError && hasInvalidInviteCode)} /></div></div>

                <div className="ui-auth-agreement">
                  <div className="ui-auth-agreement-row">
                    <input id="ui-auth-agreement-checkbox" type="checkbox" checked={agreementAccepted} onChange={(event) => handleAgreementChange(event.target.checked)} className="ui-auth-agreement-checkbox" />
                    <label htmlFor="ui-auth-agreement-checkbox" className="ui-auth-agreement-copy">我已阅读并同意<button type="button" className="ui-auth-agreement-link" onClick={(event) => { event.preventDefault(); setIsAgreementOpen((open) => !open); }} aria-expanded={isAgreementOpen} aria-controls="ui-auth-agreement-panel">《{SITE_NAME}用户协议》</button></label>
                    <button type="button" className="ui-auth-agreement-toggle" aria-label={isAgreementOpen ? '收起用户协议' : '展开用户协议'} aria-expanded={isAgreementOpen} aria-controls="ui-auth-agreement-panel" onClick={() => setIsAgreementOpen((open) => !open)}>{isAgreementOpen ? <ChevronUp className="ui-auth-agreement-toggle-icon" aria-hidden="true" /> : <ChevronDown className="ui-auth-agreement-toggle-icon" aria-hidden="true" />}</button>
                  </div>

                  {isAgreementOpen ? (
                    <section id="ui-auth-agreement-panel" className="ui-auth-agreement-panel" aria-label={`${SITE_NAME}用户协议`}>
                      <div className="ui-auth-agreement-list">
                        {USER_AGREEMENT_SECTIONS.map((section) => <article key={section.title} className="ui-auth-agreement-item"><h4>{section.title}</h4><p>{section.body}</p></article>)}
                      </div>
                    </section>
                  ) : null}
                </div>

                {formError ? <p className="ui-auth-error">{formError}</p> : null}
                <ActionButton type="submit" disabled={!canSubmitRegister} variant={canSubmitRegister ? 'primary' : 'disabled'} className="ui-auth-submit ui-auth-submit--register" title={!agreementAccepted ? `请先同意《${SITE_NAME}用户协议》` : undefined}>{isAuthenticating ? '注册中...' : '确认并免费注册'}</ActionButton>
              </form>
            </div>
          )}
          </div>
        </div>
      </div>
    </>
  );
}
