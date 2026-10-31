#!/usr/bin/env node
/**
 * Bubbles and beads live by physics, not timers (PLAN.md §18i, §38b, §38g, §38n).
 *
 *   node scripts/bubblephysics.mjs      (npm run bubblephysics)
 *
 * A bubble here is a pocket of air spanning the gap between two glasses, so
 * every check below is a law of such a pocket, measured in the liquid's own
 * μ, σ and the dish's gap, never a window tuned around today's numbers:
 *   1. It runs ahead of the liquid by Taylor–Saffman's 2 slowed by its
 *      Bretherton film, 2/(1 + 2.26 Ca^⅔), at two speeds.
 *   2. Unagitated, it does not wander.
 *   3. The straw's finger count follows Saffman–Taylor's m ∝ R·√Ca.
 *   4. Two pressed together merge after their film drains, in a time that
 *      grows with R_e and μ/σ, into one pocket of their area.
 *   5. Nothing ends it on a clock: a still plate holds its pockets and their
 *      air for a minute, drawn at full opacity, and a drop takes the one it
 *      lands on without throwing daughters.
 *   6. It leaves at the open round rim (not the square round the dish), its
 *      area emptying at the steady π·bσ/(3μ), so time to empty goes as R².
 *   7. It dissolves at Henry's law's real rate, nil on a show's clock, and
 *      scaled past nature the smaller goes first.
 *   8. Its shape relaxes at Paterson's τ₂ = 2μR³/(b²σ): times at three sizes
 *      go as R³; a merged pair starts as long as it was end to end.
 *   9. Strain stretches it to ε·τ₂ along the stretching axis, and past the
 *      critical deformation it tears into two halves of its area.
 *  10. Crowded, a big pair squeezes flatter than a small one (Durian), and
 *      the small one of an unequal pair gives the more.
 *  11. Its mobility is the look's liquid: on a tilt it climbs at
 *      Δρ g sinθ b²/(12μ); water's μ and σ differ from oil's.
 *  12. Its film is Bretherton's for its own speed, kept when it stops.
 *  13. Beads drift at 2U / (1 + λ).
 */
import { build } from 'esbuild';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const outBubbles = 'node_modules/.cache/bubblephysics-bubbles.mjs';
const outBeads = 'node_modules/.cache/bubblephysics-beads.mjs';
await build({ entryPoints: ['src/lib/bubbles.ts'], bundle: true, format: 'esm', platform: 'node', outfile: outBubbles, logLevel: 'warning' });
await build({ entryPoints: ['src/lib/beads.ts'], bundle: true, format: 'esm', platform: 'node', outfile: outBeads, logLevel: 'warning' });
const { BubbleField } = await import(`../${outBubbles}`);
const { BeadField } = await import(`../${outBeads}`);

const N = 192, dt = 1 / 60;
const CPU = 0.05 * 190 * 60;   // solver units to cells a second (bubbles.ts)
const M = 0.2 / N;             // metres a cell
const GAP = 0.03 * 0.2;        // the rest gap, metres (DISH_REST_GAP × DISH_METRES)

// ── 1. Taylor–Saffman with Bretherton's film drag ────────────────
{
  const measure = (uFlow) => {
    const f = new BubbleField(N);
    f.spawn(96, 96, 4, 1, 0);
    const b = f.bubbles[0];
    const flow = () => [uFlow, 0];
    const x0 = b.x;
    for (let t = 0; t < 60; t++) f.step(dt, flow, 0, 0, 0);
    const cps = uFlow * CPU;
    const Ca = f.liquidMu * cps * (0.2 / N) / f.liquidSigma;
    return { got: (b.x - x0) / cps, want: 2 / (1 + 2.26 * Math.cbrt(Ca * Ca)) };
  };
  const slow = measure(0.01), fast = measure(0.04);
  check('a pocket runs ahead of the liquid by 2/(1 + 2.26 Ca^⅔), less so as the flow quickens',
    Math.abs(slow.got / slow.want - 1) < 0.01 && Math.abs(fast.got / fast.want - 1) < 0.01 && slow.got - fast.got > 0.05,
    `${slow.got.toFixed(3)}× (law ${slow.want.toFixed(3)}) at u=0.01, ${fast.got.toFixed(3)}× (law ${fast.want.toFixed(3)}) at u=0.04`);
}

// ── 2. Zero artificial Brownian wander when unagitated ────────────────
{
  const f = new BubbleField(N);
  f.spawn(96, 96, 4, 1, 0);
  const b = f.bubbles[0];
  const still = () => [0, 0];
  const x0 = b.x, y0 = b.y;
  for (let t = 0; t < 120; t++) f.step(dt, still, 0, 0, 0);
  const drift = Math.hypot(b.x - x0, b.y - y0);
  check('unagitated millimeter bubble in still liquid has no random wander',
    drift < 1e-4,
    `drift ${drift.toFixed(5)} cells over 2 seconds`);
}

// ── 3. Saffman-Taylor finger wavelength scaling on Straw ─────────────
{
  const runBlow = (strength) => {
    const f = new BubbleField(N);
    const still = () => [0, 0];
    for (let t = 0; t < 60; t++) {
      f.blow(96, 96, dt, strength);
      f.step(dt, still, 0, 0, 0);
    }
    const b = f.bubbles.find((q) => q.straw);
    const speed = (b.r - Math.max(1, N * 0.008)) / 1.0;
    const uMps = speed * (0.2 / N);
    const Ca = Math.max(1e-4, (f.liquidMu * uMps) / f.liquidSigma);
    return { b, lobes: b.lobes, r: b.r, Ca, sqrtCa: Math.sqrt(Ca) };
  };

  const moderate = runBlow(1.0);
  const fast = runBlow(2.0);

  // Both lobe counts must sit strictly between clamps (6 and 18)
  const insideClamps = moderate.lobes > 6 && moderate.lobes < 18 && fast.lobes > 6 && fast.lobes < 18;
  const actualRatio = fast.lobes / moderate.lobes;
  const theoreticalRatio = (fast.r * fast.sqrtCa) / (moderate.r * moderate.sqrtCa);
  const matchesScaling = Math.abs(actualRatio - theoreticalRatio) < 0.15;

  check('straw finger lobes follow Saffman-Taylor m ∝ R·√Ca between clamps',
    insideClamps && matchesScaling,
    `lobes ${moderate.lobes} vs ${fast.lobes} (ratio ${actualRatio.toFixed(3)} matches theoretical ${theoreticalRatio.toFixed(3)})`);
}

// ── 4. Film drainage merge ───────────────────────────────────────────
{
  const compress = (x, y) => [x < 82.5 ? 0.02 : -0.02, 0];
  const measureDrain = (r1, r2, mu, sigma) => {
    const f = new BubbleField(N);
    if (mu !== undefined) f.liquidMu = mu;
    if (sigma !== undefined) f.liquidSigma = sigma;
    f.spawn(80, 80, r1, 1, 0);
    f.spawn(85, 80, r2, 1, 0);
    const [b1, b2] = f.bubbles;
    b1.r = r1; b2.r = r2; b1.inject = 0; b2.inject = 0;
    b2.x = b1.x + (b1.r + b2.r) * 0.94; // Inside contact facet threshold
    b2.y = b1.y;
    let frames = 0;
    while (f.bubbles.length > 1 && frames < 1200) {
      f.step(dt, compress, 0, 0, 0);
      frames++;
    }
    return { time: frames * dt, merged: f.bubbles.length === 1, rFinal: f.bubbles[0]?.r ?? 0 };
  };

  // Small pair (r1=2, r2=2 -> Re=1.0)
  const small = measureDrain(2, 2);
  // Large pair (r1=4, r2=4 -> Re=2.0)
  const large = measureDrain(4, 4);
  // Viscous pair (Re=1.0, 2x viscosity)
  const viscous = measureDrain(2, 2, 0.034);

  // Touching briefly (less than t_drain) does not merge
  const fBrief = new BubbleField(N);
  fBrief.spawn(80, 80, 2, 1, 0);
  fBrief.spawn(85, 80, 2, 1, 0);
  fBrief.bubbles[0].r = 2; fBrief.bubbles[1].r = 2;
  fBrief.bubbles[0].inject = 0; fBrief.bubbles[1].inject = 0;
  fBrief.bubbles[1].x = fBrief.bubbles[0].x + (2 + 2) * 0.94;
  fBrief.bubbles[1].y = fBrief.bubbles[0].y;
  for (let t = 0; t < 60; t++) fBrief.step(dt, compress, 0, 0, 0); // 1.0s < 4.25s
  check('bubbles touching briefly do not merge before thin film drains', fBrief.bubbles.length === 2);

  check('drainage time t_drain grows with effective radius R_e',
    large.time > small.time * 1.8,
    `t_drain Re=2.0 (${large.time.toFixed(2)}s) > Re=1.0 (${small.time.toFixed(2)}s)`);

  check('drainage time t_drain grows with liquid viscosity-to-tension ratio mu/sigma',
    viscous.time > small.time * 1.8,
    `t_drain 2x mu (${viscous.time.toFixed(2)}s) > 1x mu (${small.time.toFixed(2)}s)`);

  check('bubbles merge into one area-conserving pancake once film drains',
    small.merged && Math.abs(small.rFinal - Math.sqrt(8)) < 0.05,
    `radius ${small.rFinal.toFixed(3)} matches expected sqrt(8) = ${Math.sqrt(8).toFixed(3)}`);
}

// A pocket put down whole at (x, y) with radius r, rather than inflating.
const put = (f, x, y, r) => {
  f.spawn(x, y, 2, 1, 0);
  const b = f.bubbles[f.bubbles.length - 1];
  b.x = x; b.y = y; b.r = r; b.inject = 0;
  return b;
};
const still = () => [0, 0];

// ── 5. Nothing ends on a clock ───────────────────────────────────────
{
  const f = new BubbleField(N);
  for (let k = 0; k < 12; k++) put(f, 40 + (k % 4) * 35, 55 + Math.floor(k / 4) * 40, 2 + (k % 5));
  const area0 = f.bubbles.reduce((s, b) => s + b.r * b.r, 0);
  let events = 0, dim = 0;
  for (let t = 0; t < 3600; t++) {
    f.step(dt, still, 0, 0, 0);
    events += f.events.length;
    const n = f.pack();
    for (let k = 0; k < n; k++) if (f.packed[k * 4 + 3] !== 1) dim++;
  }
  const area1 = f.bubbles.reduce((s, b) => s + b.r * b.r, 0);
  check('a still plate holds every pocket and its air for a minute, drawn whole',
    f.bubbles.length === 12 && events === 0 && dim === 0 && Math.abs(area1 / area0 - 1) < 1e-6,
    `${f.bubbles.length} of 12 after 60 s, ${events} events, ${dim} frames drawn faded, air ${(100 * (area1 / area0 - 1)).toExponential(1)} %`);

  const g = new BubbleField(N);
  put(g, 96, 96, 5);
  g.step(dt, still, 0, 0, 0);
  g.bubbles[0].age = 1;
  g.disturb(96, 96, 3, 'dye', 1);
  check('a drop takes the pocket it lands on and throws no daughters',
    g.bubbles.length === 0 && g.events.filter((e) => e.kind === 'pop').length === 1, `${g.bubbles.length} left`);
}

// ── 6. Leaving at the round rim ──────────────────────────────────────
{
  // Carried along the diagonal, it reaches the round rim well inside the square's corner.
  const f = new BubbleField(N);
  const b = put(f, 96, 96, 4);
  const toCorner = () => [0.008, 0.008];
  let leftAt = null, gone = null;
  for (let t = 0; t < 1800 && gone === null; t++) {
    const before = Math.hypot(b.x - 96, b.y - 96) + b.r;
    f.step(dt, toCorner, 0, 0, 0);
    if (leftAt === null && f.events.some((e) => e.kind === 'pop')) leftAt = before;
    if (f.bubbles.length === 0) gone = t;
  }
  check('carried out, it leaves where its edge meets the open round rim, not the square round it',
    leftAt !== null && Math.abs(leftAt - N / 2) < 1.5, leftAt !== null ? `edge ${leftAt.toFixed(1)} cells from the middle at the rim ${N / 2}` : 'never left');

  // Time to empty once open: area falls at the steady π·bσ/(3μ), so ∝ R².
  const empty = (r) => {
    const h = new BubbleField(N);
    const q = put(h, 96 + N / 2 - r - 0.5, 96, r);
    q.venting = true;
    let t = 0;
    while (h.bubbles.length && t < 100000) { h.step(1e-4, still, 0, 0, 0); t++; }
    return { t: t * 1e-4, law: (r * r * M * M) / (GAP * h.liquidSigma / (3 * h.liquidMu)) };
  };
  const e4 = empty(4), e12 = empty(12);
  check('open to the air, it empties in R²·3μ/(bσ): a big pocket nine times as long as one a third its size',
    Math.abs(e12.t / e4.t - 9) < 0.6 && Math.abs(e12.t / e12.law - 1) < 0.05,
    `${(e4.t * 1000).toFixed(1)} ms at 4 cells, ${(e12.t * 1000).toFixed(1)} ms at 12 (law ${(e12.law * 1000).toFixed(1)} ms), ratio ${(e12.t / e4.t).toFixed(2)}`);
}

// ── 7. Dissolving at the real rate ───────────────────────────────────
{
  const f = new BubbleField(N);
  const b = put(f, 96, 96, 3);
  for (let t = 0; t < 3600; t++) f.step(dt, still, 0, 0, 0);
  const lost = 1 - (b.r * b.r) / 9;
  // Henry's law through the plate: dA/dt = 2π D L (Δp/p₀) / ln(R_plate/R), D by Stokes–Einstein from water's.
  const R = 3 * M, D = 2e-9 * (1e-3 / f.liquidMu);
  const dA = 2 * Math.PI * D * f.liquidOstwald * (f.liquidSigma * (2 / GAP + 1 / R) / 101325) / Math.log(0.1 / R);
  const years = (Math.PI * R * R / dA) / 3.15e7;
  check('at the real rate a 3 mm pocket loses a millionth of its air in a minute (it would take years)',
    lost > 0 && lost < 1e-6 && Math.abs(lost / (dA * 60 / (Math.PI * R * R)) - 1) < 0.02,
    `lost ${lost.toExponential(2)} in 60 s; all of it in about ${years.toFixed(0)} years`);

  const g = new BubbleField(N);
  g.dissolve = 3e7;
  const small = put(g, 60, 96, 2), big = put(g, 130, 96, 4);
  let smallGone = null, bigGone = null;
  for (let t = 0; t < 36000 && bigGone === null; t++) {
    g.step(dt, still, 0, 0, 0);
    if (smallGone === null && !g.bubbles.includes(small)) smallGone = t * dt;
    if (bigGone === null && !g.bubbles.includes(big)) bigGone = t * dt;
  }
  check('scaled past nature, the same law melts the small one first, faster as it shrinks',
    smallGone !== null && bigGone !== null && bigGone > 3 * smallGone,
    `2 cells gone at ${smallGone?.toFixed(1)} s, 4 cells at ${bigGone?.toFixed(1)} s`);
}

// ── 8. Paterson's τ₂ ─────────────────────────────────────────────────
{
  const relax = (r) => {
    const f = new BubbleField(N);
    const b = put(f, 96, 96, r);
    b.sx = 0.3;
    const h = 1e-3;
    let t = 0;
    while (b.sx > 0.3 / Math.E && t < 200000) { f.step(h, still, 0, 0, 0); t++; }
    const R = r * M;
    return { t: t * h, law: 2 * f.liquidMu * R ** 3 / (GAP * GAP * f.liquidSigma) };
  };
  const a = relax(10), b = relax(15), c = relax(20);
  const fits = [a, b, c].every((q) => Math.abs(q.t / q.law - 1) < 0.06);
  check('a stretched pocket rounds off at τ₂ = 2μR³/(b²σ), so the time goes as R³',
    fits && Math.abs((c.t / a.t) / 8 - 1) < 0.08,
    `${(a.t * 1000).toFixed(0)}, ${(b.t * 1000).toFixed(0)}, ${(c.t * 1000).toFixed(0)} ms at 10, 15, 20 cells (law ${(a.law * 1000).toFixed(0)}, ${(b.law * 1000).toFixed(0)}, ${(c.law * 1000).toFixed(0)})`);

  const f = new BubbleField(N);
  const p = put(f, 90, 96, 3), q = put(f, 96, 96, 3);
  const squeeze = (x) => [x < 93 ? 0.003 : -0.003, 0];
  let merged = null;
  for (let t = 0; t < 1200 && !merged; t++) { f.step(dt, squeeze, 0, 0, 0); merged = f.events.find((e) => e.kind === 'merge'); }
  const m = f.bubbles[0];
  // Touching, the pair was 12 cells end to end: an ellipse of their area that long is 6/√18 of its radius.
  const long = merged ? 1 + Math.hypot(m.sx, m.sy) : 0;
  check('two merged start as one pocket of their air, as long as the pair was end to end',
    merged && f.bubbles.length === 1 && Math.abs(m.r - Math.sqrt(18)) < 0.01 && Math.abs(long / (6 / Math.sqrt(18)) - 1) < 0.02 && Math.abs(m.sy) < 1e-6,
    merged ? `radius ${m.r.toFixed(3)} (√18 = ${Math.sqrt(18).toFixed(3)}), long semi-axis ${long.toFixed(3)} of it (end to end ${(6 / Math.sqrt(18)).toFixed(3)})` : 'no merge');
}

// ── 9. Strain stretches, and past critical tears ─────────────────────
{
  const run = (r, e, seconds) => {
    const f = new BubbleField(N);
    const b = put(f, 96, 96, r);
    // Pure extension about the pocket's centre, e a second along x.
    const ext = (x, y) => [(e / CPU) * (x - 96), -(e / CPU) * (y - 96)];
    let split = 0, area = 0;
    for (let t = 0; t < seconds * 60 && !split; t++) {
      // Hold it at the stagnation point so the strain it sees stays e.
      b.x = 96; b.y = 96;
      f.step(dt, ext, 0, 0, 0);
      if (f.events.some((ev) => ev.kind === 'split')) { split++; area = f.bubbles.reduce((s, q) => s + q.r * q.r, 0); }
    }
    return { f, b, split, area };
  };
  const r = 20, R = r * M;
  const f0 = new BubbleField(N);
  const tau = 2 * f0.liquidMu * R ** 3 / (GAP * GAP * f0.liquidSigma);
  /*
    Round an inviscid pancake in extension the liquid's potential is
    (ε/2)(r² − R⁴/r²)cos 2θ (the air holds one pressure, so φ is constant on
    the rim), which pushes the rim out at 2εR·cos 2θ against τ₂'s pull back:
    it settles at deformation 2ε·τ₂. Here ε is chosen for D = 0.25.
  */
  const eLow = 0.125 / tau;
  const low = run(r, eLow, 4);
  const D = 2 * eLow * tau, want = Math.sqrt((1 + D) / (1 - D)) - 1;
  check('held in a strain ε it settles at deformation 2ε·τ₂ along the stretching axis',
    low.split === 0 && Math.abs(low.b.sx / want - 1) < 0.05 && Math.abs(low.b.sy) < 0.01 * want,
    `stretch ${low.b.sx.toFixed(3)} along x (law ${want.toFixed(3)}), ${low.b.sy.toExponential(1)} across`);
  const high = run(r, 0.7 / tau, 4);
  check('past the critical deformation it tears into two halves of its air',
    high.split === 1 && high.f.bubbles.length === 2 && Math.abs(high.area / (r * r) - 1) < 1e-3,
    `${high.split} split into ${high.f.bubbles.length}, air ${(high.area / (r * r)).toFixed(4)} of it`);
}

// ── 10. Crowding (Durian) ────────────────────────────────────────────
{
  const pressed = (r) => {
    const f = new BubbleField(N);
    const a = put(f, 96 - r, 96, r), c = put(f, 96 + r, 96, r);
    const push = (x) => [x < 96 ? 0.002 : -0.002, 0];
    for (let t = 0; t < 30; t++) f.step(dt, push, 0, 0, 0);
    return (2 * r - Math.hypot(c.x - a.x, c.y - a.y)) / r;
  };
  const small = pressed(3), big = pressed(14);
  check('pushed together, big pockets squeeze flat against each other and small ones stay round',
    big > 20 * Math.max(small, 1e-6) && big > 0.01,
    `overlap ${(small * 100).toFixed(3)} % of the radius at 3 cells, ${(big * 100).toFixed(2)} % at 14`);

  const f = new BubbleField(N);
  const s = put(f, 90, 96, 4), b = put(f, 90 + 4 + 12 - 2, 96, 12);
  const s0 = s.x, b0 = b.x;
  f.step(1e-4, still, 0, 0, 0);
  const ms = s0 - s.x, mb = b.x - b0;
  check('the small one of an unequal pair gives way the more, against its smaller drag',
    ms > 0 && mb > 0 && Math.abs(ms / mb / 9 - 1) < 0.02, `moved ${ms.toExponential(2)} vs ${mb.toExponential(2)} cells (ratio ${(ms / mb).toFixed(2)}, (R_b/R_s)² = 9)`);
}

// ── 11. The look's own liquid ────────────────────────────────────────
{
  const climb = (s) => {
    const f = new BubbleField(N);
    f.liquid(s);
    const b = put(f, 96, 96, 4);
    const y0 = b.y;
    for (let t = 0; t < 30; t++) f.step(dt, still, 0, -0.0002, 0);
    return { v: (b.y - y0) / (30 * dt), law: f.liquidRho * 9.81 * 0.002 * GAP * GAP / (12 * f.liquidMu) / M, f };
  };
  const oil = climb({ thinGap: 1, gapThickness: 0.45, viscosity: 'thick' });
  const gly = climb({ thinGap: 1, gapThickness: 0.9, viscosity: 'thick' });
  check('on a tilt it climbs at Δρ g sinθ b²/(12μ), slower in a thicker liquid by its viscosity',
    Math.abs(oil.v / oil.law - 1) < 0.01 && Math.abs((oil.v / gly.v) / (gly.f.liquidMu / oil.f.liquidMu) - 1) < 0.01,
    `${oil.v.toFixed(1)} cells/s in the default oil (law ${oil.law.toFixed(1)}), ${gly.v.toFixed(2)} at Thickness 0.9`);
  const water = new BubbleField(N);
  water.liquid({ thinGap: 1, gapThickness: 0, viscosity: 'thin' });
  check('water is water: 1 mPa·s and 72 mN/m against the oil\'s',
    Math.abs(water.liquidMu - 1e-3) < 1e-6 && water.liquidSigma === 0.072 && oil.f.liquidSigma === 0.03,
    `μ ${(water.liquidMu * 1000).toFixed(2)} mPa·s, σ ${water.liquidSigma}`);
}

// ── 12. Bretherton's film ────────────────────────────────────────────
{
  const f = new BubbleField(N);
  const b = put(f, 40, 96, 4);
  b.film = 0;
  const u = 0.006;
  for (let t = 0; t < 300; t++) f.step(dt, () => [u, 0], 0, 0, 0);
  const U = (b.x - 40) / (300 * dt);
  const Ca = f.liquidMu * U * M / f.liquidSigma;
  const law = 0.6685 * Math.cbrt(Ca * Ca);
  const moving = b.film;
  for (let t = 0; t < 120; t++) f.step(dt, still, 0, 0, 0);
  f.pack();
  const q1 = f.packedFinger[3];
  check('a moving pocket lays Bretherton\'s film, 1.337 Ca^⅔ of the half gap, and keeps it when it stops',
    Math.abs(moving / law - 1) < 0.02 && b.film === moving && q1 > 0 && q1 < 1,
    `film ${(moving * GAP * 1e6).toFixed(1)} µm (law ${(law * GAP * 1e6).toFixed(1)}), packed ${q1.toFixed(2)}`);
}

// ── 13. Beads speed 2U / (1 + lambda) ──────────────────────────────────
{
  const uFlow = 0.05;
  const flow = () => [uFlow, 0];
  const frames = 180;

  const fDefault = new BeadField(N);
  fDefault.drops = 0;
  fDefault.beads.push({ x: 96, y: 96, r: 3, age: 0, seed: 1 });
  const b0 = fDefault.beads[0];
  const x0 = b0.x;
  for (let t = 0; t < frames; t++) fDefault.step(dt, flow, 0, 0);
  const movedDefault = b0.x - x0;
  
  const baseFlow = uFlow * (0.05 * 190 * 60) * dt * frames;
  const defaultSpeedRatio = movedDefault / baseFlow;
  check('default beads drift at 0.8·U matching tuned lambda = 1.5',
    Math.abs(defaultSpeedRatio - 0.8) < 0.03,
    `speed ratio ${defaultSpeedRatio.toFixed(3)} matches expected 0.800`);

  // Custom viscosity ratio lambda = 3.0 -> speed factor 2 / (1 + 3) = 0.5
  const fViscous = new BeadField(N);
  fViscous.viscosityRatio = 3.0;
  fViscous.drops = 0;
  fViscous.beads.push({ x: 96, y: 96, r: 3, age: 0, seed: 1 });
  const bV = fViscous.beads[0];
  const xV0 = bV.x;
  for (let t = 0; t < frames; t++) fViscous.step(dt, flow, 0, 0);
  const movedViscous = bV.x - xV0;

  const ratio = movedViscous / movedDefault;
  // Expected ratio: (2 / (1 + 3)) / (2 / (1 + 1.5)) = 0.5 / 0.8 = 0.625
  check('beads drift at 2U / (1 + lambda) based on viscosity ratio',
    Math.abs(ratio - 0.625) < 0.03,
    `ratio ${ratio.toFixed(3)} matches physical ratio 0.625 (moved ${movedViscous.toFixed(1)} vs ${movedDefault.toFixed(1)} cells)`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
