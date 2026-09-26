#!/usr/bin/env node
/**
 * ChromaGlass on a phone: does a phone get a layout it can play, with every
 * mode under the thumb, and does the plate take the phone's own hands?
 *
 *   npm run phone                  # builds, then about a minute
 *   npm run phone -- --head        # watch it
 *   PHONE_GPU=1 npm run phone      # the plate's part is required, not skipped (the Mac shard)
 *   PHONE_SHOTS=dir npm run phone  # and keep a picture of each screen it checks
 *
 * Asked for: "a version for phones that has a mobile friendly UI so you can
 * use all modes in a different interaction format". What a phone got before
 * was the laptop's overlay at 390 pixels: two columns over the whole plate,
 * the tools below the fold of one of them, controls 26 pixels across. So this
 * asks what a thumb needs, on an emulated phone (touch, a coarse pointer, a
 * phone's viewport), in portrait and in landscape:
 *
 *   the choice    a phone gets the phone layout; a narrow laptop window, an
 *                 iPad and `?phone=0` do not (lib/phone.ts, run directly)
 *   every mode    all nine tools and every sheet's button are on screen at
 *                 once, at 48 pixels or more, uncovered, and each one works
 *   the plate     at least two thirds of a portrait screen is the plate, not
 *                 controls (half in landscape)
 *   the sheets    each opens, stays on screen, and closes from above it
 *   clean screen  hides everything, and a still finger brings it back
 *   tilt          the phone's lean read into Gravity and Tilt Direction, from
 *                 where it was held, the same for the same turn whichever
 *                 way it goes (lib/phone.ts, run directly)
 *   fingers       two fingers on the plate are two hands, each where it is,
 *                 and lifting the first leaves the second painting; on the
 *                 closeup two fingers are the camera and pinch the zoom
 *   dye           (Metal only) two fingers holding Drop lay dye at both
 *
 * The last two need the plate running. A runner with no WebGPU shows the
 * "needs WebGPU" screen instead and attaches no hands, so there they are
 * reported as not run, and `PHONE_GPU=1` (the tools shard in checks.yml)
 * makes them required. `PW_WEBGPU=1` runs the fingers here in software; the
 * dye needs readbacks the software adapter does not give the app.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { launchChromium } from './chromium.mjs';
import { coveredControls, legibility } from './layoutProbe.mjs';
import { wantsPhoneLayout, tiltReading } from '../src/lib/phone.ts';

const PORT = Number(process.env.PHONE_PORT ?? 4183);
const HEADED = process.argv.includes('--head');
const NEED_GPU = !!process.env.PHONE_GPU;
const SHOTS = process.env.PHONE_SHOTS || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── The choice, and the tilt: pure ─────────────────────────────────
{
  const phone = { query: '', coarse: true, width: 390, height: 844 };
  check('a phone in portrait gets the phone layout', wantsPhoneLayout(phone));
  check('and turned to landscape', wantsPhoneLayout({ ...phone, width: 844, height: 390 }));
  check('a laptop window as narrow as a phone keeps its own', !wantsPhoneLayout({ ...phone, coarse: false }));
  check('an iPad keeps the full layout', !wantsPhoneLayout({ ...phone, width: 820, height: 1180 }));
  check('?phone gives a laptop the phone layout', wantsPhoneLayout({ ...phone, coarse: false, width: 1440, height: 900, query: '?phone' }));
  check('?phone=0 gives a phone the full one', !wantsPhoneLayout({ ...phone, query: '?phone=0' }));
  check('and "Full layout" does for the visit', !wantsPhoneLayout({ ...phone, sessionOff: true }));

  const level = { beta: 45, gamma: 0 };
  const at = (beta, gamma, angle = 0) => tiltReading({ beta, gamma }, level, angle);
  const rest = at(45, 0);
  check('held still where Tilt came on, the plate lies flat', rest.upright === 0, `upright ${rest.upright}`);
  const shake = at(48, 2);
  check('a hand\'s tremble (3°) does not tip it', shake.upright === 0, `upright ${shake.upright}`);
  const toward = at(65, 0), away = at(25, 0);
  check('top edge raised 20°, it runs to the bottom', toward.upright > 0.4 && toward.upright < 1 && toward.direction === 180, `upright ${toward.upright}, direction ${toward.direction}°`);
  check('lowered 20°, to the top, just as hard', away.direction === 0 && away.upright === toward.upright, `upright ${away.upright}, direction ${away.direction}°`);
  const side = at(45, 20);
  check('right edge dipped 20°, to the right, just as hard again', side.direction === 90 && side.upright === toward.upright, `upright ${side.upright}, direction ${side.direction}°`);
  const land = at(65, 0, 90);
  check('turned to landscape, the device\'s bottom edge is the screen\'s right', land.direction === 90, `direction ${land.direction}°`);
  const hard = at(45, 60);
  check('far enough, fully upright and no further', hard.upright === 1, `upright ${hard.upright}`);
  const over = tiltReading({ beta: -170, gamma: 0 }, { beta: 170, gamma: 0 });
  check('past the ±180° seam of beta, 20° is still 20°', over.upright === toward.upright, `upright ${over.upright}`);
}

// ── In a browser ───────────────────────────────────────────────────
const notes = [];
async function serve() {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  await new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
    proc.stdout.on('data', d => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
    proc.stderr.on('data', d => { notes.push(String(d).trim()); });
    proc.on('exit', c => { clearTimeout(bail); reject(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
  });
  return proc;
}
const server = await serve();
const stopServer = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } };
process.on('exit', stopServer);

// The plate's resolution changes no layout and the fingers are read in grid
// cells, so a small canvas costs nothing and saves the software renderer.
const URL = `http://localhost:${PORT}/?debug&look=classic&dpr=0.35`;
const browser = await launchChromium(chromium, { headless: !HEADED });

const phonePage = async (width, height, { touch = true, query = '' } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.goto(`${URL}${query}`, { waitUntil: 'load' });
  for (let i = 0; i < 40 && !(await page.getByTestId('phone-stage').count()) && !(await page.getByTestId('liquid-water').count()); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(800);
  return { ctx, page };
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const tap = async (page, testId) => { await page.getByTestId(testId).first().tap(); await page.waitForTimeout(250); };
const visible = (page, testId) => page.getByTestId(testId).first().isVisible().catch(() => false);
const box = (page, testId) => page.getByTestId(testId).first().boundingBox();

const TOOLS = ['dropper', 'spray', 'splatter', 'pour', 'streak', 'blow', 'press', 'finger', 'magnet'];
const DOCK = [...TOOLS.map(t => `phone-tool-${t}`), 'phone-open-dye', 'phone-open-looks', 'phone-open-sound', 'phone-open-play', 'phone-open-more'];

try {
  // ── Not a phone: a laptop window at a phone's width ──────────────
  {
    const { ctx, page } = await phonePage(390, 844, { touch: false });
    check('a mouse at 390 wide gets the laptop\'s layout, not the phone\'s',
      (await page.getByTestId('phone-stage').count()) === 0 && (await visible(page, 'liquid-water')));
    await ctx.close();
  }

  for (const [label, w, h, plateShare] of [['portrait', 390, 844, 2 / 3], ['landscape', 844, 390, 0.5], ['a small phone', 375, 667, 0.6]]) {
    const { ctx, page } = await phonePage(w, h);
    const up = await visible(page, 'phone-stage');
    check(`${label} ${w}×${h}: the phone layout is up`, up);
    if (!up) { await ctx.close(); continue; }
    await shot(page, `${label.replace(/ /g, '-')}-dock`);
    check(`${label}: and the laptop's overlay is not`, (await page.getByTestId('liquid-water').count()) === 0 && (await page.getByTestId('desk-mode-button').count()) === 0);

    // Every mode in reach at once: on screen, a thumb's size, uncovered.
    const boxes = await Promise.all(DOCK.map(id => box(page, id)));
    const off = DOCK.filter((id, i) => !boxes[i] || boxes[i].x < 0 || boxes[i].y < 0 || boxes[i].x + boxes[i].width > w + 0.5 || boxes[i].y + boxes[i].height > h + 0.5);
    check(`${label}: all nine tools and the five sheets are on screen at once`, off.length === 0, off.length ? `off screen: ${off.join(', ')}` : `${DOCK.length} buttons`);
    const small = DOCK.filter((id, i) => boxes[i] && Math.min(boxes[i].width, boxes[i].height) < 48);
    check(`${label}: each is 48 px or more`, small.length === 0,
      small.length ? small.map(id => { const b = boxes[DOCK.indexOf(id)]; return `${id} ${Math.round(b.width)}×${Math.round(b.height)}`; }).join(', ')
        : `smallest ${Math.round(Math.min(...boxes.filter(Boolean).map(b => Math.min(b.width, b.height))))} px`);
    const covered = await coveredControls(page, { skipInside: '[data-testid="needs-webgpu"]' });
    check(`${label}: nothing covers a control`, covered.length === 0, covered.slice(0, 4).join('; '));
    const leg = await legibility(page);
    check(`${label}: nothing is too small or faint to read`, leg.tiny.length === 0 && leg.small.length === 0 && leg.faint.length === 0,
      [...leg.tiny, ...leg.small, ...leg.faint].slice(0, 5).join(', '));
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight));
    check(`${label}: nothing spills off the screen`, overflow <= 1, `${overflow} px`);

    // The plate: what the top bar and the dock leave of it.
    const top = await box(page, 'phone-look-button');
    const dock = await box(page, 'phone-dock');
    const share = (dock.y - (top.y + top.height)) / h;
    check(`${label}: the plate keeps ${Math.round(plateShare * 100)}% of the screen or more`, share >= plateShare, `${Math.round(share * 100)}% between the top bar and the dock`);

    // Each tool picks up; the one in hand opens its Amount.
    let picked = 0;
    for (const t of TOOLS) {
      await tap(page, `phone-tool-${t}`);
      if ((await page.getByTestId(`phone-tool-${t}`).getAttribute('aria-pressed')) === 'true') picked++;
    }
    check(`${label}: a tap on each tool puts it in hand`, picked === TOOLS.length, `${picked} of ${TOOLS.length}`);
    await tap(page, 'phone-tool-magnet');
    const amountUp = await visible(page, 'phone-amount');
    if (amountUp) await shot(page, `${label.replace(/ /g, '-')}-amount`);
    check(`${label}: a second tap on it opens its Amount`, amountUp);
    await tap(page, 'phone-tool-magnet');
    check(`${label}: and a third closes it`, !(await visible(page, 'phone-amount')));
    await tap(page, 'phone-tool-dropper');

    // The sheets: each opens, fits, and closes from above it.
    for (const s of ['dye', 'looks', 'sound', 'play', 'more']) {
      await tap(page, `phone-open-${s}`);
      const open = await visible(page, `phone-sheet-${s}`);
      if (!open) { check(`${label}: the ${s} sheet opens`, false); continue; }
      await shot(page, `${label.replace(/ /g, '-')}-sheet-${s}`);
      const inner = await page.evaluate((s) => {
        const sheet = document.querySelector(`[data-testid="phone-sheet-${s}"]`);
        const panel = sheet?.lastElementChild?.getBoundingClientRect();
        return panel ? { top: panel.top, bottom: panel.bottom, height: panel.height } : null;
      }, s);
      const coveredIn = await coveredControls(page, { skipInside: '[data-testid="needs-webgpu"], [data-testid="phone-stage"] > :not([data-testid^="phone-sheet"])' });
      check(`${label}: the ${s} sheet opens on screen, over no more than 90% of it, with nothing covered`,
        inner && inner.top >= 0 && inner.bottom <= h + 0.5 && inner.height <= 0.9 * h && coveredIn.length === 0,
        inner ? `${Math.round(inner.height)} of ${h} px${coveredIn.length ? `; ${coveredIn.slice(0, 3).join('; ')}` : ''}` : 'no panel');
      await page.getByTestId('phone-sheet-scrim').tap({ position: { x: 20, y: 20 } });
      await page.waitForTimeout(250);
      check(`${label}: and a tap above it closes it`, !(await visible(page, `phone-sheet-${s}`)));
    }

    if (label === 'portrait') {
      // A bottle from the Dye sheet is the one in the dock.
      await tap(page, 'phone-open-dye');
      await tap(page, 'phone-liquid-ink');
      const dyeLabel = (await page.getByTestId('phone-open-dye').innerText()).trim();
      check('a bottle picked in the Dye sheet is the one in the dock', /ink/i.test(dyeLabel), `dock says "${dyeLabel}"`);
      await page.getByTestId('phone-sheet-scrim').tap({ position: { x: 20, y: 20 } });

      // A look from the Looks sheet is the look named at the top.
      await tap(page, 'phone-open-looks');
      const target = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-testid^="phone-look-"]')].filter(el => el.getAttribute('aria-pressed') === 'false');
        const el = rows[3];
        return el ? { id: el.dataset.testid, name: el.querySelector('span span')?.textContent ?? '' } : null;
      });
      if (target) await tap(page, target.id);
      // Asked twice: during the crossfade (two seconds by default), when the
      // settings match neither look, and after it, when they match the new one.
      await page.waitForTimeout(500);
      const fadingName = (await page.getByTestId('phone-look-button').innerText()).trim();
      await page.waitForTimeout(3500);
      const named = (await page.getByTestId('phone-look-button').innerText()).trim();
      check('a look picked in the Looks sheet is the look named at the top, during its fade and after it',
        !!target && fadingName === target.name && named === target.name, `picked "${target?.name}", top says "${fadingName}" fading and "${named}" after`);

      // Clean screen, and a still finger to bring it back.
      await tap(page, 'phone-hide');
      const gone = !(await visible(page, 'phone-stage')) || !(await visible(page, 'phone-dock'));
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: w / 2, y: h / 2 }] });
      await page.waitForTimeout(1000);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: w / 2, y: h / 2 }] });
      await page.waitForTimeout(400);
      check('Clean screen hides the controls, and a still finger brings them back', gone && (await visible(page, 'phone-dock')), gone ? '' : 'nothing was hidden');

      // "Full layout" is the laptop's, for the visit.
      await tap(page, 'phone-open-more');
      await tap(page, 'phone-full-layout');
      await page.waitForTimeout(500);
      check('"Full layout" puts the laptop\'s layout up instead', !(await visible(page, 'phone-stage')) && (await visible(page, 'liquid-water')));
    }
    await ctx.close();
  }

  // ── The plate's fingers ──────────────────────────────────────────
  {
    const { ctx, page } = await phonePage(390, 844);
    // Give the plate a moment to start: in software it is slow.
    for (let i = 0; i < 40; i++) {
      const state = await page.evaluate(() => (document.querySelector('[data-testid="needs-webgpu"]') ? 'none' : typeof window.chromaglassDebug?.()?.hands === 'function' ? 'up' : 'wait'));
      if (state !== 'wait') break;
      await page.waitForTimeout(500);
    }
    const running = await page.evaluate(() => !document.querySelector('[data-testid="needs-webgpu"]') && typeof window.chromaglassDebug?.()?.hands === 'function');
    if (!running) {
      if (NEED_GPU) check('the plate runs, so the fingers can be asked about', false, 'no WebGPU here, and PHONE_GPU asked for it');
      else console.log(' --   the plate has no WebGPU here: the fingers and the dye are not asked (PHONE_GPU=1 on the Mac shard asks them)');
    } else {
      const cdp = await ctx.newCDPSession(page);
      const hands = () => page.evaluate(() => window.chromaglassDebug().hands());
      const settle = (ms) => page.waitForTimeout(ms);
      const A = { x: 130, y: 380 }, B = { x: 270, y: 480 };
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });

      // A still dish, so a cell under a finger stays that cell: the classic
      // look turns, and the plate's cells turn with it under the screen.
      await page.evaluate(() => window.chromaglassSettings?.({ rotationSpeed: 0, plateRock: 0, beatSqueeze: 0, audioImpact: 0 }));
      await settle(1500);
      // Where one finger alone lands, at each place: what two fingers are held to.
      const alone = async (p) => {
        await touch('touchStart', [{ ...p, id: 9 }]);
        await settle(120);
        const h = (await hands()).hands[0];
        await touch('touchEnd', [{ ...p, id: 9 }]);
        await settle(120);
        return h;
      };
      const A2 = { x: A.x + 60, y: A.y }, B2 = { x: B.x - 60, y: B.y };
      const ref = { A: await alone(A), B: await alone(B), A2: await alone(A2), B2: await alone(B2) };
      const same = (h, r) => !!h && !!r && Math.abs(h.x - r.x) <= 1 && Math.abs(h.y - r.y) <= 1;
      const fmt = (hs) => hs.map(h => `(${h.x}, ${h.y})`).join(' ');

      await touch('touchStart', [{ ...A, id: 1 }]);
      await touch('touchStart', [{ ...A, id: 1 }, { ...B, id: 2 }]);
      await settle(150);
      const two = await hands();
      check('two fingers on the plate are two hands', two.hands.length === 2, fmt(two.hands));
      check('each where that finger alone would be', same(two.hands[0], ref.A) && same(two.hands[1], ref.B),
        `${fmt(two.hands)} against ${fmt([ref.A, ref.B])}`);
      await touch('touchMove', [{ ...A2, id: 1 }, { ...B2, id: 2 }]);
      await settle(150);
      const moved = await hands();
      check('and each moves with its own finger', same(moved.hands[0], ref.A2) && same(moved.hands[1], ref.B2),
        `${fmt(moved.hands)} against ${fmt([ref.A2, ref.B2])}`);
      // CDP lifts the fingers a touchEnd names, and only those.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...A2, id: 1 }] });
      await settle(150);
      const one = await hands();
      check('lifting the first finger leaves the second painting', one.hands.length === 1 && same(one.hands[0], ref.B2), fmt(one.hands));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...B2, id: 2 }] });
      await settle(150);
      check('and lifting it too lets go', (await hands()).hands.length === 0);

      // Dye at both fingers. Only where the plate reads back: the software
      // adapter gives the app none, and its copy of the dye never moves. So
      // a copy that has not changed across a second of two fingers dropping
      // dye is no readbacks, not no dye: reported, and required on the Mac.
      await page.evaluate(() => window.chromaglassSettings?.({ turbulenceScale: 0, rainDrip: 0, glassSmear: 0, bubbles: 0, beads: 0 }));
      await page.evaluate(() => window.chromaglassAction?.('clear'));
      await settle(2500);
      const snap = () => page.evaluate(() => [...window.chromaglassDebug().fluids[0].readDensity]);
      const before = await snap();
      await touch('touchStart', [{ ...A, id: 1 }]);
      await touch('touchStart', [{ ...A, id: 1 }, { ...B, id: 2 }]);
      await settle(1200);
      await touch('touchEnd', [{ ...A, id: 1 }, { ...B, id: 2 }]);
      await settle(700);
      const after = await snap();
      const n = await page.evaluate(() => window.chromaglassDebug().gridSize);
      const live = after.some((v, i) => v !== before[i]);
      if (live) {
        const laid = [ref.A, ref.B].map(p => {
          let sum = 0;
          for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - p.x, y - p.y) / n < 0.06) sum += Math.max(0, after[x + y * n]) - Math.max(0, before[x + y * n]);
          return sum;
        });
        check('two fingers holding Drop lay dye under both', laid[0] > 5 && laid[1] > 5 && Math.min(...laid) > 0.4 * Math.max(...laid),
          laid.map(v => v.toFixed(0)).join(' and '));
      } else if (NEED_GPU) {
        check('the plate reads back, so the dye can be measured', false, 'its copy of the dye did not change');
      } else {
        console.log(' --   no readbacks from the plate here: the dye under both fingers is not measured (the Mac shard measures it)');
      }

      check('and the dye\'s fingers let go too', (await hands()).hands.length === 0);

      // The closeup: two fingers are the camera.
      await tap(page, 'phone-zoom');
      await settle(600);
      const z0 = await page.evaluate(() => window.chromaglassDebug().settings.macroZoom ?? 1);
      await touch('touchStart', [{ x: 170, y: 420, id: 1 }]);
      await touch('touchStart', [{ x: 170, y: 420, id: 1 }, { x: 220, y: 420, id: 2 }]);
      await settle(100);
      const pinch = await hands();
      check('on the closeup, two fingers are the camera, not two hands', pinch.pinch && pinch.hands.length === 0, JSON.stringify(pinch));
      for (let i = 1; i <= 6; i++) {
        await touch('touchMove', [{ x: 170 - 10 * i, y: 420, id: 1 }, { x: 220 + 10 * i, y: 420, id: 2 }]);
        await settle(60);
      }
      await settle(300);
      const z1 = await page.evaluate(() => window.chromaglassDebug().settings.macroZoom ?? 1);
      check('and spreading them zooms in', z1 > z0 * 1.5, `${z0.toFixed(2)}× → ${z1.toFixed(2)}× for fingers 50 → 170 px apart`);
      await touch('touchEnd', [{ x: 110, y: 420, id: 1 }, { x: 280, y: 420, id: 2 }]);
      await settle(150);
      check('and when they lift, nothing is left painting', (await hands()).hands.length === 0 && !(await hands()).pinch);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  stopServer();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — failed: ${failed.map(r => r.name).join('; ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
