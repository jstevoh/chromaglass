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
 * And one CI found (the first Metal run of this check): the stripe widened
 * with the rung on the Mac's GPU, 3.08%, 3.35% and 3.51% of the plate, where
 * SwiftShader drew 3.06%, 3.12% and 3.19%. The field was stored in half
 * floats, and a half float's step near 1 is 1/2048: the substrate's refill,
 * feed × (1 − u) a step, falls under it before the dish is full, and the
 * substrate stops rising there. SwiftShader rounds a stored half float to
 * nearest and left the dish 0.003 to 0.005 short (line 1, measured); the
 * Mac's GPU, by the widths it drew, rounds toward zero, which drops every
 * step under 1/2048 and stops about twice as far short. The lab, rounding
 * the stored field toward zero by hand on SwiftShader, drew 3.08%, 3.35% and
 * 3.52%: the Mac's widths to the hundredth. The field is now in
 * full floats, where the dye is (rgba32float wherever the GPU can filter
 * it). Line 1's first part asks for that the way the feature needs it: the
 * dish under the bath fills to its reservoir, which no half float can.
 *
 * And what the print is (depositChem): starch's blue-black complex with the
 * activator, in equilibrium with it, so the plate shows the pattern as it
 * stands and nothing piles up (line 5), sharp enough to read as black and
 * white (line 4), in the places the reaction is fed and nowhere else (line 3).
 *
 * Lines:
 *   1. the dish, under the bath with nothing seeded, fills with substrate to
 *      within 0.001 of its reservoir (u = 1) on every rung; then the wavelength at 256², 384² and 512² within 10% of each other (the
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
 *   6. the print takes another colour (turingInk(), at a green, a blue and a
 *      red: its dark is a solid of that colour, the three pictures apart);
 *      the visualizer hands the setting to the print (read from its source,
 *      since the app's own frames cannot be read here, and the setting's
 *      default is 0, starch). What is measured of the colour is the ink
 *      function's depth in the plate's shader, not the setting's path to it
 *   7. a colour poured under the print shows through it (red over green on
 *      the light paper of a pool rises at least threefold), and the print
 *      stays in the pool (its stripes correlate with the undyed picture's,
 *      against the same read slid along, which they do not)
 *   8. the drain and the wipe end the print: the plate reads the solver's
 *      dye again from the first drain step and after the wipe, and the
 *      print again when the deposit next runs
 *   9. the print keeps changing (PLAN.md 26d-6): fifty seconds after it has
 *      settled, at the Drift the Turing Print preset ships it correlates
 *      under 0.8 with the settled picture and at least 0.1 less than the
 *      same maze at Drift 0 does, and under 0.7 at Drift 1; it stays alive
 *      (its activator share between a held-spots plate's and a held-stripes
 *      plate's, each less or plus 0.05, and under nine tenths), breaks into
 *      more than ten times the stripes' connected pieces on the way to
 *      spots (PLAN.md 26d-6a), keeps every tile of the plate striped at the
 *      preset's Drift and at 1 (no grey patch) and keeps its stripe width
 *      within 15% of the control's;
 *      Drift 0 is the same field whatever the clock reads; and the
 *      visualizer advances the clock on its own seconds, not on the sound,
 *      reads the setting only while the print is on, hands the solver both,
 *      and ships the setting off by default and on in the Turing Print preset
 */
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';
import { turingInk } from '../src/lib/turingInk.ts';

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
const FILLED = 0.001;
const DRIFT_SETTLE = 9000, DRIFT_RUN = 9000, DRIFT_MOVES = 0.8, DRIFT_GAP = 0.1, DRIFT_FULL_MOVES = 0.7, DRIFT_CONTROL_STILL = 0.8, DRIFT_ALIVE_LO = 0.5, DRIFT_ALIVE_HI = 0.9, DRIFT_ALIVE_SLACK = 0.05, DRIFT_BREAKS = 10, DRIFT_SPOT_SNAPS = 6, DRIFT_STILL_PIECES = 3, DRIFT_SPOTS_LEAD = 0.1, DRIFT_SPOTS_LIVE = 0.3, DRIFT_TILE_KEEPS = 0.6, DRIFT_WIDTH = 0.15, ALIVE_ABOVE = 0.1, TILE = 32, DRIFT_UNITS_PER_SECOND = 180;
const INK_SHOWS = 0.3, INK_PURE = 0.9, INKS_APART = 0.5, POURED_SHOWS = 3, POOL_KEEPS = 0.8, POOL_CONTROL_GAP = 0.3, SLIDE = 5;

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
  if (!(aa > 0 && bb > 0)) throw new Error('correlation of a flat field: a plate with no pattern in it reads as no change, not as a pass');
  return ab / Math.sqrt(aa * bb);
}

const pct = (x) => `${(x * 100).toFixed(2)}%`;
const { page, close } = await openLab();
try {
  // ── 1. The same stripe on every rung ────────────────────────────────
  const widths = {}, shorts = {};
  for (const N of RUNGS) {
    const v = await page.evaluate(async ({ N, FEED, KILL, DU, DV, T, SEEDS }) => {
      await lab.create(N);
      const g = lab.solver();
      let s = 777; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
      // The dish full of substrate first (u = 1 under the bath), then the seeds.
      g.chemLive = true;
      for (let t = 0; t < 300; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
      // How far short of its reservoir the substrate is (exactly: e^-12, 6e-6).
      const full = await g.readChemistry('chem');
      let short = 0;
      for (let i = 0; i < full.n * full.n; i++) short += 1 - full.data[i * 4];
      for (let k = 0; k < SEEDS; k++) g.seedChemistry(0.1 + rnd() * 0.8, 0.1 + rnd() * 0.8, 0.012);
      for (let t = 0; t < T; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
      const f = await g.readChemistry('chem');
      return { short: short / (full.n * full.n), v: Array.from({ length: f.n * f.n }, (_, i) => f.data[i * 4 + 1]) };
    }, { N, FEED, KILL, DU, DV, T, SEEDS });
    widths[N] = wavelength(v.v, N);
    shorts[N] = v.short;
  }
  check('the dish fills to its reservoir', RUNGS.every((N) => shorts[N] < FILLED),
    `substrate short of it by ${RUNGS.map((N) => `${N}² ${shorts[N].toExponential(1)}`).join(', ')} (under ${FILLED}; half floats stop 0.003 or more short)`);
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

  // ── 6, 7. The print over poured colour, and in another colour ───────────
  /*
    What was reported (2026-10-19): "the colored liquids don't work on the
    Turing, and Turing can't be a different color". Two causes, both in
    depositChem. It wrote the print into the solver's dye, replacing what was
    there wherever the reaction was fed, so a pour of colour was erased under
    the print (fed cells are most of the plate), and the print's colour was
    starch's indigo whatever was asked. The print is now laid over the dye in
    a texture of its own (fields.dye while it prints), and its colour is the
    turingInk setting.

    One reaction, grown as in line 4, and the same picture rendered after each
    change, the print refreshed (a few frames) in between:
      - the ink at a third and at two thirds of the wheel, nothing poured. The
        print's dark must be the colour asked for (a solid green, a solid blue,
        where starch's is black), and the two hues must not be the same picture.
      - then back to the look's own ink and a red pool poured in the middle. A
        poured red absorbs green and blue, so the light paper inside the pool
        must go red: its red over green rises from the undyed plate's, which a
        print that replaced the dye leaves where it was. And the print must
        still be there inside the pool (its stripes correlate with the undyed
        picture's), or the pool has only hidden the print.
  */
  // Starch, then a green, a blue and a red (0.02 is the first branch of the hue function, the others are the second and third).
  const inks = [turingInk(0), turingInk(1 / 3), turingInk(2 / 3), turingInk(0.02)];
  const colour = await page.evaluate(async ({ FEED, KILL, DU, DV, T, SEEDS, inks }) => {
    const N = 256, SIZE = 256;
    await lab.create(N);
    const g = lab.solver();
    const look = lab.look('turing-print').settings;
    let s = 2468; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
    g.chemLive = true;
    for (let t = 0; t < 300; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
    for (let k = 0; k < SEEDS; k++) g.seedChemistry(0.1 + rnd() * 0.8, 0.1 + rnd() * 0.8, 0.012);
    for (let t = 0; t < T; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
    const frames = async (n, ink) => {
      for (let f = 0; f < n; f++) {
        g.stepChemistry(3, FEED, KILL, DU, DV, 1);
        g.depositChemistry(g.chem.read, 0.02, [ink.r, ink.g, ink.b], 0.22, look.turingPrint, 1);
        lab.flush(); await lab.step(1);
      }
    };
    const picture = async () => Array.from(await lab.render(SIZE, look, { zoom: 1, macroAmount: 0, cx: 0.5, cy: 0.5, bubbles: 0 }));
    const out = { SIZE, pics: [] };
    for (const ink of inks) { await frames(20, ink); out.pics.push(await picture()); }
    await frames(20, inks[0]);
    out.before = await picture();
    lab.dye(0.5, 0.5, 0.2, [0.1, 1.5, 1.5], 1);
    lab.flush(); await frames(3, inks[0]);
    out.after = await picture();
    return out;
  }, { FEED, KILL, DU, DV, T, SEEDS, inks });
  {
    const { SIZE } = colour;
    const lumOf = (px, i) => 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    // The middle half, as in line 4; the pool is read in the middle too.
    const mid = [];
    for (let y = SIZE >> 2; y < SIZE - (SIZE >> 2); y++) for (let x = SIZE >> 2; x < SIZE - (SIZE >> 2); x++) mid.push(y * SIZE + x);
    const white = (px) => [...mid.map((i) => lumOf(px, i))].sort((a, b) => a - b)[Math.floor(mid.length * 0.98)];
    // Mean colour of the print's darkest fifth, against the plate's white.
    const darkColour = (px) => {
      const w = white(px), sorted = [...mid].sort((a, b) => lumOf(px, a) - lumOf(px, b)).slice(0, Math.floor(mid.length / 5));
      const m = [0, 0, 0];
      for (const i of sorted) for (let c = 0; c < 3; c++) m[c] += px[i * 4 + c] / w;
      return m.map((v) => v / sorted.length);
    };
    const [d0, d1, d2, d3] = colour.pics.map(darkColour);
    const away = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const tone = (c) => c.map((v) => v.toFixed(2)).join(', ');
    for (const [k, ink, d] of [[1, inks[1], d1], [2, inks[2], d2], [3, inks[3], d3]]) {
      const ch = ink.r >= ink.g && ink.r >= ink.b ? 0 : ink.g >= ink.b ? 1 : 2;
      const share = d[ch] / (d[0] + d[1] + d[2]);
      check(`the print takes the ink's hue (${k} of 3)`, d[ch] > INK_SHOWS && share > INK_PURE,
        `ink ${ink.r.toFixed(2)}, ${ink.g.toFixed(2)}, ${ink.b.toFixed(2)}: the print's darkest fifth is ${(d[ch]).toFixed(2)} of the white in channel ${'rgb'[ch]} (over ${INK_SHOWS}; starch's is ${d0[ch].toFixed(2)}) and ${pct(share)} of its light is that channel (over ${INK_PURE * 100}%)`);
    }
    check('three hues are three pictures', Math.min(away(d1, d2), away(d1, d3), away(d2, d3)) > INKS_APART, `the dark of the hues ${away(d1, d2).toFixed(3)}, ${away(d1, d3).toFixed(3)} and ${away(d2, d3).toFixed(3)} apart in colour (over ${INKS_APART})`);
    // The pool: plate disc (0.5, 0.5) radius 0.1, mapped to the screen as in line 4's note.
    const pool = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const fu = 0.5 + ((x + 0.5) / SIZE - 0.5) / 1.5, fv = 0.5 + ((1 - (y + 0.5) / SIZE) - 0.5) / 1.5;
      if (Math.hypot(fu - 0.5, fv - 0.5) < 0.1) pool.push(y * SIZE + x);
    }
    // Light paper in the undyed picture: where the pool's colour has to show.
    const w = white(colour.before), paper = pool.filter((i) => lumOf(colour.before, i) > 0.75 * w);
    const redness = (px) => { let r = 0, g = 0; for (const i of paper) { r += px[i * 4]; g += px[i * 4 + 1]; } return r / g; };
    const r0 = redness(colour.before), r1 = redness(colour.after);
    check('a poured colour shows under the print', r1 > r0 * POURED_SHOWS,
      `red over green on the light paper in the pool (${paper.length} pixels): ${r0.toFixed(2)} undyed, ${r1.toFixed(2)} with red poured (over ${POURED_SHOWS}x)`);
    // The stripes themselves: the pool's picture against the same cells undyed.
    const c = correlation(pool.map((i) => lumOf(colour.before, i)), pool.map((i) => lumOf(colour.after, i)));
    // The control: the same pool read a few pixels along, so the stripes no
    // longer line up. If the stripes are what the correlation measures, this
    // must come out well under the aligned one; if it came out as high, the
    // pool's brightness was one smooth disc and the check above would pass on
    // a pool that had hidden the print.
    const slid = correlation(pool.map((i) => lumOf(colour.before, i)), pool.map((i) => lumOf(colour.after, i + SLIDE)));
    check('the print still shows in the pool', c > POOL_KEEPS && slid < c - POOL_CONTROL_GAP,
      `brightness of the ${pool.length} pixels of the pool, undyed against with red poured: correlation ${c.toFixed(3)} (over ${POOL_KEEPS}); the same read ${SLIDE} pixels along ${slid.toFixed(3)} (under ${(c - POOL_CONTROL_GAP).toFixed(3)}, the stripes being what lines up)`);
  }
  // ── The drain and the wipe end the print ────────────────────────────────
  /*
    The print is a picture of its own, kept up by the visualizer's deposit
    every frame. The drain (fifty frames) and the wipe at its end are the
    times the deposit does not run, so a print left live holds its last
    picture still over the draining pour, then jumps to the emptied plate
    (review of the first push, 2026-10-19). The plate must be reading the
    solver's own dye again from the first drain step, and after a wipe, and
    must go back to the print when the deposit runs again. What is compared
    is which texture the plate would draw (fields.dye), against the print
    on the plate before, so a print that never came up cannot pass.
  */
  const drain = await page.evaluate(async ({ FEED, KILL, DU, DV }) => {
    await lab.create(256);
    const g = lab.solver();
    const look = lab.look('turing-print').settings;
    g.chemLive = true;
    for (let t = 0; t < 300; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
    for (let k = 0; k < 20; k++) g.seedChemistry(0.2 + 0.03 * k, 0.5, 0.012);
    for (let t = 0; t < 300; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
    const deposit = () => g.depositChemistry(g.chem.read, 0.02, [0.1, 0.2, 0.6], 0.22, look.turingPrint, 1);
    const onDye = () => g.fields.dye === g.dye.read;
    const out = {};
    deposit(); out.printing = !onDye();
    g.drainStep(0.1); out.drained = onDye();
    deposit(); out.again = !onDye();
    g.clear(); out.wiped = onDye();
    return out;
  }, { FEED, KILL, DU, DV });
  check('the drain and the wipe end the print, and the next deposit brings it back',
    drain.printing && drain.drained && drain.again && drain.wiped,
    `plate draws the print while printing: ${drain.printing}; the dye itself after a drain step: ${drain.drained}; the print again on the next deposit: ${drain.again}; the dye itself after the wipe: ${drain.wiped}`);
  // ── The setting reaches the plate ───────────────────────────────────────
  /*
    The lines above measure turingInk()'s colour and the print over the pour;
    they call depositChemistry themselves, so they pass whether or not the
    visualizer hands the setting to it. This is the one place that is read:
    the print branch of the chemistry's loop must take its colour from
    currentSettings.turingInk, and the setting must default to 0, which is
    starch, the look every saved set was built on. A source assertion, as the
    panel check's are, because the app's own frames cannot be read in a cloud
    session.
  */
  {
    const vis = readFileSync(new URL('../src/components/LiquidVisualizer.tsx', import.meta.url), 'utf8');
    const types = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
    const wired = /print > 0\s*\?\s*turingInk\(currentSettings\.turingInk \?\? 0\)/.test(vis);
    const defaults = (types.match(/^\s*turingInk: 0,/gm) || []).length;
    check('the visualizer draws the print in the turingInk setting, defaulting to starch', wired && defaults === 1,
      `print branch reads currentSettings.turingInk: ${wired}; "turingInk: 0" in types.ts ${defaults} time (the default)`);
  }
  // ── 9. The print keeps changing ─────────────────────────────────────────
  /*
    Constant feed and kill settle to a maze that then only creeps (the lab's
    own control: correlation 0.97 with itself after 3000 units, 0.90 after
    9000), which is why the print went still once the chemicals met. Drift
    moves the feed along the saddle-node line across the plate on a slow
    clock (shader comment, PLAN.md 26d-6). What has to be true: the settled
    maze, run 9000 units on (fifty seconds at the app's 180 a second: three
    units a frame at sixty frames), is a different picture at the Drift the
    Turing Print preset ships than with Drift 0, by a good margin rather
    than by the creep the control shows, and more so at Drift 1; it is still
    a pattern, not a plate the drift emptied or filled, and not one with a
    grey patch in it where the pattern gave out; and its stripes are still
    the same width, since the drift is a change of where the pattern grows
    and not a change of what it is. The control runs the same seeds, the
    same clock and the same stepping with Drift 0, so the clock being fed
    cannot be what the difference is credited to. The preset's own value is
    read from presets.ts, not typed here, so the check measures what ships
    (the script runs under plain node, which cannot load that module, so the
    number is read from its text).
    The grey patch does not show in the share of cells that carry activator
    (grey activator counts as carrying it), only as lost contrast, so the
    plate is cut into tiles of TILE pixels and the flattest tile of the
    drifting run must keep DRIFT_TILE_KEEPS of the flattest tile of the
    control's, at each of six reads and at Drift 1 as well as the preset's
    (measured 0.93 and 0.77 over the six, tiles looked for every TILE / 2
    pixels so a patch cannot sit between them; 0.95 and 0.89 on a grid of whole
    tiles; the kill rate no longer dips under the saddle-node line, 26d-6a,
    which was 0.82 and 0.72 before, and Drift 1 was shown and not asserted). Drift is brought up at the rate the app
    hands it to the solver (TURING_DRIFT_PER_SECOND over
    TURING_ITERATIONS_PER_SECOND, both read from the visualizer, and counted
    in iterations because a frame's seconds do not say how many ran):
    handed whole to a settled print it starves a 32-pixel tile
    dead for about 3500 units (mean 0, contrast 0), a transient the app
    never produces now. Run on the ramp, the tile bar did not separate
    this shader from the one before the glide (0.81 and 0.74, over 0.6, on
    the grid of whole tiles); the
    movement and pieces lines do (correlation 0.867 and 0.814 against under
    0.8 and 0.7; pieces 12 and 16 against over 140). Where a grey patch sits
    is not tested; a speckle of dead cells would show in the width line.
    The drift also glides each region between stripes and spots (shader
    comment). That changes what "alive" means: spots cover less of the
    plate than stripes do (held spots 0.483 of the cells, held stripes
    0.706), so a drifting print cannot be asked to match the stripes' share.
    The bounds are the two held plates' shares, each with DRIFT_ALIVE_SLACK
    of room, measured here beside it from the same seeds rather than typed;
    a plate the drift emptied or filled is still outside them. The old bar
    (within 0.05 of the control's share alone) is replaced, not loosened to
    pass: the print now spends part of its time as spots, by design, and the
    new bound still fails an empty plate and a full one. That the glide is
    real is a second line, since a share can be right with the plate stuck:
    connected pieces of activator are counted six times over the run, and
    the drifting runs (and a spots control held at the spots end of the
    range, whose count must show the end is spots) must pass DRIFT_BREAKS
    times the most pieces the held stripes ever show (measured 14 for
    stripes; 389 and 374 at the run's end for Drift 0.7 and 1; 608 for held
    spots). Movement: correlation 0.901 at Drift 0, 0.641 at 0.7, 0.591 at 1.
  */
  const presetsSrc = readFileSync(new URL('../src/presets.ts', import.meta.url), 'utf8');
  const typesSrc = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
  const turingPreset = presetsSrc.slice(presetsSrc.indexOf("id: 'turing-print'"));
  const presetDrift = Number(/^\s*turingDrift: ([0-9.]+),/m.exec(turingPreset.slice(0, turingPreset.indexOf("id: '", 10)))?.[1] ?? 0);
  // The held-spots plate is the shader's own spots end, so its numbers are read from the shader's
  // text (as the preset's Drift is from presets.ts) and not typed a second time: if the cap or the
  // share moves there, this follows, and if the lines are not found the check cannot run.
  const fluidSrc = readFileSync(new URL('../src/gpu/wgsl/fluid/reactions.ts', import.meta.url), 'utf8');
  const capM = /let cap = max\(([0-9.]+) - ([0-9.]+) \* f1,/.exec(fluidSrc);
  const shareM = /let above = cap \* mix\(([0-9.]+), ([0-9.]+), r\);/.exec(fluidSrc);
  if (!capM || !shareM) throw new Error('turing: the regime lines (cap, above) were not found in wgsl/fluid/reactions.ts');
  const SPOT_CAP = Number(capM[1]) - Number(capM[2]) * FEED, SPOT_SHARE = Number(shareM[2]);
  // The rate the app moves the Drift it hands the solver by is read from the visualizer, so the
  // lab ramps as the app does and not as a number typed twice (a step of full Drift starves a tile).
  const visSrc = readFileSync(new URL('../src/components/LiquidVisualizer.tsx', import.meta.url), 'utf8');
  const rateM = /const TURING_DRIFT_PER_SECOND = ([0-9.]+);/.exec(visSrc);
  if (!rateM) throw new Error('turing: TURING_DRIFT_PER_SECOND was not found in LiquidVisualizer.tsx');
  const DRIFT_RATE = Number(rateM[1]);
  // A "." parses to NaN, which Math.min would hand the shader without a word.
  if (!(Number.isFinite(DRIFT_RATE) && DRIFT_RATE > 0 && DRIFT_RATE <= 1)) throw new Error(`turing: TURING_DRIFT_PER_SECOND read as ${rateM[1]}, wanted a number in (0, 1]`);
  // The app counts the rate in solver iterations (a slow machine runs fewer a frame), and so does the lab.
  const iterM = /const TURING_ITERATIONS_PER_SECOND = ([0-9.]+);/.exec(visSrc);
  if (!iterM || Number(iterM[1]) !== DRIFT_UNITS_PER_SECOND) throw new Error(`turing: TURING_ITERATIONS_PER_SECOND in LiquidVisualizer.tsx is ${iterM ? iterM[1] : 'missing'}, the lab ramps at ${DRIFT_UNITS_PER_SECOND}`);
  const drift = await page.evaluate(async ({ FEED, KILL, DU, DV, SEEDS, SETTLE, RUN, ABOVE, TILE, PER_SECOND, RATE, DRIFTS, SPOT_KILL, SNAPS }) => {
    const N = 256;
    // Connected pieces of the activator (over ABOVE, four-way, the plate's outer 16 pixels left out
    // and specks under 6 pixels not counted): a labyrinth is a few long pieces, spots are hundreds.
    const pieces = (v) => {
      const L = new Int32Array(N * N); let n = 0;
      for (let y = 16; y < N - 16; y++) for (let x = 16; x < N - 16; x++) {
        const i = y * N + x; if (v[i] <= ABOVE || L[i]) continue;
        let area = 0; const st = [i]; L[i] = 1;
        while (st.length) {
          const j = st.pop(); area++; const jx = j % N, jy = (j / N) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = jx + dx, ny = jy + dy, q = ny * N + nx;
            if (nx < 16 || ny < 16 || nx >= N - 16 || ny >= N - 16 || v[q] <= ABOVE || L[q]) continue;
            L[q] = 1; st.push(q);
          }
        }
        if (area >= 6) n++;
      }
      return n;
    };
    // The flattest tile's standard deviation: a grey patch is a tile that lost its stripes. Tiles
    // step by half a tile, so a dead patch of a tile's size is seen wherever it sits, not only
    // where it lines up with the grid (a patch shifted 16 pixels read 0.87 of the clean plate
    // on a grid of whole tiles, and passed).
    const flattestOf = (v) => {
      let flattest = Infinity;
      for (let ty = 0; ty + TILE <= N; ty += TILE / 2) for (let tx = 0; tx + TILE <= N; tx += TILE / 2) {
        let m = 0, q = 0;
        for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const w = v[(ty + y) * N + tx + x]; m += w; q += w * w; }
        const c = TILE * TILE; m /= c;
        flattest = Math.min(flattest, Math.sqrt(Math.max(0, q / c - m * m)));
      }
      return flattest;
    };
    const run = async (d, kill = KILL) => {
      await lab.create(N);
      const g = lab.solver();
      let s = 777; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
      g.chemLive = true;
      for (let t = 0; t < 300; t += 10) g.stepChemistry(10, FEED, kill, DU, DV, 1);
      for (let k = 0; k < SEEDS; k++) g.seedChemistry(0.1 + rnd() * 0.8, 0.1 + rnd() * 0.8, 0.012);
      let units = 0;
      for (let t = 0; t < SETTLE; t += 10) { g.stepChemistry(10, FEED, kill, DU, DV, 1); units += 10; }
      const snap = async () => { const f = await g.readChemistry('chem'); if (f.n !== N) throw new Error(`readChemistry gave ${f.n} wide, wanted ${N}`); return Array.from({ length: f.n * f.n }, (_, i) => f.data[i * 4 + 1]); };
      const settled = await snap();
      const counts = [], flats = [], alives = [];
      for (let t = 0; t < RUN; t += 10) {
        g.stepChemistry(10, FEED, kill, DU, DV, 1, Math.min(d, RATE * (t + 10) / PER_SECOND), units / PER_SECOND); units += 10;
        if ((t + 10) % (RUN / SNAPS) === 0) {
          const v = await snap();
          counts.push(pieces(v)); flats.push(flattestOf(v)); alives.push(v.filter((x) => x > ABOVE).length / v.length);
        }
      }
      if (counts.length !== SNAPS) throw new Error(`took ${counts.length} reads, wanted ${SNAPS}`);
      const later = await snap();
      return { settled, later, flattest: Math.min(...flats), flats, counts, alives, alive: later.filter((x) => x > ABOVE).length / later.length };
    };
    const runs = [];
    for (const d of DRIFTS) runs.push(await run(d));
    // The spots end of the regime, held: constant feed and the spots' kill, no drift.
    const spots = await run(0, SPOT_KILL);
    // Drift 0 must ignore the clock: the same 300 units under two clocks.
    const twice = [];
    for (const clock of [0, 123.4]) {
      await lab.create(N);
      const g = lab.solver();
      g.chemLive = true;
      for (let t = 0; t < 300; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1);
      for (let k = 0; k < 12; k++) g.seedChemistry(0.2 + 0.05 * k, 0.5, 0.012);
      for (let t = 0; t < 300; t += 10) g.stepChemistry(10, FEED, KILL, DU, DV, 1, 0, clock + t / PER_SECOND);
      const f = await g.readChemistry('chem');
      twice.push(Array.from({ length: f.n * f.n }, (_, i) => f.data[i * 4 + 1]));
    }
    let apart = 0;
    for (let i = 0; i < twice[0].length; i++) apart = Math.max(apart, Math.abs(twice[0][i] - twice[1][i]));
    // The instrument, shown red once per run: one tile-sized patch of the held stripes' last read
    // flattened to its own mean, 16 pixels off the grid of whole tiles. The tile line below must
    // read it as a grey patch, or its 0.6 bar could be passing on a plate it cannot see into.
    const patched = Array.from(runs[0].later);
    {
      const y0 = 80 + TILE / 2, x0 = 80 + TILE / 2; let m = 0;
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) m += patched[(y0 + y) * N + x0 + x];
      m /= TILE * TILE;
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) patched[(y0 + y) * N + x0 + x] = m;
    }
    return { N, runs, spots, apart, instrument: { clean: flattestOf(runs[0].later), patched: flattestOf(patched) } };
  }, { FEED, KILL, DU, DV, SEEDS, SETTLE: DRIFT_SETTLE, RUN: DRIFT_RUN, ABOVE: ALIVE_ABOVE, TILE, PER_SECOND: DRIFT_UNITS_PER_SECOND, RATE: DRIFT_RATE, DRIFTS: [0, presetDrift, 1], SPOT_KILL: Math.sqrt(FEED) / 2 - FEED + SPOT_SHARE * SPOT_CAP, SNAPS: DRIFT_SPOT_SNAPS });
  {
    const [still, shipped, full] = drift.runs;
    const cStill = correlation(still.settled, still.later);
    const cShipped = correlation(shipped.settled, shipped.later);
    const cFull = correlation(full.settled, full.later);
    check('the settled maze barely creeps without the drift (the control is a control)', cStill > DRIFT_CONTROL_STILL,
      `Drift 0, ${DRIFT_RUN} units on: correlation with the settled field ${cStill.toFixed(3)} (over ${DRIFT_CONTROL_STILL})`);
    check('the Turing Print preset ships a Drift that rearranges the settled print, well past the control',
      presetDrift > 0 && cShipped < DRIFT_MOVES && cShipped < cStill - DRIFT_GAP,
      `Drift ${presetDrift} (the preset's), the same ${DRIFT_RUN} units: correlation ${cShipped.toFixed(3)} (under ${DRIFT_MOVES}, and ${DRIFT_GAP} under the control's ${cStill.toFixed(3)})`);
    check('Drift 1 rearranges it further', cFull < DRIFT_FULL_MOVES && cFull < cShipped,
      `Drift 1: correlation ${cFull.toFixed(3)} (under ${DRIFT_FULL_MOVES}, and under the preset's ${cShipped.toFixed(3)})`);
    const spots = drift.spots;
    const lo = spots.alive - DRIFT_ALIVE_SLACK, hi = Math.min(still.alive + DRIFT_ALIVE_SLACK, DRIFT_ALIVE_HI);
    const lead = still.alive - spots.alive;
    check('the held stripes and spots are the two ends of a living plate (the bounds below mean something)',
      still.alive > DRIFT_ALIVE_LO && still.alive < DRIFT_ALIVE_HI && spots.alive > DRIFT_SPOTS_LIVE && lead > DRIFT_SPOTS_LEAD,
      `stripes held ${still.alive.toFixed(3)} (between ${DRIFT_ALIVE_LO} and ${DRIFT_ALIVE_HI}), spots held ${spots.alive.toFixed(3)} (over ${DRIFT_SPOTS_LIVE}), the stripes ${lead.toFixed(3)} ahead (over ${DRIFT_SPOTS_LEAD})`);
    const inBand = (r) => r.alives.every((a) => a > lo && a < hi);
    check('the drifting print is still alive, neither emptied nor filled',
      inBand(shipped) && inBand(full),
      `share of cells with activator over ${ALIVE_ABOVE}, at each of six reads (each between the spots' less ${DRIFT_ALIVE_SLACK}, ${lo.toFixed(3)}, and the stripes' plus ${DRIFT_ALIVE_SLACK}, under ${DRIFT_ALIVE_HI}): Drift ${presetDrift} ${shipped.alives.map((a) => a.toFixed(3)).join(', ')}; Drift 1 ${full.alives.map((a) => a.toFixed(3)).join(', ')}`);
    const last = (r) => r.counts[r.counts.length - 1], stripesPieces = Math.max(...still.counts);
    if (stripesPieces < DRIFT_STILL_PIECES) throw new Error(`the held stripes have ${stripesPieces} pieces; a labyrinth has at least ${DRIFT_STILL_PIECES}`);
    check('the plate glides from stripes toward spots, and the spots end is spots',
      last(shipped) > DRIFT_BREAKS * stripesPieces && last(full) > DRIFT_BREAKS * stripesPieces && last(spots) > DRIFT_BREAKS * stripesPieces,
      `connected pieces of activator (over ${ALIVE_ABOVE}, six reads over the ${DRIFT_RUN} units): stripes held ${still.counts.join(', ')}; Drift ${presetDrift} ${shipped.counts.join(', ')}; Drift 1 ${full.counts.join(', ')}; spots held ${spots.counts.join(', ')} (the last read of each, over ${DRIFT_BREAKS}x the stripes' most, ${stripesPieces})`);
    check('the drifting print has no grey patch, every tile keeps its stripes, at every read',
      shipped.flattest > DRIFT_TILE_KEEPS * still.flattest && full.flattest > DRIFT_TILE_KEEPS * still.flattest,
      `flattest ${TILE}-pixel tile's contrast (standard deviation) over six reads: control ${still.flattest.toFixed(3)}, Drift ${presetDrift} ${shipped.flattest.toFixed(3)} = ${(shipped.flattest / still.flattest).toFixed(2)} of it, Drift 1 ${full.flattest.toFixed(3)} = ${(full.flattest / still.flattest).toFixed(2)} (each over ${DRIFT_TILE_KEEPS}); reads at Drift ${presetDrift}: ${shipped.flats.map((x) => x.toFixed(3)).join(' ')}, at Drift 1: ${full.flats.map((x) => x.toFixed(3)).join(' ')}`);
    check('the grey-patch line can see a patch that sits off its grid (the instrument goes red)',
      drift.instrument.patched < DRIFT_TILE_KEEPS * drift.instrument.clean,
      `the held stripes' last read, flattest tile ${drift.instrument.clean.toFixed(3)}; with one ${TILE}-pixel patch flattened ${TILE / 2} pixels off the tile grid ${drift.instrument.patched.toFixed(3)} = ${(drift.instrument.patched / drift.instrument.clean).toFixed(2)} of it (under ${DRIFT_TILE_KEEPS})`);
    const w0 = wavelength(still.later, drift.N), w1 = wavelength(shipped.later, drift.N), w2 = wavelength(full.later, drift.N);
    check('the drifting print keeps its stripe width',
      Math.abs(w1 / w0 - 1) < DRIFT_WIDTH && Math.abs(w2 / w0 - 1) < DRIFT_WIDTH && w1 > 0.015 && w1 < 0.06,
      `wavelength ${pct(w0)} for the control, ${pct(w1)} at Drift ${presetDrift}, ${pct(w2)} at Drift 1 (within ${DRIFT_WIDTH * 100}% of the control's, and on the plate)`);
    check('Drift 0 ignores the clock', drift.apart === 0,
      `largest difference in the activator after 300 units under clocks 0 and 123.4: ${drift.apart.toExponential(1)} (exactly 0)`);
  }
  /*
    And the wiring, read from the source as the ink's is: the visualizer's
    clock runs on seconds of its own (sixtieths of a second a frame over 60),
    advanced in one place and never on a reading of the sound or of the wall
    clock, since the owner wants the change to go on with no music and
    nothing to move the whole plate with it; the setting is read only while
    the print is on, slewed at TURING_DRIFT_PER_SECOND and never stepped (a
    print that is off starts the next from 0), and the slewed value and that
    clock are what the solver is handed; it
    ships off, and the preset that is the print ships it on (the number read, not just the line).
  */
  {
    const vis = readFileSync(new URL('../src/components/LiquidVisualizer.tsx', import.meta.url), 'utf8');
    const clock = /turingClockRef\.current \+= sixtieths \/ 60;/.test(vis)
      && (vis.match(/turingClockRef\.current\s*[-+*/]?=/g) || []).length === 1;
    const gated = /print0 > 0\s*\?\s*Math\.max\(0,\s*Math\.min\(1,\s*currentSettings\.turingDrift \?\? 0\)\)\s*:\s*0/.test(vis);
    const handed = /g\.stepChemistry\?\.\([^;]*,\s*drift,\s*turingClockRef\.current\);/.test(vis);
    // Slewed: moved toward the setting by at most the rate a second times the frame's share of one,
    // and zeroed with the print, so what the solver is handed is never a step.
    const slewed = /turingDriftRef\.current = print0 > 0\s*\?\s*turingDriftRef\.current \+ Math\.max\(-driftStep, Math\.min\(driftStep, driftWanted - turingDriftRef\.current\)\)\s*:\s*0;/.test(vis)
      && /const driftStep = TURING_DRIFT_PER_SECOND \/ TURING_ITERATIONS_PER_SECOND \* chemIterations;/.test(vis)
      && /const drift = turingDriftRef\.current;/.test(vis)
      // Two writers only: the slew and the reset with the print. A third (a preset load setting
      // the Drift outright) would step it and leave the text above intact.
      && (vis.match(/turingDriftRef\.current\s*=/g) || []).length === 2
      && /endPrint\?\.\(\); turingDriftRef\.current = 0;/.test(vis);
    const defaults = [...typesSrc.matchAll(/^\s*turingDrift: ([0-9.]+),/gm)].map((m) => Number(m[1]));
    const off = defaults.length === 1 && defaults[0] === 0;
    check('the clock runs on seconds, the setting only with the print, off by default and on in the preset',
      clock && gated && handed && slewed && off && presetDrift > 0,
      `clock advanced once, by sixtieths / 60: ${clock}; setting read only while printing: ${gated}; solver handed the setting and the clock: ${handed}; the setting slewed, not stepped: ${slewed}; default ${defaults.join(', ') || 'none'} (one, 0, wanted); the Turing Print preset sets ${presetDrift} (above 0 wanted)`);
  }
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} FAILED` : `\nall ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
