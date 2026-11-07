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
    const half = (v) => {
      const e = (v >> 10) & 31, f = v & 1023, s = v & 0x8000 ? -1 : 1;
      return e === 0 ? s * f * 2 ** -24 : e === 31 ? 0 : s * (1 + f / 1024) * 2 ** (e - 15);
    };
    // Draw the plate from these fields and read back what the derive pass wrote: (slope x, slope y, ∇²OPL, OPL).
    const derived = async (layer) => {
      const enc = device.createCommandEncoder();
      plate.draw(enc, target.createView(), { width: 320, height: 320 }, [layer]);
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
      buf.unmap();
      return { w, h, at: (x, y, c) => half(halves[y * (row / 2) + x * 4 + c]) };
    };
    const one = await derived({ dye: solver.dye.read, velForced: solver.velForced, grain: null, particles: null, air: null, view: null });
    const { w, h } = one;
    let sum = 0, sx = 0, sy = 0;
    let minLap = 1e9, maxLap = -1e9;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const g = Math.hypot(one.at(x, y, 0), one.at(x, y, 1));
      const l = one.at(x, y, 2);
      if (l < minLap) minLap = l;
      if (l > maxLap) maxLap = l;
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

    /*
      The optical path against the liquids themselves. Two pools poured clear
      (no dye) where the dye is not, each a flat-topped column of one shelf
      bottle (a share of 50 at the middle, clamped to the whole column out to
      99% of its radius), laid as though poured long ago, as npm run thick
      lays its pools: glycerine at the top left, syrup at the bottom left.
      Neither is the shader's number: each index is the bottle's own in the
      shelf's table (src/types.ts), and the column is one and a half rest gaps
      deep (9 mm at the 6 mm rest gap, lib/turntable.ts DISH_GAP_METRES), laid in the
      plate's view as the gap between the glasses (packView's last word, 0
      to 0.06 in gap units in sixteen bits). The plate's clear liquid is water,
      1.333. So the path through each, in the derive pass's unit (the 6 mm
      rest gap, DISH_REST_GAP, so a still column of water reads 1.333), is
      n · 9 mm / 6 mm, worked out here from those three numbers alone.
      Glycerine and syrup differ by 0.034 there, so a pool read at the
      other's place (a mirror across the middle) fails too.
    */
    const indexOf = (id) => lab.liquids.find((l) => l.id === id).behaviour.index;
    const depthMetres = 1.5 * lab.DISH_GAP_METRES;
    const gapOfDish = depthMetres / lab.GAP_METRES;
    const thickness = gapOfDish / lab.DISH_REST_GAP;
    const view = device.createTexture({ size: [n, n], format: 'rgba32uint', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    const words = new Uint32Array(n * n * 4);
    for (let k = 0; k < n * n; k++) words[k * 4 + 3] = Math.round(65535 * gapOfDish / 0.06);
    device.queue.writeTexture({ texture: view }, words, { bytesPerRow: n * 16 }, [n, n]);
    const pools = [
      { id: 'glycerine', x: 0.28, y: 0.72 },
      { id: 'syrup', x: 0.28, y: 0.28 },
    ];
    for (const p of pools) lab.addSpecies(p.x, p.y, 0.1, 50, p.id, false);
    const two = await derived({ dye: solver.dye.read, velForced: solver.velForced, grain: null, particles: null, air: null, view, species: solver.fields.species });
    // The mean path over the middle of a place (within 0.04 of it), well inside a pool's flat top.
    const pathAt = (cx, cy) => {
      let s = 0, k = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (Math.hypot((x + 0.5) / w - cx, (y + 0.5) / h - cy) > 0.04) continue;
        s += two.at(x, y, 3); k++;
      }
      return s / k;
    };
    const N_WATER = 1.333;
    const paths = [
      ...pools.map((p) => ({ id: p.id, n: indexOf(p.id), read: pathAt(p.x, p.y) })),
      { id: 'water', n: N_WATER, read: pathAt(0.72, 0.72) },
    ].map((p) => ({ ...p, expected: p.n * thickness }));

    return { sum, px: sx / sum, py: sy / sum, dx: dx / dsum, dy: dy / dsum, minLap, maxLap, paths, thickness };
  });
  const at = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`;
  check('the derive pass finds slopes at all', r.sum > 0, `weight ${r.sum.toFixed(1)}`);
  check('where the dye is', Math.hypot(r.px - r.dx, r.py - r.dy) < 0.08,
    `slopes at ${at(r.px, r.py)}, dye at ${at(r.dx, r.dy)} (its mirror across the middle is ${at(r.dx, 1 - r.dy)})`);
  /*
    A front of dye is a step in the optical path, and a step's Laplacian is a
    doublet: negative on the high side, positive on the low. Each lobe has to
    be big enough to be seen when the focus ring is turned: at Projector Focus
    1 (Δz 0.75) through water's path of about 1.35, the dark lobe's bar of
    0.07 dims the light by 0.07 · 0.75 / 1.35 = 4% (ten steps of a byte) and
    the bright lobe's 0.18 brightens it by 10%. The derive pass on main wrote
    the boundary difference here, which is never negative, so its minimum is
    0 and this fails.
  */
  check('Becke line doublet present in Laplacian', r.minLap < -0.07 && r.maxLap > 0.18,
    `Laplacian min ${r.minLap.toFixed(3)}, max ${r.maxLap.toFixed(3)}`);
  const worst = Math.max(...r.paths.map((p) => Math.abs(p.read - p.expected)));
  check('optical path is each liquid\'s own index times its depth (glycerine, syrup, water)', worst < 0.005,
    `${r.paths.map((p) => `${p.id} ${p.read.toFixed(4)} against ${p.n} × ${r.thickness.toFixed(2)} = ${p.expected.toFixed(4)}`).join('; ')}`);
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
