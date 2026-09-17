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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PINNABLE, PIN_RANGE, DEFAULT_RECIPE, MAX_PINS } from '../src/lib/deskPins.ts';
import { PER_LAYER, PATCH_TARGETS } from '../src/lib/sceneMap.ts';
import { SurfaceWatcher, buildAutoMap, RIDE_ORDER, MASTER_RIDE } from '../src/lib/autoMap.ts';
import { touch, touchKey, subscribeTouch, touchKeysWatched, resetTouch } from '../src/lib/midiTouch.ts';
import { DEFAULT_RIDES } from '../src/components/desk/PerformDesk.tsx';
import { SETTINGS_SECTIONS, SETTINGS_CATEGORIES, SECTION_BY_ID, sectionMatches } from '../src/lib/settingsMap.ts';
import { FACTORY_MAPS, factoryFor } from '../src/lib/midi.ts';

// The repository root as npm hands it over. Not `import.meta.url`: this file
// is bundled into node_modules/.cache before it runs, so its own url points at
// the cache directory rather than at the source it is here to read.
const root = process.env.INIT_CWD ?? process.cwd();
const panel = readFileSync(join(root, 'src/components/SettingsPanel.tsx'), 'utf8');
const panel0 = readFileSync(join(root, 'src/components/LiquidVisualizer.tsx'), 'utf8');

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
  sliders.push({ key, label, pinned });
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
const drawn = new Set(sliders.map(s => s.key));
const ghosts = PINNABLE.filter(s => !drawn.has(String(s.key)));
check('and nothing in the registry is invisible in the panel', ghosts.length === 0,
  ghosts.length ? ghosts.map(s => `${s.label} (${String(s.key)})`).join(', ') : 'all of them have a slider');

const badRange = PINNABLE.filter(s => !(s.max > s.min));
check('every range has somewhere to travel', badRange.length === 0,
  badRange.map(s => `${s.label} ${s.min}..${s.max}`).join(', '));

const dupes = PINNABLE.map(s => String(s.key)).filter((k, i, a) => a.indexOf(k) !== i);
check('and no control is in it twice', dupes.length === 0, dupes.join(', '));

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
  ['bpm', 'audio-input'], ['microphone', 'audio-input'],
  ['viscosity', 'physics'], ['zoom', 'macro'], ['blend', 'layers'], ['gpu', 'simulation'],
];
const misses = [];
for (const [word, want] of MUST_FIND) {
  const hits = SETTINGS_SECTIONS.filter(s => sectionMatches(s, word)).map(s => s.id);
  if (!hits.includes(want)) misses.push(`"${word}" → ${hits.join(', ') || 'nothing'} (wanted ${want})`);
}
check('searching for what you came for finds it', misses.length === 0, misses.join(' · '));

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

// ── The defaults ────────────────────────────────────────────────────
const badRides = DEFAULT_RIDES.filter(k => !PIN_RANGE.has(String(k)));
check('the desk starts with controls that exist', badRides.length === 0, badRides.join(', '));
const badRecipe = DEFAULT_RECIPE.filter(k => !PIN_RANGE.has(String(k)));
check('the bench starts with controls that exist', badRecipe.length === 0, badRecipe.join(', '));
check('and neither starts over the limit',
  DEFAULT_RIDES.length <= MAX_PINS && DEFAULT_RECIPE.length <= MAX_PINS,
  `${DEFAULT_RIDES.length} rides, ${DEFAULT_RECIPE.length} recipe, limit ${MAX_PINS}`);

// ── Result ──────────────────────────────────────────────────────────
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
  console.log(`\n${failed.length} failed:`);
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exit(1);
}
