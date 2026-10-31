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
    ].join('\n'),
    resolveDir: '.', loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const L = await import(`../${out}`);

// The sandwich, in SI, from the millimetres and the liquids' data alone.
const H0 = 0.006;           // m, the rest gap in the middle (2 mm is 38r's second part)
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
  const rests = [...src.matchAll(/clamp\(([0-9.]+) \*/g)].map((m) => Number(m[1]));
  const clamps = [...src.matchAll(/, (0\.00[0-9]+), (0\.0[0-9]+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const floors = [...src.matchAll(/max\(([0-9.]+), /g)].map((m) => Number(m[1]));
  check('the gap kernels lay the rest number, floor and ceiling the lib holds, and no other',
    // Exactly as many as the three kernels write (4 rests, 5 clamps, 3 floors), so one written another way is missed by count.
    rests.length === 4 && rests.every((v) => v === L.DISH_REST_GAP)
      && clamps.length === 5 && clamps.every(([a, b]) => a === L.DISH_GAP_RANGE[0] && b === L.DISH_GAP_RANGE[1])
      && floors.length === 3 && floors.every((v) => v === L.DISH_GAP_RANGE[0]),
    `rests ${[...new Set(rests)].join(', ')} (${rests.length}); clamps ${[...new Set(clamps.map((c) => c.join('–')))].join(', ')} (${clamps.length}); floors ${[...new Set(floors)].join(', ')}`);
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

console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
