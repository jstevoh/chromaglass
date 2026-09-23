#!/usr/bin/env node
/**
 * Does the magnet move the ferrofluid, and do the shapes come from the physics?
 *
 *   npm run ferro
 *
 * Four questions, each with the control that makes it mean something:
 *
 *   1. the phase is on the plate at all, and where it was put
 *   2. a magnet gathers it — measured as how much sits near the magnet,
 *      against the same plate with the magnet switched off
 *   3. height is the control that matters: held close it gathers harder
 *      than held away, at the same strength
 *   4. polarity reverses it: held the other way up it pushes the phase off
 *
 * The magnet is deliberately put somewhere off-centre in both axes, because a
 * field that is flipped in y still gathers *something* near the middle and
 * every check that only asks "did it move" passes on it. That is the lesson
 * the air field taught, in the same file's neighbour.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, installFrameReader, isGpuEngine } from './frame.mjs';

const PORT = 4338;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

const MX = 0.30, MY = 0.72;     // off-centre in both axes, on purpose
/*
  The field comes back in the solver's own grid, and the magnet is in the same
  frame — which was worth checking rather than assuming, because an earlier
  reading of this suggested a y-flip that was not there. It was the peak
  saying it: the phase saturates at 1, so the brightest cell is whichever got
  there first. Centre of mass settled it.
*/
const GY = MY;

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  page.on('console', m => { const t = m.text(); if (/error|invalid/i.test(t)) console.log('  [page]', t.slice(0, 150)); });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
  check('the GPU solver is the one being measured', isGpuEngine(engine), engine ?? 'no debug hook');
  const fresh = await page.evaluate(() => typeof window.chromaglassDebug?.().readPhase === 'function');
  check('the page is running the build that was just made', fresh, fresh ? 'readPhase present' : 'stale bundle');
  if (!fresh) { process.exit(1); }

  /** Put ferrofluid on the plate and settle it, with the magnet as asked. */
  /*
    Settings first, then a pause, then the pour.

    Doing both in one go raced the app's own seeding: laying a look calls
    clearPhase and re-pours from `phaseAmount`, and a harness that mutates
    `d.settings` directly has not necessarily reached `settingsRef` when that
    runs. The result was arms where the stage read OFF and the plate read
    empty, alternating with arms that were fine — which looked like a physics
    fault and was a race.
  */
  const lay = async (magnet) => {
    await page.evaluate((m) => {
      const d = window.chromaglassDebug();
      Object.assign(d.settings, {
        phaseAmount: 0.9, phaseScale: 0.35, phaseSharp: 0.4,
        globalSpeed: 0.02, automateRate: 0,
        magnetX: m.x, magnetY: m.y, magnetHeight: m.h,
        magnetStrength: m.s, magnetPolarity: m.p,
      });
    }, magnet);
    // Long enough for any seeding the settings change provoked to finish.
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const g = window.chromaglassDebug().fluids?.[0]?.gpu;
      g?.clearPhase?.();
      for (let k = 0; k < 14; k++) {
        const a = k * 2.399963229728653;
        const rad = 0.16 + 0.3 * ((k * 0.6180339887) % 1);
        g?.addPhase?.(0.5 + Math.cos(a) * rad, 0.5 + Math.sin(a) * rad, 0.07, 0.9);
      }
    });
    /*
      What landed, before anything is allowed to move it.

      One arm reading an empty plate and the next reading a full one is the
      pour failing, not the magnet — so the pour is checked where it happens
      rather than inferred six seconds later.
    */
    const laid = await page.evaluate(async () => {
      const f = await window.chromaglassDebug().readPhase();
      if (!f) return -1;
      let t = 0; for (let i = 0; i < f.data.length; i++) t += f.data[i];
      return t;
    });
    await page.waitForTimeout(6000);
    const kept = await page.evaluate(async () => {
      const f = await window.chromaglassDebug().readPhase();
      if (!f) return -1;
      let t = 0; for (let i = 0; i < f.data.length; i++) t += f.data[i];
      return t;
    });
    const live = await page.evaluate(() => window.chromaglassDebug().phaseState?.());
    console.log(`     poured ${laid.toFixed(0)}, six seconds later ${kept.toFixed(0)}` +
      `  (stage ${live?.live ? 'running' : 'OFF'})`);
    return page.evaluate(async ({ mx, my }) => {
      const d = window.chromaglassDebug();
      const f = await d.readPhase();
      if (!f) return null;
      const { n, data } = f;
      /*
        Centre of mass, not the peak.

        The phase saturates at 1, so the brightest cell is simply the first
        one to get there and says nothing about where the liquid went — it
        reported 0.35,0.16 for a magnet the phase had plainly gathered under.
        Where the mass is is the question.
      */
      let total = 0, near = 0, peak = 0, cx = 0, cy = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = data[x + y * n];
        total += v; cx += v * (x / n); cy += v * (y / n);
        if (v > peak) peak = v;
        if (Math.hypot(x / n - mx, y / n - my) < 0.18) near += v;
      }
      return { total, near, peak, px: total ? cx / total : 0, py: total ? cy / total : 0,
               share: total > 0 ? near / total : 0 };
    }, { mx: MX, my: GY });
  };

  // ── 1: it is there ──
  const off = await lay({ x: MX, y: MY, h: 0.2, s: 0, p: 1 });
  check('there is ferrofluid on the plate', off !== null && off.total > 50,
    off ? `total ${off.total.toFixed(0)}, peak ${off.peak.toFixed(2)}` : 'no phase field');
  if (!off) process.exit(1);

  // ── 2: a magnet gathers it, against the same plate with none ──
  const on = await lay({ x: MX, y: MY, h: 0.2, s: 0.8, p: 1 });
  /*
    Every arm has to have liquid on it before it can say anything.

    Without this, an arm whose plate collapsed to nothing reported 0.0% near
    the magnet, and "held close gathers harder than held away" *passed* on it —
    0.0% being duly less than 2.5%. A check that a broken arm can satisfy is
    worse than one that fails.
  */
  const armed = (p, name) => {
    const ok = p !== null && p.total > 50;
    if (!ok) check(`the ${name} arm has ferrofluid on it`, false, `total ${p ? p.total.toFixed(0) : 'none'}`);
    return ok;
  };
  console.log(`     near the magnet: ${(off.share * 100).toFixed(1)}% with it off, ${(on.share * 100).toFixed(1)}% with it on`);
  check('a magnet gathers the phase toward it', on.share > off.share * 1.25,
    `${(on.share * 100).toFixed(1)}% against ${(off.share * 100).toFixed(1)}% with the magnet off`);
  const toMagnet = Math.hypot(on.px - MX, on.py - GY);
  const toMirror = Math.hypot(on.px - MX, on.py - (1 - GY));
  const driftedTo = Math.hypot(off.px - MX, off.py - GY);
  check('and it gathers where the magnet is, not at its mirror',
    toMagnet < toMirror && toMagnet < driftedTo,
    `mass at ${on.px.toFixed(2)},${on.py.toFixed(2)} — ${toMagnet.toFixed(3)} from the magnet, ` +
    `${toMirror.toFixed(3)} from its mirror, ${driftedTo.toFixed(3)} with the magnet off`);

  // ── 3: height is the control that matters ──
  const far = await lay({ x: MX, y: MY, h: 0.9, s: 0.8, p: 1 });
  armed(far, 'lifted-away');
  check('held close it gathers harder than held away', armed(far, 'lifted-away') && on.share > far.share,
    `${(on.share * 100).toFixed(1)}% at height 0.2 against ${(far.share * 100).toFixed(1)}% at 0.9`);

  // ── 4: the other way up pushes it off ──
  const rev = await lay({ x: MX, y: MY, h: 0.2, s: 0.8, p: -1 });
  check('and turned over it pushes the phase away', armed(rev, 'reversed') && rev.share < on.share,
    `${(rev.share * 100).toFixed(1)}% reversed against ${(on.share * 100).toFixed(1)}%`);
} finally { await browser.close(); stop(); }

const bad = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
