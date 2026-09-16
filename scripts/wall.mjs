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
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = 4324;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  const line = `${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (!process.stdout.isTTY) process.stderr.write(line + '\n');
};

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

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

const IDENTITY = [0, 0, 1, 0, 1, 1, 0, 1];
const BASE = {
  flipX: false, flipY: false, corners: IDENTITY,
  maskTop: 0, maskRight: 0, maskBottom: 0, maskLeft: 0, maskFeather: 0,
  gain: 1, gamma: 1,
};

let page;
let failed = 0;

try {
  page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local`, { waitUntil: 'load' });
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
        && live.corners.every((v, i) => Math.abs(v - c.corners[i]) < 1e-6);
    }, want, { timeout: 20000 });
    await page.evaluate(() => new Promise((done) => {
      let n = 0;
      const tick = () => (++n >= 4 ? done() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }));
  };

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
  const gridOf = (cols = 32, rows = 18) => page.evaluate(({ cols, rows }) => {
    const src = document.querySelector('#liquid-canvas');
    if (!src || !src.width) return null;
    const c = document.createElement('canvas');
    c.width = cols; c.height = rows;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    // drawImage downsamples with the browser's own box filter: every output
    // cell is the mean of the block under it, which is exactly what is wanted.
    ctx.drawImage(src, 0, 0, cols, rows);
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

  await withOutput({ corners: pinnedLeft, flipX: true });
  const flipped = await gridOf();
  const flippedOutside = meanOver(flipped, x => x > 0.56);
  check('rear projection leaves the pinned quad where it was', flippedOutside < 0.004, `mean ${flippedOutside.toFixed(4)}`);

  const A = profileOf(pinned, 0.02, 0.48);
  const B = profileOf(flipped, 0.02, 0.48);
  const asym = 1 - corr(A, A.slice().reverse());
  const direct = corr(A, B);
  const reversed = corr(A, B.slice().reverse());
  if (asym < 0.15) {
    check('the plate is asymmetric enough to tell a flip from no flip', false,
      `asymmetry ${asym.toFixed(3)} — the profiles are near-symmetric, so the flip gate would mean nothing`);
  } else {
    check('rear projection reverses the picture inside it', reversed > direct,
      `reversed ${reversed.toFixed(3)} vs direct ${direct.toFixed(3)} (asymmetry ${asym.toFixed(3)})`);
  }

  // A keystone: the top edge pulled in on both sides. The corners themselves
  // must go dark while the middle of the frame does not.
  await withOutput({ corners: [0.3, 0, 0.7, 0, 1, 1, 0, 1] });
  const keyed = await gridOf();
  const topCorners = (at(keyed, 0.03, 0.03) + at(keyed, 0.97, 0.03)) / 2;
  const middle = meanOver(keyed, (x, y) => x > 0.35 && x < 0.65 && y > 0.4 && y < 0.9);
  check('a keystone empties the corners it pulled in from', topCorners < 0.004, `mean ${topCorners.toFixed(4)}`);
  check('a keystone keeps the middle of the frame', middle > LIT, `mean ${middle.toFixed(3)}`);

  // ── 5. Grade ───────────────────────────────────────────────────────
  // The plate drifts while this runs, so each graded reading is bracketed by
  // an ungraded one and compared against their mean: drift then cancels to
  // first order instead of being mistaken for the effect.
  const bracket = async (cfg) => {
    await withOutput({});
    const before = meanOver(await gridOf(), () => true);
    await withOutput(cfg);
    const it = meanOver(await gridOf(), () => true);
    await withOutput({});
    const after = meanOver(await gridOf(), () => true);
    return { it, base: (before + after) / 2 };
  };
  const gain = await bracket({ gain: 2.2 });
  check('output gain lifts what reaches the wall', gain.it > gain.base * 1.25,
    `${gain.base.toFixed(3)} -> ${gain.it.toFixed(3)}`);
  const gamma = await bracket({ gamma: 2.2 });
  check('output gamma darkens the mid-tones', gamma.it < gamma.base * 0.95,
    `${gamma.base.toFixed(3)} -> ${gamma.it.toFixed(3)}`);

  // ── 6. Back to nothing ─────────────────────────────────────────────
  await withOutput({});
  const goneAgain = await page.evaluate(() => !!window.chromaglassDebug?.().outputPass);
  check('resetting drops the pass again', goneAgain === false, goneAgain ? 'still built' : 'gone');
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
