#!/usr/bin/env node
/**
 * Draw: the remote's whole screen as the wall's pad (PLAN §8-draw, the Desk v2
 * design's #3c phone and #3d iPad; src/components/DrawScreen.tsx).
 *
 *   npm run draw                 # builds, then about half a minute
 *   npm run draw -- --head       # watch it
 *
 * A real show server (server/remote-server.js) and a stand-in laptop on its
 * relay, which answers with a state and writes down every message the remote
 * sends: so what is judged is what reaches the laptop, not what the remote
 * drew. No plate is needed, so this runs in the Measure job.
 *
 *   opens on Draw   the remote's first screen is Draw, linked, on a phone and
 *                   an iPad, and nothing spills past the screen's edge
 *   the wall        the dashed frame is 16:9 and inside the pad; a touch is
 *                   placed in that frame (its middle is 0.5, 0.5; y up), and
 *                   a touch outside it lands on its edge. The control: the
 *                   old full pad stretched the wall over the whole pad, which
 *                   puts a touch 40 px above the frame at y ≈ 0.6, not 1
 *   the rails       every dye, tile and button is the design's touch size, and
 *                   the dye rail, the tool rail and the bottom bar overlap
 *                   nothing (on the phone, in its portrait and on its side)
 *   the tools       each tile sends its pad message (Stir is `finger`); a dye
 *                   picked is sent and rides the next drop; the bottle (iPad)
 *   Amount          2× doubles what a touch lays and 0.1× is the floor; the
 *                   value read against the same touch at 1×
 *   rings           a held finger draws a ring and two fingers two, counted in
 *                   the header; a lifted one leaves none
 *   buttons         Lucky, Clear, Freeze (pause, then play once the laptop says
 *                   it stopped), Blackout tapped once is one toggle, held is two
 *                   (dark while held), and on a dark wall a tap brings it up
 *   the layer       with two plates on the laptop, the phone's L tile and the
 *                   iPad's segmented row move the next touch to plate 2
 *   Controls        one tap away, remembered across a reload (a Gig remote
 *                   stays one), and its Draw button comes back
 *   wrong key       Draw says so, in the frame, rather than a silent pad
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { launchChromium } from './chromium.mjs';
import { DEFAULT_SETTINGS } from '../src/types.ts';

const PORT = Number(process.env.DRAW_PORT ?? 4197);
const KEY = '4321';
const BASE = `http://localhost:${PORT}`;
const HEADED = process.argv.includes('--head');
/** `-- --shots <dir>`: a picture of each screen, for the PR. */
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const shoot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

let failed = 0, total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, tol = 0.02) => typeof a === 'number' && Math.abs(a - b) <= tol;

const server = spawn(process.execPath, ['server/remote-server.js'], {
  env: { ...process.env, PORT: String(PORT), SHOW_KEY: KEY, OSC_PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe'], detached: true,
});
const stop = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } };
process.on('exit', stop);
await new Promise((resolve, reject) => {
  const bail = setTimeout(() => reject(new Error('the show server did not start')), 30_000);
  let said = '';
  server.stdout.on('data', d => { said += String(d); if (said.includes('Show key')) { clearTimeout(bail); resolve(); } });
  server.stderr.on('data', d => { said += String(d); });
  server.on('exit', c => { clearTimeout(bail); reject(new Error(`the show server exited ${c}: ${said.slice(0, 300)}`)); });
});

// The stand-in laptop: the display end of the relay.
const heard = [];
const laptop = new WebSocket(`ws://127.0.0.1:${PORT}/remote-ws`);
let snapshot = { settings: { ...DEFAULT_SETTINGS, layerCount: 1 }, activePresetId: 'classic', isActive: true, isAutomated: false, overlaysVisible: true, blackout: false };
const sendState = () => laptop.send(JSON.stringify({ type: 'state', state: snapshot }));
await new Promise((resolve, reject) => { laptop.once('open', resolve); laptop.once('error', reject); });
laptop.send(JSON.stringify({ type: 'hello', role: 'display', key: KEY }));
sendState();
laptop.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.type === 'request-state') { sendState(); return; }
  heard.push(m);
});
const setState = (patch) => { snapshot = { ...snapshot, ...patch, settings: { ...snapshot.settings, ...(patch.settings ?? {}) } }; sendState(); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
/** What the remote sent while `fn` ran, after the relay has carried it. */
const during = async (fn, settle = 300) => {
  const n = heard.length;
  await fn();
  await wait(settle);
  return heard.slice(n);
};

const browser = await launchChromium(chromium, { headless: !HEADED });
const errors = [];

async function device(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', e => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  // Fingers by hand: Playwright's tap is down-and-up at once, and a ring, a
  // hold and a drag need a finger that stays.
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 0.5 })),
  });
  const tapAt = async (x, y) => { await touch('touchStart', [[x, y]]); await touch('touchEnd', []); };
  const box = async (id) => page.getByTestId(id).first().boundingBox();
  const tap = async (id) => { const b = await box(id); await tapAt(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(60); };
  return { ctx, page, touch, tapAt, box, tap };
}
const linked = async (page) => {
  for (let t = 0; t < 10_000; t += 200) {
    if (await page.locator('[data-testid="remote-draw"][data-linked="true"]').count()) return true;
    await page.waitForTimeout(200);
  }
  return false;
};
/** Every box of these test ids, for overlap and size checks. */
const boxes = (page, sel) => page.$$eval(sel, els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, id: e.dataset.testid }; }));
const overlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const spills = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** The wall's frame, and a point in it in the plate's own terms (y up). */
const wallPoint = (w, fx, fy) => [w.x + fx * w.width, w.y + (1 - fy) * w.height];

async function wallChecks(d, label) {
  const w = await d.box('draw-wall');
  const pad = await d.box('remote-pad');
  check(`${label}: the wall's frame is 16:9`, near(w.width / w.height, 16 / 9, 0.02), `${w.width.toFixed(0)}×${w.height.toFixed(0)}`);
  check(`${label}: and inside the pad`, w.x >= pad.x - 0.5 && w.y >= pad.y - 0.5 && w.x + w.width <= pad.x + pad.width + 0.5 && w.y + w.height <= pad.y + pad.height + 0.5,
    `wall ${JSON.stringify(w)} pad ${JSON.stringify(pad)}`);
  const vw = await d.page.evaluate(() => window.innerWidth);
  check(`${label}: nothing spills past the screen's side`, (await spills(d.page)) <= 0 && w.x + w.width <= vw + 0.5);
  return w;
}

// ── The phone, #3c ──────────────────────────────────────────────────
{
  const d = await device(390, 844);
  const { page } = d;
  await page.goto(`${BASE}/?remote=1&key=${KEY}`, { waitUntil: 'networkidle' });
  check('phone: the remote opens on Draw', await page.getByTestId('remote-draw').isVisible().catch(() => false) && !(await page.getByTestId('remote-main').count()));
  check('phone: and is linked', await linked(page));
  check('phone: the phone layout', (await page.getByTestId('remote-draw').getAttribute('data-layout')) === 'phone');
  check('phone: it names the look', (await page.getByTestId('draw-linked').innerText()).includes('Classic'), await page.getByTestId('draw-linked').innerText());
  const w = await wallChecks(d, 'phone');

  // Sizes and rails.
  const dyes = await boxes(page, '[data-testid="draw-dye"]');
  check('phone: every dye is 44 square', dyes.length >= 8 && dyes.every(b => near(b.w, 44, 0.5) && near(b.h, 44, 0.5)), `${dyes.length} dyes`);
  const tiles = await boxes(page, '[data-testid^="draw-tool-"], [data-testid="draw-layer"]');
  check('phone: Drop, Blow, Press, Stir and the layer are 64 tiles', tiles.length === 5 && tiles.every(b => near(b.w, 64, 0.5) && near(b.h, 64, 0.5)), tiles.map(b => `${b.w}×${b.h}`).join(' '));
  const btns = await boxes(page, '[data-testid="draw-lucky"], [data-testid="draw-freeze"], [data-testid="draw-blackout"]');
  check('phone: Lucky, Freeze and Blackout are 52 tall', btns.length === 3 && btns.every(b => near(b.h, 52, 0.5)));
  const rails = await boxes(page, '[data-testid="draw-dyes"], [data-testid="draw-tools"], footer, header');
  const pairs = [];
  for (let i = 0; i < rails.length; i++) for (let j = i + 1; j < rails.length; j++) if (overlap(rails[i], rails[j])) pairs.push(`${i}/${j}`);
  check('phone: the dyes, the tools, the header and the bottom bar overlap nothing', rails.length === 4 && pairs.length === 0, pairs.join(' ') + ' ' + JSON.stringify(rails));
  const lastTile = tiles[tiles.length - 1], foot = await d.box('draw-footer');
  check('phone: the layer tile sits above the bottom bar', lastTile.y + lastTile.h <= foot.y + 0.5);

  // The wall: where a touch lands.
  let got = await during(() => d.tapAt(...wallPoint(w, 0.5, 0.5)));
  const mid = got.find(m => m.type === 'drop');
  check('phone: a tap on the wall\'s middle drops at 0.5, 0.5', mid && near(mid.x, 0.5) && near(mid.y, 0.5) && mid.layer === 0, JSON.stringify(mid));
  const base = mid?.amount;
  got = await during(() => d.tapAt(...wallPoint(w, 0.25, 0.75)));
  const q = got.find(m => m.type === 'drop');
  check('phone: a quarter in and a quarter down lands there (y up)', q && near(q.x, 0.25) && near(q.y, 0.75), JSON.stringify(q));
  got = await during(() => d.tapAt(w.x + w.width / 2, w.y - 40));
  const above = got.find(m => m.type === 'drop');
  check('phone: a touch above the frame lands on its top edge, not inside', above && near(above.y, 1, 0.001), JSON.stringify(above));

  // Rings and the count.
  const [ax, ay] = wallPoint(w, 0.3, 0.5), [bx, by] = wallPoint(w, 0.7, 0.5);
  await d.touch('touchStart', [[ax, ay]]);
  await page.waitForTimeout(100);
  const one = await page.locator('[data-testid="draw-ring"]').count();
  await d.touch('touchStart', [[ax, ay], [bx, by]]);
  await page.waitForTimeout(150);
  const two = await page.locator('[data-testid="draw-ring"]').count();
  const said = await page.getByTestId('draw-touches').innerText();
  await shoot(page, 'draw-phone');
  await d.touch('touchEnd', []);
  await page.waitForTimeout(150);
  const none = await page.locator('[data-testid="draw-ring"]').count();
  check('phone: a finger draws a ring, two fingers two, lifted none', one === 1 && two === 2 && none === 0, `${one} ${two} ${none}`);
  check('phone: the header counts the touches', said.trim() === '2 touches', said);

  // The tools.
  const drag = async () => {
    const [x0, y0] = wallPoint(w, 0.3, 0.4), [x1, y1] = wallPoint(w, 0.7, 0.6);
    await d.touch('touchStart', [[x0, y0]]);
    for (let i = 1; i <= 8; i++) { await d.touch('touchMove', [[x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8]]); await page.waitForTimeout(40); }
    await d.touch('touchEnd', []);
  };
  for (const [tile, type] of [['blow', 'blow'], ['press', 'press'], ['finger', 'finger']]) {
    await d.tap(`draw-tool-${tile}`);
    got = await during(drag);
    const kinds = new Set(got.filter(m => ['drop', 'blow', 'press', 'finger', 'spin'].includes(m.type)).map(m => m.type));
    check(`phone: ${tile === 'finger' ? 'Stir' : tile} sends ${type}`, kinds.size === 1 && kinds.has(type) && (await page.getByTestId(`draw-tool-${tile}`).getAttribute('aria-pressed')) === 'true', [...kinds].join(','));
  }
  const stir = got.find(m => m.type === 'finger');
  check('phone: Stir carries the stroke\'s direction (right and up)', stir && stir.dx > 0 && stir.dy > 0, JSON.stringify(stir));

  // A dye picked rides the next drop, and puts Drop back.
  const dye = page.getByTestId('draw-dye').nth(2);
  got = await during(async () => { const b = await dye.boundingBox(); await d.tapAt(b.x + 22, b.y + 22); });
  const sent = got.find(m => m.type === 'dye');
  check('phone: a dye picked is sent to the laptop', !!sent, JSON.stringify(got).slice(0, 120));
  check('phone: and is shown picked, with Drop', (await dye.getAttribute('aria-pressed')) === 'true' && (await page.getByTestId('draw-tool-drop').getAttribute('aria-pressed')) === 'true');
  got = await during(() => d.tapAt(...wallPoint(w, 0.5, 0.5)));
  check('phone: the next drop carries it', got.find(m => m.type === 'drop')?.color === sent?.color, JSON.stringify(got.find(m => m.type === 'drop')));

  // Amount.
  const setAmount = (v) => page.getByTestId('draw-amount').locator('input').evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  await setAmount(2);
  const twice = (await during(() => d.tapAt(...wallPoint(w, 0.5, 0.5)))).find(m => m.type === 'drop')?.amount;
  await setAmount(0.1);
  const least = (await during(() => d.tapAt(...wallPoint(w, 0.5, 0.5)))).find(m => m.type === 'drop')?.amount;
  await setAmount(1);
  check('phone: Amount 2× doubles what a touch lays', typeof base === 'number' && near(twice, Math.min(1, base * 2), 0.001), `${base} → ${twice}`);
  check('phone: and 0.1× is the floor the laptop reads', near(least, Math.max(0.05, base * 0.1), 0.001), `${least}`);
  check('phone: the value reads 1.0× again', (await page.getByTestId('draw-amount').innerText()).includes('1.0×'));

  // Buttons.
  got = await during(() => d.tap('draw-lucky'));
  check('phone: Lucky', got.some(m => m.type === 'action' && m.action === 'lucky'));
  got = await during(() => d.tap('draw-freeze'));
  check('phone: Freeze pauses the plate', got.some(m => m.type === 'action' && m.action === 'pause'));
  setState({ isActive: false });
  await page.waitForTimeout(300);
  check('phone: and reads Frozen once the laptop says so', (await page.getByTestId('draw-freeze').innerText()).trim() === 'Frozen');
  got = await during(() => d.tap('draw-freeze'));
  check('phone: then a tap plays it again', got.some(m => m.type === 'action' && m.action === 'play'));
  setState({ isActive: true });
  const toggles = (ms) => ms.filter(m => m.type === 'action' && m.action === 'blackout-toggle').length;
  got = await during(() => d.tap('draw-blackout'));
  check('phone: Blackout tapped is one toggle (a latched fade)', toggles(got) === 1, `${toggles(got)}`);
  setState({ blackout: true });
  await page.waitForTimeout(250);
  check('phone: and reads Dark', (await page.getByTestId('draw-blackout').innerText()).includes('Dark'));
  got = await during(() => d.tap('draw-blackout'));
  check('phone: a tap on a dark wall brings it up', toggles(got) === 1);
  setState({ blackout: false });
  await page.waitForTimeout(250);
  const bb = await d.box('draw-blackout');
  got = await during(async () => {
    await d.touch('touchStart', [[bb.x + bb.width / 2, bb.y + bb.height / 2]]);
    await wait(250);
    const mid = toggles(heard.slice(-5));
    await wait(450);
    await d.touch('touchEnd', []);
    check('phone: held, the wall goes dark at once', mid >= 1);
  });
  check('phone: and comes back when the thumb lifts (two toggles)', toggles(got) === 2, `${toggles(got)}`);

  // The layer.
  setState({ settings: { layerCount: 2 } });
  await page.waitForTimeout(300);
  await d.tap('draw-layer');
  check('phone: the layer tile steps to L2', (await page.getByTestId('draw-layer').innerText()).includes('L2'));
  got = await during(() => d.tapAt(...wallPoint(w, 0.5, 0.5)));
  check('phone: and the next touch is plate 2\'s', got.find(m => m.type === 'drop')?.layer === 1, JSON.stringify(got.find(m => m.type === 'drop')));
  setState({ settings: { layerCount: 1 } });

  // Controls, remembered.
  await d.tap('draw-controls');
  check('phone: Controls is one tap away', await page.getByTestId('remote-main').isVisible().catch(() => false));
  await page.reload({ waitUntil: 'networkidle' });
  check('phone: and is still Controls after a reload', await page.getByTestId('remote-main').isVisible().catch(() => false) && !(await page.getByTestId('remote-draw').count()));
  await page.getByTestId('remote-pad-fullscreen').evaluate(el => el.scrollIntoView({ block: 'center' }));
  await d.tap('remote-pad-fullscreen');
  check('phone: its Draw button comes back', await page.getByTestId('remote-draw').isVisible().catch(() => false));
  await d.ctx.close();
}

// ── The phone on its side: the phone layout still, and still fits ───
{
  const d = await device(844, 390);
  await d.page.goto(`${BASE}/?remote=1&key=${KEY}`, { waitUntil: 'networkidle' });
  await linked(d.page);
  await shoot(d.page, 'draw-phone-side');
  check('landscape: still the phone layout', (await d.page.getByTestId('remote-draw').getAttribute('data-layout')) === 'phone');
  const lw = await wallChecks(d, 'landscape');
  // 316 wide with the portrait bottom bar on a side-held phone, before the bar went to one row.
  check('landscape: the wall gets the height (frame at least 420 wide)', lw.width >= 420, `${lw.width.toFixed(0)}×${lw.height.toFixed(0)}`);
  const rails = await boxes(d.page, '[data-testid="draw-dyes"], [data-testid="draw-tools"], footer, header');
  const clash = [];
  for (let i = 0; i < rails.length; i++) for (let j = i + 1; j < rails.length; j++) if (overlap(rails[i], rails[j])) clash.push(`${i}/${j}`);
  check('landscape: the rails and the bars overlap nothing', clash.length === 0, clash.join(' '));
  await d.ctx.close();
}

// ── The iPad, #3d ───────────────────────────────────────────────────
for (const [vw, vh, label] of [[1180, 820, 'iPad'], [820, 1180, 'iPad upright']]) {
  const d = await device(vw, vh);
  const { page } = d;
  await page.goto(`${BASE}/?remote=1&key=${KEY}`, { waitUntil: 'networkidle' });
  check(`${label}: opens on Draw, linked`, await linked(page));
  check(`${label}: the iPad layout`, (await page.getByTestId('remote-draw').getAttribute('data-layout')) === 'tablet');
  const w = await wallChecks(d, label);
  const tools = await d.box('draw-tools'), dyes = await d.box('draw-dyes');
  check(`${label}: tools on the left (104), dyes on the right (88)`, near(tools.x, 0, 1) && near(tools.width, 104, 1) && near(dyes.x + dyes.width, vw, 1) && near(dyes.width, 88, 1));
  const tiles = await boxes(page, '[data-testid^="draw-tool-"]');
  check(`${label}: four tool tiles 72 tall`, tiles.length === 4 && tiles.every(b => near(b.h, 72, 0.5)));
  const sw = await boxes(page, '[data-testid="draw-dye"]');
  check(`${label}: dyes 56`, sw.length >= 8 && sw.every(b => near(b.w, 56, 0.5) && near(b.h, 56, 0.5)));
  const btns = await boxes(page, '[data-testid="draw-lucky"], [data-testid="draw-clear"], [data-testid="draw-freeze"], [data-testid="draw-blackout"]');
  check(`${label}: Lucky, Clear, Freeze, Blackout at 56`, btns.length === 4 && btns.every(b => near(b.h, 56, 0.5)) && btns.every(b => b.x + b.w <= vw + 0.5));

  // A dye picked, for the picture (after the sizes: a tile just tapped is mid-press).
  await page.getByTestId('draw-dye').nth(1).tap();
  await page.waitForTimeout(300);
  await shoot(page, `draw-${label.replace(' ', '-').toLowerCase()}`);
  let got = await during(() => d.tapAt(...wallPoint(w, 0.5, 0.5)));
  const mid = got.find(m => m.type === 'drop');
  check(`${label}: the wall's middle is 0.5, 0.5`, mid && near(mid.x, 0.5) && near(mid.y, 0.5), JSON.stringify(mid));
  if (label === 'iPad') {
    await page.getByTestId('draw-bottle-soap').scrollIntoViewIfNeeded();
    got = await during(() => d.tap('draw-bottle-soap'));
    check('iPad: a bottle picked pours on the laptop', got.some(m => m.type === 'liquid' && m.id === 'soap'));
    got = await during(() => d.tap('draw-clear'));
    check('iPad: Clear', got.some(m => m.type === 'action' && m.action === 'clear'));
    check('iPad: no layer row with one plate', (await page.getByTestId('draw-layers').count()) === 0);
    setState({ settings: { layerCount: 2 } });
    await page.waitForTimeout(300);
    await d.tap('draw-layer-1');
    got = await during(() => d.tapAt(...wallPoint(w, 0.5, 0.5)));
    check('iPad: Layer 2 picked, the next touch is plate 2\'s', got.find(m => m.type === 'drop')?.layer === 1);
    setState({ settings: { layerCount: 1 } });
  }
  await d.ctx.close();
}

// ── Wrong key ───────────────────────────────────────────────────────
{
  const d = await device(390, 844);
  await d.page.goto(`${BASE}/?remote=1&key=0000`, { waitUntil: 'networkidle' });
  let said = '';
  for (let t = 0; t < 8000 && !said.includes('Wrong show key'); t += 200) { said = await d.page.getByTestId('draw-waiting').innerText().catch(() => ''); await d.page.waitForTimeout(200); }
  check('wrong key: Draw says so in the frame', said.includes('Wrong show key'), said);
  await d.ctx.close();
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
laptop.close();
stop();
console.log(`\n${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
