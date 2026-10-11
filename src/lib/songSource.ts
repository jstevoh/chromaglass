/**
 * The song's shape, as something a patch can listen to (PLAN 28f, step 2).
 *
 * What was asked (the owner, 2026-10-11): now that the show hears the song,
 * use the patch bay so the looks answer it by default. And what was measured
 * the same morning says which part of the song to give them: the showreel's
 * films followed the music's loudness second by second (motion against level,
 * r 0.34–0.67), where the real shows filmed on 2026-09-26 do not (−0.13 to
 * 0.22) and follow its sections instead. A projectionist holds back through a
 * build, throws the big move on the drop and lets the dish rest through a
 * breakdown. The patch bay could only hear the second-by-second part: the
 * hook's loudness, the named drums and the eight bands. This is the rest.
 *
 * Six things, each 0..1:
 *
 *   - **intensity**: how loud and full the song has been for the last several
 *     bars (`SongShape`'s own, already slow: eight seconds' time constant);
 *   - **tension**: how far into a build, rising with it and let go over a
 *     couple of seconds once it has dropped, rather than gone on the frame;
 *   - **dropSwell**: the drop's swell, up over a third of a second when one is
 *     heard and back down over the next several (as big as the drop was:
 *     a drop out of a build is 1, the beat coming back after a breakdown less);
 *   - **inBreakdown**: whether the song is in one, eased in and out over two
 *     seconds, so a patch on it settles the dish rather than switching it;
 *   - **hitStrength**: how hard the last drum hit was (the kick or the snare, against
 *     their own hardest of late), falling away in a quarter of a second. The
 *     one moment-scale source here, on purpose: a patch that wants the
 *     accent rather than the level (a bead thrown harder on a harder hit)
 *     had nothing to read but the level, which is loud between hits too;
 *   - **pitch**: the note the analyser hears, low to high over five octaves
 *     (C1 to C6), held through the frames it hears no note and glided
 *     between notes, so a melody walks a control rather than a chord
 *     jittering it.
 *
 * ## Why the easing is here and not in the patch
 *
 * Because the patch bay is arithmetic on the frame it is handed: it sums,
 * scales and clamps, with no memory of the last frame (`sceneMap.ts`), and
 * should stay that way. A section is a state the song is in for bars, and
 * `SongShape` reports it as a word that changes on one frame; a patch that
 * read the word would jump its control a full depth in a sixtieth of a
 * second, twice a breakdown, which is the opposite of what a section source
 * is for. So each value is eased here, once, and every patch on it gets the
 * same seconds-long move.
 *
 * ## Whether it needs the song heard before
 *
 * No. `SongShape` hears a song live, the first time (its header says how and
 * what it misses: a drop within a bar, a build a third to two thirds of the
 * way in, a breakdown two or three bars late). Until a song has a beat, every
 * value here but intensity, hit strength and pitch is 0, which is "nothing to say".
 *
 * Pure: the shape's state, its events and the reading in, values out. The
 * render loop feeds it once a frame after the shape is heard, and the patch
 * bay reads it on the next (one frame late, a sixtieth of a second, which
 * nothing here is fine enough to show).
 */

import type { AudioReading } from './audioFeatures.ts';
import type { SongEvent, SongShapeState } from './songShape.ts';

export const SONG_FEATURES = ['intensity', 'tension', 'dropSwell', 'inBreakdown', 'hitStrength', 'pitch'] as const;
export type SongFeature = typeof SONG_FEATURES[number];

/** What each is called on a panel, the desk's and the phone's alike. */
export const SONG_FEATURE_LABELS: Record<SongFeature, string> = {
  intensity: 'Section intensity',
  tension: 'Build tension',
  dropSwell: 'Drop swell',
  inBreakdown: 'In a breakdown',
  hitStrength: 'Hit strength',
  pitch: 'Pitch',
};

/*
  The times, seconds.

  TENSION_RISE is half a second: a build is recognised part of the way in
  (a third to two thirds, `npm run shape`), and its tension arrives at
  what it has climbed to on that one frame: half its travel on the club
  song at 128 bpm. Followed at a fifth of a second that was 0.08 of the
  travel in a frame (`npm run songpatch`); at half a second it is under
  half that, and the climb after it, a tick at a time, is followed rather
  than stepped. TENSION_FALL is a bar at 120:
  the build's tension goes as the drop lands, and a patch on it lets go over
  the drop's first bar instead of snapping back on its first frame.

  DROP_RISE and DROP_FALL: a drop is the one moment in a song a light show
  answers at once, so it arrives in a third of a second (twenty frames, not
  one); it is then the next phrase's (four seconds' time constant: half way
  down after 2.8 s, a tenth left after nine). The desk says "drop" for four
  seconds after one (`songShapeLine`), and this is over half way down by then.

  BREAK_TAU: a breakdown is heard two or three bars after it starts, as a word
  on one frame. Two seconds settles a control into it over a bar or so.

  HIT_FALL: a quarter of a second, half a beat at 120, so one hit's value is
  mostly gone before the next.

  PITCH_GLIDE: 0.15 s, short enough that a melody's notes are each heard,
  long enough that a frame of a wrong octave is not.
*/
const TENSION_RISE = 0.5;
const TENSION_FALL = 2;
const DROP_RISE = 0.33;
const DROP_FALL = 4;
const BREAK_TAU = 2;
const HIT_FALL = 0.25;
const PITCH_GLIDE = 0.15;
/**
 * C1 and C6, as MIDI notes. C1 and not C2 because what the analyser hears as
 * the pitch of a band is mostly its bass line: on the showreel's song (a funk
 * track) 72% of frames were in the octave above C1, and a range from C2 read
 * every one of those as the bottom of its travel.
 */
const PITCH_LOW = 24;
const PITCH_HIGH = 84;
/** The drums a hit is read from. */
const HIT_FROM = ['kick', 'snare'] as const;

const ease = (v: number, to: number, dt: number, tau: number): number =>
  v + (to - v) * (1 - Math.exp(-dt / tau));
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0);

export class SongSource {
  private v: Record<SongFeature, number> = { intensity: 0, tension: 0, dropSwell: 0, inBreakdown: 0, hitStrength: 0, pitch: 0 };
  /** The drop's own envelope (as big as the drop, falling away), which `dropSwell` eases toward. */
  private swell = 0;
  private hitAt: Record<typeof HIT_FROM[number], number | null> = { kick: null, snare: null };
  private pitchHeard = false;
  private last: number | null = null;

  /** Forget the song: a stop, a render starting, a new stream. */
  reset(): void {
    this.v = { intensity: 0, tension: 0, dropSwell: 0, inBreakdown: 0, hitStrength: 0, pitch: 0 };
    this.swell = 0;
    this.hitAt = { kick: null, snare: null };
    this.pitchHeard = false;
    this.last = null;
  }

  /**
   * One frame, after `SongShape.update`: its state now, the events it heard on
   * this frame, the reading it heard them in (or null: nothing to hear), and
   * the same clock it was handed, in seconds.
   */
  update(shape: Readonly<SongShapeState>, events: readonly SongEvent[], reading: AudioReading | null, time: number): void {
    // A clock that jumped is a new stream, as it is to the shape itself.
    if (this.last !== null && (time < this.last - 0.5 || time > this.last + 5)) this.reset();
    const dt = this.last === null ? 0 : Math.min(0.25, Math.max(0, time - this.last));
    this.last = time;
    const v = this.v;

    v.intensity = clamp01(shape.intensity);
    const tension = shape.section === 'build' ? clamp01(shape.tension) : 0;
    v.tension = ease(v.tension, tension, dt, tension > v.tension ? TENSION_RISE : TENSION_FALL);

    for (const e of events) if (e.kind === 'drop') this.swell = Math.max(this.swell, clamp01(e.strength));
    v.dropSwell = ease(v.dropSwell, this.swell, dt, DROP_RISE);
    // The swell falls away from the frame the drop was heard; `drop` follows
    // `dropSwell` up over DROP_RISE and down with it.
    this.swell *= Math.exp(-dt / DROP_FALL);

    v.inBreakdown = ease(v.inBreakdown, shape.section === 'breakdown' ? 1 : 0, dt, BREAK_TAU);

    /*
      A hit is the onset's time moving, not its `hit` flag, and its strength
      is the one it was given when it landed (`last`), not this frame's: the
      loop is handed the newest reading once a frame, and a plate drawing at
      twenty frames a second never sees two readings in three, nor the hits
      on them (the same loss `songShape.ts` describes for the kick).
    */
    v.hitStrength *= Math.exp(-dt / HIT_FALL);
    if (reading?.onsets) {
      for (const name of HIT_FROM) {
        const o = reading.onsets[name];
        if (!o || o.at === null || o.at === this.hitAt[name]) continue;
        const first = this.hitAt[name] === null && o.at < time - HIT_FALL * 4;
        this.hitAt[name] = o.at;
        // An onset from long before this source began listening is history, not a hit.
        if (!first) v.hitStrength = Math.max(v.hitStrength, clamp01(o.last ?? o.strength));
      }
    }

    const midi = reading?.pitch ?? 0;
    if (midi > 0) {
      const to = clamp01((midi - PITCH_LOW) / (PITCH_HIGH - PITCH_LOW));
      v.pitch = this.pitchHeard ? ease(v.pitch, to, dt, PITCH_GLIDE) : to;
      this.pitchHeard = true;
    }
    if (!reading) {
      // Nothing to hear: the moment-scale values have nothing to hold.
      this.pitchHeard = false;
    }
  }

  /** One feature's value now, 0..1; 0 for a name it does not have. */
  value(feature: string): number {
    return (SONG_FEATURES as readonly string[]).includes(feature) ? this.v[feature as SongFeature] : 0;
  }
}
