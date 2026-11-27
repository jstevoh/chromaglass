import { AnimatePresence } from 'motion/react';
import { Kbd, Sheet } from './ui';
import { PanelGuard } from './PanelGuard';
import { GuidePanel } from './GuidePanel';
import { CommandPalette, type Command } from './desk/CommandPalette';
import { DESK_SHORTCUTS, SHOW_SHORTCUTS } from '../lib/shortcuts';
import { MACRO_SHORTCUTS } from '../lib/macroCamera';
import { DESK_TOOLS } from './desk/tools';

/**
 * Keyboard shortcuts sheet (`?`, and from ⌘K / Desk footer / Phone More).
 *
 * Every row comes directly from the modules that define and execute the
 * bindings (`lib/shortcuts.ts`, `lib/macroCamera.ts`, `desk/tools.ts`), so a
 * shortcut added or changed in code updates here automatically instead of
 * drifting in a hand-written copy.
 */
export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Keyboard shortcuts" onClose={onClose} width={640} height={600} testId="shortcut-sheet">
      <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-6">
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Show &amp; plate</h3>
          <div className="divide-y divide-border rounded-lg border border-border bg-elevated/60">
            {SHOW_SHORTCUTS.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 px-3.5 py-2 text-[13px]">
                <span className="text-text-2">{s.label}</span>
                <Kbd>{s.kbd}</Kbd>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Tools</h3>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {DESK_TOOLS.map(([, label, kbd]) => (
              <div key={kbd} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-elevated/60 px-3 py-2 text-[13px]">
                <span className="truncate text-text-2">{label}</span>
                <Kbd>{kbd}</Kbd>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Macro closeup</h3>
          <div className="divide-y divide-border rounded-lg border border-border bg-elevated/60">
            {MACRO_SHORTCUTS.map((s) => (
              <div key={s.kbd} className="flex items-center justify-between gap-4 px-3.5 py-2 text-[13px]">
                <span className="text-text-2">{s.label}</span>
                <Kbd>{s.kbd}</Kbd>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Desk layout</h3>
          <div className="divide-y divide-border rounded-lg border border-border bg-elevated/60">
            {DESK_SHORTCUTS.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 px-3.5 py-2 text-[13px]">
                <span className="text-text-2">{s.label}</span>
                <Kbd>{s.kbd}</Kbd>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Sheet>
  );
}

/** Command palette and keyboard shortcuts sheet, kept beside `App.tsx` so it stays under its size budget. */
export function CommandAndShortcuts({
  showPalette, onClosePalette, commands, showShortcuts, onCloseShortcuts, showHelp, helpFocus, onCloseHelp,
}: {
  showPalette: boolean;
  onClosePalette: () => void;
  commands: Command[];
  showShortcuts: boolean;
  onCloseShortcuts: () => void;
  showHelp: boolean;
  helpFocus: string | null;
  onCloseHelp: () => void;
}) {
  return (
    <>
      {showPalette && (
        <PanelGuard name="The command palette" onClose={onClosePalette}>
          <CommandPalette commands={commands} onClose={onClosePalette} />
        </PanelGuard>
      )}
      {showShortcuts && (
        <PanelGuard name="Keyboard shortcuts" onClose={onCloseShortcuts}>
          <ShortcutSheet onClose={onCloseShortcuts} />
        </PanelGuard>
      )}
      <AnimatePresence>
        {showHelp && <GuidePanel focus={helpFocus} onClose={onCloseHelp} />}
      </AnimatePresence>
    </>
  );
}
