#!/usr/bin/env node
/**
 * The band moves the liquid, not the frame (Frame Sway, lib/plateRock.ts).
 *
 *   npm run framesway        (node only; the app's own frame is held to the same in `npm run render-app` on the Mac)
 *
 * What was reported (the owner, 2026-10-11, the evening #347 went live): "I'm
 * getting nauseous watching the visuals. It moves around the x/y axis with
 * sounds ... like the whole plate moves around under the camera. Make the
 * liquids and their interactions the main focus, not the overall movement of
 * the plates or cameras."
 *
 * What moved: Plate Rock's cover glass (#347) slid on its film with every
 * kick and dragged the film, the whole picture, at half its slide; the lamp
 * followed the plate's rock; a kaleidoscope turned and breathed on the beat.
 * Each is the frame moving, not the liquid. This drives the frame loop's own
 * functions (lib/plateRock.ts: the hand's spring, the sway, the cover glass
 * in its bowl, the lamp's share of the rock, the Frame Sway dial) through a
 * song's kicks, 120 bpm for twenty seconds at 60 frames a second, and reads
 * how far the whole picture is moved each frame, in hundredths of the
 * plate's width:
 *
 *   1. At every shipped look's own settings and every stage of the built-in
 *      shows (each laid on its look, then on the defaults, as the app lays
 *      them), Frame Sway is 0 and nothing moves the frame: the cover never
 *      slides, the lamp never follows the rock, the beat turns nothing.
 *      And nothing but a hand turns it on: no look routes sound or a scene to
 *      it, no sound or scene patch can, Evolve never drifts it, Lucky never rolls it.
 *      Except the few looks named in FRAME_MOVING_LOOKS (lib/plateRock.ts;
 *      the owner, the next morning: "it's ok if the whole plate moves ...
 *      with a small subset of presets. I just don't want this kind of look to
 *      be a default across all presets"). Only those may set Frame Sway or
 *      patch the sound onto a dial that moves the whole frame (FRAME_MOTION);
 *      the list holds a handful at most, names only shipped looks that use
 *      it, and each one does move the frame on the song.
 *   2. And it is the dial doing that, not a song that never kicked: the same
 *      look with Frame Sway at full slides the picture as #347 did (the
 *      default look at least 0.05% of the plate a frame at its peak), half
 *      way slides it less than full and more than none, and the plate's own
 *      tilt, which moves only the colour heavier than the rest (the liquid's
 *      motion, PLAN 27a), still swings with the kicks at Frame Sway 0.
 *   3. The frame loop calls these functions and not a copy of them: its
 *      source hands the cover `coverRoom(…frameSway)`, the lamp `lampRock`,
 *      and the plate shader `beatSway`, which scales both beat pulses.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const out = 'node_modules/.cache/framesway-lib.mjs';
await build({
  stdin: {
    contents: [
      "export * from './src/lib/plateRock.ts';",
      "export { DISH_METRES } from './src/lib/turntable.ts';",
      "export { DEFAULT_SETTINGS } from './src/types.ts';",
      "export { PRESETS } from './src/presets.ts';",
      "export { builtInSequences } from './src/lib/sequencer.ts';",
      "export { DRIFTABLE, THEMES, moveTargets } from './src/lib/drift.ts';",
      "export { luckyLook } from './src/lib/lucky.ts';",
      "export { soundMappable } from './src/lib/midi.ts';",
      "export { PATCH_TARGETS } from './src/lib/sceneMap.ts';",
      "export { FRAME_MOTION } from './src/lib/drift.ts';",
    ].join('\n'),
    resolveDir: '.', loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
  // The presets and the sequencer reach for the browser only when called on to save.
  define: { 'import.meta.env.DEV': 'false' },
});
const L = await import(`../${out}`);
const { createNoise2D } = await import('simplex-noise');

const FPS = 60, SECONDS = 20, BPM = 120;
const THIN = 0.45; // fluid.ts THIN_GAP_THICKNESS, the frame loop's fallback for the look's Thickness

/*
  One song through the frame loop's rock, as LiquidVisualizer steps it: a
  kick on every beat (its bass read off a fixed table between 0.55 and 0.95,
  as a band's kicks vary), the spring kicked at Plate Rock above 0, stepped,
  swung with the sway, the plate tipped by it (plateSin), and the cover
  stepped in the room Frame Sway gives it. Per frame: how far the picture is
  dragged (half the glass's slide on a thin gap, in plate widths), how far
  the lamp's share of the rock moved, and the tilt the solver is handed.
*/
function song(S) {
  let seed = 11;
  const noise = createNoise2D(() => ((seed = (seed * 16807) % 2147483647) / 2147483647));
  const rock = { x: 0, y: 0, vx: 0, vy: 0, phase: 0 };
  const cover = { x: 0, y: 0, vx: 0, vy: 0 };
  const R = Math.max(0, Math.min(1, S.plateRock ?? 0));
  const drag = L.coverDrag(S.gapThickness ?? THIN);
  const dt = 1 / FPS, every = Math.round(FPS * 60 / BPM);
  const slide = [], lamp = [], tilt = [];
  let lastLamp = [0, 0];
  for (let f = 0; f < FPS * SECONDS; f++) {
    const t = f * dt;
    if (R > 0 && f % every === 0) L.kickRock(rock, 0.55 + 0.4 * ((f / every * 0.618) % 1), 1);
    L.stepRock(rock, dt);
    const [sx, sy] = L.rockSwing(rock, R, ...L.swayAt(noise, t));
    const tx = sx * L.HOLD_TILT, ty = sy * L.HOLD_TILT;
    L.stepCover(cover, L.plateSin(tx, sx), L.plateSin(ty, sy), drag, dt, L.coverRoom(S.frameSway));
    slide.push(0.5 * Math.hypot(cover.vx, cover.vy) * dt / L.DISH_METRES);
    const lr = L.lampRock(rock, S.plateRock, S.frameSway);
    lamp.push(Math.hypot(lr[0] - lastLamp[0], lr[1] - lastLamp[1]));
    lastLamp = lr;
    tilt.push(Math.hypot(L.plateSin(tx, sx), L.plateSin(ty, sy)));
  }
  const max = (a) => Math.max(0, ...a), mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  return { slidePeak: max(slide), slideMean: mean(slide), lampPeak: max(lamp), tiltPeak: max(tilt), beat: L.frameSway(S.frameSway) };
}
const pc = (x) => `${(100 * x).toFixed(3)}%`;

// ── 1. Every look and every show stage, as shipped ────────────────────
const looks = L.PRESETS.map((p) => ({ id: p.id, preset: p, name: p.name ?? p.id, S: { ...L.DEFAULT_SETTINGS, ...p.settings } }));
looks.unshift({ id: null, name: 'the defaults', S: { ...L.DEFAULT_SETTINGS } });
for (const seq of L.builtInSequences()) {
  for (const st of seq.stages ?? []) {
    const look = L.PRESETS.find((p) => p.id === st.presetId);
    looks.push({ id: st.presetId ?? null, name: `${seq.name}: ${st.name}`, S: { ...L.DEFAULT_SETTINGS, ...(look?.settings ?? {}), ...(st.settings ?? {}) } });
  }
}
const named = (l) => l.id !== null && L.FRAME_MOVING_LOOKS.has(l.id);
const moved = [], namedMoved = [], namedSlid = new Set();
let worstBefore = { slidePeak: 0 }, rocked = 0, held = 0;
for (const l of looks) {
  const { name, S } = l;
  const now = song(S), was = song({ ...S, frameSway: 1 });
  const moves = now.slidePeak > 0 || now.lampPeak > 0 || now.beat > 0;
  if (named(l)) {
    if (moves) namedMoved.push(`${name} (slide ${pc(now.slidePeak)} peak, lamp ${pc(now.lampPeak)}, beat ${now.beat})`);
    // The look itself, not a show stage that plays it, and the picture slid, not merely a dial set.
    if (L.PRESETS.some((p) => p === l.preset) && now.slidePeak >= 0.0005) namedSlid.add(l.id);
    continue;
  }
  held++;
  if (moves) moved.push(`${name} (slide ${pc(now.slidePeak)}, lamp ${pc(now.lampPeak)}, beat ${now.beat})`);
  if (was.slidePeak > worstBefore.slidePeak) worstBefore = { ...was, name };
  if ((S.plateRock ?? 0) > 0) rocked++;
}
console.log(`   ${looks.length} looks and show stages, ${held} not on the named list, ${rocked} of those with Plate Rock up; as #347 shipped (Frame Sway at full, what every look had), the worst slid the picture ${pc(worstBefore.slidePeak)} of the plate in a frame (${worstBefore.name})`);
check('every shipped look and show stage not named to move the frame holds it still: no cover slide, no lamp on the rock, no beat turn, on any frame of the song',
  moved.length === 0 && held > 20, moved.length ? moved.slice(0, 4).join('; ') : `${held} of ${held} still`);

/*
  The named looks. Asked of the list itself, so it cannot grow into the
  default (a handful at most), cannot name a look that is not shipped (a
  typo would be a look that silently lost its opt-in), and cannot name one
  that does not use it (a stale name is room for the next one nobody chose).
  And asked of every look on the shelf, so the opt-in is the only way in:
  a look outside the list that sets Frame Sway, or patches the sound (any
  of its three sources) onto a dial that moves the whole frame, fails here.
  Oil Wheel did, until 28f: its band's mid was patched onto the dish's
  motor. A scene patch (the room camera) is a different matter, read by the
  room's own checks, and is not counted.
*/
const SOUND = new Set(['sound', 'bands', 'hits']);
const frameRoutes = (S) => [
  ...(S.sceneMappings ?? []).filter((m) => m && SOUND.has(m.source ?? 'room') && L.FRAME_MOTION.has(m.setting)).map((m) => `${m.source}:${m.feature} on ${m.setting}`),
  ...(S.audioMappings?.rotation && S.audioMappings.rotation !== 'none' ? [`audioMappings.rotation:${S.audioMappings.rotation}`] : []),
];
const outside = [];
for (const l of looks) {
  if (named(l)) continue;
  const routes = frameRoutes(l.S);
  if ((l.S.frameSway ?? 0) > 0) routes.push(`Frame Sway ${l.S.frameSway}`);
  if (routes.length) outside.push(`${l.name}: ${routes.join(', ')}`);
}
const list = [...L.FRAME_MOVING_LOOKS];
const unknown = list.filter((id) => !L.PRESETS.some((p) => p.id === id));
const unused = list.filter((id) => {
  const p = L.PRESETS.find((x) => x.id === id);
  return p && !((p.settings.frameSway ?? 0) > 0 || frameRoutes(p.settings).length > 0);
});
console.log(`   named to move the frame: ${list.join(', ') || 'none'}; on the song: ${namedMoved.join('; ') || 'none moved'}`);
check(`only the named looks move the frame with the music, and they are a handful (at most ${L.FRAME_MOVING_MOST}) of shipped looks that use it`,
  outside.length === 0 && list.length <= L.FRAME_MOVING_MOST && unknown.length === 0 && unused.length === 0,
  `${outside.length ? `outside the list: ${outside.join('; ')}` : 'nothing outside the list'}; ${list.length} named${unknown.length ? `, not shipped: ${unknown.join(', ')}` : ''}${unused.length ? `, not using it: ${unused.join(', ')}` : ''}`);
check('and each look on the list, as shipped, does slide the picture on the song (0.05% of the plate a frame or more at its peak), so the opt-in is a real one',
  list.every((id) => namedSlid.has(id)), `${namedSlid.size} of ${list.length} slid: ${namedMoved.join('; ') || 'none moved'}`);

/*
  And nothing but a hand turns it on (the owner, 2026-10-11: "It's fine if
  this is a setting, but this should never be the default experience"): no
  look routes a sound or a scene to it, Evolve never drifts it (a hundred
  of Evolve's moves from the default look, every theme in turn, half of them
  livelier and half calmer, leave it at 0), and Lucky never rolls it (a
  hundred rolls from the defaults). The moves must change something, or a
  planner that moved nothing would pass this for free.
*/
const routed = L.PRESETS.filter((p) => [...(p.settings.sceneMappings ?? []), ...(p.settings.soundMappings ?? [])].some((m) => m?.setting === 'frameSway')).map((p) => p.id);
let drifted = { ...L.DEFAULT_SETTINGS }, driftOn = 0, driftMoved = 0;
for (let i = 0; i < 100; i++) {
  const to = L.moveTargets(L.THEMES[i % L.THEMES.length], drifted, L.DEFAULT_SETTINGS, i % 2 ? 1 : -1, 1);
  driftMoved += Object.keys(to).length;
  drifted = { ...drifted, ...to };
  if ((drifted.frameSway ?? 0) !== 0) driftOn++;
}
let luckyOn = 0;
for (let i = 0; i < 100; i++) { let r = i + 1; const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647); if ((L.luckyLook({ ...L.DEFAULT_SETTINGS }, ['#ff0000'], rand).frameSway ?? 0) !== 0) luckyOn++; }
const patchable = L.soundMappable('frameSway') || L.PATCH_TARGETS.some((t) => t.key === 'frameSway');
check('and only a hand turns it on: no look routes sound or a scene to it, no patch can, Evolve never drifts it, Lucky never rolls it',
  routed.length === 0 && !patchable && L.soundMappable('plateRock') && !L.DRIFTABLE.includes('frameSway') && driftOn === 0 && driftMoved > 0 && luckyOn === 0,
  `routed by ${routed.length ? routed.join(', ') : 'no look'}; a patch target ${patchable} (Plate Rock ${L.soundMappable('plateRock')}); driftable ${L.DRIFTABLE.includes('frameSway')}; on after ${driftOn} of 100 moves (${driftMoved} dials moved), ${luckyOn} of 100 rolls`);

// ── 2. The dial, and the liquid's own rock ─────────────────────────────
const base = { ...L.DEFAULT_SETTINGS };
const off = song(base), full = song({ ...base, frameSway: 1 }), half = song({ ...base, frameSway: 0.5 });
console.log(`   the defaults (Plate Rock ${base.plateRock}) through the song, per frame: the picture's slide peak ${pc(full.slidePeak)} and mean ${pc(full.slideMean)} as #347 shipped, ${pc(off.slidePeak)} and ${pc(off.slideMean)} now; the lamp's jump on the rock ${pc(full.lampPeak)} then, ${pc(off.lampPeak)} now`);
check('and it is the dial: at full Frame Sway the same song slides the default look\'s picture as #347 did, 0.05% of the plate a frame or more at the peak',
  full.slidePeak >= 0.0005 && full.lampPeak > 0 && full.beat === 1, `${pc(full.slidePeak)} peak, lamp ${pc(full.lampPeak)}`);
/*
  The room only holds the glass where the glass slides as far as it. Since
  Plate Rock's hand leans half as steeply (27f-2, lib/plateRock.ts
  ROCK_LEAN), at the default rock the glass rests about 5 mm off the middle
  (R_c sinθ, 2.6 degrees) and swings to under 2 cm, inside half the room as
  well as all of it, so the default look slides the same at Frame Sway 0.5
  and 1 (0.343% either way): the dial has nothing to hold. It is read where
  the glass does reach the rim, the same song at full Plate Rock.
*/
const fullRock = song({ ...base, plateRock: 1, frameSway: 1 }), halfRock = song({ ...base, plateRock: 1, frameSway: 0.5 });
check('half way slides it less than full and more than none (at full Plate Rock, where the glass reaches the rim)',
  halfRock.slidePeak > 0 && halfRock.slidePeak < fullRock.slidePeak && half.beat === 0.5,
  `${pc(halfRock.slidePeak)} against ${pc(fullRock.slidePeak)}; at the default rock ${pc(half.slidePeak)} against ${pc(full.slidePeak)}`);
check('and the plate\'s own tilt still swings with the kicks at Frame Sway 0 (Plate Rock moves the heavier colour, the liquid\'s motion)',
  off.tiltPeak > 0.05 && Math.abs(off.tiltPeak - full.tiltPeak) < 1e-12, `sinθ up to ${off.tiltPeak.toFixed(3)}, the same as at full`);
check('a Frame Sway that is not a number is off', L.frameSway(NaN) === 0 && L.coverRoom(undefined) === 0 && L.frameSway(2) === 1 && L.frameSway(-1) === 0);

// ── 3. The frame loop uses these ────────────────────────────────────────
const lv = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
const plate = readFileSync('src/gpu/wgsl/plate.ts', 'utf8');
const pulses = plate.match(/let beatPulse = [^;]*;/g) ?? [];
check('the frame loop steps the cover in coverRoom(Frame Sway), moves the lamp by lampRock and hands the plate beatSway',
  /stepCover\([^;]*coverRoom\(currentSettings\.frameSway\)\)/s.test(lv) && /lampRock\(rock, currentSettings\.plateRock, currentSettings\.frameSway\)/.test(lv)
  && /beatSway: frameSway\(currentSettings\.frameSway\)/.test(lv));
check('and every beat pulse in the plate shader is scaled by beatSway', pulses.length >= 2 && pulses.every((p) => /U\.beatSway/.test(p)), `${pulses.length} pulses: ${pulses.join(' | ')}`);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
