import React, { useEffect, useRef, useState } from 'react';
import { FolderOpen, Save, Download, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { PRESETS, type Preset } from '../presets';
import type { VisualizerSettings } from '../types';
import type { UserPreset } from '../lib/userPresets';
import { songLabel, type SongRef } from '../lib/songRef';

/**
 * The presets, one click from the top of the screen. Grouped the way the
 * show thinks of them — the projected light show, the photographs, the
 * closeups — with the current one marked. Closes on a pick, a click
 * outside, or Escape.
 */
interface PresetMenuProps {
  activePresetId: string | null;
  onApplyPreset: (presetId: string, settings: Partial<VisualizerSettings>) => void;
  /**
   * Arm a look instead of cutting to it. When this is given, a click cues and
   * the stage does not change until Go — which is what a room wants. Loading
   * it outright (which clears the plate) stays available on the same row for
   * building a look, where landing on clean glass is the point.
   */
  onCuePreset?: (presetId: string) => void;
  onClose: () => void;
  /** Where the menu hangs from: under the title on the left, or beside the toolbar. */
  align?: 'left' | 'right' | 'side';
  /**
   * For 'side': the opening button's rectangle. The toolbar scrolls, which
   * would clip anything positioned inside it, so the menu is fixed to the
   * viewport and placed beside that rectangle instead.
   */
  anchor?: { top: number; left: number } | null;
  /** The user's own presets, and what to do with them. */
  userPresets?: UserPreset[];
  onApplyUserPreset?: (p: UserPreset) => void;
  onSaveCurrent?: (name: string, description: string, forSong?: boolean) => void;
  /** The song playing now, if one is identified: a saved preset can be made for it. */
  currentSong?: SongRef | null;
  onLoadFile?: (file: File) => Promise<void>;
  onExportUserPreset?: (p: UserPreset) => void;
  onDeleteUserPreset?: (id: string) => void;
}

const GROUPS: { label: string; pick: (p: Preset) => boolean }[] = [
  { label: 'Closeup', pick: (p) => !!p.settings.macroMode },
  { label: 'Photograph', pick: (p) => p.settings.renderStyle === 'photo' },
  { label: 'Light show', pick: (p) => !p.settings.macroMode && p.settings.renderStyle !== 'photo' },
];

export const PresetMenu: React.FC<PresetMenuProps> = ({
  activePresetId, onApplyPreset, onCuePreset, onClose, align = 'left', anchor = null,
  userPresets = [], onApplyUserPreset, onSaveCurrent, onLoadFile, onExportUserPreset, onDeleteUserPreset, currentSong = null,
}) => {
  const [forSong, setForSong] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      className={`${align === 'side' ? 'fixed' : align === 'left' ? 'absolute top-full mt-2 left-0' : 'absolute top-full mt-2 right-0'} text-white w-72 max-h-[70vh] overflow-y-auto scrollbar-hide bg-[#0b0b10]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl pointer-events-auto z-[60]`}
      style={{
        animation: 'chromaglass-menu-in 0.15s ease-out',
        ...(align === 'side' && anchor ? { top: Math.max(8, Math.min(anchor.top, window.innerHeight * 0.3)), right: window.innerWidth - anchor.left + 12 } : {}),
      }}
      role="menu"
      data-testid="preset-menu"
    >
      {onSaveCurrent && (
        <div className="mb-3">
          {saving ? (
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(e) => { e.preventDefault(); if (saveName.trim()) { onSaveCurrent(saveName, '', forSong && !!currentSong); setSaving(false); setSaveName(''); } }}
            >
              <input
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Name this look"
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-white/40"
                data-testid="preset-save-name"
              />
              {currentSong && (
                <label className="flex items-start gap-2 text-[10px] opacity-70 cursor-pointer">
                  <input type="checkbox" checked={forSong} onChange={(e) => setForSong(e.target.checked)} className="accent-white mt-0.5" data-testid="preset-save-for-song" />
                  <span>Made for <span className="text-white/90">{songLabel(currentSong)}</span> — applied whenever that song is identified</span>
                </label>
              )}
              <div className="flex gap-1.5">
                <button type="submit" className="flex-1 py-1.5 rounded-lg bg-white text-black text-[10px] font-bold uppercase tracking-widest" data-testid="preset-save-confirm">Save as file</button>
                <button type="button" onClick={() => setSaving(false)} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest">Cancel</button>
              </div>
              <p className="text-[9px] opacity-40 leading-snug">Saved to your library here and downloaded as a JSON file you can keep or share.</p>
            </form>
          ) : (
            <div className="flex gap-1.5">
              <button onClick={() => setSaving(true)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest" title="Save the current look as a preset file" data-testid="preset-save">
                <Save size={12} /> Save current
              </button>
              <button onClick={() => fileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest" title="Load a preset file" data-testid="preset-load">
                <FolderOpen size={12} /> Load file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                data-testid="preset-file-input"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f || !onLoadFile) return;
                  try { setError(null); await onLoadFile(f); onClose(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not read that file'); }
                }}
              />
            </div>
          )}
          {error && <p className="text-[10px] text-red-300 mt-1.5">{error}</p>}
        </div>
      )}
      {userPresets.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] uppercase tracking-[0.3em] opacity-30 px-1 mb-1.5">Yours</div>
          <div className="flex flex-col gap-1">
            {userPresets.map((p) => {
              const active = p.id === activePresetId;
              return (
                <div key={p.id} className={`flex items-center gap-1 rounded-lg ${active ? 'bg-white/15' : 'hover:bg-white/10'}`}>
                  <button
                    role="menuitem"
                    onClick={() => { onApplyUserPreset?.(p); onClose(); }}
                    className={`flex-1 min-w-0 flex items-center justify-between gap-2 px-2.5 py-1.5 text-left ${active ? 'text-white' : 'text-white/75'}`}
                    title={p.song ? `Made for ${songLabel(p.song)}` : (p.description ?? 'A saved preset')}
                    data-testid={`preset-menu-${p.id}`}
                  >
                    <span className="min-w-0">
                      <span className="text-xs font-semibold truncate block">{p.name}</span>
                      {p.song && <span className="text-[9px] opacity-50 truncate block">♪ {songLabel(p.song)}</span>}
                    </span>
                    {active && <span className="text-[8px] uppercase tracking-wider font-bold text-white/50 shrink-0">On</span>}
                  </button>
                  <button onClick={() => onExportUserPreset?.(p)} className="p-1.5 rounded hover:bg-white/10 text-white/50" title="Save this preset as a file"><Download size={11} /></button>
                  <button onClick={() => onDeleteUserPreset?.(p.id)} className="p-1.5 mr-1 rounded hover:bg-red-500/20 text-white/50" title="Remove from your library"><Trash2 size={11} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.label} className="mb-3 last:mb-0">
          <div className="text-[9px] uppercase tracking-[0.3em] opacity-30 px-1 mb-1.5">{g.label}</div>
          <div className="flex flex-col gap-1">
            {g.presets.map((p) => {
              const active = p.id === activePresetId;
              return (
                <div key={p.id} className={`flex items-stretch rounded-lg transition-colors ${active ? 'bg-white/15' : 'hover:bg-white/10'}`}>
                  <button
                    role="menuitem"
                    // Cue where the desk can, load where it cannot. A click
                    // used to put the look on the wall that instant, through
                    // the path that clears the plate first.
                    onClick={() => { if (onCuePreset) onCuePreset(p.id); else onApplyPreset(p.id, p.settings); onClose(); }}
                    className={`flex flex-1 items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-left ${active ? 'text-white' : 'text-white/75'}`}
                    title={onCuePreset ? `Cue ${p.name} — ${p.description}` : p.description}
                    data-testid={`preset-menu-${p.id}`}
                  >
                    <span className="text-xs font-semibold truncate">{p.name}</span>
                    {active && <span className="text-[8px] uppercase tracking-wider font-bold text-white/50 shrink-0">On</span>}
                  </button>
                  {onCuePreset && (
                    <button
                      // The old behaviour, kept where it belongs: landing on
                      // clean glass is the point when you are building a look.
                      onClick={() => { onApplyPreset(p.id, p.settings); onClose(); }}
                      className="px-2 rounded-r-lg text-[8px] font-bold uppercase tracking-wider text-white/30 hover:text-white hover:bg-white/10 shrink-0"
                      title={`Load ${p.name} onto a cleared plate — cuts the stage`}
                      data-testid={`preset-load-${p.id}`}
                    >
                      Load
                    </button>
                  )}
                </div>
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
