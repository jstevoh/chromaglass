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

export interface SongBoundaryOptions {
  /** Music must have run this long before a gap can end it (ms). */
  minSongMs: number;
  /** Quiet must last this long to count as the end (ms). */
  minGapMs: number;
}

export const DEFAULT_BOUNDARY: SongBoundaryOptions = { minSongMs: 20_000, minGapMs: 2_500 };

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
