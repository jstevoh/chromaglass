/**
 * Artistic report card for the watch tool (PLAN 47x-10).
 *
 * Grades a watched film across seven canons against real liquid light shows
 * (`REAL_SHOW_CARDS`) using the just-noticeable steps shared with
 * `compareDesign`, `comparePhysics` and `compareReads`. Nothing here runs in
 * the browser app.
 */

import fs from 'node:fs';
import path from 'node:path';
import { libraryDirs, refName } from './watchrefs.mjs';

// ─── Calibration: real moving liquid light shows ─────────────────────────────
// Watched with this version of `npm run watch` (after 47x-11 footage checks)
// at 4 samples/s, max 3 min span, into ~/cg-scratch/watchcal/<name>. Only
// moving footage of real optical liquid shows is included (not still photos,
// slideshows or digital video-mirror colourisers).
export const REAL_SHOW_CARDS = [
  {
    name: 'bill-ham-lights',
    title: 'Bill Ham Lights - sample 1',
    // https://www.youtube.com/watch?v=27iY97RF458 (0:00–0:37.25, 4/s, watched 2026-11-22)
    what: 'Bill Ham Lights sample (SF overhead liquid projection, layered cyan/green oil-water, 37 s; overlay masked, 22% camera pan subtracted)',
    hues: 3,
    hueSpread: 0.0529,
    hueGap: 30,
    lifetime: null,        // longer than the 37 s clip (lifeCapped: true)
    reorgPerMin: 3.22,
    spectrum: -2.84,
    forms: 7,
    scaleX: 8.52,
    colourfulness: 136.2,
    rms: 0.154,
    blackMean: 0.141,
    p5: 0.208,
    arcShape: 'builds',
    thirdsSpread: 0.440,
    peakOver: 6.41,
    surge: 0.832,
    swellsPerMin: 3.22,
    sync: 0.220,
    lag: -0.50,
    longestRest: 3.5,
    calm: 0.106,
  },
  {
    name: 'jls-fillmore-east-1968',
    title: '1968 Psychedelic Liquid Light Show — Joshua’s Lights LIVE at Fillmore East',
    // https://www.youtube.com/watch?v=hBf7CPangGA (0:24–1:45, crop 0.22,0.2,0.56,0.72, 4/s, watched 2026-11-22)
    what: 'Joshua Light Show at Fillmore East 1968, cropped to the dish projection (81 s; 2 corner overlays masked, silent video)',
    hues: 3,
    hueSpread: 0.135,
    hueGap: 30,
    lifetime: 8.90,
    reorgPerMin: 5.19,
    spectrum: -3.21,
    forms: 12,
    scaleX: 11.82,
    colourfulness: 34.6,
    rms: 0.311,
    blackMean: 0.347,
    p5: 0.052,
    arcShape: 'builds',
    thirdsSpread: 0.642,
    peakOver: 3.15,
    surge: 0.663,
    swellsPerMin: 3.70,
    sync: null,
    lag: null,
    longestRest: 12.25,
    calm: 0.342,
  },
  {
    name: 'jls-liquid-loops-1969',
    title: 'The Joshua Light Show - Liquid Loops (1969)',
    // https://www.youtube.com/watch?v=TW733Ut5zE0 (0:00–3:00 capped at 3 min, 4/s, watched 2026-11-22)
    what: 'Joshua Light Show Liquid Loops 1969: 35 mm film of overhead oil/water/glycerin projections (first 3 min, silent)',
    hues: 3,
    hueSpread: 0.0795,
    hueGap: 30,
    lifetime: 0.881,
    reorgPerMin: 10.0,
    spectrum: -2.85,
    forms: 11,
    scaleX: 11.98,
    colourfulness: 76.4,
    rms: 0.145,
    blackMean: 0.218,
    p5: 0.073,
    arcShape: 'dips',
    thirdsSpread: 0.706,
    peakOver: 2.92,
    surge: 0.621,
    swellsPerMin: 3.33,
    sync: null,
    lag: null,
    longestRest: 24.0,
    calm: 0.376,
  },
];

// Score sits high inside the calibrated real-show band [lo, hi] and drops
// with each just-noticeable step outside the nearer edge.
const BAND_SCORE = 9.0;
const STEP_DROP = 2.2;
const SCORE_ON_HOLD_MAX = 6.5;

const round1 = x => Math.round(x * 10) / 10;
const clamp10 = x => Math.max(0, Math.min(10, round1(x)));
const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));

function bandOf(cal, key) {
  const vals = (cal ?? []).map(r => r[key]).filter(x => x != null && Number.isFinite(x));
  if (!vals.length) return null;
  return [Math.min(...vals), Math.max(...vals)];
}

function stepDistance(value, band, step, kind = 'linear', dir = 'both') {
  if (value == null || !Number.isFinite(value) || !band) return null;
  const [lo, hi] = band;
  if (value >= lo && value <= hi) return 0;
  if (dir === 'lowBad' && value > hi) {
    // Past the high end of dark space or rests only gently loses credit.
    const d = (value - hi) / step;
    return d * 0.35;
  }
  if (dir === 'lowOnly' && value >= lo) return 0;
  if (dir === 'highBad' && value < lo) return 0;
  if (kind === 'ratio') {
    const edge = value < lo ? lo : hi;
    if (value <= 0 || edge <= 0) return 5;
    return Math.abs(Math.log(value / edge)) / Math.log(step);
  }
  return value < lo ? (lo - value) / step : (value - hi) / step;
}

/**
 * Extract normalized card metrics from any of:
 * - full `watchVideo()` result object
 * - saved `design.json` object
 * - a `REAL_SHOW_CARDS` calibration row
 */
export function cardMetrics(read) {
  if (!read || typeof read !== 'object') return {};
  if ('blackMean' in read && 'rms' in read && typeof read.rms === 'number') {
    return { ...read, reliability: { detail: true, reason: null } };
  }
  const ds = read.design ?? read;
  const ph = ds.physics ?? read.physics ?? {};
  const sh = read.shape ?? {};
  const ov = read.overall ?? {};
  const arc = ov.arc ?? {};
  const ft = read.footage ?? {};
  const relDetail = ft.reliable?.detail !== false
    && ds.edgeWidth?.reliable !== false
    && ds.scaleX?.reliable !== false
    && ds.forms?.reliable !== false
    && ph.spectrum?.reliable !== false;

  const thirds = Array.isArray(arc.thirds) && arc.thirds.length === 3 && arc.thirds.every(Number.isFinite)
    ? Math.max(...arc.thirds) - Math.min(...arc.thirds)
    : null;

  return {
    hues: sh.hues ?? null,
    hueSpread: ds.hueSpread?.med ?? null,
    hueGap: ds.hueGap?.med ?? null,
    lifetime: ph.lifetime ?? null,
    lifeCapped: !!ph.lifeCapped,
    reorgPerMin: sh.reorgPerMin ?? null,
    spectrum: ph.spectrum?.reliable === false ? null : (ph.spectrum?.med ?? null),
    forms: ds.forms?.reliable === false ? null : (ds.forms?.med ?? null),
    scaleX: ds.scaleX?.reliable === false ? null : (ds.scaleX?.med ?? null),
    colourfulness: ds.colourfulness?.med ?? null,
    coloured: ds.coloured?.med ?? null,
    rms: ds.rms?.med ?? null,
    blackMean: sh.black?.mean ?? null,
    p5: ds.p5?.med ?? null,
    arcShape: arc.shape ?? null,
    thirdsSpread: thirds,
    peakOver: arc.peakOver ?? null,
    surge: arc.surge ?? null,
    swellsPerMin: sh.swells?.perMin ?? null,
    sync: read.sync?.best ?? arc.sync ?? null,
    lag: read.sync?.lag ?? null,
    longestRest: arc.rest ?? (sh.still === false ? 0 : null),
    calm: Number.isFinite(sh.calm) ? sh.calm : null,
    still: !!sh.still,
    reliability: { detail: relDetail, reason: ft.reliable?.reason ?? null },
  };
}

function evalMeasures(m, cal, specs) {
  const measures = [];
  const dists = [];
  for (const s of specs) {
    const val = m[s.key];
    const band = bandOf(cal, s.key);
    const d = stepDistance(val, band, s.step, s.kind ?? 'linear', s.dir ?? 'both');
    measures.push({ measure: s.label, value: val ?? null, band, dist: d, key: s.key });
    if (d != null) dists.push(d);
  }
  return { measures, dists };
}

function bandStr(b, d = 2) {
  if (!b) return 'no cal';
  return b[0] === b[1] ? fmt(b[0], d) : `${fmt(b[0], d)}–${fmt(b[1], d)}`;
}

// Step sizes from compareDesign / comparePhysics / compareReads; any new ones note why:
// - p5: 0.1 (same luminance quantile step size as compareReads' p95 luminance)
// - thirdsSpread: 0.25 (matches overall.mjs 0.30 holds-flat threshold)
// - peakOver: 1.0 (half the range from flat 1.0 to the overall.mjs 1.8 swell bar)
// - surge: 0.2 (spans the distance from overall.mjs steady 0.25 to surging 0.60 in ~2 steps)
// - reorgPerMin: 1.5 (1–2 reorgs in a 1–2 min clip, paired with compareReads swellsPerMin 1.0)
// - sync: 0.2 (exact threshold from compareOverall)
// - lag: 0.5 (half-second audio-to-motion tolerance, matching bill-ham-lights |lag| = 0.50 s)
// - longestRest: 3.0 (one short rest beyond the 2.0 s minimum rest bar in overall.mjs)
const UNITY_SPECS = [
  { key: 'hues', label: 'hues a frame', step: 1.0, d: 0 },
  { key: 'hueSpread', label: 'hue spread', step: 0.2, d: 2 },
  { key: 'hueGap', label: 'hue gap', step: 45, d: 0 },
  { key: 'lifetime', label: 'lifetime (s)', step: 1.5, kind: 'ratio', d: 2 },
  { key: 'reorgPerMin', label: 'reorgs/min', step: 1.5, d: 1 },
];

const COMPLEXITY_SPECS = [
  { key: 'spectrum', label: 'spectrum slope', step: 0.4, d: 2 },
  { key: 'forms', label: 'forms a frame', step: 1.5, kind: 'ratio', d: 1 },
  { key: 'scaleX', label: 'form scale (% w)', step: 1.5, kind: 'ratio', d: 1 },
];

const INTENSITY_SPECS = [
  { key: 'rms', label: 'RMS contrast', step: 0.05, d: 2 },
  { key: 'colourfulness', label: 'colourfulness', step: 15, d: 0 },
  { key: 'blackMean', label: 'near-black share', step: 0.15, dir: 'lowBad', d: 2 },
  { key: 'p5', label: 'p5 luminance', step: 0.1, dir: 'highBad', d: 2 },
];

const ARC_SPECS = [
  { key: 'thirdsSpread', label: 'thirds spread', step: 0.25, dir: 'lowOnly', d: 2 },
  { key: 'peakOver', label: 'peak over median', step: 1.0, dir: 'lowOnly', d: 2 },
  { key: 'surge', label: 'surge spread', step: 0.2, d: 2 },
];

const SURPRISE_SPECS = [
  { key: 'reorgPerMin', label: 'reorgs/min', step: 1.5, d: 1 },
  { key: 'swellsPerMin', label: 'swells/min', step: 1.0, d: 1 },
];

const MUSIC_SPECS = [
  { key: 'sync', label: 'motion-sound r', step: 0.2, dir: 'lowOnly', d: 2 },
  { key: 'lag', label: 'sound lag (s)', step: 0.5, dir: 'both', d: 2 },
];

const RESTRAINT_SPECS = [
  { key: 'blackMean', label: 'near-black share', step: 0.15, dir: 'lowBad', d: 2 },
  { key: 'longestRest', label: 'longest rest (s)', step: 3.0, dir: 'lowBad', d: 1 },
  { key: 'calm', label: 'calm share', step: 0.15, dir: 'lowBad', d: 2 },
];

function scoreFromDists(dists) {
  if (!dists.length) return null;
  const meanD = dists.reduce((s, x) => s + x, 0) / dists.length;
  return clamp10(BAND_SCORE - STEP_DROP * meanD);
}

/** Spearman's rank correlation with average tie handling over finite numeric pairs. */
export function spearman(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const rank = arr => {
    const idx = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Float64Array(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && idx[j + 1].v === idx[i].v) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k].i] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mx = (n + 1) / 2;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx, b = ry[i] - mx;
    num += a * b; dx2 += a * a; dy2 += b * b;
  }
  return dx2 > 0 && dy2 > 0 ? num / Math.sqrt(dx2 * dy2) : 0;
}

const CANON_KEY = {
  Unity: 'unity',
  Complexity: 'complexity',
  Intensity: 'intensity',
  Arc: 'arc',
  Surprise: 'surprise',
  'Music fit': 'musicFit',
  Restraint: 'restraint',
};

/**
 * Load `ratings.json` from the reference library if present, together with its
 * directory list so rated film `design.json` files can be resolved.
 */
export function loadRatings({ env = process.env, libDirs = null } = {}) {
  const dirs = libDirs ?? libraryDirs(env);
  for (const dir of dirs) {
    const f = path.join(dir, 'ratings.json');
    if (fs.existsSync(f)) {
      try {
        return { ratings: JSON.parse(fs.readFileSync(f, 'utf8')), libDirs: dirs };
      } catch {
        return { ratings: null, libDirs: dirs };
      }
    }
  }
  return { ratings: null, libDirs: dirs };
}

function resolveFilmRead(filmKey, ratings, dirs) {
  const slug = refName(filmKey);
  for (const dir of dirs) {
    for (const candidate of [filmKey, slug]) {
      if (!candidate) continue;
      const f = path.join(dir, candidate, 'design.json');
      if (fs.existsSync(f)) {
        try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* skip unreadable */ }
      }
    }
  }
  const calHit = REAL_SHOW_CARDS.find(r => r.name === filmKey || r.name === slug);
  if (calHit) return calHit;
  const entry = ratings?.[filmKey];
  if (entry?.read && typeof entry.read === 'object') return entry.read;
  return null;
}

/**
 * Grade a watched film (or `design.json` / `REAL_SHOW_CARDS` row) across the
 * seven canons calibrated against `REAL_SHOW_CARDS`.
 */
export function reportCard(read, { cal = REAL_SHOW_CARDS, ratings = null, libDirs = null } = {}) {
  const m = cardMetrics(read);

  // 1. Unity (Monroe Beardsley)
  const uEval = evalMeasures(m, cal, UNITY_SPECS);
  const uScore = scoreFromDists(uEval.dists);
  const uWhy = uScore == null
    ? 'not graded (palette and hold measures missing)'
    : `${m.hues ?? '–'} hues (band ${bandStr(bandOf(cal, 'hues'), 0)}), spread ${fmt(m.hueSpread, 2)} (${bandStr(bandOf(cal, 'hueSpread'), 2)}), gap ${fmt(m.hueGap, 0)}°, reorgs ${fmt(m.reorgPerMin, 1)}/min${m.lifetime != null ? `, lifetime ${fmt(m.lifetime, 1)} s` : ''}`;

  // 2. Complexity (Beardsley, Birkhoff, Berlyne's inverted U)
  let cEval = evalMeasures(m, cal, COMPLEXITY_SPECS);
  let cScore;
  let cWhy;
  if (m.reliability?.detail === false) {
    cScore = null;
    cWhy = `not graded (compression softness: ${m.reliability.reason ?? 'detail measures unreliable'})`;
  } else if (m.forms === 0 && (m.scaleX == null || m.spectrum == null)) {
    cScore = 0.0;
    cWhy = `0 forms a frame, no spectral or scale structure (flat ground; real shows ${bandStr(bandOf(cal, 'forms'), 0)} forms, spectrum ${bandStr(bandOf(cal, 'spectrum'), 2)})`;
  } else if (!cEval.dists.length) {
    cScore = null;
    cWhy = 'not graded (form and spectrum measures missing)';
  } else {
    // Mud penalty: greyed low colourfulness across many hues.
    const mudSteps = (m.hues ?? 0) >= 4 && m.colourfulness != null && m.colourfulness < 30
      ? (30 - m.colourfulness) / 15 : 0;
    cScore = clamp10(scoreFromDists(cEval.dists) - mudSteps * 1.5);
    cWhy = `spectrum ${fmt(m.spectrum, 2)} (${bandStr(bandOf(cal, 'spectrum'), 2)}), ${fmt(m.forms, 0)} forms (${bandStr(bandOf(cal, 'forms'), 0)}), scale ${fmt(m.scaleX, 1)}% (${bandStr(bandOf(cal, 'scaleX'), 1)}%)${mudSteps > 0 ? `; muted mud (${fmt(m.colourfulness, 0)} across ${m.hues} hues)` : ''}`;
  }

  // 3. Intensity (Monroe Beardsley)
  const iEval = evalMeasures(m, cal, INTENSITY_SPECS);
  const iScore = scoreFromDists(iEval.dists);
  const iWhy = iScore == null
    ? 'not graded (light and colour measures missing)'
    : `RMS ${fmt(m.rms, 2)} (${bandStr(bandOf(cal, 'rms'), 2)}), colourfulness ${fmt(m.colourfulness, 0)} (${bandStr(bandOf(cal, 'colourfulness'), 0)}), near-black ${m.blackMean != null ? `${(m.blackMean * 100).toFixed(0)}%` : '–'}, p5 ${fmt(m.p5, 2)}`;

  // 4. Arc (Leonard Meyer, David Huron)
  const aEval = evalMeasures(m, cal, ARC_SPECS);
  let aScore = null;
  let aWhy;
  if (m.arcShape === 'still' || m.still) {
    aScore = 0.5;
    aWhy = 'still picture with no build, peak or release';
  } else if (!aEval.dists.length) {
    aScore = null;
    aWhy = 'not graded (motion arc measures missing)';
  } else {
    const raw = scoreFromDists(aEval.dists);
    const capped = m.arcShape === 'holds' ? Math.min(raw, SCORE_ON_HOLD_MAX) : raw;
    aScore = round1(capped);
    aWhy = `${m.arcShape ?? 'arc'} (thirds spread ${fmt(m.thirdsSpread, 2)}, peak ${fmt(m.peakOver, 1)}× median, surge ${fmt(m.surge, 2)})`;
  }

  // 5. Surprise (David Huron, Daniel Berlyne's inverted U)
  const sEval = evalMeasures(m, cal, SURPRISE_SPECS);
  const sScore = m.still ? 0.5 : scoreFromDists(sEval.dists);
  const sWhy = m.still
    ? 'still picture with no pattern breaks'
    : sScore == null
      ? 'not graded (reorganisation and swell measures missing)'
      : `${fmt(m.reorgPerMin, 1)} reorgs/min (band ${bandStr(bandOf(cal, 'reorgPerMin'), 1)}), ${fmt(m.swellsPerMin, 1)} swells/min (${bandStr(bandOf(cal, 'swellsPerMin'), 1)})`;

  // 6. Music fit (David Huron): "not graded" (score null) when no audio track
  const mEval = evalMeasures(m, cal, MUSIC_SPECS);
  let mScore = null;
  let mWhy;
  if (m.sync == null || !Number.isFinite(m.sync)) {
    mScore = null;
    mWhy = 'not graded (no audio track or flat sound)';
  } else {
    const lagBand = bandOf(cal, 'lag');
    const lagAbs = m.lag != null ? Math.abs(m.lag) : 0;
    const calLagMax = lagBand ? Math.max(Math.abs(lagBand[0]), Math.abs(lagBand[1]), 0.5) : 0.5;
    const syncDist = stepDistance(m.sync, bandOf(cal, 'sync'), 0.2, 'linear', 'lowOnly') ?? 0;
    const lagDist = Math.max(0, lagAbs - calLagMax) / 0.5;
    // Reward higher correlation monotonically inside/above the single real audio reference.
    const base = m.sync >= 0.4 ? Math.min(9.5, 8.8 + (m.sync - 0.4) * 1.2) : 8.5 - syncDist * 2.2;
    mScore = clamp10(base - lagDist * 1.5);
    mWhy = `motion-sound r ${fmt(m.sync, 2)} (band >= ${bandStr(bandOf(cal, 'sync'), 2)}), lag ${fmt(m.lag ?? 0, 2)} s`;
  }

  // 7. Restraint (the wet show)
  const rEval = evalMeasures(m, cal, RESTRAINT_SPECS);
  const rScore = scoreFromDists(rEval.dists);
  const rWhy = rScore == null
    ? 'not graded (dark space and calm measures missing)'
    : `near-black ${m.blackMean != null ? `${(m.blackMean * 100).toFixed(0)}%` : '–'} (${m.blackMean != null ? `${(bandOf(cal, 'blackMean')[0] * 100).toFixed(0)}–${(bandOf(cal, 'blackMean')[1] * 100).toFixed(0)}%` : '–'}), rest ${fmt(m.longestRest, 1)} s, calm ${m.calm != null ? `${(m.calm * 100).toFixed(0)}%` : '–'}`;

  const cleanMeasures = ms => ms.map(({ measure, value, band }) => ({ measure, value, band }));
  const evalsByName = new Map([
    ['Unity', uEval], ['Complexity', cEval], ['Intensity', iEval],
    ['Arc', aEval], ['Surprise', sEval], ['Music fit', mEval], ['Restraint', rEval],
  ]);

  const canons = [
    { name: 'Unity', score: uScore, measures: cleanMeasures(uEval.measures), why: uWhy, source: 'Monroe Beardsley' },
    { name: 'Complexity', score: cScore, measures: cleanMeasures(cEval.measures), why: cWhy, source: 'Monroe Beardsley; George Birkhoff; Daniel Berlyne' },
    { name: 'Intensity', score: iScore, measures: cleanMeasures(iEval.measures), why: iWhy, source: 'Monroe Beardsley' },
    { name: 'Arc', score: aScore, measures: cleanMeasures(aEval.measures), why: aWhy, source: 'Leonard Meyer; David Huron' },
    { name: 'Surprise', score: sScore, measures: cleanMeasures(sEval.measures), why: sWhy, source: 'David Huron; Daniel Berlyne' },
    { name: 'Music fit', score: mScore, measures: cleanMeasures(mEval.measures), why: mWhy, source: 'David Huron' },
    { name: 'Restraint', score: rScore, measures: cleanMeasures(rEval.measures), why: rWhy, source: 'the wet show' },
  ];

  // Verdict: two or three sentences: strongest, weakest, and the one change to lift weakest most.
  const graded = canons.filter(c => c.score != null).sort((a, b) => b.score - a.score);
  const ungraded = canons.filter(c => c.score == null).map(c => c.name);
  let verdict;
  if (!graded.length) {
    verdict = 'Too few measures to grade this clip against the real-show calibration.';
  } else {
    const strongest = graded.slice(0, 2).map(c => `${c.name} (${c.score.toFixed(1)})`).join(' and ');
    const weakest = graded.at(-1);
    const secondWeak = graded.length > 2 && graded.at(-2).score < weakest.score + 0.6 ? ` and ${graded.at(-2).name} (${graded.at(-2).score.toFixed(1)})` : '';
    const wMeasures = evalsByName.get(weakest.name)?.measures ?? [];
    const worst = [...wMeasures].filter(x => x.dist != null).sort((a, b) => b.dist - a.dist)[0];
    let lift;
    if (worst && worst.dist > 0 && worst.band) {
      const dir = worst.value < worst.band[0] ? 'raising' : 'lowering';
      const target = worst.value < worst.band[0] ? worst.band[0] : worst.band[1];
      lift = `${dir} ${worst.measure} from ${fmt(worst.value)} toward ${fmt(target)} would lift ${weakest.name} most`;
    } else {
      lift = `giving ${weakest.name} more breathing room would lift it most`;
    }
    verdict = `Strongest on ${strongest}; weakest on ${weakest.name} (${weakest.score.toFixed(1)})${secondWeak}.${ungraded.length ? ` Not graded: ${ungraded.join(', ')}.` : ''} Most helpful change: ${lift}.`;
  }

  // Owner ratings agreement (Spearman's rho per canon where n >= 3).
  const agreement = {};
  const agreementParts = [];
  if (ratings && typeof ratings === 'object') {
    const dirs = libDirs ?? libraryDirs();
    const cachedCards = new Map();
    for (const filmKey of Object.keys(ratings)) {
      const entry = ratings[filmKey];
      if (!entry || typeof entry !== 'object') continue;
      const rRead = resolveFilmRead(filmKey, ratings, dirs);
      if (!rRead) continue;
      cachedCards.set(filmKey, reportCard(rRead, { cal, ratings: null }));
    }
    for (const canon of canons) {
      const rKey = CANON_KEY[canon.name];
      const toolScores = [], ownerScores = [];
      for (const [filmKey, subCard] of cachedCards) {
        const entry = ratings[filmKey];
        const oVal = entry?.[rKey] ?? entry?.[canon.name] ?? entry?.[canon.name.toLowerCase()];
        const cEntry = subCard.canons.find(c => c.name === canon.name);
        if (typeof oVal === 'number' && Number.isFinite(oVal) && cEntry?.score != null && Number.isFinite(cEntry.score)) {
          toolScores.push(cEntry.score);
          ownerScores.push(oVal);
        }
      }
      if (toolScores.length >= 3) {
        const rho = spearman(toolScores, ownerScores);
        agreement[canon.name] = { rho, n: toolScores.length };
        agreementParts.push(`${canon.name} rho ${rho.toFixed(2)} (n=${toolScores.length})`);
      }
    }
  }

  const lines = formatCardLines({ canons, verdict, agreementParts });
  return { canons, verdict, agreement, lines };
}

/** Format report-card lines for `summary.md` (`"Canon 7.2/10: <why>"`, then verdict). */
export function formatCardLines({ canons, verdict, agreementParts = [] }) {
  const rows = canons.map(c => (
    c.score == null
      ? `${c.name} not graded: ${c.why}`
      : `${c.name} ${c.score.toFixed(1)}/10: ${c.why}`
  ));
  return [
    ...rows,
    '',
    verdict,
    ...(agreementParts.length ? ['', `Agreement with owner ratings (Spearman's rho): ${agreementParts.join('; ')}`] : []),
  ];
}

/** Side-by-side table comparing this film's report card against a reference's card. */
export function formatSideBySideCards(curCard, refCard, refTitle = 'reference') {
  if (!curCard?.canons || !refCard?.canons) return [];
  const fmtS = c => (c?.score == null ? 'not graded' : `${c.score.toFixed(1)}/10`);
  const out = [
    `## Report card (side by side: this film vs ${refTitle})`,
    '',
    `| Canon | This film | ${refTitle} |`,
    '|---|---|---|',
  ];
  for (let i = 0; i < curCard.canons.length; i++) {
    const a = curCard.canons[i];
    const b = refCard.canons.find(c => c.name === a.name) ?? refCard.canons[i];
    out.push(`| ${a.name} | ${fmtS(a)} | ${fmtS(b)} |`);
  }
  return out;
}
