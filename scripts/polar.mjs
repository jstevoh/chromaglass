#!/usr/bin/env node
/**
 * Polarised light (PLAN 31p-1): `npm run polar`.
 *
 * What was asked (the owner, 2026-11-14): the colours of the photograph of
 * moulded dishes between polarising sheets (references/still-polarized-dishes),
 * modelled on the real optics. The laws are in lib/polar.ts and the plate
 * computes them per pixel from the solver's flow (gpu/wgsl/platePolar.ts).
 * This holds the feature, not a moment of the plate:
 *
 *   A. The laws, in numbers (node). The plane-sheet law and the quarter-wave
 *      law against Jones matrices multiplied out, case by case. The shader's
 *      sum of three table colours against T integrated wavelength by
 *      wavelength, across retardations, axes, analyser turns and plates (the
 *      linearity the tables rest on, and their 20 nm rows). Nothing retarded
 *      between crossed sheets is black and between parallel ones white;
 *      crossed and parallel add to white at every pixel (complements). The
 *      Michel-Levy order: straw-white near 300 nm, orange near 450, the
 *      first-order red-purple at 550 (green the lowest), blue near 650.
 *      Plane sheets crossed are black along an isoclinic whatever the
 *      retardation; quarter-wave plates crossed are the same at every axis.
 *      Far past the table the orders are a grey of a half. The flow's
 *      stretch: simple shear stretches along 45 degrees at half its rate,
 *      and a turning without stretching (solid rotation) retards nothing.
 *
 *   B. Off is off (the lab, the real shaders). Polarisers at 0 is the plate
 *      to the byte with the analyser, quarter wave and Birefringence moved;
 *      at Polarisers 1 each of those moves the picture.
 *
 *   C. Still is dark. Under grey dye (the open plate at about half, so a gain
 *      error is not hidden by the clip), a plate with no flow is black between
 *      crossed sheets and the open plate between parallel ones.
 *
 *   D. A flow laid by hand and held to the law pixel by pixel. A turning,
 *      made the solver's own by one step: a vortex turning bodily in the
 *      middle and stretched toward the walls. Crossed and parallel add in
 *      light to the open plate at every pixel (this fails without the
 *      encode); every crossed pixel is a colour of the Michel-Levy chart; with
 *      plane sheets the diagonals (stretch along x and y) are black and the
 *      axes (stretch at 45) lit, and turned 45 degrees under the sheets the two
 *      swap (the axis carried to the wall); the vortex's middle moves and is
 *      dark (speed is not stretch). Three broken shaders were run against it,
 *      2026-11-14: no encode, the axis not carried, light from speed; each
 *      goes red.
 *
 *   E. A stirred plate lights in colour between crossed sheets, is black
 *      again at Birefringence 0, and with plane sheets leaves at least twice
 *      the near-black of the quarter-wave plates (the isoclinics).
 */
import { openLab } from './lab.mjs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

// ── A. The laws ────────────────────────────────────────────────────
const lawsOut = 'node_modules/.cache/polar-laws.mjs';
await build({
  stdin: { contents: "export * from './src/lib/polar.ts';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: lawsOut, logLevel: 'warning',
});
const L = await import(pathToFileURL(`${process.cwd()}/${lawsOut}`).href);
const deg = (d) => (d * Math.PI) / 180;
let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

{
  // Jones calculus, multiplied out: unpolarised light is the mean of two orthogonal inputs.
  const C = (r, i = 0) => ({ r, i });
  const add = (a, b) => C(a.r + b.r, a.i + b.i), mul = (a, b) => C(a.r * b.r - a.i * b.i, a.r * b.i + a.i * b.r);
  const mm = (A, B) => [0, 1].map((i) => [0, 1].map((j) => add(mul(A[i][0], B[0][j]), mul(A[i][1], B[1][j]))));
  const rot = (t) => [[C(Math.cos(t)), C(-Math.sin(t))], [C(Math.sin(t)), C(Math.cos(t))]];
  const ret = (d, t) => mm(mm(rot(t), [[C(1), C(0)], [C(0), C(Math.cos(d), Math.sin(d))]]), rot(-t));
  const pol = (t) => mm(mm(rot(t), [[C(1), C(0)], [C(0), C(0)]]), rot(-t));
  const through = (M) => {
    let s = 0;
    for (const v of [[C(1), C(0)], [C(0), C(1)]]) {
      const o = [add(mul(M[0][0], v[0]), mul(M[0][1], v[1])), add(mul(M[1][0], v[0]), mul(M[1][1], v[1]))];
      s += o[0].r ** 2 + o[0].i ** 2 + o[1].r ** 2 + o[1].i ** 2;
    }
    return s; // of the polariser's half: (mean of the two) / (1/2)
  };
  let worstP = 0, worstQ = 0;
  for (let k = 0; k < 300; k++) {
    const G = rnd() * 2500, th = rnd() * Math.PI, al = rnd() * Math.PI, l = 380 + rnd() * 400, d = (2 * Math.PI * G) / l;
    const plane = through(mm(pol(al), mm(ret(d, th), pol(0))));
    const quarter = through(mm(pol(al), mm(ret(Math.PI / 2, -Math.PI / 4), mm(ret(d, th), mm(ret(Math.PI / 2, Math.PI / 4), pol(0))))));
    worstP = Math.max(worstP, Math.abs(plane - L.polarTransmission(G, th, al, l, 0)));
    worstQ = Math.max(worstQ, Math.abs(quarter - L.polarTransmission(G, th, al, l, 1)));
  }
  check('the plane-sheet law is the Jones matrices multiplied out', worstP < 1e-9, `worst ${worstP.toExponential(1)} over 300 cases`);
  check('and so is the quarter-wave law', worstQ < 1e-9, `worst ${worstQ.toExponential(1)}`);
}
{
  let worst = 0, at = '';
  for (let k = 0; k < 400; k++) {
    const G = rnd() * 2900, th = rnd() * Math.PI, al = rnd() * Math.PI, q = k % 3 === 0 ? 0 : k % 3 === 1 ? 1 : rnd();
    const a = L.polarColour(G, th, al, q), b = L.polarSpectral(G, th, al, q);
    if (a.length !== 3 || b.length !== 3) { worst = Infinity; break; }
    const e = Math.max(...a.map((v, c) => Math.abs(v - b[c])));
    if (e > worst) { worst = e; at = `G ${G.toFixed(0)} nm`; }
  }
  check("the shader's three table colours are T integrated wavelength by wavelength", worst < 0.02, `worst ${worst.toFixed(4)} (${at})`);
}
{
  const black = [0, 1].every((q) => L.polarColour(0, deg(30), deg(90), q).every((v) => Math.abs(v) < 1e-9));
  const white = [0, 1].every((q) => L.polarColour(0, deg(30), 0, q).every((v) => Math.abs(v - 1) < 1e-9));
  check('nothing retarded is black between crossed sheets and white between parallel ones', black && white);
  let worst = 0;
  for (let k = 0; k < 200; k++) {
    const G = rnd() * 2900, th = rnd() * Math.PI, al = rnd() * Math.PI, q = rnd();
    const a = L.polarColour(G, th, al, q), b = L.polarColour(G, th, al + Math.PI / 2, q);
    if (a.length !== 3 || b.length !== 3) { worst = Infinity; break; }
    worst = Math.max(worst, ...a.map((v, c) => Math.abs(v + b[c] - 1)));
  }
  check('a turn of the analyser by 90 degrees gives the complement: the two add to white', worst < 1e-9, `worst ${worst.toExponential(1)}`);
}
{
  const at = (G) => L.polarColour(G, deg(22.5), deg(90), 1);
  const [w, o, r, b] = [300, 450, 550, 650].map(at);
  const f = (c) => c.map((v) => v.toFixed(2)).join(' ');
  check('the Michel-Levy order: near-white at 300 nm, orange at 450, red-purple at 550 (green lowest), blue at 650',
    Math.min(...w) > 0.45 && o[0] > o[1] && o[1] > o[2] && r[1] < r[0] && r[1] < r[2] && b[2] > b[0] && b[2] > b[1],
    `300 [${f(w)}] 450 [${f(o)}] 550 [${f(r)}] 650 [${f(b)}]`);
}
{
  const iso = [200, 550, 1300].every((G) => L.polarColour(G, 0, deg(90), 0).every((v) => Math.abs(v) < 1e-9)
    && L.polarColour(G, deg(90), deg(90), 0).every((v) => Math.abs(v) < 1e-9));
  check('plane sheets crossed are black along an isoclinic (the stretch along a sheet) at any retardation', iso);
  let worst = 0;
  for (const G of [200, 550, 1300]) {
    const a = L.polarColour(G, 0, deg(90), 1);
    if (a.length !== 3) worst = Infinity;
    for (const th of [0.3, 0.9, 1.4, 2.5]) worst = Math.max(worst, ...L.polarColour(G, th, deg(90), 1).map((v, c) => Math.abs(v - a[c])));
  }
  check('quarter-wave plates crossed are the same colour at every axis: no isoclinics', worst < 1e-9, `worst ${worst.toExponential(1)}`);
}
{
  const far = L.polarSpectral(6000, deg(22.5), deg(90), 1), drawn = L.polarColour(6000, deg(22.5), deg(90), 1);
  check('far past the table the orders are a grey of a half, spectrum and shader alike',
    far.every((v) => Math.abs(v - 0.5) < 0.06) && drawn.every((v) => Math.abs(v - 0.5) < 1e-6), `spectrum [${far.map((v) => v.toFixed(3)).join(' ')}]`);
}
{
  const g = 2;
  const [G, th, e] = L.flowRetardation([0, 0], [g, 0], 1);
  check('simple shear stretches along 45 degrees at half its rate', Math.abs(e - g / 2) < 1e-12 && Math.abs(th - Math.PI / 4) < 1e-12 && Math.abs(G - L.BIREF_NM_PER_STRAIN) < 1e-9,
    `e ${e}, axis ${(th * 180 / Math.PI).toFixed(1)}°`);
  const [G2] = L.flowRetardation([0, 3], [-3, 0], 1);
  check('a solid rotation turns the liquid without stretching it, and retards nothing', G2 === 0);
}

// ── B to E: the real shaders, in the lab ──────────────────────────
const { page, close } = await openLab();
try {
  const out = await page.evaluate(async () => {
    const S = 192;
    const C = S >> 1;
    const stats = (px, ref) => {
      let sum = 0, max = 0, dark = 0, sat = 0, diff = 0, n = 0;
      for (let k = 0; k < px.length; k += 4) {
        const r = px[k], g = px[k + 1], b = px[k + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        sum += mx; max = Math.max(max, mx); if (mx < 24) dark++; if (mx > 60 && mx - mn > 60) sat++;
        if (ref) diff = Math.max(diff, Math.abs(r - ref[k]), Math.abs(g - ref[k + 1]), Math.abs(b - ref[k + 2]));
        n++;
      }
      return { mean: sum / n, max, dark: dark / n, sat: sat / n, diff };
    };
    // The middle half of the picture: the walls hold the flow still at the plate's edge, and that is strain.
    const middle = (px) => {
      const o = [];
      for (let y = S / 4; y < (3 * S) / 4; y++) for (let x = S / 4; x < (3 * S) / 4; x++) { const k = (y * S + x) * 4; o.push(px[k], px[k + 1], px[k + 2], 255); }
      return o;
    };
    const centre = (px) => { const k = (C * S + C) * 4; return [px[k], px[k + 1], px[k + 2]]; };
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    const lamp = { lampGround: 1 };
    // A flow laid exactly, u(x, y), v(x, y) in the solver's units, then one step for the plate to carry it.
    const laid = async (fn) => {
      const { L } = await lab.create(256);
      lab.dye(0.5, 0.5, 0.7, [0.5, 0.5, 0.5], 0.9);
      const v = new Array(L * L * 4).fill(0);
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const [u, w] = fn((i + 0.5) / L - 0.5, (j + 0.5) / L - 0.5);
        v[(i + j * L) * 4] = u; v[(i + j * L) * 4 + 1] = w;
      }
      lab.addVel(v); lab.flush(); await lab.step(1);
      return L;
    };
    const res = {};
    // A still plate under grey dye (the open plate well below white, so a gain error is not hidden by the clip).
    await lab.create(256);
    lab.dye(0.5, 0.5, 0.7, [0.5, 0.5, 0.5], 0.9);
    lab.flush(); await lab.step(6);
    const stillOff = Array.from(await lab.render(S, lamp));
    res.stillOffMean = stats(stillOff).mean;
    res.stillCrossed = stats(Array.from(await lab.render(S, { ...lamp, polariser: 1 })));
    res.stillParallel = stats(Array.from(await lab.render(S, { ...lamp, polariser: 1, analyserAngle: 0 })), stillOff);
    /*
      A flow laid by hand, u = -4y, v = 4x (a turning), and one step for the
      solver to make it its own: the walls take its flux through them away, so
      what stands is a vortex turning bodily in the middle (fast, unstretched)
      and stretched toward the walls, speed and stretch apart across the
      picture, with the four-fold symmetry of the box.
    */
    const L = await laid((x, y) => [-4 * y, 4 * x]);
    const vel = await lab.field('vel');
    const cell = (fx, fy) => { const i = Math.round(fx * L - 0.5), j = Math.round(fy * L - 0.5); const k = (i + j * L) * 4; return Math.hypot(vel[k], vel[k + 1]); };
    // The lab's camera at zoom 1 shows the middle two thirds of the plate (uvToFluid: a pixel is 1/(1.5 S) of the plate),
    // turned by `rotation`; the field's four-fold symmetry makes the turn's sense and the rows' direction not matter here.
    const pixelOf = (fx, fy, turn) => {
      const x = fx - 0.5, y = fy - 0.5, c = Math.cos(turn), s = Math.sin(turn);
      return [Math.round(S / 2 + (c * x + s * y) * 1.5 * S), Math.round(S / 2 + (-s * x + c * y) * 1.5 * S)];
    };
    const px3 = (img, [x, y]) => { const k = (y * S + x) * 4; return [img[k], img[k + 1], img[k + 2]]; };
    const vOff = Array.from(await lab.render(S, lamp));
    const vCross = Array.from(await lab.render(S, { ...lamp, polariser: 1 }));
    const vPar = Array.from(await lab.render(S, { ...lamp, polariser: 1, analyserAngle: 0 }));
    const vPlane = Array.from(await lab.render(S, { ...lamp, polariser: 1, quarterWave: 0 }));
    const vTurned = Array.from(await lab.render(S, { ...lamp, polariser: 1, quarterWave: 0 }, { zoom: 1, rotation: Math.PI / 4 }));
    // The middle half's pixels, as ratios to the open plate, for the identity and the curve.
    res.ratios = [];
    for (let y = S / 4; y < (3 * S) / 4; y += 3) for (let x = S / 4; x < (3 * S) / 4; x += 3) {
      const o = px3(vOff, [x, y]);
      res.ratios.push({ off: o, cross: px3(vCross, [x, y]), par: px3(vPar, [x, y]), plane: px3(vPlane, [x, y]) });
    }
    // On the diagonals the stretch lies along x and y (an isoclinic at no turn); on the axes at 45 degrees.
    const diag = [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]], axes = [[0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7]];
    const bright = (img, pts, turn) => pts.map(([fx, fy]) => Math.max(...px3(img, pixelOf(fx, fy, turn))));
    res.axis = { diag0: bright(vPlane, diag, 0), axes0: bright(vPlane, axes, 0), diag45: bright(vTurned, diag, Math.PI / 4), axes45: bright(vTurned, axes, Math.PI / 4) };
    // Speed against stretch: the vortex's middle is its fastest liquid short of the walls' layers, and unstretched.
    res.speed = { core: cell(0.56, 0.5), axis: cell(0.7, 0.5), coreLight: Math.max(...px3(vCross, pixelOf(0.53, 0.5, 0))) };
    // Each dial reaches the shader: at Polarisers 1 every one of them moves the bytes.
    const base = Array.from(await lab.render(S, { ...lamp, polariser: 1, quarterWave: 0.5 }));
    res.reach = {
      analyserAngle: !same(base, Array.from(await lab.render(S, { ...lamp, polariser: 1, quarterWave: 0.5, analyserAngle: 20 }))),
      quarterWave: !same(base, Array.from(await lab.render(S, { ...lamp, polariser: 1, quarterWave: 0.2 }))),
      birefringence: !same(base, Array.from(await lab.render(S, { ...lamp, polariser: 1, quarterWave: 0.5, birefringence: 0.9 }))),
    };
    // A stirred plate.
    await lab.create(256);
    lab.dye(0.5, 0.5, 0.3, [0.25, 0.12, 0.05], 0.3);
    lab.flush(); await lab.step(36, { turbScale: 0.3 });
    const off = Array.from(await lab.render(S, lamp));
    const offMoved = Array.from(await lab.render(S, { ...lamp, polariser: 0, analyserAngle: 20, quarterWave: 0.2, birefringence: 0.9 }));
    const crossed = Array.from(await lab.render(S, { ...lamp, polariser: 1 }));
    res.offIsOff = same(off, offMoved); res.control = !same(off, crossed);
    res.crossed = stats(crossed);
    res.plane = stats(Array.from(await lab.render(S, { ...lamp, polariser: 1, quarterWave: 0 })));
    res.none = stats(Array.from(await lab.render(S, { ...lamp, polariser: 1, birefringence: 0 })));
    return res;
  });
  const f = (s) => `mean ${s.mean.toFixed(1)}, max ${s.max}, dark ${(100 * s.dark).toFixed(1)}%, coloured ${(100 * s.sat).toFixed(1)}%`;
  check('Polarisers at 0 is the plate to the byte with the analyser, quarter wave and Birefringence moved', out.offIsOff);
  check('control: Polarisers at 1 is not the same bytes', out.control);
  check('and at Polarisers 1 each of those dials reaches the picture', Object.values(out.reach).every(Boolean), JSON.stringify(out.reach));
  check('a still plate between crossed sheets is black', out.stillCrossed.max <= 3, f(out.stillCrossed));
  check('and between parallel sheets it is the open plate (grey dye, not clipped)', out.stillParallel.diff <= 3 && out.stillOffMean > 60 && out.stillOffMean < 200,
    `largest difference ${out.stillParallel.diff} levels, open plate mean ${out.stillOffMean.toFixed(0)}`);
  {
    const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const enc = (v) => { const x = Math.max(0, v); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; };
    /*
      Crossed and parallel are complements in light: on the open plate's grey,
      lin(crossed/off) + lin(parallel/off) = 1. The bar is the picture's own
      grain: each of the three numbers is rounded to a level and dithered by
      one, and the decode's slope near white is 2.4, so two terms can miss by
      about ten levels at a pixel; the mean holds the rest. Without the encode
      the sum misses by tens of levels.
    */
    let sumAll = 0, sumN = 0;
    let worstSum = 0, worstCurve = 0, lit = 0;
    const curve = [];
    for (let G = 0; G <= 3000; G += 4) curve.push(L.polarColour(G, 0, Math.PI / 2, 1).map(enc));
    for (const r of out.ratios) {
      for (let c = 0; c < 3; c++) {
        const sum = lin(r.cross[c] / r.off[c]) + lin(r.par[c] / r.off[c]);
        worstSum = Math.max(worstSum, Math.abs(sum - 1) * r.off[c]);
        sumAll += Math.abs(sum - 1) * r.off[c]; sumN++;
      }
      // And every pixel through the quarter-wave plates crossed is a colour on the Michel-Levy curve, times the open plate.
      const q = r.cross.map((v, c) => v / r.off[c]);
      let best = Infinity;
      for (const k of curve) best = Math.min(best, Math.max(...k.map((v, c) => Math.abs(v - q[c]) * r.off[c])));
      worstCurve = Math.max(worstCurve, best);
      if (Math.max(...r.cross) > 30) lit++;
    }
    check('crossed and parallel add, in light, to the open plate at every pixel of a laid flow', worstSum <= 12 && sumAll / sumN <= 2, `worst ${worstSum.toFixed(1)}, mean ${(sumAll / sumN).toFixed(2)} levels over ${out.ratios.length} pixels`);
    check('and every pixel crossed is a colour of the Michel-Levy chart on the open plate', worstCurve <= 8 && lit > out.ratios.length / 4, `worst ${worstCurve.toFixed(1)} levels, ${lit} of ${out.ratios.length} lit`);
    const A = out.axis;
    check('plane sheets crossed: where the stretch lies along x and y it is black, where it lies at 45 degrees it is lit',
      Math.max(...A.diag0) <= 5 && Math.min(...A.axes0) > 30, `diagonals ${A.diag0.join(' ')}, axes ${A.axes0.join(' ')}`);
    check('and turned 45 degrees under the sheets the two swap: the axis is carried to the wall',
      Math.max(...A.axes45) <= 5 && Math.min(...A.diag45) > 30, `diagonals ${A.diag45.join(' ')}, axes ${A.axes45.join(' ')}`);
    check('speed is not stretch: the vortex\'s middle turns bodily, at a fifth or more of the speed out on the axis, and stays dark',
      out.speed.core > 0.2 * out.speed.axis && out.speed.coreLight <= 30, `speed ${out.speed.core.toFixed(2)} in the middle against ${out.speed.axis.toFixed(2)} out on the axis, light ${out.speed.coreLight}`);
  }
  check('stirred, crossed sheets light it in colour', out.crossed.mean > 60 && out.crossed.sat > 0.2, f(out.crossed));
  check('at Birefringence 0 the stirred plate is black again: the light is the retardation\'s', out.none.max <= 3, f(out.none));
  check('the quarter-wave plates take the dark lines out: plane sheets leave at least twice the near-black',
    out.plane.dark >= 2 * Math.max(out.crossed.dark, 0.005), `plane ${(100 * out.plane.dark).toFixed(1)}%, quarter-wave ${(100 * out.crossed.dark).toFixed(1)}%`);
} finally {
  await close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
