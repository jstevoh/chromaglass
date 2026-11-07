#!/usr/bin/env node
/**
 * The closeup's bubbles drawn from their circles, not the grid (PLAN 38h-13).
 *
 *   npm run bubbleedge      (the lab: any adapter that computes)
 *
 * The owner, 2026-11-07: the live site in "close up" has "really pixelated
 * bubble edges". Photographed in the lab on Classic at the Close-up button's
 * 4x, three faults, each a grid cell wide (about 25 screen pixels there):
 * square chunks between two bubbles sitting close, flat cuts off a rim, and
 * a blocky polygon in a bubble's window. All three were the grid showing
 * through a picture that should be the bubble's own circle:
 *
 *  - The air field kept, where two discs overlapped, the larger of each of
 *    its four channels on its own (a max blend), so a texel there carried one
 *    bubble's coverage, the other's position and the larger look, and said a
 *    centre that was neither's. Every pixel near it drew that circle.
 *  - A pixel took its bubble from the four texels round it, mixed; and the
 *    camera's bubble was drawn only where the filtered coverage passed 0.02,
 *    which runs straight across a texel inside the fitted rim.
 *  - The window showed the dye the solver left in the rim's cells.
 *
 * What a grid cannot do is change with where the grid lies under a bubble,
 * if the bubble is drawn from its circle. So the check lays the same bubble
 * at two phases of the grid, half a cell apart in both directions, and
 * photographs each with the camera on its centre: the two pictures should
 * be the same. A drawing that shows the grid differs between them by the
 * grid's own pattern. The plates are the same wash in both places, and the
 * frame's corners, far from any bubble, are compared as the floor:
 *
 *   1. In the air field, a pair pressed a fifth of their radii into each
 *      other (as pockets crowd): every covered texel's word for where its
 *      bubble is, x - R q, lies within OFF_CELL of the centre of the bubble
 *      its look names. The max blend left 4 of 68 texels out of place, the
 *      worst by 3.96 cells; the depth test leaves none (0.02).
 *   2. One bubble at 4x on the lamp ground, its two phases: the mean change
 *      over its disc under ONE levels (the grid showing through measured
 *      2.01, 99th percentile 25; the circle 0.74, 5). The bubble is there
 *      (its disc over CONTRAST levels from the liquid, 50) and the frame's
 *      corners match (under FLOOR, 0.56), so neither a missing bubble nor two
 *      different plates can pass it.
 *   3. A pair pressed 3% into each other on the lamp ground, likewise (each
 *      of its bubbles over CONTRAST from the liquid, in both pictures): the
 *      mean change over both discs under PAIR levels (4.59 before, 1.18
 *      after) and its 99th percentile under PAIR_P99 (the square chunks: 82
 *      before, 8 after).
 *   4. The same pair on the black ground (Classic's), where the plate's own
 *      grain differs between the two places by 2.1 levels: the change over
 *      the discs exceeds the corners' by under BLACK (2.39 before, 0.07
 *      after), each bubble shown as in 3.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** The grid and picture; bubbles of 4.3 and 2.8 cells (two sizes the field packs apart), pressed 3% into each other. */
const N = 256, S = 240, ZOOM = 4, PX = S * 1.5 * ZOOM;
const R1 = 4.3 / N, R2 = 2.8 / N, PRESS = 0.97, DEEP = 0.8;
const OFF_CELL = 0.25, ONE = 1.2, PAIR = 2.2, PAIR_P99 = 30, BLACK = 1.0, CONTRAST = 20, FLOOR = 1.0;
/** Where each scene sits, and its offset from the grid in cells: the second of each pair half a cell on. */
const SCENES = [[0.25, 0.3, 0.37, 0.21], [0.75, 0.3, 0.87, 0.71], [0.25, 0.7, 0.37, 0.21], [0.75, 0.7, 0.87, 0.71]];

const { page, close } = await openLab();
let r;
try {
  r = await page.evaluate(async ({ N, S, ZOOM, R1, R2, PRESS, DEEP, SCENES }) => {
    await lab.create(N);
    lab.dye(0.5, 0.5, 1.2, [0.2, 1.2, 0.3], 1.4);
    lab.flush(); await lab.step(4);
    const d = [], f = [];
    SCENES.forEach(([x, y, ox, oy], i) => {
      x += ox / N; y += oy / N;
      if (i < 2) { d.push(x, y, R1, 1); f.push(0, 0, 0.5, 0); }
      else { d.push(x - R2 * PRESS, y, R1, 1, x + R1 * PRESS, y, R2, 1); f.push(0, 0, 1.5, 0, 0, 0, 2.5, 0); }
    });
    // Line 1's pair, pressed deeper, in the middle of the plate where no camera looks.
    d.push(0.5 - R2 * DEEP, 0.5, R1, 1, 0.5 + R1 * DEEP, 0.5, R2, 1); f.push(0, 0, 1.5, 0, 0, 0, 2.5, 0);
    lab.solver().setBubbles(new Float32Array(d), d.length / 4, 0.25, new Float32Array(f));
    await lab.step(3, { bubbleClear: 1 });
    const out = { discs: d, air: await lab.airField() };
    for (const lg of [1, 0]) for (const [i, [x, y, ox, oy]] of SCENES.entries()) {
      out[`${lg}-${i}`] = Array.from(await lab.render(S, { bubbles: 1, lampGround: lg, lightPlay: 0 },
        { time: 3, macroAmount: 1, zoom: ZOOM, cx: x + ox / N, cy: y + oy / N, bubbles: 1 }));
    }
    return out;
  }, { N, S, ZOOM, R1, R2, PRESS, DEEP, SCENES });
} finally {
  await close();
}

// 1. The field: each covered texel of the pressed pairs against the bubble its look names.
{
  const { n, data } = r.air ?? { n: 0, data: [] };
  const sizeQ = (R) => Math.floor(Math.min(1, Math.max(0, Math.log2(R / 0.004) / 5.321928)) * 15 + 0.5);
  const discs = [];
  for (let i = 0; i < r.discs.length; i += 4) discs.push({ x: r.discs[i], y: r.discs[i + 1], R: r.discs[i + 2], q: sizeQ(r.discs[i + 2]) });
  let covered = 0, off = 0, worst = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = (j * n + i) * 4, a = data[k];
    if (!(a > 0.1)) continue;
    const u = (i + 0.5) / n, v = (j + 0.5) / n;
    // Only the deep pair, in the middle of the plate.
    if (Math.abs(u - 0.5) > 0.1 || Math.abs(v - 0.5) > 0.1) continue;
    covered++;
    const q = Math.floor(data[k + 3] * 2048 / 128 + 1e-3);
    const near = discs.filter((b) => b.q === q && Math.hypot(u - b.x, v - b.y) < 1.5 * b.R);
    const qx = (data[k + 1] / a - 0.5) * 2, qy = (data[k + 2] / a - 0.5) * 2;
    const miss = near.length ? Math.min(...near.map((b) => Math.hypot(u - b.R * qx - b.x, v - b.R * qy - b.y) * n)) : Infinity;
    worst = Math.max(worst, miss);
    if (miss > OFF_CELL) off++;
  }
  check(`1. in a pressed pair's air, every covered texel says its own bubble's centre, within ${OFF_CELL} of a cell`,
    covered > 50 && off === 0, `${off} of ${covered} texels out of place, the worst by ${worst.toFixed(2)} cells`);
}

// 2-4. The pictures at two phases of the grid.
const lum = (px, i) => 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
const over = (inside, f) => {
  const v = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inside(x - S / 2 + 0.5, y - S / 2 + 0.5)) v.push(f(y * S + x));
  v.sort((a, b) => a - b);
  return { mean: v.reduce((a, b) => a + b, 0) / v.length, p99: v[Math.floor(0.99 * (v.length - 1))] };
};
const corners = (x, y) => Math.abs(x) > 0.42 * S || Math.abs(y) > 0.42 * S;
const one = (x, y) => x * x + y * y < (1.15 * R1 * PX) ** 2;
const cA = -R2 * PRESS * PX, cB = R1 * PRESS * PX;
const pair = (x, y) => (x - cA) ** 2 + y * y < (1.15 * R1 * PX) ** 2 || (x - cB) ** 2 + y * y < (1.15 * R2 * PX) ** 2;
/** How far each scene's bubble discs stand from the liquid in its corners, the least of them: a scene whose bubbles are not drawn has nothing to compare. */
const shownIn = (lg, i, discs) => {
  const liquid = over(corners, (k) => lum(r[`${lg}-${i}`], k)).mean;
  return Math.min(...discs.map((d) => over(d, (k) => Math.abs(lum(r[`${lg}-${i}`], k) - liquid)).mean));
};
const discA = (x, y) => (x - cA) ** 2 + y * y < (R1 * PX) ** 2, discB = (x, y) => (x - cB) ** 2 + y * y < (R2 * PX) ** 2;
const change = (lg, a, b, inside) => over(inside, (i) => Math.abs(lum(r[`${lg}-${a}`], i) - lum(r[`${lg}-${b}`], i)));
{
  const d = change(1, 0, 1, one), floor = change(1, 0, 1, corners);
  const liquid = over(corners, (i) => lum(r['1-0'], i)).mean;
  const shown = over(one, (i) => Math.abs(lum(r['1-0'], i) - liquid)).mean;
  check(`2. one bubble on the lamp ground is the same picture half a cell along the grid: under ${ONE} levels over its disc`,
    d.mean < ONE && shown > CONTRAST && floor.mean < FLOOR,
    `${d.mean.toFixed(2)} (99th ${d.p99.toFixed(0)}); the bubble ${shown.toFixed(0)} from the liquid (over ${CONTRAST}), the corners ${floor.mean.toFixed(2)} (under ${FLOOR})`);
}
{
  const d = change(1, 2, 3, pair), floor = change(1, 2, 3, corners);
  const shown = Math.min(shownIn(1, 2, [discA, discB]), shownIn(1, 3, [discA, discB]));
  check(`3. a pressed pair on the lamp ground likewise: under ${PAIR} levels over the discs, the 99th percentile under ${PAIR_P99}`,
    d.mean < PAIR && d.p99 < PAIR_P99 && floor.mean < FLOOR && shown > CONTRAST,
    `${d.mean.toFixed(2)}, 99th ${d.p99.toFixed(0)}; each bubble ${shown.toFixed(0)} from the liquid (over ${CONTRAST}); the corners ${floor.mean.toFixed(2)}`);
}
{
  const d = change(0, 2, 3, pair), floor = change(0, 2, 3, corners);
  const shown = Math.min(shownIn(0, 2, [discA, discB]), shownIn(0, 3, [discA, discB]));
  check(`4. a pressed pair on the black ground: the change over the discs exceeds the corners' by under ${BLACK}`,
    d.mean - floor.mean < BLACK && shown > CONTRAST,
    `${d.mean.toFixed(2)} over the discs, ${floor.mean.toFixed(2)} in the corners; each bubble ${shown.toFixed(0)} from the liquid (over ${CONTRAST})`);
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
