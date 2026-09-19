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
import net from 'node:net';

const PORT = 4329;

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
  await page.goto(`http://localhost:${PORT}/?debug&tier=local`, { waitUntil: 'load' });
  await page.mouse.click(8, 8);
  await page.waitForTimeout(4000);

  // Shortened waits: this run is about the path working, not about the
  // numbers, which mean nothing on a software rasteriser anyway.
  await page.evaluate(() => window.chromaglassBench({ settleMs: 600, sampleMs: 600, everyMs: 150, rebuildMs: 2500 }));

  await page.waitForSelector('[data-bench-text]', { timeout: 120000 });
  const text = await page.textContent('[data-bench-text]');
  console.log(text);

  // The sweep must put the grid back where it found it.
  await page.waitForTimeout(500);
  const restored = await page.evaluate(() => window.chromaglassDebug?.().status?.governed ?? null);
  if (restored !== true) {
    console.error(`\n  ✗ the sweep did not hand the grid back to the governor (governed=${restored})`);
    failed = true;
  } else {
    console.log('  ok  the grid went back to Auto afterwards');
  }
  if (!/grid\s+fps\s+frame/.test(text ?? '')) {
    console.error('  ✗ the report has no table in it');
    failed = true;
  } else {
    console.log('  ok  the report has a table in it');
  }
} finally {
  await browser.close();
  stop();
}
process.exit(failed ? 1 : 0);
