#!/usr/bin/env node
/**
 * Do both solvers agree? (docs/webgpu-plan.md, P2's gate.)
 *
 *   npm run parity
 *
 * The WebGL solver and the WebGPU one are built in one page, given the same
 * dye, velocity and press, stepped with the same parameters, and read back at
 * the logical grid. One step is compared field by field; a longer run is
 * compared by its statistics, because the fluid is chaotic and two engines
 * cannot stay pixel-identical through it.
 *
 * It runs on the dev server, not a build: the page imports both solvers
 * straight from source. WebGPU needs Playwright's full Chromium.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = Number(process.env.PARITY_PORT ?? 4328);
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  const line = `${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (!process.stdout.isTTY && process.stderr.isTTY) process.stderr.write(line + '\n');
};

{
  const held = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(PORT, '127.0.0.1');
  });
  if (held) { console.error(`port ${PORT} is already in use.`); process.exit(2); }
}
const server = spawn('./node_modules/.bin/vite', ['--port', String(PORT), '--strictPort'], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 3000));

const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [],
});

/** One run of the page. */
const run = async (n, steps) => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/parity.html?n=${n}&steps=${steps}`, { waitUntil: 'load' });
  const r = await page.waitForFunction(() => window.__parity?.done && window.__parity, null, { timeout: 120_000 })
    .then((h) => h.jsonValue()).catch((e) => ({ error: String(e.message).split('\n')[0] }));
  await page.close();
  return { ...r, pageErrors: errors };
};

try {
  // ── One step: the fields themselves ────────────────────────────────
  for (const n of [192, 384]) {
    const r = await run(n, 1);
    if (r.error) { check(`one step at ${n}²`, false, r.error); continue; }
    const where = `${r.adapter}, dye in ${r.float32Filterable ? '32-bit' : '16-bit'} floats`;
    // The two engines round differently (16-bit stores in the pressure fields
    // on one, 32 on the other; a different sampler); the question is whether
    // the answer is the same picture, so the error is judged against the
    // field's own size.
    check(`one step at ${n}²: the dye agrees`, r.dye.meanRel < 0.02 && r.dye.maxRel < 0.35,
      `mean ${r.dye.meanRel} of rms, worst ${r.dye.maxRel} (rms ${r.dye.rms}) — ${where}`);
    check(`one step at ${n}²: the velocity agrees`, r.vel.meanRel < 0.05 && r.vel.maxRel < 0.6,
      `mean ${r.vel.meanRel} of rms, worst ${r.vel.maxRel} (rms ${r.vel.rms})`);
    if (n === 192) {
      // The reduction against the field it claims to summarise.
      const m = r.measure;
      check('the plate measures itself', m.meanDensity.rel < 1e-4 && m.meanColor.rel < 1e-4 && m.maxDensity.rel < 1e-5 && m.maxSpeed.rel < 1e-5,
        `mean dye ${m.meanDensity.gpu} vs ${m.meanDensity.field}, peak ${m.maxDensity.gpu} vs ${m.maxDensity.field}, fastest ${m.maxSpeed.gpu} vs ${m.maxSpeed.field}`);
      // Pours: the CPU's arrays against the GPU's own splats.
      check('the splats land where the CPU painted them', r.splatDye.meanRel < 0.005 && r.splatDye.maxRel < 0.1,
        `dye mean ${r.splatDye.meanRel} of rms, worst ${r.splatDye.maxRel}; velocity worst ${r.splatVel.maxRel}`);
      check('the splats poured something', r.splatPoured.mass > 10,
        `${r.splatPoured.records} records, ${r.splatPoured.mass} of dye`);
    }
    if (n === 192) {
      // The reaction is its own field, on its own grid: CPU against compute.
      check('the reaction agrees', r.chem.meanRel < 0.02 && r.chem.maxRel < 0.35,
        `mean ${r.chem.meanRel} of rms, worst ${r.chem.maxRel} (rms ${r.chem.rms})`);
      check('the reaction is alive', r.chemAlive.cpu > 1 && r.chemAlive.webgpu > 1,
        `activator CPU ${r.chemAlive.cpu}, WebGPU ${r.chemAlive.webgpu}`);
    }
    if (n === 384) {
      // The end of a show: both plates empty, and by the same fraction.
      const d = r.drain;
      const gone = (b, a) => 1 - a / Math.max(b, 1e-9);
      check('the drain empties the plate', gone(d.before.webgl, d.after.webgl) > 0.97 && gone(d.before.webgpu, d.after.webgpu) > 0.97,
        `WebGL ${d.before.webgl} → ${d.after.webgl}, WebGPU ${d.before.webgpu} → ${d.after.webgpu}`);
      // Both end at nothing, so compare what is left against what was there
      // rather than against each other.
      check('the drain empties them alike', Math.abs(d.after.webgpu - d.after.webgl) < 0.01 * d.before.webgl,
        `${d.after.webgl} and ${d.after.webgpu} left of ${d.before.webgl}`);
    }
    check(`one step at ${n}²: no GPU errors`, !r.errors?.length && !r.pageErrors.length, (r.errors ?? r.pageErrors).slice(0, 2).join(' | '));
  }

  // ── Sixty steps: the statistics ────────────────────────────────────
  const long = await run(256, 60);
  if (long.error) check('sixty steps at 256²', false, long.error);
  else {
    const m = long.statistics.dyeMass, s = long.statistics.meanSpeed;
    const massRatio = m.webgpu / (m.webgl || 1e-9);
    const speedRatio = Number(s.webgpu) / (Number(s.webgl) || 1e-12);
    check('sixty steps at 256²: the plate holds the same dye', Math.abs(massRatio - 1) < 0.1, `WebGL ${m.webgl}, WebGPU ${m.webgpu} (${massRatio.toFixed(3)}×)`);
    check('sixty steps at 256²: the plate moves at the same speed', Math.abs(speedRatio - 1) < 0.25, `WebGL ${s.webgl}, WebGPU ${s.webgpu} (${speedRatio.toFixed(3)}×)`);
    check('sixty steps at 256²: no GPU errors', !long.errors?.length && !long.pageErrors.length, (long.errors ?? long.pageErrors).slice(0, 2).join(' | '));
  }
} finally {
  await browser.close();
  stop();
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} checks failed` : `\nall ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
