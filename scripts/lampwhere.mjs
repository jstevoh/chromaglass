#!/usr/bin/env node
/**
 * Where a look differs from the plate before the lamp (PLAN.md 18b).
 *
 *   node scripts/lampwhere.mjs [lookId]     (default fillmore-1969)
 *
 * `npm run lampzero` asks every look at Lamp Ground 0 to draw the plate as
 * it was before the lamp, byte for byte, against a second lab built with the
 * lamp's lines taken out (lampcontrol.mjs), on the CPU rasteriser. This runs
 * the same comparison on whatever draws here (a Mac's GPU, unless
 * `PW_SOFTWARE`-style flags say otherwise) and says where and why the two
 * differ: what a shader compiler makes of a branch the frame never takes
 * differs by GPU, which is why the check itself left the GPU (2026-10-11,
 * one pixel of Fillmore on an M4; the story is in lampzero.mjs):
 *
 *   - whether the plain lab draws the look the same twice (a render that
 *     differs from itself is a race or a read of something unset, not the
 *     lamp);
 *   - the pixels that differ between the two labs, where they are and what
 *     each lab drew there;
 *   - the look's settings turned off one at a time (each number to 0, the
 *     back plate to one plate, the blend to normal), and which of those make
 *     the difference go away: the feature whose code the lamp's lines sit
 *     next to.
 *
 * The plate, the size and the camera are the check's own.
 */
import { openLab } from './lab.mjs';
import { BEFORE_LAMP, POOLS } from './lampcontrol.mjs';

const id = process.argv[2] ?? 'fillmore-1969';
const S = 192;

/** The look at Lamp Ground 0 on the check's plate, as shipped and with each setting off, in one lab. */
const renderAll = (lab) => lab.page.evaluate(async ([id, pools, S]) => {
  await lab.create(128);
  for (const p of pools) lab.dye(...p);
  lab.flush(); await lab.step(2);
  const s = { ...lab.look(id).settings, lampGround: 0 };
  const draw = (v) => {
    const back = (v.layerCount ?? 1) > 1;
    return lab.render(S, v, { backPlate: back, backRotation: back ? 1.1 : 0 });
  };
  const out = { base: await draw(s), again: await draw(s), variants: {} };
  const offs = [];
  for (const [k, v] of Object.entries(s)) {
    if (k === 'lampGround') continue;
    if (k === 'layerCount') { if (v > 1) offs.push([`${k} 1`, { [k]: 1 }]); continue; }
    if (k === 'blendMode') { if (v !== 'normal') offs.push([`${k} normal`, { [k]: 'normal' }]); continue; }
    if (typeof v === 'number' && v !== 0) offs.push([`${k} 0`, { [k]: 0 }]);
    if (typeof v === 'boolean' && v) offs.push([`${k} off`, { [k]: false }]);
  }
  if (typeof s.saturationBoost === 'number' && s.saturationBoost !== 1) offs.push(['saturationBoost 1', { saturationBoost: 1 }]);
  for (const [name, over] of offs) out.variants[name] = await draw({ ...s, ...over });
  return out;
}, [id, POOLS, S]);

const now = await openLab();
let a;
try { a = await renderAll(now); } finally { await now.close(); }
const then = await openLab({ plugins: [BEFORE_LAMP], tag: 'before-lamp' });
let b;
try { b = await renderAll(then); } finally { await then.close(); }

/** The pixels two pictures differ at: [x, y, worst byte, rgb here, rgb there]. */
const differing = (p, q) => {
  const out = [];
  for (let k = 0; k < p.length; k += 4) {
    const w = Math.max(Math.abs(p[k] - q[k]), Math.abs(p[k + 1] - q[k + 1]), Math.abs(p[k + 2] - q[k + 2]));
    if (w > 0) out.push([(k / 4) % S, Math.floor(k / 4 / S), w, p.slice(k, k + 3), q.slice(k, k + 3)]);
  }
  return out;
};
const worst = (d) => d.reduce((m, r) => Math.max(m, r[2]), 0);
const f = (d) => `worst ${worst(d)}, ${d.length} pixel${d.length === 1 ? '' : 's'} differ`;

console.log(`${id} at Lamp Ground 0, ${S}x${S}, on the lamp check's plate`);
console.log(`  the plain lab twice: ${f(differing(a.base, a.again))}`);
console.log(`  the before-lamp lab twice: ${f(differing(b.base, b.again))}`);
const base = differing(a.base, b.base);
console.log(`  plain against before-lamp: ${f(base)}`);
for (const [x, y, w, p, q] of base.slice(0, 12)) {
  console.log(`    (${x},${y}) ${((x + 0.5) / S - 0.5).toFixed(2)},${((y + 0.5) / S - 0.5).toFixed(2)} from the middle: plain ${p.join(',')} before-lamp ${q.join(',')} (by ${w})`);
}
if (base.length > 12) console.log(`    … and ${base.length - 12} more`);
const names = Object.keys(a.variants);
const rows = names.map((n) => [n, differing(a.variants[n], b.variants[n])]);
if (!base.length) {
  // Nothing to explain: say whether any setting brings a difference instead.
  const brings = rows.filter(([, d]) => d.length);
  console.log(`  with one setting off (${names.length} tried): ${brings.length ? `a difference with ${brings.map(([n, d]) => `${n} (${f(d)})`).join('; ')}` : 'none different either'}`);
} else {
  const gone = rows.filter(([, d]) => d.length === 0);
  const changed = rows.filter(([, d]) => d.length && (worst(d) !== worst(base) || d.length !== base.length));
  console.log(`  with one setting off (${names.length} tried):`);
  console.log(`    the difference gone: ${gone.length ? gone.map(([n]) => n).join(', ') : 'none'}`);
  console.log(`    changed: ${changed.length ? changed.map(([n, d]) => `${n} (${f(d)})`).join('; ') : 'none'}`);
  console.log(`    the same: ${rows.length - gone.length - changed.length}`);
}
