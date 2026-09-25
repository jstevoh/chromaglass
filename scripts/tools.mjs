#!/usr/bin/env node
/**
 * Does every tool in the hand do what it says, and nothing else?
 *
 *   npm run tools
 *
 * Asked for: "check all of the tools to make sure they work in expected
 * ways", after the Magnet turned out to be fighting a press and a stir the
 * pointer applied under every tool. Each tool is used through the real
 * pointer on a calm, cleared plate, and the dye on the lead plate is read
 * back and measured around where the hand was:
 *
 *   hover       moving across the plate with no button down changes nothing
 *   Drop        lays dye where it is held
 *   Pour        lays more than Drop, and spreads it out from where it lands
 *   Spray       lays a wider, finer mist than Drop
 *   Splat       flings dye round the hand
 *   Streak      lays dye along the stroke
 *   Finger      carries dye along the stroke, adds none, and stops when the
 *               hand stops (it used to go on pushing while held still)
 *   Blow        clears dye from under it
 *   Press       pushes dye out from under the palm into a ring, keeping it
 *
 * The Magnet has its own check (npm run magnet).
 *
 * Needs a GPU that presents WebGPU: the macOS runner, in checks.yml.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery } from './frame.mjs';

const PORT = 4346;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(8000);

  // A calm plate: nothing moves the dye but the hand. The music would pour,
  // the turbulence and the turning would carry, the drips would streak.
  const calm = {
    rotationSpeed: 0, turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0,
    rainDrip: 0, glassSmear: 0, vibrationFrequency: 0, centerGravity: 0, bubbles: 0, beads: 0,
    audioMappings: { velocity: 'none', density: 'none', color: 'none', rotation: 'none' },
  };
  await page.evaluate((c) => window.chromaglassSettings?.(c), calm);
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const screen = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  const tool = (t) => page.evaluate((t) => window.chromaglassTool?.(t), t);
  const clear = async () => { await page.evaluate(() => window.chromaglassAction?.('clear')); await page.waitForTimeout(2500); };
  const settle = (ms) => page.waitForTimeout(ms);

  /** The lead plate's density, and where the pointer is on it (grid cells). */
  const snap = (keep) => page.evaluate((keep) => {
    const d = window.chromaglassDebug();
    const f = d.fluids?.[0];
    (window.__toolSnaps ??= {})[keep] = { n: d.gridSize, data: Float32Array.from(f.readDensity) };
    return d.pointer();
  }, keep);
  /**
   * Dye in a disc round a point and in the ring outside it, the total on the
   * plate, and the centre of mass; `at` in grid cells, radii in plate widths.
   */
  const measure = (keep, at, r = 0.07, ring = 0.16) => page.evaluate(({ keep, at, r, ring }) => {
    const s = window.__toolSnaps[keep];
    const n = s.n; let disc = 0, out = 0, total = 0, cx = 0, cy = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = Math.max(0, s.data[x + y * n]);
      if (!Number.isFinite(v)) continue;
      total += v; cx += v * x; cy += v * y;
      const dist = Math.hypot(x - at.x, y - at.y) / n;
      if (dist < r) disc += v; else if (dist < ring) out += v;
    }
    return { disc, ring: out, total, cx: total ? cx / total / n : 0, cy: total ? cy / total / n : 0 };
  }, { keep, at, r, ring });

  const A = [0.42, 0.5], B = [0.58, 0.5];
  const hold = async (t, at, ms) => {
    await tool(t);
    await page.mouse.move(...screen(...at));
    await page.mouse.down();
    await settle(ms);
    await page.mouse.up();
  };
  const stroke = async (t, from, to, ms, stay = 0) => {
    await tool(t);
    await page.mouse.move(...screen(...from));
    await page.mouse.down();
    const n = 30;
    for (let i = 1; i <= n; i++) {
      await page.mouse.move(...screen(from[0] + (to[0] - from[0]) * i / n, from[1] + (to[1] - from[1]) * i / n));
      await settle(ms / n);
    }
    if (stay) { await snap('stroked'); await settle(stay); }
    await page.mouse.up();
  };
  /** Lay a pool of dye at a point to work on, and let it settle. */
  const pool = async (at) => { await hold('dropper', at, 1500); await settle(1500); };

  // ── Hover ────────────────────────────────────────────────────────
  await clear();
  await pool(A);
  await snap('idle0');
  await settle(2000);
  const at = await (async () => { await page.mouse.move(...screen(...A)); return page.evaluate(() => window.chromaglassDebug().pointer()); })();
  await snap('idle1');
  // The same two seconds with the pointer swept back and forth over the pool, no button.
  for (let i = 0; i < 40; i++) { await page.mouse.move(...screen(A[0] + 0.06 * Math.sin(i / 3), A[1] + 0.04 * Math.cos(i / 4))); await settle(50); }
  await snap('hover');
  const i0 = await measure('idle0', at), i1 = await measure('idle1', at), hv = await measure('hover', at);
  const idleMove = Math.abs(i1.disc - i0.disc), hoverMove = Math.abs(hv.disc - i1.disc);
  check('moving over the plate with no button down leaves it alone',
    hoverMove <= Math.max(2, 2 * idleMove) + 0.05 * i1.disc,
    `dye under the pointer ${i1.disc.toFixed(0)} → ${hv.disc.toFixed(0)} hovering, ${i0.disc.toFixed(0)} → ${i1.disc.toFixed(0)} left alone`);

  // ── The pouring tools ───────────────────────────────────────────
  const laid = {};
  for (const [t, ms] of [['dropper', 1200], ['pour', 1200], ['spray', 1200], ['splatter', 1200]]) {
    await clear();
    await page.mouse.move(...screen(...A));
    const p = await snap(`${t}0`);
    await hold(t, A, ms);
    await settle(700);
    await snap(`${t}1`);
    const a = await measure(`${t}0`, p), b = await measure(`${t}1`, p);
    laid[t] = { disc: b.disc - a.disc, ring: b.ring - a.ring, total: b.total - a.total };
    console.log(`     ${t.padEnd(8)} laid ${laid[t].total.toFixed(0)}: ${laid[t].disc.toFixed(0)} within 0.07 of the hand, ${laid[t].ring.toFixed(0)} from 0.07 to 0.16`);
  }
  check('Drop lays dye where it is held', laid.dropper.disc > 5 && laid.dropper.disc > 0.6 * laid.dropper.total,
    `${laid.dropper.disc.toFixed(0)} of ${laid.dropper.total.toFixed(0)} within 0.07`);
  check('Pour lays more than Drop', laid.pour.total > 1.3 * laid.dropper.total,
    `${laid.pour.total.toFixed(0)} against ${laid.dropper.total.toFixed(0)}`);
  check('and spreads it out from where it lands', laid.pour.ring / laid.pour.total > laid.dropper.ring / Math.max(1e-6, laid.dropper.total),
    `${(100 * laid.pour.ring / laid.pour.total).toFixed(0)}% beyond 0.07, against Drop's ${(100 * laid.dropper.ring / Math.max(1e-6, laid.dropper.total)).toFixed(0)}%`);
  check('Spray lays a wider mist than Drop', laid.spray.total > 5 && laid.spray.ring / laid.spray.total > laid.dropper.ring / Math.max(1e-6, laid.dropper.total),
    `${(100 * laid.spray.ring / Math.max(1e-6, laid.spray.total)).toFixed(0)}% beyond 0.07`);
  check('Splat flings dye round the hand', laid.splatter.total > 5 && laid.splatter.disc + laid.splatter.ring > 0.7 * laid.splatter.total,
    `${laid.splatter.total.toFixed(0)} laid, ${(100 * (laid.splatter.disc + laid.splatter.ring) / Math.max(1e-6, laid.splatter.total)).toFixed(0)}% within 0.16`);

  // ── Streak ──────────────────────────────────────────────────────
  await clear();
  await page.mouse.move(...screen(...A));
  const s0 = await snap('streak0');
  await stroke('streak', A, B, 1200);
  await settle(700);
  await snap('streak1');
  const pB = await (async () => { await page.mouse.move(...screen(...B)); return page.evaluate(() => window.chromaglassDebug().pointer()); })();
  const mid = { x: (s0.x + pB.x) / 2, y: (s0.y + pB.y) / 2 };
  const st0 = await measure('streak0', mid, 0.1), st1 = await measure('streak1', mid, 0.1);
  check('Streak lays dye along the stroke', st1.disc - st0.disc > 5 && st1.disc - st0.disc > 0.5 * (st1.total - st0.total),
    `${(st1.disc - st0.disc).toFixed(0)} of ${(st1.total - st0.total).toFixed(0)} within 0.1 of the stroke's middle`);

  // ── Finger ──────────────────────────────────────────────────────
  await clear();
  await pool(A);
  const f0p = await snap('finger0');
  await stroke('finger', A, B, 1500, 1500);
  await settle(700);
  await snap('finger1');
  const fa = await measure('finger0', f0p), fs = await measure('stroked', f0p), fb = await measure('finger1', f0p);
  const moved = Math.hypot(fs.cx - fa.cx, fs.cy - fa.cy);
  const drift = Math.hypot(fb.cx - fs.cx, fb.cy - fs.cy);
  // Toward B on the plate: B's grid point less A's.
  const dirB = { x: pB.x - f0p.x, y: pB.y - f0p.y };
  const along = ((fs.cx - fa.cx) * dirB.x + (fs.cy - fa.cy) * dirB.y) / Math.max(1e-6, Math.hypot(dirB.x, dirB.y));
  check('Finger carries the dye along the stroke', along > 0.005,
    `centre of mass moved ${(along * 100).toFixed(1)}% of the plate toward where the stroke went`);
  check('and adds none', Math.abs(fb.total - fa.total) < 0.15 * fa.total,
    `${fa.total.toFixed(0)} → ${fb.total.toFixed(0)}`);
  check('and stops when the hand stops', drift < Math.max(0.003, 0.5 * moved),
    `${(moved * 100).toFixed(1)}% moved during the stroke, ${(drift * 100).toFixed(1)}% while held still after it`);

  // ── Blow and Press ──────────────────────────────────────────────
  for (const t of ['blow', 'press']) {
    await clear();
    await pool(A);
    const p = await snap(`${t}0`);
    await hold(t, A, 1500);
    await settle(700);
    await snap(`${t}1`);
    const a = await measure(`${t}0`, p, 0.05, 0.14), b = await measure(`${t}1`, p, 0.05, 0.14);
    if (t === 'blow') {
      check('Blow clears the dye from under it', b.disc < 0.7 * a.disc,
        `${a.disc.toFixed(0)} → ${b.disc.toFixed(0)} within 0.05 of the hand`);
    } else {
      check('Press pushes the dye out from under the palm', b.disc < 0.8 * a.disc && b.ring > a.ring,
        `${a.disc.toFixed(0)} → ${b.disc.toFixed(0)} under it, ${a.ring.toFixed(0)} → ${b.ring.toFixed(0)} in the ring round it`);
      check('and keeps it', Math.abs(b.total - a.total) < 0.15 * a.total, `${a.total.toFixed(0)} → ${b.total.toFixed(0)}`);
    }
  }
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
