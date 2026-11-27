#!/usr/bin/env node
/**
 * The oil's colour rides the oil (PLAN 38w-29).
 *
 *   npm run oilride                  (any adapter that computes: scripts/lab.mjs)
 *   npm run oilride -- --plate=air   a bubble drifting through the oil (PLAN 38w-32)
 *   npm run oilride -- --plate=old   Thin Gap off, the old plate's carry (PLAN 38w-32)
 *
 * Reported by the owner (Classic, round five, 2026-11-22): "the colors seem
 * to get washed out". Measured then on the live app under a hand (Beat
 * Squeeze 0.6, Plate Rock 1.6): the oil's own colour fell from 10,070 to
 * 9,250 in 41 s, 8% of it handed to the water. With Oil Bodies the oil
 * carries its share of the dye (`oilDye`), and bodyPartition gives the water
 * whatever of that share it finds outside the oil. Two things moved the oil
 * without its colour: the carry, where the oil's fraction and its colour went
 * through the same faces with two different limiters (superbee for the oil,
 * van Leer's MC for the colour), so their edges parted; and Cahn–Hilliard,
 * which moves the oil by an exchange between cells with no liquid moving and
 * did not move what is dissolved in it at all. A dye dissolved in oil goes
 * where the oil goes, so the fix carries the oil's colour as its
 * concentration in the oil times the oil's own flux, in both places.
 *
 * The plate: Classic's liquid (its thin gap, tension, Film Hold and Oil
 * Bodies, read from the look), at 192², fourteen oil drops and a strip of
 * nine, amber inside the oil and teal in the water, laid from the oil on the
 * plate so each colour starts exactly in its liquid. Then five seconds (300
 * steps) of the hand the owner filmed: Beat Squeeze's kick on every beat at
 * 120 bpm (lab.sheetPress at 0.6, each at a new place round the middle) and
 * Plate Rock tipping the plate round in a three-second circle. Asked:
 *
 *   1. the plate moved: of the start's body cells (over 0.95 oil), at least
 *      MOVED are not body cells at the end. A dropped step (a kernel that
 *      failed validation drops the whole encoder) moves nothing and fails here
 *   2. the oil keeps its colour: the oil's share after the hand is within
 *      1 − SHARE_KEPT of what was laid, either way. bodyPartition gives the water what of the
 *      share it finds outside the oil, so this is the colour washed out
 *   3. and it is inside the oil: of what lay in cells over half oil at the
 *      start, at least KEPT does at the end; and at the strength it was laid
 *      (colour per unit of oil in the bodies within CONC: a floor against a
 *      carry that keeps the share by making colour)
 *   4. none of it stranded in the open water (cells under 0.05 oil): under
 *      ASTRAY of the share
 *   5. the amber you see stays out of the open water (solved per cell from
 *      the dye's red and blue absorbances, as `npm run bodies` does): under
 *      AMBER_OUT of it
 *   6. no oil made or lost, within 1%. (Not the whole dye: the water's colour
 *      is laid to the plate's corners and the hand carries some of it over
 *      the open rim, where it goes, as on the plate.)
 *
 * Measured while writing this (software WebGPU, 192², 300 steps):
 *
 *   main at eb753f1: share 5193.2 → 5164.9 (99.46% kept, FAIL), of what lay inside
 *     the oil 98.8% still does (FAIL), 0.35% in open water, amber in open water
 *     0.42%, 21.0% of the bodies moved
 *   this (38w-29):   share 5193.1 → 5193.4 (100.01%), inside 99.3%, 0.37%,
 *     0.37%, 20.8%
 *   and the colour riding Cahn–Hilliard's flux too (tried, left out): share
 *     5132.5 (98.83%)
 *
 * And with air and on the old plate (PLAN 38w-32), before the split ran
 * there (b5585d2) and with it:
 *
 *   --plate=air  share 5193.2 → 5159.5 (99.35%, FAIL), inside 98.1% (FAIL);
 *                split 5193.2 → 5194.5 (100.03%), inside 98.8%; the split
 *                ran 241 steps of 240 with a bubble (and the one after its
 *                lift, its hole), the bubble on oil in 22 of 24 reads
 *   --plate=old  share 5193.7 → 5130.9 (98.79%, FAIL), inside 97.8% (FAIL);
 *                split 5193.7 → 5199.6 (100.11%), inside 99.0%
 *
 * (On a thin gap the dye falls about a quarter in the five seconds, with
 * or without air or the split: the water's colour laid to the corners,
 * carried over the open rim by the hand. The old plate's walls hold it.)
 */
import { openLab } from './lab.mjs';

const PLATE = (process.argv.find((a) => a.startsWith('--plate=')) ?? '--plate=thin').slice(8);
if (!['thin', 'air', 'old'].includes(PLATE)) throw new Error(`--plate=${PLATE}: thin, air or old`);
const N = 192;
const STEPS = 300;
const MOVED = 0.1;  // half the 21% the hand moves
const SHARE_KEPT = 0.998;
/*
  Of what lay inside the oil at the start. Thin: main 98.8%, 38w-29 99.3%.
  With a bubble (38w-32): 98.1% before, 98.8% split; the bubble's room is
  taken by the colour's carries and not by the oil's own (mixAdvect, owed
  as 15g-8e), so its rim pushes the oil's colour off oil that stays. Old
  plate: 97.8% before, 99.0% split. Each bar between the two.
*/
const KEPT = { thin: 0.99, air: 0.985, old: 0.985 }[PLATE];
const CONC = 0.03;     // the colour per unit of oil in the bodies, against the start's: a floor, not the fix's line
const ASTRAY = 0.01;   // floors: main and this both read about 0.4% here (the lines above tell them apart)
const AMBER_OUT = 0.02;
const KICK = 0.6;   // Beat Squeeze, as filmed
const ROCK = 0.2;   // Plate Rock's tip, sin of the angle
const TEAL = [1.1, 0.25, 0.35];
const AMBER = [0.1, 0.5, 1.5];

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => gpuErrors.push(String(e).slice(0, 200)));
try {
  const over = await page.evaluate(() => {
    const s = lab.look('classic').settings;
    return { thinGap: 1, bubbleClear: 1, advection: s.advection, plateCurve: s.plateCurve, depthDrag: s.depthDrag, platePressure: s.platePressure,
      oilTension: s.oilTension, oilBodies: s.oilBodies, filmHold: s.filmHold, diff: s.diffusionRate, turbScale: 0 };
  });
  if (PLATE === 'old') over.thinGap = 0;
  console.log(`Classic's liquid on the ${PLATE} plate: ${JSON.stringify(over)}`);
  if (!(over.oilBodies > 0)) throw new Error('Classic no longer turns Oil Bodies on: this check reads the oil\'s share, which only Oil Bodies keeps');

  await page.evaluate(async ({ N, over, TEAL, AMBER }) => {
    await lab.create(N, N);
    const s = lab.solver();
    let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    for (let k = 0; k < 14; k++) s.addMix(0.2 + 0.6 * rnd(), 0.2 + 0.6 * rnd(), 0.03 + 0.035 * rnd(), { oil: 1 });
    for (let k = 0; k < 9; k++) s.addMix(0.3 + k * 0.05, 0.5, 0.025, { oil: 1 });
    await lab.step(1, { ...over, turbScale: 0 });
    const m = await s.readChemistry('mix');
    const d = new Array(N * N * 4), o = new Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const c = Math.max(0, Math.min(1, m.data[i * 4]));
      for (let ch = 0; ch < 3; ch++) { d[i * 4 + ch] = 0.8 * (1 - c) * TEAL[ch] + 1.2 * c * AMBER[ch]; o[i * 4 + ch] = 1.2 * c * AMBER[ch]; }
      d[i * 4 + 3] = 0.8 * (1 - c) + 1.2 * c; o[i * 4 + 3] = 1.2 * c;
    }
    lab.addDye(d);
    lab.flush();
    lab.share(o);
  }, { N, over, TEAL, AMBER });

  const read = () => page.evaluate(async ({ N, TEAL, AMBER }) => {
    const d = await lab.field('dye'), od = await lab.field('oilDye');
    const m = await lab.solver().readChemistry('mix');
    if (m.n !== N) throw new Error(`the mix is ${m.n}², the dye ${N}²`);
    const det = TEAL[0] * AMBER[2] - AMBER[0] * TEAL[2];
    let share = 0, inOil = 0, inWater = 0, amber = 0, amberOut = 0, mass = 0, oil = 0, apart = 0, body = 0, bodyC = 0;
    const cs = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const c = m.data[i * 4], a = od[i * 4 + 3];
      cs[i] = c; oil += c; share += a; mass += d[i * 4 + 3];
      if (c >= 0.5) inOil += a;
      apart += Math.abs(a - 1.2 * Math.max(0, c));
      if (c > 0.95) { body += a; bodyC += c; }
      if (c < 0.05) inWater += a;
      const R = d[i * 4], B = d[i * 4 + 2];
      const am = Math.max(0, (TEAL[0] * B - TEAL[2] * R) / det);
      amber += am;
      if (c < 0.05) amberOut += am;
    }
    return { share, inOil, inWater, amber, amberOut, mass, oil, apart: apart / share, conc: body / bodyC, cs: Array.from(cs) };
  }, { N, TEAL, AMBER });

  const start = await read();
  const t0 = Date.now();
  /*
    The hand the owner filmed: Beat Squeeze's kick on every beat at 120 bpm
    (lab.sheetPress, as the app's pressKick presses it, at 0.6), each at a
    new place round the middle, and Plate Rock tipping the plate round in a
    three-second circle (rockX, rockY).
  */
  /*
    With --plate=air, a bubble as well (PLAN 38w-32), put down at a new place
    each second and drifting a fifth of the plate across it, so its rim
    sweeps through oil and water alike; lifted for the last second, so its
    hole fills back before the read. Counted while it is down: the steps
    whose oil's colour was carried in the air's room (sharpAirCarries, so
    the kernel ran, not only that there was air), and the steps whose
    bubble stood on oil (some cell of its disc over half oil, read every
    tenth step), so a bubble misplaced into open water fails. Its own
    random places, so the hand's kicks land where the thin plate's do.
  */
  const airSeen = await page.evaluate(async ({ n, o, KICK, ROCK, air, N }) => {
    let seed = 3; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    let seedB = 11; const rndB = () => (seedB = seedB * 16807 % 2147483647) / 2147483647;
    const s = lab.solver();
    const ran0 = s.sharpAirCarries;
    let bx = 0.5, by = 0.5, read = 0, onOil = 0;
    for (let k = 0; k < n; k++) {
      const t = k / 60;
      if (k % 30 === 0) lab.sheetPress(0.3 + 0.4 * rnd(), 0.3 + 0.4 * rnd(), KICK, 1e-6);
      if (air && k % 60 === 0) { bx = 0.25 + 0.3 * rndB(); by = 0.3 + 0.4 * rndB(); }
      const x = bx + 0.2 * (k % 60) / 60;
      if (air && k < n - 60) s.setBubbles(new Float32Array([x, by, 0.045, 1]), 1, 0.25, new Float32Array(4));
      else if (air && k === n - 60) s.setBubbles(new Float32Array(4), 0, 0.25, new Float32Array(4));
      lab.sheetStep();
      lab.flush();
      await lab.step(1, { ...o, rockX: ROCK * Math.sin(2 * Math.PI * t / 3), rockY: ROCK * Math.cos(2 * Math.PI * t / 3) }, true);
      if (air && k < n - 60 && k % 10 === 5) {
        const m = await s.readChemistry('mix');
        let hit = false;
        for (let j = 0; j < N && !hit; j++) for (let i = 0; i < N; i++) {
          if (Math.hypot((i + 0.5) / N - x, (j + 0.5) / N - by) < 0.045 && m.data[(i + j * N) * 4] >= 0.5) { hit = true; break; }
        }
        read++; if (hit) onOil++;
      }
    }
    return { ran: s.sharpAirCarries - ran0, read, onOil };
  }, { n: STEPS, o: over, KICK, ROCK, air: PLATE === 'air', N });
  const end = await read();
  const thin = await page.evaluate(() => lab.solver().thinGapLive);
  console.log(`  ${STEPS} steps in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  let was = 0, gone = 0;
  for (let i = 0; i < N * N; i++) if (start.cs[i] > 0.95) { was++; if (end.cs[i] <= 0.95) gone++; }
  const pct = (v, n = 2) => `${(v * 100).toFixed(n)}%`;
  console.log(`  oil's share ${start.share.toFixed(1)} → ${end.share.toFixed(1)}, inside the oil ${start.inOil.toFixed(1)} → ${end.inOil.toFixed(1)}, `
    + `in open water ${start.inWater.toFixed(2)} → ${end.inWater.toFixed(2)}; amber in open water ${pct(start.amberOut / start.amber)} → ${pct(end.amberOut / end.amber)}; `
    + `apart ${pct(start.apart)} → ${pct(end.apart)}, colour per unit of oil in the bodies ${start.conc.toFixed(3)} → ${end.conc.toFixed(3)}; `
    + `dye ${start.mass.toFixed(1)} → ${end.mass.toFixed(1)}, oil ${start.oil.toFixed(1)} → ${end.oil.toFixed(1)}`);

  check('the plate moved', was > 0 && gone / was > MOVED, `${pct(gone / Math.max(1, was), 1)} of the body cells are body no longer (bar ${pct(MOVED, 0)})`);
  check('the oil keeps its colour', Math.abs(end.share / start.share - 1) <= 1 - SHARE_KEPT,
    `${pct(end.share / start.share)} of the oil's share laid is still the oil's after ${STEPS} steps (bar within ${pct(1 - SHARE_KEPT, 1)}, either way)`);
  check('the oil\'s colour stays in the oil', end.inOil / start.inOil >= KEPT,
    `${pct(end.inOil / start.inOil, 1)} of what lay inside the oil (${pct(start.inOil / start.share, 1)} of the share at the start) is inside it after the hand (bar ${pct(KEPT, 1)})`);
  check('at the strength it was laid', Math.abs(end.conc / start.conc - 1) <= CONC,
    `colour per unit of oil in the bodies ${start.conc.toFixed(3)} → ${end.conc.toFixed(3)} (bar within ${pct(CONC, 0)})`);
  check('and none of it is stranded in the open water', end.inWater / Math.max(1e-9, end.share) < ASTRAY,
    `${pct(end.inWater / Math.max(1e-9, end.share))} of the oil's share lies in open water (bar ${pct(ASTRAY, 1)})`);
  check('the amber you see stays out of the open water', end.amberOut / end.amber < AMBER_OUT,
    `${pct(end.amberOut / end.amber)} of the amber in open water (bar ${pct(AMBER_OUT, 1)})`);
  check('no oil made or lost', Math.abs(end.oil / start.oil - 1) < 0.01, `oil ${pct(end.oil / start.oil - 1)}`);
  check(`on the ${PLATE} plate, where this run asks`, thin === (PLATE !== 'old'), `thinGapLive ${thin}`);
  if (PLATE === 'air') {
    check('and the oil\'s colour was carried in the air\'s room', airSeen.ran >= STEPS - 60 - 5 && airSeen.ran <= STEPS,
      `${airSeen.ran} steps with the oil's share in the air's room (bodyAdvectSplitSubAir, or bodyAdvectSharpSubAir apart), of ${STEPS - 60} with a bubble down (bar all but 5)`);
    check('and the bubble stood on oil', airSeen.onOil >= airSeen.read / 4 && airSeen.read > 0, `on oil in ${airSeen.onOil} of ${airSeen.read} reads (bar a quarter)`);
  }
  check('no GPU errors', gpuErrors.length === 0, gpuErrors[0] ?? '');
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} of ${checks.length} FAILED` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
