#!/usr/bin/env node
/**
 * A palette from any picture or video (PLAN 43d), checked:
 *
 *   npm run picturepalette
 *
 * What was asked (the owner, 2026-11-15): "taking video, image, album art or
 * whatever visual input and creating a palette from it." The feature is that
 * the dyes a person gets are the picture's own main colours, and that they
 * are dyes the plate can show, and that nothing else of the plate changes.
 * So this holds lib/picturePalette.ts to that, in two parts.
 *
 * In node, on pictures made here so the right answer is known:
 *
 *   1. four blocks of colour give those four colours back;
 *   2. a black sleeve with a pink title gives the pink first, because a
 *      person calls that a pink record; and the commonest-pixel picker this
 *      replaced is run on the same sleeve as a control, which must fail it
 *      (else the line measures nothing);
 *   3. a small vivid accent on a big dull ground is kept, a speck is not;
 *   4. a black-and-white cover gives two greys 40 or more from black and from
 *      white (PLAN 28b's rule for every palette, so it shows on a lamp look
 *      and a dark one), 18 or more apart, which is all the room there is;
 *      and the black sleeve's black and white are not dyes at all;
 *   5. a two-colour cover still fills four dyes, both its colours among them;
 *   6. the same picture always gives the same palette; an empty one none;
 *   7. the slots: the picture's dyes land in the four slots after the 24
 *      named dyes and nowhere else, the named dyes and the dice's count are
 *      unchanged (so no seeded plate moves), and the lock's "From picture"
 *      is the harmony of those slots;
 *   8. saved colours read back only when they are four real colours.
 *
 * In Chromium, through the browser's own decoders, as a person's files are:
 *
 *   9. a PNG and a JPEG of the four blocks give the four colours;
 *  10. a video recorded in the page (MediaRecorder's WebM, which does not say
 *      its length, like the app's own takes) whose first half is orange and
 *      second half blue gives both: the palette is read across the whole
 *      film, not its first frame;
 *  11. a file that is no picture is refused with a sentence, not a throw of
 *      nothing.
 */

import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChromium } from './chromium.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const ENTRY = `
  export * from './src/lib/picturePalette.ts';
  export { PALETTE, PALETTE_RGB, COLOR_HARMONIES } from './src/constants.ts';
  export { PALETTE_COUNT } from './src/sim/dice.ts';
`;
const dir = mkdtempSync(join(tmpdir(), 'picturepalette-'));
const nodeOut = join(dir, 'pp.mjs');
await build({ stdin: { contents: ENTRY, resolveDir: ROOT, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: nodeOut, logLevel: 'warning' });
const browser = await build({ stdin: { contents: ENTRY, resolveDir: ROOT, loader: 'ts' }, bundle: true, platform: 'browser', format: 'iife', globalName: 'PP', write: false, logLevel: 'warning' });
const PP = await import(pathToFileURL(nodeOut).href);
const {
  paletteFromPixels, rgbToLab, deltaE, setPictureDyes, lockHarmony, lockName, readPictureDyes, hexOf,
  PICTURE_DYE0, PICTURE_DYES, PICTURE_HARMONY, PICTURE_LOCK, PICTURE_PALETTE_NAME, PICTURE_GROUND_DE, PICTURE_DYE_APART,
  PALETTE, PALETTE_RGB, COLOR_HARMONIES, PALETTE_COUNT,
} = PP;

// ── Pictures made here ──────────────────────────────────────────────

const W = 120, H = 120;
/** A picture from a function of (x, y) in 0..1 to [r, g, b] in 0..255. */
function picture(fn, w = W, h = H) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a = 255] = fn(x / w, y / h);
    d.set([r, g, b, a], (y * w + x) * 4);
  }
  return d;
}
const lab8 = ([r, g, b]) => rgbToLab(r / 255, g / 255, b / 255);
const labOf = (c) => rgbToLab(c.r, c.g, c.b);
const nearest = (pal, rgb8) => Math.min(...pal.map(c => deltaE(labOf(c), lab8(rgb8))));
const show = (pal) => pal.map(hexOf).join(' ');

const PINK = [236, 30, 140], TEAL = [0, 160, 150], YELLOW = [250, 210, 30], VIOLET = [100, 50, 200];
const blocks = picture((x, y) => (x < 0.5 ? (y < 0.5 ? PINK : TEAL) : (y < 0.5 ? YELLOW : VIOLET)));
{
  const pal = paletteFromPixels(blocks);
  const worst = Math.max(...[PINK, TEAL, YELLOW, VIOLET].map(c => nearest(pal, c)));
  check('1. four blocks of colour give those four colours back (each within ΔE 2)', pal.length === 4 && worst < 2, `${show(pal)}, worst ΔE ${worst.toFixed(1)}`);
}

// A black sleeve, a pink title band across it (10%), a thin white credit line (3%).
const sleeve = picture((x, y) => (y > 0.45 && y < 0.55 ? PINK : y > 0.85 && y < 0.88 && x > 0.2 && x < 0.8 ? [255, 255, 255] : [8, 8, 10]));
{
  const pal = paletteFromPixels(sleeve);
  const first = pal[0] ? deltaE(labOf(pal[0]), lab8(PINK)) : Infinity;
  check('2. a black sleeve with a pink title gives the pink first', first < 6, `${show(pal)}, first is ΔE ${first.toFixed(1)} from the pink`);
  // The control: the commonest colour first, as a histogram picker does. On this sleeve it leads with the black.
  const counts = new Map();
  for (let i = 0; i < sleeve.length; i += 4) { const k = `${sleeve[i]},${sleeve[i + 1]},${sleeve[i + 2]}`; counts.set(k, (counts.get(k) ?? 0) + 1); }
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  check('   and the control, the commonest pixel first, fails that line (it leads with the black)', deltaE(lab8(common), lab8(PINK)) >= 6, `commonest ${common.join(',')}`);
}

// A dull beige-grey photo (a soft gradient), a small red tail light (2%), a green speck (0.1%).
{
  const photo = picture((x, y) => {
    if (Math.hypot(x - 0.7, y - 0.3) < 0.08) return [220, 20, 30];
    if (x > 0.1 && x < 0.13 && y > 0.8 && y < 0.83) return [20, 230, 40];
    const t = 0.4 + 0.3 * y;
    return [Math.round(200 * t + 30), Math.round(190 * t + 25), Math.round(170 * t + 20)];
  });
  const pal = paletteFromPixels(photo);
  check('3. a small vivid accent on a big dull ground is kept (the red, within ΔE 3)', pal.length >= 1 && nearest(pal, [220, 20, 30]) < 3, show(pal));
  check('   and a speck is not a colour of it (no dye within ΔE 15 of the green speck)', pal.length >= 1 && nearest(pal, [20, 230, 40]) > 15, show(pal));
}
{
  /*
    The ranking itself: six dull colours (chroma 14, lightness 32 to 86, each
    20 or more from the others), each a sixth of the picture less the accent,
    and a vivid violet (chroma about 90) on 4%. Ranked by share alone (run
    as a control by hand, 2026-11-15: it FAILs this line) the dull ones fill
    the palette and the violet is dropped; ranked by share and chroma
    together it is in. (The sleeve above cannot tell the two apart:
    its black is a grey and leaves on that rule, whatever the ranking.) The
    other way round is by design: a 2% accent against six fields of chroma 40
    is ranked out, as it should be, since those fields are what the picture is.
  */
  const DULL = [[97, 68, 65], [92, 114, 97], [122, 148, 167], [197, 180, 157], [233, 208, 228], [76, 96, 117]];
  const many = picture((x, y) => (Math.hypot(x - 0.5, y - 0.5) < 0.113 ? [140, 20, 230] : DULL[Math.min(5, Math.floor(x * 6))]));
  const pal = paletteFromPixels(many);
  check('   and among six dull colours, a 4% vivid one is ranked in (within ΔE 3)', pal.length === 4 && nearest(pal, [140, 20, 230]) < 3, show(pal));
}

const groundsOk = (pal) => pal.every(c => { const l = labOf(c); return deltaE(l, [0, 0, 0]) >= PICTURE_GROUND_DE - 0.6 && deltaE(l, [100, 0, 0]) >= PICTURE_GROUND_DE - 0.6; });
const apartOk = (pal) => pal.every((c, i) => pal.every((d, j) => i === j || deltaE(labOf(c), labOf(d)) >= PICTURE_DYE_APART - 0.6));
const minApart = (pal) => Math.min(...pal.flatMap((c, i) => pal.map((d, j) => (i < j ? deltaE(labOf(c), labOf(d)) : Infinity))));
{
  const bw = picture((x, y) => ((Math.floor(x * 6) + Math.floor(y * 6)) % 2 ? [255, 255, 255] : [0, 0, 0]));
  const pal = paletteFromPixels(bw);
  // Greys can only sit between lightness 40 and 60 to be 40 from both grounds, so two greys 18 apart is all there is room for.
  check(`4. a black-and-white cover gives its greys, two, ${PICTURE_GROUND_DE} or more from black and from white`, pal.length === 2 && groundsOk(pal), show(pal));
  check(`   and ${PICTURE_DYE_APART} or more apart from each other`, pal.length === 2 && apartOk(pal), `closest pair ΔE ${minApart(pal).toFixed(1)}`);
  const pal2 = paletteFromPixels(sleeve);
  check('   and the black sleeve\'s dyes are its pink, no grey from its black ground or white credit', pal2.length >= 1 && groundsOk(pal2) && pal2.every(c => Math.hypot(labOf(c)[1], labOf(c)[2]) > 30), show(pal2));
}
{
  const two = picture((x) => (x < 0.6 ? TEAL : [240, 120, 30]));
  const pal = paletteFromPixels(two);
  check('5. a two-colour cover still fills four dyes, both its colours among them', pal.length === 4 && nearest(pal, TEAL) < 2 && nearest(pal, [240, 120, 30]) < 2 && apartOk(pal), show(pal));
}
{
  const a = JSON.stringify(paletteFromPixels(blocks)), b = JSON.stringify(paletteFromPixels(blocks));
  const clear = picture(() => [255, 0, 0, 0]);
  check('6. the same picture always gives the same palette, and an empty one none', a === b && paletteFromPixels(clear).length === 0 && paletteFromPixels([]).length === 0);
}
{
  const named = JSON.stringify(PALETTE_RGB.slice(0, PALETTE.length));
  const dyes = paletteFromPixels(blocks);
  setPictureDyes(dyes);
  const slots = PALETTE_RGB.slice(PICTURE_DYE0, PICTURE_DYE0 + PICTURE_DYES);
  check('7. the picture\'s dyes land in the four slots after the 24 named dyes',
    PICTURE_DYE0 === 24 && PALETTE_RGB.length === PICTURE_DYE0 + PICTURE_DYES && slots.every((c, i) => c.r === dyes[i].r && c.g === dyes[i].g && c.b === dyes[i].b),
    `slots ${show(slots)}`);
  check('   the named dyes and the dice\'s count are unchanged (no seeded plate moves)', JSON.stringify(PALETTE_RGB.slice(0, PALETTE.length)) === named && PALETTE_COUNT === PALETTE.length && PALETTE.length === 24);
  check('   the lock\'s "From picture" is the slots\' harmony, one past the named ones, and a named lock is still its own',
    PICTURE_LOCK === COLOR_HARMONIES.length && JSON.stringify(lockHarmony(PICTURE_LOCK)) === JSON.stringify(PICTURE_HARMONY)
    && lockHarmony(3) === COLOR_HARMONIES[3] && lockHarmony(null) === null && lockName(PICTURE_LOCK) === PICTURE_PALETTE_NAME && lockName(0) === 'Warm Sunset');
}
{
  const four = JSON.stringify(paletteFromPixels(blocks));
  check('8. saved colours read back only when they are four real colours',
    readPictureDyes(four)?.length === 4 && readPictureDyes(null) === null && readPictureDyes('nonsense') === null
    && readPictureDyes(JSON.stringify([{ r: 2, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }])) === null
    && readPictureDyes(JSON.stringify(JSON.parse(four).slice(0, 3))) === null);
}

// ── Files, through the browser's own decoders ────────────────────────

const app = await launchChromium(chromium, { headless: true });
try {
  const page = await app.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: browser.outputFiles[0].text });
  const got = await page.evaluate(async ({ PINK, TEAL, YELLOW, VIOLET }) => {
    const canvas = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')); return c; };
    const css = (c) => `rgb(${c.join(',')})`;
    const cover = canvas(400, 400, (g) => {
      g.fillStyle = css(PINK); g.fillRect(0, 0, 200, 200);
      g.fillStyle = css(TEAL); g.fillRect(0, 200, 200, 200);
      g.fillStyle = css(YELLOW); g.fillRect(200, 0, 200, 200);
      g.fillStyle = css(VIOLET); g.fillRect(200, 200, 200, 200);
    });
    const blob = (c, type) => new Promise(done => c.toBlob(done, type, 0.85));
    const out = {};
    out.png = await PP.paletteOfFile(await blob(cover, 'image/png'));
    out.jpeg = await PP.paletteOfFile(await blob(cover, 'image/jpeg'));
    // A video: orange for the first half, blue for the second, recorded here.
    const film = canvas(160, 90, () => {});
    const g = film.getContext('2d');
    const stream = film.captureStream(30);
    const type = ['video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, { mimeType: type });
    const parts = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    const stopped = new Promise(done => { rec.onstop = done; });
    rec.start(100);
    const t0 = performance.now();
    await new Promise((done) => {
      const tick = () => {
        const t = performance.now() - t0;
        g.fillStyle = t < 1200 ? 'rgb(245,130,20)' : 'rgb(20,60,230)';
        g.fillRect(0, 0, 160, 90);
        if (t < 2400) requestAnimationFrame(tick); else done();
      };
      tick();
    });
    rec.stop();
    await stopped;
    const video = new Blob(parts, { type: 'video/webm' });
    // What the file says of its own length before it is read through.
    const probe = document.createElement('video');
    probe.muted = true; probe.src = URL.createObjectURL(video);
    await new Promise(done => { probe.onloadedmetadata = done; probe.onerror = done; });
    out.saidLength = probe.duration;
    out.video = await PP.paletteOfFile(video);
    try { await PP.paletteOfFile(new Blob(['not a picture'], { type: 'image/png' })); out.refused = null; } catch (e) { out.refused = e instanceof Error ? e.message : String(e); }
    return out;
  }, { PINK, TEAL, YELLOW, VIOLET });

  for (const [kind, tol] of [['png', 2], ['jpeg', 3]]) {
    const pal = got[kind];
    const worst = Math.max(...[PINK, TEAL, YELLOW, VIOLET].map(c => nearest(pal, c)));
    check(`9. a ${kind.toUpperCase()} of the four blocks, opened by the browser, gives the four colours (within ΔE ${tol})`, pal.length === 4 && worst < tol, `${show(pal)}, worst ΔE ${worst.toFixed(1)}`);
  }
  const orange = nearest(got.video, [245, 130, 20]), blue = nearest(got.video, [20, 60, 230]);
  check('10. a recorded video that does not say its length, orange then blue, gives both: read across the film, not its first frame (each within ΔE 5)',
    got.saidLength === Infinity && orange < 5 && blue < 5, `${show(got.video)}; ΔE orange ${orange.toFixed(1)}, blue ${blue.toFixed(1)}; the file said its length was ${got.saidLength}`);
  check('11. a file that is no picture is refused with a sentence', typeof got.refused === 'string' && /would not open as a picture/.test(got.refused), String(got.refused));
} finally {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(bad ? `\n${bad} FAIL` : '\nall ok');
process.exit(bad ? 1 : 0);
