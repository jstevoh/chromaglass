/**
 * A row of the Mixer brought in or taken out over bars (PLAN.md §11 step 4).
 *
 * Until this a row's level was a fader and nothing else: a film came in as
 * fast as a hand moved, which on a MIDI desk is a slow push and on a phone,
 * with one thumb on a slider across a sheet, is a jump. A video mixer's
 * channel has a take button beside the fader for that reason: the fader for
 * riding, the button for the move that has to land on the music. So each row
 * gets a fade time of its own, counted in bars because a film that comes in
 * "over two bars" arrives on the One whatever the song's tempo, and one
 * button (a pad, a tap on the phone) that takes the row out to nothing or
 * brings it back to where it was.
 *
 * Everything here is arithmetic on numbers handed in, with no clock of its
 * own and no settings of its own, so `npm run rowfade` can drive a whole
 * fade in node, at the show timer's own rate, and check what came out.
 *
 * ## The rules, and why each
 *
 * - **Back to where it was, not to full.** A film graded at 40% for this room
 *   and taken out comes back at 40%. Taking a row out remembers its level; a
 *   row that was never up comes in at 1.
 * - **A second press turns it round, from where it is.** Pressed half-way
 *   out, the row comes back from half, in half the time, never jumping to
 *   full first. A fade that jumps on a second press is the hard cut this is
 *   here to take away.
 * - **The hand wins.** A fader moved while a fade runs stops the fade where
 *   the hand put it. The app's two ways a hand writes a setting (a slider,
 *   the remote or a pad through `updateSettings`, a MIDI fader through
 *   `rideSetting`) each tell the fades which levels they wrote (`handOn`).
 *   Comparing the level with what the fade last wrote would have caught every
 *   writer at once, but React applies a write a frame or more later than it
 *   is asked for (and twice over in development), so a fade would have read
 *   its own late write as a hand and let go of itself.
 * - **Zero bars is a cut.** The same button, the level set at once: a take
 *   button that can also be a cut, which is what the plan asked for.
 * - **The curve is the house's.** Smoothstep, as every other walk of a
 *   setting in the app (`glideSetting`), so it leaves and arrives at rest:
 *   no step at the start of a fade that reads as a cut to the eye.
 */

import type { VisualizerSettings } from '../types';
import { MIX_SOURCE_INFO, fadeKey, type MixSource } from './mixer.ts';
import { MIN_BEAT_CONFIDENCE } from './barGrid.ts';

/** Every row can fade, the front plate too: taking the glass out leaves the lamp and the beams. */
export const FADE_ROWS: readonly MixSource[] = ['led', 'gel', 'lumia', 'front', 'back', 'film', 'mark'];

export { fadeKey };

/** A fade time's travel: nothing (a cut) to eight bars, the length of a verse's first half. */
export const FADE_MAX_BARS = 8;
/** Every row starts at two bars, the plan's own example: a film coming in over two bars. */
export const DEFAULT_FADE_BARS = 2;

/**
 * The fade times as controls, for MIDI learn, the desks' pins and the panel's
 * registry, beside the grades but not among them: `MIX_CONTROLS` is held by
 * `npm run mixer` to "every one of them changes what is drawn", and a fade
 * time changes when, not what.
 */
export const FADE_CONTROLS = FADE_ROWS.map(id => ({
  key: fadeKey(id),
  label: `${MIX_SOURCE_INFO[id].name} Fade Time`,
  min: 0,
  max: FADE_MAX_BARS,
  // Half bars, as the drawer's slider and its readout count them: a MIDI knob
  // or a desk pin left free wrote 2.3, which read "2.5 bars" and ran 2.3.
  step: 0.5,
}));

/**
 * The tempo a bar is counted at when nothing is heard and nothing is sent.
 * 120 is the tap tempo's own starting point and the middle of dance music;
 * two bars at it is four seconds, a slow push on a fader.
 */
export const FALLBACK_BPM = 120;

/**
 * A number of bars in milliseconds, at `bpm` in 4/4. A tempo outside 40–240
 * is a tracker between songs or a clock that has not settled, and counting a
 * two-bar fade at 12 bpm would take forty seconds; it is held to that range
 * rather than trusted.
 */
export function barsToMs(bars: number, bpm: number): number {
  const b = Number.isFinite(bpm) && bpm > 0 ? Math.min(240, Math.max(40, bpm)) : FALLBACK_BPM;
  const n = Number.isFinite(bars) ? Math.min(FADE_MAX_BARS, Math.max(0, bars)) : DEFAULT_FADE_BARS;
  return n * 4 * 60000 / b;
}

/**
 * A row's fade time in bars, from the settings. Each row's key by name, not
 * built from the row's id, so what is read is plain to anyone looking for
 * what reads `filmFade` (and to `npm run panel`, which asks that of every
 * setting). A setting missing or not a number, from a rig saved before the
 * fade times, counts as the default.
 */
export function fadeBarsOf(s: Partial<VisualizerSettings>, id: MixSource): number {
  const bars = {
    led: s.ledFade, gel: s.gelFade, lumia: s.lumiaFade, front: s.frontFade,
    back: s.backFade, film: s.filmFade, mark: s.markFade,
  }[id];
  return typeof bars === 'number' && Number.isFinite(bars) ? bars : DEFAULT_FADE_BARS;
}

/**
 * The tempo the bars are counted at: the one the desk sends or taps, else
 * the one the bar grid hears in the music (a beat in seconds, and only once
 * it is sure of it), else none, which `barsToMs` counts at 120. Here and not
 * in App because the first version, written there, read the heard beat's
 * seconds as milliseconds: 120 bpm heard was 120 000, held to 240, and every
 * fade with music playing ran in half its bars or less. "Sure" is the grid's
 * own line (MIN_BEAT_CONFIDENCE): under it the grid still publishes a period,
 * as its unsure state, and the first version took any confidence above 0, so
 * two bars in a noisy room ran anywhere from 2.6 to 7 seconds.
 */
export function fadeTempo(sentBpm: number, beatSeconds: number, beatConfidence: number): number {
  if (Number.isFinite(sentBpm) && sentBpm > 0) return sentBpm;
  if (Number.isFinite(beatSeconds) && beatSeconds > 0 && beatConfidence >= MIN_BEAT_CONFIDENCE) return 60 / beatSeconds;
  return 0;
}

/** The walk from 0 to 1: smoothstep, at rest at both ends. */
export const fadeCurve = (k: number): number => {
  const t = Math.min(1, Math.max(0, k));
  return t * t * (3 - 2 * t);
};

/**
 * The two rows whose level is a look's, not the room's: the gel wheel's and
 * the lumia's were Lamp settings before they were Mixer rows, and a look
 * still sets them. Every other row's level is in RIG_KEYS (lib/lookFade.ts;
 * `npm run rowfade` holds the two lists to each other). A look coming in
 * stops a take on these, as a hand would.
 */
export const LOOK_LEVEL_KEYS: readonly string[] = ['gelWheel', 'lumia'];

/** Which row a level setting belongs to: `filmMix` is the film's. */
const LEVEL_ROW = new Map<string, MixSource>(FADE_ROWS.map(id => [String(MIX_SOURCE_INFO[id].level), id]));

/** A level this close to 0 is out: the row is not on the wall. */
const OUT = 0.001;

interface Walk {
  from: number;
  to: number;
  start: number;
  ms: number;
}

/** Which way each running fade is going, for a button that says so. */
export type FadeWay = 'in' | 'out';

/** What a panel needs to draw the take buttons: the press, and what is running. */
export interface MixTakes {
  onFade: (id: MixSource) => void;
  fading: Partial<Record<MixSource, FadeWay>>;
}

export class RowFades {
  private walks = new Map<MixSource, Walk>();
  /** Where each row was when it was taken out, to bring it back there. */
  private held = new Map<MixSource, number>();
  /** When each row's button was last pressed, for a look fade to leave it be. */
  private pressed = new Map<MixSource, number>();

  /** Which rows are fading, and which way. */
  running(): Partial<Record<MixSource, FadeWay>> {
    const out: Partial<Record<MixSource, FadeWay>> = {};
    for (const [id, w] of this.walks) out[id] = w.to > w.from ? 'in' : 'out';
    return out;
  }

  /** Whether a row is fading. */
  isFading(id: MixSource): boolean {
    return this.walks.has(id);
  }

  /** What a press on a row would do now: bring it in, or take it out. */
  wayOf(id: MixSource, level: number): FadeWay {
    const w = this.walks.get(id);
    if (w) return w.to > w.from ? 'out' : 'in';
    return level > OUT ? 'out' : 'in';
  }

  /**
   * The row's take button, pressed. `level` is the row's level now, `ms` its
   * whole fade time. Returns the level to write at once: the target when the
   * fade is a cut, or `level` itself when a walk has started (the next `step`
   * moves it).
   */
  press(id: MixSource, level: number, ms: number, now: number): number {
    const way = this.wayOf(id, level);
    const walk = this.walks.get(id);
    this.pressed.set(id, now);
    // Mid-walk, where the walk is now, not the level handed in: that was read
    // from settings a frame or so behind the walk's last write.
    const from = walk ? walk.from + (walk.to - walk.from) * fadeCurve((now - walk.start) / walk.ms) : level;
    let to: number;
    if (way === 'out') {
      // Remember where it was, unless it is already on its way back in from
      // a take-out: then the remembered level is still the one to return to.
      if (!this.walks.has(id) && level > OUT) this.held.set(id, level);
      to = 0;
    } else {
      to = this.held.get(id) ?? 1;
      if (!(to > OUT)) to = 1;
    }
    this.walks.delete(id);
    // A turn part-way goes back in the share of the time the distance is:
    // half-way out comes back in half the fade time, at the same speed.
    // The whole distance is the walk's own when one is turned: a row coming
    // in from 0 with nothing remembered, turned at a tenth, has a tenth of
    // the way to go back, not all of it (the first version measured it
    // against where it was, and crawled back over the whole fade time).
    const whole = walk ? Math.max(walk.from, walk.to) : way === 'out' ? from : to;
    const share = whole > OUT ? Math.min(1, Math.abs(to - from) / whole) : 1;
    const dur = ms * share;
    if (!(dur > 0) || Math.abs(to - from) <= 1e-6) return to;
    this.walks.set(id, { from, to, start: now, ms: dur });
    return from;
  }

  /**
   * The level of every running fade at `now`, to write. A fade that has
   * arrived writes its target and is done.
   */
  step(now: number): Partial<Record<MixSource, number>> {
    const out: Partial<Record<MixSource, number>> = {};
    for (const [id, w] of [...this.walks]) {
      const k = (now - w.start) / w.ms;
      out[id] = k >= 1 ? w.to : w.from + (w.to - w.from) * fadeCurve(k);
      if (k >= 1) this.walks.delete(id);
    }
    return out;
  }

  /**
   * A hand wrote these settings: any row whose level is among them stops
   * fading, where the hand put it. That level is what a later take-out
   * remembers, since the press reads the level it is handed.
   */
  handOn(keys: Iterable<string>): boolean {
    let took = false;
    for (const k of keys) {
      const id = LEVEL_ROW.get(k);
      if (id && this.walks.delete(id)) took = true;
    }
    return took;
  }

  /** Drop every fade where it is (a render, a look that resets the desk). */
  clear(): void {
    this.walks.clear();
    this.pressed.clear();
  }

  /**
   * The level settings of the rows whose button was pressed at or after
   * `since`: what a look fade that began at `since` must leave as it is
   * (lookFade's `lookStep`), whether the take is still running or has landed.
   */
  levelsTakenSince(since: number): string[] {
    const out: string[] = [];
    for (const [id, at] of this.pressed) if (at >= since) out.push(String(MIX_SOURCE_INFO[id].level));
    return out;
  }

  /**
   * Forget where these rows were taken out from. For the gel's and the
   * lumia's, whose level is a look's: a gel taken out at 0.7 in one look and
   * brought back in the next came to the old look's 0.7.
   */
  forget(ids: Iterable<MixSource>): void {
    for (const id of ids) this.held.delete(id);
  }
}
