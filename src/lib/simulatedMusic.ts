/**
 * A band that is always in the room.
 *
 * The show is built to be driven by music, which used to mean that looking at
 * it at all meant handing the browser a microphone — and being asked for one
 * every time the page loaded. This synthesises something to listen to instead:
 * a kick on the floor, a snare on two and four, hats between them, a bassline
 * and a pad that changes chord, arranged into verses and choruses so the
 * sequencer, the beat clock and the song-structure work all have something
 * shaped like a song to chew on.
 *
 * It is deliberately a *stream*, not a set of numbers. Everything downstream —
 * the analyser, the room calibration, the beat clock's tempo lock, the band
 * mappings — then works exactly as it does on a microphone, and what you are
 * looking at in rehearsal is the real signal path rather than a mock of it.
 *
 * It is also silent. The destination node goes to a stream, not to the
 * speakers, so this can run all day next to someone working.
 *
 * Its noise and the hats' start offsets come from the show's `audio.sim`
 * stream (lib/rng.ts), not `Math.random`. It is a demo, and the choice was
 * whether a demo deserves a seed; it does, because the analyser listens to
 * it and the analyser drives the plate, so on the same seed the band that is
 * "always in the room" is at least the same band — and rendered offline, the
 * same signal.
 */
import { stream } from './rng';

export type Section = 'intro' | 'verse' | 'chorus' | 'break';

export interface SimulatedMusic {
  /** Hand this to the analyser exactly as a microphone's stream. */
  readonly stream: MediaStream;
  /** 0..1, for a meter. */
  level(): number;
  /** Where the arrangement has got to, for anything that wants to show it. */
  section(): Section;
  /** The browser will not let audio run before a gesture; call this on one. */
  resume(): Promise<void>;
  stop(): void;
}

/** Beats per minute. Slow enough to read, fast enough to look like a set. */
const BPM = 122;
/** Sixteenths per bar. */
const STEPS = 16;
/** How far ahead notes are scheduled, and how often that is topped up. */
const LOOKAHEAD = 0.12;
const TICK_MS = 25;

/** Bars per section, and the running order the arrangement loops round. */
const SECTION_BARS = 8;
const ARRANGEMENT: Section[] = [
  'intro', 'verse', 'chorus', 'verse', 'chorus', 'break', 'chorus', 'chorus',
];

/** Root notes per section, as semitones from A1. A minor key, because. */
const ROOTS = [0, -2, 3, -2, 3, 5, 3, 3];
/** The chord over the root, as semitone offsets. */
const CHORD = [0, 3, 7, 10];

const hz = (semitonesFromA1: number) => 55 * Math.pow(2, semitonesFromA1 / 12);

export function startSimulatedMusic(): SimulatedMusic {
  const AudioCtor: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtor();
  const dest = ctx.createMediaStreamDestination();

  // A little headroom under the limiter-ish curve: the analyser's calibration
  // wants dynamics to look at, not a signal already flattened.
  const master = ctx.createGain();
  master.gain.value = 0.5;
  const meter = ctx.createAnalyser();
  meter.fftSize = 512;
  master.connect(meter);
  master.connect(dest);

  // One noise buffer for every hat and snare, made once.
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  {
    const d = noise.getChannelData(0);
    const rng = stream('audio.sim');
    for (let i = 0; i < d.length; i++) d[i] = rng.signed();
  }

  const secondsPerStep = 60 / BPM / 4;
  let step = 0;
  let nextAt = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let current: Section = 'intro';

  /** An enveloped oscillator: the whole instrument kit is this and noise. */
  const tone = (
    at: number,
    type: OscillatorType,
    freq: number,
    dur: number,
    gain: number,
    sweepTo?: number,
    cutoff?: number,
  ) => {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), at + dur);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let tail: AudioNode = amp;
    if (cutoff !== undefined) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      amp.connect(lp);
      tail = lp;
    }
    osc.connect(amp);
    tail.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  };

  const hit = (at: number, dur: number, gain: number, type: BiquadFilterType, cutoff: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, at);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.start(at, stream('audio.sim').float() * 0.2);
    src.stop(at + dur + 0.02);
  };

  const schedule = (s: number, at: number) => {
    const bar = Math.floor(s / STEPS);
    const beat = s % STEPS;
    const slot = Math.floor(bar / SECTION_BARS) % ARRANGEMENT.length;
    const part = ARRANGEMENT[slot];
    current = part;
    const root = ROOTS[slot];
    const loud = part === 'chorus' ? 1 : part === 'verse' ? 0.75 : part === 'intro' ? 0.5 : 0.35;

    // ── Kick: four on the floor, and off in the break ──────────────
    if (part !== 'break' && beat % 4 === 0) {
      tone(at, 'sine', 120, 0.28, 0.9 * loud, 42);
      if (part === 'chorus' && beat === 12) tone(at + secondsPerStep * 2, 'sine', 120, 0.22, 0.7, 42);
    }
    // ── Snare on two and four ──────────────────────────────────────
    if (part !== 'intro' && part !== 'break' && (beat === 4 || beat === 12)) {
      hit(at, 0.16, 0.42 * loud, 'bandpass', 1900);
    }
    // ── Hats on the eighths, doubled in a chorus ───────────────────
    if (beat % 2 === 0 || (part === 'chorus' && beat % 1 === 0)) {
      hit(at, 0.045, (beat % 4 === 0 ? 0.1 : 0.16) * loud, 'highpass', 7200);
    }
    // ── Bass: root, fifth, octave, with a walk into the bar ────────
    if (part !== 'break' && beat % 4 === 0) {
      const note = beat === 0 ? 0 : beat === 8 ? 7 : beat === 12 ? 10 : 0;
      tone(at, 'sawtooth', hz(root + note), secondsPerStep * 3.4, 0.5 * loud, undefined, part === 'chorus' ? 900 : 480);
    }
    // ── Pad: the chord, once a bar, held ───────────────────────────
    if (beat === 0) {
      for (const interval of CHORD) {
        tone(at, 'triangle', hz(root + interval + 24), secondsPerStep * STEPS * 0.95, 0.075 * loud, undefined, 2400);
      }
    }
  };

  const pump = () => {
    const horizon = ctx.currentTime + LOOKAHEAD;
    while (nextAt < horizon) {
      schedule(step, nextAt);
      step++;
      nextAt += secondsPerStep;
    }
  };

  const bins = new Uint8Array(meter.frequencyBinCount);

  const start = () => {
    if (timer) return;
    nextAt = ctx.currentTime + 0.05;
    timer = setInterval(pump, TICK_MS);
    pump();
  };

  // A context made outside a gesture starts suspended; `resume` is called on
  // the click that chose this source, and again on the first gesture after a
  // reload restored it.
  void ctx.resume().then(start).catch(start);

  return {
    stream: dest.stream,
    level() {
      meter.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = 0; i < bins.length; i++) sum += bins[i];
      return sum / bins.length / 255;
    },
    section: () => current,
    async resume() {
      await ctx.resume().catch(() => {});
      start();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      dest.stream.getTracks().forEach(t => t.stop());
      void ctx.close().catch(() => {});
    },
  };
}
