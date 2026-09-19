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
