#!/usr/bin/env node
/**
 * What the magnet's pull is in tesla, metres and seconds: MAGNET_GAIN derived,
 * and the solver's drop measured against the derivation (PLAN 29c-2).
 *
 *   npm run magnetgain     (the lab: any adapter that computes; PW_WEBGPU=1 in a cloud session)
 *
 * Asked by the review of #373: the solver's field ψ is dimensionless (a share
 * of SPIKE_B_REF, squared and saturated), and nothing in the code said what
 * one unit of ψ, or of MAGNET_GAIN, is in the dish. So the pull could be
 * re-tuned and called physics. This writes the chain out as numbers, from a
 * real magnet under a real ferrofluid to the velocity hsPrep ends the step
 * with, and holds the solver to it.
 *
 * ## The chain
 *
 *  1. The field. The solver's magnet is a cylinder (wgsl/magnetDisc.ts): a
 *     rod twice as long as it is wide, 20 mm by 40 mm at the tool's own size on
 *     the 20 cm dish, with `strength` the share of its remanence. Taken here as
 *     an N52 neodymium rod, Br = 1.45 T, so strength 1 is the full remanence
 *     and the Magnet tool's 0.9 a grade under it. The field is worked out
 *     independently of the shader, by Biot–Savart over the side current (as
 *     `npm run disc` does), and the shader's own share b is read off the GPU
 *     beside it: B [T] = b · SPIKE_B_REF · Br, which is the tesla value of the
 *     reference share. SPIKE_B_REF is the tool's magnet on its axis at the
 *     reference depth, so b = 1 is 0.085 Br = 123 mT.
 *
 *  2. The force. A magnetisable liquid in a field gradient is pulled toward
 *     the field (the Kelvin force), f = μ₀ M ∇H = M ∇B per unit volume, with
 *     M its magnetisation. A ferrofluid magnetises as a Langevin paramagnet
 *     (Rosensweig, Ferrohydrodynamics): M = Ms · L(3 χᵢ B / μ₀ Ms), which is
 *     χᵢ B / μ₀ in a weak field and Ms in a strong one, so the force is the
 *     gradient of U(B) = ∫ M dB: χᵢ B² / 2μ₀ far from the magnet, Ms · B
 *     close to it. Ferrotec's EFH1, the light hydrocarbon ferrofluid the
 *     plate's viscosity is taken from (FERRO_NU), by Ferrotec's own sheet:
 *     Ms = 440 G (μ₀Ms = 44 mT), initial susceptibility 2.64 (SI; 0.21 in
 *     CGS, and 2.58 G/Oe on the older data sheet), density 1.21 g/cm³,
 *     6 mPa·s at 27 °C. The force is in proportion to χᵢ, and papers quote
 *     1.2 to 1.7 for the same fluid, so the gain below is good to about a
 *     factor of two. Its linear law saturates where χᵢ B / μ₀ reaches Ms, at
 *     B* = μ₀ Ms / χᵢ = 16.7 mT.
 *
 *     The solver's energy is ψ = MAGNET_E · b² / (1 + b / MAGNET_BS), the
 *     same shape: dψ/db is 2·MAGNET_E·b in a weak field and MAGNET_E·MAGNET_BS
 *     in a strong one, so its linear law reaches its plateau at b = Bs/2 =
 *     0.074, which is 9 mT: about half of EFH1's 16.7 mT. MAGNET_BS is where the
 *     old dipole's 150 sat against the hand's field (wgsl/spikes.ts, PLAN 9v),
 *     carried over, not EFH1's, and it is kept here: it also sets how
 *     saturated the maze reads the field (phaseMu's sat), so every labyrinth
 *     look is tuned on it. The weak field is where the two laws are the same
 *     function up to one constant, so the gain is matched there: with
 *     ψ ≈ MAGNET_E · b² and U ≈ χᵢ B² / 2μ₀, one unit of ψ is
 *     (χᵢ / 2μ₀) · (SPIKE_B_REF · Br)² / MAGNET_E joules per m³. Nearer a
 *     magnet than 9 mT the solver's pull then falls under the real one, by
 *     about twice at the hand's magnet (b ≈ 1); the table prints the ratio
 *     at each magnet, and PLAN 29c-3 has the saturation as the shortcut it is.
 *     It never shows in the pull: nearer a magnet than 0.3 of the plate the
 *     pull asks for more than the per-step guard at any gain the plate has
 *     had (the table), so there the guard is the speed, not the gain.
 *
 *  3. The speed. Between two glasses a gap h apart the liquid's mean speed
 *     under a body force is Darcy's, f · h² / 12μ (wgsl/thinGap.ts, the
 *     header). hsPrep reads every body force as the speed it drives the
 *     *reference* liquid to at the rest gap (Thin Gap's default Thickness,
 *     ν_ref = 22 mm²/s, a light oil; h₀ = 6 mm): the force is k_ref · Δv with
 *     k_ref = 12 ν_ref / h₀², a step adds k_ref Δt of it, and the drag
 *     k = 12 ν / h² of the cell's own liquid is taken implicitly, so a cell
 *     of ferrofluid alone settles at Δv · ν_ref / ν_ff, and a drop of it in
 *     the clear liquid, which must move the clear liquid out of its way
 *     (the potential flow round a disc in a Hele-Shaw cell, whose drag adds
 *     in series: 12π U R² (μ_ff + μ_clear)), at Δv · ν_ref / (ν_ff + ν_clear).
 *     So Δv [m/s] = f · h₀² / (12 ρ ν_ref), with ρ the solver's liquid
 *     density, and in plate widths a second Δv / L.
 *
 *  4. The units. phaseForce adds f = GAIN · perStep · φ ∇ψ to the velocity,
 *     ∇ψ per plate width (a central difference over 2/n, times n/2), with
 *     perStep = seconds / disp: the solver's velocity moves a cell by
 *     v · disp plate widths a step, so perStep turns plate widths a second
 *     into it (MAGNET_CAP, "plate widths a second", is scaled by the same).
 *     Hence Δv [plate/s] = GAIN · ∇ψ, and GAIN is Δv per unit of ∇ψ, in
 *     plate widths a second per (ψ per plate width): seconds. Equating 3 and
 *     4 in the weak field,
 *
 *       GAIN_phys = (χᵢ / 2μ₀) · (SPIKE_B_REF · Br)² · h₀² / (12 ρ ν_ref L² · MAGNET_E),
 *
 *     which this prints, beside what MAGNET_GAIN is, and the pull each gives
 *     at the magnets the looks and the hand hold: B at the plate, ∇(B²), f,
 *     the Darcy speed of EFH1 alone, of a drop of it in water and in the
 *     default oil, and the solver's drop at MAGNET_GAIN.
 *
 * ## What it holds the solver to
 *
 * The derivation is only a claim until the solver does what step 3 says, so
 * the second half drags nothing and pushes nothing by hand: a drop of
 * ferrofluid at rest, a magnet switched on a tenth of the plate from it, and
 * the drop's speed read off its centroid once the drag time has passed
 * (ρh²/12μ, about a tenth of a second for the drop and oil together), against
 * GAIN · ⟨∇ψ⟩ · ν_ref / (ν_ff + ν_clear) with ⟨∇ψ⟩ the shader's own gradient
 * averaged over the drop's cells along the path the centroid took. The check
 * asks the two to agree within a third: the drop is eight cells across with a
 * three-cell grey rim whose drag is the geometric mean of the two liquids',
 * and the disc's drag law is for a sharp disc in an unbounded cell. It is
 * red if the force is read in other units than this says (a gain re-tuned
 * through hsPrep's Darcy factor read as 1 in ferrofluid cells, the ×180 of
 * #373's first round, would read 180× the speed), and red if the pull is
 * capped where it should not be (MAGNET_CELLS, printed).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const fmt = (x, d = 3) => (Number.isFinite(x) ? (Math.abs(x) >= 1e4 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(Math.max(0, d - 1)) : x.toFixed(d)) : String(x));

// ── The dish, the magnet and the ferrofluid in SI ──
const MU0 = 4e-7 * Math.PI;
/** An N52 neodymium rod's remanence, tesla: `strength` 1. */
const BR = 1.45;
/** Ferrotec EFH1 (its sheet): saturation 440 G as μ₀Ms, initial susceptibility 2.64 (SI), viscosity Pa·s, density kg/m³. */
const EFH1 = { ms: 0.044, chi: 2.64, mu: 6e-3, rho: 1210 };
/** Water, the clear liquid of a real dish, Pa·s. */
const MU_WATER = 1e-3;

// The magnet's geometry, as magnetDisc.ts sets it (and `npm run disc` checks).
const FACE = 0.06, MIN_GAP = 0.01, THICK = 4;
const gapOf = (h) => Math.max(h - FACE, MIN_GAP);
const centreOf = (h, a) => gapOf(h) + THICK * a / 2;

/*
  The field of a uniformly magnetised cylinder (radius a, length t, remanence
  1): a sheet of current round its side, summed by Biot–Savart, as disc.mjs
  does with nothing in common with the shader's closed form. 200 × 720 is
  within a few parts in 10⁵ of the 400 × 1440 disc.mjs uses, for the gaps here.
*/
const trig = new Map();
function biotSavart(rho, z, a, t, nz = 200, nphi = 720) {
  if (!trig.has(nphi)) trig.set(nphi, Array.from({ length: nphi }, (_, j) => [Math.cos((j + 0.5) * 2 * Math.PI / nphi), Math.sin((j + 0.5) * 2 * Math.PI / nphi)]));
  const cs = trig.get(nphi);
  let bx = 0, bz = 0;
  const dz = t / nz, dphi = 2 * Math.PI / nphi;
  for (let i = 0; i < nz; i++) {
    const rz = z - (-t / 2 + (i + 0.5) * dz);
    for (let j = 0; j < nphi; j++) {
      const [c, s] = cs[j];
      const rx = rho - a * c, ry = -a * s;
      const r2 = rx * rx + ry * ry + rz * rz, r3 = r2 * Math.sqrt(r2);
      const dlx = -a * s * dphi, dly = a * c * dphi;
      bx += dz * (dly * rz) / r3;
      bz += dz * (dlx * ry - dly * rx) / r3;
    }
  }
  return Math.hypot(bx, bz) / (4 * Math.PI);
}

/*
  The Langevin energy U(B) = ∫₀ᴮ M dB', J/m³, on a table: M = Ms L(ξ) with
  ξ = 3 χᵢ B / μ₀Ms, so the initial slope is χᵢ/μ₀ and the plateau Ms.
*/
const langevin = (x) => (x < 1e-4 ? x / 3 : 1 / Math.tanh(x) - 1 / x);
const U_TABLE = (() => {
  const n = 6000, bMax = 0.6, db = bMax / n, u = new Float64Array(n + 1);
  const ms = EFH1.ms / MU0;
  let acc = 0, prev = 0;
  for (let i = 1; i <= n; i++) {
    const b = i * db, m = ms * langevin(3 * EFH1.chi * b / EFH1.ms);
    acc += 0.5 * (prev + m) * db; prev = m; u[i] = acc;
  }
  return { u, db, n };
})();
const energyAt = (b) => {
  const { u, db, n } = U_TABLE, x = Math.min(Math.abs(b) / db, n - 1), i = Math.floor(x), f = x - i;
  return u[i] * (1 - f) + u[i + 1] * f;
};
const energyLinear = (b) => EFH1.chi * b * b / (2 * MU0);

const { page, close } = await openLab();
try {
  const K = await page.evaluate(() => ({
    bRef: lab.SPIKE_B_REF, radius: lab.MAGNET_RADIUS, E: lab.MAGNET_E, Bs: lab.MAGNET_BS, gain: lab.MAGNET_GAIN,
    cap: lab.MAGNET_CAP, cells: lab.MAGNET_CELLS, nuRef: lab.NU_REF, nuFf: lab.FERRO_NU, rho: lab.LIQUID_DENSITY,
    restGap: lab.REST_GAP, L: lab.PLATE_METRES,
  }));
  const L = K.L, h0 = K.restGap * L;
  const bRefT = K.bRef * BR;                    // the tesla value of share 1
  const muRef = K.rho * K.nuRef, muFf = K.rho * K.nuFf;
  const perPsi = (EFH1.chi / (2 * MU0)) * bRefT * bRefT / K.E;   // J/m³ per unit of ψ, weak field
  const darcyRef = h0 * h0 / (12 * muRef);      // m/s per N/m³, the reference liquid at the rest gap
  const gainPhys = perPsi * darcyRef / (L * L); // seconds: Δv [plate/s] per unit of ∇ψ [per plate]
  const inOil = K.nuRef / (K.nuFf + K.nuRef);   // a drop's speed over the reference speed, in the default clear liquid
  const alone = K.nuRef / K.nuFf;               // a cell of ferrofluid alone

  console.log(`\n  The dish: ${(L * 100).toFixed(0)} cm across, rest gap ${(h0 * 1e3).toFixed(1)} mm; the clear liquid ν_ref ${(K.nuRef * 1e6).toFixed(1)} mm²/s (μ ${fmt(muRef)} Pa·s at ρ ${K.rho}); the ferrofluid ν ${(K.nuFf * 1e6).toFixed(1)} mm²/s.`);
  console.log(`  The magnet: a ${(2 * K.radius * L * 1e3).toFixed(0)} by ${(THICK * K.radius * L * 1e3).toFixed(0)} mm rod, Br ${BR} T at strength 1. SPIKE_B_REF ${K.bRef.toFixed(5)} Br = ${(bRefT * 1e3).toFixed(1)} mT: share 1.`);
  console.log(`  The energy: ψ = ${fmt(K.E, 4)} b² / (1 + b / ${K.Bs.toFixed(4)}); its linear law meets its plateau at b = Bs/2 = ${(K.Bs / 2).toFixed(3)}, ${(K.Bs / 2 * bRefT * 1e3).toFixed(1)} mT, where EFH1's (μ₀Ms/χ) is ${(EFH1.ms / EFH1.chi * 1e3).toFixed(1)} mT (PLAN 29c-3).`);
  console.log(`  One unit of ψ is ${fmt(perPsi)} J/m³ (χ ${EFH1.chi}); Darcy's ${fmt(darcyRef)} m/s per N/m³ for the reference liquid at the rest gap.`);
  console.log(`  GAIN_phys = (χ/2μ₀)(SPIKE_B_REF·Br)² h₀² / (12 ρ ν_ref L² MAGNET_E) = ${gainPhys.toExponential(3)}; MAGNET_GAIN = ${K.gain.toExponential(3)}, ${(K.gain / gainPhys).toFixed(2)} of it.`);
  console.log(`  A drop goes at ${inOil.toFixed(2)} of the reference speed in the default oil (both drags in series), a cell of ferrofluid alone at ${alone.toFixed(2)}.\n`);

  /*
    The shader's own share and energy at points on the plate, run as its own
    text (SPIKES_WGSL), as disc.mjs does: b = magnetShare, ψ = magnetFieldEnergy(b).
  */
  const shader = (qs) => page.evaluate(async (qs) => {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const code = `${lab.SPIKES_WGSL}
struct Q { p: vec2f, radius: f32, pad: f32, m: vec4f }
@group(0) @binding(0) var<storage, read> qs: array<Q>;
@group(0) @binding(1) var<storage, read_write> outs: array<vec4f>;
var<private> R: f32;
fn magnetRadius() -> f32 { return R; }
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&qs)) { return; }
  let q = qs[i];
  R = q.radius;
  let b = magnetShare(q.p, q.m);
  outs[i] = vec4f(magnetDiscField(q.p, q.m, q.radius), b, magnetFieldEnergy(b), 0.0);
}`;
    const module = device.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    const errs = info.messages.filter((m) => m.type === 'error');
    if (errs.length) throw new Error(errs.map((m) => `${m.lineNum}: ${m.message}`).join('\n'));
    const pipe = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    const data = new Float32Array(qs.length * 8);
    qs.forEach((q, i) => data.set([q.x, q.y, q.radius, 0, q.mx, q.my, q.h, q.w], i * 8));
    const inBuf = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(inBuf, 0, data);
    const outBuf = device.createBuffer({ size: qs.length * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const read = device.createBuffer({ size: qs.length * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const bind = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipe); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(qs.length / 64)); pass.end();
    enc.copyBufferToBuffer(outBuf, 0, read, 0, qs.length * 16);
    device.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const out = Array.from(new Float32Array(read.getMappedRange().slice(0)));
    device.destroy();
    return qs.map((_, i) => ({ field: out[i * 4], share: out[i * 4 + 1], energy: out[i * 4 + 2] }));
  }, qs);

  /*
    The magnets the plate holds, each as the solver gets it (strength, and
    the depth m.z: the app's Magnet Height times 0.5 + Ferrofluid Scale,
    lib/magnetSize.ts). The hand's is the Magnet tool held (LiquidVisualizer:
    0.9, Height 0.15) at Magnet Garden's Scale 0.3; the looks' own are their
    presets'; the drop's is the scene `npm run ferrodrag` drags it with.
  */
  const scenes = [
    { name: 'the Magnet tool in the hand (0.9, depth 0.12)', w: 0.9, h: 0.15 * 0.8 },
    { name: 'the drop\'s dragged magnet, ferrodrag (0.4, depth 0.2)', w: 0.4, h: 0.2 },
    { name: 'Magnet Garden\'s own (0.9, depth 0.24)', w: 0.9, h: 0.3 * 0.8 },
    { name: 'Ferro Paint\'s own (0.6, depth 0.24)', w: 0.6, h: 0.3 * 0.8 },
    { name: 'Ferro Maze\'s own (0.45, depth 0.36)', w: 0.45, h: 0.4 * 0.9 },
  ];
  const D_RHO = 0.0025, RHOS = Array.from({ length: 181 }, (_, i) => i * D_RHO);
  const qs = scenes.flatMap((s) => RHOS.map((rho) => ({ x: 0.5 + rho, y: 0.5, radius: K.radius, mx: 0.5, my: 0.5, h: s.h, w: s.w })));
  const got = await shader(qs);
  const N_APP = 768, N_LAB = 384, HZ = 60;
  const capCells = (n) => K.cells * HZ / n;     // MAGNET_CELLS as plate widths a second at n², 60 steps a second
  console.log(`  MAGNET_CELLS ${K.cells} cells a step caps the reference speed at ${capCells(N_LAB).toFixed(3)} plate/s on ${N_LAB}² and ${capCells(N_APP).toFixed(3)} on ${N_APP}² (60 steps a second); MAGNET_CAP ${K.cap} plate/s.\n`);

  let shaderErr = 0;
  const rows = [];
  scenes.forEach((s, si) => {
    const z = centreOf(s.h, K.radius);
    const pts = RHOS.map((rho, i) => {
      const g = got[si * RHOS.length + i];
      const bUnit = biotSavart(rho, z, K.radius, THICK * K.radius);   // in units of Br
      shaderErr = Math.max(shaderErr, Math.abs(g.field / bUnit - 1));
      const B = s.w * bUnit * BR;                                     // tesla
      return { rho, B, share: g.share, psi: g.energy, uLang: energyAt(B), uLin: energyLinear(B) };
    });
    // Gradients along ρ, per plate width (ψ) and per metre (U), by central differences.
    const grad = (key, i) => (pts[Math.min(i + 1, pts.length - 1)][key] - pts[Math.max(i - 1, 0)][key]) / (D_RHO * (Math.min(i + 1, pts.length - 1) - Math.max(i - 1, 0)));
    const table = pts.map((p, i) => {
      const dpsi = Math.abs(grad('psi', i));                      // per plate width
      const fLang = Math.abs(grad('uLang', i)) / L;               // N/m³
      const fLin = Math.abs(grad('uLin', i)) / L;
      const gradB2 = Math.abs(grad('B', i) * 2 * p.B) / L;        // T²/m
      const uFf = fLang * h0 * h0 / (12 * EFH1.mu);               // EFH1 alone
      const uWater = fLang * h0 * h0 / (12 * (EFH1.mu + MU_WATER));
      const uOil = fLang * h0 * h0 / (12 * (EFH1.mu + muRef));
      const vRef = K.gain * dpsi;                                  // plate/s, the reference speed the solver asks for
      const vDrop = Math.min(vRef, capCells(N_LAB)) * inOil * L;   // m/s, the drop in the default oil at 384²
      return { ...p, dpsi, fLang, fLin, gradB2, uFf, uWater, uOil, vRef, vDrop, ratio: uOil / (vRef * inOil * L) };
    });
    const steep = table.reduce((m, r) => (r.dpsi > m.dpsi ? r : m), table[0]);
    const at = (rho) => table[Math.round(rho / D_RHO)];
    const line = (r, tag) => `    ${tag.padEnd(14)} ρ ${r.rho.toFixed(3)}: B ${(r.B * 1e3).toFixed(1)} mT (b ${r.share.toFixed(3)}), ∇B² ${fmt(r.gradB2)} T²/m, f ${fmt(r.fLang, 0)} N/m³ (linear ${fmt(r.fLin, 0)}); Darcy: EFH1 alone ${fmt(r.uFf)}, drop in water ${fmt(r.uWater)}, in the oil ${fmt(r.uOil)} m/s; the solver's ∇ψ ${fmt(r.dpsi, 0)}/plate → ${fmt(r.vRef)} plate/s ref, the drop ${fmt(r.vDrop)} m/s; physics/solver ${r.ratio.toFixed(1)}`;
    console.log(`  ${s.name}: B on the axis ${(pts[0].B * 1e3).toFixed(1)} mT, b ${pts[0].share.toFixed(3)}, ψ ${fmt(pts[0].psi, 0)}`);
    console.log(line(steep, 'steepest ∇ψ'));
    for (const rho of [0.05, 0.1, 0.2, 0.3]) console.log(line(at(rho), `at ${rho}`));
    console.log('');
    rows.push({ scene: s, table, steep });
  });

  check('the shader\'s field is the Biot–Savart field of the rod, where the pull is read', shaderErr < 2e-3,
    `worst ${(shaderErr * 100).toFixed(3)}% apart over ${qs.length} points`);
  /*
    The far field is where the two laws are both quadratic, so the ratio of
    the linear law's pull to the solver's there is GAIN_phys / MAGNET_GAIN
    exactly, up to the sampling: read at Ferro Maze's magnet, b ≈ 0.02 ≪ Bs.
    Against the linear law and not the Langevin one, because at Ferrotec's
    χ of 2.64 the Langevin energy is already 5% under its quadratic at
    2.3 mT (ξ = 3χB/μ₀Ms is 0.4 there), which is the fluid's own curvature
    and not the gain's units; the Langevin ratio is printed beside it.
  */
  const far = rows[4].steep;
  // The solver's ψ is under the quadratic by (1 + b/2Bs)/(1 + b/Bs)² in its slope, 0.84 at b 0.02.
  const sat = (1 + far.share / (2 * K.Bs)) / (1 + far.share / K.Bs) ** 2;
  const ratioLin = far.ratio * far.fLin / far.fLang;
  check('in the weak field the linear law\'s pull over the solver\'s is GAIN_phys over MAGNET_GAIN', Math.abs(ratioLin * sat / (gainPhys / K.gain) - 1) < 0.05,
    `${ratioLin.toFixed(3)} at Ferro Maze's magnet (b ${far.share.toFixed(3)}, where the solver's law is ${sat.toFixed(3)} of its quadratic), against ${(gainPhys / K.gain / sat).toFixed(3)}; the Langevin law's ${far.ratio.toFixed(3)}`);

  // ── The solver's drop against the Darcy speed ──
  /*
    Twice: under the drop's dragged magnet (0.4 at depth 0.2, ferrodrag's),
    where the pull must ask for less than the per-step guard allows, or the
    guard and not the physics is the drop's speed; and under a weak one
    (0.08), where the speed is Darcy's own. The centroid is read every two
    steps from the switch-on, so the drag time's rise shows beside the
    steady speed, which is taken over the last twenty steps of sixty: the
    ferrofluid's own drag time is ρh²/12μ_ff, 0.6 s, thirty-six steps, so
    the first thirty are still the rise (the first form of this read ten
    steps at thirty, a fifth under the steady speed).

    And whether the drop moves as a body: its rim's velocity against its
    core's, read off the velocity field at the end as the phase-weighted
    mean over every cell with any ferrofluid against the mean over the
    cells nine tenths full. Before the rim's force was read against the
    ferrofluid's own drag (phaseForce, PLAN 29c) the rim went at 0.55 of
    the core under the weak magnet and the centroid at 0.44 of the pull
    asked; with it, 0.81 and 0.68 at thirty steps.
  */
  const N = 384, R = 0.022, D = 0.1, H = 0.2, STEPS = 60, EVERY = 2, LAST = 10;
  const measure = async (W) => {
    const run = await page.evaluate(async ({ N, R, D, W, H, STEPS, EVERY }) => {
      const centroid = async () => {
        const p = await lab.phase();
        let s = 0, sx = 0, sy = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const v = p.data[j * N + i];
          if (v > 0.05) { s += v; sx += (i + 0.5) / N * v; sy += (j + 0.5) / N * v; }
        }
        return { x: sx / s, y: sy / s, mass: s };
      };
      await lab.create(N, N);
      lab.addPhase(0.5, 0.5, R, 1);
      const calm = { phaseSharp: 0.75, phaseDisplace: 0, thinGap: 1, magnetStrength: 0 };
      await lab.step(20, calm);
      const on = { ...calm, magnetStrength: W, magnetX: 0.5 + D, magnetY: 0.5, magnetHeight: H, magnetSeconds: 1 / 60 };
      const path = [await centroid()];
      for (let k = 0; k < STEPS / EVERY; k++) { await lab.step(EVERY, on); path.push(await centroid()); }
      const p = await lab.phase();
      const vel = await lab.field('vel');
      const cells = [];
      let coreU = 0, coreN = 0, rimU = 0, rimW = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const v = p.data[j * N + i];
        if (v > 0.05) cells.push([(i + 0.5) / N, (j + 0.5) / N, v]);
        if (v > 0.001) { const ux = vel[(j * N + i) * 4]; rimU += v * ux; rimW += v; if (v > 0.9) { coreU += ux; coreN++; } }
      }
      return { path, cells, body: coreN > 0 && rimW > 0 ? (rimU / rimW) / (coreU / coreN) : 0, core: coreN };
    }, { N, R, D, W, H, STEPS, EVERY });
    const last = run.path[run.path.length - 1];
    const window = run.path.slice(-LAST - 1);
    const measured = (window[window.length - 1].x - window[0].x) / (LAST * EVERY / 60);   // plate/s toward the magnet
    // The prediction along the window: the shader's ∇ψ·x̂ over the drop's cells, their shape from the end, at each sampled centroid.
    const pred = [];
    for (const c of window) {
      const h = 1 / N;
      const q = run.cells.flatMap(([x, y]) => [{ x: x - last.x + c.x + h, y: y - last.y + c.y }, { x: x - last.x + c.x - h, y: y - last.y + c.y }])
        .map((pt) => ({ ...pt, radius: K.radius, mx: 0.5 + D, my: 0.5, h: H, w: W }));
      const e = await shader(q);
      let s = 0, g = 0;
      run.cells.forEach(([, , v], i) => { s += v; g += v * (e[2 * i].energy - e[2 * i + 1].energy) * (0.5 * N); });
      const dpsi = g / s;
      pred.push({ dpsi, asked: K.gain * dpsi, v: Math.min(K.gain * dpsi, capCells(N)) * inOil });
    }
    const predicted = pred.reduce((t, p) => t + p.v, 0) / pred.length;
    const speeds = run.path.slice(1).map((c, i) => ((c.x - run.path[i].x) * N / EVERY).toFixed(2)).join(' ');
    console.log(`  Magnet ${W} at depth ${H}, ${D} of the plate from a drop r ${R} (${(R * L * 1e3).toFixed(1)} mm): the centroid's speed every ${EVERY} steps, cells a step: ${speeds}.`);
    console.log(`    Over the last ${LAST * EVERY} steps ${fmt(measured, 4)} plate/s (${(measured * L * 100).toFixed(2)} cm/s), ${(measured * N / 60).toFixed(2)} cells a step; the pull asked ${pred.map((p) => fmt(p.asked, 3)).join(', ')} plate/s (∇ψ ${fmt(pred[0].dpsi, 0)} to ${fmt(pred[pred.length - 1].dpsi, 0)} per plate), Darcy's drop ${fmt(predicted, 4)} plate/s; the rim at ${run.body.toFixed(2)} of the core's speed (${run.core} cells nine tenths full).`);
    return { measured, predicted, asked: Math.max(...pred.map((p) => p.asked)), body: run.body };
  };
  const strong = await measure(0.4);
  const weak = await measure(0.08);
  console.log(`  The real EFH1 drop in this oil would go ${fmt(rows[1].table[Math.round(0.08 / D_RHO)].uOil, 3)} m/s under the 0.4 magnet.`);
  check('under a magnet that asks less than the per-step guard, the drop moves at Darcy\'s speed for the Kelvin force: GAIN · ∇ψ · ν_ref / (ν_ff + ν_clear)',
    weak.asked < 0.9 * capCells(N) && Math.abs(weak.measured / weak.predicted - 1) < 0.34 && weak.measured > 0,
    `${fmt(weak.measured, 4)} measured against ${fmt(weak.predicted, 4)} predicted plate/s, ${((weak.measured / weak.predicted - 1) * 100).toFixed(0)}% apart (asked within 34%); the pull asked ${fmt(weak.asked, 3)} against the guard's ${capCells(N).toFixed(3)}`);
  check('and moves as a body: its rim goes at least 0.7 of its core\'s speed', weak.body >= 0.7,
    `the rim at ${weak.body.toFixed(2)} of the core (0.55 with the rim's force read against the mixed drag)`);
  check('under the drop\'s dragged magnet the pull asks no more than the guard, so the guard is not the speed law', strong.asked < capCells(N),
    `asked ${fmt(strong.asked, 3)} plate/s against MAGNET_CELLS's ${capCells(N).toFixed(3)} on ${N}²; the drop went ${fmt(strong.measured, 4)} plate/s against Darcy's ${fmt(strong.predicted, 4)}, its rim at ${strong.body.toFixed(2)} of its core`);
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
