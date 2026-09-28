#!/usr/bin/env node
/**
 * The plate as a Hele-Shaw cell (PLAN §18a): with Thin Gap on, does the
 * liquid between the glasses move as a thin layer of liquid does? Measured on
 * the GPU solver alone (scripts/lab.mjs).
 *
 *   npm run thingap
 *
 * What was there: the velocity was clamped to MAX_SPEED at the end of every
 * step, so a push lasted one step whatever the liquid, a press's source was
 * balanced by a uniform sink over the whole plate, and the projection made
 * the velocity divergence-free where it is the flux h·u that has to be. Thin
 * Gap replaces those with the physics of two glasses a few millimetres apart
 * (src/gpu/wgsl/thinGap.ts): drag 12ν/h², a projection with the mobility
 * h³/12μ, and an open rim. Each check below asks for a consequence of that
 * physics with a number the physics gives, and each has the old solver
 * beside it as the control, so a check that passes on the old solver too
 * would say so.
 *
 *   1. A push lasts the drag time. A uniform push across the plate decays by
 *      1/(1 + kΔt) a step, k = 12ν/h² at the rest gap (0.03 of a 0.2 m
 *      plate), at two thicknesses, to 3%: the rate is fitted to the speed
 *      in the middle of the plate over ten steps. And on a plate pressed
 *      evenly to half the gap, four times the rate, to 3%: the drag goes as
 *      1/h², which is the claim everything else here rests on. A disc of dye
 *      carried by the push goes as far as the thickness says: the thin
 *      liquid's travel over the thick's is the ratio of their drag rates, to
 *      5%. The old solver carries it under a twentieth as far as the thick
 *      one (its clamp cuts the push to MAX_SPEED at the end of the first
 *      step: 0.0006 of the plate against 0.03, measured). And a hand held
 *      pushing at one speed moves the water at that speed, to 5%, not at the
 *      sum of every step's push (what adding them would give is printed:
 *      about fifty times the push after sixty steps of water).
 *   2. A press pushes out the liquid it displaces. A ring of dye round a
 *      press (laid over ten steps, as a hand lays one) moves out to where the
 *      ring's area between the old and new radius, times the gap, is the
 *      volume the glass displaced:
 *      r₁² = r₀² + V/(πh). To 10% of that shift. And the dye is all still
 *      there, to 3%: the ring's, which the flow round the press moves without
 *      spreading it, and a disc's laid under the press itself, where the
 *      liquid leaves a closing gap and the dye has to go with it without
 *      being made or lost (the carries are off: no tool touches either). The
 *      old solver moves the ring by whatever its sink and its squeeze memory
 *      leave, printed: measured, 3.6 times the displaced volume's shift.
 *   3. And takes it back when the glass lifts. Flow this slow is reversible
 *      (Stokes): when the spring brings the gap back to rest (Σ|h − h₀| under
 *      a twentieth of the dent's), the liquid that left comes back, the ring
 *      returns to within 15% of its shift of where it started, and the disc
 *      under the press holds its dye to 3%. On the old solver the ring ended
 *      well inside where it began (0.13 of the plate, measured), drawn in by
 *      the sink. Checks 2 and 3 run on two grids: 128, whose multigrid halves
 *      evenly to the bottom, and 130, whose one coarse level is odd (65).
 *   4. A tight gap carries less. A disc where the glass is pressed to the
 *      floor (0.004 against 0.03) in a uniform flow: Darcy's inclusion says
 *      the flux through it over the flux there without it is 2λ/(1 + λ),
 *      λ the ratio of their mobilities h·c (h³ for a thick liquid). To 40%,
 *      on a disc ten cells across whose edge is a cell wide and a rim a few
 *      radii off: the grid's own error, not the solve's (more V-cycles move
 *      it by 1%), and at a λ this small the disc's stepped edge is most of
 *      what gets through. So it is asked again of water, whose λ is five
 *      times the oil's, to 10%: there a mobility that forgot the drag (h
 *      alone) would be 27% high and one with nothing but it (h³) 97% low.
 *      The old solver, divergence-free in u, carries the same velocity
 *      through it and so the gap ratio of flux, printed; the check asks the
 *      thin gap's to be under half of that as well.
 *   5. Liquid is conserved where the gap changes. On a domed plate (the rim
 *      tighter than the middle) stirred by turbulence and spin and a lasting
 *      current, the flux's divergence ∇·(hu) over the flux, averaged over the
 *      dish, at its worst over twelve samples 50 steps apart: under 0.005 and
 *      under a fifth of the old solver's, for water and for glycerine. A
 *      field that had died or been zeroed would score 0 here, so the flow
 *      has to be there to be measured: from five seconds on (water takes its
 *      drag time, three seconds, to come up to the stir's speed from rest)
 *      the flux is at least three tenths of the old solver's at every
 *      sample, and at every sample the fastest cell is no more
 *      than five times the old solver's fastest (a blow-up is wiped to zero
 *      by safeVel, so it shows as a dead field, not a non-finite one).
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

const { page, close } = await openLab();
try {
  const r = await page.evaluate(async () => {
    const out = {};
    // The plate's rest gap in metres, and the drag rate a Thickness gives there (fluid.ts).
    const H = 0.03 * 0.2;
    const nuOf = (t) => 1e-6 * Math.pow(10, 3 * t);
    const kOf = (t, gap = H) => 12 * nuOf(t) / (gap * gap);
    const SECONDS = 1 / 60;
    const dishOf = (N) => (i, j) => Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5);
    let N = 128;
    let dish = dishOf(N);
    const centre = async () => (await lab.field('vel'))[(N / 2 + (N / 2) * N) * 4];

    // 1. A push lasts the drag time.
    const push = {};
    for (const [name, over] of [['old', { gapSpring: 0 }], ['thin', { thinGap: 1, gapThickness: 0.3, gapSpring: 0 }], ['thick', { thinGap: 1, gapThickness: 0.45, gapSpring: 0 }]]) {
      await lab.create(N, N);
      lab.dye(0.3, 0.5, 0.05, [1, 0, 0], 1); lab.flush();
      await lab.step(2, over);
      const cx = async () => { const d = await lab.field('dye'); let s = 0, w = 0; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = d[(i + j * N) * 4 + 3]; s += a * (i + 0.5) / N; w += a; } return s / w; };
      const x0 = await cx();
      lab.vel(0.5, 0.5, 5, [1, 0, 0, 0]); lab.flush();
      const speeds = [];
      for (let k = 0; k < 11; k++) { await lab.step(1, over); speeds.push(await centre()); }
      await lab.step(160, over);
      push[name] = { speeds, travel: (await cx()) - x0 };
    }
    // The same thin liquid on a plate pressed evenly to half the rest gap.
    {
      const over = { thinGap: 1, gapThickness: 0.3, gapSpring: 0 };
      await lab.create(N, N);
      await lab.step(1, over);
      lab.vel(0.5, 0.5, 5, [0, 0, 0, -0.015]); lab.flush();
      await lab.step(40, over);
      const sq = await lab.squeeze();
      lab.vel(0.5, 0.5, 5, [1, 0, 0, 0]); lab.flush();
      const speeds = [];
      for (let k = 0; k < 11; k++) { await lab.step(1, over); speeds.push(await centre()); }
      push.halved = { speeds, gap: sq.gap[sq.n / 2 + (sq.n / 2) * sq.n] };
    }
    // A hand held still, pushing the water at one speed for sixty steps.
    {
      const over = { thinGap: 1, gapThickness: 0, gapSpring: 0 };
      await lab.create(N, N);
      await lab.step(1, over);
      for (let k = 0; k < 60; k++) { lab.vel(0.5, 0.5, 0.1, [0.5, 0, 0, 0]); lab.flush(); await lab.step(1, over); }
      const c = 1 / (1 + kOf(0) * SECONDS);
      push.held = { speed: await centre(), want: 0.5, added: 0.5 * (1 - Math.pow(c, 60)) / (1 - c) };
    }
    out.push = push;

    // 2 and 3. A press pushes out what it displaces, and takes it back: on two grids.
    out.press = {};
    for (const size of [128, 130]) {
      N = size; dish = dishOf(N);
      const press = {};
      for (const [name, over] of [['old', { gapSpring: 0, gapMemory: 0.85 }], ['thin', { thinGap: 1, gapThickness: 0.45, gapSpring: 0, gapMemory: 0.85 }]]) {
        await lab.create(N, N);
        const r0 = 0.2;
        // A ring round the press in red, a disc under it in green.
        const lay = new Array(N * N * 4).fill(0);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const k = (i + j * N) * 4;
          if (Math.abs(dish(i, j) - r0) < 0.008) { lay[k] = 1; lay[k + 3] = 1; }
          if (dish(i, j) < 0.08) { lay[k + 1] = 1; lay[k + 3] = 1; }
        }
        lab.addDye(lay); lab.flush();
        await lab.step(2, over);
        const channels = async () => {
          const d = await lab.field('dye'); let s = 0, w = 0, g = 0;
          for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = (i + j * N) * 4; if (d[k] > 0) { s += d[k] * dish(i, j); w += d[k]; } g += d[k + 1]; }
          return { radius: s / w, red: w, green: g };
        };
        const gapOff = async () => { const sq = await lab.squeeze(); let v = 0, a = 0; for (let k = 0; k < sq.gap.length; k++) { v += (0.03 - sq.gap[k]) / (sq.n * sq.n); a += Math.abs(0.03 - sq.gap[k]) / (sq.n * sq.n); } return { v, a }; };
        const c0 = await channels();
        // Pressed over ten steps, a sixth of a second, as a hand lays a Press a
        // step at a time (lib/squish.ts), then ten more to let it settle.
        for (let k = 0; k < 10; k++) { lab.vel(0.5, 0.5, 0.15, [0, 0, 0, -0.0025]); lab.flush(); await lab.step(1, over); }
        await lab.step(10, over);
        const g1 = await gapOff();
        const c1 = await channels();
        // Let the glass come back: the spring at a twentieth a step, 300 steps.
        await lab.step(300, { ...over, gapSpring: 0.05 });
        const g2 = await gapOff();
        const c2 = await channels();
        press[name] = { c0, c1, c2, V: g1.v, A1: g1.a, A2: g2.a, expect: Math.sqrt(c0.radius * c0.radius + g1.v / (Math.PI * 0.03)) };
      }
      out.press[size] = press;
    }
    N = 128; dish = dishOf(N);

    // 4. A tight gap carries less: the light oil, and water.
    const dent = {};
    for (const [name, over] of [['old', { gapSpring: 0 }], ['thin', { thinGap: 1, gapThickness: 0.45, gapSpring: 0 }], ['water', { thinGap: 1, gapThickness: 0, gapSpring: 0 }]]) {
      dent[name] = {};
      for (const pressed of [false, true]) {
        await lab.create(N, N);
        await lab.step(1, over);
        if (pressed) { lab.vel(0.5, 0.5, 0.08, [0, 0, 0, -0.2]); lab.flush(); }
        // Long enough for the press's own flow to be gone before the push.
        await lab.step(40, over);
        lab.vel(0.5, 0.5, 5, [1, 0, 0, 0]); lab.flush();
        await lab.step(1, over);
        const v = await lab.field('vel'); const sq = await lab.squeeze();
        let q = 0, h = 0, n = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          if (dish(i, j) >= 0.04) continue;
          const k = i + j * N; q += sq.gap[k] * v[k * 4]; h += sq.gap[k]; n++;
        }
        dent[name][pressed ? 'pressed' : 'open'] = { q: q / n, h: h / n };
      }
    }
    // λ for each thin run: h·c inside against outside, c = 1/(1 + kΔt).
    const lambdaOf = (t) => (0.004 / (1 + kOf(t, 0.004 * 0.2) * SECONDS)) / (0.03 / (1 + kOf(t) * SECONDS));
    dent.lambda = { thin: lambdaOf(0.45), water: lambdaOf(0) };
    out.dent = dent;

    // 5. Liquid is conserved where the gap changes.
    const stir = { turbScale: 1, turbDetail: 3, spin: 0.03, plateCurve: 0.8, gapSpring: 0.02, twist: 0.02, currentGrav: 0.02, maxCurrent: 0.05 };
    const cons = {};
    for (const [name, over] of [['old', stir], ['water', { ...stir, thinGap: 1, gapThickness: 0 }], ['glycerine', { ...stir, thinGap: 1, gapThickness: 1 }]]) {
      await lab.create(N, N);
      for (let k = 0; k < 7; k++) lab.dye(0.3 + 0.4 * ((k * 0.37) % 1), 0.3 + 0.4 * ((k * 0.61) % 1), 0.07, [1, 0.5, 0.2], 1);
      lab.flush();
      const samples = [];
      for (let round = 0; round < 12; round++) {
        await lab.step(50, over);
        const v = await lab.field('vel'); const sq = await lab.squeeze();
        const at = (i, j) => Math.min(N - 1, Math.max(0, i)) + Math.min(N - 1, Math.max(0, j)) * N;
        const hu = (i, j, c) => sq.gap[at(i, j)] * v[at(i, j) * 4 + c];
        let div = 0, flux = 0, fastest = 0;
        for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
          if (dish(i, j) > 0.45) continue;
          div += Math.abs(0.5 * (hu(i + 1, j, 0) - hu(i - 1, j, 0) + hu(i, j + 1, 1) - hu(i, j - 1, 1)));
          flux += Math.hypot(hu(i, j, 0), hu(i, j, 1));
          const s = Math.hypot(v[at(i, j) * 4], v[at(i, j) * 4 + 1]);
          fastest = Number.isFinite(s) ? Math.max(fastest, s) : Infinity;
        }
        samples.push({ ratio: flux > 0 ? div / flux : Infinity, flux, fastest });
      }
      cons[name] = samples;
    }
    out.cons = cons;
    out.k = { thin: kOf(0.3), thick: kOf(0.45) };
    return out;
  });

  // THINGAP_DEBUG=1 prints every sample check 5 took.
  if (process.env.THINGAP_DEBUG) console.log(JSON.stringify(r.cons, (k, v) => typeof v === 'number' ? +v.toPrecision(3) : v));
  // 1.
  const decay = (s) => Math.exp(Math.log(s[10] / s[0]) / 10);
  for (const name of ['thin', 'thick']) {
    const k = name === 'thin' ? r.k.thin : r.k.thick;
    const got = decay(r.push[name].speeds);
    const rateGot = 1 / got - 1, rateWant = k / 60;
    check(`a push on the ${name === 'thin' ? 'thinner' : 'thicker'} liquid fades at its drag rate, 12ν/h² at the rest gap`,
      Math.abs(rateGot / rateWant - 1) < 0.03,
      `kΔt ${rateGot.toFixed(4)} a step against ${rateWant.toFixed(4)}; ${r.push[name].speeds[0].toFixed(3)} → ${r.push[name].speeds[10].toFixed(3)} over ten steps`);
  }
  {
    const h = r.push.halved;
    const rateGot = 1 / decay(h.speeds) - 1, rateWant = (r.k.thin / 60) * Math.pow(0.03 / h.gap, 2);
    check('and where the glass is pressed to half the gap, four times as fast: the drag goes as 1/h²',
      Math.abs(rateGot / rateWant - 1) < 0.03,
      `kΔt ${rateGot.toFixed(4)} a step against ${rateWant.toFixed(4)} (gap ${h.gap.toFixed(4)}), ${(rateGot / (r.k.thin / 60)).toFixed(2)}× the rest gap's`);
  }
  const ratio = r.push.thin.travel / r.push.thick.travel;
  check('and the thin liquid carries its dye as much further as its drag is slower',
    Math.abs(ratio / (r.k.thick / r.k.thin) - 1) < 0.05,
    `travel ${r.push.thin.travel.toFixed(4)} against ${r.push.thick.travel.toFixed(4)} of the plate, ×${ratio.toFixed(2)} against ×${(r.k.thick / r.k.thin).toFixed(2)}`);
  check('where the old solver carried it under a twentieth as far as even the thick one',
    Math.abs(r.push.old.travel) < 0.05 * r.push.thick.travel,
    `old ${r.push.old.travel.toFixed(5)} of the plate`);
  {
    const h = r.push.held;
    check('a hand held pushing at one speed moves the water at that speed, not at the sum of its pushes',
      Math.abs(h.speed / h.want - 1) < 0.05,
      `${h.speed.toFixed(4)} after sixty steps against ${h.want}; adding each step's push would have reached ${h.added.toFixed(1)}`);
  }

  // 2 and 3.
  for (const size of Object.keys(r.press)) {
    const p = r.press[size].thin, o = r.press[size].old;
    const at = ` (${size}²)`;
    const shift = p.expect - p.c0.radius;
    check(`a press pushes its ring out to r² = r₀² + V/πh, the volume the glass displaced${at}`,
      Math.abs((p.c1.radius - p.c0.radius) / shift - 1) < 0.1,
      `ring ${p.c0.radius.toFixed(4)} → ${p.c1.radius.toFixed(4)}, displaced volume puts it at ${p.expect.toFixed(4)} (${((p.c1.radius - p.c0.radius) / shift * 100).toFixed(0)}% of the shift); the old solver moved it ${(o.c1.radius - o.c0.radius).toFixed(4)} (${((o.c1.radius - o.c0.radius) / (o.expect - o.c0.radius) * 100).toFixed(0)}%)`);
    const pct = (a, b) => `${((b / a - 1) * 100).toFixed(1)}%`;
    check(`and every drop of the dye is still there, round the press and under it${at}`,
      Math.abs(p.c1.red / p.c0.red - 1) < 0.03 && Math.abs(p.c1.green / p.c0.green - 1) < 0.03,
      `ring ${p.c0.red.toFixed(1)} → ${p.c1.red.toFixed(1)} (${pct(p.c0.red, p.c1.red)}), under the press ${p.c0.green.toFixed(1)} → ${p.c1.green.toFixed(1)} (${pct(p.c0.green, p.c1.green)}); the old solver's under the press ${pct(o.c0.green, o.c1.green)}`);
    check(`when the glass lifts the liquid comes back, and the ring and the dye with it${at}`,
      p.A2 < 0.05 * p.A1 && Math.abs(p.c2.radius - p.c0.radius) < 0.15 * (p.c1.radius - p.c0.radius) && Math.abs(p.c2.green / p.c0.green - 1) < 0.03,
      `ring ${p.c1.radius.toFixed(4)} → ${p.c2.radius.toFixed(4)} against ${p.c0.radius.toFixed(4)} before (${((p.c2.radius - p.c0.radius) / (p.c1.radius - p.c0.radius) * 100).toFixed(0)}% of the shift left); under the press ${pct(p.c0.green, p.c2.green)} of its dye; Σ|h − h₀| ${p.A1.toExponential(2)} → ${p.A2.toExponential(2)}; the old solver's ring ended ${(o.c2.radius - o.c0.radius).toFixed(4)} from where it began and kept ${pct(o.c0.green, o.c2.green)} under the press`);
  }

  // 4.
  const darcy = (lam) => 2 * lam / (1 + lam);
  const flow = (d) => d.pressed.q / d.open.q;
  const thinRatio = flow(r.dent.thin), waterRatio = flow(r.dent.water), oldRatio = flow(r.dent.old);
  const want = darcy(r.dent.lambda.thin), wantWater = darcy(r.dent.lambda.water);
  check('a disc pressed tight carries the flux Darcy says, 2λ/(1+λ) of the open plate\'s',
    Math.abs(thinRatio / want - 1) < 0.4 && thinRatio < 0.5 * oldRatio,
    `${thinRatio.toFixed(4)} against ${want.toFixed(4)} (λ ${r.dent.lambda.thin.toFixed(4)}); the old solver's ${oldRatio.toFixed(4)}, the gap ratio ${(r.dent.old.pressed.h / r.dent.old.open.h).toFixed(4)}`);
  {
    // What water's λ would be with a mobility that forgot the drag (h alone) or had nothing but it (h³).
    const hOnly = darcy(0.004 / 0.03), hCubed = darcy(Math.pow(0.004 / 0.03, 3));
    check('and water, whose drag is weaker, carries through it what its λ says, the drag counted',
      Math.abs(waterRatio / wantWater - 1) < 0.1,
      `${waterRatio.toFixed(4)} against ${wantWater.toFixed(4)} (λ ${r.dent.lambda.water.toFixed(4)}); a mobility of h alone would say ${hOnly.toFixed(4)}, of h³ alone ${hCubed.toFixed(4)}`);
  }

  // 5.
  const old = r.cons.old;
  for (const name of ['water', 'glycerine']) {
    const s = r.cons[name];
    const worst = Math.max(...s.map((x) => x.ratio)), oldWorst = Math.max(...old.map((x) => x.ratio));
    // From the sixth sample (300 steps, five seconds) on: water takes its drag
    // time, three seconds, to come up to the stir's speed from rest.
    const settled = s.slice(5);
    const alive = settled.every((x, k) => x.flux >= 0.3 * old[k + 5].flux) && s.every((x) => x.fastest <= 5 * Math.max(...old.map((y) => y.fastest)));
    const least = Math.min(...settled.map((x, k) => x.flux / old[k + 5].flux));
    check(`liquid is conserved where the gap changes (${name}): |∇·(hu)| under 0.005 of the flux and a fifth of the old solver's`,
      worst < 0.005 && worst < 0.2 * oldWorst && alive,
      `worst ${worst.toFixed(4)} of the flux over twelve samples against the old ${oldWorst.toFixed(4)}; the flux from five seconds on at least ${least.toFixed(2)} of the old solver's, the fastest cell ${Math.max(...s.map((x) => x.fastest)).toFixed(4)} against its ${Math.max(...old.map((x) => x.fastest)).toFixed(4)}`);
  }
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
