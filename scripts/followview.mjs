#!/usr/bin/env node
/**
 * Do the desk and the phone say whether the show is following a song it
 * knows, and how sure it is, and does the playhead follow the band?
 *
 *   npm run followview
 *
 * PLAN.md 28g-2. The place the show reads a song map at is the follower's
 * when it is sure where the band is, and the clock run on from there when it
 * is not (`src/lib/followedPlace.ts`; `npm run songfollow` measures that on
 * synthesised takes played slower, faster, rearranged and jammed). What a
 * person needs to see is which song is being followed and whether the show
 * believes it: in the Perform desk's status bar, under the track panel's
 * playhead (the laptop without a desk), and on the phone's Sound sheet.
 *
 * The app's own band is the song: its score (`bandStep`) is rendered here
 * the way Web Audio plays it (`band.mjs`) and its map made from that as the
 * app makes one (`mapChroma`, the band's eight sections), stored the way
 * the app stores maps (IndexedDB, keyed as a song tagged by hand is keyed),
 * with two more: a song in C sharp the band never plays, and a map made
 * before following existed (no harmony). The band plays in the page, each
 * song is tagged by name, and this asserts:
 *
 *   - the band's song: the desk says it follows it, named, at least 50%
 *     sure; tagged twenty seconds into the band (its verse, where a clock
 *     started at the tag says intro), the track panel's section is the one
 *     the band is playing (the band says where in its score it is) four
 *     times in five, a second apart, and the clock's four times in five is
 *     not; the phone's Sound sheet says the same as the desk, under the
 *     song's shape;
 *   - the song in C sharp: after twenty seconds of hearing it (longer than
 *     the band's song took to be sure), five readings a second apart each
 *     not sure, under 50%, following its sound, with the follower hearing
 *     throughout (its hops, `__followed` under ?debug); and the playhead
 *     keeps time all the same (the clock runs on);
 *   - the map with no harmony, shown to be the map read: nothing about
 *     following, and the playhead runs as it always did.
 *
 * Each line is read only once the tagged song's own map is the one the
 * place reads (`__followed`), so a line left from the song before, or a map
 * that never loaded, cannot pass for it.
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { launchChromium } from './chromium.mjs';
import { pseudoIsrc } from '../src/lib/evolution.ts';
import { FOLLOW_RATE, mapChroma, storedChroma } from '../src/lib/songFollow.ts';
import { bandStep, BAND_STEP_S } from '../src/lib/simulatedMusic.ts';
import { renderBand } from './band.mjs';

const PORT = Number(process.env.FOLLOWVIEW_PORT ?? 4197);
const ORIGIN = `http://localhost:${PORT}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// On CI an earlier step has built dist/; anywhere else build it, so a stale
// build is never what is measured.
if (!process.env.CI) {
  const b = spawnSync('npm', ['run', 'build'], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (b.status !== 0) { check('the site builds', false, `exit ${b.status}`); process.exit(1); }
}

const notes = [];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
await new Promise((resolve, reject) => {
  const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
  server.stdout.on('data', (d) => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
  server.stderr.on('data', (d) => { notes.push(String(d).trim()); });
  server.on('exit', (c) => { clearTimeout(bail); reject(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
});

const ARTIST = 'The Test Band';
const BAND = 'The Band In The Box';
const OTHER = 'A Song In C Sharp';
const OLD = 'A Song From Before';

/** The band's score once round: its sections, eight bars each, as the parts it plays. */
const BAR_STEPS = 16, LOOP_STEPS = 1024;
const loopSec = LOOP_STEPS * BAND_STEP_S;
const bandSections = [];
for (let st = 0; st < LOOP_STEPS; st += 8 * BAR_STEPS) {
  bandSections.push({ start: st * BAND_STEP_S, end: (st + 8 * BAR_STEPS) * BAND_STEP_S, label: bandStep(st).part, energy: 0.5 });
}
const MAP_SR = 22050;
const bandChroma = storedChroma(mapChroma(renderBand(loopSec, MAP_SR).pcm, MAP_SR));

/** A map as `songMapWorker.ts` stores one. */
function mapOf(title, sections, durationSec, chroma) {
  const frames = Math.round(durationSec * FOLLOW_RATE);
  return {
    isrc: pseudoIsrc(ARTIST, title), title, artist: ARTIST, durationSec, sections,
    pitchCurve: new Array(frames).fill(0), energyCurve: new Array(frames).fill(0.5), frameRate: FOLLOW_RATE,
    ...(chroma ? { chroma } : {}),
    generatedAt: Date.now(),
  };
}
/** C sharp, F and G sharp throughout: none of the band's chords. */
const otherChroma = (() => {
  const one = new Array(12).fill(0.01);
  for (const n of [1, 5, 8]) one[n] = 0.31;
  return Array.from({ length: Math.round(loopSec * FOLLOW_RATE) }, () => one).flat();
})();
const MAPS = [
  mapOf(BAND, bandSections, loopSec, bandChroma),
  mapOf(OTHER, bandSections, loopSec, otherChroma),
  mapOf(OLD, bandSections, loopSec, null),
];
console.log(`  the band's map: ${bandSections.map(x => `${x.label} ${x.start.toFixed(0)}–${x.end.toFixed(0)}`).join(', ')}`);

/** Store the maps as `musicDb.ts` does, before the app opens its database. */
const seed = (maps) => new Promise((resolve, reject) => {
  const req = indexedDB.open('chromaglass-music', 3);
  req.onupgradeneeded = () => {
    const db = req.result;
    for (const [name, key] of [['songMaps', 'isrc'], ['tracks', 'isrc'], ['fingerprints', 'isrc'], ['performances', 'id']]) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: key });
    }
  };
  req.onsuccess = () => {
    const tx = req.result.transaction('songMaps', 'readwrite');
    for (const m of maps) tx.objectStore('songMaps').put(m);
    tx.oncomplete = () => { req.result.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  };
  req.onerror = () => reject(req.error);
});

/** "1:23" as seconds. */
const secs = (t) => { const [m, s] = String(t ?? '').trim().split(':').map(Number); return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : NaN; };

const browser = await launchChromium(chromium);
try {
  /** A laptop page at `width`, the band playing, the maps stored. */
  const laptop = async (width, height) => {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    await page.addInitScript(() => {
      localStorage.setItem('chromaglass-audio-source', 'simulated');
      localStorage.setItem('chromaglass-desk-mode', 'perform');
    });
    await page.goto(`${ORIGIN}/?debug&gpu=mid&tier=local&look=classic`, { waitUntil: 'load' });
    await page.evaluate(seed, MAPS);
    await page.waitForFunction(() => typeof window.__tagSong === 'function');
    // The band is the stored source; a click starts audio where a browser asks for one.
    await page.mouse.click(Math.round(width / 2), Math.round(height / 2));
    await page.waitForFunction(() => window.__band?.() != null, null, { timeout: 20_000 }).catch(() => {});
    return { ctx, page };
  };
  /** Which map the show's place reads, whether it has harmony, and how many hops its follower has heard (`__followed`, under ?debug). */
  const followed = (page) => page.evaluate(() => window.__followed?.() ?? null);
  /** Tag a song by name and wait until its stored map is the one the place reads: a line read after this is about that map. */
  const tag = async (page, title) => {
    await page.evaluate(([a, t]) => window.__tagSong(a, t), [ARTIST, title]);
    const isrc = pseudoIsrc(ARTIST, title);
    await page.waitForFunction((want) => window.__followed?.()?.map === want, isrc, { timeout: 15_000 })
      .catch(() => { throw new Error(`the map of “${title}” never became the one followed`); });
    await page.waitForTimeout(1000);
  };
  /**
   * A song the band is not playing: after twenty seconds of it (longer than
   * the band's own song took to be sure), five readings a second apart, each
   * not sure and under 50%, with the follower hearing all the while.
   */
  const staysUnsure = async (page, loc, re) => {
    await page.waitForTimeout(20_000);
    const h0 = (await followed(page))?.hops ?? 0;
    const said = [];
    for (let i = 0; i < 5; i++) { said.push((await text(loc)).replace(/^·\s*/, '')); await page.waitForTimeout(1000); }
    const heard = ((await followed(page))?.hops ?? 0) - h0;
    const ok = said.every(x => re.test(x) && pctOf(x) < 50) && heard >= 12;
    return { ok, detail: `${said.map(x => `${pctOf(x)}%`).join(', ')} (${said[0] || 'no line'}); ${heard} hops heard over the five` };
  };
  /** The map with no harmony: it is the one read (so an empty line is about it), and it has none. */
  const oldLoaded = async (page) => { const f = await followed(page); return !!f && f.map === pseudoIsrc(ARTIST, OLD) && f.harmony === false; };

  const text = async (loc) => ((await loc.isVisible().catch(() => false)) ? (await loc.innerText()).trim() : '');
  const NOT_SURE = (title) => new RegExp(`^Not sure where in ${title ? `“${title}”` : 'the song'} \\((\\d+)%\\): following its sound$`);

  /** Wait until `loc` says something matching `re`, up to `ms`; what it says then. */
  const until = async (loc, re, ms) => {
    const end = Date.now() + ms;
    let said = '';
    while (Date.now() < end) {
      said = (await text(loc)).replace(/^·\s*/, '');
      if (re.test(said)) return said;
      await new Promise(r => setTimeout(r, 500));
    }
    return said;
  };
  const SURE = (title) => new RegExp(`^Following ${title ? `“${title}”` : 'the map'}: (\\d+)% sure$`);
  const pctOf = (said) => Number(/(\d+)%/.exec(said)?.[1] ?? NaN);

  // ── The desk (Perform, 1440 wide): its status bar ─────────────────────
  {
    const { ctx, page } = await laptop(1440, 900);
    const status = page.getByTestId('status-song');
    await tag(page, BAND);
    const sure = await until(status, SURE(BAND), 40_000);
    check('desk, the band\'s own song: the status bar names it and follows it, at least 50% sure', SURE(BAND).test(sure) && pctOf(sure) >= 50, sure || 'no line');
    await tag(page, OTHER);
    const desk = await staysUnsure(page, status, NOT_SURE(OTHER));
    check('desk, a song the band is not playing: not sure where in it, following its sound, under 50%, after twenty seconds of hearing it', desk.ok, desk.detail);
    await tag(page, OLD);
    const deskOld = await oldLoaded(page);
    check('desk, a map made before following (no harmony), loaded: nothing about following', deskOld && !(await status.isVisible().catch(() => false)), `${deskOld ? 'its map read' : 'its map not the one read'}; ${await text(status) || 'nothing'}`);
    await ctx.close();
  }

  // ── The laptop without a desk (narrower than a desk): the track panel ──
  {
    const { ctx, page } = await laptop(1000, 760);
    // Tagged with the band twenty seconds in, in its verse: the clock the
    // place started from before following (the tag's moment as the song's
    // top) says intro, so a section right here is the follower's.
    await page.waitForFunction(() => (window.__band?.()?.at ?? 0) >= 20, null, { timeout: 40_000 }).catch(() => {});
    const taggedAt = Date.now();
    await tag(page, BAND);
    await page.click('[data-testid="track-button"]');
    const line = page.getByTestId('track-follow');
    const sure = await until(line, SURE(null), 40_000);
    check('track panel, the band\'s song: under its playhead, following the map, at least 50% sure', SURE(null).test(sure) && pctOf(sure) >= 50, sure || 'no line');
    // The section on the panel against the part the band is playing.
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const [chip, band] = await Promise.all([
        text(page.getByTestId('track-section')).then(t => t.toLowerCase()),
        page.evaluate(() => window.__band?.()?.at ?? null),
      ]);
      const part = band === null ? null : bandStep(Math.floor((band % loopSec) / BAND_STEP_S)).part;
      const clock = ((Date.now() - taggedAt) / 1000) % loopSec;
      samples.push({ chip, part, clock: bandSections.find(x => clock >= x.start && clock < x.end)?.label ?? null });
      await page.waitForTimeout(1000);
    }
    const agree = samples.filter(x => x.part && x.chip === x.part).length;
    const clockWrong = samples.filter(x => x.part && x.clock !== x.part).length;
    check('… and its section is the one the band is playing, four times in five, where the clock alone would say another four times in five', agree >= 4 && clockWrong >= 4,
      `panel/band/clock: ${samples.map(x => `${x.chip || '–'}/${x.part ?? '?'}/${x.clock ?? '?'}`).join(', ')}`);

    await tag(page, OTHER);
    const panel = await staysUnsure(page, line, NOT_SURE(null));
    check('track panel, a song the band is not playing: not sure where in it, following its sound, after twenty seconds of hearing it', panel.ok, panel.detail);
    const t0 = secs(await page.getByTestId('track-position').innerText());
    await page.waitForTimeout(3000);
    const t1 = secs(await page.getByTestId('track-position').innerText());
    check('… and its playhead keeps time while unsure (the clock runs on)', t1 - t0 >= 2 && t1 - t0 <= 4, `${t0} s to ${t1} s over 3 s`);

    await tag(page, OLD);
    const o0 = secs(await page.getByTestId('track-position').innerText());
    await page.waitForTimeout(2000);
    const o1 = secs(await page.getByTestId('track-position').innerText());
    const shown = await line.isVisible().catch(() => false);
    check('track panel, a map with no harmony, loaded: no follow line, and the playhead runs as it did', !shown && (await oldLoaded(page)) && o1 - o0 >= 1 && o1 - o0 <= 3, `${shown ? 'a line shown' : 'no line'}; ${o0} s to ${o1} s over 2 s`);
    await ctx.close();
  }

  // ── The phone: the Sound sheet ────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    // The full layout (Play, the one a phone opens on, has no Sound sheet).
    await page.goto(`${ORIGIN}/?debug&look=classic&dpr=0.35&play=0`, { waitUntil: 'load' });
    await page.evaluate(seed, MAPS);
    for (let i = 0; i < 40 && !(await page.getByTestId('phone-stage').count()); i++) await page.waitForTimeout(250);
    await page.waitForFunction(() => typeof window.__tagSong === 'function');
    await page.getByTestId('phone-open-sound').first().tap();
    await page.waitForTimeout(400);
    const band = page.getByTestId('phone-sound-band').first();
    if ((await band.getAttribute('aria-pressed')) !== 'true') { await band.tap(); await page.waitForTimeout(800); }

    const line = page.getByTestId('phone-song-map');
    await tag(page, BAND);
    const sure = await until(line, SURE(BAND), 40_000);
    check('phone, the band\'s song: the Sound sheet names it and follows it, at least 50% sure', SURE(BAND).test(sure) && pctOf(sure) >= 50, sure || 'no line');
    const shape = await page.getByTestId('phone-song-shape').first().boundingBox();
    const map = await line.boundingBox().catch(() => null);
    check('… under the song\'s shape', !!shape && !!map && map.y >= shape.y + shape.height - 0.5,
      shape && map ? `shape at ${Math.round(shape.y)}, follow line at ${Math.round(map.y)} px` : 'not both shown');
    await tag(page, OTHER);
    const phone = await staysUnsure(page, line, NOT_SURE(OTHER));
    check('phone, a song the band is not playing: not sure where in it, following its sound, after twenty seconds of hearing it', phone.ok, phone.detail);
    await tag(page, OLD);
    const phoneOld = await oldLoaded(page);
    check('phone, a map with no harmony, loaded: no follow line', phoneOld && !(await line.isVisible().catch(() => false)), phoneOld ? 'its map read' : 'its map not the one read');
    await ctx.close();
  }
} catch (err) {
  check('the run completed', false, String(err).split('\n')[0]);
} finally {
  await browser.close();
  stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} follow-view checks passed`);
process.exit(failed.length ? 1 : 0);
