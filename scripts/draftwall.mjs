#!/usr/bin/env node
/**
 * Preview builds on a copy, and the wall keeps its look (PLAN.md 8b).
 *
 * What was wrong: Preview held the sequencer and a song's show, but the plate
 * being built was the plate on the wall. The projector window is painted from
 * the show's one canvas, so every slider tried in Preview was on the wall as
 * it was tried, under a plate bar that said "not on wall".
 *
 * What this measures, in the built app at 1440x900 with the projector window
 * opened the way the desk opens it (⌘⏎ with no wall up):
 *
 *   - With no wall, Preview is one engine (a second would cost a solver for
 *     nothing anyone sees).
 *   - With the wall up, the desk's preview shows a copy (`plate-frame-draft`)
 *     and the wall's engine is hidden from the desk, not unmounted.
 *   - A look setting changed on the desk reaches the copy and not the wall:
 *     read from what the wall's engine was handed (`chromaglassDebug`, which
 *     only the wall's engine installs) and from what a cast receiver is sent
 *     (`chromaglassCastState`). The room (the dimmer) still reaches the wall.
 *   - A clear on the desk is not replayed on the wall.
 *   - The projector window is painted from the wall's canvas and never the
 *     copy's: the window's own drawImage counts the canvases it draws from.
 *     With no renderer (a cloud container) the frame loop never runs and
 *     nothing is painted, so that line says it measured nothing; on the Mac
 *     (`--frames`, the open shard) it must see frames.
 *   - Send to wall (⌘⏎ again) moves the wall to the copy's look across the fade.
 *   - Live puts the desk back on the wall's look and takes the copy down.
 *   - The wall closing mid-Preview takes the copy down and the desk keeps
 *     what it was building.
 *
 * The pixels of the projector window itself, against a look changed in
 * Preview, are not yet measured (PLAN.md 8b-5); `--frames` on the Mac shows
 * what the window draws from.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';

const PORT = Number(process.env.DRAFTWALL_PORT ?? 4183);
const URL = `http://localhost:${PORT}/?debug&look=classic&dpr=0.35`;
/** On the Mac, where the app draws: the painted line must see frames rather than say it measured nothing. */
const FRAMES = process.argv.includes('--frames');

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
    proc.on('exit', c => { clearTimeout(bail); reject(new Error(`preview exited ${c}${notes.length ? `: ${notes.join(' ').slice(0, 200)}` : ''}`)); });
  });
  return proc;
}
const stopServer = (proc) => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); } };

const server = await serve();
const browser = await launchChromium(chromium, { headless: true });
let exitCode = 1;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="desk-preview"]', { timeout: 60_000 });
  await page.waitForFunction(() => typeof window.chromaglassSettings === 'function' && typeof window.chromaglassDebug === 'function');
  await page.waitForTimeout(1500);

  const state = () => page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { hidden: getComputedStyle(el).visibility === 'hidden', x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const desk = window.chromaglassSettings();
    const dbg = window.chromaglassDebug();
    const wall = dbg.settings;
    const cast = window.chromaglassCastState().castState;
    return {
      main: vis('[data-testid="plate-frame"]'),
      draft: vis('[data-testid="plate-frame-draft"]'),
      box: vis('[data-testid="desk-preview"]'),
      canvases: document.querySelectorAll('canvas#liquid-canvas, canvas#liquid-canvas-draft').length,
      desk: { speed: desk.globalSpeed, dimmer: desk.dimmer },
      wall: { speed: wall.globalSpeed, dimmer: wall.dimmer, layers: wall.layerCount ?? 1, clears: dbg.clears },
      cast: { speed: cast.settings.globalSpeed, presetSeq: cast.presetSeq, clear: cast.clearTrigger, layers: cast.settings.layerCount ?? 1 },
    };
  });
  const near = (a, b) => Math.abs(a - b) < 1e-9;

  // Build ships in Preview (desklayout's check); say so here too, rather than measure Live by accident.
  await page.click('[data-testid="plate-mode-segmented-preview"]');
  await page.waitForTimeout(300);

  let s = await state();
  check('with no wall up, Preview is one engine', s.draft === null && s.canvases === 1 && s.main && !s.main.hidden,
    `${s.canvases} canvas${s.canvases === 1 ? '' : 'es'}, copy ${s.draft ? 'up' : 'none'}`);

  // The wall, opened as the desk opens it.
  const [wall] = await Promise.all([
    page.waitForEvent('popup', { timeout: 30_000 }),
    page.keyboard.press('Control+Enter'),
  ]);
  await wall.waitForLoadState('load');
  await wall.waitForSelector('[data-testid="cast-display"]', { timeout: 30_000 }).catch(() => {});
  await page.waitForFunction(() => !!document.querySelector('[data-testid="plate-frame-draft"]'), null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(800);

  s = await state();
  const covers = s.draft && s.box && Math.abs(s.draft.x - s.box.x) < 3 && Math.abs(s.draft.y - s.box.y) < 3
    && Math.abs(s.draft.w - s.box.w) < 3 && Math.abs(s.draft.h - s.box.h) < 3;
  check('with the wall up, the desk\'s preview shows a copy', !!covers && !s.draft.hidden && s.canvases === 2,
    s.draft ? `copy at ${s.draft.x.toFixed(0)},${s.draft.y.toFixed(0)} ${s.draft.w.toFixed(0)}x${s.draft.h.toFixed(0)}, preview ${s.box.x.toFixed(0)},${s.box.y.toFixed(0)} ${s.box.w.toFixed(0)}x${s.box.h.toFixed(0)}` : 'no copy');
  check('and the wall\'s engine is hidden from the desk, still mounted', !!s.main && s.main.hidden, s.main ? `hidden ${s.main.hidden}` : 'gone');

  /*
    Count what the projector window draws from: its own drawImage, patched in
    its own document, so whatever installs or re-installs the show's paint
    hook, what is counted is what reached the wall's canvas.
  */
  await wall.evaluate(() => {
    window.__painted = {};
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (src, ...rest) {
      const id = src && typeof src.id === 'string' ? src.id || '(no id)' : '(not a canvas)';
      window.__painted[id] = (window.__painted[id] ?? 0) + 1;
      return draw.call(this, src, ...rest);
    };
  });

  // A look setting on the desk.
  const before = s;
  const newSpeed = +(before.desk.speed * 3 + 0.01).toFixed(4);
  await page.evaluate((v) => window.chromaglassSettings({ globalSpeed: v }), newSpeed);
  await page.waitForTimeout(600);
  s = await state();
  check('a look setting changed in Preview reaches the copy', near(s.desk.speed, newSpeed), `desk ${s.desk.speed}`);
  check('and not the wall\'s engine', near(s.wall.speed, before.wall.speed) && !near(s.wall.speed, newSpeed),
    `wall ${s.wall.speed} (was ${before.wall.speed}), desk ${s.desk.speed}`);
  check('nor a receiver that draws its own plate', near(s.cast.speed, before.wall.speed), `sent ${s.cast.speed}`);

  // The room is still the desk's to ride.
  await page.evaluate(() => window.chromaglassSettings({ dimmer: 0.5 }));
  await page.waitForTimeout(400);
  s = await state();
  check('the dimmer still reaches the wall in Preview', near(s.wall.dimmer, 0.5), `wall dimmer ${s.wall.dimmer}`);
  await page.evaluate(() => window.chromaglassSettings({ dimmer: 1 }));

  // A clear on the desk.
  const clearWas = s.cast.clear, engineClearsWas = s.wall.clears;
  await page.evaluate(() => window.chromaglassAction('clear'));
  await page.waitForTimeout(400);
  s = await state();
  check('a clear on the desk is not sent to the wall', s.cast.clear === clearWas && s.wall.clears === engineClearsWas,
    `the wall's engine was handed ${engineClearsWas} → ${s.wall.clears} clears, a receiver ${clearWas} → ${s.cast.clear}`);

  await page.waitForTimeout(FRAMES ? 1500 : 0);
  const painted = await wall.evaluate(() => window.__painted ?? {});
  const fromWall = painted['liquid-canvas'] ?? 0, fromCopy = painted['liquid-canvas-draft'] ?? 0;
  const anyPainted = fromWall + fromCopy > 0;
  check(anyPainted ? 'the projector window is painted from the wall\'s canvas, never the copy\'s'
    : `the projector window is painted from the wall's canvas (measured nothing: no frames ran here${FRAMES ? '' : '; on the Mac, --frames requires them'})`,
    FRAMES ? fromWall > 0 && fromCopy === 0 : !anyPainted || (fromWall > 0 && fromCopy === 0),
    `${fromWall} frames from the wall's, ${fromCopy} from the copy's${Object.keys(painted).length ? ` (${JSON.stringify(painted)})` : ''}`);

  // Send to wall.
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(400);
  s = await state();
  const midway = s.wall.speed;
  await page.waitForTimeout(2600);   // DEFAULT_FADE_SECONDS is 2
  s = await state();
  check('Send to wall moves the wall to the copy\'s look', near(s.wall.speed, newSpeed) && near(s.cast.speed, newSpeed),
    `wall ${s.wall.speed}, sent ${s.cast.speed}, desk ${s.desk.speed}`);
  check('across the fade, not at once', !near(midway, newSpeed) && Math.abs(midway - before.wall.speed) > 0,
    `0.4 s in: ${midway} (from ${before.wall.speed} to ${newSpeed})`);
  check('and the copy stays up for the next look', !!s.draft && !s.draft.hidden);

  // More changes on the copy (a look setting, a clear, a plate), then Live: the desk goes back to the wall.
  const tried = +(newSpeed * 2).toFixed(4);
  const beforeLive = s;
  const triedLayers = s.wall.layers === 1 ? 2 : 1;
  await page.evaluate(({ v, n }) => window.chromaglassSettings({ globalSpeed: v, layerCount: n }), { v: tried, n: triedLayers });
  await page.evaluate(() => window.chromaglassAction('clear'));
  await page.waitForTimeout(300);
  /*
    Every value handed on the way out is read, not only where it settles: in
    the render where Preview ends the copy is gone before the desk is put
    back, and the wall's engine and a receiver were handed the copy's plates
    and counters for that one render (the pre-push review). A harness polling
    the current value never sees it, since the next render is in the same
    task, so the engine keeps what it was handed (`handed` on the debug hook)
    and App what it sent (`sent` on the cast hook).
  */
  const mark = await page.evaluate(() => ({
    handed: window.chromaglassDebug().handed.total,
    sent: window.chromaglassCastState().sent.at(-1)?.n ?? 0,
  }));
  await page.click('[data-testid="plate-mode-segmented-live"]');
  await page.waitForTimeout(800);
  s = await state();
  check('Live takes the copy down and shows the wall\'s engine', s.draft === null && s.canvases === 1 && s.main && !s.main.hidden,
    `${s.canvases} canvas(es), main hidden ${s.main?.hidden}`);
  check('and puts the desk back on the wall\'s look, so Live changes nothing on the wall',
    near(s.desk.speed, newSpeed) && near(s.wall.speed, newSpeed), `desk ${s.desk.speed}, wall ${s.wall.speed} (tried ${tried})`);
  const seen = await page.evaluate((mark) => {
    const h = window.chromaglassDebug().handed;
    const tail = (list, n) => (n > 0 ? list.slice(-n) : []);
    const sent = window.chromaglassCastState().sent.filter(e => e.n > mark.sent);
    return {
      layers: [...tail(h.layers, h.total.layers - mark.handed.layers), ...sent.map(e => e.layers)],
      clears: [...tail(h.clears, h.total.clears - mark.handed.clears), ...sent.map(e => e.clearTrigger)],
      seqs: sent.map(e => e.presetSeq),
      sends: sent.length,
    };
  }, mark);
  check('nor for a render: the wall and a receiver never see the copy\'s plates, clears or looks on the way out',
    seen.layers.every(n => n === beforeLive.wall.layers)
      && seen.clears.every(c => c === beforeLive.wall.clears || c === beforeLive.cast.clear)
      && seen.seqs.every(q => q === beforeLive.cast.presetSeq)
      && s.wall.layers === beforeLive.wall.layers && s.cast.clear === beforeLive.cast.clear,
    `handed and sent since: plates ${seen.layers.join('/') || 'none'} (wall's ${beforeLive.wall.layers}, copy's ${triedLayers}), clears ${seen.clears.join('/') || 'none'}, looks ${seen.seqs.join('/') || 'none'} over ${seen.sends} sends`);

  // Live in the middle of a Send's fade: the desk lands where the fade was going, not halfway.
  await page.click('[data-testid="plate-mode-segmented-preview"]');
  await page.waitForTimeout(800);
  const sent = +(newSpeed * 0.5).toFixed(4);
  await page.evaluate((v) => window.chromaglassSettings({ globalSpeed: v }), sent);
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(500);
  await page.click('[data-testid="plate-mode-segmented-live"]');
  await page.waitForTimeout(800);
  s = await state();
  check('Live in the middle of a Send\'s fade lands on the look being sent', near(s.desk.speed, sent) && near(s.wall.speed, sent),
    `desk ${s.desk.speed}, wall ${s.wall.speed}, sent ${sent}`);

  // Preview again, then the wall goes away.
  await page.click('[data-testid="plate-mode-segmented-preview"]');
  await page.waitForTimeout(800);
  s = await state();
  check('Preview with the wall up brings a copy back', !!s.draft && s.canvases === 2);
  const building = +(sent * 1.5).toFixed(4);
  await page.evaluate((v) => window.chromaglassSettings({ globalSpeed: v }), building);
  await page.waitForTimeout(300);
  await wall.close();
  await page.waitForFunction(() => !document.querySelector('[data-testid="plate-frame-draft"]'), null, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(600);
  s = await state();
  check('the wall closing takes the copy down', s.draft === null && s.canvases === 1 && s.main && !s.main.hidden);
  check('and the desk keeps what it was building', near(s.desk.speed, building) && near(s.wall.speed, building),
    `desk ${s.desk.speed}, the one engine ${s.wall.speed}`);

  // The control for the clear line above: with one engine the desk's clear is the wall's.
  const oneWas = s.cast.clear;
  await page.evaluate(() => window.chromaglassAction('clear'));
  await page.waitForTimeout(400);
  s = await state();
  check('with no copy, the same clear reaches the wall (the clear line above measures something)', s.cast.clear === oneWas + 1,
    `${oneWas} → ${s.cast.clear}`);

  exitCode = results.every(r => r.ok) ? 0 : 1;
} catch (e) {
  console.error(e);
  exitCode = 1;
} finally {
  await browser.close();
  stopServer(server);
}
const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} Preview checks passed`);
process.exit(exitCode);
