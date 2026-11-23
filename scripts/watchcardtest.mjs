#!/usr/bin/env node
/**
 * `npm run watchcard`: contract check for PLAN 47x footage robustness,
 * artistic report card, rating agreement, and gap-to-setting suggestions.
 *
 * Builds synthetic WebM clips via ffmpeg (no network or reference library),
 * checks the returned objects and output files (never trusting self-reports
 * alone), and runs single-line code mutants through the same `runSuite`
 * checks to prove lines (a), (d), (e), and (f) fail when their rules break.
 *
 * Known tracked gap: `(f2)` runs leave-one-out calibration across
 * `REAL_SHOW_CARDS` (`PLAN 47x-16`), which stays visibly red locally until
 * more real optical liquid shows are calibrated into the table.
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
import { MEASURE_SETTINGS } from './watchsettings.mjs';

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
  'B': [30, 17, 17, 30, 17, 17, 30],
  'C': [14, 17, 16, 16, 16, 17, 14],
  'D': [30, 17, 17, 17, 17, 17, 30],
  'E': [31, 16, 16, 30, 16, 16, 31],
  'F': [31, 16, 16, 30, 16, 16, 16],
  'H': [17, 17, 17, 31, 17, 17, 17],
  'I': [14, 4, 4, 4, 4, 4, 14],
  'L': [16, 16, 16, 16, 16, 16, 31],
  'M': [17, 27, 21, 21, 17, 17, 17],
  'N': [17, 25, 21, 19, 17, 17, 17],
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

async function encodeWebm(outPath, { sec, fps = FPS, bitrate = '2M', extraArgs = [], frame, sound = null }) {
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0',
  ];
  let wavPath = null;
  if (sound) {
    const nAud = Math.round(sec * 8000);
    const wav = Buffer.alloc(44 + nAud * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + nAud * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(nAud * 2, 40);
    for (let i = 0; i < nAud; i++) wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sound(i / 8000)))), 44 + i * 2);
    wavPath = `${outPath}.wav`;
    fs.writeFileSync(wavPath, wav);
    args.push('-i', wavPath, '-c:v', 'libvpx', '-b:v', bitrate, ...extraArgs, '-c:a', 'libvorbis', '-shortest', '-f', 'webm', outPath);
  } else {
    args.push('-an', '-c:v', 'libvpx', '-b:v', bitrate, ...extraArgs, '-f', 'webm', outPath);
  }
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
  if (wavPath && fs.existsSync(wavPath)) fs.rmSync(wavPath, { force: true });
  return outPath;
}

const LOGO_BOX = { x: 16, y: 12, w: 96, h: 42 };

// Moving moderate-chroma blobs across the full width; optional bars, dark grain, or large vivid corner logo.
function blobFrame(f, t, { darkGrain = false, barFrac = 0, logo = false } = {}) {
  const buf = Buffer.alloc(W * H * 3);
  const cyMin = Math.round(barFrac * H), cyMax = H - cyMin;
  const cx1 = 155 + 32 * Math.sin(t * 1.4), cy1 = 105 + 22 * Math.cos(t * 1.1);
  const cx2 = 250 + 28 * Math.cos(t * 1.2), cy2 = 78 + 24 * Math.sin(t * 1.5);
  const cx3 = 205 + 26 * Math.sin(t * 0.9 + 1.4), cy3 = 132 + 16 * Math.cos(t * 1.3);
  const cx4 = 75 + 28 * Math.cos(t * 1.1), cy4 = 125 + 18 * Math.sin(t * 1.3);
  for (let y = 0; y < H; y++) {
    const inBar = barFrac > 0 && (y < cyMin || y >= cyMax);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      if (inBar) { buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; continue; }
      const d1 = Math.exp(-(((x - cx1) ** 2 + (y - cy1) ** 2) / (2 * 26 ** 2)));
      const d2 = Math.exp(-(((x - cx2) ** 2 + (y - cy2) ** 2) / (2 * 26 ** 2)));
      const d3 = Math.exp(-(((x - cx3) ** 2 + (y - cy3) ** 2) / (2 * 24 ** 2)));
      const d4 = Math.exp(-(((x - cx4) ** 2 + (y - cy4) ** 2) / (2 * 26 ** 2)));
      let g = 0;
      if (darkGrain) {
        const s = Math.sin(x * 0.37 + y * 0.29 + f * 1.7) * 43758.5453;
        const n = (s - Math.floor(s)) * 12;
        g = Math.round(4 + n + 8 * Math.max(0, Math.sin(x * 0.04 + t * 0.8)));
      } else {
        // Subtle moving dimmer stage ripples so edges stay alive without static black corners.
        g = Math.round(6 + 6 * (0.5 + 0.5 * Math.sin(x * 0.05 + y * 0.04 + t * 1.8)));
      }
      // Moderate chroma blobs (~30-35 colourfulness: >2 steps above grey, yet large vivid corner logo shifts it >1 step).
      const r = Math.min(255, Math.round(g + 225 * d1 + 130 * d2 + 210 * d3 + 95 * d4));
      const gr = Math.min(255, Math.round(g + 165 * d1 + 205 * d2 + 125 * d3 + 175 * d4));
      const b = Math.min(255, Math.round(g + 95 * d1 + 185 * d2 + 170 * d3 + 215 * d4));
      buf[i] = r; buf[i + 1] = gr; buf[i + 2] = b;
    }
  }
  if (logo) {
    for (let y = LOGO_BOX.y; y < LOGO_BOX.y + LOGO_BOX.h; y++) {
      for (let x = LOGO_BOX.x; x < LOGO_BOX.x + LOGO_BOX.w; x++) {
        const i = (y * W + x) * 3;
        buf[i] = 255; buf[i + 1] = 0; buf[i + 2] = 230;
      }
    }
    drawText(buf, 'BRAND', LOGO_BOX.x + 12, LOGO_BOX.y + 14, 2, [245, 245, 245]);
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

// Flat bright washed-out grey: zero contrast, zero forms, high p5 -> clearly low Intensity & Complexity.
function flatGreyFrame() {
  const buf = Buffer.alloc(W * H * 3);
  buf.fill(215);
  return buf;
}

// Slow two-hue plate on ~28% dark ground with a 2.4 s quiet rest in the middle.
function slowTwoFrame(t) {
  const buf = Buffer.alloc(W * H * 3);
  const pause = t >= 1.0 && t <= 3.5 ? 1.0 : (t > 3.5 ? t - 2.5 : t);
  const cx1 = 115 + 22 * Math.sin(pause * 0.9), cy1 = 90 + 14 * Math.cos(pause * 0.7);
  const cx2 = 205 + 20 * Math.cos(pause * 0.8), cy2 = 95 + 16 * Math.sin(pause * 0.9);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const d1 = Math.exp(-(((x - cx1) ** 2 + (y - cy1) ** 2) / (2 * 44 ** 2)));
      const d2 = Math.exp(-(((x - cx2) ** 2 + (y - cy2) ** 2) / (2 * 42 ** 2)));
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

// Blobs surging during 0.5 s audio bursts and resting during silent half-seconds.
function soundPulseFrame(t) {
  const slots = [1, 0, 1, 1, 0, 1, 0, 0, 1, 0];
  let motionClock = 0;
  const dt = 0.02;
  for (let s = 0; s < t; s += dt) {
    if (slots[Math.min(slots.length - 1, Math.floor(s * 2))]) motionClock += dt;
  }
  return blobFrame(0, motionClock * 3.2);
}

function topLevelDefaultKeys(srcText) {
  const dsStart = srcText.indexOf('export const DEFAULT_SETTINGS');
  const openBrace = srcText.indexOf('{', dsStart);
  const keys = new Set();
  if (openBrace < 0) return keys;
  let depth = 0, line = '';
  for (let i = openBrace; i < srcText.length; i++) {
    const ch = srcText[i];
    if (ch === '/' && srcText[i + 1] === '/') {
      while (i < srcText.length && srcText[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && srcText[i + 1] === '*') {
      i += 2;
      while (i + 1 < srcText.length && !(srcText[i] === '*' && srcText[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (ch === '{') { depth++; continue; }
    if (ch === '}') {
      depth--;
      if (depth === 0) break;
      continue;
    }
    if (depth === 1) {
      if (ch === '\n' || ch === ',') {
        const m = /^\s*([a-zA-Z0-9_]+)\s*:/.exec(line);
        if (m) keys.add(m[1]);
        line = '';
      } else {
        line += ch;
      }
    }
  }
  return keys;
}

async function runSuite(mods, dir, clips, only = null) {
  const out = [];
  const want = id => !only || only === id;
  const rec = (id, name, ok, detail) => out.push({ id, name, ok: !!ok, detail });
  const rw = mods.watchVideo;

  // (a) letterbox: 12% bars top & bottom cropped within 1%; dark grainy ground NOT cropped
  if (want('a')) {
    const rLb = await rw(clips.letterbox, { out: path.join(dir, 'out-lb'), rate: 4, quiet: true });
    const rDg = await rw(clips.darkgrain, { out: path.join(dir, 'out-dg'), rate: 4, quiet: true });
    const ac = rLb.footage?.autocrop;
    rec('a', 'letterbox: 12% top/bottom bars cropped within 1%; dark grainy ground left uncropped',
      !!(ac && Math.abs(ac.y - 0.12) <= 0.01 && Math.abs(ac.h - 0.76) <= 0.01 && ac.x <= 0.01 && rDg.footage?.autocrop === null),
      `lb=${ac ? `y=${ac.y.toFixed(3)},h=${ac.h.toFixed(3)}` : 'null'}, dg=${rDg.footage?.autocrop ? 'cropped' : 'null'}`);
  }

  let rPlain = null, rLo = null, rHi = null, rGrey = null, rSlow = null, rFast = null;
  const needPlain = want('b') || want('c') || want('f') || want('g') || want('h');
  if (needPlain) rPlain = await rw(clips.plain, { out: path.join(dir, 'out-plain'), rate: 4, quiet: true });

  // (b) overlay: large coloured corner logo masked -> box matches within 0.02, finite colourfulness & forms match within 1 step
  if (want('b')) {
    const rLogo = await rw(clips.logo, { out: path.join(dir, 'out-logo'), rate: 4, quiet: true });
    const colL = rLogo.design.colourfulness?.med, colP = rPlain.design.colourfulness?.med;
    const fL = rLogo.design.forms?.med, fP = rPlain.design.forms?.med;
    const box = rLogo.footage?.overlays?.[0];
    const expBox = { x: LOGO_BOX.x / W, y: LOGO_BOX.y / H, w: LOGO_BOX.w / W, h: LOGO_BOX.h / H };
    const boxOk = !!(box
      && Math.abs(box.x - expBox.x) <= 0.02 && Math.abs(box.y - expBox.y) <= 0.02
      && Math.abs(box.w - expBox.w) <= 0.02 && Math.abs(box.h - expBox.h) <= 0.02);
    const finiteOk = [colL, colP, fL, fP].every(Number.isFinite);
    const dCol = finiteOk ? Math.abs(colL - colP) : Infinity;
    const fRatio = finiteOk && fL > 0 && fP > 0 ? Math.max(fL / fP, fP / fL) : (fL === fP ? 1 : Infinity);
    rec('b', 'overlay: coloured corner logo found within 0.02 and masked; finite colourfulness and forms match plain plate within one step',
      boxOk && finiteOk && dCol < 15 && fRatio < 1.5,
      `box=${box ? `${box.x.toFixed(3)},${box.y.toFixed(3)},${box.w.toFixed(3)}x${box.h.toFixed(3)}` : 'none'} (exp ${expBox.x.toFixed(3)},${expBox.y.toFixed(3)},${expBox.w.toFixed(3)}x${expBox.h.toFixed(3)}), dCol=${dCol.toFixed(1)}, forms=${fL?.toFixed(2)}/${fP?.toFixed(2)}`);
  }

  // (c) title card: 2 s span bounded near 2.0 s, design sample count equals plate-only count, reads match within 1 step
  if (want('c')) {
    const rTitle = await rw(clips.title, { out: path.join(dir, 'out-title'), rate: 4, quiet: true });
    const span = rTitle.footage?.titleSpans?.[0];
    const colT = rTitle.design.colourfulness?.med, colP = rPlain.design.colourfulness?.med;
    const rmsT = rTitle.design.rms?.med, rmsP = rPlain.design.rms?.med;
    const lumT = rTitle.design.lumMean?.med, lumP = rPlain.design.lumMean?.med;
    const nT = rTitle.design.samples, nP = rPlain.design.samples;
    rec('c', 'title card: 2 s text span excluded; design sample count equals plate-only count and reads match within one step',
      !!(span && span.from <= 0.25 && Math.abs(span.to - 2.0) <= 0.25
        && Number.isFinite(nT) && nT === nP
        && Number.isFinite(colT) && Math.abs(colT - colP) < 15
        && Number.isFinite(rmsT) && Math.abs(rmsT - rmsP) < 0.05
        && Number.isFinite(lumT) && Math.abs(lumT - lumP) < 0.08),
      `span=${span ? `${span.from.toFixed(2)}-${span.to.toFixed(2)}s` : 'none'}, samples=${nT}/${nP}, dCol=${(colT - colP).toFixed(1)}, dRms=${(rmsT - rmsP).toFixed(3)}`);
  }

  // (d) camera: known pan speed 7.5%/s +/- 0.75, own < 0.1 * known 7.5, cameraShare > 0.8; counter-drift vs known -7.5 & +3.75
  if (want('d')) {
    const PAN = 7.5, OWN_COUNTER = 3.75;
    const rPan = await rw(clips.pan, { out: path.join(dir, 'out-pan'), rate: 4, quiet: true });
    const rCpan = await rw(clips.cpan, { out: path.join(dir, 'out-cpan'), rate: 4, quiet: true });
    const camSpd = rPan.design.physics?.camera?.med;
    const panOwn = rPan.design.physics?.own?.med;
    const panShare = rPan.design.physics?.cameraShare;
    const flH = rCpan.design.physics?.fluid?.horizontal;
    const cCamU = rCpan.design.physics?.camera?.u;
    rec('d', 'camera: panned plate matches known 7.5%/s within 0.75 with own < 0.1*7.5 and cameraShare > 0.8; counter-drift matches known -7.5 and +3.75',
      [camSpd, panOwn, panShare, flH, cCamU].every(Number.isFinite)
        && Math.abs(camSpd - PAN) <= 0.75 && panOwn < 0.1 * PAN && panShare > 0.8
        && Math.abs(cCamU + PAN) <= 0.75 && Math.abs(flH - OWN_COUNTER) <= 0.2 * OWN_COUNTER,
      `panOwn=${panOwn?.toFixed(2)}, cam=${camSpd?.toFixed(2)} (exp 7.5), camShare=${panShare?.toFixed(2)}, counterCamU=${cCamU?.toFixed(2)} (exp -7.5), fluidH=${flH?.toFixed(2)} (exp 3.75)`);
  }

  // (e) compression: low bitrate clearly flagged unreliable, prints note and skips unreliable gaps in --vs; high stays reliable
  if (want('e') || want('f')) {
    rHi = await rw(clips.hi, { out: path.join(dir, 'out-hi'), rate: 4, quiet: true });
    rLo = await rw(clips.lo, { out: path.join(dir, 'out-lo'), rate: 4, quiet: true });
  }
  if (want('e')) {
    const rLoVs = await rw(clips.lo, { out: path.join(dir, 'out-lo-vs'), vs: rHi.out, rate: 4, quiet: true });
    const loSum = fs.readFileSync(path.join(rLo.out, 'summary.md'), 'utf8');
    const loVsSum = fs.readFileSync(path.join(rLoVs.out, 'summary.md'), 'utf8');
    rec('e', 'compression: very low bitrate flags detail measures unreliable and skips detail gaps in --vs; high bitrate keeps finite edgeWidth',
      rHi.footage?.reliable?.detail === true && Number.isFinite(rHi.design.edgeWidth?.med)
        && rLo.footage?.reliable?.detail === false && rLo.design.edgeWidth?.reliable === false
        && rLo.design.physics?.spectrum?.reliable === false
        && loSum.includes('unreliable (compression)') && loVsSum.includes('skipped (unreliable due to compression)'),
      `hi=${rHi.footage?.reliable?.detail} (ew=${rHi.design.edgeWidth?.med?.toFixed(2)}%, bpp=${rHi.footage?.bpp?.toFixed(3)}), lo=${rLo.footage?.reliable?.detail} (blk=${rLo.footage?.blockiness?.toFixed(2)}, bpp=${rLo.footage?.bpp?.toFixed(3)})`);
  }

  // (f) report card: ranges, no-sound Music fit null vs sound clip Music fit non-null, compressed Complexity null,
  // flat bright grey clearly low Intensity (<3.0) & Complexity (<=2), fast/dense < slow two-hue on Unity & Restraint (>=1 step Restraint gap).
  if (want('f') || want('g') || want('h')) {
    rGrey = await rw(clips.grey, { out: path.join(dir, 'out-grey'), rate: 4, quiet: true });
  }
  if (want('f') || want('g')) {
    rSlow = await rw(clips.slowTwo, { out: path.join(dir, 'out-slow'), rate: 4, quiet: true });
    rFast = await rw(clips.fastDense, { out: path.join(dir, 'out-fast'), rate: 4, quiet: true });
  }
  if (want('f')) {
    const CANON_NAMES = ['Unity', 'Complexity', 'Intensity', 'Arc', 'Surprise', 'Music fit', 'Restraint'];
    const cPlain = rPlain.card;
    const shapesOk = Array.isArray(cPlain?.canons) && cPlain.canons.length === 7
      && cPlain.canons.every((c, i) => c.name === CANON_NAMES[i] && typeof c.why === 'string' && c.why.length > 0
        && (c.score === null || (typeof c.score === 'number' && c.score >= 0 && c.score <= 10)));
    const mfPlain = cPlain?.canons?.find(c => c.name === 'Music fit');
    const cLoComp = rLo.card?.canons?.find(c => c.name === 'Complexity');
    const rSound = await rw(clips.sound, { out: path.join(dir, 'out-sound'), rate: 4, quiet: true });
    const canonOf = (r, name) => r.card?.canons?.find(c => c.name === name)?.score;
    const mfSound = canonOf(rSound, 'Music fit');
    const gInt = canonOf(rGrey, 'Intensity'), gCmp = canonOf(rGrey, 'Complexity');
    const sUni = canonOf(rSlow, 'Unity'), fUni = canonOf(rFast, 'Unity');
    const sRes = canonOf(rSlow, 'Restraint'), fRes = canonOf(rFast, 'Restraint');
    const plainSum = fs.readFileSync(path.join(rPlain.out, 'summary.md'), 'utf8');
    const fOk = shapesOk && mfPlain?.score === null && mfSound != null && mfSound >= 5.0
      && cLoComp?.score === null
      && plainSum.includes('## Report card') && plainSum.indexOf('## Report card') > plainSum.indexOf('## Overall')
      && gInt != null && gInt < 3.0 && gCmp != null && gCmp <= 2.0
      && sUni != null && sUni >= 5.5 && fUni != null && fUni < sUni
      && sRes != null && fRes != null && (sRes - fRes) >= 1.0;
    rec('f', 'report card: bounds, sound vs silent Music fit, compressed Complexity null, washed grey low, fast/dense < slow two-hue (Restraint gap >= 1.0)',
      fOk,
      `mfNoSnd=${mfPlain?.score}, mfSnd=${mfSound}, compLo=${cLoComp?.score}, grey(I=${gInt},C=${gCmp}), slow(U=${sUni},R=${sRes}), fast(U=${fUni},R=${fRes})`);
  }

  // (f2) leave-one-out on REAL_SHOW_CARDS: each row scored against cal built from the other rows (>= 5 non-null canons, all >= 6)
  if (want('f2')) {
    const rowNotes = [];
    let looOk = true;
    for (const row of mods.REAL_SHOW_CARDS) {
      const others = mods.REAL_SHOW_CARDS.filter(r => r !== row);
      const cr = mods.reportCard(row, { cal: others });
      const graded = cr.canons.filter(c => c.score != null);
      const low = graded.filter(c => c.score < 6).map(c => `${c.name}=${c.score}`);
      if (graded.length < 5 || low.length) looOk = false;
      rowNotes.push(`${row.name}:${graded.length}/7${low.length ? ` [${low.join(',')}]` : ''}`);
    }
    rec('f2', '(f2) REAL_SHOW_CARDS leave-one-out (>= 6 on >= 5 canons per row)', looOk, rowNotes.join('; '));
  }

  // (g) ratings: temp library ratings.json read and Spearman rho pinned to exact expected values
  if (want('g')) {
    const tmpLib = path.join(dir, 'temp-lib');
    fs.mkdirSync(tmpLib, { recursive: true });
    // Build strictly ordered Intensity & Unity ranks so expected rho = 1.00 (Intensity) and 0.80 (Unity, one adjacent swap).
    const films = [
      { name: 'grey-film', doc: JSON.parse(fs.readFileSync(path.join(rGrey.out, 'design.json'), 'utf8')) },
      { name: 'slow-film', doc: JSON.parse(fs.readFileSync(path.join(rSlow.out, 'design.json'), 'utf8')) },
      { name: 'plain-film', doc: JSON.parse(fs.readFileSync(path.join(rPlain.out, 'design.json'), 'utf8')) },
      { name: 'fast-film', doc: JSON.parse(fs.readFileSync(path.join(rFast.out, 'design.json'), 'utf8')) },
    ];
    const scoreOf = (f, cName) => f.doc.card.canons.find(c => c.name === cName).score;
    const byInt = [...films].sort((a, b) => scoreOf(a, 'Intensity') - scoreOf(b, 'Intensity'));
    const byUni = [...films].sort((a, b) => scoreOf(a, 'Unity') - scoreOf(b, 'Unity'));
    const intStrict = byInt.every((f, i) => i === 0 || scoreOf(f, 'Intensity') > scoreOf(byInt[i - 1], 'Intensity'));
    const uniStrict = byUni.every((f, i) => i === 0 || scoreOf(f, 'Unity') > scoreOf(byUni[i - 1], 'Unity'));
    const ratingsObj = Object.fromEntries(films.map(f => [f.name, { note: 'synthetic test' }]));
    byInt.forEach((f, i) => { ratingsObj[f.name].intensity = i + 1; }); // exact match -> rho = 1.00
    const uniRanks = [1, 3, 2, 4]; // swap middle two -> 1 - 6*2 / (4*(16-1)) = 0.80
    byUni.forEach((f, i) => { ratingsObj[f.name].unity = uniRanks[i]; });
    for (const f of films) {
      const fDir = path.join(tmpLib, f.name);
      fs.mkdirSync(fDir, { recursive: true });
      fs.writeFileSync(path.join(fDir, 'design.json'), JSON.stringify(f.doc));
    }
    fs.writeFileSync(path.join(tmpLib, 'ratings.json'), JSON.stringify(ratingsObj, null, 2));
    const prevEnv = process.env.CHROMAGLASS_REFERENCES;
    let rRated = null, ratedSum = '';
    try {
      process.env.CHROMAGLASS_REFERENCES = tmpLib;
      rRated = await rw(clips.plain, { out: path.join(dir, 'out-rated'), rate: 4, quiet: true });
      ratedSum = fs.readFileSync(path.join(rRated.out, 'summary.md'), 'utf8');
    } finally {
      if (prevEnv === undefined) delete process.env.CHROMAGLASS_REFERENCES;
      else process.env.CHROMAGLASS_REFERENCES = prevEnv;
    }
    const intAg = rRated?.card?.agreement?.Intensity;
    const uniAg = rRated?.card?.agreement?.Unity;
    rec('g', 'ratings: ratings.json in a temp library is read and pins Spearman rho (1.00 and 0.80) with n=4',
      intStrict && uniStrict && intAg && intAg.n === 4 && Math.abs(intAg.rho - 1.0) < 1e-6
        && uniAg && uniAg.n === 4 && Math.abs(uniAg.rho - 0.8) < 1e-6
        && ratedSum.includes("Spearman's rho") && ratedSum.includes('n=4'),
      `Intensity rho=${intAg?.rho?.toFixed(2)} (exp 1.00, I=[${films.map(f => scoreOf(f, 'Intensity')).join(',')}], n=${intAg?.n}), Unity rho=${uniAg?.rho?.toFixed(2)} (exp 0.80, U=[${films.map(f => scoreOf(f, 'Unity')).join(',')}], n=${uniAg?.n})`);
  }

  // (h) settings: only top-level DEFAULT_SETTINGS keys matched, physics precede grades, --vs names raise for colourfulness
  if (want('h')) {
    const typesSrc = fs.readFileSync(path.join(HERE, '..', 'src', 'types.ts'), 'utf8');
    const defaultKeys = topLevelDefaultKeys(typesSrc);
    const parserOk = defaultKeys.has('dyeBudget') && !defaultKeys.has('velocity') && !defaultKeys.has('color');
    const allKeys = Object.values(mods.MEASURE_SETTINGS).flat().map(e => e.key);
    const unknownKeys = allKeys.filter(k => !defaultKeys.has(k));
    const physicsBeforeGrade = Object.values(mods.MEASURE_SETTINGS).every(entries => {
      let seenGrade = false;
      for (const e of entries) {
        if (e.kind === 'grade') seenGrade = true;
        else if (seenGrade && e.kind === 'physics') return false;
      }
      return true;
    });
    const settingsFile = path.join(dir, 'take-settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ dyeBudget: 0.42, transmission: 0.85, saturationBoost: 1.2 }));
    const rVs = await rw(clips.grey, { out: path.join(dir, 'out-vs'), vs: rPlain.out, settings: settingsFile, rate: 4, quiet: true });
    const vsSum = fs.readFileSync(path.join(rVs.out, 'summary.md'), 'utf8');
    const setIdx = vsSum.indexOf('## Settings to try');
    const setSec = setIdx >= 0 ? vsSum.slice(setIdx) : '';
    const colLine = setSec.split('\n').find(l => l.includes('**colourfulness**')) ?? '';
    const raiseMatch = colLine.includes('raise `dyeBudget`') && colLine.includes('now 0.42');
    rec('h', 'settings: every MEASURE_SETTINGS key is top-level in DEFAULT_SETTINGS, physics come before grades, and --vs names raise for colourfulness',
      parserOk && unknownKeys.length === 0 && physicsBeforeGrade && vsSum.includes('## Settings to try')
        && vsSum.includes('## Report card (side by side') && raiseMatch,
      `parserOk=${parserOk}, unknown=[${unknownKeys.join(',')}], physicsFirst=${physicsBeforeGrade}, colLine="${colLine.slice(0, 90)}"`);
  }

  return out;
}

const MUTANTS = [
  { id: 'a', file: 'watchfootage.mjs', find: 'if (!top && !bottom && !left && !right) return null;', replace: 'return null;' },
  { id: 'd', file: 'watchphysics.mjs', find: 'return { cu, cv, speed: Math.hypot(cu, cv), share, rmsFluid: Math.sqrt(rem / n) };', replace: 'return { cu: 0, cv: 0, speed: 0, share: 0, rmsFluid: Math.sqrt(tot / Math.max(1, n)) };' },
  { id: 'e', file: 'watchfootage.mjs', find: 'detailOk = false;', replace: 'detailOk = true;' },
  { id: 'f', file: 'watchcard.mjs', find: 'const BAND_SCORE = 9.0;', replace: 'const BAND_SCORE = 2.0;' },
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
    const src = fs.readFileSync(target, 'utf8');
    if (!src.includes(m.find)) return { ok: false, detail: `mutant target missing in ${m.file}` };
    fs.writeFileSync(target, src.replace(m.find, m.replace));

    const q = `?v=${Date.now()}-${m.id}`;
    const [wMod, cMod, sMod] = await Promise.all([
      import(`${pathToFileURL(path.join(mDir, 'watch.mjs')).href}${q}`),
      import(`${pathToFileURL(path.join(mDir, 'watchcard.mjs')).href}${q}`),
      import(`${pathToFileURL(path.join(mDir, 'watchsettings.mjs')).href}${q}`),
    ]);
    const outDir = path.join(mDir, 'runs');
    fs.mkdirSync(outDir, { recursive: true });
    const mutMods = {
      watchVideo: wMod.watchVideo,
      reportCard: cMod.reportCard,
      REAL_SHOW_CARDS: cMod.REAL_SHOW_CARDS,
      MEASURE_SETTINGS: sMod.MEASURE_SETTINGS,
    };
    const suiteRes = await runSuite(mutMods, outDir, clips, m.id);
    const line = suiteRes.find(x => x.id === m.id);
    if (!line) return { ok: false, detail: `no result returned for (${m.id})` };
    return {
      ok: !line.ok,
      detail: line.ok ? `(${m.id}) STILL passed under mutant: ${line.detail}` : `caught by runSuite (${m.id}): ${line.detail}`,
    };
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
      sec: 3.0, bitrate: '15k', extraArgs: ['-vf', 'scale=160:90:flags=bilinear,scale=640:360:flags=bilinear', '-qmin', '60', '-qmax', '63'],
      frame: f => panFrame(f / FPS, { camPctPerSec: 1.5, dishOwnPctPerSec: 2.5 }),
    }),
    grey: await encodeWebm(path.join(tmpDir, 'grey.webm'), { sec: 3.0, frame: () => flatGreyFrame() }),
    slowTwo: await encodeWebm(path.join(tmpDir, 'slow-two.webm'), { sec: 4.5, frame: f => slowTwoFrame(f / FPS) }),
    fastDense: await encodeWebm(path.join(tmpDir, 'fast-dense.webm'), { sec: 4.5, frame: f => fastDenseFrame(f, f / FPS) }),
    sound: await encodeWebm(path.join(tmpDir, 'sound.webm'), {
      sec: 4.5,
      frame: f => soundPulseFrame(f / FPS),
      sound: t => {
        const slots = [1, 0, 1, 1, 0, 1, 0, 0, 1, 0];
        const on = slots[Math.min(slots.length - 1, Math.floor(t * 2))];
        return on ? 12000 * Math.sin(2 * Math.PI * 440 * t) : 0;
      },
    }),
  };

  const baseMods = { watchVideo, reportCard, REAL_SHOW_CARDS, MEASURE_SETTINGS };
  const lines = await runSuite(baseMods, tmpDir, clips);
  for (const l of lines) check(l.name.startsWith('(') ? l.name : `(${l.id}) ${l.name}`, l.ok, l.detail);

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
