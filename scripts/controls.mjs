#!/usr/bin/env node
/**
 * Does every control do something you can see, on every look, and undo it?
 *
 *   npm run controls                         the Perform rides and the candidates, every look
 *   CONTROLS_MODE=all npm run controls       every control on the desk's list, a few looks
 *   CONTROLS_LOOKS=classic,galaxy            just these looks
 *   CONTROLS_KEYS=globalSpeed,dimmer         just these controls
 *   CONTROLS_SHARD=2/5                       this runner's share of the looks (or, in `all`, the controls)
 *
 * Asked for: "a comprehensive evaluation of the presets and the various
 * controls to make sure everything works really well and looks awesome. We've
 * changed how all of the fluids work." A control is judged as a performer
 * feels it:
 *
 *   visible     turned from the look's own value to the far end of its range,
 *               the picture changes by more than the plate changes on its own
 *               in the same time (brightness, colourfulness, colour cast,
 *               flatness, how much it moves, how much fine detail it has)
 *   reversible  put back, the picture comes back rather than staying where
 *               the control left it
 *   safe        at the far end the plate is neither black, one flat colour,
 *               nor poisoned (cells that are not a number)
 *
 * The plate is chaotic, so nothing here compares pixels: each reading is a
 * handful of numbers about the whole frame, and each look first has its own
 * drift measured with nothing touched, which is the noise every effect is
 * judged against. The simulated band plays throughout, because a show has
 * music and half the rides follow it.
 *
 * Writes controls/<mode>-<shard>.json and a sheet per look (controls/<look>.jpg)
 * with the look as it was and at each control's far end, side by side.
 *
 * Needs a GPU that presents WebGPU: the macOS runner, .github/workflows/controls.yml.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './chromium.mjs';
import { PRESETS } from '../src/presets.ts';
import { PINNABLE, PIN_RANGE } from '../src/lib/deskPins.ts';
import { DEFAULT_RIDES } from '../src/components/desk/PerformDesk.tsx';
import { engineQuery, installFrameReader, frameOf } from './frame.mjs';
import { readingOf } from './judge.mjs';

const PORT = Number(process.env.CONTROLS_PORT ?? 4345);
const OUT = process.env.CONTROLS_OUT ?? 'controls';
const MODE = process.env.CONTROLS_MODE === 'all' ? 'all' : 'rides';
const WAIT = Number(process.env.CONTROLS_WAIT ?? 2500);
const SETTLE = Number(process.env.CONTROLS_SETTLE ?? 9000);
const [shardI, shardN] = (process.env.CONTROLS_SHARD ?? '1/1').split('/').map(Number);
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);

/*
  The rides, and the controls that were or could be rides: judged on every
  look, because a ride has to work whatever is up. In `all`, every control
  the desks can carry, on a few looks that between them have a camera, a
  second layer, ferrofluid and the new physics on.
*/
const CANDIDATES = ['vorticityConfinement', 'plateUpright', 'rotationSpeed', 'audioImpact',
  'saturationBoost', 'bubbles', 'fingering', 'lacing', 'ferroLabyrinth', 'tempoSync'];
const RIDE_KEYS = [...new Set([...DEFAULT_RIDES.map(String), ...CANDIDATES])].filter((k) => PIN_RANGE.has(k));
const ALL_KEYS = PINNABLE.map((s) => String(s.key));
const ALL_LOOKS = ['classic', 'oil-on-water', 'magnet-garden', 'lava-lamp'];

let keys = list(process.env.CONTROLS_KEYS) ?? (MODE === 'all' ? ALL_KEYS : RIDE_KEYS);
let looks = (list(process.env.CONTROLS_LOOKS) ?? (MODE === 'all' ? ALL_LOOKS : PRESETS.map((p) => p.id)))
  .filter((id) => PRESETS.some((p) => p.id === id));
// The share: looks for the rides (every look is its own page), controls for `all`.
const share = (xs) => xs.filter((_, i) => i % shardN === shardI - 1);
if (MODE === 'all') keys = share(keys); else looks = share(looks);

fs.mkdirSync(OUT, { recursive: true });

const W = 240, H = 150;
const METRICS = ['luma', 'colours', 'flat', 'motion', 'detail', 'cast'];
/*
  The least change a person would call a change, whatever the noise: so a
  look that happens to hold perfectly still does not make a hair's breadth
  of difference read as "visible".
*/
const FLOOR = { luma: 0.02, colours: 0.03, flat: 0.03, motion: 0.003, detail: 0.004, cast: 0.02 };

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let leaving = false;
server.on('exit', (code) => { if (!leaving) { console.error(`preview server exited (${code})`); process.exit(2); } });
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

const results = [];
const browser = await launchChromium(chromium);
try {
  console.log(`  ${MODE}: ${keys.length} controls × ${looks.length} looks (shard ${shardI}/${shardN}), ${WAIT} ms a reading\n`);
  for (const id of looks) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    /*
      With the simulated band playing, as a show is. The first run was
      silent, and a silent plate is a different app: the looks the music
      pours (Stardust Collapse) drained to black, and every ride that follows
      the beat (Beat Squeeze, Plate Rock, Sound Drive, Tempo Sync) read as
      doing nothing because there was no beat.
    */
    await page.addInitScript(() => { try { localStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private window */ } });
    await installFrameReader(page);
    await page.goto(`http://localhost:${PORT}/?debug&gpu=strong&tier=local&look=${id}${engineQuery()}`, { waitUntil: 'load' });
    await page.mouse.click(8, 8);   // the gesture the band needs: the rides that follow the beat need a beat
    await page.evaluate(() => document.body.classList.add('overlays-hidden'));
    await page.waitForTimeout(SETTLE);

    const set = (patch) => page.evaluate((p) => window.chromaglassSettings?.(p), patch);
    const current = (k) => page.evaluate((key) => window.chromaglassDebug?.().settings?.[key], k);
    const health = () => page.evaluate(() => (window.chromaglassDebug?.().plateStats?.() ?? []).reduce((n, p) => n + (p.nan ?? 0), 0));
    /** One reading: two frames a moment apart, for the picture and for how much it moved. */
    const read = async (keepAs = null) => {
      const a = await frameOf(page, W, H);
      await page.waitForTimeout(150);
      const b = await frameOf(page, W, H);
      if (!a || !b) return null;
      const out = readingOf(a, b, W, H);
      if (keepAs) {
        out.thumb = await page.evaluate(([px, w, h]) => {
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0);
          return c.toDataURL('image/jpeg', 0.8);
        }, [Array.from(b), W, H]);
      }
      return out;
    };
    const readAfter = async (keep) => { await page.waitForTimeout(WAIT); return read(keep); };

    // The look's own drift, with nothing touched: the noise every effect is judged against.
    const idle = [];
    for (let k = 0; k < 4; k++) idle.push(await readAfter(k === 0 ? 'base' : null));
    if (idle.some((r) => !r)) { console.log(`  ${id}: could not photograph`); await page.close(); continue; }
    const noise = {};
    for (const m of METRICS) {
      let d = 0;
      for (let k = 1; k < idle.length; k++) d = Math.max(d, Math.abs(idle[k][m] - idle[k - 1][m]));
      noise[m] = d;
    }
    const lookRow = { id, noise, base: idle[0], controls: [] };
    console.log(`  ${id}: luma ${idle[0].luma.toFixed(3)} colours ${(idle[0].colours * 100).toFixed(0)}% flat ${(idle[0].flat * 100).toFixed(0)}% motion ${idle[0].motion.toFixed(4)} detail ${idle[0].detail.toFixed(4)}`);

    for (const key of keys) {
      const spec = PIN_RANGE.get(key);
      const v0raw = await current(key);
      if (!spec || typeof v0raw !== 'number') continue;
      const v0 = v0raw;
      // The far end of the range from where the look has it.
      const far = Math.abs(spec.max - v0) >= Math.abs(v0 - spec.min) ? spec.max : spec.min;
      /*
        Evolve Speed does nothing with Random Evolve off, so the desk's ride
        switches it on when raised from zero and off at zero (PerformDesk).
        The harness does what the ride does.
      */
      const evolve = key === 'automateRate';
      const a0 = await read();
      await set({ [key]: far });
      if (evolve) await page.evaluate(() => window.chromaglassAction?.('automate-toggle'));
      await page.waitForTimeout(WAIT);
      const b2 = await readAfter('far');
      const nanAtFar = await health();
      await set({ [key]: v0 });
      if (evolve) await page.evaluate(() => window.chromaglassAction?.('automate-toggle'));
      const a1 = await readAfter(null);
      if (!a0 || !b2 || !a1) continue;
      let best = null;
      /*
        Judged where it has got to (b2), against the look's own drift. The
        first version also demanded two readings at the far end agree, and a
        control that glides there (Macro Zoom, a dolly over seconds) was
        still moving between them, so a plainly different picture read as
        "nothing".
      */
      for (const m of METRICS) {
        const b = b2[m];
        const d = Math.abs(b - a0[m]);
        const threshold = Math.max(FLOOR[m], 2 * noise[m]);
        const score = d / threshold;
        if (!best || score > best.score) {
          const back = d > 0 ? 1 - Math.abs(a1[m] - a0[m]) / d : 1;
          best = { metric: m, from: a0[m], to: b, score, back };
        }
      }
      const visible = best.score >= 1;
      const reversible = !visible || best.back >= 0.4;
      const faults = [];
      // The dimmer's far end is a blackout, which is what it is for.
      if (b2.luma < 0.015 && key !== 'dimmer') faults.push('black');
      if (b2.flat > 0.85 && key !== 'dimmer') faults.push('flat');
      if (nanAtFar > 0) faults.push(`NaN×${nanAtFar}`);
      const row = { key, label: spec.label, v0, far, visible, reversible, faults, ...best, thumb: b2.thumb };
      lookRow.controls.push(row);
      console.log(`    ${spec.label.padEnd(22)} ${String(+v0.toFixed(3)).padStart(6)}→${String(+far.toFixed(3)).padEnd(6)} ` +
        `${visible ? 'VISIBLE ' : 'nothing '} ${best.metric.padEnd(7)} ${best.from.toFixed(3)}→${best.to.toFixed(3)} (×${best.score.toFixed(1)})` +
        `${visible ? (reversible ? ', comes back' : `, STAYS (${(best.back * 100).toFixed(0)}% back)`) : ''}` +
        `${faults.length ? `  ${faults.join(' ').toUpperCase()}` : ''}`);
    }
    results.push(lookRow);

    // The sheet: the look, then each control at its far end.
    const cells = [`<td><img src="${idle[0].thumb}"><small>${id} as laid</small></td>`,
      ...lookRow.controls.map((c) => `<td class="${c.visible ? '' : 'dead'}"><img src="${c.thumb}"><small>${c.label} → ${+c.far.toFixed(3)}${c.visible ? '' : ' · nothing'}${c.faults.length ? ` · ${c.faults.join(' ')}` : ''}</small></td>`)];
    const rowsHtml = [];
    for (let i = 0; i < cells.length; i += 6) rowsHtml.push(`<tr>${cells.slice(i, i + 6).join('')}</tr>`);
    const sheet = await browser.newPage({ viewport: { width: 6 * (W + 8), height: 400 } });
    await sheet.setContent(`<html><body style="margin:0;background:#111;color:#ddd;font:11px system-ui">
      <style>td{padding:3px;vertical-align:top}img{width:${W}px;display:block}.dead img{opacity:.45}</style>
      <table>${rowsHtml.join('')}</table></body></html>`, { waitUntil: 'load' });
    await sheet.screenshot({ path: path.join(OUT, `${id}${MODE === 'all' ? `-${shardI}` : ''}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
    await sheet.close();
    await page.close();
  }
} finally {
  await browser.close();
  stop();
}

for (const r of results) { delete r.base.thumb; for (const c of r.controls) delete c.thumb; }
fs.writeFileSync(path.join(OUT, `${MODE}-${shardI}.json`), JSON.stringify(results, null, 1));

// The summary a person reads first: each control across the looks.
console.log('\n  control                 visible   stays   faults');
const byKey = new Map();
for (const r of results) for (const c of r.controls) {
  const e = byKey.get(c.key) ?? { label: c.label, n: 0, vis: 0, stays: [], faults: [], dead: [] };
  e.n++; if (c.visible) e.vis++; else e.dead.push(r.id);
  if (!c.reversible) e.stays.push(r.id);
  if (c.faults.length) e.faults.push(`${r.id}:${c.faults.join('+')}`);
  byKey.set(c.key, e);
}
for (const [, e] of byKey) {
  console.log(`  ${e.label.padEnd(22)} ${String(e.vis).padStart(3)}/${e.n}   ${String(e.stays.length).padStart(4)}    ${e.faults.join(' ')}`);
  if (e.dead.length && e.dead.length < e.n) console.log(`      nothing on: ${e.dead.join(', ')}`);
  if (e.stays.length) console.log(`      stays on: ${e.stays.join(', ')}`);
}
