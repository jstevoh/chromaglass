#!/usr/bin/env node
/**
 * A bead's outline is round at the screen's resolution.
 *
 *   npm run beadround      (the lab: any adapter that computes; in Measure's lab part)
 *
 * What was reported (2026-11-11), after 38h-15 made the bubbles round: "Fix
 * the small bubbles as well." Filmed on the Mac in Macro Bead, the small
 * balls with a dark wall, 40 to 60 screen pixels across, had wavy scalloped
 * outlines, and the dark-cored holes serrated rims (PLAN 38h-17).
 *
 * The balls are the oil beads. Their mask is drawn from each bead's exact
 * disc into a 512² picture of eight-bit channels and read back filtered, so
 * in a closeup the outline is a polygon a mask texel per facet, and the
 * lens's push, read from an eight-bit dome's gradient, swings round the rim.
 * The plate now evaluates the rings' mask at the point it draws, from the
 * same list (wgsl/beadShape.ts). (The holes are the bubbles: the ring
 * between a dark core and a round rim is the camera's read of the grid's
 * hole through the wall, 38h-16, not measured here.)
 *
 * Measured, on the lab's plate, of beads of 3 to 9 cells across (in mask
 * texels 6 to 18, at 3x a texel is 5.6 screen pixels) centred off the grid,
 * on the lit dye of the dark ground, in the projector's view and the
 * closeup's: along RAYS angles from each bead's laid centre, the outermost
 * radius where the picture crosses half way from the dye round the bead to
 * the darkest of its rim band, read to a tenth of a pixel.
 *
 *   1. the beads are round: every bead's rim radius varies by no more than
 *      ROUND_PX over the angles, in both views
 *   2. the control is not: the plate made to read the beads' picture, as it
 *      did (BEAD_CONTROL, the list's path turned off), fails that bar on
 *      every bead up to 7 cells in both views, and by more than CONTROL_PX on
 *      one at least, so the bar is one the old outline failed. (The 9 cell
 *      bead's facets are shallow enough to pass it: a facet's sag goes as a
 *      texel squared over the radius.)
 *
 *   3. where it is: each rim's mean radius is the laid radius to within
 *      PLACE_PX, so a bead drawn round at the wrong size fails
 *
 * The control's every ray must find its edge (a finite spread), so a control
 * that drew no beads at all could not pass line 2 by having none to read.
 *
 * Printed, not judged: the band's inner edge (DROP_CORE in the projector, the
 * camera's line in the closeup), which reads the dome the lens is worked out
 * from: 0.1 to 0.35 px of spread now, 0.3 to 1.3 px read from the mask, so on
 * one flat dye the mask's dome was nearly round already, and a line on it
 * would pass the control too. What the lens's push shows through a bead (a
 * scalloped push would bend a patterned plate's image round the rim) is not
 * measured here: the outline is what the owner filmed scalloped.
 * Printed also: each bead's spread and mean radius in both views.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256, SIZE = 640, ZOOM = 3, RAYS = 96;
const ROUND_PX = 1.5, CONTROL_PX = 2.5, PLACE_PX = 1.0;
// Cells across (diameter), and where in a cell each centre falls.
const BEADS = [[3, 0.37, 0.21], [5, 0.63, 0.44], [7, 0.18, 0.71], [9, 0.52, 0.09]];

/** Builds a lab with one line of a shader file edited, found exactly once. */
const edit = (name, file, line, to) => ({
  name,
  setup(b) {
    b.onLoad({ filter: new RegExp(`src[\\\\/]gpu[\\\\/]wgsl[\\\\/]${file}\\.ts$`) }, async (a) => {
      const { readFileSync } = await import('node:fs');
      const s = readFileSync(a.path, 'utf8');
      const found = s.split(line).length - 1;
      if (found !== 1) throw new Error(`beadround: ${name} found ${found} of 1 "${line.trim()}" in wgsl/${file}.ts`);
      return { contents: s.replace(line, to), loader: 'ts' };
    });
  },
});
/* The beads read from their picture, as before 38h-17. */
const BEAD_LINE = '  if (beadArgs.S > 0u && beadArgs.wide == 0u) { return beadRingsAt(uv); }\n';
const BEAD_CONTROL = edit('bead-picture', 'beadShape', BEAD_LINE, '');
const measure = (page, strict) => page.evaluate(async ({ N, SIZE, ZOOM, RAYS, BEADS, strict }) => {
  const PER = SIZE * 1.5 * ZOOM; // screen pixels per plate uv (the frame shows 1/1.5 of the plate)
  const cell = PER / N;
  const lum = (p, x, y) => {
    const x0 = Math.floor(x - 0.5), y0 = Math.floor(y - 0.5), fx = x - 0.5 - x0, fy = y - 0.5 - y0;
    const at = (i, j) => { const k = 4 * (Math.min(SIZE - 1, Math.max(0, i)) + Math.min(SIZE - 1, Math.max(0, j)) * SIZE); return 0.299 * p[k] + 0.587 * p[k + 1] + 0.114 * p[k + 2]; };
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  // A row across the frame's middle; each centre snapped to a cell's corner, then the asked fraction in.
  let x = -SIZE / 2 + 30;
  const row = BEADS.map(([d, fx, fy]) => {
    const r = (d / 2) * cell; x += r;
    const u = 0.5 + x / PER;
    x += r + 26;
    const gu = (Math.floor(u * N) + fx) / N, gv = (Math.floor(0.5 * N) + fy) / N;
    // The picture runs up the plate (FLIP_Y), as the bubbles' check found.
    return { cells: d, u: gu, v: gv, px: SIZE / 2 + (gu - 0.5) * PER, py: SIZE / 2 - (gv - 0.5) * PER, rad: r };
  });
  if (x > SIZE / 2 - 10) throw new Error(`beadround: the row runs to ${x.toFixed(0)} px past the middle of a ${SIZE} px frame`);
  const rimOf = (p, b, view) => {
    const radii = [], inner = [];
    for (let k = 0; k < RAYS; k++) {
      const t = ((k + 0.5) / RAYS) * Math.PI * 2, dx = Math.cos(t), dy = Math.sin(t);
      const R = b.rad;
      let lit = 0, n = 0, dark = Infinity;
      for (let r = R + 1.2 * cell; r <= R + 2 * cell; r += 0.25) { lit += lum(p, b.px + dx * r, b.py + dy * r); n++; }
      lit /= n;
      for (let r = 0.6 * R; r <= R; r += 0.25) dark = Math.min(dark, lum(p, b.px + dx * r, b.py + dy * r));
      const mid = (dark + lit) / 2;
      let edge = NaN;
      for (let r = R + 1.2 * cell; r >= 0.6 * R; r -= 0.05) {
        const here = lum(p, b.px + dx * r, b.py + dy * r);
        if (here < mid) { const out = lum(p, b.px + dx * (r + 0.05), b.py + dy * (r + 0.05)); edge = r + 0.05 * (mid - here) / Math.max(1e-3, out - here); break; }
      }
      /*
        The band's inner edge: where, going out from the bead's lit middle, the
        picture first falls half way to the band's darkest. The band starts at a
        set fraction of the dome (DROP_CORE in the projector, the camera's line
        in the closeup), so this reads the dome the lens is worked out from.
      */
      let mids = 0, m = 0;
      for (let r = 0.15 * R; r <= 0.35 * R; r += 0.25) { mids += lum(p, b.px + dx * r, b.py + dy * r); m++; }
      mids /= m;
      const half = (mids + dark) / 2;
      let ie = NaN;
      for (let r = 0.35 * R; r <= edge; r += 0.05) {
        const here = lum(p, b.px + dx * r, b.py + dy * r);
        if (here < half) { const back = lum(p, b.px + dx * (r - 0.05), b.py + dy * (r - 0.05)); ie = r - 0.05 * (half - here) / Math.min(-1e-3, here - back); break; }
      }
      if (!(lit - dark > 30) || !(mids - dark > 30)) {
        if (strict) throw new Error(`beadround: the ${b.cells} cell bead's ray ${k} in the ${view} goes from ${dark.toFixed(0)} to ${lit.toFixed(0)} (middle ${mids.toFixed(0)}), no edge to read`);
        edge = NaN;
      }
      radii.push(edge); inner.push(ie);
    }
    if (radii.some((r) => !Number.isFinite(r)) || inner.some((r) => !Number.isFinite(r))) {
      if (strict) throw new Error(`beadround: the ${b.cells} cell bead in the ${view} has a ray with no crossing`);
      return { cells: b.cells, rad: b.rad, spread: Infinity, mean: NaN, inSpread: Infinity, inMean: NaN };
    }
    const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
    const inMean = inner.reduce((s, r) => s + r, 0) / inner.length;
    const inSpread = Math.max(...inner) - Math.min(...inner);
    return { cells: b.cells, rad: b.rad, spread: Math.max(...radii) - Math.min(...radii), mean, inSpread, inMean };
  };
  const plate = async (amount) => {
    await lab.create(N);
    lab.dyeDisc(0.5, 0.5, 0.45, [1.2, 0.3, 0.8], amount);
    lab.flush(); await lab.step(10);
  };
  // The beads: a field handed to the plate as the app hands it (the list, drawn on the GPU).
  await plate(1.3);
  const f = new lab.BeadField(N);
  for (const b of row) f.beads.push({ x: b.u * N, y: b.v * N, r: b.cells / 2, age: 5, seed: 0.5 });
  f.dirty = true;
  const beads = {};
  for (const [view, macroAmount] of [['projector', 0], ['closeup', 1]]) {
    const p = new Uint8ClampedArray(await lab.render(SIZE, { lampGround: 0, beads: 0.8, beadDrops: 0, bubbles: 0 }, { zoom: ZOOM, macroAmount, view: true, cx: 0.5, cy: 0.5, beadMask: f }));
    if (p.length !== SIZE * SIZE * 4) throw new Error(`beadround: a picture came back ${p.length} bytes`);
    beads[view] = row.map((b) => rimOf(p, b, view));
  }
  return { beads };
}, { N, SIZE, ZOOM, RAYS, BEADS, strict });

const plain = await openLab();
let now, then;
try { now = await measure(plain.page, true); } finally { await plain.close(); }
const control = await openLab({ plugins: [BEAD_CONTROL], tag: BEAD_CONTROL.name });
try {
  if (control.js === plain.js) throw new Error('beadround: the control built the same bundle as the plain lab (its edit matched nothing)');
  then = await measure(control.page, false);
} finally { await control.close(); }

const row = (r) => `${String(r.cells).padStart(3)} cells (${r.rad.toFixed(1)} px): rim spread ${r.spread.toFixed(2)} px, mean ${r.mean.toFixed(2)} px; band's inner edge spread ${r.inSpread.toFixed(2)} px, mean ${r.inMean.toFixed(2)} px`;
for (const [name, m] of [['the shader', now], ['the control (the beads\' picture)', then]]) {
  console.log(`   ${name}:`);
  for (const v of ['projector', 'closeup']) for (const r of m.beads[v]) console.log(`     ${v.padEnd(9)} ${row(r)}`);
}

const sp = (r) => r.spread;
const worst = (rs) => Math.max(...rs.map(sp));
const all = [...now.beads.projector, ...now.beads.closeup];
const off = (r) => Math.abs(r.mean - r.rad);
check(`the beads are round (worst spread ${worst(now.beads.projector).toFixed(2)} px in the projector, ${worst(now.beads.closeup).toFixed(2)} px in the closeup ≤ ${ROUND_PX})`, worst(all) <= ROUND_PX);
check(`at the laid radius (worst ${Math.max(...all.map(off)).toFixed(2)} px off ≤ ${PLACE_PX})`, Math.max(...all.map(off)) <= PLACE_PX);
const ctrlSeen = [...then.beads.projector, ...then.beads.closeup].filter((r) => r.cells <= 7);
check(`the control, the beads' picture, fails that bar on every bead up to 7 cells in both views (least spread ${Math.min(...ctrlSeen.map(sp)).toFixed(2)} px > ${ROUND_PX}; worst ${Math.max(...ctrlSeen.map(sp)).toFixed(2)} px > ${CONTROL_PX})`,
  ctrlSeen.length === 6 && ctrlSeen.every((r) => Number.isFinite(r.spread)) && Math.min(...ctrlSeen.map(sp)) > ROUND_PX && Math.max(...ctrlSeen.map(sp)) > CONTROL_PX);

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} FAIL` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
