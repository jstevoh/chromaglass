#!/usr/bin/env node
/**
 * The two glasses, and what a hand does to them.
 *
 *   1. a press moves dye, and keeps moving it after the finger lifts
 *   2. the plates leave a dome, so dye gathers where the gap is wide
 *   3. a spun plate drags its liquid round with it
 *   4. a blow keeps the dye moving after the push has been projected away
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, installFrameReader } from './frame.mjs';

const PORT = 4334;
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

let bad = 0;
const check = (n, ok, d = '') => { if (!ok) bad++; console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  page.on('console', m => { const t = m.text(); if (/error|invalid/i.test(t)) console.log('  [page]', t.slice(0, 140)); });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  /*
    The plate is slowed right down, and every window is the same length.

    The first version compared a 400ms press against a 1.5s idle baseline and
    reported the press as *less* movement than doing nothing, which is
    arithmetic and not physics. And at the preset's own speed the plate moves
    more on its own than any of these tools do, so the signal was buried
    under the plate regardless. Both of those are the instrument.
  */
  await page.evaluate(() => {
    const d = window.chromaglassDebug();
    d.settings.automateRate = 0;
    d.settings.globalSpeed = 0.004;
  });
  await page.waitForTimeout(3000);
  const WIN = 1500;

  // How much the dye field changed between two readings: the plate's own
  // motion is the baseline every claim here is measured against.
  const snap = () => page.evaluate(() => [...window.chromaglassDebug().fluids[0].readDensity]);
  const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

  /*
    How fast the liquid is actually moving, which is what "it keeps moving"
    means, and what the dye-difference measure could not say.

    Both the press and the blow multiply the dye down where they act, so a
    measure built on absolute dye change falls after either of them simply
    because there is less dye left to change — and it read *below* an idle
    plate, which is how it was caught. Speed does not care how much dye there
    is.
  */
  const speed = () => page.evaluate(() => {
    const f = window.chromaglassDebug().fluids[0];
    const vx = f.readVx, vy = f.readVy;
    let s = 0;
    for (let i = 0; i < vx.length; i++) s += Math.hypot(vx[i], vy[i]);
    return s / vx.length;
  });
  const over = async (ms = WIN) => { const a = await snap(); await page.waitForTimeout(ms); return diff(a, await snap()); };
  // Two idle readings, so the baseline's own spread is known before anything
  // is compared against it.
  const b1 = await over(), b2 = await over();
  const vIdle = await speed();
  const base = (b1 + b2) / 2;
  console.log('  idle: ' + b1.toFixed(4) + ' and ' + b2.toFixed(4) + ' per ' + WIN + 'ms — baseline ' + base.toFixed(4) + '\n');

  // ── 1: a press, and what happens after it lifts ──
  const press = async () => page.evaluate(() => {
    const d = window.chromaglassDebug();
    const f = d.fluids[0], N = d.gridSize;
    f.applySquish(N / 2, N / 2, N * 0.22, 0.9, 0.4, false);
  });
  const hasPress = await page.evaluate(() => {
    const f = window.chromaglassDebug().fluids[0];
    return typeof f.applySquish === 'function';
  });
  if (!hasPress) {
    console.log('  (no press entry point on the plate; listing what it has)');
    const keys = await page.evaluate(() => Object.getOwnPropertyNames(
      Object.getPrototypeOf(window.chromaglassDebug().fluids[0])).filter(k => /press|squeez|plate|blow|gap/i.test(k)));
    console.log('   ', keys.join(', ') || '(none matched)');
  } else {
    /*
      Held, not tapped.

      The first version called the press once — a single frame — and measured
      nothing. A hand holds a press for a second or more, and the gap delta is
      zeroed after every flush, so one call is one frame of squeeze. Worse,
      the release now pulls liquid back on purpose, so a one-frame push
      followed by a slow lift very nearly cancels inside one window. That is
      the physics working and the instrument not.
    */
    const vPre = await speed();
    const a0 = await snap();
    for (let k = 0; k < 10; k++) { await press(); await page.waitForTimeout(90); }
    await page.waitForTimeout(WIN - 900);
    const during = diff(a0, await snap());
    const after = await over();
    const vAfter = await speed();
    check('a press moves the dye', during > base * 1.5, `${during.toFixed(4)} against ${base.toFixed(4)} idle`);
    check('and it keeps moving after the finger lifts', vAfter > vPre * 1.02,
      `liquid speed ${vAfter.toExponential(2)} against ${vPre.toExponential(2)} just before the press` +
      ` (dye change ${after.toFixed(4)}, which falls only because a press thins the dye)`);
  }

  // ── 4: a blow, and how long it lasts ──
  const hasBlow = await page.evaluate(() => typeof window.chromaglassDebug().fluids[0].blowAir === 'function');
  if (hasBlow) {
    /*
      The baseline is taken immediately before the blow, not at the top of
      the run.

      The plate settles for as long as this harness runs: liquid speed read
      3.55e-1 early and 3.02e-1 several minutes later with nothing done to
      it, so a blow measured late looked *slower than idle*. A control has to
      be contemporaneous with the thing it controls for.
    */
    const vBefore = await speed();
    const b0 = await snap();
    await page.evaluate(() => {
      const d = window.chromaglassDebug(); const N = d.gridSize;
      d.fluids[0].blowAir(Math.round(N * 0.45), Math.round(N * 0.5), N * 0.16, 2.2);
    });
    await page.waitForTimeout(WIN);
    const hit = diff(b0, await snap());
    const tail = [];
    for (let k = 0; k < 4; k++) { await page.waitForTimeout(WIN); tail.push(await speed()); }
    check('a blow moves the dye', hit > base * 1.5, `${hit.toFixed(4)} against ${base.toFixed(4)} idle`);
    console.log('     liquid speed afterwards, per window: ' + tail.map(v => v.toExponential(2)).join('  ') +
      ' (before the blow ' + vBefore.toExponential(2) + ')');
    check('and the movement continues rather than stopping with the puff',
      tail[tail.length - 1] > vBefore * 1.02,
      `${tail[tail.length - 1].toExponential(2)} six seconds later against ` +
      `${vBefore.toExponential(2)} measured just before the blow`);
  } else check('the plate has a blow', false, 'blowAir missing');

  // ── 3: a spun plate drags its liquid ──
  await page.evaluate(() => {
    const d = window.chromaglassDebug();
    d.settings.spinDrag = 0.05;
    d.spin.current.fill(0);
  });
  await page.waitForTimeout(800);
  const still = await over();
  await page.evaluate(() => { const d = window.chromaglassDebug(); d.flick(0); d.flick(0); });
  const spun = await over();
  check('a spun plate drags its liquid round with it', spun > still * 1.3,
    `${spun.toFixed(4)} while spinning against ${still.toFixed(4)} still`);

  // ── 2: the dome puts dye where the gap is wide ──
  const radial = () => page.evaluate(() => {
    const d = window.chromaglassDebug();
    const N = d.gridSize, dens = d.fluids[0].readDensity;
    let inner = 0, ki = 0, outer = 0, ko = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = Math.hypot(x - N / 2, y - N / 2) / (N / 2);
      if (r < 0.35) { inner += dens[x + y * N]; ki++; }
      else if (r > 0.6 && r < 0.95) { outer += dens[x + y * N]; ko++; }
    }
    return { inner: inner / ki, outer: outer / ko };
  });
  const setCurve = async (v) => { await page.evaluate(v => { window.chromaglassDebug().settings.plateCurve = v; }, v); await page.waitForTimeout(6000); };
  await setCurve(-0.9); const touchMiddle = await radial();
  await setCurve(0.9);  const touchRim = await radial();
  const rA = touchMiddle.inner / touchMiddle.outer, rB = touchRim.inner / touchRim.outer;
  check('the dome decides where the dye gathers', rB > rA,
    `centre/rim ${rA.toFixed(3)} when they meet in the middle, ${rB.toFixed(3)} when the rim is tight`);
} finally { await browser.close(); stop(); }
console.log(bad ? `\n${bad} failed` : '\nall plate checks passed');
