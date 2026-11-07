/**
 * The carries: semi-Lagrangian and MacCormack advection, the conserving carries
 * of the oil and the bodies, the substep plan a thin gap takes them in, a field
 * carried onto a new grid, and the glass's drift taken out.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { HEAD, PACKED, THIN_FACE, W } from './shared';

export const CARRY_KERNELS: Record<string, string> = {
  // Semi-Lagrangian advection. A.a.x is the displacement's sign and scale.
  advect: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(5) var lin: sampler;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let uv = uvOf(id);
  let v = textureSampleLevel(vel, lin, uv, 0.0).xy;
  let pos = clamp(uv - v * A.a.x, vec2f(1.0 / S.n), vec2f(1.0 - 1.0 / S.n));
  // Finite only: this carries the velocity too, whose signs must survive.
  let o = textureSampleLevel(src, lin, pos, 0.0);
  textureStore(dst, vec2i(id.xy), select(vec4f(0.0), o, finite4(o)));
}`,

  // MacCormack: phi1 + ½(phi0 − phi0b), clamped to the four cells the forward step sampled.
  macCormack: `${HEAD}
@group(0) @binding(2) var phi0: texture_2d<f32>;
@group(0) @binding(3) var phi1: texture_2d<f32>;
@group(0) @binding(4) var phi0b: texture_2d<f32>;
@group(0) @binding(5) var vel: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(7) var lin: sampler;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  let uv = uvOf(id);
  let v = textureSampleLevel(vel, lin, uv, 0.0).xy;
  let pos = clamp(uv - v * A.a.x, vec2f(1.0 / S.n), vec2f(1.0 - 1.0 / S.n));
  let f = floor(pos * S.n - 0.5);
  let hiN = vec2f(S.n - 1.0);
  let lo = vec2i(clamp(f, vec2f(0.0), hiN));
  let hi = vec2i(clamp(f + 1.0, vec2f(0.0), hiN));
  let a = textureLoad(phi0, vec2i(lo.x, lo.y), 0);
  let b = textureLoad(phi0, vec2i(hi.x, lo.y), 0);
  let c = textureLoad(phi0, vec2i(lo.x, hi.y), 0);
  let d = textureLoad(phi0, vec2i(hi.x, hi.y), 0);
  let mn = min(min(a, b), min(c, d));
  let mx = max(max(a, b), max(c, d));
  let r = textureSampleLevel(phi1, lin, uv, 0.0) + 0.5 * (textureSampleLevel(phi0, lin, uv, 0.0) - textureSampleLevel(phi0b, lin, uv, 0.0));
  var o = clamp(r, mn, mx);
  /*
    A.a.y is 1 for the dye: what is carried is an amount on the plate, and
    where the flow spreads it has to thin.

    A backtrace copies the value at the foot of the path, which is right for
    a flow that neither spreads nor gathers and wrong for one that does:
    the cell's dye came from a patch of plate smaller than the cell where
    the flow diverges (larger where it converges), and a copy spreads it
    over more plate than it came from. The flow the dye rides diverges in
    several places on purpose — a press and the beat squeeze are sources
    in the projection, a bubble's air is another, and the forces added
    after the projection (fingering, tension, the drip) are not projected
    at all — so the plate made dye wherever they spread it, and destroyed
    it wherever they gathered it. The Finger showed it worst: its carry
    makes steep edges, the fingering push (taken out since; see forcesB)
    ran along the dye's own gradient, and where the push ran outward the
    plate gained forty to sixty per cent of what it held (npm run tools, 592 -> 899; in the lab,
    the Finger's own path under the fingering push, 636 -> 756 against 687
    left alone). The patch's size is the Jacobian of the backtrace,
    1 - disp * div(v) to first order, taken here as its exponential so it
    cannot go negative, and held to a factor of about 1.6 either way in a
    single step so one bad texel of velocity cannot empty or flood a cell.

    And a gathering flow may thicken a cell only up to the most dye the
    cells it came from held. The fingering push was a push up the gradient
    where its noise was negative, and carried conservatively that is
    diffusion run backwards: in the lab a plate whose densest cell was 1.0
    grew a speck at the ceiling (6.0) inside five seconds. Held to its
    neighbourhood it could not make a new peak, and what the hold kept out
    was lost, as the ceiling's own cap loses it: 3 per cent in that window,
    where the backtrace alone lost 5. Over ten seconds of forty pools that
    loss came to more than half the plate, which is why the push was taken
    out rather than carried (forcesB). The hold stays for what is left
    that gathers: tension, the drip, a press.
  */
  if (A.a.y > 0.5) {
    let vR = textureLoad(vel, clampP(q + vec2i(1, 0), S.n), 0).x;
    let vL = textureLoad(vel, clampP(q - vec2i(1, 0), S.n), 0).x;
    let vU = textureLoad(vel, clampP(q + vec2i(0, 1), S.n), 0).y;
    let vD = textureLoad(vel, clampP(q - vec2i(0, 1), S.n), 0).y;
    let div = ((vR - vL) + (vU - vD)) * 0.5 * S.n;
    let j = exp(clamp(-A.a.x * div, -0.5, 0.5));
    o = select(o * j, min(o * j, max(mx, o)), j > 1.0);
  }
  textureStore(dst, q, select(vec4f(0.0), o, finite4(o)));
}`,

  /*
    The mix rides the flow in flux form, as the ferrofluid does (see
    phaseAdvect): each face's flux computed the same way from both sides, so
    none of it is made or lost. μ (a) is derived and is not carried.
  */
  mixAdvect: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba32float, write>;
// The face velocity is built as phaseAdvect's is, for the same reasons: the
// oil's capillary force is as sharp at a drop's rim as the maze's.
@group(0) @binding(5) var<storage, read> pr: array<f32>;
${PACKED}
fn mx(p: vec2i, n: i32) -> vec3f { return textureLoad(src, clamp(p, vec2i(0), vec2i(n - 1)), 0).rgb; }
fn mm(a: vec3f, b: vec3f) -> vec3f {
  return select(vec3f(0.0), select(max(a, b), min(a, b), a > vec3f(0.0)), a * b > vec3f(0.0));
}
fn flux(a: vec2i, e: vec2i, n: i32) -> vec3f {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return vec3f(0.0); }
  let t = vec2i(e.y, e.x);
  let va = textureLoad(vel, clamp(a - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, a, 0).xy + textureLoad(vel, clamp(a + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let vb = textureLoad(vel, clamp(b - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, b, 0).xy + textureLoad(vel, clamp(b + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let pa = packedAt(a.x, a.y, n);
  let pb = packedAt(b.x, b.y, n);
  let wide = 0.25 * ((pb - packedAt(a.x - e.x, a.y - e.y, n)) + (packedAt(b.x + e.x, b.y + e.y, n) - pa));
  let ve = dot(va + vb, vec2f(e)) * 0.125 + (wide - (pb - pa)) * f32(n) * A.b.z;
  let c = clamp(ve * A.b.y * f32(n), -0.45, 0.45);
  if (c >= 0.0) {
    let s = mm(mx(a, n) - mx(a - e, n), mx(b, n) - mx(a, n));
    return c * (mx(a, n) + 0.5 * (1.0 - c) * s);
  }
  let s = mm(mx(b, n) - mx(a, n), mx(b + e, n) - mx(b, n));
  return c * (mx(b, n) - 0.5 * (1.0 + c) * s);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let here = textureLoad(src, p, 0);
  let d = flux(p, vec2i(1, 0), n) - flux(p - vec2i(1, 0), vec2i(1, 0), n)
        + flux(p, vec2i(0, 1), n) - flux(p - vec2i(0, 1), vec2i(0, 1), n);
  let m = here.rgb - d;
  let out = vec4f(m.r, max(m.g, 0.0), m.b, here.a);
  textureStore(dst, p, select(vec4f(0.0), out, finite4(out)));
}`,

  /*
    Oil Bodies: the dye rides the flow the way the oil does (oilBodies).

    The dye is otherwise carried by a backtrace (macCormack), and the oil by
    the fluxes across each cell's faces (mixAdvect). Those are two different
    answers to where the liquid went, and over a stir they part: the oil's
    edge is in one place and its colour's edge a cell or two from it, and
    the colour is on the wrong side. So with Oil Bodies on, both shares of
    the dye (the plate's whole dye, and the oil's part of it, see
    bodyPartition) go through the same faces with the same fluxes as the oil,
    and a body's colour and its edge move as one.

    It is also the only way the dye survives the oil's own flow. The backtrace
    thins or thickens a cell by how much the flow spreads or gathers there
    (the Jacobian in macCormack), and the capillary flow's leftovers at the
    grid scale, which a collocated projection cannot see, spread and gather
    from one cell to the next; a thickening is held to the neighbourhood's
    most, a thinning is not, so every step lost a little. Measured in the lab
    (128², one oil drop with its colour, Oil Tension 0.5, 120 steps): 61% of
    the dye kept with the backtrace. Fluxes across faces are conservative
    whatever the flow does, and these are Rhie–Chow faces, which see the
    grid-scale part the projection cannot.

    A copy of mixAdvect over four channels, into the dye's own format.
  */
  bodyAdvect: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(5) var<storage, read> pr: array<f32>;
${PACKED}
fn mx(p: vec2i, n: i32) -> vec4f { return textureLoad(src, clamp(p, vec2i(0), vec2i(n - 1)), 0); }
fn mm(a: vec4f, b: vec4f) -> vec4f {
  return select(vec4f(0.0), select(max(a, b), min(a, b), a > vec4f(0.0)), a * b > vec4f(0.0));
}
fn flux(a: vec2i, e: vec2i, n: i32) -> vec4f {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return vec4f(0.0); }
  let t = vec2i(e.y, e.x);
  let va = textureLoad(vel, clamp(a - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, a, 0).xy + textureLoad(vel, clamp(a + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let vb = textureLoad(vel, clamp(b - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, b, 0).xy + textureLoad(vel, clamp(b + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let pa = packedAt(a.x, a.y, n);
  let pb = packedAt(b.x, b.y, n);
  let wide = 0.25 * ((pb - packedAt(a.x - e.x, a.y - e.y, n)) + (packedAt(b.x + e.x, b.y + e.y, n) - pa));
  let ve = dot(va + vb, vec2f(e)) * 0.125 + (wide - (pb - pa)) * f32(n) * A.b.z;
  let c = clamp(ve * A.b.y * f32(n), -0.45, 0.45);
  if (c >= 0.0) {
    let s = mm(mx(a, n) - mx(a - e, n), mx(b, n) - mx(a, n));
    return c * (mx(a, n) + 0.5 * (1.0 - c) * s);
  }
  let s = mm(mx(b, n) - mx(a, n), mx(b + e, n) - mx(b, n));
  return c * (mx(b, n) - 0.5 * (1.0 + c) * s);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let d = flux(p, vec2i(1, 0), n) - flux(p - vec2i(1, 0), vec2i(1, 0), n)
        + flux(p, vec2i(0, 1), n) - flux(p - vec2i(0, 1), vec2i(0, 1), n);
  // Upwind and limited, so it never takes more than a cell holds; the floor
  // is only for the rounding in a half-float dye.
  let out = max(textureLoad(src, p, 0) - d, vec4f(0.0));
  textureStore(dst, p, select(vec4f(0.0), out, finite4(out)));
}`,

  /*
    How far the step's flow carries anything across a face, at the most,
    in cells: for the carries' substeps in a thin gap (carryPlan, and why).

    The face velocity is the thin carries' own (THIN_FACE, the faces the
    thin solve made conserve liquid), so the number is the Courant number
    the flux step itself would clamp, not an estimate of it. Each cell reads its east and north faces; a workgroup keeps its
    largest and hands one atomicMax to the buffer. A positive float's bits
    order as the float does, so the maximum of the bits is the bits of the
    maximum. A.b.y is the step's displacement and A.b.w the rest gap, as
    the carries take them.

    The faces that count are the dish's own, both cells inside its open
    rim (the mobility not negative, wgsl/thinGap.ts's hsPrep): the picture
    never shows past the rim, and what lies there is not the liquid between
    the glasses the substeps are for. Counted, it set them. Under Plate
    Rock's cover glass the colour the film carries out past the rim piles
    against the grid's wall (no face through the wall carries anything),
    heavier than the plate's mean, and the tilt drives that pile on toward
    the wall: the grid's corner cells went 1.7 cells a step where the dish
    went 0.6, and the cells on the rim against the wall 0.9 where the dish
    went 0.3, and they asked three substeps of every carry where the liquid
    inside asked one (lab, the checker of \`npm run rides\` 5b, full rock).
    Past the rim the carries still carry, each substep held to its 0.45 of
    a cell, so what lies there keeps every amount and goes no faster than
    that (PLAN 27a-6).
  */
  carryCourant: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> pr: array<f32>;
@group(0) @binding(4) var<storage, read_write> most: array<atomic<u32>>;
@group(0) @binding(5) var sq: texture_2d<f32>;
@group(0) @binding(6) var<storage, read> mob: array<f32>;
${THIN_FACE}
var<workgroup> wgMost: atomic<u32>;
fn faceCourant(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  if (mob[a.x + a.y * n] < 0.0 || mob[b.x + b.y * n] < 0.0) { return 0.0; }
  return abs(thinFaceVel(a, e, n) * A.b.y * f32(n));
}
${W} fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) li: u32) {
  // No early return: the barriers below have to be reached by the whole workgroup.
  if (li == 0u) { atomicStore(&wgMost, 0u); }
  workgroupBarrier();
  if (inGrid(id)) {
    let p = vec2i(id.xy);
    let n = i32(S.n);
    var c = 0.0;
    if (p.x + 1 < n) { c = max(c, faceCourant(p, vec2i(1, 0), n)); }
    if (p.y + 1 < n) { c = max(c, faceCourant(p, vec2i(0, 1), n)); }
    // A NaN fails this and counts as nothing: safeVel has already zeroed any such cell.
    if (c > 0.0) { atomicMax(&wgMost, bitcast<u32>(min(c, 1e30))); }
  }
  workgroupBarrier();
  if (li == 0u) { atomicMax(&most[0], atomicLoad(&wgMost)); }
}`,

  /*
    How many substeps this step's carries take, decided on the GPU from the
    Courant number carryCourant found, so a press is followed from its first
    step with nothing read back.

    The carries move an amount across each face, upwind and limited, and a
    face may carry no more than 0.45 of a cell in one go (the clamp in
    bodyAdvect). That is plenty for a stir, and nowhere near a hand on the
    glass: on a thin gap the app's Press thins the film by half in its first
    steps, and the liquid it squeezes out crosses up to 8 cells of a 384²
    solver a step even with the film closing as h³ (squeezeUpdate; 75 when
    it closed by subtraction), measured in the lab on Classic's clock.
    Clamped, the colour stayed where the liquid left it: the ring
    round a press went 42% of the way the displaced volume sends it, and
    when the glass came back up, slowly enough to be carried, it was drawn
    in past where it began. The fast stroke out and the slow stroke back
    were two different flows to the dye, so a press could never be undone.

    So the carries are split into n substeps of 1/n of the step each, n
    enough to keep every face under A.a.x of a cell. n is odd: one substep
    is run as always, then the rest in pairs, each pair from the read field
    to the write field and back, so the result lands in the same texture
    whatever n is and the encoder needs no count. Each pair is an indirect
    dispatch; a pair this step does not need is given no workgroups.
    A.a.y is the most substeps (odd), A.a.z the workgroups across the grid,
    A.a.w the pairs. `sub` is 1/n, n and the Courant number, for the
    carries and for a check to read.
  */
  carryPlan: `${HEAD}
@group(0) @binding(2) var<storage, read_write> most: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> ind: array<u32>;
@group(0) @binding(4) var<storage, read_write> sub: array<f32>;
@compute @workgroup_size(1)
fn main() {
  let c = bitcast<f32>(atomicLoad(&most[0]));
  // Ready for the next step's maximum.
  atomicStore(&most[0], 0u);
  // Clamped as a float first: a float past u32's range has no defined conversion.
  let n = u32(clamp(ceil(c / A.a.x), 1.0, A.a.y)) | 1u;
  let w = u32(A.a.z);
  for (var k = 0u; k < u32(A.a.w); k++) {
    let on = 2u * k + 1u < n;
    ind[3u * k] = select(0u, w, on);
    ind[3u * k + 1u] = select(0u, w, on);
    ind[3u * k + 2u] = 1u;
  }
  sub[0] = 1.0 / f32(n);
  sub[1] = f32(n);
  sub[2] = c;
}`,

  /*
    A field carried onto a new grid (PLAN 9w): the old solver's texture, read
    whole, written at this solver's size. A.a = (the old grid, this grid).

    Each new cell takes the mean of the old cells under it, weighted by how
    much of each it covers, which is the one resampling that keeps what the
    field holds: a cell's value times its area, summed over the plate, comes
    out the same on either grid to the last rounding. That matters because
    these fields are amounts. The ferrofluid's is how much of each cell it
    fills; the oil's is the same, and Cahn–Hilliard holds the total exactly
    from then on (npm run physics). A bilinear read would put a little more
    or less liquid on the plate at every move of the grid, and the governor
    moves it whenever the frame time crosses a rung.

    What it does not keep is an edge sharper than the coarser grid: going up,
    an edge that was one old cell wide is a step two or three new cells wide,
    which the field's own separation (phaseSeparate, mixRelax) narrows back
    to its own width in a few steps; going down, an edge narrower than a new
    cell is averaged into it, as it would be by any grid that size. Nothing
    is clamped: a mean of values between 0 and 1 is between them already.

    Reads by textureLoad, never a sampler, because the phase is r32float
    and not filterable on every device.
  */
  carryArea: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  // Counted in integers, in old cells times the new grid: a new cell spans
  // [id·old, (id+1)·old) and an old one [k·new, (k+1)·new), so every
  // overlap is exact. In floats, a cell's edge 255 cells in was off by
  // about 1e-5 of a cell and so was its weight.
  let oldN = i32(A.a.x);
  let newN = i32(A.a.y);
  let me = vec2i(id.xy);
  if (me.x >= newN || me.y >= newN) { return; }
  let lo = me * oldN;
  let hi = lo + vec2i(oldN);
  let k0 = lo / newN;
  let k1 = min((hi - vec2i(1)) / newN, vec2i(oldN - 1));
  var sum = vec4f(0.0);
  for (var y = k0.y; y <= k1.y; y++) {
    let wy = min(hi.y, (y + 1) * newN) - max(lo.y, y * newN);
    for (var x = k0.x; x <= k1.x; x++) {
      let wx = min(hi.x, (x + 1) * newN) - max(lo.x, x * newN);
      sum += f32(wx * wy) * textureLoad(src, vec2i(x, y), 0);
    }
  }
  textureStore(dst, me, sum / (f32(oldN) * f32(oldN)));
}`,

  /*
    The glass's drift taken out of the flow the carries ride (PLAN 27a-1;
    fluid.ts, driftCells, says why): the velocity less A.a.xy, the drift in
    the velocity's units. What is left is the flow as seen from a frame
    going with the film, which the carries take in as many substeps as it
    needs; driftShift moves every carried field the rest of the way.
  */
  driftOff: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let v = textureLoad(vel, vec2i(id.xy), 0);
  textureStore(dst, vec2i(id.xy), vec4f(v.xy - A.a.xy, v.zw));
}`,

  /*
    A carried field moved with the glass's drift, A.a.xy cells (whole cells,
    each at most 8 either way) and A.a.zw more (a fraction, at most half a
    cell either way): what driftOff took out of the flow.

    The whole cells are a shift, which is exact: nothing is interpolated,
    so a drift of three cells a step blurs nothing, where a carry would cut
    the step into eight substeps to move it and smear a little at each.
    The fraction is one step of the carries' own flux (bodyAdvect's upwind,
    limited, through every face alike at the fraction's Courant number),
    which is what a carry would do with it, in one pass where the carry
    would have needed two more substeps of the whole flow to stay under
    its 0.4 of a cell.

    At the grid's wall both do what the carries do there (no face through
    the wall carries anything; bodyAdvect's \`courant\`): what is carried
    into the wall piles up in the cell against it, and the cells it left on
    the far side are left empty. So every amount on the plate is kept, as
    across faces. \`at\` gathers a cell of the shifted field from the range
    [lo, hi] of cells that land in it, per axis: one cell inside, every
    cell carried past it for the cell against the wall, none for a cell the
    drift left.

    What is moved is what its carry moves, so A.b.x says which:
      0, an amount a cell, as bodyAdvect carries the colour, the poured
         liquids, the reaction and the species, floored at 0 as it does;
      1, the mix, as mixAdvect carries it: the oil (.g, floored), the
         oil's colour (.r) and the acidity (.b, signed: + acid, − base),
         and its chemical potential (.a) not carried at all;
      2, the ferrofluid's share of the column, which on a thin gap its
         carry keeps as a volume, c·h (phaseAdvect): the share times the
         gap is what moves, and what lands is divided by the gap it lands
         in, so where the gap varies (a press, a kick) the drift keeps the
         ferrofluid's volume as the carry it stands in for did.
    \`sq\` is the gap, read only by 2.
  */
  driftShift: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
/*
  The gap is read only for the ferrofluid's volume (2): a \`select\` reads
  both of its sides, so as one it loaded the gap at every cell of every
  field the drift moves.
*/
fn gapAt(q: vec2i) -> f32 {
  if (A.b.x > 1.5) { return max(textureLoad(sq, q, 0).r, 0.004); }
  return 1.0;
}
fn sources(j: i32, s: i32, n: i32) -> vec2i {
  var lo = j - s;
  var hi = j - s;
  if (j == n - 1) { hi = n - 1; }
  if (j == 0) { lo = 0; }
  return vec2i(max(lo, 0), min(hi, n - 1));
}
// The field moved by the whole cells, at q (clamped to the grid, as the carries read past it).
fn at(q0: vec2i, n: i32) -> vec4f {
  let q = clamp(q0, vec2i(0), vec2i(n - 1));
  let sx = sources(q.x, i32(round(A.a.x)), n);
  let sy = sources(q.y, i32(round(A.a.y)), n);
  var sum = vec4f(0.0);
  for (var y = sy.x; y <= sy.y; y++) {
    for (var x = sx.x; x <= sx.y; x++) { sum += textureLoad(src, vec2i(x, y), 0) * gapAt(vec2i(x, y)); }
  }
  return sum;
}
fn mm(a: vec4f, b: vec4f) -> vec4f {
  return select(vec4f(0.0), select(max(a, b), min(a, b), a > vec4f(0.0)), a * b > vec4f(0.0));
}
/*
  bodyAdvect's limited upwind flux through a face at Courant number c, from
  the four cells along it: am, a | b, bp. Only one of am and bp is read,
  by c's sign.
*/
fn face(am: vec4f, a: vec4f, b: vec4f, bp: vec4f, c: f32) -> vec4f {
  if (c > 0.0) { return c * (a + 0.5 * (1.0 - c) * mm(a - am, b - a)); }
  return c * (b - 0.5 * (1.0 + c) * mm(b - a, bp - b));
}
/*
  The flux through a cell's two faces along e at Courant number c: \`o\` to
  p + e, \`i\` from p − e, nothing through the grid's wall (as bodyAdvect).
  The five cells along the line are each read once, and of the two cells
  two away only the upwind one; the kernel this replaces called \`at\`
  once per use, twenty-one times a cell, two loads each (PLAN QA-25).
*/
struct Faces { o: vec4f, i: vec4f }
fn faces(p: vec2i, e: vec2i, c: f32, n: i32, here: vec4f) -> Faces {
  if (c == 0.0) { return Faces(vec4f(0.0), vec4f(0.0)); }
  let back = at(p - e, n);
  let on = at(p + e, n);
  let far = at(p + select(2, -2, c > 0.0) * e, n);
  let q = p + e;
  let r = p - e;
  return Faces(select(vec4f(0.0), face(back, here, on, far, c), q.x < n && q.y < n),
               select(vec4f(0.0), face(far, back, here, on, c), r.x >= 0 && r.y >= 0));
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let n = i32(S.n);
  let p = vec2i(id.xy);
  let x = vec2i(1, 0);
  let y = vec2i(0, 1);
  let cx = clamp(A.a.z, -0.5, 0.5);
  let cy = clamp(A.a.w, -0.5, 0.5);
  let here = at(p, n);
  let fx = faces(p, x, cx, n, here);
  let fy = faces(p, y, cy, n, here);
  // Summed in the order the old kernel summed them: on SwiftShader the field is the same to the bit.
  let moved = here - (fx.o - fx.i + fy.o - fy.i);
  var out = max(moved, vec4f(0.0));
  if (A.b.x > 1.5) { out = max(moved / gapAt(p), vec4f(0.0)); }
  else if (A.b.x > 0.5) { out = vec4f(moved.r, max(moved.g, 0.0), moved.b, textureLoad(src, p, 0).a); }
  textureStore(dst, p, select(vec4f(0.0), out, finite4(out)));
}`,
};
