#!/usr/bin/env node
/**
 * What the desk has that nobody can see: the Rides under the fold at a
 * smaller laptop, a deck whose closeup dials start off the right of the
 * screen, two scrollers that scroll with nothing saying so, and the iPad
 * app's full layout with no way to become the laptop's remote. Written
 * before their builds (PLAN 35c-6a, 35c-6b in docs/plan/35-clear-controls.md,
 * 12 step 4a in docs/plan/12-app-stores.md), 2026-11-08.
 *
 *   npm run deskreach -- --owed=rides1280,ridemark,deckmark,macro,remote
 *
 * Each id's line is printed as owed while main's state holds, and is red the
 * day it passes with its id still listed (the convention of `timers.mjs` and
 * `soundowed.mjs`): the PR that builds an item takes its id out of `--owed`
 * in scripts/checks.json and never edits a line or a bar. A build that is
 * there and misses is red, owed or not. The lines with no id hold on main.
 *
 * Why a script of its own and not more of `layout.mjs`: that file is past
 * 80 KB (CLAUDE.md: new code for a big file goes beside it), and these are
 * owed lines, which `layout` has no convention for. The rides' measure is
 * the one `layout` asks at 1440×900 and 1512×860, asked here at 1280×800.
 *
 * ## rides1280 (35c-6a): every ride shows whole at 1280×800
 *
 * The owner (2026-11-07) could not find Macro Zoom: it was a ride under the
 * fold. #699 made the rows dense enough for all eight at 1440×900 and
 * 1512×860, but at 1280×800 Evolve Speed is still under the fold (7 of 8 on
 * main). Asked as in `layout`: every ride's row lies wholly inside what its
 * scrolling ancestors show, each put back to its top first, and what is drawn
 * at its middle is the row's own. How the build gets there (the Bottles
 * folding to one row when the column is short, or anything else) is its own.
 *
 * ## ridemark (35c-6a) and deckmark (35c-6b): a scroller that has more says so
 *
 * The right column (`desk-right`) and the deck (`desk-deck`) both scroll with
 * their scrollbars hidden (`scrollbar-hide`), so at 1440×900 the column holds
 * 33 px it never shows and the deck 1280 px, and nothing on the screen says
 * either is there. The contract, which the build meets with a fade, an arrow
 * or a label as it likes:
 *
 *   - while a scroller has more than 8 px past its edge in a direction it
 *     scrolls (below for the column, right for the deck), an element with
 *     `data-more-mark="below"` (or `"right"`) is drawn at that edge: inside
 *     the scroller or its parent, its box overlapping the 48 px band inside
 *     that edge and the scroller's span across it, its computed opacity
 *     (through its ancestors) at least 0.3 and its visibility visible;
 *   - scrolled to the end in that direction, that mark is gone (no such
 *     element drawn there, or its opacity under 0.05);
 *   - with nothing past the edge, no mark (a line with no id: on main there
 *     is no mark anywhere, so it holds, and it keeps a build from drawing
 *     the mark always).
 *
 * Why not "the scrollbar shows" as a mark: macOS draws overlay scrollbars
 * that are hidden until something scrolls, so on the Mac the owner plays
 * from, a scrollbar is no mark at all. Headless Chromium on Linux draws a
 * classic one, so a check that took it would pass in CI and mean nothing on
 * the Mac.
 *
 * ## macro (35c-6b): the closeup's own dials start on the screen
 *
 * On Perform at 1440×900 the deck's panels run Dyes, Tools, Recipe, Physics,
 * Squish, Camera, Macro, Patches, and Macro (aim, camera, depth, the
 * closeup's dials) starts at x = 1874, off the screen, as hard to find as its
 * zoom was. Asked: with the deck scrolled to its start, the Macro panel's box
 * lies wholly inside the viewport at 1440×900. Squish and Camera are reached
 * through the deck's mark.
 *
 * ## remote (12 step 4a): the iPad app's full layout can become the remote
 *
 * The phone layout's More has Laptop remote (`phone-laptop-remote`), only in
 * the app. The iPad in the app gets the full layout, which has none, and
 * neither does a phone that took More › Full layout. Asked, in the app
 * (`window.Capacitor.isNativePlatform()`, as `applink` stubs it) at
 * 1024×1366 and 1366×1024: a control `data-testid="desk-laptop-remote"` is
 * drawn without a tap and is not painted over, and pressing it with no
 * laptop remembered asks for one as the phone's does (`?remote=1` and the
 * `laptop-link` form). On the website it is absent (a line with no id). The
 * rest of the remote (the relay, the remembered laptop) is `applink`'s, and
 * the QR code into the app (a `chromaglass://` link) needs Xcode's URL
 * scheme, so it is not asked here.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium, port } from './chromium.mjs';

const PORT = port(4393, 'DESKREACH_PORT');
const URL = `http://localhost:${PORT}/?debug&look=classic&dpr=0.35`;
const IDS = ['rides1280', 'ridemark', 'deckmark', 'macro', 'remote'];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
/** An owed line: excused only while main's state holds (`mainState`), red once it passes. */
const owedCheck = (id, name, ok, detail, mainState = true) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
};

const notes = [];
async function serve() {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview',
    '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  await new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
    proc.stdout.on('data', (d) => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
    proc.stderr.on('data', (d) => { notes.push(String(d).trim()); });
    proc.on('exit', (c) => { clearTimeout(bail); reject(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
  });
  return proc;
}
const server = await serve();
const browser = await launchChromium(chromium, { headless: true });

/** A fresh page at w×h, the app's bridge stubbed when `app`, settled on the desk. */
async function open(w, h, app = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  if (app) await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('[data-desk]', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return { ctx, page };
}

/**
 * The ride rows wholly in view, unscrolled, and not painted over (the measure
 * of `layout`'s "every ride shows whole", which see).
 */
const ridesSeen = (page) => page.evaluate(() => {
  const strip = document.querySelector('[data-testid="rides"]');
  if (!strip) return null;
  const rows = [...strip.querySelectorAll('[data-testid^="ride-"]')].filter((e) => e.getAttribute('data-testid') !== 'ride-pick');
  if (!rows.length) return { rows: 0, seen: [], hidden: [] };
  let top = 0, bottom = innerHeight;
  for (let e = rows[0].parentElement; e; e = e.parentElement) {
    if (getComputedStyle(e).overflowY === 'visible') continue;
    e.scrollTop = 0;
    const q = e.getBoundingClientRect();
    top = Math.max(top, q.top); bottom = Math.min(bottom, q.bottom);
  }
  const ids = (l) => l.map((e) => e.getAttribute('data-testid').slice('ride-'.length));
  const seen = rows.filter((e) => {
    const q = e.getBoundingClientRect();
    if (!(q.height > 0 && q.top >= top - 1 && q.bottom <= bottom + 1)) return false;
    const at = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
    return !!at && e.contains(at);
  });
  return { rows: rows.length, seen: ids(seen), hidden: ids(rows.filter((e) => !seen.includes(e))) };
});

/**
 * The scroller `testId`'s state in direction `dir` ('below' or 'right'), at
 * its start or (`end`) scrolled to its end: how much lies past the edge, and
 * whether a `data-more-mark` for it is drawn at that edge (the contract in
 * the header).
 */
const markState = (page, testId, dir, end) => page.evaluate(async ({ testId, dir, end }) => {
  const s = document.querySelector(`[data-testid="${testId}"]`);
  if (!s) return null;
  const y = dir === 'below';
  if (y) s.scrollTop = end ? s.scrollHeight : 0; else s.scrollLeft = end ? s.scrollWidth : 0;
  s.dispatchEvent(new Event('scroll'));
  await new Promise((r) => setTimeout(r, 700));
  const past = y ? s.scrollHeight - s.clientHeight - s.scrollTop : s.scrollWidth - s.clientWidth - s.scrollLeft;
  const q = s.getBoundingClientRect();
  const opacity = (e) => { let o = 1; for (let a = e; a && a instanceof Element; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity || '1'); return o; };
  const host = s.parentElement ?? s;
  const marks = [...host.querySelectorAll(`[data-more-mark="${dir}"]`)].map((m) => {
    const r = m.getBoundingClientRect();
    const band = y ? r.bottom > q.bottom - 48 && r.top < q.bottom + 8 && r.right > q.left && r.left < q.right
      : r.right > q.right - 48 && r.left < q.right + 8 && r.bottom > q.top && r.top < q.bottom;
    return { drawn: r.width > 0 && r.height > 0 && band && getComputedStyle(m).visibility === 'visible', opacity: opacity(m) };
  });
  return {
    past: Math.round(past),
    any: document.querySelectorAll('[data-more-mark]').length > 0,
    shown: marks.some((m) => m.drawn && m.opacity >= 0.3),
    faint: marks.every((m) => !m.drawn || m.opacity < 0.05),
  };
}, { testId, dir, end });

try {
  // ── rides1280 ──
  {
    const { ctx, page } = await open(1280, 800);
    const r = await ridesSeen(page);
    check('the desk draws the Rides at 1280×800 (what rides1280 measures is there)', !!r && r.rows >= 8, r ? `${r.rows} rows` : 'no Rides on Perform');
    if (r && r.rows >= 8) {
      owedCheck('rides1280', 'at 1280×800 on Perform, every ride shows whole under the Bottles (35c-6a)',
        r.seen.length === r.rows, `${r.seen.length} of ${r.rows} in view${r.hidden.length ? `; under the fold: ${r.hidden.join(', ')}` : ''}`);
    }
    await ctx.close();
  }

  // ── ridemark, deckmark: at the sizes where each scroller has more ──
  for (const [id, testId, dir, sizes] of [
    ['ridemark', 'desk-right', 'below', [[1440, 900], [1280, 700]]],
    ['deckmark', 'desk-deck', 'right', [[1440, 900], [1280, 800]]],
  ]) {
    for (const [w, h] of sizes) {
      const { ctx, page } = await open(w, h);
      const start = await markState(page, testId, dir, false);
      check(`at ${w}×${h} the ${testId} scroller has more ${dir} than it shows (what ${id} measures is there)`, !!start && start.past > 8,
        start ? `${start.past} px past its edge` : `no ${testId}`);
      if (start && start.past > 8) {
        const endState = await markState(page, testId, dir, true);
        const ok = start.shown && endState.past <= 8 && endState.faint;
        owedCheck(id, `at ${w}×${h}, ${testId} says there is more ${dir}, and says nothing once scrolled to its end (${id === 'ridemark' ? '35c-6a' : '35c-6b'})`,
          ok, `${start.past} px past the edge: mark ${start.shown ? 'drawn' : 'not drawn'}; scrolled to the end (${endState.past} px left): mark ${endState.faint ? 'gone' : 'still drawn'}`,
          !start.any && !endState.any);
      }
      await ctx.close();
    }
  }
  // With nothing past the edge, no mark: holds on main (no marks at all) and after.
  {
    const { ctx, page } = await open(1440, 1400);
    const s = await markState(page, 'desk-right', 'below', false);
    check('at 1440×1400, with the right column holding everything, it draws no "more below" mark',
      !!s && s.past <= 8 && !s.shown, s ? `${s.past} px past its edge, mark ${s.shown ? 'drawn' : 'not drawn'}` : 'no desk-right');
    await ctx.close();
  }

  // ── macro ──
  {
    const { ctx, page } = await open(1440, 900);
    const m = await page.evaluate(() => {
      const deck = document.querySelector('[data-testid="desk-deck"]');
      if (!deck) return null;
      deck.scrollLeft = 0;
      const p = deck.querySelector('[data-panel="macro"]');
      if (!p) return { found: false };
      const r = p.getBoundingClientRect();
      return { found: true, left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth };
    });
    check('Perform\'s deck has the Macro panel (what macro measures is there)', !!m && m.found, m ? '' : 'no desk-deck');
    if (m && m.found) {
      owedCheck('macro', 'at 1440×900 on Perform, the deck unscrolled, the Macro panel lies wholly on the screen (35c-6b)',
        m.left >= 0 && m.right <= m.vw, `Macro at x ${m.left} to ${m.right} of ${m.vw}`);
    }
    await ctx.close();
  }

  // ── remote ──
  for (const [w, h] of [[1024, 1366], [1366, 1024]]) {
    const { ctx, page } = await open(w, h, true);
    const desk = await page.evaluate(() => !!document.querySelector('[data-desk]'));
    check(`in the app at ${w}×${h} the full layout is drawn (what remote measures is there)`, desk);
    const b = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="desk-laptop-remote"]');
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      const at = r.width > 0 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      return { found: true, drawn: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, own: !!at && el.contains(at) };
    });
    let asks = false, where = '';
    if (b.found && b.drawn && b.own) {
      await page.getByTestId('desk-laptop-remote').click();
      await page.waitForURL((u) => u.search.includes('remote=1'), { timeout: 8000 }).catch(() => {});
      await page.waitForSelector('[data-testid="laptop-link"]', { timeout: 8000 }).catch(() => {});
      const u = new globalThis.URL(page.url());
      where = u.search;
      asks = u.searchParams.get('remote') === '1' && !u.searchParams.has('relay') && (await page.getByTestId('laptop-link').count()) > 0;
    }
    owedCheck('remote', `in the app at ${w}×${h}, the full layout shows Laptop remote without a tap, and with no laptop remembered it asks for one (12 step 4a)`,
      b.found && b.drawn && b.own && asks,
      !b.found ? 'no desk-laptop-remote' : `${b.drawn ? 'drawn' : 'not drawn whole on the screen'}, ${b.own ? 'not painted over' : 'painted over'}${b.drawn && b.own ? `; pressed: ${asks ? 'asks for the laptop' : `did not ask (${where})`}` : ''}`,
      !b.found);
    await ctx.close();
  }
  // On the website there is no Laptop remote on the desk: a page cannot open ws:// to a laptop.
  {
    const { ctx, page } = await open(1440, 900);
    const n = await page.getByTestId('desk-laptop-remote').count();
    check('on the website the desk has no Laptop remote', n === 0, `${n} found`);
    await ctx.close();
  }
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${owed.size ? ` (owed: ${[...owed].join(', ')})` : ''}`);
process.exit(failed.length ? 1 : 0);
