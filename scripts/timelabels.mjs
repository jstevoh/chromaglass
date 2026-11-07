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
 * lands each mapping two frames after its copy (read on the frame after:
 * three frames behind), which is how far the ring runs behind on a busy GPU. Each pass takes a constant time of its
 * own (the plate 2 ms, the camera 5, the finish 1), so a reading on the
 * wrong label is a wrong number: the smoothed time of a label that only ever
 * took one time is that time exactly, and any other number is a reading
 * that was not its own. The camera is turned on at frame 100 and off again
 * at frame 110.
 *
 * The control holds on main and after: on the frames before the change, the
 * ring two frames behind, every label reads its own time to the digit and the
 * camera is not there (the stand-in's lag is real, and the readings are what
 * the passes took). The owed line asks, on the five frames from each change:
 * no label reported from a frame that did not run it (the camera absent
 * until a frame with the camera has landed, and kept, decaying, until one
 * without it has), every label still its own time, and `gpuFrameMs` on the
 * frame of the change within 10 % of the frame before (the frame cost it
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
const LAG = 2;
const ON = 100, OFF = 110, FRAMES = 120;

// ── The stand-in GPU ─────────────────────────────────────────────────
let frame = 0;
const maps = [];
const device = {
  createQuerySet: ({ count }) => ({ values: new BigInt64Array(count) }),
  createBuffer: ({ size }) => {
    const buf = {
      size, data: new ArrayBuffer(size), copiedAt: -1,
      mapAsync: () => new Promise((res) => maps.push({ due: buf.copiedAt + LAG, res })),
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
  copyBufferToBuffer: (src, srcOffset, dst, dstOffset, size) => {
    new Uint8Array(dst.data, dstOffset, size).set(new Uint8Array(src.data, srcOffset, size));
    dst.copiedAt = frame;
  },
};

const prof = new GpuProfiler(device, disposer, true);
const query = prof['query'];

// ── The frames ───────────────────────────────────────────────────────
const passesOf = (f) => (f >= ON && f < OFF ? ['plate', 'camera', 'finish'] : ['plate', 'finish']);
let landed = -1;
const seen = [];
for (frame = 0; frame < FRAMES; frame++) {
  let t = BigInt(frame) * 1_000_000_000n;
  for (const label of passesOf(frame)) {
    const w = prof.renderPass(label);
    if (!w) continue;
    query.values[w.beginningOfPassWriteIndex] = t;
    t += BigInt(Math.round(MS[label] * 1e6));
    query.values[w.endOfPassWriteIndex] = t;
  }
  prof.resolveInto(encoder);
  prof.afterSubmit();
  seen.push({ frame, landed, ms: Object.fromEntries(prof.ms), sum: [...prof.ms.values()].reduce((a, v) => a + v, 0) });
  // The end of the frame: the mappings that are due land, and their callbacks run.
  for (const m of maps.splice(0)) {
    if (m.due <= frame) { m.res(); landed = Math.max(landed, m.due - LAG); } else maps.push(m);
  }
  await new Promise((res) => setImmediate(res));
}

// ── What they read ───────────────────────────────────────────────────
const wrong = (s) => Object.entries(s.ms).filter(([label, v]) => label !== 'camera' && Math.abs(v - MS[label]) > 1e-9);
const before = seen.filter((s) => s.frame >= 20 && s.frame < ON);
const beforeOk = before.every((s) => wrong(s).length === 0 && !('camera' in s.ms) && s.landed >= 0 && s.landed <= s.frame - LAG);
const show = (s) => `frame ${s.frame} (data of ${s.landed}): ${Object.entries(s.ms).map(([l, v]) => `${l} ${v.toFixed(3)}`).join(', ')}; gpuFrameMs ${s.sum.toFixed(3)}`;
for (const f of [ON - 1, ON, ON + 2, OFF - 1, OFF, OFF + 2]) console.log(`  ${show(seen[f])}`);

check(`control: with the passes unchanged and the ring ${ON - seen[ON].landed} frames behind, every label reads its own time`, beforeOk,
  `${before.filter((s) => wrong(s).length).length} of ${before.length} frames with a label off its own time`);

const faults = [];
for (const s of seen.filter((x) => (x.frame >= ON && x.frame < ON + 5) || (x.frame >= OFF && x.frame < OFF + 5))) {
  for (const [label, v] of wrong(s)) faults.push(`frame ${s.frame} ${label} ${v.toFixed(3)} (took ${MS[label]})`);
  const cam = s.ms.camera;
  // The camera's: absent until a frame that ran it has landed; from then its own 5 ms, decaying once the frames without it land.
  if (s.landed < ON && cam !== undefined) faults.push(`frame ${s.frame} camera ${cam.toFixed(3)} from frame ${s.landed}, which had no camera`);
  if (s.landed >= ON && s.landed < OFF && cam !== undefined && Math.abs(cam - MS.camera) > 1e-9) faults.push(`frame ${s.frame} camera ${cam.toFixed(3)} (took ${MS.camera})`);
  if (s.landed >= OFF && cam !== undefined && cam > MS.camera + 1e-9) faults.push(`frame ${s.frame} camera ${cam.toFixed(3)} rising after it stopped`);
}
const skew = (f) => Math.abs(seen[f].sum - seen[f - 1].sum) / seen[f - 1].sum;
const skews = [skew(ON), skew(OFF)];
const camEarly = seen[ON].ms.camera !== undefined;
line('labels', 'H2c-labels: when the passes change, each time lands on the label of the pass that took it, and gpuFrameMs does not jump on the change',
  faults.length === 0 && skews.every((x) => x <= 0.1),
  `${faults.length} readings off their pass${faults.length ? ` (${faults.slice(0, 3).join('; ')})` : ''}; gpuFrameMs moved ${skews.map((x) => `${(x * 100).toFixed(1)} %`).join(' and ')} on the changes (at most 10 %)`,
  camEarly && faults.length > 0);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
