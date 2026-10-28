#!/usr/bin/env node
/**
 * Does the hosted site ask for a sign-in, and never take a show down for one?
 *
 *   npm run signin          (software WebGPU off a Mac; the Firebase Auth emulator)
 *
 * What was asked (the owner, 2026-10-11): accounts for ChromaGlass, signed in
 * with Google or an emailed link through Firebase Authentication, and
 * the free site behind that sign-in (PLAN.md 23.10). The rule the owner set
 * for anything sold to performers is that a show never locks out mid-gig, so
 * the half of this check that matters most is the second half: once the plate
 * is up, nothing about the account (no internet, an expired session, a sign-out
 * in another tab, the account deleted on the server) takes it down. Only the
 * next load asks again.
 *
 * Firebase's own Auth emulator stands in for Google's servers, so a cloud
 * session and CI run the real SDK against a real (local) auth server: the
 * email link is read from the emulator's outbox, Google is asked
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
 *   4. it offers Google and an emailed link, and not Apple (the owner,
 *      2026-10-24: no Apple sign-in for now), and the Google button asks the
 *      emulator for Google
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
 *  14. an account that holds a Pro key reads Pro once the app starts signed in,
 *      with the sheet never opened: the key comes from the licence Worker
 *      (server/license-worker.js, run here in Node against the emulator). The
 *      owner, 2026-10-24: his Pro account read Free, because the key was fetched
 *      only while the sheet was open (and the live Worker refused real
 *      sign-ins; `npm run license-worker` 8). Read on `?tierGates=1`, where an
 *      unlicensed browser is Free, and the same desk is read Free first, before
 *      the key is filed, so Pro is not what an ungated build says anyway.
 *  15. signed out with the plate up, the account button on the desk and on the
 *      phone becomes a lit "Sign in" (the owner, 2026-10-24: "there is no way to
 *      re-sign in"), a thumb's height on the phone; on the desk it opens the
 *      sign-in in the sheet with the plate still up behind it
 *  16. signing in from that sheet brings the account back: the button says
 *      Account again and the sheet names the account
 *
 * The Mac app's door (PLAN.md 23.17d), on `?requireSignIn=1`, the word the app says:
 *  22. signed out it shows the sign-in; a free account gets Confirm your email,
 *      then Buy Home or Pro, and the plate never starts behind it
 *  23. once the account holds a Home key, "check again" opens the show at Home
 *  24. a refunded key: the running show stays up, the key leaves the machine,
 *      and the next start asks to buy again
 *
 * Email and password (PLAN.md 23.10e; the owner, 2026-10-24: "an email login
 * option that stores passwords ... and if they have a google account it can
 * link to that"). One account per email is Firebase's rule, and these hold the
 * app to it:
 *  17. a password sign-up on the desk makes one account, mails the confirmation
 *      link, and starts the plate; until the link is opened a Pro key filed under
 *      that email reads Free and the sheet says to confirm, and "I've confirmed"
 *      after the link brings the licence in (the Worker refuses an unconfirmed
 *      email, so a stranger cannot sign up as someone else's address)
 *  18. on a phone, the password signs in to that same account (still one uid),
 *      a wrong password is refused in words with the plate not started, and
 *      "Forgot password?" mails a reset link
 *  19. an address that already has a Google account, signed up again with a
 *      password: no second account, the form says so, and "Continue with
 *      Google and add this password" leaves ONE account with both ways in
 *  20. a signed-in Google account and an emailed-link account can each set a
 *      password from the sheet, and it then signs in to the same uid
 *  21. the password form fits a laptop and a phone, upright and on its side:
 *      nothing wider than the screen, every button a thumb's height
 *
 * The hooks it reads (the brief, docs/handoff-signin.md, names each):
 *   [data-cg-signin]                               the sign-in screen
 *   [data-cg-signin-provider="google.com"|"apple.com"|"email"]
 *   [data-cg-signin-email] [data-cg-signin-send] [data-cg-signin-sent]
 *   [data-cg-account-open] [data-cg-account] [data-cg-account-signout]
 *   [data-cg-account-signout-confirm]
 *   [data-cg-account-delete] [data-cg-account-delete-confirm]
 *   [data-cg-account-signin] (the lit Sign in)  [data-cg-tier] (the tier the app gates by)
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
import licenseWorker from '../server/license-worker.js';
import { signLicenseKey } from '../server/license-key.js';

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

const LIC_PORT = 5283;
const FIREBASE_ENV = {
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: PROJECT,
  VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000',
  VITE_FIREBASE_AUTH_EMULATOR: EMU,
  // The licence Worker (14): the hosted site's build has its address too (deploy.yml).
  VITE_FIREBASE_LICENSES_URL: `http://127.0.0.1:${LIC_PORT}`,
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

/**
 * The licence Worker itself (server/license-worker.js), in Node: its KV a Map,
 * its signing key made for this run, and the emulator's unsigned tokens let in
 * the way the Worker lets them in when told it is talking to the emulator. The
 * page is told the run's public key (`__cgTestLicensePublicKey`, as `tiers`
 * does), so the key it is handed verifies offline exactly as a real one would.
 */
const licKV = new Map();
const licPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const licPublic = await crypto.subtle.exportKey('jwk', licPair.publicKey);
const licEnv = {
  LICENSE_KV: { get: async (k) => licKV.get(k) ?? null, put: async (k, v) => { licKV.set(k, String(v)); }, delete: async (k) => { licKV.delete(k); } },
  LICENSE_PRIVATE_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', licPair.privateKey)),
  LICENSE_PUBLIC_KEY: JSON.stringify(licPublic),
  FIREBASE_AUTH_EMULATOR: EMU,
  FIREBASE_PROJECT_ID: PROJECT,
};
/** File a Pro key under an account, as the store's webhook would. */
async function fileProKey(email) {
  const now = Date.now();
  const token = await signLicenseKey({ id: 'check-pro-1', tier: 'pro', email, issuedAt: now }, licEnv.LICENSE_PRIVATE_KEY);
  licKV.set(`keys:${email}`, JSON.stringify([{ id: 'check-pro-1', tier: 'pro', email, token, issuedAt: now, maxMachines: 2, revoked: false }]));
}
const LICENSE_PUBLIC_INIT = `window.__cgTestLicensePublicKey = ${JSON.stringify(licPublic)};`;
function serveWorker(port) {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const r = await licenseWorker.fetch(new Request(`http://127.0.0.1:${port}${req.url}`, {
      method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    }), licEnv);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}
/** The tier the app gates by, as its account button says it (`data-cg-tier`). */
const tierShown = (page) => page.evaluate(() => [...document.querySelectorAll('[data-cg-tier]')].map((e) => e.getAttribute('data-cg-tier')).join(',')).catch(() => '');
/**
 * The lit Sign in: drawn, and lit, which is a light fill (the desk's primary
 * button) on it or on the pill inside it, where the account button's resting
 * look is a dark one. And its height, for the phone's thumb.
 */
const signInButton = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-cg-account-signin]')].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!el) return { shown: false, lit: false, h: 0 };
  const light = (n) => { const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g); if (!m) return false; const [r, g, b, a = 1] = m.map(Number); return a > 0.5 && (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.7; };
  return { shown: true, lit: [el, ...el.querySelectorAll('*')].some(light), h: el.getBoundingClientRect().height };
}).catch(() => ({ shown: false, lit: false, h: 0 }));

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
// The sign-in's buttons: Google and the emailed link. It was three with Apple,
// which the owner took off for now (2026-10-24; line 4 fails if it comes back
// without this changing too). 11 and 15 count up to this, so a form missing
// one of the two still fails them.
const PROVIDER_BUTTONS = 2;

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
  servers.push(await serve(ON_DIST, ON_PORT), await serve(OFF_DIST, OFF_PORT), await serveWorker(LIC_PORT));
  // `?debug` is what makes the App hang its harness hooks on window
  // (App.tsx), `chromaglassSettings` among them: the sign of the App being up.
  const ORIGIN = `http://127.0.0.1:${ON_PORT}/`;
  const ON = ORIGIN + '?debug', OFF = `http://127.0.0.1:${OFF_PORT}/?debug`;
  // The show's own address: the site's `/` is the webpage for every visit (6b).
  const SHOW = ORIGIN + 'show?debug';
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
  // Apple is held off (SignInScreen.tsx, APPLE_SIGN_IN; the owner, 2026-10-24),
  // so only Google is pressed, and the line below fails if an Apple button is
  // drawn at all: a sign-in that cannot complete is worse than none.
  for (const id of ['google.com']) {
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
  check('4. Google and an emailed link are offered, Apple is not, and Google goes to its provider', ['google.com', 'email'].every((p) => providers.includes(p)) && !providers.includes('apple.com') && asksFor['google.com'], `offered ${JSON.stringify(providers)}, reached ${JSON.stringify(asksFor)}`);

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

  // 6b. The site's own address is the webpage, signed in or not (the owner's
  // choice, 2026-10-24; lib/showPath.ts): a signed-in visit to `/` meets the
  // landing page, not the plate and not the sign-in, and its Play opens the
  // plate at /show with no sign-in. 6 is the same visitor at /show, where the
  // emailed link brought them back (5), the page never drawn.
  const shown = new URL(page.url()).pathname;
  await page.goto(ON);
  const front = await waitFor(() => landingShown(page), 30_000);
  const frontApp = await appUp(page);
  await page.click('[data-cg-landing-play]', { timeout: 5000 }).catch(() => {});
  const played = await waitFor(() => appUp(page), inTime());
  const playedAt = new URL(page.url()).pathname;
  check('6b. signed in, the site\'s own address is the webpage, and its Play opens the plate at /show with no sign-in',
    shown === '/show' && front && !frontApp && played && playedAt === '/show' && !(await page.evaluate(() => window.__cgSigninSeen)),
    `the link came back to ${shown}; webpage ${front ? 'drawn' : 'not drawn'}${frontApp ? ' over a running plate' : ''}; Play ${played ? `opened the plate at ${playedAt}` : 'opened no plate'}`);

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
  await other.goto(SHOW);
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
    s.ok = f.n >= PROVIDER_BUTTONS && f.bad === 0 && !f.over;
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
      // The films must not have loaded anything yet beyond the hero's: three clips, each with a poster.
      const clips = [...document.querySelectorAll('[data-cg-landing-clip]')];
      return { over: document.documentElement.scrollWidth > W + 1 || box.scrollWidth > W + 1, h: b.height, outside: b.left < -0.5 || b.right > W + 0.5, clips: clips.length };
    }) : null;
    if (up && process.env.SIGNIN_SHOT) await p.screenshot({ path: `${process.env.SIGNIN_SHOT}/landing-${s.name.replace(/\W+/g, '-')}.png`, fullPage: true });
    if (up && process.env.SIGNIN_SHOT) {
      for (const [tag, sel] of [['clips', '#clips']]) {
        await p.evaluate((q) => document.querySelector(q)?.scrollIntoView({ block: 'start' }), sel);
        await p.waitForTimeout(800);
        await p.screenshot({ path: `${process.env.SIGNIN_SHOT}/landing-${tag}-${s.name.replace(/\W+/g, '-')}.png` });
      }
    }
    s.landOk = !!f && !f.over && !f.outside && f.h >= 44 && f.clips === 3;
    landFit.push(`${s.name}: ${f ? `Play free ${Math.round(f.h)} px, ${f.clips} clips${f.outside ? ', outside the screen' : ''}${f.over ? ', page wider than the screen' : ''}` : 'landing page not drawn'}`);
    await c.close();
  }
  check('11b. the landing page fits a laptop and a phone, upright and on its side', sizes.every((s) => s.landOk), landFit.join('; '));

  const sheet = {};
  const lit = {};
  for (const s of [sizes[0], sizes[1]]) {
    await deleteAccount(EMAIL);
    licKV.clear();
    const c = await browser.newContext({ viewport: s.viewport, isMobile: s.touch, hasTouch: s.touch, deviceScaleFactor: 2 });
    await c.addInitScript(LICENSE_PUBLIC_INIT);
    const p = await c.newPage();
    // Gated (`?tierGates=1`), as the hosted site is: unlicensed reads Free (14).
    await p.goto(ON + '&tierGates=1');
    await waitFor(() => signinOpen(p), 30_000);
    const r = await signInByEmail(p, ORIGIN);
    if (s === sizes[0] && r.up) {
      // 14. Free first, with nothing on the account; then a Pro key filed on
      // it, and the next start reads Pro with the sheet never opened.
      await p.waitForTimeout(3000);
      const before = await tierShown(p);
      await fileProKey(EMAIL);
      await p.reload();
      const upAgain = await waitFor(() => appUp(p), BOOT_MS);
      const pro = upAgain && await waitFor(async () => (await tierShown(p)).split(',').includes('pro'), 20_000);
      const opened = await p.evaluate(() => !!document.querySelector('[data-cg-account]'));
      check('14. an account holding a Pro key reads Pro once the app starts signed in, the sheet never opened', before.split(',').includes('free') && pro && !opened, `before the key: ${before || 'no tier drawn'}; after: ${await tierShown(p) || 'no tier drawn'}${opened ? '; the sheet was open' : ''}`);
    }
    let named = false;
    if (r.up) {
      await p.click('[data-cg-account-open]', { timeout: 10_000 }).catch(() => {});
      named = await p.waitForSelector('[data-cg-account]', { state: 'visible', timeout: 10_000 }).then(async (el) => (await el.textContent())?.includes(EMAIL), () => false);
    }
    sheet[s.name] = named;
    if (process.env.SIGNIN_SHOTS && named) await p.screenshot({ path: `${process.env.SIGNIN_SHOTS}/12-${s.viewport.width}.png` });
    if (s === sizes[0] && named) {
      // 15–16 on the desk: sign out from the sheet, close it, and the way
      // back in is on the desk, lit; it opens the sign-in in the sheet, over
      // a plate that is still up, and signing in there brings the account back.
      await p.click('[data-cg-account-signout]').catch(() => {});
      await p.click('[data-cg-account-signout-confirm]', { timeout: 5000 }).catch(() => {});
      await p.keyboard.press('Escape');
      // Waited for lit, not only drawn: the desk's button eases its colour in
      // (transition-colors), and a read mid-ease saw it half dark (a red run).
      await waitFor(async () => { const b = await signInButton(p); return b.shown && b.lit; }, 10_000);
      lit[s.name] = await signInButton(p);
      await p.click('[data-cg-account-signin]').catch(() => {});
      const offered = await waitFor(() => p.evaluate((n) => document.querySelectorAll('[data-cg-account] [data-cg-signin] [data-cg-signin-provider]').length >= n, PROVIDER_BUTTONS), 15_000);
      lit[s.name].opens = offered && await appUp(p);
      if (process.env.SIGNIN_SHOTS) await p.screenshot({ path: `${process.env.SIGNIN_SHOTS}/15-signed-out.png` });
      const again = await signInByEmail(p, ORIGIN);
      let back = false, why = '';
      if (again.up) {
        const button = await waitFor(async () => !(await signInButton(p)).shown && await p.evaluate(() => !!document.querySelector('[data-cg-account-open]')), 15_000);
        await p.click('[data-cg-account-open]', { timeout: 10_000 }).catch(() => {});
        const renamed = await p.waitForSelector('[data-cg-account]', { state: 'visible', timeout: 10_000 }).then(async (el) => (await el.textContent())?.includes(EMAIL), () => false);
        back = button && renamed;
        why = `, button ${button ? 'Account' : 'still Sign in or missing'}, sheet ${renamed ? 'names the account' : 'does not'}`;
        if (process.env.SIGNIN_SHOTS) await p.screenshot({ path: `${process.env.SIGNIN_SHOTS}/16.png` });
      }
      check('16. signing in again from the sheet brings the account back: the button says Account and the sheet names the account', back, `sent ${again.sent}, plate ${again.up}${why}`);
      await p.keyboard.press('Escape');
    }
    if (s === sizes[1]) {
      // 13. Deleting the account, from the phone: the store's rule
      // (App Store 5.1.1(v)) and the owner's privacy page both promise it.
      await p.click('[data-cg-account-delete]').catch(() => {});
      await p.click('[data-cg-account-delete-confirm]').catch(() => {});
      const gone = await waitFor(async () => !(await accounts()).some((u) => u.email === EMAIL), 15_000);
      check('13. deleting the account from the sheet removes it from the auth server', named && gone);
      // 15 on the phone: the deletion signed this phone out; its header says so.
      await p.keyboard.press('Escape');
      await waitFor(async () => { const b = await signInButton(p); return b.shown && b.lit; }, 10_000);
      lit[s.name] = { ...(await signInButton(p)), opens: await appUp(p) };
    }
    await c.close();
  }
  check('12. the account sheet opens from the desk and from the phone, and names the account', Object.values(sheet).every(Boolean), JSON.stringify(sheet));
  const litOk = (l, phone) => !!l && l.shown && l.lit && l.opens && (!phone || l.h >= 44);
  check('15. signed out with the plate up, the desk and the phone show a lit Sign in (44 px on the phone) that opens the sign-in over the running plate', litOk(lit[sizes[0].name], false) && litOk(lit[sizes[1].name], true), JSON.stringify(lit));

  // ── 17–21: email and password (PLAN.md 23.10e) ───────────────────────────
  {
    const PW = 'correct horse 9';
    const idpToken = (email) => {
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
      return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'google-' + email, email, email_verified: true, iss: 'https://accounts.google.com' })}.`;
    };
    /** An account that signed in with Google and has no password, made on the emulator's side. */
    async function makeGoogleAccount(email) {
      const r = await fetch(`${EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestUri: 'http://localhost', returnSecureToken: true, postBody: `id_token=${idpToken(email)}&providerId=google.com` }),
      });
      if (!r.ok) throw new Error(`the emulator would not make a Google account (${r.status})`);
    }
    const accountsFor = async (email) => (await accounts()).filter((u) => u.email === email);
    const providersFor = async (email) => (await accountsFor(email)).flatMap((u) => (u.providerUserInfo ?? []).map((i) => i.providerId)).sort();
    const oobs = async (email, type) => ((await (await fetch(`${EMU}/emulator/v1/projects/${PROJECT}/oobCodes`)).json()).oobCodes ?? []).filter((o) => o.email === email && o.requestType === type);
    /** Open the link a mail holds, as the browser would: the emulator's action endpoint. */
    async function confirmEmail(email) {
      const c = (await oobs(email, 'VERIFY_EMAIL')).pop();
      if (!c) return false;
      const r = await fetch(`${EMU}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oobCode: c.oobCode }) });
      return r.ok;
    }
    const flagSet = (p) => p.evaluate(() => localStorage.getItem('chromaglass-signed-in') === '1').catch(() => false);
    /** The sign-in's password panel, open (sign-up when asked), from wherever the visit starts. */
    async function openPasswordPanel(p, signup) {
      if (!(await waitFor(() => signinOpen(p), 30_000))) return false;
      await p.click('[data-cg-signin-provider="email"]').catch(() => {});
      await p.click('[data-cg-signin-method="password"]').catch(() => {});
      if (signup) await p.click('[data-cg-signin-mode="signup"]').catch(() => {});
      return p.waitForSelector('[data-cg-signin-password]', { state: 'visible', timeout: 5000 }).then(() => true, () => false);
    }
    async function submitPassword(p, email, pw) {
      await p.fill('[data-cg-signin-email]', email);
      await p.fill('[data-cg-signin-password]', pw);
      await p.click('[data-cg-signin-password-submit]');
    }
    /** The popup of the emulator's stand-in for Google, answered as the person with this email. */
    async function answerGoogle(c, email) {
      const pop = await c.waitForEvent('page', { timeout: 15_000 }).catch(() => null);
      if (!pop) return false;
      await pop.waitForURL((u) => u.toString().includes('/emulator/auth/handler'), { timeout: 15_000 }).catch(() => {});
      await pop.waitForSelector('#add-account-button', { timeout: 15_000 }).catch(() => {});
      await pop.click('#add-account-button button').catch(() => {});
      await pop.fill('#email-input', email).catch(() => {});
      await pop.click('#sign-in').catch(() => {});
      return true;
    }

    // 17. A sign-up on the desk, and the confirmation it waits on.
    {
      const E = 'pw-desk@example.com';
      await deleteAccount(E);
      licKV.clear();
      const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await c.addInitScript(LICENSE_PUBLIC_INIT);
      const p = await c.newPage();
      await p.goto(ON + '&tierGates=1');
      const opened = await openPasswordPanel(p, true);
      if (opened) await submitPassword(p, E, PW);
      const up = opened && await waitFor(() => appUp(p), BOOT_MS);
      const made = await accountsFor(E);
      const unconfirmed = made.length === 1 && made[0].emailVerified !== true;
      const mailed = (await oobs(E, 'VERIFY_EMAIL')).length > 0;
      // The Pro key is filed before the app starts again, so "Free" below is the
      // Worker's refusal and not simply a missing key.
      await fileProKey(E);
      let freeWhileUnconfirmed = false, banner = false, proAfter = false, bannerGone = false;
      if (up) {
        await p.reload();
        if (await waitFor(() => appUp(p), BOOT_MS)) {
          await p.waitForTimeout(4000);
          freeWhileUnconfirmed = (await tierShown(p)).split(',').includes('free') && !(await tierShown(p)).split(',').includes('pro');
          await p.click('[data-cg-account-open]', { timeout: 10_000 }).catch(() => {});
          banner = await p.waitForSelector('[data-cg-account-verify]', { state: 'visible', timeout: 10_000 }).then(() => true, () => false);
          const opened = await confirmEmail(E);
          await p.click('[data-cg-account-verify-done]').catch(() => {});
          bannerGone = opened && await waitFor(() => p.evaluate(() => !document.querySelector('[data-cg-account-verify]')), 15_000);
          proAfter = bannerGone && await waitFor(async () => (await tierShown(p)).split(',').includes('pro'), 20_000);
          if (process.env.SIGNIN_SHOTS) await p.screenshot({ path: `${process.env.SIGNIN_SHOTS}/17.png` });
        }
      }
      check('17. a password sign-up makes one unconfirmed account, mails the link, starts the plate; a Pro key reads Free until the email is confirmed, then Pro', opened && up && unconfirmed && mailed && freeWhileUnconfirmed && banner && proAfter, `form ${opened}, plate ${up}, accounts ${made.length}${unconfirmed ? ' unconfirmed' : ''}, mail ${mailed}, Free before ${freeWhileUnconfirmed}, banner ${banner}, Pro after ${proAfter}`);
      await c.close();
    }

    // 18. On a phone: the password signs in to that same account, a wrong one is
    // refused in words, and a reset mail is sent.
    {
      const E = 'pw-desk@example.com';
      const before = (await accountsFor(E)).map((u) => u.localId);
      const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
      const wrong = await browser.newContext(phone);
      const wp = await wrong.newPage();
      await wp.goto(ON);
      let refused = false, wrongStayed = false, resetSent = false, mailedReset = false;
      if (await openPasswordPanel(wp, false)) {
        await submitPassword(wp, E, 'not the password');
        refused = await wp.waitForSelector('[data-cg-signin-error]', { state: 'visible', timeout: 15_000 }).then(async (el) => /don't match/.test((await el.textContent()) ?? ''), () => false);
        wrongStayed = !(await flagSet(wp)) && !(await appUp(wp));
        const n = (await oobs(E, 'PASSWORD_RESET')).length;
        await wp.click('[data-cg-signin-reset]').catch(() => {});
        resetSent = await wp.waitForSelector('[data-cg-signin-reset-sent]', { state: 'visible', timeout: 15_000 }).then(() => true, () => false);
        mailedReset = (await oobs(E, 'PASSWORD_RESET')).length > n;
      }
      await wrong.close();
      const good = await browser.newContext(phone);
      const gp = await good.newPage();
      await gp.goto(ON);
      let up = false;
      if (await openPasswordPanel(gp, false)) {
        await submitPassword(gp, E, PW);
        up = await waitFor(() => appUp(gp), BOOT_MS);
      }
      const after = (await accountsFor(E)).map((u) => u.localId);
      const same = before.length === 1 && after.length === 1 && before[0] === after[0];
      check('18. on a phone the password signs in to the same account (one uid), a wrong password is refused in words with no plate, and Forgot password mails a reset', up && same && refused && wrongStayed && resetSent && mailedReset, `plate ${up}, uid ${same ? 'unchanged' : 'changed'} (${after.length} accounts), wrong password ${refused ? 'refused in words' : 'not refused'}${wrongStayed ? '' : ', but the plate started or the flag was set'}, reset ${resetSent && mailedReset ? 'mailed' : 'not mailed'}`);
      await good.close();
    }

    // 19. An address that already has a Google account, signed up again with a password.
    {
      const E = 'pw-google@example.com';
      await deleteAccount(E);
      await makeGoogleAccount(E);
      const uid = (await accountsFor(E))[0]?.localId;
      const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await c.newPage();
      await p.goto(ON);
      let said = false, onlyOne = false, linked = false, up = false, whyNot = '';
      if (await openPasswordPanel(p, true)) {
        await submitPassword(p, E, PW);
        said = await p.waitForSelector('[data-cg-signin-exists]', { state: 'visible', timeout: 15_000 }).then(() => true, () => false);
        onlyOne = (await accountsFor(E)).length === 1 && !(await flagSet(p));
        if (said) {
          const popup = answerGoogle(c, E);
          await p.click('[data-cg-signin-google-add]');
          await popup;
          up = await waitFor(() => appUp(p), BOOT_MS);
          if (!up) whyNot = (await p.textContent('[data-cg-signin-error]', { timeout: 1000 }).catch(() => 'no message')) ?? '';
          const now = await accountsFor(E);
          linked = now.length === 1 && now[0].localId === uid && (await providersFor(E)).join() === 'google.com,password';
        }
      }
      check('19. an address with a Google account, signed up with a password: no second account, and Continue with Google leaves one account with both ways in', said && onlyOne && up && linked, `form said so ${said}, one account and nobody signed in ${onlyOne}, after Google: ${(await providersFor(E)).join(' + ') || 'no account'}${linked ? ' on the same uid' : ''}, plate ${up}${whyNot ? ` [${whyNot}]` : ''}`);
      await c.close();
    }

    // 20. Setting a password from the sheet: a Google account (linkWithCredential)
    // and an emailed-link account (updatePassword), each then signed in with it.
    {
      const results = [];
      for (const kind of ['google', 'link']) {
        const E = kind === 'google' ? 'pw-set-google@example.com' : 'pw-set-link@example.com';
        await deleteAccount(E);
        const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p = await c.newPage();
        await p.goto(ON);
        let signedIn = false;
        if (kind === 'google') {
          if (await waitFor(() => signinOpen(p), 30_000)) {
            const popup = answerGoogle(c, E);
            await p.click('[data-cg-signin-provider="google.com"]');
            await popup;
            signedIn = await waitFor(() => appUp(p), BOOT_MS);
          }
        } else if (await waitFor(() => signinOpen(p), 30_000)) {
          await p.click('[data-cg-signin-provider="email"]').catch(() => {});
          await p.fill('[data-cg-signin-email]', E);
          const n = (await oobs(E, 'EMAIL_SIGNIN')).length;
          await p.click('[data-cg-signin-send]');
          const link = await emailLink(E, n);
          if (link) { await p.goto(link); signedIn = await waitFor(() => appUp(p), BOOT_MS); }
        }
        let saved = false, listed = '';
        if (signedIn) {
          await p.click('[data-cg-account-open]', { timeout: 10_000 }).catch(() => {});
          await p.click('[data-cg-account-password-open]', { timeout: 10_000 }).catch(() => {});
          await p.fill('[data-cg-account-password-input]', PW).catch(() => {});
          await p.click('[data-cg-account-password-save]').catch(() => {});
          saved = await p.waitForSelector('[data-cg-account-methods-note="ok"]', { timeout: 15_000 }).then(() => true, () => false);
          listed = (await p.textContent('[data-cg-account-methods-list]').catch(() => '')) ?? '';
          if (!saved) listed += ` [note: ${(await p.textContent('[data-cg-account-methods-note]').catch(() => 'none'))}]`;
        }
        await c.close();
        const uid = (await accountsFor(E))[0]?.localId;
        // Signed in again with the password only, in a browser that has never seen the account.
        const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p2 = await c2.newPage();
        await p2.goto(ON);
        let again = false;
        if (saved && await openPasswordPanel(p2, false)) {
          await submitPassword(p2, E, PW);
          again = await waitFor(() => flagSet(p2), 20_000);
        }
        await c2.close();
        const now = await accountsFor(E);
        results.push({ kind, ok: signedIn && saved && again && now.length === 1 && now[0].localId === uid && /Email/.test(listed) && (kind === 'link' || /Google/.test(listed)), detail: `${kind}: signed in ${signedIn}, saved ${saved}, sheet lists "${listed.trim()}", password sign-in ${again}, ${now.length} account(s)${now[0]?.localId === uid ? ', same uid' : ''}` });
      }
      check('20. a Google account and an emailed-link account each set a password from the sheet, and it signs in to the same account', results.every((r) => r.ok), results.map((r) => r.detail).join('; '));
    }

    // 21. The password form on the same three screens as 11.
    {
      const fitText = [];
      let all = true;
      for (const sz of sizes) {
        const c = await browser.newContext({ viewport: sz.viewport, isMobile: sz.touch, hasTouch: sz.touch, deviceScaleFactor: 2 });
        const p = await c.newPage();
        await p.goto(ON);
        const open = await openPasswordPanel(p, true);
        const f = open ? await p.evaluate(() => {
          const W = innerWidth;
          const buttons = [...document.querySelectorAll('[data-cg-signin] button, [data-cg-signin] [role="tab"]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
          const rects = buttons.map((b) => ({ r: b.getBoundingClientRect() }));
          const bad = rects.filter(({ r }) => r.left < -0.5 || r.right > W + 0.5 || r.height < 43.5);
          return { over: document.documentElement.scrollWidth > W + 1, n: rects.length, bad: bad.length };
        }) : null;
        const ok = !!f && !f.over && f.bad === 0 && f.n >= 6;
        all = all && ok;
        fitText.push(`${sz.name}: ${f ? `${f.n} buttons, ${f.bad} outside or under 44 px${f.over ? ', wider than the screen' : ''}` : 'panel did not open'}`);
        if (process.env.SIGNIN_SHOTS && open) await p.screenshot({ path: `${process.env.SIGNIN_SHOTS}/21-${sz.viewport.width}.png` });
        await c.close();
      }
      check('21. the password form fits a laptop and a phone, upright and on its side: nothing wider than the screen, every button a thumb\'s height', all, fitText.join('; '));
    }

    // ── 22–24: the Mac app opens on a Home or Pro key, not on an account ──
    // (PLAN.md 23.17d; the owner, 2026-10-25: "The Mac app should check the
    // license. The app won't work for free.") `?requireSignIn=1` is the word
    // the app's shell says (desktop/preload.cjs), read the same way here
    // (lib/authFlag.ts); this build has the accounts, the emulator and the
    // Worker, as the app as it ships does (desktop.yml). Under 23.11 a signed-in
    // account opened the show, so 22 fails on the code before 23.17d: the plate
    // came up behind a free account.
    {
      const E = 'mac-app@example.com';
      await deleteAccount(E);
      licKV.clear();
      const MAC = SHOW + '&requireSignIn=1';
      const step = (p) => p.evaluate(() => document.querySelector('[data-cg-app-licence]')?.getAttribute('data-cg-app-licence') ?? null).catch(() => null);
      const stepIs = (p, want, ms = 30_000) => waitFor(async () => (await step(p)) === want, ms);
      // 'unread' when the page cannot be asked, so an unreadable page never reads as "the key is gone".
      const storedKey = (p) => p.evaluate(() => localStorage.getItem('chromaglass:license-key')).catch(() => 'unread');
      async function fileKey(email, tier, id) {
        const now = Date.now();
        const token = await signLicenseKey({ id, tier, email, issuedAt: now }, licEnv.LICENSE_PRIVATE_KEY);
        licKV.set(`keys:${email}`, JSON.stringify([{ id, tier, email, token, issuedAt: now, maxMachines: 2, revoked: false }]));
      }
      const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await c.addInitScript(LICENSE_PUBLIC_INIT);
      const p = await c.newPage();
      await p.goto(MAC);

      // 22. Signed out: the sign-in, no plate. A password account: first the
      // confirmation (the Worker gives keys only to a confirmed email), then,
      // with no key on the account, Home and Pro to buy, and still no plate.
      const signin = await stepIs(p, 'signin');
      let confirm = false, buy = false, plateBehind = false, buyAt = 0;
      if (signin && await openPasswordPanel(p, true)) {
        await submitPassword(p, E, PW);
        confirm = await stepIs(p, 'confirm');
        if (confirm && await confirmEmail(E)) {
          await p.click('[data-cg-app-licence-confirm] button').catch(() => {});
          buy = await stepIs(p, 'buy');
          buyAt = Date.now();
        }
        await p.waitForTimeout(2000);
        plateBehind = await appUp(p);
      }
      const links = await p.evaluate(() => [...document.querySelectorAll('[data-cg-app-licence-checkout]')].map((a) => a.getAttribute('data-cg-app-licence-checkout') + (a.getAttribute('href')?.includes('lemonsqueezy.com/checkout') ? '' : ':no-store-link')).join(',')).catch(() => '');
      check('22. the Mac app signed out shows the sign-in; a free account gets Confirm, then Buy Home or Pro, and never the plate', signin && confirm && buy && links === 'home,pro' && !plateBehind,
        `sign-in ${signin}, confirm ${confirm}, buy ${buy} (${links || 'no checkout links'}), plate ${plateBehind ? 'UP behind it' : 'not started'}; at the end the screen says ${await step(p)}`);

      // 23. The store files a Home key for the account; "check again" opens the
      // show, and it is Home, not Pro: the tiers the website has.
      await fileKey(E, 'home', 'mac-home-1');
      // The button, not the screen's own re-ask every 20 s: the door must be
      // gone within 5 s of the click and before the first re-ask would come.
      const clicked = await p.click('[data-cg-app-licence-recheck]', { timeout: 5000 }).then(() => Date.now(), () => 0);
      const doorGone = clicked > 0 && await waitFor(async () => (await step(p)) === null, 5000);
      const byButton = doorGone && Date.now() - buyAt < 18_000;
      const up = byButton && await waitFor(() => appUp(p), BOOT_MS);
      const tier = up ? await waitFor(async () => (await tierShown(p)).split(',').includes('home'), 20_000).then(() => tierShown(p)) : '';
      check('23. once the account holds a Home key, check again opens the show, at Home', byButton && up && tier.split(',').includes('home') && !tier.split(',').includes('pro'), `${!clicked ? 'no check-again button' : doorGone ? `the door went ${((Date.now() - buyAt) / 1000).toFixed(0)} s after Buy appeared${byButton ? ', on the click' : ', too late to be the click'}` : 'the door stayed after the click'}; plate ${up}, tier ${tier || 'not drawn'}`);

      // 24. Refunded: the Worker's list no longer has the key (its refund drops
      // it, server/license-worker.js). The show that is up stays up (never
      // locked out mid-set); the key is gone from the machine; the next start
      // is the buy screen again. Before 23.17d a refunded key verified for ever.
      // The control: a key really is on the machine before the refund.
      const heldBefore = await storedKey(p);
      licKV.set(`keys:${E}`, JSON.stringify([]));
      await p.reload();
      const upAgain = await waitFor(() => appUp(p), BOOT_MS);
      const retired = upAgain && typeof heldBefore === 'string' && heldBefore.startsWith('cg1.') && await waitFor(async () => (await storedKey(p)) === null, 20_000);
      await p.waitForTimeout(3000);
      const stayed = await appUp(p);
      await p.reload();
      const backToBuy = await stepIs(p, 'buy', 45_000);
      const noPlate = !(await appUp(p));
      check('24. a refunded key: the running show stays up, the key leaves the machine, and the next start asks to buy', upAgain && retired && stayed && backToBuy && noPlate,
        `a key held before ${typeof heldBefore === 'string' && heldBefore.startsWith('cg1.')}, opened on it ${upAgain}, key taken off ${retired}, show still up ${stayed}, next start ${await step(p) ?? 'the plate'}`);
      await c.close();
    }
  }
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
