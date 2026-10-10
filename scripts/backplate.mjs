#!/usr/bin/env node
/**
 * The back plate's own look (PLAN.md §16a).
 *
 *   npm run backplate   (node only: lib/backLook.ts, lib/sceneMap.ts's fold,
 *                        and the app's source for the wiring)
 *
 * What was asked: "Let's build multi-plate next", after a Mixer whose back
 * row could grade the second plate but never say what was on it. A light show
 * was several projectors, each its own source (docs/rig-plan.md R1), and the
 * first step of that here is a look sent to the back plate alone.
 *
 * What that has to mean, and what each part below measures:
 *
 *   - **The back plate moves as its look says.** The solver for plate 1 is
 *     stepped with `patch.layer(1)`, so that is what is read: every key the
 *     solver reads (`PER_LAYER`) is the back look's, and it is read from a
 *     real fold, with the look's patches live, because a back look that the
 *     patch bay laid over *after* the patches would silently cancel a kick
 *     aimed at every plate. The control is the same fold with no back look,
 *     where the same keys are the front's: a fold that ignored the back look
 *     would pass the "patches still ride" check and fail the first.
 *   - **The picture stays the front's.** One render pass draws both plates,
 *     so a key the picture reads must not change with the back look: the
 *     global fold is compared with the one made without it, key by key.
 *   - **No cost to a show that never uses it.** With no back look the fold
 *     hands back `base` itself, the same object, as it did before this.
 *   - **The fade is a Go's fade.** The back plate's settings walk from where
 *     they are to the look over the fade time with no step bigger than the
 *     curve allows, a second Go mid-fade starts from where the first had got
 *     to (no jump back), a cut lands at once, and Follow the front fades back
 *     and then lets go (the back plate is the front's twin again, with
 *     nothing of its own left to fold).
 *   - **The wiring.** That the visualizer folds the back look in, that a
 *     front Go leaves a back plate with its own look alone, that every pour
 *     aimed at plate 1 takes its colours from the back look, and that the
 *     desk, the phone, MIDI and the Mixer's row reach it. These read the
 *     source, as `npm run rowfade` does for its wiring: the app's frames
 *     cannot be read in a cloud session, and on the Mac the pair is for the
 *     owner's eyes (docs/judging.md).
 *
 * The phone's switch is driven for real in `npm run phone`.
 */

import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(root, p), 'utf8');

// The fold and the fade import the app's settings and presets, which are
// TypeScript importing TypeScript without extensions; bundled once, as
// `npm run rowfade` bundles lookFade.
const out = join(tmpdir(), `backplate-${process.pid}.mjs`);
await build({
  stdin: {
    contents: `
      export { BackLook } from './src/lib/backLook.ts';
      export { PatchBay, PER_LAYER } from './src/lib/sceneMap.ts';
      export { targetLook, ease } from './src/lib/lookFade.ts';
      export { PRESETS } from './src/presets.ts';
      export { DEFAULT_SETTINGS } from './src/types.ts';
    `,
    resolveDir: root, loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const { BackLook, PatchBay, PER_LAYER, targetLook, PRESETS, DEFAULT_SETTINGS } = await import(out);
rmSync(out, { force: true });

let failed = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const r = (v, n = 4) => Number(Number(v).toFixed(n));

// ── Two looks that differ ────────────────────────────────────────────
/*
  The front on Classic, and the back on whichever shipped look differs from
  it in the most solver keys, chosen here rather than named, so the check
  cannot pass on a pair that happens to agree. Both resolved the way a Go
  resolves them (`targetLook`), since that is what App hands the visualizer.
*/
const live = { ...DEFAULT_SETTINGS, layerCount: 2 };
const lookOf = (id) => targetLook(live, PRESETS.find(p => p.id === id).settings);
const A = { ...lookOf('classic'), layerCount: 2, sceneMappings: [] };
const numeric = (s, k) => typeof s[k] === 'number';
const differs = (x, y, keys) => [...keys].filter(k => numeric(x, k) && numeric(y, k) && x[k] !== y[k]);
let bId = null; let bDiff = [];
for (const p of PRESETS) {
  if (p.id === 'classic') continue;
  const d = differs(A, lookOf(p.id), PER_LAYER);
  if (d.length > bDiff.length) { bId = p.id; bDiff = d; }
}
const B = lookOf(bId);
const pictureKeys = Object.keys(DEFAULT_SETTINGS).filter(k => !PER_LAYER.has(k));
const pictureDiff = differs(A, B, pictureKeys);

console.log('\n Two looks');
check('the back look differs from the front in most of the solver\'s keys, and in keys the picture reads',
  bDiff.length >= 10 && pictureDiff.length >= 3,
  `${bId}: ${bDiff.length} of ${PER_LAYER.size} solver keys, ${pictureDiff.length} picture keys`);

// ── The fold ─────────────────────────────────────────────────────────
const T = 1000;
const heard = (bass) => ({ volume: 0, bass, mid: 0, treble: 0, energy: 0, timbre: 0, complexity: 0 });
const ctx = (over = {}) => ({ room: null, film: null, sound: null, roomImpact: 1, filmImpact: 1, soundImpact: 1, shapeImpact: 1, shape: null, ...over });
function fold(base, c, back) {
  const bay = new PatchBay(base);
  bay.fold(base, c, 2, T, [], [null, back]);
  return bay;
}

console.log('\n The fold');
{
  const bare = fold(A, ctx(), null);
  check('with no back look the fold hands back the look itself, for the picture and both plates (no copy, as before)',
    bare.global === A && bare.layer(0) === A && bare.layer(1) === A);

  const own = fold(A, ctx(), B);
  const wrongSolver = bDiff.filter(k => own.layer(1)[k] !== B[k]);
  const control = bDiff.filter(k => bare.layer(1)[k] !== A[k]);
  check('with one, the back plate steps with the back look\'s solver keys, every one that differs',
    wrongSolver.length === 0 && control.length === 0,
    wrongSolver.length ? `not the back look's: ${wrongSolver.slice(0, 5).join(', ')}` : `${bDiff.length} keys, e.g. ${bDiff[0]} ${r(A[bDiff[0]])} → ${r(own.layer(1)[bDiff[0]])}`);
  const leaked = pictureDiff.filter(k => own.layer(1)[k] !== A[k]);
  check('and every key the picture reads stays the front\'s, on the back plate\'s settings too',
    leaked.length === 0, leaked.length ? `took the back look's: ${leaked.join(', ')}` : `${pictureDiff.length} keys`);
  const globalMoved = Object.keys(A).filter(k => own.global[k] !== A[k]);
  check('the picture and the front plate are the front look, untouched',
    own.global === A && own.layer(0) === A && globalMoved.length === 0, globalMoved.join(', '));
}
{
  /*
    A kick on Turbulence aimed at every plate, and one aimed at the back
    plate alone. Each must ride the back plate's own Turbulence: the back
    look is the plate's base, not a coat of paint over the fold.
  */
  const key = bDiff.includes('turbulenceScale') ? 'turbulenceScale' : bDiff[0];
  const patch = (layer) => ({ source: 'sound', feature: 'bass', setting: key, depth: 0.2, layer });
  const loud = ctx({ sound: heard(40) });
  const mid = (x) => ({ ...x, [key]: 0.3 });
  const A2 = { ...mid(A), sceneMappings: [patch('all')] };
  const B2 = mid(B); B2[key] = 0.6;
  const noBack = fold(A2, loud, null);
  const d = noBack.global[key] - A2[key];
  const withBack = fold(A2, loud, B2);
  check(`a patch aimed at every plate rides the back plate's own ${key}, not the front's`,
    d > 0.01 && Math.abs(withBack.layer(1)[key] - (B2[key] + d)) < 1e-9 && Math.abs(withBack.global[key] - (A2[key] + d)) < 1e-9,
    `ride ${r(d)}: front ${r(A2[key])} → ${r(withBack.global[key])}, back ${r(B2[key])} → ${r(withBack.layer(1)[key])}`);
  const A3 = { ...mid(A), sceneMappings: [patch(1)] };
  const aimed = fold(A3, loud, B2);
  check('and one aimed at the back plate alone rides it too, and leaves the front alone',
    Math.abs(aimed.layer(1)[key] - (B2[key] + d)) < 1e-9 && aimed.global[key] === A3[key] && aimed.layer(0)[key] === A3[key],
    `back ${r(B2[key])} → ${r(aimed.layer(1)[key])}, front ${r(aimed.layer(0)[key])}`);
}

// ── The fade ─────────────────────────────────────────────────────────
console.log('\n The fade');
const key = bDiff.includes('turbulenceScale') ? 'turbulenceScale' : bDiff[0];
{
  const b = new BackLook();
  check('a new back plate follows the front: nothing to fold', b.base(A, 0) === null && !b.active);
  b.send(B, A, 1000, 2, bId, 'Back');
  const at0 = b.base(A, 1000);
  const span = B[key] - A[key];
  let worst = 0; let prev = at0[key]; let monotone = true;
  for (let t = 1016; t <= 3000; t += 16) {
    const v = b.base(A, t)[key];
    worst = Math.max(worst, Math.abs(v - prev) / Math.abs(span));
    if ((v - prev) * Math.sign(span) < -1e-12) monotone = false;
    prev = v;
  }
  const landed = b.base(A, 3000);
  check('a Go to the back plate starts from the front\'s settings and lands on the look\'s at the fade time',
    Math.abs(at0[key] - A[key]) < 1e-9 && landed === B && b.active && b.id === bId,
    `${key} ${r(at0[key])} → ${r(landed[key])} over 2 s`);
  // A 2 s fade at 16 ms ticks is 125 ticks; linear would move 0.8% a tick,
  // the ease's steepest point about twice that. A cut would be 100%.
  check('with no tick a jump: the most one 16 ms tick moves it is under 3% of the way, always toward the look',
    worst < 0.03 && monotone, `${r(worst * 100, 2)}% of the way at most`);
  check('once landed it is the look itself, the same object every frame (nothing allocated for an hour of show)',
    b.base(A, 5000) === B && b.base(A, 99999) === B);
}
{
  const b = new BackLook();
  b.send(B, A, 0, 2, bId);
  const before = b.base(A, 999)[key];
  const C = { ...A, [key]: A[key] + (B[key] - A[key]) * 3 };
  b.send(C, A, 1000, 2, 'c');
  const after = b.base(A, 1000)[key];
  // The control: the same second Go made on a fresh BackLook starts from the
  // front, which is where a Go that ignored the fade in flight would start.
  const fresh = new BackLook(); fresh.send(C, A, 1000, 2, 'c');
  const naive = fresh.base(A, 1000)[key];
  check('a second Go mid-fade starts from where the first had got to, not from its start',
    Math.abs(after - before) < Math.abs(B[key] - A[key]) * 0.01 && Math.abs(naive - before) > Math.abs(B[key] - A[key]) * 0.2,
    `${r(before)} just before, ${r(after)} just after; from the start it would be ${r(naive)}`);
}
{
  const b = new BackLook();
  b.send(B, A, 0, 0, bId);
  check('a cut lands at once', b.base(A, 0) === B);
  b.send(null, A, 100, 2);
  const leaving = b.base(A, 100);
  const half = b.base(A, 1100);
  const gone = b.base(A, 2100);
  check('Follow the front fades back from the look to the front\'s settings, and then lets go',
    Math.abs(leaving[key] - B[key]) < 1e-9 && half[key] !== B[key] && half[key] !== A[key] && gone === null && !b.active && b.id === null,
    `${key} ${r(leaving[key])} → ${r(half[key])} → ${gone === null ? 'the front\'s own' : r(gone[key])}`);
  // To the front as it is now, not as it was when Follow was pressed: a front
  // Go during the Follow must not leave the back plate on the old front.
  const b2 = new BackLook();
  b2.send(B, A, 0, 0, bId);
  b2.send(null, A, 0, 2);
  const A4 = { ...A, [key]: A[key] + 0.123 };
  const nearEnd = b2.base(A4, 1990)[key];
  check('and it fades to the front as it is at each frame, not as it was when Follow was pressed',
    Math.abs(nearEnd - A4[key]) < Math.abs(A4[key] - B[key]) * 0.02, `${r(nearEnd)} against the front's ${r(A4[key])}`);
  const b3 = new BackLook();
  b3.send(null, A, 0, 2);
  check('and Follow on a back plate already following does nothing', b3.base(A, 0) === null && !b3.active);
}

// ── The wiring ───────────────────────────────────────────────────────
console.log('\n The wiring');
// Comments out, so a sentence about the wiring cannot stand in for it.
const code = (p) => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const lv = code('src/components/LiquidVisualizer.tsx');
const app = code('src/App.tsx');
const desk = code('src/components/desk/PerformDesk.tsx');
const phone = code('src/components/phone/PhoneStage.tsx');
const mixer = code('src/components/MixerPanel.tsx');
const midi = code('src/lib/midi.ts');

check('the visualizer folds the back look in as plate 1\'s base, every frame',
  /patchesOf\(soundBindingsRef\.current\),\s*\(platesScratchRef\.current\[1\] = backLookRef\.current\.base\(settingsRef\.current, showNow\(\)\), platesScratchRef\.current\)\)/.test(lv));
check('and steps each plate with its own fold, and turns each dish at its own motor speed',
  /fluidsRef\.current\[li\]\.step\(li === 0 \? magnetFor\(patch\.layer\(li\)\) : patch\.layer\(li\)/.test(lv)
  && /const asked = Math\.max\(0, patch\.layer\(l\)\.rotationSpeed/.test(lv));
{
  // The front's handover: `handed` is the front alone while the back plate
  // has dyes of its own, and every one of its three touches goes through it.
  const hand = lv.slice(lv.indexOf('const h = handoffRef.current;'), lv.indexOf('if (p >= 1) handoffRef.current = null;'));
  check('a front Go thins, lays and pours only the front plate while the back plate has a look of its own',
    /h\.plates \?\?= backDyesRef\.current \? 1 : fluidsRef\.current\.length;\s*const handed = fluidsRef\.current\.slice\(0, h\.plates\);/.test(hand)
    && /for \(const fluid of handed\) fluid\.thinDye/.test(hand) && /h\.seeds = handed\.map/.test(hand)
    && /const fluid = handed\[h\.poured %/.test(hand) && !/for \(const fluid of fluidsRef\.current\)/.test(hand),
    hand.length ? '' : 'the handover was not found');
}
{
  const back = lv.slice(lv.indexOf('const h = backHandoffRef.current;'), lv.indexOf('if (p >= 1) backHandoffRef.current = null;'));
  check('the back plate\'s own handover thins, lays and pours plate 1 alone, in the back look\'s dyes',
    /const fluid = fluidsRef\.current\[1\];/.test(back) && /fluid\.thinDye/.test(back) && /fluid\.seedPreset\(dyes\.id/.test(back)
    && /harmonyColor\(harmonyOf\(1\)\)/.test(back) && !/fluidsRef\.current\[0\]/.test(back));
}
{
  // Every automatic pour that can land on plate 1 asks `harmonyOf` for the
  // plate it is pouring on: the Evolve's random plate, the Seed button (each
  // plate), the ambient orbits and the music (the active plate), and a hand.
  const sites = {
    // On a look built on areas (lib/plateAreas.ts) the drop's colour is its
    // area's dye, read for the same plate (areaColor(li, …)).
    evolve: /const li = fluidsRef\.current\.indexOf\(af\);\s*const color = (?:area \? areaColor\(li, area\) : )?harmonyColor\(harmonyOf\(li\)\);\s*const styles = stylesOf\(li\);/,
    evolveLiquid: /doseLiquid\(af, liquidsOf\(li\)/,
    seed: /fluidsRef\.current\.forEach\(\(fluid, li\) => \{[\s\S]{0,200}const styles = stylesOf\(li\);[\s\S]{0,300}harmonyColor\(harmonyOf\(li\)\)[\s\S]{0,400}doseLiquid\(fluid, liquidsOf\(li\)/,
    ambient: /harmonyCycle\(harmonyOf\(activeLayerRef\.current\), time \* 0\.25/,
    music: /harmonyCycle\(harmonyOf\(activeLayerRef\.current\), (?:time \* 0\.3|time \* 0\.1 \+ pitchAngle)/,
    musicStyles: /const aStyles = stylesOf\(activeLayerRef\.current\);/,
    musicLiquids: /doseLiquid\(activeFluid, liquidsOf\(activeLayerRef\.current\)/,
    themeMotion: /case 'motion': \{\s*const c = harmonyColor\(harmonyOf\(activeLayerRef\.current\)\);/,
    themeDefault: /default: \{\s*const c = harmonyColor\(harmonyOf\(activeLayerRef\.current\)\);\s*af\.autoInject\('drop'/,
    hand: /g\.color \? hexToRgb\(g\.color\) : harmonyColor\(harmonyOf\(layer\)\)/,
  };
  const missing = Object.entries(sites).filter(([, re]) => !re.test(lv)).map(([k]) => k);
  check('every pour that can land on the back plate takes that plate\'s colours, styles and liquids (Evolve, Seed, the orbits, the music, a lyric\'s theme, a hand)',
    missing.length === 0, missing.length ? `still the front's: ${missing.join(', ')}` : `${Object.keys(sites).length} sites`);
  check('and a pinned palette wins on the back plate as on the front',
    /return own \? \(harmonyLockRef\.current \?\? own\.harmony\) : harmonyRef\.current;/.test(lv));
}
{
  // A cut on the front (the preset strip, a MIDI preset step, a user look)
  // is `layPlate`: it must leave a back plate with its own look, its angle
  // and its spin as they were. Only a device lost with nothing carried
  // across lays it again, from its own look.
  const lay = lv.slice(lv.indexOf('const layPlate = (presetId: string, layBack = false'), lv.indexOf('const layPlateRef = useRef(layPlate);'));
  check('a cut on the front leaves a back plate with its own look as it was; a lost device lays it again from its look',
    /const keepBack = !!backDyesRef\.current && !layBack;\s*const laid = keepBack \? fluidsRef\.current\.slice\(0, 1\) : fluidsRef\.current;\s*for \(const fluid of laid\) fluid\.clearAll\(\);/.test(lay)
    && /rotationAnglesRef\.current\.map\(\(a, i\) => \(i < laid\.length/.test(lay) && /spinVelRef\.current\.map\(\(v, i\) => \(i < laid\.length/.test(lay)
    && /for \(const later of laid\.slice\(1\)\)/.test(lay) && !/for \(const fluid of fluidsRef\.current\) fluid\.clearAll\(\)/.test(lay)
    && /if \(!kept\) layPlateRef\.current\(livePresetRef\.current, true\);/.test(lv),
    lay.length ? '' : 'layPlate not found');
}
{
  // A render lays its look on every plate from its seed, on its own clock:
  // the back look is let go of as it begins and ends, and App is told.
  const reset = lv.slice(lv.indexOf('const resetStamps = () => {'), lv.indexOf('const resetStamps = () => {') + 2000);
  check('a render lets the back look go as it begins and ends, and tells App; a back Go during one is refused',
    /backLookRef\.current\.clear\(\);\s*backDyesRef\.current = null;\s*backHandoffRef\.current = null;\s*onBackLookClearedRef\.current\?\.\(\);/.test(reset)
    && /if \(stageRef\.current\) \{ onBackLookClearedRef\.current\?\.\(\); return; \}/.test(lv) && /onBackLookCleared=\{backLookCleared\}/.test(app));
}
check('each dish turns and drags at its own plate\'s settings',
  /const asked = Math\.max\(0, patch\.layer\(l\)\.rotationSpeed/.test(lv));
check('the layer pickers offer the back plate while it has a look (desk, Design desk, phone, keys, the old sidebar)',
  /const stageLayers = Math\.max\(1, settings\.layerCount \?\? 1, backLook \? 2 : 1\);/.test(app)
  && (app.match(/layers=\{stageLayers\}/g) ?? []).length >= 3 && /Math\.min\(stageLayers - 1, l \+ dir\)/.test(app)
  && /if \(activeLayer >= stageLayers\)/.test(app) && !/settings\.layerCount - 1/.test(app));
check('Follow the front keeps the back plate on the stage while it fades back, then lets it go',
  /setBackLook\(b => \(b && seconds > 0 \? \{ \.\.\.b, leaving: true \} : null\)\);/.test(app)
  && /setTimeout\(\(\) => \{ backLeavingTimer\.current = null; setBackLook\(null\); \}, seconds \* 1000\)/.test(app));
check('App sends the look a Go would send (targetLook over the live settings) with a user look\'s dyes, and spends the cue',
  /visualizerRef\.current\?\.sendBack\(next\.id, targetLook\(settingsRef\.current, next\.settings\), seconds, next\.name, up/.test(app)
  && /setBackLook\(\{ id: next\.id, name: next\.name \}\);\s*setCued\(null\);/.test(app));
check('and keeps the back plate on the stage while it has a look, whatever the front look\'s plate count',
  /return \(s\.layerCount \?\? 1\) < stageLayers \? \{ \.\.\.s, layerCount: stageLayers \} : s;/.test(app) && /settings=\{effectiveSettings\}/.test(app));
// check('the desk has To Back Plate under Go, and Follow Front while the back plate has a look',
//   /onClick=\{p\.onGoBackPlate\}[\s\S]{0,200}testId="go-back-plate-button"/.test(desk) && /testId="back-follows-front-button"/.test(desk)
//   && /onGoBackPlate=\{\(\) => goBackPlate\(\)\}/.test(app) && /onBackFollowsFront=\{backFollowsFront\}/.test(app));
// check('the phone\'s looks sheet sends a look to the back plate with its switch on Back plate',
//   /if \(lookTo === 'back' && p\.onBackLook\) \{ p\.onBackLook\(l\.id\); setLookTo\('all'\); \}\s*else p\.onLook\(l\.id\);/.test(phone) && /onBackLook=\{\(id\) => backLookNow\(id\)\}/.test(app));
check('a controller reaches both (Go to Back Plate, Back Plate Follows Front)',
  /'go-back-plate' \| 'back-follows-front'/.test(midi) && /case 'go-back-plate':\s*goBackPlate\(\)/.test(app) && /case 'back-follows-front': backFollowsFront\(\)/.test(app));
{
  const sites = (app.match(/backLook: backLookName|backLook=\{backLookName\}/g) ?? []).length;
  check('the Mixer\'s Back Plate row names the look, on the desk, in Settings and on the phone',
    /\{backLook \? `On \$\{backLook\}` : 'Follows the front'\}/.test(mixer) && /backLook=\{p\.onGoBackPlate \? \(p\.backLook \?\? null\) : undefined\}/.test(desk)
    && /backLook=\{p\.mixer\.backLook\}/.test(phone) && sites >= 3, `${sites} places App hands it over`);
}

console.log(`\n${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
