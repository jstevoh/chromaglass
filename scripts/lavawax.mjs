#!/usr/bin/env node
/**
 * Lava Lamp's wax is a liquid of its own (PLAN 27f-9c): bodies that hold
 * together in a clear liquid, heavy while cold, lifted by the lamp. Measured
 * on the GPU solver alone (scripts/lab.mjs), on the look's own settings and
 * the wax the app lays (src/lib/oilLay.ts, LAVA_BODIES).
 *
 *   npm run lavawax
 *
 * What was there: sealed in its bottle (27f-9) the wax stayed in the plate,
 * but it was dye with a weight (Dye Weight), and dye is one liquid with the
 * water: the Mac filmed the plate red wall to wall with no blob in it. Now the
 * wax is the oil (Oil Tension's Cahn–Hilliard mix, its colour kept in it by
 * Oil Bodies) with a weight of its own (Oil Weight, OIL_RHO) and a heat lift
 * beyond the water's (OIL_EXPAND), and the lamp warms it as a body.
 *
 *   1. The meter sees the mixing: the same wax laid as dye (Oil Tension and
 *      Oil Bodies off, the look before this) leaves at least twice the oil's
 *      share of the dish in a thin wash of colour (more than clear, less than
 *      a third of the wax's own dye), over the same seconds. A wax that holds
 *      together is either its full colour or clear liquid; dye thins out.
 *   2. As oil, the wax holds together: at least 70% of the dish is clear
 *      liquid and at least 75% of the colour is inside the bodies (cells more
 *      than half oil; 84% at ten seconds when this was written, the rest the
 *      leak PLAN 27f-9f names).
 *   3. Cold wax is heavy: of the oil laid above 0.7 of the plate's height at
 *      most 40% is still there. Its control: the same plate with Oil Weight at
 *      −1, an oil lighter than its own colour weighs, keeps at least 60% up
 *      there, so it is the oil's weight that sinks it. (At the mineral oil's
 *      −0.05 the body's dye outweighs the oil's lightness and it sinks too.)
 *   4. The lamp holds the wax off the floor: with it, at most 25% of the oil
 *      lies below 0.15 of the plate's height at the end; with the heat taken
 *      off every step (Heat Decay near 0) the cold wax sinks there, at least
 *      60% of it, so it is the lamp's heat that lifts it.
 *   And any GPU validation error fails the run.
 *
 * No canvas, so it runs on any adapter that computes (PW_WEBGPU=1 on Linux).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const SECONDS = 10;
const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
let r;
try {
  r = await page.evaluate(async (SECONDS) => {
    const N = 128;
    const look = lab.look('lava-lamp').settings;
    const WAX = lab.dyeOf([0.86, 0.08, 0.24]);
    // A thin wash: under a third of the dye the wax is laid with (LAVA_DYE, through lavaLampCell).
    const WASH = lab.lavaLampCell(0.5, 0.2, 192).dye / 3;
    // The look's own step, as the app derives it (fluidSimulation's params) for what this measures.
    const step = (over) => ({ thinGap: 1, gapThickness: look.gapThickness ?? 0.45, plateUpright: look.plateUpright, solutalBuoyancy: look.solutalBuoyancy,
      gravityX: 0, gravityY: -1, gravityReach: 0.3, dt: 1 / 60, heatDecay: look.heatDecay, currentBuoy: look.buoyancy * 0.3, maxCurrent: 0.3,
      doubleDiffusion: look.doubleDiffusion, oilTension: look.oilTension, oilBodies: look.oilBodies, oilWeight: look.oilWeight, ...over });
    const lay = async (over) => {
      await lab.create(N);
      const s = lab.solver();
      for (let k = 0; k < 40 && !s.sealReady(); k++) await new Promise((q) => setTimeout(q, 250));
      const p = step(over);
      await lab.step(1, p);
      const oil = (p.oilTension ?? 0) > 0.001;
      if (oil) for (const b of lab.lavaBodies) s.addMix(b.x, b.y, b.r, { oil: 1 });
      // The colour as the app lays it, each cell's dye from lavaLampCell on the lab's logical grid.
      const L = 192, d = new Array(L * L * 4).fill(0);
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const c = lab.lavaLampCell((i + 0.5) / L, (j + 0.5) / L, L);
        if (c.dye > 0) { const k = (j * L + i) * 4; d[k] = WAX[0] * c.dye; d[k + 1] = WAX[1] * c.dye; d[k + 2] = WAX[2] * c.dye; d[k + 3] = c.dye; }
      }
      lab.addDye(d); lab.flush();
      return { s, p, ready: s.sealReady() };
    };
    const measure = async () => {
      const f = await lab.field('dye'); const n = Math.round(Math.sqrt(f.length / 4));
      const mix = await lab.chemistry('mix'); const m = mix ? mix.n : 0;
      let cells = 0, clear = 0, wash = 0, dye = 0, inBody = 0, oil = 0, high = 0, low = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = (i + 0.5) / n, y = (j + 0.5) / n;
        if ((x - 0.5) ** 2 + (y - 0.5) ** 2 > 0.45 * 0.45) continue;
        const a = f[(j * n + i) * 4 + 3];
        const c = m ? mix.data[(Math.floor(j * m / n) * m + Math.floor(i * m / n)) * 4] : 0;
        cells++; if (a < 0.08) clear++; else if (a < WASH) wash++; dye += a; if (c > 0.5) inBody += a;
        oil += c; if (y > 0.7) high += c; if (y < 0.15) low += c;
      }
      return { clear: clear / cells, wash: wash / cells, inBody: inBody / Math.max(dye, 1e-9), oil, high, low };
    };
    const run = async (over, seconds = SECONDS) => {
      const { p, ready } = await lay(over);
      const a = await measure();
      await lab.step(Math.round(seconds * 60), p);
      return { a, b: await measure(), ready };
    };
    return {
      oil: await run({}),
      dye: await run({ oilTension: 0, oilBodies: 0 }),
      light: await run({ oilWeight: -1 }),
      cold: await run({ heatDecay: 0.0001 }),
    };
  }, SECONDS);
} finally {
  await close();
}

const pct = (v) => `${(100 * v).toFixed(0)}%`;
const ready = r.oil.ready && r.dye.ready && r.light.ready && r.cold.ready;
// 1.
check(`the meter sees the mixing: the wax laid as dye leaves at least twice the oil's share of the dish in a thin wash after ${SECONDS} s`,
  r.dye.b.wash >= 2 * r.oil.b.wash && r.dye.b.wash >= 0.05, `a thin wash over ${pct(r.dye.b.wash)} of the dish as dye against ${pct(r.oil.b.wash)} as oil (clear ${pct(r.dye.b.clear)} against ${pct(r.oil.b.clear)})`);
// 2.
check('as oil the wax holds together: at least 70% of the dish clear and at least 75% of the colour inside the bodies',
  ready && r.oil.b.clear >= 0.7 && r.oil.b.inBody >= 0.75,
  `${ready ? '' : 'the seal NOT built; '}clear ${pct(r.oil.a.clear)} → ${pct(r.oil.b.clear)}, colour in the bodies ${pct(r.oil.a.inBody)} → ${pct(r.oil.b.inBody)}`);
// 3.
{
  const kept = r.oil.b.high / Math.max(r.oil.a.high, 1e-9), keptLight = r.light.b.high / Math.max(r.light.a.high, 1e-9);
  check('cold wax is heavy: at most 40% of the oil laid above 0.7 of the height stays there, where an oil at Oil Weight −1 keeps at least 60%',
    kept <= 0.4 && keptLight >= 0.6, `${pct(kept)} stays at the look's Oil Weight, ${pct(keptLight)} at −1`);
}
// 4.
{
  const low = r.oil.b.low / Math.max(r.oil.b.oil, 1e-9), lowCold = r.cold.b.low / Math.max(r.cold.b.oil, 1e-9);
  check('the lamp holds the wax off the floor: at most 25% of the oil below 0.15 of the height with it, at least 60% with no heat',
    low <= 0.25 && lowCold >= 0.6, `${pct(low)} with the lamp, ${pct(lowCold)} with Heat Decay near 0`);
}
check('no GPU validation errors', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
