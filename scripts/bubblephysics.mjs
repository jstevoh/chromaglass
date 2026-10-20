#!/usr/bin/env node
/**
 * Bubbles and beads live by physics, not timers (PLAN.md §18i).
 *
 *   node scripts/bubblephysics.mjs
 *
 * Checks:
 *   1. Bubble drift speedup follows Bretherton lubrication law with planar Poiseuille centerline shortcut
 *      U_b / U = 1.5 / (1 + 2.26 Ca^(2/3)), running ahead of depth-mean liquid velocity (~1.35-1.50x vs old constant 1.32x),
 *      and speedup ratio falls dynamically as flow speed U increases.
 *   2. Unagitated bubbles have no artificial Brownian wander.
 *   3. Straw finger count follows Saffman-Taylor wavelength scaling lambda ≈ pi * b / sqrt(Ca).
 *   4. Two bubbles in contact drain their thin liquid lubricating film over time t_drain ∝ R_e,
 *      merging deterministically after film drainage rather than on a random dice roll.
 *   5. Physical pancake bubbles (timedPops = false) do not pop on a timer, while timedPops = true
 *      preserves show pacing via lifeScale as called for by the owner.
 *   6. Beads drift at 2U / (1 + lambda) for viscosity ratio lambda, with default speed 0.8·U.
 */
import { build } from 'esbuild';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const outBubbles = 'node_modules/.cache/bubblephysics-bubbles.mjs';
const outBeads = 'node_modules/.cache/bubblephysics-beads.mjs';
await build({ entryPoints: ['src/lib/bubbles.ts'], bundle: true, format: 'esm', platform: 'node', outfile: outBubbles, logLevel: 'warning' });
await build({ entryPoints: ['src/lib/beads.ts'], bundle: true, format: 'esm', platform: 'node', outfile: outBeads, logLevel: 'warning' });
const { BubbleField } = await import(`../${outBubbles}`);
const { BeadField } = await import(`../${outBeads}`);

const N = 192, dt = 1 / 60;

// ── 1. Bretherton lubrication speedup ─────────────────────────────────
{
  const measureSpeedRatio = (uFlow) => {
    const f = new BubbleField(N);
    f.spawn(96, 96, 4, 1, 0);
    const b = f.bubbles[0];
    const flow = () => [uFlow, 0];
    const x0 = b.x;
    for (let t = 0; t < 60; t++) f.step(dt, flow, 0, 0, 1, 0);
    const cellsMoved = b.x - x0;
    const baseFlowCells = uFlow * (0.05 * 190 * 60);
    return cellsMoved / baseFlowCells;
  };
  const ratioSlow = measureSpeedRatio(0.01);
  const ratioFast = measureSpeedRatio(0.04);
  
  check('bubble runs ahead of flow via Bretherton lubrication and ratio falls with flow speed U',
    ratioSlow >= 1.35 && ratioSlow <= 1.50 && ratioFast >= 1.25 && (ratioSlow - ratioFast > 0.05),
    `speed ratio ${ratioSlow.toFixed(3)}x (u=0.01) > ${ratioFast.toFixed(3)}x (u=0.04), delta ${(ratioSlow - ratioFast).toFixed(3)}`);
}

// ── 2. Zero artificial Brownian wander when unagitated ────────────────
{
  const f = new BubbleField(N);
  f.spawn(96, 96, 4, 1, 0);
  const b = f.bubbles[0];
  const still = () => [0, 0];
  const x0 = b.x, y0 = b.y;
  for (let t = 0; t < 120; t++) f.step(dt, still, 0, 0, 1, 0);
  const drift = Math.hypot(b.x - x0, b.y - y0);
  check('unagitated millimeter bubble in still liquid has no random wander',
    drift < 1e-4,
    `drift ${drift.toFixed(5)} cells over 2 seconds`);
}

// ── 3. Saffman-Taylor finger wavelength scaling on Straw ─────────────
{
  const runBlow = (strength) => {
    const f = new BubbleField(N);
    const still = () => [0, 0];
    for (let t = 0; t < 60; t++) {
      f.blow(96, 96, dt, strength);
      f.step(dt, still, 0, 0, 1, 0);
    }
    const b = f.bubbles.find((q) => q.straw);
    const speed = (b.r - Math.max(1, N * 0.008)) / 1.0;
    const uMps = speed * (0.2 / N);
    const Ca = Math.max(1e-4, (f.liquidMu * uMps) / f.liquidSigma);
    return { b, lobes: b.lobes, r: b.r, Ca, sqrtCa: Math.sqrt(Ca) };
  };

  const moderate = runBlow(1.0);
  const fast = runBlow(2.0);

  // Both lobe counts must sit strictly between clamps (6 and 18)
  const insideClamps = moderate.lobes > 6 && moderate.lobes < 18 && fast.lobes > 6 && fast.lobes < 18;
  const actualRatio = fast.lobes / moderate.lobes;
  const theoreticalRatio = (fast.r * fast.sqrtCa) / (moderate.r * moderate.sqrtCa);
  const matchesScaling = Math.abs(actualRatio - theoreticalRatio) < 0.15;

  check('straw finger lobes follow Saffman-Taylor m ∝ R·√Ca between clamps',
    insideClamps && matchesScaling,
    `lobes ${moderate.lobes} vs ${fast.lobes} (ratio ${actualRatio.toFixed(3)} matches theoretical ${theoreticalRatio.toFixed(3)})`);
}

// ── 4. Film drainage merge ───────────────────────────────────────────
{
  const compress = (x, y) => [x < 82.5 ? 0.02 : -0.02, 0];
  const measureDrain = (r1, r2, mu, sigma) => {
    const f = new BubbleField(N);
    f.timedPops = false;
    if (mu !== undefined) f.liquidMu = mu;
    if (sigma !== undefined) f.liquidSigma = sigma;
    f.spawn(80, 80, r1, 1, 0);
    f.spawn(85, 80, r2, 1, 0);
    const [b1, b2] = f.bubbles;
    b1.r = r1; b2.r = r2;
    b1.age = 2.5; b2.age = 2.5; // Past dynamic interface stabilization gate (age > 2)
    b2.x = b1.x + (b1.r + b2.r) * 0.94; // Inside contact facet threshold
    b2.y = b1.y;
    let frames = 0;
    while (f.bubbles.length > 1 && frames < 1200) {
      f.step(dt, compress, 0, 0, 1, 0);
      frames++;
    }
    return { time: frames * dt, merged: f.bubbles.length === 1, rFinal: f.bubbles[0]?.r ?? 0 };
  };

  // Small pair (r1=2, r2=2 -> Re=1.0)
  const small = measureDrain(2, 2);
  // Large pair (r1=4, r2=4 -> Re=2.0)
  const large = measureDrain(4, 4);
  // Viscous pair (Re=1.0, 2x viscosity)
  const viscous = measureDrain(2, 2, 0.034);

  // Touching briefly (less than t_drain) does not merge
  const fBrief = new BubbleField(N);
  fBrief.timedPops = false;
  fBrief.spawn(80, 80, 2, 1, 0);
  fBrief.spawn(85, 80, 2, 1, 0);
  fBrief.bubbles[0].r = 2; fBrief.bubbles[1].r = 2;
  fBrief.bubbles[0].age = 2.5; fBrief.bubbles[1].age = 2.5;
  fBrief.bubbles[1].x = fBrief.bubbles[0].x + (2 + 2) * 0.94;
  fBrief.bubbles[1].y = fBrief.bubbles[0].y;
  for (let t = 0; t < 60; t++) fBrief.step(dt, compress, 0, 0, 1, 0); // 1.0s < 4.25s
  check('bubbles touching briefly do not merge before thin film drains', fBrief.bubbles.length === 2);

  check('drainage time t_drain grows with effective radius R_e',
    large.time > small.time * 1.8,
    `t_drain Re=2.0 (${large.time.toFixed(2)}s) > Re=1.0 (${small.time.toFixed(2)}s)`);

  check('drainage time t_drain grows with liquid viscosity-to-tension ratio mu/sigma',
    viscous.time > small.time * 1.8,
    `t_drain 2x mu (${viscous.time.toFixed(2)}s) > 1x mu (${small.time.toFixed(2)}s)`);

  check('bubbles merge into one area-conserving pancake once film drains',
    small.merged && Math.abs(small.rFinal - Math.sqrt(8)) < 0.05,
    `radius ${small.rFinal.toFixed(3)} matches expected sqrt(8) = ${Math.sqrt(8).toFixed(3)}`);
}

// ── 5. Physical pancake bubbles vs timed pops ────────────────────────
{
  // Physical pancake bubbles do not pop on a timer
  const fPhys = new BubbleField(N);
  fPhys.timedPops = false;
  fPhys.spawn(96, 96, 3, 1, 0);
  const bPhys = fPhys.bubbles[0];
  bPhys.life = 0.5; // 0.5s lifetime
  const still = () => [0, 0];
  for (let t = 0; t < 60; t++) fPhys.step(dt, still, 0, 0, 1, 0); // 1 second
  check('physical pancake bubbles (timedPops = false) do not pop on a timer',
    fPhys.bubbles.length === 1 && fPhys.bubbles[0].age > fPhys.bubbles[0].life,
    `age ${fPhys.bubbles[0]?.age.toFixed(2)}s past life ${fPhys.bubbles[0]?.life}s`);

  // Timed pops available for show pacing (the owner's call)
  const fTimed = new BubbleField(N);
  fTimed.timedPops = true;
  fTimed.spawn(96, 96, 3, 1, 0);
  fTimed.bubbles[0].life = 0.5;
  const timedPops = [];
  for (let t = 0; t < 60; t++) {
    fTimed.step(dt, still, 0, 0, 1, 0);
    timedPops.push(...fTimed.events.filter((e) => e.kind === 'pop'));
  }
  check('timed pops remain active when timedPops = true to pace a show',
    timedPops.length > 0,
    `timed pop fired at t=0.5s (${timedPops.length} pop events)`);
}

// ── 6. Beads speed 2U / (1 + lambda) ──────────────────────────────────
{
  const uFlow = 0.05;
  const flow = () => [uFlow, 0];
  const frames = 180;

  const fDefault = new BeadField(N);
  fDefault.drops = 0;
  fDefault.beads.push({ x: 96, y: 96, r: 3, age: 0, seed: 1 });
  const b0 = fDefault.beads[0];
  const x0 = b0.x;
  for (let t = 0; t < frames; t++) fDefault.step(dt, flow, 0, 0);
  const movedDefault = b0.x - x0;
  
  const baseFlow = uFlow * (0.05 * 190 * 60) * dt * frames;
  const defaultSpeedRatio = movedDefault / baseFlow;
  check('default beads drift at 0.8·U matching tuned lambda = 1.5',
    Math.abs(defaultSpeedRatio - 0.8) < 0.03,
    `speed ratio ${defaultSpeedRatio.toFixed(3)} matches expected 0.800`);

  // Custom viscosity ratio lambda = 3.0 -> speed factor 2 / (1 + 3) = 0.5
  const fViscous = new BeadField(N);
  fViscous.viscosityRatio = 3.0;
  fViscous.drops = 0;
  fViscous.beads.push({ x: 96, y: 96, r: 3, age: 0, seed: 1 });
  const bV = fViscous.beads[0];
  const xV0 = bV.x;
  for (let t = 0; t < frames; t++) fViscous.step(dt, flow, 0, 0);
  const movedViscous = bV.x - xV0;

  const ratio = movedViscous / movedDefault;
  // Expected ratio: (2 / (1 + 3)) / (2 / (1 + 1.5)) = 0.5 / 0.8 = 0.625
  check('beads drift at 2U / (1 + lambda) based on viscosity ratio',
    Math.abs(ratio - 0.625) < 0.03,
    `ratio ${ratio.toFixed(3)} matches physical ratio 0.625 (moved ${movedViscous.toFixed(1)} vs ${movedDefault.toFixed(1)} cells)`);
}

// ── 7. Each liquid's own bubbles (PLAN 33f) ────────────────────────────
// The plate's clear liquid is the Thickness dial: water at 0, the default light
// oil at 0.45, glycerine at 1. Bubbles read it for their speed (Bretherton),
// their film drainage (Stefan-Reynolds, ∝ μ/σ), their climb (Darcy, ∝ Δρ/μ),
// and how far drag stretches them. The theory below is written out here from
// the REAL liquids' numbers and the textbook laws, not read back from the
// module, so a module that agreed with itself would not pass.
{
  const outLiquid = 'node_modules/.cache/bubblephysics-liquid.mjs';
  await build({ entryPoints: ['src/lib/bubbleLiquid.ts'], bundle: true, format: 'esm', platform: 'node', outfile: outLiquid, logLevel: 'warning' });
  const { plateLiquid, liquidAtCell } = await import(`../${outLiquid}`);
  const REAL = { water: { t: 0, mu: 0.0010, sigma: 0.0728, rho: 998 }, oil: { t: 0.45, mu: 0.017, sigma: 0.030, rho: 850 }, glycerine: { t: 1, mu: 1.41, sigma: 0.0634, rho: 1261 } };

  // 7a. The plate's liquids are the real ones to within what the dial can be
  // (its glycerine is a kinematic 1.0 St against the real 1.12, so its μ is
  // 20% under 1.41 Pa·s; water's is 11% under), and the default's numbers
  // are the bubbles' old numbers exactly: the literals bubbles.ts held before
  // 33f, not the module's own constants.
  {
    const bar = { water: { mu: 0.13, sigma: 0.03, rho: 0.03 }, oil: { mu: 0, sigma: 0, rho: 0 }, glycerine: { mu: 0.22, sigma: 0.03, rho: 0.03 } };
    let worst = 0, over = [];
    for (const [n, r] of Object.entries(REAL)) {
      const l = plateLiquid(r.t);
      for (const k of ['mu', 'sigma', 'rho']) {
        const miss = Math.abs(l[k] / r[k] - 1);
        worst = Math.max(worst, miss);
        if (miss > bar[n][k]) over.push(`${n} ${k} ${(miss * 100).toFixed(0)}%`);
      }
    }
    const d = plateLiquid(0.45);
    const ref = new BubbleField(N);
    const typesDefault = (await import('node:fs')).readFileSync('src/types.ts', 'utf8').match(/^\s*gapThickness:\s*([0-9.]+),/m);
    check('the Thickness dial stands for water, oil and glycerine: μ, σ, ρ each within its stated miss of the real liquid, the default exactly the old numbers',
      over.length === 0 && d.mu === 0.017 && d.sigma === 0.030 && d.rho === 850 && ref.liquidMu === 0.017 && ref.liquidSigma === 0.030 && ref.liquidRho === 850 && Number(typesDefault?.[1]) === 0.45,
      `worst miss ${(worst * 100).toFixed(0)}%${over.length ? ', over: ' + over.join(', ') : ''}; default ${(d.mu * 1000).toFixed(1)} mPa·s ${(d.sigma * 1000).toFixed(1)} mN/m ${d.rho} kg/m³ (types.ts default ${typesDefault?.[1]}); glycerine ${plateLiquid(1).mu.toFixed(2)} Pa·s`);
  }

  // 7b. Speed ahead of the flow: Bretherton's 1.5/(1 + 2.26 Ca^(2/3)), floored at 1,
  // for the real liquid's Ca. Water barely feels its film, glycerine is slowed
  // to the flow itself; the same flow, three liquids.
  {
    const run = (t, uFlow) => {
      const f = new BubbleField(N);
      f.setLiquid(t);
      f.spawn(96, 96, 4, 1, 0);
      const b = f.bubbles[0];
      const x0 = b.x;
      for (let k = 0; k < 60; k++) f.step(dt, () => [uFlow, 0], 0, 0, 1, 0);
      return (b.x - x0) / (uFlow * (0.05 * 190 * 60));
    };
    const theory = (r, uFlow) => {
      const U = uFlow * (0.05 * 190 * 60) * (0.2 / N);
      const Ca = r.mu * U / r.sigma;
      return Math.max(1, 1.5 / (1 + 2.26 * Math.cbrt(Ca * Ca)));
    };
    const cases = [['water', 0.04], ['oil', 0.04], ['glycerine', 0.002], ['glycerine', 0.04]];
    const rows = cases.map(([n, u]) => ({ n, u, got: run(REAL[n].t, u), want: theory(REAL[n], u) }));
    const within = rows.every((r) => Math.abs(r.got / r.want - 1) < 0.10);
    // Ordered: at one flow water runs furthest ahead, glycerine not at all.
    const ordered = rows[0].got > rows[1].got && rows[1].got > rows[3].got - 1e-9 && rows[3].got >= 1 - 1e-9;
    check('bubble speed ahead of the flow follows Bretherton for each liquid within 10% of the real liquid\'s Ca, and water > oil > glycerine',
      within && ordered,
      rows.map((r) => `${r.n}@${r.u} ${r.got.toFixed(3)} vs ${r.want.toFixed(3)}`).join(', '));
  }

  // 7c. Film drainage between two touching bubbles, t ∝ μ/σ: water in a
  // third of a second, the oil's 13 s, glycerine minutes. Against the same
  // Stefan-Reynolds expression evaluated with the real liquids, and (a tight
  // bar, the law's form) with the plate's own μ and σ.
  {
    const FACTOR = 7200;
    const drain = (t, r) => {
      const f = new BubbleField(N);
      f.timedPops = false;
      f.setLiquid(t);
      f.spawn(80, 80, r, 1, 0);
      f.spawn(85, 80, r, 1, 0);
      const [b1, b2] = f.bubbles;
      b1.r = r; b2.r = r; b1.age = 2.5; b2.age = 2.5;
      b2.x = b1.x + (b1.r + b2.r) * 0.94; b2.y = b1.y;
      let frames = 0;
      while (f.bubbles.length > 1 && frames < 60000) { f.step(dt, (x) => [x < 82.5 ? 0.02 : -0.02, 0], 0, 0, 1, 0); frames++; }
      return frames * dt;
    };
    const Re = 3, ReM = Re * (0.2 / N);
    const rows = Object.entries(REAL).map(([n, real]) => ({ n, got: drain(real.t, 2 * Re), want: FACTOR * (real.mu / real.sigma) * ReM }));
    const within = rows.every((r) => Math.abs(r.got / r.want - 1) < 0.25 || Math.abs(r.got - r.want) < 2 * dt);
    const ordered = rows[0].got < rows[1].got && rows[1].got < rows[2].got;
    // The law's form, against the dial's own μ and σ: the bar a bubble that
    // ignored either would miss by a factor, not a few per cent.
    const form = rows.map((r) => { const l = plateLiquid(REAL[r.n].t); return Math.abs(r.got / (FACTOR * (l.mu / l.sigma) * ReM) - 1); });
    check('film drainage time follows μ/σ across water, oil and glycerine (within 25% of the real liquids\' Stefan-Reynolds time, 5% of the law on the dial\'s own μ and σ)',
      within && ordered && form.every((e, i) => e < 0.05 || Math.abs(rows[i].got - FACTOR * (plateLiquid(REAL[rows[i].n].t).mu / plateLiquid(REAL[rows[i].n].t).sigma) * ReM) < 2 * dt),
      rows.map((r, i) => `${r.n} ${r.got.toFixed(2)}s vs ${r.want.toFixed(2)}s real, ${(form[i] * 100).toFixed(1)}% off the law`).join(', '));
  }

  // 7d. Climb up a tilted plate, ∝ Δρ/μ (Darcy in the gap), against the oil's.
  // Two lines: the law's form where nothing is clamped (a syrup between the
  // oil and glycerine, against the ratio of the dial's own ρ and μ, 5%), and
  // the ends against the real liquids, glycerine within 40% of the real
  // ratio and water held at the 4x ceiling, which is a named shortcut.
  const climb = (t, species = null, at = [96, 96], poured = {}) => {
    const f = new BubbleField(N);
    f.setLiquid(t);
    if (species) { f.species = species; f.pouredRho = poured.rho; f.pouredSigma = poured.sigma; }
    f.spawn(at[0], at[1], 4, 1, 0);
    const b = f.bubbles[0];
    const y0 = b.y;
    for (let k = 0; k < 30; k++) f.step(dt, () => [0, 0], 0, -0.004, 1, 0);
    return (b.y - y0);
  };
  {
    const oil = climb(0.45), water = climb(0), gly = climb(1), mid = climb(0.8);
    const lo = plateLiquid(0.8), l0 = plateLiquid(0.45);
    const wantMid = (lo.rho / l0.rho) * (l0.mu / lo.mu);
    const wantGly = (REAL.glycerine.rho / REAL.oil.rho) * (REAL.oil.mu / REAL.glycerine.mu);
    check('a bubble climbs a tilted plate as Δρ/μ: the law within 5% unclamped, glycerine within 40% of the real ratio to the oil, water at the 4x ceiling',
      Math.abs((mid / oil) / wantMid - 1) < 0.05 && wantMid > 0.05 && wantMid < 3
        && Math.abs((gly / oil) / wantGly - 1) < 0.40 && Math.abs(water / oil - 4) < 0.05 && gly < oil,
      `at Thickness 0.8 ${(mid / oil).toFixed(3)} of the oil's (law ${wantMid.toFixed(3)}); glycerine ${(gly / oil).toFixed(3)} (real ${wantGly.toFixed(3)}), water ${(water / oil).toFixed(2)}x`);
  }

  // 7e. Poured liquid, in the species field's real layout: share, Σ share·
  // ln(ν/ν_w), Σ share·μs′ (scatter, 0 for glycerine), Σ share·index. There
  // is no density in it, so the poured part's comes from the liquid last
  // poured. A cell off the diagonal of a plate of oil, so a transposed read
  // or a plate term left out shows; then a bubble run in it.
  {
    const L = 8;
    const NU_W = 1e-6, NU_G = 1.12e-3, RHO_G = 1261;
    const cellAt = (cx, cy) => (cx + cy * L) * 4;
    const mk = (share) => {
      const data = new Float32Array(L * L * 4);
      const at = cellAt(5, 2);
      data[at] = share; data[at + 1] = share * Math.log(NU_G / NU_W); data[at + 2] = 0; data[at + 3] = share * 1.4746;
      return { L, data };
    };
    const oil = plateLiquid(0.45);
    const out = { mu: 0, sigma: 0, rho: 0, nu: 0 };
    const px = (c) => ((c + 0.5) / L) * N;
    const read = (snap, cx, cy) => ({ ...liquidAtCell(oil, snap, px(cx), px(cy), N, 0.0634, RHO_G, out) });
    const full = read(mk(1), 5, 2);
    const away = read(mk(1), 2, 5);
    const half = read(mk(0.5), 5, 2);
    // Arrhenius on the oil plate: half glycerine is the geometric mean of the two ν.
    const geoNu = Math.sqrt(oil.nu * NU_G), geoRho = (oil.rho + RHO_G) / 2;
    const geoMu = oil.mu * (geoNu / oil.nu) * (geoRho / oil.rho);
    // A bubble in the half-glycerine cell climbs at Δρ/μ of that cell against the oil's.
    const here = [px(5), px(2)];
    const slow = climb(0.45, mk(0.5), here, { rho: RHO_G, sigma: 0.0634 }) / climb(0.45, null, here);
    const wantSlow = (geoRho / oil.rho) * (oil.mu / geoMu);
    check('poured liquid changes the bubble\'s liquid where it lies: a glycerine cell off the diagonal is glycerine (density from the last pour), the transposed cell stays oil, half and half mixes by Arrhenius and slows a bubble in it by Δρ/μ',
      Math.abs(full.nu / NU_G - 1) < 0.02 && Math.abs(full.rho - RHO_G) < 1 && Math.abs(full.mu / (oil.mu * (NU_G / oil.nu) * (RHO_G / oil.rho)) - 1) < 0.02 && Math.abs(full.sigma - 0.0634) < 1e-9
        && away.mu === oil.mu && away.sigma === oil.sigma && away.rho === oil.rho
        && Math.abs(half.nu / geoNu - 1) < 0.02 && Math.abs(half.rho - geoRho) < 1
        && Math.abs(slow / wantSlow - 1) < 0.10 && wantSlow > 0.05 && wantSlow < 0.5,
      `glycerine cell ${full.mu.toFixed(2)} Pa·s ${full.rho.toFixed(0)} kg/m³, transposed cell ${(away.mu * 1000).toFixed(1)} mPa·s, half-half ν ${(half.nu * 1e6).toFixed(0)} mm²/s vs geometric mean ${(geoNu * 1e6).toFixed(0)}; a bubble there climbs ${slow.toFixed(3)} of the oil's (law ${wantSlow.toFixed(3)})`);
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
