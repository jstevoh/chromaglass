/*
 * ChromaGlass service worker.
 *
 * Here for one reason: Chrome and Edge offer "Install app" only to a page
 * with a service worker, and an installed ChromaGlass gets its own dock icon
 * and a window with no browser chrome — a show window. It caches lightly:
 * hashed assets for good (their names change when they change), the page
 * itself network-first so a new build is picked up on the next open, and it
 * never touches the show server's relay or the remote-info probe.
 *
 * ── Why `res.ok` is not enough ──
 *
 * Firebase Hosting rewrites everything that does not match a file to
 * `/index.html`, which is what makes an SPA's deep links work. It applies to
 * `/assets/` too: a chunk from a previous deploy does not 404 after the next
 * one, it comes back as **index.html with status 200**. Measured against the
 * live site:
 *
 *     GET /assets/App-DOESNOTEXIST.js  →  200  text/html  1320 bytes
 *
 * The asset handler used to cache anything with `res.ok`, so a stale page
 * asking for its old chunk stored HTML under a `.js` URL. Cache-first then
 * served that HTML for good — the cache name never changed, so nothing ever
 * cleared it — and the browser cannot parse HTML as a module. The whole app
 * is lazy-loaded behind a black `<Suspense>` fallback, so the result is a
 * black screen that survives every reload.
 *
 * A 200 of HTML under a script URL is a file that is gone. It is never
 * cached, and never served from the cache if an older worker left one there.
 */
const VERSION = 'chromaglass-v2';   // bumped: v1's caches may hold poisoned entries
const NEVER = ['/remote-ws', '/remote-info.json'];

/** A response that is HTML where a script or a stylesheet was asked for. */
const isHtml = (res) => (res.headers.get('content-type') || '').toLowerCase().includes('text/html');

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
    // Immutable, hashed: cache first — but only ever cache the real thing.
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      if (hit && !isHtml(hit)) return hit;
      if (hit) await cache.delete(req);          // a rewrite got in here: drop it
      const res = await fetch(req);
      if (res.ok && !isHtml(res)) cache.put(req, res.clone());
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
