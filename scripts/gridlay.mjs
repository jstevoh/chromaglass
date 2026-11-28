#!/usr/bin/env node
/**
 * Does the glass a thin gap's writers lay reach the solver smooth, or as the
 * 192² grid's facets?
 *
 *   npm run gridlay
 *
 * PLAN 18a-15. What was reported (18a-14): a light press looked pixelated.
 * The press laid its bowl on the CPU's 192² grid, and the bilinear upsample
 * carried it to the solver as flat facets with creases between them, which
 * the film's closing (Stefan's law, squeezeUpdate) turned into a polygon in
 * the flow. 18a-14 laid the press's bowl at the solver's own cells. More
 * writers of the glass still went through the 192² grid: the bass's hand
 * (BassPress), the lift's spokes (layLift), and the sheet's channel (its
 * change upsampled as sheetT), which carries the rhythm sheet (lib/sheet.ts)
 * and, since 38w-28, a kick's clock glass pressed whole (lib/glassPress.ts),
 * which took over a thin gap's kick from KickRelease's discs. None was
 * reported; each has the same facets at a low enough amount.
 *
 * What this measures, in the lab at 512² over a 192² plate (an upsample of
 * 8/3, where pressfacets found main's creases plainest): the gap read at the
 * solver's cells just before and just after one flush that lays one writer,
 * δ = after − before, with the glass's spring and memory off so δ is the lay
 * and nothing else (a flush with nothing laid is the control, `quiet`).
 *
 * The facet score. A bilinear surface is linear along x inside each 192²
 * cell, so its second difference along x is zero at every solver cell whose
 * three-cell stencil sits between two CPU samples, and all of its curvature
 * is on the stencils that straddle one. A smooth surface has its curvature
 * spread over both. "free" is rms(d²) over the stencils that straddle no CPU
 * sample, over rms(d²) over all of them, along x and along y, where δ is
 * over a tenth of its peak: near 0 for facets, near 1 for a smooth surface,
 * whatever the writer's shape (a bowl, a spoke a few cells wide). At 8/3 a
 * quarter of the stencils are free.
 *
 * The free score alone passes a staircase (each solver cell given its 192²
 * cell's value spreads its curvature between the samples too: the review
 * found it at 1.15, better than the fix), so the lay must also carry no more
 * curvature than main's, rms d² within 1.5× (a staircase reads 30 to 36×),
 * or, where the writer has a formula, be that formula at every solver cell:
 * a lift's spokes (squish.ts `liftShare`), within 1% rms of its peak (0.00%
 * now; a staircase reads 13%).
 *
 * Each writer is laid twice, on two fresh plates: as main lays it (through
 * the lab's 192² deltas, and the sheet by the bilinear, `sheetBilinear`: the
 * control, which must score as facets, so the check can see them) and as the
 * plate lays it now. The two must be the same glass: the volume within 10%
 * (3% for the sheet's channel, and its depth), and the pattern correlated over 0.95 at
 * the 192² grid's own scale, both blurred by one of its cells, since what a
 * facet changes is finer than that (unblurred, the spokes read 0.85, a spoke
 * being two or three CPU cells wide; a spoke's phase off by a radian reads
 * 0.66). A lift, an opening under rest, is laid as the 192² grid was told,
 * within 3%, on both plates. The bass is one hand pressed, pressed deeper
 * and let go, so a let-go that gave back another shape fails. The clock
 * glass is read over its first six steps down, laid in one flush.
 */
import { openLab } from './lab.mjs';
import { build } from 'esbuild';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ n, ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const out = 'node_modules/.cache/gridlay-lib.mjs';
await build({ stdin: { contents: "export { thicknessViscosity } from './src/lib/turntable.ts'; export { kickDepth, kickPress, liftShare, spokesAt } from './src/lib/squish.ts';", resolveDir: '.', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
const { thicknessViscosity, kickDepth, kickPress, liftShare, spokesAt } = await import(`../${out}`);
const NU = thicknessViscosity(0.45);
const SHEET_AMOUNT = kickDepth(0.5, 0.7, 1) * kickPress(NU, 0).share;
const GLASS_AMOUNT = kickDepth(0.5, 0.7, 1);   // each of the glass's discs, as the old stamp took it

const N = +(process.env.GRIDLAY_RES || 512), L = 192;
// The glass's spring and memory off, so a flush's δ is what it laid (the control reads it).
const P = { thinGap: 1, gapSpring: 0, gapMemory: 0, dt: 0.004 };

/** Which solver cells' 3-cell stencils straddle no CPU sample (at (k + ½)·n/L − ½). */
function freeStencils(n) {
  const s = n / L, free = new Uint8Array(n);
  for (let m = 1; m < n - 1; m++) {
    const k = Math.floor((m - 1 + 0.5) / s - 0.5) + 1;     // the first sample past m − 1
    free[m] = (k + 0.5) * s - 0.5 >= m + 1 ? 1 : 0;
  }
  return free;
}

/** The facet score (above), the peak and the volume of δ over the mask. */
function measure(d, n, keep) {
  const free = freeStencils(n);
  let peak = 0;
  for (let i = 0; i < d.length; i++) if (keep(i % n, Math.floor(i / n))) peak = Math.max(peak, Math.abs(d[i]));
  let fs = 0, fk = 0, as = 0, ak = 0, vol = 0;
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const i = x + y * n;
    if (!keep(x, y)) continue;
    vol += d[i];
    if (Math.abs(d[i]) < 0.1 * peak) continue;
    const dx = d[i - 1] - 2 * d[i] + d[i + 1], dy = d[i - n] - 2 * d[i] + d[i + n];
    as += dx * dx + dy * dy; ak += 2;
    if (free[x]) { fs += dx * dx; fk++; }
    if (free[y]) { fs += dy * dy; fk++; }
  }
  const curv = Math.sqrt(as / Math.max(ak, 1));
  const score = Math.sqrt(fs / Math.max(fk, 1)) / Math.max(curv, 1e-30);
  return { peak, vol: vol * (L / n) ** 2, score, curv, cells: ak / 2 };
}

/** A separable Gaussian blur of f (n × n), σ in cells (as pressfacets'). */
function blur(f, n, sigma) {
  const r = Math.ceil(3 * sigma), w = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); w.push(v); sum += v; }
  for (let i = 0; i < w.length; i++) w[i] /= sum;
  const a = new Float64Array(n * n), b = new Float64Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let t = 0;
    for (let i = -r; i <= r; i++) t += w[i + r] * f[Math.min(n - 1, Math.max(0, x + i)) + y * n];
    a[x + y * n] = t;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let t = 0;
    for (let i = -r; i <= r; i++) t += w[i + r] * a[x + Math.min(n - 1, Math.max(0, y + i)) * n];
    b[x + y * n] = t;
  }
  return b;
}

function correlation(a, b, keep, n) {
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!keep(i % n, Math.floor(i / n))) continue;
    sa += a[i]; sb += b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i]; k++;
  }
  const va = saa - sa * sa / k, vb = sbb - sb * sb / k;
  return (sab - sa * sb / k) / Math.sqrt(Math.max(va * vb, 1e-60));
}

// The writers, each on glass of its own, inside the open rim (radius 96).
const SPOTS = { bass: [56, 56], lift: [56, 136], quiet: [136, 136] };
const BASE = { r: 30, amount: 0.003 };          // the pressed glass a lift opens
const FINGERING = 0.8;
// In the order they are laid; `at` is the spot. The bass is one hand: down, deeper, let go.
const TRIALS = [
  { name: 'bass down', what: 'bass', at: 'bass', r: 18, amount: 0.0012 },
  { name: 'bass deeper', what: 'bass', at: 'bass', r: 18, amount: 0.0024 },
  { name: 'bass let go', what: 'bass', at: 'bass', r: 18, amount: 0 },
  { name: 'lift', what: 'lift', at: 'lift', r: 14, amount: 0.004, base: true },
  { name: 'quiet', what: null, at: 'quiet' },
];

const { page, close } = await openLab();
let failed = false;
try {
  const plates = {};
  for (const fine of [false, true]) {
    const got = await page.evaluate(async ({ N, L, P, SPOTS, BASE, TRIALS, fine, NU, SHEET_AMOUNT, GLASS_AMOUNT, FINGERING }) => {
      await lab.create(N, L);
      lab.gridLayReset(!fine);
      await lab.step(2, P);
      const read = async () => (await lab.squeeze()).gap;
      const res = {};
      const lay = async (name, fn) => {
        const a = await read();
        const told = fn();
        lab.flush(P.dt);
        const b = await read();
        res[name] = { d: Array.from(b, (v, i) => v - a[i]), told };
      };
      for (const t of TRIALS) {
        const [x, y] = SPOTS[t.at];
        if (t.base) { lab.gridLay('press', x, y, BASE.r, BASE.amount, true); lab.flush(P.dt); }
        await lay(t.name, () => (t.what ? lab.gridLay(t.what, x, y, t.r, t.amount, fine, FINGERING) : 0));
      }
      // The rhythm sheet in the plate's middle: its first step's change, by the cubic or (main's, gridLayReset) the bilinear.
      lab.sheetPress(0.5, 0.5, SHEET_AMOUNT, NU);
      await lay('sheet', () => { lab.sheetStep(1 / 60, 0); return 0; });
      // A kick's clock glass, pressed whole over the dish (the sheet laid its change once and is not stepped again): six steps down, one flush.
      lab.glassPress(0.5, 0.5, GLASS_AMOUNT);
      await lay('clock glass', () => { for (let i = 0; i < 6; i++) lab.glassStep(1 / 60, 0); return 0; });
      return { n: (await lab.squeeze()).n, res };
    }, { N, L, P, SPOTS, BASE, TRIALS, fine, NU, SHEET_AMOUNT, GLASS_AMOUNT, FINGERING });
    plates[fine ? 'fine' : 'main'] = got;
  }
  const n = plates.fine.n;
  check(`the solver runs at ${N}² over the ${L}² plate`, n === N && plates.main.n === N, `n ${n}`);
  const s = n / L;
  const near = (spot, R) => (x, y) => Math.hypot((x + 0.5) / s - spot[0] - 0.5, (y + 0.5) / s - spot[1] - 0.5) < R;
  // A flush that lays nothing changes nothing anywhere: so every δ below is its own lay alone.
  let quiet = 0;
  for (const p of [plates.fine, plates.main]) for (const v of p.res.quiet.d) quiet = Math.max(quiet, Math.abs(v));
  check('a flush that lays nothing leaves the glass as it was, the whole plate', quiet < 1e-7, `|δ| ${quiet.toExponential(2)}`);
  /*
    What each should be, where the gap stays under rest and off the floor
    (the base press is deeper than any opening here): a release opens as a
    a lift opens by squish.ts's liftShare at every point, which is what the
    solver's spokeLift must be.
  */
  const sp = spokesAt(SPOTS.lift[0], SPOTS.lift[1], FINGERING);
  const lift = TRIALS.find((t) => t.name === 'lift');
  const oracle = {
    lift: (x, y) => lift.amount * 0.5 * FINGERING * liftShare((x + 0.5) / s - SPOTS.lift[0] - 0.5, (y + 0.5) / s - SPOTS.lift[1] - 0.5, lift.r, Math.round(lift.r * 1.15), sp),
  };
  // The sheet's channel: the rhythm sheet's dent, and the clock glass over most of the dish.
  for (const t of [...TRIALS.filter((t) => t.what), { name: 'sheet', what: 'sheet', R: 60 }, { name: 'clock glass', what: 'sheet', R: 80 }]) {
    const R = t.R ?? (t.what === 'lift' ? t.r * 1.3 : t.r * 1.1);
    const keep = near(t.what === 'sheet' ? [95.5, 95.5] : SPOTS[t.at], R);
    const M = plates.main.res[t.name], F = plates.fine.res[t.name];
    const m = measure(M.d, n, keep), f = measure(F.d, n, keep);
    // At the 192² grid's own scale (blurred by one of its cells): what a facet changes is finer than that.
    const corr = correlation(blur(M.d, n, s), blur(F.d, n, s), keep, n);
    console.log(`     ${t.name}: main |δ| ${m.peak.toExponential(2)} volume ${m.vol.toExponential(3)} free ${m.score.toFixed(2)} curvature ${m.curv.toExponential(2)};` +
      ` now |δ| ${f.peak.toExponential(2)} volume ${f.vol.toExponential(3)} free ${f.score.toFixed(2)} curvature ${f.curv.toExponential(2)}; told ${F.told.toExponential(3)}; correlation ${corr.toFixed(3)}`);
    // Under half: a deeper bass on glass already pressed closes by Stefan's law, which bends main's facets a little (0.37).
    check(`${t.name}: main's lay is the 192² grid's facets (the score can see them)`, m.peak > 0 && m.score < 0.5, `free ${m.score.toFixed(2)}`);
    check(`${t.name}: now its curvature is spread between the CPU's samples`, f.peak > 0 && f.score > 0.6, `free ${f.score.toFixed(2)}`);
    /*
      And no more of it than main's: a staircase (each cell given its 192²
      cell's value) spreads its curvature too, at thirty times main's. The
      lift is held to its formula instead (below), which a staircase fails:
      its spokes are two or three 192² cells wide, and drawn at the solver's
      cells they carry three times the curvature main's bilinear blurred
      out of them, the spokes' own and not their edges' (liftShare eases
      every edge, so the glass it lays has no crease).
    */
    if (!oracle[t.name]) check(`${t.name}: and no more curvature than main's`, f.curv < 1.5 * m.curv, `rms d² ${f.curv.toExponential(2)} against ${m.curv.toExponential(2)}`);
    check(`${t.name}: the same glass, where main laid it`, corr > 0.95, `correlation ${corr.toFixed(3)}`);
    const tol = t.what === 'sheet' ? 0.03 : 0.1;
    check(`${t.name}: the same volume as main's`, Math.abs(f.vol - m.vol) <= tol * Math.abs(m.vol), `${f.vol.toExponential(3)} against ${m.vol.toExponential(3)}`);
    if (t.what === 'sheet') check(`${t.name}: as deep as main's`, Math.abs(f.peak - m.peak) <= 0.03 * m.peak, `${f.peak.toExponential(3)} against ${m.peak.toExponential(3)}`);
    // An opening under rest is laid as told (a press closes by Stefan's law, so the bass is held to main's instead).
    if (t.what === 'lift') for (const [who, X] of [['main', m], ['now', f]])
      check(`${t.name}: ${who} lays the volume the 192² grid was told`, Math.abs(X.vol - F.told) <= 0.03 * Math.abs(F.told), `${X.vol.toExponential(3)} against ${F.told.toExponential(3)}`);
    if (oracle[t.name]) {
      let e2 = 0, k = 0, peak = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (!keep(x, y)) continue;
        const want = oracle[t.name](x, y), e = F.d[x + y * n] - want;
        e2 += e * e; k++; peak = Math.max(peak, Math.abs(want));
      }
      const err = Math.sqrt(e2 / Math.max(k, 1)) / Math.max(peak, 1e-30);
      check(`${t.name}: at every solver cell what its own formula gives there`, peak > 0 && err < 0.01, `rms error ${(100 * err).toFixed(2)}% of the peak ${peak.toExponential(2)}`);
    }
  }
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await close();
}
const bad = checks.filter((c) => !c.ok).length;
console.log(`\n${bad || failed ? `${bad} failed` : 'all passed'}`);
process.exit(bad || failed ? 1 : 0);
