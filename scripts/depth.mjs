#!/usr/bin/env node
/**
 * Does the plate's depth reach the flow? (bubbles-plan.md F)
 *
 *   npm run depth
 *
 * The gap between the two glasses has been a real field since the squeeze
 * film was built, and until now only the squeeze knew about it: advection,
 * diffusion and the projection were all depth-blind. So the dome measured as
 * doing nothing at every setting, and a plate with a shape to it flowed
 * exactly like a flat one.
 *
 * Two things are asked here, in this order, because the second is meaningless
 * if the first is not true:
 *
 *   1. the gap really takes the dome's shape  (readSqueeze, centre vs rim)
 *   2. and the flow is slower where the gap is thin
 *
 * The control is the drag's own strength: the same domed plate is measured
 * with `depthDrag` at zero and at full, alternating, so what is compared is
 * one plate against itself rather than two runs against each other. At zero
 * this is the old solver exactly, and the difference between the pair is the
 * whole of the change.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, installFrameReader } from './frame.mjs';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const PORT = 4343;
const CURVE = Number(process.env.DEPTH_CURVE ?? 1);
const DRAG = Number(process.env.DEPTH_DRAG ?? 3);

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let up = true;
server.on('exit', (c) => { up = false; console.error(`\npreview server exited (${c}) — port ${PORT} in use?`); process.exit(2); });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));
if (!up) process.exit(2);

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  // A plate that is not being poured on or evolved, so what moves is the flow
  // already there and not the next drop landing.
  const set = (o) => page.evaluate((s) => Object.assign(window.chromaglassDebug().settings, s), o);
  await set({ automateRate: 0, plateCurve: CURVE, depthDrag: 0 });
  await page.waitForTimeout(6000);

  // 1. The gap takes the dome's shape.
  const gap = await page.evaluate(async () => {
    const d = window.chromaglassDebug();
    const sq = await d.readSqueeze?.();
    if (!sq) return null;
    const { n, gap } = sq;
    let inner = 0, ki = 0, outer = 0, ko = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const r = Math.hypot(x - n / 2, y - n / 2) / (n / 2);
      if (r < 0.25) { inner += gap[x + y * n]; ki++; }
      else if (r > 0.75 && r < 0.98) { outer += gap[x + y * n]; ko++; }
    }
    return { inner: inner / ki, outer: outer / ko };
  });
  check('the gap can be read back at all', gap !== null, gap ? '' : 'no readSqueeze');
  if (!gap) throw new Error('nothing to measure');
  /*
    Positive curve is a deep centre and a tight rim — which is what every
    description of `plateCurve` says, and the opposite of what the formula
    did until F. The sign was unobservable while depth did not reach the
    flow, so it went uncorrected through two plans.
  */
  check('and it is domed, deep in the middle and tight at the rim',
    gap.inner > gap.outer * 1.5,
    `centre ${gap.inner.toFixed(4)}, rim ${gap.outer.toFixed(4)}`);

  // 2. The flow is slower where the gap is thin.
  const speeds = () => page.evaluate(() => {
    const d = window.chromaglassDebug();
    const f = d.fluids[0], N = d.gridSize;
    const vx = f.readVx, vy = f.readVy;
    let inner = 0, ki = 0, outer = 0, ko = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = Math.hypot(x - N / 2, y - N / 2) / (N / 2);
      const s = Math.hypot(vx[x + y * N], vy[x + y * N]);
      if (r < 0.25) { inner += s; ki++; }
      else if (r > 0.75 && r < 0.98) { outer += s; ko++; }
    }
    return { inner: inner / ki, outer: outer / ko };
  });

  /*
    Alternated, because the plate drifts.

    A look left running changes on its own — the automation is off, but the
    music, the lamp and the plate's own momentum are not — so two readings
    taken minutes apart differ for reasons that have nothing to do with the
    setting under test. Taken in pairs and averaged, the drift falls out.
  */
  const off = [], on = [];
  for (let i = 0; i < 3; i++) {
    await set({ depthDrag: 0 });
    await page.waitForTimeout(4000);
    off.push(await speeds());
    await set({ depthDrag: DRAG });
    await page.waitForTimeout(4000);
    on.push(await speeds());
  }
  const mean = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
  // The ratio, not the speeds: the plate's overall liveliness drifts, and
  // what this change claims is a difference *across the plate*.
  const rOff = mean(off, 'outer') / mean(off, 'inner');
  const rOn = mean(on, 'outer') / mean(on, 'inner');
  console.log(`\n  drag off: rim/centre ${rOff.toFixed(3)}  (centre ${mean(off, 'inner').toFixed(4)}, rim ${mean(off, 'outer').toFixed(4)})`);
  console.log(`  drag on:  rim/centre ${rOn.toFixed(3)}  (centre ${mean(on, 'inner').toFixed(4)}, rim ${mean(on, 'outer').toFixed(4)})\n`);

  check('the tight rim runs slower than the deep centre once depth is coupled',
    rOn < rOff * 0.9,
    `rim/centre ${rOff.toFixed(3)} → ${rOn.toFixed(3)}, ${((1 - rOn / rOff) * 100).toFixed(0)}% down`);

  /*
    And a flat plate is the plate it was.

    This is the check that lets the drag ship on by default. The mobility is
    (h/nominal)^2 capped at one, so a gap sitting at its nominal depth is
    multiplied by exactly one however high the dial goes — which means no
    look that does not set a plate shape can notice this exists. If that ever
    stops being true, thirty-two presets change character at once.
  */
  await set({ plateCurve: 0, depthDrag: 0 });
  await page.waitForTimeout(5000);
  const flatOff = await speeds();
  await set({ depthDrag: DRAG });
  await page.waitForTimeout(5000);
  const flatOn = await speeds();
  const drift = Math.abs(flatOn.inner / flatOff.inner - 1);
  check('a flat plate does not notice the drag at all',
    drift < 0.12,
    `centre ${flatOff.inner.toFixed(4)} → ${flatOn.inner.toFixed(4)}, ${(drift * 100).toFixed(1)}% apart`);

  /*
    And a change of shape does not wipe a press.

    The plate shape is a per-plate patch target, so a sound or camera mapping
    can drive it every frame. Re-laying the gap at the new rest — which is
    what the first version of this did — would erase a live press sixty times
    a second for as long as the modulation ran, and zero the squeeze rate with
    it. So the shape change is a *shift*: every cell moves by the difference
    between the old rest and the new one, and whatever a press pushed it away
    from rest stays pushed.
  */
  await set({ plateCurve: 0, depthDrag: 0 });
  await page.waitForTimeout(4000);
  const gapAt = () => page.evaluate(async () => {
    const sq = await window.chromaglassDebug().readSqueeze?.();
    if (!sq) return null;
    const { n, gap } = sq;
    let t = 0, k = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (Math.hypot(x - n / 2, y - n / 2) / (n / 2) < 0.12) { t += gap[x + y * n]; k++; }
    }
    return t / k;
  });
  const flat = await gapAt();
  // Held down, so the gap is still dented when the shape changes under it.
  for (let k = 0; k < 10; k++) {
    await page.evaluate(() => {
      const d = window.chromaglassDebug(), f = d.fluids[0], N = d.gridSize;
      f.applySquish(N / 2, N / 2, 30, 0.004, 0, true);
    });
    await page.waitForTimeout(60);
  }
  const pressed = await gapAt();
  await set({ plateCurve: 1 });
  await page.waitForTimeout(250);
  const after = await gapAt();
  // Curve 1 lifts the centre's rest from 0.03 to 0.06, so a reset would read
  // 0.06 exactly and a shift reads the dent carried up with it.
  const dent = flat - pressed;
  check('a press survives the glasses changing shape',
    dent > 0.0005 && after < 0.06 - dent * 0.5,
    `dented ${dent.toFixed(4)} below rest, and after the change ${after.toFixed(4)} against a rest of 0.0600`);

  await set({ plateCurve: CURVE });
  check('and switching it off puts the plate back',
    Math.abs(off[0].outer / off[0].inner - off[off.length - 1].outer / off[off.length - 1].inner) < rOff * 0.5,
    `first ${(off[0].outer / off[0].inner).toFixed(3)}, last ${(off[off.length - 1].outer / off[off.length - 1].inner).toFixed(3)}`);
} finally { await browser.close(); stop(); }

const bad = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
