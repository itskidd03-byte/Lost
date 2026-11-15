/**
 * Offline shell for the installed game.
 *
 * Network-first: while online every page load and asset fetch comes from the
 * network first, so a new build (and its graphics code) replaces the cached one.
 * Offline, the last successfully cached shell and assets are served instead.
 */
const CACHE = 'kotfi-app-v2';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // The JS/CSS names are hashed at build time, so read them out of the shell
    // and precache them now. Otherwise the very first visit would have HTML
    // offline but no game code until a second online load.
    const shell = await cache.match('./index.html');
    if (shell) {
      const html = await shell.text();
      const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((path) => path.includes('/assets/'))
        .map((path) => new URL(path, self.registration.scope).href);
      await cache.addAll([...new Set(assets)]);
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
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      return new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
