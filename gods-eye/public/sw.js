// Offline shell for God's Eye. The world itself lives in this device's storage,
// so once the app is cached it keeps playing with no network at all.

const CACHE = 'gods-eye-shell-v2';
const SCOPE = new URL('./', self.location.href).href;
const SHELL = [SCOPE, `${SCOPE}index.html`, `${SCOPE}manifest.webmanifest`];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(event.request);
          if (res.ok) {
            const cache = await caches.open(CACHE);
            cache.put(`${SCOPE}index.html`, res.clone()).catch(() => {});
          }
          return res;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match(`${SCOPE}index.html`)) || (await cache.match(SCOPE)) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(event.request);
      if (hit) return hit;
      try {
        const res = await fetch(event.request);
        if (res.ok && (url.pathname.includes('/assets/') || /\.(png|svg|webmanifest)$/.test(url.pathname))) {
          cache.put(event.request, res.clone()).catch(() => {});
        }
        return res;
      } catch {
        return Response.error();
      }
    })(),
  );
});
