/**
 * The tilt pad (PLAN 18a-13f): a joystick for Gravity and Tilt Direction.
 *
 *   npm run tiltpad
 *
 * What the owner asked (2026-10-21): "We need a tipping control on desktop. I
 * don't want to just rely on the iPhone control. Something that replicates a
 * joystick maybe?" Tipping the plate was the phone's motion sensor, or two
 * faders (Gravity, then Tilt Direction) that cannot be moved together, so a
 * laptop had no way to tip one way and then the other, the gesture that makes
 * the liquid slop (npm run slosh).
 *
 * Two halves. The first is pure and asks what the disc means: the compass the
 * plate already uses (0 the top, 90 the right, 180 the bottom), Gravity rising
 * from a dead ring to the rim, and that the way out and the way back are the
 * same map. The second is the real app in a browser, because a joystick is a
 * pointer, a spring and two settings changing together, and none of that is in
 * the arithmetic:
 *
 *   1. Dragging to the right of the middle sets Tilt Direction 90 and a
 *      Gravity that grows with the distance, read back from the Physics
 *      panel's own knobs (a second reader of the settings, not the pad's echo
 *      of them).
 *   2. With Spring off the puck stays where the pointer left it.
 *   3. With Spring on, letting go returns the settings to what they were when
 *      the puck was grabbed, not to level: a look that stands the plate up
 *      keeps its own tilt after the hand has used the pad.
 *   4. Past the rim the puck stays on it and the bearing keeps following the
 *      pointer; a double-click, Escape and Home level it; arrow keys tip it.
 *   5. Every tilt the pad sends is one patch of both settings, so no frame
 *      sees a new bearing at the old Gravity.
 *   6. The phone's Play sheet has a pad a thumb's size that a real touch
 *      (Input.dispatchTouchEvent) drives, springs back, and that the motion
 *      sensor's Tilt takes over from.
 *   7. The remote draws one too, through the real show server: a finger on it
 *      tips the display's plate and lifting springs the display back.
 *
 * Runs in a cloud session (the pad is DOM) and in Measure's browser part after
 * a build. `npm run tiltpad` builds first.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';
import { clickAt } from './layoutProbe.mjs';
import {
  PAD_DEAD, PAD_SPRING_MS, bearingName, padKey, padToTilt, pointerToPad, springAt, tiltToPad,
} from '../src/lib/tiltPad.ts';

const PORT = Number(process.env.TILTPAD_PORT ?? 4207);
const HEADED = process.argv.includes('--head');

let failed = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
/** The shortest way round the compass between two bearings. */
const apart = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// ── What the disc means ─────────────────────────────────────────────

{
  const at = (x, y) => padToTilt(x, y);
  const R = 0.8;
  const [up, right, down, left] = [at(0, R), at(R, 0), at(0, -R), at(-R, 0)];
  check('the compass is the plate\'s: the top is 0, the right 90, the bottom 180, the left 270',
    up.direction === 0 && right.direction === 90 && down.direction === 180 && left.direction === 270,
    `${up.direction} ${right.direction} ${down.direction} ${left.direction}`);
  const diag = at(0.5, 0.5);
  const diagDown = at(0.5, -0.5);
  check('and y is up on the pad: up and to the right is 45, down and to the right 135',
    diag.direction === 45 && diagDown.direction === 135, `${diag.direction} ${diagDown.direction}`);
  check('the same distance in any direction is the same Gravity',
    [up, right, down, left].every(t => t.upright === up.upright), [up, right, down, left].map(t => t.upright).join(' '));
  check(`inside the dead ring (${PAD_DEAD} of the radius) the plate is level, and just outside it is not`,
    at(PAD_DEAD * 0.9, 0).upright === 0 && at(0, 0).upright === 0 && at(PAD_DEAD * 3, 0).upright > 0,
    `${at(PAD_DEAD * 0.9, 0).upright} ${at(PAD_DEAD * 3, 0).upright}`);
  check('Gravity is 0 at the dead ring, 1 at the rim and about half at half-way',
    at(1, 0).upright === 1 && near(at(0.53, 0).upright, 0.5, 0.01), `${at(1, 0).upright} ${at(0.53, 0).upright}`);
  check('a point past the rim is the rim: Gravity 1, and the bearing still follows',
    at(3, 3).upright === 1 && at(3, 3).direction === 45 && at(-2, 0).direction === 270,
    `${at(3, 3).upright}@${at(3, 3).direction} ${at(-2, 0).direction}`);

  // The way back: a setting to a point and the point to the setting, over the whole range.
  let worstU = 0;
  let worstD = 0;
  let n = 0;
  for (let u = 0.05; u <= 1.0001; u += 0.05) {
    for (let d = 0; d < 360; d += 5) {
      const p = tiltToPad(u, d);
      const t = padToTilt(p.x, p.y);
      worstU = Math.max(worstU, Math.abs(t.upright - u));
      worstD = Math.max(worstD, apart(t.direction, d));
      n++;
    }
  }
  check('a setting drawn on the pad and read back is the same setting, everywhere',
    worstU <= 0.0101 && worstD <= 1, `${n} points: Gravity within ${worstU.toFixed(4)}, bearing within ${worstD}°`);
  check('Gravity 0 is the middle of the pad whatever the bearing says',
    tiltToPad(0, 90).x === 0 && tiltToPad(0, 270).y === 0 && tiltToPad(0, 33).x === 0);

  const box = { left: 100, top: 50, width: 200, height: 200 };
  const mid = pointerToPad(200, 150, box);
  const r = pointerToPad(300, 150, box);
  const out = pointerToPad(900, 150, box);
  const top = pointerToPad(200, 50, box);
  check('a pointer at the box\'s middle is the middle, at its right edge the rim, above the middle is up',
    mid.x === 0 && mid.y === 0 && near(r.x, 1, 1e-9) && near(top.y, 1, 1e-9), `${mid.x},${mid.y} ${r.x},${r.y} ${top.x},${top.y}`);
  check('a pointer far outside the box is clamped to the rim in the same direction',
    near(Math.hypot(out.x, out.y), 1, 1e-9) && out.x > 0.999, `${out.x},${out.y}`);

  const k = padKey('ArrowRight', { x: 0, y: 0 });
  const kk = padKey('ArrowUp', k);
  const big = padKey('ArrowRight', { x: 0, y: 0 }, true);
  check('arrow keys step the puck across the pad, shift a bigger step, other keys do nothing',
    k && near(k.x, 0.1, 1e-9) && kk && near(kk.y, 0.1, 1e-9) && big && near(big.x, 0.3, 1e-9) && padKey('a', { x: 0, y: 0 }) === null,
    `${k?.x} ${kk?.y} ${big?.x}`);
  const s0 = springAt({ x: 0.8, y: -0.4 }, { x: 0, y: 0.2 }, 0);
  const s1 = springAt({ x: 0.8, y: -0.4 }, { x: 0, y: 0.2 }, 1);
  const half = springAt({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.5).x;
  check('the spring starts where it was let go, ends exactly where it was grabbed, and is past half-way by half the time',
    s0.x === 0.8 && s0.y === -0.4 && s1.x === 0 && near(s1.y, 0.2, 1e-12) && half > 0.5, `${s0.x},${s0.y} ${s1.x},${s1.y} half ${half}`);
  check('bearings have words', bearingName(0) === 'up' && bearingName(90) === 'right' && bearingName(225) === 'down and left');
}

// ── In a browser ────────────────────────────────────────────────────

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

const URL = `http://localhost:${PORT}/?debug&look=classic&dpr=0.35&play=0`;
const browser = await launchChromium(chromium, { headless: !HEADED });
const pageErrors = [];

try {
  // ── The desk ──────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60_000);
    page.on('pageerror', e => { pageErrors.push(e.message); console.log('  [pageerror]', e.message.slice(0, 200)); });
    const settle = (ms = 300) => page.waitForTimeout(ms);
    await page.goto(URL, { waitUntil: 'networkidle' });
    for (let i = 0; i < 40 && (await page.getByTestId('mode-segmented-perform').count()) === 0; i++) await settle();
    await clickAt(page, 'mode-segmented-perform');
    for (let i = 0; i < 40 && (await page.getByTestId('tilt-pad').count()) === 0; i++) await settle();

    const pad = () => page.getByTestId('tilt-pad');
    const read = () => page.evaluate(() => {
      const el = document.querySelector('[data-testid="tilt-pad"]');
      return el ? { u: Number(el.getAttribute('data-upright')), d: Number(el.getAttribute('data-direction')), dragging: el.hasAttribute('data-dragging') } : null;
    });
    const rect = async () => (await pad().boundingBox());
    /** The pad's disc: the middle and the rim's radius in pixels (the svg has a margin round it). */
    const disc = async () => {
      const b = await rect();
      const inset = b.width * (0.08 / 2.16);
      return { cx: b.x + b.width / 2, cy: b.y + b.height / 2, r: b.width / 2 - inset };
    };
    const at = async (fx, fy) => { const c = await disc(); return [c.cx + fx * c.r, c.cy - fy * c.r]; };

    check('the Gig desk has a Tilt panel with a pad in it', (await pad().count()) === 1 && (await page.getByTestId('panel-tilt').count()) === 1);
    // The deck scrolls sideways: bring the pad into view before aiming a pointer at it.
    await pad().scrollIntoViewIfNeeded();
    await settle();
    const b0 = await rect();
    check('the pad is big enough to use with a mouse', b0 && b0.width >= 140 && b0.height >= 140, b0 ? `${Math.round(b0.width)}×${Math.round(b0.height)}` : 'none');
    const inside = b0 && b0.x >= 0 && b0.y >= 0 && b0.x + b0.width <= 1440 && b0.y + b0.height <= 900;
    check('and on the screen, whole, so a drag can start anywhere on it', inside, b0 ? `${Math.round(b0.x)},${Math.round(b0.y)} to ${Math.round(b0.x + b0.width)},${Math.round(b0.y + b0.height)} of 1440×900` : 'none');
    /*
      Adding a panel to the Gig desk must not push the way into every setting
      off the screen: the first draft docked this under Rides, which stopped
      Rides filling its column, and the Mac's `qa` found "All settings…" at
      y=965 on a 900 px window. The same question is asked here, but this is
      not the guard: with the first draft's layout put back, this line still
      passed in a cloud session (its Rides panel is shorter than the Mac's), so
      only the Mac's `qa` can fail on it. It stays as a cheap second look.
    */
    const way = await page.evaluate(() => {
      const e = document.querySelector('[data-testid="open-all-settings"]');
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), ok: r.top >= 0 && r.bottom <= window.innerHeight && r.width > 40 };
    });
    check('and the Gig desk still has a visible way into every setting', way && way.ok, way ? `All settings… at y=${way.top}–${way.bottom} of 900` : 'no button');
    const deckBox = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="panel-tilt"]');
      const q = (id) => d?.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
      const panel = d?.getBoundingClientRect();
      const parts = ['tilt-pad', 'tilt-says', 'tilt-spring', 'tilt-level'].map(q);
      return panel && parts.every(Boolean) ? { clipped: parts.filter(r => r.bottom > panel.bottom + 0.5 || r.top < panel.top - 0.5).length } : null;
    });
    check('and nothing in the panel is cut off by its frame', deckBox && deckBox.clipped === 0, deckBox ? `${deckBox.clipped} parts outside` : 'no panel');

    // The look's own tilt, to come back to.
    const home = await read();
    check('it opens on the look\'s own tilt, drawn as it is', home && home.u >= 0 && home.u <= 1, `Gravity ${home?.u}, bearing ${home?.d}`);

    // 2: Spring off, drag to the right and let go.
    const springOn = () => page.evaluate(() => document.querySelector('[data-testid="tilt-spring"]')?.getAttribute('aria-checked') === 'true');
    check('Spring back is on by default, as a joystick is', await springOn());
    await clickAt(page, 'tilt-spring');
    await settle();
    check('and the switch turns it off', !(await springOn()));

    const [sx, sy] = await at(0, 0);
    const [rx, ry] = await at(0.8, 0);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move((sx + rx) / 2, (sy + ry) / 2, { steps: 4 });
    await page.mouse.move(rx, ry, { steps: 4 });
    await settle(150);
    const held = await read();
    const during = await rect();
    check('the pad stays put under the pointer while it tips (its column does not change width with the readout)',
      Math.abs(during.x - b0.x) < 0.5 && Math.abs(during.width - b0.width) < 0.5, `x ${b0.x.toFixed(1)} → ${during.x.toFixed(1)}`);
    check('dragging to the right of the middle tips the plate to the right: bearing 90, Gravity about 0.79',
      held && held.dragging && apart(held.d, 90) <= 2 && near(held.u, 0.79, 0.03), `Gravity ${held?.u}, bearing ${held?.d}`);
    await page.mouse.up();
    await settle(400);
    const kept = await read();
    check('with Spring off the puck stays where the pointer left it',
      kept && !kept.dragging && apart(kept.d, 90) <= 2 && near(kept.u, 0.79, 0.03), `Gravity ${kept?.u}, bearing ${kept?.d}`);

    // 1: the plate's own settings (the debug hook reads what the solver is given), a second reader and not the pad's echo of them.
    const plate = () => page.evaluate(() => { const s = window.chromaglassSettings?.(); return s ? { u: s.plateUpright, d: s.tiltDirection } : null; });
    const gl = await plate();
    check('the settings the plate is given say the same: Gravity and Tilt Direction as the pad draws them',
      gl && gl.u === kept.u && gl.d === kept.d, `settings ${gl?.u}@${gl?.d}, pad ${kept.u}@${kept.d}`);

    // 3: Spring on: let go and it goes home to where it was grabbed (here the right, held above).
    await clickAt(page, 'tilt-spring');
    await settle();
    check('turned back on', await springOn());
    const [gx, gy] = await at(-0.6, -0.6);
    await page.mouse.move(sx, sy);
    await page.mouse.move(gx, gy);
    await page.mouse.down();
    await page.mouse.move(gx, gy, { steps: 3 });
    await settle(150);
    const away = await read();
    check('and dragged to the lower left it runs lower left: bearing 225',
      away && apart(away.d, 225) <= 4 && away.u > 0.5, `Gravity ${away?.u}, bearing ${away?.d}`);
    await page.mouse.up();
    // The return is PAD_SPRING_MS long; sample before it is over and after.
    await settle(Math.round(PAD_SPRING_MS / 2));
    const mid = await read();
    await settle(PAD_SPRING_MS + 300);
    const back = await read();
    check('let go, the puck returns to where it was grabbed, to the same hundredth and degree: not to level',
      back && back.u === kept.u && back.d === kept.d && (await plate()).u === kept.u && (await plate()).d === kept.d,
      `grabbed at ${kept.u}@${kept.d}, back at ${back?.u}@${back?.d}, settings ${(await plate())?.u}@${(await plate())?.d}`);
    check('and it travelled there (it was on its way half-way through, not already home or still away)',
      mid && !(mid.u === kept.u && mid.d === kept.d) && !(mid.u === away.u && mid.d === away.d),
      `away ${away?.u}@${away?.d}, mid ${mid?.u}@${mid?.d}, home ${kept.u}@${kept.d}`);

    // 4: past the rim; double-click; keys.
    const c = await disc();
    await page.mouse.move(c.cx, c.cy);
    await page.mouse.down();
    await page.mouse.move(c.cx + c.r * 1.8, c.cy - c.r * 1.8, { steps: 6 });
    await settle(120);
    const rim = await read();
    check('dragged well past the rim, up and to the right, Gravity is 1 and the bearing 45',
      rim && rim.u === 1 && apart(rim.d, 45) <= 2, `Gravity ${rim?.u}, bearing ${rim?.d}`);
    await page.mouse.move(c.cx - c.r * 2.2, c.cy - c.r * 0.1, { steps: 6 });
    await settle(120);
    const swung = await read();
    check('and swung round to the far left, the bearing follows while Gravity stays 1',
      swung && swung.u === 1 && apart(swung.d, 270) <= 6, `Gravity ${swung?.u}, bearing ${swung?.d}`);
    await page.mouse.up();
    await settle(PAD_SPRING_MS + 300);

    await clickAt(page, 'tilt-spring');   // off, so what follows is a held tilt
    await settle();
    await page.mouse.move(c.cx, c.cy);
    await page.mouse.down();
    await page.mouse.move(c.cx, c.cy + c.r * 0.7, { steps: 4 });
    await page.mouse.up();
    await settle(200);
    const held2 = await read();
    await pad().dblclick({ position: { x: (await rect()).width / 2, y: (await rect()).height / 2 } });
    await settle(200);
    const flat = await read();
    check('a double-click on the pad levels the plate (Gravity 0)', held2.u > 0.5 && flat.u === 0, `${held2.u} then ${flat.u}`);

    await pad().focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await settle(150);
    const keyed = await read();
    check('three presses of the right arrow tip it to the right by a third of the way (Gravity about 0.3)',
      apart(keyed.d, 90) <= 1 && near(keyed.u, 0.26, 0.04), `Gravity ${keyed.u}, bearing ${keyed.d}`);
    await page.keyboard.press('Escape');
    await settle(150);
    check('Escape levels it', (await read()).u === 0);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Home');
    await settle(150);
    check('and so does Home', (await read()).u === 0);

    // 5: one patch for both settings. Watch the pad's own attributes change in the same frame while a drag sweeps the bearing.
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="tilt-pad"]');
      window.__tiltSeen = [];
      const mo = new MutationObserver(() => {
        window.__tiltSeen.push([Number(el.getAttribute('data-upright')), Number(el.getAttribute('data-direction'))]);
      });
      mo.observe(el, { attributes: true, attributeFilter: ['data-upright', 'data-direction'] });
    });
    await page.mouse.move(c.cx, c.cy);
    await page.mouse.down();
    await page.mouse.move(c.cx + c.r * 0.7, c.cy, { steps: 3 });
    await page.mouse.move(c.cx - c.r * 0.7, c.cy, { steps: 10 });
    await page.mouse.up();
    await settle(150);
    const seen = await page.evaluate(() => window.__tiltSeen);
    // Every state the pad rendered is a point the disc can make: a bearing paired with a Gravity from another moment would not be.
    const consistent = seen.every(([u, d]) => {
      if (u === 0) return true;
      const p = tiltToPad(u, d);
      const t = padToTilt(p.x, p.y);
      return near(t.upright, u, 0.011) && apart(t.direction, d) <= 1;
    });
    check('every state the plate was given while sweeping across is a real point on the disc (both settings arrive together)',
      seen.length > 3 && consistent, `${seen.length} states`);

    // The Slosh dial is in the panel too, beside the pad.
    check('the Tilt panel carries the Slosh dial, since a tipped plate slops only as far as that allows',
      (await page.getByTestId('panel-tilt').getByText('Slosh').count()) >= 1);
    check('and no page error came during any of it', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ── The phone ─────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60_000);
    page.on('pageerror', e => { pageErrors.push(e.message); console.log('  [pageerror]', e.message.slice(0, 200)); });
    await page.goto(URL, { waitUntil: 'load' });
    for (let i = 0; i < 40 && !(await page.getByTestId('phone-stage').count()); i++) await page.waitForTimeout(250);
    await page.waitForTimeout(800);
    await page.getByTestId('phone-open-play').first().tap();
    await page.waitForTimeout(500);
    const pad = page.getByTestId('phone-tilt-pad');
    check('the phone\'s Play sheet has a tilt pad', (await pad.count()) === 1 && (await pad.isVisible()));
    const b = await pad.boundingBox();
    check('a thumb\'s size: 200 px or more a side, inside the screen',
      b && b.width >= 200 && b.height >= 200 && b.x >= 0 && b.x + b.width <= 390, b ? `${Math.round(b.width)}×${Math.round(b.height)} at ${Math.round(b.x)},${Math.round(b.y)}` : 'none');
    const read = () => page.evaluate(() => {
      const el = document.querySelector('[data-testid="phone-tilt-pad"]');
      return el ? { u: Number(el.getAttribute('data-upright')), d: Number(el.getAttribute('data-direction')), off: el.getAttribute('aria-disabled') === 'true' } : null;
    });
    // A look that stands the plate up, so "back where it was" and "level" are not the same place.
    await page.evaluate(() => window.chromaglassSettings({ plateUpright: 0.5, tiltDirection: 135 }));
    await page.waitForTimeout(300);
    const home = await read();
    check('given a look with the plate stood up (Gravity 0.5 toward the lower right), the pad draws it', home && home.u === 0.5 && home.d === 135, `${home?.u}@${home?.d}`);
    const inset = b.width * (0.08 / 2.16);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const rr = b.width / 2 - inset;
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await touch('touchStart', cx, cy);
    await touch('touchMove', cx - rr * 0.4, cy);
    await touch('touchMove', cx - rr * 0.8, cy);
    await page.waitForTimeout(200);
    const down = await read();
    check('a finger dragged to the left of the middle runs the liquid left: bearing 270, Gravity about 0.79',
      down && apart(down.d, 270) <= 3 && near(down.u, 0.79, 0.04), `Gravity ${down?.u}, bearing ${down?.d}`);
    await touch('touchEnd');
    await page.waitForTimeout(PAD_SPRING_MS + 400);
    const back = await read();
    check('lifted, it springs back to the look\'s own tilt, as the desk\'s does',
      back && back.u === home.u && back.d === home.d, `was ${home.u}@${home.d}, now ${back?.u}@${back?.d}`);
    check('and the page did not scroll or zoom under the drag (touch-action is none on the pad)',
      (await pad.evaluate(el => getComputedStyle(el).touchAction)) === 'none');
    check('the phone\'s Spring switch is there, and Slosh is on the same sheet',
      (await page.getByTestId('phone-tilt-spring').count()) === 1 && (await page.getByTestId('phone-slosh').count()) === 1);
    check('no page error on the phone', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ── The remote: a phone linked to a display through the real show server ──
  {
    const RPORT = PORT + 1;
    const KEY = '5309';
    const relay = spawn(process.execPath, ['server/remote-server.js'], {
      env: { ...process.env, PORT: String(RPORT), SHOW_KEY: KEY, OSC_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    const stopRelay = () => { try { process.kill(-relay.pid, 'SIGTERM'); } catch { relay.kill('SIGTERM'); } };
    process.on('exit', stopRelay);
    try {
      await new Promise((resolve, reject) => {
        const bail = setTimeout(() => reject(new Error('the show server did not start')), 30_000);
        let said = '';
        relay.stdout.on('data', d => { said += String(d); if (said.includes('Show key')) { clearTimeout(bail); resolve(); } });
        relay.stderr.on('data', d => { said += String(d); });
        relay.on('exit', c => { clearTimeout(bail); reject(new Error(`the show server exited ${c}: ${said.slice(0, 300)}`)); });
      });
      const base = `http://localhost:${RPORT}`;
      const display = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      display.on('pageerror', e => pageErrors.push(`display: ${e.message}`));
      await display.goto(`${base}/?debug&look=classic&dpr=0.35&key=${KEY}`, { waitUntil: 'networkidle' });
      const shown = () => display.evaluate(() => window.chromaglassSettings?.());
      for (let i = 0; i < 40 && !(await shown()); i++) await display.waitForTimeout(250);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const remote = await ctx.newPage();
      remote.on('pageerror', e => pageErrors.push(`remote: ${e.message}`));
      await remote.goto(`${base}/?remote=1&key=${KEY}`, { waitUntil: 'networkidle' });
      await remote.getByTestId('draw-controls').tap();
      let up = false;
      for (let i = 0; i < 60 && !up; i++) { up = (await remote.getByTestId('remote-tilt-pad').count()) > 0; if (!up) await remote.waitForTimeout(250); }
      check('the remote joins the show with its key and has a tilt pad', up);
      if (!up) throw new Error('no remote tilt pad to drive');
      const pad = remote.getByTestId('remote-tilt-pad');
      await pad.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await remote.waitForTimeout(400);
      await display.evaluate(() => window.chromaglassSettings({ plateUpright: 0.5, tiltDirection: 135 }));
      await remote.waitForTimeout(600);
      const d0 = await shown();
      check('the display has a look with the plate stood up (Gravity 0.5 toward the lower right)', d0.plateUpright === 0.5 && d0.tiltDirection === 135, `${d0.plateUpright}@${d0.tiltDirection}`);
      const b = await pad.boundingBox();
      const inset = b.width * (0.08 / 2.16);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const rr = b.width / 2 - inset;
      const cdp = await ctx.newCDPSession(remote);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      await touch('touchStart', cx, cy);
      await touch('touchMove', cx, cy + rr * 0.4);
      await touch('touchMove', cx, cy + rr * 0.8);
      let tipped = null;
      for (let i = 0; i < 20; i++) {
        await remote.waitForTimeout(100);
        const s = await shown();
        if (s.plateUpright > 0.5) { tipped = s; break; }
      }
      check('a finger on the remote\'s pad tips the display\'s plate: dragged down, the display is given bearing 180 and Gravity about 0.79',
        tipped && apart(tipped.tiltDirection, 180) <= 3 && near(tipped.plateUpright, 0.79, 0.05),
        tipped ? `display: Gravity ${tipped.plateUpright}, bearing ${tipped.tiltDirection}` : `display stayed at ${(await shown()).plateUpright}`);
      await touch('touchEnd');
      let home = null;
      for (let i = 0; i < 30; i++) {
        await remote.waitForTimeout(100);
        const s = await shown();
        if (s.plateUpright === d0.plateUpright && s.tiltDirection === d0.tiltDirection) { home = s; break; }
      }
      check('lifted, the display\'s plate goes back to the tilt it had (0.5 lower right), not to level',
        !!home, home ? `${home.plateUpright}@${home.tiltDirection}` : `still ${(await shown()).plateUpright}`);
      check('no page error on the display or the remote', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
      await ctx.close();
    } finally {
      stopRelay();
    }
  }
} finally {
  await browser.close();
  stopServer();
}

console.log(`\n${total - failed}/${total} ok`);
if (failed > 0) process.exit(1);
