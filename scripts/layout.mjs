#!/usr/bin/env node
/**
 * The layout, without a GPU: does every control fit, read, and sit where you
 * can reach it, at every width the show is played at?
 *
 *   npm run layout            # builds, then about a minute
 *   npm run layout -- --head  # watch it
 *
 * These are the show night's layout checks (`qa.mjs`), asked on their own.
 * In September ten of thirty-one red runs were one of them — a chip 20px
 * tall, the mode switch sliding 18px, a column painted over Freeze at 1280 —
 * and each was found fifteen minutes into the macOS job, because that is the
 * only place `qa.mjs` can run. Layout is CSS: a software renderer lays out the
 * same page a GPU does. So this runs on the ubuntu job, in a cloud session,
 * and before a push, and `qa.mjs` still asks the same questions on the Mac.
 *
 * The measurements are shared with `qa.mjs` (`layoutProbe.mjs`), so the two
 * cannot drift apart. What is not here is anything that reads the plate.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';
import { clickAt, modeSwitchX, legibility, coveredControls, statusDots, COVER_WIDTHS } from './layoutProbe.mjs';

const PORT = Number(process.env.LAYOUT_PORT ?? 4179);
// The plate's resolution does not change a layout, and every millisecond the
// software renderer spends on it is a millisecond the page is not answering.
const URL = `http://localhost:${PORT}/?debug&look=classic&dpr=0.35`;
const HEADED = process.argv.includes('--head');
/*
  With no GPU the plate's frame holds the "needs WebGPU" screen instead of a
  plate, and on a phone its Try again button sits under the bottle rail. That
  screen is what a machine without WebGPU gets, not the show being measured,
  so its own controls are left out of the cover check; everything around it
  is the layout a performer sees. (Given software WebGPU instead, with
  PW_WEBGPU=1, the plate runs so slowly that the black box reports a stall and
  its chip covers the desk, which is a truer account of that machine than of
  the layout.)
*/
const NO_GPU_SCREEN = '[data-testid="needs-webgpu"]';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const notes = [];
async function serve() {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview',
    '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  await new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
    proc.stdout.on('data', d => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
    proc.stderr.on('data', d => { notes.push(String(d).trim()); });
    proc.on('exit', c => {
      clearTimeout(bail);
      reject(new Error(`preview exited ${c}${notes.length ? `: ${notes.join(' ').slice(0, 200)}` : ''}`));
    });
  });
  return proc;
}
const stopServer = (proc) => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); } };

const server = await serve();
const browser = await launchChromium(chromium, { headless: !HEADED });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.setDefaultTimeout(60_000);
const settle = (ms = 900) => page.waitForTimeout(ms);
const clickOn = (target) => clickAt(page, target);
const appears = async (testId) => {
  for (let i = 0; i < 20; i++) {
    if ((await page.getByTestId(testId).count()) > 0) return true;
    await settle(300);
  }
  return false;
};
/** Which layout the desk is drawing: a mode switch that did nothing re-measures the last one. */
const LAYOUT_OF = { design: 'build', perform: 'gig', loadin: 'loadin' };
const layoutIs = (mode) => page.evaluate((want) => document.querySelector('[data-desk]')?.getAttribute('data-layout') === want, LAYOUT_OF[mode]);
/**
 * The desk's rules (11px, 60% opacity, 24px), asked only of what is inside
 * `sel`: a measure of the whole page passes a panel that drew nothing.
 */
const measureIn = (sel) => page.evaluate((sel) => {
  const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 1; const p = m[1].split(','); return p[3] === undefined ? 1 : parseFloat(p[3]); };
  const bad = [];
  const perPanel = {};
  let n = 0;
  for (const el of document.querySelectorAll(`${sel} :is(button, input, select, a)`)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || el.offsetParent === null) continue;
    n++;
    const panel = el.closest('[data-panel]')?.getAttribute('data-panel') ?? '?';
    // Its own controls, not the frame's (grip, fold, float, close).
    if (!el.closest('[data-panel-head]')) perPanel[panel] = (perPanel[panel] ?? 0) + 1;
    const cs = getComputedStyle(el);
    const text = (el.textContent || '').trim();
    const name = `${panel}: ${(text || el.getAttribute('aria-label') || el.tagName).slice(0, 24)}`;
    if (text && parseFloat(cs.fontSize) < 11) bad.push(`${name} ${cs.fontSize}`);
    if (text && alpha(cs.color) < 0.6) bad.push(`${name} α${alpha(cs.color)}`);
    if (Math.min(r.width, r.height) < 24) bad.push(`${name} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  return { n, bad, perPanel };
}, sel);
/*
  How many controls a measurement actually looked at. Every check here asks
  "is anything wrong with the controls", and a page that rendered none of
  them has nothing wrong with it — so each one also says how many it saw,
  and fails on a page too empty to judge.
*/
const visibleControls = () => page.evaluate(() => [...document.querySelectorAll('button, input, select')]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length);
const seenIds = {};
const noteIds = async () => {
  const now = await page.evaluate(() => {
    const seen = {};
    for (const el of document.querySelectorAll('[data-testid]')) {
      const id = el.getAttribute('data-testid');
      seen[id] = (seen[id] ?? 0) + 1;
    }
    return seen;
  });
  for (const [id, n] of Object.entries(now)) if (n > 1) seenIds[id] = Math.max(seenIds[id] ?? 0, n);
};

/*
  The Alpha label beside the name (the owner, 2026-10-06). Asked where, not
  whether: exactly one on screen, reading "Alpha", at 11px or more, its top
  within the first 80px (the top bar, not somewhere down the panel or on the
  plate), the thing actually drawn at its middle, and over no control. A label
  rendered off-screen, twice, shrunk, or laid over the mode switch is red.
*/
const alphaBadge = () => page.evaluate(() => {
  const shown = [...document.querySelectorAll('[data-alpha-badge]')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (shown.length !== 1) return { ok: false, why: `${shown.length} on screen` };
  const el = shown[0];
  const r = el.getBoundingClientRect();
  const px = parseFloat(getComputedStyle(el).fontSize);
  const atMiddle = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const over = [...document.querySelectorAll('button, input, select')].filter((b) => {
    const q = b.getBoundingClientRect();
    return q.width > 0 && q.height > 0 && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top;
  }).map((b) => b.getAttribute('data-testid') || b.textContent.trim().slice(0, 20));
  const why = [
    el.textContent.trim() === 'Alpha' ? '' : `reads "${el.textContent.trim()}"`,
    px >= 11 ? '' : `${px}px`,
    r.top >= 0 && r.top < 80 ? '' : `top at ${Math.round(r.top)}px`,
    atMiddle && el.contains(atMiddle) ? '' : 'covered',
    over.length ? `over ${over.join(', ')}` : '',
  ].filter(Boolean);
  return { ok: why.length === 0, why: why.join('; ') || `${px}px at ${Math.round(r.left)},${Math.round(r.top)}` };
});

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  const desk = await appears('design-desk') || await appears('perform-desk');
  check('a desk lays out at laptop width', desk);
  if (!desk) throw new Error('no desk to measure');

  // ── The mode switch stays where it is ──────────────────────────
  await clickOn('mode-segmented-perform');
  await settle(1200);
  const inPerform = await modeSwitchX(page);
  await clickOn('mode-segmented-design');
  await settle(1200);
  const inDesign = await modeSwitchX(page);
  await clickOn('mode-segmented-perform');
  await settle(1200);
  const back = await modeSwitchX(page);
  const drift = Math.max(Math.abs(inDesign - inPerform), Math.abs(back - inPerform));
  check('the mode switch does not move when you use it',
    inPerform !== null && inDesign !== null && back !== null && drift <= 1,
    `perform ${inPerform}, design ${inDesign}, back ${back} — ${drift}px`);

  // ── Readable in a dark room, on both desks and inside the panels ─
  await page.setViewportSize({ width: 1600, height: 900 });
  // Load-in is the third layout of the one desk (Desk v2): the controller,
  // the sound, the wall and its mapping as panels, held to the same rules.
  for (const mode of ['perform', 'design', 'loadin']) {
    await clickOn(`mode-segmented-${mode}`);
    await settle(1000);
    await noteIds();
    check(`the mode switch puts up ${mode}'s layout`, await layoutIs(mode));
    const n = await visibleControls();
    const l = await legibility(page);
    check(`on ${mode}, nothing you can click has text under 11px`, n > 20 && l.tiny.length === 0,
      l.tiny.length ? l.tiny.slice(0, 6).join(', ') : `${n} controls`);
    check(`on ${mode}, none of it is under 60% opacity`, n > 20 && l.faint.length === 0, l.faint.slice(0, 6).join(', '));
    check(`on ${mode}, nothing is smaller than 24px`, n > 20 && l.small.length === 0, l.small.slice(0, 6).join(', '));
    const alpha = await alphaBadge();
    check(`on ${mode}, the Alpha label sits by the name`, alpha.ok, alpha.why);
  }

  // ── Desk v2: one desk, its panels moved about ──────────────────
  /*
    The two desks became one desk in three layouts, and its panels can be
    opened from the browser, floated over the plate, folded and closed. Each
    of those is asked of the page, not of the layout model (that is
    `npm run desklayout`): the thing a hand does, and what is then on screen.
  */
  {
    const shown = (id) => page.evaluate((t) => [...document.querySelectorAll(`[data-testid="${t}"]`)]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length, id);
    const boxOf = (id) => page.evaluate((t) => {
      const el = document.querySelector(`[data-testid="${t}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) };
    }, id);
    // The plate bar is the same bar in every layout: Send to wall was missing
    // from one desk once (panel.mjs, "the same actions on both"), so each is
    // looked for, once and visible, in all three.
    const ACTIONS = ['send-to-wall', 'save-look', 'plate-mode-segmented', 'blackout-button', 'panel-browser-button', 'layer-segmented'];
    for (const mode of ['design', 'perform', 'loadin']) {
      await clickOn(`mode-segmented-${mode}`);
      await settle(800);
      const counts = await Promise.all(ACTIONS.map(shown));
      const wrong = ACTIONS.filter((_, i) => counts[i] !== 1);
      check(`on ${mode}, the plate bar and the header carry the same actions`,
        (await layoutIs(mode)) && wrong.length === 0, wrong.length ? wrong.map(t => `${t} ×${counts[ACTIONS.indexOf(t)]}`).join(', ') : ACTIONS.length + ' actions');
    }

    await clickOn('mode-segmented-perform');
    await settle(800);
    // The browser finds a panel by what it is, and floats it over the plate.
    await clickOn('panel-browser-button');
    const opened = await appears('panel-browser');
    await page.getByTestId('panel-browser-search').fill('mixer');
    await settle(300);
    const row = await shown('panel-browser-row-mixer');
    await page.keyboard.press('Shift+Enter');
    await settle(900);
    const floating = await boxOf('floating-mixer');
    const plate = await boxOf('desk-preview');
    check('the panel browser opens, finds the Mixer, and floats it over the plate',
      opened && row === 1 && !!floating && !!plate && (await shown('panel-browser')) === 0
      && floating.left < plate.left + plate.w && floating.left + floating.w > plate.left
      && floating.top < plate.top + plate.h && floating.top + floating.h > plate.top,
      floating ? `${floating.w}×${floating.h} at ${floating.left},${floating.top}` : opened ? `row ${row}, nothing floated` : 'never opened');
    if (floating) {
      // Asked of the floating panel alone: the Mixer's body is about thirty controls.
      const m = await measureIn('[data-testid="floating-mixer"]');
      check('and the floating panel is readable and big enough to use',
        m.n >= 20 && m.bad.length === 0, m.bad.slice(0, 5).join(', ') || `${m.n} controls in it`);
      await clickOn('panel-mixer-collapse');
      await settle(500);
      const folded = await boxOf('floating-mixer');
      check('folding a panel leaves its header', !!folded && folded.h <= 40 && folded.h >= 24, folded ? `${folded.h}px tall` : 'gone');
      const count = async () => Number(/(\d+) panels?/.exec(await page.getByTestId('status-running').textContent())?.[1] ?? NaN);
      const before = await count();
      const there = await shown('panel-mixer');
      await clickOn('panel-mixer-close');
      await settle(500);
      const after = await count();
      check('and closing it takes it away', there === 1 && (await shown('floating-mixer')) === 0 && (await shown('panel-mixer')) === 0 && after === before - 1,
        `${there} up, ${before} → ${after} panels`);
    }

    // Docked from the browser with Enter, it goes into the deck.
    await clickOn('panel-browser-button');
    await appears('panel-browser');
    await page.getByTestId('panel-browser-search').fill('mixer');
    await settle(300);
    await page.keyboard.press('Enter');
    await settle(900);
    const inDeck = await page.evaluate(() => !!document.querySelector('[data-testid="desk-deck"] [data-testid="panel-mixer"]'));
    check('Enter docks a panel in the deck', inDeck);
    await noteIds();
    if (inDeck) { await clickOn('panel-mixer-close'); await settle(500); }

    // The deck folds to a strip and the plate takes its height.
    const tall = await boxOf('desk-preview');
    await clickOn('deck-fold');
    await settle(900);
    const taller = await boxOf('desk-preview');
    const strip = await shown('deck-strip');
    check('folding the deck gives the plate its height', strip === 1 && !!tall && !!taller && taller.h - tall.h > 150,
      tall && taller ? `${tall.h} → ${taller.h}px` : 'no plate');
    await clickOn('deck-show');
    await settle(700);
    check('and Show deck brings it back', (await shown('desk-deck')) === 1 && (await shown('deck-strip')) === 0);

    // The Stage sheet (⌘,) has the room and the machine, and nothing of a look.
    await page.keyboard.press('Control+Comma');
    const stage = await appears('stage-sheet');
    await settle(700);
    // The Stage category, whole and alone: every section it draws and every
    // row on its rail is one of these, and the rail has all of them.
    const STAGE = ['projectors', 'mapping', 'mark', 'layers', 'simulation'];
    const { sections, rail } = await page.evaluate(() => {
      const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const sheet = document.querySelector('[data-testid="stage-sheet"]');
      return {
        sections: [...(sheet?.querySelectorAll('[data-section]') ?? [])].filter(seen).map((el) => el.getAttribute('data-section')),
        rail: [...(sheet?.querySelectorAll('[data-testid^="settings-nav-"]') ?? [])].map((el) => el.getAttribute('data-testid').slice('settings-nav-'.length)),
      };
    });
    const l = await legibility(page);
    const stray = [...sections, ...rail].filter(x => !STAGE.includes(x));
    check('⌘, opens the Stage sheet on the room and the machine, readable',
      stage && sections.length > 0 && stray.length === 0 && STAGE.every(x => rail.includes(x)) && l.tiny.length === 0,
      stage ? `showing ${sections.join(', ') || 'no section'}; rail ${rail.join(', ')}${stray.length ? `; not stage: ${stray}` : ''}${l.tiny.length ? `; tiny ${l.tiny.slice(0, 3).join(', ')}` : ''}` : 'never opened');
    await page.keyboard.press('Escape');
    await settle(600);

    /*
      Every panel, docked. A settings section was only ever drawn in the
      sheet, which this check never measured; as a desk panel it is on the
      desk, and held to the desk's rules. The first look found a 4px rail on
      the Wall's masks and two 20px switches in Audio Input. So every panel
      the browser lists in Load-in (the one layout that takes the Stage
      panels too) goes into its deck and is measured where it sits.
    */
    await clickOn('mode-segmented-loadin');
    await settle(600);
    await clickOn('panel-browser-button');
    await appears('panel-browser');
    const ids = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="panel-browser-row-"]')]
      .map((el) => el.getAttribute('data-testid').slice('panel-browser-row-'.length)));
    await page.keyboard.press('Escape');
    await page.evaluate((deck) => localStorage.setItem('chromaglass-desk-layout:loadin',
      JSON.stringify({ left: [], right: [], deck, floating: [], collapsed: [], deckCollapsed: false, plateMode: 'live' })), ids);
    await page.reload({ waitUntil: 'networkidle' });
    const reloaded = await appears('loadin-desk');
    await settle(2500);
    const deck = await measureIn('[data-testid="desk-deck"]');
    // Each panel drew its own body, not just its frame: a section's knobs, the
    // section itself (with that section in it), or the desk panel's own list.
    const OWN_BODY = { cues: 'cue-list', rides: 'rides', recipe: 'recipe', bottles: 'bench-left', dyes: 'dye-natural', tools: 'tool-segmented', phone: 'phone-link', mixer: 'deck-mixer' };
    const bodies = await page.evaluate(({ ids, own }) => ids.filter((id) => {
      const panel = document.querySelector(`[data-testid="desk-deck"] [data-testid="panel-${id}"]`);
      if (!panel) return true;
      const body = own[id] ? panel.querySelector(`[data-testid="${own[id]}"]`)
        : panel.querySelector(`[data-testid="section-knobs-${id}"]`) ?? panel.querySelector(`[data-testid="settings-embed-${id}"] [data-section="${id}"]`);
      return !body || body.getBoundingClientRect().height < 8;
    }), { ids, own: OWN_BODY });
    const failedPanels = await page.locator('[data-testid="desk-deck"] [data-testid="panel-failed"]').count();
    // The phone link is words and a URL, and has no control without a relay.
    const bare = ids.filter(id => id !== 'phone' && !(deck.perPanel[id] > 0));
    await noteIds();
    check('every panel there is, docked, draws its own body, readable and big enough to use',
      reloaded && ids.length >= 33 && bodies.length === 0 && failedPanels === 0 && bare.length === 0 && deck.bad.length === 0,
      [bodies.length && `no body: ${bodies}`, failedPanels && `${failedPanels} failed`, bare.length && `no controls: ${bare}`, deck.bad.slice(0, 6).join(', ')].filter(Boolean).join('; ')
        || `${ids.length} panels, ${deck.n} controls`);
    await page.evaluate(() => localStorage.removeItem('chromaglass-desk-layout:loadin'));
    await page.reload({ waitUntil: 'networkidle' });
    await appears('loadin-desk');
    await clickOn('mode-segmented-perform');
    await settle(1200);
  }

  for (const [name, button, panel] of [
    ['settings', 'open-all-settings', 'settings-panel'],
    ['the controller panel', 'dot-midi', 'midi-panel'],
  ]) {
    await clickOn(button);
    const up = await appears(panel);
    await settle(700);
    await noteIds();
    const l = await legibility(page);
    check(`nothing in ${name} is under 11px`, up && l.tiny.length === 0,
      up ? l.tiny.slice(0, 5).join(', ') : 'never opened');
    await page.keyboard.press('Escape');
    await settle(600);
  }

  // ── Nothing is painted on top of anything you can click ────────
  for (const [w, h] of COVER_WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await settle(1200);
    await noteIds();
    const n = await visibleControls();
    const hit = await coveredControls(page, { skipInside: NO_GPU_SCREEN });
    check(`nothing covers a control at ${w}px`, n > 10 && hit.length === 0,
      hit.length ? hit.slice(0, 4).join('; ') : `${n} controls`);
    if (w >= 1024) {
      const { all, bare } = await statusDots(page);
      check(`every status dot is labelled at ${w}px`, all > 0 && bare.length === 0,
        bare.length ? `no word on ${bare.join(', ')}` : `${all} dots, each with its word`);
    }
  }

  // ── The Mixer on the desk leaves the plate alone ──────────────
  /*
    PLAN.md §11 step 5. The desk's Mixer is docked beside the plate so a
    grade is judged on the plate, and at 440 px it reached 128 px into it
    at every width: 15% of the plate at 1440, 29% at 1024, where the plate
    is 408 px wide. It is the rides' column's width now, over the rides.
    Asked at the three desk widths, with a row's drawer open (the widest
    thing in it, five blend buttons in a row): how much of the plate the
    sheet covers, and whether anything in the sheet is cut (a row's name,
    a button's word) or runs off its side. The plan's bar was the plate at
    least two-thirds clear; the measure is the share covered, and the
    check asks for none, which is what docking to the column gives.
  */
  // The cover loop above ends at a phone's width, which has no desk.
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(1200);
  /*
    A tool's options open over everything. Reported by the owner with a
    screenshot (2026-10-03): the panel opened from the Amount chip, or a
    right-click on a tool, was drawn inside the desk's own stacking, under
    the plate, and on the Design desk only its bottom edge showed beneath
    the canvas. So, on both desks: what is on top at the panel's middle,
    and at the Magnet's Size slider (the Magnet's own option), is the
    panel. On main before the fix the middle landed on the plate's frame.
  */
  for (const mode of ['design', 'perform']) {
    await clickOn(`mode-segmented-${mode}`);
    await settle(1000);
    const onTop = async (testId) => page.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return 'absent';
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit && el.closest('[data-testid="tool-options"]') && hit.closest('[data-testid="tool-options"]')
        ? 'panel' : (hit?.closest('[data-testid]')?.getAttribute('data-testid') ?? hit?.tagName ?? 'nothing');
    }, testId);
    const chip = page.getByTestId('tool-amount-chip');
    let viaChip = 'no chip';
    if (await chip.count()) {
      await chip.first().click();
      await settle(300);
      viaChip = await onTop('tool-options');
      await page.mouse.click(5, 5);
      await settle(300);
    }
    await page.getByTestId('tool-segmented-magnet').first().click({ button: 'right' });
    await settle(300);
    const sizeOnTop = await onTop('tool-options-size');
    await page.mouse.click(5, 5);
    await settle(300);
    check(`on ${mode}, a tool's options open over the plate, not under it`,
      viaChip === 'panel' && sizeOnTop === 'panel',
      `at the panel's middle from the Amount chip: ${viaChip}; at the Magnet's Size from a right-click: ${sizeOnTop}`);
  }
  /*
    Zoomed in, the zoom chip leaves Record alone (QA-4). The owner found the
    chip (− 4.7× +, Hold / Follow / Auto) on top of Record performance as
    soon as the plate was zoomed past 1.05×: it was pinned to the window's
    top, which on a desk is the top strip Record sits in. Asked on both desks
    at the three desk widths: the chip and Record do not overlap, what is on
    top at Record's middle is Record, and the chip lies inside the plate's
    box. On main the chip sat 48 px down the window, 3,856 px² of it over
    Record at 1440, and what was on top at Record's middle was the chip.
  */
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const mode of ['design', 'perform']) {
      await clickOn(`mode-segmented-${mode}`);
      await page.evaluate(() => window.chromaglassSettings?.({ macroZoom: 3 }));
      await settle(800);
      const where = await page.evaluate(() => {
        const box = (id) => { const el = document.querySelector(`[data-testid="${id}"]`); return el ? el.getBoundingClientRect() : null; };
        const chip = box('macro-zoom'), rec = box('performance-button'), plate = box('desk-preview');
        if (!chip || !rec) return { chip: !!chip, rec: !!rec };
        const hit = document.elementFromPoint(rec.left + rec.width / 2, rec.top + rec.height / 2);
        const overlap = Math.max(0, Math.min(chip.right, rec.right) - Math.max(chip.left, rec.left))
          * Math.max(0, Math.min(chip.bottom, rec.bottom) - Math.max(chip.top, rec.top));
        const inPlate = !!plate && chip.left >= plate.left - 0.5 && chip.right <= plate.right + 0.5
          && chip.top >= plate.top - 0.5 && chip.bottom <= plate.bottom + 0.5;
        return { chip: true, rec: true, overlap, onRecord: !!hit?.closest('[data-testid="performance-button"]'), inPlate, top: Math.round(chip.top) };
      });
      check(`zoomed in on ${mode} at ${width}, the zoom chip sits on the plate and Record stays clear`,
        where.chip && where.rec && where.overlap === 0 && where.onRecord && where.inPlate,
        where.chip && where.rec
          ? `${where.overlap} px² over Record; Record on top at its middle: ${where.onRecord}; chip ${where.inPlate ? 'inside' : 'outside'} the plate, ${where.top} px down`
          : `chip ${where.chip ? 'shown' : 'missing'}, Record ${where.rec ? 'shown' : 'missing'}`);
      await page.evaluate(() => window.chromaglassSettings?.({ macroZoom: 1 }));
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(800);
  /*
    A layer added and taken off from the Design desk, on every look.

    Reported by the owner: layers could be added on some presets and not
    others, and taken off on none. The desk's plus showed only while a look
    had one layer and there was no minus, so on a two-layer look (Classic,
    which this page opens on) there was nothing beside the layer tabs. What
    the desk offers turns on the look's layer count alone, and every
    built-in carries one or two, so taking Classic's second layer off and
    putting it back walks both states a preset can open in. Measured: the
    tabs, which of the two buttons is beside them, and the solvers the
    engine has (built without a GPU too), after each press. A press that
    did nothing leaves the tabs as they were and fails.
  */
  {
    await clickOn('mode-segmented-design');
    await settle(800);
    const deskLayers = () => page.evaluate(() => ({
      tabs: document.querySelectorAll('[data-testid^="layer-segmented-"]').length,
      add: !!document.querySelector('[data-testid="add-layer"]'),
      off: !!document.querySelector('[data-testid="remove-layer"]:not([disabled])'),
      solvers: window.chromaglassDebug?.().solver?.().layers ?? null,
    }));
    const says = (st) => `${st.tabs} tab${st.tabs === 1 ? '' : 's'}${st.add ? ', +' : ''}${st.off ? ', −' : ''} (${st.solvers ?? 'no'} solvers)`;
    const opened = await deskLayers();
    if (opened.off) await clickOn('remove-layer');
    await settle(500);
    const taken = await deskLayers();
    if (taken.add) await clickOn('add-layer');
    await settle(500);
    const added = await deskLayers();
    check('the Design desk takes a layer off a two-layer look and puts it back',
      opened.tabs === 2 && !opened.add && opened.off && opened.solvers === 2
      && taken.tabs === 1 && taken.add && !taken.off && taken.solvers === 1
      && added.tabs === 2 && !added.add && added.off && added.solvers === 2,
      `${says(opened)} → ${says(taken)} → ${says(added)}`);
  }
  await clickOn('mode-segmented-perform');
  await settle(1000);
  for (const [w, h] of [[1440, 900], [1280, 860], [1024, 860]]) {
    await page.setViewportSize({ width: w, height: h });
    await settle(900);
    if (!(await page.getByTestId('mixer-sheet').count())) { await clickOn('open-mixer'); await appears('mixer-sheet'); await settle(500); }
    if ((await page.getByTestId('desk-mixer-back-grade').count()) === 0) { await clickOn('desk-mixer-back-open'); await settle(400); }
    const m = await page.evaluate(() => {
      const plate = document.querySelector('[data-testid="desk-preview"]')?.getBoundingClientRect();
      const sheetEl = document.querySelector('[data-testid="mixer-sheet"]');
      const sheet = sheetEl?.getBoundingClientRect();
      if (!plate || !sheet) return null;
      const ix = Math.max(0, Math.min(plate.right, sheet.right) - Math.max(plate.left, sheet.left));
      const iy = Math.max(0, Math.min(plate.bottom, sheet.bottom) - Math.max(plate.top, sheet.top));
      const scroller = sheetEl.querySelector('.overflow-y-auto');
      const cut = [...sheetEl.querySelectorAll('[data-testid$="-name"], button')]
        .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && el.scrollWidth - el.clientWidth > 1; })
        .map(el => `${el.getAttribute('data-testid') || el.textContent.trim().slice(0, 20)} by ${el.scrollWidth - el.clientWidth}px`);
      const outside = [...sheetEl.querySelectorAll('button, input')]
        .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > sheet.right + 0.5 || r.left < sheet.left - 0.5); })
        .map(el => el.getAttribute('data-testid') || el.textContent.trim().slice(0, 20));
      const blends = sheetEl.querySelectorAll('[data-testid^="desk-mixer-back-blend-"]').length;
      return {
        covered: (ix * iy) / (plate.width * plate.height), plateW: Math.round(plate.width), sheetW: Math.round(sheet.width),
        spill: scroller ? scroller.scrollWidth - scroller.clientWidth : -1, cut, outside, blends,
      };
    });
    check(`the Mixer on the desk covers none of the plate at ${w}px`, m && m.covered === 0,
      m ? `${Math.round(m.covered * 100)}% of a ${m.plateW} px plate under a ${m.sheetW} px sheet` : 'no plate or no sheet');
    check(`and nothing in it is cut or runs off its side at ${w}px, a row's drawer open`,
      m && m.blends === 5 && m.spill <= 0 && m.cut.length === 0 && m.outside.length === 0,
      m ? [m.blends === 5 ? '' : `${m.blends} blend buttons`, m.spill > 0 ? `${m.spill}px sideways` : '', ...m.cut, ...m.outside.map(o => `${o} outside`)].filter(Boolean).slice(0, 5).join('; ') || 'all whole' : 'no sheet');
  }
  await page.keyboard.press('Escape');
  await settle(500);

  // ── Small screens ──────────────────────────────────────────────
  await page.setViewportSize({ width: 420, height: 820 });
  await settle(1500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('nothing spills off a phone-width screen', overflow <= 2, `${overflow}px of overflow`);
  const alphaSmall = await alphaBadge();
  check('and at phone width the Alpha label sits by the name', alphaSmall.ok, alphaSmall.why);

  // ── Nothing is on the screen twice ─────────────────────────────
  const dupes = Object.entries(seenIds);
  check('no control appears on the screen twice', dupes.length === 0, dupes.map(([id, n]) => `${id} ×${n}`).join(', '));
} catch (err) {
  check('the run completed', false, String(err).split('\n')[0]);
} finally {
  await browser.close();
  stopServer(server);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} layout checks passed`);
process.exit(failed.length ? 1 : 0);
