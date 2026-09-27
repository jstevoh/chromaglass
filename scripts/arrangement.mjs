/**
 * Songs with a shape, synthesised, so the truth about them is known to the
 * sample: where each section starts, where the beat comes back in, which beat
 * is the one, where the fills are.
 *
 * Not a check of its own. `npm run shape` imports it to ask whether the show
 * hears builds, drops and breakdowns; the downbeats and fills it knows are for
 * the downbeat tracker still to come (PLAN.md §10 step 3). The
 * drums are the recipe `npm run bands` and `npm run learn` already use (a
 * 60→50 Hz kick, a snare of a 200 Hz body and high-passed noise, three-pole
 * hats), so what the analyser was tuned on is what it hears here; what this
 * adds is an arrangement over them:
 *
 *   intro      the pad alone, a hat now and then;
 *   verse      the groove: kick, backbeat snare, eighth hats, a bass line on
 *              each chord's root, the pad;
 *   build      the kick and bass out, a snare roll that doubles its rate every
 *              quarter of the section (quarters, eighths, sixteenths, then
 *              thirty-seconds) and gets harder, and a riser: noise through a
 *              band-pass swept from 400 Hz to 9 kHz, rising 24 dB. What every
 *              electronic build does, and the hardest case for a detector,
 *              because the low end leaves exactly as a breakdown's does;
 *   drop       everything back and louder, a crash on its first beat;
 *   breakdown  the pad and a quiet hat, no kick, no bass, no snare;
 *   chorus     the verse, louder, a crash every four bars, open hats;
 *   outro      the pad fading away;
 *   silence    nothing at all: the bar of nothing some songs leave between a
 *              build and its drop, so the beat slams back out of silence.
 *
 * Two styles. `club` is four on the floor. `band` plays a rock kick (one,
 * three and the "and" of three). Both play fills: over the last two beats of
 * every fourth bar of the groove (`band`) or every eighth (`club`), the kick
 * and the backbeat stop and a run of sixteenths on the snare, getting harder,
 * ends on two toms. The thing a drummer does before a chorus, and the thing a
 * detector must not call a build, a drop or a breakdown: the low end leaves
 * for two beats and comes back, and the top end climbs for two beats. A fill
 * that left the kick in (as this one did at first, a single beat where there
 * was no kick anyway) asked nothing of the low end at all.
 *
 * The chords are Am, F, C, G, one a bar, so a new chord (and a new bass note)
 * lands on every downbeat: the harmonic change a listener hears the bar line
 * by, and the one thing a downbeat finder can use that is not a drum.
 *
 * Every hit is humanised by up to ±8 ms and given a velocity from a seeded
 * generator, and the whole song carries a 16-bit noise floor, as in the other
 * two harnesses. Same seed, same song, to the sample.
 */

export const SR = 44100;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function highPass(x, fc) {
  const rc = 1 / (2 * Math.PI * fc), a = rc / (rc + 1 / SR);
  const y = new Float32Array(x.length);
  let px = 0, py = 0;
  for (let i = 0; i < x.length; i++) { py = a * (py + x[i] - px); px = x[i]; y[i] = py; }
  return y;
}
function lowPass(x, fc) {
  const rc = 1 / (2 * Math.PI * fc), a = (1 / SR) / (rc + 1 / SR);
  const y = new Float32Array(x.length);
  let py = 0;
  for (let i = 0; i < x.length; i++) { py += a * (x[i] - py); y[i] = py; }
  return y;
}
const noise = (n, rand) => Float32Array.from({ length: n }, () => rand() * 2 - 1);
const tail = (i, len, sec) => Math.min(1, (len - i) / (sec * SR));

function kick(out, t0, vel) {
  const s0 = Math.round(t0 * SR), len = Math.round(0.4 * SR);
  let phase = 0;
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / SR;
    phase += 2 * Math.PI * (50 + 10 * Math.exp(-t / 0.04)) / SR;
    out[s0 + i] += 0.8 * vel * Math.min(1, t / 0.001) * Math.exp(-t / 0.12) * tail(i, len, 0.1) * Math.sin(phase);
  }
}
function snare(out, t0, vel, rand) {
  const s0 = Math.round(t0 * SR), len = Math.round(0.25 * SR);
  const n = lowPass(highPass(highPass(noise(len, rand), 1000), 1000), 8000);
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / SR;
    const body = 0.35 * Math.exp(-t / 0.06) * Math.sin(2 * Math.PI * 200 * t);
    out[s0 + i] += vel * Math.min(1, t / 0.001) * tail(i, len, 0.05) * (body + 0.5 * Math.exp(-t / 0.07) * n[i]);
  }
}
function hat(out, t0, vel, rand, open = false) {
  const s0 = Math.round(t0 * SR), len = Math.round((open ? 0.3 : 0.08) * SR);
  const n = highPass(highPass(highPass(noise(len, rand), 7000), 7000), 7000);
  const decay = open ? 0.12 : 0.015;
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / SR;
    out[s0 + i] += 0.6 * vel * Math.min(1, t / 0.0005) * Math.exp(-t / decay) * tail(i, len, 0.02) * n[i];
  }
}
/** A tom: a pitched body falling a little, like the kick an octave or two up. */
function tom(out, t0, vel, hz) {
  const s0 = Math.round(t0 * SR), len = Math.round(0.3 * SR);
  let phase = 0;
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / SR;
    phase += 2 * Math.PI * hz * (1 + 0.3 * Math.exp(-t / 0.05)) / SR;
    out[s0 + i] += 0.5 * vel * Math.min(1, t / 0.001) * Math.exp(-t / 0.15) * tail(i, len, 0.05) * Math.sin(phase);
  }
}
/** A crash: a long bright wash, the mark a drummer puts on the one after a fill. */
function crash(out, t0, vel, rand) {
  const s0 = Math.round(t0 * SR), len = Math.round(1.6 * SR);
  const n = highPass(highPass(noise(len, rand), 4000), 4000);
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / SR;
    out[s0 + i] += 0.35 * vel * Math.min(1, t / 0.002) * Math.exp(-t / 0.6) * tail(i, len, 0.2) * n[i];
  }
}
/** One bass note: a sawtooth through a gentle low-pass, re-articulated. */
function bassNote(out, t0, dur, hz, vel) {
  const s0 = Math.round(t0 * SR), len = Math.round(dur * SR);
  let y = 0;
  const a = 1 - Math.exp(-2 * Math.PI * 600 / SR);
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / SR;
    const saw = 2 * ((hz * t) % 1) - 1;
    y += a * (saw - y);
    out[s0 + i] += 0.28 * vel * Math.min(1, t / 0.004) * Math.min(1, (len - i) / (0.01 * SR)) * y;
  }
}

/** Am, F, C, G: the roots (Hz) and the triads over them. */
const CHORDS = [
  { root: 55, notes: [220, 261.6, 329.6] },
  { root: 43.65, notes: [174.6, 220, 261.6] },
  { root: 65.41, notes: [196, 261.6, 329.6] },
  { root: 49, notes: [196, 246.9, 293.7] },
];

/**
 * The pad, one chord a bar, the voices crossfading over a sixteenth of a bar
 * so a change is heard as a change and not as a click. Written into `out`
 * between `t0` and `t1` at `gain` (a function of time, for fades).
 */
function padSpan(out, t0, t1, bar, firstBar, gain) {
  const s0 = Math.max(0, Math.round(t0 * SR)), s1 = Math.min(out.length, Math.round(t1 * SR));
  for (let i = s0; i < s1; i++) {
    const t = i / SR;
    const k = Math.floor((t - firstBar) / bar);
    const chord = CHORDS[((k % 4) + 4) % 4];
    const into = t - firstBar - k * bar;
    const x = Math.min(1, into / (bar / 16));
    const prev = CHORDS[(((k - 1) % 4) + 4) % 4];
    let s = 0;
    for (const f of chord.notes) for (const d of [0.998, 1.002]) for (let h = 1; h <= 4; h++) s += x * Math.sin(2 * Math.PI * f * d * h * t) / h;
    if (x < 1) for (const f of prev.notes) for (const d of [0.998, 1.002]) for (let h = 1; h <= 4; h++) s += (1 - x) * Math.sin(2 * Math.PI * f * d * h * t) / h;
    out[i] += 0.02 * gain(t) * s;
  }
}

/** A riser: noise through a band-pass whose centre sweeps up, getting louder. */
function riser(out, t0, t1, rand) {
  const s0 = Math.max(0, Math.round(t0 * SR)), s1 = Math.min(out.length, Math.round(t1 * SR));
  let lp = 0, hp = 0, px = 0;
  for (let i = s0; i < s1; i++) {
    const u = (i - s0) / Math.max(1, s1 - s0);
    const fc = 400 * Math.pow(9000 / 400, u);
    const aL = 1 - Math.exp(-2 * Math.PI * fc * 1.6 / SR);
    const rc = 1 / (2 * Math.PI * fc / 1.6), aH = rc / (rc + 1 / SR);
    const x = rand() * 2 - 1;
    lp += aL * (x - lp);
    hp = aH * (hp + lp - px); px = lp;
    out[i] += 0.25 * Math.pow(10, (-24 + 24 * u) / 20) * hp;
  }
}

/** -96 dBFS RMS: a 16-bit recording's own floor. */
const DITHER = 1.6e-5;

/**
 * One song.
 *
 *   bpm       tempo;
 *   sections  [{ kind, bars }], in order;
 *   style     'club' or 'band';
 *   gainDb    the whole song this much quieter or louder;
 *   seed      the humanising and the noise;
 *   buildKick a club build that keeps its kick (some do), for the case
 *             where the low end does not leave at all.
 *
 * Returns the samples and the truth:
 *
 *   sections  [{ kind, start, end }] in seconds;
 *   downbeats every bar line, seconds;
 *   beats     every beat, seconds, and `beatInBar` beside it (0 is the one);
 *   fills     the start of every fill, seconds;
 *   returns   where the kick comes back after two bars or more without it:
 *             the moments a light show would call a drop.
 */
export function arrange({ bpm = 128, sections, style = 'club', gainDb = 0, seed = 1, buildKick = false }) {
  const rand = rng(seed);
  const beat = 60 / bpm, bar = beat * 4;
  const lead = beat;                              // a beat of silence before the song starts
  const totalBars = sections.reduce((s, x) => s + x.bars, 0);
  const seconds = lead + totalBars * bar + 3;
  const out = new Float32Array(Math.ceil(seconds * SR));
  const truth = { sections: [], downbeats: [], beats: [], beatInBar: [], fills: [], returns: [], bpm, bar, beat };
  const jitter = () => (rand() - 0.5) * 0.016;

  let t = lead, lastKickAt = -Infinity;
  for (const sec of sections) {
    const start = t, end = t + sec.bars * bar;
    truth.sections.push({ kind: sec.kind, start, end });
    const kind = sec.kind;
    const loud = kind === 'drop' ? 1.25 : kind === 'chorus' ? 1.2 : kind === 'intro' || kind === 'outro' ? 0.6 : 1;
    // The pad, under everything but silence.
    const padGain = kind === 'outro'
      ? (x) => Math.max(0, 1 - (x - start) / (end - start))
      : kind === 'intro' ? (x) => Math.min(1, (x - start) / 2) * 0.8 : () => (kind === 'drop' || kind === 'chorus' ? 1.1 : 1);
    if (kind !== 'silence') padSpan(out, start, end, bar, lead, padGain);
    if (kind === 'build') riser(out, start, end, rand);

    for (let b = 0; b < sec.bars; b++) {
      const barAt = start + b * bar;
      const chord = CHORDS[Math.round((barAt - lead) / bar) % 4];
      truth.downbeats.push(barAt);
      const fillBar = (kind === 'verse' || kind === 'chorus' || kind === 'drop') && b % (style === 'band' ? 4 : 8) === (style === 'band' ? 3 : 7);
      if (fillBar) truth.fills.push(barAt + 2 * beat);
      for (let q = 0; q < 4; q++) {
        const at = barAt + q * beat;
        truth.beats.push(at); truth.beatInBar.push(q);
        const inFill = fillBar && q >= 2;
        const grooving = kind === 'verse' || kind === 'drop' || kind === 'chorus';
        // Kick.
        const kickHere = grooving && !inFill && (style === 'club' ? true : q === 0 || q === 2)
          || (kind === 'build' && buildKick);
        const kicks = [];
        if (kickHere) kicks.push(at);
        if (grooving && style === 'band' && q === 2 && !inFill) kicks.push(at + beat / 2);
        for (const k of kicks) {
          const kt = k + jitter();
          if (kt - lastKickAt >= 2 * bar - 0.05 && lastKickAt > -Infinity) truth.returns.push(kt);
          else if (lastKickAt === -Infinity) truth.returns.push(kt);
          lastKickAt = kt;
          kick(out, kt, (0.8 + 0.2 * rand()) * loud);
        }
        // Crash on the one of a drop, and on every fourth bar of a chorus.
        if (q === 0 && ((kind === 'drop' && b === 0) || (kind === 'chorus' && b % 4 === 0))) crash(out, at + jitter(), 0.9, rand);
        // Snare: the backbeat, or the build's roll.
        if (grooving && !inFill && (q === 1 || q === 3)) snare(out, at + jitter(), (0.75 + 0.25 * rand()) * loud, rand);
        if (kind === 'build') {
          const u = b / sec.bars;
          const per = u < 0.25 ? 1 : u < 0.5 ? 2 : u < 0.75 ? 4 : 8;
          for (let s = 0; s < per; s++) snare(out, at + s * beat / per + jitter() * 0.5, 0.35 + 0.6 * (b + q / 4) / sec.bars, rand);
        }
        if (inFill) {
          for (let s = 0; s < 4; s++) {
            const ft = at + s * beat / 4 + jitter() * 0.5;
            const last = q === 3 && s >= 2;
            if (!last) snare(out, ft, (0.55 + 0.1 * ((q - 2) * 4 + s) + 0.1 * rand()) * loud, rand);
            else tom(out, ft, 0.9 * loud, s === 2 ? 180 : 120);
          }
        }
        // Hats: eighths in the groove, open on the "and" in a drop or chorus;
        // a quiet one on each beat in an intro or breakdown.
        if (grooving) for (let e = 0; e < 2; e++) hat(out, at + e * beat / 2 + jitter(), (0.5 + 0.3 * rand()) * loud, rand, e === 1 && (kind === 'drop' || kind === 'chorus'));
        else if (kind === 'breakdown' || kind === 'intro') hat(out, at + jitter(), 0.25 + 0.1 * rand(), rand);
        // Bass: the chord's root on every eighth, in the groove only.
        if (grooving) for (let e = 0; e < 2; e++) bassNote(out, at + e * beat / 2 + jitter(), beat / 2 * 0.9, chord.root * (e === 1 && q === 3 ? 2 : 1), (0.8 + 0.2 * rand()) * loud);
      }
    }
    t = end;
  }
  const g = Math.pow(10, gainDb / 20);
  for (let i = 0; i < out.length; i++) out[i] = out[i] * g + DITHER * (rand() * 2 - 1) * Math.sqrt(3);
  return { pcm: out, truth, seconds };
}
