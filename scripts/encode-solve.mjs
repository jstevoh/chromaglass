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

/*
  Main's numbers, read by this file on 2026-11-01 at 512² under the lab
  (SwiftShader, the lab shard's adapter), the base the bars are fractions of.
  The dispatches were 267 on 2026-10-24 (the plan's figure) and 269 here.
  The residuals, as printed: thin gap median 6.393e-2 of [8.43e-2 6.90e-2
  6.38e-2 6.32e-2 6.36e-2 6.39e-2], open plate 2.071e-3 of [1.99e-3 2.42e-3
  2.03e-3 2.07e-3 2.06e-3 2.72e-3]. The thin gap's solve is two warm-started
  V-cycles of a variable-coefficient operator and stops at about 6% of its
  right-hand side; the open plate's, two cold cycles twice a step, at 0.2%.
*/
const MAIN_DISPATCHES = 269;
const MAIN_RESIDUAL_THIN = 6.393e-2;
const MAIN_RESIDUAL_OPEN = 2.071e-3;

export const SOLVE_OWED = ['h2c1', 'h2c3', 'h2c2'];

export async function solveLines(page, run, check) {
  const flag = process.argv.find((a) => a.startsWith('--owed='));
  const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
  const unknown = [...owed].filter((id) => !SOLVE_OWED.includes(id));
  if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${SOLVE_OWED.join(', ')})`);
  const line = (id, name, ok, detail) => {
    if (!owed.has(id)) return check(name, ok, detail);
    if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
    console.log(` owed  ${name} — ${detail}`);
  };

  const residuals = async (thin, samples, gap) => page.evaluate(async ({ thin, samples, gap }) => {
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
  const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

  // The open plate's step, counted the way `encode`'s thin one was.
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

  const per = (by, k, steps = 1) => Object.entries(by).reduce((a, [l, v]) => a + (l === k || l.startsWith(`${k}:`) ? v : 0), 0) / steps; // a thin gap's pipeline is labelled `name:thin`
  const thinStep = run.dispatches / run.steps;
  const mgZero = per(run.by, 'mgZero', run.steps) + per(open.by, 'mgZero');
  const cyclesThin = per(run.by, 'hsRestrict0', run.steps);
  const cyclesOpen = per(open.by, 'mgRestrict0') / 2; // two projections a step on the open plate
  const rt = median(thinRes.map((x) => x.rel)), ro = median(openRes.map((x) => x.rel));
  console.log(`  the solve: thin gap ${thinStep.toFixed(0)} dispatches a step (main ${MAIN_DISPATCHES}), open plate ${open.dispatches.toFixed(0)}; mgZero ${mgZero.toFixed(0)} a step on the two; V-cycles a projection: thin ${cyclesThin}, open ${cyclesOpen}`);
  console.log(`  the residual after a step, ‖r‖/‖b‖ of the 2×2 sums: thin gap median ${rt.toExponential(3)} [${thinRes.map((x) => x.rel.toExponential(2)).join(' ')}], open plate median ${ro.toExponential(3)} [${openRes.map((x) => x.rel.toExponential(2)).join(' ')}]`);
  console.log(`  right-hand sides ‖b‖: thin ${thinRes.map((x) => x.b.toExponential(1)).join(' ')}, open ${openRes.map((x) => x.b.toExponential(1)).join(' ')}`);

  check('the residual is read from a solve that had something to solve', thinRes.every((x) => x.b > 0) && openRes.every((x) => x.b > 0) && rt < 1 && ro < 1,
    `‖b‖ > 0 on all twelve reads and both medians under 1 (a pressure of zero reads exactly 1)`);
  check('control: the same pressure at half strength reads at least four times the residual', thinAll.control >= 4 * rt && openAll.control >= 4 * ro,
    `thin ${thinAll.control.toExponential(2)}, open ${openAll.control.toExponential(2)}`);
  const bar = owed.has('h2c2') ? 1.05 : 1.5;
  check(`the thin gap's residual no worse than ${bar} times main's`, Number.isFinite(MAIN_RESIDUAL_THIN) && rt <= bar * MAIN_RESIDUAL_THIN, `${rt.toExponential(3)} against ${(bar * MAIN_RESIDUAL_THIN).toExponential(3)}`);
  check(`the open plate's residual no worse than ${bar} times main's`, Number.isFinite(MAIN_RESIDUAL_OPEN) && ro <= bar * MAIN_RESIDUAL_OPEN, `${ro.toExponential(3)} against ${(bar * MAIN_RESIDUAL_OPEN).toExponential(3)}`);

  line('h2c1', 'H2c-1: a thin-gap step at least 35% fewer dispatches than main', thinStep <= 0.65 * MAIN_DISPATCHES, `${thinStep.toFixed(0)} against at most ${Math.floor(0.65 * MAIN_DISPATCHES)}`);
  line('h2c3', 'H2c-3: no mgZero dispatch (the first sweep reads zero)', mgZero === 0, `${mgZero.toFixed(0)} a step`);
  line('h2c2', 'H2c-2: one V-cycle a projection, and a step at least 150 fewer dispatches than main', cyclesThin === 1 && cyclesOpen === 1 && thinStep <= MAIN_DISPATCHES - 150,
    `${cyclesThin} and ${cyclesOpen} cycles, ${thinStep.toFixed(0)} dispatches against at most ${MAIN_DISPATCHES - 150}`);
}
