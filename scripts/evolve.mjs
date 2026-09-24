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
import { writeFileSync } from 'node:fs';
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

/*
  A seeded roll, so the *look* can be reproduced exactly — which is not the
  same as reproducing the plate.

  The rolls run one after another on one page and nothing is cleared between
  them, which is what a performer does: they evolve a look on a plate that is
  already running. So roll nine sits on whatever rolls zero to eight left
  behind, and a flat frame at roll nine is not necessarily a property of roll
  nine's settings. Measured: the one flat roll this found did not reproduce
  from a fresh plate with the same 136 settings on it — 7–14% against 96%.
*/
// A seeded roll, so a failure can be reproduced exactly.
let seed = Number(process.env.EVOLVE_SEED ?? 20260922);
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const LED = ['#ff2d55', '#34c759', '#0a84ff', '#ffd60a'];
/*
  A start look, and it has to be a real one.

  `?? {}` made a missing preset indistinguishable from an empty one, so
  `fillmore-east-1969` — which is not a preset; the id is `fillmore-1969` —
  quietly evolved from DEFAULT_SETTINGS while the report said Fillmore. One of
  the three start looks was never the look it was named after, and the run that
  found a flat plate blamed it on a preset that had not been on the glass.

  Same family as the flatness verdict that could not fail and the preview port
  that was not ours: a fallback that cannot be told from a success.
*/
const base = (id) => {
  const found = PRESETS.find(p => p.id === id);
  if (!found) throw new Error(`no preset '${id}' — the ids are ${PRESETS.map(p => p.id).join(', ')}`);
  return { ...DEFAULT_SETTINGS, ...found.settings };
};

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

  for (const startId of ['classic', 'fillmore-1969', 'oil-wheel']) {
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
        /*
          Written out, because reading the settings back off the screen is
          how the last one got away.

          A flat roll was reproduced by hand from the nine settings that
          looked like they mattered, and the plate came out at 7–14% —
          nothing like the 96% reported. Fifty-five settings differed and
          there was no reason the other forty-six were passengers.
        */
        const file = `/tmp/evolve-flat-${startId}-${k}.json`;
        writeFileSync(file, JSON.stringify(look, null, 2));
        /*
          And a picture of it, because two flat plates have now been chased
          on numbers alone and neither reproduced.

          What the settings say is what the plate was *told*; a photograph is
          what it did. The first case was argued about for an hour on the
          strength of "96% of the frame is one purple" — a thin-dye theory
          that a later measurement disproved outright — when a look at the
          frame would have said in a second whether it was a wash, a blown
          render or a solid fill.
        */
        const png = await page.evaluate(async () => {
          const c = document.querySelector('#liquid-canvas');
          if (!c) return null;
          const shot = await window.__cgShot('flat');
          if (!shot) return null;
          const full = document.createElement('canvas');
          full.width = shot.w; full.height = shot.h;
          full.getContext('2d').putImageData(window.__shots.flat, 0, 0);
          return full.toDataURL('image/png');
        });
        /*
          And which layer flattened it, which is the question two of these
          have now been argued about without.

          A flat frame over a *structured* dye field means the renderer
          flattened it; a flat frame over a flat dye field means the dye did.
          Both cases so far were chased on the frame alone — one of them
          through a thin-dye theory that a later measurement disproved — when
          this one number forks the whole investigation.

          The dye's colour is read normalised by its own density, because
          `rbDyeView` holds colour premultiplied by how much dye is there:
          without dividing it out, a pale cell and a saturated one of the same
          hue land in different buckets and every plate looks structured.
        */
        const field = await page.evaluate(() => {
          const g = window.chromaglassDebug().fluids[0]?.gpu;
          const dye = g?.rbDyeView;
          if (!dye) return null;
          const bins = new Map();
          let wet = 0;
          for (let i = 0; i < dye.length; i += 4) {
            const a = dye[i + 3];
            if (a < 0.05) continue;
            wet++;
            const r = Math.min(255, (dye[i] / a) * 255) | 0;
            const gg = Math.min(255, (dye[i + 1] / a) * 255) | 0;
            const b = Math.min(255, (dye[i + 2] / a) * 255) | 0;
            const key = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4);
            bins.set(key, (bins.get(key) ?? 0) + 1);
          }
          let top = 0;
          for (const v of bins.values()) if (v > top) top = v;
          return { wet, colours: bins.size, dominant: wet ? top / wet : 0 };
        });
        if (field) {
          console.log(`   the DYE FIELD itself: ${field.colours} colours over ${field.wet} wet cells, ` +
            `the commonest ${(field.dominant * 100).toFixed(0)}% of them`);
          console.log(field.dominant > 0.85
            ? '   → the dye went uniform. The solver flattened it, not the renderer.'
            : '   → the dye still has structure. THE RENDERER flattened it, not the solver.');
        }
        if (png) {
          const img = `/tmp/evolve-flat-${startId}-${k}.png`;
          writeFileSync(img, Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
          console.log(`   and a picture of the plate in ${img}`);
        } else {
          console.log('   (the stage gave no frame to photograph)');
        }
        console.log(`   the whole look is in ${file} — replay it with WASH_LOOK=${file} npm run wash`);
        console.log(`   NOTE: this plate has been running through ${k} earlier rolls. The look alone`);
        console.log(`   may not reproduce it — a roll inherits whatever the ones before it left.`);
      } else {
        process.stdout.write(dens !== null && dens < 0.02 ? 'o' : '.');
      }
    }
  }
  console.log(`\n\n${n} evolved looks, ${bad} of them flat`);
} finally { await browser.close(); stop(); }
process.exit(bad ? 1 : 0);
