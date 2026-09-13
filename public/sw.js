/*
 * ChromaGlass service worker.
 *
 * Here for one reason: Chrome and Edge offer "Install app" only to a page
 * with a service worker, and an installed ChromaGlass gets its own dock icon
 * and a window with no browser chrome — a show window. It caches lightly:
 * hashed assets for good (their names change when they change), the page
 * itself network-first so a new build is picked up on the next open, and it
 * never touches the show server's relay or the remote-info probe.
 */
const VERSION = 'chromaglass-v1';
const NEVER = ['/remote-ws', '/remote-info.json'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.some(p => url.pathname.startsWith(p))) return;

  if (url.pathname.startsWith('/assets/')) {
    // Immutable, hashed: cache first.
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    // The page: network first, the last good copy when the network is gone.
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put('/', res.clone());
        return res;
      } catch {
        return (await cache.match('/')) ?? Response.error();
      }
    })());
  }
});
