/**
 * Two more owed lines in `npm run encode`, for solver items Antigravity builds
 * from a number (PLAN docs/plan/40-specs-frame-gig-desk.md, H2c-5 and H2c-8),
 * written in a module beside encode-solve.mjs so that each stays small.
 *
 * Each line is printed as owed while it fails and is red the day it passes
 * with its id still in `--owed` (scripts/checks.json), so the PR that ships one
 * takes its id out and never edits the line; a build that is there and misses
 * is red, owed or not (the convention of encode-solve.mjs and rungs-owed.mjs).
 *
 * H2c-5, first-order velocity. The open plate's step carries the velocity by
 * MacCormack (`advect velocity` in src/gpu/fluid.ts, `macCormack` in
 * fluid/passes.ts): a forward and a backward `advect` and the correction, three
 * full-grid dispatches on the velocity's format, where a first-order
 * semi-Lagrangian carry is one `advect`. The CPU solver already carries
 * velocity first order ("costs a third of the step on a field nobody sees
 * directly"). The dye keeps MacCormack, because the dye is what is seen: so
 * the line asks for the velocity's passes to fall to one *and* for the dye's
 * corrections to be as many as main's, so a build that dropped MacCormack
 * from everything is not a pass. Counted by kernel label on the velocity's
 * format (`:rgba16float`) against the dye's, and by the step's total, so work
 * moved under another name is still seen. The thin gap (where every look
 * opens) carries velocity through the conserving carries and is not touched
 * by this item. The sharpness of the dye (`npm run ab`) and the viscosity the
 * first-order carry adds (`npm run physics`) are the build's to print.
 *
 * H2c-8, air only where there are bubbles. Every layer allocates an
 * rgba16float air pair (4 MiB at 512²) on its first step and clears one of
 * them with a render pass on every step after (`WebGPUAir.splat`, its load op
 * is the clear), background layers that never get a bubble included. The line
 * steps a plate that has never had a bubble and asks for no air pass on its
 * steps and no air texture alive. Counted from the GPU calls themselves, not
 * from the solver's fields: textures whose label names air, alive from their
 * creation to their `destroy`, and render passes either labelled air or
 * drawing into one of those textures, so a pass renamed is still a pass. The
 * control, which holds on main and after: one bubble set on the same plate is
 * stamped (an air pass on every step and the pair alive), so the counting can
 * see what it is counting, and the build cannot pass by never stamping air.
 * `npm run bubblephysics` and `npm run pops` unchanged are the build's own.
 */

/*
  Main's numbers, read by this file on 2026-11-07 at 512² under the lab
  (SwiftShader). The open plate's step: 500 dispatches, of them four
  MacCormack corrections (the velocity, the dye, the two liquids: three
  `macCormack:rgba16float` and one `:rgba32float`, so the format cannot tell
  the velocity's from a liquid's, so each carry is told by whether its bind
  group holds the velocity's own pair; the check-skeptic found a count of
  totals passing a build that dropped the dye's correction) and nine
  semi-Lagrangian `advect`s (two for each of those four, one for the grain).
  First-order velocity is the velocity's 1 and 2 become 0 and 1, the others'
  3 and 7 unchanged, the step two dispatches lighter. Air on a plate with
  no bubble: one pass a step and two textures alive.
*/
const MAIN_OPEN = 500;
const MAIN_REST_CORRECTIONS = 3; // the dye's and the two liquids'
const MAIN_REST_CARRIES = 7; // two for each of those, one for the grain

export const ENCODE_OWED = ['h2c5', 'h2c8'];

/**
 * Installed before the lab makes its solver (the air pair is made on the
 * first step), in the page: counts the air textures alive and the air passes
 * while `window.__air.on`.
 */
export const installAirCounter = () => {
  const live = new Set();
  const viewOf = new WeakMap();
  const air = (window.__air = { live, passes: 0, on: false });
  const isAir = (label) => /\bair\b/i.test(label ?? '');
  const make = GPUDevice.prototype.createTexture;
  GPUDevice.prototype.createTexture = function (d) {
    const t = make.call(this, d);
    if (isAir(d?.label)) live.add(t);
    return t;
  };
  const destroy = GPUTexture.prototype.destroy;
  GPUTexture.prototype.destroy = function () { live.delete(this); return destroy.call(this); };
  const view = GPUTexture.prototype.createView;
  GPUTexture.prototype.createView = function (...a) { const v = view.apply(this, a); viewOf.set(v, this); return v; };
  /*
    And for H2c-5: which textures each bind group binds, and the group a
    compute pass last set, so a carry can be told by the field it moves
    (the velocity's bind its own textures; the dye's and the liquids' carry
    by the forced flow, never by the velocity's own pair).
  */
  const groupTex = (window.__groupTex = new WeakMap());
  const group = GPUDevice.prototype.createBindGroup;
  GPUDevice.prototype.createBindGroup = function (d) {
    const g = group.call(this, d);
    groupTex.set(g, new Set((d?.entries ?? []).map((e) => viewOf.get(e.resource)).filter(Boolean)));
    return g;
  };
  const setGroup = GPUComputePassEncoder.prototype.setBindGroup;
  GPUComputePassEncoder.prototype.setBindGroup = function (i, g, ...rest) { this.__tex = groupTex.get(g); return setGroup.call(this, i, g, ...rest); };
  const begin = GPUCommandEncoder.prototype.beginRenderPass;
  GPUCommandEncoder.prototype.beginRenderPass = function (d) {
    if (air.on && (isAir(d?.label) || (d?.colorAttachments ?? []).some((c) => c && live.has(viewOf.get(c.view))))) air.passes++;
    return begin.call(this, d);
  };
};

export async function owedLines(page, check) {
  const flag = process.argv.find((a) => a.startsWith('--owed='));
  const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
  const line = (id, name, ok, detail, mainState) => {
    if (!owed.has(id)) return check(name, ok, detail);
    if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
    if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
    console.log(` owed  ${name} — ${detail}`);
  };

  const r = await page.evaluate(async () => {
    const s = lab.solver();
    const { counts } = window.__encode;
    const air = window.__air;
    // The plate as encode left it, never given a bubble: its air, over four thin steps.
    air.passes = 0; air.on = true;
    await lab.step(4, { thinGap: 1, immiscibility: 0.5 });
    air.on = false;
    const bare = { passes: air.passes / 4, live: air.live.size };
    // The open plate's step by kernel, four of them, each carry told by whether it binds the velocity's own pair.
    const velPair = new Set([s.vel.read, s.vel.write]);
    const tagged = { vel: { corrections: 0, carries: 0 }, rest: { corrections: 0, carries: 0 } };
    const dispatch = GPUComputePassEncoder.prototype.dispatchWorkgroups;
    GPUComputePassEncoder.prototype.dispatchWorkgroups = function (...a) {
      const k = this.__kernel ?? '';
      const kind = /^macCormack/.test(k) ? 'corrections' : /^advect/.test(k) ? 'carries' : null;
      if (counts.on && kind) tagged[[...(this.__tex ?? [])].some((t) => velPair.has(t)) ? 'vel' : 'rest'][kind]++;
      return dispatch.apply(this, a);
    };
    counts.dispatches = 0; counts.indirect = 0; counts.by = {}; counts.on = true;
    try { await lab.step(4, { thinGap: 0, immiscibility: 0.5 }); } finally { counts.on = false; GPUComputePassEncoder.prototype.dispatchWorkgroups = dispatch; }
    for (const f of Object.values(tagged)) for (const k of Object.keys(f)) f[k] /= 4;
    const open = { dispatches: (counts.dispatches + counts.indirect) / 4, by: Object.fromEntries(Object.entries(counts.by).map(([k, v]) => [k, v / 4])), tagged };
    // The control: one bubble on the same plate, stamped on each step.
    s.setBubbles(new Float32Array([0.5, 0.5, 0.06, 1]), 1, 0.05, new Float32Array(4));
    air.passes = 0; air.on = true;
    await lab.step(4, { thinGap: 1, immiscibility: 0.5 });
    air.on = false;
    const bubble = { passes: air.passes / 4, live: air.live.size };
    s.setBubbles(new Float32Array(4), 0, 0.05);
    await lab.step(2, { thinGap: 1, immiscibility: 0.5 });
    return { bare, open, bubble };
  });

  const { vel, rest } = r.open.tagged;
  console.log(`  the open plate's step: ${r.open.dispatches.toFixed(0)} dispatches (main ${MAIN_OPEN}); the velocity's ${vel.corrections} MacCormack corrections and ${vel.carries} carries (main 1 and 2), the dye's, liquids' and grain's ${rest.corrections} and ${rest.carries} (main ${MAIN_REST_CORRECTIONS} and ${MAIN_REST_CARRIES}): ${JSON.stringify(Object.fromEntries(Object.entries(r.open.by).filter(([l]) => /^(advect|macCormack)/.test(l))))}`);
  console.log(`  air: a plate never given a bubble makes ${r.bare.passes} air passes a step with ${r.bare.live} air textures alive; with one bubble ${r.bubble.passes} a step and ${r.bubble.live} alive`);

  check('control: a bubble on the plate is stamped, an air pass on every step and its texture alive', r.bubble.passes >= 1 && r.bubble.live >= 1,
    `${r.bubble.passes} passes a step, ${r.bubble.live} alive`);
  check('control: the counting tells the velocity\'s carry from the others\'', vel.carries + vel.corrections >= 1 && rest.corrections >= 1,
    `velocity ${vel.carries + vel.corrections}, the others ${rest.carries + rest.corrections}`);
  line('h2c5', 'H2c-5: the open plate carries velocity first order (no MacCormack correction, one carry), every other field still corrected as on main, the step two dispatches lighter',
    vel.corrections === 0 && vel.carries === 1 && rest.corrections === MAIN_REST_CORRECTIONS && rest.carries === MAIN_REST_CARRIES && r.open.dispatches <= MAIN_OPEN - 2,
    `velocity ${vel.corrections} corrections and ${vel.carries} carries (want 0 and 1), the others ${rest.corrections} and ${rest.carries} (want ${MAIN_REST_CORRECTIONS} and ${MAIN_REST_CARRIES}), ${r.open.dispatches.toFixed(0)} dispatches (at most ${MAIN_OPEN - 2})`,
    vel.corrections === 1 && vel.carries === 2);
  line('h2c8', 'H2c-8: a plate that never had a bubble makes no air pass a step and keeps no air texture',
    r.bare.passes === 0 && r.bare.live === 0,
    `${r.bare.passes} passes a step, ${r.bare.live} air textures alive (main 1 and 2)`,
    r.bare.passes === 1 && r.bare.live === 2);
}
