#!/usr/bin/env node
/**
 * Dark field and Rheinberg light (PLAN 47b): `npm run darkfield`.
 *
 * What was asked (the owner, 2026-11-28): three macro films of soap foam, a
 * dyed bubble and his rig, with "our bubbles still suck" and "his colours are
 * also awesome". What the films share is their light: a lamp the lens cannot
 * see, so level liquid and air are black and only light the liquid bends
 * reaches the camera, coloured by the ring of filters it came through. The
 * optics are in gpu/wgsl/plateDarkField.ts, the gels in lib/darkField.ts.
 * This holds the feature, not a moment of the plate:
 *
 *   A. The laws, in numbers (node). Level liquid catches none of the ring.
 *      No bend makes light: a zone's share never passes the aperture's whole
 *      area at the exposure. Bent past RING_OUT + 1 the whole ring misses. A
 *      gentle bend reaches the inner zone before the outer. A gel at 0 is
 *      clear and at 1 its own hue, never above 1 in any channel.
 *
 *   B. Off is off (the lab, the real shaders). Dark Field 0 is the plate to
 *      the byte with Ring Colour and both hues moved, on the foam and on a
 *      bubble, and to the byte the plate a control build draws with the two
 *      call sites as they were before (BEFORE below); Dark Field 1 moves it.
 *
 *   C. The foam turns inside out. Foam Cells laid as the app lays it: under
 *      Dark Field 1 the cells' middles (bright in bright field) are black, the
 *      brightest pixels are lit, and nine in ten of the lit pixels sit on an
 *      edge of the bright-field picture (a film, a rim, a corner): the light is
 *      where the liquid bends it, not anywhere else.
 *
 *   D. A bubble's wall is a two-colour ring. One big bubble in nearly clear
 *      water, read along 48 rays: its middle is black, its wall lit, and the
 *      inner gel's colour peaks nearer the middle than the outer's (the gentle
 *      part of the meniscus bends less). Swap the two hues and the order swaps,
 *      so the colour is the ring's and not the dye's. Not held here: that the
 *      outline itself is dark (past the critical angle the wall turns the light
 *      back into the water). A line for it passed with the outline lit by a
 *      broken shader (the check-skeptic's, 2026-11-28): the lit band is under a
 *      pixel at this size. PLAN 47b-10 owes it, at a zoom where the band is
 *      several pixels wide.
 */
import { openLab } from './lab.mjs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

// ── A. The laws ────────────────────────────────────────────────────
const lawsOut = 'node_modules/.cache/darkfield-laws.mjs';
await build({
  stdin: { contents: "export * from './src/gpu/wgsl/plateDarkField.ts'; export { pupilPass, BULB_FILL } from './src/gpu/wgsl/lampField.ts'; export * from './src/lib/darkField.ts';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: lawsOut, logLevel: 'warning',
});
const L = await import(pathToFileURL(`${process.cwd()}/${lawsOut}`).href);
{
  const inner = (d) => L.ringShare(d, L.RING_IN, L.RING_MID, L.pupilPass);
  const outer = (d) => L.ringShare(d, L.RING_MID, L.RING_OUT, L.pupilPass);
  check('level liquid catches none of the ring', inner(0) === 0 && outer(0) === 0 && inner(1e-4) === 0);
  const cap = L.DARK_EXPOSURE / (L.BULB_FILL * L.BULB_FILL);
  let worst = 0;
  for (let d = 0; d <= 5; d += 0.01) worst = Math.max(worst, inner(d) + outer(d));
  check('no bend makes light: the ring caught is at most the aperture, at the exposure', worst <= cap + 1e-9 && worst > 0.2 * cap, `peak ${worst.toFixed(3)} of ${cap.toFixed(3)}`);
  check('bent past the ring\'s outer edge plus the aperture, the whole ring misses', inner(L.RING_OUT + 1.01) === 0 && outer(L.RING_OUT + 1.01) === 0);
  const g = (L.RING_IN - 1 + L.RING_MID - 1) / 2;
  check('a gentle bend reaches the inner zone before the outer', inner(g) > 0.01 && outer(g) === 0, `at ${g.toFixed(2)}: inner ${inner(g).toFixed(3)}, outer ${outer(g).toFixed(3)}`);
  const clear = L.ringGel(330, 0), pink = L.ringGel(330, 1), blue = L.ringGel(205, 1);
  check('a gel at 0 is clear, at 1 its own hue, never above 1', clear.every((v) => Math.abs(v - 1) < 1e-9)
    && pink[0] === Math.max(...pink) && pink[1] === Math.min(...pink) && blue[2] === Math.max(...blue) && blue[0] === Math.min(...blue)
    && [...pink, ...blue].every((v) => v >= 0 && v <= 1 + 1e-9), `pink ${pink.map((v) => v.toFixed(2))}, blue ${blue.map((v) => v.toFixed(2))}`);
}

// ── B-D. The real shaders ─────────────────────────────────────────
/*
  The control: the plate as it was before Dark Field, its two call sites put
  back (the old pupil loss alone, and the bubble's wall untouched). Dark Field
  0 must draw both scenes to the byte as this does.
*/
const BEFORE = {
  name: 'before-dark-field',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]plateDarkField\.ts$/ }, async (a) => {
      const { readFileSync } = await import('node:fs');
      let src = readFileSync(a.path, 'utf8');
      const swaps = [
        ['  return mix(fieldLight(keep, select(0.0, oplTheta(near.z, near.xy, normal) / DROP_NA, plateOn)), vec3f(1.0), cover);', '  return vec3f(mix(keep, 1.0, cover));'],
        ['  if (U.darkField <= 0.001) { return cp; }', '  return cp;'],
      ];
      for (const [from, to] of swaps) {
        if (src.split(from).length !== 2) throw new Error(`darkfield: the control found ${src.split(from).length - 1} of 1 "${from.trim()}"`);
        src = src.replace(from, to);
      }
      return { contents: src, loader: 'ts' };
    });
  },
};
const scene = async ({ full }) => {
    const SIZE = 480;
    const lumOf = (p) => { const l = new Float32Array(SIZE * SIZE); for (let i = 0; i < l.length; i++) l[i] = 0.299 * p[4 * i] + 0.587 * p[4 * i + 1] + 0.114 * p[4 * i + 2]; return l; };
    const plain = { zoom: 1, macroAmount: 0, cx: 0.5, cy: 0.5, bubbles: 0 };
    // Foam Cells, laid as the app lays it (scripts/foam.mjs), 2 s on.
    const N = 256;
    await lab.create(N, N);
    const { settings: s, dyes } = lab.look('foam-cells');
    const over = { thinGap: 1, advection: s.advection, plateCurve: s.plateCurve, depthDrag: s.depthDrag,
      platePressure: s.platePressure, oilTension: s.oilTension, oilBodies: s.oilBodies, diff: s.diffusionRate, filmHold: s.filmHold };
    const seeds = lab.foamSeeds(7, dyes.length, N);
    lab.solver().layOil((x, y, n) => lab.foamCell(x, y, n, seeds).oil);
    const ab = (c) => [c.r, c.g, c.b].map((v) => -Math.log(Math.max(0.002, v)));
    const d = new Array(N * N * 4).fill(0);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const cell = lab.foamCell((i + 0.5) / N, (j + 0.5) / N, N, seeds), k = (i + j * N) * 4;
      const put = (amt, a) => { for (let ch = 0; ch < 3; ch++) d[k + ch] += amt * a[ch]; d[k + 3] += amt; };
      if (cell.oil < 1) put(lab.foamWash * (1 - cell.oil), ab(dyes[0]));
      if (cell.cell >= 0) put(lab.foamCellDye * cell.oil, ab(dyes[seeds[cell.cell].dye]));
    }
    lab.addDye(d); lab.flush();
    await lab.step(1, over, true); await lab.step(119, over);
    const r = async (extra) => new Uint8ClampedArray(await lab.render(SIZE, { ...s, ...extra }, plain));
    const hash = (p) => { let h = 2166136261; for (let i = 0; i < p.length; i++) h = Math.imul(h ^ p[i], 16777619) >>> 0; return h; };
    const off = await r({ darkField: 0 });
    const hashes = [hash(off)];
    const offMoved = await r({ darkField: 0, rheinberg: 1, rheinbergInner: 90, rheinbergOuter: 270 });
    const on = await r({ darkField: 1, rheinberg: 0 });
    let same = true, moved = 0;
    for (let i = 0; i < off.length; i++) { if (off[i] !== offMoved[i]) same = false; if (Math.abs(off[i] - on[i]) > 8) moved++; }
    // C: middles and edges, from the bright-field picture.
    const bf = lumOf(off), df = lumOf(on);
    const grad = new Float32Array(SIZE * SIZE);
    for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) {
      const k = x + y * SIZE;
      grad[k] = Math.hypot(bf[k + 1] - bf[k - 1], bf[k + SIZE] - bf[k - SIZE]) / 2;
    }
    const nearEdge = (x, y) => { for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const xx = x + i, yy = y + j; if (xx > 0 && yy > 0 && xx < SIZE - 1 && yy < SIZE - 1 && grad[xx + yy * SIZE] > 6) return true; } return false; };
    let midSum = 0, midN = 0, lit = 0, litOnEdge = 0;
    const sorted = Array.from(df).sort((a, b) => a - b);
    for (let y = 4; y < SIZE - 4; y++) for (let x = 4; x < SIZE - 4; x++) {
      const k = x + y * SIZE;
      if (bf[k] > 120 && !nearEdge(x, y)) { midSum += df[k]; midN++; }
      if (df[k] > 40) { lit++; if (nearEdge(x, y)) litOnEdge++; }
    }
    // D: one big bubble in nearly clear water.
    await lab.create(N);
    lab.dyeDisc(0.5, 0.5, 0.45, [1.2, 0.3, 0.8], 0.05);
    lab.flush(); await lab.step(10);
    const cells = 24, PER = SIZE * 1.5, R = cells / N * PER;
    lab.solver().setBubbles(new Float32Array([0.5, 0.5, cells / N, 1]), 1, 0.25, new Float32Array([0, 0, 0.5, 0.5]));
    await lab.step(2, { bubbleClear: 1 });
    const cam = { ...plain, view: true, bubbles: 0.8 };
    const bub = async (extra) => new Uint8ClampedArray(await lab.render(SIZE, { lampGround: 1, darkField: 1, rheinberg: 1, ...extra }, cam));
    const read = (p) => {
      const px = (x, y, c) => { const i = Math.min(SIZE - 1, Math.max(0, Math.round(x))), j = Math.min(SIZE - 1, Math.max(0, Math.round(y))); return p[4 * (i + j * SIZE) + c]; };
      const rays = [];
      for (let k = 0; k < 48; k++) {
        const t = (k + 0.5) / 48 * Math.PI * 2, dx = Math.cos(t), dy = Math.sin(t);
        let mid = 0, midN = 0, peak = 0, peakAt = 0, warmAt = 0, warmV = -1e9, coolAt = 0, coolV = -1e9;
        for (let rr = 0.2 * R; rr <= 1.15 * R; rr += 0.25) {
          const x = SIZE / 2 + dx * rr, y = SIZE / 2 + dy * rr;
          const cr = px(x, y, 0), cg = px(x, y, 1), cb = px(x, y, 2), l = 0.299 * cr + 0.587 * cg + 0.114 * cb;
          if (rr < 0.55 * R) { mid += l; midN++; }
          if (l > peak) { peak = l; peakAt = rr; }
          if (cr - cb > warmV && l > 10) { warmV = cr - cb; warmAt = rr; }
          if (cb - cr > coolV && l > 10) { coolV = cb - cr; coolAt = rr; }
        }
        rays.push({ mid: mid / midN, peak, peakAt, warmAt, coolAt });
      }
      return rays;
    };
    const bfPic = await bub({ darkField: 0 });
    const bfMoved = await bub({ darkField: 0, rheinberg: 0, rheinbergInner: 90, rheinbergOuter: 270 });
    hashes.push(hash(bfPic));
    const bubSame = hash(bfMoved) === hash(bfPic);
    if (!full) return { hashes };
    const brightField = read(bfPic);
    const pinkIn = read(await bub({ rheinbergInner: 330, rheinbergOuter: 205 }));
    const blueIn = read(await bub({ rheinbergInner: 205, rheinbergOuter: 330 }));
    return { hashes, bubSame, same, moved, total: off.length, mid: midSum / Math.max(midN, 1), midN, top: sorted[Math.floor(sorted.length * 0.98)], lit, litOnEdge, pinkIn, blueIn, brightField, R };
};
const { page, close } = await openLab();
let out;
try {
  out = await page.evaluate(scene, { full: true });
} finally {
  await close();
}
const ctl = await openLab({ plugins: [BEFORE], tag: 'before-dark-field' });
let before;
try {
  before = await ctl.page.evaluate(scene, { full: false });
} finally {
  await ctl.close();
}
{
  check('Dark Field 0 is the plate to the byte with Ring Colour and both hues moved, foam and bubble alike', out.same && out.bubSame);
  check('and to the byte the plate before Dark Field was built, foam and bubble alike', out.hashes[0] === before.hashes[0] && out.hashes[1] === before.hashes[1],
    `now ${out.hashes.map((h) => h.toString(16))}, before ${before.hashes.map((h) => h.toString(16))}`);
  check('Dark Field 1 moves the picture', out.moved > out.total * 0.05, `${(100 * out.moved / out.total).toFixed(1)}% of channels moved`);
  check("the foam's cell middles go black", out.midN > 2000 && out.mid < 3, `mean ${out.mid.toFixed(2)} levels over ${out.midN} middle pixels`);
  check('its films are lit, and the light is on the edges', out.top >= 40 && out.litOnEdge >= 0.9 * out.lit && out.lit > 500,
    `98th percentile ${out.top.toFixed(0)}; ${out.litOnEdge} of ${out.lit} lit pixels on an edge of the bright-field picture`);
  const share = (rays, f) => rays.filter(f).length / rays.length;
  const midMax = Math.max(...out.pinkIn.map((r) => r.mid));
  check("a bubble's middle is black in dark field and lit in bright field", midMax < 3 && Math.min(...out.brightField.map((r) => r.mid)) > 60,
    `dark field middle at most ${midMax.toFixed(1)}; bright field at least ${Math.min(...out.brightField.map((r) => r.mid)).toFixed(0)}`);
  const peaks = out.pinkIn.map((r) => r.peak).sort((a, b) => a - b);
  check('its wall is lit', peaks[Math.floor(peaks.length / 2)] > 40, `median ring peak ${peaks[Math.floor(peaks.length / 2)].toFixed(0)}`);
  const order = share(out.pinkIn, (r) => r.warmAt < r.coolAt), swapped = share(out.blueIn, (r) => r.coolAt < r.warmAt);
  check('the inner gel peaks nearer the middle, and swapping the hues swaps the order', order >= 0.8 && swapped >= 0.8,
    `pink inside on ${(100 * order).toFixed(0)}% of rays; swapped, blue inside on ${(100 * swapped).toFixed(0)}%`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
