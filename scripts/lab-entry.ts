// Bundled into a page by scripts/lab.mjs: the GPU solver on its own, with no
// canvas, driven step by step so a physics change can be measured on any
// adapter that computes (a Linux box's software one included).
import { WebGPUFluid, DISPLACE_PUSH, DISPLACE_INSIDE, CARRY_SUBSTEPS, thinGapViscosity, FERRO_NU, FILM_MAX } from '../src/gpu/fluid';
import { WebGPUPlate } from '../src/gpu/plate';
import { SPIKES_WGSL, fieldOnAxis, SPIKE_ONSET, SPIKE_FULL, SPIKE_B_REF } from '../src/gpu/wgsl/spikes';
import { magnetReach, magnetDepth } from '../src/lib/magnetSize';
import { MAGNET_RADIUS } from '../src/gpu/wgsl/magnetDisc';
import { BeadField, rasterDrops } from '../src/lib/beads';
import { fillPlateUniforms, magnetsOnPlate, type PlateView } from '../src/gpu/plateUniforms';
import { sourceSettings } from '../src/lib/plateSources';
import { WebGPUOutput, fillOutputUniforms } from '../src/gpu/output';
import { speciesOf } from '../src/lib/liquidProps';
import { DEFAULT_LIQUID_TYPES } from '../src/types';
import { normalizeOutput } from '../src/lib/outputConfig';
import { DEFAULT_SETTINGS, type VisualizerSettings } from '../src/types';
import type { GpuStepParams } from '../src/gpu/solverTypes';
import { CELL_TRAVEL, advanceCellClock, stepDisplacement } from '../src/lib/detailFlow';
import { phasePour, type PhasePourShape } from '../src/lib/phasePour';
import { clockGlassBodies, clockGlassCell } from '../src/lib/oilLay';
import { PRESETS } from '../src/presets';
import { phasePourShape, PRESET_CONTRACTS, dyesOnPlate } from '../src/presetPlate';
import { dyeAbsorbances } from '../src/lib/dye';
import { PALETTE_RGB } from '../src/constants';
import { squishDisc, glassSpring, PressLift, type Stroke } from '../src/lib/squish';
import { PRESS_RING, pressDye, pressOil } from '../src/lib/pressRing';
import { layFinger, handEdge } from '../src/lib/handSolid';
import { layBreath, BREATH_STRESS } from '../src/lib/breath';
import { fingerCarry, blowCarry, blowDye, blowOil, BLOW_RADIUS, BLOW_STRENGTH, remoteBlowRadius } from '../src/lib/handCarry';

export const BASE: GpuStepParams = {
  dt: 0.004, visc: 0.5, nu: 0.00005, diff: 0.0001, buoyancy: 0, gravity: 0, tiltX: 0, tiltY: 0,
  advection: 1, sharpness: 0, damping: 0.99, heatDecay: 0.98, turbScale: 0, turbDetail: 3, spin: 0,
  immiscibility: 0, phaseSharp: 0.35, phaseTension: 0.18, magnetX: 0.5, magnetY: 0.5, magnetHeight: 0.2,
  magnetStrength: 0, magnetSeconds: 1 / 60, plateCurve: 0, depthDrag: 0, gapSpring: 0.02, gapMemory: 0,
  platePressure: 0.4, vibIntensity: 0, vibFrequency: 0, drip: 0, smearX: 0, smearY: 0,
  air: 0, evapFactor: 1, time: 0, currentDamp: 0.98, currentBuoy: 0, rockX: 0, rockY: 0, currentGrav: 0,
  meanDensity: 0, maxCurrent: 0.01, particles: 0, particleLife: 4,
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
  /** The hands laid this step (layFinger), or null with none down. */
  hands: Float32Array | null;
  /** A Blow's breath laid this step (layBreath), or null with none. */
  breath: Float32Array | null;
  /** The magnets the plate was last stepped with, as the app hands them to the picture. */
  magnets: { x: number; y: number; height: number; strength: number }[];
};
let lab: Lab | null = null;

const api = {
  async create(N = 256, L = 192) {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('no adapter');
    const wantLimits: Record<string, number> = {};
    if (adapter.limits.maxStorageBufferBindingSize) {
      wantLimits.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
    }
    if (adapter.limits.maxBufferSize) {
      wantLimits.maxBufferSize = adapter.limits.maxBufferSize;
    }
    const device = await adapter.requestDevice({
      requiredFeatures: adapter.features.has('float32-filterable') ? ['float32-filterable'] : [],
      requiredLimits: wantLimits,
    });
    device.lost.then((i) => console.log('device lost', i.message));
    device.addEventListener('uncapturederror', (e) => console.log('gpu error', (e as GPUUncapturedErrorEvent).error.message.slice(0, 400)));
    const solver = new WebGPUFluid(device, N, L, { float32Filterable: adapter.features.has('float32-filterable') });
    solver.clear();
    lab = { solver, L, N, time: 0, cellClock: 0, magnets: [], dyeAdd: new Float32Array(L * L * 4), velAdd: new Float32Array(L * L * 4), mul: new Float32Array(L * L).fill(1), hands: null, breath: null };
    return { N, L };
  },
  /** A disc of colour flat to its edge, for a force the same everywhere in a pool (`npm run thick`). */
  dyeDisc(x: number, y: number, r: number, rgb: [number, number, number], d = 1) {
    const { L, dyeAdd } = lab!;
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const dx = (i + 0.5) / L - x, dy = (j + 0.5) / L - y;
      if (dx * dx + dy * dy > r * r) continue;
      const k = (i + j * L) * 4;
      dyeAdd[k] += rgb[0] * d; dyeAdd[k + 1] += rgb[1] * d; dyeAdd[k + 2] += rgb[2] * d; dyeAdd[k + 3] += d;
    }
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
  /** Any velocity, heat and gap at all, cell for cell: L × L × 4 (vx, vy, temp, gap), added on the next flush. */
  addVel(data: number[]) {
    const { velAdd } = lab!;
    if (data.length !== velAdd.length) throw new Error(`addVel: ${data.length} values for a ${velAdd.length}-value plate`);
    for (let k = 0; k < velAdd.length; k++) velAdd[k] += data[k];
  },
  /**
   * Where the plate's clock stands, in seconds: the solver's noises (the
   * turbulence, the old fingering push `npm run grating` puts back) are
   * drawn at it, so a check can ask one moment of a show and not only the
   * first second of a new plate.
   */
  setTime(t: number) { lab!.time = t; },
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
  squish(x: number, y: number, radius: number, amount: number, fingering: number, stroke: Stroke, pile = 0, thin = false) {
    const { L, velAdd, mul } = lab!;
    squishDisc(L, x, y, radius, amount, fingering, stroke, pile, (idx, gap, vx, vy, m) => {
      velAdd[idx * 4] += vx; velAdd[idx * 4 + 1] += vy; velAdd[idx * 4 + 3] += gap; mul[idx] *= m;
    }, thin);
  },
  /** The carries' substeps on the last thin step, and the Courant number that asked for them (carryPlan). */
  async carry() { return lab!.solver.readCarry(); },
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
  /** The glass's spring a step, as the app derives it from Press Lift (`npm run presslift`). */
  glassSpring,
  /** The most substeps a thin gap's carry takes in a step (carryPlan). */
  carrySubsteps: CARRY_SUBSTEPS,
  flush(dt = BASE.dt) {
    const l = lab!;
    l.solver.applyDeltas(l.dyeAdd, l.velAdd, l.mul, dt, l.hands, l.breath);
    l.dyeAdd.fill(0); l.velAdd.fill(0); l.mul.fill(1);
    l.hands = null; l.breath = null;
  },
  /**
   * A Finger in the liquid on a thin gap, laid as the app lays one
   * (lib/handSolid.ts): at grid cell (x, y) of the L × L plate, `r` cells
   * in radius, having moved (mx, my) cells this step. Held for the step
   * after the next flush.
   */
  /** How the finger's χ falls off at its rim, in cells of the L-cell plate (handEdge). */
  handEdge,
  finger(x: number, y: number, r: number, mx: number, my: number, edge?: number) {
    const l = lab!;
    if (!l.hands) l.hands = new Float32Array(l.L * l.L * 4);
    return layFinger(l.hands, l.L, x, y, r, mx, my, edge);
  },
  /**
   * A Blow's wind on a thin gap, laid as the app lays it (lib/breath.ts,
   * blowWind): at grid cell (x, y) of the L × L plate, `r` cells in radius,
   * blowing along (dx, dy) at `share` of a default breath's stress. Held
   * for the step after the next flush.
   */
  breath(x: number, y: number, r: number, dx: number, dy: number, share = 1) {
    const l = lab!;
    if (!l.breath) l.breath = new Float32Array(l.L * l.L * 4);
    return layBreath(l.breath, l.L, x, y, r, dx, dy, share);
  },
  /** A default breath's stress at its middle, in pascals (lib/breath.ts). */
  breathStress: BREATH_STRESS,
  /*
    `flushed` says the first of these steps follows a flush, as the app's
    loop says it (`gpu.step(p, applied)`): the gap then takes its press and
    its spring in the one update the flush ran, not a second spring-only
    update in the step as well. Every check before `npm run heldpress`
    stepped without it, and a press held step after step then had its gap
    sprung twice a step, a local opening the app never has.
  */
  async step(n: number, over: Partial<GpuStepParams> = {}, flushed = false) {
    const l = lab!;
    // The app builds Thin Gap's pipelines before its first step (every look
    // opens on a thin gap); the lab builds them here, so it measures the
    // thin gap from its first step too. BASE has no thinGap: a lab check
    // runs the old plate unless it asks for the thin one (PLAN 18a).
    if ((over.thinGap ?? 0) > 0.5) await l.solver.prepareThinGap();
    for (let k = 0; k < n; k++) {
      l.time += 1 / 60;
      const p = { ...BASE, ...over, time: l.time } as GpuStepParams;
      l.solver.step(p, flushed && k === 0);
      l.magnets = magnetsOnPlate(p);
      l.cellClock = advanceCellClock(l.cellClock, stepDisplacement(p.dt, p.advection, l.N));
    }
    await l.solver['device'].queue.onSubmittedWorkDone();
  },
  addPhase(x: number, y: number, r: number, a: number) { lab!.solver.addPhase(x, y, r, a); },
  /**
   * A pour of a shelf bottle (PLAN 18c, 18d), as the app's onDeposit makes it:
   * its liquid into the species field (null if the bottle lays none, the
   * clear liquid's own), and with `volume` its volume into the thin solve.
   * Without it the pool is laid as though poured long ago (`npm run thick`).
   */
  addSpecies(x: number, y: number, r: number, take: number, bottle: string, volume = false) {
    const sp = speciesOf(DEFAULT_LIQUID_TYPES.find((l) => l.id === bottle)?.behaviour);
    lab!.solver.pour(x, y, r, take, sp, volume);
    return sp;
  },
  async speciesShare() { return lab!.solver.speciesShare(); },
  /** The standing layer's kernels built now, and how many steps it has run in (`npm run standing`). */
  prepareFilm() { return lab!.solver.prepareFilm(); },
  filmSteps() { return lab!.solver.filmSteps; },
  /** Thin Gap's viscosity for a Thickness, and the ferrofluid's (src/gpu/fluid.ts), so a check never copies either. */
  thinGapViscosity,
  /** The real seconds a lab step takes, for `npm run thick`'s kept share and `npm run flush`'s pours. */
  stepSeconds: BASE.magnetSeconds ?? 1 / 60,
  ferroViscosity: FERRO_NU,
  /** A shipped look's settings and the shape it pours its ferrofluid in, as the app reads them. */
  look(id: string) {
    const p = PRESETS.find(q => q.id === id);
    if (!p) throw new Error(`no look ${id}`);
    // Over the defaults, as the app lays a look: a key the look leaves out
    // is the default there, not off.
    return { settings: { ...DEFAULT_SETTINGS, ...p.settings }, pour: phasePourShape(id), dyes: (PRESET_CONTRACTS[id] ?? []).map((i) => ({ ...PALETTE_RGB[i] })) };
  },
  /** Clock Glass's oil bodies as the app lays them (src/lib/oilLay.ts), from a seeded stream of the lab's own. */
  clockGlassBodies(seed: number, dyes: number) {
    let s = seed;
    return clockGlassBodies(() => (s = s * 16807 % 2147483647) / 2147483647, dyes);
  },
  /** One cell of Clock Glass's lay, as seedPreset lays it (src/lib/oilLay.ts). */
  clockGlassCell,
  /** Every shipped look's id, for a check that asks something of all of them. */
  lookIds() { return PRESETS.map(p => p.id); },
  /** A palette colour as the app lays it: the dye's absorbance per unit (lib/dye.ts). */
  dyeOf(rgb: [number, number, number]) { return dyeAbsorbances(...rgb); },
  /** The palette, and each look's dyes with how many of them are on its plate at once (presetPlate.ts). */
  palette() {
    return {
      colours: PALETTE_RGB.map(c => [c.r, c.g, c.b]),
      looks: PRESETS.map(p => {
        const c = PRESET_CONTRACTS[p.id];
        const journey = ((p.settings.hueJourney ?? DEFAULT_SETTINGS.hueJourney) ?? 0) > 0;
        return { id: p.id, dyes: c ? c.length : 0, onPlate: c ? dyesOnPlate(c.length, journey) : 0 };
      }),
    };
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
  async field(which: 'dye' | 'vel' | 'oilDye' | 'species') { return Array.from(await lab!.solver.readField(which)); },
  /**
   * The clear film (PLAN §20b), read back: its grid, and its thickness and
   * solvent cell by cell (n × n each), or null with no film on the plate.
   */
  async film() {
    const f = await lab!.solver.readFilm();
    if (!f) return null;
    const h = new Array(f.n * f.n), g = new Array(f.n * f.n);
    for (let k = 0; k < f.n * f.n; k++) {
      h[k] = f.data[k * 4]; g[k] = f.data[k * 4 + 1];
      // A film gone non-finite reads as no hole and no piece: loud instead.
      if (!Number.isFinite(h[k]) || !Number.isFinite(g[k])) throw new Error(`film: non-finite at cell ${k}`);
    }
    return { n: f.n, h, g };
  },
  /** A pour onto the clear film, as the app's onDeposit makes one: plate units, clear oil and solvent. */
  addFilm(x: number, y: number, r: number, film: number, solvent: number) {
    // Loud, not a quiet nothing: a check pouring on a plate with no film is a check measuring nothing.
    if (!lab!.solver.filmOn) throw new Error('addFilm: no film on the plate (step once with clearFilm up first)');
    lab!.solver.addFilm(x, y, r, { film, solvent });
  },
  /** The thickest film Clear Film lays, as a share of the gap (FILM_MAX in src/gpu/fluid.ts). */
  filmMax: FILM_MAX,
  async phase() { const f = await lab!.solver.readPhase(); return f ? { n: f.n, data: Array.from(f.data) } : null; },
  /** The spun dish's swirl on its own grid (readSwirl): `npm run dish`. */
  async swirl() { const f = await lab!.solver.readSwirl(); return { m: f.m, data: Array.from(f.data) }; },
  async squeeze() { const f = await lab!.solver.readSqueeze(); return f ? { n: f.n, gap: Array.from(f.gap), rate: Array.from(f.rate) } : null; },
  solver() { return lab!.solver; },
  /**
   * The governor moving the grid, as the app's FluidSimulation moves it (PLAN
   * 9w): the old solver hands over, is let go, and a new one on the same
   * device opens cleared and takes the carry. `carry: false` is the move as
   * it was before 9w, nothing handed over, for a check's control. The copies
   * are let go once the new solver has run, as the app lets them go once it
   * has spoken. What the app carries through the CPU (the dye, the flow) is
   * not this, and not moved here.
   */
  async regrid(N: number, carry = true) {
    const l = lab!;
    const old = l.solver;
    const device = old['device'] as GPUDevice;
    const handed = carry ? old.handOver() : null;
    old.dispose();
    const solver = new WebGPUFluid(device, N, l.L, { float32Filterable: device.features.has('float32-filterable') });
    solver.clear();
    const taken = handed ? solver.takeOver(handed) : false;
    l.solver = solver; l.N = N;
    await device.queue.onSubmittedWorkDone();
    handed?.destroy();
    return { taken, handed: !!handed };
  },
  /**
   * A carry offered to a solver on another device, as after a lost device:
   * handed over from this solver, then a fresh lab (its own device) asked to
   * take it. The fresh lab is what is left open.
   */
  async strangerTakes(N: number) {
    const handed = lab!.solver.handOver();
    await api.create(N);
    const taken = handed ? lab!.solver.takeOver(handed) : false;
    handed?.destroy();
    return taken;
  },
  /** The mix or the reactions (readChemistry), as plain arrays; null when the solver has none. */
  async chemistry(which: 'mix' | 'rxn' | 'lies') { const f = await lab!.solver.readChemistry(which); return f ? { n: f.n, data: Array.from(f.data) } : null; },
  /** The oil's share of the dye, pour by pour (Oil Bodies' budget). */
  oilCover() { return lab!.solver.oilCover; },
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
  /**
   * A hand's Blow on the colour, as blowWind runs it on the app's mirror
   * (lib/handCarry.ts: blowDye): `dye` is the mirror (rgba, L x L), the
   * hand in its cells. With `apply` the take and the put go into the lab's
   * own deltas, landing on the next flush as the app's do; either way it
   * returns what moved, and the take and the put cell by cell.
   */
  blowDye(dye: number[], x: number, y: number, radius: number, strength: number, dx: number, dy: number, apply = true) {
    const { L, dyeAdd, mul } = lab!;
    const out = { mul: new Float32Array(L * L).fill(1), density: new Float32Array(L * L), densityR: new Float32Array(L * L), densityG: new Float32Array(L * L), densityB: new Float32Array(L * L) };
    const moved = blowDye(dye, L, x, y, radius, strength, dx, dy, out);
    if (apply) {
      for (let i = 0; i < L * L; i++) {
        mul[i] *= out.mul[i];
        dyeAdd[i * 4] += out.densityR[i]; dyeAdd[i * 4 + 1] += out.densityG[i]; dyeAdd[i * 4 + 2] += out.densityB[i]; dyeAdd[i * 4 + 3] += out.density[i];
      }
    }
    return { moved, mul: Array.from(out.mul), density: Array.from(out.density) };
  },
  /** The Blow's size and strength as the app's hands give them (lib/handCarry.ts). */
  BLOW_RADIUS, BLOW_STRENGTH, remoteBlowRadius,
  /** The oil's half of the same Blow (blowOil), through the solver, as blowWind runs it. */
  blowOil(x: number, y: number, radius: number, strength: number, dx: number, dy: number, N: number) { blowOil(lab!.solver, x, y, radius, strength, dx, dy, N); },
  /**
   * The old Blow on the colour, for the control (before PLAN.md §15c): a
   * puff (blowAir) thinned every cell under it by 0.8, a directed blow (a
   * remote hand's, blowDirected) by 0.15 at its middle falling to none at
   * its rim. One step's worth.
   */
  eraseDye(x: number, y: number, radius: number, directed = false) {
    const { L, mul } = lab!;
    const r = Math.round(radius * L / 128), r2 = r * r;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d2 = i * i + j * j, nx = x + i, ny = y + j;
      if (nx <= 0 || ny <= 0 || nx >= L - 1 || ny >= L - 1) continue;
      if (directed) { if (d2 < r2) mul[nx + ny * L] *= 1 - 0.15 * (1 - Math.sqrt(d2) / r); continue; }
      if (d2 >= r2 || d2 === 0) continue;
      mul[nx + ny * L] *= 0.8;
    }
  },
  /** The plate renderer, for checks on what it derives from the fields. */
  WebGPUPlate,
  /**
   * The magnet's field as the solver and the plate both include it
   * (wgsl/spikes.ts with wgsl/magnetDisc.ts), and the TypeScript the solver
   * ramps on, for `npm run disc` to run the shader's own text against the
   * physics.
   */
  SPIKES_WGSL, fieldOnAxis, SPIKE_ONSET, SPIKE_FULL, SPIKE_B_REF, MAGNET_RADIUS, magnetReach, magnetDepth,
  /** The oil beads and drops, to lay a field on the lab's plate (`cam.beadMask` below). */
  BeadField, rasterDrops,
  /**
   * The projector's pass alone (gpu/output.ts), on pictures made to order:
   * each source a ramp from one colour to another, left to right, or top to
   * bottom with a third entry 'y' (a flat colour when the two are the same),
   * `cfg` the output config as Settings stores it. For `npm run beams`
   * (PLAN.md §16c): with a picture whose every pixel is known, what two
   * beams give where they cross can be read against what each gives alone.
   *
   * The pictures are written the way the app's passes leave the frame for
   * the projector, rows the other way up from a canvas (the display's
   * FLIP_Y), so the projection of a whole picture is the picture upright:
   * the ramp's first colour at the top. Gives back the pixels and how many
   * quads the pass drew, so a check can tell its surfaces from the full
   * frame the pass falls back to when there are none.
   */
  async projector(size: number, cfg: unknown, pictures: Partial<Record<'wall' | 'front' | 'back' | 'film', [number[], number[], 'y'?]>>) {
    const device = lab!.solver['device'] as GPUDevice;
    const out = new WebGPUOutput(device, 'rgba8unorm');
    const quads = fillOutputUniforms(out.pack, normalizeOutput(cfg), size, size);
    const enc = device.createCommandEncoder();
    const ramp = (view: GPUTextureView, [a, b, axis]: [number[], number[], 'y'?]) => {
      const v = (c: number[]) => `vec3f(${c.map(x => x.toFixed(6)).join(', ')})`;
      const module = device.createShaderModule({ code: `
        @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
          let p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
          return vec4f(p[i], 0.0, 1.0);
        }
        @fragment fn fs(@builtin(position) at: vec4f) -> @location(0) vec4f {
          return vec4f(mix(${v(a)}, ${v(b)}, ${axis === 'y' ? `1.0 - at.y / ${size.toFixed(1)}` : `at.x / ${size.toFixed(1)}`}), 1.0);
        }` });
      const pipe = device.createRenderPipeline({
        layout: 'auto', vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list' },
      });
      const pass = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      pass.setPipeline(pipe); pass.draw(3); pass.end();
    };
    ramp(out.sceneView(size, size), pictures.wall ?? [[0, 0, 0], [0, 0, 0]]);
    for (const kind of ['front', 'back', 'film'] as const) {
      const p = pictures[kind];
      if (p) ramp(out.sourceView(kind, size, size), p);
    }
    const target = device.createTexture({ size: [size, size], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    out.draw(enc, target.createView(), quads);
    const row = Math.ceil(size * 4 / 256) * 256;
    const buf = device.createBuffer({ size: row * size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyTextureToBuffer({ texture: target }, { buffer: buf, bytesPerRow: row }, [size, size]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const px = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) px.set(src.subarray(y * row, y * row + size * 4), y * size * 4);
    buf.unmap(); buf.destroy(); target.destroy(); out.dispose();
    return { pixels: Array.from(px), quads };
  },
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
      /*
        Projectors' own sources (PLAN.md §16b). Each is the plate's display
        drawn again with that source's uniforms, after the wall's draw and in
        the same encoder, as the app's frame does: the source reuses what the
        wall's draw packed and derived, and one encoder is where two displays
        could be handed each other's uniforms (every writeBuffer lands before
        the command buffer runs). With sources asked for, the render gives
        back `{ wall, front?, back?, film? }` in place of the wall's pixels.
      */
      sources?: ('front' | 'back' | 'film')[];
      /** Draw the wall as it is drawn into a texture (see `flipped` below); with sources, always. */
      flip?: boolean;
      /*
        The pigment's coordinates as the app hands them (the solver's grain
        field, carried by the flow), rather than none. Without it the grain
        is one value over the whole plate, which hides what the flow does to
        it (npm run pixels, the speckle at dye edges).
      */
      grain?: boolean;
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
    const view: PlateView = {
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
    };
    const fluids = cam.backPlate ? [{ gpu: l.solver as never }, { gpu: l.solver as never }] : [{ gpu: l.solver as never }];
    fillPlateUniforms(plate.pack, { view, fluids, width: size, height: size, derived: true, grid: l.N });
    const target = device.createTexture({ size: [size, size], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const enc = device.createCommandEncoder();
    // Asked for the grain and there is none (an adapter without
    // float32-filterable): the plate would read a blank 1×1 texture and draw
    // one grain value everywhere, which a check of the grain would take for
    // a grain. Say so instead.
    if (cam.grain && !l.solver.grainTexture) throw new Error('lab.render: grain asked for, but this adapter has no grain field');
    const layer = { dye: l.solver['dye'].read, velForced: l.solver['velForced'], grain: cam.grain ? l.solver.grainTexture : null, particles: null, air: (cam.bubbles ?? 0) > 0 ? (l.solver as unknown as { air?: { field: GPUTexture } }).air?.field ?? null : null, view: cam.view === false ? null : l.solver.fields.view };
    const layers = cam.backPlate ? [layer, { ...layer, air: null }] : [layer];
    /*
      With sources, the wall goes to a texture as the app's does when a
      projector is on (the output pass reads it), and a texture's rows run the
      other way from a canvas's, so the display flips (FLIP_Y). The sources are
      always drawn so. The pictures are turned upright again as they are read,
      as the output pass does. The dither is laid by the pixel's place on the
      target, so a flipped picture turned upright is a step or two off an
      unflipped one here and there: a wall to compare with a source is drawn
      flipped too (`flip`).
    */
    const flipped = cam.flip || !!cam.sources?.length;
    plate.draw(enc, target.createView(), { width: size, height: size }, layers, undefined, flipped);
    // As the app fills them: the frame's settings with the other rows at
    // nothing, no camera and no chain, so each display does its own finish.
    const owns = (cam.sources ?? []).map((kind) => {
      fillPlateUniforms(plate.sourcePack(kind), {
        view: { ...view, settings: sourceSettings(kind, view.settings) }, fluids,
        width: size, height: size, derived: true, grid: l.N, cameraOn: false, postChain: false,
      });
      const tex = device.createTexture({ size: [size, size], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      plate.drawSource(enc, kind, tex.createView(), { width: size, height: size }, layers, undefined, 'rgba8unorm');
      return { kind: kind as string, tex };
    });
    const row = Math.ceil(size * 4 / 256) * 256;
    const reads = [{ kind: 'wall', tex: target }, ...owns].map(({ kind, tex }) => {
      const buf = device.createBuffer({ size: row * size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [size, size]);
      return { kind, tex, buf };
    });
    device.queue.submit([enc.finish()]);
    const pictures: Record<string, number[]> = {};
    for (const { kind, tex, buf } of reads) {
      await buf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(buf.getMappedRange());
      const out = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++) {
        const from = flipped ? size - 1 - y : y;
        out.set(src.subarray(from * row, from * row + size * 4), y * size * 4);
      }
      buf.unmap(); buf.destroy(); tex.destroy();
      pictures[kind] = Array.from(out);
    }
    plate.dispose();
    return cam.sources ? pictures : pictures.wall;
  },
};
(window as unknown as { lab: typeof api }).lab = api;
(window as unknown as { labReady: boolean }).labReady = true;
