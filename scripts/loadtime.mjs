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
 *
 * Linux needs no GPU for any of it: the request is counted when it is made,
 * whatever it answers. With `PW_WEBGPU=1` it also prints when the first
 * shader was handed over, which is where the GPU's own wait begins.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { brotliCompressSync } from 'node:zlib';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const DIST = resolve(process.env.LOADTIME_DIST ?? 'dist');
/** A home connection: what a show's laptop on a venue's wifi gets on a good day. */
const RTT_MS = 100;
const DOWN_MBPS = 10;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg' };
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
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(DIST, path);
  // Firebase's rewrite: anything that is not a file is the page.
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
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
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await launchChromium(chromium);

/** One opening of `query`, on the slowed network, read once its chunks have all arrived. */
async function open(query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
  await page.goto(`${base}/${query}`, { waitUntil: 'load' });
  // Every script the page will fetch at the start, including what the app
  // imports once it runs.
  await page.waitForTimeout(3000);
  const got = await page.evaluate(() => ({
    at: window.__loadAt,
    res: performance.getEntriesByType('resource')
      .filter((e) => /\/assets\/.*\.js$/.test(new URL(e.name).pathname))
      .map((e) => ({ file: new URL(e.name).pathname.replace('/assets/', ''), start: e.startTime, end: e.responseEnd, bytes: e.encodedBodySize })),
  }));
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

await browser.close();
server.close();
const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
