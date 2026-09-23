#!/usr/bin/env node
/**
 * Every look, drawn, and asked whether it is a picture.
 *
 *   npm run looks
 *
 * `plate.mjs` checks what the presets *declare* — that every dye exists, every
 * liquid is real, every style is one the solver knows. Nothing has ever drawn
 * them. So a look could name everything correctly and still come up as a flat
 * colour, a black frame or an empty dish, and no check would say so.
 *
 * Reported from the front, more than once: "the entire plate goes to a single
 * colour". This is the harness that can catch that, and it asks four things of
 * every look in the menu:
 *
 *   flat      is most of the frame one colour? (the reported fault)
 *   empty     is there dye on the plate at all?
 *   dark      is there light in the frame?
 *   drained   does it still have dye a minute in, or does it dry out?
 *
 * Each look gets its own page load, because that is how a person opens one.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { PRESETS } from '../src/presets.ts';
import { engineQuery, installFrameReader, frameOf } from './frame.mjs';

const PORT = 4342;
const ONLY = process.env.LOOKS_ONLY ? process.env.LOOKS_ONLY.split(',') : null;
const SETTLE = Number(process.env.LOOKS_SETTLE ?? 11000);
const LATE = Number(process.env.LOOKS_LATE ?? 14000);

const rows = [];
const bad = [];

/**
 * How much of a frame is one colour, how lit it is, and how much of it has
 * any colour in it at all.
 *
 * Bucketed coarsely — four bits a channel — because a flat plate is not
 * bit-identical: a gradient backdrop, dither and grain all move the low bits
 * while the picture is, to a person, one colour.
 */
const judge = (px) => {
  const bins = new Map();
  let tot = 0, lum = 0, sat = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    bins.set(k, (bins.get(k) ?? 0) + 1);
    lum += 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 40 && (mx - mn) / mx > 0.25) sat++;
    tot++;
  }
  let top = 0;
  for (const v of bins.values()) if (v > top) top = v;
  return { flat: top / tot, luma: lum / tot / 255, colours: sat / tot };
};

/*
  The control, run before anything is measured.

  A sweep that reports "all 32 looks draw a picture" is worth exactly as much
  as the measure behind it, and this repository has already shipped one check
  for this fault that could not fail — `evolve`'s flatness verdict, green and
  blind since the day it was written. So the measure is shown a frame that is
  one flat colour and a frame that is not, and it has to tell them apart
  before a single look is loaded.
*/
{
  const N = 320 * 200 * 4;
  const solid = new Uint8Array(N);
  for (let i = 0; i < N; i += 4) { solid[i] = 255; solid[i + 1] = 234; solid[i + 2] = 0; solid[i + 3] = 255; }
  const mixed = new Uint8Array(N);
  for (let i = 0; i < N; i += 4) {
    mixed[i] = (i * 7) & 255; mixed[i + 1] = (i * 13) & 255; mixed[i + 2] = (i * 29) & 255; mixed[i + 3] = 255;
  }
  const a = judge(solid), b = judge(mixed);
  if (!(a.flat > 0.99 && b.flat < 0.2)) {
    console.error(`the flatness measure cannot tell one colour from many: ` +
      `a solid yellow frame reads ${(a.flat * 100).toFixed(0)}% and a mixed one ${(b.flat * 100).toFixed(0)}%`);
    process.exit(2);
  }
  console.log(`  control: a solid frame reads ${(a.flat * 100).toFixed(0)}% flat, a mixed one ${(b.flat * 100).toFixed(0)}%`);
}

/*
  And if the port is taken, stop.

  The first full sweep printed `Port 4342 is already in use`, carried on, and
  measured all thirty-two looks against a server someone else had started —
  serving a build this run knows nothing about. It happened to be the right
  one. A sweep that silently grades a different build is the same fault as a
  check that cannot read: it produces a confident number about nothing.
*/
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let serverUp = true;
server.on('exit', (code) => {
  serverUp = false;
  console.error(`\nthe preview server exited (${code}) — port ${PORT} is probably already in use`);
  process.exit(2);
});
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));
if (!serverUp) process.exit(2);

const browser = await launchChromium(chromium);
try {
  const looks = PRESETS.filter(p => !ONLY || ONLY.includes(p.id));
  console.log(`  ${looks.length} looks, ${((SETTLE + LATE) / 1000).toFixed(0)}s each (judged ${(LATE / 1000).toFixed(0)}s after settling)\n`);
  console.log('  look                    flat%   dye    luma   colours  console');
  console.log('  ' + '-'.repeat(64));

  for (const preset of looks) {
    const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
    const errors = [];
    page.on('console', m => {
      if (m.type() !== 'error' && m.type() !== 'warning') return;
      const t = m.text();
      // Someone else's server having a bad day is not this app misbehaving.
      if (/lrclib|favicon|net::ERR|Failed to load resource/i.test(t)) return;
      errors.push(t.slice(0, 120));
    });
    await installFrameReader(page);
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${preset.id}${engineQuery()}`,
      { waitUntil: 'load' });
    await page.waitForTimeout(SETTLE);

    const dyeOf = () => page.evaluate(() => {
      const d = window.chromaglassDebug?.();
      const a = d?.fluids?.[0]?.readDensity;
      if (!a) return -1;
      let t = 0; for (let i = 0; i < a.length; i++) t += a[i];
      return t / a.length;
    });
    /*
      Judged late, not early.

      A look that dries the plate out still has the opening pour on it for the
      first few seconds, so an early frame is full of picture and nothing
      reads as flat. The complaint is a plate that has *become* one colour,
      and the reported case was around twenty-four seconds in — so the first
      reading is only kept to see which way the dye is going.
    */
    const early = await dyeOf();
    await page.waitForTimeout(LATE);
    const px = await frameOf(page, 320, 200);
    if (!px) {
      const why = await page.evaluate(() => window.__cgFrameLast);
      throw new Error(`could not photograph ${preset.id}: ${JSON.stringify(why)}`);
    }
    const { flat, luma, colours } = judge(px);
    const dye = await dyeOf();

    const faults = [];
    // Losing more than four fifths of the dye between the two readings is the
    // plate drying out, whatever the frame happens to look like at the end.
    if (early > 0.02 && dye >= 0 && dye < early * 0.2) faults.push('DRAINING');
    if (flat > 0.85) faults.push('FLAT');
    if (dye >= 0 && dye < 0.02) faults.push('EMPTY');
    if (luma < 0.015) faults.push('DARK');
    if (errors.length) faults.push(`console(${errors.length})`);
    rows.push({ id: preset.id, flat, dye, luma, colours, faults, errors });
    if (faults.length) bad.push(preset.id);

    console.log(`  ${preset.id.padEnd(22)} ${(flat * 100).toFixed(0).padStart(4)}%  ` +
      `${dye.toFixed(2).padStart(5)}  ${luma.toFixed(3)}  ${(colours * 100).toFixed(0).padStart(5)}%   ` +
      (faults.length ? faults.join(' ') : 'ok'));
    await page.close();
  }
} finally { await browser.close(); stop(); }

console.log('');
if (bad.length) {
  console.log(`${bad.length} of ${rows.length} looks have something wrong:\n`);
  for (const r of rows.filter(x => x.faults.length)) {
    console.log(`  ${r.id}: ${r.faults.join(', ')}`);
    for (const e of r.errors.slice(0, 3)) console.log(`      ${e}`);
  }
} else {
  console.log(`all ${rows.length} looks draw a picture`);
}
process.exit(bad.length ? 1 : 0);
