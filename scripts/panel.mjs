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
import { PINNABLE, PIN_RANGE, DEFAULT_RECIPE, MAX_PINS, onStep } from '../src/lib/deskPins.ts';
import { PER_LAYER, PATCH_TARGETS } from '../src/lib/sceneMap.ts';
import { driftLook } from '../src/lib/drift.ts';
import { SurfaceWatcher, buildAutoMap, RIDE_ORDER, MASTER_RIDE } from '../src/lib/autoMap.ts';
import { touch, touchKey, subscribeTouch, subscribeAllTouches, touchKeysWatched, resetTouch } from '../src/lib/midiTouch.ts';
import { settingLed, SoftTakeover, parseMidiMap, LEARNABLE_SETTINGS } from '../src/lib/midi.ts';
import { luckyLook } from '../src/lib/lucky.ts';
import { evolvedLook } from '../src/lib/lookFade.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { PRESETS } from '../src/presets.ts';
import { SettingRide } from '../src/lib/ride.ts';
import { DEFAULT_RIDES } from '../src/components/desk/PerformDesk.tsx';
import { lerpSettings, GLIDES } from '../src/lib/sequencer.ts';
import { SETTINGS_SECTIONS, SETTINGS_CATEGORIES, SECTION_BY_ID, sectionMatches } from '../src/lib/settingsMap.ts';
import { FACTORY_MAPS, factoryFor } from '../src/lib/midi.ts';

// The repository root as npm hands it over. Not `import.meta.url`: this file
// is bundled into node_modules/.cache before it runs, so its own url points at
// the cache directory rather than at the source it is here to read.
const root = process.env.INIT_CWD ?? process.cwd();
const panel = readFileSync(join(root, 'src/components/SettingsPanel.tsx'), 'utf8');
const panel0 = readFileSync(join(root, 'src/components/LiquidVisualizer.tsx'), 'utf8');
const panel0app = readFileSync(join(root, 'src/App.tsx'), 'utf8');

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
const drawn = new Set([...sliders.map(s => s.key), ...chipped]);
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
check('and a binding MIDI cannot learn keeps the travel it came with',
  travel.sensitivity?.[0] === 0.2 && travel.sensitivity?.[1] === 2);
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
const performSrc = readFileSync(join(root, 'src/components/desk/PerformDesk.tsx'), 'utf8');
const designSrc = readFileSync(join(root, 'src/components/desk/DesignDesk.tsx'), 'utf8');
check('and a desk strip lands on a step too',
  /step=\{spec\.step\}/.test(performSrc) && /step=\{spec\.step\}/.test(designSrc));

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
const LAMP = ['lumia', 'chemistry', 'gelWheel', 'gelSpeed', 'lampWarmth', 'exposure'];
check('the look effects live with the lamp',
  LAMP.every(k => PIN_RANGE.get(k)?.section === 'lamp'),
  LAMP.filter(k => PIN_RANGE.get(k)?.section !== 'lamp').map(k => `${k} → ${PIN_RANGE.get(k)?.section}`).join(', '));
check('and the film is an input of its own',
  SECTION_BY_ID.get('film')?.category === 'inputs'
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
check('every master sits with the patch bay',
  MASTERS.every(k => PIN_RANGE.get(k)?.section === 'patches'),
  MASTERS.filter(k => PIN_RANGE.get(k)?.section !== 'patches').map(k => `${k} → ${PIN_RANGE.get(k)?.section ?? 'nowhere'}`).join(', '));
/** The markup of one section, from its opening tag to the next `</section>`. */
const sectionSource = (id) => {
  const at = panel.indexOf(`data-section="${id}"`);
  return at < 0 ? '' : panel.slice(at, panel.indexOf('</section>', at));
};
const bay = sectionSource('patches');
check('and the bay is drawn there, not in The Room',
  bay.includes('data-testid="scene-map-add"') && !sectionSource('room').includes('scene-map-add')
  && MASTERS.every(k => bay.includes(`settingKey="${k}"`)));
check('no source can ride a master',
  !PATCH_TARGETS.some(t => MASTERS.includes(String(t.key))),
  PATCH_TARGETS.filter(t => MASTERS.includes(String(t.key))).map(t => t.label).join(', '));
check('and what a patch can aim at is grouped by section', /<optgroup key=\{g\.id\} label=\{g\.name\}>/.test(bay));

check('and the wall keeps the id every deep link opens',
  SECTION_BY_ID.get('projectors')?.name === 'Wall' && /openSettingsAt\('projectors'\)/.test(readFileSync(join(root, 'src/App.tsx'), 'utf8')));

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
const cls = panel0.indexOf('class FluidSimulation {');
const solver = cls < 0 ? '' : panel0.slice(cls, (() => {
  // The class ends at the first line that closes at column zero.
  const end = panel0.indexOf('\n}', cls);
  return end < 0 ? panel0.length : end;
})());
check('the solver can be found to read', solver.length > 2000, `${solver.length} characters`);

const readsInSolver = new Set([...solver.matchAll(/settings\.([A-Za-z0-9_]+)/g)].map(m => m[1]));
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
for (const [where, src, id] of [
  ['the MIDI panel', midiPanel, 'midi-auto-start'],
  ['the settings section', panel, 'settings-midi-auto'],
]) {
  check(`${where} offers auto-map`, src.includes(id), src.includes(id) ? '' : `no ${id}`);
}
check('and both can be stopped once started',
  midiPanel.includes('midi-auto-cancel') && panel.includes('settings-midi-auto-cancel'));
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
for (const [dot, handler] of [['mic', 'onMic'], ['wall', 'onWall'], ['midi', 'onMidi'], ['phone', 'onPhone']]) {
  check(`the ${dot} dot opens something`,
    new RegExp(`dots\\.${dot}[\\s\\S]{0,240}onClick=\\{${handler}\\}`).test(header)
    || new RegExp(`onClick=\\{${handler}\\}[\\s\\S]{0,240}dot-${dot}`).test(header));
}
// And the place the mic dot opens has to be able to change the mic.
check('and the Sound section can choose the source, not just the device',
  panel.includes('testId="audio-source"') && panel.includes('data-testid="audio-input"'));
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
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
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
const perform = readFileSync(join(root, 'src/components/desk/PerformDesk.tsx'), 'utf8');
const design = readFileSync(join(root, 'src/components/desk/DesignDesk.tsx'), 'utf8');
const readout = readFileSync(join(root, 'src/lib/readout.ts'), 'utf8');
check('a value reads the same way wherever it is shown',
  /export function readSetting/.test(readout)
  && !/const READS/.test(perform) && !/const READS/.test(design));
check('and every ride is a share of its travel unless it has a unit',
  /macroZoom:  v => `\$\{v\.toFixed\(2\)\}×`/.test(readout)
  && !/globalSpeed:/.test(readout)
  && /readSetting\(String\(key\), v, spec\.min, spec\.max\)/.test(perform)
  && /readSetting\(String\(key\), v, spec\.min, spec\.max\)/.test(design));
check('and the settings panel asks the same question',
  /readSetting\(String\(settingKey \?\? ''\), safeValue, min, max\)/.test(panel));

// A line telling you where to go, where a button could take you.
check('the no-controller line goes there instead of naming the route',
  /data-testid="no-controller-hint"/.test(perform) && !/Settings → MIDI to learn one/.test(perform));

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

check('the opening look is not always the same one',
  /export const OPENING_LOOK/.test(app) && /Math\.random\(\) \* pool\.length/.test(app));
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
  const unread = Object.keys(DEFAULT_SETTINGS)
    .filter(k => !new RegExp(`\\b${RECEIVERS}\\s*\\??\\.${k}\\b`).test(body));
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
  const design = readFileSync(join(root, 'src/components/desk/DesignDesk.tsx'), 'utf8');
  const perform = readFileSync(join(root, 'src/components/desk/PerformDesk.tsx'), 'utf8');
  const toolsOf = (src) => {
    const m = src.match(/const TOOLS = \[([\s\S]*?)\] as const;/);
    return m ? [...m[1].matchAll(/\['([a-z]+)'/g)].map(x => x[1]) : [];
  };
  const onDesks = new Set([...toolsOf(design), ...toolsOf(perform)]);
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
    with the finger taken back off Design, because Perform still had it. The
    Perform desk is deliberately four tools, the ones that work liquid already
    on the plate; the Design desk is the whole bench, and that is the one an
    invariant can be written against.
  */
  const onDesign = new Set(toolsOf(design));
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
  const perform = trailingOf(readFileSync(join(root, 'src/components/desk/PerformDesk.tsx'), 'utf8'));
  const design = trailingOf(readFileSync(join(root, 'src/components/desk/DesignDesk.tsx'), 'utf8'));
  check('both desks put actions on the top bar at all',
    perform !== null && design !== null,
    `perform ${perform ? perform.length : 'none'}, design ${design ? design.length : 'none'}`);
  if (perform && design) {
    const onlyDesign = design.filter(t => !perform.includes(t));
    const onlyPerform = perform.filter(t => !design.includes(t));
    check('and they are the same actions on both',
      onlyDesign.length === 0 && onlyPerform.length === 0,
      onlyDesign.length || onlyPerform.length
        ? `${onlyDesign.map(t => 'design only: ' + t).concat(onlyPerform.map(t => 'perform only: ' + t)).join(', ')}`
        : perform.join(', '));
  }
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

// ── Result ──────────────────────────────────────────────────────────
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
  console.log(`\n${failed.length} failed:`);
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exit(1);
}
