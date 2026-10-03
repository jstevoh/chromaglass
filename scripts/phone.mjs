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
 *   the mixer     its stack top first, arrows a thumb's size, and they move it
 *   the show      Light Show Night from the Play sheet, and Follow the Song on
 *                 the Sound sheet beside the song's line
 *   clean screen  hides everything, and a still finger brings it back
 *   tilt          the phone's lean read into Gravity and Tilt Direction, from
 *                 where it was held, the same for the same turn whichever
 *                 way it goes (lib/phone.ts, run directly)
 *   fingers       two fingers on the plate are two hands, each where it is,
 *                 and lifting the first leaves the second painting; on the
 *                 closeup two fingers are the camera and pinch the zoom
 *   dye           (Metal only) two fingers holding Drop lay dye at both, and
 *                 not at their mirrors
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
  // 20° is 15° past the dead zone of a 30° ramp: exactly half upright. The
  // three checks below compare against this one, so a band here ("more than
  // 0.4") let a wrong scale through all four.
  check('top edge raised 20°, it runs to the bottom, half upright', Math.abs(toward.upright - 0.5) < 0.011 && toward.direction === 180, `upright ${toward.upright}, direction ${toward.direction}°`);
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

// Every page error, kept so a check can ask whether one came during its gesture.
const pageErrors = [];
const phonePage = async (width, height, { touch = true, query = '' } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (e) => { pageErrors.push(e.message); console.log('  [pageerror]', e.message.slice(0, 200)); });
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
const DOCK = [...TOOLS.map(t => `phone-tool-${t}`), 'phone-open-dye', 'phone-open-looks', 'phone-open-sound', 'phone-open-play', 'phone-open-mix', 'phone-open-more'];

try {
  // ── Not a phone: a laptop window at a phone's width ──────────────
  {
    const { ctx, page } = await phonePage(390, 844, { touch: false });
    check('a mouse at 390 wide gets the laptop\'s layout, not the phone\'s',
      (await page.getByTestId('phone-stage').count()) === 0 && (await visible(page, 'liquid-water')));
    await ctx.close();
  }

  for (const [label, w, h, plateShare] of [['portrait', 390, 844, 2 / 3], ['landscape', 844, 390, 0.5], ['a narrower landscape', 812, 375, 0.5], ['the breakpoint', 800, 360, 0.5], ['under the breakpoint', 799, 360, 0.5], ['a small landscape', 740, 360, 0.5], ['the smallest landscape', 667, 375, 0.5], ['a small phone', 375, 667, 0.6]]) {
    const { ctx, page } = await phonePage(w, h);
    const up = await visible(page, 'phone-stage');
    check(`${label} ${w}×${h}: the phone layout is up`, up);
    if (!up) { await ctx.close(); continue; }
    await shot(page, `${label.replace(/ /g, '-')}-dock`);
    check(`${label}: and the laptop's overlay is not`, (await page.getByTestId('liquid-water').count()) === 0 && (await page.getByTestId('desk-mode-button').count()) === 0);

    // Every mode in reach at once: on screen, a thumb's size, uncovered.
    const boxes = await Promise.all(DOCK.map(id => box(page, id)));
    const off = DOCK.filter((id, i) => !boxes[i] || boxes[i].x < 0 || boxes[i].y < 0 || boxes[i].x + boxes[i].width > w + 0.5 || boxes[i].y + boxes[i].height > h + 0.5);
    check(`${label}: all nine tools and the six sheets are on screen at once`, off.length === 0, off.length ? `off screen: ${off.join(', ')}` : `${DOCK.length} buttons`);
    const small = DOCK.filter((id, i) => boxes[i] && Math.min(boxes[i].width, boxes[i].height) < 48);
    check(`${label}: each is 48 px or more`, small.length === 0,
      small.length ? small.map(id => { const b = boxes[DOCK.indexOf(id)]; return `${id} ${Math.round(b.width)}×${Math.round(b.height)}`; }).join(', ')
        : `smallest ${Math.round(Math.min(...boxes.filter(Boolean).map(b => Math.min(b.width, b.height))))} px`);
    /*
      One row where it fits, two where it does not: a landscape phone 800 px
      wide or more has the tools and the sheets side by side, since height is
      what the plate is short of there, and a narrower one has the sheets
      under the tools (where one row put the tools at 42 px on a 740 and 35
      on a 667). Portrait is always two. Read from where the Dye and the
      Looks buttons sit, the last tool and the first sheet.
    */
    if (boxes[9] && boxes[10]) {
      const oneRow = Math.abs(boxes[9].y + boxes[9].height / 2 - (boxes[10].y + boxes[10].height / 2)) < 8;
      const wantOne = w > h && w >= 800;
      check(`${label}: the dock is ${wantOne ? 'one row' : 'two rows'}`, oneRow === wantOne,
        `the tools' row at ${Math.round(boxes[9].y)}, the sheets' at ${Math.round(boxes[10].y)}`);
    }
    /*
      The strip across the top between the look and the three buttons is the
      plate's: the row that holds them once took every touch across it, 65 px
      deep. Asked at the middle of the gap, where a finger lands, and not only
      through the plate's share, which read 50% at 740 and 667 with the band
      back and so could not tell.
    */
    const gap = await page.evaluate(() => {
      const look = document.querySelector('[data-testid="phone-look-button"]')?.getBoundingClientRect();
      const right = ['phone-zoom', 'phone-play', 'phone-hide']
        .map(id => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect()).filter(Boolean);
      if (!look || !right.length) return null;
      const x = (look.right + Math.min(...right.map(r => r.left))) / 2;
      const y = look.top + look.height / 2;
      return { x: Math.round(x), y: Math.round(y), plate: !!document.elementFromPoint(x, y)?.closest('[data-testid="plate-frame"]') };
    });
    check(`${label}: a finger between the look and the buttons at the top lands on the plate`, !!gap?.plate,
      gap ? `(${gap.x}, ${gap.y})` : 'the look button or the three buttons are missing');
    const covered = await coveredControls(page, { skipInside: '[data-testid="needs-webgpu"]' });
    check(`${label}: nothing covers a control`, covered.length === 0, covered.slice(0, 4).join('; '));
    const leg = await legibility(page);
    check(`${label}: nothing is too small or faint to read`, leg.tiny.length === 0 && leg.small.length === 0 && leg.faint.length === 0,
      [...leg.tiny, ...leg.small, ...leg.faint].slice(0, 5).join(', '));
    /*
      Off the screen, element by element. The page's scroll size cannot say:
      every phone control sits in a fixed box under an overflow-hidden root,
      and fixed boxes add nothing to it, so a dock 1200 px wide on a 390 px
      screen measured 0 px of overflow. Anything visible in the phone's stage
      whose box leaves the screen, and that no scrolling or clipping ancestor
      inside the stage holds in, is spilling.
    */
    const spills = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="phone-stage"]');
      const out = [];
      for (const el of stage ? stage.querySelectorAll('*') : []) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
        if (r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1) continue;
        let held = false;
        for (let p = el.parentElement; p && p !== stage.parentElement; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (/auto|scroll|hidden|clip/.test(ps.overflowX + ps.overflowY)) {
            const pr = p.getBoundingClientRect();
            if (pr.left >= -1 && pr.top >= -1 && pr.right <= innerWidth + 1 && pr.bottom <= innerHeight + 1) { held = true; break; }
          }
        }
        if (!held) out.push(`${el.dataset.testid || el.tagName.toLowerCase()} ${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`);
      }
      return out;
    });
    check(`${label}: nothing spills off the screen`, spills.length === 0, spills.length ? spills.slice(0, 4).join('; ') : 'every box on screen or held in');

    /*
      The plate: how much of the screen a finger lands on it. Sampled on a
      grid with elementFromPoint, counting the points whose top element is
      the plate's own frame (its canvas, or the "needs WebGPU" screen on a
      runner without it), and asked only once the canvas is known to fill the
      screen. The first draft measured the gap between the look button and
      the dock, which a plate squeezed to a strip, or hidden, passed at 72%.
    */
    const plate = await page.evaluate(() => {
      const c = document.getElementById('liquid-canvas')?.getBoundingClientRect();
      const fills = !!c && c.left <= 1 && c.top <= 1 && c.right >= innerWidth - 1 && c.bottom >= innerHeight - 1;
      let on = 0, all = 0;
      for (let i = 0; i < 20; i++) for (let j = 0; j < 40; j++) {
        const el = document.elementFromPoint((i + 0.5) * innerWidth / 20, (j + 0.5) * innerHeight / 40);
        all++;
        if (el?.closest('[data-testid="plate-frame"]')) on++;
      }
      return { fills, share: on / all };
    });
    check(`${label}: the plate fills the screen and keeps ${Math.round(plateShare * 100)}% of it or more`, plate.fills && plate.share >= plateShare,
      `${plate.fills ? 'canvas fills the screen' : 'canvas does NOT fill the screen'}; ${Math.round(plate.share * 100)}% of 800 points land on the plate`);

    // Each tool picks up; the one in hand opens its Amount.
    // Drop starts in hand, so it goes last: counted first, it was in hand
    // before its tap, and the tap opened its Amount instead.
    const pressed = async (t) => (await page.getByTestId(`phone-tool-${t}`).getAttribute('aria-pressed')) === 'true';
    let picked = 0;
    const missed = [];
    for (const t of [...TOOLS.slice(1), TOOLS[0]]) {
      const was = await pressed(t);
      await tap(page, `phone-tool-${t}`);
      if (!was && (await pressed(t))) picked++; else missed.push(`${t}${was ? ' (already in hand)' : ''}`);
    }
    check(`${label}: a tap on each tool puts it in hand`, picked === TOOLS.length, `${picked} of ${TOOLS.length}${missed.length ? `; not: ${missed.join(', ')}` : ''}`);
    await tap(page, 'phone-tool-magnet');
    await tap(page, 'phone-tool-magnet');
    const amountUp = await visible(page, 'phone-amount');
    if (amountUp) await shot(page, `${label.replace(/ /g, '-')}-amount`);
    check(`${label}: a second tap on it opens its Amount`, amountUp);
    const magnetFingers = await visible(page, 'phone-press-fingering');
    /*
      Magnet Size on the Magnet's own Amount (lib/magnetSize.ts), the
      owner's "a magnet that I can control the size of": there under the
      Amount with the Magnet in hand, and it moves the setting the solver's
      magnet is sized by, read back from the app (not the slider's words,
      which a slider wired to nothing would still change). Put back to the
      middle after, the tool as it always was.
    */
    const magnetSize = await visible(page, 'phone-magnet-size');
    let sizeUnder = false, sizeUp = null, sizeBack = null, sizeReset = null;
    if (magnetSize) {
      const amountBox = await box(page, 'phone-amount-slider'), sizeBox = await box(page, 'phone-magnet-size');
      sizeUnder = !!amountBox && !!sizeBox && sizeBox.y >= amountBox.y + amountBox.height - 1;
      const setting = () => page.evaluate(() => window.chromaglassDebug?.().settings?.magnetSize ?? null);
      await page.getByTestId('phone-magnet-size').locator('input').focus();
      await page.keyboard.press('End');
      await page.waitForTimeout(200);
      sizeUp = await setting();
      await page.keyboard.press('Home');
      await page.waitForTimeout(200);
      sizeBack = await setting();
      // Ten steps of 0.05 back to the middle, through the slider, and read back.
      for (let k = 0; k < 10; k++) await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      sizeReset = await setting();
    }
    await tap(page, 'phone-tool-magnet');
    /*
      Fingering on the Press tool's own Amount (lib/squish.ts: the glass
      breaks into fingers as it lifts): there with the Press in hand, under
      its Amount, and nowhere else, and it goes to 100 % and back. Read from
      the slider's own words, as the desk's sliders are.
    */
    await tap(page, 'phone-tool-press');
    await tap(page, 'phone-tool-press');
    const pressFingers = await visible(page, 'phone-press-fingering');
    let fingersUp = null, fingersBack = null, under = false;
    if (pressFingers) {
      const amountBox = await box(page, 'phone-amount-slider'), fingersBox = await box(page, 'phone-press-fingering');
      under = !!amountBox && !!fingersBox && fingersBox.y >= amountBox.y + amountBox.height - 1;
      await page.getByTestId('phone-press-fingering').locator('input').focus();
      await page.keyboard.press('End');
      fingersUp = (await page.getByTestId('phone-press-fingering').innerText()).match(/(\d+)%/)?.[1];
      await page.keyboard.press('Home');
      fingersBack = (await page.getByTestId('phone-press-fingering').innerText()).match(/(\d+)%/)?.[1];
    }
    check(`${label}: the Press's Amount has Fingering under it, and only the Press's, and it goes to 100 % and back`,
      pressFingers && !magnetFingers && under && fingersUp === '100' && fingersBack === '0',
      `on the Press ${pressFingers}, on the Magnet ${magnetFingers}, under the Amount ${under}, ${fingersUp}% then ${fingersBack}%`);
    const pressSize = await visible(page, 'phone-magnet-size');
    check(`${label}: the Magnet's Amount has Size under it, and only the Magnet's, and it moves Magnet Size end to end`,
      magnetSize && !pressSize && sizeUnder && sizeUp === 1 && sizeBack === 0 && Math.abs((sizeReset ?? -1) - 0.5) < 1e-6,
      `on the Magnet ${magnetSize}, on the Press ${pressSize}, under the Amount ${sizeUnder}, Magnet Size ${sizeUp} then ${sizeBack}, then ${sizeReset} put back`);
    await tap(page, 'phone-tool-press');
    await tap(page, 'phone-tool-magnet');
    // Closed, with the dock still up and Magnet still in hand: "not visible"
    // alone was also what a tap that took the whole stage down would read.
    check(`${label}: and a third closes it, leaving Magnet in hand`,
      !(await visible(page, 'phone-amount')) && (await visible(page, 'phone-dock')) && (await pressed('magnet')));
    await tap(page, 'phone-tool-dropper');

    // The sheets: each opens, fits, and closes from above it.
    for (const s of ['dye', 'looks', 'sound', 'play', 'mix', 'more']) {
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
      check(`${label}: and a tap above it closes it, back to the dock`, !(await visible(page, `phone-sheet-${s}`)) && (await visible(page, 'phone-dock')));
    }

    if (label === 'portrait') {
      /*
        The mixer (lib/mixer.ts), from the dock: the same stack the desk and
        the settings sheet draw, top of the wall first, every arrow a thumb's
        size, and an arrow that moves what it says. Asked for with the mixer:
        "make sure we're building mobile versions of everything".
      */
      await tap(page, 'phone-open-mix');
      const rowsOf = () => page.$$eval('[data-testid="phone-sheet-mix"] [data-row]', els => els.map(e => e.getAttribute('data-row')).join(' '));
      const before = await rowsOf();
      const arrows = await Promise.all(['led', 'gel', 'lumia', 'back', 'film', 'mark'].flatMap(id => [box(page, `phone-mixer-${id}-up`), box(page, `phone-mixer-${id}-down`)]));
      const smallest = Math.min(...arrows.map(b => (b ? Math.min(b.width, b.height) : 0)));
      check('portrait: the Mixer lists the stack top first, with every arrow 48 px or more',
        before === 'mark film back front lumia gel led' && smallest >= 48, `${before}; smallest arrow ${Math.round(smallest)} px`);
      await tap(page, 'phone-mixer-film-down');
      const after = await rowsOf();
      await tap(page, 'phone-mixer-back-open');
      const graded = await visible(page, 'phone-mixer-back-grade');
      check('portrait: and a tap moves the film under the back plate, and opens a row\'s grade',
        after === 'mark back film front lumia gel led' && graded, `${after}; grade ${graded ? 'open' : 'not open'}`);
      /*
        Each row's blend (PLAN.md §11 step 3), in its drawer: five buttons a
        thumb's size, and one pressed reaches the show. The tag on the row is
        drawn from the settings the app hands back, not from the button, so
        it only appears if the press went all the way round. Every row that
        has a blend, not one: the six keys are six settings, and a row whose
        buttons wrote another row's key would pass on any other row.
      */
      const blendRows = [];
      for (const id of ['mark', 'film', 'back', 'lumia', 'gel', 'led']) {
        if (!(await visible(page, `phone-mixer-${id}-grade`))) await tap(page, `phone-mixer-${id}-open`);
        const blends = await Promise.all(['own', 'screen', 'add', 'multiply', 'key'].map(b => box(page, `phone-mixer-${id}-blend-${b}`)));
        const small = Math.min(...blends.map(b => (b ? Math.min(b.width, b.height) : 0)));
        const tagBefore = await visible(page, `phone-mixer-${id}-blendtag`);
        await tap(page, `phone-mixer-${id}-blend-add`);
        const tags = await page.$$eval('[data-testid$="-blendtag"]', els => els.map(e => e.getAttribute('data-testid')).join(','));
        const tagAdd = (await visible(page, `phone-mixer-${id}-blendtag`)) ? (await page.getByTestId(`phone-mixer-${id}-blendtag`).first().innerText()).trim() : '';
        const checked = await page.getByTestId(`phone-mixer-${id}-blend-add`).first().getAttribute('aria-checked');
        // The longest tag a row can wear, and its name must still be whole beside it.
        await tap(page, `phone-mixer-${id}-blend-multiply`);
        const cut = await page.getByTestId(`phone-mixer-${id}-name`).first().evaluate(e => e.scrollWidth - e.clientWidth);
        await tap(page, `phone-mixer-${id}-blend-own`);
        const tagOwn = await visible(page, `phone-mixer-${id}-blendtag`);
        blendRows.push({ id, ok: small >= 48 && !tagBefore && tagAdd === 'add' && tags === `phone-mixer-${id}-blendtag` && checked === 'true' && !tagOwn && cut <= 0,
          say: `${id} ${Math.round(small)} px ${tagAdd || 'no tag'}${tags === `phone-mixer-${id}-blendtag` ? '' : ` (tags: ${tags || 'none'})`}${cut > 0 ? `, name cut by ${cut} px` : ''}` });
      }
      check('portrait: every row\'s blend is five buttons of 48 px or more, Add pressed is what that row, and only that row, then says, and its name stays whole beside the tag',
        blendRows.every(r => r.ok), blendRows.map(r => r.say).join(' · '));
      /*
        Each row's take button (lib/mixFade.ts, PLAN.md §11 step 4), on the
        front plate, the one row every look has on the wall: a thumb's size
        beside the level, saying what a press does, lit while it runs, and
        the level walked down over two bars (four seconds at the 120 counted
        when nothing is heard or sent) rather than cut. Read off the level
        slider itself, so what is measured is what the show wrote, through
        React, at whatever rate the page's timer really ran at. The curve's
        own shape, step by step, is `npm run rowfade`'s; here the question
        is only whether the phone's press reaches it and no sample jumps.
        A jump is measured against the time between the two samples, not
        one number for all: the steepest part of a four-second fade moves
        1.5 × dt / 4000 between samples dt apart (0.03 at 80 ms), and a
        flat 0.2 let a timer slowed from 16 ms to 400 ms, writing steps of
        0.13, through.
      */
      const take = 'phone-mixer-front-take';
      const lvl = () => page.getByTestId('phone-mixer-frontLevel').locator('input').first().inputValue().then(Number);
      const lit = async () => (await page.getByTestId(take).first().getAttribute('aria-pressed')) === 'true';
      const say = async () => (await page.getByTestId(take).first().innerText()).trim();
      await page.getByTestId(take).first().scrollIntoViewIfNeeded();
      const takeBox = await box(page, take);
      const saidOut = await say();
      // `fadeMs` is the whole fade's time, for the steepest a sample may move.
      const walk = async (to, ms, fadeMs = 4000) => {
        const seen = [{ t: 0, v: await lvl() }];
        const t0 = Date.now();
        let litWhile = false;
        let saidWhile = '';
        while (Date.now() - t0 < ms) {
          await page.waitForTimeout(80);
          const v = await lvl();
          // Stamped as the level is read, before the other two reads, whose
          // time varies with the page and would stretch or shrink the gap.
          const t = Date.now() - t0;
          if (await lit()) { litWhile = true; if (!saidWhile) saidWhile = await say(); }
          seen.push({ t, v });
          if (v === to) break;
        }
        // Twice the steepest the curve moves (1.5 × dt / fade), plus a tick
        // for the page drawing the level a frame behind the fade, plus the
        // slider's 0.01: 0.058 at 80 ms, against the 0.13 of a slowed timer.
        const over = seen.slice(1).map((p, i) => Math.abs(p.v - seen[i].v) / (2 * (p.t - seen[i].t + 16) / fadeMs + 0.01));
        const drops = seen.slice(1).map((p, i) => Math.abs(p.v - seen[i].v));
        return { seen, litWhile, saidWhile, last: seen[seen.length - 1], most: Math.max(0, ...drops), jumped: Math.max(0, ...over) > 1, between: new Set(seen.map(p => p.v).filter(v => v > 0 && v < 1)).size };
      };
      await page.getByTestId(take).first().tap();
      const out = await walk(0, 8000);
      const outDown = out.seen.every((p, i) => !i || p.v <= out.seen[i - 1].v);
      check('portrait: a row\'s take button is a thumb\'s size and says Fade out; pressed, it is lit and says Fade in while the front plate walks down to 0, never back up, over about two bars and not in a jump',
        takeBox && takeBox.height >= 48 && saidOut === 'Fade out' && out.litWhile && out.saidWhile === 'Fade in' && outDown && out.last.v === 0
          && out.last.t >= 2500 && out.last.t <= 6500 && !out.jumped && out.between >= 8,
        `${Math.round(takeBox?.height ?? 0)} px "${saidOut}", 0 at ${out.last.t} ms, ${out.between} levels on the way, largest step between samples ${out.most.toFixed(3)}${out.jumped ? ' (a jump for its time)' : ''}${out.litWhile ? `, "${out.saidWhile}" while lit` : ', never lit'}${outDown ? '' : ', went back up'}`);
      // The slider shows the level to its step of 0.01, so it reads 0 for the
      // fade's last hundred-odd milliseconds, when the walk is still landing.
      let outLit = true;
      for (let i = 0; i < 15 && outLit; i++) { outLit = await lit(); if (outLit) await page.waitForTimeout(100); }
      const saidIn = await say();
      check('portrait: once out it says Fade in and is no longer lit', saidIn === 'Fade in' && !outLit, `"${saidIn}"${outLit ? ', still lit 1.5 s after' : ''}`);
      // In, turned round part-way, and in again: back to where it was, 1.
      await page.getByTestId(take).first().tap();
      await page.waitForTimeout(1200);
      const turnAt = await lvl();
      await page.getByTestId(take).first().tap();
      const turned = await walk(0, 8000);
      await page.getByTestId(take).first().tap();
      const home = await walk(1, 8000);
      check('portrait: pressed again part-way in, it turns round from there without a jump, and comes back to where it was',
        turnAt > 0 && turnAt < 1 && !turned.jumped && turned.last.v === 0 && home.last.v === 1 && !home.jumped,
        `turned at ${turnAt.toFixed(2)}, largest step ${turned.most.toFixed(3)}${turned.jumped ? ' (a jump for its time)' : ''}; back to ${home.last.v}${home.jumped ? ', with a jump' : ''}`);
      /*
        The hand wins: the level's own slider moved while the take runs stops
        the take where the hand put it, and the button goes out. The rule is
        `RowFades.handOn`'s and rowfade drives it there; this is the app's
        wiring of it (every slider goes through updateSettings), which a
        handOnLevels that did nothing left green in rowfade.
      */
      await page.getByTestId(take).first().tap();
      await page.waitForTimeout(1000);
      const slider = page.getByTestId('phone-mixer-frontLevel').locator('input').first();
      await slider.focus();
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(100);
      const handAt = await lvl();
      await page.waitForTimeout(1000);
      const handLater = await lvl();
      const handLit = await lit();
      check('portrait: a hand on the level\'s slider while it fades stops the fade where the hand put it, and the button goes out',
        handAt > 0.05 && handAt < 0.99 && Math.abs(handLater - handAt) < 1e-9 && !handLit,
        `the hand at ${handAt.toFixed(2)}, a second later ${handLater.toFixed(2)}${handLit ? ', still lit' : ''}`);
      await page.keyboard.press('End');
      await page.waitForTimeout(200);
      await tap(page, 'phone-mixer-front-open');
      const fadeText = async () => ((await visible(page, 'phone-mixer-frontFade')) ? (await page.getByTestId('phone-mixer-frontFade').first().innerText()) : '').replace(/\s+/g, ' ').trim();
      const fadeTime = await fadeText();
      check('portrait: and its fade time is in the row\'s drawer, in bars', /Fade time 2 bars\b/.test(fadeTime), JSON.stringify(fadeTime));
      /*
        And the take counts that row's own fade time, as the app reads it:
        set to one bar in the drawer, the same press lands in about half the
        time the two bars above took. Every run before this one uses the
        default, so a fade that counted two bars whatever the drawer said, or
        another row's fade time, passed all of it.
      */
      await page.getByTestId('phone-mixer-frontFade').locator('input').first().focus();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);
      const oneBar = await fadeText();
      const topAgain = await lvl();
      await page.getByTestId(take).first().tap();
      const short = await walk(0, 8000, 2000);
      check('portrait: set to one bar in the drawer, the same take lands in about half the time',
        /Fade time 1 bar\b/.test(oneBar) && topAgain === 1 && short.last.v === 0 && short.last.t >= 1200 && short.last.t <= 3300
          && short.last.t < out.last.t * 0.7 && !short.jumped,
        `${JSON.stringify(oneBar)}, 0 at ${short.last.t} ms (two bars: ${out.last.t} ms), largest step between samples ${short.most.toFixed(3)}${short.jumped ? ' (a jump for its time)' : ''}`);
      await page.getByTestId(take).first().tap();
      await walk(1, 8000, 2000);
      await page.getByTestId('phone-mixer-frontFade').locator('input').first().focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await tap(page, 'phone-mixer-front-open');

      // And back up, so the rest of the run plays the default stack.
      await tap(page, 'phone-mixer-film-up');
      const back = await rowsOf();
      check('portrait: and back up again with the other arrow', back === before, back);
      await page.getByTestId('phone-sheet-scrim').tap({ position: { x: 20, y: 20 } });
      await page.waitForTimeout(250);

      // A bottle from the Dye sheet is the one in the dock.
      await tap(page, 'phone-open-dye');
      await tap(page, 'phone-liquid-ink');
      const dyeLabel = (await page.getByTestId('phone-open-dye').innerText()).trim();
      check('a bottle picked in the Dye sheet is the one in the dock', /ink/i.test(dyeLabel), `dock says "${dyeLabel}"`);
      await page.getByTestId('phone-sheet-scrim').tap({ position: { x: 20, y: 20 } });

      /*
        The song's shape on the Sound sheet: nothing while nothing is heard,
        and a line once something is (the Band). Only that: without a GPU the
        render loop never runs, so the tracker hears nothing here and the line
        is its placeholder. What the line says at a drop, a build and a
        breakdown is `npm run shape`'s to measure, on `songShapeLine` itself.
      */
      await tap(page, 'phone-open-sound');
      // The page may already be listening to the Band; start from nothing.
      const bandOn = async () => (await page.getByTestId('phone-sound-band').first().getAttribute('aria-pressed')) === 'true';
      const wasOn = await bandOn();
      if (wasOn) { await tap(page, 'phone-sound-band'); await page.waitForTimeout(400); }
      const songBefore = (await bandOn()) ? 'the band would not stop' : (await visible(page, 'phone-song-shape')) ? 'shown with no sound' : '';
      await tap(page, 'phone-sound-band');
      await page.waitForTimeout(400);
      const line = (await visible(page, 'phone-song-shape')) ? (await page.getByTestId('phone-song-shape').innerText()).trim() : '';
      check('the Sound sheet has the song\'s line only while there is sound', !songBefore && /^(Listening for builds, drops and breakdowns\.|The song: (drop|build \d+%|breakdown))$/.test(line),
        `${songBefore ? `${songBefore}; ` : ''}"${line}"`);
      if (!wasOn) await tap(page, 'phone-sound-band');
      await page.getByTestId('phone-sheet-scrim').tap({ position: { x: 20, y: 20 } });

      /*
        The show from the phone: the Play sheet's Light show tile starts Light
        Show Night and says so, and stops it again; and on the Sound sheet,
        with sound on, Follow the Song is a thumb's slider that says what it
        does to the show that is running. The slider is moved from the
        keyboard (End: all the way) and read back from what it prints, which
        is the setting's own value.
      */
      await tap(page, 'phone-open-play');
      await tap(page, 'phone-show');
      const showOn = (await page.getByTestId('phone-show').first().getAttribute('aria-pressed')) === 'true';
      const showSays = (await visible(page, 'phone-show-says')) ? (await page.getByTestId('phone-show-says').innerText()).trim() : '';
      check('the Play sheet starts Light Show Night from a tile, and says so', showOn && /Light Show Night/.test(showSays), `pressed ${showOn}, "${showSays}"`);
      await page.getByTestId('phone-sheet-scrim').tap({ position: { x: 20, y: 20 } });
      /*
        Where it sits, measured rather than taken on trust: with no sound it
        is not there at all (there is no song to follow, and the song's line
        is gone with it, which is how this knows the sound is off); with the
        Band on, its top is below the song's line and it ends above Sound
        Drive's top, so it reads as the song line's control and not as a
        second Sound Drive. The first version asked only for a slider 200 px
        wide somewhere on the sheet, which a slider moved under Sound Drive,
        or shown with the sound off, passed.
      */
      await tap(page, 'phone-open-sound');
      const bandWas = await bandOn();
      if (bandWas) { await tap(page, 'phone-sound-band'); await page.waitForTimeout(300); }
      const silentShows = !(await bandOn()) && !(await visible(page, 'phone-song-shape')) ? await visible(page, 'phone-song-follow') : null;
      await tap(page, 'phone-sound-band');
      await page.waitForTimeout(300);
      const follow = await box(page, 'phone-song-follow');
      const songLine = await box(page, 'phone-song-shape');
      const drive = await box(page, 'phone-sound-drive');
      const between = !!follow && !!songLine && !!drive
        && follow.y >= songLine.y + songLine.height - 0.5 && follow.y + follow.height <= drive.y + 0.5;
      const followSays = (await visible(page, 'phone-song-follow-says')) ? (await page.getByTestId('phone-song-follow-says').innerText()).trim() : '';
      await page.getByTestId('phone-song-follow').locator('input').focus();
      await page.keyboard.press('End');
      await page.waitForTimeout(200);
      const followAt = (await page.getByTestId('phone-song-follow').innerText()).match(/(\d+)%/)?.[1];
      const px = b => (b ? `${Math.round(b.y)}–${Math.round(b.y + b.height)}` : 'missing');
      check('Follow the Song is only there with sound on, sits between the song\'s line and Sound Drive, says what it does to the show, and goes to 100 %',
        silentShows === false && between && follow.width >= 200 && /drop/.test(followSays) && followAt === '100',
        `with no sound ${silentShows === null ? 'the sound would not go off' : silentShows ? 'shown' : 'hidden'}; song line ${px(songLine)}, Follow ${px(follow)}, Sound Drive ${px(drive)} px; `
        + `${follow ? `${Math.round(follow.width)} px wide` : 'missing'}, "${followSays}", at ${followAt ?? '?'} %`);
      await page.keyboard.press('Home');
      if (!bandWas) await tap(page, 'phone-sound-band');
      await page.getByTestId('phone-sheet-scrim').tap({ position: { x: 20, y: 20 } });
      await tap(page, 'phone-open-play');
      await tap(page, 'phone-show');
      const showOff = (await page.getByTestId('phone-show').first().getAttribute('aria-pressed')) === 'false';
      check('and the tile stops it', showOff, '');
      await page.getByTestId('phone-sheet-scrim').tap({ position: { x: 20, y: 20 } });

      /*
        Accent the One (lib/barGrid.ts) on the Sound sheet, measured the same
        way: not there with no sound (nothing to count the bar from); with
        the Band on, under Follow the Song's line and above Sound Drive; it
        prints what the bar grid knows, since the setting waits on that; and
        it goes to 100 % through the setting and back.
      */
      await tap(page, 'phone-open-sound');
      const bandBefore = await bandOn();
      if (bandBefore) { await tap(page, 'phone-sound-band'); await page.waitForTimeout(300); }
      const accentSilent = !(await bandOn()) ? await visible(page, 'phone-beat-accent') : null;
      await tap(page, 'phone-sound-band');
      await page.waitForTimeout(300);
      const accent = await box(page, 'phone-beat-accent');
      const followLine = await box(page, 'phone-song-follow-says');
      const driveBox = await box(page, 'phone-sound-drive');
      const placed = !!accent && !!followLine && !!driveBox
        && accent.y >= followLine.y + followLine.height - 0.5 && accent.y + accent.height <= driveBox.y + 0.5;
      const accentSays = (await visible(page, 'phone-beat-accent-says')) ? (await page.getByTestId('phone-beat-accent-says').innerText()).trim() : '';
      await page.getByTestId('phone-beat-accent').locator('input').focus();
      await page.keyboard.press('End');
      await page.waitForTimeout(200);
      const accentAt = (await page.getByTestId('phone-beat-accent').innerText()).match(/(\d+)%/)?.[1];
      await page.keyboard.press('Home');
      await page.waitForTimeout(200);
      // The figure is drawn from the app's settings (App.tsx beatAccent), not
      // the slider's own state, so it reading 100 and then 0 is the setting.
      const accentBack = (await page.getByTestId('phone-beat-accent').innerText()).match(/(\d+)%/)?.[1];
      const pxA = b => (b ? `${Math.round(b.y)}–${Math.round(b.y + b.height)}` : 'missing');
      check('Accent the One is only there with sound on, sits under Follow the Song and above Sound Drive, says what it hears of the bar, and goes to 100 % and back',
        accentSilent === false && placed && accent.width >= 200 && /^(Counting the one|Hearing the backbeat, not yet the one|Hearing the beat, not yet the bar|Listening for the beat)\.$/.test(accentSays)
        && accentAt === '100' && accentBack === '0',
        `with no sound ${accentSilent === null ? 'the sound would not go off' : accentSilent ? 'shown' : 'hidden'}; Follow's line ${pxA(followLine)}, Accent ${pxA(accent)}, Sound Drive ${pxA(driveBox)} px; "${accentSays}", at ${accentAt ?? '?'} % then ${accentBack ?? '?'} %`);
      if (!bandBefore) await tap(page, 'phone-sound-band');
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

      /*
        A projector's source (PLAN.md §16b), from the phone: More, Settings,
        Mapping, a shape added, and its source picked. The phone has no
        second screen of its own, but it is the remote at a gig, and the
        choice of which plate a projector carries is one made there. Each of
        the four is a thumb's size and the one tapped is the one checked.
        The shape is cleared after, so the checks below draw the plain plate.
      */
      await tap(page, 'phone-open-more');
      await tap(page, 'phone-settings');
      await tap(page, 'settings-nav-mapping');
      await tap(page, 'add-surface-rect');
      await tap(page, 'surface-source-back');
      const sourcePick = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="surface-source-"]')]
        .map(el => ({ id: el.dataset.testid.slice('surface-source-'.length), h: Math.round(el.getBoundingClientRect().height), on: el.getAttribute('aria-checked') === 'true' })));
      // What the renderer reads, not only what the button says.
      const pickedLive = await page.evaluate(() => window.chromaglassDebug?.().outputConfig?.surfaces?.at(-1)?.source ?? null);
      await tap(page, 'surfaces-clear');
      const leftOver = await page.evaluate(() => window.chromaglassDebug?.().outputConfig?.surfaces?.length ?? null);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      check('a projector\'s source is picked from the phone\'s Settings: four of 48 px or more, the tapped one, Back plate, is the one on and the one the show draws, and clearing leaves no shape',
        sourcePick.length === 4 && sourcePick.every(b => b.h >= 48) && sourcePick.filter(b => b.on).map(b => b.id).join() === 'back'
        && pickedLive === 'back' && leftOver === 0,
        `${sourcePick.map(b => `${b.id} ${b.h}px${b.on ? ' on' : ''}`).join(' · ')}; the show's config says ${pickedLive}, ${leftOver} shapes after Clear all`);

      // Clean screen, and a still finger to bring it back.
      // Painting is a moving finger, so a drag over a second leaves the
      // screen clean; only the still one is asked for the controls. Without
      // the drag, any touch at all bringing them back would pass.
      await tap(page, 'phone-hide');
      const gone = !(await visible(page, 'phone-stage')) || !(await visible(page, 'phone-dock'));
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: w / 2 - 50, y: h / 2 }] });
      for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: w / 2 - 50 + 10 * i, y: h / 2 }] });
        await page.waitForTimeout(100);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: w / 2 + 50, y: h / 2 }] });
      await page.waitForTimeout(400);
      const stillGone = !(await visible(page, 'phone-dock'));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: w / 2, y: h / 2 }] });
      await page.waitForTimeout(1000);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: w / 2, y: h / 2 }] });
      await page.waitForTimeout(400);
      check('Clean screen hides the controls, a painting finger leaves them hidden, and a still finger brings them back',
        gone && stillGone && (await visible(page, 'phone-dock')),
        !gone ? 'nothing was hidden' : !stillGone ? 'a drag brought them back' : '');

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
      // Not `?.`: a renamed hook would leave the plate turning and the
      // check measuring a moving dish, silently.
      const settings = (patch) => page.evaluate((p) => {
        if (typeof window.chromaglassSettings !== 'function') throw new Error('window.chromaglassSettings is gone');
        window.chromaglassSettings(p);
      }, patch);
      await settings({ rotationSpeed: 0, plateRock: 0, beatSqueeze: 0, audioImpact: 0 });
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
      /*
        The dye's two fingers, chosen so the places a wrong hand would put
        their dye are clear of both. A and B above sit nearly point-mirrored
        through the plate's middle, so dye at one filled the disk at the
        other's mirror, and a solver drawing every drop mirrored measured the
        same as a right one.

        Chosen, not fixed, because a phone's screen is a small window on the
        plate: the grid is 1.5 times the screen's long side, so the whole
        portrait screen is about 60 by 130 cells round the middle, and which
        cells a place lands on turns with the plate's angle, which differs
        from run to run. Two fixed places, on the Mac, had their mirrors,
        transposes and flips all within reach of each other (one control
        left for one finger, none for the other). So six places toward the
        corners of the plate's part of the screen (clear of the top bar and
        the dock) are each read once, and the pair whose controls are most
        clear of both fingers lays the dye.
      */
      const n = await page.evaluate(() => window.chromaglassDebug().gridSize);
      const R = 0.06 * n;
      const controlsOf = (p) => [
        { x: n - 1 - p.x, y: n - 1 - p.y }, { x: p.y, y: p.x },
        { x: n - 1 - p.x, y: p.y }, { x: p.x, y: n - 1 - p.y },
      ];
      const clearOf = (fingers) => (c) => fingers.every(f => Math.hypot(c.x - f.x, c.y - f.y) > 2.5 * R);
      const spots = [];
      for (const at of [{ x: 45, y: 110 }, { x: 345, y: 110 }, { x: 195, y: 110 }, { x: 45, y: 610 }, { x: 345, y: 610 }, { x: 195, y: 610 }]) {
        const cell = await alone(at);
        if (cell) spots.push({ at, cell });
      }
      let pick = null;
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
        const f = [spots[i].cell, spots[j].cell];
        if (Math.hypot(f[0].x - f[1].x, f[0].y - f[1].y) <= 2.5 * R) continue;
        const clear = Math.min(...f.map(p => controlsOf(p).filter(clearOf(f)).length));
        if (!pick || clear > pick.clear) pick = { clear, a: spots[i], b: spots[j] };
      }
      const DA = pick?.a.at ?? { x: 45, y: 110 }, DB = pick?.b.at ?? { x: 45, y: 610 };
      ref.DA = pick?.a.cell; ref.DB = pick?.b.cell;
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
      /*
        The Press under a finger, held and let go (lib/squish.ts): nothing
        lifts while the finger is down, and once it comes off the plate lays
        the lift. Counted by the plate's own press memory, since the fingers
        a lift draws are for the lab to measure (`npm run lift`) and this is
        about the phone's finger reaching it at all.
      */
      await page.getByTestId('phone-tool-press').click();
      await settings({ fingering: 0.8 });
      const lift = () => page.evaluate(() => {
        const f = window.chromaglassDebug().fluids[0];
        if (!f.pressLift) throw new Error('the plate has no pressLift');
        return { steps: f.pressLift.steps, held: f.pressLift.held(performance.now()), plateSteps: f.stepCount, last: f.lastLift };
      });
      const errorsFrom = pageErrors.length;
      const liftFrom = await lift();
      await touch('touchStart', [{ ...A, id: 5 }]);
      await settle(600);
      const whileHeld = await lift();
      await touch('touchEnd', [{ ...A, id: 5 }]);
      await settle(900);
      const afterLift = await lift();
      /*
        The press is laid by the plate's own step, and on software WebGPU the
        full app's plate barely steps (0 to 4 steps while the finger was
        down, over five runs, measured): there is nothing to ask. Keyed on
        the steps *while the finger was down*, since a plate that stepped
        only after it lifted has no press to lift (one cloud run went red
        that way, keyed on the whole window), and on the steps after it
        came off, since the lift is laid by a step and runs for a second and
        a bit of wall time: a plate that stepped while held and stalled after
        has no lift to show either (two cloud runs went red that way, 135 of
        136). The Mac shard always asks (PHONE_GPU=1).

        Asked there: the press reached the plate's memory while held, and
        once the finger came off the plate laid a lift *where the finger
        was*: the cell the same finger alone lands on (ref.A, above), and
        some cells of it. A count of lift steps alone passed with the lift
        never laid (check-skeptic). "Nothing while held" reads the last lift
        laid, not the step count: a press resets the count, so a lift laid in
        a slow frame mid-hold and then pressed over read 0; the last lift is
        only cleared when the plate forgets its presses, so it also says the
        one read after is this gesture's.
      */
      const heldSteps = whileHeld.plateSteps - liftFrom.plateSteps;
      const afterSteps = afterLift.plateSteps - whileHeld.plateSteps;
      /*
        A lift that threw would stop the plate's steps, which is exactly what
        the skip reads as a plate too slow to ask (check-skeptic): so an error
        on the page during the gesture fails the check, skip or no skip.
      */
      const errors = pageErrors.slice(errorsFrom);
      if (errors.length) {
        check('the Press held and let go raises no error on the page', false, errors[0].slice(0, 200));
      } else if ((heldSteps < 10 || afterSteps < 10) && !NEED_GPU) {
        console.log(` --   the plate took ${heldSteps} steps while the finger was down here and ${afterSteps} after: the Press's lift is not asked (PHONE_GPU=1 on the Mac shard asks it)`);
      } else {
        const last = afterLift.last;
        const near = !!last && !!ref.A && Math.hypot(last.x - ref.A.x, last.y - ref.A.y) <= 2;
        check('a finger holding the Press lifts nothing until it comes off, then the glass lifts into fingers where it was',
          whileHeld.held && whileHeld.steps === 0 && liftFrom.last === null && whileHeld.last === null
            && afterLift.steps > 0 && near && last.cells > 0,
          `held ${whileHeld.held} over ${heldSteps} steps; ${afterLift.steps} lift steps after, the last at ${last ? `(${last.x}, ${last.y}), ${last.cells} cells` : 'none'} against the finger at ${ref.A ? `(${ref.A.x}, ${ref.A.y})` : '?'}`);
      }
      await settings({ fingering: 0 });
      await page.getByTestId('phone-tool-dropper').click();

      /*
        Dye at both fingers, and not anywhere a wrong hand would put it.

        Asked only where the plate reads back, and whether it does is asked
        of the readback count, not of the dye: the first draft took "the dye
        changed" as proof of readbacks, so fingers that laid nothing read as
        "no readbacks here" and skipped. Now a live mirror with no dye under
        a finger fails.

        And the dye is held against where it should not be: for each finger,
        the same disk at its point mirror, its transpose and its two flips,
        wherever those are clear of both fingers. A plate risen everywhere,
        or a drop drawn at the wrong cell, fills those as well; a finger's
        own dye must be three times any of them.
      */
      await settings({ turbulenceScale: 0, rainDrip: 0, glassSmear: 0, bubbles: 0, beads: 0 });
      await page.evaluate(() => {
        if (typeof window.chromaglassAction !== 'function') throw new Error('window.chromaglassAction is gone');
        window.chromaglassAction('clear');
      });
      await settle(2500);
      const snap = () => page.evaluate(() => [...window.chromaglassDebug().fluids[0].readDensity]);
      const readbacks = () => page.evaluate(() => window.chromaglassDebug().fluids[0].readbacks ?? -1);
      const rb0 = await readbacks();
      const before = await snap();
      // The plate's own step count either side of the two touches, so what
      // each finger laid is held to the steps it can have been down for.
      const plateSteps = () => page.evaluate(() => window.chromaglassDebug().fluids[0].stepCount);
      const s0 = await plateSteps();
      await touch('touchStart', [{ ...DA, id: 1 }]);
      await touch('touchStart', [{ ...DA, id: 1 }, { ...DB, id: 2 }]);
      const s1 = await plateSteps();
      await settle(1200);
      /*
        Where the fingers are on the plate while they hold, not where the same
        pixels were when the places were picked, and how far apart the two
        are. Asked after a Mac run read A 62 against B 181 (0.34 of each
        other; 0.63 to 0.99 on every other run), on the theory that the plate
        was still coasting (rotationSpeed 0 only turns its motor off, and the
        same pixel lands on a different cell from run to run). The first run
        that printed it read 0.0 cells: the resting angle differs between
        runs, not within one, so coasting was not that failure's cause, which
        is still open (PLAN.md, batch 11). Measuring at the held cells is
        right either way, and the drift in the line says which it was next
        time.
      */
      const { held, s2 } = await page.evaluate(() => {
        const d = window.chromaglassDebug();
        return { held: d.hands().hands, s2: d.fluids[0].stepCount };
      });
      await touch('touchEnd', [{ ...DA, id: 1 }, { ...DB, id: 2 }]);
      await settle(700);
      const after = await snap();
      const rb1 = await readbacks();
      /*
        What each finger laid is the app's own count, so it is asked wherever
        the plate stepped through the hold, readbacks or none (the plate
        below needs them). Each finger was down from before s1 to s2 and from
        no earlier than s0, so each laid on at least s2 − s1 steps and at most
        s2 − s0 (a frame's steps either way: the second touch may be handled
        a frame after its send returns, and the read lands between frames). Held to the
        plate's own count and not only to each other: two fingers that both
        skipped every other step, or shared one counter, agree with each
        other perfectly. And each step gave dye, the same a step for both.
      */
      const gave = held.map(h => h.laid ?? null);
      const lo = s2 - s1 - 4, hi = s2 - s0 + 1;
      const perStep = gave.map(g => g && g.steps > 0 ? g.dye / g.steps : 0);
      const gaveOk = gave.length === 2 && gave.every(g => g && g.steps >= 10 && g.steps >= lo && g.steps <= hi)
        && gave[1].steps <= gave[0].steps
        && Math.min(...perStep) > 1 && Math.min(...perStep) >= 0.95 * Math.max(...perStep);
      const gaveDetail = gave.length === 2 && gave.every(Boolean)
        ? gave.map((g, i) => `${'AB'[i]} ${g.steps} steps, ${g.dye.toFixed(0)} dye (${perStep[i].toFixed(1)} a step)`).join('; ') + `; the plate took ${s2 - s1} to ${s2 - s0} steps with them down`
        : `held ${held.length} hands, ${gave.filter(Boolean).length} with a count (chromaglassDebug().hands()[i].laid is gone?)`;
      if (held.length === 2 && gave.some(g => !g)) {
        // The count is plain JavaScript: gone is gone wherever this runs.
        check('two fingers holding Drop each lay it on every step both are down, as much as the other', false, gaveDetail);
      } else if (NEED_GPU || (gave.length === 2 && gave.every(g => g && g.steps >= 10))) {
        check('two fingers holding Drop each lay it on every step both are down, as much as the other', gaveOk, gaveDetail);
      } else {
        console.log(` --   the plate took ${s2 - s0} steps under the two fingers here: what each laid is not asked (the Mac shard asks it)`);
      }
      if (rb0 < 0) {
        check('the plate counts its readbacks, so the dye check knows it can look', false, 'fluids[0].readbacks is gone');
      } else if (!pick) {
        check('two places on the screen keep their mirrors clear, so the dye can be told from a wrong hand\'s', false, `${spots.length} places read`);
      } else if (rb1 - rb0 >= 3) {
        /*
          Two questions, asked apart, where this was one.

          What each finger laid, by the app's own count (DropLaid in
          LiquidVisualizer: the steps that finger held the Drop on the plate
          and the dye it handed the solver). Both fingers are down from the
          second touch to the lift, so the second's steps are the first's
          less at most the frame or two between the two touches, and a step
          of one finger's Drop gives exactly what a step of the other's does
          (the same disc, wholly inside the plate). This is where a second
          touch that started late, was skipped on some steps or laid a
          fraction of the first would show, and it is asked of numbers the
          solver has not touched.

          And what the plate holds of it. Under each finger (the disk at its
          held cell) there must be dye, three times anything at that finger's
          mirrors. The balance, which held the two disks to within 0.4 of each
          other, is now asked of the dye nearest each finger (every cell
          within three disks of it and nearer it than the other), so it counts
          a finger's dye wherever the plate carried it in the 1.9 s between
          landing and reading, and not only the part still inside one disk.
          The disks read 62 to 81 against 181 to 234 on four Mac runs (one
          in 36 of the last), with both fingers 52 cells from the middle on
          a cleared plate, and the plate's pools differed by up to 2.5 times
          between runs too (74 to 269 for one finger), which the disk alone
          could not tell from a finger that laid less. A finger that laid
          less still fails both halves; one whose pool the plate moved fails
          neither, and the line prints all three readings, so a red names
          which it was.
        */
        const near = (c, other) => {
          let sum = 0;
          for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            const d = Math.hypot(x - c.x, y - c.y);
            if (d < 3 * R && d < Math.hypot(x - other.x, y - other.y)) sum += Math.max(0, after[x + y * n]) - Math.max(0, before[x + y * n]);
          }
          return sum;
        };
        const disk = (c) => {
          let sum = 0;
          for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - c.x, y - c.y) < R) sum += Math.max(0, after[x + y * n]) - Math.max(0, before[x + y * n]);
          return sum;
        };
        const fingers = held.length === 2 ? held : [ref.DA, ref.DB];
        const drift = held.length === 2 ? Math.max(...held.map((h, i) => Math.hypot(h.x - [ref.DA, ref.DB][i].x, h.y - [ref.DA, ref.DB][i].y))) : NaN;
        const rows = fingers.map((p, i) => {
          const laid = disk(p);
          const elsewhere = controlsOf(p).filter(clearOf(fingers)).map(disk);
          return { laid, near: near(p, fingers[1 - i]), elsewhere, worst: Math.max(0, ...elsewhere) };
        });
        /*
          And at its own finger, not merely on its side of the plate: a held
          cell that is where that finger alone lands (it has read 0.0 cells off
          on every run that printed it), and at least a fifth of the dye
          nearest a finger still inside its disk, so a finger laying a disk or
          two off its cell, which the wider balance would let through, fails.
        */
        const placed = held.length === 2 && drift <= 2;
        const ok = placed && rows.every(r => r.laid > 5 && r.elsewhere.length >= 2 && r.laid > 3 * r.worst && r.laid >= 0.2 * r.near)
          && Math.min(rows[0].near, rows[1].near) > 0.4 * Math.max(rows[0].near, rows[1].near);
        check('two fingers holding Drop lay dye under both, and not at their mirrors', ok,
          rows.map((r, i) => `${'AB'[i]} ${r.laid.toFixed(0)} under it (${r.near.toFixed(0)} nearest it) against ${r.elsewhere.map(v => v.toFixed(0)).join('/') || 'no clear control'}`).join('; ')
            + `; fingers at (${DA.x}, ${DA.y}) and (${DB.x}, ${DB.y}) px, cells ${fmt(fingers)} (${held.length === 2 ? `${drift.toFixed(1)} cells from where they were picked` : 'held cells not read'}); ${rb1 - rb0} readbacks`);
      } else if (NEED_GPU) {
        check('the plate reads back, so the dye can be measured', false, `${rb1 - rb0} readbacks landed in two seconds`);
      } else {
        console.log(` --   no readbacks from the plate here (${rb1 - rb0} in two seconds): the dye under both fingers is not measured (the Mac shard measures it); `
          + `it would lay it at (${DA.x}, ${DA.y}) and (${DB.x}, ${DB.y}) px, cells ${fmt([ref.DA, ref.DB])}, ${pick.clear} clear controls each`);
      }

      check('and the dye\'s fingers let go too', (await hands()).hands.length === 0);

      /*
        With Drop Height up a held Drop lets go of a drop as it lands and
        then one every tenth step (DROP_EVERY), each carrying ten steps'
        dye. Its clock was counted up only past a frame's first step until it
        had started, so on frames of one step each, which is a plate stepping
        at the display's rate, it stayed at 0 and a drop fell on every step:
        ten times the dye and a splash a step. Asked of the finger's own
        count, at one instant, so a slow runner's fewer steps change nothing.
      */
      await settings({ dropHeight: 0.9 });
      // Until the plate has it: the setting reaches the frame loop through
      // React, and a step laid before it is a stream step, counted as held
      // with no drop, which would read one drop short on a correct clock.
      await page.waitForFunction(() => (window.chromaglassDebug().fluids[0].dropHeight ?? 0) > 0.02, null, { timeout: 5000 }).catch(() => {});
      const dropBefore = await snap();
      const rbD0 = await readbacks();
      const d0 = await plateSteps(), f0 = await page.evaluate(() => window.chromaglassDebug().frames), t0 = Date.now();
      await touch('touchStart', [{ ...DA, id: 7 }]);
      await settle(1000);
      const { dropping, d1, f1 } = await page.evaluate(() => {
        const d = window.chromaglassDebug();
        return { dropping: d.hands().hands[0]?.laid ?? null, d1: d.fluids[0].stepCount, f1: d.frames };
      });
      const heldMs = Date.now() - t0;
      await touch('touchEnd', [{ ...DA, id: 7 }]);
      await settle(700);
      const dropAfter = await snap();
      const rbD1 = await readbacks();
      await settings({ dropHeight: 0 });
      /*
        The count, and the drops on the plate: the count is the app's
        bookkeeping, and a drop counted that never reached the solver must
        not pass, so the disk under the finger must hold dye, three times
        its mirrors, wherever the plate reads back. The rate is printed with
        it: at two steps a frame the old clock counted right as well, so a
        run whose steps came two a frame could not have caught it.
      */
      if (NEED_GPU || (dropping && dropping.steps >= 10)) {
        const spot = ref.DA;
        const dyeAt = (c) => {
          let sum = 0;
          for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - c.x, y - c.y) < R) sum += Math.max(0, dropAfter[x + y * n]) - Math.max(0, dropBefore[x + y * n]);
          return sum;
        };
        const landed = rbD1 - rbD0 >= 3 && spot ? dyeAt(spot) : null;
        const mirrors = landed !== null ? controlsOf(spot).filter(c => Math.hypot(c.x - spot.x, c.y - spot.y) > 2.5 * R).map(dyeAt) : [];
        const counted = !!dropping && dropping.steps >= 10 && dropping.drops === Math.ceil(dropping.steps / 10);
        const onPlate = landed === null ? !NEED_GPU : landed > 5 && mirrors.length >= 2 && landed > 3 * Math.max(0, ...mirrors);
        check('a finger holding Drop with Drop Height up lets go of a drop as it lands and one every ten steps after',
          counted && onPlate,
          (dropping ? `${dropping.drops} drops over ${dropping.steps} steps (${Math.ceil(dropping.steps / 10)} wanted)` : 'no hand, or chromaglassDebug().hands()[0].laid is gone')
            + `; the plate stepped ${d1 - d0} times over ${f1 - f0} frames in ${heldMs} ms`
            + (landed === null ? `; ${rbD1 - rbD0} readbacks, the plate not read` : `; ${landed.toFixed(0)} dye under it against ${mirrors.map(v => v.toFixed(0)).join('/') || 'no clear mirror'}`));
      } else {
        console.log(` --   the plate took ${dropping?.steps ?? '?'} steps under the held Drop here: its drops are not counted (the Mac shard counts them)`);
      }

      /*
        Two fingers holding the Magnet are two magnets, each under its own
        finger: the solver is stepped with both (each raises its own spikes,
        npm run spikes measures that on the GPU), and the plate is told of
        both. Read from the step the lead plate was last given, so a second
        finger that only moved the first magnet, or was dropped on the way to
        the solver, fails here.
      */
      await tap(page, 'phone-tool-magnet');
      await touch('touchStart', [{ ...A, id: 1 }]);
      await touch('touchStart', [{ ...A, id: 1 }, { ...B, id: 2 }]);
      await settle(400);
      const magnets = () => page.evaluate(() => {
        if (typeof window.chromaglassDebug().magnets !== 'function') throw new Error('chromaglassDebug().magnets is gone');
        return window.chromaglassDebug().magnets();
      });
      const mags = await magnets();
      // What the lead plate was stepped with, for the detail when this fails.
      const stepped = await page.evaluate(() => {
        const d = window.chromaglassDebug(), st = d.fluids?.[0]?.lastStep;
        return st ? `stepped with strength ${(+st.magnetStrength).toFixed(2)}, ${st.extraMagnets?.length ?? 0} more` : 'no step yet';
      });
      // And lifting the second leaves the first's alone: the control, so a
      // second magnet that is really the first one counted twice fails.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...B, id: 2 }] });
      await settle(400);
      const left = await magnets();
      await touch('touchEnd', [{ ...A, id: 1 }]);
      await settle(400);
      const under = (m, r) => !!m && !!r && Math.abs(m.x * n - r.x) <= 1.5 && Math.abs(m.y * n - r.y) <= 1.5;
      const at = (ms) => ms.map(m => `(${(m.x * n).toFixed(1)}, ${(m.y * n).toFixed(1)})`).join(' ');
      /*
        Asked where the plate runs at speed, as the dye is (the same
        readbacks gate): a held magnet counts as let go a quarter second
        after the hand last moved it (magnetFor), and software WebGPU steps
        the whole app slower than that, so there it was stepped with no
        magnet at all (strength 0) however the fingers were read.
      */
      if (rb1 - rb0 >= 3 || NEED_GPU) {
        check('two fingers holding the Magnet are two magnets, each under its finger, and lifting one leaves one',
          mags.length === 2 && under(mags[0], ref.A) && under(mags[1], ref.B) && left.length === 1 && under(left[0], ref.A),
          `${at(mags)} against cells ${fmt([ref.A, ref.B])}; with the second lifted ${at(left)}; ${stepped}`);
      } else {
        console.log(` --   the plate steps too slowly here for a held magnet (${stepped}): two fingers as two magnets are not asked (the Mac shard asks them)`);
      }
      await tap(page, 'phone-tool-dropper');

      // The closeup: two fingers are the camera.
      await tap(page, 'phone-zoom');
      // Hold, so the closeup stays put between the reference and the check.
      await tap(page, 'phone-camera-hold');
      await settle(600);
      // A thumb resting on the dock is not half a pinch: one finger on the
      // closeup with a thumb on a tool still paints (the page's touches
      // counted the thumb, and the plate zoomed toward the dock instead).
      const dockAt = await box(page, 'phone-tool-spray');
      const thumb = { x: dockAt.x + dockAt.width / 2, y: dockAt.y + dockAt.height / 2, id: 5 };
      // Where that finger lands alone, once the closeup has come to rest:
      // the zoom eases in after the tap, so two readings a moment apart must
      // agree before either is the reference.
      let plateFinger = await alone({ x: 200, y: 400 });
      for (let i = 0; i < 12; i++) {
        await settle(250);
        const again = await alone({ x: 200, y: 400 });
        if (same(again, plateFinger)) break;
        plateFinger = again;
      }
      await touch('touchStart', [thumb]);
      await touch('touchStart', [thumb, { x: 200, y: 400, id: 6 }]);
      await settle(120);
      const withThumb = await hands();
      await touch('touchEnd', [thumb, { x: 200, y: 400, id: 6 }]);
      await settle(150);
      // The one hand is the plate finger's, not the thumb's: "one hand, no
      // pinch" alone was also what reading the thumb as the hand gave.
      check('on the closeup, a thumb on the dock and a finger on the plate is that finger\'s hand, not a pinch',
        !withThumb.pinch && withThumb.hands.length === 1 && same(withThumb.hands[0], plateFinger),
        `${JSON.stringify(withThumb)} against ${fmt([plateFinger].filter(Boolean))}`);
      // Auto, so a pinch that only zooms can be seen to leave the camera on it.
      await tap(page, 'phone-camera-auto');
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
      // The pinch law: the zoom scales with the fingers' span, 50 → 170 px
      // is 3.4 times, up to the closeup's limit of 16. "More than 1.5 times"
      // also passed a square root or a zoom clamped to a constant.
      const want = Math.min(170 / 50, 16 / z0);
      check('and spreading them zooms in by as much as they spread', Math.abs(z1 / z0 - want) < 0.1,
        `${z0.toFixed(2)}× → ${z1.toFixed(2)}× (${(z1 / z0).toFixed(2)} times, ${want.toFixed(2)} wanted) for fingers 50 → 170 px apart`);
      const cam = await page.evaluate(() => window.chromaglassDebug().settings.macroCamera);
      check('and a pinch that only zooms leaves the camera on Auto', cam === 'auto', `camera ${cam}`);
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
