#!/usr/bin/env node
/**
 * A drop's colour: an oil drop in dyed water shows its own dye, and its
 * edge is no darker than either liquid (PLAN 47z-1, 28i-7b, 28k-5).
 *
 *   npm run dropcolour      (any adapter that computes: scripts/lab.mjs)
 *
 * What was reported: the Splodascope as the owner's photograph has it, red,
 * yellow, green and pink oil in cobalt water, turned every drop's rim black
 * and the crowd murky (the 2026-11-11 take: colourfulness 43 against 137 in
 * the reference the owner sent, coloured 0.39 of the frame against 0.99),
 * and the look was given a pale water to hide it. The solver keeps each
 * liquid's colour in its own liquid (Oil Bodies); the plate summed the two
 * liquids' absorbance in a cell that was part oil, as if the light went
 * through one and then the other, and red over cobalt takes out every
 * channel. In the gap a drop spans glass to glass, so the light through such
 * a cell goes through one liquid or the other, side by side: the pack now
 * averages their light over the cell (packDyeBodies in src/gpu/wgsl/pack.ts).
 *
 * Plates, 128², each a red oil drop laid with its dye in a water dyed cobalt
 * as the app lays a Splodascope (oil's colour in the oil, the water's in the
 * water), stepped STEPS with Oil Bodies and the look's oil, then drawn with
 * the Splodascope's own settings on the lamp:
 *
 *   drop      a red drop in cobalt water
 *   clear     the same red drop in clear water: the drop's own colour
 *   water     the cobalt water alone: the water's own colour
 *
 * The drop is read along the row through its middle. Asked:
 *
 *   1. the plate is laid: the drop is red in the middle and the water blue
 *      outside it (else the rest would be measuring an empty plate)
 *   2. the drop's middle keeps its own colour: within JND (CIE76 ΔE, on
 *      the sRGB picture) of the same drop in clear water, so the water it
 *      pushed out of the gap does not filter it
 *   3. the edge is no darker than either liquid: the darkest pixel along
 *      the row, through both edges, is at least EDGE of the darker liquid's
 *      own luminance (relative, linear light). Under the summed absorbance
 *      the edge went to black, a few hundredths of either.
 *   4. the edge passes between the two colours: at the pixel where the row
 *      is halfway between them in red, it is no further from the line joining
 *      the two liquids' colours (in linear light) than BLEND of their
 *      distance apart, so the edge is the two side by side and not a third
 *      colour.
 *
 * Measured (SwiftShader, 2026-11-13): see the commit that added it.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 128;
const STEPS = 60;
const SIZE = 256;
const JND = 2.3;
const EDGE = 0.6;
const BLEND = 0.1;

// The palette's Cherry Red and Cobalt (src/constants.ts), as the dropper lays them.
const RED = [1.0, 0.0, 0.0];
const COBALT = [0.0, 0.28, 0.67];

const { page, close } = await openLab();
try {
  const plate = (which) => page.evaluate(async ({ N, STEPS, SIZE, which, RED, COBALT }) => {
    await lab.create(N, N);
    const { settings: s } = lab.look('splodascope');
    const over = { thinGap: 1, advection: s.advection, plateCurve: s.plateCurve, depthDrag: s.depthDrag,
      platePressure: s.platePressure, oilTension: s.oilTension, oilBodies: 1, diff: s.diffusionRate, filmHold: s.filmHold };
    const R = 0.18;
    if (which !== 'water') lab.solver().addMix(0.5, 0.5, R, { oil: 1 });
    // The splodascope's own amounts (src/lib/oilLay.ts), each liquid's dye in its liquid.
    const cell = lab.splodascopeCell(0.5, 0.5, N, [{ x: 0.5, y: 0.5, r: R, oil: 1, dye: 1 }]);
    const body = cell.dye, wash = lab.splodascopeCell(0.5, 0.5, N, []).water;
    const ab = (c) => c.map((v) => -Math.log(Math.max(0.002, v)));
    // As seedPreset lays it: the water's wash as dye, the drop's colour as the oil's own (addOilDensity).
    const d = new Array(N * N * 4).fill(0), od = new Array(N * N * 4).fill(0);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N, y = (j + 0.5) / N, k = (i + j * N) * 4;
      const oil = which === 'water' ? 0 : Math.max(0, Math.min(1, (R - Math.hypot(x - 0.5, y - 0.5)) * N + 0.5));
      const put = (to, amt, a) => { for (let ch = 0; ch < 3; ch++) to[k + ch] += amt * a[ch]; to[k + 3] += amt; };
      if (which !== 'clear') put(d, wash * (1 - oil), ab(COBALT));
      if (oil > 0) put(od, body * oil, ab(RED));
    }
    lab.addDye(d);
    if (lab.addOilDye) lab.addOilDye(od); else lab.addDye(od);
    lab.flush();
    await lab.step(STEPS, over, true);
    /*
      The light through the dyes alone: the look's two refraction stand-ins
      off, the boundary line (a colour step drawn as a deflection) and the
      edge relief, whose dark line at a drop's rim is the meniscus's lens and
      is 47z-4's to make from the oil's own index (PLAN 18e-2).
    */
    const px = await lab.render(SIZE, { ...s, rotationSpeed: 0, boundaryContrast: 0, edgeRelief: 0 }, { zoom: 1 });
    const y = SIZE >> 1, row = [];
    for (let x = 0; x < SIZE; x++) { const i = (y * SIZE + x) * 4; row.push([px[i], px[i + 1], px[i + 2]]); }
    return row;
  }, { N, STEPS, SIZE, which, RED, COBALT });

  const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const lab76 = (p) => {
    const [r, g, b] = p.map(lin);
    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE = (a, b) => Math.hypot(...lab76(a).map((v, i) => v - lab76(b)[i]));
  const fmt = (p) => `(${p.join(', ')})`;

  const drop = await plate('drop');
  const clear = await plate('clear');
  const water = await plate('water');
  const mid = SIZE >> 1;
  const avg = (row, a, b) => [0, 1, 2].map((k) => Math.round(row.slice(a, b).reduce((s, p) => s + p[k], 0) / (b - a)));
  const centre = avg(drop, mid - 4, mid + 4), own = avg(clear, mid - 4, mid + 4), sea = avg(water, mid - 4, mid + 4);
  // The water beside the drop, on the drop's own plate, well outside its edge.
  const outside = avg(drop, 4, 14);
  console.log(`  drop's middle ${fmt(centre)}, in clear water ${fmt(own)}; the water ${fmt(sea)}, beside the drop ${fmt(outside)}`);

  check('the plate is laid', centre[0] > 2 * centre[2] && centre[0] > 60 && outside[2] > 2 * outside[0] && outside[2] > 60,
    `the drop ${fmt(centre)} red, the water beside it ${fmt(outside)} blue`);
  const de = dE(centre, own);
  check("the drop's middle keeps its own colour", de < JND, `ΔE ${de.toFixed(2)} from the drop in clear water (under ${JND})`);

  // The row through both edges: from the water beside the drop to its middle, each side.
  const lo = Math.min(L(centre), L(outside));
  let darkest = Infinity, at = -1;
  for (let x = 4; x < SIZE - 4; x++) { const v = L(drop[x]); if (v < darkest) { darkest = v; at = x; } }
  check('the edge is no darker than either liquid', darkest >= EDGE * lo,
    `darkest ${darkest.toFixed(4)} at x ${at} ${fmt(drop[at])}, the darker liquid ${lo.toFixed(4)} (at least ${EDGE} of it)`);

  // Halfway between the two in red, on the left edge; distance from the line joining them, in linear light.
  const A = outside.map(lin), B = centre.map(lin);
  const half = (A[0] + B[0]) / 2;
  let hx = -1;
  for (let x = 4; x < mid; x++) if ((lin(drop[x][0]) - half) * (lin(drop[x + 1][0]) - half) <= 0) { hx = x; break; }
  const P = hx >= 0 ? drop[hx].map(lin) : [0, 0, 0];
  const AB = B.map((v, i) => v - A[i]), AP = P.map((v, i) => v - A[i]);
  const t = Math.max(0, Math.min(1, AP.reduce((s, v, i) => s + v * AB[i], 0) / AB.reduce((s, v) => s + v * v, 0)));
  const off = Math.hypot(...AP.map((v, i) => v - t * AB[i])) / Math.hypot(...AB);
  check('the edge passes between the two colours', hx >= 0 && off < BLEND,
    `at x ${hx} ${fmt(hx >= 0 ? drop[hx] : [0, 0, 0])}, ${off.toFixed(3)} of the way off the line between them (under ${BLEND})`);
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length}`);
process.exit(failed ? 1 : 0);
