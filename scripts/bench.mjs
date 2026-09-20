/**
 * Drive the app's own grid sweep and print what it reports.
 *
 * The sweep lives in the app because the machine that matters is never this
 * one — it is whatever a show is running on. This runs the same code here so
 * the path is exercised before it is handed to somebody: that a rung the GPU
 * cannot do is recorded as a refusal rather than a hang, that the settings are
 * put back afterwards, and that a block of text comes out at the end.
 *
 *   npm run bench
 *
 * On a machine rasterising in software the GPU rungs will all be refused,
 * which is the correct answer and the interesting one to have tested.
 */
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const PORT = 4329;

/*
  Two modes, because this script has two jobs.

  Plain, it checks the path: three rungs and short waits, on whatever GPU the
  machine running CI happens to have, which may be no GPU at all. It is asking
  whether the sweep works, and the numbers it prints are not worth reading.

  `--full` takes the measurement: every rung, the honest waits, and `--out`
  writes it into the repository so a reading from real hardware becomes a file
  somebody can open rather than a screenshot in a conversation. Run it on the
  machine a show runs on.

    npm run bench -- --full --out docs/bench/macbook-m4.txt
*/
const FULL = process.argv.includes('--full');
const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();

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
await new Promise(r => setTimeout(r, 2500));

const browser = await launchChromium(chromium);
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  // `--webgpu` sweeps the WebGPU stage instead of WebGL, which is the only
  // way to find out what the port costs on a machine that has a GPU.
  const ENGINE = process.argv.includes('--webgpu') ? '&renderer=webgpu' : '';
  await page.goto(`http://localhost:${PORT}/?debug&tier=local${ENGINE}`, { waitUntil: 'load' });
  await page.mouse.click(8, 8);
  await page.waitForTimeout(4000);

  // The quick pass walks all three outcomes rather than producing figures:
  // one rung the GPU can do, one it cannot (99999 is clamped to the texture
  // limit, so it never arrives and has to be recorded as a refusal rather
  // than hanging the run), and the CPU fallback. Asking a software rasteriser
  // for 768² costs minutes a frame for a number nobody would quote.
  await page.evaluate((full) => window.chromaglassBench(
    full ? {} : { rungs: [256, 99999], settleMs: 600, sampleMs: 600, everyMs: 150, rebuildMs: 2500 },
  ), FULL);

  await page.waitForSelector('[data-bench-text]', { timeout: FULL ? 600000 : 180000 });
  const text = await page.textContent('[data-bench-text]');
  console.log(text);

  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${text}\n`);
    console.log(`\nwritten to ${OUT}`);
  }

  const check = (ok, yes, no) => {
    if (ok) console.log(`  ok  ${yes}`);
    else { console.error(`  ✗ ${no}`); failed = true; }
  };

  check(/grid\s+fps\s+frame/.test(text ?? ''), 'the report has a table in it', 'the report has no table in it');

  // The CPU solver is the one rung every machine has, so it is the one the
  // numbers are asserted on. Whether a *GPU* rung runs depends on the host —
  // a container rasterising in software may refuse them all, and that is a
  // fact about the container, not a failure of this code.
  check(/256²\s+\d/.test(text ?? ''), 'the smallest rung produced numbers', 'the smallest rung produced no numbers');

  if (!FULL) {
    check(/99999.*—/.test(text ?? ''),
      'an unreachable rung is recorded as a refusal, not a hang',
      'an unreachable rung was not recorded as a refusal');
  }

  // The sweep must hand the grid back. Polled rather than slept on: the engine
  // only republishes its status when the label changes or a second has gone
  // by, so a fixed wait here reads whatever the last frame happened to say —
  // which is the mistake this suite has now made four times.
  let restored = null;
  for (let i = 0; i < 80; i++) {
    restored = await page.evaluate(() => window.chromaglassDebug?.().status?.governed ?? null);
    if (restored === true) break;
    await page.waitForTimeout(250);
  }
  check(restored === true,
    'the grid went back to Auto afterwards',
    `the sweep did not hand the grid back to the governor (governed=${restored})`);
} finally {
  await browser.close();
  stop();
}
process.exit(failed ? 1 : 0);
