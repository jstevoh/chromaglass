#!/usr/bin/env node
/**
 * The GPU timings land on the passes that took them (PLAN H2c-labels,
 * docs/plan/40-specs-frame-gig-desk.md).
 *
 *   npm run timelabels -- --owed=labels
 *
 * Read in the code on 2026-11-07: `GpuProfiler` (src/gpu/kit.ts) hands out a
 * timestamp slot to each pass as the frame encodes (`pass`, `renderPass`),
 * resolves them into a `ReadbackRing` slot at the end of the frame, and
 * after the submit reads the ring's newest landed data against
 * `lastLabels`, which `afterSubmit` has just set to the labels of the frame
 * it issued. The data is a copy one to three frames old. While the frame's
 * passes stay the same nobody can tell; the frame the list changes (the
 * camera turned on, a particle splat, the finish, the output, a projector's
 * source) every label after the change reads its neighbour's time for as
 * long as the ring is behind, and `gpuFrameMs`, the sum of them all
 * (LiquidVisualizer), is skewed on the frames the governor most needs it.
 *
 * A node harness over the real class, on a stand-in GPU: no adapter needed,
 * and the thing asked about is bookkeeping, not a GPU's numbers. The
 * stand-in keeps a timestamp query set, resolves and copies buffers when
 * they are encoded, as the GPU will before any mapping of them lands, and
 * lands each mapping some frames after its copy. Five runs: the mappings
 * landing 0, 1, 2 and 3 frames after their copies (read on the frame after),
 * and one where the GPU falls behind around the change and the ring fills,
 * so a build that only waits a fixed number of frames after a change is
 * caught by one of them (the check-skeptic's pass found the first version,
 * with one lag, passing such a build). Each pass takes a constant time of
 * its own (the plate 2 ms, the camera 5, the finish 1), so a reading on the
 * wrong label is a wrong number: the smoothed time of a label that only ever
 * took one time is that time exactly, and any other number is a reading
 * that was not its own. The camera is turned on at frame 100 and off again
 * at frame 110. Timestamps are written into the query set each pass is
 * handed (`timestampWrites.querySet`), so a build that keeps a set per slot
 * is measured the same way.
 *
 * The control holds on main and after: on the frames before the change, in
 * every run, every label reads its own time to the digit and the camera is
 * not there (the stand-in's lag is real, and the readings are what the passes
 * took). The owed line asks, in every run, on the eight frames from each
 * change: no label reported from a frame that did not run it (the camera
 * absent until a frame with the camera has landed, and kept, decaying, until
 * one without it has), every label still its own time, and `gpuFrameMs` on
 * the frame of the change within 10 % of the frame before (the frame cost it
 * reports moves when the frame that had the camera lands, not when the
 * camera is asked for). The flash probe's pixel count has the same fault
 * and is 14r's, in the quarter-wall brief, not this line's.
 */
// WebGPU's flag tables, which kit.ts reads as it loads: set before it is imported, so imported after.
globalThis.GPUBufferUsage ??= { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
globalThis.GPUTextureUsage ??= { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
globalThis.GPUMapMode ??= { READ: 1, WRITE: 2 };
globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const { GpuProfiler } = await import('../src/gpu/kit');

const OWED = ['labels'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
};
const unknown = [...owed].filter((id) => !OWED.includes(id));
if (unknown.length) check('every id in --owed is a line of timelabels', false, `unknown: ${unknown.join(', ')} (known: ${OWED.join(', ')})`);

const MS = { plate: 2, camera: 5, finish: 1 };
const ON = 100, OFF = 110, FRAMES = 120, WINDOW = 8;

/**
 * One run of the frames on a fresh profiler and stand-in GPU: each mapping
 * lands `lag` frames after its copy (read on the frame after), and with
 * `stall` the mappings of the frame before the camera comes on and the
 * three after it all land six frames after the change, so the ring fills,
 * frames go untimed and the newest data is older than any fixed wait, as on
 * a GPU that has fallen behind. A build that only waits a fixed number of frames
 * after a change is caught by one of the lags.
 */
async function run(lag, stall) {
  let frame = 0;
  const maps = [];
  const device = {
    createQuerySet: ({ count }) => ({ values: new BigInt64Array(count) }),
    createBuffer: ({ size }) => {
      const buf = {
        size, data: new ArrayBuffer(size), copiedAt: -1,
        mapAsync: () => new Promise((res) => {
          const from = buf.copiedAt;
          maps.push({ from, due: stall && from >= ON - 1 && from <= ON + 2 ? Math.max(from + lag, ON + 6) : from + lag, res });
        }),
        getMappedRange: () => buf.data,
        unmap: () => {},
        destroy: () => {},
      };
      return buf;
    },
  };
  const disposer = { track: (x) => x };
  const encoder = {
    resolveQuerySet: (q, first, count, dst, offset) => {
      new BigInt64Array(dst.data, offset, count).set(q.values.subarray(first, first + count));
    },
    // Both of WebGPU's forms: (src, srcOffset, dst, dstOffset, size) and (src, dst, size?).
    copyBufferToBuffer: (...a) => {
      const [src, srcOffset, dst, dstOffset, size] = typeof a[1] === 'number' ? a : [a[0], 0, a[1], 0, a[2] ?? a[0].size];
      new Uint8Array(dst.data, dstOffset, size).set(new Uint8Array(src.data, srcOffset, size));
      dst.copiedAt = frame;
    },
  };
  const prof = new GpuProfiler(device, disposer, true);
  const passesOf = (f) => (f >= ON && f < OFF ? ['plate', 'camera', 'finish'] : ['plate', 'finish']);
  let landed = -1;
  const seen = [];
  for (frame = 0; frame < FRAMES; frame++) {
    let t = BigInt(frame) * 1_000_000_000n;
    for (const label of passesOf(frame)) {
      // Into the query set the pass was handed, whichever the profiler keeps it in.
      const w = prof.renderPass(label);
      if (!w) continue;
      w.querySet.values[w.beginningOfPassWriteIndex] = t;
      t += BigInt(Math.round(MS[label] * 1e6));
      w.querySet.values[w.endOfPassWriteIndex] = t;
    }
    prof.resolveInto(encoder);
    prof.afterSubmit();
    seen.push({ frame, landed, ms: Object.fromEntries(prof.ms), sum: [...prof.ms.values()].reduce((x, v) => x + v, 0) });
    // The end of the frame: the mappings that are due land, and their callbacks run.
    for (const m of maps.splice(0)) {
      if (m.due <= frame) { m.res(); landed = Math.max(landed, m.from); } else maps.push(m);
    }
    await new Promise((res) => setImmediate(res));
  }
  return seen;
}

// ── What they read ───────────────────────────────────────────────────
const wrong = (s) => Object.entries(s.ms).filter(([label, v]) => label !== 'camera' && Math.abs(v - MS[label]) > 1e-9);
const show = (s) => `frame ${s.frame} (data of ${s.landed}): ${Object.entries(s.ms).map(([l, v]) => `${l} ${v.toFixed(3)}`).join(', ')}; gpuFrameMs ${s.sum.toFixed(3)}`;
const RUNS = [[0, false], [1, false], [2, false], [3, false], [2, true]];
let controlBad = 0, controlFrames = 0;
const faults = [];
const skews = [];
let camEarly = false;
for (const [lag, stall] of RUNS) {
  const seen = await run(lag, stall);
  const name = `lag ${lag}${stall ? ', a landing stalled' : ''}`;
  if (lag === 2 && !stall) for (const f of [ON - 1, ON, ON + 3, OFF - 1, OFF, OFF + 3]) console.log(`  ${show(seen[f])}`);
  const before = seen.filter((s) => s.frame >= 20 && s.frame < ON);
  controlFrames += before.length;
  controlBad += before.filter((s) => wrong(s).length || 'camera' in s.ms || s.landed < 0 || s.landed > s.frame - 1).length;
  let n = 0;
  for (const s of seen.filter((x) => (x.frame >= ON && x.frame < ON + WINDOW) || (x.frame >= OFF && x.frame < OFF + WINDOW))) {
    const at = [];
    for (const [label, v] of wrong(s)) at.push(`${label} ${v.toFixed(3)} (took ${MS[label]})`);
    const cam = s.ms.camera;
    // The camera's: absent until a frame that ran it has landed; from then its own 5 ms, decaying once the frames without it land.
    if (s.landed < ON && cam !== undefined) at.push(`camera ${cam.toFixed(3)} from frame ${s.landed}, which had no camera`);
    if (s.landed >= ON && s.landed < OFF && cam !== undefined && Math.abs(cam - MS.camera) > 1e-9) at.push(`camera ${cam.toFixed(3)} (took ${MS.camera})`);
    if (s.landed >= OFF && cam !== undefined && cam > MS.camera + 1e-9) at.push(`camera ${cam.toFixed(3)} rising after it stopped`);
    for (const x of at) { n++; if (faults.length < 3) faults.push(`${name}, frame ${s.frame} ${x}`); }
  }
  const skew = (f) => Math.abs(seen[f].sum - seen[f - 1].sum) / seen[f - 1].sum;
  skews.push(skew(ON), skew(OFF));
  if (seen[ON].ms.camera !== undefined) camEarly = true;
  console.log(`  ${name}: ${n} readings off their pass in the ${WINDOW} frames from each change; gpuFrameMs moved ${(skew(ON) * 100).toFixed(1)} % and ${(skew(OFF) * 100).toFixed(1)} %`);
  faults.count = (faults.count ?? 0) + n;
}

check(`control: with the passes unchanged, every label reads its own time (${RUNS.length} runs, the ring 1 to 4 frames behind, one stalled)`, controlBad === 0,
  `${controlBad} of ${controlFrames} frames with a label off its own time`);
const worst = Math.max(...skews);
line('labels', 'H2c-labels: when the passes change, each time lands on the label of the pass that took it, and gpuFrameMs does not jump on the change, however far behind the ring is',
  !faults.count && worst <= 0.1,
  `${faults.count ?? 0} readings off their pass${faults.length ? ` (${faults.join('; ')})` : ''}; gpuFrameMs moved at most ${(worst * 100).toFixed(1)} % on a change (at most 10 %)`,
  camEarly && faults.count > 0);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
