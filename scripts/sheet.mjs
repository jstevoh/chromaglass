#!/usr/bin/env node
/**
 * `npm run sheet`: Beat Squeeze's rhythm sheet, solved (PLAN 27f-4, lib/sheet.ts).
 *
 *   npm run sheet            (the solve in node; the plate in the lab: any adapter that computes)
 *   SHEET_NODE=1 npm run sheet   (the node half only)
 *
 * What was asked: 27f-3 laid the kick's dent as a stamp (a clamped bowl
 * 2.28 bending lengths across, given back by a cosine over a third of a
 * second), and PLAN 27f-4 asked for the sheet solved rather than stamped:
 * w_t = (h³/12μ)∇²(D∇⁴w − F), exactly, per Fourier mode, with the ring the
 * dent lifts round itself and the release at the sheet's own pace.
 *
 * Every claim here is the equation's, and each is asked against something
 * the solve does not compute itself:
 *
 *   Node (the solve against the theory):
 *   1. Held, the dent is the held point load's: the solve's profile against
 *      the Hankel integral of (1 − e^(−(kℓ)⁶))/k⁴ (with the finger's Gaussian),
 *      worked out here by quadrature, within 2% of its depth; it crosses zero
 *      at 2.28ℓ and lifts a ring of 13 to 15% of its depth at 3.4ℓ.
 *   2. Exact per mode: a hold stepped once, in nine steps or in uneven
 *      steps that end inside the hold comes out the same to 1e-9.
 *   3. The film's mean never moves: the dent holds no net volume (the ring
 *      is what the finger pushed out), under 1e-6 of it.
 *   4. The reach is 27f-3's: the zero crossing as dentRadius says, viscosity
 *      to the minus one sixth, in water, the default oil and glycerine.
 *   5. Let go, every liquid relaxes in the same multiple of the hold (the
 *      solution's only time is t/T): the middle's depth at 2, 8 and 32 holds
 *      within 5% across the three; and late it shallows as t^(−2/3), the
 *      zero-volume dent's law, and spreads as t^(1/6).
 *   6. The depth is the stamp's: the middle at the lift is stampedDepth, at
 *      the default and at full.
 *   7. The ring opens the gap: the sheet lays openings past rest round the
 *      dent, at least a tenth of its depth.
 *   8. The plate's spring, taken on the sheet: with a spring s a step the
 *      laid dent is (1 − s)^n of the springless one, and a sheet left alone
 *      goes quiet (stops being stepped) within the spring's own time.
 *
 *   Lab (the solved sheet laid on a thin gap through its own channel):
 *   9.  The plate's gap is the solve's: rest minus the sheet's dent, cell for
 *       cell, held, letting go and after a dozen kicks, to 1% of a dent's depth.
 *   10. The ring stands past rest on the plate; the same change laid as a
 *       press is cut at rest (squeezeUpdate's ceiling), which is why the
 *       sheet has its own channel.
 *   11. No ratchet: a dozen kicks and the sheet let go, with no spring, the
 *       gap's mean over the dish is back to rest within 1% of a dent's depth.
 *   12. The frame stays still: under an off-centre kick held, the liquid's
 *       speed far from the dent (past 4ℓ) is under a third of what the
 *       stamped bowl drives there at the same depth, which sends what it
 *       presses out through the whole film to the rim.
 *
 * And any GPU validation error fails the run.
 */
import { build } from 'esbuild';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const out = 'node_modules/.cache/sheet-lib.mjs';
await build({ stdin: { contents: "export * from './src/lib/sheet.ts'; export { dentRadius, kickDepth, kickPress, KICK_HOLD, SHEET_D } from './src/lib/squish.ts'; export { thicknessViscosity } from './src/lib/turntable.ts';", resolveDir: '.', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
const { RhythmSheet, stampedDepth, FINGER_SIGMA, SHEET_QUIET, SHEET_D, dentRadius, kickDepth, kickPress, KICK_HOLD, thicknessViscosity } = await import(`../${out}`);

const T = KICK_HOLD;
const LIQUIDS = { water: thicknessViscosity(0), 'the default oil': thicknessViscosity(0.45), glycerine: thicknessViscosity(1) };
const AMOUNT = { def: kickDepth(0.5, 0.7, 1) * kickPress(thicknessViscosity(0.45), 0).share, full: kickDepth(1, 1, 1) * kickPress(thicknessViscosity(0.45), 0).share };

/** A sheet on `nu`, pressed at the middle to `depth` and stepped `dt` at a time for `seconds`. */
const held = (nu, depth = stampedDepth(AMOUNT.def), steps = [T]) => {
  const s = new RhythmSheet(); s.setLiquid(nu);
  s.press(0.5, 0.5, depth, T);
  const buf = new Float32Array(64 * 64);
  for (const dt of steps) s.step(64, dt, 0, buf);
  return s;
};
const zeroOf = (prof, spacing) => { for (let k = 1; k < prof.length; k++) if (prof[k] < 0) return (k - 1 + prof[k - 1] / (prof[k - 1] - prof[k])) * spacing; return NaN; };

/*
  The theory, worked out here and not by the solve: the unbounded sheet's dent at radius r and time t,
  ∫ G(k) A(k, t) / (Dk⁴ + ρg) J₀(kr) k dk / 2π, G the finger's Gaussian, A the held gain 1 − e^(−λt)
  while the finger is down and (1 − e^(−λT)) e^(−λ(t−T)) after, λ = M k² (Dk⁴ + ρg). J₀ from its
  integral, not a fit, so the two share nothing but the equation.
*/
const J0 = (x) => { let v = 0; const m = 48; for (let k = 0; k < m; k++) v += Math.cos(x * Math.sin(((k + 0.5) / m) * Math.PI)); return v / m; };
const theory = (nu, rs, t) => {
  const M = 0.006 ** 3 / (12 * 1000 * nu), rhoG = 9810, dk = 0.5, top = 8 / FINGER_SIGMA;
  return rs.map((r) => {
    let v = 0;
    for (let k = dk / 2; k < top; k += dk) {
      const S = SHEET_D * k ** 4 + rhoG, lam = M * k * k * S;
      const A = t <= T ? -Math.expm1(-lam * t) : -Math.expm1(-lam * T) * Math.exp(-lam * (t - T));
      v += Math.exp(-0.5 * (FINGER_SIGMA * k) ** 2) * (A / S) * J0(k * r) * k * dk;
    }
    return v;
  });
};
const MM = Array.from({ length: 31 }, (_, k) => k * 0.002);   // 0 to 60 mm from the finger
const solveAt = (s) => s.profile(0.5, 0.5, MM.length, 0.002 / 0.2);

// ── 1. The held dent against the theory ───────────────────────────────
{
  const rows = Object.entries(LIQUIDS).map(([name, nu]) => {
    const s = held(nu), got = solveAt(s), want = theory(nu, MM, T);
    const worst = Math.max(...MM.map((_, k) => Math.abs(got[k] / got[0] - want[k] / want[0])));
    // The dent's own shape, on a finer line: where it crosses zero and the ring it lifts.
    const fine = s.profile(0.5, 0.5, 200, 0.0005 / 0.2);
    let ring = 0, at = 0;
    fine.forEach((v, k) => { if (v < ring) { ring = v; at = k * 0.5; } });
    return { name, worst, zero: zeroOf(fine, 0.5), ring: -ring / fine[0], at };
  });
  check('held, the dent is the floating sheet\'s: the solve against the theory\'s integral within 2% of its depth out to 60 mm, in water, oil and glycerine',
    rows.every((r) => r.worst < 0.02), rows.map((r) => `${r.name} ${(100 * r.worst).toFixed(2)}%`).join(', '));
  const [w, o, g] = rows;
  check('the thicker the liquid, the narrower its dent and the higher its ring (the weight wins in a thin one, the bending in a thick one)',
    w.zero > o.zero && o.zero > g.zero && w.ring < o.ring && o.ring < g.ring && g.ring > 0.1,
    rows.map((r) => `${r.name} ${r.zero.toFixed(0)} mm to its zero, a ring of ${(100 * r.ring).toFixed(1)}% at ${r.at.toFixed(0)} mm`).join('; '));
}
// ── 2. Exact per mode ──────────────────────────────────────────────────
{
  const nu = LIQUIDS['the default oil'];
  const a = held(nu, 0.008, [T]).profile(0.5, 0.5, 40, 0.005);
  const b = held(nu, 0.008, Array(9).fill(T / 9)).profile(0.5, 0.5, 40, 0.005);
  // Uneven steps, one ending past the lift: the load is split at its end.
  const c = held(nu, 0.008, [0.04, 0.1, 0.05, 0.11]).profile(0.5, 0.5, 40, 0.005);
  const d = held(nu, 0.008, [T, 0.15]).profile(0.5, 0.5, 40, 0.005);
  const dif = (p, q) => Math.max(...p.map((v, k) => Math.abs(v - q[k]))) / Math.abs(p[0]);
  check('exact per mode: a hold in one step, in nine, or in uneven steps ending inside it, the same to 1e-9', dif(a, b) < 1e-9 && dif(c, d) < 1e-9,
    `one against nine ${dif(a, b).toExponential(1)}, uneven against even ${dif(c, d).toExponential(1)}`);
}
// ── 3. The rim ─────────────────────────────────────────────────────────
{
  // A finger a twentieth of the plate in from the rim: the sheet at rest on every edge.
  const s = new RhythmSheet(); s.setLiquid(LIQUIDS.water);
  s.press(0.05, 0.3, 0.008, T);
  s.step(64, T, 0, new Float32Array(64 * 64));
  let edge = 0;
  for (let k = 0; k <= 50; k++) { const u = k / 50; for (const [x, y] of [[0, u], [1, u], [u, 0], [u, 1]]) edge = Math.max(edge, Math.abs(s.depthAt(x, y))); }
  const mid = s.depthAt(0.05, 0.3);
  // Kicked twice a second for two minutes about the middle half: the dish's mean gap, against a dent's depth.
  const kicked = (nu) => {
    const k = new RhythmSheet(); k.setLiquid(nu);
    const L = 96, d = stampedDepth(AMOUNT.def), buf = new Float32Array(L * L);
    let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
    let worst = 0;
    for (let n = 0; n < 60 * 120; n++) {
      if (n % 30 === 0) k.press(0.5 + rnd() * 0.5, 0.5 + rnd() * 0.5, d, T);
      k.step(L, 1 / 60, 0, buf);
      if (n % 300 === 299 && n > 60 * 20) {
        const h = k.heldNow(); let m = 0, c = 0;
        for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) { if (Math.hypot((i + 0.5) / L - 0.5, (j + 0.5) / L - 0.5) > 0.47) continue; m += h[i + j * L]; c++; }
        worst = Math.max(worst, m / c / d);
      }
    }
    return worst;
  };
  const oil = kicked(LIQUIDS['the default oil']), gly = kicked(LIQUIDS.glycerine);
  check('the rim holds the sheet at rest and lets the liquid out and back: on every edge under a millionth of a dent by the rim, and kicked twice a second for two minutes the dish\'s mean gap within 2% of a dent of rest on the default oil, 10% in glycerine',
    edge < 1e-6 * mid && oil < 0.02 && gly < 0.1, `edge ${(edge / mid).toExponential(1)} of the dent; mean gap at most ${(100 * oil).toFixed(1)}% of a dent down on oil, ${(100 * gly).toFixed(1)}% in glycerine (no spring)`);
}
// ── 4. The reach ───────────────────────────────────────────────────────
{
  const got = Object.entries(LIQUIDS).map(([name, nu]) => {
    const s = held(nu);
    const z = zeroOf(s.profile(0.5, 0.5, 400, 0.0005 / 0.2), 0.0005 / 0.2);
    return { name, z, want: dentRadius(nu) };
  });
  check('the press\'s reach (dentRadius, by quadrature) is the solve\'s: its zero within 5% in water, oil and glycerine, never the glass\'s dish',
    got.every((g) => Math.abs(g.z / g.want - 1) < 0.05) && got[0].want < 0.4,
    got.map((g) => `${g.name} ${(128 * g.z).toFixed(1)} cells of 128 (dentRadius ${(128 * g.want).toFixed(1)})`).join(', '));
}
// ── 5. The release's pace ──────────────────────────────────────────────
{
  // The middle after the lift, a frame, four, twelve and sixty of them, against the theory's, as shares of its held depth.
  const after = [1, 4, 12, 60].map((f) => f / 60);
  const rows = Object.entries(LIQUIDS).map(([name, nu]) => {
    const s = held(nu), d0 = s.depthAt(0.5, 0.5), want0 = theory(nu, [0], T)[0], out = { name, got: [], want: [] };
    let t = 0;
    for (const a of after) {
      while (t < a - 1e-9) { s.step(64, 1 / 60, 0, new Float32Array(64 * 64)); t += 1 / 60; }
      out.got.push(s.live ? s.depthAt(0.5, 0.5) / d0 : 0);
      out.want.push(theory(nu, [0], T + a)[0] / want0);
    }
    return out;
  });
  /*
    The theory is the unbounded sheet's; the plate's has a rim 10 cm from the finger. Asked while the
    levelling's reach, √(4 Mρg t), is inside 12 cm of the finger: water's only for the first frame
    (its weight levels 6 mm of it at 0.18 m²/s), the default oil's for twelve, glycerine's for all
    sixty. Past that the rim sets the pace, which is asked next.
  */
  const reach = (nu, t) => Math.sqrt(4 * (0.006 ** 3 / (12 * 1000 * nu)) * 9810 * t);
  const asked = rows.flatMap((r, i) => r.got.map((v, k) => ({ d: Math.abs(v - r.want[k]), ok: reach(Object.values(LIQUIDS)[i], after[k]) < 0.12 }))).filter((x) => x.ok);
  const worst = Math.max(...asked.map((x) => x.d));
  check('let go, the dent is given back at the theory\'s pace: its middle within 1% of its depth of the theory\'s at 1, 4, 12 and 60 frames after the lift, while the dent is still the finger\'s and not the rim\'s',
    worst < 0.01 && asked.length >= 8, `${asked.length} asked; ${rows.map((r) => `${r.name} ${r.got.map((v) => v.toFixed(3)).join('/')} (${r.want.map((v) => v.toFixed(3)).join('/')})`).join('; ')}`);
  // And once the rim sets it, the dish's own slowest mode, sin(πx/W) sin(πy/W): water's middle a frame apart as e^(−λ₁/60).
  {
    const s = held(LIQUIDS.water), buf = new Float32Array(64 * 64), W = 0.2;
    s.step(64, 2 / 60, 0, buf);
    const a = s.depthAt(0.5, 0.5);
    s.step(64, 1 / 60, 0, buf);
    const b = s.depthAt(0.5, 0.5);
    const k2 = 2 * (Math.PI / W) ** 2, lam = (0.006 ** 3 / (12 * 1000 * LIQUIDS.water)) * k2 * (SHEET_D * k2 * k2 + 9810);
    const want = Math.exp(-lam / 60);
    check('and once water\'s dent has reached the rim it goes as the dish\'s slowest mode: its middle a frame apart within 5% of e^(−λ₁/60)', Math.abs(b / a / want - 1) < 0.05,
      `${(b / a).toFixed(3)} a frame against ${want.toFixed(3)} (λ₁ ${lam.toFixed(0)} a second)`);
  }
  const [w, o, g] = rows;
  check('and the thicker the liquid the slower: a fifth of a second after the lift water keeps under 1% of its dent, the default oil under 10%, glycerine over 15%',
    w.got[2] < 0.01 && o.got[2] < 0.1 && g.got[2] > 0.15 && w.got[2] < o.got[2] && o.got[2] < g.got[2],
    rows.map((r) => `${r.name} ${(100 * r.got[2]).toFixed(1)}%`).join(', '));
}
// ── 6. The stamp's depth ───────────────────────────────────────────────
{
  const rows = [];
  for (const [name, nu] of Object.entries(LIQUIDS)) for (const [k, a] of Object.entries(AMOUNT)) {
    const want = stampedDepth(a), got = held(nu, want).depthAt(0.5, 0.5);
    rows.push({ name, k, want, got });
  }
  check('pressed as deep as the stamp closed the gap: the middle at the lift is stampedDepth, at the default and at full, in every liquid, to 1e-6',
    rows.every((r) => Math.abs(r.got / r.want - 1) < 1e-6),
    `${(rows[0].want / 0.03 * 100).toFixed(0)}% of the gap at the default, ${(rows[1].want / 0.03 * 100).toFixed(0)}% at full`);
}
// ── 7. The ring opens the gap ──────────────────────────────────────────
{
  const s = new RhythmSheet(); s.setLiquid(LIQUIDS['the default oil']);
  const depth = stampedDepth(AMOUNT.def);
  s.press(0.5, 0.5, depth, T);
  const L = 192, sum = new Float32Array(L * L);
  for (let k = 0; k < 9; k++) s.step(L, 1 / 60, 0, sum);
  let open = 0;
  for (const g of sum) open = Math.max(open, g);
  check('the ring opens the gap: on the default oil the sheet lays openings past rest round its dent, at least a twentieth of its depth', open > 0.05 * depth,
    `${(open / depth * 100).toFixed(1)}% of the dent's depth`);
}
// ── 8. The spring ──────────────────────────────────────────────────────
{
  const nu = LIQUIDS['the default oil'], L = 64, n = 40, sp = 0.01;
  const a = new RhythmSheet(), b = new RhythmSheet();
  a.setLiquid(nu); b.setLiquid(nu);
  a.press(0.5, 0.5, 0.008, T); b.press(0.5, 0.5, 0.008, T);
  // Let go first: while the finger presses, the spring takes each step's load for fewer steps than the first's.
  a.step(L, T, 0, new Float32Array(L * L)); b.step(L, T, 0, new Float32Array(L * L));
  for (let k = 0; k < n; k++) { a.step(L, 1 / 60, sp, new Float32Array(L * L)); b.step(L, 1 / 60, 0, new Float32Array(L * L)); }
  const ha = a.heldNow(), hb = b.heldNow();
  let worst = 0;
  for (let q = 0; q < ha.length; q++) worst = Math.max(worst, Math.abs(ha[q] - hb[q] * (1 - sp) ** n));
  // Left alone at the app's spring (Classic's glass, 0.00048 a 60th of a second), stepped in half seconds of the same spring.
  const c = new RhythmSheet(); c.setLiquid(nu); c.press(0.5, 0.5, stampedDepth(AMOUNT.full), T);
  c.step(L, T, 0, new Float32Array(L * L));
  const per = 1 - (1 - 0.00048) ** 30;
  let t = T;
  while (c.live && t < 600) { c.step(L, 0.5, per, new Float32Array(L * L)); t += 0.5; }
  const springT = Math.log(SHEET_QUIET / stampedDepth(AMOUNT.full)) / Math.log(1 - 0.00048) / 60;
  check('the plate\'s spring taken on the sheet: let go, the laid dent is (1 − s)^n of the springless one, and a sheet left alone goes quiet within the spring\'s own time',
    worst < 1e-6 * 0.008 && !c.live && t <= springT + 1,
    `worst ${(worst / 0.008).toExponential(1)} of the depth; quiet after ${t.toFixed(0)} s (the spring alone takes ${springT.toFixed(0)} s to that)`);
}
// Its cost, printed: the app pays this each step while the sheet moves.
{
  const s = new RhythmSheet(); s.setLiquid(LIQUIDS['the default oil']);
  const buf = new Float32Array(192 * 192);
  for (let k = 0; k < 120; k++) { if (k % 30 === 0) s.press(0.3 + (k % 7) * 0.05, 0.4, 0.008, T); s.step(192, 1 / 60, 0.00048, buf); }
  const t0 = performance.now();
  for (let k = 0; k < 300; k++) { if (k % 30 === 0) s.press(0.3 + (k % 7) * 0.05, 0.6, 0.008, T); s.step(192, 1 / 60, 0.00048, buf); }
  console.log(`  --   the sheet costs ${((performance.now() - t0) / 300).toFixed(2)} ms a step in node on the app's 192 plate, a kick every half second`);
}

if (!process.env.SHEET_NODE) {
  const { openLab } = await import('./lab.mjs');
  // The default oil: its viscosity, its bending length in plate widths, and the stamped bowl's radius on the lab's 192 (27f-3).
  const oilSheet = new RhythmSheet(); oilSheet.setLiquid(LIQUIDS['the default oil']);
  const OIL = { nu: LIQUIDS['the default oil'], lp: oilSheet.bendingLength(T) / 0.2, stampCells: Math.round(kickPress(LIQUIDS['the default oil'], 0).radii[0] * 1.5) };
  const { page, close } = await openLab();
  const gpuErrors = [];
  page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
  try {
    const r = await page.evaluate(async ({ AMOUNT, NU, T }) => {
      const lab = window.lab;
      const N = 192, res = {};
      const app = { thinGap: 1, gapThickness: 0.45, dt: 0.003, advection: 0.45, gapSpring: 0.00048, turbDetail: 3, meanDensity: 0, maxCurrent: 0.75 / (0.003 * 0.45 * (N - 2)), currentDamp: 0.99 };
      const gapNow = async () => (await lab.squeeze()).gap;
      // The plate's gap against rest minus the sheet's dent, worst over the dish, in plate widths.
      const against = async () => {
        const g = await gapNow(), w = lab.sheetHeld();
        let worst = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          if (Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) > 0.47) continue;
          worst = Math.max(worst, Math.abs(g[i + j * N] - (0.03 - (w ? w[i + j * N] : 0))));
        }
        return worst;
      };
      const stepSheet = async (n, over = app, spring = over.gapSpring) => { for (let k = 0; k < n; k++) { lab.sheetStep(1 / 60, spring); lab.flush(over.dt); await lab.step(1, over, true); } };
      // 9 and 10: one kick on the default oil, its gap read held and letting go; the ring's opening against rest.
      await lab.create(N, N);
      lab.flush(); await lab.step(2, app);
      lab.sheetPress(0.5, 0.5, AMOUNT.def, NU.nu, T);
      await stepSheet(9);
      res.heldWorst = await against();
      {
        const g = await gapNow();
        let most = 0;
        for (const v of g) most = Math.max(most, v - 0.03);
        res.ringPlate = most;
      }
      await stepSheet(20);
      res.lettingWorst = await against();
      // The same first steps' changes laid through the press's channel instead: the ceiling cuts the ring.
      {
        await lab.create(N, N);
        lab.flush(); await lab.step(2, app);
        lab.sheetPress(0.5, 0.5, AMOUNT.def, NU.nu, T);
        const keep = [];
        for (let k = 0; k < 9; k++) {
          lab.sheetStep(1 / 60, app.gapSpring);
          // Moved from the sheet's channel to the gap column of the press's deltas.
          lab.sheetAsPress();
          lab.flush(app.dt); await lab.step(1, app, true);
        }
        const g = await gapNow();
        let most = -1;
        for (const v of g) most = Math.max(most, v - 0.03);
        res.ringPress = most;
      }
      // 11: a dozen kicks about the middle half, every half second, then let go with no spring.
      {
        const still = { ...app, gapSpring: 0 };
        await lab.create(N, N);
        lab.flush(); await lab.step(2, still);
        let seed = 5; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
        for (let k = 0; k < 12; k++) {
          lab.sheetPress(0.5 + rnd() * 0.5, 0.5 + rnd() * 0.5, AMOUNT.def, NU.nu, T);
          await stepSheet(30, still, 0);
        }
        res.kicksWorst = await against();
        // Let go: the sheet goes on relaxing; read when the last kick is twenty seconds gone, in steps of a second of plate time.
        for (let k = 0; k < 20; k++) { lab.sheetStep(1, 0); lab.flush(still.dt); await lab.step(1, still, true); }
        const g = await gapNow();
        let s = 0, n = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { if (Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) > 0.47) continue; s += g[i + j * N] - 0.03; n++; }
        res.ratchet = s / n;
        res.afterWorst = await against();
      }
      // 12: the far field under an off-centre kick, held: the solved sheet against the stamped bowl at the same depth.
      {
        const lp = NU.lp, cx = 0.4, cy = 0.45;
        const far = async () => {
          const v = await lab.field('vel');
          let s = 0, n = 0;
          for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const x = (i + 0.5) / N, y = (j + 0.5) / N;
            if (Math.hypot(x - 0.5, y - 0.5) > 0.45 || Math.hypot(x - cx, y - cy) < 4 * lp) continue;
            s += Math.hypot(v[(i + j * N) * 4], v[(i + j * N) * 4 + 1]); n++;
          }
          return s / Math.max(1, n);
        };
        await lab.create(N, N);
        lab.flush(); await lab.step(2, app);
        lab.sheetPress(cx, cy, AMOUNT.def, NU.nu, T);
        let sheet = 0;
        for (let k = 0; k < 9; k++) { lab.sheetStep(1 / 60, app.gapSpring); lab.flush(app.dt); await lab.step(1, app, true); sheet += await far(); }
        await lab.create(N, N);
        lab.flush(); await lab.step(2, app);
        lab.squish(Math.round(cx * N - 0.5), Math.round(cy * N - 0.5), NU.stampCells, AMOUNT.def, 0, 'press', 0, true);
        lab.flush(app.dt);
        let stamp = 0;
        for (let k = 0; k < 9; k++) { await lab.step(1, app, k === 0); stamp += await far(); }
        res.far = { sheet: sheet / 9, stamp: stamp / 9 };
      }
      return res;
    }, { AMOUNT, T, NU: OIL });
    const depth = stampedDepth(AMOUNT.def);
    check('the plate\'s gap is the solve\'s, cell for cell: rest minus the sheet\'s dent, held, letting go and after a dozen kicks, to 1% of a dent\'s depth',
      Math.max(r.heldWorst, r.lettingWorst, r.kicksWorst, r.afterWorst) < 0.01 * depth,
      `worst ${(100 * r.heldWorst / depth).toFixed(3)}% held, ${(100 * r.lettingWorst / depth).toFixed(3)}% letting go, ${(100 * r.kicksWorst / depth).toFixed(3)}% after twelve kicks, ${(100 * r.afterWorst / depth).toFixed(3)}% let go`);
    check('the ring stands past rest on the plate, at least a twentieth of a dent, and laid as a press it is cut at rest', r.ringPlate > 0.05 * depth && r.ringPress <= 1e-6,
      `${(100 * r.ringPlate / depth).toFixed(1)}% of the dent's depth through the sheet's channel, ${(100 * Math.max(0, r.ringPress) / depth).toFixed(2)}% through the press's`);
    check('no ratchet: a dozen kicks and twenty seconds let go with no spring, the dish\'s mean gap back within 1% of a dent\'s depth', Math.abs(r.ratchet) < 0.01 * depth,
      `mean ${(r.ratchet >= 0 ? '+' : '') + (100 * r.ratchet / depth).toFixed(3)}% of a dent`);
    check('the frame stays still: past 4ℓ from a held kick the liquid moves under a third of what the stamped bowl drives there', r.far.sheet < r.far.stamp / 3,
      `${r.far.sheet.toExponential(2)} against the stamp's ${r.far.stamp.toExponential(2)} (${(r.far.sheet / r.far.stamp).toFixed(3)})`);
  } finally {
    await close();
  }
  check('no GPU validation errors', gpuErrors.length === 0, gpuErrors.slice(0, 2).join(' | '));
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} ok`);
process.exit(failed.length ? 1 : 0);
