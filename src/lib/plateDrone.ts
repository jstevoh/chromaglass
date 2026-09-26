/**
 * The plate playing itself: a drone voiced by the dye on the glass.
 *
 * Lifted in spirit from Chromesthesia, the sibling app that scans an image and
 * sounds it — four voices through a lowpass into a reverb, with sub-oscillators
 * underneath and an LFO moving it. What that app scans is a picture somebody
 * brought. This scans the plate, which is already moving, so the instrument
 * has a player without anyone being asked to be one.
 *
 * It hands back a `MediaStream`, which is the whole trick: downstream it is a
 * source like a microphone or a shared tab, so the analyser, the room
 * calibration and the beat clock all run on it unchanged, and the show
 * responds to it exactly as it would to a band.
 *
 * ── The loop, on purpose ──────────────────────────────────────────────
 *
 * The plate voices the drone; the drone drives the show; the show moves the
 * plate. That is a feedback loop and it would howl if it were fast, in just
 * the way a microphone in front of its own speaker does. It is slowed on
 * purpose instead of cut: the reading is taken at `READ_HZ` and smoothed hard
 * (`SMOOTHING`), so the sound follows the plate's weather over seconds rather
 * than its surface frame by frame. Every voice change is a `setTargetAtTime`
 * glide, never a step, for the same reason and also because steps click.
 */

export const SCALES = {
  'Pentatonic Minor': [0, 3, 5, 7, 10],
  'Pentatonic Major': [0, 2, 4, 7, 9],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Major: [0, 2, 4, 5, 7, 9, 11],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
} as const;

export type ScaleName = keyof typeof SCALES;
export const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
export type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';

export interface DroneParams {
  /** 0–11, C upward. */
  root: number;
  scale: ScaleName;
  /** How many voices sound, 1–4. Fewer is a held chord; four is a wash. */
  voices: number;
  wave: Wave;
  /** Where the voices sit, in octaves above the root at 55 Hz. */
  octave: number;
  /** Lowpass, 80–8000 Hz. The plate opens and closes it as it wets and dries. */
  cutoff: number;
  /** Lowpass resonance, 0.5–14. */
  resonance: number;
  /** Weight underneath: square oscillators an octave down, 0–1. */
  sub: number;
  /** How far the LFO moves the voices, in cents. */
  drift: number;
  /** Seconds of tail, 0 for none. */
  reverb: number;
  /** Master level, 0–1. */
  level: number;
}

export const DRONE_DEFAULTS: DroneParams = {
  root: 9,                 // A: low A sits under most rooms without booming
  scale: 'Pentatonic Minor',
  voices: 3,
  wave: 'sine',
  octave: 2,
  cutoff: 900,
  resonance: 2,
  sub: 0.35,
  drift: 14,
  reverb: 2.6,
  level: 0.7,
};

/** What the plate tells the instrument. All 0–1 except `colour`, which is 0–1 each. */
export interface PlateReading {
  /** Mean dye. Drives how much of the chord is sounding and how open the filter is. */
  wetness: number;
  /** Mean colour on the glass. */
  colour: [number, number, number];
  /** Dye at a handful of places, one per voice. */
  cells: number[];
}

const READ_HZ = 6;
/** Heavy: the new reading is worth this much against everything before it. */
const SMOOTHING = 0.12;
const VOICES = 4;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Hue 0–1 from rgb, and how far from grey it is. */
export function hueOf(r: number, g: number, b: number): { hue: number; sat: number } {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6 || mx < 1e-6) return { hue: 0, sat: 0 };
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { hue: ((h / 6) % 1 + 1) % 1, sat: d / mx };
}

/** The n-th degree of a scale, in Hz, from a root at 55 Hz × 2^octave. */
export function degreeHz(root: number, scale: ScaleName, octave: number, degree: number): number {
  const steps = SCALES[scale];
  const within = ((degree % steps.length) + steps.length) % steps.length;
  const over = Math.floor(degree / steps.length);
  const semitones = root + steps[within] + over * 12;
  return 55 * Math.pow(2, octave) * Math.pow(2, semitones / 12);
}

/** A soft room, made rather than fetched: noise with an exponential decay. */
function reverbImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      // A little brightness off the front, dark by the end.
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.4);
    }
  }
  return buf;
}

export interface Drone {
  /** Feed this to the analyser; it is a source like any other. */
  readonly stream: MediaStream;
  /** Also heard in the room, so a shared tab carries it. */
  setParams(p: Partial<DroneParams>): void;
  params(): DroneParams;
  /** What it is sounding right now, for the panel to show. */
  voices(): { hz: number; level: number }[];
  stop(): void;
}

/**
 * Build the instrument and start it. `read` is called a few times a second and
 * must be cheap — it is the plate's own numbers, not a photograph.
 */
export function startPlateDrone(read: () => PlateReading | null, initial?: Partial<DroneParams>): Drone {
  const ctx = new AudioContext();
  let p: DroneParams = { ...DRONE_DEFAULTS, ...initial };

  const dest = ctx.createMediaStreamDestination();
  const master = ctx.createGain();
  master.gain.value = p.level;

  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const verb = ctx.createConvolver();
  verb.buffer = reverbImpulse(ctx, Math.max(0.2, p.reverb));
  wet.gain.value = p.reverb > 0 ? 0.35 : 0;
  dry.gain.value = 1;

  master.connect(dry); dry.connect(dest);
  master.connect(wet); wet.connect(verb); verb.connect(dest);
  // The room hears it too, or a shared tab would carry a silent picture.
  master.connect(dry); dry.connect(ctx.destination);
  wet.connect(verb); verb.connect(ctx.destination);

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine';
  lfo.frequency.value = 0.06;
  lfoGain.gain.value = p.drift;
  lfo.connect(lfoGain);
  lfo.start();

  const voices = Array.from({ length: VOICES }, (_, i) => {
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const subGain = ctx.createGain();
    const pan = ctx.createStereoPanner();

    osc.type = p.wave;
    sub.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = p.cutoff;
    filter.Q.value = p.resonance;
    gain.gain.value = 0;
    subGain.gain.value = 0;
    // Spread across the room so four voices are a chord and not a lump.
    pan.pan.value = (i / (VOICES - 1)) * 1.4 - 0.7;

    lfoGain.connect(osc.detune);
    osc.connect(filter);
    sub.connect(subGain);
    subGain.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(master);
    osc.start();
    sub.start();
    return { osc, sub, filter, gain, subGain, pan, hz: 0, level: 0 };
  });

  // Smoothed plate, so the loop through the show cannot run away.
  let wetness = 0, hue = 0, sat = 0;
  const cells = new Array(VOICES).fill(0);

  const tick = () => {
    const r = read();
    if (!r) return;
    const k = SMOOTHING;
    wetness += (clamp(r.wetness, 0, 2) - wetness) * k;
    const h = hueOf(...r.colour);
    // Hue wraps, so it is moved the short way round rather than across the wheel.
    let dh = h.hue - hue;
    if (dh > 0.5) dh -= 1; else if (dh < -0.5) dh += 1;
    hue = (hue + dh * k + 1) % 1;
    sat += (h.sat - sat) * k;
    for (let i = 0; i < VOICES; i++) cells[i] += ((r.cells[i] ?? 0) - cells[i]) * k;

    const t = ctx.currentTime;
    const glide = 0.35;
    const steps = SCALES[p.scale].length;
    for (let i = 0; i < VOICES; i++) {
      const v = voices[i];
      const sounding = i < p.voices;
      /*
        Hue chooses the chord, the plate's own places choose who sings.

        The colour on the glass picks a degree to build from, so a plate that
        drifts from cobalt to orange changes key rather than only changing
        loudness; each voice then takes a degree above that, and how wet its
        own patch is decides whether it is heard at all.
      */
      const base = Math.round(hue * steps);
      const degree = base + i * 2;
      const hz = degreeHz(p.root, p.scale, p.octave, degree);
      v.hz = hz;
      v.osc.frequency.setTargetAtTime(hz, t, glide);
      v.sub.frequency.setTargetAtTime(hz / 2, t, glide);

      const lit = clamp(cells[i] * 1.6, 0, 1);
      const level = sounding ? clamp(0.06 + lit * 0.5, 0, 0.6) * clamp(wetness * 1.2, 0.15, 1) : 0;
      v.level = level;
      v.gain.gain.setTargetAtTime(level, t, glide);
      v.subGain.gain.setTargetAtTime(level * p.sub, t, glide);
      // A wetter plate opens up; saturated colour adds a little bite.
      v.filter.frequency.setTargetAtTime(
        clamp(p.cutoff * (0.5 + wetness * 0.9 + sat * 0.35), 80, 12000), t, glide);
    }
  };

  const timer = setInterval(tick, 1000 / READ_HZ);
  tick();
  void ctx.resume();

  return {
    stream: dest.stream,
    setParams(next: Partial<DroneParams>) {
      p = { ...p, ...next };
      const t = ctx.currentTime;
      master.gain.setTargetAtTime(p.level, t, 0.1);
      lfoGain.gain.setTargetAtTime(p.drift, t, 0.1);
      wet.gain.setTargetAtTime(p.reverb > 0 ? 0.35 : 0, t, 0.1);
      if (next.reverb !== undefined && next.reverb > 0) verb.buffer = reverbImpulse(ctx, next.reverb);
      for (const v of voices) {
        v.osc.type = p.wave;
        v.filter.Q.setTargetAtTime(p.resonance, t, 0.1);
      }
      tick();
    },
    params: () => ({ ...p }),
    voices: () => voices.map(v => ({ hz: v.hz, level: v.level })),
    stop() {
      clearInterval(timer);
      for (const v of voices) { try { v.osc.stop(); v.sub.stop(); } catch { /* already stopped */ } }
      try { lfo.stop(); } catch { /* already stopped */ }
      void ctx.close();
    },
  };
}
