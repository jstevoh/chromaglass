#!/usr/bin/env node
/**
 * Lava Lamp's wax holds round, and the lamp keeps all of it (PLAN 27f-9q).
 *
 *   npm run lavaround
 *
 * Reported: the wax would not hold round blobs; it hung in stalks and sheets.
 * In the gap of a Hele-Shaw cell a blob's weight and its surface tension are
 * both resisted by the same drag, so its shape is set by their ratio, the
 * Bond number, and the gap drops out of it. PLAN 38r took the gap from 6 mm
 * to 2 mm and scaled the oil's tension by h² but not the standing plate's
 * weight, so in the lamp every blob was nine times as heavy against its own
 * skin as the tension had been set for. SEALED_TENSION (constants.ts) gives
 * the oil in a sealed bottle four of those nine back (why not all nine is
 * written there).
 *
 * The first try at that, four times the tension, rounded the wax and lost a
 * fifth of it in two minutes, by two ways out, both closed with it:
 *   - the open rim's lip (carry.ts lipHolds) let oil over the rim with the
 *     water wherever the dish's pressure stood above the trough's; a sealed
 *     bottle has no trough, and now no oil crosses it;
 *   - the Cahn–Hilliard update's runaway guard (oil.ts mixUpdate) cut every
 *     cell to 1.25, and wax pressed against the wall packs to about 1.8
 *     before the oil's packing shares it back: each step destroyed it.
 *
 * Measured on the GPU solver alone (scripts/lab.mjs) at 256², on the look's
 * own settings and its wax laid as the app lays it (`npm run lavawax`), for
 * two minutes at the app's own step (dt 0.00133, a step each 1/30 s: what the
 * Mac's app ran when the stalks were measured, and twice the force a step of
 * the 1/60 s the lab's other lamp checks use, so the cap is held where it is
 * hardest), the oil read every five seconds:
 *   1. the lamp keeps its oil: Σc over the disc within 0.1% of the laid wax
 *      at every reading;
 *   2. a meter that sees a leak: with the lip open again (the sealed line
 *      taken out of lipHolds) the disc has lost 2% or more by the end;
 *   3. and one that sees oil destroyed: with the guard back at -0.25..1.25,
 *      Σc over the whole grid has fallen 0.3% or more by the end;
 *   4. the wax holds round: the bodies' roundness, 4πA/P² of each body over
 *      half oil weighted by its area (a disc reads 1, a stalk three times as
 *      long as wide about 0.6), averaged over the readings from 20 s, is
 *      0.72 or more, and 0.12 or more above the same lamp at the tension it
 *      had (SEALED_TENSION 1, SEALED_CELLS at OIL_CELLS' half a cell).
 * The lamp's cycle, which this must not change, is `npm run lavacycle`.
 *
 * Whole cells only count as a body from twenty cells of oil; a body's
 * perimeter is |∇c| summed over it and three cells round it, so a soft edge
 * and a hard one of the same shape read alike. On the Mac's `show` part
 * (Metal), about a minute and a half; on SwiftShader too slow to run.
 */
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256, SECONDS = 120, EVERY = 5, FROM = 20;
// Replace lines of one source file in a lab's bundle, failing loudly unless each is there exactly once.
const swap = (name, file, pairs) => ({
  name,
  setup(b) {
    b.onLoad({ filter: file }, (a) => {
      let s = readFileSync(a.path, 'utf8');
      for (const [from, to] of pairs) {
        const found = s.split(from).length - 1;
        if (found !== 1) throw new Error(`lavaround: the ${name} control found ${found} of 1 of its line in ${a.path}`);
        s = s.replace(from, to);
      }
      return { contents: s, loader: 'ts' };
    });
  },
});
const AS_IT_WAS = swap('as-it-was', /src[\\/]gpu[\\/]fluid[\\/]constants\.ts$/, [
  ['export const SEALED_TENSION = 4;', 'export const SEALED_TENSION = 1;'],
  ['export const SEALED_CELLS = 1;', 'export const SEALED_CELLS = 0.5;'],
]);
const LIP_OPEN = swap('lip-open', /src[\\/]gpu[\\/]wgsl[\\/]fluid[\\/]carry\.ts$/, [['if (A.a.x > 0.5) { return true; }', '']]);
const GUARD = swap('guard', /src[\\/]gpu[\\/]wgsl[\\/]fluid[\\/]oil\.ts$/, [['vec2f(-8.0, 8.0), A.b.y > 0.5)', 'vec2f(-0.25, 1.25), A.b.y > 0.5)']]);

const gpuErrors = [];
async function inLab(opts) {
  const lab = await openLab(opts);
  lab.page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
  try {
    await lab.page.evaluate(layLamp, { N });
    const t = [];
    for (let sec = 0; sec <= SECONDS; sec += EVERY) t.push({ sec, ...(await lab.page.evaluate(readLamp, { steps: sec ? Math.round(EVERY * 30) : 0 })) });
    return t;
  } finally {
    await lab.close();
  }
}

/** In the page: the look's settings as the app hands them to the solver, and its wax laid as the app lays it. */
async function layLamp({ N }) {
  const look = lab.look('lava-lamp').settings;
  const WAX = lab.dyeOf([0.86, 0.08, 0.24]);
  const visc = look.viscosity === 'thick' ? 1.5 : 0.5;
  const sh = Math.max(0, Math.min(1, look.sharpness ?? 0)), tu = Math.max(0, Math.min(1, look.turbulenceScale));
  window.__lamp = { thinGap: 1, gapThickness: look.gapThickness ?? 0.45, plateUpright: look.plateUpright, solutalBuoyancy: look.solutalBuoyancy,
    gravityX: 0, gravityY: -1, gravityReach: 0.3, dt: 0.00133, magnetSeconds: 1 / 30, heatDecay: look.heatDecay, currentBuoy: look.buoyancy * 0.3, maxCurrent: 0.3,
    doubleDiffusion: look.doubleDiffusion, oilTension: look.oilTension, oilBodies: look.oilBodies, oilWeight: look.oilWeight,
    advection: look.advection, diff: look.diffusionRate ?? 0, damping: look.damping || 0.99, visc, nu: visc * 0.0001,
    sharpness: sh * (0.225 - 0.09 * sh), turbScale: tu * (1 + 3 * tu ** 3), turbDetail: Math.round(look.turbulenceDetail ?? 3),
    platePressure: look.platePressure ?? 0.4 };
  await lab.create(N);
  const s = lab.solver();
  for (let k = 0; k < 120 && !s.sealReady(); k++) await new Promise((q) => setTimeout(q, 250));
  if (!s.sealReady()) throw new Error('lavaround: the sealed bottle never readied');
  await lab.step(1, window.__lamp);
  for (const b of lab.lavaBodies) s.addMix(b.x, b.y, b.r, { oil: 1 });
  const L = 192, d = new Array(L * L * 4).fill(0);
  for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
    const c = lab.lavaLampCell((i + 0.5) / L, (j + 0.5) / L, L);
    if (c.dye > 0) { const k = (j * L + i) * 4; d[k] = WAX[0] * c.dye; d[k + 1] = WAX[1] * c.dye; d[k + 2] = WAX[2] * c.dye; d[k + 3] = c.dye; }
  }
  lab.addDye(d); lab.flush();
}

/** In the page: step, then read the oil: Σc over the grid and over the disc, and the bodies' roundness. */
async function readLamp({ steps }) {
  if (steps) await lab.step(steps, window.__lamp);
  const mix = await lab.chemistry('mix'), m = mix.n;
  const C = (i, j) => (i < 0 || j < 0 || i >= m || j >= m) ? 0 : mix.data[(j * m + i) * 4];
  const inDisc = (i, j) => Math.hypot((i + 0.5) / m - 0.5, (j + 0.5) / m - 0.5) <= 0.5;
  let grid = 0, disc = 0;
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const c = C(i, j); grid += c; if (inDisc(i, j)) disc += c; }
  // Bodies: cells over half oil, joined by their edges, inside the disc.
  const lbl = new Int32Array(m * m).fill(-1);
  let nl = 0;
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    if (lbl[j * m + i] >= 0 || C(i, j) <= 0.5 || !inDisc(i, j)) continue;
    const st = [j * m + i]; lbl[j * m + i] = nl;
    while (st.length) {
      const q = st.pop(), x = q % m, y = (q / m) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= m || Y >= m) continue;
        const r = Y * m + X;
        if (lbl[r] < 0 && C(X, Y) > 0.5 && inDisc(X, Y)) { lbl[r] = nl; st.push(r); }
      }
    }
    nl++;
  }
  // Each body owns the three cells round it, where its edge's gradient lies.
  let own = lbl;
  for (let it = 0; it < 3; it++) {
    const nx = own.slice();
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      if (own[j * m + i] >= 0) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = i + dx, Y = j + dy;
        if (X < 0 || Y < 0 || X >= m || Y >= m) continue;
        if (own[Y * m + X] >= 0) { nx[j * m + i] = own[Y * m + X]; break; }
      }
    }
    own = nx;
  }
  const A = new Float64Array(nl), P = new Float64Array(nl);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const l = own[j * m + i];
    if (l < 0) continue;
    A[l] += Math.min(1, Math.max(0, C(i, j)));
    P[l] += Math.hypot(0.5 * (C(i + 1, j) - C(i - 1, j)), 0.5 * (C(i, j + 1) - C(i, j - 1)));
  }
  let wr = 0, wa = 0, bodies = 0;
  for (let l = 0; l < nl; l++) {
    if (A[l] < 20) continue;
    wr += Math.min(1, 4 * Math.PI * A[l] / (P[l] * P[l])) * A[l]; wa += A[l]; bodies++;
  }
  return { grid, disc, round: wa ? wr / wa : 0, bodies };
}

const f3 = (v) => v.toFixed(3);
const meanRound = (t) => { const r = t.filter((x) => x.sec >= FROM); return r.reduce((a, x) => a + x.round, 0) / r.length; };
const now = await inLab({ tag: 'now' });
const wasRun = await inLab({ plugins: [AS_IT_WAS], tag: 'as-it-was' });
const lip = await inLab({ plugins: [LIP_OPEN], tag: 'lip-open' });
const guard = await inLab({ plugins: [GUARD], tag: 'guard' });

// 1.
{
  const laid = now[0].disc, worst = Math.max(...now.map((x) => Math.abs(x.disc / laid - 1)));
  check('the lamp keeps its oil: Σc over the disc within 0.1% of the laid wax at every reading for two minutes', laid > 100 && worst <= 0.001,
    `laid ${laid.toFixed(0)}, worst ${(100 * worst).toFixed(3)}%, at the end ${now.at(-1).disc.toFixed(0)}`);
}
// 2.
{
  const lost = 1 - lip.at(-1).disc / lip[0].disc;
  check('a meter that sees a leak: with the lip open again the disc has lost 2% or more of its oil by the end', lost >= 0.02, `lost ${(100 * lost).toFixed(2)}%`);
}
// 3.
{
  const lost = 1 - guard.at(-1).grid / guard[0].grid;
  check('and one that sees oil destroyed: with the guard back at -0.25..1.25, Σc over the grid has fallen 0.3% or more by the end', lost >= 0.003, `fell ${(100 * lost).toFixed(2)}%`);
}
// 4.
{
  const r = meanRound(now), w = meanRound(wasRun);
  check(`the wax holds round: the bodies' area-weighted roundness, averaged from ${FROM} s, is 0.72 or more and 0.12 or more above the tension it had`, r >= 0.72 && r - w >= 0.12,
    `${f3(r)} against ${f3(w)}`);
}
check('no GPU validation errors', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
console.log(`\nevery ${EVERY} s, the bodies' roundness (bodies):\nnow:        ${now.map((x) => `${x.round.toFixed(2)}(${x.bodies})`).join(' ')}\nas it was:  ${wasRun.map((x) => `${x.round.toFixed(2)}(${x.bodies})`).join(' ')}`);
console.log(`the disc's oil:\nnow:        ${now.map((x) => x.disc.toFixed(0)).join(' ')}\nlip open:   ${lip.map((x) => x.disc.toFixed(0)).join(' ')}\nthe grid's, guard back: ${guard.map((x) => x.grid.toFixed(0)).join(' ')}`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
