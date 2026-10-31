#!/usr/bin/env node
/**
 * The dials whose top was held inside the solver reach the solver at their
 * new top, and the solver stays well there (PLAN 27h-2).
 *
 *   npm run widedials
 *
 * The owner's rule (2026-10-31): every dial runs from very gentle to very
 * extreme. 27h-1 widened the dials whose consumer could simply be let
 * further. These nine were held a second time inside the solver, so a wider
 * dial alone would have bought dead travel: Swirl, Dye Weight and Heat
 * Spread were clamped to 1 there, Pushes Dye too, Momentum's lasting current
 * to 0.995, Drop Height to 1, Background Loop to 1, and Glass Smear had a
 * gate at 0.2 that made its first live step a jump to a fifth of full.
 *
 * So this asks two things.
 *
 * 1. In the source: every clamp the solver puts on each dial admits the
 *    dial's top as the desk, the panel, MIDI and the phone see it
 *    (`PIN_RANGE`), and Glass Smear acts from its first step. A clamp left at
 *    the old top is the failure this item was opened for, and a range that
 *    grew without its clamp would pass every picture of the dial's middle.
 *    And no look sets one of these past its old clamp, or a Glass Smear
 *    under the old gate, so every look opens as it did.
 *
 * 2. On the GPU solver (scripts/lab.mjs), the four whose top could ask more
 *    than the step can carry: each does more at its new top than at its old
 *    one, finite and conserving. The lab hands the GPU solver its step's
 *    parameters itself, so these lines see the clamps in gpu/ and lib/, not
 *    sim/fluidSimulation.ts's, which part 1 reads. Swirl at 2 spins more
 *    than at 1 and feeds itself no more than today's 1 does; Dye Weight at 2
 *    slumps a pool further than at 1, keeping its dye; Heat Spread at 2
 *    spreads heat further than at 1, keeping it; Pushes Dye at 1.2 clears
 *    more dye from a ferrofluid pool than at 1, and (read from the source,
 *    since a swap conserves whatever its strength) cannot overshoot.
 *
 * A Mac runs it in seconds; a Linux box's software WebGPU in a few minutes.
 */
import { readFileSync } from 'node:fs';
import { PIN_RANGE } from '../src/lib/deskPins.ts';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── 1. The source ─────────────────────────────────────────────────────────
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const files = ['src/sim/fluidSimulation.ts', 'src/gpu/fluid.ts', 'src/gpu/fluid/passes.ts', 'src/lib/turntable.ts'];
const text = Object.fromEntries(files.map((f) => [f, src(f)]));

/*
  Each dial, its new top, and how the solver names it where it clamps it:
  the setting, or the step parameter it becomes (`vorticity`), or the
  argument a helper takes (`dyeWeight`). Every `Math.min(X, <name>` in the
  four files is a clamp; each must admit the top. Each file must hold the
  number of clamps `clamps` gives it, so a clamp renamed or rewritten in one
  file cannot hide behind another's; and a line in the four that names the
  dial beside a `min(` or `clamp(` this reading did not parse fails as
  unread, rather than passing as no clamp at all.
*/
const DIALS = [
  { key: 'vorticityConfinement', top: 2, names: ['settings.vorticityConfinement', 'p.vorticity'], clamps: { fluidSimulation: 1, fluid: 1 } },
  { key: 'solutalBuoyancy', top: 2, names: ['settings.solutalBuoyancy', 'p.solutalBuoyancy', 'dyeWeight'], clamps: { fluidSimulation: 1, fluid: 1, turntable: 1 } },
  { key: 'doubleDiffusion', top: 2, names: ['settings.doubleDiffusion', 'p.doubleDiffusion'], clamps: { fluidSimulation: 1, fluid: 1 } },
  { key: 'phaseDisplace', top: 1.2, names: ['settings.phaseDisplace', 'p.phaseDisplace'], clamps: { fluidSimulation: 1, fluid: 1 } },
  { key: 'dropHeight', top: 2, names: ['this.dropHeight'], clamps: { fluidSimulation: 1 } },
  { key: 'backgroundLoop', top: 1.4, names: ['settings.backgroundLoop'], clamps: { fluidSimulation: 2 } },
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const base = (f) => f.replace(/^.*\//, '').replace(/\.ts$/, '');
for (const d of DIALS) {
  const range = PIN_RANGE.get(d.key);
  const found = [], unread = [];
  for (const f of files) {
    text[f].split('\n').forEach((line, i) => {
      let parsed = 0;
      for (const n of d.names) {
        const re = new RegExp(`Math\\.min\\(\\s*([0-9.]+)\\s*,\\s*(?:Number\\.isFinite\\(\\s*)?${esc(n)}\\b`, 'g');
        for (const m of line.matchAll(re)) { found.push({ f: base(f), top: Number(m[1]) }); parsed++; }
      }
      const named = d.names.some((n) => new RegExp(`${esc(n)}\\b`).test(line));
      if (named && /\b(?:min|clamp)\(/.test(line) && !parsed) unread.push(`${base(f)}:${i + 1}`);
    });
  }
  const per = {};
  for (const c of found) per[c.f] = (per[c.f] ?? 0) + 1;
  const counted = Object.keys({ ...per, ...d.clamps }).every((f) => (per[f] ?? 0) === (d.clamps[f] ?? 0));
  const low = found.filter((c) => !Number.isFinite(c.top) || c.top < d.top);
  check(`${d.key}: the dial runs to ${d.top} and every clamp in the solver admits it`,
    range?.max === d.top && counted && unread.length === 0 && low.length === 0,
    `dial ${range?.min}–${range?.max}; ${found.length} clamps (${found.map((c) => `${c.f} ${c.top}`).join(', ')})`
      + (counted ? '' : `; expected ${JSON.stringify(d.clamps)}`)
      + (unread.length ? `; a min( or clamp( not read: ${unread.join(', ')}` : '')
      + (low.length ? `; under the top: ${low.map((c) => `${c.f} ${c.top}`).join(', ')}` : ''));
}
{
  // Momentum: the dial is 0.8 to 1 and always was; the lasting current
  // relaxes toward its forces by 1 − damping a step, so at exactly 1 it would
  // never answer them. Its clamp is now 0.999, a sixteen-second memory at
  // 60 Hz where 0.995 was three.
  const m = text['src/sim/fluidSimulation.ts'].match(/currentDamp:\s*Math\.max\(\s*0\.8\s*,\s*Math\.min\(\s*([0-9.]+)\s*,\s*settings\.damping/);
  check('damping: the lasting current keeps up to 0.999 of itself a step', m && Number(m[1]) === 0.999,
    `clamp ${m?.[1]}, dial ${PIN_RANGE.get('damping')?.min}–${PIN_RANGE.get('damping')?.max}`);
}
{
  const gates = [...text['src/sim/fluidSimulation.ts'].matchAll(/settings\.glassSmear\s*>\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  check('glassSmear: runs to 3 and acts from its first step (no gate above 0)',
    PIN_RANGE.get('glassSmear')?.max === 3 && gates.length >= 2 && gates.every((g) => g === 0), `gates at ${gates.join(', ')}`);
}
{
  // Every look's value, read from presets.ts and the defaults as written.
  const OLD = { vorticityConfinement: 1, solutalBuoyancy: 1, doubleDiffusion: 1, phaseDisplace: 1, dropHeight: 1, backgroundLoop: 1, damping: 0.995 };
  const looks = src('src/presets.ts') + src('src/types.ts');
  const past = [];
  for (const [k, top] of Object.entries(OLD)) for (const m of looks.matchAll(new RegExp(`\\b${k}:\\s*([0-9.]+)`, 'g'))) if (Number(m[1]) > top) past.push(`${k} ${m[1]}`);
  const smears = [...looks.matchAll(/\bglassSmear:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  const gated = smears.filter((v) => v > 0 && v <= 0.2);
  check('every look opens as it did: none past an old clamp, no Glass Smear the old gate hid',
    past.length === 0 && gated.length === 0 && smears.length > 20,
    `${smears.length} Glass Smear values read${past.length ? `; past: ${past.join(', ')}` : ''}${gated.length ? `; under the old gate: ${gated.join(', ')}` : ''}`);
}

// ── 2. The GPU solver ─────────────────────────────────────────────────────
const { page, close } = await openLab();
try {
  /*
    Swirl. Four vortices of each sign laid on the old plate (vorticity
    confinement is a look option there; Thin Gap's solve takes it too) with
    a little dye, run at Swirl s: the flow's mean |curl| at 60 steps.
    Confinement puts back the spin the grid smooths away, so it keeps an
    unforced plate stirring, at today's 1 as at 2: at 0 the mean speed falls
    to 2.5e-5 by step 600, at 1 it rises from 5.4e-4 at step 60 to 1.25e-3
    and is still rising by ×1.11 from step 300 to 600. Today's 1 is the
    yardstick, so the line asks that 2 feeds itself no more than 1 does: its
    rise from step 300 to 600 no steeper than 1's (with 0.03 for the
    software rasteriser's rounding), and where it ends up at most half again
    1's mean and twice 1's fastest cell (measured 1.18 and 1.59).
  */
  const swirl = (s, long) => page.evaluate(async ({ s, long }) => {
    const N = 128;
    await lab.create(N, N);
    lab.dye(0.5, 0.5, 0.3, [0.3, 0.5, 0.7], 1);
    const v = new Array(N * N * 4).fill(0);
    for (let q = 0; q < 8; q++) {
      const cx = (0.2 + 0.6 * ((q * 0.618) % 1)) * N, cy = (0.2 + 0.6 * ((q * 0.382 + 0.1) % 1)) * N, R = 0.09 * N, sg = q % 2 ? 1 : -1;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const dx = i + 0.5 - cx, dy = j + 0.5 - cy, r2 = dx * dx + dy * dy;
        if (r2 >= R * R) continue;
        const w = sg * 2 * (1 - r2 / (R * R));
        v[(i + j * N) * 4] += -dy / R * w; v[(i + j * N) * 4 + 1] += dx / R * w;
      }
    }
    lab.addVel(v);
    lab.flush();
    const read = async () => {
      const f = await lab.field('vel');
      let sp = 0, cu = 0, bad = 0, most = 0;
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const k = (i + j * N) * 4;
        if (!Number.isFinite(f[k]) || !Number.isFinite(f[k + 1])) { bad++; continue; }
        const h = Math.hypot(f[k], f[k + 1]);
        sp += h; most = Math.max(most, h);
        cu += Math.abs((f[k + 4 + 1] - f[k - 4 + 1]) - (f[k + N * 4] - f[k - N * 4])) / 2;
      }
      const n = (N - 2) * (N - 2);
      return { speed: sp / n, curl: cu / n, most, bad };
    };
    const over = { vorticity: s, damping: 0.995 };
    await lab.step(60, over);
    const a = await read();
    if (!long) return { a };
    await lab.step(240, over);
    const b = await read();
    await lab.step(300, over);
    return { a, b, c: await read() };
  }, { s, long });
  const sw = { 0: await swirl(0, false), 1: await swirl(1, true), 2: await swirl(2, true) };
  const f3 = (x) => x.toExponential(2);
  const one = sw[1], top = sw[2];
  const rise = (r) => r.c.speed / r.b.speed;
  console.log(`  swirl: |curl| at step 60 ${[0, 1, 2].map((s) => `${s}: ${f3(sw[s].a.curl)}`).join(', ')}; `
    + [1, 2].map((s) => `at ${s}, mean speed ${f3(sw[s].a.speed)}, ${f3(sw[s].b.speed)}, ${f3(sw[s].c.speed)} and fastest ${f3(sw[s].a.most)}, ${f3(sw[s].b.most)}, ${f3(sw[s].c.most)}`).join('; ')
    + ' at steps 60, 300, 600');
  check('on the GPU solver, Swirl at 2 spins the flow more than at 1, and 1 more than 0',
    sw[2].a.curl > sw[1].a.curl * 1.02 && sw[1].a.curl > sw[0].a.curl * 1.02,
    `|curl| ${f3(sw[0].a.curl)}, ${f3(sw[1].a.curl)}, ${f3(sw[2].a.curl)}`);
  check('on the GPU solver, Swirl at 2 stays finite and feeds itself no more than 1 does',
    [sw[0].a, one.a, one.b, one.c, top.a, top.b, top.c].every((r) => r.bad === 0)
      && rise(top) <= rise(one) + 0.03 && top.c.speed <= one.c.speed * 1.5 && top.c.most <= one.c.most * 2,
    `steps 300 to 600: mean ×${rise(one).toFixed(3)} at 1, ×${rise(top).toFixed(3)} at 2; at 600, 2 over 1: mean ×${(top.c.speed / one.c.speed).toFixed(2)}, fastest ×${(top.c.most / one.c.most).toFixed(2)}`);

  /*
    Dye Weight. A deep pool on the thin gap in water, slumping under its own
    weight (slump.mjs measures its law): its radius of gyration after 60
    steps, its total and its least cell.
  */
  const slump = (w) => page.evaluate(async (w) => {
    const N = 128;
    await lab.create(N, N);
    lab.dye(0.5, 0.5, 0.05, lab.dyeOf([0, 0.3, 0.9]), 6);
    lab.flush();
    const read = async () => {
      const f = await lab.field('dye');
      let t = 0, r2 = 0, least = Infinity;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const a = f[(y * N + x) * 4 + 3], dx = (x + 0.5) / N - 0.5, dy = (y + 0.5) / N - 0.5;
        t += a; r2 += a * (dx * dx + dy * dy); least = Math.min(least, a);
      }
      return { total: t, r: Math.sqrt(r2 / t), least };
    };
    const t0 = await read();
    await lab.step(60, { diff: 0, gridDamp: 0, thinGap: 1, gapThickness: 0, solutalBuoyancy: w });
    return { t0, t1: await read() };
  }, w);
  const dw = { 0: await slump(0), 1: await slump(1), 2: await slump(2) };
  console.log(`  dye weight: ${[0, 1, 2].map((w) => `${w}: r ${dw[w].t0.r.toFixed(4)} → ${dw[w].t1.r.toFixed(4)}, total ×${(dw[w].t1.total / dw[w].t0.total).toFixed(4)}, least ${dw[w].t1.least.toFixed(4)}`).join('; ')}`);
  const grew = (w) => dw[w].t1.r - dw[w].t0.r;
  check('on the GPU solver, Dye Weight at 2 slumps a pool further than at 1, and 1 further than 0',
    grew(2) > grew(1) * 1.05 && grew(1) > grew(0) * 1.05,
    `radius grew ${grew(0).toFixed(4)}, ${grew(1).toFixed(4)}, ${grew(2).toFixed(4)}`);
  check('Dye Weight at 2 keeps the pool\'s dye: none made, none lost, none under zero',
    [0, 1, 2].every((w) => Math.abs(dw[w].t1.total / dw[w].t0.total - 1) <= 0.002 && dw[w].t1.least >= 0),
    `totals ×${[0, 1, 2].map((w) => (dw[w].t1.total / dw[w].t0.total).toFixed(4)).join(', ')}`);

  /*
    Heat Spread. A warm spot in a still liquid with no cooling: how far its
    heat has spread (the heat's radius of gyration, vel.z) after 60 steps.
  */
  const heat = (d) => page.evaluate(async (d) => {
    const N = 128;
    await lab.create(N, N);
    lab.vel(0.5, 0.5, 0.06, [0, 0, 1, 0]);
    lab.flush();
    const read = async () => {
      const f = await lab.field('vel');
      let t = 0, r2 = 0, bad = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const a = f[(y * N + x) * 4 + 2], dx = (x + 0.5) / N - 0.5, dy = (y + 0.5) / N - 0.5;
        if (!Number.isFinite(a)) { bad++; continue; }
        t += a; r2 += a * (dx * dx + dy * dy);
      }
      return { total: t, r: Math.sqrt(r2 / Math.max(1e-12, t)), bad };
    };
    // The spot is laid by the first step, so it is read after that one.
    await lab.step(1, { heatDecay: 1, doubleDiffusion: d });
    const t0 = await read();
    await lab.step(60, { heatDecay: 1, doubleDiffusion: d });
    return { t0, t1: await read() };
  }, d);
  const hs = { 0: await heat(0), 1: await heat(1), 2: await heat(2) };
  console.log(`  heat spread: ${[0, 1, 2].map((d) => `${d}: r ${hs[d].t0.r.toFixed(4)} → ${hs[d].t1.r.toFixed(4)}, total ×${(hs[d].t1.total / hs[d].t0.total).toFixed(3)}`).join('; ')}`);
  const spread = (d) => hs[d].t1.r - hs[d].t0.r;
  check('on the GPU solver, Heat Spread at 2 spreads heat further than at 1, and 1 further than 0',
    spread(2) > spread(1) * 1.05 && spread(1) > spread(0) * 1.05 && [0, 1, 2].every((d) => hs[d].t1.bad === 0),
    `radius grew ${spread(0).toFixed(4)}, ${spread(1).toFixed(4)}, ${spread(2).toFixed(4)}`);
  check('Heat Spread at 2 keeps the heat: it spreads it, it does not make or lose it',
    [0, 1, 2].every((d) => hs[d].t0.total > 0 && Math.abs(hs[d].t1.total / hs[d].t0.total - 1) <= 0.01),
    `totals ×${[0, 1, 2].map((d) => (hs[d].t1.total / hs[d].t0.total).toFixed(4)).join(', ')}`);

  /*
    Pushes Dye. ferrodye.mjs's pool: a pool of ferrofluid a fifth of the
    plate across, poured on even dye, run through the engine's whole step
    at 1 and at 1.2. The dye left inside it as a share of what was there,
    the dye's total against the start's, and its least cell. The total
    moves a little either way, by the step's own carry (measured ×0.997 at
    1 on ferrodye's spiral); at 1.2 it must move no more than at 1, so the
    extra pass makes and loses nothing.
  */
  const displace = (amount) => page.evaluate(async (amount) => {
    const N = 128;
    await lab.create(N, N);
    lab.dye(0.5, 0.5, 3, [0.3, 0.5, 0.7], 1);
    lab.flush();
    lab.addPhase(0.5, 0.5, 0.1, 0.95);
    const read = async () => {
      const d = await lab.field('dye');
      let all = 0, pool = 0, least = Infinity;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const a = d[(x + y * N) * 4 + 3];
        all += a; least = Math.min(least, a);
        if (Math.hypot((x + 0.5) / N - 0.5, (y + 0.5) / N - 0.5) < 0.08) pool += a;
      }
      return { all, pool, least };
    };
    const t0 = await read();
    await lab.step(60, { phaseSharp: 0.75, phaseDisplace: amount });
    const t1 = await read();
    return { left: t1.pool / t0.pool, kept: t1.all / t0.all, least: t1.least };
  }, amount);
  const pd = { 0: await displace(0), 1: await displace(1), 1.2: await displace(1.2) };
  console.log(`  pushes dye: ${[0, 1, 1.2].map((a) => `${a}: pool keeps ${pd[a].left.toFixed(3)}, plate ×${pd[a].kept.toFixed(4)}, least ${pd[a].least.toFixed(4)}`).join('; ')}`);
  check('on the GPU solver, Pushes Dye at 1.2 clears more dye out of a ferrofluid pool than at 1, and 1 more than 0',
    pd[1.2].left < pd[1].left - 0.01 && pd[1].left < pd[0].left - 0.05,
    `the pool keeps ${pd[0].left.toFixed(3)} at 0, ${pd[1].left.toFixed(3)} at 1, ${pd[1.2].left.toFixed(3)} at 1.2`);
  /*
    And none overshoots. The pass swaps dye between neighbours, so a lab
    total cannot see an overshoot (the total holds whatever the strength,
    and the store clamps at zero): the bound is read from the source. Each
    of a cell's four neighbours takes at most the push's share of it, so a
    pass gives away at most 4·max(push, inside)·s, which at the dial's top
    must stay under 1. The pass split this line once guarded was dropped
    for it: 0.86 at 1.2, where the edge is 1.39.
  */
  {
    const k = Number(src('src/gpu/fluid/constants.ts').match(/export const DISPLACE_PUSH = ([0-9.]+)/)?.[1]);
    const d = Number(src('src/gpu/fluid/constants.ts').match(/export const DISPLACE_INSIDE = ([0-9.]+)/)?.[1]);
    const shader = src('src/gpu/wgsl/fluid/phase.ts');
    const swap = /keep -= k \* max\(fh - fq, 0\.0\) \+ d \* min\(fh, fq\);/.test(shader);
    const most = 4 * Math.max(k, d) * PIN_RANGE.get('phaseDisplace').max;
    check('Pushes Dye at its top gives away less than a cell holds in a pass, so it cannot overshoot',
      Number.isFinite(most) && swap && most < 1 && pd[1.2].least >= 0,
      `4 × max(${k}, ${d}) × ${PIN_RANGE.get('phaseDisplace').max} = ${most.toFixed(3)}${swap ? '' : '; the exchange in wgsl/fluid/phase.ts is not the one this bound was read from'}`);
  }
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} failed` : `\nall ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
