#!/usr/bin/env node
/**
 * At Audio Impact 0 the music drops no bubbles.
 *
 *   npm run kickbubbles      (needs a plate that draws: CI's macOS runner)
 *
 * Found by the mirror check (scripts/mirror.mjs): a browser that has never
 * chosen a sound source starts the built-in band on its first click (App.tsx,
 * the first visit's wake), and the band's kicks released bubbles near the
 * middle of the plate whatever Audio Impact said. Every other reaction to the
 * music (the centre pulse, the bursts, the ring of dye on a kick, the liquids
 * it doses) sits behind that dial; the bubbles did not, so with the fader all
 * the way down, and the rest of the plate still, air kept arriving on the
 * beat. With the band let start on the mirror's calm Classic plate: 29 kicks
 * over four drops and four bubbles near the middle.
 *
 * What is played here is that report, as a visitor meets it: a fresh browser
 * on Classic, the look's Bubbles turned all the way up (so a kick that can
 * release air very likely does, at the old odds 0.45 a kick), and then the
 * first click on the plate, which starts the band. Twenty-five seconds later
 * (a minute on the look's own Audio Impact, below):
 *
 *   at 0          the band started, and at least fifteen of its kicks reached
 *                 the bubbles' own decision with room on the plate (counted
 *                 there, past every gate in front of it, so a page that drew
 *                 nothing, a band that never started or a plate whose Bubbles
 *                 went back to 0 cannot pass as "no bubbles"); the music
 *                 released none, on a kick or on a held bass note, and none
 *                 is on the plate. The Audio Impact and Bubbles checked are
 *                 the ones the frame used, not the App's: a song's chorus
 *                 lifts the plate's. On the laptop's Perform desk and on the
 *                 phone's own layout (asserted, both), whose first tap is the
 *                 same gesture and whose Sound Drive is the same setting.
 *   the look's own  Audio Impact left where Classic puts it (0.55): the drive
 *                 the frame used is 1, so a kick is as likely to release air
 *                 as before the fix (0.45 with Bubbles full), and the share of
 *                 chances that released air sits in 0.1 to 0.85 (fifteen
 *                 chances at least; the band's edges are 2.7 deviations out
 *                 at fifteen and further at the forty-odd the Mac hears).
 *                 This is what keeps the lines above honest: a change that
 *                 stopped the bubbles everywhere, or a counter nobody feeds,
 *                 passes "none at 0" and is red here.
 *
 * The counts are `chromaglassDebug().musicBubbles()`, read beside the band's
 * own hook (window.__band) and the kicks the plate counted. Where no plate draws (a
 * Linux box without `PW_WEBGPU`) the loop barely hears the band and the floors
 * cannot be met, so the lines are printed as skipped there, never passed;
 * `KICKBUBBLES_PLATE=1` runs them anyway. With `PW_WEBGPU` a cloud session's
 * plate does draw (headed into Xvfb, PLAN.md 19l), and the lines run and are
 * red on their floors: the band plays its kicks on the wall clock, the frame
 * loop hears a kick only on a frame, and software draws a frame every two or
 * three seconds, so a listening window hears 1 to 3 of the band's kicks where
 * the Mac's hears its 15 and more. That is the frame rate's shortfall, not
 * the bubbles', and the Mac's run is the one that says.
 */
import { chromium } from 'playwright';
import { launchChromium, presentsInXvfb } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, settlePlate, waitForEngine } from './frame.mjs';

const PORT = Number(process.env.KICKBUBBLES_PORT ?? 4363);
// A Linux box with PW_WEBGPU presents headed into Xvfb below (chromium.mjs, PLAN.md 19l), so its plate
// draws too, a frame every few seconds. The listening window is the wall clock's there as on a Mac
// (`settlePlate` only ever adds steps to it), so the kicks heard in it are as few as its frames: see the
// header for why its floors are red in software and are not lowered for it.
const PLATE = process.platform === 'darwin' || !!process.env.KICKBUBBLES_PLATE
  || (process.platform === 'linux' && !!process.env.PW_WEBGPU);
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const LAPTOP = { viewport: { width: 1418, height: 703 }, touch: false };
const PHONE = { viewport: { width: 390, height: 844 }, touch: true };
const CASES = [
  { name: 'laptop, Audio Impact 0', impact: 0, screen: LAPTOP },
  { name: 'phone, Audio Impact 0', impact: 0, screen: PHONE },
  // Left at the look's own value, not patched: what a visitor plays. Listened to for a minute (below).
  { name: "laptop, Classic's own Audio Impact", impact: null, screen: LAPTOP, listenMs: 60_000 },
];
const LISTEN_MS = 25_000;
/*
  Why Classic is listened to for a minute and not 25 seconds. A chance is a
  kick that reaches the bubbles' decision with room on the plate (fewer
  than 17 of the music's own bubbles at Bubbles full), and at Classic's own
  Audio Impact the kicks fill that room: two to four bubbles on nearly half
  of them, each lasting 13 to 35 seconds. So after the first dozen chances
  the next ones wait for a bubble to go, and in 25 seconds the Mac counted
  12 to 34 chances of the band's 51 kicks, 16 to 22 on most runs, and under
  the floor of 15 on six of 38 runs between 9 and 10 October (12, 13, 13,
  14, 14, 14), the ones at 0 never under 23 (they release none, so the room
  never fills). Those reds were the window, not the bubbles: a run where
  the share released was 57% of 14 chances is the same plate as one where
  it was 47% of 17. The floor stays at 15; the window gives it more chances
  to count, as the bubbles of the first half-minute go and leave room.
*/
const CHANCE_FLOOR = 15;

if (!PLATE) {
  for (const c of CASES) console.log(`skip  ${c.name} — no plate draws here; held on the Mac (KICKBUBBLES_PLATE=1 to run anyway)`);
  process.exit(0);
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 2500));

const read = (page) => page.evaluate(() => {
  const d = window.chromaglassDebug?.();
  const field = d?.bubbles;
  return {
    band: typeof window.__band === 'function' ? window.__band() : null,
    kicks: d?.kicks?.() ?? null,
    music: d?.musicBubbles?.() ?? null,
    // The look's own: a bubble blown by hand is not the music's.
    onPlate: field ? field.bubbles.filter((b) => !b.straw).length : null,
    phone: !!document.querySelector('[data-testid="phone-stage"]'),
  };
});

// `present`: on a Linux box with PW_WEBGPU, headed into Xvfb so the plate reads back (chromium.mjs, PLAN.md 19l).
const browser = await launchChromium(chromium, { present: true });
let failed = 0;
try {
  for (const c of CASES) {
    const ctx = await browser.newContext({
      viewport: c.screen.viewport, isMobile: c.screen.touch, hasTouch: c.screen.touch, deviceScaleFactor: c.screen.touch ? 2 : 1,
    });
    const page = await ctx.newPage();
    // Every click waits its turn behind the plate's first step in software (PLAN.md 19l): 25 to 100 s.
    if (presentsInXvfb()) page.setDefaultTimeout(300_000);
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&play=0${engineQuery()}`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.chromaglassSettings === 'function' && typeof window.chromaglassDebug === 'function', null, { timeout: 60_000 });
    await settlePlate(page, 6000);
    await waitForEngine(page);
    await page.evaluate((impact) => window.chromaglassSettings(impact === null ? { bubbles: 1 } : { audioImpact: impact, bubbles: 1 }), c.impact);
    await settlePlate(page, 1000);
    const before = await read(page);
    // Bubbles to full can lay the plate again, and in software a new plate's first step is 25 to 100 s.
    const plate = await page.locator('canvas').first().boundingBox({ timeout: presentsInXvfb() ? 300_000 : 30_000 });
    await waitForEngine(page);
    const at = plate ? { x: plate.x + plate.width / 2, y: plate.y + plate.height / 2 } : { x: c.screen.viewport.width / 2, y: c.screen.viewport.height / 3 };
    // The app opens on Source Off (PLAN.md 14y), so the band is chosen the way a
    // hand does, by its control, after the dials above are set and before the
    // click on the plate: what is counted still begins with the band.
    if (c.screen.touch) {
      await page.getByTestId('phone-open-sound').first().tap();
      await page.getByTestId('phone-sound-band').first().tap();
      await page.getByTestId('phone-sheet-scrim').tap({ position: { x: 20, y: 20 } });
    } else {
      await page.getByTestId('dot-sound').click();
      await page.getByTestId('audio-source-open').click();
      await page.getByTestId('sound-source-simulated').click();
      await page.keyboard.press('Escape');
    }
    await settlePlate(page, 500);
    if (c.screen.touch) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.click(at.x, at.y);
    /*
      Room, made the way the bubbles used to make it themselves. A chance is
      a kick that finds room on the plate, and until PLAN 38b the room came
      back as each bubble's 13 to 35 second timer ran out. A pocket between
      glasses has no timer (#603): it goes only at the rim, by a merge or
      under a drop, so on Classic's quiet plate the first dozen chances
      filled the room for the rest of the window, and the deploy after #603
      counted 11 chances where the floor is 15. What this check measures is
      the decision on a kick (Audio Impact's odds), not how long a bubble
      lasts, so the look's own bubbles are let go every eight seconds of the
      window, as a hand wiping the plate would, and the last eight seconds or
      more are left alone so the plate still carries what the music released.
    */
    const listen = c.listenMs ?? LISTEN_MS, slice = 8000;
    let t = 0;
    for (; t + 2 * slice <= listen; t += slice) {
      await settlePlate(page, slice);
      await page.evaluate(() => window.chromaglassDebug().bubbles?.clearLooks());
    }
    await settlePlate(page, listen - t);
    const after = await read(page);
    const kicks = (after.kicks ?? 0) - (before.kicks ?? 0);
    const m0 = before.music ?? {}, m1 = after.music ?? {};
    const chances = (m1.chances ?? NaN) - (m0.chances ?? NaN);
    const onKicks = (m1.kicks ?? NaN) - (m0.kicks ?? NaN);
    const onHeld = (m1.held ?? NaN) - (m0.held ?? NaN);
    const where = c.screen.touch ? 'the phone layout' : "the laptop's layout, not the phone's";
    check(`${c.name}: the page is ${where}`, c.screen.touch ? after.phone : !after.phone, after.phone ? 'phone-stage present' : 'no phone-stage');
    check(`${c.name}: the first ${c.screen.touch ? 'tap' : 'click'} starts the band and its kicks reach the bubbles' decision`,
      !before.band && !!after.band && chances >= CHANCE_FLOOR,
      `the band ${after.band ? `played ${after.band.kicks} kicks` : 'never started'}, ${kicks} reached the plate, ${chances} the bubbles with room (at least ${CHANCE_FLOOR})`);
    check(`${c.name}: the plate ran with Bubbles full and the Audio Impact asked for`,
      m1.amount === 1 && (c.impact === null ? m1.impact >= 0.45 && m1.drive === 1 : m1.impact === c.impact),
      `Bubbles ${m1.amount}, Audio Impact ${m1.impact}, drive ${m1.drive}`);
    if (c.impact === 0) {
      check(`${c.name}: the music releases no bubbles`, onKicks === 0 && onHeld === 0 && after.onPlate === 0,
        `released on ${onKicks} of ${chances} kicks and ${onHeld} held notes; ${after.onPlate} on the plate`);
    } else {
      const share = onKicks / chances;
      check(`${c.name}: a kick releases air as often as it did, and it is on the plate`,
        chances >= CHANCE_FLOOR && share >= 0.1 && share <= 0.85 && after.onPlate >= 1,
        `released on ${onKicks} of ${chances} kicks (${(share * 100).toFixed(0)}%, odds 45%) and ${onHeld} held notes; ${after.onPlate} on the plate`);
    }
    await ctx.close();
  }
} catch (err) {
  check('the run completed', false, String(err?.message ?? err));
  failed = 1;
} finally {
  await browser.close();
  stop();
}

const bad = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad || failed ? 1 : 0);
