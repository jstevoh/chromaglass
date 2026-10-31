#!/usr/bin/env node
/**
 * The lamp's heat as a force and a loss, in kelvin, watts and seconds (PLAN
 * 38f, 38t). Measured on the GPU solver alone (scripts/lab.mjs), on a thin gap.
 *
 *   npm run plume
 *
 * What was there. On a thin gap the temperature (the velocity's z) was never
 * carried: the thin step skips the velocity's self-advection, so a warm patch
 * stayed where it was laid whatever the liquid did. Its lift rode the
 * half-resolution current, eased 0.98 a step with no clock and capped at 0.75
 * of a cell a step, so a plume's speed was the cap's and not its heat's. The
 * lamp warmed it at 0.24 K/s (a 1 mm layer with no glass) on the look's clock,
 * so a faster Speed heated faster, and Heat Decay cooled it by
 * heatDecay^(4·dt), also on the look's clock. And the field is a half float:
 * at the app's step (dt about 0.003) Classic's cooling took 3e-4 of the heat a
 * step, under half of a half float's last bit (2^-11), so a warm plate rounded
 * back to its own temperature every step and never cooled.
 *
 * Each line asks for a number the physics gives, worked out here in SI:
 *
 *   1. A warm patch rises at Hele-Shaw's speed. Water's density from Kell
 *      (1975) at the room's 20 °C and at 20 °C + ΔT gives the lightness
 *      B = 1 − ρ(T)/ρ(20); a column of it between glasses h apart, standing
 *      up, rises through the reference liquid at B g h²/12ν, and a round
 *      patch has the liquid round it to push aside, half that (Saffman and
 *      Taylor's inclusion; the dish's wall changes it by a²/R², 2.6% here,
 *      inside the tolerance either way the rim is held). A soft patch goes at
 *      ∫B(T)·T/∫T of its own heat: each ring is a sharp patch of its own, and
 *      the flow outside a ring averages to nothing round it (the same account
 *      as `npm run oillift`'s lens). And warm water is runnier (Vogel's
 *      viscosity, which the solver's tempVisc follows: 0.55 of the cold's at
 *      30 K up), so a ring of mobility m against the cold liquid round it
 *      goes at 2m/(1+m) of that half (a sharp patch's exact law, taken ring
 *      by ring; the first cut left it out and read 20% fast at 30 K, 5% at
 *      10 K). At ΔT 30 K and 10 K, to 12%; and the two speeds keep real
 *      water's ratio, not a straight line's (about 4 against 3), to 10%.
 *      The liquid is chosen for a drag time of 0.15 s at whatever the rest
 *      gap is, so the speeds are B g × 0.15 s and the line reads the same at
 *      6 mm or 2 mm; timed from half a second in (three drag times) over the
 *      next second, while the patch has moved under a third of its radius:
 *      a soft patch's middle outruns its edge, and one carried further has
 *      begun to stretch into a plume, which the round patch's law is not.
 *   2. The same patch on a level plate does not move (under 3% of that),
 *      and on a level plate a hand tips by sinθ 0.5 (Plate Rock's input,
 *      not the standing plate's) it rises up the tip at half the standing
 *      speed, to 12%.
 *   3. Buoyancy is a multiple of the real expansion: 0.45 (the default) is
 *      water's own, 0.9 twice it, 1.8 to 2.2 times the speed (at 10 K, where
 *      twice the speed is still under half the patch's radius in the time).
 *   4. The lamp heats at I·a/C. 1000 W/m² at the stage (the projector's heat
 *      filter in), a the share of it the dye takes (Beer–Lambert, one minus
 *      the mean of exp(−absorbance) over the three bands, read back off the
 *      plate), C the heat a square metre of the sandwich holds per kelvin:
 *      water ρc = 4.18 MJ/m³K over the rest gap and two 2 mm glasses at
 *      2.1 MJ/m³K. Three seconds at the dish's middle, to 5%. And in real
 *      seconds: the same three seconds at a Speed four times as fast heat
 *      the same, to 3%.
 *   5. The plate cools by the air and by radiation. Heat Decay is the air
 *      blown over both faces, h = 7200·(−ln v) W/m²K a face (Classic's 0.98
 *      is 145, a projector's fan blowing hard; 0.998 is still air), and each
 *      face radiates εσ((T+ΔT)⁴ − T⁴), ε 0.9. A sheet 10 K warm, three
 *      seconds, the rate −ln(T₁/T₀)/t against the same law integrated here,
 *      to 10%, and the same at four times the Speed and at half the real
 *      seconds a step (twice the steps), to 5%. In still air (Heat Decay 1)
 *      only the radiation is left, the plate 40 K warm: to 10% (at Classic's
 *      air it is 4% of the loss, under that line's tolerance).
 *   6. Updraft is a draught, not a noise (38t): a laminar boundary layer's
 *      stress τ = 0.332 ρ U^1.5 √(ν_air/x) from the edge it enters at. It
 *      is steady (the flow half a second apart within 2%); by the edge it
 *      comes in at it blows the liquid the way the air goes, along −v, at
 *      over a fifth of the dish's mean speed (how fast, and how the closed
 *      dish's return flow shares it with the middle, has no simple form for
 *      an x^-½ stress, so the size is not asked: the first cut asked the edge
 *      to outrun the middle and read 1.67e-2 against 1.92e-2); and it grows
 *      as U^1.5: Updraft 1 against
 *      0.25 moves the liquid 8 times as fast, to 12% (the noise it replaces
 *      grew as U, 4 times). The 1.5 is the boundary layer's, written in the
 *      step: this line holds the solver to it, not the law to the air.
 *   7. And it cools where it enters: the top face loses
 *      h = 0.332 k Pr^⅓ √(U/ν x)/x more, so a sheet a tenth of the plate in
 *      from the edge the air comes over cools √5 times as fast (over the
 *      still plate's own loss) as one in the middle, to 25%, and each to
 *      15% of the law's number. On a sheet
 *      evenly 40 K warm in a liquid a thousand times water's, so the
 *      draught's own flow carries no heat past the points read (in the
 *      test's first cut, at the rise's 12 cSt, the flow brought warmer
 *      liquid in and read four times the loss).
 *   And any GPU validation error fails the run: a pass that never ran would
 *   read as stillness.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI, a
 * Linux box's software WebGPU anywhere else (PW_WEBGPU=1).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const G = 9.81;
const ROOM = 20;                       // °C
const RHOC_WATER = 4.18e6;             // J/m³K
const RHOC_GLASS = 2500 * 840;         // soda-lime, J/m³K
const GLASS = 2e-3;                    // each of the two glasses, m
const LAMP = 1000;                     // W/m² at the stage, heat filter in
const EPS = 0.9, SIGMA = 5.670e-8;
const AIR = { rho: 1.2, nu: 1.5e-5, k: 0.026, pr: 0.71 };
const UPDRAFT = 3;                     // m/s at Updraft 1
const TAU_DRAG = 0.15;                 // s, the patch's liquid

// Water's density, kg/m³ (Kell 1975), as src/lib/lampBoil.ts has it.
const kell = (t) => (999.83952 + 16.945176 * t - 7.9870401e-3 * t * t - 46.170461e-6 * t ** 3
  + 105.56302e-9 * t ** 4 - 280.54253e-12 * t ** 5) / (1 + 16.879850e-3 * t);
const lightness = (dT) => 1 - kell(ROOM + Math.max(0, dT)) / kell(ROOM);
// Water's viscosity, Pa·s (Vogel), as lampBoil has it; warm water is runnier, so it moves more easily.
const vogel = (t) => 2.414e-5 * 10 ** (247.8 / (t + 273.15 - 140));
const runnier = (dT) => vogel(ROOM) / vogel(ROOM + Math.max(0, dT));

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
let r;
try {
  const consts = await page.evaluate(() => ({ gap: lab.REST_GAP * lab.PLATE_METRES, plate: lab.PLATE_METRES, step: lab.stepSeconds }));
  const nu = consts.gap ** 2 / (12 * TAU_DRAG);
  const thickness = Math.log10(nu / 1e-6) / 3;
  r = await page.evaluate(async ({ thickness }) => {
    const out = {};
    const inDish = (i, j, n) => Math.hypot((i + 0.5) / n - 0.5, (j + 0.5) / n - 0.5) < 0.5;
    const temps = async (n) => {
      const v = await lab.field('vel');
      const t = new Float32Array(n * n);
      for (let k = 0; k < n * n; k++) t[k] = v[k * 4 + 2];
      return t;
    };
    // The heat's centroid up the plate, and its cells for the soft patch's ∫B·T/∫T.
    const patch = (t, n) => {
      let s = 0, y = 0;
      const cells = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const T = t[i + j * n];
        if (!inDish(i, j, n) || T <= 0.01) continue;
        s += T; y += T * (j + 0.5) / n; cells.push(T);
      }
      return { y: y / Math.max(s, 1e-9), cells };
    };
    // The mean over a disc of the plate.
    const disc = (t, n, x, y, r) => {
      let s = 0, c = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        if (Math.hypot((i + 0.5) / n - x, (j + 0.5) / n - y) >= r) continue;
        s += t[i + j * n]; c++;
      }
      return s / Math.max(c, 1);
    };
    const base = { thinGap: 1, gapThickness: thickness, gapSpring: 0, diff: 0, dimmer: 0, heatDecay: 1, gravityX: 0, gravityY: -1 };

    // 1–3. A warm patch, standing up and level.
    const N = 128;
    for (const [name, dT, over] of [['rise30', 30, { plateUpright: 1, buoyancy: 0.45 }], ['rise10', 10, { plateUpright: 1, buoyancy: 0.45 }],
      ['level', 30, { plateUpright: 0, buoyancy: 0.45 }], ['dial', 10, { plateUpright: 1, buoyancy: 0.9 }], ['rock', 10, { plateUpright: 0, rockY: -0.5, buoyancy: 0.45 }]]) {
      await lab.create(N, N);
      lab.vel(0.5, 0.35, 0.08, [0, 0, dT, 0]);
      lab.flush();
      await lab.step(30, { ...base, ...over });
      const a = patch(await temps(N), N);
      await lab.step(60, { ...base, ...over });
      const b = patch(await temps(N), N);
      out[name] = { y0: a.y, y1: b.y, cellsA: a.cells, cellsB: b.cells };
    }

    // 4. The lamp through a dark dye, at two Speeds.
    for (const [name, dt] of [['heat', 0.004], ['heatFast', 0.016]]) {
      await lab.create(N, N);
      lab.dye(0.5, 0.5, 0.45, [1, 1, 1], 1.0);
      lab.flush();
      await lab.step(1, { ...base, dimmer: 1, dt });
      const t0 = disc(await temps(N), N, 0.5, 0.5, 0.03);
      const d0 = await lab.field('dye');
      await lab.step(180, { ...base, dimmer: 1, dt });
      const t1 = disc(await temps(N), N, 0.5, 0.5, 0.03);
      const d1 = await lab.field('dye');
      // The share the dye takes, as Beer–Lambert decodes it (one minus the bands' mean transmission).
      const take = (d) => {
        let s = 0, c = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          if (Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) >= 0.03) continue;
          const k = (i + j * N) * 4;
          if (d[k + 3] <= 1e-4) { c++; continue; }
          s += 1 - (Math.exp(-Math.max(0, d[k])) + Math.exp(-Math.max(0, d[k + 1])) + Math.exp(-Math.max(0, d[k + 2]))) / 3; c++;
        }
        return s / Math.max(c, 1);
      };
      out[name] = { t0, t1, a: (take(d0) + take(d1)) / 2, steps: 180 };
    }

    // 5. A warm sheet under Classic's air, at two Speeds.
    // And at half the real seconds a step (the frame loop's own magnetSeconds), twice the steps.
    for (const [name, dt, sec, steps] of [['cool', 0.004, 1 / 60, 180], ['coolFast', 0.016, 1 / 60, 180], ['coolHalf', 0.004, 1 / 120, 360]]) {
      await lab.create(N, N);
      lab.vel(0.5, 0.5, 2.0, [0, 0, 10, 0]);
      lab.flush();
      await lab.step(1, { ...base, heatDecay: 0.98, dt, magnetSeconds: sec });
      const t0 = disc(await temps(N), N, 0.5, 0.5, 0.08);
      await lab.step(steps, { ...base, heatDecay: 0.98, dt, magnetSeconds: sec });
      const t1 = disc(await temps(N), N, 0.5, 0.5, 0.08);
      out[name] = { t0, t1, seconds: steps * sec };
    }

    // 6. Updraft on a still plate: its flow at two moments, and at a quarter of the air.
    const speed = (v, n) => {
      let s = 0, c = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        if (!inDish(i, j, n)) continue;
        const k = (i + j * n) * 4;
        s += Math.hypot(v[k], v[k + 1]); c++;
      }
      return s / Math.max(c, 1);
    };
    {
      await lab.create(N, N);
      await lab.step(60, { ...base, air: 1 });
      const a = await lab.field('vel');
      await lab.step(30, { ...base, air: 1 });
      const b = await lab.field('vel');
      let diff = 0, sum = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (!inDish(i, j, N)) continue;
        const k = (i + j * N) * 4;
        diff += Math.hypot(b[k] - a[k], b[k + 1] - a[k + 1]); sum += Math.hypot(a[k], a[k + 1]);
      }
      await lab.create(N, N);
      await lab.step(60, { ...base, air: 0.25 });
      const q = await lab.field('vel');
      // Where and which way: the mean flow along v near the edge the air comes in at, and the speed in the middle.
      let ev = 0, ec = 0, ms = 0, mc = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = (i + 0.5) / N, y = (j + 0.5) / N, k = (i + j * N) * 4;
        if (Math.hypot(x - 0.5, y - 0.88) < 0.05) { ev += a[k + 1]; ec++; }
        if (Math.hypot(x - 0.5, y - 0.5) < 0.05) { ms += Math.hypot(a[k], a[k + 1]); mc++; }
      }
      out.updraft = { change: diff / Math.max(sum, 1e-12), full: speed(a, N), quarter: speed(q, N), edgeV: ev / Math.max(ec, 1), middle: ms / Math.max(mc, 1) };
    }

    // 7. Updraft's cooling, a tenth of the plate in from the edge it enters at and in the middle.
    {
      const n = 64;
      const at = {};
      for (const air of [0, 1]) {
        await lab.create(n, n);
        lab.vel(0.5, 0.5, 50, [0, 0, 40, 0]);
        lab.flush();
        await lab.step(1, { ...base, gapThickness: 1, air });
        const a = await temps(n);
        await lab.step(600, { ...base, gapThickness: 1, air });
        const b = await temps(n);
        // The air comes in over the rim at the top of the plate's v (it blows toward −v).
        at[air] = { edge: [disc(a, n, 0.5, 0.9, 0.04), disc(b, n, 0.5, 0.9, 0.04)], middle: [disc(a, n, 0.5, 0.5, 0.04), disc(b, n, 0.5, 0.5, 0.04)], steps: 600 };
      }
      out.updraftCool = at;
    }
    return out;
  }, { thickness });

  const h = consts.gap, plate = consts.plate, s = consts.step;
  const C = RHOC_WATER * h + 2 * RHOC_GLASS * GLASS;
  // Each ring's lightness, and its mobility m against the cold liquid round it: a sharp patch of
// mobility m goes at 2m/(1+m) of the half (Darcy's inclusion), taken ring by ring.
const meanB = (cells) => cells.reduce((a, T) => a + lightness(T) * (2 * runnier(T) / (1 + runnier(T))) * T, 0) / Math.max(cells.reduce((a, T) => a + T, 0), 1e-9);

  // 1–3.
  const rise = (o, dial = 1) => {
    const soft = (meanB(o.cellsA) + meanB(o.cellsB)) / 2;
    return { got: (o.y1 - o.y0) * plate / (60 * s), want: 0.5 * soft * G * h * h / (12 * nu) * dial };
  };
  const r30 = rise(r.rise30), r10 = rise(r.rise10), lv = rise(r.level), dl = rise(r.dial, 2), rk = rise(r.rock, 0.5);
  const mm = (x) => `${(x * 1000).toFixed(2)} mm/s`;
  check('a patch 30 K warm rises at Hele-Shaw\'s speed from water\'s real density and viscosity', Math.abs(r30.got / r30.want - 1) < 0.12,
    `${mm(r30.got)} against ${mm(r30.want)} (${(r30.got / r30.want).toFixed(3)}), gap ${(h * 1000).toFixed(1)} mm, ν ${(nu * 1e6).toFixed(1)} cSt`);
  check('a patch 10 K warm, the same law', Math.abs(r10.got / r10.want - 1) < 0.12,
    `${mm(r10.got)} against ${mm(r10.want)} (${(r10.got / r10.want).toFixed(3)})`);
  const ratio = r30.got / Math.max(r10.got, 1e-12), wantRatio = r30.want / r10.want;
  // The alternative it tells apart: water's expansion at the room's 20 °C held for every ΔT, with the same viscosity.
  const beta = (kell(ROOM - 0.5) - kell(ROOM + 0.5)) / kell(ROOM);
  const linB = (cells) => cells.reduce((a, T) => a + beta * T * (2 * runnier(T) / (1 + runnier(T))) * T, 0) / Math.max(cells.reduce((a, T) => a + T, 0), 1e-9);
  const linRatio = (linB(r.rise30.cellsA) + linB(r.rise30.cellsB)) / (linB(r.rise10.cellsA) + linB(r.rise10.cellsB));
  check('and the two keep real water\'s ratio, not a straight line\'s', Math.abs(ratio / wantRatio - 1) < 0.1,
    `${ratio.toFixed(2)} against ${wantRatio.toFixed(2)} from Kell and Vogel (20 °C's expansion held constant would give ${linRatio.toFixed(2)})`);
  check('a level plate does not lift it', Math.abs(lv.got) < 0.03 * r30.want, `${mm(lv.got)} (${(lv.got / r30.want * 100).toFixed(1)}% of standing)`);
  check('a plate tipped by a hand (sinθ 0.5) lifts it uphill at half the standing speed', rk.got > 0 && Math.abs(rk.got / rk.want - 1) < 0.12,
    `${mm(rk.got)} against ${mm(rk.want)} (${(rk.got / rk.want).toFixed(3)}), up the tip`);
  check('Buoyancy 0.9 is twice water\'s expansion', dl.got / r10.got > 1.8 && dl.got / r10.got < 2.2, `${(dl.got / r10.got).toFixed(3)} times 0.45's speed, at 10 K`);

  // 4.
  const heatWant = (o) => LAMP * o.a * (o.steps * s) / C;
  const hw = heatWant(r.heat), hg = r.heat.t1 - r.heat.t0, hf = r.heatFast.t1 - r.heatFast.t0;
  check('the lamp heats at I·a/C, the sandwich\'s heat capacity', Math.abs(hg / hw - 1) < 0.05,
    `${hg.toFixed(4)} K in ${(r.heat.steps * s).toFixed(1)} s against ${hw.toFixed(4)} (a ${r.heat.a.toFixed(3)}, C ${(C / 1000).toFixed(1)} kJ/m²K)`);
  check('in real seconds, whatever the Speed', Math.abs(hf / hg - 1) < 0.03, `${hf.toFixed(4)} K at four times the Speed against ${hg.toFixed(4)}`);

  // 5. The law integrated in small steps.
  const coolWant = (T0, seconds, hAir) => {
    let T = T0;
    const k = 293.15, n = 3000, d = seconds / n;
    for (let i = 0; i < n; i++) T -= d * (2 * hAir * T + 2 * EPS * SIGMA * ((k + T) ** 4 - k ** 4)) / C;
    return T;
  };
  const hAir = 7200 * -Math.log(0.98);
  const rate = (o) => -Math.log(o.t1 / o.t0) / o.seconds;
  const cw = -Math.log(coolWant(r.cool.t0, r.cool.seconds, hAir) / r.cool.t0) / r.cool.seconds;
  check('Heat Decay is the air on both faces, with radiation', Math.abs(rate(r.cool) / cw - 1) < 0.1,
    `${(rate(r.cool) * 1000).toFixed(2)}/ks against ${(cw * 1000).toFixed(2)}/ks (τ ${(1 / cw).toFixed(0)} s; ${r.cool.t0.toFixed(3)} → ${r.cool.t1.toFixed(3)} K)`);
  check('cooling in real seconds, whatever the Speed', Math.abs(rate(r.coolFast) / rate(r.cool) - 1) < 0.05,
    `${(rate(r.coolFast) * 1000).toFixed(2)}/ks at four times the Speed against ${(rate(r.cool) * 1000).toFixed(2)}/ks`);
  check('and whatever the real seconds a step stands for', Math.abs(rate(r.coolHalf) / rate(r.cool) - 1) < 0.05,
    `${(rate(r.coolHalf) * 1000).toFixed(2)}/ks at 1/120 s a step against ${(rate(r.cool) * 1000).toFixed(2)}/ks at 1/60`);
  // Still air (Heat Decay 1, Updraft's still run below): what is left is the glass's radiation.
  {
    const o = r.updraftCool[0], sec = o.steps * s, T0 = o.middle[0];
    const got = -Math.log(o.middle[1] / T0) / sec, want = -Math.log(coolWant(T0, sec, 0) / T0) / sec;
    check('in still air the glass still radiates, εσ(T⁴ − T_room⁴) a face', Math.abs(got / want - 1) < 0.1,
      `${(got * 1e4).toFixed(2)} against ${(want * 1e4).toFixed(2)} per 10 ks at ${T0.toFixed(1)} K warm`);
  }

  // 6.
  check('Updraft is steady, not a noise', r.updraft.change < 0.02 && r.updraft.full > 0,
    `flow changed ${(r.updraft.change * 100).toFixed(2)}% in half a second (mean speed ${r.updraft.full.toExponential(2)})`);
  check('it blows the liquid the way the air goes, by the edge it comes in at', r.updraft.edgeV < -0.2 * r.updraft.full,
    `along v ${r.updraft.edgeV.toExponential(2)} by the edge, speed ${r.updraft.middle.toExponential(2)} in the middle`);
  const u15 = r.updraft.full / Math.max(r.updraft.quarter, 1e-12);
  check('Updraft drives the liquid as U^1.5, a boundary layer\'s stress', Math.abs(u15 / 8 - 1) < 0.12, `${u15.toFixed(2)} times at four times the air (8 wanted; the noise was 4)`);

  // 7.
  const uc = r.updraftCool;
  const local = (o, where) => -Math.log(o[where][1] / o[where][0]) / (o.steps * s);
  const extraEdge = local(uc[1], 'edge') - local(uc[0], 'edge'), extraMid = local(uc[1], 'middle') - local(uc[0], 'middle');
  // From where the air comes over the rim along the middle line: x = 0.1 and 0.5 of the plate.
  const hForced = (x) => 0.332 * AIR.k * AIR.pr ** (1 / 3) * Math.sqrt(UPDRAFT / (AIR.nu * x)) ;
  const wantEdge = hForced(0.1 * plate) / C, wantMid = hForced(0.5 * plate) / C;
  check('Updraft cools the face it blows over, most where it comes in', Math.abs((extraEdge / extraMid) / (wantEdge / wantMid) - 1) < 0.25 && Math.abs(extraMid / wantMid - 1) < 0.15 && Math.abs(extraEdge / wantEdge - 1) < 0.15,
    `edge ${(extraEdge * 1e4).toFixed(2)}, middle ${(extraMid * 1e4).toFixed(2)} per 10 ks against ${(wantEdge * 1e4).toFixed(2)} and ${(wantMid * 1e4).toFixed(2)}`);
} finally {
  await close();
}
check('no GPU pass failed validation', gpuErrors.length === 0, gpuErrors.join(', '));

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\nFAIL: ${failed.length} of ${checks.length}` : `\nok: all ${checks.length}`);
process.exit(failed.length ? 1 : 0);
