/**
 * The GPU solver on its own, in a page with no canvas, for physics checks.
 *
 *   import { openLab } from './lab.mjs';
 *   const { page, close } = await openLab();
 *   await page.evaluate(() => lab.create(256));
 *
 * A presented canvas needs a GPU that presents; computing does not. So this
 * runs on a Linux box's software WebGPU as well as a Mac's Metal, which makes
 * the physics measurable anywhere, step by step and with a control.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

export async function openLab() {
  const out = 'node_modules/.cache/lab-page.js';
  await build({ entryPoints: ['scripts/lab-entry.ts'], bundle: true, format: 'esm', outfile: out, logLevel: 'warning' });
  const js = readFileSync(out, 'utf8');
  const server = createServer((req, res) => {
    if (req.url === '/page.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><script type="module" src="/page.js"></script>');
  }).listen(0);
  const port = server.address().port;
  const browser = await launchChromium(chromium, {
    args: process.platform === 'darwin' ? [] : ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (process.env.LAB_ALL || /lost|error/i.test(m.text())) console.log('  [lab]', m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('  [lab error]', e.message.slice(0, 300)));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.labReady === true);
  return { page, close: async () => { await browser.close(); server.close(); } };
}
