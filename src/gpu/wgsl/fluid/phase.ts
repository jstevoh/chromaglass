/**
 * The ferrofluid (the phase) poured and carried: its splat, its advection, what
 * it sees of the gap, a hand's carry and push, and the flow it rides on a thin gap.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { HEAD, PACKED, PHASE_MEAN3, STAND_ASIDE, W } from './shared';

export const PHASE_KERNELS: Record<string, string> = {
  /*
    The second phase: a heavy, immiscible liquid a magnet can pull (H7,
    docs/bubbles-plan.md B).

    It is one number a cell, how much of the dark phase is there, advected by
    the same flow as everything else — and then two things that are not
    advection, because a phase that only advects is a phase that blurs away.

    ── The magnet, and what it moves ──

    The magnet pulls the ferrofluid, and the pull is the gradient of the field
    squared (magnetEnergy, above, which says why), in real seconds: a slow
    look keeps the flow's own step tiny, and a magnet scaled by it crept, so a
    hand dragging it left the liquid behind.

    It moves the ferrofluid by moving the liquid (phaseForce). The note that
    used to sit here said a magnetic force on the velocity would be deleted by
    the projection, because a radial force is curl-free. That holds for a
    liquid that is magnetic everywhere, and this one is magnetic only where
    the ferrofluid is: the force density is φ ∇ψ, its curl is ∇φ × ∇ψ on the
    drop's edge, and the projection keeps exactly that part, which carries
    the drop toward the magnet and the water around it. The flow carries the
    ferrofluid in flux form (phaseAdvect), and its own pressure keeps it from
    packing past full (phaseRelax).

    A.a = (magnet x, magnet y, height, strength), A.b.y the displacement the
    flow advects by.
  */
  /** A soft disc of the second phase, poured onto the plate. A.a = (x, y, r, amount). */
  phaseSplat: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let uv = uvOf(id);
  let d = length(uv - A.a.xy) / max(A.a.z, 1e-4);
  let add = select(0.0, (1.0 - d * d) * A.a.w, d < 1.0);
  textureStore(dst, vec2i(id.xy), vec4f(clamp(textureLoad(src, vec2i(id.xy), 0).r + add, 0.0, 1.0), 0.0, 0.0, 0.0));
}`,

  /*
    The flow carries the ferrofluid, in flux form.

    Not a backtrace, as the dye's is: a backtrace through any divergence the
    projection leaves behind makes liquid or loses it, and with the magnet
    pulling hard that was the whole story (see phaseForce). A finite-volume
    step moves liquid across faces instead, each face's flux computed the
    same way from both sides, so what leaves a cell arrives next door and the
    plate's total is exact whatever the flow is doing. Second order (a
    minmod-limited slope, MUSCL), so the edges stay sharp, and no flux
    through the walls.

    A.b.y is the flow's displacement per unit velocity (uv), as advect's.

    And under Thin Gap it carries a volume of liquid, not an area of stain
    (PLAN 15d, the Press on the ferrofluid). The field is how much of each
    cell the ferrofluid fills, a share of the gap's whole depth: a pool is 1
    all the way down. Carried by area, as the flux form above carries it, a
    pool under a Press stayed the size it was and went grey: the glass
    closing pushes the liquid out from under it, the flow's divergence
    there takes a share of every cell, and the fullest cell of a pool fell
    from 0.96 to 0.48 (lab, a palm pressing the gap to a sixth). The plate
    draws that as a brown ghost (9d), and it is not what a liquid does. A
    column of ferrofluid under a palm keeps its volume, so it gets thinner
    and wider and stays full, as a drop of paint between two glasses
    spreads when they are pressed together and is still paint.

    So what crosses each face is the liquid's volume, the share times the
    face's volume flux, and each cell divides by its gap after:
    c_new = (c·h_before − Σ fluxes) / h_after, h in rest gaps. The plate's
    total volume is exact whatever the flow does, as the flux form's area
    was. And a full pool stays full only if what leaves a cell is what the
    glass pushed out of it, so the face's volume flux has to be the one the
    thin solve made conserve liquid (wgsl/thinGap.ts), not a flux rebuilt
    from the cells' velocities: its face is the mean of the two cells' M·u*
    less n·M_f·ΔP, and the cells' fluxes h·u it left (hsGradient) are each
    the mean of their two faces' M_f·ΔP. So the face is the mean of the
    two cells' h·u plus n/4 times the second difference of M_f·ΔP along
    the axis (the same Rhie–Chow swap as above, on the solve's own P and
    mobility, which is exact here where c·P is exact only where the drag
    is even). Two cuts on the way, measured on a pool pressed to a sixth
    of the gap and let go: putting the glass's part back as c times the
    gap's change along the liquid's path kept the pool full but grew it 7%
    each press and lift (the flux and the correction were not one flux);
    and the volume carried on the cells' filtered velocities kept it to
    0.2% but emptied the middle of the pool to 0.53 (that flux carried
    18% more out of the middle than the glass displaced). No [1 2 1]
    filter here: it would spread the press's divergence across the face.

    The gap goes from what the phase last moved in (\`gapSeen\`) to the gap
    now, a straight line across the substeps: A.a.y and A.a.z are this
    substep's start and end along it, A.a.w the rest gap. A.a.x = 1 turns
    it on: with Thin Gap only, because the old solver's flow cannot carry a
    press (PLAN 15b: a press is a source its clamp cuts back to idle speed),
    so dividing by the gap there piled what a press displaced under the
    palm (twelve times the pool's volume, lab). Off, this is the flux form
    above, unchanged.
  */
  phaseAdvect: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
@group(0) @binding(5) var<storage, read> pr: array<f32>;
@group(0) @binding(6) var sq: texture_2d<f32>;
@group(0) @binding(7) var<storage, read> gapSeen: array<f32>;
@group(0) @binding(8) var<storage, read> thinP: array<f32>;
@group(0) @binding(9) var<storage, read> mob: array<f32>;
@group(0) @binding(10) var stand: texture_2d<f32>;
${PACKED}
${STAND_ASIDE}
fn ph(p: vec2i, n: i32) -> f32 { return textureLoad(src, clamp(p, vec2i(0), vec2i(n - 1)), 0).r; }
fn minmod(a: f32, b: f32) -> f32 { return select(0.0, select(max(a, b), min(a, b), a > 0.0), a * b > 0.0); }
fn inside(a: vec2i, n: i32) -> bool { return a.x >= 0 && a.y >= 0 && a.x < n && a.y < n; }
// The limited value of the field the flux through face a → a + e carries, c its Courant number.
fn upwind(a: vec2i, e: vec2i, c: f32, n: i32) -> f32 {
  let b = a + e;
  if (c >= 0.0) { return ph(a, n) + 0.5 * (1.0 - c) * minmod(ph(a, n) - ph(a - e, n), ph(b, n) - ph(a, n)); }
  return ph(b, n) - 0.5 * (1.0 + c) * minmod(ph(b, n) - ph(a, n), ph(b + e, n) - ph(b, n));
}
/*
  Under a standing layer (STAND_ASIDE) the water carries the layer as a
  whole, and the film shapes it: what crosses a face there is each cell's
  own share, carried at the layer's mean speed round the face (over a
  seven-cell box round each of its two cells, about a dome's spacing: they
  stand 8 apart on 384²; each cell weighed by the ferrofluid it holds), not
  at the face's own. A real layer's domes ride the flow over
  the glass; the flow does not pour each dome into the gap beside it.

  What was reported: with the domes on, a pool held under the hand threw
  half the fingers past its rim (6/4/5/2 on the Mac in npm run fingers,
  against main's 12/9/9/3). Measured in the lab at the end of that run,
  the film's window held 7212 of the pool's 13029 where the same run
  with the film off held 5429: the window had stepped the plate's flow
  aside altogether, so nothing carried the layer out of it, and the
  pool's edge, fed from the middle by that flow, had less to finger with.
  Letting the flow carry each cell at the face's own speed brought the
  fingers back (7/12/8/5) and broke the domes: the flow converges and
  diverges cell to cell (the force's curl at the domes' own scale, the
  collocated projection's leftovers), and it poured them into one another
  so they set as black slabs, which is why the flow was stepped aside in
  the first place.

  Then (PLAN 9t-8) the face carried the layer's mean round it, a seven-cell
  box, at the face's own speed: the window held 5622, the fingers were
  9/12/9/4 in 7 sectors, and the domes stood. But the box is a blur of
  what is carried, and a drop moving under the window was blurred by it
  every step it moved: once the liquid's real onset (PLAN 38k) put a
  dragged magnet's drop under the film, the drop dragged by ferrodrag's
  magnet in the cloud lab fell from 100 cells past half full to 46 and its
  top from 1.5 of full to 0.74 in three seconds, smeared 3.4 radii behind
  the hand (PLAN 9t-2). So the box is over the speed now and not the
  share: the speed is smooth at the domes' scale, which is what keeps it
  from pouring them together, and the share it carries is the cell's own,
  so a drop or a dome is moved whole, as the plate moves everything else.
  The speed is the layer's, the cells' own weighed by the ferrofluid in
  each: the box's plain mean took in the still water round a drop of eight
  cells' radius and held the drop back (3.2 radii behind the same hand,
  the drop whole at last, 76 cells past half full and its top 1.5).

  Blended in over the window's edge as the other passes are, so a cell
  outside every window moves as it always has, to the bit.
*/
fn boxVel(a: vec2i, e: vec2i, own: f32, n: i32) -> f32 {
  let b = a + e;
  var t = 0.0;
  var w = BOX_OWN;
  for (var j = -3; j <= 3; j++) { for (var i = -3; i <= 3; i++) {
    let o = vec2i(i, j);
    let qa = clamp(a + o, vec2i(0), vec2i(n - 1));
    let qb = clamp(b + o, vec2i(0), vec2i(n - 1));
    let wa = max(ph(qa, n), 0.0);
    let wb = max(ph(qb, n), 0.0);
    t += wa * dot(textureLoad(vel, qa, 0).xy, vec2f(e)) + wb * dot(textureLoad(vel, qb, 0).xy, vec2f(e));
    w += wa + wb;
  } }
  return (t + BOX_OWN * own) / w;
}
// What the face's own speed weighs in the box's mean, in cells of ferrofluid:
// half of one, so where the box holds next to none the face is its own.
const BOX_OWN = 0.5;
// The flux across the face between cell a and cell a + e, in the +e direction.
fn flux(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  if (!inside(a, n) || !inside(b, n)) { return 0.0; }
  // The face's velocity, filtered [1 2 1] along the face: the collocated
  // projection leaves the flow a mode that alternates cell to cell, which the
  // two cells' plain mean passes across the other axis, and where the magnet
  // crowds the ferrofluid it printed a grid into the pool. The filter is
  // linear, so the flux field is as divergence-free as the flow it came from.
  let t = vec2i(e.y, e.x);
  let va = textureLoad(vel, clamp(a - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, a, 0).xy + textureLoad(vel, clamp(a + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let vb = textureLoad(vel, clamp(b - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, b, 0).xy + textureLoad(vel, clamp(b + t, vec2i(0), vec2i(n - 1)), 0).xy;
  /*
    And corrected by the last projection's pressure (Rhie–Chow). That
    projection subtracted the wide gradient, (p[j+1] − p[j−1]) / 2, from
    each cell, but solved the compact Laplacian, so the flow it left has a
    divergence of (L_compact − L_wide) p on the stencil this flux uses, all
    of it at the finest scale: where a force is sharp (every finger of the
    maze, the rim of a pool on the magnet) the flux step printed a grid of
    lines through the black. Swapping the two cells' wide gradients for the
    face's compact one makes the face flux divergence-free on this stencil.
  */
  let pa = packedAt(a.x, a.y, n);
  let pb = packedAt(b.x, b.y, n);
  let wide = 0.25 * ((pb - packedAt(a.x - e.x, a.y - e.y, n)) + (packedAt(b.x + e.x, b.y + e.y, n) - pa));
  var ve = dot(va + vb, vec2f(e)) * 0.125 + (wide - (pb - pa)) * f32(n) * A.b.z;
  // Under a standing layer, the flow's mean round the face: see boxVel.
  let s = 1.0 - aside(a, b, S.n);
  if (s > 0.0) { ve = mix(ve, boxVel(a, e, ve, n), s); }
  let c = clamp(ve * A.b.y * f32(n), -0.45, 0.45);
  return c * upwind(a, e, c, n);
}

// Under Thin Gap: the gap at cell p in rest gaps, a share t of the way through the step.
fn gapAt(p: vec2i, n: i32, t: f32) -> f32 {
  let q = clamp(p, vec2i(0), vec2i(n - 1));
  return mix(max(gapSeen[q.x + q.y * n], 0.004), max(textureLoad(sq, q, 0).r, 0.004), t) / A.a.w;
}
// The thin solve's pressure at a cell, zero past the rim (hsGradient's pAt).
fn thinPAt(q: vec2i, n: i32) -> f32 {
  if (mob[q.x + q.y * n] < 0.0) { return 0.0; }
  let half = n / 2;
  return thinP[((q.x + q.y) & 1) * n * half + q.y * half + (q.x >> 1)];
}
// The solve's M_f·ΔP through the face a → a + e; nothing through the grid's wall.
fn thinFace(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  if (!inside(a, n) || !inside(b, n)) { return 0.0; }
  let ma = abs(mob[a.x + a.y * n]);
  let mb = abs(mob[b.x + b.y * n]);
  return 2.0 * ma * mb / max(ma + mb, 1e-20) * (thinPAt(b, n) - thinPAt(a, n));
}
// The cell's volume flux h·u, in rest gaps, as hsGradient left it.
fn cellFlux(a: vec2i, e: vec2i, n: i32) -> f32 {
  return dot(textureLoad(vel, a, 0).xy, vec2f(e)) * max(textureLoad(sq, a, 0).r, 0.004) / A.a.w;
}
// Under a standing layer the same, the layer's mean round the face: see boxVel.
fn boxFlux(a: vec2i, e: vec2i, own: f32, n: i32) -> f32 {
  let b = a + e;
  var t = 0.0;
  var w = BOX_OWN;
  for (var j = -3; j <= 3; j++) { for (var i = -3; i <= 3; i++) {
    let o = vec2i(i, j);
    let qa = clamp(a + o, vec2i(0), vec2i(n - 1));
    let qb = clamp(b + o, vec2i(0), vec2i(n - 1));
    let wa = max(ph(qa, n), 0.0);
    let wb = max(ph(qb, n), 0.0);
    t += wa * cellFlux(qa, e, n) + wb * cellFlux(qb, e, n);
    w += wa + wb;
  } }
  return (t + BOX_OWN * own) / w;
}
// The volume across the face a → a + e this substep, in rest gaps of a cell.
fn volumeFlux(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  if (!inside(a, n) || !inside(b, n)) { return 0.0; }
  var face = 0.5 * (cellFlux(a, e, n) + cellFlux(b, e, n))
           + 0.25 * f32(n) * (thinFace(a - e, e, n) - 2.0 * thinFace(a, e, n) + thinFace(b, e, n));
  let s = 1.0 - aside(a, b, S.n);
  if (s > 0.0) { face = mix(face, boxFlux(a, e, face, n), s); }
  // As a Courant number, bounded as the flux form's is, then back to a volume.
  let h = 0.5 * (gapAt(a, n, A.a.y) + gapAt(b, n, A.a.y));
  let c = clamp(face * A.b.y * f32(n) / h, -0.45, 0.45);
  return h * c * upwind(a, e, c, n);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  // Not clamped at zero: that made ferrofluid wherever the limiter
  // undershot. phaseRelax fills a dip below empty from its neighbours instead.
  if (A.a.x > 0.5) {
    let d = volumeFlux(p, vec2i(1, 0), n) - volumeFlux(p - vec2i(1, 0), vec2i(1, 0), n)
          + volumeFlux(p, vec2i(0, 1), n) - volumeFlux(p - vec2i(0, 1), vec2i(0, 1), n);
    let val = (ph(p, n) * gapAt(p, n, A.a.y) - d) / gapAt(p, n, A.a.z);
    textureStore(dst, p, select(vec4f(0.0), vec4f(val, 0.0, 0.0, 0.0), finite1(val)));
    return;
  }
  let dx = flux(p, vec2i(1, 0), n) - flux(p - vec2i(1, 0), vec2i(1, 0), n);
  let dy = flux(p, vec2i(0, 1), n) - flux(p - vec2i(0, 1), vec2i(0, 1), n);
  let val = ph(p, n) - dx - dy;
  textureStore(dst, p, select(vec4f(0.0), vec4f(val, 0.0, 0.0, 0.0), finite1(val)));
}`,

  /*
    The gap the ferrofluid has now seen, for the next step's phaseAdvect to
    carry its volume from. One pass after all the substeps (they mix this
    and the squeeze texture by their share of the step), and its own pass
    because phaseAdvect reads its neighbours' and a pass that read and
    wrote it would race.
  */
  phaseGapSeen: `${HEAD}
@group(0) @binding(2) var sq: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> gapSeen: array<f32>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let n = i32(S.n);
  gapSeen[i32(id.x) + i32(id.y) * n] = max(textureLoad(sq, vec2i(id.xy), 0).r, 0.004);
}`,

  /*
    The ferrofluid carried by a hand (carryPhase): the Finger drags it along
    its stroke and Blow pushes it away, as they carry the dye (carryDye in
    the app) and the oil (mixCarry). Asked by the owner: "Shouldn't blowing
    and finger also move around the ferrofluid?" Barely. Both tools add
    velocity, and the ferrofluid rides the flow as the dye does, but the
    push is small (a Finger's moves the liquid about a tenth of a cell a
    step) and it lasts one step: the speed clamp (MAX_SPEED in fluid.ts,
    which the plate's flow already sits at) cuts it back to an idle plate's
    speed at the end of the step it was added in. Measured by the thread
    that went over every tool on every liquid: a Finger dragged 30 cells
    across a pool moved its middle 0.2 of a cell, dye and ferrofluid alike.
    So the dye has been moved by hand, a take and a put, since the Finger
    was built (carryDye), and the oil with it; the ferrofluid never was.

    Each cell under the hand gives up its share (more near the middle) and
    that share lands a hop away: along the stroke for the Finger and a
    directed blow, straight out from the middle for a puff (A.b.w), which
    opens a hole in a pool as air blown down on a thin layer does. The
    landing cell is found by gathering: every cell asks which of its
    neighbours within a hop send to it, each sender to exactly one whole
    cell, so what leaves one cell arrives in one other and nothing is made
    or lost. A cell that would send off the plate keeps its share.

    A.a = (x, y, radius, take), A.b = (the direction, the hop, radial), all
    in plate units.
  */
  phaseCarry: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
fn took(q: vec2i) -> f32 { return A.a.w * max(0.0, 1.0 - length((vec2f(q) + 0.5) / S.n - A.a.xy) / A.a.z); }
fn inPlate(q: vec2i) -> bool { return q.x >= 0 && q.y >= 0 && q.x < i32(S.n) && q.y < i32(S.n); }
// Where cell q's share lands, in whole cells, so each sender has one.
fn dest(q: vec2i) -> vec2i {
  var d = A.b.xy;
  if (A.b.w > 0.5) {
    let o = (vec2f(q) + 0.5) / S.n - A.a.xy;
    d = select(vec2f(0.0), o / max(length(o), 1e-6), length(o) > 0.5 / S.n);
  }
  let to = q + vec2i(round(d * A.b.z * S.n));
  return select(q, to, inPlate(to));
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let c = textureLoad(src, p, 0).r;
  // Nothing reaches a cell further than a hop past the hand's rim.
  if (length(uvOf(id) - A.a.xy) > A.a.z + A.b.z + 2.0 / S.n) {
    textureStore(dst, p, vec4f(c, 0.0, 0.0, 0.0));
    return;
  }
  var v = c * (1.0 - took(p));
  let R = i32(ceil(A.b.z * S.n)) + 1;
  for (var j = -R; j <= R; j++) { for (var i = -R; i <= R; i++) {
    let q = p + vec2i(i, j);
    if (inPlate(q) && all(dest(q) == p)) { v += textureLoad(src, q, 0).r * took(q); }
  } }
  textureStore(dst, p, vec4f(v, 0.0, 0.0, 0.0));
}`,

  /*
    Where the ferrofluid is, dye is not: it is pushed aside (Ferro Pushes Dye).

    The owner's reference for Ferro Paint is Chemical Bouillon's "Colored I" and
    "II": black ferrofluid worked through coloured water, and the black
    carries the colour. It pushes it into cells between its channels and
    packs it bright along its edges. On the plate as it was, the ferrofluid
    and the dye were two fields that never met. Measured in the lab (a plate
    of even dye, eighteen drops, a magnet walking a circle, 360 steps): dye
    under the black sat at 0.81–1.01 of its share of the area, and the water
    within two cells of the black held 0.84–1.01 of the dye of the water far
    from it. The black was a picture laid over still colour.

    Most of the ferrofluid's motion is not flow, which is why the shared
    velocity did not carry the dye with it. The maze's fingers grow and the
    drops round by Cahn–Hilliard, an exchange of phase between neighbouring
    cells down a chemical potential, and no liquid moves to do it. So the dye
    has to be told directly where the ferrofluid went.

    Two conserving exchanges between neighbours, per channel, so no dye is
    made or lost here:

    - Down the slope of open water (A.a.x). Each cell gives each neighbour
      with more water than it has k·(its dye)·(the difference), and takes
      the same from each neighbour with less. Where a finger grows into
      coloured water, the water there falls below the water ahead of it and
      the dye goes ahead and aside. Where the black retreats, the cell it
      leaves has more water than its neighbours and the dye comes back in.
      Across open water there is no slope and nothing moves, so the colour
      piles up in the first cells past the edge: the packed bright rim.
      The sum of what one cell gives is at most 4k, so k stays at or under
      a quarter.

    - Along the inside of the black (A.a.y). The exchange above cannot empty
      the middle of a pool, because a pool is uniformly full and there is no
      slope inside it: this is the lesson airExclude records, where a
      conserving exchange left the middle of a bubble at 0.99 of its dye.
      The bubbles gave up on conserving and multiply. Here the middle is
      drawn black all through, so it does not have to empty at once, only
      eventually: a plain diffusion of the dye, weighted by the smaller of
      the two cells' phase so it runs only inside the ferrofluid, walks the
      dye out to the edge, where the first exchange puts it in the water.
      Dye poured under a pool comes out over some seconds; the dye a growing
      finger meets never gets in, because the finger's tip is all slope.
  */
  phaseDisplace: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var phase: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;

fn fe(q: vec2i) -> f32 { return smoothstep(0.3, 0.6, textureLoad(phase, clampP(q, S.n), 0).r); }

${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let here = textureLoad(dye, p, 0);
  let fh = fe(p);
  let k = A.a.x;
  let d = A.a.y;
  var keep = 1.0;
  var got = vec4f(0.0);
  let offs = array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
  for (var i = 0; i < 4; i++) {
    let q = clampP(p + offs[i], S.n);
    let fq = fe(q);
    let there = textureLoad(dye, q, 0);
    // Open water is 1 - phase, so more water there is less phase there.
    keep -= k * max(fh - fq, 0.0) + d * min(fh, fq);
    got += there * (k * max(fq - fh, 0.0) + d * min(fh, fq));
  }
  textureStore(dst, p, max(here * keep + got, vec4f(0.0)));
}`,

  /*
    Two-phase carry of a coherent drop's rim on a thin gap (PLAN 29c-8;
    a named shortcut for the rim's ferrofluid velocity, with PLAN 29c-9 to
    replace the local window reconstruction by a coupled two-fluid velocity
    solve).

    What was reported and measured: on \`npm run ferrodrag\` (384², a drop of
    radius R = 0.025 dragged 0.3 of the plate in 3 s, 180 steps), after
    phaseMomentum and phaseCompress (29c-1) and degenerate Cahn–Hilliard
    mobility (29c-7), the drop still shed its trailing rim into a long wake
    (cells over 0.01: 324 → 1238, half-full cells: 100 → 0) and fell behind
    the magnet (lag 3.24R against the 2.0R bar, 1/3 checks).

    Physics, and why two-phase carry was chosen over a Korteweg or contact-line
    force before projection: the drop is an immiscible ferrofluid bead in clear
    oil in a thin gap. As the magnet drags the bead forward, the displaced oil
    closes in behind it in a 2D dipole return flow. Across the diffuse
    Cahn–Hilliard rim, a cell's projected velocity u_mix = φ·u_ff + (1 − φ)·u_oil
    blends the forward-moving ferrofluid column with the backward-moving oil.
    Where the back rim thins below half full, (1 − φ)·u_oil turns u_mix to zero
    and then backward into the wake; phaseAdvectPlan then carried faint
    ferrofluid into the wake, and phaseCompress (reading u_mix for its face
    Courant number) saw c_s ≈ 0 at the reversal line and compressed the shed
    tail along the wake instead of back into the drop. A real drop's back edge
    moves with the drop because surface tension holds the meniscus together and
    the ferrofluid column has its own phase velocity u_ff distinct from u_oil.
    Adding a Korteweg or sub-grid force before hsProject still leaves a single
    projected cell velocity u_mix shared by both phases (and any curl-free edge
    force is removed by the pressure projection). Carrying the ferrofluid phase
    with its own velocity here (read by phaseAdvect, phaseAdvectPlan and
    phaseCompress, while this.vel stays the mixture velocity for the dye, oil
    and phaseMomentum) gives the rim its phase velocity directly.

    Why each guard is here, measured against the checks 29c-4's body-carry
    attempts broke:
    - Pressed pools (\`npm run ferropress\`): under a press the radial squeeze
      speed |u(r)| = ½|dh/dt|/h · r grows linearly with r. A φ-weighted window
      round a rim cell has its centre of mass x_m shifted inward toward smaller
      r where |u| is slower; replacing v when v is already faster along u_m
      (dot(v.xy, um) >= dot(um, um)) held back the outward squeeze flow and
      overfilled the middle of the pressed paraboloid pool (0.968 → 1.183, 3/7).
      Leaving v untouched whenever dot(v.xy, um) >= u2 makes the pass a no-op
      on radial squeeze flows (ferropress 7/7, middle 0.968 → 0.981, worst ring
      0.012).
    - Two-liquid Darcy speed (\`npm run magnetgain\`) and the momentum and
      compression controls (\`npm run ferrohold\`): inside a diffuse drop the
      centre cells (φ ≈ 0.98) move ~30% faster than the drop's Taylor–Saffman
      two-liquid Darcy speed 2·c_clear/(c_ff + c_clear). Replacing v across the
      whole drop with the peak core speed sped the centroid up by 46%
      (magnetgain 4/5) and erased the leading-edge shear that phaseCompress
      acts on (ferrohold 4/5, half-full difference 8.3 against 13). Sampling the
      half-full body (φ >= 0.50) and weighting the carry by position along the
      drop's motion (along = dot(xm, um) / |um|: full carry up to φ = 0.96 on
      the trailing side along > 0 where the oil return flow turns backward, and
      only the outer toe φ < 0.49 on the leading side along < 0 so the front
      half-full contour keeps its Darcy velocity and MUSCL shear) holds
      magnetgain to 5/5 (+2% weak, +3% strong), ferrohold to 5/5 (lag 1.69R vs
      1.93R without momentum, +0.24R; half-full 107.6 vs 92.6 without
      compression, +15.0), and ferrodrag to 3/3 (lag 1.82R, 324 → 378 cells
      over 0.01, 100 → 106 half-full cells, stationary 0.010 cells).
    - Labyrinth and standing spikes (\`npm run spikes\`, \`maze\`, \`fingers\`,
      \`domes\`): when a labyrinth field (ferroLabyrinth > 0) or a close magnet
      past SPIKE_ONSET (spikeAmt > 0, filmHeld) is on, dipole repulsion
      (mazeForce) and the standing film (standing.ts) part the pool into narrow
      fingers and domes separated by 2–4 cell valleys; an 11-cell window across
      those valleys glued the domes into 3 pieces (spikes 4/6). A.a.x scales the
      carry by (1 − 2·maze)·(1 − spikeAmt) and zeroes it while filmHeld, so the
      pass steps aside on labyrinth and spike scenes (spikes 6/6, maze 4/4,
      fingers 4/4, domes 4/4).
  */
  phaseVelocity: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var phase: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
const phaseBody: f32 = 0.50;
const phaseFull: f32 = 0.96;
const phaseReach: i32 = 11;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let v = textureLoad(vel, p, 0);
  let own = clamp(textureLoad(phase, p, 0).r, 0.0, 1.0);
  if (own >= phaseFull || A.a.x <= 1e-4) { textureStore(dst, p, v); return; }
  var near = own;
  if (near <= 1e-4) {
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        let q = clamp(p + vec2i(i, j), vec2i(0), vec2i(n - 1));
        near = max(near, textureLoad(phase, q, 0).r);
      }
    }
  }
  if (near <= 1e-4) { textureStore(dst, p, v); return; }
  var s = 0.0;
  var mu = vec2f(0.0);
  var mx = vec2f(0.0);
  let reach = min(phaseReach, n - 1);
  for (var j = -reach; j <= reach; j++) {
    for (var i = -reach; i <= reach; i++) {
      let q = p + vec2i(i, j);
      if (q.x < 0 || q.y < 0 || q.x >= n || q.y >= n) { continue; }
      let pq = clamp(textureLoad(phase, q, 0).r, 0.0, 1.0);
      if (pq < phaseBody) { continue; }
      let r2 = f32(i * i + j * j);
      let b = (pq - phaseBody) / (1.0 - phaseBody);
      let w = b * exp(-r2 / 64.0);
      let uq = textureLoad(vel, q, 0).xy;
      s += w;
      mu += w * uq;
      mx += w * vec2f(f32(i), f32(j));
    }
  }
  if (s <= 0.0) { textureStore(dst, p, v); return; }
  let um = mu / s;
  let u2 = dot(um, um);
  if (u2 <= 1e-12 || dot(v.xy, um) >= u2) { textureStore(dst, p, v); return; }
  let xm = mx / s;
  let along = dot(xm, um) / sqrt(u2);
  let front = 0.72 * (1.0 - smoothstep(0.28, 0.49, own));
  let back = 1.0 - smoothstep(0.88, phaseFull, own);
  let trail = A.a.x * mix(front, back, smoothstep(-1.0, 2.0, along));
  if (trail <= 0.0) { textureStore(dst, p, v); return; }
  let u = mix(v.xy, um, trail);
  textureStore(dst, p, safeVel(vec4f(u, v.z, v.w)));
}`,

  /*
    phaseSeparate's grid-scale filter alone, for the ferrofluid carried as a
    volume under Thin Gap (phaseAdvect's A.a.x). The filter exchanges share
    between neighbours, which keeps Σc; but under a press the plate's
    ferrofluid is Σc·h, and a share moved from a cell the glass has closed
    on to one it has not is more liquid there than it was here. Measured on
    the Press × ferrofluid check's pool (npm run ferropress), pressed to a
    sixth of the gap in twenty steps as the glass closes under a load (h³,
    squeezeUpdate): its volume grew 1.9% (0.01570 to 0.01600), and with the
    filter skipped it was kept to 0.2%. (Cahn–Hilliard, which keeps Σc too,
    took 0.7% more over the ten steps held after: phaseCHVolume; the
    relaxation moved it by under 0.1%.) So here what crosses a face
    is a volume, the same exchange times the thinner of the two gaps, and
    each cell divides by its own: the pair's two sides are one number, so
    Σc·h is kept, and no cell takes more than an eighth of a difference a
    face, as before. The gaps are phaseAdvect's at the end of this
    substep: A.a.x of the way from the gap the phase last saw to now.
  */
  phaseGrid: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
@group(0) @binding(4) var gapNow: texture_2d<f32>;
@group(0) @binding(5) var<storage, read> gapSeen: array<f32>;
@group(0) @binding(6) var stand: texture_2d<f32>;
${STAND_ASIDE}
fn raw(p: vec2i) -> f32 { return textureLoad(src, p, 0).r; }
${PHASE_MEAN3}
fn gapAt(q: vec2i, n: i32) -> f32 {
  return mix(max(gapSeen[q.x + q.y * n], 0.004), max(textureLoad(gapNow, q, 0).r, 0.004), A.a.x);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let c = raw(p);
  let sp = mean3(p, n);
  let hp = gapAt(p, n);
  var d = 0.0;
  for (var k = 0; k < 4; k++) {
    let e = select(vec2i(0, 1 - 2 * (k & 1)), vec2i(1 - 2 * (k & 1), 0), k < 2);
    let q = p + e;
    if (q.x < 0 || q.y < 0 || q.x >= n || q.y >= n) { continue; }
    d += aside(p, q, S.n) * 0.125 * ((raw(q) - c) - (mean3(q, n) - sp)) * min(hp, gapAt(q, n));
  }
  let outVal = c + d / hp;
  textureStore(dst, p, select(vec4f(0.0), vec4f(outVal, 0.0, 0.0, 0.0), finite1(outVal)));
}`,
};
