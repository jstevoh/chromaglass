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
/** The other side of `appears`: a sheet that is still sliding away still takes the clicks under it. */
const gone = async (testId) => {
  for (let i = 0; i < 20; i++) {
    if ((await page.getByTestId(testId).count()) === 0) return true;
    await settle(300);
  }
  return false;
};
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
    const stageGone = await gone('stage-sheet');

    /*
      Every panel, docked. A settings section was only ever drawn in the
      sheet, which this check never measured; as a desk panel it is on the
      desk, and held to the desk's rules. The first look found a 4px rail on
      the Wall's masks and two 20px switches in Audio Input. So every panel
      the browser lists in Load-in (the one layout that takes the Stage
      panels too) goes into its deck and is measured where it sits.
    */
    /*
      Load-in first, and known to be up before its browser is read. One run in
      six on SwiftShader read Gig's browser instead (27 panels, none of the
      Stage's): the Stage sheet was still sliding away under a 600ms settle,
      the click on Load-in landed on its backdrop, and the check stored a
      Load-in layout of Gig's panels and then measured Gig. So the sheet has
      to be gone, and the switch has to have put Load-in up, or the check
      says that is what failed rather than blaming the panels.
    */
    await clickOn('mode-segmented-loadin');
    let onLoadin = false;
    for (let i = 0; i < 20 && !onLoadin; i++) { await settle(300); onLoadin = await layoutIs('loadin'); }
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
    const OWN_BODY = { cues: 'cue-list', rides: 'rides', recipe: 'recipe', bottles: 'bench-left', dyes: 'dye-natural', tools: 'tool-segmented', tilt: 'tilt-panel', phone: 'phone-link', mixer: 'deck-mixer', score: 'song-score' };
    // Why each one failed, so a red run says which of three things it was:
    // the panel never reached the deck, it did and drew no body, or the body
    // is there and has no height.
    const bodies = await page.evaluate(({ ids, own }) => ids.map((id) => {
      const panel = document.querySelector(`[data-testid="desk-deck"] [data-testid="panel-${id}"]`);
      if (!panel) return `${id} (not on the deck)`;
      const body = own[id] ? panel.querySelector(`[data-testid="${own[id]}"]`)
        : panel.querySelector(`[data-testid="section-knobs-${id}"]`) ?? panel.querySelector(`[data-testid="settings-embed-${id}"] [data-section="${id}"]`);
      if (!body) return `${id} (no body)`;
      const h = body.getBoundingClientRect().height;
      return h < 8 ? `${id} (${Math.round(h)}px tall)` : null;
    }).filter(Boolean), { ids, own: OWN_BODY });
    const failedPanels = await page.locator('[data-testid="desk-deck"] [data-testid="panel-failed"]').count();
    // 32: the eight desk panels (the Score joined them, PLAN 28h) and the
    // twenty-four settings sections. Before the Score it was 31, and it was
    // 33 until Sound Mappings and Heat Slide were folded into Sound and Fluid
    // Physics (2026-10-10; `npm run desklayout` holds that), and a browser
    // listing fewer has lost a panel.
    // The phone link is words and a URL, and has no control without a relay.
    const bare = ids.filter(id => id !== 'phone' && !(deck.perPanel[id] > 0));
    await noteIds();
    check('every panel there is, docked, draws its own body, readable and big enough to use',
      stageGone && onLoadin && reloaded && ids.length >= 32 && bodies.length === 0 && failedPanels === 0 && bare.length === 0 && deck.bad.length === 0,
      [!stageGone && 'the Stage sheet never closed', !onLoadin && 'Load-in never came up', !reloaded && 'not on Load-in after the reload',
        ids.length < 32 && `the browser lists ${ids.length} panels`, bodies.length && `no body: ${bodies}`, failedPanels && `${failedPanels} failed`, bare.length && `no controls: ${bare}`, deck.bad.slice(0, 6).join(', ')].filter(Boolean).join('; ')
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
      const { all, bare, folded } = await statusDots(page);
      check(`every status dot is labelled at ${w}px`, all > 0 && bare.length === 0,
        bare.length ? `no word on ${bare.join(', ')}` : `${all} dots, each with its word${folded ? ', in the opened Status fold' : ''}`);
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

  // ── The plate bar does not move when the look changes (PLAN.md 19v-3) ──
  {
    /*
      The magnet check lost its second press on the Mac six times in a day
      (2026-10-11). Its first hold gave the look its magnet, which marked the
      look changed, and Save read "Save •": 11 px wider. At 1280 in Build the
      plate bar is one row with 0–1 px to spare, so it wrapped to two, the
      plate's hole dropped 42 px, and the canvas, painted over the hole, went
      with it; the second press, aimed at the plate's top row from a box
      measured before any touch, landed on the bar. A performer's hand aimed
      at the plate would too. So: a clean look at 1280 × 800 in Build, the
      plate's hole and Save measured; then the look changed by a real hand
      (an arrow key on the first deck knob, which goes through the same
      update a magnet hold does; `window.chromaglassSettings` would not mark
      it changed), and both measured again. The mark has to show, or the
      look never changed and nothing was asked; and the look has to start
      clean, or both measures are of the same changed bar. On the old
      "Save •" this line read a 42 px drop.
    */
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pg = await ctx.newPage();
    await pg.addInitScript(() => { try { localStorage.setItem('chromaglass-desk-mode', 'design'); } catch { /* */ } });
    await pg.goto(URL, { waitUntil: 'networkidle' });
    for (let i = 0; i < 20 && !(await pg.getByTestId('desk-preview').count()); i++) await pg.waitForTimeout(300);
    await pg.waitForTimeout(1500);
    const measure = () => pg.evaluate(() => {
      const box = (id) => { const r = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; };
      const mark = document.querySelector('[data-testid="save-dirty"]');
      return { preview: box('desk-preview'), save: box('save-look'), marked: !!mark && getComputedStyle(mark).visibility === 'visible' };
    });
    const before = await measure();
    const knob = pg.locator('[data-testid="desk-deck"] [data-knob] input[type="range"]').first();
    let after = null;
    if (await knob.count()) {
      await knob.focus();
      for (let i = 0; i < 4; i++) await pg.keyboard.press('ArrowRight');
      for (let i = 0; i < 10; i++) { await pg.waitForTimeout(200); after = await measure(); if (after.marked) break; }
    }
    await ctx.close();
    const moved = (a, b) => (a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h)) : Infinity);
    const dp = moved(before.preview, after?.preview), ds = moved(before.save, after?.save);
    const fmt = (b) => (b ? `${b.x.toFixed(1)},${b.y.toFixed(1)} ${b.w.toFixed(1)}×${b.h.toFixed(1)}` : 'none');
    check('at 1280 in Build, changing the look does not move the plate: its hole and Save keep their boxes, and Save shows the look has changed',
      !before.marked && !!after?.marked && dp <= 0.5 && ds <= 0.5,
      `clean ${before.marked ? 'no (already marked)' : 'yes'}, marked after ${after?.marked ? 'yes' : 'no'}; plate ${fmt(before.preview)} → ${fmt(after?.preview)} (${dp.toFixed(1)} px); Save ${fmt(before.save)} → ${fmt(after?.save)} (${ds.toFixed(1)} px)`);
  }

  // ── The rest of Desk v2 (PLAN.md 8c, 8e, 8f, 8h) ───────────────
  await page.setViewportSize({ width: 1440, height: 900 });
  await clickOn('mode-segmented-design');
  await settle(1000);
  {
    /*
      8c: a knob turned round its ring, as well as up and down, and a
      double-click back to the look's own value. The first knob in the deck,
      read as its range input's value: unedited, the plate is the look, so
      where it starts is the look's value and the double-click must land
      there again after the hand has moved it both ways.
    */
    const knob = page.locator('[data-testid="desk-deck"] [data-knob] input[type="range"]').first();
    const readKnob = () => knob.evaluate((el) => Number(el.value));
    const box = await knob.boundingBox();
    if (!box) {
      check('a knob in the deck to turn', false, 'none drawn');
    } else {
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width / 2 * 0.85;
      const min = Number(await knob.getAttribute('min')), max = Number(await knob.getAttribute('max'));
      const span = max - min || 1;
      const lookValue = await readKnob();
      // Down a little first, from the cap, so the ring has somewhere to go.
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy + 40, { steps: 8 });
      await page.mouse.up();
      await settle(200);
      const start = await readKnob();
      // Round the ring: from nine o'clock over the top to three, half a turn clockwise.
      await page.mouse.move(cx - r, cy);
      await page.mouse.down();
      for (let a = 180; a <= 360; a += 10) await page.mouse.move(cx + Math.cos(a * Math.PI / 180) * r, cy + Math.sin(a * Math.PI / 180) * r);
      await page.mouse.up();
      await settle(200);
      const turned = await readKnob();
      // Begun on the cap, a sideways motion is a vertical drag, and moves next to nothing.
      // It is drawn above the centre, from half the radius left to half right, so every
      // point is on the cap (at most 0.58 of the radius out; the ring starts at 0.65) but
      // far enough out that the ring's rule would read it as about 118° clockwise, 0.44
      // of the travel: a knob that followed the ring from its cap would fail here. (Through
      // the centre itself it would not: inside 4 px the ring's angle counts for nothing.)
      const R = box.width / 2;
      await page.mouse.move(cx - R * 0.5, cy - R * 0.3);
      await page.mouse.down();
      await page.mouse.move(cx + R * 0.5, cy - R * 0.3, { steps: 8 });
      await page.mouse.up();
      await settle(200);
      const capSide = await readKnob();
      check('a knob follows a hand round its ring: half a turn clockwise turns it up by well over a third of its travel',
        (turned - start) / span > 0.4, `${start.toFixed(3)} → ${turned.toFixed(3)} of ${min}..${max}`);
      check('and a hand sideways across its cap does not turn it (on the cap it is up and down)', Math.abs(capSide - turned) / span < 0.02,
        `${turned.toFixed(3)} → ${capSide.toFixed(3)}`);
      await knob.dblclick();
      await settle(300);
      const reset = await readKnob();
      // Moved well away first, so a double-click that did nothing cannot pass.
      check('a double-click puts it back to the look\'s own value', Math.abs(capSide - lookValue) / span > 0.1 && Math.abs(reset - lookValue) / span < 0.01,
        `look ${lookValue.toFixed(3)}, moved to ${capSide.toFixed(3)}, back to ${reset.toFixed(3)}`);
    }
  }
  {
    /*
      8e: Load-in's Wall panel carries the test pattern and Identify, and
      Output's gain and gamma as knobs. The pattern itself is drawn in the
      projector's pass and measured on it (`npm run wallpattern`); here, that
      the switch is there, turns on, and is never written into the stored
      output config, which a show reopens with.
    */
    await clickOn('mode-segmented-loadin');
    await settle(1200);
    const has = async (id) => (await page.getByTestId(id).count()) > 0;
    const parts = await Promise.all(['output-test-pattern', 'output-identify', 'output-gain', 'output-gamma'].map(has));
    check('Load-in\'s Wall panel has the test pattern, Identify, and gain and gamma as knobs', parts.every(Boolean),
      ['test pattern', 'identify', 'gain', 'gamma'].filter((_, i) => !parts[i]).map(x => `no ${x}`).join(', ') || 'all four');
    if (parts[0]) {
      await page.getByTestId('output-test-pattern').first().click();
      await settle(400);
      const pressed = await page.getByTestId('output-test-pattern').first().evaluate((el) => el.className.includes('bg-white text-black'));
      // A gain change, so the config is written while the pattern is up.
      await page.evaluate(() => window.chromaglassOutput?.({ gain: 1.05 }));
      await settle(300);
      const stored = await page.evaluate(() => localStorage.getItem('chromaglass-output') ?? '');
      check('the test pattern turns on, and is never stored with the wall\'s settings', pressed && stored.includes('"gain"') && !stored.includes('test'),
        `${pressed ? 'on' : 'not on'}; stored ${stored.length} chars${stored.includes('test') ? ', with the test in it' : ''}`);
      await page.getByTestId('output-test-pattern').first().click();
      await page.evaluate(() => window.chromaglassOutput?.({ gain: 1 }));
      await settle(300);
    }
  }
  {
    /*
      8f: the Phone · iPad panel draws the link as a QR code. There is no show
      server behind the preview, so its address is given here, and the code
      drawn is read back into its modules and compared, module for module,
      with the encoder's own for that address (`npm run qr` reads the encoder
      back to the text).
    */
    const info = { chromaglass: 'relay', port: 8787, hosts: ['192.168.1.23'], key: '3f9a27c1b4e8d6f0' };
    await page.route('**/remote-info.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(info) }));
    // Out of Load-in and back, so the panel mounts again and asks.
    await clickOn('mode-segmented-perform');
    await settle(600);
    await clickOn('mode-segmented-loadin');
    await settle(1500);
    const drawn = await page.evaluate(() => {
      const svg = document.querySelector('[data-testid="phone-link-qr"]');
      const url = document.querySelector('[data-testid="phone-link-url"]')?.textContent ?? null;
      if (!svg) return { url, d: null };
      const r = svg.getBoundingClientRect();
      return { url, d: svg.querySelector('path')?.getAttribute('d') ?? null, w: Math.round(r.width), version: svg.getAttribute('data-qr-version') };
    });
    await page.unroute('**/remote-info.json');
    const { encodeQr, qrPath } = await import('../src/lib/qr.ts');
    const want = drawn.url ? encodeQr(drawn.url) : null;
    check('the Phone · iPad panel draws its link as a QR code, module for module the code of the address it shows',
      !!drawn.d && !!want && drawn.d === qrPath(want) && drawn.url.includes(info.key),
      drawn.d ? `version ${drawn.version}, ${drawn.w}px, for ${drawn.url}` : `no code drawn${drawn.url ? '' : ', no address'}`);
  }
  {
    /*
      8h: at 1024 the header was full: + Panel, six dots with their words
      under them, search and Blackout came to 342 px, five more than the room
      right of the centred switch, so the Sound dot sat under it. Now the dots
      fold into one Status button when they do not fit. Asked of every
      layout: at 1024 the cluster is clear of the switch, and still clear
      with a seventh dot in it (a span as wide as the Video dot with its word
      under it); at a width where the dots fit with their words under them,
      something wider than the room left folds them, the button opens every
      dot, and with it gone they unfold.

      Where the dots fit is found, not assumed. This was asked at 1280 and
      passed in a cloud session, where the cluster cleared the switch by 6 px
      there; CI's Linux runner draws the same words wider and folds at 1280,
      which is the header doing its job on that machine's fonts, not a fault.
      So the narrowest width from 1280 up, in steps of 40, where the header
      is at level 1 (the words under the dots) is the one asked at, and the
      thing added is the room left there plus 8 px, so that it must fold.
    */
    const cluster = () => page.evaluate(() => {
      const el = document.querySelector('[data-testid="header-cluster"]');
      const c = el.getBoundingClientRect();
      const sw = document.querySelector('[data-testid="mode-segmented"]')?.getBoundingClientRect();
      return { fold: el.getAttribute('data-fold'), gap: sw ? Math.round(c.left - sw.right) : null, button: !!document.querySelector('[data-testid="dot-fold"]') };
    });
    const extra = (on, w = 60) => page.evaluate(([on, w]) => {
      document.getElementById('layout-extra')?.remove();
      if (!on) return;
      const x = document.createElement('span');
      x.id = 'layout-extra';
      x.style.cssText = `display:inline-block;width:${w}px;height:8px;flex-shrink:0`;
      document.querySelector('[data-testid="header-cluster"]')?.prepend(x);
    }, [on, w]);
    /** The narrowest width from 1280 up where the header is at level 1, left set there. */
    const roomyWidth = async () => {
      for (let w = 1280; w <= 1720; w += 40) {
        await page.setViewportSize({ width: w, height: 860 });
        await settle(700);
        if ((await cluster()).fold === '1') return { w, found: true };
      }
      return { w: 1720, found: false };
    };
    const rows = [];
    for (const mode of ['design', 'perform', 'loadin']) {
      await clickOn(`mode-segmented-${mode}`);
      const roomy = await roomyWidth();
      const dotW = await page.evaluate(() => Math.round(document.querySelector('header [data-testid="dot-video"]')?.getBoundingClientRect().width ?? 0));
      await page.setViewportSize({ width: 1024, height: 860 });
      await settle(900);
      const at1024 = await cluster();
      await extra(true, dotW); await settle(600);
      const more1024 = await cluster();
      await extra(false);
      await page.setViewportSize({ width: roomy.w, height: 860 });
      await settle(900);
      const at1280 = await cluster();
      await extra(true, Math.max(0, at1280.gap ?? 0) + 8); await settle(600);
      const more1280 = await cluster();
      let listed = false;
      if (more1280.button) {
        await clickOn('dot-fold');
        await settle(300);
        // Listed, and on top: each dot's middle is the dot, not the deck or a panel over the list.
        listed = await page.evaluate(() => ['dot-sound', 'dot-video', 'dot-midi', 'dot-performance'].every((t) => {
          const el = document.querySelector(`[data-testid="dot-fold-list"] [data-testid="${t}"]`);
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const top = r.width && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!top && (top === el || el.contains(top));
        }));
        // Closed by its own button: Escape would also run the app's Escape, which closes panels.
        await clickOn('dot-fold');
      }
      await extra(false); await settle(900);
      const back1280 = await cluster();
      rows.push({ mode, roomy, dotW, at1024, more1024, at1280, more1280, listed, back1280 });
    }
    check('at 1024 the header\'s right side is clear of the centred switch, in every layout, and still clear with a seventh dot in it',
      rows.every(r => r.dotW > 10 && r.at1024.gap >= 0 && r.more1024.gap >= 0 && r.more1024.fold === '2'),
      rows.map(r => `${r.mode}: ${r.at1024.gap}px (level ${r.at1024.fold}), ${r.more1024.gap}px with a ${r.dotW}px dot more`).join('; '));
    check('where the dots fit, something wider than the room left folds them into one Status button clear of the switch, which opens every dot, and they unfold when it goes',
      rows.every(r => r.roomy.found && r.at1280.fold === '1' && r.more1280.fold === '2' && r.more1280.gap >= 0 && r.listed && r.back1280.fold === r.at1280.fold),
      rows.map(r => `${r.mode} at ${r.roomy.w}${r.roomy.found ? '' : ' (never level 1)'}: level ${r.at1280.fold} → ${r.more1280.fold} (${r.more1280.gap}px) → ${r.back1280.fold}${r.listed ? '' : ', not listed'}`).join('; '));
    /*
      And a real dot, which is the harder case: folded, the dots are inside
      the Status button, so a dot going away changes nothing the header's
      observer sees. The cluster is filled to 12 px short of the switch, a
      take started (R) puts its Rec dot in and folds the header, and the take
      stopped must unfold it again, not leave it folded until the window
      grows by a dot (found in review: the saving measured with the Rec dot in
      it held the fold). The extra span stays put throughout, so the only
      thing that changes is the dot.
    */
    {
      await clickOn('mode-segmented-perform');
      const roomy = await roomyWidth();
      const base = await cluster();
      await extra(true, Math.max(0, (base.gap ?? 0) - 12)); await settle(600);
      const full = await cluster();
      const recording = () => page.evaluate(() => !!document.querySelector('[data-testid="dot-rec"]')
        || /recording/.test(document.querySelector('[data-testid="dot-fold"]')?.getAttribute('title') ?? ''));
      await page.evaluate(() => (document.activeElement)?.blur?.());
      await page.keyboard.press('r'); await settle(1500);
      const taking = await cluster(), wasRec = await recording();
      await page.evaluate(() => (document.activeElement)?.blur?.());
      await page.keyboard.press('r'); await settle(1500);
      const stopped = await cluster(), stillRec = await recording();
      await extra(false); await settle(600);
      check('a take\'s Rec dot folds a full header and the take stopping unfolds it again',
        roomy.found && full.fold !== '2' && wasRec && taking.fold === '2' && !stillRec && stopped.fold === full.fold,
        `at ${roomy.w}: level ${full.fold} (${full.gap}px) → ${wasRec ? 'recording' : 'not recording'}, level ${taking.fold} → ${stillRec ? 'still recording' : 'stopped'}, level ${stopped.fold}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(800);
    const wide = await cluster();
    check('at 1440 the dots are not folded', wide.fold !== '2', `level ${wide.fold}`);
  }
  {
    /*
      8g: a panel in a window of its own, for a second display. The window is
      the desk's own React tree portalled into a blank window, so what is
      asked is that it is the same panel and not a picture of one:
       - it opens from the panel's header, with the page's styles in it (an
         unstyled copy has a transparent background: the stylesheets were not
         carried over) and its own knobs, while its place on the desk says it
         is away and holds none of them;
       - a knob turned in the window is the desk's value: closed as the system
         would close it, the panel is back on the desk reading what the window
         set (a copy with its own state would read the old value);
       - with windows blocked, the button floats the panel instead of doing
         nothing.
    */
    await page.setViewportSize({ width: 1440, height: 900 });
    await clickOn('mode-segmented-design');
    await settle(900);
    const id = await page.evaluate(() => [...document.querySelectorAll('[data-testid="desk-deck"] [data-panel]')]
      .find(el => el.querySelector('[data-knob] input[type="range"]'))?.getAttribute('data-panel'));
    if (!id) {
      check('a panel with a knob in the deck to open in its own window', false, 'none');
    } else {
      const knobIn = (pg) => pg.locator(`[data-panel="${id}"] [data-knob] input[type="range"]`).first();
      const span = await knobIn(page).evaluate(el => Number(el.max) - Number(el.min) || 1);
      const before = await knobIn(page).evaluate(el => Number(el.value));
      const deskBg = await page.evaluate((id) => getComputedStyle(document.querySelector(`[data-panel="${id}"]`)).backgroundColor, id);
      let win = null;
      try {
        [win] = await Promise.all([page.waitForEvent('popup', { timeout: 6000 }), clickOn(`panel-${id}-popout`)]);
        await win.waitForSelector(`[data-panel="${id}"][data-popped="true"] [data-knob]`, { timeout: 6000 });
      } catch { /* reported below */ }
      const there = win ? await win.evaluate((id) => {
        const el = document.querySelector(`[data-panel="${id}"]`);
        const r = el.getBoundingClientRect();
        return { bg: getComputedStyle(el).backgroundColor, w: Math.round(r.width), h: Math.round(r.height), knobs: el.querySelectorAll('[data-knob]').length };
      }, id) : null;
      const away = await page.evaluate((id) => ({
        card: !!document.querySelector(`[data-testid="panel-${id}-away"]`),
        knobs: document.querySelectorAll(`[data-panel="${id}"] [data-knob]`).length,
      }), id);
      check('a panel opens in its own window, styled as on the desk and with its knobs, and its place on the desk says it is away',
        !!there && there.knobs > 0 && there.bg === deskBg && !/rgba\(0, 0, 0, 0\)|transparent/.test(there.bg) && there.h > 100 && away.card && away.knobs === 0,
        there ? `${there.knobs} knobs, ${there.w}×${there.h}, background ${there.bg} (desk ${deskBg}); on the desk ${away.card ? 'the away card' : 'no card'}, ${away.knobs} knobs` : 'no window');
      /*
        Clean screen on the laptop (Actions, "Clean screen") hides the desk.
        It used to unmount it, and the desk going closed its windows: the
        mixer on the second display went with it, at the moment it matters
        most (found in review). The window must stay up through it, with its
        panel, and Esc brings the desk back with the away card in its place.
      */
      let clean = null;
      if (win) {
        // ⌘K, "Clean screen", Enter: typed, as `qa` does, since the list shows only the top rows until then.
        await page.keyboard.press('Control+k');
        await settle(500);
        await page.evaluate(() => {
          const input = document.querySelector('[data-testid="palette-input"]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Clean screen');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        });
        await settle(500);
        await page.keyboard.press('Enter');
        await settle(900);
        const deskGone = await page.locator('[data-desk="v2"]').count() === 0;
        const kept = !win.isClosed() && await win.locator(`[data-panel="${id}"] [data-knob]`).count() > 0;
        await page.keyboard.press('Escape');
        await settle(900);
        const cardBack = await page.locator(`[data-testid="panel-${id}-away"]`).count() > 0;
        clean = { deskGone, kept, cardBack };
      }
      check('a clean screen on the laptop leaves the panel up in its own window, and Esc brings the desk back with the panel still out',
        !!clean && clean.deskGone && clean.kept && clean.cardBack,
        clean ? `desk ${clean.deskGone ? 'hidden' : 'still drawn'}, window ${clean.kept ? 'kept with its panel' : 'gone'}, card ${clean.cardBack ? 'back' : 'missing'}` : 'no window');
      let turned = before, back = NaN, cardAfter = true;
      if (win && !win.isClosed()) {
        const kb = await knobIn(win).boundingBox();
        await win.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
        await win.mouse.down();
        await win.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2 + (before - Number(await knobIn(win).getAttribute('min')) > span / 2 ? 50 : -50), { steps: 8 });
        await win.mouse.up();
        await settle(300);
        turned = await knobIn(win).evaluate(el => Number(el.value));
        await win.close();
        await settle(1500);
        back = await knobIn(page).evaluate(el => Number(el.value)).catch(() => NaN);
        cardAfter = await page.locator(`[data-testid="panel-${id}-away"]`).count() > 0;
      }
      check('a knob turned in the window is the desk\'s own: with the window closed the panel is back on the desk reading what the window set',
        Math.abs(turned - before) / span > 0.1 && Math.abs(back - turned) < 1e-9 && !cardAfter,
        `${before.toFixed(3)} → ${turned.toFixed(3)} in the window → ${Number.isNaN(back) ? 'not back' : back.toFixed(3)} on the desk`);
      // Back to the look's own value, for whatever is asked after this.
      await knobIn(page).dblclick().catch(() => {});
      await page.evaluate(() => { window.__cgOpen = window.open; window.open = () => null; });
      await clickOn(`panel-${id}-popout`);
      await settle(600);
      const floated = await page.locator(`[data-testid="floating-${id}"]`).count();
      await page.evaluate(() => { window.open = window.__cgOpen; });
      if (floated) { await clickOn(`panel-${id}-dock`); await settle(600); }
      check('with windows blocked, the button floats the panel rather than doing nothing', floated === 1, floated ? 'floated' : 'nothing happened');
    }
  }

  // ── Every panel's every control within reach, at every size ────
  /*
    The owner, 2026-10-10, over a screenshot of the Dyes panel on Gig's deck:
    "I can't access the palettes at the bottom - I can't scroll down." The
    deck is 236px tall, the frame clips (rounded corners, overflow hidden)
    and the Dyes body did not scroll, so Palette, Image and Video were under
    the deck's edge; and the palette list, once open, ran off the bottom of
    the window. The checks above measured what was on screen and passed,
    because a control that is never drawn has nothing wrong with it.

    So this asks of every control in every panel what a hand can do: bring it
    into view the way a hand can (scrolling only what scrolls; a box with
    overflow hidden that the script scrolled is put back) and then find some
    point of it, inside its panel and the window, that a pointer lands on.
    At five window sizes, on the three shipped layouts, then with every panel
    there is in the deck (236px tall), in one column, and floating at the
    size a panel floats at. On main before this it found the Dyes panel's
    three on Gig, and the Sound section's source switch and the Video
    section's source buttons running out of a 312px panel sideways.
  */
  {
    // Every panel there is, from the panel browser on Load-in (the one layout that offers the Stage panels too).
    const panelIds = await (async () => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const pg = await ctx.newPage();
      await pg.addInitScript(() => { try { localStorage.setItem('chromaglass-desk-mode', 'loadin'); } catch { /* */ } });
      await pg.goto(URL, { waitUntil: 'networkidle' });
      for (let i = 0; i < 20 && !(await pg.getByTestId('panel-browser-button').count()); i++) await pg.waitForTimeout(300);
      await clickAt(pg, 'panel-browser-button');
      for (let i = 0; i < 20 && !(await pg.getByTestId('panel-browser').count()); i++) await pg.waitForTimeout(300);
      const ids = await pg.evaluate(() => [...document.querySelectorAll('[data-testid^="panel-browser-row-"]')].map(el => el.getAttribute('data-testid').slice('panel-browser-row-'.length)));
      await ctx.close();
      return ids;
    })();
    const L = (over) => ({ left: [], right: [], deck: [], floating: [], collapsed: [], deckCollapsed: false, plateMode: 'live', ...over });
    const runs = [];
    for (const [w, h] of [[1024, 700], [1280, 800], [1440, 900], [1920, 1080], [1180, 820]]) {
      for (const [mode, name] of [['design', 'build'], ['perform', 'gig'], ['loadin', 'loadin']]) runs.push({ w, h, mode, name, label: name, layout: null });
    }
    for (const [w, h] of [[1024, 700], [1920, 1080]]) {
      runs.push({ w, h, mode: 'loadin', name: 'loadin', label: 'every panel in the deck', layout: L({ deck: panelIds }) });
      runs.push({ w, h, mode: 'loadin', name: 'loadin', label: 'every panel in a column', layout: L({ right: panelIds }) });
    }
    for (let k = 0; k < panelIds.length; k += 10) {
      const ids = panelIds.slice(k, k + 10);
      runs.push({ w: 1920, h: 1080, mode: 'loadin', name: 'loadin', label: `floating, ${ids[0]}…`, layout: L({ deckCollapsed: true, floating: ids.map((id, i) => ({ id, x: 8 + (i % 5) * 316, y: 56 + Math.floor(i / 5) * 400, w: 312, h: 360 })) }) });
    }
    const out = [];
    let panelsSeen = 0, controlsSeen = 0;
    for (const run of runs) {
      const ctx = await browser.newContext({ viewport: { width: run.w, height: run.h } });
      const pg = await ctx.newPage();
      await pg.addInitScript(([m, n, l]) => {
        try { localStorage.setItem('chromaglass-desk-mode', m); if (l) localStorage.setItem(`chromaglass-desk-layout:${n}`, JSON.stringify(l)); } catch { /* */ }
      }, [run.mode, run.name, run.layout]);
      await pg.goto(URL, { waitUntil: 'networkidle' });
      for (let i = 0; i < 20 && !(await pg.locator('[data-panel]').count()); i++) await pg.waitForTimeout(300);
      await pg.waitForTimeout(1500);
      const r = await pg.evaluate(() => {
        const bad = [];
        let panels = 0, controls = 0;
        for (const frame of document.querySelectorAll('[data-panel]')) {
          // Folded to its header, or out in a window of its own: nothing to reach here.
          if (!frame.querySelector(':scope > :not([data-panel-head])')) continue;
          panels++;
          const id = frame.getAttribute('data-panel');
          for (const el of frame.querySelectorAll('button, input, select, [role=button]')) {
            if (el.closest('[data-panel-head]')) continue;
            const r0 = el.getBoundingClientRect();
            if (r0.width === 0 || r0.height === 0) continue;
            controls++;
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              const cs = getComputedStyle(a);
              if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && a.scrollTop) a.scrollTop = 0;
              if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && a.scrollLeft) a.scrollLeft = 0;
            }
            const r = el.getBoundingClientRect(), f = frame.getBoundingClientRect();
            let ok = false;
            for (let i = 1; i < 6 && !ok; i++) for (let j = 1; j < 6 && !ok; j++) {
              const x = r.left + (r.width * i) / 6, y = r.top + (r.height * j) / 6;
              if (x < Math.max(0, f.left) || x > Math.min(innerWidth, f.right) || y < Math.max(0, f.top) || y > Math.min(innerHeight, f.bottom)) continue;
              const hit = document.elementFromPoint(x, y);
              ok = !!hit && (hit === el || el.contains(hit));
            }
            if (!ok) bad.push(`${id}: ${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 20)}`);
          }
        }
        return { bad, panels, controls };
      });
      panelsSeen += r.panels; controlsSeen += r.controls;
      // A layout handed to the desk is the one it drew, all of it: a desk that dropped panels from it would otherwise pass on what was left.
      const asked = run.layout ? run.layout.left.length + run.layout.right.length + run.layout.deck.length + run.layout.floating.length : 1;
      if (run.layout ? r.panels !== asked : r.panels === 0) out.push(`${run.w}×${run.h} ${run.label}: ${r.panels} panels drawn${run.layout ? ` of ${asked}` : ''}`);
      if (r.bad.length) out.push(`${run.w}×${run.h} ${run.label}: ${r.bad.slice(0, 4).join(', ')}${r.bad.length > 4 ? ` +${r.bad.length - 4}` : ''}`);
      // The palette list opens where it can be read to its end, wherever its button is.
      if (run.name === 'gig' && !run.layout) {
        const btn = pg.getByTestId('palette-button');
        if (await btn.count()) {
          await btn.scrollIntoViewIfNeeded();
          await btn.click();
          const menu = await pg.evaluate(() => {
            const m = document.querySelector('[data-testid="palette-menu"]');
            if (!m) return 'did not open';
            const r = m.getBoundingClientRect();
            if (r.top < 0 || r.bottom > innerHeight + 1 || r.left < 0 || r.right > innerWidth + 1) return `${Math.round(r.top)}–${Math.round(r.bottom)} in ${innerHeight}`;
            const last = [...m.querySelectorAll('button')].pop();
            last?.scrollIntoView({ block: 'nearest' });
            const lr = last?.getBoundingClientRect();
            const hit = lr && document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2);
            return last && hit && last.contains(hit) ? null : 'its last palette is out of reach';
          });
          if (menu) out.push(`${run.w}×${run.h} gig: the palette list ${menu}`);
        } else out.push(`${run.w}×${run.h} gig: no Palette button`);
      }
      await ctx.close();
    }
    check('every control in every panel can be reached, docked, in the deck, in a column and floating, at five window sizes',
      out.length === 0 && panelIds.length >= 31 && controlsSeen > 1500,
      out.length ? out.slice(0, 6).join(' | ') : `${runs.length} desks, ${panelsSeen} panels, ${controlsSeen} controls`);
  }

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
