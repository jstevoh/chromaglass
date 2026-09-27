#!/usr/bin/env node
/**
 * The remote's Mixer, driven from a phone against a real display.
 *
 *   npm run remotemix   (builds, then about a minute; no GPU needed)
 *
 * The Mixer is one component in four places (lib/mixer.ts, MixerPanel): the
 * Perform desk, Settings, the phone layout and the remote. Three of those
 * are the same page as the show, and `npm run phone`, `panel` and `layout`
 * drive them. The remote is another page on another device, whose every
 * move goes over the show server's socket as a patch or an action, and
 * whose picture of the stack is only what the display last sent it. Nothing
 * drove it: a remote that drew the rows in the wrong order, or whose arrow
 * sent a patch the display ignored, would have passed everything (the gap
 * written into PLAN.md §11 while building step 1).
 *
 * So this starts the show server (server/remote-server.js, the one `npm run
 * show` starts on show night) and two browsers: the laptop's page, and a
 * phone opening the remote with the show key. Every question is asked of
 * the display's own settings (its `chromaglassSettings` debug hook), not of
 * what the remote draws, because what the remote draws is what the display
 * said, and a remote that only talked to itself would agree with itself:
 *
 * - it lists the display's rows in the display's order, top of the wall
 *   first, each control a thumb's size;
 * - an arrow on the phone moves that row in the display's stack, by the
 *   stack's own rule (`moveInMix`);
 * - a blend picked on the phone is the display's blend for that row;
 * - the level, stepped from the phone's slider, is the display's level;
 * - the take button (PLAN.md §11 step 4) walks the display's level down
 *   over the fade time set on the display with no jump, lights on the phone
 *   while it runs and then says "Fade in", and a second press brings it
 *   back; another row's button takes that row and not the front plate.
 *
 * No GPU is needed: without one the display shows its "needs WebGPU"
 * screen, and its settings, its socket and its fades run all the same.
 * What it does not say is how any of it looks on the wall.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';
import { mixStack, moveInMix } from '../src/lib/mixer.ts';

const PORT = Number(process.env.REMOTEMIX_PORT ?? 4193);
const KEY = '4321';
const BASE = `http://localhost:${PORT}`;

let failed = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

function startServer() {
  const proc = spawn(process.execPath, ['server/remote-server.js'], {
    env: { ...process.env, PORT: String(PORT), SHOW_KEY: KEY, OSC_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  return new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('the show server did not start')), 30_000);
    let said = '';
    proc.stdout.on('data', d => { said += String(d); if (said.includes('Show key')) { clearTimeout(bail); resolve(proc); } });
    proc.stderr.on('data', d => { said += String(d); });
    proc.on('exit', c => { clearTimeout(bail); reject(new Error(`the show server exited ${c}: ${said.slice(0, 300)}`)); });
  });
}
const stop = (proc) => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); } };

const server = await startServer();
const browser = await launchChromium(chromium, { headless: true });
const errors = [];
try {
  const display = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  display.on('pageerror', e => errors.push(`display: ${e.message}`));
  await display.goto(`${BASE}/?debug&look=classic&dpr=0.35&key=${KEY}`, { waitUntil: 'networkidle' });
  const shown = () => display.evaluate(() => window.chromaglassSettings?.());
  for (let i = 0; i < 40 && !(await shown()); i++) await display.waitForTimeout(250);

  const remote = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  remote.on('pageerror', e => errors.push(`remote: ${e.message}`));
  await remote.goto(`${BASE}/?remote=1&key=${KEY}`, { waitUntil: 'networkidle' });
  const P = 'remote-mixer-panel';
  // The remote keeps Blackout and Go in a bar pinned to the bottom of the
  // screen; a control scrolled only just into view sits under it, and a tap
  // there is the bar's. So each press brings its control to the middle first.
  const press = async (loc) => {
    await loc.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await remote.waitForTimeout(120);
    // A finger at the control's middle, not Playwright's own tap, whose
    // hit test calls a <summary> covered by its own <details>: whatever is
    // really on top there gets the touch, and the check after it says so.
    const b = await loc.boundingBox();
    await remote.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await remote.waitForTimeout(150);
  };
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { up = (await remote.getByTestId('remote-mixer').count()) > 0; if (!up) await remote.waitForTimeout(250); }
  check('the phone joins the show with its key and has a Mixer', up);
  if (!up) throw new Error('no remote Mixer to drive');
  await press(remote.getByTestId('remote-mixer').locator('summary'));
  await remote.waitForTimeout(400);

  // ── The display's rows, in the display's order ──────────────────
  // An order chosen here, not the default: a remote that never read the
  // display's order draws the default too, and agreed with a display on it.
  const CHOSEN = 'gel led front lumia film back mark';
  await display.evaluate((o) => window.chromaglassSettings({ mixOrder: o }), CHOSEN);
  const s0 = await shown();
  if (s0.mixOrder !== CHOSEN) throw new Error(`the display did not take ${CHOSEN}: ${s0.mixOrder}`);
  const want = [...mixStack(CHOSEN)].reverse().join(' ');
  const readRows = () => remote.$$eval(`[data-testid="${P}"] [data-row]`, els => els.map(e => e.getAttribute('data-row')).join(' '));
  let rows = await readRows();
  for (let i = 0; i < 20 && rows !== want; i++) { await remote.waitForTimeout(150); rows = await readRows(); }
  check('it lists the display\'s rows in the display\'s order, top of the wall first', rows === want, `${rows} (display: ${want})`);
  const sized = await remote.$$eval(`[data-testid="${P}"] button`, els => els
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map(e => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-testid') || e.textContent.trim(), w: r.width, h: r.height }; }));
  const small = sized.filter(b => Math.min(b.w, b.h) < 47.5).map(b => `${b.id} ${Math.round(b.w)}×${Math.round(b.h)} px`);
  const names = await remote.$$eval(`[data-testid="${P}"] [data-testid$="-name"]`, els => els.map(e => {
    const r = e.getBoundingClientRect(); let held = true;
    for (let a = e.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/hidden|clip|auto|scroll/.test(cs.overflowX)) { const q = a.getBoundingClientRect(); if (r.left < q.left - 0.5 || r.right > q.right + 0.5) held = false; }
    }
    return { t: e.textContent, whole: e.scrollWidth <= e.clientWidth && held };
  }));
  const cut = names.filter(n => !n.whole).map(n => n.t);
  if (sized.length < 14 || names.length !== 7) throw new Error(`measured ${sized.length} buttons and ${names.length} names: the panel is not open`);
  check('every button in it is a thumb\'s size, and every row\'s name is whole', small.length === 0 && cut.length === 0,
    [...small.slice(0, 4), ...cut.map(c => `${c} cut`)].join(', ') || 'all 48 px or more');

  // ── An arrow moves the display's stack ──────────────────────────
  const before = (await shown()).mixOrder;
  await press(remote.getByTestId(`${P}-film-down`).first());
  let after = before;
  for (let i = 0; i < 20 && after === before; i++) { await remote.waitForTimeout(150); after = (await shown()).mixOrder; }
  check('an arrow on the phone moves that row in the display\'s stack, by the stack\'s rule', after === moveInMix(before, 'film', -1) && after !== before,
    `${before} → ${after}`);
  await press(remote.getByTestId(`${P}-film-up`).first());
  for (let i = 0; i < 20 && (await shown()).mixOrder !== before; i++) await remote.waitForTimeout(150);
  check('and the other arrow puts it back', after !== before && (await shown()).mixOrder === before);

  // ── A blend picked on the phone ─────────────────────────────────
  await press(remote.getByTestId(`${P}-back-open`).first());
  await remote.waitForTimeout(300);
  await press(remote.getByTestId(`${P}-back-blend-add`).first());
  let blend = null;
  for (let i = 0; i < 20 && blend !== 'add'; i++) { await remote.waitForTimeout(150); blend = (await shown()).backBlend; }
  await press(remote.getByTestId(`${P}-back-blend-own`).first());
  let own = null;
  for (let i = 0; i < 20 && own !== 'own'; i++) { await remote.waitForTimeout(150); own = (await shown()).backBlend; }
  check('a blend picked on the phone is the display\'s blend for that row, and back', blend === 'add' && own === 'own', `${blend}, then ${own}`);
  await press(remote.getByTestId(`${P}-back-open`).first());

  // ── The level from the phone's slider ───────────────────────────
  const slider = remote.getByTestId(`${P}-frontLevel`).locator('input').first();
  await slider.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await slider.focus();
  await remote.keyboard.press('ArrowLeft');
  let lvl = 1;
  for (let i = 0; i < 20 && lvl === 1; i++) { await remote.waitForTimeout(150); lvl = (await shown()).frontLevel; }
  check('the front plate\'s level, stepped down on the phone, is the display\'s level', Math.abs(lvl - 0.99) < 1e-6, `${lvl}`);
  await remote.keyboard.press('ArrowRight');
  for (let i = 0; i < 20 && lvl !== 1; i++) { await remote.waitForTimeout(150); lvl = (await shown()).frontLevel; }

  // ── The take button, from the phone ─────────────────────────────
  /*
    At a fade time set on the display, one bar (two seconds at the 120 a
    display with no tempo counts), not the default two: a fade that ignored
    the row's own fade time, or counted three bars, passed a window as wide
    as two bars' was.
  */
  await display.evaluate(() => window.chromaglassSettings({ frontFade: 1 }));
  for (let i = 0; i < 20 && (await shown()).frontFade !== 1; i++) await display.waitForTimeout(100);
  const take = remote.getByTestId(`${P}-front-take`).first();
  const said = (await take.innerText()).trim();
  await press(take);
  const seen = [lvl];
  let lit = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    await display.waitForTimeout(100);
    seen.push((await shown()).frontLevel);
    if ((await take.getAttribute('aria-pressed')) === 'true') lit = true;
    if (seen[seen.length - 1] === 0) break;
  }
  const took = Date.now() - t0;
  const steps = seen.slice(1).map((v, i) => Math.abs(v - seen[i]));
  const down = seen.every((v, i) => !i || v <= seen[i - 1]);
  const between = new Set(seen.filter(v => v > 0 && v < 1)).size;
  check('the phone\'s take button says Fade out, and walks the display\'s front plate to 0 over the one bar its fade time is set to, never back up and never in a jump, lit on the phone while it runs',
    said === 'Fade out' && seen[seen.length - 1] === 0 && down && between >= 6 && Math.max(...steps) <= 0.2 && took >= 1500 && took <= 2700 && lit,
    `"${said}", 0 in ${took} ms (one bar at 120 is 2000) over ${between} levels, largest step ${Math.max(...steps).toFixed(3)}${lit ? '' : ', never lit on the phone'}${down ? '' : ', went back up'}`);
  let saysIn = '';
  for (let i = 0; i < 20 && saysIn !== 'Fade in'; i++) { await remote.waitForTimeout(150); saysIn = (await take.innerText()).trim(); }
  check('and then says Fade in, no longer lit', saysIn === 'Fade in' && (await take.getAttribute('aria-pressed')) !== 'true', `"${saysIn}"`);
  await press(take);
  let back = 0;
  for (let i = 0; i < 60 && back !== 1; i++) { await display.waitForTimeout(100); back = (await shown()).frontLevel; }
  check('and a second press brings it back to where it was', back === 1, `${back}`);
  // Another row's button takes that row, and not the front plate: every
  // button sending the front's action passed the front's checks.
  const backTake = remote.getByTestId(`${P}-back-take`).first();
  const backWas = (await shown()).backLevel;
  await press(backTake);
  let backNow = backWas;
  let frontHeld = true;
  for (let i = 0; i < 60 && backNow !== 0; i++) {
    await display.waitForTimeout(100);
    const s = await shown();
    backNow = s.backLevel;
    if (s.frontLevel !== 1) frontHeld = false;
  }
  check('the back plate\'s button takes the back plate out, and leaves the front plate where it is',
    backWas > 0 && backNow === 0 && frontHeld, `back ${backWas} → ${backNow}${frontHeld ? '' : ', the front plate moved'}`);
} catch (err) {
  check('the run completed', false, String(err).split('\n').slice(0, 12).join(' | '));
} finally {
  check('no page threw', errors.length === 0, errors.slice(0, 3).join('; '));
  await browser.close();
  stop(server);
}
console.log(`\n${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
