#!/usr/bin/env node
/**
 * Thin Film's rings are round, not polygons on the grid (PLAN 1i).
 *
 *   npm run filmrings      (the lab: any adapter that computes, scripts/lab.mjs)
 *
 * What was reported. On 38m's pictures of the Soap Film look the owner said
 * "the edges are super pixelated" (2026-10-30): every thin-film ring round a
 * thin dye edge turned a corner each grid cell. A ring is a contour of the
 * film's amount at sixteen periods per unit (and three times that again on
 * the gooey edge's contrast), so any corner in how the amount is read shows
 * sixteen-fold. The amount was read the way the dye is: with the gooey blur
 * on (every look), a few plain bilinear taps a fraction of a cell apart,
 * whose slope jumps at every texel; without it, a five-tap Catmull-Rom,
 * whose curvature does. The fix reads the film's amount through a cubic
 * B-spline, which is C2 (plateThinFilm.ts).
 *
 * What this asks, and why the film and not the picture. A picture's
 * colours ring every few pixels whatever the read, so a corner in the
 * rings' phase is lost in the rings' own curvature (measured: the
 * second differences of the picture's luminance, folded by where each pixel
 * sits between texels, were within 13 % of even before the fix and after
 * it). So the lab is built twice on altered sources that write the film's
 * amount itself out of the display pass, sixteen bits a pixel, wherever
 * Thin Film draws: one as shipped, one with the smooth read turned off (the
 * read the plate had before). Then, on the same plate at zoom 1.3 and 3:
 *
 * - Its second difference, along each axis on its own, folded into eight
 *   bins by where each pixel sits in its cell. A read with a slope jump puts
 *   a spike in the bin the jump is in (the texel centres, the knots of every
 *   read here); a C2 read leaves the bins even. Shipped, no bin stands more
 *   than half again over the median; the old read must peak on the knots at
 *   twice it, on both axes, so the probe is seen to be able to fail.
 * - That the smooth read is still the film: as many pixels in the rings'
 *   window, and at the 95th percentile the amount moved by less than a third
 *   of a ring (a read that blurred the film over cells would round the
 *   rings too, by moving them).
 *
 * Both default settings and the Soap Film look's (its own Gooey and Post
 * Blur, the gooey contrast that steepens the rings).
 */
import { openLab } from './lab.mjs';
import { readFileSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const S = 640, N = 192;

/*
  The probe. plate.ts: a private film value, -1 until Thin Film draws, and
  the display pass's output replaced by it where set (16 bits in red and
  green, blue 255 as the mark). plateThinFilm.ts: the film value recorded
  where the rings are drawn, and for the control the smooth read's gate
  shut. Every edit is asserted, so a rename fails here loudly rather than
  leaving a lab that measures nothing.
*/
const probe = (smooth) => ({
  name: `filmrings-${smooth ? 'smooth' : 'old'}`,
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]plate\.ts$/ }, (args) => {
      let src = readFileSync(args.path, 'utf8');
      const out = 'var result: FsOut;';
      const fs = '@fragment fn fs(in: VsOut) -> FsOut';
      if (!src.includes(out) || !src.includes(fs)) throw new Error('filmrings: the display pass\'s output could not be found in plate.ts');
      src = src.replace(out, `${out}
  if (probeFilm >= 0.0) {
    let q = floor(clamp(probeFilm * 2.5, 0.0, 1.0) * 65535.0);
    result.color = vec4f(floor(q / 256.0) / 255.0, (q - floor(q / 256.0) * 256.0) / 255.0, 1.0, 1.0);
    result.aux = vec4f(0.0);
    return result;
  }
  result.color = vec4f(0.0, 0.0, 0.0, 1.0);
  result.aux = vec4f(0.0);
  return result;`);
      src = src.replace(fs, `var<private> probeFilm: f32 = -1.0;\n${fs}`);
      return { contents: src, loader: 'ts' };
    });
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]plateThinFilm\.ts$/ }, (args) => {
      let src = readFileSync(args.path, 'utf8');
      const thin = /let thin = smoothstep\(0\.4, 0\.04, film\)[^;]*;/;
      if (!thin.test(src)) throw new Error('filmrings: the rings\' film could not be found in plateThinFilm.ts');
      src = src.replace(thin, (m) => `${m}\n  probeFilm = film;`);
      if (!smooth) {
        const gate = 'if (dof < 0.02 && (';
        if (!src.includes(gate)) throw new Error('filmrings: the smooth read\'s gate could not be found in plateThinFilm.ts');
        src = src.replace(gate, 'if (false && (');
      }
      return { contents: src, loader: 'ts' };
    });
  },
});

const SHOTS = [['zoom 1.3', { zoom: 1.3, cx: 0.5, cy: 0.5 }], ['zoom 3', { zoom: 3, cx: 0.42, cy: 0.42 }]];
const LOOKS = ['', 'soap-film', 'wide'];
/*
  'wide': Gooey × Post Blur high enough that the blur's taps sit more than half
  a cell apart (0.9 × 0.6 here: 1.1 cells on this plate), where blurAlpha
  takes its wide, twenty-five tap form and the smooth read stands aside (it
  is the look's choice to melt the edge over cells). Measured, not asserted
  smooth: the control's ratio says whether that form faceted at all.
*/
const SETS = { '': {}, wide: { gooeyEffect: 0.9, postBlurRadius: 0.6 } };

/* One lab: filmlook's plate of thin dye (amounts where Thin Film draws), every shot of every look. */
async function films(smooth) {
  const { page, close } = await openLab({ plugins: [probe(smooth)], tag: `filmrings-${smooth ? 'smooth' : 'old'}` });
  const r = await page.evaluate(async ({ SHOTS, LOOKS, SETS, S, N }) => {
    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    await lab.create(N);
    const pal = [[0.2, 1.0, 1.0], [1.0, 1.0, 0.2], [1.0, 0.2, 1.0]];
    for (let i = 0; i < 40; i++) lab.dye(0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7, 0.03 + rnd() * 0.06, pal[i % 3], 0.05 + rnd() * 0.25);
    lab.flush(); await lab.step(30);
    // Base64, not an array of numbers: Playwright's serialiser builds each number as a string.
    const b64 = (px) => { let s = ''; for (let i = 0; i < px.length; i += 8192) s += String.fromCharCode(...px.subarray(i, i + 8192)); return btoa(s); };
    const out = {};
    for (const look of LOOKS) {
      const set = SETS[look] ?? lab.look(look).settings;
      for (const [name, cam] of SHOTS) {
        const px = await lab.render(S, { ...set, thinFilm: 1 }, { macroAmount: 0, view: true, bubbles: 0, time: 1, ...cam });
        out[`${look || 'defaults'}, ${name}`] = b64(new Uint8Array(px.buffer ?? px));
      }
    }
    return out;
  }, { SHOTS, LOOKS, SETS, S, N });
  await close();
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Buffer.from(v, 'base64')]));
}

/*
  The film from a probe's picture, and its second differences by where each
  pixel sits in its cell. A pixel's place is the plate's own mapping
  (uvToFluid: the picture's square over 1.5 × zoom of the plate, centred on
  cx, cy), with the display pass's flip: framebuffer row y is uv.y = 1 -
  (y + 0.5) / S (FLIP_Y in plate.ts's vertex stage). A read's knots are where
  fuv × N - 0.5 is whole. Each axis is folded on its own, into eight bins of
  the cell, so a corner on one axis cannot hide in the other's average, and a
  corner anywhere in the cell (a read half a texel out, a tap pattern at half
  a cell) shows as a bin above the rest, not only one on the centres.
*/
const BINS = 8;
/*
  w: the film is averaged over 2w + 1 pixels along the knot line before it is
  differenced across it. A texel's corner runs the whole length of its knot
  line, so this keeps it whole and averages away what does not line up: on
  the owner's Mac (Metal) the old read's knot bin came to only 1.5 to 2.1
  times the median at w = 0, against 2.7 to 13 here, with the shipped read's
  bins as even as here (1.06 to 1.22), which is what pixel-to-pixel noise in
  the film does to a ratio over the median. h: the stencil's half-width.
*/
const W = 2, H = 1;
function measure(buf, cam, w = W, h = H) {
  const F = new Float64Array(S * S).fill(NaN);
  for (let i = 0; i < S * S; i++) if (buf[i * 4 + 2] === 255) F[i] = (buf[i * 4] * 256 + buf[i * 4 + 1]) / 65535 / 2.5;
  const phase = (u, c) => { const p = ((u - 0.5) / (1.5 * cam.zoom) + c) * N - 0.5; return p - Math.floor(p); };
  const axes = [0, 1].map(() => ({ sum: new Float64Array(BINS), n: new Float64Array(BINS) }));
  let pairs = 0;
  const m = Math.max(w, h);
  for (let y = m; y < S - m; y++) for (let x = m; x < S - m; x++) {
    for (const ax of [0, 1]) {
      const at = (k) => {
        let v = 0;
        for (let j = -w; j <= w; j++) v += F[ax ? (y + k) * S + x + j : (y + j) * S + x + k];
        return v / (2 * w + 1);
      };
      const a = at(-h), b = at(0), c = at(h);
      if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) continue;
      const f = ax ? phase(1 - (y + 0.5) / S, cam.cy) : phase((x + 0.5) / S, cam.cx);
      // bin 0 is centred on the knot
      const bin = Math.floor((f + 0.5 / BINS) * BINS) % BINS;
      axes[ax].sum[bin] += Math.abs(c - 2 * b + a); axes[ax].n[bin]++;
      pairs++;
    }
  }
  const fold = axes.map(({ sum, n }) => {
    const mean = Array.from(sum, (v, i) => v / n[i]);
    const med = [...mean].sort((p, q) => p - q)[BINS / 2];
    return { m: mean, med, knot: mean[0] / med, peak: Math.max(...mean) / med, peakAt: mean.indexOf(Math.max(...mean)) };
  });
  return { F, pairs, fold };
}

const old = await films(false);
const smooth = await films(true);
const inRings = (v) => v > 0.004 && v < 0.4;
for (const key of Object.keys(smooth)) {
  const cam = SHOTS.find(([n]) => key.endsWith(n))[1];
  const a = measure(old[key], cam), b = measure(smooth[key], cam);
  const show = (r) => r.fold.map((f, i) => `${'xy'[i]} ${f.knot.toFixed(2)}`).join(', ');
  if (process.argv.includes('--sweep')) {
    // For a new adapter: what each form of the fold reads, and the control's whole profile.
    for (const [w, h] of [[0, 1], [2, 1], [4, 1], [8, 1], [2, 2]]) {
      const p = measure(old[key], cam, w, h), q = measure(smooth[key], cam, w, h);
      console.log(`      sweep ${key} w${w} h${h}: old knot ${p.fold.map(f => f.knot.toFixed(2)).join('/')}, shipped peak ${q.fold.map(f => f.peak.toFixed(2)).join('/')}`);
    }
    const p = measure(old[key], cam, 0, 1), q = measure(smooth[key], cam, 0, 1);
    console.log(`      sweep ${key} w0 h1 bins x old ${p.fold[0].m.map(v => (v * 1e5).toFixed(1)).join(' ')} | shipped ${q.fold[0].m.map(v => (v * 1e5).toFixed(1)).join(' ')} (1e-5)`);
  }
  check(`${key}: the probe reads a film`, a.pairs > 20000 && b.pairs > 20000, `${b.pairs} pixel pairs shipped, ${a.pairs} with the old read`);
  if (key.startsWith('wide')) {
    // The wide blur is left as it was: what it does is printed, for the PLAN.
    console.log(`      ${key}: the wide blur, left as it was: second difference on the knots over the cell's median ${show(a)} (old), ${show(b)} (shipped)`);
    continue;
  }
  check(`${key}: the old read turns a corner at every texel on both axes (the probe can fail)`,
    a.fold.every(f => f.knot > 2 && f.peakAt === 0), `on the knots over the cell's median: ${show(a)}`);
  check(`${key}: the rings' film has no corner anywhere in the cell`,
    b.fold.every(f => f.peak < 1.5), `the highest of eight bins over the median: ${b.fold.map((f, i) => `${'xy'[i]} ${f.peak.toFixed(2)}`).join(', ')} (on the knots ${show(b)}; the old read's ${show(a)})`);
  let drawnA = 0, drawnB = 0; const diffs = [];
  for (let i = 0; i < S * S; i++) {
    if (inRings(a.F[i])) drawnA++;
    if (inRings(b.F[i])) drawnB++;
    if (!Number.isNaN(a.F[i]) && !Number.isNaN(b.F[i]) && (inRings(a.F[i]) || inRings(b.F[i]))) diffs.push(Math.abs(a.F[i] - b.F[i]));
  }
  diffs.sort((p, q) => p - q);
  const p95 = diffs[Math.floor(diffs.length * 0.95)];
  /*
    A ring is 1/16 of the film (0.0625). The B-spline is itself a light blur
    (about half a cell), so on a steep rim it moves the film: measured 0.007
    to 0.017 at the 95th percentile, a ninth to a quarter of a ring. A read
    blurred one cell further (the B-spline averaged over a cross of five
    taps a cell apart, which this was run against as a mutation, and whose
    rings have no corner either) moved it 0.033 to 0.050, a half to most of
    a ring, and lost 3 to 7 % of the rings' pixels. So the bar is a third of
    a ring, between the two.
  */
  check(`${key}: it is the same film, read smooth`, Math.abs(drawnA - drawnB) < 0.025 * drawnA && p95 < 0.0625 / 3,
    `${drawnB} pixels in the rings' window (${drawnA} with the old read), 95th percentile of the change ${p95.toFixed(4)} (a ring is 0.0625)`);
}
const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} filmrings checks passed`);
process.exit(failed ? 1 : 0);
