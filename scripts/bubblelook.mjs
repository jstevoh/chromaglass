#!/usr/bin/env node
/**
 * A bubble on the plate is a hole in the light, not a donut.
 *
 *   npm run bubblelook      (the lab: any adapter that computes; in Measure's lab part)
 *
 * What was reported (2026-10-19): "They are also sometimes creating a donut
 * shape." Rendered in the lab, every bubble big enough to show its band was a
 * dark ring round a dim disc in the dye's own hue. The projected bubble's
 * middle (wgsl/plate.ts, the Bubbles block) was the dye's normalised hue
 * mixed in at 41 to 77 per cent of full strength, so on the dark ground it was
 * a dye-coloured disc inside a black band, on the lamp ground a tinted disc
 * over a white hole, and in clear water a grey one. All eight clarities did
 * it; the id's clarity only moved the brightness. "Sometimes" was size: a
 * small bubble is a dark disc round a pin-point, and one big enough to show
 * its band is the ring.
 *
 * A slab of air does not tint the light that crosses it: the middle is what
 * the plate would show there with no bubble, and the film on the glass
 * carries at most a tenth of the liquid's hue. So the middle is now the plate
 * under it, which on the dark ground is dark (a hole in the dye, its band
 * widening the hole) and on the lamp ground is the lamp, a bright window.
 *
 * Two labs draw the same plates: the shader as it is, and a control built
 * from it with the old middle put back (CONTROL below, an esbuild plugin that
 * must find its one line once, and a bundle that must differ from the plain
 * one). So every run shows the donut is still there to be found with the old
 * line, rather than a bar that no picture could miss. Asked on five bubbles
 * of 3 to 13 cells the lab lays out in one dye, the real solver cutting the
 * air as the app cuts it (bubbleClear 1), each picture against the same plate
 * with the bubbles' drawing at 0 (the two share a time and a dither):
 *
 *   1. the middle of each bubble, a disc of MID_FRAC of its radius, is the
 *      plate there to within a tenth of it (and DITHER levels for the dither
 *      and the film's own breath), on the dark ground and on the lamp ground
 *      (Lamp Ground 1). The control must be over that on every bubble on the
 *      dark ground, and on the lamp ground somewhere, so the bar is one the
 *      old picture failed
 *   2. the band is kept: on the lamp ground a bubble big enough to show it is
 *      less than BAND_DARK of the plate between 0.8 and 0.95 of its radius,
 *      and the share of the bubble's area that is dark falls as the bubble
 *      grows (a pin-point of a small bubble, a window in a big one)
 *   3. nothing else moved: with the bubbles' drawing at 0, and in the closeup
 *      (Macro 1, which draws the camera's bubble), the pictures are the same
 *      bytes as the control's, so the change is only the projector's middle
 *
 * Printed, not judged: each bubble's middle on both grounds, and the picture
 * of the dye ground with the old middle, for the record.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256, SIZE = 640, ZOOM = 1.5;
const CELLS = [3, 4.5, 7, 10, 13];
const MID_FRAC = 0.2, DITHER = 3, BAND_DARK = 0.5, BIG_PX = 50;

/*
  The control: the projected middle as it was, the dye's hue mixed in at
  0.25 + 0.55 clarity. Its one line must be found once; a refactor that
  renames it makes the control throw rather than quietly build the fixed
  shader twice.
*/
const NEW_LINE = 'cp = outColor * mix(vec3f(1.0), tint, 0.1 * k1);';
const OLD_LINE = 'cp = mix(lensCol, mix(tint, vec3f(1.0), 0.18) * (0.95 + 0.55 * ground), 0.25 + 0.55 * clarity);';
const CONTROL = {
  name: 'dye-middle',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]plate\.ts$/ }, async (a) => {
      const { readFileSync } = await import('node:fs');
      let s = readFileSync(a.path, 'utf8');
      const found = s.split(NEW_LINE).length - 1;
      if (found !== 1) throw new Error(`bubblelook: the control found ${found} of 1 "${NEW_LINE}" in wgsl/plate.ts`);
      return { contents: s.replace(NEW_LINE, OLD_LINE), loader: 'ts' };
    });
  },
};

const measure = (page) => page.evaluate(async ({ N, SIZE, ZOOM, CELLS, MID_FRAC, BAND_DARK }) => {
  const PER = SIZE * 1.5 * ZOOM; // pixels per plate uv at this zoom (the frame shows 1/1.5 of the plate)
  const pink = [1.2, 0.3, 0.8];
  // A row of bubbles across the middle, left to right, with a gap of GAP px.
  const GAP = 26;
  const rads = CELLS.map((c) => (c / N) * PER);
  const total = rads.reduce((s, r) => s + 2 * r, 0) + GAP * (CELLS.length - 1);
  let x0 = (SIZE - total) / 2;
  const bubs = CELLS.map((c, i) => {
    const cx = x0 + rads[i]; x0 += 2 * rads[i] + GAP;
    return { cells: c, rad: rads[i], px: cx, py: SIZE / 2, u: 0.5 + (cx - SIZE / 2) / PER, v: 0.5 };
  });
  if (total > SIZE - 20) throw new Error(`bubblelook: the row is ${Math.round(total)} px wide for a ${SIZE} px picture`);

  const hash = (p) => { let h = 2166136261; for (let i = 0; i < p.length; i++) { h ^= p[i]; h = Math.imul(h, 16777619); } return h >>> 0; };
  const lum = (p, k) => 0.299 * p[k] + 0.587 * p[k + 1] + 0.114 * p[k + 2];

  const scene = async (lampGround) => {
    await lab.create(N);
    lab.dyeDisc(0.5, 0.5, 0.33, pink, 1.3);
    lab.flush(); await lab.step(10);
    const list = bubs.flatMap((b) => [b.u, b.v, b.cells / N, 1]);
    // Phases spread so every bubble has its own id, hence its own clarity (k1).
    const fing = bubs.flatMap((_, i) => [0, 0, ((i + 0.5) / bubs.length) * Math.PI * 2 * 0.999, 0]);
    lab.solver().setBubbles(new Float32Array(list), bubs.length, 0.25, new Float32Array(fing));
    await lab.step(2, { bubbleClear: 1 });
    const view = { zoom: ZOOM, macroAmount: 0, view: true, cx: 0.5, cy: 0.5 };
    const grab = async (bubbles, macroAmount = 0) => {
      const p = new Uint8ClampedArray(await lab.render(SIZE, { lampGround }, { ...view, macroAmount, bubbles }));
      if (p.length !== SIZE * SIZE * 4) throw new Error(`bubblelook: a picture came back ${p.length} bytes, not ${SIZE * SIZE * 4}`);
      return p;
    };
    const on = await grab(0.8), off = await grab(0);
    const closeup = await grab(0.8, 1);
    const rows = bubs.map((b) => {
      // mid: mean per channel of |on - off| over the disc; ref: mean of off there.
      let n = 0; const d = [0, 0, 0], r = [0, 0, 0];
      let ringN = 0, ringOn = 0, ringOff = 0, dark = 0, area = 0;
      const R = b.rad;
      // The dye around the hole, bare of bubbles: 1.25 to 1.6 radii out. The
      // dark ground's "middle is the plate" is 0 against 0 on a plate that
      // has no dye at all, so the plate is shown to be lit round each bubble.
      let haloN = 0, halo = 0;
      for (let y = Math.floor(b.py - 1.6 * R); y <= Math.ceil(b.py + 1.6 * R); y++) for (let x = Math.floor(b.px - 1.6 * R); x <= Math.ceil(b.px + 1.6 * R); x++) {
        const rr = Math.hypot(x + 0.5 - b.px, y + 0.5 - b.py) / R;
        if (rr < 1.25 || rr > 1.6 || x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
        halo += lum(off, 4 * (x + y * SIZE)); haloN++;
      }
      for (let y = Math.floor(b.py - R); y <= Math.ceil(b.py + R); y++) for (let x = Math.floor(b.px - R); x <= Math.ceil(b.px + R); x++) {
        const rr = Math.hypot(x + 0.5 - b.px, y + 0.5 - b.py) / R;
        if (rr > 0.95 || x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
        const k = 4 * (x + y * SIZE);
        area++;
        if (lum(on, k) < BAND_DARK * lum(off, k)) dark++;
        if (rr <= MID_FRAC) { n++; for (let c = 0; c < 3; c++) { d[c] += Math.abs(on[k + c] - off[k + c]); r[c] += off[k + c]; } }
        if (rr >= 0.8) { ringN++; ringOn += lum(on, k); ringOff += lum(off, k); }
      }
      if (n < 0.6 * Math.PI * (MID_FRAC * R) ** 2 || n < 4) throw new Error(`bubblelook: the middle of the ${b.cells} cell bubble picked ${n} pixels`);
      const mid = d.map((v) => v / n), ref = r.map((v) => v / n);
      return { cells: b.cells, rad: R, mid, ref, halo: halo / Math.max(haloN, 1), ring: ringOn / Math.max(ringN, 1) / Math.max(ringOff / Math.max(ringN, 1), 1), darkShare: dark / area };
    });
    return { rows, offHash: hash(off), closeupHash: hash(closeup) };
  };
  return { dark: await scene(0), lamp: await scene(1) };
}, { N, SIZE, ZOOM, CELLS, MID_FRAC, BAND_DARK });

const plain = await openLab();
let now, then;
try { now = await measure(plain.page); } finally { await plain.close(); }
const control = await openLab({ plugins: [CONTROL], tag: 'dye-middle' });
try {
  if (control.js === plain.js) throw new Error('bubblelook: the control built the same bundle as the plain lab (its edit matched nothing)');
  then = await measure(control.page);
} finally { await control.close(); }

const f = (a) => a.map((v) => v.toFixed(0)).join(',');
for (const [name, r] of [['the shader', now], ['the control (the dye\'s hue in the middle)', then]]) {
  console.log(`   ${name}:`);
  for (const g of ['dark', 'lamp']) for (const b of r[g].rows) {
    console.log(`     ${g === 'dark' ? 'dark ground' : 'lamp ground'}, ${String(b.cells).padStart(4)} cells (${b.rad.toFixed(0)} px): the middle ${f(b.mid)} levels from the plate (${f(b.ref)}); dark share ${(100 * b.darkShare).toFixed(0)}%; rim at ${(100 * b.ring).toFixed(0)}% of the plate`);
  }
}

// The plates are what they say, before anything is judged on them: on the
// lamp ground the plate under a bubble is the lamp (bright), on the dark
// ground a hole cut in the dye is dark.
for (const r of [now, then]) {
  for (const b of r.lamp.rows) if (!(Math.min(...b.ref) > 150)) throw new Error(`bubblelook: the lamp ground under the ${b.cells} cell bubble is ${f(b.ref)}, not the lamp`);
  for (const b of r.dark.rows) if (!(b.halo > 80)) throw new Error(`bubblelook: the dye round the ${b.cells} cell bubble is ${b.halo.toFixed(0)} bright, so the plate is empty and a middle that is "the plate" proves nothing`);
  for (const b of r.dark.rows) if (!(Math.max(...b.ref) < 40)) throw new Error(`bubblelook: the hole the ${b.cells} cell bubble cuts is ${f(b.ref)}, not dark (the air missed the dye)`);
}

// 1. the middle is the plate.
const over = (b) => Math.max(...b.mid.map((m, c) => m - (0.1 * b.ref[c] + DITHER)));
for (const g of ['dark', 'lamp']) {
  const worst = Math.max(...now[g].rows.map(over));
  check(`the middle is the plate, ${g} ground (worst ${worst.toFixed(1)} levels past a tenth + ${DITHER} ≤ 0)`, worst <= 0);
}
const ctrlDark = then.dark.rows.map(over), ctrlLamp = then.lamp.rows.map(over);
check(`the control is the donut on every bubble, dark ground (least ${Math.min(...ctrlDark).toFixed(1)} levels over > 0)`, Math.min(...ctrlDark) > 0);
check(`and on the lamp ground somewhere (worst ${Math.max(...ctrlLamp).toFixed(1)} levels over > 0)`, Math.max(...ctrlLamp) > 0);

// 2. the band is kept; the dark share falls as the bubble grows.
const big = now.lamp.rows.filter((b) => b.rad >= BIG_PX);
check(`a big bubble keeps its band on the lamp ground (rim at ${big.map((b) => (100 * b.ring).toFixed(0)).join(', ')}% of the plate < ${100 * BAND_DARK}%; ${big.length} bubbles ≥ ${BIG_PX} px)`, big.length >= 2 && big.every((b) => b.ring < BAND_DARK));
const shares = now.lamp.rows.map((b) => b.darkShare);
check(`the dark share falls as the bubble grows (${shares.map((s) => (100 * s).toFixed(0)).join(', ')}%)`, shares.every((s, i) => i <= 1 || s <= shares[i - 1] + 0.03) && shares[0] - shares.at(-1) > 0.2);

// 3. nothing else moved.
for (const g of ['dark', 'lamp']) {
  check(`Bubbles at 0 is the control's picture to the byte, ${g} ground`, now[g].offHash === then[g].offHash);
  check(`and so is the closeup's bubble, ${g} ground`, now[g].closeupHash === then[g].closeupHash);
}

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} FAIL` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
