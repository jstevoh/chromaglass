#!/usr/bin/env node
/**
 * What kills the picture when Random Evolve is left running?
 *
 *   npm run killer                      # soap-film at 20% evolve speed
 *   KILLER_LOOK=classic KILLER_RATE=0.5 npm run killer
 *
 * Reported, twice, after two fixes that did not hold: "I was on soap film
 * preset and clicked evolve (@ 20% evolve speed) and it did the spinny black
 * thing and covered the view port."
 *
 * Every attempt at this so far has been a guess at which setting could do it.
 * This one watches instead: it puts the look on, switches evolving on exactly
 * as the desk does, and photographs the plate every few seconds. The moment
 * the picture dies it says which settings have moved since the start, and by
 * how much — so the answer is read off rather than argued for.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { installFrameReader, frameOf } from './frame.mjs';

const PORT = Number(process.env.KILLER_PORT ?? 4348);
const LOOK = process.env.KILLER_LOOK ?? 'soap-film';
const RATE = Number(process.env.KILLER_RATE ?? 0.2);
const MINUTES = Number(process.env.KILLER_MINUTES ?? 8);

/*
  Our own server, on the first port we can actually have.

  Refusing a port we did not open is right — measuring someone else's build is
  how a sweep produces a confident number about nothing. But refusing and
  *stopping* cost five attempts in a row here: a previous run had been killed
  with SIGKILL, which skips the handler that takes its detached preview server
  down, so the port stayed held by an orphan and every retry died on it.

  So it walks up a few ports and takes the first that is free. That keeps the
  guard's intent exactly — whatever it measures is a server this process
  started — while not being defeated by its own litter.
*/
let server = null, port = PORT, leaving = false;
for (let tries = 0; tries < 6 && !server; tries++) {
  const candidate = PORT + tries;
  const child = spawn('./node_modules/.bin/vite', ['preview', '--port', String(candidate), '--strictPort'],
    { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
  let died = false;
  child.on('exit', () => { died = true; });
  await new Promise(r => setTimeout(r, 2500));
  if (died) { console.log(`  port ${candidate} was taken; trying the next`); continue; }
  server = child; port = candidate;
}
if (!server) { console.error(`no free port in ${PORT}..${PORT + 5}`); process.exit(2); }
server.on('exit', (c) => {
  if (leaving) return;
  console.error(`\nthe preview server exited (${c}) part-way through`);
  process.exit(2);
});
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });

const judge = (px) => {
  const bins = new Map();
  let tot = 0, lum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    bins.set(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4), (bins.get(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)) ?? 0) + 1);
    lum += 0.299 * r + 0.587 * g + 0.114 * b;
    tot++;
  }
  let top = 0, key = 0;
  for (const [k, v] of bins) if (v > top) { top = v; key = k; }
  return { flat: top / tot, luma: lum / tot / 255, rgb: [(key >> 8) * 17, ((key >> 4) & 15) * 17, (key & 15) * 17] };
};

const browser = await launchChromium(chromium);
let died = false;
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  /*
    With the band playing, because a silent plate is a different plate.

    Every run of this before now measured a show with no music in it, and the
    automation this is testing is *driven* by music: the rate of its drops and
    blows carries an `energy` term, its floods ride the phrase's gust, and
    `beatSqueeze` — 0.4 on soap-film — presses the top glass on a kick and
    dents the gap. With no sound none of that fires, so the hunt was watching
    a plate doing almost nothing and calling the result intermittent.

    Simulated audio starts on the first gesture, which a harness never makes,
    so it is chosen before the page loads instead.
  */
  await page.addInitScript(() => {
    try { localStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private window */ }
  });
  await installFrameReader(page);
  await page.goto(`http://localhost:${port}/?debug&gpu=mid&tier=local&look=${LOOK}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  await page.evaluate((r) => { window.chromaglassDebug().settings.automateRate = r; }, RATE);
  // The phrase is what the music does to the plate, so it is the honest
  // readout that the band is playing: with the band forced it runs about a
  // third harder than a page left silent (drive 1.44 against 1.11, gust 0.36
  // against 0.18), which is how this was confirmed rather than assumed.
  const heard = await page.evaluate(() => window.chromaglassDebug?.().phrase?.() ?? null);
  console.log(`  phrase: drive ${heard?.drive?.toFixed(2) ?? '?'}, gust ${heard?.gust?.toFixed(2) ?? '?'}`);
  const start = await page.evaluate(() => ({ ...window.chromaglassDebug().settings }));
  // Switched on the way the desk switches it on.
  await page.evaluate(() => window.chromaglassAction?.('automate-toggle'));
  console.log(`  ${LOOK} at evolve speed ${RATE}, watching for ${MINUTES} minutes\n`);
  console.log('    at     flat%   luma    commonest colour');
  console.log('  ' + '-'.repeat(46));

  /*
    A regime change, not a threshold.

    The first run of this watched for 85% of the frame in one colour and
    reported "the picture held" through the exact fault it was written for:
    the plate ran at 3-5% flat for seven minutes and then went to 52% black
    and stayed there. Half the frame is the reported "covered the view port";
    it is only not 85% because the dish is round and the rest of it is still
    lit. So what counts as dead is a jump away from how this look has been
    behaving, held for two readings — which is also what a person means when
    they say it died.
  */
  const baseline = [];
  const history = [];          // the last few samples' settings
  let over = 0;
  const until = Date.now() + MINUTES * 60000;
  while (Date.now() < until) {
    await page.waitForTimeout(4000);
    const px = await frameOf(page, 320, 200);
    if (!px) throw new Error(`could not photograph: ${JSON.stringify(await page.evaluate(() => window.__cgFrameLast))}`);
    const j = judge(px);
    const t = Math.round((MINUTES * 60000 - (until - Date.now())) / 1000);
    /*
      What the plate holds against what it was told to hold.

      The dye budget exists so a plate keeps "plenty of empty glass left — a
      saturated plate has no boundaries or gradients and reads as a static
      colour wash", which is the reported fault word for word. So the ratio is
      worth watching the whole way through rather than only at the death.
    */
    const budget = await page.evaluate(() => {
      const d = window.chromaglassDebug();
      const f = d.fluids?.[0];
      const target = d.settings.macroMode ? 0.28 : Math.max(0.1, Math.min(1.2, d.settings.dyeBudget ?? 0.85));
      return { mean: f?.meanDensity ?? null, target };
    });
    if (budget.mean !== null) {
      process.stdout.write(`  (dye ${budget.mean.toFixed(2)} against a budget of ${budget.target.toFixed(2)} ` +
        `— ${(budget.mean / budget.target).toFixed(2)}x)\n`);
    }
    history.push({ t, settings: await page.evaluate(() => ({ ...window.chromaglassDebug().settings })) });
    if (history.length > 9) history.shift();
    /*
      Dark and large, which is what was reported.

      The first detector asked for 85% of the frame in one colour and printed
      "the picture held" through the fault it was written for. The second asked
      for any jump away from the look's own behaviour, and caught a big blue
      pour — 35% of the frame at rgb(0,0,255), luma 0.156 — which is a picture,
      not a death. What was actually reported is a *black* thing covering the
      view: run one went to 52% at rgb(0,0,0) with the luma halved, and stayed.

      So: the commonest colour has to be near black, it has to cover a good
      share of the frame, and it has to still be there on the next reading.
      A dish is round, so half the frame is as covered as it gets.
    */
    if (baseline.length < 12) baseline.push(j.flat);
    const settled = [...baseline].sort((a, b) => a - b)[Math.floor(baseline.length / 2)] ?? j.flat;
    const darkNow = Math.max(...j.rgb) < 40;
    /*
      The share, not the brightness.

      Three detectors so far, each too narrow for the next thing reported. 85%
      of the frame in one colour printed "the picture held" through a plate
      that had gone to 52% black. Narrowing to dark-and-large caught that, and
      dismissed 35% of the frame at pure blue as a big pour. Then: "making the
      entire screen yellow... trying to go under a completely dye saturated
      layer" — which is the blue one again in another hue, and the black one
      is the same shape with the light off. One colour taking a third of a
      frame that has been running at a twentieth is a picture being covered;
      what colour the cover is, is a detail of which thing did it.
    */
    const jumped = baseline.length >= 8 &&
      (j.flat > Math.max(0.28, settled + 0.18) || j.luma < 0.03);
    over = jumped ? over + 1 : 0;
    const dead = over >= 2 || j.flat > 0.9;
    console.log(`  ${String(t).padStart(4)}s   ${(j.flat * 100).toFixed(0).padStart(4)}%  ${j.luma.toFixed(3)}   rgb(${j.rgb.join(',')})` +
      `${jumped ? '   ← away from ' + (settled * 100).toFixed(0) + '%' : ''}${dead ? '  DEAD' : ''}`);
    if (!dead) continue;

    died = true;
    const now = history[history.length - 1].settings;
    /*
      Against thirty seconds ago, not against the look.

      Diffed against the start it listed fifty-eight settings, every one a
      drift of a fraction of a percent, which says nothing about what killed
      it. What changed just before it died is the signal.
    */
    const earlier = history[0];
    const recent = Object.keys(now).filter(k => JSON.stringify(now[k]) !== JSON.stringify(earlier.settings[k]));
    console.log(`\n  THE PICTURE DIED at ${t}s. In the ${t - earlier.t}s before that, ${recent.length} settings moved:`);
    for (const k of recent) console.log(`    ${k}: ${JSON.stringify(earlier.settings[k])} → ${JSON.stringify(now[k])}`);
    const fromLook = Object.keys(now).filter(k => JSON.stringify(now[k]) !== JSON.stringify(start[k]));
    const big = fromLook.filter(k => typeof now[k] !== 'number' || typeof start[k] !== 'number' ||
      Math.abs(now[k] - start[k]) > Math.abs(start[k] || 1) * 0.5);
    console.log(`  and ${big.length} of the ${fromLook.length} that differ from ${LOOK} moved by more than half:`);
    for (const k of big) console.log(`    ${k}: ${JSON.stringify(start[k])} → ${JSON.stringify(now[k])}`);
    /*
      The flash guard, first, because it is the only thing that dims a whole
      show without a setting moving — and "0 settings moved" is exactly what
      the deployed build reported when it died.
    */
    const guard = await page.evaluate(() => window.chromaglassDebug?.().flash ?? null);
    if (guard) {
      console.log(`\n  the flash guard: engaged ${guard.engaged}, gain ${guard.gain.toFixed(3)}, ` +
        `${guard.rate.toFixed(1)} flashes/s, amplitude ${guard.amplitude.toFixed(3)}`);
      if (guard.engaged) console.log('  → THE FLASH GUARD IS HOLDING THE SHOW BACK.');
    }
    console.log(`  the cover is ${darkNow ? 'DARK' : 'LIT'} — rgb(${j.rgb.join(',')}) over ${(j.flat * 100).toFixed(0)}% of the frame`);
    /*
      Every plate, because "under a completely dye saturated layer" is a guess
      worth testing rather than repeating. If one plate's dye has gone to a
      single colour while the other still has structure, the composite is one
      plate covering the other — a different fault from both going flat.
    */
    const layers = await page.evaluate(() => {
      const d = window.chromaglassDebug();
      return (d.fluids ?? []).map((f, i) => {
        const dye = f?.gpu?.rbDyeView;
        if (!dye) return { layer: i, read: false };
        const bins = new Map();
        let wet = 0, mass = 0, peak = 0;
        for (let k = 0; k < dye.length; k += 4) {
          const a = dye[k + 3];
          mass += a;
          if (a > peak) peak = a;
          if (a < 0.05) continue;
          wet++;
          const key = (((Math.min(255, dye[k] / a * 255) | 0) >> 4) << 8) |
                      (((Math.min(255, dye[k + 1] / a * 255) | 0) >> 4) << 4) |
                      ((Math.min(255, dye[k + 2] / a * 255) | 0) >> 4);
          bins.set(key, (bins.get(key) ?? 0) + 1);
        }
        let top = 0, topKey = 0;
        for (const [kk, v] of bins) if (v > top) { top = v; topKey = kk; }
        return { layer: i, read: true, mean: mass / (dye.length / 4), peak,
          wetShare: wet / (dye.length / 4), colours: bins.size,
          dominant: wet ? top / wet : 0,
          rgb: [(topKey >> 8) * 17, ((topKey >> 4) & 15) * 17, (topKey & 15) * 17] };
      });
    });
    for (const L of layers ?? []) {
      if (!L.read) { console.log(`  layer ${L.layer}: no readback`); continue; }
      console.log(`  layer ${L.layer}: mean dye ${L.mean.toFixed(2)}, peak ${L.peak.toFixed(2)}, ` +
        `${(L.wetShare * 100).toFixed(0)}% wet, ${L.colours} colours, ` +
        `commonest ${(L.dominant * 100).toFixed(0)}% rgb(${L.rgb.join(',')})`);
    }
    const flatLayer = (layers ?? []).find(L => L.read && L.dominant > 0.8 && L.wetShare > 0.5);
    if (flatLayer) console.log(`  → LAYER ${flatLayer.layer} HAS GONE TO ONE COLOUR and is covering the rest.`);

    const field = await page.evaluate(() => {
      const dye = window.chromaglassDebug().fluids[0]?.gpu?.rbDyeView;
      if (!dye) return null;
      const bins = new Map(); let wet = 0;
      for (let i = 0; i < dye.length; i += 4) {
        const a = dye[i + 3];
        if (a < 0.05) continue;
        wet++;
        const key = (((Math.min(255, dye[i] / a * 255) | 0) >> 4) << 8) |
                    (((Math.min(255, dye[i + 1] / a * 255) | 0) >> 4) << 4) |
                    ((Math.min(255, dye[i + 2] / a * 255) | 0) >> 4);
        bins.set(key, (bins.get(key) ?? 0) + 1);
      }
      let top = 0; for (const v of bins.values()) if (v > top) top = v;
      return { wet, colours: bins.size, dominant: wet ? top / wet : 0 };
    });
    if (field) {
      console.log(`\n  the dye field: ${field.colours} colours over ${field.wet} wet cells, commonest ${(field.dominant * 100).toFixed(0)}%`);
      console.log(field.wet < 500
        ? '  → the plate is EMPTY. The dye went, not the renderer.'
        : field.dominant > 0.85
          ? '  → the dye went uniform. The solver flattened it.'
          : '  → the dye still has structure. THE RENDERER is hiding it.');
    }
    const png = await page.evaluate(async () => {
      const shot = await window.__cgShot('killer');
      if (!shot) return null;
      const c = document.createElement('canvas');
      c.width = shot.w; c.height = shot.h;
      c.getContext('2d').putImageData(window.__shots.killer, 0, 0);
      return c.toDataURL('image/png');
    });
    if (png) {
      writeFileSync('/tmp/killer.png', Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
      console.log('  and a picture of it in /tmp/killer.png');
    }
    break;
  }
} finally { await browser.close(); stop(); }
console.log(died ? '\nreproduced' : `\n${MINUTES} minutes, the picture held`);
process.exit(died ? 1 : 0);
