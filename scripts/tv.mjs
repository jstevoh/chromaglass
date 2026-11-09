#!/usr/bin/env node
/**
 * A TV at home (PLAN 12-tv, route 2): the laptop's plate played on a TV as
 * WebRTC video, through the show server's relay (src/lib/tvFeed.ts, the
 * sender; src/components/TvDisplay.tsx, the `/tv` page).
 *
 *   npm run tv                  # builds, then about forty seconds
 *   npm run tv -- --head        # watch it
 *
 * A real show server, the built `/tv` page in Chromium, and a stand-in laptop:
 * a page on the show server's origin that runs the real `TvFeedSender` over a
 * 2D canvas painted one colour at a time, called each frame as the frame task
 * calls it. So what is judged is the feature, the TV showing the laptop's
 * picture, and not that some video plays: the TV's own pixels are read and
 * must follow the laptop's colour as it changes. No plate and no GPU, so it
 * runs in the Measure job; the app's own frame task feeding the sender is the
 * one-line tap in lib/frameTaps.ts beside the Live Show's and Draw's.
 *
 * Chromium here is launched as the Mac app is (desktop/main.js), offering its
 * real address rather than an mDNS name, so ICE takes the road it takes there.
 *
 *   sums            the codec order (H.264, its baseline profile first), the
 *                   starting bit rate written into the answer, and the stage's
 *                   size (1080p at most, even sides), in node
 *   no show         a TV with no laptop on the relay plays the films, and asks
 *                   for no GPU (the page has no visualizer to start one)
 *   live            the laptop joins: the TV is live within a few seconds, at
 *                   the stage's full size within two (not Chrome's 320 x 180
 *                   start), and its picture is the laptop's colour;
 *                   each change of colour reaches the TV's pixels, and how long
 *                   that takes is printed and held under TV_LAG_BAR
 *   the codec       what the two ends agreed is H.264 wherever both have it
 *   stage           a 2560 x 1440 canvas is staged at 1920 x 1080
 *   three TVs       a second and a third TV are live beside the first; a fourth
 *                   is told three are already watching
 *   free            a copy without Home or Pro turns a TV away with that reason
 *   wrong key       the TV says so
 *   only watches    a patch sent from a TV's socket never reaches the laptop
 *   leaving         a closed TV leaves the laptop's count, and the last one
 *                   gone stops the stage (the frame task's tap is free again)
 *   show gone       the laptop's page closed: the TV goes back to films, and
 *                   live again by itself when the page comes back
 *   frozen          with no TV watching, the plate stops drawing; a TV that
 *                   joins then still gets its last picture, full size
 *   phone           the page on a phone, upright: live, the picture inside the
 *                   screen, nothing to scroll sideways
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { build } from 'esbuild';
import { launchChromium, port } from './chromium.mjs';
import { preferTvCodecs, tvStageSize, withStartBitrate, TV_MAX } from '../src/lib/tvFeed.ts';

const PORT = port(4241, 'TV_PORT');
const KEY = '7319';
const BASE = `http://localhost:${PORT}`;
const HEADED = process.argv.includes('--head');
/**
 * The longest a change of colour on the laptop may take to show on the TV's
 * pixels, in ms. Measured on the cloud's Chromium (software encode and decode,
 * 2026-11-08): about 100–250 ms at 1280 x 720. A home network adds a few ms; a
 * Mac encodes in hardware. A second would still be a working TV and a broken
 * one at a show, so the bar sits between: what a viewer would call "in time".
 */
const TV_LAG_BAR = 700;

let failed = 0, total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ── Sums ───────────────────────────────────────────────────────────────
{
  const listed = [
    { mimeType: 'video/VP8' },
    { mimeType: 'video/rtx' },
    { mimeType: 'video/H264', sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f' },
    { mimeType: 'video/VP9', sdpFmtpLine: 'profile-id=0' },
    { mimeType: 'video/H264', sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f' },
    { mimeType: 'video/H264', sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f' },
  ];
  const order = preferTvCodecs(listed).map(c => `${c.mimeType}${c.sdpFmtpLine?.includes('mode=1') ? '/1' : ''}${c.sdpFmtpLine?.includes('42e0') ? 'b' : ''}`);
  check('sums: H.264 baseline, packetization 1, first; the other H.264s next; then the rest as listed',
    order.join(' ') === 'video/H264/1b video/H264b video/H264/1 video/VP8 video/rtx video/VP9', order.join(' '));
  check('sums: a list with no H.264 keeps its order', preferTvCodecs([{ mimeType: 'video/VP8' }, { mimeType: 'video/AV1' }]).map(c => c.mimeType).join() === 'video/VP8,video/AV1');
  const s1 = tvStageSize(3840, 2160), s2 = tvStageSize(1280, 720), s3 = tvStageSize(1921, 1081), s4 = tvStageSize(0, 0);
  check('sums: a 4K canvas stages at 1920 x 1080, a 720p one as it is', s1.width === 1920 && s1.height === 1080 && s2.width === 1280 && s2.height === 720, `${JSON.stringify(s1)} ${JSON.stringify(s2)}`);
  const sdp = ['v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=fmtp:111 minptime=10', 'm=video 9 UDP/TLS/RTP/SAVPF 96 97 102', 'a=rtpmap:96 VP8/90000',
    'a=fmtp:97 apt=96', 'a=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f', ''].join('\r\n');
  const started = withStartBitrate(sdp, 4000).split('\r\n');
  check('sums: the answer starts each video codec at 4000 kb/s, and leaves audio and the resend streams alone',
    started[6].endsWith(';x-google-start-bitrate=4000') && started[2] === 'a=fmtp:111 minptime=10' && started[5] === 'a=fmtp:97 apt=96' && withStartBitrate(withStartBitrate(sdp)) === withStartBitrate(sdp),
    started[6]);
  check('sums: both sides even, never zero', s3.width % 2 === 0 && s3.height % 2 === 0 && s4.width === 2 && s4.height === 2, `${JSON.stringify(s3)} ${JSON.stringify(s4)}`);
}

// ── The show server ────────────────────────────────────────────────────
const server = spawn(process.execPath, ['server/remote-server.js'], {
  env: { ...process.env, PORT: String(PORT), SHOW_KEY: KEY, OSC_PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe'], detached: true,
});
const stop = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } };
process.on('exit', stop);
let serverSaid = '';
await new Promise((resolve, reject) => {
  const bail = setTimeout(() => reject(new Error('the show server did not start')), 30_000);
  // The whole banner, its addresses last: "Same Wi-Fi" follows them.
  server.stdout.on('data', d => { serverSaid += String(d); if (serverSaid.includes('Same Wi-Fi') || /No LAN address/.test(serverSaid)) { clearTimeout(bail); resolve(); } });
  server.stderr.on('data', d => { serverSaid += String(d); });
  server.on('exit', c => { clearTimeout(bail); reject(new Error(`the show server exited ${c}: ${serverSaid.slice(0, 300)}`)); });
});
{
  const line = (serverSaid.match(/TV at home: +\S+/) ?? [])[0];
  check('the show server prints the TV address', /^TV at home: +http:\/\/[^ ]+\/tv\?key=7319$/.test(line ?? '') || /No LAN address/.test(serverSaid),
    line ?? 'no LAN address here, so no addresses printed');
}

// The real sender, bundled for the stand-in laptop's page.
const bundled = (await build({
  entryPoints: ['src/lib/tvFeed.ts'], bundle: true, write: false, format: 'iife', globalName: 'TvFeed', platform: 'browser', logLevel: 'silent',
})).outputFiles[0].text;
const LAPTOP_PAGE = `<!doctype html><meta charset=utf-8><title>laptop</title><body style="margin:0;background:#000">
<script>${bundled}</script>
<script>
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  document.body.append(canvas);
  const g = canvas.getContext('2d');
  window.__colour = [220, 30, 30];
  window.__allowed = true;
  window.__heard = [];
  window.__setColour = (c) => { window.__colour = c; window.__colourAt = performance.timeOrigin + performance.now(); };
  window.__resize = (w, h) => { canvas.width = w; canvas.height = h; };
  const info = await (await fetch('/remote-info.json')).json();
  const ws = new WebSocket('ws://' + location.host + '/remote-ws');
  const sender = new TvFeed.TvFeedSender((m) => ws.readyState === 1 && ws.send(JSON.stringify(m)), () => window.__allowed);
  window.__sender = sender;
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', role: 'display', key: info.displayKey }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    window.__heard.push(m.type);
    if (m.type === 'tv-join') sender.join(m.id);
    else if (m.type === 'tv-leave') sender.leave(m.id);
    else if (m.type === 'tv-signal' && m.from) sender.signal(m.from, m.signal);
  };
  // The frame task: draw, then hand the canvas over, as LiquidVisualizer's loop does through frameTaps.
  setInterval(() => {
    if (window.__frozen) return;
    const [r, gr, b] = window.__colour;
    g.fillStyle = 'rgb(' + r + ',' + gr + ',' + b + ')';
    g.fillRect(0, 0, canvas.width, canvas.height);
    // A bar that moves, so every frame differs as the plate's do.
    g.fillStyle = '#fff';
    g.fillRect((performance.now() / 4) % canvas.width, 0, 8, canvas.height / 8);
    sender.tap(canvas);
  }, 16);
  window.__ready = true;
</script>`.replace('<script>\n  const canvas', '<script type="module">\n  const canvas');

/*
  The TVs open the show server at its address on the network, as a TV in
  another room does, not at localhost: the relay hands a page at localhost the
  show key whatever its address says (the laptop's own mirror needs that), so a
  wrong key could not be tried there, and the relay's door for a stranger's
  socket is the one a TV goes through.
*/
const LAN = (await (await fetch(`http://127.0.0.1:${PORT}/remote-info.json`)).json()).hosts?.[0] ?? null;
const TV_BASE = LAN ? `http://${LAN}:${PORT}` : BASE;
check('the TVs open the show at its network address', LAN !== null, LAN ?? 'this machine has no LAN address: the TVs use localhost, and the wrong key cannot be tried');

const browser = await launchChromium(chromium, {
  headless: !HEADED,
  // Straight to the show server: a cloud session's Chromium otherwise sends a
  // LAN address to the machine's outbound proxy, which answers a socket 502.
  args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required', '--no-proxy-server'],
});
const errors = [];

async function laptopPage() {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`laptop: ${e.message}`));
  // A page on the show server's own origin, as the laptop's is: a file it
  // serves, its document then replaced by the stand-in.
  await page.goto(`${BASE}/remote-info.json`);
  await page.setContent(LAPTOP_PAGE);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15_000 });
  return { ctx, page };
}

async function tvPage(opts = {}) {
  const { key = KEY, width = 1280, height = 720, phone = false } = opts;
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width, height } });
  // Count any reach for the GPU: a TV page must make none.
  // An http address on the network is not a secure context, so there is no
  // `navigator.gpu` to wrap (found in review: the count could not move). A
  // stand-in is put there instead, which any reach for the GPU would call.
  await ctx.addInitScript(() => {
    window.__gpuAsks = 0;
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter() { window.__gpuAsks++; return Promise.resolve(null); }, getPreferredCanvasFormat() { window.__gpuAsks++; return 'bgra8unorm'; } } });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`tv: ${e.message}`));
  await page.goto(`${TV_BASE}/tv${key === null ? '' : `?key=${key}`}`);
  return { ctx, page };
}
const stateOf = (page) => page.getAttribute('[data-testid="tv-page"]', 'data-state').catch(() => null);
const untilState = async (page, want, ms = 15_000) => {
  const t0 = Date.now();
  for (;;) {
    const s = await stateOf(page);
    if (want.includes(s)) return { state: s, ms: Date.now() - t0 };
    if (Date.now() - t0 > ms) return { state: s, ms: Date.now() - t0 };
    await wait(100);
  }
};
/** The middle of the TV's live picture, as its own pixels (the video drawn into a canvas on the TV's page). */
const tvPixel = (page) => page.evaluate(() => {
  const v = document.querySelector('[data-testid="tv-live"]');
  if (!v || !v.videoWidth) return null;
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const g = c.getContext('2d');
  g.drawImage(v, v.videoWidth / 2 - 4, v.videoHeight / 2 - 4, 8, 8, 0, 0, 8, 8);
  const d = g.getImageData(4, 4, 1, 1).data;
  return [d[0], d[1], d[2]];
});
const near = (a, b, tol = 40) => !!a && a.every((v, i) => Math.abs(v - b[i]) <= tol);
/** How long, in ms, from the laptop's change of colour to the TV's pixel showing it. */
async function lagTo(laptop, tv, colour) {
  await laptop.evaluate((c) => window.__setColour(c), colour);
  const at = await laptop.evaluate(() => window.__colourAt);
  for (let i = 0; i < 300; i++) {
    const px = await tvPixel(tv);
    if (near(px, colour)) return (await tv.evaluate(() => performance.timeOrigin + performance.now())) - at;
    await wait(10);
  }
  return Infinity;
}

// ── No show ────────────────────────────────────────────────────────────
const tv1 = await tvPage();
{
  const r = await untilState(tv1.page, ['films']);
  check('no show: the TV plays films', r.state === 'films', `state ${r.state}`);
  const src = await tv1.page.getAttribute('[data-testid="tv-film"]', 'src').catch(() => null);
  check('no show: the film is one the site ships', !!src && /^\/press\/clips\/.+\.mp4$/.test(src), String(src));
  const film = await tv1.page.request.get(`${TV_BASE}${src}`).catch(() => null);
  check('no show: and the show server serves it', film?.ok() === true && /video\/mp4/.test(film.headers()['content-type'] ?? ''), `${film?.status()} ${film?.headers()['content-type']}`);
}

// ── Live ───────────────────────────────────────────────────────────────
const laptop = await laptopPage();
{
  const r = await untilState(tv1.page, ["live"], 20_000);
  check('live: the TV goes live when the laptop joins', r.state === 'live', `state ${r.state} after ${r.ms} ms`);
  console.log(`      (first picture ${r.ms} ms after the laptop's page was ready)`);
  /*
    Sharp from the start. Chrome's encoder starts at 300 kb/s, a 320 x 180
    picture, and climbs as its bandwidth estimate does: measured here before
    the sender set a starting rate (TV_START_KBPS), 11.7 s at 320 wide before
    it reached 1280. With it, the first frames are the stage's size.
  */
  let size = [0, 0];
  for (let t = 0; t < 2000; t += 100) {
    size = await tv1.page.evaluate(() => { const v = document.querySelector('[data-testid="tv-live"]'); return [v.videoWidth, v.videoHeight]; });
    if (size[0] >= 1280) break;
    await wait(100);
  }
  check('live: the picture is the stage\'s full 1280 x 720 within two seconds of going live', size[0] === 1280 && size[1] === 720, size.join(' x '));
  const px = await tvPixel(tv1.page);
  check('live: the TV shows the laptop\'s colour', near(px, [220, 30, 30]), JSON.stringify(px));
  const lags = [];
  for (const c of [[30, 60, 220], [30, 200, 60], [230, 200, 40], [220, 30, 30], [40, 200, 210]]) lags.push(await lagTo(laptop.page, tv1.page, c));
  const worst = Math.max(...lags), median = [...lags].sort((a, b) => a - b)[2];
  check(`live: every change of colour reaches the TV's pixels within ${TV_LAG_BAR} ms`, worst <= TV_LAG_BAR,
    `${lags.map(l => Number.isFinite(l) ? Math.round(l) : 'never').join(', ')} ms (median ${Math.round(median)})`);
  const asks = await tv1.page.evaluate(() => window.__gpuAsks);
  const control = await tv1.page.evaluate(async () => { const n = window.__gpuAsks; await navigator.gpu.requestAdapter(); return window.__gpuAsks - n; });
  check('live: the TV asked for no GPU (and the count moves when one is asked for)', asks === 0 && control === 1, `${asks} asks; the control's ${control}`);
}

// ── The codec ──────────────────────────────────────────────────────────
{
  const got = await laptop.page.evaluate(async () => {
    const peer = [...window.__sender.peers.values()][0];
    const stats = await peer.pc.getStats();
    let codecId = null; const codecs = {};
    stats.forEach(s => { if (s.type === 'outbound-rtp' && s.kind === 'video') codecId = s.codecId; if (s.type === 'codec') codecs[s.id] = s.mimeType; });
    const send = (RTCRtpSender.getCapabilities('video')?.codecs ?? []).some(c => /h264/i.test(c.mimeType));
    const recv = (RTCRtpReceiver.getCapabilities('video')?.codecs ?? []).some(c => /h264/i.test(c.mimeType));
    // The offer's own order: the first payload on its m=video line, by name.
    const sdp = peer.pc.localDescription.sdp;
    const first = (sdp.match(/m=video \S+ \S+ (\d+)/) ?? [])[1];
    const name = first ? (sdp.match(new RegExp(`a=rtpmap:${first} ([^/\r\n]+)`)) ?? [])[1] : null;
    return { codec: codecs[codecId] ?? null, h264: send && recv, offerFirst: name };
  });
  if (got.h264) {
    check('the codec: H.264 agreed, and first in the offer', /h264/i.test(got.codec ?? '') && /h264/i.test(got.offerFirst ?? ''), `agreed ${got.codec}, offered first ${got.offerFirst}`);
  } else {
    // Not counted either way: there is nothing here to tell the order by.
    console.log(` --   the codec: not judged here (this Chromium has no H.264 for WebRTC; agreed ${got.codec})`);
  }
}

// ── Stage ──────────────────────────────────────────────────────────────
{
  await laptop.page.evaluate(() => window.__resize(2560, 1440));
  await wait(400);
  const stage = await laptop.page.evaluate(() => [window.__sender.stage?.width, window.__sender.stage?.height]);
  let seen = [0, 0];
  for (let t = 0; t < 5000 && seen[0] !== 1920; t += 200) {
    seen = await tv1.page.evaluate(() => { const v = document.querySelector('[data-testid="tv-live"]'); return [v.videoWidth, v.videoHeight]; });
    await wait(200);
  }
  check('stage: a 2560 x 1440 canvas is staged at 1920 x 1080, and the TV gets 1920 x 1080', stage[0] === 1920 && stage[1] === 1080 && seen[0] === 1920 && seen[1] === 1080, `stage ${stage.join(' x ')}, TV ${seen.join(' x ')}`);
  await laptop.page.evaluate(() => window.__resize(1280, 720));
}

// ── Three TVs ──────────────────────────────────────────────────────────
const tv2 = await tvPage();
const tv3 = await tvPage();
{
  const [a, b] = [await untilState(tv2.page, ['live']), await untilState(tv3.page, ['live'])];
  const colour = await laptop.page.evaluate(() => window.__colour);
  const px = [await tvPixel(tv1.page), await tvPixel(tv2.page), await tvPixel(tv3.page)];
  check('three TVs: a second and a third are live beside the first, all three with the laptop\'s picture',
    a.state === 'live' && b.state === 'live' && (await stateOf(tv1.page)) === 'live' && px.every(p => near(p, colour)), `${a.state}, ${b.state}; ${JSON.stringify(px)}`);
  check('three TVs: the laptop counts three', (await laptop.page.evaluate(() => window.__sender.count)) === 3);
  const tv4 = await tvPage();
  const d = await untilState(tv4.page, ['full']);
  check(`three TVs: a fourth is told ${TV_MAX} are already watching`, d.state === 'full', `state ${d.state}`);
  await tv4.ctx.close();
}

// ── Leaving ────────────────────────────────────────────────────────────
{
  await tv3.ctx.close();
  await tv2.ctx.close();
  await wait(800);
  check('leaving: closed TVs leave the laptop\'s count', (await laptop.page.evaluate(() => window.__sender.count)) === 1);
}

// ── Free ───────────────────────────────────────────────────────────────
{
  await laptop.page.evaluate(() => { window.__allowed = false; });
  const t = await tvPage();
  const r = await untilState(t.page, ['tier']);
  check('free: a copy without Home or Pro turns the TV away, and says why', r.state === 'tier' && /Home or Pro/.test(await t.page.textContent('[data-testid="tv-says"]')), `state ${r.state}`);
  await t.ctx.close();
  await laptop.page.evaluate(() => { window.__allowed = true; });
}

// ── Wrong key ──────────────────────────────────────────────────────────
{
  const t = await tvPage({ key: '0000' });
  const r = await untilState(t.page, ['denied']);
  check('wrong key: the TV says so', r.state === 'denied' && /wrong show key/.test(await t.page.textContent('[data-testid="tv-says"]')), `state ${r.state}`);
  await t.ctx.close();
}

// ── Only watches ───────────────────────────────────────────────────────
{
  const before = await laptop.page.evaluate(() => window.__heard.length);
  const sock = new WebSocket(`ws://127.0.0.1:${PORT}/remote-ws`);
  await new Promise((res, rej) => { sock.once('open', res); sock.once('error', rej); });
  sock.send(JSON.stringify({ type: 'hello', role: 'tv', key: KEY }));
  await wait(300);
  sock.send(JSON.stringify({ type: 'patch', settings: { viscosity: 0.9 } }));
  sock.send(JSON.stringify({ type: 'preset', presetId: 'classic' }));
  sock.send(JSON.stringify({ type: 'tv-join', id: 'tv1' }));
  await wait(500);
  const heard = await laptop.page.evaluate((n) => window.__heard.slice(n), before);
  check('only watches: a patch, a preset or a forged join from a TV never reaches the laptop',
    !heard.some(t => t === 'patch' || t === 'preset') && heard.filter(t => t === 'tv-join').length === 1, heard.join(', '));
  sock.close();
  await wait(500);
}

// ── Show gone ──────────────────────────────────────────────────────────
{
  await laptop.ctx.close();
  const r = await untilState(tv1.page, ['films'], 10_000);
  check('show gone: the TV goes back to films', r.state === 'films', `state ${r.state} after ${r.ms} ms`);
  const back = await laptopPage();
  const l = await untilState(tv1.page, ['live'], 20_000);
  check('show gone: and live again by itself when the laptop comes back', l.state === 'live', `state ${l.state} after ${l.ms} ms`);
  check('show gone: with the laptop\'s picture', near(await tvPixel(tv1.page), [220, 30, 30]), JSON.stringify(await tvPixel(tv1.page)));
  await tv1.ctx.close();
  await wait(800);
  const after = await back.page.evaluate(() => [window.__sender.count, window.__sender.stream === null, window.__sender.tapping === false]);
  check('leaving: the last TV gone stops the stage', after[0] === 0 && after[1] && after[2], JSON.stringify(after));

  // ── Frozen ───────────────────────────────────────────────────────────
  // The plate stops drawing (Freeze; a hidden window; a software GPU's frame
  // every few seconds) with no TV watching, and then one joins: it gets the
  // last picture the stage kept, full size, not a black stage, and does not
  // start over for want of a frame (both found: the second in review).
  await back.page.evaluate(() => { window.__frozen = true; });
  const colour = await back.page.evaluate(() => window.__colour);
  const f = await tvPage();
  const rf = await untilState(f.page, ['live'], 15_000);
  const fsize = await f.page.evaluate(() => { const v = document.querySelector('[data-testid="tv-live"]'); return [v.videoWidth, v.videoHeight]; });
  await wait(1500);
  check('frozen: a TV joining a plate that stopped drawing after the others left gets its last picture, full size',
    rf.state === 'live' && near(await tvPixel(f.page), colour) && fsize[0] === 1280 && fsize[1] === 720 && (await stateOf(f.page)) === 'live',
    `state ${rf.state} after ${rf.ms} ms, ${fsize.join(' x ')}, ${JSON.stringify(await tvPixel(f.page))} for ${JSON.stringify(colour)}`);
  await f.ctx.close();
  await back.page.evaluate(() => { window.__frozen = false; });
  await wait(800);

  // ── Phone ──────────────────────────────────────────────────────────────
  const p = await tvPage({ phone: true });
  const r2 = await untilState(p.page, ['live'], 20_000);
  check('phone: the page on a phone goes live', r2.state === 'live', `state ${r2.state}`);
  // The picture as drawn, not the element (which always fills the screen):
  // its rectangle from the video's own size and the element's fit.
  const fit = await p.page.evaluate(() => {
    const el = document.querySelector('[data-testid="tv-live"]');
    const box = el.getBoundingClientRect();
    const mode = getComputedStyle(el).objectFit;
    const k = mode === 'contain' ? Math.min(box.width / el.videoWidth, box.height / el.videoHeight)
      : mode === 'cover' ? Math.max(box.width / el.videoWidth, box.height / el.videoHeight) : 1;
    const w = el.videoWidth * k, h = el.videoHeight * k;
    const x = box.left + (box.width - w) / 2, y = box.top + (box.height - h) / 2;
    return { mode, drawn: [Math.round(x), Math.round(y), Math.round(w), Math.round(h)], spill: document.documentElement.scrollWidth - window.innerWidth,
      inside: x >= -0.5 && y >= -0.5 && x + w <= window.innerWidth + 0.5 && y + h <= window.innerHeight + 0.5, full: Math.abs(w - window.innerWidth) < 1 };
  });
  check('phone: the whole picture inside the screen, edge to edge across it, nothing to scroll sideways', fit.inside && fit.full && fit.spill <= 0, JSON.stringify(fit));
  check('phone: the picture is the laptop\'s', near(await tvPixel(p.page), [220, 30, 30]), JSON.stringify(await tvPixel(p.page)));
  await p.ctx.close();
  await back.ctx.close();
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
stop();
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
