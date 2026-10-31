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
 *      against the rim; swings at its own 1.5 Hz on oil; creeps in
 *      glycerine), and on a plate whose colour is spread evenly, which the
 *      tilt alone cannot move, its slide sloshes the picture the way the
 *      glass went, at 0.2, 0.45 and full each further than the last.
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
await build({ stdin: { contents: "export * from './src/lib/stir.ts'; export * from './src/lib/squish.ts'; export * from './src/lib/plateRock.ts'; export { DISH_METRES, DISH_REST_GAP, DISH_GAP_METRES, thicknessViscosity } from './src/lib/turntable.ts'; export { STRONG_BEAT, WEAK_BEAT } from './src/lib/barGrid.ts'; export { RhythmSheet, stampedVolume } from './src/lib/sheet.ts';", resolveDir: '.', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
const { stirOf, stirBefore, kickDepth, KICK_RADII, kickPress, dentRadius, kickRock, stepRock, rockSwing, swayAt, CUR_ROCK, restingHand, springKick, springStep,
  ROCK_LEVEL_AFTER, ROCK_LEVEL_MOVE, STRONG_BEAT, WEAK_BEAT,
  stepCover, coverDrag, plateSin, HOLD_TILT, BOWL_RADIUS, COVER_ROOM, DISH_METRES, DISH_REST_GAP, DISH_GAP_METRES, thicknessViscosity, RhythmSheet, stampedVolume, KICK_HOLD } = await import(`../${out}`);
const { createNoise2D } = await import('simplex-noise');
// The app's sway noise, on a fixed table (the app keys its own on the show's seed).
let seedN = 11;
const noise = createNoise2D(() => ((seedN = (seedN * 16807) % 2147483647) / 2147483647));

/*
  The plate's tilt, step by step, as the frame loop makes it (lib/plateRock.ts):
  a kick every half second at a bass of 0.8, the hand stepped at 60 a
  second, and the sway (swayAt, from `t0` seconds) with `sway` on. The lab
  has no bar grid, so the hand leans as it does where the grid is unsure:
  on the first kick two beats after the last lean, here every other kick
  (27f-2). `spring` is the hand as it was from 27a to 27f-2, the 0.9 Hz
  spring shoved on every kick (`springKick`), for the before. `before` is
  that spring with the dial as it was before 27a, applied twice: the kick's
  shove was 14 × R, which is the spring's 7 at twice R's bass, and the swing
  × R again.
*/
const tilts = ({ R, sway = false, t0 = 0, kicks = true, before = false, spring = false }) => {
  const rock = restingHand(), old = { x: 0, y: 0, vx: 0, vy: 0, phase: 0.7 };
  const sprung = before || spring;
  const out = [];
  for (let k = 0; k < 120; k++) {
    if (kicks && R > 0 && k % 30 === 0) { if (sprung) springKick(old, before ? 0.8 * 2 * R : 0.8, 1); else kickRock(rock, 0.8, 1); }
    if (sprung) springStep(old, 1 / 60); else stepRock(rock, 1 / 60);
    const [sx, sy] = rockSwing(sprung ? old : rock, R, ...(sway ? swayAt(noise, t0 + k / 60) : [0, 0]));
    out.push([sx * CUR_ROCK, sy * CUR_ROCK]);
  }
  return out;
};
/*
  The same rock with the cover glass riding it (stepCover, PLAN 27a-1): a
  step's tilt (plateSin, as the app's step takes it) and the glass's slide,
  m/s, for a liquid of Thickness `t`, and where the liquid should be by
  then, as a fraction of the dish. The film comes up to half the glass's
  speed (Couette) in its drag time h²/12ν (fluid.ts thinGapDragSeconds,
  which node cannot import: a tenth of a second on the default oil, so the
  liquid trails the glass by six steps, and a sixtieth in the thick one),
  and goes on at the step's 1/60 s, the seconds fluid.ts lays the slide
  with. Without the drag time the lab's slide read a tenth of a second
  late against it, and correlated 0.80 where it does 1.00.
*/
const glassDrag = (t) => coverDrag(t);
const covers = ({ R, t = 0.45, steps = 120, spring = false }) => {
  const rock = spring ? { x: 0, y: 0, vx: 0, vy: 0, phase: 0.7 } : restingHand(), cover = { x: 0, y: 0, vx: 0, vy: 0 };
  const h = DISH_GAP_METRES, catchUp = 1 - Math.exp(-(1 / 60) / (h * h / (12 * thicknessViscosity(t))));
  const out = [];
  let ux = 0, uy = 0, px = 0, py = 0;
  for (let k = 0; k < steps; k++) {
    if (R > 0 && k % 30 === 0) { if (spring) springKick(rock, 0.8, 1); else kickRock(rock, 0.8, 1); }
    if (spring) springStep(rock, 1 / 60); else stepRock(rock, 1 / 60);
    const [sx, sy] = rockSwing(rock, R, 0, 0);
    const tx = plateSin(sx * HOLD_TILT, sx), ty = plateSin(sy * HOLD_TILT, sy);
    stepCover(cover, tx, ty, glassDrag(t), 1 / 60);
    ux += (0.5 * cover.vx - ux) * catchUp; uy += (0.5 * cover.vy - uy) * catchUp;
    px += ux / 60 / DISH_METRES; py += uy / 60 / DISH_METRES;
    out.push([tx, ty, cover.vx, cover.vy, px, py]);
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
    27f-2. The rock told apart from the kick (lib/plateRock.ts). The owner:
    Plate Rock and Beat Squeeze felt the same, because the hand was a spring
    shoved on every kick, at its fastest the moment the kick landed, beside
    the kick's dye burst and press. A song at 120 bpm, a kick on every beat
    at a bass of 0.8, the hand stepped at 60 a second as the frame loop
    steps it, with the bar grid's place for each kick (`places`, of the beat's
    number) or none (the grid unsure). Asked of the hand, not of a moment: how
    many leans over eight bars, on which beats, which way, how fast the hand
    is moving just after a kick against its fastest, and where it is once the
    kicks stop.
  */
  const song = ({ places = null, every = 30, bars = 8, spring = false, quiet = 0 }) => {
    const hand = restingHand(), old = { x: 0, y: 0, vx: 0, vy: 0, phase: 0.7 };
    const steps = every * 4 * bars, leans = [], speeds = [], afterKick = [];
    let px = 0, py = 0, peak = 0, lean = 0;
    for (let k = 0; k < steps + quiet; k++) {
      if (k < steps && k % every === 0) {
        const b = k / every, place = places ? places(b) : null;
        if (spring) springKick(old, 0.8, 1);
        else if (kickRock(hand, 0.8, 1, place, places ? every / 60 : 0)) leans.push({ b, place, to: [hand.toX, hand.toY] });
      }
      if (spring) springStep(old, 1 / 60); else stepRock(hand, 1 / 60);
      const r = spring ? old : hand;
      const v = Math.hypot(r.x - px, r.y - py) * 60;
      px = r.x; py = r.y;
      if (k < steps) { peak = Math.max(peak, v); lean = Math.max(lean, Math.hypot(r.x, r.y)); }
      speeds.push(v);
    }
    /*
      What a kick does to the hand's speed: how much it changes from the step
      before the kick to two steps after, against how much it changes over
      the same three steps half way between kicks. A spring shoved goes from
      wherever it was to its fastest at the kick, far more than it changes
      between; a hand already reaching carries on, and one setting out from
      rest has barely begun 33 ms in, so its speed changes at a kick no more
      than anywhere else.
    */
    const between = [];
    for (let k = every; k < steps; k += every) {
      afterKick.push(Math.abs(speeds[k + 2] - speeds[k - 1]));
      const m = k - Math.round(every / 2);
      between.push(Math.abs(speeds[m + 2] - speeds[m - 1]));
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    return { leans, peak, lean, kickShare: mean(afterKick) / Math.max(mean(between), 1e-9), end: Math.hypot(px, py) };
  };
  const bar = song({ places: (b) => b % 4 });
  const onStrong = bar.leans.every((l) => l.place === 0 || l.place === 2);
  check('Plate Rock leans on the one and on three, and on no other kick: 16 leans in 8 bars of kicks on every beat',
    bar.leans.length === 16 && onStrong, `${bar.leans.length} leans, on ${[...new Set(bar.leans.map((l) => l.place))].join(' and ')} of the bar (0 the one)`);
  const turns = bar.leans.slice(1).map((l, i) => { const p = bar.leans[i].to; return (l.to[0] * p[0] + l.to[1] * p[1]) / (Math.hypot(...l.to) * Math.hypot(...p)); });
  check('each lean tips the dish the other way, the axis turning a little each time',
    turns.every((c) => c < -0.8 && c > -0.999), `consecutive leans at ${Math.min(...turns).toFixed(3)} to ${Math.max(...turns).toFixed(3)} (cos of the angle between them)`);
  const half = song({ places: (b) => (b % 2 ? WEAK_BEAT : STRONG_BEAT) });
  const unsure = song({}), eighths = song({ every: 15 });
  check('where the grid knows only the half bar it leans on the strong beats, and where it is unsure on every other kick, and on eighths a lean a second',
    half.leans.length === 16 && unsure.leans.length === 16 && eighths.leans.length === 8,
    `${half.leans.length} and ${unsure.leans.length} leans in 16 s, ${eighths.leans.length} in 8 s of eighths`);
  const was = song({ spring: true });
  check('the rock is not a pulse on the kick: the hand\'s speed changes no more across a kick than half way between kicks (the spring\'s, three times as much or more)',
    bar.kickShare <= 1 && was.kickShare >= 3, `${bar.kickShare.toFixed(2)}× as much (the spring: ${was.kickShare.toFixed(2)}×), the step before to two steps after`);
  /*
    The lean is half the spring's peak (ROCK_LEAN, lib/plateRock.ts): held
    for most of a half bar where the spring passed through its peak, a lean
    as steep moved the colour three times as far (the lab below, 0.62 against
    the spring's 0.20 at the default), so the hand tips the dish half as far
    and moves the colour further than the spring did, not three times.
  */
  check('and tips the plate half as far as the spring\'s peak, holding it longer: the peak lean within 15% of half the spring\'s',
    Math.abs(bar.lean / (0.5 * was.lean) - 1) < 0.15, `${bar.lean.toFixed(3)} against the spring's ${was.lean.toFixed(3)} (before the slider)`);
  const stops = song({ places: (b) => b % 4, quiet: Math.round(60 * (ROCK_LEVEL_AFTER + ROCK_LEVEL_MOVE + 0.2)) });
  check('and when the kicks stop the hand puts the dish down level, where a held lean would slide the colour to one side',
    stops.end < 1e-6, `${stops.end.toExponential(1)} left of a lean of ${stops.lean.toFixed(2)}, ${(ROCK_LEVEL_AFTER + ROCK_LEVEL_MOVE + 0.2).toFixed(1)} s after the last kick`);
}

{
  /*
    5a. The cover glass as the pendulum it is (lib/plateRock.ts). Held
    tipped two degrees it comes to rest where the bowl's curve holds it,
    R_c sinθ (3.8 mm in the 0.11 m bowl); tipped 25° it stops against the
    rim (COVER_ROOM), which R_c sinθ would put past it. Let go it swings at
    its own √(g/R_c), 1.5 Hz. And in glycerine the film holds it (τ = m_A
    h/μ is three hundredths of a second, against the swing's 0.1): let go
    from a centimetre, it creeps back without ever swinging past the middle,
    and is back to under a tenth of a millimetre in the six seconds (the
    oil's swing takes twelve to die down that far, and with the drag lost
    it never would; "under a centimetre", as this read, passed either).
  */
  const hold = (sin, t, seconds) => {
    const c = { x: 0, y: 0, vx: 0, vy: 0 };
    for (let k = 0; k < seconds * 240; k++) stepCover(c, sin, 0, glassDrag(t), 1 / 240);
    return c;
  };
  const two = Math.sin(2 * Math.PI / 180), steep = Math.sin(25 * Math.PI / 180);
  const rest = hold(two, 0.45, 20).x, stop = hold(steep, 0.45, 20).x;
  check('Plate Rock\'s cover glass: tipped 2° it rests where the bowl holds it, tipped 25° against the rim',
    Math.abs(rest / (BOWL_RADIUS * two) - 1) < 0.02 && Math.abs(stop - COVER_ROOM) < 1e-9 && BOWL_RADIUS * steep > COVER_ROOM,
    `${(rest * 1000).toFixed(2)} mm (R_c sinθ ${(BOWL_RADIUS * two * 1000).toFixed(2)}), ${(stop * 1000).toFixed(1)} mm at 25° (the rim ${(COVER_ROOM * 1000).toFixed(0)} mm, R_c sinθ ${(BOWL_RADIUS * steep * 1000).toFixed(0)})`);
  const c = { x: 0.01, y: 0, vx: 0, vy: 0 };
  const crossings = [];
  for (let k = 1; k < 240 * 6; k++) { const was = c.x; stepCover(c, 0, 0, glassDrag(0.45), 1 / 240); if (was > 0 !== c.x > 0) crossings.push(k / 240); }
  const hz = crossings.length > 2 ? (crossings.length - 1) / (2 * (crossings[crossings.length - 1] - crossings[0])) : 0;
  const own = Math.sqrt(9.81 / BOWL_RADIUS) / (2 * Math.PI);
  check('let go on the default oil it swings at its own √(g/R_c), 1.5 Hz, to 5%', Math.abs(hz / own - 1) < 0.05 && hz > 1.4 && hz < 1.6,
    `${hz.toFixed(3)} Hz (√(g/R_c) ${own.toFixed(3)}), ${crossings.length} crossings in 6 s`);
  const swings = (t) => {
    const g = { x: 0.01, y: 0, vx: 0, vy: 0 };
    let n = 0;
    for (let k = 1; k < 240 * 6; k++) { const was = g.x; stepCover(g, 0, 0, glassDrag(t), 1 / 240); if (was > 0 !== g.x > 0) n++; }
    return { n, left: g.x };
  };
  const gly = swings(1);
  check('and in glycerine the film holds it: let go, it creeps back to the middle without once swinging past it',
    gly.n === 0 && gly.left > 0 && gly.left < 1e-4 && crossings.length >= 6, `${gly.n} crossings, ${(gly.left * 1000).toExponential(1)} mm of 10 left after 6 s; on the oil ${crossings.length}`);
}

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
try {
  // The sheet's dent radius on the lab's 192 plate (GRID_SCALE 1.5), at the default Thickness, as kickPress lays it.
  const SHEET_CELLS = Math.round(kickPress(thicknessViscosity(0.45), 0).radii[0] * 1.5);
  // The ring the sheet's dent is read on, three quarters of the way out to its zero (sheetKick, and why not the glass's 30).
  const SHEET_RING = Math.round(0.75 * SHEET_CELLS);
  const r = await page.evaluate(async ({ KICK_RADII, SHEET, kicks, stirs, rocks, glasses }) => {
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
      res.rockSpring = moved(await run({ tilt: rocks.spring }));
      res.rockFull = moved(full); res.rockDefault = moved(half); res.rockBefore = moved(before); res.rockBeforeDefault = moved(beforeDef); res.sway = Math.max(moved(sway), moved(sway2));
      res.stir = {};
      for (const [name, s] of Object.entries(stirs)) { const o = await run({ turb: s }); res.stir[name] = { moved: moved(o), speed: o.speed }; }
    }

    // ── 5b. An evenly coloured plate, rocked with its cover glass ──────
    // (with the glass free to slide: Frame Sway at full. By default the app seats it, PLAN 27a-7, `npm run framesway`.)
    {
      /*
        The dye's weight is even, so the tilt alone moves nothing; the
        colour is red and blue in a checker of 32-cell squares, so a slide
        of the liquid shows as the red moving. `glass` is covers(): the
        tilt and the glass's slide a step, and where the liquid should be.
        `heavy` makes the red the heavier colour (its weight half again the
        blue's), the control that shows the same tilt does reach the plate.
      */
      const N = 192;
      const lay = (heavy) => {
        const d = new Array(N * N * 4).fill(0);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const r = 0.5 + 0.5 * Math.sin(2 * Math.PI * i / 64) * Math.sin(2 * Math.PI * j / 64), k = (i + j * N) * 4;
          d[k] = r; d[k + 2] = 1 - r; d[k + 3] = heavy ? 0.6 + 0.4 * r : 1;
        }
        lab.addDye(d); lab.flush();
      };
      const reds = async () => { const f = await lab.field('dye'); const a = new Float32Array(f.length / 4); for (let i = 0; i < a.length; i++) a[i] = f[i * 4]; return a; };
      /*
        Where the checker sits, in cells, inside the middle of the dish: the
        phase of the red against the checker's own waves, so the reading is
        how far the picture went, not how much its pixels changed (which
        saturates). The red is S sin K(i−x) sin K(j−y), and its four sums
        against the waves are S cos·cos, −S sin·cos, −S cos·sin and S sin·sin
        of Kx and Ky. Each axis's phase is read from the pair the other
        axis leaves larger; that phase is known to half a period, and the
        checker moved half a period both ways is itself (sin(a+π) sin(b+π)),
        so of the shifts that fit the four sums best the one nearest the
        last read is taken: a read every third step moves under two cells.
        (It read each axis from one pair alone, which turns half a period
        round whenever the other axis has gone past a quarter: the thick
        liquid's slide jumped 30 cells for three reads.) And how much of
        the checker is left to read: a picture stirred to grey has a phase
        too, and it means nothing.
      */
      const where = (a, from = [0, 0]) => {
        const K = 2 * Math.PI / 64;
        let ss = 0, cs = 0, sc = 0, cc = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          if (Math.hypot(i + 0.5 - N / 2, j + 0.5 - N / 2) > 0.3 * N) continue;
          const v = a[i + j * N] - 0.5, si = Math.sin(K * i), ci = Math.cos(K * i), sj = Math.sin(K * j), cj = Math.cos(K * j);
          ss += v * si * sj; cs += v * ci * sj; sc += v * si * cj; cc += v * ci * cj;
        }
        const fits = (x, y) => { const p = K * x, q = K * y; return ss * Math.cos(p) * Math.cos(q) - cs * Math.sin(p) * Math.cos(q) - sc * Math.cos(p) * Math.sin(q) + cc * Math.sin(p) * Math.sin(q); };
        const x0 = (Math.hypot(cs, ss) >= Math.hypot(cc, sc) ? Math.atan2(-cs, ss) : Math.atan2(cc, -sc)) / K;
        const y0 = (Math.hypot(sc, ss) >= Math.hypot(cc, cs) ? Math.atan2(-sc, ss) : Math.atan2(cc, -cs)) / K;
        const can = [];
        for (let m = -4; m <= 4; m++) for (let n = -4; n <= 4; n++) { const x = x0 + 32 * m, y = y0 + 32 * n; can.push([x, y, fits(x, y)]); }
        const best = Math.max(...can.map((c) => c[2]));
        const [x, y] = can.filter((c) => c[2] >= best - 1e-6 * Math.abs(best)).sort((c, d) => Math.hypot(c[0] - from[0], c[1] - from[1]) - Math.hypot(d[0] - from[0], d[1] - from[1]))[0];
        return [x, y, best];
      };
      /*
        A run of 120 steps, read every third: where the checker is, where
        the glass says the liquid should be (in cells), and how much its
        pixels changed against `base`'s at the same step.
      */
      const run = async (glass, { cover = true, t = DEF, turb = 0, heavy = false, base = null, cost = false } = {}) => {
        await lab.create(N, N); lay(heavy);
        const mean = meanOf(await dyeA());
        await lab.step(2, { ...app(N, mean), gapThickness: t });
        const o = { at: [], pred: [], snaps: [], moved: 0, subs: 0, most: 0, drift: 0 };
        for (let k = 0; k < 120; k++) {
          const g = glass ? glass[k] : [0, 0, 0, 0, 0, 0];
          await lab.step(1, { ...app(N, mean), gapThickness: t, turbScale: turb, rockX: g[0], rockY: g[1], coverX: cover ? g[2] : 0, coverY: cover ? g[3] : 0 });
          /*
            The carries' substeps this step, and the glass's drift taken out
            of them (fluid.ts, driftCells), for 5c: only on the runs it reads,
            since each read waits for the step, and on the Mac's slowest
            runners the plate shard has run into its twenty minutes.
          */
          if (cost) {
            const c = await lab.carry();
            o.subs += c.n / 120; o.most = Math.max(o.most, c.n); o.drift = Math.max(o.drift, Math.abs(c.drift[0]), Math.abs(c.drift[1]));
          }
          if (k % 3 !== 2) continue;
          const a = await reds();
          o.at.push(where(a, o.at.length ? o.at[o.at.length - 1] : [0, 0])); o.pred.push(cover ? [g[4] * N, g[5] * N] : [0, 0]);
          if (base) {
            const b = base.snaps[o.snaps.length]; let d = 0, tot = 0;
            for (let q = 0; q < a.length; q++) { d += Math.abs(a[q] - b[q]); tot += b[q]; }
            o.moved = Math.max(o.moved, d / tot);
            o.snaps.push(null);
          } else o.snaps.push(a);
        }
        return o;
      };
      /*
        How the picture went against `base` (the same plate left still):
        the farthest it went, in cells, and the shift fitted to the glass's
        prediction over every read where the checker can still be read
        (over a third of it left): the gain (1 is the liquid at exactly
        half the glass's speed) and the correlation (1 is every read the
        way the glass said; a picture that went the wrong way or merely
        shook scores near 0), and the share of reads it could be read on.
      */
      const fit = (o, base) => {
        let mp = 0, pp = 0, mm = 0, far = 0, said = 0, read = 0, amp = Infinity;
        o.at.forEach(([x, y, a], i) => {
          const [x0, y0, a0] = base.at[i], [px, py] = o.pred[i], dx = x - x0, dy = y - y0;
          amp = Math.min(amp, a / a0);
          if (a < a0 / 3) return;
          read++;
          mp += dx * px + dy * py; pp += px * px + py * py; mm += dx * dx + dy * dy;
          far = Math.max(far, Math.hypot(dx, dy)); said = Math.max(said, Math.hypot(px, py));
        });
        return { cells: far, said, gain: pp > 0 ? mp / pp : 0, corr: pp > 0 && mm > 0 ? mp / Math.sqrt(pp * mm) : 0, amp, read: read / o.at.length, moved: o.moved, subs: o.subs, most: o.most, drift: o.drift };
      };
      const still = await run(null, { cost: true }), stillThick = await run(null, { t: THICK }), stillHeavy = await run(null, { heavy: true });
      res.stillSubs = { subs: still.subs, most: still.most };
      const go = async (glass, opts = {}) => {
        const base = opts.t === THICK ? stillThick : opts.heavy ? stillHeavy : still;
        return fit(await run(glass, { ...opts, base }), base);
      };
      res.evenTilt = await go(glasses.full, { cover: false });
      res.heavyTilt = await go(glasses.full, { cover: false, heavy: true });
      res.evenFull = await go(glasses.full, { cost: true });
      res.evenDefault = await go(glasses.def, { cost: true });
      // The spring's rock (27a to 27f-2), which slides the glass faster: the drift taken out at speed (5c).
      res.springFull = await run(glasses.springFull, { cost: true });
      res.springDefault = await run(glasses.springDef, { cost: true });
      res.evenLow = await go(glasses.low);
      res.evenThick = await go(glasses.thick, { t: THICK });
      res.evenStir = await go(null, { turb: stirs['a look\'s 0.3'] });
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
      /*
        The rhythm sheet (27f-3), on the default oil, read at a ring three quarters of the way
        out to the dent's zero (SHEET.ring) and at the glass's far ring: pressed as the app
        presses it now, the sheet solved (lib/sheet.ts, PLAN 27f-4), a finger held KICK_HOLD
        (nine steps) and the sheet's own motion laid each step after, for as long as the glass's
        kick above takes to be let go and settle (twenty steps and sixty). The near ring was the
        glass's 30 while the dent reached 40 cells of this plate (the 6 mm gap's; three quarters
        of the way out); in the 2 mm gap (PLAN 38r) the film under the sheet drains a
        twenty-seventh as fast (h³/12μ) and the held dent reaches 25 cells, so a ring at 30 sat
        outside the dent, in the lip the sheet lifts past rest, and read 0.9 cells for the 1.5
        asked of a ring inside it. The ring keeps its place in the dent, not its place on the plate.
      */
      const sheetKick = async (amount, R0 = SHEET.ring) => {
        await lab.create(N, N);
        for (let a = 0; a < 64; a++) { const t = a / 64 * 2 * Math.PI; lab.dye(0.5 + Math.cos(t) * R0 / N, 0.5 + Math.sin(t) * R0 / N, 2.5 / N, [1, 0, 0], 1); }
        lab.flush();
        const over = app(N, 0);
        await lab.step(2, over);
        const r0 = await ring();
        lab.sheetPress(0.5, 0.5, amount, SHEET.nu);
        const go = async (n) => { for (let k = 0; k < n; k++) { lab.sheetStep(1 / 60, over.gapSpring); lab.flush(over.dt); await lab.step(1, over, true); } };
        await go(9);
        const held = await ring();
        await go(80);
        return { r0, out: held - r0, back: (await ring()) - r0 };
      };
      res.sheetDefault = await sheetKick(kicks.sheet);
      res.sheetFull = await sheetKick(kicks.sheetFull);
      res.sheetFar = await sheetKick(kicks.sheet, 70);
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
    SHEET: { def: SHEET_CELLS, ring: Math.round(0.75 * SHEET_CELLS), nu: thicknessViscosity(0.45) },
    glasses: { springFull: covers({ R: 1, spring: true }), springDef: covers({ R: 0.45, spring: true }), full: covers({ R: 1 }), def: covers({ R: 0.45 }), low: covers({ R: 0.2 }), thick: covers({ R: 1, t: 0.75 }) },
    kicks: { def: kickDepth(0.5, 0.7, 1), full: kickDepth(1, 1, 1), sheet: kickDepth(0.5, 0.7, 1) * kickPress(thicknessViscosity(0.45), 0).share, sheetFull: kickDepth(1, 1, 1) * kickPress(thicknessViscosity(0.45), 0).share, before: 0.0024 * 0.5 * 0.7, classic: kickDepth(0.5, 0.7, 1) },
    stirs: { 'a look\'s 0.3': stirOf(0.3, ...BAND), '0.5': stirOf(0.5, ...BAND), full: stirOf(1, ...BAND) },
    rocks: { full: tilts({ R: 1 }), def: tilts({ R: 0.45 }), spring: tilts({ R: 0.45, spring: true }), before: tilts({ R: 1, before: true }), beforeDef: tilts({ R: 0.45, before: true }), sway: tilts({ R: 0.45, sway: true, kicks: false }), sway2: tilts({ R: 0.45, sway: true, t0: 40, kicks: false }) },
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
  check('at full Plate Rock, kicked as the app kicks it, the colour moves at least a third as much as a look\'s own stir, and at the default at least as far as the spring moved it',
    r.rockFull >= yard / 3 && r.rockDefault > 0.4 * r.rockFull && r.rockDefault >= r.rockSpring,
    `${r.rockFull.toFixed(3)} at full, ${r.rockDefault.toFixed(3)} at the default 0.45 (the spring shoved on every kick, 27a to 27f-2: ${r.rockSpring.toFixed(3)}), against the stir's ${yard.toFixed(3)}; before 27a, ${r.rockBefore.toFixed(3)} at full and ${r.rockBeforeDefault.toFixed(3)} at 0.45`);
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
    tilt alone moves none of it (its weight is even; with the red made the
    heavier the same tilt does move it, so the tilt reached the plate), and
    that was all a rock did. With the cover glass sliding on the film the
    whole picture sloshes with the hand, the way the glass went and about
    as far as half the glass's travel (Couette, fluid.ts's 0.5): a fitted
    gain between 0.4 and 1.2, with every read the way the glass said
    (correlation over 0.8), and at least half as much change as a look's
    own stir makes in the same two seconds. The dial is a dial at three
    points, each a quarter less than the next: in a shallow clock glass
    the default already drove the glass to the rim and 0.2 slid the
    picture as far as 0.45 (lab: 9.41 cells, 9.37). And in a liquid 7.9
    times as thick the glass swings less but drags the liquid at half its speed
    all the same: the same fit.
  */
  const e = (o) => `${o.cells.toFixed(1)} cells (the glass said ${o.said.toFixed(1)}; gain ${o.gain.toFixed(2)}, correlation ${o.corr.toFixed(2)}, read on ${(o.read * 100).toFixed(0)}% of reads, least checker left ${o.amp.toFixed(2)}, changed ${o.moved.toFixed(3)})`;
  const follows = (o) => o.gain >= 0.4 && o.gain <= 1.2 && o.corr > 0.8 && o.read >= 0.75;
  check('Plate Rock on an evenly coloured plate: the tilt alone moves nothing (and moves it with the red made heavier)',
    r.evenTilt.cells < 0.5 && r.evenTilt.moved < 0.1 * r.heavyTilt.moved && r.heavyTilt.moved >= 0.05,
    `${r.evenTilt.cells.toFixed(2)} cells, changed ${r.evenTilt.moved.toFixed(3)} even; changed ${r.heavyTilt.moved.toFixed(3)} with the red heavier (it sinks through the blue where it lies, ${r.heavyTilt.cells.toFixed(2)} cells as a whole)`);
  check('the cover glass slides the picture 5 cells or more at full, the way the glass went, and changes it at least half as much as a look\'s own stir',
    r.evenFull.cells >= 5 && follows(r.evenFull) && r.evenFull.moved >= 0.5 * r.evenStir.moved,
    `${e(r.evenFull)}; the stir changed it ${r.evenStir.moved.toFixed(3)}`);
  check('and the dial is a dial: 0.2 under three quarters of the default 0.45, and the default under three quarters of full, each the way the glass went',
    r.evenLow.cells < 0.75 * r.evenDefault.cells && r.evenDefault.cells < 0.75 * r.evenFull.cells && follows(r.evenLow) && follows(r.evenDefault),
    `0.2: ${e(r.evenLow)}; 0.45: ${e(r.evenDefault)}`);
  check('and in the thicker liquid it drags the picture at half the glass\'s speed all the same',
    follows(r.evenThick) && r.evenThick.cells >= 1, e(r.evenThick));
  /*
    5c. What the glass costs (PLAN 27a-1, 27a-4). Its drag moves the whole
    film together, a few cells a step, and the carries cut a step into as
    many substeps as their fastest face needs: with that drift in the flow
    they rode, Plate Rock 0.2, 0.45 and full asked for 4.1, 8.0 and 12.2
    substeps a step on the app's 384² solver (lab, 90 steps each) against
    1.0 still, and on the Mac with the band the plate drew half its frames
    (`npm run renders` on main's deploy of 10-10). Now the drift is taken
    out of the flow the carries ride and the fields moved with it (fluid.ts,
    driftCells: a shift by its whole cells, one flux step for the fraction),
    so at the default the glass costs no more substeps than the plate held
    still (1.00 against 1.00, 120 steps), and at full about one more (2.12):
    what is left is the colour the drift piles against the grid's wall where
    the rim meets it, which the tilt drives on (PLAN 27a-6). The
    drift has to have been taken out, a cell a step at full on this 192²
    plate (a run whose glass never moved the film that far would pass this
    vacuously), and the slide above is the same run, fitted against the
    glass: the drift is carried, not dropped.
  */
  /*
    Since 27f-2 the app's rock is a hand that leans half as steeply and
    slides the glass slower (the drift at most 0.71 cells a step at full on
    192², 0.32 at the default), so it no longer drifts the film fast enough
    to ask the drift's removal much. The bars are asked of the hand's rock,
    which is what the app does, and of the old spring's as well, which still
    drifts the film over a cell a step: the guard that the removal ran at
    speed is read there, so it cannot pass on a glass that never moved.
  */
  const cost = (o) => `${o.subs.toFixed(2)} substeps a step (most ${o.most}), drift taken out up to ${o.drift.toFixed(2)} cells a step`;
  check('and the glass costs the carries next to nothing: at the default no more substeps a step than the plate held still, at full under two and a half',
    r.springFull.drift >= 1 && r.springDefault.drift >= 0.4 && r.springDefault.subs <= r.stillSubs.subs + 0.25 && r.springFull.subs <= 2.5 && r.springFull.most <= 3
    && r.evenDefault.subs <= r.stillSubs.subs + 0.25 && r.evenFull.subs <= 2.5 && r.evenFull.most <= 3,
    `the hand's rock: full ${cost(r.evenFull)}; 0.45 ${cost(r.evenDefault)}; the spring's: full ${cost(r.springFull)}; 0.45 ${cost(r.springDefault)}; still ${r.stillSubs.subs.toFixed(2)} (most ${r.stillSubs.most}); before, the drift in the flow asked 8.0 at 0.45 and 12.2 at full on 384²`);
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
    3c. The rhythm sheet (27f-3, lib/squish.ts kickPress; solved in 27f-4,
    lib/sheet.ts). Off the looks that may move the frame the kick presses a
    thin sheet floating on the liquid. Its reach was first the bending
    length alone, (D h³ T / 12 μ)^(1/6), and asked here to go exactly as μ to
    the minus one sixth; the solved sheet has the liquid's weight holding
    it up too, which narrows the thin liquids' dents, so the reach is now
    the solve's (sheetReach; `npm run sheet` holds it against the grid's
    solve): glycerine's narrower than the default oil's narrower than
    water's, and never the glass's dish. Then in the lab, pressed as the
    app presses it, on a ring of colour three quarters of the way out to
    the dent's zero (30 cells of a 40-cell dent in the 6 mm gap, 19 of 25
    in the 2 mm one: sheetKick says why it moved with the dent): the dent
    moves that ring, its push falls off away from it faster than the
    glass's, and let go it comes back as the glass's does.
  */
  {
    const r45 = dentRadius(thicknessViscosity(0.45)), r1 = dentRadius(thicknessViscosity(1)), r0 = dentRadius(thicknessViscosity(0));
    check('Beat Squeeze presses the rhythm sheet off the frame-moving looks: its dent as wide as the solved sheet reaches over the liquid, narrower the thicker',
      r1 < r45 && r45 < r0 && r0 < 0.5 && kickPress(thicknessViscosity(0.45), 0.35).radii === KICK_RADII,
      `a dent ${(128 * r1).toFixed(1)} cells of 128 in glycerine, ${(128 * r45).toFixed(1)} on the default oil, ${(128 * r0).toFixed(1)} in water; the glass's ${KICK_RADII[0]} on a look with Frame Sway`);
    check('and the dent moves the colour inside it, 1.5 cells or more at the default and 4 or more at full',
      r.sheetDefault.out >= 1.5 && r.sheetFull.out >= 4, `${k(r.sheetDefault)}; full ${k(r.sheetFull)} (a ring ${SHEET_RING} cells out in a dent of ${SHEET_CELLS} on the lab's 192)`);
    /*
      What "local" can mean in a film that cannot be squeezed: what a press
      displaces has to go somewhere, so past the dent's edge the colour still
      moves. The stamp sent all its volume out through the whole film to the
      open rim, one over the distance (asked here until 27f-4 as the
      stamp's displaced volume against the glass's, to 25%). The solved
      sheet's push falls off from where it landed, where the glass's
      dish-wide closing moves the middle and the edge alike (the whole
      picture breathing); how far its liquid goes is the sheet's: some into
      the ring round the dent, the rest levelled out to the rim by its
      weight. So the ring 70 cells out moves by the liquid that has left
      that disc, which the solve says itself: the held dent's net volume
      inside 70 cells of the lab's 192 is 0.57 of the stamp's (0.89 inside
      30), and 70 cells out the sheet moves the colour that share of the
      stamp's volume share, to 25% either way. Asked first only as under the
      stamp's share, which a sheet that moved nothing there passed, and so
      did a press only as deep as the stamp's middle, 0.123 (the review of
      #452).
    */
    const vol = (radii, a) => radii.reduce((v, R) => v + a * R * R, 0);
    const wantFar = vol([SHEET_CELLS], 3) / vol(KICK_RADII.map((R) => Math.round(R * 1.5)), 1);
    const solved = (() => {
      const nu = thicknessViscosity(0.45), amount = kickDepth(0.5, 0.7, 1) * kickPress(nu, 0).share;
      const R = kickPress(nu, 0).radii[0] / 128, s = new RhythmSheet();
      s.setLiquid(nu);
      s.pressVolume(0.5, 0.5, stampedVolume(amount, R), R, KICK_HOLD);
      s.step(192, KICK_HOLD, 0, new Float32Array(192 * 192));
      return s.volumeWithin(0.5, 0.5, 70 / 192) / stampedVolume(amount, R);
    })();
    const got = r.sheetFar.out / r.far.out, wantSheet = wantFar * solved;
    check('and is local: its push falls off away from the dent, 70 cells out under 0.6 of the glass\'s falloff, and far off moves the colour as much as the solve says leaves that disc, to 25%',
      r.sheetFar.out / r.sheetDefault.out < 0.6 * (r.far.out / r.kickDefault.out) && Math.abs(got / wantSheet - 1) < 0.25,
      `${SHEET_RING} → 70 cells out the sheet's ring goes ${r.sheetDefault.out.toFixed(2)} → ${r.sheetFar.out.toFixed(2)} cells, the glass's ${r.kickDefault.out.toFixed(1)} → ${r.far.out.toFixed(1)}; far off ${got.toFixed(3)} of the glass's, the solve says ${wantSheet.toFixed(3)} (${solved.toFixed(3)} of the stamp's ${wantFar.toFixed(3)} leaves the disc)`);
    check('let go, it comes back at least three quarters of the way', share(r.sheetDefault) >= 0.75 && share(r.sheetFull) >= 0.75,
      `default ${(100 * share(r.sheetDefault)).toFixed(0)}%, full ${(100 * share(r.sheetFull)).toFixed(0)}%`);
  }
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
