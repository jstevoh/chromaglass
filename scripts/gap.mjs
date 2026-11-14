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
 *
 * Lines 19 to 23 are the pinch and the air edge (PLAN 38r-16), written
 * before the build, and run until each is built as
 *
 *   npm run gap -- --owed=puddle,settle,lift,pinch
 *
 * Each line under an id is printed as owed while what it asks for is absent
 * and is red the day it passes with its id still listed (the convention of
 * `timers.mjs` and `bubbleair.mjs`): the PR that builds an item takes its id
 * out of `--owed` in scripts/checks.json and never edits a line or a bar. A
 * build that is there and misses is red, owed or not. Line 22 (a wet glass
 * sticks) holds on main as well, so the build cannot lose it. The air's
 * fingers themselves are measured on the GPU by `npm run airedge`.
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
const IDS = ['puddle', 'settle', 'lift', 'pinch'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
/** `mainState`: what the line is owed for is absent, which is the only state an owed line is excused in. */
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
};

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
      "export * as PG from './src/lib/playGesture.ts';",
      "export { DEFAULT_SETTINGS } from './src/types.ts';",
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
  const restAt = [...src.matchAll(/clamp\((S\.cover|A\.a\.[zw]) - ([0-9.]+) \* (S\.plateCurve|A\.a\.[xy]) \*/g)];
  const rests = restAt.map((m) => Number(m[2]));
  const means = restAt.map((m) => `${m[1]}:${m[3]}`).join(' ');
  const clamps = [...src.matchAll(/, (0\.00[0-9]+), (0\.0[0-9]+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const floors = [...src.matchAll(/max\(([0-9.]+), /g)].map((m) => Number(m[1]));
  check('the gap kernels lay the rest number, floor and ceiling the lib holds, and no other',
    // Exactly as many as the three kernels write (4 rests, 5 clamps, 3 floors), so one written another way is missed by count.
    rests.length === 4 && rests.every((v) => v === L.DISH_REST_GAP) && means === 'S.cover:S.plateCurve S.cover:S.plateCurve A.a.z:A.a.x A.a.w:A.a.y'
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
// σ of glycerine-water, tabulated (CRC; Takamura et al. 2012): water, 50%, 70%, 85% by mass, against ν.
const TABLE = [[1e-6, 0.072], [6e-6, 0.070], [2.2e-5, 0.0675], [1e-4, 0.0655]];
const WATER = { nu: 1e-6, sigma: 0.072, mu: 1e-3 }, THICK = { nu: 2.2e-5, sigma: 0.0675, mu: 2.2e-2 };
const glassG = 5 * A * 1000, weight = (glassG / 1000) * G / A;
const rk4 = (h0, P, sig, mu, t) => {
  const f = (h) => -(2 / 3) * h ** 3 * (P - 2 * sig * SIN60 / h) / (mu * R * R);
  const tau = mu * R * R / (P * h0 ** 2), n = Math.max(2000, Math.ceil(t / (tau / 100)));
  let h = h0; const dt = t / n;
  for (let i = 0; i < n; i++) { const a = f(h), b = f(h + a * dt / 2), c = f(h + b * dt / 2), d = f(h + c * dt); h += (a + 2 * b + 2 * c + d) * dt / 6; }
  return h;
};
/*
  Since PLAN 38r-16 the ledger may carry `wet`, the area under the glass the
  liquid wets (all of it, A, on a full film). Two clauses of lines 15 and 16
  are main's ledger, where the glass follows the liquid down at once and a
  lift stops when the bead is empty; the air edge corrects both (the glass
  cannot jump, so a dial taken down opens air at the rim, and a lift past
  the bead draws the air in). Each clause is written for both ledgers, exact
  in each, so neither is loosened and the build needs no edit here: the
  main branch goes once 38r-16 has shipped (PLAN 38r-16).
*/
const airEdge = 'wet' in C.coverNew(C.COVER_FULL_ML);

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
      && TABLE.every(([nu, sg]) => near(C.carrierTension(nu), sg, 0.02)),
    `h_hold ${(hHold * 1000).toFixed(3)} mm, bead ${(bead * 1e6).toFixed(2)} mL, σ against the table ${TABLE.map(([nu, sg]) => `${C.carrierTension(nu).toFixed(4)}/${sg}`).join(' ')}`);
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
  // The dial down 10 mL: wicked off the bead first, the rest from under the glass; then down past everything, to the floor's full film.
  const before = { ...s };
  C.coverAdd(s, -10e-6);
  // Main: the glass follows the liquid down at once. The air edge (38r-16): the glass stays where it was that instant and the liquid's edge leaves the rim, h·wet = V.
  const glass = airEdge ? near(s.h, before.h, 1e-12) && near(s.wet, s.plate / s.h, 1e-12) && s.wet < A : near(s.h, s.plate / A, 1e-12);
  const wick = s.bead === 0 && near(before.plate - s.plate, 10e-6 - before.bead, 1e-9) && near(s.added, before.added - 10e-6, 1e-12) && near(s.plate + s.bead + s.off, s.added, 1e-12) && glass;
  C.coverAdd(s, -1);
  // Main: never under the floor's full film. The air edge: down to the dial's 1 mL, the rest a puddle.
  const floor = (airEdge ? near(s.plate, C.LIQUID_ML_RANGE[0] * 1e-6, 1e-12) && near(s.wet, s.plate / s.h, 1e-12)
    : near(s.plate, A * C.COVER_FLOOR_M, 1e-12) && near(s.h, C.COVER_FLOOR_M, 1e-12)) && near(s.plate + s.bead + s.off, s.added, 1e-12);
  check(`a pour under the glass raises it by Q/A and spills nothing below h_hold; past it the glass settles to h_hold, the bead fills, the rest runs off; the dial down wicks the bead then the plate, ${airEdge ? 'the glass staying put as the liquid leaves the rim, down to the dial\'s 1 mL' : 'never under the floor\'s film'}; plate + bead + off = everything put in`,
    near(rise, 4e-6 / A, 1e-9) && Math.abs(before.h - hHold) < 1e-6 && near(before.bead, bead, 1e-9) && before.off > 0 && near(sum, before.added, 1e-12) && near(before.added, (C.COVER_FULL_ML + 24) * 1e-6, 1e-12) && wick && floor,
    `4 mL raised it ${(rise * 1e6).toFixed(1)} µm (Q/A ${(4e-6 / A * 1e6).toFixed(1)}); +20 mL settled at ${(before.h * 1000).toFixed(4)} mm (h_hold ${(hHold * 1000).toFixed(4)}), bead ${(before.bead * 1e6).toFixed(2)} mL, off ${(before.off * 1e6).toFixed(2)} mL; ledger ${(sum * 1e6).toFixed(4)} of ${(before.added * 1e6).toFixed(4)} mL; dial down ${wick}, floor ${floor}`);
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
  // Frame by frame: on the air edge's ledger the cover stays wet while the bead still feeds the lift (air only once it is empty).
  let wetWhileBead = true;
  for (let i = 0; i < 60; i++) { C.coverStep(s, 1 / 60, { nu: 1e-6, grams: glassG, hand: -0.3 }); if (airEdge && s.bead > 0 && s.wet !== A) wetWhileBead = false; }
  const lifted = s.h, liftedWet = s.wet, liftedPlate = s.plate;
  for (let i = 0; i < 60; i++) C.coverStep(s, 1 / 60, { nu: 1e-6, grams: glassG, hand: 0 });
  // The lift's own rate, on the thick carrier where it is slow enough to see: press to fill the bead, then a gentle lift (about −1 Pa) for 0.2 s against an RK4 of dh/dt = −(2/3)h³P/(μR²).
  const g = C.coverNew(C.COVER_FULL_ML);
  for (let i = 0; i < 60; i++) C.coverStep(g, 1 / 60, { nu: THICK.nu, grams: glassG, hand: 0.02 });
  const g0 = g.h, Plift = weight - 0.05 * 1000;
  for (let i = 0; i < 12; i++) C.coverStep(g, 1 / 60, { nu: THICK.nu, grams: glassG, hand: -0.05 });
  let hr = g0;
  for (let i = 0, n = 20000, dt = 0.2 / n; i < n; i++) {
    const f = (h) => -(2 / 3) * h ** 3 * Plift / (THICK.mu * R * R);
    const a = f(hr), b = f(hr + a * dt / 2), c = f(hr + b * dt / 2), e = f(hr + c * dt);
    hr += (a + 2 * b + 2 * c + e) * dt / 6;
  }
  const liftRate = near(g.h - g0, hr - g0, 1e-3) && g.bead > 0;
  // Main: the lift stops when the bead is in, and the edge holds it. The air edge (38r-16): past the bead the air comes in at the rim, the glass
  // still rising with the liquid's volume kept (h·wet = V, V the pressed film and the bead), and let go, the puddle settles back to the rim at V/A.
  const liftOk = airEdge ? wetWhileBead && lifted > want + bead / A && liftedWet < A && near(lifted * liftedWet, liftedPlate, 1e-9) && near(liftedPlate, want * A + bead, 1e-6) && near(s.wet, A, 1e-12)
    : near(lifted, want + bead / A, 1e-6) && near(s.h, lifted, 1e-12);
  check(`a light press settles the glass to 2σ sinθ/(w g + hand), filling the bead and running off past it; a lift past the glass's weight draws the bead back, bead/A higher, ${airEdge ? 'then the air in, and let go the puddle settles back to the rim there' : 'and stops; let go, the edge holds it there'}`,
    Math.abs(pressed - want) < 1e-6 && near(beadIn, bead, 1e-9) && near(off, (H0 - want) * A - bead, 1e-6)
      && liftOk && s.bead === 0 && near(s.h, want + bead / A, 1e-6) && near(s.plate + s.bead + s.off, s.added, 1e-12) && liftRate,
    `pressed to ${(pressed * 1000).toFixed(4)} mm (want ${(want * 1000).toFixed(4)}), bead ${(beadIn * 1e6).toFixed(2)} mL, off ${(off * 1e6).toFixed(2)} mL; lifted to ${(lifted * 1000).toFixed(4)} mm (want ${((want + bead / A) * 1000).toFixed(4)}), held at ${(s.h * 1000).toFixed(4)}; a gentle lift rose ${((g.h - g0) * 1e9).toFixed(1)} nm in 0.2 s (RK4 ${((hr - g0) * 1e9).toFixed(1)})`);
}

// 17
{
  // The solver lays the cover's gap: the uniform is packed from the ledger, and the gap kernels read it.
  const fluid = readFileSync('src/gpu/fluid.ts', 'utf8'), cover = readFileSync('src/gpu/fluid/cover.ts', 'utf8'), shared = readFileSync('src/gpu/wgsl/fluid/shared.ts', 'utf8');
  const packed = /f\[51\] = this\.coverGap;/.test(fluid) && /this\.coverAdvance\(p\);\n\s*this\.writeSim\(p, disp\);/.test(fluid);
  // Nothing but comments between lampHeat (50) and cover, so the field is slot 51. The oil's weight and expansion follow it (52, 53; PLAN 27f-9c), then the lamp's glass cooling (54; PLAN 27f-9e), each after a comment, so cover is no longer the last field: they are asked for after it.
  const field = /lampHeat: f32,\n(\s*\/\/[^\n]*\n)*\s*cover: f32,\n\s*\/\*[\s\S]*?\*\/\n\s*oilRho: f32,\n\s*oilExpand: f32,\n\s*\/\*[\s\S]*?\*\/\n\s*lampCool: f32,\n\};/.test(shared);
  const metres = /this\.coverGap = h \/ DISH_GAP_FIELD_METRES;/.test(cover) && /\[this\.lastCurve, p\.plateCurve, this\.coverLaid, this\.coverGap\]/.test(cover)
    && /else if \(this\.lastCurve !== p\.plateCurve \|\| this\.coverGap !== this\.coverLaid\)/.test(cover) && /\n\s*this\.coverLaid = this\.coverGap;/.test(cover);
  check('the solver packs the cover\'s gap (gap units, h over the metres in a unit) as S.cover at 51, before the step\'s kernels, and a cover that moves shifts the field',
    packed && field && metres, `packed ${packed}, struct ${field}, units and reshape ${metres}`);
}

// 18
{
  /*
    The readers of the rest gap follow the cover (PLAN 38r-5). The numbers: a
    pour's share halves on a glass twice as high, the cover's drag μ/(m h)
    is today's at the defaults and halves for a glass twice as heavy, and the
    settings' defaults are the lib's own, so a look made today is the same
    plate. The solver's: each Darcy speed (colour's fall, oil's lift, oil's
    pull) carries (h/h₀)², the breath and the glass's drag and the slump read
    the cover's metres, and hsPrep's hand forcing is taken at S.cover.
  */
  const d = L.DEFAULT_SETTINGS;
  const share = L.pourShare(0.1, 1e-6, 1 / 60, 2 * H0) / L.pourShare(0.1, 1e-6, 1 / 60);
  const drag = L.coverDrag(0.45, 1000, C.COVER_GLASS_G, H0) / L.coverDrag(0.45), heavy = L.coverDrag(0.45, 1000, 2 * C.COVER_GLASS_G, H0) / L.coverDrag(0.45);
  const fluid = readFileSync('src/gpu/fluid.ts', 'utf8'), passes = readFileSync('src/gpu/fluid/passes.ts', 'utf8'), thin = readFileSync('src/gpu/wgsl/thinGap.ts', 'utf8');
  const solver = [
    /get coverH2\(\): number \{\s*const r = this\.coverGap \/ DISH_REST_GAP;\s*return r \* r;/.test(readFileSync('src/gpu/fluid/cover.ts', 'utf8')),
    /OIL_TENSION_GAP \* this\.coverH2/.test(fluid), /ROCK_FALL \* this\.coverH2 \* rockGain \* p\.rockX/.test(fluid), /-OIL_LIFT \* this\.coverH2/.test(fluid),
    /const h0 = this\.coverGap \* GAP_METRES;/.test(fluid), /const b = this\.coverGap \* GAP_METRES;/.test(passes), /const hc = this\.coverGap \* GAP_METRES;/.test(passes),
    /\(A\.a\.x \/ \(S\.cover \* S\.cover\) \* A\.a\.y\)/.test(thin),
  ];
  check('the rest gap\'s readers follow the cover: a pour\'s share, the cover\'s drag, and the solver\'s Darcy speeds, breath, glass drag, slump and hand forcing; the dials\' defaults are the lib\'s',
    near(share, 0.5, 1e-12) && near(drag, 1, 1e-12) && near(heavy, 0.5, 1e-12) && solver.every(Boolean)
      && d.liquidMl === C.COVER_FULL_ML && d.coverWeight === C.COVER_GLASS_G,
    `share ×${share}, drag ×${drag.toFixed(6)} (heavy ×${heavy}), solver ${solver.map((b) => (b ? 1 : 0)).join('')}, defaults ${d.liquidMl} mL / ${d.coverWeight} g`);
}

/*
  19–23: the pinch and the air edge (PLAN 38r-16).

  The owner's pick (2026-10-31, "Build the air edge now"): below a full film
  the liquid is a puddle under the glass with an air edge. Between two wetted
  glasses that edge's meniscus is concave across the gap, so the liquid in
  the puddle is below the air by 2σ cosθ/h and pulls the glasses together.
  Over the wetted area `wet` the glass's load P (its weight and the hand,
  over the whole cover A) and that suction make the puddle's mean pressure

      P̄ = P·A/wet + 2σ cosθ/h,

  and Stefan's squeeze of a disc of radius r = √(wet/π) moves the glass at

      dh/dt = −(2/3) h³ P̄ / (μ r²),

  with the volume kept, wet = V/h. A settle (P̄ > 0) spreads the puddle until
  it meets the rim, where the edge pins (38r-5) and the glass stops at V/A;
  under the gap's floor (a full film under 8.4 mL) it stops at the floor and
  stays a puddle. A lift (P̄ < 0) shrinks it, the air coming in at the rim,
  up to the gap's ceiling (4 mm, 38r-18's cap). On a full film with the bead
  empty the same sum says when the air may come in at all: a lift weaker
  than P_load + 2σ cosθ/h moves nothing, which is why a wet glass sticks.

  Viscous only: water's settle and lift here run at Reynolds numbers in the
  thousands, where the radial flow's inertia (an added mass ρπr⁴/8h, about
  2 kg) would slow them several times. The lib is Stefan's, as line 14 is,
  and the water rows hold the lib to that model; the inertia is a named
  shortcut, PLAN 38r-21. The thick rows are inside the theory.

  Each line integrates that here by RK4 at a two-hundredth of its own time
  scale and holds lib/cover.ts to it at 1e-4, so the lib must solve a step
  exactly (or finely enough) whatever the frame's dt, as it does Stefan's
  settle today (line 14).
*/
const COS60 = Math.cos(Math.PI / 3);
const suck = (sig, h) => 2 * sig * COS60 / h;
const puddleRate = (h, V, P, sig, mu) => { const wet = Math.min(A, V / h); return -(2 / 3) * h ** 3 * (P * A / wet + suck(sig, h)) / (mu * wet / Math.PI); };
/** The glass over a puddle of V from h0 under load P, t seconds: stops at the rim (V/A) settling, at the ceiling lifting, never under the floor. */
const puddleRk4 = (h0, V, P, sig, mu, t) => {
  const rim = V / A, top = C.COVER_TOP_M, fl = C.COVER_FLOOR_M;
  const clampH = (h, down) => (down ? Math.max(h, Math.max(rim, fl)) : Math.min(h, top));
  const down = puddleRate(h0, V, P, sig, mu) < 0;
  const n = Math.max(4000, Math.ceil(t / ((h0 / Math.abs(puddleRate(h0, V, P, sig, mu))) / 200)));
  const dt = t / n;
  let h = h0;
  for (let i = 0; i < n; i++) {
    const f = (x) => puddleRate(clampH(x, down), V, P, sig, mu);
    const a = f(h), b = f(h + a * dt / 2), c = f(h + b * dt / 2), d = f(h + c * dt);
    h = clampH(h + (a + 2 * b + 2 * c + d) * dt / 6, down);
    if (h === (down ? Math.max(rim, fl) : top)) break;
  }
  return h;
};
/** The lib's glass after t seconds in steps of dt, under a constant hand. */
const libRun = (s, t, dt, k) => { for (let i = 0, n = Math.round(t / dt); i < n; i++) C.coverStep(s, dt, k); return s; };
const wetOf = (s) => (airEdge ? `wet ${(s.wet / A).toFixed(4)} A` : 'no wet in the ledger');

// 19
{
  const fl = C.COVER_FLOOR_M, k = { nu: 1e-6, grams: glassG, hand: 0 };
  const s5 = libRun(C.coverNew(5), 2, 1 / 60, k), s1 = libRun(C.coverNew(1), 2, 1 / 60, k), sf = libRun(C.coverNew(C.COVER_FULL_ML), 2, 1 / 60, k);
  const ok = airEdge && C.LIQUID_ML_RANGE[0] === 1 && near(s5.h, fl, 1e-12) && near(s5.wet, 5e-6 / fl, 1e-9) && near(s1.h, fl, 1e-12) && near(s1.wet, 1e-6 / fl, 1e-9)
    && near(sf.wet, A, 1e-12) && near(sf.h, H0, 1e-12) && [s5, s1, sf].every((s) => near(s.plate, s.h * s.wet, 1e-12) && near(s.plate + s.bead + s.off, s.added, 1e-12));
  line('puddle', `under a full film (${(A * fl * 1e6).toFixed(2)} mL at the ${(fl * 1000).toFixed(3)} mm floor) the liquid is a puddle at the floor, its area V/h; the default fills the cover; the Liquid dial runs from 1 mL`, ok,
    `5 mL: h ${(s5.h * 1000).toFixed(4)} mm, ${wetOf(s5)} (V/h ${(5e-6 / fl / A).toFixed(4)} A); 1 mL: ${wetOf(s1)} (${(1e-6 / fl / A).toFixed(4)} A); default: ${wetOf(sf)}; dial from ${C.LIQUID_ML_RANGE[0]} mL`, !airEdge);
}

// 20
{
  /*
    The dial taken from the default down to 20 mL at once: the glass cannot
    jump, so the liquid's edge leaves the rim (wet = V/h₀, a third of the
    cover), and the puddle settles back out to the rim, the glass coming down
    to V/A = 0.64 mm: halfway in about 6 ms for water and 0.13 s for the
    thick carrier (22 mm²/s), the ratio of their μ. Held to the RK4 at half, one and two of its own
    half-times, stepped at a tenth of the half-time and in one step of twice
    it (the same answer: a step's size must not matter), and the end exactly
    V/A with the cover wet.
  */
  const rows = []; let ok = airEdge;
  const V = 20e-6, rim = V / A;
  for (const [name, nu] of [['water', 1e-6], ['thick', 2.2e-5]]) {
    const sig = C.carrierTension(nu), mu = 1000 * nu, k = { nu, grams: glassG, hand: 0 };
    let lo = 0, hi = 60;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (puddleRk4(H0, V, weight, sig, mu, m) > (H0 + rim) / 2) lo = m; else hi = m; }
    const half = lo;
    const start = () => { const s = C.coverNew(C.COVER_FULL_ML); C.coverAdd(s, V - s.plate); return s; };
    const s0 = start();
    ok &&= near(s0.h, H0, 1e-12) && near(s0.wet, V / H0, 1e-9);
    for (const f of [0.5, 1, 2]) {
      const want = puddleRk4(H0, V, weight, sig, mu, f * half), got = libRun(start(), f * half, half / 10, k).h;
      ok &&= Math.abs(got - want) <= 1e-4 * want && got >= rim * (1 - 1e-12);
      if (f === 1) rows.push(`${name} half-settled in ${(half * 1000).toFixed(1)} ms, at it ${(got * 1000).toFixed(4)} mm (RK4 ${(want * 1000).toFixed(4)})`);
    }
    const one = libRun(start(), 2 * half, 2 * half, k).h, many = libRun(start(), 2 * half, half / 10, k).h;
    const end = libRun(start(), 60 * half + 1, 1 / 60, k);
    ok &&= Math.abs(one - many) <= 1e-4 * many && near(end.h, rim, 1e-9) && near(end.wet, A, 1e-12) && near(end.plate + end.bead + end.off, end.added, 1e-12);
    rows.push(`${name} one step of 2 half-times ${(one * 1000).toFixed(4)} against twenty ${(many * 1000).toFixed(4)}; ends ${(end.h * 1000).toFixed(4)} mm (V/A ${(rim * 1000).toFixed(4)}), ${wetOf(end)}`);
    // The RK4's own half-time, a sanity on the setup (it never reads the lib; the lib is held to the RK4 above).
    ok &&= name === 'water' ? half > 0.001 && half < 0.03 : half > 0.05 && half < 0.5;
  }
  line('settle', 'the dial taken down faster than the glass settles opens air at the rim, and the puddle settles back out by Stefan under its weight and its edge\'s suction 2σcosθ/h, to V/A: halfway in milliseconds for water, a tenth of a second or so thick', ok, rows.join('; '), !airEdge);
}

// 21
{
  /*
    A lift past the bead (it is empty on a fresh plate) and past the edge's
    suction: hand −0.12, a pull of 120 Pa against the glass's 49 and the
    edge's 34–36. The air comes in at the rim and the glass rises, faster as
    the puddle shrinks (P·A/wet grows): thick in frames, asked against the
    RK4 where it has the glass at 3 mm (about 0.4 s); water, 22 times
    quicker, at the gap's ceiling inside half a second. Then let
    go: the puddle settles back to the rim and the glass to V/A, the default
    2 mm, the cover wet again (the air pushed out; what the GPU traps as
    bubbles is `npm run airedge`'s, not the ledger's).
  */
  const rows = []; let ok = airEdge;
  const V = C.COVER_FULL_ML * 1e-6, P = weight - 0.12 * C.HAND_PA;
  for (const [name, nu] of [['water', 1e-6], ['thick', 2.2e-5]]) {
    const sig = C.carrierTension(nu), mu = 1000 * nu;
    // Water is at the ceiling by half a second; thick is asked where the RK4 has it at 3 mm, halfway up, in frames.
    let T = 0.5;
    if (name === 'thick') { let lo = 0, hi = 0.5; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (puddleRk4(H0, V, P, sig, mu, m) < 0.003) lo = m; else hi = m; } T = Math.round(lo * 60) / 60; }
    const s = libRun(C.coverNew(C.COVER_FULL_ML), T, 1 / 60, { nu, grams: glassG, hand: -0.12 });
    const want = puddleRk4(H0, V, P, sig, mu, T);
    const up = s.h, upWet = s.wet;
    ok &&= Math.abs(up - want) <= 1e-4 * want && s.bead === 0 && near(s.plate, up * upWet, 1e-12) && upWet < A;
    // T > 0.2 is the RK4's, a sanity on the setup. And the lift's step size must not matter: one step of T against twenty, where its h⁵ speed-up is hardest on a per-frame integrator.
    ok &&= name === 'water' ? near(up, C.COVER_TOP_M, 1e-12) : up < C.COVER_TOP_M && up > H0 * 1.25 && T > 0.2;
    const one = libRun(C.coverNew(C.COVER_FULL_ML), T, T, { nu, grams: glassG, hand: -0.12 }).h, many = libRun(C.coverNew(C.COVER_FULL_ML), T, T / 20, { nu, grams: glassG, hand: -0.12 }).h;
    ok &&= Math.abs(one - many) <= 1e-4 * many;
    // The threshold is the suction 2σcosθ/h, not the edge's hold 2σ sinθ/h: a pull of the weight and 1.1 suctions lifts, by the RK4, over half a second (line 22 asks 0.9 to stick).
    const hand11 = -(weight + 1.1 * suck(sig, H0)) / C.HAND_PA, P11 = weight + hand11 * C.HAND_PA;
    const just = libRun(C.coverNew(C.COVER_FULL_ML), 0.5, 1 / 60, { nu, grams: glassG, hand: hand11 }).h, justWant = puddleRk4(H0, V, P11, sig, mu, 0.5);
    ok &&= just > H0 && Math.abs(just - justWant) <= 1e-4 * justWant;
    libRun(s, 5, 1 / 60, { nu, grams: glassG, hand: 0 });
    ok &&= near(s.h, H0, 1e-9) && near(s.wet, A, 1e-12) && near(s.plate + s.bead + s.off, s.added, 1e-12);
    rows.push(`${name} lifted to ${(up * 1000).toFixed(4)} mm in ${T.toFixed(3)} s (RK4 ${(want * 1000).toFixed(4)}; one step ${(one * 1000).toFixed(4)}, twenty ${(many * 1000).toFixed(4)}), ${airEdge ? `wet ${(upWet / A).toFixed(3)} A` : 'no wet'}; 1.1 suctions lifted it to ${(just * 1000).toFixed(5)} mm (RK4 ${(justWant * 1000).toFixed(5)}); let go, ${(s.h * 1000).toFixed(4)} mm, ${wetOf(s)}`);
  }
  line('lift', 'a lift past the bead and the edge\'s suction draws air in at the rim, the glass rising by Stefan with the volume kept (h·wet = V) up to the ceiling; let go, it settles back to V/A', ok, rows.join('; '), !airEdge);
}

// 22
{
  // A wet glass sticks: with the bead empty, a pull of its weight and 0.9 of the edge's suction moves nothing, now and after the build (21 asks 1.1 to lift).
  const rows = []; let ok = true;
  for (const [name, nu] of [['water', 1e-6], ['thick', 2.2e-5]]) {
    const sig = C.carrierTension(nu), hand = -(weight + 0.9 * suck(sig, H0)) / C.HAND_PA;
    const s = libRun(C.coverNew(C.COVER_FULL_ML), 2, 1 / 60, { nu, grams: glassG, hand });
    ok &&= s.h === H0 && s.bead === 0 && near(s.plate, A * H0, 1e-12) && (!airEdge || s.wet === A);
    rows.push(`${name}: a pull of ${(-hand * C.HAND_PA).toFixed(1)} Pa held the glass at ${(s.h * 1000).toFixed(4)} mm`);
  }
  check('a wet glass sticks: with the bead empty, a lift weaker than the glass\'s weight and the edge\'s suction 2σcosθ/h moves nothing', ok, rows.join('; '));
}

// 23
{
  /*
    The pinch's hand (lib/playGesture.ts, the contract the build exports):
    `pinchHand(scale)` turns a pinch's span, now over where it started, into
    FluidSimulation.coverHand: fingers together press (+), apart lift (−),
    zero at the start, odd in the span's log, a full hand at half or twice
    the span and no more past it, and a gentle bottom (a pinch just told
    from a breath, at PINCH_SPAN, under a tenth: about 100 Pa, the owner's
    gentle-to-extreme rule). And `playHand`'s fifth argument, the pair's span
    over its landing span: a pair whose span changes past PINCH_SPAN is a
    pinch, a pair moving together a breath, as before; once a pinch, a pinch
    until every finger is off; the closeup's pair stays the camera; a tool
    picked on the tray is that hand. Then the wiring, which only reaches:
    something under src/ hands pinchHand's answer to coverHand, from the
    trackpad's ctrl-wheel and from the touch path. How it feels is the
    Mac's film, not a line.
  */
  const PG = L.PG;
  const has = typeof PG.pinchHand === 'function' && typeof PG.PINCH_SPAN === 'number';
  let ok = false, detail = 'no pinchHand or PINCH_SPAN in lib/playGesture.ts';
  if (has) {
    const f = (travel, ms) => ({ travel, ms });
    const spans = [1 / 4, 1 / 2, 1 / 1.5, 1 / 1.2, 1, 1.2, 1.5, 2, 4], hands = spans.map(PG.pinchHand);
    const mono = hands.every((v, i) => i === 0 || v < hands[i - 1] || (Math.abs(v) === 1 && v === hands[i - 1]));
    const odd = [1.1, 1.5, 2, 3].every((x) => near(PG.pinchHand(1 / x), -PG.pinchHand(x), 1e-9));
    const ends = Math.abs(PG.pinchHand(1)) < 1e-12 && near(PG.pinchHand(0.5), 1) && near(PG.pinchHand(2), -1) && PG.pinchHand(0.25) === 1 && PG.pinchHand(4) === -1;
    const g = PG.pinchHand(1 / PG.PINCH_SPAN), gentle = g > 0 && g <= 0.1 && PG.PINCH_SPAN >= 1.1 && PG.PINCH_SPAN <= 1.3;
    const pair = [f(30, 300), f(30, 300)];
    const reads = [
      PG.playHand('dropper', 'blow', pair, false, 1.4) === 'pinch',
      PG.playHand('dropper', 'blow', pair, false, 0.7) === 'pinch',
      PG.playHand('dropper', 'blow', [f(90, 300), f(90, 300)], false, 1.05) === 'blow',
      PG.playHand('dropper', 'dropper', [f(0, 30), f(0, 0)], false, 1) === 'blow',
      PG.playHand('dropper', 'pinch', [f(90, 600), f(90, 600)], false, 1) === 'pinch',
      PG.playHand('dropper', 'pinch', [f(90, 600)], false) === 'pinch',
      PG.playHand('dropper', 'pinch', [], false) === 'dropper',
      PG.playHand('dropper', 'dropper', pair, true, 1.5) === 'dropper',
      PG.playHand('blow', 'dropper', pair, false, 1.5) === 'blow',
    ];
    const files = [];
    const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n) && !p.endsWith('playGesture.ts')) files.push(p); } };
    walk('src');
    // Comments stripped, so a comment naming the calls does not count: a wheel path (a 'wheel' listener reading ctrlKey) and a touch path ('touch…' events with playHand's span) that both call pinchHand,
    // and the hand put back to 0 (coverHand = 0) where it is set. Reach only: a desk DOM line that sends a ctrl-wheel and reads the hand go to 0 after 200 ms is PLAN 38r-16's follow-up.
    const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
    const calls = files.map((p) => [p, code(readFileSync(p, 'utf8'))]).filter(([, t]) => /pinchHand\(/.test(t));
    const wheel = calls.some(([, t]) => /['"]wheel['"]/.test(t) && /ctrlKey/.test(t));
    const touch = calls.some(([, t]) => /['"]touch(start|move)['"]|onTouch(Start|Move)/.test(t) && /playHand\(/.test(t));
    const release = calls.some(([, t]) => /coverHand\s*=\s*0\b/.test(t));
    const wired = wheel && touch && release;
    ok = mono && odd && ends && gentle && reads.every(Boolean) && wired;
    detail = `hands ${hands.map((v) => v.toFixed(3)).join(' ')} over spans ${spans.map((x) => x.toFixed(2)).join(' ')}; monotone ${mono}, odd ${odd}, ends ${ends}, at PINCH_SPAN ${PG.PINCH_SPAN} ${g.toFixed(3)}; reads ${reads.map((b) => (b ? 1 : 0)).join('')}; pinchHand called in ${calls.map(([p]) => p).join(', ') || 'no file'}: wheel ${wheel}, touch ${touch}, back to 0 ${release}`;
  }
  line('pinch', 'a pinch on the trackpad (ctrl-wheel) or two fingers whose span changes sets the glass\'s hand: together presses, apart lifts, gentle at first and full at half or twice the span; a pair moving together still blows', ok, detail, !has);
}

console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
