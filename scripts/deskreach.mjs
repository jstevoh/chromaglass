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
 * at its middle is the row's own; each row at least 20 px tall (#699's dense
 * rows are 24), and the Bottles above them still wholly on the screen, so
 * rows squeezed flat or Bottles pushed out are no fix. How the build gets there (the Bottles
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
 *   - the mark is seen, not only boxed: the band shot as drawn and again with
 *     every `data-more-mark` hidden differ in at least 1% of its pixels and
 *     150 of them, so a 1 px or transparent mark, or one under the content,
 *     does not count; the scroller's box is cut to the screen first, so a
 *     mark at an edge that is itself off the screen does not count either;
 *   - halfway along it is still seen, and scrolled to the end in that
 *     direction it is gone (no such element drawn there, or its opacity
 *     under 0.05, and it paints no pixel of the band);
 *   - measured at every size listed where the scroller has more, and at least
 *     one must (a line with no id), so a build that makes the column fit at
 *     1440×900 leaves 1280×700 to measure;
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
 * zoom was. Asked: with the deck scrolled to its start, at 1440×900 every one
 * of the Macro panel's dials (its inputs outside the panel's head, eleven on
 * main) lies wholly on the screen and is what is drawn at its middle (or its
 * knob is), so a folded body or a panel wrapped under the fold cannot pass;
 * and Dyes, Tools and Recipe, wholly on the screen on main, stay so, so
 * Macro is not brought in by pushing the playing panels out. Physics, Squish
 * and Camera may move right, reached through the deck's mark.
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
 * `laptop-link` form, visible). On the website it is absent at 1440×900 and
 * at both iPad sizes, with the desk drawn (a line with no id). The
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
    // A row squeezed under a finger's reach is not "shown": 20 px, where #699's dense rows are 24.
    if (!(q.height >= 20 && q.top >= top - 1 && q.bottom <= bottom + 1)) return false;
    const at = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
    return !!at && e.contains(at);
  });
  // And the Bottles above them still whole: rides bought by pushing the Bottles out are no fix.
  const b = document.querySelector('[data-testid="bench-left"]')?.getBoundingClientRect();
  const bottles = !!b && b.height > 0 && b.top >= 0 && b.bottom <= innerHeight;
  return { rows: rows.length, seen: ids(seen), hidden: ids(rows.filter((e) => !seen.includes(e))), bottles };
});

/**
 * The scroller `testId`'s state in direction `dir` ('below' or 'right'), at
 * its start or (`end`) scrolled to its end: how much lies past the edge, and
 * whether a `data-more-mark` for it is drawn at that edge (the contract in
 * the header).
 */
const markState = (page, testId, dir, at) => page.evaluate(async ({ testId, dir, at }) => {
  const s = document.querySelector(`[data-testid="${testId}"]`);
  if (!s) return null;
  const y = dir === 'below';
  const max = y ? s.scrollHeight - s.clientHeight : s.scrollWidth - s.clientWidth;
  const to = Math.round(max * at);
  if (y) s.scrollTop = to; else s.scrollLeft = to;
  s.dispatchEvent(new Event('scroll'));
  await new Promise((r) => setTimeout(r, 700));
  const past = y ? s.scrollHeight - s.clientHeight - s.scrollTop : s.scrollWidth - s.clientWidth - s.scrollLeft;
  /*
    The scroller's box cut to the screen: a deck wider than the window has its
    own right edge off the screen, and a mark drawn there is seen by no one.
  */
  const o = s.getBoundingClientRect();
  const q = { left: Math.max(0, o.left), top: Math.max(0, o.top), right: Math.min(innerWidth, o.right), bottom: Math.min(innerHeight, o.bottom) };
  const opacity = (e) => { let o = 1; for (let a = e; a && a instanceof Element; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity || '1'); return o; };
  const host = s.parentElement ?? s;
  const marks = [...host.querySelectorAll(`[data-more-mark="${dir}"]`)].map((m) => {
    const r = m.getBoundingClientRect();
    const band = y ? r.bottom > q.bottom - 48 && r.top < q.bottom + 8 && r.right > q.left && r.left < q.right
      : r.right > q.right - 48 && r.left < q.right + 8 && r.bottom > q.top && r.top < q.bottom;
    return { drawn: r.width > 0 && r.height > 0 && band && getComputedStyle(m).visibility === 'visible', opacity: opacity(m) };
  });
  const band = y ? { x: q.left, y: q.bottom - 48, width: q.right - q.left, height: 48 }
    : { x: q.right - 48, y: q.top, width: 48, height: q.bottom - q.top };
  return {
    past: Math.round(past),
    band,
    // This scroller's own marks, not another's: whichever ships first must not count for the other.
    any: marks.length > 0,
    shown: marks.some((m) => m.drawn && m.opacity >= 0.3),
    faint: marks.every((m) => !m.drawn || m.opacity < 0.05),
  };
}, { testId, dir, at });

/**
 * How many pixels of `band` the marks paint: the band shot as drawn and again
 * with every `data-more-mark` hidden, compared in the page. A mark with a box
 * and an opacity that paints nothing (1 px, transparent, under the content)
 * changes no pixel, so the box alone is never taken as the mark.
 */
async function markPixels(page, band) {
  const vp = page.viewportSize();
  const x = Math.max(0, Math.round(band.x)), y = Math.max(0, Math.round(band.y));
  const clip = { x, y, width: Math.min(vp.width, Math.round(band.x + band.width)) - x, height: Math.min(vp.height, Math.round(band.y + band.height)) - y };
  if (clip.width < 1 || clip.height < 1) return { changed: 0, of: 0 };
  const drawn = (await page.screenshot({ clip })).toString('base64');
  const style = await page.addStyleTag({ content: '[data-more-mark]{visibility:hidden !important}' });
  await page.waitForTimeout(100);
  const hidden = (await page.screenshot({ clip })).toString('base64');
  await style.evaluate((n) => n.remove());
  return page.evaluate(async ([a, b]) => {
    const load = async (s) => { const i = new Image(); i.src = `data:image/png;base64,${s}`; await i.decode(); return i; };
    const [ia, ib] = [await load(a), await load(b)];
    const px = (i) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const [da, db] = [px(ia), px(ib)];
    let n = 0;
    for (let k = 0; k < da.length; k += 4) if (Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2])) > 24) n++;
    return { changed: n, of: da.length / 4 };
  }, [drawn, hidden]);
}
/** A mark that is seen: at least 1% of its band, and 150 pixels, painted by it. */
const seenMark = (p) => p.changed >= Math.max(150, 0.01 * p.of);

try {
  // ── rides1280 ──
  {
    const { ctx, page } = await open(1280, 800);
    const r = await ridesSeen(page);
    check('the desk draws the Rides at 1280×800 (what rides1280 measures is there)', !!r && r.rows >= 8, r ? `${r.rows} rows` : 'no Rides on Perform');
    if (r && r.rows >= 8) {
      owedCheck('rides1280', 'at 1280×800 on Perform, every ride shows whole (rows 20 px or more) under the Bottles, which stay whole (35c-6a)',
        r.seen.length === r.rows && r.bottles, `${r.seen.length} of ${r.rows} in view${r.hidden.length ? `; under the fold: ${r.hidden.join(', ')}` : ''}; the Bottles ${r.bottles ? 'whole' : 'not whole on the screen'}`);
    }
    await ctx.close();
  }

  // ── ridemark, deckmark: at the sizes where each scroller has more ──
  for (const [id, testId, dir, sizes] of [
    ['ridemark', 'desk-right', 'below', [[1440, 900], [1280, 700]]],
    ['deckmark', 'desk-deck', 'right', [[1440, 900], [1280, 800]]],
  ]) {
    /*
      Measured at every size where the scroller has more than it shows, and
      at least one must: a build that makes the column fit at 1440×900 (it
      holds 33 px more on main) leaves 1280×700 to measure, rather than
      turning this line red and asking for an edit.
    */
    let measured = 0;
    const item = id === 'ridemark' ? '35c-6a' : '35c-6b';
    for (const [w, h] of sizes) {
      const { ctx, page } = await open(w, h);
      const start = await markState(page, testId, dir, 0);
      if (start && start.past > 8) {
        measured++;
        const p0 = await markPixels(page, start.band);
        const half = await markState(page, testId, dir, 0.5);
        const p5 = await markPixels(page, half.band);
        const end = await markState(page, testId, dir, 1);
        const p1 = await markPixels(page, end.band);
        const at0 = start.shown && seenMark(p0);
        const at5 = half.past <= 8 || (half.shown && seenMark(p5));
        const at1 = end.past <= 8 && end.faint && !seenMark(p1);
        owedCheck(id, `at ${w}×${h}, ${testId} says there is more ${dir}, still says so halfway, and says nothing at its end (${item})`,
          at0 && at5 && at1,
          `${start.past} px past the edge: mark ${at0 ? 'seen' : 'not seen'} (${p0.changed} of ${p0.of} band pixels its own); halfway (${half.past} px left) ${at5 ? 'seen' : 'not seen'}; at the end (${end.past} px left) ${at1 ? 'gone' : 'still seen'}`,
          !start.any && !half.any && !end.any);
      }
      await ctx.close();
    }
    check(`${testId} has more ${dir} than it shows at one size at least (what ${id} measures is there)`, measured > 0,
      `${measured} of ${sizes.length} sizes (${sizes.map(([w, h]) => `${w}×${h}`).join(', ')})`);
  }
  // With nothing past the edge, no mark: holds on main (no marks at all) and after.
  {
    const { ctx, page } = await open(1440, 1400);
    const s = await markState(page, 'desk-right', 'below', 0);
    check('at 1440×1400, with the right column holding everything, it draws no "more below" mark',
      !!s && s.past <= 8 && !s.shown, s ? `${s.past} px past its edge, mark ${s.shown ? 'drawn' : 'not drawn'}` : 'no desk-right');
    await ctx.close();
  }

  // ── macro ──
  {
    const { ctx, page } = await open(1440, 900);
    /*
      The Macro panel's own dials, each wholly on the screen and drawn at its
      middle (not a header with its body folded away, not a panel wrapped
      under the fold), and the panels a player reaches first on main (Dyes,
      Tools, Recipe) still wholly on the screen: Macro brought in by pushing
      the playing panels out is no fix.
    */
    const m = await page.evaluate(() => {
      const deck = document.querySelector('[data-testid="desk-deck"]');
      if (!deck) return null;
      deck.scrollLeft = 0;
      const whole = (r) => r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      const p = deck.querySelector('[data-panel="macro"]');
      if (!p) return { found: false };
      const r = p.getBoundingClientRect();
      const dials = [...p.querySelectorAll('input, select')].filter((e) => !e.closest('[data-panel-head]'));
      const seen = dials.filter((e) => {
        const q = e.getBoundingClientRect();
        if (!whole(q)) return false;
        const at = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        const row = e.closest('[data-knob]') ?? e.parentElement ?? e;
        return !!at && (e.contains(at) || row.contains(at));
      });
      const first = ['dyes', 'tools', 'recipe'].filter((id) => {
        const q = deck.querySelector(`[data-panel="${id}"]`)?.getBoundingClientRect();
        return !q || !whole(q);
      });
      return { found: true, left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, dials: dials.length, seen: seen.length, pushed: first };
    });
    check('Perform\'s deck has the Macro panel and its dials (what macro measures is there)', !!m && m.found && m.dials >= 3, m ? (m.found ? `${m.dials} dials` : 'no Macro panel') : 'no desk-deck');
    if (m && m.found && m.dials >= 3) {
      owedCheck('macro', 'at 1440×900 on Perform, the deck unscrolled, every Macro dial lies wholly on the screen, and Dyes, Tools and Recipe stay on it (35c-6b)',
        m.seen === m.dials && m.pushed.length === 0,
        `Macro at x ${m.left} to ${m.right} of ${m.vw}, ${m.seen} of ${m.dials} dials whole on the screen${m.pushed.length ? `; pushed off: ${m.pushed.join(', ')}` : ''}`);
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
      asks = u.searchParams.get('remote') === '1' && !u.searchParams.has('relay') && (await page.getByTestId('laptop-link').first().isVisible());
    }
    owedCheck('remote', `in the app at ${w}×${h}, the full layout shows Laptop remote without a tap, and with no laptop remembered it asks for one (12 step 4a)`,
      b.found && b.drawn && b.own && asks,
      !b.found ? 'no desk-laptop-remote' : `${b.drawn ? 'drawn' : 'not drawn whole on the screen'}, ${b.own ? 'not painted over' : 'painted over'}${b.drawn && b.own ? `; pressed: ${asks ? 'asks for the laptop' : `did not ask (${where})`}` : ''}`,
      !b.found);
    await ctx.close();
  }
  /*
    On the website there is no Laptop remote on the desk (a page cannot open
    ws:// to a laptop), asked at the app's own sizes too, so a button keyed to
    an iPad's width rather than to the app cannot pass the line above; and
    with the desk drawn, so a page that never loaded cannot pass this one.
  */
  for (const [w, h] of [[1440, 900], [1024, 1366], [1366, 1024]]) {
    const { ctx, page } = await open(w, h);
    const desk = (await page.locator('[data-desk]').count()) > 0;
    const n = await page.getByTestId('desk-laptop-remote').count();
    check(`on the website at ${w}×${h} the desk is drawn with no Laptop remote`, desk && n === 0, `${desk ? 'desk drawn' : 'no desk'}, ${n} found`);
    await ctx.close();
  }
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${owed.size ? ` (owed: ${[...owed].join(', ')})` : ''}`);
process.exit(failed.length ? 1 : 0);
