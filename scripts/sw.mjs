#!/usr/bin/env node
/**
 * Can a deploy leave someone on a black screen?
 *
 *   npm run sw
 *
 * From a user report: "It seems to be a blank screen on web." The deployed
 * build was fine — it rendered the whole desk in a clean browser at every
 * viewport from 390px to 2560px. What was not fine was what a *returning*
 * browser had stored, and no harness had ever looked at that, because every
 * harness runs in a fresh context where no service worker exists.
 *
 * ── The shape of it ──
 *
 * Firebase Hosting rewrites anything that does not match a file to
 * `/index.html`, which is what makes deep links work in an SPA. It applies to
 * `/assets/` too, so a chunk from a previous deploy does not 404 after the
 * next one — it comes back as index.html with status 200. Measured against
 * the live site:
 *
 *     GET /assets/App-DOESNOTEXIST.js  →  200  text/html  1320 bytes
 *
 * The worker cached `/assets/**` cache-first and stored anything with
 * `res.ok`, so a stale page asking for its old chunk wrote HTML under a `.js`
 * URL. The cache name was a constant that had not changed since the worker
 * landed, and `activate` only deletes caches whose *name* differs, so that
 * entry was permanent. The app is one lazy import behind a `<Suspense>` whose
 * fallback is a black rectangle the size of the window, with nothing catching
 * a rejected import. Black screen, every reload, for good.
 *
 * ── What is checked ──
 *
 * The build is served by a stand-in for Firebase — static files, everything
 * else rewritten to index.html with 200 — which is the one property of the
 * host that matters here.
 *
 *   1. A 200 of HTML under an asset URL is never written to the cache.
 *   2. A chunk that is genuinely gone puts a message and a button on the
 *      screen rather than leaving the black fallback up.
 *
 * The second is what turns any future version of this from a silent black
 * screen into something a person can read and get out of.
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const PORT = 4326;
const DIST = new URL('../dist', import.meta.url).pathname;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  const line = `${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (!process.stdout.isTTY) process.stderr.write(line + '\n');
};

{
  const held = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(PORT, '127.0.0.1');
  });
  if (held) { console.error(`port ${PORT} is in use`); process.exit(2); }
}

/** Serve `root`, and rewrite everything missing to index.html with 200. */
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const serve = (root) => http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(root, url.pathname);
  if (url.pathname !== '/' && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate',
    });
    return res.end(fs.readFileSync(file));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
  res.end(fs.readFileSync(path.join(root, 'index.html')));
});

// A copy of the build with one chunk taken out, standing in for the state a
// browser is in when it asks for something the last deploy replaced.
const BROKEN = fs.mkdtempSync('/tmp/chromaglass-sw-');
fs.cpSync(DIST, BROKEN, { recursive: true });
const appChunk = fs.readdirSync(path.join(BROKEN, 'assets')).find(f => /^App-.*\.js$/.test(f));
if (!appChunk) { console.error('no App chunk in dist — run the build first'); process.exit(2); }
fs.rmSync(path.join(BROKEN, 'assets', appChunk));

const browser = await launchChromium(chromium);

let server;
try {
  // ── 1. The worker must not cache a rewrite ──────────────────────
  server = serve(DIST);
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.reload({ waitUntil: 'load' });          // so the worker is in control
    await page.waitForTimeout(2500);
    const inCharge = await page.evaluate(() => !!navigator.serviceWorker.controller);
    check('the service worker is in control of the page', inCharge);

    const GHOST = '/assets/App-FROMTHELASTDEPLOY.js';
    const got = await page.evaluate(async (u) => {
      const r = await fetch(u);
      const t = await r.text();
      return { status: r.status, html: t.trimStart().startsWith('<!doctype') };
    }, GHOST);
    check('a chunk the host has replaced comes back as a rewritten page',
      got.status === 200 && got.html, `${got.status}, html=${got.html}`);

    const stored = await page.evaluate(async (u) => {
      for (const key of await caches.keys()) {
        const hit = await (await caches.open(key)).match(u);
        if (hit) return { cache: key, html: (await hit.text()).trimStart().startsWith('<!doctype') };
      }
      return null;
    }, GHOST);
    check('and the worker does not store that page under a script URL',
      stored === null, stored ? `${stored.cache} holds html=${stored.html}` : 'nothing cached');
    await ctx.close();
  }
  await new Promise(r => server.close(r));

  // ── 2. A chunk that is gone must not be a black screen ──────────
  server = serve(BROKEN);
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(12000);                  // the reload it takes on the way
    const s = await page.evaluate(() => ({
      text: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
      buttons: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean),
    }));
    check('a missing chunk puts something readable on the screen',
      s.text.length > 0, s.text.slice(0, 90) || 'the page is blank');
    check('and offers a way out of it',
      s.buttons.some(b => /clear the cache/i.test(b)), s.buttons.join(' | ') || 'no buttons');
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) await new Promise(r => server.close(r));
  fs.rmSync(BROKEN, { recursive: true, force: true });
}

const passed = checks.filter(c => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
