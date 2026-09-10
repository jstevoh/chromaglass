/**
 * GPU fluid solver — the CPU `FluidSimulation` step, as fragment-shader passes
 * over ping-pong float textures.
 *
 * Why: the CPU solver is capped at 192² by JavaScript throughput, and that is
 * the reason the macro closeup has to *synthesise* cells and lacing — the
 * simulation can't resolve them. On the GPU the same scheme runs at 512² or
 * more, so the physics produces that structure itself, and the solver stops
 * being the frame-rate bottleneck on weak machines.
 *
 * Two ideas keep the change contained:
 *
 *   1. The *logical* grid stays 192². Every CPU-side writer — dropper, seeds,
 *      audio injection, the drain — keeps writing into 192² arrays, which are
 *      now deltas: uploaded once per step and bilinearly spread into the
 *      high-res field. Every CPU-side reader — macro camera, film exposure,
 *      the dye regulator — gets a 192² downsampled readback. Nothing outside
 *      the solver knows the resolution changed.
 *
 *   2. Noise-driven forces evaluate in logical-cell coordinates, and finite
 *      differences that the CPU took across one cell are taken across one
 *      *logical* cell here. Presets were tuned against the 192 grid; they keep
 *      their character at any resolution.
 *
 * The scheme is Stam's Stable Fluids with the Hele-Shaw squeeze-film term the
 * CPU solver carries, plus MacCormack advection: semi-Lagrangian transport is
 * dissipative enough to smear a filament away in a handful of steps, and the
 * second-order correction is what lets thin structure survive.
 */

/** Everything a step needs, already derived from settings by the caller. */
export interface GpuStepParams {
  dt: number;
  visc: number;         // Hele-Shaw viscosity (thick 1.5 / thin 0.5)
  nu: number;           // kinematic viscosity for momentum diffusion
  diff: number;         // dye / heat diffusivity
  buoyancy: number;
  gravity: number;      // centre-gravity strength (already × 0.05)
  tiltX: number;        // plate tilt, applied as a uniform acceleration
  tiltY: number;
  advection: number;
  damping: number;
  heatDecay: number;
  turbScale: number;
  turbDetail: number;
  spin: number;         // vorticity strength (0 = off)
  surfaceTension: number;
  fingering: number;
  vibIntensity: number;
  vibFrequency: number;
  drip: number;         // rainDrip (0 = off)
  smearX: number;       // per-step shear, precomputed on the CPU
  smearY: number;
  air: number;          // airVelocity (0 = off)
  evapFactor: number;
  time: number;
}

/** Jacobi iteration counts. Gauss-Seidel on the CPU converges roughly twice as fast per sweep. */
const PRESSURE_ITERS = 24;
const SQUEEZE_ITERS = 10;
const VISC_ITERS = 4;
const DYE_ITERS = 4;

/** The CPU solver's hard speed limit, in plate units per unit time. */
const MAX_SPEED = 0.002;

interface Program {
  prog: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

interface PingPong {
  read: Target;
  write: Target;
  swap(): void;
}

// ─── Shaders ──────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const PRELUDE = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 fragColor;
uniform vec2 u_texel;   // 1 / N
uniform float u_N;      // physical grid size
uniform float u_L;      // logical grid size the CPU code works in (192)
`;

// Simplex noise (Ashima / McEwan). Statistically the CPU's simplex-noise
// library, not numerically identical — the forces it drives are stochastic.
const NOISE = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}`;

// Manual bilinear over an L² texture — the deltas come up from the CPU at
// logical resolution and are spread smoothly into the physical grid.
const BILERP_L = `
vec4 bilerpL(sampler2D t, vec2 uv) {
  vec2 p = uv * u_L - 0.5;
  vec2 i = floor(p);
  vec2 f = p - i;
  ivec2 lo = ivec2(clamp(i, vec2(0.0), vec2(u_L - 1.0)));
  ivec2 hi = ivec2(clamp(i + 1.0, vec2(0.0), vec2(u_L - 1.0)));
  vec4 a = texelFetch(t, ivec2(lo.x, lo.y), 0);
  vec4 b = texelFetch(t, ivec2(hi.x, lo.y), 0);
  vec4 c = texelFetch(t, ivec2(lo.x, hi.y), 0);
  vec4 d = texelFetch(t, ivec2(hi.x, hi.y), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`;

// Velocity with wall ghost cells: sampling past the edge returns the edge
// value with the wall-normal component negated, so the interpolated velocity
// *at* the wall is zero. This is the CPU's setBoundary(1/2), virtualised.
const VEL_GHOST = `
uniform sampler2D u_vel;
vec2 velG(vec2 uv) {
  vec2 v = texture(u_vel, uv).xy;
  if (uv.x < 0.0 || uv.x > 1.0) v.x = -v.x;
  if (uv.y < 0.0 || uv.y > 1.0) v.y = -v.y;
  return v;
}`;

const SHADERS = {
  // dye = dye * mul + add   (both deltas are L², see BILERP_L)
  deltaDye: `${PRELUDE}${BILERP_L}
uniform sampler2D u_dye; uniform sampler2D u_add; uniform sampler2D u_mul;
void main() {
  vec4 dye = texture(u_dye, v_uv);
  fragColor = max(dye * bilerpL(u_mul, v_uv).r + bilerpL(u_add, v_uv), vec4(0.0));
}`,

  // vel.xy += add.xy ; temp (vel.z) += add.z
  deltaVel: `${PRELUDE}${BILERP_L}
uniform sampler2D u_vel; uniform sampler2D u_add;
void main() {
  vec4 v = texture(u_vel, v_uv);
  vec4 a = bilerpL(u_add, v_uv);
  fragColor = vec4(v.xy + a.xy, v.z + a.z, 0.0);
}`,

  // Squeeze-film plate gap: apply the gap delta (mouse pressing on the glass),
  // derive dh/dt from it, then the per-step relaxation the CPU does in its
  // decay loop: dhdt *= 0.5, gap recovers toward 0.03.
  squeezeUpdate: `${PRELUDE}${BILERP_L}
uniform sampler2D u_sq; uniform sampler2D u_add; uniform float u_dt; uniform float u_hasDelta;
void main() {
  vec2 sq = texture(u_sq, v_uv).rg;
  float gap = sq.r, dhdt = sq.g * 0.5;
  if (u_hasDelta > 0.5) {
    float dg = bilerpL(u_add, v_uv).a;
    if (dg != 0.0) {
      float g2 = max(0.005, gap + dg);
      dhdt += (g2 - gap) / max(u_dt, 0.0001);
      gap = g2;
    }
  }
  gap = min(0.03, gap + 0.005);
  fragColor = vec4(gap, dhdt, 0.0, 0.0);
}`,

  // Hele-Shaw pressure: ∇²p = 12 μ (dh/dt) / h³
  squeezeJacobi: `${PRELUDE}
uniform sampler2D u_p; uniform sampler2D u_sq; uniform float u_visc;
void main() {
  vec2 sq = texture(u_sq, v_uv).rg;
  float h = sq.r;
  float src = clamp(12.0 * u_visc * sq.g / (h * h * h), -100.0, 100.0);
  float pL = texture(u_p, v_uv - vec2(u_texel.x, 0.0)).r;
  float pR = texture(u_p, v_uv + vec2(u_texel.x, 0.0)).r;
  float pB = texture(u_p, v_uv - vec2(0.0, u_texel.y)).r;
  float pT = texture(u_p, v_uv + vec2(0.0, u_texel.y)).r;
  fragColor = vec4((pL + pR + pB + pT - src) * 0.25, 0.0, 0.0, 0.0);
}`,

  // v += -(h²/12μ) ∇p, gradient taken across one logical cell
  squeezeVel: `${PRELUDE}
uniform sampler2D u_vel; uniform sampler2D u_p; uniform sampler2D u_sq; uniform float u_visc;
void main() {
  vec4 v = texture(u_vel, v_uv);
  vec2 e = vec2(1.0 / u_L, 0.0);
  float gx = (texture(u_p, v_uv + e).r - texture(u_p, v_uv - e).r) * 0.5;
  float gy = (texture(u_p, v_uv + e.yx).r - texture(u_p, v_uv - e.yx).r) * 0.5;
  float h = texture(u_sq, v_uv).r;
  float coeff = -(h * h) / (12.0 * u_visc);
  fragColor = vec4(v.xy + coeff * vec2(gx, gy), v.zw);
}`,

  // Buoyancy and centre gravity — before the velocity solve, as on the CPU
  forcesA: `${PRELUDE}
uniform sampler2D u_vel; uniform float u_dt; uniform float u_buoyancy; uniform float u_gravity; uniform vec2 u_tilt;
void main() {
  vec4 v = texture(u_vel, v_uv);
  v.y -= v.z * u_buoyancy * u_dt;
  v.xy += u_tilt * u_dt;
  if (u_gravity > 0.0) {
    vec2 d = vec2(0.5) - v_uv;
    float len = length(d);
    if (len > 0.0) v.xy += (d / len) * u_gravity * u_dt;
  }
  fragColor = v;
}`,

  // Everything the CPU applies after the projection: curl turbulence, vorticity,
  // immiscibility, fingering, vibration, dripping, smear, airflow. Coordinates
  // are logical cells (p = uv * L) so the tuned look carries over. Where the
  // CPU applied a force on a stride (every 2nd or 3rd cell) the amplitude is
  // scaled by the stride area so the momentum injected per step matches.
  forcesB: `${PRELUDE}${NOISE}
uniform sampler2D u_vel; uniform sampler2D u_dye;
uniform float u_dt; uniform float u_time;
uniform float u_turbScale; uniform int u_turbDetail; uniform float u_spin;
uniform float u_tension; uniform float u_fingering;
uniform float u_vibI; uniform float u_vibF;
uniform float u_drip; uniform vec2 u_smear; uniform float u_air;
void main() {
  vec4 v = texture(u_vel, v_uv);
  vec4 dye = texture(u_dye, v_uv);
  float d = dye.a;
  vec2 p = v_uv * u_L;
  vec2 eL = vec2(1.0 / u_L, 0.0);   // one logical cell

  // Curl turbulence, CPU stride 2 → ×0.25
  if (u_turbScale > 0.005 && d >= 0.02) {
    float m0 = u_turbScale * 0.010 * min(1.5, d) * 0.25;
    for (int o = 0; o < 4; o++) {
      if (o >= u_turbDetail) break;
      float freq = (0.012 / (u_L / 128.0)) * float(1 << o);
      float amp = m0 * pow(0.55, float(o));
      float tOff = u_time * (0.06 + float(o) * 0.05) + float(o) * 37.7;
      float eps = 0.75;
      float dn_dx = snoise(vec2((p.x + eps) * freq, p.y * freq + tOff)) - snoise(vec2((p.x - eps) * freq, p.y * freq + tOff));
      float dn_dy = snoise(vec2(p.x * freq, (p.y + eps) * freq + tOff)) - snoise(vec2(p.x * freq, (p.y - eps) * freq + tOff));
      v.xy += vec2(dn_dy, -dn_dx) * amp;
    }
  }

  // Mid/treble vorticity, CPU stride 3 → ×(1/9)
  if (u_spin > 0.0 && d > 0.05) {
    vec2 q = p * 0.025 + vec2(0.0, u_time * 0.08);
    float n = snoise(q);
    float dn_dx = snoise(q + vec2(0.01, 0.0)) - n;
    float dn_dy = snoise(q + vec2(0.0, 0.01)) - n;
    v.xy += vec2(dn_dy, -dn_dx) * u_spin * d * (1.0 / 9.0);
  }

  // Immiscibility: push away from neighbours of a different colour
  if (u_tension > 0.0 && d >= 0.01) {
    vec3 col = dye.rgb / d;
    vec4 cR = texture(u_dye, v_uv + eL), cL = texture(u_dye, v_uv - eL);
    vec4 cT = texture(u_dye, v_uv + eL.yx), cB = texture(u_dye, v_uv - eL.yx);
    float cdx = 0.0, cdy = 0.0;
    if (cR.a > 0.01 && cL.a > 0.01) {
      float dr = length(cR.rgb / cR.a - col), dl = length(cL.rgb / cL.a - col);
      cdx = dr * dr - dl * dl;
    }
    if (cT.a > 0.01 && cB.a > 0.01) {
      float dt_ = length(cT.rgb / cT.a - col), db = length(cB.rgb / cB.a - col);
      cdy = dt_ * dt_ - db * db;
    }
    float n = snoise(p * 0.03 + vec2(0.0, u_time * 0.05));
    v.xy -= vec2(cdx, cdy) * (u_tension * 0.8) * d * (1.0 + n * 2.0);
  }

  // Saffman–Taylor fingering along the density gradient
  if (u_fingering > 0.0 && d >= 0.05) {
    float gx = (texture(u_dye, v_uv + eL).a - texture(u_dye, v_uv - eL).a) * 0.5;
    float gy = (texture(u_dye, v_uv + eL.yx).a - texture(u_dye, v_uv - eL.yx).a) * 0.5;
    float g2 = gx * gx + gy * gy;
    if (g2 > 0.005) {
      float g = sqrt(g2);
      float n = snoise(p * 0.02 + vec2(0.0, u_time * 0.05));
      v.xy -= (vec2(gx, gy) / g) * (n * u_fingering * g * 4.0);
    }
  }

  // Vibration
  if (u_vibI > 0.001 && d > 0.05) {
    float f = u_vibF * 0.5, s = u_time * 20.0;
    v.x += sin(p.x * f + s) * cos(p.y * f) * u_vibI;
    v.y += cos(p.x * f) * sin(p.y * f + s) * u_vibI;
  }

  // Dripping: streaky downward pull with heavy friction between streaks
  if (u_drip > 0.1) {
    float streak = (snoise(vec2(p.x * 0.15, p.y * 0.02 - u_time * 0.2)) + 1.0) * 0.5;
    v.y += 0.3 * u_dt * u_drip * (0.1 + streak * streak * 0.9);
    float s1 = 1.0 - max(0.0, streak);
    float friction = 0.5 + s1 * s1 * s1 * 20.0;
    v.xy *= exp(-friction * u_dt);
  }

  // Glass smear: a plate-wide shear, modulated by local grain
  if ((u_smear.x != 0.0 || u_smear.y != 0.0) && d > 0.01) {
    v.xy += u_smear * (snoise(p * 0.1) * 0.5 + 0.5);
  }

  // Airflow: gusts plus lift
  if (u_air > 0.1 && d > 0.01) {
    v.x += snoise(vec2(p.x * 0.05, p.y * 0.05 - u_time)) * u_air * 4.0 * u_dt;
    v.y += -u_air * 8.0 * u_dt + snoise(vec2(p.y * 0.05, p.x * 0.05 + u_time)) * u_air * 4.0 * u_dt;
  }

  fragColor = v;
}`,

  // x = (x0 + a Σ neighbours) / (1 + 4a), per channel
  jacobi: `${PRELUDE}
uniform sampler2D u_x; uniform sampler2D u_x0; uniform vec4 u_a; uniform vec4 u_rcp;
void main() {
  vec4 s = texture(u_x, v_uv - vec2(u_texel.x, 0.0)) + texture(u_x, v_uv + vec2(u_texel.x, 0.0))
         + texture(u_x, v_uv - vec2(0.0, u_texel.y)) + texture(u_x, v_uv + vec2(0.0, u_texel.y));
  fragColor = (texture(u_x0, v_uv) + u_a * s) * u_rcp;
}`,

  divergence: `${PRELUDE}${VEL_GHOST}
void main() {
  float dx = velG(v_uv + vec2(u_texel.x, 0.0)).x - velG(v_uv - vec2(u_texel.x, 0.0)).x;
  float dy = velG(v_uv + vec2(0.0, u_texel.y)).y - velG(v_uv - vec2(0.0, u_texel.y)).y;
  fragColor = vec4(-0.5 * (dx + dy) / u_N, 0.0, 0.0, 0.0);
}`,

  pressureJacobi: `${PRELUDE}
uniform sampler2D u_p; uniform sampler2D u_div;
void main() {
  float s = texture(u_p, v_uv - vec2(u_texel.x, 0.0)).r + texture(u_p, v_uv + vec2(u_texel.x, 0.0)).r
          + texture(u_p, v_uv - vec2(0.0, u_texel.y)).r + texture(u_p, v_uv + vec2(0.0, u_texel.y)).r;
  fragColor = vec4((texture(u_div, v_uv).r + s) * 0.25, 0.0, 0.0, 0.0);
}`,

  gradientSubtract: `${PRELUDE}
uniform sampler2D u_vel; uniform sampler2D u_p;
void main() {
  vec4 v = texture(u_vel, v_uv);
  float gx = texture(u_p, v_uv + vec2(u_texel.x, 0.0)).r - texture(u_p, v_uv - vec2(u_texel.x, 0.0)).r;
  float gy = texture(u_p, v_uv + vec2(0.0, u_texel.y)).r - texture(u_p, v_uv - vec2(0.0, u_texel.y)).r;
  fragColor = vec4(v.xy - 0.5 * vec2(gx, gy) * u_N, v.zw);
}`,

  // Semi-Lagrangian advection. u_disp converts velocity to a uv displacement:
  // dt·(N-2)/N for the solver, or the drain's own scale.
  advect: `${PRELUDE}
uniform sampler2D u_src; uniform sampler2D u_vel; uniform float u_disp;
void main() {
  vec2 pos = v_uv - texture(u_vel, v_uv).xy * u_disp;
  pos = clamp(pos, vec2(1.0 / u_N), vec2(1.0 - 1.0 / u_N));
  fragColor = texture(u_src, pos);
}`,

  // MacCormack correction: phi1 + ½(phi0 − phi0b), limited to the range of the
  // four cells the forward step sampled, which is what stops it overshooting.
  macCormack: `${PRELUDE}
uniform sampler2D u_phi0; uniform sampler2D u_phi1; uniform sampler2D u_phi0b; uniform sampler2D u_vel; uniform float u_disp;
void main() {
  vec2 pos = v_uv - texture(u_vel, v_uv).xy * u_disp;
  pos = clamp(pos, vec2(1.0 / u_N), vec2(1.0 - 1.0 / u_N));
  vec2 p = pos * u_N - 0.5;
  vec2 i = floor(p);
  ivec2 lo = ivec2(clamp(i, vec2(0.0), vec2(u_N - 1.0)));
  ivec2 hi = ivec2(clamp(i + 1.0, vec2(0.0), vec2(u_N - 1.0)));
  vec4 a = texelFetch(u_phi0, ivec2(lo.x, lo.y), 0), b = texelFetch(u_phi0, ivec2(hi.x, lo.y), 0);
  vec4 c = texelFetch(u_phi0, ivec2(lo.x, hi.y), 0), d = texelFetch(u_phi0, ivec2(hi.x, hi.y), 0);
  vec4 mn = min(min(a, b), min(c, d)), mx = max(max(a, b), max(c, d));
  vec4 r = texture(u_phi1, v_uv) + 0.5 * (texture(u_phi0, v_uv) - texture(u_phi0b, v_uv));
  fragColor = clamp(r, mn, mx);
}`,

  decayDye: `${PRELUDE}
uniform sampler2D u_dye; uniform float u_evap;
void main() {
  vec4 dye = texture(u_dye, v_uv) * u_evap;
  if (dye.a > 6.0) dye *= 6.0 / dye.a;   // soft cap keeps colour ratios
  if (any(isnan(dye))) dye = vec4(0.0);
  fragColor = max(dye, vec4(0.0));
}`,

  decayVel: `${PRELUDE}
uniform sampler2D u_vel; uniform float u_damping; uniform float u_heatDecay; uniform float u_maxSpeed;
void main() {
  vec4 v = texture(u_vel, v_uv);
  v.xy *= u_damping;
  float sp = length(v.xy);
  if (sp > u_maxSpeed) v.xy *= u_maxSpeed / sp;
  v.z *= u_heatDecay;
  if (any(isnan(v))) v = vec4(0.0);
  fragColor = vec4(v.xyz, 0.0);
}`,

  // Drain: an inward spiral, in logical units to match the CPU animation
  drainVel: `${PRELUDE}
uniform float u_pull; uniform float u_t;
void main() {
  vec2 d = (vec2(0.5) - v_uv) * u_L;
  float dist = max(length(d), 1.0);
  vec2 dir = d / dist;
  float inward = u_pull * (1.0 + dist / 50.0);
  float swirl = u_pull * 0.7 * (1.0 - u_t * 0.5);
  fragColor = vec4(dir.x * inward - dir.y * swirl, dir.y * inward + dir.x * swirl, 0.0, 0.0);
}`,

  scale: `${PRELUDE}
uniform sampler2D u_src; uniform float u_k;
void main() { fragColor = texture(u_src, v_uv) * u_k; }`,

  // Box-filter any field down to the logical grid for the CPU readers
  downsample: `${PRELUDE}
uniform sampler2D u_src;
void main() {
  float k = u_N / u_L;
  int n = int(clamp(ceil(k), 1.0, 4.0));
  vec4 acc = vec4(0.0);
  vec2 base = v_uv - vec2(0.5 / u_L) + vec2(0.5 / u_N);
  for (int j = 0; j < 4; j++) {
    if (j >= n) break;
    for (int i = 0; i < 4; i++) {
      if (i >= n) break;
      acc += texture(u_src, base + vec2(float(i), float(j)) * (k / float(n)) / u_N);
    }
  }
  fragColor = acc / float(n * n);
}`,

  // The renderer's sqrt-encoded RGBA8 layer texture, produced on the GPU
  packDye: `${PRELUDE}
uniform sampler2D u_dye;
void main() {
  vec4 dye = max(texture(u_dye, v_uv), vec4(0.0));
  fragColor = sqrt(clamp(dye * 0.125, 0.0, 1.0));
}`,

  packVel: `${PRELUDE}
uniform sampler2D u_vel; uniform float u_range;
void main() {
  vec2 v = clamp(texture(u_vel, v_uv).xy / u_range, -1.0, 1.0);
  fragColor = vec4(v * 0.5 + 0.5, 0.0, 1.0);
}`,
} as const;

type ShaderName = keyof typeof SHADERS;

// ─── Solver ───────────────────────────────────────────────────────────

export class GpuFluid {
  readonly N: number;
  readonly L: number;
  private gl: WebGL2RenderingContext;
  private programs = new Map<ShaderName, Program>();
  private vao: WebGLVertexArrayObject;
  private quad: WebGLBuffer;

  private dye!: PingPong;
  private vel!: PingPong;
  private squeeze!: PingPong;
  private press!: PingPong;
  private spress!: PingPong;
  private div!: Target;
  private scratchA!: Target;   // MacCormack intermediates
  private scratchB!: Target;
  private readbackTarget!: Target;
  private deltaDye!: WebGLTexture;
  private deltaVel!: WebGLTexture;
  private deltaMul!: WebGLTexture;
  private rbDye: Float32Array;
  private rbVel: Float32Array;
  private disposed = false;

  /**
   * True when this context can run the solver: float render targets, and a
   * float readback for the CPU-side readers.
   */
  static isSupported(gl: WebGL2RenderingContext): boolean {
    if (!gl.getExtension('EXT_color_buffer_float')) return false;
    // Probe the float readback path once — implementations differ here.
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 2, 2, 0, gl.RGBA, gl.FLOAT, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    let ok = complete;
    if (complete) {
      while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
      gl.readPixels(0, 0, 2, 2, gl.RGBA, gl.FLOAT, new Float32Array(16));
      ok = gl.getError() === gl.NO_ERROR;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    return ok;
  }

  constructor(gl: WebGL2RenderingContext, physicalSize: number, logicalSize: number) {
    this.gl = gl;
    this.N = physicalSize;
    this.L = logicalSize;
    this.rbDye = new Float32Array(logicalSize * logicalSize * 4);
    this.rbVel = new Float32Array(logicalSize * logicalSize * 4);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const N = physicalSize, L = logicalSize;
    this.dye = this.pingPong(N, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    this.vel = this.pingPong(N, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    this.squeeze = this.pingPong(N, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.LINEAR);
    this.press = this.pingPong(N, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
    this.spress = this.pingPong(N, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
    this.div = this.target(N, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
    this.scratchA = this.target(N, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    this.scratchB = this.target(N, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    this.readbackTarget = this.target(L, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    this.deltaDye = this.texture(L, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    this.deltaVel = this.texture(L, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    this.deltaMul = this.texture(L, gl.R32F, gl.RED, gl.FLOAT, gl.NEAREST);

    this.clear();
  }

  // ── Public API ────────────────────────────────────────────────────

  /** Wipe the plate: no dye, no motion, plate gap at rest. */
  clear(): void {
    const gl = this.gl;
    for (const t of [this.dye.read, this.dye.write, this.vel.read, this.vel.write,
                     this.press.read, this.press.write, this.spress.read, this.spress.write,
                     this.div, this.scratchA, this.scratchB]) {
      this.clearTarget(t, 0, 0, 0, 0);
    }
    this.clearTarget(this.squeeze.read, 0.03, 0, 0, 0);
    this.clearTarget(this.squeeze.write, 0.03, 0, 0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Fold the CPU-side deltas into the field. `dyeAdd` is L²×4 (R,G,B absorption,
   * density), `velAdd` is L²×4 (vx, vy, temp, gap), `dyeMul` is L² (1 = no change).
   */
  applyDeltas(dyeAdd: Float32Array, velAdd: Float32Array, dyeMul: Float32Array, dt: number): void {
    const gl = this.gl;
    const L = this.L;
    gl.bindTexture(gl.TEXTURE_2D, this.deltaDye);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, L, L, gl.RGBA, gl.FLOAT, dyeAdd);
    gl.bindTexture(gl.TEXTURE_2D, this.deltaVel);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, L, L, gl.RGBA, gl.FLOAT, velAdd);
    gl.bindTexture(gl.TEXTURE_2D, this.deltaMul);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, L, L, gl.RED, gl.FLOAT, dyeMul);

    this.run('deltaDye', this.dye.write, (u) => {
      this.bind(u, 'u_dye', this.dye.read.tex, 0);
      this.bind(u, 'u_add', this.deltaDye, 1);
      this.bind(u, 'u_mul', this.deltaMul, 2);
    });
    this.dye.swap();
    this.run('deltaVel', this.vel.write, (u) => {
      this.bind(u, 'u_vel', this.vel.read.tex, 0);
      this.bind(u, 'u_add', this.deltaVel, 1);
    });
    this.vel.swap();
    this.run('squeezeUpdate', this.squeeze.write, (u) => {
      this.bind(u, 'u_sq', this.squeeze.read.tex, 0);
      this.bind(u, 'u_add', this.deltaVel, 1);
      gl.uniform1f(u.get('u_dt')!, dt);
      gl.uniform1f(u.get('u_hasDelta')!, 1);
    });
    this.squeeze.swap();
  }

  /** One solver step. Call applyDeltas first when there is anything to add. */
  step(p: GpuStepParams, deltasApplied: boolean): void {
    const gl = this.gl;
    const N = this.N;
    const disp = p.dt * p.advection * (N - 2) / N;

    // Squeeze-film relaxation runs every step even with no delta
    if (!deltasApplied) {
      this.run('squeezeUpdate', this.squeeze.write, (u) => {
        this.bind(u, 'u_sq', this.squeeze.read.tex, 0);
        this.bind(u, 'u_add', this.deltaVel, 1);
        gl.uniform1f(u.get('u_dt')!, p.dt);
        gl.uniform1f(u.get('u_hasDelta')!, 0);
      });
      this.squeeze.swap();
    }

    // 1. Hele-Shaw squeeze-film flow
    for (let k = 0; k < SQUEEZE_ITERS; k++) {
      this.run('squeezeJacobi', this.spress.write, (u) => {
        this.bind(u, 'u_p', this.spress.read.tex, 0);
        this.bind(u, 'u_sq', this.squeeze.read.tex, 1);
        gl.uniform1f(u.get('u_visc')!, p.visc);
      });
      this.spress.swap();
    }
    this.run('squeezeVel', this.vel.write, (u) => {
      this.bind(u, 'u_vel', this.vel.read.tex, 0);
      this.bind(u, 'u_p', this.spress.read.tex, 1);
      this.bind(u, 'u_sq', this.squeeze.read.tex, 2);
      gl.uniform1f(u.get('u_visc')!, p.visc);
    });
    this.vel.swap();

    // 2. Buoyancy and centre gravity
    this.run('forcesA', this.vel.write, (u) => {
      this.bind(u, 'u_vel', this.vel.read.tex, 0);
      gl.uniform1f(u.get('u_dt')!, p.dt);
      gl.uniform1f(u.get('u_buoyancy')!, p.buoyancy);
      gl.uniform1f(u.get('u_gravity')!, p.gravity);
      gl.uniform2f(u.get('u_tilt')!, p.tiltX, p.tiltY);
    });
    this.vel.swap();

    // 3. Viscous diffusion of momentum (xy) and heat (z)
    const n2 = (N - 2) * (N - 2);
    this.jacobi(this.vel, [p.dt * p.nu * n2, p.dt * p.nu * n2, p.dt * p.diff * n2, 0], VISC_ITERS);

    // 4. Project, 5. advect velocity by itself (MacCormack), 6. project again
    this.project();
    this.macCormack(this.vel, this.vel.read.tex, disp);
    this.project();

    // 6.5–8.7 The post-projection forces
    this.run('forcesB', this.vel.write, (u) => {
      this.bind(u, 'u_vel', this.vel.read.tex, 0);
      this.bind(u, 'u_dye', this.dye.read.tex, 1);
      gl.uniform1f(u.get('u_dt')!, p.dt);
      gl.uniform1f(u.get('u_time')!, p.time);
      gl.uniform1f(u.get('u_turbScale')!, p.turbScale);
      gl.uniform1i(u.get('u_turbDetail')!, Math.max(1, Math.min(4, Math.round(p.turbDetail))));
      gl.uniform1f(u.get('u_spin')!, p.spin);
      gl.uniform1f(u.get('u_tension')!, p.surfaceTension);
      gl.uniform1f(u.get('u_fingering')!, p.fingering);
      gl.uniform1f(u.get('u_vibI')!, p.vibIntensity);
      gl.uniform1f(u.get('u_vibF')!, p.vibFrequency);
      gl.uniform1f(u.get('u_drip')!, p.drip);
      gl.uniform2f(u.get('u_smear')!, p.smearX, p.smearY);
      gl.uniform1f(u.get('u_air')!, p.air);
    });
    this.vel.swap();

    // 9. Dye: diffuse, then MacCormack advect through the forced velocity
    const a = p.dt * p.diff * n2;
    this.jacobi(this.dye, [a, a, a, a], DYE_ITERS);
    this.macCormack(this.dye, this.vel.read.tex, disp);

    // 10. Decay: damping, speed limit, evaporation, cap, heat decay
    this.run('decayDye', this.dye.write, (u) => {
      this.bind(u, 'u_dye', this.dye.read.tex, 0);
      gl.uniform1f(u.get('u_evap')!, p.evapFactor);
    });
    this.dye.swap();
    this.run('decayVel', this.vel.write, (u) => {
      this.bind(u, 'u_vel', this.vel.read.tex, 0);
      gl.uniform1f(u.get('u_damping')!, p.damping);
      gl.uniform1f(u.get('u_heatDecay')!, p.heatDecay);
      gl.uniform1f(u.get('u_maxSpeed')!, MAX_SPEED);
    });
    this.vel.swap();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** One frame of the drain animation: inward spiral, transport, evaporate. */
  drainStep(t: number): void {
    const gl = this.gl;
    const pull = Math.pow(t, 0.4) * 4.0;
    this.run('drainVel', this.vel.write, (u) => {
      gl.uniform1f(u.get('u_pull')!, pull);
      gl.uniform1f(u.get('u_t')!, t);
    });
    this.vel.swap();
    // CPU displacement was 0.3·v logical cells per frame
    this.run('advect', this.dye.write, (u) => {
      this.bind(u, 'u_src', this.dye.read.tex, 0);
      this.bind(u, 'u_vel', this.vel.read.tex, 1);
      gl.uniform1f(u.get('u_disp')!, 0.3 / this.L);
    });
    this.dye.swap();
    this.run('scale', this.dye.write, (u) => {
      this.bind(u, 'u_src', this.dye.read.tex, 0);
      gl.uniform1f(u.get('u_k')!, 1 - (0.03 + t * t * 0.35));
    });
    this.dye.swap();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Downsample the field to the logical grid and read it back. Both arrays are
   * L² × 4, row-major: dye = (R, G, B absorption, density), vel = (vx, vy, temp, 0).
   */
  readback(): { dye: Float32Array; vel: Float32Array } {
    const gl = this.gl;
    this.run('downsample', this.readbackTarget, (u) => {
      this.bind(u, 'u_src', this.dye.read.tex, 0);
    }, this.L);
    gl.readPixels(0, 0, this.L, this.L, gl.RGBA, gl.FLOAT, this.rbDye);
    this.run('downsample', this.readbackTarget, (u) => {
      this.bind(u, 'u_src', this.vel.read.tex, 0);
    }, this.L);
    gl.readPixels(0, 0, this.L, this.L, gl.RGBA, gl.FLOAT, this.rbVel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { dye: this.rbDye, vel: this.rbVel };
  }

  /**
   * Render the field into the renderer's own textures — the sqrt-encoded RGBA8
   * layer texture it has always consumed, plus the normalised velocity texture
   * the macro shader advects its detail with. Both must be N² RGBA8.
   */
  packInto(layerFbo: WebGLFramebuffer, velFbo: WebGLFramebuffer | null, velRange: number): void {
    const gl = this.gl;
    this.runInto('packDye', layerFbo, (u) => {
      this.bind(u, 'u_dye', this.dye.read.tex, 0);
    });
    if (velFbo) {
      this.runInto('packVel', velFbo, (u) => {
        this.bind(u, 'u_vel', this.vel.read.tex, 0);
        gl.uniform1f(u.get('u_range')!, Math.max(1e-6, velRange));
      });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    for (const pp of [this.dye, this.vel, this.squeeze, this.press, this.spress]) {
      for (const t of [pp.read, pp.write]) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); }
    }
    for (const t of [this.div, this.scratchA, this.scratchB, this.readbackTarget]) {
      gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex);
    }
    for (const t of [this.deltaDye, this.deltaVel, this.deltaMul]) gl.deleteTexture(t);
    for (const p of this.programs.values()) gl.deleteProgram(p.prog);
    gl.deleteBuffer(this.quad);
    gl.deleteVertexArray(this.vao);
  }

  // ── Composite passes ──────────────────────────────────────────────

  private project(): void {
    const gl = this.gl;
    this.run('divergence', this.div, (u) => {
      this.bind(u, 'u_vel', this.vel.read.tex, 0);
    });
    this.clearTarget(this.press.read, 0, 0, 0, 0);
    for (let k = 0; k < PRESSURE_ITERS; k++) {
      this.run('pressureJacobi', this.press.write, (u) => {
        this.bind(u, 'u_p', this.press.read.tex, 0);
        this.bind(u, 'u_div', this.div.tex, 1);
      });
      this.press.swap();
    }
    this.run('gradientSubtract', this.vel.write, (u) => {
      this.bind(u, 'u_vel', this.vel.read.tex, 0);
      this.bind(u, 'u_p', this.press.read.tex, 1);
    });
    this.vel.swap();
    void gl;
  }

  private jacobi(field: PingPong, a: [number, number, number, number], iters: number): void {
    const gl = this.gl;
    if (a.every((v) => v <= 0)) return;
    // x0 is the pre-diffusion field; keep a copy in scratchA since `field` ping-pongs
    this.run('scale', this.scratchA, (u) => {
      this.bind(u, 'u_src', field.read.tex, 0);
      gl.uniform1f(u.get('u_k')!, 1);
    });
    const rcp = a.map((v) => 1 / (1 + 4 * v)) as [number, number, number, number];
    for (let k = 0; k < iters; k++) {
      this.run('jacobi', field.write, (u) => {
        this.bind(u, 'u_x', field.read.tex, 0);
        this.bind(u, 'u_x0', this.scratchA.tex, 1);
        gl.uniform4f(u.get('u_a')!, a[0], a[1], a[2], a[3]);
        gl.uniform4f(u.get('u_rcp')!, rcp[0], rcp[1], rcp[2], rcp[3]);
      });
      field.swap();
    }
  }

  /**
   * MacCormack: forward advect, advect the result back, correct by half the
   * round-trip error, clamp to the forward sample's neighbourhood.
   */
  private macCormack(field: PingPong, velTex: WebGLTexture, disp: number): void {
    const gl = this.gl;
    const phi0 = field.read.tex;
    // Velocity may be the field itself; read it from phi0 while it is stable
    this.run('advect', this.scratchA, (u) => {          // phi1 = A(phi0)
      this.bind(u, 'u_src', phi0, 0);
      this.bind(u, 'u_vel', velTex, 1);
      gl.uniform1f(u.get('u_disp')!, disp);
    });
    this.run('advect', this.scratchB, (u) => {          // phi0b = A⁻¹(phi1)
      this.bind(u, 'u_src', this.scratchA.tex, 0);
      this.bind(u, 'u_vel', velTex, 1);
      gl.uniform1f(u.get('u_disp')!, -disp);
    });
    this.run('macCormack', field.write, (u) => {
      this.bind(u, 'u_phi0', phi0, 0);
      this.bind(u, 'u_phi1', this.scratchA.tex, 1);
      this.bind(u, 'u_phi0b', this.scratchB.tex, 2);
      this.bind(u, 'u_vel', velTex, 3);
      gl.uniform1f(u.get('u_disp')!, disp);
    });
    field.swap();
  }

  // ── GL plumbing ───────────────────────────────────────────────────

  private run(name: ShaderName, target: Target, setUniforms: (u: Map<string, WebGLUniformLocation | null>) => void, size = this.N): void {
    this.runInto(name, target.fbo, setUniforms, size);
  }

  private runInto(name: ShaderName, fbo: WebGLFramebuffer, setUniforms: (u: Map<string, WebGLUniformLocation | null>) => void, size = this.N): void {
    const gl = this.gl;
    const program = this.program(name);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, size, size);
    gl.useProgram(program.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(program.uniforms.get('u_texel')!, 1 / this.N, 1 / this.N);
    gl.uniform1f(program.uniforms.get('u_N')!, this.N);
    gl.uniform1f(program.uniforms.get('u_L')!, this.L);
    setUniforms(program.uniforms);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private bind(u: Map<string, WebGLUniformLocation | null>, name: string, tex: WebGLTexture, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u.get(name)!, unit);
  }

  private program(name: ShaderName): Program {
    let p = this.programs.get(name);
    if (p) return p;
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`GpuFluid shader "${name}" failed to compile: ${log}`);
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, SHADERS[name]);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`GpuFluid shader "${name}" failed to link: ${gl.getProgramInfoLog(prog)}`);
    }
    const uniforms = new Map<string, WebGLUniformLocation | null>();
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(prog, i);
      if (info) uniforms.set(info.name, gl.getUniformLocation(prog, info.name));
    }
    p = { prog, uniforms };
    this.programs.set(name, p);
    return p;
  }

  private texture(size: number, internal: number, format: number, type: number, filter: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, size, size, 0, format, type, null);
    return tex;
  }

  private target(size: number, internal: number, format: number, type: number, filter: number): Target {
    const gl = this.gl;
    const tex = this.texture(size, internal, format, type, filter);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`GpuFluid framebuffer incomplete (0x${status.toString(16)})`);
    }
    return { tex, fbo };
  }

  private pingPong(size: number, internal: number, format: number, type: number, filter: number): PingPong {
    let read = this.target(size, internal, format, type, filter);
    let write = this.target(size, internal, format, type, filter);
    return {
      get read() { return read; },
      get write() { return write; },
      swap() { const t = read; read = write; write = t; },
    };
  }

  private clearTarget(t: Target, r: number, g: number, b: number, a: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}
