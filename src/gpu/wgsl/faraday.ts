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

import { OPEN_RIM } from '../../lib/turntable';

/** The grid, cells across: a power of two for the FFT, and the workgroup line's length. */
export const FARADAY_N = 256;

/*
  The uniforms every kernel binds first:
    grid:  N, the plate's side in metres, the substep's dt, log2 N
    drive: the acceleration (m/s²), the drive's frequency (Hz), the depth (m), ν (m²/s)
    layer: g, σ/ρ, Zhang–Viñals cubic scale g3 (1/(s m²)), capillary share β
    more:  k_c (1/m), noise (m/√s), step seed, coupled flag (1 when fluid solver carries zu)
    flow:  m/s per plate velocity unit (0 standalone), VKM Γ (m²/s²), VKM r (1/s), strobe cos φ
    wall:  meniscus k_Ω (1/m), meniscus amp (m), meniscus decay 1/ℓ_d (1/m), α_NL (1/(s m²))
    tri:   progressive streaming share μ_p, rim wall damping (1/s), strobe sin φ, triScale
*/
const FP = /* wgsl */ `
struct FP {
  grid: vec4f, drive: vec4f, layer: vec4f, more: vec4f,
  flow: vec4f, wall: vec4f, tri: vec4f,
};
@group(0) @binding(0) var<uniform> F: FP;
fn nOf() -> u32 { return u32(F.grid.x); }
fn rimRadius(x: i32, y: i32, n: f32) -> f32 {
  return length((vec2f(f32(x), f32(y)) + 0.5) / n - 0.5);
}
fn inRim(r: f32) -> bool { return r < ${OPEN_RIM.toFixed(4)}; }
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
    The amplitude in real space after the back transform: stores complex
    Z = u + i v inside the circular dish rim OPEN_RIM, `h = u`, `zq = Z²` for
    the three-wave 2ω resonance, and the strobe surface `eta` combining the
    subharmonic wave with the harmonic meniscus ripples launched inward from
    the rim at Ω. Resets the stiffness gauge `stiff[0..2]` for this substep.
  */
  faradayHeight: /* wgsl */ `${FP}
@group(0) @binding(1) var<storage, read> z: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> h: array<f32>;
@group(0) @binding(3) var<storage, read_write> stiff: array<atomic<u32>, 4>;
@group(0) @binding(4) var<storage, read_write> eta: array<f32>;
@group(0) @binding(5) var<storage, read_write> uv: array<vec2f>;
@group(0) @binding(6) var<storage, read_write> zq: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = nOf();
  if (id.x == 0u) { atomicStore(&stiff[0], 0u); atomicStore(&stiff[1], 0u); atomicStore(&stiff[2], 0u); }
  if (id.x >= n * n) { return; }
  let x = i32(id.x % n);
  let y = i32(id.x / n);
  let nf = f32(n);
  let r = rimRadius(x, y, nf);
  if (!inRim(r)) {
    uv[id.x] = vec2f(0.0);
    h[id.x] = 0.0;
    eta[id.x] = 0.0;
    zq[id.x] = vec2f(0.0);
    return;
  }
  let zv = z[id.x];
  let u = zv.x;
  let v = zv.y;
  uv[id.x] = zv;
  h[id.x] = u;
  zq[id.x] = vec2f(u * u - v * v, 2.0 * u * v);
  // Stroboscopic view of the standing subharmonic wave plus harmonic rim ripples at Ω = 2πf.
  let c1 = F.flow.w;
  let s1 = F.tri.z;
  let c2 = c1 * c1 - s1 * s1;
  let s2 = 2.0 * c1 * s1;
  let dist = (${OPEN_RIM.toFixed(4)} - r) * F.grid.y;
  let men = F.wall.y * exp(-dist * F.wall.z) * (c2 * cos(F.wall.x * dist) + s2 * sin(F.wall.x * dist));
  eta[id.x] = (u * c1 - v * s1) + men;
}`,

  /*
    Zhang & Viñals (1997) three-wave 2ω resonant triad kernel K_{2ω}(q) in
    Fourier space applied to Ẑ²: suppresses 60° hexagons via the near-2ω
    capillary-gravity triad while staying identically energy-dissipative.
  */
  faradayTriad: /* wgsl */ `${FP}
@group(0) @binding(1) var<storage, read_write> zq: array<vec2f>;
fn omegaOf(k: f32) -> f32 {
  return sqrt((F.layer.x * k + F.layer.y * k * k * k) * tanh(k * F.drive.z));
}
fn dampOf(k: f32, w: f32) -> f32 {
  return 2.0 * F.drive.w * k * k + k * sqrt(F.drive.w * w * 0.5) / sinh(min(80.0, 2.0 * k * F.drive.z));
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
    zq[id.x] = vec2f(0.0);
    return;
  }
  let dk = 6.28318531 / F.grid.y;
  let k = dk * sqrt(f32(sx * sx + sy * sy));
  let kc = F.more.x;
  let h = F.drive.z;
  let w0 = omegaOf(kc);
  let wk = omegaOf(k);
  let gq = dampOf(k, wk) / max(wk, 1e-8);
  let wq = wk / max(w0, 1e-8);
  let q = k / kc;
  let T1 = tanh(kc * h);
  let Tq = tanh(k * h);
  let cosT = 0.5 * q * q - 1.0;
  let R2 = q * Tq * (0.75 - cosT / (4.0 * T1 * T1)) - (q * q) / T1;
  let den = (wq * wq - 4.0) * (wq * wq - 4.0) + 64.0 * gq * gq;
  let pre = 0.25 * w0 * kc * kc * (R2 * R2 * (T1 / max(q * Tq, 1e-8))) / max(den, 1e-12);
  let kr = pre * 4.0 * gq;
  let ki = pre * (wq * wq - 4.0) * 0.5;
  let v = zq[id.x];
  zq[id.x] = vec2f(kr * v.x - ki * v.y, kr * v.y + ki * v.x);
}`,

  /*
    Vega, Knobloch & Martel (2001) wave streaming force in real space, packed as
    (Fx + i Fy): includes both the standing part (∇²u ∇u + ∇²v ∇v) and the
    progressive part (∇²v ∇u − ∇²u ∇v) that breaks locked defect equilibria.
    Uses interior-only differences near OPEN_RIM so wall pinning adds no spike.
  */
  faradayForce: /* wgsl */ `${FP}
@group(0) @binding(1) var<storage, read> uv: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> zf: array<vec2f>;
fn atIn(x: i32, y: i32, c: vec2f, n: i32) -> vec2f {
  if (x < 0 || x >= n || y < 0 || y >= n || !inRim(rimRadius(x, y, f32(n)))) { return c; }
  return uv[u32(y * n + x)];
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(nOf());
  if (id.x >= u32(n) || id.y >= u32(n)) { return; }
  let x = i32(id.x);
  let y = i32(id.y);
  let nf = f32(n);
  let r = rimRadius(x, y, nf);
  let idx = u32(y * n + x);
  if (!inRim(r)) { zf[idx] = vec2f(0.0); return; }
  let dx = F.grid.y / nf;
  let c = uv[idx];
  let e = atIn(x + 1, y, c, n); let w = atIn(x - 1, y, c, n);
  let s = atIn(x, y + 1, c, n); let q = atIn(x, y - 1, c, n);
  let lap = (e + w + s + q - 4.0 * c) / (dx * dx);
  let gx = (e.x - w.x) / (2.0 * dx);
  let gy = (s.x - q.x) / (2.0 * dx);
  let vx = (e.y - w.y) / (2.0 * dx);
  let vy = (s.y - q.y) / (2.0 * dx);
  let edge = 1.0 - smoothstep(${OPEN_RIM.toFixed(4)} - 4.0 / nf, ${OPEN_RIM.toFixed(4)}, r);
  let stand = vec2f(lap.x * gx + lap.y * vx, lap.x * gy + lap.y * vy);
  let prog = vec2f(lap.y * gx - lap.x * vx, lap.y * gy - lap.x * vy);
  zf[idx] = -F.flow.y * edge * (stand - F.tri.x * prog);
}`,

  /*
    The flow that push makes, in Fourier space: the push's forward transform
    in, the flow's spectrum out, for one back transform, balanced against VKM
    Poiseuille floor friction r = 3ν/h² and bulk viscosity ν k².
  */
  faradayStream: /* wgsl */ `${FP}
@group(0) @binding(1) var<storage, read> zf: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> zu: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = nOf();
  if (id.x >= n * n) { return; }
  let fx = id.x % n;
  let fy = id.x / n;
  let sx = select(i32(fx), i32(fx) - i32(n), fx >= n / 2u);
  let sy = select(i32(fy), i32(fy) - i32(n), fy >= n / 2u);
  let cut = i32(n) / 3;
  if ((sx == 0 && sy == 0) || abs(sx) > cut || abs(sy) > cut) { zu[id.x] = vec2f(0.0); return; }
  let j = ((n - fx) % n) + ((n - fy) % n) * n;
  let c = zf[id.x];
  let d = vec2f(zf[j].x, -zf[j].y);
  let ax = 0.5 * (c + d);
  let m = 0.5 * (c - d);
  let ay = vec2f(m.y, -m.x);
  let dk = 6.28318531 / F.grid.y;
  let kv = vec2f(f32(sx), f32(sy)) * dk;
  let k2 = dot(kv, kv);
  let along = (kv.x * ax + kv.y * ay) / k2;
  let resp = 1.0 / (F.flow.z + F.drive.w * k2);
  let ux = (ax - kv.x * along) * resp;
  let uy = (ay - kv.y * along) * resp;
  zu[id.x] = ux + vec2f(-uy.y, uy.x);
}`,

  /*
    N(Z) in real space: Zhang & Viñals capillary-gravity cubic (local + flux
    curvature), Tadjbakhsh–Keller / Concus nonlinear frequency detuning, 3-wave
    2ω resonant triad (−zq·Z̄), circular rim pinning, streaming carry, and noise.
  */
  faradayCubic: /* wgsl */ `${FP}
@group(0) @binding(1) var<storage, read> uv: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> z: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> stiff: array<atomic<u32>, 4>;
@group(0) @binding(4) var<storage, read> zu: array<vec2f>;
@group(0) @binding(5) var vel: texture_2d<f32>;
@group(0) @binding(6) var<storage, read> zq: array<vec2f>;
var<workgroup> wu: atomic<u32>;
var<workgroup> ws: atomic<u32>;
var<workgroup> wm: atomic<u32>;
fn at(x: i32, y: i32, n: i32) -> vec2f {
  if (x < 0 || x >= n || y < 0 || y >= n || !inRim(rimRadius(x, y, f32(n)))) { return vec2f(0.0); }
  return uv[u32(y * n + x)];
}
fn cr(t: f32) -> vec4f {
  let t2 = t * t;
  let t3 = t2 * t;
  return 0.5 * vec4f(-t3 + 2.0 * t2 - t, 3.0 * t3 - 5.0 * t2 + 2.0, -3.0 * t3 + 4.0 * t2 + t, t3 - t2);
}
fn between(p: vec2f, n: i32) -> vec2f {
  let b = vec2i(floor(p));
  let f = p - floor(p);
  let wx = cr(f.x);
  let wy = cr(f.y);
  var out = vec2f(0.0);
  for (var j = 0; j < 4; j++) {
    let y = b.y + j - 1;
    let row = wx.x * at(b.x - 1, y, n) + wx.y * at(b.x, y, n) + wx.z * at(b.x + 1, y, n) + wx.w * at(b.x + 2, y, n);
    out += wy[j] * row;
  }
  return out;
}
fn plateFlow(x: i32, y: i32, n: i32) -> vec2f {
  let size = vec2f(textureDimensions(vel));
  if (size.x < 2.0 || F.flow.x == 0.0) { return vec2f(0.0); }
  let uvC = (vec2f(f32(x), f32(y)) + 0.5) / f32(n);
  let p = clamp(uvC * size - 0.5, vec2f(0.0), size - 1.0);
  let i = vec2i(floor(p));
  let f = p - floor(p);
  let hi = min(i + 1, vec2i(size) - 1);
  let a = textureLoad(vel, i, 0).xy;
  let b = textureLoad(vel, vec2i(hi.x, i.y), 0).xy;
  let c = textureLoad(vel, vec2i(i.x, hi.y), 0).xy;
  let d = textureLoad(vel, hi, 0).xy;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y) * F.flow.x;
}
fn hash(a: u32) -> f32 {
  var x = a * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return f32(x) / 4294967295.0;
}
fn fluxCurv2(x: i32, y: i32, n: i32, q: f32) -> vec3f {
  let c = at(x, y, n);
  let nw = at(x - 1, y - 1, n); let no = at(x, y - 1, n); let ne = at(x + 1, y - 1, n);
  let w = at(x - 1, y, n); let e = at(x + 1, y, n);
  let sw = at(x - 1, y + 1, n); let so = at(x, y + 1, n); let se = at(x + 1, y + 1, n);
  let exN = (e - c) * q; let exT = (se - ne + so - no) * 0.25 * q;
  let wxN = (c - w) * q; let wxT = (so - no + sw - nw) * 0.25 * q;
  let syN = (so - c) * q; let syT = (se - sw + e - w) * 0.25 * q;
  let nyN = (c - no) * q; let nyT = (ne - nw + e - w) * 0.25 * q;
  let e2 = exN * exN + exT * exT;
  let w2 = wxN * wxN + wxT * wxT;
  let s2 = syN * syN + syT * syT;
  let q2 = nyN * nyN + nyT * nyT;
  let curv = (e2 * exN - w2 * wxN + s2 * syN - q2 * nyN) * q;
  let sMax = max(max(e2.x, w2.x), max(s2.x, q2.x));
  let sMaxV = max(max(e2.y, w2.y), max(s2.y, q2.y));
  return vec3f(curv.x, curv.y, max(sMax, sMaxV));
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) t: u32) {
  let n = i32(nOf());
  if (t == 0u) { atomicStore(&wu, 0u); atomicStore(&ws, 0u); atomicStore(&wm, 0u); }
  workgroupBarrier();
  if (id.x < u32(n) && id.y < u32(n)) { cell(id, n); }
  workgroupBarrier();
  if (t == 0u) {
    atomicMax(&stiff[0], atomicLoad(&wu));
    atomicMax(&stiff[1], atomicLoad(&ws));
    atomicMax(&stiff[2], atomicLoad(&wm));
  }
}
fn cell(id: vec3u, n: i32) {
  let x = i32(id.x);
  let y = i32(id.y);
  let nf = f32(n);
  let i = u32(y * n + x);
  let r = rimRadius(x, y, nf);
  if (!inRim(r)) {
    // Sink exterior FFT modes back toward 0 unconditionally smoothly at any dt using IMEX W in F.tri.w.
    z[i] = -F.tri.w * z[i];
    return;
  }
  let dx = F.grid.y / nf;
  let q = 1.0 / dx;
  let c = uv[i];
  let z2 = dot(c, c);
  let fc = fluxCurv2(x, y, n, q);
  let wq = zq[i];
  atomicMax(&wu, bitcast<u32>(min(z2, 1e30)));
  atomicMax(&ws, bitcast<u32>(min(fc.z, 1e30)));
  atomicMax(&wm, bitcast<u32>(min(length(wq), 1e30)));
  let kc = F.more.x;
  let kc2 = kc * kc;
  let kc4 = kc2 * kc2;
  let capW = clamp((F.layer.w - 0.25) / 0.35, 0.0, 1.0);
  let gEff = F.layer.z * (1.0 + 2.0 * kc2 * z2);
  let localZ = (1.0 - capW) * z2 * c;
  let curvZ = capW * fc.xy / kc4;
  let triad = vec2f(wq.x * c.x + wq.y * c.y, wq.y * c.x - wq.x * c.y);
  let dw = F.wall.w * z2;
  let detuneNL = vec2f(-dw * c.y, dw * c.x);
  let rimBand = smoothstep(${OPEN_RIM.toFixed(4)} - 2.0 / nf, ${OPEN_RIM.toFixed(4)}, r);
  let pin = -F.tri.y * rimBand * c;
  let nonlin = -gEff * (localZ - curvZ) - triad + detuneNL + pin;
  let dt = F.grid.z;
  let flow = select(zu[i] + plateFlow(x, y, n), plateFlow(x, y, n), F.more.w > 0.5);
  var go = flow * dt / dx;
  let far = length(go);
  if (far > 2.0) { go = go * (2.0 / far); }
  var carry = vec2f(0.0);
  if (far > 1e-6) { carry = (between(vec2f(f32(x), f32(y)) - go, n) - c) / dt; }
  let xi = (hash(i ^ (u32(F.more.z) * 2654435761u)) * 2.0 - 1.0) * 1.7320508;
  let inner = 1.0 - smoothstep(${OPEN_RIM.toFixed(4)} - 2.0 / nf, ${OPEN_RIM.toFixed(4)}, r);
  z[i] = nonlin + carry + vec2f((F.more.y * inner * xi) / sqrt(dt), 0.0);
}`,

  /*
    Exact 2x2 Floquet Mathieu envelope step (ETD1) pairing k and -k:
    dA/dt = (-γ_eff + i D) A + p B + N_k, dB/dt = (-γ_eff - i D) B + p A + N_{-k}*,
    where D = ω(k) - Ω/2 is linear detuning and p = ε ω / 4 is the parametric pump.
  */
  faradayAdvance: /* wgsl */ `${FP}
@group(0) @binding(1) var<storage, read_write> z: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> spec: array<vec2f>;
@group(0) @binding(3) var<storage, read> stiff: array<u32, 4>;
fn omegaOf(k: f32) -> f32 {
  return sqrt((F.layer.x * k + F.layer.y * k * k * k) * tanh(k * F.drive.z));
}
fn dampOf(k: f32, w: f32) -> f32 {
  return 2.0 * F.drive.w * k * k + k * sqrt(F.drive.w * w * 0.5) / sinh(min(80.0, 2.0 * k * F.drive.z));
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
  let j = ((n - fx) % n) + ((n - fy) % n) * n;
  if (j < id.x) { return; }
  let dk = 6.28318531 / F.grid.y;
  let k = dk * sqrt(f32(sx * sx + sy * sy));
  let dt = F.grid.z;
  let kc = F.more.x;
  let kc2 = kc * kc;
  let k2 = (k * k) / kc2;
  let capW = clamp((F.layer.w - 0.25) / 0.35, 0.0, 1.0);
  let maxZ2 = bitcast<f32>(stiff[0]);
  let maxS2 = bitcast<f32>(stiff[1]);
  let maxAbsW = bitcast<f32>(stiff[2]);
  let gMax = F.layer.z * (1.0 + 2.0 * kc2 * maxZ2);
  let lam0 = 3.0 * gMax * ((1.0 - capW) * maxZ2 + capW * maxS2 * k2 / kc2) + 3.0 * maxAbsW + abs(F.wall.w) * maxZ2;
  let lam = select(0.0, min(lam0, 1e9), lam0 > 0.0);
  let w = omegaOf(k);
  let gam = dampOf(k, w) + lam;
  let D = w - 3.14159265 * F.drive.y;
  let eps = F.drive.x * k * tanh(k * F.drive.z) / max(w * w, 1e-12);
  let f = eps * w * 0.25;
  let disc = f * f - D * D;
  let eG = exp(-gam * dt);
  var c0: f32;
  var s1: f32;
  if (disc >= 0.0) {
    let s = sqrt(disc);
    c0 = eG * cosh(s * dt);
    s1 = eG * select(sinh(s * dt) / s, dt, s * dt < 1e-4);
  } else {
    let s = sqrt(-disc);
    c0 = eG * cos(s * dt);
    s1 = eG * select(sin(s * dt) / s, dt, s * dt < 1e-4);
  }
  let detL = gam * gam - disc;
  let safeDet = select(detL, 1.0, abs(detL) < 1e-12);
  let p0 = -(gam * (c0 - 1.0) + disc * s1) / safeDet;
  let p1 = -((c0 - 1.0) + gam * s1) / safeDet;
  let ar = spec[id.x].x; let ai = spec[id.x].y;
  let br = spec[j].x;    let bi = -spec[j].y;
  let nr = z[id.x].x + lam * ar; let ni = z[id.x].y + lam * ai;
  let mr = z[j].x + lam * br;    let mi = -z[j].y + lam * bi;
  let eA = vec2f(c0 * ar + s1 * (-D * ai + f * br), c0 * ai + s1 * (D * ar + f * bi));
  let eB = vec2f(c0 * br + s1 * (f * ar + D * bi),  c0 * bi + s1 * (f * ai - D * br));
  let pN = vec2f(p0 * nr + p1 * (-D * ni + f * mr), p0 * ni + p1 * (D * nr + f * mi));
  let pM = vec2f(p0 * mr + p1 * (f * nr + D * mi),  p0 * mi + p1 * (f * ni - D * mr));
  var sa = eA + pN;
  var sb = eB + pM;
  if (!(abs(sa.x) < 1e6 && abs(sa.y) < 1e6)) { sa = vec2f(0.0); }
  if (!(abs(sb.x) < 1e6 && abs(sb.y) < 1e6)) { sb = vec2f(0.0); }
  if (j == id.x) { sa = vec2f(sa.x, 0.0); sb = sa; }
  spec[id.x] = sa;
  z[id.x] = sa;
  if (j != id.x) {
    let sc = vec2f(sb.x, -sb.y);
    spec[j] = sc;
    z[j] = sc;
  }
}`,
} as const;

export type FaradayKernel = keyof typeof FARADAY_KERNELS;
