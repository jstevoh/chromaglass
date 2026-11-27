#!/usr/bin/env node
/**
 * npm run padhits — the controller's pads play the liquid (PLAN 30c).
 *
 * The owner, 2026-11-27: the APC40's pads should be "reactive to momentary
 * presses - splatter, presses, etc.", rows should "combine colors, liquids,
 * and a tool ... in various ways", and "sliders and dials should make sense
 * and be related to each other". This drives the pure halves in node:
 *
 *   1. The holds (lib/padHits.ts): a held Drip drips again and stops on
 *      note-off; its drop is Tate's (alcohol's smaller than water's) and its
 *      pace the squeeze over the viscosity (syrup slower, a harder squeeze
 *      faster, aftertouch changing it mid-hold); Pour, Spray and Press send
 *      a gesture every tick while held and none after; Splatter's flicks fade
 *      as the brush empties; Streak climbs its lane; the place is the lane's.
 *   2. The physics numbers against hand-worked values (Tate, Torricelli vs
 *      Poiseuille, the atomiser's half point).
 *   3. The layouts (lib/padLayouts.ts): each pad layout is 40 pads with all
 *      three of tool, liquid and colour answered by the grid or Track Select,
 *      every pair different across the grid; switching a layout keeps every
 *      binding off the grid; Bank ◀ ▶ cycle the four and come round.
 *   4. The strips (lib/midi.ts apc40Mk2Map): each column's knob and fader are
 *      one subject (a named pair), nothing on two controls of one bank, the
 *      device knobs each tool's Amount, the crossfader the tilt.
 *   5. The wire: aftertouch parses, reaches no binding's source, and a map
 *      with pads survives a save and a load.
 *
 * And it fails when the feature is gone: with `--break` it never lets a pad
 * go (the note-off a button ignores) and must go red on every hold's "none
 * after" line, so a green here is not a harness that cannot see a hold.
 */
import { padOn, padOff, padPressure, stepPads, makePadHolds, placeHit, tateShare, dripInterval, pourShare, sprayShare, PAD_TICK_HZ, DRIP_FULL_S, FLICK_S } from '../src/lib/padHits.ts';
import { PAD_LAYOUTS, padLayoutBindings, withPadLayout, padLayoutOf, steppedLayout, isGridBinding, PAD_DYES } from '../src/lib/padLayouts.ts';
import { apc40Mk2Map, parseMidi, parseMidiMap, serializeMidiMap, eventSource, sourceKey, CHANNEL_PRESSURE } from '../src/lib/midi.ts';
import { amountOfKnob, knobOfAmount, PAD_TOOLS, LAYING_PAD_TOOLS } from '../src/lib/padTarget.ts';
import { DEFAULT_LIQUID_TYPES } from '../src/bottles.ts';

const BREAK = process.argv.includes('--break');
let fails = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const liq = id => DEFAULT_LIQUID_TYPES.find(l => l.id === id)?.behaviour ?? null;
const fixed = { range: (lo, hi) => (lo + hi) / 2 };

/** Hold a pad for `seconds`, stepping at the app's tick, and count what it sent while held and after. */
function hold(tool, liquid, seconds, { velocity = 1, after = 1, pressureAt = null } = {}) {
  const s = makePadHolds();
  const out = [];
  const dt = 1 / PAD_TICK_HZ;
  padOn(s, 0, 7, velocity, 0, { tool, liquid, paint: null, at: { u: 0.5, v: 0.5 } }, out);
  const atHit = out.length;
  let t = 0;
  const held = [];
  while (t < seconds - 1e-9) {
    t += dt;
    if (pressureAt && t >= pressureAt.t && !pressureAt.done) { padPressure(s, 0, 7, pressureAt.v); pressureAt.done = true; }
    const before = out.length;
    stepPads(s, t, out);
    for (let i = before; i < out.length; i++) held.push({ t, g: out[i] });
  }
  if (!BREAK) padOff(s, 0, 7);
  const n = out.length;
  for (let k = 0; k < after * PAD_TICK_HZ; k++) { t += dt; if (!BREAK) stepPads(s, t, out); }
  if (BREAK) { out.length = n; for (let k = 0; k < after * PAD_TICK_HZ; k++) stepPads(s, t + k * dt, out); }
  return { atHit, held, total: out.length - atHit, afterOff: out.length - n, gestures: out };
}

console.log('1. Pads held');
{
  const water = hold('dropper', liq('water'), 2);
  const drops = 1 + water.held.length;
  // Water at a full squeeze: one drop on the hit, then one each DRIP_FULL_S.
  check('Drip: the hit lets a drop go at once', water.atHit === 1, `${water.atHit}`);
  check('Drip: held for 2 s water keeps dripping, one each 0.25 s', drops >= 8 && drops <= 9, `${drops} drops`);
  check('Drip: let go, it stops', water.afterOff === 0, `${water.afterOff} after note-off`);
  const syrup = hold('dropper', liq('syrup'), 2);
  check('Drip: syrup at the same squeeze drips slower (μ 147 mPa·s)', 1 + syrup.held.length < drops, `${1 + syrup.held.length} vs water's ${drops}`);
  const soft = hold('dropper', liq('water'), 2, { velocity: 0.5 });
  check('Drip: a softer hit drips slower, the drop the same size', 1 + soft.held.length < drops && soft.gestures[0].gain === water.gestures[0].gain, `${1 + soft.held.length} drops, gain ${soft.gestures[0].gain}`);
  const pressed = hold('dropper', liq('water'), 2, { velocity: 0.3, pressureAt: { t: 0.2, v: 1 } });
  const light = hold('dropper', liq('water'), 2, { velocity: 0.3 });
  check('Drip: aftertouch pressed harder mid-hold drips faster', pressed.held.length > light.held.length, `${pressed.held.length} vs ${light.held.length}`);
  const alcohol = hold('dropper', liq('alcohol'), 0.1);
  check("Drip: alcohol's drop is Tate's, smaller than water's", alcohol.gestures[0].gain < 0.45 && alcohol.gestures[0].gain > 0.35, `gain ${alcohol.gestures[0].gain.toFixed(3)}`);

  for (const tool of ['pour', 'spray', 'press', 'blow', 'finger']) {
    const h = hold(tool, liq('water'), 1);
    const n = h.atHit + h.held.length;
    check(`${tool}: a gesture every tick while held (about ${PAD_TICK_HZ} in 1 s), none after`, n >= PAD_TICK_HZ - 1 && n <= PAD_TICK_HZ + 1 && h.afterOff === 0, `${n} held, ${h.afterOff} after`);
  }
  const oil = hold('pour', liq('oil'), 0.2), water2 = hold('pour', liq('water'), 0.2);
  check('Pour: oil pours less than water through the same spout', oil.gestures[0].gain < water2.gestures[0].gain * 0.5, `${oil.gestures[0].gain.toFixed(3)} vs ${water2.gestures[0].gain}`);
  const spl = hold('splatter', liq('water'), 2);
  const flicks = [spl.gestures[0], ...spl.held.map(x => x.g)];
  const fading = flicks.every((g, i) => i === 0 || g.gain < flicks[i - 1].gain);
  check('Splatter: the hit is the first flick, held it flicks again, each less', flicks.length >= 4 && fading, `${flicks.length} flicks: ${flicks.map(g => g.gain.toFixed(2)).join(' ')}`);
  check('Splatter: the flicks are a wrist\'s pace apart', spl.held.length > 0 && near(spl.held[0].t, FLICK_S, 1 / PAD_TICK_HZ + 1e-6), `first re-flick at ${spl.held[0]?.t.toFixed(3)} s`);
  const st = hold('streak', liq('water'), 0.5);
  const vs = st.held.map(x => x.g.v);
  check('Streak: the stroke climbs its lane while held', vs.length > 5 && vs.every((v, i) => i === 0 || v > vs[i - 1]), `v ${vs[0]?.toFixed(2)} → ${vs[vs.length - 1]?.toFixed(2)}`);
  const lanes = [0, 3, 7].map(l => placeHit(l, fixed).u);
  check('A pad lands in its lane: left pads on the left of the wall', lanes[0] < 0.125 && lanes[1] > 0.375 && lanes[1] < 0.5 && lanes[2] > 0.875, lanes.map(u => u.toFixed(3)).join(' '));
}

console.log('2. The physics');
{
  // Tate: V ∝ σ/ρ. Alcohol 22 mN/m, 0.79 g/cm³ against water's 72, 1.
  check("Tate's drop: alcohol is 0.387 of water's", near(tateShare(liq('alcohol')), (22 / 72) / 0.79, 1e-9), tateShare(liq('alcohol')).toFixed(4));
  check('Drip pace: water at full squeeze is DRIP_FULL_S', dripInterval(liq('water'), 1) === DRIP_FULL_S);
  check('Drip pace: no squeeze, no drip', dripInterval(liq('water'), 0) === Infinity);
  // Torricelli vs Poiseuille, by hand: a 2.5 mm bore, 2 cm long, 2 cm head.
  const r = 2.5e-3, L = 0.02, h = 0.02, g = 9.81;
  const want = (rho, mu) => Math.min(1, (Math.PI * r ** 4 * rho * g * h / (8 * mu * L)) / (Math.PI * r * r * Math.sqrt(2 * g * h)));
  check('Pour: water at the jet\'s rate', pourShare(liq('water')) === 1);
  check('Pour: oil Poiseuille-held, by hand', near(pourShare(liq('oil')), want(920, 0.049), 1e-6), `${pourShare(liq('oil')).toFixed(4)} vs ${want(920, 0.049).toFixed(4)}`);
  check('Pour: syrup less than oil', pourShare(liq('syrup')) < pourShare(liq('oil')), pourShare(liq('syrup')).toFixed(4));
  check('Spray: water a full mist, glycerine almost none', sprayShare(liq('water')) === 1 && sprayShare(liq('glycerine')) < 0.05, sprayShare(liq('glycerine')).toFixed(4));
  check('A tool Amount knob: middle 1, ends 1/5 and 5, round trip', near(amountOfKnob(0.5), 1, 1e-9) && near(amountOfKnob(0), 0.2, 1e-9) && near(amountOfKnob(1), 5, 1e-9) && near(knobOfAmount(amountOfKnob(0.3)), 0.3, 1e-9));
}

console.log('3. The layouts');
{
  const base = apc40Mk2Map(['a', 'b', 'c']);
  for (const layout of PAD_LAYOUTS.filter(l => l !== 'looks')) {
    const b = padLayoutBindings(layout, []);
    const pads = b.filter(x => x.target.kind === 'pad');
    const pick = b.filter(x => x.source.number === 0x33);
    const pickedAxis = new Set(pick.map(x => x.target.kind === 'dye' ? 'dye' : x.target.tool ? 'tool' : 'liquid'));
    const axes = pads.map(p => p.target);
    // Every laying pad answers all three, by the grid or by the one axis Track Select picks.
    const whole = axes.every(t => (t.tool !== undefined || pickedAxis.has('tool')) &&
      (t.tool && !LAYING_PAD_TOOLS.has(t.tool) ? true : (t.liquid !== undefined || pickedAxis.has('liquid')) && (t.dye !== undefined || pickedAxis.has('dye'))));
    const sig = new Set(axes.map(t => `${t.tool}|${t.liquid}|${t.dye}`));
    check(`${layout}: 40 pads, 8 pickers on one axis, each pad the hit's whole recipe`, pads.length === 40 && pick.length === 8 && pickedAxis.size === 1 && whole, `${pads.length} pads, ${pick.length} pickers (${[...pickedAxis]})`);
    // Press lays no colour, so Tools × Colours' Press row is one hand in eight lanes: 4 rows × 8 + 1.
    const want = layout === 'tools-colours' ? 33 : 40;
    check(`${layout}: no two pads the same (but by lane)`, sig.size === want, `${sig.size} different, want ${want}`);
    check(`${layout}: a column is a lane, left to right`, pads.every(p => p.target.lane === p.source.number % 8));
    const m = withPadLayout(base, layout, []);
    const offGrid = base.bindings.filter(x => !isGridBinding(x)).map(x => x.id).sort().join();
    check(`${layout}: switching keeps every binding off the grid`, m.bindings.filter(x => !isGridBinding(x)).map(x => x.id).sort().join() === offGrid);
    check(`${layout}: read back from the map`, padLayoutOf(m) === layout);
  }
  check('Colours across are a spectrum of eight', PAD_DYES.length === 8 && new Set(PAD_DYES).size === 8);
  let l = padLayoutOf(base), seen = [l];
  for (let i = 0; i < 4; i++) { l = steppedLayout(l, 1); seen.push(l); }
  check('Bank ▶ steps all four and comes round', new Set(seen).size === 4 && seen[4] === seen[0], seen.join(' → '));
  check('Bank ◀ steps back', steppedLayout('tools-colours', -1) === 'looks');
  check('Looks: the grid as it was', padLayoutOf(withPadLayout(withPadLayout(base, 'liquids-tools', ['a', 'b', 'c']), 'looks', ['a', 'b', 'c'])) === 'looks');
}

console.log('4. The strips');
{
  const m = apc40Mk2Map([]);
  const at = (num, ch = 0, bank) => m.bindings.find(b => b.source.kind === 'cc' && b.source.number === num && b.source.channel === ch && b.bank === bank)?.target;
  const PAIRS = [['dyeBudget', 'saturationBoost'], ['globalSpeed', 'turbulenceScale'], ['audioImpact', 'beatSqueeze'], ['plateRock', 'slosh'], ['bubbles', 'bubbleMelt'], ['beads', 'beadDrops'], ['iridescence', 'edgeRelief'], ['automateRate', 'hueJourney']];
  const strips = PAIRS.map((_, i) => [at(7, i)?.key, at(48 + i)?.key]);
  check('Each column: its fader and the knob above it are one subject', strips.every((s, i) => s[0] === PAIRS[i][0] && s[1] === PAIRS[i][1]), strips.map(s => s.join('/')).join(', '));
  const devs = PAD_TOOLS.map((t, i) => at(16 + i));
  check('The device knobs are each tool\'s Amount, Drip to Stir', devs.every((t, i) => t?.kind === 'toolAmount' && t.tool === PAD_TOOLS[i]));
  check('Shift puts the lamp and lens on them', at(16, 0, 1)?.key === 'lightPlay' && at(23, 0, 1)?.key === 'bloom');
  check('The crossfader tips the plate side to side, the cue encoder the other way', at(15)?.key === 'plateTiltX' && at(47)?.key === 'plateTiltY');
  const keys = new Map();
  let dup = '';
  for (const b of m.bindings) if (b.target.kind === 'setting') {
    const k = `${b.bank ?? '-'}:${b.target.key}`;
    if (keys.has(k)) dup += ` ${b.target.key}`;
    keys.set(k, 1);
  }
  check('No setting on two controls of one bank', dup === '', dup);
  check('Bank ◀ ▶ are the layout buttons', m.bindings.some(b => b.source.number === 0x3c && b.target.kind === 'padLayout' && b.target.step === -1) && m.bindings.some(b => b.source.number === 0x3d && b.target.kind === 'padLayout' && b.target.step === 1));
}

console.log('5. The wire');
{
  const poly = parseMidi([0xa0, 36, 90]), chan = parseMidi([0xd3, 70]);
  check('Poly aftertouch parses with its note', poly?.kind === 'pressure' && poly.number === 36 && poly.value === 90);
  check('Channel pressure parses for the whole channel', chan?.kind === 'pressure' && chan.channel === 3 && chan.number === CHANNEL_PRESSURE && chan.value === 70);
  const m = withPadLayout(apc40Mk2Map([]), 'liquids-tools', []);
  const back = parseMidiMap(serializeMidiMap(m));
  // Key order is not meaning (a loaded target is rebuilt field by field), so compare with keys sorted.
  const canon = x => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
  check('A map with pads, pickers and tool knobs survives a save and a load', canon(back) === canon(m) && back.bindings.length === m.bindings.length && padLayoutOf(back) === 'liquids-tools', `${back.bindings.length} of ${m.bindings.length} bindings`);
  const bad = JSON.parse(serializeMidiMap(m));
  bad.bindings.push({ id: 'x', source: { kind: 'note', channel: 0, number: 99 }, target: { kind: 'pad', tool: 'flamethrower', liquid: '<b>', lane: 40 } });
  const cleaned = parseMidiMap(JSON.stringify(bad)).bindings.find(b => b.id === 'x')?.target;
  check('A hand-edited pad is checked, not trusted', cleaned?.kind === 'pad' && cleaned.tool === undefined && cleaned.liquid === undefined && cleaned.lane === 7, JSON.stringify(cleaned));
  check('A note-on still finds its pad by source', sourceKey(eventSource(parseMidi([0x90, 32, 127]))) === 'note:0:32');
}

console.log(fails ? `\n${fails} FAIL` : '\nall ok');
if (BREAK) {
  // Run as buttons, the feature gone: this must have failed.
  if (fails === 0) { console.log('FAIL  --break stayed green: the check does not see the holds'); process.exit(1); }
  console.log('ok    --break went red, as it must');
  process.exit(0);
}
process.exit(fails ? 1 : 0);
