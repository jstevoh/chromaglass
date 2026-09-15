/**
 * What liquid is where, and what that does to the plate.
 *
 * A liquid used to be an inject radius, an amount and a heat — five ways of
 * dropping the same dye. Soap did nothing soap does. The reason is that the
 * plate had nowhere to remember that soap had landed: the drop could shove the
 * dye once, and the next step the plate had forgotten.
 *
 * So the plate carries a second field alongside the dye. Three numbers a cell,
 * advected by the same velocity, decaying slowly back to nothing:
 *
 *   soap   how much the surface tension there has been broken
 *   body   how much thicker than water the liquid there is
 *   repel  how much it refuses to mix with what it meets
 *
 * All three are *deviations from an ordinary plate*, so zero everywhere is
 * exactly the plate as it was. A show with no soap, milk, silicone or
 * glycerine in it runs the same arithmetic it always did, and the whole pass
 * is skipped when the field is empty. That is the property `npm run liquids`
 * checks first, because a new field in the solver that changes every existing
 * look is not a feature, it is a regression with a menu entry.
 *
 * ## Why this is not in the GPU solver
 *
 * It does not need to be. With the GPU solver attached, the CPU arrays are the
 * *deltas* for the next step — whatever is written into them is uploaded and
 * applied before the step runs. So a force expressed as a velocity delta, and
 * a thinning expressed as a dye multiplier, reach both engines through a path
 * that already exists. The field itself is advected here, on the readback of
 * the velocity the GPU is already handing back once a frame.
 *
 * What that buys: no new texture, no new pass, no change to the file the
 * solver's own tuning lives in. What it costs: the field moves on the
 * readback, which is one frame behind. At 60 fps that is 16 ms of lag on
 * something that decays over seconds, and nothing here is sharp enough to
 * show it.
 */

/** How the four liquids write themselves into the field. */
export interface LiquidDeposit {
  soap?: number;
  body?: number;
  repel?: number;
}

/**
 * Seconds for each channel to fall to about a third of itself.
 *
 * Soap goes first: a surfactant spreads until it is too thin to lower anything,
 * which is why a soap gesture is a moment rather than a state. Body and repel
 * are properties of a liquid that is still sitting there, so they last as long
 * as a plate of it plausibly would.
 */
const DECAY_SECONDS = { soap: 6, body: 22, repel: 26 };

/** Below this, a channel is rounded to nothing so the field can go quiet. */
const FLOOR = 0.004;

/**
 * Marangoni strength: velocity per unit of tension gradient per second.
 *
 * Liquid flows from where the tension is low toward where it is high, which
 * is away from the soap. This is the whole of what soap does, and the reason
 * it has to be a field: the flow lasts as long as the gradient does, and the
 * gradient lasts until the soap has spread out.
 */
const MARANGONI = 1.1;
/** Drag added per unit of body, as a share of the local velocity per second. */
const BODY_DRAG = 2.6;
/** How much of the escaping flow a repelling liquid takes back, per unit of repel per second. */
const EDGE_HOLD = 0.9;
/** The most any of this may add to a cell in one step, as a velocity. */
const MAX_FORCE = 0.22;

/**
 * How much of the plate, on average, one channel may claim before the dish is
 * considered full of that liquid.
 *
 * A show that runs itself adds liquid every few seconds and never pours any of
 * it out, so without a ceiling an hour of automated glycerine ends with `body`
 * near 1 in every cell — and a plate that is thick everywhere is not a thick
 * plate, it is a stopped one. Worse for soap: the Marangoni force is a
 * *gradient*, so a plate that is uniformly soaped has no force left in it at
 * all. Both failures look the same from the front — the liquid stops doing the
 * thing it was added for, and the only way back is a clear.
 *
 * So the automation asks `headroom()` before it doses, and stops adding as the
 * mean approaches these. Nothing clamps a hand on the dropper: a person who
 * wants a plate of solid glycerine can still make one.
 */
const CEILING = { soap: 0.35, body: 0.3, repel: 0.45 };

export class LiquidPhase {
  readonly size: number;
  /** Tension broken, 0..1. */
  readonly soap: Float32Array;
  /** Thicker than water, 0..1. */
  readonly body: Float32Array;
  /** Refuses to mix, 0..1. */
  readonly repel: Float32Array;

  private readonly scratch: Float32Array;
  /** True while any channel holds anything worth spending a pass on. */
  private live = false;
  /** Sum of each channel over the plate, kept current by `deposit` and `step`. */
  private readonly totals = { soap: 0, body: 0, repel: 0 };

  constructor(size: number) {
    this.size = size;
    const n = size * size;
    this.soap = new Float32Array(n);
    this.body = new Float32Array(n);
    this.repel = new Float32Array(n);
    this.scratch = new Float32Array(n);
  }

  /** Nothing on the plate. */
  get active(): boolean {
    return this.live;
  }

  clear(): void {
    this.soap.fill(0);
    this.body.fill(0);
    this.repel.fill(0);
    this.totals.soap = this.totals.body = this.totals.repel = 0;
    this.live = false;
  }

  /**
   * How much room is left for a deposit of this shape, 0..1.
   *
   * The tightest of the channels it would write to, so a liquid that is part
   * soap and part repel is held back by whichever of the two the plate has
   * had enough of. Automation multiplies its dose by this; a person does not
   * have to ask.
   */
  headroom(what: LiquidDeposit): number {
    const cells = (this.size - 2) * (this.size - 2);
    let room = 1;
    for (const key of ['soap', 'body', 'repel'] as const) {
      if (!what[key]) continue;
      const mean = this.totals[key] / cells;
      room = Math.min(room, 1 - Math.min(1, mean / CEILING[key]));
    }
    return room;
  }

  /**
   * A liquid lands. `radius` is in cells, `amount` scales with how much of it
   * went in, and the falloff is the same soft disc the dye injection uses so
   * the property and the colour arrive on the same shape.
   */
  deposit(cx: number, cy: number, radius: number, what: LiquidDeposit, amount = 1): void {
    const s = this.size;
    const r = Math.max(1, radius);
    const r2 = r * r;
    const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(s - 2, Math.ceil(cx + r));
    const y0 = Math.max(1, Math.floor(cy - r)), y1 = Math.min(s - 2, Math.ceil(cy + r));
    const soap = (what.soap ?? 0) * amount;
    const body = (what.body ?? 0) * amount;
    const repel = (what.repel ?? 0) * amount;
    if (soap === 0 && body === 0 && repel === 0) return;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const w = 1 - Math.sqrt(d2) / r;
        const i = x + y * s;
        // Saturating rather than summing: a second drop of soap on the same
        // spot cannot break the tension by more than all of it. What actually
        // lands is the difference, which is what the running totals are told.
        if (soap) { const v = Math.min(1, this.soap[i] + soap * w); this.totals.soap += v - this.soap[i]; this.soap[i] = v; }
        if (body) { const v = Math.min(1, this.body[i] + body * w); this.totals.body += v - this.body[i]; this.body[i] = v; }
        if (repel) { const v = Math.min(1, this.repel[i] + repel * w); this.totals.repel += v - this.repel[i]; this.repel[i] = v; }
      }
    }
    this.live = true;
  }

  /**
   * Carry the field along with the plate and let it fade.
   *
   * `vx`/`vy` are the plate's velocity — the readback on the GPU engine, the
   * live field on the CPU one — and `disp` is the same displacement the
   * solver advects its own dye by, so the properties travel with the liquid
   * rather than sliding through it.
   */
  step(vx: Float32Array, vy: Float32Array, disp: number, dt: number): void {
    if (!this.live) return;
    const keep = {
      soap: Math.exp(-dt / DECAY_SECONDS.soap),
      body: Math.exp(-dt / DECAY_SECONDS.body),
      repel: Math.exp(-dt / DECAY_SECONDS.repel),
    };
    this.totals.soap = this.advectDecay(this.soap, vx, vy, disp, keep.soap);
    this.totals.body = this.advectDecay(this.body, vx, vy, disp, keep.body);
    this.totals.repel = this.advectDecay(this.repel, vx, vy, disp, keep.repel);
    this.live = this.totals.soap + this.totals.body + this.totals.repel > 0;
  }

  /** One channel: semi-Lagrangian backtrace, then decay. Returns what is left. */
  private advectDecay(field: Float32Array, vx: Float32Array, vy: Float32Array, disp: number, keep: number): number {
    const s = this.size;
    const src = this.scratch;
    src.set(field);
    const last = s - 2;
    let total = 0;

    for (let j = 1; j < s - 1; j++) {
      for (let i = 1; i < s - 1; i++) {
        const idx = i + j * s;
        let x = i - disp * vx[idx];
        let y = j - disp * vy[idx];
        if (x < 0.5) x = 0.5; else if (x > last + 0.5) x = last + 0.5;
        if (y < 0.5) y = 0.5; else if (y > last + 0.5) y = last + 0.5;
        const i0 = Math.floor(x), j0 = Math.floor(y);
        const i1 = i0 + 1, j1 = j0 + 1;
        const sx = x - i0, sy = y - j0;
        const v =
          (src[i0 + j0 * s] * (1 - sx) + src[i1 + j0 * s] * sx) * (1 - sy) +
          (src[i0 + j1 * s] * (1 - sx) + src[i1 + j1 * s] * sx) * sy;
        const out = v * keep;
        field[idx] = out < FLOOR ? 0 : out;
        total += field[idx];
      }
    }
    return total;
  }

  /**
   * Write this step's forces into the solver's delta arrays.
   *
   * `addVx`/`addVy` are what the solver takes next; `mul` is the
   * multiplicative dye change it applies alongside; `plateVx`/`plateVy` are
   * the velocity as it stands, which is what drag has to be measured against;
   * `density` is the dye, which is what an edge is made of.
   */
  apply(
    addVx: Float32Array,
    addVy: Float32Array,
    mul: Float32Array | null,
    plateVx: Float32Array,
    plateVy: Float32Array,
    density: Float32Array,
    dt: number,
  ): void {
    if (!this.live) return;
    const s = this.size;
    const clamp = (v: number) => (v < -MAX_FORCE ? -MAX_FORCE : v > MAX_FORCE ? MAX_FORCE : v);

    for (let j = 1; j < s - 1; j++) {
      for (let i = 1; i < s - 1; i++) {
        const idx = i + j * s;
        const soap = this.soap[idx], body = this.body[idx], repel = this.repel[idx];
        if (soap === 0 && body === 0 && repel === 0) continue;

        let fx = 0, fy = 0;

        // ── Soap: the Marangoni flow ──────────────────────────────
        // Tension is 1 − soap, so liquid runs up the tension gradient, which
        // is down the soap gradient: away from the soap, for as long as the
        // soap is there to make a gradient. The dye is carried with it, and
        // the plate's own vorticity is what curls the front into filaments.
        if (soap > 0) {
          const gx = (this.soap[idx + 1] - this.soap[idx - 1]) * 0.5;
          const gy = (this.soap[idx + s] - this.soap[idx - s]) * 0.5;
          fx -= gx * MARANGONI * dt * s;
          fy -= gy * MARANGONI * dt * s;
        }

        // ── Body: it crawls while the rest of the plate flows ──────
        // Drag against the velocity that is actually there, which is the one
        // thing a delta cannot express without being told what to oppose.
        if (body > 0) {
          const k = Math.min(0.9, body * BODY_DRAG * dt);
          fx -= plateVx[idx] * k;
          fy -= plateVy[idx] * k;
        }

        // ── Repel: it holds its own edge ──────────────────────────
        // Not a pull toward the middle. A cohesive force with nothing to
        // balance it collapses the pool and throws it out the other side —
        // measured, it left milk *wider* than bare dye — because there is no
        // pressure term here to stop the overshoot.
        //
        // Instead it takes away the velocity that is escaping, and only that.
        // The outward direction is where the liquid is thinning out, so the
        // component of the flow heading that way is damped and everything else
        // is untouched. A force that can only remove energy cannot overshoot,
        // and "does not let go of itself" is what holding an edge actually is.
        if (repel > 0) {
          const gx = (this.repel[idx + 1] - this.repel[idx - 1]) * 0.5;
          const gy = (this.repel[idx + s] - this.repel[idx - s]) * 0.5;
          const g = Math.sqrt(gx * gx + gy * gy);
          if (g > 1e-5) {
            const nx = -gx / g, ny = -gy / g;         // out of the pool
            const out = plateVx[idx] * nx + plateVy[idx] * ny;
            if (out > 0) {
              const k = Math.min(0.9, repel * EDGE_HOLD * dt * 60);
              fx -= nx * out * k;
              fy -= ny * out * k;
            }
          }
        }

        addVx[idx] += clamp(fx);
        addVy[idx] += clamp(fy);

        // Soap thins the film it broke, which is what leaves the clear disc
        // a drop of it opens in a plate of dye.
        if (mul && soap > 0) mul[idx] *= 1 - Math.min(0.5, soap * 0.22 * dt * 60);
      }
    }
  }
}
