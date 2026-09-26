#!/usr/bin/env node
/**
 * Does the music that ships with the show actually reach the show?
 *
 *   npm run shelf
 *
 * A track can play perfectly and drive nothing. That is what a cross-origin
 * file without CORS headers does — the Web Audio analyser is handed silence,
 * the room hears music and the plate sits still — and it is why these are
 * served from the show's own origin. A harness that only checked the audio
 * element was playing would not tell the two apart, so this reads the bands
 * the visuals are actually driven by.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { LIBRARY, librarySeconds, credits } from '../src/lib/musicLibrary.ts';

const PORT0 = Number(process.env.SHELF_PORT ?? 4900);
let server = null, port = PORT0, leaving = false;
for (let t = 0; t < 6 && !server; t++) {
  const child = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT0 + t), '--strictPort'],
    { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
  let died = false;
  child.on('exit', () => { died = true; });
  await new Promise(r => setTimeout(r, 2500));
  if (died) continue;
  server = child; port = PORT0 + t;
}
if (!server) { console.error('no free port'); process.exit(2); }
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
server.on('exit', (c) => { if (!leaving) { console.error(`\npreview exited (${c})`); process.exit(2); } });
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });

let bad = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) bad++;
};

const browser = await launchChromium(chromium);
try {
  // Wide enough for the desk: the tabs only exist when there is room for it.
  const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  await page.goto(`http://localhost:${port}/?debug`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  // Every file on the shelf is actually served, and is actually audio.
  for (const t of LIBRARY) {
    const r = await page.evaluate(async (src) => {
      const res = await fetch(src, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
      const buf = new Uint8Array(await res.arrayBuffer());
      const id3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
      const frame = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
      return { status: res.status, type: res.headers.get('content-type'), mp3: id3 || frame };
    }, t.src);
    check(`${t.title} is on the shelf`, (r.status === 200 || r.status === 206) && r.mp3,
      `${r.status} ${r.type ?? '?'}`);
  }

  /*
    Through the tab a person clicks, not the back door.

    The first version of this drove `chromaglassMusic()` because the shelf
    could not be found in the DOM — and that was the finding, not an
    inconvenience to route around. The sources were gated on
    `showControls && !showSettings && !deskUp`, so they hid when Settings
    opened and hid again whenever a desk was up. The shelf shipped where
    nobody could reach it and the harness proved the audio path while saying
    nothing about whether a hand could get to it. So this clicks the tab.
  */
  const first = LIBRARY[1];   // a short one, so the test is not waiting on a 31-minute set
  const tab = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === 'Sound');
    if (!b) return false;
    b.click();
    return true;
  });
  check('there is a Sound tab on the desk', tab, 'beside Perform, Design and Songs');
  if (!tab) throw new Error('no Sound tab, so nothing below can be reached by hand');
  await page.waitForTimeout(700);
  const panel = await page.evaluate(() => !!document.querySelector('[data-testid="sound-panel"]'));
  check('and it opens the sound panel', panel, `${LIBRARY.length} tracks, ${Math.round(librarySeconds() / 60)} minutes`);

  const clicked = await page.evaluate((id) => {
    const b = document.querySelector(`[data-testid="sound-track-${id}"]`);
    if (!b) return false;
    b.click();
    return true;
  }, first.src.split('/').pop().replace('.mp3', ''));
  check('a track on the shelf can be clicked', clicked, first.title);
  await page.waitForTimeout(1400);
  const put = await page.evaluate(() => {
    const el = document.querySelector('audio');
    return el?.currentSrc?.split('/').pop() ?? null;
  });
  check('and clicking it loads that track', put === first.src.split('/').pop(), put ?? 'nothing loaded');
  /*
    Only if it needs it. Autoplay may want a gesture, and the play button is
    there for exactly that — but pressing it on a track that is already running
    pauses it, which is what happened here: 1.1 seconds in and stopped, and the
    analyser check underneath then read silence and blamed the audio path.
  */
  if (await page.evaluate(() => document.querySelector('audio')?.paused ?? true)) {
    await page.evaluate(() => { const b = document.querySelector('[data-testid="music-play"]'); if (b) b.click(); });
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(3000);

  const playing = await page.evaluate(() => {
    const el = document.querySelector('audio');
    return { t: el?.currentTime ?? 0, paused: el?.paused ?? true, src: el?.currentSrc ?? '' };
  });
  check('picking a track plays it', playing.t > 0.3 && !playing.paused,
    `${playing.t.toFixed(1)}s in, ${playing.src.split('/').pop()}`);

  /*
    The bands, not the element. This is the whole point of the harness: a file
    that plays but is inaudible to the analyser leaves these at zero, and the
    show would run on a dead signal while the room hears music.
  */
  if (await page.evaluate(() => typeof window.chromaglassCastState !== 'function'))
    throw new Error('chromaglassCastState() is not there — this build cannot be asked what the show is hearing, ' +
      'so every reading below would be a number this harness invented');
  let loudest = 0, reads = 0;
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(200);
    const e = await page.evaluate(() => {
      const a = window.chromaglassCastState().audio;
      return a ? a.energy : null;
    });
    if (e === null) continue;
    reads++;
    if (e > loudest) loudest = e;
  }
  if (!reads) throw new Error('the show reported no audio at all over five seconds — not quiet, absent');
  check('and the show can hear it', loudest > 0.01, `loudest energy ${loudest.toFixed(4)} over ${reads} reads`);

  /*
    Asked of a track that actually carries the obligation.

    This first ran against a public-domain piece and reported "nothing to
    credit for this one" as a pass — a check that could not fail, guarding the
    one thing on this shelf that is a licence condition rather than a
    preference. So it puts a CC-BY track on and looks for the artist's name.
  */
  const owed = LIBRARY.find(t => t.mustCredit);
  if (!owed) throw new Error('no CC-BY track on the shelf, so the credit path is untested and untestable');
  await page.evaluate((src) => window.chromaglassMusic(src), owed.src);
  await page.waitForTimeout(1500);
  const credited = await page.evaluate(() => document.querySelector('[data-testid="music-credit"]')?.textContent ?? null);
  check(`${owed.licence} names its artist on screen while it plays`,
    !!credited && credited.includes(owed.artist), credited ?? 'no credit shown');
  const inLine = credits();
  check('and the shelf credit line names them too', inLine.includes(owed.artist), inLine);
  check('the shelf carries no non-commercial or no-derivatives licence',
    LIBRARY.every(t => !/\b(nc|nd)\b/i.test(t.licenceUrl) && !/-nc|-nd/.test(t.licenceUrl)),
    LIBRARY.map(t => t.licence).join(', '));
} finally {
  await browser.close();
  stop();
}
console.log(bad ? `\n  ${bad} failed` : '\n  the shelf plays and the show hears it');
process.exit(bad ? 1 : 0);
