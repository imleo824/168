export type ImageUploadPurpose = 'post' | 'avatar' | 'cover' | 'ad-desktop' | 'ad-mobile';
export type ImageFitMode = 'contain' | 'cover';

export interface ImageUploadPreset {
  purpose: ImageUploadPurpose;
  fit: ImageFitMode;
  maxWidth: number;
  maxHeight: number;
  quality: number;
  minQuality: number;
  maxOutputKb: number;
  maxInputMb: number;
  outputMimeType: 'image/jpeg';
}

export interface PreparedImageUpload {
  blob: Blob;
  filename: string;
  mimeType: string;
  purpose: ImageUploadPurpose;
}

const ONE_MB = 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES: string[] = ['image/jpeg', 'image/png', 'image/webp'];

export const COVER_UPLOAD_RETRY_OPTIONS = {
  maxAttempts: 2,
  retryDelayMs: 800,
} as const;

const IMAGE_UPLOAD_PRESETS: Record<ImageUploadPurpose, ImageUploadPreset> = {
  post: {
    purpose: 'post',
    fit: 'contain',
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.84,
    minQuality: 0.34,
    maxOutputKb: 850,
    maxInputMb: 20,
    outputMimeType: 'image/jpeg',
  },
  avatar: {
    purpose: 'avatar',
    fit: 'cover',
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 0.88,
    minQuality: 0.42,
    maxOutputKb: 520,
    maxInputMb: 20,
    outputMimeType: 'image/jpeg',
  },
  cover: {
    purpose: 'cover',
    fit: 'cover',
    maxWidth: 2400,
    maxHeight: 960,
    quality: 0.88,
    minQuality: 0.42,
    maxOutputKb: 1400,
    maxInputMb: 24,
    outputMimeType: 'image/jpeg',
  },
  'ad-desktop': {
    purpose: 'ad-desktop',
    fit: 'contain',
    maxWidth: 1920,
    maxHeight: 480,
    quality: 0.88,
    minQuality: 0.42,
    maxOutputKb: 1100,
    maxInputMb: 24,
    outputMimeType: 'image/jpeg',
  },
  'ad-mobile': {
    purpose: 'ad-mobile',
    fit: 'contain',
    maxWidth: 1080,
    maxHeight: 360,
    quality: 0.88,
    minQuality: 0.42,
    maxOutputKb: 850,
    maxInputMb: 24,
    outputMimeType: 'image/jpeg',
  },
};

export function getImageUploadPreset(purpose: ImageUploadPurpose) {
  return IMAGE_UPLOAD_PRESETS[purpose] || IMAGE_UPLOAD_PRESETS.post;
}

export function getSafeImageFileName(file: File) {
  return file.name || '';
}

function getSafeFileType(file: File) {
  return (file.type || '').toLowerCase();
}

function getFileExtension(filename: string) {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match?.[1]?.toLowerCase() || '';
}

function isAcceptedMimeType(mimeType: string) {
  return ACCEPTED_IMAGE_TYPES.includes(mimeType.toLowerCase());
}

function isAcceptedImageExtension(filename: string) {
  return /(\.jpe?g|\.png|\.webp)$/i.test(filename);
}

export function inferInputMimeType(file: File) {
  const mimeType = getSafeFileType(file);

  if (isAcceptedMimeType(mimeType)) return mimeType;

  const extension = getFileExtension(getSafeImageFileName(file));

  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';

  return 'image/jpeg';
}

function isHeicImageFile(file: File) {
  const mimeType = getSafeFileType(file);
  const filename = getSafeImageFileName(file);

  return /heic|heif/i.test(mimeType) || /\.(heic|heif)$/i.test(filename);
}

export function getImageValidationError(
  file: File,
  purpose: ImageUploadPurpose = 'post',
) {
  if (!file || typeof file.size !== 'number') {
    return '请选择有效图片文件';
  }

  const preset = getImageUploadPreset(purpose);
  const filename = getSafeImageFileName(file) || '图片';
  const mimeType = getSafeFileType(file);

  if (isHeicImageFile(file)) {
    return `"${filename}" 是 HEIC/HEIF，当前网页端无法稳定解码，请转 JPG/PNG/WebP 后上传`;
  }

  const isAcceptedType = isAcceptedMimeType(mimeType) || isAcceptedImageExtension(filename);

  if (!isAcceptedType) {
    return `"${filename}" 不支持的格式，仅支持 JPG、PNG、WebP`;
  }

  if (file.size <= 0) {
    return `"${filename}" 文件为空，请重新选择图片`;
  }

  const rawMb = file.size / ONE_MB;

  if (rawMb > preset.maxInputMb) {
    return `"${filename}" 超过 ${preset.maxInputMb}MB 限制`;
  }

  return '';
}

export function normalizeImageUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (/heic|heif/i.test(message)) {
    return 'HEIC/HEIF 图片网页端兼容性不稳定，请转 JPG/PNG/WebP 后上传';
  }

  if (/超过|限制|too large|size/i.test(message)) {
    return message;
  }

  if (/decode|解码|bitmap|source image|invalid|broken/i.test(message)) {
    return '图片无法被当前浏览器解码，请换 JPG/PNG/WebP，或在相册中导出为“兼容性最佳”后重传';
  }

  if (/Canvas|toBlob|canvas|2d/i.test(message)) {
    return '浏览器图片压缩失败，请换一张图片或降低图片尺寸后重试';
  }

  if (/timeout|超时/i.test(message)) {
    return '上传超时，请更换较小图片或重试';
  }

  if (/abort|取消/i.test(message)) {
    return '上传已取消';
  }

  if (/network|网络|failed to fetch|connection/i.test(message)) {
    return '网络连接失败，请检查网络后重试';
  }

  return message || '图片处理失败，请重试';
}
