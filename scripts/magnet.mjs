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
 *   3. let go of, it stays where the hand left it, rather than going back
 *      to the middle and taking the ferrofluid with it
 *   4. and Magnet Across still moves it once the hand has set it down
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

    And the plate's own currents, for the same reason. With the band playing,
    Classic's turbulence, sound drive, beat rock and squeeze and its heat
    lift churn the plate as hard as the magnet pulls, differently on every
    run: the check went fail, pass, fail across three heads with no magnet
    change between them (on the last, the solver's magnet was at the hand and
    the ferrofluid gathered 0.25 away). In the lab, where nothing else moves,
    a held magnet gathers 123 -> 317 in three seconds.
  */
  await page.evaluate(() => {
    const d = window.chromaglassDebug();
    Object.assign(d.settings, {
      rotationSpeed: 0, audioMappings: { ...(d.settings.audioMappings ?? {}), rotation: 'none' },
      turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0,
      /*
        And an ordinary plate clock. The magnet acts in plate time, and
        Classic runs the plate slowest of any look (0.00924); the music was
        nudging it up, and with the sound drive held at zero the ferrofluid
        had a third of the time to move in the same four seconds (CI: +47 at
        best along the whole path, against +111 to +124 with the music on).
      */
      globalSpeed: 0.025,
    });
  });
  /*
    And let the pour settle before the control. Three seconds after it, the
    fresh ferrofluid was still gathering on its own: the plate left alone
    went 121 -> 189 at the hand's spot in six seconds (CI, on a commit that
    does not touch the magnet), more than the drag then added over its
    window, and the check failed on the control rather than on the magnet.
  */
  await page.waitForTimeout(9000);

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
  let drag0, drag1, spot = null, trail = [], solverMagnet = null;
  for (let k = 0; k < 3; k++) {
    drag0 = await phase(null, 'drag0');
    await page.mouse.move(...at(0.2));
    await page.mouse.down();
    // The hand's path on the plate, the whole drag and the hold. It was the
    // last two seconds only, when the plate turned under the hand; it is held
    // still now, and a magnet crossing 0.4 of the plate in four seconds pulls
    // the ferrofluid part of the way and outruns it: on CI it gathered +124
    // mid-drag, 0.19 behind where the hand stopped, twice running.
    trail = [];
    const sample = async () => { const h = await page.evaluate(() => window.chromaglassDebug().magnetHand?.()); if (h) trail.push({ x: h.x, y: h.y }); };
    for (let i = 0; i <= 40; i++) {
      await page.mouse.move(...at(0.2 + 0.65 * i / 40));
      await page.waitForTimeout(100);
      if (i % 4 === 0) await sample();
    }
    const hold = [];
    for (let k = 0; k < 12; k++) {
      await page.waitForTimeout(250); await sample();
      hold.push(await page.evaluate(() => { const m = window.chromaglassDebug().magnetNow?.(); return m ? `${m.held ? 'H' : '-'}${m.x.toFixed(2)},${m.y.toFixed(2)}` : '?'; }));
    }
    console.log(`     the solver's magnet through the hold: ${hold.join(' ')}`);
    // The whole step as the solver got it, so the lab can replay it (scripts/lab.mjs).
    console.log(`     STEP ${await page.evaluate(() => JSON.stringify(window.chromaglassDebug().fluids?.[0]?.lastStep ?? null))}`);
    spot = await page.evaluate(() => window.chromaglassDebug().magnetHand?.());
    solverMagnet = await page.evaluate(() => window.chromaglassDebug().magnetNow?.());
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
  // Where the ferrofluid went, coarsely: the drag's change in each 0.2 square, top row y = 0.9.
  const map = await page.evaluate(() => {
    const a = window.__phaseSnaps?.drag0, b = window.__phaseSnaps?.drag1;
    if (!a || !b || a.n !== b.n) return null;
    const n = a.n, rows = [];
    for (let j = 4; j >= 0; j--) {
      const row = [];
      for (let i = 0; i < 5; i++) {
        let g = 0;
        for (let y = Math.floor(j * n / 5); y < Math.floor((j + 1) * n / 5); y++) for (let x = Math.floor(i * n / 5); x < Math.floor((i + 1) * n / 5); x++) g += b.data[x + y * n] - a.data[x + y * n];
        row.push((g / (n * n) * 1e4).toFixed(0).padStart(5));
      }
      rows.push(row.join(''));
    }
    return rows;
  });
  if (map) console.log(`     the drag's change by 0.2 square (x across, y up):\n       ${map.join('\n       ')}`);
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
  console.log(`     the solver's magnet at the end: ${solverMagnet ? `${solverMagnet.x.toFixed(2)},${solverMagnet.y.toFixed(2)} strength ${solverMagnet.strength} height ${solverMagnet.height} ${solverMagnet.held ? 'held' : 'NOT held'}` : 'unknown'}`);
  console.log(`     along the hand's ${trail.length} positions, the drag gathered most at ` +
    (best ? `${best.at.x.toFixed(2)},${best.at.y.toFixed(2)}: ${best.d0.toFixed(0)} → ${best.d1.toFixed(0)}, against ${best.i0.toFixed(0)} → ${best.i1.toFixed(0)} left alone` : 'nowhere'));
  /*
    On the gain alone: what the drag added at that point beyond what the plate
    did there on its own, at least a tenth of what was there. It also asked
    that the dragged plate end with a fifth more than the idle one ended with,
    and the two windows do not start from the same plate: 157 against 203 at
    the same point on one CI run, so the drag gathered +34 beyond the idle
    plate's change and still failed on where the idle window happened to
    begin (two runs in five, on commits that do not touch the magnet).
  */
  check('dragging the Magnet gathers the ferrofluid along where the hand goes',
    !!best && best.gain > 0.1 * Math.max(1, best.d0),
    best ? `${best.d0.toFixed(0)} → ${best.d1.toFixed(0)} dragged, against ${best.i0.toFixed(0)} → ${best.i1.toFixed(0)} left alone` : 'no hand');
  const keptDrag = drag1.total / Math.max(1e-6, drag0.total), keptIdle = idle1.total / Math.max(1e-6, idle0.total);
  check('and dragging it neither makes nor loses more liquid than the plate does alone',
    Math.abs(keptDrag - keptIdle) < 0.08,
    `kept ${(keptDrag * 100).toFixed(0)}% dragged, ${(keptIdle * 100).toFixed(0)}% left alone`);

  /*
    3. Let go, and the magnet stays where the hand left it.

    Reported by the owner: "I don't like how the magnet draws the ferrofluid
    back to the center automatically. I want to just control it with the
    mouse." A quarter of a second after the last touch the solver's magnet
    went back to the look's own place, the middle of the plate on every
    look, and the ferrofluid the drag had carried off flowed back after it.

    The look's magnet is put first in the far corner from where the hand
    will be, so a magnet gone home cannot pass by landing near the hand:
    the drag above ends wherever the pointer mapping puts 0.85 across, which
    read 0.43,0.58 in a cloud session, 0.1 from the middle. And the check
    first asks that the solver really has the magnet in that corner, so a
    settings write that never reached it cannot pass either. Then the hand
    presses the magnet down there, holds it, lets go, and two seconds on the
    check asks what the solver was given: the lead plate's last step, not
    the hand (which the fix does not change and always said the right
    place), and not magnetNow, which is bookkeeping written beside the step
    and could say the right place while the step said another.

    Once let go it is the look's magnet, left where the hand put it: the
    look's own strength and height, not the hand's firm, low pull, which is
    the hand pressing it up to the glass.
  */
  const clamp = (v) => Math.max(0.05, Math.min(0.95, v));
  /** What the lead plate's solver was last given, and what the look alone would give it. */
  const readStep = () => page.evaluate(() => {
    const d = window.chromaglassDebug(), st = d.fluids?.[0]?.lastStep, s = d.settings, m = d.magnetNow?.();
    if (!st) return null;
    return {
      x: st.magnetX, y: st.magnetY, strength: st.magnetStrength, height: st.magnetHeight, held: !!m?.held,
      lookStrength: Math.max(0, s.magnetStrength ?? 0),
      lookHeight: Math.max(0.02, (s.magnetHeight ?? 0.25) * (0.5 + (s.phaseScale ?? 0.4))),
    };
  });
  const fmt = (m) => m ? `${m.x.toFixed(2)},${m.y.toFixed(2)} strength ${m.strength.toFixed(2)} height ${m.height.toFixed(3)}${m.held ? ' (held)' : ''}` : 'unknown';
  const asLook = (m) => !!m && !m.held && Math.abs(m.strength - m.lookStrength) < 1e-3 && Math.abs(m.height - m.lookHeight) < 1e-3;
  await page.mouse.move(...at(0.85));
  const probe = await page.evaluate(() => window.chromaglassDebug().magnetHand?.());
  const corner = { x: (probe?.x ?? 0.5) > 0.5 ? 0.1 : 0.9, y: (probe?.y ?? 0.5) > 0.5 ? 0.1 : 0.9 };
  await page.evaluate((c) => Object.assign(window.chromaglassDebug().settings, { magnetX: c.x, magnetY: c.y }), corner);
  await page.waitForTimeout(1000);
  const home = await readStep();
  check('the look\'s own magnet is where the check put it, in the far corner',
    asLook(home) && Math.hypot(home.x - corner.x, home.y - corner.y) < 0.02,
    `asked for ${corner.x},${corner.y}; the solver was given ${fmt(home)}`);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  const left = await page.evaluate(() => window.chromaglassDebug().magnetHand?.());
  await page.mouse.up();
  await page.waitForTimeout(2000);
  const letGo = await readStep();
  const away = left && home ? Math.hypot(clamp(left.x) - home.x, clamp(left.y) - home.y) : 0;
  const off = left && letGo ? Math.hypot(letGo.x - clamp(left.x), letGo.y - clamp(left.y)) : Infinity;
  check('let go of, the magnet stays where the hand left it',
    away > 0.3 && asLook(letGo) && off < 0.02,
    `the hand left it at ${left ? `${left.x.toFixed(2)},${left.y.toFixed(2)}` : 'nowhere'}, ${away.toFixed(2)} from the look's; ` +
    `two seconds after letting go the solver was given ${fmt(letGo)} (the look alone: strength ${letGo?.lookStrength.toFixed(2)} height ${letGo?.lookHeight.toFixed(3)})`);

  /*
    4. And the look can still place it. Magnet Across moved (the slider, a
    fader, a patch) takes the magnet from where the hand left it, so the
    sliders are not dead once the tool has been used. This passed before the
    fix too, by design; it is here so the fix cannot make the sliders dead.
    The y term is what lets it fail: across can land near where the hand
    left the magnet, but the corner's y is on the other side of the middle
    from the hand's, so a magnet still at the hand is 0.4 off in y at least.
  */
  const across = corner.x > 0.5 ? 0.3 : 0.7;
  await page.evaluate((x) => { window.chromaglassDebug().settings.magnetX = x; }, across);
  await page.waitForTimeout(1000);
  const placed = await readStep();
  check('moving Magnet Across takes it from where the hand left it',
    asLook(placed) && Math.abs(placed.x - across) < 0.02 && Math.abs(placed.y - corner.y) < 0.02,
    `Magnet Across ${corner.x} → ${across}; the solver was given ${fmt(placed)}`);
} finally {
  await browser.close();
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
