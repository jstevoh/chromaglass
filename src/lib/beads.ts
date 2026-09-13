/**
 * Oil beads: the field of small dark-rimmed droplets in the Fillmore stills.
 *
 * Oil shaken into water breaks into hundreds of beads that never quite
 * dissolve. Each shows a dark meniscus ring with the ground colour inside,
 * they ride the flow a little behind it, crowd without overlapping, and
 * now and then two touch and become one. The solver has no second phase,
 * so, like the bubbles, they live here as particles; unlike the bubbles
 * they are drawn as a mask texture (hundreds of them, too many for
 * uniforms) that the shader reads for the rim and the interior.
 */
export interface Bead {
  x: number;   // logical grid cells
  y: number;
  r: number;   // radius, cells
  age: number;
  /** A per-bead random for a little variety in the rim. */
  seed: number;
}

/** Solver velocity units → cells per second (see bubbles.ts). */
const CELLS_PER_UNIT = 0.05 * 190 * 60;

export class BeadField {
  readonly beads: Bead[] = [];
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  /** True when the mask changed since it was last uploaded. */
  dirty = true;
  readonly size = 512;

  constructor(private readonly grid: number) {}

  clear(): void { this.beads.length = 0; this.dirty = true; }

  /**
   * Keep the population at `count`: spawn into gaps, retire the oldest
   * extras. Sizes follow a long tail (many small, a few big), and with a
   * density sampler the beads gather where the dye is thick, the way oil
   * beads collect in the oil rather than spreading evenly over the glass.
   */
  populate(count: number, sizeScale = 1, density?: (x: number, y: number) => number): void {
    const N = this.grid;
    while (this.beads.length > count) { this.beads.shift(); this.dirty = true; }
    let tries = 0;
    while (this.beads.length < count && tries++ < count * 4) {
      const u = Math.random();
      const r = (0.6 + u * u * u * 4.2) * sizeScale * (N / 192);
      let x = 4 + Math.random() * (N - 8), y = 4 + Math.random() * (N - 8);
      if (density) {
        let best = density(x, y);
        for (let t = 0; t < 3; t++) {
          const px = 4 + Math.random() * (N - 8), py = 4 + Math.random() * (N - 8);
          const d = density(px, py);
          if (d > best) { best = d; x = px; y = py; }
        }
      }
      let ok = true;
      for (const b of this.beads) { const dx = b.x - x, dy = b.y - y; if (dx * dx + dy * dy < (b.r + r) * (b.r + r) * 1.1) { ok = false; break; } }
      if (ok) { this.beads.push({ x, y, r, age: 0, seed: Math.random() }); this.dirty = true; }
    }
  }

  /** Something landed or pressed at (x, y): shove the beads out of its way. */
  disturb(x: number, y: number, r: number, strength = 1): void {
    for (const b of this.beads) {
      const dx = b.x - x, dy = b.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r * 2 || d < 1e-3) continue;
      const push = (1 - d / (r * 2)) * r * 0.6 * strength;
      b.x += dx / d * push;
      b.y += dy / d * push;
    }
    this.dirty = true;
  }

  step(dt: number, velocity: (x: number, y: number) => [number, number], tiltX: number, tiltY: number): void {
    const N = this.grid;
    const bs = this.beads;
    if (bs.length === 0) return;
    for (const b of bs) {
      const [vx, vy] = velocity(b.x, b.y);
      // Heavier than the dye: they lag the flow and drift little on their own.
      b.x += (vx * CELLS_PER_UNIT * 0.8 - tiltX * 500) * dt + (Math.random() - 0.5) * 0.15;
      b.y += (vy * CELLS_PER_UNIT * 0.8 - tiltY * 500) * dt + (Math.random() - 0.5) * 0.15;
      b.age += dt;
    }
    // Crowding: beads touching push apart; two pressed hard together merge.
    const cell = 8;
    const buckets = new Map<number, Bead[]>();
    for (const b of bs) {
      const k = Math.floor(b.x / cell) + Math.floor(b.y / cell) * 4096;
      let list = buckets.get(k); if (!list) { list = []; buckets.set(k, list); }
      list.push(b);
    }
    const gone = new Set<Bead>();
    for (const b of bs) {
      if (gone.has(b)) continue;
      const cx = Math.floor(b.x / cell), cy = Math.floor(b.y / cell);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const list = buckets.get(cx + i + (cy + j) * 4096);
        if (!list) continue;
        for (const o of list) {
          if (o === b || gone.has(o)) continue;
          const dx = o.x - b.x, dy = o.y - b.y;
          const d = Math.hypot(dx, dy) || 1e-3;
          // Not a honeycomb: only a hard overlap pushes apart, and by an
          // amount that differs per bead, so the crowd stays irregular.
          const want = (b.r + o.r) * (0.55 + 0.35 * b.seed);
          if (d >= want) continue;
          if (d < (b.r + o.r) * 0.45 && b.r + o.r < 7 && Math.random() < 0.02) {
            // Merge: the larger takes the smaller's area.
            const big = b.r >= o.r ? b : o, small = big === b ? o : b;
            big.r = Math.sqrt(big.r * big.r + small.r * small.r);
            gone.add(small);
            continue;
          }
          const push = (want - d) * 0.15;
          b.x -= dx / d * push; b.y -= dy / d * push;
          o.x += dx / d * push; o.y += dy / d * push;
        }
      }
    }
    if (gone.size) { for (let i = bs.length - 1; i >= 0; i--) if (gone.has(bs[i])) bs.splice(i, 1); }
    for (const b of bs) { b.x = Math.max(2, Math.min(N - 3, b.x)); b.y = Math.max(2, Math.min(N - 3, b.y)); }
    this.dirty = true;
  }

  /**
   * Draw the mask: red = interior, green = rim (the dark meniscus ring),
   * blue = a dome ramp (1 at the centre, 0 at the rim) for the lamp to catch,
   * in fluid uv (x right, y up: row 0 of the texture is y = 0). Returns the
   * canvas to upload, or null when nothing changed.
   */
  render(): HTMLCanvasElement | OffscreenCanvas | null {
    if (!this.dirty) return null;
    if (!this.canvas) {
      this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(this.size, this.size) : Object.assign(document.createElement('canvas'), { width: this.size, height: this.size });
      this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    }
    const ctx = this.ctx!;
    const S = this.size, k = S / this.grid;
    ctx.clearRect(0, 0, S, S);
    ctx.lineJoin = 'round';
    // Interiors first, then rims over them; the texture's y is flipped on upload.
    for (const b of this.beads) {
      const fade = Math.min(1, b.age / 0.6);
      const rr = Math.max(1, b.r * k);
      ctx.globalAlpha = fade;
      const grad = ctx.createRadialGradient(b.x * k, b.y * k, 0, b.x * k, b.y * k, rr);
      grad.addColorStop(0, 'rgb(255,0,255)');
      grad.addColorStop(1, 'rgb(255,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(b.x * k, b.y * k, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgb(0,255,0)';
    for (const b of this.beads) {
      const fade = Math.min(1, b.age / 0.6);
      const rr = Math.max(1, b.r * k);
      ctx.globalAlpha = fade * (0.8 + 0.2 * b.seed);
      ctx.lineWidth = Math.max(1.2, rr * 0.28);
      ctx.beginPath(); ctx.arc(b.x * k, b.y * k, rr - ctx.lineWidth * 0.5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.dirty = false;
    return this.canvas;
  }
}
