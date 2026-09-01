import { uploadPreparedImage, type UploadImageOptions } from './imageUploadRequest';
import {
  getImageUploadPreset,
  getImageValidationError,
  getSafeImageFileName,
  inferInputMimeType,
  type ImageUploadPreset,
  type ImageUploadPurpose,
  type PreparedImageUpload,
} from './imageUploadConfig';

export { uploadPreparedImage } from './imageUploadRequest';
export {
  ACCEPTED_IMAGE_TYPES,
  COVER_UPLOAD_RETRY_OPTIONS,
  getImageValidationError,
  normalizeImageUploadError,
} from './imageUploadConfig';
export type {
  ImageFitMode,
  ImageUploadPreset,
  ImageUploadPurpose,
  PreparedImageUpload,
} from './imageUploadConfig';

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

type DrawBox = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  width: number;
  height: number;
};

const ONE_KB = 1024;
const JPEG_EXTENSION = 'jpg';
const QUALITY_STEP = 0.06;
const MAX_RESIZE_RETRIES = 4;
const MAX_FILENAME_BASE_LENGTH = 90;
const MAX_SOURCE_PIXELS = 80_000_000;

function clampQuality(value: number) {
  if (!Number.isFinite(value)) return 0.82;
  return Math.min(1, Math.max(0.01, value));
}

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/png') return 'png';
  return JPEG_EXTENSION;
}

function sanitizeFilenameBase(filename: string, fallback: string) {
  const rawBase = (filename || fallback).replace(/\.[^./\\]+$/, '').trim() || fallback;

  const safeBase = rawBase
    .normalize('NFKC')
    .replace(/[\u0000-\u001F<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_FILENAME_BASE_LENGTH);

  return safeBase || fallback;
}

function buildOutputFilename(file: File, purpose: ImageUploadPurpose, mimeType: string) {
  const baseName = sanitizeFilenameBase(getSafeImageFileName(file), purpose);
  return `${baseName}.${extensionForMime(mimeType)}`;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas toBlob failed'));
          return;
        }

        resolve(blob);
      },
      mimeType,
      clampQuality(quality),
    );
  });
}

async function decodeWithImageBitmap(file: File): Promise<DecodedImage | null> {
  if (typeof window === 'undefined' || !('createImageBitmap' in window)) {
    return null;
  }

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });

    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  } catch {
    return null;
  }
}

function decodeWithImageElement(file: File): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    let settled = false;

    const cleanupObjectUrl = () => {
      URL.revokeObjectURL(objectUrl);
    };

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanupObjectUrl();
      reject(error);
    };

    image.onload = () => {
      if (settled) return;

      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;

      if (!width || !height) {
        settleReject(new Error('图片尺寸异常'));
        return;
      }

      settled = true;

      resolve({
        source: image,
        width,
        height,
        cleanup: () => {
          cleanupObjectUrl();
          image.onload = null;
          image.onerror = null;
          image.removeAttribute('src');
        },
      });
    };

    image.onerror = () => {
      settleReject(new Error('图片解码失败'));
    };

    image.decoding = 'async';
    image.src = objectUrl;
  });
}

async function decodeImage(file: File): Promise<DecodedImage> {
  const bitmapDecoded = await decodeWithImageBitmap(file);

  if (bitmapDecoded) return bitmapDecoded;

  return decodeWithImageElement(file);
}

function assertDecodedImageSafe(decoded: DecodedImage) {
  if (!decoded.width || !decoded.height) {
    throw new Error('图片尺寸异常');
  }

  if (!Number.isFinite(decoded.width) || !Number.isFinite(decoded.height)) {
    throw new Error('图片尺寸异常');
  }

  const sourcePixels = decoded.width * decoded.height;

  if (sourcePixels > MAX_SOURCE_PIXELS) {
    throw new Error('图片分辨率过高，请降低尺寸后上传');
  }
}

function resolveContainBox(
  sourceWidth: number,
  sourceHeight: number,
  preset: ImageUploadPreset,
): DrawBox {
  const scale = Math.min(1, preset.maxWidth / sourceWidth, preset.maxHeight / sourceHeight);

  return {
    sx: 0,
    sy: 0,
    sw: sourceWidth,
    sh: sourceHeight,
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function resolveCoverBox(
  sourceWidth: number,
  sourceHeight: number,
  preset: ImageUploadPreset,
): DrawBox {
  const targetAspect = preset.maxWidth / preset.maxHeight;
  const sourceAspect = sourceWidth / sourceHeight;

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceAspect > targetAspect) {
    sw = Math.round(sourceHeight * targetAspect);
    sx = Math.max(0, Math.round((sourceWidth - sw) / 2));
  } else if (sourceAspect < targetAspect) {
    sh = Math.round(sourceWidth / targetAspect);
    sy = Math.max(0, Math.round((sourceHeight - sh) / 2));
  }

  const scale = Math.min(1, preset.maxWidth / sw, preset.maxHeight / sh);

  return {
    sx,
    sy,
    sw,
    sh,
    width: Math.max(1, Math.round(sw * scale)),
    height: Math.max(1, Math.round(sh * scale)),
  };
}

function resolveDrawBox(
  sourceWidth: number,
  sourceHeight: number,
  preset: ImageUploadPreset,
) {
  return preset.fit === 'cover'
    ? resolveCoverBox(sourceWidth, sourceHeight, preset)
    : resolveContainBox(sourceWidth, sourceHeight, preset);
}

function drawImageToCanvas(
  decoded: DecodedImage,
  box: DrawBox,
  outputWidth: number,
  outputHeight: number,
) {
  const canvas = document.createElement('canvas');

  canvas.width = Math.max(1, Math.round(outputWidth));
  canvas.height = Math.max(1, Math.round(outputHeight));

  const context = canvas.getContext('2d', { alpha: false });

  if (!context) {
    throw new Error('Canvas 2D not supported');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  context.drawImage(
    decoded.source,
    box.sx,
    box.sy,
    box.sw,
    box.sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas;
}

async function compressCanvasToTarget(
  canvas: HTMLCanvasElement,
  preset: ImageUploadPreset,
) {
  const maxBytes = preset.maxOutputKb * ONE_KB;
  const minQuality = clampQuality(preset.minQuality);

  let quality = clampQuality(preset.quality);
  let blob = await canvasToBlob(canvas, preset.outputMimeType, quality);

  while (blob.size > maxBytes && quality > minQuality) {
    quality = Math.max(minQuality, Number((quality - QUALITY_STEP).toFixed(2)));
    blob = await canvasToBlob(canvas, preset.outputMimeType, quality);
  }

  return blob;
}

function getNextShrinkScale(currentBytes: number, maxBytes: number) {
  if (!currentBytes || currentBytes <= maxBytes) return 1;

  const estimatedScale = Math.sqrt(maxBytes / currentBytes) * 0.94;

  return Math.min(0.92, Math.max(0.68, estimatedScale));
}

async function renderCompressedImage(
  decoded: DecodedImage,
  box: DrawBox,
  preset: ImageUploadPreset,
) {
  const maxBytes = preset.maxOutputKb * ONE_KB;

  let width = box.width;
  let height = box.height;
  let bestBlob: Blob | null = null;

  for (let attempt = 0; attempt <= MAX_RESIZE_RETRIES; attempt += 1) {
    const canvas = drawImageToCanvas(decoded, box, width, height);

    try {
      const blob = await compressCanvasToTarget(canvas, preset);

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }

      if (blob.size <= maxBytes) {
        return blob;
      }

      const shrinkScale = getNextShrinkScale(blob.size, maxBytes);
      const nextWidth = Math.max(1, Math.floor(width * shrinkScale));
      const nextHeight = Math.max(1, Math.floor(height * shrinkScale));

      if (nextWidth === width && nextHeight === height) {
        break;
      }

      width = nextWidth;
      height = nextHeight;
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  if (bestBlob) return bestBlob;

  throw new Error('图片压缩失败');
}

export async function prepareImageForUpload(
  file: File,
  purpose: ImageUploadPurpose = 'post',
): Promise<PreparedImageUpload> {
  const validationError = getImageValidationError(file, purpose);

  if (validationError) {
    throw new Error(validationError);
  }

  const preset = getImageUploadPreset(purpose);

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const mimeType = inferInputMimeType(file);

    return {
      blob: file,
      filename: file.name || `${purpose}.${extensionForMime(mimeType)}`,
      mimeType,
      purpose,
    };
  }

  const decoded = await decodeImage(file);

  try {
    assertDecodedImageSafe(decoded);

    const box = resolveDrawBox(decoded.width, decoded.height, preset);
    const blob = await renderCompressedImage(decoded, box, preset);

    return {
      blob,
      filename: buildOutputFilename(file, purpose, preset.outputMimeType),
      mimeType: preset.outputMimeType,
      purpose,
    };
  } finally {
    decoded.cleanup();
  }
}

export async function uploadImageFile(
  file: File,
  options: UploadImageOptions & {
    purpose?: ImageUploadPurpose;
  } = {},
) {
  const prepared = await prepareImageForUpload(file, options.purpose || 'post');

  return uploadPreparedImage(prepared, {
    onProgress: options.onProgress,
    registerRequest: options.registerRequest,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    maxAttempts: options.maxAttempts,
    retryDelayMs: options.retryDelayMs,
  });
}
