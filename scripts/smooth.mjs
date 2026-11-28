/**
 * One smoothness table, every look, on the owner's Mac (PLAN.md 50b).
 *
 * Not a check and never a gate: it never fails CI or holds a deploy. It
 * reuses `stutter.mjs`'s Mac GPU app runner (extended to capture passive
 * `requestAnimationFrame` timestamps) and `rungs-120.mjs`'s `replayAt`
 * frame-stamp replay so neither is copied here.
 *
 *   npm run smooth                      every look, 30 s each, with the band
 *   npm run smooth -- --looks a,b       just those looks
 *   npm run smooth -- --seconds 10      shorter window per look
 *
 * How 60 Hz and 120 Hz are measured on a 60 Hz MacBook Air vs a 120 Hz
 * ProMotion Mac:
 *   - The live run plays the look for `SECONDS` with the simulated band
 *     (`chromaglass-audio-source = 'simulated'`) and records real rAF frame
 *     stamps plus Chromium main-thread tasks (`ThreadControllerImpl::RunTask`)
 *     over 8 ms (one 120 Hz refresh). That measures the display's native rate
 *     directly (60 Hz on this Air, 120 Hz on ProMotion).
 *   - The other refresh rate is replayed through `rungs-120.mjs`'s `replayAt`
 *     using this look's real GPU `drawMs` and `stepMs` measured by the
 *     governor during the live run (scaled by `(dpr/measuredDpr)^2` and
 *     `(grid/measuredGrid)^2`).
 *
 * Writes one worst-first Markdown table to
 * `~/chromaglass-films/smooth/<date>-<sha>.md` and prints it to stdout.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchChromium, port } from './chromium.mjs';
import { resolveChromium, startPreviewServer, measureLookFrames } from './stutter.mjs';
import { replayAt } from './rungs-120.mjs';
import { PRESETS } from '../src/presets.ts';
import { QualityGovernor } from '../src/lib/governor.ts';
import { DrawGate } from '../src/lib/drawGate.ts';
import { qualityLadder } from '../src/lib/platform.ts';

const PORT = port(4365, 'SMOOTH_PORT');
const OVER_REFRESH_SLACK = 0.06; // StepClock's BEAT_SLACK: Chrome 0.1 ms stamp rounding + vsync jitter
const LONG_TASK_US = 8000;       // 8 ms (one 120 Hz refresh is 8.33 ms)

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
};

const SECONDS = Number(arg('seconds', 30));
if (!(Number.isFinite(SECONDS) && SECONDS > 0)) {
  console.error(`smooth: invalid --seconds "${SECONDS}"`);
  process.exit(2);
}

const LOOKS_ARG = arg('looks', null);
const allIds = new Set(PRESETS.map((p) => p.id));
let looks = PRESETS;
if (LOOKS_ARG) {
  const wanted = LOOKS_ARG.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = wanted.filter((id) => !allIds.has(id));
  if (unknown.length) {
    console.error(`smooth: unknown look(s): ${unknown.join(', ')}`);
    process.exit(2);
  }
  looks = wanted.map((id) => PRESETS.find((p) => p.id === id));
}

function localDateStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function gitSha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

function ladderAt(tier, gpu, devicePx) {
  const prevWindow = globalThis.window;
  globalThis.window = {
    devicePixelRatio: devicePx,
    location: { search: '', hostname: 'localhost' },
    innerWidth: 1280,
    innerHeight: 800,
  };
  try {
    return qualityLadder(tier, gpu, null, Number.POSITIVE_INFINITY);
  } finally {
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
  }
}

function summarizeFrameMs(dts, hz) {
  if (!dts.length) return { p99: 0, over1: 0, count: 0, max: 0 };
  const sorted = [...dts].sort((a, b) => a - b);
  const p99 = sorted[Math.floor((sorted.length - 1) * 0.99)];
  const limit = (1000 / hz) * (1 + OVER_REFRESH_SLACK);
  const over1 = dts.filter((ms) => ms > limit).length;
  return { p99, over1, count: dts.length, max: sorted[sorted.length - 1] };
}

function longTasksOver8Ms(traceBuf) {
  const trace = JSON.parse(traceBuf.toString());
  const events = trace.traceEvents ?? [];
  const tids = new Set(
    events
      .filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
      .map((e) => e.tid),
  );
  let count = 0;
  let maxMs = 0;
  for (const e of events) {
    if (e.ph !== 'X') continue;
    if (tids.size && !tids.has(e.tid)) continue;
    if (e.name !== 'ThreadControllerImpl::RunTask' && e.name !== 'RunTask') continue;
    if (e.dur > LONG_TASK_US) {
      count++;
      if (e.dur / 1000 > maxMs) maxMs = e.dur / 1000;
    }
  }
  return { count, maxMs };
}

function worstFirst(a, b, nativeHz) {
  const aLive = nativeHz === 120 ? a.hz120 : a.hz60;
  const bLive = nativeHz === 120 ? b.hz120 : b.hz60;
  const liveLimit = (1000 / nativeHz) * (1 + OVER_REFRESH_SLACK);
  // Any look whose p99 misses a refresh ranks ahead of looks whose p99 is on time,
  // ignoring sub-millisecond Chrome stamp rounding among on-time looks.
  const aMissedP99 = aLive.p99 > liveLimit ? Math.round(aLive.p99) : 0;
  const bMissedP99 = bLive.p99 > liveLimit ? Math.round(bLive.p99) : 0;
  return (
    bMissedP99 - aMissedP99
    || bLive.over1 - aLive.over1
    || b.longTasks8 - a.longTasks8
    || b.hz120.p99 - a.hz120.p99
    || b.hz120.over1 - a.hz120.over1
    || b.hz60.p99 - a.hz60.p99
    || bLive.p99 - aLive.p99
  );
}

const chromium = await resolveChromium();
if (!chromium) { console.error('playwright is not installed.'); process.exit(2); }

const { stop } = await startPreviewServer(PORT);
const browser = await launchChromium(chromium);

const rows = [];
let gpuLabel = 'unknown';
let detectedNativeHz = 60;

try {
  const { rungs: ladder, start } = ladderAt('local', 'strong', 2);

  for (const [idx, preset] of looks.entries()) {
    const look = preset.id;
    let tracing = false;
    let traceResult = { count: 0, maxMs: 0 };
    let bandStats = null;

    let measured;
    try {
      measured = await measureLookFrames(browser, PORT, look, {
        seconds: SECONDS,
        captureRaf: true,
        beforeGoto: async (page) => {
          await page.addInitScript(() => {
            try { sessionStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private */ }
          });
        },
        afterGoto: async (page) => {
          // Simulated music needs one user gesture to resume its AudioContext.
          await page.mouse.click(8, 8);
        },
        onOpened: async (page) => {
          await page.evaluate(() => { window.__cgRafStamps.length = 0; });
          await browser.startTracing(page, { categories: ['toplevel'] });
          tracing = true;
        },
        beforeClose: async (page) => {
          if (tracing) {
            tracing = false;
            const buf = await browser.stopTracing();
            traceResult = longTasksOver8Ms(buf);
          }
          bandStats = await page.evaluate(() => window.__band?.() ?? null);
          return { traceResult, bandStats };
        },
      });
    } finally {
      if (tracing) {
        tracing = false;
        await browser.stopTracing().catch(() => {});
      }
    }

    if (!measured.first) {
      console.error(`${look}: no frame in a minute — skipping`);
      continue;
    }
    if (measured.noGpu) {
      console.error(`${look}: no hardware WebGPU here (${measured.gpu?.label ?? 'none'}); smooth needs a real GPU.`);
      process.exitCode = 2;
      break;
    }
    gpuLabel = measured.gpu?.label ?? gpuLabel;

    const dts = [];
    for (let i = 1; i < measured.stamps.length; i++) dts.push(measured.stamps[i] - measured.stamps[i - 1]);
    const sortedDts = [...dts].sort((a, b) => a - b);
    const medianDt = sortedDts.length ? sortedDts[Math.floor(sortedDts.length / 2)] : 16.67;
    const nativeHz = medianDt < 10 ? 120 : 60;
    detectedNativeHz = nativeHz;

    const liveStats = summarizeFrameMs(dts, nativeHz);
    const last = measured.ticks[measured.ticks.length - 1];
    const measuredGrid = last.grid ?? 512;
    const measuredDpr = last.dpr ?? 1;
    const drawMs = Number.isFinite(last.drawMs) && last.drawMs > 0 ? last.drawMs : (last.workMs ?? 3) * 0.35;
    const stepMs = Number.isFinite(last.stepMs) && last.stepMs > 0 ? last.stepMs : (last.workMs ?? 6) * 0.65;

    const machine = (rung) => ({
      draw: drawMs * (rung.dpr / measuredDpr) ** 2,
      step: stepMs * (rung.grid / measuredGrid) ** 2,
    });
    const otherHz = nativeHz === 120 ? 60 : 120;
    const replayed = replayAt({
      QualityGovernor,
      DrawGate,
      ladder,
      start,
      machine,
      hz: otherHz,
      seconds: SECONDS,
      seed: 1,
      jitter: 0.05,
    });
    const replayStats = summarizeFrameMs(replayed.frameS.map((s) => s * 1000), otherHz);

    const hz60 = nativeHz === 60 ? liveStats : replayStats;
    const hz120 = nativeHz === 120 ? liveStats : replayStats;

    const row = {
      look,
      hz60,
      hz120,
      longTasks8: traceResult.count,
      maxTaskMs: traceResult.maxMs,
      rung: last.rung,
      stepRate: last.stepRate,
      drawMs,
      stepMs,
      kicks: bandStats?.kicks ?? 0,
    };
    rows.push(row);
    console.log(
      `[${idx + 1}/${looks.length}] ${look.padEnd(20)} `
      + `60Hz p99 ${hz60.p99.toFixed(1)}ms (${hz60.over1}/${hz60.count} >1)  `
      + `120Hz p99 ${hz120.p99.toFixed(1)}ms (${hz120.over1}/${hz120.count} >1)  `
      + `tasks>8ms ${row.longTasks8}${row.maxTaskMs > 8 ? ` (max ${row.maxTaskMs.toFixed(1)}ms)` : ''}  `
      + `${row.rung} ${row.stepRate}/s  kicks=${row.kicks}`,
    );
  }
} finally {
  await browser.close();
  stop();
}

if (!rows.length) {
  console.error('smooth: no looks measured.');
  process.exit(process.exitCode || 2);
}

rows.sort((a, b) => worstFirst(a, b, detectedNativeHz));

const date = localDateStamp();
const sha = gitSha();
const otherHz = detectedNativeHz === 120 ? 60 : 120;
const header = [
  `# Smoothness table · ${date} · ${sha}`,
  '',
  `- GPU: \`${gpuLabel}\`, native display: ${detectedNativeHz} Hz (live), ${otherHz} Hz replayed via \`rungs-120\` \`replayAt\` from measured GPU \`drawMs\`/\`stepMs\``,
  `- Window: ${SECONDS} s per look with simulated band, worst look first (${rows.length} looks)`,
  `- Over 1 refresh threshold: \`> 1000/Hz * ${(1 + OVER_REFRESH_SLACK).toFixed(2)}\` ms (${(1000 / 60 * (1 + OVER_REFRESH_SLACK)).toFixed(1)} ms at 60 Hz, ${(1000 / 120 * (1 + OVER_REFRESH_SLACK)).toFixed(1)} ms at 120 Hz); long tasks: main-thread \`RunTask > 8 ms\``,
  '',
  '| # | look | 60 Hz p99 | 60 Hz >1 | 120 Hz p99 | 120 Hz >1 | tasks >8 ms | rung | step/s | draw ms | step ms |',
  '|---:|---|---:|---:|---:|---:|---:|---|---:|---:|---:|',
];
const tableLines = rows.map((r, i) => (
  `| ${i + 1} | ${r.look} | ${r.hz60.p99.toFixed(1)} ms | ${r.hz60.over1}/${r.hz60.count} | ${r.hz120.p99.toFixed(1)} ms | ${r.hz120.over1}/${r.hz120.count} | ${r.longTasks8}${r.maxTaskMs > 8 ? ` (${r.maxTaskMs.toFixed(0)} ms)` : ''} | ${r.rung} | ${r.stepRate} | ${r.drawMs.toFixed(1)} | ${r.stepMs.toFixed(1)} |`
));
const doc = [...header, ...tableLines, ''].join('\n');

const outDir = path.join(os.homedir(), 'chromaglass-films', 'smooth');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${date}-${sha}.md`);
writeFileSync(outPath, doc);

console.log('\n' + doc);
console.log(`written to ${outPath}`);
