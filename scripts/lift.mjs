#!/usr/bin/env node
/**
 * A press goes round; the lift breaks into fingers (PLAN.md §10 step 4).
 *
 *   npm run lift     (the strokes in node; the plate in the lab: any adapter that computes and renders)
 *
 * What was reported: "a squeeze gives a smooth ring and a lift breaks into
 * fingers; today both finger". Squeezing a Hele-Shaw cell is the stable
 * direction of Saffman–Taylor and lifting the unstable one, and the plate
 * had them the wrong way round: its fingers were drawn on the way down, and
 * the glass came back up as a smooth inflow (lib/squish.ts has the story).
 *
 * The claim is about two moments of one gesture, so this measures both on
 * the same press: while it is held, and once it has let go and the glass has
 * come up. "Fingers" is measured as the plate shows them: the finished
 * picture sampled round a ring about the press, the part of it that goes up
 * and down six to ninety times a turn (a finger is one of those), as a share
 * of the ring's own brightness, and the fingers counted with a trigger that
 * has to swing 5 % of that brightness either way to count one.
 *
 * Why not simply "the lift changes the plate": a lift by the gap's spring
 * alone changes it too, smoothly. So every lab number here has a control on
 * the same press: the old stroke (the press as it was drawn before) to show
 * the measure sees fingers when they are there, and the same press left to
 * the spring with no lift laid, to show the fingers come from the lift and
 * not from the solver unwinding the press.
 *
 * And why a node half at all: the lab can only say what landed. Whether the
 * press is round *by construction* and a drop's splash is untouched (the one
 * stroke that is meant to keep its fingers on the way down) is a question
 * about the drawing, and it has an exact answer.
 */
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

/*
  The glass, a step: its dt, how fast it settles back to rest (the gap's
  spring) and how long a change in the gap keeps driving the squeeze flow
  (its memory). LiquidVisualizer derives all three from the look: dt from
  Global Speed and Plate Pressure, the spring as 1 − 0.5^(dt / (2.2 × (1 −
  Plate Spring) + 0.12)), the memory as 0.5^(dt / 0.22). The lab's own (BASE:
  dt 0.004, spring 0.02, memory 0) is none of them: its spring is forty times
  the default look's, and its memory forgets a lift's dh/dt at once where the
  app's carries it for some three hundred steps. A lift measured on the lab's
  glass was measured on a glass the app never has (uncapped, at half the
  lift's strength as gap, the film opened to 0.053 on it and to 0.081 at the
  default look's spring; check-skeptic, pre-push review), so the gesture runs
  on a look's spring. APP_GLASS is the default look's; FAST_GLASS the fastest
  look's (Lacing Run: its spring 0.0080; Lumia is the slowest, 0.00005), where
  the glass does most of the lifting on its own.

  Only the spring, so far. With the default look's dt (0.00107) and memory
  (0.99665) too, the press's dh/dt, four times the lab's at that dt and
  carried for three hundred steps, drove the dye out of the whole ring
  before the lift began (its mean 0.069 against the 0.5 laid, where the
  check reads nothing to measure). Whether the app's plate does the same
  under a held Press is a question for the Mac (PLAN §10 step 4), and until
  it is answered the lift is measured on the look's spring over the lab's
  flow.
*/
const APP_GLASS = { gapSpring: 0.00048 };
const FAST_GLASS = { gapSpring: 0.00796 };
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── The strokes, as drawn ───────────────────────────────────────────
console.log('The strokes, as drawn\n');
{
  const out = 'node_modules/.cache/lift-squish.mjs';
  await build({ entryPoints: ['src/lib/squish.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
  const { squishDisc, spokesAt, PressLift, PressLifts, RELEASE_MS, LIFT_SECONDS, KickRelease, KICK_HOLD, KICK_RELEASE, KICK_RADII, kickDepth } = await import(`../${out}`);
  /*
    Off the diagonal: a press at (96, 96) could not tell x from y, and a lift
    laid transposed (the check-skeptic's swap of x and y in PressLift) passed
    every check there.
  */
  const S = 192, cx = 113, cy = 85, R = 45;
  const lay = (stroke, fg, amount = 0.004, pile = 0) => {
    const cells = new Map();
    squishDisc(S, cx, cy, R, amount, fg, stroke, pile, (idx, gap, vx, vy, m) => cells.set(idx, { gap, vx, vy, m }));
    return cells;
  };
  /*
    Round by construction: every cell at the same distance from the press
    gets the same gap, the same dye multiplier, and a velocity with no part
    going round. Grouped by squared distance, so there is no binning to hide
    a spoke in: two cells in one group are exactly as far out.
  */
  const roundness = (cells) => {
    const groups = new Map();
    let swirl = 0;
    for (const [idx, c] of cells) {
      const i = (idx % S) - cx, j = Math.floor(idx / S) - cy, d2 = i * i + j * j;
      const g = groups.get(d2) ?? { gap: [], m: [] };
      g.gap.push(c.gap); g.m.push(c.m); groups.set(d2, g);
      swirl = Math.max(swirl, Math.abs(c.vx * j - c.vy * i));
    }
    let spread = 0;
    for (const g of groups.values()) {
      for (const k of ['gap', 'm']) spread = Math.max(spread, Math.max(...g[k]) - Math.min(...g[k]));
    }
    return { spread, swirl };
  };
  const pressCells = lay('press', 0.8, 0.004, 0.016);
  const press = roundness(pressCells);
  check('a press with Fingering up is round: every cell as far out gets the same', press.spread === 0 && press.swirl === 0,
    `largest difference in gap or dye across a ring ${press.spread}`);
  /*
    And is a press. "Round" is also what a press that lays nothing reads as
    (an empty list has no spread: the check-skeptic's first mutation skipped
    every cell with Fingering up and passed), so the same disc as a plain
    press, the film thinned the same everywhere, the centre cleared and the
    rim piled.
  */
  const plainN = lay('press', 0).size;
  const cellAt = (cells, i, j) => cells.get((cx + i) + (cy + j) * S);
  let thinned = 0;
  for (const c of pressCells.values()) if (c.gap === -0.004) thinned++;
  const centre = cellAt(pressCells, 3, 0)?.m ?? 1, rim = cellAt(pressCells, Math.round(0.8 * R), 0)?.m ?? 1, mid = cellAt(pressCells, Math.round(0.55 * R), 0)?.m ?? 1;
  check('and it is a press: the whole disc thinned alike, the centre cleared, the dye piled round the rim',
    pressCells.size === plainN && thinned === plainN && centre < 1 && rim > 1 && mid === 1,
    `${pressCells.size} cells of ${plainN}, ${thinned} thinned by the amount; dye ×${centre.toFixed(4)} at the centre, ×${mid.toFixed(4)} half way, ×${rim.toFixed(4)} at 0.8 of the press`);
  const was = roundness(lay('splash', 0.8, 0.004, 0.016));
  check('and the stroke every press drew before is not (the measure sees spokes)', was.spread > 1e-3,
    `largest difference across a ring ${was.spread.toExponential(2)}`);
  /*
    Fingering 0 is the default and most looks leave it there, so the press
    there must be exactly the press it was: the film thinned by the amount,
    nothing else.
  */
  const plain = lay('press', 0);
  let off = 0;
  for (const c of plain.values()) if (c.gap !== -0.004 || c.vx !== 0 || c.vy !== 0 || c.m !== 1) off++;
  check('with Fingering at 0 a press is only the film thinned, as before', plain.size > 6000 && off === 0, `${off} of ${plain.size} cells differ`);

  /*
    The lift's fingers, counted where they start: round a ring at 0.9 of the
    press, the runs of cells whose film the lift opens. About one run a
    spoke: the warp that makes the sunburst ragged folds back on itself
    where it is strongest, so a spoke can cross the ring twice (22 runs from
    19 spokes, measured), and two can close into one.
  */
  const lift = lay('lift', 0.8, 0.008);
  const ringRuns = (cells, q) => {
    let runs = 0, prev = null, first = null;
    for (let k = 0; k < 720; k++) {
      const t = k / 720 * Math.PI * 2;
      const i = Math.round(Math.cos(t) * q * R), j = Math.round(Math.sin(t) * q * R);
      const on = (cells.get((cx + i) + (cy + j) * S)?.gap ?? 0) > 0;
      if (first === null) first = on;
      if (on && prev === false) runs++;
      prev = on;
    }
    if (first && prev === false) runs++;
    return runs;
  };
  const spokes = spokesAt(cx, cy, 0.8).count;
  const fingers = ringRuns(lift, 0.9);
  check('a lift with Fingering up opens the film along spokes', fingers >= 8 && fingers <= 1.5 * spokes,
    `${fingers} fingers at 0.9 of the press, from ${spokes} spokes`);
  let inward = 0, outward = 0;
  for (const [idx, c] of lift) {
    const i = (idx % S) - cx, j = Math.floor(idx / S) - cy;
    const radial = c.vx * i + c.vy * j;
    if (radial < 0) inward++; else if (radial > 0) outward++;
  }
  check('and draws the liquid in along them, toward the cleared centre', inward > 200 && outward === 0, `${inward} cells pulled in, ${outward} pushed out`);
  /*
    From the rim inward, not from the centre out: a lift whose spokes started
    at the centre (the check-skeptic's `inner = 0`) passed everything else.
    Read as the share of a ring the lift opens, near the centre against near
    the rim.
  */
  const openShare = (cells, q) => {
    let on = 0;
    for (let k = 0; k < 720; k++) {
      const t = k / 720 * Math.PI * 2;
      if ((cells.get((cx + Math.round(Math.cos(t) * q * R)) + (cy + Math.round(Math.sin(t) * q * R)) * S)?.gap ?? 0) > 0) on++;
    }
    return on / 720;
  };
  const nearCentre = openShare(lift, 0.2), nearRim = openShare(lift, 0.9);
  check('and the fingers come in from the rim: far less of a ring near the centre is opened than near the rim', nearCentre < 0.5 * nearRim,
    `${(100 * nearCentre).toFixed(0)} % at 0.2 of the press, ${(100 * nearRim).toFixed(0)} % at 0.9`);
  check('a lift with Fingering at 0 lays nothing', lay('lift', 0, 0.008).size === 0);

  /*
    The press's memory, on a clock of frames: the Press tool held for a
    second, then let go; a kick's squeeze, one frame of it; a new press in
    the middle of a lift.
  */
  const frame = 1000 / 60;
  const pl = new PressLift();
  let t = 1000, heldLift = 0;
  for (let k = 0; k < 60; k++) { pl.press(cx, cy, R, 0.004, 0.8, t); if (pl.step(t, 1 / 60)) heldLift++; t += frame; }
  check('no lift while the press is held', heldLift === 0, `${heldLift} of 60 held frames lifted`);
  const lifts = [];
  for (let k = 0; k < 120; k++) { lifts.push({ at: t, l: pl.step(t, 1 / 60) }); t += frame; }
  const firstLift = lifts.find((x) => x.l);
  const lastLift = [...lifts].reverse().find((x) => x.l);
  const pressEnd = 1000 + 59 * frame;
  check('let go, the lift starts once the press has paused', firstLift && firstLift.at - pressEnd > RELEASE_MS && firstLift.at - pressEnd <= RELEASE_MS + frame + 1,
    firstLift ? `${(firstLift.at - pressEnd).toFixed(0)} ms after the last press` : 'never');
  const amounts = lifts.filter((x) => x.l).map((x) => x.l.amount);
  const falling = amounts.every((a, k) => k === 0 || a <= amounts[k - 1]);
  // A second at the least, a number of the check's own rather than the
  // module's: a lift cut to a tenth of a second passed an upper bound alone.
  check('and dies away as the glass comes up over a second, then stops', falling && lastLift && lastLift.at - pressEnd >= RELEASE_MS + 1000
    && lastLift.at - pressEnd <= RELEASE_MS + LIFT_SECONDS * 1000 + frame && lifts.at(-1).l === null,
    lastLift ? `${amounts.length} lift steps, the last ${(lastLift.at - pressEnd).toFixed(0)} ms after the press, ${amounts[0].toFixed(4)} → ${amounts.at(-1).toFixed(5)}` : '');
  const full = amounts[0];
  const kick = new PressLift();
  kick.press(cx, cy, 60, 0.0024, 0.8, 5000);
  const k1 = kick.step(5000 + RELEASE_MS + 1, 1 / 60);
  const share = k1 ? k1.amount / full : 0;
  check('a tap as shallow as a kick lifts a third as hard a step as a held press, not a tenth', share > 0.2 && share < 0.5, `${(100 * share).toFixed(0)} % of a held press's lift`);
  kick.press(cx, cy, 60, 0.0024, 0.8, 5000 + RELEASE_MS + 40);
  check('a new press stops the lift', kick.step(5000 + RELEASE_MS + 41, 1 / 60) === null);
  const none = new PressLift();
  none.press(cx, cy, R, 0.004, 0, 9000);
  let noneLift = 0;
  for (let k = 1; k < 120; k++) if (none.step(9000 + k * frame, 1 / 60)) noneLift++;
  check('with Fingering at 0 a press never lifts into anything', noneLift === 0);

  /*
    Every press remembered where it is. Two hands: the one let go lifts while
    the other still holds, and each lifts where it was. And a kick of the
    beat squeeze pressing near a hand's lift is its own press, which leaves
    the hand's lift running. One memory for the plate failed all three
    (pre-push review).
  */
  {
    const all = new PressLifts();
    let t = 20000;
    const A = { x: 60, y: 70 }, B = { x: 140, y: 120 };
    for (let k = 0; k < 30; k++) { all.press('hand', A.x, A.y, R, 0.004, 0.8, t); all.press('hand', B.x, B.y, R, 0.004, 0.8, t); t += frame; }
    let fromA = 0, fromB = 0;
    for (let k = 0; k < 30; k++) {
      all.press('hand', B.x, B.y, R, 0.004, 0.8, t);
      for (const l of all.step(t, 1 / 60)) { if (l.x === A.x && l.y === A.y) fromA++; else fromB++; }
      t += frame;
    }
    check('two hands: the one let go lifts, where it was, while the other still holds', fromA > 10 && fromB === 0 && all.held(t),
      `${fromA} lift steps at the first hand, ${fromB} at the second while it held`);
    const one = new PressLifts();
    let u = 30000;
    for (let k = 0; k < 30; k++) { one.press('hand', 96, 96, R, 0.004, 0.8, u); u += frame; }
    u += 200;
    let before = 0, after = 0;
    for (let k = 0; k < 10; k++) { before += one.step(u, 1 / 60).filter((l) => l.x === 96 && l.y === 96).length; u += frame; }
    one.press('kick', 101.3, 88.7, 60, 0.0024, 0.8, u);
    for (let k = 0; k < 10; k++) { after += one.step(u, 1 / 60).filter((l) => l.x === 96 && l.y === 96).length; u += frame; }
    check("a kick pressing near a hand's lift leaves the hand's lift running", before === 10 && after === 10 && one.size === 2,
      `${before} and ${after} of 10 steps lifting the hand, before and after the kick; ${one.size} presses remembered`);
  }

  /*
    A drop's splash is drawn exactly as every press was before this change:
    the reference is the old applySquish, kept here verbatim but for writing
    to a list instead of the plate's arrays.
  */
  const before = (x, y, radius, amount, fingering, pile) => {
    const cells = new Map();
    const r2 = radius * radius;
    const seed = fingering > 0 ? (((x * 73856093) ^ (y * 19349663)) >>> 0) : 0;
    const spokesN = fingering > 0 ? 8 + (seed % 9) + Math.round(8 * fingering) : 0;
    const phase = fingering > 0 ? ((seed >>> 8) % 1000) / 1000 * Math.PI * 2 : 0;
    const spokeGain = fingering * 0.9;
    const spokeProp = (s) => { const h = ((s + 1) * 2654435761 + seed) >>> 0; return { w: 0.5 + ((h & 255) / 255) * 0.9, len: 0.45 + (((h >>> 8) & 255) / 255) * 0.6, k: 0.25 + (((h >>> 16) & 255) / 255) * 0.75 }; };
    const TAU = Math.PI * 2;
    for (let i = -radius; i <= radius; i++) for (let j = -radius; j <= radius; j++) {
      const d2 = i * i + j * j;
      if (d2 >= r2) continue;
      const nx = x + i, ny = y + j;
      if (!(nx > 0 && nx < S - 1 && ny > 0 && ny < S - 1)) continue;
      const idx = nx + ny * S;
      let a = amount, vx = 0, vy = 0, m = 1;
      if (spokesN > 0 && d2 > 0) {
        const theta = Math.atan2(j, i);
        const warped = theta + 0.35 * Math.cos((spokesN * 0.5 + 1) * theta + phase * 1.7) / spokesN * TAU;
        const sIdx = Math.floor(((warped + phase / spokesN) / TAU * spokesN) % spokesN + spokesN) % spokesN;
        const prop = spokeProp(sIdx);
        const raw = Math.cos(spokesN * warped + phase);
        const ang = Math.max(-1, Math.min(1, (raw - (1 - prop.w * 0.85)) / (prop.w * 0.85)));
        a *= Math.max(0.05, 1 + spokeGain * ang * prop.k);
        const dist = Math.sqrt(d2);
        if (dist < radius * 0.3) m *= 1 - Math.min(0.05, amount * 1.4) * fingering * (1 - dist / (radius * 0.3));
        const tipW = pile > 0 && ang > 0.1 ? Math.max(0, 1 - Math.abs(dist - radius * prop.len) / (radius * 0.2)) : 0;
        if (ang > 0 && dist < radius * prop.len) {
          const push = amount * 8 * ang * fingering * prop.k;
          vx += (i / dist) * push; vy += (j / dist) * push;
          if (ang > 0.25 && tipW === 0) m *= 1 - Math.min(0.08, amount * 2.2) * fingering * prop.k * (ang - 0.25) / 0.75 * (0.25 + 0.75 * dist / (radius * prop.len));
        }
        if (tipW > 0) m *= 1 + pile * prop.k * ang * tipW;
      }
      cells.set(idx, { gap: -a, vx, vy, m });
    }
    return cells;
  };
  let diff = 0, n = 0;
  for (const [x, y, r, a, fg, pile] of [[70, 110, 23, 0.0018, 0.6, 0.012], [96, 96, 45, 0.004, 1, 0.02], [150, 40, 12, 0.003, 0.3, 0]]) {
    const want = before(x, y, r, a, fg, pile);
    const got = new Map();
    squishDisc(S, x, y, r, a, fg, 'splash', pile, (idx, gap, vx, vy, m) => got.set(idx, { gap, vx, vy, m }));
    if (got.size !== want.size) diff += Math.abs(got.size - want.size);
    for (const [idx, w] of want) {
      const g = got.get(idx); n++;
      if (!g || g.gap !== w.gap || g.vx !== w.vx || g.vy !== w.vy || g.m !== w.m) diff++;
    }
  }
  check('a drop\'s splash is drawn exactly as before, fingers on the way down', diff === 0 && n > 5000, `${diff} of ${n} cells differ`);

  /*
    Beat Squeeze's press, on a whole cell. Its centre was the middle of the
    plate plus a fraction of thirty cells and was never rounded, so every
    index its disc reported was a fraction, and the plate's typed arrays
    dropped every write: from the day the rhythm plate was written until
    #185 found it, a kick pressed nothing (PLAN §10 step 4). The stroke now
    lands on the nearest cell, whatever it is given. Asked of the kick's own
    three discs at a spread of fractional centres: every index whole, and
    the very cells the rounded centre lays; and every write the stroke
    reports kept by a Float32Array, as the plate keeps them. With the
    rounding taken out of squishDisc the first reads 319,800 fractional and
    the second keeps 0 of 319,800 (check-skeptic ran both), which is what
    the plate did on every kick.
  */
  {
    const S = 256;
    let fractional = 0, whole = 0, differ = 0, kept = 0, laid = 0;
    for (let k = 0; k < 40; k++) {
      const fx = S / 2 + Math.sin(k * 1.7) * 30 + 0.13 + (k % 7) * 0.11, fy = S / 2 + Math.cos(k * 2.3) * 30 + 0.29;
      for (const r of KICK_RADII) {
        const got = new Map(), want = new Map();
        squishDisc(S, fx, fy, r, 0.0024, 0.85, 'press', 0, (idx, gap) => { got.set(idx, gap); if (Number.isInteger(idx)) whole++; else fractional++; });
        squishDisc(S, Math.round(fx), Math.round(fy), r, 0.0024, 0.85, 'press', 0, (idx, gap) => want.set(idx, gap));
        for (const [idx, gap] of want) if (got.get(idx) !== gap) differ++;
        if (got.size !== want.size) differ++;
        // Every write the stroke makes, made the way the plate makes them.
        const plate = new Float32Array(S * S);
        for (const idx of got.keys()) { plate[idx] += 1; laid++; }
        for (const v of plate) if (v !== 0) kept++;
      }
    }
    check('a kick\'s press lands on whole cells, the very ones its rounded centre lays', fractional === 0 && whole > 100000 && differ === 0,
      `${whole} cells whole, ${fractional} fractional, ${differ} different`);
    check('and the plate keeps every write it makes', laid > 100000 && kept === laid, `${kept} of ${laid} writes kept`);
  }

  /*
    And the kick lets go. With the press landing, a kick pressed and never
    released: the only thing bringing the glass back up was the gap's
    spring, half way back in about 24 s on the default look and 50 on the
    Fillmore, against a band kicking twice a second, and the lead plate's
    middle went to the floor a few seconds into a song. `KickRelease` holds
    each kick a moment and gives its gap back over a third of a second.

    Asked on a plate that does what the shader's squeezeUpdate does with the
    deltas (a press closes the gap down to the floor, 0.004; an opening
    stops at rest, 0.030; then the spring), laid as the app's `pressKick`
    lays them, through the same squishDisc and KickRelease: the three discs
    of KICK_RADII at GRID_SCALE (96, 66 and 36 on the app's plate of 192,
    a glass pressed across most of the dish, PLAN 27b) about a centre up to thirty cells at GRID_SCALE off the middle
    (`npm run squeeze` asks the app's own glue), each pressed kickDepth(squeeze, bass, 1), the
    Fillmore's squeeze (0.9) at a bass of 0.7, kicks at 140 bpm (closer than
    a hold and a release, so they overlap), for 40 s, then a second of no
    kicks. On three glasses: none at all (only the release can bring it
    back), the Fillmore's and the default look's. The control is the same
    kicks with no release, which must floor, or the question was never asked;
    and every kick must still show, read under its own centre a tenth of a
    second after it lands (held, before the release starts), or a release
    that gave everything back at once would pass. Read about the plate's
    middle instead, a kick far off it shows only its outer disc
    there and some kicks read a dip of 0.001, as if they had barely pressed.
  */
  {
    const S = 192, REST = 0.03, FLOOR = 0.004;
    // The app's plate: 192 cells, GRID_SCALE 1.5, so the kick's discs are 96, 66 and 36 cells and its centre wanders 45.
    const RADII = KICK_RADII.map((r) => Math.round(r * 1.5)), SPREAD = 30 * 1.5;
    const kickShow = (spring, release, stepsPerSecond = 60, kicksUntil = 40) => {
      const dt = 1 / stepsPerSecond;
      const gap = new Float64Array(S * S).fill(REST), dg = new Float64Array(S * S);
      const rel = new KickRelease();
      const cell = (idx, g) => { dg[idx] += g; };
      let seed = 7;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
      const every = 60 / 140, a = kickDepth(0.9, 0.7, 1);
      const steps = Math.round(41 * stepsPerSecond);
      let nextKick = 0, dips = [], pendingDip = -1, pressed = 0, at = [0, 0];
      const disc = (r, cx = S / 2, cy = S / 2) => { let sum = 0, n = 0, floored = 0; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { if (Math.hypot(x - cx, y - cy) >= r) continue; n++; sum += gap[x + y * S]; if (gap[x + y * S] < 1.5 * FLOOR) floored++; } return { mean: sum / n, floored: floored / n }; };
      for (let st = 0; st < steps; st++) {
        const t = st * dt;
        if (t < kicksUntil && t >= nextKick) {
          nextKick += every;
          const cx = Math.round(S / 2 + rnd() * SPREAD), cy = Math.round(S / 2 + rnd() * SPREAD);
          for (const r of RADII) squishDisc(S, cx, cy, r, a, 0.85, 'press', 0, (idx, g) => { cell(idx, g); if (g) pressed++; });
          if (release) rel.kick(cx, cy, RADII, a);
          pendingDip = Math.round(0.1 * stepsPerSecond); at = [cx, cy];
        }
        if (release) rel.step(S, dt, cell);
        for (let k = 0; k < S * S; k++) {
          let g = gap[k];
          if (dg[k] !== 0) { const d = dg[k]; let g2 = Math.max(FLOOR, g + d); if (d > 0) g2 = Math.min(g2, Math.max(g, REST)); g = g2; dg[k] = 0; }
          gap[k] = g + (REST - g) * spring;
        }
        if (pendingDip >= 0 && pendingDip-- === 0) dips.push(disc(8, at[0], at[1]).mean);
      }
      let far = 0; for (let k = 0; k < S * S; k++) far = Math.max(far, Math.abs(gap[k] - REST));
      return { end: disc(RADII[0]), far, dips, pressed, left: rel.size, steps: rel.steps };
    };
    const glasses = [['no spring at all', 0], ['the Fillmore\'s glass', 0.00023], ['the default look\'s glass', 0.00048]];
    const say = (r) => `${(100 * r.end.floored).toFixed(0)} % of the pressed disc on the floor, its mean ${r.end.mean.toFixed(4)}`;
    const control = kickShow(0.00023, false);
    /*
      "Does not add up" was a fixed floor, the film never under 0.020, set
      when a kick pressed 0.0024 a disc and left 0.0255. A kick presses deeper
      now (kickDepth, PLAN 27b), so the floor is the kick's own: one kick on
      its own, the first of the same show, read the same tenth of a second
      after it lands. Kicks at 140 bpm come closer than a hold and a release,
      so a little of the last is still down when the next lands; more than a
      quarter of a kick's depth below a lone one is a press that builds.
    */
    const lone = kickShow(0, true, 60, 0.01).dips[0];
    check('pressed on every kick and never let go, the lead plate\'s middle goes to the floor', control.end.floored > 0.5 && control.pressed > 100000,
      `on the Fillmore's glass after 40 s at 140 bpm: ${say(control)}`);
    for (const [name, spring] of glasses) {
      const r = kickShow(spring, true);
      const shallowest = Math.max(...r.dips), deepest = Math.min(...r.dips);
      check(`let go, it breathes: every kick presses and the plate comes back to rest, on ${name}`,
        r.end.floored === 0 && Math.abs(r.end.mean - REST) < 1e-4 && r.far < 1e-4 && r.left === 0 && r.dips.length > 80 && shallowest < REST - 0.003 && deepest > lone - 0.25 * (REST - lone),
        `${say(r)}, farthest cell ${r.far.toExponential(1)} from rest; a tenth of a second after each of ${r.dips.length} kicks the film under it at ${deepest.toFixed(4)}–${shallowest.toFixed(4)}, a lone kick ${lone.toFixed(4)}`);
    }
    // The governor: half the steps, each twice as long, the same release in seconds.
    // A release counted in steps also gives everything back at half the rate,
    // only over twice the time, so the plate alone cannot tell (check-skeptic:
    // a step-counted release passed the rest of this line with 1,880 steps at
    // either rate). Its steps can: a third of a second at half the rate is
    // about half as many.
    const half = kickShow(0.00023, true, 30), full = kickShow(0.00023, true);
    check('and at half the step rate the same (the release is counted in seconds, not steps)',
      half.end.floored === 0 && half.far < 1e-4 && Math.max(...half.dips) < REST - 0.003 && half.steps < 0.7 * full.steps,
      `${say(half)}; ${half.steps} release steps against ${full.steps} at the full rate`);
    // The hold: nothing given back before KICK_HOLD, all of it by KICK_HOLD + KICK_RELEASE.
    {
      const one = new KickRelease();
      one.kick(96, 96, [15], 0.001);
      let before = 0, total = 0, t = 0;
      while (one.size && t < 2) { t += 1 / 60; one.step(S, 1 / 60, (idx, g) => { if (idx === 96 + 96 * S) { total += g; if (t <= KICK_HOLD) before += g; } }); }
      check('a kick is held for the lift\'s pause, then given back in full over a third of a second, no more than it pressed',
        before === 0 && Math.abs(total - 0.001) < 1e-12 && t > KICK_HOLD + KICK_RELEASE - 1 / 60 && t < KICK_HOLD + KICK_RELEASE + 2 / 60,
        `${before} back while held; ${total.toExponential(3)} of 1.000e-3 back by ${(t * 1000).toFixed(0)} ms`);
    }
  }
}

// ── The plate, in the lab ───────────────────────────────────────────
console.log('\nThe plate, in the lab\n');
{
  const { page, close } = await openLab();
  try {
    /*
      One gesture on an even plate of dye, so that anything that goes round
      the ring came from the gesture: the Press tool's three nested discs
      held for half a second at 1× (or one frame of a kick's squeeze, at the
      beat squeeze's three radii and full strength), measured while held;
      then a second and a half of letting go, measured at the end. The press
      remembers itself through the same PressLift the plate keeps. Off the
      diagonal, so a lift laid transposed lands somewhere else. The
      one-frame press is a tap: a kick's size and depth, so this asks what
      a kick's press lifts into (a kick's own release, which gives the gap
      back alongside, is asked above, in the strokes).

      Each ring is read from the dye, in the plate's own cells: the finished
      picture frames an off-centre point through the plate shader's dish and
      lens, and a ring drawn at the press's cell in the picture landed
      somewhere else (measured: the lift's dye correlated −0.97 with its
      spokes, the picture at the same place −0.06, and no flip or transpose
      of it above 0.23). While the press is held, the rings are read from the
      film's gap instead: that is what a press acts on, and on an even plate
      half a second of the stroke drawn before barely moved the dye (its
      spokes' correlation 0.36 in the dye against 0.21 for a round press, too
      close to call) while it thinned the film in spokes. Every ring is asked
      two things. How much it goes
      up and down six to ninety times a turn (its angular contrast, a share of
      its own brightness), and whether that is *where the spokes are*: the
      band-passed ring correlated with the same ring of the lift's own
      drawing (lab.strokeGap). Contrast alone passed a lift laid six cells
      off the press, and a press that laid nothing (check-skeptic); the
      correlation asks for the fingers at the spokes' own angles. The old
      stroke draws the same spokes on the way down, so it is the control
      that shows the correlation sees spokes while held.
    */
    const gesture = (how, glass = APP_GLASS) => page.evaluate(async ({ how, glass }) => {
      const over = { ...glass, plateCurve: 0 };
      const { L } = await lab.create(256, 192);
      const d = new Array(L * L * 4).fill(0);
      for (let k = 0; k < L * L; k++) { d[k * 4] = 0.3; d[k * 4 + 1] = 0.15; d[k * 4 + 2] = 0.05; d[k * 4 + 3] = 0.5; }
      lab.addDye(d); lab.flush(over.dt); await lab.step(2, over);
      const cx = L / 2 + 17, cy = L / 2 - 11, fg = 0.8;
      const kick = how === 'kick';
      const radii = kick ? [60, 40, 22] : [45, 27, 12];
      const amount = kick ? 0.0024 : 0.004, frames = how === 'none' ? 0 : kick ? 1 : 30;
      const stroke = how === 'before' ? 'splash' : 'press';
      const memory = new lab.PressLift();
      let now = 1000;
      for (let s = 0; s < frames; s++) {
        const pile = 0.02 * fg * Math.min(1, amount * 250);
        lab.squish(cx, cy, radii[0], amount, fg, stroke, pile);
        lab.squish(cx, cy, radii[1], amount, fg, stroke);
        lab.squish(cx, cy, radii[2], amount, fg, stroke);
        memory.press(cx, cy, radii[0], amount, fg, now);
        lab.flush(over.dt); await lab.step(1, over); now += 1000 / 60;
      }
      if (how === 'none') { lab.flush(over.dt); await lab.step(30, over); }
      const R = radii[0];
      const spokes = lab.strokeGap(cx, cy, R, 0.008, fg, 'lift');
      // While held, the drawing to hold the film against is the one drawn
      // before (the spokes a press thinned the film along, at every radius).
      const drawnBefore = lab.strokeGap(cx, cy, R, amount, fg, 'splash');
      const look = async (qs, which = 'dye') => {
        let n, lum;
        if (which === 'dye') {
          const f = await lab.field('dye');
          n = Math.round(Math.sqrt(f.length / 4));
          lum = (x, y) => f[(x + y * n) * 4 + 3];
        } else {
          const sq = await lab.squeeze();
          n = sq.n;
          lum = (x, y) => sq.gap[x + y * n];
        }
        const at = (x, y) => {
          const fx = x * n - 0.5, fy = y * n - 0.5, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
          const g = (a, b) => lum(Math.min(n - 1, Math.max(0, a)), Math.min(n - 1, Math.max(0, b)));
          return g(i, j) * (1 - u) * (1 - v) + g(i + 1, j) * u * (1 - v) + g(i, j + 1) * (1 - u) * v + g(i + 1, j + 1) * u * v;
        };
        const M = 720;
        const bandpass = (s) => {
          const bp = new Array(M).fill(0);
          let band = 0;
          for (let m = 6; m <= 90; m++) {
            let re = 0, im = 0;
            for (let k = 0; k < M; k++) { const t = 2 * Math.PI * m * k / M; re += s[k] * Math.cos(t); im += s[k] * Math.sin(t); }
            re *= 2 / M; im *= 2 / M; band += (re * re + im * im) / 2;
            for (let k = 0; k < M; k++) { const t = 2 * Math.PI * m * k / M; bp[k] += re * Math.cos(t) + im * Math.sin(t); }
          }
          return { bp, band };
        };
        const corr = (a, b) => {
          let ab = 0, aa = 0, bb = 0;
          for (let k = 0; k < M; k++) { ab += a[k] * b[k]; aa += a[k] * a[k]; bb += b[k] * b[k]; }
          return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
        };
        // The centre's brightness: a press has to leave its mark there.
        let centre = 0;
        for (let k = 0; k < 64; k++) { const t = k / 64 * 2 * Math.PI; centre += at((cx + 0.5 + Math.cos(t) * 0.15 * R) / L, (cy + 0.5 + Math.sin(t) * 0.15 * R) / L) / 64; }
        return { centre, rings: qs.map((q) => {
          const s = [], pat = [], turned = [];
          for (let k = 0; k < M; k++) {
            const t = k / M * 2 * Math.PI;
            s.push(at((cx + 0.5 + Math.cos(t) * q * R) / L, (cy + 0.5 + Math.sin(t) * q * R) / L));
            // The spokes on the same ring (at 0.9 of the press where they
            // are all present), and a copy turned by a few degrees: the
            // fingers must sit at the spokes, not merely be as many.
            const cell = which === 'gap'
              ? (tt) => drawnBefore[Math.round(cx + Math.cos(tt) * q * R) + Math.round(cy + Math.sin(tt) * q * R) * L]
              : (tt) => spokes[Math.round(cx + Math.cos(tt) * 0.9 * R) + Math.round(cy + Math.sin(tt) * 0.9 * R) * L];
            pat.push(cell(t)); turned.push(cell(t + 0.12));
          }
          const mean = s.reduce((a, b) => a + b, 0) / M;
          if (!(mean > (which === 'dye' ? 0.1 : 0.002))) throw new Error(`nothing in the ${which} round the ring (mean ${mean.toFixed(4)}): nothing to measure`);
          const { bp, band } = bandpass(s);
          const P = bandpass(pat).bp, T = bandpass(turned).bp;
          // A finger is a swing above +5 % of the ring's brightness after one below −5 %.
          const thr = 0.05 * mean;
          let fingers = 0, st = 0;
          for (let k = 0; k < 2 * M; k++) {
            const v = bp[k % M];
            if (st <= 0 && v > thr) { if (st < 0 && k >= M) fingers++; st = 1; } else if (st >= 0 && v < -thr) st = -1;
          }
          return { q, contrast: Math.sqrt(band) / mean, fingers, atSpokes: Math.abs(corr(bp, P)), turned: Math.abs(corr(bp, T)) };
        }) };
      };
      const inside = [0.45, 0.6, 0.75], rim = [0.9, 1.0, 1.1];
      const held = { inside: await look(inside, 'gap'), rim: await look(rim), dyeInside: await look(inside) };
      let liftSteps = 0, gapMost = 0;
      const sq0 = await lab.squeeze();
      const gapRest = Math.max(...sq0.gap.filter((v, k) => k % sq0.n === 4));
      for (let s = 0; s < 90; s++) {
        const l = how === 'spring' || how === 'none' ? null : memory.step(now, 1 / 60);
        if (l) { lab.squish(l.x, l.y, l.radius, l.amount, l.fingering, 'lift'); liftSteps++; }
        lab.flush(over.dt); await lab.step(1, over); now += 1000 / 60;
        if (s % 5 === 0) for (const v of (await lab.squeeze()).gap) gapMost = Math.max(gapMost, v);
      }
      const lifted = { rim: await look(rim) };
      // The film inside the press once the lift has run: how far the glass came back up there.
      const sq1 = await lab.squeeze();
      let gapInside = 0;
      for (let y = 0; y < sq1.n; y++) for (let x = 0; x < sq1.n; x++) {
        if (Math.hypot(x + 0.5 - (cx + 0.5) * sq1.n / L, y + 0.5 - (cy + 0.5) * sq1.n / L) < 0.9 * R * sq1.n / L) gapInside = Math.max(gapInside, sq1.gap[x + y * sq1.n]);
      }
      return { held, lifted, liftSteps, gapMost, gapRest, gapInside };
    }, { how, glass });

    const most = (rows) => rows.reduce((m, r) => (r.contrast > m.contrast ? r : m));
    const say = (r) => `${r.contrast.toFixed(3)} at ${r.q} of the press, ${r.fingers} fingers, ${r.atSpokes.toFixed(2)} at the spokes (${r.turned.toFixed(2)} turned)`;
    /*
      Each gesture on the default look's glass (APP_GLASS), and the lift
      again on the fastest look's (FAST_GLASS, Lacing Run). The held
      press and its control are asked on the lab's own glass (0.02 a step,
      faster than any look): on every look's glass a held press takes the
      whole disc to the film's floor, spokes or none (the stroke drawn before
      read 0.000 at both, as round as the new one), so "round while held" can
      only be told from "spokes while held" on a glass that pushes back.
    */
    const none = await gesture('none'), now = await gesture('now'), spring = await gesture('spring'), kick = await gesture('kick');
    const nowFast = await gesture('now', FAST_GLASS), springFast = await gesture('spring', FAST_GLASS);
    const nowLab = await gesture('now', { gapSpring: 0.02 }), beforeLab = await gesture('before', { gapSpring: 0.02 });
    if (process.env.LIFT_TRACE) console.log(JSON.stringify({ none, now, spring, kick, nowFast, springFast, nowLab, beforeLab }, null, 1));

    const pressedMark = none.held.inside.centre - now.held.inside.centre;
    check('held, the press thins the film under the palm', pressedMark > 0.01,
      `gap ${now.held.inside.centre.toFixed(4)} at the centre against ${none.held.inside.centre.toFixed(4)} unpressed`);
    const heldIn = most(nowLab.held.inside.rings), beforeIn = most(beforeLab.held.inside.rings);
    const heldAt = Math.max(...nowLab.held.inside.rings.map(r => r.atSpokes));
    check('and is round there: nothing at the spokes\' angles', heldIn.contrast < 0.01 && heldAt < 0.1,
      `${say(heldIn)}; most at the spokes ${heldAt.toFixed(2)}`);
    /*
      The stroke drawn before, held the same half second: its film is thinned
      in spokes, and they sit at its own drawing's angles, which a turned copy
      of the drawing does not match. The correlation is modest (0.27 against
      0.10 turned, measured) because the film bottoms out at the solver's
      floor along a spoke however hard it is pressed, which squares the
      drawing's cosines off; it is the contrast (0.041 against 0.000) that
      carries the difference, the angles that say it is the spokes.
    */
    const beforeBest = beforeLab.held.inside.rings.reduce((m, r) => (r.atSpokes > m.atSpokes ? r : m));
    check('where the stroke drawn before thinned it in spokes, at their angles', beforeIn.contrast > 0.02 && beforeBest.atSpokes > 0.2 && beforeBest.atSpokes > 2 * beforeBest.turned,
      `${say(beforeIn)}; at the spokes ${say(beforeBest)}`);
    /*
      The rim let go against the rim held, compared at the spokes: the rim's
      contrast times how much of it sits at the spokes' angles. Held on the
      fastest look's glass the rim goes up and down 0.026 with no lift at
      all, 0.14 at the spokes: the pressed disc's octagonal edge (below),
      not fingers. Against raw contrast the lift cleared three times it by
      0.4 % (0.078 against 0.026), a coin toss between SwiftShader and Metal
      that measured the octagon; at the spokes it is 0.066 against 0.004.
    */
    const atSpokes = (r) => r.contrast * Math.max(0, r.atSpokes);
    const fingersOf = (g) => {
      const heldRim = most(g.held.rim.rings), liftRim = most(g.lifted.rim.rings);
      return { heldRim, liftRim, ok: liftRim.contrast > 0.05 && atSpokes(liftRim) > 3 * atSpokes(heldRim) && liftRim.fingers >= 6
        && liftRim.atSpokes > 0.5 && liftRim.turned < 0.6 * liftRim.atSpokes };
    };
    const lifted = fingersOf(now), liftedFast = fingersOf(nowFast), liftRim = lifted.liftRim;
    check('let go, the rim breaks into fingers at the spokes', lifted.ok,
      `${say(liftRim)}; held, ${say(lifted.heldRim)}; at the spokes ${atSpokes(liftRim).toFixed(4)} against ${atSpokes(lifted.heldRim).toFixed(4)} held; ${now.liftSteps} lift steps`);
    check('and on the fast glass too', liftedFast.ok, `${say(liftedFast.liftRim)}; held, ${say(liftedFast.heldRim)}; at the spokes ${atSpokes(liftedFast.liftRim).toFixed(4)} against ${atSpokes(liftedFast.heldRim).toFixed(4)} held`);
    /*
      What the spring alone does to the rim is compared at the spokes: the
      rim's contrast times how much of it sits at the spokes' angles. At the
      app's spring the pressed disc's edge is an octagon (the grid shows in
      the squeeze solve, PLAN §10 step 4), which goes up and down 0.030 round
      the rim in six or so lobes with no lift at all, 0.09 at the spokes; the
      raw contrast read that as fingers. The fingers asked of the lift are
      the ones at its spokes, so that is what the spring alone must not make.
    */
    const springRim = most(spring.lifted.rim.rings), springRimFast = most(springFast.lifted.rim.rings);
    check('which the gap\'s spring alone does not do, at the spokes, on either glass',
      atSpokes(springRim) * 5 < atSpokes(liftRim) && atSpokes(springRimFast) * 5 < atSpokes(liftedFast.liftRim),
      `${(atSpokes(springRim)).toFixed(4)} at the spokes against the lift's ${atSpokes(liftRim).toFixed(4)} (${say(springRim)}); fast, ${(atSpokes(springRimFast)).toFixed(4)} against ${atSpokes(liftedFast.liftRim).toFixed(4)}`);
    /*
      How far the lift opens the film: back to where the glass rests, never
      past it. Uncapped, the lift at half its strength as gap (what it lays)
      opened the film to 0.081 against a rest of 0.030 at the default look's
      spring, and to 0.053 even on the lab's fast one (a quarter: 0.055 and
      0.041; pre-push review, check-skeptic); the shader now caps an opening
      at rest. Asked on both
      glasses, over the whole plate every fifth step (the gap builds
      smoothly: every step read the same peak to 5e-5). That it opens at all
      is read inside the press once the lift has run: the lift brings the
      glass there back to rest, where at the app's spring the spring alone
      leaves it near the floor. The rest is read off a column by the plate's
      edge before the lift, on a flat plate (plateCurve pinned at 0).
    */
    check('the lift brings the glass back up to where it rests, never past it',
      now.gapMost <= now.gapRest * 1.001 && nowFast.gapMost <= nowFast.gapRest * 1.001
        && now.gapInside > 0.9 * now.gapRest && spring.gapInside < 0.5 * spring.gapRest,
      `largest gap ${now.gapMost.toFixed(4)} (fast glass ${nowFast.gapMost.toFixed(4)}) against ${now.gapRest.toFixed(4)} at rest; inside the press after, ${now.gapInside.toFixed(4)}, the spring alone ${spring.gapInside.toFixed(4)}`);
    const kickHeld = Math.max(most(kick.held.inside.rings).contrast, most(kick.held.rim.rings).contrast), kickLift = most(kick.lifted.rim.rings);
    /*
      A tap is a tenth of the way down, so it lifts a third as hard a step
      (the square root of its depth; the node half reads 32 %), and the cap
      lets it open no more than the tenth it pressed. On the plate that is a
      faint ripple at the spokes, 0.004 against a held press's 0.073, too
      faint for the finger counter: what a kick's squeeze lifts into (PLAN
      §10 step 4). Asked for what it is: at the
      spokes, above what the tap left while held, and a small part of a held
      press's lift.
    */
    check('a tap, one frame at a kick\'s size, lifts at its spokes too, a faint ripple beside a held press\'s fingers', kickLift.contrast > 2 * kickHeld && kickLift.contrast < 0.25 * liftRim.contrast && kickLift.atSpokes > 0.4,
      `${say(kickLift)}; held ${kickHeld.toFixed(3)}`);
  } finally { await close(); }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
