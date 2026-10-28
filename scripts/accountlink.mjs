#!/usr/bin/env node
/**
 * Linking devices by account (PLAN.md 23.14):
 *
 *   npm run accountlink
 *
 * What 23.14 asks:
 *   1. A signed-in show running with the show server publishes its address and
 *      key to the account's running-show list, while keeping the QR code in
 *      Phone · iPad for a guest's phone or a venue with no internet.
 *   2. A phone, tablet or laptop signed in to the same account sees the
 *      running show in a list and joins it with a single tap — no address or
 *      key typed — handing over the show's address and key just as the QR code
 *      does, so the show counts "1 phone linked.".
 *   3. A third page signed in to another account sees nothing (neither in the
 *      API nor on the page), and unauthenticated or expired tokens are
 *      refused.
 *   4. Once linked, control stays on the local network: cutting off the
 *      internet (the Auth emulator and the account-shows directory) never
 *      drops the remote socket or stops the phone from driving the show.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { clickAt } from './layoutProbe.mjs';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createAccountShowsStore, verifyAccountToken } from '../server/account-shows.js';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const FIREBASE_TOOLS = 'firebase-tools@15.33.0';
const PROJECT = 'demo-chromaglass';
const EMU_PORT = Number(process.env.ACCOUNTLINK_EMU_PORT ?? 9209);
const EMU = `http://127.0.0.1:${EMU_PORT}`;
const PORT = Number(process.env.ACCOUNTLINK_PORT ?? 4297);
const KEY = '7391';
const DIST = resolve(process.env.ACCOUNTLINK_DIST ?? 'dist-accountlink');
const BOOT_MS = 90_000;
const SHOW_EMAIL = 'show@example.com';
const OTHER_EMAIL = 'other@example.com';

const FIREBASE_ENV = {
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: PROJECT,
  VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000',
  VITE_FIREBASE_AUTH_EMULATOR: EMU,
};

function makeFakeJwt(payload) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
}

// ── 1. Pure store & token isolation checks ──────────────────────────────────
{
  const now = 1_700_000_000_000;
  const nowSec = Math.floor(now / 1000);
  const tokA = makeFakeJwt({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'user-a',
    email: SHOW_EMAIL,
    iat: nowSec - 60,
    exp: nowSec + 3600,
  });
  const tokB = makeFakeJwt({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'user-b',
    email: OTHER_EMAIL,
    iat: nowSec - 60,
    exp: nowSec + 3600,
  });
  const tokExpired = makeFakeJwt({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'user-a',
    email: SHOW_EMAIL,
    iat: nowSec - 60,
    exp: nowSec - 120,
  });

  // The emulator's tokens are unsigned, so they count only on a server told the
  // emulator is in use (as the one this check starts below is).
  const EMU_ENV = { FIREBASE_AUTH_EMULATOR: `127.0.0.1:${EMU_PORT}`, FIREBASE_PROJECT_ID: PROJECT };
  const verifiedA = await verifyAccountToken(`Bearer ${tokA}`, EMU_ENV, now);
  const verifiedB = await verifyAccountToken(`Bearer ${tokB}`, EMU_ENV, now);
  const rejectedExpired = await verifyAccountToken(`Bearer ${tokExpired}`, EMU_ENV, now);
  const rejectedBlank = await verifyAccountToken('', EMU_ENV, now);
  check(
    '1. token verification accepts valid account tokens and refuses missing or expired ones',
    !!verifiedA && !!verifiedB && verifiedA.accountKey !== verifiedB.accountKey && !rejectedExpired && !rejectedBlank,
    `A=${verifiedA?.accountKey}, B=${verifiedB?.accountKey}, expired=${rejectedExpired}`,
  );

  // PLAN 23.14-verify: the server used to trust a token's payload unread. The
  // same unsigned token is refused by a server not running the emulator; a
  // token Google's key signed is taken; one signed by any other key, or signed
  // for another project, is not.
  const google = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const forger = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const LIVE_ENV = { FIREBASE_PROJECT_ID: 'chromaglass', GOOGLE_JWKS: { keys: [{ ...(await crypto.subtle.exportKey('jwk', google.publicKey)), kid: 'k1' }] } };
  const signed = async (key, aud) => {
    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const head = `${b64({ alg: 'RS256', typ: 'JWT', kid: 'k1' })}.${b64({ iss: `https://securetoken.google.com/${aud}`, aud, sub: 'user-a', email: SHOW_EMAIL, iat: nowSec - 60, exp: nowSec + 3600 })}`;
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head));
    return `Bearer ${head}.${Buffer.from(sig).toString('base64url')}`;
  };
  const unsignedOnLive = await verifyAccountToken(`Bearer ${tokA}`, LIVE_ENV, now);
  const real = await verifyAccountToken(await signed(google.privateKey, 'chromaglass'), LIVE_ENV, now);
  const forged = await verifyAccountToken(await signed(forger.privateKey, 'chromaglass'), LIVE_ENV, now);
  const otherProject = await verifyAccountToken(await signed(google.privateKey, 'some-other-app'), LIVE_ENV, now);
  check(
    '1b. a signed token is taken; an unsigned, forged or other-project token is refused without the emulator',
    !!real && real.uid === 'user-a' && !unsignedOnLive && !forged && !otherProject,
    `signed=${real?.accountKey ?? null}, unsigned=${!!unsignedOnLive}, forged=${!!forged}, other project=${!!otherProject}`,
  );

  const store = createAccountShowsStore();
  store.upsert(
    verifiedA.accountKey,
    {
      id: 'show-1',
      name: 'Main Stage',
      relay: 'http://192.168.1.25:3001',
      url: 'http://192.168.1.25:3001/?remote=1&key=7391',
      hosts: ['192.168.1.25'],
      port: 3001,
      key: '7391',
    },
    now,
  );
  const listA = store.list(verifiedA.accountKey, now + 5000);
  const listB = store.list(verifiedB.accountKey, now + 5000);
  const listExpired = store.list(verifiedA.accountKey, now + 100_000);
  check(
    '2. account store isolates running shows strictly to the signed-in account and expires stale entries',
    listA.length === 1 && listA[0].key === '7391' && listB.length === 0 && listExpired.length === 0,
    `account A saw ${listA.length}, account B saw ${listB.length}, after TTL saw ${listExpired.length}`,
  );
}

// ── Build with Firebase config pointed at the Auth emulator ─────────────────
if (!process.env.ACCOUNTLINK_SKIP_BUILD) {
  const env = { ...process.env, ...FIREBASE_ENV };
  execSync(`npx vite build --outDir ${DIST} --emptyOutDir`, {
    env,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

// ── Start the Firebase Auth emulator and the show server ────────────────────
const emuDir = mkdtempSync(join(tmpdir(), 'cg-accountlink-'));
writeFileSync(
  join(emuDir, 'firebase.json'),
  JSON.stringify({ emulators: { auth: { port: EMU_PORT, host: '127.0.0.1' }, ui: { enabled: false } } }),
);
const emu = spawn('npx', ['-y', FIREBASE_TOOLS, 'emulators:start', '--only', 'auth', '--project', PROJECT], {
  cwd: emuDir,
  stdio: 'ignore',
  detached: true,
});

async function emuReady() {
  for (let i = 0; i < 240; i++) {
    try {
      if ((await (await fetch(EMU)).json()).authEmulator?.ready) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startRelay() {
  const proc = spawn(process.execPath, ['server/remote-server.js'], {
    env: {
      ...process.env, PORT: String(PORT), SHOW_KEY: KEY, OSC_PORT: '0', REMOTE_DIST: DIST,
      FIREBASE_AUTH_EMULATOR: `127.0.0.1:${EMU_PORT}`, FIREBASE_PROJECT_ID: PROJECT,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  return new Promise((resolvePromise, reject) => {
    const bail = setTimeout(() => reject(new Error('the show server did not start')), 30_000);
    let said = '';
    const seen = () => {
      if (said.includes('Show key')) {
        clearTimeout(bail);
        resolvePromise(proc);
      }
    };
    proc.stdout.on('data', (d) => {
      said += String(d);
      seen();
    });
    proc.stderr.on('data', (d) => {
      said += String(d);
      seen();
    });
    proc.on('exit', (c) => {
      clearTimeout(bail);
      reject(new Error(`the show server exited ${c}: ${said.slice(0, 300)}`));
    });
  });
}

const stop = (proc) => {
  if (!proc) return;
  try {
    process.kill(-proc.pid, 'SIGTERM');
  } catch {
    try {
      proc.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
};

const outbox = async (email) =>
  ((await (await fetch(`${EMU}/emulator/v1/projects/${PROJECT}/oobCodes`)).json()).oobCodes ?? []).filter(
    (o) => o.email === email && o.requestType === 'EMAIL_SIGNIN',
  );

async function emailLink(email, before) {
  for (let i = 0; i < 40; i++) {
    const sent = await outbox(email);
    const c = sent.length > before ? sent[sent.length - 1] : null;
    if (c) {
      const link = new URL(c.oobLink);
      const to = new URL(link.searchParams.get('continueUrl'));
      for (const k of ['mode', 'oobCode', 'apiKey', 'lang']) {
        if (link.searchParams.get(k)) to.searchParams.set(k, link.searchParams.get(k));
      }
      return to.toString();
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

const appUp = (page) => page.evaluate(() => typeof window.chromaglassSettings === 'function').catch(() => false);
const signinShown = (page) =>
  page
    .evaluate(() => {
      const el = document.querySelector('[data-cg-signin]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
    })
    .catch(() => false);

async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

// A first visit meets the landing page before the sign-in (PLAN.md 34a), and
// its Play free is what opens the sign-in; a visit already part way through
// signing in meets the sign-in itself. True once the sign-in is drawn.
async function signinOpen(page) {
  if (await signinShown(page)) return true;
  await page.click('[data-cg-landing-play]', { timeout: 500 }).catch(() => {});
  return signinShown(page);
}

async function signInByEmail(page, email, origin) {
  await waitFor(() => signinOpen(page), 30_000);
  await page.click('[data-cg-signin-provider="email"]').catch(() => {});
  await page.fill('[data-cg-signin-email]', email);
  const before = (await outbox(email)).length;
  await page.click('[data-cg-signin-send]');
  await page.waitForSelector('[data-cg-signin-sent]', { timeout: 15_000 });
  const link = await emailLink(email, before);
  if (!link || !link.startsWith(origin)) return false;
  await page.goto(link);
  return waitFor(() => appUp(page), BOOT_MS);
}

let browser = null;
let relay = null;
try {
  if (!(await emuReady())) throw new Error('the Firebase Auth emulator did not start');
  await fetch(`${EMU}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  relay = await startRelay();
  browser = await launchChromium(chromium);

  const ORIGIN = `http://127.0.0.1:${PORT}/`;
  const SHOW_URL = `${ORIGIN}?debug&look=classic&dpr=0.35`;

  // ── 3. Signed-in desktop show publishes its running show & keeps QR code ──
  const showCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const showPage = await showCtx.newPage();
  await showPage.goto(SHOW_URL);
  const showSignedIn = await signInByEmail(showPage, SHOW_EMAIL, ORIGIN);

  // Switch the desk to the Setup tab, where Phone · iPad is as it ships
  for (let i = 0; i < 40 && (await showPage.getByTestId('mode-segmented-setup').count()) === 0; i++) {
    await showPage.waitForTimeout(300);
  }
  await clickAt(showPage, 'mode-segmented-setup');

  const qrAndStatus = await waitFor(
    async () =>
      showPage.evaluate(() => {
        const p = document.querySelector('[data-testid="phone-link"]');
        const svg = document.querySelector('[data-testid="phone-link-qr"]');
        return (
          !!p &&
          p.textContent.includes('No phone linked.') &&
          !!svg?.querySelector('path') &&
          p.textContent.includes(`/?remote=1&key=${'7391'}`)
        );
      }),
    15_000,
  );
  check(
    '3. the signed-in show keeps the QR code on Phone · iPad for guests and offline venues',
    showSignedIn && qrAndStatus,
  );

  // ── 4. Third page signed in to another account sees nothing ───────────────
  const otherCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const otherPage = await otherCtx.newPage();
  await otherPage.goto(SHOW_URL);
  const otherSignedIn = await signInByEmail(otherPage, OTHER_EMAIL, ORIGIN);
  await otherPage.waitForTimeout(1500);
  const otherJoinButtons = await otherPage.locator('[data-testid="account-show-join"]').count();
  await otherPage.click('[data-cg-account-open]').catch(() => {});
  await otherPage.waitForSelector('[data-cg-account]', { state: 'visible', timeout: 10_000 });
  const otherSheetText = (await otherPage.locator('[data-cg-account]').textContent()) ?? '';
  const otherAccountJoinButtons = await otherPage.locator('[data-testid="account-show-join"]').count();
  check(
    '4. a third page signed into another account sees no running shows',
    otherSignedIn &&
      otherJoinButtons === 0 &&
      otherAccountJoinButtons === 0 &&
      otherSheetText.includes('No running shows on this account.'),
    `other account join buttons=${otherAccountJoinButtons}`,
  );
  await otherCtx.close();

  // ── 5. Phone on the same account sees the running show and joins in 1 tap ─
  const phoneCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const phonePage = await phoneCtx.newPage();
  await phonePage.goto(SHOW_URL);
  const phoneSignedIn = await signInByEmail(phonePage, SHOW_EMAIL, ORIGIN);

  // Wait for the running show to appear on the phone without typing any address
  const listed = await waitFor(
    async () => (await phonePage.locator('[data-testid="account-show-join"]').count()) > 0,
    15_000,
  );
  const joinLabel = listed
    ? ((await phonePage.locator('[data-testid="account-show-join"]').first().textContent()) ?? '').trim()
    : '';

  // Tap the running show with a single tap
  if (listed) {
    await phonePage.locator('[data-testid="account-show-join"]').first().click();
  }

  // The phone navigates to the remote surface (?remote=1&key=7391) and links to the show
  const remoteUp = await waitFor(
    async () =>
      phonePage.url().includes('remote=1') &&
      phonePage.url().includes(`key=${KEY}`) &&
      (await phonePage.locator('[data-testid="remote-pad"]').count()) > 0,
    15_000,
  );
  const showLinked = await waitFor(
    async () =>
      showPage.evaluate(() => {
        const s = document.querySelector('[data-testid="phone-link-status"]');
        return s?.textContent?.trim() === '1 phone linked.';
      }),
    10_000,
  );
  check(
    '5. a phone on the same account sees the running show and joins with a single tap and no address typed',
    phoneSignedIn && listed && remoteUp && showLinked,
    `listed="${joinLabel}", remoteUp=${remoteUp}, showLinked=${showLinked}`,
  );

  // ── 6. Losing the internet leaves local remote control working ────────────
  const cutAccountAndInternet = (ctx) =>
    ctx.route(
      (url) =>
        url.port === String(EMU_PORT) ||
        url.pathname === '/account-shows' ||
        /googleapis\.com|firebaseapp\.com|gstatic\.com/.test(url.host),
      (route) => route.abort(),
    );
  await cutAccountAndInternet(showCtx);
  await cutAccountAndInternet(phoneCtx);

  // Drive the show from the phone over the local WebSocket while offline
  const pad = phonePage.locator('[data-testid="remote-pad"]');
  const box = await pad.boundingBox();
  if (box) {
    await phonePage.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await phonePage.mouse.down();
    await phonePage.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
    await phonePage.mouse.up();
  }
  await showPage.waitForTimeout(1500);
  const stillLinkedOffline = await showPage.evaluate(() => {
    const s = document.querySelector('[data-testid="phone-link-status"]');
    return s?.textContent?.trim() === '1 phone linked.';
  });
  const remoteStillLive = await phonePage.evaluate(() => !!document.querySelector('[data-testid="remote-pad"]'));
  check(
    '6. once linked, cutting off the internet and account service keeps local remote control connected',
    stillLinkedOffline && remoteStillLive,
    `stillLinkedOffline=${stillLinkedOffline}, remoteStillLive=${remoteStillLive}`,
  );

  await phoneCtx.close();
  await showCtx.close();
} catch (e) {
  check('the check ran to its end', false, String(e?.message ?? e).split('\n')[0]);
} finally {
  await browser?.close().catch(() => {});
  stop(relay);
  stop(emu);
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\naccountlink: ${checks.length - failed}/${checks.length}${failed ? ' — FAIL' : ''}`);
process.exit(failed ? 1 : 0);
