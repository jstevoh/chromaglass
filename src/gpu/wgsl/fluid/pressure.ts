/**
 * The projection: the Jacobi relaxations, the divergence and its sums, the
 * pressure solves (Jacobi, red-black, the multigrid's levels) and the gradient
 * taken off.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { HEAD, PACKED, W } from './shared';

export const PRESSURE_KERNELS: Record<string, string> = {
  // x = (x0 + a Σ neighbours) / (1 + 4a), per channel. A.a is a, A.b is 1/(1+4a).
  jacobi: `${HEAD}
@group(0) @binding(2) var x: texture_2d<f32>;
@group(0) @binding(3) var x0: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let s = textureLoad(x, clampP(p - vec2i(1, 0), S.n), 0) + textureLoad(x, clampP(p + vec2i(1, 0), S.n), 0)
        + textureLoad(x, clampP(p - vec2i(0, 1), S.n), 0) + textureLoad(x, clampP(p + vec2i(0, 1), S.n), 0);
  textureStore(dst, p, (textureLoad(x0, p, 0) + A.a * s) * A.b);
}`,

  // The velocity's divergence, with the wall's ghost cells (velG in the GLSL).
  /*
    The divergence the projection solves, with the air pushing on it (H6 · A).

    A bubble displaces liquid. In the liquid's own terms that is a **source**
    where the air is arriving and a sink where it is leaving, and the right
    place to say so is here: the projection solves for the pressure whose
    gradient produces exactly that flow, so the liquid is pushed aside and
    then goes round.

    Three other ways were tried first and all are written up in
    `bubbles-plan.md`. The one worth repeating here is adding a velocity down
    the air gradient, which does nothing whatever — a gradient field is
    precisely what this projection exists to remove, so the next one cancels
    it. A source has to go in before the solve, not a velocity after it.

    `A.a.x` is the strength and `A.a.y` the reciprocal timestep; the rate is
    how much air arrived since the last frame. With no bubbles the two fields
    are identical and the term is zero, so this costs two samples and changes
    nothing.
  */
  divergence: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var air: texture_2d<f32>;
@group(0) @binding(4) var airPrev: texture_2d<f32>;
/*
  The squeeze film (the press), because a gradient added to the velocity is
  not a press — it is a thing the next projection deletes.

  The plates closing pushes liquid out from between them, which in the plane
  is a source, exactly as a growing bubble is. It used to be applied as
  v += -(h squared/12mu) grad p, in squeezeVelBuf, one stage before the
  first projection — a pure
  gradient field handed straight to the operator whose whole job is to remove
  curl-free flow. Measured: pressing seventy-five times harder moved the same
  1% of the dye, because the strength was never what was being thrown away.
*/
@group(0) @binding(5) var sq: texture_2d<f32>;
// Last, because the convention here is every texture a pass reads and then
// the one it writes — and run() binds them in exactly that order. Leaving
// this at 3 put a sampled texture on a storage slot, which fails as
// "usage doesn't include TextureUsage::StorageBinding" and leaves the field
// empty with nothing else to show for it.
@group(0) @binding(6) var dst: texture_storage_2d<r32float, write>;
// Past the edge: the edge value with the wall-normal component negated, so the
// velocity interpolated at the wall is zero.
fn velG(p: vec2i, n: f32) -> vec2f {
  var v = textureLoad(vel, clampP(p, n), 0).xy;
  if (p.x < 0 || p.x > i32(n) - 1) { v.x = -v.x; }
  if (p.y < 0 || p.y > i32(n) - 1) { v.y = -v.y; }
  return v;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let dx = velG(p + vec2i(1, 0), S.n).x - velG(p - vec2i(1, 0), S.n).x;
  let dy = velG(p + vec2i(0, 1), S.n).y - velG(p - vec2i(0, 1), S.n).y;
  /*
    This stores -div(v)·h², so a source q enters as +q·h². Positive where the
    air is growing: liquid appearing, which is liquid being pushed out.
  */
  let now = clamp(textureLoad(air, p, 0).r, 0.0, 1.0);
  let was = clamp(textureLoad(airPrev, p, 0).r, 0.0, 1.0);
  /*
    One term: the air arriving, and only while it arrives.

    The rate (how much air arrived since last frame) is the physical source:
    a growing bubble displaces liquid, a popping one lets it back. A bubble
    that has arrived and sits still has no rate at all, and that is right.
    Between two glasses a still bubble pushes nothing anywhere; the liquid
    is simply not where the air is.

    There used to be a second, "standing" term beside it: a source everywhere
    the air was and a sink everywhere it was not, (air - the plate's air
    fraction) times 30 every step, put there to empty a bubble's middle of
    dye, because the rate alone left it full (0.70 to 0.67). It never could
    empty the middle (a radial source's velocity is zero at its centre, see
    airExclude, which is what empties it now), and what it did do was pour
    liquid out of every bubble for as long as the bubble lasted, with the
    rest of the plate as the sink. That is a flow out over the whole plate
    that never stops. On the Mac, four bubbles the simulated band left near
    the middle of a calm Classic plate took its mean speed from 1.3 to 40 to
    138 (a thousandth of a unit), 0.70 of it straight out from them, and that
    is what kept failing the drop check's "and nowhere else"
    (scripts/mirror.mjs). In the lab the same four bubbles, held still with
    their presses on, kept the far plate at 4.57e-3 once steady, 0.79 of it
    straight out from them, as fast as when they arrived; without the
    standing term, 1.83e-5. npm run heldpress holds it.
  */
  /*
    Zero-mean.

    A source the projection solves has to average to zero over the plate or
    there is no solution to find, which is the Neumann condition
    pressureSelfTest protects. This one never did: while a bubble grows
    it is a net source over the whole plate with nothing to balance it, and
    the solve spends itself on the imbalance rather than on the shape.

    A.b.x is that mean, which is how fast the plate's air fraction is
    changing, and the CPU has it from the bubble list for nothing.
  */
  let rate = clamp((now - was) * A.a.y - A.b.x, -40.0, 40.0);
  /*
    And the press, as mass conservation says it is: closing a gap of height h
    at a rate dh/dt pushes out −(1/h)(dh/dt) per unit area.

    Not balanced here. It used to have its plate mean taken off (A.b.y),
    worked out on the CPU from the gap deltas over a resting gap of 0.03, and
    that estimate was the source of the plate-wide flow the mirror check
    (scripts/mirror.mjs) kept catching: a press held on one place squeezes its gap to the floor, where
    the deltas are clamped away and the spring goes on moving the gap, so the
    rate this line reads over the gap it really has is nothing like the
    estimate, and the difference went into the solve as a net source over the
    whole plate. The whole right-hand side is now made zero-mean exactly, on
    the GPU, after this pass (divTiles, divFold, divCentre), so nothing here
    has to guess what the plate as a whole is doing.
  */
  let sqv = textureLoad(sq, p, 0);
  let squeeze = clamp(-sqv.g / max(sqv.r, 0.004), -60.0, 60.0) * A.b.z;
  let q = rate * A.a.x + squeeze;
  textureStore(dst, p, vec4f(-0.5 * (dx + dy) / S.n + q / (S.n * S.n), 0.0, 0.0, 0.0));
}`,

  /*
    The projection's right-hand side made to sum to zero over the plate,
    exactly: the plate's mean of what divergence wrote, taken off every cell.

    The walls are closed (the pressure's ghost cells copy the edge, the
    velocity's negate it), and on a closed plate the pressure equation has a
    solution only when its source sums to zero: what is pushed out in one
    place has to be taken in somewhere else, or the liquid has nowhere to go.
    The velocity's own divergence always does sum to zero — with the wall's
    ghost cells, the central differences telescope to nothing. The sources
    do not: the air arriving and the press each put
    liquid in where they are, and each was balanced with a mean the CPU
    worked out from its own idea of the plate (the bubble list's coverage,
    the gap deltas over a resting gap). Where an idea was wrong the
    difference was a net source, and the solve's answer to a problem with no
    solution is a flow out from the middle of the plate that grows each step.
    That is what failed the mirror check (`scripts/mirror.mjs`) on a calm
    Classic plate as soon as a drop had trapped a bubble, and `npm run heldpress` holds it.

    Taking off the true mean is the physics, not a patch over it. The plate
    is a closed cell of liquid between two sheets of glass: a palm pressing
    the gap shut in one place lifts the glass, a hair, everywhere else, and
    the liquid it pushed out goes there. A uniform sink over the whole plate
    is exactly that lift. The air's rate keeps its own CPU mean, which
    centres it before its clamp; this takes off whatever that missed.

    Two passes to find the mean, the same shape as the plate's stats
    (`wgsl/stats.ts`): a fixed number of workgroups each sum their stride of
    the plate, then one sums those. The partial sums stay small, which keeps
    a 512² plate accurate in 32-bit floats. A third pass writes the centred
    field where the solve reads it, so neither the smoother nor the
    multigrid's restriction has to know.
  */
  divTiles: `${HEAD}
@group(0) @binding(2) var raw: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> partials: array<f32>;
const TILE = 64u;
var<workgroup> tile: array<f32, 64>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_id) lid: vec3u,
        @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) groups: vec3u) {
  let n = u32(S.n);
  let total = n * n;
  let stride = TILE * groups.x;
  var sum = 0.0;
  var i = gid.x;
  loop {
    if (i >= total) { break; }
    sum += textureLoad(raw, vec2i(i32(i % n), i32(i / n)), 0).r;
    i += stride;
  }
  tile[lid.x] = sum;
  workgroupBarrier();
  var s = TILE / 2u;
  loop {
    if (s == 0u) { break; }
    if (lid.x < s) { tile[lid.x] += tile[lid.x + s]; }
    workgroupBarrier();
    s = s / 2u;
  }
  if (lid.x == 0u) { partials[wid.x] = tile[0]; }
}`,

  // The partials into the plate's mean, in mean[0]. A.a.x = how many partials.
  divFold: `${HEAD}
@group(0) @binding(2) var<storage, read> partials: array<f32>;
@group(0) @binding(3) var<storage, read_write> mean: array<f32>;
const TILE = 64u;
var<workgroup> tile: array<f32, 64>;
@compute @workgroup_size(64)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  let count = u32(A.a.x);
  var sum = 0.0;
  var i = lid.x;
  loop {
    if (i >= count) { break; }
    sum += partials[i];
    i += TILE;
  }
  tile[lid.x] = sum;
  workgroupBarrier();
  var s = TILE / 2u;
  loop {
    if (s == 0u) { break; }
    if (lid.x < s) { tile[lid.x] += tile[lid.x + s]; }
    workgroupBarrier();
    s = s / 2u;
  }
  if (lid.x == 0u) { mean[0] = tile[0] / (S.n * S.n); }
}`,

  // The raw right-hand side less its mean, into the texture the solve reads.
  divCentre: `${HEAD}
@group(0) @binding(2) var raw: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> mean: array<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  textureStore(dst, p, vec4f(textureLoad(raw, p, 0).r - mean[0], 0.0, 0.0, 0.0));
}`,

  pressureJacobi: `${HEAD}
@group(0) @binding(2) var pr: texture_2d<f32>;
@group(0) @binding(3) var dv: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let s = textureLoad(pr, clampP(p - vec2i(1, 0), S.n), 0).r + textureLoad(pr, clampP(p + vec2i(1, 0), S.n), 0).r
        + textureLoad(pr, clampP(p - vec2i(0, 1), S.n), 0).r + textureLoad(pr, clampP(p + vec2i(0, 1), S.n), 0).r;
  textureStore(dst, p, vec4f((textureLoad(dv, p, 0).r + s) * 0.25, 0.0, 0.0, 0.0));
}`,

  /*
    The pressure solve, as red-black Gauss-Seidel (H2, docs/roadmap.md).

    Twenty-four Jacobi passes were 48 of a step's hundred-odd dispatches and
    28.8% of its time, which H0 measured and which makes this the largest
    single block of work in the frame. Jacobi reads the whole field from last
    iteration and writes a new one; Gauss-Seidel reads neighbours that have
    already been updated this sweep, which converges about twice as fast for
    the same arithmetic. The catch is that it has to write in place, and a
    cell cannot read a texture it is writing.

    So the pressure lives in a storage buffer here rather than a texture.
    Red-black is what makes that safe: colour the grid like a chessboard and
    no two cells of the same colour are neighbours, so a sweep over the red
    cells reads only black ones and can write itself without a hazard. Two
    dispatches an iteration, each over half the grid — the same total work as
    one Jacobi pass, for twice the convergence.

    `A.a.x` is the parity: 0 sweeps red, 1 sweeps black. The thread index is
    mapped onto its own colour rather than dispatched over the whole grid and
    turned away at the door, which would spend half the threads doing
    nothing and give back the factor this exists to win.

    ── Why the two colours are stored apart ──

    That still left a red-black sweep costing **1.64x** a Jacobi pass for the
    same number of cell updates, which is most of the reason the projection
    came down 18% where the arithmetic promised 50%. It was never the maths.
    With the grid stored in row order, a sweep touches every other word:
    sixty-four consecutive threads wrote sixty-four floats spread across a
    hundred and twenty-eight, so every cache line and every coalesced write
    carried half a line of the other colour along with it and threw it away.

    So the buffer holds the colours as two contiguous planes instead — all
    the red cells in row order, then all the black. The mapping is a
    relabelling and nothing else: the same cells, the same neighbours, the
    same arithmetic in the same order, so the field it produces is identical
    word for word, which is what `pressureSelfTest` checks rather than taking
    on faith. What changes is the address arithmetic, and with it thread `i`
    writes word `i` of its plane. Reads follow: the vertical neighbours of a
    run of threads are themselves a run, and the horizontal ones are the same
    run offset by one.
  */
  pressureRedBlack: `${HEAD}
@group(0) @binding(2) var dv: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> pr: array<f32>;
${PACKED}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let half = n / 2;
  let i = i32(id.x);
  if (i >= n * half) { return; }
  let parity = i32(A.a.x);
  let y = i / half;
  // The row's own colour decides which column this thread owns, so the two
  // sweeps together cover every cell exactly once.
  let x = 2 * (i % half) + ((y + parity) & 1);
  let s = packedAt(x - 1, y, n) + packedAt(x + 1, y, n) + packedAt(x, y - 1, n) + packedAt(x, y + 1, n);
  // y * half + (x >> 1) is i again, which is the whole point: thread i
  // writes word i of its plane, so a workgroup's 64 writes are 64 adjacent
  // words rather than 64 words spread across 128.
  pr[parity * n * half + i] = (textureLoad(dv, vec2i(x, y), 0).r + s) * 0.25;
}`,

  /*
    Multigrid for the pressure (H2, docs/roadmap.md).

    Twelve red-black sweeps from a cold start smooth the error a few cells
    across and leave anything larger almost untouched, because a sweep only
    moves information one cell. So the projection was only ever
    incompressible at the finest scales, and a strong local force showed it:
    the magnet's force made twenty times the dye the plate was given in two
    seconds, and forty-eight sweeps only slowed that. Multigrid does the
    large scales on coarse grids, where they are fine scales, and brings the
    correction back: the same operator, the same walls (Neumann: outside is
    the edge value), for about the same arithmetic as the sweeps.

    Level 0 is the packed red-black buffer the rest of the solver reads
    (pressureRedBlack smooths it, gradientSubtractBuf reads it). Coarser
    levels are plain row-major buffers. The operator is 4p − Σ neighbours =
    b with b already in h² units, so a coarse grid's right-hand side is the
    *sum* of the four fine residuals under it: (2h)² is 4h², and the average
    times four is the sum.
  */
  mgRestrict0: `${HEAD}
@group(0) @binding(2) var dv: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> pr: array<f32>;
@group(0) @binding(4) var<storage, read_write> bc: array<f32>;
${PACKED}
// Zero for a fine cell past the grid: an odd level's last coarse row or column covers one fine cell (core.ts, the levels).
fn res0(x: i32, y: i32, n: i32) -> f32 {
  if (x >= n || y >= n) { return 0.0; }
  let s = packedAt(x - 1, y, n) + packedAt(x + 1, y, n) + packedAt(x, y - 1, n) + packedAt(x, y + 1, n);
  return textureLoad(dv, vec2i(x, y), 0).r - (4.0 * packedAt(x, y, n) - s);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let nc = (n + 1) / 2;
  let i = i32(id.x);
  if (i >= nc * nc) { return; }
  let x = 2 * (i % nc);
  let y = 2 * (i / nc);
  bc[i] = res0(x, y, n) + res0(x + 1, y, n) + res0(x, y + 1, n) + res0(x + 1, y + 1, n);
}`,

  mgRestrict: `${HEAD}
@group(0) @binding(2) var<storage, read> p: array<f32>;
@group(0) @binding(3) var<storage, read> b: array<f32>;
@group(0) @binding(4) var<storage, read_write> bc: array<f32>;
fn at(x: i32, y: i32, n: i32) -> f32 { return p[clamp(x, 0, n - 1) + clamp(y, 0, n - 1) * n]; }
fn res(x: i32, y: i32, n: i32) -> f32 {
  if (x >= n || y >= n) { return 0.0; }
  let s = at(x - 1, y, n) + at(x + 1, y, n) + at(x, y - 1, n) + at(x, y + 1, n);
  return b[x + y * n] - (4.0 * at(x, y, n) - s);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let nc = (n + 1) / 2;
  let i = i32(id.x);
  if (i >= nc * nc) { return; }
  let x = 2 * (i % nc);
  let y = 2 * (i / nc);
  bc[i] = res(x, y, n) + res(x + 1, y, n) + res(x, y + 1, n) + res(x + 1, y + 1, n);
}`,

  // Red-black Gauss-Seidel on a row-major level. A.a = (n, parity).
  mgSmooth: `${HEAD}
@group(0) @binding(2) var<storage, read> b: array<f32>;
@group(0) @binding(3) var<storage, read_write> p: array<f32>;
fn at(x: i32, y: i32, n: i32) -> f32 { return p[clamp(x, 0, n - 1) + clamp(y, 0, n - 1) * n]; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let half = (n + 1) / 2;
  let i = i32(id.x);
  if (i >= n * half) { return; }
  let y = i / half;
  let x = 2 * (i % half) + ((y + i32(A.a.y)) & 1);
  if (x >= n) { return; }
  let s = at(x - 1, y, n) + at(x + 1, y, n) + at(x, y - 1, n) + at(x, y + 1, n);
  p[x + y * n] = (b[x + y * n] + s) * 0.25;
}`,

  /*
    A.a.x = cells to zero. Level 0's packed pressure too, between
    projections (`clearBuffer`), with A.a.x its n²: that had a kernel of its
    own, `pressureClear`, the same zeroing with the count read off the
    Sim, and every show waited for it to compile before it opened. A kernel
    is a compile of about a fifth of a second on a cold Mac whatever it does
    (`gpu/prepare.ts`), so two that do one thing are one.
  */
  mgZero: `${HEAD}
@group(0) @binding(2) var<storage, read_write> p: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.a.x)) { return; }
  p[id.x] = 0.0;
}`,

  /*
    Add the coarse correction, bilinear between cell centres. A.a.x = fine n;
    A.a.y = 1 when the fine level is level 0, whose buffer is packed red and
    black (`pressureRedBlack`), so cell (x, y) is a different word there.
    Level 0 had a kernel of its own, `mgProlong0`, the same arithmetic but
    for that index, and the opening waited for its compile as for this one's
    (`mgZero` above on why two are one). Which index is one uniform branch,
    the same for every thread of every dispatch.
  */
  mgProlong: `${HEAD}
@group(0) @binding(2) var<storage, read> e: array<f32>;
@group(0) @binding(3) var<storage, read_write> p: array<f32>;
fn ec(x: i32, y: i32, m: i32) -> f32 { return e[clamp(x, 0, m - 1) + clamp(y, 0, m - 1) * m]; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let m = (n + 1) / 2;
  let i = i32(id.x);
  if (i >= n * n) { return; }
  let x = i % n;
  let y = i / n;
  let c = (vec2f(f32(x), f32(y)) + 0.5) * 0.5 - 0.5;
  let c0 = vec2i(floor(c));
  let f = c - vec2f(c0);
  let v = mix(mix(ec(c0.x, c0.y, m), ec(c0.x + 1, c0.y, m), f.x),
              mix(ec(c0.x, c0.y + 1, m), ec(c0.x + 1, c0.y + 1, m), f.x), f.y);
  var k = i;
  if (A.a.y > 0.5) {
    let half = n / 2;
    k = ((x + y) & 1) * n * half + y * half + (x >> 1);
  }
  p[k] = p[k] + v;
}`,

  /** `gradientSubtract`, reading the pressure from the buffer the sweeps wrote. */
  gradientSubtractBuf: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<storage, read> pr: array<f32>;
${PACKED}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let v = textureLoad(vel, p, 0);
  let gx = packedAt(p.x + 1, p.y, n) - packedAt(p.x - 1, p.y, n);
  let gy = packedAt(p.x, p.y + 1, n) - packedAt(p.x, p.y - 1, n);
  textureStore(dst, p, safeVel(vec4f(v.xy - 0.5 * vec2f(gx, gy) * S.n, v.z, v.w)));
}`,

  gradientSubtract: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var pr: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let v = textureLoad(vel, p, 0);
  let gx = textureLoad(pr, clampP(p + vec2i(1, 0), S.n), 0).r - textureLoad(pr, clampP(p - vec2i(1, 0), S.n), 0).r;
  let gy = textureLoad(pr, clampP(p + vec2i(0, 1), S.n), 0).r - textureLoad(pr, clampP(p - vec2i(0, 1), S.n), 0).r;
  textureStore(dst, p, safeVel(vec4f(v.xy - 0.5 * vec2f(gx, gy) * S.n, v.z, v.w)));
}`,
};
