#!/usr/bin/env node
/**
 * Who can drive the show: the show server's key, its doors and its limits
 * (PLAN.md 14m).
 *
 *   npm run showkey   (builds, then about a minute; no GPU needed)
 *
 * `npm run show` on a venue's Wi-Fi puts the laptop's show server on a
 * network full of strangers' phones, and `npm run tunnel` puts it on the
 * internet. Before 14m the key was four digits (9,000 guesses, no count of
 * wrong ones), `/remote-info.json` handed it to any request that had not come
 * through a proxy (every phone in the room), the key that let a phone in also
 * let it take the display's role and push the wall, frames were read up to
 * `ws`'s 100 MiB default, a socket that said nothing was kept for ever, and a
 * restart picked a new key and told every phone `denied`.
 *
 * Each of those is asked of the real server (`server/remote-server.js`, the
 * one `npm run show` starts), over real sockets, from the outside, the way a
 * phone or a stranger reaches it. Nothing here reads the server's source:
 *
 * - The key goes to the laptop only. A request from this machine's LAN
 *   address is what any other device on the Wi-Fi looks like to the server
 *   (a non-loopback `remoteAddress`), and gets none; nor does a loopback
 *   request that came through the tunnel (`cf-connecting-ip`), nor one whose
 *   Host is somebody else's name (a page that rebound its DNS to 127.0.0.1).
 * - The phone's key is eight digits or more, saved where only the owner's
 *   account can read it, and the display has a key of its own that the
 *   phone's key does not stand in for.
 * - A page from another site is turned away at the door (its Origin), and a
 *   page served by the show itself, the iPhone app and the laptop are not.
 * - Three wrong keys from one address lock that address out, the right key
 *   included, and only that address. The laptop is never locked out.
 * - One address may hold sixteen sockets, and the server two hundred.
 * - A 1 MB frame closes its socket (1009, too big) without the server's
 *   memory growing by it, and a socket that has not said hello in 5 s is
 *   closed.
 * - A restart keeps the phone's key, and a real phone page and the real
 *   laptop page find each other again on their own: a look changed on the
 *   laptop after the restart reaches the phone.
 *
 * The lockout and the caps are asked as if through the tunnel: a loopback
 * socket carrying `cf-connecting-ip`, which is what cloudflared delivers, so
 * each check has its own made-up address and no check's lockout spills into
 * the next.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { launchChromium, port } from './chromium.mjs';

const PORT = port(4197, 'SHOWKEY_PORT');
const DIR = mkdtempSync(join(tmpdir(), 'showkey-'));
const KEY_FILE = join(DIR, 'show-key');
const LAN = Object.values(networkInterfaces()).flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address)[0];

let failed = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  // No SHOW_KEY: the server makes its own, the way `npm run show` does, and
  // keeps it in a file this run owns rather than the one beside the server.
  const env = { ...process.env, PORT: String(PORT), OSC_PORT: '0', SHOW_KEY_FILE: KEY_FILE };
  delete env.SHOW_KEY;
  delete env.ARTNET_HOST;
  const proc = spawn(process.execPath, ['server/remote-server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  return new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('the show server did not start')), 30_000);
    let said = '';
    proc.said = () => said;
    proc.stdout.on('data', (d) => { said += String(d); if (said.includes('Show key')) { clearTimeout(bail); resolve(proc); } });
    proc.stderr.on('data', (d) => { said += String(d); });
    proc.on('exit', (c) => { clearTimeout(bail); reject(new Error(`the show server exited ${c}: ${said.slice(0, 300)}`)); });
  });
}
const stop = (proc) => new Promise((resolve) => {
  if (proc.exitCode !== null) { resolve(); return; }
  proc.once('exit', () => resolve());
  try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); }
});

/** `/remote-info.json`, from `host`, with whatever headers a phone, the tunnel or a rebinding page would send. */
const info = (host, headers = {}) => new Promise((resolve, reject) => {
  const req = request({ host, port: PORT, path: '/remote-info.json', headers }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
  });
  req.on('error', reject);
  req.end();
});

/**
 * A socket, opened the way a client would: `{ ws }` once open, `{ refused:
 * status }` when the server answered the upgrade with an HTTP error.
 */
const open = (host, { headers = {}, origin } = {}) => new Promise((resolve) => {
  const ws = new WebSocket(`ws://${host}:${PORT}/remote-ws`, { headers, ...(origin ? { origin } : {}) });
  ws.once('open', () => resolve({ ws }));
  ws.once('unexpected-response', (_req, res) => { resolve({ refused: res.statusCode }); ws.terminate(); });
  ws.once('error', (e) => resolve({ refused: e.message }));
});

/**
 * Say hello and see what the server makes of it within `ms`: `denied` (with
 * its reason), `closed`, or `in` (still open, nothing refused). A display
 * that is let in is sent the phone count, which is kept as `first`.
 */
const hello = (ws, role, key, ms = 800) => new Promise((resolve) => {
  let first = null;
  const done = (r) => { clearTimeout(t); ws.removeAllListeners('message'); resolve({ ...r, first }); };
  const t = setTimeout(() => done({ verdict: ws.readyState === WebSocket.OPEN ? 'in' : 'closed' }), ms);
  ws.on('message', (d) => {
    let m; try { m = JSON.parse(String(d)); } catch { return; }
    if (m.type === 'denied') done({ verdict: 'denied', reason: m.reason, retryMs: m.retryMs });
    else first ??= m;
  });
  ws.once('close', () => done({ verdict: 'closed' }));
  ws.send(JSON.stringify({ type: 'hello', role, key }));
});

/**
 * `n` sockets from `ip` that join as phones, the way a room of them does: four
 * at a time, each saying hello with the key as soon as it opens (the server
 * holds an address to four that have not said hello yet).
 */
const joinMany = async (ip, n, key) => {
  const out = [];
  for (let i = 0; i < n; i += 4) {
    const batch = await Promise.all(Array.from({ length: Math.min(4, n - i) }, () => open('127.0.0.1', { headers: { 'cf-connecting-ip': ip } })));
    for (const s of batch) s.ws?.send(JSON.stringify({ type: 'hello', role: 'controller', key }));
    out.push(...batch);
    await wait(60);
  }
  return out;
};

/** Open a socket as if through the tunnel from `ip`, and say hello. */
const tunnelHello = async (ip, role, key) => {
  const s = await open('127.0.0.1', { headers: { 'cf-connecting-ip': ip } });
  if (!s.ws) return { verdict: `refused ${s.refused}` };
  const r = await hello(s.ws, role, key);
  s.ws.terminate();
  return r;
};

let server = await startServer();
// The phone is opened at this machine's Wi-Fi address, which a session behind
// an outbound proxy would hand to the proxy (it answers 502): the show is on
// this machine, so the browser goes to it directly.
const browser = await launchChromium(chromium, { headless: true, args: ['--no-proxy-server'] });
const errors = [];
try {
  // ── Who is given the key ─────────────────────────────────────────
  const laptop = await info('127.0.0.1');
  const KEY = laptop.key;
  const DISPLAY = laptop.displayKey;
  check('the laptop is given the phone\'s key, eight digits or more', /^\d{8,}$/.test(String(KEY)), `key ${KEY}`);
  check('and a display key of its own, long and not the phone\'s', typeof DISPLAY === 'string' && DISPLAY.length >= 32 && DISPLAY !== KEY,
    `displayKey ${DISPLAY === undefined ? 'absent' : String(DISPLAY).slice(0, 8) + '…'}`);
  if (!LAN) {
    check('a device on the Wi-Fi is given no key', false, 'this machine has no LAN address to ask from, so the case cannot be asked');
  } else {
    const wifi = await info(LAN);
    check('a device on the Wi-Fi is given no key', wifi.key == null && wifi.displayKey == null, `from ${LAN}: key ${wifi.key}, displayKey ${wifi.displayKey}`);
  }
  const tunnel = await info('127.0.0.1', { 'cf-connecting-ip': '203.0.113.1' });
  check('nor a request through the tunnel', tunnel.key == null && tunnel.displayKey == null, `key ${tunnel.key}`);
  const rebound = await info('127.0.0.1', { host: `evil.example:${PORT}` });
  check('nor a page whose name rebinds to this machine', rebound.key == null && rebound.displayKey == null, `key ${rebound.key}`);

  // ── The key, kept ────────────────────────────────────────────────
  const saved = existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8').trim() : null;
  const mode = existsSync(KEY_FILE) ? statSync(KEY_FILE).mode & 0o777 : null;
  check('the phone\'s key is saved, readable by the owner\'s account alone', saved === String(KEY) && mode !== null && (mode & 0o077) === 0,
    `file ${saved === null ? 'absent' : saved === String(KEY) ? 'holds the key' : 'holds something else'}, mode ${mode?.toString(8)}`);

  // ── Roles ────────────────────────────────────────────────────────
  {
    const asDisplay = await tunnelHello('203.0.113.2', 'display', KEY);
    check('the phone\'s key does not take the display\'s role', asDisplay.verdict === 'denied', asDisplay.verdict);
    const phone = await tunnelHello('203.0.113.3', 'controller', KEY);
    check('it does let a phone in', phone.verdict === 'in', phone.verdict);
    const s = await open('127.0.0.1');
    const display = s.ws ? await hello(s.ws, 'display', DISPLAY) : { verdict: `refused ${s.refused}` };
    s.ws?.terminate();
    check('the display key lets the display in', display.verdict === 'in' && display.first?.type === 'controllers', `${display.verdict}, first ${JSON.stringify(display.first)}`);
  }

  // ── The door ─────────────────────────────────────────────────────
  {
    const foreign = await open('127.0.0.1', { origin: 'http://evil.example' });
    check('a page from another site is turned away at the door', foreign.refused === 403, foreign.ws ? 'opened' : `answered ${foreign.refused}`);
    foreign.ws?.terminate();
    const allowed = [
      ['the laptop\'s page', '127.0.0.1', `http://localhost:${PORT}`],
      ['the iPhone app', '127.0.0.1', 'capacitor://localhost'],
      ...(LAN ? [['a page the show served to a phone', LAN, `http://${LAN}:${PORT}`]] : []),
    ];
    for (const [who, host, origin] of allowed) {
      const s = await open(host, { origin });
      check(`${who} is let through it`, Boolean(s.ws), s.ws ? origin : `answered ${s.refused}`);
      s.ws?.terminate();
    }
    // A phone through the tunnel: cloudflared hands the server the tunnel's
    // own name as Host and the page's Origin is that same name, which is the
    // same-host rule, not the local one. (Whether cloudflared really passes
    // Host through unchanged is for the Mac: PLAN 14m-tunnel.)
    const tunnelled = await open('127.0.0.1', {
      headers: { 'cf-connecting-ip': '203.0.113.30', host: 'show-example.trycloudflare.com' },
      origin: 'https://show-example.trycloudflare.com',
    });
    check('a phone through the tunnel is let through it', Boolean(tunnelled.ws), tunnelled.ws ? 'opened' : `answered ${tunnelled.refused}`);
    tunnelled.ws?.terminate();
  }

  // ── Wrong keys ───────────────────────────────────────────────────
  {
    const ip = '203.0.113.10';
    const tries = [];
    for (let i = 0; i < 3; i++) tries.push((await tunnelHello(ip, 'controller', '00000000')).reason ?? 'none');
    const right = await tunnelHello(ip, 'controller', KEY);
    check('three wrong keys lock the address out, the right key included', tries.join(' ') === 'key key key' && right.verdict === 'denied' && right.reason === 'locked',
      `wrong: ${tries.join(' ')}; then the right key: ${right.verdict}${right.reason ? ` (${right.reason})` : ''}`);
    check('and the phone is told for how long, a few minutes', right.retryMs >= 60_000 && right.retryMs <= 600_000, `retryMs ${right.retryMs}`);
    const other = await tunnelHello('203.0.113.11', 'controller', KEY);
    check('another address is not locked by it', other.verdict === 'in', other.verdict);
    // The laptop's page opened at its Wi-Fi address is a display with no key
    // (the relay gives the display key to localhost alone). It is refused, but
    // it is not a guess, or an old page left open would lock out the room's
    // address, the phones behind the same router with it.
    const keyless = [];
    for (let i = 0; i < 4; i++) keyless.push((await tunnelHello('203.0.113.12', 'display', undefined)).reason ?? 'none');
    const after = await tunnelHello('203.0.113.12', 'controller', KEY);
    check('a display with no key is refused but not counted as a guess', keyless.join(' ') === 'key key key key' && after.verdict === 'in',
      `keyless: ${keyless.join(' ')}; then a phone from the same address: ${after.verdict}${after.reason ? ` (${after.reason})` : ''}`);
    // And a good key does not wipe an address's wrong ones: two wrong, one
    // right (the guest beside a stranger), then one more wrong locks it.
    const shared = '203.0.113.13';
    const two = [await tunnelHello(shared, 'controller', '00000001'), await tunnelHello(shared, 'controller', '00000002')];
    const guest = await tunnelHello(shared, 'controller', KEY);
    const third = await tunnelHello(shared, 'controller', '00000003');
    const next = await tunnelHello(shared, 'controller', KEY);
    check('a phone joining from an address does not hand it three fresh guesses',
      two.every((r) => r.reason === 'key') && guest.verdict === 'in' && third.reason === 'key' && next.reason === 'locked',
      `wrong, wrong: ${two.map((r) => r.reason).join(' ')}; the guest ${guest.verdict}; a third wrong ${third.reason}; then ${next.verdict}${next.reason ? ` (${next.reason})` : ''}`);
    const laptopTries = [];
    for (let i = 0; i < 4; i++) {
      const s = await open('127.0.0.1');
      laptopTries.push((await hello(s.ws, 'display', 'wrong')).reason ?? 'none');
      s.ws.terminate();
    }
    const s = await open('127.0.0.1');
    const back = await hello(s.ws, 'display', DISPLAY);
    s.ws.terminate();
    check('the laptop itself is never locked out', back.verdict === 'in', `wrong: ${laptopTries.join(' ')}; then its own key: ${back.verdict}${back.reason ? ` (${back.reason})` : ''}`);
  }

  // ── How many ─────────────────────────────────────────────────────
  {
    const one = await joinMany('198.51.100.9', 20, KEY);
    const opened = one.filter((s) => s.ws).length;
    check('one address holds sixteen sockets and no more', opened === 16 && one.filter((s) => s.refused === 429).length === 4,
      `${opened} of 20 opened; refusals ${[...new Set(one.filter((s) => !s.ws).map((s) => s.refused))].join(', ')}`);
    one.forEach((s) => s.ws?.terminate());
    await wait(300);
    const many = (await Promise.all(Array.from({ length: 20 }, (_, a) => joinMany(`198.51.101.${a}`, 11, KEY)))).flat();
    const all = many.filter((s) => s.ws).length;
    check('and the server two hundred', all === 200, `${all} of 220 opened from 20 addresses`);
    many.forEach((s) => s.ws?.terminate());
    await wait(300);
    // Sockets that never say hello hold their address's slots for five
    // seconds each; four at once is all an address gets of those, so a few
    // dozen addresses opening nothing else cannot fill the server's two
    // hundred, and the address's own phone still joins beside them.
    const silent = await Promise.all(Array.from({ length: 6 }, () => open('127.0.0.1', { headers: { 'cf-connecting-ip': '198.51.102.1' } })));
    const held = silent.filter((s) => s.ws).length;
    check('an address holds four sockets that have not said hello, and no more', held === 4 && silent.filter((s) => s.refused === 429).length === 2,
      `${held} of 6 opened; refusals ${[...new Set(silent.filter((s) => !s.ws).map((s) => s.refused))].join(', ')}`);
    silent.forEach((s) => s.ws?.terminate());
    await wait(300);
  }

  // ── Big frames, silent sockets ───────────────────────────────────
  {
    const s = await open('127.0.0.1', { headers: { 'cf-connecting-ip': '203.0.113.20' } });
    const code = await new Promise((resolve) => {
      const t = setTimeout(() => resolve('still open after 3 s'), 3000);
      s.ws.once('close', (c) => { clearTimeout(t); resolve(c); });
      s.ws.on('error', () => {});
      s.ws.send('x'.repeat(1024 * 1024));
    });
    check('a 1 MB frame closes its socket as too big', code === 1009, `close ${code}`);
    // Thirty at once, from thirty addresses so the per-address cap is not
    // what stops them: every one must be closed as too big. This replaced a
    // reading of the server's resident memory before and after, which passed
    // on the old server too (it grew 13 MB reading every frame whole and
    // throwing it away) and then read 30 MB on the fixed one, which stops
    // each frame at half a megabyte: resident memory is what the allocator
    // has not handed back yet, not what the frames cost. What bounds the
    // memory is that each socket is cut off at `maxPayload` and that there
    // are at most two hundred of them, and those are what is checked.
    const socks = await Promise.all(Array.from({ length: 30 }, (_, i) => open('127.0.0.1', { headers: { 'cf-connecting-ip': `203.0.114.${i}` } })));
    const codes = await Promise.all(socks.map((k) => new Promise((resolve) => {
      if (!k.ws) { resolve(`refused ${k.refused}`); return; }
      const t = setTimeout(() => resolve('open'), 3000);
      k.ws.once('close', (c) => { clearTimeout(t); resolve(c); });
      k.ws.on('error', () => {});
      k.ws.send(JSON.stringify({ type: 'patch', settings: { pad: 'x'.repeat(1024 * 1024) } }));
    })));
    socks.forEach((k) => k.ws?.terminate());
    const cut = codes.filter((c) => c === 1009).length;
    check('and thirty at once are every one closed as too big', cut === 30,
      `${cut} of 30 closed 1009${cut < 30 ? `; the rest: ${[...new Set(codes.filter((c) => c !== 1009))].join(', ')}` : ''}`);

    const quiet = await open('127.0.0.1', { headers: { 'cf-connecting-ip': '203.0.113.21' } });
    const t0 = Date.now();
    const gone = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 9000);
      quiet.ws.once('close', () => { clearTimeout(t); resolve(Date.now() - t0); });
      quiet.ws.on('error', () => {});
    });
    check('a socket that never says hello is closed at 5 s', gone !== null && gone >= 4500 && gone <= 6500, gone === null ? 'still open at 9 s' : `closed at ${(gone / 1000).toFixed(1)} s`);
  }

  // ── A restart, with a real phone and the real laptop page ───────
  {
    const display = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    display.on('pageerror', (e) => errors.push(`display: ${e.message}`));
    // The laptop's page with no key in its address: it is given one by the
    // relay, which is how `npm run show`'s printed laptop address works.
    await display.goto(`http://localhost:${PORT}/?debug&look=classic&dpr=0.35`, { waitUntil: 'networkidle' });
    const shown = () => display.evaluate(() => window.chromaglassSettings?.());
    for (let i = 0; i < 40 && !(await shown()); i++) await display.waitForTimeout(250);

    const remote = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    remote.on('pageerror', (e) => errors.push(`remote: ${e.message}`));
    await remote.goto(`http://${LAN ?? 'localhost'}:${PORT}/?remote=1&key=${KEY}`, { waitUntil: 'networkidle' });
    await remote.getByTestId('draw-controls').tap();
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { up = (await remote.getByTestId('remote-mixer').count()) > 0; if (!up) await remote.waitForTimeout(250); }
    check('a phone on the Wi-Fi joins with the key the laptop shows', up);
    if (up) {
      await remote.getByTestId('remote-mixer').locator('summary').evaluate((el) => el.click());
      const readRows = () => remote.$$eval('[data-testid="remote-mixer-panel"] [data-row]', (els) => els.map((e) => e.getAttribute('data-row')).join(' '));
      // A look changed on the laptop must come out on the phone: that needs
      // the display in, the phone in, and the state relayed between them.
      const reaches = async (order) => {
        await display.evaluate((o) => window.chromaglassSettings({ mixOrder: o }), order);
        const want = order.split(' ').reverse().join(' ');
        for (let i = 0; i < 100; i++) { if ((await readRows()) === want) return true; await remote.waitForTimeout(250); }
        return false;
      };
      check('and a change on the laptop reaches it', await reaches('gel led front lumia film back mark'));
      await stop(server);
      // Down for a few seconds, as a Mac app relaunching its server is: long
      // enough for the laptop's page to find no relay behind its origin at all.
      // Restarted at once, the laptop's first retry (half a second) found the new
      // server and this line passed whether or not the page ever looked again.
      await wait(4000);
      server = await startServer();
      const again = await info('127.0.0.1');
      check('a restart keeps the phone\'s key', again.key === KEY, `${KEY} → ${again.key}`);
      const t0 = Date.now();
      // The look's default order: the mixer keeps some layers in their place
      // (an order with `front` moved down came back with it moved up again),
      // so the order asked for has to be one the mixer keeps as asked.
      const rejoined = await reaches('led gel lumia front back film mark');
      check('and the phone and the laptop find each other again on their own', rejoined,
        rejoined ? `in ${((Date.now() - t0) / 1000).toFixed(1)} s`
          : `the change on the laptop never reached the phone in 25 s (its rows read "${await readRows()}"); the server heard: ${server.said().split('\n').filter((l) => /connected|refused/.test(l)).map((l) => l.trim()).join(', ') || 'no one'}`);
    }
  }

  // ── Everyone's wrong keys ───────────────────────────────────────
  // Last, since it shuts the door on every new phone for a minute. Twelve
  // addresses, three wrong keys each: each address is locked on its own, but
  // a script with a /48 has tens of thousands of them, so past thirty wrong
  // keys in a minute the server takes no key from anyone new. The laptop is
  // the show and is never shut out.
  {
    const wrongs = [];
    for (let a = 0; a < 12; a++) for (let i = 0; i < 3; i++) wrongs.push((await tunnelHello(`192.0.2.${a + 1}`, 'controller', '00000000')).reason ?? 'none');
    const fresh = await tunnelHello('192.0.2.200', 'controller', KEY);
    check('past thirty wrong keys a minute from everyone, a new address with the right key is held off too',
      wrongs.every((r) => r === 'key' || r === 'locked') && fresh.verdict === 'denied' && fresh.reason === 'locked' && fresh.retryMs > 0 && fresh.retryMs <= 60_000,
      `${wrongs.filter((r) => r === 'key').length} wrong keys taken; then a new address: ${fresh.verdict}${fresh.reason ? ` (${fresh.reason}, retry ${Math.round((fresh.retryMs ?? 0) / 1000)} s)` : ''}`);
    const s = await open('127.0.0.1');
    const own = await hello(s.ws, 'display', (await info('127.0.0.1')).displayKey);
    s.ws.terminate();
    check('and the laptop is not', own.verdict === 'in', `${own.verdict}${own.reason ? ` (${own.reason})` : ''}`);
  }
} catch (e) {
  check('the run finished', false, e.message);
} finally {
  check('no page threw', errors.length === 0, errors.slice(0, 3).join('; '));
  await browser.close();
  await stop(server);
  rmSync(DIR, { recursive: true, force: true });
}

console.log(`\n${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
