#!/usr/bin/env node
/**
 * The wall test: Load-in's test pattern and Identify (PLAN.md 8e).
 *
 *   npm run wallpattern      (the lab: any adapter that computes, so a cloud session too)
 *
 * What was asked (the owner's Desk v2 design): Load-in's plate "shows the
 * test pattern (grid, diagonals, circle, corner numbers 1–4, centre
 * caption)", with an Identify where "each projector flashes its number". A
 * test pattern is for lining a projector up, so it is only worth anything if
 * it lands on the wall exactly where the show will: it is drawn in the
 * projector's own pass (gpu/output.ts), through the same corner pin, flip
 * and blanking. That is what is measured here, on the pass itself, on a flat
 * grey picture so the pattern's pixels cannot be the picture's:
 *
 *   1. Off, the pass is the pass it was, byte for byte: a wall test that is
 *      off (and an Identify that has run out) changes nothing.
 *   2. On a square pin: the picture is gone (the middle of a grid cell is
 *      the pattern's near-black, not the grey), the centre cross, the grid's
 *      lines at each eighth, the border and the circle are lit where they
 *      should be and the cells between are not; the corners carry 1 and 2
 *      (one is two segments, two is five: the lit counts tell them apart).
 *   3. On a pulled pin, the pattern follows it: the centre cross's crossing
 *      and a grid line are lit where `pointInQuad` puts them on the wall,
 *      not where they would be on a square frame.
 *   4. Flipped for a rear screen, the corner numbers swap sides with the
 *      picture.
 *   5. Blanked, the blanked edge is dark under the pattern too.
 *   6. Two mapped shapes each carry their own number in their middle.
 *   7. Identify alone: a large number lit over the show in the middle, and
 *      the show untouched away from it.
 *
 * The control is check 1 run the other way: with the pattern on, the frame
 * must differ from the plain pass by far more than the dither, or the
 * pattern is not being drawn and every other check reads the grey.
 */
import { openLab } from './lab.mjs';
import { pointInQuad } from '../src/lib/outputConfig.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const S = 256;
const GREY = [[0.3, 0.3, 0.3], [0.3, 0.3, 0.3]];
const pictures = { wall: GREY };
const SKEW = [0.12, 0.08, 0.9, 0.15, 0.82, 0.92, 0.18, 0.85];
const FAR = 4e12; // an Identify that is still running for as long as the check takes
/*
  Identify pulses (0.7 + 0.3 cos of its time left, a period of half a
  second), so a frame is a moment of the pulse. The first version of this
  check rendered at whatever moment the lab got to it: it passed in the cloud
  and read 0 lit pixels on CI's Mac, which landed near the pulse's dimmest,
  where white at 0.4 over the grey is 148 against a bar of 160. The clock is
  pinned instead: 3 s left is a whole number of periods (the brightest), and
  2.75 s left is half a period off (the dimmest), and both are asked.
*/
const PEAK = FAR - 3000, TROUGH = FAR - 2750;
const on = { pattern: true, identifyUntil: 0 };
const base = { maskFeather: 0 };
const CASES = {
  plain: [{ ...base }],
  offTest: [{ ...base, test: { pattern: false, identifyUntil: 1 } }],
  square: [{ ...base, test: on }],
  skew: [{ ...base, corners: SKEW, test: on }],
  flip: [{ ...base, flipX: true, test: on }],
  masked: [{ ...base, maskTop: 0.2, test: on }],
  graded: [{ ...base, gain: 2, gamma: 0.6, test: on }],
  shapes: [{ ...base, test: on, surfaces: [
    { corners: [0, 0, 0.5, 0, 0.5, 1, 0, 1], src: [0, 0, 0.5, 1], enabled: true, opacity: 1, feather: 0 },
    { corners: [0.5, 0, 1, 0, 1, 1, 0.5, 1], src: [0.5, 0, 0.5, 1], enabled: true, opacity: 1, feather: 0 },
  ] }],
  identify: [{ ...base, now: PEAK, test: { pattern: false, identifyUntil: FAR } }],
  identifyDim: [{ ...base, now: TROUGH, test: { pattern: false, identifyUntil: FAR } }],
};

const lab = await openLab();
let shots;
try {
  shots = await lab.page.evaluate(async ({ S, CASES, pictures }) => {
    await lab.create(64);
    const out = {};
    for (const [name, [cfg]] of Object.entries(CASES)) out[name] = await lab.projector(S, cfg, pictures);
    return out;
  }, { S, CASES, pictures });
} finally { await lab.close(); }

const lum = (img, x, y) => { const k = (y * S + x) * 4; return (img.pixels[k] + img.pixels[k + 1] + img.pixels[k + 2]) / 3; };
/** The brightest pixel within r of (x, y): a one- or two-pixel line need not land on an exact pixel. */
const peak = (img, x, y, r = 2) => {
  let m = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const X = Math.round(x) + dx, Y = Math.round(y) + dy;
    if (X >= 0 && Y >= 0 && X < S && Y < S) m = Math.max(m, lum(img, X, Y));
  }
  return m;
};
/** How many pixels in a box are lit white (a digit's segments, a line). */
const litIn = (img, x0, y0, x1, y1, over = 200) => {
  let n = 0;
  for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) if (lum(img, x, y) > over) n++;
  return n;
};
const diff = (a, b) => { let m = 0; for (let i = 0; i < a.pixels.length; i++) if (i % 4 !== 3) m = Math.max(m, Math.abs(a.pixels[i] - b.pixels[i])); return m; };
const GREY8 = 0.3 * 255;

// 1. Off is the pass it was; on is not (the control).
{
  const d = diff(shots.offTest, shots.plain);
  check('a wall test that is off, and an Identify that has run out, change nothing', d === 0, `largest difference ${d}`);
  const dOn = diff(shots.square, shots.plain);
  check('and on, the frame is the pattern, not the picture (the control)', dOn > 150, `largest difference ${dOn}`);
}

// 2. The square pin.
{
  const img = shots.square;
  const cell = lum(img, Math.round(S * (1.5 / 8)), Math.round(S * (2.5 / 8)));
  check('the picture is gone: the middle of a grid cell is the pattern\'s near-black, not the grey', cell < 20 && Math.abs(cell - GREY8) > 50,
    `${cell.toFixed(0)} (the grey is ${GREY8.toFixed(0)})`);
  const cross = [peak(img, S / 2, S * 0.3), peak(img, S * 0.3, S / 2)];
  check('the centre cross is lit, across and down', cross.every(v => v > 150), cross.map(v => v.toFixed(0)).join(' '));
  const grid = [1, 3, 5, 7].map(k => peak(img, S * k / 8, S * (3.5 / 8), 1));
  check('a grid line at each eighth', grid.every(v => v > 60), grid.map(v => v.toFixed(0)).join(' '));
  // Along a row between grid lines, at cells the diagonals and the circle do not cross.
  const gaps = [0, 1, 4, 6].map(k => lum(img, Math.round(S * (k + 0.5) / 8), Math.round(S * (2.5 / 8))));
  check('and dark between them', gaps.every(v => v < 20), gaps.map(v => v.toFixed(0)).join(' '));
  const border = [peak(img, 1, S * 0.6, 1), peak(img, S - 2, S * 0.6, 1), peak(img, S * 0.6, 1, 1), peak(img, S * 0.6, S - 2, 1)];
  check('the border is lit on all four sides', border.every(v => v > 200), border.map(v => v.toFixed(0)).join(' '));
  // The circle, 0.4 of the height out from the middle, at 0° and 90°, clear of the cross and the grid.
  const ring = [peak(img, S / 2 + 0.4 * S * Math.cos(0.6), S / 2 + 0.4 * S * Math.sin(0.6)), peak(img, S / 2 - 0.4 * S * Math.cos(0.6), S / 2 - 0.4 * S * Math.sin(0.6))];
  check('the circle is lit at its radius', ring.every(v => v > 200), ring.map(v => v.toFixed(0)).join(' '));
  // Inside the border (4 px of white), so only the digit is counted.
  const box = S * 0.16;
  const one = litIn(img, 6, 6, box, box), two = litIn(img, S - box, 6, S - 6, box);
  check('the corners are numbered: 1 top left (two segments), 2 top right (five)', one > 20 && two > one * 1.8, `lit ${one} and ${two}`);
}

// 3. The pattern follows the pin.
{
  const img = shots.skew;
  const [mx, my] = pointInQuad(SKEW, 0.5, 0.5);
  const [gx, gy] = pointInQuad(SKEW, 0.25, 0.6);
  const naive = [0.5 * S, 0.5 * S];
  const at = peak(img, mx * S, my * S), grid = peak(img, gx * S, gy * S, 1);
  check('on a pulled pin, the centre cross crosses where the pin puts the middle', at > 150, `${at.toFixed(0)} at ${(mx * S).toFixed(0)},${(my * S).toFixed(0)}`);
  check('and a grid line runs where the pin puts it', grid > 60, `${grid.toFixed(0)} at ${(gx * S).toFixed(0)},${(gy * S).toFixed(0)}`);
  const off = lum(img, 3, 3);
  check('outside the pulled quad, nothing is drawn', off < 5, `${off.toFixed(0)} at the frame\'s corner`);
  check('(the middle moved: the check is not reading the square frame\'s cross)', Math.hypot(mx * S - naive[0], my * S - naive[1]) > 6);
}

// 4. Flipped.
{
  const img = shots.flip, box = S * 0.16;
  const left = litIn(img, 6, 6, box, box), right = litIn(img, S - box, 6, S - 6, box);
  check('flipped for a rear screen, the corner numbers swap sides with the picture', right > 20 && left > right * 1.8, `lit ${left} left, ${right} right`);
}

// 5. Blanked.
{
  const img = shots.masked;
  const top = Math.max(...[0.3, 0.5, 0.7].map(u => peak(img, u * S, S * 0.1, 3)));
  const below = peak(img, S / 2, S * 0.3);
  check('blanked at the top, the pattern is dark there too, and drawn below', top < 5 && below > 150, `brightest in the blanked band ${top.toFixed(0)}, the cross below ${below.toFixed(0)}`);
}

// 6. Two shapes, two numbers. Each half is 128 wide: its middle number is the 1 or the 2.
{
  const img = shots.shapes;
  const h = S * 0.14, w = 0.6 * h * 2; // a half is half as wide as tall: the digit is twice as wide in its x
  const a = litIn(img, S * 0.25 - w, S / 2 - h, S * 0.25 + w, S / 2 + h);
  const b = litIn(img, S * 0.75 - w, S / 2 - h, S * 0.75 + w, S / 2 + h);
  check('two mapped shapes each carry their own number in their middle (1, then 2)', a > 10 && b > a * 1.4, `lit ${a} and ${b}`);
  const g = [peak(img, S * 0.25, S * 0.2), peak(img, S * 0.75, S * 0.2)];
  check('and each draws its own pattern (its own centre cross)', g.every(v => v > 150), g.map(v => v.toFixed(0)).join(' '));
}

// 7. Identify alone, over the show.
{
  const img = shots.identify;
  // A large 1: the right-hand segments, a tall bar right of the middle.
  const bar = litIn(img, S * 0.5, S * 0.3, S * 0.7, S * 0.7, 160);
  const away = Math.max(...[[20, 20], [S - 20, S - 20], [20, S - 20]].map(([x, y]) => Math.abs(lum(img, x, y) - lum(shots.plain, x, y))));
  check('Identify lights the quad\'s number large in the middle', bar > 200, `${bar} lit pixels`);
  check('and leaves the show alone away from it', away <= 1, `largest change ${away.toFixed(1)}`);
  // At the pulse's dimmest it still shows over the show (white at 0.4 lifts the grey by
  // about 70), and it is dimmer than at its brightest: the flash moves.
  const dim = shots.identifyDim;
  let shows = 0, sumPeak = 0, sumDim = 0, n = 0;
  for (let y = Math.round(S * 0.3); y < Math.round(S * 0.7); y++) {
    for (let x = Math.round(S * 0.5); x < Math.round(S * 0.7); x++) {
      if (lum(img, x, y) < 160) continue;
      n++; sumPeak += lum(img, x, y); sumDim += lum(dim, x, y);
      if (lum(dim, x, y) - lum(shots.plain, x, y) >= 40) shows++;
    }
  }
  check('and at the pulse\'s dimmest the number still shows, dimmer than at its brightest',
    n > 200 && shows > n * 0.9 && sumPeak / n > sumDim / n + 30,
    n ? `${shows} of ${n} of its pixels lifted by 40 or more; brightest ${(sumPeak / n).toFixed(0)}, dimmest ${(sumDim / n).toFixed(0)}` : 'no number at its brightest');
}

// The pattern is a known level: the grade does not reach it.
{
  const d = diff(shots.graded, shots.square);
  check('the test pattern is not graded (gain 2, gamma 0.6 leave it as it is)', d <= 2, `largest difference ${d}`);
}

/*
  `npm run wallpattern -- --png <dir>` writes the cases as pictures, to look
  at what the numbers describe (a PNG writer in a dozen lines, as watch.mjs
  has, so the check needs nothing installed).
*/
const pngAt = process.argv.indexOf('--png');
if (pngAt > 0 && process.argv[pngAt + 1]) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { deflateSync } = await import('node:zlib');
  const dir = process.argv[pngAt + 1];
  mkdirSync(dir, { recursive: true });
  const T = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  for (const name of ['square', 'skew', 'flip', 'shapes', 'identify']) {
    const raw = Buffer.alloc((S * 3 + 1) * S);
    const px = shots[name].pixels;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) for (let c = 0; c < 3; c++) raw[y * (S * 3 + 1) + 1 + x * 3 + c] = px[(y * S + x) * 4 + c];
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 2;
    writeFileSync(`${dir}/wall-${name}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  }
  console.log(`pictures in ${dir}`);
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} wall pattern checks passed`);
process.exit(failed.length ? 1 : 0);
