/**
 * Both solvers, the same inputs, compared (docs/webgpu-plan.md, P2's gate).
 *
 * `parity.html?n=256&steps=1` builds the WebGL solver and the WebGPU one,
 * pours the same dye and velocity into each, steps them the same number of
 * times with the same parameters, and reads both fields back at the logical
 * grid. `scripts/parity.mjs` drives it and judges the numbers.
 *
 * The fluid is chaotic, so only the first step or two can be compared pixel by
 * pixel; after that the check is statistical (dye mass, mean speed), which is
 * what the plan asks for.
 */

import { GpuFluid, type GpuStepParams } from '../lib/gpuFluid';
import { ChemistryField } from '../lib/chemistry';
import { WebGPUFluid } from './fluid';
import { WebGPUChemistry } from './chemistry';
import { SPLAT_FLOATS, SplatList } from './splats';
import { PipelineCache } from './kit';
import { isGpuFailure, requestGpu } from './device';

const q = new URLSearchParams(location.search);
const N = Number(q.get('n') ?? 256);
const L = 192;
const STEPS = Number(q.get('steps') ?? 1);
const out: Record<string, unknown> = { n: N, l: L, steps: STEPS };
const done = () => { (window as unknown as { __parity: unknown }).__parity = { ...out, done: true }; document.body.textContent = JSON.stringify(out, null, 2); };

/** The same start on both: a few blobs of dye, a swirl of velocity, one press on the glass. */
function seed() {
  const dyeAdd = new Float32Array(L * L * 4);
  const velAdd = new Float32Array(L * L * 4);
  const dyeMul = new Float32Array(L * L).fill(1);
  const blob = (cx: number, cy: number, r: number, col: [number, number, number]) => {
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const w = Math.exp(-(d * d) / (2 * (r / 2) ** 2));
      const i = (y * L + x) * 4;
      dyeAdd[i] += col[0] * w; dyeAdd[i + 1] += col[1] * w; dyeAdd[i + 2] += col[2] * w; dyeAdd[i + 3] += w;
    }
  };
  blob(70, 96, 26, [1.2, 0.2, 0.1]);
  blob(122, 96, 26, [0.1, 0.4, 1.3]);
  blob(96, 130, 18, [0.9, 0.8, 0.1]);
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
    const u = (x + 0.5) / L - 0.5, v = (y + 0.5) / L - 0.5;
    const r = Math.hypot(u, v) + 1e-3;
    const w = Math.exp(-r * 8) * 0.0015;
    const i = (y * L + x) * 4;
    velAdd[i] = -v / r * w;
    velAdd[i + 1] = u / r * w;
    velAdd[i + 2] = Math.max(0, 0.4 - r * 2) * 0.05;     // a warm patch in the middle
    velAdd[i + 3] = x > 80 && x < 100 && y > 80 && y < 100 ? -0.01 : 0;   // a press on the glass
  }
  return { dyeAdd, velAdd, dyeMul };
}

/** A step with every force on, so no pass is left untested. */
const PARAMS: GpuStepParams = {
  dt: 0.016, visc: 1.0, nu: 0.00002, diff: 0.00002, buoyancy: 0.5, gravity: 0.02,
  tiltX: 0.0005, tiltY: -0.0004, advection: 1, sharpness: 0.4, damping: 0.985, heatDecay: 0.97,
  turbScale: 0.4, turbDetail: 3, spin: 0.015, surfaceTension: 0.3, fingering: 0.4,
  vibIntensity: 0.002, vibFrequency: 0.6, drip: 0.05, smearX: 0.0002, smearY: -0.0001, air: 0.3,
  evapFactor: 0.999, time: 12.5,
  currentDamp: 0.97, currentBuoy: 0.0006, rockX: 0.0004, rockY: -0.0003, currentGrav: 0.0005,
  twist: 0.0003, meanDensity: 0.3, maxCurrent: 0.002,
};

/** How far apart two fields are, against how big the field is. */
function compare(a: Float32Array, b: Float32Array, channels = 4) {
  let maxAbs = 0, sumAbs = 0, sumSqA = 0, n = 0, worst = -1;
  for (let i = 0; i < a.length; i++) {
    if (channels < 4 && i % 4 >= channels) continue;
    const d = Math.abs(a[i] - b[i]);
    if (d > maxAbs) { maxAbs = d; worst = i; }
    sumAbs += d;
    sumSqA += a[i] * a[i];
    n++;
  }
  const rms = Math.sqrt(sumSqA / n);
  return {
    rms: +rms.toExponential(3),
    maxAbs: +maxAbs.toExponential(3),
    meanAbs: +(sumAbs / n).toExponential(3),
    maxRel: +(maxAbs / (rms || 1e-12)).toExponential(3),
    meanRel: +((sumAbs / n) / (rms || 1e-12)).toExponential(3),
    worstAt: worst,
  };
}

/**
 * The splat records, rasterised onto the logical grid the way the CPU used
 * to paint them — the same falloff, evaluated per cell. This is what the
 * splat pass has to agree with.
 */
function rasterise(list: SplatList, size: number) {
  const dyeAdd = new Float32Array(size * size * 4);
  const velAdd = new Float32Array(size * size * 4);
  const mul = new Float32Array(size * size).fill(1);
  const r = list.records;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x + 0.5, py = y + 0.5;
    const i = y * size + x, i4 = i * 4;
    for (let k = 0; k < list.count; k++) {
      const o = k * SPLAT_FLOATS;
      const radius = r[o + 2];
      let d: number;
      if (r[o + 3] < 0.5) d = Math.hypot(px - r[o], py - r[o + 1]);
      else {
        const ex = r[o + 14] - r[o], ey = r[o + 15] - r[o + 1];
        const t = Math.max(0, Math.min(1, ((px - r[o]) * ex + (py - r[o + 1]) * ey) / Math.max(ex * ex + ey * ey, 0.0001)));
        d = Math.hypot(px - (r[o] + ex * t), py - (r[o + 1] + ey * t));
      }
      if (d > radius) continue;
      const mode = r[o + 13];
      const t = 1 - d / Math.max(radius, 0.0001);
      const sg = Math.max(radius * 0.5, 0.0001);
      const w = mode < 0.5 ? 1 : mode < 1.5 ? t : mode < 2.5 ? t * t : Math.exp(-(d * d) / (2 * sg * sg));
      if (w <= 0) continue;
      for (let c = 0; c < 4; c++) { dyeAdd[i4 + c] += r[o + 4 + c] * w; velAdd[i4 + c] += r[o + 8 + c] * w; }
      mul[i] *= 1 - (1 - r[o + 12]) * w;
    }
  }
  return { dyeAdd, velAdd, mul };
}

const sum = (f: Float32Array) => { let s = 0; for (let i = 0; i < f.length; i++) s += f[i]; return s; };
const mass = (f: Float32Array) => { let s = 0; for (let i = 3; i < f.length; i += 4) s += f[i]; return s; };
const speed = (f: Float32Array) => { let s = 0; for (let i = 0; i < f.length; i += 4) s += Math.hypot(f[i], f[i + 1]); return s / (f.length / 4); };

async function main() {
  const { dyeAdd, velAdd, dyeMul } = seed();

  // ── WebGL ────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) { out.error = 'no webgl2'; return done(); }
  if (!GpuFluid.isSupported(gl)) { out.error = 'the WebGL solver is unsupported here'; return done(); }
  const glFluid = new GpuFluid(gl, N, L);
  glFluid.applyDeltas(dyeAdd, velAdd, dyeMul, PARAMS.dt);
  for (let i = 0; i < STEPS; i++) glFluid.step({ ...PARAMS, time: PARAMS.time + i * PARAMS.dt }, i === 0);
  const glOut = glFluid.readback();
  const glDye = glOut.dye.slice(), glVel = glOut.vel.slice();

  // ── WebGPU ───────────────────────────────────────────────────────
  const gpu = await requestGpu();
  if (isGpuFailure(gpu)) { out.error = `${gpu.failure}: ${gpu.detail}`; return done(); }
  out.adapter = gpu.label;
  out.float32Filterable = gpu.float32Filterable;
  const errors: string[] = [];
  gpu.device.addEventListener('uncapturederror', (e) => errors.push(String((e as GPUUncapturedErrorEvent).error?.message ?? e).slice(0, 300)));
  const gpuFluid = new WebGPUFluid(gpu.device, N, L, { float32Filterable: gpu.float32Filterable });
  gpuFluid.applyDeltas(dyeAdd, velAdd, dyeMul, PARAMS.dt);
  for (let i = 0; i < STEPS; i++) gpuFluid.step({ ...PARAMS, time: PARAMS.time + i * PARAMS.dt }, i === 0);
  const gpuDye = await gpuFluid.readField('dye');
  const gpuVel = await gpuFluid.readField('vel');

  // ── The reaction ─────────────────────────────────────────────────
  // Same two seeds, same regime, same count: the activator fields must
  // agree cell for cell (Gray–Scott is diffusive, so it does not chase
  // rounding the way the fluid does).
  {
    const seeds: [number, number, number][] = [[0.3, 0.4, 5], [0.68, 0.62, 3.5]];
    const ITERS = 24;
    const cpu = new ChemistryField(L);
    cpu.u.fill(1); cpu.v.fill(0);                  // a fixed start, not reset()'s random one
    for (const s of seeds) cpu.seed(...s);
    cpu.step(ITERS);

    const chem = new WebGPUChemistry(gpu.device, new PipelineCache(gpu.device), L);
    const enc = gpu.device.createCommandEncoder({ label: 'chemistry' });
    const pass = enc.beginComputePass({ label: 'chemistry' });
    for (const s of seeds) chem.seed(pass, ...s);
    chem.step(pass, ITERS);
    pass.end();
    gpu.device.queue.submit([enc.finish()]);
    const got = await chem.read();
    const gpuAct = new Float32Array(L * L);
    for (let i = 0; i < gpuAct.length; i++) gpuAct[i] = got[i * 2 + 1];
    out.chem = compare(cpu.activator, gpuAct);
    out.chemAlive = { cpu: +sum(cpu.activator).toFixed(3), webgpu: +sum(gpuAct).toFixed(3) };

    // And the dye it lays down: once as the CPU did it — a scan of the
    // activator into the delta arrays — and once as the deposit pass.
    if (N === L) {
      const AMOUNT = 0.02, THRESHOLD = 0.22;
      const colour: [number, number, number] = [0.8, 0.35, 0.95];
      const dyeAdd = new Float32Array(L * L * 4);
      const eps = 0.002;
      const absorb = colour.map((c) => -Math.log(Math.max(eps, c)));
      for (let i = 0; i < L * L; i++) {
        const a = cpu.activator[i];
        if (a <= THRESHOLD) continue;
        const w = AMOUNT * (a - THRESHOLD);
        dyeAdd[i * 4] = absorb[0] * w; dyeAdd[i * 4 + 1] = absorb[1] * w; dyeAdd[i * 4 + 2] = absorb[2] * w;
        dyeAdd[i * 4 + 3] = w;
      }
      const opts = { float32Filterable: gpu.float32Filterable };
      const viaCpu = new WebGPUFluid(gpu.device, L, L, opts);
      viaCpu.applyDeltas(dyeAdd, new Float32Array(L * L * 4), new Float32Array(L * L).fill(1), PARAMS.dt);
      const viaPass = new WebGPUFluid(gpu.device, L, L, opts);
      viaPass.depositChemistry(chem.texture, AMOUNT, colour, THRESHOLD);
      const laid = await viaPass.readField('dye');
      out.chemDye = compare(await viaCpu.readField('dye'), laid);
      out.chemDyeMass = +mass(laid).toFixed(3);
      viaCpu.dispose();
      viaPass.dispose();
    }
    chem.dispose();
  }

  // ── The pours ────────────────────────────────────────────────────
  // The same drops, strokes and presses, once as CPU arrays and once as
  // splats laid down on the GPU. At N = L the two are the same grid, so the
  // fields must match; what is being tested is the path, not the geometry.
  if (N === L) {
    const list = new SplatList();
    list.disc(60, 70, 9, { amount: 0.8, colour: [1, 0.2, 0.1], falloff: 'squared', temp: 0.02 });
    list.disc(120, 100, 14, { amount: 0.5, colour: [0.2, 0.4, 1], falloff: 'gaussian', vx: 0.0012, vy: -0.0005 });
    list.disc(96, 40, 20, { amount: 0, mul: 0.4, gap: -0.01, falloff: 'linear' });         // a press
    list.line(30, 150, 90, 130, 4, { amount: 0.6, colour: [0.9, 0.9, 0.2], falloff: 'linear', vx: 0.0004 });
    const cpu = rasterise(list, L);

    const opts = { float32Filterable: gpu.float32Filterable };
    const viaCpu = new WebGPUFluid(gpu.device, L, L, opts);
    viaCpu.applyDeltas(cpu.dyeAdd, cpu.velAdd, cpu.mul, PARAMS.dt);
    viaCpu.step(PARAMS, true);
    const viaSplat = new WebGPUFluid(gpu.device, L, L, opts);
    viaSplat.applySplats(list, PARAMS.dt);
    viaSplat.step(PARAMS, true);
    out.splatDye = compare(await viaCpu.readField('dye'), await viaSplat.readField('dye'));
    out.splatVel = compare(await viaCpu.readField('vel'), await viaSplat.readField('vel'), 2);
    out.splatPoured = { records: list.count, mass: +mass(await viaSplat.readField('dye')).toFixed(2) };
    viaCpu.dispose();
    viaSplat.dispose();

    // ── A picture poured ───────────────────────────────────────────
    // Eight by eight, red on the left and blue on the right, into the box
    // the app pours pictures into. There is no CPU twin to compare against —
    // the point of the pass is that it samples the source rather than the
    // 120×72 the CPU could manage — so the check is that the dye lands
    // inside the box, in the right colours, in the right quantity.
    const BOX: [number, number, number, number] = [0.19, 0.31, 0.81, 0.69];
    const src = new ImageData(8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const i = (y * 8 + x) * 4;
      src.data[i + (x < 4 ? 0 : 2)] = 255;
      src.data[i + 3] = 255;
    }
    const pour = new WebGPUFluid(gpu.device, L, L, opts);
    pour.pourImage(src, BOX, { strength: 1.5, floor: 0.5, flipY: false });
    const got = await pour.readField('dye');
    const at = (nx: number, ny: number) => {
      const i = (Math.round(ny * L) * L + Math.round(nx * L)) * 4;
      return [got[i], got[i + 1], got[i + 2], got[i + 3]];
    };
    let inside = 0, outside = 0;
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
      const u = (x + 0.5) / L, v = (y + 0.5) / L;
      const d = got[(y * L + x) * 4 + 3];
      if (u > BOX[0] && u < BOX[2] && v > BOX[1] && v < BOX[3]) inside += d; else outside += d;
    }
    // (0.5 + 1.5·luma) per cell, red luma 0.299 and blue 0.114, over the box.
    const cells = (BOX[2] - BOX[0]) * (BOX[3] - BOX[1]) * L * L;
    out.pour = {
      inside: +inside.toFixed(2),
      outside: +outside.toFixed(4),
      expected: +(cells * ((0.5 + 1.5 * 0.299) + (0.5 + 1.5 * 0.114)) / 2).toFixed(2),
      red: at(0.3, 0.5).map((v) => +v.toFixed(3)),
      blue: at(0.7, 0.5).map((v) => +v.toFixed(3)),
    };
    pour.dispose();
  }

  // ── The measurements ─────────────────────────────────────────────
  // The 32-byte answer against the same sums taken over the field itself.
  {
    const m = await gpuFluid.measureNow();
    const area = gpuDye.length / 4;
    let sd = 0, sr = 0, sg = 0, sb = 0, maxD = 0, maxV = 0;
    for (let i = 0; i < gpuDye.length; i += 4) {
      sr += gpuDye[i]; sg += gpuDye[i + 1]; sb += gpuDye[i + 2]; sd += gpuDye[i + 3];
      maxD = Math.max(maxD, gpuDye[i + 3]);
      maxV = Math.max(maxV, Math.hypot(gpuVel[i], gpuVel[i + 1]));
    }
    const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);

    // Again after the field has moved on, and after the dye has changed hands:
    // a measurement bound once to one half of the ping-pong would keep
    // answering about the plate that half still holds.
    for (let i = 0; i < 13; i++) gpuFluid.step({ ...PARAMS, time: PARAMS.time + i * PARAMS.dt }, true);
    const m2 = await gpuFluid.measureNow();
    const moved = await gpuFluid.readField('dye');
    let sd2 = 0;
    for (let i = 3; i < moved.length; i += 4) sd2 += moved[i];
    out.measureAfterSteps = {
      gpu: m2.meanDensity, field: sd2 / area,
      rel: +rel(m2.meanDensity, sd2 / area).toExponential(2),
      changed: +Math.abs(m2.meanDensity - m.meanDensity).toExponential(2),
    };

    // And the ring the show actually uses: with the plate held still, the
    // numbers it hands back have to arrive at the same answer.
    let ringed = gpuFluid.measure();
    for (let i = 0; i < 100 && ringed.at < 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
      ringed = gpuFluid.measure();
    }
    const firstAt = ringed.at;
    for (let i = 0; i < 100 && ringed.at <= firstAt + 1; i++) {
      await new Promise((r) => setTimeout(r, 20));
      ringed = gpuFluid.measure();
    }
    out.measureRing = {
      gpu: ringed.meanDensity, exact: m2.meanDensity,
      rel: +rel(ringed.meanDensity, m2.meanDensity).toExponential(2),
      copies: ringed.at,
    };

    out.measure = {
      landed: gpuFluid.measured,
      meanDensity: { gpu: m.meanDensity, field: sd / area, rel: +rel(m.meanDensity, sd / area).toExponential(2) },
      meanColor: { rel: +Math.max(rel(m.meanColor[0], sr / area), rel(m.meanColor[1], sg / area), rel(m.meanColor[2], sb / area)).toExponential(2) },
      maxDensity: { gpu: m.maxDensity, field: maxD, rel: +rel(m.maxDensity, maxD).toExponential(2) },
      maxSpeed: { gpu: m.maxSpeed, field: maxV, rel: +rel(m.maxSpeed, maxV).toExponential(2) },
    };
  }

  out.dye = compare(glDye, gpuDye);
  out.dyeDensity = compare(glDye.filter((_, i) => i % 4 === 3), gpuDye.filter((_, i) => i % 4 === 3), 4);
  out.vel = compare(glVel, gpuVel, 2);
  out.statistics = {
    dyeMass: { webgl: +mass(glDye).toFixed(2), webgpu: +mass(gpuDye).toFixed(2) },
    meanSpeed: { webgl: +speed(glVel).toExponential(3), webgpu: +speed(gpuVel).toExponential(3) },
  };
  // ── The drain ────────────────────────────────────────────────────
  // The plate emptying at the end of a show: the same 45 frames through both,
  // judged by how much dye is left (the spiral is chaotic, the emptying is not).
  {
    const FRAMES = 45;
    for (let i = 0; i < FRAMES; i++) {
      const t = (i + 1) / FRAMES;
      glFluid.drainStep(t);
      gpuFluid.drainStep(t);
    }
    const leftGl = mass(glFluid.readback().dye);
    const leftGpu = mass(await gpuFluid.readField('dye'));
    out.drain = {
      before: { webgl: +mass(glDye).toFixed(2), webgpu: +mass(gpuDye).toFixed(2) },
      after: { webgl: +leftGl.toPrecision(4), webgpu: +leftGpu.toPrecision(4) },
    };
  }

  if (errors.length) out.errors = errors.slice(0, 4);
  glFluid.dispose();
  gpuFluid.dispose();
  done();
}

main().catch((e) => { out.error = String((e as Error)?.stack ?? e).slice(0, 500); done(); });
