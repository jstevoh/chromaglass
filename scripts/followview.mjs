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
import { launchChromium, port } from './chromium.mjs';
import { pseudoIsrc } from '../src/lib/evolution.ts';
import { FOLLOW_RATE, mapChroma, storedChroma } from '../src/lib/songFollow.ts';
import { bandStep, BAND_STEP_S } from '../src/lib/simulatedMusic.ts';
import { renderBand } from './band.mjs';

const PORT = port(4197, 'FOLLOWVIEW_PORT');
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
      sessionStorage.setItem('chromaglass-audio-source', 'simulated');
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
  /**
   * The line is up (`first`, from `until`): is the show sure, at least 50%?
   * The line comes up the moment the follower's trust crosses its line, and
   * the percentage on it is that hop's confidence, which then climbs to
   * about 100 within five seconds (four pages, 45 s each, a reading every
   * quarter second: the first reading was 55, 54, 60 and 51, with 46 and 49
   * a second or two after it on one of them, and every reading from five
   * seconds on was 75 or over). Read the instant it comes up, "at least
   * 50%" was a coin toss on a good run (47% failed one of six). The bar is
   * the same; it is read once the line has had five seconds to firm up, three
   * times a second apart, and all three must say it.
   */
  const firm = async (loc, re, first) => {
    if (!re.test(first)) return { ok: false, detail: first || 'no line' };
    await new Promise(r => setTimeout(r, 5000));
    const said = [];
    for (let i = 0; i < 3; i++) { said.push((await text(loc)).replace(/^·\s*/, '')); await new Promise(r => setTimeout(r, 1000)); }
    return { ok: said.every(x => re.test(x) && pctOf(x) >= 50), detail: `${first}, then ${said.map(x => x ? `${pctOf(x)}%` : 'no line').join(', ')}` };
  };

  // ── The desk (Perform, 1440 wide): its status bar ─────────────────────
  {
    const { ctx, page } = await laptop(1440, 900);
    const status = page.getByTestId('status-song');
    await tag(page, BAND);
    const deskBand = await firm(status, SURE(BAND), await until(status, SURE(BAND), 40_000));
    check('desk, the band\'s own song: the status bar names it and follows it, at least 50% sure', deskBand.ok, deskBand.detail);
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
    await page.click('[data-testid="track-panel-button"]');
    const line = page.getByTestId('track-follow');
    // The line is read for its percentage after the section is, so that
    // the seconds that takes do not push the section readings round to a
    // moment of the band's score where the clock alone would be right too.
    const first = await until(line, SURE(null), 40_000);
    // The section on the panel against the part the band is playing, read
    // inside one of the band's sections and not across an edge. Where the
    // five readings fall is set by how long the follower took to be sure
    // (a few seconds to twenty), so on some runs the second a reading was
    // taken at was on the edge itself, where the panel is a moment behind
    // the band (measured over twenty edges on four pages at once: it
    // changed 0.0 to 1.8 s after the band did, and now and then a second or
    // so before it) and two readings in five said the old section. That was
    // the check being run at a moment it did not mean to measure, not the
    // panel being wrong: the bar, four in five, is the one the check was
    // written with. So the readings wait until the band is three seconds
    // into a section (longer than any lag measured) with six left, which is
    // five readings a second apart and a second to spare.
    const SETTLE_S = 3, ROOM_S = 6;
    // And not in the seconds right after the follower first locks, when it
    // is sure by a hair: probed on eight pages at once, the panel's section
    // was the wrong one for a second or two after the line first said
    // "Following" in two of eight (the follower's first place, at 50 to 60%
    // trust, is corrected a few hops later), and in one full run in twelve
    // the section went missing for two readings while trust dipped under
    // the follower's unsure line and came back. The line itself says so,
    // 40% to 60% for those seconds, and every page was above 75% inside
    // eight seconds. The section is asked about once the panel says it is
    // that sure, which is the follower having settled, not the panel being
    // given an easier question.
    const SETTLED_PCT = 75;
    let settled = false;
    for (const end = Date.now() + 40_000; Date.now() < end && !settled;) {
      const said = await text(line);
      settled = SURE(null).test(said.replace(/^·\s*/, '')) && pctOf(said) >= SETTLED_PCT;
      if (!settled) await new Promise(r => setTimeout(r, 250));
    }
    // Where the readings fall is also held off the clock's own section. The
    // control (the clock since the tag, which says intro here) names the
    // band's part for a few seconds at the start of some of the band's
    // sections, the tag having been taken twenty seconds in and a section
    // lasting a little under sixteen; the skeptic pass on this change found
    // that a reading placed three seconds into one of those has the clock
    // agreeing with the band for its first two readings, which would fail a
    // correct panel on a run that settled at the wrong time. So the spot is
    // one where the clock disagrees with the band for the whole of the
    // readings, and `avoid` lets the second group sit in a different
    // section from the first.
    const inSection = (avoid, span) => page.waitForFunction(([sections, loop, settle, room, tagged, avoidLabel, spanS]) => {
      const at = window.__band?.()?.at;
      if (at == null) return null;
      const t = at % loop;
      const s = sections.find(x => t >= x.start && t < x.end);
      if (!s || t - s.start < settle || s.end - t < room || s.label === avoidLabel) return null;
      for (let k = 0; k <= spanS; k += 0.5) {
        const c = ((Date.now() - tagged) / 1000 + k) % loop;
        if (sections.find(x => c >= x.start && c < x.end)?.label === s.label) return null;
      }
      return s.label;
    }, [bandSections, loopSec, SETTLE_S, ROOM_S, taggedAt, avoid, span], { timeout: 40_000, polling: 100 }).then(h => h.jsonValue(), () => null);
    const read = async () => {
      const [chip, band] = await Promise.all([
        text(page.getByTestId('track-section')).then(t => t.toLowerCase()),
        page.evaluate(() => window.__band?.()?.at ?? null),
      ]);
      const part = band === null ? null : bandStep(Math.floor((band % loopSec) / BAND_STEP_S)).part;
      const clock = ((Date.now() - taggedAt) / 1000) % loopSec;
      return { chip, part, clock: bandSections.find(x => clock >= x.start && clock < x.end)?.label ?? null };
    };
    const first1 = settled ? await inSection(null, 5) : null;
    const samples = [];
    for (let i = 0; first1 && i < 5; i++) { samples.push(await read()); await page.waitForTimeout(1000); }
    const agree = samples.filter(x => x.part && x.chip === x.part).length;
    const clockWrong = samples.filter(x => x.part && x.clock !== x.part).length;
    // The first reading is the one three seconds after the band changed
    // section, so it has to agree too: a panel more than three seconds
    // behind the band (the measured lag is under two) cannot hide in the
    // one reading in five the bar forgives.
    const onTime = samples.length > 0 && samples[0].part && samples[0].chip === samples[0].part;
    check('… and its section is the one the band is playing, four times in five, where the clock alone would say another four times in five', !!first1 && onTime && agree >= 4 && clockWrong >= 4,
      `${first1 ? `settled (${SETTLED_PCT}%+), inside a section` : 'never settled inside a section'}; panel/band/clock: ${samples.map(x => `${x.chip || '–'}/${x.part ?? '?'}/${x.clock ?? '?'}`).join(', ')}`);

    // And it follows the band across an edge. Every reading above sits inside
    // one section, which is what keeps the check off the edge's lag, so a
    // panel stuck on the section it first showed would pass them all (the
    // skeptic pass: "chorus" always passes the chorus group). The next
    // section with another name is waited for and read three times, a
    // second apart, and the panel has to name it each time.
    const second = first1 ? await inSection(first1, 2) : null;
    const after = [];
    for (let i = 0; second && i < 3; i++) { after.push(await read()); await page.waitForTimeout(1000); }
    check('… and follows the band into its next section, three readings in three', !!second && after.length === 3 && after.every(x => x.part && x.chip === x.part && x.clock !== x.part),
      `${second ? `into ${second}` : 'no later section found'}; panel/band/clock: ${after.map(x => `${x.chip || '–'}/${x.part ?? '?'}/${x.clock ?? '?'}`).join(', ')}`);

    const panelBand = await firm(line, SURE(null), first);
    check('track panel, the band\'s song: under its playhead, following the map, at least 50% sure', panelBand.ok, panelBand.detail);

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
    const phoneBand = await firm(line, SURE(BAND), await until(line, SURE(BAND), 40_000));
    check('phone, the band\'s song: the Sound sheet names it and follows it, at least 50% sure', phoneBand.ok, phoneBand.detail);
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
