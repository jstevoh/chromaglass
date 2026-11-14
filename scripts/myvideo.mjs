#!/usr/bin/env node
/**
 * `npm run myvideo`: a video of one's own plays, pours, is read, and is
 * framed (PLAN 14ag). It replaces `npm run cartoons`, whose shelf is gone.
 *
 * What the owner reported (2026-11-13): "if I load my own background video I
 * can't 'pour' it, only load it to play. Let's just get rid of the demo videos
 * that can be poured or played. People can figure out their own videos. Also,
 * I'd like the visuals to be able to react to the video that's loaded." And:
 * zoom and move the video on the canvas for different dimensions, and the
 * video controls in a panel of their own.
 *
 * Read on main before the change: Settings → Film's Video file handed the file
 * to the projector and nowhere else; the desk's "Pour a video…" and the
 * phone's "A video as dye" poured a file and nowhere else; the shelves under
 * them (three demo loops, nine cartoons, 76 MB in public/video) were the only
 * videos with both. The film sense read the projector's film only, so a poured
 * video stirred nothing. The frame was always cover-fit and centred.
 *
 * Asked, with a 4 s 16:9 test pattern (scripts/fixtures/video), as a person
 * loads one, through the file chooser:
 *
 *   gone       public/video is not shipped, and neither the phone's dye sheet
 *              nor Settings' Video section has a cartoon or demo row in it
 *   phone      "A video as dye" pours the file: it plays (its time moves on,
 *              not paused once in two seconds, 14ab-1) and is the video the
 *              plate holds as its pour; the dye sheet then shows it under Your
 *              video with Play and Pour a thumb's height, Pour lit; Play puts
 *              the same file on the projector as the film while it still
 *              pours; Stop ends the pour and leaves the film; Play again takes
 *              the film off
 *   desk       Settings → Video's Video file plays the file as the film, and its
 *              row's Pour pours that same file, both lit together
 *   read       with Film Drive up and only the pour running (no film), the
 *              film sense runs, reads the poured video by its address, and
 *              gives a reading; with Film Drive at zero it does not run
 *   framing    Video Zoom, Across and Up are in the section with their ranges,
 *              Fit is off at the defaults and puts all three back; and where
 *              a plate runs (a GPU: the Mac's shard), the frame zoomed to a
 *              quarter leaves the plate's corner as it is with no film, and
 *              at 1 it does not, with the plate held still (play=0)
 *
 * A cloud session has no GPU: everything but the framing's pixels is the same
 * without a plate (a pour and a film are handed over whether or not the plate
 * can draw them), and the pixel line says it was not asked.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchChromium, port } from './chromium.mjs';
import { PIN_RANGE } from '../src/lib/deskPins.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const FIXTURE = resolve('scripts/fixtures/video/loop-16x9.webm');
const NAME = 'loop-16x9.webm';

check('no demo loops or cartoons ship: public/video is gone', !existsSync('public/video'), existsSync('public/video') ? 'public/video is still there' : 'absent');
const ranges = ['filmZoom', 'filmX', 'filmY'].map(k => [k, PIN_RANGE.get(k)]);
check('Video Zoom, Across and Up have one range each, in the Video section (zoom 0.25 to 4, the slides -1 to 1)',
  ranges.every(([k, r]) => r?.section === 'film' && (k === 'filmZoom' ? r.min === 0.25 && r.max === 4 : r.min === -1 && r.max === 1)),
  ranges.map(([k, r]) => `${k} ${r ? `${r.min}..${r.max} ${r.section}` : 'missing'}`).join(', '));

// ── In a browser ───────────────────────────────────────────────────
const PORT = port(4191, 'MYVIDEO_PORT');
const notes = [];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
await new Promise((ok, no) => {
  const bail = setTimeout(() => no(new Error('preview server did not start')), 30_000);
  server.stdout.on('data', d => { if (String(d).includes('localhost')) { clearTimeout(bail); ok(); } });
  server.stderr.on('data', d => { notes.push(String(d).trim()); });
  server.on('exit', c => { clearTimeout(bail); no(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
});
process.on('exit', () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } });

/** Every video the app plays, kept, so an element made in code and never put in the page can be found. */
const keepPlayed = () => {
  const played = (window.__cgPlayed = []);
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { if (!played.includes(this)) played.push(this); return play.call(this); };
};
/** What the plate holds: its pour and its film, by address, and whether a plate runs at all. */
const held = (page) => page.evaluate(() => {
  const h = window.__cgVideo?.();
  const plate = !document.querySelector('[data-testid="needs-webgpu"]') && typeof window.chromaglassDebug?.()?.hands === 'function';
  return h ? { pour: h.pour?.currentSrc || null, pourPaused: h.pour?.paused ?? null, film: h.film?.currentSrc || null, filmPaused: h.film?.paused ?? null, filmKind: h.filmKind, plate } : null;
});
/** How far an element moved in two seconds, and how often it paused. */
const clockOf = (page, which) => page.evaluate(async (which) => {
  const v = window.__cgVideo?.()?.[which];
  if (!v) return null;
  let pauses = 0;
  const count = () => pauses++;
  v.addEventListener('pause', count);
  const t0 = v.currentTime;
  await new Promise(r => setTimeout(r, 2000));
  v.removeEventListener('pause', count);
  // A 4 s loop may wrap inside the two seconds: count the wrap as the distance it went.
  const dur = Number.isFinite(v.duration) ? v.duration : 0;
  let moved = v.currentTime - t0;
  if (moved < 0 && dur) moved += dur;
  return { moved, pauses, paused: v.paused };
}, which);
const pressed = async (page, id) => (await page.getByTestId(id).getAttribute('aria-pressed').catch(() => null)) === 'true';
const height = (page, id) => page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().height ?? 0, id);
const shelfRows = (page, within) => page.evaluate((within) => {
  const root = document.querySelector(within) ?? document;
  return [...root.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid')).filter(t => /cartoon|film-demo/.test(t));
}, within);
const choose = async (page, click) => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15_000 }), click()]);
  await chooser.setFiles(FIXTURE);
};

const browser = await launchChromium(chromium, { headless: true });
try {
  // ── The phone ──
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(keepPlayed);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/?debug&look=classic&dpr=0.35&play=0`, { waitUntil: 'load' });
  for (let i = 0; i < 40 && !(await page.getByTestId('phone-stage').count()); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(800);
  await page.getByTestId('phone-open-dye').first().tap();
  await page.waitForTimeout(400);
  const phoneShelf = await shelfRows(page, '[data-testid="phone-sheet-dye"]');
  const emptyRow = await page.getByTestId('phone-video-loaded').count();
  check('the phone\'s dye sheet has no cartoon or demo row, and no Your video row before a video is loaded', phoneShelf.length === 0 && emptyRow === 0,
    `${phoneShelf.length} shelf rows (${phoneShelf.slice(0, 3).join(', ')}), ${emptyRow} video rows`);

  await choose(page, () => page.getByText('A video as dye').tap());
  await page.waitForTimeout(1500);
  const poured = await clockOf(page, 'pour');
  const pourHeld = await held(page);
  check('"A video as dye" pours the chosen file: it plays, is not paused once in two seconds (14ab-1), and is the video the plate holds as its pour',
    poured && poured.moved >= 1.2 && poured.pauses === 0 && pourHeld?.pour?.startsWith('blob:'),
    poured ? `${poured.moved.toFixed(2)} s on, ${poured.pauses} pauses, the plate's pour ${pourHeld?.pour ? pourHeld.pour.slice(0, 5) : 'none'}` : 'never played');

  await page.getByTestId('phone-open-dye').first().tap();
  await page.waitForTimeout(400);
  const name = await page.getByTestId('phone-video-name').textContent().catch(() => null);
  const hp = await height(page, 'phone-video-pour'), hf = await height(page, 'phone-video-film');
  const pourLit = await pressed(page, 'phone-video-pour'), filmLit0 = await pressed(page, 'phone-video-film');
  check('the dye sheet then shows it under Your video, by its name, with Play and Pour a thumb\'s height, Pour lit and Play not',
    name === NAME && hp >= 44 && hf >= 44 && pourLit && !filmLit0, `${name}, Pour ${Math.round(hp)} px ${pourLit ? 'lit' : 'not lit'}, Play ${Math.round(hf)} px ${filmLit0 ? 'lit' : 'not lit'}`);

  await page.getByTestId('phone-video-film').tap();
  await page.waitForTimeout(1500);
  const filmed = await clockOf(page, 'film');
  const both = await held(page);
  check('Play puts the same video on the projector as the film while it still pours, both lit',
    filmed && filmed.moved >= 1.2 && both?.filmKind === 'file' && both.film?.startsWith('blob:') && both.pour && !both.pourPaused
      && await pressed(page, 'phone-video-film') && await pressed(page, 'phone-video-pour'),
    `film ${both?.filmKind}, ${filmed ? `${filmed.moved.toFixed(2)} s on` : 'not playing'}, pour ${both?.pour ? (both.pourPaused ? 'paused' : 'playing') : 'none'}`);

  await page.getByTestId('phone-video-pour').tap();
  await page.waitForTimeout(500);
  const stopped = await held(page);
  check('Stop ends the pour (the plate lets go of it, the button says Pour again) and leaves the film playing',
    stopped && stopped.pour === null && stopped.filmKind === 'file' && stopped.filmPaused === false && !(await pressed(page, 'phone-video-pour'))
      && (await page.getByTestId('phone-video-pour').textContent())?.includes('Pour'),
    `pour ${stopped?.pour ?? 'none'}, film ${stopped?.filmKind} ${stopped?.filmPaused ? 'paused' : 'playing'}`);
  await page.getByTestId('phone-video-film').tap();
  await page.waitForTimeout(500);
  const off = await held(page);
  check('Play again takes the film off: the projector holds none, and the row stays, the video still loaded',
    off?.filmKind === 'none' && !(await pressed(page, 'phone-video-film')) && await page.getByTestId('phone-video-loaded').count() === 1,
    `film ${off?.filmKind}`);
  await ctx.close();

  // ── The desk ──
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desk.addInitScript(keepPlayed);
  const dp = await desk.newPage();
  dp.setDefaultTimeout(60_000);
  dp.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  await dp.goto(`http://localhost:${PORT}/?debug&look=classic&dpr=0.35&play=0`, { waitUntil: 'load' });
  await dp.getByTestId('open-all-settings').click();
  await dp.getByTestId('settings-nav-film').click();
  await dp.waitForTimeout(500);
  const section = '[data-testid="settings-panel"] #settings-film';
  const title = await dp.locator(`${section} h3`).first().textContent().catch(() => '');
  const deskShelf = await shelfRows(dp, section);
  check('Settings → Video is named Video and has no cartoon or demo row', title?.trim() === 'Video' && deskShelf.length === 0, `"${title?.trim()}", ${deskShelf.length} shelf rows`);

  await choose(dp, () => dp.locator(`${section} [data-testid="film-file"]`).click());
  await dp.waitForTimeout(1500);
  const row = `${section} [data-testid="film-video-row"]`;
  await dp.locator(`${row} [data-testid="video-pour"]`).click();
  await dp.waitForTimeout(1500);
  const dh = await held(dp);
  const dname = await dp.locator(`${row} [data-testid="video-name"]`).textContent().catch(() => null);
  const fl = await dp.locator(`${row} [data-testid="video-film"]`).getAttribute('aria-pressed');
  const pl = await dp.locator(`${row} [data-testid="video-pour"]`).getAttribute('aria-pressed');
  check('Video file plays the chosen file as the film, and its row\'s Pour pours that same file, both lit together',
    dname === NAME && dh?.filmKind === 'file' && dh.film?.startsWith('blob:') && dh.pour?.startsWith('blob:') && !dh.pourPaused && fl === 'true' && pl === 'true',
    `${dname}: film ${dh?.filmKind}, pour ${dh?.pour ? (dh.pourPaused ? 'paused' : 'playing') : 'none'}, Play ${fl}, Pour ${pl}`);

  // The film off, the pour on: what the sense reads is the pour.
  await dp.locator(`${row} [data-testid="video-film"]`).click();
  await dp.waitForTimeout(300);
  const zero = await dp.evaluate(() => window.__cgFilmSense?.() ?? null);
  await dp.evaluate(() => window.chromaglassSettings?.({ filmDrive: 0.6 }));
  await dp.waitForTimeout(1500);
  const sense = await dp.evaluate(() => window.__cgFilmSense?.() ?? null);
  const pourSrc = (await held(dp))?.pour;
  check('with Film Drive up and only the pour running, the film sense reads the poured video by its address and gives a reading; at zero it does not run',
    zero?.enabled === false && sense?.enabled && sense.src && sense.src === pourSrc && sense.ready,
    `at zero ${zero?.enabled ? 'running' : 'off'}; up: ${sense?.enabled ? 'running' : 'off'}, reads ${sense?.src === pourSrc ? 'the pour' : sense?.src ?? 'nothing'}, ready ${sense?.ready}, energy ${sense?.energy?.toFixed?.(3)}`);

  // Framing, in the section.
  await dp.locator(`${row} [data-testid="video-film"]`).click();
  await dp.waitForTimeout(800);
  const labels = await dp.evaluate((section) => [...document.querySelectorAll(`${section} [data-slider]`)].map(e => e.textContent ?? ''), section);
  const fitOff = await dp.locator(`${section} [data-testid="film-fit"]`).isDisabled();
  await dp.evaluate(() => window.chromaglassSettings?.({ filmZoom: 2, filmX: 0.3, filmY: -0.2 }));
  await dp.waitForTimeout(300);
  const fitOn = !(await dp.locator(`${section} [data-testid="film-fit"]`).isDisabled());
  await dp.locator(`${section} [data-testid="film-fit"]`).click();
  await dp.waitForTimeout(300);
  const back = await dp.evaluate(() => { const s = window.chromaglassSettings?.(); return s ? [s.filmZoom, s.filmX, s.filmY] : null; });
  check('Video Zoom, Across and Up are in the section; Fit is off at the defaults, on once framed, and puts all three back',
    ['Video Zoom', 'Video Across', 'Video Up'].every(l => labels.some(t => t.includes(l))) && fitOff && fitOn && JSON.stringify(back) === '[1,0,0]',
    `sliders ${['Video Zoom', 'Video Across', 'Video Up'].map(l => labels.some(t => t.includes(l)) ? l : `no ${l}`).join(', ')}; Fit ${fitOff ? 'off' : 'on'} then ${fitOn ? 'on' : 'off'}; after Fit ${JSON.stringify(back)}`);

  /*
    The frame where it lands, where a plate runs. The plate held still
    (play=0), the film at full mix with no key, a patch of the top-left
    corner is read with the film off, at Zoom 1 and at Zoom 0.25. At 1 the
    test pattern covers the corner; at a quarter the frame is a small box in
    the middle and the corner is the plate's own again. The other way round
    (the clamped edge row smeared out, as the sampler would without the mask)
    reads as the corner still changed at a quarter.
  */
  const plate = (await held(dp))?.plate;
  if (!plate) {
    check('the frame zoomed to a quarter leaves the corner as it is with no film (not asked: no plate runs here, no GPU)', true, 'the Mac\'s shard asks it');
  } else {
    await dp.keyboard.press('Escape');
    await dp.waitForTimeout(300);
    const canvas = dp.locator('canvas').first();
    const box = await canvas.boundingBox();
    // The patch's pixels, decoded in the page (a PNG's bytes are compressed, not colours).
    const corner = async () => {
      await dp.waitForTimeout(700);
      const png = await dp.screenshot({ clip: { x: box.x + box.width * 0.04, y: box.y + box.height * 0.04, width: 24, height: 24 } });
      return dp.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        return [...g.getImageData(0, 0, c.width, c.height).data];
      }, png.toString('base64'));
    };
    const diff = (a, b) => { let d = 0, n = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) { if (i % 4 === 3) continue; d += Math.abs(a[i] - b[i]); n++; } return d / Math.max(1, n); };
    await dp.evaluate(() => window.chromaglassSettings?.({ filmMix: 0, filmKey: 0, filmZoom: 1 }));
    const bare = await corner();
    await dp.evaluate(() => window.chromaglassSettings?.({ filmMix: 1 }));
    const full = await corner();
    await dp.evaluate(() => window.chromaglassSettings?.({ filmZoom: 0.25 }));
    const small = await corner();
    const dFull = diff(bare, full), dSmall = diff(bare, small);
    check('the frame zoomed to a quarter leaves the plate\'s corner as it is with no film, where at 1 the film covers it',
      dFull > 4 && dSmall < dFull / 4, `corner changed by ${dFull.toFixed(2)} at Zoom 1, ${dSmall.toFixed(2)} at Zoom 0.25 (mean levels of 255)`);
  }
  await desk.close();
} catch (e) {
  check('the page lives through Pour, Play and the framing', false, String(e?.message ?? e).split('\n')[0]);
} finally {
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 10_000))]);
  try { browser.process?.()?.kill('SIGKILL'); } catch { /* already gone */ }
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
