// P0 spike (docs/webgpu-plan.md): the solver's heaviest passes, the same math
// in both APIs, timed on this machine. One step here is the core of
// gpuFluid.ts's step: project, MacCormack the velocity by itself, project
// again, MacCormack the dye (58 full-grid passes: 2 × (divergence, 24 pressure
// Jacobi, gradient subtract) + 2 × (advect, advect back, correct)).
//
//   solver.html?api=webgl|webgpu&grid=384&steps=60
//
// Results go to window.__solver with done: true.

const q = new URLSearchParams(location.search);
const API = q.get('api') ?? 'webgpu';
const N = Number(q.get('grid') ?? 384);
const STEPS = Number(q.get('steps') ?? 60);
const JACOBI = 24;
const DISP = 0.35 / N;         // a velocity-to-uv scale in the solver's range
const out = { api: API, grid: N, steps: STEPS, passesPerStep: 2 * (2 + JACOBI) + 2 * 3 };
const finish = () => { out.done = true; window.__solver = out; document.getElementById('out').textContent = JSON.stringify(out, null, 2); };

/** Seeded start fields, identical for both APIs: a swirl and a dye pattern. */
function seed() {
  const vel = new Float32Array(N * N * 4), dye = new Float32Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N - 0.5, v = (y + 0.5) / N - 0.5, i = (y * N + x) * 4;
    const r = Math.hypot(u, v) + 1e-3, w = Math.exp(-r * 6);
    vel[i] = -v / r * w * 2; vel[i + 1] = u / r * w * 2;
    dye[i] = 0.5 + 0.5 * Math.sin(x * 0.07); dye[i + 1] = 0.5 + 0.5 * Math.cos(y * 0.05); dye[i + 2] = 0.3; dye[i + 3] = (Math.sin(x * 0.03) * Math.cos(y * 0.04) > 0) ? 1 : 0.2;
  }
  return { vel, dye };
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// ── WebGL2: the GLSL as gpuFluid.ts has it ─────────────────────────────
async function runWebGL() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) { out.error = 'no webgl2'; return; }
  if (!gl.getExtension('EXT_color_buffer_float')) { out.error = 'no EXT_color_buffer_float'; return; }
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  out.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const PRE = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 v_uv; out vec4 fragColor; uniform vec2 u_texel; uniform float u_N;
`;
  const FS = {
    divergence: `${PRE}uniform sampler2D u_vel;
vec4 velG(vec2 uv) { return texture(u_vel, clamp(uv, u_texel * 0.5, 1.0 - u_texel * 0.5)); }
void main() {
  float dx = velG(v_uv + vec2(u_texel.x, 0.0)).x - velG(v_uv - vec2(u_texel.x, 0.0)).x;
  float dy = velG(v_uv + vec2(0.0, u_texel.y)).y - velG(v_uv - vec2(0.0, u_texel.y)).y;
  fragColor = vec4(-0.5 * (dx + dy) / u_N, 0.0, 0.0, 0.0);
}`,
    jacobi: `${PRE}uniform sampler2D u_p; uniform sampler2D u_div;
void main() {
  float s = texture(u_p, v_uv - vec2(u_texel.x, 0.0)).r + texture(u_p, v_uv + vec2(u_texel.x, 0.0)).r
          + texture(u_p, v_uv - vec2(0.0, u_texel.y)).r + texture(u_p, v_uv + vec2(0.0, u_texel.y)).r;
  fragColor = vec4((texture(u_div, v_uv).r + s) * 0.25, 0.0, 0.0, 0.0);
}`,
    gradient: `${PRE}uniform sampler2D u_vel; uniform sampler2D u_p;
void main() {
  vec4 v = texture(u_vel, v_uv);
  float gx = texture(u_p, v_uv + vec2(u_texel.x, 0.0)).r - texture(u_p, v_uv - vec2(u_texel.x, 0.0)).r;
  float gy = texture(u_p, v_uv + vec2(0.0, u_texel.y)).r - texture(u_p, v_uv - vec2(0.0, u_texel.y)).r;
  fragColor = vec4(v.xy - 0.5 * vec2(gx, gy) * u_N, v.zw);
}`,
    advect: `${PRE}uniform sampler2D u_src; uniform sampler2D u_vel; uniform float u_disp;
void main() {
  vec2 pos = v_uv - texture(u_vel, v_uv).xy * u_disp;
  pos = clamp(pos, vec2(1.0 / u_N), vec2(1.0 - 1.0 / u_N));
  fragColor = texture(u_src, pos);
}`,
    macCormack: `${PRE}uniform sampler2D u_phi0; uniform sampler2D u_phi1; uniform sampler2D u_phi0b; uniform sampler2D u_vel; uniform float u_disp;
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
  };
  const VS = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const vs = compile(gl.VERTEX_SHADER, VS);
  const progs = {};
  for (const [name, src] of Object.entries(FS)) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, src));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let k = 0; k < n; k++) { const info = gl.getActiveUniform(p, k); u[info.name] = gl.getUniformLocation(p, info.name); }
    progs[name] = { p, u };
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const target = (internal, format, type, data, filter) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, N, N, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`incomplete target ${internal}`);
    return { tex, fbo };
  };
  const { vel, dye } = seed();
  const rgba = (data) => target(gl.RGBA16F, gl.RGBA, gl.FLOAT, data, gl.LINEAR);
  const f32 = () => target(gl.R32F, gl.RED, gl.FLOAT, null, gl.NEAREST);
  const pp = (make) => { const a = make(), b = make(); return { get read() { return a0 ? a : b; }, get write() { return a0 ? b : a; }, swap() { a0 = !a0; } }; };
  let a0 = true;
  // Each ping-pong keeps its own parity.
  const pingpong = (make) => { let first = true; const a = make(), b = make(); return { get read() { return first ? a : b; }, get write() { return first ? b : a; }, swap() { first = !first; } }; };
  const V = pingpong(() => rgba(vel)), D = pingpong(() => rgba(dye)), P = pingpong(f32);
  const div = f32(), sA = rgba(null), sB = rgba(null);
  void pp;
  const run = (name, fbo, bind) => {
    const { p, u } = progs[name];
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, N, N);
    gl.useProgram(p);
    gl.uniform2f(u.u_texel, 1 / N, 1 / N);
    gl.uniform1f(u.u_N, N);
    let unit = 0;
    for (const [k, v] of Object.entries(bind)) {
      if (typeof v === 'number') { gl.uniform1f(u[k], v); continue; }
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(u[k], unit); unit++;
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const project = () => {
    run('divergence', div.fbo, { u_vel: V.read.tex });
    gl.bindFramebuffer(gl.FRAMEBUFFER, P.read.fbo); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    for (let k = 0; k < JACOBI; k++) { run('jacobi', P.write.fbo, { u_p: P.read.tex, u_div: div.tex }); P.swap(); }
    run('gradient', V.write.fbo, { u_vel: V.read.tex, u_p: P.read.tex }); V.swap();
  };
  const mac = (F, velTex) => {
    run('advect', sA.fbo, { u_src: F.read.tex, u_vel: velTex, u_disp: DISP });
    run('advect', sB.fbo, { u_src: sA.tex, u_vel: velTex, u_disp: -DISP });
    run('macCormack', F.write.fbo, { u_phi0: F.read.tex, u_phi1: sA.tex, u_phi0b: sB.tex, u_vel: velTex, u_disp: DISP }); F.swap();
  };
  const step = () => { project(); mac(V, V.read.tex); project(); mac(D, V.read.tex); };
  const px = new Float32Array(4);
  const sync = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, D.read.fbo); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px); };
  for (let i = 0; i < 10; i++) step();
  sync();
  const times = [];
  for (let r = 0; r < 3; r++) {
    const t0 = performance.now();
    for (let i = 0; i < STEPS; i++) step();
    sync();
    times.push((performance.now() - t0) / STEPS);
  }
  const ms = median(times);
  out.msPerStep = +ms.toFixed(3);
  out.stepsPerSec = +(1000 / ms).toFixed(1);
  out.check = [...px].map((v) => +v.toFixed(4));
}

// ── WebGPU: the same passes as compute ─────────────────────────────────
async function runWebGPU() {
  if (!navigator.gpu) { out.error = 'no navigator.gpu'; return; }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) { out.error = 'no adapter'; return; }
  out.renderer = `${adapter.info?.vendor ?? ''} ${adapter.info?.architecture ?? ''}`.trim();
  const ts = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({ requiredFeatures: ts ? ['timestamp-query'] : [] });
  const errors = [];
  device.addEventListener('uncapturederror', (e) => errors.push(String(e.error?.message ?? e).slice(0, 200)));
  const HEAD = `
struct U { n: f32, disp: f32, pad0: f32, pad1: f32 };
@group(0) @binding(0) var<uniform> u: U;
fn inside(id: vec3u) -> bool { return id.x < u32(u.n) && id.y < u32(u.n); }
fn uvOf(id: vec3u) -> vec2f { return (vec2f(id.xy) + 0.5) / u.n; }
`;
  const K = {
    divergence: `${HEAD}
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<r32float, write>;
fn v(p: vec2i) -> vec4f { return textureLoad(vel, clamp(p, vec2i(0), vec2i(i32(u.n) - 1)), 0); }
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; }
  let p = vec2i(id.xy);
  let dx = v(p + vec2i(1, 0)).x - v(p - vec2i(1, 0)).x;
  let dy = v(p + vec2i(0, 1)).y - v(p - vec2i(0, 1)).y;
  textureStore(dst, p, vec4f(-0.5 * (dx + dy) / u.n, 0.0, 0.0, 0.0));
}`,
    clear: `${HEAD}
@group(0) @binding(1) var dst: texture_storage_2d<r32float, write>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; }
  textureStore(dst, vec2i(id.xy), vec4f(0.0));
}`,
    jacobi: `${HEAD}
@group(0) @binding(1) var pr: texture_2d<f32>;
@group(0) @binding(2) var dv: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
fn at(p: vec2i) -> f32 { return textureLoad(pr, clamp(p, vec2i(0), vec2i(i32(u.n) - 1)), 0).r; }
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; }
  let p = vec2i(id.xy);
  let s = at(p - vec2i(1, 0)) + at(p + vec2i(1, 0)) + at(p - vec2i(0, 1)) + at(p + vec2i(0, 1));
  textureStore(dst, p, vec4f((textureLoad(dv, p, 0).r + s) * 0.25, 0.0, 0.0, 0.0));
}`,
    gradient: `${HEAD}
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var pr: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;
fn at(p: vec2i) -> f32 { return textureLoad(pr, clamp(p, vec2i(0), vec2i(i32(u.n) - 1)), 0).r; }
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; }
  let p = vec2i(id.xy);
  let v = textureLoad(vel, p, 0);
  let g = vec2f(at(p + vec2i(1, 0)) - at(p - vec2i(1, 0)), at(p + vec2i(0, 1)) - at(p - vec2i(0, 1)));
  textureStore(dst, p, vec4f(v.xy - 0.5 * g * u.n, v.zw));
}`,
    advect: `${HEAD}
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var lin: sampler;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; }
  let uv = uvOf(id);
  let pos = clamp(uv - textureLoad(vel, vec2i(id.xy), 0).xy * u.disp, vec2f(1.0 / u.n), vec2f(1.0 - 1.0 / u.n));
  textureStore(dst, vec2i(id.xy), textureSampleLevel(src, lin, pos, 0.0));
}`,
    macCormack: `${HEAD}
@group(0) @binding(1) var phi0: texture_2d<f32>;
@group(0) @binding(2) var phi1: texture_2d<f32>;
@group(0) @binding(3) var phi0b: texture_2d<f32>;
@group(0) @binding(4) var vel: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inside(id)) { return; }
  let q = vec2i(id.xy);
  let uv = uvOf(id);
  let pos = clamp(uv - textureLoad(vel, q, 0).xy * u.disp, vec2f(1.0 / u.n), vec2f(1.0 - 1.0 / u.n));
  let f = floor(pos * u.n - 0.5);
  let hiN = vec2f(u.n - 1.0);
  let lo = vec2i(clamp(f, vec2f(0.0), hiN));
  let hi = vec2i(clamp(f + 1.0, vec2f(0.0), hiN));
  let a = textureLoad(phi0, vec2i(lo.x, lo.y), 0); let b = textureLoad(phi0, vec2i(hi.x, lo.y), 0);
  let c = textureLoad(phi0, vec2i(lo.x, hi.y), 0); let d = textureLoad(phi0, vec2i(hi.x, hi.y), 0);
  let r = textureLoad(phi1, q, 0) + 0.5 * (textureLoad(phi0, q, 0) - textureLoad(phi0b, q, 0));
  textureStore(dst, q, clamp(r, min(min(a, b), min(c, d)), max(max(a, b), max(c, d))));
}`,
  };
  const pipes = {};
  for (const [name, code] of Object.entries(K)) {
    pipes[name] = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code }), entryPoint: 'main' } });
  }
  const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC;
  const { vel, dye } = seed();
  const half = (src) => {
    const t = device.createTexture({ size: [N, N], format: 'rgba16float', usage });
    if (src) {
      // Float32 → float16 on the CPU, as the WebGL upload does in the driver.
      const h = new Uint16Array(src.length);
      const f = new Float32Array(1), i = new Uint32Array(f.buffer);
      for (let k = 0; k < src.length; k++) {
        f[0] = src[k];
        const x = i[0], s = (x >> 16) & 0x8000, e = ((x >> 23) & 0xff) - 112, m = (x >> 13) & 0x3ff;
        h[k] = e <= 0 ? s : e >= 31 ? s | 0x7c00 : s | (e << 10) | m;
      }
      device.queue.writeTexture({ texture: t }, h, { bytesPerRow: N * 8 }, [N, N]);
    }
    return t;
  };
  const r32 = () => device.createTexture({ size: [N, N], format: 'r32float', usage });
  const Vt = [half(vel), half(null)], Dt = [half(dye), half(null)], Pt = [r32(), r32()];
  const div = r32(), sA = half(null), sB = half(null);
  const lin = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const ubuf = (disp) => { const b = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); device.queue.writeBuffer(b, 0, new Float32Array([N, disp, 0, 0])); return b; };
  const uPos = ubuf(DISP), uNeg = ubuf(-DISP);
  const bg = (name, ub, res) => device.createBindGroup({
    layout: pipes[name].getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ub } }, ...res.map((r, k) => ({ binding: k + 1, resource: r instanceof GPUSampler ? r : r.createView() }))],
  });
  // Bind groups for each ping-pong parity, made once.
  const G = { div: [], jac: [], grad: [], macV: [], macD: [] };
  for (let v = 0; v < 2; v++) {
    G.div[v] = bg('divergence', uPos, [Vt[v], div]);
    G.grad[v] = [0, 1].map((p) => bg('gradient', uPos, [Vt[v], Pt[p], Vt[1 - v]]));
    G.macV[v] = [bg('advect', uPos, [Vt[v], Vt[v], sA, lin]), bg('advect', uNeg, [sA, Vt[v], sB, lin]), bg('macCormack', uPos, [Vt[v], sA, sB, Vt[v], Vt[1 - v]])];
    G.macD[v] = [0, 1].map((d) => [bg('advect', uPos, [Dt[d], Vt[v], sA, lin]), bg('advect', uNeg, [sA, Vt[v], sB, lin]), bg('macCormack', uPos, [Dt[d], sA, sB, Vt[v], Dt[1 - d]])]);
  }
  for (let p = 0; p < 2; p++) G.jac[p] = bg('jacobi', uPos, [Pt[p], div, Pt[1 - p]]);
  const clear = [0, 1].map((p) => bg('clear', uPos, [Pt[p]]));
  const W = Math.ceil(N / 8);
  let v = 0, d = 0;
  let query = null, res = null, rb = null;
  if (ts) {
    query = device.createQuerySet({ type: 'timestamp', count: 2 });
    res = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    rb = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  }
  const step = (timed = false) => {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass(timed && query ? { timestampWrites: { querySet: query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : undefined);
    const go = (name, group) => { pass.setPipeline(pipes[name]); pass.setBindGroup(0, group); pass.dispatchWorkgroups(W, W); };
    const project = () => {
      go('divergence', G.div[v]);
      let p = 0;
      go('clear', clear[p]);
      for (let k = 0; k < JACOBI; k++) { go('jacobi', G.jac[p]); p = 1 - p; }
      go('gradient', G.grad[v][p]); v = 1 - v;
    };
    project();
    go('advect', G.macV[v][0]); go('advect', G.macV[v][1]); go('macCormack', G.macV[v][2]); v = 1 - v;
    project();
    go('advect', G.macD[v][d][0]); go('advect', G.macD[v][d][1]); go('macCormack', G.macD[v][d][2]); d = 1 - d;
    pass.end();
    if (timed && query) { enc.resolveQuerySet(query, 0, 2, res, 0); enc.copyBufferToBuffer(res, 0, rb, 0, 16); }
    device.queue.submit([enc.finish()]);
  };
  for (let i = 0; i < 10; i++) step();
  await device.queue.onSubmittedWorkDone();
  const times = [];
  for (let r = 0; r < 3; r++) {
    const t0 = performance.now();
    for (let i = 0; i < STEPS; i++) step();
    await device.queue.onSubmittedWorkDone();
    times.push((performance.now() - t0) / STEPS);
  }
  const ms = median(times);
  out.msPerStep = +ms.toFixed(3);
  out.stepsPerSec = +(1000 / ms).toFixed(1);
  if (query) {
    step(true);
    await device.queue.onSubmittedWorkDone();
    await rb.mapAsync(GPUMapMode.READ);
    const t = new BigInt64Array(rb.getMappedRange().slice(0));
    rb.unmap();
    out.gpuMsPerStep = +(Number(t[1] - t[0]) / 1e6).toFixed(3);
  }
  // One texel of the dye back, as a check that the passes ran.
  const cb = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyTextureToBuffer({ texture: Dt[d] }, { buffer: cb, bytesPerRow: 256 }, [1, 1]);
  device.queue.submit([enc.finish()]);
  await cb.mapAsync(GPUMapMode.READ);
  out.check = [...new Uint16Array(cb.getMappedRange().slice(0, 8))];
  cb.unmap();
  if (errors.length) out.errors = errors;
}

(API === 'webgl' ? runWebGL() : runWebGPU()).catch((e) => { out.error = String(e?.stack ?? e).slice(0, 400); }).finally(finish);
