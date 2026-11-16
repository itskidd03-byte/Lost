// Offline shell for God's Eye. The world itself lives in this device's storage,
// so once the app is cached it keeps playing with no network at all.
//
// The art the table is built from (medieval kit, people, animals, terrain
// textures) is cached up front too, so an offline board is drawn from the same
// models as an online one instead of falling back to the painted stand-ins.

const CACHE = 'gods-eye-shell-v8';
const SCOPE = new URL('./', self.location.href).href;
const SHELL = [SCOPE, `${SCOPE}index.html`, `${SCOPE}manifest.webmanifest`];

const ART = [
  ...['wall', 'wall-door', 'wall-window', 'roof', 'roof-side', 'roof-corner', 'floor-flat', 'fence',
    'fence-wood', 'detail-crate', 'barrels', 'tree-large', 'stairs-stone', 'structure']
    .map((name) => `${SCOPE}models/medieval/${name}.glb`),
  ...['barrel', 'cobblestone', 'cobblestoneAlternative', 'cobblestonePainted', 'details',
    'fence', 'planks', 'roof', 'tree', 'water']
    .map((name) => `${SCOPE}models/medieval/Textures/${name}.png`),
  ...['peasant_1', 'peasant_2', 'peasant_3', 'peasant_4', 'city_dwellers_1', 'city_dwellers_2', 'king', 'queen']
    .map((name) => `${SCOPE}models/people/${name}.glb`),
  ...['BrownCow', 'Sheep', 'Deer', 'RedFox', 'Chicken', 'ChestnutHorse', 'Goat', 'PekinDuck']
    .map((name) => `${SCOPE}models/animals/${name}.glb`),
  ...['grass', 'meadow', 'forest', 'deepforest', 'blackgrass', 'hills',
    'mountain', 'peak', 'desert', 'tundra', 'swamp', 'island']
    .map((name) => `${SCOPE}textures/terrain/${name}.webp`),
];

const isArt = (pathname) => /\/models\/.*\.glb$/.test(pathname) || /\/textures\/.*\.(webp|jpg|png)$/.test(pathname);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(SHELL).catch(() => {});
        // one at a time: a single missing file must not abort the install
        for (const url of ART) {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok) await cache.put(url, res);
          } catch {
            // offline during install: the runtime cache picks it up later
          }
        }
      })
      .then(() => self.skipWaiting()),
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
        if (res.ok && (url.pathname.includes('/assets/') || isArt(url.pathname) || /\.(png|svg|webmanifest)$/.test(url.pathname))) {
          cache.put(event.request, res.clone()).catch(() => {});
        }
        return res;
      } catch {
        return Response.error();
      }
    })(),
  );
});
