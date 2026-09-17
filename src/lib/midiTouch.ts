/**
 * What the controller just touched, so the screen can say so.
 *
 * A fader already shows: the rides read their value out of `settings`, so a
 * hand on the hardware moves the bar on screen because both go through the
 * same number. A *pad* shows nothing. Press a preset and the look changes, but
 * the row that preset lives on sits there exactly as it did — which in a dark
 * room reads as "did that work?", and the answer arrives a second later when
 * the plate crossfades. Long enough to press it again.
 *
 * So bindings publish what they fired. Three things decide the shape of this:
 *
 *   - **Not React state.** A fader sweep is a hundred messages a second and a
 *     clock is twenty-four a beat. Putting that through `useState` at the top
 *     of the app would re-render the desk, the cue list and the plate's
 *     wrapper on every one. This is a plain map of listeners, so a preset
 *     press wakes exactly the one row bound to that preset.
 *   - **Keyed by what was hit, not by which control hit it.** The screen cares
 *     that *Crowd Plate* fired, not that it was note 37 on channel 1. Only the
 *     controller publishes today, which is the point — a mouse press already
 *     shows itself, and the phone and the keyboard are in the room with you.
 *     But nothing here knows about MIDI, so the day the phone remote should
 *     flash a row too, it calls `touch` and every listener already works.
 *   - **A moment, not a state.** There is no "untouch" — a pad press is an
 *     event. Listeners are told when, and decide for themselves how long to
 *     wear it.
 */

import type { MidiTarget } from './midi';

type Listener = (at: number) => void;

/** One thing the controller did, for anything watching the lot of it. */
export interface TouchEvent {
  key: string;
  at: number;
  /** Where the setting landed, for a fader. Absent for a pad: it has no level. */
  value?: number;
}

const listeners = new Map<string, Set<Listener>>();
/**
 * Watchers of everything, for the activity view.
 *
 * Separate from the per-key listeners because they want opposite things: a cue
 * row wants to be woken only by its own preset and nothing else, while the
 * activity view wants the lot and does its own coalescing. Sending everything
 * to every per-key listener to serve one reader would have made a fader sweep
 * re-render forty rows.
 */
const watchers = new Set<(e: TouchEvent) => void>();

/** A stable name for a thing the controller can hit. */
export function touchKey(t: MidiTarget): string {
  switch (t.kind) {
    case 'setting': return `setting:${String(t.key)}`;
    case 'action':  return `action:${t.action}`;
    case 'preset':  return `preset:${t.presetId}`;
    case 'dye':     return `dye:${t.paletteIndex}`;
  }
}

/**
 * Something was hit. Called from the MIDI handler and from anywhere else that
 * fires the same targets, so the screen agrees whichever hand did it.
 */
export function touch(key: string, value?: number, at: number = performance.now()): void {
  const set = listeners.get(key);
  // Copied before iterating: a listener that unsubscribes itself while being
  // told — a row unmounting because the cue list just changed under it — would
  // otherwise mutate the set mid-loop.
  if (set) for (const fn of [...set]) fn(at);
  if (watchers.size === 0) return;
  const e: TouchEvent = value === undefined ? { key, at } : { key, at, value };
  for (const fn of [...watchers]) fn(e);
}

/** Tell me about everything. For the activity view, which shows the lot. */
export function subscribeAllTouches(fn: (e: TouchEvent) => void): () => void {
  watchers.add(fn);
  return () => { watchers.delete(fn); };
}

/** Tell me when this is hit. Returns the way to stop being told. */
export function subscribeTouch(key: string, fn: Listener): () => void {
  let set = listeners.get(key);
  if (!set) { set = new Set(); listeners.set(key, set); }
  set.add(fn);
  return () => {
    const s = listeners.get(key);
    if (!s) return;
    s.delete(fn);
    // Dropped when empty: a cue list of forty looks that is rebuilt on every
    // preset save would otherwise leave a key behind each time, for ever.
    if (s.size === 0) listeners.delete(key);
  };
}

/** How many keys are being listened for — for a harness, and for leak checks. */
export const touchKeysWatched = (): number => listeners.size;

/** Forget everything. Only for tests: the app never stops listening. */
export function resetTouch(): void {
  listeners.clear();
  watchers.clear();
}
