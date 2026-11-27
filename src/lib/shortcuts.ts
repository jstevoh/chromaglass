/**
 * The app's keyboard bindings, in one place so the key handlers, the command
 * palette (`useCommandPalette.ts`), the desk (`Desk.tsx`) and the `?` shortcut
 * sheet (`ShortcutSheet.tsx`) read from the same definitions.
 */

export interface ShortcutBinding {
  id: string;
  kbd: string;
  label: string;
  /** Lowercase `e.key` values that trigger this binding (when not using `code` or a range). */
  keys?: readonly string[];
  /** Exact `e.code` match, used when Alt/Option changes `e.key` on macOS (e.g. `Alt+D` → `∂`). */
  code?: string;
  /** Optional `e.code` matched with Shift held (e.g. synthetic `Shift+/` emits `'/'` instead of `'?'`). */
  shiftedCode?: string;
  mod?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export const SHOW_SHORTCUTS = [
  { id: 'palette',     kbd: '⌘K',    label: 'Command palette — search looks, panels, settings & actions', keys: ['k'], mod: true },
  { id: 'go',          kbd: 'Space', label: 'Go — send the cued look to the wall',                         code: 'Space' },
  { id: 'back',        kbd: '⌫',     label: 'Back — undo the last look',                                   keys: ['backspace'] },
  { id: 'cues',        kbd: '1–9',   label: 'Arm cue 1–9 in the set list' },
  { id: 'freeze',      kbd: 'F',     label: 'Freeze or thaw the liquid',                                   keys: ['f'] },
  { id: 'blackout',    kbd: 'B',     label: 'Blackout / lights up',                                        keys: ['b'] },
  { id: 'record',      kbd: 'R',     label: 'Start or stop recording',                                     keys: ['r'] },
  { id: 'take',        kbd: 'T',     label: 'Start or stop a replayable take',                             keys: ['t'] },
  { id: 'amount-down', kbd: '[',     label: 'Decrease tool amount',                                        keys: ['['] },
  { id: 'amount-up',   kbd: ']',     label: 'Increase tool amount',                                        keys: [']'] },
  { id: 'save',        kbd: '⌘S',    label: 'Save look',                                                   keys: ['s'], mod: true },
  { id: 'wall',        kbd: '⌘⏎',    label: 'Send preview to the wall',                                    keys: ['enter'], mod: true },
  { id: 'shortcuts',   kbd: '?',     label: 'Keyboard shortcuts',                                          keys: ['?'], shiftedCode: 'Slash' },
  { id: 'escape',      kbd: 'Esc',   label: 'Close menu, sheet or exit clean screen',                      keys: ['escape'] },
] as const satisfies readonly ShortcutBinding[];

export const DESK_SHORTCUTS = [
  { id: 'tabs',          kbd: '⌘1–9', label: 'Switch desk tab in order', mod: true },
  { id: 'panel-browser', kbd: '⌘P',   label: 'Open panel browser',       keys: ['p'], mod: true, shift: false },
  { id: 'stage',         kbd: '⌘,',   label: 'Open Stage settings',      keys: [','], mod: true },
  { id: 'deck-fold',     kbd: '⌥D',   label: 'Fold or show the bottom deck', code: 'KeyD', alt: true, mod: false },
  { id: 'floats-toggle', kbd: 'Tab',  label: 'Hide or show floating panels', keys: ['tab'], mod: false, alt: false, shift: false },
] as const satisfies readonly ShortcutBinding[];

type AnyBinding = (typeof SHOW_SHORTCUTS)[number] | (typeof DESK_SHORTCUTS)[number];
export type ShortcutId = AnyBinding['id'];

const BY_ID = new Map<string, ShortcutBinding>([...SHOW_SHORTCUTS, ...DESK_SHORTCUTS].map(b => [b.id, b]));

export const SHORTCUT_KBD: Record<ShortcutId, string> = Object.fromEntries(
  [...SHOW_SHORTCUTS, ...DESK_SHORTCUTS].map(b => [b.id, b.kbd]),
) as Record<ShortcutId, string>;

export function matchesShortcut(
  e: { key: string; code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  id: ShortcutId,
): boolean {
  const b = BY_ID.get(id);
  if (!b) return false;
  const mod = e.metaKey || e.ctrlKey;
  if (b.shiftedCode && e.shiftKey && e.code === b.shiftedCode && !mod && !e.altKey) return true;
  if (b.mod !== undefined && mod !== b.mod) return false;
  if (b.alt !== undefined && e.altKey !== b.alt) return false;
  if (b.shift !== undefined && e.shiftKey !== b.shift) return false;
  if (b.code && e.code !== b.code) return false;
  if (b.keys) return b.keys.includes(e.key.toLowerCase());
  return !!b.code;
}
