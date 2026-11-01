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
 *   - 34a-7a: OSC in, Art-Net out and Art-Net in reach the show on a Pro key
 *           only, refused on a Home key and with none (4b, 4c)
 *   - 23.19: making, changing and loading your own liquids is Pro; a liquid a
 *           free tier already has (made before the gate) stays on the shelf (13)
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { execSync, spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';
import { ARTNET_PORT, encodeArtDmx } from '../server/artnet.js';
import { signLicenseKey } from '../server/license-key.js';
import { createServerLicenseManager } from '../server/server-license.js';

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

  /*
    4b, 4c. OSC and Art-Net are Pro (PLAN.md 34a-7a). Until then the server
    never asked: a Home key drove the show over OSC and fed the rig. A second
    server, enforced the way the packed Mac app is, with OSC on a free port,
    Art-Net out aimed at a socket here and Art-Net in mapped to one setting,
    and a display that counts what reaches it. Each phase sends real packets
    and counts what arrives, not what a status string claims:
      none (enforced, so free) -> refused
      Pro                      -> all three arrive (the path works, so the
                                  refusals around it are the gate's doing)
      Home over the Pro key    -> refused again, at run time, no restart
      the key removed          -> refused (free), so removal is read too
      Pro, then Home, filed straight into the licence file, the way the
      Mac app's main process files them (desktop/main.js), not through
      this server's endpoints -> open, then refused, after the server's
      two-second renewal: the endpoints renew the tier on the spot, so
      without these two phases the renewal could be deleted and every
      line above stay green (the check's review, 2026-10-30)
    The Home phase follows Pro on purpose: a gate that never read the tier
    at all, or read it once at start, passes "free refused" and fails here.
  */
  {
    const freeUdp = () => new Promise((done) => {
      const u = createSocket('udp4');
      u.bind(0, '127.0.0.1', () => { const { port } = u.address(); u.close(() => done(port)); });
    });
    const oscMessage = (address, f) => {
      const pad = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
      const arg = Buffer.alloc(4);
      arg.writeFloatBE(f);
      return Buffer.concat([pad(Buffer.from(address)), pad(Buffer.from(',f')), arg]);
    };
    const LINK_PORT = PORT + 1;
    const LINK_ORIGIN = `http://127.0.0.1:${LINK_PORT}`;
    const oscPort = await freeUdp();
    const rig = createSocket({ type: 'udp4', reuseAddr: true });
    let rigPackets = 0;
    rig.on('message', () => { rigPackets += 1; });
    await new Promise((done) => rig.bind(0, '127.0.0.1', done));
    const linkDir = mkdtempSync(join(tmpdir(), 'cg-tiers-links-'));
    const linkProc = spawn(process.execPath, ['server/remote-server.js'], {
      env: {
        ...process.env,
        PORT: String(LINK_PORT),
        OSC_PORT: String(oscPort),
        OSC_BIND: '127.0.0.1',
        ARTNET_HOST: '127.0.0.1',
        ARTNET_PORT: String(rig.address().port),
        ARTNET_RATE: '30',
        ARTNET_IN: '1:colorSpeed',
        ARTNET_IN_UNIVERSE: '7',
        REMOTE_DIST: DIST,
        SHOW_KEY_FILE: join(linkDir, 'show-key'),
        CHROMAGLASS_LICENSE_FILE: join(linkDir, 'license.json'),
        CHROMAGLASS_ENFORCE_TIERS: '1',
        LICENSE_PUBLIC_KEY: JSON.stringify(testPublicJwk),
      },
      stdio: 'ignore',
    });
    const tx = createSocket('udp4');
    let ws = null;
    try {
      if (!(await waitForServer(`${LINK_ORIGIN}/remote-info.json`))) throw new Error('the links server did not start');
      const { displayKey } = await (await fetch(`${LINK_ORIGIN}/remote-info.json`)).json();
      ws = new WebSocket(`ws://127.0.0.1:${LINK_PORT}/remote-ws`);
      await new Promise((done, fail) => { ws.once('open', done); ws.once('error', fail); });
      const got = { osc: 0, artIn: 0 };
      ws.on('message', (d) => {
        let m; try { m = JSON.parse(String(d)); } catch { return; }
        if (m.type !== 'patch') return;
        if (m.settings?.audioImpact !== undefined) got.osc += 1;
        if (m.settings?.colorSpeed !== undefined) got.artIn += 1;
      });
      ws.send(JSON.stringify({ type: 'hello', role: 'display', key: displayKey }));
      let level = 0;
      // A second of a controller and a desk at work: an OSC fader and a DMX
      // channel that change every packet (the Art-Net in map passes only a
      // channel that moved), and the rig's socket counting what was sent.
      const phase = async (settle = 400) => {
        await new Promise((r) => setTimeout(r, settle)); // the server's renewal after a key is filed, with room
        got.osc = 0; got.artIn = 0; rigPackets = 0;
        for (let i = 0; i < 10; i++) {
          level = (level + 37) % 256;
          tx.send(oscMessage('/chromaglass/setting/audioImpact', level / 255), oscPort, '127.0.0.1');
          tx.send(encodeArtDmx(7, i + 1, new Uint8Array([level, 0, 0, 0])), ARTNET_PORT, '127.0.0.1');
          await new Promise((r) => setTimeout(r, 100));
        }
        await new Promise((r) => setTimeout(r, 200));
        const tier = (await (await fetch(`${LINK_ORIGIN}/license-info.json`)).json()).tier;
        return { tier, osc: got.osc, artOut: rigPackets, artIn: got.artIn };
      };
      const post = async (path, key) => {
        const r = await fetch(`${LINK_ORIGIN}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key, machineId: 'links-mac' }),
        });
        if (!r.ok) throw new Error(`${path} answered ${r.status}`);
      };
      // The Mac app's way: its own manager on the server's licence file. It
      // verifies the key against this process's public key, lent for the call.
      const fileDirect = async (key) => {
        const before = process.env.LICENSE_PUBLIC_KEY;
        process.env.LICENSE_PUBLIC_KEY = JSON.stringify(testPublicJwk);
        try {
          const r = await createServerLicenseManager({ filePath: join(linkDir, 'license.json') }).activate(key, 'links-mac');
          if (r.status !== 200) throw new Error(`filing straight to the licence file answered ${r.status}`);
        } finally {
          if (before === undefined) delete process.env.LICENSE_PUBLIC_KEY;
          else process.env.LICENSE_PUBLIC_KEY = before;
        }
      };
      await new Promise((r) => setTimeout(r, 2200)); // past the first renewal, so "free" is the tier read and not the unknown before it
      const none = await phase();
      await post('/license-activate', proKey);
      const pro = await phase();
      await post('/license-activate', homeKey);
      const home = await phase();
      await post('/license-deactivate', homeKey);
      const removed = await phase();
      await fileDirect(proKey);
      const proFiled = await phase(2600);
      await fileDirect(homeKey);
      const homeFiled = await phase(2600);
      const say = (p) => `${p.tier}: osc ${p.osc}, art-net out ${p.artOut}, art-net in ${p.artIn}`;
      const open = (p) => p.tier === 'pro' && p.osc >= 8 && p.artOut >= 15 && p.artIn >= 8;
      const refused = (p) => p.osc === 0 && p.artOut === 0 && p.artIn === 0;
      check(
        '4b. with a Pro key, OSC in, Art-Net out and Art-Net in all reach the show, whether the key came through the server or straight into its licence file',
        open(pro) && open(proFiled),
        `${say(pro)}; filed straight: ${say(proFiled)}`,
      );
      check(
        '4c. with a Home key, with no key in an enforced launch, and once the key is removed, OSC and Art-Net (out and in) are refused',
        none.tier === 'free' && refused(none) &&
          home.tier === 'home' && refused(home) &&
          removed.tier === 'free' && refused(removed) &&
          homeFiled.tier === 'home' && refused(homeFiled),
        `${say(none)}; ${say(home)}; removed ${say(removed)}; filed straight ${say(homeFiled)}`,
      );
    } finally {
      ws?.terminate();
      tx.close();
      rig.close();
      linkProc.kill('SIGTERM');
      rmSync(linkDir, { recursive: true, force: true });
    }
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
    // A liquid on the shelf from before (13): written once, so the shelf the
    // app saves back after that is what the later halves read.
    const LIQUID_NAME = 'Tiers Check Silk';
    await ctx.addInitScript((name) => {
      if (localStorage.getItem('chromaglass-custom-liquids')) return;
      localStorage.setItem('chromaglass-custom-liquids', JSON.stringify([
        { id: 'custom-tiers-check-silk', name, color: '#c8d0e0', behaviour: { weight: 0.4, polarity: -0.7 } },
      ]));
    }, LIQUID_NAME);
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

    // 13, free half. Making your own liquids is Pro (PLAN.md 23.19). The
    // Liquids section is in the panel's DOM whichever section is showing, so
    // it is read by counts, not visibility. The page opened with one liquid
    // already on the shelf (the init script above), the way a free user has
    // one made before the gate or under a lapsed key, so the check needs the
    // gate to close Design, Edit and Load and to leave that bottle on the
    // shelf: hiding the whole designer, or dropping a non-Pro user's bottles,
    // fails it as surely as leaving Design open.
    const liquidsAt = async () => ({
      design: await page.locator('[data-testid="liquid-design"]').count(),
      edit: await page.locator('[data-testid="liquid-edit"]').count(),
      upsell: await page.locator('[data-cg-pro-upsell="liquids"]').count(),
      buy: (await page.locator('[data-cg-pro-upsell="liquids"] [data-cg-pro-upsell-buy]').textContent().catch(() => null)) ?? '',
      href: (await page.locator('[data-cg-pro-upsell="liquids"] [data-cg-pro-upsell-buy]').getAttribute('href').catch(() => null)) ?? '',
      // The button and its hidden input, each: a Load button moved out of the
      // gate fails the line even with the input still inside it.
      load: await page.locator('[data-testid="liquid-load"], [data-testid="liquid-file"]').count(),
      kept: ((await page.locator('[data-testid="liquid-designer"]').textContent()) ?? '').includes(LIQUID_NAME),
    });
    const freeLiquids = await liquidsAt();

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
    const homeLiquids = await liquidsAt();
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
    const proLiquids = await liquidsAt();
    check(
      '13. making your own liquids is Pro: Free and Home see the Pro note (Get Pro, Upgrade to Pro) and no Design, Edit or Load, keep a liquid made before on the shelf, and a Pro key opens all three (23.19)',
      freeLiquids.design === 0 && freeLiquids.edit === 0 && freeLiquids.load === 0 && freeLiquids.upsell === 1 && freeLiquids.kept &&
        freeLiquids.buy.includes('Get Pro') && freeLiquids.href.includes('lemonsqueezy.com/checkout/buy/') &&
        homeLiquids.design === 0 && homeLiquids.edit === 0 && homeLiquids.load === 0 && homeLiquids.upsell === 1 && homeLiquids.kept &&
        homeLiquids.buy.includes('Upgrade to Pro') &&
        // Home pays the difference: its link is the upgrade checkout, not Pro's full price.
        homeLiquids.href.includes('lemonsqueezy.com/checkout/buy/') && homeLiquids.href !== freeLiquids.href &&
        proLiquids.design === 1 && proLiquids.edit === 1 && proLiquids.load === 2 && proLiquids.upsell === 0 && proLiquids.kept,
      `free=${JSON.stringify(freeLiquids)} home=${JSON.stringify(homeLiquids)} pro=${JSON.stringify(proLiquids)}`,
    );
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
        // sells what Pro alone adds there, never the app itself. It sold
        // "several projectors with edge blending" until PLAN.md 34a-7 found
        // the app drives one output. It names cloud sync now, which a Pro key
        // alone opens (CloudSyncCard). It named neither OSC nor Art-Net while
        // a Home key had both; 34a-7a gated them (4b, 4c above), and the card
        // still sells the grid's headroom it is shown for.
        !nudgeText.includes('plus the Mac app') &&
        !nudgeText.includes('several projectors') &&
        !nudgeText.includes('OSC') &&
        nudgeText.includes('cloud sync') &&
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
