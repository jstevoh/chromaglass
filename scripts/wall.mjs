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

try {
  page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&dpr=${encodeURIComponent(DPR)}${engineQuery()}`, { waitUntil: 'load' });
  // Long enough for the governor to settle and the plate to have something on
  // it: a bare plate is black everywhere and every gate below would pass for
  // the wrong reason.
  await page.waitForTimeout(9000);

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
        && live.maskTop === c.maskTop && live.maskRight === c.maskRight
        && live.maskBottom === c.maskBottom && live.maskLeft === c.maskLeft
        && live.corners.every((v, i) => Math.abs(v - c.corners[i]) < 1e-6)
        && (live.surfaces ?? []).length === (c.surfaces ?? []).length
        && (live.surfaces ?? []).every((s, i) => {
          const w = (c.surfaces ?? [])[i];
          return w && s.shape === w.shape && s.enabled === w.enabled
            && s.corners.every((v, j) => Math.abs(v - w.corners[j]) < 1e-6);
        });
    }, want, { timeout: 20000 });
    await page.evaluate(() => new Promise((done) => {
      let n = 0;
      const tick = () => (++n >= 4 ? done() : requestAnimationFrame(tick));
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
  const gridOf = (cols = 32, rows = 18) => page.evaluate(async ({ cols, rows }) => {
    const src = document.querySelector('#liquid-canvas');
    if (!src || !src.width) return null;
    const c = document.createElement('canvas');
    c.width = cols; c.height = rows;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    // drawImage downsamples with the browser's own box filter: every output
    // cell is the mean of the block under it, which is exactly what is wanted.
    // What it is given depends on the engine: a presented WebGPU canvas is
    // not readable, so the stage photographs it for us (scripts/frame.mjs).
    const shot = await window.__cgShot('wall');
    if (shot) {
      const full = document.createElement('canvas');
      full.width = shot.w; full.height = shot.h;
      full.getContext('2d').putImageData(window.__shots.wall, 0, 0);
      ctx.drawImage(full, 0, 0, cols, rows);
    } else {
      ctx.drawImage(src, 0, 0, cols, rows);
    }
    const d = ctx.getImageData(0, 0, cols, rows).data;
    const out = [];
    for (let i = 0; i < cols * rows; i++) {
      out.push((0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255);
    }
    return { cols, rows, lum: out };
  }, { cols, rows });

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
  const plain = await gridOf();
  const plainMean = plain ? meanOver(plain, () => true) : 0;
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
  await withOutput({ maskBottom: 0.3, maskLeft: 0.2, maskFeather: 0 });
  const masked = await gridOf();
  const maskedBottom = meanOver(masked, (x, y) => y > 0.72);
  const maskedLeft = meanOver(masked, (x, y) => x < 0.18 && y < 0.68);
  const maskedKept = meanOver(masked, (x, y) => x > 0.25 && y < 0.65);
  check('a blanked bottom edge is black', maskedBottom < 0.004, `mean ${maskedBottom.toFixed(4)}`);
  check('a blanked left edge is black', maskedLeft < 0.004, `mean ${maskedLeft.toFixed(4)}`);
  check('the picture survives inside the mask', maskedKept > LIT, `mean ${maskedKept.toFixed(3)}`);

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
  const corr = (a, b) => {
    const n = Math.min(a.length, b.length);
    const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i] - ma, y = b[i] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
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
  const lopsidedness = (g) => {
    const prof = profileOf(g, 0.02, 0.48);
    return 1 - corr(prof, prof.slice().reverse());
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
  for (const axis of ['x', 'y']) {
    const g = await stripe(axis);
    const a = lopsidedness(g);
    if (a > asym) { asym = a; pinnedAgain = g; }
    if (asym >= 0.15) break;
  }
  check('the plate can be made lopsided enough to tell a flip from no flip', asym >= 0.15,
    `asymmetry ${asym.toFixed(3)}`);

  await withOutput({ corners: pinnedLeft, flipX: true });
  const flipped = await gridOf();
  const flippedOutside = meanOver(flipped, x => x > 0.56);
  check('rear projection leaves the pinned quad where it was', flippedOutside < 0.004, `mean ${flippedOutside.toFixed(4)}`);

  const A = profileOf(pinnedAgain, 0.02, 0.48);
  const B = profileOf(flipped, 0.02, 0.48);
  const direct = corr(A, B);
  const reversed = corr(A, B.slice().reverse());
  check('rear projection reverses the picture inside it', reversed > direct,
    `reversed ${reversed.toFixed(3)} vs direct ${direct.toFixed(3)} (asymmetry ${asym.toFixed(3)})`);

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
  const bracket = async (cfg, rounds = 3) => {
    let off = 0;
    let on = 0;
    for (let i = 0; i < rounds; i++) {
      await withOutput({});
      off += meanOver(await gridOf(), () => true);
      await withOutput(cfg);
      on += meanOver(await gridOf(), () => true);
    }
    await withOutput({});
    off += meanOver(await gridOf(), () => true);
    return { it: on / rounds, base: off / (rounds + 1) };
  };
  const gain = await bracket({ gain: 2.2 });
  check('output gain lifts what reaches the wall', gain.it > gain.base * 1.25,
    `${gain.base.toFixed(3)} -> ${gain.it.toFixed(3)}`);
  const gamma = await bracket({ gamma: 2.2 });
  check('output gamma darkens the mid-tones', gamma.it < gamma.base * 0.95,
    `${gamma.base.toFixed(3)} -> ${gamma.it.toFixed(3)}`);

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
  check('the guard is on without anyone asking for it', guardOn === true, `flashGuard ${guardOn}`);
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
