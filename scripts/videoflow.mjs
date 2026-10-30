#!/usr/bin/env node
/**
 * The video pour on the GPU (PLAN.md 14ab-2).
 *
 *   npm run videoflow                (both halves; the lab's wants an adapter
 *                                     that computes, PW_WEBGPU=1 off a Mac)
 *   npm run videoflow -- --node      (the app's side only)
 *   npm run videoflow -- --video     (the pour from a <video> element only: the Mac's)
 *
 * Read in the code on 2026-10-24 (14ab): a poured video was drawn into a 192²
 * canvas every frame and read back with getImageData, kept as a fresh 147 KB
 * copy for the next frame's motion, and every one of its 36,000 cells went
 * through `addDensity` and `addVelocity`; on the GPU solver that also marked
 * every row written, so each step sent up to the whole 1.3 MB of deltas
 * across. Now the WebGPU solver takes the frame as a texture and works out the
 * same dye and flow in two compute passes (`videoSample`, `videoFlow`), held
 * until the step's flush adds them to the CPU's deltas, where the loop's writes
 * would have been.
 *
 * The feature is "the plate is handed what the loop handed it, without the
 * loop", so:
 *
 * The app's side, in node: the real FluidSimulation, and the app's own call
 * (`pourVideoFrame` in lib/videoFlow.ts, which LiquidVisualizer makes each
 * frame), on a solver that keeps what it is handed:
 *   - on a solver with no pass of its own (the WebGL one), a frame goes
 *     through the loop as before, and what the step hands across is the
 *     reference the lab's half is held to; the loop leaves the grid's edge
 *     alone;
 *   - on one with it, a frame writes nothing into the CPU's arrays, the real
 *     `step` still flushes for it and sends no row the CPU did not write, a
 *     tool's few cells in the same frame go by their own rows, a read of the
 *     plate before the step flushes it first, and a pass that poured nothing
 *     hands the frame to the loop;
 *   - each video's first frame is fresh (the next cartoon on the same element
 *     is not differenced against the last one's end), on both ways;
 *   - the CPU's time a frame and the bytes a step, before and after.
 *
 * The lab's side, the real solver: the same frames as canvases, poured with
 * `pourVideo`, and the deltas the fold takes (the full-grid delta textures
 * after the flush's upsample) against the same flush of the loop's arrays.
 *   - two frames between two steps (the second differenced against the
 *     first, the two added), at the grid's size, at four times it a side and
 *     at four by two, each cell's block dithered so its mean is the cell's
 *     value and no one tap is (the footprint's mean asked about);
 *   - a frame a step: the flush takes the held frames once, and the next
 *     frame is differenced against the last;
 *   - the plate after the fold, dye and flow, the same as the loop's;
 *   - a playing <video>: its dye where the canvas of the same frame puts it,
 *     cell by cell (an ImageBitmap of it on SwiftShader, which loses its GPU
 *     instance copying from the element; the element itself on the Mac);
 *   - and the time `pourVideo` takes on the CPU.
 * Which way up (PLAN 14ab-13): a title card with a known top, poured through
 * the loop and through the solver's pass, lands its top at the top of the
 * plate and its rising blob as flow up it; an uploaded picture of it, through
 * the app's `uprightPicture`, lands its top band above its bottom one. Each
 * with the card turned over as its control, which lands the other way.
 *
 * The frames carry a moving bright band along the top row and right-hand
 * column, which the loop leaves alone, so a kernel writing the edge is seen.
 * Controls: the second frame poured as a first is seen in the flow; the
 * reference of the last frame alone is not the reference of two (so the sum
 * is asked about); a flush after the flush adds nothing; the canvas's pour
 * upside down is far from itself. By hand: one tap a cell instead of the
 * footprint's mean fails the two big frames' lines, the edge guard removed
 * fails six, the read's flush removed and the fresh frame keyed on the last
 * frame rather than the video's address fail theirs.
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const nodeOnly = process.argv.includes('--node');
// The Mac's shard: only the pour from a <video> element, which SwiftShader cannot copy (below).
const videoOnly = process.argv.includes('--video');
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const MB = (b) => `${(b / 1e6).toFixed(3)} MB`;

// The GPU's usage flags, which the solver's modules read at load; nothing here makes a texture.
globalThis.GPUTextureUsage = { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
globalThis.GPUBufferUsage = { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
globalThis.GPUMapMode = { READ: 1, WRITE: 2 };
globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const out = 'node_modules/.cache/videoflow-sim.mjs';
await build({
  stdin: {
    contents: [
      "export { FluidSimulation } from './src/sim/fluidSimulation';",
      "export { pourVideoFrame, pourVideoFrameCpu } from './src/lib/videoFlow';",
      "export { rowsToWrite } from './src/lib/deltaRows';",
      "export { GRID_SIZE } from './src/sim/constants';",
      "export { DEFAULT_SETTINGS } from './src/types';",
    ].join('\n'),
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
});
const { FluidSimulation, pourVideoFrame, pourVideoFrameCpu, rowsToWrite, GRID_SIZE, DEFAULT_SETTINGS } = await import(pathToFileURL(`${process.cwd()}/${out}`).href);
const L = GRID_SIZE, AREA = L * L;

/*
  The frames: a dark ground (under the key, so it pours nothing), a still
  pattern of stripes (bright, and unchanging, so it pours dye and no flow),
  a soft coloured disc with a ripple in it that moves two cells right and one
  up a frame (flow, where the change is over the noise floor), and a bright
  band along the top row and the right-hand column that moves along them (so
  the edge the loop leaves alone is asked about: a kernel that wrote there
  would be seen). Whole numbers, as a canvas's bytes are.

  A frame bigger than the grid (`sx` by `sy` texels a cell) is dithered
  inside each cell's block: its middle texels a little brighter and the rest
  darker by as much in all, so the block's mean is the cell's value exactly
  and no single tap at its middle is. A sampler that took one tap a cell, as a
  canvas without mipmaps does, is then seen.
*/
function cellRGB(x, y, k) {
  let r = 6, g = 7, b = 9;
  if (x > 20 && x < 60 && y > 120 && y < 170) { const s = 90 + 60 * Math.sin(x * 0.7); r = s; g = s * 0.8; b = s * 0.5; }
  const dx = x - (80 + 2 * k), dy = y - (70 + k), q = Math.exp(-(dx * dx + dy * dy) / (2 * 22 * 22));
  const ripple = 0.75 + 0.25 * Math.sin(Math.hypot(dx, dy) * 0.45);
  r += 220 * q * ripple; g += 110 * q * ripple; b += 160 * q * (1 - ripple * 0.5);
  const band = y === 0 ? x : x === L - 1 ? y : -1;
  if (band >= 0) { const s = 150 + 80 * Math.sin(band * 0.3 + 0.9 * k); r = s; g = 0.6 * s; b = 0.9 * s; }
  return [Math.round(r), Math.round(g), Math.round(b)];
}
function frame(k, sx = 1, sy = sx) {
  const W = L * sx, H = L * sy, d = new Uint8ClampedArray(W * H * 4);
  const inner = (p, n) => (n <= 2 ? true : p >= n / 4 && p < (3 * n) / 4);
  const nIn = (sx <= 2 ? sx : sx / 2) * (sy <= 2 ? sy : sy / 2), nOut = sx * sy - nIn;
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const c = cellRGB(Math.floor(X / sx), Math.floor(Y / sy), k), i = (Y * W + X) * 4;
    const off = nOut === 0 ? 0 : inner(X % sx, sx) && inner(Y % sy, sy) ? 6 : (-6 * nIn) / nOut;
    for (let ch = 0; ch < 3; ch++) d[i + ch] = c[ch] >= 6 && c[ch] <= 249 ? c[ch] + off : c[ch];
    d[i + 3] = 255;
  }
  return d;
}
const frames = [0, 1, 2].map((k) => frame(k));

/** A solver that keeps what it is handed as its textures would (frameuploads' keeper), with the video pass or without. */
function keeper({ video = false, pours = true } = {}) {
  const tex = { dye: new Float32Array(AREA * 4), vel: new Float32Array(AREA * 4), mul: new Float32Array(AREA) };
  const held = {};
  const log = { bytes: 0, flushes: 0, steps: [], poured: [] };
  const take = (key, data, per, rows) => {
    if (!held[key]) held[key] = new Uint8Array(L).fill(1);
    for (const [y0, y1] of rowsToWrite(rows, held[key], L)) {
      tex[key].set(data.subarray(y0 * L * per, (y1 + 1) * L * per), y0 * L * per);
      log.bytes += (y1 - y0 + 1) * L * per * 4;
    }
  };
  const dye = new Float32Array(AREA * 4);
  const solver = {
    tex, log,
    thinGapLive: true, phaseIsLive: false, N: 256, grainMix: 0,
    rbDyeView: dye, rbVelView: new Float32Array(AREA * 4), rbDyeIssued: 1, rbDyeLanded: 1,
    clear() {}, setSlosh() {},
    readback() { return { dye, vel: new Float32Array(AREA * 4) }; },
    applyDeltas(da, va, mul, _dt, _hands, _breath, _sheet, rows = null) {
      log.flushes++;
      take('dye', da, 4, rows); take('vel', va, 4, rows); take('mul', mul, 1, rows);
    },
    step(_p, applied) { log.steps.push(applied); },
  };
  // `pours: false` is a solver with the pass that poured nothing (a frame it could not read).
  if (video) solver.pourVideo = (src, fresh) => { log.poured.push({ src, fresh }); return pours; };
  return solver;
}

/*
  The sources: a video is its address (`currentSrc`), and what the app's
  canvas would read back from it here is the test frame it carries.
*/
const video = (name, k) => ({ currentSrc: name, k });
const read = (src) => frames[src.k];
const rest = (sim) => [sim.density, sim.densityR, sim.densityG, sim.densityB, sim.vx, sim.vy].every((a) => a.every((v) => v === 0));
const settings = { ...DEFAULT_SETTINGS };
const noise = () => 0;

function open(withPass, pours = true) {
  const sim = new FluidSimulation(L, 0, 0, 0.1);
  const gpu = keeper({ video: withPass, pours });
  sim.attachGpu(gpu);
  sim.step(settings, null, 0, noise);                // the first flush, whole, as attachGpu leaves it
  sim.flushDeltas(0.01);                             // and one with nothing, which sends those rows back as zeros
  gpu.log.bytes = 0;
  gpu.log.steps.length = 0;
  return { sim, gpu, state: { source: null, prev: null } };
}
/** The app's own call (LiquidVisualizer, "Video Pour"), for a plate and its pour's state. */
const pour = (o, src) => pourVideoFrame(o.sim, src, o.state, read);

// ── The loop, as the WebGL solver still runs it: the reference ─────────
const cpu = open(false);
const cpuWay = [pour(cpu, video('a.mp4', 0)), pour(cpu, video('a.mp4', 1))];
cpu.sim.step(settings, null, 0, noise);
const refTwo = { dye: cpu.gpu.tex.dye.slice(), vel: cpu.gpu.tex.vel.slice(), bytes: cpu.gpu.log.bytes };
cpu.gpu.log.bytes = 0;
pour(cpu, video('a.mp4', 2));
cpu.sim.step(settings, null, 0, noise);
const refThird = { dye: cpu.gpu.tex.dye.slice(), vel: cpu.gpu.tex.vel.slice(), bytes: cpu.gpu.log.bytes };
// The next video on the same element: its first frame pours dye and no flow, though the last video's frame is at hand.
pour(cpu, video('b.mp4', 0));
const nextVideoFlow = cpu.sim.vx.some((v) => v !== 0) || cpu.sim.vy.some((v) => v !== 0), nextVideoDye = cpu.sim.density.some((v) => v !== 0);
cpu.sim.step(settings, null, 0, noise);
// The last frame alone (the control's reference): differenced against the first, as above, and nothing added before it.
const lone = open(false);
pourVideoFrameCpu(lone.sim, frames[1], frames[0], L);
lone.sim.step(settings, null, 0, noise);
const refLast = { dye: lone.gpu.tex.dye.slice(), vel: lone.gpu.tex.vel.slice() };

const cells = (a, per, k) => { let n = 0; for (let i = 0; i < AREA; i++) if (a[i * per + k] !== 0) n++; return n; };
const edge = (a) => { let n = 0; for (let x = 0; x < L; x++) for (const y of [0, L - 1]) for (const [cx, cy] of [[x, y], [y, x]]) if (a.slice((cx + cy * L) * 4, (cx + cy * L) * 4 + 4).some((v) => v !== 0)) n++; return n; };
console.log(`  The app's side: FluidSimulation on a ${L}² delta grid`);
console.log(`  the loop's two frames: dye in ${cells(refTwo.dye, 4, 3)} cells, flow in ${cells(refTwo.vel, 4, 0)}, none on the grid's edge (${edge(refTwo.dye) + edge(refTwo.vel)}); a step sent ${MB(refTwo.bytes)}`);
// Every row the picture covers goes across: here 143 of 192 (a cartoon's frame covers them all, 1.327 MB).
check('without the solver\'s pass the frame goes through the loop, and the step sends the rows it covers', cpuWay.every((w) => w === 'cpu') && refTwo.bytes > AREA * 36 / 2 && cells(refTwo.vel, 4, 0) > 100 && cells(refTwo.dye, 4, 3) > 1000 && edge(refTwo.dye) + edge(refTwo.vel) === 0,
  `${cpuWay.join(',')}, ${MB(refTwo.bytes)} of ${MB(AREA * 36)}`);
check('the next video\'s first frame is fresh: dye and no flow from the last video\'s frame', nextVideoDye && !nextVideoFlow, `dye ${nextVideoDye}, flow ${nextVideoFlow}`);

// ── Which way up (PLAN 14ab-13) ───────────────────────────────────────
/*
  The grid's rows count up the plate and a frame's count down it. The text
  pour turns its canvas over before it pours, and on the owner's Mac (Metal,
  photographed beside each source) its words stood the right way up; an
  uploaded picture and a poured cartoon frame, which were not turned, landed
  upside down. So "the right way up" here is the text pour's: a frame's top
  lands at the grid's high rows.

  The frame is a title card with a known top: a bright band across its top
  third, a dim one (still over the key) across its bottom third, dark glass
  between, and a soft blob in the middle that rises two rows up the picture
  between the two frames. Read on what the plate is handed, the dye's
  brightest cells (each pours by its brightness) sit above the middle of all
  the dyed cells (`up`, as a share of the dyed rows' height: +1/3 for this
  card the right way up, −1/3 upside down), and the blob's rise is flow up
  the plate (vy > 0). Controls: the same card turned over before it is poured
  lands the other way on every line, so the measure sees a frame laid the
  wrong way, which every other line of this check would not (the solver's
  pass and the loop are held to each other, and a frame both turned the same
  wrong way agrees with itself).
*/
function card(rise) {
  const d = new Uint8ClampedArray(AREA * 4);
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
    const q = Math.exp(-((x - L / 2) ** 2 + (y - (L / 2 - rise)) ** 2) / (2 * 9 * 9));
    const v = y < L / 3 ? 230 : y >= (2 * L) / 3 ? 60 : Math.round(6 + 120 * q);
    const i = (y * L + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  return d;
}
/** A frame's rows the other way round: the control, and what the pour handed the plate before 14ab-13. */
const turned = (d, W = L, H = L) => { const o = new Uint8ClampedArray(d.length); for (let y = 0; y < H; y++) o.set(d.subarray(y * W * 4, (y + 1) * W * 4), (H - 1 - y) * W * 4); return o; };
const cards = [card(0), card(2)];
const cardsTurned = cards.map((c) => turned(c));
/**
 * Which way up a pour landed, on any N×N dye and flow (RGBA, the amount in
 * the dye's alpha, vy in the flow's second): `up`, the brightest dyed cells'
 * mean row less all the dyed cells', over the dyed rows' height; `vy`, the
 * flow's sum. Kept as source so the page runs the same measure.
 */
const wayUpSrc = `(dye, vel) => {
  const N = Math.round(Math.sqrt(dye.length / 4));
  let top = 0;
  for (let i = 0; i < N * N; i++) top = Math.max(top, dye[i * 4 + 3]);
  let n = 0, sy = 0, nb = 0, sb = 0, y0 = N, y1 = -1, vy = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, a = dye[i * 4 + 3];
    if (vel) vy += vel[i * 4 + 1];
    if (a <= top * 1e-3) continue;
    n++; sy += y; y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    if (a >= 0.8 * top) { nb++; sb += y; }
  }
  return { up: n && nb ? (sb / nb - sy / n) / (y1 - y0 + 1) : 0, vy: vel ? vy : null, cells: n };
}`;
const wayUp = (0, eval)(wayUpSrc);
const sayWay = (w) => `up ${w.up >= 0 ? '+' : ''}${w.up.toFixed(3)}${w.vy === null ? '' : `, flow up the plate ${w.vy >= 0 ? '+' : ''}${w.vy.toExponential(2)} in all`}, ${w.cells} cells dyed`;
/** The app's call on a solver with no pass of its own (the WebGL one), recording what the loop hands it. */
function cardOnLoop(frs) {
  const dye = new Float32Array(AREA * 4), vel = new Float32Array(AREA * 4);
  const plate = {
    size: L, pourVideoFrame: () => false,
    addDensity(x, y, a) { dye[(y * L + x) * 4 + 3] += a; },
    addVelocity(x, y, vx, vy) { vel[(y * L + x) * 4] += vx; vel[(y * L + x) * 4 + 1] += vy; },
  };
  const state = { source: null, prev: null };
  const ways = frs.map((_, k) => pourVideoFrame(plate, video('card.mp4', k), state, (src) => frs[src.k]));
  return { ...wayUp(dye, vel), ways };
}
const loopUp = cardOnLoop(cards), loopTurned = cardOnLoop(cardsTurned);
console.log(`  which way up, the loop: the card ${sayWay(loopUp)}; turned over ${sayWay(loopTurned)}`);
check('the loop lays a frame\'s top at the top of the plate, and its rise as flow up it (14ab-13)', loopUp.ways.every((w) => w === 'cpu') && loopUp.up > 0.2 && loopUp.vy > 0, sayWay(loopUp));
check('control: the card turned over lands the other way on both', loopTurned.up < -0.2 && loopTurned.vy < 0, sayWay(loopTurned));

// ── With the pass ─────────────────────────────────────────────────────
const gpu = open(true);
const gpuWay = [pour(gpu, video('a.mp4', 0)), pour(gpu, video('a.mp4', 1))];
const untouched = rest(gpu.sim);
gpu.sim.step(settings, null, 0, noise);
const stepTook = gpu.gpu.log.steps.slice(-1)[0];
const videoBytes = gpu.gpu.log.bytes;
gpu.gpu.log.bytes = 0;
// A frame with a tool's few cells in it: only their rows go.
pour(gpu, video('a.mp4', 2));
for (let x = 90; x < 96; x++) gpu.sim.addDensity(x, 40, 0.3, 1, 0.4, 0.2);
gpu.sim.step(settings, null, 0, noise);
const toolBytes = gpu.gpu.log.bytes;
gpu.gpu.log.bytes = 0;
// And a step with no frame and no tool: nothing to flush, as before any video.
const flushesBefore = gpu.gpu.log.flushes;
gpu.sim.step(settings, null, 0, noise);
const after = gpu.gpu.log.steps.slice(-2), idleFlushes = gpu.gpu.log.flushes - flushesBefore;
// The next video, and the same one handed in again (the app forgets the source): each starts fresh.
pour(gpu, video('b.mp4', 0));
pour(gpu, video('b.mp4', 1));
gpu.state.source = null;
pour(gpu, video('b.mp4', 2));
// A frame poured and the plate read back before a step: the read flushes the held frames first.
// (A readback has landed, as in any show past its first frames; before one, the read keeps the seed and flushes nothing.)
gpu.sim.gpuLanded = true;
const flushesRead = gpu.gpu.log.flushes;
gpu.sim.pullStateFromGpu();
const readFlushed = gpu.gpu.log.flushes - flushesRead;
const freshes = gpu.gpu.log.poured.map((p) => (p.fresh ? 'fresh' : 'next')).join(',');
check('with the solver\'s pass the frame goes to it, and nothing is written into the CPU\'s arrays', gpuWay.every((w) => w === 'gpu') && untouched, gpuWay.join(','));
check('each video\'s first frame goes as fresh, the next as the next: the first, a new address, the same one handed in again', freshes === 'fresh,next,next,fresh,next,fresh', freshes);
check('the step flushes for the solver\'s held frames, with no row of the CPU\'s', stepTook === true && videoBytes === 0, `deltas applied ${stepTook}, ${MB(videoBytes)} sent`);
check('a tool\'s few cells with a frame go by their own row', toolBytes === L * 36, `${MB(toolBytes)}, against ${MB(L * 36)} for row 40`);
check('a step with no frame after them flushes nothing', after[0] === true && after[1] === false && idleFlushes === 0, `deltas applied ${after.join(',')}, ${idleFlushes} flushes`);
check('reading the plate back before a step flushes the held frames first', readFlushed === 1, `${readFlushed} flushes`);
// A solver whose pass poured nothing (a frame it could not read): the frame goes through the loop instead.
const refused = open(true, false);
const refusedWay = pour(refused, video('a.mp4', 0));
check('a pass that poured nothing hands the frame to the loop', refusedWay === 'cpu' && !rest(refused.sim), refusedWay);

// The CPU's time a frame, the loop (the canvas's read back is the browser's and not counted here).
const t = [];
const timer = open(false);
for (let k = 0; k < 30; k++) {
  const t0 = performance.now();
  pourVideoFrameCpu(timer.sim, frames[(k + 1) % 3], frames[k % 3], L);
  t.push(performance.now() - t0);
  timer.sim.step(settings, null, 0, noise);
}
t.sort((a, b) => a - b);
console.log(`  the loop's CPU time a frame, median of 30: ${t[15].toFixed(2)} ms (and a 192² getImageData and a 147 KB copy in the browser); with the pass: none`);
console.log(`  bytes a step while a video pours: ${MB(refTwo.bytes)} → ${MB(videoBytes)}`);

// ── The lab's side ────────────────────────────────────────────────────
if (!nodeOnly) {
  const { openLab } = await import('./lab.mjs');
  const { page, close } = await openLab();
  try {
    // Across to the page as base64 of the bytes: as arrays of numbers the frames four times the grid fill node's heap.
    const arr = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
    // The page's helpers, once, for the two evaluations below.
    await page.evaluate(({ L }) => {
      const bytes = (b64) => Uint8ClampedArray.from(atob(b64), (c) => c.charCodeAt(0));
      const canvas = (data, W, H = W) => {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        c.getContext('2d').putImageData(new ImageData(bytes(data), W, H), 0, 0);
        return c;
      };
      /** A full-grid RGBA32 texture, read out (the delta textures the fold takes). */
      const readTex = async (s, tex) => {
        const N = tex.width, row = Math.ceil(N * 16 / 256) * 256;
        const buf = s.device.createBuffer({ size: row * N, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const enc = s.device.createCommandEncoder();
        enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [N, N]);
        s.device.queue.submit([enc.finish()]);
        await buf.mapAsync(GPUMapMode.READ);
        const p = new Float32Array(buf.getMappedRange().slice(0));
        buf.unmap(); buf.destroy();
        const o = new Float32Array(N * N * 4);
        for (let y = 0; y < N; y++) o.set(p.subarray(y * row / 4, y * row / 4 + N * 4), y * N * 4);
        return o;
      };
      const A = L * L;
      const zeros = () => [new Float32Array(A * 4), new Float32Array(A * 4), new Float32Array(A).fill(1)];
      const fresh = async () => { await lab.create(128); const s = lab.solver(); const [d, v, m] = zeros(); s.applyDeltas(d, v, m, 0.01, null, null, null, null); s.applyDeltas(d, v, m, 0.01, null, null, null, new Uint8Array(L)); return s; };
      const flushGpu = (s) => { const [d, v, m] = zeros(); s.applyDeltas(d, v, m, 0.01, null, null, null, new Uint8Array(L)); };
      const deltas = async (s) => ({ dye: await readTex(s, s.deltaDyeTex), vel: await readTex(s, s.deltaVelTex) });
      const plate = async (s) => ({ dye: await s.readField('dye'), vel: await (async () => {
        // The velocity field itself (readField's 'vel' is the forced one, written by a step).
        const was = s.velForced; s.velForced = s.vel.read; const v = await s.readField('vel'); s.velForced = was; return v;
      })() });
      const byLoop = async (ref) => { const s = await fresh(); s.applyDeltas(new Float32Array(bytes(ref.dye).buffer), new Float32Array(bytes(ref.vel).buffer), new Float32Array(A).fill(1), 0.01, null, null, null, null); return s; };
      /*
        Largest difference against the scale of the reference, and how many
        values are off by more than 1e-5 of it: the loop works in doubles and
        stores floats, the kernel works in floats, and the two agree to a few
        parts in ten million. The plate's velocity is kept in half floats
        (rgba16float), where a value a part in a million off can round to the
        next half float, one part in 1024 of itself: `half` allows that one
        rounding, and nothing more.
      */
      const cmp = (a, b, half = false) => {
        let scale = 0, worst = 0, off = 0;
        for (let i = 0; i < b.length; i++) scale = Math.max(scale, Math.abs(b[i]));
        for (let i = 0; i < b.length; i++) {
          const d = Math.abs(a[i] - b[i]);
          worst = Math.max(worst, d);
          if (d > Math.max(1e-5 * scale, half ? Math.abs(b[i]) / 1024 : 0)) off++;
        }
        return { worst: worst / (scale || 1), off, scale };
      };
      const both = (a, b, half = false) => ({ dye: cmp(a.dye, b.dye), vel: cmp(a.vel, b.vel, half) });
      window.vfh = { bytes, canvas, readTex, A, zeros, fresh, flushGpu, deltas, plate, byLoop, cmp, both };
    }, { L });
    if (!videoOnly) {
      const r = await page.evaluate(async ({ f0, f1, f2, f0x4, f1x4, f0w, f1w, refTwo, refThird, refLast, L }) => {
        const { bytes, canvas, readTex, A, zeros, fresh, flushGpu, deltas, plate, byLoop, cmp, both } = window.vfh;

        // Two frames between two steps, at the grid's size.
        const loopTwo = await byLoop(refTwo);
        const refTwoDeltas = await deltas(loopTwo), refTwoPlate = await plate(loopTwo);
        // Each solver let go once read (SwiftShader runs out of devices otherwise).
        const done = (...ss) => ss.forEach((x) => x.device.destroy());
        done(loopTwo);
        const g = await fresh();
        const c0 = canvas(f0, L), c1 = canvas(f1, L), c2 = canvas(f2, L);
        const t = [];
        let t0 = performance.now(); g.pourVideo(c0, true); t.push(performance.now() - t0);
        t0 = performance.now(); g.pourVideo(c1, false); t.push(performance.now() - t0);
        flushGpu(g);
        const two = both(await deltas(g), refTwoDeltas);
        const twoPlate = both(await plate(g), refTwoPlate, true);
        // A flush after it, with no frame: adds nothing.
        flushGpu(g);
        const again = await deltas(g);
        let againMax = 0;
        for (const a of [again.dye, again.vel]) for (let i = 0; i < a.length; i++) againMax = Math.max(againMax, Math.abs(a[i]));
        // The next frame alone, a step later: the held frames gone, this one differenced against the last.
        g.pourVideo(c2, false);
        flushGpu(g);
        const loopThird = await byLoop(refThird);
        const third = both(await deltas(g), await deltas(loopThird));
        done(loopThird);

        // At four times the grid a side, and four by two (a video is never square): each cell the mean of its footprint.
        const h = await fresh();
        h.pourVideo(canvas(f0x4, L * 4), true); h.pourVideo(canvas(f1x4, L * 4), false);
        flushGpu(h);
        const big = both(await deltas(h), refTwoDeltas);
        const wd = await fresh();
        wd.pourVideo(canvas(f0w, L * 4, L * 2), true); wd.pourVideo(canvas(f1w, L * 4, L * 2), false);
        flushGpu(wd);
        const wide = both(await deltas(wd), refTwoDeltas);
        done(h, wd);


        // Controls.
        const n = await fresh();
        n.pourVideo(c0, true); n.pourVideo(c1, true);
        flushGpu(n);
        const noFlow = both(await deltas(n), refTwoDeltas);
        const loopLast = await byLoop(refLast);
        const lastAlone = both(await deltas(loopLast), refTwoDeltas);
        done(n, loopLast);

        // The CPU's time a call, a frame after the kernels are built.
        const times = [];
        for (let k = 0; k < 20; k++) { const s0 = performance.now(); g.pourVideo(k % 2 ? c1 : c2, false); times.push(performance.now() - s0); if (k % 2) flushGpu(g); }
        times.sort((a, b) => a - b);
        return { two, twoPlate, againMax, third, big, wide, noFlow, lastAlone, firstCalls: t, median: times[10], N: g.N };
      }, { f0: arr(frames[0]), f1: arr(frames[1]), f2: arr(frames[2]), f0x4: arr(frame(0, 4)), f1x4: arr(frame(1, 4)), f0w: arr(frame(0, 4, 2)), f1w: arr(frame(1, 4, 2)), refTwo: { dye: arr(refTwo.dye), vel: arr(refTwo.vel) }, refThird: { dye: arr(refThird.dye), vel: arr(refThird.vel) }, refLast: { dye: arr(refLast.dye), vel: arr(refLast.vel) }, L });
      const say = (c) => `dye ${c.dye.off} off, worst ${c.dye.worst.toExponential(1)}; flow ${c.vel.off} off, worst ${c.vel.worst.toExponential(1)}`;
      const same = (c) => c.dye.off === 0 && c.vel.off === 0 && c.dye.scale > 0 && c.vel.scale > 0;
      console.log(`  The lab's side: the real solver, ${L}² grid onto ${r.N}², the deltas the fold takes`);
      check('two frames between two steps hand the fold what the loop\'s did', same(r.two), say(r.two));
      check('and leave the plate as the loop\'s did, dye and flow (the flow to its half float)', same(r.twoPlate), say(r.twoPlate));
      check('a frame four times the grid a side, dithered in each cell, its footprint\'s mean the same', same(r.big), say(r.big));
      check('and one four by two', same(r.wide), say(r.wide));
      check('the flush takes the held frames once: the next flush adds nothing', r.againMax === 0, `largest delta ${r.againMax}`);
      check('a frame a step later, against the last, as the loop\'s', same(r.third), say(r.third));
      check('control: the second frame poured as a first is seen in the flow', r.noFlow.vel.off > 100 && r.noFlow.dye.off === 0, say(r.noFlow));
      check('control: the last frame alone is not the two frames\' sum', r.lastAlone.dye.off > 1000, say(r.lastAlone));
      console.log(`  pourVideo's CPU time a call: first two ${r.firstCalls.map((x) => x.toFixed(1)).join(', ')} ms (the kernels built), then a median of ${r.median.toFixed(2)} ms (SwiftShader's copy of a canvas included; a video's is a copy on the GPU)`);
    }
    /*
      Which way up on the real solver (PLAN 14ab-13): the card poured as a
      canvas through `pourVideo` (its copy turns the frame over, `flipY`),
      read on the deltas the fold takes. And an uploaded picture, through the
      app's own `uprightPicture` and `pourPictureCpu` (the upload's whole
      path below the file picker, the CPU's writes recorded): its top band
      above its bottom one, and as it was before 14ab-13 (the canvas read as
      it came) upside down. Runs on the Mac's `--video` shard too, so Metal's
      copy is asked as well as SwiftShader's.
    */
    const appBundle = await build({
      stdin: { contents: "export { uprightPicture, pourPictureCpu } from './src/lib/videoFlow';", resolveDir: process.cwd(), loader: 'ts' },
      bundle: true, platform: 'browser', format: 'iife', globalName: 'videoFlowApp', write: false, logLevel: 'warning',
    });
    await page.addScriptTag({ content: appBundle.outputFiles[0].text });
    const wr = await page.evaluate(async ({ cards, cardsTurned, wayUpSrc, L }) => {
      const { canvas, fresh, flushGpu, deltas } = window.vfh;
      const wayUp = (0, eval)(wayUpSrc);
      const onSolver = async (frs) => {
        const s = await fresh();
        const poured = frs.map((f, k) => s.pourVideo(canvas(f, L), k === 0));
        flushGpu(s);
        const d = await deltas(s);
        s.device.destroy();
        return { ...wayUp(d.dye, d.vel), poured: poured.every(Boolean) };
      };
      const gpu = await onSolver(cards), gpuTurned = await onSolver(cardsTurned);
      const { uprightPicture, pourPictureCpu } = window.videoFlowApp;
      const upload = (img) => {
        const dye = new Float32Array(L * L * 4);
        pourPictureCpu({ addDensity(x, y, a) { dye[(y * L + x) * 4 + 3] += a; }, addVelocity() {} }, img, L);
        return wayUp(dye, null);
      };
      const pic = canvas(cards[0], L);
      const uploaded = upload(uprightPicture(pic, L, L));
      const asItCame = upload(pic.getContext('2d').getImageData(0, 0, L, L));
      return { gpu, gpuTurned, uploaded, asItCame };
    }, { cards: cards.map(arr), cardsTurned: cardsTurned.map(arr), wayUpSrc, L });
    console.log(`  which way up, the solver's pass: the card ${sayWay(wr.gpu)}; turned over ${sayWay(wr.gpuTurned)}`);
    console.log(`  an uploaded picture of it: ${sayWay(wr.uploaded)}; read as it came (before 14ab-13) ${sayWay(wr.asItCame)}`);
    check('the solver\'s pass lays a frame\'s top at the top of the plate, and its rise as flow up it (14ab-13)', wr.gpu.poured && wr.gpu.up > 0.2 && wr.gpu.vy > 0, sayWay(wr.gpu));
    check('control: the card turned over lands the other way on the solver too', wr.gpuTurned.up < -0.2 && wr.gpuTurned.vy < 0, sayWay(wr.gpuTurned));
    check('an uploaded picture lands the right way up (`uprightPicture`); read as it came it lands upside down', wr.uploaded.up > 0.2 && wr.asItCame.up < -0.2, `${sayWay(wr.uploaded)}; as it came ${sayWay(wr.asItCame)}`);

    /*
      From a <video>, as the app pours: the first frame of a stream of the
      canvas, played, through the video's own size and its copy. A video's
      colours go through the browser's video path (YUV and back), so not to
      the bit: where the dye lands, its middle within a cell of the canvas's
      and far from its mirror (a frame laid upside down), and as much of it.

      SwiftShader's WebGPU loses the page's whole GPU instance when a texture
      is copied from a <video> (a copy from an ImageBitmap of the same video
      is fine; the Mac copies from the video itself, as the film projector
      does every frame). So in the cloud the frame goes as an ImageBitmap of
      the playing video, and the line says so; the Mac's shard runs this part
      alone (`-- --video`) and pours the element itself. Last either way.
    */
    const vr = await page.evaluate(async ({ f0, L }) => {
      const { bytes, canvas, fresh, flushGpu, deltas } = window.vfh;
      const info = lab.adapter();
      const soft = /swiftshader/i.test(JSON.stringify(info ?? {}));
      const vc = canvas(f0, L);
      const v = document.createElement('video');
      v.muted = true;
      v.srcObject = vc.captureStream();
      await v.play().catch(() => {});
      vc.getContext('2d').putImageData(new ImageData(bytes(f0), L, L), 0, 0);
      const t1 = performance.now();
      while ((v.readyState < 2 || !v.videoWidth) && performance.now() - t1 < 8000) await new Promise((res) => setTimeout(res, 50));
      const mid = (dl) => { const N = Math.sqrt(dl.length / 4); let m = 0, x = 0, y = 0; for (let i = 0; i < N * N; i++) { const a = dl[i * 4 + 3]; m += a; x += a * (i % N); y += a * Math.floor(i / N); } return { m, x: x / m, y: y / m, N }; };
      const cs = await fresh();
      cs.pourVideo(canvas(f0, L), true);
      flushGpu(cs);
      const canvasDye = (await deltas(cs)).dye, fromCanvas = mid(canvasDye);
      cs.device.destroy();
      const vs = await fresh();
      const src = soft ? await createImageBitmap(v) : v;
      const poured = vs.pourVideo(src, true);
      flushGpu(vs);
      const videoDye = (await deltas(vs)).dye, fromVideo = mid(videoDye);
      v.pause();
      // How far one pour's dye is from another's, cell by cell, against all of it; and the canvas's from itself upside down.
      const N = fromCanvas.N;
      const apart = (a, flip) => { let d = 0, m = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = canvasDye[(y * N + x) * 4 + 3]; d += Math.abs(a[((flip ? N - 1 - y : y) * N + x) * 4 + 3] - c); m += c; } return d / m; };
      return { soft, poured, size: [v.videoWidth, v.videoHeight], fromVideo, fromCanvas,
        off: Math.hypot(fromVideo.x - fromCanvas.x, fromVideo.y - fromCanvas.y), apart: apart(videoDye, false), mirror: apart(canvasDye, true) };
    }, { f0: arr(frames[0]), L });
    console.log(`  from a <video> ${vr.size.join('×')}${vr.soft ? ', on SwiftShader as an ImageBitmap of it' : ', the element itself'}: the dye's middle at (${vr.fromVideo.x.toFixed(2)}, ${vr.fromVideo.y.toFixed(2)}) of ${vr.fromVideo.N}², the canvas's (${vr.fromCanvas.x.toFixed(2)}, ${vr.fromCanvas.y.toFixed(2)}); as much dye ×${(vr.fromVideo.m / vr.fromCanvas.m).toFixed(3)}`);
    check(`a playing <video> pours where its frame is${vr.soft ? ' (an ImageBitmap of it on SwiftShader)' : ''}: its middle within a cell of the canvas's, cell by cell within 10% of the canvas's dye, as much within 10%`,
      vr.poured && vr.size[0] === L && vr.off < 1 && vr.apart < 0.1 && Math.abs(vr.fromVideo.m / vr.fromCanvas.m - 1) < 0.1,
      `poured ${vr.poured}, ${vr.off.toFixed(2)} cells off, ${(100 * vr.apart).toFixed(1)}% apart`);
    check('control: the canvas\'s pour upside down is far from itself, so the line above would see a frame laid the wrong way', vr.mirror > 0.5 && vr.apart < vr.mirror / 5, `${(100 * vr.mirror).toFixed(0)}% apart`);
  } finally { await close(); }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
