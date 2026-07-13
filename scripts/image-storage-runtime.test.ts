import assert from 'node:assert/strict';
import http from 'node:http';

let bucketPublic = false;
let updateCalls = 0;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && req.url === '/storage/v1/bucket/uploads') {
    res.end(JSON.stringify({ id: 'uploads', name: 'uploads', public: bucketPublic }));
    return;
  }

  if ((req.method === 'PUT' || req.method === 'PATCH') && req.url === '/storage/v1/bucket/uploads') {
    bucketPublic = true;
    updateCalls += 1;
    res.end(JSON.stringify({ message: 'Successfully updated' }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ message: `Unhandled ${req.method} ${req.url}` }));
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const storageOrigin = `http://127.0.0.1:${address.port}`;

  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'image-storage-runtime-test-secret';
  process.env.SUPABASE_URL = storageOrigin;
  process.env.VITE_SUPABASE_URL = storageOrigin;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'image-storage-runtime-test-key';
  // Exercise the request-time repair deterministically; startup repair is
  // covered by the contract guard and uses the same ensure function.
  process.env.AUTO_ENSURE_UPLOAD_BUCKET = '0';

  const storage = await import('../server/routes/upload.routes');
  assert.deepEqual(await storage.getUploadStorageReadiness(), {
    ready: false,
    configured: true,
    reason: 'bucket_private',
  });
  assert.equal(await storage.ensureUploadBucket(), true);
  assert.equal(bucketPublic, true);
  assert.ok(updateCalls >= 1, 'private bucket must be made public');
  assert.deepEqual(await storage.getUploadStorageReadiness(), {
    ready: true,
    configured: true,
    reason: 'ready',
  });

  console.log('Image storage runtime test passed.');
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
