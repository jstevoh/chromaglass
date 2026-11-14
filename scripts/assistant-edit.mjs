/**
 * The set list and the sequences built from the owner's assistant (PLAN
 * 44k-16a): their lines in `npm run assistant`, beside
 * `scripts/assistant.mjs` because that file is close to the 100 KB
 * `npm run sizes` stops a file growing past.
 *
 * What it holds, read from what the stand-in display receives and from the
 * show's answers, never from what the MCP server says it did:
 *  - in Play every edit is refused for want of Full with nothing sent, and a
 *    sequence read (Suggest) reaches the display and answers with it;
 *  - an item added reaches the display as the look named, at the place asked
 *    (from 0 there, from 1 to the assistant), and show_state reads it;
 *  - an item, a move or a stage past the list, a stage's seconds, palette or
 *    fields out of range, and a delete naming no sequence are refused with
 *    their ranges, and nothing is sent;
 *  - a stage's fields reach the display in the page's words (palette_size as
 *    paletteSize), with only what was named;
 *  - an item taken out comes back on Undo, as `restore`;
 *  - a set list file read from the owner's home folder by path reaches the
 *    display as its text, and one written out lands there, never over a file
 *    already there unless asked, and never outside the home folder;
 *  - a phone's assistant-edit never reaches the display.
 * The page's own half (app/editNow.ts) is `editPageLines`, on the real module
 * and the real lib/setList.ts, lib/sequencer.ts and lib/userPresets.ts. Each
 * rule has its mutant in EDIT_MUTANTS, run with assistant.mjs's own.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The display's set and sequences, as app/editNow.ts edits them, over
 * assistant.mjs's own `setl` and `seq` so show_state reads every change.
 */
export function standInEdit(setl, seq) {
  const kept = [];
  const renumber = () => setl.items.forEach((x, i) => { x.n = i + 1; });
  const stages = (q) => Array.from({ length: q.stages }, (_, i) => ({ n: i + 1, name: `S${i + 1}`, seconds: 30 }));
  return {
    onMessage(m, answer, sendState) {
      if (m.op === 'restore') {
        const k = kept.pop();
        if (k) setl.items = k;
        renumber();
        answer(k ? { ok: true } : { ok: false, reason: 'no edit to take back' });
        sendState();
        return;
      }
      const q = seq.sequences.find((x) => x.id === m.sequence || x.name === m.sequence) ?? seq.sequences.find((x) => x.id === seq.selectedId);
      if (m.op === 'read') { answer({ ok: true, data: { id: q.id, name: q.name, stages: stages(q) } }); return; }
      if (m.op === 'export') { answer({ ok: true, data: { file: 'friday.chromaglass-setlist.json', text: '{"format":"chromaglass-setlist","name":"Friday"}' } }); return; }
      if (m.of === 'set') {
        kept.push(setl.items.map((x) => ({ ...x })));
        if (m.op === 'add') setl.items.splice(m.at ?? setl.items.length, 0, { n: 0, name: m.look ?? m.sequence, kind: m.look ? 'look' : 'sequence', look: m.look ? String(m.look).toLowerCase() : null, fade: null, missing: false });
        if (m.op === 'remove') setl.items.splice(m.item, 1);
        renumber();
      }
      if (m.op === 'add-stage') q.stages += 1;
      answer({ ok: true });
      sendState();
    },
  };
}

const setOf = (st) => { try { return JSON.parse(st.text.slice(st.text.indexOf('\n{') + 1)).set ?? null; } catch { return null; } };

/** In Suggest: a sequence read and a set's file out answer; an edit is refused for want of Full. */
async function editSuggestLines({ mcp, display, check }) {
  await sleep(1100);
  const t = Date.now();
  const read = await mcp.call('sequence_edit', { command: 'read', sequence: 'Slow build' });
  const out = await mcp.call('set_list_edit', { command: 'export' });
  // Counted, not timed: "nothing sent" is the display's count of edits not moving across the add, so a CI clock that steps back cannot read an earlier message as the add's.
  const before = display.since(0, 'assistant-edit').length;
  const add = await mcp.call('set_list_edit', { command: 'add', look: 'Calm' });
  await sleep(200);
  const c = { read: read.ok, slow: /"name": "Slow build"/.test(read.text), out: out.ok, file: /chromaglass-setlist/.test(out.text), two: display.since(t, 'assistant-edit').filter((m) => m.op === 'read' || m.op === 'export').length === 2,
    refused: !add.ok && /Full mode is needed/.test(add.text), none: display.since(0, 'assistant-edit').length === before };
  check('edit-suggest', 'in Suggest a sequence read and a set list file written out reach the display and answer with the sequence and the file, and an add is refused for want of Full with nothing sent',
    Object.values(c).every(Boolean),
    `${Object.entries(c).filter(([, v]) => !v).map(([k]) => k).join(',') || 'all'} | read: ${read.text.slice(0, 160)} | add: ${add.text.slice(0, 100)} | sent ${JSON.stringify(display.since(t, 'assistant-edit').map((m) => m.op))}`.replace(/\n/g, ' '));
}

/** In Play: every edit refused for want of Full; a sequence read is Suggest's and answers. */
async function editPlayLines({ mcp, display, check }) {
  await sleep(1100);
  const t = Date.now();
  const r = [await mcp.call('set_list_edit', { command: 'add', look: 'Calm' }), await mcp.call('sequence_edit', { command: 'new', name: 'Mine' }), await mcp.call('set_list_edit', { command: 'remove', item: 1 })];
  await sleep(200);
  const refusedSent = display.since(t, 'assistant-edit').length;
  const read = await mcp.call('sequence_edit', { command: 'read', sequence: 'Peak' });
  await sleep(200);
  check('edit-play', 'in Play every set list and sequence edit is refused for want of Full with nothing sent, and a sequence read reaches the display and answers with the sequence',
    r.every((x) => !x.ok && /Full mode is needed/.test(x.text)) && refusedSent === 0 && read.ok && /"name": "Peak"/.test(read.text) && display.since(t, 'assistant-edit').some((m) => m.op === 'read' && m.sequence === 'Peak'),
    `${r.map((x) => x.text).join(' | ')} | ${read.text}`.slice(0, 260));
}

/** In Full. */
async function editFullLines({ mcp, display, check, phone }) {
  const got = (t) => display.since(t, 'assistant-edit');
  const set = async () => setOf(await mcp.call('show_state'));
  const tryIt = async (tool, args) => { const t = Date.now(); const r = await mcp.call(tool, args); await sleep(200); return { r, sent: got(t) }; };

  const add = await tryIt('set_list_edit', { command: 'add', look: 'Velvet', at: 2, name: 'Opener' });
  const s1 = await set();
  check('edit-add', 'an item added reaches the display as the look named, at item 2 (place 1 there), with its name, and show_state reads it there',
    add.r.ok && add.sent.some((m) => m.of === 'set' && m.op === 'add' && m.look === 'Velvet' && m.at === 1 && m.name === 'Opener') && s1?.items?.map((x) => x.name).join() === 'Calm,Velvet,Acid trip,Slow build',
    `${add.r.text} | ${JSON.stringify(add.sent)} | ${JSON.stringify(s1?.items?.map((x) => x.name))}`.slice(0, 260));

  const past = await tryIt('set_list_edit', { command: 'remove', item: 9 });
  const still = await tryIt('set_list_edit', { command: 'move', item: 2, to: 2 });
  const both = await tryIt('set_list_edit', { command: 'add', look: 'Calm', sequence: 'Peak' });
  check('edit-range', 'an item past the set, a move to its own place and an add naming both a look and a sequence are refused with why, and nothing reaches the display',
    !past.r.ok && /item 9 of a set of 4/.test(past.r.text) && !still.r.ok && /another place/.test(still.r.text) && !both.r.ok && /one of them/.test(both.r.text) && past.sent.length + still.sent.length + both.sent.length === 0,
    `${past.r.text} | ${still.r.text} | ${both.r.text}`.slice(0, 260));

  const stage = await tryIt('sequence_edit', { command: 'add_stage', sequence: 'Peak', name: 'Drop', seconds: 30, look: 'Acid', palette_size: 2, settings: { stockGrain: 0.4 } });
  const f = stage.sent.find((m) => m.op === 'add-stage')?.fields;
  const long = await tryIt('sequence_edit', { command: 'edit_stage', stage: 2, seconds: 5000 });
  const four = await tryIt('sequence_edit', { command: 'edit_stage', stage: 2, palette_size: 4 });
  const none = await tryIt('sequence_edit', { command: 'edit_stage', stage: 2 });
  const del = await tryIt('sequence_edit', { command: 'delete' });
  check('edit-stage', 'a stage added reaches the display with only the fields named, in the page\'s words (paletteSize); seconds past 3600, four dyes, an edit naming nothing and a delete naming no sequence are refused with their ranges, nothing sent',
    stage.r.ok && JSON.stringify(Object.keys(f ?? {}).sort()) === '["look","name","paletteSize","seconds","settings"]' && f.paletteSize === 2 && f.settings.stockGrain === 0.4
      && !long.r.ok && /seconds: from 1 to 3600/.test(long.r.text) && !four.r.ok && /palette_size: 1, 2, 3/.test(four.r.text) && !none.r.ok && /name what to change/.test(none.r.text) && !del.r.ok && /name the sequence/.test(del.r.text)
      && long.sent.length + four.sent.length + none.sent.length + del.sent.length === 0,
    `${stage.r.text} | ${JSON.stringify(f)} | ${long.r.text} | ${four.r.text} | ${none.r.text} | ${del.r.text}`.slice(0, 300));

  await sleep(1100);
  const rm = await tryIt('set_list_edit', { command: 'remove', item: 1 });
  const afterRm = await set();
  const undo = await tryIt('undo', {});
  const back = await set();
  check('edit-undo', 'an item taken out reaches the display as remove (place 0), and Undo sends restore and the item is back at its place',
    rm.r.ok && rm.sent.some((m) => m.op === 'remove' && m.item === 0) && afterRm?.items?.length === 3 && undo.r.ok && undo.sent.some((m) => m.op === 'restore') && back?.items?.map((x) => x.name).join() === 'Calm,Velvet,Acid trip,Slow build' && afterRm?.items?.[0]?.name === 'Velvet',
    `${rm.r.text} | ${undo.r.text} | ${JSON.stringify(back?.items?.map((x) => x.name))}`.slice(0, 260));

  // Files in the owner's home folder, by path: this process's home is the MCP server's (it inherits the environment).
  // Its own names each run: the mutants run side by side in one process.
  const tag = `.cg-edit-check-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const inFile = join(homedir(), `${tag}.json`), outFile = join(homedir(), `${tag}-out.json`);
  const body = '{"format":"chromaglass-setlist","name":"From disk","items":[{"look":"calm"}]}';
  writeFileSync(inFile, body);
  rmSync(outFile, { force: true });
  try {
    const imp = await tryIt('set_list_edit', { command: 'import', path: `~/${tag}.json` });
    const out = await tryIt('set_list_edit', { command: 'export', path: `~/${tag}-out.json` });
    const wrote = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
    const again = await tryIt('set_list_edit', { command: 'export', path: `~/${tag}-out.json` });
    writeFileSync(outFile, 'old');
    const over = await tryIt('set_list_edit', { command: 'export', path: `~/${tag}-out.json`, overwrite: true });
    const overWrote = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
    // Beside the home folder, by a name that starts as the home folder's does.
    const sibling = join(homedir(), '..', `${basename(homedir())}${tag}.json`);
    const side = await tryIt('set_list_edit', { command: 'export', path: `~/../${basename(homedir())}${tag}.json` });
    const away = await tryIt('set_list_edit', { command: 'import', path: '/etc/hosts.json' });
    const txt = await tryIt('set_list_edit', { command: 'export', path: `~/${tag}.txt` });
    check('edit-file', 'a set list file read by path from the home folder reaches the display as its text, and one written out lands there; a second write is refused without overwrite and lands with it, and a path beside or outside the home folder or not .json is refused, nothing sent and nothing written',
      imp.r.ok && imp.sent.some((m) => m.op === 'import' && m.text === body) && out.r.ok && /"name":"Friday"/.test(wrote) && !again.r.ok && /overwrite/.test(again.r.text)
        && over.r.ok && /"name":"Friday"/.test(overWrote) && !side.r.ok && /home folder/.test(side.r.text) && !existsSync(sibling)
        && !away.r.ok && /home folder/.test(away.r.text) && !txt.r.ok && /\.json file/.test(txt.r.text) && again.sent.length + side.sent.length + away.sent.length + txt.sent.length === 0,
      `${imp.r.text} | ${out.r.text} | ${again.r.text} | ${over.r.text} | ${side.r.text} | ${away.r.text} | ${txt.r.text}`.slice(0, 300));
  } finally { rmSync(inFile, { force: true }); rmSync(outFile, { force: true }); }

  const t = Date.now();
  phone.ws.send(JSON.stringify({ type: 'assistant-edit', of: 'set', op: 'new' }));
  phone.ws.send(JSON.stringify({ type: 'assistant-edit', op: 'restore' }));
  await sleep(250);
  check('phone-edit', 'a phone\'s assistant-edit never reaches the display', got(t).length === 0);
}

/**
 * The page's own half (app/editNow.ts), on the real lib modules, with a door
 * that renders only when told. Every message but Undo's goes through the
 * guard's own editGuard first, so the page is held to what the guard sends
 * (an op or a field the two name differently fails here, where the app
 * would answer "not an edit this build knows"), and every op the guard lets
 * through is asked at least once and answered as done.
 */
function editPageLines(page, say, guard, undoDepth) {
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  /*
    The door as useSetActions sets it, but a React that has not rendered: a
    write is queued and read back only after render(), as the hook's ref, the
    kept sets, the sequencer's list and its choice are. Two calls between
    renders are what the mirrors are for.
  */
  const view = { set: { name: 'Friday', items: [{ id: 'a', kind: 'look', ref: 'calm' }, { id: 'b', kind: 'look', ref: 'acid' }] }, saved: [{ name: 'Old', items: [] }],
    seqs: [{ id: 'seq-built', name: 'Slow build', loop: true, builtIn: true, stages: [{ id: 's1', name: 'One', seconds: 60, advance: 'time', transition: 8 }] }], selected: 'seq-built' };
  let queued = { ...view };
  const render = () => { Object.assign(view, queued); };
  const looks = [{ id: 'calm', name: 'Calm', user: false }, { id: 'acid', name: 'Acid trip', user: false }, { id: 'user-1', name: 'Mine', user: true }];
  const presets = [{ id: 'user-1', name: 'Mine', settings: {} }];
  const upserted = [];
  page.setEditDoor({
    set: () => view.set, changeSet: (n) => { queued = { ...queued, set: n }; },
    saved: () => view.saved, changeSaved: (n) => { queued = { ...queued, saved: n }; },
    sequences: () => view.seqs, putSequences: (u) => { queued = { ...queued, seqs: [...view.seqs.filter((q) => q.builtIn), ...u] }; },
    removeSequence: (id) => { queued = { ...queued, seqs: queued.seqs.filter((q) => q.id !== id) }; },
    select: (id) => { queued = { ...queued, selected: id }; }, selected: () => view.selected,
    looks: () => looks, presets: () => presets, upsertPreset: (p) => upserted.push(p.id), song: () => null, setLive: () => {},
  });
  const done = new Set();
  const bad = [];
  /** One call through the guard, then the page; what the page answered. */
  const ask = (msg) => {
    const c = guard.editGuard(msg, null);
    if (c.reason) { bad.push(`${msg.op}: ${c.reason}`); return { ok: false, reason: `guard: ${c.reason}` }; }
    const a = page.askEdit(c.out);
    if (a.ok) done.add(`${msg.of}:${msg.op}`);
    if (!a.ok && /build knows/.test(a.reason)) bad.push(`${msg.op}: ${a.reason}`);
    return a;
  };
  const undo = () => page.askEdit({ op: 'restore' });
  const items = () => view.set.items.map((i) => `${i.kind}:${i.ref}${i.name ? `=${i.name}` : ''}${i.song ? '♪' : ''}`).join();
  const S = (op, m = {}) => ask({ of: 'set', op, ...m });
  const Q = (op, m = {}) => ask({ of: 'sequence', op, ...m });
  const r = {};
  const fail = [];
  const want = (ok, what) => { if (!ok) fail.push(what); };

  // The set: two adds before a render both land; a saved look as saved; a wrong look answered.
  r.add1 = S('add', { look: 'acid trip' }); r.add2 = S('add', { look: 'Mine', at: 0 }); r.gone = S('add', { look: 'Plaid' });
  render();
  want(r.add1.ok && r.add2.ok && items() === 'saved:user-1,look:calm,look:acid,look:acid' && /no look "Plaid"/.test(r.gone.reason ?? ''), `two adds before a render (${items()})`);
  S('move', { item: 0, to: 2 }); S('name-item', { item: 0, name: 'Opener' });
  render();
  want(items() === 'look:calm=Opener,look:acid,saved:user-1,look:acid', `move 1 to 3 and a name (${items()})`);
  S('link-song', { item: 1, song: { title: 'Song', artist: 'Band' } }); render();
  const linked = items();
  S('unlink-song', { item: 1 }); render();
  want(linked.includes('look:acid♪') && !items().includes('♪'), `a song tied and untied (${linked})`);
  // Taken out, put back once; a refused edit holds its place; the performer's change wins.
  const before = items();
  S('remove', { item: 0 }); render();
  r.back = undo(); render();
  want(r.back.ok && items() === before, `an item taken out and put back (${items()})`);
  r.past = S('remove', { item: 40 }); r.pastBack = undo();
  want(/item 41 of a set of 4/.test(r.past.reason ?? '') && /not made/.test(r.pastBack.reason ?? ''), `a refused edit's place in Undo (${r.past.reason} | ${r.pastBack.reason})`);
  S('rename', { name: 'Saturday' }); render();
  queued = { ...queued, set: { ...view.set, items: [...view.set.items, { id: 'p', kind: 'look', ref: 'calm' }] } }; render();
  r.theirs = undo(); render();
  want(/changed it since/.test(r.theirs.reason ?? '') && view.set.name === 'Saturday' && view.set.items.length === 5, `Undo leaves the performer's change (${r.theirs.reason})`);
  // Kept sets: saved under a name, the old one deleted and put back, the new one opened.
  const keptNames = () => view.saved.map((x) => x.name).join();
  S('save', { name: 'Gig night' }); S('delete-saved', { name: 'old' }); render();
  const afterDel = keptNames();
  r.savedBack = undo(); render();
  S('new', { name: 'Empty' }); render();
  const emptied = `${view.set.name}:${view.set.items.length}`;
  r.open = S('open', { name: 'Gig night' }); render();
  want(afterDel === 'Gig night' && r.savedBack.ok && keptNames() === 'Old,Gig night' && emptied === 'Empty:0' && r.open.ok && view.set.name === 'Gig night' && view.set.items.length === 5,
    `kept sets saved, deleted, put back, opened (${afterDel} | ${keptNames()} | ${emptied})`);

  // Sequences: a built-in refused, a copy chosen and edited, a new one chosen before a render.
  r.built = Q('edit-stage', { index: 0, fields: { name: 'x' } });
  const copy = Q('copy', { sequence: 'Slow build', name: 'My build' });
  const twin = Q('new', { name: 'Twin' });
  const fresh = Q('new', { name: 'Fresh' });
  Q('add-stage', { fields: { name: 'Second' } });
  Q('loop', { on: false });
  render();
  const freshSeq = view.seqs.find((q) => q.name === 'Fresh');
  want(/built in/.test(r.built.reason ?? '') && copy.ok && fresh.ok && twin.ok && new Set([copy.data.id, twin.data.id, fresh.data.id]).size === 3 && view.seqs.some((q) => q.name === 'Twin') && view.selected === fresh.data.id && freshSeq?.stages.map((s) => s.name).join() === 'Opening,Second' && freshSeq.loop === false,
    `a copy and two new ones in one millisecond, each kept, and a stage and a loop on the new one before a render (${JSON.stringify(view.seqs.map((q) => [q.name, q.stages.map((s) => s.name), q.loop]))})`);
  r.stage = Q('add-stage', { sequence: 'my build', at: 0, fields: { name: 'Drop', look: 'Acid trip', ending: 'drain', seconds: 30, advance: 'section', transition: 4, paletteSize: 2, paletteLead: 1, macro: true, settings: { stockGrain: 0.4 } } });
  render();
  const st = view.seqs.find((q) => q.name === 'My build')?.stages[0];
  want(r.stage.ok && st?.name === 'Drop' && st.presetId === 'acid' && st.pace?.endDark === true && st.pace.moments?.includes('drain') && st.settings?.stockGrain === 0.4 && st.seconds === 30 && st.advance === 'section' && st.transition === 4 && st.paletteSize === 2 && st.paletteLead === 1 && st.macro === true,
    `a stage's fields (${JSON.stringify(st)})`);
  r.room = Q('edit-stage', { sequence: 'My build', index: 0, fields: { settings: { dimmer: 0.5 } } });
  r.range = Q('edit-stage', { sequence: 'My build', index: 0, fields: { settings: { stockGrain: 99 } } });
  want(/the room's/.test(r.room.reason ?? '') && /stockGrain: /.test(r.range.reason ?? ''), `the room and a range refused (${r.room.reason} | ${r.range.reason})`);
  Q('edit-stage', { sequence: 'My build', index: 0, fields: { settings: { stockGrain: null }, ending: 'lit', look: null, paletteSize: null, macro: null } });
  render();
  const off = view.seqs.find((q) => q.name === 'My build')?.stages[0];
  r.offBack = undo(); render();
  const offBack = view.seqs.find((q) => q.name === 'My build')?.stages[0];
  want(off && off.settings === undefined && off.pace?.endDark === false && off.presetId === undefined && off.paletteSize === undefined && off.macro === undefined && r.offBack.ok && offBack?.settings?.stockGrain === 0.4 && offBack.pace?.endDark === true,
    `a stage's fields taken off, a lit ending, and the edit undone (${JSON.stringify(off)} | ${JSON.stringify(offBack)})`);
  Q('move-stage', { sequence: 'My build', index: 0, to: 1 }); Q('rename', { sequence: 'My build', name: 'Our build' }); render();
  const ours = view.seqs.find((q) => q.name === 'Our build');
  want(ours?.stages.map((s) => s.name).join() === 'One,Drop', `a stage moved and the sequence renamed before one render (${JSON.stringify(ours?.stages.map((s) => s.name))})`);
  Q('remove-stage', { sequence: 'Our build', index: 0 }); render();
  r.only = Q('remove-stage', { sequence: 'Our build', index: 0 });
  Q('bind-song', { sequence: 'Our build', song: { title: 'Song', artist: 'Band' } }); render();
  const bound = !!view.seqs.find((q) => q.name === 'Our build')?.song;
  Q('unbind-song', { sequence: 'Our build' }); render();
  const read = Q('read', { sequence: 'Our build' });
  want(/one stage at least/.test(r.only.reason ?? '') && bound && !view.seqs.find((q) => q.name === 'Our build')?.song && read.ok && read.data.stages.length === 1 && read.data.stages[0].look === 'Acid trip',
    `one stage kept, a song bound and unbound, a read with its looks by name (${JSON.stringify(read.data ?? read.reason).slice(0, 120)})`);
  // Files: a sequence written out and read back in (chosen), deleted; a set list carrying two sequences and a saved look.
  const seqOut = Q('export', { sequence: 'Our build' });
  Q('delete', { sequence: 'Our build' }); render();
  const deleted = !view.seqs.some((q) => q.name === 'Our build');
  r.seqIn = Q('import', { text: seqOut.data?.text ?? '' }); render();
  want(seqOut.ok && deleted && r.seqIn.ok && view.selected === r.seqIn.data.id && view.seqs.some((q) => q.name === 'Our build'), `a sequence's file out, the sequence deleted, its file in and chosen (${r.seqIn.reason ?? ''})`);
  const file = JSON.stringify({ format: 'chromaglass-setlist', name: 'Gig', items: [{ sequence: 'seq-x' }, { sequence: 'seq-y' }], presets: [{ id: 'user-9', name: 'Theirs', settings: {} }], sequences: [{ id: 'seq-x', name: 'X', loop: true, stages: [] }, { id: 'seq-y', name: 'Y', loop: true, stages: [] }] });
  r.imp = S('import', { text: file }); render();
  const out = S('export');
  const reread = out.ok ? page.readSetListFile(out.data.text, () => true) : null;
  want(r.imp.ok && view.set.name === 'Gig' && view.seqs.filter((q) => q.id === 'seq-x' || q.id === 'seq-y').length === 2 && upserted.includes('user-9') && reread?.list.items.length === 2 && reread.sequences.length === 2,
    `a set list file with two sequences and a saved look, both kept and the look saved, written out again (${view.set.name}, ${upserted})`);
  // Ten deep, as the guard's Undo.
  for (let i = 0; i < 11; i++) { S('rename', { name: `N${i}` }); render(); }
  let backs = 0;
  while (undo().ok) { backs++; render(); }
  want(backs === undoDepth && page.EDIT_KEPT_MAX === undoDepth, `Undo goes back as deep as the guard's (${backs} of ${undoDepth})`);
  page.setEditDoor(null);
  const closed = page.askEdit({ of: 'set', op: 'rename', name: 'x' });
  const every = [...guard.SET_OPS.map((o) => `set:${o}`), ...guard.SEQUENCE_OPS.map((o) => `sequence:${o}`)].filter((o) => !done.has(o));
  say(fail.length === 0 && bad.length === 0 && every.length === 0 && /not running/.test(closed.reason ?? '') && JSON.stringify(page.EDIT_READ_OPS) === JSON.stringify(guard.EDIT_READS),
    `the page's askEdit, fed the guard's own messages, does every op the guard sends: items added by name (two before a render), moved, named, tied to a song, taken out and put back (a refused edit holding its place, the performer's change left), kept sets saved, deleted, put back and opened; a built-in sequence refused, a copy and a new one made apart in one millisecond, a stage added to the new one before a render, every field of a stage, the room and a range refused, an edit undone, one stage kept, a song bound, a read, files out and in, a file's sequences and look kept, Undo as deep as the guard's; the door closed says so (${[...fail, ...bad, ...every.map((o) => `never done: ${o}`)].join(' | ') || 'all held'})`.slice(0, 900));
}

export const EDIT_MUTANTS = [
  { rule: 'edit-play', file: 'assistantEdit.js', find: "(EDIT_READS.includes(op) ? 'suggest' : 'full')", replace: "(EDIT_READS.includes(op) ? 'suggest' : 'play')" },
  { rule: 'edit-play', file: 'assistant.js', find: "send({ type: 'assistant-edit', ...call.out, ...answerOf(message) });", replace: "send({ type: 'assistant-edit', ...call.out });" },
  { rule: 'edit-add', file: 'assistantEdit.js', find: "out[look ? 'look' : 'sequence'] = ref.trim();", replace: '' },
  { rule: 'edit-range', file: 'assistantEdit.js', find: 'if (v > max) return', replace: 'if (false) return' },
  { rule: 'edit-stage', file: 'assistantEdit.js', find: 'if (!within(f.seconds, STAGE_SECONDS))', replace: 'if (false)' },
  { rule: 'edit-stage', file: 'assistantEdit.js', find: 'out.paletteSize = f.paletteSize;', replace: 'out.palette_size = f.paletteSize;' },
  { rule: 'edit-undo', file: 'assistant.js', find: "send({ type: 'assistant-edit', op: 'restore' });", replace: '' },
  { rule: 'edit-undo', file: 'assistant.js', find: "if (editChanges(call.out.op)) remember({ kind: 'edit' });", replace: '' },
  { rule: 'edit-file', file: 'assistantEdit.js', find: '    out.text = message.text;\n', replace: '' },
  { rule: 'edit-suggest', file: 'assistantEdit.js', find: "export const EDIT_READS = ['read', 'export'];", replace: "export const EDIT_READS = ['read'];" },
  { rule: 'phone-edit', file: 'remote-server.js', find: ", 'assistant-edit']);", replace: ']);' },
];

/*
  The page line's own mutants: each a change to app/editNow.ts that must turn
  the page line red. The scenario's mutants copy server/ and run it; the page
  is not in server/, so these build the page module again with the one file
  changed (an esbuild onLoad) and run the page line on it.
*/
const PAGE_MUTANTS = [
  ['seq undo dropped', "  if (k.user) {\n    p.writeUser(k.user[0]);", "  if (false) {\n    p.writeUser(k.user[0]);"],
  ['import presets dropped', 'for (const pr of read.presets) d.upsertPreset(pr);', ''],
  ['seq mirror dropped', 'const all = () => fresh(d.sequences(), mSeqs);', 'const all = () => d.sequences();'],
  ['move reversed', 'write(moveItem(list, it.id, to - i));', 'write(moveItem(list, it.id, i - to));'],
  ['save keeps nothing', 'const after = withSavedSet(before, named);', 'const after = before;'],
  ['lit ends dark', "ending === 'lit' ? { endDark: false, moments }", "ending === 'lit' ? { endDark: true, moments }"],
  ['delete deletes nothing', "case 'delete': put(userBefore.filter(x => x.id !== q.id), q.id); return ok();", "case 'delete': return ok();"],
  ['saved mirror dropped', 'const saved = () => fresh(d.saved(), mSaved);', 'const saved = () => d.saved();'],
  ['restore ignores saved', "  if (k.saved) p.writeSaved(k.saved[0]);", ''],
  ['undo depth 1', 'export const EDIT_KEPT_MAX = 10;', 'export const EDIT_KEPT_MAX = 1;'],
  ['sel unmirrored', 'const selected = () => fresh(d.selected(), mSel);', 'const selected = () => d.selected();'],
  ['ids collide', 'const newSeqId = () => `seq-${Date.now().toString(36)}-a${(seqCount++).toString(36)}`;', 'const newSeqId = () => `seq-${Date.now().toString(36)}`;'],
  ['name-item ignored', "next = m.name ? { ...rest, name: String(m.name) } : rest;", "next = it;"],
  ['rename seq ignored', "case 'rename': return change({ ...q, name: String(m.name) });", "case 'rename': return ok();"],
  ['seq import not chosen', "put([...userBefore.filter(x => x.id !== q.id), q]); p.choose(q.id);", "put([...userBefore.filter(x => x.id !== q.id), q]); if (m.op !== 'import') p.choose(q.id);"],
];

async function editPageMutants(root, say, guard, undoDepth) {
  const { build } = await import('esbuild');
  const { readFileSync } = await import('node:fs');
  const orig = readFileSync(`${root}/src/app/editNow.ts`, 'utf8');
  const src = "export { askEdit, setEditDoor, EDIT_READ_OPS, EDIT_KEPT_MAX } from './src/app/editNow.ts'; export { readSetListFile } from './src/lib/setList.ts';";
  const lived = [];
  for (const [name, find, replace] of PAGE_MUTANTS) {
    if (!orig.includes(find)) { lived.push(`${name} (its text is not in editNow.ts)`); continue; }
    const contents = orig.replace(find, replace);
    const plugin = { name: 'mutant', setup(b) { b.onLoad({ filter: /editNow\.ts$/ }, () => ({ contents, loader: 'ts' })); } };
    const out = await build({ stdin: { contents: src, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent', plugins: [plugin] });
    const page = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
    let red = false;
    try { editPageLines(page, (ok) => { if (!ok) red = true; }, guard, undoDepth); } catch { red = true; }
    if (!red) lived.push(name);
  }
  say(lived.length === 0, `each of the page line's ${PAGE_MUTANTS.length} mutants of app/editNow.ts turns it red${lived.length ? ` (lived: ${lived.join(', ')})` : ''}`);
}

/**
 * The three modes' lines in one call from the Full block of scripts/assistant.mjs, which is
 * past its size limit for another line in each mode: Suggest, then Play, then back to Full.
 * By then the Play lines there have chosen Peak, so the Suggest read names its sequence.
 */
export async function editLines({ mcp, display, check, phone, setMode }) {
  await setMode('suggest');
  await editSuggestLines({ mcp, display, check });
  await setMode('play');
  await editPlayLines({ mcp, display, check });
  await setMode('full');
  await editFullLines({ mcp, display, check, phone });
}

/** What the page module of scripts/assistant.mjs exports for these lines, kept here so that file stays under its size limit. */
export const EDIT_PAGE = " export { askEdit, setEditDoor, EDIT_READ_OPS, EDIT_KEPT_MAX } from './src/app/editNow.ts'; export { readSetListFile } from './src/lib/setList.ts';";

/** The page lines on the real editNow.ts, held to the guard's own rules and Undo's depth, then its mutants when they run. */
export async function editPage(page, say, root, mutantsOn) {
  const guard = await import('../server/assistantEdit.js');
  const { UNDO_DEPTH } = await import('../server/assistant.js');
  editPageLines(page, say, guard, UNDO_DEPTH);
  if (mutantsOn) await editPageMutants(root, say, guard, UNDO_DEPTH);
}
