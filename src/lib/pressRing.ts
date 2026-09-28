/**
 * Where a press puts what it squeezes out from under the palm, shared by the
 * app (squeezeOut in LiquidVisualizer) and the lab (`npm run pressoil`).
 *
 * The dye's half is in squeezeOut, on the CPU, through the dye mirror. The
 * oil's (Oil Bodies) lives only on the GPU, so its half is the solver's
 * pressMix. The two have to agree on the share and on the ring or the colour
 * a press moves leaves its oil behind, which is the fault this was written
 * for (PLAN 15d): with Oil Bodies a press drew a body's colour out into the
 * water and left the body where it was, colourless. So the numbers that make
 * them agree are here, once, and the lab presses the oil through the same
 * function the app does, with the app's own arguments, rather than a copy
 * that could drift from it.
 */

/** The ring runs from the palm's rim to this many palms out. */
export const PRESS_RING = 1.7;

/**
 * The ring's area over the palm's. The palm is laid on the ring area for area:
 * a point s from the middle lands at sqrt(R^2 + s^2 K), which carries the
 * disc onto the ring with a constant stretch of K, so every ring cell receives
 * 1 / K of the palm cell it maps back to. The oil's kernel (mixCarry's Press
 * mode, src/gpu/wgsl/fluid.ts) is the same map.
 */
export const PRESS_STRETCH = PRESS_RING * PRESS_RING - 1;

/** Whether a palm point (dx, dy from the palm's middle, cells) lands on a plate of N cells. */
function landsOnPlate(cx: number, cy: number, dx: number, dy: number, R: number, N: number): boolean {
  const s = Math.hypot(dx, dy);
  const f = Math.sqrt(R * R + s * s * PRESS_STRETCH) / Math.max(s, 1e-9);
  const x = cx + dx * f, y = cy + dy * f;
  // A cell x covers x - 0.5 to x + 0.5; the kernel asks the same of (x + 0.5) / N in 0..1.
  return x >= -0.5 && y >= -0.5 && x < N - 0.5 && y < N - 0.5;
}

export interface DyeOut {
  mul: Float32Array; density: Float32Array; densityR: Float32Array; densityG: Float32Array; densityB: Float32Array;
}

/**
 * The dye's half of one press, on the CPU through the dye mirror (`dye`, rgba
 * amounts, N x N): what the palm takes goes out through `mul` (the
 * multiplicative channel that exists for dye being taken away) and into the
 * ring through the density deltas, in the mirror's own space so the colour
 * that arrives is the colour that left. Returns what it moved; below 1e-4 it
 * writes nothing.
 *
 * It lands each palm cell where the oil's kernel lands it, not spread evenly
 * round the whole ring as it used to. Evenly, a palm half over an oil body
 * put half the body's colour on the far side of the ring, in the water,
 * while its oil went out on the body's own side: the fault PLAN 15d is about,
 * by halves. And a cell whose landing point is off the plate keeps its colour
 * as it keeps its oil. Both halves gather: each ring cell reads the palm cell
 * it maps back to (the nearest, as the kernel reads it).
 */
export function pressDye(dye: ArrayLike<number>, N: number, cx: number, cy: number, R: number, take: number, out: DyeOut): number {
  if (!(take > 0)) return 0;
  const O = R * PRESS_RING;
  const yl = Math.max(0, Math.floor(cy - O)), yh = Math.min(N - 1, Math.ceil(cy + O));
  const xl = Math.max(0, Math.floor(cx - O)), xh = Math.min(N - 1, Math.ceil(cx + O));
  const disc: number[] = [];
  const gets: number[] = [];
  let mass = 0;
  for (let y = yl; y <= yh; y++) {
    for (let x = xl; x <= xh; x++) {
      const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
      if (r < R) {
        if (!landsOnPlate(cx, cy, dx, dy, R, N)) continue;
        const i = x + y * N;
        disc.push(i);
        const v = dye[i * 4 + 3];
        if (v > 1e-5) mass += v * take;
      } else if (r < O) {
        const f = Math.sqrt((r * r - R * R) / PRESS_STRETCH) / r;
        const qx = Math.floor(cx + dx * f + 0.5), qy = Math.floor(cy + dy * f + 0.5);
        if (qx < 0 || qy < 0 || qx >= N || qy >= N) continue;
        // Only from a palm cell that gives: one whose own landing is on the plate.
        if (Math.hypot(qx - cx, qy - cy) >= R || !landsOnPlate(cx, cy, qx - cx, qy - cy, R, N)) continue;
        gets.push(x + y * N, qx + qy * N);
      }
    }
  }
  if (!(mass > 1e-4)) return 0;
  for (const i of disc) out.mul[i] *= 1 - take;
  /*
    Each ring cell gets 1 / K of the palm cell it reads, as the oil's kernel
    gives, but with K counted rather than taken from the formula: the cells
    the ring has over the cells the palm gives from. A nearest-cell gather
    does not tile exactly, and the formula's K lost 1% of what a press moved
    in the middle of the mirror's 192 cells and 1.4% in a corner (`npm run
    pressoil`); counted, a flat plate keeps all of it. Splitting each palm
    cell among exactly the ring cells that read it was tried and is worse (2%):
    some palm cells are read by none, and their share went nowhere.
  */
  const w = take * disc.length / Math.max(1, gets.length / 2);
  for (let k = 0; k < gets.length; k += 2) {
    const i = gets[k], q4 = gets[k + 1] * 4;
    if (!(dye[q4 + 3] > 1e-5)) continue;
    out.density[i] += dye[q4 + 3] * w;
    out.densityR[i] += dye[q4] * w; out.densityG[i] += dye[q4 + 1] * w; out.densityB[i] += dye[q4 + 2] * w;
  }
  return mass;
}

/**
 * How much of what is under the palm goes, one press. A share rather than all
 * of it: a hand squeezes the film thin, it does not scrape it. Handed over
 * once per dye reading (see dyeMoveAfter), a few frames apart, so a bigger
 * share each time for the same press.
 */
export function pressTake(amount: number): number {
  return Math.max(0, Math.min(0.6, amount * 48));
}

export interface OilPress {
  pressMix?(x: number, y: number, radius: number, outer: number, take: number): void;
}

/**
 * The oil's half of one press. `cx`, `cy` and `R` are in the dye mirror's
 * cells (N across), as squeezeOut has them. A cell x of the mirror is the
 * plate's (x + 0.5) / N, the same centre the kernel's cells have, so the oil's
 * palm sits on the dye's rather than half a cell off it.
 */
export function pressOil(gpu: OilPress, cx: number, cy: number, R: number, N: number, take: number): void {
  gpu.pressMix?.((cx + 0.5) / N, (cy + 0.5) / N, R / N, (R * PRESS_RING) / N, take);
}
