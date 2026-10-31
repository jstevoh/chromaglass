/**
 * The gap between the two glasses: its shape, its rest, and how a press closes
 * it as a squeeze film, with the air it shuts out.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { HEAD, PACKED, PACKED_BILERP, W } from './shared';
import { DISH_GAP_RANGE, DISH_REST_GAP } from '../../../lib/turntable';

/* The gap field's rest number and its floor and ceiling, in gap units (lib/turntable.ts, PLAN 38r): one source for every kernel here. */
const GAP_REST = DISH_REST_GAP;
const GAP_FLOOR = DISH_GAP_RANGE[0];
const GAP_TOP = DISH_GAP_RANGE[1];

export const GAP_KERNELS: Record<string, string> = {
  // The plate gap and its rate of change. A.a.x is 1 when there is a delta to fold in.
  /*
    The gap between the two glasses, and how a press changes it.

    Three things were wrong here and all three were felt as "pressing does
    not do enough".

    **The plates were flats.** The gap was a constant, so the two glasses sat
    perfectly parallel — which no real pair of clock glasses does. The rest
    gap is a dome now: `plateCurve` below zero makes them touch in the middle
    and open toward the rim, above zero makes the rim the tight part. That is
    what decides where dye gathers and which way a press throws it, and with
    a flat gap a press could only ever push radially outward from wherever
    the finger was.

    **The press was over in a twelfth of a second.** The gap sprang back a
    fixed 0.005 a step across a range of 0.025, so it fully recovered in five
    steps, and `dhdt` — the squeeze that actually moves liquid — halved every
    step, a seventeen-millisecond half-life. Both are rates now, from
    `gapSpring` and `gapMemory`.

    **And the release did nothing.** `dhdt` was only ever written from the
    press delta, so the plates coming back apart contributed nothing: liquid
    was pushed out and never drawn back. The spring's own motion goes into
    `dhdt` here, so a press now pushes and its release pulls — which is what
    a squeeze between two wet glasses does, and why it redistributes dye
    instead of simply shoving it.
  */
  /*
    The gap at rest, laid down directly.

    The plate used to be filled with a flat 0.03 and then *spring* toward the
    dome, and the two disagreeing is a pump: at the middle the gap grows,
    which draws liquid in, and at the rim it shrinks, which pushes liquid off
    the edge. With the spring turned into a slow rate that is several seconds
    of the plate sucking toward its middle on every start, clear and look
    change — reported from the front as "all of the liquid is getting pulled
    toward a drain in the center", and measured as 10-20% more inward flow
    than a flat plate.

    So the fill knows the shape. A plate that starts at rest has nothing to
    settle toward and pumps nothing.
  */
  /*
    The glasses change shape, and the liquid between them keeps its dents (F).

    Re-laying the gap outright was the first version and it is a trap: the
    plate shape is a per-plate patch target, so the room camera or a sound
    mapping can drive it every frame — and re-laying writes the rest shape
    *and zeroes the rate*, which would wipe a live press sixty times a second
    for as long as the modulation ran.

    So a change of shape is a shift rather than a reset: every cell moves by
    the difference between the old rest and the new one, which leaves whatever
    a press had pushed it away from rest exactly where it was. The rate is not
    touched, because changing which glasses are on the desk is not a squeeze
    and should not pump the liquid.

    A.a.x is the shape it was laid at, A.a.y the shape it is going to.
  */
  gapReshape: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let d = uvOf(id) - vec2f(0.5);
  let r2 = clamp(dot(d, d) * 4.0, 0.0, 1.0);
  let k = (r2 - 0.5) * 2.0;
  let was = clamp(${GAP_REST} * (1.0 - A.a.x * k), ${GAP_FLOOR}, ${GAP_TOP});
  let now = clamp(${GAP_REST} * (1.0 - A.a.y * k), ${GAP_FLOOR}, ${GAP_TOP});
  let s = textureLoad(src, vec2i(id.xy), 0);
  textureStore(dst, vec2i(id.xy), vec4f(clamp(s.r + (now - was), ${GAP_FLOOR}, ${GAP_TOP}), s.g, s.b, s.a));
}`,

  gapRest: `${HEAD}
@group(0) @binding(2) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let d = uvOf(id) - vec2f(0.5);
  let r2 = clamp(dot(d, d) * 4.0, 0.0, 1.0);
  // Negated, because the sign was the other way round to every description
  // of it. types.ts and the two notes above all say the same thing — below
  // zero the glasses touch in the middle and open toward the rim, above zero
  // the rim is the tight part and the liquid pools in the centre — and the
  // formula did the opposite at both ends. Nothing could tell: the dome fed
  // the squeeze film and no look sets it, and depth did not reach the flow
  // until depth became a mobility on the transport, so the shape has
  // never been visible.
  let rest = clamp(${GAP_REST} * (1.0 - S.plateCurve * (r2 - 0.5) * 2.0), ${GAP_FLOOR}, ${GAP_TOP});
  textureStore(dst, vec2i(id.xy), vec4f(rest, 0.0, 0.0, 0.0));
}`,

  squeezeUpdate: `${HEAD}
@group(0) @binding(2) var sq: texture_2d<f32>;
@group(0) @binding(3) var addT: texture_2d<f32>;
@group(0) @binding(4) var sheetT: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let s = textureLoad(sq, vec2i(id.xy), 0);
  // Where this cell sits on the plate: 0 in the middle, 1 at the rim.
  let d = uvOf(id) - vec2f(0.5);
  let r2 = clamp(dot(d, d) * 4.0, 0.0, 1.0);
  // The dome the two glasses leave when nothing is pressing on them.
  let rest = clamp(${GAP_REST} * (1.0 - S.plateCurve * (r2 - 0.5) * 2.0), ${GAP_FLOOR}, ${GAP_TOP});
  var gap = s.r;
  var dhdt = 0.0;
  var pressed = false;
  if (A.a.x > 0.5) {
    let dg = textureLoad(addT, vec2i(id.xy), 0).a;
    if (dg != 0.0) {
      pressed = true;
      // A press closes the gap (down to the floor); the one thing that
      // opens it is a press's lift (lib/squish.ts), and that brings the
      // glass back up to where it rests, never past it. Uncapped, at the
      // default look's spring (half back to rest in about 1,450 steps, 24 s)
      // the lift opened the film to 0.081 against a rest of 0.030 and held
      // it for tens of seconds, and to 0.053 even on the lab's spring, forty
      // times the app's (check-skeptic, pre-push review). A gap already past
      // rest is left where it is, not pulled down.
      var g2 = max(${GAP_FLOOR}, gap + dg);
      if (dg > 0.0) { g2 = min(g2, max(gap, rest)); }
      /*
        On a thin gap (A.a.y) a press closes the film as a film under a load
        does: the liquid has to leave through the gap it is closing, whose
        resistance goes as 1/h³ (Reynolds; Stefan's law for two plates,
        F = 3πμR⁴ḣ / 2h³), so under a steady hand the glass comes down fast
        and slows as the film thins, dh/dt = −a (h/h₀)³, never quite reaching
        the floor. \`dg\` is the hand's rate at the rest gap h₀, as the
        Press lays it; integrated exactly over the step, 1/h² grows by
        2a/h₀³. Laid as a straight subtraction, the Press's bowl took the
        film from rest to the floor in one step, and the liquid it pushed out
        crossed 75 cells of a 384² solver in that step, past anything the
        dye's carry can follow (npm run presslift). The rate's other
        factors, the palm's size and the liquid's viscosity, stay in the
        hand's own number: a thicker liquid does not yet press slower.
      */
      if (dg < 0.0 && A.a.y > 0.5) {
        let h0 = max(rest, ${GAP_FLOOR});
        g2 = max(${GAP_FLOOR}, inverseSqrt(1.0 / (gap * gap) + 2.0 * (-dg) / (h0 * h0 * h0)));
      }
      dhdt += (g2 - gap) / max(S.dt, 0.0001);
      gap = g2;
    }
  }
  /*
    The rhythm sheet's change this step (A.a.z; lib/sheet.ts, PLAN 27f-4),
    laid as solved. Not as a press: the sheet's solve is already the film
    draining under it (lubrication, the film's own resistance), so a
    Stefan closing on top would count that resistance twice, and the ring
    it lifts round its dent is the sheet past rest, which a press's ceiling
    would cut off. Cut, it would ratchet: the ring's rise dropped, its
    fall laid in full, every kick leaving the gap a little closer where the
    ring went. Only the floor holds.

    And the floor keeps what it took (\`owed\`, the texel's fourth number).
    On a dome (Plate Shape below zero) the middle rests near the floor, and
    a dent there closes more than the gap has: the floor refuses the rest
    of it. Given back in full as the sheet lets go, the opening then landed
    past rest by all that was refused, and every kick near the middle left
    the gap a little more open: at Plate Shape −1, a dozen default kicks
    left the middle a whole dent past rest and the dish's mean 10% of a
    dent open (the review of #452). So what the floor refuses is owed, and
    the sheet's openings pay it before they open the gap: the gap is the
    floor or rest minus the dent, whichever is higher, as the sheet's own
    state says, however many kicks. It takes the spring as the gap does
    (the dent it stands for is pulled back by it too). The kick is also
    pressed no deeper than the dome's rest under it (pressKick), so what
    is owed is the dent's inner flank, not its middle.

    And not \`pressed\`. Setting it everywhere the sheet moved (which is every
    cell: the solve is a sum of sines) stopped the memory below for every
    other press while any kick's sheet was live: a hand press's push after
    it went from −4.5e2 a step to under 3. The memory must not repeat the
    sheet's own rate (the solve already carries it on), so the rate it
    remembers (the texel's third number) is this step's without the
    sheet's, and every other press keeps its tail.
  */
  var sheetRate = 0.0;
  var owed = s.a;
  if (A.a.z > 0.5) {
    let dw = textureLoad(sheetT, vec2i(id.xy), 0).r;
    if (dw != 0.0) {
      let want = gap + dw - owed;
      let g2 = max(${GAP_FLOOR}, want);
      owed = g2 - want;
      sheetRate = (g2 - gap) / max(S.dt, 0.0001);
      dhdt += sheetRate;
      gap = g2;
    }
  }
  /*
    The squeeze a press leaves behind (gapMemory): after the press, and
    never more than the gap has room to give.

    The memory keeps a press's rate going for a while after the press, which
    is how a press lasts longer than the step it lands on. It does not move
    the gap, so what it pushes out is liquid from a film that is not getting
    any thinner, and two ways that went on without end:

    Under a press that is still on. It was added to the press's own rate
    every step, so a press held on one place summed its rate over the whole
    half-life (0.22 s of the plate's time, three hundred steps at Classic's
    dt, many seconds on a slow machine): a cell closing by a little each
    step pushed out about three hundred times what it lost, and a cell
    already on the floor, which can close no further, kept pushing all the
    same. A bubble presses its footprint on every step, so every trapped
    bubble on a calm Classic plate was a source that never let up, and the
    plate flowed out from it everywhere: with the default look's glass, a
    held press's far plate went on at 3.35e-2 once its gap sat on the floor,
    with -8.5 a second of remembered closing under it (check-skeptic, npm
    run heldpress), and the bubble's rim, closing a little a step, at
    several hundred.

    So while a press is on, the source is what the gap really does, as mass
    conservation says it is; the memory takes over only once the press has
    gone, from the rate of its last step, and a remembered closing stops
    when the film can close no further. The remembered opening of a release
    is left as it was. That the memory pushes liquid without moving the gap
    at all is still a shortcut, written into PLAN.md.
  */
  if (!pressed) {
    let room = (gap - ${GAP_FLOOR}) / max(S.dt, 0.0001);
    dhdt += max(s.b * S.gapMemory, -room);
  }
  // The spring back toward the dome, and its motion counts.
  let g3 = gap + (rest - gap) * S.gapSpring;
  dhdt += (g3 - gap) / max(S.dt, 0.0001);
  let out = vec4f(g3, dhdt, dhdt - sheetRate, owed * (1.0 - S.gapSpring));
  textureStore(dst, vec2i(id.xy), select(vec4f(rest, 0.0, 0.0, 0.0), out, finite2(out.xy) && finite2(out.zw)));
}`,

  /*
    The squeeze film's pressure, as red-black Gauss-Seidel on packed planes.

    Hele-Shaw is the same Poisson operator as the projection, in the same
    Neumann box — only the source differs — so it gets the same treatment,
    and for the same reasons. Ten Jacobi passes ping-ponging two textures
    become five sweeps updating one buffer in place: half the arithmetic for
    about the same convergence, and the buffer's two colour planes keep each
    sweep's writes contiguous rather than spread across every other word.

    It warm-starts. The Jacobi did too — it never cleared between steps, it
    ping-ponged onward from wherever the last step left off — and in-place
    sweeps carry that on for free with no swap.

    The source is negated where the projection's is added, which is the only
    line here that is not the projection.
  */
  squeezeRedBlack: `${HEAD}
@group(0) @binding(2) var sq: texture_2d<f32>;
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
  let x = 2 * (i % half) + ((y + parity) & 1);
  let sv = textureLoad(sq, vec2i(x, y), 0);
  let h = sv.r;
  let src = clamp(12.0 * S.visc * sv.g / (h * h * h), -100.0, 100.0);
  let s = packedAt(x - 1, y, n) + packedAt(x + 1, y, n) + packedAt(x, y - 1, n) + packedAt(x, y + 1, n);
  let pNew = (s - src) * 0.25;
  pr[parity * n * half + i] = select(0.0, pNew, finite1(pNew));
}`,

  /** `squeezeVel`, reading the pressure from the buffer the sweeps wrote. */
  squeezeVelBuf: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read> pr: array<f32>;
${PACKED}${PACKED_BILERP}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let uv = uvOf(id);
  let v = textureLoad(vel, p, 0);
  let e = vec2f(1.0 / S.l, 0.0);
  let gx = (packedBilerp(uv + e, S.n) - packedBilerp(uv - e, S.n)) * 0.5;
  let gy = (packedBilerp(uv + e.yx, S.n) - packedBilerp(uv - e.yx, S.n)) * 0.5;
  let h = textureLoad(sq, p, 0).r;
  let coeff = -(h * h) / (12.0 * S.visc);
  textureStore(dst, p, safeVel(vec4f(v.xy + coeff * vec2f(gx, gy), v.z, v.w)));
}`,

  /*
    Where air is, liquid is not, and it went out to the rim (H6 · A, PLAN 15g-8).

    A bubble between two glasses is a pocket of air the liquid has been
    pushed out of: its meniscus sweeps the liquid, and the dye in it, ahead
    of itself, and the dye ends up in the liquid just outside the rim. Most of
    that is already the flow: the air arriving is a source in the projection
    (divergence, pressure.ts), so a growing bubble pushes the liquid out ahead
    of its edge. What the flow cannot do is empty the middle, and that is
    structural rather than tuning. A radial source's velocity is zero at its
    centre, and the dye's advection is semi-Lagrangian, which carries a value
    along a characteristic and has no term to dilute it, so the centre cell
    backtraces onto itself and keeps its dye for ever (a neighbour exchange
    driven by the air's difference fails the same way: the middle of a bubble
    is uniformly air, 0.990 of the plate's dye left there).

    This was a multiply, dye *= 1 - air, with the CPU putting what it took
    back as a ring from the readback mirror (depositBubbleRims). The multiply
    reached the middle; the deposit kept the plate's colour only when the
    mirror, the bubble list and the GPU agreed on which cells had been
    covered since the last deposit. On a slow runner they do not: a mirror
    frames behind a straw that blows a new bubble every hold on dye drifting
    in the breath's flow, and the Blow check's pool read +13%, -6.6%, -15%,
    +16% and -20% on a stroke that should keep it (PLAN 15g-8).

    So the liquid under the air now leaves the way the meniscus sends it: out
    from the bubble's centre, across the cell faces, in flux form. Each face's
    flux is what one cell sends and what its neighbour receives, so nothing
    is made or lost on any step, at any frame rate, with no mirror in it. A
    cell sends its air's share of its dye (air 1: all of it; the soft rim,
    its part), split over its four faces by where in its bubble it is (the
    air field carries that, wgsl/air.ts), and a little to every face so a
    bubble's very centre, which has no outward, still empties. The dye walks
    out a cell a pass until it reaches liquid with no air in it, and piles
    there: the ring a bubble pushes its dye into, which used to be laid by
    the CPU, is now where the liquid actually went.

    A.a.x is bubbleClear: 1 is the physical answer, and lower keeps some of
    the liquid in the air for a look that wants the old shading.
  */
  airDisplace: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var air: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
/*
  The share of cell p's dye that leaves it this pass through each face, in
  the order +x, -x, +y, -y: the air's share, split by the outward direction.
  Nothing leaves through the plate's edge, and nothing leaves a cell off it.
*/
fn leaving(p: vec2i, n: i32) -> vec4f {
  if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) { return vec4f(0.0); }
  let f = textureLoad(air, p, 0);
  let a = clamp(f.r, 0.0, 1.0);
  let s = clamp(A.a.x, 0.0, 1.0) * a;
  if (s < 1e-4) { return vec4f(0.0); }
  // Where in its bubble, -1 to 1 across and down (y-down, as the field is).
  let q = clamp(vec2f(f.g, f.b) / a * 2.0 - 1.0, vec2f(-1.0), vec2f(1.0));
  var w = vec4f(max(q.x, 0.0), max(-q.x, 0.0), max(q.y, 0.0), max(-q.y, 0.0)) + vec4f(0.05);
  w = w * vec4f(select(1.0, 0.0, p.x + 1 >= n), select(1.0, 0.0, p.x == 0),
                select(1.0, 0.0, p.y + 1 >= n), select(1.0, 0.0, p.y == 0));
  return s * w / max(w.x + w.y + w.z + w.w, 1e-6);
}
fn dyeAt(p: vec2i, n: i32) -> vec4f { return textureLoad(dye, clamp(p, vec2i(0), vec2i(n - 1)), 0); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let o = leaving(p, n);
  let ex = vec2i(1, 0);
  let ey = vec2i(0, 1);
  let outVal = dyeAt(p, n) * (1.0 - (o.x + o.y + o.z + o.w))
    + dyeAt(p - ex, n) * leaving(p - ex, n).x + dyeAt(p + ex, n) * leaving(p + ex, n).y
    + dyeAt(p - ey, n) * leaving(p - ey, n).z + dyeAt(p + ey, n) * leaving(p + ey, n).w;
  textureStore(dst, p, select(vec4f(0.0), max(outVal, vec4f(0.0)), finite4(outVal)));
}`,
};
