#!/usr/bin/env node
/**
 * The closeup's relief is the liquid's optical path, read at the lens.
 *
 *   npm run camrelief      (the lab: any adapter that computes)
 *
 * What was reported (2026-11-13), on Comet River: "I don't really like the
 * super thick black lines around things." PLAN 18e-5 took the line between
 * two dyes off the wall; up close it stayed, because the closeup's relief
 * (Macro Relief, camShadow in wgsl/plateTransmit.ts, the shadowgraph of a
 * camera focused a little past the liquid) had only ever been handed the
 * colour step between two dyes by the derive pass's camera branch. It shaded
 * every seam up to half darker, scaled by Boundary Contrast, and a swell of
 * the liquid drew nothing. PLAN 18e-7 hands it the path (OPL = n·h, the
 * dye's stand-in index at gain 1) and reads its curvature over the lens's
 * disc (camLap). Two readings were tried before and taken back: nothing (a
 * flat closeup), and the path's nine-tap Laplacian, which read a bubble's
 * hole in the dye as a cliff of path and blew a cluster of bubbles up to
 * flat white on the Mac.
 *
 * holeline asks the seam (the dial moves nothing up close; a seam at one
 * depth is no darker than its two dyes) and macroview that the closeup is
 * still shaded on every look. Asked here, at 4x, each picture against the
 * same plate with Macro Relief at 0, so what is measured is the relief alone:
 *
 *   1. a swell gathers light: flat dye over a dome in the gap (the column
 *      SWELL thicker in its middle, a Gaussian of SIGMA of the plate, laid at
 *      DOME, off the frame's middle) is brighter in its middle by more than
 *      LIFT levels and darker on a ring at 2.5 sigma by more than FLANK of
 *      that (a Gaussian's Laplacian there is -0.09 of its middle's). The
 *      colour step drew nothing here (a dome of one dye has no colour step)
 *   1b. and makes no light: what the whole frame gains, summed and signed,
 *      is under KEEP of what the dome's core (within 1.4 sigma) gains; a
 *      relief that only brightened would sum to more than the core
 *   1c. and the lift is the dome's: at its mirror across the frame (a field
 *      read flipped would put it there) and at its own place with the gap
 *      level, the relief moves the middle under LIFT/3
 *   2. a bubble's hole is the bubble's: on a cluster of holes cut in one dye
 *      (the air as the app cuts it, bubbleClear 1; the bubbles' own drawing
 *      off and their air handed to the plate, so only the dye is seen), the
 *      relief at full Macro Relief moves no pixel by more than BUB_MAX levels
 *      and turns none white
 *   2b. and the mask is the holes' alone: on the same plate, with the same
 *      air handed over, a dome laid at FAR, clear of the cluster, still lifts
 *      by more than LIFT (a mask spread over the frame would pass line 2 by
 *      drawing nothing)
 *   2c. the control, the same shader with the air taken out of camLap
 *      (CONTROL_AIR), moves some pixel round the cluster by more than
 *      BUB_CONTROL, or the plate is not one the mask is needed on
 *
 * Before anything is judged, the plates are asked to be what they say: the
 * dome is in the gap the plate reads (the relief picture must differ from
 * one without the dome), and at least five of the holes are cut to the glass.
 */
import { openLab } from './lab.mjs';
import { readFileSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** The bubbles at 4x; the swell at 2x, so the dome, its flanks and its mirror all sit in the frame. */
const N = 256, SIZE = 384, ZOOM = 4, SWELL_ZOOM = 2;
const SWELL = 0.015, SIGMA = 0.02, LIFT = 6, KEEP = 0.25, FLANK = 0.05;
/** The dome off the frame's middle (the camera at 0.5, 0.5), and the far dome on the bubbles' plate, 4.5 sigma clear of the cluster's edge. */
const DOME = [0.56, 0.535], FAR = [0.66, 0.5];
const BUB_MAX = 12, BUB_CONTROL = 30, CUT = 24;

/*
  The control: camLap with the air not read, so a tap that lands in a hole
  reads the hole's path (the dye gone) as the liquid's. Found once or it throws.
*/
const CONTROL_AIR = {
  name: 'no-cam-air',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]plateTransmit\.ts$/ }, (a) => {
      let s = readFileSync(a.path, 'utf8');
      const cut = 'let airy = textureDimensions(air).x > 1u;';
      const found = s.split(cut).length - 1;
      if (found !== 1) throw new Error(`camrelief: the air control found ${found} of 1 "${cut}" in wgsl/plateTransmit.ts`);
      return { contents: s.replace(cut, 'let airy = false;'), loader: 'ts' };
    });
  },
};

const measure = (page, which) => page.evaluate(async ({ N, SIZE, ZOOM, SWELL_ZOOM, SWELL, SIGMA, CUT, DOME, FAR, which }) => {
  const S = SIZE, P = S * S;
  const pink = [1.2, 0.3, 0.8];
  const lum = (p, i) => 0.2126 * p[4 * i] + 0.7152 * p[4 * i + 1] + 0.0722 * p[4 * i + 2];
  const shot = async (set, cam = {}) => {
    const p = new Uint8ClampedArray(await lab.render(S, { macroMode: true, ...set }, { zoom: ZOOM, macroAmount: 1, cx: 0.5, cy: 0.5, ...cam }));
    if (p.length !== P * 4) throw new Error(`camrelief: a picture came back ${p.length} bytes, not ${P * 4}`);
    return p;
  };
  const flood = async (lo, hi) => {
    await lab.create(N);
    for (let y = lo; y < hi; y += 0.01) for (let x = lo; x < hi; x += 0.01) lab.dye(x, y, 0.012, pink, 1.3);
    lab.flush(); await lab.step(6);
  };
  const out = {};
  // The plate's view (oil, mix, gap) laid by hand: level, or with a dome in
  // the gap at (x, y). Read back by the plate through the solver's view.
  const sol0 = () => lab.solver();
  const layDome = (x0, y0, amp) => {
    const sol = sol0(), dev = sol.device, n = sol.fields.view.width;
    const view = dev.createTexture({ size: [n, n], format: 'rgba32uint', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    const words = new Uint32Array(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const dx = (i + 0.5) / n - x0, dy = (j + 0.5) / n - y0;
      words[(i + j * n) * 4 + 3] = Math.round(65535 * 0.03 * (1 + amp * Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA))) / 0.06);
    }
    dev.queue.writeTexture({ texture: view }, words, { bytesPerRow: n * 16 }, [n, n]);
    sol.viewTex = view;
  };
  // The frame shows 1/(1.5 ZOOM) of the plate: plate distance d is d * 1.5 * ZOOM * S pixels from the camera's point.
  let px = 1.5 * ZOOM * S;
  // Columns run with the plate's u; rows against its v (the picture comes
  // back the other way up from the plate's texture: FLIP_Y, lab-entry.ts).
  const colOf = (u, cu) => S / 2 + (u - cu) * px, rowOf = (v, cv) => S / 2 - (v - cv) * px;
  // The mean (and sum) of p - q over a ring about pixel (cx, cy).
  const ring = (p, q, cx, cy, r0, r1) => {
    let s = 0, k = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (r < r0 || r >= r1) continue;
      s += lum(p, x + y * S) - lum(q, x + y * S); k++;
    }
    if (k < 20) throw new Error(`camrelief: a ring of ${r0.toFixed(0)}-${r1.toFixed(0)} px held ${k} pixels`);
    return { mean: s / k, sum: s };
  };
  if (which === 'plain') {
    // 1. The swell, off the frame's middle so its mirror is somewhere else.
    await flood(0.1, 0.9);
    px = 1.5 * SWELL_ZOOM * S;
    const z2 = { zoom: SWELL_ZOOM };
    const [dx, dy] = DOME, sx = colOf(dx, 0.5), sy = rowOf(dy, 0.5), mx = S - sx, my = S - sy, sig = SIGMA * px;
    layDome(dx, dy, SWELL);
    const on = await shot({}, z2), flat = await shot({ macroRelief: 0 }, z2);
    layDome(dx, dy, 0);
    const level = await shot({}, z2), levelFlat = await shot({ macroRelief: 0 }, z2);
    let frame = 0, dome = 0;
    for (let i = 0; i < P; i++) { frame += lum(on, i) - lum(flat, i); dome = Math.max(dome, Math.abs(lum(on, i) - lum(level, i))); }
    out.swell = {
      middle: ring(on, flat, sx, sy, 0, 0.3 * sig).mean,
      flank: ring(on, flat, sx, sy, 2.2 * sig, 2.8 * sig).mean,
      mirror: ring(on, flat, mx, my, 0, 0.3 * sig).mean,
      bare: ring(level, levelFlat, sx, sy, 0, 0.3 * sig).mean,
      core: ring(on, flat, sx, sy, 0, Math.SQRT2 * sig).sum,
      frame,
      dome,
    };
  }
  // 2. The bubbles: a cluster of holes cut in one dye.
  px = 1.5 * ZOOM * S;
  await flood(0.2, 0.8);
  let s = 11; const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  const holes = [];
  for (let k = 0; k < 10; k++) holes.push({ x: 0.5 + (r() - 0.5) * 0.14, y: 0.5 + (r() - 0.5) * 0.14, r: (1.5 + r() * 3) / N });
  lab.solver().setBubbles(new Float32Array(holes.flatMap((h) => [h.x, h.y, h.r, 1])), holes.length, 0.25, new Float32Array(holes.length * 4));
  await lab.step(2, { bubbleClear: 1 });
  const cam = { bubbles: 0, airField: true };
  const on = await shot({ macroRelief: 1 }, cam), flat = await shot({ macroRelief: 0 }, cam);
  // Each hole in the frame is cut: its middle far from the dye at the frame's corner.

  const ref = lum(flat, 4 + 4 * S);
  const cuts = holes.map((h) => ({ x: Math.floor(colOf(h.x, 0.5)), y: Math.floor(rowOf(h.y, 0.5)) })).filter((h) => h.x >= 0 && h.x < S && h.y >= 0 && h.y < S).map((h) => Math.abs(lum(flat, h.x + h.y * S) - ref));
  let most = 0, white = 0;
  const isWhite = (p, i) => p[4 * i] >= 254 && p[4 * i + 1] >= 254 && p[4 * i + 2] >= 254;
  for (let i = 0; i < P; i++) {
    for (let k = 0; k < 3; k++) most = Math.max(most, Math.abs(on[4 * i + k] - flat[4 * i + k]));
    if (isWhite(on, i) && !isWhite(flat, i)) white++;
  }
  // The mask is the holes', not the frame's: a dome laid far from the cluster
  // on this same plate, its air handed over, still lifts. A mask that spread
  // over everything would leave it flat, and line 2 would read 0 for that.
  const [fx, fy] = FAR;
  layDome(fx, fy, SWELL);
  const farCam = { ...cam, cx: fx, cy: fy };
  const fOn = await shot({}, farCam), fFlat = await shot({ macroRelief: 0 }, farCam);
  const far = ring(fOn, fFlat, S / 2, S / 2, 0, 0.3 * SIGMA * px).mean;
  out.bubbles = { most, white, cuts, CUT, far };
  return out;
}, { N, SIZE, ZOOM, SWELL_ZOOM, SWELL, SIGMA, CUT, DOME, FAR, which });

const t0 = Date.now();
const plain = await openLab();
let now, ctl;
try { now = await measure(plain.page, 'plain'); } finally { await plain.close(); }
const off = await openLab({ plugins: [CONTROL_AIR], tag: 'no-cam-air' });
try {
  if (off.js === plain.js) throw new Error('camrelief: the air control built the same bundle as the plain lab (its edit matched nothing)');
  ctl = await measure(off.page, 'control');
} finally { await off.close(); }
console.log(`   (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

const sw = now.swell;
console.log(`   the swell (the gap ${SWELL * 100}% thicker in its middle): middle ${sw.middle.toFixed(1)} levels, flank ${sw.flank.toFixed(1)}, at its mirror ${sw.mirror.toFixed(1)}, the same place with no dome ${sw.bare.toFixed(1)}; the frame's sum ${sw.frame.toFixed(0)} against the core's ${sw.core.toFixed(0)}; the dome moves the relief picture ${sw.dome.toFixed(0)} levels`);
for (const [name, b] of [['the shader', now.bubbles], ['the control (no air in camLap)', ctl.bubbles]]) {
  console.log(`   ${name}, bubbles: the relief moves a pixel at most ${b.most} levels, ${b.white} turned white; holes cut ${b.cuts.map((c) => c.toFixed(0)).join(', ')} levels from the dye; a dome away from them lifts ${b.far.toFixed(1)}`);
}

// The plates are what they say.
if (!(sw.dome > LIFT)) throw new Error(`camrelief: the dome moves the relief picture ${sw.dome} levels (the gap was not read)`);
for (const b of [now.bubbles, ctl.bubbles]) {
  // The smallest (1.5 cells) do not always clear to the glass at their middle; most must.
  const cut = b.cuts.filter((c) => c > CUT).length;
  if (cut < 5) throw new Error(`camrelief: ${cut} holes cut in the dye in the frame, not 5 or more (${b.cuts.map((c) => c.toFixed(0)).join(', ')})`);
}

check(`1. a swell gathers light: its middle ${sw.middle.toFixed(1)} levels brighter (> ${LIFT}), its flank ${sw.flank.toFixed(1)} (< -${FLANK} of the middle; the law says -0.09)`,
  sw.middle > LIFT && sw.flank < -FLANK * sw.middle);
check(`1b. and makes no light: the frame's summed change ${sw.frame.toFixed(0)} is under ${KEEP} of what the dome's core gains (${sw.core.toFixed(0)})`,
  sw.core > 0 && Math.abs(sw.frame) < KEEP * sw.core);
check(`1c. and it is the dome's: at its mirror across the frame ${sw.mirror.toFixed(1)}, and where it was with no dome ${sw.bare.toFixed(1)}, both under ${(LIFT / 3).toFixed(0)} levels`,
  Math.abs(sw.mirror) < LIFT / 3 && Math.abs(sw.bare) < LIFT / 3);
check(`2. a bubble's hole is the bubble's: the relief moves no pixel round a cluster of holes by more than ${BUB_MAX} levels (${now.bubbles.most}) and turns none white (${now.bubbles.white})`,
  now.bubbles.most <= BUB_MAX && now.bubbles.white === 0);
check(`2b. and the mask is the holes' alone: a dome on the same plate away from them lifts ${now.bubbles.far.toFixed(1)} levels (> ${LIFT})`,
  now.bubbles.far > LIFT);
check(`2c. and the line can fail: without the air in camLap the relief moves a pixel there ${ctl.bubbles.most} levels (> ${BUB_CONTROL})`,
  ctl.bubbles.most > BUB_CONTROL);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
