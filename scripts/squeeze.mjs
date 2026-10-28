#!/usr/bin/env node
/**
 * DIAGNOSTIC, NOT THE CHECK (PLAN 30a-3): an A/B of Beat Squeeze's cost on
 * the Mac runner, three builds on one machine, interleaved. Replaced by the
 * real check before this branch merges.
 *
 *   A  this tree
 *   B  this tree with the patch bay's spectrum strips not drawing (BandStrip's loop off)
 *   C  this tree with #511's src/ changes reverted
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn, execSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, symlinkSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const work = join(tmpdir(), 'squeeze-ab');
mkdirSync(work, { recursive: true });
const sh = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

function variant(name, patch) {
  const dir = join(work, name);
  cpSync(root, dir, { recursive: true, filter: (p) => !/\/(node_modules|dist|\.git)(\/|$)/.test(p.slice(root.length)) });
  if (!existsSync(join(dir, 'node_modules'))) symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
  patch(dir);
  sh(`node node_modules/vite/bin/vite.js build --outDir ${join(work, `dist-${name}`)}`, dir);
  return join(work, `dist-${name}`);
}
const builds = { A: null, B: null, C: null };
builds.A = variant('A', () => {});
builds.B = variant('B', (dir) => {
  const f = join(dir, 'src/components/phone/BandStrip.tsx');
  const s = readFileSync(f, 'utf8');
  const t = s.replace('  useEffect(() => {\n    let raf = 0;', '  useEffect(() => {\n    if (Date.now() > 0) return;\n    let raf = 0;');
  if (t === s) throw new Error('B: patch did not apply');
  writeFileSync(f, t);
});
builds.C = variant('C', (dir) => {
  try { sh('git fetch --no-tags --depth=2 origin 864b4e296c47ecbbe034ed7fa83c1b90093db6e2'); } catch (e) { console.log('fetch:', String(e.stderr ?? e).slice(0, 300)); }
  const diff = sh('git diff 864b4e296c47ecbbe034ed7fa83c1b90093db6e2~1 864b4e296c47ecbbe034ed7fa83c1b90093db6e2 -- src');
  writeFileSync(join(work, 'c.patch'), diff);
  sh(`git apply -R ${join(work, 'c.patch')}`, dir);
});

async function serve(dist, port) {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  await new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('preview did not start')), 30_000);
    proc.stdout.on('data', (d) => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
  });
  return proc;
}

const browser = await launchChromium(chromium);
let port = 4380;
const rows = [];
for (const name of ['A', 'B', 'C', 'A', 'B', 'C']) {
  const server = await serve(builds[name], port++);
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await page.addInitScript(() => { try { sessionStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* */ } });
  await page.goto(`http://localhost:${port - 1}/?debug&look=bass-drop`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.chromaglassDebug === 'function' && window.chromaglassDebug().fluids?.length > 0, null, { timeout: 60_000 });
  await page.evaluate(() => { window.__frames = 0; const f = () => { window.__frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.waitForTimeout(20000);
  await page.evaluate(() => new Promise((res) => { let n = 0; const t = () => { window.chromaglassAction('tap-tempo'); if (++n < 4) setTimeout(t, 400); else res(); }; t(); }));
  const read = () => page.evaluate(() => {
    const d = window.chromaglassDebug(); const l = d.fluids[0];
    let gpu = 0; if (l.gpu?.profiler?.ms) for (const v of l.gpu.profiler.ms.values()) gpu += v;
    return { t: performance.now(), frames: window.__frames, steps: l.stepCount, kicks: d.kicks(), pressed: l.kickRelease.kicks, rel: l.kickRelease.steps, gpu, simMs: d.solver().simMs, rate: d.solver().stepRate };
  });
  for (const sq of [0.8, 0, 0.8]) {
    await page.evaluate((v) => window.chromaglassSettings({ beatSqueeze: v }), sq);
    await page.waitForTimeout(2000);
    const a = await read();
    await page.waitForTimeout(12000);
    const b = await read();
    const s = (b.t - a.t) / 1000;
    const row = `${name} squeeze ${sq}: ${b.steps - a.steps} steps, ${b.frames - a.frames} frames in ${s.toFixed(1)} s; ${b.kicks - a.kicks} kicks, ${b.pressed - a.pressed} pressed, ${b.rel - a.rel} release steps; step GPU ${b.gpu.toFixed(2)} ms, simMs ${Number(b.simMs).toFixed(2)}, rate ${b.rate}`;
    console.log(row); rows.push(row);
  }
  await page.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
}
await browser.close();
console.log('\nSQUEEZE A/B\n' + rows.join('\n'));
process.exit(0);
