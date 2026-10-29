#!/usr/bin/env node
/**
 * What the passes after the solver ask the device for on every frame
 * (PLAN.md 14ab-5).
 *
 *   npm run framegroups      (the lab: any adapter that draws, PW_WEBGPU=1 off a Mac)
 *
 * Read in the code on 2026-10-24: the plate's pack, derive and display, the
 * camera, the post chain, the projector and the particles' splat each made
 * their bind groups again every frame, over a fresh `createView()` for every
 * texture they bound, where the solver had kept its own since H2c-11. Each is
 * a call into the GPU process and an object for the collector, sixty times a
 * second, binding the same textures as the frame before. `gpu/groupCache.ts`
 * keeps them, found again by the very objects they bind.
 *
 * So this draws the app's whole chain of passes in the lab, frame after
 * frame, from one set of objects kept as the app keeps them: the particles'
 * splat, the plate, the camera, the test effect reaching three frames back
 * into the post chain's ring, the film stock, the finish, a projector source
 * drawn again and the projector's pass over the two. The solver steps between
 * frames, and every other frame its dye's ping-pong pair is turned round, so
 * the plate is handed one and then the other texture (a step alone always
 * ends on the same one: the review of this check found it never changed); and
 * half way through the size changes, which makes every target again.
 *
 * Three such chains draw each frame, from the same solver at the same moment
 * and with the same history: one with the cache as the show has it, one with
 * every group and view made fresh (`groupCacheTest.fresh`, the passes as they
 * were before), and one with a cache that keys a group by its pipeline alone
 * (`blind`), a cache that would serve the wrong textures. The feature is
 * "a frame asks for nothing it had last frame, and draws what it drew":
 *   - after a size's first few frames (each pairing of the dye's ping-pong
 *     textures with the chain's met once), a frame makes no bind group and
 *     no view;
 *   - every frame is, byte for byte, the frame the fresh chain drew;
 *   - the device refuses nothing either chain asks of it;
 * and three controls that say the measure can see what it is looking for:
 *   - the fresh chain makes groups and views on every frame (the counter
 *     counts the calls the passes make);
 *   - the first frame after the size changes makes groups on the cached chain
 *     too (a new texture is a new key);
 *   - the blind chain draws a different picture, or is refused, on some frame
 *     (the equality can see a group bound to the wrong textures).
 * And that there is something to compare: the plate is lit, has particles, and
 * its warm frames read both textures of the dye's ping-pong pair (a group keyed
 * wrongly by the dye would draw the other one).
 */
import { openLab } from './lab.mjs';

const N = Number(process.env.FRAMEGROUPS_GRID ?? 128);
const SIZES = [160, 192];
const FRAMES = Number(process.env.FRAMEGROUPS_FRAMES ?? 10);
// A size's first frames meet each of the dye's ping-pong pair under each of
// the post chain's two pictures for the first time; by the fourth, all of them.
const WARM = 4;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab({ entry: 'scripts/lab-chain.ts' });
try {
  const rows = await page.evaluate(async ({ n, sizes, frames }) => {
    await lab.create(n);
    lab.dye(0.35, 0.4, 0.15, [1.4, 0.5, 0.2], 3);
    lab.dye(0.65, 0.6, 0.15, [0.2, 0.6, 1.5], 3);
    lab.vel(0.5, 0.5, 0.3, [30, -20, 0, 0]);
    lab.flush();
    const params = { particles: 0.6 };
    await lab.step(4, params);
    const ids = { cached: await lab.chainOpen(), fresh: await lab.chainOpen(), blind: await lab.chainOpen() };
    const out = [];
    for (const size of sizes) {
      for (let k = 0; k < frames; k++) {
        await lab.step(1, params);
        // A step swaps the dye an even number of times, so it always ends on
        // the same one of the pair; every other frame the pair is turned
        // round by hand, so the plate is handed the other texture, as a
        // rebuilt or carried solver hands it a new one.
        if (k % 2) lab.solver().dye.swap();
        const row = { size, k };
        for (const [mode, id] of Object.entries(ids)) row[mode] = await lab.chainDraw(id, size, mode);
        row.diff = lab.chainDiff(ids.cached, ids.fresh);
        row.blindDiff = lab.chainDiff(ids.blind, ids.fresh);
        out.push(row);
      }
    }
    return out;
  }, { n: N, sizes: SIZES, frames: FRAMES });

  const steady = rows.filter((r) => r.k >= WARM);
  const sum = (rs, f) => rs.reduce((a, r) => a + f(r), 0);
  const first = rows[0];
  console.log(`  ${N}² grid, ${SIZES.join(' then ')} px, ${FRAMES} frames each`);
  console.log(`  fresh (as before): ${first.fresh.groups} bind groups and ${first.fresh.views} views a frame`);
  console.log(`  cached: ${first.cached.groups} groups and ${first.cached.views} views on its first frame, ${sum(steady, (r) => r.cached.groups)} and ${sum(steady, (r) => r.cached.views)} in ${steady.length} frames once warm`);

  check('control: the fresh chain makes groups and views on every frame',
    rows.every((r) => r.fresh.groups > 0 && r.fresh.views > 0), `fewest ${Math.min(...rows.map((r) => r.fresh.groups))} groups, ${Math.min(...rows.map((r) => r.fresh.views))} views`);
  const resized = rows.find((r) => r.size === SIZES[1] && r.k === 0);
  check('control: the first frame at a new size makes groups on the cached chain', resized.cached.groups > 0, `${resized.cached.groups} groups, ${resized.cached.views} views`);
  const blindOff = rows.filter((r) => r.blindDiff.bytes > 0 || r.blind.error);
  check('control: a cache keyed by the pipeline alone draws another picture', blindOff.length > 0,
    `${blindOff.length} of ${rows.length} frames${blindOff[0]?.blind.error ? `, refused: ${blindOff[0].blind.error.slice(0, 80)}` : ''}`);
  const dyes = (rs) => new Set(rs.map((r) => r.cached.dye)).size;
  const sizesSteady = SIZES.map((size) => dyes(steady.filter((r) => r.size === size)));
  check('the warm frames read both of the dye\'s ping-pong pair', sizesSteady.every((d) => d >= 2), `${sizesSteady.join(' and ')} textures at the two sizes`);
  check('the plate is lit and carries particles', rows.every((r) => r.fresh.lit > 0.05) && rows.every((r) => r.fresh.particles),
    `lit ${Math.min(...rows.map((r) => r.fresh.lit)).toFixed(2)} at the least`);
  check('once warm, a frame makes no bind group', steady.every((r) => r.cached.groups === 0), `${sum(steady, (r) => r.cached.groups)} in ${steady.length} frames`);
  check('once warm, a frame makes no view', steady.every((r) => r.cached.views === 0), `${sum(steady, (r) => r.cached.views)} in ${steady.length} frames`);
  const off = rows.filter((r) => r.diff.bytes > 0);
  check('every frame is the fresh chain\'s, byte for byte', off.length === 0,
    off.length ? `${off.length} frames differ, first at ${off[0].size} px frame ${off[0].k}: ${off[0].diff.bytes} bytes, by up to ${off[0].diff.most}` : `${rows.length} frames`);
  const refused = rows.filter((r) => r.cached.error || r.fresh.error);
  check('the device refuses nothing the chains ask', refused.length === 0, refused[0] ? (refused[0].cached.error ?? refused[0].fresh.error).slice(0, 120) : '');
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
