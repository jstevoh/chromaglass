import type { VisualizerSettings } from '../types';
import type { SongSection } from './songShape';
import { THEMES, moveTargets } from './drift';
import { stream } from './rng';

/**
 * Evolve's timing: one slow move at a time, steered by the song over minutes.
 *
 * The owner, 2026-10-11: "I want evolve to focus on more slowly changing
 * settings (as opposed to directly reacting to frequency and bouncing
 * around). It should consider the music in longer changing ways, and slowly
 * changes the visuals in creative and interesting ways. If there is no music,
 * it can do basically the same thing and slowly change across time."
 *
 * What it was, measured by `npm run slowevolve` on the same seed: two
 * unrelated dials picked every six seconds and each glided over four, so ten
 * new moves a minute, a dial in motion two thirds of the time, and nothing
 * about any of it that had heard the song. Over one minute the look had
 * already gone most of the way it would go in ten, which is the signature of
 * noise: a random walk inside a window fills the window fast and then just
 * jitters in it.
 *
 * What it is now:
 *
 *   - **One move at a time.** A move is a few dials from one theme
 *     (lib/drift.ts THEMES) going the same way together, glided over 30 to 90
 *     seconds, then a rest before the next. Under a minute of glide the change
 *     reads as the dish doing something; over a minute and a half it is too
 *     slow to notice at all, and the eye only sees that it is different.
 *     That is at the default Evolve Speed: the dial stretches every time
 *     here by up to four at its bottom and shrinks it by up to eight at its
 *     top (evolvePace below).
 *   - **The music steers which way, over minutes.** Not the frame's treble or
 *     energy: the song shape tracker's intensity (already slow, lib/songShape)
 *     averaged again over thirty seconds, set against the song's own level
 *     over four minutes so a loud song is not simply "livelier" for its whole
 *     length; and its sections. A build leans the next move livelier and
 *     shortens it, a drop leans it hard livelier for the half minute after,
 *     a breakdown leans it calmer and lets it take longer. A faster tempo
 *     glides a little quicker (the square root of the tempo, so 174 bpm is
 *     four fifths of 110's length, not two thirds).
 *   - **Sections cue the moves.** A section change during a rest ends the
 *     rest (once it has lasted six seconds), so the next move starts with the
 *     new section rather than at a time that has nothing to do with it. A move
 *     under way is never cut short, and a section heard during one is let go:
 *     a glide that jumped to its end on the drop would be exactly the lurch
 *     this is here to remove, and a cue kept for its end would start the next
 *     move with no rest at all.
 *   - **The palette changes at a drop or a breakdown**, at most once every
 *     seventy-five seconds. Only dye still to come takes the new colours
 *     (LiquidVisualizer's `evolvePalette`), so the plate turns over to them
 *     as the drops land, over a minute or two, never a cut.
 *   - **With no music, the same moves on a slow clock.** The lean wanders on
 *     its own (an Ornstein–Uhlenbeck walk on a three-minute time constant), so
 *     the look still breathes between calmer and livelier over minutes, and
 *     the palette turns every three to five minutes.
 *
 * Nothing here moves the whole picture: the frame-moving dials are held out
 * of every theme (lib/drift.ts FRAME_MOTION), and the closeup camera's aim,
 * which is Evolve's to wander, moves once a move by a short way over the
 * move's whole length (App.tsx).
 *
 * Pure: the ear's reading in, a move out. No clock of its own and every roll
 * from the stream it is handed, so `npm run slowevolve` can drive an hour of
 * it in a moment and a render of a song draws the same moves as the show.
 */

/** What Evolve hears, once a step: the song shape tracker's state and the tempo. */
export interface EvolveEar {
  /** Music is playing and has been heard (not paused, not silent). */
  playing: boolean;
  section: SongSection;
  /** 0..1, the song shape tracker's slow loudness-and-fullness. */
  intensity: number;
  /** 0..1 through a build. */
  tension: number;
  /** When the last drop was heard, on `time`'s clock, or null. */
  lastDrop: number | null;
  /** The ear's clock, seconds. */
  time: number;
  /** The tempo, or 0 when there is none. */
  bpm: number;
}

export interface EvolveMove {
  theme: string;
  /** Each dial's target. */
  to: Record<string, number>;
  /** How long the glide takes, seconds. */
  seconds: number;
  /** The lean it was planned in, -1 calmer .. 1 livelier. */
  lean: number;
  /** What started it: the clock, or a section of the song. */
  cue: 'clock' | 'build' | 'drop' | 'breakdown';
  /**
   * Where the closeup camera drifts to over the same glide, when it is zoomed
   * in and held or following (Auto moves itself). A short way, a twelfth of
   * the plate at most each way, over the move's whole length: the camera
   * wandered ±0.12 in four seconds before, a pan anyone would feel.
   */
  aim?: { x: number; y: number };
}

export interface EvolveStep {
  move?: EvolveMove;
  /** Time to turn the palette for the dye still to come. */
  palette?: boolean;
}

export const GLIDE_MIN = 30;
export const GLIDE_MAX = 90;
/** A palette change at most this often, seconds, so a run of short sections does not flicker colours. */
const PALETTE_GAP = 75;
/**
 * The shortest rest between two moves at the default Evolve Speed, seconds: a
 * move, then the dish left alone to show it. Paced like the rest (evolvePace),
 * but never under REST_FLOOR real seconds, however fast the dial.
 */
export const MIN_REST = 6;
export const REST_FLOOR = 2;
/** Seconds of silence before Evolve stops listening for sections and runs on its clock. */
const DEAF_AFTER = 12;

/** How far the closeup's aim may wander in one move, each way, as a share of the plate. */
export const AIM_STEP = 0.08;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The Evolve Speed a look sits at when it sets none (DEFAULT_SETTINGS'), and
 * the one the dial is measured from when a look's own is off (0, as Comet's).
 */
export const PACE_PIVOT = 0.12;
/** How many times slower than that the bottom of the dial runs, and how many times faster the top. */
const PACE_SLOWEST = 4;
const PACE_FASTEST = 8;
/** The palette never turns more often than this, seconds, however fast the dial: colours that flicker are not evolving. */
const PALETTE_FLOOR = 20;

/**
 * How long Evolve's times run at this Evolve Speed, as a multiple of the
 * pace described above: 1 where the look's own Evolve Speed sits, 4 at the
 * bottom of the dial (a move every five minutes or so, glides of two to six
 * minutes), an eighth at the top (a move every twelve seconds or so, glides
 * of four to eleven seconds).
 *
 * The owner, 2026-10-11, once the slow Evolve was live: "I want evolve to go
 * really slowly if the settings control is low - but if I ramp it up, I want
 * it to evolve quickly." Before this the dial barely touched the pace: every
 * glide was held to 30–90 s whatever the dial said, and from the bottom of
 * the dial to the top the moves a minute went from 0.63 to 1.10 (npm run
 * slowevolve). Now the whole dial is a factor of 32, log-even on each side
 * of the default, so each step up feels like the same step: a turn from 60%
 * to 100% speeds it up by as much, to the eye, as one from 12% to 30%.
 *
 * Measured from the look's own Evolve Speed, not from one number for every
 * look: the looks set it from 0.02 to 0.3, for the hands' pours as much as
 * for this (presets.ts), and from a fixed middle 14 of the 41 would have
 * evolved one and a half to three and a half times slower than they did the
 * day the owner liked them, without the dial being touched. So a look plays
 * at the pace it always had, and the dial turned down from there slows it,
 * turned up speeds it. Log-even on each side, so the look's own point stays
 * exactly where it was whatever the two ends are chosen to be.
 */
export function evolvePace(rate: number, own: number = PACE_PIVOT): number {
  const pivot = Number.isFinite(own) && own >= 0.01 && own < 1 ? own : PACE_PIVOT;
  const r = clamp(Number.isFinite(rate) ? rate : pivot, 0, 1);
  return r <= pivot
    ? Math.pow(PACE_SLOWEST, (pivot - r) / pivot)
    : Math.pow(1 / PACE_FASTEST, (r - pivot) / (1 - pivot));
}


export class SlowEvolve {
  /** Seconds left of the move under way, or of the rest after it. */
  private left = 4;
  private gliding = false;
  /** Seconds since the last glide ended (a fresh planner has rested as long as it likes). */
  private restedFor = MIN_REST;
  /** The same in real seconds, for REST_FLOOR. */
  private restedReal = REST_FLOOR;
  private lastTheme = '';
  /** The song's level over the last half minute, and over four. */
  loud = 0;
  loudLong = 0;
  /** The lean the music asks for now, and the clock's own wander when there is none. */
  lean = 0;
  private wander = 0;
  /** Seconds of music heard since Evolve started listening, for the averages' start. */
  private heardTotal = 0;
  private silentFor = DEAF_AFTER;
  private lastSection: SongSection = 'quiet';
  private lastDrop: number | null = null;
  private pendingCue: EvolveMove['cue'] | null = null;
  private sincePalette = 0;
  private nextClockPalette = 240;

  /** Whether it has heard a first reading (see the cues). */
  private primed = false;

  constructor(private rand: () => number = stream('show.drift').float) {}

  /**
   * One step of `dt` seconds. `rate` is the Evolve Speed: it sets the pace
   * against `own`, the look's own Evolve Speed (evolvePace: the glides, the
   * rests and the palette's least gap all run that many times longer or
   * shorter) and lets a move use more of each dial's window.
   */
  step(dt: number, ear: EvolveEar, current: VisualizerSettings, anchor: VisualizerSettings, rate: number,
    own: number = PACE_PIVOT): EvolveStep {
    const r = clamp(rate, 0, 1);
    const out: EvolveStep = {};
    if (r <= 0 || dt <= 0) return out;
    const pace = evolvePace(r, own);
    /*
      The rest and the palette's gaps are counted in paced seconds, read off
      the dial on every step, not fixed when the rest began: turned up in the
      middle of a five-minute rest, the next move comes in seconds, which is
      what turning it up is for. A glide under way keeps the length it began
      with (App glides it by its own seconds); the next one takes the new pace.
    */
    const restDt = dt / pace;
    this.sincePalette += dt / Math.max(pace, PALETTE_FLOOR / PALETTE_GAP);
    if (!this.primed) { this.primed = true; this.lastDrop = ear.lastDrop; this.lastSection = ear.section; }

    const hearing = ear.playing && ear.section !== 'quiet';
    this.silentFor = hearing ? 0 : this.silentFor + dt;
    const music = this.silentFor < DEAF_AFTER;

    if (music) {
      // The level, twice smoothed: the tracker's own several seconds, then half a minute here.
      /*
        Until a whole time constant has been heard, each is the plain mean of
        what has been: started from the first reading alone, one loud frame
        at the start of a song set the four-minute level for minutes (measured
        here: a lean 0.15 off from the same song heard without the shake).
      */
      // A reading that is not a number is no reading: a NaN carried into the
      // averages would hold every later target at NaN, and Evolve would stop.
      const lvl = Number.isFinite(ear.intensity) ? clamp(ear.intensity, 0, 1) : this.loud;
      this.heardTotal += dt;
      const toward = (tau: number) => Math.max(1 - Math.exp(-dt / tau), dt / this.heardTotal);
      this.loud += (lvl - this.loud) * toward(30);
      this.loudLong += (lvl - this.loudLong) * toward(240);
      let want = clamp((this.loud - this.loudLong) * 3, -0.6, 0.6);
      const sinceDrop = ear.lastDrop !== null ? ear.time - ear.lastDrop : Infinity;
      if (sinceDrop >= 0 && sinceDrop < 30) want = 0.8;
      else if (ear.section === 'build') want = Math.max(want, 0.3 + 0.5 * (Number.isFinite(ear.tension) ? clamp(ear.tension, 0, 1) : 0));
      else if (ear.section === 'breakdown') want = Math.min(want, -0.6);
      this.lean += (want - this.lean) * (1 - Math.exp(-dt / 20));

      /*
        The section cues: a new build or breakdown, or a drop the tracker has
        just heard. A cue is for a rest only. One heard during a glide is let
        go rather than kept for the glide's end: kept, it started the next
        move the moment the last one finished, so in a song there was never a
        rest at all (8 of 9 gaps under half a second, in review), and the cue
        it acted on could be a minute and a half stale.

        A planner made mid-song (Evolve switched on, the show unpaused, a
        render's start) takes the drop the tracker already knows as heard,
        not as one that has just happened.
      */
      if (ear.lastDrop !== null && ear.lastDrop !== this.lastDrop) {
        this.lastDrop = ear.lastDrop;
        if (!this.gliding) this.pendingCue = 'drop';
        if (this.sincePalette >= PALETTE_GAP) { out.palette = true; this.sincePalette = 0; }
      } else if (ear.section !== this.lastSection && (ear.section === 'build' || ear.section === 'breakdown')) {
        if (!this.gliding) this.pendingCue = ear.section;
        if (ear.section === 'breakdown' && this.sincePalette >= PALETTE_GAP) { out.palette = true; this.sincePalette = 0; }
      }
      this.lastSection = ear.section;
    } else {
      // No music: the lean wanders by itself, back toward the look, on minutes.
      const tau = 180;
      const g = (this.rand() + this.rand() + this.rand() - 1.5) * 2; // about N(0, 1)
      this.wander += -this.wander * dt / tau + Math.sqrt(2 * dt / tau) * 0.6 * g;
      this.wander = clamp(this.wander, -1, 1);
      this.lean += (this.wander - this.lean) * (1 - Math.exp(-dt / 20));
      this.lastSection = 'quiet';
      if (this.sincePalette >= this.nextClockPalette) {
        out.palette = true;
        this.sincePalette = 0;
        this.nextClockPalette = 180 + this.rand() * 120;
      }
    }

    this.left -= this.gliding ? dt : restDt;
    if (!this.gliding) this.restedFor += restDt;
    if (!this.gliding) this.restedReal += dt;
    // A section change ends a rest once the dish has had its few seconds; a glide always runs to its end.
    const cued = !this.gliding && this.pendingCue !== null && this.restedFor >= MIN_REST;
    if (this.left > 0 && !cued) return out;
    // At the top of the dial a paced rest is under a second; the dish still gets two to show the move.
    if (!this.gliding && this.restedReal < REST_FLOOR) return out;

    if (this.gliding) {
      this.gliding = false;
      this.pendingCue = null;
      this.restedFor = 0;
      this.restedReal = 0;
      this.left = MIN_REST + (30 * (1 - PACE_PIVOT)) * (0.7 + 0.6 * this.rand());
      return out;
    }

    const cue = this.pendingCue ?? 'clock';
    this.pendingCue = null;
    const move = this.plan(current, anchor, r, pace, music, ear, cue);
    if (move) {
      out.move = move;
      this.gliding = true;
      this.left = move.seconds;
      this.lastTheme = move.theme;
    } else {
      this.left = 10;
    }
    return out;
  }

  private plan(current: VisualizerSettings, anchor: VisualizerSettings, r: number, pace: number, music: boolean,
    ear: EvolveEar, cue: EvolveMove['cue']): EvolveMove | null {
    // A theme with dials in play on this look, not the one just moved.
    const order = THEMES.map((t, i) => ({ t, i, roll: this.rand() }))
      .sort((a, b) => a.roll - b.roll);
    for (const pass of [true, false]) {
      for (const { t } of order) {
        if (pass && t.name === this.lastTheme && THEMES.length > 1) continue;
        const to = moveTargets(t, current, anchor, this.lean, 0.4 + 0.6 * r, this.rand, 2 + Math.floor(this.rand() * 2));
        if (Object.keys(to).length === 0) continue;
        let seconds: number;
        if (music) {
          const tempo = ear.bpm >= 40 && ear.bpm <= 240 ? Math.sqrt(110 / ear.bpm) : 1;
          const section = cue === 'build' || ear.section === 'build' ? 0.75
            : cue === 'breakdown' || ear.section === 'breakdown' ? 1.3 : 1;
          seconds = 60 * tempo * section;
        } else {
          seconds = 50 + 35 * this.rand();
        }
        seconds *= (1.15 - 0.3 * PACE_PIVOT) * (0.88 + 0.24 * this.rand());
        const move: EvolveMove = { theme: t.name, to, seconds: pace * clamp(seconds, GLIDE_MIN, GLIDE_MAX), lean: this.lean, cue };
        if ((current.macroZoom ?? 1) > 1.05 && (current.macroCamera ?? 'hold') !== 'auto') {
          /*
            The camera never goes faster than at the default, however fast the
            dial: a quick move is a shorter step of the aim over a shorter
            glide, not the same step in an eighth of the time. The aim moves
            the whole picture, and whole-picture motion made the owner ill
            (2026-10-11); the liquids may hurry, the frame may not.
          */
          const reach = AIM_STEP * Math.min(1, pace);
          const step = (v: number) => clamp(v + (this.rand() * 2 - 1) * reach, 0.15, 0.85);
          move.aim = { x: step(current.macroAimX ?? 0.5), y: step(current.macroAimY ?? 0.5) };
        }
        return move;
      }
    }
    return null;
  }
}
