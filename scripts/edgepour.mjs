#!/usr/bin/env node
/**
 * A pour off the screen's edge flows into the picture (PLAN 18a-18; `npm run
 * edgepour`: the mapping in node, then the lab, a few minutes on SwiftShader).
 *
 * What was asked (the owner, 2026-11-27): to pour off screen and have it flow
 * into view. The dish always ran past the picture (the wall is the middle of
 * a plate 1.5 times its long side, wgsl/plate.ts uvToFluid), but no hand could
 * reach it. lib/pointerPlate.ts gives the bottle's tools a band at the
 * screen's edge that reaches past it; the solver's own volume source (PLAN
 * 18c-1) brings what is poured there in.
 *
 * The mapping (lib/pointerPlate.ts), on a 16:9 wall and a portrait phone,
 * turned 0.7 rad. Which hands ask for reach (LAYING_TOOLS in the visualizer's
 * getTransformedMousePos, the remote's drop in useRemote's onWall) is the
 * app's wiring, which this does not run; the Mac's `bottles` and `drawwall`
 * drive those paths:
 *  1. Without reach every point lands where the visualizer's own code put it
 *     before the move (OLD below, copied from 7519c13: both layers, the second
 *     through its own view, the closeup off centre, spread dishes), to 1e-9
 *     of a cell: the move out of LiquidVisualizer changed nothing. And in
 *     the closeup or with the layers spread, reach changes nothing.
 *  2. With reach, the screen inside the band lands exactly where it did.
 *  3. Each edge's middle lands out of sight, REACH_PAST of the plate past the
 *     picture's edge (to 1e-6), and every edge point and corner inside the
 *     rim's keep (RIM_KEEP), on the dish and not in the overflow trough, a
 *     square wall's corners too (the only walls the clamp acts on).
 *  4. Along a line from the middle to each edge and corner the landing only
 *     moves outward, with no jump: no pixel moves it more than 0.003 of the
 *     plate (half a cell of the 192² plate).
 *
 * The lab (the real solver, 128², thin gap, the app's default glass), a Pour
 * held 5 s (300 steps at 60 a second) at the landing of the 16:9 wall's right
 * edge and of its top edge, laying its colour each step and the bottle's
 * stream as volume (pourShare, HELD_POUR) as the app's Pour does:
 *  0. The lab ran the thin gap with no GPU error, laid the pour (more than a
 *     step's colour after the first step) and kept it (the control keeps at
 *     least half of what the pour with volume holds), so 6 and 8 cannot pass
 *     on an empty plate.
 *  6. It lands out of sight: after its first step none of its colour is in
 *     the picture (under 0.1%).
 *  7. Its own volume brings it in: after 5 s at least 10% of what was poured
 *     is inside the picture from each edge.
 *  8. The control: the same colour laid with no volume (a pour that only
 *     paints, the plate before 18c) stays out of sight, under 1% in the
 *     picture, so 7 is the liquid's flow and not the brush's own spread.
 */
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

const out = 'node_modules/.cache/edgepour-lib.mjs';
await build({
  stdin: {
    contents: [
      "export * from './src/lib/pointerPlate';",
      "export { pourShare } from './src/lib/liquidProps';",
      "export { OPEN_RIM } from './src/lib/turntable';",
    ].join('\n'),
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
});
const L = await import(pathToFileURL(`${process.cwd()}/${out}`).href);
const { pointerOnPlate, REACH_PAST, RIM_KEEP, PLATE_SPAN, pourShare, OPEN_RIM } = L;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const G = 192;
const VIEW = { zoom: 1, dx: 0, dy: 0 };
/*
  The visualizer's fluidPointAt as it was at 7519c13, the non-spread path,
  copied here so 1 compares against the code the move replaced and not
  against itself.
*/
function OLD(px, py, w, h, layer, angle, cx, cy, zoom, spread, view) {
  const cxp = px - w / 2, cyp = -(py - h / 2);
  const scale = Math.max(w, h) * 1.5 / G;
  const rx = cxp * Math.cos(-angle) - cyp * Math.sin(-angle);
  const ry = cxp * Math.sin(-angle) + cyp * Math.cos(-angle);
  const z = Math.max(0.0001, zoom);
  if (spread > 0.001) {
    const aspect = w / Math.max(1, h);
    const cen = layer === 0 ? [0.5 + 0.144 * spread / aspect, 0.5 - 0.02 * spread] : [0.5 - 0.304 * spread / aspect, 0.5 + 0.06 * spread];
    const rad = layer === 0 ? 0.98 + (0.66 - 0.98) * spread : 0.98 + (0.36 - 0.98) * spread;
    const u = px / w, v = 1 - py / h;
    let dx = (u - cen[0]) * aspect / (rad * 0.5), dy = (v - cen[1]) / (rad * 0.5);
    const ca = Math.cos(-angle), sa = Math.sin(-angle);
    const qx = ca * dx - sa * dy, qy = sa * dx + ca * dy;
    dx = qx; dy = qy;
    return { x: (0.5 + dx * 0.5) * G, y: (0.5 + dy * 0.5) * G };
  }
  let fx = rx / (scale * z) + cx * G;
  let fy = ry / (scale * z) + cy * G;
  if (layer === 1 && zoom <= 1.0001 && view.zoom > 1.001) {
    fx = ((fx / G - 0.5) / view.zoom + 0.5 + view.dx) * G;
    fy = ((fy / G - 0.5) / view.zoom + 0.5 + view.dy) * G;
  }
  return { x: fx, y: fy };
}
const on = (px, py, w, h, angle, reach, zoom = 1) => pointerOnPlate(px, py, w, h, 0, angle, 0.5, 0.5, zoom, 0, VIEW, G, reach);
// A landing in plate units from the dish's middle, turned back out of the layer's turn: the picture's own axes.
const unturn = (p, angle) => {
  const x = p.x / G - 0.5, y = p.y / G - 0.5, c = Math.cos(angle), s = Math.sin(angle);
  return { x: c * x - s * y, y: s * x + c * y };
};

const WALLS = [[1920, 1080, 'wall 16:9'], [390, 844, 'phone portrait']];
const ANGLE = 0.7;
{
  let worstOld = 0, worstInner = 0, cases = 0;
  const VIEW1 = { zoom: 1.3, dx: 0.02, dy: -0.03 }, INNER = 1 - L.REACH_BAND;
  // Every path the old code had: both layers (the second through its own view), the closeup off centre, spread dishes.
  for (const [w, h] of WALLS) for (const layer of [0, 1]) for (const [zoom, cx, cy] of [[1, 0.5, 0.5], [2.3, 0.42, 0.61]]) for (const spread of [0, 0.5])
    for (let j = 0; j <= 30; j++) for (let i = 0; i <= 30; i++) {
      const px = (i / 30) * w, py = (j / 30) * h;
      const a = pointerOnPlate(px, py, w, h, layer, ANGLE, cx, cy, zoom, spread, VIEW1, G, false);
      const o = OLD(px, py, w, h, layer, ANGLE, cx, cy, zoom, spread, VIEW1);
      worstOld = Math.max(worstOld, Math.hypot(a.x - o.x, a.y - o.y)); cases++;
      // And reach asked for where it must not act (the closeup, spread dishes) changes nothing either.
      if (zoom > 1 || spread > 0) {
        const r = pointerOnPlate(px, py, w, h, layer, ANGLE, cx, cy, zoom, spread, VIEW1, G, true);
        worstOld = Math.max(worstOld, Math.hypot(r.x - o.x, r.y - o.y));
      }
    }
  for (const [w, h] of WALLS) for (let j = 0; j <= 60; j++) for (let i = 0; i <= 60; i++) {
    const px = (i / 60) * w, py = (j / 60) * h;
    const a = on(px, py, w, h, ANGLE, false);
    const ax = Math.abs(2 * px / w - 1), ay = Math.abs(2 * py / h - 1);
    if (ax < INNER - 1e-9 && ay < INNER - 1e-9) {
      const r = on(px, py, w, h, ANGLE, true);
      worstInner = Math.max(worstInner, Math.hypot(r.x - a.x, r.y - a.y));
    }
  }
  check('1. without reach every point lands where the old code put it, and the closeup and spread dishes never reach', worstOld < 1e-9,
    `worst ${worstOld.toExponential(1)} cells over ${cases} points`);
  check('2. with reach the screen inside the band lands where it did', worstInner === 0, `worst ${worstInner.toExponential(1)} cells`);
}
{
  let past = [], insideAll = true, outRim = 0;
  for (const [w, h, name] of WALLS) {
    const long = Math.max(w, h) * PLATE_SPAN, hx = w / 2 / long, hy = h / 2 / long;
    const mids = [[w, h / 2, 'x', hx], [0, h / 2, 'x', hx], [w / 2, 0, 'y', hy], [w / 2, h, 'y', hy]];
    for (const [px, py, ax, half] of mids) {
      const q = unturn(on(px, py, w, h, ANGLE, true), ANGLE);
      const want = Math.min(half + REACH_PAST, RIM_KEEP);
      past.push({ name, err: Math.abs(Math.abs(q[ax]) - want), beyond: Math.abs(q[ax]) - half });
    }
  }
  // The walls above never reach the keep at a corner; a square wall's corners would land past the rim (0.54) unheld.
  for (const [w, h] of [...WALLS, [1000, 1000]]) for (let k = 0; k <= 200; k++) {
    const t = k / 200;
    for (const [px, py] of [[t * w, 0], [t * w, h], [0, t * h], [w, t * h]]) {
      const q = unturn(on(px, py, w, h, ANGLE, true), ANGLE);
      const r = Math.hypot(q.x, q.y);
      outRim = Math.max(outRim, r);
      if (r > RIM_KEEP + 1e-9) insideAll = false;
    }
  }
  const worstErr = Math.max(...past.map((p) => p.err)), least = Math.min(...past.map((p) => p.beyond));
  check('3a. each edge\'s middle lands REACH_PAST out of sight', worstErr < 1e-6 && least > REACH_PAST - 1e-6,
    `the nearest lands ${least.toFixed(4)} of the plate past the picture (want ${REACH_PAST}), worst error ${worstErr.toExponential(1)}`);
  check('3b. and every edge point and corner on the dish, inside the rim\'s keep (a square wall too)', insideAll,
    `farthest ${outRim.toFixed(4)} from the middle, keep ${RIM_KEEP.toFixed(2)}, rim ${OPEN_RIM}`);
}
{
  let backward = 0, jump = 0;
  for (const [w, h] of WALLS) {
    for (const [ex, ey] of [[w, h / 2], [0, h / 2], [w / 2, 0], [w / 2, h], [0, 0], [w, h], [w, 0], [0, h]]) {
      const n = Math.ceil(Math.hypot(ex - w / 2, ey - h / 2));
      let last = null;
      for (let k = 0; k <= n; k++) {
        const px = w / 2 + (ex - w / 2) * k / n, py = h / 2 + (ey - h / 2) * k / n;
        const q = unturn(on(px, py, w, h, ANGLE, true), ANGLE);
        const r = Math.hypot(q.x, q.y);
        if (last) {
          if (r < last.r - 1e-12) backward++;
          jump = Math.max(jump, Math.hypot(q.x - last.q.x, q.y - last.q.y) / Math.max(1e-9, Math.hypot(ex - w / 2, ey - h / 2) / n));
        }
        last = { r, q };
      }
    }
  }
  check('4. from the middle out the landing only moves outward, with no jump', backward === 0 && jump < 0.003,
    `${backward} steps back; the most a pixel moves it ${jump.toFixed(5)} of the plate (bar 0.003)`);
}

// The lab: a held Pour at the 16:9 wall's right edge and top edge, as the app's hand lands it.
const [W, H] = WALLS[0];
const longW = Math.max(W, H) * PLATE_SPAN;
const FRAME = { x: W / 2 / longW, y: H / 2 / longW };
const at = (px, py) => { const p = on(px, py, W, H, 0, true); return [p.x / G, p.y / G]; };
const SPOTS = { right: at(W, H / 2), top: at(W / 2, 0) };
const R = 4 * (G / 128) / G;               // the hand loop's Pour: 4 cells of the 128 its geometry was tuned at
const STEPS = 300, DT = 1 / 60;
const TAKE = pourShare(R, 1, DT);
console.log(`      the pour: radius ${R.toFixed(4)} of the plate, ${TAKE.toFixed(4)} of its dome a step; right ${SPOTS.right.map((v) => v.toFixed(3))}, top ${SPOTS.top.map((v) => v.toFixed(3))}; picture ±${FRAME.x.toFixed(3)} × ±${FRAME.y.toFixed(3)}`);

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
let res;
try {
  res = await page.evaluate(async ({ SPOTS, R, TAKE, STEPS, FRAME }) => {
    const N = 128;
    const share = async () => {
      const d = await lab.field('dye');
      let all = 0, seen = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = d[(i + j * N) * 4 + 3];
        const x = (i + 0.5) / N - 0.5, y = (j + 0.5) / N - 0.5;
        all += a;
        if (Math.abs(x) < FRAME.x && Math.abs(y) < FRAME.y) seen += a;
      }
      if (!(all > 0) || !Number.isFinite(all)) throw new Error(`edgepour: the dye read back ${all}`);
      return { all, seen: seen / all };
    };
    const run = async ([x, y], volume) => {
      await lab.create(N, N);
      await lab.step(1, { thinGap: 1 });
      let first = null;
      for (let k = 0; k < STEPS; k++) {
        lab.dye(x, y, R, [0.2, 0.6, 1.0], 0.05);
        lab.addSpecies(x, y, R, TAKE, 'water', volume);
        lab.flush();
        await lab.step(1, { thinGap: 1 }, true);
        if (k === 0) first = await share();
      }
      return { first, last: await share(), thin: lab.thinLive() };
    };
    return {
      right: await run(SPOTS.right, true),
      top: await run(SPOTS.top, true),
      flat: await run(SPOTS.right, false),
    };
  }, { SPOTS, R, TAKE, STEPS, FRAME });
} finally { await close(); }

{
  const pct = (v) => `${(100 * v).toFixed(2)}%`;
  check('0. the lab ran the thin gap, laid the pour and kept it', res.right.thin && res.top.thin && res.flat.thin
    && res.right.first.all > 1 && res.top.first.all > 1 && res.flat.last.all > 0.5 * res.right.last.all && gpuErrors.length === 0,
    `dye after a step ${res.right.first.all.toFixed(2)} / ${res.top.first.all.toFixed(2)}, after 5 s ${res.right.last.all.toFixed(1)} (no volume ${res.flat.last.all.toFixed(1)}); ${gpuErrors.length} GPU errors`);
  check('6. the pour lands out of sight', res.right.first.seen < 1e-3 && res.top.first.seen < 1e-3,
    `in the picture after one step: right ${pct(res.right.first.seen)}, top ${pct(res.top.first.seen)}`);
  check('7. held 5 s, its own volume brings it into the picture', res.right.last.seen >= 0.1 && res.top.last.seen >= 0.1,
    `in the picture: from the right ${pct(res.right.last.seen)}, from the top ${pct(res.top.last.seen)} (bar 10%)`);
  check('8. control: the colour with no volume stays out of sight', res.flat.last.seen < 0.01,
    `${pct(res.flat.last.seen)} in the picture (bar 1%)`);
  if (gpuErrors.length) console.log(`      gpu: ${gpuErrors.slice(0, 3).join(' | ')}`);
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
