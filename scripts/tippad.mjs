#!/usr/bin/env node
/**
 * Can a hand tip the dish, on the desk and the phone? (PLAN 18a-13j)
 *
 *   npm run tippad
 *
 * What was reported. The owner, 2026-10-31: "I still haven't been able to try
 * the plate sloshing. I never saw the control to do that." The slosh had been
 * built since 18a-13, and the only way to play it from the desk was three
 * faders in a section no shipped tab puts out: Slosh (at 0 on every look),
 * Gravity, and Tilt Direction swept one way and back.
 *
 * The feature is the Tip pad (src/components/ui/TipPad.tsx, lib/tipPad.ts):
 * drag its dot toward an edge and that edge of the plate goes down, let go and
 * the dish lies back as it was. So this asserts what a hand does to the
 * plate's settings, on the built app in a browser, where the pad is:
 *
 *   it is there      on the Perform tab's Tools panel with nothing opened
 *                    (the report was that no control could be found), and in
 *                    the phone's Motion sheet, at a thumb's size;
 *   it tips          dragged toward the right edge, Gravity rises past 0.6 and
 *                    Tilt Direction reads 90 (the plate's compass: 0 the top,
 *                    90 the right); toward the top, 0; the arrow keys too;
 *   it sloshes       a first grab with Slosh at 0 puts it at half, since at 0
 *                    a tip only sinks the heavy colour slowly and the pad
 *                    would seem to do nothing;
 *   it lets go       released, Gravity and Tilt Direction are exactly the
 *                    look's own again, on a flat look and on Lava Lamp, whose
 *                    dish stands up (Gravity 1) and must not be left flat.
 *
 * What it cannot see: the liquid. What those settings do to the dish is the
 * solver's, measured by `npm run slosh` (the scheme) and `npm run sloshgpu`
 * (its kernels), and how it looks at sixty frames a second is the Mac's
 * (docs/judging.md §58, §64, and the film for this item). The arithmetic is
 * here too, in node: the pad's compass against the phone's Tilt
 * (lib/phone.ts `tiltReading`), so a drag and a tipped phone pour the same way.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';
import { padTilt, padDot, tipGrab, tipLetGo, tipMoved, keysTilt, TIP_SLOSH } from '../src/lib/tipPad.ts';
import { tiltReading } from '../src/lib/phone.ts';

const PORT = Number(process.env.TIPPAD_PORT ?? 4191);
/** The desk pad's travel for the plate stood fully up (its `reach`, components/desk/DeskPanels.tsx). */
const DESK_REACH = 72;
const URL = `http://localhost:${PORT}/?debug&dpr=0.35&play=0`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, tol) => Math.abs((((a - b) % 360) + 540) % 360 - 180) <= tol;

// ── 0. The arithmetic, in node ──
{
  const r = 50;
  const dirs = [[0, -r, 0], [r, 0, 90], [0, r, 180], [-r, 0, 270]].map(([x, y, want]) => ({ want, got: padTilt(x, y, r) }));
  check('the pad\'s compass is the plate\'s: the dot pulled to the top, right, bottom, left reads 0, 90, 180, 270 at full Gravity',
    dirs.every((d) => d.got.direction === d.want && d.got.upright === 1), dirs.map((d) => `${d.got.direction}@${d.got.upright}`).join(' '));
  const rest = padTilt(1, -2, r), gentle = padTilt(0, -0.15 * r, r), half = padTilt(0, -0.5 * r, r);
  check('a resting thumb tips nothing, a tenth of the way out barely tips, and Gravity grows toward the rim',
    rest.upright === 0 && gentle.upright > 0 && gentle.upright <= 0.02 && half.upright > 0.15 && half.upright < 0.35,
    `rest ${rest.upright}, 0.15 out ${gentle.upright}, half out ${half.upright}`);
  const back = [0.04, 0.3, 0.8, 1].map((u) => { const d = padDot(u, 135, r); return padTilt(d.x, d.y, r); });
  check('the dot at rest sits where the plate is tipped (padDot is padTilt backwards)',
    back.every((t, i) => Math.abs(t.upright - [0.04, 0.3, 0.8, 1][i]) <= 0.01 && t.direction === 135), back.map((t) => `${t.upright}@${t.direction}`).join(' '));
  // The phone tipped right edge down, and top edge down, from a level hold.
  const level = { beta: 45, gamma: 0 };
  const phoneRight = tiltReading({ beta: 45, gamma: 30 }, level), phoneTop = tiltReading({ beta: 15, gamma: 0 }, level);
  check('and it pours the way a tipped phone does: right edge down reads as the dot pulled right, top edge down as the dot pulled up',
    near(phoneRight.direction, padTilt(r, 0, r).direction, 1) && near(phoneTop.direction, padTilt(0, -r, r).direction, 1),
    `phone ${phoneRight.direction}° / ${phoneTop.direction}°, pad 90° / 0°`);
  const off = tipGrab({ slosh: 0, plateUpright: 0, tiltDirection: 180 }), up = tipGrab({ slosh: 0.3, plateUpright: 1, tiltDirection: 200 });
  check('a grab with Slosh off turns it to half, a grab with it up leaves it, and a let-go is the dish as it was taken',
    off.patch?.slosh === TIP_SLOSH && up.patch === null && tipLetGo(up.hold).plateUpright === 1 && tipLetGo(up.hold).tiltDirection === 200,
    `off → ${JSON.stringify(off.patch)}, 0.3 → ${JSON.stringify(up.patch)}`);
  check('a write only when the tip has moved (two hundredths, or three degrees while tipped)',
    !tipMoved({ upright: 0.5, direction: 90 }, { upright: 0.51, direction: 91 }) && tipMoved({ upright: 0.5, direction: 90 }, { upright: 0.5, direction: 94 })
      && tipMoved({ upright: 0.5, direction: 90 }, { upright: 0.52, direction: 90 }) && !tipMoved({ upright: 0, direction: 90 }, { upright: 0, direction: 180 }));
  const k = keysTilt(new Set(['ArrowLeft']), r), kk = keysTilt(new Set(['ArrowUp', 'ArrowRight']), r);
  check('the arrow keys tip toward their edge, two toward the corner, none not at all',
    padTilt(k.x, k.y, r).direction === 270 && padTilt(kk.x, kk.y, r).direction === 45 && keysTilt(new Set(), r) === null);
}

// ── The built app ──
const notes = [];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
await new Promise((resolve, reject) => {
  const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
  server.stdout.on('data', (d) => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
  server.stderr.on('data', (d) => { notes.push(String(d).trim()); });
  server.on('exit', (c) => { clearTimeout(bail); reject(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
});
process.on('exit', () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } });

const browser = await launchChromium(chromium, { headless: true });
const open = async (width, height, touch, look) => {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`${URL}&look=${look}`, { waitUntil: 'load' });
  const ready = touch ? 'phone-stage' : 'tip-pad';
  for (let i = 0; i < 80 && !(await page.getByTestId(ready).count()); i++) await page.waitForTimeout(250);
  // The look arrives a moment after the page; wait for its Gravity to be the look's.
  await page.waitForTimeout(1500);
  return { ctx, page };
};
const settingsOf = (page) => page.evaluate(() => {
  const s = window.chromaglassSettings?.();
  return s ? { u: s.plateUpright ?? 0, d: s.tiltDirection ?? 180, slosh: s.slosh ?? 0 } : null;
});
/**
  Hold the pad's dot at (fx, fy) of `travel` px from the middle (the pad's own
  radius if not given: the desk's keycap pad reads past its rim), read the
  settings while held, then let go and read them again.
*/
const drag = async (page, testId, fx, fy, travel) => {
  const b = await page.getByTestId(testId).first().boundingBox();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2, r = travel ?? b.width / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + (fx * r * i) / 8, cy + (fy * r * i) / 8); await page.waitForTimeout(30); }
  await page.waitForTimeout(250);
  const held = await settingsOf(page);
  await page.mouse.up();
  await page.waitForTimeout(300);
  return { held, after: await settingsOf(page) };
};

try {
  // ── 1. The desk, as it opens ──
  {
    const { ctx, page } = await open(1440, 900, false, 'classic');
    const seen = await page.evaluate(() => {
      const pad = document.querySelector('[data-testid="tip-pad"]');
      const r = pad?.getBoundingClientRect();
      const inTools = !!pad?.closest('[data-testid="panel-tools"]');
      // Seen, not just laid out: inside the window and inside every box that clips it (the panel scrolls).
      let shown = !!r && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 0.5;
      for (let e = pad?.parentElement; e && shown; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const c = e.getBoundingClientRect();
        shown = r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5 && r.left >= c.left - 0.5 && r.right <= c.right + 0.5;
      }
      return { pad: !!pad, inTools, w: r ? Math.round(r.width) : 0, onScreen: shown };
    });
    check('the desk: the Tip pad is out on the Perform tab, in the Tools panel, seen without opening or scrolling anything',
      seen.pad && seen.inTools && seen.onScreen && seen.w >= 36, `pad ${seen.pad}, in Tools ${seen.inTools}, on screen ${seen.onScreen}, ${seen.w} px`);
    const before = await settingsOf(page);
    const right = await drag(page, 'tip-pad', 0.95, 0, DESK_REACH);
    check('dragged to the right edge it stands the plate up toward the right (Gravity past 0.6, Tilt Direction 90)',
      !!right.held && right.held.u > 0.6 && near(right.held.d, 90, 4), right.held ? `Gravity ${right.held.u}, direction ${right.held.d}` : 'no settings');
    check('and with Slosh off, the grab turns it to half, where it stays',
      before.slosh < 0.05 && right.held.slosh === TIP_SLOSH && right.after.slosh === TIP_SLOSH, `Slosh ${before.slosh} → ${right.held.slosh} → ${right.after.slosh}`);
    check('let go, the dish is the look\'s own again, exactly',
      right.after.u === before.u && right.after.d === before.d, `Gravity ${before.u}/${before.d}° → ${right.after.u}/${right.after.d}°`);
    const top = await drag(page, 'tip-pad', 0, -0.95, DESK_REACH);
    check('dragged to the top, Tilt Direction reads 0', !!top.held && top.held.u > 0.6 && near(top.held.d, 0, 4), `Gravity ${top.held?.u}, direction ${top.held?.d}`);
    // The keys: focus the pad, hold the left arrow, let it go.
    await page.getByTestId('tip-pad').first().focus();
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(200);
    const keyHeld = await settingsOf(page);
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(200);
    const keyAfter = await settingsOf(page);
    check('the left arrow held tips it left, and let go lays it back',
      keyHeld.u > 0.4 && near(keyHeld.d, 270, 4) && keyAfter.u === before.u && keyAfter.d === before.d,
      `held ${keyHeld.u}/${keyHeld.d}°, after ${keyAfter.u}/${keyAfter.d}°`);
    await ctx.close();
  }
  // ── 2. A look whose dish stands up ──
  {
    const { ctx, page } = await open(1440, 900, false, 'lava-lamp');
    const before = await settingsOf(page);
    const dot = await page.evaluate(() => {
      const pad = document.querySelector('[data-testid="tip-pad"]');
      const d = pad?.lastElementChild?.getBoundingClientRect(), p = pad?.getBoundingClientRect();
      return d && p ? Math.round(((d.top + d.height / 2) - (p.top + p.height / 2)) / (p.height / 2) * 100) / 100 : null;
    });
    const left = await drag(page, 'tip-pad', -0.95, 0, DESK_REACH);
    check('Lava Lamp: the dot rests toward the bottom (Gravity 1, Tilt Direction 180), and after a tip the dish stands as it did',
      before.u === 1 && dot !== null && dot > 0.8 && near(left.held.d, 270, 4) && left.after.u === 1 && left.after.d === before.d,
      `before ${before.u}/${before.d}°, dot ${dot} of the radius below the middle, held ${left.held.u}/${left.held.d}°, after ${left.after.u}/${left.after.d}°`);
    await ctx.close();
  }
  // ── 3. The phone ──
  {
    const { ctx, page } = await open(390, 844, true, 'classic');
    await page.getByTestId('phone-open-play').first().tap();
    await page.waitForTimeout(500);
    const b = await page.getByTestId('phone-tip-pad').first().boundingBox().catch(() => null);
    check('the phone: the Motion sheet has the Tip pad, at a thumb\'s size', !!b && b.width >= 110, b ? `${Math.round(b.width)} px` : 'no pad');
    if (b) {
      const before = await settingsOf(page);
      const down = await drag(page, 'phone-tip-pad', 0, 0.95);
      check('and it tips the same plate the same way: dragged down, Tilt Direction 180, and let go, the look\'s own again',
        down.held.u > 0.6 && near(down.held.d, 180, 4) && down.held.slosh === TIP_SLOSH && down.after.u === before.u && down.after.d === before.d,
        `held ${down.held.u}/${down.held.d}° Slosh ${down.held.slosh}, after ${down.after.u}/${down.after.d}°`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
