/**
 * The show's clock: real time while the show is live, fixed steps while a
 * song is being rendered.
 *
 * PLAN.md §6 asks for a song rendered twice to come out byte-identical, and
 * the seeded dice (lib/rng.ts) were half of that. The other half is time.
 * Everything on the plate that moves on its own reads a clock: the plate
 * shader's `time` (camera grain, the cells, the fbm and the solver's noise are
 * all functions of it) is real elapsed time times the speed; the phrasing and
 * the modulators step on real elapsed seconds; the Soap Bursts' idle timer,
 * the BZ reseed every thirty seconds and the closeup's hue journey compare
 * `performance.now()` against a stamp; Evolve's drift is a six-second
 * `setInterval`; the sequencer and a song's show tick on intervals and read
 * `performance.now()`. Each of those is deterministic *given the same
 * sequence of clock readings*, and a live frame loop can never give the same
 * sequence twice: a frame lands 16.4 ms after the last one, or 17.1, or 33
 * when the tab was busy.
 *
 * So there is one clock, here, and the show reads it instead of the
 * browser's:
 *
 *   - `showNow()` in place of `performance.now()` (milliseconds);
 *   - `showEpochS()` in place of `Date.now() * 0.001` (seconds);
 *   - `showInterval()` / `clearShowInterval()` in place of `setInterval` /
 *     `clearInterval`, for the timers whose firing changes the picture.
 *
 * ## Live, nothing changes
 *
 * With no render running these *are* the browser's: `showNow()` returns
 * `performance.now()`, `showEpochS()` returns `Date.now() * 0.001`, and
 * `showInterval` calls `setInterval` with the same function and period. Not a
 * scaled or offset copy of them: the same numbers, so every comparison the
 * show makes live between a stamp taken here and one taken by code that
 * still reads the browser directly (a tapped tempo, the room camera's
 * readings) means what it meant before. `npm run render` holds that: live,
 * each of the three is compared against the browser's own.
 *
 * ## Rendering
 *
 * `beginFixedClock(fps)` stops reading the browser. From then on time is
 * frame `i` of the render, and only that:
 *
 *     showNow()    = RENDER_ORIGIN_MS + i * 1000 / fps
 *     showEpochS() = (RENDER_ORIGIN_MS + i * 1000 / fps) / 1000
 *
 * and `tickFixedClock()` moves to frame `i + 1`, firing every show interval
 * that has come due, in a fixed order. Nothing between two ticks moves the
 * clock, however long the encoder takes over a frame, so the plate's every
 * reading of time is a function of the frame number and the frame rate.
 *
 * Why a fixed origin rather than carrying on from the real clock: the
 * readings have to be the same *numbers* on every render, not only the same
 * differences, because a float sum depends on the size of what it is added
 * to. `t + 16.666…` rounds differently at t = 5 000 than at t = 3 600 000, so
 * a render started a minute into the evening and one started an hour in
 * would drift apart by a last bit here and there, and a last bit in a
 * uniform is a different pixel a few hundred frames later. A fixed origin
 * makes every reading the same double on every run.
 *
 * Why 2^20 ms (about seventeen minutes) and not 0: several stamps in the
 * show use 0 for "never" (`soapAtRef`, `bzSeedAtRef`, the maze's kick
 * envelope) and compare "now minus then" against a few seconds. On a page
 * opened a while ago those read "long ago"; with an origin of 0 they would
 * read "just now" for the render's first seconds, and a render would open
 * with the soap and the reaction held back where the live show never holds
 * them. Seventeen minutes is longer than every such threshold in the show
 * (the longest, the BZ reseed, is thirty seconds), and a power of two, so
 * `origin + i·step` loses nothing to the origin that it would not lose
 * anyway.
 *
 * Stamps taken *before* the render began are the caller's to clear: the
 * visualizer resets its own when a render starts and again when it ends
 * (`LiquidVisualizer`'s render hooks), so neither side sees the other's
 * clock. That is a deliberate choice over keeping the render's clock
 * continuous with the real one (an offset carried forward after the render),
 * which would have kept every stamp comparable but left `showNow()` a
 * different number from `performance.now()` for the rest of the night, and
 * so broken every comparison with code that stamps with the browser's clock.
 *
 * ## Show intervals while rendering
 *
 * A live `setInterval` fires on the browser's schedule, which is the very
 * thing a render cannot have. While the clock is fixed, each show interval's
 * real timer is stopped and the interval is fired from `tickFixedClock()`
 * instead, every time the fixed clock passes its next due time. When several
 * come due on the same tick they fire in order of due time, then of their
 * `key`, then of when they were made, so the order two timers fire in cannot
 * depend on which React effect happened to subscribe first. When the render
 * ends each gets its real timer back, due a full period from then.
 *
 * The callbacks mostly set React state (a drift glide, a look fade). The
 * render loop wraps each tick in `flushSync`, so those updates have reached
 * the visualizer before the frame they belong to is drawn — otherwise when
 * React got round to committing them would decide which frame a glide step
 * lands on, which is the frame loop's bad luck again by another route.
 *
 * Pure: no DOM, no React, so `npm run render` measures it in node.
 */

/** Where the render's clock starts, in milliseconds. See "Why 2^20 ms" above. */
export const RENDER_ORIGIN_MS = 1 << 20;

interface ShowTimer {
  readonly fn: () => void;
  readonly ms: number;
  readonly key: string;
  readonly seq: number;
  /** The browser's timer, while live; null while the fixed clock drives it. */
  live: ReturnType<typeof setInterval> | null;
  /** On the fixed clock: when it next fires, in `showNow()` milliseconds. */
  due: number;
  cleared: boolean;
}

/** A show interval, as `showInterval` returns it and `clearShowInterval` takes it. */
export type ShowIntervalHandle = { readonly __showTimer: true };

const perf = (): number => {
  const p = (globalThis as { performance?: { now(): number } }).performance;
  return p ? p.now() : Date.now();
};

let fixed: { fps: number; frame: number } | null = null;
const timers = new Set<ShowTimer>();
const handles = new WeakMap<ShowIntervalHandle, ShowTimer>();
let seq = 0;

/** Milliseconds, for `performance.now()`: the browser's live, the frame's while rendering. */
export function showNow(): number {
  return fixed ? RENDER_ORIGIN_MS + (fixed.frame * 1000) / fixed.fps : perf();
}

/** Seconds, for `Date.now() * 0.001`: the browser's live, the frame's while rendering. */
export function showEpochS(): number {
  return fixed ? (RENDER_ORIGIN_MS + (fixed.frame * 1000) / fixed.fps) / 1000 : Date.now() * 0.001;
}

/** Whether a render owns the clock. */
export function clockIsFixed(): boolean {
  return fixed !== null;
}

/** The render's frame number and rate, or null live. */
export function fixedClock(): { fps: number; frame: number } | null {
  return fixed ? { ...fixed } : null;
}

/**
 * `setInterval`, on the show's clock. Live it *is* `setInterval(fn, ms)`.
 * `key` names the timer for the order ties fire in while rendering (see the
 * header); anything stable and distinct will do.
 */
export function showInterval(fn: () => void, ms: number, key: string): ShowIntervalHandle {
  const t: ShowTimer = { fn, ms: Math.max(1, ms), key, seq: seq++, live: null, due: 0, cleared: false };
  if (fixed) t.due = showNow() + t.ms;
  else t.live = setInterval(fn, ms);
  timers.add(t);
  const handle = { __showTimer: true } as ShowIntervalHandle;
  handles.set(handle, t);
  return handle;
}

/** `clearInterval` for a show interval. Null and undefined are ignored, as `clearInterval` ignores them. */
export function clearShowInterval(handle: ShowIntervalHandle | null | undefined): void {
  if (!handle) return;
  const t = handles.get(handle);
  if (!t) return;
  if (t.live !== null) clearInterval(t.live);
  t.live = null;
  t.cleared = true;
  timers.delete(t);
}

/**
 * Take the clock: from here time is frame 0 at `fps`. Every show interval's
 * real timer stops, and it is due one period after the render's start, as if
 * it had been started with it.
 */
export function beginFixedClock(fps: number): void {
  if (!(fps > 0) || !Number.isFinite(fps)) throw new Error(`the show clock needs a frame rate, not ${fps}`);
  fixed = { fps, frame: 0 };
  for (const t of timers) {
    if (t.live !== null) clearInterval(t.live);
    t.live = null;
    t.due = RENDER_ORIGIN_MS + t.ms;
  }
}

/**
 * The next frame: the clock moves one step of 1/fps, and every show interval
 * that has come due fires, in (due, key, made) order, as many times as it
 * owes. Returns how many fired, for the check.
 */
export function tickFixedClock(): number {
  if (!fixed) throw new Error('tickFixedClock with no render running');
  fixed.frame++;
  const now = showNow();
  let fired = 0;
  for (;;) {
    let next: ShowTimer | null = null;
    for (const t of timers) {
      if (t.cleared || t.due > now) continue;
      if (!next || t.due < next.due || (t.due === next.due && (t.key < next.key || (t.key === next.key && t.seq < next.seq)))) next = t;
    }
    if (!next) break;
    next.due += next.ms;
    fired++;
    next.fn();
  }
  return fired;
}

/** Give the clock back: time is the browser's again, and every show interval has its real timer. */
export function endFixedClock(): void {
  if (!fixed) return;
  fixed = null;
  for (const t of timers) {
    if (t.cleared || t.live !== null) continue;
    t.live = setInterval(t.fn, t.ms);
  }
}

/** How many show intervals exist, for the check. */
export function showIntervalCount(): number {
  return timers.size;
}
