#!/usr/bin/env node
/**
 * The lean display draws every look exactly as the whole one does (PLAN.md
 * 14v-12, `src/gpu/displayLean.ts`).
 *
 *   npm run leandisplay
 *   npm run leandisplay -- --looks classic,roy
 *
 * What was asked (the owner, 2026-11-14): the web app takes about thirty
 * seconds to start on a phone. What was measured: the plate's display, one
 * fragment shader holding every look's effects, was 7.63 s of a 9.61 s
 * opening on software WebGPU (`npm run openingtime`), where compiling is all
 * CPU, as on a phone. The opening now compiles a display with only the
 * effects its look can reach (each other one's uniform test fixed false by a
 * WGSL override) and builds the whole one behind the show.
 *
 * That is only worth having if no look changes. A compile with branches taken
 * out cannot draw a different picture where those branches would not have
 * run, but that rests on two things this check holds, rather than trusts:
 *
 *   1. The rewrite found each test it gates (a test renamed in the shader
 *      leaves its gate wrapping nothing, and the effect is then compiled in
 *      every lean display, which is safe but no longer lean): every gate in
 *      at least one place.
 *   2. Each look's lean display is the one it draws with, and draws it the
 *      same. Every shipped look, laid as `npm run samelook` lays it (its
 *      dyes, its liquid poured, a seeded stir; `--steps` to step it), drawn whole and
 *      lean, on the plate and in a close-up: the lean display must be the one
 *      that drew (a look whose own uniforms reach past what its settings say
 *      it can, the mapping in `displayMayMask` being wrong, falls back to the
 *      whole one and is a failure here, as it would be a slow first frame in
 *      the app), and the two pictures must be the same bytes. The lab's
 *      software WebGPU computes the same bytes for the same program every
 *      time (`npm run samelook` leans on that), so equal means equal.
 *
 * Controls, so the comparison is seen to see something:
 *   - a lean display with one gate the look uses taken out, drawn regardless
 *     (`leanDrop`), differs from the whole one: the gate really compiles
 *     that effect out, and the comparison sees it;
 *   - a look drawn with an effect its lean display left out (Classic with
 *     Lacing up, its display built for Classic as it ships) draws with the
 *     whole one and matches it: the frame's fallback.
 */
import { openLab } from './lab.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
};
const LOOKS = arg('looks', '').split(',').filter(Boolean);
const GRID = 128;
const SIZE = 160;
/*
  Steps before the pictures. None by default: what is compared is the
  display over the same fields, and stepping each look first compiles every
  part of the solver it switches on, which on software WebGPU made the forty
  looks a thirty-five-minute run (2026-11-14, five steps each: all passed, 85
  of 85). `--steps 5` runs it so.
*/
const STEPS = Number(arg('steps', '0'));

let fails = 0;
const check = (ok, what, detail) => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab({ tag: 'leandisplay' });
try {
  const counts = await page.evaluate(() => lab.displayGateCounts());
  const missing = counts.filter((c) => c.places === 0);
  check(!missing.length, 'every gate the lean display sets is found in the display\'s text', missing.length
    ? `not found: ${missing.map((c) => c.test).join(', ')}`
    : `${counts.length} gates in ${counts.reduce((a, c) => a + c.places, 0)} places`);

  const res = await page.evaluate(async ({ LOOKS, GRID, SIZE, STEPS }) => {
    const ids = LOOKS.length ? LOOKS : lab.lookIds();
    const N = GRID;
    const base = { thinGap: 1, gapThickness: 0.45, dt: 0.003, advection: 0.45, gapSpring: 0.00048, turbDetail: 3, meanDensity: 0, maxCurrent: 0.75 / (0.003 * 0.45 * (N - 2)), currentDamp: 0.99 };
    const PHYSICS = ['buoyancy', 'phaseSharp', 'magnetX', 'magnetY', 'magnetHeight', 'magnetStrength', 'oilTension', 'oilBodies',
      'ferroLabyrinth', 'mazeDetail', 'phaseDisplace', 'clearFilm', 'surfactantFlow', 'soapBreakdown', 'solutalBuoyancy',
      'doubleDiffusion', 'bzReaction', 'liesegang'];
    const gates = lab.displayGates();
    const bitsOf = (m) => gates.filter((_, i) => m & (1 << i)).length;
    const same = (a, b) => { if (a.length !== b.length) return a.length; let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
    const lay = async (id) => {
      const { settings, pour, dyes } = lab.look(id);
      const own = Object.fromEntries(PHYSICS.filter((k) => typeof settings[k] === 'number').map((k) => [k, settings[k]]));
      const app = { ...base, ...own };
      await lab.create(N, N);
      let seed = 9001;
      for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const inks = (dyes.length ? dyes : [{ r: 255, g: 60, b: 40 }, { r: 40, g: 120, b: 255 }]).map((c) => lab.dyeOf([c.r, c.g, c.b]));
      for (let k = 0; k < 9; k++) lab.dye(0.2 + 0.6 * rnd(), 0.2 + 0.6 * rnd(), 0.05 + 0.08 * rnd(), inks[k % inks.length], 0.8 + 0.8 * rnd());
      if (pour) lab.pour(pour, settings.phaseScale ?? 1);
      const a = rnd() * 2 * Math.PI, sp = 2.5 * (N / 128);
      lab.vel(0.5, 0.5, 0.15, [Math.cos(a) * sp, Math.sin(a) * sp, 0, 0]);
      lab.flush(app.dt);
      if (STEPS > 0) await lab.step(STEPS, app);
      return { settings, time: STEPS * app.dt };
    };
    const looks = [];
    for (const id of ids) {
      const { settings, time } = await lay(id);
      const kept = bitsOf(lab.displayMayMask(settings));
      for (const [cam, extra] of [['plate', {}], ['closeup', { zoom: 3, cx: 0.45, cy: 0.55 }]]) {
        const whole = await lab.render(SIZE, settings, { time, ...extra, wholeDisplay: true });
        const lean = await lab.render(SIZE, settings, { time, ...extra });
        looks.push({ id, cam, kept, drew: lab.lastDisplay(), differ: same(whole, lean) });
      }
    }
    // The controls, on Classic.
    const { settings, time } = await lay('classic');
    const bit = gates.indexOf('U.boundaryContrast > 0.005');
    const whole = await lab.render(SIZE, settings, { time, wholeDisplay: true });
    const dropped = await lab.render(SIZE, settings, { time, leanDrop: 1 << bit });
    const droppedDrew = lab.lastDisplay();
    const laced = { ...settings, lacing: 0.6 };
    const lacedWhole = await lab.render(SIZE, laced, { time, wholeDisplay: true });
    const lacedLean = await lab.render(SIZE, laced, { time, leanFrom: settings });
    const lacedDrew = lab.lastDisplay();
    return {
      looks, gates: gates.length,
      control: { edge: settings.boundaryContrast, dropped: same(whole, dropped), droppedDrew, lacedFallback: same(lacedWhole, lacedLean), lacedDrew, lacingShows: same(whole, lacedWhole) },
    };
  }, { LOOKS, GRID, SIZE, STEPS });

  const pixels = SIZE * SIZE;
  for (const l of res.looks) {
    const lean = / lean /.test(l.drew);
    check(lean && l.differ === 0, `${l.id} (${l.cam}): drawn by its lean display, the same bytes as the whole one`,
      `${lean ? `lean, ${l.kept} of ${res.gates} effects kept` : `drew with ${l.drew}`}, ${l.differ} of ${pixels * 4} bytes differ`);
  }
  const c = res.control;
  check(c.dropped > 0 && / lean /.test(c.droppedDrew), 'control: Classic\'s lean display with its edge line taken out differs from the whole one',
    `${c.dropped} bytes differ (Boundary Contrast ${c.edge}, drew ${c.droppedDrew})`);
  check(c.lacingShows > 0 && c.lacedFallback === 0 && !/ lean /.test(c.lacedDrew), 'control: Classic with Lacing up, its display built for Classic as it ships, falls back to the whole one',
    `lacing changes ${c.lacingShows} bytes; drew ${c.lacedDrew}, ${c.lacedFallback} bytes from the whole one`);
} finally {
  await close();
}
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
