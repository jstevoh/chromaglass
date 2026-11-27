// Bundled into a page by scripts/lab.mjs for `npm run linearlight` (PLAN 38p):
// the lab (window.lab, the real plate shader) plus the plate's light
// functions (wgsl/plateLight.ts) run on their own in a small compute shader,
// so what each one returns can be read back exactly.
import './lab-entry';
import { LIGHT_WGSL } from '../src/gpu/wgsl/plateLight';

/* Each case is 8 floats in (a.rgb, b.r, b.g, b.b, t, op) and 4 out. */
const KERNEL = /* wgsl */ `
${LIGHT_WGSL}
@group(0) @binding(0) var<storage, read> cases: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> outs: array<vec4f>;
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let a = cases[2u * i].xyz;
  let b = vec3f(cases[2u * i].w, cases[2u * i + 1u].x, cases[2u * i + 1u].y);
  let t = cases[2u * i + 1u].z;
  let op = i32(cases[2u * i + 1u].w + 0.5);
  var r = vec3f(0.0);
  if (op == 0) { r = mixLight(a, b, t); }
  if (op == 1) { r = addLight(a, b); }
  if (op == 2) { r = spectralThrough(a, t); }
  outs[i] = vec4f(r, 0.0);
}
`;

(window as unknown as { lightFns: unknown }).lightFns = {
  /** cases: [a.rgb, b.rgb, t, op] each; returns rgb each. */
  async run(cases: number[][]): Promise<number[][]> {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();
    const n = cases.length;
    const data = new Float32Array(n * 8);
    cases.forEach((c, i) => data.set(c, i * 8));
    const inBuf = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(inBuf, 0, data);
    const outBuf = device.createBuffer({ size: n * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const read = device.createBuffer({ size: n * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: KERNEL }), entryPoint: 'main' } });
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(n); pass.end();
    enc.copyBufferToBuffer(outBuf, 0, read, 0, n * 16);
    device.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const f = new Float32Array(read.getMappedRange().slice(0));
    read.unmap();
    return cases.map((_, i) => [f[i * 4], f[i * 4 + 1], f[i * 4 + 2]]);
  },
};
