#!/usr/bin/env node
/**
 * The looks browser (PLAN 34b), written as lines before it is built.
 *
 *   npm run build && npm run looksgrid                 # about a minute, software WebGPU
 *   npm run looksgrid -- --owed=stills,preview         # as the browser shard runs it while owed
 *   npm run looksgrid -- --budget --owed=budget        # the Mac's line (tools shard): a real GPU
 *
 * PLAN 34b asks for a grid of every shipped look, picked before the desk is
 * opened, in two steps: a still of each look's plate on every card (34b-1),
 * then the hovered card alone playing that look small (34b-2), without the
 * show's plate paying for it. The build is Antigravity's (the split of
 * 2026-11-01), so it gets a line that fails on main today and cannot pass by
 * reading its own work. This is the contract. Three ids:
 *
 *   stills   34b-1. Three surfaces draw the grid, each card of every look
 *            in `PRESETS` with its still:
 *              the Perform desk (1440 wide): a control `looks-grid-open` on
 *                the desk opens `looks-grid`, a card `looks-grid-<id>` a look.
 *                The desk has no look menu today (`PresetMenu` is the narrow
 *                window's), so this is where a person at the desk browses;
 *                where the control sits is the build's;
 *              the narrow laptop window (900 wide, under the desks' 1024):
 *                `PresetMenu` (`preset-menu` from `preset-title-button`), its
 *                cards `preset-menu-<id>`;
 *              the phone (390 x 844): the Looks sheet (`phone-sheet-looks`
 *                from `phone-open-looks`), its cards `phone-look-<id>`.
 *            The card is the test id's element, or its parent when that holds
 *            no other card (never the grid or the list itself). Each card
 *            draws one `<img>` with `loading="lazy"`, loaded and shown inside
 *            the card's box once scrolled to, and all three draw the same
 *            file for the same look (one lib function builds the list and the
 *            path, so they cannot drift). Each file is in the built site
 *            (served from `public/`, not a data URL in source: `npm run
 *            sizes`), is a WebP, is at most STILL_MAX_BYTES, and its longest
 *            side is STILL_SIDE px. Decoded in the page: no still is flat
 *            (luminance spread over STILL_MIN_SPREAD of 255 at 32 x 32) and no
 *            two are the same picture (every pair differs by more than
 *            STILL_MIN_APART of 255 on average per channel at 32 x 32). That is
 *            as close as a line gets to "the plate itself, not stock art": one
 *            grey card or one placeholder for all fails, a real render of each
 *            look passes, and whether each is that look's plate is the
 *            reviewer's eye.
 *   preview  34b-2, on the Perform desk's grid and the phone's sheet. With
 *            the grid open and nothing hovered there is no canvas in it (the
 *            grid never renders a plate to draw a card). Hovering a card puts
 *            exactly one canvas in the grid, inside that card; hovering
 *            another moves the one canvas there (none left in the first), so
 *            there is never a second; leaving the cards (the pointer to a
 *            corner outside the grid) takes it away within LEAVE_MS, from the
 *            page and not only the grid (stopped and unmounted, not paused
 *            behind the card or moved elsewhere). On the phone a finger
 *            held on a card does the same, and lifting it leaves none in the
 *            sheet (whether the lift also picks the look is the build's, said
 *            in its PR). Read with no WebGPU (below), so the canvas is mounted
 *            on hover whether or not the browser can draw into it: a build
 *            that mounts it only once a GPU device is in hand fails here.
 *   budget   34b-2, the Mac's (`--budget`, tools shard). The hovered card's
 *            canvas plays (two pictures of it, read from the screen, differ
 *            within PLAYS_WITHIN_MS), and the show's plate (`fluids[0]` of
 *            `chromaglassDebug`) keeps its rate meanwhile: its steps over
 *            BUDGET_WINDOW_MS with the card hovered are at least BUDGET_SHARE
 *            of the lower of two windows with the grid shut, one before and
 *            one after. The preview is the real plate, not a picture that
 *            moves: `chromaglassDebug().preview` reports `{ id, stepCount }`
 *            of the solver drawing it (in the debug hook, `?debug` only), its
 *            id the hovered look's and its steps rising across the window. The
 *            card is still hovered and playing when the window ends, and Escape
 *            shuts the grid before the second shut window. Only on a real
 *            GPU: SwiftShader steps the plate about 0.4 times a second on the
 *            page's own thread, so a window would
 *            hold two or three steps, the preview would get no frames to play,
 *            and the CPU it took there is not the GPU time it takes on a Mac.
 *            BUDGET_SHARE is not yet measured on the Mac (main has no preview
 *            to measure): the first run on the Mac prints the three rates.
 *
 * Not asked here: no preview while a show is live on the wall (34b's
 * "none while a show is live"), which needs a cast or a mirror window open
 * and is read by the reviewer in the build's source; a still kept in a
 * user's own preset file on Save Look, which is PLAN 08's item and its own
 * line; each card naming its reaction in words, which waits for 34g; and a
 * user's own looks on the grid, which have no shipped still.
 *
 * Owed lines (as clearleft.mjs and soapbreak.mjs hold them): an id in
 * `--owed=` (scripts/checks.json) prints owed while its line fails in main's
 * state (no still on any card; no canvas on any hover); it is red once it
 * passes while still listed (take the id out), and red if what it is owed
 * for has been built and misses. The build's PR takes its id out of `--owed`
 * and never edits a line, a bar or this header.
 *
 * Reads the built site in dist/ (`npm run build` first; the browser shard has
 * built it) and serves it itself on a free port. `stills` and `preview` run
 * headless with no WebGPU, `--budget` on the GPU it is given.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { PRESETS } from '../src/presets.ts';

/** A still of a card: a few KB at about 240 px (the brief). The cap leaves room for a busy plate at that size. */
const STILL_MAX_BYTES = 20_000;
const STILL_SIDE = [160, 320];
/**
 * Luminance standard deviation, of 255, at 32 x 32. A flat card is under 2;
 * the eight looks' renders the landing page carries (public/landing/looks/)
 * measure 38 to 91, so 20 passes a real plate and refuses a soft placeholder.
 */
const STILL_MIN_SPREAD = 20;
/** Mean per-channel difference, of 255, at 32 x 32, between any two stills: the same file twice is 0, the landing's closest two renders 62.5. */
const STILL_MIN_APART = 20;
const PLAYS_WITHIN_MS = 15_000;
const LEAVE_MS = 1_500;
const BUDGET_WINDOW_MS = 6_000;
const BUDGET_SHARE = 0.95;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const BUDGET = process.argv.includes('--budget');
const OWED_IDS = BUDGET ? ['budget'] : ['stills', 'preview'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
for (const id of owed) if (!OWED_IDS.includes(id)) check(`every id in --owed is a line of looksgrid.mjs${BUDGET ? ' --budget' : ''}`, false, `unknown "${id}" (known here: ${OWED_IDS.join(', ')})`);
/*
  The grid's lines run with no WebGPU, whatever the environment asks: a
  software plate takes two to fifteen seconds a frame on the page's own
  thread (scripts/frame.mjs, `engineQuery`), and in the first runs of this
  check Playwright's hover waited five seconds for two animation frames that
  never came. With no WebGPU the desk, the menu and the sheet draw as they do
  on a Mac and the page answers at once; the plate shows its "needs WebGPU"
  card behind them. Read before chromium.mjs is loaded, which reads it once.
*/
if (!BUDGET) delete process.env.PW_WEBGPU;
const { launchChromium } = await import('./chromium.mjs');
const { stepsNow, waitForEngine } = await import('./frame.mjs');
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
};

const DIST = resolve(process.env.LOOKSGRID_DIST ?? 'dist');
if (!existsSync(join(DIST, 'index.html'))) {
  console.log(' FAIL the built site is in dist/ — run `npm run build` first');
  process.exit(1);
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(DIST, path);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchChromium(chromium, BUDGET ? {} : { headless: true });

const IDS = PRESETS.map((p) => p.id);
// Two cards to hover, neither the look the page opens on (a preview of the
// look already on the plate would be the one case a build might skip).
const [A, B] = IDS.filter((id) => id !== 'classic');

/**
 * What a surface draws for each look: the card's still (src as a path, its
 * `loading`), read inside `root`. The card is the test id's element or its
 * parent, so a build may hang the picture beside the button rather than in it.
 */
const cardsIn = (page, root, prefix) => page.evaluate(([root, prefix, ids]) => {
  const scope = document.querySelector(`[data-testid="${root}"]`);
  if (!scope) return null;
  // A look's card: its test id's element, or that element's parent when the
  // parent holds no other card (the desk menu's row holds the button and its
  // Load). Never a parent that is the grid or a list of cards, or "inside the
  // card" would mean "anywhere in the grid" (the skeptic's pass, 2026-11-08).
  const cardOf = (el) => {
    const up = el?.parentElement;
    return up && up !== scope && up.querySelectorAll(`[data-testid^="${prefix}"]`).length === 1 ? up : el;
  };
  return ids.map((id) => {
    const el = scope.querySelector(`[data-testid="${prefix}${id}"]`);
    const card = el ? cardOf(el) : null;
    const imgs = card ? [...card.querySelectorAll('img')] : [];
    const img = imgs[0];
    // Drawn, not only named: loaded, and a box of its own inside the card's, shown.
    const r = img?.getBoundingClientRect(), c = card?.getBoundingClientRect();
    const shown = !!img && img.complete && img.naturalWidth > 0 && r.width >= 8 && r.height >= 8 && !!img.offsetParent && getComputedStyle(img).visibility !== 'hidden' && getComputedStyle(img).opacity !== '0' &&
      r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
    return { id, card: !!el, imgs: imgs.length, src: img ? new URL(img.currentSrc || img.src, location.href).pathname : null, lazy: img?.getAttribute('loading') === 'lazy', shown };
  });
}, [root, prefix, IDS]);

/**
 * Canvases inside `root`, how many are inside the card of `id` (and of
 * `other`), and how many the whole page holds: a preview moved out of the
 * grid, or left running after a sheet closes, is still a canvas in the page.
 */
const canvasesIn = (page, root, prefix, id, other = null) => page.evaluate(([root, prefix, id, other]) => {
  const page = document.querySelectorAll('canvas').length;
  const scope = document.querySelector(`[data-testid="${root}"]`);
  if (!scope) return { count: 0, inCard: 0, inOther: 0, open: false, page };
  // A look's card: its test id's element, or that element's parent when the
  // parent holds no other card (the desk menu's row holds the button and its
  // Load). Never a parent that is the grid or a list of cards, or "inside the
  // card" would mean "anywhere in the grid" (the skeptic's pass, 2026-11-08).
  const cardOf = (el) => {
    const up = el?.parentElement;
    return up && up !== scope && up.querySelectorAll(`[data-testid^="${prefix}"]`).length === 1 ? up : el;
  };
  const of = (x) => { const el = x ? scope.querySelector(`[data-testid="${prefix}${x}"]`) : null; return el ? cardOf(el) : null; };
  const card = of(id), was = of(other);
  const all = [...scope.querySelectorAll('canvas')];
  return { count: all.length, inCard: card ? all.filter((c) => card.contains(c)).length : 0, inOther: was ? all.filter((c) => was.contains(c)).length : 0, open: true, page };
}, [root, prefix, id, other]);

/** A point in the viewport outside the grid's box (a corner), for leaving every card. */
const outside = (page, root) => page.evaluate((root) => {
  const g = document.querySelector(`[data-testid="${root}"]`)?.getBoundingClientRect();
  const w = innerWidth, h = innerHeight;
  const pts = [[4, h - 4], [w - 4, h - 4], [4, 4], [w - 4, 4], [w / 2, h - 4], [4, h / 2], [w - 4, h / 2]];
  return pts.find(([x, y]) => !g || x < g.left || x > g.right || y < g.top || y > g.bottom) ?? null;
}, root);

async function waitCanvas(page, root, prefix, id, ms) {
  const by = Date.now() + ms;
  let c = await canvasesIn(page, root, prefix, id);
  while (c.count === 0 && Date.now() < by) { await page.waitForTimeout(150); c = await canvasesIn(page, root, prefix, id); }
  return c;
}

/** Does the canvas in `root` play: two screen reads of it differ within `ms`? */
async function plays(page, root, ms) {
  const canvas = page.locator(`[data-testid="${root}"] canvas`).first();
  const first = await canvas.screenshot({ timeout: 5_000 }).catch(() => null);
  if (!first) return false;
  const by = Date.now() + ms;
  while (Date.now() < by) {
    await page.waitForTimeout(500);
    const next = await canvas.screenshot({ timeout: 5_000 }).catch(() => null);
    if (!next) return false;
    if (!next.equals(first)) return true;
  }
  return false;
}

/** The first bytes of a WebP: RIFF....WEBP, and its size from whichever chunk it has. */
function webpSize(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  return null;
}

/** Each still decoded at 32 x 32 in the page: its luminance spread, and its pixels for the pairwise read. */
const decode = (page, srcs) => page.evaluate(async (srcs) => {
  const out = {};
  for (const src of srcs) {
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 32, 32);
      const d = g.getImageData(0, 0, 32, 32).data;
      const lum = [];
      for (let i = 0; i < d.length; i += 4) lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
      const spread = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
      out[src] = { spread, px: [...d].filter((_, i) => i % 4 !== 3) };
    } catch { out[src] = null; }
  }
  return out;
}, srcs);

/**
 * The three surfaces of `stills`: how each is opened, the grid's test id and
 * its cards' prefix. The Perform desk's is first: `preview` and `budget` hover
 * its cards, the desk being where a show is played from.
 */
const SURFACES = [
  { name: 'the Perform desk', w: 1440, h: 900, touch: false, opener: 'looks-grid-open', root: 'looks-grid', prefix: 'looks-grid-' },
  { name: 'the narrow window', w: 900, h: 800, touch: false, opener: 'preset-title-button', root: 'preset-menu', prefix: 'preset-menu-' },
  { name: 'the phone', w: 390, h: 844, touch: true, opener: 'phone-open-looks', root: 'phone-sheet-looks', prefix: 'phone-look-' },
];

/** Open a surface's page and its grid; `grid` is false when its opener or grid is not there (main's state for the desk). */
async function openSurface(sf, query) {
  const ctx = await browser.newContext({ viewport: { width: sf.w, height: sf.h }, isMobile: sf.touch, hasTouch: sf.touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`${base}/?${query}`, { waitUntil: 'load' });
  // The app is up when the surface's own frame is: the desk, the overlay's title, the phone's stage.
  const up = sf.touch ? 'phone-open-looks' : sf.w >= 1024 ? 'perform-desk' : 'preset-title-button';
  for (let i = 0; i < 240 && !(await page.getByTestId(up).count()); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(800);
  const opener = page.getByTestId(sf.opener).first();
  const hasOpener = (await opener.count()) > 0;
  // Pressed up to three times: a press in the page's first second can land before its handler.
  let grid = false;
  for (let i = 0; hasOpener && !grid && i < 3; i++) {
    await (sf.touch ? opener.tap({ timeout: 5_000 }) : opener.click({ timeout: 5_000 })).catch(() => {});
    grid = await page.getByTestId(sf.root).first().waitFor({ timeout: 4_000 }).then(() => true, () => false);
  }
  return { ctx, page, grid, hasOpener };
}

try {
  if (BUDGET) {
    // ── budget (34b-2, the Mac's) ─────────────────────────────────────────
    const sf = SURFACES[0];
    const ctx = await browser.newContext({ viewport: { width: sf.w, height: sf.h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(`${base}/?debug&look=classic&play=0`, { waitUntil: 'load' });
    const software = !!process.env.PW_WEBGPU || await page.evaluate(async () => {
      const a = await navigator.gpu?.requestAdapter?.();
      const info = a?.info ?? (await a?.requestAdapterInfo?.());
      return !a || /swiftshader/i.test(`${info?.vendor} ${info?.architecture} ${info?.description} ${info?.device}`);
    }).catch(() => true);
    if (software) {
      check('the budget line has a real GPU to measure on', false, 'software or no WebGPU: run it on the Mac (tools shard), not here');
    } else {
      await waitForEngine(page);
      /*
        Stepping before the first window, and settled. The first run on a
        GitHub Mac (PR #713, main's state) read "steps shut 0.0/s, with the
        preview 28.5/s, shut again 27.8/s": `waitForEngine` waits only in
        software, the plate had not taken a step in its first six seconds,
        and the lower shut window, 0, would have failed a correct build. So:
        two seconds in a row with steps, then three more to settle.
      */
      for (let i = 0, run = 0; i < 120 && run < 2; i++) {
        const a = await stepsNow(page);
        await page.waitForTimeout(1_000);
        const b = await stepsNow(page);
        run = a !== null && b !== null && b > a ? run + 1 : 0;
      }
      await page.waitForTimeout(3_000);
      const rate = async () => { const a = await stepsNow(page); await page.waitForTimeout(BUDGET_WINDOW_MS); const b = await stepsNow(page); return a === null || b === null ? null : (b - a) / (BUDGET_WINDOW_MS / 1000); };
      const before = await rate();
      await page.getByTestId(sf.opener).first().click({ timeout: 5_000 }).catch(() => {});
      await page.getByTestId(`${sf.prefix}${A}`).first().hover({ timeout: 5_000 }).catch(() => {});
      const c = await waitCanvas(page, sf.root, sf.prefix, A, 6_000);
      const live = c.count === 1 && await plays(page, sf.root, PLAYS_WITHIN_MS);
      // The preview's own solver, from the hook the build adds (see the header).
      const pv = () => page.evaluate(() => { const v = window.chromaglassDebug?.()?.preview; return v ? { id: v.id, steps: v.stepCount } : null; }).catch(() => null);
      const pv0 = await pv();
      const during = await rate();
      const pv1 = await pv();
      // Still hovered and still playing at the end of the window: a hover lost
      // to a scroll, or a preview that ran one burst, would have let the plate
      // be measured with nothing running.
      const still = await canvasesIn(page, sf.root, sf.prefix, A);
      const stillLive = still.count === 1 && still.inCard === 1 && await plays(page, sf.root, PLAYS_WITHIN_MS);
      const solver = !!pv0 && !!pv1 && pv0.id === A && pv1.id === A && pv1.steps > pv0.steps;
      await page.keyboard.press('Escape');
      const at = await outside(page, sf.root);
      if (at) await page.mouse.move(at[0], at[1]);
      await page.waitForTimeout(1_000);
      const shutAgain = (await page.getByTestId(sf.root).count()) === 0;
      const after = shutAgain ? await rate() : null;
      const shut = before === null || after === null ? null : Math.min(before, after);
      const f = (r) => (r === null ? 'none' : `${r.toFixed(1)}/s`);
      line('budget', `a hovered card's preview plays, and the show's plate keeps its step rate meanwhile: at least ${BUDGET_SHARE} of its rate with the grid shut (34b-2)`,
        live && stillLive && solver && shutAgain && shut !== null && during !== null && shut > 0 && during >= BUDGET_SHARE * shut,
        `preview ${c.count === 0 ? 'none on hover' : live ? 'playing' : `${c.count} canvas, not playing`}${c.count ? `, ${stillLive ? 'still playing' : 'not playing'} after the window, its solver ${pv1 ? `"${pv1.id}" ${pv0?.steps ?? '?'} → ${pv1.steps} steps` : 'not reported (chromaglassDebug().preview)'}` : ''}; Escape ${shutAgain ? 'shut' : 'did not shut'} the grid; steps shut ${f(before)}, with the preview ${f(during)}, shut again ${f(after)}${shut ? ` (${(100 * (during ?? 0) / shut).toFixed(0)}% of the lower)` : ''}`,
        c.count === 0);
    }
    await ctx.close();
  } else {
    const query = 'debug&look=classic&dpr=0.35&play=0';
    const opened = [];
    for (const sf of SURFACES) {
      const o = await openSurface(sf, query);
      const cards = o.grid ? (await cardsIn(o.page, sf.root, sf.prefix)) ?? [] : [];
      // Bring each still into view, so a lazy one loads.
      for (const c of cards.filter((c) => c.src)) {
        await o.page.getByTestId(`${sf.prefix}${c.id}`).first().scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
        await o.page.waitForTimeout(60);
      }
      await o.page.waitForTimeout(500);
      // Read again, each card scrolled to and back in view one at a time: `shown` is of a loaded still where it is drawn.
      const read = [];
      for (const c of cards) {
        if (c.src) {
          await o.page.getByTestId(`${sf.prefix}${c.id}`).first().scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
          let got = c;
          for (let t = 0; t < 20; t++) {
            got = (await cardsIn(o.page, sf.root, sf.prefix))?.find((x) => x.id === c.id) ?? c;
            if (got.shown) break;
            await o.page.waitForTimeout(150);
          }
          read.push(got);
        } else read.push(c);
      }
      opened.push({ sf, ...o, cards: read });
    }
    const [desk, , phone] = opened;

    // ── stills (34b-1) ─────────────────────────────────────────────────────
    {
      const all = opened.flatMap((o) => o.cards);
      const srcs = [...new Set(all.map((c) => c.src).filter(Boolean))];
      const pics = srcs.length ? await decode(desk.page, srcs) : {};
      const files = Object.fromEntries(srcs.map((src) => {
        const file = join(DIST, src);
        if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) return [src, null];
        const buf = readFileSync(file);
        return [src, { bytes: buf.length, size: webpSize(buf) }];
      }));
      const list = (xs) => (xs.length > 4 ? `${xs.slice(0, 4).join(', ')} and ${xs.length - 4} more` : xs.join(', '));
      const misses = [];
      // Each surface: a card and one lazy still for every look.
      for (const o of opened) {
        const by = Object.fromEntries(o.cards.map((c) => [c.id, c]));
        if (!o.grid) { misses.push(`${o.sf.name}: ${o.hasOpener ? `${o.sf.opener} opens no ${o.sf.root}` : `no ${o.sf.opener}`}`); continue; }
        const noCard = IDS.filter((id) => !by[id]?.card);
        const noStill = IDS.filter((id) => by[id]?.card && !by[id].src);
        const notOne = o.cards.filter((c) => c.imgs > 1).map((c) => c.id);
        const eager = o.cards.filter((c) => c.src && !c.lazy).map((c) => c.id);
        const unshown = o.cards.filter((c) => c.src && !c.shown).map((c) => c.id);
        if (unshown.length) misses.push(`${o.sf.name}: a still not drawn on its card (not loaded, hidden, or outside it): ${list(unshown)}`);
        if (noCard.length) misses.push(`${o.sf.name}: no card for ${list(noCard)}`);
        if (noStill.length) misses.push(`${o.sf.name}: no still on ${noStill.length} of ${IDS.length} cards (${list(noStill)})`);
        if (notOne.length) misses.push(`${o.sf.name}: more than one picture on ${list(notOne)}`);
        if (eager.length) misses.push(`${o.sf.name}: not lazy: ${list(eager)}`);
      }
      // The same file for the same look everywhere, and one file per look.
      const fileOf = {};
      for (const c of all) if (c.src) (fileOf[c.id] ??= new Set()).add(c.src);
      const drift = Object.entries(fileOf).filter(([, v]) => v.size > 1).map(([id]) => id);
      if (drift.length) misses.push(`another file for the same look on another surface: ${list(drift)}`);
      const owners = {};
      for (const [id, v] of Object.entries(fileOf)) for (const src of v) (owners[src] ??= new Set()).add(id);
      const sharedFiles = Object.entries(owners).filter(([, v]) => v.size > 1).map(([src, v]) => `${src} for ${v.size} looks`);
      if (sharedFiles.length) misses.push(`one file for several looks: ${list(sharedFiles)}`);
      // The files themselves.
      const unserved = srcs.filter((s) => !files[s]);
      const notWebp = srcs.filter((s) => files[s] && !files[s].size);
      const heavy = srcs.filter((s) => files[s]?.bytes > STILL_MAX_BYTES).map((s) => `${s} ${files[s].bytes}`);
      const sized = srcs.filter((s) => files[s]?.size).map((s) => [s, Math.max(...files[s].size)]);
      const offSize = sized.filter(([, n]) => n < STILL_SIDE[0] || n > STILL_SIDE[1]).map(([s, n]) => `${s} ${n} px`);
      const undecoded = srcs.filter((s) => !pics[s]);
      const flat = srcs.filter((s) => pics[s] && pics[s].spread < STILL_MIN_SPREAD).map((s) => `${s} ${pics[s].spread.toFixed(1)}`);
      const near = [];
      let closest = Infinity;
      const ok = srcs.filter((s) => pics[s]);
      for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
        const a = pics[ok[i]].px, b = pics[ok[j]].px;
        let d = 0;
        for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - b[k]);
        closest = Math.min(closest, d / a.length);
        if (d / a.length <= STILL_MIN_APART) near.push(`${ok[i]} ~ ${ok[j]} ${(d / a.length).toFixed(1)}`);
      }
      for (const [bad, say] of [
        [unserved.length, `not in the built site: ${list(unserved)}`],
        [notWebp.length, `not WebP: ${list(notWebp)}`],
        [heavy.length, `over ${STILL_MAX_BYTES} bytes: ${list(heavy)}`],
        [offSize.length, `longest side outside ${STILL_SIDE.join('–')} px: ${list(offSize)}`],
        [undecoded.length, `would not decode: ${list(undecoded)}`],
        [flat.length, `flat (luminance spread under ${STILL_MIN_SPREAD}): ${list(flat)}`],
        [near.length, `the same picture (${STILL_MIN_APART} or less apart): ${list(near)}`],
      ]) if (bad) misses.push(say);
      const sizes = sized.map(([, n]) => n);
      const bytes = srcs.map((s) => files[s]?.bytes).filter(Boolean);
      // Main's state: the narrow menu and the phone sheet open with a card per look and no still on any; the desk has no grid.
      const mainState = opened.slice(1).every((o) => o.grid && o.cards.filter((c) => c.card).length === IDS.length) && !srcs.length;
      line('stills', `every shipped look's card shows a still of its plate, lazy, a small WebP, the same on the desk, the narrow window and the phone (34b-1)`,
        misses.length === 0,
        misses.length ? misses.join('; ') : `${srcs.length} looks on 3 surfaces, ${Math.min(...sizes)}–${Math.max(...sizes)} px, ${Math.min(...bytes)}–${Math.max(...bytes)} bytes, the closest two ${closest.toFixed(1)} apart`,
        mainState);
    }

    // ── preview (34b-2) ────────────────────────────────────────────────────
    {
      const sf = desk.sf;
      const p = desk.page;
      const none = { count: 0, inCard: 0, inOther: 0, open: false, page: 0 };
      let idle = none, onA = none, onB = none, left = none;
      const leave = async () => { const at = await outside(p, sf.root); if (at) await p.mouse.move(at[0], at[1]); };
      if (desk.grid) {
        await p.getByTestId(`${sf.prefix}${A}`).first().scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
        await leave();
        await p.waitForTimeout(600);
        idle = await canvasesIn(p, sf.root, sf.prefix, null);
        await p.getByTestId(`${sf.prefix}${A}`).first().hover({ timeout: 5_000 }).catch(() => {});
        onA = await waitCanvas(p, sf.root, sf.prefix, A, 6_000);
        await p.getByTestId(`${sf.prefix}${B}`).first().scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
        await p.getByTestId(`${sf.prefix}${B}`).first().hover({ timeout: 5_000 }).catch(() => {});
        await p.waitForTimeout(1_500);
        onB = await canvasesIn(p, sf.root, sf.prefix, B, A);
        await leave();
        await p.waitForTimeout(LEAVE_MS);
        left = await canvasesIn(p, sf.root, sf.prefix, null);
      }

      const q = phone.page;
      // The stills' read scrolled the sheet to its last card: bring the held one back under the finger.
      if (phone.grid) {
        await q.getByTestId(`${phone.sf.prefix}${A}`).first().scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
        await q.waitForTimeout(300);
      }
      const box = phone.grid ? await q.getByTestId(`${phone.sf.prefix}${A}`).first().boundingBox().catch(() => null) : null;
      let before = none, held = none, lifted = none;
      if (box) {
        before = await canvasesIn(q, phone.sf.root, phone.sf.prefix, null);
        const cdp = await q.context().newCDPSession(q);
        const at = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at });
        held = await waitCanvas(q, phone.sf.root, phone.sf.prefix, A, 6_000);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await q.waitForTimeout(LEAVE_MS);
        lifted = await canvasesIn(q, phone.sf.root, phone.sf.prefix, null);
      }
      const say = (c) => `${c.count} canvas${c.count === 1 ? '' : 'es'}${c.count ? `, ${c.inCard} in the card` : ''}`;
      // Gone means gone from the page, not only from the grid: the page's canvases are back to the count with nothing hovered.
      const okDesk = desk.grid && idle.count === 0 && onA.count === 1 && onA.inCard === 1 && onB.count === 1 && onB.inCard === 1 && onB.inOther === 0 && left.count === 0 && left.page === idle.page;
      const okPhone = !!box && before.count === 0 && held.count === 1 && held.inCard === 1 && lifted.count === 0 && lifted.page === before.page;
      line('preview', 'only the hovered (desk) or held (phone) card holds a preview, one at a time, and none once it is left (34b-2)',
        okDesk && okPhone,
        `desk: ${desk.grid ? `idle ${say(idle)} (${idle.page} in the page); ${A} hovered ${say(onA)}; then ${B} ${say(onB)}, ${onB.inOther} left in ${A}'s; left ${say(left)} (${left.page} in the page)` : 'no looks grid'}. Phone: ${box ? `${A} held ${say(held)}; lifted ${say(lifted)} (${lifted.page} in the page, ${before.page} before)` : `no card ${A} in the Looks sheet`}`,
        onA.count === 0 && onB.count === 0 && held.count === 0);
    }
    console.log(' --   budget: that the preview plays, and the plate\'s step rate meanwhile, are the Mac\'s line (`--budget`, tools shard)');
    for (const o of opened) await o.ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} of ${checks.length} failed` : `\nall ${checks.length} ok${owed.size ? ` (${owed.size} owed)` : ''}`);
process.exit(failed ? 1 : 0);
