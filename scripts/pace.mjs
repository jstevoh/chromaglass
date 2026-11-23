#!/usr/bin/env node
/**
 * The lively looks at a real show's pace (PLAN 48q; `npm run pace`, node only,
 * about a second; `npm run pace -- --film <dir>` on the Mac reads a film).
 *
 * What was found (2026-11-12): filmed against the owner's references and two
 * real shows, 25 of 33 liquid looks turned over several times slower than a
 * real show (`npm run watch`'s physics read: the time the flow takes to carry
 * a form across its own size), and a closer camera did not close it. The fix
 * is the liquid worked harder by what works a real dish, the hand's tilt
 * (Plate Rock), the rhythm sheet pressed on the kick (Beat Squeeze) and the
 * hands pouring more often (Evolve Speed), laid on each lively look by
 * src/presetsPace.ts. This holds:
 *
 *  1. Each paced look is a real look and not Classic (another piece of work
 *     rebuilds it) or a pack look (the moiré pack keeps its own pace).
 *  2. Each paced look carries its pace whole after every pass laid over the
 *     looks: the pass reached PRESETS, and no later pass (the moiré pack's,
 *     the cords') wrote over it.
 *  3. Never quieter: each forcing at least what the look had before 48q (the
 *     table below, the look's own or the default it fell to), and at least
 *     one of them harder.
 *  4. Inside the dial, and a firm hand rather than a thrown one: Plate Rock
 *     under 1 (it is a real hand's lean to 0.45 and past real above it; the
 *     dial runs to 3), Beat Squeeze and Evolve Speed inside their dials.
 *  5. The moiré pack's looks laid over a paced look keep that look's pace as
 *     it was before 48q, and a look not in the table goes through the pass
 *     untouched (a fixture with one of each).
 *  6. The controls: a look with its pace taken off fails 2, one turned below
 *     what it had fails 3, and one thrown past a firm hand fails 4, so the
 *     tests above can fail.
 *  7. With `--film <dir>` (a `npm run film` folder made with FILM_ONLY the
 *     paced looks, FILM_TAKES=1, FILM_SECONDS=60 and FILM_KEEP=1, on the Mac):
 *     the film is one whole run (its film.json, 60 s takes, seed 1, every
 *     paced look's take clean and its reading made from that take), every
 *     paced look turns over faster than the faster of its two films before
 *     48q (BEFORE below: two takes of the same code and seed, which differed
 *     by up to a fifth, so a look counts as faster only past that), and the
 *     true median of the ratios to their mean (the middle one, with five) at
 *     least half as fast again (7b). 7c holds that the speed was not bought by
 *     stirring the colours into one: each look keeps 90% of its colourfulness
 *     and at least half its near-black share. That is the claim itself, on
 *     the GPU it is about; the cloud and CI cannot run it, and a run without
 *     `--film` says so in its last line.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PRESETS } from '../src/presets.ts';
import { PACE, layPaceLooks } from '../src/presetsPace.ts';
import { MOIRE_LOOKS } from '../src/presetsMoire.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { LEARNABLE_SETTINGS } from '../src/lib/midi.ts';
import { thicknessViscosity } from '../src/lib/turntable.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const KEYS = ['plateRock', 'beatSqueeze', 'automateRate', 'gapThickness'];
/*
  Which way is harder. A thinner liquid is the harder-worked one: every push
  in the gap goes at Darcy's h²/12μ, so Thickness turned down is the dish
  worked harder, and turned up is quieter.
*/
const THINNER = new Set(['gapThickness']);
const harder = (k, v, was) => (THINNER.has(k) ? v < was : v > was);
const softer = (k, v, was) => (THINNER.has(k) ? v > was : v < was);

/*
  What each look had before 48q (origin/main 2d5fb074), its own value or the
  default it fell to: Plate Rock's 0.45, Beat Squeeze's 0. Written here, not
  read, because presets.ts lays the pace as it loads; `npm run pace` fails if
  a look in PACE is missing from it.
*/
const WAS = {
  'crowd-plate':     { plateRock: 0.35, beatSqueeze: 0.3, automateRate: 0.18, gapThickness: 0.45 },
  'oil-and-water':   { plateRock: 0.45, beatSqueeze: 0,   automateRate: 0.1, gapThickness: 0.45 },
  'red-cabbage':     { plateRock: 0.45, beatSqueeze: 0,   automateRate: 0.24, gapThickness: 0.45 },
  'home-movie':      { plateRock: 0.45, beatSqueeze: 0,   automateRate: 0.2, gapThickness: 0.45 },
  splodascope:       { plateRock: 0.45, beatSqueeze: 0,   automateRate: 0.08, gapThickness: 0.45 },
};

/*
  The films before 48q (2026-11-22, `npm run film` on the owner's Mac from
  2d5fb074, seed 1, 60 s takes with the band in a box): turnover in seconds,
  two takes of each look an hour apart. The seed fixes where the plate starts,
  not the frames after it (film.mjs says why), and the two takes differed by
  up to a fifth: Crowd Plate 3.97 and 4.59, Home Movie 9.62 and 7.64. So 7a
  asks each look to beat the faster of its two, and 7b takes ratios to their
  mean.
*/
const BEFORE = {
  'crowd-plate': [3.97, 4.59], splodascope: [3.92, 4.13], 'red-cabbage': [5.56, 5.92],
  'oil-and-water': [5.78, 5.80], 'home-movie': [9.62, 7.64],
};
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
/*
  The same two films' colour, for 7c, each the mean of the two takes: the
  colourfulness `npm run watch` reads (Hasler and Suesstrunk's M, the median
  over the take) and the plate's near-black share (film.json's black mean:
  the share of the frame near black by its brightness). Not watch's
  "coloured" share turned over: that counts grey, white and pastel as dark,
  so a plate that washed out would read darker. A first try ran every paced
  look at water's 1 cSt (Thickness 0). It turned over fast (Red Cabbage 1.8x,
  Oil and Water 3.4x) and it stirred the colours into one: Red Cabbage's
  colourfulness fell from 83 to 51, Splodascope's hue spread halved, Home
  Movie went to a flat yellow plate. A faster plate that has lost its colours
  and its dark is not the lively look, so 7c holds both to what they were.
*/
const BEFORE_COLOUR = {
  'crowd-plate': 125.4, splodascope: 125.3, 'red-cabbage': 84.1,
  'oil-and-water': 108.7, 'home-movie': 115.3,
};
const BEFORE_DARK = {
  'crowd-plate': 0.157, splodascope: 0.072, 'red-cabbage': 0.100,
  'oil-and-water': 0.244, 'home-movie': 0.262,
};

// 1.
const ids = Object.keys(PACE);
const missing = ids.filter((id) => !PRESETS.some((p) => p.id === id && !p.pack));
check('1. each paced look is a built-in look of the house, not Classic', missing.length === 0 && !ids.includes('classic'),
  missing.length ? `not a house look: ${missing.join(', ')}` : `${ids.length} looks`);

// 2.–4. on the shipped looks, as functions so the controls can run them on a fixture.
function carries(looks) {
  const bad = [];
  for (const id of ids) {
    const s = looks.find((p) => p.id === id && !p.pack)?.settings ?? {};
    for (const k of KEYS) if (s[k] !== PACE[id][k]) bad.push(`${id}.${k}=${s[k]}`);
  }
  return bad;
}
function quieter(table) {
  const bad = [];
  for (const id of Object.keys(table)) {
    const was = WAS[id];
    if (!was) { bad.push(`${id}: no record of what it had`); continue; }
    for (const k of KEYS) if (softer(k, table[id][k], was[k])) bad.push(`${id}.${k} ${table[id][k]} softer than ${was[k]}`);
    if (!KEYS.some((k) => harder(k, table[id][k], was[k]))) bad.push(`${id}: nothing harder`);
  }
  return bad;
}
const dial = Object.fromEntries(LEARNABLE_SETTINGS.filter((d) => KEYS.includes(d.key)).map((d) => [d.key, d]));
function outside(table) {
  const bad = [];
  for (const id of Object.keys(table)) {
    for (const k of KEYS) {
      const v = table[id][k];
      if (!(v >= dial[k].min && v <= dial[k].max)) bad.push(`${id}.${k} ${v} outside ${dial[k].min}–${dial[k].max}`);
    }
    if (table[id].plateRock > 1) bad.push(`${id}.plateRock ${table[id].plateRock} past a firm hand`);
  }
  return bad;
}
const c2 = carries(PRESETS);
check('2. each paced look carries its pace whole, after every pass', c2.length === 0, c2.join('; ') || KEYS.join(', '));
const q3 = quieter(PACE);
check('3. never quieter than it was, and harder in at least one forcing', q3.length === 0, q3.join('; ') || 'each');
const o4 = outside(PACE);
check('4. inside the dials, the hand firm and not thrown', dial.plateRock && dial.beatSqueeze && dial.automateRate && o4.length === 0,
  o4.join('; ') || `Plate Rock ≤ 1, Beat Squeeze ≤ ${dial.beatSqueeze?.max}, Evolve ≤ ${dial.automateRate?.max}, Thickness ${dial.gapThickness?.min}–${dial.gapThickness?.max}`);
/*
  4b. The Thickness each paced look is given is the liquid it says it is made
  of, not a number turned down until the plate ran fast. Every paced look is
  water-borne dye: by its own description (a torrent, cabbage water, oil
  drops in blue water, the light show's dyed water) or as the live show's
  water dish (Crowd Plate). Water is 1 cSt, against the 22 cSt light mineral oil every look ran
  at before (Thickness 0.45, the default). The thin gap's own law (Darcy speed
  h²Δρg sinθ / 12μ, a push coasting for h²/12ν) makes a liquid three to four
  times thinner move three to four times faster under the same tilt.
  So the bar is the kinematic viscosity the thin gap is handed
  (lib/turntable.ts thicknessViscosity, the same law gpu/fluid/constants.ts
  thinGapViscosity draws from): thinner than the light oil, and no thinner
  than 2 cSt. Why not water itself, which these looks are: the first film at
  1 cSt stirred the colours into one (7c below, and PLAN 48q-2 asks whether
  that is the real stirring or the plate's grid), so the table sits at
  4–8 cSt, a thin water-and-glycerine, the thinnest that kept each look's
  colours and dark on the film, and the floor keeps a later retune off the
  water that muddied them until 48q-2 says why. (Water's own 1 cSt cannot be
  the floor: thicknessViscosity clamps Thickness at 0, so nothing reads
  below it and the floor could not fail.) A look meant to be syrup would fail
  here and should: it does not belong in this table.
*/
const LIQUID_MIN_CST = 2;
const LIGHT_OIL_CST = thicknessViscosity(DEFAULT_SETTINGS.gapThickness) * 1e6;
function notItsLiquid(table) {
  const bad = [];
  for (const id of Object.keys(table)) {
    const cst = thicknessViscosity(table[id].gapThickness) * 1e6;
    if (!(cst >= LIQUID_MIN_CST - 1e-9 && cst < LIGHT_OIL_CST - 1e-9)) bad.push(`${id} ${cst.toFixed(1)} cSt`);
  }
  return bad;
}
const l4 = notItsLiquid(PACE);
check('4b. each paced look runs thinner than light oil, and no thinner than 2 cSt', l4.length === 0,
  l4.join('; ') || Object.keys(PACE).map((id) => `${id} ${(thicknessViscosity(PACE[id].gapThickness) * 1e6).toFixed(1)}`).join(', ') + ' cSt');

// 5. A look outside the table, on a fixture; the moiré pack, on the shipped looks.
const fixture = [
  { id: 'red-cabbage', name: 'm', description: '', settings: { plateRock: 0.1, automateRate: 0.14, viscosity: 'thin' } },
  { id: 'not-paced', name: 'n', description: '', settings: { plateRock: 0.2 } },
];
const before5 = JSON.stringify(fixture[1]);
layPaceLooks(fixture);
check('5a. a look not in the table goes through the pass untouched', JSON.stringify(fixture[1]) === before5);
check('5b. a paced look keeps its own settings beside its pace', fixture[0].settings.viscosity === 'thin' && fixture[0].settings.plateRock === PACE['red-cabbage'].plateRock);
/*
  The pack is laid from the house looks as they were (layMoireLooks runs
  before layPaceLooks), so a pack look made from a paced look rocks, presses
  and pours as that look did before 48q, unless the pack look sets its own.
*/
function packDrift(looks) {
  const bad = [];
  let seen = 0;
  for (const m of MOIRE_LOOKS) {
    if (!PACE[m.from]) continue;
    seen++;
    const s = looks.find((p) => p.id === m.id && p.pack === 'moire')?.settings;
    if (!s) { bad.push(`${m.id} missing`); continue; }
    for (const k of KEYS) {
      const want = m.settings[k] ?? WAS[m.from][k];
      if ((s[k] ?? (k === 'beatSqueeze' ? 0 : DEFAULT_SETTINGS[k])) !== want) bad.push(`${m.id}.${k}=${s[k]}, want ${want}`);
    }
  }
  return { bad, seen };
}
const p5 = packDrift(PRESETS);
check('5c. the moiré pack made from a paced look keeps its own pace', p5.seen > 0 && p5.bad.length === 0, p5.bad.join('; ') || `${p5.seen} pack looks from paced looks`);

// 6. Controls.
const off = PRESETS.map((p) => (p.id === 'oil-and-water' && !p.pack ? { ...p, settings: { ...p.settings, plateRock: undefined } } : p));
check('6a. control: a look with its rock taken off fails 2', carries(off).length > 0);
check('6b. control: a look turned below what it had fails 3', quieter({ ...PACE, 'red-cabbage': { ...PACE['red-cabbage'], beatSqueeze: 0, plateRock: 0.4 } }).length > 0);
check('6c. control: a look with nothing harder fails 3', quieter({ 'oil-and-water': { ...WAS['oil-and-water'] } }).length > 0);
check('6d. control: a hand thrown past firm fails 4', outside({ 'red-cabbage': { ...PACE['red-cabbage'], plateRock: 1.5 } }).length > 0);
// 6g keeps the rest of the look's new pace, so only the thicker liquid can
// trip 3 (built from WAS, "nothing harder" would trip it as well).
check('6g. control: a look thickened past light oil, the rest of its pace kept, fails 3', quieter({ 'red-cabbage': { ...PACE['red-cabbage'], gapThickness: 0.6 } }).length > 0 && quieter({ 'red-cabbage': { ...PACE['red-cabbage'] } }).length === 0);
check('6h. control: a look left at light oil fails 4b', notItsLiquid({ 'red-cabbage': { ...PACE['red-cabbage'], gapThickness: 0.45 } }).length > 0);
check('6i. control: a look at water (Thickness 0) fails 4b', notItsLiquid({ 'red-cabbage': { ...PACE['red-cabbage'], gapThickness: 0 } }).length > 0);
const paced = PRESETS.map((p) => (p.pack === 'moire' && MOIRE_LOOKS.find((m) => m.id === p.id && PACE[m.from]) ? { ...p, settings: { ...p.settings, ...PACE[MOIRE_LOOKS.find((m) => m.id === p.id).from] } } : p));
check('6e. control: a pack look given its house look\'s new pace fails 5c', packDrift(paced).bad.length > 0);
check('6f. the defaults the record fell to are still the defaults', DEFAULT_SETTINGS.plateRock === 0.45 && (DEFAULT_SETTINGS.beatSqueeze ?? 0) === 0 && DEFAULT_SETTINGS.gapThickness === 0.45,
  `Plate Rock ${DEFAULT_SETTINGS.plateRock}, Beat Squeeze ${DEFAULT_SETTINGS.beatSqueeze}, Thickness ${DEFAULT_SETTINGS.gapThickness}`);

// 7. The film, when one is given. Any other argument is refused, so a typo
// (`--flim`, `--film=dir`) cannot pass with the film unread.
const args = process.argv.slice(2);
let filmDir;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--film' && args[i + 1]) filmDir = args[++i];
  else if (args[i].startsWith('--film=')) filmDir = args[i].slice(7);
  else { console.error(`pace: unknown argument "${args[i]}" (only --film <dir>)`); process.exit(2); }
}
if (filmDir) {
  // 7.0 The film is one whole run: its film.json, 60 s takes on seed 1, and
  // for each paced look a clean take whose reading was made from that take
  // (design.json no older than take.webm: film.mjs deletes the old take
  // before filming, not the old reading, so a take that never ran would
  // otherwise leave the last run's numbers to be read as this one's).
  const fj = join(filmDir, 'film.json');
  const film = existsSync(fj) ? JSON.parse(readFileSync(fj, 'utf8')) : null;
  const whole = [];
  if (!film) whole.push('no film.json');
  else if (film.seconds !== 60) whole.push(`${film.seconds} s takes, not 60`);
  const rows = [];
  for (const id of ids) {
    const take = film?.looks?.find((l) => l.id === id)?.takes?.find((t) => t.seed === 1);
    const dj = join(filmDir, id, 'seed-1', 'design.json');
    const webm = join(filmDir, id, 'seed-1', 'take.webm');
    if (!take) { whole.push(`${id} has no seed-1 take`); continue; }
    if (take.problems?.length) whole.push(`${id}: ${take.problems.join(', ')}`);
    if (!existsSync(dj) || !existsSync(webm)) { whole.push(`${id} has no take.webm and reading (FILM_KEEP=1)`); continue; }
    if (statSync(dj).mtimeMs < statSync(webm).mtimeMs) whole.push(`${id}'s reading is older than its take`);
    const d = JSON.parse(readFileSync(dj, 'utf8'));
    const p = d.physics ?? {};
    rows.push({ id, before: BEFORE[id], after: p.turnover, life: p.lifetime,
      colour: d.colourfulness?.med, dark: take.shape?.black?.mean });
  }
  check('7.0 the film is one whole run of 60 s takes, every paced look clean', whole.length === 0, whole.join('; ') || `${rows.length} looks`);
  const pc = (v) => (v == null ? '–' : (v * 100).toFixed(0) + '%');
  for (const r of rows) console.log(`     ${r.id.padEnd(16)} turnover ${r.before.join(' / ')} s → ${r.after?.toFixed(2) ?? '–'} s (${r.after > 0 ? (mean(r.before) / r.after).toFixed(2) : '–'}x), lifetime ${r.life?.toFixed(2) ?? '–'} s, colourfulness ${BEFORE_COLOUR[r.id]} → ${r.colour?.toFixed(1) ?? '–'}, near black ${pc(BEFORE_DARK[r.id])} → ${pc(r.dark)}`);
  const unfilmed = ids.filter((id) => !rows.some((r) => r.id === id));
  const slower = rows.filter((r) => !(r.after < Math.min(...r.before)));
  // A true median: with an even count, the mean of the two middle ratios, so
  // the upper one alone cannot carry the bar.
  const ratios = rows.map((r) => (r.after > 0 ? mean(r.before) / r.after : 0)).sort((a, b) => a - b);
  const mid = ratios.length / 2;
  const median = !ratios.length ? 0 : ratios.length % 2 ? ratios[Math.floor(mid)] : (ratios[mid - 1] + ratios[mid]) / 2;
  check('7a. every paced look filmed, and each turns over faster than both its films before 48q', unfilmed.length === 0 && slower.length === 0,
    [unfilmed.length ? `not filmed: ${unfilmed.join(', ')}` : '', slower.length ? `not faster: ${slower.map((r) => r.id).join(', ')}` : ''].filter(Boolean).join('; ') || `${rows.length} looks`);
  check('7b. and the median at least half as fast again', median >= 1.5, `median ${median.toFixed(2)}x`);
  // 7c. Not by stirring the colours into one: colourfulness at least 90% of
  // what it was, and at least half the near-black share it had.
  const muddied = rows.filter((r) => !(r.colour >= 0.9 * BEFORE_COLOUR[r.id] && r.dark >= 0.5 * BEFORE_DARK[r.id]));
  check('7c. and each keeps its colours and its dark (colourfulness ≥ 90%, near black ≥ half of before)', rows.length > 0 && muddied.length === 0,
    muddied.map((r) => `${r.id} ${r.colour?.toFixed(1)} / ${pc(r.dark)}`).join('; ') || `${rows.length} looks`);
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} failed` : `\nall ${checks.length} passed`);
if (!filmDir) console.log('7 not run: the turnover claim itself is `npm run pace -- --film <dir>` on the Mac');
process.exit(failed.length ? 1 : 0);
