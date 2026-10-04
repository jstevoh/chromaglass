/**
 * One clock for the plate while the wall is up (PLAN.md §14b).
 *
 * What was wrong. The plate is drawn on two clocks when the projector window
 * is open: the show window's own animation frames, and the projector window's
 * (`CastDisplay` asks for a frame on every one of its own refreshes, through
 * `__chromaglassFrame` in `LiquidVisualizer`, so that the wall keeps moving
 * when the show window is covered and gets no frames at all). The guard on
 * the ask compared it only with the projector's previous ask; the show's own
 * frames never stamped anything. With both windows visible, on two displays
 * whose refreshes are not in step, every ask landed some way into the show's
 * refresh, cancelled the show's pending frame, drew, and asked for another
 * frame, which the show's display then served at its next refresh as well.
 * Two draws a refresh, each carrying the readback and the mirror copy, and the
 * quality governor, fed the interval between them, saw two half-rate clocks
 * as one full-rate one and never stepped down while the wall was up.
 *
 * What this does. Every draw is stamped here, whichever window asked for it,
 * and an offer that comes within `DRAW_SKIP_FRACTION` of a refresh of the last
 * draw is turned down. Only a frame let through reaches the frame loop, so
 * the interval the loop measures and feeds the governor (`frameS`) is the
 * interval between real draws, with nothing more to change there.
 *
 * `npm run wall` measures it in the app, with the real projector window open
 * and both windows animating on one 60 Hz display, the projector's clock put
 * 0, a quarter, a half and three quarters of a refresh behind: 119.1 to 120.2
 * draws a second before this, 59.8 to 60.3 after, and with draws that hold
 * the thread for 11.7 ms, 72.3 before and 60.0 after (one run of each on the
 * same tree); covered, with the projector's frames handed over raggedly, 61
 * of 121 asks drawn before and 120 of 120 after.
 *
 * Why the show's own frames are gated too, and not only the asks, which is
 * what PLAN.md first wrote. With the ask alone gated, two 60 Hz clocks whose
 * phases differ by more than 0.6 of a refresh still draw twice: the show draws
 * at 0, the ask at 0.7 is past the gate and draws, cancels the show's pending
 * frame and asks for a new one, the show's display serves it at 1.0, three
 * tenths of a refresh later, and nothing stops it. That is 40 % of the
 * possible phases, and a projector's refresh drifts through all of them over
 * a set. Gating both makes whichever clock is ahead the one that draws, one
 * frame a refresh either way. (The arithmetic in `npm run wall` keeps the
 * asks-only rule as a control: 120 draws a second at its worst phase, on the
 * clocks where the gate draws 60.)
 *
 * Why an offer is gated only while the *other* clock is running too
 * (`CLOCK_FRESH_MS`). One clock alone is one clock, whatever its rhythm, and
 * every tick of it is a frame someone sees: a show with no wall runs exactly
 * as it did, frame for frame, and a covered show draws every frame the wall
 * asks for. The second matters more than it looks. A busy machine's frames
 * are ragged (the Mac runner's covered show drew 44 a second from asks 20 to
 * 200 ms apart, `lib/earClock.ts`), and a gate on the asks alone would turn
 * down the one that came early after a late one, which is a frame the wall
 * then shows twice: the judder this is meant to save work without causing.
 *
 * Why every offer is stamped with its refresh's own time, and not with the
 * time its callback happened to run. Both windows run on one main thread, so
 * when both clocks land in one refresh the second callback runs only after
 * the first one's draw has finished. The first version of this stamped with
 * `performance.now()` in the callback, and a draw that took more than 0.6 of
 * a refresh made the second callback look like the next refresh's, so it drew
 * too: found in review, 87 draws a second at 60 Hz once a draw cost 10.5 ms,
 * 174 at 120 Hz with 5.5 ms draws, and the governor, fed the gap between
 * those two draws, read a machine at the edge of its budget as one with room
 * to spare. The time a refresh began does not move with how busy the thread
 * is. So the show's own frames pass their `requestAnimationFrame` timestamp,
 * and the projector passes its own, moved onto the show's clock by the
 * difference between the two windows' `performance.timeOrigin`
 * (`CastDisplay`). `refreshStamp` takes it when it is believable and falls
 * back to the time now when there is none (an ask from a harness, or from a
 * projector window built before this).
 *
 * Why 0.6 of a refresh, and not a half or a whole. A whole refresh would turn
 * down a frame that arrives a millisecond early, which every clock does, and
 * halve the rate. A half lets two clocks half a refresh apart both through.
 * 0.6 is past the half with room for a millisecond or two of jitter either
 * way, and short of the next refresh by the same.
 *
 * Why the refresh is the faster clock's. Each clock's own interval is its
 * display's refresh (or what a busy machine manages of it), and neither is
 * changed by what the gate turns down: a turned-down show frame asks for the
 * next one at once, and the projector asks on every refresh whatever became of
 * the last ask. So the gaps between one clock's own offers measure its display
 * whatever the other is doing. The shorter of the two is used, so neither
 * window ever gets fewer frames than its own display would give it alone: a
 * 120 Hz laptop keeps its 120 with a 60 Hz projector beside it (the draw
 * rate is then the laptop's, not the sum of both), and a covered show draws
 * every frame the projector asks for. The gaps between *draws* would be the
 * wrong measure: once doubled they are half a refresh, the gate's threshold
 * falls with them, and the doubled rate holds itself up.
 *
 * Why a median of the last few gaps, and bounds. One late frame (a long task,
 * a collection) is a single long gap, and a mean would carry it into the next
 * dozen gates; the median of eight ignores it. Below, the fastest display
 * there is: nothing refreshes faster than 240 Hz (4.2 ms), so a burst of
 * frames closer than that is jitter, not a refresh, and cannot talk the gate
 * down to nothing. Above, only what a running clock can have: a gap longer
 * than `CLOCK_FRESH_MS` clears the clock's history instead of joining it.
 * Not a display's slowest refresh, 30 Hz, which was the first bound written
 * here: with the refresh held at 33 ms the gate turns down only offers within
 * 20 ms of a draw, so two clocks slower than 25 a second (40 ms apart), half
 * a tick out of step, are both let through, doubling the draws on exactly the
 * machines least able to pay for them (the Mac runner's busy app already
 * draws 28 a second). A clock that slow is still the rate the browser is
 * giving these windows, and one draw per tick of it is all anyone can see.
 * Before either clock has two offers to measure, 60 Hz.
 *
 * Why a clock's own next refresh is never turned down, whatever the refresh
 * reads. The gate is there to stop the two clocks drawing one refresh twice;
 * one clock's consecutive offers are consecutive refreshes of its own display
 * (one animation frame a refresh), never the same one. Turning one down
 * because of that clock's own last draw, or because of a draw by the other
 * clock whose refresh this clock has already offered for, is the wall
 * costing the show a frame it would have drawn alone. And on a busy machine
 * it did: a window handed only some of its refreshes has gaps of one, two or
 * three refreshes, the median of them reads two, the gate's 0.6 of that is
 * 1.2 refreshes, and the show's next frame one refresh after its own draw was
 * turned down with nothing drawn in its place. `npm run wall` on the Mac
 * runners, 53 runs: with both clocks on one refresh the gate drew 24.3 a
 * second while the show's window was handed 28.3 (0.86), and 24.4 of 28.3,
 * and 34.8 where the wall's window was handed 38.7; its arithmetic on a 60 Hz
 * display missing refreshes, 0.75 of what either window alone would have
 * drawn at worst, and 0.99 with this rule. So
 * an offer within 0.6 of a refresh of the last draw is turned down only when
 * that draw was the other clock's and it is this clock's first offer since:
 * one turned down per clock per draw, which is all that one refresh holds.
 * An offer stamped within a 240 Hz refresh of its own clock's last one is
 * that same refresh again, and is judged as before.
 *
 * A clock that has stopped (the show window covered, the projector closed) is
 * forgotten after `CLOCK_FRESH_MS`: its gaps are dropped, and its first gap
 * when it starts again, which is the time it was stopped, is not a refresh.
 *
 * Pure: no DOM, so `npm run wall` measures the arithmetic in node as well as
 * the app with the projector window open.
 */

export type DrawSource = 'frame' | 'ask';

/** An offer this soon after the last draw, as a fraction of a refresh, is turned down. */
export const DRAW_SKIP_FRACTION = 0.6;
/** The fastest display there is: 240 Hz. */
export const REFRESH_MIN_MS = 1000 / 240;
/** What is assumed before either clock has been measured. */
export const REFRESH_DEFAULT_MS = 1000 / 60;
/**
 * How long a clock may go quiet and still count as running: a quarter of a
 * second, the same hold `lib/earClock.ts` gives the wall's ragged asks
 * (the Mac runner's busy app drew 28 a second, with gaps past 50 ms).
 */
export const CLOCK_FRESH_MS = 250;
/** How many of a clock's own gaps the refresh is the median of. */
const GAPS = 8;
/**
 * How old a refresh's timestamp may be when its callback runs and still be
 * believed: a second. A callback held up behind a long draw, a collection or
 * another window's frame runs late but keeps its refresh's time, and that is
 * the whole point; a stamp older than a second is a clock that is not this
 * one. And no later than one refresh of the fastest display ahead of now.
 *
 * That bound was 2 ms, on the belief that in Chrome a refresh's timestamp is
 * never ahead of now and that 2 ms covers two windows' time origins rounded
 * as browsers round them. The Mac runners say otherwise: `npm run wall`
 * failed on four of one PR's five Mac runs with one to six stamps a run
 * turned down, and once the fallbacks were told apart (`stampMisses` below)
 * every one of them was ahead of now, the worst by 2.4 ms in every reading,
 * none of them stale. Which clock runs ahead, the show's own frame or the
 * wall's converted one, the page-wide count does not say (a Mac's display
 * link stamping a frame with the refresh it is for would do it; inferred,
 * not measured). It does not matter to the gate: an offer is turned down
 * within 0.6 of a refresh of the last draw precisely so that a clock a
 * millisecond or two early still counts as the refresh it belongs to, and a
 * stamp up to a 240 Hz refresh ahead is still that refresh's at any rate the
 * gate works to. Further ahead than that it would be naming the next one, so
 * it is not believed. Turning a real stamp down is not the safe side either:
 * the fallback stamps with the time the callback ran, which is the stamping
 * that let a slow frame's second clock draw too.
 */
const STAMP_OLDEST_MS = 1000;
const STAMP_AHEAD_MS = REFRESH_MIN_MS;

/**
 * The time to offer a frame at (ms, on this window's clock): its refresh's
 * own timestamp `ts` when there is a believable one, else `now`.
 */
export function refreshStamp(ts: unknown, now: number): number {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return now;
  if (ts > now + STAMP_AHEAD_MS || ts < now - STAMP_OLDEST_MS) {
    stampFallbacks++;
    const ahead = ts > now;
    const by = Math.abs(ts - now);
    if (ahead) { stampMisses.ahead++; stampMisses.aheadMs = Math.max(stampMisses.aheadMs, by); }
    else { stampMisses.stale++; stampMisses.staleMs = Math.max(stampMisses.staleMs, by); }
    stampMisses.lastAt = now;
    return now;
  }
  return ts;
}

/**
 * How many timestamps `refreshStamp` did not believe, for `?debug`. A
 * fallback is stamping at the time the callback ran, which is the stamping
 * that let a slow frame's second clock draw too. Headless on Linux a
 * refresh's timestamp was never ahead of now (the second pre-push review
 * measured the show's 0.2 to 0.7 ms behind, the wall's converted one 6.3 to
 * 6.9 ms); on the Mac runners some were, by up to 2.4 ms, which the bound
 * above now believes. So this should read 0. On another browser, or a wall whose time origin is
 * converted wrong, it is the one place that says so. A missing timestamp
 * (a call that is not an animation frame) is not counted.
 */
export let stampFallbacks = 0;
/**
 * The same fallbacks told apart, for `?debug` and `npm run wall`: stamps
 * ahead of now (a clock ahead of this one) and stamps older than a second
 * (a callback held up that long, or a wall whose time origin was converted
 * wrong: the wall opens after the show, so a missing or reversed conversion
 * puts its stamps seconds behind, not ahead), each with the worst gap seen and when the last one was. The
 * check went red on one PR's Mac runs with a single fallback, three runs
 * out of three, and the total alone could not say which bound it was or
 * when; this does not change what is believed, only what is reported.
 */
export const stampMisses = { ahead: 0, aheadMs: 0, stale: 0, staleMs: 0, lastAt: 0 };

export class DrawGate {
  /** When anything was last drawn (ms). */
  lastDraw = -Infinity;
  private readonly lastOffer: Record<DrawSource, number> = { frame: -Infinity, ask: -Infinity };
  private readonly gaps: Record<DrawSource, number[]> = { frame: [], ask: [] };
  /**
   * Whether each clock has offered since the last draw (or made it): its one
   * refresh that draw stands for is spent, so its next offer is a refresh of
   * its own (see "a clock's own next refresh" above).
   */
  private readonly spent: Record<DrawSource, boolean> = { frame: false, ask: false };
  /** Offers drawn and turned down, by who offered them. For the check and `?debug`. */
  readonly drawn: Record<DrawSource, number> = { frame: 0, ask: 0 };
  readonly skipped: Record<DrawSource, number> = { frame: 0, ask: 0 };

  /** Whether both clocks have offered within the last `CLOCK_FRESH_MS` at `now`: the only time anything is gated. */
  twoClocks(now: number): boolean {
    return now - this.lastOffer.ask <= CLOCK_FRESH_MS && now - this.lastOffer.frame <= CLOCK_FRESH_MS;
  }

  /** The refresh the gate works to at `now` (ms): the faster running clock's median gap, never under 240 Hz's. */
  refreshMs(now: number): number {
    let best = Infinity;
    for (const source of ['frame', 'ask'] as const) {
      const g = this.gaps[source];
      if (g.length === 0 || now - this.lastOffer[source] > CLOCK_FRESH_MS) continue;
      const sorted = [...g].sort((a, b) => a - b);
      best = Math.min(best, sorted[sorted.length >> 1]);
    }
    if (!Number.isFinite(best)) return REFRESH_DEFAULT_MS;
    return Math.max(REFRESH_MIN_MS, best);
  }

  /**
   * Whether the frame `source` offers for the refresh that began at `now` (ms;
   * see `refreshStamp`) should be drawn; stamps it if so. Every offer is
   * recorded as its clock's tick whether or not it draws. Two clocks' stamps
   * can arrive out of order (a projector's refresh that began before the
   * show's, whose callback ran after it): that one is behind the last draw,
   * so it is in that draw's refresh, and is turned down.
   */
  offer(source: DrawSource, now: number): boolean {
    const gap = now - this.lastOffer[source];
    const g = this.gaps[source];
    if (gap > CLOCK_FRESH_MS) g.length = 0;
    else if (gap > 0) { g.push(gap); if (g.length > GAPS) g.shift(); }
    this.lastOffer[source] = now;
    // Gated only while the other clock is running too: one clock alone, the
    // show with no wall or the wall with the show covered, draws every tick.
    // And never this clock's own next refresh (see above).
    const ownNext = this.spent[source] && gap >= REFRESH_MIN_MS;
    if (this.twoClocks(now) && now - this.lastDraw < DRAW_SKIP_FRACTION * this.refreshMs(now) && !ownNext) {
      // An offer stamped behind the last draw (its callback ran late, after
      // the other clock's next refresh) is an earlier refresh, not the one
      // that draw stands for, so it does not spend it: else this clock's
      // next offer, in the drawn refresh, would draw it again (the second
      // pre-push review: 4.9 % of refreshes drawn twice with one ask in
      // twenty late, 0 with this).
      this.spent[source] = now >= this.lastDraw - REFRESH_MIN_MS;
      this.skipped[source]++;
      return false;
    }
    this.lastDraw = now;
    this.spent.frame = source === 'frame';
    this.spent.ask = source === 'ask';
    this.drawn[source]++;
    return true;
  }
}
