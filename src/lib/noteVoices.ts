/**
 * MIDI notes as voices on the plate (PLAN 24.3, with §30's envelope + patch
 * source and VS 2's placed chords + per-channel voice cap).
 *
 * A controller pad fires an action or picks a look; a sequencer's notes play
 * the liquid itself. One learned note on a channel binds the whole channel:
 *
 *   - **note-on** places one real pipette drop on Melody Walk's own line and
 *     circle-of-fifths offset (`melodyPlace`, `lib/melodyWalk.ts`), so a note
 *     from an OXI One or AUM lands on the exact spot the microphone's ear puts
 *     the same pitch (`24.3-place-1`), with its volume scaled by velocity;
 *   - **while held**, the voice continues to pour at its spot, rising over the
 *     channel's `attack` (seconds) and, after **note-off**, falling over its
 *     `release` (seconds);
 *   - **chords** land as several drops in the same frame, spread across the
 *     plate by pitch, up to the channel's voice `cap` (4 by default: a fifth
 *     held note on the same channel releases the oldest held voice on that
 *     channel while leaving every other channel's voices alone);
 *   - **patch bay (`notes`)**: exposes `velocity`, `pitch` and `held` in 0..1
 *     so a note can ride any patchable setting or dish area the way a band or
 *     hit does.
 *
 * Plain functions over one pre-allocated state object (`NoteVoices`), free of
 * DOM and GPU so `npm run soundowed` drives it directly in Node and the frame
 * loop steps active pours without per-frame allocation.
 */

import { DEFAULT_MELODY_LINE, melodyPlace, type MelodyLine } from './melodyWalk.ts';

export type VoiceTool = 'dropper' | 'pour' | 'spray' | 'splatter';

export interface VoiceShape {
  /** Attack time in seconds (0 = instant). */
  attack: number;
  /** Release time in seconds (0 = stops on the frame after note-off). */
  release: number;
  /** Maximum simultaneously held voices on one MIDI channel before the oldest is released. */
  cap: number;
  /** Which hand lays and pours the voice on the plate. */
  tool?: VoiceTool;
  /** Bottle id (`lib/presetPlate.ts`), or empty/absent for the look's own draw. */
  liquid?: string;
  /** Dish area index (`lib/plateAreas.ts`), or absent/-1 for the whole plate's line. */
  area?: number;
}

export const VOICE_DEFAULTS: VoiceShape = {
  attack: 0,
  release: 0,
  cap: 4,
};

/** One pipette drop laid by a note-on. Compatible with `MelodyDrop` (`strength` = `size`). */
export interface VoiceDrop {
  x: number;
  y: number;
  along: number;
  pitch: number;
  size: number;
  strength: number;
  at: number;
  channel: number;
  tool: VoiceTool;
  liquid: string;
  area: number;
}

export interface VoiceSlot {
  active: boolean;
  channel: number;
  pitch: number;
  /** Normalised velocity, 0..1. */
  velocity: number;
  x: number;
  y: number;
  along: number;
  size: number;
  /** Timestamp (seconds) when the note-on arrived. */
  on: number;
  /** Timestamp (seconds) when released (by note-off or voice steal), or -1 while held. */
  off: number;
  attack: number;
  release: number;
  tool: VoiceTool;
  liquid: string;
  area: number;
}

export interface NoteSourceReading {
  velocity: number;
  pitch: number;
  held: number;
}

export interface NoteVoices {
  slots: VoiceSlot[];
  lastVelocity: Float32Array;
  lastPitch: Float32Array;
  lastChannel: number;
}

export const NOTE_FEATURES = ['velocity', 'pitch', 'held'] as const;
export type NoteFeature = typeof NOTE_FEATURES[number];

export const NOTE_FEATURE_LABELS: Record<NoteFeature, string> = {
  velocity: 'Note velocity',
  pitch: 'Note pitch',
  held: 'Note held (gate)',
};

const POOL_SIZE = 64;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0);

function makeSlot(): VoiceSlot {
  return {
    active: false,
    channel: 0,
    pitch: 60,
    velocity: 0,
    x: 0.5,
    y: 0.5,
    along: 0.5,
    size: 0,
    on: 0,
    off: -1,
    attack: 0,
    release: 0,
    tool: 'dropper',
    liquid: '',
    area: -1,
  };
}

/** Create a pre-allocated voice table for all 16 MIDI channels. */
export function makeNoteVoices(): NoteVoices {
  const slots: VoiceSlot[] = [];
  for (let i = 0; i < POOL_SIZE; i++) slots.push(makeSlot());
  return {
    slots,
    lastVelocity: new Float32Array(16),
    lastPitch: new Float32Array(16),
    lastChannel: -1,
  };
}

/** Envelope level (0..1) of a single voice slot at `now` seconds. */
export function slotPourAt(slot: VoiceSlot, now: number, attackOverride?: number, releaseOverride?: number): number {
  if (!slot.active || now < slot.on) return 0;
  const attack = Math.max(0, attackOverride ?? slot.attack);
  const release = Math.max(0, releaseOverride ?? slot.release);
  const amp = 0.2 + 0.8 * slot.velocity;
  if (slot.off < 0) {
    const up = attack > 0 ? clamp01((now - slot.on) / attack) : 1;
    return up * amp;
  }
  if (release <= 0) return 0;
  const elapsed = now - slot.off;
  if (elapsed >= release) return 0;
  const upAtOff = attack > 0 ? clamp01((slot.off - slot.on) / attack) : 1;
  return upAtOff * amp * clamp01(1 - elapsed / release);
}

function pruneFinished(v: NoteVoices, now: number): void {
  const slots = v.slots;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.active || s.off < 0) continue;
    if (s.release <= 0 ? now > s.off : now >= s.off + s.release) {
      s.active = false;
    }
  }
}

/**
 * Start a note voice on `channel` (0..15) at MIDI `pitch` (0..127) and
 * `velocity` (1..127) at clock `now` (seconds). Places its pipette drop through
 * `melodyPlace(pitch, line)` and, if the channel already holds `shape.cap`
 * notes, releases the oldest held note on that channel.
 */
export function voiceOn(
  v: NoteVoices,
  channel: number,
  pitch: number,
  velocity: number,
  now: number,
  shape: Partial<VoiceShape> = VOICE_DEFAULTS,
  line: MelodyLine = DEFAULT_MELODY_LINE,
): { drop: VoiceDrop; stole: { channel: number; pitch: number } | null } {
  const ch = channel & 15;
  const vel01 = clamp01(velocity / 127);
  const size = 0.2 + 0.8 * vel01;
  const attack = Math.max(0, shape.attack ?? VOICE_DEFAULTS.attack);
  const release = Math.max(0, shape.release ?? VOICE_DEFAULTS.release);
  const cap = Math.max(1, Math.round(shape.cap ?? VOICE_DEFAULTS.cap));

  pruneFinished(v, now);

  // If the same note on the same channel is still held, release the old one so
  // re-striking a key does not consume a second slot on the channel.
  const slots = v.slots;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.active && s.channel === ch && s.pitch === pitch && s.off < 0) {
      s.off = now;
    }
  }

  // Count held voices on this channel and find the oldest held one.
  let heldCount = 0;
  let oldest: VoiceSlot | null = null;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.active || s.channel !== ch || s.off >= 0) continue;
    heldCount++;
    if (!oldest || s.on < oldest.on) oldest = s;
  }

  let stole: { channel: number; pitch: number } | null = null;
  if (heldCount >= cap && oldest) {
    oldest.off = now;
    oldest.release = release;
    stole = { channel: ch, pitch: oldest.pitch };
  }

  // Pick an inactive slot, or the oldest released slot if the pool is full.
  let targetSlot: VoiceSlot | null = null;
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i].active) { targetSlot = slots[i]; break; }
  }
  if (!targetSlot) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.off >= 0 && (!targetSlot || s.off < targetSlot.off)) targetSlot = s;
    }
  }
  if (!targetSlot) {
    targetSlot = makeSlot();
    slots.push(targetSlot);
  }

  const { x, y, along } = melodyPlace(pitch, line);
  targetSlot.active = true;
  targetSlot.channel = ch;
  targetSlot.pitch = pitch;
  targetSlot.velocity = vel01;
  targetSlot.x = x;
  targetSlot.y = y;
  targetSlot.along = along;
  targetSlot.size = size;
  targetSlot.on = now;
  targetSlot.off = -1;
  targetSlot.attack = attack;
  targetSlot.release = release;
  targetSlot.tool = shape.tool ?? 'dropper';
  targetSlot.liquid = shape.liquid ?? '';
  targetSlot.area = shape.area ?? -1;

  v.lastVelocity[ch] = vel01;
  v.lastPitch[ch] = clamp01(pitch / 127);
  v.lastChannel = ch;

  return {
    drop: {
      x, y, along, pitch, size, strength: size, at: now, channel: ch,
      tool: targetSlot.tool, liquid: targetSlot.liquid, area: targetSlot.area,
    },
    stole,
  };
}

/** Clear all active voices and last-note readings (e.g. when a song render starts). */
export function resetNoteVoices(v: NoteVoices): void {
  for (let i = 0; i < v.slots.length; i++) v.slots[i].active = false;
  v.lastVelocity.fill(0);
  v.lastPitch.fill(0);
  v.lastChannel = -1;
}

/** Release any held voice on `channel` at `pitch` at clock `now` (seconds). Sets no drop. */
export function voiceOff(v: NoteVoices, channel: number, pitch: number, now: number): void {
  const ch = channel & 15;
  const slots = v.slots;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.active && s.channel === ch && s.pitch === pitch && s.off < 0) {
      s.off = now;
    }
  }
}

/**
 * Current pour envelope (0..1) for `(channel, pitch)` at `now` seconds.
 * Reads `shape.attack` and `shape.release` when given, falling back to the
 * shape the voice was struck with.
 */
export function voicePour(
  v: NoteVoices,
  channel: number,
  pitch: number,
  now: number,
  shape?: Partial<VoiceShape>,
): number {
  const ch = channel & 15;
  const slots = v.slots;
  let best = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.active || s.channel !== ch || s.pitch !== pitch) continue;
    const p = slotPourAt(s, now, shape?.attack, shape?.release);
    if (p > best) best = p;
    if (s.off >= 0 && p <= 0 && now > s.off) s.active = false;
  }
  return best;
}

/**
 * Patch-bay reading `{ velocity, pitch, held }` in 0..1 for `channel` (or across
 * all channels when `channel` is omitted).
 */
export function noteSource(v: NoteVoices, channel?: number): NoteSourceReading {
  const slots = v.slots;
  const byCh = channel !== undefined;
  const ch = (channel ?? 0) & 15;
  let newest: VoiceSlot | null = null;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.active || s.off >= 0) continue;
    if (byCh && s.channel !== ch) continue;
    if (!newest || s.on >= newest.on) newest = s;
  }
  if (newest) {
    return {
      velocity: newest.velocity,
      pitch: clamp01(newest.pitch / 127),
      held: 1,
    };
  }
  const fallbackCh = byCh ? ch : v.lastChannel;
  return {
    velocity: fallbackCh >= 0 ? v.lastVelocity[fallbackCh] : 0,
    pitch: fallbackCh >= 0 ? v.lastPitch[fallbackCh] : 0,
    held: 0,
  };
}

/** Zero-allocation single-feature reader for the frame loop's `PatchContext.notes`. */
export function readNoteFeature(v: NoteVoices, feature: string): number {
  const slots = v.slots;
  let newest: VoiceSlot | null = null;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.active || s.off >= 0) continue;
    if (!newest || s.on >= newest.on) newest = s;
  }
  if (feature === 'held') return newest ? 1 : 0;
  if (feature === 'velocity') {
    if (newest) return newest.velocity;
    return v.lastChannel >= 0 ? v.lastVelocity[v.lastChannel] : 0;
  }
  if (feature === 'pitch') {
    if (newest) return clamp01(newest.pitch / 127);
    return v.lastChannel >= 0 ? v.lastPitch[v.lastChannel] : 0;
  }
  return 0;
}
