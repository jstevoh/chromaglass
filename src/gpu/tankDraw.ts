/**
 * The tank drawn in the plate's place (PLAN 47n): the dye glowing in dark
 * water, seen through the tank's side wall, as *Gravity L1* films it.
 *
 * Rendering reads, physics writes: this draws the solver's dye
 * (gpu/tankPlate.ts) and nothing else. Its glow is the dye's own
 * fluorescence, 1 − exp(−k·c) of the lamp's light absorbed and re-emitted
 * (Beer–Lambert through the thread's depth, so a thin thread is dim and a
 * thick pool saturates instead of clipping), tinted toward white where the
 * dye is dense, as a camera's sensor clips a bright fluorescent core. The
 * halo it bleeds into the black is the camera's bloom (post.ts), which runs
 * after this as it does after the plate.
 *
 * The tank keeps its own 16:9 shape: it fills the frame's width, or its
 * height on a screen wider than 16:9, with black water beyond it.
 *
 * It writes the plate's two targets, the picture and the camera's aux
 * (cleared to no refraction, no height, no bubble), so the camera, the
 * post-effects and the projector take it exactly as they take the plate.
 */
import { layoutFromWgsl, type PipelineCache } from './kit';
import type { TankPlateField } from './tankPlate';

export const TANK_DRAW_WGSL = /* wgsl */ `
override FLIP_Y: f32 = 1.0;
struct DrawU { res: vec2f, n: vec2u, colour: vec3f, glow: f32 };
@group(0) @binding(0) var<uniform> D: DrawU;
@group(0) @binding(1) var<storage, read> c: array<f32>;
struct VsOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var p = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  var out: VsOut;
  out.pos = vec4f(p[i].x, p[i].y * FLIP_Y, 0.0, 1.0);
  out.uv = p[i] * 0.5 + 0.5;
  return out;
}
fn dyeAt(i: i32, j: i32) -> f32 {
  let ii = u32(clamp(i, 0, i32(D.n.x) - 1)); let jj = u32(clamp(j, 0, i32(D.n.y) - 1));
  return c[jj * D.n.x + ii];
}
struct FsOut { @location(0) colour: vec4f, @location(1) aux: vec4f };
@fragment fn fs(in: VsOut) -> FsOut {
  // The screen's uv (y up) to the tank's, keeping the tank's shape.
  let aspect = D.res.x / max(1.0, D.res.y);
  let tankAspect = f32(D.n.x) / f32(D.n.y);
  var t = in.uv;
  if (aspect >= tankAspect) { t.x = (t.x - 0.5) * aspect / tankAspect + 0.5; }
  else { t.y = (t.y - 0.5) * tankAspect / aspect + 0.5; }
  var out: FsOut;
  out.aux = vec4f(0.5, 0.5, 0.0, 0.0);
  if (any(t < vec2f(0.0)) || any(t > vec2f(1.0))) { out.colour = vec4f(0.0, 0.0, 0.0, 1.0); return out; }
  // Bilinear on the cell centres.
  let g = t * vec2f(D.n) - 0.5;
  let i = i32(floor(g.x)); let j = i32(floor(g.y));
  let f = g - floor(g);
  let d = mix(mix(dyeAt(i, j), dyeAt(i + 1, j), f.x), mix(dyeAt(i, j + 1), dyeAt(i + 1, j + 1), f.x), f.y);
  let e = 1.0 - exp(-3.0 * max(d, 0.0));
  let lit = D.colour * e + vec3f(0.35 * e * e);
  out.colour = vec4f(lit * D.glow, 1.0);
  return out;
}
`;

/*
  Each target the tank is drawn into (the plate's picture, each projector
  source) has its own arguments and groups, keyed by its aux view, which the
  plate keeps for as long as the target: they are written before the frame's
  one submit, and a buffer shared between them would hand every draw the
  last one's size. The buffer goes with the plate (`track`, its disposer).
*/
interface DrawState { buf: GPUBuffer; data: Float32Array; u32: Uint32Array; groups: Map<GPUBuffer, Map<GPURenderPipeline, GPUBindGroup>> }
const states = new WeakMap<GPUTextureView, DrawState>();

/**
 * Draw the tank into the plate's targets, if this frame's front plate has one.
 * False (and nothing drawn) when it has none, so the plate draws itself.
 */
export function drawTank(
  device: GPUDevice,
  pipelines: PipelineCache,
  encoder: GPUCommandEncoder,
  target: GPUTextureView,
  auxView: GPUTextureView,
  field: TankPlateField | null | undefined,
  size: { width: number; height: number },
  timestamps: GPURenderPassTimestampWrites | undefined,
  toTexture: boolean,
  format: GPUTextureFormat,
  track: (b: GPUBuffer) => GPUBuffer,
): boolean {
  if (!field) return false;
  const pipe = pipelines.renderPipeline(`tank draw ${format}${toTexture ? ' flipped' : ''}`, (module) => {
    const m = module(TANK_DRAW_WGSL);
    const constants = toTexture ? { FLIP_Y: -1 } : undefined;
    return {
      layout: device.createPipelineLayout({ bindGroupLayouts: [layoutFromWgsl(device, TANK_DRAW_WGSL, 'tank draw', GPUShaderStage.FRAGMENT)] }),
      vertex: { module: m, entryPoint: 'vs', constants },
      fragment: { module: m, entryPoint: 'fs', targets: [{ format }, { format: 'rgba8unorm' as GPUTextureFormat }] },
      primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
    };
  });
  if (!pipe) return false;
  let u = states.get(auxView);
  if (!u) {
    const data = new Float32Array(12);
    u = { buf: track(device.createBuffer({ label: 'tank draw args', size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })), data, u32: new Uint32Array(data.buffer), groups: new Map() };
    states.set(auxView, u);
  }
  u.data[0] = size.width; u.data[1] = size.height; u.u32[2] = field.nx; u.u32[3] = field.ny;
  u.data[4] = field.colour[0]; u.data[5] = field.colour[1]; u.data[6] = field.colour[2]; u.data[7] = field.glow;
  device.queue.writeBuffer(u.buf, 0, u.data);
  // A group per dye buffer (the solver ping-pongs two) and pipeline, made once.
  let byPipe = u.groups.get(field.c);
  if (!byPipe) { byPipe = new Map(); u.groups.set(field.c, byPipe); }
  let group = byPipe.get(pipe);
  if (!group) {
    group = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: u.buf } }, { binding: 1, resource: { buffer: field.c } }] });
    byPipe.set(pipe, group);
  }
  const pass = encoder.beginRenderPass({
    label: 'tank',
    colorAttachments: [
      { view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } },
      { view: auxView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.5, g: 0.5, b: 0, a: 0 } },
    ],
    timestampWrites: timestamps,
  });
  pass.setPipeline(pipe);
  pass.setBindGroup(0, group);
  pass.draw(6);
  pass.end();
  return true;
}
