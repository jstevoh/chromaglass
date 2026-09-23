import type { QualityRung } from './platform';

/**
 * Frame-time governor: picks the quality rung the machine can actually hold.
 *
 * "Auto" used to mean the largest grid the GPU could *allocate*, which is the
 * wrong question — an integrated GPU allocates 512² happily and then crawls.
 * This watches the real frame interval and walks a ladder of rungs: down
 * quickly when frames are being dropped, up slowly when there's clear room.
 *
 * Two rules keep it from hunting. A rung that failed is not retried until
 * the machine has run fast for a long stretch (the hardware hasn't changed,
 * but the load may have: another tab, a camera app, a held tool), and every
 * move is followed by a settling period before the next judgement, long
 * enough for the new grid to be allocated and the caches to warm.
 */

/** Frames slower than this are being dropped on any display: step down. */
const SLOW_MS = 22;
/**
 * Only climb when frames are at 60 Hz with JS work well under budget. The
 * 60 Hz interval is 16.7 ms and the average sits at 17.0–17.5 with the
 * jitter, so the line is drawn clear of it; between FAST and HOLD the
 * climb clock holds rather than resets, so one long frame in ten seconds
 * does not keep a machine at its start rung for ever.
 */
const FAST_MS = 18.5;
const HOLD_MS = 20;
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
/**
 * A rung that failed is offered again after this long of fast frames; a
 * rung that failed while a tool was held (a press costs a burst of work
 * that says less about the rung) is offered again sooner.
 */
const RETRY_AFTER_S = 90;
const HELD_RETRY_AFTER_S = 30;

/**
 * How many solver steps a second to ask for (H2b, docs/roadmap.md).
 *
 * How far the liquid travels in a second is `steps per second × dt`. The loop
 * held the first at sixty and shrank the second for a slow look, so a plate
 * at Speed 0.012 ran the same hundred dispatches a step as one at 0.3 and
 * cost exactly the same. Holding `dt` and halving the rate is **the same
 * motion for half the work**, and the solver is most of a frame's GPU time.
 * Measured at 768² with two layers: a frame goes 38.6 ms → 16.8, and the
 * plate keeps *better* time — 29.8 of 30 steps where sixty managed 45.3 of
 * 60. A machine that cannot sustain sixty is already dropping steps, which is
 * slow motion; asking for thirty is not a compromise against that, it is a
 * repair of it.
 *
 * Two entries, and the floor is thirty for two reasons. Below about twenty to
 * twenty-five a plate stops flowing and starts stepping. And a rate that does
 * not divide the display's refresh is uneven in a way the number hides: at
 * forty-five on a 60 Hz screen three frames in four advance the liquid and
 * the fourth does not, which reads as judder at a rate the arithmetic calls
 * comfortable. Sixty and thirty both divide it.
 *
 * Thirty was watched on this M4 before it was wired to anything.
 */
export const STEP_RATES = [60, 30];

/**
 * The post chain's own level, spent before any rung while a heavy effect is
 * on (feedback, slit-scan): those passes are fill-bound, and a smaller solver
 * grid, all the rungs can offer, does nothing for them.
 *
 *   0  every pass at full resolution
 *   1  the heavy passes at half resolution
 *   2  the heavy passes off
 */
export type PostLevel = 0 | 1 | 2;

export class QualityGovernor {
  private index: number;
  private readonly start: number;
  /** Rung index → when it last failed (seconds). */
  private readonly failed = new Map<number, number>();
  private emaFrame = 16.7;
  private emaWork = 4;
  private slowSince: number | null = null;
  private fastSince: number | null = null;
  private settleUntil: number;
  private everSteppedDown = false;
  private hugeStreak = 0;
  private post: PostLevel = 0;
  /** Post level → when it last failed (seconds). */
  private readonly postFailed = new Map<number, number>();
  /** Index into `STEP_RATES`. */
  private steps = 0;
  /** Step-rate index → when it last failed (seconds). */
  private readonly stepsFailed = new Map<number, number>();
  /** Set each frame by the renderer: whether a heavy post pass is on. */
  heavyPost = false;

  /**
   * Held on one rung, for measuring it (`?rung=`).
   *
   * `?sim=` pins the grid but not the rung: a pinned grid turns the governor
   * off, and a governor that is off renders at one device pixel whatever the
   * rung says. So the two halves of a rung could not be measured together,
   * and the half that was missing — the pixels — is the half this ladder
   * turns out to be wrong about. This holds the whole rung instead.
   */
  private readonly pinned: boolean;

  constructor(private readonly rungs: QualityRung[], start: number, now: number, pin = false) {
    this.index = Math.max(0, Math.min(rungs.length - 1, start));
    this.start = this.index;
    this.pinned = pin;
    this.settleUntil = now + SETTLE_S;
  }

  get rung(): QualityRung {
    return this.rungs[this.index];
  }

  get frameMs(): number {
    return this.emaFrame;
  }

  /** The post chain's level. Back to 0 whenever no heavy pass is on: there is nothing to spare. */
  get postLevel(): PostLevel {
    return this.heavyPost ? this.post : 0;
  }

  /** Solver steps a second to ask the loop for. */
  get stepRate(): number {
    return STEP_RATES[this.steps];
  }

  /** Below where this machine started — the signal that it has less room than it looked. */
  get steppedDown(): boolean {
    return this.everSteppedDown && this.index > this.start;
  }

  /**
   * Feed one frame. `frameS` is the interval since the previous frame,
   * `workMs` the JavaScript time this frame took; `now` in seconds; `held`
   * true while a tool is being held on the plate; `gpuMs` what the GPU spent
   * on this frame, where the engine can say (WebGPU's timestamp queries —
   * WebGL's timer queries count queue waits on ANGLE and lie, so that path
   * passes nothing and nothing changes for it). Returns true when the rung
   * changed and the caller should reconfigure.
   *
   * The budget is spent by whichever of the two is larger. On the WebGL path
   * the JavaScript time is a fair stand-in for the frame's cost, because the
   * draw calls are made from it. On WebGPU it is not: a frame is half a
   * millisecond of encoding whatever the machine is actually doing, so the
   * climb gate — "only go up when there is room to spare" — was satisfied at
   * every rung, and the governor would climb into a grid the GPU could not
   * hold, discover it a second and a half later, and come back down. With
   * the real number it does not set off.
   */
  sample(frameS: number, workMs: number, now: number, held = false, gpuMs = 0): boolean {
    let frameMs = frameS * 1000;
    if (frameMs <= 0) return false;
    // Pinned: still average the frame, so the readout and the debug surface
    // report what this rung actually costs, but never move off it.
    if (this.pinned) {
      const kp = frameMs > this.emaFrame ? 0.25 : 0.08;
      this.emaFrame += (Math.min(frameMs, HUGE_MS) - this.emaFrame) * kp;
      this.emaWork += (Math.max(workMs, gpuMs) - this.emaWork) * 0.1;
      return false;
    }
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
    this.emaWork += (Math.max(workMs, gpuMs) - this.emaWork) * 0.1;

    if (now < this.settleUntil) return false;

    if (this.emaFrame > SLOW_MS) {
      this.fastSince = null;
      this.slowSince ??= now;
      /*
        The step rate first, because it is the only thing here that is free.

        A rung gives up resolution and a post level gives up an effect; both
        are visible, and both are permanent until the machine gets faster.
        Halving the step rate gives up nothing — the liquid travels the same
        distance in the same second, in steps twice as long — so it is tried
        before anything that costs a picture.

        It does not always help. A frame held up by a fill-bound post pass is
        not held up by the solver, and lowering the rate will not move it, so
        the governor spends one settling period finding that out before it
        reaches for the post level below. That is the right way round: two and
        a half seconds is cheap next to switching off an effect that was
        never the problem.
      */
      if (now - this.slowSince >= DOWN_AFTER_S && this.steps < STEP_RATES.length - 1) {
        this.stepsFailed.set(this.steps, held ? now - (RETRY_AFTER_S - HELD_RETRY_AFTER_S) : now);
        this.steps += 1;
        return this.moved(now);
      }
      // Then the post chain's level, while a heavy pass is on: the rungs
      // shrink the solver, and those passes are fill-bound.
      if (now - this.slowSince >= DOWN_AFTER_S && this.heavyPost && this.post < 2) {
        this.postFailed.set(this.post, held ? now - (RETRY_AFTER_S - HELD_RETRY_AFTER_S) : now);
        this.post = (this.post + 1) as PostLevel;
        return this.moved(now);
      }
      if (now - this.slowSince >= DOWN_AFTER_S && this.index < this.rungs.length - 1) {
        this.failed.set(this.index, held ? now - (RETRY_AFTER_S - HELD_RETRY_AFTER_S) : now);
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
        // Up in the reverse order of down: the rungs the solver lost below
        // where it started, then the effects, then any rung above the start.
        const above = this.index - 1;
        const failedAt = this.failed.get(above);
        const rungFree = above >= 0 && (failedAt === undefined || now - failedAt >= RETRY_AFTER_S);
        if (rungFree && this.index > this.start) {
          this.index = above;
          return this.moved(now);
        }
        const better = this.post - 1;
        const postFailedAt = this.postFailed.get(better);
        if (this.heavyPost && better >= 0 && (postFailedAt === undefined || now - postFailedAt >= RETRY_AFTER_S)) {
          this.post = better as PostLevel;
          return this.moved(now);
        }
        /*
          And the step rate last, for the same reason it went first: going
          back to sixty spends the headroom and buys nothing anyone can see.

          "Last" cannot be left to the retry clocks, which was the first
          attempt at this and is wrong in a way that looks right. The rate is
          given up first, so its ninety seconds expire first, so it is the
          first thing eligible to come back — the intended order, inverted by
          the very fact that it was intended. `npm run rungs` caught it.

          So the condition is stated rather than timed: the rate returns only
          when nothing visible is still given up — every rung back to where
          this machine started, and no effect still switched off. The clock
          stays as well, to keep it from hunting on a machine that is sitting
          right on the line.
        */
        const faster = this.steps - 1;
        const stepsFailedAt = this.stepsFailed.get(faster);
        const pictureWhole = this.index <= this.start && this.post === 0;
        if (faster >= 0 && pictureWhole && (stepsFailedAt === undefined || now - stepsFailedAt >= RETRY_AFTER_S)) {
          this.steps = faster;
          return this.moved(now);
        }
        if (rungFree) {
          this.index = above;
          return this.moved(now);
        }
        this.fastSince = now;   // nothing to climb to; keep the clock fresh
      }
      return false;
    }
    if (this.emaFrame > HOLD_MS || this.emaWork >= WORK_BUDGET_MS) this.fastSince = null;
    return false;
  }

  /**
   * The rung could not be built at all: the solver's textures would not
   * allocate, which on a laptop mid-set is the GPU out of memory, not a GPU
   * that cannot run the show. Step down and never climb back to it this
   * session — a rung that failed to exist once will fail again, and each
   * attempt costs the plate. False at the bottom rung: nothing smaller left.
   */
  failRung(now: number): boolean {
    if (this.index >= this.rungs.length - 1) return false;
    this.failed.set(this.index, Number.POSITIVE_INFINITY);
    this.index += 1;
    this.everSteppedDown = true;
    return this.moved(now);
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
