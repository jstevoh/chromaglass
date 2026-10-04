/**
 * The show's own band (`bandStep` in src/lib/simulatedMusic.ts), its score
 * rendered to samples the way Web Audio plays it: the same oscillators,
 * envelopes and filters, the same seeded noise. Heard through the emulated
 * analyser by `npm run kicks` (how many of its kicks the show hears) and
 * `npm run clicks` (whether a click in the room is taken for one); bundled
 * into each by esbuild, which is how they reach the .ts files.
 *
 * `renderBand(seconds, sampleRate)` returns the samples and the time and
 * section of every kick it played.
 */
import { bandStep, BAND_STEP_S } from '../src/lib/simulatedMusic.ts';
import { stream } from '../src/lib/rng.ts';

function biquad(SR, type, f0, Q) {
  const w = 2 * Math.PI * f0 / SR, cs = Math.cos(w), sn = Math.sin(w), alpha = sn / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
  else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
  else { b0 = alpha; b1 = 0; b2 = -alpha; }
  a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
const expAt = (v0, v1, t0, t1, t) => v0 * Math.pow(v1 / v0, Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));

export function renderBand(seconds, SR, fromStep = 0) {
  const out = new Float32Array(Math.ceil(seconds * SR));
  const noise = new Float32Array(Math.floor(SR * 0.4));
  { const r = stream('audio.sim'); for (let i = 0; i < noise.length; i++) noise[i] = r.signed(); }
  const offs = stream('audio.sim');
  const kicks = [];
  const steps = Math.ceil(seconds / BAND_STEP_S);
  for (let s = 0; s < steps; s++) {
    const at = s * BAND_STEP_S;
    const { part, notes } = bandStep(s + fromStep);
    for (const n of notes) {
      const t0 = at + n.after;
      if (n.kind === 'tone') {
        if (n.type === 'sine' && n.freq === 120) kicks.push({ t: t0, part });
        const lp = n.cutoff !== undefined ? biquad(SR, 'lowpass', n.cutoff, Math.pow(10, 1 / 20)) : null;
        let ph = 0;
        const i0 = Math.floor(t0 * SR), i1 = Math.min(out.length, Math.ceil((t0 + n.dur + 0.02) * SR));
        for (let i = i0; i < i1; i++) {
          const t = i / SR;
          const f = n.sweepTo !== undefined ? expAt(n.freq, Math.max(20, n.sweepTo), t0, t0 + n.dur, t) : n.freq;
          ph += f / SR; ph -= Math.floor(ph);
          const osc = n.type === 'sine' ? Math.sin(2 * Math.PI * ph) : n.type === 'sawtooth' ? 2 * ph - 1 : 1 - 4 * Math.abs(ph - 0.5);
          const g = t < t0 + 0.006 ? expAt(0.0001, n.gain, t0, t0 + 0.006, t) : expAt(n.gain, 0.0001, t0 + 0.006, t0 + n.dur, t);
          const v = osc * g;
          out[i] += 0.5 * (lp ? lp(v) : v);
        }
      } else {
        const f = biquad(SR, n.filter, n.cutoff, n.filter === 'bandpass' ? 1 : Math.pow(10, 1 / 20));
        const start = Math.floor(offs.float() * 0.2 * SR);
        const i0 = Math.floor(t0 * SR), i1 = Math.min(out.length, Math.ceil((t0 + n.dur + 0.02) * SR));
        for (let i = i0; i < i1; i++) {
          const j = start + (i - i0); if (j >= noise.length) break;
          const g = expAt(n.gain, 0.0001, t0, t0 + n.dur, i / SR);
          out[i] += 0.5 * g * f(noise[j]);
        }
      }
    }
  }
  return { pcm: out, kicks };
}
