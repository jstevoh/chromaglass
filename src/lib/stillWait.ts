/**
 * How long the opening waits for the page's frames before it asks the GPU
 * for its first compile (`introStill` in `lib/intro.ts`, `Quiet` in
 * `gpu/prepare.ts`). Plain functions over one small record, so the rule can
 * be run on made-up timelines in node (`npm run stillwait`) as well as in
 * the page.
 *
 * Why it waits at all: the desk's mount and its relayout frames should be
 * presented before the first fill is asked of the GPU process, or they sit
 * queued behind that compile (on CI's Mac those frames took 0.30 to 0.39 s
 * across three to four animation frames, and a 200 ms cap fired before the
 * first of them had rendered). So it waits for four frames.
 *
 * Why it now also stops waiting when the frames have stopped coming (PLAN.md
 * 19aa-7). On GitHub's Macs, with the shader cache empty, the GPU process is
 * often busy with something of its own just after it gives the device: the
 * page draws a frame or two and then none for two seconds and more, with
 * nothing of ours asked of the GPU yet. Read across the 116 `open` shard
 * runs of 2026-10-27 to 11-01: in 43 of them the first compile was asked
 * 1.51 to 2.77 s after the device was given, which is the old 1.5 s cap
 * firing, and in the other 73 0.06 to 0.18 s after it, which is four frames.
 * 16 of the 18 reds on startup's "moving for good no later than the old way"
 * were among the 43: the page sat idle for the cap's 1.5 s, its timer
 * ticking on time, and the check rightly counted that as the page's own,
 * since nothing else was holding the opening. Waiting bought nothing on those
 * runs: the frames it waited for were already queued in the busy GPU
 * process, and they came back after the cap had asked for the compile anyway
 * (run 41317399432: compile asked 3.82 s, frames back at 4.75 s). So the
 * opening was 1.5 s later than it needed to be, on a cold Mac, for nothing.
 *
 * The tell that the frames are held in the GPU process and not by the page
 * is the page's own timer: ticking on time with no frame drawn means the
 * page is free and Chromium has not asked it for one (it asks for the next
 * frame only once the last is presented). A thread that is busy, or held
 * from outside, ticks late, and those stretches are not counted, so a mount
 * that is the page's own work still gets its four frames, as before. Half a
 * second of free time without a frame is past every mount figure above (the
 * whole of a slow mount's frames, 0.39 s), and below every stall of the 43
 * (each over 1.5 s). The 1.5 s cap stays, as the guard for a tab hidden
 * part way and whatever else ends the frames: it is never later than before.
 */

/** Frames to see drawn, the desk's mount and its relayout, before the first compile. */
export const STILL_FRAMES = 4;
/** The longest it waits, however the frames go: the old rule's cap, unchanged. */
export const STILL_CAP_MS = 1500;
/** Free time without a frame that says the frames are held in the GPU process, not the page. */
export const STILL_STARVED_MS = 500;
/** How often the page's timer ticks while it waits. */
export const STILL_TICK_MS = 50;
/** A tick later than this after the last one was the page busy or held, not free. */
export const STILL_LATE_MS = 2 * STILL_TICK_MS;

export type StillDone = 'frames' | 'starved' | 'cap';

export interface StillWait {
  /** When it began to wait. */
  from: number;
  /** Frames drawn since. */
  frames: number;
  /** The last tick of the page's timer, or the last frame if later (or the start). */
  tick: number;
  /** Free time, the timer on time, since the last frame (or the start). */
  free: number;
}

export function stillWait(now: number): StillWait {
  return { from: now, frames: 0, tick: now, free: 0 };
}

/**
 * An animation frame was drawn at `now`. 'frames' once it is the last one
 * waited for. The free time counts again from this frame, not from the
 * timer's last tick before it.
 */
export function stillFrame(w: StillWait, now: number): StillDone | null {
  w.frames++;
  w.free = 0;
  w.tick = now;
  return w.frames >= STILL_FRAMES ? 'frames' : null;
}

/** The page's timer ticked at `now`. 'cap' or 'starved' if the wait is over. */
export function stillTick(w: StillWait, now: number): StillDone | null {
  // The four frames were drawn and the hand-on after the last is pending: it
  // was the frames that ended it, whatever the time.
  if (w.frames >= STILL_FRAMES) return 'frames';
  const dt = now - w.tick;
  w.tick = now;
  if (dt <= STILL_LATE_MS) w.free += dt;
  if (now - w.from >= STILL_CAP_MS) return 'cap';
  return w.free >= STILL_STARVED_MS ? 'starved' : null;
}

/** How long until the timer should tick again: its interval, or the cap if that is sooner, so the cap is never read late. */
export function stillNextTick(w: StillWait, now: number): number {
  return Math.max(0, Math.min(STILL_TICK_MS, w.from + STILL_CAP_MS - now));
}
