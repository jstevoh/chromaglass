#!/usr/bin/env node
/**
 * Does the hosted site ask for a sign-in, and never take a show down for one?
 *
 *   npm run signin          (software WebGPU off a Mac; the Firebase Auth emulator)
 *
 * What was asked (the owner, 2026-10-11): accounts for ChromaGlass, signed in
 * with Google, Apple or an emailed link through Firebase Authentication, and
 * the free site behind that sign-in (PLAN.md 23.10). The rule the owner set
 * for anything sold to performers is that a show never locks out mid-gig, so
 * the half of this check that matters most is the second half: once the plate
 * is up, nothing about the account (no internet, an expired session, a sign-out
 * in another tab, the account deleted on the server) takes it down. Only the
 * next load asks again.
 *
 * Firebase's own Auth emulator stands in for Google's servers, so a cloud
 * session and CI run the real SDK against a real (local) auth server: the
 * email link is read from the emulator's outbox, Google and Apple are asked
 * for through the emulator's stand-in for their pages, and the accounts are
 * read and deleted through its admin API. Nothing here needs a real Firebase
 * project or a secret. The emulator is fetched with npx at a pinned version
 * rather than kept as a dependency: firebase-tools is close to half a
 * gigabyte, and only this check uses it.
 *
 * Two builds, the hosted site's (the Firebase config set, pointed at the
 * emulator) and today's (no config: `npm run dev`, every other check, a fork):
 *
 *   1. without the config there is no sign-in at all, and no Firebase in the
 *      build: the app comes up as it does today
 *   2. with it, the entry chunk carries no Firebase and grows by at most
 *      ENTRY_GROWTH_MAX bytes gzipped: the SDK is fetched beside the app, not
 *      in front of the intro
 *   3. a first visit sees the sign-in, and the plate does not start behind it
 *   4. it offers Google, Apple and an emailed link, and each provider button
 *      asks the emulator for that provider
 *   5. the emailed link signs in and the plate starts
 *   6. a returning visit goes straight to the plate: the sign-in is never
 *      drawn, not even for a frame
 *   6 and 7 within today's boot (1b) plus SIGNED_IN_EXTRA_MS
 *   7. a returning visit with no internet (Google's servers never answering)
 *      still goes straight to the plate
 *   8. with the plate up and Google unreachable: a sign-out in another tab and
 *      then the account deleted on the server leave the plate up and the
 *      sign-in undrawn for HOLD_MS
 *   9. the next load after that asks for a sign-in again
 *  3a. before that, a first visit meets the landing page (PLAN.md 34a): Play free
 *      on it, and neither the sign-in nor the plate drawn behind it; Play free
 *      is what opens the sign-in (3). A returning visit (6, 7) never draws it.
 *  10. the remote (?remote) and a cast (?cast) never ask, nor fetch Firebase
 *  11. the sign-in fits a laptop (1024×768) and a phone, upright and on its
 *      side: nothing wider than the screen, every button a thumb's height
 *  12. the account sheet opens from the desk and from the phone, and names
 *      the account
 *  13. deleting the account from the sheet removes it from the auth server
 *
 * The hooks it reads (the brief, docs/handoff-signin.md, names each):
 *   [data-cg-signin]                               the sign-in screen
 *   [data-cg-signin-provider="google.com"|"apple.com"|"email"]
 *   [data-cg-signin-email] [data-cg-signin-send] [data-cg-signin-sent]
 *   [data-cg-account-open] [data-cg-account] [data-cg-account-signout]
 *   [data-cg-account-signout-confirm]
 *   [data-cg-account-delete] [data-cg-account-delete-confirm]
 *   window.chromaglassSettings, a function once the App is up (App.tsx)
 *
 * Build-time variables: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
 * VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID, and for this check only
 * VITE_FIREBASE_AUTH_EMULATOR (the emulator's URL).
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { createServer } from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const FIREBASE_TOOLS = 'firebase-tools@15.33.0';
const PROJECT = 'demo-chromaglass'; // a "demo-" project: the emulator needs no real one
const EMU_PORT = 9199;
const EMU = `http://127.0.0.1:${EMU_PORT}`;
const ON_PORT = 5281, OFF_PORT = 5282;
const ON_DIST = resolve(process.env.SIGNIN_DIST ?? 'dist-signin');
const OFF_DIST = resolve(process.env.SIGNIN_OFF_DIST ?? 'dist-signin-off');
/** The sign-in's whole cost to a returning visit's first paint: a lazy import and a check of the cached user. */
const ENTRY_GROWTH_MAX = 6000;
/** How long the plate must stay up after the account goes away under it. */
const HOLD_MS = 10_000;
/** A first boot on SwiftShader is slow; this is a ceiling, never what is judged. */
const BOOT_MS = 90_000;
const EMAIL = 'check@example.com';

const FIREBASE_ENV = {
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: PROJECT,
  VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000',
  VITE_FIREBASE_AUTH_EMULATOR: EMU,
};

// ── the two builds ──────────────────────────────────────────────────────────
// Each variable is set or removed explicitly: a developer's shell or a .env
// carrying a real config must not turn the "off" build on.
function build(outDir, on) {
  if (process.env.SIGNIN_SKIP_BUILD) return;
  const env = { ...process.env };
  for (const k of Object.keys(FIREBASE_ENV)) delete env[k];
  if (on) Object.assign(env, FIREBASE_ENV);
  execSync(`npx vite build --outDir ${outDir} --emptyOutDir`, { env, stdio: ['ignore', 'ignore', 'inherit'] });
}
build(OFF_DIST, false);
build(ON_DIST, true);

function jsFiles(dir) {
  const out = [];
  for (const f of readdirSync(dir, { recursive: true })) if (String(f).endsWith('.js')) out.push(join(dir, String(f)));
  return out;
}
/**
 * Firebase in a file: Auth's own endpoint name, or the name every Firebase
 * package registers itself under (so `firebase/app` alone is caught too).
 */
const hasFirebase = (file) => /identitytoolkit|@firebase\//.test(readFileSync(file, 'utf8'));
function entryOf(dir) {
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const m = html.match(/<script[^>]+type="module"[^>]+src="\/?([^"]+)"/);
  return m ? join(dir, m[1]) : null;
}

/**
 * The entry and every chunk the page fetches with it before any lazy import:
 * the entry's static imports, which Vite lists in index.html as modulepreload
 * links. A Firebase chunk split out by `manualChunks` but imported statically
 * is still in front of the intro, so it is weighed here too.
 */
function upFront(dir) {
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/?([^"]+\.js)"/g)].map((m) => join(dir, m[1]));
  const entry = entryOf(dir);
  return entry ? [entry, ...files] : [];
}
const offFirebase = jsFiles(OFF_DIST).filter(hasFirebase);
const onFront = upFront(ON_DIST), offFront = upFront(OFF_DIST);
const onEntry = onFront[0];
const gz = (f) => gzipSync(readFileSync(f)).length;
const weigh = (files) => files.reduce((a, f) => a + gz(f), 0);
const frontFirebase = onFront.filter(hasFirebase);
const growth = onFront.length && offFront.length ? weigh(onFront) - weigh(offFront) : Infinity;
/** Every file in the hosted build with Firebase in it: a page that fetches none of them never loaded the sign-in. */
const firebaseChunks = new Set(jsFiles(ON_DIST).filter(hasFirebase).map((f) => '/' + f.slice(ON_DIST.length + 1)));

// ── the servers ─────────────────────────────────────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };
function serve(dist, port) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(dist, path);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

// The emulator, in a directory of its own so the repo's firebase.json (the
// hosting config) is neither read nor touched.
const emuDir = mkdtempSync(join(tmpdir(), 'cg-signin-'));
writeFileSync(join(emuDir, 'firebase.json'), JSON.stringify({ emulators: { auth: { port: EMU_PORT, host: '127.0.0.1' }, ui: { enabled: false } } }));
const emu = spawn('npx', ['-y', FIREBASE_TOOLS, 'emulators:start', '--only', 'auth', '--project', PROJECT], { cwd: emuDir, stdio: 'ignore', detached: true });
async function emuReady() {
  for (let i = 0; i < 240; i++) {
    try { if ((await (await fetch(EMU)).json()).authEmulator?.ready) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
const admin = { authorization: 'Bearer owner', 'content-type': 'application/json' };
async function accounts() {
  const r = await fetch(`${EMU}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, { method: 'POST', headers: admin, body: '{}' });
  // A failed query must not read as "no accounts": line 13's "gone" would pass on it.
  if (!r.ok) throw new Error(`the emulator's account query answered ${r.status}`);
  return (await r.json()).userInfo ?? [];
}
async function deleteAccount(email) {
  for (const u of await accounts()) {
    if (u.email !== email) continue;
    const r = await fetch(`${EMU}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, { method: 'POST', headers: admin, body: JSON.stringify({ localId: u.localId }) });
    if (!r.ok) throw new Error(`the emulator's account delete answered ${r.status}`);
  }
}
/**
 * The link Firebase would email, as the page receives it: the emulator's
 * outbox holds it as a link to its own action page, whose job in production
 * (Firebase's hosted handler) is to send the browser on to the continue URL
 * with the code. Going there directly is that hop.
 */
const outbox = async (email) => ((await (await fetch(`${EMU}/emulator/v1/projects/${PROJECT}/oobCodes`)).json()).oobCodes ?? []).filter((o) => o.email === email && o.requestType === 'EMAIL_SIGNIN');
/** `before`: how many links the outbox held before this send; only a newer one counts. */
async function emailLink(email, before) {
  for (let i = 0; i < 40; i++) {
    const sent = await outbox(email);
    const c = sent.length > before ? sent[sent.length - 1] : null;
    if (c) {
      const link = new URL(c.oobLink);
      const to = new URL(link.searchParams.get('continueUrl'));
      for (const k of ['mode', 'oobCode', 'apiKey', 'lang']) if (link.searchParams.get(k)) to.searchParams.set(k, link.searchParams.get(k));
      return to.toString();
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

// ── the page ────────────────────────────────────────────────────────────────
const appUp = (page) => page.evaluate(() => typeof window.chromaglassSettings === 'function').catch(() => false);
const signinShown = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-cg-signin]');
  if (!el) return false;
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
}).catch(() => false);
/**
 * The sign-in, from wherever a visit starts. A first visit meets the landing
 * page first (PLAN.md 34a) and its "Play free" opens the sign-in over it; a
 * visit already part way through signing in meets the sign-in itself. Either
 * way this is true once the sign-in is drawn, and a visit that never asks
 * (a returning one) is never clicked for.
 */
const signinOpen = async (page) => {
  if (await signinShown(page)) return true;
  await page.click('[data-cg-landing-play]', { timeout: 500 }).catch(() => {});
  return signinShown(page);
};
/** The landing page, drawn: its own box, like the sign-in's, so a frame of it is not a blank page's. */
const landingShown = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-cg-landing]');
  if (!el) return false;
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
}).catch(() => false);
/**
 * Watch a page from before its first script for the sign-in ever being drawn:
 * a MutationObserver and a per-frame look, so a sign-in shown for one frame
 * and taken away is still caught (a returning visit must never flash it).
 */
const WATCH = () => {
  window.__cgSigninSeen = false;
  window.__cgLandingSeen = false;
  const look = () => {
    if (document.querySelector('[data-cg-landing]')) window.__cgLandingSeen = true;
    const el = document.querySelector('[data-cg-signin]');
    if (el) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0) window.__cgSigninSeen = true; }
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true });
  const tick = () => { look(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)); }
  return false;
}
/**
 * Google's servers, and the emulator standing in for them, out of reach. Not
 * refused, which a page hears at once, but never answered, as a venue's
 * captive Wi-Fi does: code that waits on the network waits here.
 */
const cutGoogle = (ctx) => ctx.route((url) => url.port === String(EMU_PORT) || /googleapis\.com|firebaseapp\.com|gstatic\.com/.test(url.host), () => { /* never answered */ });
/** How much later than today's build a returning visit may come up: the cached user is read from the browser, not asked for. */
const SIGNED_IN_EXTRA_MS = 5000;

async function signInByEmail(page, origin) {
  await page.click('[data-cg-signin-provider="email"]').catch(() => {});
  await page.fill('[data-cg-signin-email]', EMAIL);
  const before = (await outbox(EMAIL)).length;
  await page.click('[data-cg-signin-send]');
  const sent = await page.waitForSelector('[data-cg-signin-sent]', { timeout: 15_000 }).then(() => true, () => false);
  const link = await emailLink(EMAIL, before);
  if (!link || !link.startsWith(origin)) return { sent, link, back: false, up: false };
  await page.goto(link);
  // The link must bring the visitor back to the page they were on, query and
  // all: a shared link to a look survives the sign-in, and here the page was
  // asked for with `?debug`, which is what hangs the App's harness hooks on
  // window (App.tsx). So the plate's arrival is read where the link lands.
  const back = new URL(link).searchParams.has('debug');
  return { sent, link, back, up: back && await waitFor(() => appUp(page), BOOT_MS) };
}
/** Everything on the sign-in inside the screen's width, each button a thumb's height. */
const fits = (page) => page.evaluate(() => {
  const W = innerWidth, H = innerHeight;
  const over = document.documentElement.scrollWidth > W + 1;
  const buttons = [...document.querySelectorAll('[data-cg-signin-provider]')].map((b) => b.getBoundingClientRect());
  const bad = buttons.filter((r) => r.left < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5 || r.height < 44 || r.width < 44);
  return { over, n: buttons.length, bad: bad.length, minH: Math.min(...buttons.map((r) => r.height)) };
});

let browser;
let bootMs = BOOT_MS;
const servers = [];
try {
  check('1a. no Firebase config: no Firebase in the build', offFirebase.length === 0, offFirebase.length ? offFirebase.map((f) => f.slice(OFF_DIST.length)).join(', ') : 'none of its scripts names identitytoolkit');
  check('2. the entry and what it preloads carry no Firebase, and grow at most ' + ENTRY_GROWTH_MAX + ' B gzipped', onEntry && !frontFirebase.length && growth <= ENTRY_GROWTH_MAX, `${onFront.length} files up front, grew ${growth} B gzipped${frontFirebase.length ? '; Firebase in ' + frontFirebase.map((f) => f.slice(ON_DIST.length)).join(', ') : ''}`);

  if (!(await emuReady())) throw new Error('the Firebase Auth emulator did not start');
  servers.push(await serve(ON_DIST, ON_PORT), await serve(OFF_DIST, OFF_PORT));
  // `?debug` is what makes the App hang its harness hooks on window
  // (App.tsx), `chromaglassSettings` among them: the sign of the App being up.
  const ORIGIN = `http://127.0.0.1:${ON_PORT}/`;
  const ON = ORIGIN + '?debug', OFF = `http://127.0.0.1:${OFF_PORT}/?debug`;
  await fetch(`${EMU}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  browser = await launchChromium(chromium);

  // 1b. Today's build: the app as it is.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(WATCH);
    const page = await ctx.newPage();
    await page.goto(OFF);
    let up = await waitFor(() => appUp(page), BOOT_MS);
    // The baseline for 6 and 7 is a reload, as theirs are: tearing down a
    // running plate first costs seconds of its own on SwiftShader.
    const t0 = Date.now();
    await page.reload();
    up = up && await waitFor(() => appUp(page), BOOT_MS);
    bootMs = Date.now() - t0;
    check('1b. no Firebase config: the app comes up and no sign-in is drawn', up && !(await page.evaluate(() => window.__cgSigninSeen)));
    await ctx.close();
  }

  // 3–9 on the desk, in one browser profile.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(ON);
  // 3a. The landing page comes first: it says what this is before it asks
  // for anything. Neither the sign-in nor the plate is up behind it, and its
  // "Play free" is what opens the sign-in (3).
  const landed = await waitFor(() => landingShown(page), 30_000);
  await page.waitForTimeout(3000);
  const landing = landed ? await page.evaluate(() => {
    const b = document.querySelector('[data-cg-landing-play]')?.getBoundingClientRect();
    return { play: !!b, h: b ? b.height : 0, signin: !!document.querySelector('[data-cg-signin]') };
  }) : { play: false, h: 0, signin: false };
  check('3a. a first visit meets the landing page first, with Play free on it, and neither the sign-in nor the plate behind it', landed && landing.play && landing.h >= 44 && !landing.signin && !(await appUp(page)), landed ? `Play free ${Math.round(landing.h)} px tall, sign-in drawn ${landing.signin}` : 'no [data-cg-landing] within 30 s');
  const asked = await waitFor(() => signinOpen(page), 30_000);
  await page.waitForTimeout(3000);
  check('3. Play free opens the sign-in over the landing page, and the plate does not start behind it', asked && !(await appUp(page)), asked ? '' : 'no [data-cg-signin] within 30 s');

  const providers = await page.evaluate(() => [...document.querySelectorAll('[data-cg-signin-provider]')].map((b) => b.getAttribute('data-cg-signin-provider')));
  const asksFor = {};
  for (const id of ['google.com', 'apple.com']) {
    // A popup or a redirect: either is Firebase's way of sending the browser to the provider.
    const popup = ctx.waitForEvent('page', { timeout: 10_000 }).catch(() => null);
    const nav = page.waitForURL((u) => u.toString().includes(`providerId=${encodeURIComponent(id)}`) || u.toString().includes(`providerId=${id}`), { timeout: 10_000 }).then(() => page.url(), () => null);
    await page.click(`[data-cg-signin-provider="${id}"]`).catch(() => {});
    const p = await Promise.race([popup.then(async (pp) => {
      if (!pp) return null;
      // A popup opens on about:blank and is then sent to the provider.
      await pp.waitForURL((u) => u.toString().includes('providerId'), { timeout: 10_000 }).catch(() => {});
      const u = pp.url();
      await pp.close().catch(() => {});
      return u;
    }), nav]);
    asksFor[id] = !!p && p.startsWith(`${EMU}/emulator/auth/handler`) && p.includes('apiKey=demo-key') && p.includes(id);
    if (!page.url().startsWith(ORIGIN)) { await page.goto(ON); await waitFor(() => signinOpen(page), 30_000); }
  }
  check('4. Google, Apple and an emailed link are offered, and Google and Apple go to their provider', ['google.com', 'apple.com', 'email'].every((p) => providers.includes(p)) && asksFor['google.com'] && asksFor['apple.com'], `offered ${JSON.stringify(providers)}, reached ${JSON.stringify(asksFor)}`);

  const first = await signInByEmail(page, ORIGIN);
  check('5. the emailed link signs in, lands on the page the visitor was on, and the plate starts', first.sent && first.back && first.up, `sent ${first.sent}, link ${first.link ? (first.back ? 'back to the same page' : 'to this site but not the same page') : 'none'}, plate ${first.up}`);

  // 6 and 7 are held to today's build's own boot (1b) plus SIGNED_IN_EXTRA_MS:
  // the cached user is read from the browser, so a sign-in that waits on
  // the network shows here as a late plate even when it gets there.
  const inTime = () => bootMs + SIGNED_IN_EXTRA_MS;
  await ctx.addInitScript(WATCH);
  let t = Date.now();
  await page.reload();
  const back = await waitFor(() => appUp(page), inTime());
  const backMs = Date.now() - t;
  check('6. a returning visit goes straight to the plate, the sign-in and the landing page never drawn', back && !(await page.evaluate(() => window.__cgSigninSeen || window.__cgLandingSeen)), `up in ${(backMs / 1000).toFixed(1)} s, today's build ${(bootMs / 1000).toFixed(1)} s`);

  await cutGoogle(ctx);
  t = Date.now();
  await page.reload();
  const offline = await waitFor(() => appUp(page), inTime());
  const offMs = Date.now() - t;
  check('7. a returning visit with Google never answering still goes straight to the plate', offline && !(await page.evaluate(() => window.__cgSigninSeen || window.__cgLandingSeen)), `up in ${(offMs / 1000).toFixed(1)} s, today's build ${(bootMs / 1000).toFixed(1)} s`);

  // 8. The account goes away under a running show. Google is still cut off
  // (the gig's venue Wi-Fi); a second tab signs out, which Firebase tells
  // every tab of the profile at once through the browser's storage; then
  // Google comes back and the account is deleted on the server. The first
  // tab keeps playing. What this cannot reach: a page hears of a deletion
  // only at its next token refresh, about an hour on, and faking the clock
  // that far would also stop the plate's own frame loop. So the deletion is
  // proven to happen (the account is there before and gone after), and a
  // page that asks the server early is caught; one that waits the hour is
  // the brief's rule, "don't subscribe the show to the account".
  const other = await ctx.newPage();
  other.on('dialog', (d) => d.accept());
  await other.goto(ON);
  await waitFor(() => appUp(other), inTime());
  await page.evaluate(() => { window.__cgSigninSeen = false; });
  await other.click('[data-cg-account-open]').catch(() => {});
  await other.click('[data-cg-account-signout]').catch(() => {});
  // The sign-out asks first (the brief): on the page, or the browser's own confirm, accepted above.
  await other.click('[data-cg-account-signout-confirm]', { timeout: 5000 }).catch(() => {});
  const otherOut = await waitFor(() => signinOpen(other), 15_000);
  await ctx.unrouteAll({ behavior: 'ignoreErrors' });
  const had = (await accounts()).some((u) => u.email === EMAIL);
  await deleteAccount(EMAIL);
  const gone = !(await accounts()).some((u) => u.email === EMAIL);
  await page.waitForTimeout(HOLD_MS);
  const held = (await appUp(page)) && !(await page.evaluate(() => window.__cgSigninSeen));
  check(`8. sign-out in another tab, then the account deleted, leave a running plate up for ${HOLD_MS / 1000} s`, otherOut && had && gone && held, `the other tab ${otherOut ? 'signed out' : 'did not sign out'}; the account ${had && gone ? 'was deleted' : 'was not there to delete'}; the show ${held ? 'stayed up' : 'was taken down'}`);

  // The next load is a new page in the same profile (the same stored
  // session), not a reload: navigating away from a software plate that has
  // run this long has crashed the renderer, which says nothing about the gate.
  await other.close();
  await page.close();
  const next = await ctx.newPage();
  await next.goto(ON);
  check('9. the next load asks for a sign-in again', await waitFor(() => signinOpen(next), 30_000) && !(await appUp(next)));
  await ctx.close();

  // 10. The remote and a cast never ask.
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await c.addInitScript(WATCH);
    const seen = {};
    for (const q of ['?remote', '?cast']) {
      const p = await c.newPage();
      // Not only "no sign-in drawn", which a blank page also passes: no
      // Firebase fetched at all, and the page itself drew something.
      const fetched = [];
      p.on('request', (r) => { const path = new URL(r.url()).pathname; if (firebaseChunks.has(path)) fetched.push(path); });
      await p.goto(ORIGIN + q);
      await p.waitForTimeout(15_000);
      // The remote's surface is position: fixed, so #root itself has no height: read what it put on the screen.
      const drew = await p.evaluate(() => (document.getElementById('root')?.childElementCount ?? 0) > 0 && (document.body.innerText.trim().length > 0 || !!document.querySelector('#root canvas')));
      seen[q] = { signin: await p.evaluate(() => window.__cgSigninSeen || window.__cgLandingSeen), firebase: fetched.length, drew };
    }
    check('10. the remote and a cast never ask for a sign-in nor fetch Firebase', ['?remote', '?cast'].every((q) => !seen[q].signin && !seen[q].firebase && seen[q].drew), JSON.stringify(seen));
    await c.close();
  }

  // 11–13: the sign-in on a laptop and a phone; the account sheet on each.
  const sizes = [
    { name: 'laptop 1024×768', viewport: { width: 1024, height: 768 }, touch: false },
    { name: 'phone upright 390×844', viewport: { width: 390, height: 844 }, touch: true },
    { name: 'phone on its side 844×390', viewport: { width: 844, height: 390 }, touch: true },
  ];
  const fit = [];
  for (const s of sizes) {
    const c = await browser.newContext({ viewport: s.viewport, isMobile: s.touch, hasTouch: s.touch, deviceScaleFactor: 2 });
    const p = await c.newPage();
    await p.goto(ON);
    await waitFor(() => signinOpen(p), 30_000);
    const f = await fits(p);
    fit.push(`${s.name}: ${f.n} buttons, ${f.bad} outside or under 44 px (shortest ${Math.round(f.minH)} px)${f.over ? ', wider than the screen' : ''}`);
    s.ok = f.n >= 3 && f.bad === 0 && !f.over;
    await c.close();
  }
  check('11. the sign-in fits a laptop and a phone, upright and on its side', sizes.every((s) => s.ok), fit.join('; '));

  // 11b. The landing page on the same screens: nothing wider than the screen,
  // however far it scrolls sideways inside (the phone's row of looks is meant
  // to), and Play free a thumb's height and inside the width.
  const landFit = [];
  for (const s of sizes) {
    const c = await browser.newContext({ viewport: s.viewport, isMobile: s.touch, hasTouch: s.touch, deviceScaleFactor: 2 });
    const p = await c.newPage();
    await p.goto(ON);
    const up = await waitFor(() => landingShown(p), 30_000);
    await p.waitForTimeout(500);
    const f = up ? await p.evaluate(() => {
      const W = innerWidth;
      const box = document.querySelector('[data-cg-landing]');
      const b = document.querySelector('[data-cg-landing-play]').getBoundingClientRect();
      // The two Buy buttons (PLAN 34a-4): a thumb tall, opening the store in a new tab, never in this one.
      const buys = [...document.querySelectorAll('[data-cg-landing-buy]')];
      const buyBad = buys.filter((a) => a.getBoundingClientRect().height < 44 || a.target !== '_blank' || !/^https:\/\/[^/]*lemonsqueezy\.com\//.test(a.href)).length;
      // The films must not have loaded anything yet beyond the hero's: three clips, each with a poster.
      const clips = [...document.querySelectorAll('[data-cg-landing-clip]')];
      return { over: document.documentElement.scrollWidth > W + 1 || box.scrollWidth > W + 1, h: b.height, outside: b.left < -0.5 || b.right > W + 0.5, buys: buys.length, buyBad, clips: clips.length };
    }) : null;
    if (up && process.env.SIGNIN_SHOT) await p.screenshot({ path: `${process.env.SIGNIN_SHOT}/landing-${s.name.replace(/\W+/g, '-')}.png`, fullPage: true });
    if (up && process.env.SIGNIN_SHOT) {
      for (const [tag, sel] of [['clips', '#clips'], ['buy', '[data-cg-landing-buy="home"]']]) {
        await p.evaluate((q) => document.querySelector(q)?.scrollIntoView({ block: 'start' }), sel);
        await p.waitForTimeout(800);
        await p.screenshot({ path: `${process.env.SIGNIN_SHOT}/landing-${tag}-${s.name.replace(/\W+/g, '-')}.png` });
      }
    }
    s.landOk = !!f && !f.over && !f.outside && f.h >= 44 && f.buys === 2 && f.buyBad === 0 && f.clips === 3;
    landFit.push(`${s.name}: ${f ? `Play free ${Math.round(f.h)} px, ${f.buys} Buy buttons (${f.buyBad} short or not a new tab), ${f.clips} clips${f.outside ? ', outside the screen' : ''}${f.over ? ', page wider than the screen' : ''}` : 'landing page not drawn'}`);
    await c.close();
  }
  check('11b. the landing page fits a laptop and a phone, upright and on its side', sizes.every((s) => s.landOk), landFit.join('; '));

  const sheet = {};
  for (const s of [sizes[0], sizes[1]]) {
    await deleteAccount(EMAIL);
    const c = await browser.newContext({ viewport: s.viewport, isMobile: s.touch, hasTouch: s.touch, deviceScaleFactor: 2 });
    const p = await c.newPage();
    await p.goto(ON);
    await waitFor(() => signinOpen(p), 30_000);
    const r = await signInByEmail(p, ORIGIN);
    let named = false;
    if (r.up) {
      await p.click('[data-cg-account-open]', { timeout: 10_000 }).catch(() => {});
      named = await p.waitForSelector('[data-cg-account]', { state: 'visible', timeout: 10_000 }).then(async (el) => (await el.textContent())?.includes(EMAIL), () => false);
    }
    sheet[s.name] = named;
    if (s === sizes[1]) {
      // 13. Deleting the account, from the phone: the store's rule
      // (App Store 5.1.1(v)) and the owner's privacy page both promise it.
      await p.click('[data-cg-account-delete]').catch(() => {});
      await p.click('[data-cg-account-delete-confirm]').catch(() => {});
      const gone = await waitFor(async () => !(await accounts()).some((u) => u.email === EMAIL), 15_000);
      check('13. deleting the account from the sheet removes it from the auth server', named && gone);
    }
    await c.close();
  }
  check('12. the account sheet opens from the desk and from the phone, and names the account', Object.values(sheet).every(Boolean), JSON.stringify(sheet));
} catch (e) {
  check('the check ran to its end', false, String(e?.message ?? e).split('\n')[0]);
} finally {
  await browser?.close().catch(() => {});
  for (const s of servers) s.close();
  try { process.kill(-emu.pid, 'SIGTERM'); } catch { /* already gone */ }
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\nsignin: ${checks.length - failed}/${checks.length}${failed ? ' — FAIL' : ''}`);
process.exit(failed ? 1 : 0);
