import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { groupedShippedLooks } from '../../lib/lookStills';
import { isPackLocked, openAccountSheet } from '../../lib/tierGates';
import { LIT } from '../ui';

/**
 * The desk's Looks grid (PLAN 34b-1).
 *
 * A laptop window under 1024 px has `PresetMenu` off the title and the phone
 * has its Looks sheet, while the 1440 px desk had only the document menu (New,
 * Save, and user-saved presets) and no visual picker for the shipped looks.
 * `looks-grid-open` in the desk header opens `looks-grid`, drawing one card
 * `looks-grid-<id>` per shipped preset from `groupedShippedLooks()`, each
 * showing the same lazy-loaded WebP still (`public/looks/<id>.webp`) as the
 * narrow menu and the phone sheet without running a solver to draw a card.
 */
export function LooksGrid({
  label = 'Looks',
  activeLookId,
  onSelectLook,
}: {
  label?: string;
  activeLookId: string | null;
  onSelectLook: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const groups = groupedShippedLooks();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Browse all preset palettes"
        data-testid="looks-grid-open"
        className={`flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] font-medium transition-colors ${
          open ? LIT : 'text-text-2 hover:bg-hover hover:text-text'
        }`}
      >
        <span>{label}</span>
        <span className="text-[11px] opacity-70" aria-hidden="true">▾</span>
      </button>
      {open && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-6 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Preset palettes"
            data-testid="looks-grid"
            onClick={e => e.stopPropagation()}
            className="flex max-h-[82vh] w-full max-w-[960px] flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <span className="text-[14px] font-medium text-text">Preset palettes</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close preset palettes"
                data-testid="looks-grid-close"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-text-2 hover:bg-hover hover:text-text"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {groups.map(g => (
                <div key={g.label} className="mb-5 last:mb-0">
                  <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted">
                    {g.label}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {g.presets.map(item => {
                      const active = item.id === activeLookId;
                      const locked = isPackLocked(item.pack);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-current={active ? 'true' : undefined}
                          data-testid={`looks-grid-${item.id}`}
                          onClick={() => {
                            if (locked) openAccountSheet();
                            else onSelectLook(item.id);
                            setOpen(false);
                          }}
                          title={item.description}
                          className={`flex flex-col overflow-hidden rounded-lg border p-2 text-left transition-colors ${
                            active
                              ? LIT
                              : 'border-border bg-elevated text-text hover:bg-hover'
                          }`}
                        >
                          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-md bg-black">
                            <img
                              src={item.still}
                              loading="lazy"
                              alt=""
                              draggable={false}
                              className="block h-full w-full object-cover"
                            />
                          </div>
                          <div className="mt-2 flex w-full items-center justify-between gap-1.5">
                            <span className="truncate text-[13px] font-medium">
                              {item.name}
                            </span>
                            {locked && (
                              <span className="shrink-0 rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide opacity-80">
                                Pack
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
