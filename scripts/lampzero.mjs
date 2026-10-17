#!/usr/bin/env node
/**
 * Lamp Ground 0 is the plate before the lamp (PLAN.md 18b).
 *
 *   npm run lampzero     (the lab on the CPU rasteriser; CI runs it as Measure's `lab` part)
 *
 * The lamp's first claim: at 0 the picture is the plate as it was before
 * the lamp, byte for byte, every look. Asked through the real plate shader
 * against a second lab built from today's plate.ts with the lamp's lines
 * taken out (lampcontrol.mjs: loud if one is not where it was), on a plate
 * of five pools and a two-dye overlap, a back plate drawn where a look has
 * one. And the looks that ship on the lamp (PLAN 18b-1, `npm run lampjudge`)
 * draw on it: as shipped each differs from itself at 0 by more than the
 * ground not reaching it, and none is black. The lamp's physics (a clear
 * pool, Beer and Lambert, a gel, two plates, the fade, the photograph) are
 * `npm run lamp`, on whatever GPU runs it.
 *
 * Two lines hold the measurement itself. Both labs drew on the CPU
 * rasteriser, read back from the adapter rather than trusted from the
 * flags: on a Mac the lab asks Chromium for SwiftShader's adapter, and one
 * that answered with Metal would make this the old check, with its old
 * flip. And the control's bundle is another program from the plain lab's:
 * the control's edits throw when a line has moved, but a plugin whose
 * filter matched no file (plate.ts renamed) would edit nothing, and two
 * plain labs agree byte for byte on any GPU.
 *
 * Why this one runs on the CPU rasteriser and not the Mac's GPU, where it
 * was until 2026-10-11: it compares two compiled programs, and a GPU's
 * shader compiler may round them differently where their text is the same.
 * On the owner's M4 the check read "different: fillmore-1969 2" on main at
 * b2ca7d7: one pixel of one look, 2 levels of blue, the same on every run,
 * and gone when the back plate or its grade was turned off (node
 * scripts/lampwhere.mjs). In the plain lab the lamp's back-plate branch
 * keeps extra uses of the back plate's values alive (reliefOf reads the
 * decoded tint, lit1 reads the front's colour and the mixer's level); in
 * the before-lamp lab those uses are dead code, and Metal fuses the same
 * multiply-adds on the painted path into single-use FMAs it would not fuse
 * with a second use. One ulp of difference crossed a threshold in the grain
 * at that pixel. The same tree read none different on software WebGPU here
 * and on the GitHub runner's Mac, and #353's shader change moved main's
 * compiled code so the M4 read none different again: the check was asking
 * the compiler, not the shader, and would have flipped again on some later
 * tree. SwiftShader has drawn the two labs the same, byte for byte, on
 * every tree this line has run on since 2026-10-04, and as a conformance
 * rasteriser it keeps the shader's operations as written rather than fusing
 * them by use count (inferred from its design and from every run so far;
 * this line is what would say otherwise). So two programs with the same
 * painted path compute the same bytes there, which is the claim.
 */
import { openLab } from './lab.mjs';
import { BEFORE_LAMP, POOLS } from './lampcontrol.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const S = 192;

/** Who drew, and every look on the pools plate, at its own settings with
 *  Lamp Ground 0: [id, its own Lamp Ground, pixels at 0, pixels as shipped
 *  (only when that is not 0)]. */
const everyLook = (lab) => lab.page.evaluate(async ([pools, S]) => {
  await lab.create(128);
  for (const p of pools) lab.dye(...p);
  lab.flush(); await lab.step(2);
  const out = [];
  for (const id of lab.lookIds()) {
    const s = lab.look(id).settings;
    const back = (s.layerCount ?? 1) > 1;
    const cam = { backPlate: back, backRotation: back ? 1.1 : 0 };
    const lg = s.lampGround ?? 0;
    out.push([id, lg, await lab.render(S, { ...s, lampGround: 0 }, cam), lg > 0 ? await lab.render(S, s, cam) : null]);
  }
  return { drew: lab.adapter(), looks: out };
}, [POOLS, S]);

const now = await openLab({ software: true });
let drewNow, looksNow;
try { ({ drew: drewNow, looks: looksNow } = await everyLook(now)); } finally { await now.close(); }
const then = await openLab({ software: true, plugins: [BEFORE_LAMP], tag: 'before-lamp' });
let drewThen, looksThen;
try { ({ drew: drewThen, looks: looksThen } = await everyLook(then)); } finally { await then.close(); }

// SwiftShader reports itself as google / swiftshader (read 2026-10-12 on
// software WebGPU); a Mac's Metal as Apple's. A lab that drew on anything
// but the rasteriser fails here, loudly, whatever the bytes said.
const who = (d) => d ? `${d.vendor} ${d.architecture}`.trim() : 'no adapter';
const cpu = (d) => d?.architecture === 'swiftshader';
check('both labs drew on the CPU rasteriser', cpu(drewNow) && cpu(drewThen), `${who(drewNow)}, ${who(drewThen)}`);
// The plain lab reads its ground in the lamp's own lines, which the control
// has taken out; the control keeps only the uncalled composites' reads (11
// against 6 on 2026-10-12). Equal bundles would be the plugin's filter
// matching nothing.
const reads = (js) => js.match(/U\.lampGround/g)?.length ?? 0;
check('the control is another program: the plain lab reads Lamp Ground where the control does not',
  now.js !== then.js && reads(now.js) > reads(then.js), `${reads(now.js)} reads against ${reads(then.js)}`);

const litOf = (px) => { let t = 0; for (let k = 0; k < px.length; k += 4) t += px[k] + px[k + 1] + px[k + 2]; return t / (px.length / 4); };
const rows = looksNow.map(([id, lg, a, own], i) => {
  const [idThen, , b] = looksThen[i];
  if (idThen !== id || a.length !== S * S * 4 || b.length !== a.length) return { id, lg, worst: NaN, lit: 0 };
  let worst = 0;
  for (let k = 0; k < a.length; k++) { if (k % 4 !== 3) worst = Math.max(worst, Math.abs(a[k] - b[k])); }
  let moved = 0;
  if (own) for (let k = 0; k < a.length; k++) { if (k % 4 !== 3) moved += Math.abs(own[k] - a[k]); }
  return { id, lg, worst, lit: litOf(a), litOwn: own ? litOf(own) : null, moved: own ? moved / (a.length * 0.75) / 255 : null };
});
const off = rows.filter(r => !(r.worst === 0));
const dark = rows.filter(r => r.lit < 5);
check(`every look at Lamp Ground 0 draws the plate as it was before the lamp, byte for byte (${rows.length} looks)`,
  !off.length && !dark.length && rows.length >= 30,
  `${off.length ? `different: ${off.map(r => `${r.id} ${r.worst}`).join(', ')}; ` : ''}${dark.length ? `black: ${dark.map(r => r.id).join(', ')}` : 'none different'}`);
// A look turned up draws a different picture from the same look at 0, by
// more than the 6% `npm run lampjudge` calls the ground not reaching it, and
// not a black one. Not "brighter": a look whose own light already glows on
// the black ground (Timbre Shifter's rainbow LED ring) has that light
// filtered by the dye on the lamp, and reads darker there; the first
// version of this line asked for brighter and found four of the ten darker
// (Timbre Shifter 449 to 200 summed over the plate).
// Equal would mean the setting never reached the plate; black, that the
// lamp is dimmed to nothing.
const up = rows.filter(r => r.lg > 0);
const flat = up.filter(r => !(r.moved > 0.06) || r.litOwn < 5);
// At least one: with none on the lamp the line would pass on nothing.
check(`the looks that ship on the lamp draw on it (${up.length}: each differs from itself at 0 by over 6%, none black)`,
  up.length > 0 && !flat.length,
  up.length ? up.map(r => `${r.id} ${(r.moved * 100).toFixed(0)}%`).join(', ') : 'none ship on the lamp');

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} lampzero checks passed`);
process.exit(failed ? 1 : 0);
