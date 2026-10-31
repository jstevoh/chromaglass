#!/usr/bin/env node
/**
 * The Live Show panel (PLAN.md 37x-4d), driven as the owner will drive it.
 *
 *   npm run liveshow   (builds, then about a minute; no GPU needed)
 *
 * 37x-4b and 4c measured the stream itself (`npm run live` encodes the plate
 * to a local RTMP server, `npm run livedrop` throttles it, `npm run desktop`
 * runs it in the packed app). What they cannot see is the panel in front of
 * it: whether a key pasted there goes to the keychain store and nowhere
 * else, whether Go live goes where the panel says and Test never reaches the
 * public destinations, whether the upload warning is the sum the streams
 * will really push, and whether the phone can see the stream and stop it.
 *
 * So, in two halves:
 *
 * - The panel's sums, in node, against numbers worked here by hand rather
 *   than by the functions under test: what each destination needs (render.ts's
 *   0.1 bit a pixel, one copy a destination), the upload advice at each of
 *   its four levels, the upload measured from destinations' readings (a
 *   socket-only "behind" is the Mac's buffer, not the link, so it never
 *   counts as the link full), and a stored destination that cannot carry a key.
 *
 * - The panel itself, in the built app served by the show server, with a
 *   stand-in for the Mac app's bridge (`__CHROMAGLASS_NATIVE__.live`, what
 *   desktop/preload.cjs exposes) that records every call and reports each
 *   destination's health as the check sets it. The page's encoder is the
 *   real one (lib/liveStream.ts, WebCodecs' H.264 on Chromium's software
 *   encoder), so the packets the stand-in counts are real frames of the
 *   plate. The website (no bridge) does not offer the panel; a free licence
 *   gets the Pro note and no Go live; and a phone on the remote sees the
 *   stream on Draw and on Controls, and its Stop, two taps, ends it.
 *
 * What it does not say: anything about a real platform or the real
 * keychain. `npm run desktop`'s live line runs the packed app's store and
 * client; judging §92 streams to an unlisted YouTube broadcast.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';
import { engineQuery, installFrameReader } from './frame.mjs';
import { presentsInXvfb } from './chromium.mjs';
import { filmFile, stackJudge, gridOfPixels, barColumn, STACK_KEYSTONE } from './liveshowstack.mjs';
import {
  cleanDestination, needKbps, uploadAdvice, noteUpload, chosenFor, keyProblem, liveOptionsFor, HEADROOM, AUDIO_KBPS,
} from '../src/lib/liveShow.ts';

let failed = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── The sums ──────────────────────────────────────────────────────────
const SECRET = 'live_check_9f3a1c77e2b04d5ab1';
const dest = (id, o = {}) => ({ id, service: 'youtube', name: id, url: 'rtmps://a.rtmps.youtube.com/live2', orientation: 'landscape', on: true, test: false, ...o });

const smuggled = cleanDestination({ ...dest('abc'), key: SECRET, streamKey: SECRET });
check('a destination as kept has no room for a key', smuggled && !JSON.stringify(smuggled).includes(SECRET),
  smuggled ? Object.keys(smuggled).join(' ') : 'refused');

// render.ts's H.264 rate: 0.1 bit a pixel a frame, at least 2 Mb/s; each destination its own copy, plus the sound.
const f1080 = { height: 1080, fps: 30 };
const wide1080 = 1920 * 1080 * 30 * 0.1 / 1000;   // 6220.8
const tall = 720 * 1280 * 30 * 0.1 / 1000;        // 2764.8
const wide720at60 = 1280 * 720 * 60 * 0.1 / 1000; // 5529.6
const near = (a, b) => Math.abs(a - b) <= 1;
const n1 = needKbps([dest('a')], f1080);
const n3 = needKbps([dest('a'), dest('b', { service: 'twitch' }), dest('c', { service: 'instagram', orientation: 'portrait' })], f1080);
const n720 = needKbps([dest('a')], { height: 720, fps: 60 });
check('one 1080p30 destination needs its encode and its sound', near(n1, wide1080 + AUDIO_KBPS), `${n1} kb/s, by hand ${wide1080 + AUDIO_KBPS}`);
check('three need three copies: two of the wide encode and one of the tall', near(n3, 2 * wide1080 + tall + 3 * AUDIO_KBPS), `${n3} kb/s, by hand ${(2 * wide1080 + tall + 3 * AUDIO_KBPS).toFixed(0)}`);
check('720p60 is its own rate', near(n720, wide720at60 + AUDIO_KBPS), `${n720} kb/s, by hand ${wide720at60 + AUDIO_KBPS}`);

const need = 10000;
const levels = [
  [null, 'unknown'],
  [{ heldKbps: 0.9 * need * HEADROOM, saturatedKbps: 0.95 * need * HEADROOM, at: '' }, 'short'],
  [{ heldKbps: need * HEADROOM, saturatedKbps: null, at: '' }, 'ok'],
  [{ heldKbps: need, saturatedKbps: null, at: '' }, 'unproven'],
  [{ heldKbps: 1000, saturatedKbps: need * HEADROOM * 1.1, at: '' }, 'ok'],
].map(([m, want]) => [uploadAdvice(need, m).level, want]);
check('the upload advice: unmeasured, short of the 20% headroom, carried, carried but never full, full above the need',
  levels.every(([got, want]) => got === want), levels.map(([g, w]) => `${g}${g === w ? '' : ` (want ${w})`}`).join(', '));

const h = (o) => ({ name: 'x', phase: 'live', kbps: 4000, secondsBehind: 0.1, measuredAt: 'server', dropping: false, ...o });
const u = { heldKbps: 0, saturatedKbps: null };
noteUpload(u, [h(), h({ kbps: 5000 })]);
const held = u.heldKbps;
noteUpload(u, [h({ secondsBehind: 1.4, measuredAt: 'socket' }), h()]);
const afterSocket = u.saturatedKbps;
noteUpload(u, [h({ phase: 'connecting', kbps: 0 }), h({ kbps: 20000 })]);
const afterRetry = u.heldKbps;
noteUpload(u, [h({ secondsBehind: 1.6, kbps: 3000 }), h({ kbps: 3500 })]);
check('the upload is measured: the sum carried while keeping up, the sum while one is a second behind by the server\'s count',
  held === 9000 && afterSocket === null && afterRetry === 9000 && u.saturatedKbps === 6500,
  `held ${held}, after a socket-only lag ${afterSocket ?? 'not full'}, after a retry ${afterRetry}, full at ${u.saturatedKbps}`);

const set = [dest('pub'), dest('off', { on: false }), dest('rehearse', { test: true }), dest('noserver', { url: 'youtube.com' })];
const goes = chosenFor(set, false).map(d => d.id).join(), rehearses = chosenFor(set, true).map(d => d.id).join();
check('Go live goes to what is on, never to a test destination; Test only to those', goes === 'pub' && rehearses === 'rehearse', `live: ${goes}; test: ${rehearses}`);
const opts = liveOptionsFor([dest('pub')], f1080);
check('what the encoder is handed names the key and does not hold it', opts.destinations[0].keyName === 'live-pub' && !('key' in opts.destinations[0]) && opts.width === 1920,
  JSON.stringify(opts.destinations[0]));
check('a server pasted as the key, or an empty key, is refused', keyProblem('rtmps://a.rtmps.youtube.com/live2') !== null && keyProblem('  ') !== null && keyProblem(SECRET) === null);

if (process.argv.includes('--node')) finish();

// ── The panel ─────────────────────────────────────────────────────────
const PORT = Number(process.env.LIVESHOW_PORT ?? 4196);
const KEY = '4321';
const BASE = `http://localhost:${PORT}`;

function startServer() {
  const proc = spawn(process.execPath, ['server/remote-server.js'], {
    env: { ...process.env, PORT: String(PORT), SHOW_KEY: KEY, OSC_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  return new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('the show server did not start')), 30_000);
    let said = '';
    proc.stdout.on('data', d => { said += String(d); if (said.includes('Show key')) { clearTimeout(bail); resolve(proc); } });
    proc.stderr.on('data', d => { said += String(d); });
    proc.on('exit', c => { clearTimeout(bail); reject(new Error(`the show server exited ${c}: ${said.slice(0, 300)}`)); });
  });
}
const stop = (proc) => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); } };

/**
 * The Mac app's bridge as the page sees it (desktop/preload.cjs's `live`),
 * standing in for the main process: it keeps keys, records what it is asked,
 * and reports each destination's health from `__liveStub.health`.
 */
function stub(licence) {
  const calls = { start: [], stop: 0, packets: 0, configs: [], empty: 0, firstVideo: null, keySets: [], keyValues: [], keep: false, video: [], desc: {} };
  const keys = new Map();
  let req = null;
  const listeners = [];
  // Every destination's reading, and `by[name]` over it for one alone.
  const health = { kbps: 7000, secondsBehind: 0.1, measuredAt: 'server', dropping: false, by: {} };
  const stateOf = () => req ? {
    phase: 'live', error: null,
    destinations: req.destinations.map(d => { const h = { ...health, ...health.by[d.name] }; return {
      name: d.name, output: d.output, phase: 'live', error: null, status: [], kbps: h.kbps, secondsBehind: h.secondsBehind,
      bytesBehind: 0, measuredAt: h.measuredAt, dropping: h.dropping, videoFrames: calls.packets, videoDropped: 0, dropRuns: 0,
      audioPackets: 0, bytesSent: 0, joinSkipped: 0, acks: 0, pings: 0, serverAcks: 0, reconnects: 0, retryInMs: null, seconds: 1,
    }; }),
  } : { phase: 'stopped', error: null, destinations: [] };
  window.__liveStub = { calls, health, keys };
  window.__CHROMAGLASS_NATIVE__ = {
    ...(licence ? { license: licence } : {}),
    live: {
      start: async (r) => { calls.start.push(JSON.parse(JSON.stringify(r))); req = r; return { ok: true, state: stateOf() }; },
      config: async (c) => {
        calls.configs.push(JSON.stringify(c, (k, v) => (v instanceof Uint8Array ? [...v] : v)));
        if (c?.video) calls.desc[c.output ?? 'landscape'] = c.video.slice();
      },
      packet: (p) => {
        calls.packets++;
        // Kept only for --stack, which decodes them (the panel's part counts them).
        if (calls.keep && p?.kind === 'video' && p.data?.byteLength) calls.video.push({ ts: p.timestampMs, key: !!p.key, output: p.output ?? 'landscape', data: p.data.slice() });
        if (!p?.data?.byteLength) calls.empty++;
        if (p?.kind === 'video' && calls.firstVideo === null) calls.firstVideo = !!p.key;
      },
      stop: async () => { calls.stop++; req = null; return stateOf(); },
      state: async () => stateOf(),
      onEvent: (fn) => { listeners.push(fn); return () => {}; },
      keys: {
        set: async (name, key) => { calls.keySets.push(name); calls.keyValues.push(key); keys.set(name, new Date().toISOString()); return true; },
        list: async () => [...keys].map(([name, set]) => ({ name, set })),
        remove: async (name) => keys.delete(name),
      },
    },
  };
}

/*
  The show server serves dist/, which this script does not build when the
  shard runs it (an earlier step does). A dist/ older than the code it is
  meant to hold would test last week's panel and pass on it.
*/
{
  const { statSync } = await import('node:fs');
  const built = (() => { try { return statSync('dist/index.html').mtimeMs; } catch { return 0; } })();
  const newer = ['src/lib/liveShow.ts', 'src/lib/liveStream.ts', 'src/components/LiveShowPanel.tsx', 'src/components/LiveRemoteChip.tsx', 'src/app/useRemote.ts', 'src/components/RemoteControl.tsx', 'src/components/DrawScreen.tsx']
    .filter(f => statSync(f).mtimeMs > built);
  check('dist/ is built from this code', newer.length === 0, newer.length ? `older than ${newer.join(', ')}: npm run build` : 'built after every file it tests');
  if (newer.length) finish();
}

const STACK = process.argv.includes('--stack');
const server = await startServer();
const browser = await launchChromium(chromium, STACK
  ? { headless: true, present: true, args: [`--use-file-for-fake-video-capture=${filmFile()}`] }
  : { headless: true });
const errors = [];
const until = async (page, fn, arg, ms = 15_000) => {
  const t = Date.now();
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v || Date.now() - t > ms) return v;
    await page.waitForTimeout(200);
  }
};
const dock = async (page) => {
  await page.getByTestId('panel-browser-button').click();
  await page.getByTestId('panel-browser-search').fill('live show');
  await page.waitForTimeout(200);
  const row = await page.getByTestId('panel-browser-row-live').count();
  if (row) { await page.getByTestId('panel-browser-row-live').hover(); await page.getByTestId('panel-browser-dock-live').click(); }
  else await page.keyboard.press('Escape');
  return row > 0;
};
const open = async (licence) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  if (licence !== undefined) await page.addInitScript(stub, licence);
  if (STACK) await installFrameReader(page);
  await page.goto(`${BASE}/?debug&look=classic&${STACK ? engineQuery().slice(1) || 'dpr=0.35' : 'dpr=0.35'}&key=${KEY}`, { waitUntil: 'networkidle' });
  await until(page, () => !!document.querySelector('[data-testid="panel-browser-button"]'));
  return page;
};

if (STACK) {
  try { await stackLines(); } catch (e) {
    check('the run finished', false, String(e?.stack ?? e).split('\n').slice(0, 3).join(' | '));
  } finally { await browser.close(); stop(server); }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  finish();
}

try {
  // ── The website does not offer it ───────────────────────────────
  const site = await open(undefined);
  check('the website does not offer the Live Show panel', !(await dock(site)));
  await site.context().close();

  // ── Pro only ────────────────────────────────────────────────────
  const free = await open({ enforced: true, valid: false, tier: 'free' });
  const freeDocked = await dock(free);
  const freeSays = await until(free, () => document.querySelector('[data-testid="live-show-pro"]')?.textContent ?? document.querySelector('[data-testid="live-show"]')?.getAttribute('data-phase'));
  const freeGo = await free.getByTestId('live-go').count();
  check('on a free licence the panel says it is Pro and has no Go live', freeDocked && /Pro/.test(String(freeSays)) && freeGo === 0, `docked ${freeDocked}, says "${freeSays}", Go live ${freeGo}`);
  await free.context().close();

  // ── The Mac app, Pro ─────────────────────────────────────────────
  const page = await open(null);
  check('the Mac app offers it', await dock(page));
  await until(page, () => !!document.querySelector('[data-testid="live-show"]'));

  const add = async (service, key, o = {}) => {
    await page.getByTestId('live-add').click();
    await page.getByTestId('live-add-service').selectOption(service);
    if (o.name) await page.getByTestId('live-add-name').fill(o.name);
    if (o.url) await page.getByTestId('live-add-url').fill(o.url);
    await page.getByTestId('live-add-key').fill(key);
    const typed = { value: await page.getByTestId('live-add-key').inputValue(), type: await page.getByTestId('live-add-key').getAttribute('type') };
    await page.getByTestId('live-add-save').click();
    await page.waitForTimeout(250);
    return typed;
  };
  const typed = await add('youtube', SECRET);
  await add('twitch', `${SECRET}-tw`);
  await add('instagram', `${SECRET}-ig`, { url: 'rtmps://edgetee-upload.instagram.com:443/rtmp/' });
  await add('youtube', `${SECRET}-un`, { name: 'Unlisted' });

  const after = await page.evaluate((s) => {
    const inputs = [...document.querySelectorAll('input')].map(i => i.value).join('\n');
    const stored = Object.keys(localStorage).map(k => localStorage.getItem(k)).join('\n');
    const dests = JSON.parse(localStorage.getItem('chromaglass.live.destinations') ?? '[]');
    return {
      inDom: document.documentElement.outerHTML.includes(s) || inputs.includes(s), inStorage: stored.includes(s),
      kept: window.__liveStub.calls.keySets, values: window.__liveStub.calls.keyValues, dests,
      shown: [...document.querySelectorAll('[data-testid^="live-dest-key-"]')].map(e => e.getAttribute('data-kept')),
    };
  }, SECRET);
  check('a pasted key is a password field while typed', typed.value === SECRET && typed.type === 'password', `a ${typed.type} field holding ${typed.value.length} characters`);
  const typedKeys = [SECRET, `${SECRET}-tw`, `${SECRET}-ig`, `${SECRET}-un`];
  check('each key went once to the keychain store, under its own destination\'s name', after.dests.length === 4 && after.kept.length === 4
    && after.dests.every((d, i) => after.kept[i] === `live-${d.id}`) && after.values.every((v, i) => v === typedKeys[i]),
    `${after.dests.length} destinations; ${after.kept.join(', ')}`);
  check('and is nowhere in the page or its storage after', !after.inDom && !after.inStorage, `in the page ${after.inDom}, in storage ${after.inStorage}`);
  check('the panel says each key is kept, not what it is', after.shown.length === 4 && after.shown.every(k => k === 'true'), after.shown.join(' '));
  check('Instagram is added 9:16, the rest 16:9', after.dests.map(d => d.orientation[0]).join('') === 'llpl', after.dests.map(d => `${d.name} ${d.orientation}`).join(', '));

  // The fourth is the rehearsal: for tests only.
  const unlisted = after.dests[3].id;
  await page.getByTestId(`live-dest-test-${unlisted}`).click();

  // ── The upload, before anything was measured ────────────────────
  const upNeed = 2 * (wide1080 + AUDIO_KBPS) + tall + AUDIO_KBPS;
  const up0 = await page.getByTestId('live-upload').evaluate(e => ({ level: e.dataset.level, need: Number(e.dataset.need), text: e.textContent }));
  check('the panel sums what Go live\'s three destinations will push', near(up0.need, upNeed) && up0.level === 'unknown', `${up0.need} kb/s (${up0.level}): "${up0.text}"`);

  // ── Go live asks once more, then goes where it said ─────────────
  await page.getByTestId('live-go').click();
  await page.waitForTimeout(300);
  const armedText = await page.getByTestId('live-go').textContent();
  const startsArmed = await page.evaluate(() => window.__liveStub.calls.start.length);
  check('the first press of Go live only asks', startsArmed === 0 && /again/i.test(armedText), `"${armedText}", ${startsArmed} starts`);
  await page.getByTestId('live-go').click();
  const on = await until(page, () => document.querySelector('[data-testid="live-show"]')?.getAttribute('data-phase') === 'live');
  const req = await page.evaluate(() => window.__liveStub.calls.start[0]);
  const names = req?.destinations.map(d => `${d.name}>${d.output}`).join(', ');
  check('the second goes live to the three that are on, not the test one', on && req?.destinations.length === 3 && !req.destinations.some(d => d.name === 'Unlisted')
    && req.destinations.every(d => d.keyName === `live-${after.dests.find(x => x.name === d.name)?.id}` && d.key === undefined), names ?? 'no start');
  check('two encodes: 1920x1080 for the wide ones, 720x1280 for Instagram', req?.outputs.map(o => `${o.id} ${o.meta.width}x${o.meta.height}`).join(', ') === 'landscape 1920x1080, portrait 720x1280',
    req?.outputs.map(o => `${o.id} ${o.meta.width}x${o.meta.height}`).join(', '));
  // Waited for, not read at once: the encoders hand their configuration over
  // with their first output, which can land after the start has been
  // answered. Read at once, a loaded runner saw "0 configurations" (CI on
  // #619, 2026-10-31; and here beside four other checks), a line about keys
  // failing on how soon the first frame was encoded.
  const configs = (await until(page, () => window.__liveStub.calls.configs.length > 0 && window.__liveStub.calls.configs)) || [];
  check('no key crossed with the start or the encoders\' configuration', !!req && configs.length > 0 && !JSON.stringify(req).includes(SECRET) && !configs.join('').includes(SECRET),
    `${configs.length} configurations`);
  const packets = await until(page, () => window.__liveStub.calls.packets > 30 && window.__liveStub.calls, undefined, 20_000);
  check('the page\'s encoder is handing the bridge real packets, the first frame a keyframe', packets?.packets > 30 && packets.empty === 0 && packets.firstVideo === true,
    packets ? `${packets.packets} packets, ${packets.empty} empty, first frame a keyframe ${packets.firstVideo}` : 'none');

  // ── The phone ───────────────────────────────────────────────────
  const remote = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  remote.on('pageerror', e => errors.push(`remote: ${e.message}`));
  await remote.goto(`${BASE}/?remote=1&key=${KEY}`, { waitUntil: 'networkidle' });
  const onDraw = await until(remote, () => document.querySelector('[data-testid="remote-live"]')?.textContent);
  const secs = (t) => { const m = /Live\s*(\d+):(\d\d)/.exec(String(t)); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  await remote.waitForTimeout(2500);
  const onDrawLater = await remote.evaluate(() => document.querySelector('[data-testid="remote-live"]')?.textContent);
  check('the phone\'s Draw says the show is live, its clock running, and nothing wrong yet', secs(onDraw) !== null && secs(onDrawLater) >= secs(onDraw) + 2 && !String(onDrawLater).includes('!'),
    `${onDraw} then ${onDrawLater}`);
  await remote.screenshot({ path: 'scratch/liveshow-draw.png' }).catch(() => {});

  await page.evaluate(() => { window.__liveStub.health.kbps = 8000; window.__liveStub.health.by.Instagram = { dropping: true }; });
  const dropping = await until(page, () => !!document.querySelector('[data-testid="live-dropping"]') && [...document.querySelectorAll('[data-testid^="live-health-"]')].map(e => e.getAttribute('data-dropping')).join(' '));
  check('a destination dropping frames is said in the panel, on its own line and no other', dropping === 'false false true', String(dropping));
  const trouble = await until(remote, () => document.querySelector('[data-testid="remote-live"]')?.textContent?.includes('!'));
  await page.evaluate(() => { window.__liveStub.health.by = {}; });
  const clear = await until(remote, () => document.querySelector('[data-testid="remote-live"]')?.textContent?.includes('!') === false);
  check('and the phone marks it while it lasts', !!trouble && !!clear, `marked ${!!trouble}, cleared after ${!!clear}`);

  await remote.getByTestId('draw-controls').tap();
  const chip = remote.getByTestId('remote-live');
  await until(remote, () => !!document.querySelector('[data-testid="remote-transport"] [data-testid="remote-live"]'));
  await remote.screenshot({ path: 'scratch/liveshow-controls.png' }).catch(() => {});
  await chip.tap();
  await remote.waitForTimeout(400);
  const armedPhone = await chip.getAttribute('data-armed');
  const stopsAfterOne = await page.evaluate(() => window.__liveStub.calls.stop);
  check('on Controls one tap only asks to stop', armedPhone === 'true' && stopsAfterOne === 0, `armed ${armedPhone}, ${stopsAfterOne} stops`);
  await chip.tap();
  const stopped = await until(page, () => document.querySelector('[data-testid="live-show"]')?.getAttribute('data-phase') === 'stopped');
  const gone = await until(remote, () => document.querySelector('[data-testid="remote-live"]') === null);
  const stops = await page.evaluate(() => window.__liveStub.calls.stop);
  check('the second ends the stream on the Mac, once, and the phone stops saying live', !!stopped && stops === 1 && gone, `panel stopped ${!!stopped}, ${stops} stops, phone chip gone ${gone}`);

  // ── What the stream measured ────────────────────────────────────
  const up1 = await page.getByTestId('live-upload').evaluate(e => ({ level: e.dataset.level, text: e.textContent }));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('chromaglass.live.upload') ?? 'null'));
  check('the stream measured the upload it carried: three at 8 Mb/s, keeping up, is enough', stored?.heldKbps === 24000 && up1.level === 'ok', `${JSON.stringify(stored)}; "${up1.text}"`);

  // ── Test goes only to the test destination; a full link warns ───
  await page.evaluate(() => Object.assign(window.__liveStub.health, { kbps: 3000, secondsBehind: 1.6, measuredAt: 'server' }));
  await page.getByTestId('live-test').click();
  const testing = await until(page, () => document.querySelector('[data-testid="live-show"]')?.getAttribute('data-test') === 'true' && document.querySelector('[data-testid="live-show"]')?.getAttribute('data-phase') === 'live');
  const treq = await page.evaluate(() => window.__liveStub.calls.start[1]);
  check('Test starts at once, to the test destination only', testing && treq?.destinations.map(d => d.name).join() === 'Unlisted', treq?.destinations.map(d => d.name).join() ?? 'no start');
  await page.waitForTimeout(2500);
  await page.getByTestId('live-stop').click();
  await until(page, () => document.querySelector('[data-testid="live-show"]')?.getAttribute('data-phase') === 'stopped');
  const up2 = await page.getByTestId('live-upload').evaluate(e => ({ level: e.dataset.level, text: e.textContent }));
  check('a link that fell behind at 3 Mb/s warns that Go live\'s three will not fit', up2.level === 'short', `"${up2.text}"`);

  await page.screenshot({ path: 'scratch/liveshow-panel.png' }).catch(() => {});
  await remote.context().close();
} catch (e) {
  check('the run finished', false, String(e?.stack ?? e).split('\n').slice(0, 3).join(' | '));
} finally {
  await browser.close();
  stop(server);
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
finish();

function finish() {
  console.log(`\n${total - failed}/${total} passed`);
  process.exit(failed ? 1 : 0);
}

/*
  --stack: the Mixer stack source (PLAN.md 37x-4d-1), written ahead of the
  build for the Antigravity brief of 2026-10-31, red on main by design; CI
  runs it as `npm run liveshow -- --stack --owed=plate,stack` until the PRs
  that fix them take each id out of `--owed`. An owed line is excused only in
  the state it is owed for (below); an owed line that passes is a failure, so
  it cannot stay excused once it holds, and an id this file does not know is
  one too.

  What was wrong (37x-4c's found item): the panel streams #liquid-canvas,
  and with a projector set up that canvas carries the projector's pass, the
  wall's keystone, masks and warp, so a stream of a show with a keystone on
  the wall is a skewed picture. The source to offer is the same stack drawn
  without the wall's geometry, at the stream's size.

  And found writing this (PLAN.md 37x-4d-6): the stream's frames are black.
  lib/liveStream.ts draws #liquid-canvas onto its staging canvas on its own
  clock, and a presented WebGPU canvas read outside the frame task that drew
  it answers black, not an error (CastDisplay.tsx and LiquidVisualizer.tsx
  say so, and are why the projector window and the pad's picture are copied
  inside that task). On SwiftShader, 2026-10-31: the plate read in its frame
  was the film with the keystone, and the Plate source's decoded frame
  (0, 0, 0) in every cell.

  The film is the browser's fake camera playing a file written here
  (scripts/liveshowstack.mjs says why each part): a green band across its top
  third, a blue left half and an orange right half below, a white bar
  crossing the bottom third every 1.5 s. Started from Settings, Film, Camera
  as `wall` does, with every other row of the stack at 0 so the picture is
  the film alone, and the film's own Brightness at 0.8 so the picture is the
  mixer's graded film and not the camera. The wall gets a keystone (its top
  edge pulled in a fifth from each side). Then the lines, each frame as a
  16 x 9 grid of mean colours:

    control  the plate read in the frame task that drew it (`grabFrame`, as
             every harness that photographs the app reads it): the film the
             right way up and round, and the keystone's black wedges in the
             two top corners. So the scene is what it says before any stream
             is asked about it, and "square" below cannot pass on a wall with
             no keystone.
    decodes  (never owed) each stream, to one 16:9 destination through the
             stand-in bridge, went live and Chromium's own decoder made
             1920 x 1080 frames of it, as a viewer's player would.
    plate    the Plate source (today's, the default): the same picture as the
             control, the film with the keystone, dark corners where the
             control has them, colours within 50 of its. Owed only while its
             frames decode black, today's fault; any other wrong picture is red.
    stack    the Mixer stack source, chosen in the panel's Source
             (`data-testid="live-source"`, a select, values `plate` and
             `stack`, `plate` the default): the film the right way up and
             round, the control's colours, no corner dark and every cell of
             both edge columns the film's (no wedge, no pillarbox): square.
             Owed only while the panel has no Source choice.
    moving   on a Mac, each stream's bar is somewhere else between its first
             and last frames decoded, a second or more apart, so a stream that
             sent one frame for ever is red. Skipped in software, which draws
             a few frames a minute.

  Needs WebGPU (the projector's pass is src/gpu/output.ts): a Mac, or
  `PW_WEBGPU=1` on Linux, where it presents into Xvfb at a few frames a
  minute (about three and a half minutes in a cloud session). The panel's
  other lines are the run without --stack.
*/
async function stackLines() {
  const OWED_IDS = ['plate', 'stack'];
  const flag = process.argv.find(a => a.startsWith('--owed='));
  const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
  const unknown = [...owed].filter(id => !OWED_IDS.includes(id));
  if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${OWED_IDS.join(', ')})`);
  /**
   * Under --owed a line is excused only in the state it is owed for, which
   * the caller names (`excused`): the stream decoded and its picture is the
   * wrong one, or the panel has no Source choice. A stream that never went
   * live or never decoded is red on the line before, which is never owed; an
   * owed line that passes is red until its id is taken out.
   */
  const due = (id, name, ok, detail, excused) => {
    if (!owed.has(id)) return check(name, ok, detail);
    if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
    if (!excused) return check(name, false, detail);
    console.log(` owed ${name} — ${detail}`);
  };
  /** Never owed: the stream went live and Chromium decoded 1920 x 1080 frames from it. */
  const decoded = (which, f) => {
    const ok = !!f && !f.error && f.w === 1920 && f.h === 1080 && f.frames >= 1;
    check(`the ${which} stream went live and decodes, 1920x1080`, ok,
      ok ? `${f.frames} frames decoded from ${f.packets} packets over ${(f.spanMs / 1000).toFixed(2)} s` : (f?.error ?? `${f?.w}x${f?.h}`));
    return ok;
  };
  /*
    And moving. A stream that copied one frame at Go live and sent it again
    for ever (the frame task's fault family) would pass every picture line, so
    on a Mac the film's bar has to have moved between the first and the last
    frame decoded, at least a second apart. Not in software: there the plate
    draws a few frames a minute, the stream sends the last one again, and a
    still bar is the plate's pace, not the stream's.
  */
  const moving = (which, f, id) => {
    if (presentsInXvfb()) { console.log(` skip  the ${which} stream moves with the film: software WebGPU draws a few frames a minute`); return true; }
    const a = barColumn(f?.first), b = barColumn(f);
    const ok = a !== null && b !== null && a !== b && f.spanMs >= 1000;
    due(id, `the ${which} stream moves with the film: its bar is somewhere else a second later`, ok,
      `bar at column ${a} then ${b}, ${(f?.spanMs / 1000).toFixed(2)} s apart`, ok === false && f?.blackStream === true);
    return ok;
  };
  const STACK_LINE = 'with a film in the mixer and a keystone on the wall, the Mixer stack source\'s frames carry the film and are square';

  const page = await open(null);
  const gpu = await page.evaluate(async () => !!(await navigator.gpu?.requestAdapter?.()));
  check('a WebGPU adapter, which the projector\'s pass needs', gpu, gpu ? '' : 'none: run on a Mac, or with PW_WEBGPU=1');
  if (!gpu) return;
  check('the Mac app offers the panel', await dock(page));
  await until(page, () => !!document.querySelector('[data-testid="live-show"]'));
  const shown = await until(page, () => (window.chromaglassDebug?.()?.webgpu?.frames ?? 0) > 2, undefined, 240_000);
  check('the show is drawing', !!shown);

  // The film alone, as `wall`'s film source is: every other row at 0.
  await page.getByTestId('open-all-settings').click();
  await page.getByTestId('settings-nav-film').click();
  await page.getByTestId('film-camera').click();
  const playing = await until(page, () => {
    const v = window.chromaglassDebug?.().film?.video;
    return window.chromaglassDebug?.().film?.kind === 'camera' && !!v && v.readyState >= 2 && v.videoWidth > 0;
  }, undefined, 30_000);
  await page.keyboard.press('Escape');
  // The film's own Brightness at 0.8, a grade the mixer applies: measured in
  // software, the plate's blue half (1, 63, 151) where at 1 it was (3, 105,
  // 251), so a source that drew the camera itself and not the mixer's film is
  // 100 too bright in blue, past `same`'s 50.
  const alone = { camera: 0, stock: 0, frontLevel: 0, backLevel: 0, ledLevel: 0, gelWheel: 0, lumia: 0, markMix: 0, lampGround: 0, filmMix: 1, filmBright: 0.8 };
  if ((await page.evaluate(() => window.chromaglassSettings?.()?.filmBlend)) === 'multiply') alone.filmBlend = 'add';
  await page.evaluate((p) => window.chromaglassSettings?.(p), alone);
  const settled = await until(page, (p) => {
    const now = window.chromaglassSettings?.();
    return !!now && Object.entries(p).every(([k, v]) => now[k] === v);
  }, alone);
  check('a film playing, alone in the stack', !!playing && !!settled, `film playing ${!!playing}, rows set ${!!settled}`);

  // The keystone, and drawn with: the render loop is holding it.
  await page.evaluate((c) => window.chromaglassOutput?.(c), STACK_KEYSTONE);
  const keyed = await until(page, (c) => {
    const live = window.chromaglassDebug?.().outputConfig;
    return !!live && live.corners.every((v, i) => Math.abs(v - c.corners[i]) < 1e-6);
  }, STACK_KEYSTONE);
  check('a keystone on the wall', !!keyed, JSON.stringify(STACK_KEYSTONE.corners));

  // One 16:9 destination, and a stream of it, its last frame decoded.
  await page.getByTestId('live-add').click();
  await page.getByTestId('live-add-service').selectOption('youtube');
  await page.getByTestId('live-add-key').fill(SECRET);
  await page.getByTestId('live-add-save').click();
  await page.waitForTimeout(250);
  const stream = async () => {
    await page.evaluate(() => { const c = window.__liveStub.calls; c.keep = true; c.video = []; });
    // Go live asks once more (the panel's lines above) and forgets the ask
    // after five seconds, which a software plate's page, a few frames a
    // minute, can spend between two of Playwright's presses: so both presses
    // from inside the page, the second as soon as the button asks.
    await page.evaluate(async () => {
      const go = () => document.querySelector('[data-testid="live-go"]');
      go()?.click();
      const t0 = performance.now();
      while (!/again/i.test(go()?.textContent ?? '') && performance.now() - t0 < 4000) await new Promise(r => setTimeout(r, 20));
      go()?.click();
    });
    const live = await until(page, () => document.querySelector('[data-testid="live-show"]')?.getAttribute('data-phase') === 'live', undefined, 90_000);
    if (!live) {
      const said = await page.evaluate(() => ({ phase: document.querySelector('[data-testid="live-show"]')?.getAttribute('data-phase'), starts: window.__liveStub.calls.start.length, text: document.querySelector('[data-testid="live-show"]')?.textContent?.slice(150, 700), go: document.querySelector('[data-testid="live-go"]')?.textContent }));
      return { error: `the stream did not go live: ${JSON.stringify(said)}` };
    }
    // Two keyframes in: the stream asks for one every two seconds, and the
    // frames after the second are of a canvas drawn since Go live.
    await until(page, () => window.__liveStub.calls.video.filter(v => v.key).length >= 2, undefined, 60_000);
    await page.getByTestId('live-stop').click();
    await until(page, () => document.querySelector('[data-testid="live-show"]')?.getAttribute('data-phase') === 'stopped');
    return page.evaluate(async () => {
      const { video, desc } = window.__liveStub.calls;
      window.__liveStub.calls.keep = false;
      const pk = video.filter(v => v.output === 'landscape');
      // From the latest keyframe at least 1.2 s before the last packet, or the
      // first keyframe there is: a first and a last frame a second or more
      // apart where the stream ran that long.
      const end = pk.length ? pk[pk.length - 1].ts : 0;
      let k = -1;
      for (let i = 0; i < pk.length; i++) if (pk[i].key && (k < 0 || pk[i].ts <= end - 1200)) k = i;
      const d = desc.landscape;
      if (k < 0 || !d) return { error: `${pk.length} packets, ${k < 0 ? 'no keyframe' : 'no decoder configuration'}` };
      const hex = (n) => n.toString(16).padStart(2, '0');
      let first = null, last = null, firstTs = 0, lastTs = 0, n = 0, error = null;
      const dec = new VideoDecoder({
        output: (f) => { n++; if (!first) { first = f; firstTs = f.timestamp; return; } last?.close(); last = f; lastTs = f.timestamp; },
        error: (e) => { error = String(e); },
      });
      dec.configure({ codec: `avc1.${hex(d[1])}${hex(d[2])}${hex(d[3])}`, description: d });
      for (const p of pk.slice(k)) dec.decode(new EncodedVideoChunk({ type: p.key ? 'key' : 'delta', timestamp: Math.round(p.ts * 1000), data: p.data }));
      await dec.flush().catch((e) => { error ??= String(e); });
      if (!first) return { error: error ?? 'nothing decoded' };
      if (!last) { last = first; lastTs = firstTs; first = null; }
      const gridOf = (frame) => {
        const w = frame.displayWidth, h = frame.displayHeight;
        const c = new OffscreenCanvas(w, h);
        const x = c.getContext('2d');
        x.drawImage(frame, 0, 0);
        frame.close();
        const px = x.getImageData(0, 0, w, h).data;
        const cols = 16, rows = 9, grid = [];
        for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
          const x0 = Math.floor((gx * w) / cols), x1 = Math.floor(((gx + 1) * w) / cols);
          const y0 = Math.floor((gy * h) / rows), y1 = Math.floor(((gy + 1) * h) / rows);
          let r = 0, g = 0, b = 0, m = 0;
          for (let y = y0; y < y1; y += 2) for (let xx = x0; xx < x1; xx += 2) { const i = (y * w + xx) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; m++; }
          grid.push([r / m, g / m, b / m]);
        }
        return { w, h, cols, rows, grid };
      };
      const out = { ...gridOf(last), frames: n, packets: pk.length, spanMs: (lastTs - firstTs) / 1000 };
      out.first = first ? gridOf(first) : out;
      return out;
    });
  };

  // The plate itself, read in the frame task that drew it (`grabFrame`, the
  // one moment a presented WebGPU canvas can be read): the film, keystoned.
  // So the scene is set before any stream is asked about it.
  const shot = await page.evaluate(() => window.__cgFrame(320, 180));
  const seen = shot ? gridOfPixels(shot, 320, 180) : { error: JSON.stringify(await page.evaluate(() => window.__cgFrameLast)) };
  const g = stackJudge(seen);
  check('control: the plate, read in its own frame, is the film with the wall\'s keystone on it, black in two corners', g.film && g.keystoned, g.detail);

  // Owed while it decodes and is black, today's fault (37x-4d-6, on Metal and
  // in software alike); any other wrong picture is red.
  const blackOf = (f) => !!f?.grid && f.grid.every(c => Math.max(...c) < 8);
  const plate = await stream();
  plate.blackStream = blackOf(plate);
  if (decoded('Plate source\'s', plate)) {
    const p = stackJudge(plate, seen);
    due('plate', 'the Plate source\'s frames are the plate: the film, with the wall\'s keystone on it as the canvas has it', p.film && p.keystoned && p.same, p.detail, plate.blackStream);
    moving('Plate source\'s', plate, 'plate');
  }

  const choice = await page.getByTestId('live-source').count();
  if (!choice) { due('stack', STACK_LINE, false, 'the panel has no Source choice yet (data-testid="live-source")', true); return; }
  await page.getByTestId('live-source').selectOption('stack');
  const stack = await stream();
  if (decoded('Mixer stack source\'s', stack)) {
    const s = stackJudge(stack, seen);
    due('stack', STACK_LINE, s.film && s.square && s.same, s.detail, false);
    moving('Mixer stack source\'s', stack, 'stack');
  }
  await page.getByTestId('live-source').selectOption('plate');
}
