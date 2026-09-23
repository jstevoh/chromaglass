#!/usr/bin/env node
/**
 * Does the finger move the liquid, or only the things floating in it?
 *
 * Reported: "it only moves some bubbles around". Beads and dye are drawn from
 * different fields by different code, so that is a precise symptom — it says
 * the bead disturb lands and the velocity does not, or does not land hard
 * enough to see.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, installFrameReader } from './frame.mjs';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const PORT = 4341;
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  await page.evaluate((sp) => { const d = window.chromaglassDebug(); d.settings.automateRate = 0; d.settings.globalSpeed = sp; }, Number(process.env.FSPEED ?? 0.02));
  await page.waitForTimeout(3000);

  const state = () => page.evaluate(() => {
    const d = window.chromaglassDebug();
    const f = d.fluids[0], N = d.gridSize;
    const vx = f.readVx, vy = f.readVy, dens = f.readDensity;
    let v = 0, k = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (Math.hypot(x - N / 2, y - N / 2) / (N / 2) > 0.3) continue;
      v += Math.hypot(vx[x + y * N], vy[x + y * N]); k++;
    }
    return { speed: v / k, dye: [...dens] };
  });
  /*
    Measured along the finger's own track, not across the plate.

    The first version took a plate-wide mean, and a finger touches about 1.7%
    of a 192-square grid — so moving half the dye under it changes the average
    by well under a percent, which is under the plate's own idle motion. A
    gesture has to be measured where the gesture is.
  */
  const N = await page.evaluate(() => window.chromaglassDebug().gridSize);
  /*
    Three bands, because one drag cannot be repeated.

    Everything here is a multiple of what the plate does on its own, and both
    halves of that ratio wander. Over seven runs of the single-window version
    it read 1.28 to 1.89 against a gate of 1.4 — one in seven failing on code
    that works, which is the fault that had this harness reporting 0.94x once
    while three runs either side of it gave 1.8.

    The denominator is fixed by measuring idle three times and taking the
    middle. The numerator cannot be fixed the same way: dragging the same
    track again runs the finger through liquid the first drag already mixed,
    so repeats read low and the median would be biased into failing. So the
    three drags go along three separate bands of the plate, each measured in
    its own band, and none of them touches another's liquid.
  */
  const BANDS = [-42, 0, 42];
  const inBand = (i, dy) => {
    const x = i % N, y = (i / N) | 0;
    return Math.abs(y - (N / 2 + dy)) <= 16 && x >= N * 0.33 && x <= N * 0.68;
  };
  const inTrack = (i) => inBand(i, 0);
  const movedIn = (a, b, dy) => {
    let s = 0, k = 0;
    for (let i = 0; i < a.length; i++) if (inBand(i, dy)) { s += Math.abs(a[i] - b[i]); k++; }
    return k ? s / k : 0;
  };
  const moved = (a, b) => movedIn(a, b, 0);

  /*
    Idle three times, and the middle one, because it is the denominator.

    This was one 1600ms window, and everything here is reported as a multiple
    of it — so a window in which the plate happened to be lively drags the
    whole verdict down. Measured: four runs of this harness in a row gave
    0.94x, 1.81x, 1.89x and 1.85x for the same code, and the 0.94 is a fat
    idle reading rather than a finger that stopped working. A single-moment
    denominator is the same fault as the beads' mask check in
    `webgpu-smoke.mjs`, which failed CI today at 0.3 points against a gate of
    0.4 on a quantity that swings fourfold.

    The middle of three, not the smallest: picking the smallest would be
    choosing the answer.
  */
  const idleSample = async () => {
    const p0 = await state();
    await page.waitForTimeout(1600);
    const p1 = await state();
    return { moved: moved(p0.dye, p1.dye), speed: p1.speed };
  };
  const idles = [await idleSample(), await idleSample(), await idleSample()];
  const idleSorted = [...idles].sort((x, y) => x.moved - y.moved);
  const i1 = idleSorted[1];
  console.log(`  idle: speed ${i1.speed.toExponential(2)}, dye moved ${i1.moved.toFixed(4)}` +
    `  (three windows: ${idles.map(x => x.moved.toFixed(4)).join(', ')})`);

  /*
    Each band against its own idle, not against the middle's.

    The first attempt at this dragged three bands and compared all three to
    the centre band's idle — and read *lower* than the single-window version
    it replaced: 1.24, 1.55, 1.37, 1.33 against a gate of 1.4. The dish is
    round, so a band forty cells off centre holds less dye than the middle;
    the finger moves less there in absolute terms while the denominator stayed
    where the dye is. Apples against oranges, and it would have read as the
    finger getting worse.

    So each band carries its own idle window, taken immediately before its own
    drag, and what is compared is three ratios rather than three amounts.
  */
  const fingerRuns = [];
  for (const dy of BANDS) {
    const q0 = await state();
    await page.waitForTimeout(1600);
    const q1 = await state();
    const bandIdle = movedIn(q0.dye, q1.dye, dy);
    const p0 = await state();
    await page.evaluate(async (yOff) => {
      const d = window.chromaglassDebug();
      const f = d.fluids[0], N = d.gridSize;
      for (let k = 0; k <= 16; k++) {
        f.fingerDrag(N * (0.35 + 0.018 * k), N / 2 + yOff, 7, 0.09, 3, 0);
        await new Promise(r => setTimeout(r, 90));
      }
    }, dy);
    const p1 = await state();
    const bandFinger = movedIn(p0.dye, p1.dye, dy);
    fingerRuns.push({ dy, idle: bandIdle, finger: bandFinger, ratio: bandIdle > 0 ? bandFinger / bandIdle : 0 });
  }
  const a = await state();
  const b = a;
  const bandRatio = [...fingerRuns.map(r => r.ratio)].sort((x, y) => x - y)[1];
  // And the controls: the plate's own velocity API, and the blow, driven the
  // same way and for the same time.
  const runTool = async (name, fn) => {
    const p0 = await state();
    await page.evaluate(async (which) => {
      const d = window.chromaglassDebug();
      const f = d.fluids[0], N = d.gridSize;
      for (let k = 0; k <= 16; k++) {
        const x = Math.round(N * (0.35 + 0.018 * k)), y = Math.round(N / 2);
        if (which === 'addVelocity') {
          for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) {
            if (i * i + j * j > 64) continue;
            f.addVelocity(x + i, y + j, 0.5, 0);
          }
        } else if (which === 'blow') {
          f.blowDirected(x, y, 6, 0.09, 1, 0);
        }
        await new Promise(r => setTimeout(r, 90));
      }
    }, name);
    const p1 = await state();
    const m = moved(p0.dye, p1.dye);
    console.log(`  ${name}: speed ${p1.speed.toExponential(2)}, dye moved ${m.toFixed(4)}`);
    return m;
  };
  const velMoved = await runTool('addVelocity', null);
  await runTool('blow', null);
  console.log(`  finger: speed ${b.speed.toExponential(2)}, three bands ` +
    fingerRuns.map(r => `${r.finger.toFixed(4)}/${r.idle.toFixed(4)}=${r.ratio.toFixed(2)}x`).join('  '));
  const idleMoved = i1.moved;
  // Kept for the controls below, which run down the middle.
  const fingerMoved = fingerRuns.find(r => r.dy === 0).finger;
  console.log('');
  check('a finger moves the liquid it is drawn through',
    bandRatio > 1.4,
    `${bandRatio.toFixed(2)}x what an idle plate moves in the same window, ` +
    `the middle of three bands each against its own idle`);
  /*
    And the control that explains why it has to carry the dye itself.

    A localised blob of velocity is mostly a gradient, and a gradient is what
    the projection exists to remove — so adding velocity, at any strength, does
    not move the liquid. This check exists to stop anyone adding a tool that
    only adds velocity and believing it works.
  */
  check('and adding velocity alone still would not have',
    velMoved < idleMoved * 1.25,
    `${(velMoved / idleMoved).toFixed(2)}x idle for a push of 0.5 a cell, which is 250 times the speed clamp`);
} finally { await browser.close(); stop(); }
process.exit(checks.some(c => !c.ok) ? 1 : 0);
