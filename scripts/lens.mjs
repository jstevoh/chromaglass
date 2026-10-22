#!/usr/bin/env node
/**
 * The camera section's dials each do something (PLAN.md 33i).
 *
 *   npm run lens                       (the lab: any adapter that computes, so a cloud session too)
 *   LENS_BEFORE=1 npm run lens         the same asks of the camera pass on origin/main, which fail
 *
 * What was reported (the owner, 2026-10-22): "the camera controls don't really
 * do much". Measured in the lab on a plate of nine dyes, through the real plate
 * shader and the real camera pass, each dial turned all the way up on its own,
 * and the mean change to the frame in levels (of 255; Lens at 1, which is the
 * only way the old pass let a dial show):
 *
 *   refraction 1      3.6 (the shader scaled the normal, already the slope
 *                     times the dye amount, by the amount a second time)
 *   chromatic 1       0.5, under a pixel of fringe: invisible
 *   aperture 1        4.4 (a blur circle under four pixels at the widest)
 *   bloom 1           8.8, the one that read
 *
 * and with Lens at 0 they did nothing at all: the pass multiplied its whole
 * output by Lens (`mix(plain, col, amount)`), the five dials were greyed out
 * until it was up, and Lens itself also switched on the sensor's roll-off,
 * vignette and grain, a 19-level change to the whole frame on its own.
 *
 * Asked here:
 *
 *   1. the gate: the pass is wanted when Lens or any of the four optics is up
 *      and by nothing else; the defaults and every shipped look and every roll
 *      of Lucky that has Lens at 0 have all four at 0, so no look changes;
 *   2. each dial alone, with Lens at 0, moves a share of the frame that a
 *      person sees (at least 8 levels in some channel), above a bar, and a
 *      half-turn moves less than a full one (a dial, not a switch);
 *   3. controls: the same render twice is identical (so a difference is the
 *      dial); each dial at 0 is the off picture exactly; a plate with no dye
 *      on it gives refraction, aperture and bloom nothing to work on; Focus
 *      moves the frame with the aperture open and does not with it shut;
 *   4. Lens is the sensor's look and no more: Lens at 1 with the optics at 0
 *      changes the frame, and Lens at 1 over the optics keeps what they did;
 *   5. nothing in the camera pass is driven by the band: its sources read no
 *      sound, so the frame stays where the plate puts it.
 *
 * `LENS_BEFORE=1` builds the lab on the camera shader as origin/main has it
 * and asks for the dials with Lens at 0, as a person would turn them: the
 * old pass does nothing there at all. At Lens 1 it moved the frame far less
 * (the numbers are printed with it).
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';

const BEFORE = !!process.env.LENS_BEFORE;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// ── 1. The gate ───────────────────────────────────────────────────────
const out = 'node_modules/.cache/lens-lib.mjs';
if (!BEFORE) {
  await build({
    stdin: {
      contents: [
        "export { cameraWanted } from './src/gpu/cameraWanted.ts';",
        "export { DEFAULT_SETTINGS } from './src/types.ts';",
        "export { PRESETS } from './src/presets.ts';",
        "export { luckyLook } from './src/lib/lucky.ts';",
        "export { parsePresetFile, upgradeSaved, PRESET_FORMAT } from './src/lib/userPresets.ts';",
      ].join('\n'),
      resolveDir: '.', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
    define: { 'import.meta.env.DEV': 'false' },
  });
  const L = await import(`../${out}`);
  const D = L.DEFAULT_SETTINGS;
  const OPTICS = ['refraction', 'aperture', 'bloom', 'chromaticAberration'];
  const wanted = (over) => L.cameraWanted({ ...D, ...over });

  check('the defaults leave the camera pass off',
    !wanted({}) && OPTICS.every((k) => D[k] === 0) && D.camera === 0,
    `camera ${D.camera}, ${OPTICS.map((k) => `${k} ${D[k]}`).join(', ')}`);
  const each = [['camera', 1], ...OPTICS.map((k) => [k, 0.3])];
  check('Lens alone, or any one optic alone, asks for the pass',
    each.every(([k, v]) => wanted({ [k]: v })),
    each.map(([k, v]) => `${k} ${v}: ${wanted({ [k]: v })}`).join(', '));
  check('Focus alone does not (a focal plane with nothing to blur shows nothing)',
    !wanted({ focus: 1 }));
  const drift = L.PRESETS.filter((p) => wanted(p.settings) !== ((p.settings.camera ?? 0) > 0.001));
  check('every shipped look keeps its camera as it was: on exactly when it set Lens above 0',
    drift.length === 0, drift.length ? `changed: ${drift.map((p) => p.id).join(', ')}` : `${L.PRESETS.length} looks`);
  let lucky = 0, bad = 0, lensed = 0;
  let s = 7;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 400; i++) {
    const look = L.luckyLook(D, ['#ff00aa', '#00aaff', '#aaff00'], rand);
    lucky++;
    const lens = (look.camera ?? 0) > 0.001;
    if (lens) lensed++;
    if (!lens && OPTICS.some((k) => (look[k] ?? 0) > 0.001)) bad++;
  }
  check('a roll of Lucky that leaves Lens at 0 leaves all four optics at 0, and some rolls take the lens',
    bad === 0 && lensed > lucky * 0.25 && lensed < lucky * 0.55, `${lucky} rolls, ${lensed} with the lens on, ${bad} with an optic up and Lens at 0`);

  // A look the owner saved before the optics acted on their own holds their
  // old defaults beside Lens 0 (a saved look keeps every setting), which were
  // inert then and would not be now: it must read as it looked.
  const OLD = { aperture: 0.5, bloom: 0.4, chromaticAberration: 0.3, refraction: 0.6 };
  const saved = (version, over) => L.parsePresetFile(JSON.stringify({
    format: L.PRESET_FORMAT, version, name: 'old', settings: { ...D, ...OLD, camera: 0, ...over } }));
  const m2 = saved(2, {}), m1 = saved(undefined, {});
  check('a look saved before the optics acted alone, with Lens at 0, is read with them at 0',
    !L.cameraWanted(m2.settings) && !L.cameraWanted(m1.settings) && OPTICS.every((k) => m2.settings[k] === 0 && m1.settings[k] === 0),
    `version 2: ${OPTICS.map((k) => m2.settings[k]).join('/')}, no version: ${OPTICS.map((k) => m1.settings[k]).join('/')}`);
  const lensed2 = saved(2, { camera: 0.6 });
  const v3 = saved(3, {});
  check('one saved with Lens up keeps its optics, and one saved from now on keeps whatever it was saved with',
    OPTICS.every((k) => lensed2.settings[k] === OLD[k] && v3.settings[k] === OLD[k]),
    `lens up ${OPTICS.map((k) => lensed2.settings[k]).join('/')}, version 3 ${OPTICS.map((k) => v3.settings[k]).join('/')}`);
  const up = L.upgradeSaved({ ...m2, version: 2, settings: { ...D, ...OLD, camera: 0 } });
  check('a set list\'s saved looks are read the same way', !L.cameraWanted(up.settings) && up.version === 3,
    `version ${up.version}, wanted ${L.cameraWanted(up.settings)}`);
}

// ── 2–4. The pass, in the lab ──────────────────────────────────────────
const plugins = [];
if (BEFORE) {
  const old = execSync('git show origin/main:src/gpu/wgsl/camera.ts', { encoding: 'utf8' });
  plugins.push({
    name: 'old-camera',
    setup(b) { b.onLoad({ filter: /src\/gpu\/wgsl\/camera\.ts$/ }, () => ({ contents: old, loader: 'ts' })); },
  });
}
const { page, close } = await openLab({ plugins, tag: BEFORE ? 'lensbefore' : '' });
const S = 384;
const r = await page.evaluate(async (S) => {
  await lab.create(256);
  const pal = lab.palette();
  let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9; i++) {
    const a = lab.dyeOf(pal.colours[(i * 3) % pal.colours.length]);
    lab.dye(0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7, 0.06 + rnd() * 0.07, a, 1.4);
  }
  lab.flush(); await lab.step(40);
  const draw = (cam) => lab.render(S, { granulation: 0 }, { camera: cam, time: 3 });
  const diff = (a, b) => {
    let big = 0, sum = 0; const n = a.length / 4;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (d >= 8) big++;
      sum += d;
    }
    return { share: big / n, mean: sum / n };
  };
  const o = {};
  const OFF = { amount: 0, focus: 0.5 };
  const off = await draw(OFF);
  o.off2 = diff(off, await draw(OFF));
  const dials = { refraction: 'refraction', chromatic: 'chromatic', aperture: 'aperture', bloom: 'bloom' };
  o.dial = {};
  for (const [name, key] of Object.entries(dials)) {
    const full = await draw({ ...OFF, [key]: 1 });
    const half = await draw({ ...OFF, [key]: 0.5 });
    const zero = await draw({ ...OFF, [key]: 0 });
    o.dial[name] = { full: diff(off, full), half: diff(off, half), zero: diff(off, zero), atLens1: diff(await draw({ amount: 1, focus: 0.5 }), await draw({ amount: 1, focus: 0.5, [key]: 1 })) };
  }
  // Focus with the aperture open and shut.
  const open0 = await draw({ ...OFF, aperture: 1, focus: 0 });
  const open1 = await draw({ ...OFF, aperture: 1, focus: 1 });
  o.focusOpen = diff(open0, open1);
  o.focusShut = diff(await draw({ ...OFF, focus: 0 }), await draw({ ...OFF, focus: 1 }));
  // Lens is the sensor look: on its own it moves the frame; over the optics it keeps them.
  const optics = { refraction: 1, bloom: 1, aperture: 1, chromatic: 1, focus: 0.3 };
  const lensOnly = await draw({ amount: 1, focus: 0.5 });
  o.lensOnly = diff(off, lensOnly);
  const opticsOff = await draw({ ...OFF, ...optics });
  const opticsLens = await draw({ ...OFF, ...optics, amount: 1 });
  o.opticsKept = diff(off, opticsLens);
  o.lensOverOptics = diff(opticsOff, opticsLens);
  // The pass with every dial at 0 is the plate as it was without a pass:
  // nothing jumps when a dial leaves 0.
  o.nopass = diff(off, await lab.render(S, { granulation: 0 }, { time: 3 }));
  // What the lens has to work on, and where it works.
  const aux = await lab.render(S, { granulation: 0 }, { camera: { amount: 0 }, aux: true, time: 3 });
  const m = aux.length / 4;
  let hs = 0, steep = 0, flat = 0, dyed = 0;
  const slope = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    slope[i] = Math.hypot(aux[i * 4] / 255 * 2 - 1, aux[i * 4 + 1] / 255 * 2 - 1);
    hs += aux[i * 4 + 2];
    if (slope[i] > 0.2) steep++;
    if (slope[i] < 0.02) flat++;
    if (aux[i * 4 + 2] > 8) dyed++;
  }
  o.aux = { height: hs / m / 255, steep: steep / m, flat: flat / m, dyed: dyed / m };
  // Where each dial changed a pixel, by the slope under it.
  const moved = (a, b) => {
    let st = 0, st8 = 0, fl = 0, fl8 = 0, dark = 0, green = 0;
    for (let i = 0; i < m; i++) {
      const d = Math.max(Math.abs(a[i * 4] - b[i * 4]), Math.abs(a[i * 4 + 1] - b[i * 4 + 1]), Math.abs(a[i * 4 + 2] - b[i * 4 + 2]));
      if (slope[i] > 0.2) { st++; if (d >= 8) st8++; }
      else if (slope[i] < 0.02) { fl++; if (d >= 8) fl8++; }
      if (b[i * 4] + b[i * 4 + 1] + b[i * 4 + 2] <= a[i * 4] + a[i * 4 + 1] + a[i * 4 + 2] - 9) dark++;
      // Not on black: the dither is added only to a pixel that has some light, so a fringe
      // reaching one off the black edge brings its dither, in green too.
      if (Math.min(Math.max(a[i * 4], a[i * 4 + 1], a[i * 4 + 2]), Math.max(b[i * 4], b[i * 4 + 1], b[i * 4 + 2])) > 8 && a[i * 4 + 1] !== b[i * 4 + 1]) green++;
    }
    return { steep: st8 / Math.max(1, st), flat: fl8 / Math.max(1, fl), dark: dark / m, green: green / m };
  };
  o.whereRefraction = moved(off, await draw({ ...OFF, refraction: 1 }));
  o.whereBloom = moved(off, await draw({ ...OFF, bloom: 1 }));
  o.whereChromatic = moved(off, await draw({ ...OFF, chromatic: 1 }));
  // A plate with nothing on it.
  await lab.create(256);
  lab.flush(); await lab.step(4);
  const bare = await draw(OFF);
  o.bare = {};
  for (const key of ['refraction', 'aperture', 'bloom']) o.bare[key] = diff(bare, await draw({ ...OFF, [key]: 1 }));
  return o;
}, S);
await close();

const OLD_NOTE = BEFORE ? ' (the camera pass as origin/main has it)' : '';
// Mean change in 0..255 levels over the whole frame, full dial. Measured on
// this build (Metal, 384 px, nine pours): refraction 11.7, aperture 7.9, bloom
// 21.9, chromatic 4.3. The pass as origin/main has it, at Lens 1 (the only way
// those dials worked there): 3.6, 4.4, 8.8, 0.5. A bar between the two fails
// the old pass on strength as well as on the Lens multiply.
const need = { refraction: 6, aperture: 6, bloom: 15, chromatic: 2 };
check('the same render twice is identical, so a difference below is the dial', r.off2.share === 0 && r.off2.mean === 0, `${r.off2.mean.toFixed(3)} levels`);
check('every dial at 0 draws the plate as it is drawn with no pass at all',
  r.nopass.share === 0 && r.nopass.mean < 1.5, `${pct(r.nopass.share)} moved, mean ${r.nopass.mean.toFixed(2)} levels`);
check('the plate has dye to bend and a slope to bend it by',
  r.aux.height > 0.1 && r.aux.dyed > 0.1 && r.aux.steep >= 0.02,
  `height ${r.aux.height.toFixed(2)} mean, ${pct(r.aux.dyed)} dyed, ${pct(r.aux.steep)} of the plate steeper than 0.2`);
for (const [name, bar] of Object.entries(need)) {
  const d = r.dial[name];
  check(`${name} turned up alone, with Lens at 0, moves the frame by at least ${bar} levels${OLD_NOTE}`,
    d.full.mean >= bar, `mean ${d.full.mean.toFixed(1)} levels (${pct(d.full.share)} of pixels by 8 or more); at Lens 1 ${d.atLens1.mean.toFixed(1)}`);
}
for (const [name, bar] of Object.entries(need)) {
  const d = r.dial[name];
  check(`${name} turned up with Lens at 1 is as strong, not weaker for the Lens${OLD_NOTE}`,
    d.atLens1.mean >= bar, `mean ${d.atLens1.mean.toFixed(1)} levels`);
}
for (const name of Object.keys(need)) {
  const d = r.dial[name];
  check(`${name}: a half-turn moves the frame less than a full turn, and a turn to 0 not at all`,
    d.half.mean < d.full.mean && d.half.mean > 0 && d.zero.share === 0 && d.zero.mean === 0,
    `half ${d.half.mean.toFixed(1)}, full ${d.full.mean.toFixed(1)}, zero ${d.zero.mean.toFixed(1)} levels`);
}
// Where each dial works is its physics. Refraction turns light where the
// surface is tilted, so it must change the steep parts of the plate and leave
// a flat part (slope under 0.02) nearly alone; dispersion is a shift of red
// against blue about the green, so green stays; a glow adds light and never
// takes it away.
check('refraction changes the steep parts of the plate and spares the flat',
  r.whereRefraction.steep >= 0.3 && r.whereRefraction.steep >= 3 * r.whereRefraction.flat,
  `${pct(r.whereRefraction.steep)} of steep pixels moved by 8 or more, ${pct(r.whereRefraction.flat)} of flat`);
check('chromatic aberration leaves the green channel alone',
  r.whereChromatic.green === 0, `${pct(r.whereChromatic.green)} of pixels changed in green`);
check('bloom only adds light',
  r.whereBloom.dark < 0.005, `${pct(r.whereBloom.dark)} of pixels darkened by 3 or more levels`);
check('a plate with no dye on it gives refraction, aperture and bloom nothing to work on',
  Object.values(r.bare).every((d) => d.share === 0),
  Object.entries(r.bare).map(([k, d]) => `${k} ${pct(d.share)}`).join(', '));
check('Focus moves the frame with the aperture open, and not with it shut',
  r.focusOpen.share >= 0.02 && r.focusShut.share === 0,
  `open ${pct(r.focusOpen.share)}, shut ${pct(r.focusShut.share)}`);
check('Lens alone is the sensor\'s look and moves the frame by itself',
  r.lensOnly.share >= 0.1, `${pct(r.lensOnly.share)} (mean ${r.lensOnly.mean.toFixed(1)} levels)`);
// Lens is a sensor look laid over the optics: it should still be most of what
// it was on a bare plate once the optics are up, not eaten by them.
check('Lens over the optics keeps what the optics did and still adds its own look',
  r.opticsKept.share >= 0.3 && r.lensOverOptics.share >= 0.5 * r.lensOnly.share,
  `against the plain picture ${pct(r.opticsKept.share)}; Lens's own part ${pct(r.lensOverOptics.share)} against ${pct(r.lensOnly.share)} alone`);

// ── 5. No sound in the pass ───────────────────────────────────────────
const SOUND = /\b(audio|bass|beat|kick|energy|treble|mids?|analy[sz]er|spectrum|rms|sound)\b/i;
for (const f of ['src/gpu/wgsl/camera.ts', 'src/gpu/camera.ts', 'src/gpu/cameraWanted.ts']) {
  const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check(`${f} reads no sound`, !SOUND.test(code), SOUND.exec(code)?.[0] ?? '');
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
