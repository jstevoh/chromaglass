#!/usr/bin/env node
/**
 * Does OSC out reach a VJ app, as the numbers the plate has, on the beat?
 *
 *   npm run oscout              # builds, then about half a minute
 *   npm run oscout -- --node    # the codec and the show server's wires, no build, no browser
 *
 * PLAN.md 13.5-osc: "OSC out for the plate's colour, the sound bands and the
 * beat, the way Art-Net out already sends the colour to the lighting, so a VJ
 * app's effects can follow the plate." A VJ app handed a malformed packet
 * drops it without a word, and one handed the wrong number follows the wrong
 * thing in a dark room, so what is asked here ends at the bytes a VJ app's
 * socket reads, decoded by a reader written in this file from the OSC 1.0
 * layout rather than borrowed from `server/osc.js`, so the two cannot agree on
 * a mistake.
 *
 *   1. The bytes: a message and a bundle written out by hand, compared with
 *      the server's writer; and the server's own reader reads the writer back.
 *   2. The feed: two layers of known colours and fills give the fill-weighted
 *      mean, its hue and brightness, each layer, the master, the six sound
 *      readings, the bands and the tempo, every number clamped to its range;
 *      and no address the feed sends is one OSC in acts on (an app that echoes
 *      its input back to the show cannot drive the show with its own feed).
 *   3. The target: the server's rule and the page's (`src/lib/oscOut.ts`, a
 *      copy, since neither side imports the other) give the same answer to
 *      every address, good and bad.
 *   4. The server, started as a Pro buyer's Mac starts it, with a WebSocket
 *      where the page would be and a UDP socket where Resolume would be: off
 *      until switched on; on, a report arrives as one datagram with the right
 *      numbers; a beat arrives at once as 1 and is released to 0; a phone can
 *      neither move the target nor send a beat; off is silent.
 *   5. The gate: OSC out is Pro, like OSC in. An enforced launch with no key
 *      says so and sends nothing.
 *   6. The app (not with --node): the page on that server offers the switch
 *      in Settings at the tempo, refuses a target that is not address:port,
 *      sends its own reports once on, and switches it back on by itself after
 *      a reload. Its beat is asked where a plate runs (the Mac, or
 *      OSCOUT_PLATE=1): without a GPU the plate never presses on a kick.
 *
 * What this cannot stand in for is Resolume's own reading of these bytes: the
 * owner's sitting with Resolume (docs/judging.md §105).
 */

import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';
import { encodeBundle, encodeOsc, feedMessages, oscOutTarget, oscToMessage, readOsc, SOUND_OUT } from '../server/osc.js';
import { signLicenseKey } from '../server/license-key.js';

const NODE_ONLY = process.argv.includes('--node');
const PORT = Number(process.env.OSCOUT_PORT ?? 5331);

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol = 1e-4) => typeof a === 'number' && Math.abs(a - b) <= tol;

// ── A VJ app's reader, from the OSC 1.0 layout ───────────────────────
// Strings NUL-terminated and padded to four bytes, big-endian numbers, a type
// tag string after a comma; a bundle is "#bundle\0", an 8-byte time tag, then
// each element after its 4-byte size. Only what a receiver needs: f, i, s.
function decode(buf) {
  let off = 0;
  const str = () => { const end = buf.indexOf(0, off); const s = buf.toString('utf8', off, end); off = end + 1; off += (4 - (off % 4)) % 4; return s; };
  if (buf.subarray(0, 8).toString('latin1') === '#bundle\0') {
    const tag = buf.readBigUInt64BE(8);
    const out = [];
    for (off = 16; off < buf.length;) { const n = buf.readInt32BE(off); out.push(...decode(buf.subarray(off + 4, off + 4 + n)).messages); off += 4 + n; }
    return { bundle: true, tag, messages: out };
  }
  const address = str();
  const tags = str();
  const args = [];
  for (const t of tags.slice(1)) {
    if (t === 'f') { args.push(buf.readFloatBE(off)); off += 4; }
    else if (t === 'i') { args.push(buf.readInt32BE(off)); off += 4; }
    else if (t === 's') args.push(str());
    else throw new Error(`tag ${t}`);
  }
  return { bundle: false, messages: [{ address, args }] };
}

// ── 1. The bytes ─────────────────────────────────────────────────────
{
  // "/chromaglass/out/bpm" is 20 bytes, so its NUL takes a whole word: 24.
  // ",f" pads to 4. 120.0 as an IEEE single is 0x42F00000.
  const hand = Buffer.concat([Buffer.from('/chromaglass/out/bpm\0\0\0\0', 'latin1'), Buffer.from(',f\0\0', 'latin1'), Buffer.from([0x42, 0xf0, 0, 0])]);
  const ours = encodeOsc('/chromaglass/out/bpm', [120]);
  check('a message is the bytes the OSC 1.0 layout gives, written out by hand', ours.equals(hand), ours.toString('hex'));
  const b = encodeBundle([['/chromaglass/out/bpm', [120]], ['/x', [0.5]]]);
  const handHead = Buffer.concat([Buffer.from('#bundle\0', 'latin1'), Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]), Buffer.from([0, 0, 0, 32]), hand]);
  check('a bundle is "#bundle", the time tag "immediately", then each message after its size',
    b.subarray(0, handHead.length).equals(handHead) && b.length === handHead.length + 4 + 12, `${b.length} bytes`);
  const back = readOsc(b);
  check('the show\'s own OSC reader reads the writer back', back.length === 2 && back[0].address === '/chromaglass/out/bpm' && back[0].args[0] === 120 && back[1].args[0] === 0.5);
  const odd = decode(encodeOsc('/chromaglass/out/beat', [1, { i: 7 }, 'hi', NaN]));
  check('ints, strings and a NaN (sent as 0, never as NaN) decode as written',
    odd.messages[0].args.join() === '1,7,hi,0', odd.messages[0].args.join());
}

// ── 2. The feed ──────────────────────────────────────────────────────
const report = {
  layers: [{ colour: '#ff0000', fill: 0.6 }, { colour: '#0000ff', fill: 0.2 }],
  master: 0.7,
  sound: { level: 0.5, kick: 1.4, bass: -0.2, snare: 0.25, hats: NaN, note: 0.75 },
  bands: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
  bpm: 128,
};
{
  const m = new Map(feedMessages(report).map(([a, args]) => [a, args]));
  const v = (a) => m.get(`/chromaglass/out/${a}`)?.[0];
  // Red at 0.6 and blue at 0.2: three parts red to one blue.
  check('the plate\'s colour is each layer\'s weighted by how full it is',
    near(v('colour/red'), 0.75) && near(v('colour/green'), 0) && near(v('colour/blue'), 0.25),
    `${v('colour/red')} ${v('colour/green')} ${v('colour/blue')}`);
  // Hue of (0.75, 0, 0.25): magenta-red, 1 - (0.25/0.75)/6 = 0.9444.
  check('its hue and brightness are that colour\'s', near(v('colour/hue'), 1 - 1 / 18) && near(v('colour/brightness'), 0.75),
    `hue ${v('colour/hue')?.toFixed(4)}, brightness ${v('colour/brightness')}`);
  check('each layer goes as itself, numbered from 1',
    v('layer/1/red') === 1 && v('layer/1/fill') === 0.6 && v('layer/2/blue') === 1 && near(v('layer/2/fill'), 0.2) && !m.has('/chromaglass/out/layer/3/red'));
  check('the master, the six sound readings and the eight bands, each clamped to 0..1 (a NaN is 0)',
    v('master') === 0.7 && SOUND_OUT.every((k) => m.has(`/chromaglass/out/sound/${k}`)) &&
      v('sound/kick') === 1 && v('sound/bass') === 0 && v('sound/hats') === 0 && v('sound/note') === 0.75 &&
      [1, 2, 3, 4, 5, 6, 7, 8].every((n) => near(v(`band/${n}`), n / 10)),
    SOUND_OUT.map((k) => `${k} ${v(`sound/${k}`)}`).join(', '));
  check('the tempo goes in bpm', v('bpm') === 128);
  const empty = new Map(feedMessages({ layers: [{ colour: '#ffffff', fill: 0 }], master: 0 }).map(([a, args]) => [a, args]));
  // A layer's colour is whatever it last held, and an empty glass has none.
  check('an empty plate sends black, not the colour it last held and not a divide by zero, and no sound while nothing is heard',
    empty.get('/chromaglass/out/colour/red')?.[0] === 0 && empty.get('/chromaglass/out/colour/brightness')?.[0] === 0 && !empty.has('/chromaglass/out/sound/level'));
  const all = [...m.keys(), '/chromaglass/out/beat'];
  check('no address OSC out sends is one OSC in acts on', all.every((a) => oscToMessage({ address: a, args: [1] }) === null), `${all.length} addresses`);
}

// ── 3. The target ────────────────────────────────────────────────────
{
  const { oscOutTarget: pageTarget, OSC_OUT_DEFAULT } = await import('../src/lib/oscOut.ts');
  const cases = ['127.0.0.1:7000', ' 192.168.1.255 : 9001 ', 'localhost:7000', '10.0.0.5:65535', '10.0.0.5:0', '10.0.0.5:65536',
    '256.1.1.1:7000', 'resolume.local:7000', '127.0.0.1', ':7000', '127.0.0.1:x', '', '1.2.3:7000'];
  const server = cases.map((c) => { const t = oscOutTarget(c); return t ? `${t.host}:${t.port}` : null; });
  const page = cases.map((c) => pageTarget(c));
  check('the page and the server give every target the same answer', server.join() === page.join(),
    cases.map((c, i) => `${JSON.stringify(c)}→${server[i] ?? 'refused'}`).join(', '));
  check('four good, nine refused, and the default is a good one',
    server.filter(Boolean).length === 4 && pageTarget(OSC_OUT_DEFAULT) === OSC_OUT_DEFAULT);
}

// ── 4. The server, with sockets where the page and Resolume would be ─
const vj = createSocket('udp4');
const got = [];
vj.on('message', (buf) => { try { got.push({ at: performance.now(), size: buf.length, ...decode(buf) }); } catch (e) { got.push({ at: performance.now(), bad: String(e) }); } });
await new Promise((r) => vj.bind(0, '127.0.0.1', r));
const VJ = `127.0.0.1:${vj.address().port}`;
const other = createSocket('udp4');
let otherGot = 0;
other.on('message', () => { otherGot += 1; });
await new Promise((r) => other.bind(0, '127.0.0.1', r));

const temp = mkdtempSync(join(tmpdir(), 'cg-oscout-'));
let dist = resolve(process.env.OSCOUT_DIST ?? 'dist');
if (NODE_ONLY) {
  dist = join(temp, 'dist');
  mkdirSync(dist);
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>oscout</title>');
} else if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No build at ${dist}: "npm run oscout" builds first, or pass --node for the server's wires alone.`);
  process.exit(1);
}
const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const publicJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey));
const proKey = await signLicenseKey({ tier: 'pro', email: 'oscout@example.com', id: 'lic-oscout-check' }, await crypto.subtle.exportKey('jwk', pair.privateKey));
const servers = [];
const serverLog = [];
function startServer(port, env) {
  const p = spawn(process.execPath, ['server/remote-server.js'], {
    env: { ...process.env, PORT: String(port), REMOTE_DIST: dist, OSC_PORT: '0', SHOW_KEY_FILE: join(temp, `show-key-${port}`),
      CHROMAGLASS_LICENSE_FILE: join(temp, `license-${port}.json`), LICENSE_PUBLIC_KEY: publicJwk, OSC_OUT: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (d) => serverLog.push(String(d)));
  p.stderr.on('data', (d) => serverLog.push(String(d)));
  servers.push(p);
  return p;
}
let browser = null;
const finish = async (code) => {
  try { await browser?.close(); } catch { /* gone */ }
  for (const p of servers) try { p.kill('SIGTERM'); } catch { /* gone */ }
  try { vj.close(); other.close(); } catch { /* closed */ }
  rmSync(temp, { recursive: true, force: true });
  console.log('');
  const failed = checks.filter((c) => !c.ok);
  console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(code ?? (failed.length ? 1 : 0));
};
async function infoOf(port) {
  for (let end = Date.now() + 15_000; Date.now() < end;) {
    try { const r = await fetch(`http://127.0.0.1:${port}/remote-info.json`); if (r.ok) return await r.json(); } catch { /* not yet */ }
    await sleep(150);
  }
  console.error(`The show server on ${port} did not start:\n${serverLog.join('').slice(-1500)}`);
  return finish(1);
}
async function join_(port, role, key) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/remote-ws`);
  const inbox = [];
  ws.on('message', (d) => { try { inbox.push(JSON.parse(String(d))); } catch { /* not ours */ } });
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  ws.send(JSON.stringify({ type: 'hello', role, key }));
  ws.inbox = inbox;
  ws.say = (m) => ws.send(JSON.stringify(m));
  return ws;
}
const lastState = (ws) => [...ws.inbox].reverse().find((m) => m.type === 'osc-out') ?? null;
async function stateWhere(ws, test, ms = 3000) {
  for (let end = Date.now() + ms; Date.now() < end;) { const s = lastState(ws); if (s && test(s)) return s; await sleep(20); }
  return lastState(ws);
}
const valueIn = (packet, address) => packet?.messages?.find((m) => m.address === address)?.args[0];

let proServer = startServer(PORT, { CHROMAGLASS_LICENSE_KEY: proKey });
const info = await infoOf(PORT);
{
  const display = await join_(PORT, 'display', info.displayKey);
  const phone = await join_(PORT, 'controller', info.key);
  const first = await stateWhere(display, () => true);
  check('a display is told OSC out is there, and off, when it joins (off at launch, not switched off)', first && first.on === false && first.target === null && first.stopped === false, JSON.stringify(first));

  got.length = 0;
  display.say({ type: 'lights', ...report });
  await sleep(300);
  check('off, a report sends nothing', got.length === 0, `${got.length} packets`);

  display.say({ type: 'osc-out-enable', on: true, target: VJ });
  const on = await stateWhere(display, (s) => s.on && s.pro);
  check('switched on at a target, the server says where and that it is Pro', on?.on && on.target === VJ && on.pro && on.says === `udp ${VJ}`, JSON.stringify(on));

  got.length = 0;
  for (let i = 0; i < 10; i++) { display.say({ type: 'lights', ...report }); await sleep(50); }
  await sleep(150);
  const reports = got.filter((p) => p.bundle);
  const p = reports[0];
  check('each report arrives as one bundle, the time tag "immediately", under a datagram\'s 1472 bytes',
    reports.length === 10 && reports.every((r) => r.tag === 1n && r.size < 1472), `${reports.length} of 10, ${p?.size} bytes, ${p?.messages.length} messages`);
  check('and it carries the numbers the page reported',
    near(valueIn(p, '/chromaglass/out/colour/red'), 0.75) && near(valueIn(p, '/chromaglass/out/colour/blue'), 0.25) &&
      near(valueIn(p, '/chromaglass/out/sound/level'), 0.5) && near(valueIn(p, '/chromaglass/out/band/8'), 0.8) &&
      valueIn(p, '/chromaglass/out/bpm') === 128 && near(valueIn(p, '/chromaglass/out/master'), 0.7),
    ['colour/red', 'sound/level', 'band/8', 'bpm', 'master'].map((a) => `${a} ${valueIn(p, `/chromaglass/out/${a}`)?.toFixed?.(3)}`).join(', '));

  got.length = 0;
  const sent = performance.now();
  display.say({ type: 'beat' });
  await sleep(200);
  const beats = got.filter((g) => !g.bundle && g.messages[0].address === '/chromaglass/out/beat');
  const lag = beats[0] ? beats[0].at - sent : NaN;
  const held = beats[1] ? beats[1].at - beats[0].at : NaN;
  check('a beat arrives at once as 1, then 0 about 50 ms later (a button\'s press and release)',
    beats.length === 2 && beats[0].messages[0].args[0] === 1 && beats[1].messages[0].args[0] === 0 && lag < 25 && held >= 40 && held < 120,
    `${beats.map((b) => b.messages[0].args[0]).join(', ')}; ${lag.toFixed(1)} ms to arrive, held ${held.toFixed(0)} ms`);

  // A phone on the show key: neither its target nor its beat is taken.
  got.length = 0;
  const before = display.inbox.length;
  phone.say({ type: 'osc-out-enable', on: true, target: `127.0.0.1:${other.address().port}` });
  phone.say({ type: 'beat' });
  phone.say({ type: 'osc-out', on: false, target: null, pro: false, says: 'off' });
  await sleep(300);
  const still = await stateWhere(display, () => true, 100);
  check('a phone can neither move OSC out, nor send a beat, nor speak for the server',
    still?.on && still.target === VJ && otherGot === 0 && got.length === 0 && !display.inbox.slice(before).some((m) => m.type === 'osc-out' && !m.on),
    `target ${still?.target}, ${otherGot} at the phone's target, ${got.length} at ours`);

  display.say({ type: 'osc-out-enable', on: true, target: 'resolume.local:7000' });
  const refused = await stateWhere(display, (s) => !s.on);
  check('a target that is not address:port switches it off rather than sending anywhere', refused && !refused.on, JSON.stringify(refused));

  display.say({ type: 'osc-out-enable', on: true, target: VJ });
  await stateWhere(display, (s) => s.on);
  display.say({ type: 'osc-out-enable', on: false });
  const offState = await stateWhere(display, (s) => !s.on);
  got.length = 0;
  display.say({ type: 'lights', ...report });
  display.say({ type: 'beat' });
  await sleep(300);
  check('switched off, it is silent again, and says it was switched off', got.length === 0 && offState?.stopped === true, `${got.length} packets, stopped ${offState?.stopped}`);

  // A beat's 1 sent, then off inside its 50 ms: the 0 still reaches the app that got the 1.
  display.say({ type: 'osc-out-enable', on: true, target: VJ });
  await stateWhere(display, (s) => s.on);
  got.length = 0;
  display.say({ type: 'beat' });
  await sleep(10);
  display.say({ type: 'osc-out-enable', on: false });
  await sleep(200);
  const stuck = got.filter((g) => !g.bundle && g.messages[0].address === '/chromaglass/out/beat').map((g) => g.messages[0].args[0]);
  check('switched off mid-beat, the beat is released, not left pressed', stuck.join() === '1,0', stuck.join() || 'nothing');
  display.close(); phone.close();
}

// ── 5. The gate ──────────────────────────────────────────────────────
{
  const port = PORT + 1;
  startServer(port, { CHROMAGLASS_ENFORCE_TIERS: '1' });
  const gInfo = await infoOf(port);
  const display = await join_(port, 'display', gInfo.displayKey);
  await sleep(2300);   // past the tier's first renewal, so the tier read is "free" and not the unknown before it
  const tier = (await (await fetch(`http://127.0.0.1:${port}/license-info.json`)).json()).tier;
  display.say({ type: 'osc-out-enable', on: true, target: VJ });
  const s = await stateWhere(display, (x) => x.on);
  got.length = 0;
  for (let i = 0; i < 5; i++) { display.say({ type: 'lights', ...report }); display.say({ type: 'beat' }); await sleep(50); }
  await sleep(200);
  check('with no Pro licence (read as free) it says so, and sends nothing', tier === 'free' && s?.on && s.pro === false && got.length === 0, `tier ${tier}, pro ${s?.pro}, ${got.length} packets`);
  display.close();
}

if (NODE_ONLY) await finish();

// ── 6. The app ───────────────────────────────────────────────────────
const { chromium } = await import('playwright');
const { launchChromium } = await import('./chromium.mjs');
try {
  browser = await launchChromium(chromium);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  // The simulated music (as `npm run ears` uses), so a plate that runs has kicks to press on.
  await page.addInitScript(() => { try { sessionStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private window */ } });
  await page.goto(`http://127.0.0.1:${PORT}/?debug&look=classic&play=0`, { waitUntil: 'load' });
  // The way a hand gets there: the desk's Sound dot opens Settings at the input, where the tempo is.
  await page.waitForSelector('[data-testid="dot-sound"]', { timeout: 60_000 });
  await page.click('[data-testid="dot-sound"]');
  const button = page.locator('[data-testid="osc-out"]');
  const offered = await button.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true, () => false);
  check('the app offers OSC out in Settings once its show server says it is there', offered,
    offered ? await page.locator('[data-testid="osc-out-says"]').innerText() : 'no switch');
  if (!offered) await finish();

  const field = page.locator('[data-testid="osc-out-target"]');
  await field.fill('resolume.local:7000');
  await field.press('Enter');
  const says = await page.locator('[data-testid="osc-out-says"]').innerText();
  check('a target that is not address:port is refused where it was typed', /Not an address:port/.test(says) && (await field.getAttribute('aria-invalid')) === 'true', says);

  await field.fill(VJ);
  await field.press('Enter');
  got.length = 0;
  await button.click();
  const lit = await page.waitForFunction(() => document.querySelector('[data-testid="osc-out"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 }).then(() => true, () => false);
  /*
    The page reports twenty times a second only while its plate has layers,
    and `layerReport` has them once the visualizer has made its fluids; with
    no GPU it may never, so the report is asked for as "arrives" with its
    tempo when it does, and its absence said, not failed, off a GPU.
  */
  for (let end = Date.now() + 8000; Date.now() < end && !got.some((g) => g.bundle);) await sleep(100);
  const fromPage = got.find((g) => g.bundle);
  const PLATE = process.platform === 'darwin' || !!process.env.OSCOUT_PLATE;
  // Measured at the VJ app's socket, not at the label: a report from a
  // display of the check's own, if the page has no layers to report.
  const helper = await join_(PORT, 'display', info.displayKey);
  if (!fromPage) { got.length = 0; helper.say({ type: 'lights', ...report }); await sleep(300); }
  check('switched on in the page, the server sends to the target typed',
    lit && (await page.locator('[data-testid="osc-out-says"]').innerText()).includes(VJ) && got.some((g) => g.bundle));
  if (fromPage || PLATE) {
    const has = (a) => typeof valueIn(fromPage, `/chromaglass/out/${a}`) === 'number';
    const heard = has('sound/level') && [1, 2, 3, 4, 5, 6, 7, 8].every((n) => has(`band/${n}`));
    check('the page\'s own reports reach the VJ app: its colour, master and tempo, and the sound once it hears',
      !!fromPage && has('colour/red') && has('colour/hue') && has('layer/1/fill') && has('master') && has('bpm') && (heard || !PLATE),
      fromPage ? `${fromPage.messages.length} messages, bpm ${valueIn(fromPage, '/chromaglass/out/bpm')}, sound ${heard ? 'yes' : 'no'}` : 'nothing in 8 s');
  } else {
    console.log('skip  the page\'s own reports to the VJ app — this plate reports no layers without a GPU (the Mac, or OSCOUT_PLATE=1)');
  }
  helper.close();

  /*
    Remembered: the Mac app relaunching its server, and the page reloaded,
    switch it back on by themselves. The server is restarted first, so it
    starts with OSC out off and only the page's remembered setting can turn it
    on again (with it left running, the server's own "on" would make the page
    look as if it remembered). And the reload is inside two seconds of the
    page's start, where `performance.now()` is small again.
  */
  proServer.kill('SIGTERM');
  await new Promise((r) => proServer.once('exit', r));
  proServer = startServer(PORT, { CHROMAGLASS_LICENSE_KEY: proKey });
  await infoOf(PORT);
  got.length = 0;
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid="dot-sound"]', { timeout: 60_000 });
  await page.click('[data-testid="dot-sound"]');
  const back = await page.waitForFunction(() => document.querySelector('[data-testid="osc-out"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 15_000 }).then(() => true, () => false);
  const watcher = await join_(PORT, 'display', (await infoOf(PORT)).displayKey);
  const again = await stateWhere(watcher, (x) => x.on, 3000);
  if (!got.some((g) => g.bundle)) { watcher.say({ type: 'lights', ...report }); await sleep(300); }
  check('a relaunched server and a reloaded page: the page switches it back on, at the same target, by itself',
    back && again?.on && again.target === VJ && got.some((g) => g.bundle) && (await page.locator('[data-testid="osc-out-target"]').inputValue()) === VJ,
    `server ${again?.on ? `on at ${again.target}` : 'off'}, ${got.filter((g) => g.bundle).length} bundles`);

  if (PLATE) {
    got.length = 0;
    await page.evaluate(() => window.chromaglassAction?.('seed'));
    const kicks = () => page.evaluate(() => window.chromaglassDebug?.().kicks?.() ?? null);
    await sleep(5000);   // the simulated music under way and the clock locked
    const k0 = await kicks();
    got.length = 0;
    await sleep(15_000);
    const k1 = await kicks();
    const ones = got.filter((g) => !g.bundle && g.messages[0].address === '/chromaglass/out/beat' && g.messages[0].args[0] === 1).length;
    const plate = typeof k0 === 'number' && typeof k1 === 'number' ? k1 - k0 : NaN;
    check('each beat the plate presses on reaches the VJ app, one for one', plate >= 10 && Math.abs(ones - plate) <= 1,
      `${ones} beats sent, ${plate} kicks on the plate in 15 s`);
  } else {
    console.log('skip  the plate\'s own beats to the VJ app — no plate presses on a kick without a GPU (the Mac, or OSCOUT_PLATE=1)');
  }

  // Switched off elsewhere (another page, the Mac app's menu): the page takes
  // that as the operator's word and does not switch it back on.
  watcher.say({ type: 'osc-out-enable', on: false });
  await sleep(3000);
  const held = await stateWhere(watcher, () => true, 100);
  const saved = await page.evaluate(() => localStorage.getItem('chromaglass.oscOut'));
  check('switched off elsewhere, the page leaves it off and remembers that', held && !held.on && /"on":false/.test(saved ?? ''),
    `server ${held?.on ? 'on' : 'off'}, saved ${saved}`);
  watcher.close();
} catch (e) {
  check('the app part finished', false, String(e?.stack ?? e).split('\n').slice(0, 3).join(' | '));
}
await finish();
