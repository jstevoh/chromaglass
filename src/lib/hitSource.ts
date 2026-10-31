/**
 * The hits and the note, as something a patch can listen to (PLAN 28f).
 *
 * What was asked (the owner, 2026-10-11): use the patch bay so the looks
 * answer the music more by default, and then, "only use things that we can
 * detect quickly and make changes that are appropriate for the music". The
 * song's sections are heard bars late (a breakdown two or three bars after it
 * starts, `npm run shape`), so they are not for the looks. What is heard at
 * once is the bands and their onsets, and the patch bay could hear the bands
 * (the `bands` source: each one's level against its own recent range) but not
 * the onsets: a level is loud between hits too, so a patch that wanted the
 * accent, a bead thrown harder on a harder kick, had nothing to read.
 *
 * Six things, each 0..1:
 *
 *   - **kickHit**, **snareHit**, **hatsHit**: how hard that drum's last hit
 *     was, against its own hardest of late (the analyser's onset strength),
 *     falling away over a quarter of a second, half a beat at 120;
 *   - **anyHit**: the kick's or the snare's, whichever is up;
 *   - **pitch**: the note the analyser hears, low to high over five octaves
 *     (C1 to C6), glided between notes so a frame of a wrong octave is not
 *     heard, and let go to 0 when there is nothing to hear;
 *   - **noteClass**: which of the twelve notes the lead is playing, C to B,
 *     whatever its octave (PLAN 25i). Not a level but a name, read below.
 *
 * ## Why a hit is read when its time moves, at the strength it was given
 *
 * The onset's `hit` flag and `strength` are on the one reading the hit landed
 * on, and the show's loop is handed the newest reading once a frame: a plate
 * drawing at twenty frames a second never sees two readings in three, nor the
 * hits on them (the same loss `songShape.ts` describes for the kick). The
 * onset's time stays on the last hit until the next, so seeing it move is
 * seeing a hit whichever frame it reaches, and `last` (audioFeatures.ts) is
 * the strength that hit had. `npm run soundpatch` counts the difference.
 *
 * ## Why the decay is here and not in the patch
 *
 * The patch bay is arithmetic on the frame it is handed, with no memory of
 * the last frame (`sceneMap.ts`), and should stay that way. A hit is a moment,
 * and a patch reading the moment alone would move its control for one frame;
 * so each hit is held and let fall here, once, and every patch on it gets the
 * same quarter-second shape. The liquid's own time (spreading, settling)
 * carries it from there.
 *
 * Pure: the reading in, values out. The render loop feeds it once a frame and
 * the patch bay reads it on the next (one frame late, a sixtieth of a second).
 */

import type { AudioReading } from './audioFeatures.ts';

export const HIT_FEATURES = ['anyHit', 'kickHit', 'snareHit', 'hatsHit', 'pitch', 'noteClass'] as const;
export type HitFeature = typeof HIT_FEATURES[number];

/*
  Which note the lead is on, as a cord can read it (PLAN 25i, "colour that
  answers the music"). The colour organ's idea, Castel's and Rimington's and
  behind Wilfred's Lumia: each of the twelve notes has its colour, so a
  melody is heard as a run of colours. A cord on it picks one of an area's
  bottles by the note (AreaHands.picked), and the music's colour is the
  bottle the note chose, not a hue dial turned.

  A name, not a level, and read as one everywhere a level would be shaped:
  no gate (a gate opens on a level crossing a line; C is not louder than B),
  no Sound Impact (a master turns a level down; a note turned down is
  another note), nothing for a MIDI fader or Sound Learn to follow
  (lib/midi.ts MAPPABLE_SOURCES leaves it out).

  Read off `pitchFine`, the melody's own pitch between the bins and above a
  kick's body (lib/pitchFine.ts, PLAN 24.3-place), and not `pitch`, which is
  mostly the bass line's bin (the showreel's song: 72% of frames in the
  octave above C1). A pitch class is the one reading an octave error cannot
  move, which is the error a pitch tracker makes most. A new note is taken
  once it has held for the ear's settle (`pitchSettleS`, eight readings),
  so a frame of a neighbour on a note's attack does not pick a bottle; and
  with no lead heard the last note is kept, as the bottle stays in the hand
  until the next note asks for another. The value is the class's middle,
  (k + ½)/12, so a cord cutting it into an area's bottles never lands on an
  edge between two.
*/
const CLASS_FEATURES: ReadonlySet<string> = new Set(['noteClass']);
/** A reading that names (which note) rather than measures (how much): no gate, no master. */
export const isClassFeature = (f: unknown): boolean => typeof f === 'string' && CLASS_FEATURES.has(f);
/** The settle a new note must hold for when the ear does not say its own: eight readings at 60 a second. */
const NOTE_SETTLE_S = 0.13;

/** What each is called on a panel, the desk's and the phone's alike. */
export const HIT_FEATURE_LABELS: Record<HitFeature, string> = {
  anyHit: 'Any hit (kick or snare)',
  kickHit: 'Kick hit',
  snareHit: 'Snare hit',
  hatsHit: 'Hats hit',
  pitch: 'Pitch',
  noteClass: 'Note (C to B)',
};

/** A quarter of a second, half a beat at 120: one hit is mostly gone before the next. */
const HIT_FALL = 0.25;
/** 0.15 s: short enough that a melody's notes are each heard, long enough that a frame of a wrong octave is not. */
const PITCH_GLIDE = 0.15;
/**
 * C1 and C6, as MIDI notes. C1 and not C2 because what the analyser hears as
 * the pitch of a band is mostly its bass line: on the showreel's song (a funk
 * track) 72% of frames were in the octave above C1, and a range from C2 read
 * every one of those as the bottom of its travel.
 */
const PITCH_LOW = 24;
const PITCH_HIGH = 84;
const DRUMS = [['kick', 'kickHit'], ['snare', 'snareHit'], ['hats', 'hatsHit']] as const;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0);

export class HitSource {
  private v: Record<HitFeature, number> = { anyHit: 0, kickHit: 0, snareHit: 0, hatsHit: 0, pitch: 0, noteClass: 0 };
  /** The note being listened to before it is taken (a class 0..11), and for how long, in seconds. */
  private noteHeard: { k: number; held: number } | null = null;
  private hitAt: Record<'kick' | 'snare' | 'hats', number | null> = { kick: null, snare: null, hats: null };
  private pitchHeard = false;
  private last: number | null = null;

  /** Forget: a stop, a render starting, a new stream. */
  reset(): void {
    this.v = { anyHit: 0, kickHit: 0, snareHit: 0, hatsHit: 0, pitch: 0, noteClass: 0 };
    this.noteHeard = null;
    this.hitAt = { kick: null, snare: null, hats: null };
    this.pitchHeard = false;
    this.last = null;
  }

  /** One frame: the analyser's reading (or null: nothing to hear), and its clock in seconds. */
  update(reading: AudioReading | null, time: number): void {
    // A clock that jumped is a new stream: a hit timed on the old one is not a hit on this one.
    if (this.last !== null && (time < this.last - 0.5 || time > this.last + 5)) this.reset();
    const dt = this.last === null ? 0 : Math.min(0.25, Math.max(0, time - this.last));
    this.last = time;
    const v = this.v;
    const fall = Math.exp(-dt / HIT_FALL);
    for (const [, key] of DRUMS) v[key] *= fall;
    if (reading?.onsets) {
      for (const [name, key] of DRUMS) {
        const o = reading.onsets[name];
        if (!o || o.at === null || o.at === this.hitAt[name]) continue;
        // An onset from long before this source began listening is history, not a hit.
        const stale = this.hitAt[name] === null && o.at < time - HIT_FALL * 4;
        this.hitAt[name] = o.at;
        if (!stale) v[key] = Math.max(v[key], clamp01(o.last ?? o.strength));
      }
    }
    v.anyHit = Math.max(v.kickHit, v.snareHit);

    const midi = reading?.pitch ?? 0;
    if (reading && midi > 0) {
      const to = clamp01((midi - PITCH_LOW) / (PITCH_HIGH - PITCH_LOW));
      v.pitch = this.pitchHeard ? v.pitch + (to - v.pitch) * (1 - Math.exp(-dt / PITCH_GLIDE)) : to;
      this.pitchHeard = true;
    } else if (!reading) {
      // Nothing to hear: no note to hold, so a patch on it lets go rather
      // than pushing its control for as long as the show runs silent.
      this.pitchHeard = false;
      v.pitch *= Math.exp(-dt / PITCH_GLIDE);
    }

    const fine = reading?.pitchFine ?? 0;
    if (reading && fine > 0) {
      const k = ((Math.round(fine) % 12) + 12) % 12;
      const settle = Math.min(0.25, Math.max(0.03, reading.pitchSettleS ?? NOTE_SETTLE_S));
      if (this.noteHeard?.k === k) this.noteHeard.held += dt;
      else this.noteHeard = { k, held: 0 };
      if (this.noteHeard.held >= settle - 1e-9) v.noteClass = (k + 0.5) / 12;
    } else {
      // A rest, or a reading with no lead in it: the last note stays taken, and the next starts afresh.
      this.noteHeard = null;
    }
  }

  /** One feature's value now, 0..1; 0 for a name it does not have. */
  value(feature: string): number {
    return (HIT_FEATURES as readonly string[]).includes(feature) ? this.v[feature as HitFeature] : 0;
  }
}
