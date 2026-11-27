import { useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { LIT } from '../ui';
import { TabStrip } from '../desk/TabStrip';
import type { TabEdit } from '../../hooks/useDeskLayout';
import { PANELS, PANEL_BY_ID } from '../../lib/deskLayout';
import { SETTINGS_CATEGORIES } from '../../lib/settingsMap';

export type PhoneSheetKey =
  | 'dye' | 'looks' | 'sound' | 'play' | 'mix' | 'more'
  | 'tabs' | 'feedback' | 'record' | 'wall' | 'sequencer' | 'midi' | 'patches' | 'liquids' | 'camera';

/**
 * The desk's tabs on the phone (lib/deskTabs.ts): the same tabs, renamed,
 * reordered, added and taken away the same way, each tab's panels stacked in
 * one sheet. A settings section or one of the screens (Songs, Sequences,
 * Sound with its player and drone) is drawn in it whole; the desk's own panels (the bottles,
 * the set list, the rides) were built for a mouse, and the phone has its own
 * of each, so their card opens that sheet instead.
 */
export interface PhoneTabs {
  tabs: { id: string; name: string }[];
  tab: string;
  onTab: (id: string) => void;
  onEdit: (e: TabEdit) => void;
  /** The panels out on the tab that is up, in reading order. */
  panels: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  /** A panel drawn whole, or null for one of the desk's own. */
  render: (id: string) => ReactNode | null;
}

/** The phone's own sheet for each of the desk's own panels. */
const OWN_SHEET: Record<string, PhoneSheetKey> = {
  bottles: 'dye', dyes: 'dye', tools: 'dye', cues: 'looks', recipe: 'play', rides: 'play', score: 'sound', mixer: 'mix',
};
const SHEET_NAME: Record<string, string> = { dye: 'Dye', looks: 'Looks', play: 'Motion', mix: 'Mix', sound: 'Sound' };

/**
 * Stack of panels for the active desk tab inside PhoneStage > More > Tabs.
 * Extracted from PhoneStage.tsx to keep PhoneStage under the file-size bar.
 */
export function PhoneTabsBody({ t, openSheet }: { t: PhoneTabs; openSheet: (s: PhoneSheetKey) => void }) {
  const [adding, setAdding] = useState(false);
  const out = new Set(t.panels);
  return (
    <div className="flex flex-col gap-2" data-testid="phone-tabs-body">
      <TabStrip tabs={t.tabs} tab={t.tab} onTab={t.onTab} onEdit={t.onEdit} onAddPanel={() => setAdding(true)} height={48} touch />
      {t.panels.length === 0 && <p className="text-[13px] text-dim">Nothing on this tab yet. Add a panel below.</p>}
      {t.panels.map(id => {
        const spec = PANEL_BY_ID.get(id);
        const body = t.render(id);
        const own = OWN_SHEET[id];
        return (
          <section key={id} className="rounded-lg border border-border bg-elevated" data-testid={`phone-tab-panel-${id}`}>
            <div className="flex items-center justify-between pl-3">
              <span className="text-[14px] font-medium text-text">{spec?.name ?? id}</span>
              <button
                onClick={() => t.onRemove(id)}
                className="flex h-12 w-12 items-center justify-center text-muted active:bg-active"
                aria-label={`Take ${spec?.name ?? id} off this tab`}
                data-testid={`phone-tab-remove-${id}`}
              >
                <X size={16} />
              </button>
            </div>
            {body ? (
              <div className="max-h-[60dvh] overflow-y-auto border-t border-border px-3 pb-3 pt-2">{body}</div>
            ) : own ? (
              <button
                onClick={() => openSheet(own)}
                className="mx-3 mb-3 flex h-12 w-[calc(100%-24px)] items-center justify-center rounded-lg border border-border-strong text-[14px] text-text-2 active:bg-active"
                data-testid={`phone-tab-open-${id}`}
              >
                Open {SHEET_NAME[own]}
              </button>
            ) : (
              <p className="px-3 pb-3 text-[13px] text-dim">On the laptop's desk.</p>
            )}
          </section>
        );
      })}
      <button
        onClick={() => setAdding(a => !a)}
        aria-expanded={adding}
        className={`flex h-12 items-center justify-center gap-2 rounded-lg border border-dashed text-[14px] ${adding ? LIT : 'border-border-strong text-text-2 active:bg-active'}`}
        data-testid="phone-tab-add"
      >
        <Plus size={16} /> Panel on this tab
      </button>
      {adding && (
        <div className="flex flex-col gap-1" data-testid="phone-tab-add-list">
          {SETTINGS_CATEGORIES.map(c => {
            const rows = PANELS.filter(x => x.category === c.id && !out.has(x.id));
            if (rows.length === 0) return null;
            return (
              <div key={c.id}>
                <div className="mb-2 mt-4 text-[12px] font-medium uppercase tracking-[0.12em] text-dim first:mt-1">{c.name}</div>
                <div className="grid grid-cols-2 gap-1">
                  {rows.map(x => (
                    <button
                      key={x.id}
                      onClick={() => { t.onAdd(x.id); setAdding(false); }}
                      className="h-12 truncate rounded-lg border border-border bg-elevated px-3 text-left text-[14px] text-text-2 active:bg-active"
                      data-testid={`phone-tab-add-${x.id}`}
                    >
                      {x.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
