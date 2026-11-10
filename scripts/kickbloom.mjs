#!/usr/bin/env node
/**
 * The kick's bloom (`npm run kickbloom`, node only, about a second).
 *
 * The droplets each kick throws used to be inline in the visualizer's frame
 * loop, where only a grep of the source could reach them (panel.mjs held them
 * that way). PLAN 19ai-10 moved them to lib/kickBloom.ts, so this calls the
 * code that runs, on a sink that records every droplet, and keeps the grep
 * only for what stays in the loop: what the loop hands the bloom.
 *
 *  1. The dial (Kick Bloom). The loop throws a bloom only on a kick with the
 *     dial over 0, and hands it the dial twice: in the dye's gain (with the
 *     fill's room, `autoAmp * pourDt * bloomGain`) and as the push's. And the
 *     bloom honours both: the dye it lays and the push it gives scale with
 *     their gains, each alone (twice the dye's gain, twice the dye and the
 *     same push), and a dye's gain of 0 lays no dye at all while the push is
 *     still thrown.
 *  2. Not a ring (the owner, 2026-10-21). Over 200 seeded kicks, the
 *     droplets' angles round the burst's centre are not evenly spaced: in a
 *     kick of n droplets on one circle every gap is 2π/n; here the largest
 *     gap in a kick averages well over twice that (a lobe of clumps and an
 *     empty side). And 5 to 11 droplets a kick, as the comment says.
 *  3. A touch on a reagent lays no dye (PLAN 25i-10). An area whose liquid is
 *     a reagent (Chemical Clock's three activator places, Red Cabbage's acid
 *     and base wells) answers the music with a drop of that reagent, and its
 *     colour is the chemistry's. The cords were made so in 25i; the loop's
 *     own hands were not, and every kick threw 5 to 11 droplets of the area's
 *     dye on the gel, which stands still and kept them, so they piled into
 *     the clusters the owner saw on the live stream (2026-11-10). Two
 *     halves: (a) `musicDyeIn` is 0 for every reagent area a look ships and
 *     1 for every other; (b) in the loop, every pour of an area's colour
 *     (each variable read off `areaCycle` or `areaColor`, and the bloom's
 *     call) carries `musicDyeIn` of that same area, so a pour added later
 *     without it, or with another area's, is red here.
 */
import { readFileSync } from 'node:fs';
import { throwKickBloom } from '../src/lib/kickBloom.ts';
import { musicDyeIn, reagentArea } from '../src/lib/areaCords.ts';
import { PRESET_AREAS } from '../src/lib/plateAreas.ts';
import { makeRng } from '../src/lib/rng.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

const vis = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
const bloomSrc = readFileSync('src/lib/kickBloom.ts', 'utf8');

/** One kick on a recording sink: the dye laid, the push given, each droplet's cell. */
function kick(seed, dyeGain, pushGain, hit = 0.8) {
  const dice = makeRng(seed, 'kickbloom');
  const rec = { dye: 0, push: 0, dyed: 0, cells: [] };
  const sink = {
    addDensity(x, y, a) { rec.dye += a; rec.dyed++; },
    addVelocity(x, y, vx, vy) { rec.push += Math.hypot(vx, vy); rec.cells.push([x, y]); },
  };
  throwKickBloom(sink, dice, 256, 128, 128, 24, { r: 1, g: 0.5, b: 0.2 }, hit, dyeGain, pushGain);
  return rec;
}

// ── 1. The dial ──
{
  const burst = vis.slice(vis.indexOf('const bloomGain'), vis.indexOf('// The beat dose'));
  check('the loop throws the bloom only on a kick with Kick Bloom over 0, and hands it the dial in the dye\'s gain and as the push\'s',
    /kickBloom \?\? 1/.test(burst) && /bloomGain > 0/.test(burst)
      && /throwKickBloom\([^;]*autoAmp \* pourDt \* bloomGain[^,;]*, bloomGain\);/.test(burst),
    'src/components/LiquidVisualizer.tsx');
  const a = kick(1, 1, 1), b = kick(1, 2, 1), c = kick(1, 1, 2), z = kick(1, 0, 1);
  const r = (x, y) => x / y;
  check('the bloom scales its dye with the dye\'s gain and its push with the push\'s, each alone',
    Math.abs(r(b.dye, a.dye) - 2) < 1e-9 && Math.abs(r(b.push, a.push) - 1) < 1e-9
      && Math.abs(r(c.push, a.push) - 2) < 1e-9 && Math.abs(r(c.dye, a.dye) - 1) < 1e-9,
    `dye x${r(b.dye, a.dye).toFixed(3)} push x${r(c.push, a.push).toFixed(3)}; the other x${r(b.push, a.push).toFixed(3)}, x${r(c.dye, a.dye).toFixed(3)}`);
  check('a dye\'s gain of 0 lays no dye, and the push is still thrown',
    a.dyed > 0 && z.dyed === 0 && z.dye === 0 && Math.abs(z.push - a.push) < 1e-9,
    `${z.dyed} droplets dyed of ${z.cells.length}; push ${z.push.toFixed(3)} against ${a.push.toFixed(3)}`);
}

// ── 2. Not a ring ──
{
  let gapRatio = 0, kicks = 0, fewest = Infinity, most = 0;
  for (let s = 0; s < 200; s++) {
    const k = kick(100 + s, 1, 1);
    const n = k.cells.length;
    fewest = Math.min(fewest, n); most = Math.max(most, n);
    if (n < 3) continue;
    const cx = k.cells.reduce((t, p) => t + p[0], 0) / n, cy = k.cells.reduce((t, p) => t + p[1], 0) / n;
    const ang = k.cells.map(([x, y]) => Math.atan2(y - cy, x - cx)).sort((p, q) => p - q);
    let big = ang[0] + 2 * Math.PI - ang[n - 1];
    for (let i = 1; i < n; i++) big = Math.max(big, ang[i] - ang[i - 1]);
    gapRatio += big / (2 * Math.PI / n); kicks++;
  }
  gapRatio /= kicks;
  check('the droplets are clumps at random angles, not evenly round one circle (largest gap over 2x an even ring\'s)',
    gapRatio > 2 && bloomSrc.includes('lobeAt') && !/\(d \/ drops\) \* Math\.PI \* 2/.test(bloomSrc),
    `largest gap ${gapRatio.toFixed(2)}x an even ring's, over ${kicks} kicks`);
  check('5 to 11 droplets a kick', fewest >= 5 && most <= 11, `${fewest} to ${most}`);
}

// ── 3. A touch on a reagent lays no dye ──
{
  const wrong = [];
  let reagents = 0, others = 0;
  for (const [id, areas] of Object.entries(PRESET_AREAS)) {
    areas.forEach((a, i) => {
      const want = reagentArea(a) ? 0 : 1;
      if (want === 0) reagents++; else others++;
      if (musicDyeIn(a) !== want) wrong.push(`${id} area ${i} (${a.liquid}) ${musicDyeIn(a)}`);
    });
  }
  const clock = PRESET_AREAS['chemical-clock'] ?? [];
  check('the music lays no dye in a reagent area and all of it in any other',
    wrong.length === 0 && musicDyeIn(null) === 1 && reagents >= 5 && others > reagents
      && clock.length === 3 && clock.every(a => musicDyeIn(a) === 0),
    wrong.length ? wrong.join('; ') : `${reagents} reagent areas (Chemical Clock's 3 among them), ${others} others`);

  // Every variable the loop reads an area's colour into, with the area it read and the line it is read on.
  const lineOf = (i) => vis.slice(0, i).split('\n').length - 1;
  const colourVars = [...vis.matchAll(/const (\w+) = (\w+) \? (?:areaCycle\([^,]+, (\w+)|areaColor\([^,]+, (\w+))/g)]
    .map(m => ({ v: m[1], area: m[3] ?? m[4], from: lineOf(m.index) }));
  const pourIntoArea = vis.match(/const color = areaColor\(layer, area\);\n\s*(.+)\n/);
  const misses = [];
  let pours = 0;
  const lines = vis.split('\n');
  for (const { v, area, from } of colourVars) {
    // Its uses in the block that read it (the next 50 lines): a `color` elsewhere is another pour's.
    for (let i = from + 1; i < from + 50; i++) {
      if (!lines[i].includes(`${v}.r`)) continue;
      // The call, with the line or two it opens on when its colour is wrapped onto a line of its own.
      const call = lines.slice(i - 2, i + 1).join(' ');
      pours++;
      if (!call.includes(`musicDyeIn(${area})`)) misses.push(`${v}: ${lines[i].trim().slice(0, 90)}`);
    }
  }
  if (!pourIntoArea || !pourIntoArea[1].includes('musicDyeIn(area)')) misses.push(`pourIntoArea: ${pourIntoArea?.[1]?.trim().slice(0, 90)}`);
  const bloomCall = vis.match(/throwKickBloom\(activeFluid[^;]*\);/)?.[0] ?? '';
  if (!/ringCol, [^;]*musicDyeIn\(bassArea\), bloomGain\)/.test(bloomCall)) misses.push(`bloom: ${bloomCall.slice(0, 120)}`);
  check('every pour of an area\'s colour in the frame loop carries musicDyeIn of that area',
    colourVars.length >= 6 && pours >= 6 && misses.length === 0,
    misses.length ? misses.join(' | ') : `${colourVars.length} colours, ${pours + 2} pours`);
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
