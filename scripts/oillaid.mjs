#!/usr/bin/env node
/**
 * Does a look's oil reach the solver whenever the look is laid, and not only
 * when a solver happens to be attached already? (PLAN.md 27f-9m)
 *
 *   npm run oillaid                (both halves; the app's wants a GPU that
 *                                   presents WebGPU, a Mac)
 *   npm run oillaid -- --node      (the simulation's side only, anywhere)
 *
 * Reported 2026-11-12: on the Mac the Lava Lamp's wax smeared into streaks and
 * folded sheets, where the lab's lamp holds fat round blobs. Measured in the
 * app on the Mac, the look opened with the page as every film of it had been
 * (`?look=lava-lamp`): the solver's mix field held no oil at all, zero cells
 * of wax for 150 seconds, and no oil-dye field existed. The wax was never
 * there. What was filmed was the wax's dye alone, a passive colour in water,
 * stirred by the lamp's convection, and a passive colour has no interface to
 * pull it round: it is drawn into streaks, which is what dye does.
 *
 * Why: `seedPreset` laid the three oil looks' oil with `this.gpu?.addMix?.()`.
 * The app lays its opening look before the GPU solver is built, so `gpu` was
 * null, the oil was dropped without a word and the dye still landed (the dye
 * goes into the CPU arrays, which become the solver's opening state). The same
 * look picked from the desk a second later had its wax. The lab lays the oil
 * on its solver directly, which is why every lab check of the lamp was green.
 *
 * The feature is "a laid look's oil is in the solver that runs it", so:
 *
 * The simulation's side, in node: the real FluidSimulation and a stand-in
 * solver that holds the oil it is handed as the real one does (a `clear`
 * empties it, a carry hands it on). For each oil look (Lava Lamp, Clock Glass,
 * Splodascope):
 *   - laid with a solver attached (the path that always worked), the solver
 *     holds some oil, and Lava Lamp's is its four bodies exactly;
 *   - laid before any solver, then a solver attached: it holds the same oil,
 *     splat for splat;
 *   - that solver dropped before it has spoken (out of memory on the first
 *     rung, which is `dropGpu(true)`) and a smaller one attached: the same;
 *   - the solver spoken and swapped for another grid (the governor's regrid):
 *     the next holds the same oil once, by the carry, and is not laid again;
 *   - and swapped before it has spoken: once still, not the carry's and the
 *     waiting oil's both.
 * Controls: a look with no oil lays none either way; a plate cleared before
 * its solver came holds none of the cleared look's oil; and two looks laid
 * with no clear between them both wait, so it is the clear that empties.
 * And a look change by fade, which wipes the chemistry and not the plate,
 * leaves the new look's oil only, with a solver or before one.
 *
 * The app's side, on the built app: each oil look opened with the page holds
 * the oil the same look holds when it is laid a second time on the running
 * page, and Lava Lamp's is the area of its four bodies. Read two ways, because
 * the field alone cannot see oil laid twice (a cell is full at 1, and a second
 * body on the first changes nothing in it): the mix field's oil summed over
 * the grid, and the solver's own count of the oil poured into it, which a
 * second lay doubles.
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const nodeOnly = process.argv.includes('--node');
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const OIL_LOOKS = ['lava-lamp', 'clock-glass', 'splodascope'];

// ── The simulation's side ─────────────────────────────────────────────
// The GPU's usage flags, which the solver's modules read at load; nothing here makes a texture.
globalThis.GPUTextureUsage = { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
globalThis.GPUBufferUsage = { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
globalThis.GPUMapMode = { READ: 1, WRITE: 2 };
globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const out = 'node_modules/.cache/oillaid-sim.mjs';
await build({
  stdin: { contents: "export { FluidSimulation } from './src/sim/fluidSimulation';\nexport { LAVA_BODIES } from './src/lib/oilLay';\nexport { restartStreams } from './src/lib/rng';\nexport { GRID_SIZE } from './src/sim/constants';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
});
const { FluidSimulation, LAVA_BODIES, restartStreams, GRID_SIZE } = await import(pathToFileURL(`${process.cwd()}/${out}`).href);
const AREA = GRID_SIZE * GRID_SIZE;
const noise = (x, y) => Math.sin(x * 12.9898 + y * 78.233);

/**
 * A solver that holds oil as the real one does, as far as this check asks:
 * what `addMix` hands it stays until a `clear` (core.ts zeroes the mix) or a
 * `clearChemistry`, and `handOver` and `takeOver` carry it to the next grid.
 * `laid` counts the `addMix` calls it was given itself, which a carry is not.
 * Every call is kept as it was made, the oil, the soap and the acid of it:
 * Splodascope lays holes too (`oil: -1`, water cut back out of a body), and
 * a stand-in that kept only the positive ones would call two plates the same
 * when one had lost its holes.
 */
function standIn() {
  const oil = [];
  const dye = new Float32Array(AREA * 4), vel = new Float32Array(AREA * 4);
  const s = {
    oil, laid: 0, N: 64,
    thinGapLive: true, phaseIsLive: false,
    rbDyeView: dye, rbVelView: vel, rbDyeIssued: 1, rbDyeLanded: 1,
    clear() { oil.length = 0; },
    clearChemistry() { oil.length = 0; },
    addMix(x, y, r, what) { oil.push([x, y, r, what.oil ?? 0, what.soap ?? 0, what.acid ?? 0]); s.laid++; },
    handOver() { const held = oil.map((o) => o.slice()); return { held, destroy() {} }; },
    takeOver(c) { for (const o of c.held) oil.push(o.slice()); return true; },
    readback() { return { dye, vel }; },
    readbackAsync() { return true; },
    applyDeltas() {},
    dispose() {},
  };
  return s;
}
const newSim = () => new FluidSimulation(GRID_SIZE, 0, 0, 0.1);
/** Lay a look as the visualizer does: the plate cleared, the dice restarted, the look seeded. */
const lay = (sim, look) => { sim.clearAll(); restartStreams(`lay:${look}`, 'plate.'); sim.seedPreset(look, noise); };
const same = (a, b) => a.length === b.length && a.every((o, i) => o.every((v, k) => v === b[i][k]));
const area = (oil) => oil.reduce((a, o) => a + Math.PI * o[2] * o[2] * o[3], 0);
/** How many of a solver's splats carry oil, a body or a hole. */
const oily = (oil) => oil.filter((o) => o[3] !== 0).length;

const per = {};
for (const look of OIL_LOOKS) {
  // Laid with a solver attached: the path that always worked.
  const live = newSim(), liveGpu = standIn();
  live.attachGpu(liveGpu); lay(live, look);
  // Laid before any solver, then attached.
  const early = newSim(), earlyGpu = standIn();
  lay(early, look); early.attachGpu(earlyGpu);
  // The first solver dropped before it spoke (out of memory), a smaller one attached.
  const oom = newSim(), big = standIn(), small = standIn();
  lay(oom, look); oom.attachGpu(big); oom.dropGpu(true); oom.attachGpu(small);
  // The first solver spoken, then swapped for another grid.
  const regrid = newSim(), first = standIn(), second = standIn();
  lay(regrid, look); regrid.attachGpu(first); regrid.syncFromGpu(); regrid.attachGpu(second);
  // The first solver swapped for another grid before it has spoken: its oil crosses by the carry, and what
  // was put back to wait beside the seed must not be laid on top of it.
  const quick = newSim(), q1 = standIn(), q2 = standIn();
  lay(quick, look); quick.attachGpu(q1); quick.attachGpu(q2);
  per[look] = { live: liveGpu.oil, early: earlyGpu.oil, oom: small.oil, regrid: second.oil, relaid: second.laid, quick: q2.oil };
  console.log(`  ${look}: with a solver ${liveGpu.oil.length} bodies (area ${area(liveGpu.oil).toFixed(4)} of the plate); laid first, then a solver ${earlyGpu.oil.length}; after a solver that never spoke ${small.oil.length}; after a regrid ${second.oil.length} (${second.laid} laid again)`);
}
check('laid with a solver attached, each oil look puts oil in it',
  OIL_LOOKS.every((l) => oily(per[l].live) > 0 && area(per[l].live) > 0), OIL_LOOKS.map((l) => `${l} ${oily(per[l].live)}`).join(', '));
check("Lava Lamp's oil is its four bodies, each where and as wide as oilLay.ts puts it",
  same(per['lava-lamp'].live, LAVA_BODIES.map((b) => [b.x, b.y, b.r, 1, 0, 0])), `${per['lava-lamp'].live.length} against ${LAVA_BODIES.length}`);
check('laid before any solver, the solver attached afterwards holds the same oil, splat for splat',
  OIL_LOOKS.every((l) => same(per[l].early, per[l].live)), OIL_LOOKS.map((l) => `${l} ${per[l].early.length}/${per[l].live.length}`).join(', '));
check('a first solver dropped before it spoke (out of memory) leaves the next the same oil',
  OIL_LOOKS.every((l) => same(per[l].oom, per[l].live)), OIL_LOOKS.map((l) => `${l} ${per[l].oom.length}/${per[l].live.length}`).join(', '));
check('a regrid carries the oil across once: the next solver holds the same and is not laid again',
  OIL_LOOKS.every((l) => same(per[l].regrid, per[l].live) && per[l].relaid === 0), OIL_LOOKS.map((l) => `${l} ${per[l].regrid.length}/${per[l].live.length}, ${per[l].relaid} laid again`).join(', '));
check('a regrid before the first solver has spoken does not lay the oil twice (the carry has it)',
  OIL_LOOKS.every((l) => same(per[l].quick, per[l].live)), OIL_LOOKS.map((l) => `${l} ${per[l].quick.length}/${per[l].live.length}`).join(', '));

// Controls.
{
  const a = newSim(), ga = standIn(); a.attachGpu(ga); lay(a, 'classic');
  const b = newSim(), gb = standIn(); lay(b, 'classic'); b.attachGpu(gb);
  check('a look with no oil lays none, with a solver or before one', oily(ga.oil) === 0 && oily(gb.oil) === 0, `${oily(ga.oil)} and ${oily(gb.oil)}`);
  const c = newSim(), gc = standIn(); lay(c, 'lava-lamp'); lay(c, 'classic'); c.attachGpu(gc);
  check('a plate cleared before its solver came keeps none of the cleared look\'s oil', oily(gc.oil) === 0, `${oily(gc.oil)}`);
  // No clear between them: both wait, so it is clearAll that empties, not the second lay.
  const d = newSim(), gd = standIn(); lay(d, 'lava-lamp'); restartStreams('lay:clock-glass', 'plate.'); d.seedPreset('clock-glass', noise); d.attachGpu(gd);
  check('and it is the clear that empties: two looks laid with none between them both wait',
    oily(gd.oil) === oily(per['lava-lamp'].live) + oily(per['clock-glass'].live), `${oily(gd.oil)} against ${oily(per['lava-lamp'].live)} + ${oily(per['clock-glass'].live)}`);
  /*
    A look change by fade (Go) does not clear the plate: the old dye thins
    while the new look rises from a captured seed, and only the chemistry is
    wiped, by `clearChemistry`, before the new look is laid (the visualizer's
    handoff). With no solver yet (a Go in the page's first second, or after a
    lost device) the old look's oil is still waiting, and a wipe that reached
    only the solver left it there to be laid under the new look's.
  */
  const e = newSim(), ge = standIn();
  lay(e, 'lava-lamp'); e.clearChemistry(); e.liquid.clear();
  restartStreams('lay:clock-glass', 'plate.'); e.captureSeed(() => { e.seedPreset('clock-glass', noise); });
  e.attachGpu(ge);
  check('a fade to another look before any solver leaves the solver the new look\'s oil only',
    same(ge.oil, per['clock-glass'].live), `${oily(ge.oil)} against Clock Glass's ${oily(per['clock-glass'].live)} (Lava Lamp's ${oily(per['lava-lamp'].live)} wiped)`);
  // And with a solver attached, where the wipe always reached: the same answer.
  const f = newSim(), gf = standIn(); f.attachGpu(gf);
  lay(f, 'lava-lamp'); f.clearChemistry(); f.liquid.clear();
  restartStreams('lay:clock-glass', 'plate.'); f.captureSeed(() => { f.seedPreset('clock-glass', noise); });
  check('and the same fade with a solver attached', same(gf.oil, per['clock-glass'].live), `${oily(gf.oil)} against ${oily(per['clock-glass'].live)}`);
}

// ── The app's side ────────────────────────────────────────────────────
if (!nodeOnly) {
  const { chromium } = await import('playwright');
  const { launchChromium, port, untilServing } = await import('./chromium.mjs');
  const { engineQuery } = await import('./frame.mjs');
  const PORT = port(4397);
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'ignore', 'inherit'], detached: true });
  const stop = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ } };
  process.on('exit', stop);
  for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
  // Until the server answers, and an error that names itself if it exits first (ports.mjs).
  console.log(`  preview answering after ${(await untilServing(PORT, { child: server })).toFixed(1)} s`);
  const browser = await launchChromium(chromium, { headless: true });
  /*
    The oil the solver holds, as a share of the plate: the mix field's oil
    channel summed over its own grid. No fallback: a solver with no mix field,
    or a hook renamed, throws, and does not read as "no oil" (or as "the same
    as the other reading", which would pass the comparison below on nothing).
  */
  const oilShare = (page) => page.evaluate(async () => {
    const gpu = window.chromaglassDebug().fluids[0].gpu;
    if (!gpu) throw new Error('no solver attached');
    const r = await gpu.readChemistry('mix');
    // The solver's own count of the oil poured into it, as a share of the plate (fields.ts): a number, or this throws.
    const poured = gpu.oilCover;
    if (typeof poured !== 'number' || !Number.isFinite(poured)) throw new Error(`the solver's oil count reads ${poured}`);
    if (!r) return { share: 0, poured, n: gpu.N, field: false };
    const n = Math.round(Math.sqrt(r.data.length / 4));
    let sum = 0;
    for (let i = 0; i < n * n; i++) sum += r.data[i * 4];
    return { share: sum / (n * n), poured, n, field: true };
  });
  const stepped = (page, more) => page.evaluate(async (k) => {
    const f = () => window.chromaglassDebug?.().fluids?.[0];
    const t0 = performance.now();
    while (!f()?.gpu && performance.now() - t0 < 60_000) await new Promise((r) => setTimeout(r, 100));
    if (!f()?.gpu) throw new Error('no solver after a minute');
    const from = f().stepIndex;
    while (f().stepIndex < from + k && performance.now() - t0 < 120_000) await new Promise((r) => setTimeout(r, 100));
    return f().stepIndex - from;
  }, more);
  const bodies = Math.PI * LAVA_BODIES.reduce((a, b) => a + b.r * b.r, 0);
  const app = {};
  for (const look of OIL_LOOKS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(120_000);
    await page.goto(`http://localhost:${PORT}/?debug&${engineQuery()}&look=${look}&seed=1`, { waitUntil: 'load' });
    // A few steps in, so what is read is what the solver is running on, not a splat still waiting for its first step.
    await stepped(page, 4);
    const opened = await oilShare(page);
    // The same look laid again on the running page: the path that always had its oil.
    await page.evaluate((id) => window.chromaglassApplyPreset(id), look);
    await stepped(page, 4);
    const again = await oilShare(page);
    app[look] = { opened, again };
    console.log(`  ${look}: opened with the page ${(opened.share * 100).toFixed(2)}% oil at ${opened.n}² (mix field ${opened.field ? 'there' : 'absent'}), ${(opened.poured * 100).toFixed(2)}% poured; laid again on the running page ${(again.share * 100).toFixed(2)}% at ${again.n}², ${(again.poured * 100).toFixed(2)}% poured`);
    await ctx.close();
  }
  await browser.close();
  check('laid again on the running page, each oil look holds oil (the comparison below is against something)',
    OIL_LOOKS.every((l) => app[l].again.share > 0.01), OIL_LOOKS.map((l) => `${l} ${(app[l].again.share * 100).toFixed(2)}%`).join(', '));
  // The bars. What this half is here to catch is a look opened with nothing (the fault: 0 of its oil) or with
  // its oil twice (the fix replayed over a carry: 2 of it), so the opened plate is held between 0.6 and 1.5 of
  // the same look laid again, which is far from both. Not a tenth: Clock Glass and Splodascope draw their
  // bodies at random and the second lay draws others, and on the Mac the first run read Clock Glass 8.25%
  // opened against 9.17% laid again (10.38% and 11.47% poured), a tenth apart with nothing wrong. Lava Lamp's
  // four bodies are fixed, so it alone is held to a tenth, against the area oilLay.ts gives them, in the field
  // and in the solver's count (6.67% in each, against 6.67%).
  const about = (a, b) => b > 0.01 && a >= 0.6 * b && a <= 1.5 * b;
  check('opened with the page, each oil look holds the oil it holds laid on the running page (0.6 to 1.5 of it: not none, not twice)',
    OIL_LOOKS.every((l) => about(app[l].opened.share, app[l].again.share)),
    OIL_LOOKS.map((l) => `${l} ${(app[l].opened.share * 100).toFixed(2)}% / ${(app[l].again.share * 100).toFixed(2)}%`).join(', '));
  check('and it was poured once: the solver\'s own count of the oil poured, opened, is 0.6 to 1.5 of what it counts laid again',
    OIL_LOOKS.every((l) => about(app[l].opened.poured, app[l].again.poured)),
    OIL_LOOKS.map((l) => `${l} ${(app[l].opened.poured * 100).toFixed(2)}% / ${(app[l].again.poured * 100).toFixed(2)}%`).join(', '));
  const tenth = (a) => Math.abs(a - bodies) <= 0.1 * bodies;
  check("and Lava Lamp's, opened with the page, is the area of its four bodies within a tenth, in the field and in the solver's count",
    tenth(app['lava-lamp'].opened.share) && tenth(app['lava-lamp'].opened.poured),
    `${(app['lava-lamp'].opened.share * 100).toFixed(2)}% held and ${(app['lava-lamp'].opened.poured * 100).toFixed(2)}% poured against ${(bodies * 100).toFixed(2)}%`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
