/**
 * What a bubble does to the dye on the CPU side (H6 · A): the dye it pushes
 * aside goes to a ring just outside its rim, and when it pops the hole is
 * filled back in from that ring. Pure array work on the logical grid, so it
 * can be measured on its own (npm run pops).
 *
 * Both used to work on hard-edged sets of cells: every cell inside the
 * radius, every cell in the annulus, each given the same amount. On a 192
 * grid a bubble a few cells across is a staircase, and a popped one came
 * back as a flat, stepped plug in a drained, stepped ring, which the plate
 * magnifies into blocks (reported: "popping bubbles ends up with really
 * pixelated areas"). Every weight is now a smooth function of the distance
 * from the centre, a cell or two wide at the edges whatever the size, and the
 * fill goes to where the hole is emptiest rather than evenly over it.
 */

/** The plate's CPU arrays a bubble writes into: density and its log-absorptions, and the multiplier. */
export interface DyeTarget {
  density: Float32Array;
  densityR: Float32Array;
  densityG: Float32Array;
  densityB: Float32Array;
  mul: Float32Array;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The ring the displaced dye lands in: just outside the rim, a third of a
 * radius wide (what the references show round a bubble sitting in dye), and
 * never narrower than a few cells, so a small bubble's ring is a ring and
 * not a handful of cells. Peaks mid-band and falls to nothing at both edges.
 */
export function rimBand(R: number): { rIn: number; rOut: number; w: (d: number) => number } {
  const rIn = R * 1.02;
  const rOut = Math.max(R * 1.38, rIn + 3);
  return {
    rIn, rOut,
    w: (d) => {
      if (d <= rIn || d >= rOut) return 0;
      const s = Math.sin(Math.PI * (d - rIn) / (rOut - rIn));
      return s * s;
    },
  };
}

/**
 * Lay `mass` of dye (with its absorptions) into the ring round a bubble at
 * (x, y) of radius R, in the grid's own log-space so the ring keeps the
 * colour of the dye it came from. Conserves exactly: the weights sum to one.
 */
export function depositRim(t: DyeTarget, N: number, x: number, y: number, R: number,
  mass: number, aR: number, aG: number, aB: number): boolean {
  const band = rimBand(R);
  const yl = Math.max(0, Math.floor(y - band.rOut)), yh = Math.min(N - 1, Math.ceil(y + band.rOut));
  const xl = Math.max(0, Math.floor(x - band.rOut)), xh = Math.min(N - 1, Math.ceil(x + band.rOut));
  let sum = 0;
  for (let j = yl; j <= yh; j++) for (let i = xl; i <= xh; i++) sum += band.w(Math.hypot(i - x, j - y));
  if (!(sum > 1e-6)) return false;
  for (let j = yl; j <= yh; j++) {
    for (let i = xl; i <= xh; i++) {
      const w = band.w(Math.hypot(i - x, j - y)) / sum;
      if (w <= 0) continue;
      const k = i + j * N;
      t.density[k] += mass * w;
      t.densityR[k] += aR * w; t.densityG[k] += aG * w; t.densityB[k] += aB * w;
    }
  }
  return true;
}

/**
 * One pass of filling a popped bubble's hole from the ring around it, read
 * from `dye` (the mirror, RGBA per cell: absorptions and density) and written
 * as deltas into `t`. A collapsing ring falls inward until the level evens
 * out, so a share of the difference between the ring's level and the hole's
 * moves each pass, and it stops by itself. Returns how much moved.
 *
 * The hole's edge and the ring's outer edge are soft (a two-cell ramp), and
 * what comes in goes to each cell by how far it is under the ring's level,
 * so the hole closes from its emptiest part rather than as a flat plug.
 */
export function fillHole(t: DyeTarget, dye: Float32Array, N: number, x: number, y: number, R: number): number {
  const rOut = Math.max(R * 1.45, R + 3);
  const yl = Math.max(0, Math.floor(y - rOut - 1)), yh = Math.min(N - 1, Math.ceil(y + rOut + 1));
  const xl = Math.max(0, Math.floor(x - rOut - 1)), xh = Math.min(N - 1, Math.ceil(x + rOut + 1));
  const inHole = (d: number) => 1 - smooth(R - 1, R + 1, d);
  const inRing = (d: number) => smooth(R - 1, R + 1, d) * (1 - smooth(rOut - 1.5, rOut + 0.5, d));

  let discW = 0, discMass = 0, ringW = 0, ringMass = 0, aR = 0, aG = 0, aB = 0;
  for (let j = yl; j <= yh; j++) {
    for (let i = xl; i <= xh; i++) {
      const d = Math.hypot(i - x, j - y);
      const k4 = (i + j * N) * 4;
      const m = dye[k4 + 3];
      const h = inHole(d), r = inRing(d);
      discW += h; discMass += h * m;
      if (r > 0) { ringW += r; ringMass += r * m; aR += r * dye[k4]; aG += r * dye[k4 + 1]; aB += r * dye[k4 + 2]; }
    }
  }
  if (!(discW > 0) || !(ringW > 0)) return 0;
  const discMean = discMass / discW, ringMean = ringMass / ringW;
  if (!(ringMean > discMean + 1e-4) || !(ringMass > 1e-4)) return 0;
  // A rate, not a jump: the ring collapses over a moment rather than snapping shut.
  /*
    Taken from where the ring stands above its own level, which is where the
    displaced dye was piled: taken evenly, the fill dug a trough in the
    plate just past the pile (a third of the plate's level deep, on a
    bubble eight cells across). Evenly only if the ring is already flat.
  */
  let excess = 0;
  for (let j = yl; j <= yh; j++) {
    for (let i = xl; i <= xh; i++) {
      const r = inRing(Math.hypot(i - x, j - y));
      if (r > 0) excess += r * Math.max(0, dye[(i + j * N) * 4 + 3] - ringMean);
    }
  }
  const byExcess = excess > 1e-4;
  const from = byExcess ? excess : ringMass;
  const moved = Math.min((ringMean - discMean) * 0.35 * discW, from * 0.5);
  if (!(moved > 1e-5)) return 0;

  // Where it goes: each cell of the hole by how far under the ring's level it is.
  let gap = 0;
  for (let j = yl; j <= yh; j++) {
    for (let i = xl; i <= xh; i++) {
      const h = inHole(Math.hypot(i - x, j - y));
      if (h > 0) gap += h * Math.max(0, ringMean - dye[(i + j * N) * 4 + 3]);
    }
  }
  if (!(gap > 1e-9)) return 0;
  const colR = aR / ringMass, colG = aG / ringMass, colB = aB / ringMass;
  // Out of the ring through the multiplier, which exists for dye removed.
  const f = moved / from;
  for (let j = yl; j <= yh; j++) {
    for (let i = xl; i <= xh; i++) {
      const d = Math.hypot(i - x, j - y);
      const k = i + j * N;
      const h = inHole(d);
      if (h > 0) {
        const add = moved * h * Math.max(0, ringMean - dye[k * 4 + 3]) / gap;
        if (add > 0) {
          t.density[k] += add;
          t.densityR[k] += colR * add; t.densityG[k] += colG * add; t.densityB[k] += colB * add;
        }
      }
      const r = inRing(d);
      if (r > 0) {
        const m = dye[k * 4 + 3];
        const take = f * r * (byExcess ? Math.max(0, m - ringMean) : m);
        if (take > 0 && m > 1e-9) t.mul[k] *= 1 - take / m;
      }
    }
  }
  return moved;
}
