#!/usr/bin/env node
/**
 * Does Random Evolve actually evolve the show?
 *
 *   npm run evolving
 *
 * It used to mean two unrelated things with nothing between them: an
 * automation that dropped dye and blew air, and a whole new look rolled at a
 * song boundary — fifty-five settings replaced at once, which is a cut. A look
 * either sat perfectly still in its settings or jumped somewhere else.
 *
 * Four things are asked here, and the last two are the ones a plate-watching
 * check could not answer on its own:
 *
 *   1. the dials wander        settings move, a few at a time
 *   2. and stay near the look  none further than a fifth of its travel
 *   3. and the light stack is left alone  (both unexplained flat plates were
 *      found with several of those high at once)
 *   4. and evolving uses its hands: it thins the plate and draws a finger
 *      through it, counted rather than inferred
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { PIN_RANGE } from '../src/lib/deskPins.ts';
import { DRIFTABLE } from '../src/lib/drift.ts';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const PORT = Number(process.env.EVOLVING_PORT ?? 4347);
const WATCH = Number(process.env.EVOLVING_WATCH ?? 70000);
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let up = true, leaving = false;
server.on('exit', (c) => { up = false; if (leaving) return; console.error(`\npreview exited (${c}) — port ${PORT} in use?`); process.exit(2); });
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));
if (!up) process.exit(2);

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const snap = () => page.evaluate(() => ({ ...window.chromaglassDebug().settings }));
  const events = () => page.evaluate(() => window.chromaglassDebug().autoEvents ?? null);

  // Evolving on, and driven hard so the rare hands fire inside a test run.
  await page.evaluate(() => { window.chromaglassDebug().settings.automateRate = 1; });
  const before = await snap();
  const e0 = await events();
  check('the automation reports what it does', e0 !== null,
    e0 ? `thinned ${e0.thinned}, stroked ${e0.stroked}, poured ${e0.poured}` : 'no autoEvents on the debug hook');

  /*
    Switched on through the action a MIDI pad fires, not a test backdoor.

    The drift lives in `App`, because that is where settings live, so reaching
    into the visualizer's debug hook would measure a plate that is not
    evolving. The desk's own switch only renders with the desk down, which is
    a state this harness has no reason to care about — `automate-toggle` is
    the same thing a pad, the palette and the keyboard all reach for.

    Nothing here asserts the flag flipped, because the counters below cannot
    move unless it did: they are incremented inside the automation.
  */
  await page.evaluate(() => window.chromaglassAction?.('automate-toggle'));
  await page.waitForTimeout(WATCH);

  const after = await snap();
  const e1 = await events();

  // 1. The dials wander.
  const moved = DRIFTABLE.filter(k => typeof before[k] === 'number' && before[k] !== after[k]);
  check('the dials wander while it is evolving', moved.length >= 2,
    `${moved.length} of ${DRIFTABLE.length} moved${moved.length ? ': ' + moved.slice(0, 6).join(', ') : ''}`);

  // 2. And none of them wanders far from the look.
  const far = moved.filter(k => {
    const spec = PIN_RANGE.get(k);
    if (!spec) return false;
    return Math.abs(after[k] - before[k]) > (spec.max - spec.min) * 0.25;
  });
  check('and none of them wanders far from the look it started on', far.length === 0,
    far.length ? far.map(k => `${k} ${before[k]} → ${after[k]}`).join(', ') : `worst inside a fifth of its travel`);

  // 3. The light stack is left where the hand put it.
  const LIGHT = ['saturationBoost', 'bloom', 'lumia', 'gelWheel', 'secondLamp', 'dimmer', 'exposure'];
  const litMoved = LIGHT.filter(k => typeof before[k] === 'number' && before[k] !== after[k]);
  check('and the light stack is never drifted into', litMoved.length === 0,
    litMoved.length ? litMoved.join(', ') : `${LIGHT.length} held — both flat plates were found with these high`);

  // 4. It uses its hands.
  if (e0 && e1) {
    check('evolving takes dye away as well as adding it', e1.thinned > e0.thinned,
      `thinned ${e0.thinned} → ${e1.thinned}`);
    check('and draws a finger through what is already there', e1.stroked > e0.stroked,
      `stroked ${e0.stroked} → ${e1.stroked}`);
  }
} finally { await browser.close(); stop(); }

const bad = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
