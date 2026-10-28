import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Pencil, Plus, Copy, Trash2 } from 'lucide-react';
import { Segmented } from '../ui';
import { TAB_NAME_MAX, TABS_MAX } from '../../lib/deskTabs';
import type { TabEdit } from '../../hooks/useDeskLayout';

/**
 * The desk's tabs, and the editor that makes them the owner's.
 *
 * The chips were Build, Gig, Load-in, Sequence and Sound, fixed. The owner
 * asked (2026-10-27) for every tab to be a set of the same panels, to be
 * renamed, reordered, added and taken away, with three that ship as examples
 * (lib/deskTabs.ts). The chips are the switch they always were; the pencil
 * beside them opens the list of tabs to edit. Which panels a tab holds is
 * what it always was: + Panel (⌘P) puts one on the tab that is up, and a
 * panel's × takes it off, never losing a control, since every panel is in
 * the browser whichever tabs it is on.
 *
 * The editor is a list rather than chips that drag or rename in place: a
 * chip renamed by a double click is a chip that a double click mid-show
 * renames, and arrows are what a touch screen and a keyboard both have.
 */
export function TabStrip({ tabs, tab, onTab, onEdit, onAddPanel, height = 32, touch = false }: {
  tabs: { id: string; name: string }[];
  tab: string;
  onTab: (id: string) => void;
  onEdit: (e: TabEdit) => void;
  /** The panel browser, for the tab that is up. */
  onAddPanel?: () => void;
  height?: number;
  /** The phone's: 48 px to press, and the editor in its own sheet rather than hung under the pencil. */
  touch?: boolean;
}) {
  const [open, setOpen] = useState<{ top: number; left: number } | null>(null);
  const pencil = useRef<HTMLButtonElement | null>(null);
  const toggle = () => {
    const r = pencil.current?.getBoundingClientRect();
    setOpen(o => (o ? null : { top: (r?.bottom ?? 48) + 6, left: Math.max(8, Math.min(window.innerWidth - 328, (r?.left ?? 8) - 140)) }));
  };
  return (
    <div className="flex min-w-0 items-center gap-1" data-testid="desk-tabs">
      {/* Half the header at most on the desk, where it is centred between two clusters; the sheet's width on the phone. */}
      <div className={`min-w-0 overflow-x-auto scrollbar-hide ${touch ? 'flex-1' : 'max-w-[min(52vw,720px)]'}`}>
        <Segmented
          value={tab}
          options={tabs.map(t => [t.id, t.name] as const)}
          onChange={onTab}
          height={height}
          tight={!touch}
          fill={touch && tabs.length <= 4}
          testId="mode-segmented"
        />
      </div>
      <button
        ref={pencil}
        onClick={toggle}
        className={`inline-flex shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-text ${open ? 'bg-hover text-text' : ''}`}
        style={{ width: touch ? 48 : height, height: touch ? 48 : height }}
        title="Edit the tabs: rename, reorder, add or take one away"
        aria-label="Edit the tabs"
        aria-expanded={!!open}
        data-testid="tabs-edit"
      >
        <Pencil size={touch ? 18 : 14} />
      </button>
      {open && createPortal(
        <TabEditor
          tabs={tabs}
          tab={tab}
          onEdit={onEdit}
          onAddPanel={onAddPanel ? () => { setOpen(null); onAddPanel(); } : undefined}
          onClose={() => setOpen(null)}
          at={touch ? null : open}
          touch={touch}
        />,
        document.body,
      )}
    </div>
  );
}

function TabEditor({ tabs, tab, onEdit, onAddPanel, onClose, at, touch }: {
  tabs: { id: string; name: string }[];
  tab: string;
  onEdit: (e: TabEdit) => void;
  onAddPanel?: () => void;
  onClose: () => void;
  /** Hung under the pencil; null for the phone's sheet along the bottom. */
  at: { top: number; left: number } | null;
  touch: boolean;
}) {
  /** The tab whose Delete has been pressed once: the second press takes it away. */
  const [arm, setArm] = useState<string | null>(null);
  const [armReset, setArmReset] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const row = touch ? 48 : 32;
  const btn = `inline-flex shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-text disabled:opacity-30 disabled:hover:bg-transparent`;
  const full = tabs.length >= TABS_MAX;
  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} data-testid="tabs-editor-scrim" />
      <div
        className={`fixed z-[61] flex flex-col gap-1 border border-border-strong bg-elevated p-2 shadow-[0_20px_60px_rgba(0,0,0,.6)] ${at ? 'w-[320px] rounded-lg' : 'inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-xl pb-6'}`}
        style={at ? { top: at.top, left: at.left } : undefined}
        role="dialog"
        aria-label="The tabs"
        data-testid="tabs-editor"
      >
        <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-widest text-muted">Tabs</p>
        {tabs.map((t, i) => (
          <div key={t.id} className="flex items-center gap-1" data-testid={`tabs-row-${t.id}`}>
            <NameField id={t.id} name={t.name} lit={t.id === tab} height={row} onRename={(name) => onEdit({ op: 'rename', id: t.id, name })} />
            <button className={btn} style={{ width: row, height: row }} disabled={i === 0} onClick={() => onEdit({ op: 'move', id: t.id, by: -1 })}
              aria-label={`Move ${t.name} left`} title="Move it left" data-testid={`tabs-up-${t.id}`}><ArrowLeft size={14} /></button>
            <button className={btn} style={{ width: row, height: row }} disabled={i === tabs.length - 1} onClick={() => onEdit({ op: 'move', id: t.id, by: 1 })}
              aria-label={`Move ${t.name} right`} title="Move it right" data-testid={`tabs-down-${t.id}`}><ArrowRight size={14} /></button>
            {arm === t.id ? (
              <button
                className="inline-flex shrink-0 items-center rounded-md bg-[var(--color-live)] px-2 text-[12px] font-medium text-white"
                style={{ height: row }}
                onClick={() => { setArm(null); onEdit({ op: 'delete', id: t.id }); }}
                data-testid={`tabs-delete-confirm-${t.id}`}
              >Delete</button>
            ) : (
              <button className={btn} style={{ width: row, height: row }} disabled={tabs.length <= 1} onClick={() => setArm(t.id)}
                aria-label={`Delete ${t.name}`} title="Take this tab away (its panels stay in the browser)" data-testid={`tabs-delete-${t.id}`}><Trash2 size={14} /></button>
            )}
          </div>
        ))}
        <div className="mt-1 flex flex-wrap gap-1 border-t border-border pt-2">
          <button className={`${btn} gap-1.5 px-2 text-[12px]`} style={{ height: row }} disabled={full} onClick={() => onEdit({ op: 'add' })} data-testid="tabs-add">
            <Plus size={14} /> New tab
          </button>
          <button className={`${btn} gap-1.5 px-2 text-[12px]`} style={{ height: row }} disabled={full} onClick={() => onEdit({ op: 'add', copyOf: tab })} data-testid="tabs-copy">
            <Copy size={14} /> Copy this tab
          </button>
          {onAddPanel && (
            <button className={`${btn} gap-1.5 px-2 text-[12px]`} style={{ height: row }} onClick={onAddPanel} data-testid="tabs-add-panel">
              <Plus size={14} /> Panel on this tab
            </button>
          )}
        </div>
        <p className="px-1 pt-1 text-[11px] leading-snug text-dim">
          A tab is a set of panels. Put one on the tab that is up with + Panel (⌘P); a panel taken off a tab is still in the browser. ⌘1 to ⌘9 go to the tabs in order.
        </p>
        {armReset ? (
          <button
            className="mt-1 self-start rounded-md bg-[var(--color-live)] px-2 text-[12px] font-medium text-white"
            style={{ height: row }}
            onClick={() => { setArmReset(false); onEdit({ op: 'reset-all' }); }}
            data-testid="tabs-reset-confirm"
          >
            Put back Perform, Sequence and Setup as they shipped
          </button>
        ) : (
          <button
            className="mt-1 self-start rounded-md px-2 text-[12px] text-muted transition-colors hover:bg-hover hover:text-text"
            style={{ height: row }}
            onClick={() => setArmReset(true)}
            data-testid="tabs-reset"
          >
            Put the shipped tabs back…
          </button>
        )}
      </div>
    </>
  );
}

/** A tab's name, renamed when the field is left or Enter is pressed: a name half typed is not a rename. */
function NameField({ id, name, lit, height, onRename }: { id: string; name: string; lit: boolean; height: number; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => { setDraft(name); }, [name]);
  const commit = () => { if (draft.trim() && draft !== name) onRename(draft); else setDraft(name); };
  return (
    <input
      value={draft}
      maxLength={TAB_NAME_MAX}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } if (e.key === 'Escape') { setDraft(name); } }}
      className={`min-w-0 flex-1 rounded-md border bg-surface px-2 text-[13px] text-text outline-none focus:border-accent-border ${lit ? 'border-accent-border' : 'border-border'}`}
      style={{ height }}
      aria-label={`Name of the ${name} tab`}
      data-testid={`tabs-name-${id}`}
    />
  );
}
