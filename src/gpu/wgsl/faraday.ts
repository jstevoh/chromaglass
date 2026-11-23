/**
 * Faraday waves' step (PLAN 48f): the standing wave a shaken liquid layer
 * grows, as compute passes. The physics and its numbers are in
 * src/lib/faraday.ts; how the step is driven, in src/gpu/faraday.ts.
 *
 * What is stepped. Not the surface itself, which rings at half the drive's
 * frequency (5 to 75 Hz, faster than a frame), but its standing wave's
 * amplitude u(x, y): the surface is η = u cos(Ωt/2), and u is what grows,
 * saturates and decays over the seconds a note lasts. That is the
 * amplitude equation of parametric resonance (the Mathieu equation averaged
 * over a drive cycle, Kumar and Tuckerman 1994; Zhang and Viñals 1997), and
 * it is exact in its linear part:
 *
 *   ∂u/∂t = L(k) u + N(u),
 *
 * L(k) the first Mathieu tongue's Floquet growth rate (src/lib/faraday.ts,
 * faradayGrowth, written again here as `growth`): above the threshold a
 * ring of wavenumbers round the dispersion relation's ω(k) = Ω/2 grows, and
 * every other wave rings down at its own damping. So the pattern's scale and
 * whether it is there at all are the liquid's, not a number chosen here.
 *
 * L is applied exactly, in Fourier space, mode by mode (exponential time
 * differencing, ETD1: û ← e^{L dt} û + (e^{L dt} − 1)/L · N̂), which is why
 * a frame's step is two substeps and not the hundreds the surface's own
 * ringing would need. Fourier space needs the FFT: one radix-2 line in
 * workgroup memory, as wgsl/standing.ts's film does, rows then columns.
 *
 * N(u), the cubic that stops the growth. A growing wave leaves the tongue
 * because its own frequency shifts with its height, and two shifts are
 * real. A ripple's restoring force is the surface's curvature, whose exact
 * form σ ∇·(∇η / √(1 + |∇η|²)) has the cubic −(σ/2) ∇·(|∇η|² ∇η); a
 * gravity wave's is its own weight, which has no such term, and saturates
 * by its height alone, as u³. Projected on two waves at an angle θ the
 * first gives a self coupling of 3 and a cross coupling of 2 + 4 cos²θ,
 * so two waves at right angles hold each other up (2 < 3): squares, which
 * is what capillary Faraday waves make in the experiments (Kudrolli and
 * Gollub 1996). The second couples every pair at 6 against 3: stripes, as
 * gravity waves in a viscous layer make. The step weighs the two by the
 * capillary share of the restoring force at the pattern's wavenumber
 * (faradayCapillaryShare), and scales both so a drive twice the threshold
 * saturates at a steepness k u of about 0.5 S0·√(4(ε − ε_c)/3): the
 * amplitude a real pattern reaches is of that size (kη 0.1 to 0.5) before it
 * breaks into droplets. The coefficient is a shortcut, set to the measured
 * size and not derived (PLAN 48f-2 is Zhang and Viñals' coefficients).
 *
 * And the dish's own disturbances: a whisper of white noise, 0.1 µm a
 * square-root second, which is what the pattern grows from. Below the
 * threshold it is all there is, and it is a hundred thousand times too
 * faint to see (the check measures both).
 *
 * The grid is periodic: the plate's square, wrapped. A real dish's wall pins
 * the pattern and launches its own ripples (PLAN 48f-3).
 */

/** The grid, cells across: a power of two for the FFT, and the workgroup line's length. */
export const FARADAY_N = 256;

/*
  The uniforms every kernel binds first:
    grid:  N, the plate's side in metres, the substep's dt, log2 N
    drive: the acceleration (m/s²), the drive's frequency (Hz), the depth (m), ν (m²/s)
    layer: g, σ/ρ, the cubic's scale g3 (1/(s m²)), the capillary share
    more:  the pattern's k_c (1/m), the noise (m/√s), the step's seed, 0
*/
const FP = /* wgsl */ `
struct FP { grid: vec4f, drive: vec4f, layer: vec4f, more: vec4f };
@group(0) @binding(0) var<uniform> F: FP;
fn nOf() -> u32 { return u32(F.grid.x); }
`;

export const FARADAY_KERNELS = {
  /*
    One line of the field through a radix-2 FFT in workgroup memory: rows or
    columns (T.x), forward or back (T.y, the exponent's sign; back divides by
    N, so a forward and a back pass over both axes is the identity).
  */
  faradayFft: /* wgsl */ `${FP}
@group(0) @binding(1) var<uniform> T: vec4f;
@group(0) @binding(2) var<storage, read_write> z: array<vec2f>;
var<workgroup> line: array<vec2f, ${FARADAY_N}>;
fn idx(l: u32, i: u32, n: u32) -> u32 {
  if (T.x < 0.5) { return l * n + i; }
  return i * n + l;
}
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) t: u32) {
  let n = nOf();
  let logN = u32(F.grid.w);
  let l = wg.x;
  for (var i = t; i < n; i += 64u) {
    line[reverseBits(i) >> (32u - logN)] = z[idx(l, i, n)];
  }
  workgroupBarrier();
  for (var s = 1u; s <= logN; s++) {
    let m = 1u << s;
    let half = m >> 1u;
    for (var b = t; b < n / 2u; b += 64u) {
      let k = b % half;
      let i0 = (b / half) * m + k;
      let i1 = i0 + half;
      let a = T.y * 6.28318531 * f32(k) / f32(m);
      let w = vec2f(cos(a), sin(a));
      let v = line[i1];
      let wv = vec2f(w.x * v.x - w.y * v.y, w.x * v.y + w.y * v.x);
      let u = line[i0];
      line[i0] = u + wv;
      line[i1] = u - wv;
    }
    workgroupBarrier();
  }
  let scale = select(1.0, 1.0 / f32(n), T.y > 0.0);
  for (var i = t; i < n; i += 64u) {
    z[idx(l, i, n)] = line[i] * scale;
  }
}`,

  /*
    The amplitude in real space, after the back transform: the height the
    plate draws and the cubic reads. And the cubic's stiffness gauge (the
    largest u² and |∇u|² on the grid, which faradayCubic gathers and
    faradayAdvance reads) set back to nought for this substep.
  */
  faradayHeight: /* wgsl */ `${FP}
@group(0) @binding(1) var<storage, read> z: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> h: array<f32>;
@group(0) @binding(3) var<storage, read_write> stiff: array<atomic<u32>, 4>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = nOf();
  if (id.x == 0u) { atomicStore(&stiff[0], 0u); atomicStore(&stiff[1], 0u); }
  if (id.x >= n * n) { return; }
  h[id.x] = z[id.x].x;
}`,

  /*
    N(u) and the dish's noise, in real space, into z for the forward
    transform. The curvature's cubic ∇·(|∇u|² ∇u) as the divergence of a
    flux on the cell's four faces, all from the 3×3 round it. In that form
    and only in it the sum of u times it over the grid is minus the sum of
    |∇u|² (∂u)² over the faces, never positive, as the continuous one is:
    the cubic only ever takes energy out. The first version expanded it,
    |∇u|² ∇²u + 2 ∇u·(H ∇u) with central differences, which is the same
    in the limit and not on the grid: a 150 Hz lattice at 2 g held at a
    steepness of 0.3 for two seconds and then blew up between two reads, at
    a quarter of the substep as at the whole one (2026-11-21), the
    expansion's grid-scale terms feeding energy in.

    And how stiff it is: the largest u² and the largest |∇u|² on any face,
    gathered for the step's stabiliser (faradayAdvance). Floats that are not
    negative order as their bits do, so an atomic max of the bits is the max.
  */
  faradayCubic: /* wgsl */ `${FP}
@group(0) @binding(1) var<storage, read> h: array<f32>;
@group(0) @binding(2) var<storage, read_write> z: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> stiff: array<atomic<u32>, 4>;
var<workgroup> wu: atomic<u32>;
var<workgroup> ws: atomic<u32>;
fn at(x: i32, y: i32, n: i32) -> f32 {
  return h[u32(((y % n) + n) % n) * u32(n) + u32(((x % n) + n) % n)];
}
fn hash(a: u32) -> f32 {
  var x = a * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return f32(x) / 4294967295.0;
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) t: u32) {
  let n = i32(nOf());
  if (t == 0u) { atomicStore(&wu, 0u); atomicStore(&ws, 0u); }
  workgroupBarrier();
  if (id.x < u32(n) && id.y < u32(n)) { cell(id, n); }
  workgroupBarrier();
  if (t == 0u) { atomicMax(&stiff[0], atomicLoad(&wu)); atomicMax(&stiff[1], atomicLoad(&ws)); }
}
fn cell(id: vec3u, n: i32) {
  let x = i32(id.x);
  let y = i32(id.y);
  let dx = F.grid.y / f32(n);
  let c = at(x, y, n);
  // The 3×3 round the cell, named by compass: n is y − 1.
  let nw = at(x - 1, y - 1, n); let no = at(x, y - 1, n); let ne = at(x + 1, y - 1, n);
  let w = at(x - 1, y, n); let e = at(x + 1, y, n);
  let sw = at(x - 1, y + 1, n); let so = at(x, y + 1, n); let se = at(x + 1, y + 1, n);
  // The flux |∇u|² ∇u on each face: the normal slope across it, the tangential one averaged along it.
  let q = 1.0 / dx;
  let exN = (e - c) * q; let exT = (se - ne + so - no) * 0.25 * q;
  let wxN = (c - w) * q; let wxT = (so - no + sw - nw) * 0.25 * q;
  let syN = (so - c) * q; let syT = (se - sw + e - w) * 0.25 * q;
  let nyN = (c - no) * q; let nyT = (ne - nw + e - w) * 0.25 * q;
  let fe = (exN * exN + exT * exT) * exN;
  let fw = (wxN * wxN + wxT * wxT) * wxN;
  let fs = (syN * syN + syT * syT) * syN;
  let fq = (nyN * nyN + nyT * nyT) * nyN;
  let slope2 = max(max(exN * exN + exT * exT, wxN * wxN + wxT * wxT), max(syN * syN + syT * syT, nyN * nyN + nyT * nyT));
  atomicMax(&wu, bitcast<u32>(min(c * c, 1e30)));
  atomicMax(&ws, bitcast<u32>(min(slope2, 1e30)));
  let curv = (fe - fw + fs - fq) * q;
  let kc = F.more.x;
  let beta = F.layer.w;
  let cubic = -F.layer.z * ((1.0 - beta) * c * c * c - beta * curv / (kc * kc * kc * kc));
  // White noise of F.more.y m/√s: a variance of noise² dt a substep, so N carries noise / √dt.
  let i = u32(y * n + x);
  let xi = (hash(i ^ (u32(F.more.z) * 2654435761u)) * 2.0 - 1.0) * 1.7320508;
  z[i] = vec2f(cubic + F.more.y * xi / sqrt(F.grid.z), 0.0);
}`,

  /*
    The step in Fourier space, mode by mode: û ← e^{L dt} û + φ(L dt) dt N̂,
    and the result left in z for the next back transform. The mean height is
    the layer's volume, held (k = 0 is not a wave), and the modes past two
    thirds of the grid's Nyquist are dropped: the cubic's harmonics there
    would fold back onto the pattern (the two-thirds rule).

    The cubic is stepped explicitly, and its curvature part is a diffusion
    (of |∇u|² ∇u), which an explicit step holds only while its coefficient
    times k² times dt is under two. At the grid's finest waves that is not
    so once the pattern is steep: a 10 Hz pattern at 2 g, whose cells are
    fourteen times the finest wave the grid keeps, grew to a slope of 0.3
    and then blew up in a quarter of a second, the grid's finest waves
    growing by thousands a step (2026-11-21). So the stiffest the cubic can
    be at this k, λ(k) = 3 g3 ((1 − β) u²max + β |∇u|²max k² / k_c⁴) from the
    gauge faradayCubic gathered, is taken out of the explicit part and put
    into the exact one: L − λ in the exponential, + λ û beside N̂. For a
    field as stiff everywhere as its stiffest point that is exact, and for
    any other it damps a mode by at most what the cubic would, so the step
    holds at any dt; while the pattern is small, λ is nought and the step is
    the plain one the growth and decay lines measure.
  */
  faradayAdvance: /* wgsl */ `${FP}
@group(0) @binding(1) var<storage, read_write> z: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> spec: array<vec2f>;
@group(0) @binding(3) var<storage, read> stiff: array<u32, 4>;
fn omegaOf(k: f32) -> f32 {
  return sqrt((F.layer.x * k + F.layer.y * k * k * k) * tanh(k * F.drive.z));
}
fn growth(k: f32) -> f32 {
  let w = omegaOf(k);
  let damp = 2.0 * F.drive.w * k * k + k * sqrt(F.drive.w * w * 0.5) / sinh(min(80.0, 2.0 * k * F.drive.z));
  let eps = F.drive.x * k * tanh(k * F.drive.z) / max(w * w, 1e-12);
  let pump = eps * w * 0.25;
  let detune = w - 3.14159265 * F.drive.y;
  let r = pump * pump - detune * detune;
  return select(0.0, sqrt(max(r, 0.0)), r > 0.0) - damp;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = nOf();
  if (id.x >= n * n) { return; }
  let fx = id.x % n;
  let fy = id.x / n;
  let sx = select(i32(fx), i32(fx) - i32(n), fx >= n / 2u);
  let sy = select(i32(fy), i32(fy) - i32(n), fy >= n / 2u);
  let cut = i32(n) / 3;
  if ((sx == 0 && sy == 0) || abs(sx) > cut || abs(sy) > cut) {
    spec[id.x] = vec2f(0.0);
    z[id.x] = vec2f(0.0);
    return;
  }
  // The pair this thread steps: k and −k, whose amplitudes are each other's conjugates in a real field.
  let j = ((n - fx) % n) + ((n - fy) % n) * n;
  if (j < id.x) { return; }
  let dk = 6.28318531 / F.grid.y;
  let k = dk * sqrt(f32(sx * sx + sy * sy));
  let dt = F.grid.z;
  let kc = F.more.x;
  let beta = F.layer.w;
  let k2 = (k * k) / (kc * kc);
  let lam0 = 3.0 * F.layer.z * ((1.0 - beta) * bitcast<f32>(stiff[0]) + beta * bitcast<f32>(stiff[1]) * k2 / (kc * kc));
  let lam = select(0.0, min(lam0, 1e9), lam0 > 0.0);
  let L = growth(k) - lam;
  let E = exp(L * dt);
  let phi = select((E - 1.0) / L, dt, abs(L * dt) < 1e-4);
  let a = E * spec[id.x] + phi * (z[id.x] + lam * spec[id.x]);
  let b = E * spec[j] + phi * (z[j] + lam * spec[j]);
  /*
    Held to a real field: the amplitude at k is the conjugate of the one at
    −k. The cubic only ever sees the real part of the back transform, so a
    part of the spectrum that is not so (the FFT's rounding leaves one, a
    ten-millionth of the wave) is a field the cubic never saturates, and it
    grows at the linear rate for ever: a 150 Hz lattice at 2 g held at its
    saturated height for two seconds, while that hidden part grew at 8 per
    second under it, until its rounding into the real part blew the plate up
    (2026-11-21). Averaging the pair each step keeps it at nought.
  */
  var s = 0.5 * (a + vec2f(b.x, -b.y));
  if (j == id.x) { s = vec2f(s.x, 0.0); }
  // A mode gone past any height a wave can have is a step that failed, not a wave: held to still water rather than left to blacken the plate.
  if (!(abs(s.x) < 1e6 && abs(s.y) < 1e6)) { s = vec2f(0.0); }
  spec[id.x] = s;
  z[id.x] = s;
  spec[j] = vec2f(s.x, -s.y);
  z[j] = vec2f(s.x, -s.y);
}`,
} as const;

export type FaradayKernel = keyof typeof FARADAY_KERNELS;
