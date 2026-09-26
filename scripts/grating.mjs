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
 * diffusion does (the implicit Laplacian takes 8a/(1+8a) of it a step), but
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
 *   3. what is not grid noise stays: lines and edges along either axis
 *      exactly; a hard disc's edge as hard, with no ring beside it; a soft
 *      blob; diagonal texture four and six cells across
 *   4. dye is made or lost only by the limiter's clamp, and by little
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
  const off = await pressed(0), on = await pressed(undefined);
  const ratio = Math.max(...on.map((v, c) => v / off[c]));
  check('on a pressed plate, the grid-scale ripple is held to a third of what grows without the pass', ratio < 1 / 3,
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

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} of ${checks.length} failed` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
