#!/usr/bin/env node
/**
 * The lamp's light traced through the liquid to the wall (PLAN 31s-2).
 *
 *   npm run caustics
 *   npm run caustics -- --first-order   (control: the old law, which cannot fold or gather light, fails 3, 4, 7, 8 and 6)
 *
 * The trace (src/gpu/caustic.ts) is handed a path you know (the derive pass's
 * .w, OPL less 1.333 in rest gaps of DISH_GAP_METRES) through the lab's
 * `caustics` hook, which runs the plate's own PlateCaustics and reads back the
 * light the display reads. Every trace's shape (m, its texels, the header's
 * dz) is checked before a line reads it. Then against the optics:
 *
 *   1. A flat path lights the wall evenly: every texel within 1% of the lamp.
 *   2. Light is kept: a dome of path in the middle moves light, and the
 *      wall's total is within 1% of the plate's.
 *   3. A plano-convex lens of radius of curvature Rc and index step dn
 *      (oil in water, 0.137) brings its light to a point at f = Rc / dn: over
 *      a sweep of dz, the centre's light peaks within 10% of f, and at f,
 *      where it lands whole triangles between texels, its light is all
 *      still on the wall (within 1%).
 *   4. Past focus the map folds: a ridge whose curvature falls off outward,
 *      as a drop's edge does, throws lines of light where the fold predicts
 *      (0.40 of its width at c = 2, within 0.04), brighter than the band
 *      inside and the dark outside.
 *   5. Nothing is drawn twice: three domes of 1, 2 and 4 cells (the widths
 *      the flower ghosted, PLAN 15g-15, 31s-8) light three peaks, one on
 *      each dome (within a texel and a half), no more.
 *   7. A rippled layer A sin(kx) (PLAN 47j) lights the wall by the exact
 *      law I = 1/|1 - c sin kx|, c = z k^2 A, within 6%; its rays first
 *      cross (one bright line a period becomes two) between c 0.9 and 2,
 *      as that law has them at 1, the pair standing where the law draws
 *      it (within a texel); its light is kept within 2%.
 *   8. The back plate: two layers traced at once land each in its own half
 *      of the buffer, the lens as layer 1 lighting as it does alone.
 *   9. The derive pass writes an oil layer's height h (31s-1) as path in
 *      the units lines 1 to 8 hand the trace: dn h / DISH_GAP_METRES, within
 *      5% (with the h term gone from surfacePath it reads 0 and fails).
 *   6. The display reads it: the lab plate with dyed water and oil drops
 *      at Focus 0.8, drawn with the trace and again with it taken out (the
 *      first-order fallback), differs by 8+ levels over 1% of the plate
 *      (a header the display refused, or binding 27 left blank, draws the
 *      fallback both times), and at Focus 0.5 nothing is traced.
 *
 * The lamp's disc (LAMP_HALF_ANGLE) is a choice of lamp, not a law: lines 7's
 * target draws through the same disc, so a wrong angle is not caught here
 * (docs/judging.md §153 asks it of the owner's eyes).
 */
import { openLab } from './lab.mjs';

const firstOrder = process.argv.includes('--first-order');
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// The constants the trace is built on (src/gpu/wgsl/caustic.ts, src/lib/turntable.ts).
const PLATE = 0.2;
const GAP = 0.002;
const DEFOCUS = 0.183;
const DN = 0.137;
const SIZE = 512; // the derive pass's texture; the trace's m is half (256)
/** Line 7: at c = 2 the fold pair of a period lands (2 sqrt 3 - 2 pi / 3) / k apart, k a period of 64 texels: 13.96 texels. */
const FOLD_PAIR = (2 * Math.sqrt(3) - 2 * Math.PI / 3) * 64 / (2 * Math.PI);

const { page, close } = await openLab();
try {
  await page.evaluate(async () => { await lab.create(64); });
  /*
    Run a path through the trace. With --first-order, the same path's light
    by the old law, 1 - dz lap(OPL) (the shadowgraph's first order, read off
    the texture the trace reads), as a control: it cannot fold or gather
    light into a point, so lines 3 and 4 must fail on it.
  */
  /*
    Every trace is checked for its shape before a line reads it: an empty or
    short light (m 0, or NaN) would make line 1's worst texel -Infinity and
    pass, and a header whose dz is not the one asked is a trace the display
    would not read (wgsl/caustic.ts, tracedLight).
  */
  const trace = async (paths, dz, back) => {
    const r = await rawTrace(paths, dz, back);
    const f32 = new Float32Array([dz])[0];
    if (!r || r.m !== SIZE / 2 || r.light.length !== r.m * r.m || r.dz !== f32 || r.light.some((v) => !Number.isFinite(v))) {
      throw new Error(`the trace came back malformed: m ${r?.m}, ${r?.light?.length} texels, dz ${r?.dz} for ${f32}`);
    }
    return r;
  };
  const rawTrace = (paths, dz, back) => page.evaluate(async ({ paths, size, dz, firstOrder, k, back }) => {
    if (!firstOrder) return lab.caustics(paths, size, dz, back ?? undefined);
    const m = size / 2;
    const at = (i, j) => {
      let s = 0;
      for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
        const x = Math.min(size - 1, Math.max(0, 2 * i + a)), y = Math.min(size - 1, Math.max(0, 2 * j + b));
        s += paths[y * size + x];
      }
      return s / 4;
    };
    const light = [];
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      const lap = (at(i + 1, j) + at(i - 1, j) + at(i, j + 1) + at(i, j - 1) - 4 * at(i, j)) * m * m;
      light.push(Math.max(0, 1 - dz * k * lap));
    }
    return { dz: new Float32Array([dz])[0], m, light, light1: back ? light.map(() => 1) : null };
  }, { paths, size: SIZE, dz, firstOrder, k: DEFOCUS * GAP / (PLATE * PLATE), back: back ?? null });

  const field = (f) => {
    const out = new Array(SIZE * SIZE);
    for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) out[j * SIZE + i] = f((i + 0.5) / SIZE, (j + 0.5) / SIZE);
    return out;
  };
  const centreOf = (r, cx, cy, rad) => {
    let s = 0, n = 0;
    for (let j = 0; j < r.m; j++) for (let i = 0; i < r.m; i++) {
      const dx = (i + 0.5) / r.m - cx, dy = (j + 0.5) / r.m - cy;
      if (dx * dx + dy * dy <= rad * rad) { s += r.light[j * r.m + i]; n++; }
    }
    if (!n) throw new Error(`centreOf: no texel within ${rad} of ${cx}, ${cy}`);
    return s / n;
  };

  // 1. A flat path.
  {
    const r = await trace(field(() => 0.08), 0.5);
    const worst = r ? Math.max(...r.light.map((v) => Math.abs(v - 1))) : Infinity;
    check('a flat path lights the wall evenly (every texel within 1%)', r && worst <= 0.01, `worst ${(worst * 100).toFixed(3)}% over ${r?.m}x${r?.m}`);
  }

  // 2. Light kept, a dome of path 4% of the plate wide moving light by several cells.
  {
    const s = 0.04;
    const amp = 0.4;
    const r = await trace(field((x, y) => amp * Math.exp(-((x - 0.5) ** 2 + (y - 0.5) ** 2) / (2 * s * s))), 0.4);
    const total = r.light.reduce((a, b) => a + b, 0) / (r.m * r.m);
    const moved = Math.max(...r.light) - 1;
    check('light is kept: the wall\'s total within 1% of the plate\'s, with light moved', Math.abs(total - 1) <= 0.01 && moved > 0.2,
      `total ${total.toFixed(5)}, brightest ${(1 + moved).toFixed(3)}`);
  }

  // 3. A plano-convex lens: OPL = dn * (sag at the edge - r^2 / (2 Rc)) inside the aperture a.
  const a = 0.03; // plate widths (6 mm)
  const fMetres = 0.05;
  const Rc = fMetres * DN; // 6.85 mm
  const lens = field((x, y) => {
    const r2 = ((x - 0.5) ** 2 + (y - 0.5) ** 2) * PLATE * PLATE;
    const aM = a * PLATE;
    const sag = (aM * aM - Math.min(r2, aM * aM)) / (2 * Rc);
    return DN * sag / GAP;
  });
  const fDial = fMetres / DEFOCUS;
  {
    let best = -1, bestDz = 0, keptAtF = 0;
    const rows = [];
    for (let k = 0.5; k <= 1.5001; k += 0.05) {
      const r = await trace(lens, fDial * k);
      const c = centreOf(r, 0.5, 0.5, 1.5 / r.m);
      rows.push(`${k.toFixed(2)}:${c.toFixed(1)}`);
      // At its focus the lens lands whole triangles between texel centres: the light must still all arrive.
      if (Math.abs(k - 1) < 0.001) keptAtF = r.light.reduce((x, y) => x + y, 0) / (r.m * r.m);
      if (c > best) { best = c; bestDz = k; }
    }
    const far = await trace(lens, -fDial);
    const diverge = centreOf(far, 0.5, 0.5, 1.5 / far.m);
    check(`a plano-convex lens (Rc ${(Rc * 1000).toFixed(2)} mm, dn ${DN}) focuses at Rc/dn = ${(fMetres * 1000).toFixed(0)} mm within 10%`,
      Math.abs(bestDz - 1) <= 0.1 && best > 4 && diverge < 1 && Math.abs(keptAtF - 1) <= 0.01,
      `peak at ${(bestDz * fMetres * 1000).toFixed(1)} mm, centre ${best.toFixed(1)}x the lamp; at -f ${diverge.toFixed(3)}x; light kept at f ${keptAtF.toFixed(4)}; sweep ${rows.join(' ')}`);
  }

  /*
    4. Past focus the map folds. A parabolic lens past its focus only turns
    its light over (every ray crosses at one point), so the fold is drawn
    with a ridge whose curvature falls off outward, as a drop's edge does:
    OPL = A exp(-x^2 / 2 s^2), a long drop seen across. Each ray lands at
    x (1 - c exp(-x^2 / 2 s^2)), c = k A / s^2; at c = 2 the map folds back
    where its slope is 0, x = 0.62 s, and those rays land on two lines at
    +-0.40 s: lines of light (caustics, singular before the lamp's disc
    spreads them), with three sheets of the map lighting the band between
    and none past them. A ridge and not a round dome: a round one also
    crosses every ray from one circle on its axis (the axial caustic),
    whose point outshines the ring and says nothing of the fold. A fold is
    bright on its inner side (as 1/sqrt of the distance), so the lamp's
    disc (sigma about 0.05 s here) draws its peak a little inside 0.40 s.
  */
  {
    const s = 0.1;
    const dz = 0.5;
    const k = dz * DEFOCUS * GAP / (PLATE * PLATE);
    const A = 2 * s * s / k;
    const r = await trace(field((x) => A * Math.exp(-((x - 0.5) ** 2) / (2 * s * s))), dz);
    const around = (q) => {
      let sum = 0;
      for (let t = 0; t < 32; t++) sum += centreOf(r, 0.5 + q * s, 0.3 + 0.4 * t / 32, 0.75 / r.m) + centreOf(r, 0.5 - q * s, 0.3 + 0.4 * t / 32, 0.75 / r.m);
      return sum / 64;
    };
    let ring = 0, at = 0, dip = Infinity;
    for (let q = 0.1; q <= 0.7001; q += 0.02) { const v = around(q); if (v > ring) { ring = v; at = q; } }
    for (let q = 0.12; q <= 0.3001; q += 0.02) dip = Math.min(dip, around(q));
    const outside = around(0.6);
    check('past its focus a ridge folds its light into lines at 0.40 of its width, brighter than inside and out', ring > 1.3 * dip && ring > 1.3 * outside && Math.abs(at - 0.4) <= 0.04,
      `lines ${ring.toFixed(2)}x the lamp at ${at.toFixed(2)} s, dip inside ${dip.toFixed(2)}x, outside ${outside.toFixed(2)}x`);
  }

  // 5. Three domes, 1, 2 and 4 cells (of the trace's 256) wide: three peaks.
  {
    const cell = 1 / 256;
    const at = (i) => (i + 0.5) / 256; // on texel centres, so a dome's top is one texel, not four equal ones
    const domes = [[at(77), at(128), 1], [at(128), at(128), 2], [at(179), at(128), 4]];
    const r = await trace(field((x, y) => {
      let v = 0;
      for (const [cx, cy, w] of domes) v += 0.004 * w * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * (w * cell) ** 2));
      return v;
    }), 0.3);
    const m = r.m, L = r.light;
    const peaks = [];
    for (let j = 1; j < m - 1; j++) for (let i = 1; i < m - 1; i++) {
      const v = L[j * m + i];
      if (v < 1.02) continue;
      let top = true;
      for (let b = -1; b <= 1 && top; b++) for (let c = -1; c <= 1; c++) {
        if ((b || c) && L[(j + b) * m + i + c] >= v) { top = false; break; }
      }
      if (top) peaks.push({ x: (i + 0.5) / m, y: (j + 0.5) / m, v });
    }
    // One peak on each dome (within a texel and a half), and none anywhere else.
    const onEach = domes.every(([cx, cy]) => peaks.filter((p) => Math.hypot(p.x - cx, p.y - cy) * m <= 1.5).length === 1);
    check('three domes of 1, 2 and 4 cells light three peaks, one on each, none drawn twice', peaks.length === 3 && onEach,
      `${peaks.length} peaks: ${peaks.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}:${p.v.toFixed(2)}`).join(' ')}; one on each dome ${onEach}`);
  }

  /*
    7. A rippled layer, OPL = A sin(k x) (PLAN 47j), two periods of 64 texels
    in the plate's middle and flat round them (so no light is thrown off the
    plate's edge). Its map's slope is 1 - c sin(k x), c = z k^2 A, so its
    light is I = 1 / |1 - c sin(k x)| summed over the sheets landing on a
    point, and its rays first cross, piling into caustic lines, at c = 1,
    z = 1 / (k^2 A). Measured: (a) at c = 0.5 and 0.8 the light across the
    middle period follows that law column by column within 6% (solved here
    by Newton from the same map, then drawn through the lamp's disc and the
    splat's tent as the trace draws it: c = 0.8's peak, 4.5x the lamp from 3
    a texel away, is rounded to 3.9 by them, and its light spills a tenth
    onto the columns beside it). Not 1%: a ripple parallel to the grid is a
    mesh's worst case, its gathered triangles slivers lying along the
    texel columns, and where they are shared between drawn and splatted
    (gain 1 to 2, wgsl/caustic.ts) the drawn half samples them in step with
    the columns, up to 5.3% either side of the peak at c = 0.5 (a round
    drop's are not in step with anything: lines 3 to 5); (b) at c = 0.9 a period has one bright line,
    at c = 2 two (the fold pair born at c = 1, fourteen texels apart by
    then; at 1.5 they are five apart and the three sheets between them
    light a plateau); (c) the light is kept within 2% at all of them.
  */
  {
    const tex = 64 / 256;
    const kx = 2 * Math.PI / tex;
    const kUnit = DEFOCUS * GAP / (PLATE * PLATE);
    const zStar = 0.5;
    const A = 1 / (kx * kx * kUnit * zStar);
    const ripple = field((x) => (x > 0.25 && x < 0.75 ? A * Math.sin(kx * x) : 0));
    const columns = (r) => {
      const col = new Array(r.m).fill(0);
      for (let j = 0; j < r.m; j++) for (let i = 0; i < r.m; i++) col[i] += r.light[j * r.m + i] / r.m;
      return col;
    };
    const exact = (c, xp) => {
      let x = xp;
      for (let it = 0; it < 60; it++) x -= (x + (c / kx) * Math.cos(kx * x) - xp) / (1 - c * Math.sin(kx * x));
      return 1 / (1 - c * Math.sin(kx * x));
    };
    let worstLaw = 0, worstKept = 0, gaps = [], lawGaps = [];
    const lines = {};
    for (const c of [0.5, 0.8, 0.9, 2]) {
      const r = await trace(ripple, zStar * c);
      const col = columns(r);
      worstKept = Math.max(worstKept, Math.abs(col.reduce((a, b) => a + b, 0) / r.m - 1));
      const sub = 10;
      const sigma = Math.max(0.5, Math.abs(zStar * c * DEFOCUS) * 0.02 / (PLATE / r.m) / 2);
      const a0 = Math.round(0.3 * r.m), a1 = Math.round(0.7 * r.m);
      const kern = [];
      const reach = Math.ceil((3 * sigma + 1) * sub);
      let ks = 0;
      for (let d = -reach; d <= reach; d++) {
        // Gaussian of sigma convolved with a tent of half-width 1, numerically.
        let v = 0;
        for (let e = -sub; e <= sub; e++) v += (1 - Math.abs(e) / sub) * Math.exp(-0.5 * ((d - e) / sub / sigma) ** 2);
        kern.push(v); ks += v;
      }
      const drawn = (fine, i) => {
        const at = (i - a0) * sub + sub / 2;
        let want = 0;
        for (let d = -reach; d <= reach; d++) want += kern[d + reach] * fine[Math.min(fine.length - 1, Math.max(0, at + d))];
        return want / ks;
      };
      if (c <= 0.8) {
        /*
          The law as the wall is drawn: point by point at a tenth of a texel,
          then through what the trace draws it with, the lamp's disc (its
          Gaussian, the same sigma as caustic.ts) and the splat's tent (a
          texel each side: where c = 0.8 peaks every triangle is splatted).
        */
        const fine = [];
        for (let q = a0 * sub; q < a1 * sub; q++) fine.push(exact(c, (q + 0.5) / sub / r.m));
        for (let i = Math.round(0.375 * r.m); i < Math.round(0.625 * r.m); i++) worstLaw = Math.max(worstLaw, Math.abs(col[i] / drawn(fine, i) - 1));
      }
      const at = [];
      for (let i = Math.round(0.375 * r.m); i < Math.round(0.625 * r.m); i++) if (col[i] > 1.5 && col[i] > col[i - 1] && col[i] >= col[i + 1]) at.push(i);
      lines[c] = at.length;
      /*
        The fold pair at c 2: where the map's slope 1 - 2 sin(kx) is 0 the
        rays land on two lines FOLD_PAIR (14) texels apart a period. Each
        fold is bright on its inner side, so the lamp's disc (sigma 2.3
        texels at this throw) draws the pair's peaks closer: where they
        are drawn is read off the law itself, every sheet landed (rays cast
        at a twentieth of a fine bin and binned where they land), drawn
        through the same disc and tent as above, and the trace's pair must
        stand within a texel of it.
      */
      if (c === 2) {
        gaps = at.slice(1).map((v, i) => v - at[i]);
        const fine = new Array((a1 - a0) * sub).fill(0), S = 20;
        for (let q = (a0 - 32) * sub * S; q < (a1 + 32) * sub * S; q++) {
          const x = (q + 0.5) / (sub * S * r.m);
          const X = x + (x > 0.25 && x < 0.75 ? (c / kx) * Math.cos(kx * x) : 0);
          const b = Math.floor((X * r.m - a0) * sub);
          if (b >= 0 && b < fine.length) fine[b] += 1 / S;
        }
        const law = [];
        for (let i = 0; i < r.m; i++) law.push(i >= a0 && i < a1 ? drawn(fine, i) : 0);
        const lawAt = [];
        for (let i = Math.round(0.375 * r.m); i < Math.round(0.625 * r.m); i++) if (law[i] > 1.5 && law[i] > law[i - 1] && law[i] >= law[i + 1]) lawAt.push(i);
        lawGaps = lawAt.slice(1).map((v, i) => v - lawAt[i]);
      }
    }
    check('a rippled layer follows I = 1/|1 - c sin kx| within 6%, first folds between c 0.9 and 2 (the pair where the law draws it, within a texel), its light kept within 2%',
      worstLaw <= 0.06 && lines[0.9] === 1 && lines[2] === 2 && gaps.length === 1 && lawGaps.length === 1 && Math.abs(gaps[0] - lawGaps[0]) <= 1 && worstKept <= 0.02,
      `worst against the law ${(worstLaw * 100).toFixed(1)}%; bright lines a period at c 0.9: ${lines[0.9]}, at 2: ${lines[2]} (${gaps.join(', ')} texels apart, the law drawn ${lawGaps.join(', ')}, undrawn ${FOLD_PAIR.toFixed(1)}); light kept to ${(worstKept * 100).toFixed(2)}%`);
  }

  /*
    8. The back plate: two paths traced at once, the lens as layer 1 and a
    flat path as layer 0, land each in its own half of the buffer the display
    reads (wallLight0 at 4, wallLight1 at 4 + m^2): layer 1 the lens's light
    as line 3 traced it alone, layer 0 even.
  */
  {
    const alone = await trace(lens, fDial);
    const r = await trace(field(() => 0.08), fDial, lens);
    const front = Math.max(...r.light.map((v) => Math.abs(v - 1)));
    let worst = 0;
    for (let i = 0; i < alone.light.length; i++) worst = Math.max(worst, Math.abs((r.light1?.[i] ?? 0) - alone.light[i]));
    const peak = Math.max(...alone.light);
    check('the back plate traces in its own half: the lens as layer 1 lights as it does alone (within 1% of its peak), layer 0 flat beside it even (within 1%)',
      r.light1 && worst <= 0.01 * peak && front <= 0.01 && peak > 4,
      `layer 1 off its trace alone by ${worst.toFixed(4)} of a peak ${peak.toFixed(1)}; layer 0 worst ${(front * 100).toFixed(3)}%`);
  }

  /*
    9. The derive pass writes the path in the units the trace reads: an oil
    layer's height h (31s-1) seeded as a cap of h0 over a base, on clear
    water with no oil in the view, gives .w at the cap's top over the
    plate's corner of dn h0 / DISH_GAP_METRES (dn 0.137), within 5%. Lines
    1 to 8 hand the trace .w in exactly those units, so this is what makes
    "focuses at Rc/dn" true of a drop of oil the solver holds.
  */
  {
    const H0 = 0.0004, BASE = 0.0001, N = 128;
    const got = await page.evaluate(async ({ H0, BASE, N }) => {
      await lab.create(N);
      lab.surfaceLevelling(false);
      const h = new Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const r2 = ((i + 0.5) / N - 0.5) ** 2 + ((j + 0.5) / N - 0.5) ** 2;
        h[j * N + i] = BASE + H0 * Math.max(0, 1 - r2 / (0.2 * 0.2));
      }
      lab.setSurfaceHeight(h);
      await lab.render(128, { projectorFocus: 0.5 }, { zoom: 1, macroAmount: 0, cx: 0.5, cy: 0.5, bubbles: 0, readPath: true });
      const p = lab.path();
      if (!p) return null;
      const at = (u, v) => p.w[Math.min(p.n - 1, Math.floor(v * p.n)) * p.n + Math.min(p.n - 1, Math.floor(u * p.n))];
      return { n: p.n, top: at(0.5, 0.5), corner: at(0.05, 0.05) };
    }, { H0, BASE, N });
    const want = DN * H0 / GAP;
    const dw = got ? got.top - got.corner : NaN;
    check(`the derive pass writes an oil layer's height as path dn h / gap (a ${H0 * 1000} mm cap: ${want.toFixed(4)} rest gaps, within 5%)`,
      got && Math.abs(dw / want - 1) <= 0.05, got ? `top over corner ${dw.toFixed(4)} (${got.top.toFixed(4)} against ${got.corner.toFixed(4)}) on a ${got.n}-texel path` : 'no path read');
  }

  /*
    6. The display reads the trace: the lab plate with oil drops drawn at
    Focus 0.8 with the light traced, and again with the trace taken out
    (the display then falls back to the first-order shadowgraph), must
    differ by over 8 levels on a part of the plate: a header the display
    did not accept (wgsl/caustic.ts, tracedLight), or binding 27 left
    blank, draws the fallback both times and fails. At Focus 0.5 nothing
    is traced. With --first-order the "traced" frame is drawn with the
    trace out too, and the line fails.
  */
  {
    const got = await page.evaluate(async (firstOrder) => {
      await lab.create(128);
      const s = lab.solver();
      // Dye under the drops: a clear plate draws black, and two black frames are the same however the light was found.
      lab.dye(0.5, 0.5, 0.35, [0.3, 0.6, 1.0], 0.6);
      s.addMix(0.4, 0.45, 0.06, { oil: 1 });
      s.addMix(0.62, 0.55, 0.04, { oil: 1 });
      lab.flush(); await lab.step(10);
      const cam = { zoom: 1, macroAmount: 0, cx: 0.5, cy: 0.5, bubbles: 0 };
      const traced = await lab.render(128, { projectorFocus: 0.8 }, { ...cam, noTrace: firstOrder });
      const off = lab.traced();
      const fallback = await lab.render(128, { projectorFocus: 0.8 }, { ...cam, noTrace: true });
      const offOff = lab.traced();
      await lab.render(128, { projectorFocus: 0.5 }, cam);
      const mid = lab.traced();
      const a = traced.wall ?? traced, b = fallback.wall ?? fallback;
      let moved = 0, n = 0, mean = 0;
      for (let i = 0; i < a.length; i += 4) { n++; mean += a[i + 1]; if (Math.abs(a[i + 1] - b[i + 1]) > 8) moved++; }
      return { off, offOff, mid, moved: moved / n, mean: mean / n };
    }, firstOrder);
    check('the display draws the traced light at Focus 0.8 (over 1% of the plate 8+ levels off the first-order fallback), and traces none at its middle',
      got.off && !got.offOff && !got.mid && got.moved > 0.01 && got.mean > 40,
      `0.8 traced ${got.off} (${(got.moved * 100).toFixed(2)}% of the plate off the fallback, the plate's green ${got.mean.toFixed(0)}), with the trace out ${got.offOff}, 0.5 traced ${got.mid}`);
  }
} finally {
  await close();
}

const pass = checks.filter((c) => c.ok).length;
console.log(`\ncaustics: ${pass}/${checks.length} checks passed${firstOrder ? ' (first-order control)' : ''}`);
process.exit(pass === checks.length ? 0 : 1);
