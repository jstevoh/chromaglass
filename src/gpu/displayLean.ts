/**
 * The plate's display compiled for the look the show opens on, and the whole
 * display built behind it (PLAN.md 14v-12, the owner's "30 seconds to load
 * on mobile", 2026-11-14).
 *
 * What was measured. The display is one fragment shader of 255 kB of WGSL
 * that draws every look: the second plate, the bubbles, the lacing, the
 * lumia, the beads, the Ben-Day dots, the paper and its softbox, each behind
 * a test of one uniform (`if (U.lacing > 0.005)`). Every one of those
 * branches is compiled whether or not a look turns it on, and the opening
 * waits for that compile: on the lab's software WebGPU, where a compile is
 * all CPU as it is on a phone, `npm run openingtime` read the display at
 * 7.63 s of a 9.61 s opening (the other 66 pipelines ran beside it in the
 * other lanes), and on the owner's Mac cold it was 6.77 s of 15.48 s (PLAN
 * 46a-2). One compile of the same text with those tests fixed false took
 * 0.9 s against 4.6 to 5.4 s whole (`scratch`'s compile timer, 2026-11-14),
 * and none of them is most of it: each optional effect alone added 0.1 to
 * 0.34 s (the second plate 0.34, the bubbles 0.25, the lacing 0.24, the
 * lumia 0.23, the edge line 0.21, the ferrofluid 0.20 ...). So the cut is
 * not one effect taken out but every effect the opening look does not use.
 *
 * How, without a look changing by a byte. The lean display is the same text
 * with each test its look cannot reach (`displayMayMask`, from the look's
 * settings and its cords) written `false`, which WebGPU compiles out; the
 * whole display is the text untouched. Exact by construction: `false` and
 * `TEST` are the same value whenever TEST is false, and the frame draws with
 * the lean display only while every test it wrote `false` is false in that
 * draw's own uniforms (`displayNeeds`, read from the very bytes the GPU is
 * given, by the same text the shader tests). Otherwise it draws with the
 * whole one, which `WebGPUPlate.prepare` builds first behind the show.
 *
 * Only a test that stands alone as an operand is rewritten (after `(`, `= `,
 * `, `, `&& ` or `|| `; before `)`, `;`, `,`, ` &&` or ` ||`): inside
 * `U.gooey * U.postBlur > 0.01` the text `U.postBlur > 0.01` is not the
 * comparison it reads as, and rewriting it would have changed the sum.
 * `npm run leandisplay` says how many places each test was found in, and
 * fails a test found nowhere (renamed in the shader, so its gate is gone).
 */

import { DEFAULT_SETTINGS, type VisualizerSettings } from '../types';
import { PLATE_LAYOUT } from './wgsl/plateFields';

/**
 * One optional effect of the display: the uniform test the shader makes,
 * word for word, and the settings a look reaches it through.
 */
interface Gate {
  /** The shader's test, exactly as `wgsl/plate.ts` writes it. */
  test: string;
  /** Whether a look with these settings can turn it on, loosely: any setting above nothing, or a cord on it. */
  may: (s: Partial<VisualizerSettings>) => boolean;
  /** The settings whose cords can raise it from nothing. */
  corded: readonly (keyof VisualizerSettings)[];
}

const val = <K extends keyof VisualizerSettings>(s: Partial<VisualizerSettings>, k: K): VisualizerSettings[K] => (s[k] ?? DEFAULT_SETTINGS[k]) as VisualizerSettings[K];
const above = (k: keyof VisualizerSettings) => (s: Partial<VisualizerSettings>) => Number(val(s, k) ?? 0) > 0;

/*
  The list, costliest first by what each added alone to a compile of the
  display with every other effect out (software WebGPU, 2026-11-14). Effects
  a user can reach at any moment on any look stay in every lean display
  rather than miss their first seconds: the bubbles (any look can be blown
  into, 0.25 s). Masks are 31 bits, so the ones nearly every look turns on
  are not gated, as there is nothing to gain on them: the moiré sheets'
  three tests (every look's sheets are named, the ink's amount is what turns
  them off), the hot-spot and the edge relief (on in 40 and 37 of 41 looks).
  Nor are those a look's view reaches rather than its settings (the second
  plate's zoom, the dark blend), the tests every look passes (`derivedOn`) or
  that pick between finishes (`finishInMain`, `ledMode`).
*/
const GATES: readonly Gate[] = [
  { test: 'U.layerCount > 1', may: (s) => Math.round(Number(val(s, 'layerCount') ?? 1)) > 1, corded: ['layerCount'] },
  { test: 'U.lacing > 0.005', may: above('lacing'), corded: ['lacing'] },
  { test: 'U.lumia > 0.001', may: above('lumia'), corded: ['lumia'] },
  { test: 'U.boundaryContrast > 0.005', may: above('boundaryContrast'), corded: ['boundaryContrast'] },
  { test: 'U.phaseAmount > 0.002', may: above('phaseAmount'), corded: ['phaseAmount'] },
  { test: 'U.ledPlatform != 0', may: (s) => !!val(s, 'ledPlatform'), corded: [] },
  { test: 'U.macroCells > 0.005', may: above('macroCells'), corded: ['macroCells'] },
  { test: 'U.beads > 0.001', may: above('beads'), corded: ['beads'] },
  { test: 'U.beadDrops > 0.001', may: above('beadDrops'), corded: ['beadDrops'] },
  { test: 'U.photo > 0.5', may: (s) => val(s, 'renderStyle') === 'photo', corded: [] },
  { test: 'U.dishSpread > 0.001', may: above('dishSpread'), corded: ['dishSpread'] },
  { test: 'U.gelWheel > 0.001', may: above('gelWheel'), corded: ['gelWheel'] },
  { test: 'U.lampWarmth > 0.001', may: above('lampWarmth'), corded: ['lampWarmth'] },
  { test: 'U.twoProjectors > 0.5', may: above('twoProjectors'), corded: ['twoProjectors'] },
  { test: 'U.phIndicator > 0.001', may: above('phIndicator'), corded: ['phIndicator'] },
  { test: 'U.benDay > 0.001', may: above('benDay'), corded: ['benDay'] },
  { test: 'U.thinFilm > 0.001', may: above('thinFilm'), corded: ['thinFilm'] },
  { test: 'U.droplets > 0.001', may: above('microDroplets'), corded: ['microDroplets'] },
  { test: 'U.kaleido >= 2.0', may: (s) => Math.round(Number(val(s, 'kaleidoscope') ?? 0)) >= 2, corded: ['kaleidoscope'] },
  { test: 'U.dish > 0.001', may: above('dishVignette'), corded: ['dishVignette'] },
  { test: 'U.lampGround > 0.001', may: (s) => val(s, 'renderStyle') !== 'photo' && above('lampGround')(s), corded: ['lampGround'] },
  { test: 'U.liesShow > 0.001', may: above('liesegang'), corded: ['liesegang'] },
  { test: 'U.spectral > 0.001', may: above('spectralOptics'), corded: ['spectralOptics'] },
  { test: 'U.bzShow > 0.001', may: above('bzReaction'), corded: ['bzReaction'] },
  { test: 'U.filmPhysics > 0.0', may: above('filmPhysics'), corded: ['filmPhysics'] },
  // Nothing alone, and 0.6 s together with the next four once the rest are out.
  { test: 'U.cells > 0.005', may: above('cells'), corded: ['cells'] },
  { test: 'U.granulation > 0.002', may: above('granulation'), corded: ['granulation'] },
  { test: 'U.grainOn > 0.5', may: above('granulation'), corded: ['granulation'] },
  { test: 'U.soapFilm > 0.001', may: above('soapFilm'), corded: ['soapFilm'] },
  { test: 'U.glow > 0.001', may: above('glow'), corded: ['glow'] },
  { test: 'U.faraday > 0.5', may: above('faradayHz'), corded: ['faradayHz'] },
  { test: 'U.macroLacing > 0.005', may: above('macroLacing'), corded: ['macroLacing'] },
];

/** All of them on: the whole display. */
export const WHOLE_DISPLAY = GATES.length >= 32 ? -1 : (2 ** GATES.length - 1);

/** Each test read as the CPU reads it: which uniform, which component, how compared. */
interface Read { word: number; int: boolean; op: '>' | '>=' | '!='; than: number }
const READS: readonly Read[] = GATES.map(({ test }) => {
  const m = /^U\.([a-zA-Z0-9_]+)(?:\.([xyzw]))? (>=|>|!=) ([0-9.]+)$/.exec(test);
  if (!m) throw new Error(`displayLean: cannot read the test ${test}`);
  const f = PLATE_LAYOUT.byName.get(m[1]);
  if (!f) throw new Error(`displayLean: no uniform ${m[1]}`);
  const comp = m[2] ? 'xyzw'.indexOf(m[2]) : 0;
  // Compared in single precision, as the GPU compares them: a value on the
  // threshold itself reads the same either side.
  return { word: f.offset / 4 + comp, int: f.type === 'i32' || f.type === 'u32', op: m[3] as Read['op'], than: Math.fround(Number(m[4])) };
});

/**
 * The display's text for a lean display: every stand-alone use of a test the
 * mask leaves out written as `false`. The whole display is the text as it
 * is, untouched, so a returning visitor's compiled whole display is still
 * the browser's after this file shipped.
 *
 * Written out, not set by an override. The first version wrapped each test
 * as `(CG_X && TEST)` with `CG_X` a pipeline constant, one module for every
 * lean display; the compile of it with every gate off took 4.0 to 4.6 s on
 * software WebGPU, against 0.9 s with the same tests written `false`
 * (2026-11-14): `false && TEST` is not a constant expression in WGSL, so the
 * branch it guards was still compiled, only never taken. `false` is, and the
 * compiler drops the branch.
 */
export function leanDisplayWgsl(code: string, mask: number): string {
  return mask === WHOLE_DISPLAY ? code : leanDisplayWgslCounted(code, mask).code;
}

/** The same, with how many places each test left out was written `false` (`npm run leandisplay`). */
export function leanDisplayWgslCounted(code: string, mask: number): { code: string; found: { test: string; places: number }[] } {
  let out = code;
  const found = GATES.map(({ test }, i) => {
    if (mask & (1 << i)) return { test, places: 0 };
    const esc = test.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let places = 0;
    out = out.replace(new RegExp(`(\\(|= |, |&& |\\|\\| )${esc}(?=\\)|;|,| &&| \\|\\|)`, 'g'), (_m, before: string) => {
      places++;
      return `${before}false`;
    });
    return { test, places };
  });
  return { code: out, found };
}

/** The gates a look with these settings can reach in its first seconds: the lean display keeps these. */
export function displayMayMask(s: Partial<VisualizerSettings>): number {
  const cords = new Set<string>();
  for (const m of s.sceneMappings ?? []) if (m && m.depth !== 0 && typeof m.setting === 'string') cords.add(m.setting);
  let mask = 0;
  for (let i = 0; i < GATES.length; i++) {
    const g = GATES[i];
    if (g.may(s) || g.corded.some((k) => cords.has(k))) mask |= 1 << i;
  }
  return mask;
}

const views = new WeakMap<ArrayBuffer, { f: Float32Array; i: Int32Array }>();

/**
 * The gates this draw's uniforms turn on, read from the bytes the GPU is
 * given (`UniformPack.bytes`). The views onto a pack's bytes are made once.
 */
export function displayNeeds(bytes: ArrayBuffer): number {
  let v = views.get(bytes);
  if (!v) { v = { f: new Float32Array(bytes), i: new Int32Array(bytes) }; views.set(bytes, v); }
  let mask = 0;
  for (let k = 0; k < READS.length; k++) {
    const r = READS[k];
    const x = r.int ? v.i[r.word] : v.f[r.word];
    if (r.op === '>' ? x > r.than : r.op === '>=' ? x >= r.than : x !== r.than) mask |= 1 << k;
  }
  return mask;
}

/** Whether a display built for `mask` draws a frame needing `needs` exactly. */
export const leanCovers = (mask: number, needs: number): boolean => (needs & ~mask) === 0;

/** The gates, by their tests, for a harness to print. */
export const displayGateTests = (): string[] => GATES.map((g) => g.test);
