/**
 * The desk from the owner's assistant (PLAN 44k-16, 44k-17): its lines in
 * `npm run assistant`, beside `scripts/assistant.mjs` because that file is
 * close to the 100 KB `npm run sizes` stops a file growing past.
 *
 * What it holds, read from what the stand-in display receives and from the
 * show's answers, never from what the MCP server says it did:
 *  - in Play the tab up and the hand reach the display, and every edit of
 *    the saved desk (tabs, panels, pins, the view) is refused for want of
 *    Full with nothing sent;
 *  - show_state's desk carries the display's tabs, panels, pins, palette and
 *    hand;
 *  - each verb reaches the display in the page's own words (a panel's
 *    fold_all as fold-all, the rides as perform), with only what was named;
 *  - an amount, a tool, a layer, a move or a name out of its range is refused
 *    with its range, and nothing is sent;
 *  - a tab deleted from the assistant comes back on Undo, as `tab-restore`;
 *  - a phone's assistant-desk never reaches the display.
 * The page's own half (app/deskNow.ts) is `deskPageLines`, on the real module
 * and the real lib/deskTabs.ts and lib/deskLayout.ts: names found, a wrong
 * one answered with the ones there are, a deleted tab put back with its
 * panels at its place, and an edit that survives a reload of the stored
 * tabs. Each rule has its mutant in DESK_MUTANTS, run with assistant.mjs's
 * own.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The display's desk, as app/deskNow.ts reports it and askDesk answers (names found, as the page finds them). */
export function standInDesk() {
  const panel = (id, name, where) => ({ id, name, where, folded: false });
  const tab = (id, name, panels) => ({ id, name, plate: 'live', deckFolded: false, panels });
  const d = {
    tabs: [tab('perform', 'Perform', [panel('rides', 'Rides', 'right'), panel('cues', 'Set list', 'left')]), tab('sequence', 'Sequence', []), tab('setup', 'Setup', [])],
    up: 'perform', pins: { rides: ['dimmer'], recipe: [] }, activity: false, ambient: false, palette: { lock: null },
    hand: { tool: 'dropper', amount: 1, layer: 0, layers: 1 },
  };
  let kept = null;
  const find = (r) => d.tabs.find((t) => t.id === r || t.name.toLowerCase() === String(r).toLowerCase());
  return {
    state: () => JSON.parse(JSON.stringify(d)),
    onMessage(m, answer, sendState) {
      const t = find(m.tab ?? d.up);
      if ((m.do === 'tab' || m.op === 'rename' || m.op === 'delete') && !t) { answer({ ok: false, reason: `no tab "${m.tab}" (the tabs: ${d.tabs.map((x) => x.name).join(', ')})` }); return; }
      if (m.do === 'tab') d.up = t.id;
      if (m.do === 'hand') {
        if (m.hand.palette !== undefined) d.palette.lock = m.hand.palette;
        for (const k of ['tool', 'amount', 'layer']) if (m.hand[k] !== undefined) d.hand[k] = m.hand[k];
      }
      if (m.op === 'rename') t.name = m.name;
      if (m.op === 'delete') { kept = { tab: t, at: d.tabs.indexOf(t) }; d.tabs = d.tabs.filter((x) => x !== t); }
      if (m.do === 'tab-restore' && kept) { d.tabs.splice(kept.at, 0, kept.tab); kept = null; }
      if (m.do === 'panel' && m.verb === 'fold-all') for (const p of t.panels) p.folded = true;
      if (m.do === 'panel' && m.verb === 'open') t.panels.push(panel(String(m.panel).toLowerCase(), m.panel, m.slot ?? 'deck'));
      if (m.do === 'pin') { const k = m.surface === 'design' ? 'recipe' : 'rides'; d.pins[k] = m.on ? [...d.pins[k], m.key] : d.pins[k].filter((x) => x !== m.key); }
      if (m.do === 'view') Object.assign(d, m.view);
      answer({ ok: true });
      sendState();
    },
  };
}

const deskOf = (st) => { try { return JSON.parse(st.text.slice(st.text.indexOf('\n{') + 1)).desk ?? null; } catch { return null; } };

/** In Play: the tab up and the hand reach the display; the saved desk's edits are refused for want of Full. */
export async function deskPlayLines({ mcp, display, check }) {
  await sleep(1100);
  let t = Date.now();
  const up = await mcp.call('desk_tab', { tab: 'Setup' });
  await sleep(300);
  const hand = await mcp.call('hand', { tool: 'press' });
  await sleep(200);
  const sent = display.since(t, 'assistant-desk');
  t = Date.now();
  const r = [await mcp.call('desk_tabs', { command: 'add' }), await mcp.call('desk_panel', { command: 'fold_all' }), await mcp.call('desk_pins', { surface: 'rides', key: 'dimmer', on: false }), await mcp.call('desk_view', { ambient_tv: true })];
  await sleep(150);
  check('desk-play', 'in Play the tab up and the hand reach the display; tabs, panels, pins and the view are refused for want of Full, and nothing of theirs reaches it',
    up.ok && hand.ok && sent.some((m) => m.do === 'tab' && m.tab === 'Setup') && sent.some((m) => m.do === 'hand' && m.hand.tool === 'press')
      && r.every((x) => !x.ok && /Full mode is needed/.test(x.text)) && display.since(t, 'assistant-desk').length === 0,
    `${up.text} | ${hand.text} | ${r.map((x) => x.text).join(' | ')}`.slice(0, 240));
}

/** In Full. */
export async function deskFullLines({ mcp, display, check, phone }) {
  const got = (t) => display.since(t, 'assistant-desk');
  const state = async () => deskOf(await mcp.call('show_state'));
  /** One call, and what reached the display after it. */
  const tryIt = async (tool, args) => { const t = Date.now(); const r = await mcp.call(tool, args); await sleep(200); return { r, sent: got(t) }; };

  const s0 = await state();
  check('-', 'show_state\'s desk carries the display\'s tabs (with their panels), the tab up, the pins, the palette and the hand',
    s0?.tabs?.map((x) => x.name).join() === 'Perform,Sequence,Setup' && s0.tabs[0].panels[0]?.where === 'right' && s0.pins?.rides?.[0] === 'dimmer' && s0.hand?.layers === 1 && 'lock' in (s0.palette ?? {}),
    JSON.stringify(s0).slice(0, 220));

  const up = await tryIt('desk_tab', { tab: 'Perform' });
  const gone = await tryIt('desk_tab', { tab: 'Gig' });
  check('desk-tab', 'desk_tab reaches the display as the tab named and show_state reads it up',
    up.r.ok && up.sent.some((m) => m.do === 'tab' && m.tab === 'Perform') && (await state())?.up === 'perform', `${up.r.text} | ${JSON.stringify(up.sent)}`.slice(0, 200));
  check('desk-answer', 'a tab the desk does not have comes back refused with the display\'s words, the tabs there are, not done',
    !gone.r.ok && /no tab "Gig" \(the tabs: Perform, Sequence, Setup\)/.test(gone.r.text) && gone.sent.length === 1, gone.r.text.slice(0, 200));

  const hand = await tryIt('hand', { palette: 'Cool Ocean', tool: 'finger', amount: 2.5, layer: 0 });
  const off = await tryIt('hand', { palette: 'off' });
  const sentHand = hand.sent.find((m) => m.do === 'hand')?.hand;
  check('desk-hand', 'hand reaches the display with only what was named (palette, tool, amount, layer), palette off as null, and show_state reads them back',
    hand.r.ok && JSON.stringify(Object.keys(sentHand ?? {}).sort()) === '["amount","layer","palette","tool"]' && sentHand.amount === 2.5
      && off.r.ok && off.sent.some((m) => m.hand?.palette === null && Object.keys(m.hand).length === 1) && (await state())?.hand?.tool === 'finger',
    `${hand.r.text} | ${JSON.stringify(hand.sent)} | ${JSON.stringify(off.sent)}`.slice(0, 220));

  const much = await tryIt('hand', { amount: 9 });
  const hammer = await tryIt('hand', { tool: 'hammer' });
  const third = await tryIt('hand', { layer: 2 });
  check('desk-hand-range', 'an amount past 5, a tool the bench has not and a third plate are refused with their ranges, and nothing reaches the display',
    !much.r.ok && /amount: from 0.05 to 5/.test(much.r.text) && !hammer.r.ok && /tool: dropper/.test(hammer.r.text) && !third.r.ok && /layer: 0 or 1/.test(third.r.text) && much.sent.length + hammer.sent.length + third.sent.length === 0,
    `${much.r.text} | ${hammer.r.text} | ${third.r.text}`.slice(0, 220));

  const rename = await tryIt('desk_tabs', { command: 'rename', tab: 'Sequence', name: '  Club  ' });
  const still = await tryIt('desk_tabs', { command: 'move', tab: 'Setup', by: 0 });
  const long = await tryIt('desk_tabs', { command: 'rename', tab: 'Setup', name: 'A name far longer than any chip' });
  check('desk-tabs', 'rename reaches the display as rename with the name trimmed, and show_state reads it; a name past 24 characters is refused, with nothing sent',
    rename.r.ok && rename.sent.some((m) => m.op === 'rename' && m.tab === 'Sequence' && m.name === 'Club') && (await state())?.tabs?.[1]?.name === 'Club'
      && !long.r.ok && /1 to 24 characters/.test(long.r.text) && long.sent.length === 0, `${rename.r.text} | ${JSON.stringify(rename.sent)} | ${long.r.text}`.slice(0, 220));
  check('desk-move', 'a move of 0 places is refused, with nothing sent', !still.r.ok && /move: by a whole number/.test(still.r.text) && still.sent.length === 0, still.r.text.slice(0, 160));

  const del = await tryIt('desk_tabs', { command: 'delete', tab: 'Club' });
  const afterDel = await state();
  await sleep(1100);
  const undo = await tryIt('undo', {});
  const back = await state();
  check('desk-undo', 'a tab deleted from the assistant reaches the display as delete, and Undo sends tab-restore and the tab is back at its place',
    del.r.ok && del.sent.some((m) => m.op === 'delete') && afterDel?.tabs?.length === 2 && undo.r.ok && undo.sent.some((m) => m.do === 'tab-restore') && back?.tabs?.[1]?.name === 'Club',
    `${del.r.text} | ${undo.r.text} | ${JSON.stringify(back?.tabs?.map((x) => x.name))}`.slice(0, 220));

  const fold = await tryIt('desk_panel', { command: 'fold_all' });
  const open = await tryIt('desk_panel', { command: 'open', panel: 'Mixer', slot: 'float' });
  const dock = await tryIt('desk_panel', { command: 'dock', panel: 'Rides' });
  check('desk-panel', 'fold_all reaches the display as fold-all on the tab up, open with its slot, and show_state reads them; a dock with no slot is refused with nothing sent',
    fold.r.ok && fold.sent.some((m) => m.verb === 'fold-all' && m.panel === undefined) && open.r.ok && open.sent.some((m) => m.verb === 'open' && m.panel === 'Mixer' && m.slot === 'float')
      && (await state())?.tabs?.[0]?.panels?.every((p) => p.folded || p.where === 'float') && !dock.r.ok && /dock: a slot/.test(dock.r.text) && dock.sent.length === 0,
    `${fold.r.text} | ${open.r.text} | ${dock.r.text}`.slice(0, 220));

  const pin = await tryIt('desk_pins', { surface: 'recipe', key: 'stockGrain', on: true });
  const view = await tryIt('desk_view', { midi_activity: true, ambient_tv: true });
  const none = await tryIt('desk_view', {});
  const s1 = await state();
  check('desk-pin', 'a pin to the recipe reaches the display as the design surface, the view as activity and ambient, and show_state reads them; a view naming nothing is refused',
    pin.r.ok && pin.sent.some((m) => m.do === 'pin' && m.surface === 'design' && m.key === 'stockGrain' && m.on === true) && view.r.ok && view.sent.some((m) => m.view?.activity === true && m.view.ambient === true)
      && s1?.pins?.recipe?.includes('stockGrain') && s1.activity === true && s1.ambient === true && !none.r.ok && none.sent.length === 0,
    `${pin.r.text} | ${view.r.text} | ${none.r.text}`.slice(0, 220));

  const t = Date.now();
  phone.ws.send(JSON.stringify({ type: 'assistant-desk', do: 'tabs', op: 'reset-all' }));
  phone.ws.send(JSON.stringify({ type: 'assistant-desk', do: 'tab', tab: 'Setup' }));
  await sleep(250);
  check('phone-desk', 'a phone\'s assistant-desk never reaches the display', got(t).length === 0);
}

/** The page's own half (app/deskNow.ts), on the real lib/deskTabs.ts and lib/deskLayout.ts, whoever sent the message. */
export async function deskPageLines(page, say, guard) {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  // A door that edits the list as useDeskTabs does and saves it as it does (saveTabs), so loadTabs is the reload.
  let tabs = page.loadTabs();
  let up = tabs[0].id;
  const commit = (next) => { tabs = next; page.saveTabs(tabs); page.publishDesk(tabs, up, ['dimmer'], [], false); };
  commit(tabs);
  const did = [];
  page.setDeskDoor({
    setTab: (id) => { up = id; did.push(`up ${id}`); },
    edit: (e) => {
      did.push(e.op);
      if (e.op === 'rename') commit(page.renameTab(tabs, e.id, e.name));
      if (e.op === 'delete') commit(page.deleteTab(tabs, e.id));
      if (e.op === 'add') commit(page.addTab(tabs, { copyOf: e.copyOf, after: e.copyOf }).tabs);
    },
    update: (id, change) => { did.push(`update ${id}`); commit(page.setTabLayout(tabs, id, change)); },
    restore: (change) => { did.push('restore'); commit(change(tabs)); },
    pin: (s, k, on) => did.push(`pin ${s} ${k} ${on}`), activity: (on) => did.push(`activity ${on}`),
  });
  const r = {};
  r.up = await page.askDesk({ do: 'tab', tab: 'setup' });
  r.gig = await page.askDesk({ do: 'tab', tab: 'Gig' });
  r.rename = await page.askDesk({ do: 'tabs', op: 'rename', tab: 'Sequence', name: 'Club' });
  const reloaded = page.loadTabs().map((t) => t.name).join();
  const perform = tabs.find((t) => t.id === 'perform');
  const performPanels = JSON.stringify(perform.layout);
  r.del = await page.askDesk({ do: 'tabs', op: 'delete', tab: 'Perform' });
  const afterDel = tabs.map((t) => t.id).join();
  r.restore = await page.askDesk({ do: 'tab-restore' });
  r.twice = await page.askDesk({ do: 'tab-restore' });
  const restored = tabs[0];
  r.fold = await page.askDesk({ do: 'panel', verb: 'fold', tab: 'Perform', panel: restored.layout.right[0] });
  r.notOut = await page.askDesk({ do: 'panel', verb: 'close', panel: 'Mixer', tab: 'Setup' });
  r.wrong = await page.askDesk({ do: 'panel', verb: 'open', panel: 'Nowhere' });
  r.pinWrong = await page.askDesk({ do: 'pin', surface: 'perform', key: 'simResolution', on: true });
  r.pin = await page.askDesk({ do: 'pin', surface: 'design', key: 'dimmer', on: true });
  page.setDeskDoor(null);
  const none = await page.askDesk({ do: 'tab', tab: 'Setup' });
  // The hand, the palette, Ambient TV.
  let lock = 'unset';
  const hand = [];
  page.publishHand('dropper', 1, 0, 1);
  page.setPaletteDoor((i) => { lock = i; });
  page.setHandDoor({ tool: (x) => hand.push(`tool ${x}`), amount: (x, v) => hand.push(`amount ${x} ${v}`), layer: (n) => hand.push(`layer ${n}`) });
  r.palette = await page.askDesk({ do: 'hand', hand: { palette: 'cool ocean', tool: 'magnet', amount: 3 } });
  r.noPalette = await page.askDesk({ do: 'hand', hand: { palette: 'Plaid' } });
  r.layer = await page.askDesk({ do: 'hand', hand: { layer: 1 } });
  page.setAmbientDoor(null);
  r.ambient = await page.askDesk({ do: 'view', view: { ambient: true } });
  page.setPaletteDoor(null); page.setHandDoor(null);
  const ok = (...k) => k.every((x) => r[x] === null);
  say(ok('up', 'rename', 'del', 'restore', 'fold', 'pin', 'palette') && /no tab "Gig" \(the tabs: Perform, Sequence, Setup\)/.test(r.gig ?? '')
    && reloaded === 'Perform,Club,Setup' && afterDel === 'sequence,setup' && restored.id === 'perform' && JSON.stringify({ ...restored.layout, collapsed: [] }) === JSON.stringify({ ...JSON.parse(performPanels), collapsed: [] })
    && /no tab taken away/.test(r.twice ?? '') && tabs[0].layout.collapsed.length === 1 && /not out on that tab/.test(r.notOut ?? '') && /no panel "Nowhere" \(the panels: .*Mixer/.test(r.wrong ?? '')
    && /not a setting the desk can pin/.test(r.pinWrong ?? '') && /not running/.test(none ?? '') && lock === 1 && /no palette "Plaid"/.test(r.noPalette ?? '')
    && /layer: 0, the plates/.test(r.layer ?? '') && /not running/.test(r.ambient ?? '')
    && JSON.stringify(hand) === '["tool magnet","amount magnet 3"]' && JSON.stringify(page.HAND_TOOLS.slice().sort()) === JSON.stringify(guard.DESK_TOOLS.slice().sort())
    && guard.AMOUNT_RANGE.join() === `${page.HAND_AMOUNT.min},${page.HAND_AMOUNT.max}`,
  `the page's askDesk finds a tab by id or name and answers a wrong one with the tabs there are, renames one so the stored tabs read it back after a reload, puts a deleted tab back with its panels at its place once and only once, folds a panel out and refuses one not out or not a panel (with the list), refuses a pin the desk cannot draw, finds a palette by name, holds a layer to the plates on the stage, says when a door is not running, and keeps the guard's tools and Amount range its own (${JSON.stringify(r)} ${JSON.stringify(did)} ${JSON.stringify(hand)})`.slice(0, 600));
}

export const DESK_MUTANTS = [
  { rule: 'desk-play', file: 'assistantDesk.js', find: "const PLAY_DOES = new Set(['tab', 'hand']);", replace: "const PLAY_DOES = new Set(['tab', 'hand', 'tabs', 'panel', 'pin', 'view']);" },
  { rule: 'desk-tab', file: 'assistantDesk.js', find: "{ out: { do: d, tab: message.tab } } : { reason: 'tab:", replace: "{ out: { do: d } } : { reason: 'tab:" },
  { rule: 'desk-answer', file: 'assistant.js', find: "send({ type: 'assistant-desk', ...call.out, ...answerOf(message) });", replace: "send({ type: 'assistant-desk', ...call.out });" },
  { rule: 'desk-hand', file: 'assistantDesk.js', find: '    hand.palette = h.palette;\n', replace: '' },
  { rule: 'desk-hand-range', file: 'assistantDesk.js', find: 'h.amount < lo || h.amount > hi)', replace: 'false)' },
  { rule: 'desk-move', file: 'assistantDesk.js', find: 'message.by !== 0 && Math.abs', replace: 'Math.abs' },
  { rule: 'desk-tabs', file: 'assistantDesk.js', find: "name: message.name.trim() }", replace: 'name: message.name }' },
  { rule: 'desk-undo', file: 'assistant.js', find: "send({ type: 'assistant-desk', do: 'tab-restore' });", replace: '' },
  { rule: 'desk-panel', file: 'assistantDesk.js', find: "if (verb === 'dock' && !DESK_SLOTS.includes(message.slot)) return", replace: 'if (false) return' },
  { rule: 'desk-pin', file: 'assistantDesk.js', find: "for (const k of ['activity', 'ambient']) if", replace: "for (const k of ['activity']) if" },
  { rule: 'phone-desk', file: 'remote-server.js', find: ", 'assistant-desk']);", replace: ']);' },
];
