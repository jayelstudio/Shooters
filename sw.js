// Buckets service worker — offline support.
// Bump CACHE to force clients to fetch fresh copies on next load.
const CACHE = 'buckets-v3';

// App shell (same-origin). Paths are relative to the SW location (repo root).
const LOCAL = [
  './', './index.html', './styles.css', './manifest.json',
  './icon-192.png', './icon-512.png',
  './src/main.js', './src/game.js', './src/ball.js', './src/player.js',
  './src/arena.js', './src/audio.js', './src/config.js', './src/materials.js',
  './src/glovebuild.js',
  './arrow-left.svg', './arrow-right.svg', './timeout-btn.svg',
  './continue-btn.svg', './end-game-btn.svg',
  './bball.png', './buckets-splash.png', './buckets-arena.jpg',
  './ball/basketball.obj', './ball/basketball.jpg', './ball/basketball_NORM.jpg',
  './grunt-1.mp3', './grunt-2.mp3', './grunt-3.mp3', './ball-bounce.mp3',
  './rim.mp3', './backboard.mp3', './net.mp3',
];

// Cross-origin deps fetched at runtime (the SW doesn't control the very first
// page load, so precache these so the first offline launch still works).
const CDN = [
  'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/loaders/OBJLoader.js',
];

// Best-effort (may not exist yet): background music tracks.
const OPTIONAL = [
  './background-1.mp3', './background-2.mp3', './background-3.mp3',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL);                 // must all succeed
    await Promise.allSettled([...CDN, ...OPTIONAL].map((u) => cache.add(u))); // best-effort
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isStatic = (url) =>
  /\.(png|jpe?g|svg|obj|glb|gltf|woff2?|css|mp3|m4a|ogg|wav)(\?|$)/i.test(url) ||
  url.includes('cdn.jsdelivr.net') ||
  url.includes('fonts.googleapis.com') ||
  url.includes('fonts.gstatic.com');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Static assets + CDN: cache-first (fast, offline-safe, versioned URLs).
  if (isStatic(req.url)) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          const c = await caches.open(CACHE); c.put(req, res.clone());
        }
        return res;
      } catch (err) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // HTML / modules: network-first so code updates land, cache fallback offline.
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }
  })());
});
