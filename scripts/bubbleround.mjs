#!/usr/bin/env node
/**
 * A bubble's outline is drawn at the screen's resolution, not the grid's.
 *
 *   npm run bubbleround      (the lab: any adapter that computes; in Measure's lab part)
 *
 * What was reported (2026-11-11): "the bubbles still look shitty and
 * pixelated. They look like a old computer drew them." In the lab every
 * bubble's outline on the plate was a polygon, one flat facet per texel of
 * the air field: the projector's bubble was as opaque as the field's
 * coverage, and a contour of a bilinearly filtered grid is a chain of
 * pieces with corners on the grid (PLAN 38h-15, wgsl/bubbleShape.ts). Now
 * the field names which bubble a texel is, and the plate draws its rim from
 * the bubble's own disc.
 *
 * Measured on bubbles of 1.5 to 6 cells, centred off the grid by fractions
 * of a texel, on the dark ground (the dye lit, a bubble's band and hole
 * black), zoomed so a cell is about eleven screen pixels: from each bubble's
 * laid centre, along RAYS angles, the radius where the picture crosses half
 * way from the bubble's black to the dye round it, read to a tenth of a pixel.
 *
 *   1. round: on the plate (the projector's view) every bubble's rim radius
 *      varies by no more than ROUND_PX over the angles, a pixel's antialiasing
 *      and the dither; and the control, the bubbles drawn from the field as
 *      they were (CONTROL below: the plate told no texel names a bubble, so it
 *      falls back to the field's drawing), varies by more than CONTROL_PX on
 *      the bubbles of 2.5 cells and more, so the bar is one the old outline
 *      failed rather than one no picture could miss
 *   2. where it is: the rim's mean radius is the laid radius to within
 *      PLACE_PX (the field's contour sat inside it, at a coverage of 0.02 to
 *      0.28 of a rim ramped over a texel and a half)
 *   3. neighbours keep their own rims: two bubbles laid GAP_CELLS apart,
 *      closer than the skirt (wgsl/air.ts, AIR_SKIRT, three texels) so every
 *      texel between them names one bubble or the other, each round and in
 *      place on the side facing the other. (Closer than about two cells the
 *      grid leaves no dye between them to see an edge against.)
 *
 * Printed, not judged: each bubble's spread and mean, for the record. The
 * closeup's bubble is drawn from the same disc but is not measured here:
 * a ball narrower than the gap shows the camera the liquid above and below
 * it, so its rim has no one edge to cross, and it is judged by its pictures
 * (the look skill).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256, SIZE = 640, ZOOM = 3, RAYS = 96;
const ROUND_PX = 1.5, CONTROL_PX = 2.5, PLACE_PX = 1.0, GAP_CELLS = 2.5;
// Cells across, and where in a texel each centre falls (so no bubble sits on the grid's symmetry).
const BUBS = [[1.5, 0.37, 0.21], [2.5, 0.63, 0.44], [4, 0.18, 0.71], [6, 0.52, 0.09]];

/*
  The control: no texel names a bubble of the list, so every bubble is drawn
  from the field, as all were before 38h-15. Its one line must be found once.
*/
const INDEX_LINE = 'fn airIndex(v: f32) -> i32 {\n';
const CONTROL = {
  name: 'field-outline',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]bubbleShape\.ts$/ }, async (a) => {
      const { readFileSync } = await import('node:fs');
      const s = readFileSync(a.path, 'utf8');
      const found = s.split(INDEX_LINE).length - 1;
      if (found !== 1) throw new Error(`bubbleround: the control found ${found} of 1 "${INDEX_LINE.trim()}" in wgsl/bubbleShape.ts`);
      return { contents: s.replace(INDEX_LINE, `${INDEX_LINE}  if (v > -1.0) { return -1; }\n`), loader: 'ts' };
    });
  },
};

const measure = (page, strict) => page.evaluate(async ({ N, SIZE, ZOOM, RAYS, BUBS, GAP_CELLS, strict }) => {
  const PER = SIZE * 1.5 * ZOOM; // screen pixels per plate uv (the frame shows 1/1.5 of the plate)
  const cell = PER / N;
  const lum = (p, x, y) => {
    // Bilinear, so a rim is read to a fraction of a pixel.
    const x0 = Math.floor(x - 0.5), y0 = Math.floor(y - 0.5), fx = x - 0.5 - x0, fy = y - 0.5 - y0;
    const at = (i, j) => { const k = 4 * (Math.min(SIZE - 1, Math.max(0, i)) + Math.min(SIZE - 1, Math.max(0, j)) * SIZE); return 0.299 * p[k] + 0.587 * p[k + 1] + 0.114 * p[k + 2]; };
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  // Laid out in screen pixels round the frame's middle, then turned into plate uv on the grid.
  const place = (list) => list.map(([cells, fx, fy, sx, sy]) => {
    const u = 0.5 + sx / PER, v = 0.5 + sy / PER;
    // Snap the centre to a texel's corner, then put it the asked fraction in.
    const gu = (Math.floor(u * N) + fx) / N, gv = (Math.floor(v * N) + fy) / N;
    // The picture runs up the plate: a texture row read y-down lands in a canvas the other way (FLIP_Y).
    return { cells, u: gu, v: gv, px: SIZE / 2 + (gu - 0.5) * PER, py: SIZE / 2 - (gv - 0.5) * PER, rad: cells * cell };
  });
  const rimOf = (p, b, from = 0, to = Math.PI * 2) => {
    const radii = [];
    for (let k = 0; k < RAYS; k++) {
      const t = from + ((k + 0.5) / RAYS) * (to - from), dx = Math.cos(t), dy = Math.sin(t);
      const R = b.rad;
      let dark = Infinity, lit = 0, n = 0;
      for (let r = 0.3 * R; r <= 0.9 * R; r += 0.25) dark = Math.min(dark, lum(p, b.px + dx * r, b.py + dy * r));
      for (let r = R + 0.4 * cell; r <= R + 0.9 * cell; r += 0.25) { lit += lum(p, b.px + dx * r, b.py + dy * r); n++; }
      lit /= n;
      const mid = (dark + lit) / 2;
      // The outermost crossing between 0.5 R and the lit ring.
      let edge = NaN;
      for (let r = R + 0.4 * cell; r >= 0.5 * R; r -= 0.05) {
        if (lum(p, b.px + dx * r, b.py + dy * r) < mid) { edge = r + 0.05 * (mid - lum(p, b.px + dx * r, b.py + dy * r)) / Math.max(1e-3, lum(p, b.px + dx * (r + 0.05), b.py + dy * (r + 0.05)) - lum(p, b.px + dx * r, b.py + dy * r)); break; }
      }
      // No edge to read: on the shader a fault; on the control a bubble too faint to have a rim, which is a spread of its own.
      if (!(lit - dark > 40)) { if (strict) throw new Error(`bubbleround: the ${b.cells} cell bubble's ray ${k} goes from ${dark.toFixed(0)} to ${lit.toFixed(0)}, no edge to read`); edge = NaN; }
      radii.push(edge);
    }
    if (radii.some((r) => !Number.isFinite(r))) {
      if (strict) throw new Error(`bubbleround: the ${b.cells} cell bubble has a ray with no crossing`);
      return { cells: b.cells, rad: b.rad, spread: Infinity, mean: NaN };
    }
    const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
    return { cells: b.cells, rad: b.rad, spread: Math.max(...radii) - Math.min(...radii), mean };
  };
  const scene = async (list, macroAmount) => {
    await lab.create(N);
    lab.dyeDisc(0.5, 0.5, 0.45, [1.2, 0.3, 0.8], 1.3);
    lab.flush(); await lab.step(10);
    const flat = list.flatMap((b) => [b.u, b.v, b.cells / N, 1]);
    const fing = list.flatMap((_, i) => [0, 0, ((i + 0.5) / list.length) * Math.PI * 2 * 0.999, 0.5]);
    lab.solver().setBubbles(new Float32Array(flat), list.length, 0.25, new Float32Array(fing));
    await lab.step(2, { bubbleClear: 1 });
    const p = new Uint8ClampedArray(await lab.render(SIZE, { lampGround: 0 }, { zoom: ZOOM, macroAmount, view: true, cx: 0.5, cy: 0.5, bubbles: 0.8 }));
    if (p.length !== SIZE * SIZE * 4) throw new Error(`bubbleround: a picture came back ${p.length} bytes`);
    return p;
  };
  // A row across the frame's middle, 30 px apart.
  let x = -SIZE / 2 + 40;
  const row = place(BUBS.map(([c, fx, fy]) => { const r = c * cell; x += r; const at = [c, fx, fy, x, 0]; x += r + 30; return at; }));
  if (x > SIZE / 2 - 10) throw new Error(`bubbleround: the row runs to ${x.toFixed(0)} px past the middle of a ${SIZE} px frame`);
  const plate = await scene(row, 0);
  // Two of 4 cells, GAP_CELLS apart: each read on the half facing the other.
  const apart = 8 + GAP_CELLS;
  const pair = place([[4, 0.5, 0.5, -apart / 2 * cell, 0], [4, 0.5, 0.5, apart / 2 * cell, 0]]);
  pair[1].u = pair[0].u + apart / N; pair[1].px = pair[0].px + apart * cell;
  const two = await scene(pair, 0);
  return {
    plate: row.map((b) => rimOf(plate, b)),
    pair: [rimOf(two, pair[0], -Math.PI / 2, Math.PI / 2), rimOf(two, pair[1], Math.PI / 2, Math.PI * 1.5)],
  };
}, { N, SIZE, ZOOM, RAYS, BUBS, GAP_CELLS, strict });

const plain = await openLab();
let now, then;
try { now = await measure(plain.page, true); } finally { await plain.close(); }
const control = await openLab({ plugins: [CONTROL], tag: 'field-outline' });
try {
  if (control.js === plain.js) throw new Error('bubbleround: the control built the same bundle as the plain lab (its edit matched nothing)');
  then = await measure(control.page, false);
} finally { await control.close(); }

const row = (r) => `${String(r.cells).padStart(4)} cells (${r.rad.toFixed(1)} px): spread ${r.spread.toFixed(2)} px, mean ${r.mean.toFixed(2)} px`;
for (const [name, m] of [['the shader', now], ['the control (drawn from the field)', then]]) {
  console.log(`   ${name}:`);
  for (const k of ['plate', 'pair']) for (const r of m[k]) console.log(`     ${k.padEnd(7)} ${row(r)}`);
}

const worst = (rs, f) => Math.max(...rs.map(f));
const sp = (r) => r.spread, off = (r) => Math.abs(r.mean - r.rad);
check(`round on the plate (worst spread ${worst(now.plate, sp).toFixed(2)} px ≤ ${ROUND_PX})`, worst(now.plate, sp) <= ROUND_PX);
const ctrlBig = then.plate.filter((r) => r.cells >= 2.5);
check(`the control is a polygon on the bubbles of 2.5 cells and more (least spread ${Math.min(...ctrlBig.map(sp)).toFixed(2)} px > ${CONTROL_PX})`, ctrlBig.length >= 3 && Math.min(...ctrlBig.map(sp)) > CONTROL_PX);
check(`at the laid radius on the plate (worst ${worst(now.plate, off).toFixed(2)} px off ≤ ${PLACE_PX})`, worst(now.plate, off) <= PLACE_PX);
check(`neighbours ${GAP_CELLS} cells apart keep their own rims (worst spread ${worst(now.pair, sp).toFixed(2)} px ≤ ${ROUND_PX}, worst ${worst(now.pair, off).toFixed(2)} px off ≤ ${PLACE_PX})`, worst(now.pair, sp) <= ROUND_PX && worst(now.pair, off) <= PLACE_PX);

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} FAIL` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
