/**
 * The song's shape, heard live: builds, drops and breakdowns (PLAN §10, step 2).
 *
 * A liquid light show is not played on the kick. The footage measured on
 * 2026-09-26 (/mnt/project-files/research/light-show/footage.md) moves with the
 * music at 0.4 over twenty-second windows and not at all at the beat: the
 * projectionist hears the song's *sections*, holds back through a build and
 * throws the big move on the drop. Everything the show heard until now was at
 * the beat's scale (the bands and onsets of `audioFeatures.ts`, the beat
 * clock) or came from a song map, which needs the song identified and heard
 * once before (`songMap.ts`). This is the section scale, live, on a song
 * nobody has heard before.
 *
 * What it reports, once a frame:
 *
 *   - **events**: a *build* (the song winding up: a riser, a snare roll, the
 *     top end climbing for seconds on end), a *drop* (the low end coming back
 *     in after two bars or more without it, harder after a build), a
 *     *breakdown* (the low end gone for two bars or more while the music plays
 *     on, and nothing winding up);
 *   - **section**: which of those the song is in now, or steady, or quiet;
 *   - **intensity**, 0..1: how loud and how full the song has been over the
 *     last several seconds, accumulating slowly and falling slowly, so a
 *     breakdown lowers it over bars and not at the first missing kick;
 *   - **action**, -1..1: whether the song is rising or falling right now, the
 *     slope of its top end.
 *
 * ## Why the low end, and why decibels
 *
 * Every one of the three events is about the kick and the sub-bass, the
 * thing a dance floor moves to: a breakdown takes it away, a build usually
 * does too, a drop brings it back. So the tracker watches the kick's region
 * (30–120 Hz), in decibels as the analyser gives them (`AudioReading.db`), not
 * the 0..1 values beside them: those are fitted to each source's last twelve
 * seconds, and a breakdown that lasts sixteen reads, by its end, as loud as the
 * drop did. The references here are its own and span a song.
 *
 * The bass region (30–250 Hz) was the first choice and the wrong one: a snare
 * roll's 200 Hz body filled it through every build, so a build read as the
 * bass still playing (measured on `npm run shape`'s club song: the bass
 * region 17 dB under the verse through the build, the kick region 36 under).
 *
 * ## Why a build is a *slope in both halves*
 *
 * A build is a ramp: the top of the spectrum (1.7–16 kHz, where a riser sweeps
 * and a roll's crack lives) climbing for bars on end. A verse coming in is a
 * step, and a least-squares slope over a window with a step in it is as steep
 * as a ramp's. So the window is cut in two, and each half must climb on its
 * own: a ramp does, a step climbs in one half and is flat in the other.
 *
 * ## What it does not know
 *
 * Nothing about bars: an event is reported when it is heard, and the harness
 * measures how late that is in bars of the song. A drop is almost always on a
 * downbeat, so a consumer that wants the moment on the one can wait for the
 * beat clock's next beat; this file does not assume there is a clock.
 *
 * Pure: readings in, state out, no DOM, no clock of its own, no randomness.
 * The render loop feeds it the live reading; `npm run shape` feeds it
 * synthesised songs whose sections are known to the sample, and a render feeds
 * it the song's own readings, so a film of a song hears the same drops the
 * show would have.
 */

import type { AudioReading } from './audioFeatures.ts';

export type SongEventKind = 'build' | 'drop' | 'breakdown';
export const SONG_EVENTS: readonly SongEventKind[] = ['build', 'drop', 'breakdown'];

export interface SongEvent {
  kind: SongEventKind;
  /** When it was heard: the reading's own time, seconds. */
  at: number;
  /**
   * How big, 0..1. A drop after a build is 1; a drop out of a breakdown or the
   * beat coming in for the first time is scaled by how far the low end rose.
   * A build or a breakdown reports how far it had got when it was recognised.
   */
  strength: number;
}

export type SongSection = 'quiet' | 'steady' | 'build' | 'breakdown';

export interface SongShapeState {
  section: SongSection;
  /** 0..1, slow: how loud and full the song has been lately. */
  intensity: number;
  /** -1..1: the top end's slope now, rising or falling. */
  action: number;
  /** 0..1 through a build (how far its top end has climbed, against a typical build's 20 dB); 0 outside one. */
  tension: number;
  /** When the last drop was heard, seconds, or null. */
  lastDrop: number | null;
  /** The time of the frame this state is from, on the same clock. */
  time: number;
}

/**
 * The song's shape in a word or two, for a status line: "drop" for a few
 * seconds after one, "build 40 %" through a build, "breakdown", and nothing
 * while the song is simply playing (or nothing is), because a status line
 * that always says "steady" is one nobody reads.
 */
export function songShapeLine(s: SongShapeState): string {
  if (s.lastDrop !== null && s.time - s.lastDrop >= 0 && s.time - s.lastDrop < 4) return 'drop';
  if (s.section === 'build') return `build ${Math.round(s.tension * 100)}%`;
  if (s.section === 'breakdown') return 'breakdown';
  return '';
}

/*
  The numbers, and where each comes from (`npm run shape` prints what each
  one measured).

  TAU: the three levels are power averages over about half a second. Shorter
  and a kick-and-gap at 90 bpm ripples the low end by 10 dB between beats;
  longer and a drop takes more than a beat to register. In the power domain a
  loud arrival dominates at once (one kick lifts the average by 20 dB in a
  frame or two), so the average is slow to fall and quick to rise, which is
  the right way round for a drop.

  TOP_BOX: the top end is a plain power mean over the last second and a half,
  because it is only ever read as a slope, and hats every eighth swing it by
  8 dB from one half-second to the next. A box and not an exponential
  average, because an exponential one approaches a new level from below for
  several of its time constants after the music starts or the beat comes in,
  and a slow approach from below is a climb: the rock song with nothing but
  its verse read as a build seven seconds in. A box has caught up in its own
  length.

  HISTORY: sixteen seconds at ten samples a second, the longest window read.
*/
const TAU = 0.5;
const TOP_BOX_S = 1.5;
const HZ = 10;
const HISTORY_S = 16;

/*
  The drop.

  The low end now must stand DROP_RISE_DB over the loudest it was between
  DROP_PAST[0] and DROP_PAST[1] seconds ago, and within DROP_NEAR_REF_DB of
  the song's own low end. Five seconds back is two bars at 96 bpm and more
  at anything faster, so a fill that drops the kick for a beat (always inside
  that window, with kicks either side of it) is never a drop; 1.5 s is where
  the window ends, so a low end that came back a moment ago is not counted as
  its own past. Twelve decibels: the club song's build left the kick region
  29 dB under the drop and its breakdown 60, while the loudest a bar of the
  groove swings is about 5.

  Near the reference, because a drop arrives at full force: a bass note
  swelling in an ambient track climbs a long way out of nothing and stays far
  under what the song's beat was.

  DROP_GAP: one drop per this many seconds. A drop is a moment; the bars
  after it are the drop, not more of them.
*/
const DROP_RISE_DB = 12;
/*
  And the low end has to stand over the rest of the mix: at least LOW_OVER_DB
  over the whole spectrum's mean power per bin. Music with a beat is weighted
  to the bottom (the club song's verse: the kick region 22 dB over the mix);
  a pad fading in is not (7 dB under), and without this the pad's own low
  partials swelling out of nothing read as the beat arriving, four seconds
  into the 90 bpm club song's intro.
*/
const LOW_OVER_DB = 6;
/*
  A build that keeps its kick has no low end to bring back, and still has a
  drop: the riser is cut and the bass comes in under the kick. So inside a
  build there is a second way in: the top end (read fast, over a third of a
  second) fallen CUT_DB from the highest it reached in the build, with the low
  end CUT_LOW_DB over its own last four seconds. Measured on the club song
  whose build keeps the kick: at the drop the low end rose 3–4 dB and the top
  end fell from its peak by 4 within a beat.
*/
const CUT_DB = 4;
const CUT_LOW_DB = 2.5;
const TOP_FAST_TAU = 0.3;
const DROP_PAST: readonly [number, number] = [5, 1.5];
const DROP_NEAR_REF_DB = 8;
const DROP_GAP_S = 6;
/** A drop's strength when no build led to it: the rise over this many dB is 1. */
const DROP_FULL_RISE_DB = 36;

/*
  The breakdown: the low end ABSENT_DB under the song's own for BREAK_S
  seconds while the music plays on (the whole mix within SOUNDING_DB of its
  reference), and the top end not climbing. Four seconds is two bars at 120
  bpm; a fill's missing beat is a quarter of that.

  Not climbing, because a build takes the low end away too, and it takes a
  few seconds to be sure a build is a build. Measured on the club song: its
  build's riser climbs about 1.1 dB a second, its breakdown's top end falls.
*/
const ABSENT_DB = 14;
const BREAK_S = 4;
const SOUNDING_DB = 30;
const BREAK_MAX_CLIMB = 0.3;

/*
  The build: the top end's least-squares slope over BUILD_S seconds at least
  BUILD_SLOPE dB a second, and each half of that window at least BUILD_HALF
  on its own, held for BUILD_HOLD seconds. A build over eight bars at 128 bpm
  with a riser of 24 dB climbs about 1.6 dB a second; at 90 bpm, over 21
  seconds, about 1.1. A build ends at a drop, or when the top has stopped
  climbing for BUILD_END seconds (one that fizzles out, or never was).
*/
const BUILD_S = 6;
const BUILD_SLOPE = 0.6;
const BUILD_HALF = 0.35;
const BUILD_HOLD = 1;
const BUILD_END = 3;
const BUILD_FULL_DB = 20;

/*
  Quiet: the whole mix QUIET_DB under its reference for QUIET_S seconds, or no
  reading at all. The references are then forgotten, so the next song (the
  gap between two tracks is two to four seconds, some of it the last one's
  tail) is heard on its own terms and its quiet intro is not a breakdown of
  the last one's drop. Thirty-five decibels and a second and a half: at 45 and
  two the harness's three-second gap never read as quiet at all, because the
  half-second average takes most of a second to fall that far.
*/
const QUIET_DB = 35;
const QUIET_S = 1.5;
/*
  After a song is forgotten the next one begins with the first frame
  ROOM_OVER_DB over the level the room had fallen to. Seeded at once instead,
  the tracker learned the gap's hiss as the new song's floor, and a quiet
  intro coming up out of it had already been heard as a breakdown.
*/
const ROOM_OVER_DB = 10;

/*
  The references: the loudest the whole mix and the low end have been,
  falling REF_FALL decibels a second. Half a decibel: a sixteen-bar breakdown
  at 90 bpm (43 s) lowers the low end's reference by about 20 dB, and the
  breakdown sits 60 under it, so it is still a breakdown at its end; and a
  quieter song after a loud one without a gap between (a DJ's mix) is learned
  in about half a minute.

  INTENSITY_TAU: the slow part. Eight seconds, four bars at 120: a breakdown
  lowers it over its first bars, not at its first missing kick.
*/
const REF_FALL = 0.5;
const INTENSITY_TAU = 8;
const INTENSITY_SPAN_DB = 24;

/** Under this the whole mix is digital silence (as `audioFeatures.ts` has it). */
const SILENT_DB = -125;

const KICK = 1;               // index in SOURCE_NAMES
const LEVEL = 0;
const TOP_BANDS = [10, 11, 12]; // band6..band8: 1.7–16 kHz

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const dbOf = (p: number) => 10 * Math.log10(p + 1e-30);
const powOf = (db: number) => Math.pow(10, db / 10);

/** Least-squares slope of `ys` (dB) against time, samples at `HZ`: dB per second. */
function slope(ys: number[], from: number, to: number): number {
  const n = to - from;
  if (n < 3) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = from; i < to; i++) {
    const x = (i - from) / HZ, y = ys[i];
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const d = n * sxx - sx * sx;
  return d > 0 ? (n * sxy - sx * sy) / d : 0;
}

export class SongShape {
  private full = 0;
  private low = 0;
  /** The top end's power summed over the frames since the last tick, and how many. */
  private topAcc = 0;
  private topCount = 0;
  private topRawH: number[] = [];
  private topFast = 0;
  private buildPeak = -Infinity;
  private seeded = false;
  private fullRef = -Infinity;
  private lowRef = -Infinity;
  private last: number | null = null;
  private tickAt = -Infinity;
  /** Ten-a-second history, oldest first. */
  private lowH: number[] = [];
  private topH: number[] = [];
  private tH: number[] = [];
  private quietFor = 0;
  private absentSince: number | null = null;
  private climbingFor = 0;
  private flatFor = 0;
  private buildFrom: number | null = null;
  private buildTopFrom = 0;
  private breakdownReported = false;
  /** When the low end last arrived (a drop, or the song's first sound): the top end's climb just after it is that arrival, not a build. */
  private arrivedAt = -Infinity;
  /** Whether this song's beat has come in yet: nothing breaks down before it has. */
  private beatIn = false;
  /** The level the room fell to when the last song was forgotten: the next begins when sound rises well over it. */
  private roomDb = -Infinity;
  private state: SongShapeState = { section: 'quiet', intensity: 0, action: 0, tension: 0, lastDrop: null, time: 0 };

  /** Forget the song: a new stream, a stop, a render starting. */
  reset(): void {
    this.full = 0; this.low = 0; this.topAcc = 0; this.topCount = 0; this.topFast = 0; this.buildPeak = -Infinity;
    this.seeded = false;
    this.fullRef = -Infinity; this.lowRef = -Infinity;
    this.last = null; this.tickAt = -Infinity;
    this.lowH = []; this.topH = []; this.topRawH = []; this.tH = [];
    this.quietFor = 0;
    this.absentSince = null;
    this.climbingFor = 0; this.flatFor = 0;
    this.buildFrom = null; this.buildTopFrom = 0;
    this.breakdownReported = false;
    this.arrivedAt = -Infinity;
    this.beatIn = false;
    this.roomDb = -Infinity;
    this.state = { section: 'quiet', intensity: 0, action: 0, tension: 0, lastDrop: null, time: 0 };
  }

  /** Where the song is now. */
  get now(): Readonly<SongShapeState> { return this.state; }

  /**
   * One frame. `reading` is the analyser's, or null when there is nothing to
   * hear (no input, or the show paused); `time` is seconds on the reading's
   * clock (the reading's own `time` when there is one). Returns the events
   * heard on this frame, usually none.
   */
  update(reading: AudioReading | null, time: number): SongEvent[] {
    // A clock that jumped (a render handing back to the live page, a tab
    // asleep for a while) is a new stream as far as the history is concerned:
    // a tick timed on the old clock would never come round on the new one.
    if (this.last !== null && (time < this.last - 0.5 || time > this.last + 5)) this.forgetSong();
    const dt = this.last === null ? 0 : clamp(time - this.last, 0, 0.25);
    this.last = time;
    this.state.time = time;
    const events: SongEvent[] = [];
    if (!reading || !reading.db) {
      this.fade(dt);
      this.quietFor += dt;
      if (this.quietFor >= QUIET_S && this.seeded) this.forgetSong();
      return events;
    }
    const db = reading.db;
    const topP = TOP_BANDS.reduce((s, i) => s + powOf(db[i]), 0) / TOP_BANDS.length;
    // A song begins with its first sound, not with the stream: digital
    // silence before it (a file's lead-in) is not the song's floor.
    if (!this.seeded && (db[LEVEL] < SILENT_DB || db[LEVEL] < this.roomDb + ROOM_OVER_DB)) { this.fade(dt); return events; }
    if (!this.seeded) {
      this.full = powOf(db[LEVEL]); this.low = powOf(db[KICK]); this.topFast = topP;
      this.seeded = true;
      this.arrivedAt = time;
    } else {
      const k = 1 - Math.exp(-dt / TAU);
      this.full += (powOf(db[LEVEL]) - this.full) * k;
      this.low += (powOf(db[KICK]) - this.low) * k;
      this.topFast += (topP - this.topFast) * (1 - Math.exp(-dt / TOP_FAST_TAU));
    }
    this.topAcc += topP; this.topCount++;
    const fullDb = dbOf(this.full), lowDb = dbOf(this.low);
    this.fullRef = Math.max(fullDb, this.fullRef - REF_FALL * dt);
    this.lowRef = Math.max(lowDb, this.lowRef - REF_FALL * dt);

    // Quiet: between songs, or the music stopped.
    if (fullDb < this.fullRef - QUIET_DB) {
      this.quietFor += dt;
      if (this.quietFor >= QUIET_S) { this.forgetSong(fullDb); return events; }
    } else this.quietFor = 0;

    // The slow intensity, every frame.
    const loud = clamp((fullDb - (this.fullRef - INTENSITY_SPAN_DB)) / INTENSITY_SPAN_DB, 0, 1);
    const lowIn = lowDb >= this.lowRef - ABSENT_DB ? 1 : 0.5;
    this.state.intensity += (loud * lowIn - this.state.intensity) * (1 - Math.exp(-dt / INTENSITY_TAU));

    // The rest runs ten times a second, on the history.
    if (time - this.tickAt < 1 / HZ - 1e-6) return events;
    const tickDt = Number.isFinite(this.tickAt) ? Math.min(0.5, time - this.tickAt) : 1 / HZ;
    this.tickAt = time;
    this.topRawH.push(this.topAcc / Math.max(1, this.topCount));
    this.topAcc = 0; this.topCount = 0;
    let box = 0, boxN = 0;
    for (let i = this.topRawH.length - 1; i >= 0 && boxN < TOP_BOX_S * HZ; i--) { box += this.topRawH[i]; boxN++; }
    const topDb = dbOf(box / boxN);
    this.lowH.push(lowDb); this.topH.push(topDb); this.tH.push(time);
    while (this.tH.length > 0 && time - this.tH[0] > HISTORY_S) { this.lowH.shift(); this.topH.shift(); this.topRawH.shift(); this.tH.shift(); }
    const n = this.tH.length;
    const span = n > 0 ? time - this.tH[0] : 0;
    const s = this.state;

    // The top end's slope now, and whether a build is climbing.
    const w = Math.min(n, Math.round(BUILD_S * HZ));
    const whole = w >= BUILD_S * HZ * 0.9 ? slope(this.topH, n - w, n) : 0;
    const half = Math.floor(w / 2);
    const early = w >= BUILD_S * HZ * 0.9 ? slope(this.topH, n - w, n - half) : 0;
    const late = w >= BUILD_S * HZ * 0.9 ? slope(this.topH, n - half, n) : 0;
    s.action = clamp(whole / 2, -1, 1);
    const settled = time - this.arrivedAt >= BUILD_S / 2 + TOP_BOX_S;
    const climbing = settled && whole >= BUILD_SLOPE && early >= BUILD_HALF && late >= BUILD_HALF;
    this.climbingFor = climbing ? this.climbingFor + tickDt : 0;
    this.flatFor = whole <= 0.1 ? this.flatFor + tickDt : 0;

    // ── Drop ────────────────────────────────────────────────────────
    const pastFrom = this.tH.findIndex(t => time - t <= DROP_PAST[0]);
    let pastMax = -Infinity;
    for (let i = Math.max(0, pastFrom); i < n && time - this.tH[i] >= DROP_PAST[1]; i++) pastMax = Math.max(pastMax, this.lowH[i]);
    const recentDrop = s.lastDrop !== null && time - s.lastDrop < DROP_GAP_S;
    const topFastDb = dbOf(this.topFast);
    if (this.buildFrom !== null) this.buildPeak = Math.max(this.buildPeak, topFastDb);
    let lowMean = 0, lowN = 0;
    for (let i = n - 1; i >= 0 && time - this.tH[i] <= 4; i--) { lowMean += powOf(this.lowH[i]); lowN++; }
    const lowBefore = lowN > 0 ? dbOf(lowMean / lowN) : lowDb;
    const returned = span >= DROP_PAST[0] - 0.2 && Number.isFinite(pastMax)
      && lowDb - pastMax >= DROP_RISE_DB && lowDb >= this.lowRef - DROP_NEAR_REF_DB && lowDb >= fullDb + LOW_OVER_DB;
    const cut = this.buildFrom !== null && topFastDb <= this.buildPeak - CUT_DB && lowDb >= lowBefore + CUT_LOW_DB && lowDb >= fullDb + LOW_OVER_DB;
    if (!recentDrop && (returned || cut)) {
      const built = this.buildFrom !== null;
      events.push({ kind: 'drop', at: time, strength: built ? 1 : clamp((lowDb - pastMax) / DROP_FULL_RISE_DB, 0.3, 1) });
      s.lastDrop = time;
      this.arrivedAt = time;
      this.beatIn = true;
      this.buildFrom = null;
      this.absentSince = null;
      this.breakdownReported = false;
      s.section = 'steady';
      s.tension = 0;
      return events;
    }

    // ── Build ───────────────────────────────────────────────────────
    if (this.buildFrom === null && this.climbingFor >= BUILD_HOLD) {
      this.buildFrom = time - this.climbingFor - BUILD_S / 2;
      this.buildPeak = topFastDb;
      this.buildTopFrom = this.topH[Math.max(0, n - w)];
      s.section = 'build';
      events.push({ kind: 'build', at: time, strength: clamp((topDb - this.buildTopFrom) / BUILD_FULL_DB, 0, 1) });
    } else if (this.buildFrom !== null && this.flatFor >= BUILD_END) {
      this.buildFrom = null;
      s.tension = 0;
      s.section = this.absentSince !== null ? 'breakdown' : 'steady';
    }
    if (this.buildFrom !== null) s.tension = clamp((topDb - this.buildTopFrom) / BUILD_FULL_DB, 0, 1);

    // ── Breakdown ───────────────────────────────────────────────────
    // The beat is in once the low end stands over the mix (see LOW_OVER_DB),
    // whether or not it came in as a drop: a song that starts on its beat has
    // no silence before it for a drop to rise out of.
    if (lowDb >= fullDb + LOW_OVER_DB && lowDb >= this.lowRef - ABSENT_DB) this.beatIn = true;
    const absent = lowDb < this.lowRef - ABSENT_DB && fullDb >= this.fullRef - SOUNDING_DB;
    if (!absent) {
      this.absentSince = null;
      this.breakdownReported = false;
      if (s.section === 'breakdown') s.section = 'steady';
    } else if (this.absentSince === null) this.absentSince = time;
    if (absent && this.beatIn && this.absentSince !== null && !this.breakdownReported && this.buildFrom === null
      && time - this.absentSince >= BREAK_S && whole < BREAK_MAX_CLIMB) {
      this.breakdownReported = true;
      s.section = 'breakdown';
      events.push({ kind: 'breakdown', at: time, strength: clamp((this.lowRef - lowDb) / DROP_FULL_RISE_DB, 0, 1) });
    }
    if (s.section === 'quiet') s.section = 'steady';
    return events;
  }

  /** Between songs: forget the references, so the next song is heard on its own. */
  private forgetSong(roomDb = -Infinity): void {
    const { lastDrop, intensity } = this.state;
    this.reset();
    // The intensity is carried and falls away on its own time constant: a
    // song ending is not a reason for anything following it to jump.
    this.state.lastDrop = lastDrop;
    this.state.intensity = intensity;
    this.roomDb = roomDb;
  }

  /** Nothing to hear: the intensity falls away as it would in silence. */
  private fade(dt: number): void {
    this.state.intensity *= Math.exp(-dt / INTENSITY_TAU);
  }
}
