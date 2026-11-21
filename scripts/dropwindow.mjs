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
 *      edge alike; the music's trickle falls as one drop when it has a
 *      drop's worth (Tate), not every frame; and forty drops on a plate that
 *      takes no steps (Freeze the liquid) lay nothing on it until it does:
 *      a full queue lets a drop go rather than stamping it (`npm run moving`
 *      found the stamps ending its freeze early); and while the pour's kernel
 *      is still building behind the show, a drop is the stamp it was, its
 *      whole dye and no pour (asking sooner compiled it in the opening:
 *      `npm run startup` read it as the show's own wait)
 *  10. a bottle's drop (`dropBottle`, syrup and ink) is queued with its
 *      liquid in every pour (its species for syrup, none for ink), lays the
 *      stamp's whole dye with its volume, and tells the bottle's deposit the
 *      volume came already (push false); with the pour not built it is the
 *      stamp and the deposit pours (push true); and the hand's three drop
 *      paths in LiquidVisualizer call it, none stamping with volume false
 *      (the Mac's grid showed those opening no window, PLAN 18c-10)
 *  11. a stream held on the plate (`layStream`) pours one share a step, the
 *      held share pourShare gives, and lays its colour with that volume at
 *      the strength of a column of the same bottle's drop (dropColumnDye, to
 *      1e-6 a cell), its deposit pushing nothing; with no pour, the stamp
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
    stdin: { contents: "export * from './src/sim/dropSplash.ts'; export * from './src/lib/dropImpact.ts'; export { speciesOf } from './src/lib/liquidProps.ts'; export { LiquidPhase } from './src/lib/liquidPhase.ts'; export { DISH_METRES } from './src/lib/turntable.ts';", resolveDir: '.', loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
  });
  const D = await import(`../${out}`);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const plate = (dropHeight, dtSeconds = 1 / 60) => {
    const p = {
      size: 192, dtSeconds, dropHeight, dropFingering: 0.5, thinGap: true, drops: D.makeDropQueue(),
      laid: [], vel: 0, squish: 0, pours: [], ready: true,
      gpu: { pour: (x, y, r, share, sp, volume, what) => p.pours.push({ x, y, r, share, sp, what, volume }), pourReady: () => p.ready },
      deposits: [], liquid: { deposit: (x, y, r, what, amount, seconds, volume = true) => p.deposits.push({ what, volume }) },
      addTemp() {},
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
  const pourAt = (x, amount = AMOUNT, dt = 1 / 60, s = sch) => {
    const q = plate(0, dt);
    D.layDrop(q, x, 96, amount, 1, 1, 0.1, 1, true);
    let guard = 0;
    while (D.dropsLive(q.drops) && guard++ < 50) D.stepPlateDrops(q);
    return { n: q.pours.length, shares: q.pours.every((p) => Math.abs(p.share - s.share) < 1e-6 && Math.abs(p.r - s.radius) < 1e-6 && p.volume === true), dye: q.laid.reduce((s, l) => s + l[2], 0) };
  };
  /*
    The schedule against numbers worked out by hand, not against itself: a
    drop of amount 5 (0.07 mL, D 5.1 mm) has τ = √(1000 · D³ / 0.072) ≈ 43 ms;
    a drop of amount 8 stepped at 1/120 s takes ⌈τ/dt⌉ = 7 steps, where the
    whole column's floor alone (the old numerical schedule's kind) gives 4; and
    a plate stepped at 1/120 s must pour it in those 7 (layDrop passes the
    plate's own step, not 1/60).
  */
  const tau5 = D.dropEntrySeconds(5), sch8 = D.dropSchedule(8, 192, 1 / 120);
  const fast = pourAt(96, 8, 1 / 120, sch8);
  const capillary = tau5 >= 0.040 && tau5 <= 0.046 && sch8.steps === 7 && Math.abs(sch8.radius - D.dropDiameter(8) / 2 / D.DISH_METRES) < 1e-9 && fast.n === 7 && fast.shares;
  const mid = pourAt(96), edge = pourAt(2), want = m0 * AMOUNT;
  // A frozen plate (no steps) dropped on forty times: nothing reaches it until it steps (moving's freeze).
  const frozen = plate(0);
  for (let k = 0; k < 40; k++) D.layDrop(frozen, 96, 96, 5, 1, 1, 0.1, 1, true);
  // A plate whose pour kernel is still building behind the show: the drop is the stamp, whole, and nothing is queued to pour.
  const cold = plate(0);
  cold.ready = false;
  D.layDrop(cold, 96, 96, AMOUNT, 1, 1, 0.1, 1, true);
  const coldDye = cold.laid.reduce((s, l) => s + l[2], 0);
  const t = plate(0);
  let firstFall = -1;
  for (let k = 0; k < 200 && firstFall < 0; k++) { D.layDrop(t, 96, 96, 0.05, 1, 1, 0.1, 1, true); if (D.dropsLive(t.drops)) firstFall = k; }
  check('9. a drop pours in its schedule and lays all its dye, middle and edge, and the trickle falls as one drop when it has a drop\'s worth',
    capillary && mid.n === sch.steps && mid.shares && edge.n === sch.steps && Math.abs(mid.dye / want - 1) < 1e-3 && Math.abs(edge.dye / want - 1) < 1e-3
      && firstFall > 0 && Math.abs((firstFall + 1) * 0.05 - D.DROP_TATE) < 0.051 && frozen.laid.length === 0
      && !D.dropsLive(cold.drops) && cold.pours.length === 0 && Math.abs(coldDye / want - 1) < 1e-3,
    `τ ${(tau5 * 1000).toFixed(1)} ms at amount 5; amount 8 at 1/120 s: schedule ${sch8.steps} steps, ${fast.n} poured (shares and volume ${fast.shares}); ${mid.n} pours of ${sch.share.toFixed(3)} (schedule ${sch.steps}); dye laid ${(mid.dye / want).toFixed(4)} of the stamp's at the middle, ${(edge.dye / want).toFixed(4)} at the edge; the trickle fell at its ${firstFall + 1}th frame (${((firstFall + 1) * 0.05).toFixed(2)} against ${D.DROP_TATE}); forty drops on a frozen plate laid ${frozen.laid.length} cells; with the pour not yet built, ${cold.pours.length} pours and the stamp's ${(coldDye / want).toFixed(4)}`);
  /*
    10–11: a bottle's drop and a held stream (PLAN 18c-10). Filmed on the
    owner's Mac (2026-11-21), the hand's Dropper opened no window: it stamped
    its dye with `volume` false and let the bottle's deposit pour the volume
    on its own, so the colour was laid first and pushed out by the clear
    liquid after it. The checks hold the wiring the window needs: the drop
    goes through the queue with its liquid in it, the deposit is told the
    volume came already, and the hand calls these (LiquidVisualizer's own
    paths, read from its source, since the hand needs the whole app).
  */
  const SYRUP = { viscosity: 50, density: 1.3 }, INK = { tension: 0.05 };
  const bottle = (what, ready = true) => {
    const q = plate(0); q.ready = ready;
    D.dropBottle(q, 96, 96, AMOUNT, 1, 1, 0.1, 1, what, 4, 1);
    let guard = 0;
    while (D.dropsLive(q.drops) && guard++ < 50) D.stepPlateDrops(q);
    return { n: q.pours.length, sp: q.pours.every((p) => !!p.sp === !!D.speciesOf(what) && p.what === what && p.volume === true), dye: q.laid.reduce((s, l) => s + l[2], 0), push: q.deposits.map((d) => d.volume) };
  };
  const syrup = bottle(SYRUP), ink = bottle(INK), coldB = bottle(SYRUP, false);
  const fs = await import('node:fs');
  const lv = fs.readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
  /*
    The hand's source, pinned whole rather than by the old line's exact text:
    three dropBottle calls, each handing its bottle's liquid on; the four
    autoInject('drop') calls left are the music's drops (no bottle in the
    hand); and no liquid.deposit of the hand's own, which would push the
    volume a second time. A drop path added or renamed fails here loudly.
  */
  const calls = lv.match(/dropBottle\(af,[^;]*;/g) ?? [];
  const handDrops = calls.filter((c) => c.includes('liq?.behaviour')).length;
  const musicDrops = (lv.match(/autoInject\('drop'/g) ?? []).length, handDeposits = (lv.match(/liquid\.deposit\(/g) ?? []).length;
  /*
    The deposit's half of the double pour lives in two places the plate stub
    above cannot reach: LiquidPhase.deposit must hand `volume` on to its
    onDeposit, and the sim's onDeposit must pour only when push is not false.
    The first runs here for real; the second is pinned by its text, so a
    rename fails rather than passes.
  */
  const phase = new D.LiquidPhase(192);
  const forwarded = [];
  phase.onDeposit = (...a) => forwarded.push(a[6]);
  phase.deposit(96, 96, 4, SYRUP, 1, 1 / 60, false);
  phase.deposit(96, 96, 4, SYRUP, 1, 1 / 60);
  const simSrc = fs.readFileSync('src/sim/fluidSimulation.ts', 'utf8');
  const guard = /this\.thinGap && g\.pour && push !== false/.test(simSrc);
  check('10. a bottle\'s drop comes in through the queue with its liquid, its deposit pushes nothing, and the hand\'s three drops are bottle drops',
    syrup.n === sch.steps && syrup.sp && Math.abs(syrup.dye / want - 1) < 1e-3 && syrup.push.join() === 'false'
      && ink.n === sch.steps && ink.sp && ink.push.join() === 'false'
      && coldB.n === 0 && coldB.push.join() === 'true' && Math.abs(coldB.dye / want - 1) < 1e-3
      && calls.length === 3 && handDrops === 3 && musicDrops === 4 && handDeposits === 0 && /layStream\(af,[^;]*liq\?\.behaviour/.test(lv)
      && forwarded.join() === 'false,true' && guard,
    `syrup ${syrup.n} pours (schedule ${sch.steps}) carrying its species ${syrup.sp}, dye ${(syrup.dye / want).toFixed(4)} of the stamp's, deposit push ${syrup.push}; ink ${ink.n} pours, push ${ink.push}; with the pour not built, ${coldB.n} queued pours (the deposit pours it: push ${coldB.push}) and the stamp's ${(coldB.dye / want).toFixed(4)}; the hand: ${calls.length} dropBottle calls, ${handDrops} with the bottle's liquid, ${musicDrops} autoInject drops (the music's 4), ${handDeposits} deposits of its own; LiquidPhase forwards push ${forwarded}, the sim's guard ${guard ? 'there' : 'missing'}`);
  // The stream: one pour a step at the held share, its colour laid with that volume at the drop's strength.
  const st = plate(0), R = 5, DYE = 0.7, k = 1;
  const laid = D.layStream(st, 96, 96, R, 0.8, DYE, 1, 1, 0.1, 0, SYRUP, k);
  const share = st.pours[0]?.share ?? 0, C = D.dropColumnDye(192);
  const perCol = st.laid.map(([i, j, a]) => a / (share * (1 - ((i - 96) ** 2 + (j - 96) ** 2) / (R * R))));
  // Every cell inside the stream's disc gets colour (an empty list would pass `every`), and the total is the dome's.
  let inside = 0, dome = 0;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const d2 = i * i + j * j; if (d2 < R * R) { inside++; dome += 1 - d2 / (R * R); } }
  const flat = st.laid.length === inside && perCol.every((c) => Math.abs(c / (C * DYE) - 1) < 1e-6) && Math.abs(laid / (C * DYE * share * dome) - 1) < 1e-6;
  // The drop's own strength: its dye over the column-cells its pours put down, π(r N)²/2 each.
  const dropStrength = want / (sch.steps * sch.share * Math.PI * (sch.radius * 192) ** 2 / 2);
  const coldS = plate(0); coldS.ready = false;
  const coldLaid = D.layStream(coldS, 96, 96, R, 0.8, DYE, 1, 1, 0.1, 0, SYRUP, k);
  check('11. a held stream pours its volume each step and lays its colour with it, at the strength of the same bottle\'s drop; with no pour, the stamp',
    st.pours.length === 1 && share > 0 && st.pours[0].sp && st.pours[0].volume === true && flat && Math.abs(C / dropStrength - 1) < 1e-3 && st.deposits[0]?.volume === false
      && Math.abs(laid - st.laid.reduce((s, l) => s + l[2], 0)) < 1e-9
      && coldS.pours.length === 0 && coldS.deposits[0]?.volume === true && Math.abs(coldLaid / (0.8 * m0) - 1) < 1e-6,
    `share ${share.toFixed(4)} a step, ${st.laid.length} cells of the disc's ${inside} at ${(C * DYE).toFixed(3)} a column (a drop's ${dropStrength.toFixed(3)} at dye 1, ${C.toFixed(3)} the stream's), ${laid.toFixed(2)} laid, deposit push ${st.deposits[0]?.volume}; cold: ${coldS.pours.length} pours, the stamp's ${(coldLaid / (0.8 * m0)).toFixed(4)}`);
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
