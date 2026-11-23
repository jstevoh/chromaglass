#!/usr/bin/env node
/**
 * The TV app's sample films page (androidtv/app/src/main/assets/films.html,
 * PLAN 12-tv-2h), held against a stand-in YouTube.
 *
 *   npm run tvyoutube              # about ten seconds
 *   npm run tvyoutube -- --live    # once, by hand: the real YouTube player
 *
 * The owner asked for the channel's song films from YouTube. The app plays
 * them with YouTube's own embedded player in a WebView, on a page of its own
 * (MainActivity.startFilms), and falls back to the same films from the site
 * (Sample.CLIPS, 12-tv-2f) when the page says YouTube will not play. So
 * what has to hold is the page's half of that bargain, and it is held here
 * with the films list exactly as the app puts it in (read from Sample.java
 * and written as Sample.page writes it):
 *
 *   wiring      every film in Sample.FILMS is read (the count of `new Film(`
 *               must match), page() writes the names the page reads, and the
 *               bridge is the name and methods MainActivity registers
 *   list        the page plays a film from Sample.FILMS through YouTube's
 *               no-cookie host, the player with no controls of its own
 *   caption     each film is named on screen by its look and its record, with
 *               how to leave ("Back to look for your Mac")
 *   playing     YouTube saying PLAYING tells the app, which stops its timer;
 *               nothing before it, a second's wait and buffering included
 *   order       a film ending starts the next, every film once in six, round
 *               to the first again, the caption changing with each one
 *   refused     a YouTube error tells the app `failed` once, with the code,
 *               however often the player repeats it, and plays nothing more
 *   no api      YouTube's script not loading at all tells the app too
 *
 * The stand-in is a YT.Player that records what the page asks of it and
 * raises the events the real one raises; it cannot say whether YouTube will
 * play a given film on a given TV. `--live` asks the real player, film by
 * film, and prints what it said, on a machine YouTube trusts: from a cloud
 * session it answers 150 ("not playable embedded") for nearly everything,
 * YouTube's own API demo video included, which is about the session and not
 * the film. Asked from the owner's Chrome on a chromaglass.art page
 * (2026-11-14), all six films and the demo played. A TV whose WebView
 * YouTube turns away gets the site's films instead (MainActivity.filmsFailed).
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';

const live = process.argv.includes('--live');
const SAMPLE = 'androidtv/app/src/main/java/app/chromaglass/tv/Sample.java';
const MAIN = 'androidtv/app/src/main/java/app/chromaglass/tv/MainActivity.java';
const PAGE = 'androidtv/app/src/main/assets/films.html';
const sampleSrc = readFileSync(SAMPLE, 'utf8');
const mainSrc = readFileSync(MAIN, 'utf8');

// Sample.FILMS, read from the source as the app holds it. Whitespace between
// the arguments is free (a formatter may wrap a long line), and a string may
// hold an escaped quote; the count of `new Film(` is held against what the
// pattern read, so a film the pattern cannot read is a failure, not a film
// quietly left out of everything below.
const STR = '"((?:[^"\\\\]|\\\\.)*)"';
const unq = s => s.replace(/\\(.)/g, '$1');
const films = [...sampleSrc.matchAll(new RegExp(
  `new Film\\(\\s*${STR}\\s*,\\s*${STR}\\s*,\\s*${STR}\\s*,\\s*${STR}\\s*,\\s*(\\d{4})\\s*\\)`, 'g',
))].map(m => ({ id: unq(m[1]), look: unq(m[2]), title: unq(m[3]), performer: unq(m[4]), year: +m[5] }));
const filmsInSource = (sampleSrc.match(/new Film\(/g) || []).length;

// Sample.page writes each film as {"id":…,"look":…,…}; the page reads those
// names. The names and their order are read out of page() itself, so a
// rename on the Java side (the caption saying "undefined" on every TV) is
// caught here and not only by eye.
const pageBody = sampleSrc.slice(sampleSrc.indexOf('static String page('), sampleSrc.indexOf('static String json('));
const keys = [...pageBody.matchAll(/append\("[{,]\\"(\w+)\\":"\)/g)].map(m => m[1]);

// Sample.page: the list for the template's one placeholder (String.replace
// in Java replaces every one; there must be exactly one).
const template = readFileSync(PAGE, 'utf8');
const html = list => template.split('FILMS_JSON').join(
  JSON.stringify(list.map(f => Object.fromEntries(keys.map(k => [k, f[k]])))).replace(/</g, '\\u003c'));

// The bridge as MainActivity registers it: its name, and the methods it
// marks @JavascriptInterface. The page falls back to no-ops when the name is
// missing, so a rename on the Java side would leave every TV waiting out the
// 20 s for the clips while a stand-in with hard-coded names stayed green.
const bridgeName = (mainSrc.match(/addJavascriptInterface\(new FilmsBridge\(\), "(\w+)"\)/) || [])[1];
const bridgeBody = mainSrc.slice(mainSrc.indexOf('class FilmsBridge'));
const bridgeMethods = [...bridgeBody.slice(0, bridgeBody.indexOf('\n    }\n')).matchAll(
  /@JavascriptInterface\s+public void (\w+)\(/g)].map(m => m[1]);

let failed = 0;
const check = (name, okay, says) => {
  console.log(`${okay ? ' ok ' : ' FAIL'} ${name}${says ? ' — ' + says : ''}`);
  if (!okay) failed++;
};

// The stand-in: YT.Player records its options and every loadVideoById, and
// window.__yt raises the player's events as YouTube would.
const STUB = `
  window.YT = { PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  YT.Player = function (el, opts) {
    var self = this;
    window.__yt = { opts: opts, loads: [], player: self,
      state: function (s) { opts.events.onStateChange({ data: s, target: self }); },
      error: function (c) { opts.events.onError({ data: c, target: self }); } };
    self.loadVideoById = function (id) { window.__yt.loads.push(id); };
    setTimeout(function () { opts.events.onReady({ target: self }); }, 10);
  };
  window.onYouTubeIframeAPIReady();
`;

async function open(browser, list, { api = 'stub' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // Each method the app exposes records its name and argument; a method the
  // page calls that the app does not have throws, as it would in the WebView.
  await page.addInitScript(({ name, methods }) => {
    window.__app = [];
    window[name] = {};
    for (const m of methods) window[name][m] = why => window.__app.push(why === undefined ? m : m + ' ' + why);
  }, { name: bridgeName, methods: bridgeMethods });
  // The page as the app loads it: its own HTML, on the https base YouTube reads.
  await page.route('https://chromaglass.art/tv/films', r => r.fulfill({ contentType: 'text/html', body: html(list) }));
  if (api === 'stub') await page.route('https://www.youtube.com/iframe_api', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  if (api === 'gone') await page.route('https://www.youtube.com/iframe_api', r => r.abort('connectionrefused'));
  await page.goto('https://chromaglass.art/tv/films');
  return page;
}

const app = page => page.evaluate(() => window.__app.slice());
const yt = page => page.evaluate(() => ({ loads: window.__yt.loads.slice(), host: window.__yt.opts.host, vars: window.__yt.opts.playerVars }));

const browser = await launchChromium(chromium, { args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  if (live) {
    for (const f of [...films, { id: 'aqz-KE-bpKQ', look: 'a known embeddable video', title: '', performer: '', year: 0 }]) {
      const page = await open(browser, [f], { api: 'real' });
      let said = [];
      for (let i = 0; i < 20 && !said.length; i++) { await page.waitForTimeout(1000); said = await app(page); }
      console.log(`${f.id} ${f.look}: ${said.join(', ') || 'nothing in 20 s'}`);
      await page.close();
    }
  } else {
    check('the films list reads from Sample.java, every film of it',
      films.length >= 4 && films.length === filmsInSource && films.every(f => /^[\w-]{11}$/.test(f.id)),
      `${films.length} read of ${filmsInSource}`);
    check('Sample.page writes the names the page reads', keys.join() === 'id,look,title,performer,year', keys.join());
    check('the app answers to the page as ChromaglassSample, with playing and failed',
      bridgeName === 'ChromaglassSample' && bridgeMethods.slice().sort().join() === 'failed,playing',
      `${bridgeName} ${bridgeMethods.join(',')}`);
    check('the page has exactly one place for the list', template.split('FILMS_JSON').length === 2);

    const page = await open(browser, films);
    await page.waitForFunction(() => window.__yt && window.__yt.loads.length === 1);
    let p = await yt(page);
    const first = films.findIndex(f => f.id === p.loads[0]);
    check('it plays a film from the list, through the no-cookie host, with no controls',
      first >= 0 && p.host === 'https://www.youtube-nocookie.com' && p.vars.controls === 0 && p.vars.autoplay === 1,
      `${p.loads[0]} via ${p.host}`);
    const cap = await page.textContent('#caption');
    const f0 = films[first] || {};
    check('the caption names the look and the record, and how to leave',
      cap.includes(f0.look) && cap.includes(f0.title) && cap.includes(f0.performer) && cap.includes(String(f0.year)) && cap.includes('Back to look for your Mac'),
      JSON.stringify(cap));
    // A second's grace, then buffering: neither is playing, and a `playing`
    // told early would cancel the app's 20 s fallback for a player that
    // never starts.
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__yt.state(YT.PlayerState.BUFFERING));
    check('nothing is told to the app before YouTube plays, buffering included', (await app(page)).length === 0, JSON.stringify(await app(page)));

    await page.evaluate(() => window.__yt.state(YT.PlayerState.PLAYING));
    check('PLAYING tells the app', JSON.stringify(await app(page)) === '["playing"]', JSON.stringify(await app(page)));

    const want = Array.from({ length: films.length + 1 }, (_, k) => (first + k) % films.length);
    const captions = [];
    for (let n = 0; n < films.length; n++) {
      await page.evaluate(() => window.__yt.state(YT.PlayerState.ENDED));
      captions.push((await page.textContent('#caption')).includes(films[want[n + 1]].look));
    }
    p = await yt(page);
    const order = p.loads.map(id => films.findIndex(f => f.id === id));
    check('each ending starts the next film, all of them once, then round again',
      JSON.stringify(order) === JSON.stringify(want), `played ${order.join(' ')}`);
    check('the caption follows the film, each one', captions.every(Boolean), captions.map(c => (c ? 'y' : 'n')).join(''));
    await page.close();

    const refused = await open(browser, films);
    await refused.waitForFunction(() => window.__yt && window.__yt.loads.length === 1);
    await refused.evaluate(() => { window.__yt.error(150); window.__yt.error(150); window.__yt.error(5); });
    check('a YouTube error tells the app once, with its code', JSON.stringify(await app(refused)) === '["failed youtube 150"]', JSON.stringify(await app(refused)));
    check('and plays nothing more', (await yt(refused)).loads.length === 1, `${(await yt(refused)).loads.length} loads`);
    await refused.close();

    const gone = await open(browser, films, { api: 'gone' });
    await gone.waitForFunction(() => window.__app.length > 0, null, { timeout: 5000 }).catch(() => {});
    check("YouTube's script not loading tells the app", JSON.stringify(await app(gone)) === '["failed no api"]', JSON.stringify(await app(gone)));
    await gone.close();
  }
} finally {
  await browser.close();
}
if (!live) console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
