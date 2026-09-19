#!/usr/bin/env node
/**
 * P0 of docs/webgpu-plan.md: is the solver at least as fast on WebGPU as on
 * WebGL, on this machine? The same passes (spike/webgpu/solver.js) under both
 * APIs, at each grid, in one browser.
 *
 *   node scripts/webgpu-solver-spike.mjs [--grids 256,384,512,768,1024] [--steps 60]
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'spike', 'webgpu');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const GRIDS = opt('grids', '256,384,512,768,1024').split(',').map(Number);
const STEPS = Number(opt('steps', 60));

const server = createServer(async (req, res) => {
  const path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, ''));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript' }[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/solver.html`;

// The same GPU switches the harnesses use on a Mac (scripts/chromium.mjs), so
// WebGL is on ANGLE's Metal backend, as it is for the app.
const args = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-webgpu'];
const browser = await chromium.launch({ headless: true, channel: 'chromium', args });
const rows = [];
try {
  for (const grid of GRIDS) {
    const row = { grid };
    for (const api of ['webgl', 'webgpu']) {
      const page = await browser.newPage();
      await page.goto(`${base}?api=${api}&grid=${grid}&steps=${grid >= 768 ? Math.max(10, STEPS / 3) : STEPS}`);
      const r = await page.waitForFunction(() => window.__solver?.done && window.__solver, null, { timeout: 300_000 })
        .then((h) => h.jsonValue()).catch((e) => ({ error: String(e.message).split('\n')[0] }));
      row[api] = r;
      await page.close();
    }
    rows.push(row);
    const gl = row.webgl, gp = row.webgpu;
    const ratio = gl.msPerStep && gp.msPerStep ? (gl.msPerStep / gp.msPerStep).toFixed(2) : '?';
    console.log(`${grid}²  WebGL ${gl.msPerStep ?? gl.error} ms/step (${gl.stepsPerSec ?? '-'}/s) · WebGPU ${gp.msPerStep ?? gp.error} ms/step (${gp.stepsPerSec ?? '-'}/s${gp.gpuMsPerStep !== undefined ? `, GPU ${gp.gpuMsPerStep} ms` : ''}) · WebGPU is ${ratio}× the speed${gp.errors ? ` · errors: ${gp.errors.length}` : ''}`);
  }
  console.log(`\nWebGL: ${rows[0]?.webgl?.renderer ?? '?'}\nWebGPU: ${rows[0]?.webgpu?.renderer ?? '?'}`);
  console.log(`checks: ${rows.map((r) => `${r.grid}: gl ${JSON.stringify(r.webgl.check)} gpu ${JSON.stringify(r.webgpu.check)}`).join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
