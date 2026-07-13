const APP_SHELL_CACHE = 'tuitui-app-shell-v20';
const STATIC_CACHE = 'tuitui-static-v20';
const IMAGE_CACHE = 'tuitui-images-v20';
const MAX_APP_SHELL_ENTRIES = 12;
const MAX_STATIC_ENTRIES = 90;
const MAX_IMAGE_ENTRIES = 120;

const STATIC_EXTENSIONS = [
  '.js',
  '.css',
  '.woff2',
  '.woff',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.svg',
  '.ico',
  '.webmanifest',
];

const APP_ICON_PATHS = new Set([
  '/manifest.webmanifest',
  '/favicon-32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.png',
  '/apple-touch-icon.png',
]);

const APP_SHELL_PRECACHE_PATHS = [
  '/',
  '/manifest.webmanifest',
  '/favicon-32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isApiRequest(requestUrl) {
  return isSameOrigin(requestUrl) && requestUrl.pathname.startsWith('/api/');
}

function isAppIconAsset(requestUrl) {
  return isSameOrigin(requestUrl) && APP_ICON_PATHS.has(requestUrl.pathname);
}

function isStaticAsset(requestUrl) {
  if (!isSameOrigin(requestUrl)) return false;
  if (requestUrl.pathname.startsWith('/assets/')) return true;
  return STATIC_EXTENSIONS.some((ext) => requestUrl.pathname.endsWith(ext));
}

function isImageRequest(request) {
  return request.destination === 'image';
}

function isNavigationRequest(request, requestUrl) {
  return request.mode === 'navigate' && isSameOrigin(requestUrl) && !isApiRequest(requestUrl);
}

async function matchCachedResponse(request, preferredCacheName) {
  if (preferredCacheName) {
    const preferredCache = await caches.open(preferredCacheName);
    const preferredMatch = await preferredCache.match(request);
    if (preferredMatch) return preferredMatch;
  }
  return caches.match(request);
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

async function staleWhileRevalidate(request, cacheName, options = {}) {
  const cache = await caches.open(cacheName);
  const cached = await matchCachedResponse(request, cacheName);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
        if (options.maxEntries) void trimCache(cacheName, options.maxEntries);
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

async function networkFirst(request, cacheName, options = {}) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      if (options.maxEntries) void trimCache(cacheName, options.maxEntries);
    }
    return response;
  } catch {
    const cached = await matchCachedResponse(request, cacheName);
    if (cached) return cached;
    throw new Error('Network unavailable and no cached response found.');
  }
}

async function deleteOldCaches() {
  const keep = new Set([APP_SHELL_CACHE, STATIC_CACHE, IMAGE_CACHE]);
  const names = await caches.keys();
  await Promise.all(names.map((name) => keep.has(name) ? undefined : caches.delete(name)));
}

function normalizePushPayload(event) {
  if (!event.data) return null;
  try {
    const payload = event.data.json();
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    const body = event.data.text();
    return body ? { title: 'TuiTui', body, targetUrl: '/messages' } : null;
  }
}

function normalizeNotificationTarget(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/messages';
  return raw;
}

function normalizeNotificationType(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function getNotificationTitle(payload) {
  const rawTitle = typeof payload.title === 'string' ? payload.title.trim() : '';
  const type = normalizeNotificationType(payload.type);
  if (!rawTitle || rawTitle === '推推' || rawTitle === 'TuiTui') {
    if (type === 'FOLLOW') return '新的关注';
    if (type === 'COMMENT') return '新的评论';
    if (type === 'QUOTE') return '新的引用';
    if (type === 'LIKE') return '新的点赞';
    if (type === 'RECHARGE') return '充值提醒';
    if (type === 'PROMOTION') return '推广提醒';
    if (type === 'SYSTEM') return '平台通知';
  }
  return rawTitle || 'TuiTui';
}

async function focusOrOpenTarget(targetUrl) {
  const absoluteTarget = new URL(targetUrl, self.location.origin).toString();
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  for (const client of windowClients) {
    try {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin !== self.location.origin) continue;
      if ('focus' in client) {
        await client.focus();
      }
      if ('navigate' in client && client.url !== absoluteTarget) {
        await client.navigate(absoluteTarget);
      }
      return;
    } catch {
      // Ignore malformed client URLs and keep looking for a usable client.
    }
  }

  await self.clients.openWindow(absoluteTarget);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_PRECACHE_PATHS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOldCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (isApiRequest(requestUrl)) return;

  if (isNavigationRequest(request, requestUrl)) {
    event.respondWith(networkFirst(request, APP_SHELL_CACHE, { maxEntries: MAX_APP_SHELL_ENTRIES }));
    return;
  }

  if (isAppIconAsset(requestUrl)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE, { maxEntries: MAX_STATIC_ENTRIES }));
    return;
  }

  if (isImageRequest(request)) {
    // External CDNs already provide their own cache headers. Let the browser load
    // them directly to avoid no-cors/opaque image responses being replayed by SW.
    if (!isSameOrigin(requestUrl)) return;
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, { maxEntries: MAX_IMAGE_ENTRIES }));
    return;
  }

  if (requestUrl.pathname.startsWith('/assets/')) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE, { maxEntries: MAX_STATIC_ENTRIES }));
    return;
  }

  if (isStaticAsset(requestUrl)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE, { maxEntries: MAX_STATIC_ENTRIES }));
  }
});

self.addEventListener('push', (event) => {
  const payload = normalizePushPayload(event);
  if (!payload) return;

  const targetUrl = normalizeNotificationTarget(payload.targetUrl || payload.url || '/messages');
  const title = getNotificationTitle(payload);
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const tagSource = payload.notificationId || payload.type || payload.tag || targetUrl;
  const icon = typeof payload.icon === 'string' ? payload.icon : '/icon-192.png';
  const badge = typeof payload.badge === 'string' ? payload.badge : '/favicon-32.png';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: `tuitui:${tagSource}`,
      renotify: false,
      data: {
        targetUrl,
        notificationId: payload.notificationId || '',
        type: payload.type || 'SYSTEM',
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = normalizeNotificationTarget(event.notification?.data?.targetUrl || '/messages');
  event.waitUntil(focusOrOpenTarget(targetUrl));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      windowClients.forEach((client) => {
        client.postMessage({ type: 'tuitui:pushsubscriptionchange' });
      });
    }),
  );
});
