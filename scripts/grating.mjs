#!/usr/bin/env node
/**
 * No grating over the dye.
 *
 *   npm run grating      (the lab: any adapter that computes)
 *
 * What was reported: on Red Cabbage at 2.8x, a fine blue and white lattice
 * of stripes and dots over the violet, "a weird frequency looking grate over
 * the dye"; then, that it is on many other looks too. The screenshot's
 * spectrum is periods of 10 to 15 px at 45° and 135° (±15°). At 2.8x on a
 * 768 grid a cell is about 8.75 px, and a checkerboard (every other cell up,
 * every other down) seen along its diagonal has a period of √2 cells, 12.4
 * px: the one pattern a grid of cells can hold and nothing else can. A
 * pattern the liquid made itself would point any way it liked.
 *
 * The dye has nothing that removes that pattern once it is there. Its
 * diffusion does (the implicit Laplacian takes about 8a/(1+8a) of it a step), but
 * eleven of the looks have none and the slow ones with a little take a few
 * percent; and the advection only takes 2d² of it a step for a step of d
 * cells, which at these looks' pace is a few millionths. So what the
 * presses leave at grid scale stays and grows (section 2 replays it). On
 * the plate it is a percent of the dye. The closeup stretches thin dye's
 * contrast about ten times (film level and gain, then the gooey contrast),
 * and there it is.
 *
 * The fix is `dampGrid` (wgsl/fluid.ts): a filter that takes out the
 * checkerboard and the band near it and leaves everything else. Asked here:
 *
 *   1. the checkerboard goes in a second, faint or strong, with a little
 *      diffusion or none, and the reported spread around it within five
 *   2. on a pressed plate like the reported one, the grid-scale ripple the
 *      presses make is held down against the same plate with the pass off
 *      (to 0.68 since the press source was balanced; see there)
 *   3. what is not grid noise stays: lines and edges along either axis
 *      exactly; a hard disc's edge as hard, with no ring beside it; a soft
 *      blob; diagonal texture four and six cells across
 *   4. dye is made or lost only by the limiter's clamp, and by little
 *   5. (a later report, not the checkerboard) no push grows a spinodal
 *      grating of stripes, dots and labyrinths in the pools, and the plate
 *      keeps its dye: the old fingering push, put back in a lab of its own,
 *      is the control (the comment above section 5 says why)
 *   6. two fingers holding the Drop, as the phone's check holds them, each
 *      keep a pool of what they laid, the two alike: the same push took
 *      one held pool to a third of the other's on the Mac (the phone's
 *      two-finger Drop reds; the comment above section 6 has them)
 *
 * Every measure is taken in all four of the dye's channels and the worst one
 * judged: the grating is colour (blue and white over violet), so a pass that
 * cleaned the density alone would show nothing.
 *
 * Known limit, not measured here: where the adapter lacks float32-filterable
 * the dye is half-float, and a checkerboard fainter than about a
 * thousandth of the dye under it is below what a 5% step can round away.
 * Metal and the lab both give full float, so this is measured on that.
 */
import { openLab } from './lab.mjs';
import { readFileSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 192;
// Red Cabbage's dye, as its preset steps it: no diffusion, slow. Nothing is
// moving, so the advection has nothing to carry and the step's only hand on
// the dye is the pass. (The lab has no evaporation, evapFactor 1; each
// measure still divides by the mean, so one would drop out.)
const STILL = { diff: 0, advection: 0.4, damping: 0.985, dt: 0.0005, platePressure: 0 };
const SECOND = 60;
// The dye's colour for every pattern: each channel carries the pattern at
// its own scale, and each is measured on its own.
const RGBA = [0.4, 1, 0.3, 1];
const CHECKER = (x, y) => ((x + y) & 1 ? -1 : 1);

const { page, close } = await openLab();
try {
  /*
    Lay `kind` down on a clean plate, step, and return each channel as it
    was and is. Every pattern sits on `base` (0.5 unless asked), so no cell
    starts near zero and the clamp at zero cannot hide a change.
  */
  const run = (kind, { steps = SECOND, extra = {}, base = 0.5, amp = 0.05 } = {}) => page.evaluate(async ([N, kind, steps, over, base, amp, RGBA]) => {
    await lab.create(N, N);
    const f = new Float64Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N - 0.5, v = (y + 0.5) / N - 0.5;
      let d = 0;
      if (kind === 'checker') d = amp * ((x + y) & 1 ? -1 : 1);
      // The spread's two ends, at 30° to the grid (15° off the diagonal):
      // 1.73 cells across (10.4 px at 8.75 px a cell, aliasing to (π, 0.58π))
      // and 2.12 (15 px, 1.5 times the first, (0.82π, 0.47π)).
      else if (kind === 'near') d = amp * Math.cos(Math.PI * (x + 0.577 * y));
      else if (kind === 'far') d = amp * Math.cos(Math.PI * (0.817 * x + 0.472 * y));
      else if (kind === 'lines') d = (x % 8 === 3 ? 0.3 : 0) + (x > N / 2 ? 0.2 : 0);
      else if (kind === 'rows') d = (y % 8 === 3 ? 0.3 : 0) + (y > N / 2 ? 0.2 : 0);
      else if (kind === 'disc') d = u * u + v * v < 0.25 * 0.25 ? 0.4 : 0;
      else if (kind === 'blob') d = 0.4 * Math.exp(-(u * u + v * v) / (2 * 0.03 * 0.03));
      else if (kind === 'diag4') d = amp * Math.cos(Math.PI / 2 * (x + y));
      else if (kind === 'diag6') d = amp * Math.cos(Math.PI / 3 * (x + y));
      f[y * N + x] = base + d;
    }
    const data = new Array(N * N * 4);
    for (let k = 0; k < N * N; k++) for (let c = 0; c < 4; c++) data[k * 4 + c] = RGBA[c] * f[k];
    lab.addDye(data);
    lab.flush();
    // Each channel divided by its own scale, so all four read as `f`.
    const read = async () => {
      const d = await lab.field('dye');
      return [0, 1, 2, 3].map((c) => Array.from({ length: N * N }, (_, k) => d[k * 4 + c] / RGBA[c]));
    };
    const before = await read();
    await lab.step(steps, over);
    return { before, after: await read() };
  }, [N, kind, steps, { ...STILL, ...extra }, base, amp, RGBA]);

  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const worst = (r, fn, pick = Math.max) => pick(...[0, 1, 2, 3].map((c) => fn(r.before[c], r.after[c])));
  // How much of the pattern `w(x, y)` is in a field, relative to its mean.
  const part = (a, w) => {
    let s = 0, ww = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const k = w(x, y); s += a[y * N + x] * k; ww += k * k; }
    return (s / ww) / (sum(a) / a.length);
  };
  // What is left of a wave, whatever its phase now: cos and sin together.
  const keptWave = (b, a, phase) => Math.hypot(part(a, (x, y) => Math.cos(phase(x, y))), part(a, (x, y) => Math.sin(phase(x, y)))) / part(b, (x, y) => Math.cos(phase(x, y)));
  // Signed, so a pass that flipped the checkerboard each step reads negative.
  const kept = (w) => (b, a) => part(a, w) / part(b, w);
  // Largest change anywhere, relative to the pattern's height, mean divided out.
  const moved = (height) => (b, a) => {
    const mb = sum(b) / b.length, ma = sum(a) / a.length;
    let m = 0;
    for (let k = 0; k < b.length; k++) m = Math.max(m, Math.abs(a[k] / ma - b[k] / mb));
    return m / (height / mb);
  };
  const pc = (v) => `${(v * 100).toFixed(1)}%`;

  // ── 1. The grating goes ───────────────────────────────────────────
  const one = await run('checker', { steps: 1 });
  const cb1 = worst(one, kept(CHECKER)), cb1lo = worst(one, kept(CHECKER), Math.min);
  check('a step takes a twentieth of the checkerboard, and does not flip it', cb1lo > 0.94 && cb1 < 0.96, `${pc(cb1lo)} to ${pc(cb1)} left after one step`);
  const cb = worst(await run('checker'), kept(CHECKER));
  check('a one-cell checkerboard is gone within a second', cb < 0.1, `${pc(cb)} left after ${SECOND} steps, worst channel`);
  // As faint as the lab's pressed plates grew it (3e-5 at 768), on thin dye.
  const faint = worst(await run('checker', { base: 0.01, amp: 3e-5 }), kept(CHECKER));
  check('and as fast when it is faint, on thin dye', faint < 0.1, `${pc(faint)} left of 3e-5 on 0.01`);
  /*
    Not only where there is no diffusion: it was seen on many looks, and the
    slow ones with a little take only a few percent of it a step (Galaxy
    about 3% at 512²). This diffusion takes 2%: the pass tops it up to the
    same second, and neither leaves more than the other.
  */
  const DIFF = 2 * 0.01 / (8 * 0.98) / (STILL.dt * (N - 2) * (N - 2));
  const cbD = worst(await run('checker', { extra: { diff: DIFF } }), kept(CHECKER));
  check('and as fast where a little diffusion takes 2% of it a step', cbD < 0.1 && Math.abs(cbD - cb) < 0.02, `${pc(cbD)} left, against ${pc(cb)} with none`);
  /*
    The band around it. The pass falls off as the eighth power away from
    the checkerboard, so the spread's long end goes more slowly: 59% of it
    is left after a second by the filter's own response, and it is asked
    for five.
  */
  const near = worst(await run('near'), (b, a) => keptWave(b, a, (x, y) => Math.PI * (x + 0.577 * y)));
  check('the spread\'s near end (10 px at 2.8x, 15° off the diagonal) within a second', near < 0.35, `${pc(near)} left`);
  const far = worst(await run('far', { steps: SECOND * 5 }), (b, a) => keptWave(b, a, (x, y) => Math.PI * (0.817 * x + 0.472 * y)));
  check('and its far end (15 px) within five', far < 0.1, `${pc(far)} left`);

  // ── 2. On a pressed plate ─────────────────────────────────────────
  /*
    Red Cabbage's way of making it, replayed: dye poured, then pushed about
    and pressed (the gap squeezed) for ten seconds, once with the pass off
    and once as it ships. Measured as the dye's amplitude within 0.2π of the
    checkerboard's frequency, relative to the mean: the dye multiplied by
    the checkerboard, which moves that band to the origin, and summed over
    the frequencies within it. What a real edge puts there is the same in
    both runs; what differs is what the grid grew.
  */
  const pressed = (gridDamp) => page.evaluate(async ([N, over]) => {
    await lab.create(N, N);
    let s = 7; const r = () => (s = s * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < 14; i++) lab.dye(0.2 + 0.6 * r(), 0.2 + 0.6 * r(), 0.05 + 0.08 * r(), [0.4, 1.0, 0.3], 1.2);
    lab.flush();
    for (let k = 0; k < 60; k++) {
      lab.vel(0.2 + 0.6 * r(), 0.2 + 0.6 * r(), 0.08, [(r() - 0.5) * 0.4, (r() - 0.5) * 0.4, 0, 0]);
      const x = 0.25 + 0.5 * r(), y = 0.25 + 0.5 * r();
      for (const rr of [0.1, 0.07, 0.04]) lab.vel(x, y, rr, [0, 0, 0, -0.3]);
      lab.flush(); await lab.step(10, over);
    }
    const d = await lab.field('dye');
    const M = Math.floor(0.1 * N);
    return [0, 1, 2, 3].map((c) => {
      let mean = 0;
      const g = new Float64Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = d[(y * N + x) * 4 + c]; mean += v; g[y * N + x] = (x + y) & 1 ? -v : v; }
      mean /= N * N;
      // Along x for the band's columns, then along y.
      const re = [], im = [];
      for (let m = -M; m <= M; m++) {
        const rr = new Float64Array(N), ii = new Float64Array(N);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const t = -2 * Math.PI * m * x / N; rr[y] += g[y * N + x] * Math.cos(t); ii[y] += g[y * N + x] * Math.sin(t); }
        re.push(rr); im.push(ii);
      }
      let e = 0;
      for (let m = -M; m <= M; m++) for (let n = -M; n <= M; n++) {
        if (m * m + n * n >= M * M) continue;
        let a = 0, b = 0;
        for (let y = 0; y < N; y++) {
          const t = -2 * Math.PI * n * y / N, co = Math.cos(t), si = Math.sin(t);
          const R = re[m + M][y], I = im[m + M][y];
          a += R * co - I * si; b += R * si + I * co;
        }
        e += a * a + b * b;
      }
      return Math.sqrt(2 * e) / (N * N) / mean;
    });
  }, [N, { ...STILL, platePressure: 0.35, gridDamp }]);
  /*
    Held under 0.68, not the third it was written with (re-baselined
    with the owner's word, 2026-10-03, in the PR that balanced the press
    source). The third was measured on a plate whose presses did almost
    nothing: the press's source was balanced by a guess at its plate mean
    that was wrong, and that error went into the pressure solve as a net
    source the solve could not meet (the mirror check's "and nowhere else",
    `scripts/heldpress.mjs`). With the source exactly balanced these presses
    really push the dye about (the dye under them barely moved before), and
    the moving dye makes content in this band faster than the pass, at the
    5% a step section 1 pins, takes it out; the flow is the same with the
    pass on or off, so this is not the pass stirring anything. So the ratio
    now reads 64% in the lab and 65% on the Mac, and no honest version of
    the fix reads under a third: one that balanced only before the gap's
    clamp read 74%, and measured away from the moving fronts the fix still
    reads 62 to 70% (main 37 to 38% there), so it is not the fronts' own
    edges (both measured by hand on the PR, not kept here; PLAN.md's item
    has them). The renders of Red Cabbage's pressed closeup at 2.8x and 8x show
    no 45-degree grate with the fix.

    What the line still asks is that the pass is there and at strength: in
    the lab the pass at 3.5% a step (30% weaker) reads 70.0%, at 2.5% 75%,
    at 1.5% 82% and at 1% 87%, so the limit sits between the 64% the pass
    reads as it ships (65% on the Mac) and a pass 30% weaker.

    It cannot tell a pass that works from presses that stopped moving the
    dye: were the press source to go unbalanced again, this plate would
    read near the old 22% and pass the more easily. That is what the
    held-press check (`scripts/heldpress.mjs`) guards, and this line leans
    on it.
    Whether the pass should hold more of this band against moving fronts is
    a PLAN.md item (the grid pass against presses that move the dye).
  */
  const off = await pressed(0), on = await pressed(undefined);
  const ratio = Math.max(...on.map((v, c) => v / off[c]));
  check('on a pressed plate, the grid-scale ripple is held under 0.68 of what grows without the pass', ratio < 0.68,
    `${on[3].toExponential(2)} of the dye against ${off[3].toExponential(2)} after ten seconds, worst channel ${pc(ratio)}`);

  // ── 3. The liquid's own detail stays ──────────────────────────────
  for (const kind of ['lines', 'rows']) {
    const m = worst(await run(kind), moved(0.3));
    check(`one-cell ${kind === 'lines' ? 'columns' : 'rows'} and a hard edge along the grid are untouched`, m < 1e-3, `largest change ${(m * 100).toFixed(3)}% of the line's height`);
  }
  /*
    The disc's edge is a staircase, and along its diagonals the staircase is
    a checkerboard one cell wide: exactly what the filter removes. So it is
    asked what an edge is made of rather than whether the field moved. Every
    cell partway up the edge (a tenth to nine tenths) still lies within 1.5
    cells of the circle, no more than two to each cell of its perimeter (a
    blur fails both). Nothing is darker or lighter than anything was (the
    Gibbs ring past the edge, 12.9% of it with the limiter taken out). And
    beyond two cells of the circle nothing moves by more than 5% of the
    edge: a ripple that stays inside the old range still shows, ten times
    stretched, as a halo.
  */
  const disc = await run('disc', { steps: SECOND * 5 });
  const R = 0.25 * N;
  const edge = (a, scale) => {
    let partway = 0, astray = 0, lo = Infinity, hi = -Infinity;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = a[y * N + x] / scale;
      lo = Math.min(lo, v); hi = Math.max(hi, v);
      const t = (v - 0.5) / 0.4;
      if (t > 0.1 && t < 0.9) { partway++; if (Math.abs(Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) - R) > 1.5) astray++; }
    }
    return { partway: partway / (2 * Math.PI * R), astray, lo, hi };
  };
  const discs = [0, 1, 2, 3].map((c) => {
    const b = disc.before[c], a = disc.after[c], scale = sum(a) / sum(b);
    const e0 = edge(b, 1), e1 = edge(a, scale);
    let halo = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (Math.abs(Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) - R) <= 2) continue;
      halo = Math.max(halo, Math.abs(a[y * N + x] / scale - b[y * N + x]) / 0.4);
    }
    return { e0, e1, ring: Math.max(e0.lo - e1.lo, e1.hi - e0.hi) / 0.4, halo };
  });
  const partway = Math.max(...discs.map((d) => d.e1.partway)), astray = Math.max(...discs.map((d) => d.e1.astray));
  check('a hard-edged disc keeps its edge as hard, at every angle', astray === 0 && partway <= 2,
    `after five seconds ${partway.toFixed(2)} cells partway up it per cell of perimeter (was ${discs[3].e0.partway.toFixed(2)}), ${astray} astray`);
  const ring = Math.max(...discs.map((d) => d.ring));
  check('with no ring past it', ring < 1e-3, `${(ring * 100).toFixed(3)}% of the edge past what was there`);
  const halo = Math.max(...discs.map((d) => d.halo));
  check('and no halo beside it', halo < 0.05, `largest change beyond two cells of it ${pc(halo)} of the edge`);
  const blob = worst(await run('blob'), moved(0.4));
  check('a soft blob six cells across does not move', blob < 0.005, `largest change ${(blob * 100).toFixed(3)}% of its height`);
  const d4 = worst(await run('diag4'), kept((x, y) => Math.cos(Math.PI / 2 * (x + y))), Math.min);
  check('diagonal texture four cells across mostly stays', d4 > 0.75, `${pc(d4)} kept after a second`);
  const d6 = worst(await run('diag6'), kept((x, y) => Math.cos(Math.PI / 3 * (x + y))), Math.min);
  check('and six cells across all but entirely', d6 > 0.97, `${pc(d6)} kept`);

  // ── 4. Conservation ───────────────────────────────────────────────
  /*
    Ten seconds, no evaporation, so the total should not move but for the
    limiter's clamp: it holds a cell inside its neighbours' range, which at
    a hard edge stops a dip below the lower side and so makes dye (never
    loses it, on a still plate). Signed, and bounded at a part in a hundred
    thousand a second, well under what the slowest look's evaporation takes.
    Still plate only: on a moving one the advection's own limiter changes
    the total more than this does.
  */
  const cons = await page.evaluate(async ([N, over]) => {
    await lab.create(N, N);
    const data = new Array(N * N * 4).fill(0);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N - 0.3, v = (y + 0.5) / N - 0.6;
      // A checkerboard, a hard disc and the walls: all three at once.
      const d = 0.5 + 0.05 * ((x + y) & 1 ? -1 : 1) + (u * u + v * v < 0.04 ? 0.4 : 0) + (x < 3 ? 0.2 : 0);
      for (let c = 0; c < 4; c++) data[(y * N + x) * 4 + c] = [0.4, 1, 0.3, 1][c] * d;
    }
    lab.addDye(data);
    lab.flush();
    const totals = async () => { const d = await lab.field('dye'); const t = [0, 0, 0, 0]; d.forEach((v, k) => { t[k % 4] += v; }); return t; };
    const a = await totals();
    await lab.step(600, over);
    return [a, await totals()];
  }, [N, STILL]);
  const drifts = cons[0].map((t, c) => (cons[1][c] - t) / t / 10);
  const drift = drifts.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
  check('dye is made or lost only by a few parts per million a second', Math.abs(drift) < 1e-5,
    `${drift >= 0 ? '+' : ''}${(drift * 1e6).toFixed(2)} ppm a second over ten, worst channel`);
} finally {
  await close();
}

// ── 5. No push grows a grating in the pools ───────────────────────
/*
  Reported next (Classic, 2026-09-27): stripes three to eight cells across at
  every angle, and a quarter of an hour in, red dots in a lattice ten cells
  apart with labyrinths between them. Not the checkerboard above: that is
  locked to the grid's diagonals, and this pointed anywhere. It was the
  fingering push in forcesB (gone now; the comment where it was says why),
  which pushed the dye up its own gradient wherever its noise was negative:
  diffusion run backwards, which grows a spinodal pattern in every pool, at
  about four logical cells (ten texels at 512) and the waves near it.

  Asked on Classic's step as the app ran it when the report was saved (no
  diffusion; the glass smear and evaporation left out, neither a source of
  grid-scale texture), on the app's geometry: a 512 grid under the 192-cell
  logical plate, which is what set the pattern's size. Forty pools, stirred
  once, then ten seconds, read at five and at ten. Measured as the share of
  the dye's variance in waves 2.6 to 16 texels across (the reported 3 to 8
  and 10, and the push's four logical cells), each of the dye's four channels
  on its own and the worst one judged: the report was coloured dots, and a
  push in colour alone (the tension force next door has the same shape)
  would leave the density flat. Read from the solver's own texture
  (lab.field reads the 192-cell plate, coarser than the pattern).

    as it is      the step as it ships
    control       the old push put back (a lab built with it) at Classic's
                  strength then, 0.165: it must grow the grating
    weak control  the same at a quarter of it: a push too weak to saturate
                  in ten seconds must still read as growing, or the check
                  only sees a plate the push has already wrecked

  What a spinodal pattern does that the stirring does not is grow
  exponentially, so the as-is plate is asked for a rate as well as a level.
  The stirring's own share grows too, because it draws the pools' edges out
  sharper (a one-texel edge on these pools reads about nine times what they
  are laid with), but along with the stretching, not by compounding: in the
  run this was written against it went 52 laid, 75 at five seconds, 107 at
  ten, so 1.4 times over the second five seconds. The weak control, a
  quarter of the push, went 238 to 819 over the same five, 3.4 times. The
  gates sit between those and are drawn against the weak control where they
  can be, so a lab that runs a little hotter or cooler (Metal against
  SwiftShader) moves both sides together:

    rate    from five seconds to ten, under twice, and under the weak
            control's own growth over one and a half
    level   under four times what the pools were laid with, and under a
            third of the weak control at ten seconds (the old push: 2518)

  And the dye kept, both ways: the push lost 57% of the plate in ten
  seconds, which was the Finger's "adds none" red (the plate alone lost dye,
  so a stroke that stopped the loss read as adding it), and backward
  diffusion carried conservatively makes dye up to the 6.0 ceiling. The step
  as it is loses a little of the worst channel here, 2.6% (the advection's
  limiter and hold; not traced further than that); the weak control 11%,
  the old push 59%. So within 5% either way. The lab has no evaporation.
*/
const oldPush = (strength) => ({
  name: `old-fingering-push-${strength}`,
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]fluid\.ts$/ }, (args) => {
      const src = readFileSync(args.path, 'utf8');
      const at = '  /*\n    There was a fingering push here, and it is gone on purpose.';
      if (!src.includes(at)) throw new Error('grating: the control could not find where the fingering push was in fluid.ts');
      // The push as it shipped until it was taken out.
      const push = `  if (d >= 0.05) {
    let gx = (bilerpN(dye, uv + eL, S.n).a - bilerpN(dye, uv - eL, S.n).a) * 0.5;
    let gy = (bilerpN(dye, uv + eL.yx, S.n).a - bilerpN(dye, uv - eL.yx, S.n).a) * 0.5;
    let g2 = gx * gx + gy * gy;
    if (g2 > 0.005) {
      let g = sqrt(g2);
      let n = snoise(p * 0.02 + vec2f(0.0, S.time * 0.05));
      v = vec4f(v.xy - (vec2f(gx, gy) / g) * (n * ${strength.toFixed(5)} * g * 4.0), v.z, v.w);
    }
  }
`;
      return { contents: src.replace(at, push + at), loader: 'ts' };
    });
  },
});
const CLASSIC = {
  dt: 0.000674, visc: 1.5, nu: 0.00015, diff: 0, buoyancy: 0.4, gravity: 0.006, advection: 0.35,
  sharpness: 0, damping: 0.988, heatDecay: 0.992, turbScale: 0.576, turbDetail: 3, spin: 0.013, immiscibility: 0.02296,
  phaseSharp: 0.35, phaseTension: 0.18, gapSpring: 0.0003, gapMemory: 0.998, platePressure: 0.25,
  vibIntensity: 0.0048, vibFrequency: 0.288, drip: 0.15, currentDamp: 0.988, currentBuoy: 0.12, currentGrav: 0.03,
  twist: 0.24, meanDensity: 0.38, maxCurrent: 16.7, gravityReach: 0.21,
};
const FN = 512, HALF = 300, LO = 2.6, HI = 16;
/*
  The share of a field's variance in waves `lo` to `hi` texels across: a 2D
  FFT (radix 2, rows then columns) of the field less its mean, summed by the
  wave's length. Parts in ten thousand. Run in the page, on each channel, so
  the fields never cross to node. (A sine 5.12 texels across reads 10,000;
  one of 8.2 reads 439 against the old 2.6 to 8 band's edge; white noise about
  4,200 of the 2.6 to 8 band.)
*/
const band = (a, N, lo, hi) => {
  const re = Float64Array.from(a), im = new Float64Array(N * N);
  let mean = 0; for (const v of a) mean += v; mean /= a.length;
  for (let k = 0; k < re.length; k++) re[k] -= mean;
  const fft = (off, stride) => {
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
      if (i < j) { const p = off + i * stride, q = off + j * stride; [re[p], re[q]] = [re[q], re[p]]; [im[p], im[q]] = [im[q], im[p]]; }
    }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const p = off + (i + k) * stride, q = off + (i + k + len / 2) * stride;
          const tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
          re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  };
  for (let y = 0; y < N; y++) fft(y * N, 1);
  for (let x = 0; x < N; x++) fft(x, N);
  let inBand = 0, all = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x < N / 2 ? x : x - N) / N, fy = (y < N / 2 ? y : y - N) / N;
    const k = Math.hypot(fx, fy);
    if (k === 0) continue;
    const p = re[y * N + x] ** 2 + im[y * N + x] ** 2;
    all += p;
    if (1 / k >= lo && 1 / k < hi) inBand += p;
  }
  if (!(all > 0)) throw new Error('grating: a flat field has no spectrum to read');
  return inBand / all * 1e4;
};
const pools = (page) => page.evaluate(async ([N, half, over, lo, hi, bandSrc]) => {
  const band = eval(`(${bandSrc})`);
  await lab.create(N, 192);
  let s = 12345; const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  const cols = [[0.1, 1.2, 1.0], [1.3, 0.2, 0.3], [0.3, 1.1, 0.1], [1.0, 1.0, 0.1], [0.2, 0.4, 1.3]];
  for (let k = 0; k < 40; k++) lab.dye(r(), r(), 0.03 + r() * 0.1, cols[k % 5], 0.6 + r() * 1.2);
  for (let k = 0; k < 20; k++) lab.vel(r(), r(), 0.05 + r() * 0.1, [(r() - 0.5) * 3, (r() - 0.5) * 3, 0, 0]);
  lab.flush(over.dt);
  const sv = lab.solver(), dev = sv.device;
  const format = sv.dye.read.format;
  // The four channels as the solver holds them, every texel.
  const channels = async () => {
    const f32 = format === 'rgba32float';
    const bytesPerRow = N * (f32 ? 16 : 8);
    const buf = dev.createBuffer({ size: bytesPerRow * N, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: sv.dye.read }, { buffer: buf, bytesPerRow }, [N, N]);
    dev.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const raw = buf.getMappedRange().slice(0); buf.unmap(); buf.destroy();
    const half16 = (x) => {
      const e = (x >> 10) & 31, m = x & 1023, sg = x & 0x8000 ? -1 : 1;
      if (e === 31) return m ? NaN : sg * Infinity;
      return sg * (e ? (1 + m / 1024) * 2 ** (e - 15) : m / 1024 * 2 ** -14);
    };
    const src = f32 ? new Float32Array(raw) : new Uint16Array(raw);
    const out = [0, 1, 2, 3].map(() => new Float64Array(N * N));
    for (let k = 0; k < N * N; k++) for (let c = 0; c < 4; c++) {
      const v = f32 ? src[k * 4 + c] : half16(src[k * 4 + c]);
      if (!Number.isFinite(v)) throw new Error(`grating: the dye went non-finite (${v}) at texel ${k}`);
      out[c][k] = v;
    }
    return out;
  };
  const read = (ch) => ({ band: ch.map((a) => band(a, N, lo, hi)), total: ch.map((a) => a.reduce((t, v) => t + v, 0)) });
  const at0 = await channels();
  await lab.step(half, over);
  const mid = read(await channels());
  await lab.step(half, over);
  const at10 = await channels();
  let moved = 0;
  for (let k = 0; k < N * N; k++) moved = Math.max(moved, Math.abs(at10[3][k] - at0[3][k]));
  return { format, start: read(at0), mid, end: read(at10), moved };
}, [FN, HALF, CLASSIC, LO, HI, band.toString()]);
// The worst channel's reading, and each channel's dye kept, from one run.
const measure = (r) => ({
  format: r.format,
  moved: r.moved,
  start: Math.max(...r.start.band), mid: Math.max(...r.mid.band), end: Math.max(...r.end.band),
  kept: r.end.total.map((t, c) => t / r.start.total[c]),
});
/*
  ── 6. Two held Drops keep their dye, alike ──────────────────────────

  The phone's check (`npm run phone`, PHONE_GPU=1 on the Mac) holds two
  fingers on the Drop for 1.2 s and asks for a pool under each, the two
  within 0.4 of each other. It went red with one finger's pool at about a
  third of the other's while both had laid the same dye on the same steps:
  A 69 to B 229 and A 236 to B 84 on main's deploys of 2026-10-03 (05:11 and
  06:06 UTC), A 197 to B 72 on a branch at 07:57, and four times on
  2026-09-27/28 (PLAN.md, batch 11). Every one of them ran on a tree from
  before #222 took this push out (08:38 UTC 2026-10-03); in the 80-odd Mac
  runs of the line since and 146 holds of a diagnostic on the Mac (PR #240),
  not one. The push moves dye up its own gradient where its noise is
  negative, a held pool is the steepest gradient on the plate, and the
  advection's hold and cap throw away what it piles up; where the noise is
  positive the pool keeps its dye. So which finger lost hung on where the
  plate's angle put each finger in the noise, and when: it looked like a
  flake because it was a place and a moment.

  Replayed here on the phone's grid (256) at two of those runs' cells (the
  07:57 branch run's, and the first run's of 2026-10-03), each at ten
  moments of the show's clock 15 s apart, since the noise drifts with it (the lab's
  plate starts at 0, so without `setTime` every replay would be the same
  first second). The step is the one the check asks for: Classic with the
  motor off (twist 0), silent (spin 0, Classic's vibration at silence,
  0.0036), no turbulence or rain, the current's ceiling recomputed for the
  app's dt as the app does, at the dt the phone's plate stepped at in the
  diagnostic (0.0011). What a held Drop lays is the app's with Water in the
  bottle and Amount 1 (the hands loop in LiquidVisualizer: radius
  round(3 × 1.5) = 5 cells, 0.6 at the middle falling as the square, in
  Water's colour as addDensity logs it, heat 0.05 the same way): 7.9 a step, which is what the red lines print. Laid on
  30 steps and read 17 later, the steps a red run's plate took in its 1.2 s
  hold and 0.7 s after; the disk is the check's own (0.06 of the grid).

  Measured (the lab on SwiftShader, 2026-10-04): as it is, every pool kept
  191 or 192 of the 237 laid, at both places and all ten moments, the two
  of a pair 1.00 of each other. With the push back the pools read 82 to
  238, a pair as uneven as 94 to 235 (0.40, the phone's own red line) and
  four of the twenty under 0.6. The control asks for half, so it goes red
  if the push no longer splits held pools at all, not on where in its noise
  the twenty land.
*/
const HELD = [[[81, 45], [68, 120]], [[113, 46], [76, 126]]];
const MOMENTS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135];
const HELD_DT = 0.0011;
const HELD_STEP = {
  ...CLASSIC, turbScale: 0, spin: 0, twist: 0, vibIntensity: 0.0036, drip: 0, dt: HELD_DT,
  maxCurrent: 0.75 / (HELD_DT * CLASSIC.advection * 190), meanDensity: 0.012,
};
const held = (page) => page.evaluate(async ([pairs, moments, over]) => {
  const L = 192, rows = [];
  for (const pair of pairs) for (const t0 of moments) {
    await lab.create(256, L);
    lab.setTime(t0);
    const laid = [0, 0];
    for (let s = 0; s < 47; s++) {
      if (s < 30) for (const [h, [cx, cy]] of pair.entries()) {
        const rr = 5, amt = 0.6, heat = 0.05, dye = new Array(L * L * 4).fill(0), vel = new Array(L * L * 4).fill(0);
        for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
          const d = Math.hypot(dx, dy); if (d > rr) continue;
          const w = (1 - d / rr) ** 2, k = ((cx + dx) + (cy + dy) * L) * 4;
          dye[k] += amt * w * 1.32; dye[k + 1] += amt * w * 0.63; dye[k + 3] += amt * w;
          vel[k + 2] += heat * w;
          laid[h] += amt * w;
        }
        lab.addDye(dye);
        lab.addVel(vel);
      }
      lab.flush(over.dt);
      await lab.step(1, over, true);
    }
    const f = await lab.field('dye');
    const disk = ([cx, cy]) => { let t = 0; for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) if (Math.hypot(x - cx, y - cy) < 0.06 * L) t += Math.max(0, f[(x + y * L) * 4 + 3]); return t; };
    rows.push({ pair, t0, laid, under: pair.map(disk) });
  }
  return rows;
}, [HELD, MOMENTS, HELD_STEP]);
const heldRuns = {};
const runs = {};
for (const [name, plugins] of [['asIs', []], ['old', [oldPush(0.16485)]], ['weak', [oldPush(0.16485 / 4)]]]) {
  const l = await openLab({ plugins, tag: plugins.length ? plugins[0].name.replace(/\./g, '_') : '' });
  try {
    runs[name] = measure(await pools(l.page));
    if (name !== 'weak') heldRuns[name] = await held(l.page);
  } finally { await l.close(); }
}
const { asIs, old, weak } = runs;
const g = (m) => `${m.start.toFixed(0)} laid, ${m.mid.toFixed(0)} at 5 s, ${m.end.toFixed(0)} at 10 s; dye kept ${m.kept.map((k) => `${(k * 100).toFixed(1)}%`).join(' ')}`;
console.log(`   (dye ${asIs.format}; worst channel, variance in waves ${LO} to ${HI} texels, parts in 10,000)`);
console.log(`   as it is:     ${g(asIs)}`);
console.log(`   control:      ${g(old)}`);
console.log(`   weak control: ${g(weak)}`);
check('the plate moved (the as-is run is not a still field that nothing could grow on)', asIs.moved > 0.1,
  `largest change in density ${asIs.moved.toFixed(2)}`);
check('the control: the old fingering push grows the reported grating', old.end > 10 * asIs.end,
  `${(old.end / asIs.end).toFixed(0)}x what the step as it is leaves after ten seconds`);
check('and at a quarter of its strength, still growing where it started', weak.end > 1.5 * weak.mid && weak.end > 2 * asIs.end,
  `${weak.mid.toFixed(0)} at 5 s to ${weak.end.toFixed(0)} at 10 s, against ${asIs.end.toFixed(0)} as it is`);
const growth = (m) => m.end / m.mid;
check('Classic\'s step grows no grating: not compounding from five seconds to ten',
  growth(asIs) < 2 && growth(asIs) < growth(weak) / 1.5,
  `${asIs.mid.toFixed(0)} to ${asIs.end.toFixed(0)}, ${growth(asIs).toFixed(2)}x (the weak control: ${growth(weak).toFixed(2)}x)`);
check('and no pattern left at the level the push leaves', asIs.end < 4 * asIs.start && asIs.end < weak.end / 3,
  `${asIs.end.toFixed(0)} against ${asIs.start.toFixed(0)} laid and ${weak.end.toFixed(0)} for the weak control (the old push: ${old.end.toFixed(0)})`);
const worstKept = asIs.kept.reduce((w, k) => (Math.abs(k - 1) > Math.abs(w - 1) ? k : w), 1);
check('and keeps the plate\'s dye, neither losing nor making it', Math.abs(worstKept - 1) < 0.05,
  `worst channel ${(worstKept * 100).toFixed(1)}% of what was laid (the weak control: ${(Math.min(...weak.kept) * 100).toFixed(1)}%, the old push: ${(Math.min(...old.kept) * 100).toFixed(1)}%)`);

const heldText = (rows) => HELD.map((pair) => `${pair.map((c) => `(${c})`).join(' ')}: ${rows.filter((r) => r.pair === pair || String(r.pair) === String(pair)).map((r) => r.under.map((u) => u.toFixed(0)).join('/')).join(', ')}`).join('; ');
const whole = (rows) => rows.length === HELD.length * MOMENTS.length && rows.every((r) => r.laid.every((v) => v > 200) && r.under.every(Number.isFinite));
const evenness = (rows) => Math.min(...rows.map((r) => Math.min(...r.under) / Math.max(...r.under)));
const keeps = (rows) => Math.min(...rows.flatMap((r) => r.under.map((u, i) => u / r.laid[i])));
console.log(`   held Drops, each pool's dye at each moment (${heldRuns.asIs[0]?.laid[0].toFixed(0)} laid each):`);
console.log(`     as it is: ${heldText(heldRuns.asIs)}`);
console.log(`     control:  ${heldText(heldRuns.old)}`);
check('the control: with the old push, at some place and moment one held Drop keeps under half of what the other does',
  whole(heldRuns.old) && evenness(heldRuns.old) < 0.5, `the weakest pair ${evenness(heldRuns.old).toFixed(2)} of each other`);
check('two held Drops keep their dye alike at every place and moment: within 0.9 of each other, and over 0.6 of what they laid',
  whole(heldRuns.asIs) && evenness(heldRuns.asIs) >= 0.9 && keeps(heldRuns.asIs) > 0.6,
  `the weakest pair ${evenness(heldRuns.asIs).toFixed(2)} of each other, the least kept ${keeps(heldRuns.asIs).toFixed(2)} (the old push: ${evenness(heldRuns.old).toFixed(2)} and ${keeps(heldRuns.old).toFixed(2)})`);

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} of ${checks.length} failed` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
