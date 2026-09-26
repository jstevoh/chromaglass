#!/usr/bin/env node
/**
 * A soap film's own colours: the table Film Physics draws through.
 *
 *   npm run film      (node only: src/lib/filmTable.ts and the plate shader's source)
 *
 * The plate's film colour was a rainbow, a cosine palette going round the
 * same three hues for ever. The research on bubbles and drops (item 8, in
 * the project's shared files) worked out what a real soap film does, with a
 * script of its own (film.py: Airy's sum for the film, the CIE matching
 * functions, a 5500 K lamp, sRGB), and lib/filmTable.ts is that script in
 * TypeScript, built into the shader as a table.
 *
 * Asked here, where nothing depends on a GPU:
 *
 * - that it is the research's film: every colour film.py printed, reflected
 *   and transmitted, at every thickness it printed, to a level of 8-bit
 *   colour. The numbers are copied from its output, not computed here, so
 *   the two are held to each other and a change to either shows;
 * - that the table the shader reads, one entry every 20 nm with straight
 *   lines between, still names the textbook's sequence at the textbook's
 *   thicknesses (black under 30 nm, straw at 150, purple at 200, blue at
 *   250, green-gold at 300, orange at 360, magenta at 400), since a table
 *   too coarse would blur the narrow first-order purple into its
 *   neighbours;
 * - that it washes out as it thickens, and that the light through it, the
 *   light a projector throws, is pale;
 * - that it is as bright on average as the rainbow it replaces (a mean
 *   luminance of a half), so turning Film Physics up does not dim a look;
 * - and that the shader's source carries this table, number for number,
 *   and reads it where the film is drawn. That the pixels follow is
 *   `npm run filmlook`, in the lab.
 */
import { build } from 'esbuild';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const out = 'node_modules/.cache/film-table.mjs';
await build({
  stdin: {
    contents: "export * from './src/lib/filmTable.ts'; export { PLATE_PARTS, plateWgsl, DISPLAY_MAIN } from './src/gpu/wgsl/plate.ts';",
    resolveDir: '.', loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const { filmColour, filmTable, filmTableWgsl, SOAP, FILM_MAX_NM, FILM_STEPS, FILM_NM_PER_T, PLATE_PARTS, plateWgsl, DISPLAY_MAIN } = await import(`../${out}`);

const hex = (c) => c.map((v) => Math.round(v * 255));
const unhex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const chroma = (c) => Math.max(...c) - Math.min(...c);

// ── It is the research's film ─────────────────────────────────────────
/*
  film.py's own output (bubbles-and-drops/scripts, run 2026-09-26): soap,
  n = 1.33 in air, straight on; reflected at four times its strength, and
  transmitted. Thickness in nm, reflected, transmitted.
*/
const FILM_PY = [
  [0, '#000000', '#ffffff'], [10, '#10161c', '#ffffff'], [30, '#3b4856', '#fefdfc'], [60, '#6d7c8b', '#fbf9f8'],
  [100, '#939791', '#f7f6f7'], [150, '#93742f', '#f7fafe'], [200, '#4c005b', '#fdfffc'], [250, '#006898', '#fffbf6'],
  [280, '#468e87', '#fdf7f8'], [300, '#759765', '#faf6fb'], [330, '#9d8d10', '#f5f7ff'], [360, '#a7673e', '#f4fbfe'],
  [400, '#811889', '#f9fff8'], [450, '#006787', '#fffbf8'], [500, '#369237', '#fef7fe'], [550, '#a07668', '#f5fafb'],
  [600, '#9a3c8b', '#f6fef8'], [650, '#296664', '#fefbfb'], [700, '#008857', '#fff8fc'], [800, '#9b5774', '#f6fcfa'],
  [900, '#227b73', '#fff9fa'], [1000, '#8b6666', '#f8fbfb'], [1200, '#756d6b', '#fafbfb'], [1500, '#766d6e', '#fafbfb'],
];
{
  let worst = 0, at = 0;
  for (const [d, r, t] of FILM_PY) {
    const R = hex(filmColour(SOAP.n0, SOAP.n1, SOAP.n2, d, 'R', 4).rgb), T = hex(filmColour(SOAP.n0, SOAP.n1, SOAP.n2, d, 'T').rgb);
    const e = Math.max(...R.map((v, k) => Math.abs(v - unhex(r)[k])), ...T.map((v, k) => Math.abs(v - unhex(t)[k])));
    if (e > worst) { worst = e; at = d; }
  }
  check('the film is the research\'s: every colour film.py printed, reflected and transmitted', worst <= 1,
    `worst ${worst}/255 (at ${at} nm) over ${FILM_PY.length} thicknesses`);
}

// ── The table the shader reads ───────────────────────────────────────
const table = filmTable();
/** The shader's filmTableAt, in JavaScript, at d nm (its t times FILM_NM_PER_T): linear between entries. */
const at = (tab, d) => {
  const x = Math.min(Math.max(d / FILM_MAX_NM, 0), 1) * (FILM_STEPS - 1);
  const i = Math.min(Math.floor(x), FILM_STEPS - 2), f = x - i;
  return tab[i].map((v, k) => v + (tab[i + 1][k] - v) * f);
};
{
  const R = (d) => at(table.reflect, d);
  const dec = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lin = (c) => luma(c.map(dec));
  const peakLin = Math.max(...table.reflect.map(lin));
  const seq = [
    // In light, not in sRGB's encoded numbers, which lift a dark grey to a
    // fifth: at 20 nm the film reflects a twentieth of what it does at its
    // brightest, and that is the black film.
    ['black under 30 nm', lin(R(0)) < 0.002 && lin(R(20)) < 0.1 * peakLin],
    ['straw at 150', (([r, g, b]) => r > g && g > b && b < 0.5 * r)(R(150))],
    ['purple at 200', (([r, g, b]) => g < 0.5 * Math.min(r, b))(R(200))],
    ['blue at 250', (([r, g, b]) => b > g && g > r && b > 1.3 * r)(R(250))],
    ['green-gold at 300', (([r, g, b]) => g > r && g > b)(R(300))],
    ['orange at 360', (([r, g, b]) => r > g && g > b)(R(360))],
    ['magenta at 400', (([r, g, b]) => g < 0.6 * Math.min(r, b))(R(400))],
  ];
  const bad = seq.filter(([, ok]) => !ok).map(([n]) => n);
  check('the shader\'s table, 20 nm a step, names the textbook sequence', bad.length === 0,
    bad.length ? `wrong: ${bad.join(', ')}` : seq.map(([n]) => n).join(', '));

  const mean = (lo, hi) => { const cs = table.reflect.filter((_, i) => { const d = (i * FILM_MAX_NM) / (FILM_STEPS - 1); return d >= lo && d <= hi; }); return cs.reduce((a, c) => a + chroma(c), 0) / cs.length; };
  const early = mean(100, 600), late = mean(1100, FILM_MAX_NM);
  check('and washes out as it thickens', late < 0.35 * early, `colour ${late.toFixed(3)} past 1100 nm against ${early.toFixed(3)} from 100 to 600`);

  const minT = Math.min(...table.transmit.flat()), minTY = Math.min(...table.transmit.map(luma));
  check('the light through it, a projector\'s, is pale', minT >= 0.9 && minTY >= 0.9,
    `no channel under ${minT.toFixed(3)}, no luminance under ${minTY.toFixed(3)} of the lamp`);

  const meanY = table.reflect.reduce((a, c) => a + luma(c), 0) / table.reflect.length;
  check('reflected, it is as bright on average as the rainbow it replaces', Math.abs(meanY - 0.5) < 0.01,
    `mean luminance ${meanY.toFixed(4)} (the rainbow's 0.5), at ${table.gain.toFixed(2)} times the film's own`);
}

// ── The shader carries it ────────────────────────────────────────────
/*
  The numbers in the plate shader's source, read back and compared with the
  table; the functions that read it; both places the film is drawn going
  through them; and the setting in the uniforms. A shader that kept the
  table but drew the rainbow would pass everything above: this is what
  says it does not, short of photographing it (npm run filmlook).
*/
{
  const src = PLATE_PARTS.LIGHTING;
  const nums = (name) => {
    const m = new RegExp(`const ${name} = array<vec3f, (\\d+)>\\(([^;]*)\\);`).exec(src);
    if (!m) return null;
    return [...m[2].matchAll(/vec3f\(([^)]*)\)/g)].map((v) => v[1].split(',').map(Number));
  };
  const R = nums('FILM_R'), T = nums('FILM_T');
  const off = (a, b) => (a && a.length === b.length ? Math.max(...a.flatMap((c, i) => c.map((v, k) => Math.abs(v - b[i][k])))) : Infinity);
  const eR = off(R, table.reflect), eT = off(T, table.transmit);
  check('the plate shader carries the table, number for number', src.includes(filmTableWgsl()) && eR < 1e-4 && eT < 1e-4,
    `${R?.length ?? 0} reflected and ${T?.length ?? 0} transmitted entries, off by at most ${Math.max(eR, eT).toExponential(1)}`);
  // The display shader as the app builds it. Every call of the rainbow must
  // be the one inside filmColourAt, so no film is drawn around the table.
  const whole = plateWgsl(DISPLAY_MAIN);
  const calls = (f) => [...whole.matchAll(new RegExp(`\\b${f}\\(`, 'g'))].length - 1; // less its declaration
  const rainbow = calls('thinFilmColour'), mixed = calls('filmColourAt');
  const through = /filmTableAt\(filmP, true\)/.test(whole);
  const uniform = /filmPhysics\s*:\s*f32/.test(whole);
  check('and draws every film through it, the projector\'s through the light it lets by',
    rainbow === 1 && mixed >= 2 && through && uniform,
    `the rainbow called ${rainbow} time(s) (inside the mix), the mix at ${mixed} places, the transmitted table ${through ? 'read' : 'NOT read'} for the projected bubble, the setting ${uniform ? 'in' : 'NOT in'} the uniforms`);
}

// ── The setting reaches the shader ───────────────────────────────────
/*
  The uniform is only read if it is written: the pack in plateUniforms.ts.
  (That at 0 the plate is the rainbow's to the bit is asked of the pixels,
  in npm run filmlook, against a shader built without the setting.)
*/
{
  const { readFileSync } = await import('node:fs');
  const packs = readFileSync(new URL('../src/gpu/plateUniforms.ts', import.meta.url), 'utf8');
  const written = /pack\.set\('filmPhysics', Number\.isFinite\(s\.filmPhysics\) \? clamp01\(s\.filmPhysics\) : 0\)/.test(packs);
  check('the setting is written to the plate\'s uniforms, clamped, NaN as 0', written, written ? 'pack.set(\'filmPhysics\', …)' : 'not found in src/gpu/plateUniforms.ts');
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
