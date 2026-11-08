#!/usr/bin/env node
/**
 * The plate's own boil, on the live path the app steps (PLAN 36e-2b).
 *
 *   npm run plateboil -- --part=zero                       (Measure's lab2: SwiftShader, about a minute)
 *   npm run plateboil -- --part=boil --owed=rate,hold,fan,steam   (the Mac's plate shard)
 *
 * `npm run boilgpu` holds 36e-2's dish solver (src/gpu/lampBoil.ts) to the
 * CPU reference, dish by dish, and the first build (#718) passes it. What it
 * cannot see is the plate the app draws: the boil the solver steps every frame
 * on its own fields, beside every other pass that reads the temperature. The
 * review of #718 (2026-11-08) found three faults there, none of which boilgpu
 * reaches, and this check is written to find each of them on any later head.
 *
 * ## boil: the plate boils under a held hand at 60 fps, and not under the fan
 *
 * The physics. A projector's stage puts about 8 kW/m² of lamp under the hot
 * spot; a dark dye takes the visible tenth of it and the water the infrared.
 * The cooling fan's air (h ≈ 50 W/m²K) carries away more than the lamp gives
 * before the dish reaches 100 °C, so the fan's plate settles in the low
 * nineties. A hand held over the glass blocks that air (h ≈ 10, natural
 * convection), and what is left (radiation from both faces, conduction out
 * sideways) cannot hold it: the spot under the hand boils. That difference is
 * the performer's gesture, so it is what the lines ask. A one-cell f64 port of
 * #718's own heat balance (no flow, the same dish) reads 95 °C at 232 s, 100 °C
 * at 258 s under the hand, and 94 °C still climbing after 15 minutes under the
 * fan.
 *
 * The fault it is written for. #718 keeps the temperature in vel.z, a half
 * float. A step at 1/60 s adds about 0.007 K at the hot spot; once the plate
 * is 16 K over the room a half float's step there is 1/64 K, and the increment
 * rounds away. The lab on software WebGPU runs a step in about 0.1 s of wall
 * clock and can be stepped at any length, so a check stepped at its own pace
 * hides it; the app at 60 fps cannot. So the steps here are the app's: 1/60 s
 * for the approach to boiling, which is where the rounding bites, and 0.1 s
 * (the app's own longest frame, FluidSimulation's clamp on magnetSeconds) to
 * warm the plate up first, because 15 000 steps of 1/60 s is half an hour on a
 * cloud runner and a minute on Metal. #718 at 0.1 s steps rounds too (3.0 K
 * every 10 s, the half float's quantum, and a stall at 84 °C under the hand and
 * 64 °C under the fan), so the warm-up is no shelter for it.
 *
 *   rate   the approach at 1/60 s heats at the rate the last 10 s of the warm-up
 *          did, within 0.6x–1.4x, with the plate still climbing (> 0.05 K/s):
 *          a stored temperature that loses a step's increment reads 0.
 *   hold   under the hand, the hot spot reaches T_SAT (100 °C) and steam shows
 *          in the plate's air field within 90 s of 1/60 s steps.
 *   fan    under the fan, after 15 minutes of warm-up and a minute at 1/60 s,
 *          the hot spot is over 80 °C (the lamp did heat it) and under 100 °C
 *          at every read, with no steam.
 *   steam  the steam pushes the liquid out: over the 20 s after steam first
 *          shows, the dye that leaves a circle twice the hand's size is the
 *          dye the steam's volume displaced, within 0.5x–1.5x. Water boiling
 *          to vapour grows about 1600-fold, and in a gap the vapour takes the
 *          column's room: the liquid (and its dye) has to go somewhere, which
 *          the reference writes as the volume source (an − a)(1 − ρv/ρl)
 *          (src/lib/lampBoil.ts). #718 wrote −(ρv/ρl)(an − a): the wrong
 *          sign, 1/1600 of it. The air field's own change may also carry a
 *          source into the thin gap (thinGap.ts reads its rate); counted twice,
 *          the dye leaves at 2x and the line fails as surely as at 0.
 *
 * The contract the build keeps, which #718 already has: GpuStepParams.heat
 * (0..1) and GpuStepParams.boilHolds ({x, y} in plate units, the hand's own
 * radius), vel.z the plate's temperature in kelvin over the room, read where
 * every other pass reads it, and the steam drawn into the air field (the
 * solver's readAir, the bubbles' coverage the plate shades), which is the
 * steam a performer sees. Where the build keeps its own higher-precision
 * temperature is its business; what vel.z says is what the plate does.
 *
 * Each of these lines is printed as owed while src/gpu/lampBoil.ts is absent
 * (main before 36e-2), and is red the day it passes with its id still listed
 * (soundowed.mjs's convention): the PR that builds 36e-2 takes the ids out of
 * `--owed` in scripts/checks.json and never edits a line or a bar.
 *
 * ## zero: Heat 0 keeps today's current, byte for byte
 *
 * The Heat dial's default is 0 in every look, and at 0 every look must be the
 * look it is today. #718 changed the lasting current at every Heat: on any
 * warm cell with Buoyancy up (0.45 by default, and the lamp keeps cells warm),
 * Kell's density in place of `clamp(temp, 0, 50)` and no `maxCur` cap; on the
 * GPU on a level plate too, so rock and the gravity current lost their cap.
 * `npm run lampzero` reads the lamp's own defaults and cannot see it.
 *
 * So these lines run the tree's own current against today's, frozen in
 * scripts/plateboil-today.mjs (main at 50159cb, generated from the source, not
 * retyped). On the GPU: a second lab whose forces.ts carries today's
 * `currentForces` entry in place of the tree's, both on SwiftShader for
 * lampzero's reason (two compiled programs compared byte for byte; a GPU's
 * compiler may fuse them differently), three plates (thin gap upright and
 * level, the old plate upright) with a hot spot over the clamp's 50 K, and
 * the velocity and dye fields after 30 steps at Heat 0 compared bit for bit.
 * On the CPU: FluidSimulation's own stepCurrent (the solver without WebGPU)
 * against today's body, five steps, upright and level. These hold on main and
 * are not owed. Their guards: both labs drew on SwiftShader; the control's
 * bundle carries today's kernel (its marker) and the plain one's does not;
 * the scenes reach the current (Buoyancy 0.45 against 0 reads differently)
 * and today's clamp and cap (cells over 50 K, cells at the cap).
 *
 * What the zero lines ask of the build: at Heat 0 the current runs today's
 * arithmetic, and the kernel keeps today's inputs (cur, vel, dye: a build that
 * needs the boil's own field in the current reads it through vel.z, as the
 * review's fix asks), so today's kernel still binds in its place.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { openLab } from './lab.mjs';
import { TODAY_MARK, TODAY_PLUGIN, todayCpuCurrent } from './plateboil-today.mjs';

const root = process.cwd();
const IDS = ['rate', 'hold', 'fan', 'steam'];
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const part = arg('part') ?? 'all';
const verbose = process.argv.includes('--verbose');   // every read of the boil plates, as it is taken
const owed = new Set((arg('owed') ?? '').split(',').filter(Boolean));

let failed = 0, passed = 0, owedLines = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
if (!['all', 'zero', 'boil'].includes(part)) check('--part is zero, boil or all', false, `asked for ${part}`);

/** The build is absent (main before 36e-2): the only state an owed line is excused in. */
const absent = !existsSync(join(root, 'src/gpu/lampBoil.ts'));
const lineOf = (id, name, ok, detail) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!absent) return check(name, false, `${detail}; owed, but src/gpu/lampBoil.ts is built and the line misses`);
  owedLines++;
  console.log(` owed  ${name} — ${detail}`);
};

const T_SAT = 100, T_ROOM = 20;
/** The hand's own radius (src/gpu/lampBoil.ts HAND_RADIUS, 1.5 cm) on the 20 cm dish (DISH_METRES), in plate units. */
const HAND = 0.015 / 0.2;
const N = 48;

// ── boil ─────────────────────────────────────────────────────────────────

/** Cell centres of an N × N field within r of the plate's centre (the lamp's hot spot, where the hand is held). */
const within = (n, r) => {
  const out = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = (i + 0.5) / n - 0.5, dy = (j + 0.5) / n - 0.5;
    if (dx * dx + dy * dy <= r * r) out.push(i + j * n);
  }
  return out;
};

/**
 * One plate under the lamp at Heat 1: a level dish of dark dye (absorbance 3,
 * nine tenths of the visible taken), the hand over the hot spot or not.
 * Warm-up at 0.1 s steps, read every 10 s, until the spot is at `warmTo` °C or
 * `warmMax` s; then 1/60 s steps, read every 2 s, for `fineMax` s, or until
 * steam has shown for `afterSteam` s.
 */
async function plate(page, { hold, warmTo, warmMax, fineMax, afterSteam }) {
  await page.evaluate(async (N) => {
    await lab.create(N, N);
    lab.dyeDisc(0.5, 0.5, 0.35, [3, 3, 3], 1);
    lab.flush();
  }, N);
  const over = { thinGap: 1, heat: 1, dimmer: 1, boilHolds: hold ? [{ x: 0.5, y: 0.5 }] : [] };
  const read = (t, phase) => page.evaluate(async ([t, phase, hand, ring]) => {
    const v = await lab.field('vel');
    const d = await lab.field('dye');
    const air = await lab.solver().readAir();
    const n = Math.round(Math.sqrt(v.length / 4)), L = Math.round(Math.sqrt(d.length / 4));
    const near = (k, m, r) => { const i = k % m, j = Math.floor(k / m), dx = (i + 0.5) / m - 0.5, dy = (j + 0.5) / m - 0.5; return dx * dx + dy * dy <= r * r; };
    let hot = -Infinity, steam = 0, dye = 0;
    for (let k = 0; k < n * n; k++) if (near(k, n, hand)) hot = Math.max(hot, v[k * 4 + 2]);
    if (air) for (let k = 0; k < air.n * air.n; k++) if (near(k, air.n, ring)) steam += Math.max(0, air.data[k]);
    for (let k = 0; k < L * L; k++) if (near(k, L, ring)) dye += d[k * 4 + 3];
    return { t, phase, hot: 20 + hot, steam, dye, air: !!air };
  }, [t, phase, HAND, 2 * HAND]);
  const reads = [];
  let t = 0;
  for (; t < warmMax;) {
    await page.evaluate((o) => lab.step(100, { ...o, magnetSeconds: 0.1 }), over);
    t += 10;
    reads.push(await read(t, 'warm'));
    if (verbose) console.log(`  ${hold ? 'hand' : 'fan '} ${JSON.stringify(reads.at(-1))}`);
    if (reads.at(-1).hot >= warmTo) break;
  }
  const warmEnd = t;
  let steamAt = null;
  for (; t < warmEnd + fineMax;) {
    await page.evaluate((o) => lab.step(120, { ...o, magnetSeconds: 1 / 60 }), over);
    t += 2;
    const r = await read(t, 'fine');
    reads.push(r);
    if (verbose) console.log(`  ${hold ? 'hand' : 'fan '} ${JSON.stringify(r)}`);
    if (steamAt === null && r.steam > 0) steamAt = t;
    if (steamAt !== null && t >= steamAt + afterSteam) break;
  }
  return { reads, warmEnd, steamAt };
}

async function boilPart() {
  if (absent) {
    for (const [id, name] of [
      ['rate', 'a 1/60 s step heats the plate as a 0.1 s step does (the stored temperature keeps every increment)'],
      ['hold', 'under a held hand the plate reaches T_SAT and steams within 90 s at 1/60 s steps'],
      ['fan', 'under the fan the plate settles hot and under T_SAT, with no steam'],
      ['steam', "the steam pushes out the liquid its volume displaces (0.5x–1.5x)"],
    ]) lineOf(id, name, false, 'src/gpu/lampBoil.ts is absent');
    return;
  }
  const { page, close } = await openLab();
  let H, F, drew;
  const t0 = Date.now();
  try {
    H = await plate(page, { hold: true, warmTo: T_SAT - 5, warmMax: 600, fineMax: 90, afterSteam: 20 });
    F = await plate(page, { hold: false, warmTo: Infinity, warmMax: 900, fineMax: 60, afterSteam: 0 });
    drew = await page.evaluate(() => lab.adapter());
  } finally { await close(); }
  console.log(`  ${drew?.vendor ?? ''} ${drew?.architecture ?? ''}: both plates in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const fmt = (x, k = 2) => (Number.isFinite(x) ? x.toFixed(k) : String(x));
  const show = (P) => P.reads.filter((r, i, a) => r.phase === 'fine' || i % 6 === 5 || a[i + 1]?.phase === 'fine')
    .map((r) => `${r.t}s ${fmt(r.hot, 1)}°C${r.steam > 0 ? ` steam ${fmt(r.steam, 3)}` : ''}`).join(', ');
  console.log(`  hand: ${show(H)}`);
  console.log(`  fan:  ${show(F)}`);

  // rate: the last 10 s of warm-up against the first 6 s at 1/60 s.
  const warm = H.reads.filter((r) => r.phase === 'warm'), fine = H.reads.filter((r) => r.phase === 'fine');
  const wa = warm.at(-2), wb = warm.at(-1);
  const rateW = wa && wb ? (wb.hot - wa.hot) / (wb.t - wa.t) : NaN;
  const fb = fine[2];
  const rateF = wb && fb ? (fb.hot - wb.hot) / (fb.t - wb.t) : NaN;
  const ratio = rateF / rateW;
  lineOf('rate', 'a 1/60 s step heats the plate as a 0.1 s step does (the stored temperature keeps every increment)',
    rateW > 0.05 && ratio >= 0.6 && ratio <= 1.4,
    `${fmt(rateW, 3)} K/s at 0.1 s steps to ${fmt(wb?.hot, 1)} °C, then ${fmt(rateF, 3)} K/s at 1/60 s: ${fmt(ratio)}x (bar 0.6–1.4, still climbing > 0.05 K/s)`);

  const top = Math.max(...fine.map((r) => r.hot));
  lineOf('hold', 'under a held hand the plate reaches T_SAT and steams within 90 s at 1/60 s steps',
    top >= T_SAT && H.steamAt !== null,
    `warm-up to ${fmt(wb?.hot, 1)} °C in ${H.warmEnd} s, then at 1/60 s the spot peaks at ${fmt(top, 1)} °C; steam ${H.steamAt === null ? 'never shows' : `shows at ${H.steamAt - H.warmEnd} s`}${fine[0]?.air === false ? ' (no air field)' : ''}`);

  const fanTop = Math.max(...F.reads.map((r) => r.hot)), fanEnd = F.reads.at(-1)?.hot, fanSteam = Math.max(...F.reads.map((r) => r.steam));
  lineOf('fan', 'under the fan the plate settles hot and under T_SAT, with no steam',
    fanEnd >= 80 && fanTop < T_SAT && fanSteam === 0,
    `${fmt(fanEnd, 1)} °C after ${F.reads.at(-1)?.t} s (bar over 80), peak ${fmt(fanTop, 1)} °C (bar under ${T_SAT}), steam ${fmt(fanSteam, 3)}`);

  // steam: dye gone from the ring against the steam's room, from the last read before steam.
  let detail = 'steam never showed under the hand';
  let ok = false;
  if (H.steamAt !== null) {
    const i = H.reads.findIndex((r) => r.t === H.steamAt);
    const before = H.reads[i - 1], end = H.reads.at(-1);
    const cells = within(N, 2 * HAND).length;
    const perCell = before.dye / cells;
    const want = perCell * end.steam * (1 - 0.598 / 958.4);
    const gone = before.dye - end.dye;
    const r = gone / want;
    ok = r >= 0.5 && r <= 1.5;
    detail = `${fmt(end.steam, 3)} cells of steam in the ring after ${end.t - H.steamAt} s should displace ${fmt(want, 3)} of dye; ${fmt(gone, 3)} left: ${fmt(r)}x (bar 0.5–1.5)`;
  }
  lineOf('steam', 'the steam pushes out the liquid its volume displaces (0.5x–1.5x)', ok, detail);
}

// ── zero ─────────────────────────────────────────────────────────────────

/** Three plates with a hot spot over the clamp's 50 K, stepped 30 times at Heat 0: [vel, dye] each. */
const SCENES = [
  ['thin gap, upright', { thinGap: 1, plateUpright: 1 }],
  ['thin gap, level', { thinGap: 1, plateUpright: 0 }],
  ['old plate, upright', { plateUpright: 1 }],
];
const zeroRun = (lab, buoy = 0.45) => lab.page.evaluate(async ([scenes, buoy]) => {
  const out = [];
  for (const [, over] of scenes) {
    await lab.create(64, 64);
    lab.dye(0.5, 0.5, 0.3, [1.5, 0.8, 0.3], 1);
    lab.dye(0.3, 0.65, 0.12, [0.2, 1.2, 1.6], 2);
    lab.vel(0.42, 0.45, 0.14, [0, 0, 70, 0]);
    lab.vel(0.64, 0.56, 0.1, [0, 0, 20, 0]);
    lab.flush();
    await lab.step(30, { ...over, gravityY: -1, currentBuoy: buoy, rockX: 0.3, rockY: 0.1, currentGrav: 0.2, meanDensity: 0.2, dimmer: 1, heat: 0 });
    out.push([await lab.field('vel'), await lab.field('dye')]);
  }
  return { drew: lab.adapter(), out };
}, [SCENES, buoy]);

const bitsDiffer = (a, b) => {
  if (a.length !== b.length) return { n: Infinity, worst: Infinity };
  const fa = new Float32Array(a), fb = new Float32Array(b);
  const ua = new Uint32Array(fa.buffer), ub = new Uint32Array(fb.buffer);
  let n = 0, worst = 0;
  for (let k = 0; k < ua.length; k++) if (ua[k] !== ub[k]) { n++; worst = Math.max(worst, Math.abs(fa[k] - fb[k])); }
  return { n, worst };
};

async function zeroPart() {
  const plain = await openLab({ software: true });
  let now, still;
  try {
    now = await zeroRun({ page: plain.page });
    still = await zeroRun({ page: plain.page }, 0);
  } finally { await plain.close(); }
  const control = await openLab({ software: true, plugins: [TODAY_PLUGIN], tag: 'today-current' });
  let then;
  try { then = await zeroRun({ page: control.page }); } finally { await control.close(); }

  const who = (d) => (d ? `${d.vendor} ${d.architecture}`.trim() : 'no adapter');
  const cpu = (d) => d?.architecture === 'swiftshader';
  check('both labs drew on the CPU rasteriser', cpu(now.drew) && cpu(then.drew), `${who(now.drew)}, ${who(then.drew)}`);
  check("the control is today's current: its bundle carries today's kernel and the plain lab's does not",
    control.js.includes(TODAY_MARK) && !plain.js.includes(TODAY_MARK) && control.js !== plain.js,
    `marker in control ${control.js.includes(TODAY_MARK)}, in plain ${plain.js.includes(TODAY_MARK)}`);
  const reach = SCENES.map(([, over], i) => ({ name: SCENES[i][0], upright: over.plateUpright, d: bitsDiffer(now.out[i][0], still.out[i][0]).n }));
  check('the plates reach the current: Buoyancy 0.45 moves the upright plates against Buoyancy 0',
    reach.filter((r) => r.upright).every((r) => r.d > 0), reach.map((r) => `${r.name} ${r.d} values`).join(', '));
  const rows = SCENES.map(([name], i) => {
    const v = bitsDiffer(now.out[i][0], then.out[i][0]), d = bitsDiffer(now.out[i][1], then.out[i][1]);
    return { name, n: v.n + d.n, worst: Math.max(v.worst, d.worst) };
  });
  const off = rows.filter((r) => r.n !== 0);
  check("Heat 0: the GPU's current is today's, byte for byte (velocity and dye after 30 steps, three plates)",
    !off.length, off.length ? off.map((r) => `${r.name}: ${r.n} values differ, worst ${r.worst.toExponential(2)}`).join('; ') : 'none different');

  // The CPU solver's twin, in node.
  globalThis.GPUTextureUsage ??= { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
  globalThis.GPUBufferUsage ??= { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
  globalThis.GPUMapMode ??= { READ: 1, WRITE: 2 };
  globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  const out = 'node_modules/.cache/plateboil-sim.mjs';
  await build({
    stdin: { contents: "export { FluidSimulation } from './src/sim/fluidSimulation';\nexport { GRID_SIZE } from './src/sim/constants';", resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
  });
  const { FluidSimulation, GRID_SIZE } = await import(pathToFileURL(join(root, out)).href);
  const S = GRID_SIZE, M = S / 2;
  const cpuRows = [];
  let hot = 0, capped = 0;
  for (const [name, upright] of [['upright', 1], ['level', 0]]) {
    const sim = new FluidSimulation(S, 0, 0, 0.1);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = i + j * S, x = i / S - 0.42, y = j / S - 0.45;
      sim.density[k] = 0.6 * Math.sin(i * 0.11) * Math.cos(j * 0.07) + 0.3;
      sim.temp[k] = 75 * Math.exp(-(x * x + y * y) / 0.01) + 10 * Math.sin(i * 0.05 + j * 0.03) ** 2;
      sim.vx[k] = 0; sim.vy[k] = 0;
    }
    for (let k = 0; k < M * M; k++) { sim['cvx'][k] = 0.01 * Math.sin(k * 0.37); sim['cvy'][k] = 0.01 * Math.cos(k * 0.23); sim['cpr'][k] = 0; sim['cdv'][k] = 0; }
    const ref = { cvx: sim['cvx'].slice(), cvy: sim['cvy'].slice(), cpr: sim['cpr'].slice(), cdv: sim['cdv'].slice(), vx: sim.vx.slice(), vy: sim.vy.slice() };
    const p = { plateUpright: upright, currentBuoy: 0.45, rockX: 0.3, rockY: 0.1, currentGrav: 0.2, currentDamp: 0.98, meanDensity: 0.2, maxCurrent: 0.05, heat: 0 };
    for (let s = 0; s < 5; s++) {
      sim['stepCurrent'](p);
      todayCpuCurrent(M, S, ref.cvx, ref.cvy, ref.cpr, ref.cdv, sim.density, sim.temp, ref.vx, ref.vy, p);
      if (s === 0 && upright) for (let k = 0; k < M * M; k++) if (Math.hypot(ref.cvx[k], ref.cvy[k]) >= p.maxCurrent * 0.999) capped++;
    }
    if (upright) for (const t of sim.temp) if (t > 50) hot++;
    const n = ['cvx', 'cvy', 'vx', 'vy'].reduce((a, f) => a + bitsDiffer(sim[f], ref[f]).n, 0);
    cpuRows.push({ name, n });
  }
  check("the CPU plate reaches today's clamp and cap: cells over 50 K, current at the cap", hot > 0 && capped > 0, `${hot} cells over 50 K, ${capped} at the cap`);
  const cpuOff = cpuRows.filter((r) => r.n);
  check("Heat 0: the CPU solver's current is today's, byte for byte (five steps, upright and level)",
    !cpuOff.length, cpuOff.length ? cpuOff.map((r) => `${r.name}: ${r.n} values differ`).join('; ') : 'none different');
}

if (part === 'all' || part === 'zero') await zeroPart();
if (part === 'all' || part === 'boil') await boilPart();
console.log(`\n${passed}/${passed + failed} checks passed${owedLines ? `, ${owedLines} owed` : ''}`);
process.exit(failed ? 1 : 0);
