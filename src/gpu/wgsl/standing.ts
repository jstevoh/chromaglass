/**
 * The ferrofluid standing up into domes under a magnet (PLAN §9t): the layer's
 * thickness, stepped as a thin film in a patch round each magnet.
 *
 * What was wrong. The plate keeps the ferrofluid as one number a cell, how
 * much of it is there, and held that number at or under full (phaseRelax):
 * a plan view of a layer that can only spread sideways. So the liquid kept
 * its area, and a pool under the Magnet could only be pushed into a packed
 * field of domes (spikes.ts's lattice, wells in its chemical potential and
 * a pull eased to half to let it spread): measured in the lab, 84% of the
 * plate within 0.08 of the magnet stayed black, where every reference shows
 * black domes with the colour open between them. A real layer keeps its
 * volume, not its area. A dome standing up takes its height out of the
 * layer round it, so its footprint shrinks and the gaps open on their own:
 * in the lab's thin-film model the cover goes as about 1.55 h0 / H (the
 * layer's depth over the domes' height), 100% flat, 50% just past the
 * onset, 30% at a strong field (an energy-minimising lab model, outside the
 * repo, of the same equations as below).
 *
 * The phenomenon: the normal-field (Rosensweig) instability. A layer of
 * ferrofluid under a field normal to it stays flat below a critical
 * magnetisation and stands up in peaks past it, a capillary wavelength
 * apart, with a jump in height, and hysteretic: turned down, the peaks stay
 * below the field that raised them (Cowley and Rosensweig 1967; Gollwitzer,
 * Rehberg and Richter 2007). In a layer thinner than its peaks the valleys
 * dry out and it breaks into domes and channels (Seric, Afkhami and Kondic
 * 2014).
 *
 * The model, the lab's, in units of the capillary length
 * l_c = sqrt(σ / Δρ g) for heights and distances:
 *
 *   h_t = ∇·(M(h) ∇p),   M = min(h, 1)³   (lubrication flow; time in 3μ l_c / σ)
 *   p   = −∇²h + h − √G S'(h) |k|(√G S(h)) − Π(h)
 *
 *   −∇²h   the surface tension of the ferrofluid against the water over it
 *   +h     gravity: it is the denser liquid
 *   −√G S'|k|√G S   the magnetic normal stress. A bump on a magnetised layer
 *          bends the field so it is stronger on the crest, which pulls the
 *          crest up in proportion to its height times its wavenumber: |k|,
 *          nonlocal, done with an FFT. G is μ0 M² / ((1 + 1/μr) √(Δρ g σ)),
 *          2 at the critical field, where wavelength 2π is the first to go.
 *          S(h) = hs tanh(h / hs) lets the lift stop growing once a peak is a
 *          few l_c tall, which stands for the tip's magnetisation saturating
 *          (without it the small-slope lift has no ceiling and the lab's
 *          peaks ran to 30 l_c).
 *   −Π(h)  the glass's wetting: a precursor film EPS deep and a contact angle,
 *          so a valley dries out without the thickness going negative.
 *
 * How it sits in the plate. The plate's own number a cell (c) is the volume:
 * the layer is h = H0·c + EPS deep, so a cell at full is a layer H0 deep, a
 * dome is a cell past full, and the dry glass between is c = 0 under its
 * precursor film. Each step, round each magnet close enough to raise domes,
 * a square patch of the plate's own cells (no resampling) is gathered into
 * h, stepped, and written back. Nothing in the patch is kept between steps:
 * the plate holds the layer, the patch only steps it. Inside the patch the
 * plate's own keeping of the ferrofluid (separation, Cahn–Hilliard, the
 * maze's flow, the magnet's pull and the flow that carries it with the
 * water) steps aside by the same window the film's mobility is weighted
 * by, so one physics acts there and not two (fluid.ts, STAND_ASIDE). Only
 * the relax stays, its ceiling raised to the top glass (FILM_TOP).
 *
 * The time step is semi-implicit, the lab's: the flux explicit, then the
 * whole change smoothed by 1 / (1 + dt A k⁴), the stiff part of the tension
 * taken implicitly, which is what lets a step be a quarter of a time unit
 * instead of the thousandth an explicit fourth-order flow would need. A is
 * the patch's greatest mobility, as large as the stiff part is: at 1 (the
 * mobility's cap) a pool 0.3 l_c deep, mobility 0.027, rose four times
 * slower than it should, because the smoothing slowed every mode at a
 * dome's scale (k² ≈ 3) along with the stiff ones. Δh comes out
 * of an FFT of a conservative divergence, so its mean is zero and the
 * volume is kept to the float's rounding.
 *
 * Shortcuts, each a PLAN item (§9t):
 *  - S(h) for the magnetisation's saturation on a tall peak; the
 *    small-slope surface energy; no finite-depth factor on the lift; the
 *    water's top taken as flat.
 *  - Π with (9, 3) exponents: the usual (3, 2) reaches far enough that a
 *    layer seven precursors deep dewets with no field at all, which a
 *    half-millimetre layer does not.
 *  - The mobility capped at a thickness of l_c, 3.3 times a full cell (a
 *    dome taller than l_c moves no faster than one that tall), so the
 *    stabiliser's bound (A, at most 1) holds.
 *  - The derivatives are differences on the plate's own cells, and |k| the
 *    difference operator's (√ of the Laplacian's symbol): with the exact
 *    |k| against a difference tension, grid-scale ripples were unstable
 *    past G 3 and the domes set as stripes along the grid. The Laplacian
 *    and the flux are the isotropic 9-point ones (the diagonals at a
 *    quarter of the axes' weight), whose error at a dome's scale does not
 *    depend on direction to second order, where the 5-point one's does.
 *  - Each patch steps its own magnet's field; where two fingers' patches
 *    overlap, each acts on the layer in turn.
 */
import { SPIKE_PITCH } from './spikes';

/*
  How deep a full cell's layer is, in l_c (standing.ts has why 0.3); the
  plate draws a dome's slope from it (plate.ts).
*/
export const FILM_H0 = 0.3;
/*
  The plate's ferrofluid packed for the picture (packView) as a share of
  this, so a dome past full reaches the plate: a cell is 16 bits from 0 to
  8, a step of 0.00012, where it was 0 to 1. The lab's tallest domes are
  about 1.6 l_c, 5.2 times full.
*/
export const PHASE_VIEW_TOP = 8;
/*
  The most a cell can hold under the film, as a share of full: the layer
  reaching the top glass. The plate is two glasses 0.03 of its width apart
  (fluid.ts, REST_GAP: 6 mm on the 0.2 m plate), 4.7 l_c, so a column of
  ferrofluid can stand 15.6 times a full cell's depth before it touches the
  glass above. phaseRelax caps the plate's cells at this under the film,
  where it caps them at full everywhere else. The cap is not what shapes a
  dome (the lab's tallest are a third of it); it is what keeps the plate's
  own flow, which carries the layer with the water and is only as
  incompressible as its projection makes it, from piling the layer without
  end where it converges, across the window's edge where the flow and the
  film both act in part. Before the cap, with the flow still acting in the
  window, a pool under the Magnet rose past 100 times full in 30 steps and
  the plate went to NaN; it is also what refills a cell the flow's limiter
  takes below empty there, as it does everywhere else.
*/
export const FILM_TOP = (0.03 / (SPIKE_PITCH / (2 * Math.PI)) - 0.03) / FILM_H0;

/*
  The noise every real layer has, as a pressure on it, in the film's units
  (Δρ g l_c, a height of l_c): a hundredth, the pressure of 13 µm of
  ferrofluid, which a bench's vibration and the water's convection give a
  real layer many times over (its thermal ripples alone are a few
  nanometres). The instability grows from whatever perturbs the layer, and
  the lab seeded it the same way (a 0.1% whisper of noise on each start).
  Without it the film had nothing to grow from but the grid: a patch
  centred on the magnet, a pool poured round it and a field symmetric about
  it leave the square lattice as the only thing not round, and the domes
  set as a cross of bars along its axes round a square in the middle, at
  every time step tried. Drawn afresh each step (held through its
  substeps) from a hash of the cell and a count of the film's steps, so a
  run is the same every time
  (the seeded runs, `npm run seed`, stay byte for byte).
*/
const NOISE = 0.01;

/** The film's numbers, one buffer per magnet. */
const FILM = /* wgsl */ `
struct Film {
  mag: vec4f,    // the magnet: x, y, height, strength
  at: vec4f,     // the patch's first plate cell (x, y), its size P, log2 P
  grid: vec4f,   // the plate's grid N, l_c a cell, the film's time a substep, H0
  film: vec4f,   // EPS, the wetting's κ, hs, the magnetisation's Langevin scale
  win: vec4f,    // the window: full inside win.x cells of the patch's middle, none past win.y; the pull's scale (z); the step's count, for the noise (w)
};
@group(0) @binding(0) var<uniform> F: Film;
`;

/*
  The field's lift, G, at plate point p: 2 at spikes.ts's onset, rising with
  the field the way a ferrofluid's magnetisation does, as Langevin's
  coth ξ − 1/ξ, squared because the stress goes as M². The scale (film.w)
  is the field at which the liquid is a third saturated, as a share of the
  hand's magnet at the glass: 0.035, so at the onset (0.18) it is already
  0.81 of the way and under the Magnet tool (0.8) 0.96, and G there is 2.8.

  A shortcut, and the one that sets how the domes look (PLAN 9t). A real
  layer under the hand's magnet is at a G of hundreds, and its pattern far
  finer than the onset's; the plate cannot draw that. Past the onset the
  wavelength that grows fastest here is 2π / k with 4k² − 3Gk + 2 = 0: at
  G 2.8, 3.4 l_c, eight cells on 384². At the lab's 0.07 (G 4.3) it was
  2 l_c, five cells, and the layer first broke up at the grid's own scale
  and set as bars along its axes round a square over the magnet, whatever
  the time step; at 0.25 (G 18), finer still. Held near the onset, the
  domes grow at a scale the grid draws round, and stand a capillary
  wavelength apart as at the onset.
*/
const LIFT = /* wgsl */ `
fn langevin(x: f32) -> f32 {
  if (x < 1e-3) { return x / 3.0; }
  return 1.0 / tanh(min(x, 20.0)) - 1.0 / x;
}
fn lift(p: vec2f) -> f32 {
  let b = spikeField(p, F.mag);
  let s = F.film.w;
  let r = langevin(b / s) / langevin(SPIKE_ONSET / s);
  return 2.0 * r * r;
}
// The magnet's pull, as a pressure: see filmPressure.
fn kelvin(p: vec2f) -> f32 {
  let x = spikeField(p, F.mag) / F.film.w;
  if (x < 0.01) { return x * x / 6.0; }
  return x + log((1.0 - exp(-2.0 * x)) / (2.0 * x));
}
fn cellOf(i: vec2i) -> vec2i { return vec2i(F.at.xy) + i; }
fn uvOfCell(q: vec2i) -> vec2f { return (vec2f(q) + 0.5) / F.grid.x; }
fn onPlate(q: vec2i) -> bool { let n = i32(F.grid.x); return q.x >= 0 && q.y >= 0 && q.x < n && q.y < n; }
// How much the film acts here: 1 within win.x cells of the patch's middle, 0
// past win.y, smooth between, and 0 off the plate (nothing flows there).
fn window(i: vec2i) -> f32 {
  if (!onPlate(cellOf(i))) { return 0.0; }
  let r = length(vec2f(i) + 0.5 - 0.5 * F.at.z);
  return 1.0 - smoothstep(F.win.x, F.win.y, r);
}
fn wrap(i: vec2i) -> vec2i { let P = i32(F.at.z); return (i + vec2i(P)) % vec2i(P); }
fn at(i: vec2i) -> u32 { let j = wrap(i); return u32(j.y) * u32(F.at.z) + u32(j.x); }
fn inPatch(id: vec3u) -> bool { return id.x < u32(F.at.z) && id.y < u32(F.at.z); }
// The layer's mobility, h³ capped at a thickness of l_c, weighted by the window.
fn mobility(i: vec2i, h: f32) -> f32 { let c = clamp(h, 0.0, 1.0); return window(i) * c * c * c; }
fn sat(h: f32) -> f32 { return F.film.z * tanh(h / F.film.z); }
fn satSlope(h: f32) -> f32 { let c = cosh(min(h / F.film.z, 20.0)); return 1.0 / (c * c); }
`;

/** The kernels. Every one binds the Film at 0. */
export function standingKernels(spikes: string): Record<string, string> {
  const HEAD = `${FILM}${spikes}${LIFT}`;
  const W8 = '@compute @workgroup_size(8, 8)';
  return {
    /*
      The plate's cells into the layer's thickness, and the lift's input for
      the first substep. Off the plate, dry glass.
    */
    filmGather: `${HEAD}
@group(0) @binding(1) var phase: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> h: array<f32>;
@group(0) @binding(3) var<storage, read_write> z: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> sh: array<vec4f>;
${W8} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inPatch(id)) { return; }
  let i = vec2i(id.xy);
  let q = cellOf(i);
  var c = 0.0;
  if (onPlate(q)) { c = textureLoad(phase, q, 0).r; }
  let hh = F.grid.w * c + F.film.x;
  h[at(i)] = hh;
  // Its mobility, for the first substep's stabiliser (filmSum, filmFft).
  sh[at(i)] = vec4f(0.0, 0.0, mobility(i, hh), 0.0);
  z[at(i)] = vec2f(sqrt(lift(uvOfCell(q))) * sat(hh), 0.0);
}`,

    /*
      One line of the patch through a radix-2 FFT, in workgroup memory: rows
      or columns (T.x), forward or back (T.y, the sign of the exponent; back
      divides by P), and after a forward pass over the columns, the spectrum
      multiplied by what the step asks (T.z): 1, |k|, for the lift; 2,
      1 / (1 + dt A k⁴), the stabiliser, A the patch's greatest mobility
      (filmSum's tot.z). k is the 9-point Laplacian's that
      filmPressure and filmFlux use: k² dx² = (20 − 8 cos θx − 8 cos θy −
      4 cos θx cos θy) / 6, θ = 2π f / P.
    */
    filmFft: `${HEAD}
struct Fft { t: vec4f };
@group(0) @binding(1) var<uniform> T: Fft;
@group(0) @binding(2) var<storage, read_write> z: array<vec2f>;
@group(0) @binding(3) var<storage, read> tot: array<vec4f>;
var<workgroup> line: array<vec2f, 256>;
fn idx(l: u32, i: u32) -> u32 {
  if (T.t.x < 0.5) { return l * u32(F.at.z) + i; }
  return i * u32(F.at.z) + l;
}
fn k2(fx: u32, fy: u32) -> f32 {
  let P = F.at.z;
  let cx = cos(6.28318531 * f32(fx) / P);
  let cy = cos(6.28318531 * f32(fy) / P);
  return (20.0 - 8.0 * cx - 8.0 * cy - 4.0 * cx * cy) / (6.0 * F.grid.y * F.grid.y);
}
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) t: u32) {
  let P = u32(F.at.z);
  let logP = u32(F.at.w);
  let l = wg.x;
  for (var i = t; i < P; i += 64u) {
    line[reverseBits(i) >> (32u - logP)] = z[idx(l, i)];
  }
  workgroupBarrier();
  for (var s = 1u; s <= logP; s++) {
    let m = 1u << s;
    let half = m >> 1u;
    for (var b = t; b < P / 2u; b += 64u) {
      let k = b % half;
      let i0 = (b / half) * m + k;
      let i1 = i0 + half;
      let a = T.t.y * 6.28318531 * f32(k) / f32(m);
      let w = vec2f(cos(a), sin(a));
      let v = line[i1];
      let wv = vec2f(w.x * v.x - w.y * v.y, w.x * v.y + w.y * v.x);
      let u = line[i0];
      line[i0] = u + wv;
      line[i1] = u - wv;
    }
    workgroupBarrier();
  }
  let scale = select(1.0, 1.0 / f32(P), T.t.y > 0.0);
  for (var i = t; i < P; i += 64u) {
    var v = line[i] * scale;
    if (T.t.z > 0.5) {
      let kk = k2(l, i);
      if (T.t.z < 1.5) { v *= sqrt(kk); } else { v /= 1.0 + F.grid.z * tot[0].z * kk * kk; }
    }
    z[idx(l, i)] = v;
  }
}`,

    /*
      The layer's pressure: tension, gravity, the lift (z.x: |k| of √G S, from
      the FFT), the wetting, and the magnet's pull.

      The pull is the Kelvin force, μ0 M ∇H, on a liquid whose magnetisation
      follows Langevin's curve: a pressure of μ0 ∫ M dH, which is μ0 Ms Hβ
      ln(sinh ξ / ξ) at ξ = H / Hβ, the same ξ the lift is on. In the film's
      units (Δρ g l_c) its scale is the lift's: μ0 Ms² / (Δρ g l_c) is the
      G that full saturation would give, times (1 + 1/μr), and Hβ / Ms is
      1 / (3 χ0), from the curve's slope at nought (standing.ts, CHI0). So
      no new number is chosen here but the liquid's susceptibility.

      Left to the plate's flow (phaseForce, then the advection), the pull
      had nothing in the film to push back against: the pool piled round
      the magnet and set as worms with stepped edges. In the film it meets
      the layer's own weight and tension. For now it is scaled to nothing
      (standing.ts, PULL_SHARE, which has why): on the plate's grid the
      front it drives across the glass sets the domes along the grid.
    */
    filmPressure: `${HEAD}
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
// The noise every real layer has: see NOISE, below. Uniform in ±½, a
// different draw each cell and step, the same on every run.
fn noise(q: vec2i) -> f32 {
  let k = pcg(u32(q.x) ^ pcg(u32(q.y) ^ pcg(u32(F.win.w))));
  return f32(k >> 8u) * (1.0 / 16777216.0) - 0.5;
}
@group(0) @binding(1) var<storage, read> h: array<f32>;
@group(0) @binding(2) var<storage, read> z: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> pr: array<f32>;
${W8} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inPatch(id)) { return; }
  let i = vec2i(id.xy);
  let hh = h[at(i)];
  let dx2 = F.grid.y * F.grid.y;
  let lap = (4.0 * (h[at(i + vec2i(1, 0))] + h[at(i - vec2i(1, 0))] + h[at(i + vec2i(0, 1))] + h[at(i - vec2i(0, 1))])
           + h[at(i + vec2i(1, 1))] + h[at(i - vec2i(1, 1))] + h[at(i + vec2i(1, -1))] + h[at(i - vec2i(1, -1))] - 20.0 * hh) / (6.0 * dx2);
  let r = min(F.film.x / max(hh, 1e-6), 1.25);
  let r3 = r * r * r;
  let wet = F.film.y * (r3 * r3 * r3 - r3);
  let mag = sqrt(lift(uvOfCell(cellOf(i)))) * satSlope(hh) * z[at(i)].x;
  pr[at(i)] = -lap + hh - mag - wet - F.win.z * kelvin(uvOfCell(cellOf(i))) + ${NOISE} * noise(cellOf(i));
}`,

    /*
      The flux's divergence, ∇·(M ∇p), face by face so it sums to nothing,
      times the substep: what the stabiliser is then applied to.
    */
    filmFlux: `${HEAD}
@group(0) @binding(1) var<storage, read> h: array<f32>;
@group(0) @binding(2) var<storage, read> pr: array<f32>;
@group(0) @binding(3) var<storage, read_write> z: array<vec2f>;
fn mob(i: vec2i) -> f32 { return mobility(i, h[at(i)]); }
fn face(i: vec2i, e: vec2i) -> f32 {
  return 0.5 * (mob(i) + mob(i + e)) * (pr[at(i + e)] - pr[at(i)]);
}
${W8} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inPatch(id)) { return; }
  let i = vec2i(id.xy);
  let d = (4.0 * (face(i, vec2i(1, 0)) + face(i, vec2i(-1, 0)) + face(i, vec2i(0, 1)) + face(i, vec2i(0, -1)))
         + face(i, vec2i(1, 1)) + face(i, vec2i(-1, -1)) + face(i, vec2i(1, -1)) + face(i, vec2i(-1, 1))) / 6.0;
  z[at(i)] = vec2f(F.grid.z * d / (F.grid.y * F.grid.y), 0.0);
}`,

    /*
      The change taken, and no cell left thinner than the dry glass's
      precursor film (EPS).

      The stabiliser smooths each substep's change over the patch, and a
      smoothed change reaches past where the layer moved: a dome rising
      draws on the valley beside it, and the smoothing spreads that loss
      over the dry glass round it, where the layer's mobility is nothing and
      nothing flows back. Measured, the valleys within 0.12 of the Magnet
      sat at up to half a full cell's depth below nothing (55 cells' worth
      of ferrofluid below empty over the plate), which the plate drew as a
      brown haze over the colour. Borrowing a short cell's shortfall from
      its neighbours made it worse (846): the valleys' middles have no
      neighbour to lend, and the loan fed the domes' edges for the next
      substep to dig deeper. So the error is put back where the smoothing
      took it from, the whole layer: each cell is held at EPS (filmApply),
      the total so made is summed over the patch (filmSum), and taken back
      from every cell in proportion to what it holds above EPS (filmTake).
      Nothing made or lost, and no cell below the precursor. The same sum
      also finds the patch's greatest mobility, for the next substep's
      stabiliser (filmFft).
    */
    filmApply: `${HEAD}
@group(0) @binding(1) var<storage, read_write> h: array<f32>;
@group(0) @binding(2) var<storage, read> z: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> sh: array<vec4f>;
${W8} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inPatch(id)) { return; }
  let i = vec2i(id.xy);
  let hn = h[at(i)] + z[at(i)].x;
  /*
    Off the plate (a patch hanging over its edge, a finger near it) a cell
    holds the precursor and nothing more: the stabiliser's smoothing spreads
    a change a little everywhere, off-plate cells included, and what went
    there filmScatter never wrote back, a little lost each substep. Held
    at EPS, whatever it gained or lost is counted with the clip's and given
    back on the plate (filmTake).
  */
  let hh = select(F.film.x, max(hn, F.film.x), onPlate(cellOf(i)));
  h[at(i)] = hh;
  // What holding it at EPS made, and what it has above EPS to give back.
  sh[at(i)] = vec4f(hh - hn, select(0.0, hh - F.film.x, window(i) > 0.0), mobility(i, hh), 0.0);
}`,
    filmSum: `${HEAD}
@group(0) @binding(1) var<storage, read> sh: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> tot: array<vec4f>;
var<workgroup> part: array<vec4f, 256>;
// Sums of the first two, the greatest of the third.
fn join(a: vec4f, b: vec4f) -> vec4f { return vec4f(a.xy + b.xy, max(a.z, b.z), 0.0); }
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) t: u32) {
  let n = u32(F.at.z) * u32(F.at.z);
  var a = vec4f(0.0);
  for (var k = t; k < n; k += 256u) { a = join(a, sh[k]); }
  part[t] = a;
  workgroupBarrier();
  for (var w = 128u; w > 0u; w >>= 1u) {
    if (t < w) { part[t] = join(part[t], part[t + w]); }
    workgroupBarrier();
  }
  if (t == 0u) { tot[0] = part[0]; }
}`,
    filmTake: `${HEAD}
@group(0) @binding(1) var<storage, read_write> h: array<f32>;
@group(0) @binding(2) var<storage, read> sh: array<vec4f>;
@group(0) @binding(3) var<storage, read> tot: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> z: array<vec2f>;
${W8} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inPatch(id)) { return; }
  let i = vec2i(id.xy);
  let t = tot[0];
  var hh = h[at(i)];
  if (t.y > 0.0) { hh -= min(t.x / t.y, 1.0) * sh[at(i)].y; }
  h[at(i)] = hh;
  z[at(i)] = vec2f(sqrt(lift(uvOfCell(cellOf(i)))) * sat(hh), 0.0);
}`,

    /*
      The layer back into the plate's cells, over the whole plate: the patch's
      cells as their thickness says, every other cell as it was.
    */
    filmScatter: `${HEAD}
@group(0) @binding(1) var phase: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> h: array<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
${W8} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = u32(F.grid.x);
  if (id.x >= n || id.y >= n) { return; }
  let q = vec2i(id.xy);
  let i = q - vec2i(F.at.xy);
  var c = textureLoad(phase, q, 0).r;
  let P = i32(F.at.z);
  if (i.x >= 0 && i.y >= 0 && i.x < P && i.y < P) { c = (h[at(i)] - F.film.x) / F.grid.w; }
  textureStore(dst, q, vec4f(c, 0.0, 0.0, 0.0));
}`,
  };
}

/** The window over the whole plate, for the plate's own passes to step aside by. */
export const STAND_WINDOW = /* wgsl */ `
struct Wins { m: array<vec4f, 4>, n: vec4f };
@group(0) @binding(0) var<uniform> Wn: Wins;
@group(0) @binding(1) var dst: texture_storage_2d<r32float, write>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = u32(Wn.n.x);
  if (id.x >= n || id.y >= n) { return; }
  // Each patch's middle (x, y, in cells), and how many there are (n.y); the
  // window's radii in cells (n.z, n.w), the film's own (window()).
  var w = 0.0;
  for (var k = 0; k < 4; k++) {
    if (f32(k) >= Wn.n.y) { break; }
    let r = length(vec2f(id.xy) + 0.5 - Wn.m[k].xy);
    w = max(w, 1.0 - smoothstep(Wn.n.z, Wn.n.w, r));
  }
  textureStore(dst, vec2i(id.xy), vec4f(w, 0.0, 0.0, 0.0));
}`;
