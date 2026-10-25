/**
 * Whether the governor's moves cost the plate a stutter (PLAN.md 14aa-3).
 * On a Mac (or any machine with a real GPU): the full app, governed, each
 * look for a few minutes, counting the frames that took two solver steps.
 *
 *   npm run stutter                       Poster, 1969, Classic and Neon Coral Reef, 180 s each
 *   npm run stutter -- --seconds 90 --looks poster-1969
 *
 * At sixty steps a second a frame of two steps is the liquid stopping for a
 * refresh and then jumping to catch up. The owner's Mac on main at fd20c71
 * showed where they came from on Poster, 1969: the governor, holding thirty
 * steps at 7.6–8.7 ms of GPU a frame, went back to sixty, where a frame cost
 * 15.6–16 ms and one in five missed a refresh; it held there 8.5 to 16.8 s,
 * 82 to 192 two-step frames a climb. `npm run rungs` replays those costs
 * through the governor in node; this asks the real one on the real GPU.
 *
 * Read from `chromaglassDebug()`: the loop's count of live frames by the steps
 * they took (`solver().stepFrames`), once a second, and the governor's own
 * log of its moves (`governor.moveLog`), which says why each was made and,
 * for a climb, what it predicted the new state would cost.
 *
 * Bars, for every look:
 *   - no frame of two steps after the opening (the first 10 s, where the
 *     governor opens at sixty steps before it has measured anything);
 *   - no climb undone within 10 s: a climb to a state it then leaves is one
 *     whose cost it could have known.
 * The first needs the even step clock of PLAN.md 14aa as well: on a loop that
 * still counts steps from `Date.now()`, Classic and Neon Coral Reef drew one
 * or two such frames in three minutes from the clock alone (14aa-2).
 *
 * Software WebGPU cannot answer this (a step costs it seconds): in a cloud
 * session the run is refused rather than passed.
 */
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = 4361;
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const SECONDS = Number(arg('seconds', 180));
const LOOKS = arg('looks', 'poster-1969,classic,neon-coral-reef').split(',');
const OPENING_S = 10;

let chromium;
for (const resolve of [() => 'playwright', () => 'playwright-core']) {
  try { const m = await import(resolve()); chromium = m.chromium ?? m.default?.chromium; if (chromium) break; } catch { /* try the next */ }
}
if (!chromium) { console.error('playwright is not installed.'); process.exit(2); }

{
  const held = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(PORT, '127.0.0.1');
  });
  if (held) { console.error(`port ${PORT} is already in use.`); process.exit(2); }
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], {
  detached: true, stdio: ['ignore', 'ignore', 'inherit'],
});
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ } };
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

const browser = await launchChromium(chromium);
let failed = false;
const verdict = (ok, what, detail) => {
  console.log(`  ${ok ? ' ok ' : 'FAIL'}  ${what} — ${detail}`);
  if (!ok) failed = true;
};

try {
  for (const look of LOOKS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://localhost:${PORT}/?debug&tier=local&look=${encodeURIComponent(look)}`, { waitUntil: 'load' });
    // The opening is counted from the first frame the loop draws, which is
    // when the governor starts its own clock.
    let first = null;
    for (let i = 0; i < 120 && !first; i++) {
      first = await page.evaluate(() => {
        const d = window.chromaglassDebug?.();
        const s = d?.solver?.();
        return s && s.stepFrames.some((n) => n > 0) ? { at: performance.now() / 1000, frames: s.stepFrames } : null;
      });
      if (!first) await page.waitForTimeout(500);
    }
    if (!first) { verdict(false, `${look}: the plate drew`, 'no frame in a minute'); await page.close(); continue; }

    const gpu = await page.evaluate(() => window.chromaglassDebug?.()?.webgpu ?? null);
    if (!gpu || gpu.fallback || /swiftshader/i.test(gpu.label ?? '')) {
      console.error(`${look}: no hardware WebGPU here (${gpu?.label ?? 'none'}); this check needs a real GPU.`);
      failed = true;
      await page.close();
      break;
    }

    // Once a second: the counts so far, so the two-step frames can be placed in time.
    const ticks = [];
    const until = first.at + SECONDS;
    for (;;) {
      const t = await page.evaluate(() => {
        const d = window.chromaglassDebug();
        const s = d.solver();
        const g = d.governor;
        return {
          at: performance.now() / 1000, frames: s.stepFrames, stepRate: s.stepRate,
          rung: g ? `${g.rung.grid}²@${g.rung.dpr}` : '?', workMs: g?.workMs ?? null, stepMs: g?.stepMs ?? null,
        };
      });
      ticks.push(t);
      if (t.at >= until) break;
      await page.waitForTimeout(1000);
    }
    const moves = await page.evaluate(() => (window.chromaglassDebug().governor?.moveLog ?? []).map((m) => ({ ...m })));
    const ladder = await page.evaluate(() => (window.chromaglassDebug().governor?.rungs ?? []).map((r) => `${r.grid}²@${r.dpr}`));
    await page.close();

    const last = ticks[ticks.length - 1];
    const opening = ticks.find((t) => t.at - first.at >= OPENING_S) ?? last;
    const total = last.frames.reduce((a, b) => a + b, 0) - first.frames.reduce((a, b) => a + b, 0);
    const twoAll = last.frames[2] + last.frames[3] - first.frames[2] - first.frames[3];
    const twoAfter = last.frames[2] + last.frames[3] - opening.frames[2] - opening.frames[3];
    const climbs = moves.filter((m) => m.why === 'fast');
    const undone = climbs.filter((m) => {
      const next = moves.find((n) => n.at > m.at);
      return next !== undefined && next.at - m.at < 10;
    });
    const rel = (s) => (s - first.at).toFixed(1);
    console.log(`\n${look}: ${total} frames in ${(last.at - first.at).toFixed(0)} s, ${twoAll} of two steps or more (${twoAfter} after the opening)`);
    console.log(`  ends on ${last.rung} at ${last.stepRate} steps/s; GPU ${last.workMs?.toFixed(1)} ms a frame, ${last.stepMs?.toFixed(1)} ms a step`);
    for (const m of moves) {
      console.log(`  ${rel(m.at)} s  ${m.why.padEnd(8)} → ${ladder[m.rung] ?? m.rung} at ${m.stepRate}/s  (GPU ${m.workMs.toFixed(1)} ms${m.predictedMs !== null ? `, predicted ${m.predictedMs.toFixed(1)}` : ''})`);
    }
    // Where the two-step frames fell, by ten-second stretch, so a burst can be laid against a move.
    const bursts = [];
    for (let i = 1; i < ticks.length; i++) {
      const n = ticks[i].frames[2] + ticks[i].frames[3] - ticks[i - 1].frames[2] - ticks[i - 1].frames[3];
      if (n > 0) bursts.push(`${rel(ticks[i].at)} s: ${n}`);
    }
    if (bursts.length) console.log(`  two-step frames by second: ${bursts.join(', ')}`);
    verdict(twoAfter === 0, `${look}: no frame of two steps after the opening`, `${twoAfter} in ${(last.at - opening.at).toFixed(0)} s`);
    verdict(undone.length === 0, `${look}: no climb undone within 10 s`,
      undone.length ? undone.map((m) => `${rel(m.at)} s to ${ladder[m.rung]} at ${m.stepRate}/s`).join('; ') : `${climbs.length} climb(s), all kept`);
  }
} finally {
  await browser.close();
  stop();
}
process.exit(failed ? 1 : 0);
