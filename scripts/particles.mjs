#!/usr/bin/env node
/**
 * Particles are drawn where the dye they were born from is.
 *
 *   npm run particles     (the solver alone, in the lab: any adapter that computes)
 *
 * The splat is a render pass, and a render pass writes clip space, which is
 * y-up, into a texture the plate reads y-down (see "The orientation trap" in
 * src/gpu/wgsl/air.ts). The particles' splat said the compositor read it the
 * other way up; it does not, so every particle was drawn at its mirror across
 * the plate's middle. A particle field flipped in y still looks like
 * particles, so this asks *where*: dye laid off-centre, the particles born
 * from it, and the middle of what they drew against the middle of the dye.
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
    // Off-centre in both axes, so a flip in either shows.
    lab.dye(0.72, 0.24, 0.07, [1, 0.6, 0.3], 3);
    lab.flush();
    await lab.step(40, { particles: 1, particleLife: 4, damping: 0.9 });
    const solver = lab.solver();
    const tex = solver.particles?.target;
    if (!tex) return { none: true };
    const device = solver.device;
    const splat = device.createCommandEncoder();
    solver.splatParticles(splat);
    device.queue.submit([splat.finish()]);
    const w = tex.width, h = tex.height;
    const row = Math.ceil((w * 8) / 256) * 256;
    const buf = device.createBuffer({ size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [w, h]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const halves = new Uint16Array(buf.getMappedRange().slice(0));
    const half = (v) => {
      const e = (v >> 10) & 31, f = v & 1023, s = v & 0x8000 ? -1 : 1;
      return e === 0 ? s * f * 2 ** -24 : e === 31 ? 0 : s * (1 + f / 1024) * 2 ** (e - 15);
    };
    let sum = 0, sx = 0, sy = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = half(halves[y * (row / 2) + x * 4 + 3]);
      if (!(a > 0)) continue;
      sum += a; sx += a * (x + 0.5) / w; sy += a * (y + 0.5) / h;
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
  if (r.none) check('the particles are running', false, 'no splat target');
  else {
    const at = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`;
    check('the particles drew something', r.sum > 0, `weight ${r.sum.toFixed(1)}`);
    check('where the dye they came from is', Math.hypot(r.px - r.dx, r.py - r.dy) < 0.08,
      `particles at ${at(r.px, r.py)}, dye at ${at(r.dx, r.dy)} (its mirror across the middle is ${at(r.dx, 1 - r.dy)})`);
  }
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
