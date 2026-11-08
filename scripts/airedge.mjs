#!/usr/bin/env node
/**
 * The air edge's fingers, on the GPU solver (PLAN 38r-16, scripts/lab.mjs).
 *
 *   npm run airedge -- --owed=rim,front,fingers
 *
 * Written before the build. Each line under an id is printed as owed while
 * what it asks for is absent (the solver has no `readWet`) and is red the
 * day it passes with its id still listed (the convention of `timers.mjs` and
 * `bubbleair.mjs`): the PR that builds 38r-16 takes the ids out of `--owed`
 * in scripts/checks.json and never edits a line or a bar. A build that is
 * there and misses is red, owed or not. The first line, the finger counter
 * on drawn fronts, runs on main too: it is this check's own control.
 *
 * What is asked. The owner's pick (2026-10-31, "Build the air edge now"): a
 * lift faster than the rim's bead can feed draws air in at the rim, and the
 * air is the bubbles' air entering there, never a drawn finger pattern. Air
 * pushing into a viscous liquid between two plates is Saffman and Taylor's
 * instability: the front fingers. In a straight cell the fastest-growing
 * wavelength is
 *
 *     λ_m = π h √(σ / (μ U)),
 *
 * and the marginal one λ_c = λ_m/√3. (PLAN 38r-16 first wrote λ_c for the
 * first of these; the design pass in docs/plan/38-realism-audit.md corrects
 * it.) Round a lifted disc the front of radius r moves in at U = r ḣ/(2h)
 * (the volume kept), and the linear stability of that lifting Hele-Shaw cell
 * (worked in the design pass; Ben Amar and Bonn 2005, Lindner et al. 2005)
 * grows mode n against the shrinking disc at
 *
 *     s_n = n ḣ/(2h) − σ h² n (n² − 1) / (12 μ r³),
 *
 * fastest at n² = (1 + 6 μ r³ ḣ / (σ h³)) / 3, which at large n is
 * 2πr/λ_m with that U. The glass's hand here is a force (lib/cover.ts:
 * coverHand × HAND_PA), and Stefan gives μ ḣ = (2/3) h³ |P̄| / r², so
 *
 *     n_max = √((1 + 4 r |P̄| / σ) / 3),    P̄ = P·A/wet + 2σ cosθ / h,
 *
 * with no μ and no h in it: the same pull fingers water and the thick
 * carrier alike, the thick one more slowly, and a harder pull fingers finer
 * as √|P̄|. That is what the lines hold, because a finger pattern drawn to
 * look right scales with neither, and a solve without the front's in-plane
 * tension runs to the grid's scale. The growth over a lift from h₀ to h₁ is
 * about exp((n/3) ln(h₁/h₀)), so the fingers are read once the liquid has
 * pulled in to 0.6 of the cover (h about 3.3 mm), not at the first step.
 *
 *   1. (control, on main) The finger counter counts: a drawn front of 12
 *      fingers on a 5-finger swell reads 12 and its roughness and air area
 *      to 2%; 30 fingers under a cell of white roughness read 30; a round front reads no roughness; a hole of air in the middle
 *      is not air from the rim.
 *   2. rim: the air comes in at the rim, and only once the bead is empty.
 *      85 mL on the default glass, the thick carrier (Thickness 0.45): the
 *      glass settles and fills the bead; then a pull of hand −0.12. While
 *      the ledger's bead holds liquid there is no air under the glass (under
 *      0.2% of the cover); after it, there is, and it reaches the rim.
 *   3. front: the air under the glass is the ledger's: the field's air area
 *      is A − wet to 5% (and 0.3% of A for the rim's rasterised circle) at
 *      every reading below, and at least 98% of the air is joined to the
 *      rim through air (what pinches off is bubbles, a little).
 *   4. fingers: on a full plate, bead empty, three pulls, each on four
 *      seeds, read on the step the ledger's wet crosses 0.8 and then 0.6 of
 *      the cover: Thickness 0.6 at hand −0.4 (n_max about 30) and at −0.15
 *      (about 15), and Thickness 0.9 at −0.4 (the same n_max as the first,
 *      eight times slower). The seeds' spectra averaged, each pull's
 *      power-weighted mode over n_max/3 to 3·n_max within 0.75 to 1.35 of
 *      n_max, half its power or more within n_max/2 to 2·n_max, that band's
 *      power grown at least twofold from 0.8 to 0.6 of the cover (fingers
 *      grow; a drawn rim does not), and two seeds' fronts correlating under
 *      0.5 (a pattern at a fixed phase would); the hard pull's mode at least
 *      1.5 times the gentle one's; and 0.6 against 0.9 at one pull within
 *      20% of their n_max's ratio (the viscosity does not set the spacing).
 *      Why 0.6 and 0.9 and not 0.45, and why four seeds: the comment above
 *      the runs.
 *
 * What the build must give the lab: `WebGPUFluid.readWet()`, the wet
 * fraction on the solver's N×N grid, row by row from y = 0 (the layout of
 * `readField('vel')`), the ledger's `wet` (lib/cover.ts), and the step's
 * `airSeed` (a whole number seeding the rim's roughness). The front needs a
 * seed, as a real one has: the cover's ground edge is rough at the grid's
 * scale, so the air's inflow at the rim carries a white, seeded
 * perturbation with no wavelength of its own. Water's front at these pulls
 * runs ten to twenty cells a frame, so water is held by the ledger's rates
 * in `npm run gap` 21 and not here; the build substeps the front under a
 * cell a substep in the app and the lab alike.
 *
 * The bars in 4 are the linear theory's, written before any build: if the
 * fingers sit outside them for a physical reason (the nonlinear stage
 * coarsens them), the check is re-aimed by Claude with the measurement
 * printed, never loosened by the build.
 */
import { openLab } from './lab.mjs';
import { build } from 'esbuild';

const IDS = ['rim', 'front', 'fingers'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
/** `mainState`: what the line is owed for is absent, which is the only state an owed line is excused in. */
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
};

const libOut = 'node_modules/.cache/airedge-lib.mjs';
await build({
  stdin: { contents: "export * from './src/lib/cover.ts'; export { thicknessViscosity } from './src/lib/turntable.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: libOut, logLevel: 'warning',
});
const C = await import(`../${libOut}`);
const A = C.COVER_AREA, W_PA = C.weightPressure(C.COVER_GLASS_G), COS60 = Math.cos(Math.PI / 3);

// ── Reading a wet field (1 liquid, 0 air), N×N over the plate, the cover the inscribed disc ──
const sample = (w, n, x, y) => {
  const fx = Math.min(n - 1, Math.max(0, x - 0.5)), fy = Math.min(n - 1, Math.max(0, y - 0.5));
  const i = Math.min(n - 2, Math.floor(fx)), j = Math.min(n - 2, Math.floor(fy)), u = fx - i, v = fy - j;
  return (w[j * n + i] * (1 - u) + w[j * n + i + 1] * u) * (1 - v) + (w[(j + 1) * n + i] * (1 - u) + w[(j + 1) * n + i + 1] * u) * v;
};
/** The front ray by ray: the first radius out from the middle where the wet field falls under a half, in cells (Rc if none). */
function frontOf(w, n, M = 720) {
  const c = n / 2, Rc = n / 2, r = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    const a = (2 * Math.PI * k) / M, ca = Math.cos(a), sa = Math.sin(a);
    let at = Rc;
    for (let q = 0; q <= Rc - 0.5; q += 0.25) if (sample(w, n, c + q * ca, c + q * sa) < 0.5) { at = q; break; }
    r[k] = at;
  }
  return r;
}
/** The front's mean, roughness (std, cells) and the power of each angular mode 1..maxN. */
function modes(r, maxN = 120) {
  const M = r.length, mean = r.reduce((s, v) => s + v, 0) / M;
  const std = Math.sqrt(r.reduce((s, v) => s + (v - mean) ** 2, 0) / M);
  const power = new Float64Array(maxN + 2);
  for (let m = 1; m <= maxN + 1; m++) {
    let re = 0, im = 0;
    for (let k = 0; k < M; k++) { const a = (2 * Math.PI * m * k) / M; re += (r[k] - mean) * Math.cos(a); im += (r[k] - mean) * Math.sin(a); }
    power[m] = re * re + im * im;
  }
  return { mean, std, power };
}
/** The dominant mode from 2 up, by its power and half its two neighbours' (a finger count is not exact to one, and a centred weight keeps a clean mode where it is). */
function dominant(power, maxN = 120) {
  let best = 2, bestP = -1;
  for (let m = 2; m <= maxN; m++) { const p = power[m] + 0.5 * (power[m - 1] + power[m + 1]); if (p > bestP) { bestP = p; best = m; } }
  return best;
}
/** Air under the glass, m²: (1 − w) over the cells inside the cover. */
function airArea(w, n) {
  const c = n / 2, Rc = n / 2, cell = (2 * C.COVER_RADIUS) / n;
  let s = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (Math.hypot(i + 0.5 - c, j + 0.5 - c) < Rc) s += 1 - w[j * n + i];
  return s * cell * cell;
}
/** The share of the air cells (w < 0.5) inside the cover joined to the rim's ring through air. */
function rimJoined(w, n) {
  const c = n / 2, Rc = n / 2, seen = new Uint8Array(n * n), stack = [];
  let air = 0, joined = 0;
  const inside = (i, j) => Math.hypot(i + 0.5 - c, j + 0.5 - c) < Rc;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (!inside(i, j) || w[j * n + i] >= 0.5) continue;
    air++;
    if (Math.hypot(i + 0.5 - c, j + 0.5 - c) >= Rc - 1.5) { seen[j * n + i] = 1; stack.push(j * n + i); }
  }
  while (stack.length) {
    const q = stack.pop(); joined++;
    const i = q % n, j = (q - i) / n;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const p = b * n + a;
      if (!seen[p] && inside(a, b) && w[p] < 0.5) { seen[p] = 1; stack.push(p); }
    }
  }
  return air ? joined / air : 1;
}
/** The fastest mode of a lifted disc under a force (see the header), from the ledger's state. */
function nMax(state, nu, hand) {
  const sig = C.carrierTension(nu), P = W_PA + hand * C.HAND_PA;
  const r = Math.sqrt(state.wet / Math.PI), Pbar = (P * A) / state.wet + (2 * sig * COS60) / state.h;
  return Math.sqrt((1 + (4 * r * Math.abs(Pbar)) / sig) / 3);
}

// 1: the counter on drawn fronts (a smooth one-cell edge, as a sharpened field has).
{
  const n = 192, c = n / 2, Rc = n / 2;
  const draw = (rf) => {
    const w = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i + 0.5 - c, y = j + 0.5 - c, r = Math.hypot(x, y);
      w[j * n + i] = r >= Rc ? 0 : Math.min(1, Math.max(0, 0.5 + rf(Math.atan2(y, x)) - r));
    }
    return w;
  };
  const fingered = draw((a) => 0.75 * Rc + 3 * Math.cos(12 * a + 0.3) + Math.cos(5 * a));
  const round = draw(() => 0.8 * Rc);
  // A thin ring of air from the rim and a hole of air in the middle, about half the ring's: the hole is not the rim's.
  const holed = draw(() => 0.95 * Rc);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (Math.hypot(i + 0.5 - c, j + 0.5 - c) < 20) holed[j * n + i] = 0;
  // And 30 fingers of 1.5 cells under a seeded white roughness of a cell, as a solve's grid gives: still 30.
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const rough = Array.from({ length: 720 }, () => 2 * rnd());
  const noisy = draw((a) => 0.7 * Rc + 1.5 * Math.cos(30 * a) + rough[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 720) % 720]);
  const f = modes(frontOf(fingered, n)), o = modes(frontOf(round, n)), z = dominant(modes(frontOf(noisy, n)).power);
  const cell = (2 * C.COVER_RADIUS) / n;
  // The drawn front's wetted area, ∫ r_f²/2 dφ: (0.75 Rc)² π + (9/2 + 1/2) π cells².
  const wantAir = A - (Math.PI * (0.75 * Rc) ** 2 + Math.PI * 5) * cell * cell, gotAir = airArea(fingered, n);
  const holeShare = rimJoined(holed, n), fingShare = rimJoined(fingered, n);
  check('the finger counter counts: 12 fingers on a 5-finger swell read 12, 30 under a cell of white roughness read 30, their roughness and air area to 2%; a round front is smooth; a hole of air in the middle is not the rim\'s',
    dominant(f.power) === 12 && z === 30 && Math.abs(f.std - Math.sqrt(5)) <= 0.02 * Math.sqrt(5) && Math.abs(gotAir - wantAir) <= 0.02 * wantAir && o.std < 0.3 && fingShare === 1 && holeShare < 0.9,
    `dominant ${dominant(f.power)} (30 under roughness: ${z}), roughness ${f.std.toFixed(3)} cells (√5 = 2.236), air ${(gotAir / A).toFixed(4)} A (drawn ${(wantAir / A).toFixed(4)}); round ${o.std.toFixed(3)}; joined to the rim ${fingShare.toFixed(3)}, with a hole ${holeShare.toFixed(3)}`);
}

// 2–4 on the GPU, once the solver has a wet field.
const { page, close } = await openLab();
try {
  const has = await page.evaluate(async () => { await lab.create(64, 64); return typeof lab.solver().readWet === 'function'; });
  if (!has) {
    const why = 'the solver has no readWet (the air edge is not built)';
    line('rim', 'the air comes in at the rim, and only once the bead is empty', false, why, true);
    line('front', 'the air under the glass is the ledger\'s (A − wet, to 5%) and joined to the rim', false, why, true);
    line('fingers', 'a lift fingers as Saffman–Taylor in a lifted cell: n_max = √((1 + 4r|P̄|/σ)/3) over four seeds, growing, not the same front twice, finer for a harder pull, the same for a thicker liquid', false, why, true);
  } else {
    const N = 192;
    const STILL = { thinGap: 1, gapSpring: 0 };
    const start = async (thickness, ml) => page.evaluate(async ([N, over]) => { await lab.create(N, N); await lab.step(1, over); return lab.coverState(); }, [N, { ...STILL, gapThickness: thickness, liquidMl: ml, coverHand: 0 }]);
    const stepRead = async (over, n = 1, read = false) => page.evaluate(async ([over, n, read]) => { await lab.step(n, over); return { s: lab.coverState(), w: read ? await lab.wet() : null }; }, [over, n, read]);
    const fronts = [];

    // 2: the rim, with a bead first.
    let rimOk = false, rimDetail = '';
    {
      const th = 0.45, nu = C.thicknessViscosity(th);
      await start(th, 85);
      let r = await stepRead({ ...STILL, gapThickness: th, liquidMl: 85, coverHand: 0 }, 20);
      const beadAtLift = r.s.bead;
      let airWithBead = 0, emptiedAt = -1, k = 0, last = null;
      for (; k < 120; k++) {
        r = await stepRead({ ...STILL, gapThickness: th, liquidMl: 85, coverHand: -0.12 }, 1, true);
        const air = airArea(r.w, N) / A;
        if (r.s.bead > 0) airWithBead = Math.max(airWithBead, air);
        else if (emptiedAt < 0) emptiedAt = k;
        last = { ...r, air };
        if (emptiedAt >= 0 && k - emptiedAt >= 20) break;
      }
      const joined = last ? rimJoined(last.w, N) : 0;
      if (last) fronts.push({ name: 'rim run', s: last.s, w: last.w, nu });
      rimOk = beadAtLift > 0 && airWithBead < 0.002 && emptiedAt >= 0 && last.air > 0.005 && joined >= 0.98;
      rimDetail = `bead ${(beadAtLift * 1e6).toFixed(2)} mL at the pull; air while the bead fed ${(airWithBead * 100).toFixed(3)}% of the cover; bead empty after ${emptiedAt} steps; ${k - emptiedAt} steps on, air ${last ? (last.air * 100).toFixed(2) : '—'}% of the cover, ${(joined * 100).toFixed(1)}% joined to the rim`;
    }
    line('rim', 'the air comes in at the rim, and only once the bead is empty', rimOk, rimDetail, false);

    /*
      4's pulls. A white seed's fingers differ seed to seed: one seed read
      alone passes a right build on about 80% of seeds and a build fingering
      at the marginal √3·n_max on 15% (the check-skeptic's model, 20k seeds),
      and the seed is the build's to re-roll. So each pull runs on four seeds
      (the step's `airSeed`), the spectra are averaged, and the mode is the
      power-weighted one over n_max/3 to 3·n_max: modelled, a right build
      passes always and the √3 one never. Each run is read on the step its
      ledger's wet crosses 0.8 of the cover and on the step it crosses 0.6 (h
      about 3.3 mm), never a step late (at Thickness 0.45 that was the
      ceiling); a run that reaches 600 steps without crossing fails.
      Thicknesses 0.6 and 0.9 (63 and 500 mm²/s), not 0.45: the thin solve
      keeps the unsteady term (wgsl/thinGap.ts), and at 0.45 its drag time at
      3.3 mm (41 ms) outlasts the fingers' growth (about 24 ms), so the
      liquid is not yet Darcy's there and n_max is not its prediction.
    */
    const SEEDS = [1, 2, 3, 4];
    const pulls = [];
    for (const [th, hand, name] of [[0.6, -0.4, 'hard'], [0.6, -0.15, 'gentle'], [0.9, -0.4, 'thicker']]) {
      const nu = C.thicknessViscosity(th), runs = [];
      for (const seed of SEEDS) {
        const over = { ...STILL, gapThickness: th, liquidMl: C.COVER_FULL_ML, coverHand: hand, airSeed: seed };
        await start(th, C.COVER_FULL_ML);
        let early = null, late = null, k = 0;
        for (; k < 600 && !late; k++) {
          const r = await stepRead(over);
          if (!early && r.s.wet <= 0.8 * A) early = { s: r.s, w: await page.evaluate(() => lab.wet()) };
          if (r.s.wet <= 0.6 * A) late = { s: r.s, w: await page.evaluate(() => lab.wet()) };
        }
        if (!early || !late) { runs.push({ seed, capped: true, steps: k }); continue; }
        const rf = frontOf(late.w, N);
        runs.push({ seed, steps: k, rf, late: modes(rf).power, early: modes(frontOf(early.w, N)).power, s: late.s, want: nMax(late.s, nu, hand) });
        if (seed === SEEDS[0]) fronts.push({ name: `Thickness ${th} at ${hand}`, s: late.s, w: late.w, nu });
      }
      const ok = runs.filter((r) => !r.capped);
      if (ok.length < SEEDS.length) { pulls.push({ name, th, hand, nu, capped: true, steps: runs.map((r) => r.steps) }); continue; }
      const want = ok.reduce((t, r) => t + r.want, 0) / ok.length;
      const mean = (key) => { const p = new Float64Array(122); for (const r of ok) for (let m = 0; m < p.length; m++) p[m] += (r[key][m] ?? 0) / ok.length; return p; };
      const late = mean('late'), early = mean('early');
      const sum = (p, lo, hi) => { let t = 0; for (let m = Math.max(2, Math.ceil(lo)); m <= Math.min(120, Math.floor(hi)); m++) t += p[m]; return t; };
      let num = 0, den = 0;
      for (let m = Math.max(2, Math.ceil(want / 3)); m <= Math.min(120, Math.floor(3 * want)); m++) { num += m * late[m]; den += late[m]; }
      const mode = den > 0 ? num / den : 0;
      const share = sum(late, want / 2, 2 * want) / Math.max(1e-30, sum(late, 2, 120));
      const growth = sum(late, want / 2, 2 * want) / Math.max(1e-30, sum(early, want / 2, 2 * want));
      // Two seeds' fronts at the same stage: a pattern drawn at a fixed phase would correlate.
      const [a, b] = [ok[0].rf, ok[1].rf], ma = a.reduce((t, v) => t + v, 0) / a.length, mb = b.reduce((t, v) => t + v, 0) / b.length;
      let ab = 0, aa = 0, bb = 0;
      for (let k = 0; k < a.length; k++) { ab += (a[k] - ma) * (b[k] - mb); aa += (a[k] - ma) ** 2; bb += (b[k] - mb) ** 2; }
      const corr = ab / Math.sqrt(Math.max(1e-30, aa * bb));
      pulls.push({ name, th, hand, nu, want, mode, share, growth, corr, steps: ok.map((r) => r.steps), s: ok[0].s });
    }

    // 3: every reading's air against the ledger.
    const rows = fronts.map((f) => {
      const air = airArea(f.w, N), want = A - f.s.wet, joined = rimJoined(f.w, N);
      return { ok: Math.abs(air - want) <= 0.05 * want + 0.003 * A && joined >= 0.98, text: `${f.name}: air ${(air / A).toFixed(4)} A against A − wet ${(want / A).toFixed(4)}, ${(joined * 100).toFixed(1)}% joined` };
    });
    line('front', 'the air under the glass is the ledger\'s (A − wet, to 5%) and joined to the rim', rows.every((x) => x.ok), rows.map((x) => x.text).join('; '), false);

    const [hard, gentle, thicker] = pulls;
    const done = pulls.every((p) => !p.capped);
    const each = done && pulls.every((p) => p.mode >= 0.75 * p.want && p.mode <= 1.35 * p.want && p.share >= 0.5 && p.growth >= 2 && p.corr < 0.5);
    const finer = done && hard.mode >= 1.5 * gentle.mode;
    const same = done && Math.abs(hard.mode / thicker.mode / (hard.want / thicker.want) - 1) <= 0.2;
    line('fingers', 'a lift fingers as Saffman–Taylor in a lifted cell: n_max = √((1 + 4r|P̄|/σ)/3) over four seeds, growing, not the same front twice, finer for a harder pull, the same for a thicker liquid',
      each && finer && same,
      `${pulls.map((p) => (p.capped ? `Thickness ${p.th} at ${p.hand}: never reached 0.6 of the cover (steps ${p.steps.join('/')})`
        : `Thickness ${p.th} (${(p.nu * 1e6).toFixed(0)} mm²/s) at ${p.hand}: steps ${p.steps.join('/')}, wet ${(p.s.wet / A).toFixed(3)} A at ${(p.s.h * 1000).toFixed(3)} mm, mode ${p.mode.toFixed(1)} against n_max ${p.want.toFixed(1)}, band share ${p.share.toFixed(2)}, grew ×${p.growth.toFixed(1)} in power from 0.8 A, two seeds' fronts correlate ${p.corr.toFixed(2)}`)).join('; ')}${done ? `; hard over gentle ${(hard.mode / gentle.mode).toFixed(2)}, 0.6 over 0.9 at one pull ${(hard.mode / thicker.mode).toFixed(2)} (n_max's ${(hard.want / thicker.want).toFixed(2)})` : ''}`,
      false);
  }
} finally {
  await close();
}

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed (owed lines printed as owed)`);
process.exit(failed ? 1 : 0);
