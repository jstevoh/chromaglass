#!/usr/bin/env node
/**
 * A colour drop is liquid: it pushes the dye already there aside into a
 * collar and fills the middle with its own colour (PLAN 18c-2), and it
 * splashes only when it falls far enough to (PLAN 18c-3).
 *
 *   npm run dropwindow      (any adapter that computes: scripts/lab.mjs)
 *
 * What was reported: the owner's reference (a Liquid Light Lab clip,
 * 2026-11-13) has a drop land in a pool of dark dye and open a bright round
 * window in one frame, the drop's own colour in the middle and a dark collar
 * of pushed dye round it, still open a second and a half later, nothing
 * thrown. Ours stamped the drop's dye on top of what was there (the middle
 * went from 2.23 to 2.64 absorbance, a darker smudge), pushed with a ring of
 * velocity the pressure solve deletes, and threw satellites at any height.
 * Now a drop is a pour of its volume through a small contact patch over a
 * few steps, its dye arriving with that volume (lib/dropImpact.ts,
 * sim/dropSplash.ts), and it throws satellites only past Cossali's K.
 *
 * A pool of cyan dye (it takes red: the red channel is the pool's alone) on a
 * thin gap at the rest gap, and a yellow drop (it takes blue: the blue
 * channel is the drop's alone) at its middle, through the lab's queue, which
 * is the app's (`stepDrops`). The window's radius is the drop's volume's,
 * R = √(V/πh), from `dropSchedule`.
 *
 *   1. the pool is laid: red absorbance at the middle over 1 (else the rest
 *      would be measuring an empty plate)
 *   2. the window opens: the pool's red inside half the window's radius
 *      falls to under WINDOW of what it was
 *   3. what left the window was pushed, not deleted: the dish's whole red is
 *      kept to KEEP, and the pool's mean r² (its red's) grows by R², within
 *      PUSH, past what the control's grows (which must be under CALM R²:
 *      the carry's spreading and the dye's ceiling are not a push). Between two glasses a volume πR²h poured at the middle moves
 *      every circle of the liquid round it from r to √(r² + R²), so every
 *      bit of the pool's r² grows by exactly R² (as `npm run flush`'s ring
 *      does). A collar's gain over a fixed ring does not measure it: on an
 *      even pool what leaves a ring at its inside comes in at its outside.
 *   4. it holds: HOLD_STEPS later the middle is still under HOLD
 *   5. the middle is the drop's colour: its blue is at least OWN of the
 *      drop's dye spread over its window (mass / πR², the colour the drop's
 *      own liquid carries), and the middle's blue is more than its red
 *   6. the control fails: the same dye stamped with no volume (the drop
 *      before) leaves the pool's red at the middle over CONTROL of what it
 *      was, so 2 to 5 are the volume's doing. Not 1: a stamp this heavy
 *      meets the dye's ceiling, which takes a little off every channel
 *      (0.86 measured), but it opens no window (the drop's is 0.05). And
 *      the other way round: a clear drop (volume, no dye) through the same
 *      queue opens the window to under WINDOW as well, so it is the volume.
 *
 * And in node, on the sim's own layDrop with a stand-in plate:
 *
 *   7. a drop of amount 5 (5.1 mm) from Drop Height 0.66 throws nothing (K
 *      under Cossali's threshold, 0.673 by hand) and lays no velocity at all
 *      (the ring kick is gone); from 0.69 twenty drops throw satellites
 *   8. the crown's fingers (Bhola and Chandra) for that drop, worked by hand
 *      (We 138.7 and Re 7130 at 10 cm: 15.6; We 277 and Re 10080 at 20 cm:
 *      24.1), are 15 to 17 and 23 to 25, the reference's about 20 between
 *   9. a queued drop is poured in its schedule's steps, each its share, and
 *      lays the stamp's whole dye, at the middle and against the plate's
 *      edge alike; and the music's trickle falls as one drop when it has a
 *      drop's worth (Tate), not every frame
 *
 * Measured (SwiftShader, 2026-11-14): see the commit that added it.
 */
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 192;
const AMOUNT = 30;            // a big drop, so its window is cells across on a 192² lab plate
const POOL = [1.8, 0.3, 0.1]; // cyan: absorbances, taking red
const DROP = [1, 1, 0.1];     // yellow: a bottle's rgb, taking blue
const SETTLE = 12, HOLD_STEPS = 90;
const WINDOW = 0.25, KEEP = 0.02, PUSH = [0.7, 1.3], CALM = 0.15, HOLD = 0.35, OWN = 0.4, CONTROL = 0.6;

// ── 7–9, in node, first: quick, and they need no adapter ──
{
  const out = 'node_modules/.cache/dropwindow-drop.mjs';
  await build({
    stdin: { contents: "export * from './src/sim/dropSplash.ts'; export * from './src/lib/dropImpact.ts';", resolveDir: '.', loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
  });
  const D = await import(`../${out}`);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const plate = (dropHeight) => {
    const p = {
      size: 192, dropHeight, dropFingering: 0.5, thinGap: true, drops: D.makeDropQueue(),
      laid: [], vel: 0, squish: 0, pours: [],
      gpu: { pour: (x, y, r, share) => p.pours.push({ x, y, r, share }) },
      rng: { float: rand, angle: () => rand() * Math.PI * 2 },
      addDensity(x, y, a) { p.laid.push([x, y, a]); },
      addVelocity() { p.vel++; },
      applySquish() { p.squish++; },
    };
    return p;
  };
  const thrown = (p, x, y, reach) => p.laid.filter(([i, j]) => Math.hypot(i - x, j - y) > reach).length;
  const LOW = 0.66, HIGH = 0.69;
  const low = plate(LOW), high = plate(HIGH);
  let lowThrown = 0, highThrown = 0;
  for (let k = 0; k < 20; k++) {
    D.layDrop(low, 96, 96, 5, 1, 1, 0.1, 1, true);
    D.layDrop(high, 96, 96, 5, 1, 1, 0.1, 1, true);
  }
  // The drop's own disc (and its contact patch) is inside 1.4 of its widest radius; a satellite lands past it.
  const reach = 1.4 * Math.round(3 * 1.5 * (1 + 0.6 * 1.5));
  lowThrown = thrown(low, 96, 96, reach); highThrown = thrown(high, 96, 96, reach);
  const iL = D.dropImpact(5, LOW), iH = D.dropImpact(5, HIGH);
  check(`7. a drop from Drop Height ${LOW} throws nothing and lays no velocity; from ${HIGH} it splashes`,
    !iL.splashes && lowThrown === 0 && low.vel === 0 && iH.splashes && highThrown > 0,
    `${LOW}: K ${iL.K.toFixed(0)} against ${iL.Kc.toFixed(0)}, ${lowThrown} cells thrown, ${low.vel} velocity writes; ${HIGH}: K ${iH.K.toFixed(0)}, ${highThrown} cells thrown`);
  const f10 = D.dropImpact(5, 0.1 / D.DROP_HEIGHT_METRES).fingers, f20 = D.dropImpact(5, 0.2 / D.DROP_HEIGHT_METRES).fingers;
  check('8. the crown has 15 to 17 fingers at 10 cm and 23 to 25 at 20 cm (Bhola and Chandra, by hand 15.6 and 24.1)',
    f10 >= 15 && f10 <= 17 && f20 >= 23 && f20 <= 25, `${f10} and ${f20}`);
  // The dye the stamp laid: (1 − d/R)² over 3 · GRID_SCALE cells, amount at its middle.
  const R0 = Math.round(3 * 1.5);
  let m0 = 0; for (let j = -R0; j <= R0; j++) for (let i = -R0; i <= R0; i++) { const dd = Math.hypot(i, j); if (dd <= R0) m0 += (1 - dd / R0) ** 2; }
  const sch = D.dropSchedule(AMOUNT, 192);
  const pourAt = (x) => {
    const q = plate(0);
    D.layDrop(q, x, 96, AMOUNT, 1, 1, 0.1, 1, true);
    let guard = 0;
    while (D.dropsLive(q.drops) && guard++ < 50) D.stepPlateDrops(q);
    return { n: q.pours.length, shares: q.pours.every((p) => Math.abs(p.share - sch.share) < 1e-6 && Math.abs(p.r - sch.radius) < 1e-6), dye: q.laid.reduce((s, l) => s + l[2], 0) };
  };
  const mid = pourAt(96), edge = pourAt(2), want = m0 * AMOUNT;
  const t = plate(0);
  let firstFall = -1;
  for (let k = 0; k < 200 && firstFall < 0; k++) { D.layDrop(t, 96, 96, 0.05, 1, 1, 0.1, 1, true); if (D.dropsLive(t.drops)) firstFall = k; }
  check('9. a drop pours in its schedule and lays all its dye, middle and edge, and the trickle falls as one drop when it has a drop\'s worth',
    mid.n === sch.steps && mid.shares && edge.n === sch.steps && Math.abs(mid.dye / want - 1) < 1e-3 && Math.abs(edge.dye / want - 1) < 1e-3
      && firstFall > 0 && Math.abs((firstFall + 1) * 0.05 - D.DROP_TATE) < 0.051,
    `${mid.n} pours of ${sch.share.toFixed(3)} (schedule ${sch.steps}); dye laid ${(mid.dye / want).toFixed(4)} of the stamp's at the middle, ${(edge.dye / want).toFixed(4)} at the edge; the trickle fell at its ${firstFall + 1}th frame (${((firstFall + 1) * 0.05).toFixed(2)} against ${D.DROP_TATE})`);
}

// ── 1–6, on the solver ──
const { page, close } = await openLab();
try {
  const r = await page.evaluate(async ({ N, AMOUNT, POOL, DROP, SETTLE, HOLD_STEPS }) => {
    const STILL = { thinGap: 1, gapThickness: 0.45, gapSpring: 0, coverGrams: 190 };
    const read = async (R) => {
      const d = await lab.field('dye'); const ch = d.length / (N * N);
      let mid = 0, mn = 0, midB = 0, r2 = 0, tot = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const o = (i + j * N) * ch, red = d[o], rr = Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5);
        tot += red; r2 += red * rr * rr;
        if (rr < 0.5 * R) { mid += red; midB += d[o + 2]; mn++; }
      }
      return { mid: mid / mn, midB: midB / mn, r2: r2 / tot, tot };
    };
    const pool = async () => {
      await lab.create(N, N); await lab.step(1, STILL);
      lab.dye(0.5, 0.5, 0.3, POOL, 1); lab.flush(); await lab.step(4, STILL);
    };
    // The dye the sim lays with a drop: its old stamp's mass, (1 − d/R)² over 3·GRID_SCALE cells (sim/dropSplash.ts).
    const R0 = Math.round(3 * 1.5);
    let m = 0; for (let j = -R0; j <= R0; j++) for (let i = -R0; i <= R0; i++) { const dd = Math.hypot(i, j); if (dd <= R0) m += (1 - dd / R0) ** 2; }
    const mass = m * AMOUNT;
    await pool();
    const s = lab.drop(0.5, 0.5, AMOUNT, DROP, mass);
    const R = s.window;
    const before = await read(R);
    await lab.step(s.steps + SETTLE, STILL);
    const after = await read(R);
    await lab.step(HOLD_STEPS, STILL);
    const held = await read(R);
    // The drop's own colour: its dye over its window, in the blue it takes (lab.dyeOf: the bottle's absorbance).
    const ab = lab.dyeOf(DROP);
    const own = mass * ab[2] / (Math.PI * (R * N) ** 2);
    // The control: the same dye stamped as the drop before (no volume).
    await pool();
    const cBefore = await read(R);
    const ctl = new Array(N * N * 4).fill(0);
    const Rc = Math.round(3 * 1.5);
    for (let j = -Rc; j <= Rc; j++) for (let i = -Rc; i <= Rc; i++) {
      const dd = Math.hypot(i, j); if (dd > Rc) continue;
      const a = AMOUNT * (1 - dd / Rc) ** 2, o = ((N / 2 + i) + (N / 2 + j) * N) * 4;
      ctl[o] += a * ab[0]; ctl[o + 1] += a * ab[1]; ctl[o + 2] += a * ab[2]; ctl[o + 3] += a;
    }
    lab.addDye(ctl); lab.flush();
    await lab.step(s.steps + SETTLE, STILL);
    const cAfter = await read(R);
    // A clear drop: the same volume through the same queue, no dye.
    await pool();
    const kBefore = await read(R);
    lab.drop(0.5, 0.5, AMOUNT, DROP, 0);
    await lab.step(s.steps + SETTLE, STILL);
    const kAfter = await read(R);
    return { s, R, before, after, held, own, cBefore, cAfter, kBefore, kAfter };
  }, { N, AMOUNT, POOL, DROP, SETTLE, HOLD_STEPS });
  const { s, R, before, after, held, own, cBefore, cAfter, kBefore, kAfter } = r;
  const f = (v, d = 3) => v.toFixed(d);
  console.log(`   the drop: ${s.steps} steps of ${f(s.share)} through ${f(s.radius * N, 1)} cells; its window ${f(R * N, 1)} cells`);
  check('1. the pool is laid', before.mid > 1, `red ${f(before.mid)} at the middle`);
  check(`2. the window opens: the pool's red in its middle under ${WINDOW} of what it was`, after.mid < WINDOW * before.mid,
    `${f(before.mid)} → ${f(after.mid)} (${f(after.mid / before.mid)})`);
  const calm = (cAfter.r2 - cBefore.r2) / (R * R);
  const grew = (after.r2 - before.r2) / (R * R) - calm;
  check(`3. pushed, not deleted: the dish's red kept to ${KEEP * 100}%, the pool's mean r² grows by R² (${PUSH[0]} to ${PUSH[1]}) past the control's (under ${CALM})`,
    Math.abs(after.tot / before.tot - 1) < KEEP && grew >= PUSH[0] && grew <= PUSH[1] && Math.abs(calm) < CALM,
    `dish ${f(after.tot / before.tot, 4)}; mean r² grew by ${f(grew)} R² past the control's ${f(calm)}`);
  check(`4. it holds: ${HOLD_STEPS} steps later the middle is under ${HOLD}`, held.mid < HOLD * before.mid, `${f(held.mid)} (${f(held.mid / before.mid)})`);
  check(`5. the middle is the drop's colour: its blue at least ${OWN} of the drop's own, and more than the pool's red there`,
    after.midB >= OWN * own && after.midB > after.mid, `blue ${f(after.midB)} against the drop's ${f(own)} (${f(after.midB / own)}); red ${f(after.mid)}`);
  check(`6. the volume does it: the same dye stamped with no volume leaves the pool's red over ${CONTROL}, a clear drop opens it under ${WINDOW}`,
    cAfter.mid > CONTROL * cBefore.mid && kAfter.mid < WINDOW * kBefore.mid,
    `stamp ${f(cBefore.mid)} → ${f(cAfter.mid)} (${f(cAfter.mid / cBefore.mid)}); clear drop ${f(kBefore.mid)} → ${f(kAfter.mid)} (${f(kAfter.mid / kBefore.mid)})`);
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} ok`);
process.exit(failed ? 1 : 0);
