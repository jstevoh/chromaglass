#!/usr/bin/env node
/**
 * The iPhone app's two modes: playing the show, and being the laptop's remote.
 *
 *   npm run applink              # builds, then about half a minute
 *   npm run applink -- --head    # watch it
 *
 * Asked for on 2026-09-27, with the iPhone app (PLAN.md §12): "make the
 * remote control work on the iPhone app … I'd like to be able to switch back
 * and forth between modes". The app's pages come from inside the app
 * (`capacitor://localhost`), where there is no show server, so the remote
 * there is told the laptop's address and carries it as `?relay=`
 * (`src/lib/appLink.ts`). This checks that on a real relay and a stand-in
 * laptop, with the app's page served from a *different* origin than the
 * relay, which is the whole point: a remote that only worked because the
 * page and the relay shared an origin would pass a same-origin test and fail
 * on the phone.
 *
 *   the address   what the show server prints, a typed address, a tunnel,
 *                 a key typed apart; anything not http(s) refused (pure)
 *   the tier      the app is not taken for a laptop serving itself, which
 *                 would offer a phone the 1024² rung (pure)
 *   ask first     the app's remote with no laptop asks for one, and opens
 *                 no socket to its own origin
 *   linked        pasting the printed Phone line links it: the stand-in
 *                 laptop hears the controller, the header says Linked, and
 *                 a button on the remote arrives at the laptop as its action
 *   modes         Play here goes back to the show; More › Laptop remote in
 *                 the phone layout goes back to the remembered laptop
 *   wrong key     the relay's refusal is shown, with the way to fix it
 *   the website   unchanged: no Laptop remote tile and no app bar outside
 *                 the app, and the remote the show server serves itself
 *                 still links to its own origin
 *
 * The app is recognised by `window.Capacitor.isNativePlatform()`, which the
 * shell puts on every page; here an init script plays the shell. The plate
 * is not needed (the phone layout renders over the "needs WebGPU" screen on
 * a runner without it), so this runs anywhere, and in the Measure job.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { WebSocket, WebSocketServer } from 'ws';
import { launchChromium } from './chromium.mjs';
import { parseLaptopAddress, relaySocketUrl, remoteHref } from '../src/lib/appLink';
import { detectTier } from '../src/lib/platform';
import { DEFAULT_SETTINGS } from '../src/types';

const APP_PORT = Number(process.env.APPLINK_PORT ?? 4191);
const RELAY_PORT = APP_PORT + 1;
/** A host a crafted link might name as the relay. */
const STRANGER_PORT = APP_PORT + 2;
const KEY = '4321';
const HEADED = process.argv.includes('--head');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── The address: pure ──────────────────────────────────────────────
{
  const printed = parseLaptopAddress('http://192.168.1.20:3000/?remote=1&key=1234');
  check('the Phone line the show server prints', same(printed, { relay: 'http://192.168.1.20:3000', key: '1234' }), JSON.stringify(printed));
  const bare = parseLaptopAddress('192.168.1.20');
  check('a bare address gets the show server\'s port', same(bare, { relay: 'http://192.168.1.20:3000', key: null }), JSON.stringify(bare));
  const local = parseLaptopAddress(' my-mac.local:3001 ', '7777');
  check('a .local name with its port, the key typed apart', same(local, { relay: 'http://my-mac.local:3001', key: '7777' }), JSON.stringify(local));
  const typedWins = parseLaptopAddress('http://10.0.0.5:3000/?remote=1&key=1111', '2222');
  check('a typed key wins over the one in the address', typedWins?.key === '2222', JSON.stringify(typedWins));
  const tunnel = parseLaptopAddress('https://calm-river.trycloudflare.com/?remote=1&key=9999');
  check('a tunnel keeps https and no port', same(tunnel, { relay: 'https://calm-river.trycloudflare.com', key: '9999' }), JSON.stringify(tunnel));
  check('and its socket is wss', relaySocketUrl(tunnel.relay, '/remote-ws') === 'wss://calm-river.trycloudflare.com/remote-ws');
  check('a LAN socket is ws on the port', relaySocketUrl(printed.relay, '/remote-ws') === 'ws://192.168.1.20:3000/remote-ws');
  const refused = ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://x', 'ws://x', 'wss://laptop:3000', '', '   '].filter((t) => parseLaptopAddress(t) !== null);
  check('anything but http or https is refused', refused.length === 0, refused.join(', '));
  check('the remote page carries the relay and the key', remoteHref(printed) === '/?remote=1&relay=http%3A%2F%2F192.168.1.20%3A3000&key=1234', remoteHref(printed));
}

// ── The tier: pure, with a stand-in window ─────────────────────────
{
  const tierAt = (hostname, app) => {
    const saved = globalThis.window;
    globalThis.window = { location: { hostname, search: '' }, ...(app ? { Capacitor: { isNativePlatform: () => true } } : {}) };
    try { return detectTier(); } finally { globalThis.window = saved; }
  };
  check('the app (capacitor://localhost) gets the website\'s ladder', tierAt('localhost', true) === 'hosted', tierAt('localhost', true));
  check('a laptop serving itself still gets the full one', tierAt('localhost', false) === 'local');
  check('the website is still hosted', tierAt('chromaglass.web.app', false) === 'hosted');
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

// The app's page: the built site from its own origin, as the shell serves it.
await start(['node_modules/vite/bin/vite.js', 'preview', '--port', String(APP_PORT), '--strictPort'], {}, (s) => s.includes('localhost'));
// The laptop's show server, relay and all, on another origin.
await start(['server/remote-server.js'], { PORT: String(RELAY_PORT), SHOW_KEY: KEY, OSC_PORT: '0' }, (s) => s.includes('Show key'));

// A stand-in laptop: the display end of the relay, answering with a state
// and writing down everything a controller sends it.
const heard = [];
let controllersSeen = 0;
const laptop = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}/remote-ws`);
const snapshot = { settings: DEFAULT_SETTINGS, activePresetId: null, isActive: true, isAutomated: false, overlaysVisible: true };
await new Promise((resolve, reject) => { laptop.once('open', resolve); laptop.once('error', reject); });
laptop.send(JSON.stringify({ type: 'hello', role: 'display', key: KEY }));
laptop.send(JSON.stringify({ type: 'state', state: snapshot }));
laptop.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.type === 'request-state') { controllersSeen++; laptop.send(JSON.stringify({ type: 'state', state: snapshot })); return; }
  heard.push(m);
});

const APP = `http://localhost:${APP_PORT}`;
const PRINTED = `http://127.0.0.1:${RELAY_PORT}/?remote=1&key=${KEY}`;
const browser = await launchChromium(chromium, { headless: !HEADED });
const pageErrors = [];
const phone = async ({ app }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  if (app) await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (e) => { pageErrors.push(e.message); console.log('  [pageerror]', e.message.slice(0, 200)); });
  const sockets = [];
  page.on('websocket', (ws) => sockets.push(ws.url()));
  return { ctx, page, sockets };
};
const until = async (page, fn, ms = 10_000) => {
  for (let t = 0; t < ms; t += 200) { if (await fn()) return true; await page.waitForTimeout(200); }
  return false;
};
const visible = (page, id) => page.getByTestId(id).first().isVisible().catch(() => false);
// Linked on either of the remote's screens: Controls' header says so in words,
// Draw (the one it opens on, PLAN §8-draw) marks its root.
const linked = async (page) => (await page.locator('[data-testid="remote-draw"][data-linked="true"]').count()) > 0
  || page.locator('header').getByText('Linked', { exact: true }).isVisible().catch(() => false);

// Each part runs on its own: a wait that times out is that part's FAIL, and
// the parts after it still run and report.
const part = async (name, fn) => {
  try { await fn(); } catch (e) { check(`${name}: ran to the end`, false, String(e?.message ?? e).split('\n')[0].slice(0, 200)); }
};
const workers = (page) => page.evaluate(() => navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((r) => r.length) : 0);
const RELAY = `http://127.0.0.1:${RELAY_PORT}`;

// First use: nothing remembered. More › Laptop remote asks, and Play here
// from the form goes back.
await part('first use', async () => {
  const { ctx, page, sockets } = await phone({ app: true });
  await page.goto(`${APP}/?debug&look=classic&dpr=0.35`, { waitUntil: 'load' });
  await until(page, () => visible(page, 'phone-stage'), 20_000);
  await page.getByTestId('phone-open-more').tap();
  await until(page, () => visible(page, 'phone-laptop-remote'), 5000);
  check('More has Laptop remote in the app', await visible(page, 'phone-laptop-remote'));
  await page.getByTestId('phone-laptop-remote').tap();
  await until(page, () => visible(page, 'laptop-link'));
  const at = new URL(page.url());
  check('with no laptop remembered it asks for one', at.searchParams.get('remote') === '1' && !at.searchParams.has('relay') && (await visible(page, 'laptop-link')), at.search);
  await page.waitForTimeout(1000);
  check('and opens no socket to its own origin', sockets.length === 0, sockets.join(', '));
  await page.getByTestId('app-play-here').first().tap();
  await page.waitForURL((u) => !u.search.includes('remote'));
  check('Play here on the form goes back to the show', await until(page, () => visible(page, 'phone-stage'), 20_000), page.url());
  // A worker's registration lands after load; give it the time it takes on the website below.
  await page.waitForTimeout(1500);
  check('the app registers no service worker', (await workers(page)) === 0);
  await ctx.close();
});

// Linked: typed the way a person reads it off the laptop (address, key apart),
// then Change laptop and the printed line pasted.
await part('linked', async () => {
  const { ctx, page, sockets } = await phone({ app: true });
  await page.goto(`${APP}/?remote=1`, { waitUntil: 'load' });
  await until(page, () => visible(page, 'laptop-link'));
  await page.getByTestId('laptop-address').fill(`127.0.0.1:${RELAY_PORT}`);
  await page.getByTestId('laptop-key').fill(KEY);
  const before = controllersSeen;
  await page.getByTestId('laptop-connect').tap();
  await page.waitForURL(/relay=/);
  const url = new URL(page.url());
  check('Connect carries the laptop and the typed key in the page\'s address', url.searchParams.get('relay') === RELAY && url.searchParams.get('key') === KEY, url.search);
  check('the remote says Linked', await until(page, () => linked(page)));
  check('the laptop heard a controller join', controllersSeen > before, `${controllersSeen - before} joined`);
  check('its socket went to the laptop, not the app\'s origin', sockets.some((s) => s.startsWith(`ws://127.0.0.1:${RELAY_PORT}/`)) && !sockets.some((s) => s.includes(`:${APP_PORT}`)), sockets.join(', '));
  check('the remote opens on Draw', await visible(page, 'remote-draw'));
  const n = heard.length;
  await page.getByTestId('draw-blackout').tap();
  await until(page, async () => heard.length > n, 5000);
  const got = heard.slice(n);
  check('a button on the remote arrives at the laptop', got.some((m) => m.type === 'action' && m.action === 'blackout-toggle'), JSON.stringify(got).slice(0, 160));
  // The app's two modes are in Controls, one tap from Draw, and the remote
  // remembers it was left there, so Change laptop below comes back to them.
  await page.getByTestId('draw-controls').tap();
  check('the app bar is there, in Controls', await until(page, () => visible(page, 'app-mode-bar'), 5000));

  await page.getByTestId('app-change-laptop').tap();
  await until(page, () => visible(page, 'laptop-link'));
  const addr = await page.getByTestId('laptop-address').inputValue();
  const key = await page.getByTestId('laptop-key').inputValue();
  check('Change laptop opens the form with the last laptop filled in', addr === RELAY && key === KEY, `${addr} / ${key}`);
  await page.getByTestId('laptop-address').fill(PRINTED);
  await page.getByTestId('laptop-connect').tap();
  await page.waitForURL(/relay=/);
  const pasted = new URL(page.url());
  check('the printed Phone line pasted links too, its key read from it', pasted.searchParams.get('relay') === RELAY && pasted.searchParams.get('key') === KEY && (await until(page, () => linked(page))), pasted.search);

  // Modes: back to the show, then back to the laptop from More.
  await page.getByTestId('app-play-here').first().tap();
  await page.waitForURL((u) => !u.search.includes('remote'));
  check('Play here goes back to the show', await until(page, () => visible(page, 'phone-stage'), 20_000), page.url());
  await page.getByTestId('phone-open-more').tap();
  await until(page, () => visible(page, 'phone-laptop-remote'), 5000);
  await page.getByTestId('phone-laptop-remote').tap();
  await page.waitForURL(/relay=/, { timeout: 10_000 });
  check('More › Laptop remote goes straight to the remembered laptop', new URL(page.url()).searchParams.get('relay') === RELAY, page.url());
  check('and links again', await until(page, () => linked(page)));
  await ctx.close();
});

// The next show: the server picks a new key every start (unless SHOW_KEY
// pins it), so the remembered one is refused. The message names the way
// out, and pasting the new Phone line has to win over the remembered key.
await part('wrong key', async () => {
  const { ctx, page } = await phone({ app: true });
  await page.goto(`${APP}/?debug&look=classic&dpr=0.35`, { waitUntil: 'load' });
  await page.evaluate((relay) => localStorage.setItem('chromaglass-laptop', JSON.stringify({ relay, key: '0000' })), RELAY);
  await page.goto(`${APP}/?debug&look=classic&dpr=0.35`, { waitUntil: 'load' });
  await until(page, () => visible(page, 'phone-stage'), 20_000);
  await page.getByTestId('phone-open-more').tap();
  await until(page, () => visible(page, 'phone-laptop-remote'), 5000);
  await page.getByTestId('phone-laptop-remote').tap();
  await page.waitForURL(/relay=/, { timeout: 10_000 });
  const said = await until(page, () => page.getByText(/Wrong show key: tap Change laptop/).isVisible().catch(() => false));
  check('last show\'s key is refused, and says how to fix it', said);
  check('and does not say Linked', !(await linked(page)));
  await page.getByTestId('app-change-laptop').tap();
  check('Change laptop there opens the form', await until(page, () => visible(page, 'laptop-link')));
  check('with last show\'s key still in it', (await page.getByTestId('laptop-key').inputValue()) === '0000');
  await page.getByTestId('laptop-address').fill(PRINTED);
  check('pasting this show\'s Phone line puts its key in the key field', (await page.getByTestId('laptop-key').inputValue()) === KEY, await page.getByTestId('laptop-key').inputValue());
  // Return on the phone's keyboard, not the button: the form submits.
  await page.getByTestId('laptop-address').press('Enter');
  await page.waitForURL(/relay=/, { timeout: 10_000 });
  check('and Return connects with it', new URL(page.url()).searchParams.get('key') === KEY && (await until(page, () => linked(page))), new URL(page.url()).search);
  await ctx.close();
});

// A relay named in the address is followed by the app's remote and nothing
// else. The laptop's display learns the show key from its own server and then
// opens its socket; if it followed ?relay=, one crafted link opened on the
// laptop would hand the key and the show to whatever host the link named.
await part('only the app follows ?relay=', async () => {
  const stranger = new WebSocketServer({ port: STRANGER_PORT });
  const strangerHeard = [];
  stranger.on('connection', (ws) => { strangerHeard.push('connected'); ws.on('message', (m) => strangerHeard.push(String(m).slice(0, 80))); });
  try {
    const bait = `relay=${encodeURIComponent(`http://127.0.0.1:${STRANGER_PORT}`)}`;
    const { ctx, page, sockets } = await phone({ app: false });
    await page.goto(`http://127.0.0.1:${RELAY_PORT}/?${bait}&dpr=0.35`, { waitUntil: 'load' });
    const home = await until(page, async () => sockets.some((s) => s.startsWith(`ws://127.0.0.1:${RELAY_PORT}/`)), 15_000);
    check('the laptop\'s display, sent a link naming another relay, opens its socket at home', home, sockets.join(', '));
    await page.goto(`${PRINTED}&${bait}`, { waitUntil: 'load' });
    check('a browser\'s remote with the same link still links at home', await until(page, () => linked(page)));
    await page.waitForTimeout(1000);
    check('and the named host heard nothing from either', strangerHeard.length === 0, strangerHeard.slice(0, 3).join(' | '));
    await ctx.close();
  } finally {
    stranger.close();
  }
});

// The website, unchanged.
await part('the website', async () => {
  const { ctx, page } = await phone({ app: false });
  await page.goto(`${APP}/?debug&look=classic&dpr=0.35`, { waitUntil: 'load' });
  await until(page, () => visible(page, 'phone-stage'), 20_000);
  await page.getByTestId('phone-open-more').tap();
  await until(page, () => visible(page, 'phone-sheet-more'), 5000);
  check('the website\'s More sheet opens', await visible(page, 'phone-sheet-more'));
  check('and has no Laptop remote', !(await visible(page, 'phone-laptop-remote')));
  // The control for the app's "no service worker": the same page registers one here.
  check('the website still registers its service worker', await until(page, async () => (await workers(page)) > 0, 5000));
  await page.goto(PRINTED, { waitUntil: 'load' });
  check('the remote the show server serves still links to its own origin', await until(page, () => linked(page)));
  check('with no app bar', !(await visible(page, 'app-mode-bar')));
  check('and no laptop form', !(await visible(page, 'laptop-link')));
  await ctx.close();
});

await browser.close();
laptop.close();

// ── The shell's own promises to iOS: read from the Info.plist ──────
// Nothing in a browser can show these; without them the phone never reaches
// the laptop (iOS refuses local-network sockets and cleartext outside the
// LAN exemption), or App Review refuses the app for an unexplained prompt.
{
  const plist = readFileSync('ios/App/App/Info.plist', 'utf8');
  const has = (key, value = null) => new RegExp(`<key>${key}</key>\\s*${value ?? '<string>[^<]{20,}</string>'}`).test(plist);
  check('the app asks for the local network, and says why', has('NSLocalNetworkUsageDescription'));
  check('and may use plain ws:// on the LAN', /<key>NSAppTransportSecurity<\/key>\s*<dict>\s*<key>NSAllowsLocalNetworking<\/key>\s*<true\/>/.test(plist));
  check('the microphone and camera prompts say why', has('NSMicrophoneUsageDescription') && has('NSCameraUsageDescription'));
  const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
  const targets = [...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map((m) => m[1]);
  check('the app needs iOS 26, the first with WebGPU in the web view', targets.length > 0 && targets.every((t) => Number(t) >= 26), targets.join(', '));
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
stopAll();
process.exit(failed.length ? 1 : 0);
