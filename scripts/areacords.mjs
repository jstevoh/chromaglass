#!/usr/bin/env node
/**
 * Areas that listen for themselves (PLAN 25h): a cord aimed at one area of the
 * dish works there and nowhere else, on its own band, on its gate.
 *
 *   npm run areacords              (the gate and the tables in node, then the lab:
 *                                   any adapter that computes; PW_WEBGPU=1 in a cloud session)
 *   npm run areacords -- --node    (the node half alone)
 *
 * What it holds, and why each is not the easy number:
 *
 *  1. The gate (lib/areaCords.ts CordGate, the least of PLAN 30a). Eight
 *     bursts on a reading that also dithers on the threshold line between
 *     them: the gate opens eight times, not once per frame the reading spends
 *     over the line and not once per wobble (a gate with no hysteresis opens
 *     dozens of times here). The envelope reaches the hit's height in the
 *     cord's attack and falls to nothing in its release, each within 10%,
 *     timed on the sim's own step; and a cord with none of the three set
 *     follows its reading exactly, which is every cord saved before this.
 *  2. The tables. Every area cord a look ships names an area that look has,
 *     one of the hand's four acts, and a feature its source really has, from
 *     the fast sources only (hits, bands): `getAudioValue` reads an unknown
 *     name as 0, so a cord on a typo plays as nothing and looks fine in a
 *     review (28f found four). A cord with an area and a setting, or an act
 *     with no area, is dropped on load; every other cord loads as it was. The
 *     patch bay's fold leaves an area cord alone, so the act is not applied a
 *     second time as a setting.
 *  3. The lab, the real solver on a thin gap (every look's), with Velvet
 *     Underground's three pools laid and the cords read through the patch
 *     bay's own reading from synthetic bands. Each run is measured against a
 *     control run of the same plate with no cords, so what the plate does on
 *     its own (the pools settling, the noise) is not counted for either side:
 *     a. one band's cord on the soap well (pour, paddle, heat), bursts in that
 *        band only: inside the well the dye, the flow and the temperature
 *        change at least 5x what they change outside every area;
 *     b. two areas on two bands, one band played at a time: each area answers
 *        its own band at least 5x more than the other area does;
 *     and each of those carries an absolute floor (the area itself must have
 *     changed), so two runs that both did nothing cannot pass on a ratio of
 *     two zeros.
 *  4. The 25e count of lit places (connected cells over density 0.3, each over
 *     1% of the plate) on the three looks rebuilt with this, each played by
 *     its own cords for four seconds of a groove: once in its areas, once with
 *     every act moved to the plate's middle, where the music's hands landed
 *     before areas. Printed before and after; the areas' run holds at least
 *     as many places as the look has areas that pour, the middle's one.
 */
import { readFileSync } from 'node:fs';
import { CordGate, AreaHands, isAreaCord, AREA_TARGETS, GATE_HYSTERESIS, AREA_PADDLE_ORBIT, AREA_STIR_TURN_S } from '../src/lib/areaCords.ts';
import { PatchBay, cordReading } from '../src/lib/sceneMap.ts';
import { PRESET_AREAS, areaFamily, areasForBand } from '../src/lib/plateAreas.ts';
import { PRESET_CONTRACTS } from '../src/presetPlate.ts';
import { PRESETS } from '../src/presets.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { sanitizePatch } from '../src/lib/sanitizeSettings.ts';
import { SOURCE_NAMES } from '../src/lib/audioFeatures.ts';
import { HIT_FEATURES } from '../src/lib/hitSource.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const DT = 1 / 60;

// ── 1. The gate ──────────────────────────────────────────────────────
{
  const cord = { source: 'bands', feature: 'band2', setting: 'areaPour', area: 0, depth: 1, threshold: 0.4, attack: 0.25, release: 0.35 };
  const g = new CordGate();
  // Eight bursts of 0.5 s at 0.9, 1.5 s apart; after the third on, the reading
  // dithers on the line between them, inside the hysteresis, for half a second.
  // The second burst is softer (0.5), so a release that falls at its own
  // pace whatever the hit's height, or a height never let go of between hits,
  // shows as the wrong time on that one.
  const at = (t) => {
    const k = Math.floor(t / 1.5), u = t - k * 1.5;
    if (k < 8 && u < 0.5) return k === 1 ? 0.5 : 0.9;
    // From the third burst on (the first two are timed from rest).
    if (k >= 2 && k < 8 && u > 0.9 && u < 1.4) return cord.threshold + (GATE_HYSTERESIS * 0.8) * Math.sin(u * 90);
    return 0.02;
  };
  const env = [];
  for (let s = 0; s < Math.round(13 / DT); s++) env.push(g.step(at(s * DT), DT, cord));
  // The first burst: from the step it opens to the step it reaches 0.9, and
  // from the step it closes to the step it is back at 0.
  const open = env.findIndex(v => v > 0);
  const top = env.findIndex(v => v >= 0.9 - 1e-9);
  const close = Math.round(0.5 / DT);
  const zero = env.findIndex((v, i) => i > close && v <= 1e-9);
  const rise = (top - open + 1) * DT, fall = (zero - close) * DT;
  // The soft burst: its own rise to 0.5 and its fall from 0.5.
  const s1 = Math.round(1.5 / DT), c1 = Math.round(2.0 / DT);
  const top1 = env.findIndex((v, i) => i >= s1 && v >= 0.5 - 1e-9);
  const zero1 = env.findIndex((v, i) => i > c1 && v <= 1e-9);
  const rise1 = (top1 - s1 + 1) * DT, fall1 = (zero1 - c1) * DT;
  const peak1 = Math.max(...env.slice(s1, c1 + 1));
  // The dithered stretches open the gate (they start over the line), and it
  // must stay open through each: count rising edges of the gate itself.
  const g2 = new CordGate();
  let edges = 0, was = false;
  for (let s = 0; s < Math.round(13 / DT); s++) { g2.step(at(s * DT), DT, cord); if (g2.open && !was) edges++; was = g2.open; }
  check('the gate opens once a burst, and once for each stretch dithering on its line, not once a wobble',
    g.fires === edges && edges === 14, `${g.fires} openings for 8 bursts and 6 dithered stretches`);
  check('it rises to the hit\'s height in its attack and falls to nothing in its release, each within 10%',
    [rise, rise1].every(r => Math.abs(r / cord.attack - 1) <= 0.1) && [fall, fall1].every(f => Math.abs(f / cord.release - 1) <= 0.1) &&
      Math.abs(peak1 - 0.5) < 1e-9,
    `a hit of 0.9: rise ${rise.toFixed(3)} s, fall ${fall.toFixed(3)} s; a hit of 0.5: up to ${peak1.toFixed(3)}, rise ${rise1.toFixed(3)} s, fall ${fall1.toFixed(3)} s; for ${cord.attack} and ${cord.release}`);
  // A gate with no hysteresis, the thing the hysteresis is for: the same dither opens it over and over.
  let naive = 0, up = false;
  for (let s = 0; s < Math.round(13 / DT); s++) { const o = at(s * DT) > cord.threshold; if (o && !up) naive++; up = o; }
  check('a gate that read the line alone would open dozens of times on the same reading (the control)', naive > 40, `${naive} openings`);
  const f = new CordGate(), follow = { source: 'bands', feature: 'band2', setting: 'areaPour', area: 0, depth: 1 };
  let worst = 0;
  for (let s = 0; s < 600; s++) worst = Math.max(worst, Math.abs(f.step(at(s * DT), DT, follow) - at(s * DT)));
  check('a cord with no threshold, attack or release follows its reading exactly, as every cord before', worst === 0, `worst ${worst}`);

  /*
    A hit that grows after the gate opens (a kick's swell, a band rising
    through a fill) opens it further: the height is the most the reading
    reached while open, not what it was on the line. A burst from 0.5 to 0.9
    over half a second: the envelope must end near 0.9, where a gate that
    kept the opening height would sit at 0.5 (the review of #454: with the
    tracking taken out, the flat bursts above all still passed).
  */
  const grow = new CordGate();
  let grown = 0;
  for (let s = 0; s < Math.round(0.5 / DT); s++) grown = grow.step(0.5 + 0.4 * (s * DT) / 0.5, DT, cord);
  check('a hit that grows after the gate opens opens it further', grown >= 0.85, `a burst rising 0.5 → 0.9 ends at ${grown.toFixed(3)}`);

  // Two cords alike keep a gate each, so neither rises at twice its attack.
  const twin = { ...cord, setting: 'areaHeat' };
  const one = new AreaHands(), two = new AreaHands(), areas1 = [{ x: 0.5, y: 0.5, r: 0.1, liquid: 'water', dye: 0, band: 'any' }];
  let a1 = [], a2 = [];
  for (let s = 0; s < 6; s++) { a1 = one.step([twin], areas1, () => 0.9, DT); a2 = two.step([twin, twin], areas1, () => 0.9, DT); }
  check('two cords alike each rise at their own attack, not one gate stepped twice',
    a2.length === 2 && a2.every(a => Math.abs(a.amount - a1[0].amount) < 1e-12),
    `after 6 steps: one cord ${a1[0]?.amount.toFixed(3)}, two alike ${a2.map(a => a.amount.toFixed(3)).join(' and ')}`);
}

// ── 2. The tables ────────────────────────────────────────────────────
{
  const FAST = new Set(['hits', 'bands']);
  const bad = [];
  let cords = 0;
  for (const p of PRESETS) {
    for (const m of p.settings.sceneMappings ?? []) {
      if (m.area === undefined && !String(m.setting).startsWith('area')) continue;
      cords++;
      const areas = PRESET_AREAS[p.id];
      if (!isAreaCord(m)) bad.push(`${p.id}: ${m.setting} on area ${m.area} is not an area cord`);
      if (!areas || !areas[m.area]) bad.push(`${p.id}: area ${m.area}, and the look has ${areas?.length ?? 0}`);
      if (!FAST.has(m.source)) bad.push(`${p.id}: ${m.source} is not a fast reading`);
      if (m.source === 'bands' && !SOURCE_NAMES.includes(m.feature)) bad.push(`${p.id}: bands has no ${m.feature}`);
      if (m.source === 'hits' && !HIT_FEATURES.includes(m.feature)) bad.push(`${p.id}: hits has no ${m.feature}`);
      if (m.threshold !== undefined && !(m.threshold > 0 && m.threshold < 1)) bad.push(`${p.id}: threshold ${m.threshold}`);
      // A cord at depth 0 is skipped (AreaHands.step), so it would ship playing nothing.
      if (!(Number.isFinite(m.depth) && m.depth !== 0)) bad.push(`${p.id}: depth ${m.depth}`);
      for (const k of ['attack', 'release']) if (m[k] !== undefined && !(Number.isFinite(m[k]) && m[k] >= 0)) bad.push(`${p.id}: ${k} ${m[k]}`);
    }
  }
  check('every area cord a look ships aims at an area it has, with an act, on a fast reading it really has',
    bad.length === 0 && cords >= 8, bad.join('; ') || `${cords} cords on ${PRESETS.filter(p => (p.settings.sceneMappings ?? []).some(isAreaCord)).length} looks`);

  /*
    A Bottle cord changes nothing where the pigment already lies; it picks
    what is laid next in its area. So each one a look ships needs something
    there that lays from the bottle: a pour cord on the same area, or the
    music's own hands, which land in an area by its band (areasForBand: the
    visualizer's areaCycle reads AreaHands.picked for the kick's ring, the
    treble's drops and the swell). And it must turn the bottle: quiet, the
    first; loud, another. Jellyfish's band 7 on its treble bell shipped with
    neither reading it (the review of #454).
  */
  const deaf = [];
  let hues = 0;
  for (const p of PRESETS) {
    const all = (p.settings.sceneMappings ?? []).filter(isAreaCord);
    for (const m of all.filter(c => c.setting === 'areaHue')) {
      hues++;
      const areas = PRESET_AREAS[p.id] ?? [], area = areas[m.area];
      if (!area) continue;
      const pour = all.some(c => c.setting === 'areaPour' && c.area === m.area);
      const music = ['bass', 'mid', 'treble'].filter(b => areasForBand(areas, b).includes(area));
      if (!pour && music.length === 0) deaf.push(`${p.id} area ${m.area}: nothing lays from its bottle`);
      const turned = [0.02, 1].map(level => {
        const h = new AreaHands();
        for (let s = 0; s < 120; s++) h.step([m], areas, () => level, DT);
        return [h.picked(m.area, area), h.bottle(m.area, area)];
      });
      if (areaFamily(area).length < 2) deaf.push(`${p.id} area ${m.area}: one bottle`);
      else if (!(turned[0][0] === 0 && turned[1][0] > 0 && turned.every(([a, b]) => a === b))) deaf.push(`${p.id} area ${m.area}: bottles ${JSON.stringify(turned)}`);
    }
  }
  /*
    The music's hands read the bottle in the visualizer, which node cannot
    run: so the source is read. The area's colour for the music (areaCycle)
    and for the automation's pours (areaColor) must go through heldBottle,
    and heldBottle through AreaHands.picked, or the hands above lay from the
    whole family whatever the Bottle cord says.
  */
  const viz = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
  const body = (name) => viz.slice(viz.indexOf(`const ${name} = `), viz.indexOf(`const ${name} = `) + 600).split(/\n  const /)[0];
  const wired = ['areaCycle', 'areaColor'].every(n => viz.includes(`const ${n} = `) && body(n).includes('heldBottle(')) && body('heldBottle').includes('.picked(');
  if (!wired) deaf.push('the visualizer\'s areaCycle or areaColor does not read heldBottle, or heldBottle not AreaHands.picked');
  check('every Bottle cord a look ships has something in its area that lays from the bottle, and turns it',
    deaf.length === 0 && hues >= 1, deaf.join('; ') || `${hues} Bottle cord(s), each read by its area's pours or the music's hands there (areaCycle and areaColor read it)`);

  const looks = ['velvet-underground', 'jellyfish-bloom', 'bass-drop'];
  const shared = [];
  for (const id of looks) {
    const areas = PRESET_AREAS[id] ?? [];
    const n = PRESET_CONTRACTS[id]?.length ?? 0;
    const seen = new Map();
    areas.forEach((a, i) => areaFamily(a).forEach(d => {
      if (d < 0 || d >= n) shared.push(`${id} area ${i}: dye ${d} outside its ${n}`);
      if (seen.has(d)) shared.push(`${id}: dye ${d} in areas ${seen.get(d)} and ${i}`);
      seen.set(d, i);
    }));
    if (!(areas.length >= 3)) shared.push(`${id}: ${areas.length} areas`);
  }
  check('Velvet Underground, Jellyfish Bloom and Bass Drop have areas, each with a family of its own dyes',
    shared.length === 0, shared.join('; ') || looks.map(id => `${id} ${PRESET_AREAS[id].map(a => areaFamily(a).length).join('+')}`).join(', '));

  const old = [{ source: 'room', feature: 'motion', setting: 'turbulenceScale', depth: 0.5 }, { source: 'hits', feature: 'kickHit', setting: 'plateRock', depth: 0.5, layer: 'all' }];
  const area = { source: 'hits', feature: 'kickHit', setting: 'areaStir', area: 1, depth: 0.6, threshold: 0.3, attack: 0.05, release: 0.5 };
  const wrong = [
    { source: 'hits', feature: 'kickHit', setting: 'turbulenceScale', area: 1, depth: 0.6 },
    { source: 'hits', feature: 'kickHit', setting: 'areaStir', depth: 0.6 },
    { source: 'hits', feature: 'kickHit', setting: 'areaStir', area: -1, depth: 0.6 },
  ];
  const out = sanitizePatch({ sceneMappings: [...old, area, ...wrong] }).sceneMappings ?? [];
  check('a saved cord loads as it was; an area cord with its gate loads; a setting with an area, or an act with none, is dropped',
    JSON.stringify(out) === JSON.stringify([...old, area]), `${out.length} of ${old.length + 1 + wrong.length} kept`);

  /*
    The fold and an area: a cord with an area aimed at a real setting (which
    the panel never makes, and a hand-edited save could) must not ride that
    setting over the whole plate, and the same cord with no area must, or the
    context below is dead and the first half proves nothing. An act such as
    Stir here is no key of the settings at all, so the fold skipped it before
    this ever existed; that is why the cord tried here is on Turbulence.
  */
  const features = { bands: new Array(8).fill(0) };
  const ctx = { room: null, film: null, shape: null, sound: { features }, hits: { value: () => 1 }, roomImpact: 0, filmImpact: 0, soundImpact: 1, shapeImpact: 0 };
  const onTurb = { source: 'hits', feature: 'kickHit', setting: 'turbulenceScale', depth: 0.6 };
  const folded = (cords) => {
    const base = { ...DEFAULT_SETTINGS, sceneMappings: cords, turbulenceScale: 0.3 };
    const bay = new PatchBay(base);
    bay.fold(base, ctx, 1, 0);
    return bay.global.turbulenceScale;
  };
  const withArea = folded([{ ...onTurb, area: 1 }, area]), plain = folded([onTurb]);
  check('the patch bay\'s fold rides no setting with a cord aimed at an area (and the same cord with none does)',
    withArea === 0.3 && plain > 0.8 && cordReading(ctx, area, 0) === 1, `Turbulence 0.3 → ${withArea} with an area, → ${plain} with none`);

  // The reading path picks the band by its name: a burst in band 2 reads on band 2 alone.
  features.bands[1] = 0.8;
  const b2 = cordReading(ctx, { source: 'bands', feature: 'band2', setting: 'areaPour', area: 0, depth: 1 }, 0);
  const b7 = cordReading(ctx, { source: 'bands', feature: 'band7', setting: 'areaPour', area: 0, depth: 1 }, 0);
  check('a cord on band 2 hears a burst in band 2, and a cord on band 7 does not', b2 === 0.8 && b7 === 0, `band 2 reads ${b2}, band 7 ${b7}`);
  /*
    An area cord on a dragged band reads through a look fade (the review of
    #511). A fade builds every cord's object again each frame
    (lookFade.ts crossfadePatches, `{ ...m, depth }`), and a dragged band's
    BandRange used to be kept per mapping object, so each frame heard through a
    range made new, which reads 0 on its first read: the cord was silent for
    the whole fade. AreaHands now keeps the range with the cord's gate, keyed
    as the gate is. Ten loud frames in every sixty on [650, 1070] Hz, the cord
    held and then made new each frame: the area's amount must peak alike. The
    control is the old path (a read that is handed no range, on a fresh object
    each frame), which must stay silent, or the line proves nothing.
  */
  {
    const HZ = 43, BINS = 512, FLOOR = -100, DTF = 1 / 60;
    const areas1 = [{ x: 0.5, y: 0.5, r: 0.1, liquid: 'water', dye: 0, band: 'any' }];
    const spec = new Float32Array(BINS);
    const spectrumReading = { bands: new Array(8).fill(0), spectrum: spec, hzPerBin: HZ, floor: FLOOR, silent: false, time: 0 };
    const dragCtx = { ...ctx, sound: { features: spectrumReading } };
    const drag = { source: 'bands', feature: 'band5', band: [650, 1070], setting: 'areaPour', area: 0, depth: 1 };
    const peakOf = (fresh, handsRange) => {
      const hands = new AreaHands();
      let peak = 0;
      for (let f = 0; f < 180; f++) {
        spec.fill(-70);
        if (f % 60 < 10) for (let k = Math.round(650 / HZ); k <= Math.round(1070 / HZ); k++) spec[k] = -20;
        spectrumReading.time = f * DTF;
        const m = fresh ? { ...drag } : drag;
        const acts = hands.step([m], areas1, handsRange ? (c, band) => cordReading(dragCtx, c, 0, band) : (c) => cordReading(dragCtx, c, 0), DTF);
        peak = Math.max(peak, ...acts.map(a => a.amount));
      }
      return peak;
    };
    const held = peakOf(false, true), fresh = peakOf(true, true), old = peakOf(true, false);
    check('an area cord on a dragged band reads alike held and made new every frame, as a look fade makes it (and the old path, handed no range, stays silent)',
      held > 0.9 && Math.abs(fresh - held) < 0.02 && old < 0.1, `peak ${held.toFixed(3)} held, ${fresh.toFixed(3)} new each frame; old path ${old.toFixed(3)}`);
  }
  check('the patch bay offers the hand\'s four acts', AREA_TARGETS.map(t => t.key).join() === 'areaHeat,areaStir,areaPour,areaHue');
}

// ── 3, 4. The lab ────────────────────────────────────────────────────
if (!process.argv.includes('--node')) {
  const { openLab } = await import('./lab.mjs');
  const { page, close } = await openLab({ entry: 'scripts/areacords-entry.ts' });
  try {
    const L = 128;
    const velvet = PRESETS.find(p => p.id === 'velvet-underground').settings;
    const over = { thinGap: 1, gapThickness: velvet.gapThickness ?? 0.45, dt: velvet.globalSpeed * 0.2, advection: velvet.advection, damping: velvet.damping };
    const areas = PRESET_AREAS['velvet-underground'];
    const contract = PRESET_CONTRACTS['velvet-underground'];
    const groove = (feature, seconds, period = 0.5, dur = 0.18, level = 0.9) =>
      Array.from({ length: Math.floor(seconds / period) }, (_, i) => ({ feature, t0: 0.2 + i * period, dur, level }));
    const run = (cords, bursts, extra = {}) => page.evaluate((cfg) => window.areas.run(cfg),
      { L, seconds: 4, areas, contract, cords, bursts, over, every: 12, pools: true, ...extra });

    // The solver's velocity times this is cells a step, the paddle's own unit (as `npm run fingerflow` reads it).
    const disp = over.dt * over.advection * (L - 2) / L;
    const t0 = Date.now();
    const control = await run([], [...groove('band2', 4), ...groove('band7', 4, 0.25, 0.08)]);
    const cell = (i) => ({ x: (i % L + 0.5) / L, y: (Math.floor(i / L) + 0.5) / L });
    const inArea = (a, p) => Math.hypot(p.x - a.x, p.y - a.y) < a.r;
    const outside = (p) => Math.hypot(p.x - 0.5, p.y - 0.5) < 0.45 && areas.every(a => Math.hypot(p.x - a.x, p.y - a.y) > 1.25 * a.r);
    /** Mean change per cell against the control, over the cells `where` picks: dye (all four channels), speed and temperature. */
    const change = (got, where) => {
      let d = 0, v = 0, T = 0, n = 0, a = 0, la = 0, lt = 0, pd = 0, sw = 0;
      for (let i = 0; i < L * L; i++) {
        if (!where(cell(i))) continue;
        for (let c = 0; c < 4; c++) d += Math.abs(got.dye[i * 4 + c] - control.dye[i * 4 + c]);
        a += got.dye[i * 4 + 3] - control.dye[i * 4 + 3];
        v += Math.abs(got.speed[i] - control.speed[i]);
        T += Math.abs(got.temp[i] - control.temp[i]);
        la += got.laidDye[i]; lt += got.heatDry[i]; pd += got.paddleDry[i]; sw += got.swept[i];
        n++;
      }
      return { dye: d / n, speed: v / n, cells: v / n * disp * L, temp: T / n, density: a / n, laid: la / n, heatLaid: lt / n, paddle: pd / n, swept: sw / n };
    };
    const fmt = (c) => `dye ${c.dye.toExponential(2)}, flow ${c.speed.toExponential(2)}, heat ${c.temp.toExponential(2)}`;
    const ratio = (a, b) => a / Math.max(b, 1e-12);

    // 3a. One band's cords on the soap well.
    const well = areas[1];
    const onWell = [
      { source: 'bands', feature: 'band2', setting: 'areaPour', area: 1, depth: 0.8, threshold: 0.4, attack: 0.02, release: 0.3 },
      { source: 'bands', feature: 'band2', setting: 'areaStir', area: 1, depth: 0.8, threshold: 0.4, attack: 0.05, release: 0.4 },
      { source: 'bands', feature: 'band2', setting: 'areaHeat', area: 1, depth: 0.8, threshold: 0.4, attack: 0.02, release: 0.8 },
    ];
    const one = await run(onWell, groove('band2', 4));
    const inW = change(one, p => inArea(well, p)), out = change(one, outside);
    const bursts = groove('band2', 4).length;
    console.log(`  one band on the soap well: inside ${fmt(inW)}; outside ${fmt(out)}; gates opened ${one.fires.join('/')} for ${bursts} bursts`);
    /*
      The floors are the cords' own arithmetic, not "more than nothing": what
      the sink laid in the well, kept with no flow and no cooling (the entry's
      laidDye and heatDry). The plate must still hold at least half of it there:
      a pour or a heat laid at a hundredth of its size, or into the wrong
      channel, fails this whatever the ratio to the empty outside.
    */
    check('a band\'s cord on one area changes the dye there at least 5x what it changes outside every area, and keeps half of what it poured there',
      ratio(inW.dye, out.dye) >= 5 && inW.density >= 0.5 * inW.laid && inW.laid > 0.1,
      `${ratio(inW.dye, out.dye).toFixed(1)}x; ${inW.density.toFixed(3)} of density there of ${inW.laid.toFixed(3)} poured`);
    /*
      The flow's floor is the paddle's own arithmetic too (the review of #454:
      a paddle cut to a cell across moved the well 15x less and the ratio
      alone still passed, the outside having fallen with it). Two halves, in
      cells a step, the paddle's unit.
      The grip: what the paddle laid is the speed the liquid under it is held
      to (χ·|U|, from the entry's own copy of the solid), meaned over the
      well, and the liquid there must carry at least half of it, the liquid
      round a moving solid going with it as well as the liquid under it.
      The stir: a hand stirring a pool moves the pool, not a point in it. The
      paddle's own speed round its circle is the orbit (AREA_PADDLE_ORBIT of
      the area) times its turn (AREA_STIR_TURN_S a turn at full) times how
      open its cord was, meaned over the run from the cord's envelope; the
      well's mean flow must be a tenth of that, as a tenth of the pool going
      at the paddle's speed would be. Not from the paddle's size, which is
      what this holds: a paddle 0.3 of the area across covers about a tenth
      of it by itself, and one of a cell, a hundredth.
    */
    const stirEnv = one.trace.reduce((a, s) => a + Math.abs(s.env[1] ?? 0), 0) / Math.max(1, one.trace.length);
    const paddleSpeed = AREA_PADDLE_ORBIT * well.r * L * (2 * Math.PI / AREA_STIR_TURN_S) * stirEnv / 60;
    check('and the flow (the paddle): the well carries half the speed the paddle laid there, and moves at a tenth of the paddle\'s own',
      ratio(inW.speed, out.speed) >= 5 && inW.paddle > 0 && inW.cells >= 0.5 * inW.paddle && inW.cells >= 0.1 * paddleSpeed,
      `${ratio(inW.speed, out.speed).toFixed(1)}x; ${inW.cells.toFixed(3)} cells a step in the well, on ${inW.paddle.toFixed(3)} laid and a paddle going ${paddleSpeed.toFixed(3)} (swept ${(100 * inW.swept).toFixed(0)}% of the well)`);
    check('and the heat, at least half of what was laid there (what cooling and spreading may take in four seconds)',
      ratio(inW.temp, out.temp) >= 5 && inW.temp >= 0.5 * inW.heatLaid && inW.heatLaid > 0.1,
      `${ratio(inW.temp, out.temp).toFixed(1)}x, ${inW.temp.toFixed(3)} K inside on the run's mean of ${inW.heatLaid.toFixed(3)} K laid`);
    check('each gate opened once a burst in the lab', one.fires.length === onWell.length && one.fires.every(f => f === bursts), `${one.fires.join('/')} for ${bursts}`);

    // 3b. Two areas on two bands.
    const syrup = areas[2];
    const two = [
      ...onWell.slice(0, 2),
      { source: 'bands', feature: 'band7', setting: 'areaPour', area: 2, depth: 0.8, threshold: 0.4, attack: 0.02, release: 0.3 },
      { source: 'bands', feature: 'band7', setting: 'areaStir', area: 2, depth: 0.8, threshold: 0.4, attack: 0.05, release: 0.4 },
    ];
    const bass = await run(two, groove('band2', 4));
    const hats = await run(two, groove('band7', 4));
    const b1 = change(bass, p => inArea(well, p)), b2 = change(bass, p => inArea(syrup, p));
    const h1 = change(hats, p => inArea(well, p)), h2 = change(hats, p => inArea(syrup, p));
    console.log(`  band 2 played: soap well ${fmt(b1)}; syrup ${fmt(b2)}`);
    console.log(`  band 7 played: soap well ${fmt(h1)}; syrup ${fmt(h2)}`);
    check('two areas on two bands: band 2 works the well and leaves the syrup (dye and flow, 5x)',
      ratio(b1.dye, b2.dye) >= 5 && ratio(b1.speed, b2.speed) >= 5 && b1.density >= 0.5 * b1.laid && b1.speed >= 0.5 * inW.speed,
      `${ratio(b1.dye, b2.dye).toFixed(1)}x dye, ${ratio(b1.speed, b2.speed).toFixed(1)}x flow`);
    check('and band 7 works the syrup and leaves the well',
      ratio(h2.dye, h1.dye) >= 5 && ratio(h2.speed, h1.speed) >= 5 && h2.density >= 0.5 * h2.laid && h2.speed >= 0.5 * inW.speed,
      `${ratio(h2.dye, h1.dye).toFixed(1)}x dye, ${ratio(h2.speed, h1.speed).toFixed(1)}x flow`);

    // 4. The lit places, on each rebuilt look, by its own cords.
    /** The lit places, and which place (0 = none) each cell is in. */
    const places = (got, Lsize) => {
      const seen = new Int32Array(Lsize * Lsize);
      let places = 0;
      for (let s = 0; s < Lsize * Lsize; s++) {
        if (seen[s] || got.dye[s * 4 + 3] <= 0.3) continue;
        let size = 0;
        const id = s + 1, cells = [s];
        const stack = [s]; seen[s] = id;
        while (stack.length) {
          const i = stack.pop(); size++; cells.push(i);
          const x = i % Lsize, y = Math.floor(i / Lsize);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy, n = nx + ny * Lsize;
            if (nx < 0 || ny < 0 || nx >= Lsize || ny >= Lsize || seen[n] || got.dye[n * 4 + 3] <= 0.3) continue;
            seen[n] = id; stack.push(n);
          }
        }
        if (size > 0.01 * Lsize * Lsize) places++;
        else for (const i of cells) seen[i] = -1;
      }
      return { count: places, at: (x, y) => Math.max(0, seen[Math.floor(x * Lsize) + Math.floor(y * Lsize) * Lsize]) };
    };
    const song = [...groove('kickHit', 4, 0.5, 0.15), ...groove('snareHit', 4, 1, 0.15).map(b => ({ ...b, t0: b.t0 + 0.25 })),
      ...groove('hatsHit', 4, 0.25, 0.06, 0.7), ...groove('band4', 4, 2, 1.2, 0.7), ...groove('band1', 4, 2, 0.8, 0.8), ...groove('band7', 4, 0.25, 0.06, 0.8)];
    const rows = [];
    for (const id of ['velvet-underground', 'jellyfish-bloom', 'bass-drop']) {
      const look = PRESETS.find(p => p.id === id).settings;
      const cords = (look.sceneMappings ?? []).filter(isAreaCord);
      const pourAreas = new Set(cords.filter(m => m.setting === 'areaPour').map(m => m.area));
      const lookOver = { ...over, dt: look.globalSpeed * 0.2, advection: look.advection, damping: look.damping };
      const cfg = { L, seconds: 4, areas: PRESET_AREAS[id], contract: PRESET_CONTRACTS[id], cords, bursts: song, over: lookOver, every: 60, pools: false };
      const after = places(await page.evaluate((c) => window.areas.run(c), cfg), L);
      const middle = places(await page.evaluate((c) => window.areas.run(c), { ...cfg, middle: true }), L).count;
      const inAreas = after.count;
      // Where: each pouring area's middle in a lit place of its own.
      const ids = [...pourAreas].map(i => after.at(PRESET_AREAS[id][i].x, PRESET_AREAS[id][i].y));
      const placed = ids.every(v => v > 0) && new Set(ids).size === ids.length;
      rows.push({ id, inAreas, middle, want: pourAreas.size, placed });
      console.log(`  ${id}: lit places ${middle} with its cords' acts in the middle (before), ${inAreas} in its areas (after); ${pourAreas.size} of its areas pour`);
    }
    /*
      Bass Drop's cords pour nothing (a snare's paddle and the sub's heat):
      its wells take the music's own hands, the kicks in turn, which live in
      the visualizer's loop and not in the lab. That half is 25e's Mac
      measure (PLAN 25e), so it is printed here and not held.
    */
    const held = rows.filter(r => r.want >= 2);
    check('each rebuilt look whose cords pour in two or more areas lights a place on each of them, each its own, where the middle lit one at most',
      held.length >= 1 && held.every(r => r.inAreas >= r.want && r.placed && r.middle <= 1),
      rows.map(r => `${r.id} ${r.middle} → ${r.inAreas}`).join(', '));
    console.log(`  (lab ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } finally {
    await close();
  }
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
