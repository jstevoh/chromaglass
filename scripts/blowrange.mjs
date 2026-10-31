#!/usr/bin/env node
/**
 * Blow's Amount runs from a breath that only ripples the colour to a gale.
 *
 *   npm run blowrange      (node only: src/lib/breath.ts and src/lib/bubbles.ts)
 *
 * Reported (PLAN.md QA-20): "Blow amount isn't sensitive enough. At its
 * lowest settings it still blows a ton of ink and creates a lot of bubbles.
 * Needs a gentler bottom end (gentle breeze) and a higher top end
 * (hurricane)." The moving wind's stress already went with the Amount
 * squared (lib/breath.ts, layBreath's share; `npm run airblow` measures what
 * it moves), but the air the wind put into the liquid did not go with the
 * Amount at all: the app spawned two bubbles on every sixth step of a moving
 * Blow, whatever the dial said, and every bubble pumps the colour out from
 * under it. And the straw's bubble had a floor that held every Amount under
 * about a fifth at the same breath.
 *
 * Here the hands' rules are played as the app plays them (the Amount a,
 * share a², 60 steps a second, a fresh BubbleField of the app's 192 cells),
 * the old rule beside the new for the record:
 *
 *   1. A breath gentler than the speed the surface tears at (the blowing
 *      number N_B = ρ_air U² / 2√(ρgσ) past 1, about 5.4 m/s against a firm
 *      breath's 8) takes no air in: no bubbles from three seconds of wind at
 *      Amount 0.05, 0.25 or 0.5, where the old rule laid as many as at 1.
 *   2. A firm breath, the default Amount 1, takes air in as often as it did:
 *      ten spawns a second, within a fifth over ten seconds of steps.
 *   3. And a second at 120 steps a second takes in what a second at 60 does
 *      (the old count a step took twice as much).
 *   4. A gale takes more the harder it blows: Amount 2 more than 1, Amount 5
 *      more than 2, and on the plate at 5 at least twice the bubbles of 1
 *      after a second (the plate's own cover limit bounds it after that).
 *   5. The straw's bubble grows as fast as the breath goes: after a second,
 *      its area at Amount 0.05, 0.2, 0.5 and 1 rises with the Amount and in
 *      proportion to it within a fifth (the old floor made 0.05 and 0.2 the
 *      same breath).
 *   6. And the app calls them so: the moving wind's bubbles in
 *      LiquidVisualizer.tsx go by airTaken and spawnsOf, with no step count
 *      left, for the mouse's hands and for a remote's; the straw is given
 *      strawFlow of the share.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const outB = 'node_modules/.cache/blowrange-breath.mjs';
const outF = 'node_modules/.cache/blowrange-bubbles.mjs';
await build({ entryPoints: ['src/lib/breath.ts'], bundle: true, format: 'esm', platform: 'node', outfile: outB, logLevel: 'warning' });
await build({ entryPoints: ['src/lib/bubbles.ts'], bundle: true, format: 'esm', platform: 'node', outfile: outF, logLevel: 'warning' });
const { airTaken, spawnsOf, strawFlow, breathSpeed, blowingNumber, AIR_TAKEN_FROM, WIND_SPAWNS_PER_SECOND } = await import(`../${outB}`);
const { BubbleField } = await import(`../${outF}`);

const N = 192;
const still = () => [0, 0];
// A deterministic draw, so a run is a run (the app's is DICE.hands).
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

/*
  `seconds` of a moving Blow at Amount `a`, `rate` steps a second: the
  spawns the wind asks for, and the bubbles on a fresh plate after it. `old`
  plays the rule as it was: two bubbles on every sixth step, any Amount.
*/
function wind(a, { seconds = 3, rate = 60, old = false } = {}) {
  const f = new BubbleField(N);
  const u = rng(7);
  const dt = 1 / rate, k = a * a;
  let spawns = 0;
  for (let step = 0; step < seconds * rate; step++) {
    const x = 40 + (step / (seconds * rate)) * 110, y = 96;
    const n = old ? (step % 6 === 0 ? 1 : 0) : spawnsOf(WIND_SPAWNS_PER_SECOND * airTaken(k) * dt, u());
    if (n > 0) { f.spawn(x, y, 1.2 * 1.5, 2 * n, 3 * 1.5); spawns += n; }
    f.step(dt, still, 0, 0, 0);
  }
  return { spawns, bubbles: f.bubbles.length };
}

console.log(`  the surface tears at ${AIR_TAKEN_FROM.toFixed(2)} m/s (N_B = 1); a firm breath ${breathSpeed(1).toFixed(1)} m/s, N_B ${blowingNumber(breathSpeed(1)).toFixed(2)}; Amount 5 ${breathSpeed(25).toFixed(0)} m/s, N_B ${blowingNumber(breathSpeed(25)).toFixed(1)}`);
const AMOUNTS = [0.05, 0.25, 0.5, 0.7, 1, 2, 5];
const now = {}, was = {};
for (const a of AMOUNTS) {
  now[a] = wind(a); was[a] = wind(a, { old: true });
  console.log(`  Amount ${a}: ${breathSpeed(a * a).toFixed(1)} m/s, air taken ${airTaken(a * a).toFixed(2)} of a firm breath's; three seconds of wind: ${now[a].spawns} spawns, ${now[a].bubbles} bubbles on the plate (before: ${was[a].spawns}, ${was[a].bubbles})`);
}

// 1.
check('a breath gentler than the speed the surface tears at takes no air in',
  [0.05, 0.25, 0.5].every((a) => now[a].spawns === 0 && now[a].bubbles === 0) && was[0.05].bubbles > 0,
  `Amount 0.05 / 0.25 / 0.5: ${[0.05, 0.25, 0.5].map((a) => now[a].bubbles).join(' / ')} bubbles (before ${[0.05, 0.25, 0.5].map((a) => was[a].bubbles).join(' / ')})`);

// 2. and 3.
{
  const at60 = wind(1, { seconds: 10, rate: 60 }).spawns, at120 = wind(1, { seconds: 10, rate: 120 }).spawns;
  const old60 = wind(1, { seconds: 10, rate: 60, old: true }).spawns, old120 = wind(1, { seconds: 10, rate: 120, old: true }).spawns;
  check('a firm breath (the default Amount) takes air in as often as it did',
    Math.abs(at60 / 100 - 1) < 0.2 && old60 === 100, `${at60} spawns in ten seconds at 60 steps a second, before ${old60}`);
  check('and a second at 120 steps a second takes in what one at 60 does',
    Math.abs(at120 / at60 - 1) < 0.2, `${at120} against ${at60} (before ${old120} against ${old60})`);
}

// 4.
{
  const s1 = wind(1, { seconds: 1 }), s2 = wind(2, { seconds: 1 }), s5 = wind(5, { seconds: 1 });
  check('a gale takes more air in the harder it blows',
    airTaken(4) > airTaken(1) && airTaken(25) > airTaken(4) && s5.bubbles >= 2 * s1.bubbles && s1.bubbles > 0,
    `air taken at Amount 1 / 2 / 5: ${[1, 4, 25].map((k) => airTaken(k).toFixed(1)).join(' / ')}; bubbles on the plate after a second ${s1.bubbles} / ${s2.bubbles} / ${s5.bubbles}`);
}

// 5.
{
  const area = (a, flow) => {
    const f = new BubbleField(N);
    for (let t = 0; t < 60; t++) { f.blow(96, 96, 1 / 60, flow(a)); f.step(1 / 60, still, 0, 0, 0); }
    const b = f.bubbles.find((q) => q.straw);
    return b ? Math.PI * b.r * b.r : 0;
  };
  const SA = [0.05, 0.2, 0.5, 1];
  const got = SA.map((a) => area(a, (x) => strawFlow(x * x)));
  const before = SA.map((a) => area(a, (x) => Math.max(0.05, x * x)));
  const start = Math.PI * (N * 0.008) ** 2;
  const grown = got.map((g) => g - start);
  const prop = SA.every((a, i) => Math.abs((grown[i] / grown[3]) / a - 1) < 0.2);
  check('the straw\'s bubble grows as fast as the breath goes',
    grown.every((g, i) => i === 0 || g > grown[i - 1]) && prop,
    `area after a second at Amount ${SA.join(' / ')}: ${got.map((g) => g.toFixed(0)).join(' / ')} cells² (before ${before.map((g) => g.toFixed(0)).join(' / ')})`);
}

// 6.
{
  const src = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
  const takes = (src.match(/const taken = airTaken\(/g) ?? []).length;
  const stepCount = /gestureFrameRef\.current % 6 === 0\)\s*\{\s*bubblesRef\.current\.spawn/.test(src);
  const remoteOld = /DICE\.hands\.float\(\) < 0\.15 \* amt\)/.test(src);
  const straw = /bubblesRef\.current\.blow\([^)]*strawFlow\(k\)\)/.test(src);
  check('and the app calls them so, for the mouse\'s hands, a remote\'s and the straw',
    takes === 2 && !stepCount && !remoteOld && straw,
    `${takes} winds go by airTaken; the step count ${stepCount ? 'is still there' : 'is gone'}; the remote's flat odds ${remoteOld ? 'are still there' : 'are gone'}; the straw ${straw ? 'is given strawFlow' : 'is not given strawFlow'}`);
}

const bad = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
