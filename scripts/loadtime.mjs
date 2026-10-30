#!/usr/bin/env node
/**
 * Does the page ask for what the show needs at once, rather than in a chain?
 *
 *   npm run loadtime
 *
 * What was reported: the show takes a long time to load on the web. Two
 * waits were in a row that need not be. The page's entry (React and the
 * black box) had to arrive and run before it asked for the app's own chunks,
 * a round trip and the entry's whole run late; and the GPU was asked for only
 * once those chunks had arrived, run and drawn, when Chromium's start of it
 * takes seconds on a cold Mac (`npm run startup`'s "held" line) and could
 * have happened during the download. The build now writes the app's chunks
 * into the page as preloads (`vite.config.ts`), and `main.tsx` asks for the
 * GPU before it imports the app (`gpu/device.ts`).
 *
 * The built site is served the way Firebase serves it (Brotli, the SPA
 * rewrite) on a network slowed to a home connection's round trip and
 * bandwidth, and opened as the show, as the remote and as a cast. The times
 * are printed; what is judged is the order, which is the feature, and which
 * no fast or slow runner can change:
 *
 *   1. the app's chunks are asked for before the entry has finished arriving,
 *      every one the app imports (not after the entry has run)
 *   2. the GPU is asked for before the app's chunk has finished arriving,
 *      and once: the stage takes that answer rather than asking again
 *   3. the remote and a cast fetch their own chunk and no App chunk, the
 *      remote asks for no GPU and a cast none before its own chunk has run:
 *      a phone opening the remote downloads the remote and nothing else
 *   4. the webpage at chromaglass.art (PLAN.md 14v-9), on a second build that
 *      has a sign-in (a demo Firebase config: the webpage exists only then):
 *      its own chunks are asked for beside the entry, no App chunk before the
 *      pictures it shows at once have arrived, and no GPU while it is read,
 *      since Chromium's start of the GPU holds the page's whole thread; a
 *      pointer over Play asks for it, once, for a visitor whose Play opens
 *      the show (never for one it sends to the sign-in), the press adds no
 *      second ask, and the show opens at /show. Measured on the live site
 *      2026-10-28 before this: the app's 590 kB asked at 0.76 s beside the
 *      entry, the webpage's chunk at 1.40 s, its first picture at 1.67 s.
 *
 * Linux needs no GPU for any of it: the request is counted when it is made,
 * whatever it answers. With `PW_WEBGPU=1` it also prints when the first
 * shader was handed over, which is where the GPU's own wait begins.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, extname, resolve } from 'node:path';
import { brotliCompressSync } from 'node:zlib';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const DIST = resolve(process.env.LOADTIME_DIST ?? 'dist');
/** The site built with a sign-in, the way the hosted one is: the only build with a webpage (main.tsx). */
const LANDING_DIST = resolve(process.env.LOADTIME_LANDING_DIST ?? 'dist-landing');
const SIGN_IN_ENV = {
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-chromaglass.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-chromaglass',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000',
};
if (!process.env.LOADTIME_LANDING_DIST) {
  execSync(`npx vite build --outDir ${LANDING_DIST} --emptyOutDir`, { env: { ...process.env, ...SIGN_IN_ENV }, stdio: ['ignore', 'ignore', 'inherit'] });
}
/** A home connection: what a show's laptop on a venue's wifi gets on a good day. */
const RTT_MS = 100;
const DOWN_MBPS = 10;

const TYPES = { '.webp': 'image/webp', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg' };
/*
  Compressed before the first request: Brotli at its best setting takes a
  second or more on the biggest chunk, and done on the request it read as a
  slow download (3.7 s for 166 kB on the first try).
*/
const packed = new Map();
const pack = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) pack(p);
    else if (/\.(html|js|css|svg|json|webmanifest)$/.test(e.name)) packed.set(p, brotliCompressSync(readFileSync(p)));
  }
};
pack(DIST);
pack(LANDING_DIST);
const serve = (root) => createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(root, path);
  // Firebase's rewrite: anything that is not a file is the page.
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  let body = readFileSync(file);
  const headers = { 'content-type': type, 'cache-control': 'no-store' };
  if (packed.has(file) && /\bbr\b/.test(req.headers['accept-encoding'] ?? '')) {
    body = packed.get(file);
    headers['content-encoding'] = 'br';
  }
  res.writeHead(200, headers);
  res.end(body);
});
const server = serve(DIST);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const landingServer = serve(LANDING_DIST);
await new Promise((r) => landingServer.listen(0, '127.0.0.1', r));
const landingBase = `http://127.0.0.1:${landingServer.address().port}`;

const browser = await launchChromium(chromium);

/** One opening of `query`, on the slowed network, read once its chunks have all arrived. */
async function open(query, { site = base, before, after } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  if (before) await page.addInitScript(before);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: RTT_MS, downloadThroughput: DOWN_MBPS * 1e6 / 8, uploadThroughput: 2e6 / 8 });
  await page.addInitScript(() => {
    const at = window.__loadAt = {};
    const mark = (k) => { if (at[k] === undefined) at[k] = performance.now(); };
    // Every request's time, and proof the hook went in: without it "not
    // asked" would be read off a page that asked (the check-skeptic's
    // control, with the hook taken out, read the remote's row as ok).
    at.asks = [];
    const gpu = globalThis.GPU?.prototype;
    if (gpu?.requestAdapter) {
      at.hooked = true;
      const f = gpu.requestAdapter;
      gpu.requestAdapter = function (...a) { mark('adapter asked'); at.asks.push(performance.now()); return f.apply(this, a).then((v) => { mark('adapter given'); return v; }); };
    }
    const ad = globalThis.GPUAdapter?.prototype;
    if (ad?.requestDevice) {
      const f = ad.requestDevice;
      ad.requestDevice = function (...a) { return f.apply(this, a).then((v) => { mark('device given'); return v; }); };
    }
    const dev = globalThis.GPUDevice?.prototype;
    if (dev?.createShaderModule) {
      const f = dev.createShaderModule;
      dev.createShaderModule = function (...a) { mark('first shader'); return f.apply(this, a); };
    }
  });
  await page.goto(`${site}/${query}`, { waitUntil: 'load' });
  // Every script the page will fetch at the start, including what the app
  // imports once it runs.
  await page.waitForTimeout(3000);
  const read = () => page.evaluate(() => ({
    at: JSON.parse(JSON.stringify(window.__loadAt)),
    res: performance.getEntriesByType('resource')
      .filter((e) => /\/assets\/.*\.js$/.test(new URL(e.name).pathname))
      .map((e) => ({ file: new URL(e.name).pathname.replace('/assets/', ''), start: e.startTime, end: e.responseEnd, bytes: e.encodedBodySize })),
    pictures: performance.getEntriesByType('resource')
      .filter((e) => /^\/landing\//.test(new URL(e.name).pathname))
      .map((e) => ({ file: new URL(e.name).pathname, start: e.startTime, end: e.responseEnd })),
  }));
  const got = await read();
  if (after) got.after = await after(page, read);
  await page.close();
  if (got.at.hooked !== true) throw new Error('loadtime: GPU.prototype.requestAdapter is not here to count; this Chromium measures nothing for 2 and 3');
  return got;
}

const s = (ms) => (ms === undefined ? 'never' : `${(ms / 1000).toFixed(2)} s`);
const file = (r, name) => r.res.find((x) => x.file === name);

/*
  What the built page names, read from the page itself rather than guessed
  from file names: the entry its module script loads, and the chunks its
  preload list asks for (vite.config.ts). Vite names any lazy chunk built
  from an index.ts "index-*.js" too, so a pattern could pick the wrong one.
*/
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const entryFile = html.match(/<script type="module"[^>]*src="\/assets\/([^"]+)"/)?.[1];
const preloads = JSON.parse(html.match(/for\(const h of (\[[^\]]*\])\)/)?.[1] ?? '[]').map((h) => h.replace('/assets/', ''));
const appFile = preloads.find((f) => /^App-/.test(f));

console.log(`loadtime: ${DIST}, served with Brotli over ${RTT_MS} ms round trips at ${DOWN_MBPS} Mb/s`);
console.log(`  the page: entry ${entryFile ?? 'none'}; preloads ${preloads.length ? preloads.join(', ') : 'none'}`);
const show = await open('?look=classic');
const e = file(show, entryFile);
const a = file(show, appFile) ?? show.res.find((x) => /^App-/.test(x.file));
console.log(`  the show: entry ${s(e?.start)}–${s(e?.end)}; app ${s(a?.start)}–${s(a?.end)}; all scripts in by ${s(Math.max(...show.res.map((x) => x.end)))}`);
console.log(`     GPU: adapter asked ${s(show.at['adapter asked'])} (${show.at.asks.length} time${show.at.asks.length === 1 ? '' : 's'}), given ${s(show.at['adapter given'])}; device given ${s(show.at['device given'])}; first shader ${s(show.at['first shader'])}`);
for (const x of show.res) console.log(`     ${x.file.padEnd(42)} ${s(x.start)}–${s(x.end)}  ${(x.bytes / 1024).toFixed(0)} kB`);

// The network really was slowed: an entry in faster than one round trip
// means the throttle did not take, and the order below measures nothing.
if (!e) throw new Error(`loadtime: the entry ${entryFile} was not fetched`);
if (e.end - e.start < RTT_MS) throw new Error(`loadtime: the entry arrived in ${Math.round(e.end - e.start)} ms, under one ${RTT_MS} ms round trip: the network was not slowed`);

// What the app imports: every script that arrived, but the entry, the app's
// own and the workers it starts later.
const deps = show.res.filter((x) => x !== e && x !== a && !/Worker-/.test(x.file));
/*
  And the preload list must hold every chunk the app imports statically, read
  from the built files themselves, so a chunk the app gains is preloaded too.
  Not every script fetched: a lazy import() the app makes on its first render
  is rightly not preloaded, and would be fetched in these three seconds.
*/
const statics = new Set();
const walk = (f) => {
  if (!f || f === entryFile || statics.has(f)) return;
  statics.add(f);
  const code = readFileSync(join(DIST, 'assets', f), 'utf8');
  for (const m of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) walk(m[1]);
};
walk(a?.file);
const missing = [...statics].filter((f) => !preloads.includes(f)).sort();
const late = [a, ...deps].filter((x) => !x || x.start >= e.end);
check('1. the app and every chunk it imports are asked for before the entry has finished arriving',
  a && appFile && late.length === 0 && missing.length === 0,
  `entry in at ${s(e.end)}; ${!a || !appFile ? 'no App chunk in the page\'s preloads or fetched' : late.length ? `asked after it: ${late.map((x) => `${x?.file} at ${s(x?.start)}`).join(', ')}` : `app asked at ${s(a.start)}, ${deps.length} more by ${s(Math.max(...deps.map((x) => x.start)))}`}${missing.length ? `; not in the preloads: ${missing.join(', ')}` : ''}`);

/*
  Asked early, and the early answer taken: the stage's own request comes
  once the app has run, so a second request within a second of the first
  is the stage asking again because it did not get the early one (and the
  GPU started twice). A lost device asks again much later, if at all.
*/
const asked = show.at['adapter asked'];
const again = show.at.asks.filter((t) => t - asked < 1000).length - 1;
check('2. the GPU is asked for before the app\'s chunk has finished arriving, once',
  a && asked !== undefined && asked < a.end && again === 0,
  `adapter asked at ${s(asked)}, app in at ${s(a?.end)}${again > 0 ? `; asked ${again} more time(s) within a second of it` : ''}`);

for (const [q, own] of [['?remote', /^RemoteControl-/], ['?cast', /^CastDisplay-/]]) {
  const r = await open(q);
  const mine = r.res.find((x) => own.test(x.file));
  const appChunk = r.res.find((x) => x.file === a?.file || /^App-/.test(x.file));
  const at = r.at['adapter asked'];
  // A cast asks for a GPU of its own when it has no canvas of the show's to
  // mirror (CastDisplay.tsx), as it always has, but only once its own chunk
  // has arrived and run; one asked before that is main.tsx's. The remote
  // never asks.
  const gpuOk = at === undefined || (q === '?cast' && mine && at >= mine.end);
  check(`3. ${q} fetches its own chunk and no App chunk, and ${q === '?remote' ? 'asks for no GPU' : 'no GPU before its own chunk is in'}`,
    mine && a && !appChunk && gpuOk,
    `${r.res.length} scripts (${r.res.map((x) => x.file.replace(/-[\w-]{8}\.js$/, '')).join(', ')}), ${(r.res.reduce((n, x) => n + x.bytes, 0) / 1024).toFixed(0)} kB; GPU ${at === undefined ? 'not asked' : `asked at ${s(at)}${mine ? `, its chunk in at ${s(mine.end)}` : ''}`}`);
}

/*
  4. The webpage. A visitor signed in at the start (the flag main.tsx reads
  before it draws anything), so Play opens the show rather than the sign-in
  card and the GPU it asks for is counted here. The demo sign-in has no user,
  so Firebase clears the flag a moment later (firebaseAuth.ts); the pointer's
  two passes over Play set it as they need it: cleared, a pointer over Play
  must ask for nothing (a visitor whose Play opens the sign-in card); set, it
  asks once, and the press after it adds nothing.
*/
const lhtml = readFileSync(join(LANDING_DIST, 'index.html'), 'utf8');
const lentry = lhtml.match(/<script type="module"[^>]*src="\/assets\/([^"]+)"/)?.[1];
const lists = [...lhtml.matchAll(/for\(const h of (\[[^\]]*\])\)/g)].map((m) => JSON.parse(m[1]).map((h) => h.replace('/assets/', '')));
const lapp = (lists[0] ?? []).find((f) => /^App-/.test(f));
const lown = lists[1] ?? [];
const land = await open('', {
  site: landingBase,
  before: () => { try { localStorage.setItem('chromaglass-signed-in', '1'); } catch { /* counted below: no webpage */ } },
  after: async (page, read) => {
    const eager = await page.evaluate(() => [...document.querySelectorAll('[data-cg-landing] img:not([loading=lazy])')].map((i) => new URL(i.src).pathname));
    if (!eager.length || !(await page.$('[data-cg-landing-play]'))) return { shown: false };
    const now = () => page.evaluate(() => performance.now());
    const asksSince = (t) => page.evaluate((t) => window.__loadAt.asks.filter((a) => a >= t).length, t);
    const away = () => page.mouse.move(2, 2);
    await away();
    const t0 = await now();
    await page.evaluate(() => localStorage.removeItem('chromaglass-signed-in'));
    await page.hover('[data-cg-landing-play]');
    await page.waitForTimeout(500);
    const signedOut = await asksSince(t0);
    await away();
    await page.evaluate(() => localStorage.setItem('chromaglass-signed-in', '1'));
    const t1 = await now();
    await page.hover('[data-cg-landing-play]');
    await page.waitForTimeout(500);
    const hover = await asksSince(t1);
    const t2 = await now();
    await page.click('[data-cg-landing-play]');
    await page.waitForTimeout(2000);
    const press = await asksSince(t2);
    const opened = await page.evaluate(() => location.pathname === '/show' && !document.querySelector('[data-cg-landing]'));
    return { shown: true, eager, t0, signedOut, hover, press, opened, ...(await read()) };
  },
});
const le = file(land, lentry);
const lchunks = lown.map((f) => land.res.find((x) => x.file === f));
const lapps = land.res.filter((x) => x.file === lapp);
const eager = land.after?.eager ?? [];
const eagerIn = eager.length ? Math.max(...land.pictures.filter((x) => eager.includes(x.file)).map((x) => x.end)) : undefined;
const twice = [...new Set(land.pictures.map((x) => x.file))].filter((f) => land.pictures.filter((x) => x.file === f).length > 1);
const pl = land.after;
console.log(`  the webpage: entry ${s(le?.start)}–${s(le?.end)}; its chunks asked ${lchunks.map((x) => s(x?.start)).join(', ') || 'none'}; its ${eager.length} pictures shown at once in by ${s(eagerIn)} (${land.pictures.length} pictures asked${twice.length ? `, ${twice.length} of them twice` : ''}); app asked ${s(lapps[0]?.start)}; GPU asked ${s(land.at['adapter asked'])}`);
check('4a. at the webpage\'s address its own chunks are asked for before the entry has finished arriving',
  le && lown.length > 0 && lown.some((f) => /^Landing-/.test(f)) && lchunks.every((x) => x && x.start < le.end),
  `entry in at ${s(le?.end)}; ${lown.length ? lown.map((f, i) => `${f} asked at ${s(lchunks[i]?.start)}`).join(', ') : 'no preload list for the webpage in the page'}`);
check('4b. and the app is asked for only once the pictures the webpage shows at once have arrived',
  lapp && eagerIn !== undefined && lapps.length > 0 && lapps[0].start >= eagerIn,
  `${eager.length} pictures in by ${s(eagerIn)}, ${lapp ?? 'no App chunk in the page'} asked at ${s(lapps[0]?.start)}`);
check('4c. and no GPU is asked for while the webpage is read, nor by a pointer over Play for a visitor whose Play opens the sign-in (Chromium\'s start of it holds the page)',
  pl?.shown && !land.at.asks.some((t) => t < pl.t0) && pl.signedOut === 0,
  pl?.shown ? `adapter ${land.at.asks.some((t) => t < pl.t0) ? `asked at ${s(land.at['adapter asked'])}, before the pointer came` : `not asked in the first ${s(pl.t0)}`}; ${pl.signedOut} asked by the pointer, signed out` : 'no webpage drawn with a sign-in in the build');
check('4d. a pointer over Play asks for the GPU, once, the press adds none, and the show opens at /show',
  pl?.shown && pl.hover === 1 && pl.press === 0 && pl.at.asks.length === 1 && pl.opened,
  pl?.shown ? `${pl.hover} asked by the pointer, ${pl.press} by the press, ${pl.at.asks.length} in all; ${pl.opened ? 'the show at /show' : 'the show did not open'}` : 'Play not reached');

await browser.close();
server.close();
landingServer.close();
const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
