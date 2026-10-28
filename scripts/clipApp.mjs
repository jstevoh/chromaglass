/**
 * The app half of `npm run clip -- --app`: record a clip in the real page and
 * measure the file the browser wrote, not the options that asked for it.
 *
 * No GPU needed: the file's frame size is the canvas's, and a canvas is sized
 * whether or not the software renderer draws a good plate into it. What this
 * cannot say is how the plate looks tall (`docs/judging.md`), and not at all
 * whether Instagram takes the file; it says the file is 9:16, has sound, is
 * the container asked for, and that the window's canvas is put back.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';
import { clickAt } from './layoutProbe.mjs';

const PORT = Number(process.env.CLIP_PORT ?? 4183);
const URL = `http://localhost:${PORT}/?debug&look=classic&dpr=0.2`;

async function serve() {
  const notes = [];
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  await new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
    proc.stdout.on('data', d => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
    proc.stderr.on('data', d => { notes.push(String(d).trim()); });
    proc.on('exit', c => { clearTimeout(bail); reject(new Error(`preview exited ${c} ${notes.join(' ').slice(0, 200)}`)); });
  });
  return proc;
}

/**
 * The frame size a file declares, read from its bytes: Playwright's Chromium
 * has no H.264 decoder to ask, and an MP4 is exactly what a clip should be.
 * MP4: the width and height in the video sample entry (`avc1`, `hvc1`,
 * `av01`, `vp09`). WebM: the PixelWidth and PixelHeight elements.
 */
function frameSize(buf) {
  // Every sample description box; the brands in `ftyp` also say avc1, and the audio track has one of its own.
  for (let i = buf.indexOf('stsd', 0, 'latin1'); i >= 0; i = buf.indexOf('stsd', i + 4, 'latin1')) {
    const entry = buf.toString('latin1', i + 16, i + 20);
    if (['avc1', 'hvc1', 'hev1', 'av01', 'vp09'].includes(entry) && i + 48 < buf.length) {
      return { w: buf.readUInt16BE(i + 16 + 4 + 24), h: buf.readUInt16BE(i + 16 + 4 + 26) };
    }
  }
  // PixelWidth (0xB0) directly followed by PixelHeight (0xBA), each a one- or two-byte unsigned.
  const num = (at) => {
    const len = buf[at + 1] - 0x80;
    return len === 1 ? { v: buf[at + 2], next: at + 3 } : len === 2 ? { v: buf.readUInt16BE(at + 2), next: at + 4 } : null;
  };
  for (let i = 0; i + 8 < buf.length; i++) {
    if (buf[i] !== 0xb0) continue;
    const w = num(i);
    if (!w || buf[w.next] !== 0xba) continue;
    const h = num(w.next);
    if (h && w.v > 0 && h.v > 0) return { w: w.v, h: h.v };
  }
  return { w: 0, h: 0 };
}

/** The container a file is in and whether it carries an audio track, from its bytes. */
function sniff(buf) {
  const head = buf.subarray(0, 64).toString('latin1');
  const webm = buf.subarray(0, 4).toString('hex') === '1a45dfa3';
  const mp4 = head.includes('ftyp');
  const all = buf.toString('latin1');
  const audio = webm ? all.includes('A_OPUS') || all.includes('A_VORBIS') : /mp4a|Opus|opus/.test(all);
  return { container: webm ? 'webm' : mp4 ? 'mp4' : 'unknown', audio };
}

export async function appPart(check) {
  const server = await serve();
  const browser = await launchChromium(chromium, { headless: true, present: true });
  const dir = process.env.CLIP_KEEP ? (fs.mkdirSync(process.env.CLIP_KEEP, { recursive: true }), process.env.CLIP_KEEP) : fs.mkdtempSync(path.join(os.tmpdir(), 'clip-'));
  try {
    /**
     * Record eleven seconds (the software renderer's frames are seconds apart) with the options asked for; the file's
     * size and bytes, the canvas's shape during and after.
     */
    const record = async (name, { viewport, phone = false, options, free = false, wait = true }) => {
      const ctx = await browser.newContext({ viewport, acceptDownloads: true, ...(phone ? { hasTouch: true, isMobile: true } : {}) });
      const page = await ctx.newPage();
      page.setDefaultTimeout(60_000);
      await page.addInitScript((o) => {
        try {
          sessionStorage.setItem('chromaglass-audio-source', 'microphone');
          if (o) localStorage.setItem('chromaglass-recorder-options', JSON.stringify(o));
          localStorage.setItem('chromaglass-desk-mode', 'perform');
        } catch { /* */ }
      }, options);
      await page.goto(URL + (phone ? '&phone=1' : '') + (free ? '&tierGates=1' : ''), { waitUntil: 'networkidle' });
      const canvasShape = () => page.evaluate(() => {
        const c = document.getElementById('liquid-canvas');
        return c ? { w: c.width, h: c.height } : null;
      });
      /*
        The canvas opens at the window's full size and drops to `dpr=0.2`'s
        when the governor's first frame has landed, which on software WebGPU
        is seconds. Recording before that gets a file with no video in it
        (the first frame takes longer than the clip), which is the renderer's
        slowness and not the feature's: wait for the small canvas.
      */
      for (let i = 0; i < 100; i++) {
        const c = await canvasShape();
        if (c && c.w > 0 && c.w <= viewport.width * 0.5) break;
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(1500);
      const before = await canvasShape();
      let during = null;
      if (process.env.CLIP_DEBUG) { page.on('console', m => { if (m.type() === 'error') console.log('console', m.text().slice(0, 160)); }); page.on('pageerror', e => console.log('pageerror', String(e).slice(0, 160))); console.log('go', JSON.stringify(before)); }
      const download = page.waitForEvent('download', { timeout: 90_000 });
      download.catch(() => {});   // a failure before it is awaited must not hide behind its rejection
      // A phone opens on Play, whose Record is its own pill (the More sheet's tile makes the same clip).
      await clickAt(page, phone ? 'play-record' : 'record-button');
      await page.waitForTimeout(process.env.PW_WEBGPU ? 11000 : 4000);
      during = await canvasShape();
      if (process.env.CLIP_DEBUG) console.log('during', JSON.stringify(during), await page.getByTestId('record-timer').count());
      await clickAt(page, phone ? 'play-record' : 'record-button');
      if (!wait) {
        const after = await canvasShape();
        await page.waitForTimeout(500);
        await ctx.close();
        return { before, during, after };
      }
      const dl = await download;
      const file = path.join(dir, `${name}.${dl.suggestedFilename().split('.').pop()}`);
      await dl.saveAs(file);
      await page.waitForTimeout(800);
      const after = await canvasShape();
      const buf = fs.readFileSync(file);
      const size = frameSize(buf);
      await ctx.close();
      return { name: dl.suggestedFilename(), bytes: buf.length, ...sniff(buf), size, before, during, after };
    };
    const ratio = (s) => (s && s.h ? s.w / s.h : 0);
    const nine16 = (r) => Math.abs(r - 9 / 16) < 0.012;
    const fmt = (r) => `${r.size.w}×${r.size.h} ${r.container}${r.audio ? '+audio' : ' silent'}, canvas ${r.before?.w}×${r.before?.h} → ${r.during?.w}×${r.during?.h} → ${r.after?.w}×${r.after?.h}`;

    /*
      The free site's recorder, and any portrait clip, draw the canvas onto a
      canvas of their own every frame and encode that, so they always have
      frames and the file's size can be asserted: a software WebGPU canvas
      presents a frame only when the renderer manages one, and a clip caught
      none of them has no video track at all, which is the renderer's rate and
      not the feature's. The one run that captures the canvas itself (a paid
      desk, the plate as it is) is therefore not here; its frames are the
      browser's.
    */
    const desk = { width: 1440, height: 900 };

    // Free site, a laptop in landscape, Portrait 9:16 chosen: the plate drawn tall, a 9:16 file with sound.
    const free = await record('free-portrait', { viewport: desk, free: true, options: { shape: 'portrait', includeAudio: true } });
    check('free site, on a 1440 × 900 desk, a Portrait clip is a 9:16 file with sound', nine16(ratio(free.size)) && free.audio && free.bytes > 2000, fmt(free));
    check('it is the plate drawn tall, not the landscape picture cut down: the canvas itself was 9:16 while recording',
      nine16(ratio(free.during)), `during ${free.during?.w}×${free.during?.h}`);
    check('and the window\'s canvas is back to its own shape once the recording ends',
      ratio(free.after) > 1.3 && Math.abs(ratio(free.after) - ratio(free.before)) < 0.05, `before ${ratio(free.before).toFixed(3)}, after ${ratio(free.after).toFixed(3)}`);
    check('the free site\'s file is named for what it is', /9x16/.test(free.name), free.name);

    // The same desk, the plate as it is: the window's canvas is not touched. Only the canvas is asserted
    // here: this run's file comes after a stop the software renderer sometimes takes minutes over (its
    // frames are seconds apart and the stop queues behind them), and the old Record is not what changed.
    const plain = await record('free-plate', { viewport: desk, free: true, wait: false, options: { shape: 'plate', includeAudio: true } });
    check('with the frame left as the plate is, the window\'s canvas never changes shape while it records',
      Math.abs(ratio(plain.during) - ratio(plain.before)) < 0.02 && ratio(plain.during) > 1.3, `${plain.before?.w}×${plain.before?.h} → ${plain.during?.w}×${plain.during?.h}`);

    // Paid (no gates): the same clip, without the mark and the 15 seconds.
    const paid = await record('paid-portrait', { viewport: desk, options: { shape: 'portrait', includeAudio: true } });
    check('with a licence, a Portrait clip is also a 9:16 file with sound, from a canvas drawn at 9:16 and put back after',
      nine16(ratio(paid.size)) && nine16(ratio(paid.during)) && ratio(paid.after) > 1.3 && paid.audio, fmt(paid));
    check('and it is an MP4 where the browser can write one, WebM where it cannot', paid.container === 'mp4' || paid.container === 'webm', paid.container);

    // A phone: opens on Portrait, takes the middle 9:16 of its own screen.
    const phone = await record('phone', { viewport: { width: 390, height: 844 }, phone: true, free: true, options: null });
    check('on a phone, with nothing chosen, Record makes a 9:16 clip with sound from the middle of its screen',
      nine16(ratio(phone.size)) && phone.audio, fmt(phone));
    check('and the phone\'s own canvas is left alone while it records', Math.abs(ratio(phone.during) - ratio(phone.before)) < 0.02, `${ratio(phone.before).toFixed(3)} → ${ratio(phone.during).toFixed(3)}`);
  } finally {
    if (!process.env.CLIP_KEEP) try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
    await browser.close();
    try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
  }
}
