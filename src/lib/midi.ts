/**
 * MIDI for the projectionist's hands.
 *
 * A fader is a better way to ride Sound Drive than a slider under a mouse,
 * and a pad grid is a better way to cue presets in a dark room than a menu.
 * This module is the pure part: what a MIDI message means, what a binding
 * is, how a fader picks up a value it does not agree with (soft takeover),
 * how an endless encoder nudges, and what colour to light a pad. The hook
 * (`useMidi`) owns the devices and the wiring.
 */

import type { VisualizerSettings } from '../types';

/** Where a message comes from: a controller or a note, on a channel (0–15). */
export interface MidiSource {
  kind: 'cc' | 'note';
  channel: number;
  number: number;
}

export type MidiAction =
  | 'seed' | 'clear' | 'drain' | 'lucky'
  /**
   * Flick a plate: spin it up and let it coast down.
   *
   * One per plate rather than one that follows the selected layer, because
   * the two turn opposite ways and the point of having both on pads is
   * shearing them against each other by hand. On a one-layer look the second
   * does nothing.
   */
  | 'spin-front' | 'spin-back'
  | 'play-toggle' | 'automate-toggle' | 'overlays-toggle' | 'macro-toggle'
  | 'seq-play-pause' | 'seq-next' | 'seq-prev' | 'seq-stop'
  | 'preset-next' | 'preset-prev'
  /** The house lights: fade the plate to black and back. */
  | 'blackout-toggle'
  /** Record the show to a video file / stop recording. */
  | 'record-toggle'
  /** Start or stop recording a performance (what is painted, with the song playing). */
  | 'performance-toggle'
  /** Open or close the camera that watches the room. */
  | 'scene-toggle'
  /**
   * Cue and Go, on a pad.
   *
   * The desk's safe way to change a look in front of a room — arm it, then
   * send it as a crossfade rather than a cut through black — could only be
   * driven from the laptop, in the dark, with a trackpad. These are the same
   * three moves the desk has: arm the next look, send it, take it back.
   */
  | 'cue-next' | 'cue-prev' | 'go' | 'revert'
  /**
   * The tempo, by hand. Four taps on a pad is what every VJ reaches for when
   * the room is fighting the microphone.
   */
  | 'tap-tempo' | 'tempo-clear'
  /**
   * The bank, stepped.
   *
   * Nine faders cannot reach forty settings, and the answer every controller
   * has used since the eighties is a shift layer. A binding may name a bank;
   * one that does not is always live, which is where presets, dyes and the
   * transport belong.
   */
  | 'bank-next' | 'bank-prev';

export type MidiTarget =
  /** A numeric setting, the control's full travel mapped onto min..max. */
  | { kind: 'setting'; key: keyof VisualizerSettings; min: number; max: number }
  | { kind: 'action'; action: MidiAction }
  | { kind: 'preset'; presetId: string }
  /** The dye colour the dropper paints with, by palette index. */
  | { kind: 'dye'; paletteIndex: number };

export interface MidiBinding {
  id: string;
  source: MidiSource;
  target: MidiTarget;
  /** 'relative' for endless encoders (two's-complement nudges); 'absolute' for faders and knobs with a stop. */
  mode: 'absolute' | 'relative';
  /**
   * Which shift layer this binding belongs to, or undefined for one that is
   * always live.
   *
   * Undefined is the default and the right answer for most of a map: a preset
   * pad, a dye, blackout and the transport should do the same thing whatever
   * layer the faders are on, because hunting for the right bank is not
   * something to be doing when the band stops. Banks are for the controls
   * there are more of than there are faders.
   */
  bank?: number;
}

export interface MidiMap {
  format: 'chromaglass-midi';
  version: 1;
  name: string;
  /** The controller this was made on, for the reader's benefit. */
  device?: string;
  bindings: MidiBinding[];
}

export const MIDI_FORMAT = 'chromaglass-midi';
export const MIDI_FILE_EXT = '.chromaglass-midi.json';
export const MIDI_MAP_KEY = 'chromaglass-midi-map';

export const sourceKey = (s: MidiSource): string => `${s.kind}:${s.channel}:${s.number}`;

/**
 * Where a setting sits, as a controller's LED ring shows it: 0–127.
 *
 * The inverse of what the message handler does on the way in, and it has to
 * be, or a knob swept to its stop would light a ring at 126 and a preset
 * loading the same value would light it at 127 — a difference nobody can see
 * but which makes the ring flicker every time both happen.
 *
 * Clamped, because a preset may carry a value outside the range a binding was
 * learned over: a fader taught across 0–1 and a look that sets 1.4 would
 * otherwise send 178, which is not a MIDI value at all.
 */
export function settingLed(value: number, min: number, max: number, curve = 1): number {
  const at = Math.round(travelOf(value, min, max, curve) * 127);
  return at < 0 ? 0 : at > 127 ? 127 : at;
}

/**
 * Where a control's travel is not the value's.
 *
 * Speed is the case this exists for. Its range is 0 to 0.3 and thirty of the
 * thirty-two built-in looks sit at or below 0.08 — the bottom 27% of a fader
 * — with the median at 10% of the way along. So the useful part of the
 * control was a centimetre of a ten-centimetre throw, on screen and worse on
 * a hardware fader, where it was CC 0 to 34 of 127. Everything above was a
 * region the plate cannot usefully be played in.
 *
 * `curve` is the exponent on the travel: value = min + span · tᶜ. At 3, half
 * the travel is 0.0375, which is where the looks actually live, and the
 * bottom third of the fader is the slow end that had no resolution at all.
 * It is a property of the *control*, not of the setting — the stored value is
 * unchanged, so a look, a patch or a song cue means exactly what it meant
 * before, and a binding learned before this existed picks up the curve from
 * the table rather than from what it saved.
 */
/**
 * The setting a `midiKey` names, or null if it names something else.
 *
 * A desk labels its controls by what a controller reaches them through —
 * `setting:globalSpeed`, `preset:classic`, `action:go`, `dye:2` — so a
 * surface that wants the *setting* has to take the prefix off. It lives here
 * because it went wrong once by living nowhere: the desk's Speed ride looked
 * its curve up under the full `setting:globalSpeed`, matched nothing, and was
 * the one Speed slider in the app with no curve on it while the panel and the
 * phone had one.
 */
export const settingKeyOf = (midiKey: string | null | undefined): keyof VisualizerSettings | null => {
  if (!midiKey) return null;
  const bare = midiKey.startsWith('setting:') ? midiKey.slice('setting:'.length) : midiKey;
  return LEARNABLE_SETTINGS.some((s) => s.key === bare) ? (bare as keyof VisualizerSettings) : null;
};

export const curveOf = (key: keyof VisualizerSettings): number =>
  LEARNABLE_SETTINGS.find((s) => s.key === key)?.curve ?? 1;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A control at `t` of its travel, as a value. */
export const valueAt = (t: number, min: number, max: number, curve = 1): number =>
  min + (max - min) * (curve === 1 ? clamp01(t) : Math.pow(clamp01(t), curve));

/** The inverse: where a value sits on the control, 0..1. */
export const travelOf = (value: number, min: number, max: number, curve = 1): number => {
  const at = clamp01((value - min) / (max - min || 1));
  return curve === 1 ? at : Math.pow(at, 1 / curve);
};
export const sourceLabel = (s: MidiSource): string => `${s.kind === 'cc' ? 'CC' : 'Note'} ${s.number} ch ${s.channel + 1}`;

export function targetLabel(t: MidiTarget, presetName?: (id: string) => string | undefined): string {
  switch (t.kind) {
    case 'setting': return SETTING_LABELS[t.key] ?? String(t.key);
    case 'action': return ACTION_LABELS[t.action];
    case 'preset': return `Preset: ${presetName?.(t.presetId) ?? t.presetId}`;
    case 'dye': return `Dye ${t.paletteIndex + 1}`;
  }
}

export const ACTION_LABELS: Record<MidiAction, string> = {
  'seed': 'Seed', 'clear': 'Clear', 'drain': 'Drain', 'lucky': 'Randomise',
  'spin-front': 'Spin Front Plate', 'spin-back': 'Spin Back Plate',
  'play-toggle': 'Play / Pause', 'automate-toggle': 'Random Evolve', 'overlays-toggle': 'Clean Screen', 'macro-toggle': 'Macro',
  'seq-play-pause': 'Sequencer Play / Pause', 'seq-next': 'Sequencer Next', 'seq-prev': 'Sequencer Previous', 'seq-stop': 'Sequencer Stop',
  'preset-next': 'Next Preset', 'preset-prev': 'Previous Preset',
  'blackout-toggle': 'Blackout', 'record-toggle': 'Record', 'performance-toggle': 'Record Performance',
  'scene-toggle': 'Watch the Room',
  'cue-next': 'Cue Next Look', 'cue-prev': 'Cue Previous Look', 'go': 'Go', 'revert': 'Back',
  'tap-tempo': 'Tap Tempo', 'tempo-clear': 'Tempo: Listen Again',
  'bank-next': 'Bank +', 'bank-prev': 'Bank \u2212',
};

/**
 * How many shift layers a map has.
 *
 * Four, because that is what an eight-fader controller needs to reach every
 * learnable setting with room left over, and because more than four is more
 * than anyone remembers in the dark.
 */
export const MIDI_BANKS = 4;

/**
 * The settings worth a fader, with their travel.
 *
 * The travel is the settings sheet's, number for number. It used to be MIDI's
 * own — Speed started at 0.005 where the sheet starts at 0, the macro zoom
 * stopped at 12 where the sheet, the zoom keys and the wheel go to 16, and the
 * folds ran 0 to 12 continuously where the sheet offers five buttons — so a
 * fader at the top of its travel was not the sheet at the top of its travel,
 * and every desk and patch that took its range from here inherited the
 * difference. `npm run panel` holds the two together now.
 *
 * `step` marks a control that only takes whole steps; see `deskPins.ts`.
 */
export const LEARNABLE_SETTINGS: { key: keyof VisualizerSettings; label: string; min: number; max: number; step?: number; curve?: number }[] = [
  { key: 'dimmer',          label: 'Dimmer',           min: 0, max: 1 },
  { key: 'audioImpact',     label: 'Sound Drive',      min: 0, max: 1 },
  { key: 'automateRate',    label: 'Evolve Speed',     min: 0, max: 1 },
  { key: 'globalSpeed',     label: 'Speed',            min: 0,   max: 0.3, curve: 3 },
  { key: 'dyeBudget',       label: 'Dye Budget',       min: 0.1, max: 1.2 },
  { key: 'turbulenceScale', label: 'Turbulence',       min: 0, max: 1 },
  { key: 'plateRock',       label: 'Plate Rock',       min: 0, max: 1 },
  { key: 'beatSqueeze',     label: 'Beat Squeeze',     min: 0, max: 1 },
  { key: 'fingering',       label: 'Fingering',        min: 0, max: 1 },
  { key: 'beads',           label: 'Oil Beads',        min: 0, max: 1 },
  { key: 'dishSpread',      label: 'Dish Spread',      min: 0, max: 1 },
  { key: 'cells',           label: 'Plate Cells',      min: 0, max: 1 },
  { key: 'bubbles',         label: 'Bubbles',          min: 0, max: 1 },
  { key: 'saturationBoost', label: 'Saturation',       min: 0.5, max: 2 },
  { key: 'edgeRelief',      label: 'Edge Relief',      min: 0, max: 1 },
  { key: 'lacing',          label: 'Lacing',           min: 0, max: 1 },
  { key: 'lightPlay',       label: 'Light Play',       min: 0, max: 1 },
  { key: 'lampMotion',      label: 'Lamp Motion',      min: 0, max: 1 },
  { key: 'lampHotspot',     label: 'Hot-Spot',         min: 0, max: 1 },
  { key: 'secondLamp',      label: 'Second Lamp',      min: 0, max: 1 },
  { key: 'iridescence',     label: 'Iridescence',      min: 0, max: 1 },
  { key: 'camera',          label: 'Lens',             min: 0, max: 1 },
  { key: 'focus',           label: 'Focus',            min: 0, max: 1 },
  { key: 'aperture',        label: 'Aperture',         min: 0, max: 1 },
  { key: 'bloom',           label: 'Bloom',            min: 0, max: 1 },
  { key: 'sharpness',       label: 'Sharpness',        min: 0, max: 1 },
  { key: 'particles',       label: 'Dye Particles',    min: 0, max: 1 },
  { key: 'particleMix',     label: 'Particle Colour',  min: 0, max: 1 },
  { key: 'granulation',     label: 'Granulation',      min: 0, max: 1 },
  { key: 'macroZoom',       label: 'Macro Zoom',       min: 1, max: 16 },
  { key: 'macroSync',       label: 'Macro Music Sync', min: 0, max: 1 },
  { key: 'macroChase',      label: 'Macro Chase',      min: 0, max: 1 },
  { key: 'hueJourney',      label: 'Hue Journey',      min: 0, max: 10 },
  { key: 'backgroundLoop',  label: 'Background Loop',  min: 0, max: 1 },
  { key: 'dishVignette',    label: 'Round Dish',       min: 0, max: 1 },
  { key: 'lumia',           label: 'Lumia',            min: 0, max: 1 },
  { key: 'chemistry',       label: 'Chemistry',        min: 0, max: 1 },
  { key: 'gelWheel',        label: 'Gel Wheel',        min: 0, max: 1 },
  // The mirror rig, which is the one optical trick people reach for mid-song.
  // Folds is a stepped choice and rides a fader as one: the sheet's five
  // buttons, Off, 2, 4, 6 and 8, each a fifth of the travel.
  { key: 'kaleidoscope',   label: 'Kaleidoscope',     min: 0, max: 8, step: 2 },
  { key: 'kaleidoSpin',    label: 'Kaleido Spin',     min: -0.5, max: 0.5 },
  { key: 'kaleidoZoom',    label: 'Kaleido Zoom',     min: 0.2, max: 1.6 },
  { key: 'beatLead',        label: 'Beat Lead (ms)',   min: 0, max: 250 },
  // The film as a force rather than a slide. Worth a fader for the same
  // reason Room Drive is: how hard the reel pushes the plate is something you
  // ride between a verse and a chorus.
  { key: 'filmDrive',       label: 'Film Drive',       min: 0, max: 1 },
  { key: 'filmImpact',      label: 'Film Impact',      min: 0, max: 1 },
  { key: 'soundImpact',     label: 'Sound Impact',     min: 0, max: 1 },
  // The fourth master, over the LFOs and envelopes. It had a setting and a
  // reader and no control anywhere, so a shape patch could not be pulled down
  // at all short of deleting it.
  { key: 'shapeImpact',     label: 'Shapes Impact',    min: 0, max: 1 },
  // The room. Worth a fader more than most: how hard the crowd drives the
  // plate is the thing you ride between a verse and a chorus.
  { key: 'sceneDrive',      label: 'Room Drive',       min: 0, max: 1 },
  { key: 'sceneHands',      label: 'Room Hands',       min: 0, max: 1 },
  { key: 'sceneImpact',     label: 'Room Impact',      min: 0, max: 1 },
];
const SETTING_LABELS: Partial<Record<keyof VisualizerSettings, string>> = Object.fromEntries(LEARNABLE_SETTINGS.map(s => [s.key, s.label]));
const LEARNABLE_BY_KEY = new Map(LEARNABLE_SETTINGS.map(s => [s.key, s]));

/**
 * A binding's travel, brought up to the setting's one range.
 *
 * A setting binding carries its own min and max, copied from the list above
 * when it was learned — so a map saved while Speed rode 0.005–0.3 on a fader
 * would have gone on disagreeing with the sheet for as long as the file lived.
 * Nothing in the app lets a binding's travel be edited, so the copy was never a
 * choice somebody made, and replacing it with today's is the only way an old
 * map and a new one mean the same thing. A key this list does not know keeps
 * whatever it came with.
 */
export function onTodaysTravel(t: MidiTarget): MidiTarget {
  if (t.kind !== 'setting') return t;
  const s = LEARNABLE_BY_KEY.get(t.key);
  return s ? { ...t, min: s.min, max: s.max } : t;
}

/** One incoming message, reduced to what a binding needs. */
export interface MidiEvent {
  kind: 'cc' | 'noteon' | 'noteoff';
  channel: number;
  number: number;
  /** 0..127 */
  value: number;
}

/**
 * System realtime: the tempo, on the same cable as the faders.
 *
 * These are single bytes with no channel and no data, interleaved with
 * everything else — which is why `parseMidi` never saw them: it wants at
 * least two bytes. A desk sending clock sends 0xF8 twenty-four times a
 * quarter note, all night, whether or not anything is listening.
 */
export type MidiRealtime = 'clock' | 'start' | 'continue' | 'stop';

export function parseMidiRealtime(data: Uint8Array | number[]): MidiRealtime | null {
  switch (data[0]) {
    case 0xf8: return 'clock';
    case 0xfa: return 'start';
    case 0xfb: return 'continue';
    case 0xfc: return 'stop';
    default: return null;
  }
}

export function parseMidi(data: Uint8Array | number[]): MidiEvent | null {
  if (data.length < 2) return null;
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  const number = data[1] & 0x7f;
  const value = (data[2] ?? 0) & 0x7f;
  if (status === 0xb0) return { kind: 'cc', channel, number, value };
  if (status === 0x90) return value > 0 ? { kind: 'noteon', channel, number, value } : { kind: 'noteoff', channel, number, value: 0 };
  if (status === 0x80) return { kind: 'noteoff', channel, number, value: 0 };
  return null;
}

export const eventSource = (e: MidiEvent): MidiSource => ({ kind: e.kind === 'cc' ? 'cc' : 'note', channel: e.channel, number: e.number });

/**
 * Endless encoders send nudges, not positions. The common "relative 2"
 * convention: 1..63 means +n, 65..127 means -(128-n). Returns the nudge in
 * steps, or 0 for 64 / 0.
 */
export function relativeDelta(value: number): number {
  if (value === 0 || value === 64) return 0;
  return value < 64 ? value : value - 128;
}

/**
 * How far the app's value may sit from where this fader last put it before
 * that counts as somebody else having moved it.
 *
 * Wider than a fader's own resolution (1/127, about 0.008) so that the
 * rounding of a value on its way through a setting never reads as an edit,
 * and far narrower than any move a hand or a preset makes.
 */
const MOVED_ELSEWHERE = 0.02;

/**
 * Soft takeover: a fader whose position disagrees with the app is ignored
 * until it passes through the app's value, so a knob turned on the phone
 * does not jump back the moment a fader twitches.
 */
export class SoftTakeover {
  private lastSeen = new Map<string, number>();
  private picked = new Set<string>();
  /** What each fader last wrote, to tell its own work from somebody else's. */
  private wrote = new Map<string, number>();

  /**
   * What a fader should write, or null while it has not picked the value up.
   *
   * This is the whole decision, including noticing that something other than
   * this fader moved the setting — which has to live here, with the pickup
   * state it invalidates, rather than beside the call. Split across the two,
   * each half could be true about a different message: the caller compared
   * the reading against its own record of the last write while `apply` below
   * compared it against the incoming position, and a reading that was merely
   * *late* looked like an edit to the first and like a fader out of position
   * to the second. Between them they dropped the pickup and then refused to
   * re-take it, which on a desk is a fader that has stopped working.
   *
   * `incoming` and `current` are both 0..1.
   */
  ride(id: string, incoming: number, current: number): number | null {
    const mine = this.wrote.get(id);
    if (mine !== undefined && Math.abs(mine - current) > MOVED_ELSEWHERE) this.drop(id);
    const v = this.apply(id, incoming, current);
    if (v === null) return null;
    this.picked.add(id);
    this.wrote.set(id, v);
    return v;
  }

  /**
   * `incoming` and `current` are both 0..1. Returns the value to apply, or
   * null while the control has not yet caught up.
   */
  apply(id: string, incoming: number, current: number): number | null {
    const prev = this.lastSeen.get(id);
    this.lastSeen.set(id, incoming);
    if (Math.abs(incoming - current) < 0.03) return incoming;
    if (prev === undefined) return null;                                    // first touch, far away: wait
    // Crossed the app's value between the previous and this reading: pick up.
    if ((prev <= current && incoming >= current) || (prev >= current && incoming <= current)) return incoming;
    // Already picked up and moving continuously: keep applying.
    if (Math.abs(incoming - prev) < 0.12 && this.picked.has(id)) return incoming;
    return null;
  }
  /** The app changed the value by other means: the control must catch up again. */
  drop(id: string): void { this.picked.delete(id); this.wrote.delete(id); }
  reset(): void { this.lastSeen.clear(); this.picked.clear(); this.wrote.clear(); }
}

// ── Pad colours ─────────────────────────────────────────────────────
// Launchpad and APC mini mk2 pads take a velocity that indexes a palette of
// 128 colours. A coarse copy of that palette is enough to light each preset
// pad in its lead dye: the nearest entry is chosen by colour distance.
const PAD_PALETTE: [number, number, number, number][] = [
  [0, 0, 0, 0], [1, 0.11, 0.11, 0.11], [2, 0.49, 0.49, 0.49], [3, 1, 1, 1],
  [4, 1, 0.37, 0.37], [5, 1, 0, 0], [6, 0.35, 0, 0], [7, 0.1, 0, 0],
  [8, 1, 0.74, 0.43], [9, 1, 0.33, 0], [10, 0.35, 0.11, 0], [11, 0.1, 0.05, 0],
  [12, 1, 0.98, 0.57], [13, 1, 1, 0], [14, 0.35, 0.35, 0], [15, 0.1, 0.1, 0],
  [16, 0.7, 1, 0.3], [17, 0.33, 1, 0], [18, 0.1, 0.35, 0], [19, 0.05, 0.1, 0],
  [20, 0.35, 1, 0.35], [21, 0, 1, 0], [22, 0, 0.35, 0], [23, 0, 0.1, 0],
  [24, 0.35, 1, 0.5], [25, 0, 1, 0.33], [26, 0, 0.35, 0.11], [27, 0, 0.1, 0.05],
  [28, 0.35, 1, 0.75], [29, 0, 1, 0.6], [30, 0, 0.35, 0.2], [31, 0, 0.1, 0.05],
  [32, 0.35, 1, 1], [33, 0, 1, 1], [34, 0, 0.35, 0.35], [35, 0, 0.1, 0.1],
  [36, 0.35, 0.75, 1], [37, 0, 0.6, 1], [38, 0, 0.2, 0.35], [39, 0, 0.05, 0.1],
  [40, 0.35, 0.5, 1], [41, 0, 0.33, 1], [42, 0, 0.11, 0.35], [43, 0, 0.03, 0.1],
  [44, 0.35, 0.35, 1], [45, 0, 0, 1], [46, 0, 0, 0.35], [47, 0, 0, 0.1],
  [48, 0.6, 0.35, 1], [49, 0.33, 0, 1], [50, 0.1, 0, 0.35], [51, 0.03, 0, 0.1],
  [52, 1, 0.35, 1], [53, 1, 0, 1], [54, 0.35, 0, 0.35], [55, 0.1, 0, 0.1],
  [56, 1, 0.35, 0.6], [57, 1, 0, 0.33], [58, 0.35, 0, 0.11], [59, 0.1, 0, 0.03],
  [60, 1, 0.13, 0], [61, 0.6, 0.23, 0], [62, 0.47, 0.35, 0], [63, 0.25, 0.4, 0],
  [64, 0, 0.35, 0.03], [65, 0, 0.35, 0.3], [66, 0, 0.2, 0.5], [67, 0, 0, 1],
  [68, 0, 0.27, 0.35], [69, 0.13, 0, 0.8], [70, 0.49, 0.49, 0.49], [71, 0.13, 0.13, 0.13],
  [72, 1, 0, 0], [73, 0.74, 1, 0.19], [74, 0.68, 0.92, 0.03], [75, 0.33, 1, 0.03],
  [76, 0.05, 0.53, 0], [77, 0, 1, 0.53], [78, 0, 0.66, 1], [79, 0, 0.16, 1],
  [80, 0.24, 0, 1], [81, 0.5, 0, 1], [82, 0.71, 0.1, 0.5], [83, 0.24, 0.1, 0],
  [84, 1, 0.3, 0], [85, 0.52, 0.9, 0], [86, 0.35, 1, 0], [87, 0, 1, 0],
  [88, 0, 1, 0], [89, 0.23, 1, 0.43], [90, 0, 0.9, 0.79], [91, 0.35, 0.6, 1],
  [92, 0.27, 0.35, 0.85], [93, 0.5, 0.35, 0.85], [94, 0.85, 0.13, 1], [95, 1, 0, 0.35],
  [96, 1, 0.5, 0], [97, 0.72, 0.7, 0], [98, 0.5, 1, 0], [99, 0.5, 0.35, 0.1],
  [100, 0.2, 0.15, 0], [101, 0.05, 0.3, 0.1], [102, 0, 0.35, 0.4], [103, 0.1, 0.1, 0.25],
  [104, 0.06, 0.13, 0.4], [105, 0.4, 0.2, 0.1], [106, 0.65, 0.05, 0], [107, 0.85, 0.35, 0.1],
  [108, 0.85, 0.65, 0.1], [109, 0.6, 0.9, 0.1], [110, 0.35, 0.65, 0.1], [111, 0.1, 0.1, 0.2],
  [112, 0.85, 0.9, 0.35], [113, 0.5, 1, 0.75], [114, 0.6, 0.6, 1], [115, 0.6, 0.35, 1],
  [116, 0.25, 0.25, 0.25], [117, 0.45, 0.45, 0.45], [118, 0.9, 1, 1], [119, 0.65, 0, 0],
  [120, 0.2, 0, 0], [121, 0.1, 0.8, 0], [122, 0.05, 0.25, 0], [123, 0.7, 0.55, 0],
  [124, 0.25, 0.2, 0], [125, 0.7, 0.35, 0], [126, 0.3, 0.1, 0], [127, 0.05, 0.05, 0],
];

/** The pad velocity whose palette colour is nearest to an RGB (0..1) colour. */
export function padVelocityFor(r: number, g: number, b: number, dim = false): number {
  const k = dim ? 0.35 : 1;
  let best = 0, bestD = Infinity;
  for (const [v, pr, pg, pb] of PAD_PALETTE) {
    if (v === 0) continue;
    const d = (pr - r * k) ** 2 + (pg - g * k) ** 2 + (pb - b * k) ** 2;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

export function serializeMidiMap(map: MidiMap): string { return JSON.stringify(map, null, 2) + '\n'; }

export function parseMidiMap(text: string): MidiMap {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('That is not a JSON file.'); }
  const o = raw as Partial<MidiMap>;
  if (!o || typeof o !== 'object' || o.format !== MIDI_FORMAT) throw new Error('That is not a ChromaGlass MIDI map.');
  if (!Array.isArray(o.bindings)) throw new Error('The MIDI map has no bindings.');
  const bindings = o.bindings.filter((b): b is MidiBinding =>
    !!b && typeof b === 'object' && !!b.source && !!b.target &&
    (b.source.kind === 'cc' || b.source.kind === 'note') && Number.isInteger(b.source.channel) && Number.isInteger(b.source.number))
    .map(b => ({
      ...b,
      target: onTodaysTravel(b.target),
      id: typeof b.id === 'string' ? b.id : `b-${Math.random().toString(36).slice(2, 8)}`,
      mode: (b.mode === 'relative' ? 'relative' : 'absolute') as MidiBinding['mode'],
      // A map written before banks existed has none, and every binding in it
      // is always live — which is exactly what `undefined` means, so old maps
      // keep working without being migrated.
      bank: Number.isInteger(b.bank) && (b.bank as number) >= 0 && (b.bank as number) < MIDI_BANKS ? b.bank : undefined,
    }));
  return { format: MIDI_FORMAT, version: 1, name: typeof o.name === 'string' ? o.name : 'MIDI map', device: typeof o.device === 'string' ? o.device : undefined, bindings };
}

export function loadMidiMap(): MidiMap | null {
  try { const raw = localStorage.getItem(MIDI_MAP_KEY); return raw ? parseMidiMap(raw) : null; } catch { return null; }
}
export function saveMidiMap(map: MidiMap): void {
  try { localStorage.setItem(MIDI_MAP_KEY, serializeMidiMap(map)); } catch { /* storage full or private */ }
}

// ── Factory maps ────────────────────────────────────────────────────
const bind = (source: MidiSource, target: MidiTarget, mode: 'absolute' | 'relative' = 'absolute'): MidiBinding =>
  ({ id: `${sourceKey(source)}->${target.kind}`, source, target, mode });
const cc = (number: number, channel = 0): MidiSource => ({ kind: 'cc', channel, number });
const note = (number: number, channel = 0): MidiSource => ({ kind: 'note', channel, number });
const setting = (key: keyof VisualizerSettings): MidiTarget => {
  const s = LEARNABLE_SETTINGS.find(x => x.key === key)!;
  return { kind: 'setting', key, min: s.min, max: s.max };
};

/**
 * APC mini mk2: 8×8 pads (notes 0–63, bottom-left first), a scene column
 * (notes 112–119), track buttons (100–107), faders CC 48–56. Presets fill
 * the pads from the top row down; the bottom row is dye colours; scene
 * buttons run the sequencer; faders ride the show.
 */
export function apcMiniMk2Map(presetIds: string[]): MidiMap {
  const b: MidiBinding[] = [];
  // Top six rows: presets (row 7 is notes 56–63, row 2 is 8–15).
  presetIds.slice(0, 48).forEach((id, i) => {
    const row = 7 - Math.floor(i / 8), col = i % 8;
    b.push(bind(note(row * 8 + col), { kind: 'preset', presetId: id }));
  });
  // Row 1 (notes 8–15): dyes 0–7; row 0 (notes 0–7): dyes 8–15.
  for (let i = 0; i < 8; i++) b.push(bind(note(8 + i), { kind: 'dye', paletteIndex: i }));
  for (let i = 0; i < 8; i++) b.push(bind(note(i), { kind: 'dye', paletteIndex: 8 + i }));
  // Scene buttons: sequencer and one-shots.
  const scenes: MidiAction[] = ['seq-play-pause', 'seq-prev', 'seq-next', 'seq-stop', 'seed', 'drain', 'clear', 'lucky'];
  scenes.forEach((a, i) => b.push(bind(note(112 + i), { kind: 'action', action: a })));
  // Track buttons: toggles.
  const tracks: MidiAction[] = ['play-toggle', 'automate-toggle', 'macro-toggle', 'overlays-toggle', 'preset-prev', 'preset-next'];
  tracks.forEach((a, i) => b.push(bind(note(100 + i), { kind: 'action', action: a })));
  // Faders.
  const faders: (keyof VisualizerSettings)[] = ['audioImpact', 'automateRate', 'globalSpeed', 'dyeBudget', 'turbulenceScale', 'plateRock', 'bubbles', 'saturationBoost', 'camera'];
  faders.forEach((k, i) => b.push(bind(cc(48 + i), setting(k))));
  return { format: MIDI_FORMAT, version: 1, name: 'APC mini mk2', device: 'APC mini mk2', bindings: b };
}

/** Korg nanoKONTROL2 in its factory CC mode: faders CC 0–7, knobs 16–23, S/M/R buttons and transport as CCs. */
export function nanoKontrol2Map(): MidiMap {
  const b: MidiBinding[] = [];
  const faders: (keyof VisualizerSettings)[] = ['audioImpact', 'automateRate', 'globalSpeed', 'dyeBudget', 'turbulenceScale', 'plateRock', 'bubbles', 'saturationBoost'];
  faders.forEach((k, i) => b.push(bind(cc(i), setting(k))));
  const knobs: (keyof VisualizerSettings)[] = ['lightPlay', 'lampMotion', 'lampHotspot', 'secondLamp', 'camera', 'focus', 'aperture', 'bloom'];
  knobs.forEach((k, i) => b.push(bind(cc(16 + i), setting(k))));
  // S buttons (CC 32–39): actions; M buttons (48–55): toggles.
  const s: MidiAction[] = ['seed', 'clear', 'drain', 'lucky', 'seq-play-pause', 'seq-prev', 'seq-next', 'seq-stop'];
  s.forEach((a, i) => b.push(bind(cc(32 + i), { kind: 'action', action: a })));
  const m: MidiAction[] = ['play-toggle', 'automate-toggle', 'macro-toggle', 'overlays-toggle', 'preset-prev', 'preset-next'];
  m.forEach((a, i) => b.push(bind(cc(48 + i), { kind: 'action', action: a })));
  // Transport: play 41, stop 42, prev track 58, next track 59.
  b.push(bind(cc(41), { kind: 'action', action: 'seq-play-pause' }));
  b.push(bind(cc(42), { kind: 'action', action: 'seq-stop' }));
  b.push(bind(cc(58), { kind: 'action', action: 'preset-prev' }));
  b.push(bind(cc(59), { kind: 'action', action: 'preset-next' }));
  return { format: MIDI_FORMAT, version: 1, name: 'nanoKONTROL2', device: 'nanoKONTROL2', bindings: b };
}

/**
 * Akai APC40 mkII: the classic VJ desk.
 *
 * Laid out for a hand in the dark. The 8×5 clip grid cues presets from the top
 * row down, and its bottom row — full-colour pads, so each one lights in the
 * dye it drops — is the palette. Track faders (CC 7 on channels 1–8) ride the
 * show under the master dimmer (CC 14); the device knobs (CC 16–23) are the
 * lamp and camera, the track knobs (CC 48–55) the plate, and the crossfader and
 * cue encoder take the two controls that decide how the liquid itself reads.
 * The scene column runs the sequencer, the arrows step presets, and the two
 * destructive one-shots sit alone under the scene column, a hand's width from
 * Seed, where they cannot be hit by mistake.
 */
export function apc40Mk2Map(presetIds: string[]): MidiMap {
  const b: MidiBinding[] = [];
  // Rows 5–2 of the grid (notes 8–39) are presets; row 1 (notes 0–7) is dyes.
  presetIds.slice(0, 32).forEach((id, i) => {
    const row = 4 - Math.floor(i / 8), col = i % 8;
    b.push(bind(note(row * 8 + col), { kind: 'preset', presetId: id }));
  });
  for (let i = 0; i < 8; i++) b.push(bind(note(i), { kind: 'dye', paletteIndex: i }));
  const faders: (keyof VisualizerSettings)[] = ['audioImpact', 'automateRate', 'globalSpeed', 'dyeBudget', 'turbulenceScale', 'plateRock', 'bubbles', 'saturationBoost'];
  faders.forEach((k, ch) => b.push(bind(cc(7, ch), setting(k))));
  b.push(bind(cc(14), setting('dimmer')));
  const device: (keyof VisualizerSettings)[] = ['lightPlay', 'lampMotion', 'lampHotspot', 'secondLamp', 'camera', 'focus', 'aperture', 'bloom'];
  device.forEach((k, i) => b.push(bind(cc(16 + i), setting(k))));
  const track: (keyof VisualizerSettings)[] = ['beatSqueeze', 'edgeRelief', 'iridescence', 'hueJourney', 'backgroundLoop', 'dishVignette', 'macroZoom', 'macroSync'];
  track.forEach((k, i) => b.push(bind(cc(48 + i), setting(k))));
  // The crossfader's long throw suits the one control that changes how the
  // liquid itself reads; the cue encoder is endless, so it nudges the grain.
  b.push(bind(cc(15), setting('sharpness')));
  b.push(bind(cc(47), setting('granulation'), 'relative'));
  // Random is the one a hand goes for mid-song, so it sits at the top of the
  // column rather than directly above Drain; the button above Drain is the
  // harmless one.
  const scenes: MidiAction[] = ['lucky', 'seq-play-pause', 'seq-prev', 'seq-next', 'seq-stop'];
  scenes.forEach((a, i) => b.push(bind(note(82 + i), { kind: 'action', action: a })));
  // Master select and Stop All Clips, alone under the scene column: the two
  // one-shots that empty the plate, kept away from Seed.
  b.push(bind(note(80), { kind: 'action', action: 'drain' }));
  b.push(bind(note(81), { kind: 'action', action: 'clear' }));
  // Clip stop buttons (note 52 on channels 1–8): Seed and the toggles.
  const stops: MidiAction[] = ['seed', 'automate-toggle', 'macro-toggle', 'overlays-toggle', 'revert'];
  stops.forEach((a, ch) => b.push(bind(note(52, ch), { kind: 'action', action: a })));
  b.push(bind(note(91), { kind: 'action', action: 'play-toggle' }));     // play
  b.push(bind(note(92), { kind: 'action', action: 'blackout-toggle' })); // stop
  b.push(bind(note(93), { kind: 'action', action: 'record-toggle' }));   // record
  // The arrows either side of the transport arm the next look rather than
  // sending it: on this controller there is a Go, so stepping should be the
  // safe half of the pair. (The up/down arrows keep stepping the live preset,
  // for building a look rather than playing one.)
  b.push(bind(note(97), { kind: 'action', action: 'cue-prev' }));        // left
  b.push(bind(note(96), { kind: 'action', action: 'cue-next' }));        // right
  b.push(bind(note(94), { kind: 'action', action: 'preset-next' }));     // up
  b.push(bind(note(95), { kind: 'action', action: 'preset-prev' }));     // down
  // Tap Tempo is a button Akai put on the panel and this app has drawn on the
  // controller picture since the picture existed, with nothing behind it.
  b.push(bind(note(0x63), { kind: 'action', action: 'tap-tempo' }));
  b.push(bind(note(0x5A), { kind: 'action', action: 'tempo-clear' }));   // metronome
  // Shift is the obvious bank key and cycles one way; Nudge +/- step both
  // ways for anyone who would rather not wrap. Sixteen knobs, forty settings.
  b.push(bind(note(0x62), { kind: 'action', action: 'bank-next' }));     // shift
  b.push(bind(note(0x65), { kind: 'action', action: 'bank-next' }));     // nudge +
  b.push(bind(note(0x64), { kind: 'action', action: 'bank-prev' }));     // nudge -
  // Session Rec is the big unassigned button on this panel, and Go is the
  // move that most deserves one. (Back sits on the fifth clip-stop button,
  // above.)
  b.push(bind(note(0x66), { kind: 'action', action: 'go' }));
  return { format: MIDI_FORMAT, version: 1, name: 'APC40 mkII', device: 'APC40 mkII', bindings: b };
}

/**
 * Novation Launchpad Mini mk3 / Launchpad X in programmer mode: pads are
 * notes 11–88 (row × 10 + column, row 1 at the bottom), the top row of
 * buttons CC 91–98, the right column CC 89 down to 19. The top six rows are
 * presets, the bottom two dyes, the top buttons the one-shots and the
 * sequencer, the side column the toggles. Colours light by velocity.
 */
export function launchpadMap(presetIds: string[]): MidiMap {
  const b: MidiBinding[] = [];
  presetIds.slice(0, 48).forEach((id, i) => {
    const row = 8 - Math.floor(i / 8), col = 1 + (i % 8);
    b.push(bind(note(row * 10 + col), { kind: 'preset', presetId: id }));
  });
  for (let i = 0; i < 8; i++) b.push(bind(note(20 + 1 + i), { kind: 'dye', paletteIndex: i }));
  for (let i = 0; i < 8; i++) b.push(bind(note(10 + 1 + i), { kind: 'dye', paletteIndex: 8 + i }));
  const top: MidiAction[] = ['seed', 'drain', 'clear', 'lucky', 'seq-play-pause', 'seq-prev', 'seq-next', 'seq-stop'];
  top.forEach((a, i) => b.push(bind(cc(91 + i), { kind: 'action', action: a })));
  const side: MidiAction[] = ['play-toggle', 'automate-toggle', 'macro-toggle', 'overlays-toggle', 'blackout-toggle', 'record-toggle', 'preset-prev', 'preset-next'];
  side.forEach((a, i) => b.push(bind(cc(89 - 10 * i), { kind: 'action', action: a })));
  return { format: MIDI_FORMAT, version: 1, name: 'Launchpad', device: 'Launchpad Mini mk3 / X (programmer mode)', bindings: b };
}

/**
 * Novation Launch Control XL (factory template 1): three rows of knobs
 * (CC 13–20, 29–36, 49–56), eight faders (CC 77–84), and two rows of
 * buttons (notes 41–44 + 57–60, 73–76 + 89–92).
 */
export function launchControlXlMap(): MidiMap {
  const b: MidiBinding[] = [];
  const faders: (keyof VisualizerSettings)[] = ['dimmer', 'audioImpact', 'automateRate', 'globalSpeed', 'dyeBudget', 'turbulenceScale', 'plateRock', 'bubbles'];
  faders.forEach((k, i) => b.push(bind(cc(77 + i), setting(k))));
  const row1: (keyof VisualizerSettings)[] = ['lightPlay', 'lampMotion', 'lampHotspot', 'secondLamp', 'iridescence', 'saturationBoost', 'edgeRelief', 'beatSqueeze'];
  row1.forEach((k, i) => b.push(bind(cc(13 + i), setting(k))));
  const row2: (keyof VisualizerSettings)[] = ['camera', 'focus', 'aperture', 'bloom', 'hueJourney', 'backgroundLoop', 'dishVignette', 'beatLead'];
  row2.forEach((k, i) => b.push(bind(cc(29 + i), setting(k))));
  const row3: (keyof VisualizerSettings)[] = ['macroZoom', 'macroSync', 'macroChase', 'lumia', 'chemistry', 'gelWheel', 'turbulenceScale', 'dyeBudget'];
  row3.forEach((k, i) => b.push(bind(cc(49 + i), setting(k))));
  const focus: MidiAction[] = ['seed', 'drain', 'clear', 'lucky', 'seq-play-pause', 'seq-prev', 'seq-next', 'seq-stop'];
  [41, 42, 43, 44, 57, 58, 59, 60].forEach((n, i) => b.push(bind(note(n), { kind: 'action', action: focus[i] })));
  const control: MidiAction[] = ['play-toggle', 'automate-toggle', 'macro-toggle', 'overlays-toggle', 'blackout-toggle', 'record-toggle', 'preset-prev', 'preset-next'];
  [73, 74, 75, 76, 89, 90, 91, 92].forEach((n, i) => b.push(bind(note(n), { kind: 'action', action: control[i] })));
  return { format: MIDI_FORMAT, version: 1, name: 'Launch Control XL', device: 'Launch Control XL', bindings: b };
}

/**
 * The factory maps, and how to recognise the hardware they are for.
 *
 * Plugging an APC40 in and being told nothing is the state this list exists to
 * end. Every one of these maps was already here and already good; what was
 * missing was anything that said "that is the thing you have, press this".
 *
 * The patterns match what the OS calls the port, which is not the same as what
 * is printed on the box: a mk2 APC mini reports "APC mini mk2" on macOS and
 * "APC mini mk2 APC mini mk2 Contro" on Windows, and a Launchpad reports any
 * of half a dozen model names (Mini MK3, X, Pro). So they are loose enough to
 * survive that, and specific enough not to overlap — no bare `apc`, which
 * would match both Akai boards and hand back whichever happened to be first.
 * `factoryFor` takes the first hit, so if two ever did overlap the one higher
 * in this list wins.
 */
export type FactoryMapId = 'apc-mini-mk2' | 'nanokontrol2' | 'apc40-mk2' | 'launchpad' | 'launch-control-xl';

export const FACTORY_MAPS: { id: FactoryMapId; name: string; match: RegExp }[] = [
  { id: 'apc40-mk2',        name: 'APC40 mkII',       match: /apc\s*40/i },
  { id: 'apc-mini-mk2',     name: 'APC mini mk2',     match: /apc\s*mini/i },
  { id: 'launch-control-xl', name: 'Launch Control XL', match: /launch\s*control/i },
  { id: 'launchpad',        name: 'Launchpad',        match: /launchpad/i },
  { id: 'nanokontrol2',     name: 'nanoKONTROL2',     match: /nano\s*kontrol/i },
];

/** Which factory map is for this port, or null when we do not know the device. */
export function factoryFor(inputName: string | null | undefined): { id: FactoryMapId; name: string } | null {
  if (!inputName) return null;
  const hit = FACTORY_MAPS.find(f => f.match.test(inputName));
  return hit ? { id: hit.id, name: hit.name } : null;
}
