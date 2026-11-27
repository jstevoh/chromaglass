#!/usr/bin/env node
/**
 * Light summed where it is light (PLAN 38p, 18k-linear).
 *
 *   npm run linearlight      (the lab's adapter: any that computes, a cloud session too; under a minute)
 *
 * What was found: the plate is drawn in display values (a bgra8unorm canvas,
 * sRGB-encoded colours), and the places it adds or fades light did the sum
 * on those values. Products and powers commute with the encode, so the dye's
 * depth was right; sums do not, so a fader halfway sagged dark (half of
 * white over black read 0.5 where the light is 0.73) and two lights added
 * came out too bright (two half-bright lights read white, where they make
 * 0.68). wgsl/plateLight.ts holds the sums as light, and every site that
 * adds or fades light calls it; its header lists them.
 *
 * Asked here, of the functions themselves, run in a compute shader on the
 * adapter (so the numbers are the GPU's, not a JS copy of them):
 *
 *   1. a fade is exact at its two ends, bit for bit, so a look at Lamp Ground
 *      1 or a mixer row at level 1 draws the same picture it drew before
 *   2. halfway between black and white is half the light, 0.730, not 0.5
 *   3. two half-bright lights added are 0.685, not white
 *   4. the six bands of Spectral Mix: a grey dye comes out as Beer and Lambert
 *      say on three bands (the encode commutes with a power), and a deep
 *      yellow, which the band sum changes most, matches the sum done on light
 *      and is measurably off the sum done on display values
 *   5. a mixer level is a dimmer's curve: its share of the light is the
 *      level to the 2.2, so a fader at next to nothing lays next to nothing
 *   6. the shaders that sum light take these functions: the plate's shader
 *      has one spectralThrough and it is plateLight's, the camera's blur
 *      and bloom decode what they average, the mixer's rows and faders go
 *      through mixLight. A read of the source, so it says only that the
 *      sums are wired; lines 1 to 4 say what they compute, and `npm run lamp`
 *      line 6 reads the fade off the real plate, pixel by pixel.
 */
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const f3 = (v) => v.toFixed(3);

const lin = (v) => Math.max(0, v) ** 2.2;
const enc = (v) => Math.max(0, v) ** (1 / 2.2);
const R = [[0, 0, 0, 0.3, 0.45, 0.25], [0.05, 0.2, 0.45, 0.3, 0, 0], [0.45, 0.4, 0.15, 0, 0, 0]];
const BANDS = [[0.10, 0.10, 0.80], [0.05, 0.35, 0.60], [0.05, 0.80, 0.15], [0.35, 0.60, 0.05], [0.80, 0.20, 0.00], [0.95, 0.05, 0.00]];
/** The six bands summed, with the absorbance scaled by k (2.2: of the light; 1: of display values). */
const bands = (unit, path, k) => {
  const a = unit.map((u) => -Math.log(Math.max(u, 1e-4)) * k);
  const t = BANDS.map((w) => Math.exp(-(w[0] * a[0] + w[1] * a[1] + w[2] * a[2]) * path));
  return R.map((row) => row.reduce((s, w, i) => s + w * t[i], 0));
};

// Seeded, so the cases are the same every run.
let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pairs = Array.from({ length: 16 }, () => [rnd(), rnd(), rnd(), rnd(), rnd(), rnd()]);
const YELLOW = [0.98, 0.85, 0.12];
const GREY = [0.6, 0.6, 0.6];

const cases = [
  ...pairs.map((p) => [...p, 0, 0]),
  ...pairs.map((p) => [...p, 1, 0]),
  [0, 0, 0, 1, 1, 1, 0.5, 0],
  [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 1],
  [...GREY, 0, 0, 0, 1.7, 2],
  [...YELLOW, 0, 0, 0, 2.5, 2],
  [0, 0, 0, 0, 0, 0, 0.5, 3],
  [0, 0, 0, 0, 0, 0, 0.002, 3],
];

const { page, close } = await openLab({ entry: 'scripts/linearlight-entry.ts' });
let got;
try {
  got = await page.evaluate((c) => window.lightFns.run(c), cases);
} finally {
  await close();
}
const f32 = (v) => Math.fround(v);
const n = pairs.length;

// ── 1. The ends ──────────────────────────────────────────────────────
{
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const [a0, a1, a2, b0, b1, b2] = pairs[i];
    const at0 = got[i], at1 = got[n + i];
    if (at0[0] !== f32(a0) || at0[1] !== f32(a1) || at0[2] !== f32(a2)) bad++;
    if (at1[0] !== f32(b0) || at1[1] !== f32(b1) || at1[2] !== f32(b2)) bad++;
  }
  check('a fade of light is its two pictures exactly at its ends, bit for bit', bad === 0, `${bad} of ${2 * n} ends off`);
}
const base = 2 * n;
// ── 2. Halfway ───────────────────────────────────────────────────────
{
  const v = got[base][0];
  check('halfway from black to white is half the light: 0.730, where a fade of display values read 0.5',
    Math.abs(v - enc(0.5)) < 2e-4, `${f3(v)} (the law ${f3(enc(0.5))})`);
}
// ── 3. Two lights ────────────────────────────────────────────────────
{
  const v = got[base + 1][0];
  check('two half-bright lights add to 0.685, where an add of display values read white',
    Math.abs(v - enc(2 * lin(0.5))) < 2e-4, `${f3(v)} (the law ${f3(enc(2 * lin(0.5)))})`);
}
// ── 4. Six bands ─────────────────────────────────────────────────────
{
  const grey = got[base + 2];
  const want = 0.6 ** 1.7;
  const greyErr = Math.max(...grey.map((v) => Math.abs(v - want)));
  check('Spectral Mix on a grey dye is Beer and Lambert on three bands: the encode commutes with the power',
    greyErr < 5e-4, `${grey.map(f3).join(' ')} (the law ${f3(want)})`);
  const y = got[base + 3];
  const asLight = bands(YELLOW, 2.5, 2.2).map(enc);
  const asDisplay = bands(YELLOW, 2.5, 1);
  const errLight = Math.max(...y.map((v, i) => Math.abs(v - asLight[i])));
  const gap = Math.max(...asLight.map((v, i) => Math.abs(v - asDisplay[i])));
  check('and a deep yellow is the bands summed as light, which is not the sum of display values',
    errLight < 5e-4 && gap > 0.02,
    `${y.map(f3).join(' ')} (as light ${asLight.map(f3).join(' ')}; as display values ${asDisplay.map(f3).join(' ')})`);
}
// ── 5. A dial is a dimmer ────────────────────────────────────────────
{
  const half = got[base + 4][0], tiny = got[base + 5][0];
  check("a mixer level is a dimmer's: half a fader is 0.218 of the light (looks half), and 0.002 next to none",
    Math.abs(half - 0.5 ** 2.2) < 2e-4 && tiny < 1e-5, `${f3(half)}, ${tiny.toExponential(1)}`);
}
// ── 6. Wired ─────────────────────────────────────────────────────────
{
  const plate = readFileSync('src/gpu/wgsl/plate.ts', 'utf8');
  const camera = readFileSync('src/gpu/wgsl/camera.ts', 'utf8');
  const lamp = readFileSync('src/gpu/wgsl/plateLamp.ts', 'utf8');
  const fn = (src, name) => src.match(new RegExp(`fn ${name}\\([\\s\\S]*?\\n\\}`))?.[0] ?? '';
  const miss = [];
  if (/fn spectralThrough\(/.test(plate)) miss.push('plate.ts has its own spectralThrough');
  if (!/\$\{LIGHT_WGSL\}/.test(plate)) miss.push('plate.ts does not include LIGHT_WGSL');
  if (!/mixLight\(painted, lampBg \* through, U\.lampGround\)/.test(fn(plate, 'onGround'))) miss.push('onGround');
  if (!/mixLight\(bg, lampBg, U\.lampGround\)/.test(fn(plate, 'groundOf'))) miss.push('groundOf');
  if (!/mixLight\(/.test(fn(plate, 'chemOnGround'))) miss.push('chemOnGround');
  if (!/mixLight\(under, over, levelShare\(level\)\)/.test(fn(plate, 'mixLevelled'))) miss.push('mixLevelled');
  if (!/lightOf\(c\) \+ lightOf\(light\)/.test(plate)) miss.push('screenOver');
  if (/return mix\(c, s, a\)/.test(fn(plate, 'blendRowKeyed'))) miss.push('blendRowKeyed');
  if (/c \+= lumiaLight/.test(lamp)) miss.push('the lumia in the lamp');
  if (!/col \+= lightOf\(/.test(camera) || !/displayOf\(col \/ 12\.0\)/.test(camera)) miss.push("the camera's depth of field");
  if (!/let s1 = lightOf\(/.test(camera) || !/displayOf\(lightOf\(col\) \+ glow/.test(camera)) miss.push("the camera's bloom");
  check('the shaders that add or fade light do it through plateLight (a read of the source)', miss.length === 0, miss.join(' · ') || 'eleven sites');
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} linear light checks passed`);
process.exit(failed ? 1 : 0);
