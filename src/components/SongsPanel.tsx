import React, { useMemo, useRef, useState } from 'react';
import { ListMusic, Play, Square, Plus, Trash2, Download, FolderOpen, Save, ChevronUp, ChevronDown } from 'lucide-react';
import { Sheet, Toggle } from './ui';
import type { SongRef } from '../lib/songRef';
import {
  type ActionSet, type ActionWhat, type ActionWhen, type SectionKind, type SongAction, type SongLook, type SongShow,
  COMMON_ACTIONS, actionFrom, describeWhat, describeWhen, newId, parseFile, setFile,
} from '../lib/songShows';
import type { SongShowStatus } from '../hooks/useSongShows';

/**
 * Songs: a look for each song, and what happens while it plays.
 *
 * On the left the songs; on the right the one being set up: its look (a
 * built-in or one of your saved looks), and its actions, each a "when" and a
 * "what", added from a menu of common ones and then edited. A list that works
 * can be kept as an action set and laid on the next song. Songs and sets both
 * save to files.
 */

export interface LookChoice { kind: 'preset' | 'saved'; id: string; name: string }

interface SongsPanelProps {
  shows: SongShow[];
  onShows: (shows: SongShow[]) => void;
  /** Built-in sets first, then yours. */
  sets: ActionSet[];
  onSaveSet: (set: ActionSet) => void;
  onDeleteSet: (id: string) => void;
  looks: LookChoice[];
  /** The song playing now, when the track has been identified. */
  currentSong: SongRef | null;
  follow: boolean;
  onFollow: (on: boolean) => void;
  status: SongShowStatus;
  onRun: (showId: string) => void;
  onStop: () => void;
  onOpenSequences: () => void;
  /** The songs as a file, with the saved looks they use. */
  exportShows: () => string;
  /** Saved looks that arrived in a songs file. */
  onImportLooks: (looks: unknown[]) => void;
  onClose: () => void;
}

const inputCls = 'bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-white/40';
const smallBtn = 'flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[12px] font-medium disabled:opacity-30';

const SECTIONS: SectionKind[] = ['any', 'intro', 'verse', 'chorus', 'bridge', 'drop', 'outro'];
const WHEN_KINDS: [ActionWhen['at'], string][] = [
  ['start', 'On the first note'], ['time', 'At a time'], ['section', 'At a section'], ['kick', 'On kicks'], ['before-end', 'Before the end'],
];
const WHAT_KINDS: [ActionWhat['do'], string][] = [
  ['title', 'Pour the title'], ['burst', 'Burst'], ['zoom', 'Zoom'], ['kaleidoscope', 'Kaleidoscope'], ['dyes', 'Next dyes'],
  ['look', 'Switch look'], ['drain', 'Drain'], ['clear', 'Clear'], ['seed', 'Lay the look again'],
  ['blackout', 'Fade to black'], ['lights-up', 'Lights up'], ['signoff', 'Pour the name'],
];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const parseTime = (v: string): number | null => {
  const m = /^\s*(\d+)(?::(\d{1,2}))?\s*$/.exec(v);
  if (!m) return null;
  return m[2] !== undefined ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]);
};

function defaultWhen(at: ActionWhen['at']): ActionWhen {
  switch (at) {
    case 'start': return { at: 'start' };
    case 'time': return { at: 'time', sec: 30 };
    case 'section': return { at: 'section', section: 'chorus' };
    case 'kick': return { at: 'kick', every: 4 };
    case 'before-end': return { at: 'before-end', sec: 8 };
  }
}

function defaultWhat(d: ActionWhat['do'], looks: LookChoice[]): ActionWhat {
  switch (d) {
    case 'look': { const l = looks[0]; return { do: 'look', look: { kind: l?.kind ?? 'preset', id: l?.id ?? 'classic', name: l?.name }, fade: 4 }; }
    case 'zoom': return { do: 'zoom', zoom: 4, over: 3 };
    case 'kaleidoscope': return { do: 'kaleidoscope', folds: 6 };
    case 'blackout': return { do: 'blackout', over: 4 };
    case 'lights-up': return { do: 'lights-up', over: 2 };
    case 'set': return { do: 'set', key: 'globalSpeed', value: 0.03, over: 2 };
    default: return { do: d } as ActionWhat;
  }
}

const lookKey = (l: { kind: string; id: string }) => `${l.kind}:${l.id}`;

export const SongsPanel: React.FC<SongsPanelProps> = ({
  shows, onShows, sets, onSaveSet, onDeleteSet, looks, currentSong, follow, onFollow, status, onRun, onStop, onOpenSequences, exportShows, onImportLooks, onClose,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(shows[0]?.id ?? null);
  const selected = useMemo(() => shows.find((s) => s.id === selectedId) ?? null, [shows, selectedId]);
  const [setName, setSetName] = useState('');
  const [chosenSet, setChosenSet] = useState<string>(sets[0]?.id ?? '');
  const [fileError, setFileError] = useState<string | null>(null);
  const songsFile = useRef<HTMLInputElement>(null);
  const setsFileRef = useRef<HTMLInputElement>(null);
  const lookName = (l: SongLook) => looks.find((c) => c.kind === l.kind && c.id === l.id)?.name ?? l.name ?? l.id;

  const update = (id: string, mutate: (s: SongShow) => SongShow) => onShows(shows.map((s) => (s.id === id ? mutate(s) : s)));
  const updateAction = (i: number, patch: Partial<SongAction>) =>
    selected && update(selected.id, (s) => ({ ...s, actions: s.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  const addSong = (song: SongRef) => {
    const look = looks[0];
    const show: SongShow = { id: newId('song'), song, look: { kind: look?.kind ?? 'preset', id: look?.id ?? 'classic', name: look?.name }, actions: [] };
    onShows([...shows, show]);
    setSelectedId(show.id);
  };
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');

  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const readFile = async (file: File) => {
    setFileError(null);
    try {
      const parsed = parseFile(await file.text());
      if (parsed.looks?.length) onImportLooks(parsed.looks);
      if (parsed.shows) {
        // A song already here keeps its place; a new one joins the list.
        const byLabel = new Map<string, SongShow>(shows.map((s) => [`${s.song.title}|${s.song.artist}`.toLowerCase(), s] as [string, SongShow]));
        const merged = [...shows];
        for (const s of parsed.shows) {
          const k = `${s.song.title}|${s.song.artist}`.toLowerCase();
          const at = merged.findIndex((m) => m.id === byLabel.get(k)?.id);
          if (at >= 0) merged[at] = { ...s, id: merged[at].id }; else merged.push({ ...s, id: newId('song') });
        }
        onShows(merged);
      }
      if (parsed.set) onSaveSet(parsed.set);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : String(e));
    }
  };

  const running = status.showId !== null;
  const set = sets.find((s) => s.id === chosenSet) ?? null;

  return (
    <Sheet title={<><ListMusic size={16} /> Songs</>} onClose={onClose} width={960} height={680} testId="songs-panel">
      <div className="flex min-h-0 flex-1">
        {/* ── The songs ─────────────────────────────────────────── */}
        <div className="flex w-[300px] shrink-0 flex-col border-r border-white/10 p-4">
          <p className="mb-3 text-[10px] leading-relaxed opacity-50">
            A look for each song and what happens while it plays. With Follow on, a song's show starts when the song is recognised.
          </p>
          <div className="mb-3">
            <Toggle label="Follow songs" on={follow} onChange={onFollow} testId="songs-follow" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide" data-testid="songs-list">
            {shows.length === 0 && <p className="text-[11px] opacity-40">No songs yet.</p>}
            {shows.map((s) => {
              const live = status.showId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`mb-1.5 w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    selectedId === s.id ? 'border-white/40 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                  data-testid={`songs-item-${s.id}`}
                >
                  <span className="block truncate text-xs font-semibold">{live ? '▶ ' : ''}{s.song.title}</span>
                  <span className="block truncate text-[10px] opacity-50">{s.song.artist} · {lookName(s.look)} · {s.actions.length} action{s.actions.length === 1 ? '' : 's'}</span>
                </button>
              );
            })}
          </div>
          {currentSong && !shows.some((s) => s.song.title.toLowerCase() === currentSong.title.toLowerCase() && s.song.artist.toLowerCase() === currentSong.artist.toLowerCase()) && (
            <button onClick={() => addSong(currentSong)} className={`${smallBtn} mt-2 w-full`} data-testid="songs-add-current">
              <Plus size={12} /> {currentSong.title}, playing now
            </button>
          )}
          <div className="mt-2 flex gap-1.5">
            <input className={`${inputCls} min-w-0 flex-1`} placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} data-testid="songs-new-title" />
            <input className={`${inputCls} min-w-0 flex-1`} placeholder="Artist" value={newArtist} onChange={(e) => setNewArtist(e.target.value)} data-testid="songs-new-artist" />
          </div>
          <button
            disabled={!newTitle.trim() || !newArtist.trim()}
            onClick={() => { addSong({ title: newTitle.trim(), artist: newArtist.trim() }); setNewTitle(''); setNewArtist(''); }}
            className={`${smallBtn} mt-1.5 w-full`} data-testid="songs-add"
          ><Plus size={12} /> Add a song</button>
          <div className="mt-3 flex gap-1.5">
            <button onClick={() => download('chromaglass-songs.json', exportShows())} disabled={!shows.length} className={`${smallBtn} flex-1`} data-testid="songs-export"><Download size={12} /> Save file</button>
            <button onClick={() => songsFile.current?.click()} className={`${smallBtn} flex-1`} data-testid="songs-import"><FolderOpen size={12} /> Load file</button>
            <input ref={songsFile} type="file" accept=".json,application/json" className="hidden" data-testid="songs-file-input"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }} />
          </div>
          {fileError && <p className="mt-2 text-[10px] text-red-300" data-testid="songs-file-error">{fileError}</p>}
          <button onClick={onOpenSequences} className="mt-3 text-left text-[10px] underline opacity-40 hover:opacity-70" data-testid="songs-open-sequences">
            Stage sequences (the old sequencer)…
          </button>
        </div>

        {/* ── The song being set up ─────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide p-5">
          {!selected ? (
            <p className="text-[12px] opacity-40">Add a song, or pick one from the list.</p>
          ) : (
            <>
              <div className="mb-4 flex items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] font-medium opacity-60">Title</span>
                  <input className={inputCls} value={selected.song.title} data-testid="songs-title"
                    onChange={(e) => update(selected.id, (s) => ({ ...s, song: { ...s.song, title: e.target.value } }))} />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] font-medium opacity-60">Artist</span>
                  <input className={inputCls} value={selected.song.artist} data-testid="songs-artist"
                    onChange={(e) => update(selected.id, (s) => ({ ...s, song: { ...s.song, artist: e.target.value } }))} />
                </label>
                <label className="flex w-20 flex-col gap-1">
                  <span className="text-[11px] font-medium opacity-60">Length</span>
                  <input className={inputCls} placeholder="m:ss" defaultValue={selected.song.durationSec ? mmss(selected.song.durationSec) : ''} key={`${selected.id}-len`} data-testid="songs-length"
                    onBlur={(e) => { const t = parseTime(e.target.value); update(selected.id, (s) => ({ ...s, song: { ...s.song, durationSec: t ?? undefined } })); }} />
                </label>
                <button onClick={() => { onShows(shows.filter((s) => s.id !== selected.id)); setSelectedId(null); }} className={smallBtn} title="Remove this song" data-testid="songs-remove"><Trash2 size={12} /></button>
              </div>

              <label className="mb-4 flex flex-col gap-1">
                <span className="text-[11px] font-medium opacity-60">Look</span>
                <select className={inputCls} value={lookKey(selected.look)} data-testid="songs-look"
                  onChange={(e) => { const c = looks.find((l) => lookKey(l) === e.target.value); if (c) update(selected.id, (s) => ({ ...s, look: { kind: c.kind, id: c.id, name: c.name } })); }}>
                  <optgroup label="Built-in looks">
                    {looks.filter((l) => l.kind === 'preset').map((l) => <option key={lookKey(l)} value={lookKey(l)}>{l.name}</option>)}
                  </optgroup>
                  {looks.some((l) => l.kind === 'saved') && (
                    <optgroup label="Your saved looks">
                      {looks.filter((l) => l.kind === 'saved').map((l) => <option key={lookKey(l)} value={lookKey(l)}>{l.name}</option>)}
                    </optgroup>
                  )}
                  {!looks.some((l) => lookKey(l) === lookKey(selected.look)) && <option value={lookKey(selected.look)}>{selected.look.name ?? selected.look.id} (missing)</option>}
                </select>
              </label>

              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-medium">What happens</span>
                <div className="flex gap-1.5">
                  {running && status.showId === selected.id ? (
                    <button onClick={onStop} className={smallBtn} data-testid="songs-stop"><Square size={12} /> Stop</button>
                  ) : (
                    <button onClick={() => onRun(selected.id)} className={smallBtn} title="Start this song's show now, with its own clock" data-testid="songs-run"><Play size={12} /> Run now</button>
                  )}
                </div>
              </div>
              {running && (
                <p className="mb-3 text-[10px] opacity-60" data-testid="songs-status">
                  ▶ {status.song} · {mmss(status.t)}{status.manual ? ' (by hand)' : ''}{status.last ? ` · last: ${status.last}` : ''}
                </p>
              )}

              <div className="mb-3 flex flex-col gap-1.5" data-testid="songs-actions">
                {selected.actions.length === 0 && <p className="text-[11px] opacity-40">Nothing yet: the look plays on its own. Add actions below, or load a set.</p>}
                {selected.actions.map((a, i) => (
                  <ActionRow
                    key={a.id} action={a} looks={looks} index={i} count={selected.actions.length}
                    onChange={(patch) => updateAction(i, patch)}
                    onRemove={() => update(selected.id, (s) => ({ ...s, actions: s.actions.filter((_, j) => j !== i) }))}
                    onMove={(d) => update(selected.id, (s) => {
                      const j = i + d; if (j < 0 || j >= s.actions.length) return s;
                      const next = [...s.actions]; [next[i], next[j]] = [next[j], next[i]]; return { ...s, actions: next };
                    })}
                    lookName={lookName}
                  />
                ))}
              </div>

              <select className={`${inputCls} mb-5 w-full`} value="" data-testid="songs-add-action"
                onChange={(e) => {
                  const c = COMMON_ACTIONS[Number(e.target.value)];
                  if (c) update(selected.id, (s) => ({ ...s, actions: [...s.actions, actionFrom(c)] }));
                }}>
                <option value="">+ Add an action…</option>
                {COMMON_ACTIONS.map((c, i) => <option key={c.label} value={i}>{c.label}</option>)}
              </select>

              {/* ── Action sets ─────────────────────────────────── */}
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <span className="mb-2 block text-[12px] font-medium">Action sets</span>
                <div className="mb-2 flex gap-1.5">
                  <select className={`${inputCls} min-w-0 flex-1`} value={chosenSet} onChange={(e) => setChosenSet(e.target.value)} data-testid="songs-set-select">
                    {sets.map((s) => <option key={s.id} value={s.id}>{s.name}{s.builtIn ? '' : ' ✎'}</option>)}
                  </select>
                  <button disabled={!set} className={smallBtn} data-testid="songs-set-replace" title="Use this set's actions instead of the song's"
                    onClick={() => set && update(selected.id, (s) => ({ ...s, actions: set.actions.map(actionFrom) }))}>Use</button>
                  <button disabled={!set} className={smallBtn} data-testid="songs-set-append" title="Add this set's actions to the song's"
                    onClick={() => set && update(selected.id, (s) => ({ ...s, actions: [...s.actions, ...set.actions.map(actionFrom)] }))}>Add</button>
                  <button disabled={!set || set.builtIn} className={smallBtn} title="Save this set as a file" data-testid="songs-set-export"
                    onClick={() => set && download(`${set.name.replace(/[^\w-]+/g, '-').toLowerCase()}.json`, setFile(set))}><Download size={12} /></button>
                  <button disabled={!set || set.builtIn} className={smallBtn} title="Delete this set" data-testid="songs-set-delete"
                    onClick={() => { if (set && !set.builtIn) { onDeleteSet(set.id); setChosenSet(sets[0]?.id ?? ''); } }}><Trash2 size={12} /></button>
                </div>
                {set?.description && <p className="mb-2 text-[10px] opacity-50">{set.description}</p>}
                <div className="flex gap-1.5">
                  <input className={`${inputCls} min-w-0 flex-1`} placeholder="Name, to keep this song's actions as a set" value={setName} onChange={(e) => setSetName(e.target.value)} data-testid="songs-set-name" />
                  <button disabled={!setName.trim() || selected.actions.length === 0} className={smallBtn} data-testid="songs-set-save"
                    onClick={() => { const s: ActionSet = { id: newId('set'), name: setName.trim(), actions: selected.actions.map(actionFrom) }; onSaveSet(s); setChosenSet(s.id); setSetName(''); }}>
                    <Save size={12} /> Save set</button>
                  <button onClick={() => setsFileRef.current?.click()} className={smallBtn} title="Load an action set file" data-testid="songs-set-import"><FolderOpen size={12} /></button>
                  <input ref={setsFileRef} type="file" accept=".json,application/json" className="hidden" data-testid="songs-set-file-input"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
};

/** One action: when, what, and their numbers, edited in place. */
function ActionRow({ action, looks, index, count, onChange, onRemove, onMove, lookName }: {
  key?: string | number;
  action: SongAction; looks: LookChoice[]; index: number; count: number;
  onChange: (patch: Partial<SongAction>) => void; onRemove: () => void; onMove: (d: -1 | 1) => void;
  lookName: (l: SongLook) => string;
}) {
  const w = action.when, a = action.what;
  const num = (v: string, lo: number, hi: number, dflt: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5" data-testid={`songs-action-${index}`}
      title={`${describeWhen(w)}: ${describeWhat(a, lookName)}`}>
      <select className={inputCls} value={w.at} onChange={(e) => onChange({ when: defaultWhen(e.target.value as ActionWhen['at']) })} data-testid={`songs-action-${index}-when`}>
        {WHEN_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {w.at === 'time' && (
        <input className={`${inputCls} w-16`} defaultValue={mmss(w.sec)} key={`${action.id}-t`}
          onBlur={(e) => { const t = parseTime(e.target.value); if (t !== null) onChange({ when: { at: 'time', sec: t } }); }} />
      )}
      {w.at === 'before-end' && (
        <input className={`${inputCls} w-14`} type="number" min={0} max={600} value={w.sec}
          onChange={(e) => onChange({ when: { at: 'before-end', sec: num(e.target.value, 0, 600, 8) } })} />
      )}
      {w.at === 'section' && (
        <>
          <select className={inputCls} value={w.nth ?? 0} onChange={(e) => onChange({ when: { ...w, nth: Number(e.target.value) || undefined } })}>
            <option value={0}>every</option><option value={1}>the 1st</option><option value={2}>the 2nd</option><option value={3}>the 3rd</option><option value={4}>the 4th</option>
          </select>
          <select className={inputCls} value={w.section} onChange={(e) => onChange({ when: { ...w, section: e.target.value as SectionKind } })}>
            {SECTIONS.map((s) => <option key={s} value={s}>{s === 'any' ? 'section' : s}</option>)}
          </select>
        </>
      )}
      {w.at === 'kick' && (
        <>
          <span className="text-[11px] opacity-50">every</span>
          <input className={`${inputCls} w-12`} type="number" min={1} max={64} value={w.every}
            onChange={(e) => onChange({ when: { at: 'kick', every: Math.round(num(e.target.value, 1, 64, 4)) } })} />
        </>
      )}
      <span className="text-[11px] opacity-40">→</span>
      <select className={inputCls} value={a.do} onChange={(e) => onChange({ what: defaultWhat(e.target.value as ActionWhat['do'], looks) })} data-testid={`songs-action-${index}-what`}>
        {WHAT_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        {a.do === 'set' && <option value="set">{describeWhat(a)}</option>}
      </select>
      {a.do === 'look' && (
        <>
          <select className={`${inputCls} max-w-[160px]`} value={lookKey(a.look)}
            onChange={(e) => { const c = looks.find((l) => lookKey(l) === e.target.value); if (c) onChange({ what: { ...a, look: { kind: c.kind, id: c.id, name: c.name } } }); }}>
            {looks.map((l) => <option key={lookKey(l)} value={lookKey(l)}>{l.name}</option>)}
          </select>
          <span className="text-[11px] opacity-50">over</span>
          <input className={`${inputCls} w-12`} type="number" min={0} max={60} value={a.fade} onChange={(e) => onChange({ what: { ...a, fade: num(e.target.value, 0, 60, 4) } })} />
          <span className="text-[11px] opacity-50">s</span>
        </>
      )}
      {a.do === 'zoom' && (
        <>
          <span className="text-[11px] opacity-50">to</span>
          <input className={`${inputCls} w-12`} type="number" min={1} max={16} step={0.5} value={a.zoom} onChange={(e) => onChange({ what: { ...a, zoom: num(e.target.value, 1, 16, 4) } })} />
          <span className="text-[11px] opacity-50">× over</span>
          <input className={`${inputCls} w-12`} type="number" min={0} max={30} value={a.over} onChange={(e) => onChange({ what: { ...a, over: num(e.target.value, 0, 30, 3) } })} />
          <span className="text-[11px] opacity-50">s</span>
        </>
      )}
      {a.do === 'kaleidoscope' && (
        <select className={inputCls} value={a.folds} onChange={(e) => onChange({ what: { ...a, folds: Number(e.target.value) } })}>
          <option value={0}>off</option><option value={2}>2 folds</option><option value={4}>4 folds</option><option value={6}>6 folds</option><option value={8}>8 folds</option>
        </select>
      )}
      {(a.do === 'blackout' || a.do === 'lights-up') && (
        <>
          <span className="text-[11px] opacity-50">over</span>
          <input className={`${inputCls} w-12`} type="number" min={0} max={30} value={a.over} onChange={(e) => onChange({ what: { ...a, over: num(e.target.value, 0, 30, 4) } })} />
          <span className="text-[11px] opacity-50">s</span>
        </>
      )}
      <span className="ml-auto flex gap-1">
        <button disabled={index === 0} onClick={() => onMove(-1)} className="rounded p-1 opacity-50 hover:opacity-100 disabled:opacity-20" title="Earlier in the list"><ChevronUp size={12} /></button>
        <button disabled={index === count - 1} onClick={() => onMove(1)} className="rounded p-1 opacity-50 hover:opacity-100 disabled:opacity-20" title="Later in the list"><ChevronDown size={12} /></button>
        <button onClick={onRemove} className="rounded p-1 opacity-50 hover:opacity-100" title="Remove" data-testid={`songs-action-${index}-remove`}><Trash2 size={12} /></button>
      </span>
    </div>
  );
}
