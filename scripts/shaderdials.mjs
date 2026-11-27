#!/usr/bin/env node
/**
 * The dials whose top is held in the plate shader reach their new top, and
 * still change the picture there (PLAN 27h-3), written before the build.
 *
 *   npm run shaderdials                                  # the lab
 *   npm run shaderdials -- --owed=droplets,cells,gloss,glow,gate
 *
 * The owner's rule (2026-10-31): every dial runs from very gentle to very
 * extreme. 27h-1 widened the dials whose consumer could simply be let
 * further, 27h-2 (`npm run widedials`) the nine held a second time in the
 * solver. These are held in the plate shader or its uniforms, so a wider
 * dial alone would buy dead travel, the failure this item was opened for:
 *
 *   droplets  Micro-Droplets: packed through `clamp01`, and the shader's mix
 *             is `min(1, droplets × 1.5)`, so it stops at 0.67 of a 0–1 dial
 *   cells     Plate Cells: packed through `clamp01`; the survey asks 1.4
 *   gloss     Glossiness: the relief gain on the dye's normal, renormalised,
 *             so each step gives less (read below on main: the step from 1.5
 *             to 2 changes the picture by 15% of what 0 to 0.5 does)
 *   glow      Boundary Glow: the dial stops at 1
 *   gate      Gate Edge: the post chain's gate is `mix(1, edge, gate)`, so a
 *             gate past 1 extrapolates past the edge rather than growing it;
 *             clamp the mix, let the width grow (the item's words)
 *
 * Projector Focus, which the item names with Boundary Glow, is not here:
 * read on main on the lab's plate, its eight steps across 0 to 1 change the
 * picture by 0.30 to 0.68 of a level each, alive at both ends (a focus
 * plane, 0.5 in focus), so it has no dead travel for a range to buy back.
 *
 * Asked of each, as 27h-2's lines ask:
 *
 * 1. In the source: the dial's one range (`PIN_RANGE`, which the desk, the
 *    panel, MIDI and the phone read) reaches the new top; the uniform it is
 *    packed into does not clamp it to the old one; and no look sets it past
 *    the old top, so every look opens as it did (the build keeps today's
 *    picture at today's values: the reviewer's look pictures, `look` skill).
 *
 * 2. In the lab (the real plate shader on a deterministic plate), for the
 *    four the lab draws (the post chain, where Gate Edge lives, is not drawn
 *    there: its line is the source's): the last quarter of the new range
 *    still changes the picture by at least a quarter of what the first
 *    quarter does, where "changes" is the mean change of a pixel (levels of
 *    255) and, for Micro-Droplets, whose drops are a few pixels each, the
 *    count of pixels that move more than 6 levels. A dial whose top is held
 *    has a last quarter of nothing, and one whose response fades as gloss's
 *    does has a last quarter of a few percent.
 *
 * Read on main (software WebGPU, the lab's 256² plate, Classic's settings,
 * three pools): Micro-Droplets moves 6 px in its first half and none past 1;
 * Plate Cells 3.64 levels in 0 to 0.35 and none in 1.05 to 1.4; Glossiness
 * 5.05 in 0 to 0.5 and 0.76 in 1.5 to 2; Boundary Glow 0.34 in 0 to 0.5 and
 * 0.18 in 1.5 to 2, alive past 1 on this plate (its top is the range's, at 1).
 *
 * Owed lines (as rungs-owed.mjs and soapbreak.mjs hold them): an id in
 * `--owed=` (scripts/checks.json) prints owed while its line fails in main's
 * state; it is red once it passes while still listed (take the id out), and
 * red if what it is owed for has been built and misses. The build's PR takes
 * its id out of `--owed` and never edits the line.
 */
import { readFileSync } from 'node:fs';
import { PIN_RANGE } from '../src/lib/deskPins.ts';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const DIALS = [
  { id: 'droplets', key: 'microDroplets', label: 'Micro-Droplets', old: 1, top: 2, uniform: 'droplets', measure: 'pixels' },
  { id: 'cells', key: 'cells', label: 'Plate Cells', old: 1, top: 1.4, uniform: 'cells', measure: 'mean' },
  { id: 'gloss', key: 'glossiness', label: 'Glossiness', old: 1, top: 2, uniform: 'glossiness', measure: 'mean' },
  { id: 'glow', key: 'boundaryContrast', label: 'Boundary Glow', old: 1, top: 2, uniform: 'boundaryContrast', measure: 'mean' },
  { id: 'gate', key: 'stockGate', label: 'Gate Edge', old: 1, top: 2, post: true },
];
const IDS = DIALS.map((d) => d.id);
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
for (const id of owed) if (!IDS.includes(id)) check('every id in --owed is a line of shaderdials.mjs', false, `unknown "${id}" (known: ${IDS.join(', ')})`);
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
};

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const uniforms = src('src/gpu/plateUniforms.ts');
const postWgsl = src('src/gpu/wgsl/post.ts');
const presets = src('src/presets.ts');

/*
  Is the packed value held at the old top? The `pack.set('<uniform>', …)`
  line's expression: `clamp01(` holds it at 1, and a `Math.min(x, …)` or
  `clamp(…, lo, x)` holds it at x. A uniform packed twice must agree, and one
  not found fails as unread rather than passing as no clamp.
*/
function heldAt(uniform) {
  const sets = [...uniforms.matchAll(new RegExp(`pack\\.set\\('${uniform}',\\s*([^;]*)\\);`, 'g'))].map((m) => m[1]);
  if (!sets.length) return { read: false, held: null, sets };
  let held = Infinity;
  for (const e of sets) {
    if (/clamp01\(/.test(e)) held = Math.min(held, 1);
    for (const m of e.matchAll(/Math\.min\(\s*([\d.]+)\s*,/g)) held = Math.min(held, Number(m[1]));
    for (const m of e.matchAll(/\bclamp\([^,]+,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/g)) held = Math.min(held, Number(m[1]));
  }
  return { read: true, held, sets };
}
// Each look's own value for the key, as written in src/presets.ts.
const looksAbove = (key, old) => [...presets.matchAll(new RegExp(`\\b${key}:\\s*([\\d.]+)`, 'g'))].map((m) => Number(m[1])).filter((v) => v > old);

const source = {};
for (const d of DIALS) {
  const range = PIN_RANGE.get(d.key);
  const top = range?.max ?? NaN;
  const above = looksAbove(d.key, d.old);
  if (d.post) {
    /*
      The gate in wgsl/post.ts: the mix's weight must stop at 1 (min, clamp or
      saturate on U.stockGate) while the width term, `0.05 * U.stockGate` on
      main, still reads the dial unclamped, so the edge grows past 1 rather
      than overshooting the vignette.
    */
    const gateLine = /c\s*=\s*c\s*\*\s*mix\(([^;]*U\.stockGate[^;]*)\);/.exec(postWgsl)?.[1] ?? '';
    const lastArg = gateLine.slice(gateLine.lastIndexOf(',') + 1).trim();
    const mixClamped = /^(min\(\s*U\.stockGate\s*,\s*1(\.0)?\s*\)|clamp\(\s*U\.stockGate\s*,\s*0(\.0)?\s*,\s*1(\.0)?\s*\)|saturate\(\s*U\.stockGate\s*\))$/.test(lastArg);
    const widthGrows = /0\.0\d+\s*\*\s*U\.stockGate\b/.test(gateLine);
    source[d.id] = {
      ok: top >= d.top && mixClamped && widthGrows && !above.length,
      main: top === d.old && !mixClamped && widthGrows && !above.length,
      detail: `range to ${top}; the gate's mix weight ${gateLine ? `"${lastArg}"` : 'not found in wgsl/post.ts'}${mixClamped ? ' (held at 1)' : ' (not held at 1)'}, its width ${widthGrows ? 'grows with the dial' : 'does not read the dial'}${above.length ? `; looks past ${d.old}: ${above.join(', ')}` : ''}`,
    };
  } else {
    const h = heldAt(d.uniform);
    source[d.id] = {
      ok: top >= d.top && h.read && h.held >= d.top && !above.length,
      main: top === d.old && h.read && !above.length,
      detail: `range to ${top}; packed ${!h.read ? 'NOT FOUND' : h.held === Infinity ? 'unclamped' : `held at ${h.held}`}${above.length ? `; looks past ${d.old}: ${above.join(', ')}` : ''}`,
    };
  }
}

// ── 2. The lab ─────────────────────────────────────────────────────────────
const SIZE = 256;
const diff = (a, b) => {
  let s = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    s += d; if (d > 6) n++;
  }
  return { mean: s / (a.length / 4), pixels: n };
};
const lab = {};
const { page, close } = await openLab();
try {
  /*
    One plate for every picture: a red and a blue pool meeting in the middle
    (an interface for Boundary Glow, slopes for Glossiness, a thick pool for
    Plate Cells) and a thin yellow one (Micro-Droplets keep more on thin dye).
    The render does not step the plate, so each dial's pictures differ by the
    dial alone. Classic's settings, with each dial set in turn.
  */
  await page.evaluate(async () => {
    await lab.create(256);
    const lay = [[0.42, 0.5, 0.14, [0.9, 0.2, 0.1], 2.0], [0.58, 0.5, 0.14, [0.1, 0.3, 0.9], 2.0], [0.5, 0.72, 0.08, [0.95, 0.8, 0.1], 0.6]];
    for (const [x, y, r, ink, d] of lay) lab.dye(x, y, r, ink, d);
    lab.flush();
    await lab.step(2);
  });
  const render = (over) => page.evaluate(async ([over, SIZE]) => Array.from(await lab.render(SIZE, { ...lab.look('classic').settings, ...over })), [over, SIZE]);
  for (const d of DIALS.filter((x) => !x.post)) {
    const q = d.top / 4;
    const [a0, a1, b0, b1] = [0, q, d.top - q, d.top];
    const pics = [];
    for (const v of [a0, a1, b0, b1]) pics.push(await render({ [d.key]: v }));
    const first = diff(pics[0], pics[1])[d.measure], last = diff(pics[2], pics[3])[d.measure];
    const fmt = (v) => d.measure === 'pixels' ? `${v} px` : `${v.toFixed(2)} levels`;
    lab[d.id] = {
      ok: first > 0 && last >= 0.25 * first,
      detail: `${+a0.toFixed(2)}→${+a1.toFixed(2)}: ${fmt(first)}; ${+b0.toFixed(2)}→${+b1.toFixed(2)}: ${fmt(last)} (${first > 0 ? Math.round((100 * last) / first) : 0}% of the first)`,
    };
  }
} finally {
  await close();
}

for (const d of DIALS) {
  const s = source[d.id], l = lab[d.id];
  const ok = s.ok && (d.post || l.ok);
  const main = s.main;
  line(d.id, `${d.label} runs to ${d.top} and still changes the picture in its last quarter (27h-3)`, ok,
    `${s.detail}${l ? `; in the lab ${l.detail}` : '; drawn in the post chain, which the lab does not draw'}`, main);
}

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} of ${checks.length} failed` : `\nall ${checks.length} ok${owed.size ? ` (${owed.size} owed)` : ''}`);
process.exit(failed ? 1 : 0);
