#!/usr/bin/env node
/**
 * Do the site's security headers say what the app does, and do they hold?
 *
 *   npm run csp
 *
 * What was reported: the security audit of 2026-10-28 (findings 11 and 18) found
 * `firebase.json` sending no Content-Security-Policy, no frame-ancestors, no
 * Referrer-Policy and no Permissions-Policy. Anything can frame the show, and a
 * script injected into the page runs with the visitor's licence key and their
 * signed-in session in reach.
 *
 * What a header can break is the whole difficulty: WebGPU, the blob workers
 * (`useAudioAnalyzer`'s ticker, `padPicture`), the module workers, Firebase
 * Auth's popup and its iframe, Google's fonts, the landing videos and the music
 * player all load from somewhere, and a policy that misses one is a black
 * screen or a sign-in that does nothing, found by the first visitor. So the
 * policy is two headers (`firebase.json`):
 *
 *   - `Content-Security-Policy`, enforced, of the four directives that cannot
 *     break a page this app serves: frame-ancestors, object-src, base-uri and
 *     form-action. The app has no <object>, no <base>, no form that posts and no
 *     iframe of its own.
 *   - `Content-Security-Policy-Report-Only`, of everything else (scripts,
 *     styles, fonts, images, media, connections, frames, workers), which a
 *     browser only reports in its console. Enforcing it waits on the owner
 *     signing in, playing a song and buying through the live site with the
 *     console open, and on script hashes in place of 'unsafe-inline' (PLAN.md
 *     19ag-2: the preload list in the built page changes with every build).
 *
 * This serves the built site with the headers `firebase.json` gives every path
 * and opens it as the show, the remote, a cast and the two static pages, with
 * what the app does at runtime tried on top (a blob worker, a blob picture, a
 * lookup of lyrics, a Google sign-in's connection). What is judged:
 *
 *   1. `firebase.json` has the headers, each in the form a browser accepts (no
 *      key twice for a path, the enforced policy holds the four directives and
 *      no fetch directive, the report-only one every fetch directive), and the
 *      Auth iframe's own addresses are allowed to frame the page
 *   2. nothing the page does at load or in the tries below is reported by
 *      either policy, and Chromium logs no complaint about any header
 *   3. the tries are not vacuous: a connection to plain http, an eval, a <base>
 *      and an <object> are each reported or blocked by the policy
 *      that should (the control, with the headers taken off, reads all three
 *      as nothing)
 *   4. a page on another origin cannot frame the site
 *   5. the Permissions-Policy lets the page use what the app asks the browser
 *      for (camera, microphone, screen capture, MIDI, fullscreen, window
 *      management, gamepads, clipboard, tilt) and refuses what it never does
 *
 * No GPU is needed: none of it depends on a frame.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const DIST = resolve(process.env.CSP_DIST ?? 'dist');
const CONFIG = resolve(process.env.CSP_CONFIG ?? 'firebase.json');

/** The headers Firebase Hosting would send for `path`, in file order: later rules win a key. */
const hosting = JSON.parse(readFileSync(CONFIG, 'utf8')).hosting;
const catchAll = hosting.headers.filter((h) => h.source === '**');
const headerSets = catchAll.map((h) => h.headers);
const sent = {};
for (const set of headerSets) for (const { key, value } of set) sent[key.toLowerCase()] = value;
const get = (k) => sent[k.toLowerCase()];
const policy = (v) => Object.fromEntries((v ?? '').split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [n, ...rest] = d.split(/\s+/); return [n, rest]; }));

const enforced = policy(get('content-security-policy'));
const reported = policy(get('content-security-policy-report-only'));
const FETCH = ['default-src', 'script-src', 'style-src', 'font-src', 'img-src', 'media-src', 'connect-src', 'frame-src', 'worker-src', 'manifest-src'];
const SAFE = ['frame-ancestors', 'object-src', 'base-uri', 'form-action'];

// 1. The headers, as a browser will read them.
{
  const keys = catchAll.flatMap((h) => h.headers.map((x) => x.key.toLowerCase()));
  const twice = keys.filter((k, i) => keys.indexOf(k) !== i);
  const ancestors = enforced['frame-ancestors'] ?? [];
  const authFrames = ['https://chromaglass.firebaseapp.com', 'https://chromaglass.art', 'https://chromaglass.web.app'];
  /*
    The Auth iframe is the one frame the app depends on: with the default
    `chromaglass.firebaseapp.com` as the auth domain, the page on
    chromaglass.art embeds Firebase's own page from that address, and that page
    is served by this same site, with these same headers. A frame-ancestors that
    named only 'self' would stop the page's own sign-in from opening, so the
    three names of the site are listed, and the report-only frame-src names them
    too (the other direction).
  */
  check('1. firebase.json sends the CSP, Referrer-Policy, Permissions-Policy and nosniff on every path, none twice',
    ['content-security-policy', 'content-security-policy-report-only', 'referrer-policy', 'permissions-policy', 'x-content-type-options'].every((k) => get(k)) && twice.length === 0,
    twice.length ? `sent twice: ${twice.join(', ')}` : `${keys.length} headers`);
  check('1b. the enforced policy holds frame-ancestors, object-src, base-uri and form-action, and no fetch directive',
    SAFE.every((d) => enforced[d]) && FETCH.every((d) => !enforced[d]) && enforced['object-src']?.[0] === "'none'" && enforced['base-uri']?.[0] === "'self'",
    `has ${Object.keys(enforced).join(', ')}`);
  check('1c. the report-only policy holds every fetch directive, and no unsafe-eval',
    FETCH.every((d) => reported[d]) && !JSON.stringify(reported).includes("'unsafe-eval'"),
    `missing ${FETCH.filter((d) => !reported[d]).join(', ') || 'none'}`);
  check('1d. the site\'s three names may frame it (the Auth iframe), and only them and itself',
    authFrames.every((o) => ancestors.includes(o)) && ancestors.includes("'self'") && ancestors.every((a) => a === "'self'" || authFrames.includes(a)) && !ancestors.includes('*'),
    ancestors.join(' '));
  check('1e. the report-only frame-src allows the Auth iframe\'s addresses',
    authFrames.every((o) => (reported['frame-src'] ?? []).includes(o)), (reported['frame-src'] ?? []).join(' '));
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.webm': 'video/webm' };
/** `headers` false serves the site bare: the control for the checks that expect a report. */
const serve = (withHeaders) => {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(DIST, path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' };
    if (withHeaders) for (const [k, v] of Object.entries(sent)) if (k !== 'cache-control') headers[k] = v;
    res.writeHead(200, headers);
    res.end(readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
};
const origin = (s) => `http://127.0.0.1:${s.address().port}`;
const site = await serve(true);
const bare = await serve(false);
const other = await new Promise((r) => { const s = createServer((q, a) => { a.writeHead(200, { 'content-type': 'text/html' }); a.end(`<!doctype html><iframe id="f" src="${origin(site)}/privacy.html" width="300" height="200"></iframe>`); }); s.listen(0, '127.0.0.1', () => r(s)); });

const browser = await launchChromium(chromium);

/** What the app does at runtime, tried on a page that has loaded. Each is a thing the source does today. */
const TRIES = () => {
  const out = [];
  const note = (k, v) => out.push([k, v]);
  try {
    // useAudioAnalyzer's ticker and padPicture's encoder: a worker from a blob.
    const w = new Worker(URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' })));
    w.onerror = () => {};
    note('blob worker', 'started');
  } catch (e) { note('blob worker', String(e)); }
  try {
    // A picture the plate makes (a blob) and a data URL (the pad pictures).
    new Image().src = URL.createObjectURL(new Blob(['x'], { type: 'image/png' }));
    new Image().src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    // The music player's element on a blob (a file the visitor chose) and the hidden <video>.
    const a = new Audio(); a.src = URL.createObjectURL(new Blob(['x'], { type: 'audio/mpeg' }));
    const v = document.createElement('video'); v.src = URL.createObjectURL(new Blob(['x'], { type: 'video/webm' }));
    note('blob media', 'set');
  } catch (e) { note('blob media', String(e)); }
  // Lyrics (lrclib.net), Firebase Auth's token calls, the Workers (licence, shows, reports, song ID).
  for (const u of ['https://lrclib.net/api/get?x=1', 'https://identitytoolkit.googleapis.com/v1/x', 'https://securetoken.googleapis.com/v1/token', 'https://www.googleapis.com/service_accounts/v1/jwk/x', 'https://chromaglass-licences.example.workers.dev/keys']) fetch(u, { mode: 'no-cors' }).catch(() => {});
  // The show server's relay, from a page it served.
  try { new WebSocket(`wss://${location.host}/remote-ws`).onerror = () => {}; } catch { /* a wss: to a host with no socket */ }
  // The page's own stylesheet font and the Google one it @imports.
  document.fonts?.load('16px Geist').catch(() => {});
  return out;
};
/** What must be reported, and by which policy; each is the app doing what it must never do. */
const CONTROLS = () => {
  fetch('http://example.invalid/leak', { mode: 'no-cors' }).catch(() => {});
  // From a timer, not the evaluate's own stack: a call over the DevTools protocol (and what it creates) is exempt from the page's policy.
  setTimeout(() => { try { (0, eval)('1'); } catch { /* blocked is the answer */ } }, 0);
  const b = document.createElement('base'); b.href = 'https://evil.invalid/'; document.head.appendChild(b);
  try { new Worker('data:text/javascript,1').onerror = () => {}; } catch { /* blocked */ }
  const o = document.createElement('object'); o.data = 'https://evil.invalid/x.swf'; document.body.appendChild(o);
};

async function open(base, path, { controls = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (m) => { if (/Content Security Policy|Permissions-Policy|Permissions policy|Refused to|Unrecognized feature|Error with/i.test(m.text())) logs.push(m.text().slice(0, 240)); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI, disposition: e.disposition }));
  });
  await page.goto(`${base}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const tried = await page.evaluate(`(${TRIES.toString()})()`);
  if (controls) await page.evaluate(`(${CONTROLS.toString()})()`);
  await page.waitForTimeout(1200);
  const got = await page.evaluate(() => ({
    csp: window.__csp,
    allowed: (document.featurePolicy ?? document.permissionsPolicy)?.allowedFeatures?.() ?? null,
    title: document.title,
    blank: (document.body?.innerText ?? '').length === 0 && document.querySelector('#root')?.childElementCount === 0,
  }));
  await page.close();
  return { ...got, logs, tried };
}

const PAGES = ['/', '/?look=classic', '/?remote', '/?cast', '/show', '/privacy.html', '/terms.html'];
const reports = [];
let allowed = null;
for (const p of PAGES) {
  const r = await open(origin(site), p);
  allowed ??= r.allowed;
  for (const v of r.csp) reports.push(`${p}: ${v.disposition} ${v.directive} ${v.blocked}`);
  for (const l of r.logs) reports.push(`${p}: console: ${l}`);
  console.log(`  ${p.padEnd(16)} ${r.csp.length} reported; ${r.logs.length} console; ${r.tried.map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
/*
  A Content-Security-Policy-Report-Only header names a violation by the
  directive it fell under, so a page the app opens that no policy covers is
  silence, not a pass. These are the allowed ones the page really asked for
  (the tries above), kept out of the count only by being allowed.
*/
check('2. no policy reports anything on any page or any try the app makes, and Chromium logs no complaint about a header',
  reports.length === 0, reports.length ? reports.slice(0, 6).join(' | ') : `${PAGES.length} pages`);

// 3. Not vacuous: the same tries against the policy must catch what it is there to catch.
{
  const on = await open(origin(site), '/privacy.html', { controls: true });
  const off = await open(origin(bare), '/privacy.html', { controls: true });
  const has = (r, re, disp) => r.csp.some((v) => re.test(`${v.directive} ${v.blocked}`) && (!disp || v.disposition === disp));
  check('3a. a connection to plain http is reported by the report-only policy (connect-src)', has(on, /connect-src.*example\.invalid/, 'report'), on.csp.map((v) => `${v.disposition}:${v.directive}`).join(' '));
  check('3b. an eval is reported by the report-only policy (script-src)', has(on, /script-src.*eval/, 'report'), on.csp.map((v) => `${v.disposition}:${v.directive}:${v.blocked}`).join(' '));
  check('3f. a worker from another origin is reported by the report-only policy (worker-src), so the blob worker allowed above is a real answer', has(on, /worker-src/, 'report'), on.csp.map((v) => v.directive).join(' '));
  check('3c. a <base> to another origin is blocked by the enforced policy (base-uri)', has(on, /base-uri/, 'enforce'));
  check('3d. an <object> is blocked by the enforced policy (object-src)', has(on, /object-src/, 'enforce'));
  check('3e. the same tries on the site without its headers report nothing (the control)', off.csp.length === 0, `${off.csp.length} reported`);
}

// 4. Framing.
{
  const page = await browser.newPage();
  await page.goto(origin(other), { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  const body = frame ? await frame.evaluate(() => document.body?.innerText ?? '').catch(() => '') : '';
  const blocked = !frame || frame.url().startsWith('chrome-error') || body.length === 0;
  check('4. a page on another origin cannot frame the site', blocked, frame ? `frame at ${frame.url().slice(0, 60)}, ${body.length} characters` : 'no frame');
  await page.close();
}

// 5. The Permissions-Policy, as the browser reads it.
{
  const need = ['camera', 'microphone', 'display-capture', 'midi', 'fullscreen', 'window-management', 'gamepad', 'clipboard-write', 'autoplay', 'accelerometer', 'gyroscope'];
  const never = ['geolocation', 'payment', 'usb', 'serial', 'hid', 'xr-spatial-tracking'];
  check('5. the page may use what the app asks the browser for, and not what it never does',
    allowed && need.every((f) => allowed.includes(f)) && never.every((f) => !allowed.includes(f)),
    allowed ? `missing ${need.filter((f) => !allowed.includes(f)).join(', ') || 'none'}; allowed but never used: ${never.filter((f) => allowed.includes(f)).join(', ') || 'none'}` : 'this Chromium does not list allowed features');
}

await browser.close();
for (const s of [site, bare, other]) s.close();
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\ncsp: ${failed} FAIL` : `\ncsp: ${checks.length} checks ok`);
process.exit(failed ? 1 : 0);
