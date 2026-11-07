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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAB_ENTRY, labParts, labKeysOf, namedPaths, scriptsOf } from './labparts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `entry` swaps the page's script for one that imports lab-entry.ts and adds
 * to it (`npm run render-lab` adds the render's encoders); each entry gets
 * its own bundle, so two checks running at once never load each other's.
 *
 * `plugins` and `tag` build a lab on altered sources, for a check that needs
 * a control drawn by a shader without the thing it asks about (`npm run
 * filmlook` draws the film with the rainbow alone): the plugins are
 * esbuild's, and the tag names the bundle so it is never the plain lab's.
 * `js` is the bundle's text, for a check to see that its control really is
 * another program (`npm run lampzero`: a plugin whose filter matched no file
 * would hand back the plain shader, and two plain labs agree on any GPU).
 */
export async function openLab({ entry = 'scripts/lab-entry.ts', plugins = [], tag = '', software = false } = {}) {
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
  /*
    Off a Mac the lab has always run on SwiftShader's WebGPU, the CPU
    rasteriser. `software` asks for it on a Mac too, for a check that
    compares two compiled programs byte for byte (`npm run lampzero`): a
    GPU's compiler may fuse the same arithmetic differently in two programs
    whose text is the same where it matters, and SwiftShader does not. A
    Chromium built without a software WebGPU adapter answers with none, and
    the lab says so ('no adapter') rather than quietly drawing on the GPU.
  */
  const browser = await launchChromium(chromium, {
    args: process.platform === 'darwin' && !software ? [] : ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (process.env.LAB_ALL || /lost|error/i.test(m.text())) console.log('  [lab]', m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('  [lab error]', e.message.slice(0, 300)));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.labReady === true);
  // Every part the page reads off the lab, for the guard at close(): on any
  // entry that hands out the lab (render-lab-entry.ts adds to it).
  await page.evaluate(() => {
    if (!window.lab) return;
    const used = new Set();
    const api = window.lab;
    window.labUsed = used;
    window.lab = new Proxy(api, { get(o, k, r) { if (typeof k === 'string' && k in o) used.add(k); return Reflect.get(o, k, r); } });
  });
  return {
    page, js, close: async () => {
      // undefined: the page has no lab, or it was loaded again and lost the
      // record; null: the page is gone (it crashed, which fails its check).
      const used = await page.evaluate(() => (window.labUsed ? [...window.labUsed] : window.lab ? 'reloaded' : undefined)).catch(() => null);
      await browser.close(); server.close();
      guard(path.normalize(entry), used);
    },
  };
}

/*
  The guard on what the Mac's selection reads of this check (PLAN.md 19ak-3b).
  A pull request that changes the site's files runs only the lab checks whose
  reads it touches, and a check's reads of the lab's page are the parts its
  scripts name on `lab.` (labparts.mjs). Here, at the end of every run, the
  parts the page really gave out are held to that scan of the running
  script and what it imports: a part whose imports the scan did not reach,
  or a lab page the scripts never name, would let a change to those files
  skip this check, so the check fails, by name, the first time it runs. The
  fix is to name the part as `lab.<part>` in the check's code, not to loosen
  this.
*/
function guard(entry, used) {
  const main = process.argv[1] && path.relative(ROOT, path.resolve(process.argv[1]));
  if (!main || !/^scripts\/.*\.(mjs|js)$/.test(main)) return;
  const files = scriptsOf(main, ROOT);
  const texts = [...files].map((f) => readFileSync(path.join(ROOT, f), 'utf8'));
  const fail = (why) => { console.log(`FAIL lab reach (19ak-3b): ${why}`); process.exit(1); };
  const named = new Set([...files, ...[...files].flatMap((f, i) => [...namedPaths(texts[i], f, ROOT)])]);
  if (entry !== LAB_ENTRY) {
    // A page the check writes itself (`npm run soapgpu` writes one per
    // solver module into node_modules/.cache): what it imports from the
    // repository must be named in the check's code, as a page under scripts/
    // must be.
    const inRepo = /^scripts\//.test(entry);
    const wants = inRepo ? [entry] : [...readFileSync(path.join(ROOT, entry), 'utf8').matchAll(/\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)]
      .map((m) => m[1] ?? m[2]).filter((s) => s.startsWith('.') || path.isAbsolute(s))
      .map((s) => path.relative(ROOT, path.resolve(ROOT, path.dirname(entry), s))).filter((p) => !p.startsWith('..'));
    const unnamed = wants.filter((p) => !named.has(p) && !named.has(p.replace(/\.(ts|tsx|js|mjs)$/, '')));
    if (unnamed.length) fail(`${main} opens a lab page that reads ${unnamed.join(', ')}, which its code never names as a string, so the Mac's selection would not read it`);
    // A page under scripts/ is read whole, its lab with it: no part to miss.
    if (inRepo) return;
  }
  if (used === 'reloaded') fail(`${main}'s lab page was loaded again after openLab, so the record of the parts it used is gone; wrap the lab again after the reload`);
  if (!Array.isArray(used)) return;
  const seen = labKeysOf(texts);
  if (seen == null) return;
  const parts = labParts(readFileSync(path.join(ROOT, LAB_ENTRY), 'utf8'));
  const have = parts.specsOf(seen);
  const missed = used.filter((k) => [...parts.specsOf([k])].some((s) => !have.has(s)));
  if (missed.length) fail(`${main} used ${missed.map((k) => `the part ${k}`).join(', ')}, which the scan of its scripts (${[...files].join(', ')}) did not see; a change to ${[...new Set(missed.flatMap((k) => [...parts.specsOf([k])].filter((s) => !have.has(s))))].join(', ')} would skip this check`);
}
