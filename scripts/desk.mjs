#!/usr/bin/env node
/**
 * Can a show actually be played from this thing?
 *
 *   npm run desk
 *
 * The gate that matters is the first one, and it is about the audience rather
 * than the operator: **changing the look must never cut the plate to black.**
 *
 * `applyPreset` clears every layer and reseeds. While you are building a look
 * that is exactly right — you want the new preset on clean glass. At 11pm,
 * with the plate on a wall behind you, it is a hard cut through near-black in
 * front of a room. So the desk's Go adopts the new dyes without touching the
 * plate and walks the settings across instead.
 *
 * That is a claim about brightness over time, which is measurable. This drives
 * a real fade through the real `blendLooks` and watches what a plate lit by
 * those settings would do — and drives the clearing path the same way as a
 * control. If the control does not fail, the check is measuring nothing.
 *
 * The measure is *sag below both ends*, not darkness. Arriving somewhere
 * dimmer is allowed — Lumia is a nearly clear plate and the closeup shows half
 * of one, both on purpose. What must never happen is the middle of a fade
 * being darker than either end, which is the sag a room reads as a flicker.
 *
 * `lookFade.ts` is pure, so all of this runs here with no DOM and no GPU.
 */

import { PRESETS } from '../src/presets.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { controlKindOf, apc40Mk2Map, launchControlXlMap, nanoKontrol2Map, apcMiniMk2Map } from '../src/lib/midi.ts';
import { KNOB_SWEEP, onRing, ringTravel } from '../src/lib/knobDrag.ts';
import { blendLooks, targetLook, evolvedLook, STRUCTURE, ease, LOOK_BASE, RIG_KEYS, lookOf, lookFadeStep } from '../src/lib/lookFade.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const look = (id) => {
  const p = PRESETS.find(x => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return targetLook(DEFAULT_SETTINGS, p.settings);
};

/**
 * What the wall shows, roughly: how much dye is on the plate and how hard it
 * is lit. Not the renderer — a stand-in that moves with the things a fade
 * actually changes, so a settings path that dims can be caught without one.
 *
 * Deliberately only the three things that govern how bright the wall is. An
 * earlier version folded in the closeup, on the reasoning that a macro frame
 * shows less plate; that made every fade into a closeup preset look like a
 * 44% dip, when what had actually changed was the framing. A measure that
 * calls a change of subject a loss of light is measuring the wrong thing.
 */
const brightness = (s, dye) => dye * (s.dimmer ?? 1) * (s.saturationBoost ?? 1);

/**
 * Drive a look change and report the stage's brightness each frame.
 *
 * `clearing` is the old path: the plate is wiped, so the dye on it collapses
 * and grows back as the automation re-seeds it. `fading` is the desk's: the
 * dye is never touched, so it stays where it was while the settings travel.
 */
function drive({ from, to, seconds, clearing }) {
  const FPS = 60;
  const frames = Math.max(1, Math.round(seconds * FPS));
  // The first sample is the stage *before* the change is asked for. Both paths
  // need it or they are not comparable: the clearing path's wipe lands on the
  // very first frame after it, so measured from there it looks like a change
  // that merely starts dark and recovers.
  const out = [brightness(from, 1)];
  let dye = 1;                        // the plate as it stands, normalised
  for (let f = 0; f <= frames; f++) {
    const t = f / frames;
    if (clearing) {
      // Wiped at once, then re-seeded: the plate refills over a few seconds.
      dye = f === 0 ? 0.02 : Math.min(1, dye + 0.012);
      out.push(brightness(to, dye));
    } else {
      out.push(brightness(blendLooks(from, to, t), dye));
    }
  }
  return out;
}

// ── 1. The easing is an easing ───────────────────────────────────────
{
  check('a fade starts where it is and ends where it is going',
    ease(0) === 0 && ease(1) === 1);
  check('and does not overshoot in between',
    [0.1, 0.25, 0.5, 0.75, 0.9].every(t => ease(t) >= 0 && ease(t) <= 1));
  const mid = ease(0.5);
  check('and is symmetric about the middle', Math.abs(mid - 0.5) < 1e-9, `${mid}`);
}

// ── 2. A number travels; a blend mode cannot ─────────────────────────
{
  const from = look('classic');
  const to = targetLook(from, PRESETS.find(p => p.id === 'cyberpunk').settings);
  const half = blendLooks(from, to, 0.5);
  const lo = Math.min(from.globalSpeed, to.globalSpeed), hi = Math.max(from.globalSpeed, to.globalSpeed);
  check('a number is somewhere between the two looks',
    half.globalSpeed >= lo && half.globalSpeed <= hi,
    `${from.globalSpeed} → ${half.globalSpeed.toFixed(4)} → ${to.globalSpeed}`);
  check('and arrives exactly', blendLooks(from, to, 1).globalSpeed === to.globalSpeed);
  check('a blend mode is one of the two, never a third',
    [from.blendMode, to.blendMode].includes(half.blendMode), half.blendMode);
  check('the machine keeps its own solver grid',
    blendLooks({ ...from, simResolution: 'auto' }, { ...to, simResolution: 1024 }, 1).simResolution === 'auto');
}

// ── 3. A preset that says nothing gets the base, not the last look ───
{
  const macro = { ...DEFAULT_SETTINGS, macroMode: true, beads: 0.8, fingering: 0.7, camera: 1 };
  const plain = targetLook(macro, PRESETS.find(p => p.id === 'classic').settings);
  check('a macro look does not leave the next one zoomed in', plain.macroMode === false);
  check('and the Fillmore rig does not leak into a plain plate',
    plain.beads === LOOK_BASE.beads && plain.fingering === LOOK_BASE.fingering && plain.camera === LOOK_BASE.camera,
    `beads ${plain.beads}, fingering ${plain.fingering}, camera ${plain.camera}`);
}

// ── 3b. A look is the same look whatever was playing before it ──────
//
// Looks used to be a few changes over whatever was on the plate, so a look's
// dye budget, exposure, lacing or Lumia were the last look's, and the same
// look came out differently on different nights. Every setting now belongs
// either to the room or to the look, and a look is complete.
{
  const unclassified = Object.keys(DEFAULT_SETTINGS).filter(k => !RIG_KEYS.has(k) && !(k in LOOK_BASE));
  check('every setting belongs either to the room or to the look',
    unclassified.length === 0, unclassified.join(', '));
  const both = Object.keys(LOOK_BASE).filter(k => RIG_KEYS.has(k));
  check('and none to both', both.length === 0, both.join(', '));

  const leaks = [];
  for (const a of PRESETS) {
    const afterA = targetLook(DEFAULT_SETTINGS, a.settings);
    for (const b of PRESETS) {
      const viaA = targetLook(afterA, b.settings);
      const fresh = targetLook(DEFAULT_SETTINGS, b.settings);
      for (const k of Object.keys(LOOK_BASE)) {
        if (JSON.stringify(viaA[k]) !== JSON.stringify(fresh[k])) leaks.push(`${b.id}.${k} after ${a.id}`);
      }
    }
  }
  check(`every look comes out the same whatever was playing before it (${PRESETS.length}×${PRESETS.length} pairs)`,
    leaks.length === 0, `${leaks.length} leaks: ${leaks.slice(0, 4).join(', ')}`);
  // The control: the old way, a look laid over whatever was playing.
  let oldLeaks = 0;
  for (const a of PRESETS) {
    const afterA = { ...DEFAULT_SETTINGS, ...a.settings };
    for (const b of PRESETS) {
      const viaA = { ...afterA, ...b.settings }, fresh = { ...DEFAULT_SETTINGS, ...b.settings };
      for (const k of Object.keys(LOOK_BASE)) if (JSON.stringify(viaA[k]) !== JSON.stringify(fresh[k])) oldLeaks++;
    }
  }
  console.log(`     the old way, a look laid over the last one: ${oldLeaks} settings depended on what came before`);
  check('and the old way really did leak', oldLeaks > 0, 'if this passes, the check above is measuring nothing');

  const room = { ...DEFAULT_SETTINGS, sensitivity: 0.9, bassBoost: 2, dimmer: 0.3, markX: 0.2, filmMix: 0.1, scenePeople: false, simResolution: 256 };
  const moved = [];
  for (const p of PRESETS) {
    const t = targetLook(room, p.settings);
    for (const k of RIG_KEYS) if (JSON.stringify(t[k]) !== JSON.stringify(room[k])) moved.push(`${p.id}.${k}`);
  }
  check('and never moves the room: the microphone, the dimmer, the logo, the grid',
    moved.length === 0, moved.slice(0, 4).join(', '));
  const says = PRESETS.flatMap(p => Object.keys(p.settings).filter(k => RIG_KEYS.has(k)).map(k => `${p.id}.${k}`));
  check('no built-in look says anything about the room', says.length === 0, says.join(', '));

  // A saved look from an older build does not mention what was added since.
  const saved = { globalSpeed: 0.05, lacing: 0.4 };
  const worn = { ...DEFAULT_SETTINGS, exposure: 0.9, lumia: 0.8, dyeBudget: 0.2, beads: 0.7 };
  const opened = targetLook(worn, saved);
  const stale = Object.keys(LOOK_BASE).filter(k => !(k in saved) && JSON.stringify(opened[k]) !== JSON.stringify(LOOK_BASE[k]));
  check('a look that does not mention a setting gets the base, not the last look\'s',
    stale.length === 0 && opened.globalSpeed === 0.05 && opened.lacing === 0.4, stale.slice(0, 4).join(', '));

  // The sequencer's stages aim at the same thing.
  const stage = lookOf(PRESETS.find(p => p.id === 'jellyfish-bloom').settings);
  const short = Object.keys(LOOK_BASE).filter(k => !(k in stage));
  check('a sequencer stage that names a look aims at all of it', short.length === 0, short.join(', '));
  const t1 = lookOf({}), t2 = lookOf({});
  t1.audioMappings.velocity = 'none';
  check('and a look edited in place cannot write through into the next',
    t2.audioMappings.velocity === LOOK_BASE.audioMappings.velocity && DEFAULT_SETTINGS.audioMappings.velocity !== 'none');
}

// ── 4. The gate: a look change never darkens the stage ───────────────
//
// Across every pair of presets, not one hand-picked pair — a fade that holds
// up between two calm looks and collapses going into Lumia is not a fade.
{
  const PAIRS = [];
  for (const a of PRESETS) for (const b of PRESETS) if (a.id !== b.id) PAIRS.push([a.id, b.id]);

  const worst = { ratio: Infinity, pair: null };
  for (const [a, b] of PAIRS) {
    const from = look(a);
    const to = targetLook(from, PRESETS.find(p => p.id === b).settings);
    const trace = drive({ from, to, seconds: 2, clearing: false });
    // Against the *darker end*, not the start. Some looks are deliberately
    // dimmer than others and the closeup shows half a plate by design —
    // arriving somewhere darker is the operator's choice. What must not
    // happen is the fade dipping below both ends on the way, which is the
    // sag that reads as a flicker.
    const floor = Math.min(trace[0], trace[trace.length - 1]);
    const dip = Math.min(...trace) / floor;
    if (dip < worst.ratio) { worst.ratio = dip; worst.pair = `${a} → ${b}`; }
  }
  console.log(`     fading: over ${PAIRS.length} preset pairs, the deepest sag below both ends is to ${(worst.ratio * 100).toFixed(1)}% (${worst.pair})`);

  // The control: the same change through the clearing path.
  const from = look('classic');
  const to = targetLook(from, PRESETS.find(p => p.id === 'cyberpunk').settings);
  const cut = drive({ from, to, seconds: 2, clearing: true });
  const cutDip = Math.min(...cut) / Math.min(cut[0], cut[cut.length - 1]);
  console.log(`     clearing: the same change wipes the plate to ${(cutDip * 100).toFixed(0)}% of where it started`);

  check('a faded look change never sags below where it starts or lands',
    worst.ratio >= 0.995, `worst ${(worst.ratio * 100).toFixed(1)}% on ${worst.pair}`);
  check('and the clearing path really does cut to black',
    cutDip < 0.1, `${(cutDip * 100).toFixed(0)}% — if this passes, the check above is measuring nothing`);
}

// ── 5. Nothing is dropped on the way ─────────────────────────────────
{
  const from = look('classic');
  const to = targetLook(from, PRESETS.find(p => p.id === 'poster-1969').settings);
  const missing = Object.keys(to).filter(k => !(k in blendLooks(from, to, 0.5)));
  check('every setting survives a fade', missing.length === 0, missing.join(', '));
  const end = blendLooks(from, to, 1);
  const wrong = Object.keys(to).filter(k => k !== 'simResolution' && JSON.stringify(end[k]) !== JSON.stringify(to[k]));
  check('and the look it lands on is the one that was cued', wrong.length === 0, wrong.slice(0, 6).join(', '));
}

// ── A look change nobody asked for ──────────────────────────────────
//
// A new song changing the look is not the same act as somebody pressing Go.
// Go is a decision — you meant that look, all of it. A song ending is not:
// the plate in front of the room is the one you set up, and it should still
// be that plate afterwards.
//
// The settings with no halfway are what make the difference. A number can
// drift and nobody sees the moment it moved; a second layer cannot arrive
// gradually, so `blendLooks` switches it at a single point in the fade. An
// unattended change that carried those put an LED wheel on the plate
// mid-song, or took one off, or folded the picture into a kaleidoscope —
// and fading cannot soften any of it, because there is nothing between
// `false` and `true` to fade through.
{
  const keys = [...STRUCTURE];
  check('the structure a song change holds is made of real settings',
    keys.every(k => k in DEFAULT_SETTINGS), keys.filter(k => !(k in DEFAULT_SETTINGS)).join(', ') || keys.join(', '));
  check('and none of it belongs to the room instead',
    keys.every(k => !RIG_KEYS.has(k)), keys.filter(k => RIG_KEYS.has(k)).join(', ') || 'structure and rig are different things');

  /*
    Every look against every other, which is 992 pairs and costs nothing —
    and it has to be every pair, because the question is whether *any* two
    looks differ in a structural setting, and most pairs do not.
  */
  let held = 0, drifted = 0;
  const broke = [];
  const flat = [];
  for (const a of PRESETS) {
    const from = targetLook(DEFAULT_SETTINGS, a.settings);
    for (const b of PRESETS) {
      if (a.id === b.id) continue;
      const to = evolvedLook(from, b.settings);
      // 1. The structure is this plate's, at both ends and everywhere between.
      for (const k of keys) {
        if (JSON.stringify(to[k]) !== JSON.stringify(from[k])) { broke.push(`${a.id}→${b.id}: ${k}`); continue; }
        held++;
        for (const t of [0.25, 0.49, 0.5, 0.51, 0.75]) {
          const mid = blendLooks(from, to, t);
          if (JSON.stringify(mid[k]) !== JSON.stringify(from[k])) broke.push(`${a.id}→${b.id}: ${k} at t=${t}`);
        }
      }
      // 2. But the look still travels: the character has to arrive.
      if (typeof b.settings.globalSpeed === 'number' && b.settings.globalSpeed !== from.globalSpeed) {
        if (to.globalSpeed === b.settings.globalSpeed) drifted++; else flat.push(`${a.id}→${b.id}`);
      }
    }
  }
  check('a song change never moves one, at either end or halfway through the fade',
    broke.length === 0, broke.length ? `${broke.length} moved, e.g. ${broke.slice(0, 4).join('; ')}`
      : `${held} held across ${PRESETS.length * (PRESETS.length - 1)} pairs, checked at five points in the fade`);
  check('but the look it becomes is still the look it was going to be',
    flat.length === 0 && drifted > 0, flat.length ? `${flat.length} never arrived` : `${drifted} pairs arrive on the new speed`);

  // 3. And the difference is real: pressing Go still takes the whole thing,
  //    or this check is measuring a distinction that does not exist.
  const wheel = PRESETS.find(p => p.settings.ledPlatform === true);
  const bare = PRESETS.find(p => p.settings.ledPlatform === false);
  if (wheel && bare) {
    const from = targetLook(DEFAULT_SETTINGS, bare.settings);
    check('pressing Go still takes the structure with it',
      targetLook(from, wheel.settings).ledPlatform === true && evolvedLook(from, wheel.settings).ledPlatform === false,
      `${bare.id} → ${wheel.id}: Go brings the wheel, a song change does not`);
  } else {
    check('pressing Go still takes the structure with it', false, 'no preset pair to compare');
  }
}

// ── A control drawn as the hardware it is learned to (PLAN.md 8d) ────────
//
// The desk draws a CC on a fader as a slider and one on a knob as a knob. A
// binding only says absolute or relative, so before profiles every absolute
// knob (the APC40's sixteen, the Launch Control XL's twenty-four) drew as a
// fader. The control is a board this does not know, whose absolute CCs must
// stay faders, and an endless encoder on it, which must still be a knob.
{
  const apc = apc40Mk2Map([]);
  const kinds = (map, keys, port) => keys.map(k => controlKindOf(map, k, port));
  const apcKnobs = kinds(apc, ['lightPlay', 'bloom', 'beatSqueeze', 'macroSync', 'granulation']);
  const apcFaders = kinds(apc, ['audioImpact', 'saturationBoost', 'dimmer', 'sharpness']);
  check('the APC40 map\'s device and track knobs, and its cue encoder, draw as knobs', apcKnobs.every(k => k === 'encoder'), apcKnobs.join(' '));
  check('and its track faders, master and crossfader draw as sliders', apcFaders.every(k => k === 'fader'), apcFaders.join(' '));
  const lcxl = kinds(launchControlXlMap(), ['lightPlay', 'bloom', 'lumia', 'dimmer', 'bubbles']);
  check('the Launch Control XL\'s three rows of knobs are knobs, its faders sliders',
    lcxl.slice(0, 3).every(k => k === 'encoder') && lcxl.slice(3).every(k => k === 'fader'), lcxl.join(' '));
  const nano = kinds(nanoKontrol2Map(), ['lightPlay', 'camera', 'audioImpact']);
  check('the nanoKONTROL2\'s knobs are knobs, its faders sliders', nano[0] === 'encoder' && nano[1] === 'encoder' && nano[2] === 'fader', nano.join(' '));
  check('the APC mini\'s faders are sliders', kinds(apcMiniMk2Map([]), ['audioImpact', 'camera']).every(k => k === 'fader'));
  // A map with no device name (made from scratch) takes the board from the port it plays from.
  const bare = { ...apc, device: undefined, name: 'Mine' };
  check('a map with no device takes its board from the port', controlKindOf(bare, 'lightPlay', 'APC40 mkII') === 'encoder' && controlKindOf(bare, 'lightPlay', null) === 'fader');
  // The control: an unknown board. Absolute CC 16 is a fader there; a relative one is a knob.
  const unknown = { ...apc, device: 'Some Box', bindings: [
    { id: 'a', source: { kind: 'cc', channel: 0, number: 16 }, target: { kind: 'setting', key: 'lightPlay', min: 0, max: 1 }, mode: 'absolute' },
    { id: 'b', source: { kind: 'cc', channel: 0, number: 17 }, target: { kind: 'setting', key: 'bloom', min: 0, max: 1 }, mode: 'relative' },
  ] };
  check('on a board it does not know, an absolute CC stays a slider and an endless encoder is a knob',
    controlKindOf(unknown, 'lightPlay', 'Some Box') === 'fader' && controlKindOf(unknown, 'bloom', 'Some Box') === 'encoder');
  check('a setting learned to nothing has no kind', controlKindOf(apc, 'vorticityConfinement', 'APC40 mkII') === null);
}

// ── A knob turned round its ring (PLAN.md 8c) ────────────────────────────
//
// On the cap a knob is a vertical drag; on the ring it follows the hand. The
// arithmetic: a quarter turn clockwise is a third of the 270° sweep, the
// other way is the same back, a step across the gap at the bottom is the
// short way round (not a whole turn), and a step at the centre is nothing.
{
  const r = 16;
  const at = (deg) => [Math.cos(deg * Math.PI / 180) * r, Math.sin(deg * Math.PI / 180) * r];
  let t = 0;
  for (let d = 180; d < 270; d += 5) t += ringTravel(at(d), at(d + 5));
  check('a quarter turn clockwise round the ring is a third of the sweep', Math.abs(t - (Math.PI / 2) / KNOB_SWEEP) < 1e-9, t.toFixed(4));
  check('the same turn back is the same travel down', Math.abs(ringTravel(at(270), at(180)) + t) < 1e-9);
  const gap = ringTravel(at(95), at(85));
  check('a step across the bottom is the short way round', Math.abs(gap - (-10 * Math.PI / 180) / KNOB_SWEEP) < 1e-9, gap.toFixed(4));
  check('a step at the centre turns nothing', ringTravel([1, 0], [0, 1]) === 0);
  check('a hold on the ring is the ring, on the cap the cap', onRing(15, 0, 20) && !onRing(8, 6, 20));
}

// ── A look change that does not jump ─────────────────────────────────────
//
// The owner, 2026-10-19: "transitions between presets are also a little jumpy
// here and there". `blendLooks` travels every number and colour, but a patch
// list cannot travel by being switched, and the ferrofluid ring is swapped in
// one frame by the handoff while its amount was mid-blend. This fades every
// ordered pair of looks through the same step the App's timer lays down and
// reads the biggest single tick of each, so a jump is a number.
//
// Control first: the same measure on a list that is switched at the middle (what
// the fade used to do) must read as a jump, or a low number below means nothing.
{
  const N = 30;                     // the shortest fade the desk offers, one second at 33 ms: the steepest ticks
  const patchId = (m) => `${m.source ?? 'room'}|${m.feature}|${m.setting}|${m.layer ?? 'all'}`;
  const depths = (list) => {
    const d = new Map();
    for (const m of list ?? []) d.set(patchId(m), (d.get(patchId(m)) ?? 0) + (m.depth || 0));
    return d;
  };
  /** The biggest depth any one patch moves in one tick. */
  const biggestStep = (series) => {
    let worst = 0;
    for (let i = 1; i < series.length; i++) {
      const a = depths(series[i - 1]), b = depths(series[i]);
      for (const key of new Set([...a.keys(), ...b.keys()])) worst = Math.max(worst, Math.abs((b.get(key) ?? 0) - (a.get(key) ?? 0)));
    }
    return worst;
  };
  const ticks = Array.from({ length: N + 1 }, (_, i) => i / N);
  const goStep = lookFadeStep(false, true);
  const backStep = lookFadeStep(true, true);     // a Back lays the ring through the same handoff
  const plainStep = lookFadeStep(false);
  /** A step's numbers must be numbers: a NaN compares false against every bar below and reads as a pass. */
  const finite = (v, what) => { if (!Number.isFinite(v)) throw new Error(`${what} read ${v}, not a number`); return v; };

  let patchWorst = 0, patchAt = '', switched = 0, ringNear = 0, ringAt = '', plainNear = 0, plainAt = '';
  let pairs = 0, endsExact = true, evolveLinear = true, peak = 0;
  for (const a of PRESETS) {
    const from = targetLook(DEFAULT_SETTINGS, a.settings);
    for (const b of PRESETS) {
      if (a.id === b.id) continue;
      pairs++;
      const to = targetLook(from, b.settings);
      const go = ticks.map(t => goStep(from, to, t, from));
      for (const s of go) if (!Array.isArray(s.sceneMappings)) throw new Error(`${a.id} → ${b.id}: a step's patch list is ${typeof s.sceneMappings}, not a list`);
      for (const s of go) for (const m of s.sceneMappings) finite(m.depth, `a patch depth on ${a.id} → ${b.id}`);
      const w = biggestStep(go.map(s => s.sceneMappings));
      if (w > patchWorst) { patchWorst = w; patchAt = `${a.id} → ${b.id}`; }
      // What the fade did before: the whole list at the middle.
      const old = ticks.map(t => (ease(t) >= 0.5 ? to : from).sceneMappings);
      switched = Math.max(switched, biggestStep(old));
      // The ring's drawn amount across the tick before the middle and the tick after
      // it. The fade's value is set on a 33 ms timer and holds to the next tick; the
      // handoff swaps on a render frame timed from a clock that started a moment
      // before the fade's, so the frame that swaps draws whichever tick came last,
      // up to a whole tick away from t = 0.5 either side, and the clock's head start
      // plus React's frame of lag can make that a second tick. Two ticks each way are
      // read, in quarter-tick steps. (Half a tick was tried first and passed a pointed
      // V that drew 0.090 at the swap, one tick out.) The Back is read as well as the Go.
      for (let q = -8; q <= 8; q++) {
        const t = 0.5 + q / (4 * N);
        const dip = Math.max(
          finite(Math.abs(goStep(from, to, t, from).phaseAmount), `the Go's amount on ${a.id} → ${b.id}`),
          finite(Math.abs(backStep(from, to, t, from).phaseAmount), `the Back's amount on ${a.id} → ${b.id}`));
        const line = finite(Math.abs(plainStep(from, to, t, from).phaseAmount), `the straight line on ${a.id} → ${b.id}`);
        if (dip > ringNear) { ringNear = dip; ringAt = `${a.id} → ${b.id}`; }
        if (line > plainNear) { plainNear = line; plainAt = `${a.id} → ${b.id}`; }
      }
      const back = ticks.map(t => backStep(from, to, t, from));
      for (const series of [go, back])
        for (let i = 1; i < series.length; i++) peak = Math.max(peak, Math.abs(series[i].phaseAmount - series[i - 1].phaseAmount));
      if (go[N].phaseAmount !== to.phaseAmount || go[N].sceneMappings !== to.sceneMappings) endsExact = false;
      if (go[0].sceneMappings !== from.sceneMappings && JSON.stringify(go[0].sceneMappings) !== JSON.stringify(from.sceneMappings)) endsExact = false;
      // An unattended change (no handoff) keeps its straight line.
      const mid = plainStep(from, to, 0.4, from).phaseAmount;
      if (mid !== blendLooks(from, to, 0.4).phaseAmount) evolveLinear = false;
    }
  }
  check(`control: a patch list switched at the middle reads as a jump (${switched.toFixed(2)} of a depth in one tick)`, switched >= 0.5, `over ${pairs} pairs`);
  check(`no patch moves more than 0.03 of a depth in one tick of a one-second change, on ${pairs} pairs of looks`,
    patchWorst <= 0.03, `biggest ${patchWorst.toFixed(3)} (${patchAt})`);
  check(`control: the ferrofluid amount on a straight line is still ${plainNear.toFixed(2)} at the swap (${plainAt})`, plainNear >= 0.2);
  check(`the ferrofluid amount drawn anywhere within two ticks either side of the ring's swap is under 0.01 on all ${pairs} pairs (a Go, a Back and Send to wall)`,
    ringNear <= 0.01, `worst ${ringNear.toFixed(3)} (${ringAt}); the straight line left ${plainNear.toFixed(2)}`);
  check('and the dip does not lurch: the amount moves at most 0.15 in one tick on the way down and up', peak <= 0.15, `biggest ${peak.toFixed(3)}`);
  check('the change still ends on the new look exactly (the amount, and the patch list itself)', endsExact);
  check('an unattended change (a new song, Lucky: no handoff) keeps its amount on a straight line', evolveLinear);
  const c = look('classic'), hand = { ...c, phaseAmount: 0.33 };
  // Only a Back is told which keys a hand holds (`revertLook` passes the dimmer), and the
  // ring's amount is one a hand can hold, so the Back is what is driven here. Without the
  // hold the dip is the computed 0.6 · (ease(0.75) − 0.6) / 0.4; with it, the hand's 0.33.
  const held = backStep(c, { ...c, phaseAmount: 0.6 }, 0.75, hand, ['phaseAmount']);
  const dipped = backStep(c, { ...c, phaseAmount: 0.6 }, 0.75, hand);
  const wantDip = 0.6 * (ease(0.75) - 0.6) / 0.4;
  check('a hand on the ferrofluid slider during the change is not dipped over', held.phaseAmount === 0.33 && Math.abs(dipped.phaseAmount - wantDip) < 1e-9,
    `held ${held.phaseAmount}, the same tick without the hand ${dipped.phaseAmount.toFixed(4)} (computed ${wantDip.toFixed(4)})`);
}

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
