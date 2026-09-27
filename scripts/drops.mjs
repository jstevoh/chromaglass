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
const { BeadField, rasterDrops, paletteSlot, innerLife, setShowSeed, dropWall, mergeRelax, mergeStretch } = await import(`../${out}`);

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
/*
  Where the wall between two pressed drops crosses a line parallel to their
  line of centres, perp pixels off it, as a distance along it from the first
  centre. The wall is the arc dropWall (beads.ts) describes; its sagitta is
  checked on its own, against the pressures, below.
*/
const wallAt = (Ra, Rb, D, perp = 0) => {
  const w = dropWall(Ra, Rb, D);
  if (w.side === 0) return w.apex;
  const centre = w.apex - w.side * w.rho;
  return centre + w.side * Math.sqrt(Math.max(0, w.rho * w.rho - perp * perp));
};
/** A colour read back from the mask, as its nearest palette slot (or -1). */
const slotOf = (rgb) => {
  let best = -1, bd = 6;
  FILLMORE.forEach((c, k) => { const e = Math.max(...c.map((v, q) => Math.abs(v * 255 - rgb[q]))); if (e < bd) { bd = e; best = k; } });
  return best;
};

// ── Drops are born log-normal ────────────────────────────────────────
/*
  A shaken emulsion's sizes are log-normal (the research on bubbles and
  drops, item 9), and with drops on `populate` draws them so: median 1.18
  cells and 0.7 in the logarithm, redrawn outside the rings' 0.45 to 5.2.
  Asked of what `populate` actually places, not of `dropRadius` on its own,
  so a spawn that stopped calling it, or a place that filtered sizes, is
  caught; at the size slider the crowd uses (1.12), divided back out, so a
  drop that ignored the slider is caught too; and at drops 0.3 as well as
  1, since the slider runs from 0 to 1 and a spawn that only drew drops at
  full would pass at 1 alone.

  Fields of ten, sixty thousand drops a side. Ten because a bead refused
  for landing on another leans the sizes toward the small, and at forty a
  field that lean was a third of the whole allowance below (a distance of
  0.011 on sixty thousand, where the distribution itself gives 0.003);
  sixty thousand because at three thousand the mean r squared wanders by
  3 per cent from one block of seeds to the next, which is the whole
  allowance the oil check has. Both found by the check-skeptic, the second
  as eleven false reds in twenty blocks.

  The shape by a Kolmogorov-Smirnov distance to the truncated log-normal,
  with its numbers written here rather than imported, so a change to the
  constants in beads.ts has to be made here too. Its 1 per cent line is
  1.63 / sqrt(n), 0.0067 at sixty thousand. The rings' pools, sampled the
  same way, are the control: about a tenth from it, far past the line.
  Then the oil: the mean r squared against the value the constants give
  (worked out below by summing the density, 3.14) and against the rings'
  own (3.15), so a drop that is born too small, or too big, shows. Then
  the ends: that no size is piled up at either, as a clamp in place of the
  redraw would do (one drop in sixty at the biggest size, one in twelve at
  the smallest), that the tail reaches the top of the range, and that the
  share of drops of three and a half cells or more is the law's, which a
  tail cut short (redrawn above 4.5, say) moves by a sixth.
*/
{
  const erf = (x) => {
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x >= 0 ? y : -y;
  };
  const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const MED = 1.18, SIG = 0.7, LO = 0.45, HI = 5.2, SLIDER = 1.12, WANT = 60000;
  const pLo = Phi(Math.log(LO / MED) / SIG), pHi = Phi(Math.log(HI / MED) / SIG);
  const cdf = (r) => (Phi(Math.log(r / MED) / SIG) - pLo) / (pHi - pLo);
  // The law's own mean r squared, by summing its density over the range.
  let lawR2 = 0;
  for (let k = 0, K = 20000; k < K; k++) {
    const r0 = LO * (HI / LO) ** (k / K), r1 = LO * (HI / LO) ** ((k + 1) / K), rm = Math.sqrt(r0 * r1);
    lawR2 += rm * rm * (cdf(r1) - cdf(r0));
  }
  const lawBig = 1 - cdf(3.5);
  const sizes = (drops) => {
    const rs = [];
    for (let s = 1; rs.length < WANT && s < 20000; s++) {
      seed(s);
      const g = new BeadField(N);
      g.drops = drops;
      g.populate(10, SLIDER);
      for (const b of g.beads) if (!b.tiny) rs.push(b.r / (SLIDER * N / 192));
    }
    return rs.sort((a, b) => a - b);
  };
  const ks = (rs) => rs.reduce((m, r, i) => Math.max(m, Math.abs(cdf(r) - i / rs.length), Math.abs(cdf(r) - (i + 1) / rs.length)), 0);
  const d = sizes(1), part = sizes(0.3), r = sizes(0);
  const line = 1.63 / Math.sqrt(WANT);
  const kd = ks(d), kp = ks(part), kr = ks(r);
  const full = d.length >= WANT && part.length >= WANT && r.length >= WANT;
  check('with drops on, a drop is born at a log-normal size', full && kd < line && kp < line && kr > 5 * line,
    `KS ${kd.toFixed(4)} at drops 1, ${kp.toFixed(4)} at 0.3, from median ${MED}, spread ${SIG} (the 1% line ${line.toFixed(4)}; the rings' pools ${kr.toFixed(4)}), ${d.length} drops a side`);
  const r2 = (rs) => rs.reduce((a, x) => a + x * x, 0) / rs.length;
  check('and the plate holds as much oil as the rings', full && Math.abs(r2(d) / lawR2 - 1) < 0.02 && Math.abs(r2(d) / r2(r) - 1) < 0.03,
    `mean r² ${r2(d).toFixed(3)}, against the law's ${lawR2.toFixed(3)} and the rings' ${r2(r).toFixed(3)}`);
  const piled = d.filter((x) => x >= HI * 0.995 || x <= LO * 1.005).length / d.length;
  const big = d.filter((x) => x >= 3.5).length / d.length;
  check('with none piled up at the ends, and the tail the law\'s',
    full && d[0] >= LO - 1e-9 && d[d.length - 1] <= HI + 1e-9 && d[d.length - 1] >= 0.98 * HI && piled < 0.01 && Math.abs(big / lawBig - 1) < 0.1,
    `${(100 * piled).toFixed(2)}% within half a per cent of ${LO} or ${HI}; biggest ${d[d.length - 1].toFixed(3)}; ${(100 * big).toFixed(2)}% at 3.5 cells or more against the law's ${(100 * lawBig).toFixed(2)}%`);
}

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
  The size range is the population's (the rings' two pools, and with
  drops on the log-normal measured above, over the same range): crowded
  rings make a cluster as wide, and the control line says so. What it asks of drops is that crowding them into walls and
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

  A drop still drawn out by a merge is asked of its oval, its own shape
  (the circle it came from is narrower than the oval across, and past the
  oval's sides that circle is rightly nobody's), squeezed back onto the
  circle as rasterDrops does. The mask here is drawn at full Drops.
*/
{
  let holes = 0, inside = 0, ovals = 0;
  for (const b of beads) {
    const R = Math.max(1, b.r * K), x0 = b.x * K, y0 = b.y * K;
    const st = b.sx !== undefined ? Math.hypot(b.sx, b.sy ?? 0) : 0, A = 1 + st;
    const ux = st > 0 ? b.sx / st : 1, uy = st > 0 ? (b.sy ?? 0) / st : 0;
    if (st > 0) ovals++;
    const ext = R * A;
    for (let y = Math.max(0, Math.floor(y0 - ext)); y <= Math.min(S - 1, Math.ceil(y0 + ext)); y++) {
      for (let x = Math.max(0, Math.floor(x0 - ext)); x <= Math.min(S - 1, Math.ceil(x0 + ext)); x++) {
        const vx = x + 0.5 - x0, vy = y + 0.5 - y0;
        const d = Math.hypot((vx * ux + vy * uy) / A, (vy * ux - vx * uy) * A);
        if (d > R - 0.5) continue;
        inside++;
        if (owner(x, y) < 0) holes++;
      }
    }
  }
  check('no pixel inside a drop is left to nobody', inside > 10000 && holes === 0, `${holes} of ${inside} (${ovals} drops still drawn out)`);
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

  Over nine crowded plates, fixed before looking at any of them (the one
  every other check here uses, and seeds 1 to 8), not one. On one plate
  the share swings by about four points from seed to seed, and the plate
  every other check uses was the luckiest of twenty-one: 35 per cent, where
  the old code averaged 25.3 over all twenty-one. The bar was a quarter,
  set on that plate, so it sat at the feature's own average and passed or
  failed on the seed. The check-skeptic surveyed it; drawing sizes
  log-normal moved the average to 24.4 (not a difference twenty-one plates
  can tell from nothing, about one standard error).

  So the bar is set from the feature and its failures, not from one plate:
  a fifth. What the feature does is about a quarter (24.4 per cent over
  twenty-one plates). Droplets placed round any drop, not the big ones
  most, give 17.9; none at all, 0; the rings have 4 in 96. A fifth passes
  the first and fails the others. That is a lower number than the quarter
  it replaces, and the reply that shipped it said so to the owner, with
  what raising the feature to a quarter would take.
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
  const plates = [beads, ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) => crowd(1, { s }).beads)].map(ringed);
  const d = plates.reduce((a, x) => ({ n: a.n + x.n, of: a.of + x.of }), { n: 0, of: 0 });
  const rp = [4242, 1, 2].map((s) => ringed(crowd(0, { palette: null, s }).beads));
  const r = rp.reduce((a, x) => ({ n: a.n + x.n, of: a.of + x.of }), { n: 0, of: 0 });
  check('big drops are ringed by droplets',
    plates.every((p) => p.of >= 60) && d.n >= 0.2 * d.of && rp.every((p) => p.of >= 30) && r.n <= 0.05 * r.of,
    `${d.n} of ${d.of} big drops on nine plates have three or more a sixth their size touching them, ${(100 * d.n / d.of).toFixed(1)}% (per plate ${plates.map((p) => Math.round(100 * p.n / p.of)).join(' ')}); rings ${r.n} of ${r.of}`);
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
    const px = (off, perp) => { const tw = wallAt(Ra, Rb, D, perp); return { x: Math.floor(a.x * K + ex * (tw + off) + nx * perp), y: Math.floor(a.y * K + ey * (tw + off) + ny * perp) }; };
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
  check('and meet along one wall, each drop on its own side of it', judged > 0 && straight >= 0.95 * judged, `${straight} of ${judged}`);
  check('and the dome falls to nothing at the wall', judged > 0 && lowWall >= 0.9 * judged, `${lowWall} of ${judged}`);
}

// ── A wall bows into the bigger drop ─────────────────────────────────
/*
  A small drop pushes harder than a big one (its pressure is its tension
  over its radius), so the wall between them is an arc bowed into the big
  one, of radius Rs Rb / (Rb - Rs), through the two points where their
  circles cross. Two drops, 3 and 8 cells, pressed two and a half cells into
  each other: along their line of centres, the first pixel the big one owns
  must be where that arc crosses the line, a sagitta past the straight power
  line, within a pixel; and the sagitta must be more than two pixels, or a
  straight wall would pass as well. Worked from the circles here, not from
  dropWall.
*/
{
  const rs = 3, rb = 8, dCells = rs + rb - 2.5;
  const pair = [
    { x: 60, y: 96, r: rs, age: 5, seed: 0.2, color: [1, 0, 0] },
    { x: 60 + dCells, y: 96, r: rb, age: 5, seed: 0.7, color: [0, 0, 1] },
  ];
  const px2 = new Uint8ClampedArray(S * 2 * S * 4), o2 = new Float32Array(S * S), i2 = new Int32Array(S * S);
  rasterDrops(pair, N, S, px2, o2, i2);
  const Rs = rs * K, Rb = rb * K, D = dCells * K;
  const t = (D * D + Rs * Rs - Rb * Rb) / (2 * D);
  const h2 = Rs * Rs - t * t, rho = Rs * Rb / (Rb - Rs);
  const sag = rho - Math.sqrt(rho * rho - h2);
  const y = Math.floor(96 * K), x0 = 60 * K;
  let first = -1;
  for (let x = Math.floor(x0); x < Math.floor(x0 + D); x++) if (i2[y * S + x] === 2) { first = x + 0.5 - x0; break; }
  check('a wall bows into the bigger drop, as their pressures say', first > 0 && sag > 2 && Math.abs(first - (t + sag)) <= 1,
    `the big drop starts ${first.toFixed(1)} px from the small one's centre; the straight wall was at ${t.toFixed(1)}, the arc (radius ${rho.toFixed(1)} px) at ${(t + sag).toFixed(1)}`);
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
  /*
    And a merge's oval likewise: a drop stretched 0.4 is drawn 1.96 times
    as long as it is wide at full Drops, and a twentieth of that stretch
    (1.04) at a twentieth. The light field does merge drops into full
    stretches (the merge sets the shape; the mask draws it in), so this is
    asked of the drawing, on one drop each way.
  */
  const aspect = (amount) => {
    const p = new Uint8ClampedArray(S * 2 * S * 4);
    rasterDrops([{ x: 96, y: 96, r: 4, age: 5, seed: 0.5, color: [1, 1, 1], sx: 0.4, sy: 0 }], N, S, p, new Float32Array(S * S), new Int32Array(S * S), amount);
    // From the coverage's second moments, which see a fraction of a pixel
    // (an ellipse's are in the ratio of its axes squared).
    const c = 96 * K; let ixx = 0, iyy = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const w = p[(y * S * 2 + x) * 4] / 255;
      if (w > 0) { ixx += w * (x + 0.5 - c) ** 2; iyy += w * (y + 0.5 - c) ** 2; }
    }
    return Math.sqrt(ixx / iyy);
  };
  const stretched = light.beads.filter((b) => b.sx !== undefined).length;
  const aLight = aspect(0.05), aFull = aspect(1);
  check('and a merge is a twentieth of an oval', Math.abs(aLight - 1.04) < 0.01 && Math.abs(aFull - 1.96) < 0.03,
    `a drop stretched 0.4 drawn ×${aLight.toFixed(3)} long over wide at a twentieth (says ×1.040), ×${aFull.toFixed(3)} at full (says ×1.96); ${stretched} drops of the light field stretched`);
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

// ── A merge takes time to come round ────────────────────────────────
/*
  Two drops that merge become one drop drawn out along the line they met
  on, which rounds in a time that goes as the cube of its size (item 7 of
  the research on bubbles and drops; mergeStretch and mergeRelax in
  beads.ts). A merge used to be one frame: two drops, then a bigger circle.

  The pairs are merged by the field's own rule, not by hand: a field whose
  random stream always draws 0 takes a pair pressed past its merge depth at
  once (the rule's two-in-a-hundred chance) and adds no wander, so where
  the pair lay is the line asked about. Pressed side by side, one above
  the other, and on a slant, so a stretch that ignored the line, or took
  one axis for it, fails on one of them.
*/
{
  const still = { float: () => 0, centred: () => 0 };
  const pair = (r1, r2, d, ang, drops = 1) => {
    const f = new BeadField(N, still);
    f.drops = drops;
    const c = [96, 96], u = [Math.cos(ang), Math.sin(ang)];
    f.beads.push({ x: c[0], y: c[1], r: r1, age: 5, seed: 0.5 }, { x: c[0] + u[0] * d, y: c[1] + u[1] * d, r: r2, age: 5, seed: 0.3 });
    return { f, u };
  };
  const dt = 1 / 600;
  const lines = [];
  let lineOk = true;
  /*
    What the stretch should be, written out rather than asked of
    mergeStretch, the function under test: sqrt(2) - 1 for two of a size,
    and for 3 and 1.6 cells (not small enough to go in whole),
    sqrt(3^2 + 1.6^2) / 3 - 1 = 0.1333, which a rule on the smaller of the
    two would make 1.13 (held to 0.5). The step relaxes stretches before it
    crowds and merges, so a drop merged in it has all of its stretch. And
    it sits on the pair's area-weighted middle, to a hundredth of a cell.
  */
  for (const [r1, r2, d, ang, want] of [[3, 3, 2.9, 0, Math.SQRT2 - 1], [3, 3, 2.9, Math.PI / 2, Math.SQRT2 - 1], [3, 3, 2.9, 0.6, Math.SQRT2 - 1], [3, 1.6, 2.5, 0.6, Math.hypot(3, 1.6) / 3 - 1]]) {
    const { f, u } = pair(r1, r2, d, ang);
    const w2 = r2 * r2 / (r1 * r1 + r2 * r2), mid = [96 + u[0] * d * w2, 96 + u[1] * d * w2];
    f.step(dt, () => [0, 0], 0, 0);
    const b = f.beads[0];
    const st = Math.hypot(b.sx ?? 0, b.sy ?? 0);
    // Along the line either way round: an ellipse is the same both ways.
    const off = st > 0 ? Math.acos(Math.min(1, Math.abs((b.sx * u[0] + b.sy * u[1]) / st))) * 180 / Math.PI : 90;
    const away = Math.hypot(b.x - mid[0], b.y - mid[1]);
    lineOk &&= f.beads.length === 1 && off < 0.5 && Math.abs(st - want) < 1e-6 && away < 0.01;
    lines.push(`${r1}+${r2}: ${f.beads.length} drop, ${st.toFixed(4)} (says ${want.toFixed(4)}) at ${off.toFixed(2)}° off the line, ${away.toFixed(3)} cells from the pair's middle`);
  }
  check('two drops merge into one drawn out along the line they met on, as wide as the wider, on the pair\'s middle',
    lineOk, lines.join('; '));

  /*
    A drop still drawn out that merges again keeps the longer stretch: two
    3-cell drops, then a 2.2-cell one pressed in from above. The second
    merge alone would stretch it 0.126 across; it keeps the first's 0.414
    along the first line, less one step's relaxing.
  */
  {
    const { f } = pair(3, 3, 2.9, 0);
    f.step(dt, () => [0, 0], 0, 0);
    const b = f.beads[0], s1 = Math.hypot(b.sx, b.sy), R1 = b.r;
    f.beads.push({ x: b.x, y: b.y + 3.5, r: 2.2, age: 5, seed: 0.7 });
    f.step(dt, () => [0, 0], 0, 0);
    const kept = s1 * Math.exp(-dt / mergeRelax(R1, N));
    const st = Math.hypot(b.sx ?? 0, b.sy ?? 0), off = Math.acos(Math.min(1, Math.abs((b.sx ?? 0) / (st || 1)))) * 180 / Math.PI;
    check('and a second merge keeps the longer of the two stretches',
      f.beads.length === 1 && Math.abs(st - kept) < 1e-6 && off < 0.5,
      `${f.beads.length} drop, ${st.toFixed(4)} (the first merge's, relaxed a step: ${kept.toFixed(4)}) at ${off.toFixed(2)}° off its line`);
  }

  /*
    How long each takes to lose all but 1/e of its stretch, stepped at 600
    a second so a drop that rounds in a few frames is timed to a hundredth
    of its time. A drop twice the size takes eight times as long, within a
    tenth; and the big one, 4.2 cells (two 3-cell drops), is still drawn
    out for a visible time (over a quarter of a second), where the small
    one, 2.1 cells, is round again within six frames of 60.
  */
  /*
    Stepped on until the stretch is let go, so a drop snapped round early
    (the last stretch before it is gone must be under a hundredth, a tenth
    of a pixel on a five-cell drop) fails as well as a slow one; and the
    big one timed again at the app's own 60 a second, which must agree to a
    frame, so a relaxing that ignored the step's length fails.
  */
  const settle = (r, d, step = dt) => {
    const { f } = pair(r, r, d, 0);
    f.step(step, () => [0, 0], 0, 0);
    const b = f.beads[0], s0 = Math.hypot(b.sx ?? 0, b.sy ?? 0);
    if (!(s0 > 0)) return { t: NaN, R: b.r, last: NaN };
    let t = Infinity, last = s0;
    for (let i = 1; i < 60000; i++) {
      f.step(step, () => [0, 0], 0, 0);
      if (b.sx === undefined) return { t, R: b.r, last };
      last = Math.hypot(b.sx, b.sy ?? 0);
      if (t === Infinity && last < s0 / Math.E) t = i * step;
    }
    return { t, R: b.r, last };
  };
  const big = settle(3, 2.9), small = settle(1.5, 1.4), big60 = settle(3, 2.9, 1 / 60);
  const ratio = big.t / small.t, cube = (big.R / small.R) ** 3;
  check('and it comes round in a time that goes as the cube of its size',
    Math.abs(ratio / cube - 1) < 0.1 && big.t > 0.25 && small.t < 0.1 && big.last < 0.01 && small.last < 0.01 && Math.abs(big60.t - big.t) <= 1 / 60,
    `${big.R.toFixed(2)} cells in ${big.t.toFixed(3)} s (${big60.t.toFixed(3)} at 60 a second), ${small.R.toFixed(2)} cells in ${small.t.toFixed(3)} s: ×${ratio.toFixed(2)}, the cube says ×${cube.toFixed(2)}; let go at ${big.last.toFixed(4)} and ${small.last.toFixed(4)}`);

  /*
    Not for a small drop that went in whole (there was no waist to fill),
    and never for the rings: at drops 0 a merge is the rings' merge.
  */
  const swallow = pair(4, 1.8, 2, 0);
  swallow.f.step(dt, () => [0, 0], 0, 0);
  const rings = pair(3, 3, 2.9, 0, 0);
  rings.f.step(dt, () => [0, 0], 0, 0);
  const rc = crowd(0);
  const ringStretched = rc.beads.filter((b) => b.sx !== undefined).length;
  check('a drop that went in whole leaves none, and the rings never stretch',
    swallow.f.beads.length === 1 && swallow.f.beads[0].sx === undefined && rings.f.beads.length === 1 && rings.f.beads[0].sx === undefined && ringStretched === 0,
    `swallowed: ${swallow.f.beads.length} drop, stretch ${swallow.f.beads[0]?.sx ?? 'none'}; the rings' merge: ${rings.f.beads[0]?.sx ?? 'none'}; ${ringStretched} of ${rc.beads.length} rings in a crowded run stretched`);

  /*
    And the mask draws it as an oval of its own area: a 5-cell drop at a
    stretch of 0.3 on a slant is 1.3 times its radius long that way and
    1/1.3 across, so its length over its width is 1.69, and it covers what
    its round self does.
  */
  const st = 0.3, a = Math.PI / 5;
  const px = new Uint8ClampedArray(S * 2 * S * 4);
  rasterDrops([{ x: 96, y: 96, r: 5, age: 5, seed: 0.5, color: [1, 1, 1], sx: st * Math.cos(a), sy: st * Math.sin(a) }], N, S, px, new Float32Array(S * S), new Int32Array(S * S), 1);
  let cover = 0, lo = Infinity, hi = -Infinity, lo2 = Infinity, hi2 = -Infinity;
  const c0 = 96 * K;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = px[(y * S * 2 + x) * 4];
    cover += v / 255;
    if (v < 128) continue;
    const vx = x + 0.5 - c0, vy = y + 0.5 - c0;
    const al = vx * Math.cos(a) + vy * Math.sin(a), ac = vy * Math.cos(a) - vx * Math.sin(a);
    lo = Math.min(lo, al); hi = Math.max(hi, al); lo2 = Math.min(lo2, ac); hi2 = Math.max(hi2, ac);
  }
  const round = Math.PI * (5 * K) ** 2, aspect = (hi - lo) / (hi2 - lo2);
  check('the mask draws a stretched drop as an oval of its own area',
    Math.abs(cover / round - 1) < 0.03 && Math.abs(aspect / (1 + st) ** 2 - 1) < 0.06,
    `${cover.toFixed(0)} px covered against ${round.toFixed(0)} round; ${(hi - lo).toFixed(1)} px long by ${(hi2 - lo2).toFixed(1)} across, ×${aspect.toFixed(3)} (says ×${((1 + st) ** 2).toFixed(3)})`);

  /*
    And meets a neighbour its long end reaches along a wall, as round drops
    do: a 5-cell drop stretched 0.414 along x, and a round 4-cell drop whose
    circle starts a cell short of the oval's end. The circles do not touch,
    so a wall found from them alone left the oval painting into its
    neighbour (6 to 10 of its pixels). Asked both ways round, as the drop
    drawn first or second.
  */
  const ovalAt = [96, 96], nb = [96 + 5 * Math.SQRT2 - 1 + 4, 96];
  const taken = [];
  for (const order of [0, 1]) {
    const oval = { x: ovalAt[0], y: ovalAt[1], r: 5, age: 5, seed: 0.5, color: [1, 1, 1], sx: Math.SQRT2 - 1, sy: 0 };
    const other = { x: nb[0], y: nb[1], r: 4, age: 5, seed: 0.3, color: [0, 1, 0] };
    const list = order ? [other, oval] : [oval, other];
    const ids = new Int32Array(S * S);
    rasterDrops(list, N, S, new Uint8ClampedArray(S * 2 * S * 4), new Float32Array(S * S), ids, 1);
    const ovalId = list.indexOf(oval) + 1;
    let n = 0, all = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (Math.hypot(x + 0.5 - nb[0] * K, y + 0.5 - nb[1] * K) > 4 * K - 1) continue;
      all++; if (ids[y * S + x] === ovalId) n++;
    }
    taken.push(`${n} of ${all}`);
  }
  check('and meets a neighbour its long end reaches along a wall, not over it',
    taken.every((t) => t.startsWith('0 of')), `pixels of the neighbour's circle the oval took, drawn first and second: ${taken.join(', ')}`);
}

console.log(`     the mask for ${beads.length} drops took ${ms.toFixed(1)} ms to draw (the rings' canvas is not timed here)`);
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
