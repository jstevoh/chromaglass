#!/usr/bin/env node
/**
 * Lava Lamp's wax goes round, and keeps going round (PLAN 27f-9e, 27f-9h):
 * warmed by the glass of the floor it rises, gives its heat up to the cool
 * upper glass, comes down, and rises again, for as long as the lamp is on.
 * Measured on the GPU solver alone (scripts/lab.mjs), on the look's settings
 * and the wax the app lays (src/lib/oilLay.ts, LAVA_BODIES), as
 * `npm run lavawax` lays it.
 *
 *   npm run lavacycle
 *
 * What was there, twice. First (27f-9e) the wax rose in plumes, gathered at
 * the top and stayed: nothing took its heat but Heat Decay. The heat now
 * crosses the gap to the glass at the gap's own conduction rate, π²κ/h² in
 * real seconds, where the glass is cool: the plate's upper half
 * (constants.ts KAPPA_WAX, LAMP_COOL_FROM; mixForce). Then (27f-9h) the
 * owner's film of the app showed one rise and no second, and this check,
 * which watched the first 30 s, had been green on it: run for two minutes,
 * that lamp rose to 0.60, fell, and hung at 0.49 to 0.50 of the height from
 * the first minute on, and so did the lamp before it. The bulb was a kick of
 * heat given to the wax alone inside a band over the floor, six units a
 * second, with the water under it left cold: a thermostat. Wax above the band
 * cooled until it sank to the band's edge, was warmed in under a second until
 * it floated, and parked there as one weightless slab. No dial moved it
 * (Dye Weight, the wax's colour, Oil Tension, the band's height, the kick's
 * size, the projector's light on or off): a body that creeps through cold
 * still water and is heated the moment it touches the band has nowhere to
 * overshoot to. What turns a real lamp over is the water's own gradient and
 * the slowness of conduction: the floor's glass is hot, it warms water and wax
 * alike at the gap's rate (the wax at its own, half the water's), and the wax
 * has to lie on it for seconds before it is light enough to leave, by which
 * time it is far lighter than it need be and climbs past the middle. That is
 * LAMP_GLASS in constants.ts and the warm end of mixForce's conduction, the
 * mirror of 27f-9e's cool end; the kick is left only for a wax that is dye.
 *
 * The wax is laid cold at 0.35 of the height, so it sinks first (to 0.15 by
 * 8 s), and its first rise is the floor's, not the lay's: the first lines
 * read the first minute and not the first 30 s, and the fall is read at 40 s
 * and not 16 s. The heights they ask are the ones 27f-9e wrote.
 *
 *   1. The wax comes down: the oil's centre of mass rises to at least 0.55
 *      of the plate's height (0.5 is wax spread evenly, so a plate gone to
 *      haze cannot pass), and by 40 s it is at least 0.15 of the height below
 *      its highest; in a lab built with the cool glass taken out
 *      (LAMP_COOL_FROM 1.5: the cool end starts above the plate, and the rest
 *      of the program is the same, the warm floor included) it rises past 0.6
 *      and is within 0.05 of its own highest at 40 s: the wax stays up.
 *      Measured when this was written: 0.60 at 23 s and 0.21 at 40 s with the
 *      cool glass, 0.81 and 0.81 without.
 *   2. And goes round again: after that fall, from its lowest point the
 *      centre of mass rises at least 0.06 by 60 s (measured: 0.19 at 42 s,
 *      0.64 at 56 s), and neither control's does.
 *   3. It is the floor's glass that lifts it: in a lab built with the warm
 *      floor taken out (LAMP_GLASS 0: the floor's glass at the bath's own
 *      temperature, the cool top and the projector's light as they are) the
 *      wax never leaves where it sank to: no second of its first minute is
 *      over 0.40 (it is laid at 0.35), and none from 40 s on is over 0.25
 *      (measured: 0.12 to 0.13 from 14 s on).
 *   4. And it is the wax's swelling that the warmth lifts it by: in a lab
 *      built with the swelling taken out (the one line that hands OIL_EXPAND
 *      to the shaders writes 0, so warm wax thins only as the water round it
 *      does) the wax never leaves the floor either, by line 3's own bars
 *      (measured: 0.13 from 10 s on, against the look's 0.60 at 23 s). A
 *      floor that warms water and wax alike lifts neither against the other:
 *      what floats the wax is that it swells more than the water does, as a
 *      real lamp's does. This was `npm run lavawax`'s third line, read at
 *      6 s with bars of 0.06 and 0.01 of the height, while a kick laid in
 *      the wax alone lifted it within seconds; heated through the glass the
 *      cold lay sinks for ten seconds before it has warmed, so the line
 *      moved here, where a minute of the lamp costs seconds.
 *   5. And it keeps going round: wholly inside the second minute (60 s to
 *      120 s) the centre of mass falls at least 0.2 from a height it had
 *      reached and then rises at least 0.2 from the low (measured: 0.59 at
 *      60 s, 0.23 at 76 s, 0.60 at 90 s, 0.22 at 108 s, 0.60 at 120 s; a
 *      scratch run to 180 s was still between 0.24 and 0.62), where the lab
 *      with no cool glass does not (0.80 sliding to 0.66). This is the line
 *      27f-9h's lamp was red on: 0.49 to 0.50 for the whole of that minute.
 *      A floor too cool to carry it is red here too, by hand's measure and
 *      not in the run: at LAMP_GLASS 4 the swing dies away (0.26, 0.52, 0.34,
 *      0.48 in this minute, a fall of 0.18 and a rise of 0.14).
 *   6. The conduction is the gap's, in real seconds: lampCoolOf at the rest
 *      gap (2 mm) and a sixtieth of a second is π²κ/h² for water, a time
 *      constant of 2.5 to 3.3 s (2.9; the wax's twice that, at KAPPA_WAX);
 *      and read off the solver itself, the rate it handed the shaders (Sim
 *      slot 54) is that for the gap its cover held (within a tenth of 2 mm),
 *      twice it on a step of twice the real seconds, and the same on a step
 *      of a twelfth of the dt (Lava Lamp's own step is a twelfth of a
 *      sixtieth).
 *   And any GPU validation error fails the run; a seal that never builds, a
 *   missing mix, a plate whose oil goes to NaN or leaves it at any sample, or
 *   a look that is not standing stops it with an error. Each control is
 *   proved another program before its numbers are read: its bundle carries
 *   the changed constant and not the look's, the shader's text is drawn from
 *   that constant, and its conduction rate (slot 54) is the look's own, so a
 *   control that silently built the plain lab is a red line and not a pass.
 *
 *   By hand, `npm run lavacycle -- --first-cut`: 27f-9e's first cut, the cool
 *   glass laid from the old lamp band up (0.22 of the height). Over the warm
 *   floor it turns over low (0.15 to 0.35) with its top always in the cold
 *   and never reaches the upper half: line 1's 0.55 must be red on it.
 *
 *   Not seen here: the cycle on Lava Lamp's own step and the app's grid. The
 *   lab steps at a sixtieth on 128²; the thin gap's body forces and this
 *   conduction run on real seconds either way, and scratch runs at 192² went
 *   round the same (0.60, 0.19, 0.58, 0.23, 0.59, 0.22 at the lab's step;
 *   0.56, 0.17, 0.54, 0.17, 0.56, 0.20 on the look's dt, 0.00133), but the
 *   minutes on the Mac's GPU are the owner's film (docs/judging.md).
 *
 * The step is lavawax's (the look's terms at the lab's sixtieth). Four labs,
 * six minutes of the lamp in all, run side by side: 36 s of the wall clock
 * on an M4's Metal, a couple of minutes on a GitHub Mac, which is why it runs
 * on the Mac's `show` part, the lightest of the five (PLAN 19k-19: none of
 * them has room to spare); on SwiftShader it is two hours (it was
 * Measure's `lab10` while it watched 50 s of the lamp, about fifteen minutes
 * there).
 */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// The first minute holds the first round (lines 1 to 4); the second must hold another (line 5).
const FIRST = 60, LOOK_SECONDS = 120, FALL_BY = 40;
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
// The cool glass taken out: its lower edge put a plate's height above the plate, so no cell is under it.
const NO_COLD = swap('no-cold', 'export const LAMP_COOL_FROM = 0.5;', 'export const LAMP_COOL_FROM = 1.5;');
// The warm floor taken out: its glass at the bath's own temperature, 0, so it warms nothing (and the cold wax laid on it stays cold).
const NO_WARM = swap('no-warm', 'export const LAMP_GLASS = 6;', 'export const LAMP_GLASS = 0;');
// By hand only (`npm run lavacycle -- --first-cut`): the cool glass from 0.22 of the height up. Line 1's 0.55 must be red on it.
const FIRST_CUT = swap('first-cut', 'export const LAMP_COOL_FROM = 0.5;', 'export const LAMP_COOL_FROM = 0.22;');

// The swelling taken out: the one line that hands OIL_EXPAND to the shaders writes 0, so warmed wax thins as the water does and no more.
const EXPAND = 'f[53] = OIL_EXPAND;';
const NO_SWELL = {
  name: 'no-swell',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]fluid\.ts$/ }, (a) => {
      const s = readFileSync(a.path, 'utf8');
      const found = s.split(EXPAND).length - 1;
      if (found !== 1) throw new Error(`lavacycle: the no-swell control found ${found} of 1 swelling lines in src/gpu/fluid.ts`);
      return { contents: s.replace(EXPAND, 'f[53] = 0;'), loader: 'ts' };
    });
  },
};

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
  // Half a minute, on the wall's clock (the only wait here that is): four labs compile at once, and a hosted Mac's three cores are not this one's.
  for (let k = 0; k < 120 && !s.sealReady(); k++) await new Promise((q) => setTimeout(q, 250));
  if (!s.sealReady()) throw new Error('lavacycle: the sealed bottle never built (sealReady false after 30 s)');
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

// 5 first: the module itself, bundled for node.
const out = 'node_modules/.cache/lava-cycle-constants.mjs';
await build({
  stdin: { contents: "export { lampCoolOf, KAPPA_WATER, KAPPA_WAX, REST_GAP, GAP_METRES } from './src/gpu/fluid/constants.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const C = await import(`../${out}?${Date.now()}`);

/*
  The three labs at once, each its own Chromium: a 128² plate's step is the page's round trip to the GPU process and
  not the GPU's work (7200 steps in 43 s on an M4, 6 ms each), so side by side they take about what the longest takes
  alone, and the Mac's part this runs on has no minutes to spare (PLAN 19k-19). Each lab's numbers are its own
  program's whatever ran beside it: run one after another they were the same to the last digit printed.
*/
const [look, cold, warm, swell] = await Promise.all([
  inLab({}, LOOK_SECONDS),
  inLab({ plugins: [NO_COLD], tag: 'no-cold' }, LOOK_SECONDS),
  inLab({ plugins: [NO_WARM], tag: 'no-warm' }, FIRST),
  inLab({ plugins: [NO_SWELL], tag: 'no-swell' }, FIRST),
]);
const f2 = (v) => v.toFixed(2);
const peakOf = (t) => t.slice(0, FALL_BY + 1).reduce((b, y, k) => (y > t[b] ? k : b), 0);
/** Line 2's test, on the first minute: a fall of 0.15 from the highest by FALL_BY, then a rise of 0.06 from the lowest after it. */
function goesRound(all) {
  const t = all.slice(0, FIRST + 1);
  const peakAt = peakOf(t);
  let lowAt = peakAt;
  for (let k = peakAt; k < t.length; k++) if (t[k] < t[lowAt]) lowAt = k;
  const after = Math.max(...t.slice(lowAt));
  return { ok: lowAt > peakAt && t[lowAt] <= t[peakAt] - 0.15 && after >= t[lowAt] + 0.06, peakAt, lowAt, after };
}
/** Line 5's test, on the second minute alone: some low that is 0.2 under a height before it and 0.2 under a height after it. */
function keepsRound(all) {
  const t = all.slice(FIRST);
  let best = { ok: false, fall: 0, rise: 0, lowAt: FIRST };
  // The largest fall and the largest rise anywhere in the minute, each on its own, for the line's account of a lab
  // that does one and not the other (the no-cold lab slides down and never comes back: its best pair is 0 and 0).
  let maxFall = 0, maxRise = 0;
  for (let l = 1; l < t.length - 1; l++) {
    const fall = Math.max(...t.slice(0, l + 1)) - t[l], rise = Math.max(...t.slice(l)) - t[l];
    if (fall > maxFall) maxFall = fall;
    if (rise > maxRise) maxRise = rise;
    if (Math.min(fall, rise) > Math.min(best.fall, best.rise)) best = { ok: fall >= 0.2 && rise >= 0.2, fall, rise, lowAt: FIRST + l };
  }
  return { ...best, maxFall, maxRise };
}
/*
  Each control really is another program, and only in its one constant. The bundle's text carries the constant's
  value (esbuild keeps a const as a var, with digits after a name it had to rename), the shader's text is drawn from
  that constant, and the conduction line is the look's in all three: the rate each solver handed its shaders is the same.
*/
const has = (js, name, value) => new RegExp(`\\b${name}\\d* = ${value.replace('.', '\\.')};`).test(js);
const drawn = (js) => /\$\{LAMP_GLASS\d*\.toFixed\(3\)\}/.test(js) && /\$\{\(0\.5 - LAMP_COOL_FROM\d*\)\.toFixed\(3\)\}/.test(js)
  // (esbuild drops the source's outer parentheses.)
  && /return \(?Math\.PI \* Math\.PI \* KAPPA_WATER\d* \* s\d*\)? \/ \(h\d* \* h\d*\);/.test(js) && /f\d*\[54\] = lampCoolOf\d*\(/.test(js);
const plain = drawn(look.js) && has(look.js, 'LAMP_COOL_FROM', '0.5') && has(look.js, 'LAMP_GLASS', '6') && look.rate.k > 0;
const coldOut = plain && drawn(cold.js) && has(cold.js, 'LAMP_COOL_FROM', '1.5') && !has(cold.js, 'LAMP_COOL_FROM', '0.5')
  && has(cold.js, 'LAMP_GLASS', '6') && cold.rate.k === look.rate.k;
const warmOut = plain && drawn(warm.js) && has(warm.js, 'LAMP_GLASS', '0') && !has(warm.js, 'LAMP_GLASS', '6')
  && has(warm.js, 'LAMP_COOL_FROM', '0.5') && warm.rate.k === look.rate.k;
// The swelling's control: the plain bundle hands OIL_EXPAND to the shaders, this one hands 0, and both glasses are the look's.
const swells = (js) => /f\d*\[53\] = OIL_EXPAND\d*;/.test(js);
const swellOut = plain && swells(look.js) && swells(cold.js) && swells(warm.js) && !swells(swell.js) && /f\d*\[53\] = 0;/.test(swell.js)
  && drawn(swell.js) && has(swell.js, 'LAMP_GLASS', '6') && has(swell.js, 'LAMP_COOL_FROM', '0.5') && swell.rate.k === look.rate.k;

// 1.
{
  const t = look.t, c = cold.t;
  const peakAt = peakOf(t), peak = t[peakAt], cPeak = Math.max(...c.slice(0, FIRST + 1));
  // "By" FALL_BY: the lowest second between the highest and FALL_BY, not the one second at FALL_BY, which on this
  // Mac is two seconds before the wax turns up again; a GPU that rounds the trace a few seconds early would
  // otherwise be read on the way back up.
  const low = Math.min(...t.slice(peakAt, FALL_BY + 1));
  check(`the wax comes down: it rises to 0.55 of the height or more, and by ${FALL_BY} s has been 0.15 below its highest, where with the cool glass taken out it rises past 0.6 and stays within 0.05 of its highest`,
    coldOut && peak >= 0.55 && low <= peak - 0.15 && cPeak >= 0.6 && c[FALL_BY] >= cPeak - 0.05,
    `${coldOut ? '' : 'the no-cold lab is not the plain one less its cool glass; '}highest ${f2(peak)} at ${peakAt} s, down to ${f2(low)} by ${FALL_BY} s; no cool glass: highest ${f2(cPeak)}, ${f2(c[FALL_BY])} at ${FALL_BY} s`);
}
// 2.
{
  const g = goesRound(look.t), gc = goesRound(cold.t), gw = goesRound(warm.t);
  check(`and goes round again: after falling 0.15 from its highest, the centre of mass rises 0.06 or more from its lowest by ${FIRST} s, and with the cool glass or the warm floor taken out it does not`,
    coldOut && warmOut && g.ok && !gc.ok && !gw.ok,
    `lowest ${f2(look.t[g.lowAt])} at ${g.lowAt} s, then up to ${f2(g.after)}; no cool glass: ${gc.ok ? 'went round' : 'did not'}; no warm floor: ${gw.ok ? 'went round' : 'did not'}`);
}
// 3.
{
  const w = warm.t, high = Math.max(...w), late = Math.max(...w.slice(FALL_BY)), lit = look.t[peakOf(look.t)];
  check(`it is the floor's glass that lifts it: with the warm floor taken out no second of the first minute is over 0.40 of the height, and none from ${FALL_BY} s on is over 0.25`,
    warmOut && w.length === FIRST + 1 && lit >= 0.55 && high <= 0.4 && late <= 0.25,
    `${warmOut ? '' : 'the no-warm lab is not the plain one less its warm floor; '}highest ${f2(high)} (laid at ${f2(w[0])}), highest from ${FALL_BY} s on ${f2(late)}, against the lit lamp's ${f2(lit)}`);
}
// 4.
{
  const w = swell.t, high = Math.max(...w), late = Math.max(...w.slice(FALL_BY)), lit = look.t[peakOf(look.t)];
  check(`and it is the wax's swelling that the warmth lifts it by: with the swelling taken out no second of the first minute is over 0.40 of the height, and none from ${FALL_BY} s on is over 0.25`,
    swellOut && w.length === FIRST + 1 && lit >= 0.55 && high <= 0.4 && late <= 0.25,
    `${swellOut ? '' : 'the no-swell lab is not the plain one less its swelling; '}highest ${f2(high)} (laid at ${f2(w[0])}), highest from ${FALL_BY} s on ${f2(late)}, against the lit lamp's ${f2(lit)}`);
}
// 5.
{
  const k = keepsRound(look.t), kc = keepsRound(cold.t);
  check(`and it keeps going round: inside the second minute it falls 0.2 or more from a height it had reached and then rises 0.2 or more from the low, where with the cool glass taken out it does not`,
    coldOut && look.t.length === LOOK_SECONDS + 1 && cold.t.length === LOOK_SECONDS + 1 && k.ok && !kc.ok,
    `a fall of ${f2(k.fall)} to ${f2(look.t[k.lowAt])} at ${k.lowAt} s and a rise of ${f2(k.rise)} after it; no cool glass: its largest fall ${f2(kc.maxFall)}, its largest rise ${f2(kc.maxRise)}`);
}
// 6.
{
  const h = 0.002, k = C.lampCoolOf(h, 1 / 60), want = (Math.PI ** 2 * C.KAPPA_WATER / (h * h)) / 60;
  const tauWater = 1 / (k * 60), tauWax = tauWater * C.KAPPA_WATER / C.KAPPA_WAX;
  const rest = Math.abs(C.REST_GAP * C.GAP_METRES - h) < 1e-9;
  // Off the solver: the rate it handed the shaders, for the gap the cover held, on the step's real seconds and not its dt.
  const r = look.rate, gpuWant = C.lampCoolOf(r.gap, 1 / 60);
  const laid = Math.abs(r.k / gpuWant - 1) < 1e-3 && Math.abs(r.gap / h - 1) < 0.1;
  const real = Math.abs(r.twice / r.k - 2) < 1e-3 && Math.abs(r.smallDt / r.k - 1) < 1e-3;
  check('the conduction is the gap\'s, in real seconds: π²κ/h² at the 2 mm rest gap (2.5 to 3.3 s for water), and the solver hands the shaders that for its own gap, twice it on twice the real seconds and the same on a twelfth of the dt',
    Math.abs(k / want - 1) < 1e-3 && rest && tauWater > 2.5 && tauWater < 3.3 && laid && real,
    `water ${tauWater.toFixed(2)} s, wax ${tauWax.toFixed(2)} s; the solver's gap ${(r.gap * 1000).toFixed(3)} mm, slot 54 ${r.k.toExponential(4)} (want ${gpuWant.toExponential(4)}), ×${(r.twice / r.k).toFixed(3)} on twice the seconds, ×${(r.smallDt / r.k).toFixed(3)} on a twelfth of the dt`);
}
if (process.argv.includes('--first-cut')) {
  const first = await inLab({ plugins: [FIRST_CUT], tag: 'first-cut' }, FIRST);
  const high = Math.max(...first.t.slice(1));
  check('by hand: the first cut (the cool glass from 0.22 of the height up) never reaches the upper half, under 0.55 at every second', high < 0.55,
    `${first.t.map(f2).join(' ')}`);
}
check('no GPU validation errors', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
console.log(`\na second at a time, the oil's centre of mass: ${look.t.map(f2).join(' ')}\nno cool glass: ${cold.t.map(f2).join(' ')}\nno warm floor: ${warm.t.map(f2).join(' ')}\nno swelling: ${swell.t.map(f2).join(' ')}`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
