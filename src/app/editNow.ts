/**
 * Set lists and sequences built from the owner's assistant (PLAN 44k-16a):
 * the door `assistant-edit` comes through, set by `useSetActions`.
 *
 * Asked by name by the owner on 2026-11-12. `set_list` already armed and
 * fired an item and `sequencer` chose and ran a sequence; this is what builds
 * them: a set's items added, taken out, moved, named and tied to a song, the
 * set menu's Rename, New, Save, Open and Delete, a set list file read in and
 * written out, and a sequence made, copied, renamed, looped, deleted, its
 * stages added, changed, moved and taken out, its song bound, its file read
 * in and written out. The guard (server/assistantEdit.js) has checked the
 * shape and the ranges; the names are found here, where the looks, the
 * sequences and the kept sets are, and a wrong one is answered with the ones
 * there are.
 *
 * Why a holder, as `setNow.ts` is for the cue. The set is
 * `useSetListState`'s, the sequences `useShowSequencer`'s, and App(), which
 * calls both, is over its size ceiling and may not grow (`npm run sizes`).
 * `useSetActions` already holds every edit the desk's own set menu makes, so
 * it sets this door from what it has, and the state stays theirs.
 *
 * Why the mirrors (`fresh`). A door reads the set from a ref and the
 * sequences from the hook's last render, and two calls can land before React
 * renders the first one's change: the second would then edit the set as it
 * was and undo the first. So each write is remembered with what it was
 * written over, and read back until the published value moves on.
 *
 * Why Undo keeps what was there and what was left, and compares. A set item
 * taken out comes back on Undo; but if the performer has since added a row,
 * putting the old set back would take their row away. So Undo puts back what
 * an edit changed only while that is still as the edit left it, and
 * otherwise says the performer changed it since, as Undo already leaves a
 * look the performer has moved on from.
 */
import type { SetList, SetItem } from '../lib/setList';
import { SETLIST_FORMAT, SETLIST_FILE_EXT, readSetListFile, setItemId, withSavedSet, writeSetListFile, moveItem } from '../lib/setList';
import { duplicateSequence, stageId, type ShowSequence, type ShowStage } from '../lib/sequencer';
import { parseSequenceFile, sequenceFileName, serializeSequence, type UserPreset } from '../lib/userPresets';
import { songLabel, type SongRef } from '../lib/songRef';
import { sanitizePatch } from '../lib/sanitizeSettings';
import { PIN_RANGE } from '../lib/deskPins';
import { RIG_KEYS, SETUP_KEYS } from '../lib/lookFade';
import { livePresetId } from '../presets';
import { DEFAULT_SETTINGS, type VisualizerSettings } from '../types';
import type { PaceMoment, StagePace } from '../lib/scenePacing';

/** What `useSetActions` hands over: reads of the state as it is, and the writes the desk's own menus make. */
export interface EditDoor {
  set: () => SetList;
  changeSet: (next: SetList) => void;
  saved: () => SetList[];
  changeSaved: (next: SetList[]) => void;
  /** Every sequence, built-ins first, as the hook lists them. */
  sequences: () => ShowSequence[];
  /** The owner's sequences, the whole list at once. */
  putSequences: (user: ShowSequence[]) => void;
  /** One taken out as the panel's bin does: a run of it stopped, the choice moved off it. */
  removeSequence: (id: string) => void;
  select: (id: string) => void;
  selected: () => string;
  looks: () => { id: string; name: string; user: boolean }[];
  presets: () => UserPreset[];
  upsertPreset: (p: UserPreset) => void;
  /** The song identified now, for an item or a sequence made for it. */
  song: () => SongRef | null;
  setLive: (id: string | null) => void;
}

/** The ops that read: they change nothing and are not on Undo's list (as the guard's EDIT_READS). */
export const EDIT_READ_OPS = ['read', 'export'];
/** Undo's depth, as the guard's UNDO_DEPTH (`npm run assistant` holds the two equal). */
export const EDIT_KEPT_MAX = 10;
/** A file written out, under the relay's half-megabyte frame once escaped. */
const EXPORT_MAX = 400_000;
const MOMENTS_DEFAULT: PaceMoment[] = ['pour', 'burst', 'dyes'];

export type EditAnswer = { ok: true; data?: unknown } | { ok: false; reason: string };

let door: EditDoor | null = null;
export function setEditDoor(d: EditDoor | null): void { door = d; mSet = mSaved = mSeqs = mSel = null; }

type Mirror<T> = { base: T; after: T } | null;
let mSet: Mirror<SetList> = null;
let mSaved: Mirror<SetList[]> = null;
let mSeqs: Mirror<ShowSequence[]> = null;
/** The sequence chosen: a `new` then an `add_stage` naming none, before a render, adds to the new one. */
let mSel: Mirror<string> = null;
/** A sequence's id that two made in one millisecond cannot share. */
let seqCount = 0;
const newSeqId = () => `seq-${Date.now().toString(36)}-a${(seqCount++).toString(36)}`;
const fresh = <T>(raw: T, m: Mirror<T>): T => (m && m.base === raw ? m.after : raw);

/** One edit's parts, as they were before it and as it left them. */
interface Kept { set?: [SetList, SetList]; saved?: [SetList[], SetList[]]; user?: [ShowSequence[], ShowSequence[]] }
const kept: (Kept | null)[] = [];

const ok = (data?: unknown): EditAnswer => (data === undefined ? { ok: true } : { ok: true, data });
const no = (reason: string): EditAnswer => ({ ok: false, reason });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const lc = (s: string) => s.trim().toLowerCase();

/** The parts an edit touches, read fresh, written, and remembered for Undo. */
function parts(d: EditDoor) {
  const set = () => fresh(d.set(), mSet);
  const saved = () => fresh(d.saved(), mSaved);
  const all = () => fresh(d.sequences(), mSeqs);
  const user = () => all().filter(q => !q.builtIn);
  const selected = () => fresh(d.selected(), mSel);
  return {
    set, saved, all, user, selected,
    choose: (id: string) => { mSel = { base: d.selected(), after: id }; d.select(id); },
    writeSet: (next: SetList) => { mSet = { base: d.set(), after: next }; d.changeSet(next); },
    writeSaved: (next: SetList[]) => { mSaved = { base: d.saved(), after: next }; d.changeSaved(next); },
    writeUser: (next: ShowSequence[], remove?: string) => {
      const base = d.sequences();
      mSeqs = { base, after: [...base.filter(q => q.builtIn), ...next] };
      if (remove !== undefined) d.removeSequence(remove); else d.putSequences(next);
    },
  };
}

function findLook(d: EditDoor, ref: string) {
  const looks = d.looks();
  const id = livePresetId(ref.trim());
  return looks.find(l => l.id === ref.trim() || l.id === id) ?? looks.find(l => lc(l.name) === lc(ref)) ?? null;
}
const noLook = (ref: string) => `no look "${ref}" (looks by their name or id, as show_state's presets lists them)`;

function findSequence(all: ShowSequence[], ref: string | undefined, selected: string): ShowSequence | string {
  const hit = ref === undefined ? all.find(q => q.id === selected) : all.find(q => q.id === ref) ?? all.find(q => lc(q.name) === lc(ref));
  if (hit) return hit;
  return ref === undefined ? 'no sequence is chosen: name one' : `no sequence "${ref}" (there are: ${all.map(q => q.name).join(', ') || 'none'})`;
}

/** A stage's own settings, merged: only a look's numbers, in their range; null takes one off. */
function stageSettings(prev: Partial<VisualizerSettings> | undefined, s: Record<string, number | null>): Partial<VisualizerSettings> | undefined | string {
  const next: Record<string, unknown> = { ...(prev ?? {}) };
  for (const [k, v] of Object.entries(s)) {
    if (v === null) { delete next[k]; continue; }
    if (RIG_KEYS.has(k as keyof VisualizerSettings) || SETUP_KEYS.has(k as keyof VisualizerSettings)) return `${k} is the room's, not a look's: a stage never carries it`;
    if (typeof DEFAULT_SETTINGS[k as keyof VisualizerSettings] !== 'number') return `no number setting "${k}"`;
    const clean = sanitizePatch({ [k]: v })[k as keyof VisualizerSettings];
    if (clean !== v) {
      const r = PIN_RANGE.get(k);
      return `${k}: ${r ? `from ${r.min} to ${r.max}${r.step ? ` in steps of ${r.step}` : ''}` : 'out of its range'}, not ${v}`;
    }
    next[k] = v;
  }
  return Object.keys(next).length ? next as Partial<VisualizerSettings> : undefined;
}

/** How a stage ends with Pacing up, as the Sequences panel's Ending sets it. */
function paceOf(prev: StagePace | undefined, ending: string): StagePace | undefined {
  const moments = prev?.moments?.filter(m => m !== 'drain');
  const pace: StagePace = ending === 'pacing' ? { moments } : ending === 'lit' ? { endDark: false, moments }
    : { endDark: true, moments: ending === 'drain' ? [...(moments ?? MOMENTS_DEFAULT), 'drain'] : moments };
  return pace.moments || pace.endDark !== undefined ? pace : undefined;
}
const endingOf = (st: ShowStage) => (st.pace?.endDark === undefined ? 'pacing' : !st.pace.endDark ? 'lit' : st.pace.moments?.includes('drain') ? 'drain' : 'dark');

/** The guard's fields onto a stage: the stage, or why not. */
function applyStage(d: EditDoor, st: ShowStage, f: Record<string, unknown>): ShowStage | string {
  const next: ShowStage = { ...st };
  for (const k of ['name', 'seconds', 'advance', 'transition', 'paletteLead'] as const) if (f[k] !== undefined) (next as unknown as Record<string, unknown>)[k] = f[k];
  if (f.look !== undefined) {
    if (f.look === null) delete next.presetId;
    else { const l = findLook(d, String(f.look)); if (!l) return noLook(String(f.look)); next.presetId = l.id; }
  }
  if (f.paletteSize !== undefined) { if (f.paletteSize === null) delete next.paletteSize; else next.paletteSize = f.paletteSize as number; }
  if (f.macro !== undefined) { if (f.macro === null) delete next.macro; else next.macro = f.macro as boolean; }
  if (typeof f.ending === 'string') { const p = paceOf(st.pace, f.ending); if (p) next.pace = p; else delete next.pace; }
  if (f.settings !== undefined) {
    const s = stageSettings(st.settings, f.settings as Record<string, number | null>);
    if (typeof s === 'string') return s;
    if (s) next.settings = s; else delete next.settings;
  }
  return next;
}

/** A sequence as the assistant reads it: stages numbered from 1, a look by its name. */
function sequenceView(d: EditDoor, q: ShowSequence) {
  const looks = d.looks();
  return {
    id: q.id, name: q.name, loop: q.loop, builtIn: !!q.builtIn, song: q.song ? songLabel(q.song) : null,
    stages: q.stages.map((st, i) => ({
      n: i + 1, name: st.name, seconds: st.seconds, advance: st.advance, transition: st.transition,
      look: st.presetId ? looks.find(l => l.id === livePresetId(st.presetId!))?.name ?? st.presetId : null,
      paletteSize: st.paletteSize ?? null, paletteLead: st.paletteLead ?? 0, macro: st.macro ?? null, ending: endingOf(st), settings: st.settings ?? {},
    })),
  };
}

type Msg = Record<string, unknown>;

function editSet(d: EditDoor, m: Msg, p: ReturnType<typeof parts>, keep: (k: Kept) => void): EditAnswer {
  const list = p.set();
  const n = list.items.length;
  const at = (k: string): number | string => {
    const v = m[k];
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n ? v : n === 0 ? 'the set list is empty' : `item ${Number(v) + 1} of a set of ${n}`;
  };
  const write = (next: SetList, live = false, extra: Kept = {}) => {
    p.writeSet(next);
    if (live) d.setLive(null);
    keep({ set: [list, next], ...extra });
  };
  switch (m.op) {
    case 'add': {
      let item: SetItem;
      if (typeof m.look === 'string') {
        const l = findLook(d, m.look);
        if (!l) return no(noLook(m.look));
        item = { id: setItemId(), kind: l.user ? 'saved' : 'look', ref: l.id };
      } else {
        const q = findSequence(p.all(), String(m.sequence), p.selected());
        if (typeof q === 'string') return no(q);
        item = { id: setItemId(), kind: 'sequence', ref: q.id };
      }
      if (typeof m.name === 'string') item.name = m.name;
      const place = typeof m.at === 'number' ? Math.min(m.at, n) : n;
      write({ ...list, items: [...list.items.slice(0, place), item, ...list.items.slice(place)] });
      return ok({ n: place + 1 });
    }
    case 'remove': case 'move': case 'name-item': case 'link-song': case 'unlink-song': {
      const i = at('item');
      if (typeof i === 'string') return no(i);
      const it = list.items[i];
      if (m.op === 'remove') { write({ ...list, items: list.items.filter((_, j) => j !== i) }); return ok(); }
      if (m.op === 'move') {
        const to = at('to');
        if (typeof to === 'string') return no(to.replace('item', 'to: item'));
        write(moveItem(list, it.id, to - i));
        return ok({ n: to + 1 });
      }
      let next: SetItem;
      if (m.op === 'name-item') { const { name: _n, ...rest } = it; void _n; next = m.name ? { ...rest, name: String(m.name) } : rest; }
      else if (m.op === 'link-song') {
        const song = (m.song as SongRef | undefined) ?? d.song();
        if (!song) return no('no song is identified now: name one (title and artist)');
        next = { ...it, song };
      } else { const { song: _s, ...rest } = it; void _s; next = rest; }
      write({ ...list, items: list.items.map((x, j) => (j === i ? next : x)) });
      return ok();
    }
    case 'rename': write({ ...list, name: String(m.name) }); return ok();
    case 'new': write({ name: typeof m.name === 'string' ? m.name : 'New set', items: [], emptied: true }, true); return ok();
    case 'save': {
      const named = typeof m.name === 'string' ? { ...list, name: m.name } : list;
      const before = p.saved();
      const after = withSavedSet(before, named);
      if (named !== list) p.writeSet(named);
      p.writeSaved(after);
      keep({ saved: [before, after], ...(named !== list ? { set: [list, named] as [SetList, SetList] } : {}) });
      return ok({ kept: after.map(s => s.name) });
    }
    case 'open': case 'delete-saved': {
      const before = p.saved();
      const hit = before.find(s => s.name === m.name) ?? before.find(s => lc(s.name) === lc(String(m.name)));
      if (!hit) return no(`no kept set "${m.name}" (kept: ${before.map(s => s.name).join(', ') || 'none'})`);
      if (m.op === 'open') { write({ name: hit.name, items: hit.items.map(i => ({ ...i })) }, true); return ok({ items: hit.items.length }); }
      const after = before.filter(s => s !== hit);
      p.writeSaved(after);
      keep({ saved: [before, after] });
      return ok();
    }
    case 'import': {
      let read;
      try { read = readSetListFile(String(m.text), (k) => k in DEFAULT_SETTINGS); } catch (err) { return no(err instanceof Error ? err.message : String(err)); }
      let format: unknown;
      try { format = (JSON.parse(String(m.text)) as { format?: unknown }).format; } catch { /* read above */ }
      for (const pr of read.presets) d.upsertPreset(pr);
      const userBefore = p.user();
      let extra: Kept = {};
      if (read.sequences.length) {
        const ids = new Set(read.sequences.map(q => q.id));
        const userAfter = [...userBefore.filter(q => !ids.has(q.id)), ...read.sequences.map(q => ({ ...q, builtIn: false }))];
        p.writeUser(userAfter);
        extra = { user: [userBefore, userAfter] };
      }
      const whole = format === SETLIST_FORMAT || read.list.items.length > 1;
      write(whole ? read.list : { ...list, items: [...list.items, ...read.list.items] }, whole, extra);
      return ok({ set: whole ? read.list.name : list.name, items: whole ? read.list.items.length : n + read.list.items.length, warnings: read.warnings });
    }
    case 'export': {
      const text = writeSetListFile(list, d.presets(), p.all());
      if (text.length > EXPORT_MAX) return no('this set\'s file is too large to send: write it out with the set menu\'s Export');
      return ok({ file: `${list.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'set'}${SETLIST_FILE_EXT}`, text });
    }
    default: return no(`not a set list edit this build knows: ${String(m.op)}`);
  }
}

function editSequence(d: EditDoor, m: Msg, p: ReturnType<typeof parts>, keep: (k: Kept) => void): EditAnswer {
  const userBefore = p.user();
  const put = (userAfter: ShowSequence[], remove?: string) => { p.writeUser(userAfter, remove); keep({ user: [userBefore, userAfter] }); };
  const made = (q: ShowSequence) => { put([...userBefore.filter(x => x.id !== q.id), q]); p.choose(q.id); return ok({ id: q.id, name: q.name, stages: q.stages.length }); };
  if (m.op === 'new') {
    return made({
      id: newSeqId(), name: typeof m.name === 'string' ? m.name : 'New sequence', loop: true, builtIn: false,
      stages: [{ id: stageId(), name: 'Opening', seconds: 60, advance: 'time', transition: 8, paletteSize: 1, paletteLead: 0 }],
    });
  }
  if (m.op === 'import') {
    let file;
    try { file = parseSequenceFile(String(m.text)); } catch (err) { return no(err instanceof Error ? err.message : String(err)); }
    for (const pr of file.presets ?? []) d.upsertPreset(pr);
    return made(file.sequence);
  }
  const q = findSequence(p.all(), typeof m.sequence === 'string' ? m.sequence : undefined, p.selected());
  if (typeof q === 'string') return no(q);
  if (m.op === 'read') return ok(sequenceView(d, q));
  if (m.op === 'export') {
    const used = d.presets().filter(pr => q.stages.some(st => st.presetId === pr.id));
    const text = serializeSequence(q, used);
    return text.length > EXPORT_MAX ? no('this sequence\'s file is too large to send: export it from the Sequences panel') : ok({ file: sequenceFileName(q), text });
  }
  if (m.op === 'copy') return made(duplicateSequence(q, typeof m.name === 'string' ? m.name : undefined));
  if (q.builtIn) return no(`"${q.name}" is built in and stays as it shipped: copy it first (sequence_edit copy) and edit the copy`);
  const change = (next: ShowSequence) => { put(userBefore.map(x => (x.id === q.id ? next : x))); return ok(); };
  const n = q.stages.length;
  const stageAt = (k: string): number | string => {
    const v = m[k];
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n ? v : `${k === 'to' ? 'to: ' : ''}stage ${Number(v) + 1} of a sequence with ${n} stage${n === 1 ? '' : 's'}`;
  };
  switch (m.op) {
    case 'rename': return change({ ...q, name: String(m.name) });
    case 'loop': return change({ ...q, loop: m.on === true });
    case 'delete': put(userBefore.filter(x => x.id !== q.id), q.id); return ok();
    case 'bind-song': case 'unbind-song': {
      if (m.op === 'unbind-song') { const { song: _s, ...rest } = q; void _s; return change(rest); }
      const song = (m.song as SongRef | undefined) ?? d.song();
      return song ? change({ ...q, song }) : no('no song is identified now: name one (title and artist)');
    }
    case 'add-stage': {
      const st = applyStage(d, { id: stageId(), name: `Stage ${n + 1}`, seconds: 60, advance: 'time', transition: 8 }, (m.fields ?? {}) as Record<string, unknown>);
      if (typeof st === 'string') return no(st);
      const place = typeof m.at === 'number' ? Math.min(m.at, n) : n;
      change({ ...q, stages: [...q.stages.slice(0, place), st, ...q.stages.slice(place)] });
      return ok({ n: place + 1 });
    }
    case 'edit-stage': case 'remove-stage': case 'move-stage': {
      const i = stageAt('index');
      if (typeof i === 'string') return no(i);
      if (m.op === 'remove-stage') return n === 1 ? no('a sequence keeps one stage at least: delete the sequence instead') : change({ ...q, stages: q.stages.filter((_, j) => j !== i) });
      if (m.op === 'move-stage') {
        const to = stageAt('to');
        if (typeof to === 'string') return no(to);
        const stages = [...q.stages];
        const [st] = stages.splice(i, 1);
        stages.splice(to, 0, st);
        return change({ ...q, stages });
      }
      const st = applyStage(d, q.stages[i], (m.fields ?? {}) as Record<string, unknown>);
      return typeof st === 'string' ? no(st) : change({ ...q, stages: q.stages.map((x, j) => (j === i ? st : x)) });
    }
    default: return no(`not a sequence edit this build knows: ${String(m.op)}`);
  }
}

/** Undo's: the last edit's parts put back, if they are still as it left them. */
function restore(d: EditDoor, p: ReturnType<typeof parts>): EditAnswer {
  const k = kept.pop();
  if (k === undefined) return no('no edit to take back');
  if (k === null) return no('that edit was not made, so there is nothing of it to take back');
  if ((k.set && !same(p.set(), k.set[1])) || (k.saved && !same(p.saved(), k.saved[1])) || (k.user && !same(p.user(), k.user[1]))) {
    return no('the performer has changed it since; Undo leaves theirs');
  }
  if (k.set) { p.writeSet(k.set[0]); d.setLive(null); }
  if (k.saved) p.writeSaved(k.saved[0]);
  if (k.user) {
    p.writeUser(k.user[0]);
    if (!p.all().some(q => q.id === p.selected())) p.choose(p.all()[0]?.id ?? '');
  }
  return ok();
}

/**
 * The relay's `assistant-edit`: done (with what a read found), or why not.
 * Read as untrusted: the guard checked it, but a newer relay may send what
 * this build does not know, and the set may have changed since the guard's
 * last look at it. Every edit the guard lets through holds a place on Undo's
 * list here, a refused one too (as null), so the guard's next Undo is never
 * spent on an earlier edit.
 */
export function askEdit(m: Msg): EditAnswer {
  if (m.op === 'restore') return door ? restore(door, parts(door)) : no('the set list is not running');
  const reads = EDIT_READ_OPS.includes(String(m.op));
  let made: Kept | null = null;
  const keep = (k: Kept) => { made = k; };
  const r = !door ? no('the set list is not running')
    : m.of === 'set' ? editSet(door, m, parts(door), keep)
      : m.of === 'sequence' ? editSequence(door, m, parts(door), keep)
        : no('an edit of the set or a sequence');
  if (!reads) {
    kept.push(r.ok ? made : null);
    if (kept.length > EDIT_KEPT_MAX) kept.shift();
  }
  return r;
}
