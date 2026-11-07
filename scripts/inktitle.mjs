#!/usr/bin/env node
/**
 * Ink titles: each song's artist and title painted onto the plate as ink when
 * it starts, then swept away by the flow (PLAN 37x-10).
 *
 *   npm run inktitle                                                   what the titles do
 *   npm run inktitle -- --owed=cue,mask,lands,sweep,kept,setting,wired as CI runs it until it ships
 *
 * Why this check exists before the feature does. The Live Show (37x-4) streams
 * an album a week, and the viewer needs to know what is playing. The first
 * idea was a lower third: text drawn over the corner of the picture. The owner
 * chose instead (2026-11-07) "let titles get painted on as ink and then swept
 * away": the title is poured into the liquid as dye, and the plate's own flow
 * carries it off. That is the project's rule for everything on the plate
 * (physics writes, rendering reads), and it is also why it works everywhere at
 * once: the title is in the solver's dye, so it is on the wall, in the stream
 * and in every recording without a separate overlay for each. This file is the
 * contract the build is held to, written first and red on main (the
 * Claude/Antigravity split, docs/handoff.md): Antigravity builds against it and
 * takes each id out of --owed as it turns green.
 *
 * The contract, so the build has one shape to meet:
 *
 *   - `src/lib/inkTitle.ts` exports, importable in node (no canvas touched at
 *     import time):
 *       inkTitleCue(last, track, on)  → { key, artist, title } | null
 *           `track` is the identified song ({ isrc?, title?, artist? }, as
 *           TrackIdentity), `last` the key of the title last painted. A song
 *           with a title, a key unlike `last`, and `on` gives the cue; the key
 *           is the isrc when there is one, else artist and title. Text is
 *           trimmed, and a line over 40 characters ends in '…' at 40.
 *       inkTitleInk(colour, palette)  → [r, g, b] absorbances
 *           '' is the look's palette (its first colour), a '#rrggbb' that
 *           colour; both through dyeAbsorbances (src/lib/dye.ts).
 *       inkTitleMask(text, size, y, n) → { mask, box }
 *           The title rasterised once, in the browser (an OffscreenCanvas):
 *           coverage 0..1, n × n, row 0 at the plate's bottom as the solver's
 *           grid has it (so it reads upright on the wall), `box` its ink's
 *           extent [x0, y0, x1, y1] in plate fractions. `size` 0..1 runs from
 *           small to the plate's width; `y` 0..1 is where its middle lands, up
 *           the plate. A long title shrinks to fit rather than run off.
 *       inkTitleSweep(dial)           → the wash's strength, 0 at 0, rising.
 *       inkTitleWash(seconds, since, dial, box, velAdd, L)
 *           Adds to the step's velocity deltas (L × L × 4, as the solver's
 *           applyDeltas takes them) the wash's push over a step of `seconds`,
 *           `since` seconds after the title landed. A flow, not a fade: the
 *           title leaves because the liquid carries it and stirs it, so the
 *           dye is all still on the plate after. Writes nothing at dial 0.
 *       INK_TITLE_DENSITY             the dye's density where coverage is 1.
 *   - the solver (PlateSolver in src/gpu/solverTypes.ts, WebGPUFluid) gets
 *     `pourInk(mask, n, rgb, density)`: the mask's dye added to the dye field
 *     at the solver's own grid, sampled from a mask of any size as the video
 *     pour samples its frame (14ab-2), added to what is there, never replacing
 *     it. At the solver's grid and not the logical one, because the wall is
 *     drawn from the solver's grid: letters laid at 192 and stretched to 1024
 *     come out soft. This check cannot see that: the lab reads the dye back
 *     through `readField`, which scales it down to the logical grid first, so a
 *     pour at L reads the same here. The review before merge holds it, and the
 *     owner's film on the Mac shows it.
 *   - settings, none set by any look (PLAN's rule for a new setting: every
 *     look keeps today's plate): `inkTitle` false, `inkTitleColor` '' (the
 *     palette), `inkTitleSize`, `inkTitleY`, `inkTitleSweep` (a number above 0).
 *   - the app paints a title when `inkTitleCue` says so (the song changes
 *     while `inkTitle` is on), through the solver's `pourInk`, and runs
 *     `inkTitleWash` each step until it is gone. The plate's shaders never
 *     draw a title (no `inkTitle` in src/gpu/wgsl/). The phone has the
 *     "Title" switch (in Live Show; a file under src/components/phone/ or
 *     LiveRemoteChip.tsx binds `inkTitle`). Its desk and MIDI are the
 *     `panel`, `desk` and `phone` checks' and the setting-auditor's.
 *
 * How "readable" is measured. A title's readability is how closely the dye in
 * the title's box follows the letters it was poured as: the normalised
 * correlation of the plate's dye density with the mask, taken at the best
 * shift of the mask over the plate (every shift that keeps the box on it), so
 * a title that has only slid somewhere else, intact, still counts as
 * readable, and only one broken up counts as gone: at its best shift
 * anywhere it matches at 0.3 or worse. (A second test, strokes under 1.5
 * times their gaps at that shift, was tried and dropped: a title stirred to
 * 0.19 still kept its dye in the band it was poured in, so the ratio stayed
 * up long after no letter could be read.) A dye field that is not finite throws: a plate the wash blew
 * up is broken, not a title gone. Measured in the lab before
 * the build with dye laid through the lab's own deltas (scratch prototype,
 * 2026-11-07, N 256, L 192, two lines, sans-serif): 0.958 when it lands,
 * 0.947 a second later and 0.96 after five seconds on a still plate; a steady
 * rightward push alone kept it at 0.66 in place and readable shifted; a
 * stirring push (cells a sixth of the plate wide) took it to 0.40 at 2 s and
 * 0.24 at 4 s. So the bars: 0.8 to have landed readable, 0.7 to still be
 * readable, 0.3 to be gone.
 *
 * And the check was run, before it was committed, against a throwaway
 * reference build of the contract (never committed): the mask drawn with a
 * canvas, the pour a bilinear splat of the mask onto the deltas, the wash a
 * drift with stirring cells a sixth of the plate across, waiting 6·(1 − dial)
 * seconds before it starts. It passed every line but `setting` and `wired`:
 * read 0.922 at 0.5 s, strokes 1.318 against gaps 0.109, the dye rose 1488.6
 * for 1480.7 poured; at the dial's 0.5 gone at 7.5 s, at the top at 1.5 s,
 * 0.911 at 12 s at 0.01; 1542.1 of 1480.7 still on the plate at 12 s; 421 s
 * in all on SwiftShader with a 12 s gentle arm. Run again after the review
 * (the box from the mask, the letters' bars, the whole-plate search, kept on
 * every arm, a 6 s gentle arm): 57% clear and 30% solid at size 0.5, 0.920 at
 * 6 s at 0.01, every arm 1488.6 to 1542.1 of 1480.7 kept, 324 s in all. The same reference
 * with a nearest-cell pour read 0.789 at landing, under the bar: letters laid
 * without filtering alias, which is why the bar is 0.8 and not lower.
 *
 * The lines:
 *
 *   cue      (node) the cue: a new song with a title gives one cue, the same
 *            song again none, none with no title, none with the switch off; an
 *            isrc is the key when there is one; text trimmed and clipped to 40
 *            characters with '…'. The ink: '' is the palette's first colour and
 *            '#rrggbb' that colour, each as dyeAbsorbances gives it.
 *   mask     (lab page) the mask: coverage in 0..1 and some ink in it; an "L"
 *            reads upright and unmirrored on the grid (its foot in the bottom
 *            half, its stem in the left half); its box inside the wall's
 *            circle's square [0.06, 0.94] for a short and an 80-character title
 *            at size 0, 0.5 and 1 (every box worked out from the mask's own ink, and
 *            the box handed back within two cells of it); letters and not a
 *            blur (from size 0.3 up, at least 30% of the box clear, under 0.02,
 *            and 15% solid, over 0.5); the box wider at each size step for a short
 *            title; its middle within 0.05 of `y` at 0.2, 0.5 and 0.8; and the
 *            dial gentle to extreme (every dial, the owner's rule): at 0 the box
 *            is no taller than 8% of the plate, at 1 a short title spans 85% of
 *            its width.
 *   lands    (lab) the title, at the default size, poured with `pourInk` onto a
 *            still plate already holding a pool of dye: half a second later it
 *            reads at 0.8 or better, its strokes hold at least four times the
 *            dye of the gaps between them, and the plate's dye, a pool already
 *            on it, went up by the mask's coverage times INK_TITLE_DENSITY
 *            within 10% (the pour adds what it says, at any mask size).
 *   sweep    (lab) the wash, at the app's 60 steps a second: at the default dial
 *            the title still reads at 0.7 or better 3 s after it lands (time to
 *            read two lines) and reads at 0.3 or worse by 12 s; at the dial's top
 *            by 2 s; at 0.01 it still reads at 0.7 or better at 6 s (a gentle
 *            drift); and the dial at 0 writes nothing into the deltas.
 *   kept     (lab) every arm's plate at its end (12, 2 and 6 s) holds at least
 *            90% of the dye the title poured (on top of what was there): the
 *            flow carried it off, nothing faded it. In the lab the build's only
 *            hand after the pour is inkTitleWash, which writes velocity; a fade
 *            done elsewhere in the app (dissipation raised while a title is up)
 *            is the review's to catch.
 *   setting  (node) the five settings, their defaults as above, and no look
 *            sets any of them.
 *   wired    (source, comments stripped) the app calls inkTitleCue,
 *            inkTitleMask, inkTitleWash and the solver's `.pourInk(` outside
 *            src/lib/inkTitle.ts and src/gpu/; no shader in src/gpu/wgsl/
 *            names inkTitle; the phone binds `inkTitle` beside the word Title.
 *
 * --owed: a line is excused only in the state it is owed for, which is main's:
 *   cue, mask, lands, sweep, kept   src/lib/inkTitle.ts does not exist
 *   setting                         DEFAULT_SETTINGS has no inkTitle
 *   wired                           nothing outside the module calls inkTitleCue
 * Once the module exists the lab lines run and must pass, owed or not. Any
 * other failure is red, and an owed line that passes is red until its id is
 * taken out of --owed.
 *
 * The lab alone (scripts/lab.mjs), so it runs on SwiftShader as on Metal. On
 * main it opens no browser and takes a second; built, it steps the plate about
 * 1,200 times (three arms of 12, 2 and 6 s at 60 steps a second), about
 * six minutes on SwiftShader (measured against a reference build, above), in Measure's lab3 part beside `soapbreak`.
 */
import { build } from 'esbuild';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OWED_IDS = ['cue', 'mask', 'lands', 'sweep', 'kept', 'setting', 'wired'];
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const unknown = [...owed].filter((id) => !OWED_IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${OWED_IDS.join(', ')})`);
/** A line, excused only when it is owed and `inOwedState` says the code is still main's. */
let owedNow = 0;
const line = (id, name, ok, detail, inOwedState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!inOwedState) return check(name, false, `${detail}; owed only while the code is main's, and it is not`);
  owedNow++;
  console.log(` owed ${name} — ${detail}`);
};

const bundle = async (entry) => {
  const out = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
};

const MODULE = 'src/lib/inkTitle.ts';
const hasModule = existsSync(MODULE);
const ink = hasModule ? await bundle(MODULE) : null;
const fn = (name) => (ink && typeof ink[name] === 'function' ? ink[name] : null);
const { dyeAbsorbances } = await bundle('src/lib/dye.ts');
const { DEFAULT_SETTINGS } = await bundle('src/types.ts');
const { PRESETS } = await bundle('src/presets.ts');

const LINES = {
  cue: 'a new song gives one title, the same song none, and the ink is the palette\'s or the chosen colour',
  mask: 'the title\'s mask reads upright, stays on the wall, lands where asked and runs small to the plate\'s width',
  lands: 'a title poured as ink reads when it lands, its strokes dark against their gaps, added to the plate',
  sweep: 'the wash leaves it readable for 3 s and gone by 12 s, by 2 s at the top, a slow drift at 0.01',
  kept: 'the title leaves by the flow: its dye is still on the plate when it is gone',
  setting: 'the title\'s five settings exist, off and on the palette by default, and no look sets them',
  wired: 'the app paints and sweeps titles through the solver, no shader draws one, and the phone has the switch',
};
const NOT_YET = `${MODULE} does not exist`;

// ── cue (node) ──
{
  const cue = fn('inkTitleCue'), inkOf = fn('inkTitleInk');
  if (!cue || !inkOf) {
    line('cue', LINES.cue, false, hasModule ? `${MODULE} exports no ${!cue ? 'inkTitleCue' : 'inkTitleInk'}` : NOT_YET, !hasModule);
  } else {
    const bad = [];
    const a = { isrc: 'USX1', title: '  West End Blues ', artist: ' Louis Armstrong' };
    const first = cue(null, a, true);
    if (!first || first.title !== 'West End Blues' || first.artist !== 'Louis Armstrong') bad.push(`a new song gave ${JSON.stringify(first)}`);
    if (first && first.key !== 'USX1') bad.push(`the key was ${JSON.stringify(first.key)}, not the isrc`);
    if (first && cue(first.key, a, true) !== null) bad.push('the same song again gave a second cue');
    if (cue(null, a, false) !== null) bad.push('the switch off still gave a cue');
    if (cue(null, null, true) !== null) bad.push('no song gave a cue');
    if (cue(null, { isrc: 'X', title: '  ', artist: 'Someone' }, true) !== null) bad.push('a song with no title gave a cue');
    const noIsrc = cue(null, { title: 'Song', artist: 'Band' }, true);
    const noIsrc2 = cue(null, { title: 'Other', artist: 'Band' }, true);
    if (!noIsrc || !noIsrc2 || noIsrc.key === noIsrc2.key) bad.push('two songs without an isrc shared a key');
    if (noIsrc && noIsrc2 && cue(noIsrc.key, { title: 'Other', artist: 'Band' }, true) === null) bad.push('the next song without an isrc gave no cue');
    const long = cue(null, { isrc: 'L', title: 'x'.repeat(60), artist: 'y'.repeat(41) }, true);
    if (!long || long.title.length !== 41 || !long.title.endsWith('…') || long.artist.length !== 41 || !long.artist.endsWith('…')) bad.push(`a 60-character title came out ${long ? `${long.title.length} and ${long.artist.length} long` : 'as no cue'}`);
    const edge = cue(null, { isrc: 'E', title: 'z'.repeat(40), artist: 'A' }, true);
    if (!edge || edge.title !== 'z'.repeat(40)) bad.push('a title of exactly 40 characters was clipped');
    const palette = [[0.9, 0.2, 0.1], [0.1, 0.4, 0.9]];
    const close = (p, q) => p && p.length === 3 && p.every((v, i) => Math.abs(v - q[i]) < 1e-6);
    const fromPalette = inkOf('', palette), chosen = inkOf('#33cc66', palette);
    if (!close(fromPalette, dyeAbsorbances(...palette[0]))) bad.push(`'' gave ${JSON.stringify(fromPalette)}, not the palette's first colour`);
    if (!close(chosen, dyeAbsorbances(0x33 / 255, 0xcc / 255, 0x66 / 255))) bad.push(`'#33cc66' gave ${JSON.stringify(chosen)}`);
    line('cue', LINES.cue, bad.length === 0, bad.length ? bad.join('; ') : 'one cue a song, keyed by isrc or artist and title, clipped at 40, ink from the palette or the colour', false);
  }
}

// ── setting (node) ──
const KEYS = ['inkTitle', 'inkTitleColor', 'inkTitleSize', 'inkTitleY', 'inkTitleSweep'];
const hasSetting = !!DEFAULT_SETTINGS && 'inkTitle' in DEFAULT_SETTINGS;
{
  const S = DEFAULT_SETTINGS ?? {};
  const bad = [];
  const missing = KEYS.filter((k) => !(k in S));
  if (missing.length) bad.push(`DEFAULT_SETTINGS has no ${missing.join(', ')}`);
  if ('inkTitle' in S && S.inkTitle !== false) bad.push(`inkTitle defaults to ${JSON.stringify(S.inkTitle)}, not false`);
  if ('inkTitleColor' in S && S.inkTitleColor !== '') bad.push(`inkTitleColor defaults to ${JSON.stringify(S.inkTitleColor)}, not '' (the palette)`);
  for (const k of ['inkTitleSize', 'inkTitleY']) if (k in S && !(S[k] >= 0 && S[k] <= 1)) bad.push(`${k} defaults to ${S[k]}, outside 0..1`);
  if ('inkTitleSweep' in S && !(S.inkTitleSweep > 0 && S.inkTitleSweep <= 1)) bad.push(`inkTitleSweep defaults to ${S.inkTitleSweep}, not in (0, 1]`);
  const setters = PRESETS.filter((p) => KEYS.some((k) => p.settings && k in p.settings)).map((p) => p.name ?? p.id);
  if (setters.length) bad.push(`set by ${setters.slice(0, 6).join(', ')}${setters.length > 6 ? ` and ${setters.length - 6} more` : ''}`);
  line('setting', LINES.setting, bad.length === 0,
    bad.length ? bad.join('; ') : `inkTitle false, colour '', size ${S.inkTitleSize}, y ${S.inkTitleY}, sweep ${S.inkTitleSweep}; no look of ${PRESETS.length} sets them`,
    !hasSetting);
}

// ── wired (source) ──
{
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
  const files = walk('src');
  // Comments stripped: a call written in a comment is not a call.
  const text = (p) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  const app = files.filter((p) => p !== join('src', 'lib', 'inkTitle.ts') && !p.startsWith(join('src', 'gpu')));
  const calls = (name) => app.filter((p) => new RegExp(`\\b${name}\\s*\\(`).test(text(p)));
  const cueCalls = calls('inkTitleCue'), washCalls = calls('inkTitleWash'), maskCalls = calls('inkTitleMask');
  // A method call on the solver (`fluid.pourInk(`, `gpu?.pourInk?.(`), not a signature in a type.
  const pourCalls = app.filter((p) => /\?*\.pourInk\??\.?\s*\(/.test(text(p)));
  const shaders = files.filter((p) => p.startsWith(join('src', 'gpu', 'wgsl')) && /inkTitle/.test(text(p)));
  const phone = files.filter((p) => (p.startsWith(join('src', 'components', 'phone')) || p.endsWith('LiveRemoteChip.tsx'))
    && /\binkTitle\b/.test(text(p)) && /\bTitle\b/.test(text(p).replace(/inkTitle\w*/g, '')));
  const bad = [];
  if (!cueCalls.length) bad.push('nothing outside the module calls inkTitleCue');
  if (!pourCalls.length) bad.push('nothing in the app calls the solver\'s pourInk');
  if (!maskCalls.length) bad.push('nothing in the app calls inkTitleMask (a title drawn some other way is not poured)');
  if (!washCalls.length) bad.push('nothing in the app calls inkTitleWash');
  if (shaders.length) bad.push(`a shader names inkTitle: ${shaders.join(', ')} (the plate draws the dye, never the title)`);
  if (!phone.length) bad.push('no phone file binds inkTitle beside the word Title');
  line('wired', LINES.wired, bad.length === 0,
    bad.length ? bad.join('; ') : `cue in ${cueCalls.join(', ')}; pour in ${pourCalls.join(', ')}; wash in ${washCalls.join(', ')}; phone ${phone.join(', ')}`,
    !cueCalls.length);
}

// ── the lab: mask, lands, sweep, kept ──
const READ = 0.8, STILL = 0.7, GONE = 0.3, CLEAR = 0.3, SOLID = 0.15;
if (!hasModule) {
  for (const id of ['mask', 'lands', 'sweep', 'kept']) line(id, LINES[id], false, NOT_YET, true);
} else {
  const need = ['inkTitleMask', 'inkTitleSweep', 'inkTitleWash', 'inkTitleInk'].filter((n) => !fn(n));
  if (need.length || !(ink.INK_TITLE_DENSITY > 0)) {
    for (const id of ['mask', 'lands', 'sweep', 'kept']) line(id, LINES[id], false, `${MODULE} exports no ${need.length ? need.join(', ') : 'INK_TITLE_DENSITY above 0'}`, false);
  } else {
    await labLines();
  }
}

async function labLines() {
  const { openLab } = await import('./lab.mjs');
  // The entry is written here and not kept in scripts/: it imports the module
  // this check is written ahead of, and a file that imports one that does not
  // exist would fail the typecheck on main.
  mkdirSync('node_modules/.cache', { recursive: true });
  const entry = 'node_modules/.cache/inktitle-entry.ts';
  writeFileSync(entry, [
    "import '../../scripts/lab-entry.ts';",
    "import * as ink from '../../src/lib/inkTitle.ts';",
    '(window as unknown as { ink: typeof ink }).ink = ink;',
    '',
  ].join('\n'));
  const S = DEFAULT_SETTINGS ?? {};
  const dflt = { size: S.inkTitleSize ?? 0.5, y: S.inkTitleY ?? 0.5, sweep: S.inkTitleSweep ?? 0.5 };
  const { page, close } = await openLab({ entry });
  try {
    // ── mask (in the page: the mask is drawn with a canvas) ──
    const m = await page.evaluate(() => {
      const n = 192;
      const short = { artist: 'Louis Armstrong', title: 'West End Blues' };
      const long = { artist: 'The Very Long Named Orchestra and Chorus', title: 'An Eighty Character Title That Goes On And On And On Well Past' };
      const out = { range: true, inked: true, boxes: [], ys: [], L: null };
      const sum = (mask) => mask.reduce((a, b) => a + b, 0);
      /*
        The box is worked out here from the mask's own ink (coverage over 0.3)
        and judged, never the box the build hands back: a clamped or made-up
        box would pass every line below while the letters ran off the wall.
        The one handed back must agree with it to two cells, since the app
        aims the wash with it. And the ink inside it must be letters, not a
        blur: a soft or blocky mask correlates better with its own soft dye,
        the cheap way past the landing bar, so the box must hold both clear
        gaps (under 0.02) and solid strokes (over 0.5).
      */
      const judge = (mask, given) => {
        let x0 = n, x1 = -1, y0 = n, y1 = -1;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (mask[i + j * n] > 0.3) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
        if (x1 < 0) return { box: [0, 0, 0, 0], agrees: false, clear: 0, solid: 0 };
        const box = [x0 / n, y0 / n, (x1 + 1) / n, (y1 + 1) / n];
        const agrees = given.length === 4 && given.every((v, k) => Math.abs(v - box[k]) <= 2 / n);
        let clear = 0, solid = 0, cells = 0;
        for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) { const v = mask[i + j * n]; cells++; if (v < 0.02) clear++; else if (v > 0.5) solid++; }
        return { box, given: Array.from(given), agrees, clear: clear / cells, solid: solid / cells };
      };
      for (const text of [short, long]) for (const size of [0, 0.5, 1]) {
        const { mask, box } = ink.inkTitleMask(text, size, 0.5, n);
        if (mask.length !== n * n) out.range = false;
        for (const v of mask) if (!(v >= 0 && v <= 1)) { out.range = false; break; }
        if (sum(mask) < 20) out.inked = false;
        out.boxes.push({ long: text === long, size, ...judge(mask, box) });
      }
      for (const size of [0.1, 0.3, 0.5, 0.7, 0.9]) { const r = ink.inkTitleMask(short, size, 0.5, n); out.boxes.push({ long: false, size, ...judge(r.mask, r.box), steps: true }); }
      for (const y of [0.2, 0.5, 0.8]) { const r = ink.inkTitleMask(short, 0.4, y, n), b = judge(r.mask, r.box).box; out.ys.push({ y, mid: (b[1] + b[3]) / 2 }); }
      // An "L" alone: its foot is the bottom of the grid (row 0 is the plate's bottom), its stem the left.
      const { mask } = ink.inkTitleMask({ artist: '', title: 'L' }, 0.6, 0.5, n);
      let bottom = 0, top = 0, left = 0, right = 0, cx = 0, cy = 0, w = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = mask[i + j * n]; cx += v * i; cy += v * j; w += v; }
      cx /= w; cy /= w;
      let x0 = n, x1 = 0, y0 = n, y1 = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (mask[i + j * n] > 0.3) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = mask[i + j * n]; if (j < my) bottom += v; else top += v; if (i < mx) left += v; else right += v; }
      out.L = { bottom, top, left, right };
      return out;
    });
    {
      const bad = [];
      if (!m.range) bad.push('coverage outside 0..1 or not n × n');
      if (!m.inked) bad.push('a mask with next to no ink');
      const disagree = m.boxes.filter((b) => !b.agrees);
      if (disagree.length) bad.push(`the box handed back is not the mask's ink: ${disagree.slice(0, 3).map((b) => `size ${b.size} gave [${(b.given ?? []).map((v) => v.toFixed(3))}] for [${b.box.map((v) => v.toFixed(3))}]`).join(', ')}`);
      const blur = m.boxes.filter((b) => b.size >= 0.3 && (b.clear < CLEAR || b.solid < SOLID));
      if (blur.length) bad.push(`not letters but a blur: ${blur.slice(0, 3).map((b) => `size ${b.size}: ${(100 * b.clear).toFixed(0)}% clear, ${(100 * b.solid).toFixed(0)}% solid`).join(', ')} (bars ≥ ${100 * CLEAR}% and ≥ ${100 * SOLID}%)`);
      if (!(m.L.bottom > m.L.top && m.L.left > m.L.right)) bad.push(`an "L" is ${m.L.bottom > m.L.top ? '' : 'upside down '}${m.L.left > m.L.right ? '' : 'mirrored'} on the grid`);
      const off = m.boxes.filter((b) => !b.steps && (b.box[0] < 0.06 || b.box[1] < 0.06 || b.box[2] > 0.94 || b.box[3] > 0.94));
      if (off.length) bad.push(`off the wall: ${off.map((b) => `${b.long ? 'long' : 'short'} at ${b.size} [${b.box.map((v) => v.toFixed(2))}]`).join(', ')}`);
      const steps = m.boxes.filter((b) => b.steps || (!b.long && (b.size === 0 || b.size === 1))).sort((p, q) => p.size - q.size);
      const widths = steps.map((b) => b.box[2] - b.box[0]);
      if (!widths.every((w, i) => i === 0 || w > widths[i - 1])) bad.push(`widths ${widths.map((w) => w.toFixed(3)).join(', ')} not rising with size`);
      const atZero = m.boxes.find((b) => !b.long && b.size === 0 && !b.steps), atOne = m.boxes.find((b) => !b.long && b.size === 1 && !b.steps);
      if (atZero.box[3] - atZero.box[1] > 0.08) bad.push(`at size 0 the box is ${(atZero.box[3] - atZero.box[1]).toFixed(3)} tall (bar ≤ 0.08)`);
      if (atOne.box[2] - atOne.box[0] < 0.85) bad.push(`at size 1 a short title spans ${(atOne.box[2] - atOne.box[0]).toFixed(3)} (bar ≥ 0.85)`);
      const miss = m.ys.filter((v) => Math.abs(v.mid - v.y) > 0.05);
      if (miss.length) bad.push(`lands off where asked: ${miss.map((v) => `${v.y} → ${v.mid.toFixed(3)}`).join(', ')}`);
      const at05 = m.boxes.find((b) => !b.long && b.size === 0.5 && !b.steps);
      line('mask', LINES.mask, bad.length === 0, bad.length ? bad.join('; ')
        : `at 0.5 ${(100 * at05.clear).toFixed(0)}% clear, ${(100 * at05.solid).toFixed(0)}% solid; widths ${widths.map((w) => w.toFixed(2)).join(' → ')}; size 0 ${(atZero.box[3] - atZero.box[1]).toFixed(3)} tall; middles ${m.ys.map((v) => v.mid.toFixed(2)).join(', ')}`, false);
    }

    // ── lands, sweep, kept (the solver) ──
    // One arm: a still plate with a pool of dye in a corner, the title poured,
    // then `seconds` of the plate at 60 steps a second with the wash at `dial`,
    // read every half second. Readability as the header says: the best shifted
    // correlation of the dye's density with the mask, in the mask's box.
    const arm = (dial, seconds) => page.evaluate(async ([dial, seconds, size, y]) => {
      const { L, N } = await lab.create(256, 192);
      const pal = lab.palette().colours;
      const rgb = ink.inkTitleInk('', pal);
      const total = async () => { const d = await lab.field('dye'); let t = 0; for (let i = 3; i < d.length; i += 4) t += d[i]; return t; };
      lab.dye(0.12, 0.12, 0.08, rgb, 1); lab.flush(); await lab.step(1, {}, true);
      const before = await total();
      const text = { artist: 'Louis Armstrong', title: 'West End Blues' };
      const { mask, box } = ink.inkTitleMask(text, size, y, N);
      const mL = ink.inkTitleMask(text, size, y, L).mask;
      let cover = 0; for (const v of mask) cover += v;
      const poured = lab.solver().pourInk(mask, N, rgb, ink.INK_TITLE_DENSITY);
      // The mask's box at L, padded two cells, and its values there.
      let x0 = L, x1 = 0, y0 = L, y1 = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) if (mL[i + j * L] > 0.3) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
      x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(L - 1, x1 + 2); y1 = Math.min(L - 1, y1 + 2);
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, mm = new Float32Array(bw * bh);
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) mm[i + j * bw] = mL[x0 + i + (y0 + j) * L];
      let mu = 0; for (const v of mm) mu += v; mu /= mm.length;
      let ms = 0; for (const v of mm) ms += (v - mu) ** 2; ms = Math.sqrt(ms);
      const ncc = (d, dx, dy) => {
        let s = 0, sv = 0, svv = 0;
        for (let j = 0; j < bh; j++) {
          const yy = y0 + j + dy; if (yy < 0 || yy >= L) return -1;
          for (let i = 0; i < bw; i++) {
            const xx = x0 + i + dx; if (xx < 0 || xx >= L) return -1;
            const v = d[xx + yy * L]; sv += v; svv += v * v; s += (mm[i + j * bw] - mu) * v;
          }
        }
        const n = bw * bh, vs = Math.sqrt(Math.max(0, svv - sv * sv / n));
        return vs > 0 ? s / (ms * vs) : 0;
      };
      const read = async () => {
        const f = await lab.field('dye');
        const d = new Float32Array(L * L);
        for (let i = 0; i < L * L; i++) { d[i] = f[i * 4 + 3]; if (!Number.isFinite(f[i * 4]) || !Number.isFinite(d[i])) throw new Error(`the dye is not finite at cell ${i} (${f[i * 4]}, ${d[i]}): a broken plate, not a gone title`); }
        // Every shift that keeps the box on the plate: a title that slid
        // anywhere, intact, is still readable.
        const rx = L - bw, ry = L - bh;
        let best = -1, bx = 0, by = 0;
        for (let dy = -y0; dy <= ry - y0; dy += 3) for (let dx = -x0; dx <= rx - x0; dx += 3) { const r = ncc(d, dx, dy); if (r > best) { best = r; bx = dx; by = dy; } }
        const cx = bx, cy = by;
        for (let dy = cy - 2; dy <= cy + 2; dy++) for (let dx = cx - 2; dx <= cx + 2; dx++) { const r = ncc(d, dx, dy); if (r > best) { best = r; bx = dx; by = dy; } }
        let on = 0, onN = 0, gap = 0, gapN = 0;
        for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
          const v = d[x0 + bx + i + (y0 + by + j) * L], c = mm[i + j * bw];
          if (c > 0.5) { on += v; onN++; } else if (c < 0.02) { gap += v; gapN++; }
        }
        let t = 0; for (const v of d) t += v;
        // Strokes against gaps where the title is best matched, wherever it went.
        return { r: best, shift: [bx, by], strokes: on / Math.max(1, onN), gaps: gap / Math.max(1, gapN), total: t };
      };
      const vel = new Float32Array(L * L * 4);
      const SEC = 1 / 60, reads = [];
      let written = 0;
      // The pour takes effect at the next step; half a second later is "landed".
      for (let k = 1; k <= Math.round(seconds * 60); k++) {
        vel.fill(0);
        ink.inkTitleWash(SEC, (k - 1) * SEC, dial, box, vel, L);
        for (let i = 0; i < vel.length; i++) if (vel[i] !== 0) { written++; break; }
        lab.addVel(vel); lab.flush();
        await lab.step(1, { magnetSeconds: SEC }, true);
        if (k % 30 === 0) reads.push({ t: k * SEC, ...(await read()) });
      }
      return { poured, before, cover: cover * (L / N) ** 2, reads, written, after: await total(), box: Array.from(box) };
    }, [dial, seconds, dflt.size, dflt.y]);

    const at = (a, t) => a.reads.find((r) => Math.abs(r.t - t) < 1e-6);
    // Gone: the best match anywhere on the plate at 0.3 or worse.
    const goneBy = (a) => a.reads.find((r) => r.r <= GONE)?.t ?? null;
    const f3 = (v) => v.toFixed(3);

    const d = await arm(dflt.sweep, 12);
    {
      const r = at(d, 0.5), bad = [];
      const rose = r ? r.total - d.before : 0, want = d.cover * ink.INK_TITLE_DENSITY;
      if (d.poured !== true) bad.push(`pourInk returned ${d.poured}, not true`);
      if (!r) bad.push('no reading at 0.5 s');
      else {
        if (r.r < READ) bad.push(`it reads at ${f3(r.r)} half a second after it lands (bar ≥ ${READ})`);
        if (!(r.strokes >= 4 * r.gaps)) bad.push(`strokes ${f3(r.strokes)} against gaps ${f3(r.gaps)} (bar ×4)`);
        if (!(Math.abs(rose - want) <= 0.1 * want)) bad.push(`the plate's dye rose ${rose.toFixed(1)}, the mask's coverage × density is ${want.toFixed(1)} (bar within 10%)`);
      }
      line('lands', LINES.lands, bad.length === 0, bad.length ? bad.join('; ')
        : `reads ${f3(r.r)} at 0.5 s; strokes ${f3(r.strokes)} vs gaps ${f3(r.gaps)}; dye rose ${rose.toFixed(1)} for ${want.toFixed(1)} poured, the pool's ${d.before.toFixed(1)} kept`, false);
    }
    const hard = await arm(1, 2);
    const gentle = await arm(0.01, 6);
    const zero = await page.evaluate(([box]) => {
      const L = 192, vel = new Float32Array(L * L * 4);
      ink.inkTitleWash(1 / 60, 1, 0, box, vel, L);
      return vel.every((v) => v === 0);
    }, [d.box]);
    {
      const bad = [];
      const r3 = at(d, 3), gD = goneBy(d), gH = goneBy(hard), r12g = at(gentle, 6);
      if (!r3 || r3.r < STILL) bad.push(`at the default dial (${dflt.sweep}) it reads ${r3 ? f3(r3.r) : '—'} at 3 s (bar ≥ ${STILL})`);
      if (gD === null) bad.push(`at the default dial it still reads ${f3(d.reads.at(-1).r)} at 12 s (bar ≤ ${GONE})`);
      if (gH === null || gH > 2) bad.push(`at the top it reads ${f3(hard.reads.at(-1).r)} at 2 s (bar ≤ ${GONE})`);
      if (!r12g || r12g.r < STILL) bad.push(`at 0.01 it reads ${r12g ? f3(r12g.r) : '—'} at 6 s (bar ≥ ${STILL}: a gentle drift)`);
      if (!zero) bad.push('the dial at 0 wrote into the deltas');
      const trace = (a) => a.reads.filter((_, i) => i % 2 === 1).map((r) => f3(r.r)).join(' ');
      line('sweep', LINES.sweep, bad.length === 0,
        `${bad.length ? `${bad.join('; ')}. ` : ''}default ${dflt.sweep}: gone at ${gD ?? '—'} s [${trace(d)}]; top: gone at ${gH ?? '—'} s; 0.01: ${r12g ? f3(r12g.r) : '—'} at 6 s`, false);
    }
    {
      // Every arm, the top's too: a wash that throws the dye away "clears" fastest.
      const keep = (a, name) => {
        const end = a.reads.at(-1), want = a.cover * ink.INK_TITLE_DENSITY, k = end ? end.total - a.before : 0;
        return { ok: !!end && k >= 0.9 * want, text: `${name} ${end ? `${k.toFixed(1)} of ${want.toFixed(1)}` : 'no reading'}` };
      };
      const ks = [keep(d, 'default at 12 s'), keep(hard, 'top at 2 s'), keep(gentle, '0.01 at 6 s')];
      line('kept', LINES.kept, ks.every((k) => k.ok),
        `the plate holds of the title's dye: ${ks.map((k) => `${k.ok ? '' : 'FAILS '}${k.text}`).join('; ')} (bar ≥ 90%); the default's title ended ${d.reads.at(-1)?.shift.join(', ')} cells off`, false);
    }
  } finally {
    await close();
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} failed` : `\n${checks.length} passed${owedNow ? `, ${owedNow} owed` : ''}`);
process.exit(failed.length ? 1 : 0);
