/**
 * Today's lasting current, frozen as main had it at 50159cb (2026-11-08), for
 * `npm run plateboil`'s Heat 0 lines (PLAN 36e-2b). The Heat dial's claim is
 * that at 0 nothing a look does today changes, and the current is where the
 * first build (#718) broke it: Kell's density in place of the linear
 * `clamp(temp, 0, 50)` and the cap `maxCur` dropped, on any warm cell, at any
 * Heat. So the check runs the tree's own current against this one.
 *
 * Both are verbatim, generated from main's files rather than retyped:
 *
 *   - TODAY_CURRENT is the `currentForces:` entry of FORCE_KERNELS in
 *     src/gpu/wgsl/fluid/forces.ts, with one WGSL comment added (the marker the
 *     check finds in the control's bundle). TODAY_PLUGIN builds a lab whose
 *     forces.ts carries it in place of the tree's entry, and throws when the
 *     entry is not where it was, so a renamed kernel is loud and not a control
 *     identical to the plain lab.
 *   - todayCpuCurrent is the body of FluidSimulation.stepCurrent (the CPU
 *     solver's twin), with `this.` taken off the four arrays it reads.
 *
 * When a later PR changes the current on purpose (a new force at every Heat),
 * this file is what it changes, regenerated the same way, and the PR names it
 * under "Check changes:". It never changes to let a heat build through.
 */
import { readFile } from 'node:fs/promises';

export const TODAY_MARK = "plateboil: today's current";

export const TODAY_CURRENT = "  currentForces: `${HEAD}${BILERP_N}\n// plateboil: today's current, main at 50159cb (scripts/plateboil-today.mjs)\n@group(0) @binding(2) var cur: texture_2d<f32>;\n@group(0) @binding(3) var vel: texture_2d<f32>;\n@group(0) @binding(4) var dye: texture_2d<f32>;\n@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;\n${W} fn main(@builtin(global_invocation_id) id: vec3u) {\n  let m = A.a.y;                                  // this pass runs on the M grid\n  if (id.x >= u32(m) || id.y >= u32(m)) { return; }\n  let q = vec2i(id.xy);\n  let uv = (vec2f(id.xy) + 0.5) / m;\n  var c = textureLoad(cur, q, 0).xy;\n  let temp = bilerpN(vel, uv, S.n).z;\n  /*\n    Buoyancy is linear with temperature (Boussinesq, PLAN §18f), with the tanh\n    removed so plumes have a strength proportional to their heat rather than\n    saturating at once. S.up is gated on upright, so a level plate has no in-plane\n    buoyancy.\n  */\n  let dd = tanh(clamp(bilerpN(dye, uv, S.n).a - S.meanD, -10.0, 10.0));\n  var f = S.up * (S.curBuoy * clamp(temp, 0.0, 50.0));\n  f += S.rock * dd;\n  let toC = vec2f(0.5) - uv;\n  let r = length(toC);\n  if (r > 1e-4) { f += (toC / r) * (S.curGrav * dd); }\n  c = c * S.curDamp + f * (1.0 - S.curDamp);\n  let s = length(c);\n  if (s > S.maxCur) { c *= S.maxCur / s; }\n  textureStore(dst, q, select(vec4f(0.0), vec4f(c, 0.0, 0.0), finite2(c)));\n}`,";

export const TODAY_PLUGIN = {
  name: 'plateboil-today-current',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]fluid[\\/]forces\.ts$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      const head = '  currentForces: `';
      const start = src.indexOf(head);
      const end = start < 0 ? -1 : src.indexOf('\n}`,', start);
      if (start < 0 || end < 0 || src.indexOf(head, start + 1) >= 0) {
        throw new Error('plateboil: the currentForces entry is not where it was in src/gpu/wgsl/fluid/forces.ts');
      }
      return { contents: src.slice(0, start) + TODAY_CURRENT + src.slice(end + 4), loader: 'ts' };
    });
  },
};

/**
 * The lines of src/gpu/fluid.ts that pack the uniforms today's current reads
 * (S.curDamp, S.curBuoy as upright × Buoyancy, S.curGrav, S.meanD, S.maxCur,
 * S.rock), as main had them: the control lab shares the tree's fluid.ts, so
 * the check holds these to today's text.
 *
 * Changed on purpose by PLAN 27f-9 (a standing plate is a sealed bottle): on
 * a thin gap with Plate Upright above nothing, once the seal's kernels are
 * built and with no boil live, S.curBuoy is 0 and the same heat lift is laid
 * by the seal as the closed cell's circulation (wgsl/fluid/seal.ts), so it no
 * longer runs out of the open rim. `sealsHeat` is false during a boil and on
 * every level or open plate, so the current's Buoyancy at every Heat is today's
 * wherever the seal does not run, and the Heat 0 lines below still compare it
 * byte for byte.
 */
export const TODAY_PACK = [
  "    f[22] = fin(p.currentDamp, 0.98); f[23] = sealsHeat ? 0 : upright * fin(p.currentBuoy, 0); f[24] = fin(p.currentGrav, 0); f[25] = fin(p.cometX, 0);",
  "    f[26] = fin(p.meanDensity, 0); f[27] = fin(p.maxCurrent, 0.002);",
  "    f[28] = thin ? 0 : fin(p.rockX, 0); f[29] = thin ? 0 : fin(p.rockY, 0);"
];

const c01 = (v) => Math.max(0, Math.min(1, v ?? 0));

/** FluidSimulation.stepCurrent as main had it: M the current's grid (S / 2), S the plate's. */
export function todayCpuCurrent(M, S, cvx, cvy, cpr, cdv, density, temp, vx, vy, p) {
    for (let j = 1; j < M - 1; j++) {
      for (let i = 1; i < M - 1; i++) {
        const k = i + j * M;
        const q = Math.min(S - 2, i * 2) + Math.min(S - 2, j * 2) * S;
        const dd = Math.tanh(density[q] - p.meanDensity);   // saturated (see the GPU twin)
        const upright = c01(p.plateUpright ?? 0);
        let fx = p.rockX * dd;
        let fy = upright * p.currentBuoy * Math.min(50, Math.max(0, temp[q])) + p.rockY * dd;   // Boussinesq linear in temperature, gated on upright (see the GPU twin)
        const tx = 0.5 - (i + 0.5) / M, ty = 0.5 - (j + 0.5) / M;
        const r = Math.sqrt(tx * tx + ty * ty);
        if (r > 1e-4) { fx += (tx / r) * p.currentGrav * dd; fy += (ty / r) * p.currentGrav * dd; }
        // Relax toward the flow the forces ask for (see the GPU twin).
        let vx = cvx[k] * p.currentDamp + fx * (1 - p.currentDamp);
        let vy = cvy[k] * p.currentDamp + fy * (1 - p.currentDamp);
        const s = Math.sqrt(vx * vx + vy * vy);
        if (s > p.maxCurrent) { vx *= p.maxCurrent / s; vy *= p.maxCurrent / s; }
        cvx[k] = vx; cvy[k] = vy;
      }
    }
    // Walls: no flow through them.
    for (let i = 0; i < M; i++) { cvx[i] = cvy[i] = cvx[i + (M - 1) * M] = cvy[i + (M - 1) * M] = 0; cvx[i * M] = cvy[i * M] = cvx[M - 1 + i * M] = cvy[M - 1 + i * M] = 0; }
    for (let j = 1; j < M - 1; j++) for (let i = 1; i < M - 1; i++) {
      const k = i + j * M;
      cdv[k] = -0.5 * (cvx[k + 1] - cvx[k - 1] + cvy[k + M] - cvy[k - M]) / M;
    }
    for (let it = 0; it < 10; it++) {
      for (let j = 1; j < M - 1; j++) for (let i = 1; i < M - 1; i++) {
        const k = i + j * M;
        cpr[k] = (cdv[k] + cpr[k - 1] + cpr[k + 1] + cpr[k - M] + cpr[k + M]) * 0.25;
      }
      for (let i = 0; i < M; i++) { cpr[i] = cpr[i + M]; cpr[i + (M - 1) * M] = cpr[i + (M - 2) * M]; cpr[i * M] = cpr[1 + i * M]; cpr[M - 1 + i * M] = cpr[M - 2 + i * M]; }
    }
    for (let j = 1; j < M - 1; j++) for (let i = 1; i < M - 1; i++) {
      const k = i + j * M;
      cvx[k] -= 0.5 * (cpr[k + 1] - cpr[k - 1]) * M;
      cvy[k] -= 0.5 * (cpr[k + M] - cpr[k - M]) * M;
    }
    // Into the velocity the dye is carried by, sampled up to the logical grid.
    for (let j = 1; j < S - 1; j++) {
      const y = j * 0.5 - 0.25, j0 = Math.max(0, Math.min(M - 2, Math.floor(y))), fyy = c01(y - j0);
      for (let i = 1; i < S - 1; i++) {
        const x = i * 0.5 - 0.25, i0 = Math.max(0, Math.min(M - 2, Math.floor(x))), fxx = c01(x - i0);
        const k = i0 + j0 * M;
        const ux = (cvx[k] * (1 - fxx) + cvx[k + 1] * fxx) * (1 - fyy) + (cvx[k + M] * (1 - fxx) + cvx[k + M + 1] * fxx) * fyy;
        const uy = (cvy[k] * (1 - fxx) + cvy[k + 1] * fxx) * (1 - fyy) + (cvy[k + M] * (1 - fxx) + cvy[k + M + 1] * fxx) * fyy;
        vx[i + j * S] += ux;
        vy[i + j * S] += uy;
      }
    }

}
