export type ImageVariant = 'thumb' | 'medium' | 'large';
export type ImageResizeMode = 'cover' | 'contain';

export interface ImageTransformOptions {
  variant?: ImageVariant;
  width?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'jpeg';
  resize?: ImageResizeMode;
}

const VARIANT_WIDTH: Record<ImageVariant, number> = {
  thumb: 360,
  medium: 900,
  large: 1400,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function shouldUseSupabaseRenderEndpoint() {
  // Supabase image transformations require Storage > Settings to be enabled.
  // Keep this opt-in so browsers never request a known-403 render endpoint.
  return import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORM === 'true';
}

export function toPublicStorageObjectUrl(url: string) {
  if (!url || !/^https?:\/\//i.test(url)) return url;

  try {
    const parsed = new URL(url);
    const marker = [
      '/storage/v1/object/public/uploads/',
      '/storage/v1/render/image/public/uploads/',
      '/storage/v1/object/sign/uploads/',
      '/storage/v1/render/image/sign/uploads/',
    ].find((item) => parsed.pathname.includes(item));
    if (!marker) return url;

    const markerIndex = parsed.pathname.indexOf(marker);
    const suffix = parsed.pathname.slice(markerIndex + marker.length);
    if (!suffix || suffix.startsWith('/') || suffix.includes('..')) return url;

    parsed.pathname = `${parsed.pathname.slice(0, markerIndex)}/storage/v1/object/public/uploads/${suffix}`;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

export function toOptimizedImageUrl(
  url: string,
  variant: ImageVariant = 'medium',
  options?: ImageTransformOptions,
) {
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return url;

  const sourceUrl = toPublicStorageObjectUrl(url);
  const marker = '/storage/v1/object/public/uploads/';
  if (!sourceUrl.includes(marker) || !shouldUseSupabaseRenderEndpoint()) return sourceUrl;

  try {
    const transformed = sourceUrl.replace('/storage/v1/object/public/uploads/', '/storage/v1/render/image/public/uploads/');
    const parsed = new URL(transformed);

    const width = options?.width ?? VARIANT_WIDTH[variant];
    const quality = options?.quality ?? 78;
    const format = options?.format ?? 'webp';
    const resize = options?.resize ?? 'cover';

    parsed.searchParams.set('width', String(Math.max(240, clamp(width, 240, 2400))));
    parsed.searchParams.set('quality', String(clamp(Math.round(quality), 30, 95)));
    parsed.searchParams.set('format', format);
    parsed.searchParams.set('resize', resize);

    return parsed.toString();
  } catch {
    return url;
  }
}
