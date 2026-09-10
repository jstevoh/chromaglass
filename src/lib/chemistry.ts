/**
 * Mark Boyle's bench: reactions projected live.
 *
 * The Sensual Laboratory put acids, crystals and chemical reactions on the
 * projector platen instead of oil and water — patterns that grow from the
 * plate rather than flow across it. A Gray–Scott reaction–diffusion field
 * gives that: an activator that spreads and self-replicates into spots,
 * worms and coral, held in place while the dye it deposits is carried off
 * by the flow. The field is small and cheap; a handful of iterations a frame
 * is plenty at the rate the patterns need to move.
 */

export class ChemistryField {
  readonly u: Float32Array;
  readonly v: Float32Array;
  private readonly u2: Float32Array;
  private readonly v2: Float32Array;
  private uCur: Float32Array;
  private vCur: Float32Array;

  constructor(readonly size: number) {
    const n = size * size;
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.u2 = new Float32Array(n);
    this.v2 = new Float32Array(n);
    this.uCur = this.u;
    this.vCur = this.v;
    this.reset();
  }

  /** Substrate everywhere, activator nowhere; a few seeds so something grows. */
  reset(): void {
    this.uCur.fill(1);
    this.vCur.fill(0);
    for (let i = 0; i < 4; i++) {
      this.seed(0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, 3 + Math.random() * 3);
    }
  }

  /** Drop activator in a disc, in normalised coordinates. */
  seed(nx: number, ny: number, radius: number): void {
    const N = this.size;
    const cx = Math.round(nx * N), cy = Math.round(ny * N);
    const r = Math.ceil(radius);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > radius) continue;
        const i = x + y * N;
        this.vCur[i] = Math.max(this.vCur[i], 0.5 + 0.5 * (1 - d / radius));
        this.uCur[i] = Math.min(this.uCur[i], 0.5);
      }
    }
  }

  /** The live activator field (0..1). */
  get activator(): Float32Array {
    return this.vCur;
  }

  /**
   * Run `iters` Gray–Scott steps. `feed`/`kill` choose the regime: around
   * 0.055 / 0.062 the field grows coral; 0.037 / 0.065 divides like cells;
   * 0.026 / 0.051 sends out worms.
   */
  step(iters: number, feed = 0.042, kill = 0.062): void {
    const N = this.size;
    const Du = 0.16, Dv = 0.08;
    for (let it = 0; it < iters; it++) {
      const u = this.uCur, v = this.vCur;
      const un = u === this.u ? this.u2 : this.u;
      const vn = v === this.v ? this.v2 : this.v;
      for (let y = 1; y < N - 1; y++) {
        const row = y * N;
        for (let x = 1; x < N - 1; x++) {
          const i = row + x;
          const lu = u[i - 1] + u[i + 1] + u[i - N] + u[i + N] - 4 * u[i];
          const lv = v[i - 1] + v[i + 1] + v[i - N] + v[i + N] - 4 * v[i];
          const uvv = u[i] * v[i] * v[i];
          un[i] = u[i] + Du * lu - uvv + feed * (1 - u[i]);
          vn[i] = v[i] + Dv * lv + uvv - (feed + kill) * v[i];
        }
      }
      // Edges hold the substrate: nothing grows into the frame of the plate.
      for (let x = 0; x < N; x++) { un[x] = 1; vn[x] = 0; un[x + (N - 1) * N] = 1; vn[x + (N - 1) * N] = 0; }
      for (let y = 0; y < N; y++) { un[y * N] = 1; vn[y * N] = 0; un[N - 1 + y * N] = 1; vn[N - 1 + y * N] = 0; }
      this.uCur = un;
      this.vCur = vn;
    }
  }
}
