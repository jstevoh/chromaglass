#!/usr/bin/env node
/**
 * The recorder's encoder, not the plate: why `npm run moving` found freezes
 * late, and that the freeze finder now does not.
 *
 *   npm run codecblip
 *
 * `npm run moving` freezes the liquid on purpose for four seconds and asks
 * the film (the app's Record button, read by `scripts/watch.mjs`) to find
 * the freeze where the plate stood. It went red in 9 of 58 runs from
 * 2026-09-25 to 27, and in 8 of them the plate had stopped on time while the
 * film found the stillness 1.3–1.9 s late, or split it in two. This makes the
 * same take without the app, so it runs anywhere Chromium and ffmpeg do (a
 * cloud session included): a plate-like canvas (soft coloured blobs
 * drifting) that moves for five seconds, is redrawn unchanged for six, as a
 * frozen plate is, then moves again, recorded as useRecorder.ts records
 * (captureStream at 30, MediaRecorder, VP9 at 12 Mbps), read by watchVideo,
 * with the bar for still set as moving.mjs sets it (twice the 90th
 * percentile inside the stop). What it asks:
 *
 *   1. the take's still stretch is not still: the encoder re-sends the
 *      picture now and then, a blip of well over the bar for a sample, and
 *      without blips allowed the finder starts the stillness late or ends it
 *      early, by over a second, in at least one take (it did in four of four
 *      when this was written: 6.8–10.1 s found, for a stop from 5.0 to 11.0)
 *   2. with blips of up to half a second allowed (freezes()'s blipSeconds,
 *      as moving.mjs asks), every take's stop is found within 0.3 s of both
 *      ends (5.0–11.0 and 5.1–11.0 when this was written)
 *   3. and the moving stretches either side are not found still at all,
 *      including four seconds at the end that stutter (0.3 s held in
 *      every 0.6, then moving on), which the blips allowed must not
 *      bridge into a stillness (freezes()'s blipBelow and blipShare)
 *
 * By hand, not in CI: it measures Chromium's encoder, which is the same
 * libvpx on a Mac, and it is here to be run again if a later Chromium or a
 * changed recorder makes moving.mjs's freeze checks go red again.
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';
import { watchVideo, freezes } from './watch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TAKES = +(process.env.CODECBLIP_TAKES ?? 3);
const STOP = 5, THAW = 11, STUTTER = 13, END = 17;
// Where the picture's clock stands at t: running, held from STOP to THAW,
// running again, then from STUTTER held for 0.3 s at the start of every
// 0.6 s.
const playhead = (t) => {
  if (t < STOP) return t;
  if (t < THAW) return STOP;
  if (t < STUTTER) return STOP + (t - THAW);
  const n = Math.floor((t - STUTTER) / 0.6), f = t - STUTTER - n * 0.6;
  return STOP + (STUTTER - THAW) + n * 0.3 + Math.max(0, f - 0.3);
};
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codecblip-'));
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--autoplay-policy=no-user-gesture-required'] });
const takes = [];
try {
  const page = await browser.newPage();
  await page.setContent('<canvas id=c width=1280 height=800></canvas>');
  for (let k = 0; k < TAKES; k++) {
    const b64 = await page.evaluate(async ({ k, END, head }) => {
      const playhead = new Function(`return (${head})`)();
      const c = document.getElementById('c'), g = c.getContext('2d');
      // Seeded, so a take is the same picture each run.
      let s = 1 + k * 7919; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const blobs = Array.from({ length: 40 }, (_, i) => ({ x: rnd() * 1280, y: rnd() * 800, r: 60 + rnd() * 160, h: (i * 47 + k * 13) % 360, vx: (rnd() - 0.5) * 120, vy: (rnd() - 0.5) * 120 }));
      const draw = (tt) => {
        g.fillStyle = '#101018'; g.fillRect(0, 0, 1280, 800);
        g.globalCompositeOperation = 'screen';
        for (const o of blobs) {
          const x = o.x + o.vx * tt, y = o.y + o.vy * tt;
          const gr = g.createRadialGradient(x, y, 0, x, y, o.r);
          gr.addColorStop(0, `hsla(${o.h},90%,60%,0.9)`); gr.addColorStop(1, `hsla(${o.h},90%,50%,0)`);
          g.fillStyle = gr; g.beginPath(); g.arc(x, y, o.r, 0, 7); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      };
      const mime = 'video/webm;codecs=vp9';
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 12_000_000 });
      const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
      const t0 = performance.now(); rec.start(250);
      await new Promise(res => {
        const loop = () => {
          const t = (performance.now() - t0) / 1000;
          draw(playhead(t));
          if (t < END) requestAnimationFrame(loop); else res();
        };
        loop();
      });
      rec.stop(); await new Promise(r => { rec.onstop = r; });
      const buf = new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(bin);
    }, { k, END, head: `(t) => { const STOP = ${STOP}, THAW = ${THAW}, STUTTER = ${STUTTER}; return (${playhead.toString()})(t); }` });
    const file = path.join(dir, `take${k}.webm`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    const r = await watchVideo(file, { out: `${file}.out`, frames: 12, quiet: true });
    // As moving.mjs: the bar from inside the stop, half a second in from each end.
    const inside = r.rows.slice(1).filter(x => x.t > STOP + 0.5 && x.t < THAW - 0.5).map(x => x.motion).sort((a, b) => a - b);
    const p90 = inside[Math.min(inside.length - 1, Math.floor(0.9 * inside.length))] ?? 0;
    const below = Math.max(2 * p90, 0.005);
    const settled = (a) => a.map(f => ({ ...f, from: Math.max(f.from, r.rows[0].t + 2) })).filter(f => f.to - f.from >= 2 - 1e-9);
    takes.push({ below, peak: inside.at(-1) ?? 0, strict: settled(freezes(r, { below, minSeconds: 2 })), blips: settled(freezes(r, { below, minSeconds: 2, blipSeconds: 0.5, blipBelow: 0.3 })) });
  }
} finally {
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

const show = a => a.map(f => `${f.from.toFixed(1)}–${f.to.toFixed(1)} s`).join(', ') || 'none';
for (const [k, t] of takes.entries()) {
  console.log(`  take ${k}: still = under ${t.below.toFixed(3)}%, busiest sample inside the stop ${t.peak.toFixed(3)}%; found ${show(t.strict)}, with blips allowed ${show(t.blips)}`);
}
console.log('');
const at = (a) => a.find(f => f.from < THAW && f.to > STOP);
const off = (f) => !f ? Infinity : Math.max(Math.abs(f.from - STOP), Math.abs(f.to - THAW));
check('without blips allowed, the encoder moves the stop found by over a second in at least one take',
  // A take with no stillness found at all is not the bug reproduced.
  takes.some(t => at(t.strict) && off(at(t.strict)) > 1),
  `worst ${Math.max(...takes.map(t => off(at(t.strict)))).toFixed(1)} s off, in ${takes.length} takes`);
check('with blips of up to half a second allowed, every take\'s stop is found within 0.3 s of both ends',
  takes.every(t => off(at(t.blips)) <= 0.3),
  `worst ${Math.max(...takes.map(t => off(at(t.blips)))).toFixed(2)} s off`);
check('and the moving plate either side, the stutter at the end included, is not found still',
  takes.every(t => t.blips.every(f => f === at(t.blips))),
  takes.map(t => show(t.blips.filter(f => f !== at(t.blips)))).join('; '));

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
