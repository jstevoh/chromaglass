#!/usr/bin/env node
/**
 * The Mac app finds, offers and installs its new versions the way it says it
 * does (PLAN.md 13-update; desktop/updates.js).
 *
 *   npm run updates
 *
 * Asked 2026-10-25: a download link on the site and the profile, a new app on
 * every release, and updating from inside the app. What a performer would be
 * hurt by is the app doing something on its own in the middle of a set, so
 * most of what is asked here is what it must NOT do: never restart itself,
 * never open the browser or a box unasked, never notify over a projector. And
 * what an owner would be hurt by is a release that the installed apps cannot
 * find: the .dmg's name, the feed and the site's link have to agree across
 * three files, so the check reads all three rather than trusting a constant.
 *
 * Plain Node, no Electron: updates.js is handed everything Electron it uses,
 * and here those are stand-ins that record each call, with electron-updater's
 * events sent in the orders it sends them. The real updater against a real
 * feed is `npm run desktop -- --packaged`'s "updates" line, on the packed app.
 */
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { startUpdates, updateMenuItem, updatesOff, downloadUrl, RELEASES, DMG, FIRST_CHECK_MS, RECHECK_MS } =
  await import(pathToFileURL(join(REPO, 'desktop', 'updates.js')).href);

const tmp = mkdtempSync(join(tmpdir(), 'cg-updates-'));
const out = join(tmp, 'macApp.mjs');
await build({ entryPoints: [join(REPO, 'src', 'lib', 'macApp.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
const { macAppRow, onMacComputer, MAC_DOWNLOAD_URL } = await import(pathToFileURL(out).href);
rmSync(tmp, { recursive: true, force: true });

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** electron-updater's autoUpdater, as far as updates.js touches it, recording each call. */
function fakeUpdater() {
  const u = new EventEmitter();
  u.calls = { check: 0, install: 0, feed: null };
  u.checkForUpdates = async () => { u.calls.check++; return null; };
  u.quitAndInstall = () => { u.calls.install++; };
  u.setFeedURL = (f) => { u.calls.feed = f; };
  return u;
}

/** Everything else: timers held until fired, and every outward call written down. */
function harness({ signed = false, feed = null, off = null, quiet = false } = {}) {
  const h = { timers: [], notes: [], opened: [], dialogs: [], changes: 0, quiet };
  h.updater = off ? null : fakeUpdater();
  h.u = startUpdates({
    autoUpdater: h.updater,
    off,
    version: '1.3.0',
    signed,
    feed,
    notify: (title, body) => h.notes.push({ title, body }),
    openExternal: (url) => { h.opened.push(url); },
    quiet: () => h.quiet,
    dialog: (d) => h.dialogs.push(d),
    onChange: () => { h.changes++; },
    setTimer: (fn, ms) => { const t = { fn, ms }; h.timers.push(t); return t; },
    clearTimer: (t) => { h.timers = h.timers.filter((x) => x !== t); },
  });
  h.fire = async () => { const t = h.timers.shift(); t.fn(); await new Promise((r) => setImmediate(r)); return t; };
  return h;
}

const RELEASE = {
  version: '1.3.99',
  files: [{ url: 'ChromaGlass-1.3.99-arm64-mac.zip' }, { url: 'ChromaGlass-mac-arm64.dmg' }],
};

// --- When it looks at all -------------------------------------------------
check('a copy run from the repo does not look', !!updatesOff({ packaged: false, env: {} }));
check('the packed app looks', updatesOff({ packaged: true, env: {} }) === null);
check('under the check with the network off it does not look', !!updatesOff({ packaged: true, env: { CHROMAGLASS_OFFLINE: '1' } }));
check('under the check with a feed of its own it looks', updatesOff({ packaged: true, env: { CHROMAGLASS_OFFLINE: '1', CHROMAGLASS_UPDATE_FEED: 'http://127.0.0.1:1/' } }) === null);
check('CHROMAGLASS_NO_UPDATES switches it off', !!updatesOff({ packaged: true, env: { CHROMAGLASS_NO_UPDATES: '1' } }));

// --- Where the new .dmg is ---------------------------------------------------
check('the GitHub feed gives the newest release\'s .dmg', downloadUrl(RELEASE, null) === `${RELEASES}ChromaGlass-mac-arm64.dmg`, downloadUrl(RELEASE, null));
check('a feed of its own gives that feed\'s .dmg', downloadUrl(RELEASE, 'http://127.0.0.1:9/feed') === 'http://127.0.0.1:9/feed/ChromaGlass-mac-arm64.dmg');
check('a release that lists no .dmg still gives the fixed name', downloadUrl({ version: '2.0.0', files: [{ url: 'a.zip' }] }, null) === `${RELEASES}${DMG}`);

// --- Ad hoc (today): it says so, and the performer downloads -----------------
{
  const h = harness();
  check('ad hoc: nothing downloads by itself', h.updater.autoDownload === false && h.updater.autoInstallOnAppQuit === false);
  check('ad hoc: nothing is asked of the network before the first check is due', h.updater.calls.check === 0 && h.timers.length === 1 && h.timers[0].ms === FIRST_CHECK_MS, `first check at ${h.timers[0]?.ms} ms`);
  await h.fire();
  check('ad hoc: the first check runs, and the next is set', h.updater.calls.check === 1 && h.timers.length === 1 && h.timers[0].ms === RECHECK_MS, `next in ${h.timers[0]?.ms} ms`);
  h.updater.emit('checking-for-update');
  h.updater.emit('update-available', RELEASE);
  check('ad hoc: a new version is offered as a download', h.u.state.status === 'available' && h.u.state.version === '1.3.99' && h.u.state.url === `${RELEASES}${DMG}`, JSON.stringify({ status: h.u.state.status, url: h.u.state.url }));
  check('ad hoc: one notification on the laptop', h.notes.length === 1 && /1\.3\.99/.test(h.notes[0].title), h.notes.map((n) => n.title).join(' | '));
  check('ad hoc: no box and no browser that nobody asked for', h.dialogs.length === 0 && h.opened.length === 0);
  check('ad hoc: the menu says what a click does', updateMenuItem(h.u.state)?.label === 'Download ChromaGlass 1.3.99…', updateMenuItem(h.u.state)?.label);
  h.updater.emit('update-available', RELEASE);
  check('ad hoc: the same version found again is not news again', h.notes.length === 1);
  h.u.act();
  check('ad hoc: the click opens the new .dmg in the browser', h.opened.length === 1 && h.opened[0] === `${RELEASES}${DMG}`);
  check('ad hoc: and never tries to install in place, which macOS refuses for it', h.updater.calls.install === 0);
  check('ad hoc: the page hears each change', h.changes >= 2, `${h.changes} changes`);
}

// --- Over a projector: the room is not told ----------------------------------
{
  const h = harness({ quiet: true });
  await h.fire();
  h.updater.emit('update-available', RELEASE);
  check('with a projector open: no notification', h.notes.length === 0);
  check('with a projector open: still in the menu and the profile sheet', h.u.state.status === 'available' && updateMenuItem(h.u.state)?.label.startsWith('Download'));
}

// --- Signed (once the owner's Developer ID is in): downloads, installs on quit --
{
  const h = harness({ signed: true });
  check('signed: downloads by itself and installs when quit', h.updater.autoDownload === true && h.updater.autoInstallOnAppQuit === true);
  await h.fire();
  h.updater.emit('update-available', RELEASE);
  check('signed: a new version downloads, with no browser', h.u.state.status === 'downloading' && h.opened.length === 0);
  h.updater.emit('download-progress', { percent: 49.6 });
  check('signed: the menu shows how far, and is not a button', updateMenuItem(h.u.state)?.label === 'Downloading ChromaGlass 1.3.99 (50%)' && updateMenuItem(h.u.state)?.enabled === false, updateMenuItem(h.u.state)?.label);
  h.updater.emit('update-downloaded', RELEASE);
  check('signed: ready, said once', h.u.state.status === 'ready' && h.notes.length === 1 && /ready/.test(h.notes[0].title));
  check('signed: never restarts on its own', h.updater.calls.install === 0);
  check('signed: the menu offers the restart', updateMenuItem(h.u.state)?.label === 'Restart to Update to 1.3.99');
  h.u.act();
  check('signed: the click restarts into it', h.updater.calls.install === 1);
}

// --- Check for Updates…: the only time it answers in a box -------------------
{
  const h = harness();
  await h.u.check(true);
  h.updater.emit('update-not-available', { version: '1.3.0' });
  check('asked: up to date is said', h.dialogs.length === 1 && /up to date/.test(h.dialogs[0].message));
  await h.u.check(true);
  h.updater.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED\n at somewhere'));
  check('asked, offline: says it could not reach the releases', h.dialogs.length === 2 && /Could not/.test(h.dialogs[1].message) && h.u.state.status === 'error');
  await h.fire();
  h.updater.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
  check('by itself, offline (a venue): says nothing', h.dialogs.length === 2 && h.notes.length === 0);
  check('after an error the menu offers to look again', updateMenuItem(h.u.state)?.label === 'Check for Updates…');
}

// --- Off: no updater, no menu item ------------------------------------------
{
  const h = harness({ off: 'run from the repo, not a packed app' });
  check('off: nothing is scheduled, no menu item', h.timers.length === 0 && updateMenuItem(h.u.state) === null && h.u.state.status === 'off');
  await h.u.check(true);
  check('off: asked anyway, it says why', h.dialogs.length === 1 && /off/.test(h.dialogs[0].message));
}

// --- The test feed: the check's own server replaces GitHub -------------------
{
  const h = harness({ feed: 'http://127.0.0.1:9/' });
  check('a feed of its own is a generic one', h.updater.calls.feed?.provider === 'generic' && h.updater.calls.feed?.url === 'http://127.0.0.1:9/');
}

// --- The profile sheet's Mac app row -----------------------------------------
const MAC = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 0 };
const IPAD = { ...MAC, maxTouchPoints: 5 };
const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 };
const PC = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 };
check('a Mac is a Mac', onMacComputer(MAC) === true);
check('an iPad asking for the desktop site is not', onMacComputer(IPAD) === false);
check('an iPhone and a PC are not', onMacComputer(IPHONE) === false && onMacComputer(PC) === false);
check('Pro on a Mac: the download', macAppRow('pro', true, null, false).kind === 'download' && macAppRow('pro', true, null, false).href === MAC_DOWNLOAD_URL);
check('Pro on a phone: where to get it (the phone version)', macAppRow('pro', false, null, false).kind === 'on-a-mac');
check('Free and Home: it comes with Pro, no button', macAppRow('free', true, null, false).kind === 'with-pro' && macAppRow('home', true, null, false).kind === 'with-pro');
const inApp = (status, extra = {}) => macAppRow('free', true, { status, current: '1.3.0', signed: false, version: '1.3.99', url: 'x', percent: 40, error: null, ...extra }, true);
check('in the app: an update is a Download button', inApp('available').button === 'Download 1.3.99');
check('in the app: a ready one is Restart to Update', inApp('ready').button === 'Restart to Update');
check('in the app: downloading has no button', inApp('downloading').button === null && /40%/.test(inApp('downloading').line));
check('in the app: the version is shown', inApp('none').current === '1.3.0');

// --- The three files agree on where a release is ------------------------------
const require = createRequire(import.meta.url);
const prevVersion = process.env.DESKTOP_VERSION;
process.env.DESKTOP_VERSION = '1.3.777';
const cfgPath = join(REPO, 'desktop', 'electron-builder.config.cjs');
delete require.cache[cfgPath];
const cfg = require(cfgPath);
if (prevVersion === undefined) delete process.env.DESKTOP_VERSION; else process.env.DESKTOP_VERSION = prevVersion;
const dmgName = cfg.dmg?.artifactName?.replace('${arch}', 'arm64').replace('${ext}', 'dmg');
check('the build names the .dmg as the app and the site expect', dmgName === DMG && MAC_DOWNLOAD_URL === `${RELEASES}${DMG}`, `${dmgName} · ${MAC_DOWNLOAD_URL}`);
check('the build points the app at this repo\'s releases', cfg.publish?.provider === 'github' && cfg.publish.owner === 'jstevoh' && cfg.publish.repo === 'chromaglass' && RELEASES.startsWith(`https://github.com/${cfg.publish.owner}/${cfg.publish.repo}/releases/`));
check('a release\'s version is the one the workflow gives', cfg.extraMetadata?.version === '1.3.777');
check('the build says whether it was signed', typeof cfg.extraMetadata?.chromaglass?.signed === 'boolean');
check('updates.js is packed', cfg.files.includes('updates.js'));
check('both a zip (what an update downloads) and a dmg are built', ['zip', 'dmg'].every((t) => cfg.mac.target.some((x) => x.target === t)));
const dpkg = JSON.parse(readFileSync(join(REPO, 'desktop', 'package.json'), 'utf8'));
check('electron-updater ships in the app, not only in the build', !!dpkg.dependencies?.['electron-updater']);
check('a build never uploads by itself', /--publish never/.test(dpkg.scripts.dist) && /--publish never/.test(dpkg.scripts.pack));

// --- The workflow: a release only when asked, after the check, with the feed ----
const wf = readFileSync(join(REPO, '.github', 'workflows', 'desktop.yml'), 'utf8');
const step = wf.slice(wf.indexOf('- name: Publish the release'));
check('the workflow has a release step after the check', wf.indexOf('- name: Publish the release') > wf.indexOf('scripts/desktop.mjs --packaged'));
check('it publishes only when the owner asks (Run workflow with release ticked, or a desktop-v tag)', /if:.*inputs\.release.*desktop-v|if:.*desktop-v.*inputs\.release/s.test(step.split('\n').slice(0, 4).join('\n')));
check('it uploads the feed, the zip and the fixed-name dmg', /latest-mac\.yml/.test(step) && /\.zip/.test(step) && step.includes(DMG));

console.log(`\n${failed ? `FAIL  ${failed} line(s)` : 'ok    every line'}`);
process.exit(failed ? 1 : 0);
