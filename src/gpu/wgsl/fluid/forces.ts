/**
 * The forces on the flow: the poured liquids', the oils' tension, the current
 * under the plate, the turntable's swirl, vorticity confinement and the slosh.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { BILERP_N, HEAD, NOISE_WGSL, W } from './shared';
import { DISH_GAP_RANGE, DISH_METRES } from '../../../lib/turntable';

export const FORCE_KERNELS: Record<string, string> = {
  liquidForces: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var liquids0: texture_2d<f32>;
@group(0) @binding(4) var liquids1: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let v = textureLoad(vel, p, 0);
  let l0 = textureLoad(liquids0, p, 0);
  let l1 = textureLoad(liquids1, p, 0);
  
  let soap = l0.r;
  let body = l0.g;
  let repel = l0.b;
  let heavy = l0.a;
  let polar = l1.r;
  
  if (soap == 0.0 && body == 0.0 && repel == 0.0 && heavy == 0.0 && polar == 0.0) {
    textureStore(dst, p, safeVel(v));
    return;
  }
  
  var fx = 0.0;
  var fy = 0.0;
  let dt = S.dt;
  let s = S.n;
  
  if (soap > 0.0) {
    let gx = (textureLoad(liquids0, p + vec2i(1, 0), 0).r - textureLoad(liquids0, p - vec2i(1, 0), 0).r) * 0.5;
    let gy = (textureLoad(liquids0, p + vec2i(0, 1), 0).r - textureLoad(liquids0, p - vec2i(0, 1), 0).r) * 0.5;
    fx -= gx * A.a.x * dt * s;
    fy -= gy * A.a.x * dt * s;
  }
  
  if (body > 0.0 && A.a.y == 0.0) {
    let k = min(0.9, body * A.a.z * dt);
    fx -= v.x * k;
    fy -= v.y * k;
  }
  
  if (heavy != 0.0 && (S.rock.x != 0.0 || S.rock.y != 0.0)) {
    fx += S.rock.x * heavy * A.a.w * dt * s;
    fy += S.rock.y * heavy * A.a.w * dt * s;
  }
  
  if (polar != 0.0) {
    let dR = textureLoad(liquids1, p + vec2i(1, 0), 0).r - polar;
    let dL = textureLoad(liquids1, p - vec2i(1, 0), 0).r - polar;
    let dU = textureLoad(liquids1, p + vec2i(0, 1), 0).r - polar;
    let dD = textureLoad(liquids1, p - vec2i(0, 1), 0).r - polar;
    fx -= (dR * dR - dL * dL) * A.b.x * dt * s;
    fy -= (dU * dU - dD * dD) * A.b.x * dt * s;
  }
  
  if (repel > 0.0) {
    let gx = (textureLoad(liquids0, p + vec2i(1, 0), 0).b - textureLoad(liquids0, p - vec2i(1, 0), 0).b) * 0.5;
    let gy = (textureLoad(liquids0, p + vec2i(0, 1), 0).b - textureLoad(liquids0, p - vec2i(0, 1), 0).b) * 0.5;
    let g = sqrt(gx * gx + gy * gy);
    if (g > 1e-5) {
      let nx = -gx / g;
      let ny = -gy / g;
      let outF = v.x * nx + v.y * ny;
      if (outF > 0.0) {
        let k = min(0.9, repel * A.b.y * dt * 60.0);
        fx -= nx * outF * k;
        fy -= ny * outF * k;
      }
    }
  }
  
  let maxf = A.b.z;
  fx = clamp(fx, -maxf, maxf);
  fy = clamp(fy, -maxf, maxf);
  
  textureStore(dst, p, safeVel(vec4f(v.x + fx, v.y + fy, v.z, v.w)));
}`,

  // Everything the CPU applies after the projection.
  forcesB: `${HEAD}${NOISE_WGSL}${BILERP_N}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dye: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  let uv = uvOf(id);
  var v = textureLoad(vel, q, 0);
  let dyeC = textureLoad(dye, q, 0);
  let d = dyeC.a;
  let p = uv * S.l;
  let eL = vec2f(1.0 / S.l, 0.0);

  if (S.turbScale > 0.005) {
    var cur = vec2f(0.0);
    for (var o = 0; o < 4; o++) {
      if (o >= S.turbDetail) { break; }
      let freq = (0.012 / (S.l / 128.0)) * f32(1 << u32(o));
      let tOff = S.time * (0.06 + f32(o) * 0.05) + f32(o) * 37.7;
      let eps = 0.75;
      let dn_dx = snoise(vec2f((p.x + eps) * freq, p.y * freq + tOff)) - snoise(vec2f((p.x - eps) * freq, p.y * freq + tOff));
      let dn_dy = snoise(vec2f(p.x * freq, (p.y + eps) * freq + tOff)) - snoise(vec2f(p.x * freq, (p.y - eps) * freq + tOff));
      cur += vec2f(dn_dy, -dn_dx) * (pow(0.55, f32(o)) / (2.0 * eps * freq));
    }
    v = vec4f(v.xy + cur * (S.turbScale * (0.5 / 3.0)), v.z, v.w);
  }

  if (S.spin > 0.0 && d > 0.05) {
    let qn = p * 0.025 + vec2f(0.0, S.time * 0.08);
    let n = snoise(qn);
    let dn_dx = (snoise(qn + vec2f(0.01, 0.0)) - n) * 100.0;
    let dn_dy = (snoise(qn + vec2f(0.0, 0.01)) - n) * 100.0;
    v = vec4f(v.xy + vec2f(dn_dy, -dn_dx) * (S.spin / 0.03) * (0.4 / 3.0) * min(1.0, d), v.z, v.w);
  }

  if (S.tension > 0.0 && d >= 0.01) {
    let col = dyeC.rgb / d;
    let cR = bilerpN(dye, uv + eL, S.n);
    let cL = bilerpN(dye, uv - eL, S.n);
    let cT = bilerpN(dye, uv + eL.yx, S.n);
    let cB = bilerpN(dye, uv - eL.yx, S.n);
    var cdx = 0.0;
    var cdy = 0.0;
    if (cR.a > 0.01 && cL.a > 0.01) {
      let dr = length(cR.rgb / cR.a - col);
      let dl = length(cL.rgb / cL.a - col);
      cdx = dr * dr - dl * dl;
    }
    if (cT.a > 0.01 && cB.a > 0.01) {
      let dt_ = length(cT.rgb / cT.a - col);
      let db = length(cB.rgb / cB.a - col);
      cdy = dt_ * dt_ - db * db;
    }
    let n = snoise(p * 0.03 + vec2f(0.0, S.time * 0.05));
    v = vec4f(v.xy - vec2f(cdx, cdy) * (S.tension * 0.8) * d * (1.0 + n * 2.0), v.z, v.w);
  }

  /*
    There was a fingering push here, and it is gone on purpose.

    It pushed the dye along its own gradient by a slow noise, out where the
    noise was positive and back where it was negative, everywhere there was
    dye and a slope: a look's Polarity set how hard. Reported (Classic,
    2026-09-27): a grating over the dye, stripes three to eight cells across
    at every angle, and a quarter of an hour in, red dots in a lattice ten
    cells apart with labyrinths between them. Where the noise was negative
    the push was diffusion run backwards, which grows the shortest waves it
    can see fastest (the gradient was taken a logical cell either side, so
    waves of about four of those): a spinodal pattern in every pool, not
    fingers. \`npm run grating\` §5, Classic's own step on forty pools for ten
    seconds, the worst channel's share of variance in waves 2.6 to 16 texels
    across (the 512 grid the dye is drawn on), in parts of 10,000: 52 as
    laid, 107 without the push and 2518 with it; and the plate kept 97% of
    its dye without it and 41% with it (the advection's hold and cap threw
    away what the push piled up: the
    Finger's "adds none" reds, where the plate alone lost dye, so a stroke
    that stopped the loss read as adding it).

    Tried before taking it out, on the same plate in a first look (alpha
    only, waves 2.6 to 8 texels, where the push read 1895 against 32 without
    it): carried as a flux
    (keeps the dye, grows the pattern three times as fast), pushing only
    outward (still rippled: the push is kept in the velocity the next step
    carries on, so up a ripple's side and back is a wave), along the contours
    instead of across them (worse), and only at a pool's edge (clean at ten
    seconds; at thirty, a comb of teeth two to four cells across along every
    edge and holes drawn into pools, texture there five times the plate's own).

    None of those is the thing itself. Viscous fingering (Saffman-Taylor) is
    a thinner liquid driven into a thicker one through the thin gap between
    two glasses, whose drag is 12 mu / b^2: unstable where it displaces,
    steadied at short waves by the surface tension across the edge, which
    sets the fingers' width. Its fingers come from something driving the
    flow, a lift, a press, a pour, and a still plate grows none. This push
    had no driver but a noise and no width but the gradient's reach. PLAN §0
    has the model that does it properly: a viscosity per liquid, the gap's
    drag, and a pressure solve weighted by both. Until then the only fingers
    are the ones a lift draws (lib/squish.ts), which is a shortcut of its own
    and in the same plan item.
  */

  /*
    On a thin gap (A.a.x 1) three below are not here: each is taken as the
    force its phenomenon makes (PLAN 18a-2). Rain Drip and Updraft are the
    dye's weight and a draught's shear (hsBody); Glass Smear is the glass
    sliding, which drags the liquid toward its speed (hsPrep). Vibration
    stays a stir for now: as the glass ringing it is a change in the gap,
    and PLAN 18a-2 says why that waits for 18a-8.
  */
  let thin = A.a.x > 0.5;

  if (S.vibI > 0.0005 && d > 0.05) {
    let f = S.vibF * 0.5;
    let s = S.time * 20.0;
    v = vec4f(v.x + sin(p.x * f + s) * cos(p.y * f) * S.vibI,
              v.y + cos(p.x * f) * sin(p.y * f + s) * S.vibI, v.z, v.w);
  }

  if (!thin && S.drip > 0.01) {
    let streak = (snoise(vec2f(p.x * 0.15, p.y * 0.02 - S.time * 0.2)) + 1.0) * 0.5;
    v.y -= 0.5 * S.drip * (0.1 + streak * streak * 0.9);
    let s1 = 1.0 - max(0.0, streak);
    let friction = (0.5 + s1 * s1 * s1 * 20.0) * S.drip;
    v = vec4f(v.xy * exp(-friction * S.dt), v.z, v.w);
  }

  if (!thin && (S.smear.x != 0.0 || S.smear.y != 0.0) && d > 0.01) {
    v = vec4f(v.xy + S.smear * (snoise(p * 0.1) * 0.5 + 0.5), v.z, v.w);
  }

  if (!thin && S.air > 0.1 && d > 0.01) {
    let gx = snoise(vec2f(p.x * 0.05, p.y * 0.05 - S.time)) * S.air * 4.0 * S.dt;
    let gy = -S.air * 8.0 * S.dt + snoise(vec2f(p.y * 0.05, p.x * 0.05 + S.time)) * S.air * 4.0 * S.dt;
    v = vec4f(v.x + gx, v.y + gy, v.z, v.w);
  }

  textureStore(dst, q, safeVel(v));
}`,

  // The lasting current, at half resolution: A.a.x is 1/M for its own grid.
  currentForces: `${HEAD}${BILERP_N}
@group(0) @binding(2) var cur: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dye: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = A.a.y;                                  // this pass runs on the M grid
  if (id.x >= u32(m) || id.y >= u32(m)) { return; }
  let q = vec2i(id.xy);
  let uv = (vec2f(id.xy) + 0.5) / m;
  var c = textureLoad(cur, q, 0).xy;
  let temp = bilerpN(vel, uv, S.n).z;
  /*
    Buoyancy is linear with temperature (Boussinesq, PLAN §18f), with the tanh
    removed so plumes have a strength proportional to their heat rather than
    saturating at once. S.up is gated on upright, so a level plate has no in-plane
    buoyancy.
  */
  let dd = tanh(clamp(bilerpN(dye, uv, S.n).a - S.meanD, -10.0, 10.0));
  var f = S.up * (S.curBuoy * clamp(temp, 0.0, 50.0));
  f += S.rock * dd;
  let toC = vec2f(0.5) - uv;
  let r = length(toC);
  if (r > 1e-4) { f += (toC / r) * (S.curGrav * dd); }
  c = c * S.curDamp + f * (1.0 - S.curDamp);
  let s = length(c);
  if (s > S.maxCur) { c *= S.maxCur / s; }
  textureStore(dst, q, select(vec4f(0.0), vec4f(c, 0.0, 0.0), finite2(c)));
}`,

  // The flow the dye rides: the main field plus the current, sampled up from M.
  /*
    The flow the dye rides — and the plate's depth, which scales it (F).

    This builds velForced, the field the dye, the second phase, the grain and
    the particles are all carried through. The depth belongs here and nowhere
    else, and the two places it was tried first say why.

    A drag on the stored velocity in decayVel does nothing at all. Measured:
    halving every velocity every single step changed the plate's mean speed by
    less than a percent. The forcing re-saturates the speed clamp each step —
    MAX_SPEED is 0.002 and the field sits near it — so the magnitude is set by
    the clamp rather than by any balance of forces, and a pointwise multiply
    in front of that clamp is erased before anything reads it.

    Adding a velocity down the depth gradient was never tried, and it is not
    being claimed here that it fails — only that §H spent seven findings
    establishing that a smooth localised field is mostly a gradient and the
    projection exists to remove gradients, which is reason enough not to spend
    an eighth.

    What is left is the transport itself. Darcy in a thin film is
    u = -(h^2/12mu) grad p, so the depth is a mobility on the flow, and a
    mobility is a multiply on the displacement a cell is carried by. Nothing
    downstream can take it back, because there is no downstream: this *is*
    what carries the liquid.

    A.a.z is the exponent, so zero is exactly one — off, bit for bit, and the
    plate is the plate it was. One is the physical h^2. Above one exaggerates
    it, which is what a dial on a light-show desk is for.
  */
  addCurrent: `${HEAD}${BILERP_N}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var cur: texture_2d<f32>;
@group(0) @binding(4) var sq: texture_2d<f32>;
@group(0) @binding(5) var sw: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let v = textureLoad(vel, vec2i(id.xy), 0);
  let c = bilerpN(cur, uvOf(id), A.a.y).xy;   // the current is on the M grid
  var flow = v.xy + c;
  if (A.a.z > 0.0) {
    let h = max(textureLoad(sq, vec2i(id.xy), 0).r, 0.0005);
    let nominal = 0.03;
    /*
      Capped at one, so this is a drag and never a pump.

      Left free to rise above one it reached four at the dome's deep centre,
      and the plate did not run four times faster there — it ran fifty-three
      times faster and was plainly diverging, because the dye this carries
      feeds the forces that make the velocity it is built from. A mobility
      above one is physically fine and numerically a loop.

      So a gap deeper than nominal is not accelerated, it is simply not
      slowed, and the difference across the plate is the same difference. The
      floor keeps the tightest gap the plate allows from stopping the liquid
      dead.
    */
    let ratio = clamp((h * h) / (nominal * nominal), 0.04, 1.0);
    flow = flow * pow(ratio, A.a.z);
  }
  /*
    The spun dish's swirl (spinSwirl), after the depth: it is already the
    gap's own flow, worked out from the drag the gap sets, so the mobility
    above would count the gap twice. A.a.w turns plate widths a second into
    this field's units (the step's seconds over its displacement), and is
    zero whenever the swirl is not running, which adds nothing at all.
  */
  if (A.a.w != 0.0) {
    flow += bilerpN(sw, uvOf(id), A.a.y).xy * A.a.w;
  }
  textureStore(dst, vec2i(id.xy), safeVel(vec4f(flow, v.z, v.w)));
}`,

  /*
    The spun dish, in the frame that turns with its liquid (PLAN.md §22,
    lib/turntable.ts, which says why the picture turns with the liquid and
    not the glass). On the current's grid; its projection is the current's
    own three passes on its own textures.

    What is simulated. The liquid is a layer between two glasses that turn
    together. Depth-averaged, the flow between two plates is plane Poiseuille
    flow, and the walls hold it back with a drag 12ν/h² per unit mass (the
    Hele-Shaw drag PLAN §18a builds the whole solver on). So relative to the
    dish, the liquid's velocity decays at k = 12ν/h², here and now: h is this
    cell's gap (the squeeze film: the dome, and every press), ν its liquid's
    (the look's, and the oil where there is oil, mixed as viscosities mix,
    ln ν = x ln ν_oil + (1 − x) ln ν).

    The frame turns at ω_l, the liquid's bulk, which follows the dish with
    the drag time at the rest gap, 1/k0 (A.a.y is k0). In that frame the dish
    turns at A = Ω − ω_l (A.a.x), and the liquid here is dragged toward the
    dish's velocity A ẑ×r and pushed back by the frame's own acceleration,
    −ω̇_l ẑ×r = −A k0 ẑ×r. So its velocity w in this frame obeys

        dw/dt = A (k − k0) ẑ×r − k w + f_c − ∇p.

    Where the cell is the bulk (k = k0) nothing drives it and w stays zero:
    the whole picture turns, lagging the glass by the drag time, and that is
    all. Where the glass is closer (a press, the tight part of a dome) or the
    liquid thicker (oil), k > k0 and the liquid there is carried ahead with
    the dish; where the gap opens up it falls behind. That difference is the
    swirl, and it is what winds the colour into spirals.

    The centrifuge, f_c. In the turning frame everything feels ω_l² r
    outward. Acting on a density ρ(1 + β) that is a body force β ω² r, and
    written as β ω² ∇(r²/2) = ∇(β ω² r²/2) − (ω² r²/2) ∇β, its first part is
    a gradient, a pressure that moves nothing, and the second is what moves
    the liquid: −(ω² r²/2) ∇β, at the edges between liquids, heavy outward
    and light inward. Written that way on purpose: the current's projection
    is ten Jacobi sweeps, which clear a local divergence but leave most of a
    plate-wide gradient standing, and a force that is mostly gradient would
    have been kept by it as a flow that is not there. (A.a.z is ω_l².)

    Coriolis, −2ω ẑ×w, is not here, and the omission is the physics: for a
    flow without divergence ẑ×w is itself a gradient (ẑ×∇⊥ψ = −∇ψ), so the
    pressure takes all of it. Added as a force it would be deleted by an
    exact projection and kept in part by ten sweeps, which is a flow that is
    not there. (In a gap of varying depth hw, not w, is what has no
    divergence, and a sliver of the Coriolis force survives; PLAN §22 has it.)

    Integrated exactly over the step for a force held through it:
    w = a/k + (w − a/k) e^(−k dt), which is stable for any k, down to the
    glycerine's millisecond. dt is A.a.w, real seconds. Units are plate
    widths and seconds throughout; the gap is turned into metres by the
    plate's width (DISH_METRES) only where it meets the viscosity.
  */
  spinSwirl: `${HEAD}${BILERP_N}
@group(0) @binding(2) var sw: texture_2d<f32>;
@group(0) @binding(3) var dye: texture_2d<f32>;
@group(0) @binding(4) var sq: texture_2d<f32>;
@group(0) @binding(5) var mixT: texture_2d<f32>;
@group(0) @binding(6) var ph: texture_2d<f32>;
@group(0) @binding(7) var dst: texture_storage_2d<rgba16float, write>;
// Oil: its share of a cell, from the mix where a look has one (1×1 blank otherwise).
fn oilAt(uv: vec2f) -> f32 { return clamp(bilerpN(mixT, uv, f32(textureDimensions(mixT).x)).r, 0.0, 1.0); }
/*
  Δρ/ρ here. The dye as the current reads it (saturated about the plate's mean,
  so a plate with more dye everywhere is not heavier everywhere), times the
  dye's contrast (A.b.z); the oil lighter (A.b.w); the ferrofluid heavier, a
  fixed property of the liquid (lib/turntable.ts).
*/
fn weightAt(uv: vec2f) -> f32 {
  let d = tanh(clamp(bilerpN(dye, uv, S.n).a - S.meanD, -10.0, 10.0));
  let f = clamp(bilerpN(ph, uv, f32(textureDimensions(ph).x)).r, 0.0, 1.0);
  return A.b.z * d - A.b.w * oilAt(uv) + 0.25 * f;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = f32(textureDimensions(dst).x);
  if (id.x >= u32(m) || id.y >= u32(m)) { return; }
  let q = vec2i(id.xy);
  let uv = (vec2f(id.xy) + 0.5) / m;
  let d = uv - vec2f(0.5);
  // The way round a positive speed turns, in the solver's uv: the picture's
  // angle grows this way (uvToFluid in wgsl/plate.ts).
  let turn = vec2f(-d.y, d.x);
  let h = clamp(bilerpN(sq, uv, S.n).r, ${DISH_GAP_RANGE[0]}, ${DISH_GAP_RANGE[1]}) * ${DISH_METRES};
  let nu = exp(mix(log(A.b.x), log(A.b.y), oilAt(uv)));
  let k = 12.0 * nu / (h * h);
  var a = A.a.x * (k - A.a.y) * turn;
  if (A.a.z > 0.0) {
    let e = 1.0 / m;
    let g = vec2f(weightAt(uv + vec2f(e, 0.0)) - weightAt(uv - vec2f(e, 0.0)),
                  weightAt(uv + vec2f(0.0, e)) - weightAt(uv - vec2f(0.0, e))) / (2.0 * e);
    a -= 0.5 * A.a.z * dot(d, d) * g;
  }
  /*
    A thin gap (A.a.w below zero) takes the drive itself, as the speed it
    would hold the liquid to at the rest gap: its own solve brings the liquid
    toward that at k0 and drags it with the local 12ν/h², which lands on a/k,
    the same steady swirl, with the lag its own (fluid.ts, the swirl stage).
  */
  if (A.a.w < 0.0) {
    textureStore(dst, q, safeVel(vec4f(a / A.a.y, 0.0, 0.0)));
    return;
  }
  let still = a / k;
  let w = still + (textureLoad(sw, q, 0).xy - still) * exp(-k * A.a.w);
  textureStore(dst, q, safeVel(vec4f(w, 0.0, 0.0)));
}`,

  // The current's own divergence and projection, on the M grid.
  curDivergence: `${HEAD}
@group(0) @binding(2) var cur: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
fn velGM(p: vec2i, m: f32) -> vec2f {
  var v = textureLoad(cur, clampP(p, m), 0).xy;
  if (p.x < 0 || p.x > i32(m) - 1) { v.x = -v.x; }
  if (p.y < 0 || p.y > i32(m) - 1) { v.y = -v.y; }
  return v;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = A.a.y;
  if (id.x >= u32(m) || id.y >= u32(m)) { return; }
  let p = vec2i(id.xy);
  let dx = velGM(p + vec2i(1, 0), m).x - velGM(p - vec2i(1, 0), m).x;
  let dy = velGM(p + vec2i(0, 1), m).y - velGM(p - vec2i(0, 1), m).y;
  let divVal = -0.5 * (dx + dy) / m;
  textureStore(dst, p, select(vec4f(0.0), vec4f(divVal, 0.0, 0.0, 0.0), finite1(divVal)));
}`,

  curPressure: `${HEAD}
@group(0) @binding(2) var pr: texture_2d<f32>;
@group(0) @binding(3) var dv: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = A.a.y;
  if (id.x >= u32(m) || id.y >= u32(m)) { return; }
  let p = vec2i(id.xy);
  let s = textureLoad(pr, clampP(p - vec2i(1, 0), m), 0).r + textureLoad(pr, clampP(p + vec2i(1, 0), m), 0).r
        + textureLoad(pr, clampP(p - vec2i(0, 1), m), 0).r + textureLoad(pr, clampP(p + vec2i(0, 1), m), 0).r;
  let prVal = (textureLoad(dv, p, 0).r + s) * 0.25;
  textureStore(dst, p, select(vec4f(0.0), vec4f(prVal, 0.0, 0.0, 0.0), finite1(prVal)));
}`,

  curGradient: `${HEAD}
@group(0) @binding(2) var cur: texture_2d<f32>;
@group(0) @binding(3) var pr: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = A.a.y;
  if (id.x >= u32(m) || id.y >= u32(m)) { return; }
  let p = vec2i(id.xy);
  let v = textureLoad(cur, p, 0);
  let gx = textureLoad(pr, clampP(p + vec2i(1, 0), m), 0).r - textureLoad(pr, clampP(p - vec2i(1, 0), m), 0).r;
  let gy = textureLoad(pr, clampP(p + vec2i(0, 1), m), 0).r - textureLoad(pr, clampP(p - vec2i(0, 1), m), 0).r;
  let out = vec4f(v.xy - 0.5 * vec2f(gx, gy) * m, v.z, v.w);
  textureStore(dst, p, select(vec4f(0.0), out, finite4(out)));
}`,

  // Interface sharpening: anti-diffusion with a clamp (see the GLSL for why).
  // ─── The liquids' own physics and chemistry (docs/physics-plan.md) ───
  /*
    Vorticity confinement (Fedkiw, Stam & Jensen 2001), as a look option.

    Every grid solver loses small swirls to its own numerical smoothing, and
    this puts back a force along ∇|ω| × ω that spins up what is left of each
    eddy. It is not physics a thin film has: a liquid between two glasses is
    heavily damped. It is the swirl a projected show is loved for, so it is a
    dial, off by default. Two passes: the curl, then the push.
  */
  curl: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let w = (textureLoad(vel, clampP(p + vec2i(1, 0), n), 0).y - textureLoad(vel, clampP(p - vec2i(1, 0), n), 0).y)
        - (textureLoad(vel, clampP(p + vec2i(0, 1), n), 0).x - textureLoad(vel, clampP(p - vec2i(0, 1), n), 0).x);
  textureStore(dst, p, vec4f(0.5 * w, 0.0, 0.0, 0.0));
}`,

  // A.a.x = how hard, per step.
  confine: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var cw: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
fn wa(p: vec2i, n: f32) -> f32 { return abs(textureLoad(cw, clampP(p, n), 0).r); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let v = textureLoad(vel, p, 0);
  let g = vec2f(wa(p + vec2i(1, 0), n) - wa(p - vec2i(1, 0), n), wa(p + vec2i(0, 1), n) - wa(p - vec2i(0, 1), n));
  let gl = length(g);
  var f = vec2f(0.0);
  if (gl > 1e-6) {
    let nn = g / gl;
    let w = textureLoad(cw, p, 0).r;
    f = vec2f(nn.y * w, -nn.x * w) * A.a.x;
  }
  textureStore(dst, p, safeVel(vec4f(v.xy + f, v.z, v.w)));
}`,

  /*
    The slosh (PLAN 18a-13) laid over the flow the dye rides.

    `scaleDye`'s copy of the thin gap's velocity, plus the dish's own: a
    64 by 64 grid of velocities in plate widths a second (the GPU dish's
    flow, gpu/slosh.ts) read by uv, bilinear, and turned into this solver's own
    unit by the scale in A.a.w (the step's seconds over the step's
    displacement, as the swirl's is). It is added here, after the solve and
    before the dye rides it, and not as a force in front of it, because the
    gap's drag would take it straight out again: the drag is 12ν/h² on a flow
    with no inertia, and a wave that keeps going after the push stopped is
    just the inertia the gap does not have. So the dish keeps the inertia and
    the gap keeps the rim and the liquid's conservation.
  */
  addSlosh: `${HEAD}
${BILERP_N}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var slosh: texture_2d<f32>;
@group(0) @binding(4) var mixT: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let v = textureLoad(src, vec2i(id.xy), 0);
  // The dish's two layers (lib/slosh.ts): the water's flow in xy, the oil's in zw. Where the plate holds oil (the mix's
  // red, A.a.y on), that share of the cell rides the oil's: an oil body slides over the water as the raft it is.
  let f = bilerpN(slosh, uvOf(id), A.a.z);
  let c = select(0.0, clamp(textureLoad(mixT, vec2i(id.xy), 0).r, 0.0, 1.0), A.a.y > 0.5);
  let s = mix(f.xy, f.zw, c) * A.a.w;
  textureStore(dst, vec2i(id.xy), vec4f(v.xy + s, v.zw));
}`,
};
