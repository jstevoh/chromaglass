#!/usr/bin/env node
/**
 * A bottle's heavy liquid slides down a rocked thin gap at Hele-Shaw's speed
 * (PLAN 15e-10).
 *
 *   npm run liquidfall        (the lab on SwiftShader, a couple of minutes)
 *
 * What was wrong. A poured liquid's push (`liquidForces`: a heavy liquid's
 * slide down a rocked plate, a soap's pull, a polar liquid keeping apart)
 * went into the flow before the thin gap keeps "the velocity from before the
 * forces" ('thin gap keep', fluid.ts), so the gap read it as flow the liquid
 * already had, which its drag takes within the step. Measured by
 * `npm run liquidpush` (64², six steps, rocked 0.5): the slide under a heavy
 * drop was 3.4e-2 on the open plate and −9.4e-4 on the thin gap, beside a
 * flow of 0.53, two thousandths of it and against the rock's way. Every look
 * runs the thin gap, so a syrup or a glycerine never slid down a rocked
 * plate at all.
 *
 * What it is now. The weight is a drive, laid after the keep and read as
 * every body force there is (driveLiquids, liquidDrive): a column whose
 * density is the water's times (1 + w) feels w ρ g sinθ more than the liquid
 * round it, and between two glasses that drives it at Darcy's
 * u = w g sinθ h²/12ν, with the water it displaces going round it.
 *
 * Each line asks for a number the physics gives, worked out here in SI:
 *
 *   1. Hele-Shaw's speed. A drop as thin as the water round it, its w a
 *      soft dome (the splat's: 0.6 (1 − d²) of the bottle's weight), at the
 *      middle of a plate tipped sinθ 0.1. A sharp round drop of uniform w in
 *      a liquid of its own thickness goes at half Darcy's speed, uniformly
 *      inside it (Saffman–Taylor's inclusion: the water it pushes has to go
 *      round it); a soft one is a stack of sharp ones, each moving what lies
 *      inside it at half its own step and leaving outside it a dipole that
 *      averages to nothing round a ring about its middle. So the mean flow
 *      over the drop's inner half is half Darcy's speed for that half's mean
 *      w. To 10% (the dish's open rim and the grid's cells; printed).
      1b. And a light one (alcohol, w −0.2) rises the other way at the same
      law. A light bottle's lightness is a field of its own (liquids1.g),
      since the carries floor every field at zero and one signed field lost
      it on the first step: this drop moved nothing.
 *   2. The tilt's direction is the drop's: tipped across instead of along, it
 *      slides across as fast (to 2%) and not along (under 2%).
 *   3. As a force per unit of drag, a weight answers the liquid's viscosity:
 *      the whole plate at a Thickness of 0.8 (its clear liquid ν(0.8)) moves
 *      the same drop at ν(0.45)/ν(0.8) of its speed at the default, to 10%.
 *   3b. And Darcy's h²: half again the liquid that fills the dish lifts the
 *      cover (38r-5); let settle ten seconds (near 2.41 mm), the same drop
 *      goes at (h/h₀)² of its speed at the rest gap, to 3%, h read from the
 *      cover. Read while the cover is still settling it goes faster than its
 *      h² at the end, the gap having been wider through the run.
 *   4. A drop thicker than the water crawls (18d's species field, which the
 *      app lays for a syrup or a glycerine pour): glycerine laid in the
 *      drop's column, the same weight. Hele-Shaw's sharp inclusion λ times
 *      the water's viscosity goes at 2/(1 + λ) of a drop of the water's own;
 *      this drop's λ (its column's, read from the species field) falls from
 *      its middle to its rim, so its inner half goes between 2/(1 + λ) at the
 *      middle and at that half's edge. A drag counted twice falls under the
 *      first, one at half strength over the second.
 *   5. The oil's weight counts once. An oil lens in the mix (Oil Tension on)
 *      already rises by its own lift (hsBody, OIL_LIFT); the same oil poured
 *      into the liquids' field too, with its bottle's weight −0.12, moves the
 *      lens within 5% of the lens alone, where counted twice it would rise
 *      about half as fast again.
 *   And any GPU validation error fails the run: a pass that never ran would
 *   read as stillness.
 */
import { openLab } from './lab.mjs';
import { DISH_GAP_METRES, DISH_METRES } from '../src/lib/turntable.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// The physics, in SI.
const G = 9.81;
const PLATE = 0.2;                  // the clock glass (fluid.ts PLATE_METRES)
const GAP = DISH_GAP_METRES;        // the rest gap (lib/turntable.ts, PLAN 38r)
const SIN = 0.1;                    // about 6°, a firm lean
const W = 0.35;                     // a syrup's weight (bottles.ts), its density over the water's less one
const LIGHT = -0.2;                 // alcohol's (bottles.ts): lighter than the water, it rises
const R = 0.12;                     // the drop's radius, in plates
const STEPS = 30;                   // half a second: the drag time at the default is a fiftieth
// Half again the liquid that fills the dish at the rest gap: the cover floats up and settles near 2.4 mm (38r-5).
const ML = 1.5 * Math.PI * (DISH_METRES / 2) ** 2 * DISH_GAP_METRES * 1e6;
const SETTLE = 600;                 // ten seconds: the over-full plate's squeeze has settled to a part in a thousand
const GLYCERINE = Math.log((1412 / 1.261) * 1e-6 / 1e-6);   // ln(ν/ν_water), bottles.ts's glycerine (lib/liquidProps.ts speciesOf)

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|validation|device lost/i.test(m.text())) gpuErrors.push(m.text().slice(0, 160)); });
let r;
try {
  r = await page.evaluate(async ({ SIN, W, LIGHT, R, STEPS, GLYCERINE, ML, SETTLE }) => {
    const N = 64, X = 0.5, Y = 0.5;
    const T = { thinGap: 1, gapThickness: 0.45, gapSpring: 0, diff: 0 };
    /** The inner half of the drop: its cells, the splat's w there, and the mean flow over them; and the column's λ at the middle. */
    const under = async (clear) => {
      const v = await lab.field('vel'), sp = await lab.field('species').catch(() => null);
      let vx = 0, vy = 0, w = 0, n = 0, lam = 1, best = 9, lamEdge = Infinity;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = (i + 0.5) / N, y = (j + 0.5) / N, d = Math.hypot(x - X, y - Y) / R, k = (j * N + i) * 4;
        if (d <= 0.5) { vx += v[k]; vy += v[k + 1]; w += 0.6 * (1 - d * d); n++; }
        const l = sp ? Math.exp(sp[k + 1] - Math.min(1, Math.max(0, sp[k])) * Math.log(clear / 1e-6)) : 1;
        if (d < best) { best = d; lam = l; }
        if (d <= 0.5) lamEdge = Math.min(lamEdge, l);
      }
      return { vx: vx / n, vy: vy / n, w: w / n, n, lam, lamEdge, cover: lab.coverMetres() };
    };
    const run = async (over, lay, settle = 1) => {
      await lab.create(N, N);
      // A raised cover is let settle first (its Stefan squeeze), so the drop is read at one gap.
      await lab.step(settle, over.liquidMl ? { ...T, liquidMl: over.liquidMl } : T);
      lay(lab.solver());
      await lab.step(STEPS, over);
      return under(lab.thinGapViscosity(over.gapThickness ?? 0.45));
    };
    const heavy = (s) => s.addLiquidDrop(X, Y, R, { weight: W }, 1);
    const tipped = { ...T, rockX: SIN };
    const out = {};
    out.tipped = await run(tipped, heavy);
    out.light = await run(tipped, (s) => s.addLiquidDrop(X, Y, R, { weight: LIGHT }, 1));
    out.across = await run({ ...T, rockY: SIN }, heavy);
    out.thick = await run({ ...tipped, gapThickness: 0.8 }, heavy);
    out.raised = await run({ ...tipped, liquidMl: ML }, heavy, SETTLE);
    out.glycerine = await run(tipped, (s) => {
      heavy(s);
      s.pour(X, Y, R, 1, { lnNu: GLYCERINE, density: 1 + W, index: 1.47 }, false);
    });
    // 5. An oil lens with the looks' Oil Tension, alone and with the same oil poured into the liquids' field too.
    const O = { ...tipped, oilTension: 0.9 };
    const lens = (s) => s.addMix(X, Y, R, { oil: 1 });
    out.lens = await run(O, lens);
    out.lensTwice = await run(O, (s) => { lens(s); s.addLiquidDrop(X, Y, R, { weight: -0.12, polarity: -0.9, repel: 0.3 }, 1); });
    out.disp = lab.stepDisplacement(N);
    out.seconds = lab.stepSeconds;
    out.nu = lab.thinGapViscosity(0.45);
    out.nuThick = lab.thinGapViscosity(0.8);
    out.drew = lab.adapter();
    return out;
  }, { SIN, W, LIGHT, R, STEPS, GLYCERINE, ML, SETTLE });
} finally {
  await close();
}

const who = r.drew ? `${r.drew.vendor} ${r.drew.architecture}`.trim() : 'no adapter';
console.log(`a heavy bottle down a rocked thin gap (drawn by ${who}; ${STEPS} steps, sinθ ${SIN}, w ${W}, h ${(GAP * 1000).toFixed(0)} mm)`);
check('the lab ran without a GPU error', !gpuErrors.length, gpuErrors.length ? gpuErrors.slice(0, 2).join(' | ') : 'none');

const flowToMs = r.disp * PLATE / r.seconds;                       // a unit of the flow in m/s
const mms = (v) => (v * flowToMs * 1000).toFixed(3);
const darcy = (w, nu, weight = W, h = r.tipped.cover) => w * weight * G * SIN * h * h / (12 * nu);   // m/s, a free column of the splat's mean w
{
  const t = r.tipped, want = 0.5 * darcy(t.w, r.nu) / flowToMs;
  check('1. a heavy drop slides down the tipped gap at Hele-Shaw\'s speed, half Darcy\'s w g sinθ h²/12ν for the water it pushes round it',
    t.vx > 0 && Math.abs(t.vx / want - 1) < 0.1,
    `${mms(t.vx)} mm/s against ${mms(want)} (${(t.vx / want).toFixed(3)}×; a free column ${(darcy(t.w, r.nu) * 1000).toFixed(3)} mm/s at the inner half's mean w ${(t.w * W).toFixed(3)}, ν ${(r.nu * 1e6).toFixed(1)} cSt, over ${t.n} cells); across it ${mms(t.vy)} mm/s`);
  const l = r.light, up = 0.5 * darcy(l.w, r.nu, LIGHT) / flowToMs;
  check('1b. a light drop (alcohol\'s weight) rises up it at the same law, its lightness kept by the carry',
    l.vx < 0 && Math.abs(l.vx / up - 1) < 0.1,
    `${mms(l.vx)} mm/s against ${mms(up)} (${(l.vx / up).toFixed(3)}×)`);
  const a = r.across;
  check('2. tipped across, it slides across, as fast, and not along',
    Math.abs(a.vy / t.vx - 1) < 0.02 && Math.abs(a.vx) < 0.02 * t.vx,
    `${mms(a.vy)} mm/s across against ${mms(t.vx)} along when tipped along (${(a.vy / t.vx).toFixed(3)}×), along ${mms(a.vx)}`);
  const ratio = r.thick.vx / t.vx, wantRatio = r.nu / r.nuThick;
  check('3. a thicker plate moves it as a force per unit of drag: ν(0.45)/ν(0.8) of the speed',
    Math.abs(ratio / wantRatio - 1) < 0.1,
    `${ratio.toFixed(3)}× the default's speed against ${wantRatio.toFixed(3)} (ν ${(r.nuThick * 1e6).toFixed(1)} cSt at Thickness 0.8)`);
  {
    const h = r.raised.cover / t.cover, want3 = h * h, got = r.raised.vx / t.vx;
    check('3b. a raised cover moves it as Darcy\'s h²: (h/h₀)² of the speed',
      Math.abs(got / want3 - 1) < 0.03,
      `${got.toFixed(3)}× the speed at ${(r.raised.cover * 1000).toFixed(3)} mm against (h/h₀)² = ${want3.toFixed(3)}`);
  }
  const g = r.glycerine.vx / t.vx, slow = 2 / (1 + r.glycerine.lam), fast = 2 / (1 + r.glycerine.lamEdge);
  check('4. a drop of glycerine, as heavy, crawls as Hele-Shaw\'s thick inclusion: between 2/(1 + λ) at its middle and at its inner half\'s edge',
    g >= slow && g <= fast,
    `${g.toFixed(3)}× the plain drop's speed, between ${slow.toFixed(3)} (λ ${r.glycerine.lam.toFixed(1)}) and ${fast.toFixed(3)} (λ ${r.glycerine.lamEdge.toFixed(1)})`);
  const once = r.lensTwice.vx / r.lens.vx;
  check('5. an oil lens poured into both fields rises by its own lift once, not twice (within 5%)',
    r.lens.vx < 0 && Math.abs(once - 1) < 0.05,
    `${mms(r.lensTwice.vx)} mm/s against the lens alone's ${mms(r.lens.vx)} (${once.toFixed(3)}×)`);
}

const failed = checks.filter((c) => !c.ok);
if (failed.length) { console.error(`\n${failed.length} of ${checks.length} failed.`); process.exit(1); }
console.log(`\nAll ${checks.length} passed.`);
