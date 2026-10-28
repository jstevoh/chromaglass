#!/usr/bin/env node
/**
 * The 9:16 share clip (PLAN 34f): the Record button's portrait frame.
 *
 *   npm run clip              # the frame's arithmetic, the mark, and the surfaces (node)
 *   npm run clip -- --app     # builds, then records a clip in the app and measures the file
 *
 * What is asserted is the feature, not a moment of the plate: a clip asked for
 * at 9:16 has a 9:16 frame whatever shape the window was (the file's own
 * width and height, read back from the browser's decoder), it is not the
 * landscape picture cut down when nothing else owns the canvas, and the
 * canvas goes back to the shape it had once the recording ends.
 */
import fs from 'node:fs';
import {
  PORTRAIT_ASPECT, PORTRAIT_STAGE, FREE_PORTRAIT_STAGE, portraitStage, isPortrait, coverCrop, clipContainer,
} from '../src/lib/clipFrame.ts';
import { drawChromaGlassWatermark, FREE_RECORD_MAX_SECONDS } from '../src/lib/tierGates.ts';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ── The arithmetic ──
{
  check('the stage is 1080 × 1920 and the free site\'s 720 × 1280, both exactly 9:16',
    near(PORTRAIT_STAGE.width / PORTRAIT_STAGE.height, PORTRAIT_ASPECT) && near(FREE_PORTRAIT_STAGE.width / FREE_PORTRAIT_STAGE.height, PORTRAIT_ASPECT)
    && portraitStage(true).width === 720 && portraitStage(false).height === 1920);
  check('a canvas of the stage\'s own shape is portrait, a window is not',
    isPortrait(1080, 1920) && isPortrait(720, 1280) && isPortrait(809, 1438) && !isPortrait(1920, 1080) && !isPortrait(2560, 1600) && !isPortrait(1000, 1000) && !isPortrait(0, 0));
  check('a phone\'s screen (9:19.5) is not 9:16: it is sliced, not taken as it is', !isPortrait(1170, 2532));

  for (const [name, w, h] of [['16:9', 1920, 1080], ['16:10', 2560, 1600], ['a phone, 9:19.5', 1170, 2532], ['square', 1000, 1000], ['9:16 already', 1080, 1920], ['odd sizes', 1441, 901]]) {
    const c = coverCrop(w, h);
    const inside = c.sx >= -1e-9 && c.sy >= -1e-9 && c.sx + c.sw <= w + 1e-9 && c.sy + c.sh <= h + 1e-9;
    const centred = near(c.sx, (w - c.sw) / 2, 1e-6) && near(c.sy, (h - c.sh) / 2, 1e-6);
    const full = near(c.sw, w, 1e-6) || near(c.sh, h, 1e-6);
    check(`the slice of a ${name} frame is 9:16, inside it, centred, and as large as fits; the clip is 9:16 in even pixels`,
      near(c.sw / c.sh, PORTRAIT_ASPECT, 1e-9) && inside && centred && full && c.outW % 2 === 0 && c.outH % 2 === 0
      && Math.abs(c.outW / c.outH - PORTRAIT_ASPECT) < 0.002,
      `${w}×${h} → ${c.outW}×${c.outH} from ${c.sw.toFixed(0)}×${c.sh.toFixed(0)}`);
  }
  const sixteenNine = coverCrop(1920, 1080);
  check('a 16:9 screen keeps under a third of its width in the slice: why the plate is drawn tall instead when it can be',
    sixteenNine.sw / 1920 < 0.33, `${(100 * sixteenNine.sw / 1920).toFixed(1)}%`);
  const already = coverCrop(1080, 1920);
  check('a frame already 9:16 loses nothing', near(already.sx, 0) && near(already.sy, 0) && near(already.sw, 1080) && near(already.sh, 1920));

  check('a portrait clip asks for MP4 (the apps it goes to do not take WebM); an explicit choice is kept, and the plate\'s own shape is not changed',
    clipContainer('portrait', 'auto') === 'mp4' && clipContainer('portrait', 'webm') === 'webm' && clipContainer('plate', 'auto') === 'auto' && clipContainer('plate', 'mp4') === 'mp4');
}

// ── The free site's mark: still on, and out of the apps' own chrome in a portrait clip ──
{
  const drawn = (w, h) => {
    const calls = [];
    const ctx = { save() {}, restore() {}, fillText: (t, x, y) => calls.push({ t, x, y }), set font(_) {}, set textBaseline(_) {}, set textAlign(a) { this.align = a; }, set shadowColor(_) {}, set shadowBlur(_) {}, set fillStyle(_) {} };
    drawChromaGlassWatermark(ctx, w, h);
    return { ...calls[0], align: ctx.align };
  };
  const land = drawn(1920, 1080), port = drawn(720, 1280);
  check('a landscape frame keeps the mark in the bottom-right corner, as it was', land.align === 'right' && land.x > 1800 && land.y > 1000, JSON.stringify(land));
  check('a portrait frame has the mark centred and above the bottom fifth, where Reels and TikTok put their caption',
    port.t === 'ChromaGlass' && port.align === 'center' && near(port.x, 360) && port.y <= 1280 * 0.81 && port.y >= 1280 * 0.7, JSON.stringify(port));
  check('the free site\'s cap is unchanged: 15 seconds', FREE_RECORD_MAX_SECONDS === 15);
}

// ── The surfaces. These read the source: a clip button that is not where a hand is has not shipped. ──
const read = (p) => fs.readFileSync(p, 'utf8');
{
  const panel = read('src/components/RecordPanel.tsx');
  check('the Record panel has a Frame choice, and no second Record button', /record-shape-\$\{f\.id\}/.test(panel) && /'plate'/.test(panel) && /'portrait'/.test(panel) && (panel.match(/testId="record-start-stop"/g) ?? []).length === 1);
  check('the Record panel can hand the last clip to the share sheet', /record-share-last-take/.test(panel));
  const phone = read('src/components/phone/PhoneStage.tsx');
  check('the phone says the clip\'s frame and can share the last clip, beside the one Record tile',
    /phone-record-shape/.test(phone) && /phone-share-clip/.test(phone) && (phone.match(/testId="phone-record"/g) ?? []).length === 1);
  const app = read('src/App.tsx');
  check('a phone opens on the portrait frame, a desk on the plate', /useRecorder\(\{ shape: phone \? 'portrait' : 'plate' \}\)/.test(app));
  check('the wall\'s canvas is only reshaped when no projector owns it, and always put back',
    /!stageRef\.current && !phone/.test(app) && /wallRef\.current\?\.setStage\(stageRef\.current\)/.test(app));
  const hook = read('src/hooks/useRecorder.ts');
  check('the recorder tells its caller whether it began, so a canvas changed for a clip is put back where the browser cannot record',
    /start: \(canvas: HTMLCanvasElement, audio: MediaStream \| null, overrideOptions\?: Partial<RecorderOptions>\) => boolean/.test(hook));
}

if (process.argv.includes('--app')) {
  const { appPart } = await import('./clipApp.mjs');
  const r = await appPart(check);
  void r;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
