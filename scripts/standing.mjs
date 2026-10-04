#!/usr/bin/env node
/**
 * The ferrofluid stands up under a magnet, as a layer keeping its volume
 * (PLAN §9t). Measured on the GPU solver (scripts/lab.mjs).
 *
 *   npm run standing
 *
 * What was wrong: the plate kept the ferrofluid's area, not its volume, so
 * domes could not rise out of a pool and open gaps between them; under the
 * Magnet 84% of the plate near it stayed black, where every reference has
 * black domes with the colour between. The film (src/gpu/standing.ts) steps
 * the layer's thickness round the magnet as a thin film under the normal-
 * field instability. What a real layer does, and so what is asked:
 *
 *   1. under the onset (a magnet that raised domes, turned down to 0.8 of
 *      the onset's field before any had risen) the layer stays flat: no cell
 *      stands past full, and the pool near the magnet stays covered, with
 *      the film running every step of it (the plate's own cap at full
 *      would hold it flat without the film)
 *   2. past it, domes stand up: tops twice the pool's depth or more, at
 *      least eight within 0.08 of the magnet, and about a capillary
 *      wavelength apart (spikes.ts's SPIKE_PITCH, 2π l_c): the median
 *      distance from each top to its nearest between 0.7 and 1.15 of it, read
 *      once the domes have risen and again as long after.
 *      Not nearer to it than that: the wavelength is the onset's, and past
 *      the onset the pattern's is shorter (in this model the fastest to grow
 *      under the Magnet is 0.55 of it, and what stands after the domes
 *      have merged a while is 0.8). Grid-scale bumps would be a quarter of
 *      it; a pool gathered whole, one top
 *   3. the gaps open: within 0.08 of the magnet the plate is no longer
 *      covered (under 0.75 of it past half full, where it was all), and less
 *      of it the stronger the field, as the domes grow taller on the same
 *      volume: under the Magnet less than at 0.35, half way from the onset
 *      to it. Not just past the onset (0.25): there the layer is all but
 *      neutral, its growth going as G − 2, and six seconds left it flat
 *   4. turned down under the onset again, the domes lie back down into the
 *      pool: none left, no cell past 1.1 of full, and the layer spreading
 *      back over the glass (covering 0.3 more of the plate near the magnet
 *      than under it), 0.8 of the onset's field after as long as the
 *      Magnet held them; sinking, not wiped: half a second in, a top still
 *      past full, and the film running throughout. Real domes stay a little under the
 *      field that raised them (the hysteresis), but by a few per cent of
 *      it, not a fifth; and here not at all: turned to 0.95 of the onset on
 *      the axis, all 15 were gone two seconds on (PLAN 9t)
 *   5. and the ferrofluid is neither made nor lost
 *
 * On 384², where a capillary length is 2.4 cells and a dome six or seven
 * across. Domes are counted on the field: a cell past 2 (twice a full
 * cell's depth) that is the highest within three cells.
 *
 * About twenty minutes in a cloud session; a minute or two on the Mac.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 384;
const AT = { x: 0.36, y: 0.65 };
// The hand's height (LiquidVisualizer's magnetFor at the default Scale) and
// strengths that put its field on its axis where asked, on spikes.ts's
// scale: 0.8 is the Magnet tool, 0.35 part way past the onset (0.18), 0.144
// under it (0.8 of the onset).
const HEIGHT = 0.135;
const REL3 = (HEIGHT / 0.13) ** 3;
const at = (field) => ({ magnetX: AT.x, magnetY: AT.y, magnetHeight: HEIGHT, magnetStrength: field * REL3 });
const RISE = 240;

const { page, close } = await openLab();
try {
  /**
   * A pool on a dyed plate under the magnet, stepped in legs of
   * (field, steps), and read after each leg within 0.08 of the magnet.
   */
  const run = (legs) => page.evaluate(async ({ legs, N, AT }) => {
    await lab.create(N);
    // Built now, so the film runs from the magnet's first step on every
    // machine: the app builds it behind the show, and on the software GPU
    // that took long enough that what was read depended on it.
    await lab.prepareFilm();
    const cols = [[0.02, 0.36, 2.0], [2.0, 0.4, 0.48], [0.02, 0.8, 1.05]];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) lab.dye(0.12 + i * 0.25, 0.12 + j * 0.25, 0.16, cols[(i + j) % 3], 1.3);
    lab.flush(); await lab.step(2);
    lab.addPhase(AT.x, AT.y, 0.12, 0.9);
    const read = async () => {
      const f = await lab.phase(); const n = f.n, d = f.data;
      let mass = 0, cells = 0, covered = 0, peak = 0;
      const near = (x, y) => Math.hypot((x + 0.5) / n - AT.x, (y + 0.5) / n - AT.y) < 0.08;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = d[x + y * n]; mass += v;
        if (!near(x, y)) continue;
        cells++; peak = Math.max(peak, v); if (v >= 0.5) covered++;
      }
      // Tops: past 2 and the highest within three cells (ties to the first).
      const tops = [];
      for (let y = 3; y < n - 3; y++) for (let x = 3; x < n - 3; x++) {
        if (!near(x, y)) continue;
        const v = d[x + y * n]; if (v < 2) continue;
        let top = true;
        for (let j = -3; j <= 3 && top; j++) for (let i = -3; i <= 3; i++) {
          if (!i && !j) continue; const w = d[x + i + (y + j) * n];
          if (w > v || (w === v && (j < 0 || (j === 0 && i < 0)))) { top = false; break; }
        }
        if (top) tops.push([(x + 0.5) / n, (y + 0.5) / n]);
      }
      const nearest = tops.map(([u, v], k) => Math.min(...tops.filter((_, j) => j !== k).map(([a, b]) => Math.hypot(a - u, b - v)))).sort((a, b) => a - b);
      const spacing = nearest.length ? nearest[Math.floor(nearest.length / 2)] : 0;
      return { mass, cover: covered / cells, peak, domes: tops.length, spacing, film: lab.filmSteps() };
    };
    const out = [await read()];
    for (const [over, steps] of legs) {
      for (let k = 0; k < steps; k += 4) await lab.step(4, over);
      const r = await read();
      // The steps of this leg the film ran in, of `steps`.
      r.ran = r.film - out[out.length - 1].film;
      out.push(r);
    }
    return out;
  }, { legs, N, AT });

  const fmt = (r) => `${r.domes} domes, spaced ${r.spacing.toFixed(4)}, cover ${r.cover.toFixed(2)}, peak ${r.peak.toFixed(2)}`;
  // The hand's magnet, read after RISE and as long again; then turned down
  // under the onset for as long as it was held, read 32 steps in (half a
  // second; legs step in fours) and at the end.
  const DOWN = 2 * RISE;
  const hand = await run([[at(0.8), RISE], [at(0.8), RISE], [at(0.144), 32], [at(0.144), DOWN - 32]]);
  // Part way past the onset.
  const weak = await run([[at(0.35), RISE * 1.5]]);
  // Brought up to the onset and past it, then turned down under it before any dome rose:
  // the film is running (it stays on down to half the onset), and the layer is flat.
  const under = await run([[at(0.2), 8], [at(0.144), RISE]]);
  console.log(`  near the magnet (within 0.08), the pool as poured: ${fmt(hand[0])}`);
  console.log(`  the Magnet (field 0.8): ${fmt(hand[1])}; as long again: ${fmt(hand[2])}`);
  console.log(`  then turned down to 0.144, half a second in: ${fmt(hand[3])}; at the end: ${fmt(hand[4])} (the film ran ${hand[3].ran + hand[4].ran} of ${DOWN} steps)`);
  console.log(`  part way past the onset (0.35): ${fmt(weak[1])}`);
  console.log(`  under the onset (0.144) from the start: ${fmt(under[2])} (the film ran ${under[2].ran} of ${RISE} steps)\n`);

  const u = under[2];
  /*
    Each asked of the film running: with it never built, the plate's own cap
    at full holds a pool flat and lays any dome down, and 1 and 4 would pass
    on nothing (the check-skeptic's reading). So the film's own count of the
    steps it ran in, every step of the leg.
  */
  check('under the onset the layer stays flat', u.ran === RISE && u.peak < 1.05 && u.domes === 0 && u.cover > 0.95,
    `peak ${u.peak.toFixed(3)}, ${u.domes} domes, ${u.cover.toFixed(2)} of the plate near the magnet covered, the film running ${u.ran} of ${RISE} steps`);
  const h = hand[1], h2 = hand[2], pitch = 0.04;
  // At RISE and at twice it: a spacing read once could be any moment of
  // the domes merging (the header's 0.55 to 0.8 of the pitch).
  const spaced = (r) => r.domes >= 8 && r.spacing >= 0.7 * pitch && r.spacing <= 1.15 * pitch;
  check('past it, domes stand up a capillary wavelength apart',
    spaced(h) && spaced(h2),
    `${h.domes} then ${h2.domes} domes twice the pool's depth or more, their nearest neighbours a median ${h.spacing.toFixed(4)} then ${h2.spacing.toFixed(4)} apart against 2π l_c = ${pitch}`);
  const w = weak[1];
  // Domes at 0.35 as well: a pool thinning with none standing would open
  // the plate too.
  check('and the gaps open, wider the stronger the field',
    h.cover < 0.75 && w.cover < 0.95 && w.domes >= 2 && h.cover < w.cover - 0.03,
    `covered within 0.08: ${hand[0].cover.toFixed(2)} as poured, ${w.cover.toFixed(2)} at 0.35 (${w.domes} domes), ${h.cover.toFixed(2)} under the Magnet`);
  const e = hand[3], d = hand[4];
  /*
    Down, not wiped: half a second in, a top still past full, so the domes
    sink under the film's own flow and not by a cap put back on the plate.
    Lying down is the domes gone and the layer back under full, spreading
    back over the glass: not covering all of it again. Held 240 steps and
    let down as long, the plate near the magnet was covered again
    entirely; held 480, where the domes had stood long enough to part the
    layer down to the glass, it came back to 0.73 to 0.78 covered after 240
    and 480 steps down, the domes long gone (peak 0.91 to 1.00). That is the
    wetting at its 10° holding the dry patches open, as a real layer let
    down leaves puddles that join slowly rather than closing at once.
  */
  check('turned down under the onset, they lie back down',
    e.ran + d.ran === DOWN && e.peak > 1.1 && d.domes === 0 && d.peak < 1.1 && d.cover > h2.cover + 0.3 && h2.domes >= 8,
    `${h2.domes} domes at the Magnet's field; at 0.8 of the onset's, peak ${e.peak.toFixed(2)} half a second in, ${d.domes} domes and peak ${d.peak.toFixed(2)} after as long as the Magnet held them, the plate near it ${d.cover.toFixed(2)} covered (${h2.cover.toFixed(2)} under the Magnet); the film running ${e.ran + d.ran} of ${DOWN} steps`);
  const drift = Math.max(...[hand, weak, under].map((r) => Math.abs(r[r.length - 1].mass / r[0].mass - 1)));
  check('and none of the ferrofluid is made or lost', drift < 0.001,
    `the most any run changed it: ${(drift * 100).toFixed(3)}%`);
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
