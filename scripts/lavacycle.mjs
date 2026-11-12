#!/usr/bin/env node
/**
 * Lava Lamp's wax goes round (PLAN 27f-9e): warmed on the floor it rises,
 * gives its heat up to the cool upper glass, comes down, and rises again.
 * Measured on the GPU solver alone (scripts/lab.mjs), on the look's settings
 * and the wax the app lays (src/lib/oilLay.ts, LAVA_BODIES), as
 * `npm run lavawax` lays it.
 *
 *   npm run lavacycle
 *
 * What was there: with the heat carried (38f-1) the wax rose in plumes and
 * gathered at the top, and stayed: nothing took its heat but Heat Decay, a
 * fade on the look's clock that on Lava Lamp's step is about ten minutes.
 * Now the heat crosses the gap to the glass at the gap's own conduction rate,
 * π²κ/h² in real seconds, wherever the glass is cool: the plate's upper half
 * (constants.ts KAPPA_WAX, LAMP_COOL_FROM; mixForce).
 *
 *   1. The wax comes down: the oil's centre of mass rises to at least 0.55
 *      of the plate's height (laid at 0.35, it sinks first; 0.5 is wax spread
 *      evenly, so a plate gone to haze cannot pass), and by 16 s it is at
 *      least 0.15 of the height below its highest; in a lab built with the
 *      glass's cooling taken out (lampCoolOf returns 0, so S.lampCool is 0,
 *      read back off that solver, and the rest of the program is the same) it
 *      rises past 0.6 and is within 0.05 of its own highest at 16 s: the wax
 *      stays up. Measured when this was written: 0.59 at 8 s and 0.34 at 16 s
 *      with the cooling, 0.73 and 0.73 without.
 *   2. And goes round again: after that fall, from its lowest point the
 *      centre of mass rises at least 0.06 by 30 s (measured: 0.31 at 19 s,
 *      0.45 at 26 s), and the no-cooling lab's does not. A plate that only
 *      rises, or settles after one fall, fails it: the first cut did (the
 *      cool glass laid from the lamp's own band up: the pool on the floor
 *      turned over in itself with its top always in the cold, 0.28 to 0.29
 *      from 12 s to 30 s), which `npm run lavacycle -- --first-cut` builds
 *      again and holds to it by hand (too long for the part).
 *   3. The cooling is the gap's, in real seconds: lampCoolOf at the rest gap
 *      (2 mm) and a sixtieth of a second is π²κ/h² for water, a time constant
 *      of 2.5 to 3.3 s (2.9; the wax's twice that, at KAPPA_WAX); and read
 *      off the solver itself, the rate it handed the shaders (Sim slot 54) is
 *      that for the gap its cover held (within a tenth of 2 mm), twice it on
 *      a step of twice the real seconds, and the same on a step of a twelfth
 *      of the dt (Lava Lamp's own step is a twelfth of a sixtieth).
 *   And any GPU validation error fails the run; a seal that never builds, a
 *   missing mix, a plate whose oil goes to NaN or leaves it at any sample, or
 *   a look that is not standing stops it with an error.
 *
 *   Not seen here: the cycle on Lava Lamp's own step. The lab steps at a
 *   sixtieth; the thin gap's body forces and this cooling run on real seconds
 *   either way, and a scratch run at 192² on the look's dt (0.00133) went
 *   round twice in 30 s (0.56, 0.28, 0.44, 0.31), but the minute on the
 *   Mac's GPU is the owner's film (docs/judging.md).
 *
 * The step is lavawax's (the look's terms at the lab's sixtieth). About
 * fifteen minutes on SwiftShader, in a measure part of its own, lab10.
 */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const LOOK_SECONDS = 30, FALL_BY = 16, CONTROL_SECONDS = 20;
// Replace one line of src/gpu/fluid/constants.ts in a lab's bundle, failing loudly unless it is there exactly once.
const swap = (name, from, to) => ({
  name,
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]fluid[\\/]constants\.ts$/ }, (a) => {
      const s = readFileSync(a.path, 'utf8');
      const found = s.split(from).length - 1;
      if (found !== 1) throw new Error(`lavacycle: the ${name} control found ${found} of 1 of its line in src/gpu/fluid/constants.ts`);
      return { contents: s.replace(from, to), loader: 'ts' };
    });
  },
});
// The glass's cooling taken out: the one line that gives S.lampCool its value returns 0.
const COOL = 'return (Math.PI * Math.PI * KAPPA_WATER * s) / (h * h);';
const NO_COOL = swap('no-cool', COOL, 'return 0 * s * h;');
/*
  By hand only (`npm run lavacycle -- --first-cut`, too long for its part):
  the first cut, the cool glass laid from the lamp's own band up (0.22 of the
  height), where the floor's pool turned over in itself with its top always
  in the cold. Line 2 must be red on it.
*/
const FIRST_CUT = swap('first-cut', 'export const LAMP_COOL_FROM = 0.5;', 'export const LAMP_COOL_FROM = 0.22;');

const gpuErrors = [];
async function inLab(opts, seconds) {
  const lab = await openLab(opts);
  lab.page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
  try {
    return { js: lab.js, ...(await lab.page.evaluate(measureRun, { seconds })) };
  } finally {
    await lab.close();
  }
}

/** In the page: lay the look's wax as the app does (lavawax's lay) and sample the oil's centre of mass once a second. */
async function measureRun({ seconds }) {
  const N = 128;
  const look = lab.look('lava-lamp').settings;
  for (const k of ['oilTension', 'oilBodies', 'oilWeight', 'solutalBuoyancy', 'heatDecay', 'buoyancy', 'advection', 'damping', 'turbulenceScale', 'doubleDiffusion', 'plateUpright']) {
    if (!Number.isFinite(look[k])) throw new Error(`lavacycle: Lava Lamp's ${k} is ${look[k]}, not a number`);
  }
  if (!(look.oilWeight > 0)) throw new Error(`lavacycle: Lava Lamp's Oil Weight is ${look.oilWeight}: this check is about a heavy wax`);
  if (!(look.plateUpright > 0)) throw new Error(`lavacycle: Lava Lamp's Plate Upright is ${look.plateUpright}: no lamp stands under a lying plate`);
  const WAX = lab.dyeOf([0.86, 0.08, 0.24]);
  const visc = look.viscosity === 'thick' ? 1.5 : 0.5;
  const sh = Math.max(0, Math.min(1, look.sharpness ?? 0));
  const tu = Math.max(0, Math.min(1, look.turbulenceScale));
  const p = { thinGap: 1, gapThickness: look.gapThickness ?? 0.45, plateUpright: look.plateUpright, solutalBuoyancy: look.solutalBuoyancy,
    gravityX: 0, gravityY: -1, gravityReach: 0.3, dt: 1 / 60, heatDecay: look.heatDecay, currentBuoy: look.buoyancy * 0.3, maxCurrent: 0.3,
    doubleDiffusion: look.doubleDiffusion, oilTension: look.oilTension, oilBodies: look.oilBodies, oilWeight: look.oilWeight,
    advection: look.advection, diff: look.diffusionRate ?? 0, damping: look.damping || 0.99, visc, nu: visc * 0.0001,
    sharpness: sh * (0.225 - 0.09 * sh), turbScale: tu * (1 + 3 * tu ** 3), turbDetail: Math.round(look.turbulenceDetail ?? 3),
    platePressure: look.platePressure ?? 0.4 };
  await lab.create(N);
  const s = lab.solver();
  for (let k = 0; k < 40 && !s.sealReady(); k++) await new Promise((q) => setTimeout(q, 250));
  if (!s.sealReady()) throw new Error('lavacycle: the sealed bottle never built (sealReady false after 10 s)');
  await lab.step(1, p);
  for (const b of lab.lavaBodies) s.addMix(b.x, b.y, b.r, { oil: 1 });
  const L = 192, d = new Array(L * L * 4).fill(0);
  for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
    const c = lab.lavaLampCell((i + 0.5) / L, (j + 0.5) / L, L);
    if (c.dye > 0) { const k = (j * L + i) * 4; d[k] = WAX[0] * c.dye; d[k + 1] = WAX[1] * c.dye; d[k + 2] = WAX[2] * c.dye; d[k + 3] = c.dye; }
  }
  lab.addDye(d); lab.flush();
  const measure = async () => {
    const mix = await lab.chemistry('mix');
    if (!mix) throw new Error('lavacycle: no mix to read on a plate laid with oil');
    const m = mix.n;
    let oil = 0, oilY = 0;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      const x = (i + 0.5) / m, y = (j + 0.5) / m;
      if ((x - 0.5) ** 2 + (y - 0.5) ** 2 > 0.25) continue;
      const c = Math.max(0, mix.data[(j * m + i) * 4]);
      oil += c; oilY += c * y;
    }
    // A NaN cell would read as a centre of mass of 0, wax on the floor: a dead plate is an error, not a fall.
    if (!Number.isFinite(oil) || !(oil > 0)) throw new Error(`lavacycle: the plate's oil is ${oil}`);
    return { oil, oilY: oilY / oil };
  };
  const t = [await measure()];
  // The rate the shaders were handed this step (Sim slot 54) and the gap it was drawn for, read off the solver itself.
  const rate = { k: s.simF[54], gap: s.coverMetres };
  for (let k = 0; k < seconds; k++) {
    await lab.step(60, p);
    const m = await measure();
    if (!(m.oil >= 0.9 * t[0].oil)) throw new Error(`lavacycle: oil lost from the plate at ${k + 1} s, ${m.oil.toFixed(0)} of ${t[0].oil.toFixed(0)} left`);
    t.push(m);
  }
  // After the samples, so they are the look's own: one step on twice the real seconds, one on a twelfth of the dt.
  await lab.step(1, { ...p, magnetSeconds: 1 / 30 });
  rate.twice = s.simF[54];
  await lab.step(1, { ...p, dt: 1 / 720, magnetSeconds: 1 / 60 });
  rate.smallDt = s.simF[54];
  return { t: t.map((m) => m.oilY), rate };
}

// 3 first: the module itself, bundled for node.
const out = 'node_modules/.cache/lava-cycle-constants.mjs';
await build({
  stdin: { contents: "export { lampCoolOf, KAPPA_WATER, KAPPA_WAX, REST_GAP, GAP_METRES } from './src/gpu/fluid/constants.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const C = await import(`../${out}?${Date.now()}`);

const look = await inLab({}, LOOK_SECONDS);
const ctrl = await inLab({ plugins: [NO_COOL], tag: 'no-cool' }, CONTROL_SECONDS);
const f2 = (v) => v.toFixed(2);
const peakOf = (t) => t.slice(0, FALL_BY + 1).reduce((b, y, k) => (y > t[b] ? k : b), 0);
/** Line 2's test: a fall of 0.15 from the highest by FALL_BY, then a rise of 0.06 from the lowest after it. */
function goesRound(t) {
  const peakAt = peakOf(t);
  let lowAt = peakAt;
  for (let k = peakAt; k < t.length; k++) if (t[k] < t[lowAt]) lowAt = k;
  const after = Math.max(...t.slice(lowAt));
  return { ok: lowAt > peakAt && t[lowAt] <= t[peakAt] - 0.15 && after >= t[lowAt] + 0.06, peakAt, lowAt, after };
}

// 1.
{
  const t = look.t, c = ctrl.t;
  const peakAt = peakOf(t), peak = t[peakAt], cPeak = Math.max(...c);
  // The control really is another program: the plain bundle's cooling line draws π²κ/h², the no-cool one's returns 0.
  // (esbuild drops the source's outer parentheses.)
  const cools = (js) => /return \(?Math\.PI \* Math\.PI \* KAPPA_WATER\d* \* s\d*\)? \/ \(h\d* \* h\d*\);/.test(js) && /f\d*\[54\] = lampCoolOf\d*\(/.test(js);
  const other = cools(look.js) && !cools(ctrl.js) && /return 0 \* s\d* \* h\d*;/.test(ctrl.js) && look.rate.k > 0 && ctrl.rate.k === 0;
  check(`the wax comes down: it rises to 0.55 of the height or more, and by ${FALL_BY} s is 0.15 below its highest, where with the glass's cooling taken out it rises past 0.6 and stays within 0.05 of its highest`,
    other && peak >= 0.55 && t[FALL_BY] <= peak - 0.15 && cPeak >= 0.6 && c[FALL_BY] >= cPeak - 0.05,
    `${other ? '' : 'the no-cool lab is the plain one; '}highest ${f2(peak)} at ${peakAt} s, ${f2(t[FALL_BY])} at ${FALL_BY} s; no cooling: highest ${f2(cPeak)}, ${f2(c[FALL_BY])} at ${FALL_BY} s`);
}
// 2.
{
  const g = goesRound(look.t), gc = goesRound(ctrl.t);
  check(`and goes round again: after falling 0.15 from its highest, the centre of mass rises 0.06 or more from its lowest by ${LOOK_SECONDS} s, and with no cooling it does not`,
    g.ok && !gc.ok,
    `lowest ${f2(look.t[g.lowAt])} at ${g.lowAt} s, then up to ${f2(g.after)}; no cooling: ${gc.ok ? 'went round' : 'did not'}`);
}
// 3.
{
  const h = 0.002, k = C.lampCoolOf(h, 1 / 60), want = (Math.PI ** 2 * C.KAPPA_WATER / (h * h)) / 60;
  const tauWater = 1 / (k * 60), tauWax = tauWater * C.KAPPA_WATER / C.KAPPA_WAX;
  const rest = Math.abs(C.REST_GAP * C.GAP_METRES - h) < 1e-9;
  // Off the solver: the rate it handed the shaders, for the gap the cover held, on the step's real seconds and not its dt.
  const r = look.rate, gpuWant = C.lampCoolOf(r.gap, 1 / 60);
  const laid = Math.abs(r.k / gpuWant - 1) < 1e-3 && Math.abs(r.gap / h - 1) < 0.1;
  const real = Math.abs(r.twice / r.k - 2) < 1e-3 && Math.abs(r.smallDt / r.k - 1) < 1e-3;
  check('the cooling is the gap\'s, in real seconds: π²κ/h² at the 2 mm rest gap (2.5 to 3.3 s for water), and the solver hands the shaders that for its own gap, twice it on twice the real seconds and the same on a twelfth of the dt',
    Math.abs(k / want - 1) < 1e-3 && rest && tauWater > 2.5 && tauWater < 3.3 && laid && real,
    `water ${tauWater.toFixed(2)} s, wax ${tauWax.toFixed(2)} s; the solver's gap ${(r.gap * 1000).toFixed(3)} mm, slot 54 ${r.k.toExponential(4)} (want ${gpuWant.toExponential(4)}), ×${(r.twice / r.k).toFixed(3)} on twice the seconds, ×${(r.smallDt / r.k).toFixed(3)} on a twelfth of the dt`);
}
if (process.argv.includes('--first-cut')) {
  const first = await inLab({ plugins: [FIRST_CUT], tag: 'first-cut' }, LOOK_SECONDS);
  const g = goesRound(first.t);
  check('by hand: the first cut (the cool glass from the lamp\'s band up) does not go round', !g.ok,
    `${first.t.map(f2).join(' ')}`);
}
check('no GPU validation errors', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
console.log(`\na second at a time, the oil's centre of mass: ${look.t.map(f2).join(' ')} (no cooling ${ctrl.t.map(f2).join(' ')})`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
