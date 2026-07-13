import express, { type Express, type Request } from 'express';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { authMiddleware, mustAuth } from '../middlewares/auth';
import { uploadLimiter } from '../middlewares/rateLimit';
import { normalizeStringParam } from '../http/params';

type UploadRouteOptions = {
  canonicalizePersistentUploadedImageUrl: (url: string) => string;
};

// Multer components for image uploads

const uploadDir = path.join(process.env.NODE_ENV === 'production' ? '/tmp' : process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function hasValidImageSignature(buffer: Buffer, mime: string) {
  if (!buffer || buffer.length < 12) return false;
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

function getUploadExtension(file: any) {
  const mimeExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return mimeExt[file.mimetype] || path.extname(file.originalname).replace('.', '').toLowerCase() || 'jpg';
}

function imageFileFilter(
  _req: Request,
  file: any,
  cb: multer.FileFilterCallback,
) {
  if (!ALLOWED_UPLOAD_MIME.has(file.mimetype)) {
    cb(new Error('仅支持 JPG、PNG、WebP 图片'));
    return;
  }
  cb(null, true);
}

// persistence via Supabase
function deriveSupabaseProjectUrl() {
  const urls = [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(Boolean) as string[];
  for (const value of urls) {
    try {
      const parsed = new URL(value);
      const hostMatch = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
      const userMatch = decodeURIComponent(parsed.username).match(/^postgres\.([a-z0-9]+)$/i);
      const projectRef = hostMatch?.[1] || userMatch?.[1];
      if (projectRef) return `https://${projectRef}.supabase.co`;
    } catch {
      // Ignore non-URL database configurations.
    }
  }
  return '';
}

function deriveSupabaseUrlFromKey(key: string) {
  if (!key || !key.includes('.')) return '';
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    const projectRef = String(payload?.ref || '').trim();
    return /^[a-z0-9]+$/i.test(projectRef) ? `https://${projectRef}.supabase.co` : '';
  } catch {
    return '';
  }
}

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const candidateInputs = [
  { source: 'vite_url', url: process.env.VITE_SUPABASE_URL || '' },
  { source: 'server_url', url: process.env.SUPABASE_URL || '' },
  { source: 'service_key', url: deriveSupabaseUrlFromKey(supabaseKey) },
  { source: 'database_url', url: deriveSupabaseProjectUrl() },
];
const seenSupabaseUrls = new Set<string>();
const supabaseCandidateUrls = candidateInputs
  .map((candidate) => ({ ...candidate, url: candidate.url.trim().replace(/\/$/, '') }))
  .filter((candidate) => {
    if (!candidate.url || seenSupabaseUrls.has(candidate.url)) return false;
    seenSupabaseUrls.add(candidate.url);
    return true;
  });
const supabaseCandidates = supabaseKey
  ? supabaseCandidateUrls.map(({ source, url }) => ({ source, url, client: createClient(url, supabaseKey) }))
  : [];

export let supabaseUrl = supabaseCandidates[0]?.url || '';
export let supabase: SupabaseClient | null = supabaseCandidates[0]?.client || null;
type ResolvedStorageClient = {
  source: string;
  url: string;
  client: SupabaseClient;
  bucketMissing: boolean;
  bucketPublic: boolean;
};
type StorageProbeAttempt = { source: string; reason: string; status: number };
let resolvedSupabasePromise: Promise<ResolvedStorageClient | null> | null = null;
let latestStorageProbeAttempts: StorageProbeAttempt[] = [];
export const isProduction = process.env.NODE_ENV === 'production';
const autoEnsureUploadBucket = process.env.AUTO_ENSURE_UPLOAD_BUCKET !== '0';

export const UPLOAD_BUCKET = 'uploads';
const UPLOAD_STORAGE_FOLDERS: Record<string, string> = {
  post: 'post-images',
  avatar: 'avatars',
  cover: 'covers',
  'ad-desktop': 'ads/desktop',
  'ad-mobile': 'ads/mobile',
  webhook: 'webhook-images',
};
const CLIENT_UPLOAD_PURPOSES = new Set(['post', 'avatar', 'cover', 'ad-desktop', 'ad-mobile']);

async function resolveUploadStorageClient() {
  if (!resolvedSupabasePromise) {
    resolvedSupabasePromise = (async () => {
      const attempts: StorageProbeAttempt[] = [];
      for (const candidate of supabaseCandidates) {
        try {
          const { data, error } = await candidate.client.storage.getBucket(UPLOAD_BUCKET);
          if ((!error && data) || isSupabaseBucketMissingError(error)) {
            attempts.push({ source: candidate.source, reason: error ? 'bucket_missing' : 'ready', status: Number((error as any)?.status || 0) });
            latestStorageProbeAttempts = attempts;
            supabaseUrl = candidate.url;
            supabase = candidate.client;
            return {
              ...candidate,
              bucketMissing: Boolean(error),
              bucketPublic: Boolean(data?.public),
            };
          }
          const status = Number((error as any)?.status || (error as any)?.statusCode || 0);
          const message = String((error as any)?.message || (error as any)?.error || '').toLowerCase();
          const reason = status === 401 || status === 403 || /jwt|unauthor|forbidden|api key/.test(message)
            ? 'authentication_failed'
            : status >= 500
              ? 'upstream_error'
              : 'request_failed';
          attempts.push({ source: candidate.source, reason, status });
        } catch (error: any) {
          const code = String(error?.cause?.code || error?.code || '').toUpperCase();
          const reason = code.includes('ENOTFOUND') || code.includes('EAI_AGAIN')
            ? 'dns_failed'
            : code.includes('CERT') || code.includes('TLS')
              ? 'tls_failed'
              : 'network_failed';
          attempts.push({ source: candidate.source, reason, status: 0 });
        }
      }
      latestStorageProbeAttempts = attempts;
      return null;
    })().then((result) => {
      if (!result) resolvedSupabasePromise = null;
      return result;
    });
  }
  return resolvedSupabasePromise;
}

export async function getUploadStorageReadiness() {
  if (!supabaseCandidates.length) return { ready: false, configured: false, reason: 'not_configured' };
  const resolved = await resolveUploadStorageClient();
  if (!resolved) return {
    ready: false,
    configured: true,
    reason: 'storage_unreachable',
    attempts: latestStorageProbeAttempts,
  };
  return resolved.bucketMissing
    ? { ready: false, configured: true, reason: 'bucket_missing' }
    : !resolved.bucketPublic
      ? { ready: false, configured: true, reason: 'bucket_private' }
      : { ready: true, configured: true, reason: 'ready' };
}

function normalizeUploadPurpose(rawValue: unknown) {
  const purpose = normalizeStringParam(rawValue, 40).toLowerCase() || 'post';
  return CLIENT_UPLOAD_PURPOSES.has(purpose) ? purpose : 'post';
}

export function buildUploadStoragePath(purpose: string, userId: string, ext: string, suffix?: string) {
  const folder = UPLOAD_STORAGE_FOLDERS[purpose] || UPLOAD_STORAGE_FOLDERS.post;
  const dateKey = new Date().toISOString().slice(0, 10);
  const safeExt = `${ext || 'jpg'}`.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const safeSuffix = suffix ? `-${`${suffix}`.replace(/[^a-z0-9_-]/gi, '')}` : '';
  return `${folder}/${userId}/${dateKey}/${crypto.randomUUID()}${safeSuffix}.${safeExt}`;
}

export function isSupabaseBucketMissingError(error: any) {
  const message = String(error?.message || error?.error || '').toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  return status === 404 || /bucket not found|not found|does not exist/.test(message);
}

function markUploadBucketReady(resolved: ResolvedStorageClient) {
  resolvedSupabasePromise = Promise.resolve({
    source: resolved.source,
    url: resolved.url,
    client: resolved.client,
    bucketMissing: false,
    bucketPublic: true,
  });
}

export async function ensureUploadBucket() {
  const resolved = await resolveUploadStorageClient();
  if (!resolved || !supabase) return false;

  try {
    const { data: bucket, error: getError } = await supabase.storage.getBucket(UPLOAD_BUCKET);
    if (!getError && bucket) {
      if (bucket.public) {
        markUploadBucketReady(resolved);
        return true;
      }
      const { error: updateError } = await supabase.storage.updateBucket(UPLOAD_BUCKET, { public: true });
      if (updateError) {
        console.error('Error making Supabase upload bucket public:', updateError.message);
        return false;
      }
      markUploadBucketReady(resolved);
      return true;
    }

    if (getError && !isSupabaseBucketMissingError(getError)) {
      console.error('Error reading Supabase upload bucket:', getError.message);
      return false;
    }

    const { error: createError } = await supabase.storage.createBucket(UPLOAD_BUCKET, { public: true });
    if (createError) {
      const alreadyExists = Number((createError as any).status || 0) === 409
        || /bucket already exists|resource already exists/i.test(createError.message || '');
      if (!alreadyExists) {
        console.error('Error creating Supabase upload bucket:', createError.message);
        return false;
      }
      await supabase.storage.updateBucket(UPLOAD_BUCKET, { public: true });
    }
    markUploadBucketReady(resolved);
    return true;
  } catch (err: any) {
    console.error('Supabase upload bucket ensure error:', err?.message || err);
    return false;
  }
}

// The uploads bucket contains public post/profile media. Repair legacy private
// buckets at startup; operators can explicitly disable this with value "0".
if (supabaseCandidates.length && autoEnsureUploadBucket) {
  void ensureUploadBucket();
}

// Multer disk storage is local-development only. Production uploads must use
// Supabase Storage so image URLs remain stable after Railway restarts.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${crypto.randomUUID()}.${getUploadExtension(file)}`);
  }
});

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

export function registerUploadRoutes(app: Express, options: UploadRouteOptions) {
  if (!isProduction) {
    app.use('/uploads', express.static(uploadDir, { maxAge: '1y', immutable: true }));
  }

  // Image upload API
  app.post('/api/upload', uploadLimiter, authMiddleware, mustAuth, (req: any, res: any) => {
    // If Supabase is configured, use it for persistent storage
    if (supabaseCandidates.length) {
      uploadMemory.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: '上传失败: ' + err.message });
        if (!req.file) return res.status(400).json({ error: '未选择文件' });

        try {
          const file = req.file;
          if (!hasValidImageSignature(file.buffer, file.mimetype)) {
            return res.status(400).json({ error: '图片文件内容不合法，请重新选择图片' });
          }

          const purpose = normalizeUploadPurpose(req.body?.purpose);
          const filePath = buildUploadStoragePath(purpose, req.user.id, getUploadExtension(file));

          // getPublicUrl() does not verify bucket visibility. Repair and verify
          // the public-media contract before accepting an upload.
          if (!await ensureUploadBucket()) {
            return res.status(503).json({ error: '图片存储暂不可用，请稍后重试' });
          }
          const resolvedStorage = await resolveUploadStorageClient();
          if (!resolvedStorage?.bucketPublic) {
            return res.status(503).json({ error: '图片存储未就绪，请稍后重试' });
          }
          const storageClient = resolvedStorage.client;

          const uploadPayload = {
            contentType: file.mimetype,
            cacheControl: '31536000',
            upsert: false
          };
          let { error } = await storageClient.storage
            .from(UPLOAD_BUCKET)
            .upload(filePath, file.buffer, uploadPayload);

          if (error && isSupabaseBucketMissingError(error) && await ensureUploadBucket()) {
            const retryStorage = await resolveUploadStorageClient();
            const retry = await (retryStorage?.client || storageClient).storage
              .from(UPLOAD_BUCKET)
              .upload(filePath, file.buffer, uploadPayload);
            error = retry.error;
          }

          if (error) throw error;

          const { data: { publicUrl } } = storageClient.storage
            .from(UPLOAD_BUCKET)
            .getPublicUrl(filePath);

          if (!publicUrl) {
            throw new Error('云存储未返回图片地址');
          }

          res.json({ url: options.canonicalizePersistentUploadedImageUrl(publicUrl) || publicUrl });
        } catch (err: any) {
          console.error('Supabase upload error:', err);
          res.status(500).json({ error: '图片上传失败，请稍后重试' });
        }
      });
    } else if (!isProduction) {
      upload.single('file')(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ error: '上传失败: ' + err.message });
        }
        if (!req.file) {
          return res.status(400).json({ error: '未选择文件' });
        }
        try {
          const diskBuffer = await fsPromises.readFile(req.file.path);
          if (!hasValidImageSignature(diskBuffer, req.file.mimetype)) {
            await fsPromises.unlink(req.file.path).catch(() => {});
            return res.status(400).json({ error: '图片文件内容不合法，请重新选择图片' });
          }

          res.json({ url: `/uploads/${req.file.filename}` });
        } catch (err) {
          await fsPromises.unlink(req.file.path).catch(() => {});
          return res.status(500).json({ error: '读取本地图片失败，请重试' });
        }
      });
    } else {
      return res.status(503).json({ error: '云存储未配置，无法上传图片' });
    }
  });
}
