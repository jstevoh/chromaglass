#!/usr/bin/env node
/**
 * Does each liquid pour its own colour, and does a dye picked for it tint it?
 *
 *   npm run natural
 *
 * What was reported (the owner, 2026-10-05): "Some of the liquids don't
 * carry color. Let's make them by default the correct color, but allow them
 * to have color as well." Every bottle had one colour, and it was all dye:
 * Syrup poured red-orange, Alcohol mint, Oil orange, and Glycerine, Silicone,
 * Soap and Milk pale swatches that were neither the liquid nor a colour
 * anyone had picked. Picking a dye replaced the liquid's colour instead of
 * going into it.
 *
 * What the bottles carry now (`own` in src/types.ts) and what a pour lays
 * (`pourTint`, src/lib/liquidColour.ts, the one function every hand's pour
 * in LiquidVisualizer reads its colour and dose from), asked here without
 * the app, since it is arithmetic on the shelf:
 *
 *   1. Every bottle that is a liquid of its own says what colour it is.
 *      Ink, a dye, is the one that need not.
 *   2. Out of the box each pours its own colour, read against what the
 *      real liquid passes through the dish's 6 mm: Syrup amber (maple
 *      syrup's Amber grade, 50 to 75% at 560 nm through 10 mm, so 66 to 84%
 *      in the green at 6 mm, and the blue under half the green), Oil a pale
 *      gold (blue taken, red and green near clear), Ferrofluid near black,
 *      Milk laid as a white body (it scatters), and Glycerine, Alcohol,
 *      Silicone, Soap, Acid and Base laying no colour at all: clear liquid.
 *      Water keeps its blue dye by default and is clear when Natural.
 *   3. A dye picked for each tints it, by Beer and Lambert: the transmission
 *      laid is the liquid's times the dye's, channel by channel, so each
 *      channel's absorbance is the sum of the two. For a clear liquid that
 *      is the dye exactly, and for milk too (it scatters and absorbs nothing,
 *      and the plate's scattering is PLAN 18j). Controls: the dye laid
 *      differs from the liquid's own (it did tint it), and for a liquid that
 *      absorbs it differs from the dye alone (the liquid is still in it).
 *   4. Natural is the way back: setting the colour to `own` is the liquid
 *      with no dye, and a clear bottle given Pure White lays none either
 *      (white is clear liquid, lib/dye.ts).
 *   4b. A gesture (a take, the phone's and the remote's Drop) carries the
 *      colour laid (`laidColour`), so a take plays back as it was performed.
 *   5. A bottle with no `own` (the owner's own, from the Liquid Designer)
 *      pours its colour as it always did, at full dose.
 */
import { DEFAULT_LIQUID_TYPES } from '../src/types.ts';
import { pourTint, isNatural, isClearLiquid, laidColour } from '../src/lib/liquidColour.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const hex = (h) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  return [1, 2, 3].map(i => parseInt(m[i], 16) / 255);
};
const fmt = (c) => `(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const shelf = new Map(DEFAULT_LIQUID_TYPES.map(l => [l.id, l]));
const bottle = (id) => {
  const b = shelf.get(id);
  if (!b) throw new Error(`no bottle '${id}' on the shelf`);
  return b;
};

// ── 1. Every liquid of its own says what colour it is ────────────────
const DYES = new Set(['ink']);
for (const l of DEFAULT_LIQUID_TYPES) {
  if (DYES.has(l.id)) continue;
  check(`${l.name} says what colour it is`, typeof l.own === 'string' && /^#[0-9a-f]{6}$/i.test(l.own), l.own ?? 'none');
}

// ── 2. Out of the box, each pours its own colour ─────────────────────
const CLEAR = ['glycerine', 'alcohol', 'silicone', 'soap', 'acid', 'base'];
for (const id of CLEAR) {
  const b = bottle(id);
  const t = pourTint(b);
  check(`${b.name} pours clear by default: no colour laid`, isNatural(b) && isClearLiquid(b) && t.dose === 0, `natural ${isNatural(b)}, dose ${t.dose}`);
}
{
  const b = bottle('syrup');
  const t = pourTint(b);
  const { r, g, b: bl } = t.rgb;
  // Maple syrup, Amber grade: 50–75% at 560 nm through 10 mm; at 6 mm T^0.6.
  const lo = Math.pow(0.5, 0.6), hi = Math.pow(0.75, 0.6);
  check('Syrup pours amber by default', isNatural(b) && t.dose === 1 && g >= lo && g <= hi && bl < 0.5 * g && r > g,
    `${fmt(t.rgb)}, green ${g.toFixed(2)} in ${lo.toFixed(2)}–${hi.toFixed(2)} (Amber grade at 6 mm), blue under half of it`);
}
{
  const b = bottle('oil');
  const t = pourTint(b);
  check('Oil pours a pale gold by default', isNatural(b) && t.dose === 1 && t.rgb.r > 0.95 && t.rgb.g > 0.93 && t.rgb.b < 0.9 && t.rgb.b > 0.6,
    `${fmt(t.rgb)}: the blue taken, red and green near clear`);
}
{
  const b = bottle('ferrofluid');
  const t = pourTint(b);
  check('Ferrofluid is black by default', isNatural(b) && Math.max(t.rgb.r, t.rgb.g, t.rgb.b) < 0.15, fmt(t.rgb));
}
{
  const b = bottle('milk');
  const t = pourTint(b);
  check('Milk is laid as a white body: it scatters', isNatural(b) && !isClearLiquid(b) && t.dose === 1 && Math.min(t.rgb.r, t.rgb.g, t.rgb.b) > 0.99 && (b.behaviour?.scatter ?? 0) > 0,
    `${fmt(t.rgb)}, dose ${t.dose}, scatter ${b.behaviour?.scatter}`);
}
{
  const b = bottle('water');
  const t = pourTint(b);
  check('Water keeps a dye by default: the first drop shows', !isNatural(b) && t.dose === 1 && t.rgb.b > t.rgb.r + 0.3, `${b.color} ${fmt(t.rgb)}`);
  const n = pourTint({ ...b, color: b.own });
  check('Water with Natural picked is clear', n.dose === 0, `dose ${n.dose}`);
}

// ── 3. A dye picked for each tints it (Beer–Lambert) ─────────────────
const PICKS = ['#ff0033', '#2266ff', '#33cc55'];
for (const l of DEFAULT_LIQUID_TYPES) {
  if (!l.own) continue;
  const o = hex(l.own);
  let worst = 0, tinted = true, stillIn = true;
  for (const dye of PICKS) {
    const t = pourTint({ ...l, color: dye });
    const d = hex(dye);
    const want = o.map((c, i) => c * d[i]);
    const got = [t.rgb.r, t.rgb.g, t.rgb.b];
    worst = Math.max(worst, ...got.map((v, i) => Math.abs(v - want[i])));
    if (t.dose !== 1) tinted = false;
    // It tinted it: what lands is not the liquid's own colour.
    if (got.every((v, i) => near(v, o[i], 0.02))) tinted = false;
    // And the liquid is still in it, where it absorbs anything. Milk does
    // not: it is white because it scatters, which the plate cannot draw
    // yet (PLAN 18j), so dyed milk lays the dye, as clear liquid does.
    if (Math.min(...o) < 0.96 && got.every((v, i) => near(v, d[i], 0.02))) stillIn = false;
  }
  check(`${l.name} takes a dye: what it lays is its own colour times the dye's`, worst < 1e-6 && tinted && stillIn,
    `worst channel off by ${worst.toExponential(1)}${tinted ? '' : ', a dye laid nothing or only the liquid'}${stillIn ? '' : ', the liquid lost its own colour'}`);
}
{
  // The absorbances add: −ln(T_laid) = −ln(T_own) − ln(T_dye), on syrup with a blue.
  const b = bottle('syrup');
  const t = pourTint({ ...b, color: '#2266ff' });
  const o = hex(b.own), d = hex('#2266ff');
  const got = [t.rgb.r, t.rgb.g, t.rgb.b].map(v => -Math.log(v));
  const want = o.map((c, i) => -Math.log(c) - Math.log(d[i]));
  const off = Math.max(...got.map((v, i) => Math.abs(v - want[i])));
  check('Amber syrup with a blue dye: the absorbances add, channel by channel', off < 1e-9, `laid ${fmt(t.rgb)}, off ${off.toExponential(1)}`);
}

// ── 4. Natural is the way back ───────────────────────────────────────
for (const l of DEFAULT_LIQUID_TYPES) {
  if (!l.own) continue;
  const dyed = { ...l, color: '#ff0033' };
  const back = { ...dyed, color: l.own.toUpperCase() };
  const a = pourTint(back), z = pourTint({ ...l, color: l.own });
  check(`${l.name}: Natural after a dye is the liquid with none`, isNatural(back) && !isNatural(dyed) && a.dose === z.dose && near(a.rgb.r, z.rgb.r) && near(a.rgb.g, z.rgb.g) && near(a.rgb.b, z.rgb.b),
    `dose ${a.dose}, ${fmt(a.rgb)}`);
}
{
  const t = pourTint({ ...bottle('glycerine'), color: '#ffffff' });
  check('Glycerine given Pure White lays no colour: white is clear liquid', t.dose === 0, `dose ${t.dose}`);
  // Control: the gesture's own colour is read the same way (a take, the phone's Drop).
  const g = pourTint(bottle('glycerine'), '#ff0033');
  check('A gesture carrying a dye tints a clear bottle with it', g.dose === 1 && near(g.rgb.r, 1) && g.rgb.g < 0.01, fmt(g.rgb));
}

// ── 4b. What a gesture carries is what was laid ─────────────────────
// A take records laidColour and plays it back as it comes, so a take
// recorded with clear glycerine lays nothing, and one recorded with amber
// syrup lays amber whatever bottle is picked at playback.
{
  const c = laidColour(bottle('glycerine'));
  check('A take of clear glycerine records that it laid no colour', c.clear === true && c.color === undefined, JSON.stringify(c));
  const s = laidColour(bottle('syrup'));
  check('A take of syrup records the amber it laid', s.color === '#debf45' && !s.clear, JSON.stringify(s));
  const r = laidColour({ ...bottle('glycerine'), color: '#ff0000' });
  check('A take of glycerine with Cherry Red records red', r.color === '#ff0000', JSON.stringify(r));
  const sb = laidColour(bottle('syrup'), '#2266ff');
  const t = pourTint(bottle('syrup'), '#2266ff');
  const back = hex(sb.color);
  check('The remote\'s Drop with a blue picked for syrup sends the green it lays', near(back[0], t.rgb.r, 1 / 255) && near(back[1], t.rgb.g, 1 / 255) && near(back[2], t.rgb.b, 1 / 255), `${sb.color}`);
}

// ── 5. The owner's own bottles pour as they did ─────────────────────
{
  const mine = { id: 'mine', name: 'Mine', color: '#ffffff', description: '', injectRadius: 3, injectAmount: 0.6, heatAmount: 0 };
  const t = pourTint(mine);
  check('A bottle with no own colour pours its colour at full dose, white included', t.dose === 1 && near(t.rgb.r, 1) && near(t.rgb.g, 1) && near(t.rgb.b, 1), `dose ${t.dose}`);
  const ink = bottle('ink');
  const i = pourTint(ink);
  const want = hex(ink.color);
  check('Ink is a dye: it pours its colour as it always did', i.dose === 1 && near(i.rgb.r, want[0]) && near(i.rgb.g, want[1]) && near(i.rgb.b, want[2]), fmt(i.rgb));
}

const passed = checks.filter(c => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
