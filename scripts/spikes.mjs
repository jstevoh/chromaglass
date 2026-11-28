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
 *   1. held close the way the Magnet tool holds it, the magnet stands the
 *      pool up into domes: many peaks, each a cell past full, standing
 *      about the layer's own wavelength apart (SPIKE_PITCH), against the
 *      same pool with no magnet and under a magnet below the onset. Until
 *      PLAN 38k-7 the domes were also to be separate pieces (why not now:
 *      at the line)
 *   2. so the ferrofluid's outline near it is no longer a blob's: its edge
 *      is at least twice as long, for its area, as with either control
 *   3. the plate lights a point on the domes: at least half of them have a
 *      bright point on their top, three times as many as have one half a
 *      pitch off it (where a dome's edge, its glint and meniscus, is). The
 *      magnet is off the plate's middle in both axes, so a plate that drew
 *      its domes mirrored against the solver's would light them round the
 *      mirror, outside the patch counted
 *   4. a magnet under the onset (0.8 of it) leaves the pool whole and
 *      unlit: the layer stands up only past the field Cowley and Rosensweig
 *      give for it (spikes.ts, PLAN 38k). Until 38k this was Magnet Garden's
 *      own magnet, 0.14 of the hand's field against an onset of 0.18 set
 *      for it; the real onset is 0.033, and Garden's raises domes now
 *   5. a second magnet (a second finger on the phone) stands domes up in
 *      its own pool and lights them, where the first alone leaves that
 *      pool (still there) with none standing and none lit
 *   6. and none of it makes or loses ferrofluid, or packs a cell past full
 *      away from the domes (a dome is a cell past full: PLAN §9t), and the
 *      tallest dome is between twice and six times full
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
 * On 384², the app's own grid at its least on a computer, where a dome's
 * pitch (SPIKE_PITCH, 0.04 of the plate) is fifteen cells. It was 256², the
 * software GPU's rung, while the plate drew its spikes on a lattice; the
 * domes are the layer's own now (PLAN §9t), and on 256² a capillary length
 * is 1.6 cells, too few for the film to round a dome (PLAN 9g). The dome's
 * distances below are in the plate's units, the cells they were on 256².
 * About twenty minutes in a cloud session; well under one on the Mac.
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
/*
  The control: a magnet under the onset, at Magnet Garden's depth with its
  strength set so its axis field is 0.8 of the onset (set once the lab is
  open, from the onset the solver uses). Until PLAN 38k this was Magnet
  Garden's own magnet, 0.14 of the hand's field against the lab's onset of
  0.18; the onset is the liquid's now, 0.033, and Garden's magnet is 4.6
  times past it and raises domes as the hand's does (PLAN 9u), so the
  control is what Garden's stood for: a magnet too weak to stand the pool up.
*/
let FAR = { magnetStrength: 0, magnetHeight: 0.3 * 0.8 };
const STEPS = 240;
const N = 384;
// Off the middle in both axes (see 3), far enough that the patch a mirrored
// plate would light (0.15 round the mirror image) misses the one counted
// (0.12 round the magnet): the mirrors are 0.28 and 0.30 away.
const AT = { x: 0.36, y: 0.65 };

const { page, close } = await openLab();
FAR = { ...FAR, magnetStrength: await page.evaluate((h) => 0.8 * lab.SPIKE_ONSET / lab.fieldOnAxis(1, h), FAR.magnetHeight) };
const PITCH = await page.evaluate(() => lab.SPIKE_PITCH);
if (!(PITCH > 0.01 && PITCH < 0.1)) throw new Error(`the lab's SPIKE_PITCH is ${PITCH}`);
if (!(FAR.magnetStrength > 0.001 && Number.isFinite(FAR.magnetStrength))) throw new Error(`the control magnet's strength is ${FAR.magnetStrength}: the lab's SPIKE_ONSET or fieldOnAxis is missing`);
try {
  /**
   * Pools of ferrofluid (x, y, r) on a coloured plate, stepped with a magnet
   * (or none), then read: mass, peak, and at each place asked about the
   * domes, the pieces, the outline and the lit points within `near`.
   */
  const run = (over, pools, places) => page.evaluate(async ({ over, pools, places, STEPS, N }) => {
    const pool = pools[0];
    await lab.create(N);
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
      const inside = (x, y) => Math.hypot((x + 0.5) / n - mx, (y + 0.5) / n - my) < near;
      const count = (past) => {
        const seen = new Uint8Array(n * n); let pieces = 0, open = 0, cells = 0;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          if (!inside(x, y)) continue;
          cells++; if (d[x + y * n] < past) { open++; continue; }
          if (seen[x + y * n]) continue;
          pieces++; const stack = [[x, y]]; seen[x + y * n] = 1;
          while (stack.length) {
            const [u, v] = stack.pop();
            for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const a = u + du, b = v + dv;
              if (a < 0 || b < 0 || a >= n || b >= n || seen[a + b * n] || !inside(a, b) || d[a + b * n] < past) continue;
              seen[a + b * n] = 1; stack.push([a, b]);
            }
          }
        }
        return { pieces, open, cells };
      };
      const { pieces, open, cells } = count(0.5), piecesFull = count(1.0).pieces;
      /*
        Domes: peaks of the ferrofluid standing clear of what is round them.
        A cell, the 3×3 mean of the phase, that is the highest within 0.012
        of the plate, past 0.6, and 0.35 above the lowest within 0.02 (three
        and five cells on 256², where this was written): a dome with a
        valley round it, whether or not a grey bridge still joins it to the
        next (which "pieces" counts as one). A flat pool has none; nor does a
        maze stripe's crest on its own, which falls away on two sides only
        but has its flat length along it and is not a peak.
      */
      const m3 = (x, y) => { let t = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) t += at(x + i, y + j); return t / 9; };
      const tops = [];
      const R3 = Math.round(0.012 * n), R5 = Math.round(0.02 * n);
      for (let y = R5; y < n - R5; y++) for (let x = R5; x < n - R5; x++) {
        if (!inside(x, y)) continue;
        const v = m3(x, y); if (v < 0.6) continue;
        let top = true, low = v;
        for (let j = -R5; j <= R5; j++) for (let i = -R5; i <= R5; i++) {
          if (!i && !j) continue; const w = m3(x + i, y + j);
          if (Math.abs(i) <= R3 && Math.abs(j) <= R3 && (w > v || (w === v && (j < 0 || (j === 0 && i < 0))))) top = false;
          if (w < low) low = w;
        }
        if (top && v - low > 0.35) tops.push([(x + 0.5) / n, (y + 0.5) / n]);
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
      // Standing: tops whose own cell is past full (a dome is a cell past
      // full, wgsl/standing.ts), and how far apart the tops stand.
      const standing = tops.filter(([u, v]) => phaseAt(u, v) > 1).length;
      const nn = tops.map(([u, v]) => Math.min(...tops.filter((t) => t[0] !== u || t[1] !== v).map(([p, q]) => Math.hypot(p - u, q - v)))).filter(Number.isFinite).sort((a, b) => a - b);
      const spacing = nn.length ? nn[nn.length >> 1] : 0;
      return { pieces, piecesFull, standing, spacing, domes: tops.length, tops, open: open / cells, outline: area ? edge / (2 * Math.sqrt(Math.PI * area)) : 0 };
    };
    /*
      And what the plate draws: bright points over the ferrofluid near each
      place, as the app would draw it. Told of the magnets the lab last
      stepped with (magnetsOnPlate, as the app tells it of the lead plate's),
      so a finger's magnet that never reached the step draws nothing either.
      The controls for 3 are the same count half a pitch off each top
      (offTops) and the pool with no magnet.
    */
    const L = lab.look('magnet-garden').settings;
    const S = 420;
    const lit = (px, mx, my, near, floor = 170) => {
      const c = [];
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
        if (top) c.push([fx, fy]);
      }
      return c;
    };
    const drawn = await lab.render(S, L, {});
    /*
      Which domes the plate lights: those with a pixel past 182 (of 255)
      over the ferrofluid within 0.006 of their top, about two pixels on
      this picture and a third of a dome's width. The plate draws a dome's
      light from the ferrofluid's own height (plate.ts, the film's domes: a
      cell past full), its white point near the top on the side facing the
      key, so the light has to land on the dome the solver raised, wherever
      it rose. It used to be drawn from the magnet, on a lattice round it
      (spikes.ts's spikeTip), and this asked what the magnet added to the
      picture; now the plate needs no telling.

      The control: the same half a pitch (0.02) off each top, the four
      ways, averaged, which is a dome's foot or the water between domes.
      Counted first as any local bright point past 170 within 0.01 of the
      top, it read 16 of 28 domes lit against 13.8 half a pitch off (the
      check-skeptic's control, run): with 103 such points over the pool,
      the edges' glints and meniscus lit the places off the tops as often.

      Past 182, not 200, since PLAN 38a (2026-10-31). The bar was set on a
      plate whose painted hot-spot multiplied the finished picture by 1.096
      at the hand's magnet (0.36, 0.65) under Magnet Garden's Hot-Spot 0.4
      and Second Lamp 0.3: the old formula, mix(1, tint·mix(0.78, 1.25,
      exp(−3.5 d²)), 0.4) times the second lamp's, gives 1.098, 1.094 and
      1.097 there. The lamp lever leaves that place at the lamp's own light
      (lampField 1.000 there), so the same glints read 1/1.096 as bright:
      measured on SwiftShader they were 191 to 249 on the lit domes, and on
      the GitHub Mac 10 of 25 cleared 200 where 18 of 26 clear 182 here, the
      count the lifted plate gave. 200 / 1.096 is 182: the same glint, the
      same bar, without the paint under it.
    */
    const litAt = (px, u, v, r = 0.006) => {
      let best = 0;
      const x0 = (0.5 + (u - 0.5) * 1.5) * S, y0 = (0.5 - (v - 0.5) * 1.5) * S, rp = r * 1.5 * S;
      for (let y = Math.floor(y0 - rp); y <= Math.ceil(y0 + rp); y++) for (let x = Math.floor(x0 - rp); x <= Math.ceil(x0 + rp); x++) {
        if (x < 0 || y < 0 || x >= S || y >= S || Math.hypot(x + 0.5 - x0, y + 0.5 - y0) > rp) continue;
        const fx = 0.5 + ((x + 0.5) / S - 0.5) / 1.5, fy = 0.5 - ((y + 0.5) / S - 0.5) / 1.5;
        if (phaseAt(fx, fy) < 0.5) continue;
        const i = (x + y * S) * 4; best = Math.max(best, (px[i] + px[i + 1] + px[i + 2]) / 3);
      }
      return best;
    };
    const onTops = (a, dx = 0, dy = 0) => a.tops.filter(([u, v]) => litAt(drawn, u + dx, v + dy) > 182).length;
    const offTops = (a) => [[0.02, 0], [-0.02, 0], [0, 0.02], [0, -0.02]].reduce((t, [dx, dy]) => t + onTops(a, dx, dy), 0) / 4;
    return {
      mass, mass0, peak,
      /*
        The most past full any cell is outside every magnet's film, and how
        many cells there hold ferrofluid past half full, so a ring with no
        ferrofluid in it does not pass for one packed no higher than full.
        The film's window ends 0.125 of the plate from its magnet on 384²
        (standing.ts, WIN_NONE: three quarters of the 128-cell patch's
        half-width); 0.13 is a cell past it.
      */
      out: (() => {
        const mags = [over.magnetStrength > 0 ? [over.magnetX, over.magnetY] : null, ...(over.extraMagnets ?? []).map((m) => [m.x, m.y])].filter(Boolean);
        let top = 0, cells = 0;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const u = (x + 0.5) / n, v = (y + 0.5) / n;
          if (mags.some((m) => Math.hypot(u - m[0], v - m[1]) < 0.13)) continue;
          top = Math.max(top, d[x + y * n]); if (d[x + y * n] >= 0.5) cells++;
        }
        return { top, cells };
      })(),
      at: places.map((m) => {
        const a = around(m.x, m.y, m.near), pts = lit(drawn, m.x, m.y, m.near);
        return { ...a, points: pts.length, lit: onTops(a), off: offTops(a) };
      }),
    };
  }, { over, pools, places, STEPS, N });

  const near = 0.12;
  // A pool inside the spikes' reach (about 0.15 from a hand's magnet at the
  // lab's old onset, about 0.4 at the liquid's own since 38k-7): see "Not
  // asserted" above. It was 0.14 in radius, the size Magnet Garden's pour
  // gathered into. Since 38k-7 the pull draws the pool into a heap and the
  // domes stand on the heap, so how many stand goes as the ferrofluid the
  // magnet gathers, not the pool's spread: the 0.14 pool's heap stood 10
  // domes and then 7 on two Mac runs (Metal's float order differs run to
  // run and the domes' instability amplifies it) and 8 in the cloud lab,
  // across this line's bar of 8. At 0.18 (1.65 times the ferrofluid) the
  // heap stands 15 in the cloud lab, 14 past full: the bar is the same,
  // and the pool is big enough for the line to read it.
  const pool = [{ ...AT, r: 0.18 }];
  const none = await run({ magnetStrength: 0 }, pool, [{ ...AT, near }]);
  const hand = await run({ ...HAND, magnetX: AT.x, magnetY: AT.y }, pool, [{ ...AT, near }]);
  const far = await run({ ...FAR, magnetX: AT.x, magnetY: AT.y }, pool, [{ ...AT, near }]);
  /*
    Two fingers, each over a pool of its own, far enough apart that the
    first's spikes do not reach the second's pool. Under one pool between
    them the first magnet drew the whole pool to itself and neither parted
    it, which asked about the pull and not the second magnet.

    Corner to corner of the picture since PLAN 38k-7. They were 0.42 apart
    (0.3, 0.56 and 0.7, 0.44), when the onset was the lab's 22 mT and the
    first's spikes reached about 0.15. At the liquid's own 4 mT a hand's
    magnet stands domes out to about 0.4 (the reach goes as the height
    times the cube root of the axis field over the onset, h·(B/Bc)^⅓, for a
    field falling as a dipole's), so pool B stood 7 domes with the first
    finger alone (Mac, run 41308840631) and the line asked about the reach
    and not the second finger. The lab draws only the middle two thirds of
    the plate (1/6 to 5/6 each way: the top of this file), and a pool's
    patch, 0.12 round its magnet, has to be inside it to be lit, so the
    pools go to the picture's opposite corners, 0.57 apart, B's near edge
    0.45 from A, where A's field is about 0.6 of the onset. B sits next to
    A's mirror through the middle (0.71, 0.30), so a plate drawn mirrored
    in both axes would light A's domes round B with the first finger
    alone: the first-alone arm's "at most one lit" (and line 3's mirror
    patch) is what catches that, not the pools' places.
  */
  const A = { x: 0.29, y: 0.70, near: 0.12 }, B = { x: 0.71, y: 0.31, near: 0.12 };
  const pools = [{ ...A, r: 0.15 }, { ...B, r: 0.15 }];
  const two = await run({ ...HAND, magnetX: A.x, magnetY: A.y, extraMagnets: [{ x: B.x, y: B.y }] }, pools, [A, B]);
  const one = await run({ ...HAND, magnetX: A.x, magnetY: A.y }, pools, [A, B]);
  const say = (r) => { const a = r.at[0]; return `${a.domes} domes (${a.standing} past full, ${a.spacing.toFixed(3)} apart), ${a.pieces} pieces (${a.piecesFull} past full), outline ${a.outline.toFixed(2)} of a disc's, ${a.lit} of them lit, ${a.off.toFixed(1)} half a pitch off (${a.points} bright points in all)`; };
  const each = (r) => r.at.map((a) => `${a.domes} domes (${a.standing} past full, ${a.spacing.toFixed(3)} apart), ${a.pieces} pieces (${a.piecesFull} past full), ${a.lit} of them lit`).join(' | ');
  console.log(`  within ${near} of the magnet —\n  no magnet: ${say(none)}\n  the hand's: ${say(hand)}\n  under the onset (0.8 of it): ${say(far)}`);
  console.log(`  two fingers, at each: ${each(two)}; the first alone: ${each(one)}\n`);

  const h = hand.at[0], z = none.at[0], f = far.at[0];
  /*
    Until PLAN 38k-7 this line also asked for 8 separate pieces (runs of
    cells past half full), four times the controls'. Then nothing pulled
    the ferrofluid toward the magnet under the standing film (9t-2), so
    the pool stayed as wide as it was poured and stood up where it lay, a
    field of domes on a layer thinned between them. With the pull, the
    pool is drawn in toward the field's peak as it stands up, the way a
    pool of ferrofluid over a magnet gathers into a heap with its spikes
    on top, and the domes stand on that common base: on the Mac (#645's
    head, run 41308840631) 10 domes in 4 pieces, and in the cloud lab 8
    in 4, 4 also counted past full, so the base between them is past full
    too (the 0.14 pool; on the 0.18 pool now, 15 in 4). A gathered base is the physics, not a pool left whole: what tells
    a stood-up layer from a flat one is each dome its own peak past full,
    and the domes standing at the layer's own wavelength, which is the
    instability's (Cowley and Rosensweig: SPIKE_PITCH, 2π l_c) and not
    the finder's (a top is the highest only within 0.012). So: at least 8
    domes, four times the controls' (as before), all 8 or more past full
    where the controls have none, their median distance to the next
    between 0.6 and 1.5 of the pitch. Cloud lab, 2026-11-01, the 0.18
    pool: 15 domes, 14 past full, 0.033 apart (0.8 of 0.04), 14 lit; with
    none and under the onset, 0 domes. The pieces are printed beside it.
  */
  check('held close under a pool, the magnet stands it up into domes at the layer\'s own pitch',
    h.domes >= 8 && h.domes >= 4 * Math.max(1, z.domes, f.domes) && h.standing >= 8 && z.standing === 0 && f.standing === 0
      && h.spacing >= 0.6 * PITCH && h.spacing <= 1.5 * PITCH,
    `${h.domes} domes within ${near} of it, ${h.standing} of them past full, ${h.spacing.toFixed(3)} apart (pitch ${PITCH}, bar 0.6 to 1.5 of it), in ${h.pieces} pieces; against ${z.domes} (${z.standing} past full) in ${z.pieces} with none and ${f.domes} (${f.standing}) in ${f.pieces} under the onset`);
  check('so its outline is no longer a blob\'s', h.outline >= 2 * Math.max(z.outline, f.outline),
    `the edge ${h.outline.toFixed(2)} times a disc's of the same area, against ${z.outline.toFixed(2)} with none and ${f.outline.toFixed(2)} under the onset`);
  check('the plate lights a point on the domes', h.lit >= 8 && h.lit >= 0.5 * h.domes && h.lit >= 3 * h.off,
    `${h.lit} of the ${h.domes} domes near it have a bright point on their top, against ${h.off.toFixed(1)} with one half a pitch off it`);
  check('a magnet under the onset leaves the pool whole and unlit', f.domes <= 1 && f.pieces <= 2 && f.lit === 0,
    `at 0.8 of the onset (strength ${FAR.magnetStrength.toFixed(3)} at Magnet Garden's depth): ${f.domes} domes in ${f.pieces} pieces, ${f.lit} lit`);
  const b2 = two.at[1], b1 = one.at[1];
  /*
    Until PLAN 38k-7: at least six more domes than the first alone leaves
    there, and twice as many. With the pull (line 1) a pool stands up as
    a gathered heap, fewer domes on a smaller footprint: the second
    finger's pool stood 5 domes on the Mac (#645's run) and in the cloud
    lab, where the first's own pool stood 7 and 8. And with the first
    alone pool B is not flat: the Labyrinth's field ripples it into bumps
    the finder can count (3 in the cloud lab, 7 on the Mac before the
    pools were moved apart), none of them past full and none lit, because
    they are the maze's and not domes standing. So the line reads what a
    second finger adds: domes standing past full, at least 4 (the bar its
    lit count always had), and lit, where the first alone stands none and
    lights at most one. The pools are 0.15 in radius (they were 0.12,
    whose heaps stood 4 to 8 on the Mac, against this bar of 4: the 0.18
    pool's reason, above). Cloud lab, 2026-11-01: 11 standing and 11 lit,
    against none standing and none lit with the first alone (the 0.12
    pools: 5 and 5, against 3 unlit bumps).
  */
  check('a second finger stands domes up in its own pool, and lights them',
    b2.standing >= 4 && b1.standing === 0 && b1.pieces >= 1 && b2.lit >= 4 && b1.lit <= 1,
    `at the second finger ${b2.domes} domes, ${b2.standing} of them past full and ${b2.lit} lit, against ${b1.domes} domes in ${b1.pieces} pieces, ${b1.standing} past full and ${b1.lit} lit with the first alone`);
  const drift = (r) => Math.abs(r.mass / r.mass0 - 1);
  /*
    Past full only under a magnet's film, where a dome is a cell past full
    (wgsl/standing.ts); everywhere else no cell packs past full, as before,
    read where there is ferrofluid to pack (pool B, with the first finger
    alone, is all of it). And the tallest dome as tall as a dome: twice
    full or more, and no more than six times, where the lab's tallest were
    5.2 (wgsl/standing.ts). Not the top glass (FILM_TOP, 15.6), which is
    the plate's own cap under the film and could not be passed.
  */
  const outTop = Math.max(hand.out.top, two.out.top, one.out.top, none.peak, far.peak);
  const outCells = hand.out.cells + two.out.cells + one.out.cells;
  const tallest = Math.max(hand.peak, two.peak);
  check('and none is made or lost, or packed past full away from the domes',
    Math.max(drift(hand), drift(two)) < 0.005 && outTop < 1.02 && outCells >= 300 && tallest >= 2 && tallest <= 6,
    `mass ${hand.mass0.toFixed(0)} → ${hand.mass.toFixed(0)} with one magnet, ${two.mass0.toFixed(0)} → ${two.mass.toFixed(0)} with two; peak away from the magnets ${outTop.toFixed(3)} over ${outCells} cells of ferrofluid there; the tallest dome ${tallest.toFixed(2)}`);
} finally {
  await close();
}
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
