import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PRESETS, type Preset } from '../presets';
import type { VisualizerSettings } from '../types';

/**
 * The presets, one click from the top of the screen. Grouped the way the
 * show thinks of them — the projected light show, the photographs, the
 * closeups — with the current one marked. Closes on a pick, a click
 * outside, or Escape.
 */
interface PresetMenuProps {
  activePresetId: string | null;
  onApplyPreset: (presetId: string, settings: Partial<VisualizerSettings>) => void;
  onClose: () => void;
  /** Where the menu hangs from: under the title on the left, or beside the toolbar. */
  align?: 'left' | 'right' | 'side';
  /**
   * For 'side': the opening button's rectangle. The toolbar scrolls, which
   * would clip anything positioned inside it, so the menu is fixed to the
   * viewport and placed beside that rectangle instead.
   */
  anchor?: { top: number; left: number } | null;
}

const GROUPS: { label: string; pick: (p: Preset) => boolean }[] = [
  { label: 'Closeup', pick: (p) => !!p.settings.macroMode },
  { label: 'Photograph', pick: (p) => p.settings.renderStyle === 'photo' },
  { label: 'Light show', pick: (p) => !p.settings.macroMode && p.settings.renderStyle !== 'photo' },
];

export const PresetMenu: React.FC<PresetMenuProps> = ({ activePresetId, onApplyPreset, onClose, align = 'left', anchor = null }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // Deferred a tick so the click that opened the menu doesn't close it.
    const id = setTimeout(() => {
      window.addEventListener('pointerdown', onDown);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const groups = GROUPS.map((g) => ({ label: g.label, presets: PRESETS.filter(g.pick) })).filter((g) => g.presets.length > 0);
  // Light show first in the list; the grouping above only decides membership.
  groups.sort((a, b) => (a.label === 'Light show' ? -1 : b.label === 'Light show' ? 1 : a.label === 'Photograph' ? -1 : 1));

  // A CSS animation, not a JS one: the menu opens during a show, and a
  // frame loop busy with the solver must not be what decides when a menu
  // becomes visible.
  const menu = (
    <div
      ref={ref}
      className={`${align === 'side' ? 'fixed' : align === 'left' ? 'absolute top-full mt-2 left-0' : 'absolute top-full mt-2 right-0'} w-72 max-h-[70vh] overflow-y-auto scrollbar-hide bg-[#0b0b10]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl pointer-events-auto z-[60]`}
      style={{
        animation: 'chromaglass-menu-in 0.15s ease-out',
        ...(align === 'side' && anchor ? { top: Math.max(8, Math.min(anchor.top, window.innerHeight * 0.3)), right: window.innerWidth - anchor.left + 12 } : {}),
      }}
      role="menu"
      data-testid="preset-menu"
    >
      {groups.map((g) => (
        <div key={g.label} className="mb-3 last:mb-0">
          <div className="text-[9px] uppercase tracking-[0.3em] opacity-30 px-1 mb-1.5">{g.label}</div>
          <div className="flex flex-col gap-1">
            {g.presets.map((p) => {
              const active = p.id === activePresetId;
              return (
                <button
                  key={p.id}
                  role="menuitem"
                  onClick={() => { onApplyPreset(p.id, p.settings); onClose(); }}
                  className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                    active ? 'bg-white/15 text-white' : 'hover:bg-white/10 text-white/75'
                  }`}
                  title={p.description}
                  data-testid={`preset-menu-${p.id}`}
                >
                  <span className="text-xs font-semibold truncate">{p.name}</span>
                  {active && <span className="text-[8px] uppercase tracking-wider font-bold text-white/50 shrink-0">On</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
  // The toolbar animates and scrolls, and a transformed, clipping ancestor
  // swallows anything positioned inside it — so the side menu goes to the body.
  return align === 'side' ? createPortal(menu, document.body) : menu;
};
