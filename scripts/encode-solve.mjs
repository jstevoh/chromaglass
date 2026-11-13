/**
 * The multigrid's own lines in `npm run encode`: how many dispatches a step
 * the pressure solve asks for, and how well it solves (PLAN docs/plan/40-specs-frame-gig-desk.md,
 * H2c-1, H2c-3 and H2c-2; the residual line those entries call *owed*).
 *
 * Why this is here and not in `pressureSelfTest`. The plan's bar for each of
 * the three is "the residual after the projection no worse than main's", and
 * `pressureSelfTest` (src/gpu/selftest.ts) does not run the projection: it
 * runs a Jacobi and a red-black smoother on a 64² blob, beside each other, to
 * prove the packed layout. The three items change the V-cycle itself (the
 * coarse levels solved in one workgroup, the zeroing folded into the first
 * sweep, one cycle from a warm start), which the self-test never calls. So the
 * residual is read from the solver's own buffers after a real step: the
 * right-hand side the step solved (`div`), the pressure it found (`hsP` on a
 * thin gap, `press` on the open plate) and, on a thin gap, the mobility that
 * makes its operator. It is read by dispatching the solver's own restriction
 * kernel once more after the step (`hsRestrict0` or `mgRestrict0`, the very
 * kernel the V-cycle uses to hand its residual to the level below), so the
 * operator the residual is taken against is the solver's, not a copy of it
 * written here that could drift from it. That kernel sums the residual of each
 * 2×2 block of cells; the norm read here is of those sums, against the same
 * sums of the right-hand side with a pressure of zero. What a multigrid
 * leaves behind after its cycles is smooth error, which a 2×2 sum keeps; what
 * it could hide (a checkerboard that cancels in a block) is what the red-black
 * smoother removes first.
 *
 * The plate is the one `encode` already steps (a thin gap, a dye drop), with a
 * stir laid in so the flow has a divergence to remove, then the open plate
 * the same way (the `else` branch of the step, `project()` twice, which is
 * where H2c-2's warm start would go: the thin gap is already warm, PLAN
 * 18a-12). Each read is the median of six, a few steps apart, so the line is
 * the solver's and not one moment of one plate.
 *
 * Owed lines (`--owed=h2c1,h2c3,h2c2` in scripts/checks.json, the convention
 * of `wallflash.mjs` and `liveshow.mjs`): each is printed as owed while it
 * fails, and is red the day it passes with its id still listed, so the PR that
 * ships one takes its id out. The residual lines are never owed: they hold on
 * main and say a faster solve is not a worse one. Their bar is 1.05 times
 * main's while H2c-2 is owed and 1.5 times once it ships (its own entry's
 * bar: one cycle from a warm start is allowed to stop a little short, and is
 * judged by this number, not by eye), so the builder never moves a bar.
 */

import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { ENCODE_OWED } from './encode-owed.mjs';

/*
  Main's numbers, read by this file on 2026-11-01 at 512² under the lab
  (SwiftShader, the lab shard's adapter), the base the bars are fractions of.
  The dispatches were 267 on 2026-10-24 (the plan's figure) and 269 here;
  270 since 2026-11-13 (below).
  The residuals, as printed: thin gap median 6.393e-2 of [8.43e-2 6.90e-2
  6.38e-2 6.32e-2 6.36e-2 6.39e-2], open plate 2.071e-3 of [1.99e-3 2.42e-3
  2.03e-3 2.07e-3 2.06e-3 2.72e-3]. The thin gap's solve is two warm-started
  V-cycles of a variable-coefficient operator and stops at about 6% of its
  right-hand side; the open plate's, two cold cycles twice a step, at 0.2%.
*/
const MAIN_DISPATCHES = 270;
const MAIN_THIN_ZEROS = 14; // mgZero dispatches in a thin-gap step on main
/*
  And the indirect dispatches (the carries' substeps), 64 a thin step on main:
  each owed line counts both, so work moved from one kind to the other is not
  a saving, and its bar is the plan's removal from the direct count (35% of
  270 is 95; H2c-3's 14; H2c-2's 150) taken off main's total of 334.

  Read again 2026-11-13 with 46g, and why the base moved twice. It was 269
  and 96 (365) on 2026-11-01. Main had since grown to 272 and 128 (400: the
  lamp's heat is one more field carried through the thin gap, 38f-1's
  carryHeat, a pack, 32 substeps and an unpack)
  with the bars left where they were, 35 dispatches further off than the
  plan's removals. Then 46g stopped carrying the two liquids' fields on a
  plate nothing was poured on, which is this plate: 270 and 64 (334), 66
  dispatches that were never any owed item's to remove. Left at 365, H2c-3's
  dispatch clause would hold with nothing built (334 is under 351) and
  H2c-1's would be 31 nearer; and each line's "what main makes" test (a total
  within 2 of the base) would read 46g as a build that missed. So the base
  is what main makes today and every bar is its own removal off that:
  H2c-1 at most 239 (was 270), H2c-3 320 (was 351), H2c-2 184 (was 215).
*/
const MAIN_TOTAL = 334;
const MAIN_RESIDUAL_THIN = 6.393e-2;
const MAIN_RESIDUAL_OPEN = 2.071e-3;

const residualsOf = async (page, thin, samples, gap) => page.evaluate(async ({ thin, samples, gap }) => {
  const s = lab.solver();
  const d = s.device;
  const n = s.N, nc = s.mg[0].n;
  /*
    Two buffers of this check's own, kept for the run (the solver's level
    buffers are STORAGE alone, never copied out): what the kernel writes, and
    a pressure of zero. With a pressure of zero the kernel's residual is the
    right-hand side itself, masked by the rim as the solve masks it, so both
    numbers of the ratio come from the solver's operator.
  */
  const keep = (window.__solve ??= {});
  const bufOf = (name, size, usage) => (keep[name] ??= d.createBuffer({ label: `encode ${name}`, size, usage }));
  const outB = bufOf(`out ${nc}`, nc * nc * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
  const zero = bufOf(`zero ${n}`, n * n * 4, GPUBufferUsage.STORAGE);
  const restrict = (pass, p, key) => {
    if (thin) s.hsRun(pass, 'hsRestrict0', `encode ${key} thin`, s.arg('none', [0, 0, 0, 0]), [s.div, p, s.hsMob, outB], nc * nc);
    else s.dispatchBuf(pass, 'mgRestrict0', `encode ${key} open`, s.arg('none', [0, 0, 0, 0]), [s.div, p, outB], nc * nc);
  };
  const read = async (p, key) => {
    const enc = d.createCommandEncoder();
    const pass = enc.beginComputePass();
    restrict(pass, p, key);
    pass.end();
    const rb = d.createBuffer({ size: nc * nc * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyBufferToBuffer(outB, 0, rb, 0, nc * nc * 4);
    d.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    let sum = 0;
    for (const v of new Float32Array(rb.getMappedRange())) sum += v * v;
    rb.unmap(); rb.destroy();
    return Math.sqrt(sum);
  };
  const out = [];
  for (let k = 0; k < samples; k++) {
    lab.vel(0.35 + 0.05 * k, 0.5, 0.12, [2, 1, 0, 0]);
    lab.flush();
    await lab.step(gap, { thinGap: thin ? 1 : 0, immiscibility: 0.5 });
    const solved = thin ? s.hsP : s.press;
    const r = await read(solved, 'solved');
    const b = await read(zero, 'zero');
    out.push({ rel: r / Math.max(b, 1e-30), b });
    if (k === samples - 1) {
      /*
        The control: the same solve's pressure at half strength, which leaves
        about half the right-hand side unsolved. A measure that read the
        kernel's output wrong (a buffer never written, the wrong binding)
        would read the two the same.
      */
      const half = bufOf(`half ${n}`, n * n * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
      const pr = d.createBuffer({ size: n * n * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = d.createCommandEncoder();
      enc.copyBufferToBuffer(solved, 0, pr, 0, n * n * 4);
      d.queue.submit([enc.finish()]);
      await pr.mapAsync(GPUMapMode.READ);
      const halved = new Float32Array(pr.getMappedRange()).map((v) => v * 0.5);
      pr.unmap(); pr.destroy();
      d.queue.writeBuffer(half, 0, halved);
      out.control = (await read(half, 'half')) / Math.max(b, 1e-30);
    }
  }
  return { reads: out, control: out.control };
}, { thin, samples, gap });

export const SOLVE_OWED = ['h2c1', 'h2c3', 'h2c2'];

export async function solveLines(page, run, check) {
  const flag = process.argv.find((a) => a.startsWith('--owed='));
  const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
  const known = [...SOLVE_OWED, ...ENCODE_OWED];
  const unknown = [...owed].filter((id) => !known.includes(id));
  if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${known.join(', ')})`);
  // `mainState`: the step still as main's, the only state an owed line is excused in.
  const line = (id, name, ok, detail, mainState) => {
    if (!owed.has(id)) return check(name, ok, detail);
    if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
    if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
    console.log(` owed  ${name} — ${detail}`);
  };

  const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

  // The open plate's step, counted the way `encode`'s thin one was.
  const residuals = (thin, samples, gap) => residualsOf(page, thin, samples, gap);
  const thinAll = await residuals(true, 6, 4);
  const thinRes = thinAll.reads;
  const open = await page.evaluate(async () => {
    const { counts } = window.__encode;
    counts.dispatches = 0; counts.by = {}; counts.on = true;
    await lab.step(4, { thinGap: 0, immiscibility: 0.5 });
    counts.on = false;
    return { dispatches: counts.dispatches / 4, by: Object.fromEntries(Object.entries(counts.by).map(([k, v]) => [k, v / 4])) };
  });
  const openAll = await residuals(false, 6, 2);
  const openRes = openAll.reads;

  const zeroThinOf = (r) => per(r.by, 'mgZero', r.steps);
  const per = (by, k, steps = 1) => Object.entries(by).reduce((a, [l, v]) => a + (l === k || l.startsWith(`${k}:`) ? v : 0), 0) / steps; // a thin gap's pipeline is labelled `name:thin`
  const thinStep = run.dispatches / run.steps;
  const thinTotal = (run.dispatches + run.indirect) / run.steps;
  const mgZero = per(run.by, 'mgZero', run.steps) + per(open.by, 'mgZero');
  const cyclesThin = per(run.by, 'hsRestrict0', run.steps);
  const cyclesOpen = per(open.by, 'mgRestrict0') / 2; // two projections a step on the open plate
  const rt = median(thinRes.map((x) => x.rel)), ro = median(openRes.map((x) => x.rel));
  console.log(`  the solve: thin gap ${thinStep.toFixed(0)} dispatches a step and ${(run.indirect / run.steps).toFixed(0)} indirect (main ${MAIN_DISPATCHES} and ${MAIN_TOTAL - MAIN_DISPATCHES}), ${zeroThinOf(run)} of them mgZero; open plate ${open.dispatches.toFixed(0)}; mgZero ${mgZero.toFixed(0)} a step on the two; V-cycles a projection: thin ${cyclesThin}, open ${cyclesOpen}`);
  console.log(`  the residual after a step, ‖r‖/‖b‖ of the 2×2 sums: thin gap median ${rt.toExponential(3)} [${thinRes.map((x) => x.rel.toExponential(2)).join(' ')}], open plate median ${ro.toExponential(3)} [${openRes.map((x) => x.rel.toExponential(2)).join(' ')}]`);
  console.log(`  right-hand sides ‖b‖: thin ${thinRes.map((x) => x.b.toExponential(1)).join(' ')}, open ${openRes.map((x) => x.b.toExponential(1)).join(' ')}`);

  check('the residual is read from a solve that had something to solve', thinRes.every((x) => x.b > 0) && openRes.every((x) => x.b > 0) && rt < 1 && ro < 1,
    `‖b‖ > 0 on all twelve reads and both medians under 1 (a pressure of zero reads exactly 1)`);
  check('control: the same pressure at half strength reads at least four times the residual', thinAll.control >= 4 * rt && openAll.control >= 4 * ro,
    `thin ${thinAll.control.toExponential(2)}, open ${openAll.control.toExponential(2)}`);
  const bar = owed.has('h2c2') ? 1.05 : 1.5;
  check(`the thin gap's residual no worse than ${bar} times main's`, Number.isFinite(MAIN_RESIDUAL_THIN) && rt <= bar * MAIN_RESIDUAL_THIN, `${rt.toExponential(3)} against ${(bar * MAIN_RESIDUAL_THIN).toExponential(3)}`);
  check(`the open plate's residual no worse than ${bar} times main's`, Number.isFinite(MAIN_RESIDUAL_OPEN) && ro <= bar * MAIN_RESIDUAL_OPEN, `${ro.toExponential(3)} against ${(bar * MAIN_RESIDUAL_OPEN).toExponential(3)}`);

  /*
    Each owed line asks for the dispatches its item removes as well as the
    kernel it names, so a zeroing renamed or moved into a buffer clear (which
    a label count would not see) is not a pass (the check-skeptic). An
    indirect dispatch is counted too (encode.mjs); none is made today.
  */
  const zeroThin = per(run.by, 'mgZero', run.steps);
  const cut = Math.ceil(0.35 * MAIN_DISPATCHES);
  line('h2c1', 'H2c-1: a thin-gap step at least 35% fewer dispatches than main', thinTotal <= MAIN_TOTAL - cut, `${thinTotal.toFixed(0)} direct and indirect against at most ${MAIN_TOTAL - cut}`,
    thinTotal >= MAIN_TOTAL - 2);
  line('h2c3', 'H2c-3: no mgZero dispatch (the first sweep reads zero), and a thin step that many dispatches lighter', mgZero === 0 && thinTotal <= MAIN_TOTAL - MAIN_THIN_ZEROS,
    `${mgZero.toFixed(0)} mgZero a step on the two plates, ${thinTotal.toFixed(0)} dispatches a thin step against at most ${MAIN_TOTAL - MAIN_THIN_ZEROS}`, zeroThin === MAIN_THIN_ZEROS);
  line('h2c2', 'H2c-2: one V-cycle a projection, and a step at least 150 fewer dispatches than main', cyclesThin === 1 && cyclesOpen === 1 && thinTotal <= MAIN_TOTAL - 150,
    `${cyclesThin} and ${cyclesOpen} cycles, ${thinTotal.toFixed(0)} dispatches against at most ${MAIN_TOTAL - 150}`, cyclesThin === 2 && cyclesOpen === 2);
  return { owed, line, rt };
}


/*
  H2c-10's second clause: a pinned grid solves as well as the ladder's own.
  `resolveSimResolution` rounds `?sim=N` (or a saved look's grid) to even
  only, so 514 keeps a coarsest multigrid level of 257 and 1000 one of 125:
  the V-cycle halves while it can and stops there, and the sweeps at the
  coarsest level cannot carry a smooth error across a grid that size, so the
  cycle is little better than sweeping. The rounding line is in `npm run
  rungs` (id `grid32`); this is the residual it is for, at the grid the
  rounding gives, after the same thin-gap stir as the 512² plate above, held
  to within twice that plate's (the plan's bar). The grid comes from the
  real `resolveSimResolution` (src/sim/stepping.ts), bundled here as
  `rungs` bundles it, with the auto rung passed so no governor is consulted:
  a build that rounds well passes by the rounding, not by a list written
  here. Same id as rungs' line: the H2c-10 build takes `grid32` out of both.
*/
const ASKED = [514, 1000, 777, 100];

export async function gridLines(page, check) {
  const out = 'node_modules/.cache/encode-stepping.mjs';
  await build({ entryPoints: ['src/sim/stepping.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning' });
  for (const k of ['GPUTextureUsage', 'GPUBufferUsage', 'GPUShaderStage', 'GPUMapMode', 'GPUColorWrite']) globalThis[k] ??= {};
  const { resolveSimResolution } = await import(pathToFileURL(out).href);
  const grids = ASKED.map((n) => resolveSimResolution(n, null, 8192, 512));
  /*
    Every grid read the same way, the 512² plate first as the reference: a
    fresh solver, the dye drop, four thin steps, then three reads a step
    apart, the middle one kept. The protocol matters more than it looks: the
    thin gap's solve is warm-started from the last step's pressure, so its
    residual falls for the first dozen steps of a plate, and a pinned grid read
    after four steps against the 512² plate read after thirty-odd (the lines
    above) came out at 3.1 times on main where the same grids read after
    twenty steps came out at 0.7 (2026-11-07). Like against like.
  */
  const at = async (g) => {
    await page.evaluate(async (n) => {
      await lab.create(n);
      window.__solve = {}; // its buffers belonged to the last solver's device
      lab.dye(0.5, 0.5, 0.2, [1, 0.6, 0.3], 3);
      lab.flush();
      await lab.step(4, { thinGap: 1, immiscibility: 0.5 });
    }, g);
    const { reads } = await residualsOf(page, true, 3, 1);
    return reads.map((x) => x.rel).sort((a, b) => a - b)[1];
  };
  const ref = await at(512);
  const reads = [];
  for (const g of grids) reads.push(await at(g));
  const worst = Math.max(...reads.map((r) => r / ref));
  console.log(`  pinned grids, each fresh and read after four steps: 512² ${ref.toExponential(3)}; ${ASKED.map((n, i) => `${n} → ${grids[i]}² ${reads[i].toExponential(3)} (${(reads[i] / ref).toFixed(2)}x)`).join(', ')}`);
  check('every pinned grid\'s residual is read from a solve (under 1, a pressure of zero reads 1)', ref > 0 && reads.every((r) => r > 0 && r < 1), [ref, ...reads].map((r) => r.toExponential(2)).join(' '));
  return { worst, grids };
}
