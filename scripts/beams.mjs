#!/usr/bin/env node
/**
 * Beams add, and the seam goes (PLAN.md §16c, docs/rig-plan.md R3).
 *
 *   npm run beams      (the lab: any adapter that computes, so a cloud session too)
 *
 * What was asked: "the default combination is additive, because that is what
 * light does. Two overlapping beams brighten, and the overlap is the
 * instrument", and then "a soft edge on each projector so the overlap region
 * does not read as a bright seam … two overlapping feathered edges sum to
 * one". Every surface was laid over what was under it by its opacity, so two
 * projectors' beams could only hide each other, never add.
 *
 * This runs the projector's own pass (gpu/output.ts) on pictures made to
 * order, each a ramp whose every pixel is known, so what a surface gives can
 * be read against the formula it should be:
 *
 *   1. over is the pass it always was, byte for byte: the same surfaces
 *      through a second lab built with the pass as it was before beams (the
 *      old return and the old blend state), at gains 1 to 3, at partial
 *      opacity, feathered, flipped, masked, sliced, over one another;
 *   2. beams of two sources add whole where they cross, each itself outside;
 *   3. two beams carrying one picture, tiled with an overlap, share it by how
 *      far inside each the point is: read with one tile at half, so the
 *      shares show in the light, and with unequal tiles, so a share by depth
 *      is not a plain crossfade; at full, the two are the picture across the
 *      overlap, where the same tiles as two sources are twice as bright (the
 *      seam the blend takes away);
 *   4. the same, stacked top and bottom on a top-to-bottom ramp, read down a
 *      column: the vertical is measured, and the picture is upright;
 *   5. two beams of one source showing different parts of it are two
 *      pictures, and add whole;
 *   6. with a feather, all four free edges fall off and the overlap stays
 *      whole;
 *   7. a beam at 0.5 adds half its light to what is under it, and at gain 2
 *      is clamped before it is scaled, as a surface laid over is.
 *
 * Every case says how many quads the pass drew, which must be the surfaces
 * set: with none, the pass falls back to one full-frame quad, which is the
 * whole picture and would pass a tiling check without a tile.
 *
 * The dither (up to a step each way) and the texture's filtering are the
 * tolerance: two steps of 255 for one beam, three where two add.
 */
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/*
  The pass as it was before beams, for check 1: every surface returned its
  colour and its coverage, and the pipeline blended by the source's alpha.
  Built from today's files with the beam's block taken out, so it is the
  same pass in every other line; loud if either piece is not where it was.
*/
const OLD_PASS = {
  name: 'old-pass',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]output\.ts$/ }, (args) => {
      const src = readFileSync(args.path, 'utf8');
      const block = /  \/\/ ── Over, or a beam \(§16c\)[\s\S]*?\n\}\n`;/;
      if (!block.test(src)) throw new Error('beams: the old-pass control could not find the beam block in wgsl/output.ts');
      return { contents: src.replace(block, '  return vec4f(col, sa * form.z);\n}\n`;'), loader: 'ts' };
    });
    b.onLoad({ filter: /src[\\/]gpu[\\/]output\.ts$/ }, (args) => {
      const src = readFileSync(args.path, 'utf8');
      // Both factors named, not only the one beams changed: a control that
      // took the alpha line from today's file would follow a change to it.
      const colour = "color: { srcFactor: 'one' as GPUBlendFactor";
      const alpha = /alpha: \{ srcFactor: '[a-z-]+' as GPUBlendFactor/;
      if (!src.includes(colour) || !alpha.test(src)) throw new Error('beams: the old-pass control could not find the blend state in output.ts');
      return {
        contents: src.replace(colour, "color: { srcFactor: 'src-alpha' as GPUBlendFactor").replace(alpha, "alpha: { srcFactor: 'src-alpha' as GPUBlendFactor"),
        loader: 'ts',
      };
    });
  },
};

const S = 128;
const quad = (x0, x1, extra = {}) => ({
  corners: [x0, 0, x1, 0, x1, 1, x0, 1], src: [0, 0, 1, 1], enabled: true, opacity: 1, feather: 0, source: 'wall', blend: 'over', ...extra,
});
const band = (y0, y1, extra = {}) => quad(0, 1, { corners: [0, y0, 1, y0, 1, y1, 0, y1], ...extra });
// No blanking feather unless a case asks: the only soft edge is the surface's own.
const cfg = (surfaces, extra = {}) => ({ surfaces, maskFeather: 0, ...extra });

const A = [0.1, 0.2, 0.3], B = [0.9, 0.8, 0.7];
const RAMP = [A, B];
const RAMP_Y = [A, B, 'y'];
const GREY = [[0.2, 0.2, 0.2], [0.2, 0.2, 0.2]];

// ── The cases ─────────────────────────────────────────────────────────
const OVER = [
  ['one at 0.6', cfg([quad(0, 1, { opacity: 0.6 })])],
  ['two at 0.5 over each other', cfg([quad(0, 1, { opacity: 0.5 }), quad(0, 1, { opacity: 0.5 })])],
  ['gain 3 at 0.5', cfg([quad(0, 1, { opacity: 0.5 })], { gain: 3 })],
  ['gain 2, a feathered circle at 0.8', cfg([quad(0.1, 0.9, { shape: 'ellipse', feather: 0.1, opacity: 0.8 })], { gain: 2 })],
  ['gain 1.3, a sliced diamond over the front plate, flipped and masked', cfg([
    quad(0, 1, { source: 'front' }),
    quad(0.15, 0.85, { shape: 'diamond', feather: 0.05, opacity: 0.7, src: [0.1, 0.2, 0.6, 0.5] }),
  ], { gain: 1.3, flipY: true, maskTop: 0.1, maskFeather: 0.05 })],
];
const pictures = { wall: RAMP, front: RAMP_Y };
const BEAMS = {
  twoSources: [cfg([quad(0, 0.6, { source: 'front', blend: 'add' }), quad(0.4, 1, { source: 'back', blend: 'add' })]),
    { front: [[0.3, 0.1, 0], [0.3, 0.1, 0]], back: [[0, 0.2, 0.4], [0, 0.2, 0.4]] }],
  whole: [cfg([quad(0, 1)]), { wall: RAMP }],
  // Unequal tiles, lined up: A 0..0.9 showing 0..0.9, B 0.3..1 showing
  // 0.3..1, so the depths' ratio is far from a straight crossfade.
  tilesHalf: [cfg([quad(0, 0.9, { src: [0, 0, 0.9, 1], blend: 'add' }), quad(0.3, 1, { src: [0.3, 0, 0.7, 1], blend: 'add', opacity: 0.5 })]), { wall: RAMP }],
  // Lined up, A 0..0.7 and B 0.4..1.
  tilesFull: [cfg([quad(0, 0.7, { src: [0, 0, 0.7, 1], blend: 'add' }), quad(0.4, 1, { src: [0.4, 0, 0.6, 1], blend: 'add' })]), { wall: RAMP }],
  tilesApart: [cfg([quad(0, 0.7, { src: [0, 0, 0.7, 1], source: 'front', blend: 'add' }), quad(0.4, 1, { src: [0.4, 0, 0.6, 1], source: 'back', blend: 'add' })]),
    { front: RAMP, back: RAMP }],
  // The same, stacked: top 0..0.7, bottom 0.4..1, on a top-to-bottom ramp.
  wholeY: [cfg([quad(0, 1)]), { wall: RAMP_Y }],
  stackHalf: [cfg([band(0, 0.7, { src: [0, 0, 1, 0.7], blend: 'add' }), band(0.4, 1, { src: [0, 0.4, 1, 0.6], blend: 'add', opacity: 0.5 })]), { wall: RAMP_Y }],
  // Two beams of the wall, the second showing the left of the picture too.
  crossing: [cfg([quad(0, 0.6, { src: [0, 0, 0.6, 1], blend: 'add' }), quad(0.4, 1, { src: [0, 0, 0.6, 1], blend: 'add' })]), { wall: RAMP }],
  tilesSoft: [cfg([quad(0, 0.7, { src: [0, 0, 0.7, 1], blend: 'add', feather: 0.1 }), quad(0.4, 1, { src: [0.4, 0, 0.6, 1], blend: 'add', feather: 0.1 })]), { wall: RAMP }],
  // A beam at half over a grey front plate laid over the whole frame.
  beamOver: [cfg([quad(0, 1, { source: 'front' }), quad(0, 1, { blend: 'add', opacity: 0.5 })]), { wall: RAMP, front: GREY }],
  beamGain: [cfg([quad(0, 1, { blend: 'add', opacity: 0.5 })], { gain: 2 }), { wall: RAMP }],
};

const run = async (lab, cases) => lab.page.evaluate(async ({ S, cases }) => {
  await lab.create(64);
  const out = {};
  for (const [name, [c, p]] of Object.entries(cases)) out[name] = await lab.projector(S, c, p);
  return out;
}, { S, cases });

const overCases = Object.fromEntries(OVER.map(([name, c]) => [name, [c, pictures]]));
const now = await openLab();
let shots, overNow;
try {
  shots = await run(now, BEAMS);
  overNow = await run(now, overCases);
} finally { await now.close(); }
const then = await openLab({ plugins: [OLD_PASS], tag: 'old-pass' });
let overThen;
try { overThen = await run(then, overCases); } finally { await then.close(); }

// ── Reading ───────────────────────────────────────────────────────────
const px = (img, x, y) => { const k = (y * S + x) * 4; return [img.pixels[k], img.pixels[k + 1], img.pixels[k + 2]]; };
const MID = S >> 1;
const rampAt = (u) => A.map((a, c) => (a + (B[c] - a) * Math.min(1, Math.max(0, u))) * 255);
const at = (i) => (i + 0.5) / S;
/** The worst channel off over pixels `pts` ([x, y]) between an image and the colour wanted at each. */
const worst = (img, pts, want) => {
  let w = 0;
  for (const [x, y] of pts) { const p = px(img, x, y), e = want(x, y); for (let c = 0; c < 3; c++) w = Math.max(w, Math.abs(p[c] - e[c])); }
  return Math.round(w * 10) / 10;
};
const span = (u0, u1) => { const out = []; for (let i = 0; i < S; i++) if (at(i) > u0 && at(i) < u1) out.push(i); return out; };
const row = (u0, u1, y = MID) => span(u0, u1).map(x => [x, y]);
const col = (v0, v1, x = MID) => span(v0, v1).map(y => [x, y]);
const quadsOk = (name, n) => shots[name].quads === n;
// The depth into a tile along one axis, where the other axis is half a unit in.
const depth = (u, lo, hi) => Math.min((u - lo) / (hi - lo), 1 - (u - lo) / (hi - lo));

// ── 1. Over, as it was ────────────────────────────────────────────────
{
  const rows = OVER.map(([name, c]) => {
    const a = overNow[name], b = overThen[name];
    let rgb = 0, alpha = 0;
    for (let i = 0; i < a.pixels.length; i++) {
      const d = Math.abs(a.pixels[i] - b.pixels[i]);
      if (i % 4 === 3) alpha = Math.max(alpha, d); else rgb = Math.max(rgb, d);
    }
    // Lit, so a black frame from both is not a match.
    let lit = 0;
    for (let i = 0; i < a.pixels.length; i += 4) lit += a.pixels[i];
    return { name, rgb, alpha, lit: lit / (a.pixels.length / 4), quads: a.quads === c.surfaces.length };
  });
  check('over is the pass it always was, byte for byte against it, at gains 1 to 3, feathered, flipped, masked, sliced, over one another',
    rows.every(r => r.rgb <= 1 && r.alpha <= 1 && r.lit > 10 && r.quads),
    rows.map(r => `${r.name}: ${r.rgb}${r.alpha ? `, alpha ${r.alpha}` : ''}${r.quads ? '' : ', wrong quads'}`).join(' · '));
}

// ── 2. Two sources ────────────────────────────────────────────────────
{
  const f = [0.3, 0.1, 0].map(v => v * 255), b = [0, 0.2, 0.4].map(v => v * 255);
  const img = shots.twoSources;
  const left = worst(img, row(0.03, 0.37), () => f), right = worst(img, row(0.63, 0.97), () => b);
  const cross = worst(img, row(0.43, 0.57), () => f.map((v, c) => v + b[c]));
  check('beams of two sources add whole where they cross, and each is itself outside it',
    left <= 2 && right <= 2 && cross <= 3 && quadsOk('twoSources', 2),
    `worst ${left} left, ${cross} crossing, ${right} right`);
}

// ── 3. One picture on two tiles ───────────────────────────────────────
{
  const whole = worst(shots.whole, row(0.01, 0.99), (x) => rampAt(at(x)));
  // A at 1, B at 0.5: the overlap is the picture times A's share plus half B's.
  const shared = (u) => { const dA = depth(u, 0, 0.9), dB = depth(u, 0.3, 1); return (dA + 0.5 * dB) / (dA + dB); };
  const want = (x) => { const u = at(x); return rampAt(u).map(v => v * (u < 0.3 ? 1 : u > 0.9 ? 0.5 : shared(u))); };
  const got = worst(shots.tilesHalf, row(0.01, 0.99), want);
  // Held apart from what else it could be: B laid over A, and a plain
  // crossfade across the overlap (12 apart at worst, by the arithmetic).
  const overIt = worst(shots.tilesHalf, row(0.35, 0.85), (x) => rampAt(at(x)));
  const fade = worst(shots.tilesHalf, row(0.35, 0.85), (x) => { const t = (at(x) - 0.3) / 0.6; return rampAt(at(x)).map(v => v * (1 - 0.5 * t)); });
  check('two tiles of one picture share the overlap by how far inside each the point is (one at half, so the shares show)',
    whole <= 2 && got <= 2 && overIt > 8 && fade > 8 && quadsOk('tilesHalf', 2),
    `worst ${got} of 255 against the shares (the whole picture itself ${whole} off the ramp); ${overIt} off B laid over A, ${fade} off a plain crossfade`);
  const flat = worst(shots.tilesFull, row(0.01, 0.99), (x) => px(shots.whole, x, MID));
  const seam = row(0.45, 0.65).reduce((s, [x]) => s + px(shots.tilesApart, x, MID)[0] - px(shots.whole, x, MID)[0], 0) / row(0.45, 0.65).length;
  check('and at full the two are the picture across the overlap, where as two sources they are twice as bright there',
    flat <= 2 && seam > 40 && quadsOk('tilesFull', 2) && quadsOk('tilesApart', 2),
    `worst ${flat} of 255 against the picture on one surface; as two sources ${seam.toFixed(1)} brighter`);
}

// ── 4. Stacked ────────────────────────────────────────────────────────
{
  const upright = worst(shots.wholeY, col(0.01, 0.99), (x, y) => rampAt(at(y)));
  const shared = (v) => { const dA = depth(v, 0, 0.7), dB = depth(v, 0.4, 1); return (dA + 0.5 * dB) / (dA + dB); };
  const got = worst(shots.stackHalf, col(0.01, 0.99), (x, y) => { const v = at(y); return rampAt(v).map(c => c * (v < 0.4 ? 1 : v > 0.7 ? 0.5 : shared(v))); });
  check('stacked top and bottom, the same shares down a column, and the picture upright',
    upright <= 2 && got <= 2 && quadsOk('stackHalf', 2), `worst ${got} of 255 against the shares; the whole picture ${upright} off the ramp read top down`);
}

// ── 5. One source, two parts of it ────────────────────────────────────
{
  // A shows 0..0.6 across 0..0.6; B shows 0..0.6 across 0.4..1.
  const got = worst(shots.crossing, row(0.43, 0.57), (x) => { const u = at(x); return rampAt(u).map((v, c) => Math.min(255, v + rampAt((u - 0.4))[c])); });
  check('two beams of one source showing different parts of it add whole where they cross',
    got <= 3 && quadsOk('crossing', 2), `worst ${got} of 255 against the sum`);
}

// ── 6. Feathered ──────────────────────────────────────────────────────
{
  const inside = worst(shots.tilesSoft, row(0.1, 0.9), (x) => px(shots.whole, x, MID));
  // Each free edge a pixel in, against the unfeathered picture there: the
  // left and right in the middle row, the top and bottom in a column of
  // each tile clear of the overlap.
  const edges = [['left', 1, MID], ['right', S - 2, MID], ['top', span(0.2, 0.21)[0], 1], ['bottom', span(0.8, 0.81)[0], S - 2]]
    .map(([name, x, y]) => [name, px(shots.tilesSoft, x, y)[2], px(shots.whole, x, y)[2]]);
  check('feathered, all four free edges fall off and the overlap stays whole',
    inside <= 2 && edges.every(([, e, full]) => e < full * 0.5) && quadsOk('tilesSoft', 2),
    `worst ${inside} of 255 inside; ${edges.map(([n, e, full]) => `${n} ${e} of ${full}`).join(', ')}`);
}

// ── 7. A beam over what is under it ───────────────────────────────────
{
  const over = worst(shots.beamOver, row(0.01, 0.99), (x) => rampAt(at(x)).map(v => 51 + v * 0.5));
  const gain = worst(shots.beamGain, row(0.01, 0.99), (x) => rampAt(at(x)).map(v => Math.min(255, v * 2) * 0.5));
  check('a beam at 0.5 adds half its light to what is under it, and at gain 2 is clamped before it is scaled',
    over <= 2 && gain <= 2 && quadsOk('beamOver', 2) && quadsOk('beamGain', 1), `worst ${over} and ${gain} of 255`);
}

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
