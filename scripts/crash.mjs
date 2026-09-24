#!/usr/bin/env node
/**
 * The black box records (docs/crash-plan.md).
 *
 *   npm run crash
 *
 * A crash log that has never been seen to record is a box that might be
 * empty. So each way a stop announces itself is made to happen, and the line
 * it should leave is looked for:
 *
 *   1. errors, rejections and console lines land, with a snapshot, and the
 *      ignore patterns keep the noise out;
 *   2. a report from a page whose device is destroyed still returns, with
 *      `screenshot: null` — the report is for exactly the moment things broke;
 *   3. a device loss is logged, and so is the recovery from it;
 *   4. frames that stop in a visible tab are a stall at 6 s and a fatal at 20 s,
 *      and the fatal lights the button;
 *   5. the log survives the reload: `crash.last()` is the line before it, and
 *      the button is still lit for a fatal the previous load ended on.
 *
 * Checks that need a drawing device (3, 4, and the screenshot half of 2) say
 * so and skip on a machine with no WebGPU that can present — a Linux runner's
 * software adapter cannot; macOS runners can.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { launchChromium } from './chromium.mjs';

const PORT = Number(process.env.CRASH_PORT ?? 4331);
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const skip = (name, why) => console.log(`skip  ${name} — ${why}`);

{
  const held = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(PORT, '127.0.0.1');
  });
  if (held) { console.error(`port ${PORT} is already in use.`); process.exit(2); }
}
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));
const URL_BASE = `http://localhost:${PORT}/?debug&look=classic&tier=local`;

const browser = await launchChromium(chromium, { headless: true });
try {
  // One context, so the second page sees the first one's localStorage.
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(URL_BASE, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.removeItem('chromaglass-crash-seen'));
  await page.waitForFunction(() => !!window.chromaglassDebug?.().crash, null, { timeout: 30_000 });
  const drawing = await page.waitForFunction(() => window.chromaglassDebug().webgpu?.frames > 30, null, { timeout: 20_000 }).then(() => true).catch(() => false);
  if (!drawing) console.log('note  no WebGPU that presents here: the device checks skip');

  // ── 1. Lines land ─────────────────────────────────────────────────
  const lines = await page.evaluate(async () => {
    console.error('crash-soak: a console error');
    console.warn('ResizeObserver loop completed with undelivered notifications.');
    void Promise.reject(new Error('crash-soak: a rejection'));
    setTimeout(() => { throw new Error('crash-soak: a throw'); });
    await new Promise((r) => setTimeout(r, 300));
    return window.chromaglassDebug().crash.thisLoad();
  });
  const find = (re) => lines.find((e) => re.test(e.msg));
  check('the boot line is written', lines.some((e) => e.source === 'boot'));
  const consoleLine = find(/crash-soak: a console error/);
  check('console.error lands, with a snapshot', consoleLine?.level === 'error' && consoleLine.snap && 'engine' in consoleLine.snap && 'preset' in consoleLine.snap,
    consoleLine ? JSON.stringify(consoleLine.snap).slice(0, 160) : 'missing');
  check('an unhandled rejection lands', find(/crash-soak: a rejection/)?.source === 'promise');
  check('an uncaught throw lands', find(/crash-soak: a throw/)?.source === 'window');
  check('the ignore patterns keep noise out', !find(/ResizeObserver loop/));
  check('the ring is on disk', await page.evaluate(() => (localStorage.getItem('chromaglass-crashlog') ?? '').includes('crash-soak: a console error')));

  // ── 2. A report always returns ───────────────────────────────────
  const healthy = await page.evaluate(async () => {
    const r = await window.chromaglassDebug().crash.report('soak: healthy');
    return { note: r.note, log: r.log.length, debug: !!r.debug, look: !!r.look, shot: r.screenshot && { w: r.screenshot.width, painted: r.screenshot.painted, bytes: r.screenshot.dataUrl.length }, size: JSON.stringify(r).length };
  });
  check('a report builds', healthy.note === 'soak: healthy' && healthy.log > 0 && healthy.debug && healthy.look, `${(healthy.size / 1024).toFixed(0)} kB`);
  if (drawing) check('its screenshot is a painted frame, no wider than 960', healthy.shot && healthy.shot.w <= 960 && healthy.shot.painted, JSON.stringify(healthy.shot));
  else skip('its screenshot is a painted frame', 'no drawing device');

  if (drawing) {
    const dead = await page.evaluate(async () => {
      const d = window.chromaglassDebug();
      d.loseDevice();
      const t0 = performance.now();
      const r = await Promise.race([d.crash.report('soak: dead device'), new Promise((r) => setTimeout(() => r('timeout'), 8000))]);
      return r === 'timeout' ? { timeout: true } : { screenshot: r.screenshot, ms: Math.round(performance.now() - t0) };
    });
    check('a report from a destroyed device still returns, with screenshot: null', !dead.timeout && dead.screenshot === null, dead.timeout ? 'timed out' : `${dead.ms} ms`);

    // ── 3. The loss and the recovery ─────────────────────────────────
    const recovered = await page.waitForFunction(
      () => window.chromaglassDebug().crash.thisLoad().some((e) => e.source === 'recovery'), null, { timeout: 15_000 },
    ).then(() => true).catch(() => false);
    const after = await page.evaluate(() => window.chromaglassDebug().crash.thisLoad());
    check('the loss is logged', after.some((e) => e.source === 'gpu' && /device lost/.test(e.msg)));
    check('and so is the recovery', recovered, after.find((e) => e.source === 'recovery')?.msg ?? 'none in 15s');
    check('one loss is not a fatal', !after.some((e) => e.level === 'fatal'));
    // S1: the plate came back, not a freshly laid look.
    const recoveryLine = after.find((e) => e.source === 'recovery')?.msg ?? '';
    check('the plate is carried across the loss, not laid again', /carried across/.test(recoveryLine), recoveryLine || 'no recovery line');

    // ── 3b. A frame that throws is not the end of the show ───────────
    // It used to be: the next frame was only asked for on the loop's last
    // line. Ten throws and the frames carry on; past the self-heal limit
    // the stage is rebuilt, and the recovery says so.
    // Counted by the loop's own heartbeat, not the stage's frames: a stage
    // just rebuilt by the recovery above draws nothing until its solver and
    // pipelines are up, and at a headless runner's ten frames a second that
    // read as "0 frames" while the loop was plainly running.
    const carriedOn = await page.evaluate(async () => {
      const c = () => window.chromaglassDebug().crash;
      window.chromaglassDebug().throwFrames(10);
      const start = c().beats();
      const t0 = performance.now();
      // Ten throws, then twenty frames that get through: the loop carried on.
      while (c().beats() - start < 20 && performance.now() - t0 < 15_000) await new Promise((r) => setTimeout(r, 100));
      const tail = c().thisLoad().slice(-6).map((e) => `${e.level} ${e.source}: ${e.msg.split('\n')[0].slice(0, 80)}`);
      return { advanced: c().beats() - start, ms: Math.round(performance.now() - t0), tail };
    });
    check('frames that throw do not stop the loop', carriedOn.advanced >= 20,
      carriedOn.advanced >= 20 ? `${carriedOn.advanced} frames through the loop in ${carriedOn.ms} ms after 10 throws` : `${carriedOn.advanced} frames in ${carriedOn.ms} ms; log: ${carriedOn.tail.join(' | ')}`);
    const recoveriesBefore = await page.evaluate(() => window.chromaglassDebug().crash.thisLoad().filter((e) => e.source === 'recovery').length);
    await page.evaluate(() => window.chromaglassDebug().throwFrames(200));
    const healed = await page.waitForFunction(
      (n) => window.chromaglassDebug().crash.thisLoad().filter((e) => e.source === 'recovery').length > n, recoveriesBefore, { timeout: 20_000 },
    ).then(() => true).catch(() => false);
    check('frames that keep throwing rebuild the stage', healed);
    await page.evaluate(() => window.chromaglassDebug().throwFrames(0));
    await page.waitForFunction(() => window.chromaglassDebug().webgpu?.frames > 10, null, { timeout: 15_000 }).catch(() => {});

    // ── 3c. The doors S0 closed, each walked through (stability S6) ──
    // In an order that keeps the stage's own limit in mind: it rebuilds
    // itself at most three times a minute, and the throws above spent one.
    const litShare = () => page.evaluate(async () => {
      for (let i = 0; i < 20; i++) {
        const g = await window.chromaglassDebug().grabFrame?.();
        if (g?.painted) {
          let lit = 0;
          for (let p = 0; p < g.pixels.length; p += 4) if (g.pixels[p] + g.pixels[p + 1] + g.pixels[p + 2] > 30) lit++;
          return lit / (g.pixels.length / 4);
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      return 0;
    });
    const recoveries = () => page.evaluate(() => window.chromaglassDebug().crash.thisLoad().filter((e) => e.source === 'recovery').length);
    const waitRecovery = (n, ms) => page.waitForFunction((k) => window.chromaglassDebug().crash.thisLoad().filter((e) => e.source === 'recovery').length > k, n, { timeout: ms })
      .then(() => true).catch(() => false);
    const grid = () => page.evaluate(() => window.chromaglassDebug().status?.grid ?? 0);
    // Frames again, and then past the five seconds after which a device
    // counts as healthy: each door here is its own incident, not a device
    // dying at birth, and must not inherit the last one's backoff.
    const settleFrames = async () => {
      await page.waitForFunction(() => window.chromaglassDebug().webgpu?.frames > 20, null, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(6000);
    };

    // S3: two rungs lost on consecutive frames — a solver swapped out before
    // its first readback lands — used to carry a blank plate across.
    await settleFrames();
    const litBefore = await litShare();
    const gridBefore = await grid();
    await page.evaluate(() => window.chromaglassDebug().stepDownFrames(2));
    await page.waitForTimeout(3000);
    const litAfter = await litShare();
    const gridAfter = await grid();
    check('two rung changes a frame apart keep the plate', litAfter > 0.2 && litAfter > litBefore * 0.5,
      `${gridBefore}² → ${gridAfter}²; ${(litBefore * 100).toFixed(0)}% lit before, ${(litAfter * 100).toFixed(0)}% after`);

    // Out of memory at the bottom rung: capped, and rebuilt rather than stopped.
    let before = await recoveries();
    await page.evaluate(() => window.chromaglassDebug().simulateOutOfMemory());
    const oomRebuilt = await waitRecovery(before, 20_000);
    const oom = await page.evaluate(() => ({
      cap: window.chromaglassDebug().gridCap?.(),
      line: window.chromaglassDebug().crash.thisLoad().find((e) => /out of GPU memory/.test(e.msg))?.msg ?? '',
    }));
    check('out of memory caps the grid and the show carries on', Number.isFinite(oom.cap) && oomRebuilt && !!oom.line,
      `cap ${oom.cap}; ${oom.line.slice(0, 120) || 'no line'}${oomRebuilt ? '' : '; no rebuild'}`);
    await settleFrames();

    // A storm of GPU errors: the objects have gone invalid; rebuild.
    before = await recoveries();
    await page.evaluate(() => window.chromaglassDebug().errorStorm(600));
    check('a storm of GPU errors rebuilds the stage', await waitRecovery(before, 30_000));
    await page.evaluate(() => window.chromaglassDebug().errorStorm(0));
    await settleFrames();

    // No adapter on the first asks after a loss: asked again, not given up on.
    before = await recoveries();
    await page.evaluate(() => {
      const gpu = navigator.gpu;
      const real = gpu.requestAdapter.bind(gpu);
      let nulls = 2;
      gpu.requestAdapter = (o) => (nulls-- > 0 ? Promise.resolve(null) : real(o));
      window.chromaglassDebug().loseDevice();
    });
    const adapterBack = await waitRecovery(before, 30_000);
    const retries = await page.evaluate(() => window.chromaglassDebug().crash.thisLoad().filter((e) => /no device yet after a loss/.test(e.msg)).length);
    check('no adapter after a loss is asked for again', adapterBack && retries >= 2, `${retries} retries${adapterBack ? ', then back' : ', never back'}`);
    await settleFrames();

    // A request that never answers: it times out, and the retry brings it back.
    before = await recoveries();
    await page.evaluate(() => {
      const gpu = navigator.gpu;
      const real = gpu.requestAdapter.bind(gpu);
      let hangs = 1;
      gpu.requestAdapter = (o) => (hangs-- > 0 ? new Promise(() => {}) : real(o));
      window.chromaglassDebug().loseDevice();
    });
    const hangBack = await waitRecovery(before, 45_000);
    const timedOut = await page.evaluate(() => window.chromaglassDebug().crash.thisLoad().some((e) => /did not answer/.test(e.msg)));
    check('a GPU request that never answers times out and recovers', hangBack && timedOut, `${timedOut ? 'timed out' : 'no timeout line'}${hangBack ? ', then back' : ', never back'}`);
    await settleFrames();

    // ── 4. Frames that stop ──────────────────────────────────────────
    await page.waitForFunction(() => window.chromaglassDebug().webgpu?.frames > 10, null, { timeout: 15_000 }).catch(() => {});
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    const fatal = await page.waitForFunction(
      () => window.chromaglassDebug().crash.thisLoad().find((e) => e.level === 'fatal' && e.source === 'heartbeat'), null, { timeout: 35_000 },
    ).then((h) => h.jsonValue()).catch(() => null);
    const stallLine = await page.evaluate(() => window.chromaglassDebug().crash.thisLoad().find((e) => e.level === 'error' && e.source === 'heartbeat'));
    check('frames that stop are first a stall', !!stallLine, stallLine?.msg ?? 'no stall line');
    check('and then a fatal', !!fatal, fatal?.msg ?? 'none in 35s');
    check('the fatal carries the state it stopped in', !!fatal?.snap?.rung && !!fatal?.snap?.engine, JSON.stringify(fatal?.snap ?? {}).slice(0, 160));
    // Waited for, not read at once: the log records the fatal synchronously
    // and React draws the chip a moment later.
    const chipUp = await page.locator('[data-testid="crash-chip"]').waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    const lit = await page.locator('[data-testid="crash-report-button"][data-lit="true"]').count();
    check('the button lights, and the chip asks', lit === 1 && chipUp, `lit ${lit}, chip ${chipUp ? 'up' : 'not up'}`);
  } else {
    skip('a destroyed device, the loss, the recovery, the stall', 'no drawing device');
    // Without one, a fatal can still be written by hand to prove the rest.
    await page.evaluate(() => window.chromaglassDebug().crash.record('fatal', 'soak', 'a fatal written by hand'));
    const lit = await page.locator('[data-testid="crash-report-button"][data-lit="true"]').count();
    check('a fatal lights the button', lit === 1);
  }

  // The sheet: nothing is captured until a button is pressed.
  await page.locator('[data-testid="crash-report-button"]').click();
  check('the sheet opens, with the log tail', await page.locator('[data-testid="crash-sheet"]').isVisible()
    && /\S/.test(await page.locator('[data-testid="crash-tail"]').innerText()));
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }).catch(() => null),
    page.locator('[data-testid="crash-save"]').click(),
  ]);
  check('Save file downloads a report', !!download && /chromaglass-report-.*\.json$/.test(download.suggestedFilename()), download?.suggestedFilename() ?? 'no download');
  await page.keyboard.press('Escape');

  // The corner dot: one click, no sheet, a report in Downloads with the whole ring.
  const [dotFile] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }).catch(() => null),
    page.locator('[data-testid="quick-report"]').click(),
  ]);
  let dotHistory = -1;
  if (dotFile) { try { dotHistory = JSON.parse(await (await import('node:fs/promises')).readFile(await dotFile.path(), 'utf8')).history?.length ?? -1; } catch { /* unreadable */ } }
  check('the corner dot saves a report in one click, with the whole ring', !!dotFile && dotHistory > 0,
    dotFile ? `${dotFile.suggestedFilename()}, ${dotHistory} lines of history` : 'no download');

  // ── 5. Across the reload ─────────────────────────────────────────
  const beforeReload = await page.evaluate(() => { window.chromaglassDebug().crash.record('error', 'soak', 'the line before the reload'); return window.chromaglassDebug().crash.load; });
  // No pagehide: a tab that dies does not get one either.
  await page.evaluate(() => localStorage.removeItem('chromaglass-crash-seen'));
  const page2 = await context.newPage();
  await page.close({ runBeforeUnload: false });
  await page2.goto(URL_BASE, { waitUntil: 'load' });
  await page2.waitForFunction(() => !!window.chromaglassDebug?.().crash, null, { timeout: 30_000 });
  const across = await page2.evaluate(() => {
    const c = window.chromaglassDebug().crash;
    return { last: c.last(), previous: c.previous().length, load: c.load, };
  });
  check('crash.last() is the line before the reload', across.last?.load === beforeReload && /the line before the reload/.test(across.last?.msg ?? ''), across.last?.msg ?? 'none');
  check('the previous load\'s tail is kept', across.previous > 0, `${across.previous} lines`);
  check('the button is still lit for the previous load\'s fatal', await page2.locator('[data-testid="crash-report-button"][data-lit="true"]').count() === 1);
} finally {
  await browser.close();
  stop();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
