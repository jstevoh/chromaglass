#!/usr/bin/env node
/**
 * The plate's relief is worked out where the dye is, not at its mirror.
 *
 *   npm run derive     (the solver and the plate, in the lab: any adapter that computes and renders)
 *
 * The derive pass turns each layer's dye into its slopes and edges once a
 * frame, and the display lights the plate from them: the normals, the
 * boundary lines, the meniscus. It is a render pass into a texture the
 * display then reads the way it reads the dye, y-down, and it drew without
 * the flip every other pass into a texture takes (FLIP_Y, see "The
 * orientation trap" in wgsl/air.ts). So the relief of the lead plate was lit
 * at its mirror across the plate's middle: a drop, and far more a press, lit
 * a shape on the other side of the plate — top to bottom, or left to right
 * on a plate turned a quarter, which is how it was reported.
 *
 * A plausible relief in the wrong place still looks like relief, so this asks
 * where: dye laid off-centre in both axes, and the middle of the slopes the
 * derive pass found against the middle of the dye.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  const r = await page.evaluate(async () => {
    await lab.create(256);
    lab.dye(0.72, 0.24, 0.08, [1, 0.6, 0.3], 3);
    lab.flush();
    await lab.step(2);
    const solver = lab.solver();
    const device = solver.device;
    const plate = new lab.WebGPUPlate(device, 'rgba8unorm');
    // The two uniforms the derive pass reads: the grid its stencil is measured on, and the one it samples.
    plate.pack.set('logicalGrid', 192).set('gridSize', 256);
    const target = device.createTexture({ size: [320, 320], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const enc = device.createCommandEncoder();
    plate.draw(enc, target.createView(), { width: 320, height: 320 },
      [{ dye: solver.dye.read, velForced: solver.velForced, grain: null, particles: null, air: null, view: null }]);
    device.queue.submit([enc.finish()]);
    const tex = plate.layers[0].derived;
    const w = tex.width, h = tex.height;
    const row = Math.ceil((w * 8) / 256) * 256;
    const buf = device.createBuffer({ size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const e2 = device.createCommandEncoder();
    e2.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [w, h]);
    device.queue.submit([e2.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const halves = new Uint16Array(buf.getMappedRange().slice(0));
    const half = (v) => {
      const e = (v >> 10) & 31, f = v & 1023, s = v & 0x8000 ? -1 : 1;
      return e === 0 ? s * f * 2 ** -24 : e === 31 ? 0 : s * (1 + f / 1024) * 2 ** (e - 15);
    };
    let sum = 0, sx = 0, sy = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = y * (row / 2) + x * 4;
      const g = Math.hypot(half(halves[o]), half(halves[o + 1]));
      if (!(g > 0)) continue;
      sum += g; sx += g * (x + 0.5) / w; sy += g * (y + 0.5) / h;
    }
    const dye = await lab.field('dye');
    const n = Math.sqrt(dye.length / 4);
    let dsum = 0, dx = 0, dy = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = dye[(x + y * n) * 4 + 3];
      if (!(d > 0)) continue;
      dsum += d; dx += d * (x + 0.5) / n; dy += d * (y + 0.5) / n;
    }
    return { sum, px: sx / sum, py: sy / sum, dx: dx / dsum, dy: dy / dsum };
  });
  const at = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`;
  check('the derive pass finds slopes at all', r.sum > 0, `weight ${r.sum.toFixed(1)}`);
  check('where the dye is', Math.hypot(r.px - r.dx, r.py - r.dy) < 0.08,
    `slopes at ${at(r.px, r.py)}, dye at ${at(r.dx, r.dy)} (its mirror across the middle is ${at(r.dx, 1 - r.dy)})`);
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
