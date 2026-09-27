#!/usr/bin/env node
/**
 * The magnet stands the ferrofluid up: spikes under it, fingers at its edge.
 * Measured on the GPU solver and the plate shader (scripts/lab.mjs).
 *
 *   npm run spikes
 *
 * Reported by the owner: "The ferrofluid magnet still sucks and doesn't make
 * spikes or fingers. It's just a big blob that gets pulled around by the
 * magnet." What the references show (Chemical Bouillon's, in
 * /mnt/project-files/ferrofluid-look/references) is a field of separate
 * black domes under a magnet, a star of light and a white point on each,
 * and a ragged edge. So, on a pool a player might hold the Magnet under:
 *
 *   1. held close the way the Magnet tool holds it, the magnet parts the
 *      pool into domes: many peaks, most of them separate pieces, against
 *      the same pool with no magnet and under a look's own magnet
 *   2. so the ferrofluid's outline near it is no longer a blob's: its edge
 *      is at least twice as long, for its area, as with either control
 *   3. the plate lights a point on the domes: what the picture gains from
 *      the magnet (drawn with it, less drawn with the plate told of none,
 *      over the same field) is bright points, at least one for every two
 *      domes, and nothing with no magnet. The magnet is off the plate's
 *      middle in both axes, so a plate that drew its spikes mirrored
 *      against the solver's domes would light them round the mirror,
 *      outside the patch counted
 *   4. a look's own magnet, held further off, leaves the pool whole and
 *      unlit: the spikes need a magnet brought up close, as a real one
 *      does, so a look that gathers its ferrofluid with its own magnet still
 *      does. Magnet Garden's, the strongest (0.14 of the hand's field; the
 *      onset is 0.18)
 *   5. a second magnet (a second finger on the phone) raises domes in its
 *      own pool and lights them, where the first alone leaves that pool
 *      (still there) with next to none
 *   6. and none of it makes or loses ferrofluid, or packs a cell past full
 *
 * Measured before the fix, the Magnet tool left one piece with 3 peaks (the
 * maze's own bumps: 2 with no magnet), an outline 1.84 of a disc's (1.76
 * with none), and added nothing to the picture.
 *
 * A dome is a peak of the ferrofluid with a valley round it (see around());
 * pieces are 4-connected runs of cells past half full. Both within a radius
 * of the magnet, so what the rest of the plate does is not counted.
 *
 * Not asserted: fingers reaching out past the spikes. A pool larger than
 * the spikes' reach (poured 0.28 in radius) neither parted nor fingered at its far
 * edge in four seconds, which is the physics as modelled: between glass the
 * layer cannot thin in the middle without somewhere to go. PLAN.md §9.
 *
 * The picture is read where the plate is drawn: the lab draws the plate 1.5
 * times the frame across, with the plate's y up and the picture's rows down
 * (ferrolook.mjs, toPx), so a pixel is taken back to the plate before the
 * phase under it is read.
 *
 * On 256², the grid a software GPU runs the app at, where a spike's pitch
 * (SPIKE_PITCH, 0.04 of the plate) is ten cells and the domes are coarsest.
 * About ten minutes in a cloud session; well under one on the Mac.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// The Magnet tool in the hand, as LiquidVisualizer's magnetFor holds it:
// strength 0.9, and the solver's height min(look height, 0.15) × (0.5 +
// Ferrofluid Scale), 0.135 at the default Scale. A look's own magnet: Magnet
// Garden's, 0.3 × (0.5 + 0.3), as deriveStep holds it.
const HAND = { magnetStrength: 0.9, magnetHeight: 0.15 * 0.9 };
const FAR = { magnetStrength: 0.9, magnetHeight: 0.3 * 0.8 };
const STEPS = 240;
// Off the middle in both axes (see 3), far enough that the patch a mirrored
// plate would light (0.15 round the mirror image) misses the one counted
// (0.12 round the magnet): the mirrors are 0.28 and 0.30 away.
const AT = { x: 0.36, y: 0.65 };

const { page, close } = await openLab();
try {
  /**
   * Pools of ferrofluid (x, y, r) on a coloured plate, stepped with a magnet
   * (or none), then read: mass, peak, and at each place asked about the
   * domes, the pieces, the outline and the lit points within `near`.
   */
  const run = (over, pools, places) => page.evaluate(async ({ over, pools, places, STEPS }) => {
    const pool = pools[0];
    await lab.create(256);
    const cols = [[0.02, 0.36, 2.0], [2.0, 0.4, 0.48], [0.02, 0.8, 1.05]];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) lab.dye(0.12 + i * 0.25, 0.12 + j * 0.25, 0.16, cols[(i + j) % 3], 1.3);
    lab.flush(); await lab.step(2);
    for (const q of pools) lab.addPhase(q.x, q.y, q.r, 0.9);
    const before = await lab.phase();
    for (let k = 0; k < STEPS; k += 4) await lab.step(4, { ferroLabyrinth: 0.58, phaseSharp: 0.6, phaseDisplace: 1, ...over });
    const f = await lab.phase(); const n = f.n, d = f.data;
    let mass = 0, mass0 = 0, peak = 0;
    for (let i = 0; i < n * n; i++) { mass += d[i]; mass0 += before.data[i]; peak = Math.max(peak, d[i]); }
    const at = (x, y) => d[Math.max(0, Math.min(n - 1, x)) + Math.max(0, Math.min(n - 1, y)) * n];
    const phaseAt = (fx, fy) => at(Math.floor(fx * n), Math.floor(fy * n));
    const around = (mx, my, near) => {
      const seen = new Uint8Array(n * n); let pieces = 0, open = 0, cells = 0;
      const inside = (x, y) => Math.hypot((x + 0.5) / n - mx, (y + 0.5) / n - my) < near;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (!inside(x, y)) continue;
        cells++; if (d[x + y * n] < 0.5) { open++; continue; }
        if (seen[x + y * n]) continue;
        pieces++; const stack = [[x, y]]; seen[x + y * n] = 1;
        while (stack.length) {
          const [u, v] = stack.pop();
          for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const a = u + du, b = v + dv;
            if (a < 0 || b < 0 || a >= n || b >= n || seen[a + b * n] || !inside(a, b) || d[a + b * n] < 0.5) continue;
            seen[a + b * n] = 1; stack.push([a, b]);
          }
        }
      }
      /*
        Domes: peaks of the ferrofluid standing clear of what is round them.
        A cell, the 3×3 mean of the phase, that is the highest within three
        cells, past 0.6, and 0.35 above the lowest within five: a dome with a
        valley round it, whether or not a grey bridge still joins it to the
        next (which "pieces" counts as one). A flat pool has none; nor does a
        maze stripe's crest on its own, which falls away on two sides only
        but has its flat length along it and is not a peak.
      */
      const m3 = (x, y) => { let t = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) t += at(x + i, y + j); return t / 9; };
      let domes = 0;
      for (let y = 5; y < n - 5; y++) for (let x = 5; x < n - 5; x++) {
        if (!inside(x, y)) continue;
        const v = m3(x, y); if (v < 0.6) continue;
        let top = true, low = v;
        for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
          if (!i && !j) continue; const w = m3(x + i, y + j);
          if (Math.abs(i) <= 3 && Math.abs(j) <= 3 && (w > v || (w === v && (j < 0 || (j === 0 && i < 0))))) top = false;
          if (w < low) low = w;
        }
        if (top && v - low > 0.35) domes++;
      }
      /*
        And how far the ferrofluid's outline here is from a blob's: its
        edge's length over the circumference of a disc of the same area.
        One round pool is near 1; domes and fingers raise it.
      */
      let area = 0, edge = 0;
      for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
        if (!inside(x, y)) continue;
        const v = d[x + y * n] > 0.5; if (v) area++;
        if (v !== (d[x + 1 + y * n] > 0.5)) edge++;
        if (v !== (d[x + (y + 1) * n] > 0.5)) edge++;
      }
      return { pieces, domes, open: open / cells, outline: area ? edge / (2 * Math.sqrt(Math.PI * area)) : 0 };
    };
    /*
      And what the plate draws: bright points over the ferrofluid near each
      place, as the app would draw it. Told of the magnets the lab last
      stepped with (magnetsOnPlate, as the app tells it of the lead plate's),
      so a finger's magnet that never reached the step draws nothing either;
      and again told of none, the control for 3.
    */
    const L = lab.look('magnet-garden').settings;
    const S = 420;
    const lit = (px, mx, my, near, floor = 170) => {
      let c = 0;
      for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
        // The pixel's place on the plate (ferrolook.mjs's toPx, inverted).
        const fx = 0.5 + ((x + 0.5) / S - 0.5) / 1.5, fy = 0.5 - ((y + 0.5) / S - 0.5) / 1.5;
        if (Math.hypot(fx - mx, fy - my) > near || phaseAt(fx, fy) < 0.5) continue;
        const i = (x + y * S) * 4, lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
        if (lum < floor) continue;
        // A local maximum, so a point is counted once.
        let top = true;
        for (let dy = -1; dy <= 1 && top; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; const j = (x + dx + (y + dy) * S) * 4;
          if ((px[j] + px[j + 1] + px[j + 2]) / 3 > lum) { top = false; break; }
        }
        if (top) c++;
      }
      return c;
    };
    const drawn = await lab.render(S, L, {});
    const bare = await lab.render(S, L, { magnets: [] });
    /*
      What the spikes add to the picture: the same field drawn with the
      magnets and without, pixel by pixel. The ferrofluid's own glint and
      meniscus light every dome's edge either way (36 points over the parted
      field drawn with no magnet, when this was written), so points in the
      picture alone could not tell a peak from an edge; what the magnet adds
      can. Points where it adds a third of full white or more.
    */
    const added = new Float32Array(drawn.length);
    for (let i = 0; i < drawn.length; i += 4) for (let c = 0; c < 3; c++) added[i + c] = Math.max(0, drawn[i + c] - bare[i + c]);
    return {
      mass, mass0, peak,
      at: places.map((m) => ({ ...around(m.x, m.y, m.near), points: lit(drawn, m.x, m.y, m.near), added: lit(added, m.x, m.y, m.near, 85) })),
    };
  }, { over, pools, places, STEPS });

  const near = 0.12;
  // A pool the size Magnet Garden's pour gathers into, inside the spikes'
  // reach (about 0.15 from a hand's magnet): see "Not asserted" above.
  const pool = [{ ...AT, r: 0.14 }];
  const none = await run({ magnetStrength: 0 }, pool, [{ ...AT, near }]);
  const hand = await run({ ...HAND, magnetX: AT.x, magnetY: AT.y }, pool, [{ ...AT, near }]);
  const far = await run({ ...FAR, magnetX: AT.x, magnetY: AT.y }, pool, [{ ...AT, near }]);
  /*
    Two fingers, each over a pool of its own, far enough apart that the
    first's spikes (out to about 0.15) do not reach the second's pool. Under
    one pool between them the first magnet drew the whole pool to itself and
    neither parted it, which asked about the pull and not the second magnet.
  */
  const A = { x: 0.3, y: 0.56, near: 0.12 }, B = { x: 0.7, y: 0.44, near: 0.12 };
  const pools = [{ ...A, r: 0.12 }, { ...B, r: 0.12 }];
  const two = await run({ ...HAND, magnetX: A.x, magnetY: A.y, extraMagnets: [{ x: B.x, y: B.y }] }, pools, [A, B]);
  const one = await run({ ...HAND, magnetX: A.x, magnetY: A.y }, pools, [A, B]);
  const say = (r) => { const a = r.at[0]; return `${a.domes} domes, ${a.pieces} pieces, outline ${a.outline.toFixed(2)} of a disc's, ${a.added} points the magnet lights (${a.points} lit in all)`; };
  const each = (r) => r.at.map((a) => `${a.domes} domes, ${a.pieces} pieces, ${a.added} points lit by it`).join(' | ');
  console.log(`  within ${near} of the magnet —\n  no magnet: ${say(none)}\n  the hand's: ${say(hand)}\n  a look's own, further off: ${say(far)}`);
  console.log(`  two fingers, at each: ${each(two)}; the first alone: ${each(one)}\n`);

  const h = hand.at[0], z = none.at[0], f = far.at[0];
  check('held close under a pool, the magnet parts it into domes',
    h.domes >= 8 && h.domes >= 4 * Math.max(1, z.domes, f.domes) && h.pieces >= 8 && h.pieces >= 4 * Math.max(z.pieces, f.pieces),
    `${h.domes} domes in ${h.pieces} pieces within ${near} of it, against ${z.domes} in ${z.pieces} with none and ${f.domes} in ${f.pieces} under a look's own`);
  check('so its outline is no longer a blob\'s', h.outline >= 2 * Math.max(z.outline, f.outline),
    `the edge ${h.outline.toFixed(2)} times a disc's of the same area, against ${z.outline.toFixed(2)} with none and ${f.outline.toFixed(2)} under a look's own`);
  check('the plate lights a point on the domes', h.added >= 8 && h.added >= 0.5 * h.domes && z.added === 0,
    `${h.added} points the magnet adds over the ferrofluid near it, on ${h.domes} domes; ${z.added} with none`);
  check('a look\'s own magnet, further off, leaves the pool whole and unlit', f.domes <= 1 && f.pieces <= 2 && f.added === 0,
    `Magnet Garden's: ${f.domes} domes in ${f.pieces} pieces, ${f.added} points added`);
  const b2 = two.at[1], b1 = one.at[1];
  check('a second finger raises domes in its own pool, and lights them',
    b2.domes >= b1.domes + 6 && b2.domes >= 2 * b1.domes && b1.pieces >= 1 && b2.added >= 4 && b1.added <= 1,
    `at the second finger ${b2.domes} domes and ${b2.added} points lit, against ${b1.domes} domes in ${b1.pieces} pieces and ${b1.added} lit with the first alone`);
  const drift = (r) => Math.abs(r.mass / r.mass0 - 1);
  check('and none is made or lost, or packed past full', Math.max(drift(hand), drift(two)) < 0.005 && Math.max(hand.peak, two.peak) < 1.02,
    `mass ${hand.mass0.toFixed(0)} → ${hand.mass.toFixed(0)} with one magnet, ${two.mass0.toFixed(0)} → ${two.mass.toFixed(0)} with two; peak ${Math.max(hand.peak, two.peak).toFixed(3)}`);
} finally {
  await close();
}
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
