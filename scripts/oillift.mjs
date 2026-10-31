#!/usr/bin/env node
/**
 * Plate Rock lifts the oil, and only the oil (PLAN 27f-5): on a tipped thin
 * gap a body of oil, lighter than the water round it, rises uphill as a
 * bubble under a tipped glass does, the water comes down round it, and the
 * picture as a whole does not move. Measured on the GPU solver alone
 * (scripts/lab.mjs).
 *
 *   npm run oillift
 *
 * What was there: the rock tipped only the colour (the dye's weight, hsBody,
 * ROCK_FALL), and the oil's own colour was weighed as the water's, so Clock
 * Glass's coloured bodies, laid at twice the water's wash, slid downhill
 * against their buoyancy. The first try at the lift (on the two-layer dish's
 * oil rafts, taken out of #440) slid an oil sheet, and with it the whole
 * picture, at 4.2 mm/s on every lean: the frame moving with the beat, which
 * the owner's rule forbids. A second, laid as the oil's share over the dish's
 * mean through the gap's open rim, held the frame but let a lens that reached
 * the rim out through it, 88% of it in three seconds at 6°.
 *
 * Each check asks for a number the physics gives, worked out here in SI:
 *
 *   1. A lens rises at Hele-Shaw's speed. Between two glasses h apart a
 *      column of oil Δρ lighter, tipped θ, would rise at Darcy's
 *      u = Δρ g sinθ h²/12μ; a round lens in a liquid of its own thickness
 *      has that liquid to push round it and goes at half, less a²/R² for the
 *      dish's wall (Saffman–Taylor's inclusion), and a lens whose edge is
 *      soft goes at that times ∫c²/∫c of its own oil (each ring of a soft
 *      lens is a sharp lens of its own, and its flow outside it averages to
 *      nothing round the ring). Light mineral oil 880 kg/m³ against 1000,
 *      the 6 mm rest gap, the default Thickness's 22 cSt: to 6%. The same
 *      lens with the plate level does not move (under 2% of that).
 *   2. Its colour does not hold it down: the same lens carrying Clock Glass's
 *      body colour (BODY_DYE, 2.6 a cell of its oil, none in the water) rises
 *      at over 80% of the plain lens's speed. Weighed whole as the water's
 *      colour, that colour pulled downhill about nine times as hard as its
 *      oil lifts (ROCK_FALL against OIL_LIFT at the lab's step), and it sank.
 *      Not all of the speed: the share of the colour Oil Bodies leaves in the
 *      water at the lens's edge (printed, about 6%) is dyed water, and weighs
 *      as dyed water does.
 *   3. The frame stays still. The plate's mean flow over the whole dish, the
 *      picture, is under 2% of the lens's speed and under 0.15 mm/s, with an
 *      oil sheet over the whole dish, a sheet over half of it tipped across
 *      and along its edge, and Clock Glass's own lay (its twelve bodies, its
 *      colours, its water's wash). The first try moved it 4.2 mm/s. And the
 *      meter reads a frame that does move: Glass Smear, the glass slid, on
 *      the same sheet reads the quarter of the smear the liquid goes at.
 *   4. The rim holds a lens. A lens sent up into the dish's rim and held
 *      there by a steady 6° tilt keeps 98.5% of its oil over six readings
 *      (a second apart in the 6 mm dish, nine at 2 mm: the journey goes as
 *      h², RIM_STEPS; the first cut kept 12% in three seconds), and over the
 *      last of them moves
 *      under 15% of its free speed. Run at a hundredth of the looks' Oil Tension, because a lens
 *      touching the open rim drained through it with no rock at all, by its
 *      own surface tension, when this was written (66% left after six
 *      seconds); the lift's own rim is what this asks about. PLAN 18g-6 has
 *      held it since (98.5% here, printed below; `npm run rimhold` is its
 *      check).
 *   5. The phone's tilt is the plate's: the step lifts the oil by the
 *      step's rockX, and the frame loop's rockX is the hand's swing plus the
 *      phone's tilt (source).
 *   And any GPU validation error fails the run: a pass that never ran would
 *   read as stillness.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI, a
 * Linux box's software WebGPU anywhere else (PW_WEBGPU=1).
 */
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';
import { DISH_GAP_METRES } from '../src/lib/turntable.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// The physics, in SI.
const G = 9.81;
const DRHO = (1000 - 880) / 1000;   // light mineral oil against water
const PLATE = 0.2;                  // the clock glass, 8 inches (fluid.ts PLATE_METRES)
const GAP = DISH_GAP_METRES;        // the rest gap at the middle (lib/turntable.ts, PLAN 38r)
const SIN = 0.1;                    // the tilt: about 6°, a firm lean
const R = 0.06;                     // the lens's radius, in plates
/*
  The rim's hold (4) is read over the journey it was written on: six
  readings a second apart in the 6 mm dish, in which the lens, sent from
  0.02 short of the rim, reached it in the first second and was pressed
  into it over the other five. Every speed on the tilted plate goes as h²
  (the lens's lift, and the squash into the rim is the same Darcy flow),
  so at 2 mm the same journey takes nine times as long: six seconds saw
  the lens cover 2.4 of its 4 mm and read its arrival, 0.33 mm/s, as a
  lens the rim had not held. The readings are a second times (6 mm / h)²
  apart, 9 s at 2 mm, and "its last second" below is the last reading.
*/
const RIM_STEPS = Math.round(60 * (0.006 / GAP) ** 2);

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
let r;
try {
  r = await page.evaluate(async ({ SIN, R, RIM_STEPS }) => {
    const N = 128, out = {};
    // Clock Glass's and Oil & Water's own liquid: Oil Tension 0.9, Oil Bodies on, no diffusion.
    const T = { thinGap: 1, gapThickness: 0.45, gapSpring: 0, oilTension: 0.9, oilBodies: 1, diff: 0 };
    const rock = { ...T, rockX: SIN };
    // The oil inside the dish: how much, its centroid, ∫c²/∫c, and how much lies past the rim.
    const oil = async () => {
      const m = await lab.chemistry('mix');
      let s = 0, s2 = 0, x = 0, y = 0, past = 0;
      for (let j = 0; j < m.n; j++) for (let i = 0; i < m.n; i++) {
        const c = Math.max(0, Math.min(1, m.data[(i + j * m.n) * 4]));
        const u = (i + 0.5) / m.n, v = (j + 0.5) / m.n;
        if (Math.hypot(u - 0.5, v - 0.5) >= 0.5) { past += c; continue; }
        s += c; s2 += c * c; x += c * u; y += c * v;
      }
      return { amount: s / (m.n * m.n), x: x / Math.max(s, 1e-9), y: y / Math.max(s, 1e-9), soft: s2 / Math.max(s, 1e-9), past: past / (m.n * m.n) };
    };
    // The picture's mean flow: every cell of the dish alike, the whole of what is shown.
    const frame = async () => {
      const v = await lab.field('vel');
      let n = 0, mx = 0, my = 0, sp = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) >= 0.5) continue;
        const k = (i + j * N) * 4;
        mx += v[k]; my += v[k + 1]; sp += Math.hypot(v[k], v[k + 1]); n++;
      }
      return { mx: mx / n, my: my / n, speed: sp / n };
    };
    /*
      A lens, and with \`dye\` its colour as Clock Glass lays a body's
      (oilLay.ts clockGlassCell: BODY_DYE times the cell's oil, none in the
      water round it).
    */
    const lens = (x, y, dye = false) => {
      lab.solver().addMix(x, y, R, { oil: 1 });
      if (!dye) return;
      const body = [{ x, y, r: R, dye: 1 }], d = new Array(N * N * 4).fill(0);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = lab.clockGlassCell((i + 0.5) / N, (j + 0.5) / N, N, body).dye, k = (i + j * N) * 4;
        d[k] = a; d[k + 1] = 0.3 * a; d[k + 3] = a;
      }
      lab.addDye(d); lab.flush();
    };
    /*
      1, 2. A lens through the middle of the dish, timed from half a second
      in (the drag time is 0.13 s, and Ψ is relaxed from cold by then) over
      the next second; and the same lens level, and the same lens coloured.
    */
    for (const [name, over, dye] of [['lens', rock, false], ['level', T, false], ['coloured', rock, true]]) {
      await lab.create(N, N);
      lens(0.53, 0.5, dye);
      await lab.step(30, over);
      const a = await oil();
      await lab.step(60, over);
      const b = await oil();
      out[name] = { a, b, f: await frame() };
    }
    // The coloured lens's colour, and the share of it Oil Bodies has left in the water.
    {
      const d = await lab.field('dye'), o = await lab.field('oilDye');
      let all = 0, water = 0;
      for (let k = 0; k < N * N; k++) { all += d[k * 4 + 3]; water += Math.max(0, d[k * 4 + 3] - o[k * 4 + 3]); }
      out.colourInWater = water / Math.max(all, 1e-9);
    }
    /*
      3. The frame, after half a second of the tilt: a sheet over the whole
      dish (and the meter's control, the same sheet under Glass Smear), half
      sheets tipped across their edge and along it, and Clock Glass's lay.
    */
    const after = async (lay, over) => { await lab.create(N, N); await lay(); await lab.step(30, over); return { ...(await frame()), ...(await oil()) }; };
    const sheet = async () => lab.solver().addMix(0.5, 0.5, 0.75, { oil: 1 });
    const half = async () => lab.solver().addMix(1.0, 0.5, 0.5, { oil: 1 });
    out.full = await after(sheet, rock);
    out.smear = await after(sheet, { ...T, smearX: 0.01 });
    out.across = await after(half, rock);
    out.along = await after(half, { ...T, rockY: SIN });
    out.halfLevel = await after(half, T);
    out.clock = await after(async () => {
      const bodies = lab.clockGlassBodies(11, 4);
      for (const b of bodies) lab.solver().addMix(b.x, b.y, b.r, { oil: 1 });
      const d = new Array(N * N * 4).fill(0);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const cell = lab.clockGlassCell((i + 0.5) / N, (j + 0.5) / N, N, bodies), k = (i + j * N) * 4;
        const a = cell.water + cell.dye;
        d[k] = 0.5 * a; d[k + 1] = 0.3 * a; d[k + 2] = 0.2 * a; d[k + 3] = a;
      }
      lab.addDye(d); lab.flush();
    }, rock);
    /*
      4. A lens sent into the uphill rim (−x) from 0.02 short of it, at a
      hundredth of the looks' Oil Tension, for six seconds; and, printed, the
      same lens at the looks' own tension with the plate level.
    */
    const rim = async (over) => {
      await lab.create(N, N);
      lens(R + 0.02, 0.5);
      const trace = [await oil()];
      for (let k = 0; k < 6; k++) { await lab.step(RIM_STEPS, over); trace.push(await oil()); }
      return trace;
    };
    out.rim = await rim({ ...rock, oilTension: 0.009 });
    out.drain = await rim(T);
    out.disp = lab.stepDisplacement(N);
    out.seconds = lab.stepSeconds;
    out.nu = lab.thinGapViscosity(0.45);
    return out;
  }, { SIN, R, RIM_STEPS });
} finally {
  await close();
}

check('no GPU pass failed validation (a stage that never ran would read as stillness)', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
const mms = (v) => v * 1000;                                       // m/s to mm/s
const speed = (a, b) => (b.x - a.x) * PLATE / (60 * r.seconds);    // m/s, over the 60 steps between a and b
const flowToMs = r.disp * PLATE / r.seconds;                       // a unit of the flow in m/s
const darcy = DRHO * G * SIN * GAP * GAP / (12 * r.nu);
const soft = (r.lens.a.soft + r.lens.b.soft) / 2;
const want = -0.5 * (1 - (R / 0.5) ** 2) * darcy * soft;          // uphill is −x
const lens = speed(r.lens.a, r.lens.b);
// 1.
check('a lens rises uphill at Hele-Shaw\'s speed, Δρ g sinθ h²/12μ halved for the water it pushes round it',
  lens < 0 && Math.abs(lens / want - 1) < 0.06,
  `${mms(-lens).toFixed(2)} mm/s against ${mms(-want).toFixed(2)} (a free column ${mms(darcy).toFixed(2)}; × ½ × (1 − a²/R²) ${(0.5 * (1 - (R / 0.5) ** 2)).toFixed(3)} × its soft edge's ∫c²/∫c ${soft.toFixed(3)}), at sinθ ${SIN}, h ${(GAP * 1000).toFixed(0)} mm, ν ${(r.nu * 1e6).toFixed(1)} cSt`);
{
  const still = speed(r.level.a, r.level.b);
  check('and on a level plate the same lens stays where it is', Math.abs(still) < 0.02 * Math.abs(lens),
    `${mms(still).toFixed(3)} mm/s against the tipped lens's ${mms(-lens).toFixed(2)}`);
}
// 2.
{
  const col = speed(r.coloured.a, r.coloured.b);
  check('its colour does not hold it down: a lens carrying Clock Glass\'s body colour still rises, at over 80% of a plain lens\'s speed',
    col < 0 && col / lens > 0.8,
    `${mms(-col).toFixed(2)} mm/s against ${mms(-lens).toFixed(2)} uncoloured, ${(100 * col / lens).toFixed(0)}%; ${(100 * r.colourInWater).toFixed(1)}% of its colour left in the water at its edge, which weighs as dyed water; weighed whole as the water's, its colour pulled it downhill about nine times as hard as its oil lifts`);
}
// 3.
{
  const v = mms(Math.abs(lens));
  const still = (f) => mms(Math.hypot(f.mx, f.my) * flowToMs);
  const show = (f) => `${still(f).toFixed(3)} mm/s`;
  const less = (f, g) => ({ mx: f.mx - g.mx, my: f.my - g.my });
  const named = [['a sheet over the whole dish', r.full], ['half the dish, tipped across its edge', less(r.across, r.halfLevel)], ['half the dish, tipped along it', less(r.along, r.halfLevel)]];
  check('the frame stays still: what the tilt adds to the picture\'s mean flow is under 2% of the lens\'s speed and under 0.15 mm/s, whatever the oil',
    named.every(([, f]) => still(f) < 0.02 * v && still(f) < 0.15),
    named.map(([n, f]) => `${n} ${show(f)}`).join(', ') + `; the lens ${v.toFixed(2)} mm/s; the first try 4.2 mm/s (the half sheets level, against the rim, already ${show(r.halfLevel)}: their surface tension settling them off the rim in their first second, PLAN 18g-6; it drained them through it, 0.14 mm/s, before)`);
  const clock = still(r.clock) / mms(r.clock.speed * flowToMs);
  check('and on Clock Glass\'s own lay, its bodies, colours and wash, the picture\'s mean is under 3% of the liquid\'s own speed',
    clock < 0.03, `${show(r.clock)} against the liquid's mean speed ${mms(r.clock.speed * flowToMs).toFixed(2)} mm/s (${(100 * clock).toFixed(1)}%)`);
  const smear = r.smear.mx / (0.25 * 0.01);
  check('and the meter reads a frame that moves: the same sheet under Glass Smear goes at the quarter of the smear the liquid takes',
    Math.abs(smear - 1) < 0.06, `${smear.toFixed(3)} of 0.25 × smear (${show(r.smear)})`);
}
// 4.
{
  const t = r.rim, a = t[0], end = t[t.length - 1], before = t[t.length - 2];
  const rimSeconds = RIM_STEPS * r.seconds;
  const last = (end.x - before.x) * PLATE / rimSeconds;   // m/s over the last reading
  const reached = end.x - R < 0.03;
  check('the rim holds a lens: sent up into it, it keeps its oil and stops as a whole',
    reached && end.amount > 0.985 * a.amount && Math.abs(last) < 0.15 * Math.abs(lens),
    `its centroid ${a.x.toFixed(3)} → ${end.x.toFixed(3)} (the rim at 0, the lens ${R} across its radius), ${(100 * end.amount / a.amount).toFixed(1)}% of its oil kept, its last ${rimSeconds.toFixed(0)} s ${mms(-last).toFixed(3)} mm/s against ${mms(-lens).toFixed(2)} free; every ${rimSeconds.toFixed(0)} s ${t.slice(1).map((s) => s.x.toFixed(3)).join(', ')}`);
  const d = r.drain;
  console.log(`      (the same lens at the looks' own Oil Tension, the plate level: ${(100 * d[d.length - 1].amount / d[0].amount).toFixed(1)}% of its oil left in the dish after ${(6 * rimSeconds).toFixed(0)} seconds, against 66% when the open rim drained it by its own surface tension in six; PLAN 18g-6)`);
}
// 5.
{
  const fluid = readFileSync('src/gpu/fluid.ts', 'utf8');
  const vis = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
  const solver = readFileSync('src/sim/fluidSimulation.ts', 'utf8');
  check('the phone\'s tilt lifts the oil too: the step lifts by its rockX, and the frame loop\'s rockX carries the phone\'s tilt',
    /lift \* p\.rockX, lift \* p\.rockY/.test(fluid) && /const rockX = swingX \+ ext\.x/.test(vis) && /rockX: plateSin\(this\.tiltX, this\.rockX\)/.test(solver),
    'fluid.ts hands hsBody lift × p.rockX; LiquidVisualizer: rockX = swingX + ext.x…; sim/fluidSimulation.ts: the step rockX = plateSin(tiltX, rockX)');
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
