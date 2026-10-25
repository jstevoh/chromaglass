/**
 * Where Clock Glass lays its oil when the look is laid.
 *
 * Here, apart from the app, for the reason `phasePour.ts` is: so the lab
 * (`npm run clockglass`) lays exactly the bodies the app lays, from the same
 * draws, rather than a copy of them that drifts.
 *
 * A clock-glass dish, as the owner's reference photographs of the Joshua
 * Light Show and the Fillmore show it, is coloured oil and coloured water
 * that will not mix: cells of red, amber and blue oil, each ringed by its
 * dark meniscus, sitting in a purple water, several to a frame and in
 * different parts of it. The look used to lay three water dyes in rings on
 * top of one another, and water dyes are one liquid, so they blended into a
 * single lavender disc within seconds (the Mac gallery at 12 s and 30 s).
 */

/** One body of oil: its middle and radius in plate units, and which of the look's dyes is in it. */
export interface OilBody { x: number; y: number; r: number; dye: number }

/*
  How many, and how big. Twelve, a thirtieth to a sixteenth of the plate
  across (radius 0.03 to 0.065), scattered over the dish out to 0.37 of the
  plate from its middle, denser towards the middle as the bowed glasses
  gather them (the square root makes the scatter even by area; the 0.05
  floor keeps one from sitting exactly on the middle, where the look's
  syrup goes). In the lab at 256² with the look's Oil Tension, nine bodies
  of up to 0.075 merged into four or five in five seconds and filled half
  the dish; twelve smaller ones leave water between them for the colours to
  read as cells. The bodies take the dyes after the first (the water's) in
  turn, so every colour the look names is in the dish from the start.
*/
export const CLOCK_GLASS_BODIES = 12;

/**
 * The bodies for one lay, drawn from `float` (a seeded stream's `float`, so
 * the same seed lays the same dish). `dyes` is how many dyes the look names;
 * the first is the water's, and each body carries one of the others.
 */
export function clockGlassBodies(float: () => number, dyes: number): OilBody[] {
  const out: OilBody[] = [];
  const others = Math.max(1, dyes - 1);
  for (let i = 0; i < CLOCK_GLASS_BODIES; i++) {
    const a = float() * Math.PI * 2;
    const d = 0.05 + 0.32 * Math.sqrt(float());
    const r = 0.03 + 0.035 * float();
    out.push({ x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d, r, dye: 1 + (i % others) });
  }
  return out;
}

/*
  How much dye each liquid is laid with: the water's wash at its middle, a
  Gaussian WASH_SIGMA of the plate (splatBlob's 34 in 128-grid units, which
  the look laid its water with before), and each body's colour, flat through
  its oil.
*/
export const WASH_AMOUNT = 1.3;
export const WASH_SIGMA = 34 / 128;
export const BODY_DYE = 2.6;

/**
 * What one cell of a plate `n` cells across is laid with: how much of it is
 * oil (`oil`, as addMix lays a body, flat to its edge, here with a cell of
 * antialiasing), which body that is (`body`, −1 for none), and the water's
 * and the body's dye in it. The water's dye is not in the oil, so the wash
 * is laid round the bodies and not under them: under them, every body was its
 * own colour mixed with the water's. And a body's colour only in its oil:
 * laid as a Gaussian it ran out past the oil into a ring in the water.
 */
export function clockGlassCell(x: number, y: number, n: number, bodies: readonly OilBody[]): { oil: number; body: number; water: number; dye: number } {
  let oil = 0, body = -1;
  bodies.forEach((b, q) => {
    const c = Math.max(0, Math.min(1, (b.r - Math.hypot(x - b.x, y - b.y)) * n + 0.5));
    if (c > oil) { oil = c; body = q; }
  });
  const w = Math.exp(-((x - 0.5) ** 2 + (y - 0.5) ** 2) / (2 * WASH_SIGMA * WASH_SIGMA));
  return { oil, body, water: w >= 0.01 ? WASH_AMOUNT * w * (1 - oil) : 0, dye: body >= 0 ? BODY_DYE * oil : 0 };
}

/*
  The splodascope's dish (the owner's photograph, 2026-10-25): a crowd of
  round cells of coloured oil packed edge to edge in a blue water, from
  specks to cells a fifth of the frame across, and here and there a cell
  with another inside it. It reads as a crowd only because the drops do
  not merge where they touch, which is Film Hold's work (FILM_WGSL in
  wgsl/fluid.ts); this lays the crowd for it to hold.

  Sizes are log-normal, as drops broken from drops are (beads.ts says why),
  laid biggest first: each is tried at random places in the dish until it
  sits clear of every drop already down by SPLOD_GAP, the water film the
  hold keeps, or is given up. That is random sequential packing, which
  stops near half the dish covered for a spread of sizes like this one,
  and the flow and the bowed glass crowd them closer from there.

  A compound drop is a drop of one oil inside a ring of water inside a drop
  of another: a big drop that swallowed a smaller one through a film that
  held. One big drop in SPLOD_NEST gets one, a water hole set off its
  middle, and in the hole a drop of a different colour a film smaller than
  the hole.
*/
export const SPLOD_DROPS = 120;
export const SPLOD_TRIES = 60;
export const SPLOD_MEDIAN = 0.032, SPLOD_SIGMA = 0.5, SPLOD_MIN = 0.016, SPLOD_MAX = 0.11;
export const SPLOD_GAP = 0.02;
export const SPLOD_WASH = 0.5;
/*
  How much of each oil: the photograph is yellow most of all, then green,
  red and pink about alike (shares of the drops, by the dyes after the
  water's, in order). And each drop's colour laid at under half Clock
  Glass's depth (BODY_DYE): the photograph's cells are pale enough that
  yellow over the blue reads green, where a deep one reads black.
*/
export const SPLOD_SHARE = [0.4, 0.2, 0.2, 0.2];
export const SPLOD_BODY_DYE = 1.2;
export const SPLOD_REACH = 0.41;
export const SPLOD_NEST = 2;

/** A disc of oil laid (oil 1) or a hole cut in one (oil −1), in plate units, laid in order. */
export interface OilDisc { x: number; y: number; r: number; oil: 1 | -1; dye: number }

/**
 * The splodascope's dish for one lay, from `float` (a seeded stream). The
 * discs are laid in order, a hole after the drop it is cut in and the
 * drop inside it after the hole. `dyes` as clockGlassBodies takes it: the
 * first is the water's.
 */
export function splodascopeDiscs(float: () => number, dyes: number): OilDisc[] {
  const others = Math.max(1, dyes - 1);
  const sizes: number[] = [];
  for (let i = 0; i < SPLOD_DROPS; i++) {
    let r = SPLOD_MEDIAN;
    for (let t = 0; t < 16; t++) {
      const z = Math.sqrt(-2 * Math.log(1 - float())) * Math.cos(2 * Math.PI * float());
      const v = SPLOD_MEDIAN * Math.exp(SPLOD_SIGMA * z);
      if (v >= SPLOD_MIN && v <= SPLOD_MAX) { r = v; break; }
    }
    sizes.push(r);
  }
  sizes.sort((a, b) => b - a);
  const placed: { x: number; y: number; r: number }[] = [];
  const out: OilDisc[] = [];
  let big = 0;
  for (const r of sizes) {
    for (let t = 0; t < SPLOD_TRIES; t++) {
      const a = float() * Math.PI * 2;
      const d = (SPLOD_REACH - r) * Math.sqrt(float());
      const x = 0.5 + Math.cos(a) * d, y = 0.5 + Math.sin(a) * d;
      if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < q.r + r + SPLOD_GAP)) continue;
      placed.push({ x, y, r });
      const dye = 1 + splodDye(float(), others);
      out.push({ x, y, r, oil: 1, dye });
      if (r > 0.055 && big++ % SPLOD_NEST === 0) {
        const hr = r * (0.45 + 0.15 * float());
        const off = (r - hr - SPLOD_GAP) * float(), oa = float() * Math.PI * 2;
        const hx = x + Math.cos(oa) * off, hy = y + Math.sin(oa) * off;
        out.push({ x: hx, y: hy, r: hr, oil: -1, dye: 0 });
        const inner = 1 + ((dye - 1 + 1 + Math.floor(float() * Math.max(1, others - 1))) % others);  // any but its own
        out.push({ x: hx, y: hy, r: hr - SPLOD_GAP, oil: 1, dye: inner });
      }
      break;
    }
  }
  return out;
}

/** Which of `others` oils a drop is, by SPLOD_SHARE, from one draw `u` in 0..1. */
function splodDye(u: number, others: number): number {
  let at = 0;
  for (let k = 0; k < SPLOD_SHARE.length; k++) { at += SPLOD_SHARE[k]; if (u < at) return k % others; }
  return (SPLOD_SHARE.length - 1) % others;
}

/**
 * What one cell of the splodascope's dish is laid with, as clockGlassCell
 * says for Clock Glass: the discs in order, each over what is under it, so
 * a hole takes the oil out of its drop and the drop in the hole puts its
 * own back. The water's wash is flat across the dish (a splodascope's water
 * is a layer, not the bowed glasses' pool), out to the reach of the drops
 * and a little past.
 */
export function splodascopeCell(x: number, y: number, n: number, discs: readonly OilDisc[]): { oil: number; disc: number; water: number; dye: number } {
  let oil = 0, disc = -1;
  discs.forEach((b, q) => {
    const c = Math.max(0, Math.min(1, (b.r - Math.hypot(x - b.x, y - b.y)) * n + 0.5));
    if (c <= 0) return;
    oil = oil * (1 - c) + (b.oil > 0 ? c : 0);
    if (c > 0.5) disc = b.oil > 0 ? q : -1;
  });
  const inDish = Math.hypot(x - 0.5, y - 0.5) < SPLOD_REACH + 0.03;
  return { oil, disc, water: inDish ? SPLOD_WASH * (1 - oil) : 0, dye: disc >= 0 ? SPLOD_BODY_DYE * oil : 0 };
}
