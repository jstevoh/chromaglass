/**
 * The oil beads as a list for the GPU to draw their mask from (PLAN.md 14ab-6).
 *
 * Read in the code on 2026-10-24 (14ab): on every frame the beads moved, which
 * is every frame they are out, the page drew their mask on the CPU and handed
 * the picture across. The rings were a 512² canvas, a radial gradient and a
 * stroked rim for each of up to 420 beads; the drops were `rasterDrops`, a
 * loop over every pixel of every drop and every wall it shares, into a
 * 1024 × 512 picture. Measured in `npm run drops` that loop took 17 ms a frame
 * on a cloud machine's CPU, and the upload behind it was 2 MB (1 MB for the
 * rings) sixty times a second. The same arithmetic per pixel is what a GPU is
 * for: here the page writes down each bead once (where it is, how big, its
 * colour, its passenger, the walls it shares) and which beads reach each
 * sixteen-pixel tile of the mask, and `gpu/beadMask.ts` draws every pixel from
 * that in a few compute passes. A few tens of kilobytes cross a frame, not
 * megabytes.
 *
 * Nothing about what is drawn changes: every number written here is one the
 * CPU's drawing worked out at the same place in the same way (`render` and
 * `rasterDrops` in beads.ts, which stay as the reference `npm run beadmask`
 * holds the GPU's mask to, pixel by pixel).
 *
 * Why the walls are worked out here and not on the GPU: a wall is a pair of
 * drops, and every pixel of both reads it. Done per pixel, each would search
 * the neighbours for its drops' walls again; done once here it is a few
 * thousand pairs a frame, which the bins below keep to the drops that could
 * touch.
 */
import { type Bead, dropWall, innerLife } from './beads';

/** The mask's tiles, in pixels a side: a tile's list is every bead whose box reaches it. */
export const BEAD_TILE = 16;
/** Floats a bead takes in the list (the struct `Bead` in wgsl/beadMask.ts: six vec4s). */
export const BEAD_FLOATS = 24;

/** What the GPU is handed for one frame's mask. The arrays are the packer's own and reused: read them before the next pack. */
export interface BeadPack {
  /** The mask's height in pixels; the rings' mask is S wide, the drops' 2S (beadWide in the plate's shader). */
  S: number;
  /** Drops (the wide mask, walls, colours) rather than rings. */
  wide: boolean;
  /** `beadDrops`, which draws a passenger and an oval in. */
  amount: number;
  /** How many beads `beads` holds (BEAD_FLOATS each); the drawable ones only. */
  n: number;
  beads: Float32Array;
  /** The walls (four floats each: the direction to the neighbour, the apex along it, the arc's radius signed by side, 0 for straight). */
  nCuts: number;
  cuts: Float32Array;
  /** Tile starts (tiles² + 1) and then the beads' indices, tile by tile in the beads' order. */
  nTiles: number;
  tiles: Uint32Array;
  /** Words of `tiles` in use. */
  tileWords: number;
}

/** Bytes a pack hands across: what the frame uploads in place of the picture. */
export function packBytes(p: BeadPack): number {
  return (p.n * BEAD_FLOATS + p.nCuts * 4 + p.tileWords) * 4;
}

function grow<T extends Float32Array | Float64Array | Uint32Array | Int32Array>(a: T, need: number, make: (n: number) => T): T {
  if (a.length >= need) return a;
  const b = make(Math.max(need, a.length * 2));
  b.set(a);
  return b;
}

export class BeadPacker {
  private beads = new Float32Array(BEAD_FLOATS * 64);
  private beadU = new Uint32Array(this.beads.buffer);
  private cuts = new Float32Array(4 * 256);
  private tiles = new Uint32Array(0);
  /** Each kept bead's box in tiles, and the index it was given in the list. */
  private box = new Int32Array(4 * 64);
  /** Each drop's reach over its radius, the drops in order across the plate, the pairs that touch and each drop's count of them. */
  private reachOf = new Float32Array(64);
  private order = new Int32Array(64);
  private swept = new Float64Array(192);
  private pairs = new Int32Array(256);
  private count = new Int32Array(64);
  private cursor = new Uint32Array(0);
  private readonly pack: BeadPack = { S: 0, wide: false, amount: 0, n: 0, beads: this.beads, nCuts: 0, cuts: this.cuts, nTiles: 0, tiles: this.tiles, tileWords: 0 };

  /**
   * The list for `beads` on a grid of `grid` cells, drawn at `S` pixels a
   * side; rings when `drops` is 0, drops (at that much) otherwise, as
   * `BeadField.render` chooses.
   */
  packBeads(beads: readonly Bead[], grid: number, S: number, drops: number): BeadPack {
    const wide = drops > 0, k = S / grid;
    const n0 = beads.length;
    this.beads = grow(this.beads, n0 * BEAD_FLOATS, (m) => new Float32Array(m));
    if (this.beadU.buffer !== this.beads.buffer) this.beadU = new Uint32Array(this.beads.buffer);
    this.box = grow(this.box, n0 * 4, (m) => new Int32Array(m));
    this.reachOf = grow(this.reachOf, n0, (m) => new Float32Array(m));
    const B = this.beads, U = this.beadU;
    const T = S / BEAD_TILE;
    let n = 0;
    /*
      The beads, in their order: a bead later in the list is drawn over an
      earlier one (the rings' canvas) and a tie between two drops goes to the
      earlier (rasterDrops' `a <= own`), so the order is kept everywhere,
      tile lists included. A bead that is not a number anywhere is left out,
      as both drawings leave it out.
    */
    for (let i = 0; i < n0; i++) {
      const b = beads[i];
      // Float32, as rasterDrops keeps its centres and radii.
      const x0 = Math.fround(b.x * k), y0 = Math.fround(b.y * k), R = Math.fround(Math.max(1, b.r * k));
      if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(R)) continue;
      const o = n * BEAD_FLOATS;
      const fade = Math.min(1, b.age / 0.6);
      B[o] = x0; B[o + 1] = y0; B[o + 2] = R; B[o + 3] = fade;
      B[o + 4] = fade * (0.8 + 0.2 * b.seed);
      B[o + 5] = Math.max(1, R * 0.12);
      let ext = R + 1;
      if (wide) {
        // The merge's oval (rasterDrops): drawn in by the slider.
        const st0 = b.sx !== undefined ? Math.hypot(b.sx, b.sy ?? 0) : 0, st = drops * st0;
        const A = 1 + st;
        ext = R * A + 1;
        B[o + 6] = A; B[o + 8] = st > 0 ? b.sx! / st0 : 1; B[o + 9] = st > 0 ? (b.sy ?? 0) / st0 : 0;
        // How far past its radius it reaches, a float as rasterDrops keeps it.
        this.reachOf[n] = Math.fround(1 + (b.sx !== undefined ? drops * Math.hypot(b.sx, b.sy ?? 0) : 0));
        const c = b.color ?? [1, 1, 1];
        B[o + 12] = c[0]; B[o + 13] = c[1]; B[o + 14] = c[2];
        const inn = b.inner;
        if (inn && Number.isFinite(inn.dx) && Number.isFinite(inn.dy)) {
          // The passenger, narrowing over its life (rasterDrops' second loop).
          const iR = Math.max(1.25, inn.r * k * Math.sqrt(Math.max(0, 1 - inn.age / innerLife(inn.seed))));
          B[o + 15] = 1;
          B[o + 16] = x0 + inn.dx * k; B[o + 17] = y0 + inn.dy * k; B[o + 18] = iR; B[o + 19] = Math.max(1, iR * 0.12);
          B[o + 20] = inn.color[0]; B[o + 21] = inn.color[1]; B[o + 22] = inn.color[2];
        } else B[o + 15] = 0;
      } else {
        B[o + 6] = 1; B[o + 8] = 1; B[o + 9] = 0; B[o + 15] = 0;
      }
      B[o + 7] = ext;
      U[o + 10] = 0; U[o + 11] = 0;
      // Its box in tiles: every pixel either drawing could touch.
      const bx = this.box;
      bx[4 * n] = Math.max(0, Math.floor((x0 - ext - 1) / BEAD_TILE));
      bx[4 * n + 1] = Math.min(T - 1, Math.floor((x0 + ext + 1) / BEAD_TILE));
      bx[4 * n + 2] = Math.max(0, Math.floor((y0 - ext - 1) / BEAD_TILE));
      bx[4 * n + 3] = Math.min(T - 1, Math.floor((y0 + ext + 1) / BEAD_TILE));
      n++;
    }

    let nCuts = 0;
    if (wide && n > 1) nCuts = this.walls(n);

    // The tiles: count, then starts, then fill in the beads' order.
    const tiles = (this.tiles = grow(this.tiles, T * T + 1, (m) => new Uint32Array(m)));
    tiles.fill(0, 0, T * T + 1);
    let total = 0;
    const bx = this.box;
    for (let i = 0; i < n; i++) {
      if (bx[4 * i] > bx[4 * i + 1] || bx[4 * i + 2] > bx[4 * i + 3]) continue;
      for (let ty = bx[4 * i + 2]; ty <= bx[4 * i + 3]; ty++) for (let tx = bx[4 * i]; tx <= bx[4 * i + 1]; tx++) { tiles[ty * T + tx + 1]++; total++; }
    }
    for (let t = 0; t < T * T; t++) tiles[t + 1] += tiles[t];
    const head = T * T + 1;
    const all = (this.tiles = grow(this.tiles, head + total, (m) => new Uint32Array(m)));
    // Where each tile's next index goes.
    const cursor = (this.cursor = grow(this.cursor, T * T, (m) => new Uint32Array(m)));
    cursor.set(all.subarray(0, T * T));
    for (let i = 0; i < n; i++) {
      if (bx[4 * i] > bx[4 * i + 1] || bx[4 * i + 2] > bx[4 * i + 3]) continue;
      for (let ty = bx[4 * i + 2]; ty <= bx[4 * i + 3]; ty++) for (let tx = bx[4 * i]; tx <= bx[4 * i + 1]; tx++) all[head + cursor[ty * T + tx]++] = i;
    }

    const p = this.pack;
    p.S = S; p.wide = wide; p.amount = drops; p.n = n; p.beads = this.beads;
    p.nCuts = nCuts; p.cuts = this.cuts; p.nTiles = T; p.tiles = all; p.tileWords = head + total;
    return p;
  }

  /**
   * Every wall between two drops that reach each other, as `rasterDrops`
   * finds them, written after each drop's start and count. rasterDrops asks
   * every pair from both ends (330,000 questions for 574 drops, 2.7 ms on a
   * cloud machine); here the drops are swept in order across the plate and
   * each pair asked once, of the ones near enough across that they could
   * touch (within this drop's reach and the widest), and both its walls
   * written from the one answer. The pairs found are the same, and so are
   * the walls: which order a drop's walls come in does not matter to the
   * per-pixel arithmetic, which takes the least and the second least.
   */
  private walls(n: number): number {
    const B = this.beads, U = this.beadU, reach = this.reachOf;
    let most = 0;
    for (let i = 0; i < n; i++) most = Math.max(most, B[i * BEAD_FLOATS + 2] * reach[i]);
    // Across the plate: the drops by x.
    this.order = grow(this.order, n, (m) => new Int32Array(m));
    const order = this.order.subarray(0, n);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => B[a * BEAD_FLOATS] - B[b * BEAD_FLOATS]);
    // The sweep reads its drops in that order from arrays of their own:
    // centre, radius times reach. Doubles, which hold the floats exactly.
    this.swept = grow(this.swept, 3 * n, (m) => new Float64Array(m));
    const sw = this.swept;
    for (let a = 0; a < n; a++) {
      const o = order[a] * BEAD_FLOATS;
      sw[3 * a] = B[o]; sw[3 * a + 1] = B[o + 1]; sw[3 * a + 2] = B[o + 2] * reach[order[a]];
    }
    // The pairs that touch, and how many walls each drop has.
    const count = (this.count = grow(this.count, n + 1, (m) => new Int32Array(m)));
    count.fill(0, 0, n + 1);
    let pairs = 0;
    this.pairs = grow(this.pairs, 2 * n, (m) => new Int32Array(m));
    for (let a = 0; a < n; a++) {
      const x0 = sw[3 * a], y0 = sw[3 * a + 1], wa = sw[3 * a + 2], far = x0 + wa + most;
      for (let b = a + 1; b < n; b++) {
        const dx = sw[3 * b] - x0;
        if (dx >= far - x0) break;
        const dy = sw[3 * b + 1] - y0;
        const D2 = dx * dx + dy * dy, r2 = wa + sw[3 * b + 2];
        if (D2 >= r2 * r2 || !(D2 > 1e-6)) continue;
        if (2 * pairs + 2 > this.pairs.length) this.pairs = grow(this.pairs, 2 * pairs + 2, (m) => new Int32Array(m));
        const i = order[a], j = order[b];
        this.pairs[2 * pairs] = i; this.pairs[2 * pairs + 1] = j; pairs++;
        count[i + 1]++; count[j + 1]++;
      }
    }
    for (let i = 0; i < n; i++) {
      U[i * BEAD_FLOATS + 10] = count[i];
      U[i * BEAD_FLOATS + 11] = count[i + 1];
      count[i + 1] += count[i];
    }
    const nCuts = count[n];
    this.cuts = grow(this.cuts, nCuts * 4, (m) => new Float32Array(m));
    const c = this.cuts, P = this.pairs;
    // Each drop's next free slot, from its start.
    for (let i = 0; i < n; i++) count[i] = U[i * BEAD_FLOATS + 10];
    for (let k = 0; k < pairs; k++) {
      const i = P[2 * k], j = P[2 * k + 1];
      const dx = B[j * BEAD_FLOATS] - B[i * BEAD_FLOATS], dy = B[j * BEAD_FLOATS + 1] - B[i * BEAD_FLOATS + 1];
      const D = Math.sqrt(dx * dx + dy * dy), Ri = B[i * BEAD_FLOATS + 2], Rj = B[j * BEAD_FLOATS + 2];
      // The wall as each drop sees it: toward the other, its own apex.
      const wi = dropWall(Ri, Rj, D), ci = 4 * count[i]++;
      c[ci] = dx / D; c[ci + 1] = dy / D; c[ci + 2] = wi.apex; c[ci + 3] = wi.side * wi.rho;
      const wj = dropWall(Rj, Ri, D), cj = 4 * count[j]++;
      c[cj] = -dx / D; c[cj + 1] = -dy / D; c[cj + 2] = wj.apex; c[cj + 3] = wj.side * wj.rho;
    }
    return nCuts;
  }
}
