/**
 * `npm run desklayout`: the desk's layouts (src/lib/deskLayout.ts), in node.
 *
 * Desk v2 made the two desks one, filled from a layout: which panels are out,
 * in which column or the deck, floating, folded. That model is what every
 * layout on screen is drawn from, so it is checked here, without a browser,
 * on the things that would quietly break a desk:
 *
 *  - The shipped layouts name panels that exist, each once, and keep the
 *    Stage panels (the room and the machine) to Load-in, as the design does.
 *  - Every settings section is a panel, so the panel browser reaches all of
 *    what the Settings sheet did. A section left out of `PANELS` would be a
 *    control that is only in the sheet again.
 *  - A layout nobody has touched is not stored. This is the rides' lesson
 *    (deskPins.ts): stored on first sight, a layout would pin everyone to
 *    the day they first opened the desk, and a better shipped one would
 *    never reach them.
 *  - A stored layout from an older build, or a hand edit, cannot break the
 *    desk: unknown and doubled panels go, a Stage panel outside Load-in goes,
 *    a floating rectangle is clamped to one that can be grabbed.
 *  - Every operation keeps a panel in exactly one place.
 *
 * What it cannot see: the desk drawn. That is `npm run layout` (the panels in
 * their cells at five widths, the browser, floating and folding).
 */
import {
  LAYOUT_NAMES, PANELS, PANEL_BY_ID, SHIPPED, FLOAT_SIZE,
  closePanel, collapseAll, dockPanel, floatPanel, isStagePanel, loadLayout, openPanel, openPanels,
  panelAllowed, placeFloating, raiseFloating, sameLayout, sanitizeLayout, saveLayout, shippedLayout,
  toggleCollapsed, whereIs, DESK_MODE_OF, LAYOUT_OF_MODE,
} from '../src/lib/deskLayout.ts';
import { SETTINGS_SECTIONS } from '../src/lib/settingsMap.ts';
import { PINNABLE } from '../src/lib/deskPins.ts';
import { readFileSync } from 'node:fs';

let total = 0, failed = 0;
function check(name, ok, detail = '') {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// A storage the size of the one the browser gives, so load and save run as they do there.
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
  clear: () => store.clear(),
};

/** Each panel is in exactly one place: the invariant every operation must keep. */
const placesOf = (l) => {
  const all = openPanels(l);
  const doubled = all.filter((id, i) => all.indexOf(id) !== i);
  return { all, doubled };
};

// ── What ships ──────────────────────────────────────────────────────
console.log('\n What ships');
for (const name of LAYOUT_NAMES) {
  const l = SHIPPED[name];
  const { all, doubled } = placesOf(l);
  const unknown = all.filter(id => !PANEL_BY_ID.has(id));
  const notAllowed = all.filter(id => !panelAllowed(name, id));
  check(`${name} names panels that exist, each once, all allowed in it`,
    all.length > 0 && unknown.length === 0 && doubled.length === 0 && notAllowed.length === 0,
    `${all.length} panels${unknown.length ? `; unknown ${unknown}` : ''}${doubled.length ? `; doubled ${doubled}` : ''}${notAllowed.length ? `; not allowed ${notAllowed}` : ''}`);
  check(`and sanitising ${name} changes nothing`, sameLayout(sanitizeLayout(name, structuredClone(l)), l));
}
check('Build and Gig keep the Stage panels off; Load-in has them',
  ['build', 'gig'].every(n => openPanels(SHIPPED[n]).every(id => !isStagePanel(id)))
  && openPanels(SHIPPED.loadin).some(isStagePanel),
  `Load-in: ${openPanels(SHIPPED.loadin).filter(isStagePanel).join(', ')}`);
// Build is the old Design desk and holds the show off while a look is built
// (`designing` in App is the plate in Preview); Gig and Load-in are the show.
check('Build ships in Preview, Gig and Load-in Live',
  SHIPPED.build.plateMode === 'preview' && SHIPPED.gig.plateMode === 'live' && SHIPPED.loadin.plateMode === 'live');
// The old desks' halves, where the checks and the owner's hands expect them.
check('Gig is the Perform desk (cues left, rides right); Build has the bench and the recipe',
  SHIPPED.gig.left[0] === 'cues' && SHIPPED.gig.right[0] === 'rides'
  && ['bottles', 'dyes', 'tools'].every(id => whereIs(SHIPPED.build, id) === 'right') && whereIs(SHIPPED.build, 'recipe') === 'deck');
check('the old desk modes and the layouts map both ways',
  LAYOUT_NAMES.every(n => LAYOUT_OF_MODE(DESK_MODE_OF[n]) === n) && LAYOUT_OF_MODE(null) === 'build' && LAYOUT_OF_MODE('garbage') === 'build');
check('a shipped layout handed out is a copy, not the one that ships',
  (() => { const c = shippedLayout('gig'); c.left.push('rides'); return SHIPPED.gig.left.length === 1; })());

// ── The panels ──────────────────────────────────────────────────────
console.log('\n The panels');
/*
  A section panel is the sheet's own section drawn alone (`SettingsPanel embed`),
  which draws only what is wrapped in `keep(id)`. So the thing that can drift is
  the markup: a section added to the map without a `keep` around it would be a
  panel with nothing in it. Read from the source, as `npm run panel` reads the map.
*/
const panelSrc = readFileSync('src/components/SettingsPanel.tsx', 'utf8');
const unkept = SETTINGS_SECTIONS.filter(s => !new RegExp(`\\{keep\\('${s.id}'\\) && \\(\\s*<section[^>]*data-section="${s.id}"`).test(panelSrc));
check('every settings section is a panel the browser can open, with its markup kept for it', unkept.length === 0 && SETTINGS_SECTIONS.every(s => PANEL_BY_ID.has(s.id)),
  unkept.length ? `not kept: ${unkept.map(s => s.id).join(', ')}` : `${SETTINGS_SECTIONS.length} sections`);
const idsOnce = new Set(PANELS.map(p => p.id)).size === PANELS.length;
check('and no panel id is used twice (a desk panel cannot shadow a section)', idsOnce, `${PANELS.length} panels`);
// A knob panel draws the section's pinnable controls; a section whose point is
// not a number is drawn whole. Asked of the kinds, so a WHOLE section listed
// as knobs (a corner pin drawn as four knobs) is red.
const WHOLE = ['audio-input', 'room', 'film', 'patches', 'midi', 'liquids', 'projectors', 'mapping', 'mark', 'simulation'];
const wrongKind = WHOLE.filter(id => PANEL_BY_ID.get(id)?.kind !== 'section');
const knobs = PANELS.filter(p => p.kind === 'knobs');
check('the sections that are not numbers are drawn whole, the rest as knobs',
  wrongKind.length === 0 && PANEL_BY_ID.get('mixer')?.kind === 'mixer' && knobs.length >= 10
  && knobs.every(p => PINNABLE.filter(c => c.section === p.id).length > 0),
  wrongKind.length ? `as knobs: ${wrongKind}` : `${knobs.length} knob panels`);
check('every panel has a width in the deck it can be drawn at',
  PANELS.every(p => p.deckWidth >= 240 && p.deckWidth <= 400));

// ── Storage ─────────────────────────────────────────────────────────
console.log('\n Storage');
store.clear();
for (const name of LAYOUT_NAMES) saveLayout(name, shippedLayout(name));
check('a layout nobody has touched is not stored', store.size === 0, `${store.size} stored`);
{
  const moved = dockPanel(shippedLayout('gig'), 'rides', 'left');
  saveLayout('gig', moved);
  check('a changed one is', store.size === 1 && sameLayout(loadLayout('gig'), moved), [...store.keys()].join(', '));
  saveLayout('gig', shippedLayout('gig'));
  check('and put back as it shipped, it is not stored any more (Reset layout)', store.size === 0);
  check('nothing stored loads as shipped', LAYOUT_NAMES.every(n => sameLayout(loadLayout(n), SHIPPED[n])));
  store.set('chromaglass-desk-layout:build', '{not json');
  check('a stored layout that is not JSON loads as shipped', sameLayout(loadLayout('build'), SHIPPED.build));
  store.clear();
}
{
  const raw = {
    left: ['cues', 'cues', 'no-such-panel', 7, 'projectors'],
    right: ['rides', 'cues'],
    deck: ['dyes'],
    floating: [{ id: 'tools', x: -500, y: 1e9, w: 3, h: Infinity }, { id: 'dyes', x: 0, y: 0, w: 300, h: 300 }, { id: 'nope' }, null],
    collapsed: ['rides', 'not-out'],
    deckCollapsed: 'yes',
    plateMode: 'sideways',
  };
  const s = sanitizeLayout('gig', raw);
  const { doubled } = placesOf(s);
  check('a stored layout loses unknown and doubled panels and the Stage ones outside Load-in',
    s.left.join() === 'cues' && s.right.join() === 'rides' && s.deck.join() === 'dyes' && doubled.length === 0,
    `left ${s.left} · right ${s.right} · deck ${s.deck}`);
  const t = s.floating.find(f => f.id === 'tools');
  check('and a floating panel is clamped to one that can be grabbed',
    s.floating.length === 1 && !!t && t.x === 0 && t.y === 3000 && t.w === 220 && t.h === FLOAT_SIZE.h,
    JSON.stringify(s.floating));
  check('and folds only what is out, a deck flag only when true, a plate mode only when real',
    s.collapsed.join() === 'rides' && s.deckCollapsed === false && s.plateMode === 'live');
  check('and anything that is not a layout is the shipped one',
    [null, 3, 'x', []].every(v => sameLayout(sanitizeLayout('build', v), SHIPPED.build)));
  check('but Load-in keeps its Stage panels', sanitizeLayout('loadin', structuredClone(SHIPPED.loadin)).right.join() === SHIPPED.loadin.right.join());
}

// ── The operations ──────────────────────────────────────────────────
console.log('\n The operations');
{
  let l = shippedLayout('build');
  l = dockPanel(l, 'tools', 'deck', 0);
  check('docking moves a panel, never copies it', whereIs(l, 'tools') === 'deck' && l.deck[0] === 'tools' && placesOf(l).doubled.length === 0 && !l.right.includes('tools'));
  l = floatPanel(l, 'tools', { x: 400, y: 200 });
  check('floating takes it out of its slot', whereIs(l, 'tools') === 'float' && !l.deck.includes('tools') && placesOf(l).doubled.length === 0);
  const f0 = l.floating.find(f => f.id === 'tools');
  check('at the rectangle it was given', f0.x === 400 && f0.y === 200 && f0.w === FLOAT_SIZE.w && f0.h === FLOAT_SIZE.h);
  l = floatPanel(l, 'dyes', { x: 700, y: 300 });
  l = placeFloating(l, 'tools', { x: 420 });
  const moved = l.floating.find(f => f.id === 'tools'), still = l.floating.find(f => f.id === 'dyes');
  check('placing moves only the one, and only what it was given',
    moved.x === 420 && moved.y === 200 && still.x === 700 && still.y === 300 && l.floating.map(f => f.id).join() === 'tools,dyes',
    `tools ${moved.x},${moved.y} · dyes ${still.x},${still.y}`);
  l = dockPanel(l, 'tools', 'right');
  l = floatPanel(l, 'tools');
  const f1 = l.floating.find(f => f.id === 'tools');
  check('a panel floated again after docking comes back at the default', !!f1 && f1.x === 120 && f1.y === 120);
  l = raiseFloating(l, 'tools');
  check('raising draws a floating panel on top (last)', l.floating[l.floating.length - 1].id === 'tools' && l.floating.length === 2);
  check('and raising the top one is no change at all', raiseFloating(l, 'tools') === l);
  l = toggleCollapsed(l, 'dyes');
  check('folding marks it folded, and folding again opens it',
    l.collapsed.includes('dyes') && !toggleCollapsed(l, 'dyes').collapsed.includes('dyes'));
  l = closePanel(l, 'dyes');
  check('closing takes it away and forgets it was folded', whereIs(l, 'dyes') === null && !l.collapsed.includes('dyes'));
  const before = whereIs(l, 'tools');
  l = openPanel(l, 'tools', 'deck');
  check('opening a panel already out leaves it where it is', whereIs(l, 'tools') === before);
  l = openPanel(l, 'dyes', 'float');
  check('and opening one that is not out puts it where it was asked', whereIs(l, 'dyes') === 'float');
  l = collapseAll(l, true);
  check('Fold all folds every panel out, and only those', [...l.collapsed].sort().join() === [...openPanels(l)].sort().join());
  l = collapseAll(l, false);
  check('and Open all unfolds them', l.collapsed.length === 0);
  check('a panel that does not exist is never added', dockPanel(l, 'no-such', 'left') === l && floatPanel(l, 'no-such') === l);
  check('and every step kept each panel in one place', placesOf(l).doubled.length === 0);
}

console.log(`\n${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
