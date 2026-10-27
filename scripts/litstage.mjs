#!/usr/bin/env node
/**
 * Does a look keep its contrast on a lit stage? (PLAN.md 36a.)
 *
 *   npm run litstage                 (everything; red until 36a is built)
 *   npm run litstage -- --controls   (only the lines that hold on main today)
 *
 * The lab on the CPU rasteriser, about two and a half minutes in a cloud
 * session (one with --controls). CI runs it as Measure's `lab` part.
 *
 * What 36a asks for. Every look is graded for a dark room. Under a stage wash
 * a projector's black is not black: the wash lands on the screen too, and the
 * screen sends it back with the picture, so every pixel gets the same light
 * added on top of what the projector throws. The looks that lean on
 * near-black turn to a grey haze, which is the pain the analog operators
 * named ("it's hard for that light to live in a modern stage environment").
 * 36a's answer is a Lit stage amount on the Wall, set at load-in: as it
 * rises the dyes thicken and saturate and the bodies hold larger, so a look
 * keeps its contrast on the lifted floor instead of performing black the room
 * cannot show. This is its measure, written before the build, so it is the
 * contract the build is held to.
 *
 * The floor. A fraction f of white added to every pixel as light: each byte
 * decoded to the light a projector throws for it (sRGB), f added, and the
 * result read in CIELAB against the room's white, which is now 1 + f, because
 * an eye in a lit room adapts to the brightest thing in it. Not f added to the
 * bytes: light adds in light, and a floor in the bytes is a different (and
 * kinder to the darks) number, which control c1 tells apart. Asked at 0, 5%
 * and 10%: 10% is a wash a stage can easily throw on a screen, and 5% the
 * spill from one.
 *
 * The plate. Nine soft pools of three absorbances on the lab plate, two steps
 * old, and every shipped look drawn over it at 128² at its own settings (with
 * its back plate where it has one), and again over the same plate with no
 * dye: the field behind each pixel, whatever the look puts there (black, a
 * lamp, a vignette, a hot spot, a gel). The contrast is the colour difference
 * (CIE 1976 ΔE) between each pixel and the field behind it, averaged over the
 * bodies: the pixels where the dye is over 10 apart from its field in the dark
 * room. Its dark-room value is the look at Lit stage 0 with no floor.
 *
 * Why ΔE and not a ratio of brightnesses. A body's contrast on a black field
 * is infinite as a ratio in the dark room and finite on any floor, so a ratio
 * says every look loses everything; and Michelson's (L₁ - L₂)/(L₁ + L₂) is 1 for
 * any colour on black, and can only be held by making the bodies brighter,
 * which a saturated blue (a seventh of white's luminance at full) cannot do.
 * Colour is contrast too, a red pool on a blue field reads at one brightness,
 * and CIELAB is the space built for "how different do these two colours look
 * to an eye adapted to this white". CIE 1976 rather than 2000: every line
 * compares a look with itself, the same colours under two lights, so the
 * older formula's unevenness (in the blues most) largely cancels in a ratio,
 * and it is twelve lines rather than sixty.
 *
 * The bars, from one anchor: what the floor leaves of the most contrast a
 * grey can have, white on black. At 10% that is 63.8%, at 5% 73.9%. (A
 * saturated colour keeps more, a full blue 72% and a full green 76% at 10%,
 * because the floor dilutes its chroma less than it lifts black; which is why
 * Roy and Ferro Paint keep 76% with nothing done.) A look on Lit stage is
 * asked to hold up at least as well as white on black, two-thirds of its
 * dark-room contrast at 10% (the amount at 1) and three-quarters at 5% (at
 * 0.5). The amount is how lit the room is, 1 a wash of about a tenth of white.
 * Read on main with nothing done (SwiftShader, 2026-10-27), the looks keep
 * 47-76% at 10% (26 of 33 under two-thirds; Lace Run and Cell Bloom 47%,
 * Velvet Underground 51%, Roy and Ferro Paint 76%) and 59-86% at 5%. A
 * reference sketch (Colour Body raised to a third of the amount where a look
 * has less, and a lift of each pixel's luminance with its colour's ratios
 * kept, then a little saturation, about 20 lines; in the project's files,
 * `lit-stage-36a/`) kept 77-123% at 10% and 81-102% at 5%, passed b1-b7 (b8 is the UI),
 * and failed each of the mutants beside it. The bright-field looks (a lamp
 * behind the dye) are the hard ones: the floor barely touches their field and
 * lifts their dark bodies, and the best a per-pixel curve did for Poster 1969
 * and Milk Marble was 72-78%.
 *
 * The lines (c are the controls, which hold on main and run in CI until the
 * build; b are 36a's):
 *
 *   c1  the measure on two pixels whose answer is known
 *   c2  the lab drew on the CPU rasteriser (b3 compares two programs: see
 *       `npm run lampzero` for why that is SwiftShader's to judge, not a GPU's)
 *   c3  every look drawn twice is the same picture, so b3's "byte for byte"
 *       means the grade and not the lab
 *   c4  every look has dye to measure (bodies over a fifth of the frame and
 *       20 apart from the field in the dark room), so no look passes on an
 *       empty plate
 *   c5  the floor costs what 36a says: with nothing done, over half the looks
 *       fall under the 10% bar, the near-black ones (BLACK) among them, so b4
 *       is not a line the plate passes by itself
 *   c6  the floor alone hides thin dye in some look (b6's teeth) and turns no
 *       look's hues by b7's bar (else b7 would be measuring the floor)
 *   b1  the amount is the Wall's: `litStage` in `OutputConfig`
 *       (lib/outputConfig.ts), 0 by default and for a Wall saved before it,
 *       clamped to 0..1 by `normalizeOutput`, and in no look's settings (it is
 *       load-in, kept on this machine with the corner pin, never saved into a
 *       look or a set)
 *   b2  the control is another program (below), and at 1 every look draws
 *       differently without the marked lines, so the marks hold the grade
 *       and not a comment
 *   b3  at 0 every look is the plate without the grade, byte for byte
 *   b4  at 10% with the amount at 1, every look keeps two-thirds
 *   b5  at 5% with the amount at 0.5, every look keeps three-quarters
 *   b6  the bodies hold their size: at 10% and 1, 95% of the pixels where dye
 *       was seen in the dark room (over 5 apart from its field) are still
 *       seen, the same pixels, not a count over the frame (a halo lit
 *       elsewhere does not pay for an edge lost). With nothing done the floor
 *       hides 18% of them in Macro Bead, Soap Film and Oil and Water, the thin
 *       edges where a pool fades into the field
 *   b7  the looks keep their colours: at 10% and 1, the bodies' hues turn by
 *       under 10 on average, as the CIE hue difference ΔH = 2√(C₁C₂)·sin(Δh/2)
 *       (in ΔE's units; a dye of chroma 40 turned 15° is 10.4). Not the angle:
 *       a near-grey pixel turns through any angle for a step no one would see,
 *       and the angle read Home Movie's warm greys as recoloured. The floor
 *       alone turns them 0.6-2.4; the sketch 2.6-7.9. And the bodies keep at
 *       least the chroma the floor alone leaves them: ΔH goes to 0 as the
 *       colour does, so a grade that drained the colour into lightness would
 *       otherwise pass as turning nothing
 *   b8  the app's way in: its plate view (LiquidVisualizer.tsx, beside
 *       `dimmerGain`) takes `litStage` from the Wall's config
 *       (`litStage: outputCfgRef.current.litStage`, or the like), and the
 *       Wall's panel (OutputPanel.tsx) sets it. Read from the source: every
 *       line above draws through the lab's camera, and the app's own frames
 *       are the Mac's
 *
 * What the build hands this check (the contract):
 *
 *   - `OutputConfig.litStage`, as b1 says, and `PlateView.litStage`
 *     (gpu/plateUniforms.ts), which the app fills from the Wall each frame and
 *     the lab from `lab.render`'s camera, `{ litStage }` (scripts/lab-entry.ts:
 *     `litStage: cam.litStage ?? 0` beside `dimmerGain`). Absent is 0.
 *   - The grade is drawn by the plate (wgsl/plate.ts, gpu/plateUniforms.ts),
 *     where the dye's thickness is known, not by the projector's output pass:
 *     `lab.render` is the plate's picture. And it is drawing, not the solver:
 *     the room does not change the liquid. Thicker dye is optical depth, which
 *     is what the eye sees of a stronger pour (Beer and Lambert), so a plate
 *     that draws the dye deeper is honest about what an operator would do.
 *   - Every line that reads the amount, in WGSL or TypeScript, sits between
 *     two block comments, one reading `lit stage {` and one `} lit stage`
 *     (MARKED below; block comments, which WGSL and TypeScript both read the
 *     same way, so one mark serves a shader and its uniforms). The control
 *     is a second lab built with those blocks taken out (an esbuild plugin,
 *     WITHOUT_GRADE), drawn at Lit stage 1; b3 asks the plain lab at 0 to draw
 *     it byte for byte. So at 0 the plate is the plate without the grade, and
 *     nothing outside the marks reads the amount (else the control at 1 would
 *     differ). b2 holds the measurement: with no marked block the control is
 *     the plain lab, and two plain labs agree on any picture. What b3 cannot
 *     see is an unmarked change that moves the picture whatever the amount;
 *     the look checks (`npm run grainedge`, `npm run lamp`, the gallery) and
 *     the review are for that.
 *
 * Not asked here: the phone. The Wall's controls reach the phone through the
 * phone's own sheets, and the build's PR runs the `phone` and `panel` checks
 * for them, as every setting's does.
 *
 * Exits non-zero if any line fails. `--controls` runs c1-c6 only, which hold
 * on main today; the build's PR drops the flag from scripts/checks.json.
 */
import { openLab } from './lab.mjs';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const CONTROLS_ONLY = process.argv.includes('--controls');
const only = process.env.LITSTAGE_ONLY?.split(',').map((x) => x.trim()).filter(Boolean);

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const S = 128, N = 128, T = 1.0;
const FLOORS = [0.05, 0.1];
const AMOUNT = { 0.05: 0.5, 0.1: 1 };
const BODY_DE = 10, SEEN_DE = 5;
const HOLD = { 0.05: 0.75, 0.1: 2 / 3 }, SEEN_HOLD = 0.95, HUE_MAX = 10, MIN_BODY = 0.2, MIN_DARK = 20;
/** The looks that lean on near-black, which the floor must be seen to cost (with nothing done, 47-51% at 10%). */
const BLACK = ['velvet-underground', 'cell-bloom', 'lace-run'];

// ---- colour: bytes as a projector shows them, light added, seen by an eye adapted to the room's white
const LIN = Float64Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const fl = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
export function labOf(r, g, b, floor) {
  const W = 1 + floor;
  r += floor; g += floor; b += floor;
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / (0.95047 * W);
  const Y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / W;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / (1.08883 * W);
  const fy = fl(Y);
  return [116 * fy - 16, 500 * (fl(X) - fy), 200 * (fy - fl(Z))];
}
const labPx = (px, floor) => {
  const P = px.length / 4, out = new Float64Array(3 * P);
  for (let i = 0; i < P; i++) { const v = labOf(LIN[px[4 * i]], LIN[px[4 * i + 1]], LIN[px[4 * i + 2]], floor); out[3 * i] = v[0]; out[3 * i + 1] = v[1]; out[3 * i + 2] = v[2]; }
  return out;
};
const dE = (a, b, i) => Math.hypot(a[3 * i] - b[3 * i], a[3 * i + 1] - b[3 * i + 1], a[3 * i + 2] - b[3 * i + 2]);

/*
  The contrast of the dye against the field behind it, pixel by pixel, over a
  floor: its mean over the bodies, and which of the pixels seen in the dark
  room (`seenIn`, over SEEN_DE from their field) are still seen. The same
  pixels, not a count over the frame: a grade that hid a pool's edges and lit
  a halo elsewhere would keep the count. A plate with no bodies, or nothing
  seen, throws rather than reading as a pass (NaN < a bar is false).
*/
function measure(dyed, empty, floor, body, seenIn = null) {
  const A = labPx(dyed, floor), B = labPx(empty, floor), P = dyed.length / 4;
  const seen = new Uint8Array(P);
  let sum = 0, n = 0, kept = 0, had = 0;
  for (let i = 0; i < P; i++) {
    const d = dE(A, B, i);
    if (d > SEEN_DE) seen[i] = 1;
    if (seenIn?.[i]) { had++; if (seen[i]) kept++; }
    if (body[i]) { sum += d; n++; }
  }
  if (!n) throw new Error('litstage: no body pixels to measure');
  if (seenIn && !had) throw new Error('litstage: nothing seen in the dark room to keep');
  return { contrast: sum / n, seen, kept: seenIn ? kept / had : 1 };
}

// ---- the lab
const POOLS = (() => {
  let s = 4242; const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  const out = [];
  for (let i = 0; i < 9; i++) out.push([0.15 + 0.7 * r(), 0.15 + 0.7 * r(), 0.06 + 0.08 * r(), [2 * r(), 2 * r(), 2 * r()], 1.0 + r()]);
  return out;
})();

const MARKED = /\/\* lit stage \{ \*\/[\s\S]*?\/\* \} lit stage \*\//g;
let stripped = 0;
const WITHOUT_GRADE = {
  name: 'without-lit-stage',
  setup(b) {
    b.onLoad({ filter: /[\\/]src[\\/].*\.tsx?$/ }, (a) => {
      const src = readFileSync(a.path, 'utf8');
      const n = src.match(MARKED)?.length ?? 0;
      if (!n) return undefined;
      stripped += n;
      return { contents: src.replace(MARKED, ''), loader: a.path.endsWith('x') ? 'tsx' : 'ts' };
    });
  },
};

/*
  Each picture crosses from the page as base64, one look at a time: as arrays
  of numbers, 33 looks of six pictures each ran node out of heap.
*/
async function renders(lab, plan) {
  const { page } = lab;
  const ids = await page.evaluate(([only]) => lab.lookIds().filter((id) => !only || only.includes(id)), [only ?? null]);
  const shoot = (key, amounts) => page.evaluate(async ([S, T, id, amounts]) => {
    const s = lab.look(id).settings;
    const back = (s.layerCount ?? 1) > 1;
    const out = [];
    for (const a of amounts) {
      const px = new Uint8Array(await lab.render(S, s, { backPlate: back, backRotation: back ? 1.1 : 0, time: T, litStage: a }));
      let bin = '';
      for (let k = 0; k < px.length; k += 8192) bin += String.fromCharCode(...px.subarray(k, k + 8192));
      out.push(btoa(bin));
    }
    return out;
  }, [S, T, key, amounts]);
  const out = {};
  const pass = async (key, amounts) => {
    for (const id of ids) (await shoot(id, amounts)).forEach((b, k) => { (out[id] ??= {})[`${key}:${amounts[k]}`] = new Uint8Array(Buffer.from(b, 'base64')); });
  };
  if (plan.empty.length) { await page.evaluate(async ([N]) => { await lab.create(N); lab.flush(); await lab.step(2); }, [N]); await pass('empty', plan.empty); }
  await page.evaluate(async ([pools, N]) => {
    await lab.create(N);
    for (const p of pools) lab.dye(...p);
    lab.flush(); await lab.step(2);
  }, [POOLS, N]);
  await pass('dyed', plan.dyed);
  if (plan.again) await pass('again', [plan.dyed[0]]);
  const { drew, carries } = await page.evaluate(() => ({ drew: lab.adapter(), carries: lab.lookIds().filter((id) => 'litStage' in lab.look(id).settings) }));
  return { drew, ids, out, carries };
}

const AMOUNTS = CONTROLS_ONLY ? [0] : [0, ...new Set(Object.values(AMOUNT))];
const t0 = Date.now();
const plain = await openLab({ software: true });
let got;
try { got = await renders(plain, { empty: AMOUNTS, dyed: AMOUNTS, again: true }); } finally { await plain.close(); }
let ctl = null, ctlJs = null;
if (!CONTROLS_ONLY) {
  const then = await openLab({ software: true, plugins: [WITHOUT_GRADE], tag: 'without-lit-stage' });
  try { ctl = await renders(then, { empty: [], dyed: [1] }); ctlJs = then.js; } finally { await then.close(); }
}
console.log(`  rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

/*
  How far the grade turns the bodies' hues: the CIE hue difference, ΔH =
  2·√(C₁C₂)·sin(Δh/2), in the same units as ΔE, averaged over the bodies. Not
  the angle: a near-grey pixel turns through any angle for a step of colour no
  one would see, and the angle took Home Movie's warm greys for a recolouring.
*/
/*
  And how much colour is left: ΔH goes to 0 as the second chroma does, so a
  grade that drained the colour out (traded it for lightness) would read as
  turning nothing. The bodies' mean chroma is returned with it, for b7 to hold
  against what the floor alone leaves (the check-skeptic's mutants: 70% and
  all of the chroma taken out passed ΔH at 6.0 and 1.1).
*/
const hueShift = (A, G, body) => {
  let n = 0, t = 0, c = 0;
  for (let i = 0; i < body.length; i++) {
    if (!body[i]) continue;
    const C1 = Math.hypot(A[3 * i + 1], A[3 * i + 2]), C2 = Math.hypot(G[3 * i + 1], G[3 * i + 2]);
    const dh = Math.atan2(G[3 * i + 2], G[3 * i + 1]) - Math.atan2(A[3 * i + 2], A[3 * i + 1]);
    t += Math.abs(2 * Math.sqrt(C1 * C2) * Math.sin(dh / 2)); c += C2; n++;
  }
  if (!n) throw new Error('litstage: no body pixels to read hues on');
  return { dH: t / n, chroma: c / n };
};

const rows = [];
for (const id of got.ids) {
  const r = got.out[id];
  const empty0 = r['empty:0'], dyed0 = r['dyed:0'];
  const A = labPx(dyed0, 0), B = labPx(empty0, 0), P = S * S;
  const body = new Uint8Array(P);
  for (let i = 0; i < P; i++) if (dE(A, B, i) > BODY_DE) body[i] = 1;
  const dark = measure(dyed0, empty0, 0, body);
  const again = r['again:0'];
  const same = again?.length === dyed0.length && again.every((v, k) => v === dyed0[k]);
  const row = { id, body: body.reduce((s, v) => s + v, 0) / P, dark, same };
  for (const f of FLOORS) {
    row[`none${f}`] = measure(dyed0, empty0, f, body, dark.seen);
    row[`hueNone${f}`] = hueShift(A, labPx(dyed0, f), body);
    if (!CONTROLS_ONLY) {
      const dg = r[`dyed:${AMOUNT[f]}`];
      row[`lit${f}`] = measure(dg, r[`empty:${AMOUNT[f]}`], f, body, dark.seen);
      row[`hue${f}`] = hueShift(A, labPx(dg, f), body);
    }
  }
  if (ctl) {
    const c = ctl.out[id]?.['dyed:1'];
    let worst = c && c.length === dyed0.length ? 0 : NaN;
    if (worst === 0) for (let k = 0; k < c.length; k++) if (k % 4 !== 3) worst = Math.max(worst, Math.abs(c[k] - dyed0[k]));
    row.zero = worst;
    // And the plain lab at 1 is not the control at 1: the marks hold the grade, not nothing.
    const lit = r['dyed:1'];
    row.reaches = !!(c && lit && lit.length === c.length && lit.some((v, k) => v !== c[k]));
  }
  rows.push(row);
  const pc = (v) => (100 * v).toFixed(0).padStart(3);
  console.log(`  ${id.padEnd(20)} body ${pc(row.body)}%  dark ${dark.contrast.toFixed(1).padStart(5)}  ` +
    FLOORS.map((f) => `${f * 100}%: ${pc(row[`none${f}`].contrast / dark.contrast)}%${row[`lit${f}`] ? ` lit ${pc(row[`lit${f}`].contrast / dark.contrast)}% kept ${pc(row[`none${f}`].kept)}/${pc(row[`lit${f}`].kept)}% ΔH ${row[`hueNone${f}`].dH.toFixed(1)}/${row[`hue${f}`].dH.toFixed(1)} C ${row[`hueNone${f}`].chroma.toFixed(0)}/${row[`hue${f}`].chroma.toFixed(0)}` : ''}`).join('  ') + (ctl ? `  zero ${row.zero}` : ''));
}

// ---- the lines
const pc = (v) => `${(100 * v).toFixed(0)}%`;
const worst = (list, f) => list.reduce((m, r) => (f(r) < f(m) ? r : m), list[0]);
const ratio = (r, k) => r[k].contrast / r.dark.contrast;
const cpu = (d) => d?.architecture === 'swiftshader';
const who = (d) => (d ? `${d.vendor} ${d.architecture}`.trim() : 'no adapter');

// The measure itself, on two pixels whose answer is known: white on black is
// 100 apart in a dark room, and over a floor of a tenth of white the black
// reads L* 36.2 against the white's 100 (0.1/1.1 of the room's white), 63.8
// apart. A floor added to the bytes rather than to the light would read 61.4.
{
  const w = labOf(1, 1, 1, 0), k = labOf(0, 0, 0, 0), w1 = labOf(1, 1, 1, 0.1), k1 = labOf(0, 0, 0, 0.1);
  const d0 = Math.hypot(w[0] - k[0], w[1] - k[1], w[2] - k[2]), d1 = Math.hypot(w1[0] - k1[0], w1[1] - k1[1], w1[2] - k1[2]);
  check('c1. the measure: white on black is 100 apart in the dark room and 63.8 over a floor of a tenth of white, added as light',
    Math.abs(d0 - 100) < 0.05 && Math.abs(d1 - 63.8) < 0.05, `${d0.toFixed(2)}, ${d1.toFixed(2)}`);
}
check('c2. the lab drew on the CPU rasteriser', cpu(got.drew) && (!ctl || cpu(ctl.drew)), `${who(got.drew)}${ctl ? `, ${who(ctl.drew)}` : ''}`);
{
  const differ = rows.filter((r) => !r.same);
  check(`c3. every look drawn twice is the same picture, byte for byte (${rows.length} looks)`,
    rows.length > 0 && !differ.length, differ.length ? `differ: ${differ.map((r) => r.id).join(', ')}` : '');
}
{
  const thin = rows.filter((r) => !(r.body > MIN_BODY && r.dark.contrast > MIN_DARK));
  check(`c4. every look has dye to measure: bodies over ${pc(MIN_BODY)} of the frame, ${MIN_DARK} apart from the field in the dark room (${rows.length} looks)`,
    rows.length >= (only ? 1 : 30) && !thin.length,
    thin.length ? `too little: ${thin.map((r) => `${r.id} ${pc(r.body)} ${r.dark.contrast.toFixed(0)}`).join(', ')}` : `least ${worst(rows, (r) => r.dark.contrast).id} ${worst(rows, (r) => r.dark.contrast).dark.contrast.toFixed(0)}`);
}
{
  const under = rows.filter((r) => ratio(r, 'none0.1') < HOLD[0.1]);
  const blackRun = BLACK.filter((id) => rows.some((r) => r.id === id));
  const blackUnder = blackRun.filter((id) => under.some((r) => r.id === id));
  check(`c5. the floor costs what 36a says: with nothing done, at 10% over half the looks fall under ${pc(HOLD[0.1])} of their dark-room contrast, the near-black ones among them`,
    (only || under.length > rows.length / 2) && blackUnder.length === blackRun.length && (only || blackRun.length === BLACK.length),
    `${under.length} of ${rows.length}, least ${worst(rows, (r) => ratio(r, 'none0.1')).id} ${pc(ratio(worst(rows, (r) => ratio(r, 'none0.1')), 'none0.1'))}; near-black under: ${blackUnder.join(', ') || 'none'}`);
}
{
  const hidden = rows.filter((r) => r['none0.1'].kept < SEEN_HOLD);
  const turned = worst(rows, (r) => -r['hueNone0.1'].dH);
  check(`c6. the floor alone hides thin dye in some look (under ${pc(SEEN_HOLD)} of it still seen at 10%) and turns no look's hues by ${HUE_MAX} or more`,
    hidden.length > 0 && rows.every((r) => r['hueNone0.1'].dH < HUE_MAX),
    `hidden in ${hidden.map((r) => `${r.id} ${pc(r['none0.1'].kept)}`).join(', ') || 'none'}; hues turned most in ${turned.id}, ${turned['hueNone0.1'].dH.toFixed(1)}`);
}

if (CONTROLS_ONLY) {
  console.log('SKIP  36a\'s own lines (--controls): they wait for the build');
} else {
  {
    const { outputFiles } = await build({ entryPoints: ['src/lib/outputConfig.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
    const oc = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
    const n = (v) => oc.normalizeOutput({ litStage: v }).litStage;
    const asks = [
      ['the default is 0', oc.DEFAULT_OUTPUT?.litStage === 0],
      ['a Wall saved before it reads 0', oc.normalizeOutput({}).litStage === 0],
      ['0.4 stays 0.4', n(0.4) === 0.4],
      ['2 reads 1', n(2) === 1],
      ['-1 reads 0', n(-1) === 0],
      ['junk reads 0', n('loud') === 0],
      ['no look carries it', got.carries.length === 0],
    ];
    const bad = asks.filter(([, ok]) => !ok);
    check('b1. Lit stage is the Wall\'s, 0 to 1 and 0 by default, and never a look\'s', !bad.length,
      bad.length ? `not so: ${bad.map(([w]) => w).join('; ')}${got.carries.length ? ` (${got.carries.join(', ')})` : ''}` : 'outputConfig.ts');
  }
  {
    const same = rows.filter((r) => !r.reaches);
    check('b2. the control is another program: the grade\'s marked lines are taken out of it, and at 1 every look draws differently without them',
      stripped > 0 && ctlJs !== plain.js && rows.length > 0 && !same.length,
      `${stripped} marked block${stripped === 1 ? '' : 's'} taken out${same.length ? `; the same at 1 without them: ${same.map((r) => r.id).join(', ')}` : ''}`);
  }
  {
    const off = rows.filter((r) => r.zero !== 0);
    check(`b3. at 0 every look is the plate without the grade, byte for byte (against the control at 1; ${rows.length} looks)`,
      !off.length && rows.length > 0, off.length ? `different: ${off.map((r) => `${r.id} ${r.zero}`).join(', ')}` : 'none different');
  }
  for (const f of [...FLOORS].reverse()) {
    const k = `lit${f}`, low = rows.filter((r) => ratio(r, k) < HOLD[f]), w = worst(rows, (r) => ratio(r, k));
    check(`b${f === 0.1 ? 4 : 5}. at ${f * 100}% with Lit stage at ${AMOUNT[f]}, every look keeps ${pc(HOLD[f])} of its dark-room contrast`,
      !low.length, `${low.length ? `under: ${low.map((r) => `${r.id} ${pc(ratio(r, k))}`).join(', ')}` : `least ${w.id} ${pc(ratio(w, k))}`} (with nothing done, least ${worst(rows, (r) => ratio(r, `none${f}`)).id} ${pc(ratio(worst(rows, (r) => ratio(r, `none${f}`)), `none${f}`))})`);
  }
  {
    const hid = rows.filter((r) => !(r['lit0.1'].kept >= SEEN_HOLD)), w = worst(rows, (r) => r['lit0.1'].kept);
    check(`b6. the bodies hold their size: at 10% with Lit stage at 1, ${pc(SEEN_HOLD)} of the pixels where dye was seen in the dark room are still seen, every look`,
      !hid.length, hid.length ? `hidden: ${hid.map((r) => `${r.id} ${pc(r['lit0.1'].kept)}`).join(', ')}` : `least ${w.id} ${pc(w['lit0.1'].kept)}`);
  }
  {
    const turned = rows.filter((r) => !(r['hue0.1'].dH < HUE_MAX)), w = worst(rows, (r) => -r['hue0.1'].dH);
    const drained = rows.filter((r) => !(r['hue0.1'].chroma >= r['hueNone0.1'].chroma));
    const cw = worst(rows, (r) => r['hue0.1'].chroma / r['hueNone0.1'].chroma);
    check(`b7. the looks keep their colours: at 10% with Lit stage at 1 no look's bodies turn in hue by ${HUE_MAX} (ΔH, on average) or more, or keep less colour (chroma) than the floor alone leaves`,
      !turned.length && !drained.length,
      `${turned.length ? `turned: ${turned.map((r) => `${r.id} ${r['hue0.1'].dH.toFixed(1)}`).join(', ')}` : `turned most ${w.id} ${w['hue0.1'].dH.toFixed(1)}`}; ${drained.length ? `drained: ${drained.map((r) => `${r.id} ${r['hue0.1'].chroma.toFixed(0)} of ${r['hueNone0.1'].chroma.toFixed(0)}`).join(', ')}` : `least colour kept ${cw.id} ${cw['hue0.1'].chroma.toFixed(0)} against ${cw['hueNone0.1'].chroma.toFixed(0)}`}`);
  }
  {
    // The app's own way in. Every line above draws through lab.render's
    // camera; this asks the app's plate view to take the amount from the
    // Wall (LiquidVisualizer.tsx, beside dimmerGain), and the Wall's panel to
    // offer it. Source, not pictures: the app's frames are the Mac's (19l),
    // and `npm run phone` and `npm run panel` hold the controls themselves.
    const lv = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
    const panel = readFileSync('src/components/OutputPanel.tsx', 'utf8');
    const fed = /\blitStage:\s*[^,\n]*\boutputCfg\w*(?:Ref\.current)?\.litStage\b/.test(lv);
    const offered = /\.litStage\b/.test(panel);
    check('b8. the app draws the Wall\'s amount: its plate view takes litStage from the output config, and the Wall\'s panel sets it',
      fed && offered, `${fed ? '' : 'LiquidVisualizer.tsx hands the plate no litStage from the Wall; '}${offered ? '' : 'OutputPanel.tsx has no litStage control'}` || 'both');
  }
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} litstage checks passed`);
process.exit(failed ? 1 : 0);
