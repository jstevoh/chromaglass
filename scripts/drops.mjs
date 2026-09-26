#!/usr/bin/env node
/**
 * Drops, not rings: PLAN.md batch 3, measured on the field and the mask the
 * app uploads.
 *
 *   npm run drops      (node only: src/lib/beads.ts on its own)
 *
 * The plan's gate is "on a 2x crop, a 6:1 size range within one cluster,
 * visible highlights, and flattened contacts between touching drops". Three
 * of those four are facts about the field and its mask rather than about the
 * shading, so they are measured here, where nothing depends on a GPU: the
 * mask is a pure function of the beads (`rasterDrops`), and it is exactly
 * what the plate shader reads. The highlight is the shader's, and is the
 * `look` skill's to photograph in the lab and the owner's to judge.
 *
 * Every claim is measured on a field that has been *crowded* — drops pulled
 * toward three points for twenty seconds the way a slow current gathers
 * them — because the claims are about crowds. A field that was only
 * populated scatters its drops over the patches with gaps between, and on
 * that plate "flattened contacts" would pass by having no contacts at all.
 * So the first thing asked is that there are contacts to judge.
 *
 * What is deliberately not here: that rings at 0 look as they did. The rings'
 * mask is drawn by the canvas and cannot run in node; what can be asked here
 * is that at 0 the field itself moves exactly as it does with drops never
 * mentioned — same seed, same positions, same radii, to the bit — and no
 * bead is given a colour or a passenger.
 */
import { build } from 'esbuild';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const out = 'node_modules/.cache/drops-beads.mjs';
await build({ entryPoints: ['src/lib/beads.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
const { BeadField, rasterDrops, paletteSlot, innerLife } = await import(`../${out}`);

// The field draws from Math.random (the seeded generator may take it over;
// the claims below do not care which, only that a run can be repeated).
const seed = (s) => { Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647; };

const N = 256, S = 512, K = S / N;
const FILLMORE = [[1, 0.48, 0], [1, 0.92, 0], [1, 0, 0], [0.65, 0.95, 0.95], [0.31, 0.78, 0.47], [0.54, 0.17, 0.89]];
const pal = (cs) => cs.map(([r, g, b]) => ({ r, g, b }));

/*
  Three points the current gathers toward, at about fourteen cells a second
  (0.03 in the solver's units, which the field turns into cells). Slower
  than any flow a show runs, so what builds up is packing rather than a
  pile-up at a sink.
*/
const SINKS = [[0.3, 0.35], [0.68, 0.3], [0.5, 0.72]].map(([x, y]) => [x * N, y * N]);
const current = (x, y) => {
  let best = null, bd = Infinity;
  for (const [sx, sy] of SINKS) { const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = [sx, sy]; } }
  if (bd < 1) return [0, 0];
  return [(best[0] - x) / bd * 0.03, (best[1] - y) / bd * 0.03];
};

function crowd(drops, { palette = FILLMORE, frames = 1200, s = 4242 } = {}) {
  seed(s);
  const f = new BeadField(N);
  f.drops = drops;
  if (palette) f.setPalette(pal(palette));
  for (let i = 0; i < frames; i++) {
    // What the app does: repopulate every thirtieth frame, then step.
    if (i % 30 === 0) f.populate(Math.round(60 + 360 * 0.8), 0.8 + 0.4 * 0.8);
    f.step(1 / 60, current, 0, 0);
  }
  for (const b of f.beads) b.age = 5;
  return f;
}

// ── At 0, the field is the rings' field ──────────────────────────────
{
  const bare = crowd(0, { palette: null });
  const told = crowd(0);
  const same = bare.beads.length === told.beads.length
    && bare.beads.every((b, i) => b.x === told.beads[i].x && b.y === told.beads[i].y && b.r === told.beads[i].r);
  check('at 0, a palette changes nothing about where the beads go', same,
    `${bare.beads.length} beads, ${same ? 'identical to the bit' : 'they differ'}`);
  check('and no ring is given a colour or a drop inside it',
    told.beads.every((b) => b.color === undefined && b.inner === undefined));
}

const f = crowd(1);
const beads = f.beads;
const px = new Uint8ClampedArray(S * 2 * S * 4), own = new Float32Array(S * S), ids = new Int32Array(S * S);
rasterDrops(beads, N, S, px, own, ids);
// Timed warm, as the app runs it every frame: the first call pays for compiling it.
const t0 = performance.now();
for (let k = 0; k < 10; k++) rasterDrops(beads, N, S, px, own, ids);
const ms = (performance.now() - t0) / 10;
/** Which drop has the pixel: its index, or -1. */
const owner = (x, y) => ids[y * S + x] - 1;
const at = (x, y) => { const o = (y * S * 2 + x) * 4; return [px[o], px[o + 1], px[o + 2]]; };
const colourAt = (x, y) => { const o = (y * S * 2 + x + S) * 4; return [px[o], px[o + 1], px[o + 2]]; };

// ── Merging does not snowball ────────────────────────────────────────
/*
  Drops merge more readily than rings (a small one pushed inside a bigger one
  is taken in), and a current into one point feeds whatever sits there. The
  biggest drop on the crowded plate should be about the rings' biggest, not
  a pool that ate its neighbours.
*/
{
  const rings = crowd(0, { palette: null });
  const biggest = (fld) => Math.max(...fld.beads.map((b) => b.r));
  check('no drop grows much past the rings\' biggest', biggest(f) <= 1.25 * biggest(rings),
    `${biggest(f).toFixed(2)} cells against ${biggest(rings).toFixed(2)}`);
}

// ── Contacts, and the clusters they make ─────────────────────────────
const pairs = [];
for (let i = 0; i < beads.length; i++) for (let j = i + 1; j < beads.length; j++) {
  const a = beads[i], b = beads[j], d = Math.hypot(a.x - b.x, a.y - b.y);
  if (d < (a.r + b.r) * 1.02) pairs.push([i, j, d]);
}
check('the crowded field has contacts to judge', pairs.length >= 60, `${pairs.length} touching pairs among ${beads.length} drops`);

const parent = beads.map((_, i) => i);
const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
for (const [i, j] of pairs) parent[root(i)] = root(j);
const clusters = new Map();
beads.forEach((_, i) => { const r = root(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(i); });
let bestRange = 0, bestSize = 0, bestColours = 0;
for (const members of clusters.values()) {
  if (members.length < 3) continue;
  const rs = members.map((i) => beads[i].r);
  const range = Math.max(...rs) / Math.min(...rs);
  if (range > bestRange) {
    bestRange = range; bestSize = members.length;
    bestColours = new Set(members.map((i) => paletteSlot(beads[i].seed, FILLMORE.length))).size;
  }
}
check('one cluster spans a 6:1 range of sizes', bestRange >= 6,
  `${bestRange.toFixed(1)}:1 across ${bestSize} touching drops`);
check('and is more than one colour', bestColours >= 3, `${bestColours} of the palette's ${FILLMORE.length}`);

// ── A drop is its own colour ─────────────────────────────────────────
{
  let right = 0, asked = 0;
  for (const b of beads) {
    const x = Math.floor(b.x * K), y = Math.floor(b.y * K);
    if (b.inner) continue; // its middle may be its passenger's
    asked++;
    // A drop keeps its own middle: pressed flat, never pushed past it.
    if (owner(x, y) !== beads.indexOf(b)) continue;
    const want = FILLMORE[paletteSlot(b.seed, FILLMORE.length)].map((v) => v * 255);
    const got = colourAt(x, y);
    if (want.every((v, k) => Math.abs(v - got[k]) <= 1.5)) right++;
  }
  check('every drop keeps its middle, in the colour of its slot in the palette', asked > 100 && right === asked, `${right} of ${asked}`);
}

// ── Flattened where they touch ───────────────────────────────────────
/*
  For each pair pressed at least a pixel and a half into each other, walk the
  line between their centres through the overlap. A flattened pair gives the
  overlap to the two drops along one straight wall — the power line, where
  the two are equally deep — and the dome is back at zero on the wall, so the
  lens and the shading both see an edge there. Two circles drawn through one
  another would give the overlap to whichever was drawn last and leave its
  dome standing high across the other.
*/
{
  let judged = 0, straight = 0, lowWall = 0, deepest = 0;
  for (const [i, j, d] of pairs) {
    const a = beads[i], b = beads[j];
    const Ra = Math.max(1, a.r * K), Rb = Math.max(1, b.r * K), D = d * K;
    const overlap = Ra + Rb - D;
    if (overlap < 1.5 || a.inner || b.inner) continue;
    deepest = Math.max(deepest, overlap / (Ra + Rb));
    judged++;
    const ex = (b.x - a.x) / d, ey = (b.y - a.y) / d;
    const t = (D * D + Ra * Ra - Rb * Rb) / (2 * D);
    // Sample either side of the wall along the line of centres, one pixel off it.
    const sample = (off) => { const x = Math.floor(a.x * K + ex * (t + off)), y = Math.floor(a.y * K + ey * (t + off)); return { x, y }; };
    const nearA = sample(-1.2), nearB = sample(1.2), onWall = sample(0);
    // A third drop can sit over the line of centres; a pair is judged only
    // where the two of them are all there is on it.
    const oA = owner(nearA.x, nearA.y), oB = owner(nearB.x, nearB.y);
    if (![i, j].includes(oA) || ![i, j].includes(oB)) { judged--; continue; }
    if (oA === i && oB === j) straight++;
    const [r, , bl] = at(onWall.x, onWall.y);
    const h = r > 0 ? bl / r : 0;
    if (h <= 2.5 / Math.min(Ra, Rb)) lowWall++;
  }
  check('touching drops press into each other', judged >= 30 && deepest >= 0.08,
    `${judged} pairs a pixel and a half or more into each other, the deepest ${(deepest * 100).toFixed(0)}% of their reach`);
  check('and meet along one wall, each drop on its own side', judged > 0 && straight >= 0.95 * judged, `${straight} of ${judged}`);
  check('and the dome falls to nothing at the wall', judged > 0 && lowWall >= 0.9 * judged, `${lowWall} of ${judged}`);
}

// ── A lone drop's dome is the one the lens was written for ──────────
{
  const lone = { x: N / 2, y: N / 2, r: 6, age: 5, seed: 0.3, color: [1, 0, 0] };
  const p1 = new Uint8ClampedArray(S * 2 * S * 4), o1 = new Float32Array(S * S), i1 = new Int32Array(S * S);
  rasterDrops([lone], N, S, p1, o1, i1);
  let worst = 0;
  const R = lone.r * K;
  for (let k = 1; k < R - 2; k += 1) {
    const x = Math.floor(lone.x * K + k), y = Math.floor(lone.y * K);
    const o = (y * S * 2 + x) * 4;
    const d = Math.hypot(x + 0.5 - lone.x * K, y + 0.5 - lone.y * K);
    worst = Math.max(worst, Math.abs(p1[o + 2] / p1[o] - (1 - d / R)));
  }
  check('a drop with no neighbour has the rings\' dome, 1 − d/R', worst < 0.01, `worst ${worst.toFixed(4)}`);
}

// ── A swallowed drop stays visible ──────────────────────────────────
{
  const held = beads.filter((b) => b.inner);
  let seen = 0, skipped = 0;
  for (const b of held) {
    const ix = Math.floor((b.x + b.inner.dx) * K), iy = Math.floor((b.y + b.inner.dy) * K);
    const bi = beads.indexOf(b);
    const want = b.inner.color.map((v) => v * 255);
    const got = colourAt(ix, iy);
    // Its own colour at its middle, and its own rim a radius out.
    // Its rim: the brightest of the few pixels just inside its edge, which
    // is where the line is drawn whatever the pixel grid does to it.
    const iR = Math.max(1, b.inner.r * K * Math.sqrt(Math.max(0, 1 - b.inner.age / innerLife(b.inner.seed))));
    const cxp = (b.x + b.inner.dx) * K;
    const rimX = Math.floor(cxp + iR - 0.8);
    let rim = 0;
    for (let e = iR - 2; e <= iR; e += 0.5) { const x = Math.floor(cxp + e); if (owner(x, iy) === bi) rim = Math.max(rim, at(x, iy)[1]); }
    // Where a neighbour's wall has cut across the passenger, it is behind the
    // wall, and that is right; it is judged where its own drop holds it.
    if (owner(ix, iy) !== bi || owner(rimX, iy) !== bi) { skipped++; continue; }
    if (want.every((v, k) => Math.abs(v - got[k]) <= 2) && rim > 60) seen++;
  }
  check('a drop that swallowed a smaller one still shows it', held.length >= 3 && seen === held.length - skipped && seen >= 0.8 * held.length,
    `${held.length} compound drops of ${beads.length}, ${seen} with the passenger's colour and rim${skipped ? `, ${skipped} with it behind a neighbour's wall` : ''}`);

  // And lets it go: forty quiet seconds later, every one has dissolved.
  const g = crowd(1);
  const before = g.beads.filter((b) => b.inner).length;
  for (let i = 0; i < 40 * 60; i++) g.step(1 / 60, () => [0, 0], 0, 0);
  const after = g.beads.filter((b) => b.inner).length;
  check('and in time lets it go', before > 0 && after === 0, `${before} held, ${after} after forty seconds`);
}

// ── A look change recolours, it does not cut ───────────────────────
{
  const g = crowd(1, { frames: 120 });
  const one = g.beads.find((b) => b.color);
  const NEXT = [[0, 0.66, 0.62], [0.29, 0.18, 1], [0.88, 0.07, 0.62]];
  g.setPalette(pal(NEXT));
  const from = [...one.color], to = NEXT[paletteSlot(one.seed, NEXT.length)];
  const moved = () => Math.hypot(...one.color.map((v, k) => v - from[k])) / Math.hypot(...to.map((v, k) => v - from[k]));
  g.step(1 / 60, () => [0, 0], 0, 0);
  const afterOne = moved();
  for (let i = 0; i < 180; i++) g.step(1 / 60, () => [0, 0], 0, 0);
  const afterThree = moved();
  check('a new look\'s colours arrive over a second and more, not in a frame', afterOne < 0.05 && afterThree > 0.85,
    `${(afterOne * 100).toFixed(1)}% of the way after one frame, ${(afterThree * 100).toFixed(0)}% after three seconds`);
}

console.log(`     the mask for ${beads.length} drops took ${ms.toFixed(1)} ms to draw (the rings' canvas is not timed here)`);
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
