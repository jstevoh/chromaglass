#!/usr/bin/env node
/**
 * A clear film that tears (PLAN.md §20b).
 *
 *   npm run lace      (the lab: any adapter that computes, so a cloud session too)
 *
 * What was asked: the owner's reference still of a pale lace with holes over
 * colour. The lace is a clear oil film against the glass, white under the
 * lamp, torn open by dewetting; the holes are where the dyed water spans the
 * gap. The film is a thickness field on a grid of its own (wgsl/film.ts),
 * evolved by the thin-film equation with a disjoining pressure, the dish's
 * dust and a solvent's Marangoni pull, and nothing in the code draws a hole.
 * So this asks what the physics does, never where a hole is:
 *
 *   1. the film's volume is kept: over 20 s of a stirred plate (the carry),
 *      and over a thin dusty film tearing open to its precursor (the holes
 *      sit on the molecular layer the disjoining pressure leaves, h_p = 0.06,
 *      and more than a hundred cells must be within half of it, under 0.09:
 *      that is where a scheme that floors h, as the prototype first did,
 *      makes film from nothing)
 *   2. a thick film on a clean dish, stirred, stays whole for 20 s: holes
 *      come from the physics, not from a clock. A film the same everywhere
 *      cannot tear at all, so it is given a bump (clear oil poured on it), and
 *      the bump is carried with the flow: it moves at least three cells, the
 *      way a dot of dye laid on it moves
 *   3. a drop of solvent on a clean dish opens one hole there, whose radius
 *      grows at every reading for ten seconds, to five cells and at least
 *      twice what it first read; the control is the same film with a dent
 *      (a twelfth of it) drawn off where the drop would land, and no
 *      solvent, which the film's own instability opens four seconds later at
 *      the soonest, if at all
 *   4. a thin film on the dusty dish tears by itself into at least twenty
 *      holes, none of them most of the torn area, whose diameters span at
 *      least tenfold (p10 to p99), as the prototype's and the still's do; the
 *      control is the same film on a clean dish with one small bump in it,
 *      which tears in a handful of places at most, so the dust seeded it
 *   5. after the lace has formed, the film keeps breaking: over three or more
 *      readings a second apart, its pieces (eight-connected, two cells or
 *      more) rise by half again (ligaments bead into rows of drops)
 *   6. drawn on the lamp ground, a thick film torn by solvent throws the
 *      lamp's white over three dense pools: at least a tenth of the pixels
 *      over whole film are near white, where the same pixels with no film are
 *      not, and five times as many over the plate as without the film. On the
 *      black ground (today's, the control) almost none are, and the colour
 *      under the film is darker than without it. And the colour comes through
 *      the holes: read against the plate with no film, a hole is a third as
 *      far from it as the whole film is, or less; read at the mirrored rows
 *      (the control for the picture's orientation) it is not
 *   7. Clear Film at 0 is the plate as it was: rendered byte for byte the
 *      same as a plate whose film was laid and taken off again, where the
 *      same plate with its film on differs (the positive control). Both are
 *      this code: the one thing it changes for every plate, the view's word
 *      shared with BZ's activator, is answered in packView's comment
 *
 * The lab's plate is 128² (the film's grid then 128², the prototype's numbers
 * in its cells), on a thin gap as every look is: the film's substeps are most
 * of a step on SwiftShader, about fifteen minutes in all here.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 128;
const BASE = { thinGap: 1 };

/** Connected patches of cells where `inside` holds (4- or 8-neighbour, walls): their cells. */
function patches(n, inside, eight = false) {
  const lab = new Int32Array(n * n);
  const out = [];
  const near = eight ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let next = 1;
  for (let k = 0; k < n * n; k++) {
    if (!inside(k) || lab[k]) continue;
    const stack = [k], cells = [];
    lab[k] = next;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      const x = c % n, y = (c - x) / n;
      for (const [dx, dy] of near) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const d = xx + yy * n;
        if (!lab[d] && inside(d)) { lab[d] = next; stack.push(d); }
      }
    }
    out.push(cells);
    next++;
  }
  return out;
}
const pct = (a, q) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};
const sum = (a) => a.reduce((t, v) => t + v, 0);
const centroid = (n, w) => {
  let t = 0, x = 0, y = 0;
  for (let k = 0; k < w.length; k++) { t += w[k]; x += w[k] * (k % n); y += w[k] * Math.floor(k / n); }
  return [x / t, y / t];
};

const { page, close } = await openLab();
try {
  const FILM_MAX = await page.evaluate(() => lab.filmMax);
  const fresh = async () => { await page.evaluate((n) => lab.create(n), N); };
  /*
    A stir that lasts: a slow swirl kicked in again every two seconds, as a
    performer's hand or the band would, round the plate's middle and one
    corner, so the film is carried and sheared the whole time.
  */
  const stir = async () => {
    await page.evaluate(() => {
      lab.vel(0.4, 0.45, 0.3, [0.25, -0.15, 0, 0]);
      lab.vel(0.65, 0.6, 0.25, [-0.2, 0.2, 0, 0]);
      lab.flush();
    });
  };
  const steps = async (seconds, over, stirred) => {
    for (let s = 0; s < seconds; s += 2) {
      if (stirred) await stir();
      await page.evaluate(([n, o]) => lab.step(n, o), [Math.round(Math.min(2, seconds - s) * 60), over]);
    }
  };
  const film = () => page.evaluate(() => lab.film());
  // The dye's amount, read back on the lab's logical grid (L², not N²), and
  // its middle in the film's cells.
  const dyeMiddle = async () => {
    const d = (await page.evaluate(() => lab.field('dye'))).filter((_, k) => k % 4 === 3);
    const L = Math.round(Math.sqrt(d.length));
    const [x, y] = centroid(L, d);
    return [((x + 0.5) * N) / L - 0.5, ((y + 0.5) * N) / L - 0.5];
  };

  // 1 and 2: a thick film on a clean dish with a bump and a dot of dye on the bump, stirred for twenty seconds.
  await fresh();
  const thick = { ...BASE, clearFilm: 0.8 / FILM_MAX, filmDust: 0 };
  await page.evaluate(() => { lab.dye(0.3, 0.5, 0.05, [1, 1, 1], 1); lab.flush(); });
  await page.evaluate((o) => lab.step(1, o), thick);
  await page.evaluate(() => lab.addFilm(0.3, 0.5, 0.08, 0.1, 0));
  const f0 = await film();
  const level = pct(f0.h, 0.5);
  const bump = (f) => centroid(f.n, f.h.map((v) => Math.max(0, v - level - 0.01)));
  const b0 = bump(f0), d0 = await dyeMiddle();
  await steps(20, thick, true);
  const f1 = await film();
  const b1 = bump(f1), d1 = await dyeMiddle();
  const v0 = sum(f0.h), v1 = sum(f1.h);
  const drift = Math.abs(v1 - v0) / v0;
  const minThick = Math.min(...f1.h);
  const bm = [b1[0] - b0[0], b1[1] - b0[1]], dm = [d1[0] - d0[0], d1[1] - d0[1]];
  const moved = Math.hypot(...bm), dyeMoved = Math.hypot(...dm);
  const along = (bm[0] * dm[0] + bm[1] * dm[1]) / Math.max(1e-9, moved * dyeMoved);
  check('2. a thick film on a clean dish stays whole for 20 s, and its bump is carried as the dye is', minThick > 0.4 && moved > 3 && along > 0.8,
    `thinnest ${minThick.toFixed(3)} (torn is under 0.2); the bump moved ${moved.toFixed(1)} cells, the dye ${dyeMoved.toFixed(1)}, in directions ${(Math.acos(Math.min(1, along)) * 180 / Math.PI).toFixed(0)}° apart`);

  // 3: a drop of solvent on a clean dish, and a dent with no solvent in the same place.
  const mid = { ...BASE, clearFilm: 0.6 / FILM_MAX, filmDust: 0 };
  const holesOf = (f, h0) => patches(f.n, (k) => f.h[k] < 0.5 * h0);
  await fresh();
  await page.evaluate((o) => lab.step(1, o), mid);
  await page.evaluate(() => lab.addFilm(0.5, 0.5, 0.04, 0, 1));
  const radii = [];
  let last = [];
  for (let k = 0; k < 6; k++) {
    await page.evaluate((o) => lab.step(120, o), mid);
    last = holesOf(await film(), 0.6);
    radii.push(Math.sqrt(sum(last.map((c) => c.length)) / Math.PI));
  }
  const at = last.length === 1 ? centroid(N, Array.from({ length: N * N }, (_, k) => (last[0].includes(k) ? 1 : 0))) : [-99, -99];
  const there = Math.hypot(at[0] - N / 2 + 0.5, at[1] - N / 2 + 0.5) < 3;
  const first = radii.findIndex((r) => r > 0);
  const growing = first >= 0 && first <= 1 && radii.slice(first).every((r, k, a) => k === 0 || r > a[k - 1]);
  await fresh();
  await page.evaluate((o) => lab.step(1, o), mid);
  await page.evaluate(() => lab.addFilm(0.5, 0.5, 0.04, -0.05, 0));
  /*
    A dent is a disturbance this film is unstable to (every film thicker than
    1.5 h_p is), so given long enough it tears there too: what the solvent
    adds is the Marangoni pull, which opens the hole at once. So the control
    is when: the dent's first hole comes at least four seconds after the
    drop's, or not in the twelve. The dent is a twelfth of the film (0.05 of
    0.6), a pour's ripple; how soon it tears goes with its depth, measured in
    the lab: a 0.03 dent tears at 10 s, 0.05 at 8 s, 0.1 at 4 s (the first
    tried, which is a sixth of the film), against the drop's 2 s.
  */
  let dentFirst = -1;
  for (let k = 0; k < 6 && dentFirst < 0; k++) {
    await page.evaluate((o) => lab.step(120, o), mid);
    if (holesOf(await film(), 0.6).length) dentFirst = k;
  }
  const later = dentFirst < 0 || dentFirst >= first + 2;
  check('3. a drop of solvent opens one hole there that grows steadily; a dent with no solvent opens one later, if at all',
    growing && there && radii[5] >= 5 && radii[5] >= 2 * radii[first] && later,
    `radius every 2 s ${radii.map((r) => r.toFixed(1)).join(', ')} cells, ${last.length} hole${last.length === 1 ? '' : 's'}${there ? ' at the drop' : ''}; the dent's first hole ${dentFirst < 0 ? 'not in 12 s' : `at ${2 * (dentFirst + 1)} s`}`);

  // 4 and 5: a thin film on the dusty dish; 1 again with the limiter working.
  const thin = { ...BASE, clearFilm: 0.35 / FILM_MAX, filmDust: 1 };
  await fresh();
  await page.evaluate((o) => lab.step(1, o), thin);
  const t0 = await film();
  const holesAt = async () => {
    const f = await film();
    const holes = patches(f.n, (k) => f.h[k] < 0.2).map((c) => c.length);
    const pieces = patches(f.n, (k) => f.h[k] >= 0.2, true).filter((c) => c.length >= 2).length;
    const torn = f.h.filter((v) => v < 0.2).length / f.h.length;
    return { f, holes, pieces, torn };
  };
  let lace = null;
  const pieces = [];
  let tEnd = null;
  for (let k = 0; k < 8; k++) {
    await page.evaluate((o) => lab.step(60, o), thin);
    const r = await holesAt();
    pieces.push(r.pieces);
    tEnd = r.f;
    if (!lace && r.torn > 0.15) lace = { at: k + 1, ...r };
  }
  const tDrift = Math.abs(sum(tEnd.h) - sum(t0.h)) / sum(t0.h);
  const floorCells = tEnd.h.filter((v) => v < 0.09).length;
  const thinnest = tEnd.h.reduce((a, v) => Math.min(a, v), Infinity);
  check('1. the film\'s volume is kept: over 20 s of a stirred plate, and over a dusty film tearing to its precursor',
    drift < 1e-3 && tDrift < 1e-4 && floorCells > 100,
    `stirred ${(drift * 100).toFixed(4)}%; tearing ${(tDrift * 100).toFixed(5)}% with ${floorCells} cells under 0.09, the thinnest ${thinnest.toFixed(3)}`);
  if (lace) {
    const d = lace.holes.map((a) => 2 * Math.sqrt(a / Math.PI));
    const p10 = pct(d, 0.1), p99 = pct(d, 0.99);
    const biggest = Math.max(...lace.holes) / sum(lace.holes);
    // The control: a clean dish, the same film, one small bump, as long.
    await fresh();
    await page.evaluate((o) => lab.step(1, o), { ...thin, filmDust: 0 });
    await page.evaluate(() => lab.addFilm(0.5, 0.5, 0.04, 0.05, 0));
    await page.evaluate(([o, n]) => lab.step(n, o), [{ ...thin, filmDust: 0 }, lace.at * 60]);
    const clean = (await holesAt()).holes.length;
    check('4. a thin film on a dusty dish tears into many holes spanning tenfold; on a clean dish (the control) in a few at most',
      lace.holes.length >= 20 && biggest < 0.25 && p99 >= 10 * p10 && clean <= 5,
      `${lace.holes.length} holes at ${lace.at} s, ${(lace.torn * 100).toFixed(0)}% torn, the largest ${(biggest * 100).toFixed(0)}% of it; diameters p10 ${p10.toFixed(1)}, p50 ${pct(d, 0.5).toFixed(1)}, p99 ${p99.toFixed(1)} cells; clean dish ${clean} holes`);
    const later = pieces.slice(lace.at - 1);
    check('5. after the lace forms, the film keeps breaking into more pieces', later.length >= 3 && later[later.length - 1] >= 1.5 * later[0],
      `pieces a second apart from ${lace.at} s: ${later.join(', ')}`);
  } else {
    check('4. a thin film on a dusty dish tears into many holes spanning tenfold; on a clean dish (the control) in a few at most', false, `under 15% torn after 8 s (pieces ${pieces.join(', ')})`);
    check('5. after the lace forms, the film keeps breaking into more pieces', false, 'no lace formed');
  }

  /*
    6: a thick film (the prototype's plateau, Clear Film 1) over three dense
    pools, opened by three drops of solvent and the dust, drawn on the lamp
    and on black, with the film and without it (taken off for one step: the
    film moves nothing, so the dye is where it was, a step on).
  */
  const SIZE = 192;
  const render = (over) => page.evaluate(([s, o]) => lab.render(s, o), [SIZE, over]);
  const neutral = { saturationBoost: 1, granulation: 0, boundaryContrast: 0, edgeRelief: 0, beads: 0, lacing: 0, cells: 0, glossiness: 0, microDroplets: 0, thinFilm: 0 };
  const full = { ...BASE, clearFilm: 1, filmDust: 1 };
  await fresh();
  await page.evaluate(() => {
    lab.dye(0.3, 0.35, 0.35, [0.2, 1.4, 2.6], 1.2);
    lab.dye(0.7, 0.4, 0.35, [0.3, 2.6, 1.2], 1.2);
    lab.dye(0.5, 0.75, 0.4, [2.4, 2.0, 0.2], 1.2);
    lab.flush();
  });
  await page.evaluate((o) => lab.step(1, o), full);
  await page.evaluate(() => { lab.addFilm(0.32, 0.38, 0.05, 0, 1); lab.addFilm(0.68, 0.42, 0.05, 0, 1); lab.addFilm(0.5, 0.72, 0.05, 0, 1); });
  await page.evaluate((o) => lab.step(240, o), full);
  const lampWith = await render({ ...neutral, lampGround: 1 });
  const blackWith = await render({ ...neutral, lampGround: 0 });
  const tornF = await film();
  await page.evaluate((o) => lab.step(1, o), { ...BASE, clearFilm: 0 });
  const lampWithout = await render({ ...neutral, lampGround: 1 });
  const blackWithout = await render({ ...neutral, lampGround: 0 });
  const isWhite = (px, k) => px[k] + px[k + 1] + px[k + 2] > 3 * 0.75 * 255;
  const white = (px) => {
    let n = 0;
    for (let k = 0; k < px.length; k += 4) if (isWhite(px, k)) n++;
    return n / (px.length / 4);
  };
  const wL = white(lampWith), wL0 = white(lampWithout), wB = white(blackWith), wB0 = white(blackWithout);
  /*
    Film cells whose four neighbours are in [lo, hi), read at the cell's
    middle so a hole's soft edge is not what is read. The lab draws the
    plate 1.5 times the frame across, about its middle, with the plate's v
    running up the picture (as domes.mjs and spikes.mjs read it), so a cell
    at (u, v) is the pixel (0.5 + 1.5 (u - 0.5), 0.5 - 1.5 (v - 0.5)) of
    the frame, and cells outside the frame are not read. `mirror` reads the
    rows the other way, the control that the holes are found where the
    picture has them (reading cell for pixel, with neither the scale nor
    the flip, the three holes landed on lace and the check failed).
  */
  const cellsIn = (lo, hi, mirror) => {
    const out = [];
    for (let y = 0; y < tornF.n; y++) for (let x = 0; x < tornF.n; x++) {
      let inside = true;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = Math.min(tornF.n - 1, Math.max(0, x + dx)), yy = Math.min(tornF.n - 1, Math.max(0, y + dy));
        const h = tornF.h[xx + yy * tornF.n];
        if (h < lo || h >= hi) inside = false;
      }
      if (!inside) continue;
      const u = (x + 0.5) / tornF.n - 0.5, v = (y + 0.5) / tornF.n - 0.5;
      const px = Math.floor((0.5 + 1.5 * u) * SIZE), row = Math.floor((0.5 + (mirror ? 1.5 : -1.5) * v) * SIZE);
      if (px < 0 || row < 0 || px >= SIZE || row >= SIZE) continue;
      out.push((px + row * SIZE) * 4);
    }
    return out;
  };
  const far = (ks) => {
    let diff = 0;
    for (const k of ks) for (let c = 0; c < 3; c++) diff += Math.abs(lampWith[k + c] - lampWithout[k + c]);
    return ks.length ? diff / (3 * ks.length) : Infinity;
  };
  const holes6 = cellsIn(0, 0.12, false), whole6 = cellsIn(0.7, 2, false);
  const holesM = cellsIn(0, 0.12, true), wholeM = cellsIn(0.7, 2, true);
  const overFilm = whole6.filter((k) => !isWhite(lampWithout, k));
  const whiteOverFilm = overFilm.filter((k) => isWhite(lampWith, k)).length / Math.max(1, overFilm.length);
  const lum = (px, ks) => sum(ks.map((k) => px[k] + px[k + 1] + px[k + 2])) / Math.max(1, ks.length);
  const darker = lum(blackWith, whole6) < lum(blackWithout, whole6);
  const through = far(holes6) < far(whole6) / 3, mirrored = far(holesM) < far(wholeM) / 3;
  check('6. on the lamp the torn film throws white over the colour, not on black (the control), and the colour comes through its holes',
    whiteOverFilm > 0.1 && wL > 5 * wL0 && wB < 0.02 && darker && holes6.length > 30 && through && !mirrored,
    `near white over whole film ${(whiteOverFilm * 100).toFixed(0)}%; over the plate: lamp ${(wL * 100).toFixed(1)}% with the film, ${(wL0 * 100).toFixed(1)}% without, black ${(wB * 100).toFixed(1)}% and ${(wB0 * 100).toFixed(1)}%; on black under the film ${darker ? 'darker' : 'NOT darker'}; from the plate with no film, ${far(holes6).toFixed(1)} levels in ${holes6.length} hole pixels, ${far(whole6).toFixed(1)} under whole film; mirrored ${far(holesM).toFixed(1)} and ${far(wholeM).toFixed(1)}`);

  // 7: Clear Film at 0, and a plate whose film was laid and taken off, are the same picture; with it on they are not.
  await fresh();
  await page.evaluate(() => { lab.dye(0.5, 0.5, 0.4, [0.3, 1.8, 2.4], 1.2); lab.flush(); });
  await page.evaluate((o) => lab.step(30, o), BASE);
  const never = await render({ lampGround: 1 });
  await fresh();
  await page.evaluate(() => { lab.dye(0.5, 0.5, 0.4, [0.3, 1.8, 2.4], 1.2); lab.flush(); });
  await page.evaluate((o) => lab.step(15, o), { ...BASE, clearFilm: 0.5 });
  await page.evaluate((o) => lab.step(14, o), { ...BASE, clearFilm: 0.5 });
  const withFilm = await render({ lampGround: 1 });
  await page.evaluate((o) => lab.step(1, o), BASE);
  const offAgain = await render({ lampGround: 1 });
  let same = 0, on = 0;
  for (let k = 0; k < never.length; k++) { if (never[k] === offAgain[k]) same++; if (never[k] !== withFilm[k]) on++; }
  check('7. with Clear Film at 0 the picture is the plate\'s, byte for byte; with the film on it is not',
    same === never.length && on > 0.01 * never.length,
    `${never.length - same} of ${never.length} bytes differ off; ${on} with the film on`);
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} lace checks passed`);
process.exit(failed.length ? 1 : 0);
