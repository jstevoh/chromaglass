import { useRef, useState } from 'react';
import { Button, Segmented, Sheet } from '../ui';

export interface SetSource {
  id: string;
  name: string;
  /** A two-colour smear for a look; none for a sequence. */
  swatch?: string;
  /** A second line: what it is, or the song it belongs to. */
  detail?: string;
}

type Tab = 'look' | 'saved' | 'sequence' | 'file';

/**
 * Adding to the set: a look that ships, a look you saved, a stage sequence,
 * or a file.
 *
 * Each click adds one item to the end of the set and leaves the sheet open,
 * because a set is built several items at a time. A file can be a whole set
 * list (it replaces the set, after saying what it holds), a saved look or a
 * sequence (each added as one item); `lib/setList.ts` says what a set list
 * file may carry, and anything it could not use is listed here rather than
 * dropped silently.
 */
export function AddToSetSheet({ looks, saved, sequences, count, onAdd, onImport, onClose }: {
  looks: SetSource[];
  saved: SetSource[];
  sequences: SetSource[];
  /** How many items the set has, to say where the next one goes. */
  count: number;
  onAdd: (kind: 'look' | 'saved' | 'sequence', id: string) => void;
  /** Read a file: a whole set, or one item. Resolves to what it said, or throws why it could not. */
  onImport: (file: File) => Promise<{ summary: string; warnings: string[] }>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('look');
  const [filter, setFilter] = useState('');
  const [added, setAdded] = useState<string | null>(null);
  const [fileNote, setFileNote] = useState<{ ok: boolean; text: string; warnings: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = tab === 'look' ? looks : tab === 'saved' ? saved : tab === 'sequence' ? sequences : [];
  const q = filter.trim().toLowerCase();
  const shown = q ? list.filter(s => s.name.toLowerCase().includes(q) || (s.detail ?? '').toLowerCase().includes(q)) : list;

  const add = (s: SetSource) => {
    if (tab === 'file') return;
    onAdd(tab, s.id);
    setAdded(s.name);
  };

  const readFile = async (file: File) => {
    try {
      const r = await onImport(file);
      setFileNote({ ok: true, text: r.summary, warnings: r.warnings });
    } catch (e) {
      setFileNote({ ok: false, text: (e as Error).message, warnings: [] });
    }
  };

  return (
    <Sheet title="Add to the set" onClose={onClose} width={560} height={560} testId="add-to-set">
      <div className="flex h-full flex-col gap-3 p-5">
        <Segmented
          value={tab}
          options={[['look', 'Looks'], ['saved', 'Saved'], ['sequence', 'Sequences'], ['file', 'File']] as const}
          onChange={v => { setTab(v as Tab); setFilter(''); }}
          height={32}
          testId="add-to-set-tab"
        />
        {tab !== 'file' ? (
          <>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Find"
              className="h-9 w-full rounded-md border border-border-strong bg-elevated px-3 text-[13px] text-text outline-none placeholder:text-faint focus:border-accent"
              data-testid="add-to-set-filter"
            />
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide" data-testid={`add-to-set-list-${tab}`}>
              {shown.length === 0 && (
                <p className="px-1 py-6 text-center text-[13px] text-muted">
                  {tab === 'saved' ? 'No saved looks yet. Save one with ⌘S.' : tab === 'sequence' ? 'No sequences yet.' : 'Nothing matches.'}
                </p>
              )}
              {shown.map(s => (
                <button
                  key={s.id}
                  onClick={() => add(s)}
                  className="flex h-11 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-hover"
                  data-testid={`add-to-set-${tab}-${s.id}`}
                >
                  <span className="h-6 w-6 shrink-0 rounded-sm" style={{ background: s.swatch ?? 'var(--color-elevated)' }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-text">{s.name}</span>
                    {s.detail && <span className="block truncate text-[12px] text-muted">{s.detail}</span>}
                  </span>
                  <span className="text-[12px] text-faint">Add</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <p className="text-[13px] text-text-2">
              A set list file (<span className="font-mono text-[12px]">.chromaglass-setlist.json</span>) replaces this set with the one it holds.
              A saved look or a sequence file is added to the end as one item.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }}
              data-testid="add-to-set-file-input"
            />
            <Button height={40} onClick={() => fileRef.current?.click()} testId="add-to-set-file">Choose a file…</Button>
            {fileNote && (
              <div className={`rounded-md border px-3 py-2 text-[13px] ${fileNote.ok ? 'border-border text-text-2' : 'border-live-border text-text'}`} data-testid="add-to-set-file-note">
                <p>{fileNote.text}</p>
                {fileNote.warnings.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-[12px] text-muted">
                    {fileNote.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] text-muted" data-testid="add-to-set-note">
            {added ? `Added ${added} — ${count} in the set` : `${count} in the set`}
          </span>
          <Button height={40} variant="primary" onClick={onClose} testId="add-to-set-done">Done</Button>
        </div>
      </div>
    </Sheet>
  );
}
