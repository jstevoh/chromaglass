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
 * Five things, each 0..1:
 *
 *   - **kickHit**, **snareHit**, **hatsHit**: how hard that drum's last hit
 *     was, against its own hardest of late (the analyser's onset strength),
 *     falling away over a quarter of a second, half a beat at 120;
 *   - **anyHit**: the kick's or the snare's, whichever is up;
 *   - **pitch**: the note the analyser hears, low to high over five octaves
 *     (C1 to C6), glided between notes so a frame of a wrong octave is not
 *     heard, and let go to 0 when there is nothing to hear.
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

export const HIT_FEATURES = ['anyHit', 'kickHit', 'snareHit', 'hatsHit', 'pitch'] as const;
export type HitFeature = typeof HIT_FEATURES[number];

/** What each is called on a panel, the desk's and the phone's alike. */
export const HIT_FEATURE_LABELS: Record<HitFeature, string> = {
  anyHit: 'Any hit (kick or snare)',
  kickHit: 'Kick hit',
  snareHit: 'Snare hit',
  hatsHit: 'Hats hit',
  pitch: 'Pitch',
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
  private v: Record<HitFeature, number> = { anyHit: 0, kickHit: 0, snareHit: 0, hatsHit: 0, pitch: 0 };
  private hitAt: Record<'kick' | 'snare' | 'hats', number | null> = { kick: null, snare: null, hats: null };
  private pitchHeard = false;
  private last: number | null = null;

  /** Forget: a stop, a render starting, a new stream. */
  reset(): void {
    this.v = { anyHit: 0, kickHit: 0, snareHit: 0, hatsHit: 0, pitch: 0 };
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
  }

  /** One feature's value now, 0..1; 0 for a name it does not have. */
  value(feature: string): number {
    return (HIT_FEATURES as readonly string[]).includes(feature) ? this.v[feature as HitFeature] : 0;
  }
}
