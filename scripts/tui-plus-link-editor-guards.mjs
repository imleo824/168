import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mustHave = (label, content, text) => assert.ok(content.includes(text), `${label} must include ${text}`);
const mustNotHave = (label, content, text) => assert.ok(!content.includes(text), `${label} must not include ${text}`);

const linkEditor = read('src/pages/TuiPlusLinkEditorMobile.tsx');

mustHave('link editor server-status gate', linkEditor, 'const statusReady = Boolean(statusPayload)');
mustHave('link editor server-status gate', linkEditor, 'const activeMember = Boolean(statusPayload?.active)');
mustHave('link editor loading gate', linkEditor, '正在校验会员权益');
mustHave('link editor expired prompt', linkEditor, 'TuiPlusBenefitPromptDialog');
mustHave('link editor expired prompt', linkEditor, 'benefit="profileLinks"');
mustHave('link editor expired prompt route state', linkEditor, "buildTuiPlusBenefitRouteState('profileLinks', currentPath)");
mustHave('link editor save guard', linkEditor, 'if (isSaving || !activeMember) return;');
mustHave('link editor user cache sync', linkEditor, 'plusStatus: payload.status');
mustHave('link editor user cache sync', linkEditor, 'plusExpiresAt: payload.expiresAt');
mustHave('link editor user cache sync', linkEditor, 'plusTrialUsed: payload.trialUsed');
mustHave('link editor WhatsApp normalization', linkEditor, 'function normalizeWhatsAppValue');
mustHave('link editor WhatsApp normalization', linkEditor, "return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : ''");
mustHave('link editor WhatsApp validation', linkEditor, '请填写 WhatsApp 号码');
mustHave('link editor wa.me detection', linkEditor, '/(?:wa\\.me|whatsapp\\.com)\\//i.test(lowerValue)');
mustNotHave('link editor must not allow expired editable fallback', linkEditor, '// Entry is already gated before this page; keep editable fallback rows if refresh fails.');

console.log('[tui-plus-link-editor-guards] passed');
