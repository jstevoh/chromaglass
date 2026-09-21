/**
 * The kit, checked on the GPU it will run on: a compute pipeline from the
 * cache, a ping-pong pair stepped twice, the result read back through the
 * ring, and the profiler's timings (docs/webgpu-plan.md, P1). For the
 * harness, under ?debug; it allocates and frees its own resources.
 */

import { Disposer, GpuProfiler, PingPong, PipelineCache, ReadbackRing, bindGroup } from './kit';

const STEP = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<r32float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = textureDimensions(src);
  if (id.x >= n.x || id.y >= n.y) { return; }
  // x + 2y on the first step, then +1 each step after.
  let v = textureLoad(src, vec2i(id.xy), 0).r;
  textureStore(dst, vec2i(id.xy), vec4f(select(v + 1.0, f32(id.x) + 2.0 * f32(id.y), v < 0.0), 0.0, 0.0, 1.0));
}`;

export async function kitSelfTest(device: GPUDevice, timestamps: boolean): Promise<{ ok: boolean; detail: string }> {
  const disposer = new Disposer();
  try {
    const N = 16;
    const cache = new PipelineCache(device);
    const pipe = cache.computePipeline('selftest', STEP);
    const again = cache.computePipeline('selftest', STEP);
    const field = new PingPong(device, disposer, [N, N], 'r32float', 'selftest');
    // Start at -1 everywhere, so the first step writes x + 2y.
    device.queue.writeTexture({ texture: field.read }, new Float32Array(N * N).fill(-1), { bytesPerRow: N * 4 }, [N, N]);
    const groups = [0, 1].map(() => bindGroup(device, pipe, [field.read, field.write]));
    groups[1] = bindGroup(device, pipe, [field.write, field.read]);
    const profiler = new GpuProfiler(device, disposer, timestamps);
    // Rows padded to 256 bytes: copyTextureToBuffer's rule.
    const ROW = 256;
    const staging = disposer.track(device.createBuffer({ size: ROW * N, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }));
    const ring = new ReadbackRing(device, disposer, ROW * N, 2, 'selftest');

    const encoder = device.createCommandEncoder();
    for (let i = 0; i < 3; i++) {
      const pass = encoder.beginComputePass({ timestampWrites: profiler.pass(`step ${i}`) });
      pass.setPipeline(pipe);
      pass.setBindGroup(0, groups[field.parity]);
      pass.dispatchWorkgroups(N / 8, N / 8);
      pass.end();
      field.swap();
    }
    encoder.copyTextureToBuffer({ texture: field.read }, { buffer: staging, bytesPerRow: ROW }, [N, N]);
    const slot = ring.copyFrom(encoder, staging);
    profiler.resolveInto(encoder);
    device.queue.submit([encoder.finish()]);
    if (slot) ring.collect(slot);
    profiler.afterSubmit();
    await device.queue.onSubmittedWorkDone();
    for (let i = 0; i < 50 && !ring.latest; i++) await new Promise((r) => setTimeout(r, 10));
    // A second frame of nothing, so the profiler folds in the first one's times.
    const e2 = device.createCommandEncoder();
    profiler.resolveInto(e2);
    device.queue.submit([e2.finish()]);
    profiler.afterSubmit();
    for (let i = 0; i < 50 && timestamps && profiler.ms.size === 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
      profiler.afterSubmit();
    }

    const bad: string[] = [];
    if (pipe !== again) bad.push('the cache built the pipeline twice');
    const got = ring.latest ? new Float32Array(ring.latest) : null;
    if (!got) bad.push('nothing came back through the ring');
    else {
      // Three steps: x + 2y, then +1, then +1.
      for (const [x, y] of [[0, 0], [5, 3], [15, 15]]) {
        const want = x + 2 * y + 2, v = got[y * (ROW / 4) + x];
        if (v !== want) bad.push(`(${x},${y}) read ${v}, want ${want}`);
      }
    }
    if (timestamps && profiler.ms.size === 0) bad.push('timestamps granted but no pass time came back');
    const times = [...profiler.ms].map(([k, v]) => `${k} ${v.toFixed(3)} ms`).join(', ');
    return { ok: bad.length === 0, detail: bad.join('; ') || `3 steps read back right${times ? `; ${times}` : ''}` };
  } finally {
    disposer.dispose();
  }
}

/**
 * Does twelve red-black sweeps really solve the pressure as well as
 * twenty-four Jacobi passes? (H2, docs/roadmap.md.)
 *
 * The claim behind halving the projection is a textbook one — Gauss-Seidel
 * converges about twice as fast as Jacobi for the same arithmetic — and a
 * textbook claim about someone else's problem is not a measurement of this
 * one. This is the measurement: one synthetic divergence field, both
 * solvers run on it, and the residual of each reported.
 *
 * The residual is the thing that matters, not the pressure. What the
 * projection is for is making the velocity divergence-free, and it does that
 * to the extent that `∇²p − div` is small. Two solvers that reach the same
 * residual do the same job however differently they got there.
 *
 * The field is a single off-centre blob, which is the shape the solver
 * actually sees — a pour, a splat, a bubble — rather than noise, which is
 * the easiest possible case for any smoother and would flatter both.
 */
export async function pressureSelfTest(device: GPUDevice): Promise<{
  ok: boolean;
  jacobi: number;
  redBlack: number;
  packedMatches: boolean;
  detail: string;
  packedDetail: string;
}> {
  const disposer = new Disposer();
  try {
    const N = 64;
    const cells = N * N;
    const div = new Float32Array(cells);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = (x - N * 0.38) / (N * 0.12);
        const dy = (y - N * 0.61) / (N * 0.12);
        div[y * N + x] = Math.exp(-(dx * dx + dy * dy));
      }
    }
    /*
      Zero mean, or there is nothing here to measure.

      A Poisson problem with Neumann walls everywhere has no solution unless
      its source integrates to zero — the discrete Laplacian sums to zero over
      the domain, so whatever the source sums to is a residual no number of
      iterations can remove. Written without this, the test reported exactly
      4.5239e-2 for every solver at every iteration count, and 4.5239e-2 is
      the mean of the blob. Both solvers were working; the problem was not a
      problem.

      A real divergence field is zero-mean for the same reason in reverse:
      nothing flows through the walls, so what the velocity carries in it
      carries back out.
    */
    let mean = 0;
    for (const v of div) mean += v;
    mean /= cells;
    for (let i = 0; i < cells; i++) div[i] -= mean;

    const cache = new PipelineCache(device);
    const buf = (label: string, usage: number) => disposer.track(device.createBuffer({ label, size: cells * 4, usage }));
    const divBuf = buf('selftest div', GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const a = buf('selftest p a', GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
    const b = buf('selftest p b', GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
    const out = disposer.track(device.createBuffer({ label: 'selftest read', size: cells * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
    device.queue.writeBuffer(divBuf, 0, div);

    /*
      Both solvers, in one shader, on buffers.

      Not the app's own kernels: those read the divergence from a texture and
      take their grid from the Sim uniform, and standing that up here would
      be more scaffolding than solver. What is being compared is the
      arithmetic — a Jacobi pass against a red-black sweep, both with the
      same Neumann wall — and that is what this is.
    */
    const SRC = /* wgsl */ `
const N: i32 = ${N};
@group(0) @binding(0) var<storage, read> dv: array<f32>;
@group(0) @binding(1) var<storage, read_write> p: array<f32>;
@group(0) @binding(2) var<storage, read_write> q: array<f32>;

fn at(src: ptr<storage, array<f32>, read_write>, x: i32, y: i32) -> f32 {
  return (*src)[clamp(y, 0, N - 1) * N + clamp(x, 0, N - 1)];
}

/** One Jacobi pass: read all of p, write all of q. */
@compute @workgroup_size(8, 8)
fn jacobi(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
  if (x >= N || y >= N) { return; }
  let s = at(&p, x - 1, y) + at(&p, x + 1, y) + at(&p, x, y - 1) + at(&p, x, y + 1);
  q[y * N + x] = (dv[y * N + x] + s) * 0.25;
}

/** Copy back, so a pass and its swap are one dispatch pair. */
@compute @workgroup_size(8, 8)
fn copy(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
  if (x >= N || y >= N) { return; }
  p[y * N + x] = q[y * N + x];
}

/**
  The app's packed layout: the red cells as one contiguous plane, then the
  black. This is the app's prAt with N substituted for S.n, so if the index
  arithmetic is wrong it is wrong here in the same way.

  (No backticks in here. This is a WGSL comment inside a TS template
  literal, and one backtick ends the shader four lines early.)
*/
fn packed(x: i32, y: i32) -> f32 {
  let cx = clamp(x, 0, N - 1);
  let cy = clamp(y, 0, N - 1);
  let half = N / 2;
  return p[((cx + cy) & 1) * N * half + cy * half + (cx >> 1)];
}

/** The same sweep, on that layout. Thread i writes word i of its plane. */
@compute @workgroup_size(64)
fn redBlackPacked(@builtin(global_invocation_id) id: vec3u) {
  let half = N / 2;
  let i = i32(id.x);
  if (i >= N * half) { return; }
  let parity = i32(q[0]);
  let y = i / half;
  let x = 2 * (i % half) + ((y + parity) & 1);
  let s = packed(x - 1, y) + packed(x + 1, y) + packed(x, y - 1) + packed(x, y + 1);
  p[parity * N * half + i] = (dv[y * N + x] + s) * 0.25;
}

/** One red-black sweep half, in place. q[0] carries the parity. */
@compute @workgroup_size(64)
fn redBlack(@builtin(global_invocation_id) id: vec3u) {
  let half = N / 2;
  let i = i32(id.x);
  if (i >= N * half) { return; }
  let y = i / half;
  let x = 2 * (i % half) + ((y + i32(q[0])) & 1);
  let s = at(&p, x - 1, y) + at(&p, x + 1, y) + at(&p, x, y - 1) + at(&p, x, y + 1);
  p[y * N + x] = (dv[y * N + x] + s) * 0.25;
}

/** The residual, |∇²p − div| summed, left in q[0]. One thread: this is 4096 cells. */
@compute @workgroup_size(1)
fn residual() {
  var sum = 0.0;
  for (var y = 0; y < N; y++) {
    for (var x = 0; x < N; x++) {
      let s = at(&p, x - 1, y) + at(&p, x + 1, y) + at(&p, x, y - 1) + at(&p, x, y + 1);
      sum += abs(s - 4.0 * p[y * N + x] + dv[y * N + x]);
    }
  }
  q[0] = sum / f32(N * N);
}`;

    const pipe = (entry: string) => cache.computePipeline(`pressure selftest ${entry}`, SRC, entry);
    const group = (pipeline: GPUComputePipeline) => bindGroup(device, pipeline, [divBuf, a, b]);
    const tiles = Math.ceil(N / 8);

    /** Twenty-four Jacobi passes from zero, then the residual in `b[0]`. */
    const jacobiSolve = async (rounds: number): Promise<number> => {
      device.queue.writeBuffer(a, 0, new Float32Array(cells));
      device.queue.writeBuffer(b, 0, new Float32Array(cells));
      const enc = device.createCommandEncoder({ label: 'pressure selftest jacobi' });
      const pass = enc.beginComputePass();
      const j = pipe('jacobi');
      const c = pipe('copy');
      for (let k = 0; k < rounds; k++) {
        pass.setPipeline(j); pass.setBindGroup(0, group(j)); pass.dispatchWorkgroups(tiles, tiles);
        pass.setPipeline(c); pass.setBindGroup(0, group(c)); pass.dispatchWorkgroups(tiles, tiles);
      }
      const r = pipe('residual');
      pass.setPipeline(r); pass.setBindGroup(0, group(r)); pass.dispatchWorkgroups(1);
      pass.end();
      enc.copyBufferToBuffer(b, 0, out, 0, 4);
      device.queue.submit([enc.finish()]);
      await out.mapAsync(GPUMapMode.READ, 0, 4);
      const v = new Float32Array(out.getMappedRange(0, 4).slice(0))[0];
      out.unmap();
      return v;
    };

    /*
      Red-black cannot be batched into one pass the way Jacobi can: each
      sweep half needs its parity written to the buffer before it runs, and a
      `writeBuffer` between two dispatches of the same pass does not land
      between them. So the sweeps are submitted one at a time.
    */
    const sweeps = async (entry: 'redBlack' | 'redBlackPacked', rounds: number): Promise<void> => {
      device.queue.writeBuffer(a, 0, new Float32Array(cells));
      const rb = pipe(entry);
      for (let k = 0; k < rounds; k++) {
        for (const parity of [0, 1]) {
          device.queue.writeBuffer(b, 0, new Float32Array([parity]));
          const enc = device.createCommandEncoder();
          const pass = enc.beginComputePass();
          pass.setPipeline(rb); pass.setBindGroup(0, group(rb));
          pass.dispatchWorkgroups(Math.ceil((N * (N / 2)) / 64));
          pass.end();
          device.queue.submit([enc.finish()]);
        }
      }
    };

    /** The residual of whatever is in `a`, which the kernel reads row-major. */
    const residualOf = async (): Promise<number> => {
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      const r = pipe('residual');
      pass.setPipeline(r); pass.setBindGroup(0, group(r)); pass.dispatchWorkgroups(1);
      pass.end();
      enc.copyBufferToBuffer(b, 0, out, 0, 4);
      device.queue.submit([enc.finish()]);
      await out.mapAsync(GPUMapMode.READ, 0, 4);
      const v = new Float32Array(out.getMappedRange(0, 4).slice(0))[0];
      out.unmap();
      return v;
    };

    /** The whole pressure buffer, in whatever order the sweep left it. */
    const fieldOf = async (): Promise<Float32Array> => {
      const enc = device.createCommandEncoder();
      enc.copyBufferToBuffer(a, 0, out, 0, cells * 4);
      device.queue.submit([enc.finish()]);
      await out.mapAsync(GPUMapMode.READ);
      const f = new Float32Array(out.getMappedRange().slice(0));
      out.unmap();
      return f;
    };

    const jacobi = await jacobiSolve(24);

    await sweeps('redBlack', 12);
    const redBlack = await residualOf();
    const rowMajor = await fieldOf();

    /*
      And the same sweep on the layout the app actually uses.

      Storing the two colours as contiguous planes is what makes a sweep's
      writes contiguous, and it is worth a measurable fraction of the
      projection — but it is pure index arithmetic, the one kind of change
      that can be badly wrong and still produce a plausible picture. A
      pressure field that is subtly scrambled still damps divergence; it just
      damps it somewhere else.

      So the claim is stronger than "it converges": the packed sweep must
      produce **the same field, cell for cell**. It is a relabelling, so that
      is not optimism. Every cell has the same four neighbours summed in the
      same order from the same values, and no cell of one colour is written
      while another of that colour is read, so neither layout depends on the
      order its threads happen to run in. The tolerance below exists for two
      entry points compiled with different reassociation, not because
      anything is expected to move — a wrong index does not shift a decimal
      place, it reads somebody else's cell.
    */
    await sweeps('redBlackPacked', 12);
    const packed = await fieldOf();

    const half = N / 2;
    let maxDiff = 0;
    let reach = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const there = rowMajor[y * N + x];
        const here = packed[((x + y) & 1) * N * half + y * half + (x >> 1)];
        const d = Math.abs(here - there);
        if (d > maxDiff) maxDiff = d;
        if (Math.abs(there) > reach) reach = Math.abs(there);
      }
    }
    // `reach > 0` because two fields of nothing match perfectly, and a sweep
    // that never ran is exactly how this would fail quietly.
    const packedMatches = Number.isFinite(maxDiff) && reach > 0 && maxDiff <= reach * 1e-5;

    /*
      Within a couple of percent, not strictly lower.

      Half the work is the point; matching the residual exactly is not, and
      Gauss-Seidel's advantage is asymptotic in the error rather than a
      promise about the residual at any particular iteration. On this problem
      twelve sweeps land within a fifth of a percent of twenty-four Jacobi
      passes, so 2% is a wide gate that still catches the halving going wrong.
    */
    const ok = Number.isFinite(jacobi) && Number.isFinite(redBlack) && jacobi > 0 && redBlack <= jacobi * 1.02;
    return {
      ok,
      jacobi,
      redBlack,
      packedMatches,
      detail: `24 Jacobi ${jacobi.toExponential(4)}, 12 red-black ${redBlack.toExponential(4)}` +
        (jacobi > 0 ? ` — ${((redBlack / jacobi - 1) * 100).toFixed(2)}% more residual for half the work` : ''),
      packedDetail: `largest disagreement ${maxDiff.toExponential(2)} on a field reaching ${reach.toExponential(2)}`,
    };
  } finally {
    disposer.dispose();
  }
}
