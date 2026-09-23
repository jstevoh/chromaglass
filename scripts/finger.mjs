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
  const inTrack = (i) => {
    const x = i % N, y = (i / N) | 0;
    return Math.abs(y - N / 2) <= 16 && x >= N * 0.33 && x <= N * 0.68;
  };
  const moved = (a, b) => {
    let s = 0, k = 0;
    for (let i = 0; i < a.length; i++) if (inTrack(i)) { s += Math.abs(a[i] - b[i]); k++; }
    return s / k;
  };

  // Idle, for the same window, so the plate's own motion is known.
  const i0 = await state();
  await page.waitForTimeout(1600);
  const i1 = await state();
  console.log(`  idle: speed ${i1.speed.toExponential(2)}, dye moved ${moved(i0.dye, i1.dye).toFixed(4)}`);

  // And the finger, dragged across the middle the way a hand goes.
  const a = await state();
  await page.evaluate(async () => {
    const d = window.chromaglassDebug();
    const f = d.fluids[0], N = d.gridSize;
    for (let k = 0; k <= 16; k++) {
      f.fingerDrag(N * (0.35 + 0.018 * k), N / 2, 7, 0.09, 3, 0);
      await new Promise(r => setTimeout(r, 90));
    }
  });
  const b = await state();
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
  console.log(`  finger: speed ${b.speed.toExponential(2)}, dye moved ${moved(a.dye, b.dye).toFixed(4)}`);
  const idleMoved = moved(i0.dye, i1.dye);
  const fingerMoved = moved(a.dye, b.dye);
  console.log('');
  check('a finger moves the liquid it is drawn through',
    fingerMoved > idleMoved * 1.4,
    `${(fingerMoved / idleMoved).toFixed(2)}x what an idle plate moves in the same window, along the same track`);
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
