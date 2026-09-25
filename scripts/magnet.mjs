#!/usr/bin/env node
/**
 * Does the Magnet tool move the ferrofluid, the way a hand does it?
 *
 *   npm run magnet
 *
 * Reported: "magnet tool isn't really working". `npm run ferro` proves the
 * physics with the magnet placed by setting, and every one of its checks
 * passed while the tool did very little in the hand: the pull was scaled by
 * the flow's own step, which a slow look keeps tiny, so a dragged magnet left
 * the ferrofluid behind, and on a look without ferrofluid it did nothing at
 * all. So this goes the way a visitor does, through the keyboard and the
 * mouse, on a look that has no ferrofluid of its own:
 *
 *   1. picking the Magnet pours ferrofluid, rather than doing nothing
 *   2. dragging it across the plate carries the ferrofluid with it, measured
 *      as the centre of mass moving toward the hand, against the same plate
 *      left alone for the same time (the flow moves the phase too)
 *
 * Needs a GPU that presents WebGPU: the macOS runner, in checks.yml.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, isGpuEngine } from './frame.mjs';

const PORT = 4341;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
  check('the GPU solver is the one being measured', isGpuEngine(engine), engine ?? 'no debug hook');
  if (!isGpuEngine(engine)) process.exit(1);

  /**
   * How much ferrofluid is on the lead plate, where its centre of mass is
   * (plate 0..1), and how much sits within 0.12 of a point (the hand).
   */
  const phase = (at = null, keep = null) => page.evaluate(async ({ at, keep }) => {
    const f = await window.chromaglassDebug().readPhase();
    if (!f) return { total: -1, x: 0, y: 0, near: 0, n: 0 };
    const { n, data } = f;
    // Kept in the page, to be read again near a point known only later.
    if (keep) (window.__phaseSnaps ??= {})[keep] = { n, data: Float32Array.from(data) };
    let total = 0, cx = 0, cy = 0, near = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = data[x + y * n];
      total += v; cx += v * (x / n); cy += v * (y / n);
      if (at && Math.hypot((x + 0.5) / n - at.x, (y + 0.5) / n - at.y) < 0.12) near += v;
    }
    // Near and total as fractions of the plate's cells, so a grid change
    // does not read as liquid made or lost (n is reported for that too).
    return { total: total / (n * n), x: total ? cx / total : 0, y: total ? cy / total : 0, near: near / (n * n) * 1e4, n };
  }, { at, keep });
  /** A kept reading, near a point: in the same units as phase().near. */
  const nearIn = (keep, at) => page.evaluate(({ keep, at }) => {
    const f = window.__phaseSnaps?.[keep];
    if (!f || !at) return 0;
    const { n, data } = f;
    let near = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (Math.hypot((x + 0.5) / n - at.x, (y + 0.5) / n - at.y) < 0.12) near += data[x + y * n];
    }
    return near / (n * n) * 1e4;
  }, { keep, at });
  const amount = () => page.evaluate(() => window.chromaglassDebug().settings?.phaseAmount ?? 0);

  const before = await phase();
  const amountBefore = await amount();
  console.log(`     classic: ferrofluid ${amountBefore}, ${(before.total * 100).toFixed(1)}% of the plate`);

  // 1. Pick the Magnet the way a hand does.
  await page.mouse.click(5, 5);
  await page.keyboard.press('m');
  await page.waitForTimeout(2500);
  const poured = await phase();
  const amountAfter = await amount();
  check('picking the Magnet on a look without ferrofluid pours some',
    amountAfter > 0.002 && poured.total > Math.max(0.01, before.total * 2),
    `setting ${amountBefore} → ${amountAfter}, covering ${(before.total * 100).toFixed(1)}% → ${(poured.total * 100).toFixed(1)}% of the plate`);

  /*
    Hold the plate still under the hand for the drag. Classic turns, and the
    pointer mapping follows it, so a held pointer drags the magnet across the
    plate and the ferrofluid smears along a moving path behind it (CI read
    the gathering 0.11 to 0.19 away from where the hand stopped, and the
    check failed by one unit). The turning is the look's, not the magnet's,
    so it is a control here, the way ferro.mjs sets the look it measures on.
  */
  await page.evaluate(() => {
    const d = window.chromaglassDebug();
    Object.assign(d.settings, { rotationSpeed: 0, audioMappings: { ...(d.settings.audioMappings ?? {}), rotation: 'none' } });
  });
  await page.waitForTimeout(3000);

  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const at = (fx) => [box.x + box.width * fx, box.y + box.height * 0.5];

  /*
    2. The drag. Measured where the hand ends up, not over the whole plate:
    a magnet drags the ferrofluid it passes near and leaves the rest, so the
    plate's centre of mass hardly moves even when the pull is doing exactly
    its job (the first version of this check asked for that and failed a
    magnet that worked). The control is the same plate left alone as long,
    read at the same spot. The liquid is compared against that control too:
    the ferrofluid is conserved exactly now, but the check should not fail a
    drag for something the plate does on its own.
  */
  /*
    Where the hand ends is read at the end of the drag, with the mouse still
    down, and every reading is measured around that point. It was read once
    before the control, eight seconds earlier, and the plate turns under the
    pointer (the layer's rotation, which the pointer mapping follows): the
    same screen point read 0.68,0.64 on one run and 0.31,0.36 on the next,
    so the check was counting liquid round a point the hand had long left.

    Each window is measured on one grid. The quality governor may move the
    solver to another a few seconds in, and the phase is laid afresh on the
    new one (CI: "44% kept" alone, which is (256/384)²: a grid change, not
    a leak). A window the grid moved in is measured again.
  */
  let idle0, idle1;
  for (let k = 0; k < 3; k++) {
    idle0 = await phase(null, 'idle0');
    await page.waitForTimeout(6000);
    idle1 = await phase(null, 'idle1');
    if (idle0.n === idle1.n) break;
    console.log(`     the grid moved ${idle0.n} → ${idle1.n} while the plate was left alone; again`);
  }
  let drag0, drag1, spot = null, trail = [];
  for (let k = 0; k < 3; k++) {
    drag0 = await phase(null, 'drag0');
    await page.mouse.move(...at(0.2));
    await page.mouse.down();
    // The hand's path on the plate over the last two seconds of the drag and
    // the hold: the plate turns under a held pointer, so the magnet keeps
    // moving on it, and the ferrofluid trails it by a little.
    trail = [];
    const sample = async () => { const h = await page.evaluate(() => window.chromaglassDebug().magnetHand?.()); if (h) trail.push({ x: h.x, y: h.y }); };
    for (let i = 0; i <= 40; i++) {
      await page.mouse.move(...at(0.2 + 0.65 * i / 40));
      await page.waitForTimeout(100);
      if (i >= 20 && i % 4 === 0) await sample();
    }
    for (let k = 0; k < 12; k++) { await page.waitForTimeout(250); await sample(); }
    spot = await page.evaluate(() => window.chromaglassDebug().magnetHand?.());
    drag1 = await phase(null, 'drag1');
    await page.mouse.up();
    if (drag0.n === drag1.n) break;
    console.log(`     the grid moved ${drag0.n} → ${drag1.n} during the drag; again`);
    await page.waitForTimeout(1000);
  }
  for (const [r, k] of [[idle0, 'idle0'], [idle1, 'idle1'], [drag0, 'drag0'], [drag1, 'drag1']]) r.near = await nearIn(k, spot);
  console.log(`     the hand ends at ${spot ? `${spot.x.toFixed(2)},${spot.y.toFixed(2)}` : 'nowhere'}; ferrofluid within 0.12 of it: ` +
    `alone ${idle0.near.toFixed(0)} → ${idle1.near.toFixed(0)}, dragged ${drag0.near.toFixed(0)} → ${drag1.near.toFixed(0)}`);
  /*
    Where it did gather: the 0.12 disc that gained most over the drag, and
    what sits at the hand's mirror point, so a failure says whether the
    liquid went somewhere else or nowhere.
  */
  const gathered = await page.evaluate(() => {
    const a = window.__phaseSnaps?.drag0, b = window.__phaseSnaps?.drag1;
    if (!a || !b || a.n !== b.n) return null;
    const n = a.n, step = Math.max(1, Math.round(n / 48));
    let best = { x: 0, y: 0, gain: -Infinity };
    for (let cy = 0.12; cy <= 0.88; cy += 0.04) for (let cx = 0.12; cx <= 0.88; cx += 0.04) {
      let g = 0;
      for (let y = 0; y < n; y += step) for (let x = 0; x < n; x += step) {
        if (Math.hypot((x + 0.5) / n - cx, (y + 0.5) / n - cy) < 0.12) g += b.data[x + y * n] - a.data[x + y * n];
      }
      if (g > best.gain) best = { x: cx, y: cy, gain: g * step * step / (n * n) * 1e4 };
    }
    return best;
  });
  const mirror = spot ? await nearIn('drag1', { x: spot.x, y: 1 - spot.y }) : 0;
  console.log(`     it gathered most at ${gathered ? `${gathered.x.toFixed(2)},${gathered.y.toFixed(2)} (+${gathered.gain.toFixed(0)})` : '?'}; ` +
    `at the hand's mirror ${mirror.toFixed(0)}; centre of mass ${drag0.x.toFixed(2)},${drag0.y.toFixed(2)} → ${drag1.x.toFixed(2)},${drag1.y.toFixed(2)}`);
  /*
    Judged along the hand's recent path, not at one point. The disc that
    gained most once sat 0.11 from where the hand stopped (CI: "gathered
    most at 0.24,0.56" with the hand at 0.27,0.45), just outside a 0.12
    disc round the end point, because the magnet had moved on under the
    turning plate and the ferrofluid follows it with a lag. So: at the
    point on the trail where the drag gathered most, what the drag added
    there, against what the plate left alone did at the same point.
  */
  let best = null;
  for (const p of trail.length ? trail : (spot ? [spot] : [])) {
    const g = { at: p,
      d0: await nearIn('drag0', p), d1: await nearIn('drag1', p),
      i0: await nearIn('idle0', p), i1: await nearIn('idle1', p) };
    g.gain = (g.d1 - g.d0) - (g.i1 - g.i0);
    if (!best || g.gain > best.gain) best = g;
  }
  console.log(`     along the hand's last ${trail.length} positions, the drag gathered most at ` +
    (best ? `${best.at.x.toFixed(2)},${best.at.y.toFixed(2)}: ${best.d0.toFixed(0)} → ${best.d1.toFixed(0)}, against ${best.i0.toFixed(0)} → ${best.i1.toFixed(0)} left alone` : 'nowhere'));
  check('dragging the Magnet gathers the ferrofluid along where the hand goes',
    !!best && best.gain > 0.1 * Math.max(1, best.d0) && best.d1 > 1.2 * Math.max(1, best.i1),
    best ? `${best.d0.toFixed(0)} → ${best.d1.toFixed(0)} dragged, against ${best.i0.toFixed(0)} → ${best.i1.toFixed(0)} left alone` : 'no hand');
  const keptDrag = drag1.total / Math.max(1e-6, drag0.total), keptIdle = idle1.total / Math.max(1e-6, idle0.total);
  check('and dragging it neither makes nor loses more liquid than the plate does alone',
    Math.abs(keptDrag - keptIdle) < 0.08,
    `kept ${(keptDrag * 100).toFixed(0)}% dragged, ${(keptIdle * 100).toFixed(0)}% left alone`);
} finally {
  await browser.close();
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
