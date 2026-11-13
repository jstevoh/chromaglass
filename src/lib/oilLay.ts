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

import { OPEN_RIM } from './turntable';

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

/**
 * Lay Clock Glass as seedPreset does (its 'clock-glass'). A clock-glass dish
 * is coloured water and oil that will not mix: the water is the first dye,
 * laid wide and deepest in the middle where the bowed glasses hold the most,
 * and bodies of oil are laid over it across the dish, each with one of the
 * other dyes in it. With Oil Bodies on (the look's) each body keeps its
 * colour while it moves, and two only mix where they merge, as two dyed oils
 * do. The oil is laid through `mix` only where the solver is there to take
 * it; before it is, the colours still land, as spots in the water. Each cell
 * as clockGlassCell lays it: a body's colour in its oil and nowhere else, the
 * water's wash in what is left. `dye(x, y, amount, colour)` on the plate's
 * `size` grid, the colour an index into the look's dyes.
 */
export function layClockGlass(
  float: () => number, dyes: number, size: number,
  mix: (x: number, y: number, r: number) => void,
  dye: (x: number, y: number, amount: number, colour: number) => void,
): void {
  const bodies = clockGlassBodies(float, dyes);
  for (const b of bodies) mix(b.x, b.y, b.r);
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const cell = clockGlassCell((x + 0.5) / size, (y + 0.5) / size, size, bodies);
    if (cell.water > 0) dye(x, y, cell.water, 0);
    if (cell.dye > 0) dye(x, y, cell.dye, bodies[cell.body].dye);
  }
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

/*
  Lava Lamp's wax (PLAN 27f-9c): a pool of it on the warm glass at the
  bottom of the standing plate, and three bodies on their way, as a lamp
  that has been on a while shows it. The wax is the oil (Oil Weight above
  the water's, so it sinks cold) and its colour is in it and nowhere else;
  the liquid round it is clear, lit by the lamp behind (the look's LED
  colour), as a real lamp's coloured liquid is. Laid where the look lays it
  and nowhere random, so the lab (`npm run lavawax`) lays exactly the app's:
  the pool a quarter of the plate across in the bottom of the round dish, a
  body rising off it, one high up cooling and one falling between. Down is
  y = 0 (the lamp's Gravity points down the screen, tiltDirection 180).
*/
export const LAVA_BODIES: readonly OilBody[] = [
  { x: 0.5, y: 0.2, r: 0.11, dye: 1 },
  { x: 0.4, y: 0.36, r: 0.06, dye: 1 },
  { x: 0.61, y: 0.58, r: 0.055, dye: 1 },
  { x: 0.47, y: 0.8, r: 0.05, dye: 1 },
];
/*
  How much dye the wax is laid with, flat through its oil (PLAN 27f-9h). It
  was Clock Glass's body dye (BODY_DYE, 2.6), and backlit through the gap
  that much absorbs nearly all of the lamp: the wax filmed as near-black
  blobs. A lamp's wax is a lightly dyed paraffin that the bulb shines
  through, so it glows its colour. 0.9 still filmed darker than the ground
  on the Mac (2026-11-12); a fifth of the body dye, in the lab a bright
  crimson against the bulb's gold.
*/
export const LAVA_DYE = 0.55;

/** One cell of Lava Lamp's lay: the wax's oil (flat to its edge, a cell of antialiasing) and its dye; nothing in the liquid round it. */
export function lavaLampCell(x: number, y: number, n: number): { oil: number; dye: number } {
  let oil = 0;
  for (const b of LAVA_BODIES) oil = Math.max(oil, Math.max(0, Math.min(1, (b.r - Math.hypot(x - b.x, y - b.y)) * n + 0.5)));
  return { oil, dye: LAVA_DYE * oil };
}

/**
 * Lay Lava Lamp's wax on a plate `n` cells across, as seedPreset does: each
 * body's oil (`oil`, plate units, as addMix lays it) and its dye in every
 * cell it covers (`dye`, cell indices). The wax was laid as dye before, and
 * dye is one liquid with the water: the sealed plate filmed red wall to wall
 * with no blob in it (the Mac, 2026-11-11). The oil goes in only where the
 * solver is there to take it; before it is, the colour still lands, as spots
 * of dye. One wax, the look's first dye: a lamp's wax is one colour, and a
 * hand's pour adds the others.
 */
export function layLavaLamp(n: number, oil: (x: number, y: number, r: number) => void, dye: (x: number, y: number, amount: number) => void): void {
  for (const b of LAVA_BODIES) oil(b.x, b.y, b.r);
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const cell = lavaLampCell((x + 0.5) / n, (y + 0.5) / n, n);
    if (cell.dye > 0) dye(x, y, cell.dye);
  }
}

/*
  Foam Cells (PLAN 47z-5): a packed emulsion, oil cells pressed into
  polygons with thin films of water between them, after a macro film of one
  (`cosmo-packed-foam-cells` in the watch tool's library) and the cellular
  networks that came up in five of the ten Microlab films (47, 2026-11-13).

  What makes it a foam and not a crowd is how little water there is. A 2D
  emulsion with more than about a sixth of its area water is wet: the drops
  round up and the water collects in lanes between them (the jamming
  fraction of discs in the plane, near 0.84). Under that the drops cannot
  round up, because there is no water for the corners, so they press flat
  against each other, and their tension pulls every meeting of films to
  three at 120° (Plateau's laws, in the plane of the gap). The lab showed
  both: with cells twenty grid cells across the films were a fifth of the
  area and the cells rounded into a wet crowd in four seconds; with cells
  fifty across they held as polygons and their junctions turned to 120°.

  So the lay is the crowd pressed together, nothing more: drops at random
  places a spacing apart (a Poisson disc, not a relaxed one, so the angles
  they meet at are anything and the physics has to turn them), each a disc a
  little bigger than its share, cut from its neighbours along the line where
  their discs' powers are equal (the power diagram, where two pressed
  circles meet) less a film of water FOAM_FILM grid cells thick. Four is the
  thinnest Film Hold keeps (FILM_WGSL): two merged a pressed crowd into one
  body in two seconds. The film is the field's own edge, tens of cells where
  a real one is tens of nanometres (28k-2's shortcut (a)), and that is what
  holds the cells to a size in grid cells, FOAM_CELL across, not in plate
  units: at the app's 384² they are about a seventh of the plate, at the
  lab's 256² a fifth.

  The water carries the dye (the look's first colour, rust); the cells are
  pale, each one tint of the others at a fraction of a drop's depth.
*/
export const FOAM_FILM = 4;
export const FOAM_CELL = 50;
export const FOAM_LEAST = 0.11;
export const FOAM_OVERLAP = 0.8;
export const FOAM_SPREAD = 0.2;
export const FOAM_WASH = 0.6;
export const FOAM_CELL_DYE = 0.35;

/** One cell of the foam: where its drop was laid, its disc's radius and its colour (an index into the look's dyes, the water's 0 excepted). */
export interface FoamSeed { x: number; y: number; r: number; dye: number }

/** The foam's drops for one lay on an `n`-cell grid, from `float` (a seeded stream). */
export function foamSeeds(float: () => number, dyes: number, n: number): FoamSeed[] {
  const d = Math.max(FOAM_LEAST, FOAM_CELL / n);
  const others = Math.max(1, dyes - 1);
  const out: FoamSeed[] = [];
  // Past the plate's edge by a spacing, so the cells along the rim are cut by neighbours too.
  for (let t = 0; t < 6000; t++) {
    const x = -d + (1 + 2 * d) * float(), y = -d + (1 + 2 * d) * float();
    if (out.some((q) => (q.x - x) ** 2 + (q.y - y) ** 2 < d * d)) continue;
    out.push({ x, y, r: FOAM_OVERLAP * d * (1 + FOAM_SPREAD * (2 * float() - 1)), dye: 1 + Math.floor(float() * others) });
  }
  return out;
}

/** What one grid cell of the foam is laid with: its oil (0..1) and whose cell it is (−1 in the water). */
export function foamCell(x: number, y: number, n: number, seeds: readonly FoamSeed[]): { oil: number; cell: number } {
  let b = -1, bp = Infinity, c = -1, cp = Infinity;
  for (let k = 0; k < seeds.length; k++) {
    const q = seeds[k], p = (x - q.x) ** 2 + (y - q.y) ** 2 - q.r * q.r;
    if (p < bp) { c = b; cp = bp; b = k; bp = p; } else if (p < cp) { c = k; cp = p; }
  }
  if (b < 0 || bp >= 0) return { oil: 0, cell: -1 };
  const q = seeds[b];
  const disc = Math.max(0, Math.min(1, (q.r - Math.hypot(x - q.x, y - q.y)) * n + 0.5));
  let cut = 1;
  if (c >= 0) {
    // the distance to the line where the two discs' powers are equal
    const w = seeds[c], dist = (cp - bp) / (2 * Math.hypot(q.x - w.x, q.y - w.y));
    cut = Math.max(0, Math.min(1, (dist - FOAM_FILM / (2 * n)) * n + 0.5));
  }
  // and a film's width inside the dish's open rim, where the plate's water goes on out over the edge
  const rim = Math.max(0, Math.min(1, (OPEN_RIM - FOAM_FILM / (2 * n) - Math.hypot(x - 0.5, y - 0.5)) * n + 0.5));
  const oil = disc * cut * rim;
  return { oil, cell: oil > 0.5 ? b : -1 };
}

/**
 * Lay Foam Cells as seedPreset does (its 'foam-cells'): the oil at the
 * solver's own `n`, since the film is four of its cells whatever the plate's
 * size, through `oil` (the solver's layOil); the dye at the plate's `size`
 * through `dye(x, y, amount, colour)`, the colour an index into the look's
 * dyes. The water's rust wherever the oil is not; each cell its pale tint.
 * The tension then turns the junctions to 120°, Film Hold keeps the films and
 * Oil Bodies the colours apart.
 */
export function layFoamCells(
  float: () => number, dyes: number, n: number, size: number,
  oil: (cell: (x: number, y: number, m: number) => number) => void,
  dye: (x: number, y: number, amount: number, colour: number) => void,
): void {
  const seeds = foamSeeds(float, dyes, n);
  oil((x, y, m) => foamCell(x, y, m, seeds).oil);
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const c = foamCell((x + 0.5) / size, (y + 0.5) / size, n, seeds);
    if (c.oil < 1) dye(x, y, FOAM_WASH * (1 - c.oil), 0);
    if (c.cell >= 0) dye(x, y, FOAM_CELL_DYE * c.oil, seeds[c.cell].dye);
  }
}
