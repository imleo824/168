import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Link2 } from 'lucide-react';

import { APP_ROUTES } from '@/app/routePaths';
import { useAuth } from '@/context/AuthContext';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { getTuiPlusStatus } from '@/services/api';

type ContactKind = 'telegram' | 'whatsapp' | 'line' | 'generic';
type ProfileTextLink = {
  key: string;
  type: 'website' | 'channel';
  href: string;
  label: string;
};
const SINGLE_PROFILE_LINK_LIMIT = 1;

const CONTACT_KIND_ORDER: ContactKind[] = ['telegram', 'whatsapp', 'line'];

function isPublicVisibleLinkStatus(status: unknown) {
  return String(status || '').toUpperCase() === 'ACTIVE';
}

function isOwnVisibleLinkStatus(status: unknown) {
  const normalized = String(status || 'ACTIVE').toUpperCase();
  return normalized !== 'FAILED';
}

function isVisibleContactStatus(status: unknown, includeOwnSaved?: boolean) {
  if (includeOwnSaved) return isOwnVisibleLinkStatus(status);
  const normalized = String(status || 'ACTIVE').toUpperCase();
  return normalized !== 'FAILED' && normalized !== 'EXPIRED';
}

function hasTuiPlusLinkSnapshot(displayUser: any) {
  return Array.isArray(displayUser?.tuiPlusContacts) &&
    Array.isArray(displayUser?.tuiPlusChannels) &&
    Array.isArray(displayUser?.tuiPlusWebsites);
}

function getExplicitKind(raw: unknown): ContactKind | null {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'telegram' || value === 'tg') return 'telegram';
  if (value === 'whatsapp' || value === 'whats_app' || value === 'wa') return 'whatsapp';
  if (value === 'line') return 'line';
  return null;
}

function labelLooksLike(label: string, kind: ContactKind) {
  if (kind === 'telegram') return /telegram|纸飞机|\btg\b/i.test(label);
  if (kind === 'whatsapp') return /whatsapp|whats app|\bwa\b/i.test(label);
  if (kind === 'line') return /\bline\b/i.test(label);
  return false;
}

function getTelegramHandle(value: string, allowPlain = true) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const urlHandle = raw.match(/(?:t\.me|telegram\.me)\/(?:s\/)?@?([a-zA-Z][a-zA-Z0-9_]{4,31})(?:[/?#]|$)/i)?.[1];
  const deepLinkHandle = raw.match(/(?:tg:\/\/resolve\?domain=)([a-zA-Z][a-zA-Z0-9_]{4,31})/i)?.[1];
  const atHandle = raw.match(/^@([a-zA-Z][a-zA-Z0-9_]{4,31})$/)?.[1];
  const plainHandle = allowPlain ? raw.match(/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/)?.[0] : '';
  return urlHandle || deepLinkHandle || atHandle || plainHandle || '';
}

function getLineId(value: string, allowPlain = true) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const fromUrl = raw.match(/(?:line\.me\/ti\/p\/~?)([A-Za-z0-9._-]{3,50})(?:[/?#]|$)/i)?.[1];
  const plainId = allowPlain ? raw.replace(/^@+/, '').match(/^[A-Za-z0-9._-]{3,50}$/)?.[0] : '';
  return fromUrl || plainId || '';
}

function normalizeWhatsAppPhone(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const fromUrl = raw.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)([0-9+]+)/i)?.[1];
  const baseValue = fromUrl || raw;
  const digits = baseValue.replace(/[^0-9]/g, '');
  if (digits.length < 8 || digits.length > 15) return '';
  return `+${digits}`;
}

function contactKind(contact: any): ContactKind {
  const explicit = getExplicitKind(contact?.contactKind || contact?.kind || contact?.type);
  if (explicit) return explicit;

  const label = String(contact?.label || contact?.title || '').trim();
  const value = String(contact?.contact || '').trim();
  const directUrl = String(contact?.contactUrl || '').trim();
  const combined = `${value} ${directUrl}`.trim();

  if (labelLooksLike(label, 'telegram')) return 'telegram';
  if (labelLooksLike(label, 'whatsapp')) return 'whatsapp';
  if (labelLooksLike(label, 'line')) return 'line';

  if (getTelegramHandle(combined, false) || /^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(value)) return 'telegram';
  if (/(?:wa\.me|whatsapp\.com)\//i.test(combined)) return 'whatsapp';
  if (getLineId(combined, false)) return 'line';

  return 'generic';
}

function contactHref(contact: any) {
  const kind = contactKind(contact);
  const value = String(contact?.contact || '').trim();
  const directUrl = String(contact?.contactUrl || '').trim();
  const combined = `${value} ${directUrl}`.trim();

  if (kind === 'telegram') {
    const handle = getTelegramHandle(value) || getTelegramHandle(directUrl) || getTelegramHandle(combined);
    return handle ? `https://t.me/${handle}` : '';
  }
  if (kind === 'whatsapp') {
    const phone = normalizeWhatsAppPhone(value || directUrl);
    return phone ? `https://wa.me/${phone.slice(1)}` : '';
  }
  if (kind === 'line') {
    const lineId = getLineId(value) || getLineId(directUrl);
    return lineId ? `https://line.me/ti/p/~${lineId}` : '';
  }
  return '';
}

function contactCopyValue(contact: any) {
  const kind = contactKind(contact);
  const value = String(contact?.contact || '').trim();
  const directUrl = String(contact?.contactUrl || '').trim();
  const combined = `${value} ${directUrl}`.trim();

  if (kind === 'telegram') {
    const handle = getTelegramHandle(value) || getTelegramHandle(directUrl) || getTelegramHandle(combined);
    return handle ? `@${handle}` : value || directUrl;
  }
  if (kind === 'whatsapp') return normalizeWhatsAppPhone(value || directUrl) || value || directUrl;
  if (kind === 'line') return getLineId(value) || getLineId(directUrl) || value || directUrl;
  return '';
}

function contactBrandLabel(kind: ContactKind) {
  if (kind === 'telegram') return 'Telegram';
  if (kind === 'whatsapp') return 'WhatsApp';
  if (kind === 'line') return 'LINE';
  return '联系方式';
}

function contactActionLabel(contact: any) {
  const kind = contactKind(contact);
  return `打开 ${contactBrandLabel(kind)}`;
}

function normalizeProfileContacts(contacts: any[]) {
  const byKind = new Map<ContactKind, any>();
  contacts.forEach((contact) => {
    const kind = contactKind(contact);
    if (kind === 'generic') return;
    if (!byKind.has(kind)) byKind.set(kind, contact);
  });
  return CONTACT_KIND_ORDER
    .map((kind) => byKind.get(kind))
    .filter(Boolean);
}

function buildProfileTextLinks(websites: any[], channels: any[]): ProfileTextLink[] {
  return [
    ...websites.map((website: any) => ({
      key: `website-${website.id || website.url}`,
      type: 'website' as const,
      href: String(website.url || '').trim(),
      label: String(website.label || '').trim() || String(website.url || '').trim(),
    })),
    ...channels.map((channel: any) => ({
      key: `channel-${channel.id || channel.channelHandle || channel.channelUrl}`,
      type: 'channel' as const,
      href: String(channel.channelUrl || '').trim(),
      label: String(channel.title || '').trim() || String(channel.channelUrl || '').trim(),
    })),
  ].filter((item) => item.href && item.label);
}

function TelegramBrandIcon() {
  return (
    <svg className="user-space-plus-brand-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M21.7 4.2 18.5 19c-.2 1-.8 1.2-1.6.7l-4.5-3.3-2.2 2.1c-.2.2-.4.4-.9.4l.3-4.6 8.4-7.6c.4-.3-.1-.5-.6-.2L7 13.1 2.6 11.7c-1-.3-1-1 0-1.4L20 3.6c.8-.3 1.5.2 1.7.6Z" fill="currentColor" />
    </svg>
  );
}

function WhatsAppBrandIcon() {
  return (
    <svg className="user-space-plus-brand-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.5a9.1 9.1 0 0 0-7.8 13.8L3 21l4.9-1.2A9.1 9.1 0 1 0 12 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.7 7.8c.2-.4.4-.5.7-.5h.5c.2 0 .4.1.5.4l.8 1.9c.1.2.1.4-.1.6l-.5.6c-.1.1-.2.3 0 .5.4.8 1 1.5 1.7 2 .7.5 1.4.8 1.8.9.2.1.4 0 .5-.1l.8-.9c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.3.4.5-.1.7-.5 1.3-1.1 1.7-.5.3-1.6.4-3.4-.4-1.6-.7-3.1-1.9-4.2-3.3-1.1-1.4-1.8-2.9-1.8-3.8 0-.4.2-.8.4-1.2Z" fill="currentColor" />
    </svg>
  );
}

function LineBrandIcon() {
  return (
    <svg className="user-space-plus-brand-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3.2c-5.2 0-9.4 3.4-9.4 7.7 0 3.8 3.3 7 7.8 7.6l.6 2.1c.1.4.6.5.9.2l2.5-2.2c4.1-.8 7-3.8 7-7.6 0-4.4-4.2-7.8-9.4-7.8Z" fill="currentColor" />
      <path d="M7.2 8.7h1.3v3.8h2.1v1.1H7.2V8.7Zm4 0h1.3v4.9h-1.3V8.7Zm2.2 0h1.2l1.8 2.7V8.7h1.2v4.9h-1.2l-1.8-2.7v2.7h-1.2V8.7Z" fill="var(--ui-surface-card)" />
    </svg>
  );
}

function ContactBrandIcon({ kind }: { kind: ContactKind }) {
  if (kind === 'telegram') return <TelegramBrandIcon />;
  if (kind === 'whatsapp') return <WhatsAppBrandIcon />;
  if (kind === 'line') return <LineBrandIcon />;
  return <Link2 className="user-space-plus-brand-icon" aria-hidden="true" />;
}

async function readJsonResponse(res: Response) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export function getActiveProfileChannels(displayUser: any, options: { includeOwnSaved?: boolean } = {}) {
  if (!Array.isArray(displayUser?.tuiPlusChannels)) return [] as any[];
  return displayUser.tuiPlusChannels
    .filter((channel: any) => options.includeOwnSaved ? isOwnVisibleLinkStatus(channel?.status) : isPublicVisibleLinkStatus(channel?.status))
    .filter((channel: any) => channel?.channelUrl && channel?.channelHandle)
    .slice(0, SINGLE_PROFILE_LINK_LIMIT);
}

export function getActiveProfileWebsites(displayUser: any, options: { includeOwnSaved?: boolean } = {}) {
  if (!Array.isArray(displayUser?.tuiPlusWebsites)) return [] as any[];
  return displayUser.tuiPlusWebsites
    .filter((website: any) => options.includeOwnSaved ? isOwnVisibleLinkStatus(website?.status) : isPublicVisibleLinkStatus(website?.status))
    .filter((website: any) => website?.url)
    .slice(0, SINGLE_PROFILE_LINK_LIMIT);
}

export function getActiveProfileContacts(displayUser: any, options: { includeOwnSaved?: boolean } = {}) {
  if (!Array.isArray(displayUser?.tuiPlusContacts)) return [] as any[];
  const visibleContacts = displayUser.tuiPlusContacts
    .filter((contact: any) => isVisibleContactStatus(contact?.status, options.includeOwnSaved))
    .filter((contact: any) => contact?.contact || contact?.contactUrl || contact?.label);
  return normalizeProfileContacts(visibleContacts);
}

type Props = {
  safeId: string;
  displayUser: any;
  isOwnProfile: boolean;
};

export default function UserSpaceTuiPlusLinks({ displayUser, isOwnProfile }: Props) {
  const navigate = useNavigate();
  const { requireAuth } = useAuth();
  const hasSessionLinkSnapshot = hasTuiPlusLinkSnapshot(displayUser);
  const [ownLinks, setOwnLinks] = useState<any | null>(null);

  useEffect(() => {
    if (!isOwnProfile || hasSessionLinkSnapshot) {
      setOwnLinks(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const payload = await getTuiPlusStatus({ cache: 'no-store' });
        if (cancelled || !payload) return;
        setOwnLinks({
          isTuiPlus: Boolean(payload.active),
          tuiPlusStatus: payload.status,
          tuiPlusContacts: Array.isArray(payload.contacts) ? payload.contacts : [],
          tuiPlusChannels: Array.isArray(payload.channels) ? payload.channels.slice(0, SINGLE_PROFILE_LINK_LIMIT) : [],
          tuiPlusWebsites: Array.isArray(payload.websites) ? payload.websites.slice(0, SINGLE_PROFILE_LINK_LIMIT) : [],
        });
      } catch {
        // Keep the public/profile payload if membership status refresh fails.
      }
    })();
    return () => { cancelled = true; };
  }, [hasSessionLinkSnapshot, isOwnProfile]);

  const displayLinksUser = ownLinks ? { ...displayUser, ...ownLinks } : displayUser;
  const profileContacts = useMemo(() => getActiveProfileContacts(displayLinksUser, { includeOwnSaved: isOwnProfile }), [displayLinksUser, isOwnProfile]);
  const profileChannels = useMemo(() => getActiveProfileChannels(displayLinksUser, { includeOwnSaved: isOwnProfile }), [displayLinksUser, isOwnProfile]);
  const profileWebsites = useMemo(() => getActiveProfileWebsites(displayLinksUser, { includeOwnSaved: isOwnProfile }), [displayLinksUser, isOwnProfile]);
  const profileTextLinks = useMemo(() => buildProfileTextLinks(profileWebsites, profileChannels), [profileWebsites, profileChannels]);
  const hasProfileLinks = profileContacts.length > 0 || profileTextLinks.length > 0;
  const ownLinkState = isOwnProfile && displayLinksUser?.isTuiPlus === false ? 'expired' : 'active';

  const openEditor = () => {
    if (!isOwnProfile) return;
    requireAuth(() => navigate(APP_ROUTES.tuiPlusLinkEditor));
  };
  const { guarded: guardedOpenEditor } = useInteractionGuard(openEditor, {
    policy: 'instant',
    cooldownMs: 520,
    mode: 'drop',
  });

  if (!hasProfileLinks && !isOwnProfile) return null;

  return (
    <div className="user-space-plus-links" data-tui-plus-state={ownLinkState} aria-label="会员主页链接">
      {hasProfileLinks ? (
        <div className="user-space-plus-link-list">
          {profileContacts.length > 0 ? (
            <div className="user-space-plus-link-row user-space-plus-contact-row" data-link-type="contact">
              {profileContacts.map((contact: any) => {
                const kind = contactKind(contact);
                const brandLabel = contactBrandLabel(kind);
                const ariaLabel = contactActionLabel(contact);
                const href = contactHref(contact);
                const key = `contact-${kind}-${contact.id || contactCopyValue(contact) || ariaLabel}`;

                if (!href) return null;

                return (
                  <a
                    key={key}
                    className="user-space-plus-link user-space-plus-contact-icon-button user-space-plus-contact-pill pressable"
                    data-contact-kind={kind}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onPointerDownCapture={(event) => { event.stopPropagation(); }}
                    onMouseDownCapture={(event) => { event.stopPropagation(); }}
                    onTouchStartCapture={(event) => { event.stopPropagation(); }}
                    onClick={(event) => { event.stopPropagation(); }}
                    aria-label={ariaLabel}
                    title={ariaLabel}
                  >
                    <ContactBrandIcon kind={kind} />
                    <span className="user-space-plus-contact-label">{brandLabel}</span>
                  </a>
                );
              })}
            </div>
          ) : null}

          {profileTextLinks.map((link) => (
            <a
              key={link.key}
              className="user-space-plus-link user-space-plus-text-link pressable"
              data-link-type={link.type}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => { event.stopPropagation(); }}
            >
              {link.type === 'website' ? (
                <Link2 className="user-space-plus-link-icon" aria-hidden="true" />
              ) : (
                <ExternalLink className="user-space-plus-link-icon" aria-hidden="true" />
              )}
              <span className="user-space-plus-link-label">{link.label}</span>
            </a>
          ))}
        </div>
      ) : null}

      {isOwnProfile ? (
        <div className="user-space-plus-actions" aria-label="添加会员主页链接">
          <button type="button" className="user-space-plus-action pressable" onClick={() => void guardedOpenEditor()}>
            <span className="user-space-plus-action-copy">+链接</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
