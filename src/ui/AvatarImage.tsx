import { memo, useEffect, useMemo, useState, type ImgHTMLAttributes } from 'react';

type AvatarVariant = 'thumb' | 'medium' | 'large';
type AvatarFallbackTone = 'neutral' | 'brand';

type AvatarImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'onError' | 'alt' | 'referrerPolicy'
> & {
  src?: string | null;
  name?: string | null;
  id?: string | null;
  alt?: string;
  variant?: AvatarVariant;
  fallbackTone?: AvatarFallbackTone;
  referrerPolicy?: string;
  isTuiPlus?: boolean;
};

const PERSISTENT_UPLOAD_MARKERS = [
  '/storage/v1/object/public/uploads/',
  '/storage/v1/render/image/public/uploads/',
  '/storage/v1/object/sign/uploads/',
  '/storage/v1/render/image/sign/uploads/',
];

function mergeClassName(className?: string) {
  const hasAvatarClass = className?.split(/\s+/).some((item) => item === 'ui-avatar');
  return hasAvatarClass || !className ? `${className || ''} ui-avatar`.trim() : `ui-avatar ${className}`;
}

function normalizeCandidate(value?: string | null) {
  if (!value) return '';
  const raw = value.trim();
  if (!raw) return '';

  const normalized = raw.replace(/^@+/, '').trim();
  if (!normalized) return '';

  const lowered = normalized.toLowerCase();
  if (
    lowered === 'null'
    || lowered === 'undefined'
    || lowered === 'n/a'
    || /^\?+$/.test(normalized)
    || /^？+$/.test(normalized)
  ) {
    return '';
  }

  return normalized;
}

function pickAvatarInitial(source: string) {
  for (const char of Array.from(source)) {
    if (/[A-Za-z0-9\u4E00-\u9FFF]/.test(char)) {
      return /[A-Za-z]/.test(char) ? char.toUpperCase() : char;
    }
  }
  return '';
}

function resolveAvatarInitial(name?: string | null, id?: string | null) {
  const fallbackByName = normalizeCandidate(name);
  const fallbackById = normalizeCandidate(id);

  if (!fallbackByName || fallbackByName.toLowerCase() === 'anonymous') {
    if (!fallbackById || fallbackById.toLowerCase() === 'anonymous') return '';
    return pickAvatarInitial(fallbackById);
  }

  return pickAvatarInitial(fallbackByName);
}

function displayAvatarInitial(value: string) {
  return value || '财';
}

function normalizeAvatarSrc(src?: string | null) {
  const raw = normalizeCandidate(src);
  if (!raw) return '';

  const hasSafeProtocol = /^https?:\/\//i.test(raw) || /^data:/i.test(raw) || /^blob:/i.test(raw) || /^\//.test(raw);
  if (!hasSafeProtocol) return '';

  return raw;
}

function avatarVersion(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildAvatarCandidates(src?: string | null, id?: string | null) {
  const directSrc = normalizeAvatarSrc(src);
  if (!directSrc) return [] as string[];

  const candidates: string[] = [];
  const safeId = normalizeCandidate(id);

  // Public Supabase media is CDN-backed and does not require browser CORS
  // permission for a normal <img>. Keep the app proxy only as a fallback.
  candidates.push(directSrc);

  if (safeId && typeof window !== 'undefined') {
    try {
      const parsed = new URL(directSrc, window.location.origin);
      const isPersistentUpload = PERSISTENT_UPLOAD_MARKERS.some((marker) => parsed.pathname.includes(marker));
      if (isPersistentUpload) {
        candidates.push(`/media/avatar/${encodeURIComponent(safeId)}?v=${avatarVersion(directSrc)}`);
      }
    } catch {
      // Keep the original source as the fallback candidate.
    }
  }
  return Array.from(new Set(candidates.filter(Boolean)));
}

const AvatarImage = memo(function AvatarImage({
  src,
  name,
  id,
  alt = '',
  variant: _variant = 'thumb',
  fallbackTone = 'neutral',
  className,
  loading = 'eager',
  referrerPolicy = 'strict-origin-when-cross-origin',
  onLoad,
  isTuiPlus = false,
  ...imageProps
}: AvatarImageProps) {
  const candidates = useMemo(() => buildAvatarCandidates(src, id), [src, id]);
  const candidateKey = useMemo(() => candidates.join('\n'), [candidates]);
  const normalizedClass = useMemo(() => mergeClassName(className), [className]);
  const fallbackInitial = useMemo(() => resolveAvatarInitial(name, id), [name, id]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [isImageError, setIsImageError] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setIsImageError(false);
  }, [candidateKey]);

  const activeSrc = candidates[candidateIndex] || '';

  const handleImageError = () => {
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex((current) => current + 1);
      return;
    }

    setIsImageError(true);
  };

  const shouldRenderImage = Boolean(activeSrc && !isImageError);
  const tuiPlusData = isTuiPlus ? 'true' : undefined;

  if (shouldRenderImage) {
    return (
      <img
        src={activeSrc}
        alt={alt}
        className={normalizedClass}
        loading={loading}
        decoding="async"
        referrerPolicy={referrerPolicy as ImgHTMLAttributes<HTMLImageElement>['referrerPolicy']}
        draggable={false}
        onError={handleImageError}
        onLoad={onLoad}
        data-tui-plus={tuiPlusData}
        {...imageProps}
      />
    );
  }

  return (
    <span
      {...imageProps}
      className={`${normalizedClass} ui-avatar-fallback`}
      data-avatar-fallback-tone={fallbackTone}
      data-tui-plus={tuiPlusData}
      aria-label={alt || `avatar-${name || id || 'user'}`}
      role="img"
    >
      <span className="ui-avatar-fallback-glyph">{displayAvatarInitial(fallbackInitial)}</span>
    </span>
  );
});

export default AvatarImage;
