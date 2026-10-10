#!/usr/bin/env node
/**
 * What the spun dish's swirl costs a frame on the looks it now runs on
 * (PLAN.md 22k), read on a GPU that draws.
 *
 *   npm run swirlcost                       laptop and phone, the nine looks
 *   npm run swirlcost -- --screen phone     one layout
 *   npm run swirlcost -- --looks galaxy,acid-trip
 *
 * Since 22h (#252) a look whose music is routed to rotation sways its dish
 * under its liquid, so Ω − ω_l is over the swirl's floor most of the time
 * and the swirl's dispatches run on every step while the band plays: the
 * nine thin looks with music on rotation. Nobody had measured what that
 * costs. This plays each of them with the built-in band, on the app's own
 * governor (`gpu=mid`, what a visitor's laptop gets), and reads two things.
 *
 * What the swirl stage costs the GPU, timed directly
 * (`chromaglassDebug().webgpu.benchSwirl`): twenty and a thousand and twenty
 * swirl stages back to back on the plate's own textures, submit to done,
 * five times each inside an animation frame, the quickest of each, and the
 * slope between them (which leaves out the submit's fixed cost and whatever
 * of the frame the queue was still doing). Once as a thin plate runs it now
 * (one dispatch, PLAN 22k) and once with the thirteen it ran before, which
 * is what the old plate still runs. Times the steps a second the plate took,
 * it is the share of each second the swirl takes from the GPU. Timed this
 * way because CI's Mac grants no timestamp queries: the profiler reads
 * nothing there (#258's first runs).
 *
 * And the frame rate, the same page alternated between the swirl let run
 * and held off (`chromaglassDebug().webgpu.swirl(false)`), on, off, off,
 * on, on, off, four seconds each, with how many steps ran the swirl (its own
 * count, so a window meant to run it that did not says so). On CI's Mac this
 * is the weather: the nine looks' pairs scatter by five frames either way
 * and two runs of the same commit read the swirl at 2 fps of 41 and at
 * nothing of 30. It is printed, not leaned on.
 *
 * It asserts only that the measurement measured something: the layout, the
 * band played, the swirl ran on most steps where it was let and on none
 * where it was held off, and the bench timed both stages. What the numbers
 * are is the finding (PLAN 22k).
 *
 * Mac only: the app's plate does not step on a cloud session's software
 * WebGPU (SWIRLCOST_PLATE=1 to try anyway).
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery } from './frame.mjs';

const PORT = Number(process.env.SWIRLCOST_PORT ?? 4371);
const PLATE = process.platform === 'darwin' || !!process.env.SWIRLCOST_PLATE;
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
// The thin looks with music routed to rotation (src/presets.ts): nine when
// this was written, eight since Boiling Point was retired (PLAN.md 28a).
const THIN = ['galaxy', 'cyberpunk', 'acid-trip', 'timbre-shifter',
  'aurora-borealis', 'solar-flare', 'fractal-dream', 'stardust-collapse'];
const LOOKS = argOf('looks', null)?.split(',') ?? THIN;
/**
 * `--patch '{"acid-trip":{"rotationSpeed":0.421}}'`: settings laid over a look
 * once it is open, to measure a look as another PR will ship it (#261 turns
 * the motors up, PLAN 22j, which keeps the swirl running on a steady turn).
 */
const PATCH = JSON.parse(argOf('patch', '{}'));
const SCREENS = {
  laptop: { viewport: { width: 1418, height: 703 }, touch: false },
  phone: { viewport: { width: 390, height: 844 }, touch: true },
};
const which = argOf('screen', process.env.SWIRLCOST_SCREEN ?? 'both');
const screens = which === 'both' ? ['laptop', 'phone'] : [which];
const WINDOW_MS = Number(argOf('window', 4000));
const ORDER = [true, false, false, true, true, false];

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!PLATE) {
  console.log('skip  the swirl\'s cost — no plate draws here; measured on the Mac (SWIRLCOST_PLATE=1 to run anyway)');
  process.exit(0);
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

const snap = (page) => page.evaluate(() => {
  const d = window.chromaglassDebug();
  const counts = d.webgpu?.swirl?.() ?? [];
  return {
    at: performance.now(),
    frames: d.frames ?? 0,
    grid: d.status?.grid ?? 0,
    // The lead plate's: the bench times the lead plate's swirl.
    steps: counts[0]?.steps ?? 0,
    ran: counts[0]?.ran ?? 0,
    dish: d.fluids?.[0]?.lastStep?.spinDish ?? null,
    timestamps: d.webgpu?.timestamps ?? null,
    gpu: d.webgpu?.label ?? null,
    band: typeof window.__band === 'function' ? window.__band() : null,
    phone: !!document.querySelector('[data-testid="phone-stage"]'),
  };
});
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

/** One window: the swirl let run or held off, a second to settle, then read. */
const windowOf = async (page, on) => {
  await page.evaluate((on) => window.chromaglassDebug().webgpu?.swirl?.(on), on);
  await page.waitForTimeout(1000);
  const a = await snap(page);
  await page.waitForTimeout(WINDOW_MS);
  const b = await snap(page);
  const secs = (b.at - a.at) / 1000;
  // A count that went down is a solver the ladder built afresh mid-window:
  // its count started at zero, so what it holds is the window's since then.
  if (b.steps < a.steps) { a.steps = 0; a.ran = 0; }
  return {
    on, grid: b.grid, fps: (b.frames - a.frames) / secs,
    stepsPerSec: (b.steps - a.steps) / secs, ranPerSec: (b.ran - a.ran) / secs, ranShare: (b.ran - a.ran) / Math.max(1, b.steps - a.steps),
    steps: b.steps - a.steps, ran: b.ran - a.ran,
  };
};

/** The swirl stage's GPU time a step, as a thin plate runs it and with all thirteen dispatches. */
const benchOf = async (page) => {
  const out = {};
  for (const thin of [true, false]) {
    const t = [];
    /*
      Twenty and a thousand and twenty, the quickest of five each. The
      queue's "done" comes back on the browser's own tick, not the moment
      the GPU finishes, so each timing carries up to a frame or two of
      lateness: on the laptop's layout, at 20 and 220, three looks in
      twelve read a negative slope (one at minus 223 µs a stage) and the
      rest scattered by two to one (#258). A thousand stages of the swirl is
      tens to hundreds of milliseconds of the GPU's work, which that
      lateness cannot swamp, and the quickest of five drops the tries that
      also caught a hitch.
    */
    for (const n of [20, 1020]) {
      let best = Infinity;
      for (let k = 0; k < 5; k++) {
        const ms = await page.evaluate(({ n, thin }) => new Promise((resolve) => requestAnimationFrame(() => {
          const b = window.chromaglassDebug().webgpu?.benchSwirl;
          if (!b) { resolve(null); return; }
          b(n, thin).then(resolve, () => resolve(null));
        })), { n, thin });
        if (typeof ms === 'number') best = Math.min(best, ms);
      }
      t.push(best);
    }
    out[thin ? 'one' : 'thirteen'] = (t[1] - t[0]) / 1000;
  }
  return out;
};

const results = [];
const browser = await launchChromium(chromium);
try {
  for (const name of screens) {
    const screen = SCREENS[name];
    const ctx = await browser.newContext({
      viewport: screen.viewport, isMobile: screen.touch, hasTouch: screen.touch, deviceScaleFactor: screen.touch ? 2 : 1,
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    for (const look of LOOKS) {
      await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${look}${engineQuery()}`, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.chromaglassDebug === 'function' && !!window.chromaglassDebug().webgpu?.swirl, null, { timeout: 60_000 });
      // A plate that draws, not one still building its shaders (flick.mjs says why).
      const from = Date.now();
      let steady = 0;
      while (steady < 2 && Date.now() - from < 40_000) {
        const f0 = (await snap(page)).frames;
        await page.waitForTimeout(500);
        steady = (await snap(page)).frames - f0 >= 10 ? steady + 1 : 0;
      }
      if (PATCH[look]) await page.evaluate((x) => window.chromaglassSettings(x), PATCH[look]);
      // The first gesture starts the built-in band.
      const box = await page.locator('canvas').first().boundingBox();
      const at = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: screen.viewport.width / 2, y: screen.viewport.height / 3 };
      if (screen.touch) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(3000);
      const windows = [];
      for (const on of ORDER) windows.push(await windowOf(page, on));
      const bench = await benchOf(page);
      const last = await snap(page);
      results.push({ screen: name, look, windows, bench, band: last.band, phone: last.phone });
      if (look === LOOKS[0]) console.log(`  ${name}: ${last.gpu}${Object.keys(PATCH).length ? `, patched ${JSON.stringify(PATCH)}` : ''}`);
      if (process.env.SWIRLCOST_VERBOSE) console.log(JSON.stringify({ windows, bench, last }));
      const ons = windows.filter((w) => w.on), offs = windows.filter((w) => !w.on);
      const row = {
        stepsPerSec: mean(ons.map((w) => w.stepsPerSec)),
        // What the swirl takes is its stage times the steps that ran it.
        ranPerSec: mean(ons.map((w) => w.ranPerSec)),
        fpsOn: mean(ons.map((w) => w.fps)), fpsOff: mean(offs.map((w) => w.fps)),
        ran: mean(ons.map((w) => w.ranShare)), ranOff: Math.max(...offs.map((w) => w.ran)),
        grid: [...new Set(windows.map((w) => w.grid))].join('/'),
      };
      const share = (ms) => ms * row.ranPerSec / 1000;
      row.shareOne = share(bench.one); row.shareThirteen = share(bench.thirteen);
      Object.assign(results.at(-1), row);
      console.log(`  ${name.padEnd(6)} ${look.padEnd(18)} grid ${row.grid.padEnd(8)} ${row.stepsPerSec.toFixed(0)} steps/s; ` +
        `swirl ${(bench.one * 1000).toFixed(1)} µs a step now, ${(bench.thirteen * 1000).toFixed(1)} µs with thirteen ` +
        `(${(row.shareOne * 100).toFixed(2)}% and ${(row.shareThirteen * 100).toFixed(2)}% of the GPU's second); ` +
        `${row.fpsOn.toFixed(1)} fps on, ${row.fpsOff.toFixed(1)} off; ran ${(row.ran * 100).toFixed(0)}% of steps`);
    }
    await ctx.close();
  }
} catch (err) {
  check('the run completed', false, String(err?.message ?? err));
} finally {
  await browser.close();
  stop();
}

for (const name of screens) {
  const rs = results.filter((r) => r.screen === name);
  if (!rs.length) continue;
  const where = name === 'phone' ? 'the phone layout' : "the laptop's layout";
  check(`${name}: every page is ${where}`, rs.every((r) => (name === 'phone') === r.phone));
  check(`${name}: the band played on every look`, rs.every((r) => (r.band?.kicks ?? 0) > 0),
    rs.filter((r) => !r.band).map((r) => r.look).join(', ') || `${rs.length} looks`);
  /*
    Thirteen dispatches against one, at least half as much again: on
    SwiftShader in the lab the one alone was 9.3 ms against 20.4 (the
    centrifuge's dye and mix reads make spinSwirl the heaviest of them), and
    on a GPU where a dispatch is mostly launch the gap is wider. A bench that
    read noise, or timed a queue that never ran the stage, would not hold it
    on every look.
  */
  check(`${name}: the bench timed the swirl stage both ways on every look, thirteen dispatches over one by half as much again`,
    rs.every((r) => r.bench.one > 0 && r.bench.thirteen > 1.5 * r.bench.one && Number.isFinite(r.bench.one + r.bench.thirteen)),
    rs.map((r) => `${r.look} ${(r.bench.thirteen / r.bench.one).toFixed(1)}×`).join(', '));
  const ranLow = rs.filter((r) => !(r.ran >= 0.5));
  check(`${name}: the swirl ran on most steps where it was let run`, ranLow.length === 0,
    rs.map((r) => `${r.look} ${(r.ran * 100).toFixed(0)}%`).join(', '));
  check(`${name}: and on none where it was held off`, rs.every((r) => r.ranOff === 0));
  const median = (xs) => { const v = [...xs].sort((a, b) => a - b); return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; };
  const one = median(rs.map((r) => r.bench.one)), thirteen = median(rs.map((r) => r.bench.thirteen));
  const sps = mean(rs.map((r) => r.stepsPerSec));
  const s1 = median(rs.map((r) => r.shareOne)), s13 = median(rs.map((r) => r.shareThirteen));
  console.log(`\n  ${name}: over ${rs.length} looks at ${sps.toFixed(0)} steps/s, the swirl stage is ${(one * 1000).toFixed(1)} µs a step now (the looks' median) ` +
    `and was ${(thirteen * 1000).toFixed(1)} µs (${(s1 * 100).toFixed(2)}% and ${(s13 * 100).toFixed(2)}% of the GPU's second, on the steps that ran it); ` +
    `${mean(rs.map((r) => r.fpsOn)).toFixed(1)} fps with it, ${mean(rs.map((r) => r.fpsOff)).toFixed(1)} without\n`);
}

const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
