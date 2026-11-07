#!/usr/bin/env node
/**
 * Does the show talk to a rig: OSC in, Art-Net out and in, MIDI in and out?
 *
 *   npm run rig                 # builds, then about a minute
 *   npm run rig -- --node       # the show server's wires only, no build, no browser
 *
 * The page for pros (public/pro.html) sells OSC in, Art-Net out and in, MIDI
 * clock and controllers, and the controller's LEDs lit back. None of it had
 * been tried against the programs a buyer would plug in (Resolume,
 * TouchDesigner, a lighting desk, Ableton), and the owner has none of them.
 * `npm run lights` checks the Art-Net codec talking to itself; nothing checked
 * that the show server, started as a show starts it, puts a plate's colour on
 * the wire, or that an OSC packet shaped the way those programs shape it
 * reaches the page and moves the setting it names.
 *
 * So this stands in for the rig. It starts the real show server
 * (server/remote-server.js) with a Pro licence, as a Pro buyer's Mac app
 * would, and plays every part of the rig it talks to with a socket of its own:
 *
 *   - an OSC sender, with its own encoder written here from the OSC 1.0 spec
 *     rather than borrowed from the server's reader, so the two cannot agree
 *     on a mistake. It sends what Resolume and TouchDesigner send (float32
 *     arguments, a button's press and release, a bundle), and what Max and a
 *     norns script send (int32, strings);
 *   - an Art-Net node, listening where a fixture would, which reads the
 *     universe the server sends and compares channel by channel;
 *   - a lighting desk, sending ArtDmx into the universe the show listens on;
 *   - a MIDI controller and a DAW's clock, as Web MIDI ports stood in for
 *     before the page loads (as `npm run renders` does), with an output that
 *     records every LED message the app writes back.
 *
 * Two halves. The first is the server alone, with a WebSocket standing where
 * the page's display would: OSC in arrives as the message the page acts on,
 * the page's `lights` leaves as Art-Net, and a desk's faders arrive as a
 * patch. The second opens the built app on that server and asks whether the
 * *page* changes: an OSC setting, a desk fader, a MIDI fader, a DAW's clock
 * as the tempo, an OSC blackout as a black universe, and a setting changed
 * from OSC as an LED on the controller. Each is a different program's way in,
 * and each ends at the setting or the wire, not at a log line.
 *
 * The Pro licence is there because OSC and Art-Net are Pro features (the
 * table on /pro), and a gate on them must not turn this check into a check of
 * the gate. A minted key on a throwaway signing pair, as `npm run tiers` does.
 *
 * What this cannot stand in for is the other program's own reading of these
 * bytes: whether Resolume's OSC output panel, QLC+'s input profile or
 * Ableton's clock send really produce what this sends. That is the owner's
 * one sitting with the free versions of each (docs/judging.md §93).
 */

import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';
import { ARTNET_PORT, decodeArtDmx, encodeArtDmx } from '../server/artnet.js';
import { signLicenseKey } from '../server/license-key.js';

const NODE_ONLY = process.argv.includes('--node');
const PORT = Number(process.env.RIG_PORT ?? 5297);
// Not 9000, 6454 out or 6460: a real rig on this machine, or `npm run lights`,
// keeps its ports. Art-Net in has no choice: the server listens on 6454.
const OSC_PORT = PORT + 4020;
const ARTNET_OUT_PORT = PORT + 1180;
const OUT_UNIVERSE = 3;
const IN_UNIVERSE = 5;
const FIXTURES = 4;
const RATE = 30;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol = 1e-3) => typeof a === 'number' && Math.abs(a - b) <= tol;

// ── An OSC sender, from the OSC 1.0 spec ─────────────────────────────
//
// Strings are NUL-terminated and padded to four bytes; numbers are big-endian;
// the type tag string starts with a comma. A bundle is "#bundle", a time tag,
// then each element prefixed with its size.
const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
const oscString = (s) => pad4(Buffer.concat([Buffer.from(s, 'utf8'), Buffer.alloc(1)]));
function osc(address, ...args) {
  let tags = ',';
  const parts = [];
  for (const a of args) {
    if (a === true) tags += 'T';
    else if (a === false) tags += 'F';
    else if (typeof a === 'string') { tags += 's'; parts.push(oscString(a)); }
    else if (a && typeof a === 'object' && 'i' in a) { tags += 'i'; const b = Buffer.alloc(4); b.writeInt32BE(a.i); parts.push(b); }
    else { tags += 'f'; const b = Buffer.alloc(4); b.writeFloatBE(a); parts.push(b); }
  }
  return Buffer.concat([oscString(address), oscString(tags), ...parts]);
}
const int = (i) => ({ i });
function bundle(...messages) {
  const head = Buffer.concat([oscString('#bundle'), Buffer.from([0, 0, 0, 0, 0, 0, 0, 1])]);   // "immediately"
  return Buffer.concat([head, ...messages.flatMap((m) => { const n = Buffer.alloc(4); n.writeInt32BE(m.length); return [n, m]; })]);
}

const udp = createSocket('udp4');
await new Promise((r) => udp.bind(0, '127.0.0.1', r));
const sendUdp = (buf, port) => new Promise((r) => udp.send(buf, port, '127.0.0.1', () => r()));

// ── A fixture, listening for the show's universe ─────────────────────
const fixture = createSocket({ type: 'udp4', reuseAddr: true });
/** Every ArtDmx packet that reached the fixture's port, with when. */
const frames = [];
fixture.on('message', (buf) => { const p = decodeArtDmx(buf); if (p) frames.push({ at: Date.now(), universe: p.universe, sequence: p.sequence, data: [...p.data] }); });
await new Promise((r) => fixture.bind(ARTNET_OUT_PORT, '127.0.0.1', r));
const lastFrame = () => frames[frames.length - 1] ?? null;
async function frameWhere(test, ms = 3000) {
  const from = frames.length;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (let i = from; i < frames.length; i++) if (test(frames[i])) return frames[i];
    await sleep(25);
  }
  return null;
}

// ── The show server, as a Pro buyer's Mac starts it ──────────────────
const temp = mkdtempSync(join(tmpdir(), 'cg-rig-'));
let dist = resolve(process.env.RIG_DIST ?? 'dist');
if (NODE_ONLY) {
  // The server refuses to start with no build; the wires need none.
  dist = join(temp, 'dist');
  mkdirSync(dist);
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>rig</title>');
} else if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No build at ${dist}: "npm run rig" builds first, or pass --node for the server's wires alone.`);
  process.exit(1);
}

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const proKey = await signLicenseKey({ tier: 'pro', email: 'rig@example.com', id: 'lic-rig-check' }, await crypto.subtle.exportKey('jwk', pair.privateKey));

const server = spawn(process.execPath, ['server/remote-server.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    REMOTE_DIST: dist,
    SHOW_KEY_FILE: join(temp, 'show-key'),
    CHROMAGLASS_LICENSE_FILE: join(temp, 'license.json'),
    CHROMAGLASS_LICENSE_KEY: proKey,
    LICENSE_PUBLIC_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey)),
    OSC_PORT: String(OSC_PORT),
    OSC_BIND: '127.0.0.1',
    ARTNET_HOST: '127.0.0.1',
    ARTNET_PORT: String(ARTNET_OUT_PORT),
    ARTNET_UNIVERSE: String(OUT_UNIVERSE),
    ARTNET_FIXTURES: String(FIXTURES),
    ARTNET_RATE: String(RATE),
    // A desk's first two faders: Sound Impact over its whole travel, and
    // Speed over the tenth of its range a desk would actually want.
    ARTNET_IN: '1:audioImpact,2:globalSpeed:0:0.1',
    ARTNET_IN_UNIVERSE: String(IN_UNIVERSE),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(String(d)));
server.stderr.on('data', (d) => serverLog.push(String(d)));
let browser = null;
const finish = (code) => {
  try { server.kill('SIGTERM'); } catch { /* gone */ }
  try { udp.close(); fixture.close(); } catch { /* closed */ }
  rmSync(temp, { recursive: true, force: true });
  process.exit(code);
};

const ORIGIN = `http://127.0.0.1:${PORT}`;
let info = null;
for (let end = Date.now() + 15_000; Date.now() < end && !info;) {
  try { const r = await fetch(`${ORIGIN}/remote-info.json`); if (r.ok) info = await r.json(); } catch { /* not yet */ }
  if (!info) await sleep(150);
}
if (!info?.displayKey) {
  console.error(`The show server did not start:\n${serverLog.join('').slice(-1500)}`);
  finish(1);
}
const licence = await fetch(`${ORIGIN}/license-info.json`).then((r) => r.json()).catch(() => null);
check('the show server runs as Pro, as a Pro buyer\'s does', licence?.tier === 'pro', `tier ${licence?.tier}`);
const banner = serverLog.join('');
check('its banner says OSC, Art-Net out and Art-Net in are on',
  banner.includes(`OSC in:             udp port ${OSC_PORT}`) && banner.includes('Art-Net out:') && banner.includes('Art-Net in:'));

// ── Half 1: the server's wires, with a socket where the page would be ─
{
  const display = new WebSocket(`ws://127.0.0.1:${PORT}/remote-ws`);
  const inbox = [];
  display.on('message', (d) => { try { inbox.push(JSON.parse(String(d))); } catch { /* not ours */ } });
  await new Promise((r, j) => { display.once('open', r); display.once('error', j); });
  display.send(JSON.stringify({ type: 'hello', role: 'display', key: info.displayKey }));
  await sleep(200);
  check('a display with the display key is let in', display.readyState === WebSocket.OPEN && !inbox.some((m) => m.type === 'denied'));

  /** What the display hears after one packet, until a marker setting arrives behind it. */
  let marks = 0;
  async function heard(packet) {
    inbox.length = 0;
    const mark = `rigMark${++marks}`;
    await sendUdp(packet, OSC_PORT);
    await sendUdp(osc(`/chromaglass/setting/${mark}`, 1), OSC_PORT);
    for (let end = Date.now() + 2000; Date.now() < end;) {
      const at = inbox.findIndex((m) => m.type === 'patch' && m.settings && mark in m.settings);
      if (at >= 0) return inbox.slice(0, at);
      await sleep(10);
    }
    return null;
  }

  // Every address the page for pros prints, each as the programs it names send it.
  const OSC_CASES = [
    ['a float setting (Resolume, TouchDesigner) arrives as that setting',
      osc('/chromaglass/setting/audioImpact', 0.8), (m) => m.type === 'patch' && near(m.settings.audioImpact, 0.8, 1e-6)],
    ['an int setting (Max, a norns script) arrives as that number',
      osc('/chromaglass/setting/layerCount', int(3)), (m) => m.type === 'patch' && m.settings.layerCount === 3],
    ['a string "true" arrives as a switch, not as NaN',
      osc('/chromaglass/setting/macroMode', 'true'), (m) => m.type === 'patch' && m.settings.macroMode === true],
    ['an action with no argument fires',
      osc('/chromaglass/action/seq-next'), (m) => m.type === 'action' && m.action === 'seq-next'],
    ['a button\'s press (1.0) fires its action',
      osc('/chromaglass/action/blackout-toggle', 1), (m) => m.type === 'action' && m.action === 'blackout-toggle'],
    ['a preset named in the argument is cued',
      osc('/chromaglass/preset', 'classic'), (m) => m.type === 'preset' && m.presetId === 'classic'],
    ['a preset named in the address is cued',
      osc('/chromaglass/preset/classic'), (m) => m.type === 'preset' && m.presetId === 'classic'],
    ['a drop lands where it was sent',
      osc('/chromaglass/drop', 0.25, 0.75, 1), (m) => m.type === 'drop' && near(m.x, 0.25) && near(m.y, 0.75) && near(m.amount, 1)],
    ['a blow carries its direction',
      osc('/chromaglass/blow', 0.5, 0.5, 0.6, -1, 0.5), (m) => m.type === 'blow' && near(m.amount, 0.6) && near(m.dx, -1) && near(m.dy, 0.5)],
    ['a press lands where it was sent',
      osc('/chromaglass/press', 0.1, 0.9), (m) => m.type === 'press' && near(m.x, 0.1) && near(m.y, 0.9)],
    ['a tilt past the edge is held at the edge',
      osc('/chromaglass/tilt', 2, -0.5), (m) => m.type === 'tilt' && m.x === 1 && near(m.y, -0.5)],
    ['a dye with its hash is that colour',
      osc('/chromaglass/dye', '#ff8800'), (m) => m.type === 'dye' && m.color === '#ff8800'],
    ['a dye without its hash gets one',
      osc('/chromaglass/dye', '33aaff'), (m) => m.type === 'dye' && m.color === '#33aaff'],
    ['a button\'s press (1.0) on a preset\'s address cues it',
      osc('/chromaglass/preset/classic', 1), (m) => m.type === 'preset' && m.presetId === 'classic'],
  ];
  for (const [name, packet, ok] of OSC_CASES) {
    const got = await heard(packet);
    check(`OSC: ${name}`, got && got.length === 1 && ok(got[0]), got ? JSON.stringify(got).slice(0, 140) : 'nothing arrived');
  }
  {
    const got = await heard(osc('/chromaglass/action/blackout-toggle', 0));
    check('OSC: a button\'s release (0.0) fires nothing, so one press is one blackout', got && got.length === 0, JSON.stringify(got));
  }
  {
    const got = await heard(bundle(osc('/chromaglass/setting/audioImpact', 0.3), osc('/chromaglass/dye', '#00ff00')));
    check('OSC: a bundle (TouchDesigner\'s default) delivers every message in it',
      got && got.length === 2 && near(got[0].settings?.audioImpact, 0.3, 1e-6) && got[1].color === '#00ff00', JSON.stringify(got));
  }
  {
    const got = await heard(osc('/composition/layers/1/video/opacity', 0.5));
    check('OSC: another program\'s address on the same port moves nothing', got && got.length === 0, JSON.stringify(got));
  }
  {
    // A Resolume button bound to /chromaglass/preset/<id> sent 1 and then 0,
    // and both cued the look: the plate cleared and reseeded twice a press.
    const got = await heard(osc('/chromaglass/preset/classic', 0));
    check('OSC: a button\'s release (0.0) on a preset\'s address cues nothing, so one press is one cue', got && got.length === 0, JSON.stringify(got));
  }

  // docs/osc.md is where a VJ learns the addresses (PLAN 13.4). Its tables are
  // held to the code they name, both ways, so a preset, action or setting added
  // or renamed in the app turns this red until the page says so; and every line
  // of its "Try it" block goes over the wire here as the page writes it, and
  // must arrive as the one message its address names, so the page's examples
  // are ones that work rather than ones that read right.
  {
    const text = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    const doc = text('docs/osc.md');
    const section = (title) => doc.split(/^#+ /m).find((s) => s.startsWith(title)) ?? '';
    const ticked = (s) => [...s.matchAll(/`([a-zA-Z0-9-]+)`/g)].map((m) => m[1]);
    const presetIds = [...text('src/presets.ts').matchAll(/^ {4}id: '([^']+)'/gm)].map((m) => m[1]);
    const actions = (text('src/lib/remoteProtocol.ts').match(/export type RemoteAction =([\s\S]*?\|[^\n]*;)\n/)?.[1] ?? '').split('\n').filter((l) => /^\s*\|/.test(l)).flatMap((l) => [...l.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]));
    const learnable = [...text('src/lib/midi.ts').matchAll(/\{ key: '([a-zA-Z0-9]+)',\s+label:/g)].map((m) => m[1]);
    const docPresets = ticked(section('Presets')).filter((id) => id !== 'user-');
    const docActions = section('Actions').split('\n').filter((l) => l.startsWith('| `')).flatMap((l) => ticked(l.split('|')[1]));
    const docSettings = [...section('Settings worth a fader').matchAll(/^\| `([a-zA-Z0-9]+)`/gm), ...section('Settings worth a fader').matchAll(/`(globalSpeed|macroZoom|hueJourney)`/g)].map((m) => m[1]);
    const missing = (want, have) => want.filter((x) => !have.includes(x));
    // Every `id:` in the file is a preset's own (its dyes and patches carry none), so a
    // preset written at another indent, which the line above would miss, shows as a gap.
    const allIds = text('src/presets.ts').match(/^\s+id: '/gm)?.length ?? 0;
    check('docs/osc.md: its presets are the app\'s built-in presets, every one and no other',
      presetIds.length > 20 && presetIds.length === allIds && !missing(presetIds, docPresets).length && !missing(docPresets, presetIds).length,
      `${presetIds.length} in src/presets.ts (${allIds} ids in the file); not on the page: ${missing(presetIds, docPresets).join(' ') || 'none'}; not in the app: ${missing(docPresets, presetIds).join(' ') || 'none'}`);
    check('docs/osc.md: its actions are the protocol\'s actions, every one and no other',
      actions.length > 20 && !missing(actions, docActions).length && !missing(docActions, actions).length,
      `${actions.length} in RemoteAction; not on the page: ${missing(actions, docActions).join(' ') || 'none'}; not in the app: ${missing(docActions, actions).join(' ') || 'none'}`);
    check('docs/osc.md: every setting it names is one MIDI learn offers',
      docSettings.length >= 10 && !missing(docSettings, learnable).length,
      `${docSettings.length} named; not learnable: ${missing(docSettings, learnable).join(' ') || 'none'}`);

    const lines = (doc.match(/```osc\n([\s\S]*?)```/)?.[1] ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    const wrong = [];
    for (const line of lines) {
      const [address, ...words] = line.split(/\s+/);
      const args = words.map((w) => (/^-?\d*\.?\d+$/.test(w) ? Number(w) : w));
      const [, , what, name] = address.split('/');
      const got = await heard(osc(address, ...args));
      const m = got?.length === 1 ? got[0] : null;
      const ok = !!m && (
        what === 'setting' ? m.type === 'patch' && learnable.includes(name) && near(m.settings[name], args[0], 1e-6)
        : what === 'action' ? m.type === 'action' && m.action === name && actions.includes(name)
        : what === 'preset' ? m.type === 'preset' && m.presetId === (name ?? args[0]) && presetIds.includes(m.presetId)
        : what === 'dye' ? m.type === 'dye' && m.color === `#${String(args[0]).replace(/^#/, '')}`
        : what === 'tilt' ? m.type === 'tilt' && near(m.x, args[0]) && near(m.y, args[1])
        : m.type === what && near(m.x, args[0]) && near(m.y, args[1]) && near(m.amount, args[2] ?? 0.5)
          && (args.length < 5 || (near(m.dx, args[3]) && near(m.dy, args[4]))));
      if (!ok) wrong.push(`${line} → ${got ? JSON.stringify(got).slice(0, 80) : 'nothing'}`);
    }
    check('docs/osc.md: every line of "Try it" arrives as the message its address names',
      lines.length >= 15 && !wrong.length, `${lines.length} lines${wrong.length ? `; wrong: ${wrong.join('; ')}` : ''}`);
  }

  // Art-Net out: the page reports the plate, the fixture sees it.
  display.send(JSON.stringify({ type: 'lights', layers: [{ colour: '#3366ff', fill: 1 }, { colour: '#ff2200', fill: 1 }], master: 1 }));
  const lit = await frameWhere((f) => f.data[0] === 0x33);
  check('Art-Net: the plate\'s colours reach a fixture on the universe set',
    lit && lit.universe === OUT_UNIVERSE && lit.data.slice(0, 6).join() === [0x33, 0x66, 0xff, 0xff, 0x22, 0x00].join(),
    lit ? `universe ${lit.universe}, ${lit.data.slice(0, 12).join(' ')}` : 'nothing arrived');
  check('Art-Net: two layers go round four fixtures in turn',
    lit && lit.data.slice(6, 12).join() === [0x33, 0x66, 0xff, 0xff, 0x22, 0x00].join());
  {
    const from = frames.length;
    await sleep(1000);
    const second = frames.slice(from);
    const seqOk = second.every((f, i) => f.sequence >= 1 && f.sequence <= 255 && (i === 0 || f.sequence === (second[i - 1].sequence % 255) + 1));
    check(`Art-Net: frames go at the rate set (${RATE} a second)`, second.length >= RATE * 0.8 && second.length <= RATE * 1.2, `${second.length} in 1 s`);
    check('Art-Net: the sequence counts 1..255 without a gap, so a node can drop a late packet', second.length > 0 && seqOk);
  }
  display.send(JSON.stringify({ type: 'lights', layers: [{ colour: '#3366ff', fill: 1 }], master: 0 }));
  const dark = await frameWhere((f) => f.data.every((v) => v === 0));
  check('Art-Net: a blackout is a black universe', !!dark, dark ? '' : `last ${lastFrame()?.data.slice(0, 6).join(' ')}`);

  // Art-Net in: a desk's faders.
  {
    inbox.length = 0;
    const desk = new Uint8Array(8); desk[0] = 255; desk[1] = 128;
    await sendUdp(encodeArtDmx(IN_UNIVERSE, 1, desk), ARTNET_PORT);
    await sleep(300);
    const p = inbox.find((m) => m.type === 'patch' && 'audioImpact' in m.settings);
    check('Art-Net in: a desk\'s faders arrive as the settings mapped to them, in their ranges',
      p && near(p.settings.audioImpact, 1) && near(p.settings.globalSpeed, 0.1 * 128 / 255), p ? JSON.stringify(p.settings) : 'nothing arrived');
    // Nothing arriving proves nothing on its own (a dead listener hears no
    // universe at all), so the other universe is followed by a fader move on
    // ours, and that move must be the first thing heard.
    inbox.length = 0;
    desk[0] = 0;
    await sendUdp(encodeArtDmx(IN_UNIVERSE + 1, 1, desk), ARTNET_PORT);
    desk[0] = 255; desk[1] = 64;
    await sendUdp(encodeArtDmx(IN_UNIVERSE, 2, desk), ARTNET_PORT);
    for (let end = Date.now() + 2000; Date.now() < end && !inbox.some((m) => m.type === 'patch'); ) await sleep(10);
    const first = inbox.find((m) => m.type === 'patch');
    check('Art-Net in: another universe on the lighting network is not read as ours',
      first && !('audioImpact' in first.settings) && near(first.settings.globalSpeed, 0.1 * 64 / 255), first ? JSON.stringify(first.settings) : 'not even our own universe arrived');
  }
  display.close();
  await sleep(200);
}

if (NODE_ONLY) {
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  finish(failed.length ? 1 : 0);
}

// ── Half 2: the app on that server ───────────────────────────────────
//
// The page is opened from the show server, as the Mac app opens it, so it
// joins the relay as the display by itself. Before it loads, Web MIDI is a
// stand-in: one input the harness plays and one output that keeps every
// message, both named as one controller so feedback finds its way back the
// way it does to a real one (useMidi pairs the output by the input's name).
// The map binds CC 7 to Sound Impact (a fader under a hand) and CC 21 to the
// room's Dimmer (a knob nobody touches, so its ring is free to follow the
// screen).
const RIG_MAP = JSON.stringify({
  format: 'chromaglass-midi', version: 1, name: 'rig', bindings: [
    { id: 'fader', source: { kind: 'cc', channel: 0, number: 7 }, target: { kind: 'setting', key: 'audioImpact', min: 0, max: 1 }, mode: 'absolute' },
    { id: 'knob', source: { kind: 'cc', channel: 0, number: 21 }, target: { kind: 'setting', key: 'dimmer', min: 0, max: 1 }, mode: 'absolute' },
  ],
});
const { chromium } = await import('playwright');
const { launchChromium } = await import('./chromium.mjs');
try {
  browser = await launchChromium(chromium);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.addInitScript((map) => {
    const input = { id: 'rig-in', name: 'Rig controller', onmidimessage: null };
    const output = { id: 'rig-out', name: 'Rig controller', sent: [], send(data) { this.sent.push([...data]); } };
    window.__midiIn = input;
    window.__midiOut = output;
    navigator.requestMIDIAccess = async () => ({ inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]]), onstatechange: null });
    try {
      localStorage.setItem('chromaglass-midi-enabled', '1');
      localStorage.setItem('chromaglass-midi-map', map);
    } catch { /* private window */ }
  }, RIG_MAP);
  await page.goto(`http://127.0.0.1:${PORT}/?debug&look=classic&play=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.chromaglassCastState === 'function' && typeof window.chromaglassTempo === 'function' && typeof window.chromaglassAction === 'function', null, { timeout: 60_000 });
  const setting = (key) => page.evaluate((k) => window.chromaglassCastState().settings[k], key);
  async function settles(key, want, tol = 0.01, ms = 5000) {
    let v;
    for (let end = Date.now() + ms; Date.now() < end;) {
      v = await setting(key);
      if (near(v, want, tol)) return { ok: true, v };
      await sleep(100);
    }
    return { ok: false, v };
  }
  // The page joins the relay a moment after it loads; an OSC packet before
  // then reaches no display. The server says so when it does (the first
  // display was half 1's socket, closed since).
  for (let end = Date.now() + 30_000; Date.now() < end && serverLog.join('').split('display connected').length < 3;) await sleep(100);
  check('the app joins the show server as its display', serverLog.join('').split('display connected').length >= 3);
  /*
    Its plate's colours, out to the fixture. The page sends `lights` twenty
    times a second whatever the plate holds, but an empty plate is rightly a
    dark room (master is the plate's fill), and the fill comes back from the
    GPU. Without a GPU the server sends an all-zero universe, so the blackout
    lines below would pass on a rig that was never lit: they are asked only
    where a lit frame was seen first. Measured 2026-10-30 in a cloud session
    with PW_WEBGPU=1, Classic seeded: every `lights` for 40 s said fill 0 at
    #111111, the software plate never reporting its dye back at 0.4 steps a
    second. So these lines are the Mac's (or RIG_PLATE=1 on a machine with a
    GPU); the relay's half of the same path is half 1's, above.
  */
  const PLATE = process.platform === 'darwin' || !!process.env.RIG_PLATE;
  if (PLATE) await page.evaluate(() => window.chromaglassAction?.('seed'));
  const joined = PLATE ? await frameWhere((f) => f.data.some((v) => v > 0), 60_000) : null;
  if (PLATE) {
    check('the app: its plate\'s colours reach the fixture', !!joined,
      joined ? `channels 1-6: ${joined.data.slice(0, 6).join(' ')}` : 'no lit frame in 60 s');
  } else {
    console.log('skip  the app\'s plate to the fixture, and the blackout on the rig — no plate reports its dye back without a GPU (the Mac, or RIG_PLATE=1)');
  }

  {
    await sendUdp(osc('/chromaglass/setting/audioImpact', 0.37), OSC_PORT);
    const r = await settles('audioImpact', 0.37);
    check('the app: an OSC setting moves that setting on the page', r.ok, `audioImpact ${r.v}`);
  }
  {
    const desk = new Uint8Array(8); desk[0] = 51; desk[1] = 0;
    await sendUdp(encodeArtDmx(IN_UNIVERSE, 2, desk), ARTNET_PORT);
    const r = await settles('audioImpact', 0.2);
    check('the app: a lighting desk\'s fader moves the setting mapped to it', r.ok, `audioImpact ${r.v}`);
  }
  {
    // Moved as a hand moves it, bottom to top. Soft takeover (on /pro) holds
    // a fader that jumps in at a value the setting is not at until it passes
    // that value, so a single CC 127 rightly moves nothing.
    await page.evaluate(async () => {
      for (let v = 0; v <= 127; v += 3) {
        window.__midiIn.onmidimessage?.({ data: new Uint8Array([0xb0, 7, Math.min(127, v)]) });
        await new Promise((r) => setTimeout(r, 8));
      }
      window.__midiIn.onmidimessage?.({ data: new Uint8Array([0xb0, 7, 127]) });
    });
    const r = await settles('audioImpact', 1);
    check('the app: a MIDI fader moves the setting it is learned to, past soft takeover', r.ok, `audioImpact ${r.v}`);
  }
  {
    // The knob's ring follows a setting something else moved. Sent from OSC
    // here, so one line crosses two of the programs: TouchDesigner turns the
    // Dimmer and the APC's ring follows it.
    await page.evaluate(() => { window.__midiOut.sent.length = 0; });
    await sendUdp(osc('/chromaglass/setting/dimmer', 0.5), OSC_PORT);
    const r = await settles('dimmer', 0.5);
    let ring = null;
    for (let end = Date.now() + 3000; Date.now() < end && !ring;) {
      ring = (await page.evaluate(() => window.__midiOut.sent)).filter((m) => m[0] === 0xb0 && m[1] === 21).pop() ?? null;
      if (!ring) await sleep(100);
    }
    check('the app: a setting moved over OSC lights the controller\'s ring to match (MIDI out)',
      r.ok && ring && Math.abs(ring[2] - 64) <= 2, `dimmer ${r.v}, ring ${ring ? ring.join(' ') : 'never written'}`);
  }
  {
    // A DAW's clock: Start, then 24 pulses a beat at 120 BPM for three
    // seconds, timed in the page. The app stamps each pulse as it arrives,
    // so what it is judged against is the beats it was actually given (the
    // page's own stamp on each beat's last pulse), not the 500 ms the harness
    // aimed at: a runner busy for 30 ms at the wrong pulse moved the reading
    // to 118.3 BPM, a slow harness and not a wrong clock. The aim is checked
    // apart, loosely, as the harness's own health.
    const run = await page.evaluate(async () => {
      const send = (b) => window.__midiIn.onmidimessage?.({ data: new Uint8Array(b) });
      send([0xfa]);
      const t0 = performance.now();
      const beats = [];
      let n = 0;
      await new Promise((done) => {
        const tick = () => {
          const due = t0 + n * (500 / 24);
          if (performance.now() >= due) {
            if ((n + 1) % 24 === 0) beats.push(performance.now());
            send([0xf8]);
            n++;
          }
          if (n >= 24 * 6) return done();
          setTimeout(tick, 1);
        };
        tick();
      });
      return { reading: window.chromaglassTempo(), beats };
    });
    const given = run.beats.slice(-5);
    const givenPeriod = (given[given.length - 1] - given[0]) / (given.length - 1);
    const reading = run.reading;
    check('the app: a DAW\'s MIDI clock becomes the tempo, at the period its beats came',
      reading?.source === 'clock' && Math.abs(reading.period - givenPeriod) < 0.5,
      reading ? `${(60000 / reading.period).toFixed(2)} BPM from ${reading.source}; the beats given ${(60000 / givenPeriod).toFixed(2)}` : 'no reading');
    check('the harness sent its clock near 120 BPM', Math.abs(givenPeriod - 500) < 25, `${givenPeriod.toFixed(1)} ms a beat`);
  }
  if (joined) {
    await sendUdp(osc('/chromaglass/action/blackout-toggle', 1), OSC_PORT);
    await sendUdp(osc('/chromaglass/action/blackout-toggle', 0), OSC_PORT);
    const dark = await frameWhere((f) => f.data.every((v) => v === 0), 3000);
    check('the app: an OSC blackout blacks out the lighting rig too', !!dark);
    await sendUdp(osc('/chromaglass/action/blackout-toggle', 1), OSC_PORT);
    const back = await frameWhere((f) => f.data.some((v) => v > 0), 3000);
    check('the app: and a second press brings the rig back', !!back);
  }
} catch (e) {
  check('the app half ran to the end', false, e.message.split('\n')[0]);
} finally {
  await browser?.close().catch(() => {});
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
finish(failed.length ? 1 : 0);
