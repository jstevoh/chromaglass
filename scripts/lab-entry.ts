// Bundled into a page by scripts/lab.mjs: the GPU solver on its own, with no
// canvas, driven step by step so a physics change can be measured on any
// adapter that computes (a Linux box's software one included).
import { WebGPUFluid, DISPLACE_PUSH, DISPLACE_INSIDE } from '../src/gpu/fluid';
import { WebGPUPlate } from '../src/gpu/plate';
import { BeadField, rasterDrops } from '../src/lib/beads';
import { fillPlateUniforms, magnetsOnPlate } from '../src/gpu/plateUniforms';
import { DEFAULT_SETTINGS, type VisualizerSettings } from '../src/types';
import type { GpuStepParams } from '../src/gpu/solverTypes';
import { CELL_TRAVEL, advanceCellClock, stepDisplacement } from '../src/lib/detailFlow';
import { phasePour, type PhasePourShape } from '../src/lib/phasePour';
import { PRESETS } from '../src/presets';
import { phasePourShape } from '../src/presetPlate';
import { squishDisc, PressLift, type Stroke } from '../src/lib/squish';
import { PRESS_RING, pressDye, pressOil } from '../src/lib/pressRing';
import { fingerCarry, blowCarry } from '../src/lib/handCarry';

export const BASE: GpuStepParams = {
  dt: 0.004, visc: 0.5, nu: 0.00005, diff: 0.0001, buoyancy: 0, gravity: 0, tiltX: 0, tiltY: 0,
  advection: 1, sharpness: 0, damping: 0.99, heatDecay: 0.98, turbScale: 0, turbDetail: 3, spin: 0,
  immiscibility: 0, phaseSharp: 0.35, phaseTension: 0.18, magnetX: 0.5, magnetY: 0.5, magnetHeight: 0.2,
  magnetStrength: 0, magnetSeconds: 1 / 60, plateCurve: 0, depthDrag: 0, gapSpring: 0.02, gapMemory: 0,
  platePressure: 0.4, vibIntensity: 0, vibFrequency: 0, drip: 0, smearX: 0, smearY: 0,
  air: 0, evapFactor: 1, time: 0, currentDamp: 0.98, currentBuoy: 0, rockX: 0, rockY: 0, currentGrav: 0,
  twist: 0, meanDensity: 0, maxCurrent: 0.01, particles: 0, particleLife: 4,
} as GpuStepParams;

/** Numbers as IEEE half floats, for writing an rgba16float texture. */
function halves(data: number[]): ArrayBuffer {
  const out = new Uint16Array(data.length);
  const f = new Float32Array(1), u = new Uint32Array(f.buffer);
  for (let k = 0; k < data.length; k++) {
    f[0] = data[k];
    const x = u[0], sign = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
    out[k] = e <= 0 ? sign : e >= 31 ? sign | 0x7c00 : sign | (e << 10) | (m >>> 13);
  }
  return out.buffer;
}

type Lab = {
  solver: WebGPUFluid; L: number; N: number; time: number; cellClock: number;
  dyeAdd: Float32Array; velAdd: Float32Array; mul: Float32Array;
  /** The magnets the plate was last stepped with, as the app hands them to the picture. */
  magnets: { x: number; y: number; height: number; strength: number }[];
};
let lab: Lab | null = null;

const api = {
  async create(N = 256, L = 192) {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('no adapter');
    const device = await adapter.requestDevice({ requiredFeatures: adapter.features.has('float32-filterable') ? ['float32-filterable'] : [] });
    device.lost.then((i) => console.log('device lost', i.message));
    device.addEventListener('uncapturederror', (e) => console.log('gpu error', (e as GPUUncapturedErrorEvent).error.message.slice(0, 400)));
    const solver = new WebGPUFluid(device, N, L, { float32Filterable: adapter.features.has('float32-filterable') });
    solver.clear();
    lab = { solver, L, N, time: 0, cellClock: 0, magnets: [], dyeAdd: new Float32Array(L * L * 4), velAdd: new Float32Array(L * L * 4), mul: new Float32Array(L * L).fill(1) };
    return { N, L };
  },
  /** A soft disc of dye (absorbances r, g, b; density d) at (x, y) in plate units, radius r. */
  dye(x: number, y: number, r: number, rgb: [number, number, number], d = 1) {
    const { L, dyeAdd } = lab!;
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const dx = (i + 0.5) / L - x, dy = (j + 0.5) / L - y;
      const f = 1 - (dx * dx + dy * dy) / (r * r);
      if (f <= 0) continue;
      const k = (i + j * L) * 4;
      dyeAdd[k] += rgb[0] * f * d; dyeAdd[k + 1] += rgb[1] * f * d; dyeAdd[k + 2] += rgb[2] * f * d; dyeAdd[k + 3] += f * d;
    }
  },
  /** Any dye at all, cell for cell: L × L × 4, added on the next flush. */
  addDye(data: number[]) {
    const { dyeAdd } = lab!;
    if (data.length !== dyeAdd.length) throw new Error(`addDye: ${data.length} values for a ${dyeAdd.length}-value plate`);
    for (let k = 0; k < dyeAdd.length; k++) dyeAdd[k] += data[k];
  },
  /**
   * The oil's share of the dye (Oil Bodies), cell for cell: N × N × 4,
   * replacing what is there, each value clamped to the dye under it by the
   * solver's next pass. The plate must already have stepped once with the
   * bodies on, so the share exists and is live. For a check that starts
   * from colours already in their liquids: laying them as dye would land
   * them split by the oil under each cell (bodyLand), which on a rim a few
   * cells wide hands a tenth of the oil's colour to the water before the
   * check has begun (measured, `npm run bodies`).
   */
  share(data: number[]) {
    const { solver, N } = lab!;
    const od = solver['oilDye'];
    if (!od) throw new Error('share: no oil share on this plate (step once with oilBodies on first)');
    if (data.length !== N * N * 4) throw new Error(`share: ${data.length} values for a ${N * N * 4}-value grid`);
    const f32 = od.format === 'rgba32float';
    const row = N * (f32 ? 16 : 8);
    const bytes = f32 ? new Float32Array(data).buffer : halves(data);
    solver['device'].queue.writeTexture({ texture: od.read }, bytes, { bytesPerRow: row }, [N, N]);
  },
  /** A velocity kick / heat / gap delta at (x, y): channels vx, vy, temp, gap. */
  vel(x: number, y: number, r: number, v: [number, number, number, number]) {
    const { L, velAdd } = lab!;
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const dx = (i + 0.5) / L - x, dy = (j + 0.5) / L - y;
      const f = 1 - (dx * dx + dy * dy) / (r * r);
      if (f <= 0) continue;
      const k = (i + j * L) * 4;
      for (let c = 0; c < 4; c++) velAdd[k + c] += v[c] * f;
    }
  },
  /**
   * A press, a lift or a splash, laid exactly as the app lays one
   * (lib/squish.ts): at grid cell (x, y) of the logical L × L plate, over
   * `radius` cells. The app's plate is 192 cells, the lab's L by default, so
   * a press the app makes at radius 30 × GRID_SCALE is radius 45 here too.
   */
  squish(x: number, y: number, radius: number, amount: number, fingering: number, stroke: Stroke, pile = 0) {
    const { L, velAdd, mul } = lab!;
    squishDisc(L, x, y, radius, amount, fingering, stroke, pile, (idx, gap, vx, vy, m) => {
      velAdd[idx * 4] += vx; velAdd[idx * 4 + 1] += vy; velAdd[idx * 4 + 3] += gap; mul[idx] *= m;
    });
  },
  /**
   * What a stroke would lay, without laying it: the gap delta cell by cell
   * (L × L). `npm run lift` holds the plate's picture against this, so it
   * asks whether the fingers are where the spokes are, not only whether
   * there are fingers somewhere.
   */
  strokeGap(x: number, y: number, radius: number, amount: number, fingering: number, stroke: Stroke, pile = 0) {
    const { L } = lab!;
    const out = new Float32Array(L * L);
    squishDisc(L, x, y, radius, amount, fingering, stroke, pile, (idx, gap) => { out[idx] += gap; });
    return Array.from(out);
  },
  /** The press's memory, as the plate keeps it: `npm run lift` presses and lets go through this. */
  PressLift,
  flush(dt = BASE.dt) {
    const l = lab!;
    l.solver.applyDeltas(l.dyeAdd, l.velAdd, l.mul, dt);
    l.dyeAdd.fill(0); l.velAdd.fill(0); l.mul.fill(1);
  },
  async step(n: number, over: Partial<GpuStepParams> = {}) {
    const l = lab!;
    // The app runs the old solver until Thin Gap's pipelines are built
    // (prepareThinGap); the lab measures the thin gap from its first step.
    if ((over.thinGap ?? 0) > 0.5) await l.solver.prepareThinGap();
    for (let k = 0; k < n; k++) {
      l.time += 1 / 60;
      const p = { ...BASE, ...over, time: l.time } as GpuStepParams;
      l.solver.step(p, false);
      l.magnets = magnetsOnPlate(p);
      l.cellClock = advanceCellClock(l.cellClock, stepDisplacement(p.dt, p.advection, l.N));
    }
    await l.solver['device'].queue.onSubmittedWorkDone();
  },
  addPhase(x: number, y: number, r: number, a: number) { lab!.solver.addPhase(x, y, r, a); },
  /** A shipped look's settings and the shape it pours its ferrofluid in, as the app reads them. */
  look(id: string) {
    const p = PRESETS.find(q => q.id === id);
    if (!p) throw new Error(`no look ${id}`);
    // Over the defaults, as the app lays a look: a key the look leaves out
    // is the default there, not off.
    return { settings: { ...DEFAULT_SETTINGS, ...p.settings }, pour: phasePourShape(id) };
  },
  /** Pour the ferrofluid as the app lays a look's (phasePour): the same drops, not a copy of them. Returns how many. */
  pour(shape: PhasePourShape, scale: number) {
    const drops = phasePour(shape, scale);
    for (const d of drops) lab!.solver.addPhase(d.x, d.y, d.r, d.amount);
    return drops.length;
  },
  /** Ferro Pushes Dye's exchanges at full, as the engine runs them. */
  displace: { push: DISPLACE_PUSH, inside: DISPLACE_INSIDE },
  /**
   * The phaseDisplace pass alone, n times, with these two strengths and
   * nothing else stepped: so a check can hold one exchange to account without
   * the rest of the solver moving the dye as well.
   */
  async displacePasses(n: number, push: number, inside: number) {
    const s = lab!.solver as unknown as {
      device: GPUDevice; dye: { read: GPUTexture; write: GPUTexture; swap(): void }; phase: { read: GPUTexture };
      arg(name: string, v: number[]): GPUBuffer; run(pass: GPUComputePassEncoder, name: string, dst: GPUTexture, reads: GPUTexture[], args: GPUBuffer): void;
    };
    const enc = s.device.createCommandEncoder({ label: 'displace passes' });
    const pass = enc.beginComputePass();
    const args = s.arg('lab displace', [push, inside, 0, 0]);
    for (let k = 0; k < n; k++) { s.run(pass, 'phaseDisplace', s.dye.write, [s.dye.read, s.phase.read], args); s.dye.swap(); }
    pass.end();
    s.device.queue.submit([enc.finish()]);
    await s.device.queue.onSubmittedWorkDone();
  },
  async field(which: 'dye' | 'vel' | 'oilDye') { return Array.from(await lab!.solver.readField(which)); },
  async phase() { const f = await lab!.solver.readPhase(); return f ? { n: f.n, data: Array.from(f.data) } : null; },
  async squeeze() { const f = await lab!.solver.readSqueeze(); return f ? { n: f.n, gap: Array.from(f.gap), rate: Array.from(f.rate) } : null; },
  solver() { return lab!.solver; },
  /** The oil's half of a press, through the app's own function (squeezeOut): mirror cells, N across. */
  pressOil(cx: number, cy: number, R: number, N: number, take: number) { pressOil(lab!.solver, cx, cy, R, N, take); },
  pressRing: PRESS_RING,
  /** The dye's half of a press, as squeezeOut runs it on a mirror (rgba, N x N): what it takes and where it lands. */
  pressDye(dye: number[], N: number, cx: number, cy: number, R: number, take: number) {
    const out = { mul: new Float32Array(N * N).fill(1), density: new Float32Array(N * N), densityR: new Float32Array(N * N), densityG: new Float32Array(N * N), densityB: new Float32Array(N * N) };
    const moved = pressDye(dye, N, cx, cy, R, take, out);
    return { moved, mul: Array.from(out.mul), density: Array.from(out.density) };
  },
  /** What a hand's Finger and Blow carry of the ferrofluid, as the app works it out (lib/handCarry.ts). */
  fingerCarry, blowCarry,
  /** The plate renderer, for checks on what it derives from the fields. */
  WebGPUPlate,
  /** The oil beads and drops, to lay a field on the lab's plate (`cam.beadMask` below). */
  BeadField, rasterDrops,
  /**
   * The finished picture of the lab's plate, as the app would draw it with
   * these settings and this camera: RGBA bytes, size x size. `shot.zoom` is
   * the closeup's magnification; `macroAmount` how far into the closeup
   * (the app ramps it from 1x to 2x). `rotation` turns the plate, in
   * radians, as the motor does. The plate reads the solver's packed view
   * field (the gap, the mix, the reactions) as the app does; `view: false`
   * hands it none, and it reads a blank one, a flat gap at rest.
   */
  async render(size: number, over: Partial<VisualizerSettings> = {},
    cam: {
      magnets?: { x: number; y: number; height: number; strength: number }[];
      cx?: number; cy?: number; zoom?: number; macroAmount?: number; filmLevel?: number; filmGain?: number; bubbles?: number; rotation?: number; beadMask?: CanvasImageSource; view?: boolean; time?: number;
      /*
        The other pictures the plate composites, for the mixer's check
        (`npm run mixer`): a film frame, a logo, and a second plate. The
        second plate is the lab's one plate drawn again as the back layer,
        which is enough to ask what lies over what, as long as it can be
        turned (`backRotation`, radians): drawn in the same place as the
        front, "where the back plate has dye" and "where the front plate has
        dye" are the same pixels, and a fault tied to the wrong plate cannot
        be told from the right one.
      */
      film?: CanvasImageSource; mark?: CanvasImageSource; backPlate?: boolean; backRotation?: number;
    } = {}) {
    const l = lab!;
    const device = l.solver['device'] as GPUDevice;
    const plate = new WebGPUPlate(device, 'rgba8unorm');
    const zoom = cam.zoom ?? 1;
    // The beads' mask, as the app uploads it: a BeadField's render(), square
    // for rings and twice as wide for drops.
    if (cam.beadMask) plate.setSource('beads', cam.beadMask);
    const size2 = (img: CanvasImageSource) => {
      const it = img as unknown as { width: number; height: number };
      return [it.width, it.height];
    };
    if (cam.film) plate.setSource('film', cam.film);
    if (cam.mark) plate.setSource('mark', cam.mark);
    const [fw, fh] = cam.film ? size2(cam.film) : [0, 0];
    const [mw, mh] = cam.mark ? size2(cam.mark) : [1, 1];
    fillPlateUniforms(plate.pack, {
      view: {
        // The plate's clock can be set apart from the solver's, to ask what
        // the picture does with time alone (in `npm run filmlook`, the film's
        // thickness must not drift with it).
        settings: { ...DEFAULT_SETTINGS, ...over } as VisualizerSettings, time: cam.time ?? l.time,
        shot: { cx: cam.cx ?? 0.5, cy: cam.cy ?? 0.5, zoom },
        macroAmount: cam.macroAmount ?? Math.max(0, Math.min(1, zoom - 1)), isDarkBlend: false,
        // As the app has them: the cells slide on the lab plate's own travel.
        flowRate: CELL_TRAVEL, cellClock: l.cellClock,
        rotations: [cam.rotation ?? 0, cam.backRotation ?? 0], harmony: [0, 1, 2, 3], lamp: { x: 0.5, y: 0.5, x2: 0.5, y2: 0.5 }, magnets: cam.magnets ?? l.magnets, gelAngle: 0,
        kaleidoPhase: 0, layer1: { zoom: 1, dx: 0, dy: 0 }, bubbles: { count: 0, strength: cam.bubbles ?? 0 },
        bubblePack: { packed: new Float32Array(160), shape: new Float32Array(160) }, dimmerGain: 1,
        filmLevel: cam.filmLevel ?? 0.05, filmGain: cam.filmGain ?? 3,
        mark: cam.mark ? { aspect: mw / Math.max(1, mh) } : null,
        film: cam.film ? { kind: 'file', video: { readyState: 4, videoWidth: fw, videoHeight: fh } } : { kind: 'none', video: null },
      },
      fluids: cam.backPlate ? [{ gpu: l.solver as never }, { gpu: l.solver as never }] : [{ gpu: l.solver as never }],
      width: size, height: size, derived: true, grid: l.N,
    });
    const target = device.createTexture({ size: [size, size], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const enc = device.createCommandEncoder();
    const layer = { dye: l.solver['dye'].read, velForced: l.solver['velForced'], grain: null, particles: null, air: (cam.bubbles ?? 0) > 0 ? (l.solver as unknown as { air?: { field: GPUTexture } }).air?.field ?? null : null, view: cam.view === false ? null : l.solver.fields.view };
    plate.draw(enc, target.createView(), { width: size, height: size }, cam.backPlate ? [layer, { ...layer, air: null }] : [layer]);
    const row = Math.ceil(size * 4 / 256) * 256;
    const buf = device.createBuffer({ size: row * size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyTextureToBuffer({ texture: target }, { buffer: buf, bytesPerRow: row }, [size, size]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const out = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) out.set(src.subarray(y * row, y * row + size * 4), y * size * 4);
    buf.unmap(); buf.destroy(); target.destroy(); plate.dispose();
    return Array.from(out);
  },
};
(window as unknown as { lab: typeof api }).lab = api;
(window as unknown as { labReady: boolean }).labReady = true;
