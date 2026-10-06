#!/usr/bin/env node
/**
 * The three rides that barely moved anything, each as the thing it stands for
 * (PLAN 27a–c).
 *
 *   npm run rides          (the stir's curve in node; the plate in the lab: any adapter that computes)
 *
 * What was reported: "beat squeeze doesn't do too much (if anything). Also
 * turbulence and plate rock don't appear to do too much either." The Mac's
 * `npm run controls` on main, with the band playing and some forty kicks heard
 * on each look, agreed: turned from a look's own value to the far end of the
 * range, the picture changed by more than the look's own drift on 5 looks of
 * 20 for Turbulence, 6 for Beat Squeeze and 9 for Plate Rock.
 *
 * Each claim here is about the physics the ride stands for, with the old
 * reading printed beside it where the lab can still make it:
 *
 *   1. Plate Rock tips the plate, and the colour where it is thicker than the
 *      plate's mean slides downhill through the clear liquid, which rises past
 *      it: a pool goes down the tilt, the other way when the tilt turns, the
 *      plate's mean flow under it a small share of the pool's, and nothing at
 *      all with the plate level. An evenly coloured plate tipped does not
 *      move (no part of it is heavier than the rest). In a liquid 7.9 times
 *      thicker the pool goes 7.9 times slower, to 25% (Darcy).
 *   2. And at the app's full Plate Rock, kicked as the frame loop kicks it
 *      (its spring, a kick every half second at a bass of 0.8), forty pools of
 *      colour move: the dye's change against the same plate left still is at
 *      least a third of what a look's own stir (Turbulence 0.3 with the band)
 *      makes in the same two seconds. The old reading (the rock through the
 *      lasting current, 0.2 × the swing × tanh of the dye over the mean, at
 *      the most the app ever handed it) is printed beside it.
 *   3. Beat Squeeze presses the glass across the dish: a kick at the default
 *      squeeze and an ordinary kick's bass moves a ring of colour 30 cells
 *      from its centre out by at least 4 cells, a full one at least 9; held
 *      against the old kick (a palm's three discs at 0.0024 × squeeze × bass),
 *      which moved the default's under 3. And let go, the ring comes back at
 *      least three quarters of the way (all of it is the physics; the
 *      colour's first-order carry keeps the rest, PLAN 27b-1). And the
 *      ferrofluid poured round Classic's middle stays where it was poured
 *      through four kicks (its carry keeps up with the press, PLAN 27b-2).
 *   5. Plate Rock's cover glass (PLAN 27a-1): the top glass rides on the film
 *      in the bottom glass's bowl, a damped pendulum (rests at R_c sinθ, or
 *      against the rim; swings at about 1 Hz on oil; creeps in glycerine),
 *      and on a plate whose colour is spread evenly, which the tilt alone
 *      cannot move, its slide sloshes the picture.
 *   4. Turbulence's dial reaches: with the band playing (energy 0.8, Sound
 *      Drive 0.45) full stirs at least four times as fast as 0.5 (it was 1.33
 *      times), a look's own 0.3 stays within 10% of what it was, and in the
 *      lab the plate's mean speed follows the stir it is given (full at least
 *      three times 0.5's).
 *
 * And any GPU validation error fails the run: a pass that never ran would read
 * as stillness.
 */
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── 4, the curve, in node ───────────────────────────────────────────
const out = 'node_modules/.cache/rides-lib.mjs';
await build({ stdin: { contents: "export * from './src/lib/stir.ts'; export * from './src/lib/squish.ts'; export * from './src/lib/plateRock.ts';", resolveDir: '.', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
const { stirOf, stirBefore, kickDepth, KICK_RADII, kickRock, stepRock, rockSwing, swayAt, CUR_ROCK,
  stepCover, coverDrag, BOWL_RADIUS, COVER_ROOM } = await import(`../${out}`);
const { createNoise2D } = await import('simplex-noise');
// The app's sway noise, on a fixed table (the app keys its own on the show's seed).
let seedN = 11;
const noise = createNoise2D(() => ((seedN = (seedN * 16807) % 2147483647) / 2147483647));

/*
  The plate's tilt, step by step, as the frame loop makes it (lib/plateRock.ts):
  a kick every half second at a bass of 0.8, the spring stepped at 60 a
  second, and the sway (swayAt, from `t0` seconds) with `sway` on. `before` is
  the dial as it was, applied twice: the kick's shove was 14 × R, which is
  kickRock's 7 at twice R's bass, and the swing × R again.
*/
const tilts = ({ R, sway = false, t0 = 0, kicks = true, before = false }) => {
  const rock = { x: 0, y: 0, vx: 0, vy: 0, phase: 0.7 };
  const out = [];
  for (let k = 0; k < 120; k++) {
    if (kicks && R > 0 && k % 30 === 0) kickRock(rock, before ? 0.8 * 2 * R : 0.8, 1);
    stepRock(rock, 1 / 60);
    const [sx, sy] = rockSwing(rock, R, ...(sway ? swayAt(noise, t0 + k / 60) : [0, 0]));
    out.push([sx * CUR_ROCK, sy * CUR_ROCK]);
  }
  return out;
};
/*
  The same rock with the cover glass riding it (stepCover, PLAN 27a-1): a
  step's tilt and the glass's slide, m/s, for a liquid of Thickness `t`.
*/
const glassDrag = (t) => coverDrag(t);
const covers = ({ R, t = 0.45, steps = 120 }) => {
  const rock = { x: 0, y: 0, vx: 0, vy: 0, phase: 0.7 }, cover = { x: 0, y: 0, vx: 0, vy: 0 };
  const out = [];
  for (let k = 0; k < steps; k++) {
    if (R > 0 && k % 30 === 0) kickRock(rock, 0.8, 1);
    stepRock(rock, 1 / 60);
    const [sx, sy] = rockSwing(rock, R, 0, 0);
    // The plate's sinθ as the solver takes it: the hold's tilt (swing × 0.004) × 10 and the rock × CUR_ROCK (LiquidVisualizer's step).
    const tx = sx * (0.04 + CUR_ROCK), ty = sy * (0.04 + CUR_ROCK);
    stepCover(cover, tx, ty, glassDrag(t), 1 / 60);
    out.push([tx, ty, cover.vx, cover.vy]);
  }
  return out;
};
const BAND = [0.8, 0.45];
{
  const now = stirOf(1, ...BAND) / stirOf(0.5, ...BAND), was = stirBefore(1, ...BAND) / stirBefore(0.5, ...BAND);
  const look = stirOf(0.3, ...BAND) / stirBefore(0.3, ...BAND);
  check('Turbulence: with the band playing, full stirs at least four times as fast as half way', now >= 4 && was < 2,
    `${now.toFixed(2)}× (it was ${was.toFixed(2)}×)`);
  check('and a look\'s own 0.3 stirs within 10% of what it did', Math.abs(look - 1) < 0.1, `${look.toFixed(3)} of before`);
  check('and nothing at 0, with or without the band', stirOf(0, ...BAND) === 0 && stirOf(0, null, 0.45) === 0);
}

{
  const peak = (t) => Math.max(...t.map(([x, y]) => Math.hypot(x, y)));
  const now = peak(tilts({ R: 0.45 })) / peak(tilts({ R: 1 })), was = peak(tilts({ R: 0.45, before: true })) / peak(tilts({ R: 1, before: true }));
  check('Plate Rock\'s dial is the hand\'s tilt, once: the default 0.45 tips the plate 0.45 of full', Math.abs(now - 0.45) < 0.01 && was < 0.25,
    `${now.toFixed(3)} of full (it was ${was.toFixed(3)}, the dial squared); full tips it ${peak(tilts({ R: 1 })).toFixed(3)} (sinθ)`);
}

{
  /*
    5a. The cover glass as the pendulum it is (lib/plateRock.ts). Held
    tipped two degrees it comes to rest where the bowl's curve holds it,
    R_c sinθ (6 mm in the 0.18 m bowl); tipped further it stops against the
    rim (COVER_ROOM). Let go it swings at its own √(g/R_c), about 1.2 Hz. And
    in glycerine the film holds it (τ = m_A h/μ is three hundredths of a
    second, against the swing's 0.16): let go, it creeps back without ever
    swinging past the middle.
  */
  const hold = (sin, t, seconds) => {
    const c = { x: 0, y: 0, vx: 0, vy: 0 };
    for (let k = 0; k < seconds * 240; k++) stepCover(c, sin, 0, glassDrag(t), 1 / 240);
    return c;
  };
  const two = Math.sin(2 * Math.PI / 180), twelve = 0.2;
  const rest = hold(two, 0.45, 20).x, stop = hold(twelve, 0.45, 20).x;
  check('Plate Rock\'s cover glass: tipped 2° it rests where the bowl holds it, tipped 12° against the rim',
    Math.abs(rest / (BOWL_RADIUS * two) - 1) < 0.02 && Math.abs(stop - COVER_ROOM) < 1e-9,
    `${(rest * 1000).toFixed(2)} mm (R_c sinθ ${(BOWL_RADIUS * two * 1000).toFixed(2)}), ${(stop * 1000).toFixed(1)} mm at 12° (the rim ${(COVER_ROOM * 1000).toFixed(0)} mm)`);
  const c = { x: 0.01, y: 0, vx: 0, vy: 0 };
  const crossings = [];
  for (let k = 1; k < 240 * 6; k++) { const was = c.x; stepCover(c, 0, 0, glassDrag(0.45), 1 / 240); if (was > 0 !== c.x > 0) crossings.push(k / 240); }
  const hz = crossings.length > 2 ? (crossings.length - 1) / (2 * (crossings[crossings.length - 1] - crossings[0])) : 0;
  check('let go on the default oil it swings at about 1.2 Hz, near the hand\'s 0.9', hz > 1.05 && hz < 1.3, `${hz.toFixed(3)} Hz, ${crossings.length} crossings in 6 s`);
  const swings = (t) => {
    const g = { x: 0.01, y: 0, vx: 0, vy: 0 };
    let n = 0;
    for (let k = 1; k < 240 * 6; k++) { const was = g.x; stepCover(g, 0, 0, glassDrag(t), 1 / 240); if (was > 0 !== g.x > 0) n++; }
    return { n, left: g.x };
  };
  const gly = swings(1);
  check('and in glycerine the film holds it: let go, it creeps back to the middle without once swinging past it',
    gly.n === 0 && gly.left < 0.01 && crossings.length >= 6, `${gly.n} crossings, ${(gly.left * 1000).toFixed(2)} mm of 10 left after 6 s; on the oil ${crossings.length}`);
}

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
try {
  const r = await page.evaluate(async ({ KICK_RADII, kicks, stirs, rocks, glasses }) => {
    const res = {};
    const DEF = 0.45, THICK = 0.75;
    // The app's plate at the default Speed: its step and its glass (lift.mjs's APP_GLASS).
    const app = (N, mean = 0) => ({ thinGap: 1, gapThickness: DEF, dt: 0.003, advection: 0.45, gapSpring: 0.00048, turbDetail: 3, meanDensity: mean, maxCurrent: 0.75 / (0.003 * 0.45 * (N - 2)), currentDamp: 0.99 });
    const dyeA = async () => { const f = await lab.field('dye'); const a = new Float32Array(f.length / 4); for (let i = 0; i < a.length; i++) a[i] = f[i * 4 + 3]; return a; };
    const meanOf = (a) => { let s = 0; for (const x of a) s += x; return s / a.length; };

    // ── 1. A pool on a tipped plate ────────────────────────────────────
    {
      const N = 128;
      const inDish = (i, j) => Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) < 0.4;
      const flow = async () => {
        const v = await lab.field('vel'), d = await lab.field('dye');
        let n = 0, mx = 0, my = 0, w = 0, cx = 0, cy = 0, sp = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          if (!inDish(i, j)) continue;
          const k = (i + j * N) * 4, a = d[k + 3];
          mx += v[k]; my += v[k + 1]; sp += Math.hypot(v[k], v[k + 1]); n++;
          w += a; cx += a * v[k]; cy += a * v[k + 1];
        }
        return { mx: mx / n, my: my / n, speed: sp / n, colourVx: cx / Math.max(w, 1e-9), colourVy: cy / Math.max(w, 1e-9) };
      };
      const pool = async (t, tilt, even = false) => {
        await lab.create(N, N);
        if (even) lab.dye(0.5, 0.5, 5, [1, 0, 0], 1); else lab.dye(0.5, 0.5, 0.08, [1, 0, 0], 1);
        lab.flush();
        const mean = meanOf(await dyeA());
        // Thirty steps: steady for both liquids (their drag times are 0.1 s and 0.013 s; forces.mjs).
        await lab.step(30, { ...app(N, mean), gapThickness: t, gapSpring: 0, rockX: tilt[0], rockY: tilt[1] });
        return flow();
      };
      const TIP = 0.2;   // the app's full Plate Rock on a strong kick, about twelve degrees
      res.down = await pool(DEF, [TIP, 0]);
      res.up = await pool(DEF, [-TIP, 0]);
      res.diag = await pool(DEF, [0, TIP]);
      res.level = await pool(DEF, [0, 0]);
      res.thick = await pool(THICK, [TIP, 0]);
      res.even = await pool(DEF, [TIP, 0], true);
    }

    // ── 2 and 4. Forty pools, rocked as the app rocks them, and stirred ──
    {
      const N = 192;
      const seed = () => {
        let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
        for (let k = 0; k < 40; k++) lab.dye(0.1 + 0.8 * r(), 0.1 + 0.8 * r(), 0.03 + 0.05 * r(), [r(), r(), r()], 0.5 + r());
        lab.flush();
      };
      // `tilt`: the plate's tilt a step, from tilts() in node (the app's own spring).
      const run = async ({ tilt = null, oldRock = false, turb = 0 }) => {
        await lab.create(N, N); seed();
        const mean = meanOf(await dyeA());
        await lab.step(2, app(N, mean));
        const snaps = [];
        let vsum = 0, vn = 0;
        for (let k = 0; k < 120; k++) {
          const over = { ...app(N, mean), turbScale: turb, rockX: tilt ? tilt[k][0] : 0, rockY: tilt ? tilt[k][1] : 0 };
          /*
            The old reading: the same tilt through the lasting current on
            the old plate's terms. The lab can no longer route a thin gap's
            rock there, so it is the old plate's whole step, which is what
            a thin gap took the current from; printed, not judged.
          */
          if (oldRock) over.thinGap = 0;
          await lab.step(1, over);
          if (k % 10 === 9) {
            snaps.push(await dyeA());
            if (turb) { const v = await lab.field('vel'); for (let i = 0; i < v.length; i += 4) { vsum += Math.hypot(v[i], v[i + 1]); vn++; } }
          }
        }
        return { snaps, speed: vn ? vsum / vn : 0 };
      };
      const still = await run({});
      const tot = still.snaps[0].reduce((a, b) => a + b, 0);
      const moved = (o) => Math.max(...o.snaps.map((sn, i) => { let d = 0; for (let k = 0; k < sn.length; k++) d += Math.abs(sn[k] - still.snaps[i][k]); return d / tot; }));
      const full = await run({ tilt: rocks.full }), half = await run({ tilt: rocks.def });
      const before = await run({ tilt: rocks.before, oldRock: true }), beforeDef = await run({ tilt: rocks.beforeDef, oldRock: true });
      const sway = await run({ tilt: rocks.sway }), sway2 = await run({ tilt: rocks.sway2 });
      res.rockFull = moved(full); res.rockDefault = moved(half); res.rockBefore = moved(before); res.rockBeforeDefault = moved(beforeDef); res.sway = Math.max(moved(sway), moved(sway2));
      res.stir = {};
      for (const [name, s] of Object.entries(stirs)) { const o = await run({ turb: s }); res.stir[name] = { moved: moved(o), speed: o.speed }; }
    }

    // ── 5b. An evenly coloured plate, rocked with its cover glass ──────
    {
      /*
        The dye's weight is even, so the tilt alone moves nothing; the
        colour is red and blue in a checker of 32-cell squares, so a slide
        of the liquid shows as the red moving. `glass` is covers(): the
        tilt and the glass's slide a step.
      */
      const N = 192;
      const lay = () => {
        const d = new Array(N * N * 4).fill(0);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const r = 0.5 + 0.5 * Math.sin(2 * Math.PI * i / 64) * Math.sin(2 * Math.PI * j / 64), k = (i + j * N) * 4;
          d[k] = r; d[k + 2] = 1 - r; d[k + 3] = 1;
        }
        lab.addDye(d); lab.flush();
      };
      const reds = async () => { const f = await lab.field('dye'); const a = new Float32Array(f.length / 4); for (let i = 0; i < a.length; i++) a[i] = f[i * 4]; return a; };
      /*
        Where the checker sits, in cells, inside the middle of the dish: the
        phase of the red against the checker's own wave on each axis (a
        slide of d cells turns it by 2πd/64), so the reading is how far the
        picture went, not how much its pixels changed (which saturates).
      */
      const where = (a) => {
        const K = 2 * Math.PI / 64;
        let sx = 0, cx = 0, sy = 0, cy = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          if (Math.hypot(i + 0.5 - N / 2, j + 0.5 - N / 2) > 0.3 * N) continue;
          const v = a[i + j * N] - 0.5;
          sx += v * Math.sin(K * i) * Math.sin(K * j); cx += v * Math.cos(K * i) * Math.sin(K * j);
          sy += v * Math.sin(K * i) * Math.sin(K * j); cy += v * Math.sin(K * i) * Math.cos(K * j);
        }
        return [Math.atan2(-cx, sx) / K, Math.atan2(-cy, sy) / K];
      };
      const run = async (glass, { cover = true, t = DEF, turb = 0 } = {}) => {
        await lab.create(N, N); lay();
        const mean = meanOf(await dyeA());
        await lab.step(2, { ...app(N, mean), gapThickness: t });
        const snaps = [];
        for (let k = 0; k < 120; k++) {
          const g = glass ? glass[k] : [0, 0, 0, 0];
          await lab.step(1, { ...app(N, mean), gapThickness: t, turbScale: turb, rockX: g[0], rockY: g[1], coverX: cover ? g[2] : 0, coverY: cover ? g[3] : 0 });
          if (k % 10 === 9) snaps.push(await reds());
        }
        return snaps;
      };
      const still = await run(null), stillThick = await run(null, { t: THICK });
      const tot = still[0].reduce((a, b) => a + b, 0);
      const moved = (o, base = still) => Math.max(...o.map((sn, i) => { let d = 0; for (let k = 0; k < sn.length; k++) d += Math.abs(sn[k] - base[i][k]); return d / tot; }));
      // The farthest the checker went from where the still plate's is, in cells.
      const went = (o, base = still) => Math.max(...o.map((sn, i) => { const [x, y] = where(sn), [x0, y0] = where(base[i]); return Math.hypot(x - x0, y - y0); }));
      const both = (o, base) => ({ moved: moved(o, base), cells: went(o, base) });
      res.evenTilt = both(await run(glasses.full, { cover: false }));
      res.evenFull = both(await run(glasses.full));
      res.evenDefault = both(await run(glasses.def));
      res.evenThick = both(await run(glasses.thick, { t: THICK }), stillThick);
      res.evenStir = both(await run(null, { turb: stirs['a look\'s 0.3'] }));
    }

    // ── 3. A kick's press ──────────────────────────────────────────────
    {
      const N = 192;
      const ring = async () => {
        const f = await lab.field('dye'); let s = 0, w = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = f[(i + j * N) * 4 + 3]; if (a < 0.05) continue; s += a * Math.hypot(i + 0.5 - 96, j + 0.5 - 96); w += a; }
        return s / w;
      };
      const kick = async (radii, amount, R0 = 30) => {
        await lab.create(N, N);
        for (let a = 0; a < 64; a++) { const t = a / 64 * 2 * Math.PI; lab.dye(0.5 + Math.cos(t) * R0 / N, 0.5 + Math.sin(t) * R0 / N, 2.5 / N, [1, 0, 0], 1); }
        lab.flush();
        const over = app(N, 0);
        await lab.step(2, over);
        const r0 = await ring();
        for (const r of radii) lab.squish(96, 96, r, amount, 0, 'press', 0, true);
        lab.flush(over.dt);
        await lab.step(9, over, true);   // held, KICK_HOLD
        const held = await ring();
        // Let go over a third of a second (KickRelease), in the shape it was pressed.
        for (let k = 0; k < 20; k++) { for (const r of radii) lab.squish(96, 96, r, -amount / 20, 0, 'press', 0, true); lab.flush(over.dt); await lab.step(1, over, true); }
        await lab.step(60, over);
        return { r0, out: held - r0, back: (await ring()) - r0 };
      };
      const app_ = KICK_RADII.map((r) => Math.round(r * 1.5));
      res.kickDefault = await kick(app_, kicks.def);
      res.kickFull = await kick(app_, kicks.full);
      res.kickBefore = await kick([40, 27, 15].map((r) => Math.round(r * 1.5)), kicks.before);
      // The dish-wide glass against the palm at the same depth, read 70 cells out: past the palm's
      // outer disc (60), inside the glass's (96). Only a press across the dish moves it far.
      res.far = await kick(app_, kicks.def, 70);
      res.farPalm = await kick([40, 27, 15].map((r) => Math.round(r * 1.5)), kicks.def, 70);
    }
    // ── 3b. The ferrofluid under the kicks ─────────────────────────────
    {
      const N = 256, G = N / 128, over = app(N, 0);
      const { settings: L, pour } = lab.look('classic');
      const ringOut = async () => {
        const f = await lab.phase(); let t = 0, s = 0, disc = 0, dn = 0;
        for (let y = 0; y < f.n; y++) for (let x = 0; x < f.n; x++) {
          const v = f.data[x + y * f.n], d = Math.hypot((x + 0.5) / f.n - 0.5, (y + 0.5) / f.n - 0.5);
          t += v; s += v * d; if (d < 0.12) { disc += v; dn++; }
        }
        return { r: s / t, disc: disc / dn };
      };
      const kicked = async (amount) => {
        await lab.create(N, N);
        lab.pour(pour, L.phaseScale ?? 1); lab.flush();
        await lab.step(2, over);
        const before = await ringOut();
        let held = null;
        // Four kicks near the middle, where the app lands them (30 cells of 128 either way), each held and let go as a kick is.
        let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
        for (let k = 0; k < 4; k++) {
          const cx = N / 2 + rnd() * 60 * G, cy = N / 2 + rnd() * 60 * G;
          for (const r of KICK_RADII) lab.squish(cx, cy, Math.round(r * G), amount, 0, 'press', 0, true);
          lab.flush(over.dt);
          await lab.step(9, over, true);
          if (k === 0) held = await ringOut();
          for (let j = 0; j < 20; j++) { for (const r of KICK_RADII) lab.squish(cx, cy, Math.round(r * G), -amount / 20, 0, 'press', 0, true); lab.flush(over.dt); await lab.step(1, over, true); }
          await lab.step(1, over);
        }
        return { before, held, after: await ringOut() };
      };
      res.ferro = await kicked(kicks.classic);
    }
    return res;
  }, {
    KICK_RADII,
    glasses: { full: covers({ R: 1 }), def: covers({ R: 0.45 }), thick: covers({ R: 1, t: 0.75 }) },
    kicks: { def: kickDepth(0.5, 0.7, 1), full: kickDepth(1, 1, 1), before: 0.0024 * 0.5 * 0.7, classic: kickDepth(0.5, 0.7, 1) },
    stirs: { 'a look\'s 0.3': stirOf(0.3, ...BAND), '0.5': stirOf(0.5, ...BAND), full: stirOf(1, ...BAND) },
    rocks: { full: tilts({ R: 1 }), def: tilts({ R: 0.45 }), before: tilts({ R: 1, before: true }), beforeDef: tilts({ R: 0.45, before: true }), sway: tilts({ R: 0.45, sway: true, kicks: false }), sway2: tilts({ R: 0.45, sway: true, t0: 40, kicks: false }) },
  });

  // 1.
  const { down, up, diag, level, thick, even } = r;
  check('Plate Rock: a pool on a tipped plate slides downhill, and the other way when the tilt turns',
    down.colourVx > 0.02 && up.colourVx < -0.02 && Math.abs(down.colourVx + up.colourVx) < 0.1 * down.colourVx && Math.abs(down.colourVy) < 0.1 * down.colourVx && diag.colourVy > 0.5 * down.colourVx,
    `pool ${down.colourVx.toFixed(4)} down, ${up.colourVx.toFixed(4)} tipped back, ${diag.colourVy.toFixed(4)} tipped the other axis`);
  check('through the clear liquid, which rises past it: the plate\'s mean flow under 5% of the pool\'s',
    Math.hypot(down.mx, down.my) < 0.05 * down.colourVx, `mean ${Math.hypot(down.mx, down.my).toExponential(2)} against ${down.colourVx.toFixed(4)}`);
  check('and level, it stays', Math.abs(level.colourVx) < 0.02 * down.colourVx && level.speed < 0.02 * down.colourVx,
    `pool ${level.colourVx.toExponential(1)}, plate ${level.speed.toExponential(1)}`);
  check('an evenly coloured plate tipped does not move: nothing in it is heavier than the rest',
    even.speed < 0.02 * down.colourVx, `mean speed ${even.speed.toExponential(2)} against the pool's ${down.colourVx.toFixed(4)}`);
  const ratio = down.colourVx / Math.max(thick.colourVx, 1e-9);
  check('in a liquid 7.9 times thicker it slides 7.9 times slower (Darcy), to 25%', Math.abs(ratio / 7.9 - 1) < 0.25,
    `${ratio.toFixed(2)}× slower`);
  // 2.
  const yard = r.stir['a look\'s 0.3'].moved;
  check('at full Plate Rock, kicked as the app kicks it, the colour moves at least a third as much as a look\'s own stir',
    r.rockFull >= yard / 3 && r.rockDefault > 0.4 * r.rockFull,
    `${r.rockFull.toFixed(3)} at full, ${r.rockDefault.toFixed(3)} at the default 0.45, against the stir's ${yard.toFixed(3)}; before, ${r.rockBefore.toFixed(3)} at full and ${r.rockBeforeDefault.toFixed(3)} at 0.45`);
  /*
    Between kicks the hand sways the glass (lib/plateRock.ts, ±0.35 of the
    swing), and on a thin gap a sway is a tilt the colour slides down. With
    no kicks at all, over two windows of two seconds, it must move the
    colour less than half what the kicks do: a rock, not a plate draining
    to one side in silence (as the old slow lean did, 0.52 held).
  */
  check('and with no kicks the sway alone moves it under half what the kicks do',
    r.sway < 0.5 * r.rockDefault, `${r.sway.toFixed(3)} against the kicks' ${r.rockDefault.toFixed(3)} at 0.45`);
  /*
    5b. The case 27a-1 is about: a plate whose colour is spread evenly, red
    and blue in a checker with the dye's weight the same everywhere. The
    tilt alone moves none of it (its weight is even), and that was all a
    rock did; with the cover glass sliding on the film the whole picture
    sloshes with the hand, at least half as much as a look's own stir moves
    it in the same two seconds, and the dial still reads as a dial (the
    default under nine tenths of full). The thick liquid is printed: its
    glass swings less but drags the liquid at half its speed all the same.
  */
  const e = (o) => `${o.cells.toFixed(1)} cells (changed ${o.moved.toFixed(3)})`;
  check('Plate Rock on an evenly coloured plate: the tilt alone moves nothing, the cover glass slides the picture 5 cells or more at full and changes it at least half as much as a look\'s own stir',
    r.evenTilt.cells < 0.5 && r.evenFull.cells >= 5 && r.evenFull.moved >= 0.5 * r.evenStir.moved,
    `tilt alone ${e(r.evenTilt)}; with the glass ${e(r.evenFull)} at full, the stir changed it ${r.evenStir.moved.toFixed(3)}`);
  check('and the dial is a dial: the default 0.45 slides it under nine tenths of full\'s distance, and more than a third',
    r.evenDefault.cells < 0.9 * r.evenFull.cells && r.evenDefault.cells > r.evenFull.cells / 3,
    `${e(r.evenDefault)} at 0.45; ${e(r.evenThick)} in the thick liquid`);
  // 3.
  const k = (o) => `out ${o.out.toFixed(1)} cells, back to ${o.back.toFixed(1)}`;
  check('Beat Squeeze: a kick at the default presses the glass across the dish and a ring 30 cells out goes 4 cells or more',
    r.kickDefault.out >= 4 && r.kickBefore.out < 3, `${k(r.kickDefault)}; the old palm's kick ${k(r.kickBefore)}`);
  check('and a full one 9 or more', r.kickFull.out >= 9, k(r.kickFull));
  check('and it is the glass across the dish: 70 cells out, past a palm, the ring goes twice as far as under a palm as deep',
    r.far.out >= 2 * r.farPalm.out && r.far.out >= 3, `${r.far.out.toFixed(1)} cells against the palm's ${r.farPalm.out.toFixed(1)}`);
  /*
    All the way back is what the physics says (a squeeze film with nothing
    fingering is Stokes flow, and runs backward), and three quarters is what
    the colour's first-order carry keeps of a deep press: it diffuses the
    ring's edge each way, and the deeper the press the more (PLAN 27b-1,
    with 18a-8's carry).
  */
  const share = (o) => 1 - Math.abs(o.back) / o.out;
  check('let go, the ring comes back at least three quarters of the way', share(r.kickDefault) >= 0.75 && share(r.kickFull) >= 0.75,
    `default ${(100 * share(r.kickDefault)).toFixed(0)}% (${r.kickDefault.back.toFixed(2)} cells short), full ${(100 * share(r.kickFull)).toFixed(0)}% (${r.kickFull.back.toFixed(2)})`);
  /*
    3b. And the ferrofluid is given back too. With the kicks of 27b,
    Classic's ring of ferrofluid was drawn into the middle while the band
    played (`npm run ferrodrift` on the Mac): the glass coming down moves the
    liquid up to 14 cells a step on 256², and the ferrofluid took a fixed six
    substeps of 0.45 of a cell, so it went out short and came back in full,
    a ratchet inward every kick. In the lab, these four kicks took the ring's
    mean distance from the middle from 0.307 to 0.253 of the plate and the
    disc 0.12 round the middle from 0.095 to 0.34. Carried in the colour's
    substep plan (phasePlan), 0.307 to 0.311. The bar is a sixth of that
    pull, either way. And the first kick, held, has to have pushed the ring
    out, or a press that never landed would pass as a ring left alone.
  */
  const fr = r.ferro, moved = fr.after.r - fr.before.r;
  check('and the ferrofluid poured round Classic\'s middle stays where it was poured through four kicks, its mean distance moving under 0.009 of the plate either way',
    fr.held.r - fr.before.r > 0.005 && Math.abs(moved) < 0.009 && fr.after.disc < fr.before.disc + 0.05,
    `pushed out to ${fr.held.r.toFixed(4)} by the first kick, held; ${fr.before.r.toFixed(4)} → ${fr.after.r.toFixed(4)} (${moved >= 0 ? '+' : ''}${moved.toFixed(4)}), the disc 0.12 round the middle ${fr.before.disc.toFixed(3)} → ${fr.after.disc.toFixed(3)}; before the phase took the plan's substeps, 0.307 → 0.253 and the disc 0.095 → 0.34`);
  // 4.
  const s = r.stir;
  check('Turbulence: the plate goes as fast as it is stirred, full at least three times half way',
    s.full.speed >= 3 * s['0.5'].speed && s['0.5'].speed > s['a look\'s 0.3'].speed,
    Object.entries(s).map(([n, o]) => `${n} ${o.speed.toFixed(3)} (moved ${o.moved.toFixed(2)})`).join(', '));
} finally {
  await close();
}
check('no GPU validation errors', gpuErrors.length === 0, gpuErrors.slice(0, 2).join(' | '));

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} ok`);
process.exit(failed.length ? 1 : 0);
