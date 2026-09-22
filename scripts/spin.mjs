#!/usr/bin/env node
/**
 * Does a flicked plate spin up, slow down, and stop?
 *
 * Four claims, each measured rather than looked at:
 *   1. a flick raises the angular velocity from rest
 *   2. it decays, and reaches rest rather than creeping for ever
 *   3. Plate Drag changes how long that takes, in the right direction
 *   4. the two plates are independent, and turn opposite ways
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, installFrameReader } from './frame.mjs';

const PORT = 4333;
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  page.on('console', m => { const t = m.text(); if (/error|invalid/i.test(t)) console.log('  [page]', t.slice(0, 140)); });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const has = await page.evaluate(() => typeof window.chromaglassDebug?.().flick === 'function');
  check('the page is running the build that was just made', has, has ? 'flick() present' : 'stale bundle');
  if (!has) process.exit(1);

  // Two plates, no motor, so a flick is the only thing turning them.
  await page.evaluate(() => {
    const d = window.chromaglassDebug();
    d.settings.layerCount = 2;
    d.settings.rotationSpeed = 0;
    d.settings.automateRate = 0;
    d.settings.audioMappings = { ...(d.settings.audioMappings ?? {}), rotation: 'none' };
  });
  await page.waitForTimeout(2500);

  const spin = () => page.evaluate(() => [...(window.chromaglassDebug().spin.current ?? [])]);
  const setDrag = (v) => page.evaluate((v) => { window.chromaglassDebug().settings.spinDrag = v; }, v);

  const rest = await spin();
  check('both plates start at rest', rest.length >= 2 && rest.every(v => Math.abs(v) < 1e-3),
    `[${rest.map(v => v.toFixed(3)).join(', ')}]`);

  // ── 1 and 2: flick the front plate and watch it ──
  await setDrag(0.4);
  await page.evaluate(() => window.chromaglassDebug().flick(0));
  const t0 = await spin();
  check('a flick spins the front plate up', Math.abs(t0[0]) > 0.3, `${t0[0].toFixed(3)} rad/s`);
  check('and leaves the back plate alone', Math.abs(t0[1]) < 1e-3, `${t0[1].toFixed(4)} rad/s`);

  /*
    Eight seconds, not four.

    At the default drag the half-life is about a second, so four seconds left
    the plate at 6e-3 rad/s — about a revolution every twenty minutes, still
    falling, and the dry friction arrests it half a second later. The check
    was reading the coast and calling it a creep. It is the window that was
    wrong and not the physics, so the window moved.
  */
  const trace = [t0[0]];
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(500);
    trace.push((await spin())[0]);
  }
  console.log('     front plate, every 500ms: ' + trace.map(v => v.toFixed(3)).join(' '));
  check('it slows down', Math.abs(trace[trace.length - 1]) < Math.abs(trace[0]) * 0.5,
    `${trace[0].toFixed(3)} -> ${trace[trace.length - 1].toFixed(3)} rad/s`);
  check('and comes to rest rather than creeping for ever',
    Math.abs(trace[trace.length - 1]) < 1e-4, `${trace[trace.length - 1].toExponential(1)} rad/s`);

  // ── 3: drag changes the coast, in the right direction ──
  const coastAt = async (drag) => {
    await setDrag(drag);
    await page.evaluate(() => { const d = window.chromaglassDebug(); d.spin.current.fill(0); });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.chromaglassDebug().flick(0));
    const start = Math.abs((await spin())[0]);
    let t = 0;
    for (; t < 6000; t += 250) {
      await page.waitForTimeout(250);
      if (Math.abs((await spin())[0]) < start * 0.25) break;
    }
    return t;
  };
  // Alternated in pairs, because this machine is measuring under load.
  const slow1 = await coastAt(0.05), fast1 = await coastAt(0.95);
  const slow2 = await coastAt(0.05), fast2 = await coastAt(0.95);
  const slow = (slow1 + slow2) / 2, fast = (fast1 + fast2) / 2;
  check('Plate Drag decides how long it coasts', slow > fast,
    `drag 0.05 took ${slow}ms to lose three-quarters, drag 0.95 took ${fast}ms`);

  // ── 4: the plates turn opposite ways ──
  await setDrag(0.4);
  await page.evaluate(() => {
    const d = window.chromaglassDebug();
    d.spin.current.fill(0);
    d.flick(0); d.flick(1);
  });
  const both = await spin();
  check('the two plates turn opposite ways', both[0] * both[1] < 0,
    `front ${both[0].toFixed(3)}, back ${both[1].toFixed(3)} rad/s`);

  // ── and the angle actually moves ──
  const a0 = await page.evaluate(() => window.chromaglassDebug().rotation.current[0]);
  await page.evaluate(() => window.chromaglassDebug().flick(0));
  await page.waitForTimeout(1200);
  const a1 = await page.evaluate(() => window.chromaglassDebug().rotation.current[0]);
  check('and the plate it turns is actually turned', Math.abs(a1 - a0) > 0.05,
    `${(a1 - a0).toFixed(3)} rad`);
} finally { await browser.close(); stop(); }
console.log(bad ? `\n${bad} failed` : '\nall spin checks passed');
process.exit(bad ? 1 : 0);
