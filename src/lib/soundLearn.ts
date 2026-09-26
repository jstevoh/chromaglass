/**
 * Sound learn: the music as a hand on the controls (PLAN §5).
 *
 * The Learn button that binds a control to a fader has a second source: the
 * music. A binding (`SoundBinding` in `midi.ts`, saved in the same map file as
 * the controller's) is one of two things, decided by what it is aimed at:
 *
 *   - a *mapping*, onto a setting: the setting follows a source's level. That
 *     is the patch bay's job already (`sceneMap.ts`), so a mapping is handed to
 *     it as a patch cord on the `bands` source and nothing here does any
 *     arithmetic on settings. `patchesOf` is the whole of that half;
 *   - a *trigger*, onto an action, a preset or a dye: it fires once per onset
 *     of its source. That is what the rest of this file is for.
 *
 * ## Why a trigger does not simply fire on the onset
 *
 * Because an onset is late. By the time the analyser has seen a kick, the
 * kick has been in the room for the capture buffer, the analyser's window and
 * its smoothing: tens of milliseconds, more through a microphone. The beat
 * clock (`beatClock.ts`) already exists to beat that for the show's own kick
 * reactions: it locks to the beat and fires each one a little *before* it is
 * heard. A trigger that waited for the heard onset would land behind the
 * plate's own beat squeeze on the same kick, which reads as the trigger being
 * sloppy.
 *
 * So where the clock has a beat and the source has been landing on it, the
 * trigger fires on the clock's prediction, and the heard onset that follows is
 * absorbed as the same hit. Where it has not — the clock is not locked, or the
 * hit is off the beat (a hat on the "and", a fill, a syncopated kick) — it
 * fires on the heard onset, which is the best that can be done for a hit
 * nothing predicted. A band-energy *mapping* never predicts: a level has no
 * moment to arrive early for.
 *
 * ## Which beats a source is expected on
 *
 * The clock predicts every beat; a source is not on every beat. A four-on-the-
 * floor kick is, a rock kick is on one and three, a backbeat snare on two and
 * four, a hat on every beat and every "and". So each source is predicted from
 * its own recent history against the clock's grid: it is expected on the next
 * beat if it was heard on the last two beats (an every-beat pattern), or on
 * the beats two and four back but not the one before (an every-other-beat
 * pattern, and not on the beats one and three back). Both are asked of the
 * *most recent* slot the pattern says should have hit, so a source that stops
 * stops being predicted within one beat: the most a trigger can fire for a
 * hit that never came is once, when a band stops dead mid-bar, which no
 * prediction can avoid.
 *
 * ## When the music stops
 *
 * Nothing fires. Nothing heard is obvious (an analyser in silence finds no
 * onsets); nothing *predicted* is the part that needs a rule, because the beat
 * clock coasts on for a beat or three after the music stops, by design. A
 * prediction is made only while the music has been sounding in the last half
 * beat — the overall level, against its own range, above a tenth — and in
 * silence or a quiet room the level is at its floor within a few frames. A
 * reading of null (no audio, or the show paused) stops everything and forgets
 * the pattern, so a song that starts again is learned afresh.
 *
 * No DOM, no clock, no random numbers: `npm run learn` drives it with a
 * synthesised song, and the render loop drives it with the live one.
 */

import type { AudioReading, SourceName } from './audioFeatures.ts';
import { isMapping, type MusicSource, type SoundBinding } from './midi.ts';
import type { SceneMapping } from '../types';

/** What the trigger engine needs of the beat clock, read once a frame. */
export interface ClockView {
  /** The beat period, ms; 0 while the clock has none. */
  period: number;
  /** When the clock expects the next beat, ms, on the same clock as `now`. */
  nextBeat: number;
  /** Whether the show trusts the clock enough to run ahead of the microphone (`BeatClock.isLocked`). */
  locked: boolean;
  /** How far ahead of the heard beat a predicted one fires, ms: the Beat Lead setting. */
  leadMs: number;
}

/** One trigger, fired. */
export interface SoundFire {
  binding: SoundBinding;
  /** When it fired, ms. */
  at: number;
  /** From the beat clock, ahead of the sound, rather than on the heard onset. */
  predicted: boolean;
}

/**
 * How near a beat an onset has to be to be that beat, as a share of the period.
 *
 * A fifth: 100 ms at 120 bpm. Wide enough for the gap between the clock's own
 * detector and a source's (they hear the same frame through different
 * detectors, a frame or two apart) and for a drummer's push and pull; narrow
 * enough that a sixteenth, a quarter of the beat away, is its own hit and
 * not swallowed as the beat's.
 */
const NEAR = 0.2;
/** With no clock, an onset absorbs nothing, but the pattern still needs a window. */
const NEAR_NO_CLOCK_MS = 60;
/** The music is sounding when the level reached this in the last half beat. See the file comment. */
const SOUNDING = 0.1;
/** How long a heard onset is remembered for the pattern: four beats at 60 bpm, with room. */
const HISTORY_MS = 5000;
/**
 * An onset older than this when first seen is history, not a hit: it is what
 * a source carried before a binding on it existed, or before the show
 * resumed, and firing it would be firing something that happened a while ago.
 */
const STALE_MS = 250;

interface SourceState {
  /** The `at` last seen on this source's onset, seconds, to tell a new onset from the same one. */
  lastAt: number | null;
  /** Heard onset times, ms, newest last. */
  heard: number[];
  /** Beats fired ahead of the sound whose heard onset has not yet arrived, ms. */
  pending: number[];
}

const isNamed = (s: MusicSource): s is SourceName => s !== 'beat' && s !== 'bar';

export class SoundLearn {
  private sources = new Map<SourceName, SourceState>();
  /** The beat last decided on, ms; each of the clock's beats is considered once. */
  private decided = -Infinity;
  /** Beats since the clock locked, for `bar`; -1 while it is not locked. */
  private beatIndex = -1;
  /** Recent (time, level) pairs, for "has the music been sounding". */
  private levels: { t: number; level: number }[] = [];
  private patchesFor: readonly SoundBinding[] | null = null;
  private patches: SceneMapping[] = [];

  /** Forget everything: the pattern, the pending beats, the bar count. */
  reset(): void {
    this.sources.clear();
    this.decided = -Infinity;
    this.beatIndex = -1;
    this.levels = [];
  }

  /**
   * The mappings, as patch cords for the patch bay.
   *
   * Remembered by the bindings array itself, which the MIDI hook replaces
   * whenever the map changes and never otherwise, so the render loop asks
   * every frame and gets the same array back without building one.
   */
  patchesOf(bindings: readonly SoundBinding[] | undefined): readonly SceneMapping[] {
    if (!bindings || bindings.length === 0) return EMPTY;
    if (bindings === this.patchesFor) return this.patches;
    this.patchesFor = bindings;
    this.patches = bindings.filter(b => isMapping(b) && isNamed(b.source) && b.target.kind === 'setting').map(b => ({
      source: 'bands' as const,
      feature: b.source as SourceName,
      setting: (b.target as { key: SceneMapping['setting'] }).key,
      depth: b.depth ?? 0,
      layer: 'all' as const,
    }));
    return this.patches;
  }

  /**
   * One frame: which triggers fire now.
   *
   * `reading` is the analyser's reading for this frame, or null when there is
   * no music to hear (no input, or the show paused). `clock` is the beat
   * clock, or null where there is none. Only triggers are looked at; mappings
   * are the patch bay's.
   */
  step(now: number, reading: AudioReading | null, clock: ClockView | null, bindings: readonly SoundBinding[] | undefined): SoundFire[] {
    const fired: SoundFire[] = [];
    if (!reading) { this.reset(); return fired; }
    const triggers = bindings ? bindings.filter(b => !isMapping(b)) : [];
    if (triggers.length === 0) return fired;

    const period = clock && clock.period > 0 ? clock.period : 0;
    const near = period > 0 ? period * NEAR : NEAR_NO_CLOCK_MS;
    const fire = (source: MusicSource, predicted: boolean) => {
      for (const b of triggers) if (b.source === source) fired.push({ binding: b, at: now, predicted });
    };

    // How loud the music has been lately, for the prediction's "is anything
    // playing" test. Kept for half a beat (a quarter second with no beat).
    this.levels.push({ t: now, level: reading.level });
    const keep = (period > 0 ? period : 500) * 0.5;
    while (this.levels.length > 1 && now - this.levels[0].t > keep) this.levels.shift();
    const sounding = this.levels.some(l => l.level >= SOUNDING);

    // ── What was heard ─────────────────────────────────────────────
    const used = new Set<SourceName>();
    for (const b of triggers) if (isNamed(b.source)) used.add(b.source);
    for (const name of used) {
      const st = this.state(name);
      const at = reading.onsets[name]?.at ?? null;
      if (at === null || at === st.lastAt) continue;
      st.lastAt = at;
      const t = at * 1000;
      if (now - t > STALE_MS) continue;
      st.heard.push(t);
      while (st.heard.length > 0 && now - st.heard[0] > HISTORY_MS) st.heard.shift();
      // Already fired for, ahead of the sound: this is that hit arriving.
      const i = st.pending.findIndex(b => Math.abs(t - b) <= near);
      if (i >= 0) { st.pending.splice(i, 1); continue; }
      fire(name, false);
    }

    // ── What the clock says is coming ──────────────────────────────
    const locked = !!clock && clock.locked && period > 0 && clock.nextBeat > 0;
    if (!locked) {
      this.beatIndex = -1;
      this.decided = -Infinity;
    } else {
      const beat = clock.nextBeat;
      // A beat the clock has moved on to, not the one already decided (the
      // clock re-times its prediction a few milliseconds on every heard beat).
      if (beat - this.decided > period * 0.5 && now >= beat - Math.max(0, clock.leadMs)) {
        this.decided = beat;
        this.beatIndex++;
        if (sounding) {
          fire('beat', true);
          if (this.beatIndex % 4 === 0) fire('bar', true);
          for (const name of used) {
            const st = this.state(name);
            if (!this.expects(st, beat, period, near)) continue;
            st.pending.push(beat);
            fire(name, true);
          }
        }
      }
    }
    // A predicted beat whose sound never came is let go once it is past, so
    // it cannot absorb a later, real hit.
    for (const name of used) {
      const st = this.state(name);
      while (st.pending.length > 0 && now - st.pending[0] > near * 2) st.pending.shift();
    }
    return fired;
  }

  /** Is this source expected on `beat`? See "Which beats a source is expected on". */
  private expects(st: SourceState, beat: number, period: number, near: number): boolean {
    const heardNear = (t: number) => st.heard.some(h => Math.abs(h - t) <= near);
    // Heard on this beat already (the clock ran late, or the lead is zero):
    // it has fired, and must not fire again.
    if (heardNear(beat)) return false;
    const on = (k: number) => heardNear(beat - k * period);
    if (on(1) && on(2)) return true;                       // every beat
    // Every other beat, and only that: heard two and four beats back and
    // *not* one and three. Without the "not three", a kick that had been on
    // every beat and stopped would look like an every-other-beat pattern one
    // beat later (silent last beat, hits two and four back) and be promised a
    // second time; measured in a breakdown where the drums drop out under a
    // pad (`npm run learn`), which is exactly when it would show.
    return !on(1) && on(2) && !on(3) && on(4);
  }

  private state(name: SourceName): SourceState {
    let s = this.sources.get(name);
    if (!s) { s = { lastAt: null, heard: [], pending: [] }; this.sources.set(name, s); }
    return s;
  }
}

const EMPTY: readonly SceneMapping[] = [];

