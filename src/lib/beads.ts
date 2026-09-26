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
import { makeRng, showSeed, stream, type Rng } from './rng';

export interface Bead {
  x: number;   // logical grid cells
  y: number;
  r: number;   // radius, cells
  age: number;
  /** A per-bead random for a little variety in the rim. */
  seed: number;
  /**
   * The colour this drop is, as it is seen lit (0..1), once drops are asked
   * for (`beadDrops`, PLAN.md batch 3). Eased toward its slot in the palette
   * on every step, so a look change recolours the drops over a second and a
   * half rather than in one frame. Absent until the field has a palette.
   */
  color?: [number, number, number];
  /**
   * A smaller drop this one swallowed and kept: the compound drop. Where it
   * sits is an offset from this drop's centre, in cells, and it keeps its own
   * colour; a drop holds one, and a later merge keeps the larger. It shrinks
   * away over `innerLife` seconds (`age` is how long it has been held).
   */
  inner?: { dx: number; dy: number; r: number; seed: number; color: [number, number, number]; age: number };
  /**
   * A droplet: one of the crowd of tiny drops that sits round the big ones
   * once drops are asked for (`populate`). Kept apart from the population
   * `count` asks for, and never swallowed whole by a neighbour.
   */
  tiny?: true;
}

/**
 * How long a drop holds the one it swallowed before the skin between them
 * gives and the two are one colour: fifteen to thirty-five seconds, by the
 * passenger's own seed. Held forever, they only accumulate: a plate that a
 * current keeps gathering into three points has a passenger in two drops of
 * every five by twenty seconds, which is a field of eyes where the reference
 * has a compound drop here and there. With a life, the same plate has 140 of
 * 336 at twenty seconds, when the first rush has just been swallowed, and 22
 * of 347 at two minutes; a plate that only swirls makes almost none (one, once,
 * in two minutes), because a drop is swallowed where drops are driven
 * together and not where they merely pass.
 */
export function innerLife(seed: number): number { return 15 + 20 * seed; }

/** How long a drop takes to take on a new look's colour: a look fade's order. */
const RECOLOUR_S = 1.5;
/** Droplets per bead the population asks for, at full drops (see `populateTiny`). */
const TINY_SHARE = 0.8;

/**
 * Which palette entry a drop takes. From the bead's own seed rather than a
 * new random draw, so a drop keeps its slot through every look and nothing
 * here moves the random stream the rest of the plate draws from. Spread by a
 * large odd multiplier because `seed` also sets the rim's alpha and the rest
 * spacing, and a drop's colour should not follow either.
 */
export function paletteSlot(seed: number, n: number): number {
  if (n <= 0) return 0;
  const t = seed * 97.13;
  return Math.min(n - 1, Math.floor((t - Math.floor(t)) * n));
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

  /**
   * How far the beads have gone from dark-rimmed rings to full drops
   * (`beadDrops`, 0..1). At 0 every line of arithmetic below is the one the
   * rings always ran and the mask is drawn by the same canvas calls, so a look
   * made before drops existed is the same picture; the drop path is a
   * separate branch rather than a blend inside the old one for that reason.
   */
  get drops(): number { return this.dropAmt; }
  /**
   * Crossing zero changes which mask is drawn (square rings, wide drops), so
   * it asks for a redraw: the mask is otherwise only redrawn when the beads
   * move, and a paused or draining plate does not step, which left the
   * slider doing nothing until the plate moved again. Anything not a number
   * is 0, since a NaN here would reach the crowding arithmetic and stop the
   * rings pushing apart at all.
   */
  set drops(v: number) {
    const next = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    if ((next > 0) !== (this.dropAmt > 0)) this.dirty = true;
    this.dropAmt = next;
  }
  private dropAmt = 0;
  /** The colours drops are dyed from: the look's palette, as seen (0..1). */
  private palette: [number, number, number][] = [];
  /** The drop mask's pixels and its scratch, kept between frames (see `rasterDrops`). */
  private dropPixels: Uint8ClampedArray | null = null;
  private dropOwn: Float32Array | null = null;
  private dropIds: Int32Array | null = null;

  /**
   * A per-population offset for the patch field, so every plate clusters differently.
   *
   * The first one is drawn from a generator of its own, keyed on the show's
   * seed, and not from `rng`. The visualizer builds this object as
   * `useRef(new BeadField(…))`, which constructs one on every React render
   * and throws all but the first away; a draw here from the shared stream
   * would move the beads' sequence once per render, and how often React
   * renders is nothing a replay can reproduce. `npm run seed` builds one and
   * checks the stream did not move.
   */
  private patchSeed = makeRng(showSeed(), 'plate.beads', 'opening').float() * 1000;

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

  /**
   * `rng` is where every bead's size, place, wander and merge comes from:
   * the show's `plate.beads` stream unless a check hands in its own, so the
   * same seed lays the same carpet (lib/rng.ts, `npm run seed`).
   */
  constructor(private readonly grid: number, private readonly rng: Rng = stream('plate.beads')) {}

  clear(): void { this.beads.length = 0; this.dirty = true; this.patchSeed = this.rng.float() * 1000; }

  /**
   * The look's colours. Held, not applied: each drop eases toward its slot in
   * `step`, so a new palette arrives as the drops recolour rather than as a
   * cut, and a drop born now takes its colour at once.
   */
  setPalette(colors: readonly { r: number; g: number; b: number }[]): void {
    this.palette = colors.map(c => [c.r, c.g, c.b]);
  }

  /** Whether the field has been handed a palette yet: until it has, drops are drawn white. */
  get hasPalette(): boolean { return this.palette.length > 0; }

  private slotColour(seed: number): [number, number, number] | undefined {
    const p = this.palette;
    return p.length ? p[paletteSlot(seed, p.length)] : undefined;
  }

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
    // With no droplets (always, at drops 0) the population is the beads, as it
    // always was, and so is every line and every draw below.
    const tinies = this.beads.reduce((n, b) => n + (b.tiny ? 1 : 0), 0);
    const want = tinies ? count + tinies : count;
    while (this.beads.length > want) {
      const i = this.beads.findIndex((b) => !b.tiny);
      if (i < 0) break;
      this.beads.splice(i, 1); this.dirty = true;
    }
    let tries = 0;
    while (this.beads.length - tinies < count && tries++ < count * 6) {
      // Two populations: mostly small beads of clearly different sizes, and
      // a tail of big lenses; the small ones spread over a wider range than
      // before so the carpet is not one size.
      // Small beads span four to one in diameter within a patch, as in the
      // reference; the big lenses are a tail on top.
      const u = this.rng.float();
      const r = (this.rng.float() < 0.8 ? 0.45 + this.rng.float() * this.rng.float() * 2.6 : 1.8 + u * u * 3.4) * sizeScale * (N / 192);
      let x = 4 + this.rng.float() * (N - 8), y = 4 + this.rng.float() * (N - 8);
      if (density) {
        let best = density(x, y);
        for (let t = 0; t < 3; t++) {
          const px = 4 + this.rng.float() * (N - 8), py = 4 + this.rng.float() * (N - 8);
          const d = density(px, py);
          if (d > best) { best = d; x = px; y = py; }
        }
      }
      // Patches: none where the field is zero, dense where it is high, and
      // packed tighter there (the crowding step keeps them from overlapping).
      const p = this.patchField(x, y);
      if (p <= 0 || this.rng.float() > p) continue;
      const gap = 1.3 - 0.3 * p;
      let ok = true;
      for (const b of this.beads) { const dx = b.x - x, dy = b.y - y; if (dx * dx + dy * dy < (b.r + r) * (b.r + r) * gap) { ok = false; break; } }
      if (ok) {
        const seed = this.rng.float();
        const c = this.drops > 0 ? this.slotColour(seed) : undefined;
        this.beads.push(c ? { x, y, r, age: 0, seed, color: [c[0], c[1], c[2]] } : { x, y, r, age: 0, seed });
        this.dirty = true;
      }
    }
    if (this.drops > 0 || tinies > 0) this.populateTiny(Math.round(count * TINY_SHARE * this.drops), sizeScale);
  }

  /*
    The droplets. The owner, on a macro photograph of oil on water: "there
    are also a great diversity of bubble sizes". There, a big drop is ringed
    by droplets a twentieth its size and less, packed into every gap round
    it, where this field's smallest bead was a tenth of its biggest and
    stood about in the open like the rest. Oil breaking up leaves them: a
    thread pinching off between two drops sheds a satellite (Rayleigh and
    Plateau), and they stay because a small drop against a big one drains
    the film between them slowly.

    So, with drops on, a second population of `count` times TINY_SHARE
    (scaled by the slider), each a third of a cell to most of one (one to
    two and a half pixels of the mask: a quarter of a cell, tried first,
    is under a pixel, and the mask drew those as smudges and spikes where
    they met a big drop), born against the rim of a drop that is already there
    and left to the crowding to settle. Retired oldest first like the rest,
    and none at all at drops 0, so the rings' field is the rings' to the
    draw.
  */
  private populateTiny(target: number, sizeScale: number): void {
    const N = this.grid;
    let have = 0;
    for (const b of this.beads) if (b.tiny) have++;
    while (have > target) {
      const i = this.beads.findIndex((b) => b.tiny);
      this.beads.splice(i, 1); have--; this.dirty = true;
    }
    const hosts = this.beads.filter((b) => !b.tiny && b.r >= 1.2 * (N / 192));
    if (!hosts.length) return;
    // Round the big drops most: a host is taken in proportion to its area,
    // as the photographs have the droplets thickest round the biggest drops.
    const rMax = hosts.reduce((m, b) => Math.max(m, b.r), 0);
    let tries = 0;
    while (have < target && tries++ < target * 8) {
      const host = hosts[Math.floor(this.rng.float() * hosts.length)];
      if (this.rng.float() > (host.r / rMax) ** 3) continue;
      const u = this.rng.float();
      const r = (0.35 + u * u * 0.55) * sizeScale * (N / 192);
      const a = this.rng.float() * Math.PI * 2;
      const d = host.r + r + 0.05;
      const x = host.x + Math.cos(a) * d, y = host.y + Math.sin(a) * d;
      if (x < 2 || y < 2 || x > N - 2 || y > N - 2) continue;
      let ok = true;
      for (const b of this.beads) {
        if (b === host) continue;
        const dx = b.x - x, dy = b.y - y;
        if (dx * dx + dy * dy < (b.r + r) * (b.r + r)) { ok = false; break; }
      }
      if (!ok) continue;
      const seed = this.rng.float();
      const c = this.slotColour(seed);
      this.beads.push(c ? { x, y, r, age: 0, seed, color: [c[0], c[1], c[2]], tiny: true } : { x, y, r, age: 0, seed, tiny: true });
      have++; this.dirty = true;
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
      b.x += (vx * CELLS_PER_UNIT * 0.8 - tiltX * 500) * dt + this.rng.centred() * 0.15;
      b.y += (vy * CELLS_PER_UNIT * 0.8 - tiltY * 500) * dt + this.rng.centred() * 0.15;
      b.age += dt;
      if (b.inner && (b.inner.age += dt) >= innerLife(b.inner.seed)) delete b.inner;
    }
    if (this.drops > 0 && this.palette.length) {
      const k = Math.min(1, dt / RECOLOUR_S);
      const ease = (c: [number, number, number], seed: number) => {
        const t = this.slotColour(seed)!;
        c[0] += (t[0] - c[0]) * k; c[1] += (t[1] - c[1]) * k; c[2] += (t[2] - c[2]) * k;
      };
      for (const b of bs) {
        if (b.color) ease(b.color, b.seed); else { const t = this.slotColour(b.seed)!; b.color = [t[0], t[1], t[2]]; }
        if (b.inner) ease(b.inner.color, b.inner.seed);
      }
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
          /*
            Drops press into each other and flatten where they meet, the way
            foam packs, and the mask (`rasterDrops`) cuts the overlap along one
            straight wall rather than drawing two circles through each other.

            How far in is set by the *smaller* of the two, not by the pair: two
            equal drops rest a fifth of their reach into each other, and a
            small drop against a big one presses in by as much as it would
            against its own size. Scaled by the pair instead, a bead a sixth
            the size of its neighbour was pushed past the big one's rim, the
            wall landed beyond its middle, and the mask drew most of it as its
            neighbour: small drops vanished into big ones wherever they
            touched, which `npm run drops` caught as a drop the wrong colour.

            The merge is moved by the same amount, so a pair must still be
            pressed as far past its rest as the rings had to be before two
            become one. Without that, drops merged half as often again as rings
            on the same plate (598 against 391 over twenty crowded seconds),
            only because they sit closer. At 0 both are the rings' numbers
            exactly: the press is a subtraction of zero.
          */
          const press = 0.4 * this.drops * Math.min(b.r, o.r);
          const want = touch * (0.96 + 0.06 * b.seed) - press;
          if (d >= touch * 1.3) continue;
          /*
            With drops on, a small drop (under half the other's radius) whose
            middle has been pushed inside a bigger one is taken in, at once. A current that gathers drops can
            squeeze a small one into the gap between big ones faster than the
            pushing apart can clear it, and the one left inside a neighbour's
            rim is not two drops touching: it is a drop that went in. That is
            also where most compound drops come from. Asked first and without
            a draw, so at 0 the random stream is the rings' to the draw.

            Only into a drop no bigger than the population's own big lenses
            (the tail `populate` draws tops out near five cells at 192²).
            Without that cap a slow current into one point is a snowball: the
            drop at the point eats everything the current brings it, and in
            twenty crowded seconds one reached thirty-nine cells, a sixth of
            the plate, where the rings' biggest was under eight.
          */
          const big = Math.max(b.r, o.r);
          // How deep counts as inside scales with the slider, so the first
          // notch swallows almost nothing and the rule grows in with the rest.
          const inside = this.drops > 0 && d < big * this.drops && Math.min(b.r, o.r) < 0.5 * big && big < 6 * (this.grid / 192);
          // A droplet is never taken in by a drop: it is what the crowd is
          // ringed with, and one swallowed is a passenger too small to see
          // (npm run drops counted two in a hundred drawn as nothing). Two
          // droplets pressed together do run into one, as droplets do, or a
          // current packs them on top of each other, and one in six lost its
          // own middle to a neighbour.
          const smaller = b.r < o.r ? b : o, larger = smaller === b ? o : b;
          // Droplets merge only with droplets: a bead can be smaller than a
          // droplet, and a droplet that took one in carried it as a passenger
          // (eighteen did on the drops check's crowd).
          const takes = !!smaller.tiny === !!larger.tiny;
          if (takes && (inside || (d < touch * 0.7 - press && touch < 7 && this.rng.float() < 0.02) || (smaller.tiny && d < touch * 0.6))) {
            // Merge: pressed hard together, the larger takes the smaller's area.
            const big = b.r >= o.r ? b : o, small = big === b ? o : b;
            const bigR = big.r;
            big.r = Math.sqrt(big.r * big.r + small.r * small.r);
            // Droplets that have run together into a drop of a cell are a
            // drop: without this one kept taking in every droplet it touched
            // and reached thirty-five cells (npm run drops).
            if (big.tiny && big.r > this.grid / 192) delete big.tiny;
            /*
              A compound drop: with drops on, the one swallowed stays visible
              inside the one that swallowed it, where it went in, the way a
              drop of one oil caught in another keeps its own skin for a
              while. Only a clearly smaller one (a near-equal pair is two
              halves of one drop, not one inside another), and a drop holds
              one: a second merge keeps whichever is larger.
            */
            if (this.drops > 0 && !small.tiny && !big.tiny && small.r < bigR * 0.7 && (!big.inner || big.inner.r < small.r)) {
              let dx = small.x - big.x, dy = small.y - big.y;
              const room = Math.max(0, (big.r - small.r) * 0.8);
              const dl = Math.hypot(dx, dy);
              if (dl > room) { dx *= room / dl; dy *= room / dl; }
              const c = small.color ?? this.slotColour(small.seed) ?? [1, 1, 1];
              big.inner = { dx, dy, r: small.r, seed: small.seed, color: [c[0], c[1], c[2]], age: 0 };
            } else if (big.inner) {
              // The drop grew round what it holds; keep it inside the new rim.
              const room = Math.max(0, (big.r - big.inner.r) * 0.8), dl = Math.hypot(big.inner.dx, big.inner.dy);
              if (dl > room) { big.inner.dx *= room / dl; big.inner.dy *= room / dl; }
            }
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
    /*
      Last, a droplet the crowd has pushed inside a drop's rim is put back
      on it. Left there, the wall the mask draws between the two is a
      straight line through the big drop rather than round the droplet, and
      everything past it the droplet does not cover belongs to nobody: a
      hole in the drop (npm run drops found passengers in two). Done after
      the pushing, since a push from a third drop could put it back inside
      within the same step. Nothing to do without droplets, so the rings
      never come here.
    */
    if (bs.some((b) => b.tiny)) {
      for (const t of bs) {
        if (!t.tiny) continue;
        for (const o of bs) {
          if (o.tiny || o === t) continue;
          const dx = t.x - o.x, dy = t.y - o.y;
          if (Math.abs(dx) > o.r || Math.abs(dy) > o.r) continue;
          const d = Math.hypot(dx, dy);
          if (d >= o.r) continue;
          // Out along the line from the drop's centre (any way at all from the
          // centre itself), to sit a little into its rim.
          const ux = d > 1e-3 ? dx / d : 1, uy = d > 1e-3 ? dy / d : 0, to = o.r + t.r * 0.6;
          t.x = o.x + ux * to; t.y = o.y + uy * to;
        }
      }
    }
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
    if (this.drops > 0) return this.renderDrops();
    if (!this.canvas || this.canvas.width !== this.size) {
      this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(this.size, this.size) : Object.assign(document.createElement('canvas'), { width: this.size, height: this.size });
      this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    }
    const ctx = this.ctx!;
    const S = this.size, k = S / this.grid;
    /*
      Opaque black under everything, as the drops' mask has (rasterDrops).
      The canvas keeps its pixels premultiplied and the upload hands the
      texture straight alpha, so on a clear canvas every texel a bead's
      antialiased edge touched came back fully red however little of it
      the bead covered, its dome divided back up to noise, and a bead's age
      fade never reached the red at all. At 3x the lens and the edge line
      read those texels as a staircase of dark squares round every bead.
      Drawn over black, the red is coverage times fade, which is what the
      shader was always told it was.
    */
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
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
    /*
      The rims go into green alone, added, as the drops' mask keeps them
      (rasterDrops). Laid over the interiors in the ordinary way, a rim at
      nine tenths alpha took nine tenths of the red and the blue under it, so
      the outer tenth of every bead read to the shader as barely a bead and
      its dome as a tenth of itself: the lens found a centre ten radii away
      and showed a piece of plate from there, a pale fleck on the rim, and
      the contact line was drawn at a tenth of its strength (npm run droplens).
    */
    ctx.globalCompositeOperation = 'lighter';
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
    ctx.globalCompositeOperation = 'source-over';
    this.dirty = false;
    return this.canvas;
  }

  /**
   * The drops' mask, twice as wide as the rings': the left half is the same
   * three channels the rings draw (interior, rim, dome), the right half each
   * drop's colour. One picture rather than a second texture because the
   * plate's pass already binds sixteen sampled textures, which is WebGPU's
   * default ceiling per stage; the shader tells the two layouts apart by the
   * texture's shape, so the rings' square mask still reads as it always did.
   */
  private renderDrops(): HTMLCanvasElement | OffscreenCanvas | null {
    const S = this.size;
    if (!this.canvas || this.canvas.width !== S * 2) {
      this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S * 2, S) : Object.assign(document.createElement('canvas'), { width: S * 2, height: S });
      this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    }
    if (!this.dropPixels) { this.dropPixels = new Uint8ClampedArray(S * 2 * S * 4); this.dropOwn = new Float32Array(S * S); this.dropIds = new Int32Array(S * S); }
    rasterDrops(this.beads, this.grid, S, this.dropPixels, this.dropOwn!, this.dropIds!, this.drops);
    // A fresh ImageData over the kept buffer: putImageData copies, so the
    // buffer is free to be drawn into again next frame.
    this.ctx!.putImageData(new ImageData(this.dropPixels as Uint8ClampedArray<ArrayBuffer>, S * 2, S), 0, 0);
    this.dirty = false;
    return this.canvas;
  }
}

/**
 * The drops' mask, drawn a pixel at a time into `out` (RGBA, `2S` wide and
 * `S` high). `own` and `ids` are S x S scratch: how covered each pixel is,
 * and which drop has it (its index plus one, 0 for none), which is what keeps
 * a compound drop's passenger inside its own drop and not its neighbour's.
 * Pure: no canvas and no DOM, so `npm run drops` measures exactly what the
 * app uploads. `amount` is `beadDrops`: a passenger is drawn in by it, so the
 * slider's first notch does not put a second ring inside a third of the
 * lenses while the shading is still almost all rings.
 *
 * Left half, per pixel of a drop: red is the interior times the drop's
 * fade-in, green the rim, blue the dome times red, which is what the rings'
 * canvas draws and what `dropLens` in the plate shader reads. Right half: the
 * drop's colour.
 *
 * Why per pixel and not the canvas the rings use: a drop that is pressed
 * against a neighbour is cut flat along the line where the two are equally
 * deep (the power line of the two circles, which for equal drops is the
 * perpendicular bisector and for unequal ones sits nearer the smaller), and
 * its dome has to fall to zero along that cut, not only at its round edge.
 * A radial gradient clipped by a half-plane would leave the dome standing at
 * full height against the wall, and the lens, which finds a drop's middle
 * from the dome's slope, would see a cliff. Here "distance to the edge" is
 * the least of the distance to the circle and to every cut, which is the
 * dome of a flattened drop, and the rim follows the wall as well.
 *
 * Every drop's colour is also written a pixel past its edge, where no other
 * drop owns the pixel, which is as far as a bilinear read reaches: the
 * plate's read at a rim never mixes a drop with the black around it.
 */
/** Pixels inside a drop's circle but past one of its walls (see the holes in `rasterDrops`), and their list, kept between calls. */
let holes = new Uint8Array(0);
let holeList = new Int32Array(0);
/*
  The wall between two pressed drops, as the drop of radius R sees it, its
  neighbour of radius Rj a distance D away along a unit direction e.

  Not a straight line. A drop's pressure is its tension over its radius, so
  a small drop pushes harder than a big one, and the film between them bows
  into the big one: an arc of radius Rs Rb / (Rb - Rs), the difference of the
  two pressures over the film's tension (the research in the project's
  shared files, drops/research/bubbles-and-drops.md, item 6). It passes
  through the two points where the circles cross, the same ends the straight
  power line had, so the walls still meet the round edges where they did;
  only the middle moves, by the arc's sagitta. In packed foams and emulsions
  small cells are round-sided and bulge into big ones; straight walls read
  as a Voronoi diagram. Between drops of a size (the arc flatter than fifty
  times their reach) it is the straight line it was.

  The wall's apex, where it crosses the line of centres, is held at least a
  third of a radius (and a pixel) from either centre, as the straight wall
  was, so a drop pressed hard into a bigger one keeps its middle; the arc
  moves with it. Seen from the other drop the same arc comes out, so the two
  still share every pixel of their overlap exactly.

  Returns the apex's distance along e, and the arc: its radius (0 for a
  straight wall) and which side of it is this drop's (+1 inside the arc's
  circle, when this is the smaller drop; -1 outside).
*/
export function dropWall(R: number, Rj: number, D: number): { apex: number; rho: number; side: number } {
  const lo = Math.max(1, 0.35 * R), hi = D - Math.max(1, 0.35 * Rj);
  const t = (D * D + R * R - Rj * Rj) / (2 * D);
  const small = Math.min(R, Rj), big = Math.max(R, Rj);
  const rho = big - small > 1e-9 ? small * big / (big - small) : Infinity;
  let apex = t, side = 0;
  if (rho < 50 * (R + Rj)) {
    const h2 = Math.max(0, R * R - t * t);
    const sag = rho - Math.sqrt(Math.max(0, rho * rho - h2));
    side = R < Rj ? 1 : -1;
    apex = t + side * sag;
  }
  apex = lo <= hi ? Math.min(hi, Math.max(lo, apex)) : (lo + hi) / 2;
  return { apex, rho: side === 0 ? 0 : rho, side };
}

export function rasterDrops(beads: readonly Bead[], grid: number, S: number, out: Uint8ClampedArray, own: Float32Array, ids: Int32Array, amount = 1): void {
  const W = S * 2;
  // Opaque black everywhere: alpha stays 255 so the upload never divides a
  // premultiplied edge back out.
  new Uint32Array(out.buffer, out.byteOffset, W * S).fill(0xff000000);
  own.fill(0);
  ids.fill(0);
  if (holes.length !== S * S) { holes = new Uint8Array(S * S); holeList = new Int32Array(S * S); }
  holes.fill(0);
  let nHoles = 0;
  const k = S / grid;
  const n = beads.length;
  const cx = new Float32Array(n), cy = new Float32Array(n), cr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const b = beads[i];
    cx[i] = b.x * k; cy[i] = b.y * k; cr[i] = Math.max(1, b.r * k);
  }
  // The walls of the drop being drawn, grown when a drop has more than 32:
  // each a direction, its apex along it, and its arc (dropWall).
  let cutE = new Float64Array(64), cutT = new Float64Array(32), cutR = new Float64Array(32), cutS = new Float64Array(32);
  for (let i = 0; i < n; i++) {
    const b = beads[i];
    if (!Number.isFinite(cx[i]) || !Number.isFinite(cy[i]) || !Number.isFinite(cr[i])) continue;
    const R = cr[i], x0 = cx[i], y0 = cy[i];
    /*
      The cuts: every drop this one overlaps, as a unit direction and the
      distance along it from this centre to the wall. The wall is the power
      line of the two circles, the chord through the two points where they
      cross, which gives every pixel of the overlap to exactly one of them
      with no gap and no double. It is held at least a third of a radius (and
      a pixel) from either centre, so a drop the crowd has pressed hard into a
      bigger one keeps its middle and dents its neighbour instead of being
      drawn as its neighbour; the same clamp seen from the other drop is the
      same wall, so the two still meet exactly.
    */
    let nCut = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = cx[j] - x0, dy = cy[j] - y0, Rj = cr[j];
      const D2 = dx * dx + dy * dy, reach = R + Rj;
      if (D2 >= reach * reach || !(D2 > 1e-6)) continue;
      const D = Math.sqrt(D2);
      const w = dropWall(R, Rj, D);
      if (nCut === cutT.length) {
        const e2 = new Float64Array(cutE.length * 2); e2.set(cutE); cutE = e2;
        const grow = (a: Float64Array) => { const b2 = new Float64Array(a.length * 2); b2.set(a); return b2; };
        cutT = grow(cutT); cutR = grow(cutR); cutS = grow(cutS);
      }
      cutE[2 * nCut] = dx / D; cutE[2 * nCut + 1] = dy / D;
      cutR[nCut] = w.rho; cutS[nCut] = w.side;
      cutT[nCut++] = w.apex;
    }
    const fade = Math.min(1, b.age / 0.6);
    const lw = Math.max(1, R * 0.12);
    const ringA = fade * (0.8 + 0.2 * b.seed);
    const c = b.color ?? [1, 1, 1];
    const c0 = c[0] * 255, c1 = c[1] * 255, c2 = c[2] * 255;
    const ext = R + 1;
    const xa = Math.max(0, Math.floor(x0 - ext)), xb = Math.min(S - 1, Math.ceil(x0 + ext));
    const ya = Math.max(0, Math.floor(y0 - ext)), yb = Math.min(S - 1, Math.ceil(y0 + ext));
    const kS = 0.2 * R, invK = 1 / kS;
    for (let py = ya; py <= yb; py++) {
      const vy = py + 0.5 - y0;
      // Only the row's span of the disc, not the corners of its box.
      const span = Math.sqrt(Math.max(0, ext * ext - vy * vy));
      const pa = Math.max(xa, Math.floor(x0 - span)), pb = Math.min(xb, Math.ceil(x0 + span));
      for (let px = pa; px <= pb; px++) {
        const vx = px + 0.5 - x0;
        const d = Math.sqrt(vx * vx + vy * vy);
        if (d > ext) continue;
        /*
          Two distances to the edge. `edge`, the hard least of the circle and
          every wall, decides who has the pixel, so the walls stay exact. The
          dome is built on `soft`, a smooth least (the polynomial smooth
          minimum, blended over a fifth of the radius): with the hard one the
          dome of a drop with walls was a cut gem, a ridge wherever two walls
          or a wall and the round edge met, and the lamp found every facet. A
          drop pressed into its neighbours is a pillow. The smooth least is
          never more than the hard one, so the dome is still nothing at a wall.
          It blends only the nearest two, which is where a crease is; blending
          every wall in turn cost twice the rings' whole canvas on this loop.
        */
        let edge = R - d, second = 1e9, wall = 1e9;
        for (let q = 0; q < nCut; q++) {
          const ex = cutE[2 * q], ey = cutE[2 * q + 1];
          let s: number;
          if (cutS[q] === 0) s = cutT[q] - (vx * ex + vy * ey);
          else {
            // The arc's centre lies on the line of centres, its radius back
            // from the apex toward the smaller drop.
            const along = cutT[q] - cutS[q] * cutR[q];
            const ax = vx - ex * along, ay = vy - ey * along;
            s = cutS[q] * (cutR[q] - Math.sqrt(ax * ax + ay * ay));
          }
          if (s < wall) wall = s;
          if (s < edge) { second = edge; edge = s; } else if (s < second) second = s;
        }
        const gap = second - edge;
        const hS = gap < kS ? (kS - gap) * invK : 0;
        const soft = edge - hS * hS * kS * 0.25;
        /*
          Coverage is antialiased against the round edge only, where a drop
          meets bare liquid. A wall is shared: the pixel on it is wholly one
          drop's or the other's, by which side its middle is on. Antialiased
          there too, each wall pixel was a little of both drops and neither,
          and the plate showed through as a thin line of whatever was under
          them, the wrong colour, down every contact.
        */
        const cov = wall > 0 ? Math.min(1, R - d + 0.5) : 0;
        const p = py * S + px;
        const o = (py * W + px) * 4, oc = o + S * 4;
        if (cov <= 0) {
          // Inside this drop's circle but past one of its walls: see below.
          if (wall <= 0 && d < R && !holes[p]) { holes[p] = 1; holeList[nHoles++] = p; }
          // The colour's halo, where nothing owns the pixel.
          if (own[p] === 0 && edge > -1) { out[oc] = c0; out[oc + 1] = c1; out[oc + 2] = c2; }
          continue;
        }
        const a = cov * fade;
        if (a <= own[p]) continue;
        own[p] = a;
        ids[p] = i + 1;
        const h = Math.max(0, Math.min(1, soft / R));
        const ring = Math.max(0, Math.min(1, lw - edge + 0.5)) * cov * ringA;
        out[o] = a * 255; out[o + 1] = ring * 255; out[o + 2] = a * h * 255;
        out[oc] = c0; out[oc + 1] = c1; out[oc + 2] = c2;
      }
    }
  }
  /*
    Holes. Each pair of drops meets along one wall, clamped to stay a third
    of a radius from either centre, and with the clamp on, the walls of three
    or four drops pressed together no longer meet in one point: a small drop
    squeezed between four big ones left a triangle past every wall that no
    drop claimed, the plate showing through the middle of the crowd, and
    `npm run drops` found a passenger drawn in one. A pixel inside some drop's
    circle that nobody owns takes its neighbour's, twice over, which closes
    the triangles (a pixel or two across) without moving any wall.
  */
  for (let pass = 0; pass < 2; pass++) {
    for (let h = 0; h < nHoles; h++) {
      const p = holeList[h];
      if (ids[p] !== 0) continue;
      const x = p % S, y = (p - x) / S;
      const q = x + 1 < S && ids[p + 1] ? p + 1 : x > 0 && ids[p - 1] ? p - 1
        : y + 1 < S && ids[p + S] ? p + S : y > 0 && ids[p - S] ? p - S : -1;
      if (q < 0) continue;
      const o = (y * W + x) * 4, oq = ((q - (q % S)) / S * W + (q % S)) * 4;
      for (let c = 0; c < 3; c++) { out[o + c] = out[oq + c]; out[o + S * 4 + c] = out[oq + S * 4 + c]; }
      own[p] = own[q]; ids[p] = ids[q];
    }
  }
  // The drops they hold, each its own dome and rim standing inside its host,
  // drawn once every pixel has its owner.
  for (let i = 0; i < n; i++) {
    const b = beads[i];
    if (!Number.isFinite(cx[i]) || !Number.isFinite(cy[i]) || !Number.isFinite(cr[i])) continue;
    const x0 = cx[i], y0 = cy[i];
    const ringA = Math.min(1, b.age / 0.6) * (0.8 + 0.2 * b.seed);
    const inn = b.inner;
    if (inn && Number.isFinite(inn.dx) && Number.isFinite(inn.dy)) {
      // Dissolving: the passenger narrows to nothing over its life. Never
      // under a pixel and a quarter while it is held: at one pixel, a
      // passenger whose middle fell on a pixel's corner covered four
      // pixels by four-fifths each and was drawn as its host's colour
      // with a tint of its own (npm run drops found one, sixteen seconds in).
      const ix = x0 + inn.dx * k, iy = y0 + inn.dy * k;
      const iR = Math.max(1.25, inn.r * k * Math.sqrt(Math.max(0, 1 - inn.age / innerLife(inn.seed))));
      const ilw = Math.max(1, iR * 0.12);
      const ic = inn.color, i0 = ic[0] * 255, i1 = ic[1] * 255, i2 = ic[2] * 255;
      const iya = Math.max(0, Math.floor(iy - iR - 1)), iyb = Math.min(S - 1, Math.ceil(iy + iR + 1));
      const ixa = Math.max(0, Math.floor(ix - iR - 1)), ixb = Math.min(S - 1, Math.ceil(ix + iR + 1));
      for (let py = iya; py <= iyb; py++) for (let px = ixa; px <= ixb; px++) {
        const vx = px + 0.5 - ix, vy = py + 0.5 - iy;
        const edge = iR - Math.sqrt(vx * vx + vy * vy);
        const cov = Math.min(1, edge + 0.5);
        if (cov <= 0) continue;
        const p = py * S + px;
        const o = (py * W + px) * 4, oc = o + S * 4;
        // Only where the outer drop is: the inner never pokes through a wall.
        if (ids[p] !== i + 1 || out[o] === 0) continue;
        const h = Math.min(1, edge / iR);
        const w = cov * amount;
        const ring = Math.max(0, Math.min(1, ilw - edge + 0.5)) * w * ringA;
        out[o + 1] = Math.max(out[o + 1], ring * 255);
        const under = out[o + 2] / out[o];
        out[o + 2] = out[o] * (under + (h - under) * w);
        out[oc] = out[oc] + (i0 - out[oc]) * w; out[oc + 1] = out[oc + 1] + (i1 - out[oc + 1]) * w; out[oc + 2] = out[oc + 2] + (i2 - out[oc + 2]) * w;
      }
    }
  }
}
