/**
 * Where one song ends and the next begins, heard rather than known.
 *
 * Track identification tells the show what is playing only when the
 * fingerprint service is reachable and the song is in it. The boundary
 * between songs is audible regardless: a run of music long enough to be a
 * song, then a gap of quiet longer than any rest inside one, then sound
 * again. The gap is the signal — most players leave two to four seconds
 * between tracks, a crossfade leaves none, and a crossfaded set is one
 * continuous piece as far as the room can tell.
 */

/**
 * Is the room quiet right now?
 *
 * Lives here rather than in the hook so that the rule the boundary is timed
 * against is the same rule `scripts/music.mjs` measures. The two drifting
 * apart is how the gap detector came to need a five-second gap while claiming
 * to need two and a half.
 *
 * `calibration.sound` is the unsmoothed verdict. `calibration.signal` is the
 * same thing held open for a second and a half so the light show does not
 * strobe between beats, and it is the wrong one to time a gap against: its
 * release alone outlasts the gap between most tracks. The boundary does its
 * own holding, over its own window, which is the whole job of it.
 */
export function roomIsQuiet(
  calibration: { sound: boolean } | null,
  energy: number,
  runningPeak: number,
): boolean {
  if (calibration) return !calibration.sound;
  // No calibration: a gap is the energy falling well below what the music has
  // been running at.
  return energy < Math.max(0.012, runningPeak * 0.2);
}

export interface SongBoundaryOptions {
  /** Music must have run this long before a gap can end it (ms). */
  minSongMs: number;
  /** Quiet must last this long to count as the end (ms). */
  minGapMs: number;
}

/**
 * Two and a half seconds was the old gap, and between the gate's own release
 * and that, nothing shorter than five and a half seconds of silence could ever
 * end a song — longer than the gap between almost any two tracks, which is why
 * the look so rarely changed. `npm run music` measures it: at 1.8 s a CD's two
 * seconds, a playlist's three and a long gap are all caught the instant the
 * next song starts, while a crossfade and a rest inside a song are not.
 *
 * It does not go lower. A gapless service leaves a second or none at all, and
 * chasing that would start calling four-beat breakdowns the end of the song;
 * a set with no gaps is for identification to notice, not for listening.
 */
export const DEFAULT_BOUNDARY: SongBoundaryOptions = { minSongMs: 20_000, minGapMs: 1_800 };

export class SongBoundary {
  private playingSince: number | null = null;
  private quietSince: number | null = null;
  private armed = false;       // a song has been running long enough to end
  private ended = false;       // the gap has been heard; the next sound is a new song
  private readonly opt: SongBoundaryOptions;

  constructor(opt: Partial<SongBoundaryOptions> = {}) {
    this.opt = { ...DEFAULT_BOUNDARY, ...opt };
  }

  /** Feed one reading. Returns true on the first sound of a new song. */
  update(quiet: boolean, now: number): boolean {
    if (quiet) {
      if (this.quietSince === null) this.quietSince = now;
      if (this.armed && now - this.quietSince >= this.opt.minGapMs) {
        this.ended = true;
        this.armed = false;
      }
      return false;
    }
    // Sound.
    this.quietSince = null;
    let fired = false;
    if (this.ended) {
      this.ended = false;
      this.playingSince = now;
      fired = true;
    } else if (this.playingSince === null) {
      this.playingSince = now;
    }
    if (!this.armed && this.playingSince !== null && now - this.playingSince >= this.opt.minSongMs) this.armed = true;
    return fired;
  }

  /** Forget everything — the input stopped, or the show was reset. */
  reset(): void {
    this.playingSince = null;
    this.quietSince = null;
    this.armed = false;
    this.ended = false;
  }
}
