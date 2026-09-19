#!/usr/bin/env node
/**
 * P0 of docs/webgpu-plan.md: can a headless browser on this machine run
 * WebGPU, how fast is a solver-shaped workload, and can a WebGPU canvas be
 * read back the ways the app reads its canvas?
 *
 *   node scripts/webgpu-spike.mjs [--grids 128,256] [--quick]
 *
 * It tries each way of launching Chromium that might give it a WebGPU
 * adapter on this platform (software ones on a GPU-less Linux runner), and
 * prints one JSON line per attempt, then a summary. Never fails the run:
 * the point is the table.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'spike', 'webgpu');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const GRIDS = opt('grids', '128,256').split(',').map(Number);
const QUICK = argv.includes('--quick');

const server = createServer(async (req, res) => {
  const path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
  try {
    const body = await readFile(path.endsWith('/') ? join(path, 'index.html') : path);
    res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript' }[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;

/** Ways to launch, per platform. Channel 'chromium' is the full browser in new headless mode (the headless shell has no WebGPU). */
const LAUNCHES = process.platform === 'linux'
  ? [
      { name: 'unsafe-webgpu', args: ['--enable-unsafe-webgpu'] },
      { name: 'vulkan + swiftshader adapter', args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-webgpu-adapter=swiftshader'] },
      { name: 'swiftshader vulkan, no surface', args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'] },
      { name: 'angle vulkan + swiftshader', args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--use-angle=vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'] },
    ]
  : [
      { name: 'default', args: [] },
      { name: 'unsafe-webgpu', args: ['--enable-unsafe-webgpu'] },
    ];

const results = [];
for (const launch of LAUNCHES) {
  for (const channel of ['chromium', undefined]) {
    for (const fallback of [false, true]) {
      if (QUICK && fallback) continue;
      let browser;
      const label = `${launch.name} · ${channel ?? 'headless-shell'}${fallback ? ' · forceFallbackAdapter' : ''}`;
      try {
        browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}), args: launch.args });
        for (const grid of GRIDS) {
          const page = await browser.newPage({ viewport: { width: 520, height: 700 } });
          const console = [];
          page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.push(m.text().slice(0, 160)); });
          await page.goto(`${base}?grid=${grid}&steps=${grid >= 512 ? 10 : 30}${fallback ? '&fallback' : ''}`);
          const r = await page.waitForFunction(() => window.__spike?.done && window.__spike, null, { timeout: 180_000 })
            .then((h) => h.jsonValue()).catch((e) => ({ error: `timeout: ${String(e.message).split('\n')[0]}` }));
          const row = { label, grid, platform: process.platform, ...r, console: console.slice(0, 4) };
          results.push(row);
          process.stdout.write(`${JSON.stringify(row)}\n`);
          await page.close();
          if (!r.adapter) break;          // no adapter: the other grids would say the same
        }
      } catch (e) {
        const row = { label, platform: process.platform, error: String(e.message ?? e).split('\n')[0] };
        results.push(row);
        process.stdout.write(`${JSON.stringify(row)}\n`);
      } finally {
        await browser?.close();
      }
    }
  }
}
server.close();

console.log('\n── summary ──');
for (const r of results) {
  const s = r.solver ? `${r.solver.stepsPerSec} steps/s (${r.solver.msPerStep} ms${r.solver.gpuMsPerStep !== undefined ? `, GPU ${r.solver.gpuMsPerStep} ms` : ''})` : '';
  const a = r.adapter ? `${r.adapter.vendor ?? '?'} ${r.adapter.architecture ?? ''}${r.adapter.fallback ? ' [fallback]' : ''}`.trim() : r.error ?? 'no adapter';
  const reads = r.adapter ? `drawImage ${r.drawImageSameTask}/${r.drawImageLater}, captureStream ${r.captureStream?.bytes ?? r.captureStream?.error ?? '?'} B` : '';
  console.log(`${r.label} · ${r.grid ?? ''}²: ${a} ${s} ${reads}${r.errors?.length ? ` errors: ${r.errors.length}` : ''}`);
}
