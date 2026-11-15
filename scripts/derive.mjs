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

/*
  A line written ahead of its build (PLAN 18e-2), printed as owed while it
  fails and red the day it passes with its id still listed (the convention
  of timers.mjs and wallflash.mjs): an owed line is excused only while what
  it asks for is absent (here, while .z is still the signed Laplacian), and a
  build that is there and misses is red.

    npm run derive -- --owed=grad
*/
const IDS = ['grad'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
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
    /*
      The dye's index (PLAN 38u-10) is real by default, too small to draw a
      Becke line, and Dye Index Boost multiplies it. The doublet lines below
      are asked at 500 times real, where the stand-in it replaced sat (300 to
      600 times); the lines after them ask the real strength itself.
    */
    const plain = { dye: solver.dye.read, velForced: solver.velForced, grain: null, particles: null, air: null, view: null };
    plate.pack.set('dyeIndexBoost', 500);
    const one = await derived(plain);
    const { w, h } = one;
    let sum = 0, sx = 0, sy = 0;
    let minLap = 1e9, maxLap = -1e9;
    /*
      The Laplacian of the path, worked out here from the path the pass
      writes in .w, with the pass's own stencil: taps 3 cells of the logical
      grid out (3 / 192 of the plate), the diagonals at half weight, times 25.
      It used to be read from .z, which carried that Laplacian, but since
      38h-3 nothing on the projected plate reads .z (the shadowgraph takes its
      Laplacian from .w itself), and PLAN 18e-2 gives .z to |∇OPL|. Taken
      from .w, the line asks the same of the path whatever .z carries; on
      main the two agree (the PR that moved this line printed both).
    */
    const k = 3 * w / 192;
    const wAt = (fx, fy) => {
      const cx = Math.min(Math.max(fx, 0), w - 1), cy = Math.min(Math.max(fy, 0), h - 1);
      const x0 = Math.min(Math.floor(cx), w - 2), y0 = Math.min(Math.floor(cy), h - 2), ax = cx - x0, ay = cy - y0;
      return (one.at(x0, y0, 3) * (1 - ax) + one.at(x0 + 1, y0, 3) * ax) * (1 - ay)
        + (one.at(x0, y0 + 1, 3) * (1 - ax) + one.at(x0 + 1, y0 + 1, 3) * ax) * ay;
    };
    let minZ = 1e9, maxZ = -1e9;
    // How closely .z follows that Laplacian (Pearson's r): main's .z is it, so the grad line is owed only while r stays high.
    let cn = 0, cz = 0, cl = 0, czz = 0, cll = 0, czl = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const g = Math.hypot(one.at(x, y, 0), one.at(x, y, 1));
      const z = one.at(x, y, 2);
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      if (x >= k && y >= k && x < w - k && y < h - k) {
        const c = one.at(x, y, 3);
        const l = ((wAt(x - k, y) + wAt(x + k, y) + wAt(x, y - k) + wAt(x, y + k) - 4 * c)
          + 0.5 * (wAt(x - k, y - k) + wAt(x + k, y - k) + wAt(x - k, y + k) + wAt(x + k, y + k) - 4 * c)) * 25;
        if (l < minLap) minLap = l;
        if (l > maxLap) maxLap = l;
        cn++; cz += z; cl += l; czz += z * z; cll += l * l; czl += z * l;
      }
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
    plate.pack.set('dyeIndexBoost', 1);
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

    /*
      What .z carries (PLAN 18e-2, owed): |∇OPL|, the slope of the path that
      deflects the light out of the projector's pupil at an edge, so a clear
      pour's rim draws in focus. Read on the two clear pools, scale-free: it
      is never negative (a magnitude), it peaks on each pool's rim (0.085 to
      0.115 of the plate from its middle, the pools' radius 0.1), it is under
      5% of that peak in each pool's flat middle (within 0.05) and in clear
      water away from everything (round 0.72, 0.72), and the syrup's rim peak
      stands to glycerine's as their index steps over water do. On main .z is
      still the Laplacian: negative inside every rim. Owed only while it is:
      while .z follows the Laplacian of .w worked out above (Pearson's r over
      0.9 on the first plate), so a .z rebuilt as anything else and missing is
      red, not owed (a signed ∂x would keep the sign test's excuse).
    */
    const ringPeak = (cx, cy) => {
      let m = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = Math.hypot((x + 0.5) / w - cx, (y + 0.5) / h - cy);
        if (d >= 0.085 && d <= 0.115) m = Math.max(m, two.at(x, y, 2));
      }
      return m;
    };
    const flatMost = (cx, cy, r) => {
      let m = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (Math.hypot((x + 0.5) / w - cx, (y + 0.5) / h - cy) <= r) m = Math.max(m, Math.abs(two.at(x, y, 2)));
      }
      return m;
    };
    /*
      And where on the rim: a slope is largest on the step itself, where the
      path is halfway between the pool's and the water's, while a Laplacian
      crosses zero there and peaks on the step's shoulders. So on the step's
      own pixels (the path 0.35 to 0.65 of the way from the water's to the
      pool's, at least 8 of them) .z is asked at 0.6 of its rim peak or more.
      A Laplacian with its negative lobe clamped away, or its absolute value,
      would pass the lines above and reads near nothing here. (A first try
      asked where the pixels near the peak sat in the step, as a mean and
      then pixel by pixel: the mean let |Laplacian|'s two lobes average to a
      half, the check-skeptic's review; pixel by pixel failed a true slope,
      whose stencil spreads one sharp step's peak over pixels wholly in or
      out of it, 3% of them mid-step in the throwaway build.)
    */
    const midStep = (p, peak) => {
      const inside = pathAt(p.x, p.y), outside = pathAt(0.72, 0.72);
      let sum = 0, k = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = Math.hypot((x + 0.5) / w - p.x, (y + 0.5) / h - p.y);
        if (d < 0.07 || d > 0.13) continue;
        const f = (two.at(x, y, 3) - outside) / (inside - outside);
        if (f < 0.35 || f > 0.65) continue;
        sum += two.at(x, y, 2); k++;
      }
      return { n: k, at: k && peak > 0 ? sum / k / peak : 0 };
    };
    let zMin = 1e9;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) zMin = Math.min(zMin, two.at(x, y, 2));
    const grad = {
      zMin,
      rims: pools.map((p) => { const peak = ringPeak(p.x, p.y); return { id: p.id, dn: indexOf(p.id) - N_WATER, peak, middle: flatMost(p.x, p.y, 0.05), ...midStep(p, peak) }; }),
      water: flatMost(0.72, 0.72, 0.05),
    };

    /*
      The dye's index at its real strength (PLAN 38u-10), against the
      measurement worked out here from the paper's numbers alone, not the
      shader's constant: tartrazine (arXiv 2503.05105) takes 25.0 per mM per
      cm at its band, molar mass 534.36 g/mol, and raises water's index by
      0.41 per g/mL. One unit of a channel's absorbance as the solver reads it
      out (readField hands back the decoded density, decodeDensity's) is 2.8
      nat across the 0.6 cm rest gap. So a dye's index rise is its three
      channels' sum times dnPerUnit. Read at 1000 times real, where the path's half floats (one
      step in about a thousandth near 1.33) resolve it to a percent or two,
      as the path over the dye's peak less the path through clear water; and
      read at 1 as .z, which the pass works out in full floats before it is
      stored, so its peak at 1 times 1000 has to be its peak at 1000: linear,
      so the default is the real strength and not a floor or a clamp.
    */
    // 25.0 L/(mmol·cm) is 25 000 L/(mol·cm), over 534.36 g/mol, in mL: about 46 800 mL/(g·cm).
    const dnPerUnit = 0.41 * (2.8 / Math.LN10 / 0.6) / (25.0e3 / 534.36 * 1000);
    let dyeIndexPeak = 0;
    for (let k = 0; k < n * n; k++) {
      dyeIndexPeak = Math.max(dyeIndexPeak, dnPerUnit * (dye[k * 4] + dye[k * 4 + 1] + dye[k * 4 + 2]));
    }
    const zPeak = (f) => { let m = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m = Math.max(m, Math.abs(f.at(x, y, 2))); return m; };
    const pathPeak = (f) => { let m = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m = Math.max(m, f.at(x, y, 3)); return m; };
    const clearPath = (f) => f.at(Math.floor(w * 0.2), Math.floor(h * 0.8), 3);
    plate.pack.set('dyeIndexBoost', 1);
    const real = await derived(plain);
    plate.pack.set('dyeIndexBoost', 1000);
    const big = await derived(plain);
    plate.pack.set('dyeIndexBoost', 1);
    const index = {
      predicted: dyeIndexPeak,
      read: (pathPeak(big) - clearPath(big)) / 1000,
      clear: clearPath(real),
      zReal: zPeak(real), zBig: zPeak(big),
    };

    const corr = (cn * czl - cz * cl) / Math.sqrt(Math.max(1e-12, (cn * czz - cz * cz) * (cn * cll - cl * cl)));
    return { sum, px: sx / sum, py: sy / sum, dx: dx / dsum, dy: dy / dsum, minLap, maxLap, minZ, maxZ, corr, paths, thickness, grad, index };
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
  check('Becke line doublet present in Laplacian (Dye Index Boost 500)', r.minLap < -0.07 && r.maxLap > 0.18,
    `Laplacian of the path (.w) min ${r.minLap.toFixed(3)}, max ${r.maxLap.toFixed(3)}; .z min ${r.minZ.toFixed(3)}, max ${r.maxZ.toFixed(3)}`);
  {
    /*
      PLAN 38u-10: the dye bends light at its measured strength. The path
      over the dye's peak rises by tartrazine's dn/dc times the dye's summed
      absorbance (within 5%, at 1000 times real), clear water still reads
      1.333 at the boost's default, and the pass's Laplacian is linear in the
      boost (1000 times its peak at 1 within 5% of its peak at 1000). And
      real is invisible: at 1 the Laplacian's peak through water's path at
      Projector Focus 1 (Δz 0.75) changes the light by under one step of a
      byte (0.39%), against the doublet line's 4%, on a strong dye (strength
      3, 8 nat in its deepest channel). The old stand-in (0.015 times the dye's density
      times up to 3 times Boundary Contrast) fails the first line by 300 to
      800 times and the last by as much.
    */
    const ix = r.index;
    const err = Math.abs(ix.read / Math.max(1e-12, ix.predicted) - 1);
    const lin = Math.abs(ix.zReal * 1000 / Math.max(1e-12, ix.zBig) - 1);
    const dim = ix.zReal * 0.75 / 1.333;
    check('38u-10: the dye raises the path by its measured index (tartrazine\'s dn/dc × its summed absorbance, within 5%), linear in Dye Index Boost, and real is too faint to see',
      ix.predicted > 1e-5 && err < 0.05 && Math.abs(ix.clear - 1.333) < 0.002 && ix.zBig > 0 && lin < 0.05 && dim < 1 / 255,
      `index rise over the dye ${ix.read.toExponential(3)} against ${ix.predicted.toExponential(3)} predicted (${(err * 100).toFixed(1)}% off); clear water ${ix.clear.toFixed(4)}; .z peak ${ix.zReal.toExponential(3)} at 1, ${ix.zBig.toFixed(4)} at 1000 (${(lin * 100).toFixed(1)}% from linear); real changes the light by ${(dim * 100).toFixed(3)}% at full defocus`);
  }
  const worst = Math.max(...r.paths.map((p) => Math.abs(p.read - p.expected)));
  check('optical path is each liquid\'s own index times its depth (glycerine, syrup, water)', worst < 0.005,
    `${r.paths.map((p) => `${p.id} ${p.read.toFixed(4)} against ${p.n} × ${r.thickness.toFixed(2)} = ${p.expected.toFixed(4)}`).join('; ')}`);
  {
    const g = r.grad, [gl, sy] = g.rims;
    const peak = Math.min(gl.peak, sy.peak);
    const ratio = (sy.peak / Math.max(1e-9, gl.peak)) / (sy.dn / gl.dn);
    const flat = Math.max(gl.middle, sy.middle, g.water);
    const atStep = g.rims.every((p) => p.n >= 8 && p.at >= 0.6);
    line('grad', '18e-2: the pass writes |∇OPL| in .z: never negative, peaking on each clear pool\'s rim and on the step itself (0.6 of the peak or more where the path is 0.35 to 0.65 of the step), under 5% of that in their middles and in clear water, syrup\'s rim over glycerine\'s as their index steps (within 15%)',
      g.zMin > -1e-3 && peak > 0 && atStep && flat < 0.05 * peak && ratio > 0.85 && ratio < 1 / 0.85,
      `.z min ${g.zMin.toFixed(4)}; rim peaks ${g.rims.map((p) => `${p.id} ${p.peak.toFixed(4)}, ${p.at.toFixed(2)} of it on the step (${p.n} px) (Δn ${p.dn.toFixed(3)}, middle ${p.middle.toFixed(4)})`).join(', ')}; clear water ${g.water.toFixed(4)}; syrup over glycerine ${ratio.toFixed(2)} of the index steps' ratio; .z against the path's Laplacian r = ${r.corr.toFixed(3)}`,
      r.corr > 0.9);
  }
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
