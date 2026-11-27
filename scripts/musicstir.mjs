#!/usr/bin/env node
/**
 * Does the music stir the liquid only through a cord?
 *
 *   npm run musicstir        (node only: the real FluidSimulation on its CPU
 *                             grid, the real patch bay, the shelf's looks)
 *
 * PLAN 38u-4 and 38u-5. What was found (2026-11-13, the physics audit): the
 * owner's rule is that sound moves the plate only through cords and preset
 * patches, and two things broke it inside the solver's own step. The
 * analyser's energy multiplied Turbulence's stir by up to two
 * (`stirOf(dial, energy, impact)`), and mid and treble drove "spin", a second
 * noise curl laid wherever there was dye. Neither had a cord, a patch or a
 * control: a look with every cord pulled out still churned with the band, and
 * nobody at the desk could see why or stop it. A third rode with them:
 * Vibration's push swelled with the energy.
 *
 * The owner chose (the same day) to route it through cords, not to remove it
 * and not to leave it. So the step takes no sound at all now, "spin" is gone
 * from the solver, and every look on the shelf carries one more cord, the
 * sound's mids on Turbulence, at the depth that keeps its stir with a band
 * playing about where the multiplier and the eddies had it.
 *
 * What this asserts:
 *
 *   1. No sound reaches the step. `FluidSimulation.step` takes the settings,
 *      the time and the noise and nothing else; its file never names the
 *      analyser's data; the solver's parameters and the forces shader have no
 *      "spin"; the frame loop's call hands the step no sound; `stirOf` takes
 *      the dial alone. (Text, because the thing held is an absence.) And the
 *      side doors are pinned, because node never runs the frame loop and a
 *      door the loop would feed sits at its default here: the fields of the
 *      layer that `deriveStep` reads, the file's module-level variables
 *      (none), and the uniforms the forces shader reads are each a written
 *      list, so a new one fails until someone names it and says what feeds it.
 *   2. With every cord at zero the band changes nothing. Each look on the
 *      shelf at its own Turbulence, its cords' depths all zero, folded with
 *      the band at its ceiling and stepped, against the same look with no
 *      cords at all stepped in silence: every parameter the step derives is
 *      the same. (The step has no sound to read, so this can only go red if
 *      a door is opened again or the fold starts riding a cord at no depth;
 *      it is the owner's sentence, kept as a line.)
 *   3. A still plate. Hard-edged pools on a dish with nothing to move them
 *      (Turbulence 0), stepped 120 times four ways. In silence with the cord
 *      patched it stays still (no flow above the solver's rounding; the
 *      pools' own slow spreading is diffusion and is the same in all four).
 *      With the band loud and the cord at zero it is the same plate, value
 *      for value. With the band loud and the cord patched it moves: there is
 *      flow, and the dye is not where the still plate's is. And when the
 *      band stops, the stir the step is handed is back to none.
 *   4. A patched cord moves the stir and nothing else: on every look, folded
 *      with the band, the step's `turbScale` rises and every other parameter
 *      it derives is what silence gave.
 *   5. The defaults keep the looks moving as they did. Every look carries
 *      exactly one such cord, at `stirCordDepth` of its own Turbulence and
 *      Sound Drive; over the club song the sound checks play, heard as the
 *      app hears it, each look's mean stir through the cord is within a
 *      quarter of what the multiplier and eddies gave. What they gave is
 *      written out here (`stirWas`, from the step as it stood on main before
 *      this), not read from the lib the depths come from: a reference in the
 *      file it holds moves with it. The lib's `musicStirBefore` is held to it,
 *      and so is its loudest twentieth (a cord deep enough for the mean must
 *      not throw the dial at every loud moment: the dial's curve is a fourth
 *      power, which is why the cord reads the mids and not the energy and
 *      why its depth is set at the song's loud fifth, lib/stir.ts), and in
 *      silence it is the dial's exactly. The loud fifth's levels are printed
 *      and held to `STIR_REF`, which the depths are set from.
 *   6. The phone's slider (`musicStirOf`, `withMusicStir`): it reads a look's
 *      cord, sets it, leaves the look's other cords alone, takes the cord out
 *      at zero and puts one in on a look that has none.
 *   7. A look saved before the cord (PLAN 38u-16): read at a saved look's
 *      version under 3 it gains the cord its own dials call for, beside its
 *      own cords; at 3 without one it stays without (the owner pulled it);
 *      one with its own keeps that depth; read, saved and read again it is
 *      unchanged; a set list reads it the same; folded with a band its
 *      Turbulence rises by the cord.
 *
 * What it does not hold: how it looks. One octave of eddies under the dye and
 * three octaves over the whole dish are not the same picture at the same
 * speed, and `EDDY_AS_STIR` is a judgement; the film on the owner's Mac with
 * music is what judges that (docs/judging.md).
 *
 * Still owed, printed and not asserted: the music speeds and slows the
 * solver's clock (PLAN 38u-6) and a kick makes air from nowhere (38u-13).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { arrange, SR } from './arrangement.mjs';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'n/a');

// The GPU's usage flags, which the solver's modules read at load; nothing here makes a texture.
globalThis.GPUTextureUsage = { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
globalThis.GPUBufferUsage = { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
globalThis.GPUMapMode = { READ: 1, WRITE: 2 };
globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const out = 'node_modules/.cache/musicstir-sim.mjs';
await build({
  stdin: {
    contents: [
      "export { FluidSimulation } from './src/sim/fluidSimulation';",
      "export { PatchBay } from './src/lib/sceneMap';",
      "export * as stir from './src/lib/stir';",
      "export { PRESETS } from './src/presets';",
      "export { DEFAULT_SETTINGS } from './src/types';",
      "export { AnalyserEmulator, AudioFeatures } from './src/lib/audioFeatures';",
      "export { SoundLevels, bytesFromDb, smoothLevels, waveBytes } from './src/lib/soundLevels';",
      "export * as saved from './src/lib/userPresets';",
      "export { readSetListFile } from './src/lib/setList';",
    ].join('\n'),
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
});
const { FluidSimulation, PatchBay, stir, saved, readSetListFile, PRESETS, DEFAULT_SETTINGS, AnalyserEmulator, AudioFeatures, SoundLevels, bytesFromDb, smoothLevels, waveBytes }
  = await import(pathToFileURL(`${process.cwd()}/${out}`).href);
// Named one by one, so the script runs (red) on a tree from before the cord.
const { stirOf, stirCord, isStirCord, stirCordDepth, musicStirBefore, musicStirOf, withMusicStir, STIR_REF } = stir;
const built = typeof stirCord === 'function' && typeof isStirCord === 'function' && typeof stirCordDepth === 'function'
  && typeof musicStirBefore === 'function' && typeof musicStirOf === 'function' && typeof withMusicStir === 'function' && !!STIR_REF;

// ── The band ────────────────────────────────────────────────────────────────

/** The loudest frame the analyser hands over: every level at its calibrated ceiling. */
const LOUD = { volume: 85, bass: 85, mid: 85, treble: 85, energy: 0.85, spectralCentroid: 0.5, timbre: 50, complexity: 50, features: null };
const ctxOf = (sound) => ({ room: null, film: null, sound, shape: null, hits: null, notes: null, roomImpact: 0, filmImpact: 0, soundImpact: 1, shapeImpact: 1 });

/** The club song, heard as the app hears it (the loop `npm run kicks` uses): the hook's smoothed levels, once a frame at 60. */
function hear(pcm) {
  const an = new AnalyserEmulator(SR);
  const bins = an.fftSize / 2;
  const levels = new SoundLevels(SR, bins);
  const features = new AudioFeatures();
  const freq = new Uint8Array(bins), wave = new Uint8Array(bins);
  const frames = [];
  let prev = null, last = 0;
  const n = Math.floor((pcm.length / SR) * 60);
  for (let i = 1; i < n; i++) {
    const t = i / 60, end = Math.round(t * SR);
    const { bins: db, timeDomainData: td } = an.frame(pcm, end, 1 / 60);
    features.update({ bins: db, timeDomainData: td, scale: 'db', sampleRate: SR, fftSize: an.fftSize }, t);
    const dt = t - last; last = t;
    const win = levels.calibrate(db, dt, true);
    bytesFromDb(db, win.minDb, win.maxDb, freq);
    waveBytes(pcm, end, an.fftSize, wave);
    prev = smoothLevels(prev, levels.levels(freq, wave, dt, { sensitivity: 0.4, bassBoost: 1, autoCalibrate: true }));
    frames.push({ ...prev, features: null });
  }
  return frames;
}

/*
  What the music did to the stir before the cord, written out from the code
  it replaces (main at eac958c: lib/stir.ts stirOf, and deriveStep's spin in
  sim/fluidSimulation.ts with forcesA's use of it), in Turbulence's units.

    stir  = t(1 + 3t³) · min(2, 1 + 2·energy·drive)
    spin  = 0.03·s where s = (0.6·mid/70 + 0.4·treble/70)·drive, when s > 0.08
    push  = (spin / 0.03)·(0.4 / 3) a step, one octave of noise, under dye,
            against the stir's (0.5 / 3) over octaves weighted 1, 0.55, 0.3025
            (an r.m.s. of 1.18): one unit of s is 0.8 / 1.18 of a unit of stir.

  Here and not imported, so that a change to the lib's copy (musicStirBefore,
  which the depths are set from) cannot move the thing it is measured against.
*/
const clip01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
function stirWas(dial, energy, mid, treble, drive) {
  const t = clip01(dial);
  const stirred = t * (1 + 3 * t * t * t) * Math.min(2, 1 + clip01(energy) * drive * 2.0);
  const s = (clip01(mid / 70) * 0.6 + clip01(treble / 70) * 0.4) * drive;
  const eddies = s > 0.08 ? s * ((0.4 / 3) / (0.5 / 3)) / Math.hypot(1, 0.55, 0.3025) : 0;
  return stirred + eddies;
}

/*
  The side doors, pinned. A sound could reach the step without being an
  argument: through a field of the layer the frame loop sets, a variable of
  the module, or a uniform the shader reads. Node never runs the frame loop,
  so a door like that would sit at its default in every run below and every
  line would pass (the skeptic's pass on this check, 2026-11-13, did exactly
  that three ways). So each is a written list. A name added to one of them
  is a claim, made here, that the sound does not feed it.
*/
// What deriveStep reads off the layer: its place, its clock, its glass, its hands, the magnets, the dish.
const STEP_READS = ['boilHolds', 'coverHand', 'coverX', 'coverY', 'dishSpin', 'downhill', 'dt', 'dtSeconds', 'extraMagnets', 'gpu', 'layerIndex',
  'liquidSpin', 'magnetRadius', 'meanDensity', 'rockGain', 'rockX', 'rockY', 'seedBudget', 'seedMean', 'sparseDarkLook', 'stepHandBank', 'thinGap', 'tiltX', 'tiltY'];
// The uniforms the forces pass reads (main's, less spin).
const FORCE_READS = ['air', 'curBuoy', 'curDamp', 'curGrav', 'drip', 'dt', 'l', 'maxCur', 'meanD', 'n', 'rock', 'smear', 'tension', 'time', 'turbDetail', 'turbScale', 'up', 'vibF', 'vibI'];

// ── 1. No sound reaches the step ────────────────────────────────────────────

console.log('\n1. No sound reaches the step');
const text = (p) => readFileSync(p, 'utf8');
const simSrc = text('src/sim/fluidSimulation.ts');
const names = (simSrc.match(/audioData|AudioData|useAudioAnalyzer/g) ?? []).length;
check('FluidSimulation.step takes the settings, the time and the noise, and its file never names the analyser\'s data',
  FluidSimulation.prototype.step.length === 3 && names === 0, `step takes ${FluidSimulation.prototype.step.length} arguments; ${names} mentions`);
{
  const types = text('src/gpu/solverTypes.ts'), forces = text('src/gpu/wgsl/fluid/forces.ts');
  const inTypes = /^\s*spin\s*:/m.test(types), inForces = /S\.spin\b/.test(forces), inCpu = /injectVorticity/.test(simSrc);
  check('the solver has no "spin": not in its parameters, not in the forces shader, not on the CPU grid',
    !inTypes && !inForces && !inCpu, `parameters ${inTypes ? 'have it' : 'clear'}, shader ${inForces ? 'reads it' : 'clear'}, CPU ${inCpu ? 'has it' : 'clear'}`);
}
{
  const viz = text('src/components/LiquidVisualizer.tsx');
  const calls = viz.split('\n').filter((l) => /fluidsRef\.current\[[^\]]+\]\.step\(/.test(l));
  const handed = calls.filter((l) => /audio/i.test(l));
  check('the frame loop steps each plate with its folded settings and no sound', calls.length >= 1 && handed.length === 0,
    `${calls.length} call(s), ${handed.length} with sound`);
}
{
  const from = simSrc.indexOf('private deriveStep('), to = simSrc.indexOf('\n  }\n', from);
  const reads = [...new Set([...simSrc.slice(from, to).matchAll(/this\.(\w+)/g)].map((m) => m[1]))].sort();
  const fresh = reads.filter((n) => !STEP_READS.includes(n));
  const loose = (simSrc.match(/^(?:export\s+)?(?:let|var)\s+\w+/gm) ?? []);
  check('the step derives its parameters from the settings and from fields of the layer that are each named here, and the file has no variable of its own',
    from > 0 && reads.length >= 10 && fresh.length === 0 && loose.length === 0,
    `${reads.length} fields read${fresh.length ? `, not named: ${fresh.join(', ')}` : ', all named'}; ${loose.length ? `module variables: ${loose.join(', ')}` : 'no module variables'}`);
  const forces = text('src/gpu/wgsl/fluid/forces.ts');
  const uniforms = [...new Set([...forces.matchAll(/\bS\.(\w+)/g)].map((m) => m[1]))].sort();
  const added = uniforms.filter((n) => !FORCE_READS.includes(n));
  check('and the forces shader reads only the uniforms named here', uniforms.length >= 10 && added.length === 0,
    `${uniforms.length} read${added.length ? `, not named: ${added.join(', ')}` : ', all named'}`);
}
check('stirOf takes the dial alone', stirOf.length === 1 && stirOf(0.5, 1, 1) === stirOf(0.5) && stirOf(0.5) === 0.5 * (1 + 3 * 0.125),
  `${stirOf.length} argument(s); 0.5 with a band ${f3(stirOf(0.5, 1, 1))}, alone ${f3(stirOf(0.5))}`);

// ── 2. Every cord at zero ───────────────────────────────────────────────────

console.log('\n2. With every cord at zero the band changes nothing');
const lookOf = (p) => ({ ...DEFAULT_SETTINGS, ...p.settings });
// A smooth field for the stir's curl: the app hands simplex noise, and any smooth one stirs.
const noise = (x, y) => Math.sin(x * 1.7 + 0.3) * Math.cos(y * 1.3 - 0.8) + 0.5 * Math.sin(x * 0.61 - y * 0.93);
/** The parameters one step derives from `settings` as the patch bay folds them with `sound` playing. */
function derived(settings, sound) {
  const sim = new FluidSimulation(48, 0, 0, 0.1);
  const bay = new PatchBay(settings);
  bay.fold(settings, ctxOf(sound), 1, 1000);
  sim.step(bay.layer(0), 0, noise);
  return sim.lastStep;
}
const differs = (a, b, skip = '') => Object.keys(a).filter((k) => k !== skip && !Object.is(a[k], b[k]) && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
{
  const moved = [];
  let cords = 0, stirred = 0;
  for (const p of PRESETS) {
    const base = { ...lookOf(p), layerCount: 1 };
    const zero = { ...base, sceneMappings: (base.sceneMappings ?? []).map((m) => ({ ...m, depth: 0 })) };
    cords += zero.sceneMappings.length;
    const band = derived(zero, LOUD), silent = derived({ ...base, sceneMappings: [] }, null);
    if (silent.turbScale > 0) stirred++;
    for (const k of differs(silent, band)) moved.push(`${p.id}: ${k} ${silent[k]} to ${band[k]}`);
  }
  check(`each look at its own Turbulence, its cords all at zero and the band at its ceiling, steps as it does with no cords in silence (${PRESETS.length} looks, ${cords} cords)`,
    moved.length === 0 && stirred >= PRESETS.length / 2, moved.slice(0, 6).join('; ') || `every parameter of every look the same; ${stirred} of them stirring by their own dial`);
}

// ── 3. A still plate ────────────────────────────────────────────────────────

console.log('\n3. A still plate: hard-edged pools, Turbulence 0, 120 steps');
const L = 96;
const STILL = {
  ...DEFAULT_SETTINGS, turbulenceScale: 0, vibrationFrequency: 0, rainDrip: 0, glassSmear: 0, airVelocity: 0,
  buoyancy: 0, gravity: 0, automateRate: 0, bubbles: 0, layerCount: 1, audioImpact: 0.45,
};
const PATCHED = 0.5;
// A hundredth of the ink somewhere else than on the still plate, which differs from itself by nothing at all.
const MOVED = 0.01;
function plate(settings, sound, steps = 120) {
  const sim = new FluidSimulation(L, 0, 0, 0.1);
  for (const [cx, cy, r, rgb] of [[30, 34, 9, [1, 0.1, 0.1]], [62, 40, 11, [0.1, 0.4, 1]], [46, 66, 8, [0.9, 0.8, 0.1]]])
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) sim.addDensity(x, y, 0.8, ...rgb);
  const start = Float32Array.from(sim.density);
  const bay = new PatchBay(settings);
  for (let k = 0; k < steps; k++) {
    bay.fold(settings, ctxOf(sound), 1, 1000 + k * 16.7);
    sim.step(bay.layer(0), k / 60, noise);
  }
  let v2 = 0, ink = 0;
  for (let i = 0; i < sim.vx.length; i++) v2 += sim.vx[i] ** 2 + sim.vy[i] ** 2;
  for (let i = 0; i < start.length; i++) ink += start[i];
  return { sim, ink, speed: Math.sqrt(v2 / sim.vx.length), turb: sim.lastStep?.turbScale ?? NaN };
}
/** How much of the ink is somewhere else on plate `a` than on plate `b`: half the summed difference, over the ink. */
const apart = (a, b) => { let d = 0; for (let i = 0; i < a.sim.density.length; i++) d += Math.abs(a.sim.density[i] - b.sim.density[i]); return d / 2 / b.ink; };
// The solver's rounding: a projection on a plate at rest leaves about 1e-13.
const AT_REST = 1e-9;
const same = (a, b) => ['density', 'densityR', 'densityG', 'densityB', 'vx', 'vy'].every((k) => a.sim[k].every((v, i) => v === b.sim[k][i]));
if (!built) check('the plate\'s four runs', false, 'lib/stir.ts has no stirCord yet');
else {
  const cord = (d) => ({ ...STILL, sceneMappings: [stirCord(d)] });
  const none = plate({ ...STILL, sceneMappings: [] }, null);
  const quiet = plate(cord(PATCHED), null);
  const zeroed = plate(cord(0), LOUD);
  const loud = plate(cord(PATCHED), LOUD);
  console.log(`   r.m.s. speed, and the ink moved against the plate with no cord in silence: cord, silence ${quiet.speed.toExponential(2)}, ${f3(apart(quiet, none))}; cord at zero, band ${zeroed.speed.toExponential(2)}, ${f3(apart(zeroed, none))}; cord, band ${loud.speed.toExponential(2)}, ${f3(apart(loud, none))}`);
  check('in silence with the cord patched the plate is still: no flow, and the same plate as with no cord at all',
    quiet.speed < AT_REST && quiet.turb === 0 && same(quiet, none), `speed ${quiet.speed.toExponential(2)}, stir ${f3(quiet.turb)}`);
  check('with the band loud and the cord at zero it is that same plate, value for value', zeroed.speed < AT_REST && zeroed.turb === 0 && same(zeroed, none),
    `speed ${zeroed.speed.toExponential(2)}, stir ${f3(zeroed.turb)}`);
  const dial = PATCHED * LOUD.mid / 100;
  check('with the band loud and the cord patched it moves: the stir is the folded dial\'s, there is flow, and the dye is carried',
    Math.abs(loud.turb - stirOf(dial)) < 1e-9 && loud.speed > 1e5 * AT_REST && apart(loud, none) > MOVED,
    `stir ${f3(loud.turb)} (the dial at ${f3(dial)}), speed ${loud.speed.toExponential(2)}, ${f3(apart(loud, none))} of the ink somewhere else`);
  // The band stops: one more step in silence on the plate that was moving.
  const bay = new PatchBay(cord(PATCHED));
  bay.fold(cord(PATCHED), ctxOf(null), 1, 5000);
  loud.sim.step(bay.layer(0), 1, noise);
  check('and when the band stops the step is handed no stir', loud.sim.lastStep.turbScale === 0, `stir ${f3(loud.sim.lastStep.turbScale)}`);
}

// ── 4. A patched cord moves the stir and nothing else ───────────────────────

console.log('\n4. A patched cord moves the stir and nothing else');
if (!built) check('the cord on every look', false, 'lib/stir.ts has no stirCord yet');
else {
  const bad = [];
  let least = Infinity;
  for (const p of PRESETS) {
    const base = { ...lookOf(p), layerCount: 1, sceneMappings: [stirCord(0.3)] };
    const s = derived(base, null), m = derived(base, LOUD);
    const rise = m.turbScale - s.turbScale;
    // A look already at the top of the dial has nowhere to go: its cord is clamped there, as every cord is.
    if (base.turbulenceScale < 0.99) { least = Math.min(least, rise); if (!(rise > 0)) bad.push(`${p.id}: stir ${f3(s.turbScale)} to ${f3(m.turbScale)}`); }
    for (const k of differs(s, m, 'turbScale')) bad.push(`${p.id}: ${k} ${s[k]} to ${m[k]}`);
  }
  check(`on every look the band through the cord raises the step's stir, and every other parameter is what silence gave (${PRESETS.length} looks)`,
    bad.length === 0, bad.slice(0, 6).join('; ') || `the least rise ${f3(least)}`);
}

// ── 5. The defaults keep the looks moving as they did ───────────────────────

console.log('\n5. The shelf\'s cords, against the multiplier and eddies they replace (club, 128 bpm)');
if (!built) check('the shelf\'s cords', false, 'lib/stir.ts has no stirCord yet');
else {
  const CLUB = [
    { kind: 'intro', bars: 4 }, { kind: 'verse', bars: 8 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 8 },
    { kind: 'breakdown', bars: 8 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 8 }, { kind: 'outro', bars: 4 },
  ];
  const frames = hear(arrange({ bpm: 128, sections: CLUB, seed: 1 }).pcm);
  const meanOf = (fs, k) => fs.reduce((s, f) => s + f[k], 0) / fs.length;
  const p95 = (a) => [...a].sort((x, y) => x - y)[Math.floor(0.95 * (a.length - 1))];
  // The loud fifth of the song by its mids, which is where the depths are set (lib/stir.ts says why not the mean).
  const mids = frames.map((f) => f.mid).sort((x, y) => x - y);
  const loudFifth = frames.filter((f) => f.mid >= mids[Math.floor(0.8 * (mids.length - 1))]);
  const heard = { energy: meanOf(loudFifth, 'energy'), mid: meanOf(loudFifth, 'mid'), treble: meanOf(loudFifth, 'treble') };
  const drift = Math.max(...Object.keys(heard).map((k) => Math.abs(heard[k] / STIR_REF[k] - 1)));
  check('the song\'s loud fifth is at the levels the depths are set from (STIR_REF), within a tenth', drift < 0.1,
    `energy ${f3(heard.energy)} (${f3(STIR_REF.energy)}), mid ${heard.mid.toFixed(1)} (${STIR_REF.mid}), treble ${heard.treble.toFixed(1)} (${STIR_REF.treble}); ${loudFifth.length} of ${frames.length} frames; the whole song's means ${f3(meanOf(frames, 'energy'))}, ${meanOf(frames, 'mid').toFixed(1)}, ${meanOf(frames, 'treble').toFixed(1)}`);

  {
    // The lib's copy of the old stir, which the depths are set from, against the one written out above.
    let apartMost = 0, n = 0;
    for (const t of [0, 0.08, 0.3, 0.5, 0.8, 1]) for (const d of [0, 0.35, 0.6, 0.95]) for (const f of [frames[300], frames[1500], frames[3000], LOUD, { energy: 0, mid: 0, treble: 0 }]) {
      const a = musicStirBefore(t, f.energy, f.mid, f.treble, d), b = stirWas(t, f.energy, f.mid, f.treble, d);
      apartMost = Math.max(apartMost, Math.abs(a - b) / Math.max(b, 0.05)); n++;
    }
    check('the lib\'s account of the old stir (musicStirBefore) is the one written out here, to a hundredth', apartMost < 0.01, `${n} points, the furthest ${(apartMost * 100).toFixed(2)}% apart`);
  }
  const wrong = [], off = [], loudOff = [], silentOff = [];
  let worst = { id: '', ratio: 1 }, peak = { id: '', ratio: 1 };
  for (const p of PRESETS) {
    const base = lookOf(p);
    const mine = (base.sceneMappings ?? []).filter(isStirCord);
    const want = stirCordDepth(base.turbulenceScale ?? 0, base.audioImpact ?? 0.45);
    if (want > 0 ? !(mine.length === 1 && mine[0].depth === want) : mine.length !== 0) { wrong.push(`${p.id}: ${mine.map((m) => m.depth).join(',') || 'none'}, wants ${want}`); continue; }
    // Its own stir cord alone: the look's other cords are its answers to the drums, and were there before.
    const only = { ...base, sceneMappings: mine };
    const bay = new PatchBay(only);
    let now = 0, was = 0;
    const nows = [], wases = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      bay.fold(only, ctxOf(f), 1, 1000 + i * 16.7);
      const n = stirOf(bay.layer(0).turbulenceScale), w = stirWas(base.turbulenceScale ?? 0, f.energy, f.mid, f.treble, base.audioImpact ?? 0.45);
      now += n; was += w; nows.push(n); wases.push(w);
    }
    const was95 = p95(wases);
    const ratio = was > 0 ? now / was : now === 0 ? 1 : Infinity;
    if (Math.abs(Math.log(ratio)) > Math.abs(Math.log(worst.ratio))) worst = { id: p.id, ratio };
    if (!(ratio > 0.75 && ratio < 1.25)) off.push(`${p.id}: ${ratio.toFixed(2)} of before (Turbulence ${base.turbulenceScale}, depth ${want})`);
    const top = was95 > 0 ? p95(nows) / was95 : 1;
    if (Math.abs(Math.log(top)) > Math.abs(Math.log(peak.ratio))) peak = { id: p.id, ratio: top };
    if (!(top > 0.75 && top < 1.25)) loudOff.push(`${p.id}: ${top.toFixed(2)} of before (Turbulence ${base.turbulenceScale}, depth ${want})`);
    bay.fold(only, ctxOf(null), 1, 99000);
    if (stirOf(bay.layer(0).turbulenceScale) !== stirOf(base.turbulenceScale ?? 0)) silentOff.push(p.id);
  }
  check(`every look carries one cord from the sound's mids onto Turbulence, at the depth its own dial and Sound Drive call for (${PRESETS.length} looks)`,
    wrong.length === 0, wrong.slice(0, 6).join('; ') || 'all of them');
  check('over the song each look\'s stir through its cord is within a quarter of what the multiplier and eddies gave',
    wrong.length === 0 && off.length === 0, off.slice(0, 6).join('; ') || `the furthest ${worst.id} at ${worst.ratio.toFixed(2)} of before`);
  check('and so is its loudest twentieth: the cord does not throw the dial at every loud moment',
    wrong.length === 0 && loudOff.length === 0, loudOff.slice(0, 6).join('; ') || `the furthest ${peak.id} at ${peak.ratio.toFixed(2)} of before`);
  check('and in silence each look\'s stir is its dial\'s, exactly', silentOff.length === 0, silentOff.join(', ') || 'all of them');
}

// ── 6. The phone's slider ───────────────────────────────────────────────────

console.log('\n6. The phone\'s slider');
if (!built) check('the slider\'s helpers', false, 'lib/stir.ts has no withMusicStir yet');
else {
  const kick = { source: 'hits', feature: 'kickHit', setting: 'platePressure', depth: 0.25 };
  const onPlate = { source: 'sound', feature: 'mid', setting: 'turbulenceScale', depth: 0.4, layer: 1 };
  const look = [kick, stirCord(0.2), onPlate];
  const set = withMusicStir(look, 0.6), out0 = withMusicStir(look, 0), fresh = withMusicStir([kick], 0.3);
  check('it reads the look\'s cord and sets it, and leaves the look\'s other cords as they were',
    musicStirOf(look) === 0.2 && musicStirOf(set) === 0.6 && set.length === 3 && set[0] === kick && set[2] === onPlate,
    `reads ${musicStirOf(look)}, set to ${musicStirOf(set)}, ${set.length} cords`);
  check('at zero the cord is taken out, and a look with none gains one when the slider is raised',
    musicStirOf(out0) === 0 && out0.length === 2 && !out0.some(isStirCord) && fresh.length === 2 && isStirCord(fresh[1]) && fresh[1].depth === 0.3,
    `at zero ${out0.length} cords; a fresh one at ${fresh[1]?.depth}`);
  check('a cord aimed at one plate, a gated one, or another reading on Turbulence is not the music\'s stir',
    !isStirCord(onPlate) && !isStirCord({ ...stirCord(0.2), mode: 'gate' }) && !isStirCord({ ...stirCord(0.2), feature: 'bass' }) && isStirCord(stirCord(0.2)));
}

// ── 7. A look saved before the cord ─────────────────────────────────────────
/*
  PLAN 38u-16. The built-in looks gain the cord where they are written, but a
  look the owner saved keeps the cords it was saved with, so every look saved
  before 2026-11-13 came back with none and stirred less to the music than it
  had. It is given the cord once, as it is read, and the saved look's version
  says it has been asked: a look saved since without the cord is one the
  owner pulled it from, and stays so. Each way a saved look arrives is tried:
  the file reader (which the saved shelf, cloud sync and an imported file
  all go through) and a set list, which takes a saved look whole.
*/
console.log('\n7. A look saved before the cord');
if (typeof saved?.parsePresetFile !== 'function' || typeof stir.withStirCordOnce !== 'function') check('a saved look\'s cord', false, 'lib/stir.ts has no withStirCordOnce yet');
else {
  const { parsePresetFile, serializePreset, PRESET_VERSION } = saved;
  const kick = { source: 'hits', feature: 'kickHit', setting: 'platePressure', depth: 0.25 };
  const dial = 0.62, drive = 0.7, want = stirCordDepth(dial, drive);
  const base = { format: 'chromaglass-preset', id: 'user-mine-1', name: 'Mine', createdAt: '2026-11-01T20:00:00Z' };
  const settingsWith = (maps) => ({ ...DEFAULT_SETTINGS, turbulenceScale: dial, audioImpact: drive, sceneMappings: maps });
  const read = (version, maps) => parsePresetFile(JSON.stringify({ ...base, version, settings: settingsWith(maps) }));
  const stirs = (p) => (p?.settings.sceneMappings ?? []).filter(isStirCord);
  const before = read(2, [kick]), older = read(1, []), pulled = read(PRESET_VERSION, [kick]);
  const owned = read(2, [kick, stirCord(0.15)]);
  check('a look saved before the cord is read with it, at the depth its own Turbulence and Sound Drive call for, its own cords kept',
    want > 0 && stirs(before).length === 1 && stirs(before)[0].depth === want && before.settings.sceneMappings[0].setting === kick.setting
      && stirs(older).length === 1 && stirs(older)[0].depth === want,
    `wants ${want}; saved at 2 has ${stirs(before).map((m) => m.depth).join(',') || 'none'} beside ${before.settings.sceneMappings.length - stirs(before).length} other(s); at 1 ${stirs(older).map((m) => m.depth).join(',') || 'none'}`);
  check('one saved since without the cord is left without it: the owner pulled it',
    PRESET_VERSION >= 3 && stirs(pulled).length === 0 && pulled.settings.sceneMappings.length === 1,
    `version ${PRESET_VERSION}, ${pulled.settings.sceneMappings.length} cord(s), ${stirs(pulled).length} stir`);
  check('one that already has a stir cord keeps it at its own depth, and gains no second',
    stirs(owned).length === 1 && stirs(owned)[0].depth === 0.15, stirs(owned).map((m) => m.depth).join(','));
  const again = parsePresetFile(serializePreset(before));
  const pulledAgain = parsePresetFile(serializePreset({ ...before, settings: { ...before.settings, sceneMappings: before.settings.sceneMappings.filter((m) => !isStirCord(m)) } }));
  check('it is asked once: read, saved and read again it is the same, and pulled out after and saved it stays out',
    before.version === PRESET_VERSION && stirs(again).length === 1 && again.settings.sceneMappings.length === before.settings.sceneMappings.length
      && stirs(pulledAgain).length === 0,
    `version ${before.version}; again ${stirs(again).length} stir of ${again.settings.sceneMappings.length}; pulled ${stirs(pulledAgain).length}`);
  // And arriving in a set list, which takes the saved look whole and not through the file reader.
  const known = (k) => k in DEFAULT_SETTINGS;
  const inSet = (version, maps) => readSetListFile(JSON.stringify({ format: 'chromaglass-setlist', version: 1, items: [{ saved: base.id }],
    presets: [{ ...base, version, settings: settingsWith(maps) }] }), known).presets[0];
  const setOld = inSet(2, [kick]), setSince = inSet(PRESET_VERSION, [kick]);
  check('and the same in a set list: an old look gains the cord, one saved since does not, its id kept',
    stirs(setOld).length === 1 && stirs(setOld)[0].depth === want && stirs(setSince).length === 0 && setOld?.id === base.id,
    `${stirs(setOld).length}, ${stirs(setSince).length}, ${setOld?.id}`);
  // Folded, the old look stirs with the band as a built-in look with its dials does.
  const bay = new PatchBay(before.settings);
  bay.fold(before.settings, ctxOf(LOUD), 1, 1000);
  const loud = bay.layer(0).turbulenceScale;
  check('folded with a band playing, the old look\'s Turbulence rises by its cord, as it did before the cord by the multiplier',
    loud > dial + 0.05, `${f3(dial)} at rest, ${f3(loud)} with the band`);
}

// ── Owed ────────────────────────────────────────────────────────────────────

{
  const clock = (simSrc.match(/this\.(clockLean|tempoMul|paceMul)\b/g) ?? []).length;
  console.log(`\n owed  the music still speeds and slows the solver's clock (PLAN 38u-6: ${clock} reads of the lean, the tempo and the pace in the step), and a kick still makes air from nowhere (38u-13)`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
