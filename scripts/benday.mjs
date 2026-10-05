#!/usr/bin/env node
/**
 * Ben-Day dots: the plate printed as a comic, on purpose and in one look.
 *
 *   npm run benday      (the lab: any adapter that computes)
 *
 * What was asked: a screenshot of Classic at 2.8x came up covered in red
 * dots on white by accident, which the owner liked ("Roy Lichtenstein type
 * style ... let's reserve this effect for a particular preset and a
 * particular control"). The accident is another fix's. This is the effect
 * built on purpose: the Ben-Day Dots control (`benDay`, wgsl/plate.ts),
 * which reads each pixel as a printer's inks, and the look Roy, 1963, the
 * only one that turns it up.
 *
 * Asked here, each of the print's claims against a plate made to show it,
 * rendered through the real plate shader:
 *
 *   1. it is reserved: Roy turns it up (full, as Roy ships it, which every
 *      picture here is rendered at) and no other shipped look does
 *   2. a pale wash prints as Ben-Day dots: separate dots of the solid ink on
 *      white at the lattice's count and its 28% of the area, one size, and
 *      the same size in a deeper wash (the evenness is what tells Ben-Day
 *      from a halftone, whose dots grow with the tint); on a square screen
 *      turned 45°, a pitch apart; and at 0 the same wash is the tint it was
 *      laid as, with no dot in it, so it is the control that made them
 *   3. the dots are the screen's, not the glass's: the plate turned under
 *      them leaves them where they were
 *   4. a thick pool of two colours prints flat in the ink its hue is
 *      nearest, and is outlined in black where it ends, the whole way round
 *   5. two solid inks laid over each other have a black line between them,
 *      all along the seam
 *   6. each ink is where it was laid: a wash is red and white, the pools
 *      are the five inks (white, black, red, yellow, blue) and hardly
 *      anything else, where at 0 the washes are none of them
 *   7. a colour the three inks do not have prints as two of them over each
 *      other, as a comic printed it (QA-16: a green dye on Roy printed as
 *      yellow): a green pool prints the green of cyan over yellow, a violet
 *      one the violet of magenta and half cyan, each flat, where nearest-ink
 *      put the green on the yellow and the violet on the blue
 *
 * Each was tried against a shader that gets it wrong (check-skeptic,
 * patched in the bundle): a halftone, a 0° screen, a lattice on the glass,
 * no seam, no line, a print that returns white, the pixel's own hue.
 *
 * Every number is read off a render of SIZE² on a lattice of BENDAY_ROWS
 * rows (32, so a 16 px pitch and dots of 4.8 px radius here).
 */
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const SIZE = 512;
const ROWS = Number(/const BENDAY_ROWS: f32 = ([\d.]+);/.exec(readFileSync('src/gpu/wgsl/plate.ts', 'utf8'))?.[1]);
const DOT = Number(/const BENDAY_DOT: f32 = ([\d.]+);/.exec(readFileSync('src/gpu/wgsl/plate.ts', 'utf8'))?.[1]);
if (!Number.isFinite(ROWS) || !Number.isFinite(DOT)) throw new Error(`benday: could not read BENDAY_ROWS (${ROWS}) or BENDAY_DOT (${DOT}) from wgsl/plate.ts`);
const PITCH = SIZE / ROWS;
const RED = [0.05, 1.6, 1.6], YELLOW = [0.02, 0.1, 1.6], BLUE = [1.6, 0.9, 0.25];
const INKS = { white: [255, 255, 255], black: [0, 0, 0], red: [227, 26, 31], yellow: [255, 219, 15], blue: [20, 84, 199] };
/** The overprints (plate.ts, BENDAY_GREEN and _VIOLET), for 7 only: 6 counts the five inks. */
const OVER = { ...INKS, green: [23, 219, 12], violet: [124, 30, 227] };
const GREEN = [1.6, 0.05, 1.6], VIOLET = [0.5, 1.6, 0.1];

const at = (px, x, y) => { const k = (y * SIZE + x) * 4; return [px[k], px[k + 1], px[k + 2]]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const nearest = (c) => Object.entries(INKS).reduce((m, [n, v]) => (dist(c, v) < m.d ? { n, d: dist(c, v) } : m), { n: '', d: Infinity });
const isRed = (c) => dist(c, INKS.red) < 60;
const isBlack = (c) => c[0] + c[1] + c[2] < 120;

/** The connected red regions in the square [lo, hi)², as their pixel counts, with any touching the square's edge dropped. */
function components(px, lo, hi, is) {
  const seen = new Uint8Array(SIZE * SIZE);
  const out = [];
  for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) {
    if (seen[y * SIZE + x] || !is(at(px, x, y))) continue;
    let n = 0, edge = false;
    const stack = [[x, y]];
    seen[y * SIZE + x] = 1;
    while (stack.length) {
      const [i, j] = stack.pop();
      n++;
      if (i === lo || j === lo || i === hi - 1 || j === hi - 1) edge = true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < lo || b < lo || a >= hi || b >= hi || seen[b * SIZE + a] || !is(at(px, a, b))) continue;
        seen[b * SIZE + a] = 1;
        stack.push([a, b]);
      }
    }
    if (!edge) out.push(n);
  }
  return out;
}

/** How much of a pixel is the red ink rather than paper, read off its green: 0 white, 1 the ink. */
const redCover = (c) => Math.max(0, Math.min(1, (255 - c[1]) / (255 - INKS.red[1])));
/** The dots' centres: the red regions' centroids, whole ones only. */
function centres(px, lo, hi) {
  const seen = new Uint8Array(SIZE * SIZE);
  const out = [];
  for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) {
    if (seen[y * SIZE + x] || !isRed(at(px, x, y))) continue;
    let n = 0, sx = 0, sy = 0, edge = false;
    const stack = [[x, y]];
    seen[y * SIZE + x] = 1;
    while (stack.length) {
      const [i, j] = stack.pop();
      n++; sx += i; sy += j;
      if (i === lo || j === lo || i === hi - 1 || j === hi - 1) edge = true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < lo || b < lo || a >= hi || b >= hi || seen[b * SIZE + a] || !isRed(at(px, a, b))) continue;
        seen[b * SIZE + a] = 1;
        stack.push([a, b]);
      }
    }
    if (!edge) out.push([sx / n, sy / n, n]);
  }
  return out;
}
const median = (v) => { const a = [...v].sort((p, q) => p - q); return a[a.length >> 1]; };

const { page, close } = await openLab();
try {
  // ── 1. Reserved for Roy ─────────────────────────────────────────────
  const looks = await page.evaluate(() => lab.lookIds().map(id => [id, lab.look(id).settings.benDay ?? 0]));
  const printing = looks.filter(([, v]) => v > 0).map(([id]) => id);
  const ROY = Object.fromEntries(looks).roy;
  check('only Roy prints: it turns Ben-Day Dots up and no other look does', printing.length === 1 && printing[0] === 'roy',
    `looks with it up: ${printing.join(', ') || 'none'}`);

  /*
    Render a plate laid by `lay` with Roy's look, as Roy ships (its own
    Ben-Day Dots, not a value picked for the check) unless `over` says
    otherwise.
  */
  const render = (lay, over = {}, cam = {}) => page.evaluate(async ([lay, over, cam, SIZE]) => {
    await lab.create(256);
    for (const [x, y, r, ink, d] of lay) lab.dye(x, y, r, ink, d);
    lab.flush();
    await lab.step(2);
    return await lab.render(SIZE, { ...lab.look('roy').settings, ...over }, cam);
  }, [lay, over, cam, SIZE]);
  const lo = Math.round(SIZE * 0.25), hi = Math.round(SIZE * 0.75);

  // ── 2. A pale wash prints as even dots ─────────────────────────────
  /*
    Two washes, both in the tint's band (coverage 0.22 to 0.55, read at 0):
    0.14 reads about 255,165,165 and 0.16 about 255,140,140. Ben-Day dots are
    one size in both; a halftone's would be about a fifth bigger in the
    deeper one, which is what tells the two apart (on one wash a halftone's
    dots are one size too).
  */
  const washes = [];
  for (const d of [0.14, 0.16]) {
    const lay = [[0.5, 0.5, 1.2, RED, d]];
    const on = await render(lay);
    const off = await render(lay, { benDay: 0 });
    const dots = centres(on, lo, hi);
    let cover = 0;
    for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) cover += redCover(at(on, x, y));
    cover /= (hi - lo) ** 2;
    const mean = dots.reduce((a, b) => a + b[2], 0) / Math.max(1, dots.length);
    const cv = Math.sqrt(dots.reduce((a, b) => a + (b[2] - mean) ** 2, 0) / Math.max(1, dots.length)) / Math.max(1, mean);
    washes.push({ d, on, off, dots, cover, mean, cv });
  }
  const [pale, deep] = washes;
  const expected = ((hi - lo) / PITCH) ** 2;
  check('a pale wash prints as separate dots, at the lattice\'s count',
    washes.every(w => w.dots.length > expected * 0.85 && w.dots.length < expected * 1.15),
    `${washes.map(w => w.dots.length).join(' and ')} dots whole inside the middle quarter, ${expected.toFixed(0)} expected at ${ROWS} rows`);
  check('every dot is one size, and the same size in a deeper wash (Ben-Day, not a halftone)',
    washes.every(w => w.dots.length > 0 && w.cv < 0.12) && Math.abs(deep.mean / pale.mean - 1) < 0.1,
    `mean ${pale.mean.toFixed(1)} and ${deep.mean.toFixed(1)} px (a halftone's would differ by about a fifth), spread ${washes.map(w => (w.cv * 100).toFixed(1)).join('% and ')}%`);
  const want = Math.PI * DOT * DOT;
  check('the dots cover the lattice\'s share of the tint, in either wash',
    washes.every(w => Math.abs(w.cover - want) < 0.03),
    `${washes.map(w => (w.cover * 100).toFixed(1)).join('% and ')}% red ink, ${(want * 100).toFixed(1)}% from a dot of ${DOT} of the pitch`);
  /*
    Where the dots are: nearest neighbours on a square lattice turned 45°,
    one pitch apart. A screen at 0° (or any other) prints the same count and
    the same size, and only this tells it apart.
  */
  const angles = [], gaps = [];
  for (const [x, y] of deep.dots) {
    let best = null;
    for (const [u, v] of deep.dots) {
      if (u === x && v === y) continue;
      const g = Math.hypot(u - x, v - y);
      if (!best || g < best.g) best = { g, a: Math.atan2(v - y, u - x) };
    }
    if (best) { gaps.push(best.g); angles.push((((best.a * 180 / Math.PI) % 90) + 90) % 90); }
  }
  const angle = median(angles), gap = median(gaps);
  check('the screen is square and turned 45°, a pitch between dots', Math.abs(angle - 45) < 5 && Math.abs(gap / PITCH - 1) < 0.05,
    `nearest neighbours at ${angle?.toFixed(1)}°, ${gap?.toFixed(2)} px apart; pitch ${PITCH.toFixed(2)} px`);
  // At 0: the wash is the tint it was laid as, and has nothing in it darker
  // than itself (a dot would be).
  const centre = at(pale.off, SIZE >> 1, SIZE >> 1);
  const offG = [];
  for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) offG.push(at(pale.off, x, y)[1]);
  const gMed = median(offG);
  const darker = components(pale.off, lo, hi, (c) => c[1] < gMed - 25);
  const cov0 = 1 - Math.min(...centre) / Math.max(...centre);
  check('at 0 the same wash is a tint, with no dot in it', cov0 > 0.22 && cov0 < 0.55 && centre[0] > 230 && darker.length === 0,
    `it reads ${centre.join(',')}, a coverage of ${cov0.toFixed(2)}; ${darker.length} spots darker than it`);

  // ── 3. The screen's dots, not the glass's ──────────────────────────
  // A plate turned under the screen: a lattice fixed to the glass would turn
  // with it (13.9% of the pixels kept, tried).
  const lumpy = [[0.5, 0.5, 1.2, RED, 0.13], [0.3, 0.6, 0.25, RED, 0.03], [0.7, 0.35, 0.3, RED, 0.02]];
  const turned0 = await render(lumpy, {}, { rotation: 0 });
  const turned1 = await render(lumpy, {}, { rotation: 0.35 });
  let both = 0, either = 0;
  for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) {
    const a = isRed(at(turned0, x, y)), b = isRed(at(turned1, x, y));
    both += a && b ? 1 : 0; either += a || b ? 1 : 0;
  }
  check('the dots stay where the screen puts them as the plate turns under them', either > 0 && both / either > 0.9,
    `${(100 * both / Math.max(1, either)).toFixed(1)}% of the dots' pixels the same after a third of a radian`);

  // ── 4. Solid ink, flat and outlined ─────────────────────────────────
  // The red is not one colour: a touch of the blue dye on its left makes it
  // run from red to a crimson purple across the middle, which the print
  // must lay as the one red ink. Blue apart, above.
  const pools = [[0.36, 0.5, 0.11, RED, 2.5], [0.32, 0.5, 0.06, BLUE, 1.0], [0.62, 0.5, 0.11, YELLOW, 2.5], [0.5, 0.26, 0.07, BLUE, 2.5]];
  const poolOn = await render(pools);
  const poolOff = await render(pools, { benDay: 0 });
  let sx = 0, sy = 0, sn = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (isRed(at(poolOn, x, y))) { sx += x; sy += y; sn++; }
  const cx = Math.round(sx / Math.max(1, sn)), cy = Math.round(sy / Math.max(1, sn));
  /*
    Flat, read in 5 px blocks' means across the pool's middle: the film grain
    (±0.015 of the picture, laid after the print) averages out of a block,
    and anything the dye does under it would not.
  */
  const blocks = (px) => {
    const m = [];
    for (let by = cy - 15; by < cy + 15; by += 5) for (let bx = cx - 25; bx < cx + 15; bx += 5) {
      const b = [0, 0, 0];
      for (let y = by; y < by + 5; y++) for (let x = bx; x < bx + 5; x++) at(px, x, y).forEach((v, c) => { b[c] += v / 25; });
      m.push(b);
    }
    return Math.max(...[0, 1, 2].map(c => Math.max(...m.map(b => b[c])) - Math.min(...m.map(b => b[c]))));
  };
  const flatOn = blocks(poolOn), flatOff = blocks(poolOff);
  const mid = at(poolOn, cx, cy);
  check('a thick pool prints flat, in the red ink', sn > 0 && flatOn <= 4 && flatOff > 30 && nearest(mid).n === 'red',
    `${mid.join(',')} (${nearest(mid).n}); its 5 px blocks span ${flatOn.toFixed(1)} levels, ${flatOff.toFixed(1)} at 0`);
  /*
    The outline where the pool ends: on each ray out of its middle, the
    first black within 3 px of the last red. Rays toward the yellow pool
    end on the seam, which is also a line.
  */
  const ringOf = (px) => {
    let n = 0;
    for (let k = 0; k < 180; k++) {
      const a = (k / 180) * 2 * Math.PI;
      let lastRed = -1, found = false;
      for (let r = 2; r < 0.3 * SIZE; r += 0.5) {
        const x = Math.round(cx + r * Math.cos(a)), y = Math.round(cy + r * Math.sin(a));
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) break;
        const c = at(px, x, y);
        if (isRed(c)) lastRed = r;
        else if (lastRed >= 0 && isBlack(c)) { found = r - lastRed <= 3; break; }
        else if (lastRed >= 0 && r - lastRed > 3) break;
      }
      if (found) n++;
    }
    return n;
  };
  const ringed = ringOf(poolOn), ringedOff = ringOf(poolOff);
  check('the pool is outlined in black the whole way round, where the red ends', ringed >= 176 && ringedOff < 18,
    `black within 3 px of the red's end on ${ringed} of 180 rays; ${ringedOff} at 0`);

  // ── 5. Two inks that overlap, a line between ────────────────────────
  // Red and yellow laid over each other, so what meets is two solid inks
  // (the seam), not two outlines side by side: on every row across the
  // overlap, two or more black pixels between the last red and the first yellow.
  const seamPlate = [[0.43, 0.5, 0.11, RED, 2.5], [0.57, 0.5, 0.11, YELLOW, 2.5]];
  const seamOn = await render(seamPlate);
  let rows = 0, lined = 0, worst = Infinity;
  for (let y = cy - 20; y <= cy + 20; y++) {
    let lastRed = -1, firstYellow = -1;
    for (let x = 0; x < SIZE; x++) {
      const c = at(seamOn, x, y);
      if (isRed(c) && firstYellow < 0) lastRed = x;
      if (lastRed >= 0 && dist(c, INKS.yellow) < 60) { firstYellow = x; break; }
    }
    if (lastRed < 0 || firstYellow < 0) continue;
    rows++;
    let run = 0;
    for (let x = lastRed + 1; x < firstYellow; x++) run += isBlack(at(seamOn, x, y)) ? 1 : 0;
    worst = Math.min(worst, run);
    if (run >= 2 && firstYellow - lastRed < 20) lined++;
  }
  // One row in forty may miss: measured 41 of 41 on SwiftShader, and the
  // line's cut lands a pixel either way on another GPU's filtering.
  check('where red meets yellow there is a black line, all along the seam', rows >= 35 && lined >= rows - 1,
    `${lined} of ${rows} rows across the seam lined, the thinnest ${worst} px`);

  // ── 6. Five inks, in their places ───────────────────────────────────
  const shares = (px, x0, y0, x1, y1) => {
    const n = { white: 0, black: 0, red: 0, yellow: 0, blue: 0, other: 0 };
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const c = at(px, x, y); const k = nearest(c);
      n[k.d < 45 ? k.n : 'other']++;
    }
    const t = (x1 - x0) * (y1 - y0);
    for (const k in n) n[k] /= t;
    return n;
  };
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const w = shares(deep.on, lo, lo, hi, hi);
  check('a wash prints as red ink and white paper, nothing else but the dots\' rims', w.red > 0.18 && w.white > 0.6 && w.red + w.white > 0.9 && w.yellow + w.blue + w.black < 0.01,
    `red ${pct(w.red)}, white ${pct(w.white)}, the rest ${pct(1 - w.red - w.white)}`);
  const p = shares(poolOn, 0, 0, SIZE, SIZE);
  check('the pools print as the five inks, each where it was laid', p.red > 0.04 && p.yellow > 0.04 && p.blue > 0.01 && p.black > 0.005 && p.white > 0.4 && p.other < 0.03,
    `white ${pct(p.white)}, red ${pct(p.red)}, yellow ${pct(p.yellow)}, blue ${pct(p.blue)}, black ${pct(p.black)}, other ${pct(p.other)}`);
  const lumpyOff = await render(lumpy, { benDay: 0 });
  const off = shares(lumpyOff, 0, 0, SIZE, SIZE);
  check('and at 0 the washes are tints, not inks', off.other > 0.5, `${pct(off.other)} of the pixels are none of the inks at 0`);
  check('Roy ships the print full', ROY === 1, `Roy's Ben-Day Dots is ${ROY}`);

  // ── 7. Green and violet, as overprints ──────────────────────────────
  /*
    A green pool and a violet one, apart. Each is read in a 21 px square in
    its middle: the share of pixels within 45 of the overprint's colour, and
    the square's mean against every ink and overprint (the film grain
    averages out of a mean). At 0 the same pools must be green and violet to
    begin with (their hue past 40 degrees from every ink), so the check is of
    the print and not of a dye that was already yellow.
  */
  const over = [[0.32, 0.5, 0.12, GREEN, 2.5], [0.68, 0.5, 0.12, VIOLET, 2.5]];
  const overOn = await render(over);
  const overOff = await render(over, { benDay: 0 });
  const hueOf = ([r, g, b]) => ((Math.atan2(0.8660254 * (g - b), r - 0.5 * (g + b)) * 180 / Math.PI) + 360) % 360;
  const square = (px, fx) => {
    const x0 = Math.round(SIZE * fx) - 10, y0 = Math.round(SIZE * 0.5) - 10;
    const m = [0, 0, 0];
    const near = {};
    for (let y = y0; y < y0 + 21; y++) for (let x = x0; x < x0 + 21; x++) {
      const c = at(px, x, y);
      c.forEach((v, k) => { m[k] += v / 441; });
      const k = Object.entries(OVER).reduce((a, [n, v]) => (dist(c, v) < a.d ? { n, d: dist(c, v) } : a), { n: '', d: Infinity });
      if (k.d < 45) near[k.n] = (near[k.n] ?? 0) + 1 / 441;
    }
    const k = Object.entries(OVER).reduce((a, [n, v]) => (dist(m, v) < a.d ? { n, d: dist(m, v) } : a), { n: '', d: Infinity });
    return { mean: m.map(Math.round), ink: k.n, share: near };
  };
  for (const [name, fx, from] of [['green', 0.32, [80, 180]], ['violet', 0.68, [250, 330]]]) {
    const on = square(overOn, fx), off = square(overOff, fx);
    const h = hueOf(off.mean);
    check(`a ${name} pool prints flat in the ${name} overprint, not the nearest ink`,
      h > from[0] && h < from[1] && on.ink === name && (on.share[name] ?? 0) > 0.9,
      `at 0 ${off.mean.join(',')} (hue ${h.toFixed(0)}°); printed ${on.mean.join(',')} (${on.ink}), ${pct(on.share[name] ?? 0)} of its middle the ${name}`);
  }
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} of ${checks.length} failed` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
