#!/usr/bin/env node
/**
 * What the clear-controls work left on the remote, Settings and the phone,
 * written as lines before anything is built (PLAN 35a-2, 35d-2, 35f-2, 35g-2).
 *
 *   npm run clearleft                       # a second, no browser
 *   npm run clearleft -- --owed=pace,spin   # as CI runs it while they are owed
 *
 * PLAN 35 was the owner's "I really can't tell what buttons are turned
 * on/off" (2026-10-24). Its phases shipped one look for on, seven groups,
 * one home per setting, the snail and the hare, the slide tray. Each left a
 * list of places it did not reach, because each moved a check's input or a
 * layout. Four of those are a build with an answer that can be read, and are
 * asked here, so that the build (Antigravity's, by the split of 2026-11-01)
 * has a line to turn green and cannot pass by reading its own work:
 *
 *   pace    35d-2: the remote's Speed and Evolve Speed have no snail and hare.
 *           The desk's and the phone's sliders draw `PaceTrack` keyed by the
 *           setting (`ui/Pace.tsx`), which draws the two animals for every
 *           setting `paceOf` names; the remote's own `Slider`
 *           (`RemoteSlider.tsx`) draws none. Asked: it draws `PaceTrack`
 *           keyed by its field, and `paceOf` names both settings, so the
 *           animals are drawn there and not merely imported.
 *   spin    35a-2 and 35f-2: Auto Spin (Off, Steady, To the beat) and Spin
 *           Direction (anticlockwise, opposed, clockwise) are three named
 *           answers drawn as stepped sliders in Settings, and Auto Spin is one
 *           on the remote, so a thumb's position stands for a word. Asked: the
 *           element that carries each one's `settingKey` (which is what keeps
 *           MIDI learn and the pins) is not a `Slider`, and the remote draws no
 *           `Slider` for Auto Spin. Which pick-one control replaces them is the
 *           build's (`Segmented` takes a string value and a title per option
 *           would need adding; PLAN 35a-2's last bullet), and `npm run states`
 *           already holds any button it draws to saying its state.
 *   tray    35g-2: the slide tray put a look's slide mount on the desk's cue
 *           bar and the preset menu; the remote's look grid, its cue strip and
 *           the Sequencer's stage rows name a look in text only. Asked: each of
 *           the three buttons (by its test id) draws a `SlideMount`.
 *   dimmed  35a-2: the phone's Show, Evolve and Spin groups go to 50% opacity
 *           while their parent is off, a third way of saying off beside lit and
 *           `disabled`. Asked: no group in `PhoneStage.tsx` is dimmed by a
 *           ternary on its parent's state, and each of the three parents'
 *           states reaches a `disabled=`, so the rows say off the way every
 *           other control does (with the reason drawn beside them: the build's
 *           words, read by the reviewer).
 *
 * Not asked here: 35a-2's touch targets under 44 px, which only a page can
 * measure (`npm run phone` lays the phone out in a browser; a line there is
 * the follow-up, PLAN 35a-2), and the items that are a named shortcut or a
 * judgement, not a build.
 *
 * This reads the source, as `npm run states` does, because none of the four
 * changes a number a browser could measure better than the source says it:
 * each is which component draws what. The way it can be fooled is a
 * component drawn and then hidden, which the reviewer's look at the page
 * (and the phone harness) is for.
 *
 * Owed lines (as rungs-owed.mjs and soapbreak.mjs hold them): an id in
 * `--owed=` (scripts/checks.json) prints owed while its line fails in main's
 * state; it is red once it passes while still listed (take the id out), and
 * red if what it is owed for has been built and misses. The build's PR takes
 * its id out of `--owed` and never edits the line.
 */
import { readFileSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const OWED_IDS = ['pace', 'spin', 'tray', 'dimmed'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
for (const id of owed) if (!OWED_IDS.includes(id)) check('every id in --owed is a line of clearleft.mjs', false, `unknown "${id}" (known: ${OWED_IDS.join(', ')})`);
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
};

const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
/*
  `paceOf`'s table, read from lib/settingsMap.ts rather than imported: that
  module imports extensionless paths node cannot resolve without a bundle,
  and this check is meant to run in a second with no build.
*/
const PACE = /export const PACE_KEYS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src('lib/settingsMap.ts'))?.[1] ?? '';
const paceOf = (k) => new RegExp(`(^|[\\s,{])${k}\\s*:`).test(PACE);
if (!PACE) check('PACE_KEYS is read from lib/settingsMap.ts', false, 'not found: the pace line would read every setting as not a pace control');
// Comments out, so a sentence about `<Slider` or `opacity-50` is not read as code.
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

/*
  The JSX element whose props hold `needle`: from the last `<Tag` before it to
  the first `/>` or `>` that closes the tag after it (a `>` inside `=>` or a
  `{…}` is skipped by counting braces). Returns its tag name and text, or null.
*/
function elementWith(text, needle) {
  const at = text.indexOf(needle);
  if (at < 0) return null;
  // The last `<Tag` before it, a letter straight after the `<`: a prop may
  // hold a comparison (`spinDirection ?? 0) < -0.5`), which is not a tag.
  let open = -1, tag = '';
  for (const m of text.slice(0, at).matchAll(/<([A-Za-z][\w.]*)(?=[\s/>])/g)) { open = m.index; tag = m[1]; }
  if (open < 0) return null;
  let depth = 0, i = open + 1;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) break;
  }
  return { tag, text: text.slice(open, i + 1), start: open, end: i + 1 };
}
// From an element's opening tag to its closing `</Tag>`, for what it draws inside.
function bodyOf(text, el) {
  if (!el || el.text.endsWith('/>')) return '';
  const close = text.indexOf(`</${el.tag}>`, el.end);
  return close < 0 ? '' : text.slice(el.end, close);
}

// ── pace (35d-2) ─────────────────────────────────────────────────────────
{
  const remote = code('components/RemoteSlider.tsx');
  const draws = /<PaceTrack\b[^>]*settingKey=\{\s*(String\(\s*field\s*\)|field)\s*\}/.test(remote);
  const named = ['globalSpeed', 'automateRate'].map((k) => [k, !!paceOf(k)]);
  const bothNamed = named.every(([, v]) => v);
  line('pace', "the remote's sliders draw the snail and hare for Speed and Evolve Speed, as the desk's do (35d-2)",
    draws && bothNamed,
    `RemoteSlider.tsx ${draws ? 'draws' : 'draws no'} PaceTrack keyed by its field; paceOf names ${named.map(([k, v]) => `${k} ${v ? 'yes' : 'NO'}`).join(', ')}`,
    !draws && bothNamed);
}

// ── spin (35a-2, 35f-2) ──────────────────────────────────────────────────
{
  const settings = code('components/settings/MotionSections.tsx');
  const remote = code('components/RemoteControl.tsx');
  const found = ['spinAuto', 'spinDirection'].map((k) => [k, elementWith(settings, `settingKey="${k}"`)]);
  const missing = found.filter(([, el]) => !el).map(([k]) => k);
  const sliders = found.filter(([, el]) => el && el.tag === 'Slider').map(([k]) => k);
  const remoteSlider = /<Slider\b[^>]*field="spinAuto"/.test(remote);
  line('spin', 'Auto Spin and Spin Direction are picked from their named answers, not a stepped slider, in Settings and on the remote (35a-2)',
    !missing.length && !sliders.length && !remoteSlider,
    `Settings: ${found.map(([k, el]) => `${k} on ${el ? `<${el.tag}>` : 'nothing (its settingKey is gone, so MIDI learn and the pins lose it)'}`).join(', ')}; the remote's Auto Spin ${remoteSlider ? 'is a <Slider>' : 'is not a slider'}`,
    !missing.length && sliders.length === 2 && remoteSlider);
}

// ── tray (35g-2) ─────────────────────────────────────────────────────────
{
  const remote = code('components/RemoteControl.tsx');
  const seq = code('components/SequencerPanel.tsx');
  const sites = [
    ['the remote\'s look grid', remote, 'data-testid={`remote-preset-'],
    ['the remote\'s cue strip', remote, 'data-testid={`remote-cue-'],
    ['the Sequencer\'s stage rows', seq, 'data-testid={`seq-stage-'],
  ].map(([name, text, needle]) => {
    const el = elementWith(text, needle);
    return { name, found: !!el, mount: !!el && /<SlideMount\b/.test(bodyOf(text, el)) };
  });
  const lost = sites.filter((s) => !s.found);
  line('tray', "a look's slide mount is drawn on the remote's looks and cue strip and on the Sequencer's stages (35g-2)",
    !lost.length && sites.every((s) => s.mount),
    sites.map((s) => `${s.name}: ${!s.found ? 'its button (test id) is gone' : s.mount ? 'a SlideMount' : 'text only'}`).join('; '),
    !lost.length && sites.every((s) => !s.mount));
}

// ── dimmed (35a-2) ───────────────────────────────────────────────────────
{
  const phone = code('components/phone/PhoneStage.tsx');
  const parents = [['Show', 'p.show.running'], ['Evolve', 'p.evolving'], ['Spin', 'p.spin.auto']];
  const dims = [...phone.matchAll(/\$\{([^{}]*?)\?\s*(?:''|"")\s*:\s*'opacity-50'\s*\}|\$\{([^{}]*?)\?\s*'opacity-50'\s*:\s*(?:''|"")\s*\}/g)]
    .map((m) => (m[1] ?? m[2]).trim());
  const disables = parents.map(([name, state]) => [name, new RegExp(`disabled=\\{[^}]*${state.replace(/\./g, '\\.')}`).test(phone)]);
  line('dimmed', "the phone's Show, Evolve and Spin rows say off by disabled, not by a group at half opacity (35a-2)",
    dims.length === 0 && disables.every(([, v]) => v),
    `${dims.length} group${dims.length === 1 ? '' : 's'} dimmed by a ternary${dims.length ? ` (on ${dims.map((d) => d.replace(/\s+/g, ' ')).join('; ')})` : ''}; disabled= reads ${disables.map(([n, v]) => `${n} ${v ? 'yes' : 'no'}`).join(', ')}`,
    dims.length >= 3);
}

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} of ${checks.length} failed` : `\nall ${checks.length} ok${owed.size ? ` (${owed.size} owed)` : ''}`);
process.exit(failed ? 1 : 0);
