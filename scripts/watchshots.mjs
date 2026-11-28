/**
 * The shot list (PLAN 47p-5): where each cut falls to the frame, how long
 * each shot runs, each shot's palette, and how many of the cuts land on a
 * beat of the music. Beside watch.mjs, which hands it the samples' rows, the
 * cuts it found, the sound it decoded and how to decode the picture again.
 *
 * Who asked: an editor reads a film by its cutting first (where the cuts
 * fall, the average shot length, whether the picture is cut to the music),
 * and a colourist by whether shots match. watch.mjs found the cuts, but only
 * to the sample (a quarter of a second at the usual four a second), which is
 * too coarse to say whether a cut sits on a beat: at 120 bpm a beat comes
 * every half second, so a cut known only to within a quarter of a second
 * would land "on a beat" half the time by chance. So:
 *
 *   1. Every hard cut is found again to the frame. The picture is decoded
 *      once more at its own frame rate, at 32x18 grey (cheap: the decoder's
 *      work is the same pass the samples cost, the output a few hundred bytes
 *      a frame), and inside the one sample interval where watch.mjs saw the
 *      cut, the cut is the frame that differs most from the one before. A
 *      dissolve has no one frame; it keeps its middle and is left out of the
 *      beat count (a dissolve is not cut on anything).
 *
 *   2. The beat comes from the sound itself, not the loudness rows (one value
 *      a sample, again too coarse). An onset envelope at 10 ms hops: the rise
 *      in log energy over the hops before, on the whole band and on the low
 *      band (a one-pole filter at about 150 Hz, where a kick drum sits), so a
 *      drum hit under a held chord still rises. The beats are then tracked
 *      by dynamic programming over that envelope (Ellis 2007, "Beat tracking
 *      by dynamic programming"): each hop's score is its own onset strength
 *      plus the best score one beat period back, less a penalty for a gap
 *      unlike the period. This is the method librosa uses, and it was chosen
 *      over the obvious one, a grid at the tempo from the envelope's
 *      autocorrelation, because a grid drifts: a period off by one 10 ms hop
 *      is a whole beat off after fifty beats, and three minutes at 120 bpm is
 *      360. The tracker follows the music's own beats and so cannot drift.
 *
 *   3. A cut is on a beat when it falls within BEAT_TOL of one. 70 ms is
 *      about two frames at 30 fps, the window an editor cutting "on the beat"
 *      by eye lands in. Every such count is printed beside what chance alone
 *      would give (twice the tolerance over the beat period: 28% at 120 bpm),
 *      because a share of cuts on a beat means nothing without it.
 *
 * A palette per shot is the shot's colour histogram (the 4x4x4 one the cut
 * test already keeps on every row) summed over its samples, its strongest
 * bins as colours. Coarse (64 colours), and said so: it tells shots apart and
 * says when one is warmer than the next, not a grade.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { esc } from './watchreport.mjs';

export const BEAT_TOL = 0.07;
export const HOP = 0.01;
/** The rise, in dB over the hops before, that counts as an onset when tempoPeriod counts them. */
export const ONSET_DB = 3;
const SR = 8000;

const stamp = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/**
 * The onset envelope of mono 8 kHz samples (Int16Array): one value every HOP
 * seconds, the rise in dB of the band energies over the three hops before,
 * summed over the whole band and the low band, never below zero. A rise is
 * counted only where the sound is above -60 dBFS, so the noise floor of a
 * quiet passage does not make onsets.
 */
export function onsetEnvelope(pcm, sr = SR) {
  const per = Math.round(sr * HOP), n = Math.floor(pcm.length / per);
  const full = new Float64Array(n), low = new Float64Array(n);
  const a = 1 - Math.exp(-2 * Math.PI * 150 / sr);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    let e = 0, el = 0;
    for (let j = i * per; j < (i + 1) * per; j++) {
      const x = pcm[j] / 32768;
      lp += a * (x - lp);
      e += x * x; el += lp * lp;
    }
    full[i] = 10 * Math.log10(e / per + 1e-10);
    low[i] = 10 * Math.log10(el / per + 1e-10);
  }
  const env = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    let r = 0;
    for (const L of [full, low]) {
      if (L[i] < -60) continue;
      const before = Math.max(L[i - 1], L[Math.max(0, i - 2)], L[Math.max(0, i - 3)]);
      r += Math.max(0, L[i] - Math.max(before, -60));
    }
    env[i] = r;
  }
  return env;
}

/**
 * The tempo's period in hops from the envelope's autocorrelation over 60 to
 * 200 bpm, weighted toward 120 bpm on a log scale (as beat trackers do, so a
 * track whose half-time and double-time both correlate gets the one a
 * listener taps). Null when the envelope has no periodic structure: its best
 * lag correlates under 0.1 of its zero lag, or it has fewer than eight
 * onsets (rises of ONSET_DB or more). The count matters more than it looks:
 * a steady 220 Hz tone, measured in 10 ms hops, rises and falls by a few
 * tenths of a dB as its cycles fall across the hops, and that ripple repeats
 * every half second (110 whole cycles), so its autocorrelation found 120 bpm
 * in a tone with no beat at all (the first run of `npm run watchshots`).
 */
export function tempoPeriod(env) {
  const n = env.length;
  if (n < 400) return null;
  let peaks = 0;
  for (let i = 1; i + 1 < n; i++) if (env[i] >= ONSET_DB && env[i] >= env[i - 1] && env[i] > env[i + 1]) peaks++;
  if (peaks < 8) return null;
  let mean = 0; for (const v of env) mean += v; mean /= n;
  const x = Float64Array.from(env, v => v - mean);
  let r0 = 0; for (const v of x) r0 += v * v;
  if (!(r0 > 0)) return null;
  const lo = Math.round(0.3 / HOP), hi = Math.round(1.0 / HOP);
  let best = null, bestW = -Infinity, bestR = 0;
  for (let lag = lo; lag <= hi; lag++) {
    let r = 0; for (let i = lag; i < n; i++) r += x[i] * x[i - lag];
    r /= r0;
    const bpm = 60 / (lag * HOP);
    const w = r * Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    if (w > bestW) { bestW = w; best = lag; bestR = r; }
  }
  return bestR >= 0.1 ? best : null;
}

/**
 * Beat times in seconds (on the clip's clock, starting at `t0`) from an onset
 * envelope, by Ellis's dynamic programme with the period from tempoPeriod.
 * Tightness 100 is librosa's default: a gap of 1.2 periods costs 3.3, a
 * strong onset after normalising is 3 to 10, so the tracker takes a beat
 * slightly off the period for a real hit but not a whole half period.
 */
export function trackBeats(env, { t0 = 0, tightness = 100 } = {}) {
  const P = tempoPeriod(env);
  if (!P) return { beats: [], period: null, bpm: null };
  const n = env.length;
  let sd = 0, m = 0; for (const v of env) m += v; m /= n;
  for (const v of env) sd += (v - m) ** 2; sd = Math.sqrt(sd / n) || 1;
  const o = Float64Array.from(env, v => v / sd);
  const score = new Float64Array(n), back = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = 0, arg = -1;
    for (let j = i - 2 * P; j <= i - Math.round(P / 2); j++) {
      if (j < 0) continue;
      const pen = -tightness * Math.log((i - j) / P) ** 2;
      const s = score[j] + pen;
      if (arg < 0 || s > best) { best = s; arg = j; }
    }
    score[i] = o[i] + (arg >= 0 ? best : 0);
    back[i] = arg >= 0 && best > 0 ? arg : -1;
  }
  // The last beat: the best score in the final period (scores grow along
  // the clip, so the overall maximum would always sit at its very end).
  let end = n - 1;
  for (let i = Math.max(0, n - P); i < n; i++) if (score[i] > score[end]) end = i;
  const beats = [];
  for (let i = end; i >= 0; i = back[i]) { beats.push(t0 + i * HOP); if (back[i] < 0) break; }
  beats.reverse();
  return { beats, period: P * HOP, bpm: 60 / (P * HOP) };
}

/** Each frame of the watched window as 32x18 grey, with its time on the samples' clock. */
function tinyFrames({ ff, seek, pre = '', from = 0 }) {
  return new Promise((resolve, reject) => {
    const p = spawn(ff, ['-hide_banner', '-nostats', ...seek, '-an', '-vf', `${pre}setpts=PTS-STARTPTS,scale=32:18:flags=area,format=gray,showinfo`,
      '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1']);
    const chunks = []; let err = '';
    p.stdout.on('data', d => chunks.push(d));
    p.stderr.on('data', d => (err += d));
    p.on('close', code => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}\n${err.slice(-400)}`));
      const times = [...err.matchAll(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:\s*(-?[\d.]+)/g)].map(m => from + Number(m[1]));
      const b = Buffer.concat(chunks), size = 32 * 18, frames = [];
      for (let i = 0; i < Math.min(times.length, Math.floor(b.length / size)); i++) frames.push({ t: times[i], px: b.subarray(i * size, (i + 1) * size) });
      resolve(frames);
    });
  });
}

/**
 * A hard cut's time to the frame: inside (t(k-1), t(k)], the frame that
 * differs most from the one before it. The sample at k is the last frame at
 * or before t(k) (watch.mjs's clock), so the new shot's first frame lies in
 * that interval. Falls back to t(k) when no frame lies there.
 */
export function refineCut(frames, tPrev, tCut) {
  let best = null, bestD = -1;
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i];
    if (f.t <= tPrev + 1e-6 || f.t > tCut + 1e-6) continue;
    let d = 0; const a = frames[i - 1].px, b = f.px;
    for (let j = 0; j < a.length; j++) d += Math.abs(a[j] - b[j]);
    if (d > bestD) { bestD = d; best = f.t; }
  }
  return best ?? tCut;
}

const hex = bin => {
  const c = v => (32 + 64 * v).toString(16).padStart(2, '0');
  return `#${c(bin >> 4)}${c((bin >> 2) & 3)}${c(bin & 3)}`;
};

/** A shot's palette: its strongest colour bins (at least 8% of its pixels), three at most. */
export function shotPalette(rows) {
  const sum = new Float64Array(64); let n = 0;
  for (const r of rows) { if (!r.hist || r.cut || r.fade || r.title) continue; for (let i = 0; i < 64; i++) sum[i] += r.hist[i]; n++; }
  if (!n) return [];
  return [...sum].map((v, i) => ({ colour: hex(i), share: v / n })).filter(c => c.share >= 0.08).sort((a, b) => b.share - a.share).slice(0, 3);
}

/**
 * The beat read of a list of cut times: how many lie within `tol` of a beat,
 * and what chance would give. Null with no beats.
 */
export function cutsOnBeat(cutTimes, beat, tol = BEAT_TOL) {
  if (!beat?.beats?.length || !beat.period) return null;
  const bs = beat.beats;
  const offs = cutTimes.map(t => {
    let lo = 0, hi = bs.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (bs[mid] < t) lo = mid; else hi = mid; }
    const near = Math.abs(bs[lo] - t) < Math.abs(bs[hi] - t) ? bs[lo] : bs[hi];
    return t - near;
  });
  const on = offs.filter(d => Math.abs(d) <= tol).length;
  return { on, of: cutTimes.length, offsets: offs, chance: Math.min(1, (2 * tol) / beat.period), bpm: beat.bpm, tol };
}

/**
 * The whole shot list for one run. `rows`, `cuts`, `dissolves` and `rate`
 * as watch.mjs keeps them; `pcm` the sound it decoded (null without one);
 * `ff`, `seek`, `pre`, `from` to decode the picture again for the frame-exact
 * cuts; `end` the watched window's end. Writes shots.csv into `out`.
 */
export async function shotList({ rows, cuts, dissolves = [], rate, pcm = null, ff, seek, pre = '', from = 0, end, out = null }) {
  const n = rows.length;
  const stop = end ?? (n ? rows[n - 1].t + 1 / rate : 0);
  const dissolveAt = new Map(dissolves.map(v => [v.mid, v]));
  const hard = cuts.filter(k => !dissolveAt.has(k));
  let frames = [];
  if (hard.length && ff && seek) { try { frames = await tinyFrames({ ff, seek, pre, from }); } catch { frames = []; } }
  const bounds = cuts.map(k => {
    const v = dissolveAt.get(k);
    if (v) return { k, t: rows[k].t, kind: 'dissolve', from: rows[v.from].t, to: rows[v.to].t };
    return { k, t: frames.length ? refineCut(frames, rows[k - 1]?.t ?? rows[k].t - 1 / rate, rows[k].t) : rows[k].t, kind: 'cut' };
  });
  const env = pcm && pcm.length > SR ? onsetEnvelope(pcm) : null;
  const beat = env ? trackBeats(env, { t0: from }) : null;
  const onBeat = cutsOnBeat(bounds.filter(b => b.kind === 'cut').map(b => b.t), beat);
  const starts = [{ t: n ? rows[0].t : from, kind: 'start', k: 0 }, ...bounds];
  let ci = 0;
  const shots = starts.map((s, i) => {
    const e = i + 1 < starts.length ? starts[i + 1].t : stop;
    const k1 = i + 1 < starts.length ? starts[i + 1].k : n;
    const off = s.kind === 'cut' && onBeat ? onBeat.offsets[ci++] : null;
    return { n: i + 1, start: s.t, end: e, length: e - s.t, startsWith: s.kind,
      onBeat: off == null ? null : Math.abs(off) <= BEAT_TOL, beatOffset: off, palette: shotPalette(rows.slice(s.k, k1)) };
  });
  const lens = shots.map(s => s.length);
  const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
  const res = { count: shots.length, avg, shortest: Math.min(...lens), longest: Math.max(...lens), shots,
    beat: beat?.bpm ? { bpm: beat.bpm, beats: beat.beats.length } : null, onBeat: onBeat && { on: onBeat.on, of: onBeat.of, chance: onBeat.chance, tol: onBeat.tol },
    frameExact: frames.length > 0 };
  res.lines = shotLines(res, { hasSound: !!pcm });
  if (out) res.csv = writeShotsCsv(res, out);
  return res;
}

/** The summary's lines for a shot list. */
export function shotLines(s, { hasSound = true } = {}) {
  const pace = s.count > 1
    ? `${s.count} shots, average ${s.avg.toFixed(1)} s (shortest ${s.shortest.toFixed(1)} s, longest ${s.longest.toFixed(1)} s)`
    : `one shot, ${s.avg.toFixed(1)} s, no cuts`;
  let beatLine;
  if (!hasSound) beatLine = 'no sound, so no beat to cut on';
  else if (!s.beat) beatLine = 'no steady beat found in the sound';
  else if (!s.onBeat?.of) beatLine = `a beat at about ${s.beat.bpm.toFixed(0)} bpm, no hard cuts to land on it`;
  else beatLine = `${s.onBeat.on} of ${s.onBeat.of} hard cuts on a beat (within ${Math.round(s.onBeat.tol * 1000)} ms) at about ${s.beat.bpm.toFixed(0)} bpm, against ${Math.round(s.onBeat.of * s.onBeat.chance * 10) / 10} by chance (${(s.onBeat.chance * 100).toFixed(0)}%)`;
  return [`- shots: ${pace}; ${beatLine}${s.count > 1 && !s.frameExact ? '; cut times to the sample only' : ''}`];
}

function writeShotsCsv(s, out) {
  const f = path.join(out, 'shots.csv');
  const q = v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ['shot,start_s,end_s,length_s,starts_with,on_beat,beat_offset_s,palette',
    ...s.shots.map(x => [x.n, x.start.toFixed(3), x.end.toFixed(3), x.length.toFixed(3), x.startsWith, x.onBeat == null ? '' : x.onBeat ? 1 : 0,
      x.beatOffset == null ? '' : x.beatOffset.toFixed(3), q(x.palette.map(c => `${c.colour} ${(c.share * 100).toFixed(0)}%`).join(' '))].join(','))];
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
}

/** For design.json: the shot list without its summary lines. */
export function shotsOut(s) {
  if (!s) return null;
  const { lines, csv, ...rest } = s;
  return rest;
}

/** The report page's section, after the timeline (writeReport's `extra`). */
export function shotSection(s) {
  if (!s) return null;
  const sw = p => p.map(c => `<span title="${esc(c.colour)} ${(c.share * 100).toFixed(0)}%" style="display:inline-block;width:${Math.max(10, Math.round(c.share * 60))}px;height:14px;border-radius:3px;margin-right:2px;vertical-align:-2px;background:${esc(c.colour)}"></span>`).join('');
  const rows = s.shots.map(x => `<tr><td>${x.n}</td><td>${esc(stamp(x.start))}</td><td>${x.length.toFixed(1)} s</td><td>${esc(x.startsWith)}</td><td>${x.onBeat == null ? '' : x.onBeat ? `on (${(x.beatOffset * 1000).toFixed(0)} ms)` : `off (${(x.beatOffset * 1000).toFixed(0)} ms)`}</td><td>${sw(x.palette)}</td></tr>`).join('');
  return { after: 'timeline', id: 'shots', title: 'Shot list',
    html: `<p>${esc(s.lines[0].replace(/^- shots: /, ''))}. Every shot is in shots.csv beside this page.</p><div class="scroll"><table><thead><tr><th>#</th><th>starts</th><th>length</th><th>after</th><th>beat</th><th>palette</th></tr></thead><tbody>${rows}</tbody></table></div>` };
}
