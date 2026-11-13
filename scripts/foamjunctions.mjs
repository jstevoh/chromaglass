/**
 * The junctions of a packed crowd of oil drops, read from the oil field alone
 * (n × n, the oil's share per cell), for `npm run foam` (PLAN 47z-5).
 *
 * A drop is a 4-connected region of oil over a half, SPECK cells up. Every
 * water cell's distance to the nearest drops is taken to their edges, placed
 * at the half-oil crossing between an edge cell and its neighbour so a
 * distance is not whole cells. A junction is a cluster of water cells near
 * (d1 < NEAR) three drops at once (d3 − d1 < TIE), a Plateau border; its
 * order is four when a fourth drop is as near. Each film of a three-way
 * junction is read as the mean direction from the junction's centre to the
 * cells equidistant from its two drops, RHO0 to RHO1 cells out: past the
 * border's own curve, inside the film's straight run.
 *
 * Read on an exact hexagonal foam laid as Foam Cells lays its own (every
 * junction 120°, 192², films four cells), the angles read a median 4° off
 * 120° and 98% within 10°: that is this reader's floor, the grid's.
 *
 * Also returned: which water cells are border (in a junction's cluster) and
 * which are film (two drops equidistant within a cell, near both), for the
 * dye's share in each.
 */
export function junctions(n, oil, o = {}) {
  const SPECK = o.speck ?? 12, NEAR = o.near ?? 5, TIE = o.tie ?? 1.2, RHO0 = o.rho0 ?? 3, RHO1 = o.rho1 ?? 7;
  const lab = new Int32Array(n * n).fill(-1);
  const sizes = [];
  for (let q = 0; q < n * n; q++) {
    if (lab[q] >= 0 || oil[q] < 0.5) continue;
    const id = sizes.length, st = [q], cells = [q]; lab[q] = id;
    while (st.length) {
      const v = st.pop(), x = v % n, y = (v - x) / n;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const r = xx + yy * n; if (lab[r] < 0 && oil[r] >= 0.5) { lab[r] = id; st.push(r); cells.push(r); }
      }
    }
    sizes.push(cells.length);
    if (cells.length < SPECK) for (const c of cells) lab[c] = -2;
  }
  const drops = sizes.map((s, i) => i).filter((i) => sizes[i] >= SPECK);
  // Edge cells of each drop (an oil cell with a non-drop neighbour), in sub-cell position by
  // the 0.5 crossing toward that neighbour, so a distance is not quantised to whole cells.
  const edge = [];
  for (let q = 0; q < n * n; q++) {
    const id = lab[q]; if (id < 0) continue;
    const x = q % n, y = (q - x) / n;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
      const r = xx + yy * n; if (lab[r] === id) continue;
      const a = oil[q], b = oil[r], t = Math.max(0, Math.min(1, (a - 0.5) / Math.max(1e-6, a - b)));
      edge.push([x + dx * t, y + dy * t, id]);
    }
  }
  const D = new Float32Array(n * n * 3).fill(1e9), L = new Int32Array(n * n * 3).fill(-1), fourth = new Float32Array(n * n).fill(1e9);
  for (let q = 0; q < n * n; q++) {
    if (lab[q] >= 0) continue;
    const x = q % n, y = (q - x) / n;
    const best = new Map();
    for (const [ex, ey, id] of edge) {
      const dx = ex - x, dy = ey - y; if (Math.abs(dx) > NEAR + 4 || Math.abs(dy) > NEAR + 4) continue;
      const d = Math.hypot(dx, dy); if (d < (best.get(id) ?? 1e9)) best.set(id, d);
    }
    const s = [...best.entries()].sort((a, b) => a[1] - b[1]).slice(0, 4);
    for (let k = 0; k < 3 && k < s.length; k++) { D[q * 3 + k] = s[k][1]; L[q * 3 + k] = s[k][0]; }
    if (s.length >= 4) fourth[q] = s[3][1];
  }
  const isJ = (q) => lab[q] < 0 && D[q * 3] < NEAR && D[q * 3 + 2] - D[q * 3] < TIE;
  const seen = new Uint8Array(n * n), out = [];
  for (let q = 0; q < n * n; q++) {
    if (seen[q] || !isJ(q)) continue;
    const st = [q], cells = [q]; seen[q] = 1;
    while (st.length) {
      const v = st.pop(), x = v % n, y = (v - x) / n;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const r = xx + yy * n; if (!seen[r] && isJ(r)) { seen[r] = 1; st.push(r); cells.push(r); }
      }
    }
    const ids = new Set(), four = cells.some((c) => fourth[c] - D[c * 3] < TIE);
    for (const c of cells) for (let k = 0; k < 3; k++) ids.add(L[c * 3 + k]);
    // the junction's centre: the cell most nearly equidistant from its three
    let cx = 0, cy = 0, w = 0;
    for (const c of cells) { const ww = 1 / (0.2 + D[c * 3 + 2] - D[c * 3]); cx += (c % n) * ww; cy += Math.floor(c / n) * ww; w += ww; }
    cx /= w; cy /= w;
    const j = { x: cx, y: cy, order: four || ids.size >= 4 ? 4 : 3, ids: [...ids] };
    if (j.order === 3 && ids.size === 3) {
      const [A, B, C] = j.ids, pairs = [[A, B], [B, C], [C, A]], dirs = [];
      for (const [p, r] of pairs) {
        let vx = 0, vy = 0, k = 0;
        const x0 = Math.max(0, Math.floor(cx - RHO1 - 1)), x1 = Math.min(n - 1, Math.ceil(cx + RHO1 + 1));
        const y0 = Math.max(0, Math.floor(cy - RHO1 - 1)), y1 = Math.min(n - 1, Math.ceil(cy + RHO1 + 1));
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
          const c = xx + yy * n; if (lab[c] >= 0) continue;
          const l0 = L[c * 3], l1 = L[c * 3 + 1];
          if (!((l0 === p && l1 === r) || (l0 === r && l1 === p))) continue;
          if (D[c * 3 + 1] - D[c * 3] > 0.8) continue;
          const dx = xx - cx, dy = yy - cy, rr = Math.hypot(dx, dy);
          if (rr < RHO0 || rr > RHO1) continue;
          vx += dx / rr; vy += dy / rr; k++;
        }
        dirs.push(k >= 2 ? Math.atan2(vy, vx) : null);
      }
      if (dirs.every((d) => d !== null)) {
        const s = dirs.slice().sort((a, b) => a - b);
        const ang = [s[1] - s[0], s[2] - s[1], 2 * Math.PI + s[0] - s[2]].map((a) => a * 180 / Math.PI);
        j.angles = ang; j.dev = Math.max(...ang.map((a) => Math.abs(a - 120)));
      }
    }
    out.push(j);
  }
  const kind = new Uint8Array(n * n);
  for (let q = 0; q < n * n; q++) {
    if (lab[q] >= 0 || D[q * 3] >= NEAR) continue;
    if (seen[q]) kind[q] = 2;
    else if (D[q * 3 + 1] - D[q * 3] < 1 && L[q * 3 + 1] >= 0) kind[q] = 1;
  }
  return { drops: drops.length, junctions: out, kind };
}
export function summary(r) {
  const j = r.junctions, three = j.filter((q) => q.order === 3), m = three.filter((q) => q.angles);
  const devs = m.map((q) => q.dev).sort((a, b) => a - b);
  const med = devs.length ? devs[Math.floor(devs.length / 2)] : NaN;
  const within = devs.filter((d) => d <= 10).length;
  const mean = devs.reduce((a, b) => a + b, 0) / Math.max(1, devs.length);
  return { drops: r.drops, junctions: j.length, threeWay: three.length, measured: m.length, medianDev: med, meanDev: mean, within10: devs.length ? within / devs.length : NaN };
}
