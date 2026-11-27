#!/usr/bin/env node
/**
 * A draining soap film seen in reflection: the convection that sorts it, and
 * the colours it makes (PLAN 32).
 *
 *   npm run soapfilm (node only: src/lib/soapFilm.ts, the CPU reference, and
 *   src/lib/filmTable.ts)
 *
 * The owner sent a photograph of a vertical soap film in reflected light:
 * Newton's colours in bands, black lace with dots and islands where the film
 * has thinned past 30 nm, and the bands combed by the flow that made them.
 * What the app has today is a faint colour table read at normal incidence
 * (filmTable.ts) and a Clear Film that tears (film.ts, 20b) with no gravity,
 * no thickness in nanometres and no reflected view. PLAN 32 adds the
 * missing physics: an inextensible film whose thick parts sink and thin
 * parts rise, a film that evaporates until it ruptures to Newton black, and
 * a reflection that depends on the angle you look from. This file is the
 * judge for all of it, written before the build so the build is held to
 * numbers rather than to a likeness.
 *
 * It is asked of the CPU reference first (PLAN 32a) and of the shaders after
 * (32c, the soapgpu check, lab), so the GPU is held to a model that is
 * itself held to physics, not to whatever the GPU happens to draw.
 *
 *   C1  Gravity sorts the film. In a closed film with a thick patch and a
 *       thin patch of the same size side by side, the thick one sinks and the
 *       thin one rises, each by at least a quarter of the film's height
 *       (the convection of an inextensible film: the film tension is the
 *       pressure of the flow, so the film cannot stretch, only exchange).
 *   C2  Nothing is made or lost. With no evaporation the film's total
 *       thickness is conserved to 1e-9, and a film of uniform thickness
 *       stays exactly uniform (hydrostatic: a uniform film has nothing to
 *       sort).
 *   C3  Gravity is the only driver. With g = 0 a noisy film does not move
 *       at all; with g reversed the sort reverses; and half the gravity sorts
 *       about half as fast (a ratio between 0.35 and 0.7 after 2.5 s), so g
 *       is the driver and not merely the sign of a push. A check that the
 *       sound, the mouse or a stray term cannot move the film as a whole: the
 *       owner's rule against whole-frame motion from sound.
 *   C4  The flow is a flow, not a blur, and the thickness moves with it.
 *       The face flows are divergence-free (max |div u| under 1e-3 of the
 *       fastest speed over the cell size), the thick patch keeps its
 *       excess while it falls (a local peak of at least 45% of what it began
 *       with at 5 s, and the patch's mass within 0.3 to 1.7 of the start: a
 *       first-order upwind scheme leaves 38%, a limited second-order one
 *       51%, a blur far less), and every cell's change in one step lies
 *       between what the faces it has could carry out and in, taking each
 *       face's thickness anywhere between its two neighbours' (an interval
 *       test, not a mean, because an upwind or limited scheme is not the mean
 *       of its neighbours). A film smoothed by anything but the flow, or
 *       moved by a flow it does not report, falls outside that interval.
 *   C5  Look from the side and the colours move. The picture is the table's
 *       colour for each thickness (reflected, gain 4, to 1.5/255), in 0..1,
 *       and seen at an angle a film looks like a thinner one seen straight
 *       on, d cos(theta) (30 and 50 degrees, to 1.5/255). Straight on the
 *       first maximum at 550 nm is the table's own, within 1%, and an
 *       independently written Airy formula agrees with the table to 1e-6.
 *   C6  The film drains the way a real one does. Evaporating at 5 nm/s from
 *       800 nm, the mean thickness by quarters of the height grows from top
 *       to bottom at every time after 30 s, the top quarter reaches true
 *       rupture (a tenth of its cells under 30 nm) by 120 s and first, the
 *       bottom quarter never does before the top is at least a tenth black,
 *       and a ruptured cell stays black (it does not refill). Black is the
 *       film's thickness, not the picture's brightness: a purple band near
 *       200 nm is dark too, and a blur laid over a fixed ramp is dark
 *       anywhere.
 *   C7  It looks like the photograph. Over the 120 s run, there is a window of
 *       at least 3 samples in a row (5 s apart) in which the film under 30 nm
 *       is between 0.5% and 6% of the film, the reflected picture, scored the
 *       way the photo was, is dark (luma < 0.2) between 3% and 25%, more than
 *       10% of it is saturated (chroma > 0.25), and at least 7 of the 12 hue
 *       sectors hold more than 4% of the coloured pixels. The photograph
 *       measures 1.1% black, 14.3% dark, 15% saturated and 9 of 12 (PLAN 32).
 *       The window is asked for, not a moment, because the look is a stage
 *       the film passes through.
 *
 * A bar is never moved to get green. If the model cannot reach one, say what
 * it reached in the PR and ask; the bar is the owner's photograph's.
 *
 * Until src/lib/soapFilm.ts exists this prints that and exits 1: the check
 * is committed first so the build has something to be held to.
 */
import { build } from 'esbuild';
import { existsSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const modulePath = process.env.SOAPFILM_MODULE || 'src/lib/soapFilm.ts';
if (!existsSync(modulePath)) {
  console.log(` FAIL ${modulePath} does not exist yet — PLAN 32a builds it; this check is what it is built against`);
  console.log('\n0/1 checks passed');
  process.exit(1);
}

const out = 'node_modules/.cache/soap-film.mjs';
await build({
  stdin: {
    contents: `export * from './${modulePath}'; export { filmReflectance, filmColour, SOAP } from './${process.env.SOAPFILM_TABLE || 'src/lib/filmTable.ts'}';`,
    resolveDir: '.', loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const M = await import(`../${out}`);
const { createSoapFilm, stepSoapFilm, soapFilmRgb, filmReflectance, filmColour, SOAP } = M;
for (const name of ['createSoapFilm', 'stepSoapFilm', 'soapFilmRgb']) {
  if (typeof M[name] !== 'function') { console.log(` FAIL the module must export ${name}()`); process.exit(1); }
}

/*
  The contract the module is held to (PLAN 32a): a film is {nx, ny, dx, h}
  with h in nanometres, row-major, row 0 at the top, gravity toward +y, in a
  closed box. stepSoapFilm(f, dt, {g = 9.81, evap = 0 (nm/s)}) advances it
  dt seconds and returns nothing; it may also expose f.u, f.v (m/s, on the
  cell centres) for C4. soapFilmRgb(f, {cosI = 1, gain = 4}) is the reflected
  picture, 0..1, nx*ny*3, row 0 at the top.
*/
const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
const film = (o) => createSoapFilm({ nx: 32, ny: 64, ...o });
const patch = (f, cx, cy, r, v) => {
  for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) if (Math.hypot(i - cx, j - cy) < r) f.h[j * f.nx + i] = v;
};
// Centroid row of the excess (or deficit) of one half of the film.
const centroid = (f, left, thick) => {
  let m = 0, y = 0;
  for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
    if ((i < f.nx / 2) !== left) continue;
    const v = f.h[j * f.nx + i], w = thick ? Math.max(0, v - 900) : Math.max(0, 700 - v);
    m += w; y += w * j;
  }
  return m ? y / m : NaN;
};

// ── C1 / C4: the sort ────────────────────────────────────────────────
{
  const f = film({ noise: 0 });
  patch(f, 10, 32, 4, 1600); patch(f, 22, 32, 4, 400);
  const y0 = [centroid(f, true, true), centroid(f, false, false)];
  const peak0 = Math.max(...f.h);
  // The thick patch's own excess, over 900 nm, in the left half: carried, not smeared or replaced.
  const excess = () => { let m = 0; for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx / 2; i++) m += Math.max(0, f.h[j * f.nx + i] - 900); return m; };
  // The highest thickness within 6 rows of the patch's centroid and in its half: the patch's peak, not the film's.
  const localPeak = () => {
    const c = Math.round(centroid(f, true, true)); let p = 0;
    for (let j = Math.max(0, c - 6); j <= Math.min(f.ny - 1, c + 6); j++) for (let i = 0; i < f.nx / 2; i++) p = Math.max(p, f.h[j * f.nx + i]);
    return p;
  };
  const ex0 = excess();
  let divMax = 0, uMax = 0, peakMid = 0, exMid = 0;
  for (let k = 0; k < 600; k++) {
    stepSoapFilm(f, 0.05);
    if (k === 99) { peakMid = localPeak(); exMid = excess(); }
    if (k === 300 && f.uf && f.vf) {
      const { nx, ny, dx, uf, vf } = f;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const d = (uf[j * (nx + 1) + i + 1] - uf[j * (nx + 1) + i] + vf[(j + 1) * nx + i] - vf[j * nx + i]) / dx;
        divMax = Math.max(divMax, Math.abs(d));
      }
      for (const x of uf) uMax = Math.max(uMax, Math.abs(x));
      for (const x of vf) uMax = Math.max(uMax, Math.abs(x));
    }
  }
  const y1 = [centroid(f, true, true), centroid(f, false, false)];
  const need = f.ny / 4;
  check('C1 the thick patch sinks', y1[0] - y0[0] >= need, `down ${(y1[0] - y0[0]).toFixed(1)} rows, wanted ${need}`);
  check('C1 the thin patch rises', y0[1] - y1[1] >= need, `up ${(y0[1] - y1[1]).toFixed(1)} rows, wanted ${need}`);
  const peak1 = peakMid - 800, peakNeed = 0.45 * (peak0 - 800);
  check('C4 the sinking patch keeps its thickness at 5 s (a flow, not a blur)', peak1 >= peakNeed, `excess ${peak1.toFixed(0)} nm of ${(peak0 - 800).toFixed(0)}, wanted at least ${peakNeed.toFixed(0)}`);
  // A model that blurs the film and adds a fixed ramp top to bottom moves the centroid of everything
  // thick without carrying the patch; the patch's own mass and its peak, in its own place, say it was carried.
  check('C4 it is the patch that moved: its excess mass is kept at 5 s', exMid >= 0.3 * ex0 && exMid <= 1.7 * ex0, `${(exMid / ex0).toFixed(2)} of its starting excess, wanted 0.3 to 1.7`);
  if (f.uf && f.vf) {
    const bar = 1e-3 * uMax / f.dx;
    check('C4 the flow is divergence-free', uMax > 0 && divMax <= bar, `max |div u| ${divMax.toExponential(1)} /s against ${bar.toExponential(1)} (speed max ${uMax.toExponential(1)} m/s)`);
    // The faces are the model's own word. Tie them to what the thickness did. One step of a noisy film
    // changes a cell by -dt div(F), F = u times the film's thickness on the face; a scheme's face value, first
    // order or limited, lies between its two cells' values, so each cell's change must lie in the interval that
    // range allows (the sum of each face's interval), to a margin of a twentieth of the changes' RMS. A
    // field that is "divergence-free" by construction but not what moved the thickness falls outside it. Walls carry nothing.
    const g = film({ noise: 0.3, seed: 9 }), h0 = Float64Array.from(g.h), dtc = 0.05;
    stepSoapFilm(g, dtc);
    const { nx, ny, dx, uf, vf } = g;
    let wall = 0;
    for (let j = 0; j < ny; j++) wall = Math.max(wall, Math.abs(uf[j * (nx + 1)]), Math.abs(uf[j * (nx + 1) + nx]));
    for (let i = 0; i < nx; i++) wall = Math.max(wall, Math.abs(vf[i]), Math.abs(vf[ny * nx + i]));
    // Interval of u * h over h between a and b, per unit area change into the cell: [lo, hi].
    const iv = (u, a, b) => (u >= 0 ? [u * Math.min(a, b), u * Math.max(a, b)] : [u * Math.max(a, b), u * Math.min(a, b)]);
    let ms = 0; for (let c = 0; c < nx * ny; c++) ms += (g.h[c] - h0[c]) ** 2;
    const margin = 0.05 * Math.sqrt(ms / (nx * ny));
    let outside = 0, moved = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = j * nx + i; let lo = 0, hi = 0;
      const add = (sign, u, a, b) => { const [l, h] = iv(u, a, b); if (sign > 0) { lo += l; hi += h; } else { lo -= h; hi -= l; } };
      // net out of the cell: east and south faces out, west and north faces in; change = -dt/dx * (out - in)
      if (i < nx - 1) add(1, uf[j * (nx + 1) + i + 1], h0[c], h0[c + 1]);
      if (i > 0) add(-1, uf[j * (nx + 1) + i], h0[c], h0[c - 1]);
      if (j < ny - 1) add(1, vf[(j + 1) * nx + i], h0[c], h0[c + nx]);
      if (j > 0) add(-1, vf[j * nx + i], h0[c], h0[c - nx]);
      const a = -dtc * hi / dx, b = -dtc * lo / dx, got = g.h[c] - h0[c];
      moved += Math.abs(got) > margin ? 1 : 0;
      if (got < a - margin || got > b + margin) outside++;
    }
    const frac = outside / (nx * ny);
    check('C4 and the thickness moves with that flow (-dt div(h u), walls shut)', moved > 0.05 * nx * ny && frac < 0.01 && wall === 0, `${(100 * frac).toFixed(2)}% of cells changed by more than the faces allow (under 1%), ${moved} cells moved, flow through the walls ${wall.toExponential(1)}`);
  } else {
    check('C4 the flow is divergence-free', false, 'the film must expose f.uf and f.vf (m/s, on the cell faces)');
  }
}

// ── C2: nothing made or lost ─────────────────────────────────────────
{
  const f = film({ noise: 0.3, seed: 3 });
  const m0 = sum(f.h);
  for (let k = 0; k < 200; k++) stepSoapFilm(f, 0.05);
  const drift = Math.abs(sum(f.h) / m0 - 1);
  check('C2 total thickness is conserved with no evaporation', drift < 1e-9, `drift ${drift.toExponential(1)}`);
  const u = film({ noise: 0, h0: 800 });
  for (let k = 0; k < 100; k++) stepSoapFilm(u, 0.05);
  let worst = 0; for (const v of u.h) worst = Math.max(worst, Math.abs(v - 800));
  check('C2 a uniform film stays uniform', worst < 1e-6, `largest change ${worst.toExponential(1)} nm`);
}

// ── C3: gravity is the only driver ───────────────────────────────────
{
  const a = film({ noise: 0.3, seed: 5 });
  const before = Float64Array.from(a.h);
  for (let k = 0; k < 200; k++) stepSoapFilm(a, 0.05, { g: 0 });
  let worst = 0; for (let i = 0; i < before.length; i++) worst = Math.max(worst, Math.abs(a.h[i] - before[i]));
  check('C3 with g = 0 the film does not move', worst < 1e-6, `largest change ${worst.toExponential(1)} nm`);

  const b = film({ noise: 0 });
  patch(b, 10, 32, 4, 1600);
  const y0 = centroid(b, true, true);
  for (let k = 0; k < 300; k++) stepSoapFilm(b, 0.05, { g: -9.81 });
  const dy = centroid(b, true, true) - y0;
  const hf = film({ noise: 0 });
  patch(hf, 10, 32, 4, 1600);
  const yh0 = centroid(hf, true, true);
  for (let k = 0; k < 50; k++) stepSoapFilm(hf, 0.05, { g: 4.905 });
  const full = film({ noise: 0 });
  patch(full, 10, 32, 4, 1600);
  for (let k = 0; k < 50; k++) stepSoapFilm(full, 0.05);
  const ratio = (centroid(hf, true, true) - yh0) / (centroid(full, true, true) - yh0);
  check('C3 half the gravity sorts about half as fast (g is the driver, not its sign)', ratio > 0.35 && ratio < 0.7, `${ratio.toFixed(2)} of the full-gravity distance in 2.5 s (before the patch reaches the wall), wanted 0.35 to 0.7`);
  check('C3 with gravity reversed the thick patch rises', dy <= -b.ny / 8, `moved ${dy.toFixed(1)} rows (negative is up), wanted at most ${-b.ny / 8}`);
}

// ── C5: look from the side and the colours move ──────────────────────
{
  const { n0, n1, n2 } = SOAP;
  const firstMax = (cosI) => {
    let best = 0, at = 0;
    // The first maximum at 550 nm sits near d = 550/(4 n) = 103 nm; scan around it.
    for (let d = 40; d <= 220; d += 0.25) {
      const r = filmReflectance(n0, n1, n2, d, 550, cosI);
      if (r > best) { best = r; at = d; }
    }
    return at;
  };
  const straight = firstMax(1);
  const want0 = 550 / (4 * n1);
  check('C5 looking straight on, the first maximum at 550 nm is at lambda / 4n', Math.abs(straight - want0) / want0 < 0.01, `${straight.toFixed(1)} nm, wanted ${want0.toFixed(1)} nm`);
  // Airy's sum for a film in air, written out here and not read from the table, at several thicknesses
  // and angles (the phase 4 pi n d cos(theta_t) / lambda; the interfaces' amplitudes are the normal-incidence ones).
  let airyWorst = 0;
  for (const deg of [0, 30, 50]) for (const d of [30, 103, 150, 300, 800]) for (const l of [450, 550, 650]) {
    const cosI = Math.cos((deg * Math.PI) / 180), cosT = Math.sqrt(1 - (1 - cosI * cosI) / (n1 * n1));
    const r1 = (n0 - n1) / (n0 + n1), r2 = (n1 - n2) / (n1 + n2), c = Math.cos((4 * Math.PI * n1 * d * cosT) / l);
    const R = (r1 * r1 + r2 * r2 + 2 * r1 * r2 * c) / (1 + r1 * r1 * r2 * r2 + 2 * r1 * r2 * c);
    airyWorst = Math.max(airyWorst, Math.abs(filmReflectance(n0, n1, n2, d, l, cosI) - R));
  }
  check('C5 the reflectance is Airy\'s sum, at any angle', airyWorst < 1e-6, `largest difference ${airyWorst.toExponential(1)}`);
  for (const deg of [30, 50]) {
    const cosI = Math.cos((deg * Math.PI) / 180);
    const cosT = Math.sqrt(1 - (1 - cosI * cosI) / (n1 * n1));
    const want = straight / cosT, got = firstMax(cosI);
    check(`C5 at ${deg} degrees the first maximum is at d0 / cos(angle in the film)`, Math.abs(got - want) / want < 0.02, `${got.toFixed(1)} nm, wanted ${want.toFixed(1)} nm`);
  }
}

// ── C5b: the picture is the table's colour at that thickness, and the angle moves only the phase ──
{
  const { n0, n1, n2 } = SOAP;
  const ds = [5, 20, 45, 103, 150, 200, 250, 300, 360, 400, 550, 800, 1200, 1800];
  const f = createSoapFilm({ nx: ds.length, ny: 1, noise: 0 });
  ds.forEach((d, i) => { f.h[i] = d; });
  const rgb = soapFilmRgb(f, { cosI: 1, gain: 4 });
  let worst = 0, lo = Infinity, hi = -Infinity;
  ds.forEach((d, i) => {
    const want = filmColour(n0, n1, n2, d, 'R', 4).rgb;
    for (let k = 0; k < 3; k++) { worst = Math.max(worst, Math.abs(rgb[3 * i + k] - want[k])); lo = Math.min(lo, rgb[3 * i + k]); hi = Math.max(hi, rgb[3 * i + k]); }
  });
  check('C5 the picture is the table\'s colour at each thickness (reflected, gain 4)', rgb.length === ds.length * 3 && worst <= 1.5 / 255, `largest difference ${(worst * 255).toFixed(2)}/255 over ${ds.length} thicknesses`);
  check('C5 the picture is 0 to 1 in every channel', lo >= 0 && hi <= 1 && Number.isFinite(lo + hi), `range ${lo.toFixed(3)} to ${hi.toFixed(3)}`);
  // Seen at an angle the phase is 4 pi n d cos(theta_t) / lambda, so a film d thick seen at theta looks exactly like one
  // d cos(theta_t) thick seen straight on: the same picture, from a different film.
  let angWorst = 0;
  for (const deg of [30, 50]) {
    const cosI = Math.cos((deg * Math.PI) / 180), cosT = Math.sqrt(1 - (1 - cosI * cosI) / (n1 * n1));
    const g = createSoapFilm({ nx: ds.length, ny: 1, noise: 0 });
    ds.forEach((d, i) => { g.h[i] = d * cosT; });
    const a = soapFilmRgb(f, { cosI, gain: 4 }), b = soapFilmRgb(g, { cosI: 1, gain: 4 });
    for (let k = 0; k < a.length; k++) angWorst = Math.max(angWorst, Math.abs(a[k] - b[k]));
  }
  check('C5 seen at an angle, a film looks like a thinner one seen straight on (d cos theta)', angWorst <= 1.5 / 255, `largest difference ${(angWorst * 255).toFixed(2)}/255 at 30 and 50 degrees`);
}

// ── C6 / C7: it drains, and it looks like the photograph ─────────────
{
  const f = film({ nx: 48, ny: 96, noise: 0, h0: 800 });
  // Smooth blobs of thick and thin film, seeded: the structure the sort has to work on.
  let s = 7;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let b = 0; b < 60; b++) {
    const cx = rnd() * f.nx, cy = rnd() * f.ny, r = 2 + rnd() * 5, a = (rnd() - 0.5) * 2 * 0.5 * 800;
    for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
      const d = Math.hypot(i - cx, j - cy) / r;
      if (d < 2) f.h[j * f.nx + i] += a * Math.exp(-d * d);
    }
  }
  for (let i = 0; i < f.h.length; i++) f.h[i] = Math.max(100, f.h[i]);

  const q = (g, k) => { // mean thickness and black fraction of quarter k
    const n = f.nx * (f.ny / 4); let m = 0, bk = 0;
    for (let j = k * (f.ny / 4); j < (k + 1) * (f.ny / 4); j++) for (let i = 0; i < f.nx; i++) { const v = g.h[j * f.nx + i]; m += v; if (v < 30) bk++; }
    return [m / n, bk / n];
  };
  const dt = 0.05, T = 120, every = Math.round(5 / dt);
  let ordered = true, topFirst = true, noRefill = true, orderedAt = '', topBlackAt = -1;
  const ruptured = new Uint8Array(f.h.length);
  const stats = [];
  for (let k = 0; k <= T / dt; k++) {
    if (k % every === 0) {
      const t = k * dt, m = [0, 1, 2, 3].map((i) => q(f, i));
      if (t >= 30 && !(m[0][0] < m[1][0] && m[1][0] < m[2][0] && m[2][0] < m[3][0])) { ordered = false; orderedAt = `t=${t}s means ${m.map((x) => x[0].toFixed(0)).join(' ')}`; }
      if (m[3][1] > 0 && m[0][1] < 0.1) topFirst = false;
      if (topBlackAt < 0 && m[0][1] >= 0.1) topBlackAt = t;
      let dark = 0, dark2 = 0, sat = 0, col = 0; const sec = new Array(12).fill(0);
      const rgb = soapFilmRgb(f, { cosI: 1, gain: 4 }), n = f.nx * f.ny;
      for (let i = 0; i < n; i++) {
        const r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2];
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b), ch = mx - mn;
        if (l < 0.12) dark++; if (l < 0.2) dark2++; if (ch > 0.25) sat++;
        if (ch > 0.15) {
          col++;
          const H = mx === r ? ((g - b) / ch + 6) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4;
          sec[Math.floor(H * 2) % 12]++;
        }
      }
      const sectors = sec.filter((v) => v > 0.04 * col).length;
      let hb = 0; for (let i = 0; i < n; i++) if (f.h[i] < 30) hb++;
      stats.push({ t, dark: dark / n, dark2: dark2 / n, sat: sat / n, sectors, hb: hb / n });
    }
    stepSoapFilm(f, dt, { evap: 5 });
    for (let i = 0; i < f.h.length; i++) { if (f.h[i] < 30) ruptured[i] = 1; else if (ruptured[i]) noRefill = false; }
  }
  check('C6 thin at the top, thick at the bottom, at every time after 30 s', ordered, ordered ? 'quarter means rise top to bottom' : orderedAt);
  check('C6 the top reaches black first', topFirst, topFirst ? 'the bottom quarter had no black before the top was a tenth black' : 'black appeared at the bottom first');
  check('C6 the top does go black: a tenth of its cells under 30 nm by the end (120 s)', topBlackAt >= 0, topBlackAt < 0 ? 'never' : `at ${topBlackAt} s`);
  check('C6 a ruptured cell stays black', noRefill, noRefill ? 'none refilled past 30 nm' : 'a cell under 30 nm thickened again');

  // The window: stretches of consecutive 5 s samples that all hit the photograph's numbers.
  // The black is film that has gone under 30 nm (hb), not dark pixels: a purple band at 200 nm is dark too, and a
  // blur with a fixed ramp can be made dark anywhere. The photograph's dark (luma under 0.2) is 14%; its black, 1%.
  const hit = (x) => x.hb >= 0.005 && x.hb <= 0.06 && x.dark2 >= 0.03 && x.dark2 <= 0.25 && x.sat > 0.10 && x.sectors >= 7;
  let run = 0, best = 0;
  for (const x of stats) { run = hit(x) ? run + 1 : 0; best = Math.max(best, run); }
  const peak = stats.reduce((a, x) => (hit(x) && (!a || x.hb > a.hb) ? x : a), null);
  check('C7 a window of at least 10 s looks like the photograph', best >= 3, // 3 samples 5 s apart span 10 s
    `${best} samples in a row (5 s apart)${peak ? `; at t=${peak.t}s film under 30 nm ${(100 * peak.hb).toFixed(1)}%, dark ${(100 * peak.dark2).toFixed(1)}%, saturated ${(100 * peak.sat).toFixed(0)}%, ${peak.sectors}/12 hues` : '; never'}`);
}

// ── C8: the frame's Plateau border drains the film (PLAN 32f) ─────────
/*
  The prototype thinned the film by taking a constant 5 nm/s off every cell
  (named shortcut c). A real hanging film thins at its frame: the frame wears a
  Plateau border, a meniscus of radius r whose curvature sucks film in, and by
  marginal regeneration (Mysels, Shinoda and Frankel 1959) thick film is drawn
  into the border while thin film is pulled out of it and rises. The thin
  film's thickness is Frankel's law for surfaces the surfactant makes rigid,
  h_f = 2.68 r Ca^(2/3) with Ca = mu V / sigma, and the speed V it leaves at is
  the film's own buoyant exchange, V = rho g (h - h_f) / zeta, the same Darcy
  law the film's flow is made of. So the border takes V (h - h_f) per metre of
  frame per second, and nothing else touches the volume.

  The border is one body of liquid in hydrostatic balance, so its radius
  shrinks with height, r(z) = 1 / (1/r0 + rho g z / sigma): the top border is
  tight and sucks hardest, which is why a hanging film goes black from the top.

  The contract: stepSoapFilm(f, dt, { border: r0 }) with r0 the bottom
  border's radius in metres (absent: a film with no border, the closed box
  C1-C7 ask about), sigma 0.025 N/m and
  mu 1e-3 Pa s by default; f.drained is the thickness the border has taken,
  summed over cells in nm, so sum(h) + drained is conserved.

  Each line below is asked of the law, not of a picture: where the thinning
  happens (only at the frame), where the volume goes (into the border, to
  1e-9), how much (Frankel's thickness, solved here on its own), and that the
  radius is the dial (a tighter meniscus sucks harder). A uniform evaporation
  fails the first two; a border that removes a fixed fraction fails the third;
  a border that ignores r fails the fourth.
*/
{
  const RHO = 1000, ZETA = 1.5, SIGMA = 0.025, MU = 1e-3, G = 9.81;
  const onFrame = (f, c) => { const i = c % f.nx, j = (c / f.nx) | 0; return i === 0 || j === 0 || i === f.nx - 1 || j === f.ny - 1; };
  // One step from the same noisy film with and without a border: the transport is the same, so any difference is the border's.
  const a = film({ seed: 7 }), b = film({ seed: 7 });
  stepSoapFilm(a, 0.05, { border: 1e-3 }); stepSoapFilm(b, 0.05);
  let inside = 0, framed = 0, frameCells = 0;
  for (let c = 0; c < a.h.length; c++) {
    const d = b.h[c] - a.h[c];
    if (onFrame(a, c)) { frameCells++; if (d > 1e-9) framed++; } else if (Math.abs(d) > 1e-9) inside++;
  }
  check('C8 the border thins the film at the frame and nowhere else', inside === 0 && framed === frameCells,
    `${framed} of ${frameCells} frame cells thinner after one step, ${inside} cells off the frame changed`);

  const vol = film({ seed: 3 }), v0 = sum(vol.h);
  for (let k = 0; k < 200; k++) stepSoapFilm(vol, 0.05, { border: 1e-3 });
  const lost = v0 - sum(vol.h), drained = vol.drained ?? NaN;
  check('C8 what the film loses, the border takes (10 s, r = 1 mm)', Math.abs(lost - drained) / v0 < 1e-9 && drained / v0 > 1e-4,
    `film lost ${(100 * lost / v0).toFixed(3)}%, border took ${(100 * drained / v0).toFixed(3)}%, mismatch ${(Math.abs(lost - drained) / v0).toExponential(1)}`);

  // Frankel's law solved here on its own: x = 2.68 r (mu rho g (h - x) 1e-9 / (zeta sigma))^(2/3) * 1e9, by bisection.
  const frankel = (h, r) => {
    let lo = 0, hi = h;
    for (let k = 0; k < 200; k++) {
      const x = 0.5 * (lo + hi), rhs = 2.68 * r * Math.pow((MU * RHO * G * (h - x) * 1e-9) / (ZETA * SIGMA), 2 / 3) * 1e9;
      if (x < rhs) lo = x; else hi = x;
    }
    return 0.5 * (lo + hi);
  };
  // A uniform 800 nm film 8 mm tall: the bottom border at r0, the top one at Laplace-hydrostatic r(H).
  // Asked at two thicknesses (800 and 300 nm), so the law is the cell's own thickness's and not one film's constant,
  // and to 1% of each cell's change, not an absolute bar the change itself might sit under.
  const rTopOf = (dx) => 1 / (1 / 1e-3 + (RHO * G * 8 * dx) / SIGMA);
  const lines = [800, 300].map((h0) => {
    const u = createSoapFilm({ nx: 8, ny: 8, noise: 0, h0 });
    stepSoapFilm(u, 0.05, { border: 1e-3 });
    const expect = (r) => { const hf = frankel(h0, r), V = (RHO * G * (h0 - hf) * 1e-9) / ZETA; return [hf + (h0 - hf) * Math.exp(-V * 0.05 / u.dx), hf, V]; };
    const [bottom, hfB] = expect(1e-3), [top, hfT] = expect(rTopOf(u.dx));
    const gotB = u.h[7 * 8 + 3], gotT = u.h[0 * 8 + 3];
    const ok = Math.abs(gotB - bottom) <= 0.01 * (h0 - bottom) && Math.abs(gotT - top) <= 0.01 * (h0 - top) && Math.abs(u.h[27] - h0) < 1e-9 && gotT < gotB;
    return { ok, text: `${h0} nm: bottom fresh film ${hfB.toFixed(1)}, a cell ${gotB.toFixed(3)} (wanted ${bottom.toFixed(3)}); top r ${(rTopOf(u.dx) * 1e6).toFixed(0)} um fresh film ${hfT.toFixed(1)}, a cell ${gotT.toFixed(3)} (wanted ${top.toFixed(3)})` };
  });
  check('C8 the film the border draws out is Frankel\'s (h = 2.68 r Ca^2/3 at the buoyant exchange speed, r from the border\'s hydrostatics)',
    lines.every((l) => l.ok), lines.map((l) => l.text).join('; '));

  // r0 is the bottom border's radius; the borders above it are set by hydrostatics, so the dial shows most at the bottom row.
  // The bottom row's thinning is read against the same film with no border, since thick film sinks into that row too.
  const bottomRow = (f) => f.h.slice((f.ny - 1) * f.nx).reduce((a, x) => a + x, 0);
  const took = [0.25e-3, 1e-3, 4e-3, 0].map((r) => {
    const f = film({ seed: 3 });
    for (let k = 0; k < 200; k++) stepSoapFilm(f, 0.05, r ? { border: r } : {});
    return [f.drained ?? NaN, bottomRow(f)];
  });
  for (const t of took) t[1] = took[3][1] - t[1];
  took.pop();
  check('C8 a tighter meniscus sucks harder (bottom border r0 = 0.25, 1, 4 mm)',
    took[0][0] > took[1][0] && took[1][0] > took[2][0] && took[0][1] >= 2 * took[2][1],
    `border took ${took.map((x) => x[0].toFixed(0)).join(', ')} nm·cells in 10 s; the bottom row thinner than with no border by ${took.map((x) => x[1].toFixed(0)).join(', ')}`);

  // The drain with no evaporation at all: the frame alone must make the thin top and thick bottom C6 asks for.
  const dr = film({ seed: 1 }), d0 = sum(dr.h);
  const qm = (f, k) => { let s = 0; const r0 = (k * f.ny) / 4, r1 = ((k + 1) * f.ny) / 4; for (let j = r0; j < r1; j++) for (let i = 0; i < f.nx; i++) s += f.h[j * f.nx + i]; return s / ((r1 - r0) * f.nx); };
  let shaped = true, shapeAt = '';
  for (let k = 0; k <= 2400; k++) {
    if (k % 100 === 0 && k * 0.05 >= 30) {
      const m = [0, 1, 2, 3].map((i) => qm(dr, i));
      if (shaped && !(m[0] < m[1] && m[1] < m[2] && m[2] < m[3])) { shaped = false; shapeAt = `t=${k * 0.05}s means ${m.map((x) => x.toFixed(0)).join(' ')}`; }
    }
    stepSoapFilm(dr, 0.05, { border: 1e-3 });
  }
  const thinned = 1 - sum(dr.h) / d0;
  check('C8 with no evaporation the border alone drains the film top-down (120 s, r = 1 mm)', shaped && thinned > 0.01,
    `${shaped ? 'quarter means rise top to bottom after 30 s' : shapeAt}; the film lost ${(100 * thinned).toFixed(1)}%`);
}

// ── C9: black spots on Vrij's clock (PLAN 32g) ───────────────────────
/*
  The prototype turned a cell under 30 nm black by relaxing it to 8 nm over
  0.5 s and deleting the difference (named shortcut d). What really happens: a
  thin film is unstable to the van der Waals attraction between its faces, and
  a thermal ripple grows on it at Vrij's rate (1966), its time
  tau = 96 pi^2 sigma mu h^5 / A^2 with A the Hamaker constant (3.7e-20 J for
  a water film in air). In a soap film the ripple stops at Newton black, 8 nm,
  where the surfactant's own layers touch, and the liquid it held is pushed
  out into a rim around the spot (Mysels' black spots). So the time a film
  takes to go black is a steep law of its thickness (h^5: a 40 nm film in about
  2 s, 60 nm in about 13, 300 nm never in a show), and no liquid is lost.

  The contract: stepSoapFilm(f, dt, { sigma, mu, hamaker }) as defaults 0.025,
  1e-3, 3.7e-20; a cell is black when f.h is 8 nm and f.ruptured is set.
*/
{
  const SIGMA = 0.025, MU = 1e-3, A = 3.7e-20;
  const tau = (h) => (96 * Math.PI ** 2 * SIGMA * MU * (h * 1e-9) ** 5) / A ** 2;
  const firstBlack = (h, dt, T) => {
    const f = createSoapFilm({ nx: 8, ny: 8, noise: 0, h0: h });
    for (let k = 1; k <= T / dt; k++) {
      stepSoapFilm(f, dt, { g: 0 });
      for (let c = 0; c < f.h.length; c++) if (f.h[c] <= 8.01) return k * dt;
    }
    return Infinity;
  };
  const t40 = firstBlack(40, 0.01, 10), t55 = firstBlack(55, 0.05, 40);
  check('C9 a thin film goes black on Vrij\'s clock (tau = 96 pi^2 sigma mu h^5 / A^2, at 40 and 55 nm)',
    Math.abs(t40 / tau(40) - 1) < 0.05 && Math.abs(t55 / tau(55) - 1) < 0.05,
    `40 nm black at ${t40.toFixed(2)} s (Vrij ${tau(40).toFixed(2)} s), 55 nm at ${t55.toFixed(2)} s (Vrij ${tau(55).toFixed(2)} s)`);
  // The clock integrates: a film held at 300 nm for 60 s and then thinned by hand to 40 nm has banked almost nothing
  // (60 s of a 12 h clock), so it goes black about tau(40) after the thinning, not at once.
  {
    const f = createSoapFilm({ nx: 8, ny: 8, noise: 0, h0: 300 });
    for (let k = 0; k < 120; k++) stepSoapFilm(f, 0.5, { g: 0 });
    f.h.fill(40);
    let after = Infinity;
    for (let k = 1; k <= 1000 && after === Infinity; k++) { stepSoapFilm(f, 0.01, { g: 0 }); if (f.h.some((v) => v <= 8.01)) after = k * 0.01; }
    check('C9 the clock is spent, not read: a film thinned late goes black Vrij\'s time after it thinned', Math.abs(after / tau(40) - 1) < 0.05,
      `held at 300 nm 60 s, thinned to 40 nm: black ${after.toFixed(2)} s later (Vrij ${tau(40).toFixed(2)} s)`);
  }
  const t300 = firstBlack(300, 0.5, 120);
  check('C9 a 300 nm film does not go black in a 120 s show', t300 === Infinity, t300 === Infinity ? `Vrij's time is ${(tau(300) / 3600).toFixed(0)} h` : `black at ${t300} s`);

  // A thin patch in a thick still film: it goes black, keeps its liquid in a rim, and the film's total is untouched.
  const f = createSoapFilm({ nx: 32, ny: 32, noise: 0, h0: 300 });
  patch(f, 16, 16, 3, 40);
  const spot = []; for (let c = 0; c < f.h.length; c++) if (f.h[c] === 40) spot.push(c);
  const s0 = sum(f.h);
  for (let k = 0; k < 100; k++) stepSoapFilm(f, 0.05, { g: 0 });
  const black = spot.filter((c) => f.h[c] <= 8.01 && f.ruptured[c]).length;
  // The rim is the film outside the patch that borders the spot. Film left inside the patch between spots that met
  // (an island, as the photograph's dots inside the black) is allowed; the liquid must have left the patch.
  const inPatch = new Set(spot);
  let rim = 0, rimCells = 0;
  for (let c = 0; c < f.h.length; c++) {
    if (f.ruptured[c] || inPatch.has(c)) continue;
    const near = [c - 1, c + 1, c - 32, c + 32].some((n) => n >= 0 && n < f.h.length && f.ruptured[n]);
    if (near) { rimCells++; if (f.h[c] > 300 + 1e-6) rim++; }
  }
  const left = spot.reduce((a, c) => a + f.h[c] - 8, 0) / (spot.length * 32);
  // Where the liquid went: with g = 0 nothing else moves, so what the patch lost must sit in the cells touching it
  // (99%), and every cell further out must still be 300 nm. A spot that spreads its liquid over the whole film fails.
  const touching = new Set();
  for (const c of spot) for (const n of [c - 1, c + 1, c - 32, c + 32]) if (n >= 0 && n < f.h.length && !inPatch.has(n)) touching.add(n);
  const patchLost = spot.reduce((a, c) => a + 40 - f.h[c], 0), rimGot = [...touching].reduce((a, c) => a + f.h[c] - 300, 0);
  let far = 0; for (let c = 0; c < f.h.length; c++) if (!inPatch.has(c) && !touching.has(c)) far = Math.max(far, Math.abs(f.h[c] - 300));
  const drift = Math.abs(sum(f.h) - s0) / s0;
  check('C9 a black spot keeps its liquid: the thin patch goes to 8 nm, its film goes to a rim, nothing is lost',
    black >= spot.length / 2 && rimCells > 0 && rim === rimCells && left < 0.5 && patchLost > 0 && rimGot >= 0.99 * patchLost && far < 1e-9 && drift < 1e-9,
    `${black} of ${spot.length} patch cells black, ${(100 * left).toFixed(0)}% of the patch's liquid still in it, the cells touching it hold ${(100 * rimGot / patchLost).toFixed(1)}% of what it lost, the film beyond moved ${far.toExponential(1)} nm, ${rim} of ${rimCells} film cells around it thicker than the film, total drift ${drift.toExponential(1)}`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
