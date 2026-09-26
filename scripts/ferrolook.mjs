#!/usr/bin/env node
/**
 * The ferrofluid is drawn as a liquid with an edge, not as a smudge.
 *
 * Reported: "how can I get the ferrofluid effects to look more like the
 * images I provided?" The references (Chemical Bouillon's Magnetic Pattern
 * and Colored I and II, docs/bubbles-plan.md) all have a razor edge at any
 * magnification. Ours drew opacity straight from the solver's phase field,
 * whose boundary is a few cells wide on purpose, so every domain wore a brown
 * ramp 26 px deep on a 512 px plate; ripples inside a pool read as thin film
 * and let the dye through as orange worms. The plate shader now draws the
 * half-full line with a pixel of antialiasing, thickness as distance inside
 * it, and a film only where no line is near.
 *
 * One plate, poured by hand so every number is known before it is drawn,
 * off-centre in both axes so a flipped picture cannot pass:
 *
 *   - a pool with a flat full core and a dip in its middle down to about 0.65:
 *     still more than half full, so still ferrofluid, and the old drawing's
 *     worm;
 *   - a film peaking at a quarter full, which never reaches the line: a short
 *     tap of the bottle.
 *
 * The field is read back and asserted first, so the checks below are about
 * the drawing and not about a pour that did not happen. Each picture check
 * then has its control: the edge is measured where the pool actually is (and
 * not at its mirror); the glint's side is compared across a turn of the plate
 * that did move the pool; the film's darkening is against the same dye with
 * no film.
 *
 *   npm run ferrolook      (any adapter that computes: scripts/lab.mjs)
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const S = 512;
const POOL = { x: 0.30, y: 0.66, r: 0.13 };   // half full at 0.913 r: 0.119 of the plate
const DIP = { r: 0.05, a: -0.35 };
const FILM = { x: 0.72, y: 0.30, r: 0.07, a: 0.25 };
// A spot of dye that takes out red, to say where the plate is on screen
// without asking the ferrofluid.
const MARK = { x: 0.64, y: 0.78 };
// Magnet Garden's drawing, without its motion.
const LOOK = { phaseAmount: 0.9, phaseScale: 0.3, ledPlatform: true, ledMode: 'single', ledColor: '#1a1408',
  saturationBoost: 1.4, glossiness: 0.2, postBlurRadius: 0, macroMode: false };

const { page, close } = await openLab();
try {
  const field = await page.evaluate(async ({ POOL, DIP, FILM, MARK }) => {
    await lab.create(256);
    lab.dye(0.5, 0.5, 0.95, [0.25, 0.55, 1.6], 1.2);   // gold everywhere: blue absorbed most
    lab.dye(MARK.x, MARK.y, 0.03, [4, 0.2, 0.2], 1.5);
    lab.flush(); await lab.step(3);
    lab.addPhase(POOL.x, POOL.y, POOL.r, 3);
    lab.addPhase(POOL.x, POOL.y, DIP.r, DIP.a);
    lab.addPhase(FILM.x, FILM.y, FILM.r, FILM.a);
    // One step, for the plate's packed view of it; too short for the phase
    // to separate out of the shapes poured.
    await lab.step(1);
    const f = await lab.phase(); const n = f.n;
    const at = (x, y) => f.data[Math.floor(x * n) + Math.floor(y * n) * n];
    return { dip: at(POOL.x, POOL.y), core: at(POOL.x + 0.07, POOL.y), film: at(FILM.x, FILM.y) };
  }, { POOL, DIP, FILM, MARK });
  const pouredRight = field.dip > 0.55 && field.dip < 0.8 && field.core > 0.95 && field.film > 0.1 && field.film < 0.45;
  check('the plate holds what was poured', pouredRight,
    `pool core ${field.core.toFixed(2)}, its dip ${field.dip.toFixed(2)}, the film ${field.film.toFixed(2)}`);

  // A picture, and what is in it: luminance, the pool's dark centroid and
  // the edge's width round it, the glint's centroid.
  // FERROLOOK_DUMP=<dir> writes each picture there as a PNG, to look at.
  const DUMP = process.env.FERROLOOK_DUMP;
  let shots = 0;
  const shoot = async (cam, size = S) => {
    const r = await page.evaluate(async ({ S, LOOK, cam, dump }) => {
      const px = await lab.render(S, LOOK, cam);
      const L = new Array(S * S), white = new Array(S * S), red = new Array(S * S);
      for (let i = 0; i < S * S; i++) {
        L[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
        white[i] = Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
        red[i] = px[i * 4] < 0.7 * px[i * 4 + 1] ? 1 : 0;
      }
      let png = null;
      if (dump) {
        const c = new OffscreenCanvas(S, S);
        c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), S, S), 0, 0);
        const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
        let t = ''; for (const x of buf) t += String.fromCharCode(x); png = btoa(t);
      }
      return { L, white, red, png };
    }, { S: size, LOOK, cam, dump: !!DUMP });
    if (DUMP) (await import('node:fs')).writeFileSync(`${DUMP}/ferrolook-${shots++}.png`, Buffer.from(r.png, 'base64'));
    return r;
  };
  // Plate to screen at 1x: the lab draws the plate 1/1.5 of the frame across,
  // with the plate's y up and the picture's rows down.
  const toPx = (fx, fy) => [((fx - 0.5) * 1.5 + 0.5) * S, (0.5 - (fy - 0.5) * 1.5) * S];
  // Each helper refuses a frame with nothing in it to measure, rather than
  // returning a zero that a bound below would read as a pass.
  const sizeOf = (L) => Math.round(Math.sqrt(L.length));
  const refuse = (what) => { throw new Error(`nothing to measure: ${what}`); };
  const carrierOf = (L) => {
    const s = Float32Array.from(L).sort(), c = s[Math.floor(L.length * 0.6)];
    return c > 20 ? c : refuse(`the water reads ${c.toFixed(1)}, a black frame`);
  };
  // Mean width of the edge in px, inside a window: pixels between 10% and
  // 90% of the way from black to the carrier, over the boundary's length
  // (crossings of the halfway level, horizontal and vertical, over 4/π).
  const edgeIn = (L, x0, y0, x1, y1, carrier) => {
    const S = sizeOf(L), a = 0.1 * carrier, b = 0.9 * carrier, m = 0.5 * carrier;
    let band = 0, cross = 0;
    for (let y = Math.max(0, y0 | 0); y < Math.min(S - 1, y1); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(S - 1, x1); x++) {
      const v = L[x + y * S]; if (v > a && v < b) band++;
      if ((v > m) !== (L[x + 1 + y * S] > m)) cross++;
      if ((v > m) !== (L[x + (y + 1) * S] > m)) cross++;
    }
    const len = cross / (4 / Math.PI);
    return len > 20 ? { width: band / len, len } : refuse(`${len.toFixed(0)} px of edge`);
  };
  const darkCentroid = (L, carrier) => {
    const S = sizeOf(L);
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (L[x + y * S] < 0.25 * carrier) { sx += x; sy += y; n++; }
    return n > 30 ? [sx / n, sy / n, n] : refuse(`${n} dark pixels`);
  };
  const meanIn = (L, cx, cy, r0, r1) => {
    const S = sizeOf(L);
    let s = 0, n = 0;
    for (let y = Math.floor(cy - r1); y <= cy + r1; y++) for (let x = Math.floor(cx - r1); x <= cx + r1; x++) {
      const d = Math.hypot(x - cx, y - cy); if (d < r0 || d > r1 || x < 0 || y < 0 || x >= S || y >= S) continue;
      s += L[x + y * S]; n++;
    }
    return n > 0 ? s / n : refuse('an empty ring');
  };
  const maxIn = (L, cx, cy, r) => {
    const S = sizeOf(L);
    let m = 0;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if (Math.hypot(x - cx, y - cy) <= r) m = Math.max(m, L[x + y * S]);
    return m;
  };
  const cell1 = (1.5 * S) / 256;   // a solver cell at 1x, in px

  const flat = await shoot({});
  const carrier = carrierOf(flat.L);
  const [px, py] = toPx(POOL.x, POOL.y), [mx, my] = toPx(POOL.x, 1 - POOL.y);
  const rPx = 0.119 * 1.5 * S;
  let rx = 0, ry = 0, rn = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (flat.red[x + y * S]) { rx += x; ry += y; rn++; }
  const [kx, ky] = toPx(MARK.x, MARK.y);
  check('the plate is on screen where this check thinks (a spot of dye)', rn > 50 && Math.hypot(rx / rn - kx, ry / rn - ky) < 8,
    `the spot at ${(rx / Math.max(1, rn)).toFixed(0)},${(ry / Math.max(1, rn)).toFixed(0)} px, expected ${kx.toFixed(0)},${ky.toFixed(0)}`);
  const [dx, dy] = darkCentroid(flat.L, carrier);
  check('the pool is drawn where it was poured, not at its mirror',
    Math.hypot(dx - px, dy - py) < 0.2 * rPx && Math.hypot(dx - mx, dy - my) > rPx,
    `dark at ${dx.toFixed(0)},${dy.toFixed(0)} px; poured at ${px.toFixed(0)},${py.toFixed(0)}, mirror ${mx.toFixed(0)},${my.toFixed(0)}`);

  const w = 1.4 * rPx;
  const e1 = edgeIn(flat.L, px - w, py - w, px + w, py + w, carrier);
  // Under one solver cell, set before measuring: the old ramp was six.
  check('its edge is a line, not a ramp, at 1x', e1.width < cell1 && e1.len > 0.7 * 2 * Math.PI * rPx,
    `${e1.width.toFixed(1)} px wide (a cell is ${cell1.toFixed(1)}) over ${e1.len.toFixed(0)} px of edge (a circle there is ${(2 * Math.PI * rPx).toFixed(0)})`);

  const z = 3, ex = POOL.x + 0.119, ey = POOL.y;
  // Magnified with the closeup's own texture off (macroAmount 0): its bead
  // rings in the dye have edges of their own, and this is about the ferrofluid's.
  const close3 = await shoot({ zoom: z, cx: ex, cy: ey, macroAmount: 0 });
  const e3 = edgeIn(close3.L, 0, 0, S, S, carrierOf(close3.L));
  /*
    Magnified, a solver cell is 9 px, and the edge keeps a sliver of amber a
    cell deep on purpose (the meniscus, where a real ferrofluid lets the lamp
    through). So the measure here is in cells: from black to the water in
    well under one, where the old drawing's ramp took three.
  */
  const cell3 = (1.5 * z * S) / 256;
  check('and a line through the closeup, at 3x', e3.width < 0.7 * cell3 && e3.len > 0.5 * S,
    `${e3.width.toFixed(1)} px wide (${(e3.width / cell3).toFixed(2)} of a cell) over ${e3.len.toFixed(0)} px of edge`);

  const deep = maxIn(flat.L, px, py, 0.08 * 1.5 * S);
  check('a pool is black all through, its dip included', deep < 0.12 * carrier,
    `brightest inside ${deep.toFixed(1)} against the gold's ${carrier.toFixed(1)}`);

  /*
    Outside the line, where the pool's own ramp still has phase in it (it runs
    out about three cells past): the old drawing's smudge lived here, and so
    would any film read off the ramp. Three to six cells out, where this ring
    used to be measured, there is no phase at all and it read the dye.
  */
  const halo = meanIn(flat.L, px, py, rPx + 1 * cell1, rPx + 2.5 * cell1);
  check('and nothing outside it is ferrofluid', halo > 0.93 * carrier,
    `one to two and a half cells out ${halo.toFixed(1)} against ${carrier.toFixed(1)}`);

  // The meniscus: the curved edge gathers the lamp into a line just outside.
  const rim = meanIn(flat.L, px, py, rPx, rPx + 0.5 * cell1);
  check('with a bright meniscus round it', rim > 1.1 * carrier,
    `the first half cell out ${rim.toFixed(1)} against ${carrier.toFixed(1)}`);

  const [fx, fy] = toPx(FILM.x, FILM.y);
  const filmL = meanIn(flat.L, fx, fy, 0, 0.02 * 1.5 * S);
  const [cfx, cfy] = toPx(FILM.x, 1 - FILM.y);
  const bareL = meanIn(flat.L, cfx, cfy, 0, 0.02 * 1.5 * S);
  check('a film too thin to reach the line still shows', filmL < 0.85 * bareL,
    `under it ${filmL.toFixed(1)} against the same dye bare ${bareL.toFixed(1)}`);

  /*
    The glint's side, against the pool, before and after a quarter turn. It
    must be where the key light is, upper left on the screen (the shader's
    key, (-0.55, 0.45) with uv's y up, is -141° with the picture's rows
    down), and stay there: set in the plate's frame it went round with the
    plate.
  */
  const KEY = Math.atan2(-0.45, -0.55);
  const side = (shot) => {
    const S = sizeOf(shot.L), c = carrierOf(shot.L), [ox, oy] = darkCentroid(shot.L, c);
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++)
      if (shot.white[x + y * S] > 150 && Math.hypot(x - ox, y - oy) < 1.1 * rPx) { sx += x; sy += y; n++; }
    return { o: [ox, oy], ang: n ? Math.atan2(sy / n - oy, sx / n - ox) : NaN, n };
  };
  const off = (a) => { let d = Math.abs(a - KEY); if (d > Math.PI) d = 2 * Math.PI - d; return d * 180 / Math.PI; };
  const turned = await shoot({ rotation: Math.PI / 2 });
  const s0 = side(flat), s1 = side(turned);
  const moved = Math.hypot(s0.o[0] - s1.o[0], s0.o[1] - s1.o[1]);
  check('the glint is on the light\'s side, and stays there as the plate turns',
    s0.n >= 5 && s1.n >= 5 && moved > 40 && off(s0.ang) < 25 && off(s1.ang) < 25,
    `pool moved ${moved.toFixed(0)} px; glint ${off(s0.ang).toFixed(0)}° then ${off(s1.ang).toFixed(0)}° off the light (${s0.n}, ${s1.n} px)`);

  /*
    Not checked here: that the edge stays as sharp on a turned plate. The
    shader's antialiasing is now the length of one screen step across the
    plate, where fwidth (which adds the two axes) made it up to √2 pixels at
    45°. Measured on this pool the difference is smaller than what turning
    the phase's grid under the pixels does on its own: at 128 px across,
    1.07 turned against square on with the fix and 1.12 without; at 96 px,
    0.87 against 0.95. A bound between those would be measuring the grid.
  */
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
