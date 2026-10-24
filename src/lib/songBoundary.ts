/**
 * Where one song ends and the next begins, heard rather than known.
 *
 * PLAN.md 14z. The owner found, on 2026-10-24, that the show did not catch
 * where songs start and end. Measured since on recordings of real songs
 * (`npm run songends`: twenty-three CC-BY tracks across funk, rock, pop, hip hop,
 * folk, bossa, piano and electronic music, joined the ways players join them),
 * the old rule (1.8 s of quiet after 20 s of song, timed against the room
 * gate) caught most gaps between tracks and none of the crossfades. This file
 * is the half of the answer that listening can give: the end of a song as a
 * fall into quiet, and the start of the next as sound that carries on. The
 * other half, a crossfade or a gapless set where the music never falls away,
 * is song identification's (`useSongChange` asks it, and `npm run songends`
 * measures the local matcher on the same transitions): measured, no summary of
 * the sound (the harmony, the spectrum's shape, the level, the hits) moved
 * further between two songs than it moves between a verse and a chorus of one,
 * so a detector built on them would change the look inside songs.
 *
 * What counts as quiet, and why each part is there:
 *
 * - **Far under the song's own loud level.** `DIP_DB` under the 80th
 *   percentile of the last `LOUD_SEC` seconds' levels (one a second, sound
 *   only). Forty, not twenty: a song that fades out over twenty-five seconds
 *   (one in the corpus does) drags a twenty-second reference down with it, and
 *   its end never reads as 40 dB under anything.
 *   A song's file ends in its own decay to silence, so even a gapless player
 *   leaves a dip of 34 dB or more at nineteen of twenty-two joins, where the
 *   deepest dip inside any of the songs was 37 dB. This is what catches a
 *   half-second gap, which the old rule never could.
 * - **Down at the room's floor, for a while.** A microphone in a room never
 *   hears a gap 40 dB deep: the room's own noise sits about 30 dB under the
 *   music. So a level within `ROOM_DB` of the quietest the room has been also
 *   counts, once it has stayed there `FLOOR_SEC`: a soft passage in a noisy
 *   room touches the floor for a moment (measured: thirteen false changes
 *   over six hours when a moment counted, none at a second), a gap sits on it.
 *   The floor goes down at once and up only while the level sits on it, so a
 *   song never drags it up.
 * - **Digital silence**: the analyser parks it at -140 dB, quiet but not a
 *   room, so it never sets the floor.
 *
 * And the return. Sound after the gap is a new song only if it carries on for
 * `CONFIRM_SEC`: two hits or more with sound on most of the frames, or sound
 * on nearly all of them (a slow piano's first chord has one onset). A song
 * that ends on a stop and a last chord rings once and falls back into the gap,
 * and without this the look changed on the chord, four seconds before the next
 * song, three times in the corpus. The wait is the price: a change comes 0.8 s
 * into the new song at the median, and then lands on its next beat.
 */

/** A dip this far under the song's loud level is the song's end (dB). */
export const DIP_DB = 40;
/** The song's loud level is read over this long (s). */
export const LOUD_SEC = 40;
/** The level must stay under that for this long (s): the loudest frame of the window decides. */
export const DIP_SEC = 0.3;
/** Within this much of the room's floor counts as quiet... (dB) */
export const ROOM_DB = 6;
/** ...once it has stayed there this long (s). */
export const FLOOR_SEC = 1;
/** Sound must have run this long before a gap can end it (s). */
export const MIN_SONG_SEC = 20;
/** How long the returning sound must carry on before it is a new song (s). */
export const CONFIRM_SEC = 0.75;
/** After a change, no other for this long (s). */
export const LOCK_SEC = 10;
/** Waiting for a beat to land the change on, at most this long (s). */
export const BEAT_WAIT_SEC = 1;
/** Readings that stop this long mean the ear restarted (s). */
export const RESTART_SEC = 0.5;
/** A level that falls this far in one reading means the ear restarted (dB). */
export const RESTART_DB = 60;
/** The floor rises toward the quietest second of this many (s)... */
export const FLOOR_LOOK_SEC = 60;
/** ...no closer than this under the music's loud level (dB)... */
export const FLOOR_UNDER_LOUD_DB = 30;
/** ...at this rate (dB/s). */
export const FLOOR_RISE_DB_S = 1;
/** The ear's first readings after a start teach the floor nothing (s). */
export const WARM_SEC = 2;
/** The analyser's digital silence (dB). */
const SILENCE_DB = -130;

/** One reading of the ear, as much of it as the boundary needs. */
export interface BoundaryReading {
  /** Seconds, on the ear's clock. */
  time: number;
  /** The analyser's overall level in dB (`AudioReading.db[0]`). */
  levelDb: number;
  /** A hit landed on this reading (a kick or a level onset). */
  hit: boolean;
}

export interface SongStart {
  /** When the new song's sound came back (s): where its first note was. */
  startedAt: number;
  /** When it was confirmed and landed (s), on a hit when one came in time. */
  at: number;
  /** It landed on a hit rather than at the end of the wait. */
  onBeat: boolean;
}

export class SongBoundary {
  private secs: number[] = [];                 // one level a second, sound only
  private sec: { t0: number; sum: number; n: number } | null = null;
  private recent: { t: number; db: number }[] = [];
  private floor = Infinity;
  private floorSince: number | null = null;
  private mins: number[] = [];                 // each second's quietest reading
  private minSec: { t0: number; min: number } | null = null;
  private lastDb = -Infinity;
  private since = 0;
  private at: number | null = null;
  private songSince: number | null = null;
  private dipped = false;
  private pending: { t0: number; n: number; quiet: number; hits: number } | null = null;
  private landing: { startedAt: number; until: number } | null = null;
  private lastChange = -Infinity;

  /** Feed one reading. Returns the new song's start on the reading it lands on. */
  update(r: BoundaryReading): SongStart | null {
    const t = r.time, db = r.levelDb;
    /*
      A restart of the ear is not a gap. Readings that stop for half a second
      (a recalibrate, a new stream, a hidden window's stall) or a level that
      falls 60 dB in one reading (a fresh analyser's first readings sit near
      -200, where a real gap falls under a decibel a reading) start the song
      over instead: before this, one such reading after twenty seconds of song
      counted as the gap, and the music coming back changed the look.
    */
    if (this.at !== null && (t - this.at > RESTART_SEC || this.lastDb - db > RESTART_DB)) this.reset();
    this.lastDb = db;
    const dt = this.at === null ? 0 : Math.max(0, t - this.at);
    if (this.at === null) this.since = t;
    this.at = t;
    /*
      Nor are the ear's first readings a room. A fresh analyser's reference
      starts at the bottom and its level climbs through the room's for the
      first second or so: measured at 60 readings a second, the floor learned
      -91 dB in a room at -84, every gap then sat 7 dB over it, and a noisy
      room's gaps went from 8 of 8 heard to 1.
    */
    if (db > SILENCE_DB && t - this.since >= WARM_SEC) {
      if (db < this.floor) this.floor = db;
      else if (db < this.floor + ROOM_DB) this.floor += dt * 0.2;
      if (!this.minSec || t - this.minSec.t0 >= 1) {
        if (this.minSec) { this.mins.push(this.minSec.min); if (this.mins.length > FLOOR_LOOK_SEC) this.mins.shift(); }
        this.minSec = { t0: t, min: db };
      } else if (db < this.minSec.min) this.minSec.min = db;
    }
    this.recent.push({ t, db });
    while (this.recent.length && this.recent[0].t < t - DIP_SEC) this.recent.shift();
    let top = -Infinity;
    for (const x of this.recent) if (x.db > top) top = x.db;
    const loud = this.loud();
    /*
      And a room that gets louder (a venue filling up) lifts the floor too: it
      would otherwise stay where the empty room put it, the level never near it
      again, and gaps would read only 30 dB under the music. So the floor rises
      toward the quietest second of the last minute, never closer than
      `FLOOR_UNDER_LOUD_DB` under the music's loud level: a song's quietest
      second is a soft passage, and the floor must not climb into the song.
    */
    if (this.mins.length >= 10 && loud !== null) {
      let quietest = Infinity;
      for (const m of this.mins) if (m < quietest) quietest = m;
      const ceiling = Math.min(quietest, loud - FLOOR_UNDER_LOUD_DB);
      if (this.floor < ceiling) this.floor = Math.min(ceiling, this.floor + dt * FLOOR_RISE_DB_S);
    }
    const atFloor = top < this.floor + ROOM_DB;
    if (atFloor) { if (this.floorSince === null) this.floorSince = t; } else this.floorSince = null;
    const quiet = top <= SILENCE_DB
      || (atFloor && t - (this.floorSince ?? t) >= FLOOR_SEC)
      || (loud !== null && top < loud - DIP_DB);

    if (!this.sec || t - this.sec.t0 >= 1) {
      if (this.sec && this.sec.n) { this.secs.push(this.sec.sum / this.sec.n); if (this.secs.length > LOUD_SEC) this.secs.shift(); }
      this.sec = { t0: t, sum: 0, n: 0 };
    }
    if (!quiet) { this.sec.sum += db; this.sec.n++; }

    // A confirmed start waits a moment for a hit to land on.
    if (this.landing) {
      if (r.hit || t >= this.landing.until) {
        const start: SongStart = { startedAt: this.landing.startedAt, at: t, onBeat: r.hit };
        this.landing = null;
        return start;
      }
    }

    if (this.pending) {
      const p = this.pending;
      p.n++; if (quiet) p.quiet++; if (r.hit) p.hits++;
      if (t - p.t0 >= CONFIRM_SEC) {
        this.pending = null;
        const sounding = 1 - p.quiet / p.n;
        if ((p.hits >= 2 && sounding >= 0.7) || sounding >= 0.97) {
          this.songSince = p.t0;
          this.dipped = false;
          if (t - this.lastChange >= LOCK_SEC) {
            this.lastChange = t;
            this.landing = { startedAt: p.t0, until: t + BEAT_WAIT_SEC };
            if (r.hit) { this.landing = null; return { startedAt: p.t0, at: t, onBeat: true }; }
          }
        } else {
          this.dipped = true;   // it fell back: still the gap
        }
      }
    }
    if (quiet) {
      if (this.songSince !== null && t - this.songSince >= MIN_SONG_SEC) this.dipped = true;
      return null;
    }
    if (this.songSince === null) this.songSince = t;
    if (this.dipped && !this.pending) {
      this.dipped = false;
      this.pending = { t0: t, n: 0, quiet: 0, hits: r.hit ? 1 : 0 };
    }
    return null;
  }

  /** Is a song playing long enough that a change would be a new song? */
  get inSong(): boolean {
    return this.songSince !== null && this.at !== null && this.at - this.songSince >= MIN_SONG_SEC;
  }

  /** Forget everything: the input stopped, or the show was reset. */
  reset(): void {
    this.secs = []; this.sec = null; this.recent = [];
    this.floor = Infinity; this.floorSince = null; this.at = null;
    this.mins = []; this.minSec = null; this.lastDb = -Infinity;
    this.songSince = null; this.dipped = false; this.pending = null; this.landing = null;
    this.lastChange = -Infinity;
  }

  private loud(): number | null {
    if (this.secs.length < 5) return null;
    const s = [...this.secs].sort((a, b) => a - b);
    return s[Math.floor(s.length * 0.8)];
  }
}

/** One change per song start, whichever way it was heard first (s). */
export const ONE_PER_START_SEC = 10;
/** A song named this soon after a gap changed the look is the song the gap announced (s). */
export const NAMED_AFTER_GAP_SEC = 30;

/**
 * The two ways a song start is heard, made one change.
 *
 * A gap is heard about a second into the new song; identification names the
 * same song on its own schedule, 6 to 17 s in by `npm run songends`, and after
 * a half-second gap the matcher is not hurried (it waits for 1.6 s of quiet).
 * Timed only from the first change, the name came more than ten seconds after
 * the gap's change and changed the look a second time for the same song. So a
 * name that arrives within `NAMED_AFTER_GAP_SEC` of a gap's change is that
 * song's, and changes nothing.
 */
export class SongChangeGate {
  private last = -Infinity;
  private lastGap = -Infinity;

  /** A gap was heard at `t` (s): does it change the look? */
  gap(t: number): boolean {
    if (t - this.last < ONE_PER_START_SEC) return false;
    this.last = t; this.lastGap = t;
    return true;
  }

  /** Identification named a different song at `t` (s): does it change the look? */
  track(t: number): boolean {
    if (t - this.last < ONE_PER_START_SEC || t - this.lastGap < NAMED_AFTER_GAP_SEC) return false;
    this.last = t;
    return true;
  }

  reset(): void { this.last = -Infinity; this.lastGap = -Infinity; }
}
