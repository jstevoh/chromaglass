#!/usr/bin/env node
/**
 * The TV's remote picks the look (PLAN 12-tv-remote): left and right step
 * through the laptop's presets, OK plays a random one, up or Menu opens the
 * list, and the TV goes on drawing nothing.
 *
 *   npm run tvremote              # builds, then about twenty seconds
 *   npm run tvremote -- --head    # watch the TV page
 *
 * Against the real show server, with a stand-in laptop on a raw socket that
 * answers as the app's page does (a state with its presets when asked, and
 * the new preset live when handed one), so what is measured is the feature:
 * a press on the TV, a preset played on the laptop.
 *
 *   rules     the relay's module and the page's alone: the list cut to what a
 *             TV needs, sent again only when the presets or the live one
 *             change, a pick only of a listed preset and one every TV_PICK_MS
 *             (the page's and the relay's the same number); a step wraps, a
 *             random pick is never the live one
 *   relay     a paired TV hears the list as it joins; its pick reaches the
 *             laptop as the `preset` a phone sends; a pick of a preset not
 *             listed, a patch, an action or a bare `preset` from a TV reach
 *             nothing; a phone's or a pairing ask's `tv-pick` reaches nothing;
 *             ten picks at once are one; a dial moved on the laptop sends the
 *             TVs nothing, a new live preset sends them the list
 *   the page  the built /tv page as the Android TV app opens it: right and
 *             left play the next and previous preset and the top line names
 *             it; a held button moves one; OK plays a random other; up opens
 *             the list at the live one and tells the app (so its Back closes
 *             the list), down twice and OK plays the one two along; the app's
 *             Menu and Back, sent as the app sends them, open and close it;
 *             refused (no Home on the laptop), the keys do nothing
 *   browser   in a TV's own browser the first OK asks for full screen and
 *             plays nothing; the next plays a look
 *   phone     a phone propped up: a tap brings the bar, Next plays the next,
 *             Looks opens the list and a tap on a row plays it, all inside
 *             the screen
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { launchChromium, port } from './chromium.mjs';
import { createTvRemote, tvLooksFrom, TV_PICK_MS, TV_LOOKS_MAX, TV_NAME_MAX } from '../server/tv-remote.js';
import { randomLook, stepLook, TV_PICK_MS as PAGE_PICK_MS } from '../src/lib/tvLooks.ts';

const PORT = port(4244, 'TVREMOTE_PORT');
const KEY = '61827394';
const HEADED = process.argv.includes('--head');
const DIR = mkdtempSync(join(tmpdir(), 'tvremote-'));

let failed = 0, total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await wait(50); } };

const PRESETS = [
  { id: 'classic', name: 'Classic Oil' },
  { id: 'fillmore', name: 'Fillmore' },
  { id: 'coral', name: 'Neon Coral Reef' },
  { id: 'ferro', name: 'Ferro Paint' },
  { id: 'lava', name: 'Lava Lamp' },
];
const ids = PRESETS.map(p => p.id);

// ── Rules: the relay's module and the page's, alone ────────────────────
{
  check('rules: the page holds picks as far apart as the relay does', PAGE_PICK_MS === TV_PICK_MS && TV_PICK_MS >= 200, `${PAGE_PICK_MS} vs ${TV_PICK_MS}`);
  const many = Array.from({ length: TV_LOOKS_MAX + 20 }, (_, i) => ({ id: `p${i}`, name: 'x'.repeat(200), macro: false, user: false }));
  // The junk first, so the cut at TV_LOOKS_MAX cannot hide whether it is dropped.
  const cut = tvLooksFrom({ presets: [{ id: 'p0', name: 'dup' }, { id: 7 }, null, { id: '' }, ...many], activePresetId: 'p3', settings: { secret: 1 } });
  check('rules: the list is cut to ids and names, a duplicate, a bad id and a null dropped, the longest name and the most presets bounded',
    cut.presets.length === TV_LOOKS_MAX && cut.presets[0].name === 'dup' && cut.presets.filter(p => p.id === 'p0').length === 1
    && cut.presets.every(p => Object.keys(p).join() === 'id,name' && typeof p.id === 'string') && cut.presets[1].name.length === TV_NAME_MAX
    && cut.active === 'p3' && !JSON.stringify(cut).includes('secret'),
    `${cut.presets.length} presets, first ${cut.presets[0].name}, name ${cut.presets[1].name.length}`);
  check('rules: a live preset not in the list is none', tvLooksFrom({ presets: PRESETS, activePresetId: 'mine' }).active === null);
  check('rules: a state with no list is no message (an older page)', tvLooksFrom({ settings: {} }) === null && tvLooksFrom(null) === null);
  let now = 10_000;
  const r = createTvRemote({ now: () => now });
  const a = r.onDisplayState({ presets: PRESETS, activePresetId: 'classic', settings: { x: 1 } });
  const same = r.onDisplayState({ presets: PRESETS, activePresetId: 'classic', settings: { x: 2 } });
  const moved = r.onDisplayState({ presets: PRESETS, activePresetId: 'coral', settings: { x: 2 } });
  check('rules: sent again only when the presets or the live one change, not a dial', a?.type === 'tv-looks' && same === null && moved?.active === 'coral' && r.looks() === moved);
  const tv = {};
  check('rules: a pick of a listed preset is the `preset` a phone sends', JSON.stringify(r.pick(tv, { presetId: 'ferro' })) === JSON.stringify({ type: 'preset', presetId: 'ferro' }));
  now += TV_PICK_MS - 1;
  check('rules: one sooner than TV_PICK_MS after it is dropped', r.pick(tv, { presetId: 'lava' }) === null);
  check('rules: another TV is not held by the first one\'s pick', r.pick({}, { presetId: 'lava' })?.presetId === 'lava');
  now += 2;
  check('rules: after TV_PICK_MS it goes', r.pick(tv, { presetId: 'lava' })?.presetId === 'lava');
  now += TV_PICK_MS;
  check('rules: a preset the laptop did not list is never picked', r.pick(tv, { presetId: 'nope' }) === null && r.pick(tv, { presetId: { id: 'classic' } }) === null && r.pick(tv, {}) === null);
  check('rules: a step wraps both ways, and with nothing live starts at an end',
    stepLook(PRESETS, 'lava', 1)?.id === 'classic' && stepLook(PRESETS, 'classic', -1)?.id === 'lava' && stepLook(PRESETS, 'coral', 1)?.id === 'ferro'
    && stepLook(PRESETS, null, 1)?.id === 'classic' && stepLook(PRESETS, 'mine', -1)?.id === 'lava' && stepLook([], 'x', 1) === null);
  let seeded = 1;
  const rand = () => { seeded = (seeded * 16807) % 2147483647; return (seeded - 1) / 2147483646; };
  const picks = Array.from({ length: 400 }, () => randomLook(PRESETS, 'coral', rand)?.id);
  check('rules: a random pick is never the live one, and reaches every other',
    picks.every(p => p && p !== 'coral') && new Set(picks).size === PRESETS.length - 1 && randomLook([PRESETS[0]], 'classic')?.id === 'classic' && randomLook([], null) === null,
    [...new Set(picks)].join(','));
}

// ── The show server, and a stand-in laptop ─────────────────────────────
let server = null;
let serverSaid = '';
server = spawn(process.execPath, ['server/remote-server.js'], {
  env: { ...process.env, PORT: String(PORT), SHOW_KEY: KEY, OSC_PORT: '0', CHROMAGLASS_TV_FILE: join(DIR, 'tvs.json'), CHROMAGLASS_BONJOUR: '0' },
  stdio: ['ignore', 'pipe', 'pipe'], detached: true,
});
process.on('exit', () => { try { if (server) process.kill(-server.pid, 'SIGTERM'); } catch { /* gone */ } rmSync(DIR, { recursive: true, force: true }); });
await new Promise((resolve, reject) => {
  const bail = setTimeout(() => reject(new Error('the show server did not start')), 30_000);
  server.stdout.on('data', d => { serverSaid += String(d); if (serverSaid.includes('Same Wi-Fi') || /No LAN address/.test(serverSaid)) { clearTimeout(bail); resolve(); } });
  server.stderr.on('data', d => { serverSaid += String(d); });
  server.on('exit', c => { clearTimeout(bail); reject(new Error(`the show server exited ${c}: ${serverSaid.slice(0, 300)}`)); });
});
await wait(300);
const info = await (await fetch(`http://127.0.0.1:${PORT}/remote-info.json`)).json();
const LAN = info.hosts?.[0] ?? null;
check('the TVs reach the show at its network address', LAN !== null, LAN ?? 'no LAN address on this machine');
if (!LAN) { console.log(`\n${total - failed}/${total} passed`); process.exit(1); }

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

// The stand-in laptop: its state when asked, and a preset it is handed made live, as useRemote does.
const laptop = client('127.0.0.1', { type: 'hello', role: 'display', key: info.displayKey });
let active = 'fillmore';
let dial = 0;
const sendState = () => laptop.send({ type: 'state', state: { settings: { dial }, activePresetId: active, isActive: true, isAutomated: false, overlaysVisible: true, presets: PRESETS.map(p => ({ ...p, macro: false, user: false })) } });
const picked = [];
laptop.ws.on('message', (d) => {
  const m = JSON.parse(String(d));
  if (m.type === 'request-state') sendState();
  if (m.type === 'preset') { picked.push(m.presetId); if (ids.includes(m.presetId)) { active = m.presetId; sendState(); } }
  if (m.type === 'tv-join' && refuseTvs) laptop.send({ type: 'tv-signal', to: m.id, signal: { kind: 'refused', reason: 'tier' } });
});
let refuseTvs = false;
await laptop.open;
await laptop.next(isType('tv-pairing'));
/** What the laptop is handed over `ms`: every message, so "nothing" means nothing of any kind. */
const heardOver = async (ms, fn) => { const n = laptop.heard.length; const p = picked.length; await fn(); await wait(ms); return { all: laptop.heard.slice(n).filter(m => !['tv-pairing', 'tv-join', 'tv-leave', 'controllers', 'request-state'].includes(m.type)), picks: picked.slice(p) }; };

// ── Relay ──────────────────────────────────────────────────────────────
let tvKey = null;
{
  const ask = client(LAN, { type: 'hello', role: 'tv', pair: true });
  const code = await ask.next(isType('tv-code'));
  const asks = await until(() => [...laptop.heard].reverse().find(m => m.type === 'tv-pairing' && m.asks.some(a => a.code === code?.code)));
  const askId = asks?.asks.find(a => a.code === code?.code)?.id;
  // The relay must hold a list with coral in it first, or the pick is dropped for want of one, whatever the asker's role.
  sendState();
  await wait(200);
  const early = await heardOver(300, () => ask.send({ type: 'tv-pick', presetId: 'coral' }));
  check('relay: a TV still asking to pair picks nothing', early.picks.length === 0 && early.all.length === 0, JSON.stringify(early));
  laptop.send({ type: 'tv-allow', id: askId });
  tvKey = (await ask.next(isType('tv-key')))?.key ?? null;
  ask.close();
  check('relay: (the TV is paired)', /^tv-[0-9a-f]{32}$/.test(tvKey ?? ''), tvKey);

  const tv = client(LAN, { type: 'hello', role: 'tv', key: tvKey });
  const looks = await tv.next(isType('tv-looks'));
  check('relay: a paired TV hears the laptop\'s presets, in its order, and the live one, as it joins',
    JSON.stringify(looks?.presets) === JSON.stringify(PRESETS) && looks?.active === 'fillmore', JSON.stringify(looks));
  const one = await heardOver(300, () => tv.send({ type: 'tv-pick', presetId: 'coral' }));
  check('relay: its pick reaches the laptop as the `preset` a phone sends', one.picks.join() === 'coral' && one.all.length === 1 && one.all[0].type === 'preset', JSON.stringify(one.all));
  const back = await tv.next((m) => m.type === 'tv-looks' && m.active === 'coral');
  check('relay: the laptop playing it sends the TV the new live one', !!back);
  await wait(TV_PICK_MS);
  const junk = await heardOver(400, () => {
    tv.send({ type: 'tv-pick', presetId: 'not-listed' });
    tv.send({ type: 'patch', settings: { brightness: 0 } });
    tv.send({ type: 'action', action: 'clear' });
    tv.send({ type: 'preset', presetId: 'lava' });
    tv.send({ type: 'cue', presetId: 'lava' });
  });
  check('relay: a pick not listed, a patch, an action, a bare preset or a cue from a TV reach nothing', junk.all.length === 0, JSON.stringify(junk.all));
  await wait(TV_PICK_MS);
  const flood = await heardOver(400, () => { for (let i = 0; i < 10; i++) tv.send({ type: 'tv-pick', presetId: ids[i % ids.length] }); });
  check('relay: ten picks at once are one', flood.picks.length === 1, flood.picks.join(','));
  const phone = client(LAN, { type: 'hello', role: 'controller', key: KEY });
  await phone.open;
  await wait(200);
  await wait(TV_PICK_MS);
  const fromPhone = await heardOver(300, () => phone.send({ type: 'tv-pick', presetId: 'lava' }));
  check('relay: a phone\'s tv-pick reaches nothing (a phone has preset)', fromPhone.picks.length === 0, fromPhone.picks.join(','));
  phone.close();
  const n = tv.heard.filter(isType('tv-looks')).length;
  dial++;
  sendState();
  await wait(300);
  check('relay: a dial moved on the laptop sends the TVs nothing', tv.heard.filter(isType('tv-looks')).length === n);
  active = 'lava';
  sendState();
  check('relay: a new live preset sends them the list again', !!(await tv.next((m) => m.type === 'tv-looks' && m.active === 'lava')));
  tv.close();
  const byShowKey = client('127.0.0.1', { type: 'hello', role: 'tv', key: KEY });
  await byShowKey.next(isType('tv-looks'));
  const sk = await heardOver(300, () => byShowKey.send({ type: 'tv-pick', presetId: 'classic' }));
  check('relay: a TV let in by the show key picks as a paired one does', sk.picks.join() === 'classic', sk.picks.join(','));
  byShowKey.close();
}

// ── The page, the browser and the phone, in Chromium ───────────────────
const browser = await launchChromium(chromium, {
  headless: !HEADED,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-proxy-server'],
});
const errors = [];
const stateOf = (page) => page.getAttribute('[data-testid="tv-page"]', 'data-state').catch(() => null);
const press = async (page, key) => { const p = picked.length; await page.keyboard.press(key); await until(() => picked.length > p, 1500); await wait(TV_PICK_MS + 60); return picked.slice(p); };
const noteSays = (page, text) => until(async () => ((await page.textContent('[data-testid="tv-note"]').catch(() => '')) ?? '').includes(text), 3000);
{
  active = 'fillmore';
  sendState();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { window.__menu = []; window.ChromaglassTv = { paired() {}, forget() {}, menu(open) { window.__menu.push(open); } }; });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`tv: ${e.message}`));
  // A React warning or a thrown handler shows as a console error, not a page error. A
  // missing film is not one (the press clips are not in a check's dist/).
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`tv console: ${m.text()}`); });
  await page.goto(`http://${LAN}:${PORT}/tv?app=android&key=${tvKey}`);
  // A raw laptop never sends the picture, so the page sits on "looking" (and
  // starts over after ten seconds); the remote works from looking on.
  check('the page: (in the show, looking for the picture)', !!(await until(async () => (await stateOf(page)) === 'looking', 10_000)));
  await wait(300);
  const right = await press(page, 'ArrowRight');
  check('the page: right plays the next preset on the laptop', right.join() === 'coral', right.join(','));
  check('the page: and the top line names it once it is playing', !!(await noteSays(page, 'Now playing: Neon Coral Reef')));
  const left = await press(page, 'ArrowLeft');
  check('the page: left plays the previous one', left.join() === 'fillmore', left.join(','));
  // A held button: one down, then repeats (Playwright marks a second down of a held key as a repeat).
  const p0 = picked.length;
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 5; i++) { await wait(TV_PICK_MS + 20); await page.keyboard.down('ArrowRight'); }
  await page.keyboard.up('ArrowRight');
  await wait(300);
  check('the page: a held button moves one look, not one a repeat', picked.slice(p0).join() === 'coral', picked.slice(p0).join(','));
  await wait(TV_PICK_MS);
  // Six OKs: each a preset not live at its press, and not all the same (an OK wired to next would be).
  const oks = [];
  let okFine = true;
  for (let i = 0; i < 6; i++) {
    const before = active;
    const got = await press(page, 'Enter');
    if (got.length !== 1 || !ids.includes(got[0]) || got[0] === before) okFine = false;
    oks.push(got.join('+'));
    await wait(150);
  }
  check('the page: OK plays a random preset, never the one playing, not the same one each time', okFine && new Set(oks).size >= 2, oks.join(','));
  // A fresh load before the list: the page starts over by itself ten seconds
  // after a picture that never comes (the raw laptop sends none), and the
  // presses above take most of that.
  await page.reload();
  check('the page: (in the show again)', !!(await until(async () => (await stateOf(page)) === 'looking', 10_000)));
  // The list must open at the live one, not at the top: make the live one a middle one.
  active = 'ferro';
  sendState();
  await until(async () => (await page.evaluate(() => window.__menu !== undefined)), 2000);
  await wait(300);
  const liveNow = active;
  await page.keyboard.press('ArrowUp');
  const at = await page.getAttribute('[data-testid="tv-look"][data-at="true"]', 'data-id').catch(() => null);
  check('the page: up opens the list at the live preset, and tells the app', at === liveNow && (await page.evaluate(() => window.__menu.at(-1))) === true, `${at} vs ${liveNow}`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const two = ids[(ids.indexOf(liveNow) + 2) % ids.length];
  const listed = await press(page, 'Enter');
  check('the page: down twice and OK plays the one two along, and the list shuts', listed.join() === two && !(await page.$('[data-testid="tv-looks"]')) && (await page.evaluate(() => window.__menu.at(-1))) === false, `${listed.join(',')} vs ${two}`);
  // Menu and Back as the app sends them (Shows.pageKey, held by its unit test).
  const p1 = picked.length;
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu' })));
  const opened = !!(await page.$('[data-testid="tv-looks"]'));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await wait(200);
  check('the page: the app\'s Menu opens the list and its Back closes it, playing nothing', opened && !(await page.$('[data-testid="tv-looks"]')) && picked.length === p1, `opened ${opened}`);
  check('the page: (still a receiver: the video is there, no canvas, no plate drawn)', (await page.$$('canvas')).length === 0 && !!(await page.$('[data-testid="tv-live"]')));
  await ctx.close();

  // Refused: no Home on the laptop. The keys must do nothing.
  refuseTvs = true;
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx2.addInitScript(() => { window.ChromaglassTv = { paired() {}, forget() {} }; });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errors.push(`tv refused: ${e.message}`));
  await p2.goto(`http://${LAN}:${PORT}/tv?app=android&key=${tvKey}`);
  const tier = await until(async () => (await stateOf(p2)) === 'tier', 8000);
  const nothing = await heardOver(400, async () => { await p2.keyboard.press('ArrowRight'); await p2.keyboard.press('Enter'); await p2.keyboard.press('ArrowUp'); });
  check('the page: refused (no Home on the laptop), the keys play nothing and open nothing', !!tier && nothing.picks.length === 0 && !(await p2.$('[data-testid="tv-looks"]')), JSON.stringify(nothing.picks));
  await ctx2.close();
  refuseTvs = false;

  // A TV's own browser: no app bridge, so the first OK is full screen.
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p3 = await ctx3.newPage();
  p3.on('pageerror', e => errors.push(`tv browser: ${e.message}`));
  await p3.goto(`http://${LAN}:${PORT}/tv?key=${KEY}`);
  check('browser: (in the show)', !!(await until(async () => (await stateOf(p3)) === 'looking', 10_000)));
  await wait(300);
  const first = await heardOver(400, () => p3.keyboard.press('Enter'));
  const full = await p3.evaluate(() => !!document.fullscreenElement);
  const second = await press(p3, 'Enter');
  check('browser: the first OK asks for full screen and plays nothing; the next plays a look', first.picks.length === 0 && full && second.length === 1, `full ${full}, then ${second.join(',')}`);
  await ctx3.close();

  // A phone propped up as the second screen.
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p4 = await ctx4.newPage();
  p4.on('pageerror', e => errors.push(`phone: ${e.message}`));
  await p4.goto(`http://${LAN}:${PORT}/tv?key=${KEY}`);
  check('phone: (in the show)', !!(await until(async () => (await stateOf(p4)) === 'looking', 10_000)));
  await wait(300);
  check('phone: no bar before a tap (it never covers the picture untouched)', !(await p4.$('[data-testid="tv-bar"]')));
  await p4.tap('[data-testid="tv-page"]', { position: { x: 195, y: 300 } });
  const bar = await p4.$eval('[data-testid="tv-bar"]', (e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight, scroll: document.documentElement.scrollWidth }; }).catch(() => null);
  check('phone: a tap brings the bar, inside the screen', !!bar && bar.left >= 0 && bar.right <= bar.w && bar.bottom <= bar.h && bar.scroll <= bar.w, JSON.stringify(bar));
  const was = active;
  const pn = picked.length;
  await p4.tap('[data-testid="tv-next"]');
  await until(() => picked.length > pn, 1500);
  check('phone: Next plays the next preset', picked.slice(pn).join() === stepLook(PRESETS, was, 1)?.id, `${picked.slice(pn).join(',')} after ${was}`);
  await wait(TV_PICK_MS + 60);
  await p4.tap('[data-testid="tv-open"]');
  const list = await p4.$eval('[data-testid="tv-looks"]', (e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, w: innerWidth, rows: e.querySelectorAll('[data-testid="tv-look"]').length }; }).catch(() => null);
  check('phone: Looks opens the list, every preset in it, inside the screen', !!list && list.rows === PRESETS.length && list.left >= 0 && list.right <= list.w, JSON.stringify(list));
  const target = PRESETS.find(p => p.id !== active).id;
  const pr = picked.length;
  await p4.tap(`[data-testid="tv-look"][data-id="${target}"]`);
  await until(() => picked.length > pr, 1500);
  check('phone: a tap on a row plays it and shuts the list', picked.slice(pr).join() === target && !(await p4.$('[data-testid="tv-looks"]')), picked.slice(pr).join(','));
  await ctx4.close();
}

check('no errors on the pages', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
laptop.close();
try { process.kill(-server.pid, 'SIGTERM'); } catch { /* gone */ }
server = null;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
