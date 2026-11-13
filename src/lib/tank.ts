/*
  The CPU reference for a tank of water seen through its side wall (PLAN.md
  §47n; judged by `npm run tank` in scripts/tank.mjs, and the GPU solver
  `src/gpu/tank.ts` held to it by `npm run tankgpu`).

  What was asked for. Davy Evans' *Gravity L1* films a glass tank from the
  side: fluorescent dye falls from the top as a jet that stretches over about
  forty seconds into a single thread, lands, and spreads along the floor as a
  gravity current whose head curls into filaments. The owner asked for that
  view on 2026-11-13.

  Why the plate cannot do it. The plate is a thin layer between glass, seen
  from above. Stood upright (Gravity, `plateUpright`) with heavy dye (Dye
  Weight, `solutalBuoyancy`) it pours downhill, but it is a Hele-Shaw cell:
  the glass's drag, 12ν/h² across a millimetre gap, is about ten per second,
  so the flow keeps no momentum from one step to the next (the plate caps the
  carried velocity small on purpose, `decayVel`). A falling jet speeds up
  only because it keeps its momentum, and it thins only because it speeds up;
  a gravity current's head curls only because the shear across its top
  survives long enough to roll up (Kelvin–Helmholtz). Neither can happen in a
  gap. A tank a hand deep has no such drag: across ten centimetres the
  side walls' 12ν/h² is about 10⁻³ per second, nothing over a show's minute.

  The model is the smallest one that has that physics:

  1. A vertical slice through the middle of the tank, W wide and H tall,
     on a staggered (MAC) grid of square cells, row 0 at the floor, gravity
     toward −y. The incompressible Navier–Stokes equations in the
     Boussinesq approximation, with water's own kinematic viscosity
     ν = 1.0e-6 m²/s:
        ∂u/∂t + (u·∇)u = −∇p/ρ₀ + ν∇²u − g′ c ŷ,    ∇·u = 0,
     where c is the dye's concentration (1 is the nozzle's dye) and
     g′ = g Δρ/ρ₀ is gravity reduced by the dye's density excess: half a
     percent (dye in water with a pinch of salt) is g′ ≈ 0.05 m/s².
     Boussinesq because Δρ/ρ₀ is under a few percent: the density differs
     only where it is multiplied by g. The slice is 2D, so a falling jet is
     a sheet, not a rod: mass carried down at speed v through width a keeps
     a·v = Q, so it thins as a ∝ 1/v (a rod's radius thins as (Q/v)^½).
     Written down in PLAN 47n as the shortcut a 3D tank would replace.

  2. The walls and the floor are glass: no slip (the water at the glass
     does not move). The top is the water's free surface: no stress (the
     water slides under it freely) and no flow through it except what the
     nozzle and the level do (3).

  3. The nozzle feeds dye at `feed` m/s through `nozzleW` metres of the
     surface centred at `nozzleX` (0..1 across). Water fed in has to go
     somewhere: the share `drain` leaves through the floor, evenly across
     it (a porous floor, as a stratified-tank experiment's drain spreads
     its suction), and the rest raises the level, which in a frame that
     rides the surface is the same flow leaving evenly through the rest of
     it. Drain at 1 keeps the tank from filling with dye in an endless show;
     at 0 the dye collects on the floor as it does in the film.

  4. The dye is carried in flux form with a minmod-limited second-order
     reconstruction (the same scheme as the soap film, src/lib/soapFilm.ts,
     and for the same two reasons): what crosses a face leaves one cell and
     enters the next, so not a speck is made or lost, and the limiter keeps
     the thread sharp without overshoot. Its molecular diffusivity
     (fluorescein, 4e-10 m²/s) is a thousand times smaller than what any
     grid resolves; the grid's own smearing stands for it and is said so.

  5. The momentum is carried semi-Lagrangian (back along the flow, bilinear
     on the staggered grid, midpoint rule). That smears it by about
     u·dx/2, three times water's ν at a centimetre a second on 0.75 mm
     cells: the slice behaves like slightly thicker water. Replaceable by
     a less diffusive scheme (PLAN 47n-2) without touching anything else.

  6. Viscosity explicitly (ν dt/dx² is under 0.05 at the frame's step on
     the app's grid), then the pressure: red-black SOR on the cell
     divergence with the boundary flows held, warm-started from the last
     step's, and the gradient subtracted from the interior faces.

  Substeps. The step is cut so no flow crosses more than 0.45 of a cell a
  substep. The speed is bounded without reading the field (which on the GPU
  would stall the frame for a readback): no water in the tank moves faster
  than the dye could fall the whole height, √(feed² + 2 g′ H), so the bound
  is 1.5 times that. The GPU uses the same bound, so the two take the same
  substeps.

  The contract (scripts/tank.mjs and scripts/tankgpu.mjs):
    createTank({ nx, ny, width })  → a tank at rest, clear water
    stepTank(t, dt, opts)          advances it dt seconds
    t.u ((nx+1)·ny), t.v (nx·(ny+1)), t.c (nx·ny), row 0 at the floor;
    t.fedIn, t.leftOut: dye in and out across the boundary, in c·m².
*/

export const TANK_NU = 1.0e-6;          // water at 20 °C, m²/s
export const TANK_G = 9.81;
export const TANK_CFL = 0.45;           // of a cell a substep, for the dye's flux form
export const TANK_SPEED_MARGIN = 1.5;   // over the fall speed, for the substep bound
export const TANK_MAX_SUBSTEPS = 24;

export interface Tank {
  nx: number;
  ny: number;
  dx: number;
  /** x-faces, (nx+1)·ny, m/s; i = 0 and i = nx are the walls. */
  u: Float64Array;
  /** y-faces, nx·(ny+1), m/s; j = 0 is the floor, j = ny the surface. */
  v: Float64Array;
  /** dye concentration, nx·ny, 1 = the nozzle's dye. */
  c: Float64Array;
  /** the pressure's impulse, m/s·cell (u −= q_i − q_{i−1}). */
  q: Float64Array;
  fedIn: number;
  leftOut: number;
  /** SOR sweeps the last solve took (the CPU solves to a tolerance). */
  sweeps: number;
}

export interface TankOptions {
  /** g Δρ/ρ₀ for c = 1, m/s². */
  gPrime?: number;
  /** the nozzle's speed, m/s, downward. */
  feed?: number;
  /** the nozzle's centre, 0..1 across. */
  nozzleX?: number;
  /** the nozzle's width, metres. */
  nozzleW?: number;
  /** the share of the fed water leaving through the floor (the rest raises the level). */
  drain?: number;
  nu?: number;
  /** a fixed SOR sweep count (the GPU's way); left out, the CPU solves to `tol`. */
  sweeps?: number;
  tol?: number;
}

export function createTank(o: { nx: number; ny: number; width: number }): Tank {
  const { nx, ny } = o;
  return {
    nx, ny, dx: o.width / nx,
    u: new Float64Array((nx + 1) * ny),
    v: new Float64Array(nx * (ny + 1)),
    c: new Float64Array(nx * ny),
    q: new Float64Array(nx * ny),
    fedIn: 0, leftOut: 0, sweeps: 0,
  };
}

/** The nozzle's cells: the surface faces [i0, i1) it feeds through. At least one. */
export function nozzleSpan(nx: number, dx: number, nozzleX: number, nozzleW: number): [number, number] {
  const n = Math.max(1, Math.min(nx - 1, Math.round(nozzleW / dx)));
  const mid = Math.max(0, Math.min(1, nozzleX)) * nx;
  const i0 = Math.max(0, Math.min(nx - n, Math.round(mid - n / 2)));
  return [i0, i0 + n];
}

/** The substeps a step of dt takes: the fall-speed bound over 0.45 of a cell. */
export function tankSubsteps(dt: number, dx: number, height: number, gPrime: number, feed: number): number {
  const vmax = TANK_SPEED_MARGIN * Math.sqrt(feed * feed + 2 * Math.max(0, gPrime) * height);
  return Math.max(1, Math.min(TANK_MAX_SUBSTEPS, Math.ceil((vmax * dt) / (TANK_CFL * dx))));
}

/** The SOR relaxation for an nx × ny box (optimal for the Laplacian on the longer side). */
export function tankOmega(nx: number, ny: number): number {
  return 2 / (1 + Math.sin(Math.PI / Math.max(nx, ny)));
}

const minmod = (a: number, b: number): number => (a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b);

/*
  The boundary flows of a step: the surface (nozzle in, level out) and the
  floor (the drain out). Held through the step; the projection solves the
  interior around them. Their sum is zero to rounding, which the pure
  Neumann pressure problem needs to have a solution.
*/
function boundaryFlows(t: Tank, o: Required<Pick<TankOptions, 'feed' | 'nozzleX' | 'nozzleW' | 'drain'>>): [number, number] {
  const { nx, ny, dx, v } = t;
  const [i0, i1] = nozzleSpan(nx, dx, o.nozzleX, o.nozzleW);
  const nIn = i1 - i0;
  const qIn = o.feed * nIn;                         // m/s·cells of surface
  const drain = Math.max(0, Math.min(1, o.drain));
  const levelOut = (1 - drain) * qIn / (nx - nIn);  // up through the rest of the surface
  const floorOut = drain * qIn / nx;                // down through the floor
  for (let i = 0; i < nx; i++) {
    v[ny * nx + i] = i >= i0 && i < i1 ? -o.feed : levelOut;
    v[i] = -floorOut;
  }
  return [i0, i1];
}

/*
  Bilinear samples of the staggered faces, clamped to the grid. An x-face
  (i, j) sits at (i·dx, (j+½)·dx); a y-face at ((i+½)·dx, j·dx). In cell
  units here: X = x/dx, Y = y/dx.
*/
function sampleU(t: Tank, u: Float64Array, X: number, Y: number): number {
  const { nx, ny } = t;
  const fx = Math.max(0, Math.min(nx, X)), fy = Math.max(0, Math.min(ny - 1, Y - 0.5));
  const i = Math.min(nx - 1, Math.floor(fx)), j = Math.min(ny - 2, Math.floor(fy));
  const a = fx - i, b = fy - j, w = nx + 1;
  if (ny < 2) return u[i] * (1 - a) + u[i + 1] * a;
  return (u[j * w + i] * (1 - a) + u[j * w + i + 1] * a) * (1 - b) + (u[(j + 1) * w + i] * (1 - a) + u[(j + 1) * w + i + 1] * a) * b;
}
function sampleV(t: Tank, v: Float64Array, X: number, Y: number): number {
  const { nx, ny } = t;
  const fx = Math.max(0, Math.min(nx - 1, X - 0.5)), fy = Math.max(0, Math.min(ny, Y));
  const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(ny - 1, Math.floor(fy));
  const a = fx - i, b = fy - j;
  return (v[j * nx + i] * (1 - a) + v[j * nx + i + 1] * a) * (1 - b) + (v[(j + 1) * nx + i] * (1 - a) + v[(j + 1) * nx + i + 1] * a) * b;
}

let scratchU = new Float64Array(0), scratchV = new Float64Array(0), scratchC = new Float64Array(0), scratchD = new Float64Array(0);

export function stepTank(t: Tank, dt: number, opts: TankOptions = {}): void {
  const { nx, ny, dx, u, v, c, q } = t;
  const o = {
    gPrime: opts.gPrime ?? TANK_G * 0.005,
    feed: Math.max(0, opts.feed ?? 0),
    nozzleX: opts.nozzleX ?? 0.5,
    nozzleW: opts.nozzleW ?? 3e-3,
    drain: opts.drain ?? 1,
    nu: opts.nu ?? TANK_NU,
  };
  const n = tankSubsteps(dt, dx, ny * dx, o.gPrime, o.feed);
  const h = dt / n;
  const wU = nx + 1;
  if (scratchU.length !== u.length) scratchU = new Float64Array(u.length);
  if (scratchV.length !== v.length) scratchV = new Float64Array(v.length);
  if (scratchC.length !== c.length) { scratchC = new Float64Array(c.length); scratchD = new Float64Array(c.length); }
  const u0 = scratchU, v0 = scratchV, c0 = scratchC, div = scratchD;
  const [i0, i1] = boundaryFlows(t, o);
  const omega = tankOmega(nx, ny);

  for (let s = 0; s < n; s++) {
    /*
      1. The dye, in flux form on the faces' flows (divergence-free from the
      last projection, the boundary's held). A face's concentration is the
      upwind cell's, reconstructed to the face with a minmod slope and moved
      back by the half of the cell the flow crosses in the substep; across
      the surface, what comes in is the nozzle's dye (c = 1) and what goes
      out is the top cell's; across the floor, the bottom cell's.
    */
    c0.set(c);
    const cAt = (i: number, j: number) => c0[Math.max(0, Math.min(ny - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
    const k = h / dx;
    let fed = 0, out = 0;
    // x-faces: interior only, the walls carry nothing.
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
      const vel = u[j * wU + i];
      let cf: number;
      if (vel >= 0) cf = cAt(i - 1, j) + 0.5 * (1 - vel * k) * minmod(cAt(i - 1, j) - cAt(i - 2, j), cAt(i, j) - cAt(i - 1, j));
      else cf = cAt(i, j) - 0.5 * (1 + vel * k) * minmod(cAt(i, j) - cAt(i - 1, j), cAt(i + 1, j) - cAt(i, j));
      const F = vel * cf * k;
      c[j * nx + i - 1] -= F;
      c[j * nx + i] += F;
    }
    // y-faces, the floor and the surface with them.
    for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) {
      const vel = v[j * nx + i];
      let cf: number;
      if (j === 0) cf = vel < 0 ? cAt(i, 0) : 0;
      else if (j === ny) cf = vel < 0 ? (i >= i0 && i < i1 ? 1 : 0) : cAt(i, ny - 1);
      else if (vel >= 0) cf = cAt(i, j - 1) + 0.5 * (1 - vel * k) * minmod(cAt(i, j - 1) - cAt(i, j - 2), cAt(i, j) - cAt(i, j - 1));
      else cf = cAt(i, j) - 0.5 * (1 + vel * k) * minmod(cAt(i, j) - cAt(i, j - 1), cAt(i, j + 1) - cAt(i, j));
      const F = vel * cf * k;
      if (j > 0) c[(j - 1) * nx + i] -= F; else out -= F; // F < 0 at the floor is dye leaving downward
      if (j < ny) c[j * nx + i] += F; else if (F < 0) fed -= F; else out += F;
    }
    t.fedIn += fed * dx * dx;
    t.leftOut += out * dx * dx;

    /*
      2. The momentum, carried back along the flow (midpoint rule) from the
      last substep's faces. The boundary faces keep their held values.
    */
    u0.set(u); v0.set(v);
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
      const X = i, Y = j + 0.5;
      const ux = u0[j * wU + i], vy = sampleV(t, v0, X, Y);
      const Xm = X - 0.5 * k * ux, Ym = Y - 0.5 * k * vy;
      const Xd = X - k * sampleU(t, u0, Xm, Ym), Yd = Y - k * sampleV(t, v0, Xm, Ym);
      u[j * wU + i] = sampleU(t, u0, Xd, Yd);
    }
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
      const X = i + 0.5, Y = j;
      const ux = sampleU(t, u0, X, Y), vy = v0[j * nx + i];
      const Xm = X - 0.5 * k * ux, Ym = Y - 0.5 * k * vy;
      const Xd = X - k * sampleU(t, u0, Xm, Ym), Yd = Y - k * sampleV(t, v0, Xm, Ym);
      v[j * nx + i] = sampleV(t, v0, Xd, Yd);
    }

    /*
      3. The dye's weight on the interior y-faces (the mean of the two cells
      either side, this substep's dye), and 4. water's viscosity, explicitly,
      on what step 2 carried. Glass is no-slip: past a wall the tangential
      flow mirrors negative (the wall halfway between the face and its
      ghost). The surface is stress-free: past it the tangential flow
      mirrors positive.
    */
    u0.set(u); v0.set(v);
    const nuK = o.nu * h / (dx * dx);
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
      const m = u0[j * wU + i];
      const dn = j > 0 ? u0[(j - 1) * wU + i] : -m;
      const up = j < ny - 1 ? u0[(j + 1) * wU + i] : m;
      u[j * wU + i] = m + nuK * (u0[j * wU + i - 1] + u0[j * wU + i + 1] + dn + up - 4 * m);
    }
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
      const m = v0[j * nx + i];
      const lf = i > 0 ? v0[j * nx + i - 1] : -m;
      const rt = i < nx - 1 ? v0[j * nx + i + 1] : -m;
      const weight = o.gPrime * 0.5 * (c[(j - 1) * nx + i] + c[j * nx + i]);
      v[j * nx + i] = m + nuK * (lf + rt + v0[(j - 1) * nx + i] + v0[(j + 1) * nx + i] - 4 * m) - weight * h;
    }

    /*
      5. The pressure. Σ over open neighbours (q_nb − q) = div·dx, red-black
      SOR, warm from the last solve, walls closed (their faces held, so no
      neighbour across them). Then the interior faces lose the gradient.
    */
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      div[j * nx + i] = u[j * wU + i + 1] - u[j * wU + i] + v[(j + 1) * nx + i] - v[j * nx + i];
    }
    const fixed = opts.sweeps;
    const tol = opts.tol ?? 1e-9;
    let sweeps = 0;
    for (;;) {
      let resid = 0;
      for (let colour = 0; colour < 2; colour++) {
        for (let j = 0; j < ny; j++) for (let i = (j + colour) & 1; i < nx; i += 2) {
          let sum = 0, deg = 0;
          if (i > 0) { sum += q[j * nx + i - 1]; deg++; }
          if (i < nx - 1) { sum += q[j * nx + i + 1]; deg++; }
          if (j > 0) { sum += q[(j - 1) * nx + i]; deg++; }
          if (j < ny - 1) { sum += q[(j + 1) * nx + i]; deg++; }
          const target = (sum - div[j * nx + i]) / deg;
          const d = target - q[j * nx + i];
          if (Math.abs(d) > resid) resid = Math.abs(d);
          q[j * nx + i] += omega * d;
        }
      }
      sweeps++;
      if (fixed !== undefined ? sweeps >= fixed : resid < tol || sweeps >= 20000) break;
    }
    t.sweeps = sweeps;
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) u[j * wU + i] -= q[j * nx + i] - q[j * nx + i - 1];
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] -= q[j * nx + i] - q[(j - 1) * nx + i];
  }
}

/** The total dye in the tank, c·m². */
export function tankDye(t: Tank): number {
  let s = 0;
  for (let i = 0; i < t.c.length; i++) s += t.c[i];
  return s * t.dx * t.dx;
}

/** The largest cell divergence, m/s·cell: how far the flow is from incompressible. */
export function tankDivergence(t: Tank): number {
  const { nx, ny, u, v } = t;
  let m = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const d = u[j * (nx + 1) + i + 1] - u[j * (nx + 1) + i] + v[(j + 1) * nx + i] - v[j * nx + i];
    if (Math.abs(d) > m) m = Math.abs(d);
  }
  return m;
}
