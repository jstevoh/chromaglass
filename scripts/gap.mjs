#!/usr/bin/env node
/**
 * The glass sandwich's gap, one number (PLAN 38r), in node:
 *
 *   npm run gap
 *
 * What was asked (the owner, 2026-10-30): "Put the glass sandwich like it's
 * supposed to be." The plate's two glasses are 6 mm apart at rest in the
 * middle, which is a dish with a glass resting on a deep layer; a sandwich
 * of nested clock glasses on an overhead projector holds a few millimetres
 * of oil and water, and PLAN 38r moves it to 2 mm. This is the first part:
 * the gap is one number (lib/turntable.ts DISH_GAP_METRES), still 6 mm, so
 * the move is that number and the retuning it asks, and nothing else.
 *
 * The 6 mm lived in three places that had to agree by hand (REST_GAP,
 * DISH_REST_GAP and the gap kernels' literals) and in about twenty readers
 * that turned the gap field into metres by the plate's width, which is only
 * right while the rest gap is 0.03 of the plate. So this holds the feature,
 * that every reader of the gap as a length reads the same rest gap, by
 * working each one's physics out here in SI from H0 below alone and holding
 * the code's number to it (H0 is the millimetres, written here a second
 * time on purpose: the gap's move changes both, and a reader the constant
 * does not reach fails a line):
 *
 *   1. the rest gap is H0, and the gap field's rest number (0.03, in gap
 *      units) times the metres in a unit is that H0, solver and lib alike;
 *   2. the gap kernels lay that rest number, floor and ceiling: the WGSL
 *      the gap stage compiles carries the constants and no other;
 *   3. the drag time ρh²/12μ (the plate's memory, the spin's lag) at H0,
 *      by both the solver's and the turntable's function;
 *   4. the oil's free rise up a tipped plate, Δρ g h₀²/12μ_ref;
 *   5. a held pour's share a second, over a dome of πr²/2 × H0;
 *   6. the cover glass's shear drag, μ/(m h₀) a second;
 *   7. the rhythm sheet's film (its mobility h₀³/12μ) and the dent radius
 *      the kick's other effects take from it;
 *   8. a finger's Brinkman edge, two of h₀/√12;
 *   9. the ferrofluid's room under the top glass, and the closeup drop's,
 *      in capillary lengths: h₀ over l_c;
 *  10. the numbers the shaders are compiled with: the thin solve's clear
 *      viscosity read back (G²/12ν_water, G = h₀/0.03), the spun dish's
 *      swirl (h in metres) and the closeup drop's view (h in plate widths);
 *  11. and no source anywhere under src/ makes the gap a length by the
 *      plate's width (a gap times PLATE_METRES or DISH_METRES), which is how
 *      every one of the old 6 mm readers was written: a reader the lines
 *      above do not reach (the breath, the slump's gap, the glass's drift)
 *      cannot go back to it unseen.
 *
 * The drag the solver applies on the GPU is `npm run thingap` (a push fades
 * at 12ν/h² with h the same constant), and the turntable's lag `npm run
 * turntable`. What does not read the constant yet, each a PLAN item: the
 * tilt's slosh (38r-1, a free surface the sandwich does not have), a drop's
 * pancake radius and the beads' merge time (38r-2), and the milk's
 * scattering depth (38i).
 */
import { build } from 'esbuild';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, tol = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b);

const out = 'node_modules/.cache/gap-lib.mjs';
await build({
  stdin: {
    contents: [
      "export * from './src/lib/turntable.ts';",
      "export { REST_GAP, REST_GAP_METRES, GAP_METRES, PLATE_METRES, OIL_LIFT, NU_REF, SPIN_OIL_LIGHT, thinGapDragSeconds, thinGapViscosity } from './src/gpu/fluid/constants.ts';",
      "export { GAP_KERNELS } from './src/gpu/wgsl/fluid/gap.ts';",
      "export { pourShare, HELD_POUR } from './src/lib/liquidProps.ts';",
      "export { coverDrag, COVER_KG_M2 } from './src/lib/plateRock.ts';",
      "export { RhythmSheet, sheetReach } from './src/lib/sheet.ts';",
      "export { dentRadius, KICK_HOLD } from './src/lib/squish.ts';",
      "export { handEdge } from './src/lib/handSolid.ts';",
      "export { FILM_TOP, FILM_H0 } from './src/gpu/wgsl/standing.ts';",
      "export { SPIKE_PITCH } from './src/gpu/wgsl/spikes.ts';",
      "export { thinGapKernels } from './src/gpu/wgsl/thinGap.ts';",
      "export { FORCE_KERNELS } from './src/gpu/wgsl/fluid/forces.ts';",
      "export { FERRO_DROP_WGSL, GAP_LC } from './src/gpu/wgsl/ferroDrop.ts';",
      "export * as C from './src/lib/cover.ts';",
    ].join('\n'),
    resolveDir: '.', loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const L = await import(`../${out}`);

// The sandwich, in SI, from the millimetres and the liquids' data alone.
const H0 = 0.002;           // m, the rest gap in the middle (PLAN 38r: a real sandwich, 1–3 mm)
const MM = `${H0 * 1000} mm`;
const W = 0.2;              // m, the clock glass
const G = 9.81;

// 1
check(`the rest gap is ${MM}, and the field's rest number times its metres is that, in the solver and the lib alike`,
  L.DISH_GAP_METRES === H0 && L.REST_GAP_METRES === H0 && L.REST_GAP === L.DISH_REST_GAP && near(L.REST_GAP * L.GAP_METRES, H0) && L.GAP_METRES === L.DISH_GAP_FIELD_METRES
    && near(L.DISH_GAP_FIELD_UV * L.DISH_REST_GAP * W, H0) && L.PLATE_METRES === W,
  `${(L.DISH_GAP_METRES * 1000).toFixed(2)} mm; ${L.REST_GAP} gap units × ${L.GAP_METRES.toFixed(5)} m = ${(L.REST_GAP * L.GAP_METRES * 1000).toFixed(3)} mm; floor ${(L.DISH_GAP_RANGE[0] * L.GAP_METRES * 1000).toFixed(2)} mm, ceiling ${(L.DISH_GAP_RANGE[1] * L.GAP_METRES * 1000).toFixed(2)} mm`);

// 2: the kernels' rest shape and clamp, as compiled.
{
  const src = ['gapRest', 'squeezeUpdate', 'gapReshape'].map((k) => L.GAP_KERNELS[k] ?? '').join('\n');
  // The rest is the cover's gap less the dome (PLAN 38r-5): the dome's scale is the rest number, the mean the cover's uniform or the reshape's two covers.
  const restAt = [...src.matchAll(/clamp\((S\.cover|A\.a\.[zw]) - ([0-9.]+) \*/g)];
  const rests = restAt.map((m) => Number(m[2]));
  const means = restAt.map((m) => m[1]).join(' ');
  const clamps = [...src.matchAll(/, (0\.00[0-9]+), (0\.0[0-9]+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const floors = [...src.matchAll(/max\(([0-9.]+), /g)].map((m) => Number(m[1]));
  check('the gap kernels lay the rest number, floor and ceiling the lib holds, and no other',
    // Exactly as many as the three kernels write (4 rests, 5 clamps, 3 floors), so one written another way is missed by count.
    rests.length === 4 && rests.every((v) => v === L.DISH_REST_GAP) && means === 'S.cover S.cover A.a.z A.a.w'
      && clamps.length === 5 && clamps.every(([a, b]) => a === L.DISH_GAP_RANGE[0] && b === L.DISH_GAP_RANGE[1])
      && floors.length === 3 && floors.every((v) => v === L.DISH_GAP_RANGE[0]),
    `rests ${[...new Set(rests)].join(', ')} (${rests.length}) about ${means}; clamps ${[...new Set(clamps.map((c) => c.join('–')))].join(', ')} (${clamps.length}); floors ${[...new Set(floors)].join(', ')}`);
}

// 3
{
  const tau = (nu) => H0 * H0 / (12 * nu);
  const ts = [0, 0.45, 1].map((t) => [L.thinGapDragSeconds(t), L.dragSeconds(L.thicknessViscosity(t)), tau(1e-6 * 10 ** (3 * t))]);
  check(`the drag time ρh²/12μ at ${MM}, by the solver's and the turntable's function: water, the default oil, glycerine`,
    ts.every(([a, b, c]) => near(a, c, 1e-6) && near(b, c, 1e-6)),
    ts.map(([a, , c]) => `${a.toPrecision(3)} s (SI ${c.toPrecision(3)})`).join(', '));
}

// 4
{
  const want = L.SPIN_OIL_LIGHT * G * H0 * H0 / (12 * L.thinGapViscosity(0.45));
  check(`the oil's free rise up a tipped plate is Darcy's Δρ g h₀²/12μ_ref at ${MM}`, near(L.OIL_LIFT, want, 1e-6) && near(L.NU_REF, L.thinGapViscosity(0.45), 1e-12),
    `${(L.OIL_LIFT * 100).toFixed(2)} cm/s per unit sinθ (SI ${(want * 100).toFixed(2)})`);
}

// 5
{
  const r = 3 / 128, s = 1 / 60;
  const want = L.HELD_POUR * s / (Math.PI * (r * W) ** 2 / 2 * H0);
  const got = L.pourShare(r, 1, s);
  check(`a held pour's share a step is its volume over a dome of πr²/2 × ${MM}`, near(got, want, 1e-9) && got < 1,
    `${got.toFixed(4)} of the column a step (SI ${want.toFixed(4)})`);
}

// 6
{
  const want = 1000 * L.thicknessViscosity(0.45) / (L.COVER_KG_M2 * H0);
  check(`the cover glass's shear drag is μ/(m h₀) on the ${MM} film`, near(L.coverDrag(0.45), want, 1e-9),
    `${L.coverDrag(0.45).toFixed(3)} a second (SI ${want.toFixed(3)})`);
}

// 7
{
  const sheet = new L.RhythmSheet({ n: 32 });
  const nu = L.thicknessViscosity(0.45);
  sheet.setLiquid(nu);
  const M = H0 ** 3 / (12 * 1000 * nu);
  const reach = L.sheetReach(nu, L.KICK_HOLD), reachSI = L.sheetReach(nu, L.KICK_HOLD, H0);
  const dent = L.dentRadius(nu);
  check(`the rhythm sheet's film is ${MM} (mobility h₀³/12μ), and the kick's dent radius is taken on it`,
    sheet.h0 === H0 && near(sheet.M, M, 1e-9) && reach === reachSI && near(dent, reachSI / W, 1e-12),
    `M ${sheet.M.toExponential(3)} m³/(Pa·s) (SI ${M.toExponential(3)}); dent ${(dent * W * 1000).toFixed(2)} mm`);
}

// 8
{
  const cells = 192, want = 2 * (H0 / W) * cells / Math.sqrt(12);
  check('a finger\'s edge is two Brinkman lengths, 2·h₀/√12', near(L.handEdge(cells), want, 1e-9),
    `${L.handEdge(cells).toFixed(3)} cells of 192 (${(2 * H0 / Math.sqrt(12) * 1000).toFixed(2)} mm)`);
}

// 9: the room a ferrofluid's layer has under the top glass, in l_c, as standing.ts writes it (less the 0.03 l_c it always took off).
{
  const lc = L.SPIKE_PITCH / (2 * Math.PI) * W;
  const roomLc = L.FILM_TOP * L.FILM_H0 + 0.03;
  check('the ferrofluid\'s room under the top glass, and the closeup drop\'s, are h₀ over its capillary length', near(roomLc, H0 / lc, 1e-9) && near(L.GAP_LC, H0 / lc, 1e-9),
    `${roomLc.toFixed(3)} l_c under the layer, ${L.GAP_LC.toFixed(3)} over the drop (h₀/l_c ${(H0 / lc).toFixed(3)}, l_c ${(lc * 1000).toFixed(2)} mm), ${L.FILM_TOP.toFixed(2)} full cells`);
}

// 10: the shaders' compiled numbers, each worked here from the millimetres.
{
  const G = H0 / 0.03, Guv = H0 / W / 0.03;
  const prep = L.thinGapKernels('', '', '').hsPrep ?? '';
  const swirl = L.FORCE_KERNELS.spinSwirl ?? '';
  const lnClear = (G * G / 12 / 1e-6).toFixed(4);
  // Each number as the shader was compiled with it, read back out of its code.
  const num = (code, re) => { const m = re.exec(code); return m ? Number(m[1]) : NaN; };
  const gotClear = num(prep, /let lnClear = log\(max\(A\.a\.x \* ([0-9.e-]+),/);
  const gotSwirl = num(swirl, /\) \* ([0-9.e-]+);/);
  const gotDrop = num(L.FERRO_DROP_WGSL, /let gapLc = gapUnits \* ([0-9.e-]+) \/ LC_UV;/);
  check(`the shaders are compiled with the ${MM}: the thin solve's viscosity read back, the spun dish's swirl, the closeup drop's view`,
    near(gotClear, Number(lnClear), 1e-6) && near(gotSwirl, G, 1e-9) && near(gotDrop, Guv, 1e-9),
    `G²/12ν_water ${gotClear} in hsPrep (SI ${lnClear}); ${gotSwirl} m a unit in spinSwirl (SI ${G.toFixed(5)}); ${gotDrop} of the plate a unit in the drop's view (SI ${Guv.toFixed(4)})`);
}

// 11: no source makes the gap a length by the plate's width.
{
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
  walk('src');
  const bad = /(REST_GAP|DISH_REST_GAP|\bgap\b|sq\.r|\.gap|\bh0\b|\bhw\b|\))\s*\*\s*(\$\{)?(PLATE_METRES|DISH_METRES)\b|(PLATE_METRES|DISH_METRES)\s*\*\s*(REST_GAP|DISH_REST_GAP|\bgap\b)/;
  const hits = [];
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (bad.test(line)) hits.push(`${f}:${i + 1}`); });
  check('no source makes the gap a length by the plate\'s width', files.length > 100 && hits.length === 0,
    hits.length ? hits.join(', ') : `${files.length} files read, none`);
}

/*
  12–17: the liquid's amount sets the gap (PLAN 38r-5, lib/cover.ts).

  Each line works the physics out here, in SI from H0 and the textbook
  numbers, and holds lib/cover.ts to it. The settle is integrated here by
  RK4 at a hundredth of the fastest time scale, a different method from the
  lib's exact solve, so a slip in either the separation or the bisection
  shows as a gap between the two.
*/
const C = L.C;
const R = W / 2, A = Math.PI * R * R, SIN60 = Math.sin(Math.PI / 3);
const WATER = { nu: 1e-6, sigma: 0.072, mu: 1e-3 }, THICK = { nu: 2e-5, sigma: 0.072 - 0.007 * Math.log10(20) / 3, mu: 2e-2 };
const glassG = 5 * A * 1000, weight = (glassG / 1000) * G / A;
const rk4 = (h0, P, sig, mu, t) => {
  const f = (h) => -(2 / 3) * h ** 3 * (P - 2 * sig * SIN60 / h) / (mu * R * R);
  const tau = mu * R * R / (P * h0 ** 3), n = Math.max(2000, Math.ceil(t / (tau / 100)));
  let h = h0; const dt = t / n;
  for (let i = 0; i < n; i++) { const a = f(h), b = f(h + a * dt / 2), c = f(h + b * dt / 2), d = f(h + c * dt); h += (a + 2 * b + 2 * c + d) * dt / 6; }
  return h;
};

// 12
{
  const s = C.coverNew(C.COVER_FULL_ML);
  check(`the default plate holds V = A·${MM} (${(A * H0 * 1e6).toFixed(2)} mL) under a glass of 5 kg/m² (${glassG.toFixed(1)} g), so h = V/A is today's ${MM}`,
    near(C.COVER_FULL_ML, A * H0 * 1e6, 1e-12) && near(C.COVER_GLASS_G, glassG, 1e-12) && near(s.h, H0, 1e-12) && s.bead === 0,
    `${C.COVER_FULL_ML.toFixed(3)} mL, ${C.COVER_GLASS_G.toFixed(2)} g, h ${(s.h * 1000).toFixed(4)} mm`);
}

// 13
{
  const hold = 2 * WATER.sigma * SIN60 / H0, hHold = 2 * WATER.sigma * SIN60 / weight;
  const lc = Math.sqrt(WATER.sigma / (1000 * G)), bead = 2 * Math.PI * R * (Math.PI / 4) * lc * lc;
  check(`the edge's meniscus holds 2σ sinθ/h (θ 60°, σ water ${WATER.sigma}): ${hold.toFixed(1)} Pa at ${MM} against the glass's ${weight.toFixed(1)} Pa; h_hold 2σ sinθ/(w g); the bead 2πR·(π/4)·l_c²`,
    near(C.holdPressure(C.carrierTension(1e-6), H0), hold, 1e-12) && hold > weight && near(C.weightPressure(glassG), weight, 1e-12)
      && near(C.holdGap(C.carrierTension(1e-6), weight), hHold, 1e-12) && near(C.beadCapacity(C.carrierTension(1e-6)), bead, 1e-12)
      && near(C.carrierTension(2e-5), THICK.sigma, 1e-12),
    `h_hold ${(hHold * 1000).toFixed(3)} mm, bead ${(bead * 1e6).toFixed(2)} mL, σ thick ${C.carrierTension(2e-5).toFixed(4)}`);
}

// 14
{
  const rows = [];
  let ok = true;
  for (const [name, k] of [['water', WATER], ['thick', THICK]]) {
    const hHold = 2 * k.sigma * SIN60 / weight;
    for (const t of [0.02, 0.05, 0.2, 1, 4]) {
      const want = rk4(0.003, weight, k.sigma, k.mu, t), got = C.stefanSettle(0.003, weight, k.sigma, k.mu, t);
      ok &&= Math.abs(got - want) <= 1e-4 * want && got >= hHold;
      if (t === 0.05 || t === 1) rows.push(`${name} ${t} s ${(got * 1000).toFixed(4)} mm (RK4 ${(want * 1000).toFixed(4)})`);
    }
    // The settle's own time: the drop from 3 mm halfway to h_hold.
    let lo = 0, hi = 100;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (C.stefanSettle(0.003, weight, k.sigma, k.mu, m) > (0.003 + hHold) / 2) lo = m; else hi = m; }
    rows.push(`${name} half-settled in ${(lo * 1000).toFixed(0)} ms`);
    ok &&= name === 'water' ? lo > 0.005 && lo < 0.1 : lo > 0.1 && lo < 3;
  }
  check(`an over-full plate settles by Stefan, dh/dt = −(2/3)h³(P − P_hold)/(μR²), to h_hold and not past it: tens of ms for water, about a second thick`, ok, rows.join('; '));
}

// 15
{
  // A pour of 4 mL onto the default plate: the glass rises by Q/A, and below h_hold nothing leaves.
  const s = C.coverNew(C.COVER_FULL_ML), k = { nu: 1e-6, grams: glassG, hand: 0 };
  C.coverAdd(s, 4e-6);
  for (let i = 0; i < 120; i++) C.coverStep(s, 1 / 60, k);
  const rise = s.h - H0;
  // Then 20 mL more: past h_hold, the excess goes to the bead and then off the dish.
  C.coverAdd(s, 20e-6);
  for (let i = 0; i < 120; i++) C.coverStep(s, 1 / 60, k);
  const hHold = 2 * WATER.sigma * SIN60 / weight;
  const lc = Math.sqrt(WATER.sigma / (1000 * G)), bead = 2 * Math.PI * R * (Math.PI / 4) * lc * lc;
  const sum = s.plate + s.bead + s.off;
  check(`a pour under the glass raises it by Q/A and spills nothing below h_hold; past it the glass settles to h_hold, the bead fills, the rest runs off; plate + bead + off = everything put in`,
    near(rise, 4e-6 / A, 1e-9) && Math.abs(s.h - hHold) < 1e-6 && near(s.bead, bead, 1e-9) && s.off > 0 && near(sum, s.added, 1e-12) && near(s.added, (C.COVER_FULL_ML + 24) * 1e-6, 1e-12),
    `4 mL raised it ${(rise * 1e6).toFixed(1)} µm (Q/A ${(4e-6 / A * 1e6).toFixed(1)}); +20 mL settled at ${(s.h * 1000).toFixed(4)} mm (h_hold ${(hHold * 1000).toFixed(4)}), bead ${(s.bead * 1e6).toFixed(2)} mL, off ${(s.off * 1e6).toFixed(2)} mL; ledger ${(sum * 1e6).toFixed(4)} of ${(s.added * 1e6).toFixed(4)} mL`);
}

// 16
{
  /*
    The hand. A light press (20 Pa over the glass's 49) is past what the edge
    holds at 2 mm, so the glass settles to 2σ sinθ/(w g + 20) and the liquid
    it pushes out fills the bead and runs off past it: a press on a real
    cover loses liquid over the edge, which is why the Liquid dial tops it
    up. A lift harder than the glass weighs then draws the bead back in, by
    exactly the bead's volume over A, and stops: what ran off is gone.
  */
  const s = C.coverNew(C.COVER_FULL_ML);
  for (let i = 0; i < 60; i++) C.coverStep(s, 1 / 60, { nu: 1e-6, grams: glassG, hand: 0.02 });
  const pressed = s.h, beadIn = s.bead, off = s.off;
  const want = 2 * WATER.sigma * SIN60 / (weight + 20);
  const lc = Math.sqrt(WATER.sigma / (1000 * G)), bead = 2 * Math.PI * R * (Math.PI / 4) * lc * lc;
  for (let i = 0; i < 60; i++) C.coverStep(s, 1 / 60, { nu: 1e-6, grams: glassG, hand: -0.3 });
  const lifted = s.h;
  for (let i = 0; i < 60; i++) C.coverStep(s, 1 / 60, { nu: 1e-6, grams: glassG, hand: 0 });
  check(`a light press settles the glass to 2σ sinθ/(w g + hand), filling the bead and running off past it; a lift past the glass's weight draws the bead back, bead/A higher, and stops; let go, the edge holds it there`,
    Math.abs(pressed - want) < 1e-6 && near(beadIn, bead, 1e-9) && near(off, (H0 - want) * A - bead, 1e-6)
      && near(lifted, want + bead / A, 1e-6) && s.bead === 0 && near(s.h, lifted, 1e-12) && near(s.plate + s.bead + s.off, s.added, 1e-12),
    `pressed to ${(pressed * 1000).toFixed(4)} mm (want ${(want * 1000).toFixed(4)}), bead ${(beadIn * 1e6).toFixed(2)} mL, off ${(off * 1e6).toFixed(2)} mL; lifted to ${(lifted * 1000).toFixed(4)} mm (want ${((want + bead / A) * 1000).toFixed(4)}), held at ${(s.h * 1000).toFixed(4)}`);
}

// 17
{
  // The solver lays the cover's gap: the uniform is packed from the ledger, and the gap kernels read it.
  const fluid = readFileSync('src/gpu/fluid.ts', 'utf8'), cover = readFileSync('src/gpu/fluid/cover.ts', 'utf8'), shared = readFileSync('src/gpu/wgsl/fluid/shared.ts', 'utf8');
  const packed = /f\[51\] = this\.coverGap;/.test(fluid) && /this\.coverAdvance\(p\);\n\s*this\.writeSim\(p, disp\);/.test(fluid);
  const field = /lampHeat: f32,[\s\S]*?cover: f32,\n\};/.test(shared);
  const metres = /this\.coverGap = h \/ DISH_GAP_FIELD_METRES;/.test(cover) && /\[this\.lastCurve, p\.plateCurve, this\.coverLaid, this\.coverGap\]/.test(cover);
  check('the solver packs the cover\'s gap (gap units, h over the metres in a unit) as S.cover at 51, before the step\'s kernels, and a cover that moves shifts the field',
    packed && field && metres, `packed ${packed}, struct ${field}, units and reshape ${metres}`);
}

console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
