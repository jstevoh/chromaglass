#!/usr/bin/env node
/**
 * The show's timers when nobody is looking (PLAN.md Wave 4: 14a-timers and
 * 14j-gamepad in docs/plan/40-specs-frame-gig-desk.md).
 *
 *   npm run timers -- --owed=hidden,gamepad   (node only)
 *
 * Two lines written ahead of their builds, each printed as owed while it
 * fails and red the day it passes with its id still listed (the convention
 * of `wallflash.mjs` and `liveshow.mjs`); an owed line is excused only while
 * what it asks for is absent, and a build that is there and misses is red.
 *
 * **hidden (14a-timers).** The look fade, the dimmer, the drift glides and
 * the simulated band step on `showInterval` (src/lib/showClock.ts), which
 * live is `setInterval`, and Chrome holds a hidden page's timers to about one
 * a second. So a Go fired from a MIDI pad with the show window covered walks
 * its 4 s crossfade in four steps. A headless page cannot show Chrome's
 * throttle, so this is node: `setInterval` is replaced by one that fires at
 * most once a second (the throttle, as Chrome documents it for a hidden
 * page), `performance.now()` by a made-up clock, and the worker's tick that
 * keeps the ear awake (src/hooks/useAudioAnalyzer.ts, `TICK_MS`, 16 ms; a
 * worker's timers are not throttled) is driven by hand. The contract the
 * build implements is `pumpShowIntervals(now)` exported from showClock.ts:
 * the worker's tick calls it, and it fires every live show interval whose
 * period has passed since it last fired, by either path. Pass: a 33 ms look
 * fade (useLookFades.ts's period) fires at least 30 times in 4 s hidden.
 * And a line that holds on main as well: on a visible page, with the tick
 * pumping beside the real timers, no interval fires more often than its
 * period allows (a pump that fired what the timer had just fired would
 * double every fade's writes).
 *
 * **gamepad (14j-gamepad).** `useGamepad` polls every 16 ms with no pad
 * connected. The real hook is bundled here with a stand-in for React's hooks
 * (state, refs, and effects run once, as on a mount), a `window` that keeps
 * its listeners and a `navigator.getGamepads`, and every `setInterval` it
 * arms is counted. Pass: no pad, no timer; a pad's `gamepadconnected` arms
 * one; the last `gamepaddisconnected` clears it.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, 'node_modules', '.cache', 'timers');
mkdirSync(cache, { recursive: true });

const IDS = ['hidden', 'gamepad'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
};

const bundle = async (entry, name, alias = {}) => {
  const outfile = join(cache, `${name}.mjs`);
  await build({ entryPoints: [join(root, entry)], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning', alias });
  return import(`${pathToFileURL(outfile).href}?${Date.now()}`);
};

// ── The made-up clock and the timers on it ──
let vt = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => vt }, configurable: true, writable: true });
const timers = new Map();
let nextId = 1, throttled = false;
globalThis.setInterval = (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms, next: vt + ms, last: -Infinity }); return id; };
globalThis.clearInterval = (id) => { timers.delete(id); };
const runTimers = () => {
  for (const t of [...timers.values()]) {
    // Hidden, Chrome runs a timer at most once a second; visible, on its own
    // grid of periods (a late callback does not push the next one back).
    const due = throttled ? Math.max(t.next, t.last + 1000) : t.next;
    if (vt >= due) { t.last = vt; t.next = throttled ? vt + t.ms : t.next + t.ms; t.fn(); }
  }
};

// ── hidden: a look fade with the window covered ──
{
  const clock = await bundle('src/lib/showClock.ts', 'showClock');
  const pump = typeof clock.pumpShowIntervals === 'function' ? clock.pumpShowIntervals : null;
  const fade = (hidden) => {
    throttled = hidden;
    let fires = 0;
    const start = vt;
    const h = clock.showInterval(() => { fires++; }, 33, 'look-fade');
    // The worker's tick, every 16 ms, beside the page's own timers.
    for (const end = start + 4000; vt < end;) {
      vt += 16;
      runTimers();
      if (pump) pump(vt);
    }
    clock.clearShowInterval(h);
    return fires;
  };
  const hidden = fade(true);
  const visible = fade(false);
  const most = Math.floor(4000 / 33) + 1;
  console.log(`  a 33 ms look fade over 4 s: ${hidden} steps hidden, ${visible} visible${pump ? '' : ' (no pumpShowIntervals: the worker\'s tick drives nothing)'}`);
  line('hidden', '14a-timers: a 4 s look fade with the window covered steps at least 30 times', hidden >= 30,
    `${hidden} steps${pump ? '' : '; no pumpShowIntervals export in src/lib/showClock.ts'}`, !pump);
  check('and visible it steps on time and never twice in its period', visible >= most - 2 && visible <= most,
    `${visible} steps against ${most} at most`);
  check('control: the throttle this models is on (hidden, the page\'s own timer alone, about four)', !pump ? hidden <= 5 : true,
    pump ? 'not read once the tick pumps' : `${hidden} steps`);
  throttled = false;
}

// ── gamepad: no timer without a pad ──
{
  const fake = join(cache, 'fakeReact.mjs');
  // Bundled into the hook's file, so what it queues is kept where this file can reach it.
  writeFileSync(fake, `
    const effects = (globalThis.__timersEffects ??= []);
    export const useRef = (v) => ({ current: v });
    export const useState = (v) => [typeof v === 'function' ? v() : v, () => {}];
    export const useEffect = (fn) => { effects.push(fn); };
    export const useCallback = (fn) => fn;
    export const useMemo = (fn) => fn();
    export const useSyncExternalStore = (sub, get) => get();
    export default { useRef, useState, useEffect, useCallback, useMemo, useSyncExternalStore };
  `);
  const listeners = {};
  globalThis.window = {
    addEventListener: (type, fn) => { (listeners[type] ??= new Set()).add(fn); },
    removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
  };
  let pads = [];
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads }, configurable: true, writable: true });
  const fire = (type, gamepad) => { for (const fn of [...(listeners[type] ?? [])]) fn({ gamepad }); };
  timers.clear();
  const hook = await bundle('src/hooks/useGamepad.ts', 'useGamepad', { react: fake });
  const host = { gesture: () => {}, action: () => {}, cycleDye: () => {} };
  hook.useGamepad(host, true);
  const cleanups = globalThis.__timersEffects.splice(0).map((f) => f()).filter((c) => typeof c === 'function');
  const idle = timers.size;
  const pad = { id: 'Wireless Controller (STANDARD GAMEPAD)', connected: true, index: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], mapping: 'standard' };
  pads = [pad];
  fire('gamepadconnected', pad);
  const plugged = timers.size;
  pads = [];
  fire('gamepaddisconnected', pad);
  const unplugged = timers.size;
  for (const c of cleanups) c();
  const after = timers.size;
  console.log(`  useGamepad's timers: ${idle} with no pad, ${plugged} with one plugged in, ${unplugged} once it is unplugged, ${after} after unmount`);
  check('control: the hook mounted (its listeners are on the window)', cleanups.length > 0, `${cleanups.length} effect cleanups`);
  line('gamepad', '14j-gamepad: no timer without a pad; a pad plugged in arms one, and unplugged it is gone',
    idle === 0 && plugged >= 1 && unplugged === 0, `${idle}, ${plugged}, ${unplugged}`, idle === 1);
  check('and nothing is left armed after unmount', after === 0, `${after}`);
}
console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
