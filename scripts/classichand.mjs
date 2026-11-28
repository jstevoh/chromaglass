#!/usr/bin/env node
/**
 * Lava Pop under its own hand, sheared toward a real show's pace (PLAN 38w-28).
 *
 *   npm run classichand                       (any adapter that computes: scripts/lab.mjs)
 *   node scripts/classichand.mjs --hand=look plateRock=0.5 beatSqueeze=1   a look's dials changed, no asks
 *   node scripts/classichand.mjs --hand=discs                               the old glass kick alone
 *   node scripts/classichand.mjs --frames=<dir>                             and its frames, for a film
 *
 * What was reported (the owner's round five, 2026-11-22, read with `npm run
 * watch`): Lava Pop's water moved a tenth of the 1969 speed. Its own motion
 * 0.7 % of the frame a second against the Joshua Light Show's 8.0 and a bar
 * band's 2.0, a picture's forms turning over in 10.7 s against 1.5 to 2.4,
 * and 80% of what moved was the whole picture sliding, against 14 to 16% in
 * the real shows. Liquids only interact where the water shears; ours slid.
 *
 * What was measured (handoff 38w-28): Lava Pop's kick never pressed (Beat
 * Squeeze 0), and Plate Rock at 0.8, 4.5 times past a real hand's lean,
 * slides every buoyant cell together (Hele-Shaw): that was the 80%. A press
 * across the dish shears the water against the oil, which is the period
 * hand (a second glass pressed on the beat). Pressed as the old discs (the
 * stamp closed by the shader's Stefan film, given back linearly) it reached
 * the pace and pumped the oil out of the frame: 66% of it in the middle
 * third went to 44% in eight seconds, a press and a release down two
 * different paths of shapes (lib/glassPress.ts). Pressed as one rigid glass
 * it keeps the oil where it is.
 *
 * The plate: Lava Pop's own dish, laid by the app's seedPreset (as
 * classicdish lays it), its step as the app's FluidSimulation hands the
 * solver (`lastStep`), 120 bpm kicks driven through the app's own functions
 * (kickRock, stepRock, rockSwing, rockStep, rockPast for the rock; kickDepth
 * and kickPress for the press), the glass through lab.glassPress (the
 * GlassPress the app's pressKick uses) and the sheet through lab.sheetPress.
 * Rendered at W² ten times a second and read with `npm run watch`'s own
 * physics and design reads (watchphysics, watchdesign), the numbers the
 * round-five film was read with. The lab read the owner's film's 0.7 %/s and
 * 80% whole to within the read's spread on main's look.
 *
 * Asked, on the look as shipped:
 *   1. the look presses the whole glass on the kick (Press the Whole Glass,
 *      Beat Squeeze up), its Plate Rock is a real hand's lean (at or under
 *      ROCK_REAL), and the app's own kickPress and layKick send that kick to
 *      the glass, the frame loop handing kickPress the switch
 *   2. the water sheared rather than slid: its own motion at least OWN_MIN,
 *      its forms turning over no slower than TURN_MAX, and the whole
 *      picture's slide no more than WHOLE_MAX of what moves (main's hand
 *      fails all three; the real shows' pace is PLAN 38w-36's)
 *   3. the glass pressed: every kick on it, as deep as the stamp, the gap
 *      under it down at the first kick's bottom, and opened again
 *   4. the oil kept in the frame: its share inside the middle third of the
 *      dish, read each second from the first, within KEPT points of where it
 *      started, and the gap there back at rest between kicks
 *   5. the colour kept: the last second's colourfulness at least COLOUR of
 *      the first second's
 *   6. the control: the same kicks pressed as the old discs (no render, the
 *      oil read only) lose more than PUMPED points of the oil in the frame,
 *      so ask 3 can see a pump
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openLab } from './lab.mjs';
import { physicsAcc, physicsFrame, physicsSummary, REAL_SHOWS } from 'reelreader/scripts/watchphysics.mjs';
import { designFrame, designSummary, paletteAcc } from 'reelreader/scripts/watchdesign.mjs';

const args = process.argv.slice(2);
const flag = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const HAND = flag('hand') ?? 'check';
const FRAMES = flag('frames');
const over = Object.fromEntries(args.filter((a) => !a.startsWith('--')).map((a) => { const [k, v] = a.split('='); return [k, v === 'true' ? true : v === 'false' ? false : Number(v)]; }));
const N = Number(process.env.N) || 256, GRID = 192, SECONDS = Number(process.env.SECS) || 6, RATE = Number(process.env.RATE) || 10, W = 320;

/*
  The bars. Main's hand read 0.42 %/s own, turnover 7.78 s and 0.77 of
  what moved the whole picture sliding (here, 6 s at 256²); this PR's,
  0.79, 4.22 s and 0.22. The real shows (watchphysics REAL_SHOWS) are 1.96
  to 8.0 %/s, 1.5 to 2.4 s and 0.14 to 0.16: the rigid glass and a real
  rock go about half the way, and the rest is PLAN 38w-36, whose bars are
  the real shows' (printed beside these). These hold what shipped: main's
  hand fails all three.
*/
const OWN_MIN = 0.7;
const TURN_MAX = 5;
const WHOLE_MAX = 0.3;
const REAL = `real shows ${Math.min(...REAL_SHOWS.map((x) => x.own))}–${Math.max(...REAL_SHOWS.map((x) => x.own))} %/s, ${Math.min(...REAL_SHOWS.map((x) => x.turnover))}–${Math.max(...REAL_SHOWS.map((x) => x.turnover))} s, ${Math.min(...REAL_SHOWS.map((x) => x.wholeShare))}–${Math.max(...REAL_SHOWS.map((x) => x.wholeShare))}`;
const KEPT = 2.5;    // points of the oil in the middle third over 5 s; the glass lost 1.7, the old discs 23
const PUMPED = 10;
const COLOUR = 0.9;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'node_modules', '.cache', 'classichand', 'app.mjs');
mkdirSync(dirname(out), { recursive: true });
await build({
  stdin: { contents: "export { FluidSimulation } from './src/sim/fluidSimulation.ts'; export { PRESETS } from './src/presets.ts'; export { DEFAULT_SETTINGS } from './src/types.ts'; export { setShowSeed } from './src/lib/rng.ts'; export * from './src/lib/plateRock.ts'; export { kickDepth, kickPress, KICK_HOLD } from './src/lib/squish.ts'; export { thinGapViscosity } from './src/gpu/fluid/constants.ts'; export { layKick } from './src/sim/kickLay.ts'; export { GlassPress, glassDepth } from './src/lib/glassPress.ts'; export { KickRelease, PressLifts } from './src/lib/squish.ts'; export { RhythmSheet } from './src/lib/sheet.ts';", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
globalThis.GPUTextureUsage ??= { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
globalThis.GPUBufferUsage ??= { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
globalThis.GPUMapMode ??= { READ: 1, WRITE: 2 };
globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const app = await import(pathToFileURL(out).href);
const look = app.PRESETS.find((p) => p.id === 'classic').settings;
const shipped = { ...app.DEFAULT_SETTINGS, ...look };
const glassDepthOf = (a) => app.glassDepth(a, 3);
const ROCK_REAL = app.ROCK_REAL_TO;   // lib/plateRock.ts: a real hand's lean, 0.45

/** The look's liquid laid and its step read, as the app hands them to the solver (classicdish's appLay). */
function layLook(settings) {
  app.setShowSeed(1);
  const sim = new app.FluidSimulation(GRID, 0, 0, 0.1);
  const lay = { mixes: [], water: null, oil: null };
  sim.gpu = new Proxy({ N, addMix: (x, y, r, o) => { lay.mixes.push({ x, y, r, oil: o.oil }); },
    layDye: (dye, o) => { if (dye.length !== N * N * 4) return false; lay.oil = Array.from(o); lay.water = Array.from(dye, (v, i) => v - lay.oil[i]); return true; },
    layShare: () => {} }, { get: (t, k) => t[k] });
  sim.addDensity = () => {}; sim.addOilDensity = () => {};
  sim.seedPreset('classic', () => 0);
  sim.gpu = null;
  let t = 0;
  for (let k = 0; k < 120; k++) { t += 1 / 60; sim.step(settings, t, () => 0); }
  const P = {};
  for (const [k, v] of Object.entries(sim.lastStep)) if (typeof v !== 'object' || Array.isArray(v)) P[k] = v;
  if (process.env.POVER) Object.assign(P, JSON.parse(process.env.POVER));   // a probe's change to the solver's step
  return { P, lay };
}

/**
 * The hand a step at a time, on node: the rock the solver takes and where a
 * kick presses, at 120 bpm (a beat every 30 steps at 60 a second), the bass
 * a kick usually reads (0.8). `press` is 'glass', 'sheet' or 'discs'.
 */
function handOf(settings, press) {
  const R = settings.plateRock ?? 0, SQ = settings.beatSqueeze ?? 0;
  const nu = app.thinGapViscosity(settings.gapThickness);
  const kp = app.kickPress(nu, settings.frameSway ?? 0, undefined, press !== 'sheet');
  let seed = 5; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const rock = app.restingHand();
  const hand = [];
  for (let k = 0; k < SECONDS * 60; k++) {
    let kick = null;
    if (k % 30 === 0) {
      if (R > 0) app.kickRock(rock, 0.8, 1);
      // Where the app lands it (sim/tools.ts kickCenter): the sheet anywhere in the middle half, the glass within 30 cells of 128 of the middle.
      const spread = press === 'sheet' ? 0.5 : 30 / 128;
      if (SQ > 0) kick = { x: 0.5 + (rnd() - 0.5) * spread, y: 0.5 + (rnd() - 0.5) * spread, a: app.kickDepth(SQ, 0.8, 1) * kp.share, radii: kp.radii };
    }
    app.stepRock(rock, 1 / 60);
    const [sx, sy] = app.rockSwing(rock, R, 0, 0);
    hand.push({ kick, ...app.rockStep(sx * app.HOLD_TILT, sy * app.HOLD_TILT, sx, sy, app.rockPast(R)) });
  }
  return { hand, nu, kp };
}

/** One run: the look's dish under a hand, rendered (or not) and read. */
async function run(settings, press, render, label) {
  const { P, lay } = layLook(settings);
  const { hand, nu, kp } = handOf(settings, press);
  console.log(`${label}: Beat Squeeze ${settings.beatSqueeze}, Plate Rock ${settings.plateRock}, the kick ${press} (${kp.radii.join('/')} of 128), ${SECONDS} s at ${N}²`);
  const { page, close } = await openLab();
  try {
    await page.evaluate(async ({ N, P, lay }) => {
      await lab.create(N, N);
      await lab.step(1, { ...P, dt: 1e-6 });
      const sv = lab.solver();
      for (const m of lay.mixes) sv.addMix(m.x, m.y, m.r, { oil: m.oil });
      lab.addDye(lay.water); lab.addOilDye(lay.oil); lab.flush();
    }, { N, P, lay });
    const phys = physicsAcc(), design = [], pacc = paletteAcc(), oil = [], gaps = [];
    let least = null, glass = null;
    const t0 = Date.now();
    const per = 60 / RATE;
    for (let f = 0; f < SECONDS * RATE; f++) {
      const got = await page.evaluate(async ({ P, hand, nu, from, n, W, s, press, render, read, bottom, curve, down }) => {
        for (let k = from; k < from + n; k++) {
          const h = hand[k];
          if (h.kick) {
            const L = lab.solver().N ?? 256;
            if (press === 'glass') lab.glassPress(h.kick.x, h.kick.y, h.kick.a, h.kick.radii, down);
            else if (press === 'sheet') lab.sheetPress(h.kick.x, h.kick.y, h.kick.a, nu, undefined, curve);
            else globalThis.__discs = { cx: Math.round(h.kick.x * L), cy: Math.round(h.kick.y * L), radii: h.kick.radii.map((r) => Math.round(r * L / 128)), a: h.kick.a, k: 0 };
          }
          // The old glass kick (FluidSimulation.pressKick before 38w-28): the discs stamped, held against the spring, given back linearly over 20 steps.
          const g = globalThis.__discs;
          if (press === 'discs' && g) {
            const amt = g.k === 0 ? g.a : g.k < 9 ? g.a * P.gapSpring / 0.30 ** 3 : g.k < 29 ? -g.a / 20 : 0;
            if (amt) for (const r of g.radii) lab.squish(g.cx, g.cy, r, amt, 0, 'press', 0, true);
            g.k++;
          }
          lab.sheetStep(1 / 60, P.gapSpring, curve);
          lab.glassStep(1 / 60, P.gapSpring, curve);
          lab.flush();
          await lab.step(1, { ...P, rockX: h.rockX, rockY: h.rockY, rockGain: h.rockGain }, true);
        }
        const px = render ? Array.from(await lab.render(W, s, { zoom: 1, macroAmount: 0 })) : null;
        let inner = null, gap = null;
        if (read) {
          // The oil's share inside the middle third of the dish (r < 1/3 of the width), of all of it.
          const m = await lab.chemistry('mix'); const M = m.n; let all = 0, mid = 0;
          for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) { const c = m.data[(i + j * M) * 4]; if (Math.hypot((i + 0.5) / M - 0.5, (j + 0.5) / M - 0.5) < 1 / 3) mid += c; all += c; }
          inner = 100 * mid / all;
          // And the gap there, which a glass that came back up where it went down leaves at rest.
          const q = await lab.squeeze(); let gm = 0, gn = 0;
          if (q) for (let j = 0; j < q.n; j++) for (let i = 0; i < q.n; i++) if (Math.hypot((i + 0.5) / q.n - 0.5, (j + 0.5) / q.n - 0.5) < 1 / 3) { gm += q.gap[i + j * q.n]; gn++; }
          gap = gn ? gm / gn : null;
        }
        // The glass at the bottom of the first kick (0.2 s after it, the depth at 95% of its way down): the least gap in the middle third.
        let least = null;
        if (bottom) {
          const q = await lab.squeeze();
          if (q) { least = 1; for (let j = 0; j < q.n; j++) for (let i = 0; i < q.n; i++) if (Math.hypot((i + 0.5) / q.n - 0.5, (j + 0.5) / q.n - 0.5) < 1 / 3) least = Math.min(least, q.gap[i + j * q.n]); }
        }
        return { px, inner, gap, least, glass: lab.glassState() };
      }, { P, hand, nu, from: f * per, n: per, W, s: settings, press, render, read: f % RATE === RATE - 1, bottom: f === Math.round(0.2 * RATE) - 1, curve: P.plateCurve ?? 0, down: process.env.DOWN ? Number(process.env.DOWN) : undefined });
      if (got.inner != null) { oil.push(got.inner); gaps.push(got.gap); }
      if (got.least != null) least = got.least;
      glass = got.glass;
      if (got.px) {
        const rgb = new Uint8Array(W * W * 3);
        for (let i = 0; i < W * W; i++) { rgb[i * 3] = got.px[i * 4]; rgb[i * 3 + 1] = got.px[i * 4 + 1]; rgb[i * 3 + 2] = got.px[i * 4 + 2]; }
        physicsFrame(rgb, W, W, phys, f);
        design.push(designFrame(rgb, W, W, pacc));
        if (FRAMES) { mkdirSync(FRAMES, { recursive: true }); writeFileSync(join(FRAMES, `${label}-${String(f).padStart(3, '0')}.rgb`), rgb); }
      }
    }
    const res = { oil, gaps, least, glass, kicks: hand.filter((h) => h.kick).length, depth: hand.find((h) => h.kick)?.kick, seconds: (Date.now() - t0) / 1000 };
    if (render) {
      const ds = designSummary(design, pacc);
      const ps = physicsSummary(phys, { rate: RATE, cut: design.map(() => false), W, scale: ds.scaleX?.med ?? null });
      const col = design.map((d) => d.colourfulness).filter((x) => Number.isFinite(x));
      const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
      Object.assign(res, { colours: col.length, own: ps.own.med, whole: ps.wholeShare, turnover: ps.turnover, speed: ps.speed.med, colourStart: mean(col.slice(0, RATE)), colourEnd: mean(col.slice(-RATE)) });
    }
    const r = (x, d = 2) => (x == null || !Number.isFinite(x) ? '-' : x.toFixed(d));
    console.log(`  oil in the middle third ${oil.map((x) => x.toFixed(1)).join(' → ')} %, the gap there ${gaps.map((x) => (x ?? 0).toFixed(5)).join(' → ')}` + (render ? `; own ${r(res.own)} %/s, turnover ${r(res.turnover)} s, whole ${r(res.whole)}, colourfulness ${r(res.colourStart, 1)} → ${r(res.colourEnd, 1)}` : '') + ` (${res.seconds.toFixed(0)} s)`);
    return res;
  } finally { await close(); }
}

if (HAND !== 'check') {
  const s = { ...shipped, ...over };
  await run(s, HAND === 'look' ? (s.kickGlass ? 'glass' : 'sheet') : HAND, HAND !== 'discs' && !args.includes('--oil'), HAND);
  process.exit(0);
}

const checks = [];
const check = (name, ok, detail = '') => { checks.push(ok); console.log(`${ok ? ' ok  ' : ' FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const r = (x, d = 2) => (x == null || !Number.isFinite(x) ? '-' : x.toFixed(d));
/*
  And the app routes it there: the lab calls GlassPress itself, so this asks
  the app's own pieces. kickPress with the look's switch picks the glass's
  discs, and FluidSimulation's pressKick (sim/kickLay.ts layKick) on a thin
  gap hands such a kick to the glass, never to the old discs' KickRelease;
  the frame loop passes the switch to kickPress (LiquidVisualizer).
*/
const plate = { size: GRID, gpu: { coverMetres: 0.002 }, thinGap: true, pressLift: new app.PressLifts(), sheet: new app.RhythmSheet(), glassPress: new app.GlassPress(), kickRelease: new app.KickRelease(), pressedCells: { hand: 0, kick: 0, bubble: 0 }, pressedDepth: { hand: 0, kick: 0, bubble: 0 }, dishKicks: [], applySquish() {} };
const kp = app.kickPress(app.thinGapViscosity(shipped.gapThickness), shipped.frameSway ?? 0, undefined, shipped.kickGlass);
app.layKick(plate, GRID / 2, GRID / 2, app.kickDepth(shipped.beatSqueeze, 0.8, 1) * kp.share, 0, kp.radii, 1e-6, 0);
const frameLoop = readFileSync(join(root, 'src/components/LiquidVisualizer.tsx'), 'utf8');
const passes = /kickPress\(nu, currentSettings\.frameSway \?\? 0, [^)]*currentSettings\.kickGlass\)/.test(frameLoop);
check('1. Lava Pop presses the whole glass on the kick, rocked at a real hand\'s lean, and the app routes it to the glass',
  shipped.kickGlass === true && shipped.beatSqueeze > 0 && (shipped.plateRock ?? 0) > 0 && shipped.plateRock <= ROCK_REAL
    && kp.radii.length === 3 && plate.glassPress.kicksPressed === 1 && plate.kickRelease.kicks === 0 && plate.pressedCells.kick > 0 && passes,
  `Press the Whole Glass ${shipped.kickGlass}, Beat Squeeze ${shipped.beatSqueeze}, Plate Rock ${shipped.plateRock} (real to ${ROCK_REAL}); kickPress ${kp.radii.join('/')}; layKick: ${plate.glassPress.kicksPressed} on the glass, ${plate.kickRelease.kicks} on the discs; the frame loop ${passes ? 'passes' : 'does not pass'} the switch`);
const [now, discs] = await Promise.all([run(shipped, shipped.kickGlass ? 'glass' : 'sheet', true, 'now'), run(shipped, 'discs', false, 'discs')]);
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
check('2. the water sheared, not slid: twice main\'s pace or more, the slide under a third',
  fin(now.own) && fin(now.turnover) && fin(now.whole) && now.own >= OWN_MIN && now.turnover <= TURN_MAX && now.whole <= WHOLE_MAX,
  `own ${r(now.own)} %/s (at least ${OWN_MIN}), turnover ${r(now.turnover)} s (at most ${TURN_MAX}), whole ${r(now.whole)} of what moves (at most ${WHOLE_MAX}); ${REAL}, PLAN 38w-36`);
/*
  The glass pressed: every kick of the hand landed on it, it went as deep as
  the stamp asked, the plate's gap went down under it (read at the bottom of
  the first kick), and opened again (no more than it closed: the spring gives
  back the share of the dent it took, which the glass pressed again each step,
  so the gap back at rest is ask 4's). Without this, ask 4 passes
  on a plate no kick touched (check-skeptic: Beat Squeeze 0 read 65.8 → 65.7%,
  the gap at rest, as the shipped run reads).
*/
const g = now.glass, want = glassDepthOf(now.depth?.a ?? 0);
check('3. the glass pressed on every kick, as deep as the stamp, and let back up',
  !!g && g.kicks === now.kicks && now.kicks === 2 * SECONDS && g.deepest >= 0.9 * want && fin(now.least) && now.least <= 0.03 - 0.5 * want && g.opened > 0 && g.opened <= g.closed,
  g ? `${g.kicks} of ${now.kicks} kicks on the glass (${2 * SECONDS} beats), ${r(g.deepest, 4)} deep at the middle (the stamp ${r(want, 4)}), the least gap at the first kick's bottom ${r(now.least, 4)} (at most ${r(0.03 - 0.5 * want, 4)}), ${r(g.opened, 1)} opened against ${r(g.closed, 1)} closed` : 'no glass');
const kept = now.oil.at(-1) - now.oil[0];
const atRest = now.gaps.length === SECONDS && now.gaps.every((x) => fin(x) && Math.abs(x - 0.03) < 3e-4);
check('4. the oil kept in the frame, the glass back at rest between kicks', Math.abs(kept) <= KEPT && atRest,
  `${r(now.oil[0], 1)} → ${r(now.oil.at(-1), 1)} % in the middle third (within ${KEPT} points); the gap there ${now.gaps.map((x) => r(x, 5)).join(', ')} (rest 0.03000)`);
check('5. the colour kept', now.colours >= 2 * RATE && now.colourStart > 0 && now.colourEnd >= COLOUR * now.colourStart, `colourfulness ${r(now.colourStart, 1)} → ${r(now.colourEnd, 1)} (at least ${COLOUR * 100}%, ${now.colours} frames read)`);
const lost = discs.oil[0] - discs.oil.at(-1);
check('6. the control: the old discs pump the oil out of the frame', lost > PUMPED, `${r(discs.oil[0], 1)} → ${r(discs.oil.at(-1), 1)} % (more than ${PUMPED} points lost)`);
const failed = checks.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} of ${checks.length} FAIL` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
