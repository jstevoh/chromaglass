/**
 * Modulators: shapes to plug into the patch bay.
 *
 * The patch bay already had the hard part — a source, a destination, a bipolar
 * depth, summed across patches, folded per plate and clamped to each setting's
 * travel. What it did not have was anything to plug in that was not a *sensor*.
 * Room, film and sound all answer "what is happening out there", and a show
 * often wants the other thing: a shape that is happening because you said so.
 *
 * Four LFOs and two envelopes, which is the set a hardware synth settled on
 * long ago for good reasons.
 *
 * ## The LFOs run on bars, not on seconds
 *
 * A free-running LFO against music is a phaser: it drifts in and out of time
 * and everything it touches looks almost-but-not-quite deliberate. The app
 * already knows the tempo — from MIDI clock, from a tap, or from the beat
 * clock listening — so the LFOs are divisions of a bar and stay put against
 * it. With no tempo at all they fall back to the same rates in seconds at 120,
 * which is a guess but a stable one.
 *
 * ## The envelopes are fired, not free
 *
 * They do nothing until something fires them, which is what makes them
 * different from a fifth LFO. A MIDI note fires both; so does a pad, a phone
 * tap, or anything else that calls `fire`. One is short and one is long, so a
 * single press can do a snap and a swell at once.
 */
// With the extension: `npm run shapes` loads this file straight into node
// with --experimental-strip-types, which resolves nothing it is not told the
// exact name of. The other libraries reach rng through esbuild or vite and
// can leave it off; this one is read by node itself.
import { stream } from './rng.ts';

/** What a patch can name on the `shape` source. */
export type ModulatorFeature = 'lfo1' | 'lfo2' | 'lfo3' | 'lfo4' | 'env1' | 'env2';
export type LfoId = 'lfo1' | 'lfo2' | 'lfo3' | 'lfo4';
export type EnvelopeId = 'env1' | 'env2';

export const MODULATOR_FEATURES: ModulatorFeature[] = ['lfo1', 'lfo2', 'lfo3', 'lfo4', 'env1', 'env2'];

/** The bar divisions an LFO may run at (from a quarter-bar beat to sixteen bars). */
export const LFO_BARS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;
export type LfoBars = typeof LFO_BARS[number];

/** The shapes an LFO may trace over its cycle. */
export const LFO_SHAPES = ['sine', 'triangle', 'ramp', 'stepped', 'smooth'] as const;
export type LfoShape = typeof LFO_SHAPES[number];

/** What may restart an LFO's cycle on a hit or note. */
export const LFO_TRIGGERS = ['none', 'kick', 'snare', 'note', 'pad'] as const;
export type LfoTrigger = typeof LFO_TRIGGERS[number] | null;

/** What may fire an envelope. */
export const ENVELOPE_TRIGGERS = ['any', 'kick', 'snare', 'note', 'pad'] as const;
export type EnvelopeTrigger = typeof ENVELOPE_TRIGGERS[number];

/** Snap any bar count to the closest musical bar division in `LFO_BARS`. */
export function nearestLfoBars(bars: number): LfoBars {
  if (!Number.isFinite(bars)) return 1;
  let best: LfoBars = LFO_BARS[0];
  let bestDist = Math.abs(bars - best);
  for (const b of LFO_BARS) {
    const d = Math.abs(bars - b);
    if (d < bestDist) { best = b; bestDist = d; }
  }
  return best;
}

export function formatLfoBars(bars: number): string {
  const b = nearestLfoBars(bars);
  if (b === 0.25) return '¼ bar';
  if (b === 0.5) return '½ bar';
  if (b === 1) return 'one bar';
  if (b === 2) return 'two bars';
  if (b === 4) return 'four bars';
  if (b === 8) return 'eight bars';
  return 'sixteen bars';
}

const DEFAULT_LABELS: Record<ModulatorFeature, string> = {
  lfo1: 'LFO 1 — sine, eight bars',
  lfo2: 'LFO 2 — sine, two bars',
  lfo3: 'LFO 3 — triangle, one bar',
  lfo4: 'LFO 4 — stepped, every beat',
  env1: 'Envelope 1 — snap',
  env2: 'Envelope 2 — swell',
};

/** What each one is, for a panel to print without knowing the arithmetic. */
export const MODULATOR_LABELS: Record<ModulatorFeature, string> = { ...DEFAULT_LABELS };

function lfoLabel(id: LfoId, o: { bars: number; shape: LfoShape; restart?: LfoTrigger }): string {
  const n = id.slice(3);
  const shapeWord = o.shape === 'smooth' ? 'smoothed random' : o.shape;
  const rateWord = o.bars === 0.25 && o.shape === 'stepped' ? 'every beat' : formatLfoBars(o.bars);
  const rst = o.restart && o.restart !== 'none' ? ` (${o.restart})` : '';
  return `LFO ${n} — ${shapeWord}, ${rateWord}${rst}`;
}

function envLabel(id: EnvelopeId, o: { attack: number; decay: number; on?: EnvelopeTrigger }): string {
  const n = id.slice(3);
  const on = o.on ?? 'any';
  const def = id === 'env1'
    ? Math.abs(o.attack - 0.012) < 1e-4 && Math.abs(o.decay - 0.28) < 1e-4 && on === 'any'
    : Math.abs(o.attack - 0.09) < 1e-4 && Math.abs(o.decay - 1.6) < 1e-4 && on === 'any';
  if (def) return DEFAULT_LABELS[id];
  const ms = Math.round(o.attack * 1000);
  const dec = o.decay >= 1 ? `${o.decay.toFixed(1).replace(/\.0$/, '')} s` : `${Math.round(o.decay * 1000)} ms`;
  return `Envelope ${n} — ${ms} ms / ${dec}${on !== 'any' ? ` (${on})` : ''}`;
}

/** Subset of `VisualizerSettings` read to keep the modulators in step with the desk. */
export interface ModulatorSettingsSlice {
  lfo1Bars?: number; lfo1Shape?: number; lfo1Restart?: number;
  lfo2Bars?: number; lfo2Shape?: number; lfo2Restart?: number;
  lfo3Bars?: number; lfo3Shape?: number; lfo3Restart?: number;
  lfo4Bars?: number; lfo4Shape?: number; lfo4Restart?: number;
  env1Attack?: number; env1Decay?: number; env1On?: number;
  env2Attack?: number; env2Decay?: number; env2On?: number;
}

/** Keep `MODULATOR_LABELS` in step with the desk's settings even while paused. */
export function syncModulatorLabels(s: ModulatorSettingsSlice): void {
  const lfos: readonly [LfoId, number, number, number][] = [
    ['lfo1', s.lfo1Bars ?? 8, s.lfo1Shape ?? 0, s.lfo1Restart ?? 0],
    ['lfo2', s.lfo2Bars ?? 2, s.lfo2Shape ?? 0, s.lfo2Restart ?? 0],
    ['lfo3', s.lfo3Bars ?? 1, s.lfo3Shape ?? 1, s.lfo3Restart ?? 0],
    ['lfo4', s.lfo4Bars ?? 0.25, s.lfo4Shape ?? 3, s.lfo4Restart ?? 0],
  ];
  for (const [id, b, sh, rs] of lfos) {
    const bars = nearestLfoBars(b);
    const shape = LFO_SHAPES[Math.max(0, Math.min(LFO_SHAPES.length - 1, Math.round(sh)))];
    const restart = LFO_TRIGGERS[Math.max(0, Math.min(LFO_TRIGGERS.length - 1, Math.round(rs)))];
    MODULATOR_LABELS[id] = lfoLabel(id, { bars, shape, restart });
  }
  const envs: readonly [EnvelopeId, number, number, number][] = [
    ['env1', s.env1Attack ?? 0.012, s.env1Decay ?? 0.28, s.env1On ?? 0],
    ['env2', s.env2Attack ?? 0.09, s.env2Decay ?? 1.6, s.env2On ?? 0],
  ];
  for (const [id, a, d, on] of envs) {
    const trig = ENVELOPE_TRIGGERS[Math.max(0, Math.min(ENVELOPE_TRIGGERS.length - 1, Math.round(on)))];
    MODULATOR_LABELS[id] = envLabel(id, { attack: a, decay: d, on: trig });
  }
}

/** Subset of `AudioReading` read to trigger kick and snare onsets. */
export interface ModulatorReadingSlice {
  time?: number;
  onsets?: {
    kick?: { at: number | null; last?: number; strength?: number };
    snare?: { at: number | null; last?: number; strength?: number };
  };
}

/** Bars per cycle for each LFO; lfo4 steps once a beat instead. */
const BARS = { lfo1: 8, lfo2: 2, lfo3: 1 } as const;
/** Attack and decay in seconds. */
const ENVS = { env1: { a: 0.012, d: 0.28 }, env2: { a: 0.09, d: 1.6 } } as const;
/** With no tempo to hold onto, this is the one assumed. */
const FALLBACK_BPM = 120;

export class Modulators {
  /** Phase 0..1 per LFO, advanced on wall-clock seconds against the tempo. */
  private phase = { lfo1: 0, lfo2: 0, lfo3: 0, lfo4: 0 };
  /** Where the stepped LFO is holding, and how far through its beat. */
  private held = 0.5;
  private beatPhase = 0;
  /** Seconds since each envelope was fired; -1 for one that never has been. */
  private fired = { env1: -1, env2: -1 };
  private rand: () => number;
  private custom = false;
  private lfo: Record<LfoId, { bars: number; shape: LfoShape; restart: LfoTrigger }> = {
    lfo1: { bars: 8, shape: 'sine', restart: null },
    lfo2: { bars: 2, shape: 'sine', restart: null },
    lfo3: { bars: 1, shape: 'triangle', restart: null },
    lfo4: { bars: 0.25, shape: 'stepped', restart: null },
  };
  private ph: Record<LfoId, number> = { lfo1: 0, lfo2: 0, lfo3: 0, lfo4: 0 };
  private rnd: Record<LfoId, { from: number; to: number; held: number }> = {
    lfo1: { from: 0.5, to: 0.5, held: 0.5 },
    lfo2: { from: 0.5, to: 0.5, held: 0.5 },
    lfo3: { from: 0.5, to: 0.5, held: 0.5 },
    lfo4: { from: 0.5, to: 0.5, held: 0.5 },
  };
  private env: Record<EnvelopeId, { a: number; d: number; on: EnvelopeTrigger }> = {
    env1: { a: ENVS.env1.a, d: ENVS.env1.d, on: 'any' },
    env2: { a: ENVS.env2.a, d: ENVS.env2.d, on: 'any' },
  };
  private vel: Record<EnvelopeId, number> = { env1: 1, env2: 1 };
  private cfg = {
    lfo1Bars: 8, lfo1Shape: 0, lfo1Restart: 0,
    lfo2Bars: 2, lfo2Shape: 0, lfo2Restart: 0,
    lfo3Bars: 1, lfo3Shape: 1, lfo3Restart: 0,
    lfo4Bars: 0.25, lfo4Shape: 3, lfo4Restart: 0,
    env1Attack: 0.012, env1Decay: 0.28, env1On: 0,
    env2Attack: 0.09, env2Decay: 1.6, env2On: 0,
  };
  private hitAt: { kick: number | null; snare: number | null } = { kick: null, snare: null };

  /**
   * The stepped LFO's next value: the show's `plate.modulators` stream, so a
   * patch riding lfo4 steps through the same values on a render of the same
   * seed (lib/rng.ts). Injectable for a check, as it always was.
   */
  constructor(random: () => number = stream('plate.modulators').float) {
    this.rand = random;
  }

  /** Set an LFO's bar rate, waveform shape, and optional restart trigger. */
  setLfo(id: LfoId, o: { bars: number; shape: LfoShape; restart?: LfoTrigger }): void {
    this.custom = true;
    const bars = o.bars > 0 ? o.bars : 1;
    const restart = o.restart && o.restart !== 'none' ? o.restart : null;
    this.lfo[id] = { bars, shape: o.shape, restart };
    this.ph[id] = 0;
    this.rnd[id] = { from: 0.5, to: this.rand(), held: this.rand() };
    MODULATOR_LABELS[id] = lfoLabel(id, { bars, shape: o.shape, restart });
  }

  /** Set an envelope's attack time, decay time, and trigger source. */
  setEnvelope(id: EnvelopeId, o: { attack: number; decay: number; on?: EnvelopeTrigger }): void {
    const a = Math.max(0.001, o.attack);
    const d = Math.max(0.001, o.decay);
    const on = o.on ?? 'any';
    this.env[id] = { a, d, on };
    MODULATOR_LABELS[id] = envLabel(id, { attack: a, decay: d, on });
  }

  /** Fire envelopes listening for `source` (or `'any'`) and restart LFOs synced to `source`. */
  trigger(source: Exclude<EnvelopeTrigger, 'any'>, velocity = 1): void {
    const v = Math.max(0, Math.min(1, velocity));
    for (const k of ['env1', 'env2'] as const) {
      if (this.env[k].on === source || this.env[k].on === 'any') {
        this.fired[k] = 0;
        this.vel[k] = v;
      }
    }
    for (const k of ['lfo1', 'lfo2', 'lfo3', 'lfo4'] as const) {
      if (this.lfo[k].restart === source) this.ph[k] = 0;
    }
  }

  /** Strike from a note or a pad (or both when unspecified). */
  strike(velocity = 1, source?: 'note' | 'pad'): void {
    if (source) {
      this.trigger(source, velocity);
    } else {
      this.trigger('note', velocity);
      this.trigger('pad', velocity);
    }
  }

  private sync(s: ModulatorSettingsSlice): void {
    const lfos: readonly [LfoId, number | undefined, number | undefined, number | undefined, 'lfo1Bars' | 'lfo2Bars' | 'lfo3Bars' | 'lfo4Bars', 'lfo1Shape' | 'lfo2Shape' | 'lfo3Shape' | 'lfo4Shape', 'lfo1Restart' | 'lfo2Restart' | 'lfo3Restart' | 'lfo4Restart'][] = [
      ['lfo1', s.lfo1Bars, s.lfo1Shape, s.lfo1Restart, 'lfo1Bars', 'lfo1Shape', 'lfo1Restart'],
      ['lfo2', s.lfo2Bars, s.lfo2Shape, s.lfo2Restart, 'lfo2Bars', 'lfo2Shape', 'lfo2Restart'],
      ['lfo3', s.lfo3Bars, s.lfo3Shape, s.lfo3Restart, 'lfo3Bars', 'lfo3Shape', 'lfo3Restart'],
      ['lfo4', s.lfo4Bars, s.lfo4Shape, s.lfo4Restart, 'lfo4Bars', 'lfo4Shape', 'lfo4Restart'],
    ];
    for (const [id, rawBars, rawShape, rawRestart, kB, kS, kR] of lfos) {
      const bars = rawBars !== undefined ? nearestLfoBars(rawBars) : this.cfg[kB];
      const sh = rawShape !== undefined ? Math.max(0, Math.min(LFO_SHAPES.length - 1, Math.round(rawShape))) : this.cfg[kS];
      const rs = rawRestart !== undefined ? Math.max(0, Math.min(LFO_TRIGGERS.length - 1, Math.round(rawRestart))) : this.cfg[kR];
      if (bars !== this.cfg[kB] || sh !== this.cfg[kS] || rs !== this.cfg[kR]) {
        this.cfg[kB] = bars;
        this.cfg[kS] = sh;
        this.cfg[kR] = rs;
        this.setLfo(id, { bars, shape: LFO_SHAPES[sh], restart: LFO_TRIGGERS[rs] });
      }
    }
    const envs: readonly [EnvelopeId, number | undefined, number | undefined, number | undefined, 'env1Attack' | 'env2Attack', 'env1Decay' | 'env2Decay', 'env1On' | 'env2On'][] = [
      ['env1', s.env1Attack, s.env1Decay, s.env1On, 'env1Attack', 'env1Decay', 'env1On'],
      ['env2', s.env2Attack, s.env2Decay, s.env2On, 'env2Attack', 'env2Decay', 'env2On'],
    ];
    for (const [id, rawA, rawD, rawOn, kA, kD, kO] of envs) {
      const a = rawA !== undefined ? Math.max(0.001, Math.min(2, rawA)) : this.cfg[kA];
      const d = rawD !== undefined ? Math.max(0.01, Math.min(8, rawD)) : this.cfg[kD];
      const on = rawOn !== undefined ? Math.max(0, Math.min(ENVELOPE_TRIGGERS.length - 1, Math.round(rawOn))) : this.cfg[kO];
      if (Math.abs(a - this.cfg[kA]) > 1e-6 || Math.abs(d - this.cfg[kD]) > 1e-6 || on !== this.cfg[kO]) {
        this.cfg[kA] = a;
        this.cfg[kD] = d;
        this.cfg[kO] = on;
        this.setEnvelope(id, { attack: a, decay: d, on: ENVELOPE_TRIGGERS[on] });
      }
    }
  }

  /** Advance by `dt` seconds at `bpm` (0 or absent for the fallback). */
  step(dt: number, bpm = 0, settings?: ModulatorSettingsSlice, heard?: ModulatorReadingSlice | null): void {
    if (settings) this.sync(settings);
    if (heard?.onsets) {
      for (const name of ['kick', 'snare'] as const) {
        const o = heard.onsets[name];
        if (!o || o.at === null || o.at === this.hitAt[name]) continue;
        const stale = this.hitAt[name] === null && heard.time !== undefined && o.at < heard.time - 1;
        this.hitAt[name] = o.at;
        if (!stale) this.trigger(name, o.last ?? o.strength ?? 1);
      }
    }
    const step = Math.max(0, Math.min(0.25, dt));
    const beats = (bpm > 20 && bpm < 300 ? bpm : FALLBACK_BPM) / 60 * step;
    const bars = beats / 4;
    this.phase.lfo1 = (this.phase.lfo1 + bars / BARS.lfo1) % 1;
    this.phase.lfo2 = (this.phase.lfo2 + bars / BARS.lfo2) % 1;
    this.phase.lfo3 = (this.phase.lfo3 + bars / BARS.lfo3) % 1;
    this.beatPhase += beats;
    // Stepped: a new value held flat until the next beat. The one modulator
    // here that is not smooth, because everything smooth is already covered
    // and a plate sometimes wants a jump.
    while (this.beatPhase >= 1) { this.beatPhase -= 1; this.held = this.rand(); }
    if (this.custom) {
      for (const k of ['lfo1', 'lfo2', 'lfo3', 'lfo4'] as const) {
        const n = this.ph[k] + bars / Math.max(0.0625, this.lfo[k].bars);
        if (n >= 1) {
          this.rnd[k].from = this.rnd[k].to;
          this.rnd[k].to = this.rand();
          this.rnd[k].held = this.rand();
        }
        this.ph[k] = n % 1;
      }
    }
    for (const k of ['env1', 'env2'] as const) if (this.fired[k] >= 0) this.fired[k] += step;
  }

  /** Fire envelopes left on `'any'` — a note, a pad, a tap. `velocity` scales them. */
  fire(velocity = 1): void {
    const v = Math.max(0, Math.min(1, velocity));
    this.velocity = v;
    for (const k of ['env1', 'env2'] as const) {
      if (this.env[k].on === 'any') {
        this.fired[k] = 0;
        this.vel[k] = v;
      }
    }
  }
  private velocity = 1;

  /** Every modulator's value, 0..1. */
  value(feature: ModulatorFeature): number {
    if (this.custom && (feature === 'lfo1' || feature === 'lfo2' || feature === 'lfo3' || feature === 'lfo4')) {
      const p = this.ph[feature];
      const s = this.lfo[feature].shape;
      const r = this.rnd[feature];
      if (s === 'sine') return 0.5 + 0.5 * Math.sin(p * Math.PI * 2);
      if (s === 'triangle') return 1 - Math.abs(p * 2 - 1);
      if (s === 'ramp') return p;
      if (s === 'stepped') return r.held;
      if (s === 'smooth') return r.from + (r.to - r.from) * (0.5 - 0.5 * Math.cos(Math.PI * p));
    }
    switch (feature) {
      // Sine and triangle mapped to 0..1: the patch's own depth is what makes
      // a modulation bipolar, so a source that went negative here would be
      // bipolar twice and reach half as far in one direction.
      case 'lfo1': return 0.5 + 0.5 * Math.sin(this.phase.lfo1 * Math.PI * 2);
      case 'lfo2': return 0.5 + 0.5 * Math.sin(this.phase.lfo2 * Math.PI * 2);
      case 'lfo3': return 1 - Math.abs(this.phase.lfo3 * 2 - 1);
      case 'lfo4': return this.held;
      case 'env1': case 'env2': {
        const t = this.fired[feature];
        if (t < 0) return 0;
        const { a, d } = this.env[feature];
        const v = this.vel[feature] ?? this.velocity;
        return (t < a ? t / a : Math.exp(-(t - a) / d)) * v;
      }
      default: return 0;
    }
  }

  /** True while anything is worth reading — an envelope that has died is not. */
  get live(): boolean { return true; }

  reset(): void {
    this.phase = { lfo1: 0, lfo2: 0, lfo3: 0, lfo4: 0 };
    this.ph = { lfo1: 0, lfo2: 0, lfo3: 0, lfo4: 0 };
    this.fired = { env1: -1, env2: -1 };
    this.beatPhase = 0;
    this.held = 0.5;
    this.hitAt = { kick: null, snare: null };
  }
}
