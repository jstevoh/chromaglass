#!/usr/bin/env node
/**
 * Does sanitizePatch preserve DEFAULT_SETTINGS and every built-in preset without
 * dropping or altering any setting, while rejecting malformed inputs?
 *
 *   npm run sanitize
 *
 * PLAN.md §14n: One sanitizePatch against the settings registry used by the
 * socket, the MIDI map loader and a loaded look alike.
 */
import {
  DEFAULT_SETTINGS, BLEND_MODES, LED_MODES, ON_NEW_SONG_MODES, VISCOSITY_MODES,
  MACRO_CAMERA_MODES, MIX_BLENDS, AUDIO_FEATURES, RENDER_STYLES,
} from '../src/types.ts';
import { PRESETS } from '../src/presets.ts';
import { sanitizePatch } from '../src/lib/sanitizeSettings.ts';
import { parseRemoteGesture } from '../src/lib/remoteProtocol.ts';
import { parseMidiMap } from '../src/lib/midi.ts';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// 1. DEFAULT_SETTINGS
{
  const clean = sanitizePatch(DEFAULT_SETTINGS);
  const dropped = [];
  const altered = [];
  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(key in clean)) {
      dropped.push(key);
    } else if (JSON.stringify(clean[key]) !== JSON.stringify(val)) {
      altered.push(`${key}: ${JSON.stringify(clean[key])} !== ${JSON.stringify(val)}`);
    }
  }
  const ok = dropped.length === 0 && altered.length === 0;
  check('sanitizePatch preserves all DEFAULT_SETTINGS', ok,
    ok ? `${Object.keys(DEFAULT_SETTINGS).length} settings preserved` : `dropped: [${dropped.join(', ')}], altered: [${altered.join(', ')}]`);
}

// 2. Built-in presets
{
  let droppedCount = 0;
  let alteredCount = 0;
  const issues = [];

  for (const preset of PRESETS) {
    const clean = sanitizePatch(preset.settings);
    for (const [key, val] of Object.entries(preset.settings)) {
      if (!(key in clean)) {
        droppedCount++;
        issues.push(`${preset.id}.${key} dropped`);
      } else if (JSON.stringify(clean[key]) !== JSON.stringify(val)) {
        alteredCount++;
        issues.push(`${preset.id}.${key} altered (${JSON.stringify(clean[key])} vs ${JSON.stringify(val)})`);
      }
    }
  }

  const ok = droppedCount === 0 && alteredCount === 0;
  check(`sanitizePatch preserves all ${PRESETS.length} built-in presets without dropping or altering settings`, ok,
    ok ? `${PRESETS.length} presets clean` : `${issues.length} issues in presets: ${issues.slice(0, 10).join(', ')}${issues.length > 10 ? ` (+${issues.length - 10} more)` : ''}`);
}

// 3. Security guards (PLAN §14n)
{
  // Drops unknown keys
  const unknownKey = sanitizePatch({ notARealKeyAtAll: 123, globalSpeed: 0.05 });
  check('unknown keys are dropped', !('notARealKeyAtAll' in unknownKey) && unknownKey.globalSpeed === 0.05);

  // Prototype pollution attempt
  const protoAttempt = sanitizePatch(JSON.parse('{"__proto__":{"polluted":true},"globalSpeed":0.05}'));
  check('prototype pollution is prevented', !('polluted' in Object.prototype) && protoAttempt.globalSpeed === 0.05);

  // Non-finite numbers (NaN, Infinity, -Infinity)
  const nonFinite = sanitizePatch({ globalSpeed: NaN, zoom: Infinity, boundaryContrast: -Infinity, surge: 0.5 });
  check('non-finite numbers are dropped', !('globalSpeed' in nonFinite) && !('zoom' in nonFinite) && !('boundaryContrast' in nonFinite) && nonFinite.surge === 0.5);

  // Clamps finite numbers to valid range
  const clamped = sanitizePatch({ globalSpeed: 99999, surge: -100 });
  check('out-of-range numbers are clamped', clamped.globalSpeed === 0.3 && clamped.surge === 0);

  // Rejects invalid enums
  const badEnums = sanitizePatch({ blendMode: 'invalidBlend', ledMode: 'notAnLedMode', onNewSong: 'fakeMode', macroCamera: 'magicMode' });
  check('invalid enums are dropped', !('blendMode' in badEnums) && !('ledMode' in badEnums) && !('onNewSong' in badEnums) && !('macroCamera' in badEnums));

  // Valid enums survive
  const goodEnums = sanitizePatch({ blendMode: 'lighter', ledMode: 'cyberpunk', onNewSong: 'random', macroCamera: 'follow' });
  check('valid enums survive', goodEnums.blendMode === 'lighter' && goodEnums.ledMode === 'cyberpunk' && goodEnums.onNewSong === 'random' && goodEnums.macroCamera === 'follow');

  /*
    Every value each choice setting can take, not one value of each. The
    first sanitizePatch kept its own hand-written lists, and they had already
    drifted from the types when it landed on main (live from 2026-10-09 to
    #322): Lighter and Exclusion on the blend menu, four of the five LED
    modes, Off and Random for a new song and the mixer's Multiply and Key
    were all dropped by updateSettings, the phone's patches and a saved look,
    while the one-value check above passed. The lists are now the types' own
    arrays; walking every value of every key that uses them is what catches
    the next member added to a type and forgotten in the sanitiser.
  */
  const lists = [
    ['blendMode', BLEND_MODES], ['ledMode', LED_MODES], ['onNewSong', ON_NEW_SONG_MODES],
    ['viscosity', VISCOSITY_MODES], ['macroCamera', MACRO_CAMERA_MODES], ['renderStyle', RENDER_STYLES],
    // Every mixer row's blend, found by name, so a row added later is walked too.
    ...Object.keys(DEFAULT_SETTINGS).filter(k => k.endsWith('Blend')).map(k => [k, MIX_BLENDS]),
  ];
  const slots = Object.keys(DEFAULT_SETTINGS.audioMappings);
  const lost = [], letIn = [], thin = [];
  for (const [key, values] of lists) {
    if (values.length < 2) thin.push(key);
    for (const v of values) if (sanitizePatch({ [key]: v })[key] !== v) lost.push(`${key}=${v}`);
    // And a value no type has is turned away: a key that slipped out of its
    // own list into the catch-all string branch keeps every value above too.
    if (sanitizePatch({ [key]: '__nope__' })[key] !== undefined) letIn.push(key);
  }
  for (const slot of slots) {
    for (const f of AUDIO_FEATURES) {
      if (sanitizePatch({ audioMappings: { [slot]: f } }).audioMappings?.[slot] !== f) lost.push(`audioMappings.${slot}=${f}`);
    }
    if (sanitizePatch({ audioMappings: { [slot]: '__nope__' } }).audioMappings?.[slot] === '__nope__') letIn.push(`audioMappings.${slot}`);
  }
  const tried = lists.reduce((n, [, v]) => n + v.length, 0) + slots.length * AUDIO_FEATURES.length;
  check('every value of every choice setting survives, and a value outside them is turned away',
    lost.length === 0 && letIn.length === 0 && thin.length === 0 && slots.length >= 4 && tried > 60,
    lost.length || letIn.length || thin.length
      ? `${lost.length} dropped: ${lost.join(', ')}; let in: ${letIn.join(', ') || 'none'}; a list under two values: ${thin.join(', ') || 'none'}`
      : `${tried} values kept across ${lists.length} keys and ${slots.length} audio slots, a stranger turned away by each`);

  /*
    And no choice setting is missing from the walk above. Every string the
    defaults hold is either one of those choices or one of the free-form
    strings named here (colours, the mixer's order, the solver's 'auto'), so
    a new choice setting added to the types without a line above fails here
    instead of passing unwalked.
  */
  const FREE_FORM = new Set(['paperA', 'paperB', 'ledColor', 'mixOrder', 'simResolution']);
  const walked = new Set(lists.map(([k]) => k));
  const unwalked = Object.entries(DEFAULT_SETTINGS)
    .filter(([k, v]) => typeof v === 'string' && !walked.has(k) && !FREE_FORM.has(k)).map(([k]) => k);
  check('every string setting is either a walked choice or a named free-form string', unwalked.length === 0,
    unwalked.length ? `not walked: ${unwalked.join(', ')}` : `${walked.size} choices, ${FREE_FORM.size} free-form`);

  // Scene mappings validation: setting checked against SETTING_TRAVEL with own-property, depth clamped to -100..100
  const badMappings = sanitizePatch({
    sceneMappings: [
      { source: 'sound', feature: 'bass', setting: 'cometSpeed', depth: 400 }, // valid setting, depth should be clamped to 100
      { source: 123, feature: 'bass', setting: 'cometSpeed', depth: 0.4 }, // invalid source type
      { source: 'sound', setting: 'cometSpeed', depth: 0.4 }, // missing feature
      { feature: 'bass', setting: 'cometSpeed', depth: 'notANumber' }, // invalid depth
      { feature: 'bass', setting: 'toString', depth: 0.4 }, // prototype key
      { feature: 'bass', setting: 'filmDrive', depth: 0.4 }, // setting not in SETTING_TRAVEL (in NOT_A_TARGET)
    ]
  });
  check('malformed sceneMappings are filtered and depth is clamped',
    Array.isArray(badMappings.sceneMappings) && badMappings.sceneMappings.length === 1 &&
    badMappings.sceneMappings[0].setting === 'cometSpeed' && badMappings.sceneMappings[0].depth === 100);

  // Pure remote gesture parsing (PLAN §14n): drops non-finite x/y, clamps tilt, rejects invalid colour strings
  const badGestures = [
    parseRemoteGesture(null),
    parseRemoteGesture({ type: 'blow', x: NaN, y: 0.5 }),
    parseRemoteGesture({ type: 'blow', x: 0.5, y: Infinity }),
    parseRemoteGesture({ type: 'drop', x: 'notANumber', y: 0.5 }),
    parseRemoteGesture({ type: 'drop', x: 0.5, y: 0.5, color: '#' + 'f'.repeat(1000) }),
    parseRemoteGesture({ type: 'drop', x: 0.5, y: 0.5, color: 12345 }),
    parseRemoteGesture({ type: 'press', x: NaN, y: 0.5 }),
    parseRemoteGesture({ type: 'finger', x: 0.5, y: -Infinity }),
    parseRemoteGesture({ type: 'spin', x: NaN, y: 0.5 }),
    parseRemoteGesture({ type: 'tilt', x: NaN, y: 0 }),
    parseRemoteGesture({ type: 'tilt', x: 0, y: Infinity }),
    parseRemoteGesture({ type: 'unknownGestureType', x: 0.5, y: 0.5 }),
  ];
  check('malformed and non-finite gestures are dropped by parseRemoteGesture', badGestures.every(g => g === null));

  // Valid gestures parsed cleanly with sanitization of auxiliary fields
  const cleanBlow = parseRemoteGesture({ type: 'blow', x: 0.5, y: 0.6, dx: 'notANum', dy: -0.1, layer: 'badLayer', amount: 0.7, wall: true });
  const cleanDrop = parseRemoteGesture({ type: 'drop', x: 0.1, y: 0.2, color: '#ff00aa', wall: false });
  const cleanSpin = parseRemoteGesture({ type: 'spin', x: 0.3, y: 0.4, id: 3.14 });
  const cleanTilt = parseRemoteGesture({ type: 'tilt', x: -5, y: 10 });
  check('valid gestures parse cleanly and tilt clamps to [-1, 1]',
    cleanBlow?.type === 'blow' && cleanBlow.x === 0.5 && cleanBlow.y === 0.6 && cleanBlow.dx === undefined && cleanBlow.dy === -0.1 && cleanBlow.layer === 0 && cleanBlow.amount === 0.7 && cleanBlow.wall === true &&
    cleanDrop?.type === 'drop' && cleanDrop.color === '#ff00aa' && cleanDrop.wall === undefined &&
    cleanSpin?.type === 'spin' && cleanSpin.id === undefined &&
    cleanTilt?.type === 'tilt' && cleanTilt.x === -1 && cleanTilt.y === 1);

  // MIDI map parsing: keeps only keys in LEARNABLE_BY_KEY, resetting min/max to spec travel
  const midiMap = parseMidiMap(JSON.stringify({
    format: 'chromaglass-midi', version: 1, name: 'SanitizeTest',
    bindings: [
      { id: 'b1', source: { kind: 'cc', channel: 0, number: 1 }, target: { kind: 'setting', key: 'globalSpeed', min: -100, max: 100 } },
      { id: 'b2', source: { kind: 'cc', channel: 0, number: 2 }, target: { kind: 'setting', key: 'blendMode', min: 0, max: 1 } },
      { id: 'b3', source: { kind: 'cc', channel: 0, number: 3 }, target: { kind: 'setting', key: 'constructor', min: 0, max: 1 } },
      { id: 'b4', source: { kind: 'cc', channel: 0, number: 4 }, target: { kind: 'setting', key: '__proto__', min: 0, max: 1 } },
      { id: 'b5', source: { kind: 'cc', channel: 0, number: 5 }, target: { kind: 'action', action: 'play' } },
    ]
  }));
  check('parseMidiMap keeps only LEARNABLE_BY_KEY with spec min/max',
    midiMap.bindings.length === 2 &&
    midiMap.bindings[0].id === 'b1' && midiMap.bindings[0].target.min === 0 && midiMap.bindings[0].target.max === 0.3 &&
    midiMap.bindings[1].id === 'b5');
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
