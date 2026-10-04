#!/usr/bin/env node
/**
 * The plate's liquids carried across a new grid, measured on the GPU solver
 * alone (scripts/lab.mjs). PLAN 9w.
 *
 *   npm run regrid
 *
 * The quality governor moves the solver to another grid whenever the frame
 * time crosses a rung, and the app builds a new solver for it. The dye and
 * the flow were always carried across, through the CPU's 192² arrays; the
 * liquids that live only on the GPU were not. The ferrofluid was simply gone
 * on the new grid, and the app poured the look's ring in its place whenever
 * Ferrofluid was up: a pool dragged into a shape came back as the ring, and
 * ferrofluid the owner poured from the bottle on Classic came back as a ring
 * nobody poured. Since the Magnet moves only what is on the plate (9y), a
 * pool lost that way mid-show left the magnet nothing to hold. The oil, soap
 * and acidity of the mix and the two reactions went the same way, with
 * nothing poured back at all.
 *
 * Now the old solver hands those fields to the new one on the GPU
 * (handOver, takeOver and the carryArea kernel in src/gpu/fluid.ts), and the
 * lab moves its grid the way the app does (lab.regrid). What this asks:
 *
 *   1. moved down a rung (384² to 256², the governor falling behind), the
 *      ferrofluid on the new grid is the same amount, to the rounding, as
 *      what was poured and played on the old one; each new cell is exactly
 *      the area-weighted mean of the old cells under it (worked out here in
 *      JavaScript from the old field, so the kernel is held to the
 *      definition, not to itself); and it is the same shape in the same
 *      place: the black where it was, its middle within a cell. The same
 *      move with nothing handed over is the control, and reads an empty
 *      plate, so the measure can tell the two
 *   2. moved back up (256² to 384²), the same again, the shape within a
 *      coarse cell of the field it left
 *   3. the new solver plays on with it: the phase stage runs (phaseIsLive),
 *      no liquid is made or lost over two seconds of steps, and the edge is
 *      as sharp as it was before the moves. (Measured while writing this, at
 *      384² and 256²: 1.199 part-full cells per black cell before the moves,
 *      1.200 just moved back up, 1.072 after the steps; the separation holds
 *      its own edge width, so a move barely softens it.)
 *   4. the mix (oil poured as bodies, soap, acid) comes across in the same
 *      amounts, with Oil Bodies' tally of the oil poured, and plays on
 *   5. the two reactions (the BZ waves, the Liesegang gel) come across as
 *      they were, value for value: their grids are the same size on every
 *      solver
 *   6. a carry offered to a solver on another device (after a lost one) is
 *      refused, and lays nothing, where reading the dead device's copies
 *      would be an error
 *
 * What it is not: the app. Whether the app hands the carry over at the
 * governor's move, and stops laying the look's ring over it, is
 * `npm run magnet`'s last check, on the Mac (a new grid under ferrofluid
 * poured by hand on Classic keeps it, and lays no ring).
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI,
 * a Linux box's software WebGPU anywhere else.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** The area-weighted mean of an n² field onto m² cells, channel by channel (`ch` values a cell). */
function areaMean(data, n, m, ch = 1) {
  const out = new Float64Array(m * m * ch), r = n / m;
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const x0 = i * r, x1 = x0 + r, y0 = j * r, y1 = y0 + r;
    for (let y = Math.floor(y0); y < Math.min(n, Math.ceil(y1)); y++) {
      const wy = Math.min(y1, y + 1) - Math.max(y0, y);
      for (let x = Math.floor(x0); x < Math.min(n, Math.ceil(x1)); x++) {
        const w = (Math.min(x1, x + 1) - Math.max(x0, x)) * wy;
        for (let c = 0; c < ch; c++) out[(i + j * m) * ch + c] += w * data[(x + y * n) * ch + c];
      }
    }
    for (let c = 0; c < ch; c++) out[(i + j * m) * ch + c] /= r * r;
  }
  return out;
}

/** What the plate holds of channel `c` (a share of its area), and where its middle is. */
function amount(data, n, ch = 1, c = 0) {
  let t = 0, cx = 0, cy = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = data[(x + y * n) * ch + c];
    t += v; cx += v * (x + 0.5) / n; cy += v * (y + 0.5) / n;
  }
  return { total: t / (n * n), x: t ? cx / t : 0, y: t ? cy / t : 0 };
}

/**
 * How much of the black (over half full) two fields share, the second read
 * at the first's cell centres: shared over either, 1 for the same shape.
 */
function overlap(a, na, b, nb) {
  let both = 0, either = 0;
  for (let y = 0; y < na; y++) for (let x = 0; x < na; x++) {
    const bx = Math.min(nb - 1, Math.floor((x + 0.5) / na * nb)), by = Math.min(nb - 1, Math.floor((y + 0.5) / na * nb));
    const p = a[x + y * na] > 0.5, q = b[bx + by * nb] > 0.5;
    if (p && q) both++;
    if (p || q) either++;
  }
  return either ? both / either : 0;
}

/** The edge: cells part full (between a tenth and nine tenths) per cell of black. */
function softness(data, n) {
  let grey = 0, black = 0;
  for (let i = 0; i < n * n; i++) { const v = data[i]; if (v > 0.1 && v < 0.9) grey++; if (v > 0.5) black++; }
  return black ? grey / black : Infinity;
}

const rel = (a, b) => Math.abs(a / b - 1);
const pct = (v) => `${(v * 100).toFixed(3)}%`;
/*
  The ferrofluid's stage, as a ferrofluid look runs it with no magnet over
  the plate: the separation that keeps its edge, and its own tension.
*/
const FERRO = { phaseSharp: 0.4, phaseTension: 0.18 };

const { page, close } = await openLab();
try {
  /*
    A shape no look pours: an L of drops and a lone pool, off the middle,
    played for a second so the edge is the solver's own and not the splat's.
  */
  const pour = () => page.evaluate(async (FERRO) => {
    for (let k = 0; k < 5; k++) lab.addPhase(0.22 + k * 0.06, 0.3, 0.06, 0.9);
    for (let k = 1; k < 4; k++) lab.addPhase(0.22, 0.3 + k * 0.07, 0.06, 0.9);
    lab.addPhase(0.7, 0.68, 0.1, 0.9);
    await lab.step(60, FERRO);
  }, FERRO);
  const phase = () => page.evaluate(() => lab.phase());
  const live = () => page.evaluate(() => lab.solver().phaseIsLive);

  // ── The control: the move as it was, nothing handed over ─────────────
  await page.evaluate(() => lab.create(384));
  await pour();
  const ctlBefore = await phase();
  const ctlMove = await page.evaluate(() => lab.regrid(256, false));
  const ctlAfter = await phase(), ctlLive = await live();

  // ── 1. Down a rung ───────────────────────────────────────────────────
  await page.evaluate(() => lab.create(384));
  await pour();
  const f384 = await phase();
  const down = await page.evaluate(() => lab.regrid(256));
  const f256 = await phase(), live256 = await live();
  const a384 = amount(f384.data, 384), a256 = amount(f256.data, 256);
  const want256 = areaMean(f384.data, 384, 256);
  let off256 = 0; for (let i = 0; i < want256.length; i++) off256 = Math.max(off256, Math.abs(want256[i] - f256.data[i]));
  const lap256 = overlap(f256.data, 256, f384.data, 384);
  const moved256 = Math.hypot(a256.x - a384.x, a256.y - a384.y) * 256;
  const ctl = amount(ctlBefore.data, 384), ctlNow = amount(ctlAfter.data, ctlAfter.n);
  console.log(`  poured and played at 384²: ${pct(a384.total)} of the plate, its middle at ${a384.x.toFixed(4)}, ${a384.y.toFixed(4)}`);
  console.log(`  moved to 256²: ${pct(a256.total)}, middle ${a256.x.toFixed(4)}, ${a256.y.toFixed(4)}; the most a cell is off the area mean ${off256.toExponential(2)}`);
  console.log(`  the control, moved with nothing handed over: ${pct(ctl.total)} before, ${pct(ctlNow.total)} after, phase stage ${ctlLive ? 'running' : 'off'}\n`);
  check('moved down a rung, the ferrofluid is all there, each cell the area mean of the old ones under it, in the same shape and place',
    down.taken && live256 && ctl.total > 0.02 && !ctlMove.handed && ctlNow.total === 0 && !ctlLive
      && a384.total > 0.02 && rel(a256.total, a384.total) < 1e-4 && off256 < 1e-5 && lap256 > 0.9 && moved256 < 1,
    `${pct(a384.total)} of the plate → ${pct(a256.total)} (${(rel(a256.total, a384.total) * 1e6).toFixed(1)} ppm); `
    + `cells off the area mean by at most ${off256.toExponential(1)}; black shared ${(lap256 * 100).toFixed(1)}%; middle moved ${moved256.toFixed(2)} cell; `
    + `with nothing handed over the same move leaves ${pct(ctlNow.total)}`);

  // ── 2. And back up ───────────────────────────────────────────────────
  const up = await page.evaluate(() => lab.regrid(384));
  const back = await phase(), liveBack = await live();
  const aBack = amount(back.data, 384);
  const wantBack = areaMean(f256.data, 256, 384);
  let offBack = 0; for (let i = 0; i < wantBack.length; i++) offBack = Math.max(offBack, Math.abs(wantBack[i] - back.data[i]));
  const lapBack = overlap(back.data, 384, f384.data, 384);
  const movedBack = Math.hypot(aBack.x - a384.x, aBack.y - a384.y) * 256;
  check('moved back up, the same amount again, within a coarse cell of the field it left',
    up.taken && liveBack && rel(aBack.total, a384.total) < 2e-4 && offBack < 1e-5 && lapBack > 0.9 && movedBack < 1,
    `${pct(aBack.total)} (${(rel(aBack.total, a384.total) * 1e6).toFixed(1)} ppm off the first); cells off the area mean by at most ${offBack.toExponential(1)}; `
    + `black shared with the field before the moves ${(lapBack * 100).toFixed(1)}%; middle ${movedBack.toFixed(2)} of a 256² cell from where it was`);

  // ── 3. And plays on ──────────────────────────────────────────────────
  await page.evaluate((FERRO) => lab.step(120, FERRO), FERRO);
  const played = await phase(), livePlayed = await live();
  const aPlayed = amount(played.data, 384);
  const soft0 = softness(f384.data, 384), softUp = softness(back.data, 384), softPlayed = softness(played.data, 384);
  check('the new solver plays on with it: nothing made or lost, and the edge as sharp as before the moves',
    livePlayed && rel(aPlayed.total, aBack.total) < 0.005 && softPlayed <= soft0 * 1.15,
    `${pct(aBack.total)} → ${pct(aPlayed.total)} over 120 steps; part-full cells per black cell ${soft0.toFixed(3)} before the moves, `
    + `${softUp.toFixed(3)} just moved back up, ${softPlayed.toFixed(3)} after the steps`);

  // ── 4. The mix ───────────────────────────────────────────────────────
  await page.evaluate(() => lab.create(384));
  await page.evaluate(async () => {
    const s = lab.solver();
    for (let k = 0; k < 6; k++) s.addMix(0.25 + 0.1 * k, 0.3 + 0.07 * (k % 3), 0.04, { oil: 1 });
    s.addMix(0.5, 0.7, 0.08, { soap: 0.8 });
    s.addMix(0.3, 0.75, 0.06, { acid: 0.7 });
    await lab.step(40, { oilTension: 0.6, surfactantFlow: 0.2, phIndicator: 1 });
  });
  const m384 = await page.evaluate(() => lab.chemistry('mix')), cover384 = await page.evaluate(() => lab.oilCover());
  await page.evaluate(() => lab.regrid(256));
  const m256 = await page.evaluate(() => lab.chemistry('mix')), cover256 = await page.evaluate(() => lab.oilCover());
  const chans = ['oil', 'soap', 'acid'];
  const was = chans.map((_, c) => amount(m384.data, 384, 4, c).total), now = chans.map((_, c) => amount(m256?.data ?? [], 256, 4, c).total);
  await page.evaluate(() => lab.step(40, { oilTension: 0.6, surfactantFlow: 0.2, phIndicator: 1 }));
  const mPlayed = await page.evaluate(() => lab.chemistry('mix'));
  const oilPlayed = amount(mPlayed.data, 256, 4, 0).total;
  const each = chans.map((c, k) => `${c} ${pct(was[k])} → ${pct(now[k])}`).join(', ');
  check('the oil, soap and acidity come across in the same amounts, with the tally of oil poured, and play on',
    !!m256 && was[0] > 0.01 && was[1] > 0.001 && was[2] > 1e-4
      && rel(now[0], was[0]) < 1e-4 && rel(now[1], was[1]) < 1e-4 && rel(now[2], was[2]) < 1e-4
      && cover256 === cover384 && cover384 > 0 && rel(oilPlayed, now[0]) < 0.005,
    `${each}; oil poured ${cover384.toFixed(4)} → ${cover256.toFixed(4)} of the plate; the oil after 40 more steps ${pct(oilPlayed)}`);

  // ── 5. The reactions ─────────────────────────────────────────────────
  await page.evaluate(() => lab.create(384));
  await page.evaluate(async () => {
    const s = lab.solver();
    s.addRxn(0.5, 0.5, 0.04, { bz: 0.9 });
    s.addRxn(0.53, 0.5, 0.04, { bzWake: 0.9 });
    s.addLiesegang(0.5, 0.5, 0.06, 4);
    await lab.step(40, { bzReaction: 1, liesegang: 1, dt: 0.004 });
  });
  const rx0 = await page.evaluate(() => lab.chemistry('rxn')), li0 = await page.evaluate(() => lab.chemistry('lies'));
  await page.evaluate(() => lab.regrid(256));
  const rx1 = await page.evaluate(() => lab.chemistry('rxn')), li1 = await page.evaluate(() => lab.chemistry('lies'));
  const chemLive = await page.evaluate(() => lab.solver().chemistryLive);
  const sameAs = (a, b) => !!a && !!b && a.n === b.n && a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
  const busy = (f) => (f ? f.data.filter((v, i) => i % 4 === 0 && v > 0.01).length : 0);
  check('the BZ waves and the Liesegang gel come across value for value',
    sameAs(rx0, rx1) && sameAs(li0, li1) && busy(rx0) > 50 && chemLive.rxn && chemLive.lies,
    `BZ ${rx0?.n}² with ${busy(rx0)} cells active, ${sameAs(rx0, rx1) ? 'identical' : 'changed'} on the new solver; `
    + `the gel ${li0?.n}², ${sameAs(li0, li1) ? 'identical' : 'changed'}; live on the new solver: BZ ${chemLive.rxn}, gel ${chemLive.lies}`);

  // ── 6. Another device's carry ────────────────────────────────────────
  await page.evaluate(() => lab.create(384));
  await pour();
  const strangerHad = amount((await phase()).data, 384).total;
  const strangerTook = await page.evaluate(() => lab.strangerTakes(256));
  const strangerGot = amount((await phase()).data, 256).total;
  check('a carry from another device is refused, and lays nothing',
    strangerHad > 0.02 && strangerTook === false && strangerGot === 0 && !(await live()),
    `${pct(strangerHad)} on the first device; the second ${strangerTook ? 'took it' : 'refused it'}, and holds ${pct(strangerGot)}`);
} finally {
  await close();
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
