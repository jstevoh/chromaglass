// Bundled into a page by scripts/lab.mjs for `npm run framegroups` (PLAN.md
// 14ab-5): the lab, and the frame's passes after its solver, kept from frame
// to frame as the app keeps them. Its own entry beside lab-entry.ts, as
// render-lab-entry.ts is, so the lab's entry stays the size it was.
import './lab-entry.ts';
import { WebGPUPlate } from '../src/gpu/plate';
import { WebGPUOutput, fillOutputUniforms } from '../src/gpu/output';
import { WebGPUCamera, fillCameraUniforms } from '../src/gpu/camera';
import { WebGPUPostChain } from '../src/gpu/post';
import { groupCacheTest } from '../src/gpu/groupCache';
import { fillPlateUniforms, type PlateView } from '../src/gpu/plateUniforms';
import { sourceSettings } from '../src/lib/plateSources';
import { normalizeOutput } from '../src/lib/outputConfig';
import { DEFAULT_SETTINGS, type VisualizerSettings } from '../src/types';
import { CELL_TRAVEL } from '../src/lib/detailFlow';
import type { WebGPUFluid } from '../src/gpu/fluid';

const lab = (window as unknown as { lab: { solver(): WebGPUFluid } }).lab;

/** The frame's passes after the solver, held from frame to frame as the app holds them (`chainOpen`). */
type Chain = {
  plate: WebGPUPlate; cam: WebGPUCamera; post: WebGPUPostChain; out: WebGPUOutput;
  target: GPUTexture | null; frame: number; last: Uint8Array | null;
};
const chains: Chain[] = [];
const dyeIds = new Map<GPUTexture, number>();

const api = {
  /*
    The frame's passes after the solver, kept from one frame to the next as
    the app keeps them, for `npm run framegroups` (PLAN.md 14ab-5): the
    particles' splat, the plate (pack, derive, display), the camera, the post
    chain (the test effect reaching into the ring, the stock, the finish), a
    projector source drawn again and the projector's pass over it, in the
    order `LiquidVisualizer`'s painter runs them. `chainDraw` draws one frame
    of the solver as it stands and says how many bind groups and views the
    passes asked the device for while encoding it, and whether the device
    refused anything; `mode` sets `groupCacheTest` for that frame alone.
  */
  async chainOpen() {
    const device = lab.solver()['device'] as GPUDevice;
    const plate = new WebGPUPlate(device, 'rgba8unorm');
    await plate.drop.prepare();
    chains.push({ plate, cam: new WebGPUCamera(device, 'rgba8unorm'), post: new WebGPUPostChain(device, 'rgba8unorm'), out: new WebGPUOutput(device, 'rgba8unorm'), target: null, frame: 0, last: null });
    return chains.length - 1;
  },
  async chainDraw(id: number, size: number, mode: 'cached' | 'fresh' | 'blind' = 'cached') {
    const solver = lab.solver();
    const f = solver.fields;
    // The plate's clock held at 0: the frame's picture is the solver's alone.
    const grid = f.dye.width;
    const c = chains[id];
    const device = solver['device'] as GPUDevice;
    if (!c.target || c.target.width !== size) {
      c.target?.destroy();
      c.target = device.createTexture({ size: [size, size], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    }
    const settings = { ...DEFAULT_SETTINGS, stock: 0.6, stockGrain: 0.5 } as VisualizerSettings;
    const view: PlateView = {
      settings, time: 0, shot: { cx: 0.5, cy: 0.5, zoom: 1 }, macroAmount: 0, isDarkBlend: false,
      flowRate: CELL_TRAVEL, cellClock: 0,
      rotations: [0, 0], harmony: [0, 1, 2, 3], lamp: { x: 0.5, y: 0.5, x2: 0.5, y2: 0.5 }, magnets: [], gelAngle: 0,
      kaleidoPhase: 0, layer1: { zoom: 1, dx: 0, dy: 0 }, bubbles: { count: 0, strength: 0 },
      bubblePack: { packed: new Float32Array(160), shape: new Float32Array(160) }, dimmerGain: 1,
      filmLevel: 0.05, filmGain: 3, mark: null, film: { kind: 'none', video: null },
    };
    const fluids = [{ gpu: solver as never }];
    fillPlateUniforms(c.plate.pack, { view, fluids, width: size, height: size, derived: true, grid, cameraOn: true, postChain: true });
    fillPlateUniforms(c.plate.sourcePack('front'), {
      view: { ...view, settings: sourceSettings('front', settings) }, fluids,
      width: size, height: size, derived: true, grid, cameraOn: false, postChain: false,
    });
    fillCameraUniforms(c.cam.pack, { time: 0, amount: 0.8, refraction: 0.5, chromatic: 0.3, focus: 0.5, aperture: 0.3, bloom: 0.3, dither: 0 }, size, size);
    const quad = (x0: number, x1: number, source: string) => ({ corners: [x0, 0, x1, 0, x1, 1, x0, 1], src: [0, 0, 1, 1], enabled: true, opacity: 1, feather: 0, source, blend: 'over' });
    const quads = fillOutputUniforms(c.out.pack, normalizeOutput({ surfaces: [quad(0, 0.6, 'wall'), quad(0.4, 1, 'front')], maskFeather: 0 }), size, size, 0);
    
    const live = [{ dye: f.dye, velForced: f.velForced, grain: f.grain, particles: f.particles, air: null, view: f.view, species: f.species }];

    // Counted while the passes encode, and only then: the readback below is the lab's, not the frame's.
    const counts = { groups: 0, views: 0 };
    const makeGroup = device.createBindGroup;
    const makeView = GPUTexture.prototype.createView;
    device.createBindGroup = function (this: GPUDevice, d: GPUBindGroupDescriptor) { counts.groups++; return makeGroup.call(this, d); };
    GPUTexture.prototype.createView = function (this: GPUTexture, d?: GPUTextureViewDescriptor) { counts.views++; return makeView.call(this, d); };
    groupCacheTest.fresh = mode === 'fresh';
    groupCacheTest.blind = mode === 'blind';
    device.pushErrorScope('validation');
    const enc = device.createCommandEncoder();
    try {
      solver.splatParticles(enc);
      const sz = { width: size, height: size };
      const screen = c.out.sceneView(size, size);
      const afterEffects = c.post.sceneView(size, size);
      c.plate.draw(enc, c.cam.sceneView(size, size), sz, live, undefined, true, 'rgba8unorm');
      if (c.plate.auxTarget) c.cam.draw(enc, afterEffects, c.plate.auxTarget, undefined, true, c.post.pictureFormat);
      c.post.effects(enc, c.frame, 7, { mode: 2, delay: 3 });
      c.post.stock(enc, 7, { stock: 0.6, stockType: 0, grain: 0.5, grainSize: 2, weave: 0, gate: 0, filmFrame: c.frame });
      c.post.finish(enc, screen, { dimmer: 1, markOn: 0, markRect: [0, 0, 1, 1], markGrade: [1, 1, 1, 0], markBlend: 0 }, undefined, true);
      c.plate.drawSource(enc, 'front', c.out.sourceView('front', size, size), sz, live, undefined, 'rgba8unorm');
      c.out.draw(enc, makeView.call(c.target), quads);
    } finally {
      device.createBindGroup = makeGroup;
      GPUTexture.prototype.createView = makeView;
      groupCacheTest.fresh = false;
      groupCacheTest.blind = false;
    }
    c.frame++;
    const row = Math.ceil(size * 4 / 256) * 256;
    const buf = device.createBuffer({ size: row * size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyTextureToBuffer({ texture: c.target }, { buffer: buf, bytesPerRow: row }, [size, size]);
    device.queue.submit([enc.finish()]);
    const err = await device.popErrorScope();
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const px = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) px.set(src.subarray(y * row, y * row + size * 4), y * size * 4);
    buf.unmap(); buf.destroy();
    c.last = px;
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) lit++;
    // Which of the dye's ping-pong pair this frame read, so the check can say it met both.
    let dye = dyeIds.get(f.dye);
    if (dye === undefined) { dye = dyeIds.size; dyeIds.set(f.dye, dye); }
    return { ...counts, error: err ? err.message : null, lit: lit / (size * size), particles: !!f.particles, dye };
  },
  /** How two chains' last frames differ: the bytes that are not the same, and the largest step between them. */
  chainDiff(a: number, b: number) {
    const x = chains[a].last!, y = chains[b].last!;
    let bytes = 0, most = 0;
    for (let i = 0; i < x.length; i++) {
      const d = Math.abs(x[i] - y[i]);
      if (d) { bytes++; if (d > most) most = d; }
    }
    return { bytes, most, of: x.length };
  },
};
Object.assign(lab, api);
