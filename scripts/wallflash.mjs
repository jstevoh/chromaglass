/**
 * The flash guard on luminance traces: the arithmetic half of `npm run wall`,
 * moved here unchanged when wall.mjs passed its size ceiling (scripts/sizes.json).
 * wall.mjs calls it first, with its own `check`, before anything is launched.
 */
import { FlashGuard } from '../src/lib/flashGuard.ts';

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
export function flashTraces(check) {
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
