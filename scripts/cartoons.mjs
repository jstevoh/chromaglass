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
 *               says within a second, under 10 MB, and the four under 25 MB.
 *               The sizes are the web's budget (PLAN 14v): nothing here is
 *               fetched at load, but a phone pays for the one it picks.
 *   recorded    `public/video/cartoons/SOURCES.md` names every file, so no
 *               cartoon ships without its source and licence written down.
 *   the pour    on a phone, the dye sheet lists every cartoon with a Pour and
 *               a Film button a thumb's height (44 px), and Pour starts the
 *               cartoon playing: its time moves on, it loops, its picture can
 *               be read back (same origin, so the plate may read it; a blank
 *               or tainted read would pour nothing), and over two seconds it
 *               is paused not once. Before 14ab-1's fix the app handed the
 *               video to the plate every frame and the plate paused and played
 *               it each time: about 120 pauses in those two seconds.
 *               Stop then stops it, and the button says Pour again.
 *   the film    Film plays the cartoon as the projector's film (its time moves
 *               on, read from the element the app played), and the button
 *               shows pressed; pressed again, the film is off.
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
let total = 0;
for (const c of CARTOONS) {
  const path = `public${c.src}`;
  if (!existsSync(path)) { check(`${c.title}: ${path} is there`, false); continue; }
  const bytes = statSync(path).size;
  total += bytes;
  const m = mp4(readFileSync(path));
  const moovFirst = m.order.indexOf('moov') >= 0 && m.order.indexOf('moov') < m.order.indexOf('mdat');
  check(`${c.title}: an H.264 MP4 with its index first and no sound, as long as the list says, under 10 MB`,
    moovFirst && m.avc && m.handlers.includes('vide') && !m.handlers.includes('soun') && Math.abs(m.seconds - c.seconds) <= 1 && bytes <= 10 * MB,
    `${m.order.join(' ')}; tracks ${m.handlers.join(',')}; ${m.seconds.toFixed(1)} s (listed ${c.seconds}); ${(bytes / MB).toFixed(1)} MB`);
  check(`${c.title}: its source and licence are written in SOURCES.md`, sources.includes(c.src.split('/').pop()));
}
check('the cartoons together are under 25 MB', total <= 25 * MB, `${(total / MB).toFixed(1)} MB`);

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

  /** The played video whose address ends with this cartoon's file. */
  const watch = (src) => page.evaluate(async (src) => {
    const v = window.__cgPlayed.find(e => e.currentSrc.endsWith(src));
    if (!v) return null;
    let pauses = 0;
    const count = () => pauses++;
    v.addEventListener('pause', count);
    const t0 = v.currentTime;
    await new Promise(r => setTimeout(r, 2000));
    v.removeEventListener('pause', count);
    let read = 'none';
    try {
      const c = document.createElement('canvas'); c.width = 64; c.height = 48;
      const g = c.getContext('2d'); g.drawImage(v, 0, 0, 64, 48);
      const d = g.getImageData(0, 0, 64, 48).data;
      let lo = 255, hi = 0;
      for (let i = 0; i < d.length; i += 4) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); }
      read = hi - lo;
    } catch (e) { read = `refused: ${e.name}`; }
    return { moved: v.currentTime - t0, paused: v.paused, loop: v.loop, pauses, read };
  }, src);

  const pourId = CARTOONS[0].id;
  await page.getByTestId(`cartoon-pour-${pourId}`).tap();
  await page.waitForTimeout(1500);
  const poured = await watch(CARTOONS[0].src);
  check(`Pour plays ${CARTOONS[0].title} as dye: its time moves on, it loops, its picture can be read, and it is paused not once in two seconds (14ab-1)`,
    poured && poured.moved >= 1.5 && !poured.paused && poured.loop && poured.pauses === 0 && typeof poured.read === 'number' && poured.read >= 64,
    poured ? `${poured.moved.toFixed(2)} s on, loop ${poured.loop}, ${poured.pauses} pauses, picture range ${poured.read}` : 'never played');
  const stopShown = await page.getByTestId(`cartoon-stop-${pourId}`).isVisible().catch(() => false);
  await page.getByTestId(`cartoon-stop-${pourId}`).tap().catch(() => {});
  await page.waitForTimeout(400);
  const stopped = await page.evaluate((src) => {
    const v = window.__cgPlayed.find(e => e.src.endsWith(src) || e.currentSrc.endsWith(src));
    return v ? { paused: v.paused, src: v.getAttribute('src') } : null;
  }, CARTOONS[0].src);
  const pourBack = await page.getByTestId(`cartoon-pour-${pourId}`).isVisible().catch(() => false);
  check('pouring, its button says Stop; Stop stops it and the button says Pour again',
    stopShown && pourBack && (!stopped || stopped.paused), `Stop shown ${stopShown}, after: ${JSON.stringify(stopped)}, Pour back ${pourBack}`);

  const filmOne = CARTOONS[2];
  await page.getByTestId(`cartoon-film-${filmOne.id}`).tap();
  await page.waitForTimeout(1500);
  const filmed = await watch(filmOne.src);
  const pressed = await page.getByTestId(`cartoon-film-${filmOne.id}`).getAttribute('aria-pressed');
  check(`Film plays ${filmOne.title} through the projector, looping, and its button shows pressed`,
    filmed && filmed.moved >= 1.5 && !filmed.paused && filmed.loop && pressed === 'true',
    filmed ? `${filmed.moved.toFixed(2)} s on, loop ${filmed.loop}, pressed ${pressed}` : `never played, pressed ${pressed}`);
  await page.getByTestId(`cartoon-film-${filmOne.id}`).tap();
  await page.waitForTimeout(400);
  const after = await page.getByTestId(`cartoon-film-${filmOne.id}`).getAttribute('aria-pressed');
  const filmPaused = await page.evaluate((src) => window.__cgPlayed.find(e => e.getAttribute('src') === src)?.paused ?? true, filmOne.src);
  check('pressed again, the film is off', after === 'false' && filmPaused, `pressed ${after}, paused ${filmPaused}`);
  await ctx.close();
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
