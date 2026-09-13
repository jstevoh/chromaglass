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
  | 'play-toggle' | 'automate-toggle' | 'overlays-toggle' | 'macro-toggle'
  | 'seq-play-pause' | 'seq-next' | 'seq-prev' | 'seq-stop'
  | 'preset-next' | 'preset-prev';

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
  'seed': 'Seed', 'clear': 'Clear', 'drain': 'Drain', 'lucky': 'Random',
  'play-toggle': 'Play / Pause', 'automate-toggle': 'Random Evolve', 'overlays-toggle': 'Clean Screen', 'macro-toggle': 'Macro',
  'seq-play-pause': 'Sequencer Play / Pause', 'seq-next': 'Sequencer Next', 'seq-prev': 'Sequencer Previous', 'seq-stop': 'Sequencer Stop',
  'preset-next': 'Next Preset', 'preset-prev': 'Previous Preset',
};

/** The settings worth a fader, with their travel. */
export const LEARNABLE_SETTINGS: { key: keyof VisualizerSettings; label: string; min: number; max: number }[] = [
  { key: 'audioImpact',     label: 'Sound Drive',      min: 0, max: 1 },
  { key: 'automateRate',    label: 'Evolve Speed',     min: 0, max: 1 },
  { key: 'globalSpeed',     label: 'Speed',            min: 0.005, max: 0.3 },
  { key: 'dyeBudget',       label: 'Dye Budget',       min: 0, max: 1.5 },
  { key: 'turbulenceScale', label: 'Turbulence',       min: 0, max: 1 },
  { key: 'plateRock',       label: 'Plate Rock',       min: 0, max: 1 },
  { key: 'beatSqueeze',     label: 'Beat Squeeze',     min: 0, max: 1 },
  { key: 'bubbles',         label: 'Bubbles',          min: 0, max: 1 },
  { key: 'saturationBoost', label: 'Saturation',       min: 0.5, max: 2 },
  { key: 'edgeRelief',      label: 'Edge Relief',      min: 0, max: 1 },
  { key: 'lightPlay',       label: 'Light Play',       min: 0, max: 1 },
  { key: 'lampMotion',      label: 'Lamp Motion',      min: 0, max: 1 },
  { key: 'lampHotspot',     label: 'Hot-Spot',         min: 0, max: 1 },
  { key: 'secondLamp',      label: 'Second Lamp',      min: 0, max: 1 },
  { key: 'iridescence',     label: 'Iridescence',      min: 0, max: 1 },
  { key: 'camera',          label: 'Camera',           min: 0, max: 1 },
  { key: 'focus',           label: 'Focus',            min: 0, max: 1 },
  { key: 'aperture',        label: 'Aperture',         min: 0, max: 1 },
  { key: 'bloom',           label: 'Bloom',            min: 0, max: 1 },
  { key: 'macroZoom',       label: 'Macro Zoom',       min: 1, max: 12 },
  { key: 'macroSync',       label: 'Macro Music Sync', min: 0, max: 1 },
  { key: 'macroChase',      label: 'Macro Chase',      min: 0, max: 1 },
  { key: 'hueJourney',      label: 'Hue Journey',      min: 0, max: 10 },
  { key: 'backgroundLoop',  label: 'Background Loop',  min: 0, max: 1 },
  { key: 'dishVignette',    label: 'Round Dish',       min: 0, max: 1 },
  { key: 'lumia',           label: 'Lumia',            min: 0, max: 1 },
  { key: 'chemistry',       label: 'Chemistry',        min: 0, max: 1 },
  { key: 'gelWheel',        label: 'Gel Wheel',        min: 0, max: 1 },
  { key: 'beatLead',        label: 'Beat Lead (ms)',   min: 0, max: 250 },
];
const SETTING_LABELS: Partial<Record<keyof VisualizerSettings, string>> = Object.fromEntries(LEARNABLE_SETTINGS.map(s => [s.key, s.label]));

/** One incoming message, reduced to what a binding needs. */
export interface MidiEvent {
  kind: 'cc' | 'noteon' | 'noteoff';
  channel: number;
  number: number;
  /** 0..127 */
  value: number;
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
 * Soft takeover: a fader whose position disagrees with the app is ignored
 * until it passes through the app's value, so a knob turned on the phone
 * does not jump back the moment a fader twitches.
 */
export class SoftTakeover {
  private lastSeen = new Map<string, number>();

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
  private picked = new Set<string>();
  /** Mark a control as in sync (after it applied a value). */
  markPicked(id: string): void { this.picked.add(id); }
  /** The app changed the value by other means: the control must catch up again. */
  drop(id: string): void { this.picked.delete(id); }
  reset(): void { this.lastSeen.clear(); this.picked.clear(); }
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
    .map(b => ({ ...b, id: typeof b.id === 'string' ? b.id : `b-${Math.random().toString(36).slice(2, 8)}`, mode: (b.mode === 'relative' ? 'relative' : 'absolute') as MidiBinding['mode'] }));
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
