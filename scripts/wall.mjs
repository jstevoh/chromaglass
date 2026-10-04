#!/usr/bin/env node
/**
 * Does the picture arrive on the wall the way the projector needs it?
 *
 *   npm run wall
 *
 * Load-in is the one part of the craft that is pure geometry, so it is the
 * one part that can be checked exactly rather than looked at. Every gate here
 * is a statement about which pixels are black and which are not, which holds
 * whatever the plate happens to be doing at the time — the plate is liquid and
 * never twice the same, and a harness that depended on its content would
 * disagree with itself run to run the way earlier ones here did.
 *
 * What is measured:
 *
 *   identity    nothing set changes nothing, and the pass is never built
 *   mask        a blanked edge is *black*, to the pixel, and the rest is not
 *   corner pin  outside the pinned quad is black, inside it is the picture
 *   flip        the picture reverses inside the quad while the quad stays put
 *   grade       gain lifts what is on the wall, and gamma is not gain
 *   sources     a projector showing the front plate, the back plate or the
 *               film alone shows that and not the wall (PLAN.md §16b), and
 *               what each extra picture costs the GPU
 *   one clock   with the projector window open and both windows animating,
 *               the plate draws at most once for each refresh either window
 *               was handed (1.05 times them) and at least 0.9 of what
 *               either window alone would have drawn in the same seconds,
 *               at every phase and on a busy machine
 *               between the two clocks, and with draws that hold the thread
 *               for 0.7 of a refresh; covered, every ask the projector makes
 *               draws, however raggedly (PLAN.md §14b; lib/drawGate.ts in
 *               arithmetic first, then the app, counted rather than
 *               photographed, so it runs without a GPU too)
 *
 * One page load, one plate: the config is set on the plate that is already
 * running, so a before and an after are the same look half a second apart
 * rather than two different plates from two page loads. Reloading between
 * configs is what an earlier shape of this did, and it made "did the picture
 * reverse?" unanswerable.
 *
 * Either solver will do. The output pass lives in the renderer, not the
 * solver, and both the GPU and the CPU path draw through the same WebGL2
 * composite — so a governor that steps down mid-run changes nothing here.
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { FlashGuard } from '../src/lib/flashGuard.ts';
import { DrawGate, refreshStamp } from '../src/lib/drawGate.ts';
import { engineQuery, installFrameReader } from './frame.mjs';

const PORT = Number(process.env.WALL_PORT ?? 4324);

/*
  How many pixels the plate is drawn into, as a fraction of the window.

  The same `?dpr=` override the show-night suite uses, and for the same reason:
  with no GPU, WebGL goes through SwiftShader and the browser's GPU process
  spends three of four cores shading fragments while every step here queues
  behind it. This harness was measured at 9.8 minutes on a runner.

  Safe here because every claim it makes is *normalised*. `gridOf` reduces the
  canvas to a 32x18 grid of block means and `at()` addresses that grid in
  fractions of the picture, so "the left third is black" is the same statement
  at any resolution. Half rather than the show night's 0.35, because this is
  the harness that makes precise claims about geometry — a corner pin and a
  feathered mask edge — and at 0.5 each grid cell is still an average over
  sixteen by twenty source pixels, far more than an edge's softening.

  WALL_DPR=1 runs it at the window's own resolution.
*/
const DPR = process.env.WALL_DPR ?? '0.5';
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  const line = `${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  // Piped (`npm run wall | tail`), the terminal still sees progress on stderr.
  // Only when stderr is a terminal, though: with `2>&1`, or on CI where neither
  // is, writing both printed every check twice.
  if (!process.stdout.isTTY && process.stderr.isTTY) process.stderr.write(line + '\n');
};

// ── The flash guard, before anything is launched ─────────────────────
//
// This half is arithmetic, so it does not need a browser: luminance traces in,
// a gain out, and the loop closed the way the renderer closes it (the guard
// sees what it has already corrected, or it would pull harder for ever against
// a flash it had already flattened).
//
// The two things being checked pull against each other, which is the whole
// design: hold a strobe under three flashes a second, and leave a single hard
// hit on a kick completely alone.
{
  const HZ = 60;
  const FRAME = 1000 / HZ;

  /**
   * Flashes per second in the worst one-second window.
   *
   * A flash is a *pair* of opposing changes, so it is counted once per
   * completed trough-to-peak excursion, not once per turning point — counting
   * turns doubles the rate and would have this harness certifying a two-hertz
   * show as a four-hertz one. Written out independently of the guard rather
   * than imported from it, so a mistake in the rule cannot pass itself.
   */
  const flashRate = (delivered) => {
    let rising = true, turn = delivered[0]?.lum ?? 0, last = turn;
    const at = [];
    for (const { t, lum } of delivered) {
      if (rising && lum < last) {
        if (last - turn >= 0.1 && turn < 0.8) at.push(t);
        rising = false; turn = last;
      } else if (!rising && lum > last) {
        rising = true; turn = last;
      }
      last = lum;
    }
    let worst = 0;
    for (const t0 of at) worst = Math.max(worst, at.filter(t => t >= t0 && t < t0 + 1000).length);
    return worst;
  };

  /** Run a luminance function through the guard, closing the loop. */
  const run = (seconds, raw, fps = HZ) => {
    const guard = new FlashGuard();
    const delivered = [];
    let gain = 1;
    for (let i = 0; i < seconds * fps; i++) {
      const t = (i * 1000) / fps;
      const lum = Math.max(0, Math.min(1, raw(t) * gain));
      delivered.push({ t, lum, gain });
      gain = guard.sample(t, lum);
    }
    return { delivered, guard };
  };

  const square = (hz, lo, hi) => (t) => (Math.sin((t / 1000) * 2 * Math.PI * hz) > 0 ? hi : lo);

  console.log('The flash guard, on luminance traces:\n');

  // Everything the guard is allowed to touch, and everything it is not.
  //
  // The settled gain is checked against the attenuation the arithmetic says
  // this strobe needs (enough to bring its excursion under the flash
  // threshold), because "it went dark" and "it went exactly as dark as it had
  // to" are different results and only one of them is a working controller.
  for (const [hz, lo, hi] of [[10, 0.15, 0.75], [6, 0.2, 0.6], [4, 0.25, 0.5], [3.6, 0.2, 0.7], [5, 0.35, 0.5]]) {
    const raw = square(hz, lo, hi);
    const { delivered, guard } = run(14, raw);
    const bare = flashRate(delivered.map(d => ({ t: d.t, lum: raw(d.t) })));
    const after = flashRate(delivered.filter(d => d.t > 4000));
    const needed = Math.max(0.1, 0.075 / (hi - lo));
    const settled = guard.state.gain;
    console.log(`  ${hz} Hz, ${((hi - lo) * 100).toFixed(0)}% swing   ${bare}/s unguarded -> ${after}/s delivered, gain ${settled.toFixed(3)} (needs ${needed.toFixed(3)})`);
    check(`${hz} Hz is not a strobe by the time it reaches the wall`, bare > 3 && after <= 3, `${bare}/s -> ${after}/s`);
    check(`${hz} Hz is dimmed as much as it has to be and no more`, Math.abs(settled - needed) < 0.03, `gain ${settled.toFixed(3)} vs ${needed.toFixed(3)}`);
  }

  // At or under the line, at either frame rate. Three flashes a second is
  // legal, and a guard that steps in there is a guard that has taken the show
  // off whoever is playing it.
  for (const hz of [1.5, 2, 2.5, 3]) {
    for (const fps of [60, 30]) {
      const { delivered } = run(10, square(hz, 0.2, 0.7), fps);
      const touched = delivered.filter(d => Math.abs(d.gain - 1) > 1e-3).length;
      check(`${hz} Hz at ${fps} fps is left completely alone`, touched === 0, `${touched} frames touched`);
    }
  }

  // Just over it, at either frame rate: this is the one an earlier version
  // walked straight past, because the count of flashes in the last second
  // flickered between three and four and never held still long enough.
  for (const fps of [60, 30]) {
    const { delivered } = run(10, square(3.5, 0.2, 0.7), fps);
    const touched = delivered.filter(d => Math.abs(d.gain - 1) > 1e-3).length;
    check(`3.5 Hz at ${fps} fps is caught`, touched > 0, `${touched} frames touched`);
  }

  // One hard hit in an otherwise calm plate. This is the case a guard that
  // smoothed fast changes instead of counting them would ruin, and it is most
  // of what makes a light show worth watching.
  {
    const hit = (t) => (t > 2000 && t < 2120 ? 0.85 : 0.2);
    const { delivered } = run(5, hit);
    const touched = delivered.filter(d => Math.abs(d.gain - 1) > 1e-3).length;
    const peak = Math.max(...delivered.map(d => d.lum));
    console.log(`  one hard hit            peak ${peak.toFixed(2)} delivered, ${touched} frames touched`);
    check('a single hard hit is not touched', touched === 0 && peak > 0.8, `peak ${peak.toFixed(2)}`);
  }

  // It has to let go again: a breakdown that strobes and then stops must not
  // leave the rest of the set held back.
  {
    const trace = (t) => (t < 4000 ? square(10, 0.15, 0.75)(t) : 0.5 + 0.2 * Math.sin((t / 1000) * 2 * Math.PI * 0.3));
    const { delivered } = run(12, trace);
    const held = delivered.filter(d => d.t > 4000 && Math.abs(d.gain - 1) > 0.01);
    const releasedBy = held.length ? Math.max(...held.map(d => d.t)) - 4000 : 0;
    console.log(`  strobe, then a calm plate released ${(releasedBy / 1000).toFixed(2)} s after the strobe stopped`);
    check('the guard lets go once the strobing stops', releasedBy < 3000, `${(releasedBy / 1000).toFixed(2)} s`);
  }

  // Never the thing that blacks out the wall.
  {
    const { delivered } = run(10, square(12, 0.05, 0.95));
    const dimmest = Math.min(...delivered.map(d => d.gain));
    console.log(`  worst case              dimmest gain the guard ever asked for: ${dimmest.toFixed(2)}`);
    check('the guard never blacks the wall out', dimmest >= 0.1, `gain floor ${dimmest.toFixed(2)}`);
  }
  console.log('');
}

// ── One clock with the wall up, in arithmetic (PLAN.md §14b) ─────────
//
// lib/drawGate.ts in node, on two clocks run the way a browser runs them on
// one main thread: the show window's animation frames on its display's
// refresh, the projector window's asks on its own, at a phase from the show's
// that drifts through every value over a set. Each callback carries its
// refresh's own time (the rAF timestamp), and runs at that refresh or when
// the thread is free, whichever is later: a draw holds the thread for its
// cost, so the second of two callbacks in one refresh runs only after the
// first one's draw has finished. A callback asks for the next frame after the
// refresh it ran in, and one held up past a whole refresh runs in the later
// one. An ask that draws cancels the show's pending frame and asks again,
// which leaves it on the same refresh.
//
// Beside the gate, controls on the same clocks, so that a pass means the gate
// and not the layout: the guard the show had (an ask compared only with the
// projector's previous ask, 6 ms back, on the time the callback ran); the fix
// PLAN.md first wrote (the asks gated against every draw, the show's own
// frames not); and the gate itself stamped with the time its callback *ran*
// rather than its refresh's time, which is what the first version of this
// fix did (`performance.now()` in the callback). That last one draws once a
// refresh while draws are cheap and twice once one costs more than 0.6 of a
// refresh, because the second callback of the refresh then runs late enough
// to look like the next refresh's (found in review: 87 draws a second at
// 60 Hz with 10.5 ms draws). If these clocks could not produce a doubled
// rate, the controls would pass too.
{
  const run = ({ showHz, wallHz, phase, jitter = 0, cost = 0, rule, stamp = 'refresh', covered = false, seconds = 4 }) => {
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const end = seconds * 1000;
    // Each clock's refreshes, with their timestamps' jitter.
    const vsyncs = (period, from) => { const v = []; for (let t = from; t < end + 200; t += period) v.push(t + (rand() - 0.5) * jitter); return v; };
    const clocks = {
      frame: covered ? [] : vsyncs(1000 / showHz, 0),
      ask: vsyncs(1000 / wallHz, phase),
    };
    const next = { frame: 0, ask: 0 };
    const gate = new DrawGate();
    let busy = 0, lastAsk = -Infinity, lastDraw = -Infinity, asks = 0;
    const draws = [];
    for (;;) {
      const f = clocks.frame[next.frame] ?? Infinity, a = clocks.ask[next.ask] ?? Infinity;
      const source = f <= a ? 'frame' : 'ask';
      const v = clocks[source];
      const ranAt = Math.max(v[next[source]], busy);
      if (ranAt >= end) break;
      // Held up past a whole refresh, it runs in the latest one it reached.
      while (next[source] + 1 < v.length && v[next[source] + 1] <= ranAt) next[source]++;
      const refreshAt = v[next[source]];
      next[source]++;
      const at = stamp === 'refresh' ? refreshAt : ranAt;
      let drawn;
      if (rule === 'gate') drawn = gate.offer(source, at);
      else if (rule === 'old') {
        drawn = source === 'frame' || ranAt - lastAsk >= 6;
        if (source === 'ask' && drawn) lastAsk = ranAt;
      } else {
        drawn = source === 'frame' || at - lastDraw >= 0.6 * 1000 / wallHz;
      }
      if (drawn) { lastDraw = at; busy = ranAt + cost; }
      // The first second is the gate learning the clocks; judged after it.
      if (ranAt < 1000) continue;
      if (source === 'ask') asks++;
      // The governor is fed the time between draws as the frame loop reads
      // it when it runs (`frameS`), not the refresh's.
      if (drawn) draws.push(ranAt);
    }
    const gaps = draws.slice(1).map((t, i) => t - draws[i]).sort((a, b) => a - b);
    return { perS: draws.length / (seconds - 1), asksPerS: asks / (seconds - 1), medianGap: gaps[gaps.length >> 1] ?? 0 };
  };
  /**
   * Over twenty phases between the two clocks: the highest rate and where,
   * the lowest rate, and the shortest median gap between draws. The lowest
   * is the floor: a gate that froze the plate (0 a second), or turned down
   * one frame in two (30), passed every ceiling here in review.
   */
  const sweep = (showHz, wallHz, opts) => {
    let hi = { perS: 0, phase: 0 }, lo = Infinity, shortest = Infinity;
    for (let i = 0; i < 20; i++) {
      const phase = (i / 20) * (1000 / wallHz);
      const r = run({ showHz, wallHz, phase, ...opts });
      if (r.perS > hi.perS) hi = { perS: r.perS, phase };
      lo = Math.min(lo, r.perS);
      shortest = Math.min(shortest, r.medianGap);
    }
    return { ...hi, min: lo, medianGap: shortest };
  };
  console.log('One clock with the wall up, in arithmetic (draws a second, lowest to highest of twenty phases):\n');
  /*
    Displays as they come (a 59.94 Hz projector drifts through every phase
    in seventeen seconds; ProMotion laptops at 120), and busy machines: 28
    on both, the Mac runner's app, and 20, where a gate that held its
    refresh to a 30 Hz display's at most let both clocks through (40.0 a
    second, tried). Each with draws that cost nothing, and with draws that
    cost 0.7 of the faster display's refresh: a machine that is busy but
    keeps up, where a gate stamping callbacks by when they ran doubles.
  */
  for (const [showHz, wallHz] of [[60, 60], [60, 59.94], [120, 60], [60, 120], [60, 50], [28, 28], [20, 20]]) {
    const faster = Math.max(showHz, wallHz);
    const refresh = 1000 / faster;
    for (const cost of [0, 0.7 * refresh]) {
      for (const jitter of [0, 2]) {
        const gate = sweep(showHz, wallHz, { rule: 'gate', jitter, cost });
        const old = sweep(showHz, wallHz, { rule: 'old', jitter, cost });
        const asksOnly = sweep(showHz, wallHz, { rule: 'asks', jitter, cost });
        const ran = sweep(showHz, wallHz, { rule: 'gate', jitter, cost, stamp: 'ran' });
        const label = `laptop ${showHz} Hz, projector ${wallHz} Hz${cost ? `, ${cost.toFixed(1)} ms draws` : ''}${jitter ? `, ${jitter} ms jitter` : ''}`;
        console.log(`  ${label.padEnd(54)} gate ${gate.min.toFixed(1)} to ${gate.perS.toFixed(1)}/s; the old guard ${old.perS.toFixed(1)}, asks alone ${asksOnly.perS.toFixed(1)}, stamped when run ${ran.perS.toFixed(1)}`);
        check(`${label}: at most 1.1 times the faster display, at every phase`, gate.perS <= 1.1 * faster,
          `${gate.perS.toFixed(1)}/s against ${faster} Hz`);
        check(`  and at least 0.95 times it, at every phase`, gate.min >= 0.95 * faster,
          `${gate.min.toFixed(1)}/s against ${faster} Hz`);
        if (!cost) {
          check(`  control: the old guard draws past it on the same clocks`, old.perS > 1.1 * faster,
            `${old.perS.toFixed(1)}/s against ${faster} Hz`);
        }
        if (showHz === wallHz) {
          if (!cost) {
            // Why the show's own frames are gated too (lib/drawGate.ts).
            check(`  control: gating the asks alone still doubles at some phase`, asksOnly.perS > 1.5 * faster,
              `${asksOnly.perS.toFixed(1)}/s against ${faster} Hz`);
          } else {
            // Why each offer carries its refresh's time (lib/drawGate.ts).
            check(`  control: the same gate stamped with when its callback ran draws past it`, ran.perS > 1.1 * faster,
              `${ran.perS.toFixed(1)}/s against ${faster} Hz, the governor fed a median ${ran.medianGap.toFixed(1)} ms`);
          }
          /*
            The governor is fed the interval between draws. Doubled, the typical
            one was half a refresh (or, stamped when run, the draw's own cost),
            and a machine dropping frames read as one with room to spare; at
            one draw a refresh it is a whole one.
          */
          check(`  and the governor is fed a whole refresh between draws, not half`, gate.medianGap >= 0.9 * refresh,
            `median ${gate.medianGap.toFixed(1)} ms at the worst phase against a ${refresh.toFixed(1)} ms refresh (the old guard ${old.medianGap.toFixed(1)} ms)`);
        }
      }
    }
  }
  // Covered: the show's own frames have stopped, and every ask has to draw.
  for (const [wallHz, jitter] of [[60, 0], [60, 2], [120, 1], [30, 2]]) {
    const r = run({ showHz: 60, wallHz, phase: 3, jitter, cost: 0.7 * 1000 / wallHz, rule: 'gate', covered: true });
    check(`covered, every one of a ${wallHz} Hz projector's asks draws${jitter ? ` (${jitter} ms jitter)` : ''}, with draws of 0.7 of its refresh`,
      Math.abs(r.perS - r.asksPerS) < 0.5, `${r.perS.toFixed(1)} of ${r.asksPerS.toFixed(1)} a second`);
  }
  /*
    Covered on a busy machine: the Mac runner's covered show drew 44 a second
    from asks 20 to 200 ms apart (lib/earClock.ts), and one alternating 12 and
    30 ms apart has a median the short gap is well under 0.6 of. Each ask is
    a frame the wall shows; a gate that turned down the early one would show
    the late one's picture twice. A first version, which gated the asks
    whether or not the show's own frames were running, passed every line
    above and turned down 8 of these 43 ragged asks and 95 of the 191
    alternating ones.
  */
  for (const [name, gapOf] of [['20 to 200 ms apart', (r, i) => 20 + 180 * r], ['alternately 12 and 30 ms apart', (r, i) => (i % 2 ? 12 : 30)]]) {
    const gate = new DrawGate();
    let seed = 3, offered = 0, drawn = 0, i = 0;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < 4000; t += gapOf(rand(), i++)) { offered++; if (gate.offer('ask', t)) drawn++; }
    check(`covered, with the wall's asks ${name}, every one draws`, drawn === offered, `${drawn} of ${offered}`);
  }
  /*
    No wall: the show's own frames are never gated, whatever they do. Frames
    bunched after a long task (one in ten 3 ms after the last) all draw, as
    they always did.
  */
  {
    const gate = new DrawGate();
    let drawn = 0, offered = 0, seed = 5;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < 3000; t += rand() < 0.1 ? 3 : 1000 / 60) { offered++; if (gate.offer('frame', t)) drawn++; }
    check('with no wall asking, every one of the show\'s own frames draws, even two 3 ms apart', drawn === offered, `${drawn} of ${offered}`);
  }
  /*
    A busy machine: one 60 Hz display, and a thread that misses some of its
    refreshes, for both windows at once (they share it) and a few more for
    one window or the other. That is what the Mac runner is: its windows are
    handed 28 to 55 of 60 refreshes a second, and a missed refresh leaves a
    gap of two or three in each clock, never a shorter one. The clocks above
    are regular, 28 a second evenly spaced, which is not how a machine gets
    slow, and the gate passed them while on the Mac it drew 24.3 a second
    with the show's own window handed 28.3: the median of a clock's gaps
    read two refreshes, 0.6 of that is 1.2, and the show's next frame one
    refresh after its own draw was turned down with nothing drawn in its
    place (lib/drawGate.ts, "a clock's own next refresh").

    Held to the floor the app's phases below are held to, judged on the same
    clocks: at least 0.95 of the frames either window alone would have drawn
    (every refresh it was handed), at every phase and every pattern of
    misses. And to the ceiling: no more than one draw for each slot the two
    clocks' refreshes make together (refreshes less than 0.6 of one apart
    are one slot, as `served` counts them in the app). Beside it, the gate
    as it was, which fell to 0.75 here and has to fail the floor, or these
    clocks could not tell.
  */
  {
    class GateAsItWas extends DrawGate {
      offer(source, now) {
        const gap = now - this.lastOffer[source];
        const g = this.gaps[source];
        if (gap > 250) g.length = 0;
        else if (gap > 0) { g.push(gap); if (g.length > 8) g.shift(); }
        this.lastOffer[source] = now;
        if (this.twoClocks(now) && now - this.lastDraw < 0.6 * this.refreshMs(now)) { this.skipped[source]++; return false; }
        this.lastDraw = now;
        this.drawn[source]++;
        return true;
      }
    }
    const R = 1000 / 60;
    const busy = (Gate, { both, own, phase, jitter, seed }) => {
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const offers = [];
      const handed = { frame: 0, ask: 0 };
      for (let i = 0; i * R < 5000; i++) {
        if (rand() > both) continue;
        for (const [source, at] of [['frame', i], ['ask', i + phase]]) {
          if (rand() > own) continue;
          offers.push({ source, at, t: at * R + (rand() - 0.5) * jitter });
          if (i * R >= 1000) handed[source]++;
        }
      }
      offers.sort((x, y) => x.t - y.t);
      const gate = new Gate();
      let drawn = 0, slots = 0, slotAt = -Infinity;
      for (const o of offers) if (gate.offer(o.source, o.t) && o.t >= 1000) drawn++;
      for (const o of offers) if (o.t >= 1000 && o.t - slotAt >= 0.6 * R) { slots++; slotAt = o.t; }
      return { drawn, alone: Math.max(handed.frame, handed.ask), slots };
    };
    const sweepBusy = (Gate) => {
      let low = { r: Infinity }, high = { r: -1 };
      for (const both of [1, 0.8, 0.6, 0.5, 0.4]) for (const own of [1, 0.9, 0.75]) for (const jitter of [0, 2]) for (const seed of [3, 7, 11]) for (let i = 0; i < 20; i++) {
        const x = busy(Gate, { both, own, phase: i / 20, jitter, seed });
        const at = `${Math.round(both * own * 60)} of 60 handed, ${i / 20} of a refresh behind${jitter ? `, ${jitter} ms jitter` : ''}`;
        if (x.drawn / x.alone < low.r) low = { r: x.drawn / x.alone, at, ...x };
        if (x.drawn / x.slots > high.r) high = { r: x.drawn / x.slots, at, ...x };
      }
      return { low, high };
    };
    const now = sweepBusy(DrawGate), was = sweepBusy(GateAsItWas);
    console.log(`  a busy 60 Hz display (900 runs)                      gate ${now.low.r.toFixed(2)} to ${now.high.r.toFixed(2)}; the gate as it was ${was.low.r.toFixed(2)} to ${was.high.r.toFixed(2)}`);
    check('a busy machine, its refreshes missed for both windows and for each: at least 0.95 of what either window alone would draw, at every phase',
      now.low.r >= 0.95, `${now.low.drawn} drawn where one window was handed ${now.low.alone} (${now.low.r.toFixed(2)}), at worst: ${now.low.at}`);
    check('  and at most one draw a slot of the two clocks\' refreshes',
      now.high.drawn <= now.high.slots, `${now.high.drawn} drawn for ${now.high.slots} slots (${now.high.r.toFixed(2)}), at most: ${now.high.at}`);
    check('  control: the gate as it was draws under 0.9 of it somewhere',
      was.low.r < 0.9, `${was.low.drawn} drawn where one window was handed ${was.low.alone} (${was.low.r.toFixed(2)}): ${was.low.at}`);
    /*
      A clock's own next refresh draws; the same refresh offered again does
      not. A loop that asks twice in one refresh (a frame re-asked for, a
      stamp a millisecond off) offers within a 240 Hz refresh of its own last
      offer, and that is the refresh it already had, drawn or turned down.
    */
    const g = new DrawGate();
    for (let t = 0; t < 500; t += R) { g.offer('frame', t); g.offer('ask', t + 0.25 * R); }
    const T = 30 * R;
    const sameAgain = [g.offer('frame', T), g.offer('frame', T + 2), g.offer('ask', T + 4), g.offer('ask', T + 6), g.offer('frame', T + R)];
    check('  and a clock\'s offer within a 240 Hz refresh of its own last is that refresh again, turned down',
      sameAgain.join() === 'true,false,false,false,true', `the show's frame, again 2 ms later, the ask, again 2 ms later, the next refresh: ${sameAgain.join(', ')}`);
    /*
      Out of order: both clocks on one 60 Hz display, and one ask in five
      whose callback runs after the show's frame for the next refresh (held
      behind a draw), stamped with its own refresh's time as it should be.
      That ask is turned down, being behind the last draw; it must not then
      let the projector's next ask draw again in a refresh that has a draw
      (the second pre-push review found 16 % of refreshes drawn twice so).
    */
    {
      for (const phase of [0, 0.25, 0.5]) {
        const gate = new DrawGate();
        let seed = 13, drawn = 0, refreshes = 0;
        const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        let heldAsk = null;
        for (let i = 0; i < 300; i++) {
          const t = i * R;
          const offers = [['frame', t]];
          if (heldAsk !== null) { offers.push(['ask', heldAsk]); heldAsk = null; }
          if (rand() < 0.2) heldAsk = t + phase * R; else offers.push(['ask', t + phase * R]);
          for (const [source, at] of offers) if (gate.offer(source, at) && i >= 60) drawn++;
          if (i >= 60) refreshes++;
        }
        check(`  and asks run late, after the next refresh's frame, ${phase} of a refresh behind: at most one draw a refresh`, drawn <= refreshes && drawn >= 0.95 * refreshes,
          `${drawn} drawn in ${refreshes} refreshes`);
      }
    }
  }
  /*
    The stamp: a refresh's own time when there is a believable one (held up
    behind a draw, it is older than now, which is the point), and the time
    now when there is none or it is from some other clock. A stamp a little
    ahead of now is believed: the Mac runners stamp some refreshes up to
    2.4 ms ahead (1002.4 here), and the bound is one 240 Hz refresh; past
    that (1005) it would name the next refresh, so it is not.
  */
  {
    const cases = [[990, 1000, 990], [700, 1000, 700], [1002.4, 1000, 1002.4], [undefined, 1000, 1000], [NaN, 1000, 1000], [1005, 1000, 1000], [1500, 1000, 1000], [-5000, 1000, 1000]];
    const wrong = cases.filter(([ts, now, want]) => refreshStamp(ts, now) !== want);
    check('an offer is stamped with its refresh\'s time, or now when that is missing or not believable', wrong.length === 0,
      wrong.length ? wrong.map(([ts, now, want]) => `${ts} at ${now} gave ${refreshStamp(ts, now)}, not ${want}`).join('; ') : `${cases.length} cases`);
  }
  console.log('');
}

/*
  The busy machine's book (below, in the windows): which of the other
  window's refreshes is this one.

  Both windows look each refresh up in one book kept in the show's window,
  so that a refresh the busy machine misses is missed by both. The book
  used to take the nearest entry within half a 60 Hz refresh of the raw
  stamp, and that is a coin toss on a Mac runner whose two windows sit
  near half a refresh apart: the line "missed from one book" went red on
  f350e75 (2026-10-04, tools shard, green on re-run) with "the wall's stamp
  8.3 ms after the show's (-8.3 to 8.3)" in both busy phases, on a display
  of 60.6 Hz, whose half refresh is 8.25 ms, under the 8.33 ms radius. Each
  window's stamps are steady to a tenth of a millisecond; what the two keep
  between them is not. Over the 91 tools-shard runs of 2026-10-03 and 04
  the line read the wall's stamp anywhere from -7.5 to +8.3 ms after the
  show's, a different place each run (-1.4, 3.5, 5.9, 7.5, 8.2, ...), and
  within a run spread over 0.1 to 0.3 ms. Two windows' animation frames on
  the Mac are each begun on a display link of their own, in step with the
  display but not with each other, so the gap between them is anywhere in
  a refresh, and once a run in a few dozen it falls within jitter of
  half of one. Then a refresh is as near the next refresh's entry as its
  own, and which it takes changes from one refresh to the next.

  At half a refresh apart there is no fact about which of the show's
  refreshes "is" the wall's: the wall's refresh N is as much the show's N
  as its N+1. What the busy machine needs is that the answer is the same
  every time. So the book pairs around the gap the two windows keep, not
  around zero: the first refresh both windows look up sets it (`lock.d`,
  the wall's stamp less the show's), and from then on a wall stamp is
  moved back by it before it is matched, so each is matched within half a
  refresh of where the show's own stamp for it is, and its neighbours are a
  whole refresh away whatever the gap. Not a wider radius: any radius is a
  coin toss at some gap. Not the gap measured once before the phase from
  the windows' idle stamps: that reading has the same half-refresh
  ambiguity to settle, and settling it by the first pair the book makes
  settles it in the terms the book then uses.

  The line itself is unchanged and still has what to catch: a book that
  pairs a refresh with its neighbour (the one this replaces, at half a
  refresh apart) spreads `d` over a refresh, a projector that keeps a book
  of its own leaves entries in it and none looked up by both. The model
  after it holds this function to that at every gap the Mac read and at
  exactly half a refresh, with the book as it was as the control.

  No closures: it is handed to both windows as source (`addInitScript`).
*/
function bookEntry(book, lock, who, at, draw) {
  const off = lock && typeof lock.d === 'number' ? lock.d : 0;
  const onShow = (stamp, by) => (by === 'wall' ? stamp - off : stamp);
  const mine = onShow(at, who);
  let seen = null, nearest = 1000 / 120;
  for (const e of book) { const gap = Math.abs(onShow(e.at, e.by) - mine); if (gap < nearest) { nearest = gap; seen = e; } }
  if (seen) {
    if (!seen[who]) {
      seen[who] = true;
      seen.d = who === 'wall' ? at - seen.at : seen.at - at;
      if (lock && typeof lock.d !== 'number') lock.d = seen.d;
    }
    return seen;
  }
  const entry = { at, by: who, missed: draw(), [who]: true };
  book.push(entry);
  if (book.length > 64) book.shift();
  return entry;
}

/*
  The book on two windows a given gap apart, on a starved thread: each
  window handed three quarters to all of the refreshes on its own, each
  callback run up to a refresh and a half late (so a window can look up a
  refresh after the other has entered the next), stamps jittered by
  0.3 ms, the busy machine missing half. Judged as the line in the app
  judges it (at least 10 looked up by both, `d` within 4 ms), and on what
  that stands for: every refresh both windows looked up is the same pair,
  the wall's refresh N with the show's N + k for one k. Gaps from -R/2 to
  +R/2 in fortieths, both displays the Mac's runners read (60 and 60.6 Hz),
  the gap exactly half a refresh among them; the control is the book as it
  was (no lock), which has to go red at half a refresh, or this model
  could not see the fault f350e75 hit.
*/
{
  const sweepBook = (locked) => {
    let worst = null, runs = 0, red = 0;
    for (const hz of [60, 60.6]) {
      const R = 1000 / hz;
      for (let k = -20; k <= 20; k++) for (const seed0 of [3, 7, 11, 13, 17]) {
        const gap = (k / 40) * R;
        let seed = seed0;
        const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const own = 0.75 + 0.25 * rand();
        const looks = [];
        for (let i = 0; i * R < 4000; i++) {
          for (const [who, base] of [['show', i * R], ['wall', i * R + gap]]) {
            if (rand() > own) continue;
            const at = 1000 + base + (rand() - 0.5) * 0.3;
            looks.push({ who, i, at, runs: at + rand() * 1.5 * R });
          }
        }
        looks.sort((x, y) => x.runs - y.runs);
        const book = [], lock = locked ? { d: null } : null;
        const index = new Map();
        for (const l of looks) {
          const e = bookEntry(book, lock, l.who, l.at, () => rand() < 0.5);
          if (!index.has(e)) index.set(e, {});
          index.get(e)[l.who] = l.i;
        }
        const both = book.filter((e) => e.show && e.wall);
        const d = both.map((e) => e.d).sort((x, y) => x - y);
        const shifts = new Set([...index.entries()].filter(([e]) => e.show && e.wall).map(([, v]) => v.wall - v.show));
        // And where, not only whether (check-skeptic on #278): one pairing
        // for every refresh also passes a book that always pairs the wall
        // with the show's refresh before (d about a refresh), so each pair has
        // to be the nearest, within half a refresh and a jitter's margin.
        const ok = d.length >= 10 && d[d.length - 1] - d[0] <= 4 && shifts.size === 1 && d.every((x) => Math.abs(x) <= R / 2 + 1);
        runs++;
        if (!ok) {
          red++;
          if (!worst) worst = `${hz} Hz, the wall ${gap.toFixed(2)} ms after the show: ${d.length} looked up by both, d ${d.length ? `${d[0].toFixed(1)} to ${d[d.length - 1].toFixed(1)}` : '-'}, ${shifts.size} pairings`;
        }
      }
    }
    return { runs, red, worst };
  };
  const now = sweepBook(true), was = sweepBook(false);
  console.log(`  the busy machine's book, two windows a gap apart (${now.runs} runs)  red ${now.red}; the book as it was red ${was.red}`);
  check('the busy machine\'s book pairs each refresh with one of the other window\'s, at every gap between the two windows, half a refresh among them',
    now.red === 0, now.worst ?? `${now.runs} runs, each one pairing, d within 4 ms`);
  check('  control: the book as it was pairs a refresh with its neighbour somewhere', was.red > 0,
    was.worst ?? `none red in ${was.runs}: this model cannot see the fault`);
  console.log('');
}

// Its own server, and it must be its own: a survivor from a killed run would
// serve a stale bundle and the whole run would measure the wrong build.
{
  const held = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(PORT, '127.0.0.1');
  });
  if (held) {
    console.error(`port ${PORT} is already in use — a previous run's preview server is still up.`);
    process.exit(2);
  }
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], {
  detached: true, stdio: ['ignore', 'ignore', 'inherit'],
});
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ } };
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });

await new Promise(r => setTimeout(r, 2500));

const browser = await launchChromium(chromium);

const IDENTITY = [0, 0, 1, 0, 1, 1, 0, 1];
const BASE = {
  flipX: false, flipY: false, corners: IDENTITY,
  maskTop: 0, maskRight: 0, maskBottom: 0, maskLeft: 0, maskFeather: 0,
  gain: 1, gamma: 1,
  // Listed, not omitted: `withOutput({})` means "a plain projector", and a key
  // that is missing from here is a key the reset cannot put back — the last
  // section of this run waited twenty seconds for a config with no shapes in
  // it while a shape from the section before was still on.
  surfaces: [],
};

let page;
let failed = 0;

/*
  One clock with the wall up, in the app (PLAN.md §14b).

  Found by reading the code: the projector window asks the show for a frame on
  every one of its own refreshes, and the guard on that ask compared it only
  with the projector's previous ask. With both windows visible, each on its own
  display's clock, an ask landing part way into the show's refresh drew a
  second frame there, so the plate drew up to twice a refresh (each draw with
  its readback and mirror copy) and the governor, fed the interval between
  them, never saw a machine falling behind.

  So: the real app, the real projector window (`?cast=true`, CastDisplay's
  StageMirror, asking on its own animation frames), both animating, and the
  frames the show's loop draws in a second (`chromaglassDebug().frames`)
  against the refresh the browser gives these windows, counted by a loop of
  their own that draws nothing. Counted, not photographed: the count needs no
  readback, so this runs on the Mac and in a cloud session with no GPU at all,
  where no renderer comes up and the show's loop is started by the
  projector's first ask and runs on the show's own frames from then on (the
  clocks are the whole of what is measured here, and a frame with nothing to
  draw is still a pass through the loop). There the governor is not fed, and
  its line says so.

  A headless browser gives both windows one display, so "a different
  display's clock" is made the only way this page can: the projector window's
  animation frames are handed to it `__phaseMs` late, a display whose refresh
  lags the laptop's by that much. A quarter, a half and three quarters of a
  refresh, and none: the phases a projector's clock drifts through over a set,
  including the ones past 0.6 of a refresh where gating the asks alone would
  still have drawn twice.

  Each phase is held to a ceiling and a floor: at most 1.05 times the
  refreshes either window was handed (one draw a refresh, however many the
  machine dropped), and at least 0.9 times what either window alone would
  have drawn in the same seconds (every refresh it was handed; see the floor
  in `judge`). A gate that froze the plate,
  or turned down one frame in two, passed the ceiling alone in review. And
  both clocks have to have been offering: the gate turns down about one
  offer a refresh when they are, so a run where one of them had quietly
  stopped cannot pass for one where the gate held them to one.

  Then with every draw made to cost 0.7 of a refresh (the harness holds the
  thread after each one), with both clocks on one refresh: the second of the
  two callbacks then runs only after the first one's draw. A gate that
  stamped offers with the time its callback ran saw that one as the next
  refresh's and drew it too (PLAN.md §14b, found in review); stamped with
  the refresh's own time, it is turned down.

  Then covered, as `npm run ears` covers a window (its animation frames held,
  the page saying hidden): the show's own frames stop and every ask has to
  draw, or the wall freezes, which is what the ask is for. The projector's
  frames are handed over alternately on time and 12 ms late while it is,
  the ragged rhythm of a busy machine: a headless window's are as regular as
  clockwork, and on those a gate that wrongly gated a lone clock passed too.

  First, and in a context of its own, so that a failure in the pixel checks
  below (which need readbacks) cannot hide it and it cannot disturb them.
*/
{
  const context = await browser.newContext({ viewport: { width: 640, height: 400 } });
  try {
    // The book's matching, the same function the model above holds to every
    // gap, handed to both windows as its source.
    await context.addInitScript({ content: `window.__bookEntry = ${bookEntry.toString()};` });
    await context.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      const caf = window.cancelAnimationFrame.bind(window);
      // The refresh this window is given, as the browser delivers it: a loop
      // of its own that draws nothing, on the untouched clock.
      window.__rafs = 0;
      /*
        `__held`: refreshes that began while the projector's frame was still
        being put off by the harness's own `__phaseMs` timer (below). The
        loop can ask for its next frame only when the late one runs, so a
        timer running late on a busy runner costs it that refresh, which is
        the harness's doing, not the projector's. `count` is registered
        before the app's loops, so in each refresh it runs first.
      */
      window.__holding = 0;
      window.__held = 0;
      /*
        `__rafTs`: each refresh's own timestamp, the last 600, so the harness
        can take the display's refresh from the gaps between them. Not
        the rate of `__rafs`: on a busy Mac runner a window is handed 41 to
        54 of a 60 Hz display's refreshes a second, so the rate reads the
        display as slower than it is, while the gate, drawing on whichever
        window's frame comes first, still fills nearly every refresh. #211's
        run drew 52.6 a second against a window rate of 47.2 and went red on
        the ceiling, with the gate drawing once a refresh (2026-09-27).
        A dropped refresh leaves a gap of two, never a shorter one, so the
        refresh is the short end of the gaps: their 25th percentile, not
        their median, which a window handed fewer than half its refreshes
        (the draws costing 0.7 of one, below) reads as twice the refresh.
      */
      window.__rafTs = [];
      /*
        `__busy`, set in the show's window: a busy machine, made on purpose.
        That fraction of the display's refreshes, chosen by a fixed sequence,
        is missed by both windows at once, every loop in them (these counts,
        the show's loop, the projector's), as a Mac runner's starved thread
        misses them: its windows were handed 28 to 55 of 60 refreshes a
        second. Made by the harness because a cloud session will not miss
        any: with every core loaded (eight busy processes on four) it handed
        60.0, and with the thread held 1.2 refreshes on half of them, 56.9.
        Which refreshes are missed is decided once per refresh, by its time
        on the shared clock, in a book kept in the show's window that the
        projector reads too, so a refresh one window misses the other does.

        Matched to the nearest entry within half a 60 Hz refresh, not within
        4 ms, which was first here: on the Mac the two windows' stamps for
        one refresh are 4 to 8 ms apart on the shared clock (#236's first
        run: of the book's 64 refreshes none was looked up by both windows,
        and 30 were entered twice, closer than 8 ms), so each window missed
        refreshes of its own and the busy machine was not the starved
        thread it stands for. A cloud session's are under a millisecond
        apart. How far apart they were is kept (`d`, the wall's stamp less
        the show's), so the check can say the pairing held: one refresh
        matched to its neighbour would put `d` a whole refresh away from the
        rest. And matched around that gap, not around zero, once the first
        refresh both windows looked up has set it (`__missLock`): the Mac
        puts the two windows anywhere up to half a refresh apart, a
        different place each run, and at half a refresh the nearest raw
        stamp is a coin toss (`bookEntry` at the top of this file).
      */
      const host = () => (window.opener && !window.opener.closed && window.opener.__missBook ? window.opener : window);
      window.__busy = 0;
      window.__missBook = [];
      window.__missLock = { d: null };
      // Each window its own seed: two windows that each kept a book of their
      // own would still agree by chance on one seed, and the agreement
      // counted below could not see it (the check-skeptic, 2026-10-03).
      let busySeed = new URLSearchParams(location.search).has('cast') ? 99991 : 17;
      window.__busyRand = () => (busySeed = (busySeed * 16807) % 2147483647) / 2147483647;
      const missed = (ts) => {
        const h = host();
        if (!(h.__busy > 0) || typeof ts !== 'number') return false;
        const at = performance.timeOrigin + ts;
        const who = new URLSearchParams(location.search).has('cast') ? 'wall' : 'show';
        // Paired around the gap the two windows keep (`bookEntry`, at the
        // top of this file, and why), the lock reset as each busy phase starts.
        return window.__bookEntry(h.__missBook, h.__missLock, who, at, () => h.__busyRand() < h.__busy).missed;
      };
      window.__missed = missed;
      const count = (ts) => {
        if (missed(ts)) { raf(count); return; }
        window.__rafs++;
        if (window.__holding > 0) window.__held++;
        if (typeof ts === 'number') { window.__rafTs.push(ts); if (window.__rafTs.length > 600) window.__rafTs.splice(0, 100); }
        raf(count);
      };
      raf(count);
      if (new URLSearchParams(location.search).has('cast')) {
        // The projector: its animation frames, `__phaseMs` behind (a display
        // whose refresh begins that much later, so its timestamp moves with
        // it), alternately on time and 12 ms late while `__ragged` is set,
        // and withheld altogether while `__mute` is set.
        window.__phaseMs = 0;
        window.__mute = false;
        window.__ragged = false;
        /*
          The frames the projector's own loop was actually handed, one per
          refresh (told apart by the refresh's timestamp), counted as they
          are handed over. Not `__rafs`: a frame put off by `__phaseMs` asks
          for the next one only when it runs, so a late timer on a busy
          runner costs the loop a refresh. On #203's first Mac run the wall
          window refreshed 48.3 times a second at half a refresh behind and
          its loop was handed 37.8 frames, every one of which asked, and a
          line holding the asks to the display's rate went red on the
          harness, not the gate.
        */
        window.__delivered = 0;
        let lastDelivered = null;
        const handOver = (cb, ts) => {
          if (ts !== lastDelivered) { lastDelivered = ts; window.__delivered++; }
          cb(ts);
        };
        let late = false;
        window.requestAnimationFrame = (cb) => {
          const deliver = (ts) => {
            if (window.__mute || missed(ts)) { raf(deliver); return; }
            late = !late;
            const p = window.__phaseMs + (window.__ragged && late ? 12 : 0);
            if (p > 0) { window.__holding++; setTimeout(() => { window.__holding--; handOver(cb, ts + p); }, p); } else handOver(cb, ts);
          };
          return raf(deliver);
        };
        return;
      }
      /*
        What a draw costs, while `__drawCostMs` is set: after any callback
        that drew (the show's frame count went up), the thread is held that
        long, as a heavy plate holds it. Whatever else wants the thread in
        that refresh, the projector's ask among them, waits for it.
      */
      window.__drawCostMs = 0;
      const drawsSoFar = () => window.chromaglassDebug?.().frames ?? 0;
      const costly = (fn) => {
        if (!(window.__drawCostMs > 0)) return fn();
        const before = drawsSoFar();
        const out = fn();
        if (drawsSoFar() > before) { const until = performance.now() + window.__drawCostMs; while (performance.now() < until) { /* the draw */ } }
        return out;
      };
      // The show: covered on demand, as `npm run ears` does it (see there).
      const held = new Map();
      let nextId = 1e9;
      window.__covered = false;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__covered });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__covered ? 'hidden' : 'visible') });
      /*
        A refresh the busy machine missed is asked for again, under the id
        the loop was given: the show cancels its pending frame when an ask
        draws, and a cancel that missed the re-asked one would leave it two.
      */
      const pending = new Map();
      window.requestAnimationFrame = (cb) => {
        const id = nextId++;
        if (window.__covered) { held.set(id, cb); return id; }
        const run = (ts) => {
          if (missed(ts)) { pending.set(id, raf(run)); return; }
          pending.delete(id);
          costly(() => cb(ts));
        };
        pending.set(id, raf(run));
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        if (held.delete(id)) return;
        if (pending.has(id)) { caf(pending.get(id)); pending.delete(id); return; }
        caf(id);
      };
      window.__uncover = () => {
        window.__covered = false;
        const cbs = [...held.values()];
        held.clear();
        for (const cb of cbs) raf(cb);
      };
      // Every ask the projector makes, counted before the show decides
      // anything about it, and passed on with its refresh's time.
      // Configurable, because the show deletes it on the way out.
      window.__asks = 0;
      let inner;
      Object.defineProperty(window, '__chromaglassFrame', {
        configurable: true,
        get: () => inner && ((...args) => { window.__asks++; return costly(() => inner(...args)); }),
        set: (f) => { inner = f; },
      });
    });
    const show = await context.newPage();
    show.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    await show.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&dpr=${encodeURIComponent(DPR)}${engineQuery()}`, { waitUntil: 'load' });
    await show.waitForFunction(() => typeof window.chromaglassDebug === 'function', null, { timeout: 60_000 });
    await show.waitForTimeout(5000);

    /**
     * Over `ms`: frames the show's loop drew, the refresh each window was
     * given, and the asks the projector made, all a second; and what the
     * governor is being fed, where there is a governor.
     */
    const measure = (ms) => show.evaluate(async (ms) => {
      const read = () => ({
        frames: window.chromaglassDebug().frames,
        rafs: window.__rafs,
        wallRafs: window.__wall && !window.__wall.closed ? window.__wall.__rafs : 0,
        wallFrames: window.__wall && !window.__wall.closed ? window.__wall.__delivered : 0,
        wallHeld: window.__wall && !window.__wall.closed ? window.__wall.__held : 0,
        asks: window.__asks,
        // Which window's offer each draw came from, and how many offers were
        // turned down (lib/drawGate.ts); absent on a build without the gate.
        gate: window.chromaglassDebug().drawGate?.drawn ?? null,
        skipped: window.chromaglassDebug().drawGate?.skipped ?? null,
        fedCount: window.chromaglassDebug().governor?.fedCount ?? null,
        t: performance.now(),
      });
      const a = read();
      const showTs0 = window.__rafTs.length ? window.__rafTs[window.__rafTs.length - 1] : -Infinity;
      const wallW = window.__wall && !window.__wall.closed ? window.__wall : null;
      const wallTs0 = wallW && wallW.__rafTs.length ? wallW.__rafTs[wallW.__rafTs.length - 1] : -Infinity;
      await new Promise((r) => setTimeout(r, ms));
      const b = read();
      const s = (b.t - a.t) / 1000;
      const d = window.chromaglassDebug();
      // The display's refresh, from each window's own frames in this window
      // of time: the short end (25th percentile) of the gaps between
      // consecutive refreshes it was handed (see `__rafTs`), and the shorter
      // of the two windows', as the gate draws on the faster.
      /*
        The shortest gap that recurs (three within 1.5 ms of it), not a
        percentile: a percentile jumps to two refreshes once fewer than that
        share of a window's gaps are single ones (about 34 of 60 refreshes
        handed, dropped in pairs), and the draw cost below, 0.7 of it, then
        cost 1.4 of a real refresh, where a gate that doubles is held to one
        draw a refresh by the thread and nothing can see it (the
        check-skeptic, 2026-09-28). Recurring, so one stray short gap is not
        read as the display; the 25th percentile when nothing recurs.
      */
      const refreshGap = (ts, from) => {
        const g = [];
        for (let i = 1; i < ts.length; i++) if (ts[i - 1] >= from) g.push(ts[i] - ts[i - 1]);
        g.sort((x, y) => x - y);
        if (g.length < 5) return null;
        const recurs = g.find((x) => x >= 4.2 && g.filter((y) => Math.abs(y - x) <= 1.5).length >= 3);
        return recurs ?? g[Math.floor(g.length / 4)];
      };
      const showGap = refreshGap(window.__rafTs, showTs0);
      const wallGap = wallW ? refreshGap(wallW.__rafTs, wallTs0) : null;
      const gaps = [showGap, wallGap].filter((x) => x !== null && x > 0);
      const refreshMs = gaps.length ? Math.min(...gaps) : null;
      /*
        The refreshes served: every refresh either window was handed in
        these seconds, on this window's clock (the wall's timestamps moved
        by the two time origins), counted in slots as below. Every draw the gate lets through is one
        window's frame or one ask, and each of those follows a refresh this
        count saw (the count loops run first, on the untouched clock), so a
        gate that draws once a refresh draws no more than this, whatever the
        machine drops. The display's rate cannot say that: the check-skeptic
        showed (2026-09-27) that a gate stamping offers when they run drew
        65.8 a second with 11.7 ms draws, windows handed 52.9 and 51.9,
        under 1.1 times a 60.2 Hz display, and that once a draw costs most
        of a refresh any doubling gate is held under that ceiling by the
        thread itself. Both windows share a thread, so a doubling gate that
        eats the thread costs both windows their refreshes, and this count
        falls with it.
      */
      /*
        Counted as the gate spaces its draws, not by matching the two
        windows' timestamps: the wall's refreshes at the time its frames are
        handed over (`__phaseMs` late, as the gate sees them), and one slot
        for each run of refreshes less than 0.6 of a refresh after the slot
        began. Matching the timestamps (the first version of this) read a
        working gate as doubling at three quarters of a refresh behind: when
        a long task drops one refresh for both windows, the show's next frame
        comes 1.25 of a refresh after the last draw and draws, and that
        refresh's ask 0.75 later draws too, a slot the matched count never
        had (the check-skeptic's model: 1.09 to 1.21 times at 10 to 30 % of
        refreshes dropped, where the Mac drops 10 to 30 %). A gate drawing
        twice within 0.6 of a refresh is still counted against one slot.
      */
      const toHere = wallW ? wallW.performance.timeOrigin - performance.timeOrigin : 0;
      const lag = wallW ? wallW.__phaseMs ?? 0 : 0;
      const both = [
        ...window.__rafTs.filter((t) => t > showTs0),
        ...(wallW ? wallW.__rafTs.filter((t) => t > wallTs0).map((t) => t + toHere + lag) : []),
      ].sort((x, y) => x - y);
      const apart = 0.6 * (refreshMs ?? 1000 / 60);
      const served = [];
      for (const t of both) if (!served.length || t - served[served.length - 1] >= apart) served.push(t);
      const servedGaps = served.slice(1).map((t, i) => t - served[i]).sort((x, y) => x - y);
      // What the governor was fed in this window: its log's last entries, as
      // many as it counted, and their median (see the governor line below).
      const fedN = a.fedCount !== null && b.fedCount !== null ? b.fedCount - a.fedCount : null;
      const fedLog = d.governor?.fedLog ?? null;
      let fedMedian = null;
      if (fedN && fedLog && fedN <= fedLog.length) {
        const w = fedLog.slice(fedLog.length - fedN).sort((x, y) => x - y);
        fedMedian = w[Math.floor(w.length / 2)];
      }
      return {
        gate: a.gate && b.gate ? { frame: (b.gate.frame - a.gate.frame) / s, ask: (b.gate.ask - a.gate.ask) / s } : null,
        skipped: a.skipped && b.skipped ? (b.skipped.frame - a.skipped.frame + b.skipped.ask - a.skipped.ask) / s : null,
        offered: a.gate && b.gate && a.skipped && b.skipped ? {
          frame: (b.gate.frame - a.gate.frame + b.skipped.frame - a.skipped.frame) / s,
          ask: (b.gate.ask - a.gate.ask + b.skipped.ask - a.skipped.ask) / s,
        } : null,
        drawn: (b.frames - a.frames) / s,
        drawnCount: b.frames - a.frames,
        hz: (b.rafs - a.rafs) / s,
        wallHz: (b.wallRafs - a.wallRafs) / s,
        wallFrames: (b.wallFrames - a.wallFrames) / s,
        wallServable: (b.wallRafs - a.wallRafs - (b.wallHeld - a.wallHeld)) / s,
        asks: (b.asks - a.asks) / s,
        askCount: b.asks - a.asks,
        seconds: s,
        frameMs: d.governor?.frameMs ?? null,
        refreshMs,
        servedHz: served.length / s,
        servedGapMs: servedGaps.length >= 5 ? servedGaps[servedGaps.length >> 1] : null,
        fedN,
        fedMedian,
        /*
          Whether the two windows kept one book of missed refreshes: the
          projector's own book empty (it used the show's), the show's
          holding refreshes both windows looked up, and the pairing one
          pairing: how far apart the two windows' stamps were for each
          refresh both looked up (`d` above) spread over no more than 4 ms,
          where a refresh matched to its neighbour would spread it over most
          of one. Not the share of
          refreshes both looked up: a busy Mac hands the two windows
          different refreshes of its own accord (the show 28.3 a second, the
          wall 38.7, on one run), so that share is under one on a book that
          works (the second pre-push review). Two books, which the
          check-skeptic's mutant made, passed the old gate at 38.5 drawn
          against 27.0.
        */
        book: (() => {
          const book = window.__missBook;
          const d = book.filter((e) => e.show && e.wall).map((e) => e.d).sort((x, y) => x - y);
          return {
            entries: book.length,
            both: d.length,
            apart: d.length ? { least: d[0], most: d[d.length - 1], median: d[d.length >> 1] } : null,
            wallOwn: wallW ? wallW.__missBook.length : null,
            lock: typeof window.__missLock?.d === 'number' ? window.__missLock.d : null,
          };
        })(),
        fallbacks: d.drawGate?.stampFallbacks ?? null,
        misses: d.drawGate?.stampMisses ?? null,
        missedAgo: d.drawGate?.stampMisses?.lastAt ? performance.now() - d.drawGate.stampMisses.lastAt : null,
        engine: d.engine,
      };
    }, ms);
    const f1 = (n) => (n === null || n === undefined ? '-' : n.toFixed(1));

    const [wall] = await Promise.all([
      show.waitForEvent('popup'),
      show.evaluate(() => { window.__wall = window.open('about:blank', 'wall', 'popup,width=480,height=270'); }),
    ]);
    /*
      Opened blank and then sent to the projector's address, which is what
      `useCastSession` opens: a popup opened straight onto a URL ran this
      context's init script on its first blank document only, and the
      projector came up on the untouched clock. `goto` keeps the opener.
    */
    await wall.goto(`http://localhost:${PORT}/?cast=true&debug`, { waitUntil: 'load' });
    // The mirror (not the receiver a window with no opener becomes; see
    // CastDisplay), on the clock this page controls.
    await wall.waitForSelector('[data-testid="cast-display"]', { timeout: 30_000 });
    if (await wall.evaluate(() => typeof window.__phaseMs !== 'number')) throw new Error('the projector window came up on the untouched clock');
    await show.waitForFunction(() => window.__asks > 30, null, { timeout: 30_000 });
    /*
      Two clocks need the show's own to be running, so it is measured first
      on its own: the projector window open, its asks held back (its
      animation frames withheld, as a covered window's are). Measured with the
      wall open rather than before it, because with no renderer at all (a
      container with no WebGPU) the loop is started by the first frame asked
      for and never before, and from then on runs on this window's animation
      frames like any other; a renderer that is up starts it at once. If it is
      not running, nothing below could double, and the run says it measured
      nothing rather than passing.
    */
    await wall.evaluate(() => { window.__mute = true; });
    await show.waitForTimeout(300);
    const alone = await measure(2000);
    await wall.evaluate(() => { window.__mute = false; });
    console.log(`\nOne clock with the wall up, in the app (${alone.engine || 'no engine label'}):\n`);
    console.log(`  the wall's asks held    ${f1(alone.drawn)} drawn/s, display ${f1(alone.hz)} Hz, ${f1(alone.asks)} asks/s, governor fed ${f1(alone.frameMs)} ms`);
    const ownLoop = alone.drawn >= 10 && alone.asks === 0;
    check('the show draws on its own frames with the wall\'s asks held (there are two clocks to measure)', ownLoop,
      `${f1(alone.drawn)} a second against a ${f1(alone.hz)} Hz display, ${f1(alone.asks)} asks a second`);
    if (ownLoop) {
      const refreshMs = 1000 / Math.max(1, alone.hz);
      /*
        How many of a clock's refreshes, asks or frames a phase must count
        before its lines judge anything: twenty in the seconds measured. The
        lines below are ratios (drawn to served, asks to the wall's
        refreshes, drawn to either window's frames), and a ratio of nothing
        passes: a wall that never asked holds "asks at least 0.8 of its
        refreshes" at 0 of 0, and one clock alone is always under the
        ceiling. This is what guards against that.

        A count, where it was ten a second (#203): the same twenty in the two
        seconds every phase measured then, but a rate also judged the
        runner. The busy phases below miss half the refreshes on purpose, so
        a Mac runner already handing its windows 22 of 60 hands them 11, and
        half a refresh behind the harness's own late timer holds a few more:
        #223's tools shard read the wall's asks at 8.9 a second, 0.9x under
        the ceiling and 11.4 drawn against a floor of 10.3, and went red on
        the guard alone (2026-10-04). A stopped clock still counts none, and
        the busy phases measure for longer instead (see there), so they
        count as many refreshes as an idle phase does.
      */
      const enough = 20;
      /** The lines every phase is held to: a ceiling, a floor, and both clocks offering. */
      const judge = (m, label, { floor = true } = {}) => {
        const counted = (perSecond) => Math.round(perSecond * m.seconds);
        const faster = Math.max(m.hz, m.wallHz);
        // The display's rate, from the gaps between refreshes, which a busy
        // machine's dropped frames do not lower (see `__rafTs`).
        const display = m.refreshMs ? 1000 / m.refreshMs : faster;
        console.log(`  wall ${label.padEnd(30)} ${f1(m.drawn)} drawn/s${m.gate ? ` (${f1(m.gate.frame)} on the show's frames, ${f1(m.gate.ask)} on asks, ${f1(m.skipped)} turned down)` : ''}, displays ${f1(m.hz)} and ${f1(m.wallHz)} Hz, ${f1(m.asks)} asks/s, governor fed ${f1(m.frameMs)} ms`);
        /*
          Held to the refreshes served (see `served` in measure), and those
          checked to be no more than one display's, so a count gone wrong
          (a time origin read wrong, a lag not applied) is red here rather
          than a ceiling nothing reaches. A display rate with no gaps to
          measure it from is said so.

          1.05 and not the 1.1 the display's rate had: the gate read 1.00 to
          1.01 of the slots here at every phase, and a gate stamping offers
          when they run, with 11.6 ms draws, 1.11 to 1.20 over four runs
          (65.9 drawn for 59.5 in one), which 1.1 would call a pass. A cloud
          session drops no refreshes, so the Mac's `tools` shard is the first
          to count slots on a machine that does.
        */
        const oneDisplay = m.servedHz <= 1.05 * display;
        check(`both windows animating, the wall ${label}: at most 1.05 times the refreshes served, one display's`,
          m.drawn <= 1.05 * m.servedHz && oneDisplay && m.askCount >= enough,
          `${f1(m.drawn)} drawn a second against ${f1(m.servedHz)} refreshes served (${f1(m.drawn / Math.max(1, m.servedHz))}x; the windows were handed ${f1(m.hz)} and ${f1(m.wallHz)} a second, the display ${f1(display)} Hz${m.refreshMs ? '' : ' by rate, no gaps to measure'}${oneDisplay ? '' : ', so the served count is not one display\'s'}), ${f1(m.asks)} asks a second (${m.askCount} in ${f1(m.seconds)} s${m.askCount >= enough ? '' : `, under the ${enough} that make two clocks`})`);
        /*
          The floor: the wall must not cost the show its frames. What the show
          draws on its own is every frame its window is handed, so the floor
          is 0.9 of that, counted in these same two seconds (`hz`, this
          window's refreshes), or of the wall's refreshes the harness did not
          hold (`wallServable`, every one of which asked) if those are more:
          neither window should get fewer frames than it would alone.

          Not what the show drew alone at the start of the run, which is what
          this was: a different two seconds, and a Mac runner's rate moves by
          a third within a run (#203). That went red when the runner was
          starved in a phase and not at the start (16a's PR: 36.4 drawn
          against 37.7, 0.9 of a wall window handed 41.9, 12 of whose
          refreshes a second were the harness's own late timer, never asked
          for), and passed when it was starved at the start and not later,
          so it judged the runner more than the gate. Judged in the same
          seconds, the 53 Mac runs before this read 0.86 to 1.0, and the
          three under 0.9 were not the runner: all with both clocks on one
          refresh, the gate drawing 24.3 a second while the show's own
          window was handed 28.3, which is the gate turning down the show's
          own next frame (lib/drawGate.ts, "a clock's own next refresh"; the
          busy machine in the arithmetic above). The busy phases below make
          that machine on purpose, so it is measured on every run and not
          only when a runner happens to be starved.

          The frames handed, not the frames the loop asked for: a loop that
          asked for fewer would set its own bar. A frozen gate, or one that
          turned down one frame in two, is under it at half a refresh behind
          and on the busy machine (at 0, a quarter and three quarters on an
          idle one the other clock fills the refresh it turned down, 60.0
          against 54.0: the check-skeptic's mutant), and in the arithmetic.
        */
        if (floor) {
          const alone = Math.max(m.hz, m.wallServable);
          const least = 0.9 * alone;
          check('  and at least 0.9 times what either window alone would have drawn in the same seconds', m.drawn >= least && counted(alone) >= enough,
            `${f1(m.drawn)} a second against ${f1(least)} (0.9 of ${f1(alone)}: the show's window handed ${f1(m.hz)}, the wall's ${f1(m.wallServable)} the harness did not hold; ${counted(alone)} in ${f1(m.seconds)} s)`);
        }
        /*
          Each clock against its own window's refresh: the show's frames
          offered (drawn or turned down) at least 0.8 of the show's rate, and
          the wall's asks at least 0.8 of the wall's refreshes less those the
          harness's own late timer was holding (`__held` above). Not the
          frames the loop was handed: a loop that asks for fewer frames sets
          that count itself, and the check skeptic's projector asking every
          other refresh passed at 30.0 of 30.0 on a 60 Hz wall. Not the
          display's rate alone either: on #203's Mac run the harness's late
          timers cost the loop 10 of 48 refreshes with nothing wrong. Not "one turned down a
          refresh" against the faster display, which is only true when both
          windows get the same number of frames: headless on one display they
          do, but a Mac runner drawing 28 a second with a wall at 40, or a
          120 Hz laptop with a 60 Hz projector, turns down fewer than the
          faster display's rate with a gate that is right (the second pre-push
          review). What it has to catch is one clock that stopped offering or
          slowed down, and this does.
        */
        const offered = m.offered ? `the show's frames ${f1(m.offered.frame)} a second against ${f1(m.hz)} Hz, the wall's asks ${f1(m.offered.ask)} against the ${f1(m.wallServable)} refreshes the harness did not hold (its display ${f1(m.wallHz)} Hz, ${f1(m.wallFrames)} handed)` : 'this build has no draw gate to ask';
        /*
          And every refresh's timestamp believed. A wall whose time origin was
          converted the wrong way (seconds behind, since the wall opens five
          seconds after the show), or a clock ahead of this one by more than a
          240 Hz refresh, falls back to the time its callback ran, which is the stamping that let a slow
          frame's second clock draw too; on one display the gate still holds
          without the draw cost, so the rate lines would not see it.
        */
        if (m.fallbacks !== null) {
          check('  and every refresh\'s own timestamp was believed', m.fallbacks === 0, `${m.fallbacks} fell back to the time the callback ran${m.fallbacks && m.misses ? ` since the page opened (${m.misses.ahead} ahead of now, the worst by ${f1(m.misses.aheadMs)} ms; ${m.misses.stale} over a second old, the worst ${f1(m.misses.staleMs)} ms; the last ${f1((m.missedAgo ?? 0) / 1000)} s before this reading)` : ''}`);
        }
        check('  and both clocks were offering, each at its own window\'s rate',
          m.offered !== null && m.offered.frame >= 0.8 * m.hz && counted(m.wallServable) >= enough && m.offered.ask >= 0.8 * m.wallServable && m.skipped > 0,
          `${offered}; ${counted(m.wallServable)} of the wall's in ${f1(m.seconds)} s${counted(m.wallServable) >= enough ? '' : `, under the ${enough} that make a clock`}`);
      };
      // The display's refresh: the shortest any idle phase read (see the busy
      // phases below for why).
      let displayMs = null;
      for (const frac of [0, 0.25, 0.5, 0.75]) {
        /*
          The phase is a fraction of the refresh the windows are keeping now,
          measured just before it is set, not of the one the show kept alone
          at the start: the Mac runner's rate moves by a third within a run
          (42.7 alone, then 57.3 on #203's), which made "half a refresh" two
          thirds of one and "three quarters" a whole one, where nothing can
          double (the check-skeptic, 2026-09-27).
        */
        const pre = await measure(500);
        /*
          Or the shortest refresh an earlier phase read over its 2 s, where
          that is shorter: a runner missing most refreshes can read 500 ms of
          them as two refreshes a gap (see the busy phases below), and three
          quarters of a refresh behind became one and a half, where the
          harness's late timer held most of the wall's frames (the
          check-skeptic's starved emulation, 7.5 asks a second of 24 handed).
          The first phase is on one refresh and needs none.
        */
        const read = Math.min(pre.refreshMs ?? Infinity, displayMs ?? Infinity);
        const phaseMs = frac * (Number.isFinite(read) ? read : 1000 / Math.max(1, pre.hz, pre.wallHz));
        await wall.evaluate((p) => { window.__phaseMs = p; }, phaseMs);
        await show.waitForTimeout(300);
        const m = await measure(2000);
        if (m.refreshMs) displayMs = Math.min(displayMs ?? Infinity, m.refreshMs);
        judge(m, frac === 0 ? 'on its own clock' : `${frac} of a refresh behind`);
        /*
          And the governor, fed the interval between draws: what the show fed
          it on its own frames, not the half two interleaved clocks gave it.
          Half a refresh behind is where the old guard's two clocks
          interleaved evenly, so where the governor's average fell furthest.
          Judged against this machine's own interval rather than the display's
          refresh, so that a busy machine (the Mac runner's app draws about 28
          a second) is judged too. No governor with a renderer up is a
          failure; with none (a container with no WebGPU) there is nothing to
          feed, and it says so.

          What it was fed is read from the governor's own log of intervals
          over these two seconds, as a median, and held to 0.9 of the faster
          window's refresh in the same two seconds, with the governor fed on
          at least four of five draws. Not from its average, which is what
          the first two versions read. The first held that average to what
          the show was fed alone at the start of the run, and went red on a
          working gate when the Mac got faster in between (#203: 27.2 ms
          alone, 19.0 fed later with both windows at 53.8 and 57.3 a second).
          The second held it to this window's refresh, and the check-skeptic
          showed why neither could work: the average rises fast and falls
          slowly and resets to 16.7 ms on a rung change, so a single reading
          of it passed a governor fed half a refresh in up to half the runs
          and failed a working one read just after a reset. The median of
          the intervals themselves is neither. And the phase it is judged at
          is checked to be near half a refresh now, not only named that.
        */
        if (frac === 0.5) {
          const refresh = m.refreshMs;
          const at = refresh ? phaseMs / refresh : 0;
          /*
            The bar is the median gap between refreshes served, not the
            display's refresh: a gate that draws once a served refresh is fed
            those gaps, and a doubling gate on a thread it has saturated is
            served one refresh in two (its bar about two refreshes) while it
            is fed about one draw's cost, which on a Mac drawing at 0.9 of a
            refresh cleared 0.9 of the display's refresh (the check-skeptic).
          */
          const bar = m.servedGapMs ?? refresh;
          if (m.frameMs !== null && refresh !== null) {
            check('  and the governor is fed a whole refresh of the faster window, not half of it',
              m.fedMedian !== null && m.fedN >= 0.8 * m.drawnCount && m.fedMedian >= 0.9 * bar && at >= 0.35 && at <= 0.65,
              `median ${f1(m.fedMedian)} ms fed over ${m.fedN ?? '-'} intervals for ${m.drawnCount} draws, against a median ${f1(bar)} ms between refreshes served (the display's ${f1(refresh)} ms; the windows handed ${f1(m.hz)} and ${f1(m.wallHz)} a second), at ${at.toFixed(2)} of a refresh behind`);
          } else if (alone.engine) {
            check('  and the governor is fed a whole refresh of the faster window, not half of it', false,
              `a renderer came up (${alone.engine}) and there is no governor to read`);
          } else {
            console.log('  (the governor\'s interval not judged: there is no governor, because no renderer came up)');
          }
        }
      }
      /*
        A busy machine, made on purpose (`__busy` above): half the display's
        refreshes missed by both windows together, both clocks on one refresh
        and then half of one apart. The phases above meet a machine like this
        only when a runner happens to be starved, and the gate that turned
        down the show's own next frame passed them whenever it was not.
        Held to every line the phases are; each window must also have been
        handed at most 0.6 of the display's refreshes, the same ones, or the
        machine was not the one meant and the line says so rather than
        passing. Not three quarters apart, which was first here: there the
        two clocks make about 44 slots of 29.5 refreshes each, and the old
        gate passed the floor at 31.5 against 26.5 (the check-skeptic).
      */
      /*
        The refresh the busy phases are placed and judged by is the shortest
        the four idle phases read, 2 s each, not a reading of their own: a
        window missing refreshes has gaps of two and three, and on a runner
        starved enough that it misses most of them the shortest gap that
        recurs can be two refreshes. Then "half a refresh behind" is a whole
        one, where nothing can double, and "at most 0.6 of the display" is
        1.2 of it. The check-skeptic's starved emulation (each window missing
        the same 68 % of refreshes) read a 500 ms reading, which was here, as
        33.2 ms, and the phase landed 1.00 of a refresh behind (2026-10-04).
        A machine that drops refreshes can only make the gap read longer,
        never shorter, so the shortest of the idle readings is the display's.
      */
      const busyRefresh = displayMs ?? refreshMs;
      for (const frac of [0, 0.5]) {
        await wall.evaluate((p) => { window.__phaseMs = p; }, frac * busyRefresh);
        /*
          Measured for 2 s over the share of refreshes the busy machine
          leaves, 4 s at half, so the windows are handed as many refreshes to
          judge on as an idle phase's 2 s (see `enough` above). Not a busy
          machine sized to the runner, missing fewer refreshes where the
          runner already misses many: the runner's own misses are each
          window's own, and the book that makes both windows miss the same
          refresh is the machine this phase is for.
        */
        const missedShare = 0.5;
        // Each phase pairs the two windows' refreshes afresh (`bookEntry`).
        await show.evaluate((x) => { window.__missLock = { d: null }; window.__busy = x; }, missedShare);
        await show.waitForTimeout(300);
        const m = await measure(2000 / (1 - missedShare));
        await show.evaluate(() => { window.__busy = 0; });
        const label = frac === 0 ? 'on its own clock, thread busy' : `${frac} of a refresh behind, busy`;
        judge(m, label);
        const display = 1000 / Math.min(m.refreshMs ?? Infinity, busyRefresh);
        /*
          At most 0.6 of the display, not merely under it: missing a fifth
          of the refreshes, the old gate passed the floor (39.4 against
          38.6), so a busy machine that is only a little busy measures
          nothing. And the same refreshes missed in both windows.
        */
        /*
          And the gap the book pairs around within half a refresh (check-skeptic
          on #278): a first lock taken a refresh out pairs every refresh with
          its neighbour, one pairing and a narrow spread, and at half a
          refresh behind nothing else in this phase would catch it.
        */
        const b = m.book;
        check('  and the machine was busy: each window handed at most 0.6 of the display\'s refreshes, missed from one book', m.hz <= 0.6 * display && m.wallHz <= 0.6 * display && b.wallOwn === 0 && b.both >= 10 && b.apart !== null && b.apart.most - b.apart.least <= 4 && b.lock !== null && Math.abs(b.lock) <= busyRefresh / 2 + 1,
          `the show's window ${f1(m.hz)} and the wall's ${f1(m.wallHz)} a second, of ${f1(display)}; the book's last ${b.entries} refreshes, ${b.both} looked up by both windows${b.apart ? `, the wall's stamp ${f1(b.apart.median)} ms after the show's (${f1(b.apart.least)} to ${f1(b.apart.most)}), paired around ${f1(b.lock)}` : ''}, the projector's own book ${b.wallOwn ?? '-'}`);
        /*
          And, on one refresh, both windows handed the same refreshes: the
          slots served at most 1.15 of the more of the two windows' frames.
          The book makes both windows miss the refreshes it misses, but a
          starved runner misses more of its own, each window its own, and
          then the two clocks' frames fall in different refreshes and a
          correct gate draws well over either window alone: the floor's bar
          is far under what it should be, and the gate that turns down the
          show's own next frame, the fault this phase is for, clears it. The
          check-skeptic's mutant of that gate passed every line here on a
          starved emulation, each window missing 63 % of its refreshes on its
          own (drawn 1.07 to 1.14 of either window alone; the right gate
          1.36 to 1.39), served reading 1.47 to 1.54 of the windows' frames.
          Four Mac runs since #236 read 1.00 to 1.02 here; its first run,
          whose two windows kept two books, 1.48.

          Only on one refresh: half a refresh apart the Mac reads up to 1.69
          with the gate right (#236's second run: 21.8 served, the windows
          handed 12.9 and 13.9), its late timers parting the two windows'
          frames by themselves, so the line would judge the runner there.
          The gate's fault shows on one refresh first (23.4 drawn of 29.4
          handed, where half a refresh apart it drew 26.0 of 29.5).
        */
        const oneMachine = m.servedHz / Math.max(1, m.hz, m.wallHz);
        if (frac === 0) {
          check('  and both windows were handed the same refreshes: the slots served at most 1.15 of either window\'s', oneMachine <= 1.15,
            `${f1(m.servedHz)} served a second, the windows handed ${f1(m.hz)} and ${f1(m.wallHz)} (${oneMachine.toFixed(2)}x)`);
        } else {
          console.log(`  (the slots served ${oneMachine.toFixed(2)} of either window's frames, not judged half a refresh apart)`);
        }
      }
      await wall.evaluate(() => { window.__phaseMs = 0; });
      /*
        Draws that cost 0.7 of a refresh, both clocks on one refresh. No floor
        here: on a machine whose own draw already costs most of a refresh, a
        thread held for 0.7 more drops frames for reasons that are not the
        gate's. The frozen and halving gates are the phases' floors to catch.
      */
      /*
        0.7 of the display's refresh measured now, from the gaps: not of the
        rate the show kept alone at the start, which on #203's Mac run was
        42.7 a second and made each draw cost 0.98 of a real refresh, where
        the thread alone holds any gate under the ceiling (the check-skeptic).
      */
      await wall.evaluate(() => { window.__phaseMs = 0; });
      const drawRefresh = (await measure(500)).refreshMs ?? refreshMs;
      await show.evaluate((ms) => { window.__drawCostMs = ms; }, 0.7 * drawRefresh);
      await show.waitForTimeout(500);
      judge(await measure(2000), `on its own clock, ${f1(0.7 * drawRefresh)} ms draws`, { floor: false });
      await show.evaluate(() => { window.__drawCostMs = 0; });
      // Covered: the show's own frames stop; every ask the wall makes draws,
      // handed over raggedly.
      await wall.evaluate(() => { window.__ragged = true; });
      await show.evaluate(() => { window.__covered = true; });
      await show.waitForTimeout(500);
      const c = await measure(2000);
      console.log(`  covered, ragged                ${f1(c.drawn)} drawn/s from ${f1(c.asks)} asks/s (${c.drawnCount} of ${c.askCount})`);
      check('covered, every ask the wall makes draws, on time or 12 ms late', c.askCount > 20 && c.drawnCount >= c.askCount - 2 && c.drawnCount <= c.askCount,
        `${c.drawnCount} drawn from ${c.askCount} asks in 2 s`);
      await show.evaluate(() => window.__uncover());
      await wall.close();
    }
  } catch (err) {
    check('the wall\'s clock section completed', false, String(err?.message ?? err));
  } finally {
    await context.close();
  }
  console.log('');
}

try {
  page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&dpr=${encodeURIComponent(DPR)}${engineQuery()}`, { waitUntil: 'load' });
  // Long enough for the governor to settle and the plate to have something on
  // it: a bare plate is black everywhere and every gate below would pass for
  // the wrong reason.
  await page.waitForTimeout(9000);
  // Read before anything below touches the output: the gain and gamma checks
  // switch the guard off for themselves and back on after.
  const guardAtLoad = await page.evaluate(() => window.chromaglassDebug?.().outputConfig?.flashGuard);

  /**
   * Set the output config on the plate that is already running.
   *
   * One page, one plate. An earlier shape of this reloaded between configs,
   * which meant every comparison was between two *different* plates — fine
   * for "is this region black", useless for "did the picture reverse". The
   * app exposes the setter under `?debug` for exactly this.
   */
  const withOutput = async (cfg) => {
    const want = { ...BASE, ...cfg };
    await page.evaluate((c) => window.chromaglassOutput?.(c), want);
    // Wait for the renderer, do not guess at it. Under software rasterisation
    // this page draws a handful of frames a second, so a fixed delay measured
    // the config *before* the one just set — which is how an earlier run
    // reported that gain darkens the picture and a corner pin lights up the
    // half it empties. Two conditions: the render loop is holding the new
    // config, and it has since drawn with it.
    await page.waitForFunction((c) => {
      const live = window.chromaglassDebug?.().outputConfig;
      if (!live) return false;
      return live.flipX === c.flipX && live.flipY === c.flipY
        && live.gain === c.gain && live.gamma === c.gamma
        && (c.flashGuard === undefined || live.flashGuard === c.flashGuard)
        && live.maskTop === c.maskTop && live.maskRight === c.maskRight
        && live.maskBottom === c.maskBottom && live.maskLeft === c.maskLeft
        && live.corners.every((v, i) => Math.abs(v - c.corners[i]) < 1e-6)
        && (live.surfaces ?? []).length === (c.surfaces ?? []).length
        && (live.surfaces ?? []).every((s, i) => {
          const w = (c.surfaces ?? [])[i];
          return w && s.shape === w.shape && s.enabled === w.enabled && (s.source ?? 'wall') === (w.source ?? 'wall')
            && s.corners.every((v, j) => Math.abs(v - w.corners[j]) < 1e-6);
        });
    }, want, { timeout: 20000 });
    /*
      And drawn with, counted in the stage's own frames, not the browser's.

      Four animation frames were taken to mean the new config had been
      drawn, and nothing makes that so: the stage draws from the render
      loop, not from this page's requestAnimationFrame, and on a loaded Mac
      runner the two need not keep step. A grab taken before the stage drew
      the config photographs the one before, and the gain check reads that
      as no lift at all. Over 40 tools
      shards on 2026-09-27 its lift sat between 1.52 and 1.90 in 37, with
      two reds at 1.15 and 1.19 (#184's shard, main's deploy of #196) and
      two highs at 2.20 and 2.27: single odd frames rather than a spread,
      which is what one reading taken a config early looks like (inferred,
      not seen; the gain check below now prints every reading so the next
      one shows which). So the wait also asks the stage for two frames
      drawn after the config was live, where it can say (webgpu.frames);
      on a page without it the four animation frames are all there is.
    */
    await page.evaluate(() => new Promise((done) => {
      const drawn = () => window.chromaglassDebug?.().webgpu?.frames ?? null;
      const from = drawn();
      const start = performance.now();
      let n = 0;
      const tick = () => {
        n++;
        const now = drawn();
        const enough = from === null || now === null ? n >= 4 : n >= 4 && now >= from + 2;
        if (enough || performance.now() - start > 5000) done(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
  };

    /*
      A frame the stage declined to paint must not be measured as a picture.

      The painter has a frame or two with nothing to draw from while a rung
      change disposes one solver and builds the next. A decline leaves the
      frame's target exactly as it was acquired, so a grab taken then reads
      every channel zero — and a harness measuring it calls that a black
      plate, which is the one thing the wall checks exist to catch. It
      showed up as `npm run wall` failing about once in a few runs on a
      slow machine, with the frame before and the frame after both fine.

      Three claims. That a real grab says it painted; that a decline is
      waited out rather than measured; and that a stage which never paints
      is reported rather than handed over as black. The last two run
      against a faked `grabFrame`, because a real decline lasts a frame or
      two and cannot be asked for — the fake stands in for the timing, and
      what is under test is `__cgShot`, which is the part that was wrong.
    */
    const grabs = await page.evaluate(async () => {
      const real = await window.chromaglassDebug().grabFrame();
      const realPainted = real?.painted;

      const dbg = window.chromaglassDebug;
      const fake = (declines) => {
        let n = 0;
        window.chromaglassDebug = () => ({
          ...dbg(),
          grabFrame: async () => ({
            width: 2, height: 1,
            pixels: new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]),
            painted: n++ >= declines,
          }),
        });
      };

      fake(3);
      const after = await window.__cgShot('smoke-decline');
      const afterNote = window.__cgFrameLast;

      fake(Infinity);
      const never = await window.__cgShot('smoke-never');
      const neverNote = window.__cgFrameLast;

      window.chromaglassDebug = dbg;
      return { realPainted, after: !!after, declined: afterNote?.declined ?? 0,
               never: never === null, neverGot: neverNote?.got ?? '' };
    });
    check('a real grab says it painted the frame', grabs.realPainted === true, `painted ${grabs.realPainted}`);
    check('a few declined frames are waited out, not measured as black',
      grabs.after === true && grabs.declined === 3, `returned a picture after ${grabs.declined} declines`);
    check('and a stage that never paints is reported rather than handed over',
      grabs.never === true && /declined to paint/.test(grabs.neverGot), grabs.neverGot || 'it handed one over anyway');

  const wired = await page.evaluate(() => typeof window.chromaglassOutput === 'function');
  check('the page is running the build that was just made', wired,
    wired ? 'chromaglassOutput present' : 'stale bundle — rebuild, or a stray preview server is answering');
  if (!wired) throw new Error('no output hook — nothing below would mean anything');

  /**
   * The canvas, as a coarse grid of luminance.
   *
   * The context is created with `preserveDrawingBuffer`, so the canvas can be
   * read at any moment. A 32x18 grid of block means is enough to say where
   * the picture is and where it is not, and it is a few hundred numbers over
   * the wire instead of three million.
   */
  const gridOnce = (cols, rows) => page.evaluate(async ({ cols, rows }) => {
    const src = document.querySelector('#liquid-canvas');
    if (!src || !src.width) return null;
    const c = document.createElement('canvas');
    c.width = cols; c.height = rows;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    // drawImage downsamples with the browser's own box filter: every output
    // cell is the mean of the block under it, which is exactly what is wanted.
    // The stage photographs the canvas for us (scripts/frame.mjs), because a
    // presented WebGPU canvas cannot be copied out directly.
    const shot = await window.__cgShot('wall');
    /*
      No fallback to drawImage, deliberately.

      This used to end `else { ctx.drawImage(src, ...) }`, and `frame.mjs` says
      at the top of the file why that cannot stand: a presented WebGPU canvas
      answers drawImage with **black**, which is not an error and not
      distinguishable from a black plate. So whenever the stage could not give
      a frame — a rung change disposing one solver and building the next takes
      a few — the harness measured a black picture and reported it as the
      wall's doing. That is CI's "a keystone keeps the middle of the frame —
      mean 0.000" on a commit whose `src/` was byte-identical to the one that
      had just passed.

      `__cgShot` already waits out a decline for eight animation frames; what
      is left is a runner slow enough to need longer, and that is the caller's
      retry below. Returning null here makes the difference visible instead of
      turning it into a measurement.
    */
    if (!shot) return { failed: window.__cgFrameLast ?? { via: 'no shot' } };
    const full = document.createElement('canvas');
    full.width = shot.w; full.height = shot.h;
    full.getContext('2d').putImageData(window.__shots.wall, 0, 0);
    ctx.drawImage(full, 0, 0, cols, rows);
    const d = ctx.getImageData(0, 0, cols, rows).data;
    const out = [];
    for (let i = 0; i < cols * rows; i++) {
      out.push((0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255);
    }
    return { cols, rows, lum: out };
  }, { cols, rows });

  /*
    A frame the stage has not painted is waited for, not measured.

    In wall-clock time rather than animation frames: a painter with nothing to
    draw from may not be scheduling rAF often, which is the case `__cgShot`'s
    own eight-frame wait cannot cover on a slow runner.
  */
  const gridOf = async (cols = 32, rows = 18) => {
    let last = null;
    for (let tries = 0; tries < 12; tries++) {
      const g = await gridOnce(cols, rows);
      if (g && !g.failed) return g;
      last = g?.failed ?? 'no canvas';
      await page.waitForTimeout(200);
    }
    throw new Error(`the stage never gave a frame to measure: ${JSON.stringify(last)}`);
  };

  const at = (g, cx, ry) => g.lum[Math.floor(ry * g.rows) * g.cols + Math.floor(cx * g.cols)];
  const meanOver = (g, pred) => {
    let sum = 0, n = 0;
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
      if (pred((x + 0.5) / g.cols, (y + 0.5) / g.rows)) { sum += g.lum[y * g.cols + x]; n++; }
    }
    return n ? sum / n : 0;
  };
  /** Lit enough to be a picture rather than a dark corner of one. */
  const LIT = 0.02;

  // ── 1. Identity ────────────────────────────────────────────────────
  await withOutput({});
  /*
    And a lit one, waited for a few seconds rather than taken at once.

    A rung change builds a fresh plate, which is black until it is laid, and
    a frame from that moment is a real frame (it passes the painted check
    above) of an empty plate. The deploy of #138 met one: "the plate is
    drawing something to measure — mean 0.000", on the commit whose PR run
    had read 0.091, and the whole wall suite stopped there.
  */
  let plain = await gridOf();
  let plainMean = plain ? meanOver(plain, () => true) : 0;
  for (let tries = 0; plainMean <= LIT && tries < 20; tries++) {
    await page.waitForTimeout(500);
    plain = await gridOf();
    plainMean = plain ? meanOver(plain, () => true) : 0;
  }
  check('the plate is drawing something to measure', plainMean > LIT,
    plain ? `mean ${plainMean.toFixed(3)}` : 'no canvas');
  if (plainMean <= LIT) throw new Error('nothing on the plate — nothing below would mean anything');

  // Which solver is running does not matter here and must not gate the run.
  // The output pass is part of the *renderer*, and both solvers render through
  // the same WebGL2 composite — the CPU one uploads its field into the same
  // textures. An earlier version of this demanded the GPU solver and then
  // failed the whole run whenever the governor stepped down, which under
  // software rasterisation it does about half the time.
  const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
  console.log(`      (solver: ${engine ?? 'unknown'} — either is fine, the output pass is in the renderer)`);

  check('nothing set leaves the frame edge to edge',
    meanOver(plain, x => x < 0.06) > LIT && meanOver(plain, x => x > 0.94) > LIT,
    `left ${meanOver(plain, x => x < 0.06).toFixed(3)}, right ${meanOver(plain, x => x > 0.94).toFixed(3)}`);

  const builtIdle = await page.evaluate(() => !!window.chromaglassDebug?.().outputPass);
  check('the pass is not built when nothing is set', builtIdle === false, builtIdle ? 'built anyway' : 'absent');

  // ── 2. Masking ─────────────────────────────────────────────────────
  // A hard edge, so the gate is "black" and not "dimmer".
  const MASK = { maskBottom: 0.3, maskLeft: 0.2, maskFeather: 0 };
  /*
    Each masked frame is judged between two bare ones: the plate with no
    mask, read just before and just after it, over the same places.

    On f5e678f (PR #160, which touched nothing the wall draws) one frame read
    0.001 inside the mask a moment after the unmasked plate read 0.171; the
    same code on the commit before read 0.179. Two things read like that. The
    plate can be dark for a moment by itself (a drain, a look fading), which
    says nothing about the mask. Or the output pass, built afresh each time
    the mask is set (setting nothing drops it, section 8 checks that), can
    stay black past the few frames `withOutput` waits for, and on stage that
    is a black screen when the operator sets a mask. The first fix retried
    until lit, which passed both; the check-skeptic review said it would hide
    the second for good, and that the blanked edges were never shown to have
    had any light to blank.

    So a masked read counts only when the bare plate is lit both before and
    after it, in the kept region and in both blanked bands. Then every gate
    is judged on that one masked frame against its own brackets: the bands
    black in absolute terms and against the light they would have had, and
    the kept region lit. When the brackets are lit but the masked frame is
    dark, that is the mask's doing only if it happens again on a fresh build:
    a plate dipping for a moment does not line up with the mask three times
    over, a pass that comes up black does. Three of those fail, with the
    numbers. A bracket that is dark is the plate, and the triple is tried
    again half a second on, up to twenty times.

    What this cannot see is a black of a frame or two when the pass is
    built: `withOutput` waits four animation frames before any read.
  */
  const keptOf = g => meanOver(g, (x, y) => x > 0.25 && y < 0.65);
  const bottomOf = g => meanOver(g, (x, y) => y > 0.72);
  const leftOf = g => meanOver(g, (x, y) => x < 0.18 && y < 0.68);
  const litAll = g => keptOf(g) > LIT && bottomOf(g) > LIT && leftOf(g) > LIT;
  let judged = null, dark = 0, tries = 0;
  const ateReads = [];
  for (; tries < 20 && !judged && ateReads.length < 3; tries++) {
    if (tries) await page.waitForTimeout(500);
    await withOutput({});
    const before = await gridOf();
    await withOutput(MASK);
    const masked = await gridOf();
    await withOutput({});
    const after = await gridOf();
    if (!litAll(before) || !litAll(after)) { dark++; continue; }
    if (keptOf(masked) <= LIT) { ateReads.push(`${keptOf(masked).toFixed(3)} between ${keptOf(before).toFixed(3)} and ${keptOf(after).toFixed(3)}`); continue; }
    judged = {
      kept: keptOf(masked), bottom: bottomOf(masked), left: leftOf(masked),
      bareBottom: Math.min(bottomOf(before), bottomOf(after)), bareLeft: Math.min(leftOf(before), leftOf(after)),
    };
  }
  const ate = ateReads.length >= 3;
  /*
    The flash guard reads the delivered frame, mask and all, so the loop's
    mask on, mask off is a luminance step it sees. At about 0.17 on this
    plate the mask takes some 0.07 away, under the guard's 0.1 step, and a
    triple takes over a second, under its three a second: it should never
    engage here. If it did, it would dim the bare reads that bracket the
    masked one, so a failure says whether it had.
  */
  const guard = await page.evaluate(() => window.chromaglassDebug?.().flash?.() ?? null);
  const guardNote = guard ? `; flash guard ${guard.engaged ? `engaged, gain ${guard.gain.toFixed(2)}` : 'not engaged'}` : '';
  const why = (ate ? `the mask ate a lit plate on ${ateReads.length} fresh builds: ${ateReads.join('; ')}`
    : `no masked read between two lit bare ones in ${tries} tries (${dark} with the bare plate dark, ${ateReads.length} dark masked)`) + guardNote;
  check('the edges the mask blanks are lit without it', !!judged,
    judged ? `bottom ${judged.bareBottom.toFixed(3)}, left ${judged.bareLeft.toFixed(3)} bare` : why);
  // Black outright, and against the light that band had: a band lit at 0.02
  // and let through at 0.0039 passes a bare "under 0.004" with a fifth of
  // its light leaking.
  const blanked = (m, bare) => m < 0.004 && m < 0.1 * bare;
  check('a blanked bottom edge is black', judged && blanked(judged.bottom, judged.bareBottom),
    judged ? `mean ${judged.bottom.toFixed(4)} masked, ${judged.bareBottom.toFixed(3)} bare` : 'not judged');
  check('a blanked left edge is black', judged && blanked(judged.left, judged.bareLeft),
    judged ? `mean ${judged.left.toFixed(4)} masked, ${judged.bareLeft.toFixed(3)} bare` : 'not judged');
  check('the picture survives inside the mask', !!judged,
    judged ? `mean ${judged.kept.toFixed(3)}${tries > 1 ? ` on try ${tries}` : ''}` : why);

  await withOutput(MASK);

  const builtNow = await page.evaluate(() => !!window.chromaglassDebug?.().outputPass);
  check('the pass is built as soon as something is set', builtNow === true, builtNow ? 'built' : 'never built');


  // ── 3. Corner pin ──────────────────────────────────────────────────
  // The picture squeezed into the left half: everything right of it is off.
  const pinnedLeft = [0, 0, 0.5, 0, 0.5, 1, 0, 1];
  await withOutput({ corners: pinnedLeft });
  const pinned = await gridOf();
  const outside = meanOver(pinned, x => x > 0.56);
  const inside = meanOver(pinned, x => x > 0.06 && x < 0.44);
  check('outside the pinned quad is black', outside < 0.004, `mean ${outside.toFixed(4)}`);
  check('inside the pinned quad is the picture', inside > LIT, `mean ${inside.toFixed(3)}`);

  // ── 4. Flip ────────────────────────────────────────────────────────
  // Rear projection reverses the *picture*, not the quad the operator pinned:
  // turning it on must not move the blanking or the corners. The picture is
  // liquid and never twice the same, so its reversal is measured as a profile
  // correlation on two frames half a second apart, not pixel for pixel.
  const profileOf = (g, lo, hi) => {
    const cols = [];
    for (let x = 0; x < g.cols; x++) {
      const u = (x + 0.5) / g.cols;
      if (u < lo || u > hi) continue;
      let s = 0;
      for (let y = 0; y < g.rows; y++) s += g.lum[y * g.cols + x];
      cols.push(s / g.rows);
    }
    return cols;
  };
  /*
    Null when there is nothing to correlate, and that distinction cost a deploy.

    This returned 0 for a profile with no variance — a flat frame — which is
    also what it returns for two profiles that are genuinely uncorrelated. The
    flip gate below is `reversed > direct`, so a frame that came back empty
    made both of them 0, `0 > 0` was false, and the run reported *rear
    projection reverses the picture inside it* as a broken feature:

      FAIL  rear projection reverses the picture — reversed 0.000 vs direct 0.000

    Nothing was wrong with rear projection. The harness had photographed a flat
    frame and could not tell that from an answer. `null` says so, and the two
    readers below now have to decide what to do about it rather than being
    handed a number that looks like a measurement.
  */
  const corr = (a, b) => {
    const n = Math.min(a.length, b.length);
    if (n === 0) return null;
    const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i] - ma, y = b[i] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    if (!(da > 0) || !(db > 0)) return null;
    return num / Math.sqrt(da * db);
  };

  // The keystone, before anything repaints the plate.
  //
  // This one asks that the middle of the frame stays lit, so it has to run on
  // a full plate — and the flip check below deliberately empties it down to a
  // stripe. Measured in the other order, the keystone "emptied the middle"
  // because the flip test had already emptied it.
  // A keystone: the top edge pulled in on both sides. The corners themselves
  // must go dark while the middle of the frame does not.
  await withOutput({ corners: [0.3, 0, 0.7, 0, 1, 1, 0, 1] });
  const keyed = await gridOf();
  const topCorners = (at(keyed, 0.03, 0.03) + at(keyed, 0.97, 0.03)) / 2;
  const middle = meanOver(keyed, (x, y) => x > 0.35 && x < 0.65 && y > 0.4 && y < 0.9);
  check('a keystone empties the corners it pulled in from', topCorners < 0.004, `mean ${topCorners.toFixed(4)}`);
  check('a keystone keeps the middle of the frame', middle > LIT, `mean ${middle.toFixed(3)}`);


  // Paint the plate lopsided first, and check that it worked.
  //
  // A flip can only be seen against something that is not already symmetric,
  // and whether a liquid plate happens to be is luck: one run measured an
  // asymmetry of 0.02 and the gate correctly refused to certify a flip it
  // could not see — right for the check, useless for a gate, since it then
  // fails on the plate's mood rather than on a defect. So the condition is
  // made rather than waited for, by reaching through the debug hook and
  // putting dye down one side of the plate. A back door, deliberately: it is
  // setting the test up, not performing it.
  //
  // Which side is not obvious from here. The fluid grid reaches the canvas
  // through a rotation and a scale, so a stripe down one edge of the grid can
  // arrive as a stripe across the *top* of the screen — left-right symmetric,
  // and a flip gate measuring columns then means nothing all over again
  // (measured: 0.007). Rather than encode that mapping here, where it would
  // quietly rot the first time the renderer changed, both stripes are tried
  // and whichever actually makes the picture lopsided is the one used.
  /*
    An empty plate used to be the most lopsided plate there is.

    With `corr` returning 0 for a profile it could not correlate, this returned
    `1 - 0` — a perfect 1.0 — for a frame with nothing on it, sailing past the
    `asym >= 0.15` gate whose whole job is to prove the stripe is there before
    the flip is judged against it. The gate that exists to refuse an unmeasurable
    plate was satisfied by the plate being blank. Null now, and the caller skips
    it.
  */
  const lopsidedness = (g) => {
    const prof = profileOf(g, 0.02, 0.48);
    const c = corr(prof, prof.slice().reverse());
    return c === null ? null : 1 - c;
  };
  const stripe = async (axis) => {
    await page.evaluate((which) => {
      const fluid = window.chromaglassDebug?.().fluids?.[0];
      if (!fluid) return;
      fluid.clearAll();
      for (let i = 0; i < 900; i++) {
        const near = 12 + Math.random() * 70;     // one end of the grid
        const along = 12 + Math.random() * 168;   // the whole of the other axis
        const x = which === 'x' ? near : along;
        const y = which === 'x' ? along : near;
        fluid.addDensity(Math.floor(x), Math.floor(y), 3, 1, 0.25, 0.1);
      }
    }, axis);
    await withOutput({ corners: pinnedLeft });
    return gridOf();
  };

  let pinnedAgain = null;
  let asym = 0;
  let wonAxis = null;
  for (const axis of ['x', 'y']) {
    const g = await stripe(axis);
    const a = lopsidedness(g);
    if (a !== null && a > asym) { asym = a; pinnedAgain = g; wonAxis = axis; }
    if (asym >= 0.15) break;
  }
  check('the plate can be made lopsided enough to tell a flip from no flip', asym >= 0.15,
    `asymmetry ${asym.toFixed(3)}`);

  /*
    Laid again if the flipped frame came back with nothing on it.

    The stripe is put down by hand and then photographed twice, and between the
    two the plate keeps running: it advects, it evaporates, and the dye can
    leave the window these profiles read. When that happens the flip is not
    wrong, it is unmeasured — so the stripe is laid again and the photograph
    retaken, up to three times, and only then does the check speak.
  */
  let flipped = null, direct = null, reversed = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1 && wonAxis) pinnedAgain = await stripe(wonAxis);
    await withOutput({ corners: pinnedLeft, flipX: true });
    flipped = await gridOf();
    if (!pinnedAgain) break;
    const A = profileOf(pinnedAgain, 0.02, 0.48);
    const B = profileOf(flipped, 0.02, 0.48);
    direct = corr(A, B);
    reversed = corr(A, B.slice().reverse());
    if (direct !== null && reversed !== null) break;
  }

  const flippedOutside = meanOver(flipped, x => x > 0.56);
  check('rear projection leaves the pinned quad where it was', flippedOutside < 0.004, `mean ${flippedOutside.toFixed(4)}`);

  const measured = direct !== null && reversed !== null;
  check('rear projection reverses the picture inside it', measured && reversed > direct,
    measured
      ? `reversed ${reversed.toFixed(3)} vs direct ${direct.toFixed(3)} (asymmetry ${asym.toFixed(3)})`
      : 'could not measure it: after three tries one of the two profiles still had no ' +
        'variance in it, so this says nothing about the flip either way');

  // ── 5. Grade ───────────────────────────────────────────────────────
  /*
    Alternating, not bracketing once.

    The plate drifts while this runs, so a graded reading has to be compared
    against ungraded ones taken around it — otherwise drift is mistaken for
    the effect. One bracket cancels that to first order, and it was not
    enough: the gain check measures a lift of about 1.5x against a gate of
    1.25, and on a slow runner one reading came back at 1.258 and failed. The
    gate is not miscalibrated — locally the same check reads 1.48, 1.58 and
    1.48 — the measurement was just too noisy for it.

    So this alternates, which is the same discipline `npm run stages` has in
    its header for the same reason: the plate is chaotic, and what is worth
    reading is the pair rather than the number. Three graded readings and
    four ungraded ones around them, each set averaged. Drift now cancels
    across several crossings instead of one, and single-frame noise is
    averaged down rather than carried straight into the ratio.

    The threshold is untouched. A check that fails now and then is fixed by
    measuring it better, never by asking less of it.
  */
  /*
    With the flash guard off, and only here.

    Alternating a graded frame with a plain one every few frames *is* a
    flicker, and the guard is built to catch exactly that: it rides the
    master dimmer down against the swing. So did the masks, pins and flips
    just before, which blank and restore the frame the same way. On a slow
    runner the guard was still holding the plate at a third when this
    started (the plain reading 0.031 against 0.095 at the top of the run),
    and then answered the 2.2x gain by dimming again: 0.031 -> 0.030, a
    check measuring the guard rather than the grade. The guard has its own
    checks below, with it back on.
  */
  const bracket = async (cfg, rounds = 3) => {
    let off = 0;
    let on = 0;
    // Every reading in the order taken, plain and graded alternating, so a
    // red run says whether one frame was odd or the whole bracket was.
    const seq = [];
    for (let i = 0; i < rounds; i++) {
      await withOutput({ flashGuard: false });
      const a = meanOver(await gridOf(), () => true);
      await withOutput({ ...cfg, flashGuard: false });
      const b = meanOver(await gridOf(), () => true);
      off += a; on += b; seq.push(a, b);
    }
    await withOutput({ flashGuard: false });
    const z = meanOver(await gridOf(), () => true);
    off += z; seq.push(z);
    return { it: on / rounds, base: off / (rounds + 1), seq: seq.map((v) => v.toFixed(3)).join(' ') };
  };
  const gain = await bracket({ gain: 2.2 });
  check('output gain lifts what reaches the wall', gain.it > gain.base * 1.25,
    `${gain.base.toFixed(3)} -> ${gain.it.toFixed(3)} (plain, graded, … in order: ${gain.seq})`);
  const gamma = await bracket({ gamma: 2.2 });
  check('output gamma darkens the mid-tones', gamma.it < gamma.base * 0.95,
    `${gamma.base.toFixed(3)} -> ${gamma.it.toFixed(3)}`);
  await withOutput({ flashGuard: true });

  // ── 6. The same, with the camera in the way ────────────────────────
  //
  // The photographic presets draw the plate into a texture and look at it
  // through a lens — refraction, depth of field, bloom, a sensor roll-off —
  // so with one of those on, the output pass is not the second pass in the
  // chain but the third. That is a different code path, and it was broken:
  // the output pass's own target was only ever allocated on the branch where
  // no camera existed, so the camera rendered into a framebuffer with nothing
  // attached and the output pass then sampled a texture with no storage. A
  // keystone on Oil on Water was a black wall, and every check above passed
  // the whole time because the default look has no camera on it.
  {
    const applied = await page.evaluate(() => {
      if (typeof window.chromaglassApplyPreset !== 'function') return false;
      window.chromaglassApplyPreset('oil-on-water');
      return true;
    });
    check('a photographic preset can be reached', applied, applied ? 'oil-on-water' : 'no hook');
    if (applied) {
      // Long enough for the camera pass to be built and the plate to fill.
      await withOutput({});
      let lit = 0;
      for (let i = 0; i < 12 && !(lit > LIT); i++) {
        await page.waitForTimeout(1500);
        lit = meanOver(await gridOf(), () => true);
      }
      const camOn = await page.evaluate(() => (window.chromaglassDebug?.().settings?.camera ?? 0) > 0.001);
      check('and it really has the camera on', camOn, `camera ${camOn}`);
      check('the plate still draws with a camera on it', lit > LIT, `mean ${lit.toFixed(3)}`);

      await withOutput({ maskBottom: 0.3, maskFeather: 0 });
      const camMask = await gridOf();
      const camBlanked = meanOver(camMask, (x, y) => y > 0.72);
      const camKept = meanOver(camMask, (x, y) => y < 0.6);
      check('a blanked edge is black through the camera too', camBlanked < 0.004, `mean ${camBlanked.toFixed(4)}`);
      check('and the picture survives it', camKept > LIT, `mean ${camKept.toFixed(3)}`);

      await withOutput({ corners: pinnedLeft });
      const camPin = await gridOf();
      const camOutside = meanOver(camPin, x => x > 0.56);
      const camInside = meanOver(camPin, x => x > 0.06 && x < 0.44);
      check('a corner pin holds through the camera too', camOutside < 0.004, `mean ${camOutside.toFixed(4)}`);
      check('and the picture is inside it', camInside > LIT, `mean ${camInside.toFixed(3)}`);
    }
    await withOutput({});
  }

  // ── 7. The flash guard's eyes ──────────────────────────────────────
  //
  // The guard's arithmetic is checked exhaustively above, on traces, because
  // that is where it can be. What cannot be checked there is the half that
  // lives in the driver: a blit of the default framebuffer into a 16x16
  // texture, a read behind a fence, and the luminance that comes back. So
  // that is what is checked here — that the number the guard is handed is
  // really a measurement of the frame that went to the screen, and not a
  // reading that never lands (a fence that is never flushed simply never
  // signals, and a guard with no reading is a guard that silently does
  // nothing).
  //
  // Not a strobe: this page renders a handful of frames a second under
  // software rasterisation, so a six-hertz square is past what the harness
  // could even produce. Making the frame brighter and darker and watching the
  // reading follow is the part that needs a browser.
  const lumNow = async () => {
    // A couple of frames for the read to land, then whatever the probe has.
    await page.evaluate(() => new Promise((done) => {
      let n = 0;
      const tick = () => (++n >= 6 ? done() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }));
    return page.evaluate(() => window.chromaglassDebug?.().flash?.()?.luminance ?? null);
  };
  await withOutput({});
  const midLum = await lumNow();
  check('the guard is being handed a reading of the real frame', midLum !== null && midLum > 0,
    midLum === null ? 'no reading ever landed' : `luminance ${midLum.toFixed(3)}`);

  if (midLum !== null && midLum > 0) {
    await withOutput({ gain: 0.3 });
    const dark = await lumNow();
    await withOutput({ gain: 2.4 });
    const bright = await lumNow();
    await withOutput({});
    console.log(`  the probe, through the grade  ${dark?.toFixed(3)} dim / ${midLum.toFixed(3)} plain / ${bright?.toFixed(3)} lifted`);
    check('and the reading follows what the wall actually gets',
      dark !== null && bright !== null && dark < midLum && bright > midLum,
      `${dark?.toFixed(3)} < ${midLum.toFixed(3)} < ${bright?.toFixed(3)}`);
  }

  // On by default, and on in the config the app actually loaded — not merely
  // "the debug hook returns an object", which it does whatever the guard is
  // doing and which is what an earlier version of this line checked.
  const guardOn = await page.evaluate(() => window.chromaglassDebug?.().outputConfig?.flashGuard);
  check('the guard is on without anyone asking for it', guardAtLoad === true && guardOn === true,
    `flashGuard ${guardAtLoad} at load, ${guardOn} now`);
  const reading = await page.evaluate(() => window.chromaglassDebug?.().flash?.()?.luminance ?? null);
  check('and it is being fed', reading !== null && reading > 0, `luminance ${reading}`);

  // ── 7b. Projection mapping ─────────────────────────────────────────
  //
  // The geometry is proved in `npm run map`, which has no picture in it. What
  // can only be seen here is whether the shapes actually *mask*: that the
  // frame goes dark where no surface lands, that a gap between two of them
  // stays a gap, and that a circle is a circle rather than the rectangle it is
  // cut from. Every claim is a ratio against the same cells with no surfaces
  // on, so a plate that happens to be dark in one corner cannot pass or fail
  // one of these on its own.
  {
    const quad = (x0, y0, x1, y1) => [x0, y0, x1, y0, x1, y1, x0, y1];
    const surf = (shape, x0, y0, x1, y1, extra = {}) => ({
      id: `${shape}-${x0}-${y0}`, shape, corners: quad(x0, y0, x1, y1),
      src: [0, 0, 1, 1], enabled: true, opacity: 1, feather: 0, ...extra,
    });
    /** Mean luminance over a rectangle of the frame, in 0..1 screen space. */
    const region = (g, x0, y0, x1, y1) =>
      g ? meanOver(g, (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1) : NaN;

    await withOutput({});
    const bare = await gridOf();

    // One small square: everything outside it must go out.
    await withOutput({ surfaces: [surf('rect', 0.4, 0.4, 0.6, 0.6)] });
    const one = await gridOf();
    const outsideBefore = region(bare, 0.0, 0.0, 0.25, 0.25);
    const outsideAfter = region(one, 0.0, 0.0, 0.25, 0.25);
    check('outside a shape the projector goes dark',
      outsideAfter < 0.01 && outsideAfter < outsideBefore * 0.1,
      `${outsideBefore.toFixed(3)} -> ${outsideAfter.toFixed(3)}`);
    const insideBefore = region(bare, 0.43, 0.43, 0.57, 0.57);
    const insideAfter = region(one, 0.43, 0.43, 0.57, 0.57);
    check('and inside it the picture is still there',
      insideAfter > insideBefore * 0.3 && insideAfter > 0.01,
      `${insideBefore.toFixed(3)} -> ${insideAfter.toFixed(3)}`);

    // Two shapes with wall between them: the wall stays wall.
    await withOutput({
      surfaces: [surf('rect', 0.04, 0.3, 0.34, 0.7), surf('rect', 0.66, 0.3, 0.96, 0.7)],
    });
    const two = await gridOf();
    const left = region(two, 0.08, 0.35, 0.3, 0.65);
    const right = region(two, 0.7, 0.35, 0.92, 0.65);
    const gap = region(two, 0.42, 0.35, 0.58, 0.65);
    check('two shapes light, and the gap between them does not',
      left > 0.01 && right > 0.01 && gap < 0.01,
      `left ${left.toFixed(3)} gap ${gap.toFixed(3)} right ${right.toFixed(3)}`);

    // A circle is not the square it was cut from. Its bounding quad's corner
    // has to be dark while its middle is lit — the one claim that separates a
    // working local-space shape test from one that silently draws rectangles.
    await withOutput({ surfaces: [surf('ellipse', 0.25, 0.1, 0.75, 0.9)] });
    // Finer than the default grid: the patch that is unambiguously outside the
    // circle but inside its quad is small, and at 32x18 it is one cell. The
    // first version of this sampled out to (0.33, 0.25), which is local
    // (0.16, 0.19) — 0.46 from the centre, so inside the circle and lit. It
    // failed on a circle that was drawn correctly.
    const round = await gridOf(64, 36);
    const mid = region(round, 0.45, 0.45, 0.55, 0.55);
    const nook = region(round, 0.26, 0.11, 0.31, 0.20);
    check('a circle leaves the corners of its quad dark',
      mid > 0.01 && nook < mid * 0.2,
      `middle ${mid.toFixed(3)}, corner ${nook.toFixed(3)}`);

    // Off is off, without leaving the list.
    await withOutput({ surfaces: [surf('rect', 0.4, 0.4, 0.6, 0.6, { enabled: false })] });
    const dark = await gridOf();
    check('a shape switched off lights nothing', region(dark, 0, 0, 1, 1) < 0.005,
      `${region(dark, 0, 0, 1, 1).toFixed(4)}`);
  }

  // ── 7c. A projector's own source (PLAN.md §16b) ──────────────────────
  //
  // Two projectors side by side, each the whole picture squeezed into its
  // own half of the frame, so a cell in the left half and the cell sixteen
  // columns over are the same place on the plate in the same frame. Every
  // claim is between the two halves of one frame: across two frames the
  // liquid has moved, and a difference between them would be the liquid's.
  //
  // Each source is held to a reference drawn in the same frame: the left
  // projector shows the wall with that source's other rows set to 0 on the
  // running plate (the settings hook), the right one the source. They must
  // be one picture, to within what two quads a pixel apart differ by (the
  // control, both on the wall); and with the settings put back, the two must
  // be apart. A source routed to another source's texture, or never drawn,
  // fails the first; a source that is only the wall fails the second.
  //
  // On Fillmore East, two plates, with the camera and the film stock off, so
  // the wall is the plate's display pass as the sources are: section 6 left
  // Oil on Water up, one plate under a lens, where the back plate alone and
  // the film alone are both the bare lamp and could not be told apart.
  //
  // Fillmore and not Classic, and a film playing, because each source has to
  // have something of its own to show. The first Mac run (#226) was on
  // Classic with no film: Classic lays its back plate empty (`layPlate`
  // clears every plate and seeds only the front; the back fills only as the
  // automation pours into it), so the back source and its reference were both
  // black, the front source was the wall to 0.001 because the back added
  // nothing to it, and the film alone was black because nothing was loaded.
  // All three were measuring a moment of the plate, not the routing. Fillmore
  // is the look made of two projectors: the back plate is laid with its own
  // wash (`laySecondPlate`) and the film row is at 0.7. The film is the
  // browser's fake camera (scripts/chromium.mjs asks for one), started from
  // Settings, Film, Camera, as a person would.
  // `npm run mixer` holds each source to the exact picture on a lab plate;
  // this asks the app's frame on a real GPU, and prints what each costs.
  {
    const half = (x0, source) => ({
      id: `half-${x0}-${source}`, shape: 'rect', corners: [x0, 0, x0 + 0.5, 0, x0 + 0.5, 1, x0, 1],
      src: [0, 0, 1, 1], enabled: true, opacity: 1, feather: 0, source,
    });
    /** Left against right, cell by cell: the mean luminance of each and the mean difference between them. */
    const halves = async (left, right) => {
      await withOutput({ surfaces: [half(0, left), half(0.5, right)], flashGuard: false });
      const g = await gridOf();
      const cols = g.cols / 2;
      let l = 0, r = 0, d = 0, n = 0;
      for (let y = 0; y < g.rows; y++) for (let x = 0; x < cols; x++) {
        const a = g.lum[y * g.cols + x], b = g.lum[y * g.cols + x + cols];
        l += a; r += b; d += Math.abs(a - b); n++;
      }
      return { left: l / n, right: r / n, diff: d / n };
    };
    const set = async (patch) => {
      await page.evaluate((p) => window.chromaglassSettings?.(p), patch);
      await page.waitForFunction((p) => {
        const now = window.chromaglassSettings?.();
        return !!now && Object.entries(p).every(([k, v]) => now[k] === v);
      }, patch, { timeout: 20000 });
      await page.waitForTimeout(400);
    };
    const f3 = (v) => v.toFixed(3);
    const timings = () => page.evaluate(() => {
      const d = window.chromaglassDebug?.().webgpu;
      return d ? { on: !!d.timestamps, t: { ...(d.timings ?? {}) } } : null;
    });

    await page.evaluate(() => window.chromaglassApplyPreset?.('fillmore-1969'));
    await set({ camera: 0, stock: 0 });
    await page.getByTestId('open-all-settings').click();
    await page.getByTestId('settings-nav-film').click();
    await page.getByTestId('film-camera').click();
    // Playing, not only started: `startFilmCamera` names the film a camera
    // before its first frame, and the plate counts a film as on only once the
    // video has a frame and a size (gpu/plateUniforms.ts). The check below
    // asks the same, so a camera that never sends a frame is reported as that
    // and not as a source routed wrong.
    const filmPlaying = () => {
      const v = window.chromaglassDebug?.().film?.video;
      return window.chromaglassDebug?.().film?.kind === 'camera' && !!v && v.readyState >= 2 && v.videoWidth > 0;
    };
    await page.waitForFunction(filmPlaying, null, { timeout: 15000 }).catch(() => {});
    await page.keyboard.press('Escape');
    const look = await page.evaluate(() => {
      const s = window.chromaglassSettings?.();
      return s ? {
        layers: s.layerCount, camera: s.camera ?? 0, stock: s.stock ?? 0, levels: [s.frontLevel ?? 1, s.backLevel ?? 1],
        film: window.chromaglassDebug?.().film?.kind ?? null, filmMix: s.filmMix ?? 0,
        frames: (() => { const v = window.chromaglassDebug?.().film?.video; return v ? { ready: v.readyState, width: v.videoWidth } : null; })(),
      } : null;
    });
    const playing = !!look?.frames && look.frames.ready >= 2 && look.frames.width > 0;
    check('the sources are asked on a two-plate look with no camera and no film stock, and a film playing',
      !!look && look.layers === 2 && look.camera === 0 && look.stock === 0 && look.levels.every(v => v > 0.5)
        && look.film === 'camera' && playing && look.filmMix > 0.3, JSON.stringify(look));
    // Let the plate fill before anything is measured on it.
    await withOutput({ flashGuard: false });
    for (let i = 0; i < 20 && !(meanOver(await gridOf(), () => true) > LIT); i++) await page.waitForTimeout(500);
    const before = await timings();

    const same = await halves('wall', 'wall');
    check('two projectors both on the wall show the same picture', same.left > LIT && same.diff < 0.1 * same.left,
      `left ${f3(same.left)}, right ${f3(same.right)}, apart by ${f3(same.diff)}`);
    // Within twice the control, and never under a floor of 0.004 of full
    // scale: two quads a pixel apart can agree better than a cell's dither.
    const near = Math.max(2 * same.diff, 0.004);
    const OFF = {
      front: { backLevel: 0, filmMix: 0 },
      back: { frontLevel: 0, filmMix: 0, markMix: 0 },
      film: { frontLevel: 0, backLevel: 0, ledLevel: 0, gelWheel: 0, lumia: 0, markMix: 0 },
    };
    const live = await page.evaluate(() => window.chromaglassSettings?.());
    // The film source draws a Multiply film as Add (lib/plateSources.ts), so
    // its reference on the wall has to as well, or it is black by design.
    if (live.filmBlend === 'multiply') OFF.film.filmBlend = 'add';
    const drawn = {};
    for (const kind of ['front', 'back', 'film']) {
      const restore = Object.fromEntries(Object.keys(OFF[kind]).map(k => [k, live[k] ?? (k === 'filmMix' || k === 'markMix' || k === 'gelWheel' || k === 'lumia' ? 0 : 1)]));
      await set(OFF[kind]);
      const ref = await halves('wall', kind);
      await set(restore);
      const apart = await halves('wall', kind);
      drawn[kind] = (await timings())?.t?.[`plate ${kind}`];
      check(`the ${kind} source is the wall with its other rows at 0, drawn in the same frame, and not the wall itself`,
        ref.left > LIT && ref.diff <= near && apart.diff > 4 * same.diff,
        `against its reference ${f3(ref.diff)} (within ${f3(near)}); against the wall ${f3(apart.diff)} (the control ${f3(same.diff)}); it ${f3(ref.right)}, the reference ${f3(ref.left)}`);
    }
    // And the film alone is the film: with its row at 0 the film's projector
    // goes dark. Without this the film line above would pass on anything else
    // still lit in a view whose plates are off (the lamp's rim, the beads),
    // since that view always differs from the wall.
    {
      await set({ filmMix: 0 });
      const dark = await halves('wall', 'film');
      await set({ filmMix: live.filmMix });
      check('the film source is lit by the film: with the film row at 0 its projector is dark',
        dark.right < LIT, `film source ${f3(dark.right)} at Film Mix 0 (dark under ${LIT}), the wall beside it ${f3(dark.left)}`);
    }
    // What each picture costs: its own display pass, timed under its own
    // label, absent before any projector asked for it and fresh while one
    // does (the profiler decays an old label rather than dropping it, so
    // "present" alone would be true a minute after the pass stopped).
    if (before?.on) {
      const t = (await timings()).t;
      const absent = ['front', 'back', 'film'].filter(k => typeof before.t[`plate ${k}`] === 'number');
      check('each source is drawn as its own pass, timed only once a projector asks for it',
        absent.length === 0 && ['front', 'back', 'film'].every(k => drawn[k] > 0.001),
        `before: ${absent.length ? absent.join(', ') + ' already there' : 'none'}; wall ${t.plate?.toFixed(2)} ms, ${['front', 'back', 'film'].map(k => `${k} ${drawn[k]?.toFixed(2)} ms`).join(', ')}`);
    } else {
      console.log(' skip  each source\'s cost: this device has no timestamp queries');
    }
    // Off is disabled with no film playing, and a click on it would wait out
    // Playwright's thirty seconds and lose every section after this one.
    if (look?.film === 'camera') {
      await page.getByTestId('open-all-settings').click();
      await page.getByTestId('settings-nav-film').click();
      await page.getByTestId('film-off').click();
      await page.keyboard.press('Escape');
    }
    await withOutput({ flashGuard: true });
  }

  // ── 8. Back to nothing ─────────────────────────────────────────────
  await withOutput({});
  const goneAgain = await page.evaluate(() => !!window.chromaglassDebug?.().outputPass);
  check('resetting drops the pass again', goneAgain === false, goneAgain ? 'still built' : 'gone');

  /*
    The wall does not freeze when it takes the screen.

    Reported from a show: sending the plate to the wall and going fullscreen
    left a still picture on it. The projector window mirrors whatever the show
    window draws — it pushes, it does not pull, because a presented WebGPU
    canvas answers a pull with black — and the show window's loop is
    `requestAnimationFrame` and nothing else. A browser stops giving animation
    frames to a window it thinks is hidden, which is precisely what the show
    window becomes when the wall covers the screen in front of it. The wall
    then holds the last frame it was handed, for ever.

    The fix is that the window which is definitely visible asks for the
    frames. What can be checked here is the mechanism: the show exposes a
    frame the projector can ask for, and asking produces a picture that has
    moved — with the plate's own clock left running, so a frame that never
    arrives is the only way this fails.
  */
  {
    const hasHook = await page.evaluate(() => typeof window.__chromaglassFrame === 'function');
    check('the show offers the projector a frame it can ask for', hasHook,
      hasHook ? '__chromaglassFrame is there' : 'the wall can only wait to be pushed to');
    if (hasHook) {
      /*
        Counted, not photographed.

        The first version of this read the canvas with `drawImage` and saw
        nothing change — which is not the show standing still, it is the thing
        the projector was built around in the first place: a presented WebGPU
        canvas hands back black when it is pulled from. Asking the show how
        many frames it has drawn is the question that survives that.
      */
      const drew = await page.evaluate(async () => {
        const frames = () => window.chromaglassDebug?.().webgpu?.frames ?? -1;
        const before = frames();
        for (let i = 0; i < 30; i++) {
          window.__chromaglassFrame();
          await new Promise(r => setTimeout(r, 16));
        }
        return { before, after: frames() };
      });
      check('and asking for one draws one', drew.after > drew.before + 20,
        `${drew.after - drew.before} frames drawn over thirty asks`);
    }
  }

} catch (err) {
  check('the run completed', false, String(err?.message ?? err));
  failed = 1;
} finally {
  await browser.close();
  stop();
}

const bad = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad || failed ? 1 : 0);
