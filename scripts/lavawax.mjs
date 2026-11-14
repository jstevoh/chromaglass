#!/usr/bin/env node
/**
 * Lava Lamp's wax is a liquid of its own (PLAN 27f-9c): bodies that hold
 * together in a clear liquid, heavy while cold (that the lamp then lifts it
 * is `npm run lavacycle`'s, on the Mac). Measured
 * on the GPU solver alone (scripts/lab.mjs), on the look's own settings and
 * the wax the app lays (src/lib/oilLay.ts, LAVA_BODIES).
 *
 *   npm run lavawax
 *
 * What was there: sealed in its bottle (27f-9) the wax stayed in the plate,
 * but it was dye with a weight (Dye Weight), and dye is one liquid with the
 * water: the Mac filmed the plate red wall to wall with no blob in it. Now the
 * wax is the oil (Oil Tension's Cahn–Hilliard mix, its colour kept in it by
 * Oil Bodies) with a weight of its own (Oil Weight, OIL_RHO), a heat lift
 * beyond the water's (OIL_EXPAND), and the lamp warms it as a body.
 *
 * Every line has a control run that takes away the one thing it names, so
 * none of them can pass on the lay alone or on a plate where that thing is
 * broken (the first draft of this check could: a skeptic's review found the
 * lay itself already had little oil low down, that a missing Oil Bodies or
 * Oil Weight would have stayed green, and that its step was the lab's and not
 * the look's; on the look's own step it then measured the melt the first cut
 * gave the wax doing nothing, 0.24 of the height against 0.23 without, and
 * the melt went).
 *
 *   1. The colour stays in the wax: after six seconds at least 70% of the
 *      dish is clear liquid, and the share of the colour inside the bodies
 *      (cells more than half oil) is at least 5 points more than with Oil
 *      Bodies off, where the oil holds together but its colour does not stay
 *      in it. Not asserted: that the dish stays clearer than with the wax
 *      laid as dye. On the look's own step the two are level at six seconds
 *      (both about 80% clear: the dye has not spread yet, and a quarter of the
 *      wax's colour has left it, most in the first second, PLAN 27f-9f); the
 *      difference the owner saw, red wall to wall, is a minute's, which is the
 *      Mac's film to show and too long for SwiftShader.
 *   2. Cold wax is heavy: of the oil laid above 0.7 of the plate's height, the
 *      share still there over the first three seconds (the mean of one sample
 *      a second) is at least 15 points less at the look's Oil Weight than at
 *      Oil Weight 0, where only the colour's own weight (Dye Weight) pulls it.
 *   The lamp lifting the wax was this check's third line (after six seconds
 *   the oil's centre of mass 0.06 of the height above a plate with its heat
 *   taken off, and 0.01 above a lab built without the oil's swelling). It read
 *   a kick laid in the wax alone, which lifted it within seconds. The lamp is
 *   a warm glass floor now (PLAN 27f-9h), which heats water and wax alike by
 *   conduction: wax laid cold sinks for ten seconds before it has warmed, and
 *   at six the lamp has done nothing yet (0.175 against 0.162 and 0.164). The
 *   line and its no-swelling lab moved to `npm run lavacycle` (its lines 3
 *   and 4), which watches the first minute on the Mac's GPU: 0.60 of the
 *   height at 23 s with the lamp, 0.13 with the warm floor or the swelling
 *   taken out. Twenty-three seconds of three plates is a quarter of an hour
 *   more on SwiftShader, which this part does not have.
 *   And any GPU validation error fails the run; a seal that never builds, a
 *   missing mix, a look key that is not a number or oil lost from the plate
 *   stops the run with an error rather than measuring something else.
 *
 * The step is the look's own, derived as fluidSimulation's deriveStep does
 * for every term this plate uses (advection, damping, viscosity, sharpness,
 * the stirring), not the lab's defaults.
 *
 * No canvas, so it runs on any adapter that computes (PW_WEBGPU=1 on Linux).
 * One lab and 15 seconds of the plate, in the measure part lab8 (its own until
 * bubbleair joined it, PLAN 19k-11c):
 * it was two labs and 27 seconds, about ten minutes on SwiftShader, while it
 * carried the lamp's line.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const SECONDS = 6, EARLY = 3;
const gpuErrors = [];
async function inLab(opts, runs) {
  const lab = await openLab(opts);
  lab.page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
  try {
    return { js: lab.js, r: await lab.page.evaluate(measureRuns, { runs, SECONDS }) };
  } finally {
    await lab.close();
  }
}

/** In the page: lay the look's wax as the app does and run each of `runs`, sampling once a second. */
async function measureRuns({ runs, SECONDS }) {
  const N = 128;
  const look = lab.look('lava-lamp').settings;
  for (const k of ['oilTension', 'oilBodies', 'oilWeight', 'solutalBuoyancy', 'heatDecay', 'buoyancy', 'advection', 'damping', 'turbulenceScale', 'doubleDiffusion']) {
    if (!Number.isFinite(look[k])) throw new Error(`lavawax: Lava Lamp's ${k} is ${look[k]}, not a number`);
  }
  if (!(look.oilWeight > 0)) throw new Error(`lavawax: Lava Lamp's Oil Weight is ${look.oilWeight}: this check is about a heavy wax`);
  const WAX = lab.dyeOf([0.86, 0.08, 0.24]);
  // A thin wash: under a third of the dye the wax is laid with (LAVA_DYE, through lavaLampCell).
  const WASH = lab.lavaLampCell(0.5, 0.2, 192).dye / 3;
  /*
    The look's own step, as fluidSimulation's deriveStep makes it, for every
    term this plate reads: Thick is 1.5, nu 0.0001 of it; sharpness through
    its curve; the stirring through stirOf with no music (t·(1 + 3t³)); the
    lamp's reach and the current's lift as the thin gap sets them.
  */
  const visc = look.viscosity === 'thick' ? 1.5 : 0.5;
  const sh = Math.max(0, Math.min(1, look.sharpness ?? 0));
  const tu = Math.max(0, Math.min(1, look.turbulenceScale));
  const step = (over) => ({ thinGap: 1, gapThickness: look.gapThickness ?? 0.45, plateUpright: look.plateUpright, solutalBuoyancy: look.solutalBuoyancy,
    gravityX: 0, gravityY: -1, gravityReach: 0.3, dt: 1 / 60, heatDecay: look.heatDecay, currentBuoy: look.buoyancy * 0.3, maxCurrent: 0.3,
    doubleDiffusion: look.doubleDiffusion, oilTension: look.oilTension, oilBodies: look.oilBodies, oilWeight: look.oilWeight,
    advection: look.advection, diff: look.diffusionRate ?? 0, damping: look.damping || 0.99, visc, nu: visc * 0.0001,
    sharpness: sh * (0.225 - 0.09 * sh), turbScale: tu * (1 + 3 * tu ** 3), turbDetail: Math.round(look.turbulenceDetail ?? 3),
    platePressure: look.platePressure ?? 0.4, ...over });
  const lay = async (over) => {
    await lab.create(N);
    const s = lab.solver();
    for (let k = 0; k < 40 && !s.sealReady(); k++) await new Promise((q) => setTimeout(q, 250));
    if (!s.sealReady()) throw new Error('lavawax: the sealed bottle never built (sealReady false after 10 s)');
    const p = step(over);
    await lab.step(1, p);
    if ((p.oilTension ?? 0) > 0.001) for (const b of lab.lavaBodies) s.addMix(b.x, b.y, b.r, { oil: 1 });
    // The colour as the app lays it, each cell's dye from lavaLampCell on the lab's logical grid.
    const L = 192, d = new Array(L * L * 4).fill(0);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const c = lab.lavaLampCell((i + 0.5) / L, (j + 0.5) / L, L);
      if (c.dye > 0) { const k = (j * L + i) * 4; d[k] = WAX[0] * c.dye; d[k + 1] = WAX[1] * c.dye; d[k + 2] = WAX[2] * c.dye; d[k + 3] = c.dye; }
    }
    lab.addDye(d); lab.flush();
    return p;
  };
  const measure = async (oily) => {
    const f = await lab.field('dye'); const n = Math.round(Math.sqrt(f.length / 4));
    const mix = await lab.chemistry('mix');
    if (oily && !mix) throw new Error('lavawax: no mix to read on a plate laid with oil');
    const m = mix ? mix.n : 0;
    let cells = 0, clear = 0, wash = 0, dye = 0, inBody = 0, oil = 0, high = 0, oilY = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n, y = (j + 0.5) / n;
      const r2 = (x - 0.5) ** 2 + (y - 0.5) ** 2;
      if (r2 > 0.25) continue;
      const c = m ? Math.max(0, mix.data[(Math.floor(j * m / n) * m + Math.floor(i * m / n)) * 4]) : 0;
      // The oil over the whole plate: the wax's pool lies along the curved floor out to the rim, past 0.45.
      oil += c; oilY += c * y; if (y > 0.7) high += c;
      // The dish's colour inside 0.45, clear of the rim's own shading.
      if (r2 > 0.45 * 0.45) continue;
      const a = f[(j * n + i) * 4 + 3];
      cells++; if (a < 0.08) clear++; else if (a < WASH) wash++; dye += a; if (c > 0.5) inBody += a;
    }
    return { clear: clear / cells, wash: wash / cells, inBody: dye > 0 ? inBody / dye : 0, oil, high, oilY: oil > 0 ? oilY / oil : 0 };
  };
  const out = {};
  for (const [name, { over, seconds = SECONDS }] of Object.entries(runs)) {
    const p = await lay(over);
    const oily = (p.oilTension ?? 0) > 0.001;
    const t = [await measure(oily)];
    for (let k = 0; k < seconds; k++) { await lab.step(60, p); t.push(await measure(oily)); }
    if (oily && t.at(-1).oil < 0.9 * t[0].oil) throw new Error(`lavawax: ${name} lost oil, ${t.at(-1).oil.toFixed(0)} of ${t[0].oil.toFixed(0)} left`);
    out[name] = t;
  }
  return out;
}

const plain = await inLab({}, {
  oil: { over: {} },
  bodiesOff: { over: { oilBodies: 0 } },
  weightless: { over: { oilWeight: 0 }, seconds: EARLY },
});
const r = plain.r;

const pct = (v) => `${(100 * v).toFixed(0)}%`;
const end = (k) => r[k].at(-1);
const f2 = (v) => v.toFixed(2);
// 1.
check('the colour stays in the wax: at least 70% of the dish clear, and at least 5 points more of the colour inside the bodies than with Oil Bodies off',
  end('oil').clear >= 0.7 && end('oil').inBody >= end('bodiesOff').inBody + 0.05,
  `clear ${pct(r.oil[0].clear)} → ${pct(end('oil').clear)}, colour in the bodies ${pct(r.oil[0].inBody)} → ${pct(end('oil').inBody)} (${pct(end('bodiesOff').inBody)} with Oil Bodies off), a thin wash over ${pct(end('oil').wash)}`);
// 2.
{
  const kept = (k) => { const t = r[k]; let s = 0; for (let i = 1; i <= EARLY; i++) s += t[i].high / t[0].high; return s / EARLY; };
  const look = kept('oil'), zero = kept('weightless');
  check(`cold wax is heavy: over the first ${EARLY} s at least 15 points less of the oil laid above 0.7 of the height stays there at the look's Oil Weight than at 0`,
    look <= zero - 0.15, `${pct(look)} stays at the look's Oil Weight, ${pct(zero)} at Oil Weight 0`);
}
check('no GPU validation errors', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
console.log(`\na second at a time: the oil's centre of mass ${r.oil.map((m) => f2(m.oilY)).join(' ')}; colour in the bodies ${r.oil.map((m) => pct(m.inBody)).join(' ')}`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
