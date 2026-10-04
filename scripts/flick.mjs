#!/usr/bin/env node
/**
 * A flicked plate's liquid trails the glass (PLAN.md 22h), in the app's own
 * frame loop.
 *
 *   npm run flick
 *
 * Until 22h a look's own turning (its motor, the music routed to rotation, a
 * flick) turned the picture rigidly, as if the liquid were bolted to the
 * glass, while only Auto Spin and the Spin tool went through the liquid's
 * drag. Now there is one dish: everything that turns it adds, the liquid
 * follows the sum with its gap's drag time τ = h²/12ν (three seconds for
 * water, 0.15 s for the thick liquid), and the picture turns with the liquid.
 * `npm run turntable` holds dishFrame, the arithmetic, to the physics; this
 * holds the frame to dishFrame, which is what a mutant reverting the frame to
 * a rigid picture would get past the node check with.
 *
 *   1. a look nobody turns (no motor, no music) has its liquid exactly still
 *      and its picture's angle unchanged over a second, while the frame loop
 *      draws at least ten frames (still, not stalled), once the plate draws
 *      twenty frames a second (it waits for that: the shaders build first);
 *   2. a flick on a plate of water: a moment later the liquid's speed is the
 *      exact answer for a dish coasting on its bed, ω_l = Ω0 (e^(−Dt) −
 *      e^(−t/τ)) / (1 − Dτ) at the page's own elapsed time, within a factor
 *      of 1.5 either way (a frame's jitter on a busy runner is a factor of
 *      about 1.1 there). A rigid picture reads ten times that; a liquid that
 *      never follows reads zero;
 *   3. and the picture turned with the liquid, not the glass: through the
 *      angle the liquid's speed integrates to, within 1.5× (about a twentieth
 *      of the glass's turn; rigid reads all of it);
 *   4. the solver was handed the dish's drag, Ω − ω_l, at least half the
 *      dish's speed, and the twist is the motor's alone, zero here: the
 *      flick no longer stirs the current with a term of its own;
 *   5. two drag times later, the angle the picture has lost to the glass is
 *      the drag time's, to 15%: the speeds have nearly met by then and cannot
 *      tell τ apart, but the angle lost on the way is ∫(Ω − ω_l) and grows
 *      with τ (half τ reads half as much, 1.4 τ a quarter more, rigid none);
 *   5b. the turntable's share goes through the same liquid: a dish set
 *      turning by the turntable alone (as a hand on the Spin tool lets go of
 *      it), with no flick, has its water follow at check 2's speed;
 *   6. on the thick liquid the picture is with the glass within 0.4 s
 *      (above three quarters of its speed; water would be under a sixth).
 *
 * It reads the plate's refs (`chromaglassDebug().spin`, `.liquidSpin`,
 * `.rotation`, a solver's `lastStep`), not its frames, but the frame loop
 * only steps on a GPU that draws, so it runs on the Mac shards.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, installFrameReader } from './frame.mjs';

const PORT = 4364;
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

// The drag times, as lib/turntable.ts works them out, and the bed's drag on
// the dish, as the frame's flywheel does (its Plate Pressure read off the page).
const TAU = { thin: (0.006 ** 2) / (12 * 1e-6), thick: (0.006 ** 2) / (12 * 2e-5) };
const DRAG = 0.05;
const bedOf = (viscosity, press) => (0.04 + DRAG * 1.2) * (viscosity === 'thin' ? 0.8 : 1.7) * (1 + press * 0.8);

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  page.on('console', m => { const t = m.text(); if (/error|invalid/i.test(t)) console.log('  [page]', t.slice(0, 140)); });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const has = await page.evaluate(() => {
    const d = window.chromaglassDebug?.();
    return typeof d?.flick === 'function' && !!d.liquidSpin && !!d.spin;
  });
  check('the page is running the build that was just made', has, has ? 'flick() and liquidSpin present' : 'stale bundle');
  if (!has) process.exit(1);

  // One plate, no motor, no music, no Auto Spin, no ambient drift on the twist:
  // a flick is the only thing that turns the dish.
  const quiet = (viscosity) => page.evaluate(({ viscosity, drag }) => {
    const d = window.chromaglassDebug();
    Object.assign(d.settings, {
      layerCount: 1, rotationSpeed: 0, spinWander: 0, spinAuto: 0, spinDrag: drag,
      viscosity, audioMappings: { ...(d.settings.audioMappings ?? {}), rotation: 'none' },
    });
    d.spin.current.fill(0);
    d.turntable.current.fill(0);
    d.liquidSpin.current.fill(0);
  }, { viscosity, drag: DRAG });
  /*
    Read inside an animation frame, after the app's own frame callback (it
    asked for this frame during the one before, so it runs first), and
    flick the same way: the speeds and angles read are then the ones the
    frame worked out at the time `at` says, not the last frame's, whenever
    that was. Read from a plain evaluate they were the last frame's against
    the page's clock at the read, and a frame loop that paused a tenth of a
    second before the read put the liquid that much behind its clock: a run
    on #258 read the water at 0.117 rad/s "after 0.30 s" against 0.179, the
    picture's angle at 0.41 of the liquid's, both what the drag time gives
    at 0.19 s, on a commit whose app the same check had passed on an hour
    before (0.176 against 0.186).
  */
  const read = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    const d = window.chromaglassDebug();
    const st = d.fluids[0]?.lastStep ?? null;
    resolve({
      at: performance.now(), frames: d.frames ?? 0, dish: (d.spin.current[0] ?? 0) + (d.turntable.current[0] ?? 0),
      liquid: d.liquidSpin.current[0] ?? 0, angle: d.rotation.current[0] ?? 0,
      handed: st ? (st.spinDish ?? 0) : null, twist: st ? (st.twist ?? 0) : null,
    });
  })));
  const flick = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    const d = window.chromaglassDebug();
    const a0 = d.rotation.current[0] ?? 0;
    d.flick(0);
    resolve({ at: performance.now(), frames: d.frames ?? 0, angle: a0, dish: d.spin.current[0] ?? 0 });
  })));

  /*
    Measured on a plate that draws, not one still building. The first run on
    CI's Mac read its first window 11 s after load and found five frames in a
    second and one 0.46 s frame across the flick: the shaders were still
    building (the cold load starts moving at about 9.5 s there, `npm run
    loadtime`), and the speeds were right but the checks that need a step
    after the flick saw none. So wait until a half second holds ten frames,
    twice running, for up to forty seconds, and say how long it took; and
    after each flick wait for frames as well as time.
  */
  const framesNow = () => page.evaluate(() => window.chromaglassDebug().frames ?? 0);
  const steadyFrom = Date.now();
  let steadyRuns = 0, lastRate = 0;
  while (steadyRuns < 2 && Date.now() - steadyFrom < 40000) {
    const a = await framesNow();
    await page.waitForTimeout(500);
    lastRate = (await framesNow()) - a;
    steadyRuns = lastRate >= 10 ? steadyRuns + 1 : 0;
  }
  console.log(`     the plate drew ${lastRate} frames a half second after a further ${((Date.now() - steadyFrom) / 1000).toFixed(1)} s`);
  const settle = async (ms, since) => {
    await page.waitForTimeout(ms);
    for (let k = 0; k < 40 && (await framesNow()) - since < 4; k++) await page.waitForTimeout(50);
  };

  // ── 1: nothing turning ──
  await quiet('thin');
  await page.waitForTimeout(1500);
  const s0 = await read();
  await page.waitForTimeout(1000);
  const s1 = await read();
  check('a look nobody turns: its liquid exactly still and its picture unturned, while the plate draws',
    s1.liquid === 0 && s1.angle === s0.angle && s1.frames - s0.frames >= 10,
    `liquid ${s1.liquid}, the angle moved ${(s1.angle - s0.angle).toExponential(2)} rad over ${s1.frames - s0.frames} frames`);

  // ── 2–4: a flick on water ──
  // The frame reads an unset Plate Pressure as 0 (`?? 0` in its flywheel).
  const press = await page.evaluate(() => window.chromaglassDebug().settings.platePressure ?? 0);
  const D = bedOf('thin', press), T = TAU.thin;
  // A dish set to Ω0 and coasting on its bed, from rest: the glass's angle,
  // the liquid's speed behind it, and the angle the liquid (the picture) turns.
  const glassTurn = (O0, t) => O0 * (1 - Math.exp(-D * t)) / D;
  const behind = (O0, t) => O0 * (Math.exp(-D * t) - Math.exp(-t / T)) / (1 - D * T);
  const liquidTurn = (O0, t) => O0 * ((1 - Math.exp(-D * t)) / D - T * (1 - Math.exp(-t / T))) / (1 - D * T);
  const f = await flick();
  await settle(300, f.frames);
  const w = await read();
  const t = (w.at - f.at) / 1000;
  const want = behind(f.dish, t);
  const ratio = w.liquid / want;
  check('a flick on water: the liquid trails the glass by its drag time', ratio > 1 / 1.5 && ratio < 1.5,
    `${w.liquid.toFixed(3)} rad/s after ${t.toFixed(2)} s against the dish's ${w.dish.toFixed(3)}; the drag time says ${want.toFixed(3)}`);
  const turned = (w.angle - f.angle) / liquidTurn(f.dish, t);
  check('and the picture turns with the liquid, not the glass', turned > 1 / 1.5 && turned < 1.5,
    `${(w.angle - f.angle).toFixed(4)} rad, the liquid's ${liquidTurn(f.dish, t).toFixed(4)}, the glass's ${glassTurn(f.dish, t).toFixed(3)}`);
  check('the solver is handed the dish\'s drag on the liquid, and the flick stirs nothing of its own',
    w.handed !== null && Math.abs(w.handed) > 0.5 * Math.abs(w.dish) && w.twist === 0,
    `Ω − ω_l ${w.handed?.toFixed(3)} rad/s, twist ${w.twist}`);

  // ── 5: caught up ──
  await page.waitForTimeout(2 * TAU.thin * 1000);
  const c = await read();
  const tc = (c.at - f.at) / 1000;
  const lost = glassTurn(f.dish, tc) - (c.angle - f.angle), lostWant = glassTurn(f.dish, tc) - liquidTurn(f.dish, tc);
  check('two drag times later the picture has lost the drag time\'s angle to the glass', Math.abs(lost - lostWant) < 0.15 * Math.abs(lostWant),
    `${lost.toFixed(3)} rad behind after ${tc.toFixed(1)} s, the drag time says ${lostWant.toFixed(3)}; the water at ${c.liquid.toFixed(3)}, the glass ${c.dish.toFixed(3)} rad/s`);

  // ── 5b: the turntable's share, no flick ──
  await quiet('thin');
  await page.waitForTimeout(1000);
  const g = await page.evaluate((O0) => {
    const d = window.chromaglassDebug();
    d.turntable.current[0] = O0;
    return { at: performance.now(), frames: d.frames ?? 0, dish: O0 };
  }, f.dish);
  await settle(300, g.frames);
  const u = await read();
  const tu = (u.at - g.at) / 1000;
  const uRatio = u.liquid / behind(g.dish, tu);
  check('a dish the turntable turns drags the same water the same way', uRatio > 1 / 1.5 && uRatio < 1.5,
    `${u.liquid.toFixed(3)} rad/s after ${tu.toFixed(2)} s, the drag time says ${behind(g.dish, tu).toFixed(3)}`);

  // ── 6: the thick liquid ──
  await quiet('thick');
  await page.waitForTimeout(1000);
  const fk = await flick();
  await settle(400, fk.frames);
  const k = await read();
  // 0.93 of the glass by the drag time; water would read under a sixth.
  check('on the thick liquid the picture is with the glass at once', k.liquid > 0.75 * k.dish && k.dish > 0,
    `${k.liquid.toFixed(3)} against ${k.dish.toFixed(3)} rad/s`);
} finally { await browser.close(); stop(); }
console.log(bad ? `\n${bad} failed` : '\nall flick checks passed');
process.exit(bad ? 1 : 0);
