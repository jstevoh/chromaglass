// `npm run tvvideo`: the Apple TV app's video link playing a real WebRTC stream
// (PLAN.md 12-tv-apple).
//
// `npm run tvswift` proves the receiver's rules against a stand-in peer that answers with
// made-up strings. That leaves the half of the app that can only be proven with video:
// that LiveKit's WebRTC, the build the tvOS app links, takes the offer a browser makes,
// that its answer and candidates are ones a browser takes back, and that decoded pictures
// come out. This runs exactly that, on a Mac, with no Xcode and no Apple TV:
//
// - a Chromium page plays the Mac's part: a 640×360 canvas, flipping between near-black
//   and near-white every half second, sent as a WebRTC video track, receive-only on the
//   other side, no ICE servers, as the Mac's show sends the plate to a TV;
// - a stand-in relay at /remote-ws carries the messages between that page and the TV in
//   the relay's own shapes (`tv-show`, `tv-signal` offer/answer/ice), as tvswift's does;
// - `cgtv-video-probe` (tvos/Video) runs the app's ReceiverDriver over LiveKitPeer against
//   LiveKit's macOS slice of the same WebRTC, and reads the brightness of what it decodes.
//
// It needs macOS (the WebRTC binary is an xcframework: Linux cannot link it), so it is
// not a Measure shard's check: `.github/workflows/tvos.yml` runs it on a macOS runner when
// a PR touches tvos/, beside the app's simulator build. On any other system it says so in
// red rather than passing: a check that cannot run must not read as one that passed.

import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';
import { launchChromium } from './chromium.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '../tvos/Video');
// How many ok lines the probe prints when it gets as far as pictures: went live, rate,
// size, brightness. Fewer means it stopped early, which is a failure even with no FAIL.
const PROBE_CHECKS = 4;

const lines = [];
const say = (ok, name, detail = '') => {
  lines.push(ok);
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

if (process.platform !== 'darwin') {
  say(false, 'running on macOS (LiveKit\'s WebRTC is an xcframework; only a Mac can link it)');
  process.exit(1);
}

const built = spawnSync('swift', ['build', '--product', 'cgtv-video-probe'], { cwd: pkg, encoding: 'utf8' });
say(built.status === 0, 'the video link builds against LiveKit\'s WebRTC',
  built.status === 0 ? '' : (built.stderr || built.stdout).split('\n').filter((l) => /error/.test(l)).slice(0, 5).join(' | '));
if (built.status !== 0) process.exit(1);
const bin = spawnSync('swift', ['build', '--product', 'cgtv-video-probe', '--show-bin-path'], { cwd: pkg, encoding: 'utf8' }).stdout.trim();

// The page that plays the Mac. Chrome hides a page's own addresses behind mDNS names
// (`<uuid>.local`) unless told not to; the Mac's show runs in its own app, so the
// candidates the TV sees from it are plain addresses, and this asks for the same.
const browser = await launchChromium(chromium, {
  headless: true,
  args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
});
const page = await browser.newPage();
await page.setContent('<canvas id="c" width="640" height="360"></canvas>');
let toTv = () => {};
await page.exposeFunction('cgSendIce', (c) => toTv({ type: 'tv-signal', signal: { kind: 'ice', candidate: c } }));
await page.evaluate(() => {
  const c = document.getElementById('c');
  const g = c.getContext('2d');
  // Flip every half second, and redraw every frame so the encoder always has one to send.
  const draw = () => {
    const light = Math.floor(performance.now() / 500) % 2 === 1;
    g.fillStyle = light ? '#f0f0f0' : '#101010';
    g.fillRect(0, 0, 640, 360);
    requestAnimationFrame(draw);
  };
  draw();
  window.cgOffer = async () => {
    window.pc?.close();
    const pc = new RTCPeerConnection({ iceServers: [] });
    window.pc = pc;
    for (const t of c.captureStream(30).getVideoTracks()) pc.addTrack(t);
    pc.onicecandidate = (e) => window.cgSendIce(e.candidate ? e.candidate.toJSON() : null);
    await pc.setLocalDescription(await pc.createOffer());
    return pc.localDescription.sdp;
  };
  window.cgAnswer = (sdp) => window.pc.setRemoteDescription({ type: 'answer', sdp });
  window.cgIce = (cand) => window.pc.addIceCandidate(cand ?? null);
});

const RELAY_KEY = 'K3YTV';
const seen = [];
const relayHttp = http.createServer((_, res) => { res.writeHead(404); res.end(); });
const wss = new WebSocketServer({ server: relayHttp, path: '/remote-ws' });
wss.on('connection', (ws) => {
  const send = (m) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(String(raw)); } catch { return; }
    seen.push(m.type === 'hello' ? 'hello' : `${m.signal?.kind}${m.signal?.kind === 'ice' && m.signal.candidate === null ? ':end' : ''}`);
    if (m.type === 'hello') {
      if (m.key !== RELAY_KEY) { send({ type: 'denied', reason: 'key' }); return; }
      toTv = send;
      send({ type: 'tv-show', here: true });
      send({ type: 'tv-signal', signal: { kind: 'offer', sdp: await page.evaluate(() => window.cgOffer()) } });
    } else if (m.type === 'tv-signal' && m.signal?.kind === 'answer') {
      await page.evaluate((sdp) => window.cgAnswer(sdp), m.signal.sdp);
    } else if (m.type === 'tv-signal' && m.signal?.kind === 'ice') {
      await page.evaluate((c) => window.cgIce(c), m.signal.candidate).catch(() => {});
    }
  });
});
await new Promise((ok) => relayHttp.listen(0, '127.0.0.1', ok));

const probe = spawn(resolve(bin, 'cgtv-video-probe'), [], {
  env: { ...process.env, CGTV_TV_ADDRESS: `http://127.0.0.1:${relayHttp.address().port}/tv?key=${RELAY_KEY}` },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let printed = '';
probe.stdout.on('data', (d) => { printed += d; process.stdout.write(d); });
const timer = setTimeout(() => probe.kill('SIGKILL'), 60_000);
const code = await new Promise((ok) => probe.on('close', ok));
clearTimeout(timer);
for (const c of wss.clients) c.terminate();
wss.close();
relayHttp.close();
await browser.close();

const okLines = printed.split('\n').filter((l) => l.startsWith('ok ')).length;
const failLines = printed.split('\n').filter((l) => l.startsWith('FAIL')).length;
const order = seen.slice(0, 2).join(',');
say(order === 'hello,answer' && seen.includes('ice') && seen.includes('ice:end'),
  'the TV said hello, answered the page\'s offer, and sent its candidates and their end', JSON.stringify(seen));
say(code === 0 && failLines === 0 && okLines === PROBE_CHECKS,
  'the probe ran every one of its checks and all passed', `${okLines} ok, ${failLines} failed of ${PROBE_CHECKS}, exit ${code}`);

const failed = lines.filter((x) => !x).length;
console.log(`\n${lines.length - failed}/${lines.length} checks passed`);
process.exit(failed ? 1 : 0);
