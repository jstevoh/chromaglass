#!/usr/bin/env node
/**
 * The Turing pattern: one stripe width on every rung, healed after a stir,
 * grown only where it is fed, and printed black on white where it is.
 *
 *   npm run turing      (the lab: any adapter that computes)
 *
 * What was reported (2026-10-10), on the "Turing Print" look the owner asked
 * for (PLAN.md 26d, from a VJ pack of black-and-white reaction-diffusion
 * labyrinths): the reaction printed only as soft, blurred rings of dye, too
 * coarse to read as stripes. Three causes, each measured here:
 *
 *   - The deposit read the reaction's field as if it were on the logical
 *     192² grid. It is on the dye's own (256² to 512²), so the deposit drew
 *     its top-left corner stretched over the plate: every pattern printed
 *     1.3 to 2.7 times its size and away from where it grew. Line 4 asks
 *     that the picture's dark be where the field's activator is high.
 *   - The field was carried twice a frame, once with the dye and once more
 *     by a bilinear backtrace that blurred it by about a cell each time.
 *   - Its width was in cells, so a stripe on 256² was twice the plate's
 *     width of one on 512². Lines 1 and 2: the wavelength, by FFT, holds
 *     within 10% at 256², 384² and 512², and again after a stir.
 *
 * And what the print is (depositChem): starch's blue-black complex with the
 * activator, in equilibrium with it, so the plate shows the pattern as it
 * stands and nothing piles up (line 5), sharp enough to read as black and
 * white (line 4), in the places the reaction is fed and nowhere else (line 3).
 *
 * Lines:
 *   1. the wavelength at 256², 384² and 512² within 10% of each other (the
 *      widest over the narrowest), and on the plate at all (between 1.5%
 *      and 6% of its width: neither noise nor one blob)
 *   2. a stir carries the reaction with the colour (a pour of reagent and a
 *      pool of dye laid together end within 15% of the way they went of each
 *      other; the pattern was carried twice, so it went ahead of its colour);
 *      the stir moves the pattern it passes over (correlation with itself
 *      before, on the stirred ring, under 0.5); and once healed the
 *      wavelength is the same within 10%
 *   3. on a plate with no bath, a pour of reagent grows a pattern inside
 *      its pour, and specks of the autocatalyst laid on the far side with no
 *      reagent under them grow nothing
 *   4. the Turing Print look renders black and white: under 20% of the
 *      plate's pixels in the middle tones, both dark and light over 20%;
 *      and its dark is where the field is high (correlation over 0.7
 *      between the picture's darkness and the activator, read cell for cell)
 *   5. printing for as long again changes the picture's dark share by under
 *      0.03: an equilibrium, not a deposit that builds
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/*
  The look's chemistry, as LiquidVisualizer steps it: Pattern 1 is
  Pearson's labyrinth corner (feed 0.04, kill 0.06), Width 0.5 the default
  diffusion lengths. T units of the reaction's time from sixty seeds; the
  app runs about 150 a second, so T is twenty seconds of a show.
*/
const FEED = 0.04, KILL = 0.06, DU = 0.16, DV = 0.08, T = 3000, SEEDS = 60;
const RUNGS = [256, 384, 512];
const WIDTH_SPREAD = 1.10, STIR_HELD = 0.10, MOVED = 0.5, SWIRL = 0.3, CARRIED = 0.15;
const MID_MOST = 0.20, SIDE_LEAST = 0.20, WHERE = 0.7, BUILDS = 0.03;

/** In-place radix-2 FFT of one row. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1;
    for (; j & b; b >>= 1) j ^= b;
    j ^= b;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const c = Math.cos(a * k), s = Math.sin(a * k), h = i + k + len / 2;
      const xr = re[h] * c - im[h] * s, xi = re[h] * s + im[h] * c;
      re[h] = re[i + k] - xr; im[h] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi;
    }
  }
}

/**
 * The pattern's wavelength as a share of the plate: the peak of the radial
 * power spectrum of the middle half of the field (the rim is where seeds
 * never reached), Hann-windowed, its centroid over the peak's neighbours.
 */
function wavelength(v, n) {
  const m = 1 << Math.floor(Math.log2(n / 2)), o = (n - m) >> 1;
  let mean = 0;
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) mean += v[(y + o) * n + x + o];
  mean /= m * m;
  const re = [], im = [];
  for (let y = 0; y < m; y++) {
    const r = new Float64Array(m);
    for (let x = 0; x < m; x++) r[x] = (v[(y + o) * n + x + o] - mean) * Math.sin(Math.PI * (x + 0.5) / m) ** 2 * Math.sin(Math.PI * (y + 0.5) / m) ** 2;
    re.push(r); im.push(new Float64Array(m));
  }
  for (let y = 0; y < m; y++) fft(re[y], im[y]);
  for (let x = 0; x < m; x++) {
    const cr = new Float64Array(m), ci = new Float64Array(m);
    for (let y = 0; y < m; y++) { cr[y] = re[y][x]; ci[y] = im[y][x]; }
    fft(cr, ci);
    for (let y = 0; y < m; y++) { re[y][x] = cr[y]; im[y][x] = ci[y]; }
  }
  const P = new Float64Array(m);
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
    const k = Math.round(Math.hypot(x < m / 2 ? x : x - m, y < m / 2 ? y : y - m));
    if (k > 1 && k < m / 2) P[k] += re[y][x] ** 2 + im[y][x] ** 2;
  }
  let best = 2;
  for (let k = 2; k < m / 2; k++) if (P[k] > P[best]) best = k;
  let sw = 0, sk = 0;
  for (let k = Math.max(2, best - 3); k <= Math.min(m / 2 - 1, best + 3); k++) { sw += P[k]; sk += P[k] * k; }
  return (m / (sk / sw)) / n;
}

function correlation(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; ab += x * y; aa += x * x; bb += y * y; }
  return ab / Math.sqrt(aa * bb || 1);
}

const pct = (x) => `${(x * 100).toFixed(2)}%`;
const { page, close } = await openLab();
try {
  // ── 1. The same stripe on every rung ────────────────────────────────
  const widths = {};
  for (const N of RUNGS) {
    const v = await page.evaluate(async ({ N, FEED, KILL, DU, DV, T, SEEDS }) => {
      await lab.create(N);
      const g = lab.solver();
      let s = 777; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
      // The dish full of substrate first (u = 1 under the bath), then the seeds.
      g.chemLive = true;
      for (let t = 0; t < 300; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
      for (let k = 0; k < SEEDS; k++) g.seedChemistry(0.1 + rnd() * 0.8, 0.1 + rnd() * 0.8, 0.012);
      for (let t = 0; t < T; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
      const f = await g.readChemistry('chem');
      return Array.from({ length: f.n * f.n }, (_, i) => f.data[i * 4 + 1]);
    }, { N, FEED, KILL, DU, DV, T, SEEDS });
    widths[N] = wavelength(v, N);
  }
  const ws = RUNGS.map((N) => widths[N]);
  const spread = Math.max(...ws) / Math.min(...ws);
  check('the stripe is one width on every rung', spread <= WIDTH_SPREAD,
    `wavelength ${RUNGS.map((N) => `${N}² ${pct(widths[N])}`).join(', ')} of the plate; widest over narrowest ${spread.toFixed(3)} (at most ${WIDTH_SPREAD})`);
  check('the stripe is a stripe', ws.every((w) => w > 0.015 && w < 0.06), 'between 1.5% and 6% of the plate on every rung');

  // ── 2. A stir: carried with the colour, and healed to its own width ──
  const stir = await page.evaluate(async ({ FEED, KILL, DU, DV, T, SEEDS, SWIRL }) => {
    const N = 384;
    await lab.create(N);
    const g = lab.solver();
    let s = 31337; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
    const read = async () => { const f = await g.readChemistry('chem'); return Array.from(f.data); };
    g.chemLive = true;
    for (let t = 0; t < 300; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
    for (let k = 0; k < SEEDS; k++) g.seedChemistry(0.1 + rnd() * 0.8, 0.1 + rnd() * 0.8, 0.012);
    for (let t = 0; t < T; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
    /*
      A pool of colour and a pour of reagent laid in the same place on the
      stir's ring. The reagent (the field's b) is only ever carried, never
      reacted, so where it goes is where the field goes: it has to go where
      the colour goes. A dye disc with no reagent under it is the colour.
    */
    lab.dye(0.72, 0.5, 0.05, [2, 2, 2], 2); lab.flush(); await lab.step(1);
    g.addReagent(0.72, 0.5, 0.05, 1, 1);
    // The field is N² and the dye comes back on the logical grid (readField), so each by its own side.
    const centroid = (data, ch) => {
      const n = Math.round(Math.sqrt(data.length / 4));
      let w = 0, x = 0, y = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = Math.max(0, data[(j * n + i) * 4 + ch]); w += v; x += v * (i + 0.5); y += v * (j + 0.5); }
      return [x / w / n, y / w / n];
    };
    const before = await read();
    const b0 = centroid(before, 2), d0 = centroid(await lab.field('dye'), 3);
    /*
      A stir as a hand makes one: a swirl round the middle for sixty steps
      of the solver, the reaction running its three units a step between
      them, as the frame loop does (stepChemistry, then the step).
    */
    for (let k = 0; k < 60; k++) {
      for (let a = 0; a < 12; a++) {
        const th = a / 12 * 2 * Math.PI, R = 0.22;
        lab.vel(0.5 + R * Math.cos(th), 0.5 + R * Math.sin(th), 0.12, [-Math.sin(th) * SWIRL, Math.cos(th) * SWIRL, 0, 0]);
      }
      lab.flush(); await lab.step(1);
      g.stepChemistry(3, FEED, KILL, DU, DV, 1);
    }
    const stirred = await read();
    const b1 = centroid(stirred, 2), d1 = centroid(await lab.field('dye'), 3);
    for (let k = 0; k < 300; k++) { lab.flush(); await lab.step(1); g.stepChemistry(3, FEED, KILL, DU, DV, 1); }
    const healed = await read();
    const v = (d) => Array.from({ length: N * N }, (_, i) => d[i * 4 + 1]);
    // The ring the swirl pushed, where the pattern was moved.
    const ring = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const r = Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5); if (r > 0.12 && r < 0.32) ring.push(j * N + i); }
    return { N, before: v(before), stirred: v(stirred), healed: v(healed), b0, b1, d0, d1, ring };
  }, { FEED, KILL, DU, DV, T, SEEDS, SWIRL });
  {
    const went = Math.hypot(stir.d1[0] - stir.d0[0], stir.d1[1] - stir.d0[1]);
    const apart = Math.hypot(stir.b1[0] - stir.d1[0], stir.b1[1] - stir.d1[1]);
    const tracer = Math.hypot(stir.b1[0] - stir.b0[0], stir.b1[1] - stir.b0[1]);
    check('the reaction is carried with the colour', went > 0.03 && apart < CARRIED * went,
      `the colour went ${pct(went)} of the plate, the reagent ${pct(tracer)}, and ended ${pct(apart)} apart (under ${CARRIED * 100}% of the way)`);
  }
  const ringOf = (v) => stir.ring.map((i) => v[i]);
  const moved = correlation(ringOf(stir.before), ringOf(stir.stirred));
  const w0 = wavelength(stir.before, stir.N), w1 = wavelength(stir.healed, stir.N);
  check('the stir moves the pattern', moved < MOVED, `on the stirred ring, correlation with itself before the stir ${moved.toFixed(3)} (under ${MOVED})`);
  check('the pattern heals to its own width', Math.abs(w1 / w0 - 1) <= STIR_HELD,
    `wavelength ${pct(w0)} before, ${pct(w1)} healed (within ${STIR_HELD * 100}%)`);

  // ── 3. It grows where it is fed ─────────────────────────────────────
  const fed = await page.evaluate(async ({ FEED, KILL, DU, DV }) => {
    const N = 256;
    await lab.create(N);
    const g = lab.solver();
    /*
      A pour of Turing Reagent on the left (addReagent: the feed, and its
      own speck of the autocatalyst), no bath. Once the plate has had time to
      fill with substrate wherever it is fed, specks of the autocatalyst with
      no reagent under them on the right. Fed everywhere, the right would
      have filled with substrate by then and its specks grown.
    */
    g.addReagent(0.3, 0.5, 0.1, 1, 1);
    for (let t = 0; t < 300; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 0);
    g.seedChemistry(0.8, 0.5, 0.03);
    g.seedChemistry(0.8, 0.3, 0.03);
    g.seedChemistry(0.8, 0.7, 0.03);
    for (let t = 0; t < 1500; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 0);
    const f = await g.readChemistry('chem');
    let inside = 0, inN = 0, far = 0, farN = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N, w = (y + 0.5) / N, v = f.data[(y * N + x) * 4 + 1];
      if (Math.hypot(u - 0.3, w - 0.5) < 0.08) { inN++; if (v > 0.1) inside++; }
      if (u > 0.65) { farN++; if (v > 0.1) far++; }
    }
    return { inside: inside / inN, far: far / farN };
  }, { FEED, KILL, DU, DV });
  check('a pour of reagent grows a pattern inside its pour', fed.inside > 0.2, `activator over 0.1 on ${pct(fed.inside)} of the pour`);
  check('specks with no reagent grow nothing', fed.far === 0, `activator over 0.1 on ${pct(fed.far)} of the far side, where three were laid`);

  // ── 4, 5. The print: black and white, where the field is, not piling up ──
  const print = await page.evaluate(async ({ FEED, KILL, DU, DV, T, SEEDS }) => {
    const N = 384, SIZE = 384;
    await lab.create(N);
    const g = lab.solver();
    const look = lab.look('turing-print').settings;
    let s = 2468; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
    g.chemLive = true;
    for (let t = 0; t < 300; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
    for (let k = 0; k < SEEDS; k++) g.seedChemistry(0.1 + rnd() * 0.8, 0.1 + rnd() * 0.8, 0.012);
    for (let t = 0; t < T; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
    // The frame loop's order (LiquidVisualizer): the reaction, its print, the step.
    const frames = async (n) => {
      for (let f = 0; f < n; f++) {
        g.stepChemistry(3, FEED, KILL, DU, DV, 1);
        g.depositChemistry(g.chem.read, 0.02, [0.17, 0.2, 0.46], 0.22, look.turingPrint, 1);
        lab.flush(); await lab.step(1);
      }
    };
    const picture = async () => {
      const px = await lab.render(SIZE, look, { zoom: 1, macroAmount: 0, cx: 0.5, cy: 0.5, bubbles: 0 });
      const lum = new Float64Array(SIZE * SIZE);
      for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      return Array.from(lum);
    };
    await frames(30);
    const first = await picture();
    const f = await g.readChemistry('chem');
    const v = Array.from({ length: f.n * f.n }, (_, i) => f.data[i * 4 + 1]);
    await frames(30);
    const again = await picture();
    return { N, SIZE, first, again, v, print: look.turingPrint };
  }, { FEED, KILL, DU, DV, T, SEEDS });
  /*
    Read in the middle half, where the lamp's hot-spot and the dish's rim
    darken nothing much; tones against that region's own white (its 98th
    centile) so the lamp's warmth is not taken for grey.
  */
  const tones = (lum) => {
    const { SIZE } = print, o = SIZE >> 2, sel = [];
    for (let y = o; y < SIZE - o; y++) for (let x = o; x < SIZE - o; x++) sel.push(lum[y * SIZE + x]);
    const white = [...sel].sort((a, b) => a - b)[Math.floor(sel.length * 0.98)];
    let dark = 0, light = 0;
    for (const l of sel) { if (l < 0.25 * white) dark++; else if (l > 0.75 * white) light++; }
    return { dark: dark / sel.length, light: light / sel.length, mid: 1 - (dark + light) / sel.length, white };
  };
  const t1 = tones(print.first), t2 = tones(print.again);
  check('the look is Turing Print, printing', print.print > 0, `turingPrint ${print.print}`);
  check('the print is black and white', t1.mid < MID_MOST && t1.dark > SIDE_LEAST && t1.light > SIDE_LEAST,
    `dark ${pct(t1.dark)}, light ${pct(t1.light)}, middle tones ${pct(t1.mid)} (under ${MID_MOST * 100}%) against a white of ${t1.white.toFixed(0)}`);
  {
    /*
      The picture's darkness against the activator, in the middle half of
      the picture. A pixel is mapped to the plate as the plate shader maps it
      (uvToFluid: at zoom 1 the screen spans the middle two thirds of the
      plate, rows top-down, the plate's v up) and read at its nearest cell.
    */
    const { N, SIZE } = print, a = [], b = [];
    for (let y = SIZE >> 2; y < SIZE - (SIZE >> 2); y++) for (let x = SIZE >> 2; x < SIZE - (SIZE >> 2); x++) {
      const fu = 0.5 + ((x + 0.5) / SIZE - 0.5) / 1.5, fv = 0.5 + ((1 - (y + 0.5) / SIZE) - 0.5) / 1.5;
      a.push(print.v[Math.floor(fv * N) * N + Math.floor(fu * N)]);
      b.push(-print.first[y * SIZE + x]);
    }
    const r = correlation(a, b);
    check('the print is where the reaction is', r > WHERE, `darkness against the activator, cell for cell: correlation ${r.toFixed(3)} (over ${WHERE})`);
  }
  check('the print holds, it does not build', Math.abs(t2.dark - t1.dark) < BUILDS && t2.dark > SIDE_LEAST,
    `dark ${pct(t1.dark)} then ${pct(t2.dark)} thirty frames on (moved under ${BUILDS})`);
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} FAILED` : `\nall ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
