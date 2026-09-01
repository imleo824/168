import assert from 'node:assert/strict';
import fs from 'node:fs';

const uploadRoute = fs.readFileSync('server/routes/upload.routes.ts', 'utf8');
const avatarImage = fs.readFileSync('src/ui/AvatarImage.tsx', 'utf8');
const optimizedImage = fs.readFileSync('src/ui/OptimizedImage.tsx', 'utf8');
const postMediaGrid = fs.readFileSync('src/features/post/PostMediaGrid.tsx', 'utf8');

assert.match(
  uploadRoute,
  /const autoEnsureUploadBucket = process\.env\.AUTO_ENSURE_UPLOAD_BUCKET !== '0'/,
  'public upload storage must self-repair by default',
);
assert.match(
  uploadRoute,
  /reason: 'bucket_private'/,
  'storage readiness must reject a private public-media bucket',
);
assert.match(
  uploadRoute,
  /supabase_unreachable_local_fallback_ready/,
  'storage readiness must report a usable local fallback when Supabase is unreachable',
);
assert.match(
  uploadRoute,
  /function normalizeLocalUploadPath/,
  'local upload fallback paths must be normalized before writing',
);
assert.match(
  uploadRoute,
  /async function writeLocalUploadFromBuffer/,
  'uploads must have a local file fallback when cloud storage is unavailable',
);
assert.match(
  uploadRoute,
  /app\.use\('\/uploads', express\.static\(uploadDir/,
  'local fallback uploads must be served by the app in production',
);

const ensureIndex = uploadRoute.indexOf('if (await ensureUploadBucket())');
const uploadIndex = uploadRoute.indexOf('.upload(filePath, file.buffer, uploadPayload)', ensureIndex);
assert.ok(ensureIndex >= 0 && uploadIndex > ensureIndex, 'bucket visibility must be verified before upload');
assert.match(
  uploadRoute,
  /const storageClient = resolvedStorage\.client;[\s\S]*storageClient\.storage[\s\S]*\.getPublicUrl\(filePath\)/,
  'upload and public URL generation must use the resolved storage project',
);

const directIndex = avatarImage.indexOf('candidates.push(directSrc)');
const proxyIndex = avatarImage.indexOf('candidates.push(`/media/avatar/');
assert.ok(proxyIndex >= 0 && directIndex > proxyIndex, 'avatars must prefer the same-origin proxy for persistent avatars');

assert.ok(
  optimizedImage.includes('if (/^https?:\\/\\//i.test(src) && finalSrc !== src) return src;'),
  'optimized feed images must fall back to the original URL before showing the transparent placeholder',
);
assert.match(
  postMediaGrid,
  /data-media-image-state=\{imageState\}/,
  'feed media tiles must expose the loaded state used to hide carousel placeholders',
);

console.log('Image storage contract guards passed.');
