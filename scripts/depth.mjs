#!/usr/bin/env node
/**
 * Does the plate's depth reach the flow? (bubbles-plan.md F)
 *
 *   npm run depth
 *
 * The gap between the two glasses has been a real field since the squeeze
 * film was built, and until now only the squeeze knew about it: advection,
 * diffusion and the projection were all depth-blind. So the dome measured as
 * doing nothing at every setting, and a plate with a shape to it flowed
 * exactly like a flat one.
 *
 * Two things are asked here, in this order, because the second is meaningless
 * if the first is not true:
 *
 *   1. the gap really takes the dome's shape  (readSqueeze, centre vs rim)
 *   2. and the flow is slower where the gap is thin
 *
 * The control is the drag's own strength: the same domed plate is measured
 * with `depthDrag` at zero and at full, alternating, so what is compared is
 * one plate against itself rather than two runs against each other. At zero
 * this is the old solver exactly, and the difference between the pair is the
 * whole of the change.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, installFrameReader } from './frame.mjs';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const PORT = 4343;
const CURVE = Number(process.env.DEPTH_CURVE ?? 1);
const DRAG = Number(process.env.DEPTH_DRAG ?? 3);
// What the solver is handed: `deriveStep` clamps the curve to [-1, 1], so a
// wait for `lastStep.plateCurve === 2` would wait for ever.
const STEPPED_CURVE = Math.max(-1, Math.min(1, CURVE));

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let up = true, leaving = false;
/*
  Only a surprise before we ask it to go.

  The kill at the end of a clean run lands in this handler too, and it called
  `process.exit(2)` — so whether a passing run reported success came down to
  whether the summary's own `process.exit(0)` won the race with the server's
  exit event. It usually did. This is going into CI, which is exactly where
  "usually" stops being good enough.
*/
server.on('exit', (c) => {
  up = false;
  if (leaving) return;
  console.error(`\npreview server exited (${c}) — port ${PORT} in use?`);
  process.exit(2);
});
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));
if (!up) process.exit(2);

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  /*
    The plate from the moment the page starts, a row every quarter second:
    animation frames, the show loop's heartbeat, lead-plate steps, and the
    solver's grid. The freeze this check found (see `settled` below) came
    about nine seconds in and was seen only because a setting happened to
    change then; this watches the whole opening of the show on every run,
    passing or not, so each Mac run says whether and where the plate stopped.
  */
  await page.addInitScript(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = () => { raf++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const rows = [];
    window.__depthLoad = rows;
    const sample = () => {
      const d = window.chromaglassDebug?.();
      const f = d?.fluids?.[0];
      rows.push([+((performance.now() - t0) / 1000).toFixed(2), raf, d?.crash?.beats?.() ?? -1, f?.stepIndex ?? -1, f?.gpu?.N ?? 0]);
      if (rows.length < 400) setTimeout(sample, 250);
    };
    setTimeout(sample, 250);
  });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  /*
    And then until the show is actually running.

    The timeline above found what the freeze was. On run 36243996678 the
    plate took eight steps at four seconds and then nothing, no animation
    frame and no loop heartbeat, for 8.6 s, while the page's own timers kept
    firing: the main thread was free and the frames were not coming. The
    black box logged it as a stall that "resumed after 9.0s". It happens at
    the opening of every run on a fresh Mac runner, and the grid does not
    change across it; the solver's hundred-odd pipelines are built once per
    device (`PipelineCache.for(device, 'fluid')`), so the likeliest reading
    is Metal compiling them cold on the first frames that use them. That is
    inferred, not measured.

    Whether it overlapped the curve being set was the whole difference
    between a pass and a fail here: a freeze that ends before nine seconds
    passed, one that ran past it read a flat plate. It is a fact about the
    show's first seconds on a cold machine, not about the plate's shape, and
    it is reported on its own line below on every run. So nothing is
    measured until the plate has stepped in every quarter second for two
    seconds running. A freeze after that is still a red line.
  */
  const running = await page.evaluate(async () => {
    const t0 = performance.now();
    const rows = () => window.__depthLoad ?? [];
    const steady = () => {
      const r = rows().slice(-9);
      return r.length === 9 && r.every((row, i) => i === 0 || row[3] > r[i - 1][3]);
    };
    while (!steady() && performance.now() - t0 < 45000) await new Promise((r) => setTimeout(r, 250));
    return { ok: steady(), waited: (performance.now() - t0) / 1000 };
  });
  check('the show is running before anything is measured', running.ok,
    `${running.waited.toFixed(1)} s after the first nine to see two steady seconds`);

  // A plate that is not being poured on or evolved, so what moves is the flow
  // already there and not the next drop landing.
  const set = (o) => page.evaluate((s) => Object.assign(window.chromaglassDebug().settings, s), o);

  /*
    Wait for the plate to have *stepped* with a shape, not for a clock.

    What was reported: on #151, #153 and #154 — three unrelated PRs off one
    main, one of them touching no app code — this read exactly 0.0300 at the
    centre and at the rim, six seconds after the curve was set, and every
    later line of the same run saw the dome working (the drag took the rim
    down 93%, and the press was carried up by the reshape). 0.0300 everywhere
    is the gap at a curve of zero, untouched: not a dome that failed to form,
    a plate the curve had not reached yet. On the same code #152 and main's
    deploy read 0.0581 and 0.0144.

    Eight runs of this check on the Mac, same code or near it, split with
    nothing in between: every pass read exactly 0.0581 and 0.0144 (the dome
    at rest), every failure exactly 0.0300 and 0.0300, and the failures took
    26.6 to 28.6 s from the step starting to this read where the passes took
    21.8 to 24.8. `depth` is the first thing its shard runs, on a cold
    machine. The solver applies a new shape on its next step
    (`gapReshape`, or `gapRest` on a solver the ladder has just rebuilt,
    src/gpu/fluid.ts), so the only way to read the old shape six seconds
    later is for the lead plate not to have taken that step on the solver
    being read: a stall, or a rung change that cleared the gap just before
    the read. Neither is what this check is about.

    So the read waits until the lead solver has been stepped with this curve,
    twice, on the same solver it is about to read — and fails, saying so, if
    that never happens. Six seconds stays the floor, so a fast machine reads
    the plate exactly when it always did.
  */
  const settled = (curve) => page.evaluate(async ({ curve, limit }) => {
    const d = () => window.chromaglassDebug();
    const t0 = performance.now();
    // Where the lead plate was when the setting went in (see `mark`), so the
    // six seconds before this can be told apart: no steps at all is a stall,
    // steps on another solver is a rebuild.
    const m = window.__depthMark ?? {};
    const f0 = d().fluids?.[0];
    const before = { steps: (f0?.stepIndex ?? 0) - (m.step ?? 0), sameSolver: !!f0?.gpu && f0.gpu === m.gpu };
    let solver = null, from = -1, rebuilt = 0, seen = 0;
    while (performance.now() - t0 < limit) {
      const f = d().fluids?.[0];
      const g = f?.gpu ?? null;
      if (g !== solver) { if (solver) rebuilt++; solver = g; from = -1; }
      if (g && f.lastStep?.plateCurve === curve) {
        if (from < 0) from = f.stepIndex;
        seen = f.stepIndex - from;
        if (seen >= 2) window.__depthSolver = g;
        if (seen >= 2) return { ok: true, waited: (performance.now() - t0) / 1000, steps: seen, rebuilt, N: g.N, before };
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return { ok: false, waited: limit / 1000, steps: seen, rebuilt, N: solver?.N ?? null, before };
  }, { curve, limit: 30000 });
  /*
    And a timeline of the wait, every quarter second: animation frames the
    page got, frames the show's loop got through (the black box's heartbeat),
    and steps the lead plate took. On the Mac the plate was seen to take no
    step at all for the six seconds after a setting changed, on the same
    solver; these three say where it stopped. No animation frames is the
    main thread held; frames but no heartbeat is the loop returning early;
    a heartbeat but no steps is the loop running and not stepping.
  */
  const mark = () => page.evaluate(() => {
    const d = window.chromaglassDebug();
    const f = d.fluids?.[0];
    const t0 = performance.now();
    window.__depthMark = { step: f?.stepIndex ?? 0, gpu: f?.gpu ?? null, t0 };
    let raf = 0;
    const tick = () => { raf++; if (window.__depthMark?.t0 === t0) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const line = [];
    window.__depthLine = line;
    const sample = () => {
      if (window.__depthMark?.t0 !== t0) return;
      const dd = window.chromaglassDebug();
      line.push([((performance.now() - t0) / 1000).toFixed(2), raf, dd.crash?.beats?.() ?? -1, dd.fluids?.[0]?.stepIndex ?? -1]);
      if (line.length < 60) setTimeout(sample, 250);
    };
    sample();
  });
  const timeline = () => page.evaluate(() => {
    const m = window.__depthMark ?? {};
    const since = Date.now() - (performance.now() - (m.t0 ?? 0));
    const log = (window.chromaglassDebug().crash?.thisLoad?.() ?? [])
      .filter((e) => e.t >= since - 2000)
      .map((e) => `${e.up.toFixed(1)}s ${e.level} ${e.source}: ${String(e.msg).slice(0, 140)}`);
    return { line: window.__depthLine ?? [], log };
  });
  // Said every time, stepped or not: the first run on a slow runner is the
  // one that shows whether it was a stall or a rebuild.
  const said = (s) => `${s.before.steps} step(s) in the wait${s.before.sameSolver ? '' : ', on a solver built during it'};`
    + ` ${s.ok ? '' : 'NOT '}stepped with it ${s.waited.toFixed(1)} s later,`
    + ` ${s.steps} step(s) seen, ${s.rebuilt} rebuild(s), now ${s.N}²`;

  await mark();
  await set({ automateRate: 0, plateCurve: CURVE, depthDrag: 0 });
  await page.waitForTimeout(6000);
  const shaped = await settled(STEPPED_CURVE);
  /*
    Waiting must not turn a frozen plate green. The same solver taking no
    step at all for six seconds is a freeze an audience would see, and before
    this wait it was (misnamed) the dome line going red. So it keeps a red
    line of its own. A rebuild during the six seconds is allowed: the ladder
    does that on a slow machine, and the new solver lays the dome on its
    first step.
  */
  const kept = shaped.before.steps > 0 || !shaped.before.sameSolver;
  check('the plate keeps stepping while its shape changes', kept, said(shaped));
  // DEPTH_TIMELINE=1 prints it on a run that kept stepping too.
  if (!kept || process.env.DEPTH_TIMELINE) {
    const { line, log } = await timeline();
    console.log('     seconds after the change · animation frames · loop heartbeats · lead plate steps');
    for (const [t, raf, beats, steps] of line.filter((_, i) => i % 2 === 0)) console.log(`       ${t}s  ${raf}  ${beats}  ${steps}`);
    console.log(`     the black box around it: ${log.length ? '' : 'nothing'}`);
    for (const l of log.slice(-12)) console.log(`       ${l}`);
  }
  check('the lead plate is stepped with the shape it was given', shaped.ok, said(shaped));

  // 1. The gap takes the dome's shape.
  /*
    On the solver the wait counted, and no other. A solver attached between
    the wait and this read has not stepped yet, and one that has not stepped
    reads exactly 0.0300 everywhere: both clears (its constructor's, and
    `attachGpu`'s) lay the gap with `gapRest` before `writeSim` has ever
    put a curve in the uniform, so the curve they lay is zero. That is the
    failure's own signature, so a read that lands on one is retried on the
    new solver rather than measured.
  */
  const readDome = () => page.evaluate(async () => {
    const d = window.chromaglassDebug();
    const mine = () => d.fluids?.[0]?.gpu === window.__depthSolver;
    if (!mine()) return { moved: true };
    const sq = await d.readSqueeze?.();
    if (!mine()) return { moved: true };
    if (!sq) return null;
    const { n, gap } = sq;
    let inner = 0, ki = 0, outer = 0, ko = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const r = Math.hypot(x - n / 2, y - n / 2) / (n / 2);
      if (r < 0.25) { inner += gap[x + y * n]; ki++; }
      else if (r > 0.75 && r < 0.98) { outer += gap[x + y * n]; ko++; }
    }
    return { inner: inner / ki, outer: outer / ko };
  });
  let gap = await readDome();
  for (let tries = 0; gap?.moved && tries < 3; tries++) {
    console.log('     (the solver was rebuilt between the wait and the read; waiting on the new one)');
    await settled(STEPPED_CURVE);
    gap = await readDome();
  }
  if (gap?.moved) gap = null;
  check('the gap can be read back at all', gap !== null, gap ? '' : 'no readSqueeze');

  {
    // The longest stretch from load to here in which the lead plate took no
    // step, once the plate had started stepping at all.
    const { rows, log } = await page.evaluate(() => ({
      rows: window.__depthLoad ?? [],
      log: (window.chromaglassDebug().crash?.thisLoad?.() ?? []).map((e) => [e.up, `${e.level} ${e.source}: ${String(e.msg).slice(0, 140)}`]),
    }));
    let best = null;
    for (let i = 0, from = -1; i < rows.length; i++) {
      const steps = rows[i][3];
      if (steps <= 0) continue;
      if (from < 0 || steps !== rows[from][3]) { from = i; continue; }
      const len = rows[i][0] - rows[from][0];
      if (!best || len > best.len) best = { len, a: from, b: i };
    }
    if (!best) console.log('     (from load: the plate never held still for a quarter second)');
    else {
      const [a, b] = [rows[best.a], rows[best.b]];
      console.log(`     (from load: longest stretch without a step ${best.len.toFixed(2)} s, from ${a[0]} s to ${b[0]} s;`
        + ` ${b[1] - a[1]} animation frames and ${b[2] - a[2]} loop heartbeats in it, grid ${a[4]}² → ${b[4]}²)`);
      if (best.len >= 2) {
        console.log('       seconds · animation frames · heartbeats · steps · grid');
        for (const r of rows.slice(Math.max(0, best.a - 4), best.b + 5)) console.log(`       ${r.join('  ')}`);
        for (const [up, l] of log.filter(([up]) => up >= a[0] - 3 && up <= b[0] + 3)) console.log(`       ${up.toFixed(1)}s ${l}`);
      }
    }
  }
  if (!gap) throw new Error('nothing to measure');
  /*
    Positive curve is a deep centre and a tight rim — which is what every
    description of `plateCurve` says, and the opposite of what the formula
    did until F. The sign was unobservable while depth did not reach the
    flow, so it went uncorrected through two plans.
  */
  check('and it is domed, deep in the middle and tight at the rim',
    gap.inner > gap.outer * 1.5,
    `centre ${gap.inner.toFixed(4)}, rim ${gap.outer.toFixed(4)}`);

  // 2. The flow is slower where the gap is thin.
  const speeds = () => page.evaluate(() => {
    const d = window.chromaglassDebug();
    const f = d.fluids[0], N = d.gridSize;
    const vx = f.readVx, vy = f.readVy;
    let inner = 0, ki = 0, outer = 0, ko = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = Math.hypot(x - N / 2, y - N / 2) / (N / 2);
      const s = Math.hypot(vx[x + y * N], vy[x + y * N]);
      if (r < 0.25) { inner += s; ki++; }
      else if (r > 0.75 && r < 0.98) { outer += s; ko++; }
    }
    return { inner: inner / ki, outer: outer / ko };
  });

  /*
    Alternated, because the plate drifts.

    A look left running changes on its own — the automation is off, but the
    music, the lamp and the plate's own momentum are not — so two readings
    taken minutes apart differ for reasons that have nothing to do with the
    setting under test. Taken in pairs and averaged, the drift falls out.
  */
  const off = [], on = [];
  for (let i = 0; i < 3; i++) {
    await set({ depthDrag: 0 });
    await page.waitForTimeout(4000);
    off.push(await speeds());
    await set({ depthDrag: DRAG });
    await page.waitForTimeout(4000);
    on.push(await speeds());
  }
  const mean = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
  // The ratio, not the speeds: the plate's overall liveliness drifts, and
  // what this change claims is a difference *across the plate*.
  const rOff = mean(off, 'outer') / mean(off, 'inner');
  const rOn = mean(on, 'outer') / mean(on, 'inner');
  console.log(`\n  drag off: rim/centre ${rOff.toFixed(3)}  (centre ${mean(off, 'inner').toFixed(4)}, rim ${mean(off, 'outer').toFixed(4)})`);
  console.log(`  drag on:  rim/centre ${rOn.toFixed(3)}  (centre ${mean(on, 'inner').toFixed(4)}, rim ${mean(on, 'outer').toFixed(4)})\n`);

  check('the tight rim runs slower than the deep centre once depth is coupled',
    rOn < rOff * 0.9,
    `rim/centre ${rOff.toFixed(3)} → ${rOn.toFixed(3)}, ${((1 - rOn / rOff) * 100).toFixed(0)}% down`);

  /*
    And a flat plate is the plate it was.

    This is the check that lets the drag ship on by default. The mobility is
    (h/nominal)^2 capped at one, so a gap sitting at its nominal depth is
    multiplied by exactly one however high the dial goes — which means no
    look that does not set a plate shape can notice this exists. If that ever
    stops being true, thirty-two presets change character at once.
  */
  /*
    In alternated pairs, like the rim above, and for the reason given there.

    This was one reading each way, five seconds apart, and one reading of a
    plate's centre speed wanders by itself. Over 22 runs on the Mac on
    2026-09-26 it read a median of 0.9% apart and under 5% in 20 of them,
    but 9.7% once (the reading with the drag on ran high) and 14.5% once
    (0.3074 with the drag off, where every other run read that one at
    0.252–0.268, and the same run's rim check read 0.2571). The drag was
    not what moved: the side that jumped changed from run to run. So the
    claim is judged on three pairs averaged, as the rim's is, and the limit
    is the same 12%.
  */
  await set({ plateCurve: 0, depthDrag: 0 });
  await page.waitForTimeout(5000);
  const flatOffs = [], flatOns = [];
  for (let i = 0; i < 3; i++) {
    await set({ depthDrag: 0 });
    await page.waitForTimeout(4000);
    flatOffs.push(await speeds());
    await set({ depthDrag: DRAG });
    await page.waitForTimeout(4000);
    flatOns.push(await speeds());
  }
  const flatOff = mean(flatOffs, 'inner'), flatOn = mean(flatOns, 'inner');
  const drift = Math.abs(flatOn / flatOff - 1);
  check('a flat plate does not notice the drag at all',
    drift < 0.12,
    `centre ${flatOff.toFixed(4)} → ${flatOn.toFixed(4)} over three pairs, ${(drift * 100).toFixed(1)}% apart`
    + ` (each pair ${flatOffs.map((o, i) => `${o.inner.toFixed(3)}/${flatOns[i].inner.toFixed(3)}`).join(', ')})`);

  /*
    And a change of shape does not wipe a press.

    The plate shape is a per-plate patch target, so a sound or camera mapping
    can drive it every frame. Re-laying the gap at the new rest — which is
    what the first version of this did — would erase a live press sixty times
    a second for as long as the modulation ran, and zero the squeeze rate with
    it. So the shape change is a *shift*: every cell moves by the difference
    between the old rest and the new one, and whatever a press pushed it away
    from rest stays pushed.
  */
  await set({ plateCurve: 0, depthDrag: 0 });
  await page.waitForTimeout(4000);
  const gapAt = () => page.evaluate(async () => {
    const sq = await window.chromaglassDebug().readSqueeze?.();
    if (!sq) return null;
    const { n, gap } = sq;
    let t = 0, k = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (Math.hypot(x - n / 2, y - n / 2) / (n / 2) < 0.12) { t += gap[x + y * n]; k++; }
    }
    return t / k;
  });
  const flat = await gapAt();
  // Held down, so the gap is still dented when the shape changes under it.
  for (let k = 0; k < 10; k++) {
    await page.evaluate(() => {
      const d = window.chromaglassDebug(), f = d.fluids[0], N = d.gridSize;
      f.applySquish(N / 2, N / 2, 30, 0.004, 0, true);
    });
    await page.waitForTimeout(60);
  }
  const pressed = await gapAt();
  await mark();
  await set({ plateCurve: 1 });
  await page.waitForTimeout(250);
  /*
    And the same wait here, for the opposite reason: a plate that has not
    stepped since the change still holds the dent exactly as it was pressed,
    which read as "carried". The wait makes sure a step ran; the lower bound
    on the lift below makes sure the shift did.
  */
  const reshaped = await settled(1);
  const same = await page.evaluate(() => window.chromaglassDebug().fluids?.[0]?.gpu === window.__depthSolver);
  const after = await gapAt();
  // Curve 1 lifts the centre's rest from 0.03 to 0.06, so a reset would read
  // 0.06 exactly and a shift reads the dent carried up with it. Both bounds:
  // under 0.06 says it was not reset, and lifted by most of the 0.03 the rest
  // moved says the shift ran at all. With only the first, a plate that never
  // reshaped read the dent where it was pressed and passed.
  const dent = flat - pressed;
  check('a press survives the glasses changing shape',
    reshaped.ok && same && dent > 0.0005 && after < 0.06 - dent * 0.5 && after - pressed > 0.02,
    `dented ${dent.toFixed(4)} below rest, and after the change ${after.toFixed(4)} against a rest of 0.0600,`
    + ` lifted ${(after - pressed).toFixed(4)} by it; ${said(reshaped)}${same ? '' : '; the solver was rebuilt under the press'}`);

  await set({ plateCurve: CURVE });
  check('and switching it off puts the plate back',
    Math.abs(off[0].outer / off[0].inner - off[off.length - 1].outer / off[off.length - 1].inner) < rOff * 0.5,
    `first ${(off[0].outer / off[0].inner).toFixed(3)}, last ${(off[off.length - 1].outer / off[off.length - 1].inner).toFixed(3)}`);
} finally { await browser.close(); stop(); }

const bad = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
