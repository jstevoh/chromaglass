import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { SETTINGS_CATEGORIES } from '../../lib/settingsMap';
import { PINNABLE } from '../../lib/deskPins';
import { PANELS, panelSearchText, whereIs, type DeskLayout } from '../../lib/deskLayout';
import { liveAvailable } from '../../lib/liveShow';
import { useEscape } from '../../hooks/useEscape';

/**
 * The panel browser (⌘P), Desk v2's way to every panel.
 *
 * This is what the Settings sheet's rail and search were: every section by
 * the category it lives in, found by what it is about rather than what it is
 * called (`sectionMatches`, the sheet's own search, so "bass boost" finds
 * Sound and "keystone" finds the Wall). A row opens the section as a panel,
 * docked in the deck (⏎) or floating over the plate (⇧⏎), instead of a sheet
 * over everything. Every panel can go on every tab (the tabs are the
 * owner's, lib/deskTabs.ts), the Stage sections too; the footer still goes to
 * the Stage sheet (⌘,), where the room and the machine are all in one place.
 */

const CONTROLS = new Map<string, number>();
for (const p of PINNABLE) CONTROLS.set(p.section, (CONTROLS.get(p.section) ?? 0) + 1);

const GROUP_NAME: Record<string, string> = Object.fromEntries(SETTINGS_CATEGORIES.map(c => [c.id, c.name]));

export function PanelBrowser({ layout, at, anchorRef, onDock, onFloat, onReveal, onStage, onClose }: {
  layout: DeskLayout;
  /** Where to hang it: under the + Panel button, right-aligned to it. */
  at: { top: number; right: number };
  anchorRef?: RefObject<HTMLButtonElement | null>;
  onDock: (id: string) => void;
  onFloat: (id: string) => void;
  /** Scroll an already-open panel into view when picked from the browser. */
  onReveal?: (id: string) => void;
  onStage: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEscape(onClose);
  // Close on click outside without an invisible full-screen scrim that blocks header buttons.
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (boxRef.current?.contains(t) || anchorRef?.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [onClose, anchorRef]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (name: string) => {
      if (!q) return 0;
      const n = name.toLowerCase();
      return n.startsWith(q) ? 0 : n.includes(q) ? 1 : 2;
    };
    return PANELS
      .filter(p => {
        // The Live Show streams from the Mac app only (PLAN 37x-4d): not offered where it cannot.
        if (p.id === 'live' && !liveAvailable()) return false;
        if (!q) return true;
        const hay = panelSearchText(p);
        return q.split(/\s+/).every(w => hay.includes(w));
      })
      .sort((a, b) => rank(a.name) - rank(b.name)
        || SETTINGS_CATEGORIES.findIndex(c => c.id === a.category) - SETTINGS_CATEGORIES.findIndex(c => c.id === b.category));
  }, [query]);
  useEffect(() => { setSel(0); }, [query]);

  const act = (i: number, float: boolean) => {
    const r = rows[i];
    if (!r) return;
    const where = whereIs(layout, r.id);
    if (where && !float) onReveal?.(r.id);
    else (float ? onFloat : onDock)(r.id);
    onClose();
  };

  let lastGroup = '';
  return createPortal(
    <div
      ref={boxRef}
      className="fixed z-[61] flex max-h-[min(640px,80vh)] w-[min(380px,calc(100vw-16px))] flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-[0_20px_60px_rgba(0,0,0,.6)]"
      style={{ top: at.top, right: at.right }}
      data-testid="panel-browser"
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(rows.length - 1, s + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); act(sel, e.shiftKey); }
      }}
    >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <input
            ref={input}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find a panel…"
            aria-label="Find a panel"
            className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-faint"
            data-testid="panel-browser-search"
          />
          <span className="font-mono text-[12px] text-faint">esc</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1" data-testid="panel-browser-list">
          {rows.length === 0 && <p className="px-3 py-3 text-[13px] text-dim">Nothing matches “{query}”.</p>}
          {rows.map((r, i) => {
            const where = whereIs(layout, r.id);
            const whereLabel = where === 'float' ? 'floating' : where;
            const head = r.category !== lastGroup ? (lastGroup = r.category, GROUP_NAME[r.category] ?? r.category) : null;
            const count = r.kind === 'own' ? null : CONTROLS.get(r.id) ?? null;
            return (
              <div key={r.id}>
                {head && <div className="px-3 pb-1 pt-2.5 text-[12px] font-medium uppercase tracking-[0.12em] text-dim">{head}</div>}
                <div
                  className={`mx-1 flex h-8 items-center gap-2 rounded-md px-2 ${i === sel ? 'bg-hover' : ''}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => { if (where) act(i, false); }}
                  data-testid={`panel-browser-row-${r.id}`}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-2">{r.name}</span>
                  {count != null && <span className="shrink-0 font-mono text-[12px] text-faint">{count}</span>}
                  {whereLabel && <span className="shrink-0 rounded-xs bg-accent-bg px-1.5 py-0.5 text-[12px] font-medium text-accent-text">{whereLabel}</span>}
                  {i === sel && !where && (
                    <>
                      <button onClick={() => act(i, false)} className="h-6 shrink-0 rounded-sm bg-primary px-2 text-[12px] font-medium text-on-primary" data-testid={`panel-browser-dock-${r.id}`}>Dock ⏎</button>
                      <button onClick={() => act(i, true)} className="h-6 shrink-0 rounded-sm border border-border-strong px-2 text-[12px] font-medium text-text-2 hover:bg-hover" data-testid={`panel-browser-float-${r.id}`}>Float ⇧⏎</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {
          <button
            onClick={() => { onClose(); onStage(); }}
            className="flex h-10 shrink-0 items-center justify-between border-t border-border px-3 text-left text-[12px] text-muted hover:bg-hover hover:text-text"
            data-testid="panel-browser-stage"
          >
            <span>Stage · wall, mapping, logo, plates, simulation</span>
            <span className="font-mono text-[12px] text-faint">⌘,</span>
          </button>
        }
      </div>,
    document.body,
  );
}
