#!/usr/bin/env node
/**
 * The phone controller apps (PLAN.md 12-ctl): the iPhone and Android apps as
 * the show's controller, written before their builds.
 *
 *   npm run controller                 # every line built (12-ctl-2, 2026-11-12)
 *   npm run controller -- --owed=<ids>  # a line written before its build
 *   npm run controller -- --head    # watch it
 *
 * Asked for on 2026-11-08: "shouldn't we have 2 apps on each platform? tv apps
 * to just show the visuals, and android and ios apps to control the show?",
 * then "lets get antigravity to build those apps". The TV apps are 12-tv. The
 * phone apps are one app per phone that does both: it plays the show itself
 * (a pocket plate) and it is the Mac's controller, with the dials, the songs
 * and the looks. Most of that is already built for the iPhone (12 step 4a,
 * `npm run applink`): the remote has Draw, the dials, the sequencer and the
 * looks. What it does not have, and what these lines are owed for:
 *
 *   setlist   the Mac's set list on the phone: the Perform desk's own cue
 *             list, in its order, named as the desk names it, the live item
 *             marked, a tap arming an item for the next Go (12-ctl-1)
 *   songs     the Mac's song shows on the phone: run one, stop it, Follow
 *             songs on and off (12-ctl-1; the desk's `songs-follow` switch in
 *             SongsPanel, not the `songFollow` dial the remote already has)
 *   display   the laptop's half of both: the real app, as the Mac runs it,
 *             sends a controller its set list and its song shows from what
 *             it has saved, and acts on what the phone sends (12-ctl-1)
 *   scan      no typing: the app's Laptop remote form reads the QR code the
 *             Phone · iPad panel already draws (lib/qr.ts, PLAN 8f) and links
 *             with it; anything not http(s) is refused (12-ctl-2)
 *   android   the Android app exists, as the iPhone's does: a Capacitor
 *             project beside `ios/`, with the same app id, the microphone
 *             and camera, and plain ws:// allowed to the LAN, which is the
 *             whole reason it is not the Trusted Web Activity step 3 first
 *             planned (12-ctl-3)
 *   nogpu     the Android app on a phone whose web view has no WebGPU says
 *             so, offers the Laptop remote, and opens the show in Chrome,
 *             which has it (12-ctl-3)
 *
 * Each id's line is printed as owed while main's state holds, and is red the
 * moment it passes (take its id out of `--owed` in scripts/checks.json) or
 * once what it is owed for exists and misses (the convention of
 * `deskreach.mjs` and `soundowed.mjs`). The lines with no id hold on main:
 * the remote still lists the looks, the laptop answers a controller, the
 * website has no Scan, the iPhone app is not told to open Chrome.
 *
 * The seams, fixed here so the builds and this check agree:
 *
 *  - Protocol (`src/lib/remoteProtocol.ts`): `RemoteState.setList` is
 *    `{ name, items: [{ id, name }], liveId, cuedId }` and `RemoteState.songs`
 *    is `{ shows: [{ id, title }], runningId, follow }`. The phone sends
 *    `{ type: 'cue-set-item', id }`, `{ type: 'song-run', id }`,
 *    `{ type: 'song-stop' }` and `{ type: 'song-follow', on }`.
 *    Marks on the phone follow the Mac's state, never the phone's own tap:
 *    the lines send a different armed item and running show than the ones
 *    tapped. On the laptop, an armed item also arms its look as the desk's
 *    row does, so the state's existing `cuedPresetId` names it.
 *  - The remote: `remote-to-songs` on Draw and on Controls opens
 *    `remote-songs`; a set item's row is `remote-set-item-<id>` (with
 *    `data-live` and `data-cued`), a song show's row `remote-song-<id>` (with
 *    `data-running`) holding `remote-song-run-<id>`; `remote-song-stop` and
 *    `remote-song-follow` (a switch with `aria-checked`). A scan refused
 *    says why in the form's existing `laptop-error`.
 *  - The app: `laptop-scan` on the Laptop remote form. The native scanner is
 *    replaced here by `window.__cgScan` (declared in lib/checkHooks.ts, "Set
 *    by a check, read by the app"), which resolves to the code's text; the
 *    Android app's way out to Chrome by `window.__cgOpenExternal(url)`, which
 *    is handed the plain https address of the show on the site (the app turns
 *    it into whatever intent opens Chrome after the hook's point). With
 *    neither hook set, the app calls its plugins.
 *  - The Android permissions are in the app's own AndroidManifest.xml, not
 *    only a plugin's merged one, so the line can read them.
 *  - The no-WebGPU notice: `app-no-webgpu`, holding `app-open-in-chrome` and
 *    `app-no-webgpu-remote`, which goes to the remote (`?remote=1`, the
 *    Laptop remote form when no laptop is remembered).
 *
 * The app is recognised by `window.Capacitor.isNativePlatform()` and told
 * which phone it is on by `getPlatform()`; an init script plays the shell, as
 * `applink.mjs` does. No line needs the plate, so this runs on a runner
 * without WebGPU, which is also what `nogpu` needs.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { launchChromium, port } from './chromium.mjs';
import { DEFAULT_SETTINGS } from '../src/types';
import { PRESETS } from '../src/presets';
import { SETLIST_KEY } from '../src/lib/setList';
import { SHOWS_KEY } from '../src/lib/songShows';
import { SHOW_PATH } from '../src/lib/showPath';

const APP_PORT = port(4291, 'CONTROLLER_PORT');
const RELAY_PORT = APP_PORT + 1;
const KEY = '4321';
const HEADED = process.argv.includes('--head');
/** Where the Android app may send someone for the plate: the site itself (firebase.json's hosting, its domain). */
const SITE_HOSTS = ['chromaglass.web.app', 'chromaglass.art', 'www.chromaglass.art'];
const IDS = ['setlist', 'songs', 'display', 'scan', 'android', 'nogpu'];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
/** An owed line: excused only while main's state holds (`mainState`), red once it passes. */
const owedCheck = (id, name, ok, detail, mainState = true) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  results.push({ name, ok: true });
  console.log(` owed  ${name} — ${detail}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── The Android project: read from its files ───────────────────────
// Nothing in a browser can show these, as the iPhone's Info.plist lines in
// applink.mjs. Without them the app never reaches the Mac (Android blocks
// cleartext and a page from https://localhost may not open ws://), or never
// hears the room.
{
  const manifestPath = 'android/app/src/main/AndroidManifest.xml';
  const built = existsSync(manifestPath);
  const manifest = built ? readFileSync(manifestPath, 'utf8') : '';
  const perms = ['INTERNET', 'RECORD_AUDIO', 'CAMERA'].filter((p) => !manifest.includes(`android.permission.${p}`));
  // Cleartext by the attribute, or by a network security config that permits
  // it (read from the file it names, not taken on trust from the attribute).
  const nsc = manifest.match(/android:networkSecurityConfig="@xml\/([\w]+)"/)?.[1];
  const nscFile = nsc ? `android/app/src/main/res/xml/${nsc}.xml` : null;
  const cleartext = /android:usesCleartextTraffic="true"/.test(manifest)
    || (!!nscFile && existsSync(nscFile) && /cleartextTrafficPermitted="true"/.test(readFileSync(nscFile, 'utf8')));
  const gradle = ['android/app/build.gradle', 'android/app/build.gradle.kts'].filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n');
  const appId = /applicationId\s*=?\s*["']app\.chromaglass["']/.test(gradle);
  const cap = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));
  const ws = cap.android?.allowMixedContent === true || cap.server?.androidScheme === 'http';
  owedCheck('android', 'the Android app is a Capacitor project beside ios/: app id app.chromaglass, the microphone, the camera and the network asked for, and plain ws:// to the LAN allowed (cleartext, and mixed content or an http scheme)',
    built && perms.length === 0 && cleartext && appId && ws,
    built ? `missing: ${[...perms, cleartext ? null : 'cleartext', appId ? null : 'applicationId', ws ? null : 'ws:// from the page'].filter(Boolean).join(', ') || 'nothing'}` : `no ${manifestPath}`,
    !built);
}

// ── In a browser, against a real relay ─────────────────────────────
const procs = [];
const stopAll = () => { for (const p of procs) { try { process.kill(-p.pid, 'SIGTERM'); } catch { p.kill('SIGTERM'); } } };
process.on('exit', stopAll);
const start = (args, env, ready) => new Promise((resolve, reject) => {
  const proc = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, ...env } });
  procs.push(proc);
  const notes = [];
  const bail = setTimeout(() => reject(new Error(`${args[0]} did not start: ${notes.join(' ').slice(0, 300)}`)), 30_000);
  const read = (d) => { notes.push(String(d)); if (ready(String(d))) { clearTimeout(bail); resolve(proc); } };
  proc.stdout.on('data', read);
  proc.stderr.on('data', read);
  proc.on('exit', (c) => { clearTimeout(bail); reject(new Error(`${args[0]} exited ${c}: ${notes.join(' ').slice(0, 300)}`)); });
});

// The app's page from its own origin, as the shell serves it; the Mac's show
// server, relay and all, on another (the point applink.mjs makes).
await start(['node_modules/vite/bin/vite.js', 'preview', '--port', String(APP_PORT), '--strictPort'], {}, (s) => s.includes('localhost'));
await start(['server/remote-server.js'], { PORT: String(RELAY_PORT), SHOW_KEY: KEY, OSC_PORT: '0' }, (s) => s.includes('Show key'));
const APP = `http://localhost:${APP_PORT}`;
const RELAY = `http://127.0.0.1:${RELAY_PORT}`;
const PRINTED = `${RELAY}/?remote=1&key=${KEY}`;
const DISPLAY_KEY = (await (await fetch(`${RELAY}/remote-info.json`)).json()).displayKey;

const browser = await launchChromium(chromium, { headless: !HEADED });
const pageErrors = [];
/** A phone: the app on `platform` ('ios' or 'android'), or the website when null. */
const phone = async (platform, init = null) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  if (platform) await ctx.addInitScript((p) => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => p }; }, platform);
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (e) => { pageErrors.push(e.message); console.log('  [pageerror]', e.message.slice(0, 200)); });
  return { ctx, page };
};
const until = async (page, fn, ms = 10_000) => {
  for (let t = 0; t < ms; t += 200) { if (await fn()) return true; await page.waitForTimeout(200); }
  return false;
};
const visible = (page, id) => page.getByTestId(id).first().isVisible().catch(() => false);
const linked = async (page) => (await page.locator('[data-testid="remote-draw"][data-linked="true"]').count()) > 0
  || page.locator('header').getByText('Linked', { exact: true }).isVisible().catch(() => false);
const part = async (name, fn) => {
  try { await fn(); } catch (e) { check(`${name}: ran to the end`, false, String(e?.message ?? e).split('\n')[0].slice(0, 200)); }
};

// ── The phone's half: a stand-in Mac ───────────────────────────────
// The display end of the relay, answering with a state that carries a set
// list and song shows, and writing down everything a controller sends.
const heard = [];
const mac = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}/remote-ws`);
const SET = { name: 'Friday', items: [{ id: 'set-a', name: 'Opening wash' }, { id: 'set-b', name: 'Dark Star' }, { id: 'set-c', name: 'Encore' }], liveId: 'set-b', cuedId: null };
const SONGS = { shows: [{ id: 'song-1', title: 'Dark Star' }, { id: 'song-2', title: 'Ripple' }], runningId: null, follow: false };
let snapshot = { settings: DEFAULT_SETTINGS, activePresetId: null, isActive: true, isAutomated: false, overlaysVisible: true, setList: SET, songs: SONGS };
const tell = () => mac.send(JSON.stringify({ type: 'state', state: snapshot }));
await new Promise((resolve, reject) => { mac.once('open', resolve); mac.once('error', reject); });
mac.send(JSON.stringify({ type: 'hello', role: 'display', key: DISPLAY_KEY }));
tell();
mac.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.type === 'request-state') { tell(); return; }
  heard.push(m);
});
const sent = async (page, tap, match) => {
  const n = heard.length;
  await tap();
  await until(page, async () => heard.slice(n).some(match), 5000);
  return heard.slice(n).find(match) ?? heard.slice(n)[0] ?? null;
};

await part('the remote\'s songs', async () => {
  const { ctx, page } = await phone('ios');
  await page.goto(`${APP}/?remote=1&relay=${encodeURIComponent(RELAY)}&key=${KEY}`, { waitUntil: 'load' });
  check('the app\'s remote links to the stand-in Mac', await until(page, () => linked(page), 15_000));
  // The remote opens on Draw (PLAN §8-draw); Songs is one tap from it and
  // from Controls. Today's looks stay on Controls: the control for the lines below.
  const onDraw = await visible(page, 'remote-to-songs');
  await page.getByTestId('draw-controls').tap();
  check('Controls still lists the looks, tap to arm', await until(page, () => visible(page, 'remote-presets-light-show'), 5000));
  const onControls = await visible(page, 'remote-to-songs');
  const built = onControls || onDraw;
  if (built) await page.getByTestId('remote-to-songs').first().tap();
  const open = built && await until(page, () => visible(page, 'remote-songs'), 5000);
  owedCheck('setlist', 'the remote has a Songs screen, from Controls and from Draw', onDraw && onControls && open, `remote-to-songs on Draw ${onDraw}, on Controls ${onControls}, opens remote-songs ${open}`, !built);

  // The set list: rows in the Mac's order, named, the live one marked.
  const rows = open ? await page.locator('[data-testid^="remote-set-item-"]').evaluateAll((els) => els.map((e) => ({ id: e.dataset.testid.slice('remote-set-item-'.length), name: e.textContent?.trim() ?? '', live: e.dataset.live === 'true' }))) : [];
  const order = rows.map((r) => r.id);
  owedCheck('setlist', 'the Mac\'s set list, in its order, each item named as the desk names it, the live one marked',
    same(order, SET.items.map((i) => i.id)) && SET.items.every((i, k) => rows[k]?.name.includes(i.name)) && rows.map((r) => r.live).join() === 'false,true,false',
    JSON.stringify(rows).slice(0, 200), !open);
  const cue = open && rows.length ? await sent(page, () => page.getByTestId('remote-set-item-set-b').tap(), (m) => m.type === 'cue-set-item') : null;
  owedCheck('setlist', 'tapping an item arms it on the Mac (cue-set-item)', cue?.type === 'cue-set-item' && cue.id === 'set-b', JSON.stringify(cue), !open);
  // The Mac, not the tap, says what is armed: here another item than the one
  // tapped (the desk armed it meanwhile), so a remote that marks its own tap fails.
  snapshot = { ...snapshot, setList: { ...SET, cuedId: 'set-c' } };
  tell();
  const cuedAttr = async (id) => page.getByTestId(`remote-set-item-${id}`).getAttribute('data-cued').catch(() => null);
  const cuedShown = rows.length ? await until(page, async () => (await cuedAttr('set-c')) === 'true', 5000) : false;
  const tappedNot = rows.length ? (await cuedAttr('set-b')) !== 'true' : false;
  owedCheck('setlist', 'the item the Mac says is armed is marked, and only that one', cuedShown && tappedNot, `set-c cued ${cuedShown}, set-b not cued ${tappedNot}`, !open);

  // The song shows: run, stop, follow.
  const songRows = open ? await page.locator('[data-testid^="remote-song-song-"]').evaluateAll((els) => els.map((e) => ({ id: e.dataset.testid.slice('remote-song-'.length), name: e.textContent?.trim() ?? '' }))) : [];
  owedCheck('songs', 'the Mac\'s song shows, each named by its song', same(songRows.map((r) => r.id), SONGS.shows.map((s) => s.id)) && SONGS.shows.every((s, k) => songRows[k]?.name.includes(s.title)), JSON.stringify(songRows).slice(0, 200), !open);
  const run = songRows.length ? await sent(page, () => page.getByTestId('remote-song-run-song-2').tap(), (m) => m.type === 'song-run') : null;
  owedCheck('songs', 'Run sends song-run for that show', run?.type === 'song-run' && run.id === 'song-2', JSON.stringify(run), !open);
  // As above: the Mac says which show runs, here not the one just tapped.
  snapshot = { ...snapshot, songs: { ...SONGS, runningId: 'song-1' } };
  tell();
  const runAttr = async (id) => page.getByTestId(`remote-song-${id}`).getAttribute('data-running').catch(() => null);
  const running = songRows.length ? await until(page, async () => (await runAttr('song-1')) === 'true', 5000) : false;
  const tappedIdle = songRows.length ? (await runAttr('song-2')) !== 'true' : false;
  const stop = running ? await sent(page, () => page.getByTestId('remote-song-stop').tap(), (m) => m.type === 'song-stop') : null;
  owedCheck('songs', 'the show the Mac says runs is marked, only that one, and Stop sends song-stop', running && tappedIdle && stop?.type === 'song-stop', `song-1 running ${running}, song-2 idle ${tappedIdle}, ${JSON.stringify(stop)}`, !open);
  const followBefore = open ? await page.getByTestId('remote-song-follow').getAttribute('aria-checked').catch(() => null) : null;
  const follow = followBefore !== null ? await sent(page, () => page.getByTestId('remote-song-follow').tap(), (m) => m.type === 'song-follow') : null;
  snapshot = { ...snapshot, songs: { ...snapshot.songs, follow: true } };
  tell();
  const followAfter = followBefore !== null && await until(page, async () => (await page.getByTestId('remote-song-follow').getAttribute('aria-checked').catch(() => null)) === 'true', 5000);
  owedCheck('songs', 'Follow songs, off on the Mac, shows off, sends song-follow on, and shows on once the Mac says so', followBefore === 'false' && follow?.type === 'song-follow' && follow.on === true && followAfter, `aria-checked ${followBefore}, ${JSON.stringify(follow)}, then on ${followAfter}`, !open);
  await ctx.close();
});

// ── Scan the laptop's code ─────────────────────────────────────────
// While the stand-in Mac is still connected: written after the laptop's side,
// this part ran once `mac.close()` had hung the stand-in up, so a correct scan
// reached the right address and read Offline with no laptop there (measured
// 2026-11-12, the socket closed before the scan). A scan has to meet a
// laptop, as the typed address in the songs part does.
await part('scan', async () => {
  // The Phone · iPad panel's QR code says exactly the Phone line (lib/qr.ts,
  // read back by `npm run qr`), so a scan hands the form that line.
  const { ctx, page } = await phone('ios', { fn: (text) => { window.__cgScan = async () => text; }, arg: PRINTED });
  await page.goto(`${APP}/?remote=1`, { waitUntil: 'load' });
  await until(page, () => visible(page, 'laptop-link'));
  const has = await visible(page, 'laptop-scan');
  if (has) await page.getByTestId('laptop-scan').tap();
  const went = has && await page.waitForURL(/relay=/, { timeout: 10_000 }).then(() => true, () => false);
  const url = new URL(page.url());
  owedCheck('scan', 'the app\'s Laptop remote form has Scan, and a scanned Phone line links with its key', went && url.searchParams.get('relay') === RELAY && url.searchParams.get('key') === KEY && await until(page, () => linked(page)), url.search, !has);
  await ctx.close();

  const bad = await phone('ios', { fn: () => { window.__cgScan = async () => 'javascript:alert(1)'; } });
  await bad.page.goto(`${APP}/?remote=1`, { waitUntil: 'load' });
  await until(bad.page, () => visible(bad.page, 'laptop-link'));
  const hasBad = await visible(bad.page, 'laptop-scan');
  if (hasBad) await bad.page.getByTestId('laptop-scan').tap();
  await bad.page.waitForTimeout(1000);
  const stayed = !new URL(bad.page.url()).searchParams.has('relay') && await visible(bad.page, 'laptop-link');
  const said = hasBad && await visible(bad.page, 'laptop-error') && ((await bad.page.getByTestId('laptop-error').first().textContent().catch(() => '')) ?? '').trim().length > 10;
  owedCheck('scan', 'a code that is not a laptop\'s address is refused, in words, and goes nowhere', hasBad && stayed && said, `stayed ${stayed}, said ${said}`, !hasBad);
  await bad.ctx.close();

  const web = await phone(null);
  await web.page.goto(PRINTED, { waitUntil: 'load' });
  await until(web.page, () => linked(web.page));
  check('the website\'s remote has no Scan (it has no camera plugin, and needs no address)', !(await visible(web.page, 'laptop-scan')));
  await web.ctx.close();
});
mac.close();

// ── The laptop's half: the real app, as the Mac runs it ────────────
// The display page at the show server's own origin, with a set and two song
// shows saved, and a controller that is this script.
await part('the laptop\'s side', async () => {
  const [lookA, lookB] = PRESETS.slice(0, 2);
  const set = { name: 'Friday', items: [{ id: 'set-1', kind: 'look', ref: lookA.id }, { id: 'set-2', kind: 'look', ref: lookB.id, name: 'Second' }] };
  const shows = [
    { id: 'song-x', song: { title: 'Dark Star', artist: 'Grateful Dead' }, look: { kind: 'preset', id: lookA.id }, actions: [] },
    { id: 'song-y', song: { title: 'Ripple', artist: 'Grateful Dead' }, look: { kind: 'preset', id: lookB.id }, actions: [] },
  ];
  // A laptop's window, not a phone's: the desk, not the phone layout.
  const lap = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await lap.addInitScript(([k1, v1, k2, v2]) => { try { localStorage.setItem(k1, v1); localStorage.setItem(k2, v2); } catch { /* checked below */ } }, [SETLIST_KEY, JSON.stringify(set), SHOWS_KEY, JSON.stringify(shows)]);
  const desk = await lap.newPage();
  desk.on('pageerror', (e) => { pageErrors.push(e.message); console.log('  [pageerror]', e.message.slice(0, 200)); });
  await desk.goto(`${RELAY}${SHOW_PATH}?debug&dpr=0.35`, { waitUntil: 'load' });

  const states = [];
  const ctl = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}/remote-ws`);
  await new Promise((resolve, reject) => { ctl.once('open', resolve); ctl.once('error', reject); });
  ctl.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.type === 'state') states.push(m.state); });
  ctl.send(JSON.stringify({ type: 'hello', role: 'controller', key: KEY }));
  const answered = await until(desk, async () => states.length > 0, 30_000);
  check('the laptop answers a controller with its state', answered && !!states.at(-1)?.settings, `${states.length} states`);
  const last = () => states.at(-1) ?? {};
  const sl = last().setList;
  owedCheck('display', 'its state carries the set list it has saved: the items\' ids in order, each with the name the desk shows',
    same(sl?.items?.map((i) => i.id), ['set-1', 'set-2']) && sl?.items?.[0]?.name === lookA.name && sl?.items?.[1]?.name === 'Second' && sl?.liveId === null && sl?.cuedId === null,
    JSON.stringify(sl ?? null).slice(0, 200), !sl);
  const sg = last().songs;
  owedCheck('display', 'and the song shows it has saved, by title, none running, with Follow songs as the desk has it',
    same(sg?.shows?.map((s) => [s.id, s.title]), [['song-x', 'Dark Star'], ['song-y', 'Ripple']]) && sg?.runningId === null && typeof sg?.follow === 'boolean',
    JSON.stringify(sg ?? null).slice(0, 200), !sg);
  const n = states.length;
  ctl.send(JSON.stringify({ type: 'cue-set-item', id: 'set-2' }));
  // Armed for real: the desk's own armed look (`cuedPresetId`, what Go will
  // send, which predates this work) is that item's look, not only the echo.
  const armed = await until(desk, async () => states.slice(n).some((s) => s.setList?.cuedId === 'set-2' && s.cuedPresetId === lookB.id), 8000);
  owedCheck('display', 'a phone\'s cue-set-item arms that item, as tapping its row on the desk does (its look is what Go will send)', armed, `cuedId ${last().setList?.cuedId ?? null}, cuedPresetId ${last().cuedPresetId ?? null}`, !sl);
  const r = states.length;
  ctl.send(JSON.stringify({ type: 'song-run', id: 'song-y' }));
  const ran = await until(desk, async () => states.slice(r).some((s) => s.songs?.runningId === 'song-y'), 8000);
  owedCheck('display', 'song-run starts that song\'s show', ran, `runningId ${last().songs?.runningId ?? null}`, !sg);
  const q = states.length;
  ctl.send(JSON.stringify({ type: 'song-stop' }));
  const stopped = ran && await until(desk, async () => states.slice(q).some((s) => s.songs && s.songs.runningId === null), 8000);
  owedCheck('display', 'and song-stop stops it', stopped, `runningId ${last().songs?.runningId ?? null}`, !sg);
  const before = !!last().songs?.follow;
  const m = states.length;
  ctl.send(JSON.stringify({ type: 'song-follow', on: !before }));
  const flipped = await until(desk, async () => states.slice(m).some((s) => s.songs?.follow === !before), 8000);
  owedCheck('display', 'and song-follow turns Follow songs over', flipped, `follow ${before} → ${last().songs?.follow ?? null}`, !sg);
  ctl.close();
  await lap.close();
});

// ── The Android app on a phone without WebGPU ──────────────────────
await part('no WebGPU', async () => {
  const opened = [];
  // A phone's web view with no WebGPU, made so here even on a runner that has
  // it (PW_WEBGPU=1, a Mac), so the line measures the notice, not the runner.
  const opener = { fn: () => { try { Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true }); } catch { /* read below */ } window.__cgOpened = []; window.__cgOpenExternal = (url) => { window.__cgOpened.push(String(url)); }; } };
  const { ctx, page } = await phone('android', opener);
  await page.goto(`${APP}/?debug&look=classic&dpr=0.35&play=0`, { waitUntil: 'load' });
  const notice = await until(page, () => visible(page, 'app-no-webgpu'), 15_000);
  if (notice && await visible(page, 'app-open-in-chrome')) {
    await page.getByTestId('app-open-in-chrome').tap();
    await page.waitForTimeout(500);
    opened.push(...await page.evaluate(() => window.__cgOpened ?? []));
  }
  const target = opened[0] ? new URL(opened[0]) : null;
  owedCheck('nogpu', 'the Android app with no WebGPU says so and opens the show in Chrome (the site\'s own https address, the show\'s path)',
    notice && target?.protocol === 'https:' && SITE_HOSTS.includes(target.hostname) && target.pathname.startsWith(SHOW_PATH), `notice ${notice}, opened ${opened.join(', ') || 'nothing'}`, !notice);
  const remote = notice && await visible(page, 'app-no-webgpu-remote');
  if (remote) await page.getByTestId('app-no-webgpu-remote').tap();
  const toRemote = remote && await page.waitForURL(/remote=1/, { timeout: 10_000 }).then(() => true, () => false);
  owedCheck('nogpu', 'and offers the Laptop remote instead', toRemote, `remote ${remote}`, !notice);
  await ctx.close();

  const ios = await phone('ios', opener);
  await ios.page.goto(`${APP}/?debug&look=classic&dpr=0.35&play=0`, { waitUntil: 'load' });
  await ios.page.waitForTimeout(3000);
  check('the iPhone app is never told to open Chrome', !(await visible(ios.page, 'app-open-in-chrome')));
  await ios.ctx.close();
});

await browser.close();
check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
stopAll();
process.exit(failed.length ? 1 : 0);
