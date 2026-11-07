#!/usr/bin/env node
/**
 * Bubbles that know their liquid (PLAN 33f).
 *
 *   npm run bubbleliquid                       what the build does
 *   npm run bubbleliquid -- --owed=<ids>       as CI runs it until it ships
 *
 * Why this check exists before the build does. Since 38n a bubble's motion
 * is the look's liquid (`BubbleField.liquid(settings)`: the Thickness dial's
 * viscosity, water's or the oil's tension and density), and every law in
 * `npm run bubblephysics` is written in that one plate-wide μ, σ and ρ. What
 * is poured into the plate is not seen: a pocket in a pool of glycerine
 * poured on the default oil runs as far ahead of the flow, drains its film
 * as fast and climbs a tilted plate as fast as one beside it in the oil,
 * though glycerine is eighty times as viscous and twice as tense. The
 * species field already carries what was poured where (lib/liquidProps.ts,
 * PLAN 18d), so 33f reads it under each pocket. This file is the contract
 * that build is held to, written first and red on main (the Claude and
 * Antigravity split, docs/handoff.md): the build takes each id out of
 * --owed as it turns green.
 *
 * The contract, so the build has one shape to meet:
 *
 *   - `src/lib/bubbleLiquid.ts` (new, pure) exports
 *       `liquidAtCell(plate, snap, x, y, grid, poured, out)`: the liquid at
 *         (x, y) in the bubbles' grid (0..grid). `plate` is {mu, sigma, rho}
 *         in SI (the BubbleField's liquidMu, liquidSigma, liquidRho), `snap`
 *         the species field read back as {L, data} (L×L cells, rgba: the
 *         poured share r, Σ share·ln(ν/ν_water), scatter, Σ share·index; row
 *         iy is y = iy·grid/L, row 0 first) or null, `poured` the {sigma,
 *         rho} of the liquid last poured (the field holds neither: a
 *         shortcut, exact for one poured liquid, approximate for a mix).
 *         It fills `out` ({mu, sigma, rho}) and returns it, so a frame of
 *         bubbles allocates nothing. The mix is the thin gap's own (hsPrep):
 *         ln(ν/ν_w) = (1−r)·ln(ν_plate/ν_w) + g, the Arrhenius rule, with
 *         ν_plate = μ/ρ of the plate; ρ and σ the share-weighted means; and
 *         μ = ρν, as `liquid()` makes the plate's. With no snapshot, or no
 *         share at the cell, `out` is the plate's to the bit.
 *       `pouredOf(behaviour, plateSigma)`: a bottle's {sigma, rho} in SI,
 *         from its `tension` (mN/m) and `density` (g/cm³) on the shelf
 *         (src/bottles.ts); a bottle the owner made with no tension takes the
 *         plate's σ, and its density is speciesOf's (1 + weight).
 *   - `BubbleField.species(snap, poured)` hands the field a snapshot (null
 *     drops it), and `step` reads each pocket's own liquid, on the ring its
 *     drift already reads the flow on, for every law that reads μ, σ or ρ
 *     today: the Bretherton speed ratio and film, the tilt's climb, Paterson's
 *     τ₂ (shape and stretch), the rim's emptying, dissolving and the film
 *     drainage between two pockets.
 *   - the app reads the species back once a second as it already does for
 *     the automation's headroom (`speciesShare`, src/gpu/fluid/reads.ts), as
 *     one read rather than two: `speciesSnapshot()` on the solver
 *     (src/gpu/solverTypes.ts), and hands it to the bubbles only on a thin
 *     gap; a plate clear drops it.
 *
 * The lines (node only, a few seconds):
 *
 *   cell       liquidAtCell's law: the plate's liquid to the bit with no
 *              snapshot and with an empty one; glycerine's μ, σ and ρ in a
 *              cell all glycerine on the default oil; the half and half mix
 *              at the geometric mean ν (Arrhenius), not the arithmetic one;
 *              the snapshot's L read against the bubbles' grid; `out`
 *              filled, not a new object; pouredOf from the shelf, and an
 *              owner's bottle with no tension on the plate's σ.
 *   default    a show's worth of pockets (drift, shear, tilt, a merge, a
 *              pocket leaving at the rim) runs to the bit as it does today
 *              with no snapshot, with `species(null)` and with a snapshot of
 *              nothing poured: the plate's own liquid moves nothing.
 *   bretherton one pocket pushed through alcohol, the default oil and
 *              glycerine, poured over the whole oil plate: each runs ahead of
 *              the flow by 2/(1 + 2.26 Ca^⅔) within 1% with Ca from its own
 *              cell's μ and σ, so alcohol leads, glycerine lags.
 *   local      two pockets in one field, one in a pool of glycerine poured
 *              over the top half of the plate and one in the clear oil below,
 *              climb a tilted plate in the same steps, each at its own
 *              Δρ g sinθ b²/(12μ) within 1%: not the plate's mean, and not a
 *              snapshot read across its rows (the pool is in rows, the two
 *              pockets share a column).
 *   drain      two pockets pressed together merge after their film drains, in
 *              a time that goes as μ/σ of their liquid: alcohol, oil and
 *              syrup, each within 5% of the oil's time scaled by μ/σ.
 *   shape      a stretched pocket rounds off at Paterson's τ₂ = 2μR³/(b²σ) of
 *              its own cell, within 1%, in alcohol, oil and syrup.
 *   rim        open at the rim it empties at π·bσ/(3μ) of its own cell
 *              within 2%, in oil and in syrup.
 *   dissolve   scaled past nature, it dissolves at its own cell's D ∝ 1/μ
 *              and Laplace Δp ∝ σ: syrup against oil within 1%.
 *   wired      the solver says `speciesSnapshot` (solverTypes.ts), reads.ts
 *              does it, and something in the app hands a BubbleField a
 *              snapshot (`.species(`). Source reads, since the app's frames
 *              are the Mac's: the row direction of the GPU's read against
 *              the bubbles' y is PLAN 33f-3, a Metal run.
 *
 * --owed: a line is excused only in the state it is owed for, which is main's
 * (as soapbreak and liveshow do it): there is no src/lib/bubbleLiquid.ts and
 * no BubbleField.species. Once both exist every line is held, owed or not,
 * and an owed line that passes is red until its id is taken out of --owed.
 * `wired` is owed while solverTypes.ts has no speciesSnapshot.
 *
 * Every line today's `npm run bubblephysics` prints stays as it is: that
 * check runs the plate's own liquid, and `default` here is why it may.
 */
import { build } from 'esbuild';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OWED_IDS = ['cell', 'default', 'bretherton', 'local', 'drain', 'shape', 'rim', 'dissolve', 'wired'];
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const unknown = [...owed].filter((id) => !OWED_IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${OWED_IDS.join(', ')})`);
/** A line, excused only when it is owed and `inOwedState` says the code is still main's. */
const line = (id, name, ok, detail, inOwedState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!inOwedState) return check(name, false, `${detail}; owed only while the code is main's, and it is not`);
  console.log(` owed ${name} — ${detail}`);
};

const bundle = async (entry) => {
  const out = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
};
const { BubbleField } = await bundle('src/lib/bubbles.ts');
const { makeRng } = await bundle('src/lib/rng.ts');
const { DEFAULT_LIQUID_TYPES } = await bundle('src/bottles.ts');
const { DISH_GAP_METRES } = await bundle('src/lib/turntable.ts');
let bl = null;
try { bl = await bundle('src/lib/bubbleLiquid.ts'); } catch { bl = null; }
const liquidAtCell = typeof bl?.liquidAtCell === 'function' ? bl.liquidAtCell : null;
const pouredOf = typeof bl?.pouredOf === 'function' ? bl.pouredOf : null;
const hasSpecies = typeof BubbleField.prototype.species === 'function';
const api = !!(liquidAtCell && pouredOf && hasSpecies);
/** Main's state: nothing of 33f yet. */
const mains = !bl && !hasSpecies;
const missing = [!bl ? 'no src/lib/bubbleLiquid.ts' : !liquidAtCell || !pouredOf ? 'bubbleLiquid.ts lacks liquidAtCell or pouredOf' : '', !hasSpecies ? 'no BubbleField.species' : ''].filter(Boolean).join('; ');

const N = 192, dt = 1 / 60;
const M = 0.2 / N;                       // metres a cell (bubbles.ts DISH_METRES / grid)
const CPU = 0.05 * 190 * 60;             // solver units to cells a second (bubbles.ts)
const GAP = DISH_GAP_METRES;
const NU_W = 1e-6;
const L = 64;                            // the snapshot's side, not the grid's, so the scaling is read
const DEFAULT_OIL = { thinGap: 1, gapThickness: 0.45, viscosity: 'thick' };
const bottle = (id) => DEFAULT_LIQUID_TYPES.find((t) => t.id === id).behaviour;
/** A bottle as the check knows it, from the shelf itself: SI tension and density, ln(ν/ν_w). */
const shelf = (id) => {
  const b = bottle(id);
  return { sigma: b.tension / 1000, rho: b.density * 1000, lnNu: Math.log((b.viscosity / b.density) * 1e-6 / NU_W) };
};
const ALCOHOL = shelf('alcohol'), SYRUP = shelf('syrup'), GLYCERINE = shelf('glycerine');

/** A snapshot with share `r` of liquid `liq` wherever `where(ix, iy)` says, nothing elsewhere. */
const snapshot = (liq, r = 1, where = () => true) => {
  const data = new Float32Array(L * L * 4);
  for (let iy = 0; iy < L; iy++) for (let ix = 0; ix < L; ix++) {
    if (!where(ix, iy)) continue;
    const at = (ix + iy * L) * 4;
    data[at] = r; data[at + 1] = r * liq.lnNu; data[at + 2] = 0; data[at + 3] = r * 1.4;
  }
  return { L, data };
};
/** What the liquid is, by the check's own physics (the contract's mix), for share r of `liq` in the plate. */
const expected = (plate, liq, r) => {
  if (!(r > 0)) return { ...plate };
  const lnNu = (1 - r) * Math.log(plate.mu / plate.rho / NU_W) + r * liq.lnNu;
  const rho = (1 - r) * plate.rho + r * liq.rho;
  return { mu: rho * NU_W * Math.exp(lnNu), sigma: (1 - r) * plate.sigma + r * liq.sigma, rho };
};
const plateOf = (f) => ({ mu: f.liquidMu, sigma: f.liquidSigma, rho: f.liquidRho });
const field = (seed = 7) => { const f = new BubbleField(N, makeRng(seed, 'bubbleliquid')); f.liquid(DEFAULT_OIL); return f; };
const put = (f, x, y, r) => {
  f.spawn(x, y, 2, 1, 0);
  const b = f.bubbles[f.bubbles.length - 1];
  b.x = x; b.y = y; b.r = r; b.inject = 0;
  return b;
};
const still = () => [0, 0];
const rel = (a, b) => Math.abs(a / b - 1);
const pct = (x) => `${(x * 100).toFixed(2)}%`;
const pour = (f, liq, where) => f.species(snapshot(liq, 1, where), { sigma: liq.sigma, rho: liq.rho });

// ── cell ─────────────────────────────────────────────────────────────
if (!api) line('cell', 'the liquid at a cell is the plate\'s with nothing poured, and the poured mix by the thin gap\'s rule', false, missing, mains);
else {
  const plate = plateOf(field());
  const out = { mu: 0, sigma: 0, rho: 0 };
  const same = (a, b) => a.mu === b.mu && a.sigma === b.sigma && a.rho === b.rho;
  const none = { ...liquidAtCell(plate, null, 96, 96, N, GLYCERINE, out) };
  const empty = { ...liquidAtCell(plate, snapshot(GLYCERINE, 0), 96, 96, N, GLYCERINE, out) };
  const whole = { ...liquidAtCell(plate, snapshot(GLYCERINE, 1), 96, 96, N, GLYCERINE, out) };
  const halfLiq = { ...liquidAtCell(plate, snapshot(GLYCERINE, 0.5), 96, 96, N, GLYCERINE, out) };
  const wantWhole = expected(plate, GLYCERINE, 1), wantHalf = expected(plate, GLYCERINE, 0.5);
  // The pool in the left quarter of the snapshot's columns: x = 40 is in it at L = 64 (cell 13 of 16), x = 56 not (18).
  const quarter = snapshot(GLYCERINE, 1, (ix) => ix < L / 4);
  const inPool = liquidAtCell(plate, quarter, 40, 96, N, GLYCERINE, out).mu;
  const outPool = liquidAtCell(plate, quarter, 56, 96, N, GLYCERINE, out).mu;
  const ret = liquidAtCell(plate, null, 96, 96, N, GLYCERINE, out);
  const gly = pouredOf(bottle('glycerine'), plate.sigma);
  const own = pouredOf({ body: 0.5, weight: 0.1 }, plate.sigma);
  const arithmetic = (plate.mu + wantWhole.mu) / 2;
  const ok = same(none, plate) && same(empty, plate)
    && rel(whole.mu, wantWhole.mu) < 0.005 && rel(whole.sigma, GLYCERINE.sigma) < 1e-6 && rel(whole.rho, GLYCERINE.rho) < 1e-6
    && rel(halfLiq.mu, wantHalf.mu) < 0.005 && rel(halfLiq.sigma, wantHalf.sigma) < 1e-6 && rel(halfLiq.rho, wantHalf.rho) < 1e-6
    && halfLiq.mu < arithmetic / 4
    && rel(inPool, wantWhole.mu) < 0.005 && outPool === plate.mu
    && ret === out
    && rel(gly.sigma, 0.0634) < 1e-6 && rel(gly.rho, 1261) < 1e-6
    && own.sigma === plate.sigma && rel(own.rho, 1100) < 1e-6;
  line('cell', 'the liquid at a cell is the plate\'s with nothing poured, and the poured mix by the thin gap\'s rule', ok,
    `nothing poured ${same(none, plate) && same(empty, plate) ? 'the plate to the bit' : 'NOT the plate'}; glycerine μ ${(whole.mu * 1000).toFixed(0)} mPa·s (want ${(wantWhole.mu * 1000).toFixed(0)}), σ ${(whole.sigma * 1000).toFixed(1)} mN/m, ρ ${whole.rho.toFixed(0)}; half and half μ ${(halfLiq.mu * 1000).toFixed(1)} mPa·s (Arrhenius ${(wantHalf.mu * 1000).toFixed(1)}, arithmetic ${(arithmetic * 1000).toFixed(0)}); pool at x 40 ${(inPool * 1000).toFixed(0)}, at x 56 ${(outPool * 1000).toFixed(1)} mPa·s; out ${ret === out ? 'filled' : 'a new object'}; glycerine bottle σ ${gly.sigma} ρ ${gly.rho}, owner's bottle σ ${own.sigma} ρ ${own.rho}`,
    mains);
}

// ── default ──────────────────────────────────────────────────────────
/** A show's worth: six pockets in a shear and a tilt, two pressed to merge, one carried out at the rim. */
const scenario = (prep) => {
  const f = field(11);
  prep(f);
  put(f, 80, 96, 3); put(f, 80 + 6 * 0.94, 96, 3);           // pressed: merges after its drain (4 s or so)
  put(f, 60, 60, 2); put(f, 130, 70, 5); put(f, 110, 130, 8);
  put(f, 96 + N / 2 - 4.5, 96, 3);                             // at the rim: leaves
  const shear = (x, y) => [0.004 * Math.sin(y / 20) + (x < 83 ? 0.01 : -0.01) * (Math.abs(y - 96) < 6 ? 1 : 0), 0.003 * Math.cos(x / 25)];
  const trace = [];
  for (let t = 0; t < 420; t++) {
    f.step(dt, shear, 0.00005, -0.0001, t > 300 ? 0.3 : 0);
    for (const b of f.bubbles) trace.push(b.x, b.y, b.r, b.film, b.sx, b.sy);
    trace.push(f.bubbles.length);
  }
  return { trace, events: f.bubbles.length };
};
if (!api) line('default', 'with nothing poured every pocket moves to the bit as the plate\'s own liquid moves it', false, missing, mains);
else {
  const bare = scenario(() => {});
  const nulled = scenario((f) => f.species(null, null));
  const nothing = scenario((f) => f.species(snapshot(GLYCERINE, 0), { sigma: GLYCERINE.sigma, rho: GLYCERINE.rho }));
  const eq = (a, b) => a.trace.length === b.trace.length && a.trace.every((v, i) => Object.is(v, b.trace[i]));
  let diffAt = -1;
  for (let i = 0; i < Math.max(bare.trace.length, nothing.trace.length); i++) if (!Object.is(bare.trace[i], nothing.trace[i])) { diffAt = i; break; }
  line('default', 'with nothing poured every pocket moves to the bit as the plate\'s own liquid moves it', eq(bare, nulled) && eq(bare, nothing),
    `${bare.trace.length} numbers over 420 steps (${bare.events} pockets left); species(null) ${eq(bare, nulled) ? 'identical' : 'differs'}, an empty snapshot ${eq(bare, nothing) ? 'identical' : `differs from number ${diffAt}`}`,
    mains);
}

// ── bretherton ───────────────────────────────────────────────────────
if (!api) line('bretherton', 'a pocket runs ahead of the flow by 2/(1 + 2.26 Ca^⅔) with Ca from its own liquid', false, missing, mains);
else {
  const run = (liq) => {
    const f = field();
    const plate = plateOf(f);
    if (liq) pour(f, liq);
    const want = liq ? expected(plate, liq, 1) : plate;
    const b = put(f, 70, 96, 4);
    const u = 0.04, flow = () => [u, 0];
    const x0 = b.x;
    for (let t = 0; t < 60; t++) f.step(dt, flow, 0, 0, 0);
    const cps = u * CPU;
    const Ca = want.mu * cps * M / want.sigma;
    return { got: (b.x - x0) / cps, law: 2 / (1 + 2.26 * Math.cbrt(Ca * Ca)), Ca };
  };
  const alc = run(ALCOHOL), oil = run(null), gly = run(GLYCERINE);
  const ok = [alc, oil, gly].every((r) => rel(r.got, r.law) < 0.01) && alc.got > oil.got + 0.05 && oil.got > gly.got + 0.3;
  line('bretherton', 'a pocket runs ahead of the flow by 2/(1 + 2.26 Ca^⅔) with Ca from its own liquid', ok,
    [['alcohol', alc], ['oil', oil], ['glycerine', gly]].map(([n, r]) => `${n} ${r.got.toFixed(3)}× (law ${r.law.toFixed(3)}, Ca ${r.Ca.toExponential(2)})`).join(', '),
    mains);
}

// ── local ────────────────────────────────────────────────────────────
if (!api) line('local', 'two pockets in one field climb a tilt each at its own Δρ g sinθ b²/(12μ)', false, missing, mains);
else {
  const f = field();
  const plate = plateOf(f);
  pour(f, GLYCERINE, (ix, iy) => iy < L / 2);                   // the top half of the plate's rows
  const top = put(f, 96, 56, 4), bottom = put(f, 96, 136, 4);
  const y0t = top.y, y0b = bottom.y, steps = 120;
  for (let t = 0; t < steps; t++) f.step(dt, still, 0, -0.0002, 0);
  const law = (l) => l.rho * 9.81 * 0.002 * GAP * GAP / (12 * l.mu) / M;
  const g = expected(plate, GLYCERINE, 1);
  const vt = (top.y - y0t) / (steps * dt), vb = (bottom.y - y0b) / (steps * dt);
  const ok = rel(vt, law(g)) < 0.01 && rel(vb, law(plate)) < 0.01;
  line('local', 'two pockets in one field climb a tilt each at its own Δρ g sinθ b²/(12μ)', ok,
    `in the glycerine ${vt.toFixed(4)} cells/s (law ${law(g).toFixed(4)}), in the oil ${vb.toFixed(2)} (law ${law(plate).toFixed(2)})`,
    mains);
}

// ── drain ────────────────────────────────────────────────────────────
if (!api) line('drain', 'two pockets pressed together merge in a time that goes as their liquid\'s μ/σ', false, missing, mains);
else {
  const drain = (liq) => {
    const f = field();
    const plate = plateOf(f);
    if (liq) pour(f, liq);
    const want = liq ? expected(plate, liq, 1) : plate;
    const a = put(f, 80, 96, 6), c = put(f, 80 + 12 * 0.94, 96, 6);
    const mid = (a.x + c.x) / 2;
    const press = (x) => [x < mid ? 0.002 : -0.002, 0];
    let frames = 0;
    while (f.bubbles.length > 1 && frames < 6000) { f.step(dt, press, 0, 0, 0); frames++; }
    return { t: frames * dt, merged: f.bubbles.length === 1, vc: want.mu / want.sigma };
  };
  const oil = drain(null), alc = drain(ALCOHOL), syr = drain(SYRUP);
  const scaled = (r) => oil.t * r.vc / oil.vc;
  const ok = oil.merged && alc.merged && syr.merged && rel(alc.t, scaled(alc)) < 0.05 && rel(syr.t, scaled(syr)) < 0.05;
  line('drain', 'two pockets pressed together merge in a time that goes as their liquid\'s μ/σ', ok,
    `oil ${oil.t.toFixed(2)} s; alcohol ${alc.merged ? `${alc.t.toFixed(2)} s` : 'never'} (μ/σ says ${scaled(alc).toFixed(2)}); syrup ${syr.merged ? `${syr.t.toFixed(2)} s` : 'never in 100 s'} (μ/σ says ${scaled(syr).toFixed(2)})`,
    mains);
}

// ── shape ────────────────────────────────────────────────────────────
if (!api) line('shape', 'a stretched pocket rounds off at Paterson\'s τ₂ = 2μR³/(b²σ) of its own liquid', false, missing, mains);
else {
  const tau = (liq) => {
    const f = field();
    const plate = plateOf(f);
    if (liq) pour(f, liq);
    const want = liq ? expected(plate, liq, 1) : plate;
    const b = put(f, 96, 96, 20);
    b.sx = 0.3; b.sy = 0;
    const R = b.r * M;
    f.step(dt, still, 0, 0, 0);
    return { got: -dt / Math.log(b.sx / 0.3), law: (2 * want.mu * R ** 3) / (GAP * GAP * want.sigma) };
  };
  const alc = tau(ALCOHOL), oil = tau(null), syr = tau(SYRUP);
  const ok = [alc, oil, syr].every((r) => rel(r.got, r.law) < 0.01);
  line('shape', 'a stretched pocket rounds off at Paterson\'s τ₂ = 2μR³/(b²σ) of its own liquid', ok,
    [['alcohol', alc], ['oil', oil], ['syrup', syr]].map(([n, r]) => `${n} ${r.got.toFixed(3)} s (law ${r.law.toFixed(3)})`).join(', '),
    mains);
}

// ── rim ──────────────────────────────────────────────────────────────
if (!api) line('rim', 'open at the rim a pocket empties at π·bσ/(3μ) of its own liquid', false, missing, mains);
else {
  const empty = (liq) => {
    const f = field();
    const plate = plateOf(f);
    if (liq) pour(f, liq);
    const want = liq ? expected(plate, liq, 1) : plate;
    const r = 6;
    const b = put(f, 96 + N / 2 - r - 0.5, 96, r);
    b.venting = true;
    const step = 1e-4, a0 = b.r * b.r;
    f.step(step, still, 0, 0, 0);
    const rate = (a0 - b.r * b.r) * M * M / step;               // m²/s of r², the law's π dropped both sides
    return { got: rate, law: GAP * want.sigma / (3 * want.mu) };
  };
  const oil = empty(null), syr = empty(SYRUP);
  const ok = rel(oil.got, oil.law) < 0.02 && rel(syr.got, syr.law) < 0.02;
  line('rim', 'open at the rim a pocket empties at π·bσ/(3μ) of its own liquid', ok,
    `oil ${(oil.got * 1e6).toFixed(2)} mm²/s of r² (law ${(oil.law * 1e6).toFixed(2)}), syrup ${(syr.got * 1e6).toFixed(3)} (law ${(syr.law * 1e6).toFixed(3)})`,
    mains);
}

// ── dissolve ─────────────────────────────────────────────────────────
if (!api) line('dissolve', 'scaled past nature a pocket dissolves at its own liquid\'s D ∝ 1/μ and Δp ∝ σ', false, missing, mains);
else {
  const loss = (liq) => {
    const f = field();
    const plate = plateOf(f);
    if (liq) pour(f, liq);
    const want = liq ? expected(plate, liq, 1) : plate;
    f.dissolve = 1e9;
    const b = put(f, 96, 96, 10);
    const a0 = b.r * b.r;
    f.step(dt, still, 0, 0, 0);
    return { got: a0 - b.r * b.r, want };
  };
  const oil = loss(null), syr = loss(SYRUP);
  const lawRatio = (oil.want.mu / syr.want.mu) * (syr.want.sigma / oil.want.sigma);
  const ok = oil.got > 0 && rel(syr.got / oil.got, lawRatio) < 0.01;
  line('dissolve', 'scaled past nature a pocket dissolves at its own liquid\'s D ∝ 1/μ and Δp ∝ σ', ok,
    `syrup loses ${(syr.got / oil.got).toFixed(4)} of the oil's area a step (law ${lawRatio.toFixed(4)})`,
    mains);
}

// ── wired ────────────────────────────────────────────────────────────
{
  const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
  const types = /speciesSnapshot\?\s*\(/.test(read('src/gpu/solverTypes.ts'));
  const reads = /speciesSnapshot\s*\(/.test(read('src/gpu/fluid/reads.ts'));
  const callers = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e) && !/src\/lib\/bubble(s|Liquid)\.ts$/.test(p) && /\.species\(/.test(read(p))) callers.push(p);
    }
  };
  walk('src');
  line('wired', 'the solver reads the species back for the bubbles, and the app hands it to them', types && reads && callers.length > 0,
    `solverTypes ${types ? 'says' : 'does not say'} speciesSnapshot, reads.ts ${reads ? 'does it' : 'does not'}, ${callers.length ? `handed in by ${callers.join(', ')}` : 'nothing calls .species('}`,
    !types);
}

const bad = checks.filter((c) => !c.ok);
const owedN = [...owed].filter((id) => OWED_IDS.includes(id)).length;
console.log(bad.length ? `\n${bad.length} of ${checks.length} bubble liquid checks failed` : `\nall ${checks.length} bubble liquid checks pass${owedN ? ` (${owedN} owed)` : ''}`);
process.exit(bad.length ? 1 : 0);
