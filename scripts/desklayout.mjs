/**
 * `npm run desklayout`: the desk's layouts and tabs (src/lib/deskLayout.ts,
 * src/lib/deskTabs.ts), in node.
 *
 * Desk v2 made the two desks one, filled from a layout: which panels are out,
 * in which column or the deck, floating, folded. That model is what every
 * layout on screen is drawn from, so it is checked here, without a browser,
 * on the things that would quietly break a desk:
 *
 *  - The shipped tabs (Perform, Sequence, Setup) name panels that exist,
 *    each once, and between them hold every panel that was behind a chip
 *    before the tabs were the owner's: Build's, Gig's and Load-in's panels,
 *    and the Sequence and Sound screens. A chip taken away with nothing in
 *    its place would have been controls nobody could reach.
 *  - The tab editor's operations (rename, move, delete, add, copy) keep
 *    the list sound: ids once, a name always, never no tab at all.
 *  - Every settings section is a panel, so the panel browser reaches all of
 *    what the Settings sheet did. A section left out of `PANELS` would be a
 *    control that is only in the sheet again.
 *  - Tabs nobody has touched are not stored. This is the rides' lesson
 *    (deskPins.ts): stored on first sight, a layout would pin everyone to
 *    the day they first opened the desk, and a better shipped one would
 *    never reach them.
 *  - A stored layout from an older build, or a hand edit, cannot break the
 *    desk: unknown and doubled panels go, a floating rectangle is clamped to
 *    one that can be grabbed. An old layout somebody rearranged is kept as a
 *    tab of its own, once, and an old desk mode opens the tab it became.
 *  - Every operation keeps a panel in exactly one place.
 *
 * What it cannot see: the desk drawn. That is `npm run layout` (the panels in
 * their cells at five widths, the browser, floating and folding).
 */
import {
  LAYOUT_NAMES, PANELS, PANEL_BY_ID, SHIPPED, FLOAT_SIZE,
  closePanel, collapseAll, dockPanel, floatPanel, isStagePanel, openPanel, openPanels,
  placeFloating, raiseFloating, sameLayout, sanitizeLayout, shippedLayout,
  toggleCollapsed, whereIs, drawnElsewhere,
} from '../src/lib/deskLayout.ts';
import {
  DEFAULT_TABS, TABS_KEY, TAB_KEY, TABS_MAX, TAB_NAME_MAX, addTab, baseLayout, defaultTabs, deleteTab, loadTabId, loadTabs, moveTab,
  renameTab, sanitizeTabs, saveTabs, setTabLayout, storedForm, tabForStored,
} from '../src/lib/deskTabs.ts';
import { SETTINGS_SECTIONS, SETTINGS_CATEGORIES, groupOf } from '../src/lib/settingsMap.ts';
import { PINNABLE, DEFAULT_RIDES, DEFAULT_RECIPE } from '../src/lib/deskPins.ts';
const PIN_SECTION = (key) => PINNABLE.find(s => s.key === key)?.section;
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
for (const t of DEFAULT_TABS) {
  const l = t.layout;
  const { all, doubled } = placesOf(l);
  const unknown = all.filter(id => !PANEL_BY_ID.has(id));
  check(`${t.name} names panels that exist, each once`,
    all.length > 0 && unknown.length === 0 && doubled.length === 0,
    `${all.join(', ')}${unknown.length ? `; unknown ${unknown}` : ''}${doubled.length ? `; doubled ${doubled}` : ''}`);
  check(`and sanitising ${t.name} changes nothing`, sameLayout(sanitizeLayout(structuredClone(l), baseLayout(t.id)), l));
}
check('the three that ship are Perform, Sequence and Setup, in that order',
  DEFAULT_TABS.map(t => `${t.id}:${t.name}`).join() === 'perform:Perform,sequence:Sequence,setup:Setup');
/*
  The old chips folded into the three. Every panel that was out in Build, Gig
  or Load-in is on one of them, and so are the two screens (the Sequence
  chip's Songs and Sequences, the Sound chip's player and drone), now panels.
*/
const onDefaults = new Set(DEFAULT_TABS.flatMap(t => openPanels(t.layout)));
const wasBehindChips = [...new Set([...LAYOUT_NAMES.flatMap(n => openPanels(SHIPPED[n])), 'songs', 'sequences', 'player'])];
const lost = wasBehindChips.filter(id => !onDefaults.has(id));
check('every panel the old chips had out, and the Sequence and Sound screens, is on a shipped tab',
  lost.length === 0, lost.length ? `not on any: ${lost.join(', ')}` : `${wasBehindChips.length} panels`);
check('Perform is the show: the set list to go to the next look, the bottles, the rides and the tools, Live',
  whereIs(DEFAULT_TABS[0].layout, 'cues') === 'left' && ['bottles', 'rides', 'dyes', 'tools'].every(id => whereIs(DEFAULT_TABS[0].layout, id))
  && DEFAULT_TABS[0].layout.plateMode === 'live');
check('Sequence holds the set, the song shows, the sequences and the score, Live so a sequence reaches the plate',
  ['cues', 'songs', 'sequences', 'score'].every(id => whereIs(DEFAULT_TABS[1].layout, id)) && DEFAULT_TABS[1].layout.plateMode === 'live');
check('Setup holds the room: the controller, the sound in, the player, the wall and its mapping',
  ['midi', 'audio-input', 'player', 'projectors', 'mapping'].every(id => whereIs(DEFAULT_TABS[2].layout, id)) && openPanels(DEFAULT_TABS[2].layout).some(isStagePanel));
check('a shipped tab handed out is a copy, not the one that ships',
  (() => { const c = defaultTabs(); c[0].layout.left.push('rides'); c[0].name = 'x'; return DEFAULT_TABS[0].layout.left.length === 1 && DEFAULT_TABS[0].name === 'Perform'; })());

// ── Editing the tabs ────────────────────────────────────────────────
console.log('\n Editing the tabs');
{
  let t = defaultTabs();
  t = renameTab(t, 'perform', '  The   show  ');
  check('a rename keeps the id and cleans the name', t[0].id === 'perform' && t[0].name === 'The show', t[0].name);
  check('an empty name or one too long is not a name', renameTab(t, 'perform', '   ') === t
    && renameTab(t, 'perform', 'x'.repeat(60))[0].name.length === TAB_NAME_MAX);
  t = moveTab(t, 'setup', -2);
  check('a move puts it where it was asked, and past the end is the end', t.map(x => x.id).join() === 'setup,perform,sequence'
    && moveTab(t, 'setup', 5).map(x => x.id).join() === 'perform,sequence,setup' && moveTab(t, 'sequence', 5) === t, t.map(x => x.id).join());
  const added = addTab(t, { id: 'mine' });
  check('a new tab is empty, last, and named so it is not mistaken for another',
    added.id === 'mine' && added.tabs[3].name === 'New tab' && openPanels(added.tabs[3].layout).length === 0
    && addTab(added.tabs, { id: 'mine' }).tabs[4].name === 'New tab 2' && addTab(added.tabs, { id: 'mine' }).id !== 'mine');
  const copy = addTab(added.tabs, { id: 'cp', copyOf: 'perform', after: 'perform' });
  check('a copy has the panels of the tab it copies, beside it, and moving them does not move the original',
    copy.tabs[2].id === 'cp' && sameLayout(copy.tabs[2].layout, t[1].layout)
    && setTabLayout(copy.tabs, 'cp', l => closePanel(l, 'cues')).find(x => x.id === 'perform').layout.left.join() === 'cues');
  let full = defaultTabs();
  for (let i = 0; i < 20; i++) full = addTab(full, { id: `t${i}` }).tabs;
  check(`no more than ${TABS_MAX} tabs`, full.length === TABS_MAX && addTab(full).id === '');
  let one = defaultTabs();
  one = deleteTab(deleteTab(one, 'perform'), 'sequence');
  check('a tab can be deleted, but never the last one', one.length === 1 && deleteTab(one, 'setup') === one);
}

// ── Keeping the tabs ────────────────────────────────────────────────
console.log('\n Keeping the tabs');
store.clear();
saveTabs(defaultTabs());
check('tabs nobody has touched are not stored', store.size === 0 && storedForm(defaultTabs()) === null, `${store.size} stored`);
{
  const renamed = renameTab(defaultTabs(), 'setup', 'Load-in');
  saveTabs(renamed);
  const kept = JSON.parse(store.get(TABS_KEY) ?? '{}').tabs ?? [];
  check('a rename is stored, and a shipped tab not rearranged is stored by its name alone',
    kept.length === 3 && kept.every(x => !('layout' in x)) && loadTabs()[2].name === 'Load-in', JSON.stringify(kept));
  const moved = setTabLayout(renamed, 'perform', l => dockPanel(l, 'rides', 'left'));
  saveTabs(moved);
  check('a rearranged one is stored with its layout, and loads as it was left',
    sameLayout(loadTabs()[0].layout, moved[0].layout) && 'layout' in JSON.parse(store.get(TABS_KEY)).tabs[0]);
  saveTabs(defaultTabs());
  check('and put back as they shipped, nothing is stored any more', store.size === 0);
  store.set(TABS_KEY, '{not json');
  check('stored tabs that are not JSON load as shipped', loadTabs().map(x => x.id).join() === 'perform,sequence,setup');
  store.clear();
}
{
  const s = sanitizeTabs({ v: 1, tabs: [{ id: 'perform', name: '' }, { id: 'perform', name: 'Again' }, { name: 'no id' }, null,
    { id: 'mine', name: 'Mine', layout: { left: ['cues', 'no-such'], right: [], deck: [], floating: [], collapsed: [], deckCollapsed: false, plateMode: 'preview' } }] });
  check('a stored list loses doubled and id-less tabs, names an unnamed one, and sanitises a layout',
    s.map(x => `${x.id}:${x.name}`).join() === 'perform:Perform,mine:Mine' && s[1].layout.left.join() === 'cues' && s[1].layout.plateMode === 'preview'
    && sameLayout(s[0].layout, DEFAULT_TABS[0].layout), s.map(x => `${x.id}:${x.name}:${x.layout.left}`).join(' | '));
  check('and anything that is not a list of tabs is the shipped three',
    [null, 3, 'x', [], { tabs: [] }].every(v => sanitizeTabs(v).map(x => x.id).join() === 'perform,sequence,setup'));
}
{
  // An older build's rearranged Gig and the Load-in it left the desk on.
  store.clear();
  const gig = dockPanel(shippedLayout('gig'), 'rides', 'left');
  store.set('chromaglass-desk-layout:gig', JSON.stringify(gig));
  store.set(TAB_KEY, 'perform');
  const t = loadTabs();
  check('an old layout somebody rearranged is kept as a tab of its own, after the three, under its old name',
    t.map(x => `${x.id}:${x.name}`).join() === 'perform:Perform,sequence:Sequence,setup:Setup,gig:Gig' && sameLayout(t[3].layout, gig),
    t.map(x => x.id).join());
  check('once: the old key goes and the list is stored, so deleting that tab does not bring it back',
    !store.has('chromaglass-desk-layout:gig') && store.has(TABS_KEY)
    && (saveTabs(deleteTab(t, 'gig')), loadTabs().map(x => x.id).join() === 'perform,sequence,setup'));
  check('the old desk mode opens the tab it became: Gig\'s own if it was kept, else Perform; Load-in is Setup',
    loadTabId(t) === 'gig' && tabForStored(defaultTabs(), 'perform') === 'perform' && tabForStored(defaultTabs(), 'design') === 'perform'
    && tabForStored(defaultTabs(), 'loadin') === 'setup' && tabForStored(defaultTabs(), null) === 'perform' && tabForStored(defaultTabs(), 'sequence') === 'sequence',
    `${loadTabId(t)}`);
  // All three at once, the desk left on Load-in: kept in the old order, each as it was, Build still in Preview.
  store.clear();
  const build = closePanel(shippedLayout('build'), 'patches'), loadin = dockPanel(shippedLayout('loadin'), 'phone', 'left');
  store.set('chromaglass-desk-layout:build', JSON.stringify(build));
  store.set('chromaglass-desk-layout:gig', JSON.stringify(gig));
  store.set('chromaglass-desk-layout:loadin', JSON.stringify(loadin));
  store.set(TAB_KEY, 'loadin');
  const all = loadTabs();
  check('all three old layouts are kept, in their old order, as they were (Build in Preview), and Load-in left up opens Load-in',
    all.map(x => x.id).join() === 'perform,sequence,setup,build,gig,loadin' && sameLayout(all[3].layout, build) && all[3].layout.plateMode === 'preview'
    && sameLayout(all[5].layout, loadin) && loadTabId(all) === 'loadin',
    `${all.map(x => x.id).join()}; up ${loadTabId(all)}`);
  store.clear();
}

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
/*
  The seven groups (PLAN 35b), one vocabulary for the rail, the panel browser,
  the sections' own `data-group` and the desk's own panels. What could drift is
  each of those four being edited alone: a panel left on a retired group name
  would sort to the top of the browser under a heading nobody drew, and a
  section's `data-group` is a string in the markup the map knows nothing about.
  And the Stage group is also a gate (`isStagePanel`: Build and Gig keep it in
  the Stage sheet), so the regroup must not move a panel in or out of it.
*/
const GROUPS = ['play', 'pour', 'feed', 'motion', 'chemistry', 'look', 'stage'];
check('the groups are the seven, in order', SETTINGS_CATEGORIES.map(c => c.id).join() === GROUPS.join(), SETTINGS_CATEGORIES.map(c => c.name).join(' · '));
const offGroup = PANELS.filter(p => !GROUPS.includes(p.category));
check('every panel, the desk\'s own included, is in one of them', offGroup.length === 0, offGroup.map(p => `${p.id} → ${p.category}`).join(', ') || `${PANELS.length} panels`);
const wrongMarkup = SETTINGS_SECTIONS.filter(s => !new RegExp(`data-group=\\{groupOf\\('${s.id}'\\)\\} data-section="${s.id}"`).test(panelSrc));
check('and a section\'s markup takes its data-group from the map, not a word of its own', wrongMarkup.length === 0 && groupOf('film') === 'feed',
  wrongMarkup.map(s => s.id).join(', ') || `${SETTINGS_SECTIONS.length} sections`);
const STAGE_NOW = ['layers', 'mapping', 'mark', 'phone', 'projectors', 'simulation'];
check('and Stage is the same panels as before (the Stage sheet\'s)',
  PANELS.filter(p => isStagePanel(p.id)).map(p => p.id).sort().join() === STAGE_NOW.join(),
  PANELS.filter(p => isStagePanel(p.id)).map(p => p.id).sort().join());
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

// ── A stored layout ─────────────────────────────────────────────────
console.log('\n A stored layout');
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
  const s = sanitizeLayout(raw, shippedLayout('gig'));
  const { doubled } = placesOf(s);
  check('a stored layout loses unknown and doubled panels, and keeps a Stage panel wherever it was put',
    s.left.join() === 'cues,projectors' && s.right.join() === 'rides' && s.deck.join() === 'dyes' && doubled.length === 0,
    `left ${s.left} · right ${s.right} · deck ${s.deck}`);
  const t = s.floating.find(f => f.id === 'tools');
  check('and a floating panel is clamped to one that can be grabbed',
    s.floating.length === 1 && !!t && t.x === 0 && t.y === 3000 && t.w === 220 && t.h === FLOAT_SIZE.h,
    JSON.stringify(s.floating));
  check('and folds only what is out, a deck flag only when true, a plate mode only when real',
    s.collapsed.join() === 'rides' && s.deckCollapsed === false && s.plateMode === 'live');
  check('and anything that is not a layout is the shipped one',
    [null, 3, 'x', []].every(v => sameLayout(sanitizeLayout(v, baseLayout('perform')), DEFAULT_TABS[0].layout)));
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

// ── No setting alone on a panel ───────────────────────────────────────
/*
  The owner, 2026-10-10, over a screenshot of Sound Mappings: a whole panel
  for one knob, Sound Drive. A knobs panel draws the numbers of its section
  (its switches and pickers are behind "All of…"), so a section with one or
  two numbers was a panel of one or two knobs; Heat Slide was the other, with
  Evaporation Rate and Heat Decay. Both are folded into the sections they
  belong with, and the bar is three, so neither comes back by a section
  being split again with too little in it.
*/
{
  const counts = new Map();
  for (const s of PINNABLE) counts.set(s.section, (counts.get(s.section) ?? 0) + 1);
  const thin = PANELS.filter(p => p.kind === 'knobs').map(p => [p.id, counts.get(p.id) ?? 0]).filter(([, n]) => n < 3);
  const knobPanels = PANELS.filter(p => p.kind === 'knobs').length;
  check('no knobs panel holds fewer than three knobs', knobPanels >= 10 && thin.length === 0,
    thin.length ? thin.map(([id, n]) => `${id} ${n}`).join(', ') : `${knobPanels} knobs panels, the smallest ${Math.min(...PANELS.filter(p => p.kind === 'knobs').map(p => counts.get(p.id) ?? 0))}`);
  check('and the merged sections\' controls went with them',
    PIN_SECTION('audioImpact') === 'audio-input' && PIN_SECTION('evaporationRate') === 'physics' && PIN_SECTION('heatDecay') === 'physics',
    `audioImpact ${PIN_SECTION('audioImpact')}, evaporationRate ${PIN_SECTION('evaporationRate')}, heatDecay ${PIN_SECTION('heatDecay')}`);
  /*
    A layout saved before the merge names the old panels. It opens with the
    panel they went into, in the same place, folded if it was folded; and
    where that panel is out already, the old one is not a second copy.
  */
  const old = sanitizeLayout({ left: [], right: ['heat'], deck: ['recipe', 'audio-mappings', 'macro'], floating: [], collapsed: ['audio-mappings'], deckCollapsed: false, plateMode: 'preview' }, baseLayout('perform'));
  check('a saved layout\'s Sound Mappings opens Sound in its place, and Heat Slide opens Fluid Physics',
    old.deck.join() === 'recipe,audio-input,macro' && old.right.join() === 'physics' && old.collapsed.join() === 'audio-input',
    `deck ${old.deck.join()} · right ${old.right.join()} · folded ${old.collapsed.join()}`);
  const both = sanitizeLayout({ left: ['physics'], right: [], deck: ['heat'], floating: [{ id: 'audio-mappings', x: 10, y: 10, w: 300, h: 300 }], collapsed: [], deckCollapsed: false, plateMode: 'preview' }, baseLayout('perform'));
  check('and one already out is not drawn twice; a floating one floats as the merged panel',
    both.left.join() === 'physics' && both.deck.length === 0 && both.floating.map(f => f.id).join() === 'audio-input' && placesOf(both).doubled.length === 0,
    `left ${both.left.join()} · deck ${both.deck.join()} · floating ${both.floating.map(f => f.id).join()}`);
  check('the old ids are not panels any more', !PANEL_BY_ID.has('audio-mappings') && !PANEL_BY_ID.has('heat'));
}

// ── One control, one place on a tab ──────────────────────────────────
/*
  The owner (2026-10-29): "why are there repeated controls in the rides and
  the recipe groups?" The Perform tab drew Speed, Turbulence, Soap Bursts,
  Beat Press and Evolve Speed twice, Zoom three times and Swirl twice. What
  each panel draws is worked out here the way the desk works it out
  (`drawnElsewhere`, over each strip's keys and each knobs panel's section),
  on every shipped tab, and counted.
*/
{
  const SECTION_KEYS = new Map();
  for (const s of PINNABLE) SECTION_KEYS.set(s.section, [...(SECTION_KEYS.get(s.section) ?? []), String(s.key)]);
  const rides = DEFAULT_RIDES.map(String), recipe = DEFAULT_RECIPE.map(String);
  const keysOf = (id) => id === 'rides' ? rides : id === 'recipe' ? recipe : PANEL_BY_ID.get(id)?.kind === 'knobs' ? SECTION_KEYS.get(id) ?? [] : [];
  /** Every control each panel out on `l` draws, after it has left out what another has. */
  const drawn = (l) => {
    const n = new Map(), left = new Map();
    for (const id of openPanels(l)) {
      const held = drawnElsewhere(l, id, keysOf(id), rides, recipe);
      for (const k of keysOf(id)) {
        if (held.has(k)) left.set(`${id}:${k}`, held.get(k));
        else n.set(k, [...(n.get(k) ?? []), id]);
      }
    }
    return { n, left };
  };
  const before = (l) => {
    const n = new Map();
    for (const id of openPanels(l)) for (const k of keysOf(id)) n.set(k, (n.get(k) ?? 0) + 1);
    return [...n].filter(([, c]) => c > 1).length;
  };
  for (const t of DEFAULT_TABS) {
    const l = baseLayout(t.id);
    const { n, left } = drawn(l);
    const twice = [...n].filter(([, ids]) => ids.length > 1);
    const pointsAtOut = [...left.values()].every(id => openPanels(l).includes(id));
    check(`on ${t.name}, each control is drawn once (${before(l)} drawn more than once without the rule)`,
      twice.length === 0 && pointsAtOut,
      twice.length ? twice.map(([k, ids]) => `${k} on ${ids.join(' and ')}`).join('; ') : `${n.size} controls, ${left.size} left to another panel`);
  }
  const perform = baseLayout('perform');
  const { n, left } = drawn(perform);
  check('on Perform the Rides keep every one of theirs, the Recipe the rest of its own, and Fluid Physics and Macro give theirs up',
    rides.every(k => n.get(k)?.join() === 'rides') && recipe.filter(k => !rides.includes(k)).every(k => n.get(k)?.join() === 'recipe')
    && left.get('physics:vorticityConfinement') === 'recipe' && left.get('macro:macroZoom') === 'rides' && left.get('recipe:globalSpeed') === 'rides',
    `Swirl on ${n.get('vorticityConfinement')?.join()}; Zoom on ${n.get('macroZoom')?.join()}; Speed on ${n.get('globalSpeed')?.join()}`);
  // Closing the Rides gives the Recipe its whole strip back: nothing was taken off it, only not drawn twice.
  const back = drawn(closePanel(perform, 'rides'));
  check('and with the Rides closed the Recipe draws all of its own again',
    recipe.every(k => back.n.get(k)?.join() === 'recipe'), `the Recipe draws ${recipe.filter(k => back.n.get(k)?.includes('recipe')).length} of ${recipe.length}`);
  // A control picked onto the Recipe appears there, even one a section panel out on the tab has (qa's Refraction pick).
  const picked = drawnElsewhere(perform, 'recipe', [...recipe, 'refraction'], rides, [...recipe, 'refraction']);
  check('and a control picked onto the Recipe is drawn on it, not left to its section\'s panel',
    !picked.has('refraction') && drawnElsewhere(perform, 'camera', ['refraction'], rides, [...recipe, 'refraction']).get('refraction') === 'recipe');
}

console.log(`\n${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
