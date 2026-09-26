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
 * what the plate shader reads. The fourth is the shader's, and after the
 * owner's "very cartoon like" the photographs said a backlit drop has no
 * highlight at all; `npm run droplens` measures the lens that replaced it.
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
await build({
  stdin: { contents: "export * from './src/lib/beads.ts'; export { setShowSeed } from './src/lib/rng.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const { BeadField, rasterDrops, paletteSlot, innerLife, setShowSeed } = await import(`../${out}`);

// The field draws from the show's seeded `plate.beads` stream (lib/rng.ts),
// so a run is repeated by running the show on the same seed, as the app would.
const seed = (s) => setShowSeed(s);

// The app's own grid (GRID_SIZE in LiquidVisualizer.tsx) and mask size, so
// the pixel thresholds below are the ones the plate is drawn at.
const N = 192, S = 512, K = S / N;
// Four of Fillmore's dyes: the app hands the field its harmony, three to five
// colours, not the whole contract.
const FILLMORE = [[1, 0.48, 0], [1, 0.92, 0], [0.65, 0.95, 0.95], [0.31, 0.78, 0.47]];
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
/*
  Pinned, not compared with itself. The two runs below both use this code,
  so they could agree while both had drifted from the rings; the fingerprint
  is of the same crowded run on the rings' own `beads.ts` from before drops
  existed, every bead's x, y and r as float64 through FNV-1a. If a change to
  the beads is *meant* to move the rings (seeding their random draws, say),
  this is the number that change re-pins, and says why in the same commit.

  Re-pinned once, for exactly that: #153 moved every draw the beads make
  from Math.random to the show's seeded `plate.beads` stream, so the same
  run lays a different carpet. 822d175a:337 was main at 6c03494 with
  Math.random seeded here; c927327f:336 is main at 38fd0a8 (after #153, still
  without drops) on show seed 4242, computed from that file, not this one.
*/
const RINGS_FINGERPRINT = 'c927327f:336';
const fingerprint = (bs) => {
  const f = new Float64Array(bs.length * 3);
  bs.forEach((b, i) => { f[3 * i] = b.x; f[3 * i + 1] = b.y; f[3 * i + 2] = b.r; });
  let h = 0x811c9dc5;
  for (const byte of new Uint8Array(f.buffer)) { h ^= byte; h = Math.imul(h, 0x01000193) >>> 0; }
  return `${h.toString(16).padStart(8, '0')}:${bs.length}`;
};
{
  const bare = crowd(0, { palette: null });
  check('at 0, the beads go exactly where the rings went before drops existed', fingerprint(bare.beads) === RINGS_FINGERPRINT,
    `${fingerprint(bare.beads)} against ${RINGS_FINGERPRINT}`);
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

/**
  Where the wall between two drops is, as `rasterDrops` puts it: the power
  line, held a third of a radius (and a pixel) off either centre. In mask
  pixels from a's centre; Ra, Rb and D in mask pixels too.
*/
const wallAt = (Ra, Rb, D) => {
  const lo = Math.max(1, 0.35 * Ra), hi = D - Math.max(1, 0.35 * Rb);
  const t = (D * D + Ra * Ra - Rb * Rb) / (2 * D);
  return lo <= hi ? Math.min(hi, Math.max(lo, t)) : (lo + hi) / 2;
};
/** A colour read back from the mask, as its nearest palette slot (or -1). */
const slotOf = (rgb) => {
  let best = -1, bd = 6;
  FILLMORE.forEach((c, k) => { const e = Math.max(...c.map((v, q) => Math.abs(v * 255 - rgb[q]))); if (e < bd) { bd = e; best = k; } });
  return best;
};

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
  const ok = Number.isFinite(biggest(f)) && biggest(rings) > 0;
  check('no drop grows much past the rings\' biggest', ok && biggest(f) <= 1.25 * biggest(rings),
    `${biggest(f).toFixed(2)} cells against ${biggest(rings).toFixed(2)}`);
}

// ── Contacts, and the clusters they make ─────────────────────────────
const pairs = [];
for (let i = 0; i < beads.length; i++) for (let j = i + 1; j < beads.length; j++) {
  const a = beads[i], b = beads[j], d = Math.hypot(a.x - b.x, a.y - b.y);
  if (d < (a.r + b.r) * 1.02) pairs.push([i, j, d]);
}
check('the crowded field has contacts to judge', pairs.length >= 60, `${pairs.length} touching pairs among ${beads.length} drops`);

/*
  The size range is the population's (populate's long tail, which this did
  not change): crowded rings make a cluster as wide, and the control line
  says so. What it asks of drops is that crowding them into walls and
  swallowing did not flatten it away. The colours are read back from the
  mask, at each member's own middle, not worked out from the seeds.
*/
const clusterStats = (fld, withColour) => {
  const bs = fld.beads, prs = [];
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const d = Math.hypot(bs[i].x - bs[j].x, bs[i].y - bs[j].y);
    if (d < (bs[i].r + bs[j].r) * 1.02) prs.push([i, j]);
  }
  const par = bs.map((_, i) => i);
  const rt = (i) => (par[i] === i ? i : (par[i] = rt(par[i])));
  for (const [i, j] of prs) par[rt(i)] = rt(j);
  const cl = new Map();
  bs.forEach((_, i) => { const r = rt(i); if (!cl.has(r)) cl.set(r, []); cl.get(r).push(i); });
  let best = { range: 0, size: 0, colours: 0 };
  for (const m of cl.values()) {
    if (m.length < 3) continue;
    const rs = m.map((i) => bs[i].r), range = Math.max(...rs) / Math.min(...rs);
    if (range <= best.range) continue;
    const colours = withColour
      ? new Set(m.filter((i) => owner(Math.floor(bs[i].x * K), Math.floor(bs[i].y * K)) === i)
          .map((i) => slotOf(colourAt(Math.floor(bs[i].x * K), Math.floor(bs[i].y * K)))).filter((k) => k >= 0)).size
      : 0;
    best = { range, size: m.length, colours };
  }
  return best;
};
{
  const dropsC = clusterStats(f, true), ringsC = clusterStats(crowd(0, { palette: null }), false);
  check('one cluster of drops still spans a 6:1 range of sizes', dropsC.range >= 6,
    `${dropsC.range.toFixed(1)}:1 across ${dropsC.size} touching drops (rings, the control: ${ringsC.range.toFixed(1)}:1 across ${ringsC.size})`);
  check('and is more than one colour, read from the mask', dropsC.colours >= 3, `${dropsC.colours} of the palette's ${FILLMORE.length}`);
}

// ── No holes in the crowd ────────────────────────────────────────────
/*
  Every pixel well inside some drop's circle (half a pixel in from its
  round edge, clear of the antialiasing) belongs to a drop. The walls are
  clamped off each centre, and with the clamp on, three or four drops
  pressed together leave a triangle past every wall that nobody claims:
  the plate showed through the middle of a crowd, and a passenger drawn in
  one was how this was found.
*/
{
  let holes = 0, inside = 0;
  for (const b of beads) {
    const R = Math.max(1, b.r * K), x0 = b.x * K, y0 = b.y * K;
    for (let y = Math.max(0, Math.floor(y0 - R)); y <= Math.min(S - 1, Math.ceil(y0 + R)); y++) {
      for (let x = Math.max(0, Math.floor(x0 - R)); x <= Math.min(S - 1, Math.ceil(x0 + R)); x++) {
        if (Math.hypot(x + 0.5 - x0, y + 0.5 - y0) > R - 0.5) continue;
        inside++;
        if (owner(x, y) < 0) holes++;
      }
    }
  }
  check('no pixel inside a drop is left to nobody', inside > 10000 && holes === 0, `${holes} of ${inside}`);
}

// ── Droplets round the big drops ─────────────────────────────────────
/*
  The owner, on a macro photograph of oil on water: "there are also a great
  diversity of bubble sizes". There every big drop is ringed by droplets a
  tenth its size and less; here the smallest bead was a tenth of the
  biggest and none gathered anywhere in particular. Asked of the crowded
  field: of the drops three and a half cells or more across their radius,
  how many have three or more drops under a sixth their radius touching
  them. The rings, the same run at 0, are the control: they have almost
  none, and no droplets at all.
*/
{
  const ringed = (bs) => {
    const big = bs.filter((b) => b.r >= 3.5);
    let n = 0;
    for (const b of big) {
      const small = bs.filter((o) => o !== b && o.r < b.r / 6 && Math.hypot(o.x - b.x, o.y - b.y) < (o.r + b.r) * 1.15).length;
      if (small >= 3) n++;
    }
    return { n, of: big.length };
  };
  const d = ringed(beads), r = ringed(crowd(0, { palette: null }).beads);
  check('big drops are ringed by droplets', d.of >= 30 && d.n >= 0.25 * d.of && r.n <= 0.05 * r.of,
    `${d.n} of ${d.of} big drops have three or more a sixth their size touching them (rings: ${r.n} of ${r.of})`);
}

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
  /*
    Each pair is read at three places along its wall: on the line of
    centres, and half way out to each end of the chord. At each, a pixel
    and a bit either side of the wall must belong to the drop on that side:
    one straight wall, not a split that bends. A pixel nobody owns is a
    failure (a gap down a contact is the fault the antialiasing comment in
    rasterDrops describes), and only a third drop over the line excuses a
    place. The dome at the wall is read as a height in pixels, h times the
    drop's radius, and must be under three quarters of one, where a dome
    that ignored its walls stands more than a pixel high; a wall pixel with
    nothing drawn on it fails rather than reading as zero.
  */
  let judged = 0, straight = 0, lowWall = 0, deepest = 0;
  for (const [i, j, d] of pairs) {
    const a = beads[i], b = beads[j];
    const Ra = Math.max(1, a.r * K), Rb = Math.max(1, b.r * K), D = d * K;
    const overlap = Ra + Rb - D;
    if (overlap < 1.5 || a.inner || b.inner) continue;
    const ex = (b.x - a.x) / d, ey = (b.y - a.y) / d, nx = -ey, ny = ex;
    const t = wallAt(Ra, Rb, D);
    const half = Math.sqrt(Math.max(0, Math.min(Ra * Ra - t * t, Rb * Rb - (D - t) * (D - t))));
    const px = (off, perp) => ({ x: Math.floor(a.x * K + ex * (t + off) + nx * perp), y: Math.floor(a.y * K + ey * (t + off) + ny * perp) });
    const places = half >= 4 ? [0, 0.5 * half, -0.5 * half] : [0];
    let third = false, good = true, low = true;
    for (const perp of places) {
      const oA = owner(px(-1.2, perp).x, px(-1.2, perp).y), oB = owner(px(1.2, perp).x, px(1.2, perp).y);
      const w = px(0, perp), oW = owner(w.x, w.y);
      if ([oA, oB, oW].some((o) => o >= 0 && o !== i && o !== j)) { third = true; break; }
      if (oA !== i || oB !== j) good = false;
      if (perp !== 0) continue;
      const [r, , bl] = at(w.x, w.y);
      if (oW < 0 || r === 0) { low = false; continue; }
      if ((bl / r) * (oW === i ? Ra : Rb) > 0.75) low = false;
    }
    if (third) continue;
    judged++;
    deepest = Math.max(deepest, overlap / (Ra + Rb));
    if (good) straight++;
    if (low) lowWall++;
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
    // Its colour from the palette, by its own seed, not from what the field
    // says it stored; and only asked where it differs from its host's.
    const slot = paletteSlot(b.inner.seed, FILLMORE.length), hostSlot = paletteSlot(b.seed, FILLMORE.length);
    const got = colourAt(ix, iy);
    // Its own colour at its middle, and its own rim a radius out.
    // Its rim: the brightest of the few pixels just inside its edge, which
    // is where the line is drawn whatever the pixel grid does to it.
    const iR = Math.max(1.25, b.inner.r * K * Math.sqrt(Math.max(0, 1 - b.inner.age / innerLife(b.inner.seed))));
    const cxp = (b.x + b.inner.dx) * K;
    const rimX = Math.floor(cxp + iR - 0.8);
    let rim = 0;
    for (let e = iR - 2; e <= iR; e += 0.5) { const x = Math.floor(cxp + e); if (owner(x, iy) === bi) rim = Math.max(rim, at(x, iy)[1]); }
    // Where a neighbour's wall has cut across the passenger, it is behind the
    // wall, and that is right; it is judged where its own drop holds it.
    // Nobody owning it is not excused: that is a passenger not drawn.
    const oc = owner(ix, iy), orim = owner(rimX, iy);
    if ((oc >= 0 && oc !== bi) || (orim >= 0 && orim !== bi)) { skipped++; continue; }
    const colourOk = slot === hostSlot || slotOf(got) === slot;
    if (oc === bi && colourOk && rim > 60) seen++;
  }
  check('a drop that swallowed a smaller one still shows it', held.length >= 3 && seen === held.length - skipped && seen >= 0.8 * held.length,
    `${held.length} compound drops of ${beads.length}, ${seen} with the passenger's colour and rim${skipped ? `, ${skipped} with it behind a neighbour's wall` : ''}`);

  /*
    And lets it go: forty quiet seconds later, every passenger that was held
    at the start has dissolved, and no drop holds one for longer than its
    life. This asked for no passengers at all after forty seconds, which
    was a moment of the field rather than the feature: once droplets ring
    the drops, the crowd is still settling when the current stops, a pair
    pressed hard still runs together now and then, and a drop that took a
    passenger ten seconds into the quiet rightly still holds it at forty.
    What the feature promises is that a passenger goes, so that is asked
    of each one, by identity, and of its age.
  */
  const g = crowd(1);
  const held0 = new Set(g.beads.filter((b) => b.inner).map((b) => b.inner));
  for (let i = 0; i < 40 * 60; i++) g.step(1 / 60, () => [0, 0], 0, 0);
  const still = g.beads.filter((b) => b.inner && held0.has(b.inner)).length;
  const overdue = g.beads.filter((b) => b.inner && b.inner.age > innerLife(b.inner.seed)).length;
  const fresh = g.beads.filter((b) => b.inner && !held0.has(b.inner)).length;
  check('and in time lets it go', held0.size > 0 && still === 0 && overdue === 0,
    `${held0.size} held, ${still} of them after forty seconds, ${overdue} held past their life (${fresh} taken since)`);
}

// ── The first notch is a notch ──────────────────────────────────────
/*
  The slider blends; it is not a switch at 0.01. At a twentieth the shading
  is nearly all rings, so the field should be too. Two things are asked.
  The mask's passengers are drawn in by the amount: the field drawn at a
  twentieth, and the same field with every passenger taken out, differ by no
  more than a tenth anywhere, so there is no second ring inside the lenses.
  (The field at 0 is pinned by the fingerprint above.)
*/
{
  const light = crowd(0.05);
  const draw = (bs) => {
    const p = new Uint8ClampedArray(S * 2 * S * 4);
    rasterDrops(bs, N, S, p, new Float32Array(S * S), new Int32Array(S * S), 0.05);
    return p;
  };
  const withP = draw(light.beads), without = draw(light.beads.map(({ inner, ...b }) => b));
  let most = 0;
  for (let q = 0; q < withP.length; q++) if ((q & 3) !== 3) most = Math.max(most, Math.abs(withP[q] - without[q]));
  const held = light.beads.filter((b) => b.inner).length;
  check('at a twentieth, a swallowed drop is drawn a twentieth in', held > 10 && most <= 0.1 * 255,
    `${held} held, the most any pixel moves for them ${most} of 255`);
}

// ── A look change recolours, it does not cut ───────────────────────
{
  /*
    Timed to half way, on every drop that is still there at the end: a look
    change that cuts gets there in one frame, one that forgot to ease never
    moves, and the half-way time says which side of a look fade's second or
    two it lands without resting on one drop that might be merged away.
  */
  const g = crowd(1, { frames: 120 });
  const NEXT = [[0, 0.66, 0.62], [0.29, 0.18, 1], [0.88, 0.07, 0.62]];
  const watched = g.beads.filter((b) => b.color).map((b) => ({ b, from: [...b.color], to: NEXT[paletteSlot(b.seed, NEXT.length)], half: -1 }));
  g.setPalette(pal(NEXT));
  const part = (w) => Math.hypot(...w.b.color.map((v, k) => v - w.from[k])) / Math.hypot(...w.to.map((v, k) => v - w.from[k]));
  let firstFrame = 0;
  for (let i = 1; i <= 360; i++) {
    g.step(1 / 60, () => [0, 0], 0, 0);
    for (const w of watched) { const p = part(w); if (i === 1) firstFrame = Math.max(firstFrame, p); if (w.half < 0 && p >= 0.5) w.half = i / 60; }
  }
  const kept = watched.filter((w) => g.beads.includes(w.b));
  const halves = kept.map((w) => w.half).sort((x, y) => x - y);
  const mid = halves.length ? halves[halves.length >> 1] : -1;
  check('a new look\'s colours arrive over a second or so, not in a frame',
    kept.length >= 100 && firstFrame < 0.05 && halves.every((h) => h >= 0.5 && h <= 3),
    `${kept.length} drops, at most ${(firstFrame * 100).toFixed(1)}% of the way after one frame, half way at ${mid.toFixed(2)} s (all within ${halves[0]?.toFixed(2)}–${halves.at(-1)?.toFixed(2)} s)`);
}

console.log(`     the mask for ${beads.length} drops took ${ms.toFixed(1)} ms to draw (the rings' canvas is not timed here)`);
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
