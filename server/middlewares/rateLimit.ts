import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOW_VALUE_TELEMETRY_PATHS = new Set([
  '/api/posts/views',
  '/api/rum/web-vitals',
]);

function isStaticAssetPath(path: string) {
  return (
    path.startsWith('/assets/')
    || path.startsWith('/uploads/')
    || path === '/favicon.ico'
    || path === '/manifest.webmanifest'
    || path === '/icon.png'
    || path === '/apple-touch-icon.png'
    || /\.(?:js|css|map|png|jpg|jpeg|webp|avif|svg|ico|woff2?)$/i.test(path)
  );
}

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1800,
  message: { error: '请求过于频繁，请稍后再试 (Too many requests, please try again later)' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    SAFE_METHODS.has(req.method)
    || isStaticAssetPath(req.path)
    || LOW_VALUE_TELEMETRY_PATHS.has(req.path),
  validate: { trustProxy: true },
});

export const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: '访问过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'GET' || isStaticAssetPath(req.path),
  validate: { trustProxy: true },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // limit each IP to 30 auth requests per hour
  message: { error: '认证接口请求过频，已限制访问 (Too many auth requests, IP blocked temporarily)' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const username = typeof req.body?.username === 'string'
      ? req.body.username.trim().toLowerCase().slice(0, 64)
      : 'anonymous';
    return `${ipKeyGenerator(req.ip || '0.0.0.0')}:${username || 'anonymous'}`;
  },
  validate: { trustProxy: true },
});

export const postLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 50, // limit each IP to 50 post creations/updates
  message: { error: '发布过于频繁，请稍后再试 (Too many posts, slow down)' },
  validate: { trustProxy: true },
});

export const shareLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 80,
  message: { error: '分享过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: true },
});

export const likeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: '互动过于频繁，请稍后再试 (Like too frequently)' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: true },
});


export const viewLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 180,
  message: { error: '浏览过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: true },
});

export const orderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 12,
  message: { error: '订单创建过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: true },
});

export const orderScanLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 90,
  message: { error: '订单扫描过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: true },
});

export const promotionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: '推广操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: true },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: '上传操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: true },
});

export const followLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: '关注操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: true },
});
