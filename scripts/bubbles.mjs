#!/usr/bin/env node
/**
 * Do the bubbles belong to the liquid they are in?
 *
 *   npm run bubbles
 *
 * The complaint was that they "stick out and don't blend". That is a claim
 * about pixels, so it is measured as one: for every bubble on the plate,
 * compare the disc it covers against the ring of plate immediately outside
 * it. A bubble that belongs is a lens — it bends and brightens what is behind
 * it, so it keeps the ground's *hue and saturation* and moves its luminance.
 * A bubble that is pasted on washes the colour out, because the light it adds
 * is neutral white that does not care what it lands on.
 *
 * Two numbers, both per-bubble and then averaged:
 *
 *   ΔS  saturation lost inside the bubble, as a fraction of the ring's
 *   Δh  hue shift between disc and ring, in degrees
 *
 * The gate: a bubble may not wash out more than a third of the local
 * saturation, nor shift the hue more than 25°. Luminance is deliberately not
 * gated — a bubble is *supposed* to be brighter.
 *
 * Runs on the GPU path (`?gpu=mid`). Software rasterisation classifies as
 * `software`, which the quality ladder pins to the CPU solver — so the GPU
 * shaders, which is where the bubbles are drawn, would never be exercised at
 * all without the override.
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { engineQuery, installFrameReader, isGpuEngine } from './frame.mjs';

const PORT = 4321;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  const line = `${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  // Mirrored to stderr when stdout is a file: Node block-buffers it there, and
  // a run this slow (software rasterisation, six frames a second) looks hung
  // for minutes if nothing appears. In a terminal both go to the same place,
  // so the mirror would only double every line.
  if (!process.stdout.isTTY) process.stderr.write(line + '\n');
};

/*
  Its own server, and it must be its own.

  A previous run that was killed left a `vite preview` holding this port. The
  new run's server lost the race, `--strictPort` killed it quietly, and the
  browser happily loaded the *old bundle* from the survivor — so the harness
  spent three iterations measuring a build that did not contain the change it
  was checking. The port is now checked before anything is spawned, and an
  occupied one is a hard stop rather than a silent substitution.
*/
{
  const held = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(PORT, '127.0.0.1');
  });
  if (held) {
    console.error(`port ${PORT} is already in use — a previous run's preview server is still up.`);
    console.error(`kill it first, or this run would measure whatever build it is serving.`);
    process.exit(2);
  }
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], {
  detached: true, stdio: ['ignore', 'ignore', 'inherit'],
});
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ } };
// `exit` alone is not enough: `timeout` sends SIGTERM, which ends this process
// without running exit handlers, and the preview server outlives it holding
// the port — which is how three runs ended up measuring a stale bundle.
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });

await new Promise(r => setTimeout(r, 2500));

const browser = await launchChromium(chromium);

try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  // The bundle the page loaded must be the one just built. `bubbleUniforms`
  // was added alongside the change under test, so its absence means the page
  // is serving an older build — the exact failure that wasted three runs.
  const fresh = await page.evaluate(() => typeof window.chromaglassDebug?.().bubbleUniforms === 'function');
  check('the page is running the build that was just made', fresh,
    fresh ? 'bubbleUniforms present' : 'stale bundle — rebuild, or a stray preview server is answering');

  /*
    `gpu=mid`, not `gpu=weak`. Both name the GPU solver, but weak starts the
    quality ladder at 256², whose only lower rung is the CPU one — so the
    governor, measuring software-rasterised frame times, immediately steps
    down to it and the run ends up measuring the CPU solver again. 384² has
    somewhere to fall to, so it stays on the GPU.
  */
  const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
  check('the GPU solver is the one being measured', isGpuEngine(engine), engine ?? 'no debug hook');
  if (!isGpuEngine(engine)) throw new Error('not on the GPU path — nothing below would mean anything');

  /*
    What does a bubble do to the picture?

    Two earlier versions of this check tried to work out where each bubble
    landed on screen and sample a disc and a ring around it. Both were wrong
    about the mapping — fluid UV reaches the canvas through a rotation and a
    1.5×max(w,h) scale — and both were noisy enough that the same build
    measured 43° one run and 0.1° the next. A check that disagrees with itself
    cannot tell a fix from a coincidence.

    So the plate is frozen and photographed twice: once with bubbles on it and
    once with the same plate bare. Every pixel that changed is, by
    construction, a bubble pixel, and its own "before" is the liquid that was
    underneath it. No geometry, no guessing, and the comparison is exactly the
    one the complaint was about: does what the bubble draws still look like
    the liquid it is in?
  */
  /*
    Photographs come from Playwright, and the arithmetic happens in the page.

    Three earlier versions of this got it wrong in ways worth recording.
    The first read the canvas back with `drawImage`, which a presented canvas
    answers with black, so the gates dutifully reported "100% of the
    saturation lost". The second shipped both images back over CDP as plain
    arrays — 2.2 million JSON numbers, twice — and never finished. The third
    froze the plate with F to hold it still, and froze it so completely that
    the compositor stopped producing frames: all three screenshots came back
    byte-identical, so the bubbles "changed 0 pixels".

    What works: slow the plate down instead of stopping it, photograph it
    bare, put bubbles on it, photograph it again, and check that the first
    two bare shots agree before believing the third. Slowing rather than
    stopping is why the hold-still gate is a tolerance and not a zero.
  */
  const setSlider = (testId, value) => page.evaluate(({ testId, value }) => {
    const input = document.querySelector(`[data-testid="${testId}"] input`);
    if (!input) return false;
    // React listens on 'input' and tracks the value itself, so a bare
    // assignment is swallowed; the native setter is what it notices.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      .set.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, { testId, value });

  // Only the plate, not the desk around it. A full-page shot at 1200x800 is
  // a megapixel of mostly-static UI to encode, decode and walk three times
  // over, which under software rasterisation took longer than the run's own
  // timeout. The preview box is the only part any of this is about.
  /*
    The canvas reads back directly, and the arithmetic happens in the page.

    This took four wrong turns worth writing down. Reading the canvas with
    `drawImage` came back black, so the harness moved to page screenshots;
    those shipped 2.2 million pixel values over CDP twice and never finished;
    computing in-page fixed that but `locator.screenshot()` waits for the
    element to be "stable", which over a canvas repainting six times a second
    never resolves. The whole detour was unnecessary: the context is created
    with `preserveDrawingBuffer: true` (LiquidVisualizer.tsx), so the canvas
    has been readable at any moment all along.

    What crosses the wire now is a handful of numbers.
  */
  // `scripts/frame.mjs` keeps the picture in the page under the same name
  // this harness has always used, and photographs it the way the engine in
  // front of it requires — a presented WebGPU canvas answers `drawImage`
  // with black, which is the fifth way this could have gone wrong.
  const grab = (slot) => page.evaluate((s) => window.__cgShot(s), slot);

  const movedBetween = (a, b) => page.evaluate(({ a, b }) => {
    const A = window.__shots[a].data, B = window.__shots[b].data;
    let n = 0;
    for (let i = 0; i < A.length; i += 4) {
      if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 10) n++;
    }
    return { n, total: A.length / 4 };
  }, { a, b });

  // Let a look develop on the plate first — a bubble over bare glass has
  // nothing to blend into and would flatter any version of this shader.
  await page.waitForTimeout(9000);
  const slowed = await setSlider('recipe-globalSpeed', 0.005) && await setSlider('recipe-automateRate', 0);
  check('the plate can be slowed down to be photographed', slowed, slowed ? 'Speed and Evolve on the bench' : 'no recipe sliders found');
  await page.evaluate(() => window.chromaglassDebug().bubbles.clear());
  await page.waitForTimeout(1500);

  /*
    Three photographs, bracketing the bubbles.

    Two is not enough. The bare shot and the bubbled shot are seconds apart —
    placing twelve bubbles means a `page.evaluate` behind a render loop doing
    six frames a second — and in that gap the plate drifts. The first version
    of this counted 375,000 changed pixels for twelve bubbles covering maybe
    7% of the plate, and reported that a bubble *gains* 10% saturation, which
    is drift talking, not optics.

    So the bubbles are bracketed: bare, bubbled, bare again. A pixel counts as
    a bubble pixel only if the two bare shots agree with each other there (the
    plate did not move) and the bubbled shot differs from both (something was
    drawn on it). Everything the liquid did on its own is excluded by
    construction rather than by tolerance.
  */
  await grab('bareBefore');
  await page.waitForTimeout(1200);
  await grab('bareAgain');
  const still = await movedBetween('bareBefore', 'bareAgain');
  // A slowed plate is not a stopped one: the lamp wanders, the gel wheel
  // turns and the second layer drifts on wall-clock time, none of which the
  // speed slider governs, and in 1.2 seconds that moves a few percent of a
  // smooth gradient past this test's threshold. Ten runs on an M4 across two
  // builds measured 29,564 to 59,543 of 742,000 — 4.0% to 8.0% — so a gate at
  // 5% failed about two runs in three while nothing was wrong.
  //
  // What the bracket needs is not a still plate but enough still *pixels*,
  // and it excludes the ones that moved by construction. So the gate is set
  // where it still catches the thing that would ruin the measurement — a
  // plate running at full speed, which moves most of the frame — and not the
  // drift the bracket was built to tolerate.
  check('the plate holds nearly still while it is photographed',
    still.n < still.total * 0.15,
    `${still.n} of ${still.total} pixels moved between two shots of the same plate`);

  const colour = await page.evaluate(() => {
    const A = window.__shots.bareBefore.data;
    let n = 0;
    for (let i = 0; i < A.length; i += 4) {
      const mx = Math.max(A[i], A[i + 1], A[i + 2]), mn = Math.min(A[i], A[i + 1], A[i + 2]);
      if (mx > 40 && (mx - mn) / mx > 0.25) n++;
    }
    return n;
  });
  check('there is coloured liquid on it to blend into', colour > 20000, `${colour} saturated pixels`);

  // Bubbles on the thickest dye, which is where they are supposed to gather.
  const placed = await page.evaluate(() => {
    const d = window.chromaglassDebug();
    d.bubbles.clear();
    const N = d.gridSize;
    const dens = d.fluids?.[0]?.readDensity;
    if (!dens) return 0;
    const cells = [];
    for (let y = 8; y < N - 8; y += 3) for (let x = 8; x < N - 8; x += 3) cells.push([x, y, dens[x + y * N]]);
    cells.sort((a, b) => b[2] - a[2]);
    const put = [];
    for (const [x, y] of cells) {
      if (put.length >= 12) break;
      if (put.some(([px, py]) => Math.hypot(px - x, py - y) < N * 0.09)) continue;
      put.push([x, y]);
      d.bubbles.spawn(x, y, N * 0.045, 1, 0);
      // Born already grown: pack() ramps opacity over the first 0.35s of life.
      d.bubbles.bubbles[d.bubbles.bubbles.length - 1].age = 1.0;
    }
    return put.length;
  });
  check('the bubbles are on dye, not on bare glass', placed >= 8, `${placed} placed on the thickest cells`);
  await page.waitForTimeout(900);
  const told = await page.evaluate(() => window.chromaglassDebug().bubbleUniforms());
  check('and the shader is told about them',
    told.count >= 8 && told.strength > 0.05,
    `count ${told.count}, strength ${told.strength.toFixed(2)}, setting ${told.amount}`);
  await grab('withBubbles');

  // …and straight back off again, so the "after" is as close in time as the
  // machine allows.
  await page.evaluate(() => window.chromaglassDebug().bubbles.clear());
  await page.waitForTimeout(400);
  await grab('bareAfter');

  const report = await page.evaluate(() => {
    const P = window.__shots.bareBefore.data;   // before
    const Q = window.__shots.bareAfter.data;    // after
    const B = window.__shots.withBubbles.data;  // with
    const hsv = (r, g, b) => {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
      let h = 0;
      if (c > 1e-6) {
        if (mx === r) h = ((g - b) / c) % 6;
        else if (mx === g) h = (b - r) / c + 2;
        else h = (r - g) / c + 4;
        h *= 60; if (h < 0) h += 360;
      }
      return { h, s: mx < 1e-6 ? 0 : c / mx, v: mx };
    };
    const d3 = (X, Y, i) =>
      (Math.abs(X[i] - Y[i]) + Math.abs(X[i + 1] - Y[i + 1]) + Math.abs(X[i + 2] - Y[i + 2])) / 255;

    let n = 0, satLost = 0, hueShift = 0, lumGain = 0, worstSat = -1, worstHue = -1;
    let changed = 0, drifted = 0, biggest = 0;
    let addAngle = 0, addWeight = 0, worstAngle = -1, lit = 0;
    for (let i = 0; i < B.length; i += 4) {
      if (d3(P, Q, i) > 0.03) { drifted++; continue; }        // the plate moved here: not evidence
      const dp = d3(B, P, i), dq = d3(B, Q, i);
      const delta = Math.min(dp, dq);
      if (delta > biggest) biggest = delta;
      if (delta < 0.02) continue;                             // nothing drawn here
      changed++;
      const ar = Q[i] / 255, ag = Q[i + 1] / 255, ab = Q[i + 2] / 255;
      const br = B[i] / 255, bg = B[i + 1] / 255, bb = B[i + 2] / 255;
      const a = hsv(ar, ag, ab), b = hsv(br, bg, bb);
      if (a.s < 0.25 || a.v < 0.1) continue;   // near-grey or near-black under it: nothing to wash out

      /*
        The measure that matters is the colour of the light the bubble *adds*,
        not the colour of the result.

        Comparing the finished pixel to the one underneath dilutes the answer
        with thousands of rim pixels the bubble barely touched — which is how
        an earlier version of this gate passed a control built with the old
        neutral-white highlight. `add` is B minus the ground; the angle between
        it and the ground's own colour says directly whether the bubble is
        lighting the liquid or painting over it. Neutral white on a red plate
        is a wide angle; light that carries the dye's colour is a narrow one.
      */
      const add = [Math.max(0, br - ar), Math.max(0, bg - ag), Math.max(0, bb - ab)];
      const addMag = Math.hypot(add[0], add[1], add[2]);
      const gndMag = Math.hypot(ar, ag, ab);
      if (addMag > 0.02 && gndMag > 1e-3) {
        const cos = (add[0] * ar + add[1] * ag + add[2] * ab) / (addMag * gndMag);
        const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
        addAngle += ang * addMag;      // weighted by how much light it added
        addWeight += addMag;
        worstAngle = Math.max(worstAngle, ang);
        lit++;
      }

      let dh = Math.abs(b.h - a.h); if (dh > 180) dh = 360 - dh;
      const sl = (a.s - b.s) / a.s;
      satLost += sl; hueShift += dh; lumGain += (b.v - a.v) / Math.max(a.v, 1e-3);
      worstSat = Math.max(worstSat, sl); worstHue = Math.max(worstHue, dh);
      n++;
    }
    return { n, changed, drifted, biggest, total: B.length / 4,
      lit, addAngle: addWeight ? addAngle / addWeight : 0, worstAngle,
      satLost: n ? satLost / n : 0, hueShift: n ? hueShift / n : 0, lumGain: n ? lumGain / n : 0,
      worstSat, worstHue };
  });

  // Without this, a shader that drew nothing at all would pass every gate below.
  check('the bubbles are actually drawn', report.changed > 3000 && report.n > 800,
    `${report.changed} pixels drawn on, ${report.n} of them over coloured liquid ` +
    `(${report.drifted} excluded as drift; biggest change ${report.biggest.toFixed(3)})`);

  if (report.n > 800) {
    check('a bubble keeps the colour of the liquid it is in',
      report.satLost <= 0.34,
      `${Math.round(report.satLost * 100)}% of the local saturation lost (worst ${Math.round(report.worstSat * 100)}%)`);
    check('and does not shift its hue',
      report.hueShift <= 12,
      `${report.hueShift.toFixed(1)}° mean (worst ${report.worstHue.toFixed(1)}°)`);
    check('and the light it adds is the liquid lit, not paint on top of it',
      report.lit > 500 && report.addAngle <= 22,
      `${report.addAngle.toFixed(1)}° between added light and ground colour ` +
      `over ${report.lit} lit pixels (worst ${report.worstAngle.toFixed(1)}°)`);
    console.log(`     and it is brighter, as a lens should be: ${Math.round(report.lumGain * 100)}% more light`);
  }
} finally {
  await browser.close();
  stop();
}

const passed = checks.filter(c => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
