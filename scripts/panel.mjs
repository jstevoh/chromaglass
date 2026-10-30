#!/usr/bin/env node
/**
 * Can every control the settings panel draws be put on a desk?
 *
 *   npm run panel
 *
 * The panel and the desks keep separate lists of what a control *is*, and they
 * have to. The panel's list is its own markup — eighty-seven sliders, each with
 * a label and a range typed beside it. The desks' list is `PINNABLE` in
 * `src/lib/deskPins.ts`, because a strip has to be able to name a control
 * without rendering the panel, and because for the forty MIDI already knows the
 * range a fader rides is deliberately not the range the panel shows.
 *
 * Two lists that must agree and cannot be derived from each other is exactly
 * the shape that drifts, and drift here is silent in the worst way: a slider
 * added to the panel simply has no pin chips, which looks like a design
 * decision rather than an omission. So this reads the panel's own source and
 * checks the two against each other.
 *
 * It also checks the map: every section a spec claims to live in has to be a
 * section that exists, or a picker draws a heading for a place you cannot go.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PINNABLE, PIN_RANGE, DEFAULT_RECIPE, DEFAULT_RIDES, MAX_PINS, onStep } from '../src/lib/deskPins.ts';
import { PER_LAYER, PATCH_TARGETS } from '../src/lib/sceneMap.ts';
import { THEMES, moveTargets } from '../src/lib/drift.ts';
/*
  One of Evolve's moves (lib/slowEvolve.ts plans when and which way): a theme
  picked by the roll, its dials sent somewhere in their windows. The checks
  below were written against the old two-dial nudge; they hold every move to
  the same rules.
*/
const driftLook = (current, anchor, amount, roll) =>
  moveTargets(THEMES[Math.floor(roll() * THEMES.length)], current, anchor, roll() * 2 - 1, amount, roll);
import { lookSpeed, musicPace, tempoMultiplier } from '../src/lib/tempoPace.ts';
import { finishTake, takeSong, replayPosition, dueGestures, songStartMs } from '../src/lib/performanceTake.ts';
import { SurfaceWatcher, buildAutoMap, RIDE_ORDER, MASTER_RIDE } from '../src/lib/autoMap.ts';
import { touch, touchKey, subscribeTouch, subscribeAllTouches, touchKeysWatched, resetTouch } from '../src/lib/midiTouch.ts';
import { settingLed, SoftTakeover, parseMidiMap, LEARNABLE_SETTINGS } from '../src/lib/midi.ts';
import { luckyLook } from '../src/lib/lucky.ts';
import { evolvedLook } from '../src/lib/lookFade.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { PRESETS } from '../src/presets.ts';
import { SettingRide, rideSlot } from '../src/lib/ride.ts';
import { SHIPPED } from '../src/lib/deskLayout.ts';
import { lerpSettings, GLIDES } from '../src/lib/sequencer.ts';
import { SETTINGS_SECTIONS, SETTINGS_CATEGORIES, SECTION_BY_ID, sectionMatches } from '../src/lib/settingsMap.ts';
import { FACTORY_MAPS, factoryFor } from '../src/lib/midi.ts';
import { MIX_CONTROLS } from '../src/lib/mixer.ts';
import { helpFor, CONTROL_HELP } from '../src/lib/controlHelp.ts';
import { FADE_CONTROLS } from '../src/lib/mixFade.ts';
import { HALOGEN_KELVIN, LAMP_WARMTH_MAX, LEGACY_GRADE, NEUTRAL_KELVIN, blackbodyHex, blackbodyShift, kelvinLabel, lampTint, warmthKelvin } from '../src/lib/lampKelvin.ts';
import { dripFallSeconds, FALL_THIN_S } from '../src/lib/dripPace.ts';
import { THICK_NU, WATER_NU } from '../src/lib/turntable.ts';
import { dyeRoomOf, shownRoom } from '../src/lib/dyeTarget.ts';
import { FULL_CM, HUB_CM, TAPE_CM_PER_S, TAPE_SECONDS, reelsAt } from '../src/lib/tapeReels.ts';
import { VU_FULL, needleAtRest, needleDeg, stepNeedle } from '../src/lib/vuMeter.ts';
import { MAX_DOTS, strobeOf } from '../src/lib/strobeRing.ts';
import { MOUNT_MM, NOTCH_MM, SLOT_DEG, TRAY_SLOTS, WINDOW_H, WINDOW_H_MM, WINDOW_W, WINDOW_W_MM, stepOf, trayDeg } from '../src/lib/slideTray.ts';
import { appSource } from './appSource.mjs';

// The repository root as npm hands it over. Not `import.meta.url`: this file
// is bundled into node_modules/.cache before it runs, so its own url points at
// the cache directory rather than at the source it is here to read.
const root = process.env.INIT_CWD ?? process.cwd();
const panel = readFileSync(join(root, 'src/components/SettingsPanel.tsx'), 'utf8');
const panel0 = readFileSync(join(root, 'src/components/LiquidVisualizer.tsx'), 'utf8');
const panel0app = appSource();
const sim = readFileSync(join(root, 'src/sim/fluidSimulation.ts'), 'utf8');

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── What the panel actually draws ───────────────────────────────────
//
// Read from the source rather than from a rendered DOM on purpose: this has to
// run in a couple of seconds with no browser, and the thing it is guarding
// against is a line of markup, which is what it reads.
const sliders = [];
for (const block of panel.match(/<Slider\b[\s\S]*?\/>/g) ?? []) {
  const key = block.match(/onUpdate\(\{\s*([A-Za-z0-9_]+):/)?.[1] ?? null;
  const label = block.match(/label="([^"]+)"/)?.[1] ?? '?';
  const pinned = block.match(/settingKey="([A-Za-z0-9_]+)"/)?.[1] ?? null;
  // Its travel as typed, so the registry can be held to it. A range that is
  // not a literal number reads as NaN and fails below rather than passing.
  const num = (name) => Number(block.match(new RegExp(`\\b${name}=\\{([^}]+)\\}`))?.[1]);
  const rounds = /Math\.round\(v\)/.test(block);
  sliders.push({ key, label, pinned, min: num('min'), max: num('max'), step: num('step'), rounds });
}

check('the settings panel still has its sliders', sliders.length > 60, `${sliders.length} found`);
if (sliders.length < 60) {
  console.log('\nThe reader found almost nothing, so everything below would pass by accident.');
  process.exit(1);
}

const noKey = sliders.filter(s => !s.key);
check('every slider writes one named setting', noKey.length === 0,
  noKey.length ? noKey.map(s => s.label).join(', ') : `${sliders.length} sliders`);

// ── The chips ───────────────────────────────────────────────────────
const unchipped = sliders.filter(s => s.key && !s.pinned);
check('every slider offers to go on a desk', unchipped.length === 0,
  unchipped.length ? unchipped.map(s => `${s.label} (${s.key})`).join(', ') : `${sliders.length} with pin chips`);

const mislabelled = sliders.filter(s => s.key && s.pinned && s.key !== s.pinned);
check('and each chip pins the setting its own slider moves', mislabelled.length === 0,
  mislabelled.map(s => `${s.label}: moves ${s.key}, pins ${s.pinned}`).join(', '));

// ── The registry ────────────────────────────────────────────────────
const missing = sliders.filter(s => s.key && !PIN_RANGE.has(s.key));
check('every control the panel draws is one a desk can hold', missing.length === 0,
  missing.length
    ? `${missing.map(s => `${s.label} (${s.key})`).join(', ')} — add to PINNABLE in src/lib/deskPins.ts`
    : `${PINNABLE.length} in the registry`);

// The other direction: a spec for a control nobody can see is a row in every
// picker that leads nowhere. `audioImpact` and friends may legitimately appear
// only as MIDI targets, so this names what it found rather than failing on it.
/*
  Drawn, not merely slid.

  This asked whether a setting had a `<Slider>`, which was the same question
  until a control turned up that should not be a fader: the kaleidoscope's
  fold count is a choice of five, and five buttons say so better than a slider
  swept through the gaps between them. It had pin chips and a section of its
  own and the check still called it invisible.

  So a standalone `PinChips settingKey="…"` counts too. That is the panel's own
  mark for "this is a control, and here is how to put it on a desk", which is
  exactly what the question means.
*/
const chipped = [...panel.matchAll(/<PinChips settingKey="([A-Za-z0-9_]+)"/g)].map(m => m[1]);
/*
  And the mixer's, which are drawn from a list.

  The Mixer (lib/mixer.ts) is one component in three places, the Perform
  desk, this sheet and the phone, so its twenty-three sliders are not typed
  out here: \`MixerPanel\` draws one per source for the level and one per grade,
  from \`MIX_CONTROLS\`, at the registry's range. A reader of this file's
  markup would call all of them invisible. So they count as drawn only when
  each link in that chain is there to read: the sheet renders the panel in the
  Mixer section with its pin chips, and the panel draws the level and every
  grade through one slider that takes its range from the registry and offers
  the chips.
*/
const mixerSrc = readFileSync(join(root, 'src/components/MixerPanel.tsx'), 'utf8');
const mixerSection = panel.match(/<section id="settings-mixer"[\s\S]*?<\/section>/)?.[0] ?? '';
const mixerLinks = {
  'the sheet draws the Mixer in its own section': /<MixerPanel\b/.test(mixerSection),
  'with the pin chips': /chips=\{\(k\) => <PinChips settingKey=\{k\} \/>\}/.test(mixerSection),
  'the panel draws each source\'s level': /slider\(info\.level,/.test(mixerSrc),
  'and each of its grades': /MIX_GRADES\.map\(g => slider\(gradeKey\(id, g\)/.test(mixerSrc),
  'at the registry\'s range': /PIN_RANGE\.get\(String\(key\)\)/.test(mixerSrc) && /min=\{spec\.min\}/.test(mixerSrc) && /max=\{spec\.max\}/.test(mixerSrc),
  'offering the chips beside each': /chips\(key\)/.test(mixerSrc),
  'and each row\'s fade time in its drawer': /slider\(fadeKey\(id\), 'Fade time'\)/.test(mixerSrc),
};
const brokenLinks = Object.entries(mixerLinks).filter(([, ok]) => !ok).map(([k]) => k);
check('the Mixer draws its controls in the sheet, from the registry', brokenLinks.length === 0,
  brokenLinks.length ? `missing: ${brokenLinks.join('; ')}` : `${MIX_CONTROLS.length} controls and ${FADE_CONTROLS.length} fade times`);
const mixerOff = [...MIX_CONTROLS, ...FADE_CONTROLS].filter(c => {
  const spec = PIN_RANGE.get(String(c.key));
  return !spec || spec.min !== c.min || spec.max !== c.max || spec.section !== 'mixer';
});
check('and every one of them is in the registry at its own range, in the Mixer section', mixerOff.length === 0,
  mixerOff.map(c => String(c.key)).join(', '));
const drawn = new Set([...sliders.map(s => s.key), ...chipped, ...(brokenLinks.length ? [] : [...MIX_CONTROLS, ...FADE_CONTROLS].map(c => String(c.key)))]);
const ghosts = PINNABLE.filter(s => !drawn.has(String(s.key)));
check('and nothing in the registry is invisible in the panel', ghosts.length === 0,
  ghosts.length ? ghosts.map(s => `${s.label} (${String(s.key)})`).join(', ') : 'all of them have a slider');

const badRange = PINNABLE.filter(s => !(s.max > s.min));
check('every range has somewhere to travel', badRange.length === 0,
  badRange.map(s => `${s.label} ${s.min}..${s.max}`).join(', '));

const dupes = PINNABLE.map(s => String(s.key)).filter((k, i, a) => a.indexOf(k) !== i);
check('and no control is in it twice', dupes.length === 0, dupes.join(', '));

// ── One range per setting ───────────────────────────────────────────
/*
  The sheet, the desks, MIDI, the phone and a sequence stage each kept their
  own idea of a control's travel, and they disagreed: Speed was 0–0.3 on the
  sheet, 0.005–0.3 on a fader, 0.005–0.6 on the phone and 0.005–0.15 in a
  stage; the macro zoom stopped at 12 everywhere but the sheet, which goes to
  16; Dye Budget reached 1.5 in a stage where the solver stops at 1.2; and
  the folds rode a fader continuously from 0 to 12 where the sheet offers five
  buttons. The sheet is the one range now. The registry is held to it here,
  and the phone and the sequencer read the registry instead of keeping a copy.
*/
const offRange = sliders.filter(s => {
  const spec = s.key && PIN_RANGE.get(s.key);
  return spec && (spec.min !== s.min || spec.max !== s.max);
});
check('every control has one range, and it is the sheet\'s', offRange.length === 0,
  offRange.length
    ? offRange.map(s => `${s.label}: sheet ${s.min}–${s.max}, registry ${PIN_RANGE.get(s.key).min}–${PIN_RANGE.get(s.key).max}`).join(' · ')
    : `${sliders.length} sliders against the registry`);

// A control the sheet only offers in whole steps says so in the registry, with
// the sheet's step, so every other surface lands on the same values.
const unstepped = sliders.filter(s => s.key && s.rounds && PIN_RANGE.get(s.key)?.step !== s.step);
check('a control the sheet steps is stepped in the registry too', unstepped.length === 0,
  unstepped.length
    ? unstepped.map(s => `${s.label}: sheet steps by ${s.step}, registry by ${PIN_RANGE.get(s.key)?.step ?? 'nothing'}`).join(', ')
    : sliders.filter(s => s.rounds).map(s => s.label).join(', '));
const foldButtons = panel.match(/\{\[([0-9,\s]+)\]\.map\(\(k\) => \(\s*<button[\s\S]{0,200}?kaleidoscope: k/)?.[1]
  ?.split(',').map(Number) ?? [];
const folds = PIN_RANGE.get('kaleidoscope');
const foldSteps = folds?.step
  ? Array.from({ length: Math.round((folds.max - folds.min) / folds.step) + 1 }, (_, i) => folds.min + i * folds.step)
  : [];
check('and the folds are the sheet\'s five buttons wherever they are ridden',
  foldButtons.length > 0 && foldButtons.join() === foldSteps.join(),
  `buttons ${foldButtons.join(', ') || 'not found'}; registry ${foldSteps.join(', ') || 'not stepped'}`);

// A fader across the folds, through the real soft takeover: every message has
// to land, and on a fold the sheet offers. The detent goes on *before*
// takeover sees the position, and the control is why: snapped afterwards, the
// fader rests between two steps, a fraction away from a value it wrote itself,
// and takeover reads its own write as somebody else's and lets go.
const sweepFolds = (detentFirst) => {
  const span = folds.max - folds.min;
  const t = new SoftTakeover();
  const seen = new Set();
  let value = folds.min, held = 0;
  for (let v = 0; v <= 127; v++) {
    let in01 = v / 127;
    if (detentFirst) in01 = (onStep(folds, folds.min + in01 * span) - folds.min) / span;
    const out = t.ride('folds', in01, (value - folds.min) / span);
    if (out === null) { held++; continue; }
    value = onStep(folds, folds.min + out * span);
    seen.add(value);
  }
  return { held, seen: [...seen].sort((a, b) => a - b) };
};
const swept = sweepFolds(true);
check('a fader swept across the folds lands on every fold, and only those',
  swept.held === 0 && swept.seen.join() === foldSteps.join(),
  `${swept.seen.join(', ')}; ${swept.held} messages held`);
check('and snapping after takeover instead would strand it',
  sweepFolds(false).held > 0, 'if this passes, the check above is measuring nothing');
const hookSrc = readFileSync(join(root, 'src/hooks/useMidi.ts'), 'utf8');
/*
  Asserted as a shape rather than as a spelling.

  This read `in01 = (onStep(stepped` exactly, and then the curve went in —
  the travel of a fader is no longer the value's, so the line became
  `in01 = travelOf(onStep(stepped, valueAt(...)))`. Same ordering, same two
  write sites, same detent before takeover; different words. A check that
  fails a refactor it agrees with is a check that teaches people to edit the
  check, so what it looks for now is that `in01` is put back through
  `onStep` on that line at all.
*/
check('and the hook puts the detent on first, on a fader and an encoder alike',
  /if \(stepped\.step\) in01 = [^;]*onStep\(stepped/.test(hookSrc)
  && /const by = stepped\.step \?\? span \/ 100/.test(hookSrc)
  && (hookSrc.match(/h\.setSetting\(t\.key, onStep\(stepped, /g) ?? []).length === 2);

// A map saved while Speed rode 0.005–0.3 on a fader has to ride the sheet's
// range when it is loaded now, or an old file keeps the old disagreement.
const oldMap = parseMidiMap(JSON.stringify({
  format: 'chromaglass-midi', version: 1, name: 'saved before',
  bindings: [
    ['globalSpeed', 0.005, 0.3], ['macroZoom', 1, 12], ['kaleidoscope', 0, 12], ['sensitivity', 0.2, 2],
  ].map(([key, min, max], i) => ({
    id: `b${i}`, mode: 'absolute', source: { kind: 'cc', channel: 0, number: i },
    target: { kind: 'setting', key, min, max },
  })),
}));
const travel = Object.fromEntries(oldMap.bindings.map(b => [b.target.key, [b.target.min, b.target.max]]));
check('a map saved before rides today\'s ranges',
  ['globalSpeed', 'macroZoom', 'kaleidoscope'].every(k =>
    travel[k]?.[0] === PIN_RANGE.get(k).min && travel[k]?.[1] === PIN_RANGE.get(k).max),
  Object.entries(travel).map(([k, [a, b]]) => `${k} ${a}–${b}`).join(', '));
check('and a binding MIDI cannot learn is dropped',
  travel.sensitivity === undefined && oldMap.bindings.length === 3);
check('and every MIDI range is in the registry as it is',
  LEARNABLE_SETTINGS.every(m => PIN_RANGE.get(String(m.key))?.min === m.min && PIN_RANGE.get(String(m.key))?.max === m.max));

// The phone and a sequence stage take the registry's travel instead of their own.
const remote = readFileSync(join(root, 'src/components/RemoteControl.tsx'), 'utf8');
check('the phone keeps no range of its own',
  !/<Slider label="[^"]+" field="[A-Za-z0-9_]+"[^>]*\bmin=\{/.test(remote)
  && /PIN_RANGE\.get\(String\(field\)\)/.test(remote));
/*
  And every field it draws is a control the registry knows.

  "Keeps no range of its own" is only half of it. The phone reads
  `PIN_RANGE.get(String(field)) ?? { min: 0, max: 1 }` — so a field that is
  not in the registry does not fail, it silently becomes a 0-to-1 slider.
  Speed would run to 1 where the control stops at 0.3, and the fader would
  look perfectly normal doing it.
*/
{
  const fields = [...new Set([...remote.matchAll(/field="([A-Za-z0-9_]+)"/g)].map(m => m[1]))];
  const unknown = fields.filter(f => !PIN_RANGE.has(f));
  check('and every control the phone draws is one the registry knows',
    fields.length > 0 && unknown.length === 0,
    unknown.length ? `${unknown.join(', ')} would silently become 0..1` : `${fields.length} fields`);
}
const seqPanel = readFileSync(join(root, 'src/components/SequencerPanel.tsx'), 'utf8');
check('and neither does a sequence stage',
  GLIDES.length > 20 && GLIDES.every(([k]) => PIN_RANGE.has(String(k)))
  && /PIN_RANGE\.get\(String\(key\)\)/.test(seqPanel) && !/min:\s*-?[0-9.]+,\s*max:/.test(seqPanel),
  GLIDES.filter(([k]) => !PIN_RANGE.has(String(k))).map(([k]) => String(k)).join(', '));
// A stage gliding between fold counts steps through the sheet's, and a stage
// that brings in a second layer does it once rather than a sliver a tick.
{
  const mid = [0.1, 0.3, 0.5, 0.7, 0.9].map(t => lerpSettings({ kaleidoscope: 0, layerCount: 1 }, { kaleidoscope: 8, layerCount: 2 }, t));
  check('and a stage glides a stepped control by steps',
    mid.every(m => foldSteps.includes(m.kaleidoscope) && (m.layerCount === 1 || m.layerCount === 2)),
    mid.map(m => `${m.kaleidoscope}/${m.layerCount}`).join(' '));
}
// And a desk strip takes the step, so a pinned Layers cannot write 1.4.
// Since Desk v2 one control draws every strip, as a slider (learned to a
// fader) or a knob (an encoder, or nothing): both of them take the step,
// and the knob lands on it rather than between.
const deskPanelsSrc = readFileSync(join(root, 'src/components/desk/DeskPanels.tsx'), 'utf8');
const uiSrc = readFileSync(join(root, 'src/components/ui/index.tsx'), 'utf8');
{
  const control = deskPanelsSrc.slice(deskPanelsSrc.indexOf('function DeskControl'), deskPanelsSrc.indexOf('function ControlGrid'));
  const knob = uiSrc.slice(uiSrc.indexOf('export function Knob'));
  check('and a desk strip lands on a step too',
    control.length > 0 && (control.match(/step=\{spec\.step\}/g) ?? []).length === 2
    && /<Knob[\s\S]*step=\{spec\.step\}/.test(control) && /<Slider[\s\S]*step=\{spec\.step\}/.test(control)
    && /Math\.round\(\(v - min\) \/ step\) \* step/.test(knob),
    `${(control.match(/step=\{spec\.step\}/g) ?? []).length} of the slider and the knob`);
}

// ── The map ─────────────────────────────────────────────────────────
const badSection = PINNABLE.filter(s => !SECTION_BY_ID.has(s.section));
check('every control names a settings section that exists', badSection.length === 0,
  badSection.map(s => `${s.label} → ${s.section}`).join(', '));

const orphanCat = SETTINGS_SECTIONS.filter(s => !SETTINGS_CATEGORIES.some(c => c.id === s.category));
check('every section is in a category the rail draws', orphanCat.length === 0,
  orphanCat.map(s => `${s.name} → ${s.category}`).join(', '));

const emptyCat = SETTINGS_CATEGORIES.filter(c => !SETTINGS_SECTIONS.some(s => s.category === c.id));
check('and no category is empty', emptyCat.length === 0, emptyCat.map(c => c.name).join(', '));

// Every section in the map has markup, and every piece of markup is in the map.
const inMarkup = new Set([...panel.matchAll(/data-section="([a-z-]+)"/g)].map(m => m[1]));
const unrendered = SETTINGS_SECTIONS.filter(s => !inMarkup.has(s.id));
check('every row on the rail has a section behind it', unrendered.length === 0,
  unrendered.map(s => `${s.name} (${s.id})`).join(', '));
const unlisted = [...inMarkup].filter(id => !SECTION_BY_ID.has(id));
check('and every section on screen has a row on the rail', unlisted.length === 0, unlisted.join(', '));

// ── The search ──────────────────────────────────────────────────────
//
// The words that sent someone looking. Each one has to reach the section that
// answers it — this is the check that would have caught "I cannot find how to
// turn the video on", which is what the rail was built for.
const MUST_FIND = [
  ['video', 'room'], ['people', 'room'], ['camera', 'room'], ['crowd', 'room'],
  ['midi', 'midi'], ['apc40', 'midi'], ['controller', 'midi'], ['fader', 'midi'],
  ['keystone', 'projectors'], ['mask', 'projectors'], ['strobe', 'projectors'],
  ['wall', 'projectors'], ['projector', 'projectors'],
  ['film mix', 'film'], ['reel', 'film'], ['window', 'film'], ['prelinger', 'film'],
  ['lumia', 'lamp'], ['gel wheel', 'lamp'], ['exposure', 'lamp'], ['lamp warmth', 'lamp'],
  ['patch', 'patches'], ['lfo', 'patches'], ['room impact', 'patches'], ['sound impact', 'patches'],
  // Renamed controls, by their new names and by the old ones people learned.
  ['momentum', 'physics'], ['damping', 'physics'], ['lens', 'camera'], ['updraft', 'interaction'],
  ['blow velocity', 'interaction'], ['grain fineness', 'look'], ['grain size', 'look'], ['macro lacing', 'macro'],
  ['bpm', 'audio-input'], ['microphone', 'audio-input'],
  ['viscosity', 'physics'], ['zoom', 'macro'], ['blend', 'layers'], ['gpu', 'simulation'],
];
const misses = [];
for (const [word, want] of MUST_FIND) {
  const hits = SETTINGS_SECTIONS.filter(s => sectionMatches(s, word)).map(s => s.id);
  if (!hits.includes(want)) misses.push(`"${word}" → ${hits.join(', ') || 'nothing'} (wanted ${want})`);
}
check('searching for what you came for finds it', misses.length === 0, misses.join(' · '));

// ── The wall, the lamp and the film ─────────────────────────────────
/*
  Projectors was three sections in one: the wall's geometry, six look effects
  and the film projector. So the section you square a projector up in at
  load-in and never touch again was also where a gel wheel was ridden
  mid-song, and it was the longest row on the rail. The split is checked
  here, where it would quietly grow back: the wall holds no setting a desk
  can reach (everything on it is the venue's, kept off every fader on
  purpose), the look effects live with the lamp they colour, and the film
  is an input.
*/
const onWall = PINNABLE.filter(s => s.section === 'projectors');
check('the wall holds the wall and nothing a fader can reach', onWall.length === 0,
  onWall.map(s => s.label).join(', '));
const LAMP = ['lumia', 'gelWheel', 'gelSpeed', 'lampWarmth', 'exposure'];
check('the look effects live with the lamp',
  LAMP.every(k => PIN_RANGE.get(k)?.section === 'lamp'),
  LAMP.filter(k => PIN_RANGE.get(k)?.section !== 'lamp').map(k => `${k} → ${PIN_RANGE.get(k)?.section}`).join(', '));
check('and the lamp holds the optics of the dye it shines through, not the reactions that were in it (PLAN 35c)',
  ['thicknessOptics', 'spectralOptics', 'transmission'].every(k => PIN_RANGE.get(k)?.section === 'lamp')
  && ['chemistry', 'chemistryPattern', 'chemistryWidth', 'turingPrint', 'turingInk', 'turingDrift'].every(k => PIN_RANGE.get(k)?.section === 'reactions'));
check('and the film is an input of its own',
  SECTION_BY_ID.get('film')?.category === 'feed'
  && ['filmMix', 'filmKey', 'filmDrive'].every(k => PIN_RANGE.get(k)?.section === 'film'));
// ── The patch bay ───────────────────────────────────────────────────
/*
  The bay lived in The Room and its masters in three other places: Sound
  Impact in Sound Mappings, Room Impact in The Room, Film Impact in
  Projectors, and none at all for the shapes. One section holds the bay and
  all four now, and these are the ways that could come apart again: a master
  wandering off to its source's section, the bay's markup ending up somewhere
  else, a master becoming something a patch can ride (a source riding its own
  master is a loop nobody asked for), and the Control menu going back to one
  flat list of eighty.
*/
const MASTERS = ['sceneImpact', 'filmImpact', 'soundImpact', 'shapeImpact'];
/*
  The masters were gathered under the bay on purpose (above), and the owner
  then found two strengths for one input in two sections: Room Drive in The
  Room and Room Impact in Patches, likewise for the film and the sound (PLAN
  35c-2, one Strength per input). Each master sits with the Drive of its own
  source now; the shapes have no input section, so theirs stays at the bay.
*/
const MASTER_HOME = { sceneImpact: 'room', filmImpact: 'film', soundImpact: 'audio-input', shapeImpact: 'patches' };
const DRIVE_OF = { sceneImpact: 'sceneDrive', filmImpact: 'filmDrive', soundImpact: 'audioImpact' };
check('every master sits with its source: the three that have a Drive beside it, the shapes at the bay',
  MASTERS.every(k => PIN_RANGE.get(k)?.section === MASTER_HOME[k]),
  MASTERS.filter(k => PIN_RANGE.get(k)?.section !== MASTER_HOME[k]).map(k => `${k} → ${PIN_RANGE.get(k)?.section ?? 'nowhere'}`).join(', '));
check('and a Drive and the master of the same source are filed in one section',
  Object.entries(DRIVE_OF).every(([m, d]) => PIN_RANGE.get(m)?.section === PIN_RANGE.get(d)?.section),
  Object.entries(DRIVE_OF).filter(([m, d]) => PIN_RANGE.get(m)?.section !== PIN_RANGE.get(d)?.section).map(([m, d]) => `${m} ≠ ${d}`).join(', '));
/** The markup of one section, from its opening tag to the next `</section>`. */
const sectionSource = (id) => {
  const at = panel.indexOf(`data-section="${id}"`);
  return at < 0 ? '' : panel.slice(at, panel.indexOf('</section>', at));
};
/*
  Squish Plate was forty controls in one section, and the desk's panel for the
  same section was a different forty: thirty of the pins said 'physics' while
  the sheet drew them under Squish Plate, so the Fluid Physics knobs were the
  glass's, the oil's and the magnet's. Five sections now (PLAN 35c), and the
  check is the one that would have caught it: a section's markup draws exactly
  the sliders the registry files under it. Asked of the five that split, of the
  lamp (which took two) and of Fluid Physics (which gave up three and kept the
  rest).
*/
for (const id of ['squish', 'oil', 'ferro', 'reactions', 'tilt', 'spin', 'lamp', 'physics', 'room', 'film', 'audio-input']) {
  const drawn = [...sectionSource(id).matchAll(/settingKey="(\w+)"/g)].map(m => m[1]).sort();
  const filed = PINNABLE.filter(s => s.section === id).map(s => String(s.key)).sort();
  const strays = [...drawn.filter(k => !filed.includes(k)).map(k => `${k} drawn, filed elsewhere`),
    ...filed.filter(k => !drawn.includes(k)).map(k => `${k} filed, drawn elsewhere`)];
  check(`${id}: the sliders it draws are the ones the registry files under it`, drawn.length > 0 && strays.length === 0, strays.join(', '));
}
const bay = sectionSource('patches');
check('and the bay is drawn there, not in The Room',
  bay.includes('data-testid="scene-map-add"') && !sectionSource('room').includes('scene-map-add')
  && bay.includes('settingKey="shapeImpact"') && !MASTERS.filter(k => k !== 'shapeImpact').some(k => bay.includes(`settingKey="${k}"`)));
check('no source can ride a master',
  !PATCH_TARGETS.some(t => MASTERS.includes(String(t.key))),
  PATCH_TARGETS.filter(t => MASTERS.includes(String(t.key))).map(t => t.label).join(', '));
check('and what a patch can aim at is grouped by section', /<optgroup key=\{g\.id\} label=\{g\.name\}>/.test(bay));

check('the wall keeps its id',
  SECTION_BY_ID.get('projectors')?.name === 'Wall');

// ── The controller the section offers to set up ─────────────────────
//
// The Controller section's one button is only worth having if it names the
// hardware that is actually plugged in, and what the browser hands us is the
// port name the OS invented — which is not what is printed on the box. These
// are the strings real ports report, so a pattern that stops matching one of
// them fails here rather than on a stage.
const PORTS = [
  ['APC40 mkII', 'apc40-mk2'],
  ['Akai APC40 mkII', 'apc40-mk2'],
  ['APC MINI MK2', 'apc-mini-mk2'],
  ['APC mini mk2 APC mini mk2 Contro', 'apc-mini-mk2'],
  ['Launchpad Mini MK3 LPMiniMK3 MIDI Out', 'launchpad'],
  ['Launchpad X LPX MIDI Out', 'launchpad'],
  ['Launch Control XL', 'launch-control-xl'],
  ['nanoKONTROL2 SLIDER/KNOB', 'nanokontrol2'],
  // Not a controller. Offering it a fader map would be worse than offering
  // nothing, because it would look like it had worked.
  ['Scarlett 2i2 USB', null],
  ['Built-in Microphone', null],
];
const wrong = PORTS
  .map(([name, want]) => [name, want, factoryFor(name)?.id ?? null])
  .filter(([, want, got]) => want !== got);
check('a plugged-in controller is recognised by its port name', wrong.length === 0,
  wrong.map(([n, want, got]) => `"${n}" → ${got ?? 'none'} (wanted ${want ?? 'none'})`).join(' · '));
check('and nothing is recognised as two different controllers',
  PORTS.every(([name]) => FACTORY_MAPS.filter(f => f.match.test(name)).length <= 1),
  PORTS.filter(([name]) => FACTORY_MAPS.filter(f => f.match.test(name)).length > 1).map(([n]) => n).join(', '));
check('and every factory map has a pattern that finds it',
  FACTORY_MAPS.every(f => factoryFor(f.name)?.id === f.id),
  FACTORY_MAPS.filter(f => factoryFor(f.name)?.id !== f.id).map(f => f.name).join(', '));

// ── What a patch may aim at one plate ───────────────────────────────
//
// A patch can be aimed at a single layer, and the panel offers that choice only
// for settings the *solver* reads — those are the only ones that can mean
// something different on one plate than on another. Bloom is done once over the
// finished picture; aiming it at layer 2 would do nothing at all, and a
// dropdown offering a choice that does nothing is worse than one that does not
// offer it.
//
// `PER_LAYER` is a written list, because it decides what a dropdown shows. This
// is what stops it becoming a lie: the solver's own source is read and every
// name on the list has to appear in it.
// The class runs to the end of its own file (src/sim/, PLAN 19ai-3).
const cls = sim.indexOf('class FluidSimulation {');
const solver = cls < 0 ? '' : sim.slice(cls);
check('the solver can be found to read', solver.length > 2000, `${solver.length} characters`);

/*
  And the plate's own dish. The frame turns each plate's dish from that
  plate's settings, `patch.layer(l).rotationSpeed`, and outside the solver's
  class: since PLAN 22j the solver has no use for the motor at all (it used to
  stir the current with it). One plate's motor is still that plate's, so a
  key the frame reads per plate counts as the solver's would.
*/
const readsInSolver = new Set([
  ...[...solver.matchAll(/settings\.([A-Za-z0-9_]+)/g)].map(m => m[1]),
  ...[...panel0.matchAll(/patch\.layer\(l\)\.([A-Za-z0-9_]+)/g)].map(m => m[1]),
]);
const phantom = [...PER_LAYER].filter(k => !readsInSolver.has(k));
check('every per-plate setting is one the solver actually reads', phantom.length === 0,
  phantom.length
    ? `${phantom.join(', ')} — the panel offers a plate for these and the solver never looks at them`
    : `${PER_LAYER.size} of them`);

// Against what a patch can actually aim at, not against everything pinnable:
// a setting no patch can name could not be aimed at a plate either, so counting
// it as "left off" is a check failing over something it cannot cause.
const targetable = new Set(PATCH_TARGETS.map(s => String(s.key)));
const missed = [...readsInSolver].filter(k => targetable.has(k) && !PER_LAYER.has(k));
check('and nothing the solver reads is left off the list', missed.length === 0,
  missed.length ? `${missed.join(', ')} — could be aimed at one plate and is not offered` : 'none');

// ── Auto-map ────────────────────────────────────────────────────────
//
// Five controllers have factory maps; everything else is learned by watching
// what it sends. That is a guess about hardware nobody here has, made from the
// shape of the messages alone, so it is driven with surfaces made up on the
// spot: a fader box, a pad grid, an endless encoder, a button wired to a CC,
// and the awkward ones — a single knob, and more settings than there are
// faders to put them on.
{
  const sweep = (watch, number, channel = 0) => {
    // A fader dragged end to end: many values, and plenty in the middle.
    for (let v = 0; v <= 127; v += 7) watch.observe({ kind: 'cc', channel, number, value: v });
  };
  const twist = (watch, number, channel = 0) => {
    // An endless encoder: nudges only, always at the ends, never in between.
    for (let i = 0; i < 12; i++) watch.observe({ kind: 'cc', channel, number, value: i % 2 ? 1 : 127 });
  };
  const press = (watch, number, channel = 0) => {
    watch.observe({ kind: 'noteon', channel, number, value: 100 });
    watch.observe({ kind: 'noteoff', channel, number, value: 0 });
  };
  const flick = (watch, number, channel = 0) => {
    // A button wired to a CC: 0 and 127 and nothing else.
    for (let i = 0; i < 6; i++) watch.observe({ kind: 'cc', channel, number, value: i % 2 ? 127 : 0 });
  };
  const PRESETS = Array.from({ length: 40 }, (_, i) => `p${i}`);
  const kindsOf = (w) => w.controls().map(c => c.kind);
  const targetOn = (map, kind, number) => map.bindings
    .find(b => b.source.kind === kind && b.source.number === number)?.target;

  // A nine-fader desk.
  const faders = new SurfaceWatcher();
  for (let n = 48; n <= 56; n++) sweep(faders, n);
  const fk = kindsOf(faders);
  check('a swept fader reads as a fader',
    fk.length === 9 && fk.every(k => k === 'continuous'), fk.join(', ') || 'nothing');
  const fMap = buildAutoMap(faders.controls(), PRESETS, 16, 'Fader Box').map;
  check('and the rightmost one becomes the dimmer',
    targetOn(fMap, 'cc', 56)?.key === MASTER_RIDE, String(targetOn(fMap, 'cc', 56)?.key));
  check('and the leftmost takes the first ride',
    targetOn(fMap, 'cc', 48)?.key === RIDE_ORDER[0], String(targetOn(fMap, 'cc', 48)?.key));

  // An endless encoder must not be bound as a fader: one click would slam the
  // setting to an end.
  const enc = new SurfaceWatcher();
  twist(enc, 20);
  check('an endless encoder is not mistaken for a fader',
    kindsOf(enc).join() === 'encoder', kindsOf(enc).join() || 'nothing');
  const eMap = buildAutoMap(enc.controls(), PRESETS, 16).map;
  check('and is bound as one', eMap.bindings[0]?.mode === 'relative', eMap.bindings[0]?.mode);

  // The other encoder convention: 63 down, 65 up. It has middle values, so the
  // ends-only test cannot see it, and its travel is two counts, so the
  // continuous test would throw it away and the control would simply vanish.
  const centred = new SurfaceWatcher();
  for (let i = 0; i < 10; i++) centred.observe({ kind: 'cc', channel: 0, number: 21, value: i % 2 ? 65 : 63 });
  check('a centred encoder is an encoder too, not nothing at all',
    kindsOf(centred).join() === 'encoder', kindsOf(centred).join() || 'nothing');

  // A button that sends CC rather than a note is still a button.
  const sw = new SurfaceWatcher();
  flick(sw, 64);
  check('a CC that only ever sends 0 and 127 is a button', kindsOf(sw).join() === 'button', kindsOf(sw).join());

  // A grid of pads, with a couple of transport keys off to the side.
  const pads = new SurfaceWatcher();
  for (let n = 0; n < 32; n++) press(pads, n);
  press(pads, 90); press(pads, 91);
  const pMap = buildAutoMap(pads.controls(), PRESETS, 16, 'Pad Grid');
  check('a block of pads becomes the preset grid',
    pMap.summary.presets >= 20, `${pMap.summary.presets} presets`);
  check('and its last row becomes dyes', pMap.summary.dyes === 8, `${pMap.summary.dyes} dyes`);
  check('and the strays become the transport, Go first',
    targetOn(pMap.map, 'note', 90)?.action === 'go', String(targetOn(pMap.map, 'note', 90)?.action));

  // One knob. There is no master to speak of, so it rides rather than dims.
  const one = new SurfaceWatcher();
  sweep(one, 7);
  const oneMap = buildAutoMap(one.controls(), PRESETS, 16).map;
  check('a single knob rides the show rather than dimming it',
    targetOn(oneMap, 'cc', 7)?.key === RIDE_ORDER[0], String(targetOn(oneMap, 'cc', 7)?.key));

  // More settings than faders: the rest go onto shift layers, and something
  // has to be able to reach them.
  const few = new SurfaceWatcher();
  for (let n = 1; n <= 4; n++) sweep(few, n);
  for (let n = 60; n < 63; n++) press(few, n);
  const fewMap = buildAutoMap(few.controls(), PRESETS, 16);
  check('more settings than faders spill onto shift layers',
    fewMap.summary.banks >= 1, `${fewMap.summary.banks} layers deep`);
  check('and a button is given Bank + to reach them',
    fewMap.map.bindings.some(b => b.target.kind === 'action' && b.target.action === 'bank-next'));
  check('while the always-live faders stay always live',
    fewMap.map.bindings.filter(b => b.target.kind === 'setting' && b.bank === undefined).length >= 3,
    `${fewMap.map.bindings.filter(b => b.target.kind === 'setting' && b.bank === undefined).length} with no bank`);

  // A stray message from a controller's handshake is not a control.
  const stray = new SurfaceWatcher();
  stray.observe({ kind: 'cc', channel: 0, number: 121, value: 0 });
  stray.observe({ kind: 'cc', channel: 0, number: 121, value: 0 });
  check('a stray message is not mistaken for a control', stray.controls().length === 0,
    `${stray.controls().length} found`);

  // Nothing touched at all must not produce a map that wipes the old one.
  const nothing = buildAutoMap([], PRESETS, 16);
  check('and nothing touched maps nothing', nothing.map.bindings.length === 0);

  // Two controls must never end up on one binding, whatever the surface.
  const dupes = fMap.bindings.map(b => `${b.source.kind}:${b.source.channel}:${b.source.number}:${b.bank ?? 'all'}`)
    .filter((k, i, a) => a.indexOf(k) !== i);
  check('no control is bound twice on one layer', dupes.length === 0, dupes.join(', '));
}

// ── Saying on screen what the controller hit ────────────────────────
//
// A fader already shows itself: the bar and the hardware go through the same
// number. A pad shows nothing, which in a dark room reads as "did that work?".
// So bindings publish what they fired and the matching control lights.
//
// The part worth checking here is the bus, because it runs at MIDI rate — a
// sweep is a hundred messages a second — and a listener map that grows and
// never shrinks is a leak that would only show up after an hour of a set.
{
  resetTouch();
  check('a target has a stable name',
    touchKey({ kind: 'preset', presetId: 'classic' }) === 'preset:classic'
    && touchKey({ kind: 'dye', paletteIndex: 3 }) === 'dye:3'
    && touchKey({ kind: 'action', action: 'go' }) === 'action:go'
    && touchKey({ kind: 'setting', key: 'dimmer', min: 0, max: 1 }) === 'setting:dimmer');

  let heard = 0;
  const off = subscribeTouch('preset:classic', () => { heard++; });
  touch('preset:classic');
  touch('preset:classic');
  check('a listener hears what it asked for', heard === 2, `${heard} of 2`);

  touch('preset:something-else');
  check('and nothing it did not', heard === 2, `${heard} after a stray`);

  off();
  touch('preset:classic');
  check('and stops when it lets go', heard === 2, `${heard} after unsubscribing`);
  check('leaving nothing behind', touchKeysWatched() === 0, `${touchKeysWatched()} keys still watched`);

  // A row that unmounts while being told — a cue list rebuilt under a press —
  // must not break the loop for everyone after it.
  let a = 0, b = 0;
  let offA = () => {};
  offA = subscribeTouch('preset:x', () => { a++; offA(); });
  const offB = subscribeTouch('preset:x', () => { b++; });
  touch('preset:x');
  check('a listener that unsubscribes mid-flight does not silence the rest',
    a === 1 && b === 1, `a ${a}, b ${b}`);
  offB();

  // Nobody listening is the common case — most keys are never bound — and it
  // has to cost nothing rather than throw.
  resetTouch();
  touch('action:go');
  check('and firing at nobody is harmless', touchKeysWatched() === 0);

  // The activity view watches everything rather than one key, and wants the
  // value with it: a fader that landed somewhere has to say where, and reading
  // the setting back afterwards would race the update that caused it.
  resetTouch();
  const seen = [];
  const offAll = subscribeAllTouches(e => seen.push(e));
  touch('setting:dimmer', 0.4);
  touch('preset:classic');
  check('a watcher hears every kind of touch', seen.length === 2, `${seen.length} of 2`);
  check('and a fader carries where it landed',
    seen[0]?.value === 0.4 && seen[1]?.value === undefined,
    `${seen[0]?.value}, ${seen[1]?.value}`);
  offAll();
  touch('preset:classic');
  check('and a watcher stops when it lets go', seen.length === 2, `${seen.length} after unsubscribing`);
  resetTouch();
}

// ── A knob's LED ring ───────────────────────────────────────────────
//
// Feedback skipped settings entirely, so a controller with rings round its
// knobs showed nothing — and showed nothing *differently* from the truth the
// moment a preset moved forty settings the hardware knew nothing about.
//
// The arithmetic is the inverse of what the message handler does on the way
// in, and it has to be: a knob swept to its stop lighting 126 while a preset
// setting the same value lights 127 is a difference nobody can see but which
// makes the ring flicker whenever both happen.
{
  check('a setting at the bottom of its travel lights nothing', settingLed(0, 0, 1) === 0);
  check('and at the top lights the lot', settingLed(1, 0, 1) === 127);
  check('and halfway is halfway', settingLed(0.5, 0, 1) === 64, String(settingLed(0.5, 0, 1)));
  check('a travel that does not start at zero still reads right',
    settingLed(1, 1, 12) === 0 && settingLed(12, 1, 12) === 127,
    `${settingLed(1, 1, 12)}, ${settingLed(12, 1, 12)}`);
  // A preset may carry a value outside the range a fader was learned over.
  check('and a value past the end is clamped, not wrapped',
    settingLed(1.4, 0, 1) === 127 && settingLed(-3, 0, 1) === 0,
    `${settingLed(1.4, 0, 1)}, ${settingLed(-3, 0, 1)}`);
  check('a range of nothing does not divide by it', Number.isFinite(settingLed(5, 5, 5)));
  // What the handler does on the way in, back out again: a full sweep of a
  // controller's 128 steps has to survive the round trip unchanged.
  const roundTrip = [0, 1, 40, 63, 64, 100, 126, 127]
    .filter(v => settingLed(0 + (v / 127) * 1, 0, 1) !== v);
  check('and what came in comes back out the same', roundTrip.length === 0, roundTrip.join(', '));
}

// ── The way in ──────────────────────────────────────────────────────
//
// Auto-map's logic is checked above with surfaces made up on the spot, but a
// perfect mapper nobody can reach is not a feature. The browser suite cannot
// check the buttons: they only appear once MIDI is on, and the headless
// Chromium the suite drives has no Web MIDI at all, so a DOM check there would
// pass because neither branch existed. So the source is read instead, which is
// a check that can actually fail.
const midiPanel = readFileSync(join(root, 'src/components/MidiPanel.tsx'), 'utf8');
// One home (PLAN 35c-3): the section turns MIDI on, picks the ports and auto-maps; the sheet teaches
// and says the state. So auto-map and its cancel are the section's, and the sheet must not draw
// a second copy of the switch or the map chips.
check('the settings section offers auto-map', panel.includes('settings-midi-auto'));
check('and it can be stopped once started', panel.includes('settings-midi-auto-cancel'));
check('and the settings section has the switch, the ports in and out, and the factory maps',
  ['settings-midi-enable', 'settings-midi-input', 'settings-midi-output', 'settings-midi-factory-'].every(id => panel.includes(id)));
check('the MIDI panel sends the setup there instead of drawing it again',
  midiPanel.includes('midi-setup-open') && midiPanel.includes('midi-state')
  && !['midi-enable', 'midi-auto-start', 'midi-factory-', 'midi-input', 'midi-output'].some(id => midiPanel.includes(`"${id}`) || midiPanel.includes(`\`${id}`)));
// A watcher that swallows every message and is never turned off is a
// controller that has stopped working, with nothing on screen to say why.
const hook = readFileSync(join(root, 'src/hooks/useMidi.ts'), 'utf8');
check('and listening can always be called off in the hook',
  /cancelAutoMap[\s\S]{0,200}watchRef\.current = null/.test(hook)
  && /finishAutoMap[\s\S]{0,300}watchRef\.current = null/.test(hook));

// ── A hand on a fader ───────────────────────────────────────────────
/*
  The one that was reported from a stage rather than found here.

  "The values on the screen don't track with the MIDI controls very well (if
  at all)." The read-back was late: soft takeover compares the fader's
  position against the setting's value and uses the same comparison to notice
  somebody *else* moving the setting, and reading that out of React state
  meant reading a value several messages old. So a fader moved at any speed
  looked like an edit from elsewhere on every message — it dropped its pickup,
  then refused to take it back, because the value it was asked to cross was
  the stale one it had just been stranded at.

  This drives a real sweep through the real classes and counts what lands. It
  is the shape of check this repository wants: before the fix, `a swept fader
  arrives where the fader is` reported 0.535 with the fader at 1.0.
*/
const sweep = (ride, { from = 64, to = 127, step, perFrame = 4 }) => {
  const takeover = new SoftTakeover();
  /*
    What the app renders. The lag being modelled is *when* a render happens,
    not what it contains: a MIDI callback is its own task, so React has
    nothing to batch it with and renders when it gets round to it — but the
    render it does do always carries every update already queued. So `live`
    only moves on a frame boundary, and between boundaries the fader has
    nothing but the ride's own word for where the setting is.
  */
  const live = { dimmer: 0.5 };
  let landed = 0, total = 0, since = 0;
  const frame = () => {
    const patch = ride.drain();
    if (patch) Object.assign(live, patch);
    ride.observe(live);
  };
  for (let v = from; v <= to; v += step) {
    total++;
    const out = takeover.ride('b1', v / 127, ride.read('dimmer', live) ?? 0);
    if (out !== null) { ride.write('dimmer', out); landed++; }
    if (++since >= perFrame) { since = 0; frame(); }
  }
  frame();
  // Where the fader actually finished, which for a step that does not divide
  // the travel is not the top. Asserting 1.0 would be asserting the sweep's
  // arithmetic rather than the ride's.
  let last = from;
  for (let v = from; v <= to; v += step) last = v;
  return { landed, total, settled: live.dimmer, fader: last / 127 };
};

for (const step of [1, 4, 8]) {
  const r = sweep(new SettingRide(), { step });
  check(`a fader swept in steps of ${step} lands every message`,
    r.landed === r.total, `${r.landed}/${r.total}`);
  check(`and a sweep in steps of ${step} arrives where the fader is`,
    Math.abs(r.settled - r.fader) < 0.001, `fader ${r.fader.toFixed(3)}, setting ${r.settled?.toFixed(3)}`);
}

// Soft takeover still does its job: a fader parked away from the value waits.
{
  const t = new SoftTakeover();
  check('a fader parked away from the value is ignored until it crosses',
    t.ride('b1', 0.9, 0.2) === null && t.ride('b1', 0.8, 0.2) === null);
  check('and picks up when it gets there',
    t.ride('b1', 0.1, 0.2) !== null);
  check('and keeps riding once it has',
    t.ride('b1', 0.05, 0.1) !== null && t.ride('b1', 0.0, 0.05) !== null);
}
// And the reason it exists: a preset moving the setting must drop the pickup,
// or the next twitch of a fader left at the top slams the look back.
{
  const t = new SoftTakeover();
  t.ride('b1', 0.5, 0.5);
  check('a preset moving the setting takes the pickup away',
    t.ride('b1', 0.52, 0.1) === null, 'fader at 0.52, preset put it at 0.1');
}

// The ride's shadow: late is not an edit, but an edit is.
{
  const ride = new SettingRide();
  const live = { dimmer: 0.5 };
  ride.write('dimmer', 0.8);
  check('a write is readable before React has seen it', ride.read('dimmer', live) === 0.8);
  ride.observe(live);            // a render for some other reason, before the frame
  check('and survives a render that happens before the frame', ride.read('dimmer', live) === 0.8);
  ride.drain();
  Object.assign(live, { dimmer: 0.8 });
  ride.observe(live);
  check('and agrees once React has it', ride.read('dimmer', live) === 0.8);
  live.dimmer = 0.2;             // a preset
  ride.observe(live);
  check('but gives way to something else moving it', ride.read('dimmer', live) === 0.2);
}
check('nothing to hand over is no React update at all', new SettingRide().drain() === null);
{
  const ride = new SettingRide();
  ride.write('dimmer', 0.4);
  ride.drain();
  check('and a value written twice is only handed over once',
    ride.write('dimmer', 0.4) === undefined && ride.drain() === null);
}

/*
  The plate's own read of the ride (PLAN.md §14f, `lay`): what a frame draws
  while React is told ten times a second. #348's first try laid the whole
  shadow over every frame and went back for three faults; the first two are
  the ride's to answer, and are held here (the third, every reader in the
  frame loop reading one object, is the visualizer's, and `npm run renders`
  holds it on the Mac by counting the frames that draw a ride).
*/
{
  const all = () => true;
  const ride = new SettingRide();
  const slot = rideSlot();
  let base = { dimmer: 0.5, bloom: 0.3 };
  check('a plate with nothing ridden draws what React rendered, the same object', ride.lay(base, all, slot) === base);
  ride.write('dimmer', 0.8);
  const a = ride.lay(base, all, slot);
  check('a move React has not rendered is drawn at once', a !== base && a.dimmer === 0.8 && a.bloom === 0.3 && base.dimmer === 0.5);
  check('and the next frame with nothing new is handed the same object, not a copy', ride.lay(base, all, slot) === a);
  ride.write('dimmer', 0.9);
  const b = ride.lay(base, all, slot);
  check('and a new move is a new object', b !== a && b.dimmer === 0.9);
  // React renders the move: from then on, no frame copies anything.
  ride.drain();
  base = { ...base, dimmer: 0.9 };
  ride.observe(base);
  let copies = 0;
  for (let i = 0; i < 3600; i++) if (ride.lay(base, all, slot) !== base) copies++;
  check('once React has the move, a minute of frames lays nothing (it laid every frame for good)', copies === 0, `${copies} of 3600 frames copied`);
  check('while the fader still answers for itself', ride.read('dimmer', base) === 0.9);
}
{
  // The identified track overrides the key the fader moves: the track wins
  // in what is drawn, as it does in what React renders (effectiveSettings).
  const ride = new SettingRide();
  const overridden = new Set(['dimmer']);
  const notOverridden = (k) => !overridden.has(k);
  const drawn = { dimmer: 0.9, bloom: 0.3 };   // the track asks 0.9
  ride.write('dimmer', 0.6);
  ride.write('bloom', 0.5);
  const out = ride.lay(drawn, notOverridden, rideSlot());
  check('a fader never lays over a key the track overrides', out.dimmer === 0.9, `drew ${out.dimmer}, the track asks 0.9`);
  check('and still lays the keys the track leaves alone', out.bloom === 0.5);
  check('and a ride on nothing but overridden keys copies nothing',
    (() => { const r = new SettingRide(); r.write('dimmer', 0.6); return r.lay(drawn, notOverridden, rideSlot()) === drawn; })());
}
{
  // A preset moving the setting takes it back from the fader, on the plate too.
  const ride = new SettingRide();
  const slot = rideSlot();
  const live = { dimmer: 0.5 };
  ride.write('dimmer', 0.8);
  ride.drain();
  Object.assign(live, { dimmer: 0.8 });
  ride.observe(live);
  const preset = { dimmer: 0.2 };
  ride.observe(preset);
  check('a preset that moves the setting is what the plate draws', ride.lay(preset, () => true, slot) === preset);
}

/*
  An endless encoder had the same wound, from the other side.

  A relative binding adds its nudge to the value it reads, so every message
  that read a stale value added its step to a total that had already moved on
  — and a fast spin, which is the only way anyone spins an encoder, threw
  away most of its travel. Nothing about soft takeover involved: just the
  read-back. Forty clicks of +1 on a 0..1 setting is 0.40, and it has to be
  0.40 whether React rendered once in the middle or not at all.
*/
{
  const ride = new SettingRide();
  const live = { granulation: 0 };
  const CLICKS = 40, PER_CLICK = 1 / 100;   // `relativeDelta` of 1, span of 1
  for (let i = 0; i < CLICKS; i++) {
    const cur = ride.read('granulation', live) ?? 0;
    ride.write('granulation', Math.min(1, cur + PER_CLICK));
    if (i % 7 === 6) { const p = ride.drain(); if (p) Object.assign(live, p); ride.observe(live); }
  }
  const p = ride.drain(); if (p) Object.assign(live, p); ride.observe(live);
  check('an encoder spun fast keeps every click',
    Math.abs(live.granulation - CLICKS * PER_CLICK) < 1e-9,
    `${live.granulation.toFixed(3)} of ${(CLICKS * PER_CLICK).toFixed(2)}`);
}

/*
  A held fader must not then report that it moved.

  `break` inside the handler's switch leaves the switch, not the binding loop,
  so the held branch fell straight through to the report at the bottom of that
  loop — which reads the setting back and says where it landed. The readout
  would have shown "pick up at 50%" and then immediately overwritten it with a
  plain reading of a value the fader had not set, which is the one thing a
  readout must never do. Checked in the source because the handler needs a
  controller and a React tree to run at all.
*/
check('a held fader says it is waiting',
  /touch\(touchKey\(t\), cur === undefined \? undefined : cur, now, 'pickup'\)/.test(hook));
check('and does not then say it moved',
  /if \(!held && \(t\.kind === 'setting'/.test(hook));
// Feedback never argues with a hand on a control.
check('and feedback does not talk back to a control being moved',
  /heardRef\.current\.get\(k\)/.test(hook) && /HANDS_OFF_MS/.test(hook));

// ── Drain and Clear reach the render loop ───────────────────────────
/*
  Also reported from a stage: "I'm not sure the drain button does anything."
  It did not. Both are counters the render loop compares against what it last
  acted on, but the loop lives inside one very large effect whose dependencies
  are `[noise2D, seedCount, glEpoch]` — so a press that raised the counter did
  not re-run it, and the loop went on reading the value captured when the GL
  context was built. The plate drained on the *next* Seed, one press late.

  A DOM check cannot see this: the button dispatches, the state changes, and
  everything looks right from outside. So the loop's own read is checked here.
*/
check('the render loop reads Drain live, not from a closure',
  /drainTriggerRef\.current > lastDrainTrigger\.current/.test(panel0)
  && !/if \(drainTrigger > lastDrainTrigger\.current\)/.test(panel0));
check('and Clear the same way',
  /clearTriggerRef\.current > lastClearTrigger\.current/.test(panel0)
  && !/if \(clearTrigger > lastClearTrigger\.current\)/.test(panel0));
check('and both refs are kept up to date',
  /drainTriggerRef\.current = drainTrigger/.test(panel0)
  && /clearTriggerRef\.current = clearTrigger/.test(panel0));
/*
  And Seed, which is why the other two went unnoticed: it is the same kind of
  counter, and it worked — because it was in the effect's dependency list. So
  every press was rebuilding the whole GL context to deliver one integer. The
  behavioural side of this is counted in qa (context acquisitions across four
  presses); here the dependency list itself is checked, because that is the
  part that would quietly come back the next time somebody needed a value in
  the loop and reached for the nearest tool.
*/
check('Seed reaches the render loop through a ref too',
  /seedCountRef\.current > lastSeedCount\.current/.test(panel0)
  && /seedCountRef\.current = seedCount/.test(panel0));
check('and nothing but a lost context rebuilds the renderer',
  /\}, \[noise2D, glEpoch\]\);/.test(panel0) && !/\[noise2D, seedCount, glEpoch\]/.test(panel0));

// ── Every status dot goes somewhere ─────────────────────────────────
/*
  A dot that reports an input and cannot be clicked is half a control: it is
  the one place on either desk that names the state of the microphone, so it
  is where a hand goes when the microphone is the problem.
*/
const header = readFileSync(join(root, 'src/components/desk/DeskHeader.tsx'), 'utf8');
for (const [dot, handler] of [['sound', 'onSound'], ['video', 'onVideo'], ['midi', 'onMidi']]) {
  check(`the ${dot} dot opens something`,
    new RegExp(`dots\\.${dot}[\\s\\S]{0,240}onClick=\\{${handler}\\}`).test(header)
    || new RegExp(`onClick=\\{${handler}\\}[\\s\\S]{0,240}dot-${dot}`).test(header));
}
// And the place the mic dot opens has to be able to change the mic.
check('and the Sound section names the source and leads to the sheet that chooses it, with the device beside',
  panel.includes('data-testid="audio-source-state"') && panel.includes('data-testid="audio-source-open"')
  && panel.includes('data-testid="audio-input"'));
// One home each (PLAN 35c-3): the switch is drawn once, not in the section and the sheet both.
check('and the source is chosen in the Sound sheet alone',
  !panel.includes('testId="audio-source"') && readFileSync(join(root, 'src/components/SoundPanel.tsx'), 'utf8').includes('sound-source-${s.id}'));
check('and the sections the dots aim at exist',
  ['audio-input', 'projectors'].every(id => SECTION_BY_ID.has(id)));

// ── One name per thing ──────────────────────────────────────────────
/*
  A usability pass over the shipped build found the same idea wearing several
  names, which is the kind of thing that only shows up when you read every
  screen at once and is invisible in any one of them.

  These are cheap to check and were all real: the section called "Audio
  Mappings" in an app whose every control says Sound; the one setting labelled
  "Global Speed" in the panel and "Speed" on the desk; and the palette command
  named "Settings" while the button that does the same thing says "All
  settings…", so typing the words on the button matched nothing at all.
*/
const app = appSource();
const guide = readFileSync(join(root, 'src/components/GuidePanel.tsx'), 'utf8');
check('the app says Sound, never Audio, to the person using it',
  !/name: 'Audio Mappings'/.test(readFileSync(join(root, 'src/lib/settingsMap.ts'), 'utf8'))
  && !/> Audio Mappings/.test(panel) && !/Inputs → Audio Mappings/.test(guide));
check('and one setting does not answer to two names',
  !/label="Global Speed"/.test(panel) && /label="Speed"/.test(panel));
check('and the palette finds the button by the words on it',
  /id: 'open-settings', name: 'All settings'/.test(app));
check('and one action has one name',
  /'lucky': 'Randomise'/.test(readFileSync(join(root, 'src/lib/midi.ts'), 'utf8')));

/*
  Names that collided, or said the opposite of what the control does.

  "Camera" was a section, the room's camera, the film's camera source and a
  slider. "Zoom" was the kaleidoscope's and the macro's, and "Spin" the
  kaleidoscope's with nothing to say so; "Lacing" was the look's and the
  closeup's. "Damping (Friction)" went up as the friction went down, "Grain
  Size" went up as the grain got finer, "Blow Velocity" had nothing to do with
  the Blow tool, and the room's "Mirror" sat a section away from the mirror
  rig. Each keeps its key — saved looks, maps and patches name those — and has
  one name wherever it is shown.
*/
const RENAMED = {
  camera: 'Lens', layerCount: 'Layers', kaleidoSpin: 'Kaleido Spin', kaleidoZoom: 'Kaleido Zoom',
  macroZoom: 'Macro Zoom', macroLacing: 'Macro Lacing', damping: 'Momentum',
  grainScale: 'Grain Fineness', airVelocity: 'Updraft', vibrationFrequency: 'Vibration',
};
const misnamed = Object.entries(RENAMED).filter(([k, name]) =>
  sliders.find(s => s.key === k)?.label !== name || PIN_RANGE.get(k)?.label !== name);
check('a renamed control has its new name on the sheet and on every desk, fader and stage',
  misnamed.length === 0,
  misnamed.map(([k, name]) => `${k}: sheet "${sliders.find(s => s.key === k)?.label}", registry "${PIN_RANGE.get(k)?.label}", wanted "${name}"`).join(' · '));
check('and on the phone', /<Slider label="Macro Zoom" field="macroZoom"/.test(remote));
check('and no reason a control is greyed names one by its old name',
  !/needs Camera above 0|Projector Layers|add a patch under The Room|add a mapping under The Room/.test(panel));
check('and the room camera flips rather than mirrors',
  /data-testid="scene-mirror"[\s\S]{0,200}Flip Camera/.test(panel) && !/>\s*Mirror\s*</.test(sectionSource('room')));

// A footer written for one long scroll, now under every section of seventeen.
check('no section carries another section\'s footnote',
  !/Squish Plate effect was the hallmark/.test(panel));

/*
  How a value reads, asked in one place.

  This used to look for the formatter inside PerformDesk, because that is where
  a copy of it lived — and so did another copy in DesignDesk, and a third rule
  in the settings panel, which is how `4.00×` and `4.00x` and `1.00` for a
  dimmer the desk called 100% all shipped together. There is one now, and the
  check reads it there and confirms the copies are gone.
*/
// The two desks became one (Desk v2): its panels are in DeskPanels, its frame in Desk.
const deskSrc = readFileSync(join(root, 'src/components/desk/Desk.tsx'), 'utf8');
const readout = readFileSync(join(root, 'src/lib/readout.ts'), 'utf8');
check('a value reads the same way wherever it is shown',
  /export function readSetting/.test(readout)
  && !/const READS/.test(deskPanelsSrc) && !/const READS/.test(deskSrc));
{
  // Every strip on the desk (rides, the recipe, a section's knobs) is one
  // DeskControl, so the question is asked once, and asked there.
  const control = deskPanelsSrc.slice(deskPanelsSrc.indexOf('function DeskControl'), deskPanelsSrc.indexOf('function ControlGrid'));
  const ownReads = (deskPanelsSrc.match(/readSetting\(/g) ?? []).length;
  check('and every ride is a share of its travel unless it has a unit',
    /macroZoom:  v => `\$\{v\.toFixed\(2\)\}×`/.test(readout)
    && !/globalSpeed:/.test(readout)
    && /readSetting\(String\(key\), v, spec\.min, spec\.max\)/.test(control)
    && ownReads === 1,
    `${ownReads} readSetting call${ownReads === 1 ? '' : 's'} in the desk's panels`);
}
check('and the settings panel asks the same question',
  /readSetting\(String\(settingKey \?\? ''\), safeValue, min, max\)/.test(panel));

// A line telling you where to go, where a button could take you.
check('the no-controller line goes there instead of naming the route',
  /data-testid="no-controller-hint"/.test(deskPanelsSrc) && !/Settings → MIDI to learn one/.test(deskPanelsSrc));

// ── A document, and a desk that is not a performance ────────────────
/*
  Three behaviours with no home in a DOM check, because each is about what
  does *not* happen.

  A sequence rewrites the settings on a clock and Design is where those same
  settings are chosen by hand, so a look being built was edited underneath the
  person building it every few seconds. Design suspends the sequencer now, and
  a new song no longer gets to replace the look either — that was the other
  thing changing settings without being asked. Neither is visible from outside
  without waiting out a stage, which is why they are read here.

  And there was no document: Save always made a *new* saved look and always
  put a file on disk, so twenty minutes of building produced twenty looks and
  twenty files with no way to write over the one in hand, and no way to begin
  from nothing.
*/
const seqHook = readFileSync(join(root, 'src/hooks/useShowSequencer.ts'), 'utf8');
const presetHook = readFileSync(join(root, 'src/hooks/useUserPresets.ts'), 'utf8');
check('a sequence can be held', /suspended\?: boolean/.test(seqHook) && /if \(a\.suspended\)/.test(seqHook));
check('and Design holds it', /suspended: designing/.test(app));
check('and a new song does not repaint a look being built', /if \(designing\) return;/.test(app));

check('saving can write over the look in hand', /const saveOver = useCallback/.test(presetHook));
check('and saving is no longer a download', !/upsert\(p\);\n    downloadText/.test(presetHook) && /const exportPreset/.test(presetHook));
check('and there is a way to start from nothing',
  /const newLook = \(\) => \{/.test(app) && /setSettings\(\{ \.\.\.DEFAULT_SETTINGS \}\)/.test(app));
check('and the document says when it is unsaved', /setDocDirty\(true\)/.test(app) && /edited=\{docDirty\}/.test(app));
// One flag, not two: `lookEdited` was derived from the pinned preset and could
// not be true of an empty plate somebody had since painted.
check('and only one thing decides that', !/const lookEdited =/.test(app));

/*
  The opening look is drawn from the show's seeded stream now (lib/rng.ts,
  `npm run seed`), not from Math.random, so a render opens on the look it
  opened on before. What this held — that a visitor does not arrive on the
  same look every time — is held the same way, with one more link: the pick
  is from the pool, and the seed it is keyed on is drawn fresh each load
  (crypto) unless ?seed= fixes it.
*/
const rngSource = readFileSync(join(root, 'src/lib/rng.ts'), 'utf8');
check('the opening look is not always the same one',
  /export const OPENING_LOOK/.test(app) && /stream\('show\.opening'\)\.pick\(pool\)/.test(app)
    && /current = asked \?\? drawStartupSeed\(\)/.test(rngSource) && /getRandomValues\(new Uint32Array\(1\)\)/.test(rngSource));
check('and can be pinned so a harness is not random', /get\('look'\)/.test(app));

// ── The mirror rig ──────────────────────────────────────────────────
/*
  Two of its three dimensions were constants in the shader — `u_time * 0.02`
  for the spin and `rad * 0.72` for the zoom — so the one optical trick people
  reach for mid-song had exactly one control, three-quarters of the way down a
  section called Show whose own terms list is a drawer rather than a subject.

  The phase is integrated on the CPU rather than derived from elapsed time,
  which is the part worth gating: a rate multiplied by elapsed time moves the
  whole history, so every nudge of the speed used to jump the pattern to a new
  angle. That is invisible from outside and would come back the moment
  somebody simplified it.
*/
// The rig is half in the component and half in the shader — the phase is
// integrated on the CPU and spent in the shader, which is WGSL since the
// cutover (docs/webgpu-plan.md, P7) — so both are read.
const vis = panel0 + readFileSync(join(root, 'src/gpu/wgsl/plate.ts'), 'utf8')
  + readFileSync(join(root, 'src/gpu/wgsl/plateFields.ts'), 'utf8');
check('the mirror rig turns at a rate somebody can set',
  /name: 'kaleidoPhase'/.test(vis) && !/a \+= U\.time \* 0\.02/.test(vis));
check('and its phase is integrated, not multiplied out of elapsed time',
  /kaleidoPhaseRef\.current \+= \(currentSettings\.kaleidoSpin/.test(vis) && /realDt/.test(vis));
check('and how much plate feeds a wedge is a setting too',
  /name: 'kaleidoZoom'/.test(vis) && !/rad \* 0\.72/.test(vis));
check('and all three can reach a controller',
  ['kaleidoscope', 'kaleidoSpin', 'kaleidoZoom'].every(k => PIN_RANGE.has(k)));
check('and they live together rather than in the Show drawer',
  SECTION_BY_ID.has('kaleidoscope')
  && ['kaleidoscope', 'kaleidoSpin', 'kaleidoZoom'].every(k => PIN_RANGE.get(k)?.section === 'kaleidoscope'));

// ── The defaults ────────────────────────────────────────────────────
const badRides = DEFAULT_RIDES.filter(k => !PIN_RANGE.has(String(k)));
check('the desk starts with controls that exist', badRides.length === 0, badRides.join(', '));
const badRecipe = DEFAULT_RECIPE.filter(k => !PIN_RANGE.has(String(k)));
check('the bench starts with controls that exist', badRecipe.length === 0, badRecipe.join(', '));
check('and neither starts over the limit',
  DEFAULT_RIDES.length <= MAX_PINS && DEFAULT_RECIPE.length <= MAX_PINS,
  `${DEFAULT_RIDES.length} rides, ${DEFAULT_RECIPE.length} recipe, limit ${MAX_PINS}`);

// ── And the other direction: a setting nothing can reach ────────────
//
// The check above asks that every control the panel draws is one a desk can
// hold. It says nothing about a setting that is drawn *nowhere* — declared,
// defaulted, set by all thirty-two presets and rolled by the dice, with no
// slider, no pin and no phone control anywhere.
//
// Two were found that way, and two more went the other way: `heatIntensity`
// and `boilingPoint` were read by nothing, so they were deleted rather than
// given a slider (docs/bubbles-plan.md says why).
//
// `surfaceTension` is the plate's own film tension,
// read by the solver, carried by every preset between 0.01 and 0.3, and
// reachable from nothing. `surge` shapes the automation into gusts with quiet
// between — the thing that makes a plate look worked-on rather than busy —
// same story.
//
// The exceptions are listed by name rather than by a rule, because each is a
// decision and a rule would hide the next one.
{
  const KNOWN = new Set([
    // Set by the zoom, which is the control; the flag rides along.
    'macroMode', 'macroZoom',
    // The paper backdrop's two colours: a look's, chosen with the dyes.
    'paperA', 'paperB',
    // The mixer's order: its rows' arrows and the four raise pads, which are
    // moves in a stack rather than a value a slider could hold (lib/mixer.ts).
    'mixOrder',
    // The mixer's blends: five buttons in each row's drawer (MixerPanel,
    // drawn in Settings → Mixer, on the desk and on the phone) and a Next
    // Blend pad per row, not a slider or a select on this sheet. `npm run phone`
    // presses them.
    'ledBlend', 'gelBlend', 'lumiaBlend', 'backBlend', 'filmBlend', 'markBlend',
  ]);
  const panelSrc = readFileSync(join(root, 'src/components/SettingsPanel.tsx'), 'utf8');
  const drawn = new Set([
    ...[...panelSrc.matchAll(/settingKey="([A-Za-z0-9_]+)"/g)].map(m => m[1]),
    ...[...panelSrc.matchAll(/onUpdate\(\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map(m => m[1]),
  ]);
  const orphans = Object.keys(DEFAULT_SETTINGS)
    .filter(k => !drawn.has(k) && !PIN_RANGE.has(k) && !KNOWN.has(k));
  check('every setting can be reached from somewhere',
    orphans.length === 0,
    orphans.length ? `${orphans.join(', ')} — add a control, or name it in this check's list and say why`
      : `${Object.keys(DEFAULT_SETTINGS).length} settings, ${KNOWN.size} deliberately without one`);
}

/*
  An unattended look change never leaves the closeup half-applied.

  `evolvedLook` holds the structure and lets everything else drift. The trap is
  a control that is *two* settings: `luckyLook` rolls `macroMode` and
  `macroZoom` together, deliberately, so the flag follows the zoom — and
  holding one of them while letting the other through recreates precisely the
  disagreement that pairing exists to avoid. It shipped three times as a
  spinning square filling the plate: magnified eight times with the flag off,
  the plate's square edge and slow turn are the whole picture.

  So this rolls the dice against a plate that is not in closeup, evolves it,
  and asks that it is still not in closeup — the zoom as well as the flag.
*/
{
  const rand = (() => { let s = 12345; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  const flat = { ...DEFAULT_SETTINGS, macroMode: false, macroZoom: 1 };
  let worst = 1;
  for (let i = 0; i < 400; i++) {
    const next = evolvedLook(flat, luckyLook(flat, ['#ff0000', '#00ff00'], rand));
    if (next.macroMode !== flat.macroMode) { worst = -1; break; }
    worst = Math.max(worst, next.macroZoom ?? 1);
  }
  check('an unattended look change cannot zoom a plate that is not in closeup',
    worst <= 1.001,
    worst < 0 ? 'it changed macroMode, which structure is supposed to hold'
      : `four hundred rolls, the largest zoom that got through was ${worst.toFixed(2)}`);
}

// ── And one level down: a setting the engine never reads ────────────
//
// The check above asks whether a setting can be *reached*. It cannot ask
// whether reaching it does anything, and that is a different fault with the
// same cause.
//
// `surfaceTension` was written by all thirty-two presets, defaulted, rolled by
// the dice — and read by nothing. It survived because the solver has a local
// variable of the same name, derived from `polarity` and `blobSurfaceTension`,
// which it hands to the params object as `p.surfaceTension`. An audit looking
// for `.surfaceTension` finds those and calls the setting live. It was not:
// the presets' own comments for it describe what `blobSurfaceTension` does,
// and each preset that set both said the same thing twice. The local is now
// called `immiscibility` so the name cannot lie again, and this check is here
// so the next one does not need the name to be honest.
//
// Two things this had to learn the hard way, both of them the same rule —
// run the control, on a commit that still has the bug:
//
//   · `p` is not in RECEIVERS. Letting the params object count is the fault.
//   · The panel is not a read. A slider reads its own key to draw its handle,
//     so the first version of this check passed on the very setting it was
//     written to catch.
{
  const RECEIVERS = '(?:settings|currentSettings|s|look|next|prev|cur|base|a|b|current|ctx)';
  // The plumbing that copies settings about, which is not the engine using one.
  const PLUMBING = new Set(['presets.ts', 'types.ts', 'SettingsPanel.tsx',
                            'deskPins.ts', 'lucky.ts', 'lookFade.ts']);
  const body = readdirSync(join(root, 'src'), { recursive: true })
    .filter(f => /\.tsx?$/.test(f) && !PLUMBING.has(f.split('/').pop()))
    .map(f => readFileSync(join(root, 'src', f), 'utf8'))
    .join('\n');
  // `patch.layer(l)` is the frame reading one plate's settings (its dish's
  // motor, since PLAN 22j took the motor out of the solver).
  const unread = Object.keys(DEFAULT_SETTINGS)
    .filter(k => !new RegExp(`(?:\\b${RECEIVERS}|\\bpatch\\.layer\\(l\\))\\s*\\??\\.${k}\\b`).test(body));
  check('every setting is read by something that renders',
    unread.length === 0,
    unread.length ? `${unread.join(', ')} — nothing in src reads it; delete it or wire it`
      : `${Object.keys(DEFAULT_SETTINGS).length} settings, all read`);
}

// ── The looks and the defaults, against the same ranges ─────────────
//
// The dice were one of three lists of what a setting may be. These are the
// other two, and they drift the same way for the same reason — a range is
// tightened in one place and the others are not edited, because nothing
// connects them. A value outside the desk's range is not a crash: it is a
// look that is fine until somebody pins that control, and then the first
// touch of the fader jumps the plate to the nearest end.
{
  const outside = (label, entries) => {
    const out = [];
    for (const [owner, settings] of entries) {
      for (const [key, v] of Object.entries(settings)) {
        const spec = PIN_RANGE.get(key);
        if (!spec || typeof v !== 'number' || typeof spec.min !== 'number' || typeof spec.max !== 'number') continue;
        const slack = Math.max(1e-9, (spec.max - spec.min) * 1e-6);
        if (v < spec.min - slack || v > spec.max + slack) out.push(`${owner}.${key}=${v} (desk ${spec.min}..${spec.max})`);
      }
    }
    check(label, out.length === 0, out.length ? `${out.length}: ${out.slice(0, 5).join('; ')}` : `${entries.length} checked`);
  };
  outside('every look sits inside the range the desk rides', PRESETS.map(p => [p.id, p.settings]));
  outside('and so does every default', [['default', DEFAULT_SETTINGS]]);
}

// ── A roll of the dice, against the ranges everything else uses ─────
//
// "Randomise the look" is a third list of what a setting may be, beside the
// presets and the desk's own ranges — and it is the one nobody edits when a
// range changes, because it lives in a click handler rather than anywhere a
// range is declared. It was an object literal inside `App.tsx` until this
// check needed it; `src/lib/lucky.ts` exists so this can hold it.
//
// Two things had gone wrong in there and neither was visible from anywhere:
// it rolled dye diffusion ten times over the ceiling every look is under,
// which washes the dye into an even film, and it rolled speed half as far
// again as the fastest look it could replace. Both were found by somebody
// watching the plate, which is the expensive way.
{
  /** mulberry32, so a failure here is the same failure tomorrow. */
  const seeded = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ROLLS = 500;
  const rolls = [];
  for (let i = 0; i < ROLLS; i++) rolls.push(luckyLook(DEFAULT_SETTINGS, ['#ff0000', '#00ff00'], seeded(i * 7919 + 13)));

  // 1. Complete. A literal naming 85 of the 118 settings leaves 33 undefined,
  //    and because every one of them is read as `x ?? default` downstream,
  //    that is not a crash — it is beads, cells, lacing, granulation,
  //    sharpness, dish spread and fingering silently switching off.
  const wanted = Object.keys(DEFAULT_SETTINGS);
  const blank = new Set();
  for (const r of rolls) for (const k of wanted) if (r[k] === undefined) blank.add(k);
  check('a random look defines every setting it hands over',
    blank.size === 0, blank.size ? `${blank.size} left undefined: ${[...blank].sort().join(', ')}` : `all ${wanted.length}`);

  // 2. Finite. A NaN reaches the shader as a black plate.
  /*
    And the backdrop has two colours in it.

    In photo mode the whole frame is `mix(paperA, paperB, g)`. Rolled
    independently the two came up identical in 1.6% of all rolls — a flat
    saturated field, no gradient, dye thin on top of it: the reported "the
    entire plate goes to a single colour" and the yellow screen that filled
    the view. One roll in sixty-three is often enough to hit inside a set and
    rare enough that twelve rolls of `npm run evolve` never saw it, which is
    why it is checked here, where five hundred are rolled for free.
  */
  {
    const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    let worst = Infinity, pair = null;
    for (const r of rolls) {
      if (r.renderStyle !== 'photo' || !r.paperA || !r.paperB) continue;
      const [a, b, c] = rgb(r.paperA), [x, y, z] = rgb(r.paperB);
      const d = Math.hypot(a - x, b - y, c - z);
      if (d < worst) { worst = d; pair = `${r.paperA}/${r.paperB}`; }
    }
    /*
    And it never rolls the dish shut.

    `dishVignette` darkens beyond the dish's rim. Rolled at 0.4 to 1.0 in
    three rolls out of ten, the top of that range closes the dish to a
    pinhole: over forty random looks, six came out dark or covered, and this
    one setting separated those six from the rest by five standard deviations
    — 0.905 against 0.052 — with nothing else within one and a half. One roll
    in seven was a dark screen. No preset in the tree raises it at all.

    Same fault as the backdrop's two colours being rolled independently: the
    randomiser reaching outside the range any real look uses. Measured after:
    six in forty down to two or three.
  */
  {
    let worst = 0;
    for (const r of rolls) if ((r.dishVignette ?? 0) > worst) worst = r.dishVignette;
    check('a random look never rolls the dish shut', worst <= 0.5,
      `the heaviest vignette over ${ROLLS} rolls was ${worst.toFixed(3)}`);
  }

  check('a photo look never puts the plate on one flat colour',
      worst >= 60,
      worst === Infinity ? 'no photo rolls' : `closest pair over ${ROLLS} rolls: ${pair}, ${worst.toFixed(0)} apart`);
  }

  const nan = new Set();
  for (const r of rolls) for (const k of wanted) if (typeof r[k] === 'number' && !Number.isFinite(r[k])) nan.add(k);
  check('and every number in it is a number', nan.size === 0, [...nan].join(', ') || 'all finite');

  // 3. Inside the range the desks and MIDI ride. A roll outside it is a look
  //    nobody can pin, reach, or get back to.
  const out = [];
  for (const [key, spec] of PIN_RANGE) {
    if (typeof spec.min !== 'number' || typeof spec.max !== 'number') continue;
    let lo = Infinity, hi = -Infinity;
    for (const r of rolls) {
      const v = r[key];
      if (typeof v !== 'number') continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo === Infinity) continue;
    // A hair of tolerance for the arithmetic, not for the range.
    const slack = Math.max(1e-9, (spec.max - spec.min) * 1e-6);
    if (lo < spec.min - slack || hi > spec.max + slack) {
      out.push(`${key} rolls ${lo.toPrecision(3)}..${hi.toPrecision(3)}, desk says ${spec.min}..${spec.max}`);
    }
  }
  check('every setting a roll lands on is inside the range the desk rides',
    out.length === 0, out.join('; ') || `${PIN_RANGE.size} controls checked over ${ROLLS} rolls`);

  // 4. And as fast as the looks are. Speed is the one that drifted furthest:
  //    every preset was scaled to 0.6 of its old value and this was not, so a
  //    roll came out faster than anything it could replace.
  const speeds = PRESETS.map(p => p.settings.globalSpeed).filter(v => typeof v === 'number').sort((a, b) => a - b);
  const rolled = rolls.map(r => r.globalSpeed).sort((a, b) => a - b);
  const mid = (a) => a[Math.floor(a.length / 2)];
  check('a random look runs at about the speed the looks run at',
    mid(rolled) >= mid(speeds) * 0.5 && mid(rolled) <= mid(speeds) * 2,
    `roll median ${mid(rolled).toFixed(4)}, the ${speeds.length} looks' median ${mid(speeds).toFixed(4)}` +
    ` (looks span ${speeds[0]}..${speeds[speeds.length - 1]})`);
}

// ── Every tool is reachable, and every reachable tool does something ──
/*
  The finger shipped to one desk and one hand.

  It was added to the Perform desk and to the local pointer, and nothing else
  learned it: `performGesture` — the single door every other hand comes
  through, the phone pad, a pen, the gamepad, OSC, a replayed performance and
  the room camera — had no case for it, so a finger from any of them fell to
  `default` and *dropped dye*, which is the opposite of mixing. The Design
  desk never offered it, the keyboard map had no `g` though the desk printed
  the shortcut, and the remote protocol had no such message.

  Five places, one feature, and every one of them silent. So the tools are
  checked from both ends: nothing on a desk that the engine ignores, and
  nothing in the engine that no desk can reach.
*/
{
  // One desk since Desk v2: the Tools panel is the one list of tools, and
  // Build and Gig (the old Design and Perform) both ship with it out.
  const desk = readFileSync(join(root, 'src/components/desk/DeskPanels.tsx'), 'utf8');
  const shared = readFileSync(join(root, 'src/components/desk/tools.ts'), 'utf8');
  // The list itself, wherever it lives: a desk's own `TOOLS = [...]`, or the
  // shared `DESK_TOOLS` both desks now take theirs from.
  const toolsOf = (src) => {
    const m = src.match(/const (?:DESK_)?TOOLS = \[([\s\S]*?)\] as const;/);
    if (m) return [...m[1].matchAll(/\['([a-z]+)'/g)].map(x => x[1]);
    return /const TOOLS = DESK_TOOLS;/.test(src) ? toolsOf(shared) : [];
  };
  const onDesks = new Set(toolsOf(desk));
  const sharedTools = toolsOf(shared);
  // The owner's call: the same tools on both desks, so a look poured and
  // sprayed on the bench can be touched up the same way once it is live.
  // Checked as the same list, not as "both have enough" — the drift this
  // stops is one desk quietly carrying fewer. With one desk, "both" is the
  // two layouts that are the old desks: each ships with the Tools panel out.
  const shippedWithTools = ['build', 'gig'].filter(n => [...SHIPPED[n].left, ...SHIPPED[n].right, ...SHIPPED[n].deck].includes('tools'));
  check('both desks offer the same tools',
    sharedTools.length > 0 && toolsOf(desk).join() === sharedTools.join() && shippedWithTools.length === 2,
    `desk ${toolsOf(desk).length}, shared ${sharedTools.length}, out in ${shippedWithTools.join(' and ') || 'neither layout'}`);
  // What `performGesture` actually knows: its own switch, plus the dropper it
  // falls back to. A tool absent from here is a tool that silently drops dye.
  const gesture = panel0.slice(panel0.indexOf('const performGesture ='));
  const handled = new Set([...gesture.slice(0, gesture.indexOf('\n  };')).matchAll(/case '([a-z]+)'/g)].map(x => x[1]));
  handled.add('dropper');

  check('every tool on a desk is one the engine acts on',
    [...onDesks].every(t => handled.has(t) || t === 'dropper'),
    [...onDesks].filter(t => !handled.has(t) && t !== 'dropper').join(', ') || `${onDesks.size} tools`);

  /*
    Against the Design desk, not "either desk".

    Written the loose way first — reachable from *a* desk — it stayed green
    with the finger taken back off Design, because Perform still had it. Both
    desks now share one list (checked above), but the invariant stays written
    against the bench.
  */
  const onDesign = new Set(toolsOf(desk));
  check('the Design desk offers every tool the engine acts on',
    [...handled].every(t => onDesign.has(t) || t === 'drop'),
    [...handled].filter(t => !onDesign.has(t) && t !== 'drop').join(', ') || `${onDesign.size} on the bench`);

  const keys = panel0app.match(/const TOOL_KEYS[^=]*= \{([\s\S]*?)\};/);
  const mapped = keys ? new Set([...keys[1].matchAll(/'([a-z]+)'/g)].map(x => x[1])) : new Set();
  check('and has a keyboard letter that selects it',
    [...onDesks].every(t => mapped.has(t)),
    [...onDesks].filter(t => !mapped.has(t)).join(', ') || `${mapped.size} letters`);

  const proto = readFileSync(join(root, 'src/lib/remoteProtocol.ts'), 'utf8');
  // The hands that work liquid already on the plate are the ones a phone
  // sends; the bottles it pours are a `drop` with a colour.
  for (const t of ['blow', 'press', 'finger']) {
    check(`the phone can send a ${t}`,
      new RegExp(`type: '${t}'`).test(proto) && new RegExp(`case '${t}':`).test(panel0app),
      proto.includes(`type: '${t}'`) ? 'protocol and dispatch' : 'not in the protocol');
  }
}

// ── Evolve's drift scales a look, it does not switch things on ─────
/*
  Nudging a dial a hair off zero is not a small change to that dial — it is
  switching a feature on at a value too small to see, and several of them are
  modes rather than amounts. `dishSpread` at 0.003 turned the plate from
  filling the frame into a disc inscribed in its height and took 48% of the
  picture with it, in exchange for no visible spread at all. The shader no
  longer has that cliff, but the next setting like it should not have to be
  found the same way.
*/
{
  const anchor = { ...DEFAULT_SETTINGS, dishSpread: 0, dishVignette: 0, bubbles: 0, turbulenceScale: 0.3 };
  // Its own generator, so a failure here is reproducible rather than a mood.
  let bits = 20260923;
  const roll = () => { bits = (bits * 1664525 + 1013904223) >>> 0; return bits / 4294967296; };
  let fromZero = 0, live = 0, current = { ...anchor };
  for (let i = 0; i < 4000; i++) {
    const patch = driftLook(current, anchor, 1, roll);
    for (const [k, v] of Object.entries(patch)) {
      if (anchor[k] === 0 && v !== 0) fromZero++;
      else live++;
    }
    current = { ...current, ...patch };
  }
  check('evolve never switches on a dial the look switched off',
    fromZero === 0, `${fromZero} from zero against ${live} live, over 4000 drifts`);
  check('and it does move the ones that are in play', live > 100, `${live} moved`);
}
/*
  The one dial that exception is written for: on a look with ferrofluid and a
  magnet under it, a still magnet is the only reason the ferrofluid sits
  still, so Random Evolve walks it even when the look never set a walk. It
  stays a gentle one (around the middle, never the full sweep), and on a look
  without ferrofluid the walk stays off like everything else (checked above:
  the default look has none).
*/
{
  const anchor = { ...DEFAULT_SETTINGS, phaseAmount: 0.8, magnetStrength: 0.8, magnetWalk: 0 };
  let bits = 20260925;
  const roll = () => { bits = (bits * 1664525 + 1013904223) >>> 0; return bits / 4294967296; };
  let current = { ...anchor }, walked = 0, lo = 1, hi = 0;
  for (let i = 0; i < 4000; i++) {
    const patch = driftLook(current, anchor, 1, roll);
    if ('magnetWalk' in patch) { walked++; lo = Math.min(lo, patch.magnetWalk); hi = Math.max(hi, patch.magnetWalk); }
    current = { ...current, ...patch };
  }
  check('evolve walks the magnet on a ferrofluid look that set no walk',
    walked > 20 && lo >= 0.29 && hi <= 0.71,
    `walked ${walked} times, between ${lo.toFixed(2)} and ${hi.toFixed(2)}`);
}
/*
  But it never moves where the magnet sits. The Magnet tool sets the magnet
  down and it stays until the look places its own somewhere (magnetFor in
  LiquidVisualizer), and a drift of Magnet Across or Up is the look placing
  it: before magnetX and magnetY were held out of the drift, 165 of these
  4000 rolls moved one of them, and under Evolve the magnet the owner left in
  a corner went back to the middle at the first. Measured on the same
  ferrofluid look as the walk above, where they would otherwise be live.
*/
{
  const anchor = { ...DEFAULT_SETTINGS, phaseAmount: 0.8, magnetStrength: 0.8, magnetWalk: 0.5 };
  let bits = 20260926;
  const roll = () => { bits = (bits * 1664525 + 1013904223) >>> 0; return bits / 4294967296; };
  let current = { ...anchor }, placed = 0, walked = 0;
  for (let i = 0; i < 4000; i++) {
    const patch = driftLook(current, anchor, 1, roll);
    if ('magnetX' in patch || 'magnetY' in patch) placed++;
    if ('magnetWalk' in patch) walked++;
    current = { ...current, ...patch };
  }
  check('evolve never moves where the magnet sits, only how it walks',
    placed === 0 && walked > 20,
    `Magnet Across or Up moved ${placed} times in 4000 drifts, the walk ${walked}`);
}

// ── The plate's speed follows the music (lib/tempoPace.ts) ─────────
/*
  Reported: "the presets are more often than not too fast (and sometimes too
  slow). Matching them with the music would be helpful to get the speed
  right." The presets' own speeds are 180 times apart; with the music setting
  the pace at Tempo Sync's default, the spread has to come down to something a
  room would call one show, and the music has to be the thing that moves it.
*/
{
  const speeds = PRESETS.map(p => lookSpeed({ ...DEFAULT_SETTINGS, ...p.settings }));
  const synced = speeds.map(v => v * tempoMultiplier(v, 1, 0.5, false));
  const spread = (xs) => Math.max(...xs) / Math.min(...xs);
  check('with Tempo Sync at its default, the presets\' speeds come far closer together',
    spread(synced) < spread(speeds) / 8,
    `slowest to fastest ${spread(speeds).toFixed(0)}× as written, ${spread(synced).toFixed(1)}× following the music`);
  const mid = lookSpeed({ ...DEFAULT_SETTINGS, ...PRESETS.find(p => p.id === 'classic').settings });
  check('Tempo Sync at zero leaves the look alone', tempoMultiplier(mid, 1.4, 0, false) === 1);
  const slow = tempoMultiplier(mid, musicPace(72, 0.4, true), 0.5, false);
  const fast = tempoMultiplier(mid, musicPace(174, 0.4, true), 0.5, false);
  const loud = tempoMultiplier(mid, musicPace(120, 0.9, true), 0.5, false);
  const quiet = tempoMultiplier(mid, musicPace(120, 0.1, true), 0.5, false);
  const silent = tempoMultiplier(mid, musicPace(0, 0, false), 0.5, false);
  check('a faster track and a louder one move the plate faster, and silence calms it',
    fast > slow * 1.3 && loud > quiet * 1.15 && silent < quiet,
    `72 bpm ×${slow.toFixed(2)}, 174 bpm ×${fast.toFixed(2)}; quiet ×${quiet.toFixed(2)}, loud ×${loud.toFixed(2)}; silence ×${silent.toFixed(2)}`);
  check('and Random Evolve follows the music harder',
    Math.abs(Math.log(tempoMultiplier(mid * 4, 1, 0.5, true))) > Math.abs(Math.log(tempoMultiplier(mid * 4, 1, 0.5, false))));
}

// ── Performances start and stop by hand (lib/performanceTake.ts) ──
/*
  Reported: "the performance auto detect doesn't work well. lets instead
  focus first on starting/stopping performances manually. The automatic
  aspect can simply be taking the already running song ID and attaching it
  to the performance that was started/stopped."
*/
{
  // A song identified 30 s in at 100 000 ms: it began at 70 000.
  const song = { isrc: 'US1', title: 'Song', identifiedAtMs: 100000, offsetSec: 30 };
  const start = songStartMs(song);
  check('a song\'s start is where it was identified, less the offset it matched at', start === 70000, String(start));
  const running = { isrc: 'US1', title: 'Song', startMs: start };
  // Started at 90 000 (20 s into the song), two gestures 1 s and 5 s in, stopped at 100 000.
  const gs = [{ t: 1, tool: 'dropper', x: 0.5, y: 0.5 }, { t: 5, tool: 'spray', x: 0.2, y: 0.3 }];
  const perf = finishTake(gs, 90000, 100000, takeSong(running, null), 'a', 'd');
  check('with a song running, the gestures are timed in the song, so a replay lands them where they were painted',
    perf.clock === 'song' && perf.isrc === 'US1' && perf.gestures[0].t === 21 && perf.gestures[1].t === 25 && perf.durationSec === 10,
    `${perf.clock}, ${perf.gestures.map(g => g.t).join(', ')} s into the song`);
  const later = takeSong(null, running);
  check('a song identified only after it started is attached when it stops', later?.isrc === 'US1');
  const other = { isrc: 'US2', startMs: 95000 };
  check('and the song it started with wins over one that came on after', takeSong(running, other)?.isrc === 'US1');
  const bare = finishTake(gs, 90000, 100000, null, 'b', 'd');
  check('with no song at all it keeps its own clock', bare.clock === 'wall' && !bare.isrc && bare.gestures[1].t === 5);
  // Replay: with its song playing it follows the song; without, its own clock from its first gesture.
  const withSong = replayPosition(perf, 0, 95000, { isrc: 'US1', identifiedAtMs: 100000, offsetSec: 30 });
  const alone = replayPosition(perf, 50000, 52000, null);
  check('a replay follows the song when its song is playing, and runs on its own when it is not',
    withSong === 25 && Math.abs(alone - (21 - 0.25 + 2)) < 1e-9, `${withSong} s with the song; ${alone.toFixed(2)} s alone`);
  const fired = new Set();
  const first = dueGestures(perf.gestures, 20, 22, fired), again = dueGestures(perf.gestures, 20, 26, fired);
  check('and fires each gesture once', first.length === 1 && again.length === 1 && again[0].tool === 'spray');
}

// ── The two desks carry the same actions on the top bar ───────────
/*
  Reported: "the perform and design tabs need the same functions on the top
  bar. For example, send to wall should be on both."

  They did share the header component — and that is what made the gap easy to
  miss. `DeskHeader` takes a `trailing` slot, the Design bench filled it with
  Send to wall and Save, and the Perform desk passed nothing, so the desk you
  are on when a room is watching was the one that could not throw the plate at
  a projector. Sharing a component is not sharing a top bar.

  So the actions in that slot are compared between the two files rather than
  assumed equal because the component is the same one.
*/
{
  const trailingOf = (src) => {
    const at = src.indexOf('trailing={');
    if (at < 0) return null;
    // Walk the braces so a nested {p.dirty ? ...} does not end the slot early.
    let depth = 0, i = src.indexOf('{', at + 'trailing='.length - 1);
    const from = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) break;
    }
    const body = src.slice(from, i + 1);
    return [...body.matchAll(/testId="([a-z0-9-]+)"/g)].map(m => m[1]).sort();
  };
  /*
    Desk v2 has one desk, and its plate actions moved from the header's slot
    to the plate's own bar, which every layout draws. So "the same on both"
    is now: Save is in that bar once, Send to wall is Wall (Desk.tsx
    says why), and nothing in
    the bar depends on which layout is up. The header's slot holds Blackout,
    which is the same on every layout for the same reason.
  */
  const src = readFileSync(join(root, 'src/components/desk/Desk.tsx'), 'utf8');
  const barAt = src.indexOf('The plate bar.');
  const bar = barAt < 0 ? '' : src.slice(barAt, src.indexOf('data-testid="desk-preview"', barAt));
  const header = trailingOf(src);
  const inBar = ['save-look'].filter(t => (bar.match(new RegExp(`testId="${t}"`, 'g')) ?? []).length === 1
    && (src.match(new RegExp(`testId="${t}"`, 'g')) ?? []).length === 1);
  check('both desks put actions on the top bar at all',
    inBar.length && /onWall=\{p\.onSendToWall\}/.test(src) && !/send-to-wall/.test(src) && header?.includes('blackout-button'),
    `plate bar: ${inBar.join(', ') || 'none'}; header: ${header ? header.join(', ') : 'none'}`);
  check('and they are the same actions on both',
    bar.length > 0 && bar.indexOf('<Segmented') >= 0 && !/layoutName ===? ?'(build|gig|loadin)' &&[^\n]*(send-to-wall|save-look)/.test(bar)
    && !/\{p\.layoutName/.test(bar.slice(bar.indexOf('<Segmented'))),
    'one plate bar, drawn by every layout');
}

// ── Every command the code tells you to run, exists ─────────────────
/*
  `npm run evolve` was cited in the roadmap, in `bubbles-plan.md`, in four
  commit messages and in two pull request descriptions, and it was never a
  script. It had only ever been run by bundling it with esbuild by hand.
  Anyone following the documentation got "Missing script".

  Sweeping for it found six more, all pointing at gates that went with the
  WebGL renderer at P7 — and five of those were in *source* docstrings, where
  they read as instructions rather than history: "npm run camera compares its
  output with the GLSL's, pixel for pixel", beside a file whose GLSL twin no
  longer exists.

  So a command named in the code either runs, or is listed here as one that
  used to. A citation that is neither is a promise the repository cannot keep.
*/
{
  /*
    Retired, and named rather than tolerated silently. Each of these was a
    real gate that compared a WGSL pass against its GLSL twin; the twins and
    the gates were deleted together at P7 (docs/webgpu-plan.md). The comments
    that mention them now say so in the past tense, which is worth keeping:
    they record what proved the shader that is still here.
  */
  const RETIRED = new Map([
    ['camera', 'compared the camera pass against its GLSL twin; both went at P7'],
    ['composite', 'compared the compositor against its GLSL twin; both went at P7'],
    ['output', 'compared the projector pass against its GLSL twin; both went at P7'],
    ['parity', 'compared the two solvers; the CPU one went at P7'],
    ['post', 'compared the post chain against its GLSL twin; both went at P7'],
    ['uniforms', 'compared the two uniform packs field for field; the WebGL one went at P7'],
    ['clip', 'docs/clip-plan.md plans it; scripts/clip* are local-only and run with node'],
  ]);
  const have = new Set(Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts));
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(full);
    }
    return out;
  };
  const cited = new Map();
  for (const f of [...walk(join(root, 'src')), ...walk(join(root, 'scripts'))]) {
    for (const m of readFileSync(f, 'utf8').matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
      if (!cited.has(m[1])) cited.set(m[1], f.replace(root + '/', ''));
    }
  }
  const phantom = [...cited].filter(([name]) => !have.has(name) && !RETIRED.has(name));
  check('every command the code tells you to run is one that exists',
    phantom.length === 0,
    phantom.length
      ? phantom.map(([n, f]) => `npm run ${n} (${f})`).join(', ')
      : `${cited.size} cited, ${[...cited].filter(([n]) => RETIRED.has(n)).length} of them retired and listed`);

  // And the list does not rot: a retired name that comes back as a real
  // script should leave the list rather than sit in it claiming to be gone.
  const undead = [...RETIRED.keys()].filter(n => have.has(n));
  check('nothing is listed as retired while it still exists', undead.length === 0,
    undead.length ? undead.join(', ') : `${RETIRED.size} retired`);
}

// ── Kick Bloom ──
// The kick's outward dye burst has its own dial, and is not a ring. This reads
// the frame loop's source (the burst is inline there, so the lab cannot reach
// it; the picture itself is for a Mac read, docs/judging.md): the dial gates
// the burst, scales the dye each droplet lays and the push it is given, and
// the droplets no longer sit at (d / drops) of a turn on one circle.
{
  const vis = readFileSync(join(root, 'src/components/LiquidVisualizer.tsx'), 'utf8');
  const burst = vis.slice(vis.indexOf('const bloomGain'), vis.indexOf('// The beat dose'));
  check('Kick Bloom gates the kick\'s dye burst and scales its dye and push',
    /kickBloom \?\? 1/.test(burst) && /bloomGain > 0/.test(burst) && /autoAmp \* pourDt \* bloomGain/.test(burst) && /bloomGain;/.test(burst.slice(burst.indexOf('const speed'))),
    'src/components/LiquidVisualizer.tsx');
  check('and the burst is clumps at random angles, not droplets evenly round one circle',
    burst.includes('lobeAt') && !/\(d \/ drops\) \* Math\.PI \* 2/.test(burst));
}

// ── What each control says it is (PLAN.md 8j) ───────────────────────
//
// The hover card on the desk and the tap card on the phone read one line per
// control from `lib/controlHelp.ts`, by the setting's key. A control with no
// line draws a card with only its name, which looks like a design choice
// rather than an omission, so every pinnable control is held to having one.
// And the lines are held to being a line: one sentence a person can read in a
// glance, in plain words (no dashes standing in for a clause, no filler the
// label already says).
{
  const none = PINNABLE.filter(s => !helpFor(String(s.key)));
  check('every control a desk can hold has a line saying what it does', none.length === 0,
    none.length ? `${none.map(s => `${s.label} (${String(s.key)})`).join(', ')}: add to src/lib/controlHelp.ts` : `${PINNABLE.length} lines`);
  const strays = Object.keys(CONTROL_HELP).filter(k => !PIN_RANGE.has(k));
  check('and no line is left for a control that is gone', strays.length === 0, strays.join(', ') || 'none');
  const lines = PINNABLE.map(s => [s, helpFor(String(s.key)) ?? '']);
  const long = lines.filter(([, l]) => l.length > 135 || l.length < 20);
  check('each is a short sentence, 20 to 135 characters', long.length === 0,
    long.map(([s, l]) => `${s.label} (${l.length})`).join(', ') || 'all');
  const dashed = lines.filter(([, l]) => /[—–]|\s-\s/.test(l) || !/[.)]$/.test(l));
  check('written in plain sentences: they end with a stop and use no dash for a clause', dashed.length === 0,
    dashed.map(([s]) => s.label).join(', ') || 'all');
  const same = new Map();
  for (const [s, l] of lines) same.set(l, [...(same.get(l) ?? []), s.label]);
  const dup = [...same.values()].filter(v => v.length > 1);
  check('and no two controls share a line', dup.length === 0, dup.map(v => v.join(' = ')).join('; ') || 'all different');
}


// ── The small machines inside controls (PLAN 35e) ────────────────────
//
// Three drawings that claim to be readings, not decoration: the bulb says a
// temperature, the drop falls at a pace, the bottle stands at a level. Each is
// held to the number it says, so a drawing that drifted from the thing it
// reads fails here and not in a screenshot.
{
  const plateWgsl = readFileSync(join(root, 'src/gpu/wgsl/plate.ts'), 'utf8');
  const ui = readFileSync(join(root, 'src/components/ui/Playful.tsx'), 'utf8');
  const css = readFileSync(join(root, 'src/index.css'), 'utf8');
  const deskPanels = readFileSync(join(root, 'src/components/desk/DeskPanels.tsx'), 'utf8');
  const phoneStage = readFileSync(join(root, 'src/components/phone/PhoneStage.tsx'), 'utf8');

  // Lamp Warmth in kelvin (PLAN 35e-2): the plate multiplies by the blackbody's colour at the temperature
  // the slider names, so the shader has to take that tint from the uniforms the packer fills from the library.
  const uniformsSrc = readFileSync(join(root, 'src/gpu/plateUniforms.ts'), 'utf8');
  check("the plate's shader multiplies by the lamp's tint from the uniforms, and the packer fills them from lampTint",
    /vec3f\(U\.lampTintR, U\.lampTintG, U\.lampTintB\)/.test(plateWgsl) &&
    /const tint = lampTint\(warmth\);[\s\S]{0,200}'lampTintR', tint\[0\][\s\S]{0,60}'lampTintG', tint\[1\][\s\S]{0,60}'lampTintB', tint\[2\]/.test(uniformsSrc),
    'plate.ts lamp line and plateUniforms.ts');

  const steps = Array.from({ length: 76 }, (_, i) => i * LAMP_WARMTH_MAX / 75);
  const kel = steps.map(warmthKelvin);
  check('Lamp Warmth 0 is the neutral, every notch is warmer, and the top is the halogen\'s 3200 K',
    kel[0] === NEUTRAL_KELVIN && kel.every((k, i) => i === 0 || k < kel[i - 1]) && Math.abs(kel[75] - HALOGEN_KELVIN) < 1e-6 && kelvinLabel(LAMP_WARMTH_MAX) === '3200 K',
    `0 → ${kelvinLabel(0)}, 1 → ${kelvinLabel(1)}, 2 → ${kelvinLabel(2)}, ${LAMP_WARMTH_MAX} → ${kelvinLabel(LAMP_WARMTH_MAX)}`);
  const mired = steps.map(w => 1e6 / warmthKelvin(w));
  const dm = mired.slice(1).map((m, i) => m - mired[i]);
  check('the slider moves in even steps of mired, the unit colour temperature is stepped in',
    Math.max(...dm) - Math.min(...dm) < 1e-9, `${dm[0].toFixed(3)} mired a notch, spread ${(Math.max(...dm) - Math.min(...dm)).toExponential(1)}`);
  // The blackbody it names has the tint's own colour ratios (a reading of what the shader does, not a label).
  let worstBlackbody = 0;
  for (const w of steps) {
    const t = lampTint(w), sh = blackbodyShift(warmthKelvin(w));
    worstBlackbody = Math.max(worstBlackbody, Math.abs(t[2] / t[0] / (sh[2] / sh[0]) - 1), Math.abs(t[1] / t[0] / (sh[1] / sh[0]) - 1));
  }
  check('the tint is the blackbody\'s blue and green over red at the temperature named, over the whole travel',
    worstBlackbody < 1e-9, `worst ${worstBlackbody.toExponential(1)} over ${steps.length} notches`);
  // Saved looks hold numbers from before the widening: 0 to 1 must stay the colour it was.
  let worstLegacy = 0;
  for (let i = 0; i <= 20; i++) {
    const w = i / 20, t = lampTint(w);
    for (let c = 0; c < 3; c++) worstLegacy = Math.max(worstLegacy, Math.abs(t[c] / (1 + (LEGACY_GRADE[c] - 1) * w) - 1));
  }
  check('from 0 to 1 the tint is the old grade to 1.5% a channel, so every saved look keeps its colour',
    worstLegacy < 0.015, `worst ${(worstLegacy * 100).toFixed(2)}% over 21 notches`);
  // A lamp's colour does not set its brightness: past the old end the tint keeps the luminance it has at 1, and
  // 0 to 1 (the saved looks) is left alone.
  const lum = t => 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
  let worstHold = 0;
  for (const w of steps.filter(w => w >= 1)) worstHold = Math.max(worstHold, Math.abs(lum(lampTint(w)) / lum(lampTint(1)) - 1));
  check('past the old end of the travel the lamp keeps the picture\'s brightness, so the halogen end is not a third dimmer',
    worstHold < 1e-9 && lum(lampTint(LAMP_WARMTH_MAX)) > 0.9, `luminance ${lum(lampTint(1)).toFixed(3)} at 1, ${lum(lampTint(2)).toFixed(3)} at 2, ${lum(lampTint(LAMP_WARMTH_MAX)).toFixed(3)} at ${LAMP_WARMTH_MAX}, worst drift ${worstHold.toExponential(1)}`);
  // The vignette blends as it always did (1 - w + w*g*vig), not tint times a second blend: the review found 6% in the corners.
  const shaderForm = /tint - \(tint - vec3f\(1\.0 - min\(U\.lampWarmth, 1\.0\)\)\) \* \(1\.0 - vig\)/.test(plateWgsl);
  let worstCorner = 0;
  for (let i = 0; i <= 20; i++) for (const vig of [0.55, 0.8, 1]) {
    const w = i / 20, t = lampTint(w);
    for (let c = 0; c < 3; c++) {
      const now = t[c] - (t[c] - (1 - Math.min(w, 1))) * (1 - vig), was = 1 - w + w * LEGACY_GRADE[c] * vig;
      worstCorner = Math.max(worstCorner, Math.abs(now / was - 1));
    }
  }
  check('the vignette blends as the old grade did, to 1.5% in the corners of the dish, from 0 to 1',
    shaderForm && worstCorner < 0.015, `shader form ${shaderForm}, worst ${(worstCorner * 100).toFixed(2)}% over 21 notches and three corner depths`);
  const pinLamp = readFileSync(join(root, 'src/lib/deskPins.ts'), 'utf8'), settingsSrc = readFileSync(join(root, 'src/components/SettingsPanel.tsx'), 'utf8');
  check('the pin range, the Settings slider (typed as the number the sheet reads) and the bulb all end at the library\'s top',
    /key: 'lampWarmth'[^}]*max: LAMP_WARMTH_MAX/.test(pinLamp) && /settingKey="lampWarmth"/.test(settingsSrc) && Number(/label="Lamp Warmth"[\s\S]{0,160}max=\{([\d.]+)\}/.exec(settingsSrc)?.[1]) === LAMP_WARMTH_MAX &&
    /<Bulb warmth=\{at \* LAMP_WARMTH_MAX\}/.test(readFileSync(join(root, 'src/components/ui/Pace.tsx'), 'utf8')));
  const hot = blackbodyHex(9000), warm = blackbodyHex(1900), halo = blackbodyHex(3200);
  const ch = (h, i) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  check('the filament is amber when cool and bluer when hot, from the blackbody and not a table',
    ch(warm, 0) === 255 && ch(warm, 2) < 40 && ch(halo, 2) > ch(warm, 2) && ch(hot, 2) === 255 && ch(hot, 0) < 255,
    `1900 K ${warm}, 3200 K ${halo}, 9000 K ${hot}`);

  // Viscosity: the drop's fall is the carrier's viscosity over water's, the solver's own numbers.
  const ratio = dripFallSeconds(THICK_NU) / dripFallSeconds(WATER_NU);
  check('thick takes as many times longer to let go as the solver\'s thick is thicker than thin',
    Math.abs(ratio - THICK_NU / WATER_NU) < 1e-9 && dripFallSeconds(WATER_NU) === FALL_THIN_S,
    `${dripFallSeconds(WATER_NU)} s thin, ${dripFallSeconds(THICK_NU)} s thick, ratio ${ratio}`);
  check('the Viscosity buttons draw that drop, timed by it, and the stylesheet plays it from the same number',
    /<ViscosityDrip mode=\{v\} \/>/.test(panel) && /dripFallFor\(mode\)/.test(ui) && /'--fall': `\$\{fall\}s`/.test(ui) && /animation: cg-drip-fall var\(--fall\)/.test(css));

  // The bottle: a share of the budget that is left, from the number the regulator holds the plate to.
  check('the bottle is full on an empty plate, half at half the target, empty at it, and never past either',
    dyeRoomOf(0, 0.85) === 1 && Math.abs(dyeRoomOf(0.425, 0.85) - 0.5) < 1e-12 && dyeRoomOf(0.85, 0.85) === 0 &&
    dyeRoomOf(3, 0.85) === 0 && dyeRoomOf(NaN, 0.85) === 1);
  /*
    What the bottle re-renders for. A plate at rest reads a level that wobbles by
    a few thousandths (the Mac's read-back mean); on a rounding boundary the
    plain rounding the bottle had flipped it every other poll, and the Perform
    desk's quiet line in `npm run renders` read the extra commits. Measured on
    the rule itself: a wobble of 0.004 about 0.875, a boundary, over 100 polls,
    and a drain from full to empty at a hundredth a poll.
  */
  {
    const wobble = Array.from({ length: 100 }, (_, i) => 0.875 + 0.004 * Math.sin(i * 1.7));
    const runs = (step) => { let shown = 1, n = 0; const seen = []; for (const r of wobble) { const v = step(shown, r); if (v !== shown) n++; shown = v; seen.push(v); } return { n, seen }; };
    const rounded = runs((_, r) => Math.round(r * 20) / 20);
    const held = runs(shownRoom);
    let shown = 1, moves = 0;
    for (let k = 100; k >= 0; k--) { const v = shownRoom(shown, k / 100); if (v !== shown) moves++; shown = v; }
    check('a level wobbling on a boundary moves the bottle once, where rounding moved it on every crossing',
      held.n === 1 && rounded.n > 10, `${held.n} moves held, ${rounded.n} rounded, over 100 polls`);
    check('and a drain from full to empty moves it a twentieth at a time, to empty',
      moves === 20 && shown === 0 && shownRoom(0, 1) === 1 && shownRoom(0.5, NaN) === 1, `${moves} moves, ending at ${shown}`);
  }
  check('the visualizer answers it from the regulator\'s own target and the closeup\'s, and the desk and phone ask for it',
    /dyeRoom: \(\) => \{[\s\S]{0,420}dyeLookTarget\(f\.seedMean, st\.dyeBudget \?\? 0\.85, f\.seedBudget\)[\s\S]{0,200}macroAmountOf\(st\)/.test(panel0) &&
    (panel0app.match(/dyeRoom=\{readDyeRoom\}/g) ?? []).length === 2);
  check('the bottle in hand is the one that leans and reads the level; the others stand full',
    /p\.bottleId === l\.id\s*\?\s*<LiveBottle[\s\S]{0,160}read=\{p\.dyeRoom\}[\s\S]{0,80}<Bottle[^>]*level=\{1\}/.test(deskPanels) &&
    /on\s*\?\s*<LiveBottle[\s\S]{0,160}read=\{p\.dyeRoom\}[\s\S]{0,200}<Bottle[^>]*level=\{1\}/.test(phoneStage) &&
    /<LiveBottle[^>]*read=\{p\.dyeRoom\}[^>]*tipped=\{sheet === 'dye'\}/.test(phoneStage));

  // Motion stays in the control and stops for anyone who asked it to.
  const rm = css.match(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.cg-tip \{ transition: none; \}[^}]*animation: none !important;/);
  check('under reduced motion the bottle does not lean and the drop does not fall', !!rm);
}

// ── Show hardware: reels, tap pad, VU, lens cap, strobe ring (PLAN 35f) ──
//
// Five drawings that say a number: a reel's turn rate is the tape's speed over
// its radius, a VU needle rises in 300 ms, a strobe ring stands still when the
// dish turns one dot a beat. Each is held to the physics it names, and each
// picture is checked to be on the control it belongs to, desk and phone.
{
  const read = (f) => readFileSync(join(root, f), 'utf8');
  const ui = read('src/components/ui/Playful.tsx');
  const css = read('src/index.css');
  const recordSrc = read('src/components/desk/RecordControls.tsx');
  const playSrc = read('src/components/phone/PhonePlay.tsx');
  const stageSrc = read('src/components/phone/PhoneStage.tsx');
  const soundSrc = read('src/components/SoundPanel.tsx');
  const deskSrc = read('src/components/desk/Desk.tsx');
  const drawSrc = read('src/components/DrawScreen.tsx');
  const remoteSrc = read('src/components/RemoteControl.tsx');

  // Tape: constant speed, so omega r is the tape's speed at every moment of the take, and the tape on the two reels is one tape.
  let worstV = 0, worstArea = 0;
  for (let t = 0; t <= TAPE_SECONDS; t += 15) {
    const r = reelsAt(t);
    worstV = Math.max(worstV, Math.abs(r.supplyOmega * r.supplyR / TAPE_CM_PER_S - 1), Math.abs(r.takeupOmega * r.takeupR / TAPE_CM_PER_S - 1));
    worstArea = Math.max(worstArea, Math.abs((r.supplyR ** 2 + r.takeupR ** 2) / (FULL_CM ** 2 + HUB_CM ** 2) - 1));
  }
  check('each reel turns at the tape\'s speed over its radius, and the two packs hold one tape between them',
    worstV < 1e-9 && worstArea < 1e-9, `omega r off the tape speed by ${worstV.toExponential(1)}, pack area off by ${worstArea.toExponential(1)}`);
  const r0 = reelsAt(0), rEnd = reelsAt(TAPE_SECONDS);
  check('a take starts with the left reel full and slow and the right bare and quick, and ends the other way',
    Math.abs(r0.supplyR - FULL_CM) < 1e-9 && Math.abs(r0.takeupR - HUB_CM) < 1e-9 && r0.takeupOmega / r0.supplyOmega > 2 &&
    Math.abs(rEnd.takeupR - FULL_CM) < 1e-9 && Math.abs(rEnd.supplyR - HUB_CM) < 1e-9,
    `start ${r0.supplyOmega.toFixed(2)} and ${r0.takeupOmega.toFixed(2)} rad/s, end ${rEnd.supplyOmega.toFixed(2)} and ${rEnd.takeupOmega.toFixed(2)}`);
  // The closed-form angle against a plain numeric integral of omega, across the end of the tape too.
  let worstAng = 0;
  for (const T of [30, 300, 600, 900]) {
    let sup = 0, tak = 0;
    const dt = 0.01;
    for (let t = 0; t < T; t += dt) { const r = reelsAt(t + dt / 2); sup += r.supplyOmega * dt; tak += r.takeupOmega * dt; }
    const r = reelsAt(T);
    worstAng = Math.max(worstAng, Math.abs(r.supplyDeg / (sup * 180 / Math.PI) - 1), Math.abs(r.takeupDeg / (tak * 180 / Math.PI) - 1));
  }
  check('the angle each reel has turned through is the integral of its turn rate, to a tenth of a percent',
    worstAng < 1e-3, `worst ${(worstAng * 100).toFixed(4)}% at 30, 300, 600 and 900 s`);

  // VU: 99% of a steady tone in 300 ms, a touch of overshoot, back to its stop when the sound goes.
  {
    let n = needleAtRest(), t = 0, peak = 0, rose = -1;
    const dt = 1 / 240;
    for (; t < 2; t += dt) { n = stepNeedle(n, VU_FULL, dt); peak = Math.max(peak, n.x); if (rose < 0 && n.x >= 0.99) rose = t + dt; }
    check('the needle reaches 99% of a steady tone in 300 ms and overshoots it by 1 to 1.5%',
      Math.abs(rose - 0.3) < 0.01 && peak > 1.01 && peak < 1.015, `reaches 99% in ${(rose * 1000).toFixed(0)} ms, overshoot ${((peak - 1) * 100).toFixed(2)}%`);
    let w = needleAtRest(), coarse = 0;
    for (let u = 0; u < 1; u += 1 / 5) { w = stepNeedle(w, VU_FULL, 1 / 5); coarse = w.x; }
    check('and the answer does not depend on the frame: five frames a second land where 240 do', Math.abs(coarse - stepNeedle(needleAtRest(), VU_FULL, 1).x) < 1e-9 && Math.abs(coarse - n.x) < 0.02,
      `x at 1 s ${coarse.toFixed(4)} in 5 steps`);
    let m = { x: 1, v: 0 }, floor = 0, back = -1;
    for (let u = 0; u < 3; u += dt) { m = stepNeedle(m, 0, dt); floor = Math.min(floor, m.x); if (back < 0 && m.x < 0.01) back = u; }
    check('when the sound stops or the input goes deaf the needle falls back to its stop and does not go past it',
      floor >= 0 && back > 0 && back < 1.2, `at rest after ${(back * 1000).toFixed(0)} ms, lowest ${floor.toFixed(4)}`);
    const big = stepNeedle({ x: 0.2, v: 5 }, 90, 5);
    check('a long frame (a tab coming back) cannot throw the needle off the dial', Number.isFinite(big.x) && big.x >= 0 && needleDeg(big.x) <= needleDeg(1.08) + 1e-9,
      `x ${big.x.toFixed(3)}`);
  }

  // The strobe ring: still when the dish turns one dot a beat.
  {
    const still = [1, 2, 4, 8, 16, 32].every(b => strobeOf(2, 6, b, 120).driftDegPerS === 0 && strobeOf(2, 6, b, 120).dots === b);
    const aliased = strobeOf(2, 6, 48, 120);
    const rate = strobeOf(1, 12, 16, 0), fast = strobeOf(1, 45, 16, 0);
    // 48 beats on 32 dots: 7.5 deg a beat against an 11.25 deg spacing is seen as 3.75 deg back, twice a second at 120 bpm.
    check('in Tempo with a tempo heard the ring stands still for any beats-a-turn the ring has dots for, and creeps past that',
      still && aliased.dots === MAX_DOTS && Math.abs(aliased.driftDegPerS + 7.5) < 1e-9,
      `32 beats ${strobeOf(2, 6, 32, 120).driftDegPerS} deg/s, 48 beats ${aliased.driftDegPerS.toFixed(2)} deg/s`);
    check('in Rate, and in Tempo before any tempo is heard, the ring drifts at the dish\'s speed, and Off draws it dim and still',
      rate.driftDegPerS === 36 && fast.driftDegPerS === 36 && !rate.strobed &&
      strobeOf(2, 3, 16, 0).driftDegPerS === 18 && strobeOf(0, 12, 16, 120).off && strobeOf(0, 12, 16, 120).driftDegPerS === 0,
      `12 rpm ${rate.driftDegPerS}, 45 rpm ${fast.driftDegPerS} (drawn at most 36 deg/s)`);
    check('the way round shows: a negative rate drifts the other way', strobeOf(1, -3, 16, 0).driftDegPerS === -18 && strobeOf(1, 3, 16, 0).driftDegPerS === 18);
  }

  // Where each picture is drawn.
  check('Record shows the reels on the desk button, the phone\'s Play pill and the More tile, the phone pill in a box that does not change width',
    /<TapeReels seconds=\{reelSeconds\}/.test(recordSrc) && /<TapeReels seconds=\{p\.recording\.seconds\}[^>]*running=\{p\.recording\.on\}/.test(playSrc) &&
    /h-7 w-7/.test(playSrc) && /glyph=\{<TapeReels seconds=\{p\.recording\.seconds\}/.test(stageSrc));
  check('the Play pill is red while it records: live, not lit', /testId="play-record" pressed=\{p\.recording\.on\} live>/.test(playSrc));
  check('the tap pad is on the desk\'s Tempo row and the phone\'s Sound sheet, polled from the tempo source and not a render',
    /<TapPad tempo=\{tempo\} read=\{readTempo\}/.test(panel) && /<TapPad tempo=\{p\.tempo\} read=\{p\.readTempo\}/.test(stageSrc) &&
    /const readTempo = useCallback\(\(\) => tempoRef\.current\?\.read/.test(panel0app) && /readTempo=\{readTempo\}/.test(panel0app) && (panel0app.match(/readTempo=\{readTempo\}/g) ?? []).length === 2);
  check('the VU needle is on the desk\'s Sound sheet and the phone\'s, moved by a frame loop through a ref and never by state',
    /<VuMeter read=\{readLevel\}/.test(soundSrc) && /<VuMeter read=\{p\.readLevel\}/.test(stageSrc) &&
    /readLevel=\{readLevel\}/.test(panel0app) &&
    /const frame = \(now: number\) => \{[^}]*node\.style\.transform/.test(ui) && !/const frame = \(now: number\) => \{[^}]*set[A-Z]/.test(ui));
  const blackouts = [['desk', deskSrc], ['Settings', panel], ['remote', remoteSrc], ['Draw', drawSrc]];
  check('Blackout is one capped lens on the desk, Settings, the remote and Draw',
    blackouts.every(([, src]) => /<LensCap capped=\{/.test(src)), blackouts.filter(([, src]) => !/<LensCap capped=\{/.test(src)).map(([n]) => n).join(', ') || 'all four');
  check('and the remote has the one Blackout, not two', (remoteSrc.match(/data-testid="remote-blackout"/g) ?? []).length === 1);
  check('Draw\'s Blackout is not red while the room is lit: red is for live', !/'border-live-border bg-\[rgba\(17,17,19,\.78\)\] text-live'/.test(drawSrc));
  check('the strobe ring is on Auto Spin in Settings and on the phone\'s Spin sheet, lit by the tempo heard',
    /<StrobeRing mode=\{settings\.spinAuto \?\? 0\}/.test(panel) && /<StrobeRing mode=\{p\.spin\.auto\}/.test(stageSrc) && /spinBpm=\{/.test(panel0app) && /bpm: tempoLabel\.source \? tempoLabel\.bpm : heardBpm/.test(panel0app));
  check('under reduced motion the reels do not turn, the cap does not snap and the ring does not drift',
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.cg-reel \{ transform: none !important;[^}]*\}\s*\.cg-cap, \.cg-ring \{ animation: none !important; \}/.test(css) &&
    /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)/.test(ui));
}

// ── Looks as slides in a tray (PLAN 35g) ───────────────────────────────
//
// A look is a 35 mm slide and the stage takes one at a time from a round tray
// that clicks one slot. Held to the real mount (2 x 2 in, a 24 x 36 mm frame
// shown through a 22.5 x 34 mm aperture), to the changer's one slot a push
// whatever the distance, and to every place a look is shown.
{
  const read = (f) => readFileSync(join(root, f), 'utf8');
  const ui = read('src/components/ui/Playful.tsx');
  const uiIndex = read('src/components/ui/index.tsx');
  const css = read('src/index.css');
  const cueSrc = read('src/components/CueBar.tsx');
  const menuSrc = read('src/components/PresetMenu.tsx');
  const deskPanelsSrc = read('src/components/desk/DeskPanels.tsx');
  const playSrc = read('src/components/phone/PhonePlay.tsx');
  const stageSrc = read('src/components/phone/PhoneStage.tsx');

  check('the mount is square, its aperture is the 3:2 of a 35 mm frame and sits inside it, and one corner is clipped',
    MOUNT_MM === 50 && Math.abs(WINDOW_W / WINDOW_H - 3 / 2) < 0.02 && WINDOW_W_MM < MOUNT_MM && WINDOW_H_MM < WINDOW_W_MM && WINDOW_W < 1 && NOTCH_MM > 0 && NOTCH_MM < MOUNT_MM / 4,
    `${WINDOW_W_MM} x ${WINDOW_H_MM} mm in ${MOUNT_MM} mm, ratio ${(WINDOW_W / WINDOW_H).toFixed(3)}`);
  check('the tray has whole slots round it, so a click always lands one in the gate',
    Number.isInteger(TRAY_SLOTS) && Math.abs(SLOT_DEG * TRAY_SLOTS - 360) < 1e-9 && Math.abs(trayDeg(TRAY_SLOTS) - 360) < 1e-9, `${TRAY_SLOTS} slots, ${SLOT_DEG} deg`);
  // The changer moves one slot a push, whatever the distance in the list, and the first look loaded is not a change.
  const steps = [stepOf(3, 4), stepOf(4, 3), stepOf(0, 39), stepOf(39, 0), stepOf(5, 5), stepOf(null, 7), stepOf(7, null)];
  check('a look later in the list clicks the tray forward one slot and an earlier one back one, however far, and no change or no place clicks nothing',
    steps.join(',') === '1,-1,1,-1,0,0,0', steps.join(','));
  // Pushes add up on the drum: +1, -1, none, +1, -1 leaves it where it started, and a slot is SLOT_DEG.
  let drum = 0;
  for (const [a, b] of [[0, 5], [5, 2], [2, 2], [2, 9], [9, 1]]) drum += stepOf(a, b);
  let drum2 = 0;
  for (const [a, b] of [[0, 5], [5, 7], [7, 9]]) drum2 += stepOf(a, b);
  check('the drum is the sum of its pushes: out and back leaves it home, three forward leaves it three slots on',
    drum === 0 && trayDeg(drum) === 0 && drum2 === 3 && trayDeg(drum2) === 3 * SLOT_DEG, `net ${drum}, then ${drum2}`);

  check('a look is a slide on the set list rows, the cue bar, the preset menu, the performer\'s saved list and both phone surfaces',
    /<SlideMount swatch=\{swatch\}/.test(uiIndex) && /<SlideMount swatch=\{liveSwatch\}/.test(cueSrc) && /<SlideMount swatch=\{cuedSwatch\}/.test(cueSrc) &&
    (menuSrc.match(/<SlideMount swatch=\{swatchOf\(p\.id\)\}/g) ?? []).length === 2 && /<SlideMount swatch=\{l\.swatch\}/.test(deskPanelsSrc) &&
    /<SlideMount swatch=\{p\.lookSwatch\}/.test(stageSrc) && /<SlideMount swatch=\{l\.swatch\}/.test(stageSrc) && /<SlideMount swatch=\{l\.swatch\} size=\{60\}/.test(playSrc));
  check('the tray is on the cue bar and the phone\'s look button and Looks strip, each given the look\'s place in its own list',
    /<SlideTray at=\{liveAt\}/.test(cueSrc) && /<SlideTray at=\{p\.lookSlot \?\? null\}/.test(stageSrc) && /<SlideTray at=\{p\.lookSlot \?\? null\}/.test(playSrc) &&
    /liveAt=\{deskLookSlot\}/.test(panel0app) && (panel0app.match(/lookSlot=\{phoneLookSlot\}/g) ?? []).length === 2);
  check('the Looks strip flicks one slide at a time: it snaps, and every slide stops it',
    /snap-x snap-mandatory/.test(playSrc) && /snap-start snap-always/.test(playSrc));
  const mountFn = ui.slice(ui.indexOf('export function SlideMount'), ui.indexOf('export function SlideTray'));
  check('the film is the look\'s own palette and the mount takes no state colour: nothing lit, live or group-coloured inside SlideMount',
    mountFn.includes('background: swatch') && !/color-lit|color-live|accent|ring-lit|group/.test(mountFn) && /MOUNT_COLOUR = '#[0-9a-f]{6}'/i.test(ui));
  check('the tray moves only itself, from a count of pushes: no loop, no timer, and not under reduced motion',
    !/setInterval|requestAnimationFrame/.test(ui.slice(ui.indexOf('export function SlideTray'))) &&
    /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.cg-tray \{ transform: none !important; transition: none; \}/.test(css) && /\.cg-tray \{ transition: transform 160ms/.test(css));
}

// ── Result ──────────────────────────────────────────────────────────
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
  console.log(`\n${failed.length} failed:`);
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exit(1);
}
