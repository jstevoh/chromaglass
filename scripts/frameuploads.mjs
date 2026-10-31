#!/usr/bin/env node
/**
 * What the CPU hands the GPU solver each step, and how much of it (PLAN.md 14ab-4).
 *
 *   npm run frameuploads                (both halves; the lab's wants an adapter
 *                                        that computes, PW_WEBGPU=1 off a Mac)
 *   npm run frameuploads -- --node      (the app's side only)
 *
 * Read in the code on 2026-10-24 (14ab): with the GPU solver attached, the
 * plate's CPU arrays are what the CPU's writers added since the last step (a
 * bubble's rim, a hand, a breath, a tool's few cells), and `flushDeltas`
 * copied all 192² cells into two interleaved arrays and uploaded the dye,
 * flow and multiplier grids whole every step: 1.3 MB, and 590 KB more for a
 * hand's grid and again for a breath's, for a ring of a few hundred cells.
 * Now the writers that know where they wrote say which rows (lib/deltaRows.ts),
 * and only those rows go across, with the rows the last upload to each grid
 * wrote, which the GPU's copy still holds and the fold reads again.
 *
 * The feature is "the GPU gets what it got before, from fewer bytes", so:
 *
 * The app's side, in node, the real FluidSimulation on a solver that keeps
 * what it is handed as a GPU texture would (the rows it is told, with
 * `rowsToWrite`, the same function the real solver uses):
 *   - after every writer, nothing is written outside the rows it said: the
 *     arrays are scanned row by row, so a writer that forgets is caught here
 *     and not as a ghost on a plate;
 *   - after every flush, every array is zero again (the multiplier one),
 *     the two interleaved upload arrays with them;
 *   - a run handing rows and a run handing every grid whole leave the
 *     solver's copies the same, bit for bit, after every flush: dye, flow,
 *     multiplier, hands and breath;
 *   - and the bytes handed across: a few cells' frame a small part of 1.3 MB.
 * Two controls: a write the writer did not say is seen by the scan, and a
 * solver that forgets the last upload's rows is seen by the comparison (a
 * hand two flushes old stays in its copy).
 *
 * The lab's side, the real solver (`fluid.ts` writeRows, the texture origin
 * and offset, the fold on the GPU): the same pattern of rows, laid and
 * stepped on a thin gap, with rows and whole, read back after every step.
 * The fields agree bit for bit. Controls: two whole runs agree (the solver is
 * deterministic, so a match means something), and each frame's span two
 * rows short of what it wrote is seen, alone, at its own step or the next.
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const nodeOnly = process.argv.includes('--node');
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const MB = (b) => `${(b / 1e6).toFixed(3)} MB`;

// ── The app's side ────────────────────────────────────────────────────
// The GPU's usage flags, which the solver's modules read at load; nothing here makes a texture.
globalThis.GPUTextureUsage = { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
globalThis.GPUBufferUsage = { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
globalThis.GPUMapMode = { READ: 1, WRITE: 2 };
globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const out = 'node_modules/.cache/frameuploads-sim.mjs';
await build({
  stdin: { contents: "export { FluidSimulation } from './src/sim/fluidSimulation';\nexport { rowsToWrite, bands } from './src/lib/deltaRows';\nexport { GRID_SIZE } from './src/sim/constants';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
});
const { FluidSimulation, rowsToWrite, bands, GRID_SIZE } = await import(pathToFileURL(`${process.cwd()}/${out}`).href);
const L = GRID_SIZE, AREA = L * L;

/** A solver that keeps what it is handed as its textures would: the rows it is told (rowsToWrite), or every row. */
function keeper({ forget = false } = {}) {
  const tex = { dye: new Float32Array(AREA * 4), vel: new Float32Array(AREA * 4), mul: new Float32Array(AREA), hands: new Float32Array(AREA * 4), breath: new Float32Array(AREA * 4) };
  const held = {};
  let bytes = 0;
  const take = (key, data, per, rows) => {
    // As the solver holds them (fluid.ts writeRows): a grid's first upload whole.
    if (!held[key]) held[key] = new Uint8Array(L).fill(1);
    else if (forget) held[key].fill(0);
    for (const [y0, y1] of rowsToWrite(rows, held[key], L)) {
      tex[key].set(data.subarray(y0 * L * per, (y1 + 1) * L * per), y0 * L * per);
      bytes += (y1 - y0 + 1) * L * per * 4;
    }
  };
  const dye = new Float32Array(AREA * 4);
  for (let i = 0; i < AREA; i++) { dye[i * 4] = 0.6; dye[i * 4 + 1] = 0.3; dye[i * 4 + 2] = 0.2; dye[i * 4 + 3] = 0.5; }
  return {
    tex, get bytes() { return bytes; },
    thinGapLive: true, phaseIsLive: false,
    rbDyeView: dye, rbVelView: new Float32Array(AREA * 4), rbDyeIssued: 1, rbDyeLanded: 1,
    clear() {},
    readback() { return { dye, vel: new Float32Array(AREA * 4) }; },
    applyDeltas(da, va, mul, _dt, hands, breath, _sheet, rows = null) {
      take('dye', da, 4, rows); take('vel', va, 4, rows); take('mul', mul, 1, rows);
      if (hands) take('hands', hands, 4, rows);
      if (breath) take('breath', breath, 4, rows);
    },
  };
}

/** The rows of the delta arrays holding anything, scanned (what the writers' own word is checked against). */
function writtenRows(sim) {
  const arrays = [[sim.density, 1, 0], [sim.densityR, 1, 0], [sim.densityG, 1, 0], [sim.densityB, 1, 0], [sim.vx, 1, 0], [sim.vy, 1, 0], [sim.temp, 1, 0], [sim.gap, 1, 0], [sim.mul, 1, 1]];
  if (sim.hands) arrays.push([sim.hands, 4, 0]);
  if (sim.breath) arrays.push([sim.breath, 4, 0]);
  const rows = new Set();
  for (const [a, per, rest] of arrays) for (let i = 0; i < a.length; i++) if (a[i] !== rest) rows.add(Math.floor(i / per / L));
  return [...rows].sort((a, b) => a - b);
}
const allRest = (sim) => writtenRows(sim).length === 0 && sim.dyeAdd.every((v) => v === 0) && sim.velAdd.every((v) => v === 0);

/** The frames: what a show's writers do between two steps, each a few rows somewhere, and once the whole plate. */
const frames = [
  ['a tool\'s few cells', (s) => { for (let x = 90; x < 96; x++) s.addDensity(x, 40, 0.3, 1, 0.4, 0.2); s.addVelocity(92, 41, 0.5, -0.2); s.addTemp(93, 42, 0.1); }],
  // Radii in the 128-cell units the tools are given in (LiquidVisualizer's hand: 7).
  ['a hand in the liquid', (s) => s.fingerDrag(100, 120, 7, 0.05, 0.6, 0.2)],
  ['a breath on the film', (s) => s.blowWind(60, 150, 10, 1, 0.5, 0.5)],
  ['a bubble\'s rim', (s) => { s.rbSeq++; s.depositBubbleRims(new Float32Array([0.5, 0.3, 0.04, 1]), 1); }],
  ['the bubble popped, its hole filled', (s) => {
    // The mirror shows the hole the bubble left, so there is something to fill.
    const v = s.gpu.rbDyeView, R = 0.04 * L;
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) if (Math.hypot(x - 0.5 * L, y - 0.3 * L) < R) v.fill(0, (x + y * L) * 4, (x + y * L) * 4 + 4);
    s.rbSeq++; s.depositBubbleRims(new Float32Array(4), 0);
  }],
  ['a hand elsewhere, two flushes after the last', (s) => s.fingerDrag(30, 20, 5, 0.05, -0.4, 0.3)],
  ['a breath elsewhere, its grid by rows', (s) => s.blowWind(120, 60, 10, 1, -0.5, 0.3)],
  /*
    A bubble far bigger than the app makes (bubbles.ts caps them at 0.07 of
    the plate): its hole is filled from a wider ring than its rim's, and
    marking the rim's rows for the fill left rows unsent past R = 22 cells
    (the review of 14ab-4).
  */
  ['a big bubble\'s rim', (s) => { s.rbSeq++; s.depositBubbleRims(new Float32Array([0.5, 0.5, 0.2, 1]), 1); }],
  ['the big bubble popped, its hole filled', (s) => {
    const v = s.gpu.rbDyeView, R = 0.2 * L;
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) if (Math.hypot(x - 0.5 * L, y - 0.5 * L) < R) v.fill(0, (x + y * L) * 4, (x + y * L) * 4 + 4);
    s.rbSeq++; s.depositBubbleRims(new Float32Array(4), 0);
  }],
  ['a tool\'s few cells again', (s) => s.addDensity(150, 170, 0.2)],
  ['and the next step', (s) => s.addDensity(150, 171, 0.2)],
  ['the room\'s stir, the whole plate', (s) => { for (let i = 0; i < AREA; i++) s.vx[i] += 1e-3; s.markDirty(); }],
  ['a tool\'s few cells after it', (s) => s.addVelocity(20, 100, 0.1, 0.1)],
];

function run({ whole = false, forget = false, record = null } = {}) {
  const sim = new FluidSimulation(L, 0, 0, 0.1);
  const gpu = keeper({ forget });
  sim.attachGpu(gpu);
  if (whole) sim.rows.rows = () => null;
  sim.flushDeltas(0.01);
  const per = [];
  for (const [name, lay] of frames) {
    const before = gpu.bytes;
    lay(sim);
    const said = sim.rows.rows();
    const span = said ? bands(said, L, 0) : null;
    const rows = writtenRows(sim);
    const outside = said ? rows.filter((y) => !said[y]) : [];
    // Flushed when there is something to flush, as the step does.
    if (sim.dirty) sim.flushDeltas(0.01);
    per.push({ name, span, rows: rows.length, outside, rest: allRest(sim), bytes: gpu.bytes - before, tex: Object.fromEntries(Object.entries(gpu.tex).map(([k, v]) => [k, v.slice()])) });
    record?.(sim);
  }
  return per;
}
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
const differ = (A, B) => A.map((f, i) => Object.keys(f.tex).filter((k) => !same(f.tex[k], B[i].tex[k])));

const rowsRun = run();
const wholeRun = run({ whole: true });
const forgetRun = run({ forget: true });
console.log(`  The app's side: FluidSimulation on a ${L}² delta grid, ${frames.length} frames`);
for (let i = 0; i < frames.length; i++) {
  const f = rowsRun[i];
  console.log(`  ${f.name}: rows ${f.span ? f.span.map(([a, b]) => `${a}–${b}`).join(', ') : 'all'} (${f.rows} written), ${MB(wholeRun[i].bytes)} → ${MB(f.bytes)}`);
}
check('every writer wrote only inside the rows it said', rowsRun.every((f) => f.outside.length === 0 && f.rows > 0),
  rowsRun.filter((f) => f.outside.length || !f.rows).map((f) => `${f.name}: ${f.rows ? `rows ${f.outside.slice(0, 4).join(',')} outside` : 'wrote nothing'}`).join('; '));
check('every flush leaves the arrays at rest, the upload arrays too', rowsRun.every((f) => f.rest) && wholeRun.every((f) => f.rest),
  rowsRun.filter((f) => !f.rest).map((f) => f.name).join(', '));
const off = differ(rowsRun, wholeRun);
check('rows and whole leave the solver the same, bit for bit, every flush', off.every((k) => k.length === 0),
  off.map((k, i) => k.length ? `${frames[i][0]}: ${k.join(',')}` : '').filter(Boolean).join('; '));
// Two steps of a cell or two each: the second sends its rows and the first's, and that is all (36 bytes a cell: dye, flow, multiplier).
const at = frames.findIndex(([n]) => n === 'and the next step');
const few = rowsRun[at].bytes, all = wholeRun[at].bytes;
check('a step of a few cells after another sends their rows and nothing else', few === 2 * L * 36, `${MB(all)} → ${MB(few)}, against ${MB(2 * L * 36)} for rows 170 and 171`);
const sum = (r) => r.reduce((a, f) => a + f.bytes, 0);
console.log(`  over the ${frames.length} frames: ${MB(sum(wholeRun))} → ${MB(sum(rowsRun))}`);

// Controls.
const sneak = new FluidSimulation(L, 0, 0, 0.1);
sneak.attachGpu(keeper());
sneak.flushDeltas(0.01);
sneak.addDensity(10, 12, 0.2);
sneak.density[100 * L + 50] = 0.1;                  // written, and not said
const seen = writtenRows(sneak).filter((y) => !sneak.rows.rows()[y]);
check('control: a write the writer did not say is seen by the scan', seen.includes(100), `rows outside: ${seen.join(',')}`);
const ghost = differ(forgetRun, wholeRun).map((k, i) => k.length ? `${frames[i][0]}: ${k.join(',')}` : '').filter(Boolean);
check('control: a solver that forgets the last upload\'s rows is seen', ghost.length > 0, ghost.slice(0, 2).join('; '));

// ── The lab's side ────────────────────────────────────────────────────
if (!nodeOnly) {
  const { openLab } = await import('./lab.mjs');
  const { page, close } = await openLab();
  try {
    const r = await page.evaluate(async () => {
      const p = { thinGap: 1 };
      /*
        The same shape of frames on the real solver: a disc of dye, a hand
        with its flow, a breath, dye and a hand somewhere else (the hand's
        grid last written two uploads before, so its old rows must be sent
        as zeros), a breath elsewhere, single cells, and last the whole
        plate, as the room's stir is. A frame thins the dye (the multiplier).
        `shortAt` hands that one frame a span two rows short of what was
        written, the control (a disc's last row is its edge, weight nothing).
      */
      const go = async (mode, shortAt = -1) => {
        const { L } = await lab.create(128);
        const s = lab.solver();
        const A = L * L;
        const da = new Float32Array(A * 4), va = new Float32Array(A * 4), mul = new Float32Array(A).fill(1);
        const hands = new Float32Array(A * 4), breath = new Float32Array(A * 4);
        let lo = Infinity, hi = -1;
        const disc = (arr, cx, cy, r, f) => {
          for (let y = Math.max(1, cy - r); y <= Math.min(L - 2, cy + r); y++) for (let x = Math.max(1, cx - r); x <= Math.min(L - 2, cx + r); x++) {
            const d = Math.hypot(x - cx, y - cy);
            if (d > r) continue;
            f(arr, (x + y * L) * 4, 1 - d / r);
            lo = Math.min(lo, y); hi = Math.max(hi, y);
          }
        };
        const dye = (cx, cy, r) => disc(da, cx, cy, r, (a, k, w) => { a[k] += 0.4 * w; a[k + 1] += 0.2 * w; a[k + 2] += 0.1 * w; a[k + 3] += w; });
        const flow = (cx, cy, r) => disc(va, cx, cy, r, (a, k, w) => { a[k] += 0.3 * w; a[k + 1] -= 0.2 * w; });
        const hand = (cx, cy, r) => disc(hands, cx, cy, r, (a, k, w) => { a[k] += 0.2 * w; a[k + 1] += 0.1 * w; a[k + 2] += Math.min(1, 2 * w); });
        const air = (cx, cy, r) => disc(breath, cx, cy, r, (a, k, w) => { a[k] += 0.05 * w; a[k + 1] += 0.02 * w; });
        const frames = [
          () => { dye(Math.round(L * 0.45), Math.round(L * 0.2), 4); disc(mul, Math.round(L * 0.45), Math.round(L * 0.25), 6, (a, k, w) => { a[k / 4] *= 1 - 0.3 * w; }); },
          () => { hand(Math.round(L * 0.5), Math.round(L * 0.6), 6); flow(Math.round(L * 0.5), Math.round(L * 0.6), 6); return 'hands'; },
          () => { air(Math.round(L * 0.3), Math.round(L * 0.8), 7); return 'breath'; },
          () => { dye(Math.round(L * 0.6), Math.round(L * 0.12), 3); hand(Math.round(L * 0.2), Math.round(L * 0.35), 5); return 'hands'; },
          () => { air(Math.round(L * 0.7), Math.round(L * 0.25), 6); return 'breath'; },
          () => dye(Math.round(L * 0.7), Math.round(L * 0.75), 1),
          () => dye(Math.round(L * 0.35), Math.round(L * 0.9), 1),
          () => { for (let i = 0; i < A; i++) va[i * 4] += 1e-3; dye(Math.round(L * 0.5), Math.round(L * 0.5), 10); lo = 0; hi = L - 1; return 'whole'; },
        ];
        /*
          The app's first flush is whole (attachGpu), and so is every grid's
          first upload: one here, before the count, with a wash of dye for
          the multiplier to thin. Then a flush that wrote
          nothing, which sends the whole grids once more as zeros and leaves
          no rows held, so every frame after goes by its own rows.
        */
        for (let i = 0; i < A; i++) { da[i * 4] = 0.12; da[i * 4 + 1] = 0.06; da[i * 4 + 2] = 0.03; da[i * 4 + 3] = 0.3; }
        s.applyDeltas(da, va, mul, 0.01, hands, breath, null, null);
        da.fill(0);
        s.applyDeltas(da, va, mul, 0.01, hands, breath, null, new Uint8Array(L));
        await lab.step(1, p, true);
        const before = s.uploads.bytes;
        const reads = [];
        for (let i = 0; i < frames.length; i++) {
          lo = Infinity; hi = -1;
          const kind = frames[i]();
          let rows = null;
          if (mode !== 'whole' && kind !== 'whole') { rows = new Uint8Array(L); rows.fill(1, lo, i === shortAt ? hi - 1 : hi + 1); }
          s.applyDeltas(da, va, mul, 0.01, kind === 'hands' ? hands : null, kind === 'breath' ? breath : null, null, rows);
          da.fill(0); va.fill(0); hands.fill(0); breath.fill(0); mul.fill(1);
          await lab.step(1, p, true);
          const d = await s.readField('dye'), v = await s.readField('vel');
          reads.push([d, v]);
        }
        return { reads, bytes: s.uploads.bytes - before, L, frames: frames.length };
      };
      const eq = (a, b) => { const x = new Uint32Array(a.buffer, a.byteOffset, a.length), y = new Uint32Array(b.buffer, b.byteOffset, b.length); if (x.length !== y.length) return false; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; };
      const agree = (A, B) => A.reads.map((r, i) => eq(r[0], B.reads[i][0]) && eq(r[1], B.reads[i][1]));
      const rows = await go('rows'), whole = await go('whole'), whole2 = await go('whole');
      // Each frame by rows short of its own, alone: seen at its own step or the next (the last is whole).
      const shortSeen = [];
      for (let k = 0; k < rows.frames - 1; k++) { const a = agree(await go('rows', k), whole); shortSeen.push(!a[k] || (k + 1 < a.length && !a[k + 1]) ? 'seen' : 'MISSED'); }
      return { L: rows.L, rowsBytes: rows.bytes, wholeBytes: whole.bytes, rowsVsWhole: agree(rows, whole), wholeVsWhole: agree(whole, whole2), shortSeen };
    });
    console.log(`  The lab's side: the real solver, ${r.L}² delta grid, thin gap, ${r.rowsVsWhole.length} frames stepped`);
    console.log(`  bytes handed across: ${MB(r.wholeBytes)} whole → ${MB(r.rowsBytes)} by rows`);
    check('control: two whole runs agree bit for bit after every step', r.wholeVsWhole.every(Boolean), r.wholeVsWhole.join(','));
    check('rows and whole give the same plate, bit for bit, after every step', r.rowsVsWhole.every(Boolean), r.rowsVsWhole.join(','));
    check('control: each frame\'s span two rows short of what it wrote is seen', r.shortSeen.every((v) => v === 'seen'), `frames 1–${r.shortSeen.length}: ${r.shortSeen.join(',')}`);
    check('the real solver hands across less by rows', r.rowsBytes > 0 && r.rowsBytes * 2 < r.wholeBytes, `${MB(r.wholeBytes)} → ${MB(r.rowsBytes)}`);
  } finally { await close(); }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
