/**
 * Slosh: the liquid running down a tilt and swinging back (PLAN 18a-13).
 *
 * What was reported (the owner, 2026-10-20): "we don't really have the ability
 * to slosh the liquids around the plate with the tilt mechanic: you would tilt
 * in one direction and until in the other causing sloshing and mixing."
 *
 * Why the plate could not. The thin gap (PLAN 18a, wgsl/thinGap.ts) is a
 * Hele-Shaw cell: the liquid's momentum is its drag against the glass, 12ν/h²
 * times the speed, with nothing for inertia to carry. Tip the plate and a
 * uniform in-plane gravity is balanced, to the last digit, by the pressure of
 * liquid piled against the rim, so the flow is zero. (Open rim, p = 0 outside
 * the inscribed circle: the gap's solve does not let it pile.) Where Gravity
 * and Tilt Direction do move liquid is the buoyancy of a *denser dye* inside
 * the clear liquid (PLAN 27a). A tilt that reverses cannot overshoot, because
 * in a creeping flow nothing has the momentum to.
 *
 * What a dish does. A shallow layer under in-plane gravity `a` is the
 * shallow-water equations:
 *
 *     ∂u/∂t + (u·∇)u = −g ∇h + a − r u
 *     ∂h/∂t + ∇·(h u) = 0
 *
 * h the depth, u the depth-averaged velocity, g gravity, r the same gap drag
 * 12ν/h₀² the thin gap already has (Poiseuille between two plates, the
 * depth-average of a parabolic profile). Held tilted, u goes to zero and the
 * depth settles to a slope a/g against the rim, so the liquid is deeper on the
 * low side. Tilted the other way, the pile is on the wrong side, runs back,
 * overshoots as far as the drag lets it, reflects off the rim and rings at
 * √(g h₀) across the dish, c = 1.21 plate widths a second at the plate's rest
 * gap (6 mm), a lowest mode of about 1.4 seconds, until r takes it out. The
 * gap's own Thickness sets r, so water sloshes for several swings, the default
 * 0.45 is barely underdamped and glycerine does not slosh at all, which is what
 * a dish of each does.
 *
 * What this is, and what it is not. It is a second solver beside the gap's,
 * on the CPU at 64 by 64 (the GPU's 128 and 256 are for the dye's filaments;
 * a wave across a dish has nothing finer than a cell to say), and what the
 * gap's solve is given is only the velocity it makes, laid over the flow the
 * dye rides after the solve (`addSlosh`, wgsl/fluid.ts). It never goes
 * through the gap's projection, which would take the slosh's divergence (the
 * liquid piling) for a source and push it out of the open rim. Named shortcuts:
 *
 *   (a) One layer. Every liquid on the plate rides the same depth-averaged
 *       flow. Oil and water, or the ferrofluid, would slosh at different speeds
 *       and shear past each other (PLAN 18a-13a, a two-layer version).
 *   (b) Free-slip rim. The wall's own boundary layer, one gap deep, is left
 *       out; the gap's drag, which is much the larger, is in.
 *   (c) The dye does not feel the depth. The plate draws no thickness for the
 *       pile (the dish would have to be seen from the side); only the flow shows.
 *   (d) Momentum advection is upwind (donor cell): first order and a little
 *       diffusive, which smears a steep front a cell or two but cannot ring.
 *   (e) The dish turning (the turntable) adds no Coriolis or centrifugal term.
 *   (f) The CPU solver (no GPU) ignores it.
 *   (g) A wave that breaks is a quadratic drag and a speed wall (SLOSH_BREAKING,
 *       SLOSH_FROUDE_MAX), not a shock-capturing bore: the energy a real wave
 *       spends in foam is taken out by the drag, and the front is not sharp.
 *   (h) The drag is the covered gap's, not an open layer's. sloshDrag is 12 nu/h^2,
 *       Poiseuille between two no-slip walls, which is what the thin solver
 *       assumes of the plate. A layer whose top is free would drag at half
 *       Poiseuille, 3 nu/h^2, four times weaker, and at slosh frequencies water's
 *       Stokes layer is thinner than the gap so the steady profile is itself an
 *       approximation (about 0.25/s from a Stokes estimate against the 0.33/s
 *       used). It moves the pace, so name it before tuning SLOSH_LEAN against it
 *       (PLAN 18a-13b).
 *   (i) A phone's tilt reaches the dish in screen axes. Gravity's direction is
 *       turned by the turntable's angle and the remote's tilt is not, so with
 *       the plate turned a phone tipped right sloshes at that angle. The rock
 *       takes the phone's tilt the same way (PLAN 18a-13e).
 *
 * The tilt is the dish's, nothing the sound does. The caller hands `a` from
 * the user's Gravity and Tilt Direction (and a held phone's tilt), and from
 * nothing else: Plate Rock, Frame Sway and the kick do not reach this file.
 * The frame and the camera do not move; only the liquid does.
 *
 * Pure and deterministic, so `npm run slosh` holds it to its numbers in node.
 */

/** Cells across the dish. A wave a cell wide is not a wave; 64 is two dozen across the lowest mode's half-wavelength. */
export const SLOSH_N = 64;
/** The dish's width, in the units the solver counts plate widths in: 1. The rim is the inscribed circle. */
export const SLOSH_RADIUS = 0.5;
/** Rest depth in plate widths: the plate's 6 mm gap (lib/turntable.ts DISH_REST_GAP). */
export const SLOSH_REST_DEPTH = 0.03;
/** g in plate widths per second squared: 9.81 m/s² over the 0.2 m plate. */
export const SLOSH_G = 9.81 / 0.2;
/** The wave speed √(g h₀), plate widths per second. */
export const SLOSH_C = Math.sqrt(SLOSH_G * SLOSH_REST_DEPTH);
/**
 * The slope at the dial's top, a held tilt's rim-to-rim rise as a share of the
 * plate's width (0.01 is 0.6 degrees). A dish tipped in the hand is tipped a few
 * degrees and a plate this shallow would be dry at one rim at fifteen. At 0.02
 * a reversal rocked at the lowest mode's period drove the grid past the point a
 * depth-averaged scheme without shock capture can hold (the rise reached four
 * to twelve times the rest depth), so the lean is half that, and a held tilt
 * piles the liquid a third of the rest depth up from rim to rim. The floor below is
 * what keeps the ring from drying a cell when it swings further.
 */
export const SLOSH_LEAN = 0.01;
/** The depth the liquid is not let below, a share of the rest depth. The dye is not drawn through a dry patch. */
export const SLOSH_FLOOR = 0.12;
/**
 * The largest substep, seconds. The Courant number is about 0.39 at c alone and
 * about 0.70 at the speed wall (1.8c), under the 2-D forward-backward limit of
 * about 0.71, so a fast flow is close to it, which is why the wall is where it is.
 */
export const SLOSH_DT_MAX = 0.005;
/**
 * Wave breaking, as a drag that grows with the speed: 1/s per unit of Froude
 * number (speed over √(g h₀)). A bore is where a real wave stops being a wave and
 * spends its energy in foam, which a depth-averaged grid cannot draw; without
 * something taking that energy a forcing near the lowest mode (a tilt rocked
 * once every 1.4 s) pumps the ring up without limit and the grid, which has no
 * shock capture, runs into dry cells and noise. At a tenth of the wave speed this
 * is 0.4/s, a third of water's own drag; at the wave speed it is 4/s, which is
 * what holds the ring to a Froude number of about one.
 */
export const SLOSH_BREAKING = 4;
/**
 * No face is let go faster than this share of the wave speed. A grid without
 * shock capture is only stable while the flow is subcritical; the breaking
 * drag above holds a ring there and this is the wall behind it, the number
 * that makes the solver's stability a fact and not a hope.
 */
export const SLOSH_FROUDE_MAX = 0.8;
/** Below this speed (plate widths per second) with no tilt, and level (next), the dish is at rest, exactly. */
export const SLOSH_REST_SPEED = 2e-4;
/** And the depth within this share of the rest depth everywhere: 0.1%, a tenth of a pixel of the pile. */
export const SLOSH_REST_RISE = 1e-3;

/**
 * The drag 1/s a Thickness (0 to 1) puts on the flow: 12ν/h₀², the same one the
 * gap's solve takes (`thinGapDragSeconds`, gpu/fluid.ts, is its reciprocal).
 * Taken from the viscosity so the two cannot drift apart.
 */
export function sloshDrag(nu: number, restDepth = SLOSH_REST_DEPTH, plateMetres = 0.2): number {
  const h = restDepth * plateMetres;
  return (12 * Math.max(1e-9, nu)) / (h * h);
}

/**
 * The acceleration a dish is given by a tilt, plate widths per second squared,
 * along the plate's own axes: g × the dial's lean × the tilt. The tilt is how
 * far the plate stands up times the direction downhill (a unit vector,
 * `downhill()` in the visualizer), plus the held phone's own, in -1..1 on each
 * axis (the remote's, faded out by the visualizer a couple of seconds after the
 * last reading), which is a tilt of the same size at full. Never the sound's:
 * the Plate Rock and Frame Sway swings do not come through here.
 */
export function sloshAccel(slosh: number, upright: number, dirX: number, dirY: number, extX = 0, extY = 0): [number, number] {
  const k = SLOSH_G * SLOSH_LEAN * clamp01(slosh);
  const u = clamp01(upright);
  const tx = u * fin(dirX) + clampUnit(extX), ty = u * fin(dirY) + clampUnit(extY);
  return [k * tx, k * ty];
}

function fin(x: number): number {
  return Number.isFinite(x) ? x : 0;
}

function clampUnit(x: number): number {
  return Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
}

function clampSpeed(x: number, m: number): number {
  return x > m ? m : x < -m ? -m : x;
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

export class SloshDish {
  readonly n: number;
  readonly dx: number;
  /** Depth at the cell centres, n × n. */
  readonly h: Float32Array;
  /** Speed on the x faces, (n + 1) × n: face i of row j lies between cells i − 1 and i. */
  readonly u: Float32Array;
  /** Speed on the y faces, n × (n + 1). */
  readonly v: Float32Array;
  /** 1 where the cell is in the dish. */
  readonly wet: Uint8Array;
  private readonly openU: Uint8Array;
  private readonly openV: Uint8Array;
  private readonly fu: Float32Array;
  private readonly fv: Float32Array;
  private readonly un: Float32Array;
  private readonly vn: Float32Array;
  private readonly keep: Float32Array;
  readonly restDepth: number;
  /** Cells in the dish, and the depth they hold, for the mass check. */
  readonly cells: number;

  constructor(n = SLOSH_N, restDepth = SLOSH_REST_DEPTH) {
    this.n = n;
    this.dx = 1 / n;
    this.restDepth = restDepth;
    this.h = new Float32Array(n * n);
    this.u = new Float32Array((n + 1) * n);
    this.v = new Float32Array(n * (n + 1));
    this.wet = new Uint8Array(n * n);
    this.openU = new Uint8Array((n + 1) * n);
    this.openV = new Uint8Array(n * (n + 1));
    this.fu = new Float32Array((n + 1) * n);
    this.fv = new Float32Array(n * (n + 1));
    this.un = new Float32Array((n + 1) * n);
    this.vn = new Float32Array(n * (n + 1));
    this.keep = new Float32Array(n * n);
    let cells = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n - 0.5, y = (j + 0.5) / n - 0.5;
      if (Math.hypot(x, y) <= SLOSH_RADIUS) { this.wet[j * n + i] = 1; cells++; }
    }
    this.cells = cells;
    // A face is open when both cells it joins are in the dish: every other face is the rim, a wall.
    for (let j = 0; j < n; j++) for (let i = 1; i < n; i++) {
      if (this.wet[j * n + i - 1] && this.wet[j * n + i]) this.openU[j * (n + 1) + i] = 1;
    }
    for (let j = 1; j < n; j++) for (let i = 0; i < n; i++) {
      if (this.wet[(j - 1) * n + i] && this.wet[j * n + i]) this.openV[j * n + i] = 1;
    }
    this.rest();
  }

  /** Flat and still, exactly. */
  rest(): void {
    this.resting = true;
    for (let k = 0; k < this.h.length; k++) this.h[k] = this.wet[k] ? this.restDepth : 0;
    this.u.fill(0);
    this.v.fill(0);
  }

  /** The depth held, in cell-depths (area × depth, in plate widths cubed times n²). Conserved. */
  mass(): number {
    let m = 0;
    for (let k = 0; k < this.h.length; k++) m += this.h[k];
    return m;
  }

  /** Kinetic energy plus the potential of the depth's rise, per unit density, in plate widths^4 per second². Zero at rest. */
  energy(): number {
    const { n, dx } = this;
    let e = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (!this.wet[k]) continue;
      const uc = 0.5 * (this.u[j * (n + 1) + i] + this.u[j * (n + 1) + i + 1]);
      const vc = 0.5 * (this.v[j * n + i] + this.v[(j + 1) * n + i]);
      const dh = this.h[k] - this.restDepth;
      e += (0.5 * this.h[k] * (uc * uc + vc * vc) + 0.5 * SLOSH_G * dh * dh) * dx * dx;
    }
    return e;
  }

  /** The largest departure of the depth from its rest, as a share of the rest depth. */
  maxRise(): number {
    let m = 0;
    for (let k = 0; k < this.h.length; k++) if (this.wet[k]) m = Math.max(m, Math.abs(this.h[k] - this.restDepth));
    return m / this.restDepth;
  }

  /** The fastest face, plate widths per second. */
  maxSpeed(): number {
    let m = 0;
    for (const a of [this.u, this.v]) for (let k = 0; k < a.length; k++) m = Math.max(m, Math.abs(a[k]));
    return m;
  }

  /**
   * Advance `seconds` under the acceleration (ax, ay) and the drag `r`, in
   * substeps no longer than SLOSH_DT_MAX. Returns true while the dish is moving
   * or tilted, and false the moment it is at rest, flat, exactly: a dish whose
   * liquid has stopped and is not being tipped has nothing left to ring, and
   * its drag would otherwise only approach that for ever.
   */
  step(seconds: number, ax: number, ay: number, r: number): boolean {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return this.live(ax, ay);
    ax = Number.isFinite(ax) ? ax : 0;
    ay = Number.isFinite(ay) ? ay : 0;
    r = Number.isFinite(r) ? Math.max(0, r) : 0;
    // Flat, still and not tipped: nothing to compute, and the cost of a dish nobody is tilting is zero.
    if (this.resting && ax === 0 && ay === 0) return false;
    this.resting = false;
    const subs = Math.max(1, Math.ceil(seconds / SLOSH_DT_MAX));
    const dt = seconds / subs;
    for (let s = 0; s < subs; s++) this.substep(dt, ax, ay, r);
    return this.live(ax, ay);
  }

  /** True from rest() until the next step with a tilt: lets a still dish cost nothing. */
  private resting = true;

  /** Times the grid went non-finite and was put back to rest: the check holds this at zero. */
  blowups = 0;

  private live(ax: number, ay: number): boolean {
    const sp = this.maxSpeed(), rise = this.maxRise();
    if (!(sp < 1e3 && rise < 1e3)) { this.blowups++; this.rest(); return false; }
    if (ax !== 0 || ay !== 0) return true;
    // Speed alone is not rest: a standing wave stops dead at each end of its swing, with all its energy in the depth, so the rise counts too.
    if (sp > SLOSH_REST_SPEED || rise > SLOSH_REST_RISE) return true;
    this.rest();
    return false;
  }

  private substep(dt: number, ax: number, ay: number, r: number): void {
    const { n, dx, h, u, v, un, vn, fu, fv, openU, openV } = this;
    const g = SLOSH_G;
    const c = Math.sqrt(g * this.restDepth), invC = 1 / c, vmax = SLOSH_FROUDE_MAX * c;
    const U = (i: number, j: number) => (i < 0 || i > n || j < 0 || j >= n ? 0 : u[j * (n + 1) + i]);
    const V = (i: number, j: number) => (i < 0 || i >= n || j < 0 || j > n ? 0 : v[j * n + i]);

    // Momentum, forward: the new depth is not yet known, so the gradient is the old one's (forward-backward below takes the new speed into the depth).
    for (let j = 0; j < n; j++) {
      for (let i = 1; i < n; i++) {
        const f = j * (n + 1) + i;
        if (!openU[f]) { un[f] = 0; continue; }
        const vb = 0.25 * (V(i - 1, j) + V(i, j) + V(i - 1, j + 1) + V(i, j + 1));
        const adv = (u[f] > 0 ? u[f] * (u[f] - U(i - 1, j)) : u[f] * (U(i + 1, j) - u[f])) / dx
                  + (vb > 0 ? vb * (u[f] - U(i, j - 1)) : vb * (U(i, j + 1) - u[f])) / dx;
        const grad = (h[j * n + i] - h[j * n + i - 1]) / dx;
        const br = SLOSH_BREAKING * Math.hypot(u[f], vb) * invC;
        un[f] = clampSpeed((u[f] + dt * (-g * grad + ax - adv)) / (1 + (r + br) * dt), vmax);
      }
    }
    for (let j = 1; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const f = j * n + i;
        if (!openV[f]) { vn[f] = 0; continue; }
        const ub = 0.25 * (U(i, j - 1) + U(i + 1, j - 1) + U(i, j) + U(i + 1, j));
        const adv = (ub > 0 ? ub * (v[f] - V(i - 1, j)) : ub * (V(i + 1, j) - v[f])) / dx
                  + (v[f] > 0 ? v[f] * (v[f] - V(i, j - 1)) : v[f] * (V(i, j + 1) - v[f])) / dx;
        const grad = (h[j * n + i] - h[(j - 1) * n + i]) / dx;
        const br = SLOSH_BREAKING * Math.hypot(v[f], ub) * invC;
        vn[f] = clampSpeed((v[f] + dt * (-g * grad + ay - adv)) / (1 + (r + br) * dt), vmax);
      }
    }
    u.set(un);
    v.set(vn);

    // Continuity, backward: flux of the face's depth (the mean of its two cells) times the new speed. Flux form, so every cell's loss is a neighbour's gain: the mass is conserved to the float's rounding.
    for (let j = 0; j < n; j++) for (let i = 1; i < n; i++) {
      const f = j * (n + 1) + i;
      fu[f] = openU[f] ? 0.5 * (h[j * n + i - 1] + h[j * n + i]) * u[f] : 0;
    }
    for (let j = 1; j < n; j++) for (let i = 0; i < n; i++) {
      const f = j * n + i;
      fv[f] = openV[f] ? 0.5 * (h[(j - 1) * n + i] + h[j * n + i]) * v[f] : 0;
    }
    // A positivity limiter: no cell is let out below the floor in one step. Its outflow is scaled, the face's flux by its source cell's share, so what leaves one cell still arrives in the next.
    const floor = SLOSH_FLOOR * this.restDepth;
    const k = dt / dx;
    const keep = this.keep;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const c = j * n + i;
      if (!this.wet[c]) { keep[c] = 1; continue; }
      const out = Math.max(fu[j * (n + 1) + i + 1], 0) + Math.max(-fu[j * (n + 1) + i], 0)
                + Math.max(fv[(j + 1) * n + i], 0) + Math.max(-fv[j * n + i], 0);
      const room = Math.max(0, h[c] - floor);
      keep[c] = out * k > room ? room / (out * k) : 1;
    }
    for (let j = 0; j < n; j++) for (let i = 1; i < n; i++) {
      const f = j * (n + 1) + i;
      if (!openU[f]) continue;
      fu[f] *= fu[f] > 0 ? keep[j * n + i - 1] : keep[j * n + i];
    }
    for (let j = 1; j < n; j++) for (let i = 0; i < n; i++) {
      const f = j * n + i;
      if (!openV[f]) continue;
      fv[f] *= fv[f] > 0 ? keep[(j - 1) * n + i] : keep[j * n + i];
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const c = j * n + i;
      if (!this.wet[c]) continue;
      h[c] -= k * (fu[j * (n + 1) + i + 1] - fu[j * (n + 1) + i] + fv[(j + 1) * n + i] - fv[j * n + i]);
    }
  }

  /**
   * The flow at the cell centres for the GPU: RGBA32F, n × n, row j the plate's
   * y at (j + 0.5)/n. Red and green are the velocity in plate widths a second
   * (the mean of the cell's two faces, so a cell by a wall reads half its
   * neighbour's), blue the depth over the rest depth, which nothing reads yet
   * and the check does. Cells outside the dish are zero.
   */
  field(out: Float32Array): Float32Array {
    const { n } = this;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const c = j * n + i, o = c * 4;
      if (!this.wet[c]) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
      out[o] = 0.5 * (this.u[j * (n + 1) + i] + this.u[j * (n + 1) + i + 1]);
      out[o + 1] = 0.5 * (this.v[j * n + i] + this.v[(j + 1) * n + i]);
      out[o + 2] = this.h[c] / this.restDepth;
      out[o + 3] = 0;
    }
    return out;
  }
}
