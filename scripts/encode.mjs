#!/usr/bin/env node
/**
 * What a solver step costs the main thread to *ask for*, as opposed to what
 * it costs the GPU to do (PLAN.md Wave 4.1, docs/webgpu-plan.md H2c-4).
 *
 *   npm run encode      (the lab: any adapter that computes, PW_WEBGPU=1 off a Mac)
 *
 * The owner reported the show "a little jittery sometimes". One of the ways a
 * WebGPU show stutters with the GPU idle is the page's own garbage: a step is
 * about five hundred dispatches a layer, and each dispatch was asking for
 * fresh memory it threw away at once. `kernel(name, format)` ran `replaceAll`
 * over a 4 to 10 KB shader source to make the key its pipeline is cached by
 * (a new string every time, hashed again by the cache's map), `arg()` made a
 * `Float32Array(8)` and a slice and called `writeBuffer` whether or not the
 * numbers had changed, and every bind group was looked up by a key string
 * built from the labels of everything it binds. Sixty steps a second and two
 * layers make that megabytes a second of short-lived strings. V8 collects
 * those in a scavenge, which is quick but stops the page, and a scavenge that
 * lands late in a frame is the frame that misses its refresh: a hitch now and
 * then, with nothing on the plate to say why.
 *
 * So this steps the real solver in the lab on a thin-gap plate (every look
 * opens on one) at the laptop's grid, and reads, per step:
 *
 *  - the bytes the page allocated, from Chromium's own sampling heap
 *    profiler (CDP `HeapProfiler.startSampling`, objects collected by minor
 *    and major collections included, so short-lived garbage counts);
 *  - the `writeBuffer` calls, counted by wrapping the queue;
 *  - the dispatches, counted the same way, so the two above can be read per
 *    dispatch and a change that halves the work cannot pass as a change that
 *    halves the waste;
 *  - the main thread's time inside `step()`: printed, not leaned on, since a
 *    cloud box shares its cores with SwiftShader doing the step itself.
 *
 * The bars are the feature, "a dispatch asks for nothing it throws away
 * that it could have kept", with room for what a dispatch is still written
 * with (the array literal of the textures it reads, about 100 bytes), not a
 * moment of one run. Measured on 2026-10-24 before and after, at 512²:
 * 506 KB a step (1,939 B a dispatch) and 249 writes for 267 dispatches,
 * then 31 KB (120 B) and 2, none of them a repeat.
 *   - a step allocates under 64 KB (a copy of one kernel's source a dispatch
 *     is 500 KB, the key strings alone were 100 KB);
 *   - a dispatch allocates under 192 bytes;
 *   - no args buffer is written with the bytes it already holds (it was one
 *     write a dispatch, nearly all of them the same numbers again), each
 *     write compared with the last one to that buffer;
 *   - no bind group is made on a step once the solver has seen it (the
 *     heap sampler cannot see one: Blink keeps GPU objects off V8's heap, so
 *     `createBindGroup` is counted instead);
 * and two controls that say the measure can see what it is looking for:
 *   - a step with a freshly allocated 64 KB array per dispatch (a plain array:
 *     a typed array this large keeps its bytes outside the heap the profiler
 *     samples, which is also why the readback rings do not count), wrapped in the
 *     same counting, reads at least 50 KB more a dispatch;
 *   - a writeBuffer made by hand inside the window is counted.
 */
import { openLab } from './lab.mjs';

const N = Number(process.env.ENCODE_GRID ?? 512);
const STEPS = Number(process.env.ENCODE_STEPS ?? 30);

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  await page.evaluate(async (n) => {
    await lab.create(n);
    lab.dye(0.5, 0.5, 0.2, [1, 0.6, 0.3], 3);
    lab.flush();
    // Warm: the thin gap's pipelines, the bind groups and the args buffers are
    // made on a solver's first steps and kept; what is asked for is a step
    // after those, the one a show runs for hours.
    await lab.step(12, { thinGap: 1, immiscibility: 0.5 });
    const s = lab.solver();
    const q = s.device.queue;
    const counts = { writes: 0, dispatches: 0, groups: 0, same: 0, on: false };
    const write = q.writeBuffer.bind(q);
    // What each args buffer was last written with, to count a write of what it already holds.
    const held = new Map();
    q.writeBuffer = (buffer, offset, data, ...rest) => {
      if (counts.on) {
        counts.writes++;
        if (buffer.label?.startsWith('args ') && offset === 0 && ArrayBuffer.isView(data)) {
          const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          const was = held.get(buffer);
          if (was && was.length === bytes.length && was.every((b, i) => b === bytes[i])) counts.same++;
          held.set(buffer, bytes.slice());
        }
      }
      return write(buffer, offset, data, ...rest);
    };
    const make = s.device.createBindGroup.bind(s.device);
    s.device.createBindGroup = (...a) => { if (counts.on) counts.groups++; return make(...a); };
    const dispatch = GPUComputePassEncoder.prototype.dispatchWorkgroups;
    GPUComputePassEncoder.prototype.dispatchWorkgroups = function (...a) { if (counts.on) counts.dispatches++; return dispatch.apply(this, a); };
    window.__encode = { counts };
  }, N);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const sampled = async (fn, arg) => {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 512, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    const r = await page.evaluate(fn, arg);
    const { profile } = await cdp.send('HeapProfiler.stopSampling');
    const by = new Map();
    let bytes = 0;
    const walk = (node) => {
      bytes += node.selfSize;
      if (node.selfSize) {
        const f = node.callFrame;
        const k = process.env.ENCODE_LINES ? `${f.functionName || "(anonymous)"}@${f.lineNumber}` : `${f.functionName || "(anonymous)"}`;
        by.set(k, (by.get(k) ?? 0) + node.selfSize);
      }
      for (const c of node.children) walk(c);
    };
    walk(profile.head);
    return { ...r, bytes, top: [...by].sort((a, b) => b[1] - a[1]).slice(0, process.env.ENCODE_LINES ? 14 : 6) };
  };

  // The show's step, as many times as asked, with the counters on.
  const run = await sampled(async ({ steps, waste }) => {
    const { counts } = window.__encode;
    const s = lab.solver();
    const sink = [];
    const dispatch = GPUComputePassEncoder.prototype.dispatchWorkgroups;
    if (waste) GPUComputePassEncoder.prototype.dispatchWorkgroups = function (...a) { sink.push(new Array(8192).fill(sink.length + 0.5)); if (sink.length > 4) sink.shift(); return dispatch.apply(this, a); };
    const ms = [];
    const step = s.step.bind(s);
    s.step = (...a) => { const t = performance.now(); const r = step(...a); ms.push(performance.now() - t); return r; };
    counts.writes = 0; counts.dispatches = 0; counts.groups = 0; counts.same = 0; counts.on = true;
    await lab.step(steps, { thinGap: 1, immiscibility: 0.5 });
    counts.on = false;
    s.step = step;
    GPUComputePassEncoder.prototype.dispatchWorkgroups = dispatch;
    ms.sort((a, b) => a - b);
    return { writes: counts.writes, same: counts.same, groups: counts.groups, dispatches: counts.dispatches, msMedian: ms[ms.length >> 1], msMax: ms[ms.length - 1], steps: ms.length };
  }, { steps: STEPS, waste: false });
  const control = await sampled(async ({ steps, waste }) => {
    const { counts } = window.__encode;
    const s = lab.solver();
    const sink = [];
    const dispatch = GPUComputePassEncoder.prototype.dispatchWorkgroups;
    if (waste) GPUComputePassEncoder.prototype.dispatchWorkgroups = function (...a) { sink.push(new Array(8192).fill(sink.length + 0.5)); if (sink.length > 4) sink.shift(); return dispatch.apply(this, a); };
    counts.writes = 0; counts.dispatches = 0; counts.on = true;
    s.device.queue.writeBuffer(s.sim, 0, new Float32Array(4));
    const hand = counts.writes;
    await lab.step(steps, { thinGap: 1, immiscibility: 0.5 });
    counts.on = false;
    GPUComputePassEncoder.prototype.dispatchWorkgroups = dispatch;
    return { hand, writes: counts.writes, dispatches: counts.dispatches, steps };
  }, { steps: 10, waste: true });

  const perStep = (v, r = run) => v / r.steps;
  const perDispatch = (v, r = run) => v / Math.max(1, r.dispatches);
  console.log(`  ${N}², thin gap, ${run.steps} steps: ${perStep(run.dispatches).toFixed(0)} dispatches a step`);
  console.log(`  allocated ${(perStep(run.bytes) / 1024).toFixed(1)} KB a step (${perDispatch(run.bytes).toFixed(0)} B a dispatch); ${perStep(run.writes).toFixed(0)} writeBuffer a step`);
  console.log(`  main thread in step(): median ${run.msMedian.toFixed(2)} ms, longest ${run.msMax.toFixed(2)} ms (printed only)`);
  console.log(`  the most allocated by: ${run.top.map(([f, b]) => `${f} ${(perStep(b) / 1024).toFixed(1)} KB`).join(', ')}`);

  check('the window counted the steps it asked for', run.steps === STEPS && run.dispatches > 50 * STEPS, `${run.steps} steps, ${run.dispatches} dispatches`);
  check('control: 64 KB a dispatch made on purpose is seen', perDispatch(control.bytes, control) - perDispatch(run.bytes) > 50 * 1024,
    `${(perDispatch(control.bytes, control) / 1024).toFixed(1)} KB a dispatch with it`);
  check('control: a write made by hand is counted', control.hand === 1, `${control.hand} counted for one`);
  check('a step allocates under 64 KB', perStep(run.bytes) < 64 * 1024, `${(perStep(run.bytes) / 1024).toFixed(1)} KB`);
  check('a dispatch allocates under 192 bytes', perDispatch(run.bytes) < 192, `${perDispatch(run.bytes).toFixed(0)} B`);
  check('no args buffer is written with what it already holds', run.same === 0, `${run.same} of ${run.writes} writes (${perStep(run.writes).toFixed(1)} a step)`);
  check('no bind group is made on a step after the first ones', run.groups === 0, `${run.groups} made in ${run.steps} steps`);
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
