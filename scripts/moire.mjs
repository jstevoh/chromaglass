#!/usr/bin/env node
/**
 * The moiré pack's sheets are optics, and off is off (PLAN 42a).
 *
 *   npm run moire        (the lab, on SwiftShader: two labs, about four minutes)
 *
 * What was asked: the owner wants a paid pack of the moiré transparencies a
 * liquid light crew stacks on the overhead (two printed sheets, the top one
 * turned by hand), simulated as the real interference and not drawn as a
 * picture of one. So this asks the plate for what the optics say, on the real
 * plate shader:
 *
 *   1. off is off: every look that does not carry the sheets draws byte for
 *      byte as a lab built with the sheets' call taken out (a control
 *      program, like lampzero's), and the pack's own looks do differ;
 *   2. the fringe is the difference of the two gratings: two line sheets of
 *      L lines a frame, the upper turned by an angle a, beat at
 *      2 L sin(a/2) fringes a frame, and two of the same angle at pitches L
 *      and 1.15 L beat at 0.15 L; read as the strongest frequency of the
 *      plate averaged along the fringes, within 6%;
 *   3. light through two sheets is the product: a resolved sheet (60 lines a
 *      frame, its tent integral running, not the shortcut past a period)
 *      passes its mean, 92% of (half clear + half at 2%), and two crossed at
 *      45° pass that squared, within 5% each;
 *   4. no false moiré: a single sheet finer than the pixels (a period of 1.02
 *      and of 1.1 px, where a sampled grating aliases into a beat of 50 and
 *      11 px against the pixel grid, both just inside the integral's reach) is a flat grey, under 1.5% row to row and
 *      column to column, measured against the lamp alone (the first runs read
 *      4.5% sheets or none: the lamp's own hot-spot toward the corners);
 *   5. the gap is the lens's defocus: at 15 mm, lines 4 mm apart keep the
 *      share of their contrast at 0 mm that the disc of confusion predicts
 *      (from MOIRE_NA and the stage's 250 mm, through the pixel's tent), within
 *      15% (the first run asked it of lines 10 mm apart, which a 1.8 mm disc
 *      should and did leave at 80%: the line asked the optics for the wrong
 *      thing);
 *   6. the liquid bends the lower sheet and not the upper: over a pool of dye
 *      (the plate's surface is the dye's depth: its slope is the plate's own
 *      relief, normal0; the first run poured oil, whose phase the plate does
 *      not draw as relief, and read nothing anywhere), at the pool's sloping
 *      edge (the second run read its flat middle), and where: the lower
 *      sheet's lines run up the frame, so a bend shows on the pool's left and
 *      right and hardly at its top and bottom, also with the dish turned 45°
 *      (the slope is turned back from the dish's frame to the screen's);
 *      what the two sheets pass changes inside the lens more than five times
 *      as much with the lower sheet in play as with the upper alone, the
 *      same at a gap of 0 mm (no depth, no bend) stays at the upper's level,
 *      and outside the lens nothing changes;
 *   7. the sheet's clock and its angle are one turn: 15 rpm for one second of
 *      the stage's clock (turnClocks) draws exactly what a Turn of 90° draws,
 *      and not what a Turn of 0° draws;
 *   8. every design is its own: each of the ten, alone on the lower sheet,
 *      draws something no other design draws and not the bare lamp (a name the
 *      shader's index does not know would draw no sheet at all).
 */
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';
import { stageClocks, turnClocks } from '../src/lib/stageClocks.ts';
import { MOIRE_SHEETS } from '../src/lib/moire.ts';

const clock = stageClocks();
turnClocks(clock, 1, { moireSpin: 15 });
const SHEETS = MOIRE_SHEETS.map(m => m.id).filter(id => id !== 'none');

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/* The control: the sheets' one call site, back to the colour it filters. */
const BEFORE_MOIRE = {
  name: 'before-moire',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]plateMoire\.ts$/ }, (a) => {
      const s = readFileSync(a.path, 'utf8');
      const re = /color \* moireSheets\(uv, normal0\)/g;
      const n = s.match(re)?.length ?? 0;
      if (n !== 1) throw new Error(`moire: the control found ${n} of 1 sheet call in wgsl/plateMoire.ts`);
      return { contents: s.replace(re, 'color'), loader: 'ts' };
    });
  },
};

const S = 256;
const POOLS = [[0.35, 0.4, 0.12, [1.2, 0.3, 0.8], 1.2], [0.65, 0.6, 0.1, [0.2, 1.0, 0.9], 1.0]];

const everyLook = (lab) => lab.page.evaluate(async ([pools]) => {
  await lab.create(128);
  for (const p of pools) lab.dye(...p);
  lab.flush(); await lab.step(2);
  const out = [];
  for (const id of lab.lookIds()) {
    const s = lab.look(id).settings;
    out.push([id, (s.moireAmount ?? 0) > 0, await lab.render(160, s, {})]);
  }
  return { drew: lab.adapter(), looks: out };
}, [POOLS]);

const then = await openLab({ software: true, plugins: [BEFORE_MOIRE], tag: 'before-moire' });
let looksThen;
try { ({ looks: looksThen } = await everyLook(then)); } finally { await then.close(); }

const lab = await openLab({ software: true });
let drew, looksNow, R;
try {
  ({ drew, looks: looksNow } = await everyLook(lab));
  R = await lab.page.evaluate(async ([S, turn, sheets]) => {
    const base = { lampGround: 1, moireAmount: 1, moireGap: 0, moireSlide: 0, moireRatio: 1, moireCurl: 0.3, moireFlip: false, moireSpin: 0 };
    const blank = async () => { await lab.create(128); lab.flush(); await lab.step(2); };
    const shot = (s, cam = {}) => lab.render(S, { ...base, ...s }, { zoom: 1, macroAmount: 0, cx: 0.5, cy: 0.5, bubbles: 0, ...cam });
    await blank();
    const r = {};
    r.lamp = await shot({ moireAmount: 0 });
    r.turned = await shot({ moireSheetA: 'lines', moireSheetB: 'lines', moireDensity: 24, moireAngle: 8 });
    r.scaled = await shot({ moireSheetA: 'lines', moireSheetB: 'lines', moireDensity: 24, moireAngle: 0, moireRatio: 1.15 });
    r.fine1 = await shot({ moireSheetA: 'lines', moireSheetB: 'none', moireDensity: 60 });
    r.fine2 = await shot({ moireSheetA: 'lines', moireSheetB: 'lines', moireDensity: 60, moireAngle: 45 });
    r.alias1 = await shot({ moireSheetA: 'lines', moireSheetB: 'none', moireDensity: 250 });
    r.mid1 = await shot({ moireSheetA: 'lines', moireSheetB: 'none', moireDensity: 233 });
    r.sharp = await shot({ moireSheetA: 'lines', moireSheetB: 'none', moireDensity: 60, moireGap: 0 });
    r.soft = await shot({ moireSheetA: 'lines', moireSheetB: 'none', moireDensity: 60, moireGap: 15 });
    r.angle90 = await shot({ moireSheetA: 'spokes', moireSheetB: 'zoom', moireAngle: 90 });
    r.clock90 = await shot({ moireSheetA: 'spokes', moireSheetB: 'zoom', moireAngle: 0 }, { moireTurn: turn });
    r.angle0 = await shot({ moireSheetA: 'spokes', moireSheetB: 'zoom', moireAngle: 0 });
    r.designs = [];
    for (const id of sheets) r.designs.push([id, await shot({ moireSheetA: id, moireSheetB: 'none', moireDensity: 30 })]);
    // The liquid: one pool of dye in the middle, and the same plate without it.
    const lens = async () => { await lab.create(128); lab.dye(0.5, 0.5, 0.14, [0.5, 0.3, 0.4], 1.4); lab.flush(); await lab.step(10); };
    const pair = { moireDensity: 24, moireAngle: 6, moireGap: 6 };
    for (const [tag, s, cam = {}] of [
      ['both', { moireSheetA: 'lines', moireSheetB: 'lines', ...pair }],
      ['upper', { moireSheetA: 'none', moireSheetB: 'lines', ...pair }],
      ['flat', { moireSheetA: 'lines', moireSheetB: 'lines', ...pair, moireGap: 0 }],
      ['turned', { moireSheetA: 'lines', moireSheetB: 'lines', ...pair }, { rotation: Math.PI / 4 }],
    ]) {
      await blank();
      r[`${tag}Clear`] = await shot(s, cam); r[`${tag}ClearOff`] = await shot({ moireAmount: 0 }, cam);
      await lens();
      r[`${tag}Lens`] = await shot(s, cam); r[`${tag}LensOff`] = await shot({ moireAmount: 0 }, cam);
    }
    return r;
  }, [S, clock.moire, SHEETS]);
} finally { await lab.close(); }

const who = (d) => d ? `${d.vendor} ${d.architecture}`.trim() : 'no adapter';
check('the lab drew on the CPU rasteriser', drew?.architecture === 'swiftshader', who(drew));

// 1. Off is off.
const same = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);
const plain = looksNow.filter(([, on]) => !on);
const differ = plain.filter(([id, , px], i) => { const t = looksThen.find(l => l[0] === id); return !t || !same(px, t[2]); });
const pack = looksNow.filter(([, on]) => on);
const packSame = pack.filter(([id, , px]) => { const t = looksThen.find(l => l[0] === id); return t && same(px, t[2]); });
check(`every look without the sheets draws byte for byte as the plate without them (${plain.length} looks)`,
  plain.length >= 30 && !differ.length, differ.length ? `different: ${differ.map(d => d[0]).join(', ')}` : 'none different');
check(`the pack's looks carry the sheets and draw them (${pack.length})`, pack.length >= 4 && !packSame.length,
  packSame.length ? `unchanged: ${packSame.map(d => d[0]).join(', ')}` : pack.map(p => p[0]).join(', '));

// Luminance, its row and column means, and the strongest frequency of a profile.
const lum = (px) => { const o = new Float64Array(S * S); for (let i = 0; i < S * S; i++) o[i] = (px[4 * i] + px[4 * i + 1] + px[4 * i + 2]) / 3; return o; };
const rowMeans = (l) => Array.from({ length: S }, (_, y) => { let t = 0; for (let x = 0; x < S; x++) t += l[y * S + x]; return t / S; });
const colMeans = (l) => Array.from({ length: S }, (_, x) => { let t = 0; for (let y = 0; y < S; y++) t += l[y * S + x]; return t / S; });
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const peak = (prof) => {
  const m = mean(prof);
  let best = 0, bf = 0;
  for (let f = 1; f <= 12; f += 0.02) {
    let c = 0, s = 0;
    prof.forEach((v, i) => { const a = 2 * Math.PI * f * i / S; c += (v - m) * Math.cos(a); s += (v - m) * Math.sin(a); });
    const p = c * c + s * s;
    if (p > best) { best = p; bf = f; }
  }
  return bf;
};
const near = (got, want, tol) => Math.abs(got - want) / want <= tol;

// 2. The fringe is the difference. Lines run up the frame (phase L x), so a
// turn's fringes run across it (read down the rows) and a pitch's run up it.
const fTurn = peak(rowMeans(lum(R.turned)));
const wantTurn = 2 * 24 * Math.sin(4 * Math.PI / 180);
check('two line sheets turned 8° beat at 2 L sin(a/2) fringes a frame', near(fTurn, wantTurn, 0.06), `${fTurn.toFixed(2)} against ${wantTurn.toFixed(2)}`);
const fScale = peak(colMeans(lum(R.scaled)));
check('two line sheets at pitches L and 1.15 L beat at 0.15 L', near(fScale, 0.15 * 24, 0.06), `${fScale.toFixed(2)} against ${(0.15 * 24).toFixed(2)}`);

// 3. Two sheets pass the product.
const lamp = mean(Array.from(lum(R.lamp)));
const one = mean(Array.from(lum(R.fine1))) / lamp;
const two = mean(Array.from(lum(R.fine2))) / lamp;
const want1 = 0.92 * (0.5 + 0.5 * 0.02);
check('a resolved sheet passes its mean, 92% of half clear and half at 2%', near(one, want1, 0.05), `${one.toFixed(3)} against ${want1.toFixed(3)} (lamp ${lamp.toFixed(1)})`);
check('two of them crossed pass the product', near(two, want1 * want1, 0.05), `${two.toFixed(3)} against ${(want1 * want1).toFixed(3)}`);

// 4. No false moiré.
// Against the lamp alone: the lamp's own hot-spot falls off toward the corners
// by 4 to 5% (the first two runs read exactly that, sheets or none).
const lampL = lum(R.lamp);
const flatness = (px) => { const l = lum(px).map((v, i) => v / Math.max(1, lampL[i])); const all = [...rowMeans(l), ...colMeans(l)]; const m = mean(all); return Math.max(...all.map(v => Math.abs(v - m))) / m; };
const fl1 = flatness(R.alias1), fl2 = flatness(R.mid1);
check('a single sheet finer than the pixels is a flat grey, no beat against the pixel grid', fl1 < 0.015 && fl2 < 0.015,
  `worst row or column ${(fl1 * 100).toFixed(2)}% at 1.02 px, ${(fl2 * 100).toFixed(2)}% at 1.1 px`);

// 5. The gap is the lens's defocus.
const contrast = (px) => { const c = colMeans(lum(px)); const m = mean(c); return Math.sqrt(mean(c.map(v => (v - m) ** 2))) / m; };
const cSharp = contrast(R.sharp), cSoft = contrast(R.soft);
// The prediction: the fundamental through the tent whose variance is the
// pixel's (w^2/6) plus the disc's (r^2/4), r = 15 mm / 250 mm x 0.12 (plateMoire.ts).
const sinc2 = (x) => (x === 0 ? 1 : (Math.sin(Math.PI * x) / (Math.PI * x)) ** 2);
const px1 = 1 / S, rDisc = 15 / 250 * 0.12;
const predicted = sinc2(60 * Math.sqrt(px1 * px1 + 1.5 * rDisc * rDisc)) / sinc2(60 * px1);
check('at a 15 mm gap lines 4 mm apart keep the share of their contrast the disc of confusion predicts', near(cSoft / cSharp, predicted, 0.15),
  `${(cSoft / cSharp).toFixed(3)} against ${predicted.toFixed(3)} (${cSoft.toFixed(3)} and ${cSharp.toFixed(3)} at 0 mm)`);

// 6. The liquid bends the lower sheet.
const passed = (on, off) => { const a = lum(on), b = lum(off); return Float64Array.from(a, (v, i) => v / Math.max(1, b[i])); };
const change = (tag) => {
  const clear = passed(R[`${tag}Clear`], R[`${tag}ClearOff`]);
  const lens = passed(R[`${tag}Lens`], R[`${tag}LensOff`]);
  let inside = 0, ni = 0, outside = 0, no = 0, side = 0, ns = 0, top = 0, nt = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x / S - 0.5, y / S - 0.5);
    const v = Math.abs(lens[y * S + x] - clear[y * S + x]);
    // The pool's edge, where its surface slopes (its middle is flat and bends nothing).
    if (d > 0.07 && d < 0.2) {
      inside += v; ni++;
      if (Math.abs(x / S - 0.5) > 2 * Math.abs(y / S - 0.5)) { side += v; ns++; }
      else if (Math.abs(y / S - 0.5) > 2 * Math.abs(x / S - 0.5)) { top += v; nt++; }
    } else if (d > 0.3) { outside += v; no++; }
  }
  return { inside: inside / ni, outside: outside / no, side: side / ns, top: top / nt };
};
const both = change('both'), upper = change('upper'), flat = change('flat'), turned = change('turned');
check('over a pool of dye the lower sheet is bent: five times the change of the upper alone', both.inside > 5 * Math.max(upper.inside, 0.002),
  `${both.inside.toFixed(4)} against ${upper.inside.toFixed(4)}`);
check('at a gap of 0 mm there is no depth to bend through', flat.inside < 2 * Math.max(upper.inside, 0.002), `${flat.inside.toFixed(4)}`);
check('the bend is across the lines: the pool\'s left and right change three times its top and bottom, the dish still or turned 45°',
  both.side > 3 * both.top && turned.side > 3 * turned.top,
  `${both.side.toFixed(4)} against ${both.top.toFixed(4)}; turned ${turned.side.toFixed(4)} against ${turned.top.toFixed(4)}`);
check('and outside the lens nothing changes', Math.max(both.outside, upper.outside, flat.outside) < 0.01,
  `${both.outside.toFixed(4)}, ${upper.outside.toFixed(4)}, ${flat.outside.toFixed(4)}`);

// 7. One turn.
check('15 rpm for a second of the stage\'s clock draws what a Turn of 90° draws, and not a Turn of 0°',
  Math.abs(clock.moire - 0.25) < 1e-12 && same(R.angle90, R.clock90) && !same(R.angle0, R.angle90), `the clock read ${clock.moire} turns`);

// 8. Every design is its own.
const blankL = R.lamp;
const alike = [];
R.designs.forEach(([a, pa], i) => {
  if (same(pa, blankL)) alike.push(`${a} = the bare lamp`);
  R.designs.slice(i + 1).forEach(([b, pb]) => { if (same(pa, pb)) alike.push(`${a} = ${b}`); });
});
check(`every design draws something of its own (${R.designs.length})`, R.designs.length === 10 && !alike.length, alike.join(', ') || R.designs.map(d => d[0]).join(', '));

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} moire checks passed`);
process.exit(failed ? 1 : 0);
