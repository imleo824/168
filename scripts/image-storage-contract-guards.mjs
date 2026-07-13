import assert from 'node:assert/strict';
import fs from 'node:fs';

const uploadRoute = fs.readFileSync('server/routes/upload.routes.ts', 'utf8');
const avatarImage = fs.readFileSync('src/ui/AvatarImage.tsx', 'utf8');

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

const ensureIndex = uploadRoute.indexOf('if (!await ensureUploadBucket())');
const uploadIndex = uploadRoute.indexOf('.upload(filePath, file.buffer, uploadPayload)', ensureIndex);
assert.ok(ensureIndex >= 0 && uploadIndex > ensureIndex, 'bucket visibility must be verified before upload');
assert.match(
  uploadRoute,
  /const storageClient = resolvedStorage\.client;[\s\S]*storageClient\.storage[\s\S]*\.getPublicUrl\(filePath\)/,
  'upload and public URL generation must use the resolved storage project',
);

const directIndex = avatarImage.indexOf('candidates.push(directSrc)');
const proxyIndex = avatarImage.indexOf('candidates.push(`/media/avatar/');
assert.ok(directIndex >= 0 && proxyIndex > directIndex, 'avatars must prefer the public CDN URL');

console.log('Image storage contract guards passed.');
