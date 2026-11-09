#!/usr/bin/env node
/**
 * The Android TV app's two jobs on the network (PLAN 12-tv-2): finding the
 * Mac by Bonjour, and joining it by four digits the laptop allows.
 *
 *   npm run tvpair                # builds, then about thirty seconds
 *   npm run tvpair -- --head      # watch the TV page pair
 *
 * The app itself (androidtv/) is a WebView on the show's `/tv` page plus
 * NsdManager; its own build, unit tests and lint are the "Android TV app"
 * workflow. What it relies on from the show is held here, against the real
 * show server:
 *
 *   advert        a TV's question for `_chromaglass._tcp` (asked as Android's
 *                 NsdManager asks, to the multicast group, and as a one-shot
 *                 question to the server's address) is answered with the show
 *                 server's port, the TV page's path and the show's random id,
 *                 the same id the TV file keeps; the show key is nowhere in
 *                 the answer; a malformed packet does not stop the advert
 *   pairing       a TV with no key gets four digits and the laptop's page is
 *                 shown the same four; while it waits, nothing it sends
 *                 reaches the laptop; a phone remote cannot allow it; Allow
 *                 hands it a key of its own and it is in (the laptop hears
 *                 it join); a pair ask with a wrong show key is still a wrong key
 *   kept          that key, on a fresh socket, is let in with nothing asked,
 *                 and still after the show server restarts (and the advert's
 *                 id is the same after the restart)
 *   unknown key   a TV key the show does not hold is told `unpaired`, three
 *                 times over, and the address is not locked out for it
 *   forget        Forget turns the paired TV away at once and its key stops working
 *   asking twice  a second ask from the same TV replaces the first
 *   no            No turns the TV away; three Nos lock its address out
 *   rules         the pairing module alone: four asks at most, never two
 *                 with the same digits, an ask gone after two minutes, keys
 *                 kept in a file only the owner can read
 *   the page      the built /tv page with no key shows the digits the laptop
 *                 sees, keeps the key it is handed (and gives it to the TV
 *                 app's bridge), joins with it after a reload without asking;
 *                 a forgotten key in the URL is dropped and the page pairs again
 *   the card      the laptop's card and cast-menu rows (CastNetworkItems.tsx):
 *                 the digits, Allow and No answering that ask, Forget with a
 *                 count; on a phone-width window nothing runs off the side
 *   phone         the pairing digits on a phone held upright fit the screen
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import dgram from 'node:dgram';
import { WebSocket } from 'ws';
import { build } from 'esbuild';
import { launchChromium, port } from './chromium.mjs';
import { browse, decodeMessage, encodeMessage, MDNS_PORT } from '../server/bonjour.js';
import { createTvPairing, PAIR_MAX, PAIR_MS } from '../server/tv-pairing.js';

const PORT = port(4243, 'TVPAIR_PORT');
// Eight digits nobody would find by accident in a packet, so "not in the answer" means something.
const KEY = '58213947';
const HEADED = process.argv.includes('--head');
const DIR = mkdtempSync(join(tmpdir(), 'tvpair-'));
const TV_FILE = join(DIR, 'tvs.json');

let failed = 0, total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ── Rules: the pairing module alone ────────────────────────────────────
{
  let now = 1_000_000;
  const file = join(DIR, 'rules.json');
  const p = createTvPairing({ file, now: () => now });
  const asks = [];
  for (let i = 0; i < PAIR_MAX; i++) asks.push(p.ask({ n: i }, `10.0.0.${i + 1}`));
  const codes = new Set(asks.map(a => a.code));
  check(`rules: ${PAIR_MAX} asks wait at once, each with its own four digits`, asks.every(a => /^\d{4}$/.test(a.code ?? '')) && codes.size === PAIR_MAX, [...codes].join(' '));
  check('rules: one more is turned away as busy', p.ask({ n: 9 }, '10.0.0.99').busy === true);
  now += PAIR_MS + 1;
  check('rules: after two minutes every ask is gone, handed back to be closed', p.expire().length === PAIR_MAX && p.list().length === 0);
  const a = p.ask({ n: 10 }, '10.0.0.7');
  const ok = p.allow(a.id);
  check('rules: Allow makes a TV key, kept by the show', /^tv-[0-9a-f]{32}$/.test(ok?.key ?? '') && p.isTvKey(ok.key) && p.paired() === 1, ok?.key);
  check('rules: the show key\'s shape, or a near miss, is never a TV key', !p.isTvKey(KEY) && !p.isTvKey(`${ok.key}0`) && !p.isTvKey(ok.key.toUpperCase()) && !p.isTvKey(null));
  const again = createTvPairing({ file });
  check('rules: a fresh start keeps the key and the show id', again.isTvKey(ok.key) && again.showId() === p.showId() && /^[0-9a-f]{16}$/.test(p.showId()), p.showId());
  check('rules: the file is the owner\'s alone (mode 600)', (statSync(file).mode & 0o777) === 0o600, (statSync(file).mode & 0o777).toString(8));
  check('rules: the file holds no show key', !readFileSync(file, 'utf8').includes(KEY));
  p.forget();
  check('rules: Forget empties it', !p.isTvKey(ok.key) && p.paired() === 0 && !createTvPairing({ file }).isTvKey(ok.key));
}

// ── The show server ────────────────────────────────────────────────────
let server = null;
let serverSaid = '';
let startedAt = 0;
async function startServer() {
  serverSaid = '';
  server = spawn(process.execPath, ['server/remote-server.js'], {
    env: { ...process.env, PORT: String(PORT), SHOW_KEY: KEY, OSC_PORT: '0', CHROMAGLASS_TV_FILE: TV_FILE, CHROMAGLASS_BONJOUR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  await new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('the show server did not start')), 30_000);
    server.stdout.on('data', d => { serverSaid += String(d); if (serverSaid.includes('Same Wi-Fi') || /No LAN address/.test(serverSaid)) { clearTimeout(bail); resolve(); } });
    server.stderr.on('data', d => { serverSaid += String(d); });
    server.on('exit', c => { clearTimeout(bail); reject(new Error(`the show server exited ${c}: ${serverSaid.slice(0, 300)}`)); });
  });
  startedAt = Date.now();
  await wait(300);
}
const stopServer = async () => {
  if (!server) return;
  const s = server;
  server = null;
  s.removeAllListeners('exit');
  const gone = new Promise(r => s.once('exit', r));
  try { process.kill(-s.pid, 'SIGTERM'); } catch { s.kill('SIGTERM'); }
  await Promise.race([gone, wait(5000)]);
};
process.on('exit', () => { try { if (server) process.kill(-server.pid, 'SIGTERM'); } catch { /* gone */ } rmSync(DIR, { recursive: true, force: true }); });
await startServer();

const info = await (await fetch(`http://127.0.0.1:${PORT}/remote-info.json`)).json();
const LAN = info.hosts?.[0] ?? null;
check('the TVs reach the show at its network address', LAN !== null, LAN ?? 'no LAN address on this machine: pairing cannot be tried as a stranger would');
if (!LAN) { console.log(`\n${total - failed}/${total} passed`); process.exit(1); }

// ── Advert ─────────────────────────────────────────────────────────────
{
  const kept = JSON.parse(readFileSync(TV_FILE, 'utf8'));
  const raw = [];
  const tap = (to) => new Promise((done) => {
    // The raw answer, to look for the show key in every byte of it.
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    s.on('message', (b) => raw.push(b));
    s.bind(0, () => { s.send(encodeMessage({ id: 7, questions: [{ name: '_chromaglass._tcp.local', type: 12 }] }), MDNS_PORT, to, () => {}); setTimeout(() => { s.close(); done(); }, 800); });
  });
  const ours = (list) => list.find(f => f.port === PORT);
  const one = ours(await browse({ ms: 1200, to: '127.0.0.1' }));
  check('advert: a one-shot question is answered with the show server\'s port and the TV page\'s path',
    one?.port === PORT && one?.txt?.path === '/tv' && /^ChromaGlass on /.test(one?.instance ?? ''), JSON.stringify(one ?? null));
  check('advert: its id is the show\'s random id from the TV file', one?.txt?.id === kept.id && /^[0-9a-f]{16}$/.test(kept.id), `${one?.txt?.id} vs ${kept.id}`);
  check('advert: the address it gives is the one a TV reaches', (one?.addresses ?? []).includes(LAN), (one?.addresses ?? []).join(', '));
  // The advert announces itself at 0, 1 and 3 seconds after the start; an
  // announcement heard while asking would pass for an answer (found in
  // review: with group questions ignored this still passed). So past them,
  // a quiet listen first must hear nothing, and then the question an answer.
  await wait(Math.max(0, startedAt + 4000 - Date.now()));
  const quiet = ours(await browse({ ms: 1200, ask: false }));
  check('advert: (unasked, past its announcements, it says nothing)', quiet === undefined, JSON.stringify(quiet ?? null));
  const group = ours(await browse({ ms: 1500 }));
  check('advert: asked as NsdManager asks (to the multicast group), it answers the same', group?.port === PORT && group?.txt?.id === kept.id && (group?.addresses ?? []).includes(LAN), JSON.stringify(group ?? null));
  await tap('127.0.0.1');
  check('advert: the show key is nowhere in the answer', raw.length > 0 && raw.every(b => !b.includes(KEY)), `${raw.length} answers read`);
  const parsed = raw[0] ? decodeMessage(raw[0]) : null;
  check('advert: a one-shot answer carries the question\'s id and short TTLs', parsed?.id === 7 && parsed.records.every(r => r.ttl <= 10), parsed ? `${parsed.records.length} records` : 'no answer');
  // Garbage, a truncated question and a pointer loop: the advert must shrug them off.
  const junk = dgram.createSocket('udp4');
  const loop = Buffer.from([0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0xc0, 12, 0, 12, 0, 1]);
  for (const b of [Buffer.from('not dns at all'), Buffer.from([0, 1, 0, 0, 0, 5]), loop]) junk.send(b, MDNS_PORT, '127.0.0.1');
  await wait(300);
  junk.close();
  check('advert: malformed packets do not stop it', ours(await browse({ ms: 1000, to: '127.0.0.1' }))?.port === PORT);
}

// ── Raw sockets: a laptop, phones and TVs ──────────────────────────────
/** A socket that keeps every message it hears, with a wait for the next of a type. */
function client(host, hello) {
  const ws = new WebSocket(`ws://${host}:${PORT}/remote-ws`);
  const heard = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    heard.push(m);
    for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.done(m); }
  });
  const c = {
    ws, heard,
    open: new Promise((r, j) => { ws.on('open', () => { if (hello) ws.send(JSON.stringify(hello)); r(); }); ws.on('error', j); }),
    closed: new Promise(r => ws.on('close', r)),
    next(test, ms = 4000) {
      const found = heard.find(test);
      if (found) return Promise.resolve(found);
      return new Promise((done) => { const w = { test, done }; waiters.push(w); setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); done(null); } }, ms); });
    },
    send: (m) => ws.send(JSON.stringify(m)),
    close: () => ws.close(),
  };
  c.open.catch(() => {});
  return c;
}
const isType = (t) => (m) => m.type === t;
const asksNow = (laptop) => [...laptop.heard].reverse().find(isType('tv-pairing'));
const until = async (fn, ms = 4000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await wait(50); } };

let laptop = client('127.0.0.1', { type: 'hello', role: 'display', key: info.displayKey });
await laptop.open;
const first = await laptop.next(isType('tv-pairing'));
check('pairing: the laptop hears who asks on hello (nobody yet)', first?.asks?.length === 0 && first?.paired === 0, JSON.stringify(first));

let tvKey = null;
{
  const tv = client(LAN, { type: 'hello', role: 'tv', pair: true });
  const code = await tv.next(isType('tv-code'));
  check('pairing: a TV with no key is given four digits', /^\d{4}$/.test(code?.code ?? ''), code?.code);
  const seen = await until(() => asksNow(laptop)?.asks?.find(a => a.code === code?.code));
  check('pairing: the laptop is shown the same four', !!seen, JSON.stringify(asksNow(laptop)));
  const before = laptop.heard.length;
  tv.send({ type: 'patch', settings: { viscosity: 0.9 } });
  tv.send({ type: 'tv-signal', signal: { kind: 'answer', sdp: 'x' } });
  tv.send({ type: 'tv-allow', id: seen?.id });
  await wait(400);
  check('pairing: while it waits, nothing it sends reaches the laptop (nor can it allow itself)', laptop.heard.slice(before).every(m => m.type === 'tv-pairing') && !tv.heard.some(isType('tv-key')),
    laptop.heard.slice(before).map(m => m.type).join(',') || 'nothing');
  const phone = client(LAN, { type: 'hello', role: 'controller', key: KEY });
  await phone.open;
  // In first, or a phone turned away would "fail to allow" for the wrong reason (found in review).
  const phoneIn = await laptop.next((m) => m.type === 'controllers' && m.count >= 1);
  phone.send({ type: 'tv-allow', id: seen?.id });
  await wait(400);
  check('pairing: a phone remote, let in, cannot allow it', !!phoneIn && !tv.heard.some(isType('tv-key')) && asksNow(laptop)?.asks?.length === 1, phoneIn ? 'the phone was in' : 'the phone never got in');
  phone.close();
  laptop.send({ type: 'tv-allow', id: seen?.id });
  const key = await tv.next(isType('tv-key'));
  const show = await tv.next(isType('tv-show'));
  const join = await laptop.next(isType('tv-join'));
  tvKey = key?.key ?? null;
  check('pairing: Allow hands the TV a key of its own, and it is in', /^tv-[0-9a-f]{32}$/.test(tvKey ?? '') && show?.here === true && !!join, `key ${tvKey ? 'tv-…' : 'none'}, show ${JSON.stringify(show)}, join ${JSON.stringify(join)}`);
  const after = await until(() => { const m = asksNow(laptop); return m && m.asks.length === 0 && m.paired === 1 ? m : null; });
  check('pairing: the laptop\'s list empties and counts one paired TV', !!after, JSON.stringify(asksNow(laptop)));
  check('pairing: the key is kept in the TV file', readFileSync(TV_FILE, 'utf8').includes(tvKey ?? '!'));
  tv.close();
  await tv.closed;
  const wrong = client(LAN, { type: 'hello', role: 'tv', pair: true, key: '00000000' });
  const no = await wrong.next(isType('denied'));
  check('pairing: an ask with a wrong show key is still a wrong key', no?.reason === 'key', JSON.stringify(no));
  await wrong.closed;
}

// ── Kept ───────────────────────────────────────────────────────────────
async function joinsWithKey(key) {
  const tv = client(LAN, { type: 'hello', role: 'tv', key });
  const m = await tv.next((x) => x.type === 'tv-show' || x.type === 'denied' || x.type === 'tv-code');
  return { tv, m };
}
{
  const { tv, m } = await joinsWithKey(tvKey);
  check('kept: the key on a fresh socket is let in with nothing asked', m?.type === 'tv-show' && !tv.heard.some(isType('tv-code')), JSON.stringify(m));
  tv.close();
  const idBefore = JSON.parse(readFileSync(TV_FILE, 'utf8')).id;
  laptop.close();
  await stopServer();
  await startServer();
  const r = await joinsWithKey(tvKey);
  check('kept: and after the show server restarts', r.m?.type === 'tv-show', JSON.stringify(r.m));
  r.tv.close();
  const ad = (await browse({ ms: 1200, to: '127.0.0.1' })).find(f => f.port === PORT);
  check('kept: the advert\'s id is the same after the restart', ad?.txt?.id === idBefore, `${ad?.txt?.id} vs ${idBefore}`);
  laptop = client('127.0.0.1', { type: 'hello', role: 'display', key: (await (await fetch(`http://127.0.0.1:${PORT}/remote-info.json`)).json()).displayKey });
  await laptop.open;
  await laptop.next(isType('tv-pairing'));
}

// ── Unknown key ────────────────────────────────────────────────────────
{
  const reasons = [];
  for (let i = 0; i < 4; i++) {
    const { tv, m } = await joinsWithKey(`tv-${String(i).repeat(32)}`);
    reasons.push(m?.reason ?? m?.type);
    tv.close();
  }
  check('unknown key: a TV key the show does not hold is told unpaired, every time', reasons.every(r => r === 'unpaired'), reasons.join(','));
  const { tv, m } = await joinsWithKey(KEY);
  check('unknown key: and the address is not locked out for it', m?.type === 'tv-show', JSON.stringify(m));
  tv.close();
}

// ── Forget ─────────────────────────────────────────────────────────────
{
  const { tv, m } = await joinsWithKey(tvKey);
  check('forget: (the paired TV is watching)', m?.type === 'tv-show');
  laptop.send({ type: 'tv-forget' });
  const gone = await tv.next(isType('denied'));
  check('forget: the paired TV is turned away at once, told unpaired', gone?.reason === 'unpaired', JSON.stringify(gone));
  const again = await joinsWithKey(tvKey);
  check('forget: its key no longer works', again.m?.reason === 'unpaired', JSON.stringify(again.m));
  const counted = await until(() => asksNow(laptop)?.paired === 0);
  check('forget: the laptop counts none paired', !!counted);
}

// ── Asking twice ───────────────────────────────────────────────────────
{
  const a = client(LAN, { type: 'hello', role: 'tv', pair: true });
  await a.next(isType('tv-code'));
  const b = client(LAN, { type: 'hello', role: 'tv', pair: true });
  const bc = await b.next(isType('tv-code'));
  const aGone = await a.next(isType('denied'));
  const list = await until(() => { const m = asksNow(laptop); return m?.asks.length === 1 && m.asks[0].code === bc?.code ? m : null; });
  check('asking twice: the same TV asking again replaces its first ask', aGone?.reason === 'expired' && !!list, `${JSON.stringify(aGone)} ${JSON.stringify(asksNow(laptop))}`);
  b.close();
  await b.closed;
  const empty = await until(() => asksNow(laptop)?.asks.length === 0);
  check('asking twice: a TV that leaves while asking leaves the laptop\'s list', !!empty);
}

// ── The page and the card, in Chromium ─────────────────────────────────
const browser = await launchChromium(chromium, {
  headless: !HEADED,
  // Straight to the show server's LAN address (see scripts/tv.mjs).
  args: ['--autoplay-policy=no-user-gesture-required', '--no-proxy-server'],
});
const errors = [];
{
  // The laptop's raw socket answers each TV that joins with "no Home here",
  // so a page that got in shows that, and does not sit waiting for an offer.
  laptop.ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'tv-join') laptop.send({ type: 'tv-signal', to: m.id, signal: { kind: 'refused', reason: 'tier' } });
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { window.ChromaglassTv = { paired(k) { window.__paired = k; }, forget() { window.__forgot = (window.__forgot ?? 0) + 1; } }; });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`tv: ${e.message}`));
  await page.goto(`http://${LAN}:${PORT}/tv?app=android`);
  const state = () => page.getAttribute('[data-testid="tv-page"]', 'data-state').catch(() => null);
  await page.waitForSelector('[data-testid="tv-pair-code"]', { timeout: 15_000 }).catch(() => {});
  const shown = await page.textContent('[data-testid="tv-pair-code"]').catch(() => null);
  const ask = await until(() => asksNow(laptop)?.asks?.find(a => a.code === shown));
  check('the page: with no key it shows the four digits the laptop sees', /^\d{4}$/.test(shown ?? '') && !!ask, `${shown} vs ${JSON.stringify(asksNow(laptop)?.asks)}`);
  laptop.send({ type: 'tv-allow', id: ask?.id });
  let s = null;
  for (let i = 0; i < 80 && s !== 'tier'; i++) { await wait(100); s = await state(); }
  const stored = await page.evaluate(() => ({ kept: localStorage.getItem('chromaglass.tvKey'), bridge: window.__paired ?? null }));
  check('the page: Allowed, it is in (the laptop answered it)', s === 'tier', s);
  check('the page: it keeps the key, and gives it to the TV app', /^tv-[0-9a-f]{32}$/.test(stored.kept ?? '') && stored.bridge === stored.kept, JSON.stringify({ kept: !!stored.kept, same: stored.bridge === stored.kept }));
  const asksBefore = laptop.heard.filter(m => m.type === 'tv-pairing' && m.asks.length > 0).length;
  await page.reload();
  let s2 = null;
  for (let i = 0; i < 80 && s2 !== 'tier'; i++) { await wait(100); s2 = await state(); }
  const asksAfter = laptop.heard.filter(m => m.type === 'tv-pairing' && m.asks.length > 0).length;
  check('the page: after a reload it joins with the kept key, asking nothing', s2 === 'tier' && asksAfter === asksBefore && !(await page.$('[data-testid="tv-pair-code"]')), `${s2}, ${asksAfter - asksBefore} new asks`);
  await ctx.close();

  // The Android app puts its kept key in the URL; one this show forgot is dropped and the page pairs.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx2.addInitScript(() => { window.ChromaglassTv = { paired() {}, forget() { sessionStorage.setItem('forgot', String(Number(sessionStorage.getItem('forgot') ?? 0) + 1)); } }; });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errors.push(`tv: ${e.message}`));
  await p2.goto(`http://${LAN}:${PORT}/tv?app=android&key=tv-${'e'.repeat(32)}`);
  await p2.waitForSelector('[data-testid="tv-pair-code"]', { timeout: 15_000 }).catch(() => {});
  const url = p2.url();
  const forgot = await p2.evaluate(() => sessionStorage.getItem('forgot')).catch(() => null);
  check('the page: a forgotten key in the URL is dropped, the app told, and it pairs again',
    !url.includes('key=') && url.includes('app=android') && forgot === '1' && /^\d{4}$/.test((await p2.textContent('[data-testid="tv-pair-code"]').catch(() => '')) ?? ''), `${url} forgot=${forgot}`);
  // No from the laptop: the page says so and stays.
  const code2 = await p2.textContent('[data-testid="tv-pair-code"]').catch(() => null);
  const ask2 = await until(() => asksNow(laptop)?.asks?.find(a => a.code === code2));
  laptop.send({ type: 'tv-refuse', id: ask2?.id });
  let s3 = null;
  for (let i = 0; i < 40 && s3 !== 'refused'; i++) { await wait(100); s3 = await p2.getAttribute('[data-testid="tv-page"]', 'data-state').catch(() => null); }
  check('the page: No on the laptop and the TV says the computer said no', s3 === 'refused', s3);
  await ctx2.close();

  // A phone propped up: the digits fit.
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p3 = await ctx3.newPage();
  await p3.goto(`http://${LAN}:${PORT}/tv`);
  await p3.waitForSelector('[data-testid="tv-pair-code"]', { timeout: 15_000 }).catch(() => {});
  const fit = await p3.evaluate(() => {
    const r = document.querySelector('[data-testid="tv-pair-code"]')?.getBoundingClientRect();
    return r ? { left: r.left, right: r.right, width: innerWidth, scroll: document.documentElement.scrollWidth } : null;
  });
  check('phone: the pairing digits on a phone held upright fit the screen', !!fit && fit.left >= 0 && fit.right <= fit.width && fit.scroll <= fit.width, JSON.stringify(fit));
  await ctx3.close();
}

// ── The card ───────────────────────────────────────────────────────────
{
  const entry = `
    import { createRoot } from 'react-dom/client';
    import { createElement as h } from 'react';
    import { CastNetworkItems, TvAsks, tvAtHome } from './src/components/CastNetworkItems.tsx';
    window.__calls = [];
    // The app's own builder (what useRemote hands the card), with a send that records.
    const tv = (paired) => tvAtHome(1, { paired, asks: [{ id: 'ask7', code: '4821' }] }, (m) => window.__calls.push(JSON.stringify(m)));
    const relay = { chromaglass: 'relay', path: '/remote-ws', port: 3000, hosts: ['192.168.1.20'], key: null, displayKey: null };
    window.__render = (paired) => createRoot(document.getElementById('root')).render(h('div', null, h(TvAsks, { tv: tv(paired) }), h('div', { id: 'menu' }, h(CastNetworkItems, { relay, mirrorCount: 0, tv: tv(paired) }))));
  `;
  const js = (await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
  // The site's own built stylesheet, so the card is laid out as the app lays
  // it out (its width is a Tailwind class): without it, an unstyled block
  // would fit any window and the phone check would measure nothing.
  const { readdirSync } = await import('node:fs');
  const css = readdirSync('dist/assets').filter(f => f.endsWith('.css')).map(f => readFileSync(join('dist/assets', f), 'utf8')).join('\n');
  check('the card: (laid out with the built stylesheet)', css.includes('backdrop-blur') || css.length > 10_000, `${css.length} bytes`);
  for (const [w, label] of [[1280, 'the laptop'], [360, 'a phone-width window']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`card: ${e.message}`));
    await page.setContent(`<!doctype html><meta name=viewport content="width=device-width"><style>${css}</style><body style="margin:0;background:#000;color:#fff"><div id=root></div><script>${js}</script>`);
    await page.evaluate(() => window.__render(2));
    await page.waitForSelector('[data-testid="tv-asks"]', { timeout: 5000 }).catch(() => {});
    const rows = await page.$$eval('[data-testid="tv-ask"]', (els) => els.map(e => e.getAttribute('data-code')));
    if (w === 1280) {
      check('the card: the ask is on the card and in the cast menu, with its digits', rows.length === 2 && rows.every(c => c === '4821'), rows.join(','));
      await page.click('[data-testid="tv-asks"] [data-testid="tv-allow"]');
      await page.click('#menu [data-testid="tv-refuse"]');
      await page.click('[data-testid="tv-forget"]');
      const calls = await page.evaluate(() => window.__calls);
      const forgetSays = await page.textContent('[data-testid="tv-forget"]');
      const want = ['{"type":"tv-allow","id":"ask7"}', '{"type":"tv-refuse","id":"ask7"}', '{"type":"tv-forget"}'];
      check('the card: Allow and No send the relay that ask\'s answer; Forget says how many and sends Forget', calls.join('|') === want.join('|') && /2 paired TVs/.test(forgetSays ?? ''), `${calls.join('|')} · ${forgetSays}`);
    } else {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      const card = await page.$eval('[data-testid="tv-asks"]', (e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right }; }).catch(() => null);
      // Fixed and centred, 92% of the window: it must sit inside with a margin either side.
      check(`the card: on ${label} nothing runs off the side`, over <= 0 && !!card && card.left > 0 && card.right < 360 && card.right - card.left > 300, JSON.stringify({ over, card }));
    }
    await ctx.close();
  }
}

// ── No: three of them lock the address out (last, since it locks the LAN address) ──
// A fresh server first, so the count of wrong keys starts at none whatever
// the sections above did, and all three Nos are here.
laptop.close();
await stopServer();
await startServer();
laptop = client('127.0.0.1', { type: 'hello', role: 'display', key: (await (await fetch(`http://127.0.0.1:${PORT}/remote-info.json`)).json()).displayKey });
await laptop.open;
await laptop.next(isType('tv-pairing'));
{
  const reasons = [];
  for (let i = 0; i < 3; i++) {
    const tv = client(LAN, { type: 'hello', role: 'tv', pair: true });
    const c = await tv.next(isType('tv-code'));
    const ask = await until(() => asksNow(laptop)?.asks?.find(a => a.code === c?.code));
    laptop.send({ type: 'tv-refuse', id: ask?.id });
    reasons.push((await tv.next(isType('denied')))?.reason ?? 'none');
    await tv.closed;
  }
  check('no: No turns the TV away, told so', reasons.every(r => r === 'refused'), reasons.join(','));
  const fourth = client(LAN, { type: 'hello', role: 'tv', pair: true });
  const m = await fourth.next((x) => x.type === 'denied' || x.type === 'tv-code');
  check('no: after the third No the address is locked out, and asks no more', m?.type === 'denied' && m.reason === 'locked', JSON.stringify(m));
}

check('no errors on the pages', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
laptop.close();
await stopServer();
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
