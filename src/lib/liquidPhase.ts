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
  /** Heavier than water (+) or lighter (−). A *kind*, so it mixes, not sums. */
  weight?: number;
  /** Polar against water. A *kind*, so it mixes, not sums. */
  polarity?: number;
  /**
    Acid (+) or base (−), for a pH indicator in the dye. Nothing here on the
    CPU reads it: it goes to the GPU's mix, through `onDeposit`.
  */
  acid?: number;
}

/**
 * Seconds for each channel to fall to about a third of itself.
 *
 * Soap goes first: a surfactant spreads until it is too thin to lower anything,
 * which is why a soap gesture is a moment rather than a state. Body and repel
 * are properties of a liquid that is still sitting there, so they last as long
 * as a plate of it plausibly would.
 */
const DECAY_SECONDS = { soap: 6, body: 22, repel: 26, weight: 30, polarity: 30 };

/*
  The two forces the *kind* channels drive.

  SINK is how hard a weight difference pushes along the plate's own slope: a
  heavy liquid settles downhill and a light one rides up over it, and with the
  plate level neither does anything, which is right — a level dish separates by
  standing still, not by moving sideways.

  UNMIX is like-toward-like. Each cell is pushed along the polarity gradient in
  the direction of its own kind, so water goes toward water and oil toward oil
  and the boundary between them sharpens instead of blurring. This is the part
  `repel` could not do: `repel` is one number for a cell, so a pool refuses to
  mix with *anything*, where this asks what the two liquids actually are.
*/
const SINK = 0.9;
/*
  Set in family with its neighbours and measured for scale, not chosen by eye.

  It is linear and the control holds at every strength: separation across an
  oil/syrup boundary reads 0.0088 at 1.4, 0.0187 at 3.0 and 0.0374 at 6.0,
  while two liquids of the same chemistry stay merged (−0.036, −0.033, −0.029)
  throughout. Three is twice the effect of the first guess with no sign of
  instability, and it is the number most likely to want moving once somebody
  has watched oil and water on a real plate.
*/
const UNMIX = 3.0;

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
  /** Heavier than water (+) or lighter (−), −1..1. A kind, not an amount. */
  readonly weight: Float32Array;
  /** Polar against water, −1..1. A kind, not an amount. */
  readonly polarity: Float32Array;

  private readonly scratch: Float32Array;
  /** More scratch, so every channel rides one backtrace. */
  private readonly scratchB: Float32Array;
  private readonly scratchC: Float32Array;
  /** True while any channel holds anything worth spending a pass on. */
  private live = false;
  /*
    Which way is downhill, from the plate rather than from here.

    Set by the caller each step. Zero means a level dish, and a level dish is
    exactly where a weight difference should do nothing: liquids separate by
    standing still, not by drifting sideways.
  */
  private tiltX = 0;
  private tiltY = 0;
  /** Tell the field which way the plate is leaning. */
  setTilt(x: number, y: number): void {
    this.tiltX = Number.isFinite(x) ? x : 0;
    this.tiltY = Number.isFinite(y) ? y : 0;
  }
  /** Sum of each channel over the plate, kept current by `deposit` and `step`. */
  private readonly totals = { soap: 0, body: 0, repel: 0 };
  /** What the kind channels hold, so an empty plate never walks them. */
  private kindsHeld = 0;

  constructor(size: number) {
    this.size = size;
    const n = size * size;
    this.soap = new Float32Array(n);
    this.body = new Float32Array(n);
    this.repel = new Float32Array(n);
    this.weight = new Float32Array(n);
    this.polarity = new Float32Array(n);
    this.scratch = new Float32Array(n);
    this.scratchB = new Float32Array(n);
    this.scratchC = new Float32Array(n);
  }

  /** Nothing on the plate. */
  get active(): boolean {
    return this.live;
  }

  clear(): void {
    this.soap.fill(0);
    this.body.fill(0);
    this.repel.fill(0);
    this.weight.fill(0);
    this.polarity.fill(0);
    this.totals.soap = this.totals.body = this.totals.repel = 0;
    this.kindsHeld = 0;
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
   * A finger through the liquid: what it touches is loosened and mixed.
   *
   * The other tools move liquid about. This changes what the liquid *is* where
   * it passes, and it is the only one that can, because the plate now carries
   * what each liquid is made of.
   *
   * Two liquids stay apart because their polarities differ — that is the whole
   * of `UNMIX`, and it is what keeps oil out of water. A finger dragged through
   * them does not push them together so much as **destroy the difference**: it
   * pulls every cell it touches toward the average of what is under the finger,
   * so oil and water that meet there are briefly one thing and the force that
   * would separate them has nothing to work on. Lift the finger and the
   * chemistry is still averaged, so they stay mixed rather than springing
   * apart — which is what stirring a dish actually does and what no amount of
   * blowing will.
   *
   * `repel` goes down as well, because a pool that has been dragged through
   * has had its edge broken, and that is the same gesture.
   */
  stir(cx: number, cy: number, radius: number, amount: number): void {
    const s = this.size;
    const r = Math.max(1, radius);
    const r2 = r * r;
    const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(s - 2, Math.ceil(cx + r));
    const y0 = Math.max(1, Math.floor(cy - r)), y1 = Math.min(s - 2, Math.ceil(cy + r));
    // What is under the finger, as one liquid.
    let mw = 0, mp = 0, k = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const i = x + y * s;
        mw += this.weight[i]; mp += this.polarity[i]; k++;
      }
    }
    if (k === 0) return;
    mw /= k; mp /= k;
    const take = Math.max(0, Math.min(1, amount));
    let touched = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const w = (1 - Math.sqrt(d2) / r) * take;
        const i = x + y * s;
        this.weight[i] += (mw - this.weight[i]) * w;
        this.polarity[i] += (mp - this.polarity[i]) * w;
        // The edge of a pool does not survive being dragged through.
        if (this.repel[i] > 0) {
          const was = this.repel[i];
          this.repel[i] = was * (1 - w * 0.5);
          this.totals.repel += this.repel[i] - was;
        }
        touched += Math.abs(this.weight[i]) + Math.abs(this.polarity[i]);
      }
    }
    // Averaging cannot create a kind, but it can move the total, and the pass
    // has to know there is still something here to walk.
    if (touched > 0) { this.kindsHeld = Math.max(this.kindsHeld, touched); this.live = true; }
  }

  /**
   * A liquid lands. `radius` is in cells, `amount` scales with how much of it
   * went in, and the falloff is the same soft disc the dye injection uses so
   * the property and the colour arrive on the same shape.
   */
  /**
   * Told of every pour, before anything here decides whether it matters, so
   * the GPU's own fields (oil, soap, acidity: see WebGPUFluid.addMix) hear of
   * the same liquid on the same disc. Set by the plate.
   */
  onDeposit?: (cx: number, cy: number, radius: number, what: LiquidDeposit, amount: number) => void;

  deposit(cx: number, cy: number, radius: number, what: LiquidDeposit, amount = 1): void {
    this.onDeposit?.(cx, cy, radius, what, amount);
    const s = this.size;
    const r = Math.max(1, radius);
    const r2 = r * r;
    const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(s - 2, Math.ceil(cx + r));
    const y0 = Math.max(1, Math.floor(cy - r)), y1 = Math.min(s - 2, Math.ceil(cy + r));
    const soap = (what.soap ?? 0) * amount;
    const body = (what.body ?? 0) * amount;
    const repel = (what.repel ?? 0) * amount;
    /*
      The kinds are not scaled by `amount` the way the amounts are.

      A half-sized dose of oil is less oil, not less *oily*: what a smaller
      dose changes is how far the cell moves toward being oil, which is the
      blend weight below, not the value it is moving toward. Scaling the value
      as well would make a gentle pour of oil read as something halfway
      between oil and water, which is not a liquid anybody has.
    */
    const weight = what.weight ?? 0;
    const polarity = what.polarity ?? 0;
    const kinds = weight !== 0 || polarity !== 0;
    if (soap === 0 && body === 0 && repel === 0 && !kinds) return;
    // How fast a cell takes on the character of what lands in it.
    const take = Math.min(1, Math.max(0, amount)) * 0.6;

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
        /*
          Mixed toward, not added to. Two drops of oil in one place are not
          twice as oily — they are oil — so the cell moves a share of the way
          from whatever was there to whatever arrived, and a cell that is
          already oil stays exactly as oily as oil.
        */
        if (kinds) {
          const k = take * w;
          this.weight[i] += (weight - this.weight[i]) * k;
          this.polarity[i] += (polarity - this.polarity[i]) * k;
          this.kindsHeld += Math.abs(this.weight[i]) + Math.abs(this.polarity[i]);
        }
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
    /*
      All three amounts along one backtrace.

      They were three separate calls with the same velocity and the same
      displacement — three identical walks over the plate, each recomputing the
      same backtrace and the same four bilinear weights, to sample a different
      field. The backtrace is nearly all of the cost. One walk, three samples.

      The conservation clamp stays per channel, because it has to: each has its
      own decay and therefore its own allowance.
    */
    this.advectAmounts(vx, vy, disp, keep.soap, keep.body, keep.repel);
    /*
      The kinds ride the plate too, and they fade back toward water.

      `advectDecay` returns a total, which for a signed channel is a sum that
      cancels — oil on one side and syrup on the other add to nothing — so it
      cannot say whether the channel is still holding anything. The absolute
      sums do, and they are what keeps the pass alive.
    */
    /*
      Both kinds along one backtrace, and a separate walk to add them up was
      one walk too many.

      Each channel had its own `advectDecay`, which is its own backtrace over
      the whole plate — and the backtrace is nearly all of the cost, not the
      sampling. Two more of them put the pass at **3.51 ms at 192² on a CI
      runner against a gate of 3.0**, having measured 1.50 on a laptop, which
      is what a slower machine is for. The two kinds ride the same flow, so
      they share one backtrace and one set of bilinear weights, and the second
      field costs four multiplies rather than a second pass over the plate.

      Neither is clamped back the way the amounts are. That guard exists
      because a converging flow samples the same cells over and over and so
      *makes* soap out of nothing; a signed property has nothing to make, since
      a cell can only ever become more like the liquid around it.
    */
    /*
      And skipped altogether on a plate that has none.

      A look with soap on it but no weight or polarity anywhere was still
      paying for a full backtrace of both, every step, to move zeroes around.
      What they held last step says whether this step has anything to do, which
      costs one number and is exact: a kind cannot appear except by being
      deposited, and a deposit says so.
    */
    const kinds = this.kindsHeld > 0
      ? this.advectKinds(vx, vy, disp,
          Math.exp(-dt / DECAY_SECONDS.weight), Math.exp(-dt / DECAY_SECONDS.polarity))
      : 0;
    this.kindsHeld = kinds;
    this.live = this.totals.soap + this.totals.body + this.totals.repel + kinds > 0;
  }

  /** One channel: semi-Lagrangian backtrace, then decay. Returns what is left. */
  /**
   * The three amount channels along one backtrace, clamped per channel.
   *
   * A backtrace does not conserve what it carries: where the flow converges it
   * samples the same few cells repeatedly and the liquid multiplies — a dose of
   * soap once grew to fifteen times itself in fifteen seconds and emptied Solar
   * Flare under music. None of these is ever made by moving, so a pass that
   * leaves more than decay alone would have is scaled back to that, and each
   * channel needs its own allowance because each has its own decay.
   */
  private advectAmounts(vx: Float32Array, vy: Float32Array, disp: number, ks: number, kb: number, kr: number): void {
    const s = this.size;
    const so = this.soap, bo = this.body, re = this.repel;
    const ss = this.scratch, sb = this.scratchB, sr = this.scratchC;
    ss.set(so); sb.set(bo); sr.set(re);
    const last = s - 2;
    let b0 = 0, b1 = 0, b2 = 0;
    for (let j = 1; j < s - 1; j++) for (let i = 1; i < s - 1; i++) {
      const k = i + j * s; b0 += ss[k]; b1 += sb[k]; b2 += sr[k];
    }
    let t0 = 0, t1 = 0, t2 = 0;
    for (let j = 1; j < s - 1; j++) {
      for (let i = 1; i < s - 1; i++) {
        const idx = i + j * s;
        let x = i - disp * vx[idx];
        let y = j - disp * vy[idx];
        if (x < 0.5) x = 0.5; else if (x > last + 0.5) x = last + 0.5;
        if (y < 0.5) y = 0.5; else if (y > last + 0.5) y = last + 0.5;
        const i0 = x | 0, j0 = y | 0;
        const a = i0 + j0 * s, b = a + 1, c = a + s, d = c + 1;
        const fx = x - i0, fy = y - j0;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const v0 = (ss[a] * w00 + ss[b] * w10 + ss[c] * w01 + ss[d] * w11) * ks;
        const v1 = (sb[a] * w00 + sb[b] * w10 + sb[c] * w01 + sb[d] * w11) * kb;
        const v2 = (sr[a] * w00 + sr[b] * w10 + sr[c] * w01 + sr[d] * w11) * kr;
        const o0 = v0 < FLOOR ? 0 : v0, o1 = v1 < FLOOR ? 0 : v1, o2 = v2 < FLOOR ? 0 : v2;
        so[idx] = o0; bo[idx] = o1; re[idx] = o2;
        t0 += o0; t1 += o1; t2 += o2;
      }
    }
    const hold = (field: Float32Array, total: number, before: number, keep: number): number => {
      const allowed = before * keep;
      if (!(total > allowed) || !(total > 0)) return total;
      const k = allowed / total;
      for (let j = 1; j < s - 1; j++) for (let i = 1; i < s - 1; i++) field[i + j * s] *= k;
      return allowed;
    };
    this.totals.soap = hold(so, t0, b0, ks);
    this.totals.body = hold(bo, t1, b1, kb);
    this.totals.repel = hold(re, t2, b2, kr);
  }

  /**
   * The two kind channels along one backtrace, returning how much they hold.
   *
   * They are signed, so a plain sum cancels — oil on one side and syrup on the
   * other add to nothing — and a pass that asked that question would switch
   * itself off with a full plate. The absolute total is what says whether
   * there is anything here.
   */
  private advectKinds(vx: Float32Array, vy: Float32Array, disp: number, kw: number, kp: number): number {
    const s = this.size;
    const w = this.weight, pol = this.polarity;
    const sw = this.scratch, sp = this.scratchB;
    sw.set(w); sp.set(pol);
    const last = s - 2;
    let held = 0;
    for (let j = 1; j < s - 1; j++) {
      for (let i = 1; i < s - 1; i++) {
        const idx = i + j * s;
        let x = i - disp * vx[idx];
        let y = j - disp * vy[idx];
        if (x < 0.5) x = 0.5; else if (x > last + 0.5) x = last + 0.5;
        if (y < 0.5) y = 0.5; else if (y > last + 0.5) y = last + 0.5;
        const i0 = x | 0, j0 = y | 0;
        const a = i0 + j0 * s, b = a + 1, c = a + s, d = c + 1;
        const fx = x - i0, fy = y - j0;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const nw = (sw[a] * w00 + sw[b] * w10 + sw[c] * w01 + sw[d] * w11) * kw;
        const np = (sp[a] * w00 + sp[b] * w10 + sp[c] * w01 + sp[d] * w11) * kp;
        const ow = nw > -FLOOR && nw < FLOOR ? 0 : nw;
        const op = np > -FLOOR && np < FLOOR ? 0 : np;
        w[idx] = ow; pol[idx] = op;
        held += (ow < 0 ? -ow : ow) + (op < 0 ? -op : op);
      }
    }
    return held;
  }

  private advectDecay(field: Float32Array, vx: Float32Array, vy: Float32Array, disp: number, keep: number): number {
    const s = this.size;
    const src = this.scratch;
    src.set(field);
    const last = s - 2;
    let total = 0;
    let before = 0;
    for (let j = 1; j < s - 1; j++) for (let i = 1; i < s - 1; i++) before += src[i + j * s];

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
    /*
      A backtrace does not conserve what it carries. Where the flow converges it
      samples the same few cells over and over, and the liquid multiplies —
      measured with the plate's real flow under it, a dose of soap grew to
      fifteen times itself in fifteen seconds and thinned the dye everywhere it
      reached, emptying Solar Flare under music. None of these liquids is ever
      made by moving: if a pass left more than decay alone would have, scale it
      back to that.
    */
    const allowed = before * keep;
    if (total > allowed && total > 0) {
      const k = allowed / total;
      for (let j = 1; j < s - 1; j++) for (let i = 1; i < s - 1; i++) field[i + j * s] *= k;
      total = allowed;
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
        const heavy = this.kindsHeld > 0 ? this.weight[idx] : 0;
        const polar = this.kindsHeld > 0 ? this.polarity[idx] : 0;
        if (soap === 0 && body === 0 && repel === 0 && heavy === 0 && polar === 0) continue;

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

        /*
          ── Weight: heavy settles, light rides up ─────────────────

          Along the plate's own slope, which is the only direction "down"
          means on a dish lying flat. With the plate level this does nothing
          at all, and that is right: a level dish separates by standing still.
          Tilt it or rock it and oil goes up the slope while syrup goes down,
          which is the whole of what "x floats on y" can mean on a plate seen
          from above.

          `tiltX`/`tiltY` come from the caller, because the plate's tilt is
          the plate's, not the liquid field's.
        */
        if (heavy !== 0 && (this.tiltX !== 0 || this.tiltY !== 0)) {
          fx += this.tiltX * heavy * SINK * dt * s;
          fy += this.tiltY * heavy * SINK * dt * s;
        }

        /*
          ── Polarity: like moves toward like ──────────────────────

          The pairwise half, and the thing `repel` above cannot express. Each
          cell is pushed along the polarity gradient *in the direction of its
          own kind*: a watery cell climbs toward more polar, an oily one
          toward less. Multiplying by the cell's own polarity gets both signs
          from one line — where the two match, the product is small and
          nothing happens, and that is miscibility.

          So oil and water separate, oil and silicone barely notice each
          other, and two dyes of different colours but the same chemistry mix
          exactly as they should, which colour-difference repulsion has never
          been able to say.
        */
        if (polar !== 0) {
          /*
            Away from what is unlike it, by how unlike it is.

            The first try was "like moves toward like": push each cell up the
            polarity gradient in the direction of its own sign. It separates
            oil from syrup and it is wrong, because it makes *any* two blobs
            of the same sign clump apart from each other — each runs to its
            own nearest maximum. Measured: two liquids of near-identical
            chemistry parted five times harder than oil and syrup did.

            What matters is the *difference*, not the gradient. Each side is
            weighed by how unlike this cell it is, and the cell moves away
            from the more unlike side. Two liquids of the same chemistry
            differ by nothing, so nothing happens and they mix, which is what
            miscible means. This is the same shape as the colour-difference
            force in the solver, with chemistry in place of colour — and
            chemistry is the one that is true, because two dyes can differ in
            colour and not at all in what they are made of.
          */
          const dR = this.polarity[idx + 1] - polar;
          const dL = this.polarity[idx - 1] - polar;
          const dU = this.polarity[idx + s] - polar;
          const dD = this.polarity[idx - s] - polar;
          fx -= (dR * dR - dL * dL) * UNMIX * dt * s;
          fy -= (dU * dU - dD * dD) * UNMIX * dt * s;
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
