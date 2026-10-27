#!/usr/bin/env node
/**
 * Heat the performer rides: the lamp warms the dish where it is hottest, warm
 * liquid flows by its real density, and the dish boils while the heat is held
 * and goes quiet when it is let go (PLAN 36e, roadmap S2).
 *
 *   npm run boil (node only: src/lib/lampBoil.ts, the CPU reference)
 *
 * The operators' accounts (PLAN §36) name heat as a stroke: "we deliberately
 * blocked the air stream when we needed heat to propagate bubbles". The plate
 * has a unitless temperature and no boiling at all. PLAN 36e builds it as a
 * CPU reference first, held to this check, so the GPU build (the brief in the
 * project's shared files) is held to a model that is itself held to physics,
 * not to whatever the GPU happens to draw. Every expected number below is
 * worked out here from the plate's stated options and the textbook formulas
 * (Kell's density, Vogel's viscosity, Hsu's superheat, the exact Darcy
 * inclusion), typed again in this file rather than imported, so a model with
 * the wrong formula cannot agree with itself.
 *
 *   H1  The lamp heats where it is hottest. The first microsecond's warming of
 *       every cell is the lamp's Gaussian hot spot (moved off the grid's centre)
 *       times the absorbed fraction 1 − exp(−(κ_IR·d + A_dye)), over the heat
 *       capacity of the liquid and both glasses, to 1e-6 of the hottest cell's;
 *       the hottest cell of a clear dish is the lamp's centre; a dye patch of
 *       absorbance 1.5 warms faster than clear water under the same light by
 *       the ratio of their absorbed fractions.
 *   H2  Heat has a strength (S2's blocker). The Heat dial at 0.5 warms by half
 *       what it does at 1, and at 0 the dish does not warm at all and not one
 *       face moves.
 *   H3  The air cools it, a hand that blocks the air keeps it hot, and the heat
 *       spreads sideways. A uniformly warm dish with the lamp off cools as
 *       Newton's law with the fan's h over the dish's heat capacity (within
 *       0.5% at the middle over 10 s), and under a held hand as natural
 *       convection's h; a Gaussian warm bump with no air keeps its heat and its
 *       peak falls as σ0²/(σ0² + 2Dt), D the water's and glasses' conduction
 *       over their heat capacity (within 3% over 40 s).
 *   H4  Warm liquid has no "up" on a level plate, and rises on an upright one
 *       with the strength of its density. A 70 °C patch on a level plate does
 *       not move (its warmth's centroid within 0.05 cells over 5 s, either
 *       way); upright it rises more than 3 cells. Its first speed at 40 °C and
 *       at 70 °C is the exact speed of a buoyant circular inclusion in a
 *       Hele-Shaw cell open at the rim, u = f·M_in·M_out·k / (M_in + M_out·k)
 *       with k = (1 + a²/R²)/(1 − a²/R²), f = (ρ(20) − ρ(T))·g and
 *       M = d²/12μ(T), within 5% each (the grid's staircase circle), and the
 *       ratio of the two within 3%: water's real density makes it 4.07 times,
 *       where a constant expansion slope says 3.0 and a saturated one 1.2.
 *   H5  Volume is accounted. Every cell's face flows add up to the volume
 *       source the step asked for (warming water's expansion and boiling's
 *       vapour), to 1e-6 of the largest source, on every step of the boils;
 *       and over five minutes of warming, what flows out of the rim is the
 *       volume Kell's density says the dish's water grew by, within 2%.
 *   H6  A bubble needs its superheat. Every site's superheat is Hsu's
 *       2σT_sat/(ρ_v·L·r) for a cavity drawn from the stated log-normal (the
 *       median within 10%, the log spread within 10%, the share of cells with
 *       a site within three binomial σ); a dish held at 98% of each site's
 *       superheat makes no bubble, at 102% every site and no other cell makes
 *       one, and a cell with no site does not boil at 130 °C.
 *   H7  The fan alone keeps the dish under the boil. On a dish where the lamp
 *       at full is balanced by the fan below 100 °C, five minutes of it make no
 *       bubble, its hottest point is the radial heat balance's (a finite-volume
 *       solve written here, within 1% of the rise), and until it boils heat
 *       moves a level plate only by warming water's expansion (no face ever
 *       faster than 10 µm/s: no whole-plate flow).
 *   H8  Block the air and it boils there, holding near 100 °C. A bubble's rim
 *       boils superheated liquid and condenses into subcooled liquid at
 *       h_i·2√(πα)·d/dx per kelvin, both in heat and in steam (to 1e-3, on a
 *       dish and reservoir at 103 °C and at 97 °C). A hand held over the dish,
 *       off the lamp's centre, boils it within a minute; every bubble starts
 *       under the hand and none at the hotter lamp's centre beside it; and from
 *       5 s into the boil until the hand lifts, no site without vapour is
 *       hotter than its own superheat allows and nothing under the hand is
 *       hotter than 100 °C plus the widest site's superheat (a reference
 *       without latent heat runs away past any bound).
 *   H9  Let go and it calms. Within 5 s of lifting the hand the vapour is
 *       under 1% of its peak, within 10 s the fastest face is under 2% of the
 *       boil's, and for the next 20 s no bubble starts again. These are the
 *       performer's bars (calm while the next stroke is chosen), not the
 *       physics': how fast it calms depends on h_i, one coefficient the model
 *       names as a shortcut, and H8 holds the exchange to it.
 *   H10 The Heat dial does the same. On a hotter lamp the dial at 0.5 makes no
 *       bubble in two minutes, at 1 it boils within a minute, and back at 0
 *       the vapour is under 1% of its peak within 5 s.
 *   H11 Vapour rises on an upright plate. A pocket of steam in a dish and
 *       reservoir both at 100 °C (so nothing else is buoyant and nothing boils
 *       or condenses) rises more than 2 cells in a second upright, and moves
 *       less than 0.05 cells on the level plate.
 *
 * A bar is never moved to get green. If the model cannot reach one, say what
 * it reached in the PR and ask.
 *
 * Until src/lib/lampBoil.ts exists this prints that and exits 1: on main
 * before PLAN 36e the dish cannot boil, and this is the line that says so.
 */
import { build } from 'esbuild';
import { existsSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const modulePath = process.env.BOIL_MODULE || 'src/lib/lampBoil.ts';
if (!existsSync(modulePath)) {
  console.log(` FAIL ${modulePath} does not exist: the dish has no boiling (PLAN 36e builds it; this check is what it is built against)`);
  console.log('\n0/1 checks passed');
  process.exit(1);
}
const out = 'node_modules/.cache/lamp-boil.mjs';
await build({
  stdin: { contents: `export * from './${modulePath}';`, resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const M = await import(`../${out}?${Date.now()}`);
for (const name of ['createBoilPlate', 'stepBoilPlate']) {
  if (typeof M[name] !== 'function') { console.log(` FAIL the module must export ${name}()`); process.exit(1); }
}
const { createBoilPlate, stepBoilPlate } = M;

/*
  The contract (PLAN 36e): createBoilPlate(options) returns a plate with
  n, dx, width, inside (1 a dish cell), T (°C), alpha (vapour fraction), dye
  (absorbance, settable), dTnuc (each cell's superheat, Infinity for none),
  u ((n+1)×n x faces, m/s), v (n×(n+1) y faces, +y down), source (1/s),
  time and nucleations [{cell, t}]. stepBoilPlate(plate, dt, {heat, holds,
  tilt, g}) advances it. Row 0 is the top; on an upright plate gravity is +y.
*/

// The textbook, typed again.
const kell = (t) => (999.83952 + 16.945176 * t - 7.9870401e-3 * t * t - 46.170461e-6 * t ** 3
  + 105.56302e-9 * t ** 4 - 280.54253e-12 * t ** 5) / (1 + 16.879850e-3 * t);
const vogel = (t) => 2.414e-5 * 10 ** (247.8 / (t + 273.15 - 140));
const hsu = (r) => (2 * 0.0589 * 373.15) / (0.598 * 2.257e6 * r);
const RHO_C = 4.18e6, RHO_C_GLASS = 2500 * 840;

const cellXY = (P, k) => [((k % P.n) + 0.5) * P.dx - P.width / 2, (((k / P.n) | 0) + 0.5) * P.dx - P.width / 2];
const vapour = (P) => { let s = 0; for (let k = 0; k < P.n * P.n; k++) s += P.alpha[k]; return s * P.dx * P.dx; };
const fastest = (P) => { let m = 0; for (const w of P.u) m = Math.max(m, Math.abs(w)); for (const w of P.v) m = Math.max(m, Math.abs(w)); return m; };
const run = (P, seconds, ctl, dt = 0.1, each) => {
  const steps = Math.round(seconds / dt);
  for (let s = 0; s < steps; s++) { stepBoilPlate(P, dt, ctl); if (each) each(P); }
};
// ── H1, H2: the lamp ─────────────────────────────────────────────────────
{
  const opts = { n: 48, gap: 0.5e-3, glass: 1e-3, lampIrradiance: 20000, lampWidth: 0.015,
    lampCentre: [0.012, -0.006], kappaIR: 600, hForced: 50 };
  const mk = () => {
    const P = createBoilPlate(opts);
    for (let k = 0; k < P.n * P.n; k++) {
      const [x, y] = cellXY(P, k);
      if (Math.hypot(x + 0.02, y - 0.01) < 0.008) P.dye[k] = 1.5;
    }
    return P;
  };
  // A microsecond: the expansion's flow carries the warmth within a step, a change
  // second order in the step (1e-4 of the warming at 0.05 s, 2e-9 here), and the air's
  // loss within the step is dt·h/C of it (1.2e-8 here), whichever way a solver steps it.
  const dt = 1e-6;
  const C = RHO_C * opts.gap + RHO_C_GLASS * opts.glass;
  const expect = (P, k, heat) => {
    const [x, y] = cellXY(P, k);
    const I = opts.lampIrradiance * Math.exp(-((x - opts.lampCentre[0]) ** 2 + (y - opts.lampCentre[1]) ** 2) / (2 * opts.lampWidth ** 2));
    const a = 1 - Math.exp(-(opts.kappaIR * opts.gap + P.dye[k]));
    return (dt * heat * I * a) / C;
  };
  const P1 = mk(); stepBoilPlate(P1, dt, { heat: 1 });
  const P5 = mk(); stepBoilPlate(P5, dt, { heat: 0.5 });
  const P0 = mk(); stepBoilPlate(P0, dt, { heat: 0 });
  // Errors are taken against the hottest cell's warming: at the dish's edge the lamp is
  // e⁻⁸ of its centre, and a microsecond's warming there is under the rounding of 20 °C.
  let worst = 0, worstHalf = 0, hottest = -1, hot = -Infinity, still = 0, peak = 0;
  for (let k = 0; k < P1.n * P1.n; k++) if (P1.inside[k]) peak = Math.max(peak, expect(P1, k, 1));
  for (let k = 0; k < P1.n * P1.n; k++) {
    if (!P1.inside[k]) continue;
    const e = expect(P1, k, 1), got = P1.T[k] - 20;
    worst = Math.max(worst, Math.abs(got - e) / peak);
    worstHalf = Math.max(worstHalf, Math.abs((P5.T[k] - 20) - 0.5 * got) / peak);
    still = Math.max(still, Math.abs(P0.T[k] - 20));
  }
  // The hottest cell of a clear dish.
  const Pc = createBoilPlate(opts); stepBoilPlate(Pc, dt, { heat: 1 });
  for (let k = 0; k < Pc.n * Pc.n; k++) if (Pc.inside[k] && Pc.T[k] > hot) { hot = Pc.T[k]; hottest = k; }
  const [hx, hy] = cellXY(Pc, hottest);
  const off = Math.hypot(hx - opts.lampCentre[0], hy - opts.lampCentre[1]) / Pc.dx;
  check('H1 the first step warms each cell by the lamp × its absorbed fraction over the heat capacity', worst < 1e-6, `worst ${worst.toExponential(2)} of the hottest cell's (bar 1e-6)`);
  check('H1 the hottest cell of a clear dish is the lamp\'s centre, not the grid\'s', off <= 0.75, `${off.toFixed(2)} cells from the lamp's centre (bar 0.75)`);
  let kd = -1;
  for (let k = 0; k < P1.n * P1.n && kd < 0; k++) {
    const [x, y] = cellXY(P1, k);
    if (P1.dye[k] > 0 && Math.hypot(x + 0.02, y - 0.01) < P1.dx) kd = k;
  }
  const ratio = (P1.T[kd] - 20) / (Pc.T[kd] - 20);
  const want = (1 - Math.exp(-(600 * opts.gap + 1.5))) / (1 - Math.exp(-(600 * opts.gap)));
  check('H1 dark dye warms faster than clear water in the same light, by the ratio of what each absorbs', Math.abs(ratio / want - 1) < 1e-6, `${ratio.toFixed(4)}×, Beer–Lambert ${want.toFixed(4)}×`);
  check('H2 the Heat dial at 0.5 warms by half of what it does at 1', worstHalf < 1e-6, `worst ${worstHalf.toExponential(2)} off half (bar 1e-6)`);
  check('H2 at 0 the dish does not warm and nothing moves', still < 1e-12 && fastest(P0) === 0, `${still.toExponential(2)} K, fastest face ${fastest(P0)} m/s`);
}

// ── H3: the air, and a hand that blocks it ──────────────────────────────
{
  const opts = { n: 48, gap: 0.5e-3, glass: 1e-3, hForced: 50, hNatural: 10 };
  const P = createBoilPlate(opts);
  for (let k = 0; k < P.n * P.n; k++) if (P.inside[k]) P.T[k] = 60;
  const C = RHO_C * opts.gap + RHO_C_GLASS * opts.glass;
  const hold = { x: 0.015, y: 0, r: 0.012 };
  run(P, 10, { heat: 0, holds: [hold] });
  const pick = (x, y) => Math.floor((y + P.width / 2) / P.dx) * P.n + Math.floor((x + P.width / 2) / P.dx);
  const fan = P.T[pick(-0.015, 0)] - 20, held = P.T[pick(0.015, 0)] - 20;
  const wantFan = 40 * Math.exp((-opts.hForced * 10) / C), wantHeld = 40 * Math.exp((-opts.hNatural * 10) / C);
  check('H3 with the lamp off a warm dish cools by Newton\'s law at the fan\'s h', Math.abs(fan / wantFan - 1) < 0.005, `${fan.toFixed(3)} K over the room, Newton ${wantFan.toFixed(3)}`);
  check('H3 under a held hand it cools at natural convection\'s h', Math.abs(held / wantHeld - 1) < 0.005, `${held.toFixed(3)} K, Newton ${wantHeld.toFixed(3)}`);
}
{
  // H3: heat spreads sideways through the water and both glasses. A Gaussian warm bump
  // with no air and no lamp keeps its heat and spreads as the heat equation says: its
  // peak falls as σ0²/(σ0² + 2Dt), D = (k_w·d + k_g·t)/(ρc_w·d + ρc_g·t).
  const opts = { n: 48, gap: 0.5e-3, glass: 1e-3, hForced: 0, hNatural: 0 };
  const P = createBoilPlate(opts);
  const s0 = 3 * P.dx;
  const c = (P.n / 2) * P.n + P.n / 2;
  const [cx, cy] = cellXY(P, c);
  for (let k = 0; k < P.n * P.n; k++) { const [x, y] = cellXY(P, k); if (P.inside[k]) P.T[k] = 20 + 10 * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s0 * s0)); }
  run(P, 40, { heat: 0 }, 0.1);
  const D = (0.6 * opts.gap + 1.0 * opts.glass) / (RHO_C * opts.gap + RHO_C_GLASS * opts.glass);
  const want = 10 * s0 * s0 / (s0 * s0 + 2 * D * 40);
  const got = P.T[c] - 20;
  check('H3 heat spreads sideways through the water and the glass as the heat equation says', Math.abs(got / want - 1) < 0.03, `peak ${got.toFixed(3)} K after 40 s, the heat equation ${want.toFixed(3)} K (10 K at the start)`);
}

// ── H4: buoyancy on a level and an upright plate ────────────────────────
{
  const n = 96, width = 0.1, gap = 1e-3;
  const a = 10 * (width / n);           // the patch's radius
  const R = 0.45 * width;
  const patch = (T) => {
    const P = createBoilPlate({ n, width, gap });
    for (let k = 0; k < n * n; k++) { const [x, y] = cellXY(P, k); if (Math.hypot(x, y) < a) P.T[k] = T; }
    return P;
  };
  const centroid = (P) => { let sx = 0, sy = 0, w = 0; for (let k = 0; k < n * n; k++) { const e = P.T[k] - 20; if (e > 0) { const [x, y] = cellXY(P, k); sx += e * x; sy += e * y; w += e; } } return [sx / w, sy / w]; };
  const exact = (T) => {
    const f = (kell(20) - kell(T)) * 9.81;
    const Mi = gap * gap / (12 * vogel(T)), Mo = gap * gap / (12 * vogel(20));
    const eps = (a * a) / (R * R), kk = (1 + eps) / (1 - eps);
    return (f * Mi * Mo * kk) / (Mi + Mo * kk);
  };
  const first = (T) => {
    const P = patch(T);
    stepBoilPlate(P, 1e-4, { heat: 0, tilt: Math.PI / 2 });
    const c = (n / 2) * n + n / 2;      // the face above the centre cell
    return -P.v[c];                      // upward is −y
  };
  const u40 = first(40), u70 = first(70);
  const e40 = exact(40), e70 = exact(70);
  check('H4 a 40 °C patch on an upright plate rises at the exact inclusion speed', Math.abs(u40 / e40 - 1) < 0.05, `${(u40 * 1000).toFixed(3)} mm/s, exact ${(e40 * 1000).toFixed(3)}`);
  check('H4 a 70 °C patch rises at the exact inclusion speed', Math.abs(u70 / e70 - 1) < 0.05, `${(u70 * 1000).toFixed(3)} mm/s, exact ${(e70 * 1000).toFixed(3)}`);
  check('H4 heat has a strength: 70 °C over 40 °C by water\'s real density and viscosity', Math.abs((u70 / u40) / (e70 / e40) - 1) < 0.03, `${(u70 / u40).toFixed(3)}×, exact ${(e70 / e40).toFixed(3)}× (a constant slope gives 2.5×, a saturated one 1×)`);
  const L = patch(70), U = patch(70);
  const [x0, y0] = centroid(L);
  run(L, 5, { heat: 0, tilt: 0 }, 0.05);
  run(U, 5, { heat: 0, tilt: Math.PI / 2 }, 0.05);
  const [lx, ly] = centroid(L), [, uy] = centroid(U);
  const dl = Math.hypot(lx - x0, ly - y0) / L.dx, du = (y0 - uy) / U.dx;
  check('H4 on a level plate warm liquid has no "up": the patch stays where it is', dl < 0.05, `moved ${dl.toFixed(4)} cells in 5 s (bar 0.05)`);
  check('H4 on an upright plate it rises', du > 3, `rose ${du.toFixed(2)} cells in 5 s (bar 3)`);
}

// ── H6: the threshold ───────────────────────────────────────────────────
{
  const rc = 5e-6;
  const mk = (frac) => {
    const P = createBoilPlate({ n: 48, cavityRadius: rc, cavitySpread: 0.3, siteFraction: 0.3, hForced: 0, hNatural: 0, seed: 7 });
    for (let k = 0; k < P.n * P.n; k++) if (P.inside[k]) P.T[k] = Number.isFinite(P.dTnuc[k]) ? 100 + frac * P.dTnuc[k] : 130;
    return P;
  };
  const P = mk(1);
  const sup = [];
  for (let k = 0; k < P.n * P.n; k++) if (Number.isFinite(P.dTnuc[k])) sup.push(P.dTnuc[k]);
  sup.sort((x, y) => x - y);
  const med = sup[sup.length >> 1];
  let cells = 0;
  for (let k = 0; k < P.n * P.n; k++) cells += P.inside[k];
  const lns = sup.map(Math.log), mln = lns.reduce((a, b) => a + b, 0) / lns.length;
  const sdln = Math.sqrt(lns.reduce((a, b) => a + (b - mln) ** 2, 0) / (lns.length - 1));
  const frac = sup.length / cells, fracSd = Math.sqrt((0.3 * 0.7) / cells);
  check('H6 each site\'s superheat is Hsu\'s for its cavity: the median at the median cavity', Math.abs(med / hsu(rc) - 1) < 0.1, `${sup.length} sites, median ${med.toFixed(2)} K, Hsu at ${rc * 1e6} µm ${hsu(rc).toFixed(2)} K`);
  // ln ΔT = const − ln r, so the superheats' log spread is the cavities' (a sample of
  // ~450: its standard error about 3.4%).
  check('H6 the sites\' superheats spread as the cavities do: the log spread is the stated one', Math.abs(sdln / 0.3 - 1) < 0.1, `σ(ln ΔT) ${sdln.toFixed(3)}, cavities' 0.3`);
  check('H6 the share of cells with a site is the stated one, within three binomial σ', Math.abs(frac - 0.3) < 3 * fracSd, `${sup.length} of ${cells} cells, ${frac.toFixed(3)} (0.3 ± ${(3 * fracSd).toFixed(3)})`);
  const under = mk(0.98); stepBoilPlate(under, 1e-4, {});
  const over = mk(1.02); stepBoilPlate(over, 1e-4, {});
  const born = new Set(over.nucleations.map((e) => e.cell));
  let missed = 0, stray = 0;
  for (let k = 0; k < over.n * over.n; k++) {
    if (!over.inside[k]) continue;
    const site = Number.isFinite(over.dTnuc[k]);
    if (site && !born.has(k)) missed++;
    if (!site && born.has(k)) stray++;
  }
  check('H6 at 98% of each site\'s superheat no bubble starts', under.nucleations.length === 0 && vapour(under) === 0, `${under.nucleations.length} started`);
  check('H6 at 102% every site starts one, and no cell without a site does at 130 °C', missed === 0 && stray === 0 && born.size === sup.length, `${born.size} of ${sup.length} sites, ${stray} without a site`);
}

{
  // H8: the bubble's rim, both ways. A dish and reservoir at 103 °C (or 97 °C), with no air,
  // no lamp and vapour at α = 0.3 in every cell, so nothing differs from cell to cell but
  // at the rim: the middle's first step boils (or condenses) at G = h_i·2√(πα)·d/dx per
  // kelvin over the heat capacity, and makes (or loses) that heat's volume of steam.
  const rim = (T) => {
    const o = { n: 32, gap: 0.5e-3, glass: 1e-3, ambient: T, hForced: 0, hNatural: 0, interfaceH: 1e4 };
    const P = createBoilPlate(o);
    for (let k = 0; k < P.n * P.n; k++) if (P.inside[k]) P.alpha[k] = 0.3;
    const dt = 1e-5, c = (P.n / 2) * P.n + P.n / 2;   // short: the carry within a step is second order
    stepBoilPlate(P, dt, { heat: 0 });
    const G = o.interfaceH * 2 * Math.sqrt(Math.PI * 0.3) * (o.gap / P.dx);
    const C = 0.7 * RHO_C * o.gap + RHO_C_GLASS * o.glass;
    const dT = -dt * G * (T - 100) / C, dA = dt * G * (T - 100) / (0.598 * 2.257e6 * o.gap);
    // The steam made pushes the mixture out of the cell, the cell's own vapour with it:
    // ∂α/∂t = Γ − α∇·u with ∇·u = Γ(1 − ρ_v/ρ_l), so a cell keeps 1 − α(1 − ρ_v/ρ_l) of it.
    const keep = 1 - 0.3 * (1 - 0.598 / kell(100));
    return { t: (P.T[c] - T) / dT, a: (P.alpha[c] - 0.3) / (dA * keep) };
  };
  const hot = rim(103), cold = rim(97);
  const near = (x) => Math.abs(x - 1) < 1e-3;
  check('H8 superheated liquid boils into a bubble at its rim\'s exchange: the heat it loses and the steam it makes', near(hot.t) && near(hot.a), `${hot.t.toFixed(5)} and ${hot.a.toFixed(5)} of h_i·2√(πα)·d/dx·ΔT (bar 1e-3)`);
  check('H8 subcooled liquid condenses it the same way, giving the heat back', near(cold.t) && near(cold.a), `${cold.t.toFixed(5)} and ${cold.a.toFixed(5)}`);
}

// ── H5, H7, H8, H9, H11: the dish the hand boils ────────────────────────
const DISH = { n: 48, gap: 0.5e-3, glass: 1e-3, lampIrradiance: 15000, lampWidth: 0.02,
  hForced: 50, hNatural: 10, cavityRadius: 5e-6, cavitySpread: 0.3, siteFraction: 0.3, interfaceH: 1e4, seed: 3 };
// The hand off the lamp's centre, so that "under the hand" is not "at the hot spot".
const HAND = { x: 0.015, y: 0, r: 0.012 };
let divWorst = 0, divSteps = 0;
const divergence = (P) => {
  const n = P.n;
  let smax = 0, e = 0;
  for (let k = 0; k < n * n; k++) if (P.inside[k]) smax = Math.max(smax, Math.abs(P.source[k]));
  for (let k = 0; k < n * n; k++) {
    if (!P.inside[k]) continue;
    const i = k % n, j = (k / n) | 0;
    const div = (P.u[j * (n + 1) + i + 1] - P.u[j * (n + 1) + i] + P.v[(j + 1) * n + i] - P.v[j * n + i]) / P.dx;
    e = Math.max(e, Math.abs(div - P.source[k]));
  }
  if (smax > 0) { divWorst = Math.max(divWorst, e / smax); divSteps++; }
};
{
  const P = createBoilPlate(DISH);
  let tmax = 0, pushed = 0, levelSpeed = 0;
  run(P, 300, { heat: 1 }, 0.1, (Q) => {
    const n = Q.n;
    levelSpeed = Math.max(levelSpeed, fastest(Q));
    for (let k = 0; k < n * n; k++) {
      if (!Q.inside[k]) continue;
      tmax = Math.max(tmax, Q.T[k]);
      const i = k % n, j = (k / n) | 0;
      pushed += (Q.u[j * (n + 1) + i + 1] - Q.u[j * (n + 1) + i] + Q.v[(j + 1) * n + i] - Q.v[j * n + i]) * Q.dx * 0.1;
    }
  });
  // What leaves the rim is what the water grew by, per unit depth, by Kell. Through a
  // fixed cell a warming liquid's flow out adds up to ln(ρ0/ρ1) of the cell (the rate is
  // −d ln ρ/dt); ρ0/ρ1 − 1 would be the original water's growth measured at the final
  // density, 1.9% more at 97 °C.
  let grew = 0;
  for (let k = 0; k < P.n * P.n; k++) if (P.inside[k]) grew += Math.log(kell(20) / kell(P.T[k])) * P.dx * P.dx;
  check('H7 the lamp at full with the fan blowing warms the dish for five minutes and never boils it', P.nucleations.length === 0 && tmax < 100, `${P.nucleations.length} bubbles, hottest ${tmax.toFixed(2)} °C`);
  check('H5 warming water pushes out of the rim the volume its density says it grew by', Math.abs(pushed / grew - 1) < 0.02, `${(pushed * 1e6).toFixed(3)} against ${(grew * 1e6).toFixed(3)} mm² per unit depth (bar 2%)`);
  // The same five minutes as a radial problem, written here: C ∂T/∂t = (1/r)∂r(K r ∂r T)
  // − h(T − 20) + q(r), held at 20 °C at the rim, by finite volumes on 300 rings. The
  // grid's hottest cells sit dx/√2 from the lamp's centre (a corner of four cells).
  {
    const R0 = 0.45 * 0.1, N = 300, dr = R0 / N;
    const K = 0.6 * DISH.gap + 1.0 * DISH.glass, C = RHO_C * DISH.gap + RHO_C_GLASS * DISH.glass;
    const a = 1 - Math.exp(-600 * DISH.gap);
    const T = new Float64Array(N).fill(20), q = new Float64Array(N);
    for (let i = 0; i < N; i++) { const r = (i + 0.5) * dr; q[i] = DISH.lampIrradiance * a * Math.exp(-(r * r) / (2 * DISH.lampWidth ** 2)); }
    const ddt = 0.2 * dr * dr * C / K;
    const steps = Math.ceil(300 / ddt), h = 300 / steps;
    const F = new Float64Array(N + 1);
    for (let s = 0; s < steps; s++) {
      for (let i = 1; i < N; i++) F[i] = K * i * dr * (T[i] - T[i - 1]) / dr;
      F[N] = K * R0 * (20 - T[N - 1]) / (dr / 2);
      for (let i = 0; i < N; i++) T[i] += (h / C) * ((F[i + 1] - F[i]) / ((i + 0.5) * dr * dr) - DISH.hForced * (T[i] - 20) + q[i]);
    }
    const rr = (P.dx / Math.SQRT2) / dr - 0.5, i0 = Math.floor(rr), fr = rr - i0;
    const want = T[i0] * (1 - fr) + T[i0 + 1] * fr;
    check('H7 the dish\'s hottest point after five minutes is the radial heat balance\'s', Math.abs((tmax - 20) / (want - 20) - 1) < 0.01, `${tmax.toFixed(2)} °C, the radial solve ${want.toFixed(2)} °C (bar 1% of the rise)`);
  }
  check('H7 before it boils heat moves a level plate only by its expansion (no whole-plate flow)', levelSpeed < 1e-5, `fastest face ${(levelSpeed * 1e6).toFixed(3)} µm/s (bar 10)`);

  // Hold the hand over the dish, off the lamp's centre.
  const t0 = P.time;
  let first = -1, peakV = 0, peakU = 0, hotLiquid = 0, overSite = -Infinity;
  const siteMax = Math.max(...Array.from(P.dTnuc).filter(Number.isFinite));
  run(P, 60, { heat: 1, holds: [HAND] }, 0.1, (Q) => {
    divergence(Q);
    if (first < 0 && Q.nucleations.length) { first = Q.time; }
    if (first >= 0) {
      peakV = Math.max(peakV, vapour(Q)); peakU = Math.max(peakU, fastest(Q));
      if (Q.time - first > 5) for (let k = 0; k < Q.n * Q.n; k++) {
        if (!Q.inside[k]) continue;
        const [x, y] = cellXY(Q, k);
        const a = Q.alpha[k];
        if (a === 0 && Number.isFinite(Q.dTnuc[k])) {
          overSite = Math.max(overSite, Q.T[k] - (100 + Q.dTnuc[k]));
        }
        if (Math.hypot(x - HAND.x, y - HAND.y) < HAND.r) hotLiquid = Math.max(hotLiquid, Q.T[k]);
      }
    }
  });
  const strays = P.nucleations.filter((e) => { const [x, y] = cellXY(P, e.cell); return Math.hypot(x - HAND.x, y - HAND.y) > HAND.r + P.dx; });
  check('H8 a hand that blocks the air boils it within a minute', first > 0 && first - t0 < 60, first > 0 ? `first bubble ${(first - t0).toFixed(1)} s after the hand` : 'no bubble');
  const atLamp = P.nucleations.filter((e) => Math.hypot(...cellXY(P, e.cell)) < 2 * P.dx);
  check('H8 every bubble starts under the hand, none at the lamp\'s hot spot beside it', P.nucleations.length > 0 && strays.length === 0 && atLamp.length === 0, `${P.nucleations.length} started, ${strays.length} outside the hand, ${atLamp.length} at the lamp`);
  check('H8 and no site without vapour is hotter than its own superheat allows', overSite <= 1e-9, `worst ${overSite.toFixed(3)} K over its threshold`);
  check('H8 so the boil holds the dish near 100 °C under the hand', hotLiquid > 99.5 && hotLiquid <= 100 + siteMax, `hottest under the hand ${hotLiquid.toFixed(2)} °C, the widest site\'s superheat ${siteMax.toFixed(2)} K`);

  // Lift the hand.
  const lift = P.time, starts = P.nucleations.length;
  let calmV = -1, calmU = -1;
  run(P, 30, { heat: 1 }, 0.1, (Q) => {
    divergence(Q);
    if (calmV < 0 && vapour(Q) < 0.01 * peakV) calmV = Q.time - lift;
    if (calmU < 0 && fastest(Q) < 0.02 * peakU) calmU = Q.time - lift;
  });
  check('H9 lift the hand and within 5 s the vapour is under 1% of its peak', calmV >= 0 && calmV <= 5, calmV >= 0 ? `${calmV.toFixed(1)} s` : 'never');
  check('H9 within 10 s the flow is under 2% of the boil\'s', calmU >= 0 && calmU <= 10, calmU >= 0 ? `${calmU.toFixed(1)} s (peak ${(peakU * 1000).toFixed(2)} mm/s)` : 'never');
  check('H9 and no bubble starts again while the hand is off', P.nucleations.length === starts, `${P.nucleations.length - starts} started`);
}
{
  // H11: a pocket of steam in a dish and a reservoir both at 100 °C, so nothing but the
  // vapour is buoyant and nothing boils or condenses (an upright dish warmer than its
  // reservoir turns over through the open rim and is replaced by the room's water).
  const pocket = (tilt) => {
    const P = createBoilPlate({ ...DISH, n: 40, ambient: 100, hForced: 0, hNatural: 0 });
    for (let k = 0; k < P.n * P.n; k++) { const [x, y] = cellXY(P, k); if (P.inside[k] && Math.hypot(x, y) < 0.008) P.alpha[k] = 0.5; }
    const c = (Q) => { let sx = 0, sy = 0, w = 0; for (let k = 0; k < Q.n * Q.n; k++) { const [x, y] = cellXY(Q, k); sx += Q.alpha[k] * x; sy += Q.alpha[k] * y; w += Q.alpha[k]; } return [sx / w, sy / w]; };
    const [x0, y0] = c(P);
    run(P, 1, { heat: 0, tilt }, 0.02);
    const [x1, y1] = c(P);
    return { dy: (y1 - y0) / P.dx, d: Math.hypot(x1 - x0, y1 - y0) / P.dx };
  };
  const up = pocket(Math.PI / 2).dy, flat = pocket(0).d;
  check('H11 on an upright plate a pocket of steam rises', up < -2, `moved ${up.toFixed(2)} cells in 1 s (up is −; bar −2)`);
  check('H11 on a level plate it stays', Math.abs(flat) < 0.05, `moved ${flat.toFixed(4)} cells in 1 s, either way (bar 0.05)`);
}
{
  // H10: the dial on a hotter lamp.
  const P = createBoilPlate({ ...DISH, lampIrradiance: 30000 });
  run(P, 120, { heat: 0.5 }, 0.1);
  const half = P.nucleations.length;
  const t0 = P.time;
  let first = -1, peak = 0;
  run(P, 60, { heat: 1 }, 0.1, (Q) => { divergence(Q); if (first < 0 && Q.nucleations.length) first = Q.time - t0; peak = Math.max(peak, vapour(Q)); });
  const off = P.time;
  let calm = -1;
  run(P, 10, { heat: 0 }, 0.1, (Q) => { if (calm < 0 && vapour(Q) < 0.01 * peak) calm = Q.time - off; });
  check('H10 the Heat dial at 0.5 makes no bubble in two minutes', half === 0, `${half} started`);
  check('H10 at 1 it boils within a minute', first >= 0 && first < 60, first >= 0 ? `${first.toFixed(1)} s` : 'no bubble');
  check('H10 back at 0 the vapour is under 1% of its peak within 5 s', calm >= 0 && calm <= 5, calm >= 0 ? `${calm.toFixed(1)} s` : 'never');
}
check('H5 every cell\'s face flows add up to the volume the step asked for, on every step of the boils', divSteps > 1000 && divWorst < 1e-6, `worst ${divWorst.toExponential(2)} of the largest source over ${divSteps} steps (bar 1e-6)`);

const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
