/**
 * Offline shell for the installed game.
 *
 * Network-first with the HTTP cache bypassed: while online every page load and
 * asset fetch comes from the live build, so new code and graphics replace the
 * cached ones. Offline, the last successfully cached shell and assets are used.
 */
const CACHE = 'kotfi-app-v5';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png?v=2',
  './icons/icon-512.png?v=2',
  './icons/icon-maskable-512.png?v=2',
  './icons/apple-touch-icon.png?v=2'
];

const scopeUrl = (path) => new URL(path, self.registration.scope).href;
const freshRequest = (path) => new Request(scopeUrl(path), { cache: 'reload' });

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE.map(freshRequest));
    // The JS/CSS names are hashed at build time, so read them out of the shell
    // and precache them now. Otherwise the very first visit would have HTML
    // offline but no game code until a second online load.
    const shell = await cache.match(scopeUrl('./index.html'));
    if (shell) {
      const html = await shell.text();
      const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((path) => path.includes('/assets/'))
        .map((path) => scopeUrl(path));
      await cache.addAll([...new Set(assets)].map((url) => new Request(url, { cache: 'reload' })));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never intercept the graphics library or any other origin.
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      // no-store bypasses the HTTP cache as well as the service-worker cache.
      const response = await fetch(request, { cache: 'no-store' });
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await caches.match(scopeUrl('./index.html'));
        if (shell) return shell;
      }
      return new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
