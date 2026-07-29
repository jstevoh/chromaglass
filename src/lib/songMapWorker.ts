// Web Worker: offline analysis of a recorded listen into a SongMap.
// Input:  { pcm: Float32Array, sampleRate: number }  (mono)
// Output: { sections, pitchCurve, energyCurve, frameRate, durationSec }
//
// Pipeline: framed FFT → energy / chroma / spectral-centroid features →
// self-similarity novelty curve → section boundaries → repetition-based
// labels; plus autocorrelation pitch tracking per frame.

const FRAME = 2048;
const HOP = 5512; // ~4 frames/sec at 22050 Hz

// ── Radix-2 FFT (in-place, real input packed into re/im arrays) ────────
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe; im[i + k + len / 2] = uIm - vIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
}

const hann = new Float32Array(FRAME);
for (let i = 0; i < FRAME; i++) hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FRAME - 1)));

function analyze(pcm: Float32Array, sampleRate: number) {
  const frameCount = Math.max(1, Math.floor((pcm.length - FRAME) / HOP));
  const frameRate = sampleRate / HOP;
  const durationSec = pcm.length / sampleRate;

  const energy = new Float32Array(frameCount);
  const centroid = new Float32Array(frameCount);
  const chroma: Float32Array[] = [];
  const pitch = new Float32Array(frameCount);

  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);
  const binHz = sampleRate / FRAME;

  // Precompute bin → pitch-class mapping (55 Hz – 4 kHz)
  const loBin = Math.max(1, Math.ceil(55 / binHz));
  const hiBin = Math.min(FRAME / 2, Math.floor(4000 / binHz));
  const pitchClass = new Int8Array(hiBin + 1);
  for (let b = loBin; b <= hiBin; b++) {
    const midi = 69 + 12 * Math.log2((b * binHz) / 440);
    pitchClass[b] = ((Math.round(midi) % 12) + 12) % 12;
  }

  // Autocorrelation pitch search range: 55–880 Hz
  const minLag = Math.floor(sampleRate / 880);
  const maxLag = Math.min(FRAME - 1, Math.ceil(sampleRate / 55));

  for (let f = 0; f < frameCount; f++) {
    const off = f * HOP;

    // Energy (RMS, unwindowed)
    let sum = 0;
    for (let i = 0; i < FRAME; i++) { const s = pcm[off + i]; sum += s * s; }
    energy[f] = Math.sqrt(sum / FRAME);

    // Windowed FFT
    for (let i = 0; i < FRAME; i++) { re[i] = pcm[off + i] * hann[i]; im[i] = 0; }
    fft(re, im);

    const cv = new Float32Array(12);
    let cNum = 0, cDen = 0;
    for (let b = 1; b < FRAME / 2; b++) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      cNum += mag * b;
      cDen += mag;
      if (b >= loBin && b <= hiBin) cv[pitchClass[b]] += mag;
    }
    centroid[f] = cDen > 0 ? (cNum / cDen) * binHz : 0;
    // Normalize chroma vector
    let cMax = 0;
    for (let k = 0; k < 12; k++) cMax = Math.max(cMax, cv[k]);
    if (cMax > 0) for (let k = 0; k < 12; k++) cv[k] /= cMax;
    chroma.push(cv);

    // Pitch via normalized autocorrelation (skip silent frames)
    if (energy[f] > 0.01) {
      let bestLag = 0, bestCorr = 0;
      const e0 = sum;
      for (let lag = minLag; lag <= maxLag; lag++) {
        let corr = 0;
        for (let i = 0; i < FRAME - lag; i += 2) corr += pcm[off + i] * pcm[off + i + lag];
        corr = (2 * corr) / e0;
        if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
      }
      if (bestCorr > 0.35 && bestLag > 0) {
        pitch[f] = 69 + 12 * Math.log2(sampleRate / bestLag / 440);
      }
    }
  }

  // Normalize energy 0-1
  let eMax = 0;
  for (let f = 0; f < frameCount; f++) eMax = Math.max(eMax, energy[f]);
  if (eMax > 0) for (let f = 0; f < frameCount; f++) energy[f] /= eMax;

  return { energy, centroid, chroma, pitch, frameRate, durationSec, frameCount };
}

// ── Structure segmentation ─────────────────────────────────────────────

function segment(feat: ReturnType<typeof analyze>) {
  const { chroma, centroid, energy, frameRate, durationSec, frameCount } = feat;

  // Downsample features to ~1 fps beat-agnostic super-frames
  const group = Math.max(1, Math.round(frameRate));
  const n = Math.floor(frameCount / group);
  if (n < 8) {
    return [{ start: 0, end: durationSec, label: 'song', energy: mean(energy) }];
  }
  const dim = 13;
  const F: Float32Array[] = [];
  let cMax = 1;
  for (let i = 0; i < n; i++) cMax = Math.max(cMax, centroid[i * group]);
  for (let i = 0; i < n; i++) {
    const v = new Float32Array(dim);
    for (let g = 0; g < group; g++) {
      const c = chroma[i * group + g];
      for (let k = 0; k < 12; k++) v[k] += c[k];
      v[12] += centroid[i * group + g] / cMax;
    }
    for (let k = 0; k < dim; k++) v[k] /= group;
    F.push(v);
  }

  const cos = (a: Float32Array, b: Float32Array) => {
    let d = 0, na = 0, nb = 0;
    for (let k = 0; k < dim; k++) { d += a[k] * b[k]; na += a[k] * a[k]; nb += b[k] * b[k]; }
    return na && nb ? d / Math.sqrt(na * nb) : 0;
  };

  // Novelty via checkerboard kernel along the SSM diagonal
  const K = Math.min(16, Math.floor(n / 4)); // ~16 s context
  const novelty = new Float32Array(n);
  for (let i = K; i < n - K; i++) {
    let nov = 0;
    for (let a = 0; a < K; a++) {
      for (let b = 0; b < K; b++) {
        const within = cos(F[i - 1 - a], F[i - 1 - b]) + cos(F[i + a], F[i + b]);
        const across = 2 * cos(F[i - 1 - a], F[i + b]);
        nov += within - across;
      }
    }
    novelty[i] = nov / (K * K);
  }

  // Peak-pick boundaries: local maxima above mean+0.5σ, ≥8 s apart
  const m = mean(novelty), sd = std(novelty, m);
  const thresh = m + 0.5 * sd;
  const boundaries: number[] = [0];
  for (let i = 2; i < n - 2; i++) {
    if (novelty[i] > thresh &&
        novelty[i] >= novelty[i - 1] && novelty[i] >= novelty[i + 1] &&
        novelty[i] > novelty[i - 2] && novelty[i] > novelty[i + 2] &&
        i - boundaries[boundaries.length - 1] >= 8) {
      boundaries.push(i);
    }
  }
  boundaries.push(n);

  // Mean feature + energy per section, then greedy-cluster into repeat groups
  const secFeats: Float32Array[] = [];
  const secEnergy: number[] = [];
  for (let s = 0; s < boundaries.length - 1; s++) {
    const [a, b] = [boundaries[s], boundaries[s + 1]];
    const v = new Float32Array(dim);
    for (let i = a; i < b; i++) for (let k = 0; k < dim; k++) v[k] += F[i][k];
    for (let k = 0; k < dim; k++) v[k] /= (b - a);
    secFeats.push(v);
    let e = 0;
    for (let i = a * group; i < Math.min(frameCount, b * group); i++) e += energy[i];
    secEnergy.push(e / Math.max(1, (b - a) * group));
  }

  const cluster = new Int32Array(secFeats.length).fill(-1);
  let nextCluster = 0;
  for (let s = 0; s < secFeats.length; s++) {
    if (cluster[s] !== -1) continue;
    cluster[s] = nextCluster;
    for (let t = s + 1; t < secFeats.length; t++) {
      if (cluster[t] === -1 && cos(secFeats[s], secFeats[t]) > 0.92) cluster[t] = nextCluster;
    }
    nextCluster++;
  }

  // Label: most-repeated high-energy cluster → chorus; singletons mid-song → bridge
  const clusterDur = new Map<number, number>();
  const clusterEnergy = new Map<number, number>();
  for (let s = 0; s < cluster.length; s++) {
    const d = boundaries[s + 1] - boundaries[s];
    clusterDur.set(cluster[s], (clusterDur.get(cluster[s]) || 0) + d);
    clusterEnergy.set(cluster[s], Math.max(clusterEnergy.get(cluster[s]) || 0, secEnergy[s]));
  }
  let chorusCluster = -1, bestScore = 0;
  for (const [c, d] of clusterDur) {
    const count = cluster.filter(x => x === c).length;
    if (count < 2) continue;
    const score = d * (0.5 + (clusterEnergy.get(c) || 0));
    if (score > bestScore) { bestScore = score; chorusCluster = c; }
  }

  const sections = [];
  for (let s = 0; s < cluster.length; s++) {
    const start = (boundaries[s] * group) / frameRate;
    const end = (boundaries[s + 1] * group) / frameRate;
    let label: string;
    if (s === 0 && end - start < 25 && cluster[s] !== chorusCluster) label = 'intro';
    else if (s === cluster.length - 1 && secEnergy[s] < 0.35) label = 'outro';
    else if (cluster[s] === chorusCluster) label = 'chorus';
    else if (cluster.filter(x => x === cluster[s]).length === 1 && s > 0 && s < cluster.length - 1) label = 'bridge';
    else label = 'verse';
    sections.push({ start, end: Math.min(end, durationSec), label, energy: secEnergy[s] });
  }
  return sections;
}

function mean(a: ArrayLike<number>) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
function std(a: ArrayLike<number>, m: number) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - m; s += d * d; } return a.length ? Math.sqrt(s / a.length) : 0; }

self.onmessage = (e: MessageEvent) => {
  const { pcm, sampleRate } = e.data as { pcm: Float32Array; sampleRate: number };
  try {
    const feat = analyze(pcm, sampleRate);
    const sections = segment(feat);
    (self as any).postMessage({
      ok: true,
      sections,
      pitchCurve: Array.from(feat.pitch),
      energyCurve: Array.from(feat.energy),
      frameRate: feat.frameRate,
      durationSec: feat.durationSec,
    });
  } catch (err) {
    (self as any).postMessage({ ok: false, error: String(err) });
  }
};
