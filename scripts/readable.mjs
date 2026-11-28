// Readable in a dark room: no words under 12 px, nothing to read or press
// under 60% effective opacity (PLAN 49i-guard).
//
//   npm run readable                 build, then walk every view
//   node scripts/readable.mjs        on the site already in dist/
//   node scripts/readable.mjs --list every offending element, not the first few
//
// What was reported. The usability review of 2026-11-26 (PLAN 49, H8-03 and
// H8-05) found 9 and 10 px labels and controls drawn at 25 to 40% opacity in
// Tools, MIDI, Songs, the Account sheet, Record and the phone remote. A
// performer glancing down at a desk in a dark room reads none of it: small
// grey type on black is the first thing a dark-adapted eye loses, and a
// control at a third of its opacity reads as one that is off. 49i (#972) set
// the floor, 12 px and 60%, and measured it with a throwaway walk over 19
// views that dropped from 1,453 elements under 12 px and 586 under 60% to 0
// and 1. Nothing held the floor after it: the next panel written with
// `text-[10px] opacity-40` would pass every check there is.
//
// What it measures. For every view below, every element that draws words of
// its own (a non-blank text node as a direct child) and every control (a
// button, a link, a field, anything with a control's role), once the page's
// animations have finished:
//   - words: the computed font size, at least FLOOR_PX;
//   - both: the effective opacity, at least FLOOR_OPACITY. Effective is what
//     the eye gets: the element's own `opacity` times every ancestor's, times
//     the alpha of its text colour for words. A 0.8 label in a 0.7 panel is
//     0.56, which is what 49i found compounding in the remote, and which a
//     check of each element's own opacity would pass.
// Not judged: what is not drawn (display none, visibility hidden, zero size,
// the screen reader's 1 px clip), what is aria-hidden, and what is still
// animating after the wait (a splash fading out is on its way to nothing;
// it is counted and printed, and a view where more than a few are still
// moving fails, so the exemption cannot swallow a view).
//
// The views are found, not listed by hand where they can be: every tab of
// the desk, every section of the settings sheet, every sheet the phone's dock
// opens, and the remote's pages. A panel added next month is walked without
// anyone remembering to add it here, and a floor on how many views and
// elements were judged fails a walk that quietly found nothing.
//
// The closed parts (PLAN 49i-guard-2). A view walked as it opens shows
// only what its panels show at rest: a set's ⋯ menu, the Liquid designer's
// draft, an "ⓘ What this does" note and a chip's × that appears on hover
// were held only by review. So inside each desk tab and each settings
// section the walk also opens what says it is closed: anything with
// aria-expanded="false" or aria-haspopup, and a button that is only a ⋯,
// … or ▾. Each is opened, walked and closed again, one at a time, and only
// what the click drew is judged: a button that says aria-expanded and draws
// nothing, or a ⋯ that opens nothing, is a view not found, as a tab that
// goes nowhere is, and a part's walk never re-counts the page around it
// (its views stay out of the floors below). A control drawn at opacity 0 (revealed on hover) is hovered by its
// row, one of each kind (its class list), and walked while it shows; the
// at-rest exemption stays for the rest. The set menu's list, the liquid
// draft (by the test ids they draw) and a hover reveal must each be walked,
// so the finder cannot quietly stop finding them.
//
// It proves itself before it judges: a page given a 10 px label, a 0.4
// button and a 0.8 label inside a 0.7 box must fail on exactly those three,
// and pass a 12 px label at full opacity beside them.

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { launchChromium, port } from './chromium.mjs';

const FLOOR_PX = 12;
const FLOOR_OPACITY = 0.6;
const LIST = process.argv.includes('--list');
const PORT = port(4401, 'READABLE_PORT');
const BASE = `http://localhost:${PORT}`;

let fails = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fails += 1;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const notes = [];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
await new Promise((resolve, reject) => {
  const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
  server.stdout.on('data', (d) => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
  server.stderr.on('data', (d) => { notes.push(String(d).trim()); });
  server.on('exit', (c) => { clearTimeout(bail); reject(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
});
const stopServer = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } };
process.on('exit', stopServer);

const browser = await launchChromium(chromium, { headless: true });

/**
 * The walk itself, run in the page: every judged element and what it reads
 * as. Written as one function so the self-test runs exactly the code the
 * views do.
 */
function measure({ floorPx, floorOpacity, onlyNew = false, only = null }) {
  const CONTROL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=slider], [role=tab], [role=checkbox], [role=radio], [role=menuitem], [role=option]';
  // A colour's alpha, whatever syntax the browser computes it to: Tailwind 4's
  // `text-white/40` is `oklab(… / 0.4)` or a `color-mix()`, which a parse of
  // rgba() read as 1 (the review of this check). Painted on one pixel and
  // read back, which is the browser's own answer.
  const px = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const alphas = new Map();
  const alpha = (c) => {
    if (!alphas.has(c)) {
      px.clearRect(0, 0, 1, 1); px.fillStyle = '#000'; px.fillStyle = c; px.fillRect(0, 0, 1, 1);
      alphas.set(c, px.getImageData(0, 0, 1, 1).data[3] / 255);
    }
    return alphas.get(c);
  };
  const running = new Set();
  for (const a of document.getAnimations()) {
    // Only an animation on its way somewhere: one that never ends (a pulse,
    // a spinner) is what the element looks like, and is judged.
    if (a.playState !== 'running' || !Number.isFinite(a.effect?.getComputedTiming?.().endTime)) continue;
    const t = a.effect?.target;
    if (t instanceof Element) running.add(t);
  }
  const moving = (el) => { for (let e = el; e; e = e.parentElement) if (running.has(e)) return true; return false; };
  const drawn = (el) => {
    if (el.closest('[aria-hidden="true"], canvas, svg')) return false;
    if (!el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) return false;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 4) return false;
    const cs = getComputedStyle(el);
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)') return false;
    return true;
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const label = (el) => {
    const id = el.closest('[data-testid]')?.dataset.testid ?? el.tagName.toLowerCase();
    return `${id} "${(el.innerText || el.getAttribute('aria-label') || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`;
  };
  const out = { judged: 0, moving: 0, revealed: 0, small: [], faint: [] };
  const seen = new Set();
  // A closed part is judged by what opening it drew (`onlyNew`: not drawn
  // when `markDrawn` ran before the click) or by the one control a hover
  // revealed (`only`), never by the whole page again: a re-walk would judge
  // nothing the part holds and swell every count (the review of 49i-guard-2).
  const fresh = (el) => (!onlyNew || !window.__readableDrawn?.has(el)) && (!only || el.closest(only));
  const consider = (el, words) => {
    if (seen.has(el) || !fresh(el) || !drawn(el)) return;
    seen.add(el);
    if (moving(el)) { out.moving += 1; return; }
    // Fully transparent is not drawn: a control revealed on hover or focus
    // (a cue's ×, opacity-0 group-hover:opacity-100) is not there to read
    // until it is, and what it is then is the hover's business. Counted.
    if (opacityOf(el) < 0.02) { out.revealed += 1; return; }
    out.judged += 1;
    const cs = getComputedStyle(el);
    const op = opacityOf(el) * (words ? alpha(cs.color) : 1);
    if (words && parseFloat(cs.fontSize) < floorPx - 0.01) out.small.push(`${label(el)} ${parseFloat(cs.fontSize)} px`);
    if (op < floorOpacity - 0.005) out.faint.push(`${label(el)} ${op.toFixed(2)}`);
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim() || !n.parentElement || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(n.parentElement.tagName)) continue;
    consider(n.parentElement, true);
  }
  for (const el of document.querySelectorAll(CONTROL)) consider(el, false);
  return out;
}

/** Wait for the page's animations to finish (at most `ms`), then walk it. */
async function walk(page, ms = 4000, opts = {}) {
  await page.evaluate(async (ms) => {
    const end = performance.now() + ms;
    while (performance.now() < end && document.getAnimations().some(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming?.().endTime))) {
      await new Promise(r => setTimeout(r, 100));
    }
  }, ms);
  return page.evaluate(measure, { floorPx: FLOOR_PX, floorOpacity: FLOOR_OPACITY, ...opts });
}

const results = [];
/** The test ids drawn now: a view counts as opened only when it draws one it did not before. */
const drawnIds = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid]')].filter(e => e.getClientRects().length).map(e => e.dataset.testid));
const opensNew = async (page, before) => { const b = new Set(before); return (await drawnIds(page)).some(i => !b.has(i)); };
const record = (surface, view, m) => results.push({ surface, view, ...m });

/*
  The closed parts of what is drawn inside `scope` (a CSS selector): openers
  (aria-expanded false, aria-haspopup, or a button that is only a ⋯ … ⋮ ▾)
  and controls revealed on hover (drawn, at opacity 0; one of each class
  list, since the same chip's × drawn forty times is one kind). Each is
  tagged with a data attribute the app never sets, so the walk can find it
  again while it lives. An opener's `key` is its nearest test id, its name
  and its place among openers sharing both (the Setup tab's five "What this
  does" notes are five), so the set menu two tabs draw is walked once and
  five notes are five.
*/
async function closedParts(page, scope) {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope);
    // Gone is loud: an Escape that closed the whole sheet would otherwise
    // leave nothing to find, and the rest of its parts unwalked in silence.
    if (!root) throw new Error(`closed parts: ${scope} is not drawn`);
    const shown = (e) => e.getClientRects().length && e.checkVisibility({ visibilityProperty: true });
    const op = (e) => { let o = 1; for (; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
    const name = (e) => (e.dataset.testid || e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    let n = 0;
    const tag = (e) => { e.dataset.readableProbe ??= `${Date.now() % 1e6}-${n++}`; return e.dataset.readableProbe; };
    const count = new Map();
    const openers = [...root.querySelectorAll('[aria-expanded="false"], [aria-haspopup]:not([aria-expanded="true"]), button')]
      .filter(e => shown(e) && op(e) >= 0.02 && (e.matches('[aria-expanded="false"], [aria-haspopup]') || /^[⋯…⋮▾]$/.test(e.innerText.trim())))
      .map(e => {
        const base = `${e.closest('[data-testid]')?.dataset.testid ?? ''}|${name(e)}`;
        const k = count.get(base) ?? 0; count.set(base, k + 1);
        return { probe: tag(e), key: `${base}#${k}`, name: name(e) };
      });
    const hovers = [];
    for (const e of root.querySelectorAll('button, a[href], [role=button]')) {
      if (!shown(e) || op(e) >= 0.02) continue;
      hovers.push({ probe: tag(e), row: e.parentElement ? tag(e.parentElement) : null, kind: e.className, name: name(e).replace(/-[a-z0-9-]+$/, '') });
    }
    return { openers, hovers };
  }, scope);
}

/*
  Before a click, every element drawn now is remembered, so the walk after it
  judges only what the click drew.
*/
const markDrawn = (page) => page.evaluate(() => {
  window.__readableDrawn = new WeakSet([...document.querySelectorAll('*')].filter(e => e.getClientRects().length && e.checkVisibility({ visibilityProperty: true })));
});

/*
  Open each closed part in `scope`, walk what it drew, close it, one at a
  time and found afresh before each: closing one can redraw the panel (or
  `reset` start the page again), and a tag found before that would point at
  nothing. An opener counts as opened only when the walk judges something it
  drew: a button that turns aria-expanded and draws nothing, or a ⋯ that
  opens nothing, is a view not found. A hover counts when the control it
  reveals is judged (no longer at opacity 0). The test ids a part drew are
  kept, so the verdict can ask for the set menu's list and the liquid draft
  by name. `reset` puts the page back when a part will not close (a menu left
  open covers the next opener) or its closing took the scope with it.
*/
async function walkClosed(page, scope, surface, prefix, seen, reset) {
  const probe = (t) => page.locator(`[data-readable-probe="${t}"]`).first();
  for (;;) {
    const o = (await closedParts(page, scope)).openers.find(x => !seen.has(x.key));
    if (!o) break;
    seen.add(o.key);
    const el = probe(o.probe);
    const before = await drawnIds(page);
    await markDrawn(page);
    await el.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(450);
    const expanded = await el.getAttribute('aria-expanded', { timeout: 1_000 }).catch(() => null);
    const m = await walk(page, 2500, { onlyNew: true });
    const drew = (await drawnIds(page)).filter(i => !before.includes(i));
    record(surface, `${prefix} › ${o.name}`, m.judged > 0 ? { ...m, closed: true, drew } : undefined);
    // Closed the way it opened, else by Escape; if anything it drew is
    // still up, or the scope went with it, the page starts again.
    if (expanded === 'true') await el.click({ timeout: 3_000 }).catch(() => {});
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const gone = !(await page.locator(scope).count());
    if (reset && (gone || await opensNew(page, before))) await reset();
  }
  const kinds = new Set();
  for (const h of (await closedParts(page, scope)).hovers) {
    if (kinds.has(h.kind)) continue;
    kinds.add(h.kind);
    const el = probe(h.probe);
    await (h.row ? probe(h.row) : el).hover({ timeout: 5_000, force: true }).catch(() => {});
    await page.waitForTimeout(350);
    const m = await walk(page, 2500, { only: `[data-readable-probe="${h.probe}"]` });
    record(surface, `${prefix} › hover ${h.name}`, m.judged > 0 ? { ...m, closed: true, drew: [] } : undefined);
    await page.mouse.move(0, 0);
  }
}

async function openPage({ width, height, touch = false, url, ready, init }) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto(url, { waitUntil: 'load' });
  if (ready) await page.getByTestId(ready).first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}
const SHOW = `${BASE}/?look=classic&dpr=0.35&play=0`;

try {
  // ── The walk proves itself ───────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 600, height: 400 } });
    const page = await ctx.newPage();
    await page.setContent(`<body style="background:#000;color:#fff;font:16px sans-serif">
      <span data-testid="good">Twelve and whole</span>
      <span data-testid="small" style="font-size:10px">Too small</span>
      <button data-testid="faint" style="opacity:.4;font-size:14px">Faint</button>
      <div style="opacity:.7"><span data-testid="compound" style="opacity:.8">Compounded</span></div>
      <span data-testid="grey" style="color:rgba(255,255,255,.9);font-size:12px">Grey enough</span>
      <span data-testid="oklab" style="color:oklab(0.9 0 0 / 0.4)">Faint in oklab</span>
      <span data-testid="mix" style="color:color-mix(in oklab, white 40%, transparent)">Faint in a mix</span>
      <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">screen reader only, 9 px</span>
      <span aria-hidden="true" style="font-size:8px">decoration</span>
    </body>`);
    const m = await page.evaluate(measure, { floorPx: FLOOR_PX, floorOpacity: FLOOR_OPACITY });
    const ids = (l) => l.map(s => s.split(' ')[0]).sort().join(',');
    check('a made-up page fails its 10 px label, its 0.4 button, a 0.8 label in a 0.7 box and two 0.4 colours (oklab, color-mix), and nothing else',
      ids(m.small) === 'small' && ids(m.faint) === 'compound,faint,mix,oklab' && m.judged === 7,
      `small: ${ids(m.small) || 'none'}; faint: ${ids(m.faint) || 'none'}; ${m.judged} judged`);
    await ctx.close();
  }
  {
    // And it opens what is closed: a made-up panel whose words fail only once
    // opened (a disclosure's 10 px note, a ⋯ menu's 0.4 item, a × at opacity
    // 0 that hover brings to 0.5) must give three views, each failing on its
    // part; a disclosure whose note is fine must pass; and a button that
    // only says it opened (aria-expanded, nothing drawn) and a … that opens
    // nothing must each be a view not found.
    const ctx = await browser.newContext({ viewport: { width: 600, height: 400 } });
    const page = await ctx.newPage();
    await page.setContent(`<style>.row .x{opacity:0}.row:hover .x{opacity:.5}</style>
      <body style="background:#000;color:#fff;font:16px sans-serif"><div data-testid="panel">
      <button aria-expanded="false" data-testid="note" onclick="this.setAttribute('aria-expanded', this.getAttribute('aria-expanded') === 'false');n.hidden=!n.hidden">Note</button>
      <p id="n" hidden style="font-size:10px">Small note</p>
      <button aria-expanded="false" data-testid="fine" onclick="this.setAttribute('aria-expanded', this.getAttribute('aria-expanded') === 'false');f.hidden=!f.hidden">Fine</button>
      <p id="f" hidden>Fine note</p>
      <button aria-expanded="false" data-testid="liar" onclick="this.setAttribute('aria-expanded', this.getAttribute('aria-expanded') === 'false')">Liar</button>
      <button data-testid="dots" onclick="m.hidden=false">⋯</button>
      <button data-testid="empty">…</button>
      <div id="m" hidden data-testid="menu" onkeydown=""><button style="opacity:.4">Faint item</button></div>
      <div class="row"><span>A chip</span><button class="x" data-testid="x">×</button></div>
      </div><script>addEventListener('keydown', e => { if (e.key === 'Escape') m.hidden = true; });</script></body>`);
    const from = results.length;
    await walkClosed(page, '[data-testid="panel"]', 'proof', 'made-up', new Set(), null);
    const got = results.splice(from);
    const say = (r) => `${r.view.replace('made-up › ', '')}:${r.judged === undefined ? 'unopened' : (r.small.length ? 'small' : '') + (r.faint.length ? 'faint' : '') || 'clean'}`;
    const seen = got.map(say).join(',');
    check('a made-up panel\'s closed parts are opened and fail on what they hide: a 10 px note, a 0.4 menu item, a × hover shows at 0.5; a fine note passes; a liar and an empty … open nothing',
      seen === 'note:small,fine:clean,liar:unopened,dots:faint,empty:unopened,hover x:faint', seen);
    await ctx.close();
  }

  // ── The desk, 1440 x 900 ─────────────────────────────────────────────
  {
    const { ctx, page } = await openPage({ width: 1440, height: 900, url: SHOW, ready: 'perform-desk' });
    const tabs = await page.locator('[data-testid="desk-tabs"] button:not([data-testid="tabs-edit"])').all();
    const names = [];
    for (const t of tabs) names.push((await t.innerText()).replace(/\s+/g, ' ').trim());
    const deskIds = new Set();
    const closedSeen = new Set();
    for (let i = 0; i < tabs.length; i++) {
      await tabs[i].click();
      await page.waitForTimeout(600);
      // Each tab is its own desk (`perform-desk`, `sequence-desk`, …): one
      // seen before means the click went nowhere.
      const desk = await page.locator('[data-desk="v2"]').first().getAttribute('data-testid').catch(() => null);
      const fresh = desk && !deskIds.has(desk);
      if (desk) deskIds.add(desk);
      record('desk', `tab ${names[i] || i + 1}`, fresh ? await walk(page) : undefined);
      if (fresh) {
        const reset = async () => {
          await page.goto(SHOW, { waitUntil: 'load' });
          await page.getByTestId('perform-desk').first().waitFor({ state: 'visible', timeout: 60_000 });
          await page.waitForTimeout(900);
          await page.locator('[data-testid="desk-tabs"] button:not([data-testid="tabs-edit"])').nth(i).click();
          await page.waitForTimeout(600);
        };
        await walkClosed(page, '[data-desk="v2"]', 'desk', `tab ${names[i] || i + 1}`, closedSeen, reset);
      }
    }
    if (tabs.length) { await tabs[0].click(); await page.waitForTimeout(400); }
    // The sheets and menus the desk's header opens.
    for (const [opener, view] of [['looks-grid-open', 'Looks grid'], ['doc-menu-button', 'File menu'], ['palette-button', 'command palette'],
      ['shortcuts-button', 'shortcuts'], ['record-options-button', 'Record options'], ['open-mixer', 'Mixer'], ['panel-browser-button', 'panel browser']]) {
      if (!(await page.getByTestId(opener).count())) { record('desk', `${view} (no ${opener})`, null); continue; }
      const before = await drawnIds(page);
      await page.getByTestId(opener).first().click();
      await page.waitForTimeout(600);
      record('desk', view, await opensNew(page, before) ? await walk(page) : undefined);
      // From a fresh page each time: a sheet that Escape does not close
      // leaves its backdrop over the next opener.
      await page.goto(SHOW, { waitUntil: 'load' });
      await page.getByTestId('perform-desk').first().waitFor({ state: 'visible', timeout: 60_000 });
      await page.waitForTimeout(900);
    }
    // Every section of the settings sheet, by its rail.
    await page.getByTestId('open-all-settings').first().click();
    await page.waitForTimeout(800);
    const rail = await page.locator('[data-testid^="settings-nav-"]').evaluateAll(els => els.map(e => e.dataset.testid));
    // A section's pane is told by its words, not its test ids: two sections
    // can draw the same kinds of control. Words unchanged after a click mean
    // the click went nowhere and the last pane would be walked again.
    const paneText = () => page.evaluate(() => document.body.innerText);
    let prev = await paneText();
    for (const [n, id] of rail.entries()) {
      await page.getByTestId(id).first().click().catch(() => {});
      await page.waitForTimeout(350);
      const now = await paneText();
      const ok = n === 0 || now !== prev;
      prev = now;
      record('desk', `Settings › ${id.replace('settings-nav-', '')}`, ok ? await walk(page, 2500) : undefined);
      // A part left open (the liquid draft: a second press of Design starts
      // a new draft rather than closing it) or an Escape that closed the
      // sheet: the page starts again, the sheet open at this section.
      const reopen = async () => {
        await page.goto(SHOW, { waitUntil: 'load' });
        await page.getByTestId('perform-desk').first().waitFor({ state: 'visible', timeout: 60_000 });
        await page.waitForTimeout(900);
        await page.getByTestId('open-all-settings').first().click();
        await page.waitForTimeout(800);
        await page.getByTestId(id).first().click().catch(() => {});
        await page.waitForTimeout(350);
      };
      if (ok) await walkClosed(page, '[data-testid="settings-panel"]', 'desk', `Settings › ${id.replace('settings-nav-', '')}`, new Set(), reopen);
      prev = await paneText();
    }
    await ctx.close();
  }

  // ── The phone, 390 x 844 ─────────────────────────────────────────────
  {
    const PHONE = { width: 390, height: 844, touch: true, url: SHOW, ready: 'phone-stage' };
    // A fresh phone for each view, in a new context: some of the More
    // sheet's tiles leave the phone for good (Full layout stores the
    // choice), and a reload would carry that into every view after it.
    let { ctx, page } = await openPage(PHONE);
    // Headless has no WebGPU, so the stage carries its "needs WebGPU" card
    // (49j): a view a performer reads too, so it is judged with the stage.
    record('phone', 'stage', await walk(page));
    const fresh = async () => {
      await ctx.close();
      ({ ctx, page } = await openPage(PHONE));
    };
    /** Tap `id` and wait for a sheet: true when one other than `besides` is up. */
    const openSheet = async (id, besides = null) => {
      await page.getByTestId(id).first().tap({ timeout: 5_000 }).catch(() => {});
      for (let i = 0; i < 20; i++) {
        const up = await page.locator('[data-testid^="phone-sheet-"]').evaluateAll(els => els.filter(e => e.getClientRects().length).map(e => e.dataset.testid));
        if (up.some(u => u !== besides && u !== 'phone-sheet-back')) return true;
        await page.waitForTimeout(150);
      }
      return false;
    };
    // The dock's sheets (the More sheet's tiles below), each from a fresh
    // stage. A tap that opens no sheet is recorded as not found, so the views
    // floor counts only sheets that were really walked.
    const docks = (await page.locator('[data-testid^="phone-open-"]').evaluateAll(els => [...new Set(els.map(e => e.dataset.testid))]));
    for (const id of docks) {
      const ok = await openSheet(id);
      record('phone', `${id.replace('phone-open-', '')} sheet`, ok ? await walk(page) : undefined);
      await fresh();
    }
    if (await openSheet('phone-open-more')) {
      const tiles = await page.locator('[data-testid="phone-sheet-more"] button[data-testid^="phone-"]').evaluateAll(els => [...new Set(els.map(e => e.dataset.testid))]);
      for (const id of tiles) {
        await fresh();
        if (!(await openSheet('phone-open-more'))) break;
        const ok = await openSheet(id, 'phone-sheet-more');
        if (ok) record('phone', `More › ${id.replace(/^phone-(open-)?/, '')}`, await walk(page));
      }
    }
    await ctx.close();
  }

  // ── The remote, 390 x 844 ────────────────────────────────────────────
  {
    const { ctx, page } = await openPage({ width: 390, height: 844, touch: true, url: `${BASE}/?remote`, ready: 'remote-nav' });
    record('remote', 'Draw', await walk(page));
    const pages = await page.locator('[data-testid^="remote-nav-"], [data-testid^="remote-to-"]').evaluateAll(els => [...new Set(els.map(e => e.dataset.testid))]);
    for (const id of pages.filter(i => i !== 'remote-nav-draw')) {
      const before = await drawnIds(page);
      await page.getByTestId(id).first().tap({ force: true }).catch(() => {});
      await page.waitForTimeout(700);
      record('remote', id.replace(/^remote-(nav|to)-/, ''), await opensNew(page, before) ? await walk(page) : undefined);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

// ── The verdict ──────────────────────────────────────────────────────────
const walked = results.filter(r => r.judged !== undefined);
// The floors count views as they open; a closed part's walk is its own count.
const opened = walked.filter(r => !r.closed);
const missing = results.filter(r => r.judged === undefined).map(r => `${r.surface} ${r.view}`);
const per = (s) => opened.filter(r => r.surface === s).length;
const judged = opened.reduce((n, r) => n + r.judged, 0);
check('every view found opened, and views enough to mean it (desk 30, phone 12, remote 2)',
  missing.length === 0 && per('desk') >= 30 && per('phone') >= 12 && per('remote') >= 2 && judged >= 15000,
  `desk ${per('desk')}, phone ${per('phone')}, remote ${per('remote')} views; ${judged} elements judged, ${opened.reduce((n, r) => n + r.revealed, 0)} hidden until hovered${missing.length ? `; not found: ${missing.join(', ')}` : ''}`);
// The three closed parts 49i-guard-2 names, each walked by name: a finder
// that stopped finding them would otherwise pass on what is left.
const closedViews = walked.filter(r => r.closed);
const MUSTS = [['the set ⋯ menu', r => r.drew.includes('set-menu-list')], ['the Liquid designer draft', r => r.drew.includes('liquid-draft')], ['a control revealed on hover', r => / › hover /.test(r.view)]];
const lacking = MUSTS.filter(([, ok]) => !closedViews.some(ok)).map(([n]) => n);
check('the closed parts are opened and walked: the set menu, the liquid draft, a hover reveal, and closed parts enough to mean it (20)',
  lacking.length === 0 && closedViews.length >= 20,
  `${closedViews.length} closed parts walked${lacking.length ? `; never walked: ${lacking.join(', ')}` : ''}`);
const stillMoving = walked.filter(r => r.moving > 5);
check('the animation exemption excuses no more than a few elements in any view', stillMoving.length === 0,
  stillMoving.map(r => `${r.surface} ${r.view}: ${r.moving} still moving`).join('; ') || `${walked.reduce((n, r) => n + r.moving, 0)} in all`);
for (const [kind, what] of [['small', `words under ${FLOOR_PX} px`], ['faint', `words or controls under ${FLOOR_OPACITY * 100}% effective opacity`]]) {
  const bad = walked.filter(r => r[kind].length);
  const total = bad.reduce((n, r) => n + r[kind].length, 0);
  check(`no ${what} on the desk, the phone or the remote`, total === 0,
    total ? `${total} in ${bad.length} views: ${bad.map(r => `${r.surface} ${r.view}: ${(LIST ? r[kind] : r[kind].slice(0, 3)).join('; ')}${!LIST && r[kind].length > 3 ? ` (+${r[kind].length - 3})` : ''}`).join(' | ')}` : `${walked.length} views`);
}
console.log(`\n${fails ? `${fails} failed` : 'all passed'}`);
process.exit(fails ? 1 : 0);
