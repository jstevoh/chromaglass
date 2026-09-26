/**
 * The plate playing itself: a small band voiced by the dye on the glass.
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
  /** How many voices sound in the pad, 1–4. Fewer is a held chord; four is a wash. */
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
  /** The bass: a plucked root whose pulse follows how fast the plate moves, 0–1. */
  bass: number;
  /** The bells: a note rung wherever dye arrives on the ring of places read, 0–1. */
  bells: number;
  /** The air: breath through a band that opens as the plate stirs, 0–1. */
  air: number;
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
  bass: 0.5,
  bells: 0.6,
  air: 0.3,
};

/** What the plate tells the instrument. All 0–1 except `colour`, which is 0–1 each. */
export interface PlateReading {
  /** Mean dye. Drives how much of the chord is sounding and how open the filter is. */
  wetness: number;
  /** Mean colour on the glass. */
  colour: [number, number, number];
  /** Dye at places round a ring: the first PAD for the pad, all of them for the bells. */
  cells: number[];
  /** Mean speed of the flow, in the solver's units (the instrument scales it itself). */
  flow?: number;
  /** Mean turn of the flow about the middle, signed. */
  swirl?: number;
}

/** How many places on the plate are read: four light the pad, all ring the bells. */
export const PLATE_PLACES = 12;
const READ_HZ = 15;
/**
  Heavy: the new reading is worth this much against everything before it.
  0.12 at six reads a second, the same time constant at fifteen.
*/
const SMOOTHING = 1 - Math.pow(1 - 0.12, 6 / READ_HZ);
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

  /*
    The rest of the band.

    One chord, however well voiced, is a drone, and a drone was what this was
    (reported: "It can't just have a simple drone"). The plate has more going
    on than its mean colour, so more of it is heard: the bass pulses at a
    rate the plate's speed sets, a bell rings wherever dye arrives at one of
    the places read, and the air breathes louder and brighter as the plate
    is stirred. Each still reads slowly or is a single event, so the loop
    through the show stays tame.
  */
  const bus = (level: number) => { const g = ctx.createGain(); g.gain.value = level; g.connect(master); return g; };
  const bassBus = bus(p.bass * 0.5);
  const bellBus = bus(p.bells * 0.35);
  const airBus = bus(p.air * 0.25);

  const bassOsc = ctx.createOscillator();
  const bassFilter = ctx.createBiquadFilter();
  const bassEnv = ctx.createGain();
  bassOsc.type = 'triangle';
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 320;
  bassFilter.Q.value = 3;
  bassEnv.gain.value = 0;
  bassOsc.connect(bassFilter); bassFilter.connect(bassEnv); bassEnv.connect(bassBus);
  bassOsc.start();

  // Breath: a loop of noise through a band the flow moves.
  const noise = ctx.createBufferSource();
  {
    const n = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;
  }
  const airBand = ctx.createBiquadFilter();
  const airEnv = ctx.createGain();
  const airPan = ctx.createStereoPanner();
  airBand.type = 'bandpass';
  airBand.frequency.value = 600;
  airBand.Q.value = 1.6;
  airEnv.gain.value = 0;
  noise.connect(airBand); airBand.connect(airEnv); airEnv.connect(airPan); airPan.connect(airBus);
  noise.start();

  /** A struck bell: a sine and an inharmonic partial, dying away, placed in the room. */
  const ring = (hz: number, vel: number, panAt: number) => {
    const t = ctx.currentTime;
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp(panAt, -0.9, 0.9);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.008);
    env.gain.setTargetAtTime(0, t + 0.01, 0.45 + 0.5 * (1 - vel));
    env.connect(pan); pan.connect(bellBus);
    const partials: [number, number][] = [[1, 1], [2.76, 0.35], [5.4, 0.12]];
    for (const [ratio, amp] of partials) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = hz * ratio;
      g.gain.value = amp;
      o.connect(g); g.connect(env);
      o.start(t);
      o.stop(t + 4);
      o.onended = () => { try { g.disconnect(); } catch { /* gone */ } };
    }
    setTimeout(() => { try { env.disconnect(); pan.disconnect(); } catch { /* gone */ } }, 4500);
  };

  // Smoothed plate, so the loop through the show cannot run away.
  let wetness = 0, hue = 0, sat = 0, flow = 0, swirl = 0;
  /** The flow's own scale, found as it goes: the loudest it has been lately. */
  let flowTop = 1e-4;
  const cells = new Array(VOICES).fill(0);
  // Each place's level, quick and slow: a bell rings where the quick one
  // climbs past the slow one, which is dye arriving rather than dye there.
  const quick = new Array(PLATE_PLACES).fill(0);
  const slow = new Array(PLATE_PLACES).fill(0);
  const lastRung = new Array(PLATE_PLACES).fill(-10);
  let lastBell = -10;
  let nextPulse = 0;
  let pulseStep = 0;
  let primed = false;

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
    // The pad reads every third place, so its four voices are spread round the ring.
    for (let i = 0; i < VOICES; i++) cells[i] += ((r.cells[(i * PLATE_PLACES / VOICES) % Math.max(1, r.cells.length)] ?? 0) - cells[i]) * k;
    const rawFlow = Number.isFinite(r.flow) ? Math.max(0, r.flow ?? 0) : 0;
    flowTop = Math.max(rawFlow, flowTop * 0.997, 1e-4);
    flow += (clamp(rawFlow / flowTop, 0, 1) - flow) * 0.08;
    const rawSwirl = Number.isFinite(r.swirl) ? (r.swirl ?? 0) / flowTop : 0;
    swirl += (clamp(rawSwirl, -1, 1) - swirl) * 0.05;

    const t = ctx.currentTime;
    const glide = 0.35;
    const steps = SCALES[p.scale].length;
    const base = Math.round(hue * steps);
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

    /*
      The bass: the chord's root two octaves under the pad, plucked. Slow on a
      still plate (a note every two seconds), up to four a second when it is
      stirred hard, and every fourth pulse walks to the fifth of the chord so
      it is a line and not a metronome.
    */
    if (t >= nextPulse) {
      const interval = 2.0 - 1.75 * flow;
      nextPulse = Math.max(t, nextPulse) + interval;
      const deg = base + (pulseStep % 4 === 3 ? Math.min(4, steps - 1) : 0);
      pulseStep++;
      const bhz = degreeHz(p.root, p.scale, Math.max(0, p.octave - 2), deg);
      bassOsc.frequency.setTargetAtTime(bhz, t, 0.02);
      const vel = clamp(0.35 + 0.65 * Math.min(1, wetness * 1.5), 0, 1);
      bassEnv.gain.cancelScheduledValues(t);
      bassEnv.gain.setTargetAtTime(vel, t, 0.01);
      bassEnv.gain.setTargetAtTime(0, t + 0.06, Math.min(0.5, interval * 0.35));
      bassFilter.frequency.setTargetAtTime(180 + 900 * flow + 400 * sat, t, 0.05);
    }

    /*
      The bells: one per place round the ring, each its own degree of the
      scale going round (so dye travelling round the plate plays a run), rung
      where dye arrives there. At most one every 140 ms in all and one a
      second at any place, so a wave of fresh dye is a phrase, not a roll.
    */
    for (let i = 0; i < PLATE_PLACES; i++) {
      const v = Number.isFinite(r.cells[i]) ? r.cells[i] : 0;
      quick[i] += (v - quick[i]) * 0.5;
      slow[i] += (v - slow[i]) * 0.04;
      const rise = quick[i] - slow[i];
      if (primed && p.bells > 0.001 && rise > 0.05 + 0.1 * slow[i] && t - lastRung[i] > 1 && t - lastBell > 0.14) {
        lastRung[i] = t; lastBell = t;
        const deg = base + Math.round((i / PLATE_PLACES) * steps * 2);
        const bhz = degreeHz(p.root, p.scale, p.octave + 2, deg);
        ring(bhz, clamp(rise * 3, 0.25, 1), Math.cos((i / PLATE_PLACES) * Math.PI * 2) * 0.8);
      }
    }
    primed = true;

    // The air: louder and brighter the harder the plate moves, carried round the room by its turn.
    airEnv.gain.setTargetAtTime(0.05 + 0.95 * flow * flow, t, 0.4);
    airBand.frequency.setTargetAtTime(300 + 2600 * flow + 900 * sat, t, 0.4);
    airPan.pan.setTargetAtTime(clamp(swirl * 1.5, -0.8, 0.8), t, 0.6);
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
      bassBus.gain.setTargetAtTime(p.bass * 0.5, t, 0.1);
      bellBus.gain.setTargetAtTime(p.bells * 0.35, t, 0.1);
      airBus.gain.setTargetAtTime(p.air * 0.25, t, 0.1);
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
      try { lfo.stop(); bassOsc.stop(); noise.stop(); } catch { /* already stopped */ }
      void ctx.close();
    },
  };
}
