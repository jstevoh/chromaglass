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
  return discCell(x, y, n, discs, SPLOD_REACH, SPLOD_WASH, SPLOD_BODY_DYE);
}

/*
  The discs are looked up through a coarse grid of buckets, each holding the
  indices (in lay order) of the discs that reach into it. A cell is laid
  once per lay, but there are n² of them: Lava Pop's dish went from about 160
  discs to about 360 when the owner asked for complexity (2026-11-21), and
  walking every disc for every one of the app's 768² cells took 2.4 s on the
  Mac, every time the look was laid. The order within a bucket is the lay's
  order, so a hole still takes the oil from the drop under it and nothing
  else changes: classicdish and splodascope lay the same plate as before.
*/
const BUCKETS = 64;
const bucketCache = new WeakMap<readonly OilDisc[], { n: number; lists: number[][] }>();
function discBuckets(discs: readonly OilDisc[], n: number): number[][] {
  const hit = bucketCache.get(discs);
  if (hit && hit.n === n) return hit.lists;
  const lists: number[][] = Array.from({ length: BUCKETS * BUCKETS }, () => []);
  // A disc reaches half a cell past its radius (the anti-aliased edge in discCell).
  const pad = 1 / n;
  discs.forEach((b, q) => {
    const x0 = Math.max(0, Math.floor((b.x - b.r - pad) * BUCKETS)), x1 = Math.min(BUCKETS - 1, Math.floor((b.x + b.r + pad) * BUCKETS));
    const y0 = Math.max(0, Math.floor((b.y - b.r - pad) * BUCKETS)), y1 = Math.min(BUCKETS - 1, Math.floor((b.y + b.r + pad) * BUCKETS));
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) lists[j * BUCKETS + i].push(q);
  });
  bucketCache.set(discs, { n, lists });
  return lists;
}

/** A cell of a dish of discs laid in order (splodascopeCell, classicCell): the water's wash out to `reach` and a little past, and `bodyDye` in each disc's oil. */
function discCell(x: number, y: number, n: number, discs: readonly OilDisc[], reach: number, wash: number, bodyDye: number): { oil: number; disc: number; water: number; dye: number } {
  let oil = 0, disc = -1;
  const i = Math.min(BUCKETS - 1, Math.max(0, Math.floor(x * BUCKETS))), j = Math.min(BUCKETS - 1, Math.max(0, Math.floor(y * BUCKETS)));
  for (const q of discBuckets(discs, n)[j * BUCKETS + i]) {
    const b = discs[q];
    const c = Math.max(0, Math.min(1, (b.r - Math.hypot(x - b.x, y - b.y)) * n + 0.5));
    if (c <= 0) continue;
    oil = oil * (1 - c) + (b.oil > 0 ? c : 0);
    if (c > 0.5) disc = b.oil > 0 ? q : -1;
  }
  const inDish = Math.hypot(x - 0.5, y - 0.5) < reach + 0.03;
  return { oil, disc, water: inDish ? wash * (1 - oil) : 0, dye: disc >= 0 ? bodyDye * oil : 0 };
}

/*
  Lava Pop's dish (PLAN 38w-1), after the Joshua Light Show's
  Liquid Loops (1969) and its Fillmore East nights (1968), the period
  photographs of the Avalon and the Fillmore, and Glenn McKay's and Bill
  Ham's own footage (the watch tool's references, 2026-11-21). What every
  one of them shows is a dish on an overhead projector's lamp: a coloured
  water filling the glass, and in it round cells of coloured mineral oil
  that will not mix with it, squashed flat between the two glasses, each
  ringed by its meniscus, the busiest stills holding eighty to a hundred of
  them a frame, from specks to a fifth of the frame across. In the big cells sit small round
  drops of the water, trapped when the oil was poured or squeezed, and
  those are the "bubbles inside the cells" that every still has.

  So this is the splodascope's packing (random sequential, biggest first,
  log-normal sizes, a film of water between each two) with fewer and
  bigger cells, in a warmer family: the references are nine tenths warm
  (orange, amber and yellow oil in a magenta water) with one cool accent.
  And every cell past CLASSIC_HELD gets one to three drops of the water in
  it, each a hole cut in its oil and nothing put back, so the water's own
  colour is laid in the hole by the wash (classicCell), as a drop of the
  dish's water would carry it.

  Sizes: the watch tool read eleven to nineteen forms a frame, mostly 5 to 15%
  of it across (counted by eye; the watch tool's form scale is a correlation
  length against the width, not a diameter). The first lay took that of the
  dish (a median radius of 0.045, twenty-six cells), and the owner judged it
  short of the references' detail (2026-11-21): the frame on the wall is not
  the dish but the middle of it, 0.42 of the plate high at 16:10 (uvToFluid),
  so a cell 9% of the plate across was a fifth of the frame's height, and
  only nine or ten of them were ever on the screen. Measured against the
  frame instead, a median radius of 0.026 is 12% of its height, and the
  references' spread of sizes (a fifth of the frame down to specks) is a
  sigma of 0.6 between the floor and 0.1. Ninety drawn, packed biggest first
  as far as random sequential packing goes, put about thirty-five on the
  screen with water lanes between, as the stills show.

  The owner's next word was "complexity and clarity" (2026-11-21): set
  beside the stills, the frame had a third of their cells and none of the
  specks, and every rim was soft. Both were the grid. The dye was laid on
  the CPU's 192² and carried up to the solver's by a bilinear, so a cell
  under 0.018 of the plate was a cell or two of colour that smeared into
  the water before the oil had its rim, and that was the floor. Laid at the
  solver's own grid instead (PLAN 38w-8, FluidInputs.layDye), the dye's edge
  is the oil's, and what bounds a cell is the physics at that grid
  (classicFloors): Cahn–Hilliard's interface is about four of the solver's
  cells (38w-9), so a cell must be wider than its own rim to be a body of
  oil at all, and the film between two must hold four cells for Film Hold
  to keep it. In plate units those floors fall as the grid rises, so the
  sizes are drawn smaller and more of them, a median of 0.018 and a sigma
  of 0.75 that reaches from specks to a fifth of the frame: about seventy
  cells on the screen at the app's 768², where the stills show eleven to
  nineteen forms and as many specks again round them.

  Filmed, that lay still read as a few big cells (the biggest 44% of the
  frame's height) with the rest round them: a log-normal of sigma 0.75
  reaches the big tail often, and packing biggest first lets the big ones
  take the room, so 88 to 104 of the 220 drawn were placed. Set beside the
  two stills the owner pointed at (Liquid Loops, 1969), which hold eighty
  to a hundred round forms a frame, most a few percent across and the
  biggest a fifth, the count of eleven to nineteen was the watch tool's
  reading of the busiest forms, not what the eye sees. So the sizes are
  narrower and the crowd bigger: a median of 0.0105, a sigma of 0.5 and a
  biggest of 0.042 (a fifth of the frame's height), nine hundred drawn,
  which packs about 235 cells and 120 drops at 768², 112 to 114 of the
  cells on the screen, the biggest 19% of the frame (classicdish).
*/
export const CLASSIC_DROPS = 900;
export const CLASSIC_MEDIAN = 0.0105, CLASSIC_SIGMA = 0.5, CLASSIC_MAX = 0.042;
/**
 * The lay's floors on a grid of `n` (classicFloors), in its cells: at 192²
 * they are the first lay's sizes (CLASSIC_MIN, CLASSIC_GAP, twice it for a
 * wall, CLASSIC_DROP_MIN), and on a finer grid they shrink with the cell
 * until the plate's own floors stop them, where a cell is six of the app's
 * 768² cells across its radius, its rim of four and a body inside it.
 */
export const CLASSIC_FLOOR_CELLS = { min: 3.5, gap: 4, wall: 8, drop: 3 } as const;
export const CLASSIC_FLOOR_PLATE = { min: 0.008, gap: 0.006, wall: 0.01, drop: 0.007 } as const;
/** Kept for the lab and the checks that name it: the 192² floors of the first lay. */
export const CLASSIC_MIN = 0.018;
export const CLASSIC_GAP = 0.02;
export const CLASSIC_REACH = 0.43;
export const CLASSIC_WASH = 0.8;
export const CLASSIC_BODY_DYE = 1.6;
/* The oils' shares, by the dyes after the water's: orange most, amber, yellow, and the cool accent. */
export const CLASSIC_SHARE = [0.35, 0.3, 0.15, 0.2];
/*
  A cell big enough holds drops of the water; each drop a radius from the
  drop floor up to a third of its cell's, and set in the body of its cell,
  with a wall of oil round it (CLASSIC_FLOOR_CELLS.wall; at 192² it was
  twice the film, 0.04, about eight cells). The wall is what keeps a drop. Laid with a
  wall of one film, 0.02 of the plate (four cells, about one of the phase
  field's interfaces), most drops were gone inside five seconds, at every
  size: classicdish held 0 of 1 and 2 of 7 on its two lays (2 of 8). The wall that
  thin is two diffuse interfaces touching, so the oil in it is never a body
  of oil, and the capillary flow round the drop opens it to the dish's water
  (with Oil Tension at 0, or the carry stopped, all seven held), as a real
  film of oil between two waters drains and breaks once it is thin. With
  the wall doubled every drop held, down to the floor of 0.014 (1 of 1 and
  8 of 8, 9 of 9), so only a cell with room for a drop and its wall holds any.
  Eight cells is the wall at any grid: the drain is a film between two
  interfaces, and those are four cells each wherever the grid is.
*/
export const CLASSIC_HELD = 0.06;
export const CLASSIC_DROP_MIN = 0.014;

/** Classic's floors on a solver grid of `n` cells (plate units): see CLASSIC_FLOOR_CELLS. */
export function classicFloors(n: number): { min: number; gap: number; wall: number; drop: number; held: number } {
  const f = (k: keyof typeof CLASSIC_FLOOR_CELLS) => Math.max(CLASSIC_FLOOR_PLATE[k], CLASSIC_FLOOR_CELLS[k] / n);
  const min = f('min'), gap = f('gap'), wall = f('wall'), drop = f('drop');
  // A cell holds a drop when there is room for the least one and its wall, and a little to range in (CLASSIC_HELD at 192²).
  return { min, gap, wall, drop, held: 1.1 * (drop + wall) };
}

/*
  Where the drops fall (PLAN 38w-22). Packed at random over the whole dish,
  biggest first with a film between each two, the lay was a lattice: every
  cell had neighbours on all sides at about the same distance, round, the
  same density from rim to rim, and the owner's word for it was "too
  symmetric" (2026-11-22). A projectionist does not lay a dish like that.
  The oil goes in from a dropper or a squeeze bottle while the hand moves,
  a few colours one after another, and a stream of oil falling from a
  moving nozzle breaks into drops along its path (Plateau–Rayleigh: a
  thread breaks at about nine of its radii, so the drops come in strings),
  biggest where the stream was thick, where the pour began, and smaller and
  more scattered as it thins, with satellites flung to the side. Two drops
  of one stream that land touching meet before any water can get between
  them, and two oils of one kind that touch coalesce into one body (the
  lobed, peanut and kidney cells of every still); drops that land apart
  keep the water's film between them, and two different oils always do
  (Film Hold, PLAN 38w-9). Between the pours the water stays bare.

  So the lay draws CLASSIC_STREAMS pours, each a hand's path across the
  dish (a persistent random walk), one oil, and a weight (how much was
  poured: a log-normal, so a few pours carry most of the oil and some are a
  few drops). Each drop, biggest first, falls on a pour picked by weight, at
  a place along its path, scattered off it by more toward the tail; a share
  CLASSIC_SPECK fall anywhere, the fine spray that a squeeze bottle throws.
  A drop that lands touching drops of its own pour joins them, as long as
  it does not sit inside one (then it is the same body, nothing new) and
  the body stays under the biggest cell's area; a drop that lands within a
  film of any other oil, or in the thin band between touching and a film
  apart from its own pour, is a drop that would have run into the other and
  is drawn again. The drops of water held in cells are cut last, so no oil
  laid after a cell fills its drops.

  What it measures (classicdish): the share of each of 6 by 4 boxes of the
  wall's frame that the oil covers, and the spread of those shares over
  their mean. On the laid discs of three seeds the packed lay read 5 to 9%
  (every box held about half oil) and this lay 30 to 43%, the oil a third
  of the frame on average where the packing was a half: open water between
  the clumps. Clark and Evans's nearest-neighbour ratio was tried first and
  read both lays as regular (1.65 against 1.5), since drops in a clump are
  still a film apart, so it sees the hard core and not the clump.

  The numbers were picked on renders of the lay, not by the statistic: at
  eighteen pours with a quarter of the drops sprayed anywhere the clumps
  filled in to the old even field (spread 20%); at eight and few sprays
  the dish held under a hundred bodies, short of the complexity the owner
  asked for in round three. More pours did not add bodies: past fourteen
  the paths cross, drops land on drops and are lost, and the count stayed
  at 105 to 120 on five seeds whatever the pours. What a hand does is aim:
  a drop is placed where there is water, not dropped blind, so a drop is
  drawn up to CLASSIC_TRIES times before it counts as lost, and at twelve
  the same fourteen pours keep 126 to 141 bodies (classicdish asks 120 of
  the app's lay, CELLS_MIN), still in strings and clumps.
*/
export const CLASSIC_STREAMS = 14;
export const CLASSIC_SPECK = 0.1;
/** A pour's path: steps of this length (plate units), between these counts, turning by this much a step (radians, one sigma). */
export const CLASSIC_TRAIL = { step: 0.014, min: 8, max: 30, turn: 0.45 } as const;
/** How far a drop lands off its pour's path, at the head and added by the tail (plate units, one sigma). */
export const CLASSIC_SCATTER = { head: 0.004, tail: 0.02 } as const;
/**
 * Where the pours begin: the middle of the dish, where the lens looks. The
 * wall shows the middle 0.67 by 0.42 of the plate at 16:10 and its height
 * by width on a phone held upright, so a disc of this radius covers both.
 */
export const CLASSIC_POUR_REACH = 0.3;
/** How unequal the pours are: the log-normal sigma of their weights. */
export const CLASSIC_POUR_SIGMA = 0.9;
/** A drop joining one of its own pour reaches past its middle by at least this share of the larger radius, or it sits inside it. */
export const CLASSIC_JOIN = 0.6;
/** Where a drop falls is tried this many times (the hand aims at water), and a drop with no room after that fell on another and is lost in it. */
export const CLASSIC_TRIES = 12;

/**
 * Lava Pop's dish for one lay, from `float` (a seeded stream), as
 * splodascopeDiscs lays its crowd: the cells of oil (oil 1), some joined into
 * one body by overlapping (all of one pour, one colour), then the drops of
 * water held in them (oil −1). `dyes` as clockGlassBodies takes it.
 */
export function classicDiscs(float: () => number, dyes: number, n = 192): OilDisc[] {
  const others = Math.max(1, dyes - 1);
  const fl = classicFloors(n);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - float())) * Math.cos(2 * Math.PI * float());
  const pickDye = () => {
    let u = float(), k = 0;
    while (k < CLASSIC_SHARE.length - 1 && u >= CLASSIC_SHARE[k]) u -= CLASSIC_SHARE[k++];
    return 1 + (k % others);
  };
  const reach = CLASSIC_REACH;
  const pours = Array.from({ length: CLASSIC_STREAMS }, () => {
    const a0 = float() * Math.PI * 2, d0 = CLASSIC_POUR_REACH * Math.sqrt(float());
    let x = 0.5 + Math.cos(a0) * d0, y = 0.5 + Math.sin(a0) * d0, h = float() * Math.PI * 2;
    const steps = CLASSIC_TRAIL.min + Math.floor(float() * (CLASSIC_TRAIL.max - CLASSIC_TRAIL.min + 1));
    const path: number[] = [x, y];
    for (let s = 0; s < steps; s++) {
      h += CLASSIC_TRAIL.turn * gauss();
      x += Math.cos(h) * CLASSIC_TRAIL.step; y += Math.sin(h) * CLASSIC_TRAIL.step;
      // The hand stays over the dish: a path that reaches the rim turns back toward the middle.
      if (Math.hypot(x - 0.5, y - 0.5) > reach) { h = Math.atan2(0.5 - y, 0.5 - x); x += Math.cos(h) * CLASSIC_TRAIL.step; y += Math.sin(h) * CLASSIC_TRAIL.step; }
      path.push(x, y);
    }
    return { path, dye: pickDye(), w: Math.exp(CLASSIC_POUR_SIGMA * gauss()) };
  });
  const total = pours.reduce((s, p) => s + p.w, 0);
  const sizes: number[] = [];
  for (let i = 0; i < CLASSIC_DROPS; i++) {
    let r = Math.max(fl.min, CLASSIC_MEDIAN);
    for (let t = 0; t < 16; t++) {
      const v = CLASSIC_MEDIAN * Math.exp(CLASSIC_SIGMA * gauss());
      if (v >= fl.min && v <= CLASSIC_MAX) { r = v; break; }
    }
    sizes.push(r);
  }
  sizes.sort((a, b) => b - a);
  // Placed cells, the pour each fell from (−1 a speck), and the body each belongs to (union by root, its area summed).
  const placed: { x: number; y: number; r: number; pour: number }[] = [];
  const root: number[] = [], area: number[] = [];
  const find = (i: number): number => { while (root[i] !== i) i = root[i] = root[root[i]]; return i; };
  const biggest = Math.PI * CLASSIC_MAX * CLASSIC_MAX;
  const out: OilDisc[] = [], holes: OilDisc[] = [];
  for (const r of sizes) {
    for (let t = 0; t < CLASSIC_TRIES; t++) {
      let x: number, y: number, pour = -1;
      if (float() < CLASSIC_SPECK) {
        const a = float() * Math.PI * 2, d = (reach - r) * Math.sqrt(float());
        x = 0.5 + Math.cos(a) * d; y = 0.5 + Math.sin(a) * d;
      } else {
        let u = float() * total; pour = 0;
        while (pour < pours.length - 1 && u >= pours[pour].w) u -= pours[pour++].w;
        const p = pours[pour].path, m = p.length / 2;
        const s = float(), j = Math.min(m - 1, Math.floor(s * m));
        const spread = CLASSIC_SCATTER.head + CLASSIC_SCATTER.tail * s;
        x = p[2 * j] + spread * gauss(); y = p[2 * j + 1] + spread * gauss();
        if (Math.hypot(x - 0.5, y - 0.5) > reach - r) continue;
      }
      const joins: number[] = [];
      let ok = true;
      for (let q = 0; q < placed.length && ok; q++) {
        const o = placed[q], d = Math.hypot(o.x - x, o.y - y);
        if (d >= o.r + r + fl.gap) continue;
        if (pour >= 0 && o.pour === pour && d <= o.r + r - fl.gap && d >= CLASSIC_JOIN * Math.max(o.r, r)) joins.push(q);
        else ok = false;
      }
      if (!ok) continue;
      const roots = [...new Set(joins.map(find))];
      const a = Math.PI * r * r + roots.reduce((s, k) => s + area[k], 0);
      if (roots.length && a > biggest) continue;
      const i = placed.length;
      placed.push({ x, y, r, pour });
      root.push(i); area.push(a);
      for (const k of roots) root[k] = i;
      out.push({ x, y, r, oil: 1, dye: pour >= 0 ? pours[pour].dye : pickDye() });
      if (r >= fl.held) {
        const held: { x: number; y: number; r: number }[] = [];
        const want = 1 + Math.floor(float() * 3);
        for (let h = 0; h < want * 8 && held.length < want; h++) {
          const hr = fl.drop + Math.max(0, r / 3 - fl.drop) * float();
          const off = (r - hr - fl.wall) * Math.sqrt(float()), oa = float() * Math.PI * 2;
          const hx = x + Math.cos(oa) * off, hy = y + Math.sin(oa) * off;
          if (off < 0 || held.some((q) => Math.hypot(q.x - hx, q.y - hy) < q.r + hr + fl.wall)) continue;
          held.push({ x: hx, y: hy, r: hr });
          holes.push({ x: hx, y: hy, r: hr, oil: -1, dye: 0 });
        }
      }
      break;
    }
  }
  return out.concat(holes);
}

/** One cell of Lava Pop's dish, as splodascopeCell lays the splodascope's: the water's wash flat across the dish, round the oil and in the drops held in it. */
export function classicCell(x: number, y: number, n: number, discs: readonly OilDisc[]): { oil: number; disc: number; water: number; dye: number } {
  return discCell(x, y, n, discs, CLASSIC_REACH, CLASSIC_WASH, CLASSIC_BODY_DYE);
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

/**
 * Dye a look's lay puts in its oil as the oil's own colour (Oil Bodies, PLAN
 * 47z-1), added to `share` (L²×4, R, G, B absorbance and amount, as the
 * solver's dye delta), which is made at `cells` cells if there is none yet.
 * FluidSimulation.addOilDensity lays the dye as addDensity does and this
 * beside it; the share goes to the solver with that flush (applyDeltas'
 * `oilAdd`), so the oil takes its colour and the water the rest. Without it
 * the solver shares the frame's dye by the oil under each cell, and a lay's
 * rim, where the CPU's 192² colour and the solver's sharper oil disagree,
 * handed the water's colour to the drop and the drop's to the water: the
 * water's crept into each drop from its edge (28k-5), and the drop's lay in
 * the water round it, multiplying with the water's toward black.
 */
export function layOilShare(share: Float32Array | null, index: number, amount: number, absorbance: readonly number[], cells: number): Float32Array {
  const out = share ?? new Float32Array(cells * 4);
  const k = index * 4;
  out[k] += amount * absorbance[0];
  out[k + 1] += amount * absorbance[1];
  out[k + 2] += amount * absorbance[2];
  out[k + 3] += amount;
  return out;
}

/**
 * Clock Glass's, Splodascope's or Lava Pop's dish for one lay (FluidSimulation's seed):
 * the bodies from `float` (a seeded stream), each laid as oil (`oil`, a
 * negative amount cutting a compound drop's hole), then every cell as
 * clockGlassCell, splodascopeCell or classicCell lays it, the water's wash as dye
 * (`water`) and each body's colour in its oil as the oil's own (`inOil`,
 * with which of the look's dyes it is; PLAN 47z-1).
 */
export function layCrowd(look: 'clock-glass' | 'splodascope' | 'classic', n: number, float: () => number, dyes: number,
  oil: (x: number, y: number, r: number, amount: number) => void,
  water: (x: number, y: number, amount: number) => void,
  inOil: (x: number, y: number, amount: number, dye: number) => void): void {
  const glass = look === 'clock-glass';
  const bodies: readonly (OilBody & { oil?: number })[] = glass ? clockGlassBodies(float, dyes)
    : look === 'classic' ? classicDiscs(float, dyes, n) : splodascopeDiscs(float, dyes);
  for (const b of bodies) oil(b.x, b.y, b.r, b.oil ?? 1);
  if (!glass) {
    const classic = look === 'classic';
    layDiscs(n, bodies as readonly OilDisc[], classic ? CLASSIC_REACH : SPLOD_REACH,
      classic ? classicWash(float) : () => SPLOD_WASH, classic ? CLASSIC_BODY_DYE : SPLOD_BODY_DYE, water,
      (x, y, amount, q) => inOil(x, y, amount, bodies[q].dye));
    return;
  }
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const u = (x + 0.5) / n, v = (y + 0.5) / n;
    const cell = clockGlassCell(u, v, n, bodies);
    if (cell.water > 0) water(x, y, cell.water);
    if (cell.dye > 0) inOil(x, y, cell.dye, bodies[cell.body].dye);
  }
}

/**
 * A dish of discs laid cell for cell, as discCell lays one cell, and to the
 * same numbers: each disc walks only the cells of its own box, in the
 * discs' order, where discCell asks every disc at every cell. At the
 * solver's 768² Classic's two hundred discs asked at every cell were a
 * hundred million distances, seconds of a frozen look change; walked by box
 * they are the cells each covers, a few hundred thousand. `wash` is the
 * water's depth of dye at a place (plate units).
 */
function layDiscs(n: number, discs: readonly OilDisc[], reach: number, wash: (u: number, v: number) => number, bodyDye: number,
  water: (x: number, y: number, amount: number) => void, inOil: (x: number, y: number, amount: number, disc: number) => void): void {
  const oil = new Float32Array(n * n), disc = new Int32Array(n * n).fill(-1);
  discs.forEach((b, q) => {
    // A cell is touched while (r - d)·n + 0.5 > 0: within r + 0.5/n of the middle; one cell more is safe.
    const pad = b.r + 1 / n;
    const x0 = Math.max(1, Math.floor((b.x - pad) * n - 0.5)), x1 = Math.min(n - 2, Math.ceil((b.x + pad) * n - 0.5));
    const y0 = Math.max(1, Math.floor((b.y - pad) * n - 0.5)), y1 = Math.min(n - 2, Math.ceil((b.y + pad) * n - 0.5));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const c = Math.max(0, Math.min(1, (b.r - Math.hypot((x + 0.5) / n - b.x, (y + 0.5) / n - b.y)) * n + 0.5));
      if (c <= 0) continue;
      const i = x + y * n;
      oil[i] = oil[i] * (1 - c) + (b.oil > 0 ? c : 0);
      if (c > 0.5) disc[i] = b.oil > 0 ? q : -1;
    }
  });
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const u = (x + 0.5) / n, v = (y + 0.5) / n, i = x + y * n;
    if (Math.hypot(u - 0.5, v - 0.5) < reach + 0.03) {
      const w = wash(u, v) * (1 - oil[i]);
      if (w > 0) water(x, y, w);
    }
    if (disc[i] >= 0 && oil[i] > 0) inOil(x, y, bodyDye * oil[i], disc[i]);
  }
}

/*
  Classic's water is not one depth of dye. In every still the magenta runs
  from a pale rose to a red nearly black, in broad sweeps a third of the
  frame across, where the dye was poured into the water and has not yet
  spread: a dye's diffusion in water is about 10⁻⁹ m²/s, a millimetre in
  fifteen minutes, so a pour stays where it fell for the whole of a show and
  only the flow moves it. Lit through, a deeper water is a darker one
  (Beer–Lambert), and those dark sweeps are where the references' quarter
  of uncoloured frame comes from: the first lay's even wash coloured every
  pixel (the watch tool's coloured share, 1.00 against Liquid Loops' 0.77).
  So the wash is the water's base depth and four pours on it, each a broad
  Gaussian (0.08 to 0.2 of the plate), from half of CLASSIC_WASH to about
  twice it, never under the depth a wet dish needs (classicdish's WET).
*/
export const CLASSIC_POURS = 4;
function classicWash(float: () => number): (u: number, v: number) => number {
  const pours = Array.from({ length: CLASSIC_POURS }, () => {
    const a = float() * Math.PI * 2, d = CLASSIC_REACH * Math.sqrt(float());
    return { x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d, s: 0.08 + 0.12 * float(), k: 0.4 + 0.6 * float() };
  });
  return (u, v) => {
    let w = 0.55;
    for (const p of pours) w += p.k * Math.exp(-((u - p.x) ** 2 + (v - p.y) ** 2) / (2 * p.s * p.s));
    return CLASSIC_WASH * Math.min(2, w);
  };
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
