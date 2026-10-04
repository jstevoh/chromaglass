/**
 * The plate as a Hele-Shaw cell (PLAN §18a): the flow between two glasses.
 *
 * What was there, and why it had to go. The solver's velocity was damped by a
 * per-step factor and then clamped to `MAX_SPEED` in `decayVel`, and 99.7% of
 * the dyed cells sat at that clamp (docs/evaluation-2026-09.md). So nothing the
 * liquid was pushed by lasted past the step it was pushed in: the colour rode
 * the noise added after the pressure solve and a half-resolution current kept
 * beside the field to get some memory back, and every tool moved the colour by
 * a hand-written carry because the flow could not.
 *
 * What a plate of liquid between two glasses actually is. When the gap h is
 * small against the plate, the flow across the gap is a parabola (Poiseuille),
 * and averaged over the gap the in-plane velocity obeys
 *
 *     ρ ∂u/∂t = −∇p + f − (12μ / h²) u,        ∇·(h u) = −∂h/∂t,
 *
 * the second being only that liquid is conserved: where the glasses close, the
 * liquid between them has to leave sideways. The drag term is the glass itself,
 * the shear across the gap, and its time ρh²/12μ is the plate's memory: about
 * three seconds for water in a 6 mm gap, a tenth of a second for a light oil,
 * nothing at all for glycerine. That is what decides how long a push lasts, and
 * the clamp was standing in for it.
 *
 * The step, as these kernels take it:
 *
 *   1. `hsPrep`: every force of the step (the magnet, the mix, the stirring)
 *      was written by kernels that were tuned as one step's velocity, because
 *      one step was all a velocity lasted. Here each is read as the speed that
 *      force drives the liquid to against the glass at the plate's rest gap
 *      (its terminal velocity there), which is the same number with the drag
 *      time put back: the force is k₀·(that speed), with k₀ = 12ν/h₀², and a
 *      step adds k₀·Δt of it. So a look's forces keep their size on an open
 *      plate, take the drag time to get there and to fade, and, being forces
 *      and not speeds, move the liquid less where the gap is tight (as h²,
 *      the Darcy mobility of a body force). Then the drag, implicitly, cell by
 *      cell: c = 1/(1 + kΔt) with k = 12ν/h², so a thick liquid in a tight gap
 *      stops at once and a thin one in a deep gap coasts.
 *   2. `hsDivergence`: what the flux h·c·u* would pile up or drain, and what
 *      the gap closing pushes out (−∂h/∂t, the press).
 *   3. The pressure that makes the flux conserve liquid, ∇·(M∇p) = ∇·(M u*) +
 *      ∂h/∂t, with the mobility M = h·c: h³/12μ once the drag dominates, the
 *      Reynolds equation for a squeeze film. A variable-coefficient multigrid
 *      (`hsSmooth0`, `hsRestrict0`, `hsCoarsen`, `hsSmooth`, `hsRestrict`,
 *      `hsProlong`, `hsProlong0`), face coefficients as harmonic means, which
 *      is the mean that gets a flux through two cells in series right.
 *   4. `hsGradient`: u = c u* − M∇p / h, the correction taken face by face so
 *      a step in the gap moves the flux the way a step in a pipe would.
 *
 * What the step no longer does. The old solver projected, carried the velocity
 * along itself (semi-Lagrangian), and projected again to take out what the carry
 * put back. The second projection was only there for the carry, and the carry is
 * the inertial term ρ(u·∇)u, which in a gap is weighed against the drag, not
 * against viscosity across the plate: their ratio is the reduced Reynolds number
 * Re·h/L. For the oils and anything thicker it is under a tenth at the plate's
 * speeds, so the drag has taken a push long before the push has carried itself
 * anywhere, and dropping the carry costs nothing a person can see. For water in
 * the 6 mm middle of the plate it is near 2, so a deep-gapped water look keeps
 * less inertia than real water would. That is a shortcut kept for the step's
 * time (an advection and a projection, the largest part of it), and PLAN §18a
 * has it as its own item to measure on the Water looks.
 *
 * And the rim is open. The old projection was a closed box, so every source
 * had to be balanced by a uniform sink over the whole plate, and a press pushed
 * nothing anywhere in particular (and a variable mobility could not show:
 * docs/physics-plan.md, "What is not here"). The dish is the plate's inscribed
 * circle (the picture never shows its corners), so past it the liquid is at the
 * air's pressure, p = 0, and what a press squeezes out leaves across the rim
 * and comes back when the glass lifts, as it does between two real glasses.
 *
 * Level 0's mobility is one buffer, row-major, one number a cell, negative on
 * the open cells past the rim: the sign is the boundary and the size is still
 * the cell's mobility, which the face beside it needs. The coarse levels keep
 * a coefficient a face instead (hsCoarsen says why) and a sign a cell.
 */

/**
 * The kernels, built on the solver's own head (the Sim and Args structs) and
 * its packed-plane reader, which are passed in rather than imported so this
 * file does not import the module that spreads it into its kernel table.
 */
export function thinGapKernels(HEAD: string, W: string): Record<string, string> {
  /*
    Shared by every kernel below: where a cell sits in the packed level-0
    pressure (the two colour planes pressureRedBlack uses, see PACKED in
    wgsl/fluid.ts), and the harmonic mean.

    Harmonic, not arithmetic, because two cells side by side are two
    resistances in series: a tight cell next to an open one lets through
    about what the tight one lets through, and an arithmetic mean would let
    the open one leak liquid through a gap that is nearly closed.
  */
  const COMMON = /* wgsl */ `
fn hsPacked(x: i32, y: i32, n: i32) -> i32 { let half = n / 2; return ((x + y) & 1) * n * half + y * half + (x >> 1); }
fn hsHarm(a: f32, b: f32) -> f32 { return 2.0 * a * b / max(a + b, 1e-20); }
fn hsIn(x: i32, y: i32, n: i32) -> bool { return x >= 0 && y >= 0 && x < n && y < n; }
/*
  The gap in units of the rest gap at the plate's middle, floored where the
  squeeze floors it (0.004 of the plate). hsPrep and hsGradient both take it
  from here: the mobility is h·c and the gradient divides by h again to get
  c back, so the two must agree to the bit.
*/
fn hsGap(g: f32, h0: f32) -> f32 { return max(g, 0.004) / h0; }
`;

  /*
    The neighbour sum of one coarse level, for the smoother and the residual
    alike: Σ K_f over the cell's faces, and Σ K_f p over the neighbours that
    are not held at the rim's pressure. A coarse level keeps its faces' own
    coefficients (\`fc\`: every cell's east face, then every cell's north
    face; see hsCoarsen for why a face and not a cell), and a face off the
    edge of the grid is stored as zero, a wall with no flux through it (the
    old projection's Neumann wall, now only in the plate's corners, which are
    past the rim anyway). \`cell\` is negative on a cell held at p = 0.
  */
  const ROWS = /* wgsl */ `
fn hsRowSums(x: i32, y: i32, n: i32) -> vec2f {
  let nn = n * n;
  let i = x + y * n;
  var f = array<f32, 4>(fc[i], 0.0, fc[nn + i], 0.0);
  var q = array<i32, 4>(i + 1, i - 1, i + n, i - n);
  if (x > 0) { f[1] = fc[i - 1]; }
  if (y > 0) { f[3] = fc[nn + i - n]; }
  var den = 0.0;
  var num = 0.0;
  for (var k = 0; k < 4; k++) {
    if (f[k] <= 0.0) { continue; }
    den += f[k];
    if (cell[q[k]] >= 0.0) { num += f[k] * p[q[k]]; }
  }
  return vec2f(den, num);
}
`;

  /* The same on level 0, whose pressure is packed and whose mobility is `mob`. */
  const ROWS0 = /* wgsl */ `
fn hsSums0(x: i32, y: i32, n: i32, mi: f32) -> vec2f {
  var den = 0.0;
  var num = 0.0;
  var o = array<vec2i, 4>(vec2i(-1, 0), vec2i(1, 0), vec2i(0, -1), vec2i(0, 1));
  for (var k = 0; k < 4; k++) {
    let q = vec2i(x, y) + o[k];
    if (!hsIn(q.x, q.y, n)) { continue; }
    let mn = mob[q.x + q.y * n];
    let f = hsHarm(mi, abs(mn));
    den += f;
    if (mn >= 0.0) { num += f * pr[hsPacked(q.x, q.y, n)]; }
  }
  return vec2f(den, num);
}
`;

  return {
    /*
      The step's forces as terminal speeds, the drag, and the mobility.

      A.a = (k scale, real seconds this step, the rest gap h0, the rim's
      radius), A.b.x the ferrofluid's viscosity over the clear liquid's.
      k = A.a.x / h², with h in plate widths: A.a.x is 12ν/W², the
      liquid's kinematic viscosity over the plate's width squared, so the
      drag is in real seconds whatever grid or look clock the plate runs at.

      `prev` is the velocity before this step's forces and `vel` after them.
      Their difference is what the forces asked for as one step's velocity,
      which is the speed each drives the liquid to against the glass at the
      rest gap, so it is added as a force k₀·Δt of that speed (see the file's
      head). z and w
      (the heat, and nothing) are taken from after the forces, which the lamp
      warms.
    */
    hsPrep: `${HEAD}${COMMON}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var prev: texture_2d<f32>;
@group(0) @binding(4) var sq: texture_2d<f32>;
@group(0) @binding(5) var phase: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(7) var<storage, read_write> mob: array<f32>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  let n = i32(S.n);
  let uf = textureLoad(vel, q, 0);
  let u0 = textureLoad(prev, q, 0).xy;
  let g = textureLoad(sq, q, 0).r;
  let hw = max(g, 0.004);
  /*
    The ferrofluid's own viscosity (A.b.x, its ratio to the clear liquid's;
    1 with none on the plate). A cell part ferrofluid has the two in its
    column side by side, and the column's drag is their geometric mean by
    share, which takes the ratio smoothly from one liquid to the other
    across the edge. This is what makes a front between them unstable the
    way a real one is (Saffman–Taylor): where the thinner liquid pushes
    the thicker, a bump that runs ahead has less drag in front of it and
    runs further. \`phase\` is 1×1 and empty with none poured.
  */
  let share = clamp(textureLoad(phase, min(q, vec2i(textureDimensions(phase)) - 1), 0).r, 0.0, 1.0);
  let kdt = A.a.x / (hw * hw) * A.a.y * pow(max(A.b.x, 1e-6), share);
  let ustar = u0 + (uf.xy - u0) * (A.a.x / (A.a.z * A.a.z) * A.a.y);
  let c = 1.0 / (1.0 + kdt);
  var mo = hsGap(g, A.a.z) * c;
  // Past the rim the liquid is open to the air: p is held at zero there.
  let d = uvOf(id) - vec2f(0.5);
  if (length(d) >= A.a.w) { mo = -mo; }
  mob[q.x + q.y * n] = mo;
  textureStore(dst, q, safeVel(vec4f(ustar, uf.z, uf.w)));
}`,

    /*
      The right-hand side, in the units the old projection's divergence used
      (its 4p − Σp = b became Σ M_f (p − p_nb) = b), so the air's terms come
      across unchanged.

      The flux through each face is the mean of the two cells' M·u*, and a
      wall's ghost cell mirrors the normal component so that mean is zero on
      the wall (the old \`velG\`).

      The press is the flux form of the old −(1/h)∂h/∂t: −∂h/∂t itself, since
      the h is in the mobility now, in the rest gap's units and in the flow's
      clock. And it is the gap's own change since the last step, kept here a
      cell at a time in \`gapBefore\`, not the squeeze field's rate. That rate is a
      press's push drawn out over a quarter of a second by \`gapMemory\`
      while the dent itself lands at once, so the liquid it moved was not the
      liquid the glass displaced: integrated, it moved what the memory said,
      whatever the gap did. Read off the gap, what leaves is exactly what the
      glass pushed out, and what the spring lets back in comes back. No plate
      mean is taken off it, because the rim is open: that uniform sink is
      what made a press push nothing in particular.

      The bubbles are the old kernel's two terms, word for word, each already
      averaging to zero; making them physical is §18i.

      A.a = (air push, 1/dt, air cover, h0),
      A.b = (air rate mean, 1/disp, 1 to take the gap as it is without a rate).
    */
    hsDivergence: `${HEAD}${COMMON}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var air: texture_2d<f32>;
@group(0) @binding(5) var airPrev: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<r32float, write>;
@group(0) @binding(7) var<storage, read> mob: array<f32>;
@group(0) @binding(8) var<storage, read_write> gapBefore: array<f32>;
fn flux(p: vec2i, n: i32) -> vec2f {
  let c = clamp(p, vec2i(0), vec2i(n - 1));
  var w = textureLoad(vel, c, 0).xy * abs(mob[c.x + c.y * n]);
  if (p.x < 0 || p.x > n - 1) { w.x = -w.x; }
  if (p.y < 0 || p.y > n - 1) { w.y = -w.y; }
  return w;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let div = 0.5 * (flux(p + vec2i(1, 0), n).x - flux(p - vec2i(1, 0), n).x
                 + flux(p + vec2i(0, 1), n).y - flux(p - vec2i(0, 1), n).y);
  let now = clamp(textureLoad(air, p, 0).r, 0.0, 1.0);
  let was = clamp(textureLoad(airPrev, p, 0).r, 0.0, 1.0);
  let rate = clamp((now - was) * A.a.y - A.b.x, -40.0, 40.0);
  // No standing air term: a still bubble pushes nothing (see divergence in wgsl/fluid.ts).
  let g = textureLoad(sq, p, 0).r;
  let k = p.x + p.y * n;
  let dh = select((g - gapBefore[k]) / A.a.w * A.b.y, 0.0, A.b.z > 0.5);
  gapBefore[k] = g;
  let q = rate * A.a.x - dh;
  var b = -div / S.n + q / (S.n * S.n);
  if (!(abs(b) < 1e30)) { b = 0.0; }
  textureStore(dst, p, vec4f(b, 0.0, 0.0, 0.0));
}`,

    /*
      Red-black Gauss-Seidel on level 0, packed as pressureRedBlack is, with
      the mobility's face coefficients. A.a.x is the parity. A cell past the
      rim is held at zero.
    */
    hsSmooth0: `${HEAD}${COMMON}
@group(0) @binding(2) var dv: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> pr: array<f32>;
@group(0) @binding(4) var<storage, read> mob: array<f32>;
${ROWS0}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let half = n / 2;
  let i = i32(id.x);
  if (i >= n * half) { return; }
  let parity = i32(A.a.x);
  let y = i / half;
  let x = 2 * (i % half) + ((y + parity) & 1);
  let mi = mob[x + y * n];
  if (mi < 0.0) { pr[parity * n * half + i] = 0.0; return; }
  let s = hsSums0(x, y, n, mi);
  pr[parity * n * half + i] = select(0.0, (textureLoad(dv, vec2i(x, y), 0).r + s.y) / s.x, s.x > 0.0);
}`,

    /*
      Level 0's residual, summed four fine cells to a coarse one, as
      mgRestrict0 does and for the same reason (b is in cell units, so the
      coarse right-hand side is the sum). Nothing from a cell held at the
      rim's pressure: its equation is p = 0, and it holds.
    */
    hsRestrict0: `${HEAD}${COMMON}
@group(0) @binding(2) var dv: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> pr: array<f32>;
@group(0) @binding(4) var<storage, read> mob: array<f32>;
@group(0) @binding(5) var<storage, read_write> bc: array<f32>;
${ROWS0}
fn res0(x: i32, y: i32, n: i32) -> f32 {
  let mi = mob[x + y * n];
  if (mi < 0.0) { return 0.0; }
  let s = hsSums0(x, y, n, mi);
  return textureLoad(dv, vec2i(x, y), 0).r - (s.x * pr[hsPacked(x, y, n)] - s.y);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let nc = n / 2;
  let i = i32(id.x);
  if (i >= nc * nc) { return; }
  let x = 2 * (i % nc);
  let y = 2 * (i / nc);
  bc[i] = res0(x, y, n) + res0(x + 1, y, n) + res0(x, y + 1, n) + res0(x + 1, y + 1, n);
}`,

    /*
      A coarse level's faces, from the level above it.

      A mobility a cell, each coarse cell's the mean of the four under it,
      is wrong exactly where the physics is: a press floors the gap in a dent
      whose edge is a jump of fifty in mobility, and a coarse cell straddling
      that edge averages it to half open, so the coarse grid sees a leak the
      fine grid does not have.

      So a coarse level keeps a coefficient a face, built as a flux through
      the fine cells would go. Between two coarse centres a row crosses three
      fine faces in series (half of the one inside the first coarse cell, the
      one on the coarse face, half of the one inside the second), so its
      conductance is 1 / (½/f₁ + 1/f₂ + ½/f₃); the two rows the coarse face
      covers are side by side, so theirs add. On an even mobility that is
      the fine coefficient again, which is the old coarse operator; across a
      jump it is the series sum a pipe would give.

      A coarse cell is held at the rim's pressure when any of its four is.
      Its correction goes bilinearly onto the fine cells round it, and a
      coarse cell half past the rim that carries one lays it on the last fine
      cells inside, which the fine sweeps then have to take back off. Held at
      zero, the coarse level carries only the inside's correction and the
      fine sweeps settle the last cell. Measured on a press in a floored dent
      at 128², the flow left after the step that should remove it: 8% with a
      coarse cell held when two of its four were, 1.7% when any was (and it
      diverged when three had to be).


      One kernel for every level: A.a.y is 1 when the level above is level
      0, whose faces are the harmonic means of its cells (\`mf\` read as
      cells, \`ff\` unused), and 0 when it is a coarse level with faces of
      its own. A.a.x is the fine level's size.
    */
    hsCoarsen: `${HEAD}${COMMON}
@group(0) @binding(2) var<storage, read> mf: array<f32>;
@group(0) @binding(3) var<storage, read> ff: array<f32>;
@group(0) @binding(4) var<storage, read_write> mc: array<f32>;
@group(0) @binding(5) var<storage, read_write> fcOut: array<f32>;
// The fine level's face toward +x (axis 0) or +y (axis 1) from (x, y); zero off the grid.
fn fineFace(x: i32, y: i32, axis: i32, n: i32) -> f32 {
  let qx = x + select(0, 1, axis == 0);
  let qy = y + select(0, 1, axis == 1);
  if (!hsIn(qx, qy, n)) { return 0.0; }
  if (A.a.y > 0.5) { return hsHarm(abs(mf[x + y * n]), abs(mf[qx + qy * n])); }
  return ff[axis * n * n + x + y * n];
}
// One row's conductance from a coarse centre to the next: three fine faces in series.
fn series(a: f32, b: f32, c: f32) -> f32 {
  if (b <= 0.0) { return 0.0; }
  return 1.0 / (0.5 / max(a, 1e-20) + 1.0 / b + 0.5 / max(c, 1e-20));
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let nc = n / 2;
  let i = i32(id.x);
  if (i >= nc * nc) { return; }
  let x = 2 * (i % nc);
  let y = 2 * (i / nc);
  let east = series(fineFace(x, y, 0, n), fineFace(x + 1, y, 0, n), fineFace(x + 2, y, 0, n))
           + series(fineFace(x, y + 1, 0, n), fineFace(x + 1, y + 1, 0, n), fineFace(x + 2, y + 1, 0, n));
  let north = series(fineFace(x, y, 1, n), fineFace(x, y + 1, 1, n), fineFace(x, y + 2, 1, n))
            + series(fineFace(x + 1, y, 1, n), fineFace(x + 1, y + 1, 1, n), fineFace(x + 1, y + 2, 1, n));
  fcOut[i] = east;
  fcOut[nc * nc + i] = north;
  let a = mf[x + y * n];
  let b = mf[x + 1 + y * n];
  let c = mf[x + (y + 1) * n];
  let d = mf[x + 1 + (y + 1) * n];
  let nOpen = select(0, 1, a < 0.0) + select(0, 1, b < 0.0) + select(0, 1, c < 0.0) + select(0, 1, d < 0.0);
  mc[i] = select(1.0, -1.0, nOpen >= 1);
}`,

    // Red-black on a row-major coarse level. A.a = (n, parity).
    hsSmooth: `${HEAD}${COMMON}
@group(0) @binding(2) var<storage, read> b: array<f32>;
@group(0) @binding(3) var<storage, read_write> p: array<f32>;
@group(0) @binding(4) var<storage, read> cell: array<f32>;
@group(0) @binding(5) var<storage, read> fc: array<f32>;
${ROWS}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let half = (n + 1) / 2;
  let i = i32(id.x);
  if (i >= n * half) { return; }
  let y = i / half;
  let x = 2 * (i % half) + ((y + i32(A.a.y)) & 1);
  if (x >= n) { return; }
  if (cell[x + y * n] < 0.0) { p[x + y * n] = 0.0; return; }
  let s = hsRowSums(x, y, n);
  p[x + y * n] = select(0.0, (b[x + y * n] + s.y) / s.x, s.x > 0.0);
}`,

    // A coarse level's residual, summed down to the next. A.a.x = n.
    hsRestrict: `${HEAD}${COMMON}
@group(0) @binding(2) var<storage, read> p: array<f32>;
@group(0) @binding(3) var<storage, read> b: array<f32>;
@group(0) @binding(4) var<storage, read> cell: array<f32>;
@group(0) @binding(5) var<storage, read> fc: array<f32>;
@group(0) @binding(6) var<storage, read_write> bc: array<f32>;
${ROWS}
fn res(x: i32, y: i32, n: i32) -> f32 {
  if (cell[x + y * n] < 0.0) { return 0.0; }
  let s = hsRowSums(x, y, n);
  return b[x + y * n] - (s.x * p[x + y * n] - s.y);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let nc = n / 2;
  let i = i32(id.x);
  if (i >= nc * nc) { return; }
  let x = 2 * (i % nc);
  let y = 2 * (i / nc);
  bc[i] = res(x, y, n) + res(x + 1, y, n) + res(x, y + 1, n) + res(x + 1, y + 1, n);
}`,

    /*
      The coarse correction brought up, bilinear between cell centres as
      mgProlong does, and never onto a cell held at the rim's pressure. A.a.x
      is the fine level's size.
    */
    hsProlong: `${HEAD}
@group(0) @binding(2) var<storage, read> e: array<f32>;
@group(0) @binding(3) var<storage, read_write> p: array<f32>;
@group(0) @binding(4) var<storage, read> m: array<f32>;
fn ec(x: i32, y: i32, k: i32) -> f32 { return e[clamp(x, 0, k - 1) + clamp(y, 0, k - 1) * k]; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let k = n / 2;
  let i = i32(id.x);
  if (i >= n * n) { return; }
  if (m[i] < 0.0) { return; }
  let x = i % n;
  let y = i / n;
  let c = (vec2f(f32(x), f32(y)) + 0.5) * 0.5 - 0.5;
  let c0 = vec2i(floor(c));
  let f = c - vec2f(c0);
  p[i] = p[i] + mix(mix(ec(c0.x, c0.y, k), ec(c0.x + 1, c0.y, k), f.x),
                    mix(ec(c0.x, c0.y + 1, k), ec(c0.x + 1, c0.y + 1, k), f.x), f.y);
}`,

    // The same into level 0's packed pressure.
    hsProlong0: `${HEAD}${COMMON}
@group(0) @binding(2) var<storage, read> e: array<f32>;
@group(0) @binding(3) var<storage, read_write> pr: array<f32>;
@group(0) @binding(4) var<storage, read> mob: array<f32>;
fn ec(x: i32, y: i32, k: i32) -> f32 { return e[clamp(x, 0, k - 1) + clamp(y, 0, k - 1) * k]; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let k = n / 2;
  let i = i32(id.x);
  if (i >= n * n) { return; }
  if (mob[i] < 0.0) { return; }
  let x = i % n;
  let y = i / n;
  let c = (vec2f(f32(x), f32(y)) + 0.5) * 0.5 - 0.5;
  let c0 = vec2i(floor(c));
  let f = c - vec2f(c0);
  let j = hsPacked(x, y, n);
  pr[j] = pr[j] + mix(mix(ec(c0.x, c0.y, k), ec(c0.x + 1, c0.y, k), f.x),
                      mix(ec(c0.x, c0.y + 1, k), ec(c0.x + 1, c0.y + 1, k), f.x), f.y);
}`,

    /*
      The velocity the step ends with: u = c u* − M∇p / h.

      Each face's correction is its own coefficient times the pressure step
      across it, and the cell takes the mean of its two faces on each axis,
      over its own gap. On a plate of one gap and one liquid that is exactly
      c u* − c∇p by central differences, the old gradientSubtract with the
      drag in it; where the gap changes, the face beside a tight cell carries
      what a tight cell can. A face on the grid's wall carries nothing, and a
      neighbour past the rim is at p = 0. A.a.x is h0.
    */
    hsGradient: `${HEAD}${COMMON}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read> pr: array<f32>;
@group(0) @binding(6) var<storage, read> mob: array<f32>;
@group(0) @binding(7) var<storage, read_write> seen: array<f32>;
fn pAt(x: i32, y: i32, n: i32) -> f32 {
  if (mob[x + y * n] < 0.0) { return 0.0; }
  return pr[hsPacked(x, y, n)];
}
// The flux correction through the face from this cell toward (dx, dy), as M_f (p_nb − p).
fn face(x: i32, y: i32, dx: i32, dy: i32, n: i32, mi: f32, pi: f32) -> f32 {
  let qx = x + dx;
  let qy = y + dy;
  if (!hsIn(qx, qy, n)) { return 0.0; }
  return hsHarm(mi, abs(mob[qx + qy * n])) * (pAt(qx, qy, n) - pi);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  let n = i32(S.n);
  let v = textureLoad(vel, q, 0);
  let mi = abs(mob[q.x + q.y * n]);
  let pi = pAt(q.x, q.y, n);
  // Toward +x the face gives M(p_R − p); toward −x, M(p_L − p), which is minus the gradient's face.
  let gx = face(q.x, q.y, 1, 0, n, mi, pi) - face(q.x, q.y, -1, 0, n, mi, pi);
  let gy = face(q.x, q.y, 0, 1, n, mi, pi) - face(q.x, q.y, 0, -1, n, mi, pi);
  let h = hsGap(textureLoad(sq, q, 0).r, A.a.x);
  let u = (mi * v.xy - 0.5 * S.n * vec2f(gx, gy)) / h;
  textureStore(dst, q, safeVel(vec4f(u, v.z, v.w)));
  /*
    The pressure the rest of the step sees. bodyAdvect, phaseAdvect and
    mixAdvect correct their face velocities with the last projection's
    pressure (Rhie–Chow): the old projection took the wide gradient of p
    from every cell, so they put back the face's compact one in its place.
    This one took (M/h)·∇P, the mobility over the gap, which is the drag's
    c = 1/(1 + kΔt) where the gap is smooth: so the pressure that plays the
    old p's part here is c·P, and that is what they are given. Handing them
    P itself over-corrected by 1/c, a factor of 7 on the thickest liquid;
    c·P is exact where c is flat and never corrects more than P would where
    it is not (c ≤ 1). The solve keeps P in a buffer of its own, so the old
    solver's pressure buffer only ever holds a pressure in its own sense.
  */
  seen[hsPacked(q.x, q.y, n)] = select(pi * mi / h, 0.0, mob[q.x + q.y * n] < 0.0);
}`,
  };
}
