/*
  The rhythm sheet, solved (PLAN 27f-4).

  Off the looks that may move the frame, Beat Squeeze's kick is a fingertip
  on a thin sheet floating on the liquid (0.1 mm of polyester, an overhead
  projector's transparency; lib/squish.ts kickPress). Until this, the kick
  laid the dent's held shape as a stamp, a clamped bowl 2.28 bending lengths
  across, and gave it back over a third of a second by a cosine. That was a
  picture of the answer. The sheet has an equation, and it can be solved.

  A sheet of bending stiffness D floating on a layer of depth h, pressed by
  a load F, is held up by the liquid's pressure under it; the liquid drains
  from under a dent by lubrication (Reynolds), and what it drains to stands
  higher, against its weight:

      D∇⁴w + ρg w = F − p,        ∂h/∂t = ∇·(h³/12μ ∇p),        h = h₀ − w

  so the dent w (positive closes the gap) moves as

      w_t = M ∇²(D∇⁴w + ρg w − F),        M = h₀³/12μ

  (the elastohydrodynamic sheet of Hosoi and Mahadevan 2004 and Lister,
  Peng and Neufeld 2013, on a floating foundation: the ρg w is Archimedes,
  the floating plate of Hertz's ice sheets). With the layer's mobility read
  at its rest depth this is linear with constant coefficients, so every
  Fourier mode is on its own:

      ŵ_t = −M k² (D k⁴ + ρg) ŵ + M k² F̂

  and over a step of dt in which the load holds still it has the exact
  answer (an exponential integrator, stable at any step):

      ŵ ← e^(−λ dt) ŵ + (1 − e^(−λ dt)) F̂ / (D k⁴ + ρg),    λ = M k² (D k⁴ + ρg)

  The weight is not small. 27f-3's reach left it out, the bending length
  (M D T)^(1/6) alone; but the sheet's bending and the liquid's weight
  balance at (D/ρg)^(1/4), 14 mm for this sheet, and a dent is wider than
  that, so over most of it the weight holds the sheet up more than its
  stiffness does. It also sets how fast a dent levels: the weight drives
  the layer like a puddle levelling, at a diffusivity Mρg, 0.18 m²/s in
  6 mm of water, 8e-3 on the default oil, 2e-4 in glycerine.

  So the sheet's whole life follows, none of it drawn (`npm run sheet`,
  on the plate's 20 cm at the 6 mm middle). The held shapes are the
  floating sheet's whatever moves the liquid; the paces are the
  lubrication equation's, and only glycerine's are the liquid's own
  (PLAN 27f-8(f), below):
  - Water: the dent is a floating plate's (a Kelvin kei), 57 mm to its
    zero with a ring of 2% round it; let go, the equation levels it within
    a frame (96% of it), what is left going as the dish's slowest mode.
  - The default oil: 43 mm, a ring of 7% at 63 mm; let go, the equation
    gives two thirds of it back in the first 60th of a second (the
    finger's sharp middle), 96% by a fifth of a second, all within one.
  - Glycerine: 24 mm, a ring of 14% at 35 mm, the bending length's dent;
    let go, it gives back three quarters in a fifth of a second and 94% in
    a second, and holds a trace for two.
  The thicker the liquid, the narrower its dent, the higher its ring and
  the slower it lets go.

  Lubrication is itself a shortcut, and named (27f-8(f)). Reynolds's
  equation holds when the layer's viscous time h²/ν is short against the
  motion: at 6 mm that is 36 s in water, 1.6 s on the default oil and
  0.036 s in glycerine, where the solved dent (k = 1/14 mm) relaxes in
  0.6 ms, 13 ms and 0.57 s. Only glycerine is inside it; the oil is about
  125 times outside and water 6×10⁴. There the liquid's inertia sets the
  pace: let go, a dent under the sheet rings as a flexural-gravity wave,
  ω² = (gk + Dk⁵/ρ) tanh kh, a period near 0.27 s at that k, damped by the
  Stokes layers (1.4 mm deep on the oil), a couple of swings on the oil
  and many in water, where the equation has it gone at once (the review
  of #452).

  The rim. The dish's rim meets the reservoir round it, where the liquid's
  pressure is the open air's (the thin gap's open rim, p = 0), and the sheet
  lies on it at rest. Laid on a square box twice the plate's side with the
  plate in one corner and its mirror images, negated, in the other three
  (a load F at (x, y) answered by −F at (−x, y) and (x, −y) and F at
  (−x, −y)), every mode is a product of sines that vanish, with ∇²w and
  ∇⁴w, on the plate's edges: the sheet held at rest there with the
  pressure at zero, exactly, and still one mode at a time. Liquid a press
  drives to the rim goes out to the reservoir and comes back from it, so the
  dish's mean gap returns where an unbounded sheet would carry it away:
  kicked twice a second for two minutes, the dish's mean gap sits within
  1.5% of a dent's depth of rest on the default oil and 7% in glycerine.

  The grid. SHEET_N cells over the box of SHEET_SPAN plates: 128 over two
  is 3.1 mm a cell, glycerine's dent eight cells to its zero. The solve is
  exact for every mode it holds; sampling it onto the app's grid is the only
  error (the held dent against the Hankel integral of the same equation, in
  `npm run sheet`). The finger's load is a Gaussian of FINGER_SIGMA, a
  fingertip's contact; finer, it would only add modes too fast to see.

  How deep. A kick presses as hard as pushes out from under the sheet,
  within the dent's reach, the liquid the stamped bowl closed there
  (stampedVolume: the bowl closed as the shader's Stefan film closes it), so
  the dial moves the colour as it did; but its middle never closes past
  SHEET_DEEPEST, two thirds of the gap. Pressed only as deep in the middle
  as the bowl was (the first cut), the finger's sharper dent pushed out two
  thirds of the bowl's liquid inside 30 cells, and `npm run rides`' ring
  there went 1.9 cells at the default and 3.4 at full against the stamp's
  3.0 and 6.8. Now the default oil's middle closes 39% of the gap (the
  stamp's 28%), water's 50%, glycerine's 32%, and full stops at the cap on
  every liquid with 61 to 78% of the bowl's volume. Held that deep in water
  or oil the dent is the floating plate's, F/8√(Dρg): a few grams' weight.

  How it reaches the plate. Each step the change in w, sampled on the app's
  grid, is laid as the gap's change through its own channel (`sheetGap` in
  applyDeltas, squeezeUpdate's `sheetT`), which the shader takes as solved:
  no Stefan closing on top (the solve is the film's drainage already) and no
  ceiling at rest (the ring is the sheet past rest). The gap's spring, which
  the shader runs on every cell, pulls the laid dent back toward rest too,
  so the sheet's own state takes the same spring each step, and what is laid
  is only the sheet's own motion. On a dome (Plate Shape below zero) the
  middle rests near the floor: a kick there presses no deeper than the
  dome's rest under it allows (kickRoom), and what the floor still refuses
  of a dent's flank is owed in the shader and paid out of the sheet's next
  openings, so the gap stays the floor or rest minus the dent, whichever is
  higher. And the sheet's rate is kept apart from the rate the press
  memory carries on (squeezeUpdate's third number), so every other press
  keeps its tail while a kick's sheet is live.

  Named shortcuts (PLAN 27f-8): the mobility is the rest depth's, h₀³, not
  h³ of the gap under the dent (at full the dent's middle is half the gap,
  where the film drains an eighth as fast); the sheet's rim is the plate's
  square, the dish's is its circle; the gap under it is the plate's 6 mm
  middle everywhere, not the dome; the force is set from the stamp's
  volume, not a hand's; and (f) the layer drains by lubrication, which is
  the liquid's pace only in glycerine (above).
*/

/** Cells across the sheet's own grid (a power of two). */
export const SHEET_N = 128;
/** How many plate widths the sheet's grid spans: the plate, and its mirror images (the rim, below). */
export const SHEET_SPAN = 2;
/** The fingertip's load, a Gaussian this wide (m). */
export const FINGER_SIGMA = 0.005;
/**
 * The deepest a kick presses the sheet's middle (plate widths): two thirds of
 * the 0.03 rest gap. Past it the linear sheet's drainage is no longer the
 * film's (the film under the middle drains at (1/3)³, a twenty-seventh, of the
 * rest's; PLAN 27f-8(a)), and the shader's floor is near. Only full Beat
 * Squeeze on the thin liquids reaches it.
 */
export const SHEET_DEEPEST = 0.02;
/** Below this anywhere on the plate (plate widths, 2 µm on a 20 cm plate: under a three-thousandth of the gap) a sheet with nothing on it stops being stepped. */
export const SHEET_QUIET = 1e-5;
/** The tightest the gap closes (plate widths): squeezeUpdate's floor. */
export const GAP_FLOOR = 0.004;

/**
 * The gap's rest at plate fraction (x, y) under Plate Shape `curve`, as the
 * shader lays it (gapRest, squeezeUpdate: 0.03 bowed by the shape, between
 * the floor and 0.06). Below zero the glasses touch in the middle.
 */
export function plateRest(x: number, y: number, curve: number): number {
  const dx = x - 0.5, dy = y - 0.5;
  const r2 = Math.max(0, Math.min(1, (dx * dx + dy * dy) * 4));
  const c = Number.isFinite(curve) ? curve : 0;
  return Math.max(GAP_FLOOR, Math.min(0.06, 0.03 * (1 - c * (r2 - 0.5) * 2)));
}

/**
 * How deep a kick at (x, y) may press the sheet's middle on Plate Shape
 * `curve` (plate widths): SHEET_DEEPEST, or the dome's rest there less the
 * floor where that is less. The sheet is solved on the plate's flat 6 mm
 * (PLAN 27f-8(c)); on a dome whose middle rests near the floor a dent there
 * closed more than the gap had, the floor refused it, and the sheet's state
 * then held a press the plate never made. The flanks the floor still takes
 * are owed in the shader (squeezeUpdate's fourth number).
 */
export function kickRoom(x: number, y: number, curve: number): number {
  return Math.max(0, Math.min(SHEET_DEEPEST, plateRest(x, y, curve) - GAP_FLOOR));
}

interface Press { x: number; y: number; force: number; hold: number; age: number }

/** An in-place radix-2 complex FFT over `n` values `stride` apart from `off`, inverse (e^(+i)), unnormalised. */
function ifft1(re: Float64Array, im: Float64Array, off: number, stride: number, n: number, cos: Float64Array, sin: Float64Array, rev: Uint16Array): void {
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (i < j) {
      const a = off + i * stride, b = off + j * stride;
      let t = re[a]; re[a] = re[b]; re[b] = t;
      t = im[a]; im[a] = im[b]; im[b] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * step], s = sin[k * step];
        const a = off + (i + k) * stride, b = a + half * stride;
        const vr = re[b] * c - im[b] * s, vi = re[b] * s + im[b] * c;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
      }
    }
  }
}

export class RhythmSheet {
  readonly n: number;
  readonly span: number;
  readonly plateMetres: number;
  /** The sheet's bending stiffness (N·m) and the film's rest depth (m). */
  readonly D: number;
  readonly h0: number;
  /** The film's mobility h₀³/12μ (m³/Pa·s), from `setLiquid`. */
  private M = 0;
  /** The liquid's weight a metre of depth, ρg (Pa/m): what holds a floating sheet up where it is pushed down (Archimedes). */
  private rhoG = 9810;
  private readonly dx: number;
  /** k² per mode, and the finger's Gaussian per mode. */
  private readonly k2: Float64Array;
  private readonly finger: Float64Array;
  private readonly kx: Float64Array;
  /** The sheet's state in Fourier (physical transform: ∫ w e^(−ik·x) dx). */
  private readonly wr: Float64Array;
  private readonly wi: Float64Array;
  /** The loads on it now, in Fourier, summed. */
  private readonly fr: Float64Array;
  private readonly fi: Float64Array;
  private loadsStale = true;
  /** Scratch for the inverse transform: the sheet in space, the half spectrum down its columns, one row. */
  private readonly sr: Float64Array;
  private readonly cr: Float64Array;
  private readonly ci: Float64Array;
  private readonly tr: Float64Array;
  private readonly ti: Float64Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly rev: Uint16Array;
  private presses: Press[] = [];
  /** The dent as the plate holds it now, on the app's grid (L × L, metres): what the next step's change is taken from. */
  private held: Float64Array | null = null;
  private heldL = 0;
  /** Each mode's held gain for a newton, cached for the liquid and hold it was worked out for; and a row of sines. */
  private readonly unitGain: { M: number; hold: number; g: Float64Array };
  private readonly sx: Float64Array;
  private readonly sy: Float64Array;
  /** A unit force's held dent in Fourier, for pressVolume to integrate. */
  private readonly ur: Float64Array;
  private readonly ui: Float64Array;
  /** Whether anything on the sheet is still moving: false until the first press and again once it is quiet. */
  live = false;
  /** Steps laid, presses taken, and the gap laid summed over every cell (plate widths): for the checks. */
  steps = 0;
  pressCount = 0;
  laid = 0;
  /** The gap closed, summed over every cell a step closed (plate widths), and the cells closed while a finger was down: as applySquish counts a press. */
  closed = 0;
  pressedCells = 0;
  /** The deepest the dent was anywhere on the plate at the last step (plate widths, either sign): what the quiet is judged on. */
  peak = 0;

  constructor(opts: { n?: number; span?: number; plateMetres?: number; D?: number; h0?: number } = {}) {
    this.n = opts.n ?? SHEET_N;
    this.span = opts.span ?? SHEET_SPAN;
    this.plateMetres = opts.plateMetres ?? 0.2;
    // 0.1 mm of polyester (E 4 GPa, ν 0.4): lib/squish.ts SHEET_D, written out so this file stands alone.
    this.D = opts.D ?? (4e9 * 1e-4 ** 3) / (12 * (1 - 0.4 * 0.4));
    this.h0 = opts.h0 ?? 0.006;
    const n = this.n, n2 = n * n;
    const side = this.span * this.plateMetres;
    this.dx = side / n;
    this.kx = new Float64Array(n);
    for (let m = 0; m < n; m++) this.kx[m] = (2 * Math.PI * (m < n / 2 ? m : m - n)) / side;
    this.k2 = new Float64Array(n2);
    this.finger = new Float64Array(n2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k2 = this.kx[i] * this.kx[i] + this.kx[j] * this.kx[j];
      this.k2[i + j * n] = k2;
      this.finger[i + j * n] = Math.exp(-0.5 * FINGER_SIGMA * FINGER_SIGMA * k2);
    }
    this.wr = new Float64Array(n2); this.wi = new Float64Array(n2);
    this.fr = new Float64Array(n2); this.fi = new Float64Array(n2);
    this.sr = new Float64Array(n2);
    this.cr = new Float64Array(n * (n / 2 + 1)); this.ci = new Float64Array(n * (n / 2 + 1));
    this.tr = new Float64Array(n); this.ti = new Float64Array(n);
    this.cos = new Float64Array(n / 2); this.sin = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) { this.cos[k] = Math.cos((2 * Math.PI * k) / n); this.sin[k] = Math.sin((2 * Math.PI * k) / n); }
    this.decay = { dt: -1, M: -1, e: new Float64Array(n2), g: new Float64Array(n2) };
    this.unitGain = { M: -1, hold: -1, g: new Float64Array(n2) };
    this.sx = new Float64Array(n); this.sy = new Float64Array(n);
    this.ur = new Float64Array(n2); this.ui = new Float64Array(n2);
    this.rev = new Uint16Array(n);
    const bits = Math.round(Math.log2(n));
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); this.rev[i] = r; }
    this.setLiquid(1e-6);
  }

  /** The liquid under the sheet: kinematic viscosity `nu` (m²/s) at `density`. */
  setLiquid(nu: number, density = 1000): void {
    const mu = density * Math.max(1e-7, Number.isFinite(nu) ? nu : 1e-6);
    this.M = this.h0 ** 3 / (12 * mu);
    this.rhoG = density * 9.81;
  }

  /** The bending length (m) of a press held `hold` seconds on this liquid. */
  bendingLength(hold: number): number { return Math.pow(this.M * this.D * hold, 1 / 6); }

  /** Where a plate fraction sits on the sheet's grid, in metres from its origin. */
  private metres(u: number): number { return u * this.plateMetres; }

  /**
   * The depth (m) one newton held `hold` from a flat sheet at (x, y) (metres)
   * leaves under itself, with its images: the inverse transform at the
   * press's own point, (1/A) Σ 4 g(k) G(k) sin²(kₓx) sin²(k_y y), g the held
   * gain (1 − e^(−λT))/(Dk⁴ + ρg). Shallower near the rim, which holds the sheet.
   */
  private unitCentre(x: number, y: number, hold: number): number {
    const n = this.n;
    const c = this.unitGain;
    if (c.M !== this.M || c.hold !== hold) {
      for (let q = 1; q < this.k2.length; q++) { const k2 = this.k2[q], stiff = this.D * k2 * k2 + this.rhoG; c.g[q] = (this.finger[q] * -Math.expm1(-this.M * k2 * stiff * hold)) / stiff; }
      c.M = this.M; c.hold = hold;
    }
    const sx = this.sx, sy = this.sy;
    for (let m = 0; m < n; m++) { sx[m] = Math.sin(this.kx[m] * x); sy[m] = Math.sin(this.kx[m] * y); }
    let s = 0;
    for (let j = 0; j < n; j++) { const b = sy[j] * sy[j]; if (b === 0) continue; for (let i = 0; i < n; i++) s += c.g[i + j * n] * sx[i] * sx[i] * b; }
    const side = this.span * this.plateMetres;
    return (4 * s) / (side * side);
  }

  /**
   * A fingertip at plate fraction (x, y), held `hold` seconds then lifted,
   * pressing as hard as makes its own dent reach `depth` (plate widths) at
   * its middle by the time it lets go.
   */
  press(x: number, y: number, depth: number, hold: number): void {
    if (!(depth > 0) || !(hold > 0)) return;
    // Inside the dish's square: a finger on the rim presses nothing (the rim holds the sheet at rest).
    const X = this.metres(Math.max(0.01, Math.min(0.99, x))), Y = this.metres(Math.max(0.01, Math.min(0.99, y)));
    const force = (depth * this.plateMetres) / this.unitCentre(X, Y, hold);
    this.load(X, Y, force, hold);
  }

  /**
   * A kick: a fingertip at plate fraction (x, y), held `hold` seconds, pressing
   * as hard as pushes `volume` (plate widths³: gap closed × area) out from
   * under the sheet within `radius` (plate widths) of it by the time it lets
   * go, the stamped bowl's own (stampedVolume), but never so hard that the
   * middle closes past `deepest` (SHEET_DEEPEST, or less where the dome's rest
   * under it is shallower: kickRoom). Returns the depth its own middle reaches,
   * 0 with no room to press at all.
   *
   * Why the volume and not the stamp's middle depth: the colour a press
   * moves is the liquid it pushes out. A finger's dent on a floating sheet
   * is sharper in the middle than the clamped bowl was, so pressed only as
   * deep it pushed out two thirds of the bowl's liquid inside 30 cells, and
   * `npm run rides`' ring 30 cells out went 1.9 cells at the default and 3.4
   * at full, where the stamp's went 3.0 and 6.8 and the line asks 4 at full.
   */
  pressVolume(x: number, y: number, volume: number, radius: number, hold: number, deepest = SHEET_DEEPEST): number {
    if (!(volume > 0) || !(hold > 0) || !(radius > 0) || !(deepest > 0)) return 0;
    const X = this.metres(Math.max(0.01, Math.min(0.99, x))), Y = this.metres(Math.max(0.01, Math.min(0.99, y)));
    const centre = this.unitCentre(X, Y, hold);
    // The unit force's held dent, in space: the same modes as the load would lay, with its gain.
    const n = this.n, sx = this.sx, sy = this.sy, g = this.unitGain.g, ur = this.ur;
    for (let m = 0; m < n; m++) { sx[m] = Math.sin(this.kx[m] * X); sy[m] = Math.sin(this.kx[m] * Y); }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const q = i + j * n; ur[q] = -4 * g[q] * sx[i] * sy[j]; }
    this.ui.fill(0);
    const w = this.toSpace(ur, this.ui);
    const R = radius * this.plateMetres, R2 = R * R;
    let v = 0;
    for (let j = 0; j < n / 2; j++) for (let i = 0; i < n / 2; i++) {
      const dx = i * this.dx - X, dy = j * this.dx - Y;
      if (dx * dx + dy * dy < R2) v += w[i + j * n];
    }
    v *= this.dx * this.dx;
    const want = volume * this.plateMetres ** 3;
    const force = Math.min(want / Math.max(v, 1e-30), (Math.min(SHEET_DEEPEST, deepest) * this.plateMetres) / centre);
    this.load(X, Y, force, hold);
    return (force * centre) / this.plateMetres;
  }

  private load(x: number, y: number, force: number, hold: number): void {
    this.presses.push({ x, y, force, hold, age: 0 });
    this.loadsStale = true;
    this.live = true;
    this.pressCount++;
  }

  /**
   * The loads pressing now, summed in Fourier: each a Gaussian at its point
   * and its three images, F e^(−σ²k²/2) (e^(−ik·x) − ...), which sum to the
   * real −4F e^(−σ²k²/2) sin(kₓx) sin(k_y y).
   */
  private sumLoads(): void {
    const n = this.n, sx = this.sx, sy = this.sy;
    this.fr.fill(0); this.fi.fill(0);
    for (const p of this.presses) {
      if (p.age >= p.hold) continue;
      for (let m = 0; m < n; m++) { sx[m] = Math.sin(this.kx[m] * p.x); sy[m] = Math.sin(this.kx[m] * p.y); }
      for (let j = 0; j < n; j++) {
        const b = -4 * p.force * sy[j];
        if (b === 0) continue;
        for (let i = 0; i < n; i++) this.fr[i + j * n] += b * this.finger[i + j * n] * sx[i];
      }
    }
    this.loadsStale = false;
  }

  /** Each mode's decay e^(−λ dt) and its load's gain (1 − e^(−λ dt))/(Dk⁴ + ρg) over a step of `dt`, kept for the dt and liquid they were worked out for (a frame's step is the same step after step). */
  private decayFor(dt: number): { e: Float64Array; g: Float64Array } {
    const c = this.decay;
    if (c.dt === dt && c.M === this.M) return c;
    for (let q = 1; q < this.k2.length; q++) {
      const k2 = this.k2[q], stiff = this.D * k2 * k2 + this.rhoG;
      const lam = this.M * k2 * stiff * dt;
      c.e[q] = Math.exp(-lam);
      c.g[q] = -Math.expm1(-lam) / stiff;
    }
    // The mean never moves: the film cannot be squeezed.
    c.e[0] = 1; c.g[0] = 0;
    c.dt = dt; c.M = this.M;
    return c;
  }
  private readonly decay: { dt: number; M: number; e: Float64Array; g: Float64Array };

  /** Every mode over `dt` with the loads that press now: exact. */
  private evolve(dt: number): void {
    if (this.loadsStale) this.sumLoads();
    const loaded = this.presses.some((p) => p.age < p.hold);
    const { e, g } = this.decayFor(dt);
    const wr = this.wr, wi = this.wi, fr = this.fr, fi = this.fi;
    if (loaded) {
      for (let q = 0; q < wr.length; q++) { wr[q] = e[q] * wr[q] + g[q] * fr[q]; wi[q] = e[q] * wi[q] + g[q] * fi[q]; }
    } else {
      for (let q = 0; q < wr.length; q++) { wr[q] *= e[q]; wi[q] *= e[q]; }
    }
  }

  /** The sheet in real space on its own grid (metres), into the scratch's real part. */
  private toSpace(wr: Float64Array = this.wr, wi: Float64Array = this.wi): Float64Array {
    /*
      The sheet is real, so its transform is Hermitian, ŵ(−k) = ŵ(k)*, and
      half the work of a plain inverse is the other half's conjugate. Down
      the columns only for the x-frequencies 0 to n/2 (the rest are those
      conjugated); then along the rows two at a time, the second row as the
      imaginary part of the first, since each row's inverse is real. The
      whole inverse took 1.2 ms a step in node as two plain passes, half the
      app's sheet budget; this is about half of that.
    */
    const n = this.n, h = n / 2, tr = this.tr, ti = this.ti, out = this.sr, cr = this.cr, ci = this.ci;
    for (let i = 0; i <= h; i++) {
      for (let j = 0; j < n; j++) { tr[j] = wr[i + j * n]; ti[j] = wi[i + j * n]; }
      ifft1(tr, ti, 0, 1, n, this.cos, this.sin, this.rev);
      for (let j = 0; j < n; j++) { cr[i + j * (h + 1)] = tr[j]; ci[i + j * (h + 1)] = ti[j]; }
    }
    const side = this.span * this.plateMetres, a = 1 / (side * side);
    for (let j = 0; j < n; j += 2) {
      const o1 = j * (h + 1), o2 = (j + 1) * (h + 1);
      for (let i = 0; i < n; i++) {
        // Row j's spectrum plus i times row j+1's, each row's upper half its lower half conjugated.
        if (i <= h) { tr[i] = cr[o1 + i] - ci[o2 + i]; ti[i] = ci[o1 + i] + cr[o2 + i]; }
        else { const m = n - i; tr[i] = cr[o1 + m] + ci[o2 + m]; ti[i] = -ci[o1 + m] + cr[o2 + m]; }
      }
      ifft1(tr, ti, 0, 1, n, this.cos, this.sin, this.rev);
      for (let i = 0; i < n; i++) { out[i + j * n] = tr[i] * a; out[i + (j + 1) * n] = ti[i] * a; }
    }
    return out;
  }

  /** The sheet's dent now (plate widths, positive closes the gap) at plate fraction (x, y): for the checks. */
  depthAt(x: number, y: number): number {
    const w = this.toSpace();
    return this.sample(w, this.metres(x) / this.dx, this.metres(y) / this.dx) / this.plateMetres;
  }

  /** How much of the sheet's dent is net volume: |∫w| over ∫|w| on its whole grid (0 when the film's mean is kept, as it must be). For the checks. */
  volumeShare(): number {
    const w = this.toSpace();
    let s = 0, a = 0;
    for (let q = 0; q < w.length; q++) { s += w[q]; a += Math.abs(w[q]); }
    return a > 0 ? Math.abs(s) / a : 0;
  }

  /**
   * The dent's net volume now (plate widths³, positive pushed out) within
   * `radius` plate widths of (x, y): the liquid that has left that disc, the
   * dent's closing less the ring's opening inside it. For the checks, which
   * read how far a kick's liquid goes against it.
   */
  volumeWithin(x: number, y: number, radius: number): number {
    const w = this.toSpace(), n = this.n;
    const X = this.metres(x), Y = this.metres(y), R = radius * this.plateMetres;
    let v = 0;
    for (let j = 0; j < n / this.span; j++) for (let i = 0; i < n / this.span; i++) {
      const dx = i * this.dx - X, dy = j * this.dx - Y;
      if (dx * dx + dy * dy < R * R) v += w[i + j * n];
    }
    return (v * this.dx * this.dx) / this.plateMetres ** 3;
  }

  /** The dent as the plate holds it now (plate widths, positive closes the gap), on the grid it was last laid on: for the checks. */
  heldNow(): Float32Array | null {
    if (!this.held) return null;
    const out = new Float32Array(this.held.length);
    for (let q = 0; q < out.length; q++) out[q] = this.held[q] / this.plateMetres;
    return out;
  }

  /** The dent along a line through (x, y) in the x direction, `count` points `spacing` plate widths apart from x: for the checks. */
  profile(x: number, y: number, count: number, spacing: number): number[] {
    const w = this.toSpace();
    const out: number[] = [];
    for (let k = 0; k < count; k++) out.push(this.sample(w, this.metres(x + k * spacing) / this.dx, this.metres(y) / this.dx) / this.plateMetres);
    return out;
  }

  /** Where each of an L-cell plate's rows (and columns) falls between the sheet's nodes: the bilinear's two nodes and weight. */
  private at0: Int32Array | null = null;
  private at1: Int32Array | null = null;
  private wt: Float64Array | null = null;
  private sampleFor(L: number): void {
    const n = this.n;
    this.held = new Float64Array(L * L); this.heldL = L;
    this.at0 = new Int32Array(L); this.at1 = new Int32Array(L); this.wt = new Float64Array(L);
    for (let i = 0; i < L; i++) {
      const f = this.metres((i + 0.5) / L) / this.dx, f0 = Math.floor(f);
      this.at0[i] = ((f0 % n) + n) % n; this.at1[i] = (this.at0[i] + 1) % n; this.wt[i] = f - f0;
    }
  }

  /** Bilinear on the periodic grid, at grid coordinates (the nodes at whole numbers). */
  private sample(w: Float64Array, fx: number, fy: number): number {
    const n = this.n;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const i0 = ((x0 % n) + n) % n, i1 = (i0 + 1) % n, j0 = ((y0 % n) + n) % n, j1 = (j0 + 1) % n;
    return (1 - ty) * ((1 - tx) * w[i0 + j0 * n] + tx * w[i1 + j0 * n]) + ty * ((1 - tx) * w[i0 + j1 * n] + tx * w[i1 + j1 * n]);
  }

  /**
   * One step of `dtSeconds`: the sheet moved exactly, and its change laid on
   * an L × L plate, added into `out` as the gap's change (plate widths,
   * negative closes it). `spring` is the share of the way back to rest the
   * plate's own spring takes the gap this step (squeezeUpdate's gapSpring),
   * which the laid dent takes too. Returns the cells laid.
   */
  step(L: number, dtSeconds: number, spring: number, out: Float32Array): number {
    if (!this.live) return 0;
    const pressing = this.presses.some((p) => p.age < p.hold);
    const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 1 / 60;
    // In pieces at each lift, so a load that ends inside the step presses for exactly its hold.
    let left = dt;
    while (left > 1e-12) {
      let piece = left;
      for (const p of this.presses) if (p.age < p.hold) piece = Math.min(piece, p.hold - p.age);
      this.evolve(piece);
      for (const p of this.presses) {
        const was = p.age < p.hold;
        p.age += piece;
        if (was && p.age >= p.hold - 1e-12) { p.age = p.hold; this.loadsStale = true; }
      }
      left -= piece;
    }
    this.presses = this.presses.filter((p) => p.age < p.hold);
    if (!this.held || this.heldL !== L) this.sampleFor(L);
    const held = this.held!, at0 = this.at0!, at1 = this.at1!, wt = this.wt!, n = this.n;
    const w = this.toSpace();
    const keep = 1 - Math.max(0, Math.min(1, Number.isFinite(spring) ? spring : 0));
    let cells = 0, most = 0, laid = 0, closed = 0, closing = 0;
    for (let j = 0; j < L; j++) {
      const r0 = at0[j] * n, r1 = at1[j] * n, ty = wt[j];
      for (let i = 0; i < L; i++) {
        const idx = i + j * L;
        const a0 = at0[i], a1 = at1[i], tx = wt[i];
        const now = (1 - ty) * ((1 - tx) * w[a0 + r0] + tx * w[a1 + r0]) + ty * ((1 - tx) * w[a0 + r1] + tx * w[a1 + r1]);
        const change = now - held[idx];
        // Held as the plate will hold it after its spring: the next step's change is the sheet's own.
        held[idx] = now * keep;
        most = Math.max(most, Math.abs(now));
        if (change === 0) continue;
        const g = -change / this.plateMetres;
        laid += g;
        if (g < 0) { closed -= g; closing++; }
        out[idx] += g;
        cells++;
      }
    }
    this.laid += laid;
    this.closed += closed;
    this.peak = most / this.plateMetres;
    if (pressing) this.pressedCells += closing;
    if (keep < 1) for (let q = 0; q < this.wr.length; q++) { this.wr[q] *= keep; this.wi[q] *= keep; }
    this.steps++;
    // Quiet: nothing pressing and nowhere a dent a three-thousandth of the gap. What is left is the plate's spring's.
    if (this.presses.length === 0 && most / this.plateMetres < SHEET_QUIET) this.forget();
    return cells;
  }

  /** Let the sheet go: nothing pressing, nothing moving (a cleared plate). */
  forget(): void {
    this.presses = [];
    this.wr.fill(0); this.wi.fill(0);
    this.held?.fill(0);
    this.loadsStale = true;
    this.live = false;
  }
}

/**
 * The depth (plate widths) the stamped dent closed the gap to at its middle,
 * for a kick of `amount` (each disc's, times kickPress's share): the bowl's
 * middle, 3 × amount, closed as the shader closes a press on a thin gap
 * (squeezeUpdate: 1/h² grows by 2a/h₀³, Stefan's film), from the 0.03 rest.
 * The solved sheet presses as deep, so the dial means what it did.
 */
export function stampedDepth(amount: number, rest = 0.03): number {
  if (!(amount > 0)) return 0;
  const h = 1 / Math.sqrt(1 / (rest * rest) + (2 * 3 * amount) / rest ** 3);
  return rest - Math.max(0.004, h);
}

/**
 * The gap the stamped bowl closed (plate widths³: closed depth × area), for a
 * kick of `amount` over a bowl of `radius` (plate widths): squishDisc's
 * 3 × amount × (1 − r²/R²)² at each radius, closed as squeezeUpdate closes a
 * press (stampedDepth's Stefan film), summed over the bowl. pressVolume
 * pushes as much out from under the solved sheet, so the dial moves the
 * colour as it did.
 */
export function stampedVolume(amount: number, radius: number, rest = 0.03): number {
  if (!(amount > 0) || !(radius > 0)) return 0;
  let v = 0;
  const steps = 400;
  for (let k = 0; k < steps; k++) {
    const r = ((k + 0.5) / steps) * radius, q = 1 - (r * r) / (radius * radius);
    const h = 1 / Math.sqrt(1 / (rest * rest) + (2 * 3 * amount * q * q) / rest ** 3);
    v += (rest - Math.max(0.004, h)) * 2 * Math.PI * r * (radius / steps);
  }
  return v;
}

/** J₀ (Abramowitz and Stegun 9.4.1 and 9.4.3, to 5e-8). */
function besselJ0(x: number): number {
  const ax = Math.abs(x);
  if (ax <= 3) {
    const y = (x / 3) ** 2;
    return 1 + y * (-2.2499997 + y * (1.2656208 + y * (-0.3163866 + y * (0.0444479 + y * (-0.0039444 + y * 0.00021)))));
  }
  const y = 3 / ax;
  const f = 0.79788456 + y * (-0.00000077 + y * (-0.0055274 + y * (-0.00009512 + y * (0.00137237 + y * (-0.00072805 + y * 0.00014476)))));
  const t = ax - 0.78539816 + y * (-0.04166397 + y * (-0.00003954 + y * (0.00262573 + y * (-0.00054125 + y * (-0.00029333 + y * 0.00013558)))));
  return (f * Math.cos(t)) / Math.sqrt(ax);
}

const reachCache = new Map<string, number>();
/**
 * How far the held dent reaches (m, to where it crosses zero) on a liquid of
 * kinematic viscosity `nu`, pressed `hold` seconds: the unbounded sheet's
 * answer at radius r, ∫ G(k)(1 − e^(−λT))/(Dk⁴ + ρg) J₀(kr) k dk, the same
 * equation the grid solves, found here by quadrature so the press's other
 * effects (the slosh dish's press, the beads, the lift's fingers; lib/squish.ts
 * dentRadius) take the solved dent's width without a solve.
 */
export function sheetReach(nu: number, hold: number, h0 = 0.006, density = 1000, D = (4e9 * 1e-4 ** 3) / (12 * (1 - 0.4 * 0.4))): number {
  const key = `${nu}:${hold}:${h0}:${density}:${D}`;
  const hit = reachCache.get(key);
  if (hit !== undefined) return hit;
  const mu = density * Math.max(1e-7, Number.isFinite(nu) ? nu : 1e-6);
  const M = h0 ** 3 / (12 * mu), rhoG = density * 9.81;
  const top = 8 / FINGER_SIGMA, dk = 0.5, ks: number[] = [], ws: number[] = [];
  for (let k = dk / 2; k < top; k += dk) {
    const stiff = D * k ** 4 + rhoG;
    ks.push(k);
    ws.push((Math.exp(-0.5 * (FINGER_SIGMA * k) ** 2) * -Math.expm1(-M * k * k * stiff * hold) / stiff) * k * dk);
  }
  const at = (r: number) => { let v = 0; for (let q = 0; q < ks.length; q++) v += ws[q] * besselJ0(ks[q] * r); return v; };
  // Out from the middle in millimetres to the first change of sign, then halved down to a micron.
  let lo = 0, hi = 0.001;
  while (at(hi) > 0 && hi < 0.3) { lo = hi; hi += 0.001; }
  for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (at(mid) > 0) lo = mid; else hi = mid; }
  const r = (lo + hi) / 2;
  // A Thickness dragged through a show asks for a new one each kick; the last few are all that come back.
  if (reachCache.size > 64) reachCache.clear();
  reachCache.set(key, r);
  return r;
}
