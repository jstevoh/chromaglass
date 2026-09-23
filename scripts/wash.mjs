#!/usr/bin/env node
/**
 * Does a plate with no new dye blend itself to one colour?
 *
 *   npm run wash
 *
 * `npm run evolve` found a flat plate that is not the backdrop: 96% of the
 * frame one purple, renderStyle `show`, the two paper colours far apart, and
 * 0.45 of dye still on the plate. The roll replays as a very slow plate
 * (globalSpeed 0.0094) that almost never pours (automateRate 0.0099) —
 * so what is on the glass is stirred for a minute with nothing new arriving.
 *
 * The question this asks is whether that is homogenisation: whether colour
 * variety falls away over time on a plate that is not being poured on. Two
 * liquids that refuse each other cannot do that, which is §I of
 * `docs/bubbles-plan.md` — there is one dye field and mixing averages it.
 *
 * It reports rather than gates, because what it measures is a known open
 * question and not a regression.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { installFrameReader, frameOf } from './frame.mjs';
import { readFileSync } from 'node:fs';

const PORT = 4346;
const IMM = process.env.WASH_IMM;
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let up = true, leaving = false;
server.on('exit', (c) => {
  up = false;
  // Only a surprise before we asked it to go; the deliberate kill at the end
  // lands here too and used to print a scary line under a clean run.
  if (leaving) return;
  console.error(`\npreview exited (${c}) — port ${PORT} busy?`); process.exit(2);
});
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));
if (!up) process.exit(2);

const judge = (px) => {
  const bins = new Map();
  let tot = 0, sat = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    bins.set(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4), 1);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 40 && (mx - mn) / mx > 0.25) sat++;
    tot++;
  }
  const counts = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let top = 0;
  for (const v of counts.values()) if (v > top) top = v;
  return { flat: top / tot, buckets: bins.size, colours: sat / tot };
};

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${process.env.WASH_BASE ?? 'fillmore-1969'}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  /*
    The whole rolled look, not a selection from it.

    The first version of this applied the nine settings that looked like they
    mattered and the plate stayed at 74% — nothing like the 96% that was
    reported. Fifty-five settings differ in that roll and there was no reason
    to think the other forty-six were passengers. `npm run replay` writes the
    look out; this puts all of it on the plate.
  */
  const look = JSON.parse(readFileSync(process.env.WASH_LOOK, 'utf8'));
  await page.evaluate(([l, imm]) => {
    Object.assign(window.chromaglassDebug().settings, l);
    if (imm !== null) window.chromaglassDebug().settings.blobSurfaceTension = imm;
  }, [look, IMM === undefined ? null : Number(IMM)]);

  console.log(`  a plate poured on almost never${IMM === undefined ? '' : `, immiscibility ${IMM}`}\n`);
  console.log('   at      flat%   buckets   colours');
  console.log('  ' + '-'.repeat(38));
  for (const t of [3, 15, 30, 45, 60, 75, 90]) {
    await page.waitForTimeout(t === 3 ? 3000 : 15000);
    const px = await frameOf(page, 320, 200);
    if (!px) throw new Error(`could not photograph the plate: ${JSON.stringify(await page.evaluate(() => window.__cgFrameLast))}`);
    const j = judge(px);
    const dye = await page.evaluate(() => {
      const a = window.chromaglassDebug()?.fluids?.[0]?.readDensity;
      if (!a) return -1;
      let s = 0; for (let i = 0; i < a.length; i++) s += a[i];
      return s / a.length;
    });
    console.log(`  ${String(t).padStart(3)}s   ${(j.flat * 100).toFixed(0).padStart(4)}%    ${String(j.buckets).padStart(4)}     ${(j.colours * 100).toFixed(0).padStart(3)}%   dye ${dye.toFixed(2)}`);
  }
} finally { await browser.close(); stop(); }
