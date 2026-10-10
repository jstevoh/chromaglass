#!/usr/bin/env node
/**
 * The wall under Draw's pad (PLAN 8-draw-a; lib/padPicture.ts, DrawScreen).
 *
 *   npm run drawwall               # builds, then about half a minute; no GPU
 *   node --experimental-strip-types scripts/drawwall.mjs --app
 *                                  # the real laptop's frames (CI's macOS runner)
 *
 * Reported: Draw's frame was black. The remote got the laptop's settings and
 * not its picture, so a hand drew blind on the phone. Found while building
 * the fix: the pad's touches were the plate's points, and the wall shows the
 * middle of a plate half again as wide, turned with the dish. A touch at the
 * frame's top edge went to plate y = 1, off the wall, so with a picture
 * under the finger the colour would have landed somewhere else than it.
 *
 * Without a GPU (the Measure job): a real show server, the stand-in laptop's
 * state from a socket (as `npm run draw`), and a second stand-in display, a
 * browser page running the real `PadPictureSender` (bundled from src/) on a
 * canvas painted in four coloured quarters, 4:3, the shape a 16:9 frame
 * would get wrong. Judged on the remote, which is where the feature is:
 *
 *   asks only on Draw   no picture is sent before a remote asks; on Draw it
 *                       renews the lease every second, as wide as its frame;
 *                       in Controls it stops asking and the laptop stops
 *                       sending inside the lease's three seconds
 *   the picture         lands in the frame, painted: each quarter's colour
 *                       in its own quarter (the right way up, not mirrored),
 *                       at least 8 a second, under 60 kB each
 *   the wall's shape    the frame takes the picture's 4:3, says "wall 4:3",
 *                       and a touch at its middle is 0.5, 0.5 and its corner
 *                       the corner, every pad message marked `wall`
 *   a stalled laptop    pictures that stop dim the frame, so a frozen one is
 *                       not passed off as the wall now
 *
 * With `--app` (needs WebGPU frames: the Mac): the real app is the laptop.
 * The pictures are its frame task's (the only place a WebGPU canvas can be
 * read), not black, and the same colour as the plate photographed by its
 * own `grabFrame`; and on a dish turned a radian, a drop from the pad off the
 * middle changes the picture under the finger more than anywhere else. The
 * controls: the same point mapped without the dish's turn lands elsewhere on
 * the wall, and sent the old way (no `wall`, the plate's point) it does not
 * land there either, which is the bug the mapping fixes.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { build } from 'esbuild';
import { launchChromium } from './chromium.mjs';
import { installFrameReader } from './frame.mjs';
import { DEFAULT_SETTINGS } from '../src/types.ts';

const APP = process.argv.includes('--app');
const PORT = Number(process.env.DRAWWALL_PORT ?? 4198);
const KEY = '4321';
const BASE = `http://localhost:${PORT}`;

let failed = 0, total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, tol = 0.02) => typeof a === 'number' && Math.abs(a - b) <= tol;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

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

const browser = await launchChromium(chromium, { headless: true });
const errors = [];

async function phone(width = 844, height = 390) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', e => errors.push(`remote: ${e.message}`));
  const cdp = await ctx.newCDPSession(page);
  const tapAt = async (x, y) => {
    const pt = [{ x, y, id: 0, radiusX: 4, radiusY: 4, force: 0.5 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await page.goto(`${BASE}/?remote=1&key=${KEY}`, { waitUntil: 'networkidle' });
  for (let t = 0; t < 10_000; t += 200) {
    if (await page.locator('[data-testid="remote-draw"][data-linked="true"]').count()) break;
    await page.waitForTimeout(200);
  }
  return { ctx, page, tapAt, box: () => page.getByTestId('draw-wall').boundingBox() };
}
const framesOf = async (page) => Number(await page.getByTestId('draw-picture').getAttribute('data-frames'));
/** The remote's painted picture as a G×H grid of mean colours (its own canvas, top row first). */
const gridOf = (page, G = 8, H = 6) => page.getByTestId('draw-picture').evaluate((c, [G, H]) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const out = [];
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < G; gx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.floor(gy * c.height / H); y < Math.floor((gy + 1) * c.height / H); y++)
      for (let x = Math.floor(gx * c.width / G); x < Math.floor((gx + 1) * c.width / G); x++) {
        const i = (y * c.width + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
    out.push([r / n, g / n, b / n]);
  }
  return out;
}, [G, H]);

try {
  if (!APP) {
    // ── The stand-in laptop's state, as `npm run draw` ─────────────────
    const heard = [];
    const laptop = new WebSocket(`ws://127.0.0.1:${PORT}/remote-ws`);
    const snapshot = { settings: { ...DEFAULT_SETTINGS, layerCount: 1 }, activePresetId: 'classic', isActive: true, isAutomated: false, overlaysVisible: true, blackout: false };
    await new Promise((resolve, reject) => { laptop.once('open', resolve); laptop.once('error', reject); });
    laptop.send(JSON.stringify({ type: 'hello', role: 'display', key: KEY }));
    laptop.send(JSON.stringify({ type: 'state', state: snapshot }));
    laptop.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === 'request-state') laptop.send(JSON.stringify({ type: 'state', state: snapshot }));
      else heard.push(m);
    });

    // ── The picture's laptop: the real sender, on a painted canvas ─────
    const bundle = (await build({ entryPoints: ['src/lib/padPicture.ts'], bundle: true, format: 'iife', globalName: 'PP', write: false, logLevel: 'silent' })).outputFiles[0].text;
    const wall = await (await browser.newContext({ viewport: { width: 400, height: 300 } })).newPage();
    wall.on('pageerror', e => errors.push(`wall: ${e.message}`));
    // On the show server's own origin, as the laptop's page is: from about:blank
    // (an opaque origin) CI's Chromium never opened the socket at all.
    await wall.goto(`${BASE}/remote-info.json`);
    await wall.addScriptTag({ content: bundle });
    await wall.evaluate(({ url, key }) => {
      const c = document.createElement('canvas');
      c.width = 960; c.height = 720;   // 4:3
      (document.body ?? document.documentElement).append(c);
      const ctx = c.getContext('2d');
      // Four quarters, and a texture over them so the JPEG is a picture's size, not a flat one's.
      const paint = (t) => {
        const q = [['#ff0000', 0, 0], ['#00ff00', 480, 0], ['#0000ff', 0, 360], ['#ffffff', 480, 360]];
        for (const [col, x, y] of q) { ctx.fillStyle = col; ctx.fillRect(x, y, 480, 360); }
        ctx.globalAlpha = 0.25;
        for (let i = 0; i < 120; i++) {
          ctx.fillStyle = `hsl(${(i * 37 + t / 20) % 360} 80% 50%)`;
          ctx.beginPath(); ctx.arc((i * 97) % 960, (i * 53 + t / 10) % 720, 6 + (i % 5) * 3, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      };
      const ws = new WebSocket(url);
      window.__asked = [];
      window.__sentWidths = [];
      window.__drawing = true;
      const sender = new window.PP.PadPictureSender((m) => { window.__sentWidths.push(m.w); ws.send(JSON.stringify(m)); });
      window.__sender = sender;
      window.__heard = {};
      window.__ws = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', role: 'display', key }));
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        window.__heard[m.type] = (window.__heard[m.type] ?? 0) + 1;
        if (m.type === 'pad-picture') { window.__asked.push({ width: m.width, at: performance.now() }); sender.want(m.width); }
      };
      const loop = (t) => { if (window.__drawing) { paint(t); sender.tap(c); } requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }, { url: `ws://localhost:${PORT}/remote-ws`, key: KEY });
    for (let t = 0; t < 10_000 && (await wall.evaluate(() => window.__ws.readyState)) !== 1; t += 200) await wait(200);
    check('the stand-in laptop is on the relay', (await wall.evaluate(() => window.__ws.readyState)) === 1);
    await wait(1500);
    check('nothing is sent before a remote asks', (await wall.evaluate(() => window.__sender.sent)) === 0);

    const d = await phone();
    const { page } = d;
    // ── Asks only on Draw ─────────────────────────────────────────────
    // From the first ask: a slow runner links late, and the gaps are what is judged.
    for (let t = 0; t < 15_000 && (await wall.evaluate(() => window.__asked.length)) === 0; t += 200) await wait(200);
    await page.waitForTimeout(3200);
    const asked = await wall.evaluate(() => window.__asked);
    const why = asked.length ? '' : `; the laptop heard ${JSON.stringify(await wall.evaluate(() => window.__heard))}, the remote is ${await page.evaluate(() => document.visibilityState)}, linked ${await page.getByTestId('remote-draw').getAttribute('data-linked')}`;
    const w0 = await d.box();
    const gaps = asked.slice(1).map((a, i) => a.at - asked[i].at);
    check('on Draw the remote asks every second', asked.length >= 3 && gaps.every(g => g > 700 && g < 1500), `${asked.length} asks, gaps ${gaps.map(g => g.toFixed(0)).join(' ')}${why}`);
    check('as wide as its frame', asked.length > 0 && Math.abs(asked[asked.length - 1].width - Math.round(w0.width)) <= 1, `${asked.at(-1)?.width} vs ${w0.width.toFixed(0)}`);
    const widths = await wall.evaluate(() => window.__sentWidths);
    // The last: the frame narrowed from 16:9 to the picture's 4:3 on the first one, and asked again.
    check('and the picture is that wide (inside 160–480)', widths.length > 0 && widths.at(-1) === Math.max(160, Math.min(480, asked.at(-1).width)), `${widths.slice(-3).join(' ')}`);

    // ── The picture ───────────────────────────────────────────────────
    const f0 = await framesOf(page);
    await page.waitForTimeout(3000);
    const rate = ((await framesOf(page)) - f0) / 3;
    check('the picture lands in the frame, at least 8 a second', rate >= 8, `${rate.toFixed(1)}/s`);
    const { sent, bytes, via } = await wall.evaluate(() => ({ sent: window.__sender.sent, bytes: window.__sender.bytes, via: window.__sender.via }));
    // Off the page's idle time: toBlob there gave the Mac's busy show 2 a second.
    check('encoded in a worker', via === 'worker', via);
    check('each under 60 kB', sent > 0 && bytes / sent < 60_000, `${(bytes / Math.max(1, sent) / 1000).toFixed(1)} kB`);
    const pic = await page.getByTestId('draw-picture').boundingBox();
    const w1 = await d.box();
    check('the picture fills the frame', pic && near(pic.x, w1.x, 1.5) && near(pic.y, w1.y, 1.5) && near(pic.width, w1.width, 3) && near(pic.height, w1.height, 3),
      `${JSON.stringify(pic)} in ${JSON.stringify(w1)}`);
    const g = await gridOf(page, 2, 2);
    const is = ([r, gg, b], want) => want.every((v, i) => (v ? [r, gg, b][i] > 140 : [r, gg, b][i] < 110));
    check('each quarter in its own quarter (the right way up, not mirrored)',
      is(g[0], [1, 0, 0]) && is(g[1], [0, 1, 0]) && is(g[2], [0, 0, 1]) && is(g[3], [1, 1, 1]),
      g.map(c => c.map(v => v.toFixed(0)).join(',')).join(' | '));
    check('the picture is shown, not hidden', (await page.getByTestId('draw-picture').evaluate(c => getComputedStyle(c).opacity)) === '1');

    // ── The wall's shape ──────────────────────────────────────────────
    check('the frame takes the picture\'s 4:3', near(w1.width / w1.height, 4 / 3, 0.02), `${w1.width.toFixed(0)}×${w1.height.toFixed(0)}`);
    check('and says so', (await page.getByTestId('draw-wall').innerText()).includes('wall 4:3'));
    let n = heard.length;
    await d.tapAt(w1.x + w1.width / 2, w1.y + w1.height / 2);
    await wait(300);
    const mid = heard.slice(n).find(m => m.type === 'drop');
    check('a touch at its middle is 0.5, 0.5, marked as the wall\'s', mid && near(mid.x, 0.5) && near(mid.y, 0.5) && mid.wall === true, JSON.stringify(mid));
    n = heard.length;
    await d.tapAt(w1.x + w1.width * 0.9, w1.y + w1.height * 0.1);
    await wait(300);
    const corner = heard.slice(n).find(m => m.type === 'drop');
    check('near its top right corner is 0.9, 0.9', corner && near(corner.x, 0.9) && near(corner.y, 0.9) && corner.wall === true, JSON.stringify(corner));

    // ── Controls: the asking stops, and so do the pictures ────────────
    await page.getByTestId('draw-controls').tap();
    await page.waitForTimeout(3500);
    const s1 = await wall.evaluate(() => window.__sender.sent);
    await page.waitForTimeout(1000);
    const s2 = await wall.evaluate(() => window.__sender.sent);
    check('in Controls the laptop stops sending inside the lease', s1 === s2 && !(await wall.evaluate(() => window.__sender.wanted)), `${s1} → ${s2}`);

    // ── A stalled laptop dims the frame ──────────────────────────────
    await page.getByTestId('remote-pad-fullscreen').evaluate(el => el.scrollIntoView({ block: 'center' }));
    await page.getByTestId('remote-pad-fullscreen').tap();
    await page.waitForTimeout(1500);
    const before = await page.getByTestId('draw-picture').evaluate(c => getComputedStyle(c).opacity);
    await wall.evaluate(() => { window.__drawing = false; });
    await page.waitForTimeout(3000);
    const after = await page.getByTestId('draw-picture').evaluate(c => getComputedStyle(c).opacity);
    check('back on Draw the picture comes back, and dims when the laptop stops drawing', before === '1' && Number(after) < 0.5, `${before} → ${after}`);
    await d.ctx.close();
    laptop.close();
  } else {
    // ── The real laptop ───────────────────────────────────────────────
    const CALM = {
      turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0, rainDrip: 0, glassSmear: 0,
      vibrationFrequency: 0, centerGravity: 0, rotationSpeed: 0, spinImpulse: 0, bubbles: 0,
      audioMappings: { velocity: 'none', density: 'none', color: 'none', rotation: 'none' },
    };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installFrameReader(ctx);
    const display = await ctx.newPage();
    display.on('pageerror', e => errors.push(`display: ${e.message}`));
    await display.goto(`${BASE}/?debug&look=classic&key=${KEY}`, { waitUntil: 'networkidle' });
    for (let i = 0; i < 120 && !((await display.evaluate(() => window.chromaglassDebug?.()?.frames ?? 0)) > 30); i++) await display.waitForTimeout(250);
    await display.evaluate((c) => window.chromaglassSettings?.(c), CALM);
    const d = await phone();
    const { page } = d;
    const f0 = await framesOf(page);
    await page.waitForTimeout(3000);
    const rate = ((await framesOf(page)) - f0) / 3;
    check('the laptop\'s own frames reach Draw, at least 8 a second', rate >= 8, `${rate.toFixed(1)}/s`);
    const pad = await display.evaluate(() => window.chromaglassDebug?.()?.padPicture);
    check('each under 60 kB', pad && pad.sent > 0 && pad.bytes / pad.sent < 60_000, JSON.stringify(pad));
    const mean = (grid) => [0, 1, 2].map(i => grid.reduce((s, c) => s + c[i], 0) / grid.length);
    const remoteMean = mean(await gridOf(page, 4, 3));
    const frame = await display.evaluate(() => window.__cgFrame(64, 36));
    const plateMean = frame ? [0, 1, 2].map(i => { let s = 0; for (let p = i; p < frame.length; p += 4) s += frame[p]; return s / (frame.length / 4); }) : null;
    check('the picture is not black', Math.max(...remoteMean) > 12, remoteMean.map(v => v.toFixed(0)).join(','));
    check('and is the plate\'s colour (against its own grabFrame)', plateMean && remoteMean.every((v, i) => Math.abs(v - plateMean[i]) < 20),
      `pad ${remoteMean.map(v => v.toFixed(0)).join(',')} plate ${plateMean?.map(v => v.toFixed(0)).join(',')}`);

    /*
      Where a drop lands, on a turned dish. The dish is set to a radian round
      (with CALM it holds there), and four drops go to a point off the
      middle; the picture's 8×6 grid is read before and after, and the
      change's centre (the cells over three medians, weighted) must sit on
      the point, its most changed cell the point's own. Two controls, sent
      straight onto the relay as an older remote would (no \`wall\`):
      - the same point through the camera with the dish's turn left out,
        which is on the wall by construction (same distance from the middle)
        and must land elsewhere: the turn is part of the mapping;
      - the point as the plate's own (the old pad), which must not land
        there either (off the wall, or somewhere else on it).
    */
    const G = 8, H = 6, U = 0.6875, V = 0.5833, TURN = 1.0;
    await display.evaluate((a) => window.chromaglassRotation?.([a, a]), TURN);
    await display.waitForTimeout(300);
    const cellOf = (u, v) => Math.min(G - 1, Math.floor(u * G)) + Math.min(H - 1, Math.floor((1 - v) * H)) * G;
    const change = (a, b) => a.map((c, i) => Math.abs(c[0] - b[i][0]) + Math.abs(c[1] - b[i][1]) + Math.abs(c[2] - b[i][2]));
    const settle = async () => { await page.waitForTimeout(1500); return gridOf(page, G, H); };
    const judge = (diff) => {
      const want = cellOf(U, V);
      const order = diff.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
      const median = [...diff].sort((a, b) => a - b)[Math.floor(diff.length / 2)];
      let su = 0, sv = 0, sw = 0;
      diff.forEach((v, i) => {
        const wgt = Math.max(0, v - 3 * median);
        su += wgt * ((i % G) + 0.5) / G; sv += wgt * (1 - (Math.floor(i / G) + 0.5) / H); sw += wgt;
      });
      const at = sw > 0 ? [su / sw, sv / sw] : null;
      return { want, top: order[0][1], peak: order[0][0], here: diff[want], median, at, off: at ? Math.hypot(at[0] - U, at[1] - V) : Infinity };
    };
    const say = (j) => `cell ${j.want}: ${j.here.toFixed(0)}, most changed ${j.top} (${j.peak.toFixed(0)}), median ${j.median.toFixed(0)}, centre ${j.at ? j.at.map(v => v.toFixed(2)).join(',') : 'none'}`;
    const w = await d.box();
    const a0 = await settle();
    const drift = Math.max(...change(a0, await settle()));
    const b0 = await gridOf(page, G, H);
    for (let i = 0; i < 4; i++) { await d.tapAt(w.x + U * w.width, w.y + (1 - V) * w.height); await page.waitForTimeout(120); }
    const hit = judge(change(b0, await settle()));
    check('a drop from the pad lands under the finger on a turned dish', hit.top === hit.want && hit.off < 0.1 && hit.peak > 3 * Math.max(hit.median, drift),
      `${say(hit)}, drift ≤ ${drift.toFixed(0)}`);
    const old = new WebSocket(`ws://127.0.0.1:${PORT}/remote-ws`);
    await new Promise((resolve, reject) => { old.once('open', resolve); old.once('error', reject); });
    old.send(JSON.stringify({ type: 'hello', role: 'controller', key: KEY }));
    await wait(300);
    const sendOld = async (x, y) => {
      const c0 = await gridOf(page, G, H);
      for (let i = 0; i < 4; i++) { old.send(JSON.stringify({ type: 'drop', x, y, layer: 0, amount: 0.5 })); await wait(120); }
      return judge(change(c0, await settle()));
    };
    const flat = await display.evaluate(([u, v]) => window.chromaglassDebug?.()?.wallToPlate(u, v, 0, false), [U, V]);
    const unturned = flat ? await sendOld(flat.x, flat.y) : null;
    check('the control: through the camera without the dish\'s turn, it lands on the wall elsewhere',
      unturned && unturned.peak > 3 * Math.max(unturned.median, drift) && unturned.top !== unturned.want && unturned.off > 0.15,
      unturned ? say(unturned) : 'no wallToPlate on the display');
    const plain = await sendOld(U, V);
    check('the control: as the plate\'s own point (the old pad), it does not land there', plain.top !== plain.want && plain.off > 0.15, say(plain));
    const held = await display.evaluate(() => window.chromaglassDebug?.()?.rotation?.current ?? null);
    check('and the dish held its turn throughout', Array.isArray(held) ? Math.abs(held[0] - TURN) < 0.05 : Math.abs(Number(held) - TURN) < 0.05, JSON.stringify(held));
    old.close();
    await d.ctx.close();
  }
} catch (e) {
  check('ran to the end', false, String(e?.stack ?? e).slice(0, 400));
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
stop();
console.log(`\n${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
