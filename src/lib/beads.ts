/**
 * Oil beads: the field of small oil droplets in the Fillmore stills.
 *
 * Oil shaken into water breaks into hundreds of beads that never quite
 * dissolve. Each is a small lens: a thin dark edge, paler than the dye around
 * it (oil takes none of it), with the light gathered in its middle. They
 * ride the flow a little behind it, crowd without overlapping, and
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

  /** A per-population offset for the patch field, so every plate clusters differently. */
  private patchSeed = Math.random() * 1000;

  /*
    The crowding step's scratch, kept from one step to the next (S13,
    docs/stability-plan.md). It ran every frame and made a Map, a Set and an
    array per occupied cell each time, all garbage by the end of the step —
    a few hundred small allocations a frame for as long as the beads are
    out. Emptied at the end of each step rather than the start, so no
    dropped or merged bead is kept alive by a bucket until the next one.
  */
  private readonly buckets = new Map<number, Bead[]>();
  private readonly spareLists: Bead[][] = [];
  private readonly gone = new Set<Bead>();

  constructor(private readonly grid: number) {}

  clear(): void { this.beads.length = 0; this.dirty = true; this.patchSeed = Math.random() * 1000; }

  /**
   * Where the beads gather: a smooth 0..1 field over the plate with a few
   * dense patches and near-empty stretches, the way an emulsion is uneven.
   * Two octaves of value noise on a coarse lattice (about six cells across
   * the plate), hashed from the population's seed.
   */
  private patchField(x: number, y: number): number {
    const N = this.grid;
    const h = (ix: number, iy: number) => { const t = Math.sin(ix * 127.1 + iy * 311.7 + this.patchSeed) * 43758.5453; return t - Math.floor(t); };
    const noise = (px: number, py: number) => {
      const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      return (h(ix, iy) * (1 - sx) + h(ix + 1, iy) * sx) * (1 - sy) + (h(ix, iy + 1) * (1 - sx) + h(ix + 1, iy + 1) * sx) * sy;
    };
    const u = x / N * 4, v = y / N * 4;
    const n = noise(u, v) * 0.7 + noise(u * 2.3 + 7.1, v * 2.3 + 3.7) * 0.3;
    // Stretch the contrast: value noise sits near 0.5 most of the time, and
    // a probability that only leans on it fills the plate evenly once the
    // dense patches are packed. Below the floor is bare glass.
    return Math.max(0, Math.min(1, (n - 0.4) / 0.32));
  }

  /**
   * Keep the population at `count`: spawn into gaps, retire the oldest
   * extras. Sizes follow a long tail (many small, a few big), and with a
   * density sampler the beads gather where the dye is thick, the way oil
   * beads collect in the oil rather than spreading evenly over the glass.
   *
   * The patch field is a hard mask, not a lean: where it is zero no bead is
   * ever placed, so the clear stretches stay clear even when the dense
   * patches are packed full and `count` cannot be reached (on the Mac the
   * old probability filled the plate evenly, since every bead the packed
   * patches refused landed in the gaps between them).
   */
  populate(count: number, sizeScale = 1, density?: (x: number, y: number) => number): void {
    const N = this.grid;
    while (this.beads.length > count) { this.beads.shift(); this.dirty = true; }
    let tries = 0;
    while (this.beads.length < count && tries++ < count * 6) {
      // Two populations: mostly small beads of clearly different sizes, and
      // a tail of big lenses; the small ones spread over a wider range than
      // before so the carpet is not one size.
      // Small beads span four to one in diameter within a patch, as in the
      // reference; the big lenses are a tail on top.
      const u = Math.random();
      const r = (Math.random() < 0.8 ? 0.45 + Math.random() * Math.random() * 2.6 : 1.8 + u * u * 3.4) * sizeScale * (N / 192);
      let x = 4 + Math.random() * (N - 8), y = 4 + Math.random() * (N - 8);
      if (density) {
        let best = density(x, y);
        for (let t = 0; t < 3; t++) {
          const px = 4 + Math.random() * (N - 8), py = 4 + Math.random() * (N - 8);
          const d = density(px, py);
          if (d > best) { best = d; x = px; y = py; }
        }
      }
      // Patches: none where the field is zero, dense where it is high, and
      // packed tighter there (the crowding step keeps them from overlapping).
      const p = this.patchField(x, y);
      if (p <= 0 || Math.random() > p) continue;
      const gap = 1.3 - 0.3 * p;
      let ok = true;
      for (const b of this.beads) { const dx = b.x - x, dy = b.y - y; if (dx * dx + dy * dy < (b.r + r) * (b.r + r) * gap) { ok = false; break; } }
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
    /*
      A bead that has gone to NaN is dropped, here, before anything draws it.

      Nothing in this class can bring one back. `b.x += …` keeps NaN forever,
      and the sampler the caller passes clamps with
      `Math.max(0, Math.min(N - 1, Math.round(x)))` — which looks like it
      would catch this and does not: `Math.round(NaN)` is NaN, `Math.min` and
      `Math.max` pass NaN straight through, an array indexed by NaN is
      `undefined`, and `undefined * k` is NaN again. So one bad bead is bad
      for the rest of the show.

      And it took the show with it. `render` asks for a radial gradient at the
      bead's centre, `createRadialGradient` throws on a non-finite argument,
      and that throw is inside the frame loop: the canvas stops and React
      carries on, so the desk still works and the plate is frozen. That is the
      failure this guard exists to prevent — the picture should lose a bead,
      not stop.
    */
    let bad = 0;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.r)) { bs.splice(i, 1); bad++; }
    }
    if (bad > 0) {
      this.dirty = true;
      console.warn(`ChromaGlass: dropped ${bad} bead(s) that went non-finite.`);
    }
    // Crowding: beads touching push apart; two pressed hard together merge.
    // A bucket at least as wide as the furthest two beads can reach each
    // other (1.3 × two of the biggest), so the 3 × 3 search never misses one.
    let maxR = 0;
    for (const b of bs) if (b.r > maxR) maxR = b.r;
    const cell = Math.max(8, Math.ceil(maxR * 2.6));
    const buckets = this.buckets, gone = this.gone, spare = this.spareLists;
    for (const b of bs) {
      const k = Math.floor(b.x / cell) + Math.floor(b.y / cell) * 4096;
      let list = buckets.get(k); if (!list) { list = spare.pop() ?? []; buckets.set(k, list); }
      list.push(b);
    }
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
          /*
            Oil beads meet rim to rim and stay there: two beads share a border,
            they do not slide over each other. This used to rest them at 55-90%
            of the touching distance, which read on the plate as rings drawn
            through one another. Now they rest just touching (the per-bead
            spread is a few percent, so the crowd is still not a honeycomb:
            the sizes already see to that) and a bead a little way off is drawn
            in to meet its neighbour, which is what makes them bunch.
          */
          const touch = b.r + o.r;
          const want = touch * (0.96 + 0.06 * b.seed);
          if (d >= touch * 1.3) continue;
          if (d < touch * 0.7 && touch < 7 && Math.random() < 0.02) {
            // Merge: pressed hard together, the larger takes the smaller's area.
            const big = b.r >= o.r ? b : o, small = big === b ? o : b;
            big.r = Math.sqrt(big.r * big.r + small.r * small.r);
            gone.add(small);
            continue;
          }
          // Apart when overlapping, firmly; together when near, gently. Each
          // pair is visited from both ends, so each move is half of it.
          const move = d < want ? (want - d) * 0.25 : -Math.min(d - want, touch * 0.3) * Math.min(1, dt * 1.5) * 0.5;
          b.x -= dx / d * move; b.y -= dy / d * move;
          o.x += dx / d * move; o.y += dy / d * move;
        }
      }
    }
    if (gone.size) { for (let i = bs.length - 1; i >= 0; i--) if (gone.has(bs[i])) bs.splice(i, 1); }
    for (const list of buckets.values()) { list.length = 0; spare.push(list); }
    buckets.clear();
    gone.clear();
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
    /*
      Belt as well as braces: `step` drops a non-finite bead, and this is
      what happens if one arrives another way.

      `createRadialGradient` throws on a non-finite argument, and this runs
      inside the frame loop, so that throw does not lose a bead — it stops the
      canvas. React keeps going, so the desk stays live and the picture
      freezes, which is a very confusing thing to be looking at.
    */
    const drawable = (b: Bead): boolean =>
      Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.r) && Number.isFinite(k);
    // Interiors first, then rims over them; the texture's y is flipped on upload.
    for (const b of this.beads) {
      if (!drawable(b)) continue;
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
      if (!drawable(b)) continue;
      const fade = Math.min(1, b.age / 0.6);
      const rr = Math.max(1, b.r * k);
      ctx.globalAlpha = fade * (0.8 + 0.2 * b.seed);
      // Thin: an oil bead's edge is a fine line, not a bubble's heavy ring.
      ctx.lineWidth = Math.max(1, rr * 0.12);
      ctx.beginPath(); ctx.arc(b.x * k, b.y * k, rr - ctx.lineWidth * 0.5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.dirty = false;
    return this.canvas;
  }
}
