import { SceneFeature, PatchSource, AudioFeature } from '../../types';
import { MODULATOR_FEATURES, MODULATOR_LABELS } from '../../lib/modulators';
import { SOURCE_NAMES } from '../../lib/audioFeatures';
import { HIT_FEATURES, HIT_FEATURE_LABELS } from '../../lib/hitSource';
import { MUSIC_SOURCE_LABELS } from '../../lib/midi';
import { PATCH_TARGETS } from '../../lib/sceneMap';
import { SETTINGS_SECTIONS } from '../../lib/settingsMap';

/*
  What a patch can listen to and be plugged into (PLAN 19ai-9, moved from
  SettingsPanel.tsx verbatim). The patch bay reads all of it; Plate Spin's audio
  follow reads the sound's features too, which is why it is not in the bay's file.
*/

/** What the room can be read for, in the order they are worth reaching for. */
export const SCENE_FEATURES: [SceneFeature, string][] = [
  ['motion', 'How busy'],
  ['motionHighFreq', 'How sudden'],
  ['motionOverTime', 'How busy, lately'],
  ['crowd', 'How many'],
  ['spread', 'How spread out'],
  ['centroidX', 'Where — across'],
  ['centroidY', 'Where — up'],
  ['dirX', 'Which way — across'],
  ['dirY', 'Which way — up'],
  ['brightness', 'How light'],
  ['sceneHue', 'What colour'],
];

/** What the sound can be read for. The same features the four fixed selects use. */
export const AUDIO_FEATURES: [AudioFeature, string][] = [
  ['volume', 'How loud'],
  ['bass', 'Bass'],
  ['mid', 'Mid'],
  ['treble', 'Treble'],
  ['energy', 'Energy'],
  ['timbre', 'Timbre'],
  ['complexity', 'Complexity'],
];

/** What a patch can listen to, and what each one is called. */
export const PATCH_SOURCES: [PatchSource, string][] = [
  ['room', 'Room'],
  ['film', 'Film'],
  ['sound', 'Sound'],
  // The sound again, by name: the kick, the snare, the hats and the bands
  // (`bands` in types.ts says why it is a source of its own).
  ['bands', 'Bands'],
  // And its hits and its note (`lib/hitSource.ts`): how hard each drum's
  // last hit was, falling over a quarter second. Same microphone, same master.
  ['hits', 'Hits'],
  // The odd one out, and last for that reason: the other three report what is
  // happening in the room, and this one is a shape you asked for.
  ['shape', 'Shapes'],
];

/**
 * The features a source offers.
 *
 * The room and the film are the same analysis over different pixels, so they
 * offer the same list. The sound offers its own seven, and switching between
 * them has to change the list — "how many people" is not something a microphone
 * can tell you.
 */
export const featuresFor = (source: PatchSource): [string, string][] =>
  source === 'sound' ? AUDIO_FEATURES
    : source === 'bands' ? SOURCE_NAMES.map(f => [f, MUSIC_SOURCE_LABELS[f]] as [string, string])
    : source === 'hits' ? HIT_FEATURES.map(f => [f, HIT_FEATURE_LABELS[f]] as [string, string])
    : source === 'shape' ? MODULATOR_FEATURES.map(f => [f, MODULATOR_LABELS[f]] as [string, string])
    : SCENE_FEATURES;

/**
 * What a patch may be plugged into. One list, in `sceneMap`, so the dropdown
 * and the fold cannot come to disagree about what is patchable.
 */
export const sceneTargets = PATCH_TARGETS;

/**
 * The same list, by the section each control is shown in.
 *
 * Eighty-odd controls in one flat dropdown, in the order they happened to be
 * registered, was a list read top to bottom every time a patch was aimed.
 * Grouped the way the rail is, "the lamp" is a place in the menu, and each
 * group is alphabetical because a select has no search box.
 */
export const TARGET_GROUPS = SETTINGS_SECTIONS
  .map(sec => ({
    id: sec.id,
    name: sec.name,
    targets: sceneTargets.filter(t => t.section === sec.id).sort((a, b) => a.label.localeCompare(b.label)),
  }))
  .filter(g => g.targets.length > 0);
