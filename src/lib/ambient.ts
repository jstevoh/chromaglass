/**
 * Ambient TV mode's switch (PLAN.md 23.8 / 14j): one flag for the whole page,
 * read by the draw gate (a 60 Hz draw ceiling) and by every quality governor
 * (30 solver steps a second, never above the opening rung).
 *
 * It is a module of its own, with nothing imported, so that `governor.ts` and
 * `drawGate.ts` can both read it and neither has to know the other exists. An
 * earlier draft kept the flag in `drawGate.ts` and patched the governor's
 * prototype from there, which made the governor's behaviour depend on whether
 * that file had happened to be imported: a node harness or a worker that took
 * only `governor.ts` got a class whose `setAmbient` was not there.
 *
 * The listeners are for the page's own state (the Sound panel's toggle and the
 * phone's tile follow a switch flipped from the Mac app's menu). The governor
 * and the gate read the flag when they next run and subscribe to nothing.
 */

let on = false;
const listeners = new Set<(on: boolean) => void>();

export function isGlobalAmbientMode(): boolean {
  return on;
}

export function setGlobalAmbientMode(next: boolean): void {
  next = Boolean(next);
  if (on === next) return;
  on = next;
  for (const fn of listeners) {
    try { fn(next); } catch { /* one listener's error must not stop the others */ }
  }
}

export function onAmbientModeChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
