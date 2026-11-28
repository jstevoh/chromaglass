// The guide names only what the app has (PLAN 49l-guard).
//
//   npm run guidenames
//
// What was reported: the usability review of 2026-11-26 (PLAN 49, H10-01)
// found docs/guide.md and the in-app guide (src/components/GuidePanel.tsx)
// still sending people to the Macro toggle, the Eye toggle and the Settings
// gear, and down Settings paths through groups the panel no longer has
// (Inputs, Live, Camera, The Room). 49l (#974) rewrote both; nothing kept
// them true after it, and the guide is the one place a performer is told
// where a control lives. A path that leads nowhere is worse than none: the
// reader opens Settings, looks for a group that is not on the rail, and
// concludes the feature has gone.
//
// So this reads every Settings path either guide gives ("Settings → Look →
// Lamp & Light", "Settings → Stage → Wall → Second Screen") and walks it
// against the panel's own map, lib/settingsMap.ts, the list the rail, the
// search and the desks all draw from:
//   - the second step must be one of the rail's groups (SETTINGS_CATEGORIES);
//   - the third must be a section in that group (SETTINGS_SECTIONS), so a
//     section moved to another group fails the paths that still send people
//     to the old one;
//   - a fourth step, a control or heading inside the section, must be words
//     the settings panel's own markup still draws (its strings and JSX text,
//     comments left out), since that is what the reader will be looking for.
// And the phone's "More › X" rows the guide names must be rows the phone's
// More sheet draws.
//
// Why not a list of retired names, which is what 49l's brief first asked
// for: a list catches only the names somebody already found. The next
// rename (49d renamed eleven controls in one PR) would leave the guide stale
// with the list green. The map is the app's own answer to "what is there",
// so a path is checked against it rather than against yesterday's mistakes.
// The four names H10-01 found are still asked after by name, below, because
// they are names of buttons rather than paths and a path walk cannot see
// them.
//
// The walk proves itself before it judges: it must find a floor of paths in
// each file (a parser that silently matched nothing would pass everything),
// and a made-up guide with stale steps at each level must fail on exactly
// those steps.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (f) => readFileSync(join(root, f), 'utf8');

let fails = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fails += 1;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── The panel's map, read from its source ────────────────────────────────
// Read as text rather than imported so the check runs under plain node with
// no build step; the counts below fail if the shape it reads ever changes.
const mapSrc = read('src/lib/settingsMap.ts');
const catBlock = mapSrc.slice(mapSrc.indexOf('export const SETTINGS_CATEGORIES'), mapSrc.indexOf('export interface SettingsSection'));
const CATEGORIES = new Map([...catBlock.matchAll(/\{\s*id:\s*'([\w-]+)',\s*name:\s*'([^']+)'/g)].map(m => [m[2], m[1]]));
const secBlock = mapSrc.slice(mapSrc.indexOf('export const SETTINGS_SECTIONS'), mapSrc.indexOf('export const MERGED_SECTIONS'));
const SECTIONS = [...secBlock.matchAll(/\{\s*id:\s*'([\w-]+)',\s*name:\s*'([^']+)',\s*category:\s*'([\w-]+)'/g)]
  .map(m => ({ id: m[1], name: m[2], category: m[3] }));

/**
 * The words a source draws: its string literals and JSX text, comments,
 * class names and test ids left out. Each literal is kept apart from the
 * next by ¦, which no name contains, so a "two-word name" can only match
 * words drawn together: joined with a space, "Show" ending one literal and
 * "the" starting the next passed "Show the" (the review of this check).
 */
function drawnText(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
    .replace(/\b(className|class|data-testid|testId|key|id|htmlFor|href|src|type|role|name)=(\{`[^`]*`\}|"[^"]*"|'[^']*'|\{'[^']*'\})/g, ' ');
  const parts = [];
  for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) parts.push(m[1] ?? m[2] ?? m[3]);
  for (const m of code.matchAll(/>([^<>{}]+)</g)) parts.push(m[1]);
  return parts.map(p => p.replace(/\s+/g, ' ').trim()).join('¦').toLowerCase();
}
const filesIn = (dir) => readdirSync(join(root, dir)).filter(f => /\.tsx?$/.test(f)).map(f => `${dir}/${f}`);
// The settings sheet: its shell, its sections, and the panels a section
// embeds whole (Sound's top is the Sound sheet's body, PLAN 35c-7).
const SETTINGS_FILES = ['src/components/SettingsPanel.tsx', 'src/components/SoundPanel.tsx', ...filesIn('src/components/settings'), 'src/lib/settingsMap.ts', 'src/lib/deskPins.ts'];
const settingsText = drawnText(SETTINGS_FILES.map(read).join('\n'));
const phoneText = drawnText(filesIn('src/components/phone').map(read).join('\n'));

const ARROW = '(?:→|›|->|&rarr;)';
/**
 * A window of the guide as plain words: its markup (Markdown's ** * `, the
 * in-app guide's <Em> and <C>) turned into a mark, ¦, that ends a step, since
 * "**Settings → Stage → Wall → Second Screen** chooses" names a control that
 * stops where the bold does. Lines joined: a path can break across one.
 */
const plain = (s) => s.replace(/\*\*|\*|`|<\/?\w+>/g, '¦').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const skip = (s) => s.replace(/^[\s¦]+/, '');
/** The longest of `names` the text starts with, on a word boundary. */
const startsWithName = (text, names) => names
  .filter(n => text.toLowerCase().startsWith(n.toLowerCase()) && !/[\p{L}\p{N}]/u.test(text.charAt(n.length)))
  .sort((a, b) => b.length - a.length)[0] ?? null;
/** A last step's words: up to the markup or punctuation that ends it, or an " and " / " with " that starts the next clause. */
const stepWords = (text) => skip(text).split(/[¦;,.:()\[\]"“”—]| and | with | under | on the | in the |$/)[0].trim();

/**
 * Is a last step drawn? A step the guide does not mark off runs on into its
 * sentence ("Settings → Stage → Simulation → Fluid Grid pins a size
 * instead"), so the longest run of its first words the app draws is the
 * name, as long as that is two words or more: one word ("Fluid", "Song") is
 * drawn somewhere for almost any name, and would pass a control that has
 * gone. A step of one word is asked for whole. And the name has to start a
 * drawn string, as a label does: found anywhere inside one, "The Projector"
 * passed on a hint's sentence about the projector.
 */
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'it', 'its', 'is', 'this', 'that', 'then', 'there', 'off', 'up', 'down', 'by']);
function drawnPrefix(step, drawn) {
  const w = step.split(' ').filter(Boolean);
  for (let n = w.length; n >= Math.min(2, w.length) && n > 0; n--) {
    const name = w.slice(0, n).join(' ');
    // A run of only little words ("Show the" without its noun) names nothing.
    if (w.slice(1, n).every(x => STOP.has(x.toLowerCase())) && n > 1) continue;
    if (new RegExp(`(^|¦)[\\s\\p{P}\\p{S}]*${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(drawn)) return { name, found: true };
  }
  return { name: w.slice(0, 4).join(' ') || '(nothing)', found: false };
}

/*
  Paths into other programs' settings, which the guide gives on purpose
  (macOS's System Settings → Displays for the projector, Chrome's Settings →
  System for graphics acceleration): not ours to walk. Told by the program
  named just before the path.
*/
const OTHER_APPS = /\b(System|Chrome|Edge|Safari|Firefox|macOS|iOS|iPadOS|Windows)\b[^.\n]{0,12}$/;
const skipped = [];
/** Rows of the settings rail that are not a group: Feedback, under the groups (FeedbackPane.tsx, PLAN 39a). */
const RAIL_ROWS = ['Feedback'];

/**
 * Every Settings path in a text, walked: [{ at, path, bad }] with `bad` the
 * first step the app has no such thing for, or null.
 */
function walkSettings(text) {
  const out = [];
  const re = new RegExp(`Settings\\s*${ARROW}`, 'g');
  for (const m of text.matchAll(re)) {
    const at = text.slice(0, m.index).split('\n').length;
    if (OTHER_APPS.test(text.slice(Math.max(0, m.index - 30), m.index))) { skipped.push(`line ${at}: …${text.slice(Math.max(0, m.index - 20), m.index + 24).replace(/\s+/g, ' ')}…`); continue; }
    let rest = skip(plain(text.slice(m.index + m[0].length, m.index + m[0].length + 200)));
    const arrow = () => { const a = rest.match(new RegExp(`^[\\s¦]*${ARROW}`)); if (a) rest = skip(rest.slice(a[0].length)); return !!a; };
    const row = startsWithName(rest, RAIL_ROWS);
    if (row) { out.push({ at, path: `Settings → ${row}`, bad: settingsText.includes(row.toLowerCase()) ? null : `the rail draws no "${row}"` }); continue; }
    const cat = startsWithName(rest, [...CATEGORIES.keys()]);
    if (!cat) { out.push({ at, path: `Settings → ${rest.slice(0, 30)}`, bad: `no group "${rest.split(/[\s,;.¦]+/)[0]}" on the rail` }); continue; }
    rest = rest.slice(cat.length);
    if (!arrow()) { out.push({ at, path: `Settings → ${cat}`, bad: null }); continue; }
    const inCat = SECTIONS.filter(s => s.category === CATEGORIES.get(cat)).map(s => s.name);
    const sec = startsWithName(rest, inCat);
    if (!sec) {
      const elsewhere = startsWithName(rest, SECTIONS.map(s => s.name));
      const home = elsewhere && [...CATEGORIES].find(([, id]) => id === SECTIONS.find(s => s.name === elsewhere).category)[0];
      out.push({ at, path: `Settings → ${cat} → ${rest.slice(0, 30)}`,
        bad: elsewhere ? `"${elsewhere}" is in ${home}, not ${cat}` : `no section like "${rest.slice(0, 24)}" in ${cat}` });
      continue;
    }
    rest = rest.slice(sec.length);
    if (!arrow()) { out.push({ at, path: `Settings → ${cat} → ${sec}`, bad: null }); continue; }
    const words = drawnPrefix(stepWords(rest), settingsText);
    out.push({ at, path: `Settings → ${cat} → ${sec} → ${words.name}`, bad: words.found ? null : `the settings panel draws no "${words.name}"` });
  }
  return out;
}

/** Every phone "More › X" row named in a text, against the phone's own words. */
function walkMore(text) {
  const out = [];
  for (const m of text.matchAll(new RegExp(`\\bMore\\s*${ARROW}\\s*`, 'g'))) {
    const at = text.slice(0, m.index).split('\n').length;
    const words = stepWords(plain(text.slice(m.index + m[0].length, m.index + m[0].length + 80)));
    if (!words) continue; // "More ›" on its own, the button itself
    const row = drawnPrefix(words, phoneText);
    out.push({ at, path: `More › ${row.name}`, bad: row.found ? null : `the phone draws no "${row.name}"` });
  }
  return out;
}

// ── The buttons H10-01 found, by name ────────────────────────────────────
// Not paths, so the walk cannot see them: each is named here with the word
// that would have to come back to the app for the guide to name it again.
const RETIRED = ['Macro toggle', 'Eye toggle', 'Settings gear', 'Heat Intensity', 'Design desk'];
/** Each retired button a text names as a thing to press: [name, line]. */
function namedRetired(t) {
  const out = [];
  // History is allowed only right before the name ("was the Design desk",
  // "the retired Eye toggle"), not anywhere in its sentence: "Once the lamp
  // is lit, press the Eye toggle" is an instruction. Matched on the plain
  // words, so "the **Macro** toggle" is the Macro toggle.
  const words = plain(t);
  for (const name of RETIRED) {
    for (const m of words.matchAll(new RegExp(name.replace(/ /g, '[\\s¦]+'), 'gi'))) {
      const before = words.slice(Math.max(0, m.index - 30), m.index);
      if (!/\b(was|were|used to be|retired|removed|renamed|replaced|no longer|formerly)\b(\s+the)?[\s¦]*$/i.test(before)) out.push(name);
    }
  }
  return out;
}

// ── The walk proves itself on a made-up guide ────────────────────────────
check('the map reads as the rail draws it: seven groups and every section in one of them',
  CATEGORIES.size === 7 && SECTIONS.length >= 25 && SECTIONS.every(s => [...CATEGORIES.values()].includes(s.category)),
  `${CATEGORIES.size} groups, ${SECTIONS.length} sections`);
{
  const fake = [
    'Open Settings → Look → Lamp & Light and ride it.',          // good
    'See Settings → Inputs → Camera for the room.',               // a group the rail lost
    'Tune Settings → Look → Simulation for speed.',               // a section in another group
    'Find Settings → Stage → Wall → Second Screen, then',         // good, to a control
    'Find Settings → Stage → Wall → Projector Gear, then',        // a control nobody draws
    'and on the phone More › Guide, or More › Eye toggle.',       // one real row, one gone
    'Settings → Stage → Simulation → Fluid Grid pins a size.',    // good, run into its sentence
    'Settings → Stage → Logo & Titles → Song banners go here.',   // gone, though "Song" is drawn
  ].join('\n');
  const walked = walkSettings(fake), more = walkMore(fake);
  const badAt = (w) => w.filter(x => x.bad).map(x => x.at).join(',');
  check('a made-up guide fails on its stale group, its moved section and its missing controls, and passes its good paths',
    walked.length === 7 && badAt(walked) === '2,3,5,8', walked.map(w => `${w.at}:${w.bad ? 'stale' : 'ok'}`).join(' '));
  const rFake = 'Once the lamp is lit, press the Eye toggle. Then the **Macro** toggle. The Settings gear was retired; it was the Design desk once. The retired Heat Intensity.';
  const r = namedRetired(rFake);
  check('a retired button is caught in an instruction and across markup, and passes only as history', r.join(',') === 'Macro toggle,Eye toggle,Settings gear', r.join(',') || 'none');
  const joined = walkSettings('Settings → Look → Show → Show the way.\nSettings → Stage → Wall → The Projector rig.');
  check('a last step cannot pass on two drawn literals that only sit side by side, or on little words', joined.every(w => w.bad), joined.map(w => `${w.path}: ${w.bad ? 'stale' : 'ok'}`).join('; '));
  check('and on the phone row it no longer has, not on the one it does', more.length === 2 && badAt(more) === '6', more.map(w => `${w.path}:${w.bad ? 'stale' : 'ok'}`).join(' '));
}

// ── The two guides ───────────────────────────────────────────────────────
for (const [file, floor] of [['docs/guide.md', 60], ['src/components/GuidePanel.tsx', 15]]) {
  const text = read(file);
  const walked = [...walkSettings(text), ...walkMore(text)];
  const stale = walked.filter(w => w.bad);
  check(`${file} gives Settings paths enough to judge (${floor} or more)`, walked.length >= floor, `${walked.length} paths`);
  check(`${file}: every Settings path and phone row leads to something the app has`, stale.length === 0,
    stale.length ? stale.map(w => `line ${w.at} ${w.path}: ${w.bad}`).join('; ') : `${walked.length} walked`);
}

{
  const named = ['docs/guide.md', 'src/components/GuidePanel.tsx'].flatMap(f => namedRetired(read(f)).map(n => `${f}: ${n}`));
  check('neither guide names the retired Macro toggle, Eye toggle, Settings gear, Heat Intensity or Design desk as a thing to press', named.length === 0, named.join('; '));
}
// Paths into another program's settings are skipped, and a skip is a hole:
// held to the two the guide gives today (macOS's Displays, Chrome's System),
// so a path of ours caught by the rule is seen rather than lost.
check('only the guide\'s two paths into other programs\' settings are skipped', skipped.length <= 2, skipped.join(' ') || 'none');

console.log(`\n${fails ? `${fails} failed` : 'all passed'}`);
process.exit(fails ? 1 : 0);
