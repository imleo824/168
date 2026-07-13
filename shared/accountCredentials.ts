export const LOGIN_ACCOUNT_MIN_LENGTH = 3;
export const LOGIN_ACCOUNT_MAX_LENGTH = 32;
export const LOGIN_PASSWORD_MIN_LENGTH = 8;
export const LOGIN_PASSWORD_MAX_LENGTH = 128;

export const LOGIN_ACCOUNT_RULE_TEXT = '账号需为 3-32 位字母、数字或下划线';

const LOGIN_ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9_]{2,31}$/;

const COMMON_WEAK_PASSWORDS = new Set([
  '12345678',
  '123456789',
  'password',
  'password1',
  'qwerty123',
  '11111111',
  'admin123',
]);

export function normalizeLoginAccount(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateLoginAccountForWrite(value: unknown) {
  const cleanAccount = normalizeLoginAccount(value);
  if (!cleanAccount) return '请输入账号';
  if (
    cleanAccount.length < LOGIN_ACCOUNT_MIN_LENGTH ||
    cleanAccount.length > LOGIN_ACCOUNT_MAX_LENGTH
  ) {
    return LOGIN_ACCOUNT_RULE_TEXT;
  }
  if (!LOGIN_ACCOUNT_PATTERN.test(cleanAccount)) {
    return LOGIN_ACCOUNT_RULE_TEXT;
  }
  return '';
}

export function getPasswordStrengthClassCount(password: string) {
  return [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
}

export function validateLoginPasswordForWrite(password: unknown, loginAccount?: unknown) {
  const cleanPassword = typeof password === 'string' ? password : '';
  const cleanAccount = normalizeLoginAccount(loginAccount);
  if (!cleanPassword) return '请输入密码';
  if (
    cleanPassword.length < LOGIN_PASSWORD_MIN_LENGTH ||
    cleanPassword.length > LOGIN_PASSWORD_MAX_LENGTH
  ) {
    return '密码至少 8 位';
  }
  if (cleanAccount.length >= LOGIN_ACCOUNT_MIN_LENGTH && cleanPassword.toLowerCase().includes(cleanAccount)) {
    return '密码不能包含账号';
  }
  if (/^(.)\1+$/.test(cleanPassword)) {
    return '密码太简单，请换一个';
  }
  if (COMMON_WEAK_PASSWORDS.has(cleanPassword.toLowerCase())) {
    return '密码太常见，请换一个';
  }
  if (cleanPassword.length < 12 && getPasswordStrengthClassCount(cleanPassword) < 2) {
    return '密码需包含字母、数字或符号中的至少两类';
  }
  return '';
}
