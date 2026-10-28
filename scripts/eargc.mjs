/**
 * Whether the ear's onset detectors decide as they did, and stop making
 * garbage every frame (PLAN.md 14ab-7).
 *
 *   npm run eargc
 *
 * `src/lib/audioFeatures.ts` keeps, for each of its seventeen sources, the last
 * second of spectral flux and asks on every frame for the median of it and the
 * median of how far it strays from that (the median absolute deviation); a hit
 * has to rise above median + 3 MADs. It did so by copying the history,
 * sorting it, mapping it to deviations and sorting those, and by `shift()`ing
 * its arrays as the second moved on: four arrays a source a frame, 68 a frame
 * for the ear, at every refresh the page draws. It is now two rings and a
 * partial sort (`select`) that finds the one element a sort would have put at
 * the middle.
 *
 * The feature has two halves, and neither names the new code:
 *
 *   1. It decides what the definition says. `Sorted` below is the old
 *      detector, verbatim, the definition written the obvious way; the new
 *      one is held to it over streams of flux with hits in them, at 60, 144
 *      and 400 refreshes a second (the rings double when a faster display
 *      fills them), a stall of two seconds, a reset, and a silent source
 *      (every flux the same, the case a naive partition handles worst). The
 *      control is the same reference taking the lower of the two middle
 *      elements of an even history instead: it must disagree somewhere, or
 *      the streams are too quiet to tell a median from its neighbour.
 *   2. It makes no garbage a frame. Seventeen detectors' calls are measured in
 *      bytes of heap, new against the old (the control: it must make more than
 *      the bar the new one is held under), and a whole `AudioFeatures.update`
 *      is measured, for what the reading itself costs, over a seeded second
 *      of kicks.
 *
 * Run with `--expose-gc` and a large young generation so a scavenge does not
 * count the garbage away (`npm run eargc` does).
 */
import { AudioFeatures, AnalyserEmulator, OnsetDetector } from '../src/lib/audioFeatures.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// The constants are audioFeatures.ts's own (ODF_WINDOW_S, ODF_K, REFRACTORY_S).
const WINDOW_S = 1, K = 3, REFRACTORY_S = 0.07;

/** The old detector, as it was, for `lower` the control that takes the other middle. */
class Sorted {
  constructor(lower = false) { this.lower = lower; this.reset(); }
  reset() { this.history = []; this.historyAt = []; this.lastHit = -Infinity; this.armed = true; }
  candidate(time, odf, first, minimum) {
    const n = this.history.length;
    const mid = this.lower ? (n - 1) >> 1 : n >> 1;
    let threshold = minimum;
    if (n > 0) {
      const sorted = this.history.slice().sort((a, b) => a - b);
      const median = sorted[mid];
      const dev = sorted.map(v => Math.abs(v - median)).sort((a, b) => a - b);
      threshold += median + K * dev[mid];
    }
    this.history.push(odf); this.historyAt.push(time);
    while (time - this.historyAt[0] > WINDOW_S) { this.history.shift(); this.historyAt.shift(); }
    if (odf <= threshold) this.armed = true;
    const hit = !first && this.armed && odf > threshold && time - this.lastHit >= REFRACTORY_S;
    // The real detector's `fire` is what moves lastHit and disarms; the stream below calls it on a candidate.
    return hit;
  }
  fire(time) { this.armed = false; this.lastHit = time; }
}

/** A stream of flux: a noisy floor, hits every ~0.27 s of a few times the floor, a silent stretch. */
function stream(hz, seconds, seed, { flat = false, stallAt = -1 } = {}) {
  const r = rng(seed), out = [];
  let t = 0;
  for (let i = 0; i < hz * seconds; i++) {
    t += 1 / hz;
    if (i === stallAt) t += 2;
    let odf = flat ? 1.5 : 0.4 + r() * 1.2;
    if (!flat && i % Math.round(hz * 0.27) === 0) odf += 4 + r() * 6;
    out.push({ t, odf });
  }
  return out;
}

/** Runs a detector pair over a stream; true hits are fired on both so their refractory state agrees. */
function disagreements(make, ref, frames, { resetAt = -1 } = {}) {
  const d = make(), s = ref;
  let diff = 0, hits = 0;
  frames.forEach(({ t, odf }, i) => {
    if (i === resetAt) { d.reset(); s.reset(); }
    const minimum = 0.3, first = i === 0 || i === resetAt;
    const a = d.candidate(t, odf, first, minimum), b = s.candidate(t, odf, first, minimum);
    if (a !== b) diff++;
    if (b) { hits++; d.fire(t, odf); s.fire(t); }
  });
  return { diff, hits };
}

for (const hz of [60, 144, 400]) {
  const f = stream(hz, 12, hz);
  const r = disagreements(() => new OnsetDetector(), new Sorted(), f);
  check(`the ring and the partial sort decide as the sort did, ${hz} refreshes a second`, r.diff === 0 && r.hits > 20, `${r.diff} disagreements over ${f.length} frames, ${r.hits} hits`);
}
{
  const f = stream(60, 12, 7, { stallAt: 300 });
  const r = disagreements(() => new OnsetDetector(), new Sorted(), f, { resetAt: 500 });
  check('…across a two-second stall and a reset', r.diff === 0, `${r.diff} disagreements, ${r.hits} hits`);
}
{
  const f = stream(60, 6, 3, { flat: true });
  const r = disagreements(() => new OnsetDetector(), new Sorted(), f);
  check('…on a source whose flux never changes', r.diff === 0, `${r.diff} disagreements over ${f.length} frames`);
}
{
  const f = stream(60, 12, 60);
  const r = disagreements(() => new OnsetDetector(), new Sorted(true), f);
  check('control: the lower middle element of an even history is told apart from the middle one', r.diff > 0, `${r.diff} disagreements`);
}

// ── Garbage ─────────────────────────────────────────────────────────────
const gc = globalThis.gc;
const heap = () => process.memoryUsage().heapUsed;
function kbPerFrame(frames, step) {
  gc(); const before = heap();
  for (let i = 0; i < frames.length; i++) step(frames[i], i);
  return (heap() - before) / frames.length / 1024;
}
if (!gc) {
  console.log(' skip garbage lines: run with node --expose-gc (npm run eargc does)');
} else {
  const f = stream(60, 20, 11);
  const make = (C) => Array.from({ length: 17 }, () => new C());
  const warm = (ds) => { for (let i = 0; i < 600; i++) for (const d of ds) d.candidate(f[i].t, f[i].odf, false, 0.3); };
  const fresh = make(OnsetDetector), old = make(Sorted);
  warm(fresh); warm(old);
  const rest = f.slice(600);
  const newKb = kbPerFrame(rest, ({ t, odf }) => { for (const d of fresh) d.candidate(t, odf, false, 0.3); });
  const oldKb = kbPerFrame(rest, ({ t, odf }) => { for (const d of old) d.candidate(t, odf, false, 0.3); });
  check('seventeen detectors make next to no garbage in a frame (a boxed number or two a call, not four arrays)', newKb < 2, `${newKb.toFixed(2)} KB a frame; the old way ${oldKb.toFixed(1)} KB`);
  check('control: the old way is measured making garbage', oldKb > 8, `${oldKb.toFixed(1)} KB a frame`);

  // A whole update: the reading is returned to its callers and is the garbage that is left.
  const sr = 48000, fps = 60, secs = 12, r = rng(5);
  const pcm = new Float32Array(sr * secs);
  for (let i = 0; i < pcm.length; i++) {
    const ph = (i / sr) % 0.5;
    pcm[i] = 0.02 * (r() - 0.5) + 0.6 * Math.sin(2 * Math.PI * 55 * ph) * Math.exp(-ph * 25);
  }
  const em = new AnalyserEmulator(sr), frames = [];
  for (let i = 0; i < secs * fps; i++) {
    const { bins, timeDomainData } = em.frame(pcm, Math.round(i * sr / fps), 1 / fps);
    frames.push({ bins: Float32Array.from(bins), timeDomainData: Uint8Array.from(timeDomainData), i });
  }
  const features = new AudioFeatures();
  const upd = (fr) => features.update({ bins: fr.bins, timeDomainData: fr.timeDomainData, scale: 'db', sampleRate: sr, fftSize: em.fftSize }, fr.i / fps);
  frames.slice(0, 300).forEach(upd);
  const kb = kbPerFrame(frames.slice(300), upd);
  check('a whole reading costs only its own object', kb < 8, `${kb.toFixed(2)} KB an update; 13.1 before`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
