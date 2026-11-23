#!/usr/bin/env node
/**
 * One panel, one kind of control.
 *
 *   npm run panelkinds
 *
 * What was reported. The owner, 2026-11-22, with a screenshot of the Build
 * deck: the Recipe drew Bubbles and Saturation as two full-width sliders while
 * Fluid Physics and Squish Plate beside it, and the rest of the Recipe, were
 * knobs. "Once again": on 2026-11-14 it was Iridescence, a slider above the
 * Recipe's knob row (PLAN 8d-1). Both had one cause. The Recipe's grid asked,
 * control by control, what each setting was learned to on the MIDI controller
 * and drew a fader's as a slider, so the shape of a panel changed with a
 * binding. The APC mini mk2's factory map rides Bubbles and Saturation on its
 * faders, which is exactly the pair in the screenshot. 8d-1 fixed the case in
 * front of it (an unprofiled board) and left the rule that made it.
 *
 * The rule now (PLAN 8d-3): the kind of control is the panel's. The Rides
 * strip, the Mixer and the Wall panel are sliders; the Recipe and every
 * section's knobs panel are knobs. Nothing a controller is learned to changes
 * that.
 *
 * What this measures. It renders every desk panel with React's server
 * renderer (no browser, so it runs on every pull request in Measure's `logic`
 * part) and counts the controls each draws: knobs by the mark on `Knob`'s
 * root (`data-knob`), sliders as every range input that is not a knob's own
 * (each `Knob` holds exactly one, which the first line here holds), so a bare
 * `<input type="range">` counts as the slider it looks like, mark or no mark.
 * It fails a panel that draws both, or the other panel kind's control. What
 * keeps it from passing on nothing:
 *
 * - The counter is shown a knob beside a `Slider`, and beside a bare range
 *   input, and must call both mixed.
 * - Every pinnable setting is on the Recipe, and in a layout that leaves
 *   nothing drawn elsewhere each panel must draw all of its controls, by
 *   number: the Recipe one per setting, each section's knobs panel one per
 *   pinnable setting in that section, the Rides one per ride. A grid that
 *   split its keys again (the old fault was a split by key) and drew some
 *   elsewhere or not at all is short.
 * - The question that made the mix cannot come back quietly: no desk or app
 *   file may name `controlKindOf` or `kindFor` (the render here has no MIDI
 *   map, so a lookup wired back in would answer "knob" and pass).
 *
 * And the panels this does not render: a file that imports or draws a `Knob`
 * is either rendered here or fails the source lines at the end, so a knob
 * added to a settings section, the phone or a new panel comes here to be
 * counted before it can sit among sliders. The phone draws sliders only.
 */

import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PortalBody } from '../src/components/portalBody.ts';
import { PanelBody } from '../src/components/desk/DeskPanels.tsx';
import { OutputPanel, DEFAULT_OUTPUT } from '../src/components/OutputPanel.tsx';
import { Knob, Slider } from '../src/components/ui/index.tsx';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { PANELS, emptyLayout, shippedLayout, LAYOUT_NAMES } from '../src/lib/deskLayout.ts';
import { PINNABLE, DEFAULT_RIDES } from '../src/lib/deskPins.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/*
  The DOM bits a panel touches while rendering, and nothing else: the server
  renderer has no document, and a panel's own menus portal into the body it is
  given (`portalBody.ts`), which is only reached once a menu is open.
*/
globalThis.window ??= { location: { protocol: 'http:', host: 'localhost', hostname: 'localhost', origin: 'http://localhost', href: 'http://localhost/' } };

const render = (el) => renderToStaticMarkup(createElement(PortalBody.Provider, { value: {} }, el));
const count = (html) => {
  const knob = (html.match(/\sdata-knob(?=[\s=>])/g) ?? []).length;
  const ranges = (html.match(/<input[^>]*\stype="range"/g) ?? []).length;
  return { knob, slider: ranges - knob, ranges };
};

// ── The counter sees a mix ───────────────────────────────────────────
{
  const knob = () => createElement(Knob, { label: 'a', value: 0, min: 0, max: 1, step: 0.01, onChange: () => {}, display: '0' });
  const one = count(render(knob()));
  check('a Knob holds exactly one range input', one.ranges === 1 && one.knob === 1, `ranges ${one.ranges}, knobs ${one.knob}`);
  const withSlider = count(render(createElement(Fragment, null, knob(),
    createElement(Slider, { label: 'b', value: 0, min: 0, max: 1, step: 0.01, onChange: () => {}, display: '0' }))));
  check('the counter calls a Knob and a Slider mixed', withSlider.knob === 1 && withSlider.slider === 1, `knobs ${withSlider.knob}, sliders ${withSlider.slider}`);
  const withBare = count(render(createElement(Fragment, null, knob(),
    createElement('input', { type: 'range', min: 0, max: 1, readOnly: true, value: 0 }))));
  check('the counter calls a Knob and a bare range input mixed', withBare.knob === 1 && withBare.slider === 1, `knobs ${withBare.knob}, sliders ${withBare.slider}`);
}

// ── Every desk panel ─────────────────────────────────────────────────

const ALL = PINNABLE.map(s => s.key);
let cc = 0;
const ccOf = new Map(ALL.map(k => [k, cc++ % 128]));
const props = (layout) => {
  const base = {
    settings: { ...DEFAULT_SETTINGS },
    layout,
    rideKeys: [...DEFAULT_RIDES],
    recipeKeys: [...ALL],
    // Every control has a CC, so each draws as it would learned to a controller.
    ccFor: (k) => ccOf.get(k) ?? null,
    cues: [], savedSets: [], savedLooks: [], screens: {}, dyeBottles: [], behaviourBottles: [], palettes: [], paletteLock: null, swatches: [], toolAmount: 1,
    /*
      A whole section's panel is the settings sheet's section, which App
      draws (`settingsPanel({ embed })`); none of those draws a Knob, and the
      source line at the end holds that, so here it draws nothing.
    */
    renderSection: () => null,
    status: { phone: 0, audio: null },
    automated: false,
  };
  // Every callback a panel is handed is a no-op; a value it reads and is not given is undefined.
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^on[A-Z]/.test(k) ? () => {} : undefined)) });
};

/** Which kind each panel draws. A panel not named may draw either, but never both. */
const KIND = { rides: 'slider', mixer: 'slider', recipe: 'knob' };
for (const p of PANELS) if (p.kind === 'knobs') KIND[p.id] = 'knob';
/** How many each draws when nothing is drawn elsewhere; null: some, not a number this knows. */
const WANT = { rides: DEFAULT_RIDES.length, mixer: null, recipe: ALL.length };
for (const p of PANELS) if (p.kind === 'knobs') WANT[p.id] = PINNABLE.filter(s => s.section === p.id).length;

const layouts = [['none drawn elsewhere', emptyLayout()], ...LAYOUT_NAMES.map(n => [`shipped ${n}`, shippedLayout(n)])];
for (const [where, layout] of layouts) {
  const p = props(layout);
  const mixed = [], wrong = [], empty = [], threw = [];
  let drawn = 0;
  for (const panel of PANELS) {
    let html;
    try { html = render(createElement(PanelBody, { id: panel.id, p })); }
    catch (e) { threw.push(`${panel.id} (${String(e?.message ?? e).slice(0, 80)})`); continue; }
    const n = count(html);
    const want = KIND[panel.id];
    if (n.knob && n.slider) mixed.push(`${panel.id} ${n.knob} knobs + ${n.slider} sliders`);
    else if (want && (n.knob || n.slider) && !n[want]) wrong.push(`${panel.id} draws ${n.knob ? 'knobs' : 'sliders'}, its kind is ${want}s`);
    // In the shipped layouts a panel's controls may be out on the Rides; with none drawn elsewhere, each must show, all of them.
    if (want && where === 'none drawn elsewhere') {
      const target = WANT[panel.id];
      const got = n.knob + n.slider;
      if (target == null ? got === 0 : got !== target) empty.push(`${panel.id} ${got}${target == null ? '' : ` of ${target}`}`);
    }
    drawn += n.knob + n.slider;
  }
  check(`${where}: every desk panel renders`, threw.length === 0, threw.join('; '));
  check(`${where}: no panel draws both knobs and sliders`, mixed.length === 0, mixed.join('; ') || `${drawn} controls over ${PANELS.length} panels`);
  check(`${where}: each draws its panel's kind (Rides and Mixer sliders, Recipe and section knobs)`, wrong.length === 0, wrong.join('; '));
  if (where === 'none drawn elsewhere') {
    check(`${where}: every panel draws all its controls (Recipe ${ALL.length}, Rides ${DEFAULT_RIDES.length}, each section's knobs)`, empty.length === 0, empty.length ? `short: ${empty.join(', ')}` : `${Object.keys(KIND).length} panels`);
  }
}

// ── The Wall panel (Load-in) ─────────────────────────────────────────
{
  // The Wall panel reads the plate canvas's shape on mount; there is none here.
  globalThis.document ??= { getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  const html = render(createElement(OutputPanel, { output: { ...DEFAULT_OUTPUT }, onChange: () => {}, onReset: () => {} }));
  const n = count(html);
  check('the Wall panel draws sliders only', n.slider > 0 && n.knob === 0, `knobs ${n.knob}, sliders ${n.slider}`);
  const onSlider = (id) => new RegExp(`<div[^>]*data-slider[^>]*data-testid="${id}"|<div[^>]*data-testid="${id}"[^>]*data-slider`).test(html);
  check('its Gain and Gamma are slider rows (8e\'s two knobs)', onSlider('output-gain') && onSlider('output-gamma'));
}

// ── Every file that draws a Knob is counted here ─────────────────────
/*
  The renders above are the desk's panels and the Wall's. A `Knob` drawn from
  anywhere else (a settings section, the phone, a sheet) is a place this check
  cannot see, so it fails until that place is rendered above too.
*/
{
  const COUNTED = new Set(['src/components/desk/DeskPanels.tsx']);
  // Bundled into node_modules/.cache, so not relative to this file: npm runs a script from the root.
  const root = process.cwd();
  const walk = (dir) => readdirSync(dir).flatMap(f => {
    const full = join(dir, f);
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(f) ? [full] : [];
  });
  const files = walk(join(root, 'src')).map(f => [relative(root, f), readFileSync(f, 'utf8')]);
  // Imported under any name, drawn as JSX, or made with createElement: `Knob` itself, not the word in a comment.
  const drawsKnob = (src) => /import\s*(type\s*)?\{[^}]*\bKnob\b[^}]*\}\s*from/.test(src) || /<(\w+\.)?Knob[\s/>]/.test(src) || /createElement\(\s*(\w+\.)?Knob\b/.test(src);
  const drawers = files.filter(([f, src]) => f !== 'src/components/ui/index.tsx' && drawsKnob(src)).map(([f]) => f);
  const unseen = drawers.filter(f => !COUNTED.has(f));
  check('every file that imports or draws a Knob is rendered by this check', unseen.length === 0,
    unseen.length ? `not counted: ${unseen.join(', ')}` : drawers.join(', '));
  const phoneKnob = files.filter(([f, src]) => f.startsWith('src/components/phone/') && /\bKnob\b/.test(src)).map(([f]) => f);
  check('the phone names no Knob', phoneKnob.length === 0, phoneKnob.join(', '));
  const asks = files.filter(([f, src]) => (f.startsWith('src/components/') || f.startsWith('src/app/') || f === 'src/App.tsx')
    && /\b(controlKindOf|kindFor)\b/.test(src)).map(([f]) => f);
  check('no desk or app file asks what a control is learned to (controlKindOf, kindFor)', asks.length === 0, asks.join(', '));
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} panel-kind checks passed`);
process.exit(failed.length ? 1 : 0);
