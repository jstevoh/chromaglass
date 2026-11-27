import { OPEN_RIM } from './turntable';

/*
  Where a hand on the screen lands on the plate, and the hand that reaches
  past the screen's edge onto the dish the audience cannot see (PLAN 18a-18).

  What was asked (the owner, 2026-11-27): to pour off screen and have the
  liquid flow into the picture. The dish was always larger than the picture:
  the plate shader shows the middle of the plate with the screen's long side a
  plate-width over 1.5 (wgsl/plate.ts, uvToFluid), so on a 16:9 wall the dish's
  open rim (OPEN_RIM, 0.5 from the middle) is a sixth of the plate past the
  left and right edges and nearly a third past the top and bottom. That apron
  is real liquid, solved like the rest: it turns with the dish, runs downhill
  with the Tilt, and is pushed by what is poured beside it. What no hand could
  do was get there, since a pointer stops at the edge of the screen.

  So the outer band of the screen reaches. Inside `REACH_BAND` of each edge a
  laying hand (the bottle's tools, `reach`) is carried outward, smoothly from
  where it stands to `REACH_PAST` of the plate beyond the edge at the edge
  itself, and never past `RIM_KEEP`, so the pour lands on the dish and not in
  the overflow trough. The rest of the screen lands under the finger exactly
  as before (the identity, to the last bit: `npm run edgepour` holds it).

  Why the liquid then comes into view is the solver's, not a trick of this
  file: a bottle's pour is a volume source in the thin gap (PLAN 18c-1,
  hsDivergence, pourVolume), so what is poured fills a growing disc
  √(V/πh) and pushes the liquid round it outward, and its front crosses the
  frame's edge from the side the hand poured on. The lab measures that
  (`npm run edgepour`). Why 0.05 of the plate past the edge and not the rim:
  next to the open rim (p = 0 past it) the pushed liquid takes the short way
  out over it, so a pour at the rim mostly spills. A held bottle lets go half
  a millilitre a second (HELD_POUR), which between glasses 2 mm apart covers
  2.5 cm² a second: a disc of 1 cm, 0.05 of the 20 cm dish, in about 1.3 s,
  and 2 cm in 5 s. So at 0.05 the pour's own disc (6 cells, 0.03) lands out
  of sight on every side, and what it pours reaches the picture in a second
  or two and keeps coming in while it is held; at 0.08 it took 3 s to show.

  Why a band and not dragging off the canvas: on a full-screen wall and on a
  phone there is nothing past the canvas to drag onto. The Finger, the Press,
  the Blow, the Magnet and the Spin stay under the hand (a stir that moved
  where nothing can be seen would read as a dead tool), and so does every
  hand in the closeup or with the layers spread into dishes, where the picture
  is not the middle of the plate.
*/

/** The wall's long side as a share of the plate is 1 / PLATE_SPAN (wgsl/plate.ts, uvToFluid). */
export const PLATE_SPAN = 1.5;
/** The outer share of each half of the screen that reaches past its edge. */
export const REACH_BAND = 0.16;
/** The share of the band its push eases in over before it runs even (reachAxis). */
export const REACH_EASE = 0.3;
/** How far past the screen's edge, in plate widths, a laying hand at the very edge lands. */
export const REACH_PAST = 0.05;
/** The farthest out from the dish's middle a reaching hand lands: the pour's own radius inside the open rim. */
export const RIM_KEEP = OPEN_RIM - 0.04;

/**
 * One axis of the band: `a` the hand's place in half-spans of the screen from
 * its middle (±1 at the edges, past them over a letterbox's bars), `R` how
 * many half-spans out the edge reaches. Identity inside 1 − REACH_BAND; in the
 * band (1 − b) + b·t + (R − 1)·f(t), t the depth into it, f rising from 0 with
 * no slope (so the band meets the identity without a kink) to 1 at the edge.
 *
 * f is a short parabola into a straight line (REACH_EASE of the band, then
 * even), not t² all the way: t² ends twice as steep as its average, and on a
 * phone's narrow side the band is 31 pixels for 0.075 of the plate, so the
 * last pixels moved the pour 0.0039 of the plate each (0.8 mm of the dish a
 * pixel, `npm run edgepour` line 4). The ramp ends at 1/(1 − c/2) of the
 * average, 1.18 times, and the hand carries the pour out at an even pace.
 */
export function reachAxis(a: number, R: number): number {
  const m = Math.abs(a), s = 1 - REACH_BAND;
  if (m <= s || !(R > 1)) return a;
  const t = Math.min(1, (m - s) / REACH_BAND), c = REACH_EASE;
  const f = t < c ? t * t / (c * (2 - c)) : (2 * t - c) / (2 - c);
  return Math.sign(a) * (s + REACH_BAND * t + (R - 1) * f);
}

/** How many half-spans out an edge reaches, for a half-span of `half` plate widths. */
export function reachOf(half: number): number {
  return half > 0 ? Math.max(1, Math.min(half + REACH_PAST, RIM_KEEP) / half) : 1;
}

/**
 * A point on the screen as a point on the plate, in cells of a `grid`-wide
 * plate, not rounded. `px`, `py` are from the drawn picture's top left in CSS
 * pixels (y down), `w`, `h` its size. `angle` is the layer's turn, `cx`, `cy`,
 * `zoom` the camera's shot, `spread` the layers spread into dishes, `view` the
 * second layer's own zoom and drift. `reach` asks for the band above.
 */
export function pointerOnPlate(
  px: number, py: number, w: number, h: number, layer: number, angle: number,
  cx: number, cy: number, zoom: number, spread: number,
  view: { zoom: number; dx: number; dy: number }, grid: number, reach = false,
): { x: number; y: number } {
  let cxp = px - w / 2;
  let cyp = -(py - h / 2); // the plate's uv counts up, CSS counts down
  const long = Math.max(w, h) * PLATE_SPAN;
  const reaching = reach && zoom <= 1.0001 && spread <= 0.001 && w > 0 && h > 0;
  if (reaching) {
    // Written back only where the band moved it, so the rest of the screen is the old point to the bit.
    const ax = cxp / (w / 2), bx = reachAxis(ax, reachOf(w / 2 / long));
    const ay = cyp / (h / 2), by = reachAxis(ay, reachOf(h / 2 / long));
    if (bx !== ax) cxp = bx * (w / 2);
    if (by !== ay) cyp = by * (h / 2);
  }
  const scale = long / grid;
  const rx = cxp * Math.cos(-angle) - cyp * Math.sin(-angle);
  const ry = cxp * Math.sin(-angle) + cyp * Math.cos(-angle);
  // Mirror the shader's camera transform so the brush lands under the
  // cursor at any magnification.
  const z = Math.max(0.0001, zoom);
  if (spread > 0.001) {
    // The layers are spread into dishes: this layer's dish is its whole plate.
    const aspect = w / Math.max(1, h);
    const cen = layer === 0 ? [0.5 + 0.144 * spread / aspect, 0.5 - 0.02 * spread] : [0.5 - 0.304 * spread / aspect, 0.5 + 0.06 * spread];
    const rad = layer === 0 ? 0.98 + (0.66 - 0.98) * spread : 0.98 + (0.36 - 0.98) * spread;
    const u = px / w, v = 1 - py / h;
    const dx = (u - cen[0]) * aspect / (rad * 0.5), dy = (v - cen[1]) / (rad * 0.5);
    const ca = Math.cos(-angle), sa = Math.sin(-angle);
    return { x: (0.5 + (ca * dx - sa * dy) * 0.5) * grid, y: (0.5 + (sa * dx + ca * dy) * 0.5) * grid };
  }
  let fx = rx / (scale * z) + cx * grid;
  let fy = ry / (scale * z) + cy * grid;
  // The second layer is viewed through its own zoom and drift.
  if (layer === 1 && zoom <= 1.0001 && view.zoom > 1.001) {
    fx = ((fx / grid - 0.5) / view.zoom + 0.5 + view.dx) * grid;
    fy = ((fy / grid - 0.5) / view.zoom + 0.5 + view.dy) * grid;
  }
  if (reaching) {
    // A corner reaches along both axes at once: held inside the rim, about the dish's middle.
    const ox = fx / grid - 0.5, oy = fy / grid - 0.5, r = Math.hypot(ox, oy);
    if (r > RIM_KEEP) { fx = (0.5 + ox * RIM_KEEP / r) * grid; fy = (0.5 + oy * RIM_KEEP / r) * grid; }
  }
  return { x: fx, y: fy };
}
