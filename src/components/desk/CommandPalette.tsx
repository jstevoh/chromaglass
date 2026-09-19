import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Kbd } from '../ui';

/**
 * ⌘K: one box that reaches everything.
 *
 * The desk deliberately shows six rides and a cue list and nothing else,
 * because those are what a hand is on during a set. Everything else the app
 * can do — thirty-two looks, the settings sheet, MIDI learn, the sequencer,
 * cast, record — has to stay one reach away without taking any of that room.
 * A search box is that reach: type three letters of a look's name and Enter.
 *
 * Rows are flat rather than grouped by kind, ordered by how well they match,
 * because when you know what you want the first row should be it, and when
 * you don't you are reading the list anyway.
 */

export interface Command {
  id: string;
  /** 'look' rows can be armed or sent; everything else just runs. */
  look?: boolean;
  /** What it is called. Matched on, and shown. */
  name: string;
  /** 'Look', 'Do', 'Open' — the noun the row sits under, shown dimmed. */
  kind: string;
  /** A second string that also matches, e.g. a look's dyes. */
  hint?: string;
  /**
   * Words that also find it, matched only as a whole run of text — never as
   * letters scattered in order, which against a long list of words would match
   * nearly anything. A settings section's terms and control labels.
   */
  terms?: string;
  /** Printed on the right, e.g. the key that also does it. */
  kbd?: string;
  swatch?: string;
  run: () => void;
  /** Looks only: send it to the wall now rather than arming it. ⇧⏎. */
  runNow?: () => void;
}

/** Subsequence match, the thing every palette does: "oow" finds "Oil on Water". */
function score(q: string, text: string): number {
  if (!q) return 0;
  const t = text.toLowerCase();
  const i = t.indexOf(q);
  if (i === 0) return 1000;          // starts with it
  if (i > 0) return 700 - i;         // contains it
  let at = 0, gaps = 0;
  for (const ch of q) {
    const n = t.indexOf(ch, at);
    if (n < 0) return -1;
    gaps += n - at;
    at = n + 1;
  }
  return 400 - Math.min(300, gaps);  // letters in order, scattered
}

export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return commands.slice(0, 40);
    return commands
      .map(c => ({ c, s: Math.max(
        score(query, c.name),
        score(query, c.hint ?? '') - 200,
        score(query, c.kind) - 400,
        c.terms && query.split(/\s+/).every(w => c.terms!.includes(w)) ? 450 : -1,
      ) }))
      .filter(r => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map(r => r.c);
  }, [q, commands]);

  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Keep the cursor row in view when the arrows walk past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${at}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const fire = (c: Command | undefined, now = false) => {
    if (!c) return;
    onClose();
    if (now && c.runNow) c.runNow(); else c.run();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 pt-[12vh] backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="command-palette"
    >
      <div
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt(i => Math.min(rows.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(i => Math.max(0, i - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); fire(rows[at], e.shiftKey); }
          else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        }}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Cue a look, or run a command…"
            className="h-12 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-faint"
            data-testid="palette-input"
          />
          <Kbd>esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto scrollbar-hide py-1" data-testid="palette-list">
          {rows.length === 0 && (
            <div className="px-4 py-6 text-[13px] text-faint">Nothing matches “{q}”.</div>
          )}
          {rows.map((c, i) => (
            <Fragment key={c.id}>
            {(i === 0 || rows[i - 1].kind !== c.kind) && (
              <div className="px-4 pb-1 pt-3 text-[11px] uppercase tracking-[0.18em] text-faint">{c.kind}</div>
            )}
            <button
              key={c.id}
              data-row={i}
              onMouseMove={() => setAt(i)}
              onClick={() => fire(c)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === at ? 'bg-hover' : ''}`}
              data-testid={`palette-row-${c.id}`}
            >
              <span
                className="h-6 w-6 shrink-0 rounded-md border border-border"
                style={{ background: c.swatch ?? 'var(--color-elevated)' }}
              />
              <span className="min-w-0 flex-1 truncate text-[14px] text-text">{c.name}</span>
              {c.kbd && <Kbd>{c.kbd}</Kbd>}
            </button>
            </Fragment>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-faint" data-testid="palette-hints">
          <span><Kbd>↑↓</Kbd> move</span>
          <span><Kbd>⏎</Kbd> {rows[at]?.look ? 'set as next' : 'run'}</span>
          {rows[at]?.runNow && <span><Kbd>⇧⏎</Kbd> go now</span>}
          <span className="ml-auto">{rows.length} of {commands.length}</span>
        </div>
      </div>
    </div>
  );
}
