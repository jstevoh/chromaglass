#!/usr/bin/env node
/**
 * The camera section's dials each do something (PLAN.md 33i).
 *
 *   npm run lens                       (the lab: any adapter that computes, so a cloud session too)
 *   LENS_BEFORE=1 npm run lens         the same asks of the camera pass as it was before 33i
 *                                      (scripts/fixtures/camera-before-33i.ts.txt), which fail
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
 *      and by nothing else (every other number in the settings is turned to 1
 *      in turn and none wakes it); the defaults and every shipped look and
 *      every roll of Lucky that has Lens at 0 have all four at 0, so no look
 *      changes;
 *   2. each dial alone, with Lens at 0, moves a share of the frame that a
 *      person sees (at least 8 levels in some channel), above a bar; a
 *      half-turn moves less than a full one and a turn to nearly 0 (0.002)
 *      next to nothing, so it is a dial that fades out, not a switch;
 *   3. controls: the same render twice is identical (so a difference is the
 *      dial); every dial at 0 is the plate drawn with no pass at all; a dark
 *      plate stays dark under every optic (none adds light of its own); on a
 *      flat wash of dye refraction and aperture move nothing, because they act
 *      on the relief and a wash has none, while bloom, which acts on light,
 *      moves most of it; Focus moves the frame with the aperture open and does
 *      not with it shut; refraction moves the picture the way the slope says:
 *      a steep pixel takes the colour the plate has a tenth of the frame along
 *      its slope, not the colour that far against it (a shift that ignored the
 *      slope, or read it backwards or with its axes swapped, fails);
 *   4. Lens is the sensor's look and no more: Lens at 1 with the optics at 0
 *      changes the frame, and over the optics the optics still do at least
 *      half of what they do without it while Lens still adds its own; each
 *      dial alone moves the frame at least three quarters as much with Lens at
 *      1 as with it at 0 (it measured 85% to 96%);
 *   5. the camera pass's own code reads no sound, and the app fills its
 *      uniforms from the settings and the clock alone (the call in
 *      LiquidVisualizer is read, beside a copy that adds the bass to one dial,
 *      which must fail), so the frame stays where the plate puts it. A dial
 *      moves with the music only through what moves the settings: a cord a
 *      person patches (MIDI; the patch bay has no keys for it, PLAN.md 33i-5),
 *      or Evolve, whose glass theme wanders the optics it may (printed) over
 *      minutes and leans which way on the song's sections (src/lib/slowEvolve.ts);
 *   6. a look saved with Lens up opens looking as it did. The first reading of
 *      such a look, "it keeps its optics", was reviewed on this plate: the new
 *      optics are stronger at the same dial, so a look saved with the old
 *      defaults (aperture .5, bloom .4, chromatic .3, refraction .6) and Lens
 *      at 1 moved 8.1 levels on average (31.6% of pixels by 8 or more), and at
 *      Lens .6 10.5 (39.4%). Each such look is now rendered through the old
 *      pass (a second lab built on the frozen old shader, beside this one) and
 *      through the new pass with the settings the loader gives it, and the
 *      difference over the lit pixels held under a bar on its mean and on the
 *      share moved by 8 levels or more (the black around the pours is half the
 *      frame, and would halve any mean taken over all of it); the unmigrated
 *      reading is rendered too, as the control, and must be far worse, or the
 *      bar measures nothing; and the fitted bloom and refraction, each taken
 *      at half and at one and a half times, must sit further from the old
 *      picture on most looks, or the fit is a guess the bars cannot see.
 *
 * The saved looks are drawn at 1024 px, not at the 384 the dials are. The old
 * pass's blur circle was a count of pixels (nine per unit of height between
 * the dye and the focal plane) and the new one is a share of the frame (a
 * twentieth), so how the two compare depends on the frame, and a look saved
 * before 33i was seen at the owner's, about a thousand pixels tall. The first
 * fit of the aperture (0.8) was made at 384 and is right only there: at 1024
 * the best is 0.3, which is 0.8 × 384/1024, and near focus 0, where the old
 * circle was widest, smaller still (the loader's `apertureScale`). The 384 fit
 * is rendered here as a second control: at 1024 it must miss the bar on a
 * third of the looks, or the bar cannot tell a fit from a near one.
 *
 * `LENS_BEFORE=1` builds the lab on the camera shader as it was before 33i
 * and asks for the dials with Lens at 0, as a person would turn them: the
 * old pass does nothing there at all. At Lens 1 it moved the frame far less
 * (the numbers are printed with it).
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';

const BEFORE = !!process.env.LENS_BEFORE;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// What the owner's looks saved before 33i held beside Lens: the four optics
// were multiplied by Lens then, and these were the defaults. Three sets (the
// defaults, a strong set and a light one) at three Lens values, because the
// old pass blended by Lens and the blur and the glow are not linear in a dial;
// and the three at Lens 1 over the focal plane, because the old blur circle
// grew with the distance to it and the loader scales the aperture by Focus.
const OLD = { aperture: 0.5, bloom: 0.4, chromaticAberration: 0.3, refraction: 0.6 };
const SAVED_SETS = {
  'the old defaults': OLD,
  'every optic at .8': { aperture: 0.8, bloom: 0.8, chromaticAberration: 0.8, refraction: 0.8 },
  'every optic at .25': { aperture: 0.25, bloom: 0.25, chromaticAberration: 0.25, refraction: 0.25 },
};
const FOCUS = 0.55; // DEFAULT_SETTINGS.focus, which the old pass was also shown with
const looks = (lens, focus) => Object.entries(SAVED_SETS).map(([name, set]) => ({ lens, focus, name, set }));
const SAVED = [...[1, 0.6, 0.3].flatMap((lens) => looks(lens, FOCUS)), ...[0.05, 0.3, 1].flatMap((focus) => looks(1, focus))];
const SAVED_S = 1024;
// The aperture's first fit, made at 384 px (the control below).
const FIT_384 = 0.8;
// The saved looks' bars over the lit pixels: the mean difference in levels and
// the share moved by 8 or more (section 6). The worst look of each set on
// Metal (2026-10-30) was 3.17 levels and 8.9% (the old defaults, Lens .6),
// 5.49 and 14.0% (every optic at .8, Lens .6) and 1.78 and 3.8% (at .25;
// Lens .6 and Lens 1 at Focus .05); each bar is that and about a third again.
const BAR = {
  'the old defaults': { mean: 4.3, share: 0.12 },
  'every optic at .8': { mean: 7.4, share: 0.19 },
  'every optic at .25': { mean: 2.4, share: 0.05 },
};

// The old pass's reading of a saved look: the dials as they were written.
const oldCamera = (c) => ({ amount: c.lens, focus: c.focus, aperture: c.set.aperture, bloom: c.set.bloom, chromatic: c.set.chromaticAberration, refraction: c.set.refraction });

// ── 1. The gate ───────────────────────────────────────────────────────
const out = 'node_modules/.cache/lens-lib.mjs';
// The saved looks, as the new pass is given them: the loader's reading, the
// settings as written (the control), and the loader's reading with the
// aperture at its 384 px fit (the second control).
let migratedCams = [], rawCams = [], fit384Cams = [], nearCams = [], driftable = [];
// The near misses: the fitted bloom and refraction each taken at half and at
// one and a half times. Chromatic is not among them: its whole effect on a
// migrated look is under a twentieth of a level (the old pass's fringe and the
// new one's both round to nothing at the dials a look was saved with), so no
// scale of it can be told from another, and none can do harm.
const NEAR = [['bloom', 0.5], ['bloom', 1.5], ['refraction', 0.5], ['refraction', 1.5]];
if (!BEFORE) {
  await build({
    stdin: {
      contents: [
        "export { cameraWanted } from './src/gpu/cameraWanted.ts';",
        "export { DEFAULT_SETTINGS } from './src/types.ts';",
        "export { PRESETS } from './src/presets.ts';",
        "export { luckyLook } from './src/lib/lucky.ts';",
        "export { parsePresetFile, upgradeSaved, PRESET_FORMAT } from './src/lib/userPresets.ts';",
        "export { DRIFTABLE } from './src/lib/drift.ts';",
      ].join('\n'),
      resolveDir: '.', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
    define: { 'import.meta.env.DEV': 'false' },
  });
  const L = await import(`../${out}`);
  const D = L.DEFAULT_SETTINGS;
  const OPTICS = ['refraction', 'aperture', 'bloom', 'chromaticAberration'];
  const savedLook = (version, over) => L.parsePresetFile(JSON.stringify({
    format: L.PRESET_FORMAT, version, name: 'old', settings: { ...D, ...OLD, camera: 0, ...over } }));
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
  // Every other number a look holds, turned all the way up on its own: the
  // gate reads Lens and the four optics and nothing else, so no other dial
  // switches a pass on that changes the frame (the sensor's grain moved out
  // of this pass into the plate's own uniforms for that reason).
  const others = Object.keys(D).filter((k) => typeof D[k] === 'number' && k !== 'camera' && !OPTICS.includes(k));
  const woke = others.filter((k) => wanted({ [k]: 1 }));
  check('no other setting asks for the pass: every other number in the settings, at 1 on its own, leaves it off',
    others.length >= 50 && woke.length === 0, woke.length ? `woke it: ${woke.join(', ')}` : `${others.length} settings`);
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
  const m2 = savedLook(2, {}), m1 = savedLook(undefined, {});
  check('a look saved before the optics acted alone, with Lens at 0, is read with them at 0',
    !L.cameraWanted(m2.settings) && !L.cameraWanted(m1.settings) && OPTICS.every((k) => m2.settings[k] === 0 && m1.settings[k] === 0),
    `version 2: ${OPTICS.map((k) => m2.settings[k]).join('/')}, no version: ${OPTICS.map((k) => m1.settings[k]).join('/')}`);
  const lensed2 = savedLook(2, { camera: 0.6 });
  const v3 = savedLook(3, {});
  const weaker = ['aperture', 'bloom', 'chromaticAberration', 'refraction'].every((k) => lensed2.settings[k] > 0 && lensed2.settings[k] < OLD[k] * 0.6 + 1e-9);
  check('one saved with Lens up has each optic scaled down to the dial that draws what it drew, and one saved from now on keeps whatever it was saved with',
    weaker && OPTICS.every((k) => v3.settings[k] === OLD[k]),
    `lens .6 ${OPTICS.map((k) => lensed2.settings[k]).join('/')} from ${OPTICS.map((k) => OLD[k]).join('/')}, version 3 ${OPTICS.map((k) => v3.settings[k]).join('/')}`);
  // Not merely above 0: exactly what the same look reads as when it wrote the
  // old defaults out, so a fallback to some other number (the new default,
  // a half) fails.
  const absent = L.parsePresetFile(JSON.stringify({ format: L.PRESET_FORMAT, version: 2, name: 'old', settings: { camera: 1 } })).settings;
  const written = savedLook(2, { camera: 1 }).settings;
  check('a look saved with Lens up and an optic it never wrote is read with that optic\'s old default, not 0',
    OPTICS.every((k) => absent[k] > 0 && absent[k] === written[k]),
    `${OPTICS.map((k) => absent[k]).join('/')}, written out ${OPTICS.map((k) => written[k]).join('/')}`);
  migratedCams = SAVED.map((c) => {
    const st = savedLook(2, { camera: c.lens, focus: c.focus, ...c.set }).settings;
    return { amount: st.camera, focus: st.focus, aperture: st.aperture, bloom: st.bloom, chromatic: st.chromaticAberration, refraction: st.refraction };
  });
  rawCams = SAVED.map(oldCamera);
  driftable = ['camera', 'focus', ...OPTICS].filter((k) => L.DRIFTABLE.includes(k));
  fit384Cams = SAVED.map((c, i) => ({ ...migratedCams[i], aperture: Math.round(Math.min(1, c.set.aperture * c.lens * FIT_384) * 1000) / 1000 }));
  nearCams = SAVED.map((c, i) => NEAR.map(([key, k]) => ({ ...migratedCams[i], [key]: Math.round(Math.min(1, migratedCams[i][key] * k) * 1000) / 1000 })));
  const up = L.upgradeSaved({ ...m2, version: 2, settings: { ...D, ...OLD, camera: 0 } });
  check('a set list\'s saved looks are read the same way', !L.cameraWanted(up.settings) && up.version === 3,
    `version ${up.version}, wanted ${L.cameraWanted(up.settings)}`);
}

// ── 2–4. The pass, in the lab ──────────────────────────────────────────
// The camera pass as it was before 33i, frozen in a fixture so this runs where
// origin/main is not fetched and does not move when main does.
const oldShader = [{
  name: 'old-camera',
  setup(b) {
    const old = readFileSync('scripts/fixtures/camera-before-33i.ts.txt', 'utf8');
    b.onLoad({ filter: /src\/gpu\/wgsl\/camera\.ts$/ }, () => ({ contents: old, loader: 'ts' }));
  },
}];
// The plate every frame of the dials and the saved looks is drawn from, and
// the sums both labs share. `diff` is the share of pixels that moved by 8 or
// more levels in some channel and the mean change (the larger of the three
// channels at each pixel), over the pixels `win` keeps, or all of them.
const helpers = () => {
  window.nine = async () => {
    await lab.create(256);
    const pal = lab.palette();
    let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 9; i++) {
      const a = lab.dyeOf(pal.colours[(i * 3) % pal.colours.length]);
      lab.dye(0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7, 0.06 + rnd() * 0.07, a, 1.4);
    }
    lab.flush(); await lab.step(40);
  };
  window.b64 = (px) => {
    const u = new Uint8Array(px.buffer ? px.buffer : px); let t = '';
    for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(t);
  };
  window.unb64 = (s) => { const t = atob(s); const u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };
  window.diff = (a, b, win) => {
    let big = 0, sum = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (win && !win[i / 4]) continue;
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (d >= 8) big++;
      sum += d; n++;
    }
    return { share: big / Math.max(1, n), mean: sum / Math.max(1, n) };
  };
  // The same over the pixels lit (a channel above 8) in either picture, and
  // the lit share of the frame: a saved look's frame is half black around the
  // pours, and a mean over all of it would halve every difference.
  window.litDiff = (a, b) => {
    let big = 0, sum = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.max(a[i], a[i + 1], a[i + 2], b[i], b[i + 1], b[i + 2]) <= 8) continue;
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (d >= 8) big++;
      sum += d; n++;
    }
    return { share: big / Math.max(1, n), mean: sum / Math.max(1, n), lit: n / (a.length / 4) };
  };
};
const { page, close } = await openLab({ plugins: BEFORE ? oldShader : [], tag: BEFORE ? 'lensbefore' : '' });
await page.evaluate(helpers);
const S = 384;
const r = await page.evaluate(async ({ S }) => {
  await nine();
  const draw = (cam) => lab.render(S, { granulation: 0 }, { camera: cam, time: 3 });
  const o = {};
  const OFF = { amount: 0, focus: 0.5 };
  const off = await draw(OFF);
  o.off2 = diff(off, await draw(OFF));
  o.dial = {};
  for (const key of ['refraction', 'chromatic', 'aperture', 'bloom']) {
    const full = await draw({ ...OFF, [key]: 1 });
    const half = await draw({ ...OFF, [key]: 0.5 });
    // Nearly 0, not 0: a dial at exactly 0 is the off picture by
    // construction, so it would ask nothing. Measured 0.05, 0.03, 0.14 and
    // 0.01 levels (refraction, chromatic, aperture, bloom).
    const near = await draw({ ...OFF, [key]: 0.002 });
    o.dial[key] = { full: diff(off, full), half: diff(off, half), zero: diff(off, near), atLens1: diff(await draw({ amount: 1, focus: 0.5 }), await draw({ amount: 1, focus: 0.5, [key]: 1 })) };
  }
  // Focus with the aperture open and shut.
  const open0 = await draw({ ...OFF, aperture: 1, focus: 0 });
  const open1 = await draw({ ...OFF, aperture: 1, focus: 1 });
  o.focusOpen = diff(open0, open1);
  o.focusShut = diff(await draw({ ...OFF, focus: 0 }), await draw({ ...OFF, focus: 1 }));
  // Lens is the sensor look: on its own it moves the frame; over the optics it
  // keeps them. What the optics do is measured twice, from the plain picture
  // without Lens and from Lens's picture with it, so Lens's own change to the
  // frame is not counted as the optics surviving it.
  const optics = { refraction: 1, bloom: 1, aperture: 1, chromatic: 1, focus: 0.3 };
  const lensOnly = await draw({ amount: 1, focus: 0.5 });
  o.lensOnly = diff(off, lensOnly);
  const opticsOff = await draw({ ...OFF, ...optics });
  const opticsLens = await draw({ ...OFF, ...optics, amount: 1 });
  o.optics = diff(off, opticsOff);
  o.opticsUnderLens = diff(lensOnly, opticsLens);
  o.lensOverOptics = diff(opticsOff, opticsLens);
  // The pass with every dial at 0 is the plate as it was without a pass:
  // nothing jumps when a dial leaves 0.
  o.nopass = diff(off, await lab.render(S, { granulation: 0 }, { time: 3 }));
  // What the lens has to work on, and where it works.
  const slopeOf = (aux) => {
    const sl = new Float32Array(aux.length / 4);
    for (let i = 0; i < sl.length; i++) sl[i] = Math.hypot(aux[i * 4] / 255 * 2 - 1, aux[i * 4 + 1] / 255 * 2 - 1);
    return sl;
  };
  const aux = await lab.render(S, { granulation: 0 }, { camera: { amount: 0 }, aux: true, time: 3 });
  const m = aux.length / 4;
  const slope = slopeOf(aux);
  let hs = 0, steep = 0, flat = 0, dyed = 0;
  for (let i = 0; i < m; i++) {
    hs += aux[i * 4 + 2];
    if (slope[i] > 0.2) steep++;
    if (slope[i] < 0.02) flat++;
    if (aux[i * 4 + 2] > 8) dyed++;
  }
  o.aux = { height: hs / m / 255, steep: steep / m, flat: flat / m, dyed: dyed / m };
  // The same slope turned top to bottom: the control for the refraction's
  // bars, which must fail them, or they hold for any reading of the slope.
  // Before the lab read the aux upright under the camera this was the reading,
  // and it gave 54.6% of steep pixels and 12.0% of flat.
  const mirror = new Float32Array(m);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) mirror[y * S + x] = slope[(S - 1 - y) * S + x];
  // Where each dial changed a pixel, by the slope under it.
  const moved = (a, b, sl = slope) => {
    let st = 0, st8 = 0, fl = 0, fl8 = 0, dark = 0, green = 0;
    for (let i = 0; i < m; i++) {
      const d = Math.max(Math.abs(a[i * 4] - b[i * 4]), Math.abs(a[i * 4 + 1] - b[i * 4 + 1]), Math.abs(a[i * 4 + 2] - b[i * 4 + 2]));
      if (sl[i] > 0.2) { st++; if (d >= 8) st8++; }
      else if (sl[i] < 0.02) { fl++; if (d >= 8) fl8++; }
      if (b[i * 4] + b[i * 4 + 1] + b[i * 4 + 2] <= a[i * 4] + a[i * 4 + 1] + a[i * 4 + 2] - 9) dark++;
      // Not on black: the dither is added only to a pixel that has some light, so a fringe
      // reaching one off the black edge brings its dither, in green too.
      if (Math.min(Math.max(a[i * 4], a[i * 4 + 1], a[i * 4 + 2]), Math.max(b[i * 4], b[i * 4 + 1], b[i * 4 + 2])) > 8 && a[i * 4 + 1] !== b[i * 4 + 1]) green++;
    }
    return { steep: st8 / Math.max(1, st), flat: fl8 / Math.max(1, fl), dark: dark / m, green: green / m };
  };
  const refracted = await draw({ ...OFF, refraction: 1 });
  o.whereRefraction = moved(off, refracted);
  o.whereRefractionMirrored = moved(off, refracted, mirror);
  // Which way, and how far. The pass samples the plate at uv + n·(0.4·0.25)
  // times the dial (camera.ts), so at the full dial a steep pixel takes the
  // colour the off picture has a tenth of the frame along its slope, the
  // slope's y running against the frame's rows. Each steep pixel where that
  // colour and a wrong one differ by 16 levels or more (so the pair can be
  // told apart) is asked which it took; the wrong ones are the colour as far
  // against the slope, and the colour at half and at one and a half times the
  // throw. Measured 100.0% for all three. A shift that ignored the slope
  // scored 68.1% on the way, the slope read backwards 0.0%, its axes swapped
  // 64.8%, and half the throw 0.0% against the half (each a patched copy of
  // the shader, by hand). The way alone is not enough: a picture that did not
  // move at all (the old pass at Lens 0) scores 88.8% on it, a steep pixel's
  // own colour being nearer the colour along its slope than against it on
  // this plate, and is caught by the throw (7.6% against the half), so all
  // three are asked.
  const at = (px, x, y) => {
    x = Math.min(S - 1, Math.max(0, x)); y = Math.min(S - 1, Math.max(0, y));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(S - 1, x0 + 1), y1 = Math.min(S - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const c = [0, 0, 0];
    for (let k = 0; k < 3; k++) c[k] = (px[(y0 * S + x0) * 4 + k] * (1 - fx) + px[(y0 * S + x1) * 4 + k] * fx) * (1 - fy) + (px[(y1 * S + x0) * 4 + k] * (1 - fx) + px[(y1 * S + x1) * 4 + k] * fx) * fy;
    return c;
  };
  const far = (p, q) => Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2]));
  const way = (k) => {
    let n = 0, near = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (slope[i] <= 0.2) continue;
      const dx = (aux[i * 4] / 255 * 2 - 1) * 0.1 * S, dy = -(aux[i * 4 + 1] / 255 * 2 - 1) * 0.1 * S;
      const p = at(off, x + dx, y + dy), q = at(off, x + k * dx, y + k * dy);
      if (far(p, q) < 16) continue;
      n++;
      const c = [refracted[i * 4], refracted[i * 4 + 1], refracted[i * 4 + 2]];
      if (far(c, p) < far(c, q)) near++;
    }
    return { n, share: near / Math.max(1, n) };
  };
  o.refractionWay = { against: way(-1), half: way(0.5), more: way(1.5) };
  o.whereBloom = moved(off, await draw({ ...OFF, bloom: 1 }));
  o.whereChromatic = moved(off, await draw({ ...OFF, chromatic: 1 }));
  // A plate with nothing on it is black; no optic, alone or all four at once,
  // may light a pixel of it. The brightest channel anywhere in the frame.
  const peak = (px) => { let p = 0; for (let i = 0; i < px.length; i += 4) p = Math.max(p, px[i], px[i + 1], px[i + 2]); return p; };
  await lab.create(256);
  lab.flush(); await lab.step(4);
  o.dark = { 'no optic': peak(await draw(OFF)) };
  for (const key of ['refraction', 'aperture', 'bloom', 'chromatic']) o.dark[key] = peak(await draw({ ...OFF, [key]: 1 }));
  o.dark['all four'] = peak(await draw({ ...OFF, refraction: 1, aperture: 1, bloom: 1, chromatic: 1 }));
  // A flat wash: one pour wide enough to leave a lit middle with no slope in
  // it. Refraction bends light by the slope and the aperture blurs by the
  // height, so over a part of the wash at least 12 px from any slope (0.02 or
  // more) or any undyed pixel, they must move nothing; a uniform wash cannot
  // show a shift or a blur, which is the point: they act on the relief, and a
  // dial that lit or darkened the dye itself would show here. Bloom acts on
  // light and must move most of it, or the window is not lit enough to ask.
  await lab.create(256);
  lab.dye(0.5, 0.5, 0.8, lab.dyeOf(lab.palette().colours[0]), 1.4);
  lab.flush(); await lab.step(40);
  const washAux = await lab.render(S, { granulation: 0 }, { camera: { amount: 0 }, aux: true, time: 3 });
  const washSlope = slopeOf(washAux);
  const bad = new Uint8Array(m);
  for (let i = 0; i < m; i++) bad[i] = washSlope[i] >= 0.02 || washAux[i * 4 + 2] <= 8 ? 1 : 0;
  const win = new Uint8Array(m);
  const R = 12;
  for (let y = R; y < S - R; y++) for (let x = R; x < S - R; x++) {
    let ok = 1;
    for (let dy = -R; dy <= R && ok; dy += 2) for (let dx = -R; dx <= R; dx += 2) if (bad[(y + dy) * S + x + dx]) { ok = 0; break; }
    win[y * S + x] = ok;
  }
  const wash = await draw(OFF);
  let n = 0, lit = 0;
  for (let i = 0; i < m; i++) if (win[i]) { n++; lit += Math.max(wash[i * 4], wash[i * 4 + 1], wash[i * 4 + 2]); }
  o.wash = { share: n / m, lit: lit / Math.max(1, n) };
  for (const key of ['refraction', 'aperture', 'bloom']) o.wash[key] = diff(wash, await draw({ ...OFF, [key]: 1 }), win);
  return o;
}, { S });

const OLD_NOTE = BEFORE ? ' (the camera pass as it was before 33i)' : '';
// Mean change in 0..255 levels over the whole frame, full dial. Measured on
// this build (384 px, nine pours): refraction 11.0, aperture 8.1, bloom 21.6,
// chromatic 4.6 on Metal; 11.7, 8.1, 21.9, 4.8 on SwiftShader. The pass as it
// was before 33i, at Lens 1 (the only
// way those dials worked there): 3.6, 4.4, 8.8, 0.5. A bar between the two fails
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
  // Above the bar, and at least three quarters of what the dial does with Lens
  // at 0: a Lens that halved an optic (a patched copy of the shader that
  // scaled refraction by 1 - 0.45·Lens and chromatic by 1 - 0.5·Lens) kept
  // both over the bar alone. Measured 85% (chromatic) to 96% (bloom).
  check(`${name} turned up with Lens at 1 is as strong, not weaker for the Lens${OLD_NOTE}`,
    d.atLens1.mean >= bar && d.atLens1.mean >= 0.75 * d.full.mean,
    `mean ${d.atLens1.mean.toFixed(1)} levels, ${d.full.mean >= 0.05 ? `${pct(d.atLens1.mean / d.full.mean)} of its ${d.full.mean.toFixed(1)}` : `against ${d.full.mean.toFixed(1)}`} with Lens at 0`);
}
for (const name of Object.keys(need)) {
  const d = r.dial[name];
  check(`${name}: a half-turn moves the frame less than a full turn, and a turn to nearly 0 (0.002) next to nothing`,
    d.half.mean < d.full.mean && d.half.mean > 0 && d.zero.share === 0 && d.zero.mean < 0.3,
    `half ${d.half.mean.toFixed(1)}, full ${d.full.mean.toFixed(1)}, at 0.002 ${d.zero.mean.toFixed(2)} levels (${pct(d.zero.share)} by 8 or more)`);
}
// Where each dial works is its physics. Refraction turns light where the
// surface is tilted, so it must change most of the steep parts of the plate
// and leave the flat (slope under 0.02) all but alone; read against the slope
// turned top to bottom it must not, or the bars hold for any slope at all.
// Dispersion is a shift of red against blue about the green, so green stays;
// a glow adds light and never takes it away.
const refrOk = (w) => w.steep >= 0.6 && w.flat <= 0.05;
check('refraction changes the steep parts of the plate and spares the flat',
  refrOk(r.whereRefraction),
  `${pct(r.whereRefraction.steep)} of steep pixels moved by 8 or more, ${pct(r.whereRefraction.flat)} of flat`);
check('... and read against the slope turned top to bottom it does not (the control)',
  !refrOk(r.whereRefractionMirrored),
  `${pct(r.whereRefractionMirrored.steep)} of steep, ${pct(r.whereRefractionMirrored.flat)} of flat`);
const ways = Object.entries(r.refractionWay);
check('refraction moves the picture the way the slope says and as far: a steep pixel takes the colour a tenth of the frame along it',
  ways.every(([, w]) => w.n >= 1000 && w.share >= 0.9),
  ways.map(([k, w]) => `${pct(w.share)} of ${w.n} nearer it than ${{ against: 'the colour as far against it', half: 'half as far', more: 'half as far again' }[k]}`).join(', '));
check('chromatic aberration leaves the green channel alone',
  r.whereChromatic.green === 0, `${pct(r.whereChromatic.green)} of pixels changed in green`);
check('bloom only adds light',
  r.whereBloom.dark < 0.005, `${pct(r.whereBloom.dark)} of pixels darkened by 3 or more levels`);
check('a dark plate stays dark: no dial adds light of its own',
  Object.values(r.dark).every((p) => p === 0),
  `brightest channel ${Object.entries(r.dark).map(([k, p]) => `${k} ${p}`).join(', ')}`);
check('a flat wash leaves a lit window with no slope in it',
  r.wash.share > 0.2 && r.wash.lit > 64, `${pct(r.wash.share)} of the frame, lit ${r.wash.lit.toFixed(1)}`);
check('refraction and aperture act on the relief: over the flat wash they move nothing',
  r.wash.refraction.share === 0 && r.wash.aperture.share === 0,
  `refraction ${pct(r.wash.refraction.share)} (mean ${r.wash.refraction.mean.toFixed(2)}), aperture ${pct(r.wash.aperture.share)} (mean ${r.wash.aperture.mean.toFixed(2)})`);
check('... while bloom, which acts on light, moves most of it (the control)',
  r.wash.bloom.share >= 0.5, `${pct(r.wash.bloom.share)} of the window`);
check('Focus moves the frame with the aperture open, and not with it shut',
  r.focusOpen.share >= 0.02 && r.focusShut.share === 0,
  `open ${pct(r.focusOpen.share)}, shut ${pct(r.focusShut.share)}`);
check('Lens alone is the sensor\'s look and moves the frame by itself',
  r.lensOnly.share >= 0.1, `${pct(r.lensOnly.share)} (mean ${r.lensOnly.mean.toFixed(1)} levels)`);
// Lens is a sensor look laid over the optics. The optics must still do at
// least half of what they do without it, measured from Lens's own picture (a
// measure from the plain picture is met by Lens alone, 40.7%), and Lens must
// still be at least half of what it is on a plate with the optics at 0.
check('Lens over the optics keeps what the optics did and still adds its own look',
  r.opticsUnderLens.share >= 0.5 * r.optics.share && r.lensOverOptics.share >= 0.5 * r.lensOnly.share,
  `the optics ${pct(r.opticsUnderLens.share)} under Lens against ${pct(r.optics.share)} without; Lens's own part ${pct(r.lensOverOptics.share)} against ${pct(r.lensOnly.share)} alone`);

// ── 6. Saved looks ────────────────────────────────────────────────────
// The old pass in a second lab beside this one, on the same nine pours: one
// frame at a time is drawn there and compared here, so no more than one
// 1024 px frame crosses at once.
if (!BEFORE) {
  const old = await openLab({ plugins: oldShader, tag: 'lensold' });
  try {
    await old.page.evaluate(helpers);
    for (const p of [page, old.page]) await p.evaluate(() => nine());
    const render = (p, cam) => p.evaluate(async ({ S, cam }) => b64(await lab.render(S, { granulation: 0 }, cam ? { camera: cam, time: 3 } : { time: 3 })), { S: SAVED_S, cam });
    const against = (was, cams) => page.evaluate(async ({ S, was, cams }) => {
      const o = unb64(was);
      const res = [];
      for (const c of cams) res.push(litDiff(o, await lab.render(S, { granulation: 0 }, c ? { camera: c, time: 3 } : { time: 3 })));
      return res;
    }, { S: SAVED_S, was, cams });
    // The two labs hold one plate: with no camera pass at all they draw it to
    // the level, so what differs below is the two passes.
    const [same] = await against(await render(old.page, null), [null]);
    check(`the old pass's lab and this one hold the same plate (${SAVED_S} px, no pass)`,
      same.share === 0 && same.mean === 0, `${same.mean.toFixed(3)} levels`);
    // The bars per set, on the lit pixels: the old pass drew its blur and glow
    // with different shapes (twelve taps and eight directions against
    // sixty-four and sixty), so the match is not exact, and the stronger the
    // dials the more the shapes show. Named in docs/plan/33-bubbles-closeup.md
    // 33i-7. Each is the worst look of its set on this plate, with about a
    // third again for the plate's own spread between machines. The first
    // reading ("keeps its optics") gave 8.1 and 10.5 levels over the whole
    // frame for the old defaults at Lens 1 and .6.
    const bar = BAR;
    let lens1 = 0, missed384 = 0;
    const lit = [], nearer = NEAR.map(() => 0);
    for (const [i, c] of SAVED.entries()) {
      const [mig, raw, fit, ...near] = await against(await render(old.page, rawCams[i]), [migratedCams[i], rawCams[i], fit384Cams[i], ...nearCams[i]]);
      const b = bar[c.name];
      lit.push(mig.lit);
      if (c.lens === 1) { lens1++; if (fit.mean >= b.mean || fit.share >= b.share) missed384++; }
      near.forEach((d, k) => { if (d.mean > mig.mean) nearer[k]++; });
      check(`a look saved with ${c.name}, Lens ${c.lens} and Focus ${c.focus} opens within ${b.mean} levels of how the old pass drew it, and moves under ${pct(b.share)} of its lit pixels by 8`,
        mig.mean < b.mean && mig.share < b.share && raw.mean > 1.5 * mig.mean,
        `migrated ${mig.mean.toFixed(2)} levels, ${pct(mig.share)} (aperture ${migratedCams[i].aperture}, bloom ${migratedCams[i].bloom}, refraction ${migratedCams[i].refraction}); read as written ${raw.mean.toFixed(2)}; the 384 px fit ${fit.mean.toFixed(2)}; near misses ${near.map((d) => d.mean.toFixed(2)).join('/')}`);
    }
    check(`the saved looks' frames are part lit and part black, so the lit pixels are a measure of their own`,
      Math.min(...lit) >= 0.3 && Math.max(...lit) <= 0.7, `${pct(Math.min(...lit))} to ${pct(Math.max(...lit))} of the frame lit`);
    check(`the aperture's 384 px fit misses the bar at ${SAVED_S} px on a third of the looks at Lens 1 (the control: the bars tell a fit from a near one)`,
      lens1 > 0 && missed384 >= lens1 / 3, `${missed384} of ${lens1}`);
    // The fit is a fit, not a guess the bars cannot see: each near miss sits
    // further from the old picture than the migration on most looks. The
    // weakest looks (Lens .3, where the migrated dials are a few hundredths)
    // are where a near miss can tie.
    check('the fitted bloom and refraction are nearer the old picture than half or one and a half times them, on most looks',
      nearer.every((n) => n > SAVED.length / 2),
      NEAR.map(([key, k], j) => `${key} ×${k} further on ${nearer[j]} of ${SAVED.length}`).join(', '));
  } finally {
    await old.close();
  }
}
await close();

// ── 5. No sound in the pass ───────────────────────────────────────────
// Every name in the code (the WGSL in its strings too), cut at underscores
// and at each capital, so beatPhase, u_kick and bassLevel are heard and a
// word that only holds a sound word inside it ("uniforms", "rms") is not.
// The plate's own uniforms read the beat, which is the control: the same
// reading must hear it there.
const SOUND = /^(audio|bass|beat|kick|snare|energy|treble|loud|onset|band|spectrum|rms|sound|music|pitch|brightness|analy[sz])/;
const heard = (f) => {
  const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const words = (code.match(/[A-Za-z_$][\w$]*/g) ?? []).flatMap((id) => id.split(/_|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/));
  return [...new Set(words.map((w) => w.toLowerCase()).filter((w) => SOUND.test(w)))];
};
const control = heard('src/gpu/plateUniforms.ts');
check('the reading hears sound where there is some: the plate\'s uniforms', control.length > 0, control.join(', '));
for (const f of ['src/gpu/wgsl/camera.ts', 'src/gpu/wgsl/cameraFields.ts', 'src/gpu/camera.ts', 'src/gpu/cameraWanted.ts']) {
  const words = heard(f);
  check(`${f}, the camera pass's own code, reads no sound`, words.length === 0, words.join(', '));
}

// What fills the pass's uniforms: the call in the visualizer, read as written.
// Each dial is its own setting with a number for when it is unset, the clock is
// the view's and the dither the chain's; anything else (a level, a band, a
// beat added to a dial) fails. The control is the same call with the bass
// added to the bloom, which must fail, or the reading accepts anything.
const uniformsOf = (src) => {
  const m = src.match(/fillCameraUniforms\(cam\.pack, \{([^{}]*)\}, canvas\.width/);
  if (!m) return null;
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return Object.fromEntries(body.split(',').map((t) => t.trim()).filter(Boolean)
    .map((t) => [t.slice(0, t.indexOf(':')).trim(), t.slice(t.indexOf(':') + 1).trim()]));
};
const UNIFORMS = { amount: 'camera', refraction: 'refraction', chromatic: 'chromaticAberration', focus: 'focus', aperture: 'aperture', bloom: 'bloom' };
const fromSettings = (u) => !!u && Object.keys(u).length === Object.keys(UNIFORMS).length + 2
  && u.time === 'view.time' && u.dither === 'post ? 0 : 1'
  && Object.entries(UNIFORMS).every(([k, key]) => new RegExp(`^view\\.settings\\.${key} \\?\\? \\d+(\\.\\d+)?$`).test(u[k] ?? ''));
const VIS = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
const BASS = 'bloom: view.settings.bloom ?? 0,';
const bassed = VIS.replace(BASS, 'bloom: (view.settings.bloom ?? 0) + bassLevel * 0.2,');
check('the app fills the pass\'s uniforms from the settings and the clock alone',
  fromSettings(uniformsOf(VIS)) && bassed !== VIS && !fromSettings(uniformsOf(bassed)),
  `${Object.keys(uniformsOf(VIS) ?? {}).join(', ')}; with the bass added to the bloom ${fromSettings(uniformsOf(bassed)) ? 'still read as the settings' : 'refused'}${driftable.length ? `; Evolve may wander ${driftable.join(', ')}` : ''}`);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
