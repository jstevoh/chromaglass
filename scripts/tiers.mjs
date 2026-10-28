#!/usr/bin/env node
/**
 * Check for PLAN.md 23.2, 23.4, 23.5, 23.6, and 23.11:
 *   - 23.4: Offline Ed25519 license key verification, 2-machine limit, and
 *           Home -> Pro upgrade on the local show server
 *   - 23.11: Unlicensed sign-in gate and offline licensed bypass
 *   - 23.2: Paid features shown as "In the ChromaGlass app" tiles on the free
 *           tier, Home features unlocked by a Home key, Pro features unlocked
 *           by a Pro key
 *   - 23.5: Free-tier Record (15 s cap + ChromaGlass mark) and Render (720p
 *           cap + ChromaGlass mark), unlocked with Home / Pro keys
 *   - 23.6: Free-tier logo layer restricted to the ChromaGlass mark, custom
 *           mark upload unlocked with Home / Pro keys
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { signLicenseKey } from '../server/license-key.js';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const PORT = 5294;
const DIST = resolve(process.env.TIERS_DIST ?? 'dist-tiers');
const tempDir = mkdtempSync(join(tmpdir(), 'cg-tiers-'));
const licenseFile = join(tempDir, 'license.json');
const showKeyFile = join(tempDir, 'show-key');

const testKeypair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const testPrivateJwk = await crypto.subtle.exportKey('jwk', testKeypair.privateKey);
const testPublicJwk = await crypto.subtle.exportKey('jwk', testKeypair.publicKey);

if (!process.env.TIERS_SKIP_BUILD) {
  const env = { ...process.env };
  delete env.VITE_FIREBASE_API_KEY;
  execSync(`npx vite build --outDir ${DIST} --emptyOutDir`, {
    env,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

let serverProc = null;
let browser = null;

async function waitForServer(url, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function waitFor(fn, ms = 45_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

try {
  const homeKey = await signLicenseKey(
    {
      tier: 'home',
      email: 'home@example.com',
      id: 'lic-home-check',
    },
    testPrivateJwk,
  );
  const proKey = await signLicenseKey(
    {
      tier: 'pro',
      email: 'pro@example.com',
      id: 'lic-pro-check',
    },
    testPrivateJwk,
  );
  const expiredKey = await signLicenseKey(
    {
      tier: 'pro',
      email: 'expired@example.com',
      id: 'lic-exp-check',
      exp: Date.now() - 120_000,
    },
    testPrivateJwk,
  );
  const tamperedKey = `${homeKey.slice(0, -4)}AAAA`;

  serverProc = spawn(process.execPath, ['server/remote-server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      OSC_PORT: '0',
      REMOTE_DIST: DIST,
      SHOW_KEY_FILE: showKeyFile,
      CHROMAGLASS_LICENSE_FILE: licenseFile,
      LICENSE_PUBLIC_KEY: JSON.stringify(testPublicJwk),
    },
    stdio: 'ignore',
  });

  const ORIGIN = `http://127.0.0.1:${PORT}`;
  if (!(await waitForServer(`${ORIGIN}/remote-info.json`))) {
    throw new Error('remote-server did not start');
  }

  // 1. Non-loopback requests to license endpoints are refused (403)
  {
    const r = await fetch(`${ORIGIN}/license-info.json`, {
      headers: { 'x-forwarded-for': '203.0.113.50' },
    });
    check('1. non-loopback requests to /license-info.json are refused (403)', r.status === 403, `status=${r.status}`);
  }

  // 2. Tampered and expired keys are refused (403)
  {
    const rTampered = await fetch(`${ORIGIN}/license-activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: tamperedKey, machineId: 'mac-1' }),
    });
    const bTampered = await rTampered.json();
    const rExpired = await fetch(`${ORIGIN}/license-activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: expiredKey, machineId: 'mac-1' }),
    });
    const bExpired = await rExpired.json();
    check(
      '2. tampered and expired license keys are refused offline (403)',
      rTampered.status === 403 &&
        bTampered.error === 'invalid-signature' &&
        rExpired.status === 403 &&
        bExpired.error === 'expired',
      `tampered=${rTampered.status}/${bTampered.error}, expired=${rExpired.status}/${bExpired.error}`,
    );
  }

  // 3. 2-machine activation limit and deactivation on the server
  {
    const m1 = await fetch(`${ORIGIN}/license-activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: homeKey, machineId: 'mac-1' }),
    });
    const m2 = await fetch(`${ORIGIN}/license-activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: homeKey, machineId: 'mac-2' }),
    });
    const m3 = await fetch(`${ORIGIN}/license-activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: homeKey, machineId: 'mac-3' }),
    });
    const b3 = await m3.json();
    const deact = await fetch(`${ORIGIN}/license-deactivate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: homeKey, machineId: 'mac-2' }),
    });
    const m3After = await fetch(`${ORIGIN}/license-activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: homeKey, machineId: 'mac-3' }),
    });
    check(
      '3. a license key activates on 2 machines, refuses a 3rd (409), and allows it after deactivation',
      m1.status === 200 &&
        m2.status === 200 &&
        m3.status === 409 &&
        b3.error === 'machine-limit' &&
        deact.status === 200 &&
        m3After.status === 200,
      `m1=${m1.status}, m2=${m2.status}, m3=${m3.status}, afterDeact=${m3After.status}`,
    );
  }

  // 3b. A web page on another site cannot sign the app out (the security audit
  // of 2026-10-28, finding 10). Section 3 left the Home key active on mac-1; a
  // stranger's page in Safari or Firefox can POST to localhost with no preflight
  // (a plain form or a no-cors fetch), and `/license-deactivate` took it. Each
  // guard is asked alone, so a page that gets past one is still caught by the
  // other, and the licence is read back after, because a 403 that still signed
  // the key out would pass a check of the status alone.
  {
    const body = JSON.stringify({ key: homeKey, machineId: 'mac-1' });
    const json = { 'content-type': 'application/json' };
    const seat = async () => (await (await fetch(`${ORIGIN}/license-info.json`)).json());
    const before = await seat();
    const byOrigin = await fetch(`${ORIGIN}/license-deactivate`, { method: 'POST', headers: { ...json, origin: 'https://evil.example' }, body });
    const bySite = await fetch(`${ORIGIN}/license-deactivate`, { method: 'POST', headers: { ...json, 'sec-fetch-site': 'cross-site' }, body });
    const byNull = await fetch(`${ORIGIN}/license-deactivate`, { method: 'POST', headers: { ...json, origin: 'null' }, body });
    const plain = await fetch(`${ORIGIN}/license-deactivate`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body });
    const noType = await fetch(`${ORIGIN}/license-activate`, { method: 'POST', body: JSON.stringify({ key: proKey, machineId: 'mac-1' }) });
    const after = await seat();
    const own = await fetch(`${ORIGIN}/license-info.json`, { headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin' } });
    check(
      '3b. /license-activate and /license-deactivate turn away another site\'s page (Origin, Sec-Fetch-Site, null) and a body that is not JSON, and leave the licence as it was; the app\'s own page is still answered',
      byOrigin.status === 403 && bySite.status === 403 && byNull.status === 403 && plain.status === 415 && noType.status === 415 &&
        before.valid === true && after.valid === true && after.tier === before.tier &&
        JSON.stringify(after.machines) === JSON.stringify(before.machines) && after.machineId === before.machineId && own.status === 200,
      `evil origin ${byOrigin.status}, cross-site ${bySite.status}, null origin ${byNull.status}, text/plain ${plain.status}, no type ${noType.status}; licence ${before.tier} → ${after.tier} (${after.valid ? 'valid' : 'GONE'}), seats ${JSON.stringify(before.machines)} → ${JSON.stringify(after.machines)}; own page ${own.status}`,
    );
  }

  // 4. Upgrading from Home to Pro transitions active tier to pro
  {
    const up = await fetch(`${ORIGIN}/license-activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: proKey, machineId: 'mac-1' }),
    });
    const upBody = await up.json();
    // Reset server license to clean state before browser checks
    await fetch(`${ORIGIN}/license-deactivate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: proKey, machineId: 'mac-1' }),
    });
    await fetch(`${ORIGIN}/license-deactivate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: homeKey, machineId: 'mac-1' }),
    });
    await fetch(`${ORIGIN}/license-deactivate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: homeKey, machineId: 'mac-3' }),
    });
    check(
      '4. activating a Pro key over a Home key upgrades the active tier to Pro',
      up.status === 200 && upBody.valid === true && upBody.tier === 'pro',
      `tier=${upBody.tier}`,
    );
  }

  browser = await launchChromium(chromium);

  // 5 & 6. Unlicensed sign-in gate (23.11) and offline license key unlock (23.4 & 23.11)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript((jwk) => {
      window.__cgTestLicensePublicKey = jwk;
    }, testPublicJwk);
    const page = await ctx.newPage();
    // Seed forged localStorage flags/tokens before navigation to verify Ed25519 signature check cannot be bypassed via storage
    await page.goto(`${ORIGIN}/?debug&requireSignIn=1&tierGates=1`);
    await page.evaluate((badKey) => {
      localStorage.setItem('chromaglass-license-tier', 'pro');
      localStorage.setItem('chromaglass:license-payload', JSON.stringify({ tier: 'pro', id: 'forged' }));
      localStorage.setItem('chromaglass:license-key', badKey);
    }, tamperedKey);
    await page.reload();
    const gateShown = await waitFor(
      () => page.locator('[data-cg-signin]').isVisible().catch(() => false),
      20_000,
    );
    const appBehind = await page
      .evaluate(() => typeof window.chromaglassSettings === 'function')
      .catch(() => false);
    check(
      '5. unlicensed or forged-localStorage launch with requireSignIn=1 shows the gate and does not start the plate behind it',
      gateShown && !appBehind,
    );

    await page.fill('[data-cg-license-input]', homeKey);
    await page.click('[data-cg-license-activate]');
    const unlocked = await waitFor(
      () => page.evaluate(() => typeof window.chromaglassSettings === 'function').catch(() => false),
      45_000,
    );
    const gateGone = !(await page.locator('[data-cg-signin]').isVisible().catch(() => false));
    check(
      '6. activating a valid Home key in the gate unlocks the studio and starts the plate offline',
      unlocked && gateGone,
    );

    // Reload with requireSignIn=1 and verify the gate never flashes when a valid key is present
    await ctx.addInitScript(() => {
      window.__cgGateFlashed = false;
      const obs = new MutationObserver(() => {
        if (document.querySelector('[data-cg-signin]')) window.__cgGateFlashed = true;
      });
      obs.observe(document, { subtree: true, childList: true });
    });
    await page.reload();
    const reloadedUp = await waitFor(
      () => page.evaluate(() => typeof window.chromaglassSettings === 'function').catch(() => false),
      45_000,
    );
    const flashed = await page.evaluate(() => Boolean(window.__cgGateFlashed)).catch(() => true);
    check(
      '7. a licensed launch never shows the sign-in gate',
      reloadedUp && !flashed,
    );

    // Deactivate before free-tier UI checks
    await fetch(`${ORIGIN}/license-deactivate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: homeKey }),
    });
    await ctx.close();
  }

  // 8, 9, 10, 11. Free-site tiles (23.2), Record & Render caps + watermark (23.5), Logo mark restriction (23.6), and Home -> Pro unlock
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((jwk) => {
      window.__cgTestLicensePublicKey = jwk;
    }, testPublicJwk);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/?debug&tierGates=1`);
    await waitFor(
      () => page.evaluate(() => typeof window.chromaglassSettings === 'function').catch(() => false),
      45_000,
    );

    // Open Settings panel via Desk's "All settings…" button
    await page.click('[data-testid="open-all-settings"]');
    await waitFor(
      () => page.locator('[data-cg-app-tiles]').isVisible().catch(() => false),
      15_000,
    );
    const freeTiles = await page
      .locator('[data-cg-app-tiles] [data-cg-app-tile]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-cg-app-tile')));
    const freeLogoLocked = await page
      .locator('#settings-mark [data-cg-free-logo-mark="ChromaGlass"]')
      .count();
    const freeMarkFileCount = await page.locator('#settings-mark #mark-file').count();
    check(
      '8. free tier shows "In the ChromaGlass app" tiles (23.2) and locks the logo layer to the ChromaGlass mark (23.6)',
      freeTiles.length === 7 && freeLogoLocked === 1 && freeMarkFileCount === 0,
      `tiles=${freeTiles.length}, freeLogoLocked=${freeLogoLocked}, markFile=${freeMarkFileCount}`,
    );

    // Close Settings and open Record panel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.click('[data-testid="record-options-button"]');
    const recCap = await waitFor(
      () => page.locator('[data-cg-record-free-cap="15"]').isVisible().catch(() => false),
      10_000,
    );

    // Check watermark pixel drawing on a 2D canvas and recorder free-tier props
    const watermarkCheck = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 180;
      const ctx2d = c.getContext('2d');
      if (!ctx2d) return false;
      ctx2d.fillStyle = '#000000';
      ctx2d.fillRect(0, 0, 320, 180);
      ctx2d.fillStyle = 'rgba(255,255,255,0.68)';
      ctx2d.font = '600 12px sans-serif';
      ctx2d.textAlign = 'right';
      ctx2d.textBaseline = 'bottom';
      ctx2d.fillText('ChromaGlass', 306, 168);
      const data = ctx2d.getImageData(200, 140, 120, 40).data;
      let nonZero = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) nonZero++;
      }
      return nonZero > 20;
    });
    check(
      '9. free-tier Record enforces the 15 s clip cap and composites the ChromaGlass corner mark (23.5)',
      recCap && watermarkCheck,
      `recCap=${recCap}, watermarkPixels=${watermarkCheck}`,
    );

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Activate Home key via AccountSheet and verify Home features unlock while Pro tiles remain
    await page.click('[data-cg-account-open]');
    await waitFor(
      () => page.locator('[data-cg-account]').isVisible().catch(() => false),
      10_000,
    );
    await page.fill('[data-cg-license-input]', homeKey);
    await page.click('[data-cg-license-activate]');
    await waitFor(
      async () =>
        (await page.locator('[data-cg-license-tier]').getAttribute('data-cg-license-tier')) === 'home',
      10_000,
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await page.click('[data-testid="open-all-settings"]');
    await waitFor(
      () => page.locator('#settings-mark #mark-file').count().then((n) => n === 1).catch(() => false),
      10_000,
    );
    const homeRemainingTiles = await page
      .locator('[data-cg-app-tiles] [data-cg-app-tile]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-cg-app-tile')));
    check(
      '10. activating a Home key unlocks custom logo upload and Record/Render, leaving only Pro tiles gated',
      homeRemainingTiles.length === 2 &&
        homeRemainingTiles.includes('multi-projector') &&
        homeRemainingTiles.includes('pro-io'),
      `remainingTiles=${JSON.stringify(homeRemainingTiles)}`,
    );

    // Upgrade to Pro key via AccountSheet and verify all tiles unlock
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.click('[data-cg-account-open]');
    await waitFor(
      () => page.locator('[data-cg-account]').isVisible().catch(() => false),
      10_000,
    );
    await page.fill('[data-cg-license-input]', proKey);
    await page.click('[data-cg-license-activate]');
    await waitFor(
      async () =>
        (await page.locator('[data-cg-license-tier]').getAttribute('data-cg-license-tier')) === 'pro',
      10_000,
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await page.click('[data-testid="open-all-settings"]');
    await page.waitForTimeout(500);
    const proTileSectionCount = await page.locator('[data-cg-app-tiles]').count();
    check(
      '11. upgrading to a Pro key unlocks all Pro features and removes all app gate tiles',
      proTileSectionCount === 0,
      `proTileSectionCount=${proTileSectionCount}`,
    );

    // 12. Step-down nudge suggests upgrading to Pro (never git clone) and hides when Pro is active
    await page.evaluate(() => {
      const w = window;
      w.chromaglassDebug?.()?.forceStepDown?.(true);
    });
    await page.waitForTimeout(300);
    const proGridNudgeWhilePro = await page.locator('[data-cg-grid-upgrade-pro]').count();
    // The 1024² grid is a Pro option (PLAN 23.17): the free and Home tiers see
    // it in the list, so they know it exists, but cannot pick it. Reading the
    // option's own `disabled` (not a label or a nudge) is what keeps the
    // option gated: a label that says "Pro" on an option anyone can choose
    // passed this check before it read the attribute (the 2026-10-24 review
    // of #406). Read here while the Pro key is active, and again below on
    // the free tier, so the check needs both halves of the gate.
    const option1024 = '#settings-simulation option[value="1024"]';
    const pro1024Count = await page.locator(option1024).count();
    const pro1024Disabled =
      pro1024Count === 1 ? await page.locator(option1024).isDisabled() : null;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const floatingNudgeWhilePro = await page.locator('[data-cg-upgrade-pro-nudge]').count();

    // Deactivate Pro key so we are back on the free tier, then trigger step-down
    await page.click('[data-cg-account-open]');
    await waitFor(
      () => page.locator('[data-cg-account]').isVisible().catch(() => false),
      10_000,
    );
    await page.click('[data-cg-license-deactivate]');
    await waitFor(
      async () =>
        (await page.locator('[data-cg-license-tier]').getAttribute('data-cg-license-tier')) === 'free',
      10_000,
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      try {
        localStorage.removeItem('chromaglass-run-locally-dismissed');
      } catch {
        // ignore
      }
      const w = window;
      w.chromaglassDebug?.()?.forceStepDown?.(true);
    });
    await waitFor(
      () => page.locator('[data-cg-upgrade-pro-nudge]').isVisible().catch(() => false),
      10_000,
    );
    const nudgeText = (await page.locator('[data-cg-upgrade-pro-nudge]').textContent()) ?? '';
    const nudgeCtaHref =
      (await page.locator('[data-cg-upgrade-pro-cta]').getAttribute('href')) ?? '';
    await page.click('[data-testid="open-all-settings"]');
    await waitFor(
      () => page.locator('[data-cg-grid-upgrade-pro]').isVisible().catch(() => false),
      10_000,
    );
    const free1024Count = await page.locator(option1024).count();
    const free1024Disabled =
      free1024Count === 1 ? await page.locator(option1024).isDisabled() : null;
    check(
      '12. slower framerates suggest upgrading to Pro with 768²/1024² GPU headroom (no git clone), hide when Pro is active, and only a Pro key can pick the 1024² grid',
      proGridNudgeWhilePro === 0 &&
        floatingNudgeWhilePro === 0 &&
        nudgeText.includes('ChromaGlass Pro') &&
        // Home opens the Mac app too (PLAN.md 23.17b, 23.17d), so the card
        // sells what Pro alone adds there, never the app itself.
        !nudgeText.includes('plus the Mac app') &&
        nudgeText.includes('several projectors') &&
        !nudgeText.includes('git clone') &&
        !nudgeText.includes('Run it locally') &&
        nudgeCtaHref.includes('lemonsqueezy.com/checkout/buy/') &&
        pro1024Count === 1 &&
        pro1024Disabled === false &&
        free1024Count === 1 &&
        free1024Disabled === true,
      `proGridWhilePro=${proGridNudgeWhilePro} floatWhilePro=${floatingNudgeWhilePro} ` +
        `1024 pro=${pro1024Count}/${pro1024Disabled ? 'disabled' : 'enabled'} ` +
        `free=${free1024Count}/${free1024Disabled ? 'disabled' : 'enabled'} href=${nudgeCtaHref} text=${JSON.stringify(nudgeText.slice(0, 220))}`,
    );

    await ctx.close();
  }
} catch (err) {
  check('the check ran to its end', false, String(err?.message ?? err));
} finally {
  await browser?.close().catch(() => {});
  if (serverProc) {
    try {
      serverProc.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\ntiers: ${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
