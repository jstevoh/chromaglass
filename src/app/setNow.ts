/**
 * The set list and the cue, for the remote link to report and the owner's
 * assistant to drive (PLAN 44k-3).
 *
 * Why a holder here rather than props, as `tempoNow.ts` is for the tempo.
 * The set and the fade are `useSetListState`'s, the arming and the Go's are
 * `useLookFades`' callbacks, the remote link is `useRemote`'s, and all three
 * are called from App(), which is over its size ceiling and may not grow
 * (`npm run sizes`). So `useSetListState` publishes the set here and sets the
 * fade's half of the door, `useLookFades` sets the Go's half, and `useRemote`
 * reads the one and asks the other. The state stays theirs: this holds a copy
 * for reading and the functions that change it.
 *
 * Why by number. A performer says "arm the third one", and the assistant
 * reads the set from `show_state` as a numbered list; the item's own id is a
 * timestamp no person says. The guard checks the number against the list the
 * display last reported, and the door checks it again against the list as it
 * is now, since the performer may have taken an item out in between.
 */
import { useSyncExternalStore } from 'react';
import type { SetList } from '../lib/setList';
import { FADE_CHOICES } from '../lib/lookFade';

/** What the state reads: the working set, the item armed (by its id) and the desk's fade. */
export interface SetNow {
  list: SetList;
  armedItem: string | null;
  /** The item on stage, by its id (the desk's live row), for the phone controller (PLAN 12-ctl-1). */
  liveItem: string | null;
  fadeSeconds: number;
  /** The sets kept by name (the set menu's Save and Open), for the assistant to open one by its name (PLAN 44k-16a). */
  saved: SetList[];
}

/** `useLookFades`' half: arm and Go, to the front plate and the back. Each says why not, or null when done. */
export interface GoDoor {
  arm: (index: number, seconds?: number) => string | null;
  goItem: (index: number, seconds?: number) => string | null;
  goLook: (lookId: string, seconds?: number) => string | null;
  backArmed: (seconds?: number) => string | null;
  backLook: (lookId: string, seconds?: number) => string | null;
  backFollow: () => string | null;
}
/** `useSetListState`'s half: the Go's fade and the cue taken back. */
export interface CueDoor {
  fade: (seconds: number) => void;
  cancel: () => void;
}

let now: SetNow = { list: { name: '', items: [] }, armedItem: null, liveItem: null, fadeSeconds: 2, saved: [] };
let go: GoDoor | null = null;
let cue: CueDoor | null = null;
const listeners = new Set<() => void>();

export function publishSet(s: SetNow): void {
  if (now.list === s.list && now.armedItem === s.armedItem && now.liveItem === s.liveItem && now.fadeSeconds === s.fadeSeconds && now.saved === s.saved) return;
  now = s;
  for (const l of listeners) l();
}
/** The set as last published, for a door that reads it outside React (app/editNow.ts's kept sets). */
export const readSetNow = (): SetNow => now;
export function setGoDoor(d: GoDoor | null): void { go = d; }
export function setCueDoor(d: CueDoor | null): void { cue = d; }

/** A Go's own seconds: one of the desk's fade choices, or the item's or the desk's when absent. */
const secondsOf = (v: unknown): number | undefined | string =>
  v === undefined || v === null ? undefined
    : typeof v === 'number' && (FADE_CHOICES as readonly number[]).includes(v) ? v
      : `a fade of ${FADE_CHOICES.join(', ')} seconds (0 a cut), not ${String(v)}`;

/**
 * The relay's `assistant-set`: done, or why not. Read as untrusted: the guard
 * checked it, but a newer relay may send what this build does not know, and
 * the set may have changed since the guard's last look at it.
 */
/**
 * The phone controller's tap on a set row (PLAN 12-ctl-1): arm that item for
 * the next Go, by its id, through the same arm as the desk's own row, so the
 * look it names is armed too (`cuedPresetId`). By id and not by number: the
 * phone lists the set it last heard, and a number would arm whatever moved
 * into that place since.
 */
export function armSetItem(id: string): string | null {
  const index = now.list.items.findIndex(i => i.id === id);
  return index < 0 ? 'that item is no longer in the set' : askSet({ do: 'arm', item: index });
}

export function askSet(m: { do?: unknown; item?: unknown; look?: unknown; seconds?: unknown }): string | null {
  if (!go || !cue) return 'the set list is not running';
  const n = now.list.items.length;
  const index = m.item;
  const item = (): string | null => (typeof index !== 'number' || !Number.isInteger(index) || index < 0 ? 'an item by its number, from 1'
    : index >= n ? `item ${index + 1} of a set of ${n}` : null);
  const s = secondsOf(m.seconds);
  if (typeof s === 'string') return s;
  switch (m.do) {
    case 'arm': return item() ?? go.arm(index as number, s);
    case 'cancel': cue.cancel(); return null;
    case 'fade': {
      if (typeof m.seconds !== 'number') return `a fade of ${FADE_CHOICES.join(', ')} seconds`;
      cue.fade(m.seconds);
      return null;
    }
    case 'go-now':
      if (typeof m.look === 'string') return go.goLook(m.look, s);
      return item() ?? go.goItem(index as number, s);
    case 'back-armed': return go.backArmed(s);
    case 'back-look': return typeof m.look === 'string' ? go.backLook(m.look, s) : 'a look id for the back plate';
    case 'back-follow': return go.backFollow();
    default: return `not a set list call this build knows: ${String(m.do)}`;
  }
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useSetNow = () => useSyncExternalStore(subscribe, () => now, () => now);
