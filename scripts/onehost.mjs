#!/usr/bin/env node
/**
 * Does every old address land on chromaglass.art, with what it had saved?
 *
 *   npm run onehost
 *
 * Asked by the owner, 2026-10-24: chromaglass.web.app should "always
 * immediately forward to chromaglass.art". Until then index.html moved only a
 * fresh visit, and kept anyone with a service worker or anything saved on the
 * old name, because localStorage belongs to the origin and a plain redirect
 * would have left their licence key, presets and set lists behind (PLAN.md
 * 23.16). The page now carries those keys across in the address's fragment
 * (index.html says how, and what is left behind on purpose).
 *
 * This serves the repository's own index.html, the file the build copies, at
 * all three names through Playwright's request routing, so the real
 * hostnames, origins and referrers are what the page sees. The app's module
 * is a stub that writes down, the moment it runs, the address and what
 * localStorage holds: that is the order that matters, since the app reads
 * its saved state as it starts, and a key that arrives after that is a key
 * the show never sees.
 *
 * It holds the feature, both ways round:
 *   - every way of arriving at an old name that should move does move, to the
 *     same path, query and fragment, in one step;
 *   - every way that must stay (Firebase's /__/ pages, offline, a cached show
 *     whose network has no internet, a cast window that talks to its opener,
 *     state too big for an address) stays, with its storage untouched;
 *   - what is carried is there before the module runs, what is left behind
 *     is not, chromaglass.art's own keys are never replaced, and a fragment
 *     that did not come from an old name writes nothing.
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import fs from 'node:fs';

const INDEX = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const OLD = 'https://chromaglass.web.app';
const FB = 'https://chromaglass.firebaseapp.com';
const ART = 'https://chromaglass.art';
const EVIL = 'https://elsewhere.example';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// What the app's module does first: write down where it is and what it can
// read. Stands in for /src/main.tsx (the built page's own module is the same
// tag with a hashed name; both are deferred until the parse ends).
const STUB = `window.__atStart = { href: location.href, store: Object.assign({}, localStorage) };`;
// A plain page with no script of ours, to seed an origin's storage.
const SEED = '<!doctype html><title>seed</title>';

const browser = await launchChromium(chromium);

/**
 * A fresh browser with the three names (and one stranger) served. `reach`
 * decides whether chromaglass.art answers the worker-controlled page's probe.
 */
async function freshContext({ reach = true, init = '' } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  let probes = 0;
  await ctx.route(/^https:\/\/(chromaglass\.(web\.app|firebaseapp\.com|art)|elsewhere\.example)\//, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/src/main.tsx') return route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB });
    if (url.pathname === '/seed') return route.fulfill({ status: 200, contentType: 'text/html', body: SEED });
    if (url.pathname === '/favicon.svg' && url.searchParams.has('reach')) {
      probes++;
      return reach ? route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg/>' }) : route.abort('internetdisconnected');
    }
    if (/\.(svg|png|webmanifest)$/.test(url.pathname)) return route.fulfill({ status: 200, body: '' });
    if (url.hostname === 'elsewhere.example') return route.fulfill({ status: 200, contentType: 'text/html', body: SEED });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: INDEX });
  });
  if (init) await ctx.addInitScript(init);
  return { ctx, probes: () => probes };
}

async function seed(ctx, origin, entries) {
  const page = await ctx.newPage();
  await page.goto(`${origin}/seed`);
  await page.evaluate((e) => { for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, entries);
  await page.close();
}

async function storeAt(ctx, origin) {
  const page = await ctx.newPage();
  await page.goto(`${origin}/seed`);
  const store = await page.evaluate(() => Object.assign({}, localStorage));
  await page.close();
  return store;
}

/** Open `url`, wait for the stub to run wherever the page ends up. */
async function arrive(ctx, url, { wait = 0 } = {}) {
  const page = await ctx.newPage();
  const hops = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) hops.push(f.url()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__atStart, null, { timeout: 15000 });
  if (wait) await page.waitForTimeout(wait);
  await page.waitForFunction(() => window.__atStart, null, { timeout: 15000 });
  await page.waitForLoadState('load');
  const at = await page.evaluate(() => ({ ...window.__atStart, now: location.href, referrer: document.referrer }));
  return { page, at, hops };
}

const SAVED = {
  'chromaglass:license-key': 'cg1.test-key-not-real',
  'chromaglass-user-presets': JSON.stringify([{ name: 'Mine — ünïcode ✓', hue: 0.4 }]),
  'chromaglass-setlist': JSON.stringify(['fillmore', 'cellbloom']),
  'chromaglass-midi-map': '{"cc1":"oil"}',
  'chromaglass-preset': 'fillmore',
  'chromaglass-signed-in': '1',
  'chromaglass-auth-email': 'someone@example.com',
  'chromaglass-pending-email': 'someone@example.com',
  'chromaglass-crashlog': '[]',
  'someone-else': 'not ours',
};
const CARRIED = ['chromaglass:license-key', 'chromaglass-user-presets', 'chromaglass-setlist', 'chromaglass-midi-map', 'chromaglass-preset'];
const LEFT = ['chromaglass-signed-in', 'chromaglass-auth-email', 'chromaglass-pending-email', 'chromaglass-crashlog', 'someone-else'];

try {
  // ── A first visit moves at once, address intact ─────────────────────────
  for (const from of [OLD, FB]) {
    const { ctx } = await freshContext();
    const { at, hops } = await arrive(ctx, `${from}/play?look=fillmore#deep`);
    check(`a first visit to ${new URL(from).hostname} lands on chromaglass.art, same path, query and fragment`,
      at.href === `${ART}/play?look=fillmore#deep`, at.href);
    check('  and the old name never ran the app', hops.filter((h) => h.startsWith(from)).length === 1 && !hops.some((h) => h.includes('cg-carry')), hops.join(' → '));
    await ctx.close();
  }

  // ── A returning visitor's state comes with them ─────────────────────────
  {
    const { ctx } = await freshContext();
    await seed(ctx, OLD, SAVED);
    await seed(ctx, ART, { 'chromaglass-preset': 'cellbloom' });
    const { at } = await arrive(ctx, `${OLD}/?look=fillmore#deep`);
    check('a returning visitor lands on chromaglass.art with the fragment taken out of the address',
      at.href === `${ART}/?look=fillmore#deep` && at.now === at.href, at.href);
    const missing = CARRIED.filter((k) => k !== 'chromaglass-preset' && at.store[k] !== SAVED[k]);
    check('  the licence, presets, set list and MIDI map are there before the app runs, byte for byte',
      at.href.startsWith(ART) && missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${CARRIED.length - 1} keys`);
    const leaked = LEFT.filter((k) => k in at.store);
    check('  the signed-in flag, account email, pending email link, crash log and others\' keys stay behind',
      at.href.startsWith(ART) && leaked.length === 0, leaked.length ? `carried ${leaked.join(', ')}` : '');
    check('  a key chromaglass.art already had is kept, not replaced', at.store['chromaglass-preset'] === 'cellbloom', at.store['chromaglass-preset']);
    const old = await storeAt(ctx, OLD);
    check('  and the old name still holds everything (nothing is deleted on the way)',
      Object.keys(SAVED).every((k) => old[k] === SAVED[k]));
    await ctx.close();
  }

  // ── A fragment from anywhere else writes nothing ────────────────────────
  {
    const { ctx } = await freshContext();
    await seed(ctx, OLD, SAVED);
    // A genuine payload, made by the old name's own forward, then replayed.
    const { ctx: victim } = await freshContext();
    const tab = await ctx.newPage();
    let payload = '';
    tab.on('framenavigated', (f) => { if (f === tab.mainFrame() && f.url().includes('#cg-carry=')) payload = f.url().slice(f.url().indexOf('#')); });
    await tab.goto(`${OLD}/`);
    await tab.waitForFunction(() => window.__atStart);
    check('the old name\'s forward does carry a fragment (so the replay below is a real one)', payload.startsWith('#cg-carry=v1.'), payload.slice(0, 24));
    await ctx.close();

    const typed = await arrive(victim, `${ART}/${payload}`);
    check('a carried fragment opened with no referrer writes nothing, and leaves the address',
      payload && Object.keys(typed.at.store).length === 0 && typed.at.href === `${ART}/`, `${Object.keys(typed.at.store).length} keys, ${typed.at.href}`);
    const link = await victim.newPage();
    await link.goto(`${EVIL}/`);
    await link.evaluate((u) => { const a = document.createElement('a'); a.href = u; document.body.append(a); a.click(); }, `${ART}/${payload}`);
    await link.waitForFunction(() => window.__atStart, null, { timeout: 15000 });
    const fromLink = await link.evaluate(() => ({ ...window.__atStart, referrer: document.referrer }));
    check('a carried fragment in a link from another site writes nothing',
      payload && fromLink.referrer.startsWith(EVIL) && Object.keys(fromLink.store).length === 0, `${fromLink.referrer}, ${Object.keys(fromLink.store).length} keys`);
    await victim.close();
  }

  // ── What must stay, stays ───────────────────────────────────────────────
  {
    const { ctx } = await freshContext();
    const { at } = await arrive(ctx, `${OLD}/__/auth/handler?apiKey=x`);
    check('Firebase\'s own /__/ pages stay on the old name', at.href.startsWith(`${OLD}/__/auth/handler`), at.href);
    await ctx.close();
  }
  {
    const { ctx } = await freshContext({ init: 'Object.defineProperty(Navigator.prototype, "onLine", { get: () => false });' });
    await seed(ctx, OLD, SAVED);
    const { at } = await arrive(ctx, `${OLD}/`);
    check('a browser that says it is offline stays on the old name, with its state', at.href === `${OLD}/` && at.store['chromaglass:license-key'] === SAVED['chromaglass:license-key'], at.href);
    await ctx.close();
  }
  const UNDER_WORKER = 'Object.defineProperty(ServiceWorkerContainer.prototype, "controller", { get: () => ({}) });';
  {
    const { ctx, probes } = await freshContext({ reach: false, init: UNDER_WORKER });
    const { at } = await arrive(ctx, `${OLD}/`, { wait: 1500 });
    check('a cached show whose network has no internet stays on the old name', at.href === `${OLD}/` && probes() === 1, `${at.href}, ${probes()} probe`);
    await ctx.close();
  }
  {
    const { ctx, probes } = await freshContext({ reach: true, init: UNDER_WORKER });
    await seed(ctx, OLD, SAVED);
    const page = await ctx.newPage();
    await page.goto(`${OLD}/?look=fillmore`);
    await page.waitForURL(`${ART}/?look=fillmore`, { timeout: 10000 }).catch(() => {});
    await page.waitForFunction(() => window.__atStart && location.hostname === 'chromaglass.art', null, { timeout: 10000 }).catch(() => {});
    const at = await page.evaluate(() => window.__atStart);
    check('a cached show with the internet up moves, once chromaglass.art answers, with its state',
      at.href === `${ART}/?look=fillmore` && probes() === 1 && at.store['chromaglass-setlist'] === SAVED['chromaglass-setlist'], `${at.href}, ${probes()} probe`);
    await ctx.close();
  }
  {
    const { ctx } = await freshContext({ init: 'try { window.opener = window; } catch {}' });
    const { at } = await arrive(ctx, `${OLD}/?cast=true`);
    check('a ?cast window opened by a show on the old name stays with its opener', at.href === `${OLD}/?cast=true`, at.href);
    await ctx.close();
  }
  for (const q of ['?cast=true', '?remote=1']) {
    const { ctx } = await freshContext();
    const { at } = await arrive(ctx, `${OLD}/${q}`);
    check(`a ${q} page opened on its own moves`, at.href === `${ART}/${q}`, at.href);
    await ctx.close();
  }
  {
    const { ctx } = await freshContext();
    // Random hex is close to incompressible, as the cap needs: 960,000
    // characters of it come to 1.28 MB of base64 in the address.
    const big = await (async () => { const p = await ctx.newPage(); await p.goto(`${OLD}/seed`);
      const n = await p.evaluate(() => { let s = ''; while (s.length < 960000) s += Math.random().toString(16).slice(2); localStorage.setItem('chromaglass-user-presets', s); return s.length; });
      await p.close(); return n; })();
    const { at } = await arrive(ctx, `${OLD}/`);
    check('more state than an address can hold stays, whole, on the old name',
      at.href === `${OLD}/` && at.store['chromaglass-user-presets']?.length === big, `${at.href}, ${big} characters`);
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} one-address checks hold`);
process.exit(failed ? 1 : 0);
