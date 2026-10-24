/**
 * Where the show reads the song map: the place the follower hears when it is
 * sure, and the clock on from the last sure place when it is not.
 *
 * PLAN.md 28g-2. Before this the place in a song was a clock: the moment the
 * song was identified, plus the seconds since (`useMusicIntelligence`). That
 * is right for the recording the map was made from, played back, and wrong
 * for anything else: a band 15% slower than the record is a bar behind the
 * map's clock every seven bars, so by its last chorus the show has the
 * outro's look on, and a chorus played twice or a solo played long put the
 * clock a section out for the rest of the song. The follower
 * (`songFollow.ts`) hears where the band is, by its harmony.
 *
 * What this adds to the follower is what to do with its answer.
 *
 *   - Sure (confidence at FOLLOW_SURE or over): the place is the follower's,
 *     steered to rather than set to (see `hear`), and moving on between its
 *     hops at the tempo it heard, so the show reads a place that moves
 *     smoothly rather than in quarter-second steps. Measured on the check's
 *     takes 15% slower and faster: set to each answer, the place stepped by
 *     up to 0.27 and 1.29 bars between frames; steered, not at all on the
 *     slower and once on the faster, from 1.42 bars out to 0.03, where the
 *     intro's one held chord had left the follower behind.
 *   - Not sure (under FOLLOW_UNSURE, after having been sure, or never sure
 *     yet): the place is the clock again, but run on from the last place the
 *     follower was sure of, at the last tempo it was sure of. A jam the song
 *     never had is not the map anywhere; the best guess of where the song
 *     will be when the band comes back is where it was, moved on at the
 *     band's pace, not wherever the follower's weight happens to sit while it
 *     hears chords that are nowhere in the map. And the section the show
 *     reads from the map is none (`section` below): what the show has then
 *     is the song's shape as it is heard live (`songShape.ts`), whose builds,
 *     drops and breakdowns a sequence's scenes already take as cues
 *     (`songCueFrom`), and a sequence's stage that waits for the map's next
 *     section runs on its own clock instead (`useShowSequencer`, the "no song
 *     map" case).
 *   - A map made before the follower (no `chroma`, PLAN.md 28g-6): the clock,
 *     exactly as before this file existed, to the bit (`npm run songfollow`).
 *
 * What decides. The follower's confidence held over TRUST_SEC (rising over
 * half that), with two lines: sure at FOLLOW_SURE, unsure under
 * FOLLOW_UNSURE. Measured on the check's takes (`npm run songfollow`, which
 * prints the switches once settled): the follower's own confidence, hop by
 * hop, dips to 0.3 to 0.45 for a second at a time on a take it follows to
 * within a bar (the slower one on an organ, 6 dB down), and rises to 0.39
 * for a second in the jam; with one line at a third the jam made the place
 * sure for a hop and jump with it, and with lines at 0.5 and 0.4 the slower
 * take switched fifteen times. Held, no take switches once settled, and the
 * jam is unsure from about two and a half bars in. Each switch would be the map's section
 * coming and going, and a sequence's stage advancing or not.
 *
 * The identification's own place (a fingerprint's offset into the recording)
 * still counts: it is where the clock starts, and the follower is told it
 * (`anchor`, the same nudge the score gives, PLAN.md 28h), so a recording
 * played back is followed from its first bar, and what is heard corrects it
 * if it was wrong.
 *
 * Not a source for a look's sound patches: those read fast readings only
 * (the owner's rule, PLAN.md 28g). The followed place drives what the map
 * drives: the section, a song show's actions, a sequence's stages.
 */

import { SongFollower, FOLLOW_RATE, type FollowMap, type FollowState } from './songFollow.ts';

/** At or over this confidence (held over TRUST_SEC), the show reads the follower's place (see the header). */
export const FOLLOW_SURE = 0.5;
/** Under this, having been sure, it reads the clock on from the last sure place. */
export const FOLLOW_UNSURE = 0.35;
/** The follower's confidence is held over this long as it falls, and this long as it rises, before it decides (see the header). */
const TRUST_SEC = 1.5, TRUST_RISE_SEC = 0.75;
/** The tempo the place runs on at is the follower's, kept in its own range. */
const TEMPO_MIN = 0.6, TEMPO_MAX = 1.6;
/** A difference from the follower is closed over this long, by running a little faster or slower (see `hear`). */
const CATCH_SEC = 1;
/** And by at most this share of the tempo heard, faster or slower. */
const CATCH_MAX = 0.5;
/** Further than this from the follower's place (map seconds; a bar at 120 bpm)… */
const JUMP_SEC = 2;
/** …for this many hops in a row (a second), the place jumps there: the band skipped or repeated. */
const JUMP_HOPS = 4;

export interface Place {
  /** Where the show reads the map, in the map's seconds. */
  positionSec: number;
  /** True while the follower's place is the one read. */
  sure: boolean;
  /** The follower's confidence held over TRUST_SEC, 0..1, or null when the map cannot be followed (no harmony in it). */
  confidence: number | null;
  /** How fast the room plays against the map, as the follower last heard it (as the place last ran, when not sure). */
  tempo: number;
}

/** The map can be followed: it carries harmony (maps from before 28g-1 do not). */
export function canFollow(map: { chroma?: ArrayLike<number> | null; sections?: unknown[] } | null | undefined): map is FollowMap {
  return !!map && !!map.chroma && map.chroma.length >= 12 && Array.isArray(map.sections);
}

export class FollowedPlace {
  private readonly follower: SongFollower | null;
  /** The clock: `sec` at `at` (seconds on the caller's clock), moving at `rate`. */
  private base = { sec: 0, at: 0, rate: 1 };
  /** The tempo last heard while sure. */
  private tempo = 1;
  /** Hops in a row the follower's place has been further than JUMP_SEC from the clock's. */
  private far = 0;
  private sure = false;
  /** The follower's confidence held over TRUST_SEC: what decides, and what the desk and phone show. */
  private trust = 0;
  private state: FollowState | null = null;

  constructor(map: FollowMap | { chroma?: ArrayLike<number> | null; sections: { start: number; end: number; label: string }[] } | null) {
    this.follower = canFollow(map) ? new SongFollower(map) : null;
  }

  /** True when the map has harmony to follow. */
  get following(): boolean { return this.follower !== null; }
  /** The follower's hops so far (a quarter second of the room each): that it is hearing. */
  get hops(): number { return this.follower?.hops ?? 0; }

  /**
   * The song was identified (or nudged) at `offsetSec` into the map at `at`
   * (seconds on the caller's clock), and it is `now`: the clock starts
   * there, and the follower is told where that puts the song now.
   */
  resync(offsetSec: number, at: number, now = at): void {
    this.base = { sec: offsetSec, at, rate: this.tempo };
    this.far = 0;
    if (this.follower) {
      this.follower.anchor(this.clock(now));
      this.state = this.follower.now;
    }
  }

  /** One of the ear's readings, heard at `now` (every reading; the follower makes its own hops). */
  hear(reading: Parameters<SongFollower['update']>[0], now: number): void {
    if (!this.follower) return;
    const hops = this.follower.hops;
    const s = this.follower.update(reading);
    this.state = s;
    // Between hops the follower's answer repeats; act on a new one only.
    if (this.follower.hops === hops) return;
    const tau = s.confidence > this.trust ? TRUST_RISE_SEC : TRUST_SEC;
    this.trust += (1 - Math.exp(-1 / (FOLLOW_RATE * tau))) * (s.confidence - this.trust);
    const wasSure = this.sure;
    this.sure = s.position !== null && this.trust >= (this.sure ? FOLLOW_UNSURE : FOLLOW_SURE);
    const here = this.clock(now);
    if (!this.sure || s.position === null || s.confidence < FOLLOW_UNSURE) {
      // Run on from where the place had got to, at the last sure tempo: not
      // sure, or sure on the strength of the last second and a half while
      // this hop's answer is not (the band has just gone off the map, and the
      // follower's place is wherever the last chord that matched left it).
      this.base = { sec: here, at: now, rate: this.tempo };
      this.far = 0;
      return;
    }
    /*
      Sure: steer toward the follower's place, do not jump to it. The
      follower answers four times a second and each answer is a quarter
      second's evidence, so consecutive answers differ by a few hundredths of
      a bar either way, and at the end of a held chord by more: set to each
      answer, the place stepped by up to a bar and a quarter between frames
      on the takes that keep the record's form (`npm run songfollow` prints
      the largest step). So the place runs at the tempo heard plus what
      closes the difference in CATCH_SEC. Only a difference that lasts (the
      band skipped a verse, repeated a chorus, came back from a jam to a
      chorus the clock had not reached) is a jump, and the place jumps to it.
      At the start of a song a held chord (an intro on one chord, into a
      verse that opens on it) is the same everywhere it lasts, and the
      follower's guess slides through it for a bar or so before the next
      chord says where it is; that is not lasting, and the clock started by
      the identification is the better guess meanwhile.
    */
    this.tempo = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, s.tempo));
    const diff = s.position - here;
    this.far = Math.abs(diff) > JUMP_SEC ? this.far + 1 : 0;
    if (this.far >= JUMP_HOPS || (!wasSure && Math.abs(diff) > JUMP_SEC)) {
      this.base = { sec: s.position, at: now, rate: this.tempo };
      this.far = 0;
      return;
    }
    const catchUp = this.far ? 0 : Math.max(-CATCH_MAX * this.tempo, Math.min(CATCH_MAX * this.tempo, diff / CATCH_SEC));
    this.base = { sec: here, at: now, rate: this.tempo + catchUp };
  }

  private clock(now: number): number { return this.base.sec + (now - this.base.at) * this.base.rate; }

  /** Where the show reads the map at `now`. */
  at(now: number): Place {
    return {
      positionSec: this.clock(now),
      sure: this.sure,
      confidence: this.follower ? this.trust : null,
      tempo: this.tempo,
    };
  }
}

/**
 * The map's section the show reads at a place: the map's own, unless the map
 * is being followed and the place is not sure, when it is none, and the show
 * leans on the song's shape heard live (see the header).
 */
export function readSection<S extends { start: number; end: number }>(sections: S[] | null | undefined, place: Pick<Place, 'positionSec' | 'sure' | 'confidence'>): S | null {
  if (!sections || (place.confidence !== null && !place.sure)) return null;
  for (const s of sections) if (place.positionSec >= s.start && place.positionSec < s.end) return s;
  return null;
}

/**
 * The words the desk and the phone say about it, or null when there is no map
 * to follow. "Following the map: 82% sure" while the place is the follower's;
 * "Not sure where in the song (18%): following its sound" while it is not.
 * With the song's title, the phone's (which has no track panel above it to
 * say which song): "Following “Title”: 82% sure".
 */
export function followLine(place: Pick<Place, 'sure' | 'confidence'> | null, title?: string | null): string | null {
  if (!place || place.confidence === null) return null;
  const pct = Math.round(Math.max(0, Math.min(1, place.confidence)) * 100);
  const name = title ? `“${title}”` : null;
  return place.sure
    ? `Following ${name ?? 'the map'}: ${pct}% sure`
    : `Not sure where in ${name ?? 'the song'} (${pct}%): following its sound`;
}
