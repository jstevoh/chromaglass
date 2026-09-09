import type { QualityRung } from './platform';

/**
 * Frame-time governor: picks the quality rung the machine can actually hold.
 *
 * "Auto" used to mean the largest grid the GPU could *allocate*, which is the
 * wrong question — an integrated GPU allocates 512² happily and then crawls.
 * This watches the real frame interval and walks a ladder of rungs: down
 * quickly when frames are being dropped, up slowly when there's clear room.
 *
 * Two rules keep it from hunting. A rung that failed is not retried this
 * session (the hardware hasn't changed), and every move is followed by a
 * settling period before the next judgement, long enough for the new grid
 * to be allocated and the caches to warm.
 */

/** Frames slower than this are being dropped on any display: step down. */
const SLOW_MS = 22;
/** Only climb when frames are comfortably at 60 Hz with JS work well under budget. */
const FAST_MS = 17.5;
const WORK_BUDGET_MS = 9;
/** How long a verdict must hold before acting on it. */
const DOWN_AFTER_S = 1.5;
const UP_AFTER_S = 8;
/** Grace after any change, and after start, before judging at all. */
const SETTLE_S = 2.5;
/**
 * One frame this long is a tab coming back from the background, not a
 * measurement; three in a row is a machine that genuinely can't keep up, and
 * counts — clamped, so one number doesn't drag the average for ten seconds.
 */
const HUGE_MS = 500;

export class QualityGovernor {
  private index: number;
  private readonly start: number;
  private readonly failed = new Set<number>();
  private emaFrame = 16.7;
  private emaWork = 4;
  private slowSince: number | null = null;
  private fastSince: number | null = null;
  private settleUntil: number;
  private everSteppedDown = false;
  private hugeStreak = 0;

  constructor(private readonly rungs: QualityRung[], start: number, now: number) {
    this.index = Math.max(0, Math.min(rungs.length - 1, start));
    this.start = this.index;
    this.settleUntil = now + SETTLE_S;
  }

  get rung(): QualityRung {
    return this.rungs[this.index];
  }

  get frameMs(): number {
    return this.emaFrame;
  }

  /** Below where this machine started — the signal that it has less room than it looked. */
  get steppedDown(): boolean {
    return this.everSteppedDown && this.index > this.start;
  }

  /**
   * Feed one frame. `frameS` is the interval since the previous frame,
   * `workMs` the JavaScript time this frame took; `now` in seconds. Returns
   * true when the rung changed and the caller should reconfigure.
   */
  sample(frameS: number, workMs: number, now: number): boolean {
    let frameMs = frameS * 1000;
    if (frameMs <= 0) return false;
    if (frameMs > HUGE_MS) {
      if (++this.hugeStreak < 3) return false;
      frameMs = HUGE_MS;
    } else {
      this.hugeStreak = 0;
    }
    // Slow frames register faster than fast ones: a stutter is felt at once,
    // smoothness has to be sustained to count.
    const k = frameMs > this.emaFrame ? 0.25 : 0.08;
    this.emaFrame += (frameMs - this.emaFrame) * k;
    this.emaWork += (workMs - this.emaWork) * 0.1;

    if (now < this.settleUntil) return false;

    if (this.emaFrame > SLOW_MS) {
      this.fastSince = null;
      this.slowSince ??= now;
      if (now - this.slowSince >= DOWN_AFTER_S && this.index < this.rungs.length - 1) {
        this.failed.add(this.index);
        this.index += 1;
        this.everSteppedDown = true;
        return this.moved(now);
      }
      return false;
    }
    this.slowSince = null;

    if (this.emaFrame < FAST_MS && this.emaWork < WORK_BUDGET_MS) {
      this.fastSince ??= now;
      if (now - this.fastSince >= UP_AFTER_S) {
        const above = this.index - 1;
        if (above >= 0 && !this.failed.has(above)) {
          this.index = above;
          return this.moved(now);
        }
        this.fastSince = now;   // nothing to climb to; keep the clock fresh
      }
      return false;
    }
    this.fastSince = null;
    return false;
  }

  private moved(now: number): boolean {
    this.settleUntil = now + SETTLE_S;
    this.slowSince = null;
    this.fastSince = null;
    // The averages carry the old rung's numbers; restart them at "fine" so a
    // downward move isn't judged again on stale slowness.
    this.emaFrame = 16.7;
    this.emaWork = Math.min(this.emaWork, WORK_BUDGET_MS);
    return true;
  }
}
