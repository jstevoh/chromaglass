import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SETTINGS_CATEGORIES, SECTION_BY_ID, sectionMatches } from '../../lib/settingsMap';
import { PINNABLE } from '../../lib/deskPins';
import { PANELS, panelAllowed, whereIs, type DeskLayout, type LayoutName } from '../../lib/deskLayout';

/**
 * The panel browser (⌘P), Desk v2's way to every panel.
 *
 * This is what the Settings sheet's rail and search were: every section by
 * the category it lives in, found by what it is about rather than what it is
 * called (`sectionMatches`, the sheet's own search, so "bass boost" finds
 * Sound and "keystone" finds the Wall). A row opens the section as a panel,
 * docked in the deck (⏎) or floating over the plate (⇧⏎), instead of a sheet
 * over everything. Stage sections are offered only in Load-in; elsewhere the
 * footer goes to the Stage sheet (⌘,), where the room and the machine live.
 */

const CONTROLS = new Map<string, number>();
for (const p of PINNABLE) CONTROLS.set(p.section, (CONTROLS.get(p.section) ?? 0) + 1);

const GROUP_NAME: Record<string, string> = Object.fromEntries(SETTINGS_CATEGORIES.map(c => [c.id, c.name]));

export function PanelBrowser({ layoutName, layout, at, onDock, onFloat, onStage, onClose }: {
  layoutName: LayoutName;
  layout: DeskLayout;
  /** Where to hang it: under the + Panel button, right-aligned to it. */
  at: { top: number; right: number };
  onDock: (id: string) => void;
  onFloat: (id: string) => void;
  onStage: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PANELS
      .filter(p => panelAllowed(layoutName, p.id))
      .filter(p => {
        if (!q) return true;
        const sec = SECTION_BY_ID.get(p.id);
        return sec ? sectionMatches(sec, q) : q.split(/\s+/).every(w => p.name.toLowerCase().includes(w));
      })
      .sort((a, b) => SETTINGS_CATEGORIES.findIndex(c => c.id === a.category) - SETTINGS_CATEGORIES.findIndex(c => c.id === b.category));
  }, [query, layoutName]);
  useEffect(() => { setSel(0); }, [query]);

  const act = (i: number, float: boolean) => {
    const r = rows[i];
    if (!r) return;
    (float ? onFloat : onDock)(r.id);
    onClose();
  };

  let lastGroup = '';
  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} data-testid="panel-browser-scrim" />
      <div
        className="fixed z-[61] flex max-h-[min(640px,80vh)] w-[380px] flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-[0_20px_60px_rgba(0,0,0,.6)]"
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
          <span className="font-mono text-[11px] text-faint">esc</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1" data-testid="panel-browser-list">
          {rows.length === 0 && <p className="px-3 py-3 text-[13px] text-dim">Nothing matches “{query}”.</p>}
          {rows.map((r, i) => {
            const where = whereIs(layout, r.id);
            const head = r.category !== lastGroup ? (lastGroup = r.category, GROUP_NAME[r.category] ?? r.category) : null;
            const count = r.kind === 'own' ? null : CONTROLS.get(r.id) ?? null;
            return (
              <div key={r.id}>
                {head && <div className="px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-dim">{head}</div>}
                <div
                  className={`mx-1 flex h-8 items-center gap-2 rounded-md px-2 ${i === sel ? 'bg-hover' : ''}`}
                  onMouseEnter={() => setSel(i)}
                  data-testid={`panel-browser-row-${r.id}`}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-2">{r.name}</span>
                  {count != null && <span className="shrink-0 font-mono text-[11px] text-faint">{count}</span>}
                  {where && <span className="shrink-0 rounded-xs bg-accent-bg px-1.5 py-0.5 text-[11px] font-medium text-accent-text">{where === 'float' ? 'floating' : 'docked'}</span>}
                  {i === sel && !where && (
                    <>
                      <button onClick={() => act(i, false)} className="h-6 shrink-0 rounded-sm bg-primary px-2 text-[11px] font-medium text-on-primary" data-testid={`panel-browser-dock-${r.id}`}>Dock ⏎</button>
                      <button onClick={() => act(i, true)} className="h-6 shrink-0 rounded-sm border border-border-strong px-2 text-[11px] font-medium text-text-2 hover:bg-hover" data-testid={`panel-browser-float-${r.id}`}>Float ⇧⏎</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {layoutName !== 'loadin' && (
          <button
            onClick={() => { onClose(); onStage(); }}
            className="flex h-10 shrink-0 items-center justify-between border-t border-border px-3 text-left text-[12px] text-muted hover:bg-hover hover:text-text"
            data-testid="panel-browser-stage"
          >
            <span>Stage · wall, mapping, logo, plates, simulation</span>
            <span className="font-mono text-[11px] text-faint">⌘,</span>
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
