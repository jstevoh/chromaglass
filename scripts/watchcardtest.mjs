#!/usr/bin/env node
/**
 * `npm run watchcard`: contract check for PLAN 47x footage robustness,
 * artistic report card, rating agreement, and gap-to-setting suggestions.
 *
 * Builds synthetic WebM clips via ffmpeg (no network or reference library),
 * checks the returned objects and output files (never trusting self-reports
 * alone), and runs code mutants against copied modules to prove lines (a),
 * (d), and (e) fail when their rules are broken.
 *
 * Run it:
 *   FFMPEG=/opt/homebrew/Cellar/ffmpeg-full/9.0.2_1/bin/ffmpeg npm run watchcard
 *   node scripts/watchcardtest.mjs --no-mutants
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { watchVideo, findFfmpeg } from './watch.mjs';
import { reportCard, REAL_SHOW_CARDS } from './watchcard.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const W = 320, H = 180, FPS = 24;
const MUTANTS_ON = !process.argv.includes('--no-mutants');

const results = [];
const check = (name, ok, detail) => {
  results.push(!!ok);
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
};

const ff = findFfmpeg();
if (!ff) {
  console.error('ffmpeg not found (set FFMPEG=...)');
  process.exit(2);
}

// 5x7 bitmap glyphs for crisp deterministic title cards and corner logos (no font deps).
const FONT5X7 = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  'A': [14, 17, 17, 31, 17, 17, 17],
  'C': [14, 17, 16, 16, 16, 17, 14],
  'D': [30, 17, 17, 17, 17, 17, 30],
  'E': [31, 16, 16, 30, 16, 16, 31],
  'F': [31, 16, 16, 30, 16, 16, 16],
  'H': [17, 17, 17, 31, 17, 17, 17],
  'I': [14, 4, 4, 4, 4, 4, 14],
  'L': [16, 16, 16, 16, 16, 16, 31],
  'M': [17, 27, 21, 21, 17, 17, 17],
  'O': [14, 17, 17, 17, 17, 17, 14],
  'R': [30, 17, 17, 30, 20, 18, 17],
  'S': [15, 16, 16, 14, 1, 1, 30],
  'T': [31, 4, 4, 4, 4, 4, 4],
  'U': [17, 17, 17, 17, 17, 17, 14],
  'V': [17, 17, 17, 17, 17, 10, 4],
  'W': [17, 17, 17, 21, 21, 27, 17],
};

function drawText(buf, text, x0, y0, scale, rgb) {
  let x = x0;
  for (const ch of text.toUpperCase()) {
    const rows = FONT5X7[ch] ?? FONT5X7[' '];
    for (let ry = 0; ry < 7; ry++) {
      for (let rx = 0; rx < 5; rx++) {
        if (!((rows[ry] >> (4 - rx)) & 1)) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = x + rx * scale + sx, py = y0 + ry * scale + sy;
            if (px < 0 || px >= W || py < 0 || py >= H) continue;
            const i = (py * W + px) * 3;
            buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2];
          }
        }
      }
    }
    x += 6 * scale;
  }
}

async function encodeWebm(outPath, { sec, fps = FPS, bitrate = '2M', extraArgs = [], frame }) {
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0',
    '-an', '-c:v', 'libvpx', '-b:v', bitrate, ...extraArgs, '-f', 'webm', outPath,
  ];
  const p = spawn(ff, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', d => { err += d; });
  const done = new Promise((resolve, reject) => {
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.trim()}`))));
  });
  for (let f = 0; f < Math.round(fps * sec); f++) {
    const buf = frame(f);
    if (!p.stdin.write(buf)) await new Promise(r => p.stdin.once('drain', r));
  }
  p.stdin.end();
  await done;
  return outPath;
}

// Moving bright saturated liquid-like blobs over dark ground (3..4 distinct forms).
function blobFrame(f, t, { darkGrain = false, barFrac = 0, logo = false, prng = null } = {}) {
  const buf = Buffer.alloc(W * H * 3);
  const cyMin = Math.round(barFrac * H), cyMax = H - cyMin;
  const cx1 = 90 + 35 * Math.sin(t * 1.4), cy1 = 90 + 22 * Math.cos(t * 1.1);
  const cx2 = 210 + 30 * Math.cos(t * 1.2), cy2 = 75 + 24 * Math.sin(t * 1.5);
  const cx3 = 160 + 28 * Math.sin(t * 0.9 + 1.4), cy3 = 120 + 18 * Math.cos(t * 1.3);
  for (let y = 0; y < H; y++) {
    const inBar = barFrac > 0 && (y < cyMin || y >= cyMax);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      if (inBar) { buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; continue; }
      const d1 = Math.exp(-(((x - cx1) ** 2 + (y - cy1) ** 2) / (2 * 22 ** 2)));
      const d2 = Math.exp(-(((x - cx2) ** 2 + (y - cy2) ** 2) / (2 * 20 ** 2)));
      const d3 = Math.exp(-(((x - cx3) ** 2 + (y - cy3) ** 2) / (2 * 18 ** 2)));
      let g = 0;
      if (darkGrain) {
        const s = Math.sin(x * 0.37 + y * 0.29 + f * 1.7) * 43758.5453;
        const n = (s - Math.floor(s)) * 12;
        g = Math.round(4 + n + 8 * Math.max(0, Math.sin(x * 0.04 + t * 0.8)));
      }
      const r = Math.min(255, Math.round(g + 240 * d1 + 190 * d3));
      const gr = Math.min(255, Math.round(g + 120 * d1 + 215 * d2 + 50 * d3));
      const b = Math.min(255, Math.round(g + 35 * d1 + 235 * d2 + 220 * d3));
      buf[i] = r; buf[i + 1] = gr; buf[i + 2] = b;
    }
  }
  if (prng) {
    // Optional deterministic dither for non-grain variants
    void prng;
  }
  if (logo) {
    for (let y = 10; y < 34; y++) {
      for (let x = 10; x < 64; x++) {
        const i = (y * W + x) * 3;
        buf[i] = 245; buf[i + 1] = 245; buf[i + 2] = 245;
      }
    }
    drawText(buf, 'LIVE', 13, 15, 2, [15, 15, 15]);
  }
  return buf;
}

function titleCardFrame() {
  const buf = Buffer.alloc(W * H * 3);
  drawText(buf, 'SHOW', 58, 46, 3, [245, 245, 245]);
  drawText(buf, '1968', 58, 92, 3, [245, 245, 245]);
  return buf;
}

// Non-periodic rich texture for reliable camera pan & optical-flow matching.
function texAt(u, v) {
  const a = 0.5 + 0.5 * Math.sin(u * 0.071 + Math.cos(v * 0.053) * 1.7);
  const b = 0.5 + 0.5 * Math.cos(v * 0.089 - Math.sin(u * 0.041) * 1.5);
  const c = 0.5 + 0.5 * Math.sin((u + v) * 0.13 + Math.sin((u - v) * 0.037) * 2.1);
  const fin = 0.5 + 0.5 * Math.sin(u * 0.31 + v * 0.23) * Math.cos(u * 0.19 - v * 0.27);
  const r = Math.min(255, Math.max(0, Math.round(35 + 165 * a + 45 * fin)));
  const g = Math.min(255, Math.max(0, Math.round(25 + 170 * b + 40 * c)));
  const bl = Math.min(255, Math.max(0, Math.round(40 + 160 * c + 40 * (1 - a))));
  return [r, g, bl];
}

function panFrame(t, { camPctPerSec, dishOwnPctPerSec = 0 }) {
  const buf = Buffer.alloc(W * H * 3);
  const camShiftX = (camPctPerSec / 100) * W * t;
  const ownShiftX = (dishOwnPctPerSec / 100) * W * t;
  const cx = W / 2, cy = H / 2, r2 = 52 ** 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inside = dishOwnPctPerSec !== 0 && ((x - cx) ** 2 + (y - cy) ** 2) < r2;
      const sx = x - camShiftX - (inside ? ownShiftX : 0);
      const [r, g, b] = texAt(sx, y);
      const i = (y * W + x) * 3;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
    }
  }
  return buf;
}

function flatGreyFrame() {
  const buf = Buffer.alloc(W * H * 3);
  buf.fill(128);
  return buf;
}

// Slow two-hue plate on black with a quiet hold in the middle third.
function slowTwoFrame(t) {
  const buf = Buffer.alloc(W * H * 3);
  const pause = t >= 1.2 && t <= 2.4 ? 1.2 : (t > 2.4 ? t - 1.2 : t);
  const cx1 = 120 + 18 * Math.sin(pause * 0.6), cy1 = 90 + 10 * Math.cos(pause * 0.5);
  const cx2 = 195 + 16 * Math.cos(pause * 0.5), cy2 = 95 + 12 * Math.sin(pause * 0.6);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const d1 = Math.exp(-(((x - cx1) ** 2 + (y - cy1) ** 2) / (2 * 24 ** 2)));
      const d2 = Math.exp(-(((x - cx2) ** 2 + (y - cy2) ** 2) / (2 * 22 ** 2)));
      buf[i] = Math.min(255, Math.round(230 * d1 + 220 * d2));
      buf[i + 1] = Math.min(255, Math.round(80 * d1 + 170 * d2));
      buf[i + 2] = Math.min(255, Math.round(20 * d1 + 25 * d2));
    }
  }
  return buf;
}

// Dense many-hued fast-churning pattern filling 100% of the frame with rapid hue shifts.
function fastDenseFrame(f, t) {
  const buf = Buffer.alloc(W * H * 3);
  const phase = Math.floor(t * 2.5) * 1.9 + t * 5.5;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const hue = (((x * 3.5 + y * 2.2) / 35 + phase + 0.8 * Math.sin(x * 0.08 - t * 4)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const r = Math.round(135 + 115 * Math.cos(hue));
      const g = Math.round(135 + 115 * Math.cos(hue - (2 * Math.PI) / 3));
      const b = Math.round(135 + 115 * Math.cos(hue - (4 * Math.PI) / 3));
      const i = (y * W + x) * 3;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
    }
  }
  return buf;
}

async function runSuite(runWatch, dir, clips) {
  const out = [];
  const rec = (id, name, ok, detail) => out.push({ id, name, ok: !!ok, detail });

  // (a) letterbox: 12% bars top & bottom cropped within 1%; dark grainy ground NOT cropped
  const rLb = await runWatch(clips.letterbox, { out: path.join(dir, 'out-lb'), rate: 4, quiet: true });
  const rDg = await runWatch(clips.darkgrain, { out: path.join(dir, 'out-dg'), rate: 4, quiet: true });
  const ac = rLb.footage?.autocrop;
  rec('a', 'letterbox: 12% top/bottom bars cropped within 1%; dark grainy ground left uncropped',
    ac && Math.abs(ac.y - 0.12) <= 0.01 && Math.abs(ac.h - 0.76) <= 0.01 && ac.x <= 0.01 && rDg.footage?.autocrop === null,
    `lb=${ac ? `y=${ac.y.toFixed(3)},h=${ac.h.toFixed(3)}` : 'null'}, dg=${rDg.footage?.autocrop ? 'cropped' : 'null'}`);

  // (b) overlay: still white logo in corner masked, matching clean plate within 1 step
  const rPlain = await runWatch(clips.plain, { out: path.join(dir, 'out-plain'), rate: 4, quiet: true });
  const rLogo = await runWatch(clips.logo, { out: path.join(dir, 'out-logo'), rate: 4, quiet: true });
  const dCol = Math.abs((rLogo.design.colourfulness?.med ?? 0) - (rPlain.design.colourfulness?.med ?? 0));
  const fL = rLogo.design.forms?.med ?? 0, fP = rPlain.design.forms?.med ?? 0;
  const fRatio = fL && fP ? Math.max(fL / fP, fP / fL) : (fL === fP ? 1 : 99);
  rec('b', 'overlay: still corner logo found and masked; colourfulness and forms match plain plate within one step',
    (rLogo.footage?.overlays?.length ?? 0) >= 1 && dCol < 15 && fRatio < 1.5,
    `overlays=${rLogo.footage?.overlays?.length ?? 0}, dCol=${dCol.toFixed(1)}, forms=${fL.toFixed(2)}/${fP.toFixed(2)}`);

  // (c) title card: 2 s white-on-black text before moving plate excluded; reads match within one step
  const rTitle = await runWatch(clips.title, { out: path.join(dir, 'out-title'), rate: 4, quiet: true });
  const span = rTitle.footage?.titleSpans?.[0];
  const dColT = Math.abs((rTitle.design.colourfulness?.med ?? 0) - (rPlain.design.colourfulness?.med ?? 0));
  const dRmsT = Math.abs((rTitle.design.rms?.med ?? 0) - (rPlain.design.rms?.med ?? 0));
  const dLumT = Math.abs((rTitle.design.lumMean?.med ?? 0) - (rPlain.design.lumMean?.med ?? 0));
  rec('c', 'title card: 2 s text span excluded; design reads match plate alone within one step',
    span && span.from <= 0.25 && span.to >= 1.75 && dColT < 15 && dRmsT < 0.05 && dLumT < 0.08,
    `span=${span ? `${span.from.toFixed(2)}-${span.to.toFixed(2)}s` : 'none'}, dCol=${dColT.toFixed(1)}, dRms=${dRmsT.toFixed(3)}, dLum=${dLumT.toFixed(3)}`);

  // (d) camera: panned still plate -> own < 0.1*cam & cameraShare > 0.8; counter-drifting dish within 20%
  const rPan = await runWatch(clips.pan, { out: path.join(dir, 'out-pan'), rate: 4, quiet: true });
  const rCpan = await runWatch(clips.cpan, { out: path.join(dir, 'out-cpan'), rate: 4, quiet: true });
  const camSpd = rPan.design.physics?.camera?.med ?? 0;
  const panOwn = rPan.design.physics?.own?.med ?? 99;
  const panShare = rPan.design.physics?.cameraShare ?? 0;
  const flH = rCpan.design.physics?.fluid?.horizontal ?? 0;
  const cCamU = rCpan.design.physics?.camera?.u ?? 0;
  rec('d', 'camera: panned plate reads own < 0.1*pan and cameraShare > 0.8; counter-drifting dish reads own drift within 20%',
    camSpd > 4 && panOwn < 0.1 * camSpd && panShare > 0.8
      && Math.abs(flH - 3.75) <= 0.2 * 3.75 && cCamU < -4,
    `panOwn=${panOwn.toFixed(2)}, cam=${camSpd.toFixed(2)}, camShare=${panShare.toFixed(2)}, counterCamU=${cCamU.toFixed(2)}, fluidH=${flH.toFixed(2)} (exp 3.75)`);

  // (e) compression: low bitrate flags detail unreliable and prints note; high bitrate stays reliable
  const rHi = await runWatch(clips.hi, { out: path.join(dir, 'out-hi'), rate: 4, quiet: true });
  const rLo = await runWatch(clips.lo, { out: path.join(dir, 'out-lo'), rate: 4, quiet: true });
  const loSum = fs.readFileSync(path.join(rLo.out, 'summary.md'), 'utf8');
  rec('e', 'compression: very low bitrate flags detail measures unreliable; high bitrate does not',
    rHi.footage?.reliable?.detail === true && rHi.design.edgeWidth?.reliable !== false
      && rLo.footage?.reliable?.detail === false && rLo.design.edgeWidth?.reliable === false
      && rLo.design.physics?.spectrum?.reliable === false && loSum.includes('unreliable (compression)'),
    `hi=${rHi.footage?.reliable?.detail} (bpp=${rHi.footage?.bpp?.toFixed(3)}), lo=${rLo.footage?.reliable?.detail} (blk=${rLo.footage?.blockiness?.toFixed(2)}, bpp=${rLo.footage?.bpp?.toFixed(3)})`);

  // (f) report card: ranges, no-sound Music fit null, REAL_SHOW_CARDS >= 6, flat grey low Intensity/Complexity,
  // and dense/many-hued/fast lower on Unity & Restraint than slow two-hue on black.
  const CANON_NAMES = ['Unity', 'Complexity', 'Intensity', 'Arc', 'Surprise', 'Music fit', 'Restraint'];
  const cPlain = rPlain.card;
  const shapesOk = Array.isArray(cPlain?.canons) && cPlain.canons.length === 7
    && cPlain.canons.every((c, i) => c.name === CANON_NAMES[i] && typeof c.why === 'string' && c.why.length > 0
      && (c.score === null || (typeof c.score === 'number' && c.score >= 0 && c.score <= 10)));
  const mfPlain = cPlain?.canons?.find(c => c.name === 'Music fit');
  const cLoComp = rLo.card?.canons?.find(c => c.name === 'Complexity');
  const calSelfOk = REAL_SHOW_CARDS.every(row => {
    const cr = reportCard(row);
    return cr.canons.every(c => c.score === null || c.score >= 6);
  });
  const rGrey = await runWatch(clips.grey, { out: path.join(dir, 'out-grey'), rate: 4, quiet: true });
  const rSlow = await runWatch(clips.slowTwo, { out: path.join(dir, 'out-slow'), rate: 4, quiet: true });
  const rFast = await runWatch(clips.fastDense, { out: path.join(dir, 'out-fast'), rate: 4, quiet: true });
  const canonOf = (r, name) => r.card?.canons?.find(c => c.name === name)?.score;
  const gInt = canonOf(rGrey, 'Intensity'), gCmp = canonOf(rGrey, 'Complexity');
  const sUni = canonOf(rSlow, 'Unity'), fUni = canonOf(rFast, 'Unity');
  const sRes = canonOf(rSlow, 'Restraint'), fRes = canonOf(rFast, 'Restraint');
  const plainSum = fs.readFileSync(path.join(rPlain.out, 'summary.md'), 'utf8');
  const fOk = shapesOk && mfPlain?.score === null && cLoComp?.score === null && calSelfOk
    && plainSum.includes('## Report card') && plainSum.indexOf('## Report card') > plainSum.indexOf('## Overall')
    && gInt != null && gInt <= 4 && gCmp != null && gCmp <= 2
    && fUni != null && sUni != null && fUni < sUni && fRes != null && sRes != null && fRes < sRes;
  rec('f', 'report card: bounds, no-sound Music fit null, calibration rows >= 6, flat grey low, fast/dense < slow two-hue on Unity & Restraint',
    fOk,
    `mf=${mfPlain?.score}, compLo=${cLoComp?.score}, calSelf=${calSelfOk}, grey(I=${gInt},C=${gCmp}), slow(U=${sUni},R=${sRes}), fast(U=${fUni},R=${fRes})`);

  // (g) ratings: temp library ratings.json read and Spearman rho printed with n
  const tmpLib = path.join(dir, 'temp-lib');
  fs.mkdirSync(tmpLib, { recursive: true });
  const rateFilms = [
    { name: 'grey-film', doc: JSON.parse(fs.readFileSync(path.join(rGrey.out, 'design.json'), 'utf8')), intensity: 1, unity: 3 },
    { name: 'slow-film', doc: JSON.parse(fs.readFileSync(path.join(rSlow.out, 'design.json'), 'utf8')), intensity: 4, unity: 5 },
    { name: 'plain-film', doc: JSON.parse(fs.readFileSync(path.join(rPlain.out, 'design.json'), 'utf8')), intensity: 5, unity: 4 },
    { name: 'fast-film', doc: JSON.parse(fs.readFileSync(path.join(rFast.out, 'design.json'), 'utf8')), intensity: 3, unity: 1 },
  ];
  const ratingsObj = {};
  for (const rf of rateFilms) {
    const fDir = path.join(tmpLib, rf.name);
    fs.mkdirSync(fDir, { recursive: true });
    fs.writeFileSync(path.join(fDir, 'design.json'), JSON.stringify(rf.doc));
    ratingsObj[rf.name] = { intensity: rf.intensity, unity: rf.unity, note: 'synthetic test' };
  }
  fs.writeFileSync(path.join(tmpLib, 'ratings.json'), JSON.stringify(ratingsObj, null, 2));
  const prevEnv = process.env.CHROMAGLASS_REFERENCES;
  let rRated = null, ratedSum = '';
  try {
    process.env.CHROMAGLASS_REFERENCES = tmpLib;
    rRated = await runWatch(clips.plain, { out: path.join(dir, 'out-rated'), rate: 4, quiet: true });
    ratedSum = fs.readFileSync(path.join(rRated.out, 'summary.md'), 'utf8');
  } finally {
    if (prevEnv === undefined) delete process.env.CHROMAGLASS_REFERENCES;
    else process.env.CHROMAGLASS_REFERENCES = prevEnv;
  }
  const intAg = rRated?.card?.agreement?.Intensity;
  const uniAg = rRated?.card?.agreement?.Unity;
  rec('g', 'ratings: ratings.json in a temp library is read and prints Spearman agreement with n',
    intAg && intAg.n === 4 && Number.isFinite(intAg.rho) && uniAg && uniAg.n === 4
      && ratedSum.includes("Spearman's rho") && ratedSum.includes('n=4'),
    `Intensity rho=${intAg?.rho?.toFixed(2)} (n=${intAg?.n}), Unity rho=${uniAg?.rho?.toFixed(2)} (n=${uniAg?.n})`);

  return out;
}

const MUTANTS = [
  { id: 'a', file: 'watchfootage.mjs', find: 'if (!top && !bottom && !left && !right) return null;', replace: 'return null;' },
  { id: 'd', file: 'watchphysics.mjs', find: 'return { cu, cv, speed: Math.hypot(cu, cv), share, rmsFluid: Math.sqrt(rem / n) };', replace: 'return { cu: 0, cv: 0, speed: 0, share: 0, rmsFluid: Math.sqrt(tot / Math.max(1, n)) };' },
  { id: 'e', file: 'watchfootage.mjs', find: 'if (blockiness >= 1.30) {\n    detailOk = false;', replace: 'if (false && blockiness >= 1.30) {\n    detailOk = false;' },
  { id: 'f', file: 'watchcard.mjs', find: 'const BAND_SCORE = 9.0;', replace: 'const BAND_SCORE = 2.0;' },
];

// For mutant (e), ensure all unreliable branches in analyseFootage are bypassed together
// so low-bitrate/blocky footage isn't caught by the secondary branch either.
const MUTANT_E_EXTRA = [
  ['else if (bpp != null && bpp < 0.015', 'else if (false && bpp != null && bpp < 0.015'],
  ['else if (bpp != null && bpp < 0.045', 'else if (false && bpp != null && bpp < 0.045'],
];

async function runMutant(m, clips, tmpRoot) {
  const mDir = fs.mkdtempSync(path.join(tmpRoot, `mut-${m.id}-`));
  try {
    for (const f of fs.readdirSync(HERE)) {
      if (/^watch.*\.mjs$/.test(f) && f !== 'watchcardtest.mjs') {
        fs.copyFileSync(path.join(HERE, f), path.join(mDir, f));
      }
    }
    const target = path.join(mDir, m.file);
    let src = fs.readFileSync(target, 'utf8');
    if (!src.includes(m.find)) return { ok: false, detail: `mutant target missing in ${m.file}` };
    src = src.replace(m.find, m.replace);
    if (m.id === 'e') {
      for (const [f, r] of MUTANT_E_EXTRA) src = src.replace(f, r);
    }
    fs.writeFileSync(target, src);
    const mod = await import(`${pathToFileURL(path.join(mDir, 'watch.mjs')).href}?v=${Date.now()}`);
    const outDir = path.join(mDir, 'runs');
    fs.mkdirSync(outDir, { recursive: true });
    // Run only the clips needed for line m.id to keep mutant checks fast.
    if (m.id === 'a') {
      const rLb = await mod.watchVideo(clips.letterbox, { out: path.join(outDir, 'lb'), rate: 4, quiet: true });
      const ac = rLb.footage?.autocrop;
      const linePassed = !!(ac && Math.abs(ac.y - 0.12) <= 0.01);
      return { ok: !linePassed, detail: linePassed ? 'autocrop STILL passed under mutant' : 'caught: autocrop=null under mutant' };
    }
    if (m.id === 'd') {
      const rPan = await mod.watchVideo(clips.pan, { out: path.join(outDir, 'pan'), rate: 4, quiet: true });
      const camSpd = rPan.design.physics?.camera?.med ?? 0;
      const panShare = rPan.design.physics?.cameraShare ?? 0;
      const linePassed = camSpd > 4 && panShare > 0.8;
      return { ok: !linePassed, detail: linePassed ? 'camera STILL passed under mutant' : `caught: camShare=${panShare.toFixed(2)}, cam=${camSpd.toFixed(2)}` };
    }
    if (m.id === 'e') {
      const rLo = await mod.watchVideo(clips.lo, { out: path.join(outDir, 'lo'), rate: 4, quiet: true });
      const linePassed = rLo.footage?.reliable?.detail === false;
      return { ok: !linePassed, detail: linePassed ? 'compression STILL passed under mutant' : `caught: reliable.detail=${rLo.footage?.reliable?.detail}` };
    }
    if (m.id === 'f') {
      const cMod = await import(`${pathToFileURL(path.join(mDir, 'watchcard.mjs')).href}?v=${Date.now()}`);
      const cr = cMod.reportCard(REAL_SHOW_CARDS[1]);
      const linePassed = cr.canons.every(c => c.score === null || c.score >= 6);
      return { ok: !linePassed, detail: linePassed ? 'REAL_SHOW_CARDS self-check STILL >= 6 under mutant' : `caught: Intensity=${cr.canons.find(c => c.name === 'Intensity')?.score}` };
    }
    return { ok: false, detail: 'unknown mutant' };
  } finally {
    fs.rmSync(mDir, { recursive: true, force: true });
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchcardtest-'));
try {
  const clips = {
    letterbox: await encodeWebm(path.join(tmpDir, 'letterbox.webm'), { sec: 3.5, frame: f => blobFrame(f, f / FPS, { barFrac: 0.122 }) }),
    darkgrain: await encodeWebm(path.join(tmpDir, 'darkgrain.webm'), { sec: 3.5, frame: f => blobFrame(f, f / FPS, { darkGrain: true }) }),
    plain: await encodeWebm(path.join(tmpDir, 'plain.webm'), { sec: 3.5, frame: f => blobFrame(f, f / FPS) }),
    logo: await encodeWebm(path.join(tmpDir, 'logo.webm'), { sec: 3.5, frame: f => blobFrame(f, f / FPS, { logo: true }) }),
    title: await encodeWebm(path.join(tmpDir, 'title.webm'), {
      sec: 5.5,
      frame: f => (f < 2 * FPS ? titleCardFrame() : blobFrame(f, (f - 2 * FPS) / FPS)),
    }),
    pan: await encodeWebm(path.join(tmpDir, 'pan.webm'), { sec: 3.0, frame: f => panFrame(f / FPS, { camPctPerSec: 7.5 }) }),
    cpan: await encodeWebm(path.join(tmpDir, 'cpan.webm'), { sec: 3.0, frame: f => panFrame(f / FPS, { camPctPerSec: -7.5, dishOwnPctPerSec: 3.75 }) }),
    hi: await encodeWebm(path.join(tmpDir, 'hi.webm'), { sec: 3.0, bitrate: '2M', frame: f => panFrame(f / FPS, { camPctPerSec: 1.5, dishOwnPctPerSec: 2.5 }) }),
    lo: await encodeWebm(path.join(tmpDir, 'lo.webm'), {
      sec: 3.0, bitrate: '18k', extraArgs: ['-qmin', '52', '-qmax', '63'],
      frame: f => panFrame(f / FPS, { camPctPerSec: 1.5, dishOwnPctPerSec: 2.5 }),
    }),
    grey: await encodeWebm(path.join(tmpDir, 'grey.webm'), { sec: 3.0, frame: () => flatGreyFrame() }),
    slowTwo: await encodeWebm(path.join(tmpDir, 'slow-two.webm'), { sec: 4.0, frame: f => slowTwoFrame(f / FPS) }),
    fastDense: await encodeWebm(path.join(tmpDir, 'fast-dense.webm'), { sec: 4.0, frame: f => fastDenseFrame(f, f / FPS) }),
  };

  const lines = await runSuite(watchVideo, tmpDir, clips);
  for (const l of lines) check(`(${l.id}) ${l.name}`, l.ok, l.detail);

  if (MUTANTS_ON) {
    for (const m of MUTANTS) {
      const r = await runMutant(m, clips, tmpDir);
      check(`mutant (${m.id}) breaks check (${m.id})`, r.ok, r.detail);
    }
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
