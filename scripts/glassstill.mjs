#!/usr/bin/env node
/**
 * Is the top glass still unless a hand or a cord moves it, and is the dye's
 * grain off unless someone turns it up?
 *
 *   npm run glassstill       (node only: the real FluidSimulation on its CPU
 *                             grid, the real patch bay and LFOs, the shelf)
 *
 * PLAN 38u-8 and 38u-11. What was found (2026-11-13, the physics audit):
 * Glass Smear, the cover glass sliding over the liquid, defaulted to 0.3, and
 * nineteen of the looks on main slid it all the time with nobody's hand on
 * it (after 38w-1 rested Lava Pop and its moiré pair at 0); a real cover
 * glass is still until the performer pushes it.
 * Granulation, a speckle laid in the dye, sat at 0.5 on every look; a dye in
 * solution has no grain, so the speckle was invented noise on every plate.
 * The owner chose (2026-11-14) both dials at rest by default, Granulation's
 * dial kept for whoever wants grain, and the slide those nineteen looks
 * were built around kept as a cord anyone can see and pull: LFO 1 on Glass
 * Smear at the look's old dial over the dial's travel, so the top of each
 * wave is exactly the old constant speed (lib/glassSlide.ts).
 *
 * What this asserts:
 *
 *   1. Rest. Both defaults are 0, and every look on the shelf rests both
 *      dials at 0 once presets.ts has laid it out.
 *   2. The cords. Each look that slid on main (the table below, written out
 *      from main at 1d3a94d6 and not computed from the lib, so a change to
 *      the lib cannot move what it is measured against) carries exactly one
 *      slide cord at floor2(old / 3); no other look carries one; bass-drop,
 *      whose glass rides its own hats cords, keeps those and gains none.
 *      And the lib's travel (3) is the patch bay's travel for the dial, since
 *      a depth taken against the wrong travel would make the wave's top a
 *      different speed from the one the look was written at.
 *   3. The glass in motion. Each of those looks folded by the real patch bay
 *      with real LFOs, stepped through sixteen seconds of silence (LFO 1 is
 *      eight bars, and the beat clock falls back to a steady tempo with no
 *      music), and stepped by the real solver: the glass's speed it derives
 *      (`lastStep.smearX`, which `thinProject` turns into the Couette drag)
 *      peaks within rounding of the old constant speed and never above it,
 *      comes to rest (under a twentieth of it) at the wave's foot, and moves
 *      at all in silence. The noise the solver reads for the glass's
 *      direction is held constant here, so the speed it derives is the dial
 *      alone. That speed is linear in the dial, so the solver step adds a
 *      guard on the wiring rather than a second measurement: what this
 *      section holds is the fold. The drag the glass's speed makes in the
 *      liquid (passes.ts `glassX`) is the GPU's, and is "The thin gap"'s
 *      on the Mac. The phone's Glass Slide slider (`phone-glass-slide`) is
 *      held here only as wiring, read from the source (section 5); where it
 *      sits and how big a target it is, `npm run phone` holds with every
 *      other control. Looks saved before this change still hold the old 0.3,
 *      and nothing here reaches them (PLAN 38u-18).
 *   4. Pull the cord and it stops. The same looks with the slide cord taken
 *      out (withGlassSlide at 0), or with the LFOs' share turned to zero
 *      (shapeImpact 0), derive no glass speed at all.
 *   5. The app hands the cord its LFOs. The frame loop's patch context gives
 *      the patch bay `shape: modRef.current` and the LFOs are stepped there;
 *      if that ever became null, every slide cord would read 0 in the app and
 *      pass here. And the phone's slider reads and writes the cord. (Text,
 *      because node never runs the frame loop or the phone.)
 *   6. Evolve and Lucky. Neither dial is among Evolve's wandering keys or in
 *      any of its themes, so a wander cannot slide the glass or grain the
 *      dye; Lucky leaves the dial at 0 and rolls the slide as a cord no
 *      deeper than a third (a dial of 1, the old Lucky's top).
 *   7. withGlassSlide and isSlideCord: the first slide cord takes the depth,
 *      a second is dropped, 0 takes the cord out, other cords are untouched,
 *      and a cord on another plate, an area, a gate or another source is not
 *      the slide.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'n/a');

globalThis.GPUTextureUsage = { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
globalThis.GPUBufferUsage = { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
globalThis.GPUMapMode = { READ: 1, WRITE: 2 };
globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const out = 'node_modules/.cache/glassstill-sim.mjs';
await build({
  stdin: {
    contents: [
      "export { FluidSimulation } from './src/sim/fluidSimulation';",
      "export { PatchBay, SETTING_TRAVEL } from './src/lib/sceneMap';",
      "export * as slide from './src/lib/glassSlide';",
      "export { PRESETS } from './src/presets';",
      "export { DEFAULT_SETTINGS } from './src/types';",
      "export { DRIFTABLE, THEMES } from './src/lib/drift';",
      "export { Modulators } from './src/lib/modulators';",
      "export { luckyLook } from './src/lib/lucky';",
    ].join('\n'),
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
});
const { FluidSimulation, PatchBay, SETTING_TRAVEL, slide, PRESETS, DEFAULT_SETTINGS, DRIFTABLE, THEMES, Modulators, luckyLook }
  = await import(pathToFileURL(`${process.cwd()}/${out}`).href);
const { GLASS_TRAVEL, slideCord, isSlideCord, glassSlideOf, withGlassSlide } = slide;

/*
  Glass Smear on main for every look that slid it with no cord of its own on
  the dial: its written value, or the old default of 0.3 where it wrote none.
  Here and not computed, so the lib cannot move its own target. (`classic`
  rests at 0 since 38w-1, and `moire-star` and `moire-waves` inherit it.)
*/
const SLID = {
  comet: 0.3, cyberpunk: 0.8, 'acid-trip': 0.9, 'microscopic-chaos': 0.5, 'aurora-borealis': 0.4,
  'solar-flare': 0.6, 'fractal-dream': 0.7, 'velvet-underground': 0.22, 'neon-coral-reef': 0.45, 'stardust-collapse': 0.45,
  'cell-bloom': 0.25, 'lace-run': 0.4, 'crowd-plate': 0.25, 'soap-film': 0.35, 'chemical-clock': 0.25, 'home-movie': 0.3,
  'clock-glass': 0.25, 'moire-ripple': 0.25, 'moire-groove': 0.3,
};
// Down to hundredths, as lib/glassSlide.ts slideDepth rounds, so the wave's top is never faster than the old speed.
const floor2 = (x) => Math.floor(x * 100 + 1e-9) / 100;
const lookOf = (id) => PRESETS.find(p => p.id === id);
const full = (p) => ({ ...DEFAULT_SETTINGS, ...p.settings });

console.log('\n1. Both dials rest at zero');
check('the defaults: Glass Smear 0 and Granulation 0', DEFAULT_SETTINGS.glassSmear === 0 && DEFAULT_SETTINGS.granulation === 0,
  `glassSmear ${DEFAULT_SETTINGS.glassSmear}, granulation ${DEFAULT_SETTINGS.granulation}`);
{
  const moving = PRESETS.filter(p => (full(p).glassSmear ?? 0) !== 0).map(p => p.id);
  const grained = PRESETS.filter(p => (full(p).granulation ?? 0) !== 0).map(p => p.id);
  check(`every look on the shelf (${PRESETS.length}) rests the glass at 0`, PRESETS.length >= 41 && moving.length === 0, moving.join(', ') || 'none moving');
  check('every look on the shelf has no grain', grained.length === 0, grained.join(', ') || 'none grained');
}

console.log('\n2. The looks that slid carry the slide as a cord');
{
  const travel = SETTING_TRAVEL.glassSmear;
  check('the lib\'s travel is the patch bay\'s travel for Glass Smear', !!travel && travel.max - travel.min === GLASS_TRAVEL,
    travel ? `${travel.min}..${travel.max} against ${GLASS_TRAVEL}` : 'no travel');
  const missing = Object.keys(SLID).filter(id => !lookOf(id));
  check('every look that slid is still on the shelf', missing.length === 0, missing.join(', ') || `${Object.keys(SLID).length} looks`);
  const wrong = [];
  for (const [id, old] of Object.entries(SLID)) {
    const p = lookOf(id); if (!p) continue;
    const cords = (p.settings.sceneMappings ?? []).filter(isSlideCord);
    if (cords.length !== 1 || cords[0].depth !== floor2(old / 3)) wrong.push(`${id} ${cords.map(c => c.depth).join('+') || 'none'} want ${floor2(old / 3)}`);
  }
  check('each has exactly one slide cord at its old dial over the travel, rounded down', wrong.length === 0, wrong.join('; ') || `all ${Object.keys(SLID).length}`);
  const extra = PRESETS.filter(p => !(p.id in SLID) && (p.settings.sceneMappings ?? []).some(isSlideCord)).map(p => p.id);
  check('no other look carries one', extra.length === 0, extra.join(', ') || 'none');
  const bd = lookOf('bass-drop');
  const own = (bd?.settings.sceneMappings ?? []).filter(m => m.setting === 'glassSmear');
  check('bass-drop keeps its own cords on the glass and gains no slide', !!bd && own.length > 0 && !own.some(isSlideCord),
    bd ? `${own.length} cords on Glass Smear: ${own.map(m => `${m.source}/${m.feature}`).join(', ')}` : 'no bass-drop');
}

console.log('\n3. The glass in motion: an LFO wave whose top is the old speed');
// Held constant so the speed the step derives is the dial and nothing else.
const flat = () => 0.7;
const quiet = (shapeImpact, shape) => ({ room: null, film: null, sound: null, shape, hits: null, notes: null, roomImpact: 0, filmImpact: 0, soundImpact: 1, shapeImpact });
/**
 * The glass over `seconds` of silence, folded each frame with real LFOs: the
 * dial the patch bay hands the solver every frame, and the glass's speed the
 * real solver derives from it at the wave's top and its foot. (Stepping the
 * solver on every frame of every look took minutes; the fold is what moves
 * from frame to frame, and the step is what turns the dial into a speed, so
 * the step runs where the dial peaks and where it bottoms.)
 */
function glassRun(settings, seconds, shapeImpact = 1) {
  const bay = new PatchBay(settings);
  const mods = new Modulators();
  const frames = Math.max(1, Math.round(seconds * 60));
  let hi = -Infinity, lo = Infinity, kHi = 0, kLo = 0;
  for (let k = 0; k < frames; k++) {
    mods.step(1 / 60, 0, settings, null);
    bay.fold(settings, quiet(shapeImpact, mods), 1, 1000 + k * 16.7);
    const g = bay.layer(0).glassSmear;
    if (g > hi) { hi = g; kHi = k; }
    if (g < lo) { lo = g; kLo = k; }
  }
  const speedAt = (k) => {
    const m = new Modulators();
    for (let i = 0; i <= k; i++) m.step(1 / 60, 0, settings, null);
    const b = new PatchBay(settings);
    b.fold(settings, quiet(shapeImpact, m), 1, 1000 + k * 16.7);
    const sim = new FluidSimulation(32, 0, 0, 0.1);
    sim.step(b.layer(0), k / 60, flat);
    return Math.hypot(sim.lastStep.smearX, sim.lastStep.smearY);
  };
  return { hi, lo, top: speedAt(kHi), foot: speedAt(kLo) };
}
/** The constant speed the look's glass slid at on main: its old dial, no cord. */
function oldSpeed(settings, old) {
  const was = { ...settings, glassSmear: old, sceneMappings: withGlassSlide(settings.sceneMappings, 0) };
  return glassRun(was, 1 / 60).top;
}
{
  let worstTop = 0, worstOver = 0, worstFoot = 0, rows = [];
  for (const [id, old] of Object.entries(SLID)) {
    const p = lookOf(id); if (!p) continue;
    const s = full(p);
    const { top, foot } = glassRun(s, 16);
    const ref = oldSpeed(s, old);
    // In the dial's units: the cord's depth is rounded down to a hundredth of a travel of 3, so the top may sit up
    // to 0.03 of the dial under the old speed, and no amount over it.
    worstTop = Math.max(worstTop, (1 - top / ref) * old);
    worstOver = Math.max(worstOver, top / ref - 1);
    worstFoot = Math.max(worstFoot, foot / ref);
    rows.push(`${id} ${f3(top / ref)}/${f3(foot / ref)}`);
  }
  console.log(`      top/foot against the old constant speed: ${rows.join(', ')}`);
  check('the wave\'s top is the old constant speed, within the cord\'s rounding (0.03 of the dial, under)', worstTop <= 0.0301, `worst ${f3(worstTop)} of the dial under`);
  check('and never faster than the look was written to slide', worstOver <= 1e-9, `worst ${f3(worstOver)} over`);
  check('the glass comes to rest at the wave\'s foot (under a twentieth of the old speed)', worstFoot < 0.05, `worst foot ${f3(worstFoot)}`);
  const c = glassRun(full(lookOf('home-movie')), 16);
  check('it moves in silence: the beat clock runs the LFO with no music, and the dial swings from rest to the old 0.3',
    c.top > 0 && c.lo < 0.01 && Math.abs(c.hi - 0.3) < 0.02, `home-movie's dial ${f3(c.lo)}..${f3(c.hi)}`);
}

console.log('\n4. Pull the cord and the glass stops');
{
  const pulled = [], muted = [];
  for (const id of Object.keys(SLID)) {
    const p = lookOf(id); if (!p) continue;
    const s = full(p);
    const off = { ...s, sceneMappings: withGlassSlide(s.sceneMappings, 0) };
    { const r = glassRun(off, 8); if (r.hi !== 0 || r.top !== 0) pulled.push(id); }
    { const r = glassRun(s, 8, 0); if (r.hi !== 0 || r.top !== 0) muted.push(id); }
  }
  check('with the slide cord out, no look\'s glass moves', pulled.length === 0, pulled.join(', ') || 'all still');
  check('with the LFOs\' share at 0 (shapeImpact), no look\'s glass moves', muted.length === 0, muted.join(', ') || 'all still');
  const still = PRESETS.filter(p => !(p.id in SLID) && p.id !== 'bass-drop' && (() => { const r = glassRun(full(p), 8); return r.hi !== 0 || r.top !== 0; })()).map(p => p.id);
  check('the looks that never slid stay still in silence', still.length === 0, still.join(', ') || `${PRESETS.length - Object.keys(SLID).length - 1} still`);
}

console.log('\n5. The app hands the cord its LFOs');
{
  const lv = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
  const ctx = lv.match(/const patchCtx: PatchContext = \{[\s\S]*?\};/)?.[0] ?? '';
  check('the frame loop\'s patch context carries `shape: modRef.current` and the LFOs\' share', /shape:\s*modRef\.current,/.test(ctx) && /shapeImpact:\s*settingsRef\.current\.shapeImpact\s*\?\?\s*1/.test(ctx),
    ctx ? 'found' : 'no patchCtx');
  check('and the frame loop steps the LFOs', /modRef\.current\.step\(/.test(lv));
  /*
    The phone has no patch bay, so its slider is the cord's only control
    there: it must read the look's slide with glassSlideOf and write it back
    with withGlassSlide through the mixer's own settings, as the helpers
    tested in section 7 promise. A source read, since the phone check drives
    its controls' layout and not their values.
  */
  const ph = readFileSync('src/components/phone/PhoneStage.tsx', 'utf8');
  const at = ph.indexOf('testId="phone-glass-slide"'), slider = at < 0 ? '' : ph.slice(ph.lastIndexOf('<Slider', at), at);
  check('the phone\'s Glass Slide slider reads the look\'s slide cord and writes it back as one',
    /value=\{glassSlideOf\(p\.mixer\.settings\.sceneMappings\)\}/.test(slider)
      && /onSetting\(\{ sceneMappings: withGlassSlide\(p\.mixer!?\.settings\.sceneMappings, v\) \}\)/.test(slider),
    at < 0 ? 'no phone-glass-slide on the phone' : 'wired');
  check('the LFOs\' share defaults to 1, so a look\'s slide rides out of the box', (DEFAULT_SETTINGS.shapeImpact ?? 1) === 1, `${DEFAULT_SETTINGS.shapeImpact}`);
}

console.log('\n6. Evolve and Lucky');
{
  check('Evolve never wanders Glass Smear or Granulation', !DRIFTABLE.includes('glassSmear') && !DRIFTABLE.includes('granulation'));
  const themed = THEMES.filter(t => 'glassSmear' in t.keys || 'granulation' in t.keys).map(t => t.name);
  check('and no theme of its carries either', themed.length === 0, themed.join(', ') || `${THEMES.length} themes`);
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  let dial = 0, deepest = 0, rolled = 0;
  for (let i = 0; i < 300; i++) {
    const s = luckyLook({ ...DEFAULT_SETTINGS }, ['#ff0000', '#00ff00', '#0000ff'], rand);
    dial = Math.max(dial, Math.abs(s.glassSmear));
    const d = glassSlideOf(s.sceneMappings);
    deepest = Math.max(deepest, d);
    if (d > 0) rolled++;
  }
  check('Lucky leaves the glass\'s dial at 0', dial === 0, `largest dial ${dial}`);
  check('and rolls the slide as a cord no deeper than a third', deepest <= 0.34 && rolled > 150, `deepest ${f3(deepest)}, ${rolled} of 300 rolls slide`);
}

console.log('\n7. withGlassSlide and isSlideCord');
{
  const other = { source: 'sound', feature: 'mid', setting: 'turbulenceScale', depth: 0.2 };
  const a = withGlassSlide([other], 0.25);
  check('a look without one gains it at the end', a.length === 2 && a[0] === other && isSlideCord(a[1]) && a[1].depth === 0.25);
  const b = withGlassSlide([slideCord(0.1), other, slideCord(0.4)], 0.333);
  check('the first takes the depth (to hundredths), a second goes, others stay', b.length === 2 && b[0].depth === 0.33 && b[1] === other);
  check('0 takes it out', withGlassSlide([slideCord(0.2), other], 0).length === 1);
  check('glassSlideOf sums and clamps', glassSlideOf([slideCord(0.2), slideCord(0.3)]) === 0.5 && glassSlideOf([slideCord(0.8), slideCord(0.8)]) === 1 && glassSlideOf(null) === 0);
  const not = [
    { ...slideCord(0.2), layer: 1 }, { ...slideCord(0.2), area: 0 }, { ...slideCord(0.2), mode: 'gate' },
    { ...slideCord(0.2), feature: 'lfo2' }, { ...slideCord(0.2), source: 'sound' }, { ...slideCord(0.2), setting: 'turbulenceScale' },
  ];
  check('a cord on one plate, an area, a gate, another LFO, the sound or another dial is not the slide', not.every(m => !isSlideCord(m)) && isSlideCord({ ...slideCord(0.2), layer: 'all' }));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
