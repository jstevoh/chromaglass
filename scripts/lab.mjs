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

/**
 * `entry` swaps the page's script for one that imports lab-entry.ts and adds
 * to it (`npm run render-lab` adds the render's encoders); each entry gets
 * its own bundle, so two checks running at once never load each other's.
 *
 * `plugins` and `tag` build a lab on altered sources, for a check that needs
 * a control drawn by a shader without the thing it asks about (`npm run
 * filmlook` draws the film with the rainbow alone): the plugins are
 * esbuild's, and the tag names the bundle so it is never the plain lab's.
 */
export async function openLab({ entry = 'scripts/lab-entry.ts', plugins = [], tag = '' } = {}) {
  const base = entry === 'scripts/lab-entry.ts' ? 'lab-page'
    : `lab-page-${entry.replace(/^.*\//, '').replace(/\.[^.]+$/, '')}`;
  const out = `node_modules/.cache/${base}${tag ? `-${tag}` : ''}.js`;
  await build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'warning', plugins });
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
