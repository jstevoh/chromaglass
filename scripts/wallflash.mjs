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
  tileTraces(check);
  console.log('');
}

// ── The guard by quarters, in light (PLAN.md 14i-guard and 14r) ────────
//
// Written before the guard it checks, red on main by design, for the
// Antigravity brief of 2026-10-31 that builds it; CI runs `npm run wall --
// --owed=quarter,red,rung` until that PR ships them and takes each id it
// ships out of the flag (an id whose line passes, or one this file does not
// know, is a failure, so a line cannot stay excused once it holds). Three
// things the guard on one whole-wall number cannot do, from 14r and the
// flash-guard bullet of 14i:
//
//   quarter  a flash over a quarter of the wall is a flash. Rec. 709's
//            relative luminance of the wall's mean moves a quarter as far, so
//            a 0.4 flash over a quarter reads 0.1 to a guard that sums every
//            pixel, and anything smaller never counts at all. The rule (WCAG
//            2.3.1, after the Harding test) counts a flash over a quarter of
//            any part of the field of view; on a wall seen from a room the
//            check takes any window of a quarter of the wall.
//   red      a saturated red flash is a flash whatever its luminance (WCAG's
//            red flash: a transition where R/(R+G+B) is at least 0.8, on
//            linear light, and (R - G - B) x 320 changes by more than 20,
//            negatives as 0; a pair of opposing ones is one red flash). Black
//            to a linear red of 0.4 moves luminance 0.085, under the general
//            step, and is a red flash at every swing.
//   rung     a change of the pixel-ratio rung is not a flash. The probe today
//            divides a frame's sum, read a frame or two late through the
//            readback ring, by the newest frame's pixel count (src/gpu/
//            probe.ts, `this.pixels`), so the reading after a 1.5x to 1x step
//            is 2.25 times too bright and the guard counts it.
//
// The contract, beside the whole-wall `sample(now, luminance)`, which stays
// as it is (every trace above is fed through it):
//
//   guard.sampleTiles(now, tiles) -> the gain for the next frame, as sample()
//     tiles.cols, tiles.rows   the grid the probe kept, any size; the windows
//                              are ceil(cols / 2) by ceil(rows / 2) tiles,
//                              at every offset
//     tiles.r, .g, .b          per tile (row-major from the top left), the
//                              sum over its pixels of linear-light R, G and B,
//                              0..1 a pixel: the canvas's values decoded with
//                              the sRGB curve, not a 2.2 power
//     tiles.pixels             per tile, how many pixels those sums are over,
//                              counted on the frame that was summed and
//                              carried with it through the readback
//   guard.state.rule           'flash' or 'red' while the guard holds the show
//                              back, the rule holding it (the desk's and the
//                              phone's line name it); null while it does not
//   guard.state.counted        flashes counted, by either rule, since reset()
//
// Luminance is the guard's to take from r, g and b (0.2126, 0.7152, 0.0722:
// linear, so a window's sums are its pixels' sums). The traces scale linear
// light by the gain, as a dimmer does.
//
// Each line is judged on what reaches the wall, counted here by a counter of
// its own over every quarter window (not the guard's, so a mistake in the
// rule cannot pass itself), and each has a control that holds on main: the
// trace is what it says it is, and the whole-wall guard cannot do it.
export function tileTraces(check) {
  const HZ = 60;
  const OWED_IDS = ['quarter', 'red', 'rung'];
  const flag = process.argv.find(a => a.startsWith('--owed='));
  const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
  const unknown = [...owed].filter(id => !OWED_IDS.includes(id));
  if (unknown.length) check('every id in --owed is a line of this file', false, `unknown: ${unknown.join(', ')} (known: ${OWED_IDS.join(', ')})`);
  /** A line written ahead of the build: counted, or under --owed printed and not counted, until it passes. */
  const due = (id, name, ok, detail) => {
    if (!owed.has(id)) return check(name, ok, detail);
    if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
    console.log(` owed  ${name} — ${detail}`);
  };

  const LUMA = [0.2126, 0.7152, 0.0722];
  /**
   * Flashes a second in the worst one-second window of a series, a flash
   * being a completed rise of at least `step` from a trough under `under`
   * (the general rule's pair, counted once at its peak, as the guard's own
   * counter above is written out independently), on the rises `peakOk` lets
   * count.
   */
  const rateOf = (series, step, under = Infinity, peakOk = () => true) => {
    let rising = true, turn = series[0]?.v ?? 0, last = turn, lastS = series[0];
    const at = [];
    for (const s of series) {
      if (rising && s.v < last) {
        if (last - turn > step - 1e-9 && turn < under && peakOk(lastS)) at.push(lastS.t);
        rising = false; turn = last;
      } else if (!rising && s.v > last) { rising = true; turn = last; }
      last = s.v; lastS = s;
    }
    // Half open, and a microsecond short of it: frame times are sums of
    // 16.67 ms, and a peak 1000 ms on read 999.9999999 is the next second's.
    let worst = 0;
    for (const t0 of at) worst = Math.max(worst, at.filter(t => t >= t0 && t < t0 + 1000 - 1e-3).length);
    return worst;
  };
  /** Every quarter window of a grid, as the list of its tiles. */
  const windowsOf = (cols, rows) => {
    const wc = Math.ceil(cols / 2), wr = Math.ceil(rows / 2), out = [];
    for (let y0 = 0; y0 + wr <= rows; y0++) for (let x0 = 0; x0 + wc <= cols; x0++) {
      const tiles = [];
      for (let y = y0; y < y0 + wr; y++) for (let x = x0; x < x0 + wc; x++) tiles.push(y * cols + x);
      out.push(tiles);
    }
    return out;
  };
  /** A window's mean linear R, G, B, from a reading's sums. */
  const meanOf = (tiles, win) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const i of win) { r += tiles.r[i]; g += tiles.g[i]; b += tiles.b[i]; n += tiles.pixels[i]; }
    return n > 0 ? [r / n, g / n, b / n] : [0, 0, 0];
  };
  const lumOf = ([r, g, b]) => LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
  /** The red flash's own measure: (R - G - B), negatives as 0, and whether the state is a saturated red. */
  const redOf = ([r, g, b]) => ({ v: Math.max(0, r - g - b), sat: r + g + b > 0 && r / (r + g + b) >= 0.8 });
  /** The worst general and red flash rates over every quarter window of a run's readings, from `fromMs`. */
  const judge = (readings, fromMs = 0) => {
    const kept = readings.filter(d => d.t >= fromMs);
    if (!kept.length) return { flash: 0, red: 0 };
    const { cols, rows } = kept[0].tiles;
    let flash = 0, red = 0;
    for (const win of windowsOf(cols, rows)) {
      const means = kept.map(d => ({ t: d.t, m: meanOf(d.tiles, win) }));
      flash = Math.max(flash, rateOf(means.map(x => ({ t: x.t, v: lumOf(x.m) })), 0.1, 0.8));
      red = Math.max(red, rateOf(means.map(x => ({ t: x.t, ...redOf(x.m) })), 20 / 320, Infinity, s => s.sat));
    }
    return { flash, red };
  };
  /** A frame of `cols` x `rows` tiles at `width` x `height` pixels, each tile's sums from its mean colour. */
  const reading = (cols, rows, width, height, colourOf, gain = 1) => {
    const n = cols * rows;
    const t = { cols, rows, r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), pixels: new Float32Array(n) };
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      // Tile edges as a compute pass that splits the frame by integer
      // division would put them: unequal tiles when the size does not divide.
      const px = (Math.floor(((x + 1) * width) / cols) - Math.floor((x * width) / cols))
        * (Math.floor(((y + 1) * height) / rows) - Math.floor((y * height) / rows));
      const [r, g, b] = colourOf(x, y);
      t.r[i] = r * gain * px; t.g[i] = g * gain * px; t.b[i] = b * gain * px; t.pixels[i] = px;
    }
    return t;
  };
  const wholeLum = (tiles) => {
    const all = Array.from({ length: tiles.cols * tiles.rows }, (_, i) => i);
    return lumOf(meanOf(tiles, all));
  };
  const hasTiles = typeof FlashGuard.prototype.sampleTiles === 'function';
  const NO_ENTRY = 'FlashGuard has no sampleTiles(now, tiles) entry yet (14r)';

  /**
   * A run through the tile entry, the loop closed as the renderer closes it:
   * each frame's light scaled by the gain the last reading handed back.
   * `frameAt(t)` gives the frame's size and each tile's colour before the gain.
   */
  const runTiles = (seconds, frameAt) => {
    const guard = new FlashGuard();
    const readings = [];
    let gain = 1, touched = 0, minGain = 1;
    const rules = new Set();
    for (let i = 0; i < seconds * HZ; i++) {
      const t = (i * 1000) / HZ;
      const f = frameAt(t);
      const tiles = reading(f.cols, f.rows, f.width, f.height, f.colourOf, gain);
      readings.push({ t, tiles, gain });
      gain = guard.sampleTiles(t, tiles);
      if (Math.abs(gain - 1) > 1e-3) touched++;
      minGain = Math.min(minGain, gain);
      if (guard.state.engaged) rules.add(guard.state.rule);
    }
    return { readings, guard, touched, minGain, rules: [...rules] };
  };
  /** The same frames' whole-wall mean through today's entry, the loop closed. */
  const runWhole = (seconds, frameAt) => {
    const guard = new FlashGuard();
    let gain = 1, touched = 0;
    for (let i = 0; i < seconds * HZ; i++) {
      const t = (i * 1000) / HZ;
      const f = frameAt(t);
      gain = guard.sample(t, wholeLum(reading(f.cols, f.rows, f.width, f.height, f.colourOf, gain)));
      if (Math.abs(gain - 1) > 1e-3) touched++;
    }
    return touched;
  };
  // On for 100 ms, off for 100: six frames each at sixty, exactly, so the
  // counted rate is the strobe's 5 and not a frame's quantisation of it.
  const on5 = (t) => Math.floor(Math.round(t * 0.06) / 6) % 2 === 0;
  const grey = (v) => [v, v, v];

  console.log('\n  The guard by quarters, in light (14i-guard, 14r):');

  // quarter: the centred quarter of the wall, a window that straddles all
  // four quadrants (so a guard that kept only the four fixed quadrants misses
  // it), between 0.04 and 0.4 at 5 Hz on a ground of 0.04. The wall's mean
  // moves 0.09: under the step, as the whole-wall guard sees it.
  {
    const frameAt = (t) => ({
      cols: 8, rows: 8, width: 1920, height: 1080,
      colourOf: (x, y) => grey(x >= 2 && x < 6 && y >= 2 && y < 6 && on5(t) ? 0.4 : 0.04),
    });
    const bare = judge(Array.from({ length: 3 * HZ }, (_, i) => {
      const t = (i * 1000) / HZ, f = frameAt(t);
      return { t, tiles: reading(f.cols, f.rows, f.width, f.height, f.colourOf) };
    }));
    const whole = runWhole(10, frameAt);
    check('control: a quarter of the wall at 5 Hz is a strobe in its window, and the whole-wall guard leaves it alone',
      bare.flash > 3 && whole === 0, `${bare.flash}/s in the worst quarter window; the whole-wall mean moves 0.09, ${whole} frames touched`);
    if (!hasTiles) due('quarter', 'a quarter of the wall flashing 0.4 at 5 Hz is counted, and is not a strobe by the time it reaches the wall', false, NO_ENTRY);
    else {
      const r = runTiles(10, frameAt);
      const after = judge(r.readings, 4000);
      due('quarter', 'a quarter of the wall flashing 0.4 at 5 Hz is counted, and is not a strobe by the time it reaches the wall',
        after.flash <= 3 && r.rules.includes('flash') && r.minGain >= 0.1,
        `${bare.flash}/s -> ${after.flash}/s delivered after 4 s in the worst quarter window, held by ${r.rules.join(', ') || 'nothing'}, gain ${r.guard.state.gain.toFixed(3)} (floor ${r.minGain.toFixed(3)})`);
    }
  }

  // red: the whole wall between black and a linear red of 0.4 at 5 Hz.
  // Luminance moves 0.085, under the general step in every window; (R - G -
  // B) x 320 moves 128. A gain of 0.156 or less brings that under 20, above
  // the guard's floor of 0.1, so a guard that dims for it can make it safe.
  {
    const frameAt = (t) => ({ cols: 8, rows: 8, width: 1920, height: 1080, colourOf: () => (on5(t) ? [0.4, 0, 0] : [0, 0, 0]) });
    const bare = judge(Array.from({ length: 3 * HZ }, (_, i) => {
      const t = (i * 1000) / HZ, f = frameAt(t);
      return { t, tiles: reading(f.cols, f.rows, f.width, f.height, f.colourOf) };
    }));
    const whole = runWhole(10, frameAt);
    check('control: a red flash under the luminance step is a red strobe and no general one, and the whole-wall guard leaves it alone',
      bare.red > 3 && bare.flash === 0 && whole === 0, `${bare.red} red flashes/s, ${bare.flash} general; ${whole} frames touched`);
    if (!hasTiles) due('red', 'a full-wall red flash at 5 Hz is counted by the red rule, and is not a red strobe on the wall', false, NO_ENTRY);
    else {
      const r = runTiles(10, frameAt);
      const after = judge(r.readings, 4000);
      due('red', 'a full-wall red flash at 5 Hz is counted by the red rule, and is not a red strobe on the wall',
        after.red <= 3 && r.rules.includes('red') && r.minGain >= 0.1,
        `${bare.red}/s -> ${after.red}/s red flashes delivered after 4 s, held by ${r.rules.join(', ') || 'nothing'}, gain ${r.guard.state.gain.toFixed(3)} (floor ${r.minGain.toFixed(3)})`);
    }
  }

  // rung: a still picture (a gradient of greys, 0.2 to 0.4, so every window
  // has its own mean) on a 1366 x 768 window, at the 1.5x rung (2049 x 1152,
  // tiles that do not divide evenly) stepping to 1x at 2 s, back up at 4 s,
  // down at 6 s: three changes of a governor's rung in eight seconds.
  {
    const RUNG = (t) => (t < 2000 || (t >= 4000 && t < 6000) ? 1.5 : 1);
    const frameAt = (t) => ({
      cols: 8, rows: 8, width: Math.round(1366 * RUNG(t)), height: Math.round(768 * RUNG(t)),
      colourOf: (x, y) => grey(0.2 + 0.2 * ((x + y) / 14)),
    });
    // As the probe reads it today: each sum two frames late (the ring), over
    // the newest frame's pixel count.
    const frames = Array.from({ length: 8 * HZ }, (_, i) => {
      const t = (i * 1000) / HZ, f = frameAt(t);
      return { t, tiles: reading(f.cols, f.rows, f.width, f.height, f.colourOf) };
    });
    const today = frames.map((d, i) => {
      const old = frames[Math.max(0, i - 2)].tiles;
      const lum = wholeLum({ ...d.tiles, r: old.r, g: old.g, b: old.b });
      return { t: d.t, v: lum };
    });
    let spikes = 0;
    {
      let rising = true, turn = today[0].v, last = turn;
      for (const s of today) {
        if (rising && s.v < last) { if (last - turn >= 0.1 && turn < 0.8) spikes++; rising = false; turn = last; }
        else if (!rising && s.v > last) { rising = true; turn = last; }
        last = s.v;
      }
    }
    const brightest = Math.max(...today.map(s => s.v)), still = today[0].v;
    // The step up is a reading too dark and the step down one 2.25 times too
    // bright; the counter sees the rise out of the first run into the second.
    check('control: read as the probe reads it today, the rung changes are flashes in the same still picture',
      spikes >= 2, `${spikes} flashes at 3 changes; the still picture ${still.toFixed(3)}, its brightest reading ${brightest.toFixed(3)} (${(brightest / still).toFixed(2)}x)`);
    if (!hasTiles) due('rung', 'a pixel-ratio rung change, 1.5x to 1x and back, is not a flash', false, NO_ENTRY);
    else {
      const r = runTiles(8, frameAt);
      const counted = r.guard.state.counted;
      due('rung', 'a pixel-ratio rung change, 1.5x to 1x and back, is not a flash',
        counted === 0 && r.touched === 0,
        `${typeof counted === 'number' ? counted : `state.counted is ${counted}`} counted at 3 changes, ${r.touched} frames touched`);
    }
  }
}

// Alone, for the arithmetic without the browser: `node --experimental-strip-types scripts/wallflash.mjs [--owed=…]`.
if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0, n = 0;
  flashTraces((name, ok, detail = '') => { n++; if (!ok) bad++; console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); });
  console.log(`\n${n - bad}/${n} checks passed`);
  process.exit(bad ? 1 : 0);
}
