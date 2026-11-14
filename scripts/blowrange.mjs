#!/usr/bin/env node
/**
 * A Blow is a breath: a jet along the surface with a direction it keeps, no
 * bubbles from the wind, a straw's bubble that grows with the breath.
 *
 *   npm run blowrange      (node only: src/lib/breath.ts, src/lib/blowAim.ts and src/lib/bubbles.ts)
 *
 * Reported twice. PLAN.md QA-20: "Blow amount isn't sensitive enough. At its
 * lowest settings it still blows a ton of ink and creates a lot of bubbles."
 * And the owner on 2026-11-13 (PLAN.md 15g-11, 15g-12), on Foam Cells: the
 * Blow "doesn't blow across the surface like I would expect (unless you're
 * blowing hard), it doesn't seem to have a direction in mind, and the bubble
 * spawning is weird at best". Filmed on a Mac, nine seconds of blowing left
 * about a hundred bubbles on the plate.
 *
 * Here the hands' rules are played as the app plays them (the Amount a,
 * share a², 60 steps a second, a fresh BubbleField of the app's 192 cells):
 *
 *   1. The wind lays no bubbles, at any Amount. The rule it replaces (ten
 *      spawns of two a second at the default) is played beside it for the
 *      record, and the reason is printed: a firm breath's pressure where it
 *      lands against the weight of the film under it (lib/breath.ts).
 *   2. The breath's stress is a jet along the surface (jetShare): whole
 *      where it lands, held for its core, then falling as one over the
 *      distance squared, wider the further it has gone, and nothing behind
 *      the landing past a footprint.
 *   3. layBreath lays that plume the way the breath blows, whichever way
 *      that is: its force sums to along the breath for sixteen directions,
 *      the same total within a few percent whichever way (the grid does not
 *      favour its axes), it reaches a palm and more ahead where the old disc
 *      reached its own radius, and it tells the uploader every row it wrote.
 *   4. A stroke has a direction in mind (lib/blowAim.ts): along a slanted
 *      stroke with a pixel of wobble in it the direction stays within a few
 *      degrees of the stroke, where one move's worth (the old rule) swung
 *      tens of degrees; it turns when the stroke turns; and when the hand
 *      stops, still down, the breath goes on the way it was going and the
 *      straw does not start.
 *   5. A press held and never moved is the straw, after the hold; a press
 *      that has moved is not.
 *   6. The straw's bubble grows as fast as the breath goes: after a second,
 *      its area at Amount 0.05, 0.2, 0.5 and 1 rises with the Amount and in
 *      proportion to it within a fifth (an old floor made 0.05 and 0.2 the
 *      same breath).
 *   7. And the app calls them so: neither the pointer's Blow nor a remote's
 *      spawns a bubble, the pointer's goes by blowStep, blowAim and
 *      blowHeld, and the straw is given strawFlow of the share.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const bundle = async (name) => {
  const out = `node_modules/.cache/blowrange-${name}.mjs`;
  await build({ entryPoints: [`src/lib/${name}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
  return import(`../${out}`);
};
const B = await bundle('breath');
const A = await bundle('blowAim');
const { BubbleField } = await bundle('bubbles');
const { strawFlow, breathSpeed, breathPressure, jetShare, layBreath, JET_CORE, JET_REACH, JET_FLOOR, BREATH_STRESS } = B;

const N = 192;
const still = () => [0, 0];
const deg = (r) => r * 180 / Math.PI;

// ── 1. The wind lays no bubbles ─────────────────────────────────────
{
  // The rule that was: ten spawns of two a second at the default Amount, along a stroke (bubbles.ts, spawn).
  const f = new BubbleField(N);
  for (let step = 0; step < 180; step++) {
    if (step % 6 === 0) f.spawn(40 + (step / 180) * 110, 96, 1.2 * 1.5, 2, 3 * 1.5);
    f.step(1 / 60, still, 0, 0, 0);
  }
  const was = f.bubbles.length;
  // What stands in for it is nothing to play: no export of the breath's lays air.
  const lays = Object.keys(B).filter((k) => /air|spawn|bubble/i.test(k) && k !== 'AIR_DENSITY');
  const FILM = 0.002, RHO = 860, G = 9.81;
  const weight = RHO * G * FILM;
  console.log(`  a firm breath lands at ${breathSpeed(1).toFixed(0)} m/s, ${breathPressure(1).toFixed(0)} Pa, against ${weight.toFixed(0)} Pa for the weight of a 2 mm film of oil: ${(breathPressure(1) / weight).toFixed(1)} times it`);
  check('the wind lays no bubbles: the breath has nothing that lays air, where three seconds of the old rule left a stroke of them',
    lays.length === 0 && was >= 20 && breathPressure(1) > 3 * weight,
    `the breath's exports that lay air: ${lays.length ? lays.join(', ') : 'none'}; the old rule's three seconds: ${was} bubbles`);
}

// ── 2. The jet's shape ──────────────────────────────────────────────
{
  const axis = [0, 1, 2, JET_CORE, 2 * JET_CORE, 3 * JET_CORE, JET_REACH * 0.98, JET_REACH * 1.02].map((s) => jetShare(s, 0));
  const raw = (v) => v * (1 - JET_FLOOR) + JET_FLOOR;   // before the floor is taken off
  const falls = axis.every((v, i) => i === 0 || v <= axis[i - 1]);
  // Past the core the stress goes as 1/s²: from two cores to three it falls by (1 + 4)/(1 + 9).
  const law = raw(axis[5]) / raw(axis[4]);
  // Its half-width (where it is half the axis's, before the floor) at the landing and three cores out.
  const half = (s) => { const top = raw(jetShare(s, 0)); let t = 0; while (raw(jetShare(s, t)) > top / 2 && t < 50) t += 0.01; return t; };
  const w0 = half(0), w3 = half(3 * JET_CORE);
  const behind = [1, 1.5, 2, 3].map((s) => jetShare(-s, 0));
  check('the stress is whole where the breath lands, holds for its core, then falls as one over the distance squared, to nothing at its reach',
    axis[0] === 1 && axis[1] > 0.9 && raw(axis[3]) > 0.49 && raw(axis[3]) < 0.51 && falls && Math.abs(law - 0.5) < 0.01 && axis[6] > 0 && axis[7] === 0,
    `along the breath at 0, 1, 2, ${JET_CORE}, ${2 * JET_CORE}, ${3 * JET_CORE} radii: ${axis.slice(0, 6).map((v) => v.toFixed(2)).join(', ')}; two cores to three ×${law.toFixed(3)} (1/s² gives 0.500); reach ${JET_REACH.toFixed(1)} radii`);
  check('it spreads as it goes, and leaves nothing behind the landing past a footprint',
    w0 > 0.5 && w0 < 0.6 && w3 > 3 * w0 && behind[0] < 0.1 && behind[2] === 0 && behind[3] === 0,
    `half-width ${w0.toFixed(2)} radii at the landing, ${w3.toFixed(2)} three cores on; behind it at 1, 1.5, 2, 3 radii: ${behind.map((v) => v.toFixed(3)).join(', ')}`);
}

// ── 3. layBreath lays it the way the breath blows ───────────────────
{
  const L = 192, R = 6;
  const runs = [];
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8, ux = Math.cos(a), uy = Math.sin(a);
    const out = new Float32Array(L * L * 4);
    const rows = { lo: L, hi: -1, add(y0, y1) { this.lo = Math.min(this.lo, y0); this.hi = Math.max(this.hi, y1); } };
    // Landing a palm in from the middle, upwind, so the whole plume is on the plate.
    const x = 96 - ux * 60, y = 96 - uy * 60;
    const cells = layBreath(out, L, x, y, R, ux * 3, uy * 3, 1, rows);
    let fx = 0, fy = 0, far = 0, back = 0, peak = 0, outside = 0;
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const tx = out[(i + j * L) * 4], ty = out[(i + j * L) * 4 + 1];
      if (tx === 0 && ty === 0) continue;
      fx += tx; fy += ty; peak = Math.max(peak, Math.hypot(tx, ty));
      const s = (i - x) * ux + (j - y) * uy;
      far = Math.max(far, s); back = Math.min(back, s);
      if (j < rows.lo || j > rows.hi) outside++;
    }
    runs.push({ a, cells, along: fx * ux + fy * uy, across: -fx * uy + fy * ux, far, back, peak, outside });
  }
  const tot = runs.map((r) => r.along), mean = tot.reduce((p, q) => p + q, 0) / tot.length;
  const spread = Math.max(...tot.map((t) => Math.abs(t / mean - 1)));
  const skew = Math.max(...runs.map((r) => Math.abs(r.across / r.along)));
  const far = Math.min(...runs.map((r) => r.far)), back = Math.min(...runs.map((r) => r.back));
  // The disc it replaces: (1 − (d/r)²)² over the footprint, its force summed.
  let disc = 0;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const q = 1 - (i * i + j * j) / (R * R); if (q > 0) disc += BREATH_STRESS * q * q; }
  check('the breath\'s force is along the breath whichever way it blows, the same in all sixteen directions',
    skew < 0.01 && spread < 0.03 && runs.every((r) => r.cells > 0 && Math.abs(r.peak / BREATH_STRESS - 1) < 0.05),
    `across over along at most ${(100 * skew).toFixed(2)}%; the total within ${(100 * spread).toFixed(1)}% of its mean; the middle ${(runs[0].peak / BREATH_STRESS).toFixed(2)} of a firm breath's stress`);
  check('it reaches a palm and more ahead of where it lands, where the disc reached its own radius, and stays a footprint behind',
    far > 15 * R && far < (JET_REACH + 1) * R && back > -2.2 * R && mean > 10 * disc,
    `${(far / R).toFixed(1)} radii ahead (${(far * 200 / L).toFixed(0)} mm on the dish), ${(-back / R).toFixed(1)} behind; its whole force ${(mean / disc).toFixed(0)} times the disc's`);
  check('and it tells the uploader every row it wrote', runs.every((r) => r.outside === 0), `${runs.reduce((p, r) => p + r.outside, 0)} cells outside the rows it named`);
}

// ── 4. and 5. A direction in mind, and the straw ────────────────────
{
  const LEASH = A.BLOW_LEASH * 1.5;
  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  /*
    A stroke at 30° to the plate's rows, a cell a step, the pointer landing
    on whole cells (a pixel's wobble either side of the line), then a turn to
    go straight up, then held where it stops for two seconds. `now` goes on
    a sixtieth of a second a step; each step is its frame's first.
  */
  const u = rng(3);
  let dir, x = 40, y = 60, px = x, py = y, t = 0;
  const offNew = [], offOld = [];
  const slant = Math.PI / 6;
  const step = (nx, ny) => {
    const dx = nx - px, dy = ny - py;
    dir = A.blowStep(dir, nx, ny, dx, dy, t, true, LEASH);
    px = nx; py = ny; t += 1000 / 60;
    return { dx, dy };
  };
  step(x, y);   // the press
  for (let k = 1; k <= 60; k++) {
    const nx = Math.round(x + Math.cos(slant) * k + (u() - 0.5)), ny = Math.round(y + Math.sin(slant) * k + (u() - 0.5));
    const { dx, dy } = step(nx, ny);
    if (k > 8) {
      const wrap = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      offNew.push(wrap(Math.atan2(dir.y, dir.x) - slant));
      if (Math.hypot(dx, dy) >= 0.75) offOld.push(wrap(Math.atan2(dy, dx) - slant));
    }
  }
  const worstNew = deg(Math.max(...offNew)), worstOld = deg(Math.max(...offOld));
  const aimed = A.blowAim(dir, t, true);
  // The turn: straight up for twenty cells.
  const tx = px, ty = py;
  for (let k = 1; k <= 20; k++) step(tx, ty + k);
  const turned = deg(Math.atan2(dir.y, dir.x));
  // Held where it stopped, still down, two seconds.
  let aimHeld = true, strawHeld = false;
  for (let k = 0; k < 120; k++) { step(px, py); aimHeld = aimHeld && A.blowAim(dir, t, true); strawHeld = strawHeld || A.blowHeld(dir, t); }
  const kept = deg(Math.atan2(dir.y, dir.x));
  const offPlate = A.blowAim(dir, t, false);
  check('along a slanted stroke the breath keeps the stroke\'s direction, where one move\'s worth swung with every pixel',
    aimed && worstNew < 12 && worstOld > 25,
    `at most ${worstNew.toFixed(1)}° off a 30° stroke (one move's worth: ${worstOld.toFixed(1)}°)`);
  check('it turns when the stroke turns', Math.abs(turned - 90) < 5, `after twenty cells straight up it blows at ${turned.toFixed(1)}°`);
  check('and when the hand stops, still down, the breath goes on the way it was going and no straw starts',
    aimHeld && !strawHeld && Math.abs(kept - turned) < 0.01 && !offPlate,
    `two seconds held: ${aimHeld ? 'the wind has its way throughout' : 'the wind lost its way'}, ${strawHeld ? 'the straw started' : 'no straw'}, direction ${kept.toFixed(1)}° (off a thin gap the carries stop, as they did: ${offPlate ? 'no' : 'yes'})`);

  // 5. A press that never moves.
  let d2, t2 = 0, strawAt = -1, aim2 = false;
  for (let k = 0; k < 30; k++) {
    d2 = A.blowStep(d2, 100, 100, 0, 0, t2, true, LEASH);
    if (strawAt < 0 && A.blowHeld(d2, t2)) strawAt = t2;
    aim2 = aim2 || A.blowAim(d2, t2, true);
    t2 += 1000 / 60;
  }
  // And one whose frames come slowly: the hold is frames as well as time.
  let d3, slowAt = -1;
  for (let k = 0; k < 6; k++) { d3 = A.blowStep(d3, 100, 100, 0, 0, k * 100, true, LEASH); if (slowAt < 0 && A.blowHeld(d3, k * 100)) slowAt = k; }
  check('a press held and never moved is the straw, after the hold\'s time and frames, and has no wind',
    strawAt >= A.BLOW_DIR_HOLD_MS && strawAt < 250 && !aim2 && slowAt === A.BLOW_STRAW_FRAMES,
    `the straw from ${strawAt.toFixed(0)} ms at 60 frames a second, from frame ${slowAt} at ten`);
}

// ── 6. The straw grows with the breath ──────────────────────────────
{
  const area = (a, flow) => {
    const f = new BubbleField(N);
    for (let t = 0; t < 60; t++) { f.blow(96, 96, 1 / 60, flow(a)); f.step(1 / 60, still, 0, 0, 0); }
    const b = f.bubbles.find((q) => q.straw);
    return b ? Math.PI * b.r * b.r : 0;
  };
  const SA = [0.05, 0.2, 0.5, 1];
  const got = SA.map((a) => area(a, (x) => strawFlow(x * x)));
  const before = SA.map((a) => area(a, (x) => Math.max(0.05, x * x)));
  const start = Math.PI * (N * 0.008) ** 2;
  const grown = got.map((g) => g - start);
  const prop = SA.every((a, i) => Math.abs((grown[i] / grown[3]) / a - 1) < 0.2);
  check('the straw\'s bubble grows as fast as the breath goes',
    grown.every((g, i) => i === 0 || g > grown[i - 1]) && prop,
    `area after a second at Amount ${SA.join(' / ')}: ${got.map((g) => g.toFixed(0)).join(' / ')} cells² (before ${before.map((g) => g.toFixed(0)).join(' / ')})`);
}

// ── 7. The app calls them so ────────────────────────────────────────
{
  const src = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
  // The two places a Blow is played: a remote's (performGesture's case) and the pointer's and fingers' (the hands' loop).
  const remote = src.match(/case 'blow':[\s\S]*?\n {6}case 'drop':/)?.[0] ?? '';
  const hands = src.match(/\} else if \(tool === 'blow'\) \{[\s\S]*?\n {14}\} else if \(tool === 'finger'\) \{/)?.[0] ?? '';
  const spawns = (remote + hands).match(/\.spawn\(/g)?.length ?? 0;
  const aims = /blowStep\(hand\.blowDir,/.test(hands) && /blowAim\(dir,/.test(hands) && /blowHeld\(dir,/.test(hands);
  const straw = /bubblesRef\.current\.blow\([^)]*strawFlow\(k\)\)/.test(hands);
  check('and the app calls them so: no Blow spawns a bubble, the hands go by blowStep, blowAim and blowHeld, the straw by strawFlow',
    remote.length > 200 && hands.length > 500 && spawns === 0 && aims && straw,
    `${spawns} spawn call(s) in the two Blows (${remote.length} and ${hands.length} characters read); the hands ${aims ? 'go by lib/blowAim.ts' : 'do not go by lib/blowAim.ts'}; the straw ${straw ? 'is given strawFlow' : 'is not given strawFlow'}`);
}

const bad = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
