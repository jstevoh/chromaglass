/**
 * Your liquids: make one, load one from a file, save them to a file.
 *
 * The designer edits the same numbers the plate acts on (lib/liquidFile.ts),
 * and says underneath how the liquid will meet every other bottle on the
 * shelf, from the same rules, so what it promises is what the plate does.
 */
import { useMemo, useRef, useState } from 'react';
import { Download, FlaskConical, Plus, Trash2, Upload } from 'lucide-react';
import type { LiquidBehaviour, LiquidType } from '../types';
import {
  BEHAVIOUR_PROPERTIES, DROP_RANGES, freshId, isCustomLiquid, meets, readLiquidFile, writeLiquidFile,
} from '../lib/liquidFile';

export interface LiquidDesignerProps {
  shelf: LiquidType[];
  onShelve: (liquids: LiquidType[]) => void;
  onRemove: (id: string) => void;
  /** Pick a bottle, as the shelf's buttons do. */
  onPick?: (id: string) => void;
}

const BLANK: LiquidType = {
  id: '', name: '', color: '#6ad1ff', description: '',
  injectRadius: 3, injectAmount: 0.8, heatAmount: 0, behaviour: {},
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileName = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'liquids'}.liquids.json`;

function Row({ label, hint, value, min, max, step, onChange, fmt }: {
  label: string; hint: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label className="block mb-2" title={hint}>
      <div className="flex justify-between text-[12px] opacity-70">
        <span>{label}</span>
        <span className="tabular-nums opacity-70">{fmt ? fmt(value) : value.toFixed(2)}</span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value}
        aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="text-[11px] opacity-35 leading-snug">{hint}</div>
    </label>
  );
}

export function LiquidDesigner({ shelf, onShelve, onRemove, onPick }: LiquidDesignerProps) {
  const [draft, setDraft] = useState<LiquidType | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; lines: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const custom = shelf.filter(isCustomLiquid);

  const startFrom = (base?: LiquidType) => {
    setNotice(null);
    setDraft(base
      ? { ...base, id: '', name: `${base.name} (mine)`, behaviour: { ...(base.behaviour ?? {}) } }
      : { ...BLANK, behaviour: {} });
  };
  const edit = (l: LiquidType) => { setNotice(null); setDraft({ ...l, behaviour: { ...(l.behaviour ?? {}) } }); };
  const setB = (key: keyof LiquidBehaviour, v: number) =>
    setDraft((d) => (d ? { ...d, behaviour: { ...(d.behaviour ?? {}), [key]: v } } : d));

  /** The draft as it will be shelved: a fresh id if new, and no behaviour at all if every property is zero. */
  const finished = useMemo(() => {
    if (!draft) return null;
    const name = draft.name.trim() || 'Untitled liquid';
    const taken = new Set(shelf.map((l) => l.id));
    const id = draft.id && isCustomLiquid(draft) ? draft.id : freshId(name, taken);
    const b = Object.fromEntries(Object.entries(draft.behaviour ?? {}).filter(([, v]) => typeof v === 'number' && v !== 0)) as LiquidBehaviour;
    return { ...draft, id, name, behaviour: Object.keys(b).length ? b : undefined } as LiquidType;
  }, [draft, shelf]);

  const others = useMemo(() => (finished ? shelf.filter((l) => l.id !== finished.id) : []), [finished, shelf]);

  const save = () => {
    if (!finished) return;
    onShelve([finished]);
    onPick?.(finished.id);
    setNotice({ tone: 'ok', lines: [`${finished.name} is on the shelf${onPick ? ' and in your hand' : ''}.`] });
    setDraft(null);
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const made: LiquidType[] = [];
    const lines: string[] = [];
    let tone: 'ok' | 'warn' | 'error' = 'ok';
    let running = shelf;
    for (const f of Array.from(files)) {
      try {
        if (f.size > 512 * 1024) throw new Error('larger than a liquids file can be (512 KB)');
        const { liquids, warnings, replaces } = readLiquidFile(await f.text(), running);
        running = [...running.filter((l) => !liquids.some((m) => m.id === l.id)), ...liquids];
        made.push(...liquids);
        lines.push(`${f.name}: ${liquids.map((l) => l.name).join(', ')}${replaces.length ? ` (${replaces.length} updated)` : ''}`);
        if (warnings.length) { tone = 'warn'; lines.push(...warnings.map((w) => `  ${w}`)); }
      } catch (e) {
        tone = 'error';
        lines.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    if (made.length) onShelve(made);
    setNotice({ tone: made.length ? tone : 'error', lines });
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div data-testid="liquid-designer">
      <p className="text-[12px] opacity-50 mb-3 leading-snug">
        Make a liquid by what it is — how heavy, how oily, what it does to the surface — and the plate works out how it
        meets every other bottle. Saved in this browser and on the shelf; a <code>.liquids.json</code> file takes them
        to another machine or another person.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <button type="button" onClick={() => startFrom()} className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-[12px] flex items-center gap-1.5">
          <Plus size={12} /> Design a liquid
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-[12px] flex items-center gap-1.5">
          <Upload size={12} /> Load a file…
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden
          data-testid="liquid-file" onChange={(e) => { void importFiles(e.target.files); }} />
        {custom.length > 0 && (
          <button type="button" onClick={() => download('my.liquids.json', writeLiquidFile(custom))}
            className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-[12px] flex items-center gap-1.5">
            <Download size={12} /> Save all to a file
          </button>
        )}
      </div>

      {notice && (
        <div role="status" className={`text-[12px] rounded-md px-3 py-2 mb-3 whitespace-pre-wrap ${
          notice.tone === 'error' ? 'bg-red-500/15 text-red-200' : notice.tone === 'warn' ? 'bg-amber-500/15 text-amber-100' : 'bg-emerald-500/15 text-emerald-100'}`}>
          {notice.lines.join('\n')}
        </div>
      )}

      {custom.length > 0 ? (
        <ul className="mb-4 divide-y divide-white/5">
          {custom.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-1.5">
              <span className="w-4 h-4 rounded-full border border-white/20 shrink-0" style={{ background: l.color }} />
              <button type="button" className="text-left flex-1 min-w-0" onClick={() => onPick?.(l.id)} title="Pick this bottle">
                <div className="text-[13px] truncate">{l.name}</div>
                {l.description && <div className="text-[11px] opacity-40 truncate">{l.description}</div>}
              </button>
              <button type="button" className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10" onClick={() => edit(l)}>Edit</button>
              <button type="button" aria-label={`Save ${l.name} to a file`} className="p-1.5 rounded bg-white/5 hover:bg-white/10"
                onClick={() => download(fileName(l.name), writeLiquidFile([l]))}><Download size={12} /></button>
              <button type="button" aria-label={`Remove ${l.name}`} className="p-1.5 rounded bg-white/5 hover:bg-red-500/20"
                onClick={() => { if (window.confirm(`Take ${l.name} off the shelf?`)) onRemove(l.id); }}><Trash2 size={12} /></button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-[12px] opacity-35 mb-4">None yet.</div>
      )}

      {draft && finished && (
        <div className="rounded-lg border border-white/10 p-3 mb-2" data-testid="liquid-draft">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical size={14} className="opacity-50" />
            <span className="text-[12px] uppercase tracking-[0.2em] opacity-40">{draft.id ? 'Edit liquid' : 'New liquid'}</span>
            {!draft.id && (
              <select className="ml-auto bg-white/5 rounded px-2 py-1 text-[12px]" value="" aria-label="Start from a bottle"
                onChange={(e) => { const b = shelf.find((l) => l.id === e.target.value); if (b) startFrom(b); }}>
                <option value="">Start from…</option>
                {shelf.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
          </div>

          <div className="flex gap-2 mb-2">
            <input type="color" value={draft.color} aria-label="Colour" className="w-10 h-9 bg-transparent rounded"
              onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
            <input type="text" value={draft.name} placeholder="Name" maxLength={40} aria-label="Name"
              className="flex-1 bg-white/5 rounded px-2 text-[13px]" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <input type="text" value={draft.description} placeholder="What it is, in a line" maxLength={200} aria-label="Description"
            className="w-full bg-white/5 rounded px-2 py-1.5 text-[12px] mb-3" onChange={(e) => setDraft({ ...draft, description: e.target.value })} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] opacity-30 mb-2">The drop</div>
              <Row label="Drop size" {...DROP_RANGES.size} value={draft.injectRadius} onChange={(v) => setDraft({ ...draft, injectRadius: v })} fmt={(v) => v.toFixed(1)} />
              <Row label="Colour amount" {...DROP_RANGES.amount} value={draft.injectAmount} onChange={(v) => setDraft({ ...draft, injectAmount: v })} />
              <Row label="Heat" {...DROP_RANGES.heat} value={draft.heatAmount} onChange={(v) => setDraft({ ...draft, heatAmount: v })} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] opacity-30 mb-2">What it is</div>
              {BEHAVIOUR_PROPERTIES.map((p) => (
                <Row key={p.key} label={p.label} hint={p.hint} min={p.min} max={p.max} step={p.step}
                  value={draft.behaviour?.[p.key] ?? 0} onChange={(v) => setB(p.key, v)} />
              ))}
            </div>
          </div>

          <div className="text-[11px] uppercase tracking-[0.2em] opacity-30 mt-2 mb-1">How it meets the others</div>
          <div className="max-h-56 overflow-y-auto mb-3" data-testid="liquid-meets">
            <table className="w-full text-[12px]">
              <tbody>
                {others.map((o) => {
                  const m = meets(finished, o);
                  return (
                    <tr key={o.id} className="border-t border-white/5 align-top">
                      <td className="py-1 pr-2 whitespace-nowrap">
                        <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: o.color }} />{o.name}
                      </td>
                      <td className={`py-1 pr-2 whitespace-nowrap ${m.mixing === 'blends' ? 'text-emerald-300/80' : m.mixing === 'soft edge' ? 'text-amber-200/80' : 'text-sky-300/80'}`}>{m.mixing}</td>
                      <td className="py-1 opacity-50">{m.notes.join('; ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} className="px-3 py-1.5 rounded-md bg-emerald-500/25 hover:bg-emerald-500/35 text-[12px]">
              Put it on the shelf
            </button>
            <button type="button" onClick={() => download(fileName(finished.name), writeLiquidFile([finished]))}
              className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-[12px] flex items-center gap-1.5">
              <Download size={12} /> Save to a file
            </button>
            <button type="button" onClick={() => setDraft(null)} className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-[12px] ml-auto">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
