#!/usr/bin/env node
/**
 * `npm run cartoons`: the cartoons that ship with the app (PLAN 14ab-2,
 * src/lib/cartoons.ts) are there, are small, are silent, are recorded, and
 * really play: poured as dye on the phone without the pour stuttering
 * (PLAN 14ab-1), and filmed through the projector.
 *
 * What the owner asked for (2026-10-24) was each whole cartoon, looping, to
 * feed the plate. So the checks are about that feature, not about a frame:
 *
 *   the files   each one the list names is on disk, an MP4 whose index comes
 *               before its picture (so it plays while it arrives: a file whose
 *               `moov` is at the end has to arrive whole before a frame shows),
 *               with an H.264 track and no sound track, as long as the list
 *               says within a second, under 10 MB (30 MB for a feature, a film
 *               over a quarter of an hour), and the shelf under 80 MB.
 *               The sizes are the web's budget (PLAN 14v): nothing here is
 *               fetched at load, but a phone pays for the one it picks.
 *   colour      each cartoon's `colour` flag is what its decoded picture
 *               shows: five frames across the film, read back in the browser,
 *               the middle one's mean colourfulness (the spread of red,
 *               green and blue in a pixel) over 15 for a colour cartoon and
 *               under 1 for a grey one. Measured 2026-10-27 on the shelf
 *               (0.0 for every grey cartoon, 30 to 82 for the colour ones),
 *               so the bars sit in the gap. It holds the file to what the
 *               list says, and fails a colour print that was encoded grey.
 *   recorded    `public/video/cartoons/SOURCES.md` names every file, so no
 *               cartoon ships without its source and licence written down.
 *   the pour    on a phone, the dye sheet lists every cartoon with a Pour and
 *               a Film button a thumb's height (44 px), and Pour starts the
 *               cartoon playing: its time moves on, its picture can be read
 *               back (same origin, so the plate may read it; a blank or
 *               tainted read would pour nothing), over two seconds it is
 *               paused not once, sent near its end it comes round to its start
 *               (the loop), and it is the video the plate holds as its pour
 *               (`__cgVideo` under ?debug), so a video that plays but was never
 *               handed over fails. Before 14ab-1's fix the app handed the
 *               video over every frame and the plate paused and played it each
 *               time; measured with that code put back, the phone's page closed
 *               under the pour inside the two seconds. Stop then pauses that
 *               same element, the plate lets go of it, and the button says
 *               Pour again.
 *   the film    Film plays the cartoon as the projector's film: its time
 *               moves on, it loops, it is the element the projector holds, and
 *               the button shows pressed; pressed again, that element is
 *               paused and the projector holds no film.
 *
 * A cloud session has no GPU, but none of this needs one: the pour's video
 * plays and is handed over whether or not the plate can draw it.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { launchChromium } from './chromium.mjs';
import { CARTOONS } from '../src/lib/cartoons.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const MB = 1024 * 1024;

// ── The files ──────────────────────────────────────────────────────
/** The top-level boxes of an MP4, and what the movie box says. */
function mp4(buf) {
  const top = [];
  for (let at = 0; at + 8 <= buf.length;) {
    let size = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    if (size === 1) size = Number(buf.readBigUInt64BE(at + 8));
    else if (size === 0) size = buf.length - at;
    top.push({ type, at, size });
    if (size < 8) break;
    at += size;
  }
  const moov = top.find(b => b.type === 'moov');
  const inMoov = moov ? buf.subarray(moov.at, moov.at + moov.size) : Buffer.alloc(0);
  // Handlers name each track's kind: 'vide' for a picture, 'soun' for sound.
  const handlers = [];
  for (let i = inMoov.indexOf('hdlr'); i >= 0; i = inMoov.indexOf('hdlr', i + 4)) handlers.push(inMoov.toString('latin1', i + 12, i + 16));
  const mvhd = inMoov.indexOf('mvhd');
  let seconds = NaN;
  if (mvhd >= 0) {
    const v = inMoov[mvhd + 4];
    seconds = v === 1
      ? Number(inMoov.readBigUInt64BE(mvhd + 4 + 4 + 16 + 4)) / inMoov.readUInt32BE(mvhd + 4 + 4 + 16)
      : inMoov.readUInt32BE(mvhd + 4 + 4 + 8 + 4) / inMoov.readUInt32BE(mvhd + 4 + 4 + 8);
  }
  return { order: top.map(b => b.type), handlers, avc: inMoov.includes('avc1'), seconds };
}

const sources = readFileSync('public/video/cartoons/SOURCES.md', 'utf8');
// A feature (over a quarter of an hour) is allowed three times a short's size.
const capMB = (c) => (c.seconds > 900 ? 30 : 10);
let total = 0;
for (const c of CARTOONS) {
  const path = `public${c.src}`;
  if (!existsSync(path)) { check(`${c.title}: ${path} is there`, false); continue; }
  const bytes = statSync(path).size;
  total += bytes;
  const m = mp4(readFileSync(path));
  const moovFirst = m.order.indexOf('moov') >= 0 && m.order.indexOf('moov') < m.order.indexOf('mdat');
  check(`${c.title}: an H.264 MP4 with its index first and no sound, as long as the list says, under ${capMB(c)} MB`,
    moovFirst && m.avc && m.handlers.includes('vide') && !m.handlers.includes('soun') && Math.abs(m.seconds - c.seconds) <= 1 && bytes <= capMB(c) * MB,
    `${m.order.join(' ')}; tracks ${m.handlers.join(',')}; ${m.seconds.toFixed(1)} s (listed ${c.seconds}); ${(bytes / MB).toFixed(1)} MB`);
  check(`${c.title}: its source and licence are written in SOURCES.md`, sources.includes(c.src.split('/').pop()));
}
check('the cartoons together are under 80 MB', total <= 80 * MB, `${(total / MB).toFixed(1)} MB`);

// ── In a browser ───────────────────────────────────────────────────
const PORT = Number(process.env.CARTOONS_PORT ?? 4191);
const notes = [];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
await new Promise((resolve, reject) => {
  const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
  server.stdout.on('data', d => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
  server.stderr.on('data', d => { notes.push(String(d).trim()); });
  server.on('exit', c => { clearTimeout(bail); reject(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
});
process.on('exit', () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } });

const browser = await launchChromium(chromium, { headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  // Every video the app plays, kept, so the film's element (made in code and
  // never put in the page) can be found and read.
  await ctx.addInitScript(() => {
    const played = (window.__cgPlayed = []);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { if (!played.includes(this)) played.push(this); return play.call(this); };
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/?debug&look=classic&dpr=0.35&play=0`, { waitUntil: 'load' });
  for (let i = 0; i < 40 && !(await page.getByTestId('phone-stage').count()); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(800);
  await page.getByTestId('phone-open-dye').first().tap();
  await page.waitForTimeout(400);

  const rows = await page.evaluate((ids) => ids.map(id => {
    const h = (t) => document.querySelector(`[data-testid="${t}-${id}"]`)?.getBoundingClientRect().height ?? 0;
    return { id, pour: h('cartoon-pour'), film: h('cartoon-film') };
  }), CARTOONS.map(c => c.id));
  check('the phone\'s dye sheet lists every cartoon, each with Pour and Film a thumb\'s height',
    rows.every(r => r.pour >= 44 && r.film >= 44), rows.map(r => `${r.id} ${Math.round(r.pour)}/${Math.round(r.film)}`).join(', '));

  /*
    Watch the played video whose address ends with this cartoon's file for two
    seconds: how far it got, whether it paused, and whether its picture reads
    back. The element is kept on the page (`__cgWatched`), so the checks after
    Stop and Film-off ask that same element, not a search that finds nothing
    once its address is gone. Then it is sent half a second from its end, and
    a second and a half later it has to be back at the start without an
    `ended`: that is the loop, where two seconds of a five-minute cartoon
    never reach the end.
  */
  const watch = (src) => page.evaluate(async (src) => {
    const v = window.__cgPlayed.find(e => e.currentSrc.endsWith(src));
    if (!v) return null;
    (window.__cgWatched ??= {})[src] = v;
    let pauses = 0, ended = 0;
    const count = () => pauses++;
    const end = () => ended++;
    v.addEventListener('pause', count);
    v.addEventListener('ended', end);
    const t0 = v.currentTime;
    await new Promise(r => setTimeout(r, 2000));
    const moved = v.currentTime - t0;
    let read = 'none';
    try {
      const c = document.createElement('canvas'); c.width = 64; c.height = 48;
      const g = c.getContext('2d'); g.drawImage(v, 0, 0, 64, 48);
      const d = g.getImageData(0, 0, 64, 48).data;
      let lo = 255, hi = 0;
      for (let i = 0; i < d.length; i += 4) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); }
      read = hi - lo;
    } catch (e) { read = `refused: ${e.name}`; }
    const pausesBefore = pauses;
    // A slow machine (software WebGPU) may not have the length yet: wait for it, up to five seconds.
    for (let i = 0; i < 50 && !Number.isFinite(v.duration); i++) await new Promise(r => setTimeout(r, 100));
    if (!Number.isFinite(v.duration)) return { moved, paused: v.paused, pauses: pausesBefore, read, wrapped: false, after: NaN, ended };
    v.currentTime = v.duration - 0.5;
    await new Promise(r => setTimeout(r, 1500));
    const wrapped = v.currentTime < 1.5 && !v.paused && ended === 0;
    const after = v.currentTime;
    v.removeEventListener('pause', count);
    v.removeEventListener('ended', end);
    return { moved, paused: v.paused, pauses: pausesBefore, read, wrapped, after, ended };
  }, src);
  const held = () => page.evaluate(() => {
    const h = window.__cgVideo?.();
    // Whether the plate runs (has WebGPU and a frame loop), asked the way `npm run phone` asks it.
    const plate = !document.querySelector('[data-testid="needs-webgpu"]') && typeof window.chromaglassDebug?.()?.hands === 'function';
    return h ? { pour: h.pour?.currentSrc ?? null, film: h.film?.currentSrc ?? null, filmKind: h.filmKind, pourReads: h.pourReads, plate } : null;
  });
  const watched = (src) => page.evaluate((src) => {
    const v = window.__cgWatched?.[src];
    return v ? { paused: v.paused } : null;
  }, src);
  const tail = (u) => (u ? u.split('/').pop() : String(u));

  /*
    Colour. Each cartoon is decoded by a video element of its own (never the
    plate's) and read back at five places across it; the middle reading's
    mean colourfulness has to agree with the list's `colour` flag.
  */
  const chroma = await page.evaluate(async (list) => {
    const out = {};
    for (const c of list) {
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.src = c.src;
      await new Promise((res) => { v.onloadedmetadata = res; v.onerror = res; });
      const readings = [];
      if (Number.isFinite(v.duration)) {
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48;
        const g = cv.getContext('2d', { willReadFrequently: true });
        for (const at of [0.15, 0.3, 0.5, 0.7, 0.9]) {
          await new Promise((res) => { v.onseeked = res; v.currentTime = v.duration * at; });
          g.drawImage(v, 0, 0, 64, 48);
          const d = g.getImageData(0, 0, 64, 48).data;
          let sum = 0;
          for (let i = 0; i < d.length; i += 4) sum += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
          readings.push(sum / (d.length / 4));
        }
      }
      readings.sort((a, b) => a - b);
      out[c.id] = readings.length ? readings[2] : NaN;
      v.removeAttribute('src'); v.load();
    }
    return out;
  }, CARTOONS.map(c => ({ id: c.id, src: c.src })));
  for (const c of CARTOONS) {
    const x = chroma[c.id];
    check(`${c.title}: the picture is ${c.colour ? 'in colour' : 'grey'}, as the list says`,
      Number.isFinite(x) && (c.colour ? x > 15 : x < 1), `mean colourfulness ${Number.isFinite(x) ? x.toFixed(1) : 'unread'}`);
  }

  const pourId = CARTOONS[0].id;
  await page.getByTestId(`cartoon-pour-${pourId}`).tap();
  await page.waitForTimeout(1500);
  const poured = await watch(CARTOONS[0].src);
  const pourHeld = await held();
  check(`Pour plays ${CARTOONS[0].title} as dye: its time moves on, its picture can be read, and it is paused not once in two seconds (14ab-1)`,
    poured && poured.moved >= 1.5 && poured.pauses === 0 && typeof poured.read === 'number' && poured.read >= 64,
    poured ? `${poured.moved.toFixed(2)} s on, ${poured.pauses} pauses, picture range ${poured.read}` : 'never played');
  check('and it loops: sent to half a second from its end, it is back at its start a second and a half later, with no end',
    poured && poured.wrapped, poured ? `at ${poured.after.toFixed(2)} s, ${poured.ended} ended, paused ${poured.paused}` : 'never played');
  // With a plate running (a GPU), its frame loop has to have found the video
  // ready on some of those frames; without one there is no frame loop to ask.
  check('and the video the plate holds as its pour is that same cartoon, read by its frame loop where it has one',
    pourHeld && pourHeld.pour?.endsWith(CARTOONS[0].src) && (!pourHeld.plate || pourHeld.pourReads > 0),
    pourHeld ? `the plate's pour: ${tail(pourHeld.pour)}; ${pourHeld.plate ? `frames it found ready to read: ${pourHeld.pourReads}` : 'no plate here (no GPU), its reads not asked'}` : 'no ?debug handle');
  const stopShown = await page.getByTestId(`cartoon-stop-${pourId}`).isVisible().catch(() => false);
  await page.getByTestId(`cartoon-stop-${pourId}`).tap().catch(() => {});
  await page.waitForTimeout(400);
  const stopped = await watched(CARTOONS[0].src);
  const stopHeld = await held();
  const pourBack = await page.getByTestId(`cartoon-pour-${pourId}`).isVisible().catch(() => false);
  check('pouring, its button says Stop; Stop pauses that video, the plate lets go of it, and the button says Pour again',
    stopShown && pourBack && stopped?.paused === true && stopHeld && stopHeld.pour === null,
    `Stop shown ${stopShown}, the video ${stopped ? (stopped.paused ? 'paused' : 'still playing') : 'not found'}, the plate's pour ${tail(stopHeld?.pour)}, Pour back ${pourBack}`);

  const filmOne = CARTOONS[2];
  await page.getByTestId(`cartoon-film-${filmOne.id}`).tap();
  await page.waitForTimeout(1500);
  const filmed = await watch(filmOne.src);
  const filmHeld = await held();
  const pressed = await page.getByTestId(`cartoon-film-${filmOne.id}`).getAttribute('aria-pressed');
  check(`Film plays ${filmOne.title} as the projector's film, looping, and its button shows pressed`,
    filmed && filmed.moved >= 1.5 && filmed.wrapped && pressed === 'true' && filmHeld?.film?.endsWith(filmOne.src) && filmHeld.filmKind === 'file',
    filmed ? `${filmed.moved.toFixed(2)} s on, looped to ${filmed.after.toFixed(2)} s, pressed ${pressed}, the projector's film ${tail(filmHeld?.film)} (${filmHeld?.filmKind})` : `never played, pressed ${pressed}`);
  await page.getByTestId(`cartoon-film-${filmOne.id}`).tap();
  await page.waitForTimeout(400);
  const after = await page.getByTestId(`cartoon-film-${filmOne.id}`).getAttribute('aria-pressed');
  const filmStopped = await watched(filmOne.src);
  const offHeld = await held();
  check('pressed again, the film is off: that video paused, the projector holds no film, the button not pressed',
    after === 'false' && filmStopped?.paused === true && offHeld?.filmKind === 'none',
    `pressed ${after}, the video ${filmStopped ? (filmStopped.paused ? 'paused' : 'still playing') : 'not found'}, the projector's film ${offHeld?.filmKind}`);
  await ctx.close();

  /*
    Settings → Film, on a laptop. The owner looked for the cartoons there on
    2026-10-29, where films are, and found only the three demo loops: the
    shelf was on the desk's Dye panel and the phone's dye sheet and nowhere
    else, so they read as gone. Measured before the fix: no row of any
    cartoon in the Settings window. The check is that the window lists every
    one, and that its Film button is the real one: it hands that cartoon to
    the projector as the film, and pressed again takes it off.
  */
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desk.addInitScript(() => {
    const played = (window.__cgPlayed = []);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { if (!played.includes(this)) played.push(this); return play.call(this); };
  });
  const dp = await desk.newPage();
  dp.setDefaultTimeout(60_000);
  await dp.goto(`http://localhost:${PORT}/?debug&look=classic&dpr=0.35&play=0`, { waitUntil: 'load' });
  await dp.getByTestId('open-all-settings').click();
  await dp.getByTestId('settings-nav-film').click();
  await dp.waitForTimeout(500);
  const inFilm = await dp.evaluate((ids) => ids.map(id => {
    const box = (t) => {
      const el = document.querySelector(`[data-testid="settings-panel"] [data-testid="${t}-${id}"]`);
      const r = el?.getBoundingClientRect();
      return r && r.width > 0 ? Math.round(r.height) : 0;
    };
    return { id, pour: box('film-cartoon-pour'), film: box('film-cartoon-film') };
  }), CARTOONS.map(c => c.id));
  check('Settings → Film lists every cartoon, each with its own Pour and Film',
    inFilm.every(r => r.pour >= 24 && r.film >= 24), inFilm.map(r => `${r.id} ${r.pour}/${r.film}`).join(', '));
  const deskOne = CARTOONS[1];
  const dheld = () => dp.evaluate(() => {
    const h = window.__cgVideo?.();
    return h ? { film: h.film?.currentSrc ?? null, filmKind: h.filmKind } : null;
  });
  await dp.getByTestId(`film-cartoon-film-${deskOne.id}`).click();
  await dp.waitForTimeout(1500);
  const onHeld = await dheld();
  const onPressed = await dp.getByTestId(`film-cartoon-film-${deskOne.id}`).getAttribute('aria-pressed');
  await dp.getByTestId(`film-cartoon-film-${deskOne.id}`).click();
  await dp.waitForTimeout(400);
  const offDesk = await dheld();
  const offPressed = await dp.getByTestId(`film-cartoon-film-${deskOne.id}`).getAttribute('aria-pressed');
  check(`and its Film puts ${deskOne.title} on the projector as the film, pressed; pressed again, takes it off`,
    onHeld?.filmKind === 'file' && onHeld.film?.endsWith(deskOne.src) && onPressed === 'true' && offDesk?.filmKind === 'none' && offPressed === 'false',
    `on: ${tail(onHeld?.film)} (${onHeld?.filmKind}), pressed ${onPressed}; off: ${offDesk?.filmKind}, pressed ${offPressed}`);
  await desk.close();
} catch (e) {
  // Measured 2026-10-24 with the pour as it was before 14ab-1's fix (handed
  // over every frame, paused and played each time): the phone's page closed
  // under the pour, before the two seconds were up. That is a red, not a
  // harness error, so it is reported as one.
  check('the page lives through Pour and Film', false, String(e?.message ?? e).split('\n')[0]);
} finally {
  // A browser whose page died can hang on close; the result is in already.
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 10_000))]);
  try { browser.process?.()?.kill('SIGKILL'); } catch { /* already gone */ }
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
// After a page has died under it, this process was seen not to exit on
// `process.exit` (the browser's pipes held it): a red that hangs is a red the
// suite reads as a timeout, so it ends itself.
if (failed.some(c => c.name.startsWith('the page lives'))) {
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }   // SIGKILL skips the exit handler
  process.kill(process.pid, 'SIGKILL');
}
process.exit(failed.length ? 1 : 0);
