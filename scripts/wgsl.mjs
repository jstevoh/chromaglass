#!/usr/bin/env node
/**
 * Every solver kernel and the plate's display shader, compiled.
 *
 *   npm run wgsl
 *
 * A WGSL error is otherwise found by the first harness that builds the
 * pipeline, on a runner with a GPU that presents, ten minutes in. Compiling
 * needs only an adapter, and a Linux box's software one will do, so this is
 * the fast gate for a shader change: a syntax or type error, a missing
 * binding name, a builtin that does not exist.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const out = 'node_modules/.cache/wgsl-page.js';
await build({ entryPoints: ['scripts/wgsl-entry.ts'], bundle: true, format: 'esm', outfile: out, logLevel: 'warning' });
const js = readFileSync(out, 'utf8');
const server = createServer((req, res) => {
  if (req.url === '/page.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><script type="module" src="/page.js"></script>');
}).listen(0);
const port = server.address().port;
// A Mac has Metal; anywhere else, the software adapter compiles the same.
const browser = await launchChromium(chromium, {
  args: process.platform === 'darwin' ? [] : ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'],
});
let failed = true;
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => typeof window.runWgsl === 'function');
  const lines = await page.evaluate(() => window.runWgsl());
  for (const l of lines) console.log(l);
  failed = lines.length !== 1 || !lines[0].startsWith('checked');
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
