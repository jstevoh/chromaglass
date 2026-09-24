#!/usr/bin/env node
/**
 * A show being *worked*, not a plate being watched.
 *
 *   npm run gig
 *   GIG_LOOK=soap-film GIG_MINUTES=10 npm run gig
 *
 * Every hunt before this one left a plate running and waited for it to go
 * wrong, and that is not how it goes wrong. Reported, after four of them:
 *
 *   "when things go full screen dyed - it's because I've changed a setting in
 *    the middle of a show - not because I've waited for things to go bad. Our
 *    testing should simulate a real show where we're changing settings and
 *    dropping dyes, etc."
 *
 * So this one has hands. Every few seconds it does what a person at the desk
 * does — rides a fader, pours a dye, presses the glass, blows on it, draws a
 * finger through, changes the look — and photographs the plate after each. The
 * point is not that it eventually breaks; it is knowing **which action broke
 * it**, so the last dozen are printed when it does.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { installFrameReader, frameOf } from './frame.mjs';
import { PIN_RANGE, PINNABLE } from '../src/lib/deskPins.ts';
import { PALETTE } from '../src/constants.ts';
import { PRESETS } from '../src/presets.ts';

const PORT0 = Number(process.env.GIG_PORT ?? 4540);
const LOOK = process.env.GIG_LOOK ?? 'soap-film';
const MINUTES = Number(process.env.GIG_MINUTES ?? 10);
const SEED = Number(process.env.GIG_SEED ?? 20260924);

let bits = SEED >>> 0;
const rnd = () => { bits = (bits * 1664525 + 1013904223) >>> 0; return bits / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

let server = null, port = PORT0, leaving = false;
for (let t = 0; t < 6 && !server; t++) {
  const child = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT0 + t), '--strictPort'],
    { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
  let died = false;
  child.on('exit', () => { died = true; });
  await new Promise(r => setTimeout(r, 2500));
  if (died) continue;
  server = child; port = PORT0 + t;
}
if (!server) { console.error('no free port'); process.exit(2); }
server.on('exit', (c) => { if (!leaving) { console.error(`\npreview exited (${c})`); process.exit(2); } });
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });

const judge = (px) => {
  const bins = new Map();
  let tot = 0, lum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    bins.set(k, (bins.get(k) ?? 0) + 1);
    lum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    tot++;
  }
  let top = 0, key = 0;
  for (const [k, v] of bins) if (v > top) { top = v; key = k; }
  return { flat: top / tot, luma: lum / tot / 255, rgb: [(key >> 8) * 17, ((key >> 4) & 15) * 17, (key & 15) * 17] };
};

/*
  What a hand at the desk actually does.

  Weighted toward the two the report names — changing a setting and dropping
  dye — with the gestures and look changes that go between them. Each returns
  a line for the log, because the log is the whole point.
*/
const DRIVEABLE = PINNABLE.map(s => String(s.key)).filter(k =>
  !['layerCount', 'kaleidoscope', 'turbulenceDetail'].includes(k));

const actions = [
  { weight: 5, name: 'ride a fader', run: async (page) => {
    const key = pick(DRIVEABLE);
    const spec = PIN_RANGE.get(key);
    const to = spec.min + rnd() * (spec.max - spec.min);
    await page.evaluate(([k, v]) => window.chromaglassSettings({ [k]: v }), [key, to]);
    return `${key} → ${to.toFixed(4)}`;
  } },
  { weight: 4, name: 'pour a dye', run: async (page) => {
    const c = pick(PALETTE);
    const style = pick(['drop', 'spray', 'splatter', 'pour', 'streak']);
    await page.evaluate(([st, r, g, b]) => {
      const d = window.chromaglassDebug(), f = d.fluids[0], N = d.gridSize;
      for (let i = 0; i < 3; i++) {
        f.autoInject(st, 20 + Math.random() * (N - 40), 20 + Math.random() * (N - 40), 6, r, g, b, 0.6);
      }
    }, [style, c.r, c.g, c.b]);
    return `${style} of ${c.name}`;
  } },
  { weight: 2, name: 'work the glass', run: async (page) => {
    const what = pick(['press', 'blow', 'finger']);
    await page.evaluate((w) => {
      const d = window.chromaglassDebug(), f = d.fluids[0], N = d.gridSize;
      const x = N * (0.3 + Math.random() * 0.4), y = N * (0.3 + Math.random() * 0.4);
      if (w === 'press') { f.applySquish(x, y, 30, 0.004, d.settings.fingering ?? 0, true); f.squeezeOut?.(x, y, 40, 0.004); }
      else if (w === 'blow') f.blowAir(Math.round(x), Math.round(y), 5, 0.1);
      else for (let i = 0; i < 12; i++) f.fingerDrag(x + i * 2, y, 7, 0.09, 3, 0);
    }, what);
    return what;
  } },
  /*
    The two ways a look changes, kept apart and labelled honestly.

    The first version of this called `chromaglassDebug().applyLook(id)` and
    fell back to the `lucky` action when that did not exist — which it does
    not, so every "change the look: to acid-trip" in the log was really a
    random roll. The label lied, and the log is the entire point of this
    harness. Separated, because the two paths are not the same path: stepping
    a preset goes through `evolvedLook`, which holds the structure a fade
    cannot carry; Lucky calls `setSettings(luckyLook(...))` raw and holds
    nothing.
  */
  { weight: 2, name: 'step to the next look', run: async (page) => {
    await page.evaluate(() => window.chromaglassAction?.('preset-next'));
    const now = await page.evaluate(() => window.chromaglassDebug().settings.renderStyle);
    return `(renderStyle now ${now})`;
  } },
  { weight: 2, name: 'RANDOMISE (Lucky)', run: async (page) => {
    await page.evaluate(() => window.chromaglassAction?.('lucky'));
    const s = await page.evaluate(() => {
      const x = window.chromaglassDebug().settings;
      return { kaleidoscope: x.kaleidoscope, macroMode: x.macroMode, macroZoom: x.macroZoom, renderStyle: x.renderStyle };
    });
    return `kaleido ${s.kaleidoscope}, macro ${s.macroMode} x${(s.macroZoom ?? 1).toFixed(1)}, ${s.renderStyle}`;
  } },
  { weight: 1, name: 'desk action', run: async (page) => {
    const a = pick(['seed', 'automate-toggle', 'spin-front', 'macro-toggle']);
    await page.evaluate((x) => window.chromaglassAction?.(x), a);
    return a;
  } },
];
const bag = actions.flatMap(a => Array(a.weight).fill(a));

const browser = await launchChromium(chromium);
let died = false;
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await page.addInitScript(() => { try { localStorage.setItem('chromaglass-audio-source', 'simulated'); } catch {} });
  await installFrameReader(page);
  await page.goto(`http://localhost:${port}/?debug&gpu=mid&tier=local&look=${LOOK}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  console.log(`  ${LOOK}, worked for ${MINUTES} minutes (seed ${SEED})\n`);

  const log = [];
  const baseline = [];
  let over = 0;
  const until = Date.now() + MINUTES * 60000;
  while (Date.now() < until) {
    const a = pick(bag);
    let detail = '';
    try { detail = await a.run(page); } catch (e) { detail = `threw: ${String(e).slice(0, 60)}`; }
    await page.waitForTimeout(1800 + Math.floor(rnd() * 2600));

    const px = await frameOf(page, 320, 200);
    if (!px) throw new Error(`could not photograph: ${JSON.stringify(await page.evaluate(() => window.__cgFrameLast))}`);
    const j = judge(px);
    /*
      The dye on every line, not only at the death.

      One run ended at 100% black with the plate holding *nothing* — 0.00 dye,
      0% wet, no colours at all — five seconds after reading 16%. A plate that
      empties and a plate that drowns look identical in the frame once they
      are dark, and the difference is the whole diagnosis, so it belongs on
      every line rather than on the last one.
    */
    const dyeNow = await page.evaluate(() => {
      const d = window.chromaglassDebug();
      const target = d.settings.macroMode ? 0.28 : Math.max(0.1, Math.min(1.2, d.settings.dyeBudget ?? 0.85));
      return { mean: d.fluids?.[0]?.meanDensity ?? -1, target };
    });
    const t = Math.round((MINUTES * 60000 - (until - Date.now())) / 1000);
    log.push({ t, what: `${a.name}: ${detail}`, flat: j.flat, luma: j.luma, rgb: j.rgb, dye: dyeNow.mean, target: dyeNow.target });
    if (log.length > 40) log.shift();

    if (baseline.length < 14) baseline.push(j.flat);
    const settled = [...baseline].sort((x, y) => x - y)[Math.floor(baseline.length / 2)] ?? j.flat;
    /*
      Half the frame, because that is what was reported.

      "The entire screen yellow", "covered the view port". The catches that
      were plainly that are 96%, 100% and 52-62% of the frame in one colour.
      A bar set at 30% also fires on a blue-dominant moment of a working
      plate, and two of those were chased as failures before this was noticed
      — the cost of a detector tuned tighter than the thing it is detecting.
    */
    const bad = baseline.length >= 10 && (j.flat > Math.max(0.5, settled + 0.35) || j.luma < 0.03);
    over = bad ? over + 1 : 0;
    process.stdout.write(`  ${String(t).padStart(4)}s  ${(j.flat * 100).toFixed(0).padStart(3)}%  ` +
      `${j.luma.toFixed(3)}  dye ${dyeNow.mean.toFixed(2)}/${dyeNow.target.toFixed(2)}  ` +
      `rgb(${j.rgb.join(',')})  ${a.name}: ${detail}\n`);

    if (over < 2 && j.flat <= 0.9) continue;
    died = true;
    console.log(`\n  THE PICTURE DIED at ${t}s, ${(j.flat * 100).toFixed(0)}% of it rgb(${j.rgb.join(',')}).`);
    console.log('  The last dozen things done to it:');
    for (const e of log.slice(-12)) {
      console.log(`    ${String(e.t).padStart(4)}s  ${(e.flat * 100).toFixed(0).padStart(3)}%  ` +
        `dye ${(e.dye ?? -1).toFixed(2)}/${(e.target ?? 0).toFixed(2)}  ${e.what}`);
    }
    const state = await page.evaluate(() => {
      const d = window.chromaglassDebug();
      const target = d.settings.macroMode ? 0.28 : Math.max(0.1, Math.min(1.2, d.settings.dyeBudget ?? 0.85));
      return {
        budget: { mean: d.fluids?.[0]?.meanDensity ?? null, target },
        flash: d.flash ?? null,
        layers: (d.fluids ?? []).map((f, i) => {
          const dye = f?.gpu?.rbDyeView;
          if (!dye) return { layer: i, read: false };
          let wet = 0, peak = 0;
          const bins = new Map();
          for (let k = 0; k < dye.length; k += 4) {
            const al = dye[k + 3];
            if (al > peak) peak = al;
            if (al < 0.05) continue;
            wet++;
            const key = (((Math.min(255, dye[k] / al * 255) | 0) >> 4) << 8) |
                        (((Math.min(255, dye[k + 1] / al * 255) | 0) >> 4) << 4) |
                        ((Math.min(255, dye[k + 2] / al * 255) | 0) >> 4);
            bins.set(key, (bins.get(key) ?? 0) + 1);
          }
          let top = 0; for (const v of bins.values()) if (v > top) top = v;
          return { layer: i, read: true, peak, wetShare: wet / (dye.length / 4), colours: bins.size, dominant: wet ? top / wet : 0 };
        }),
      };
    });
    console.log(`\n  dye ${state.budget.mean?.toFixed(2)} against a budget of ${state.budget.target.toFixed(2)}` +
      ` — ${(state.budget.mean / state.budget.target).toFixed(2)}x`);
    if (state.flash) console.log(`  flash guard: engaged ${state.flash.engaged}, gain ${state.flash.gain.toFixed(3)}`);
    for (const L of state.layers) {
      if (L.read) console.log(`  layer ${L.layer}: peak ${L.peak.toFixed(2)}, ${(L.wetShare * 100).toFixed(0)}% wet, ` +
        `${L.colours} colours, commonest ${(L.dominant * 100).toFixed(0)}%`);
    }
    const png = await page.evaluate(async () => {
      const shot = await window.__cgShot('gig');
      if (!shot) return null;
      const c = document.createElement('canvas');
      c.width = shot.w; c.height = shot.h;
      c.getContext('2d').putImageData(window.__shots.gig, 0, 0);
      return c.toDataURL('image/png');
    });
    if (png) { writeFileSync('/tmp/gig-died.png', Buffer.from(png.slice(png.indexOf(',') + 1), 'base64')); console.log('  picture: /tmp/gig-died.png'); }
    break;
  }
} finally { await browser.close(); stop(); }
console.log(died ? '\nreproduced' : `\n${MINUTES} minutes of being worked, and it held`);
process.exit(died ? 1 : 0);
