#!/usr/bin/env node
/**
 * Does random evolve ever hand back a plate with nothing on it?
 *
 * Three complaints, all the same shape: a look that arrives on its own and
 * fills the frame with one flat thing. It has removed all the dye, shown a
 * black screen, and now a saturated yellow one.
 *
 * So this drives the real path — luckyLook through evolvedLook, the two
 * functions the song boundary calls — with a seeded roll, puts each result on
 * a real plate, photographs it, and asks how much of the frame is one colour.
 * A look that is 90% one colour is not a look.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { luckyLook } from '../src/lib/lucky.ts';
import { evolvedLook } from '../src/lib/lookFade.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { PRESETS } from '../src/presets.ts';
import { engineQuery, installFrameReader, frameOf } from './frame.mjs';

const PORT = 4336;
// Four is a smoke test. The flat-backdrop roll was 1 in 63, so hunting for
// another cause of it wants a number like 20 and the patience to match.
const ROLLS_EACH = Number(process.env.EVOLVE_ROLLS ?? 4);
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

// A seeded roll, so a failure can be reproduced exactly.
let seed = Number(process.env.EVOLVE_SEED ?? 20260922);
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const LED = ['#ff2d55', '#34c759', '#0a84ff', '#ffd60a'];
const base = (id) => ({ ...DEFAULT_SETTINGS, ...(PRESETS.find(p => p.id === id)?.settings ?? {}) });

const browser = await launchChromium(chromium);
let bad = 0, n = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  /*
    How much of the frame is one colour.

    Bucketed coarsely — four bits a channel — because a flat plate is not
    bit-identical: a gradient backdrop, dither and grain all move the low bits
    while the picture is still, to a person, one colour.
  */
  const flatness = async () => {
    const px = await frameOf(page, 320, 200);
    if (!px) {
      const why = await page.evaluate(() => window.__cgFrameLast);
      throw new Error(`could not photograph the plate: ${JSON.stringify(why)}`);
    }
    const bins = new Map();
    let tot = 0;
    for (let i = 0; i < px.length; i += 4) {
      const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
      bins.set(k, (bins.get(k) ?? 0) + 1); tot++;
    }
    let top = 0, topKey = 0;
    for (const [key, v] of bins) if (v > top) { top = v; topKey = key; }
    return { share: top / tot, rgb: [(topKey >> 8) * 17, ((topKey >> 4) & 15) * 17, (topKey & 15) * 17] };
  };

  for (const startId of ['classic', 'fillmore-east-1969', 'oil-wheel']) {
    const from = base(startId);
    for (let k = 0; k < ROLLS_EACH; k++) {
      const look = evolvedLook(from, luckyLook(from, LED, rand));
      await page.evaluate((s) => {
        const d = window.chromaglassDebug();
        Object.assign(d.settings, s);
        // The previous roll left the plate crawling; a roll starts at speed.
        if (s.globalSpeed === undefined) d.settings.globalSpeed = 0.015;
      }, look);
      /*
        Long enough for the look to actually arrive.

        Two seconds was not: a look that drains the plate still has yesterday's
        dye on it for the first few seconds, so the frame is full of picture
        and nothing reads as flat. The complaint is a plate that has *become*
        one colour, which takes as long as the evaporation and the dye budget
        need. The reported case was 24 seconds in.
      */
      /*
        Long enough for the automation to fill the plate.

        Nine seconds did not reproduce it across 39 looks. The reported case
        was 24 seconds in, and the automation pours on its own the whole time
        — so a look that rolls a fast pour, a high dye budget and one dominant
        colour has to be given the time to actually saturate before the frame
        is judged.
      */
      await page.waitForTimeout(28000);
      const dens = await page.evaluate(() => {
        const d = window.chromaglassDebug();
        const a = d.fluids?.[0]?.readDensity;
        if (!a) return null;
        let t = 0; for (let i = 0; i < a.length; i++) t += a[i];
        return t / a.length;
      });
      let flat = await flatness();
      n++;
      /*
        Then the speed comes down, which is how it was actually reported:
        "the big colored screen happened after i pressed random evolve and
        then lowered the speed".

        That pairing is the whole bug. Evolving alone rolls a new backdrop;
        slowing the plate alone dries nothing. Together they used to empty the
        dish — the drying ran per step rather than per second of plate time,
        so a plate set to crawl went on evaporating at full pace and left the
        bare, freshly recoloured backdrop. Fixed in #121, and this is the
        check that would have caught it, so it runs on every roll.
      */
      if (flat.share <= 0.9) {
        await page.evaluate(() => {
          const d = window.chromaglassDebug();
          d.settings.globalSpeed = 0.003;
        });
        await page.waitForTimeout(28000);
        const slow = await flatness();
        if (slow.share > flat.share) flat = { ...slow, afterSlowing: true };
      }
      if (flat.share > 0.9) {
        bad++;
        const diff = Object.keys(look).filter(key =>
          JSON.stringify(look[key]) !== JSON.stringify(from[key]));
        console.log(`\n FLAT  ${startId} roll ${k}${flat.afterSlowing ? ' (after slowing the plate)' : ''}: ` +
          `${(flat.share * 100).toFixed(0)}% of the frame is rgb(${flat.rgb.join(',')})`);
        console.log(`   renderStyle=${look.renderStyle} paperA=${look.paperA} paperB=${look.paperB}` +
          ` dyeBudget=${look.dyeBudget?.toFixed?.(2)} dimmer=${look.dimmer?.toFixed?.(2)}` +
          ` evap=${look.evaporationRate?.toFixed?.(4)} plateDye=${dens?.toFixed?.(4)}` +
          ` ledPlatform=${look.ledPlatform} blendMode=${look.blendMode}`);
        console.log(`   changed ${diff.length} settings`);
      } else {
        process.stdout.write(dens !== null && dens < 0.02 ? 'o' : '.');
      }
    }
  }
  console.log(`\n\n${n} evolved looks, ${bad} of them flat`);
} finally { await browser.close(); stop(); }
process.exit(bad ? 1 : 0);
