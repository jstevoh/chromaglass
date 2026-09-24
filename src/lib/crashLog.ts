/**
 * The black box (docs/crash-plan.md).
 *
 * The live site has stopped on people and said nothing: the plate freezes, or
 * the tab reloads itself, and whatever preceded it is gone with the page. This
 * keeps a short ring of everything a stop can announce itself through —
 * uncaught errors and rejections, `console.error`/`warn`, the device's
 * `uncapturederror` and `.lost`, the recoveries from a loss, and a heartbeat
 * that notices when frames stop while the tab is visible — each line with a
 * small snapshot of the show's state, and persists it to localStorage, so that
 * after the reload a crash usually ends in, the line before the death is
 * still there: `chromaglassDebug().crash.last()`.
 *
 * Nothing leaves the machine from here. The report is only built when someone
 * presses a button in `CrashReportButton`, and only sent if they press Send.
 */

export type CrashLevel = 'info' | 'warn' | 'error' | 'fatal';

/** The show's state at the moment of a line: small, cheap, and never throws. */
export interface CrashSnapshot {
  rung?: string;
  engine?: string;
  fps?: number;
  stepsPerSec?: number;
  stats?: Record<string, number>;
  preset?: string;
  projector?: string;
  [key: string]: unknown;
}

export interface CrashEntry {
  /** Wall clock, epoch ms. */
  t: number;
  /** Seconds since this load started. */
  up: number;
  /** Which load wrote it, so the previous one's tail can be told apart. */
  load: string;
  level: CrashLevel;
  source: string;
  msg: string;
  snap?: CrashSnapshot;
  /** The same line again, this many more times, until `lastT`. */
  repeats?: number;
  lastT?: number;
}

export interface CrashReport {
  kind: 'chromaglass-crash-report';
  version: 1;
  at: string;
  note: string;
  url: string;
  env: Record<string, unknown>;
  snapshot: CrashSnapshot;
  debug: unknown;
  look: unknown;
  log: CrashEntry[];
  previous: CrashEntry[];
  /** The whole ring, every load it still holds — a crash two reloads back is in here. */
  history: CrashEntry[];
  screenshot: { dataUrl: string; width: number; height: number; painted: boolean } | null;
}

const STORE = 'chromaglass-crashlog';
const RING = 200;
const MSG_MAX = 600;
/**
 * How long a visible tab may go without a frame: first a stall, worth a line,
 * then a stop. A long task that blocks the main thread for seconds and then
 * lets go — a big settings sheet, a song-map decode — looks exactly like a
 * stall to this interval, which only runs once the block is over; that is an
 * error to read later, not a plate that stopped. Twenty seconds with no frame
 * is.
 */
const STALL_S = 6;
const STOP_S = 20;
/** Losses inside this window that mean recovery is not holding. */
const LOSS_WINDOW_S = 60;
const LOSS_FATAL = 3;

/**
 * What is not worth a line: noise every browser makes, that has never been
 * what stopped a show. A pattern that matches drops the line entirely.
 */
export const IGNORE: RegExp[] = [
  /ResizeObserver loop/i,
  /Download the React DevTools/i,
  /AudioContext was not allowed to start/i,
  /The play\(\) request was interrupted/i,
  /favicon/i,
  /(chrome|moz|safari(-web)?)-extension:\/\//i,
  /Failed to load resource/i,
];

const LOAD = Math.random().toString(36).slice(2, 8);
const T0 = performance.now();

let installed = false;
let ring: CrashEntry[] = [];
let previousTail: CrashEntry[] = [];
let ignore = IGNORE;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const providers = new Map<string, () => CrashSnapshot>();
const listeners = new Set<(e: CrashEntry) => void>();
let debugState: (() => unknown) | null = null;
let lookState: (() => unknown) | null = null;
let gpuInfo: (() => Record<string, unknown>) | null = null;
let grab: (() => Promise<{ width: number; height: number; pixels: Uint8Array; painted: boolean } | null> | null) | null = null;

// Heartbeat state.
let frames = 0;
let seenFrames = -1;
let lastAdvance = 0;
/** 0 frames flowing, 1 stalled (an error was logged), 2 stopped (the fatal was). */
let stalled: 0 | 1 | 2 = 0;
const losses: number[] = [];

const clip = (s: string) => (s.length > MSG_MAX ? `${s.slice(0, MSG_MAX)}…` : s);

/** Anything a console call or a rejection can carry, as one line. */
function describe(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack.split('\n').slice(1, 4).join('\n')}` : ''}`;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
}

function snapshot(): CrashSnapshot {
  const out: CrashSnapshot = {};
  for (const [key, fn] of providers) {
    try { Object.assign(out, fn()); } catch { out[`${key}Failed`] = true; }
  }
  return out;
}

let lastWrite = -Infinity;
function persist(now = false, force = false) {
  const write = () => {
    saveTimer = null;
    lastWrite = performance.now();
    try { localStorage.setItem(STORE, JSON.stringify(ring)); } catch { /* full, or private: the ring still lives here */ }
  };
  // At once, but not more than once a second: an error that fires every
  // frame must not become sixty synchronous writes of the whole ring a
  // second — the box would be what stalled the show.
  if (force || (now && performance.now() - lastWrite > 1000)) { if (saveTimer) clearTimeout(saveTimer); write(); return; }
  if (!saveTimer) saveTimer = setTimeout(write, now ? 250 : 500);
}

/** Add a line. Errors and fatals are written through at once: the page may not get another chance. */
export function record(level: CrashLevel, source: string, msg: string): CrashEntry | null {
  const text = clip(msg);
  if (level !== 'fatal' && ignore.some((re) => re.test(text))) return null;
  // The same line again: counted on the last one rather than filling the ring.
  const prev = ring[ring.length - 1];
  if (prev && prev.load === LOAD && prev.level === level && prev.source === source && prev.msg === text && level !== 'fatal') {
    prev.repeats = (prev.repeats ?? 0) + 1;
    prev.lastT = Date.now();
    persist();
    return prev;
  }
  const entry: CrashEntry = {
    t: Date.now(),
    up: +((performance.now() - T0) / 1000).toFixed(2),
    load: LOAD,
    level,
    source,
    msg: text,
    snap: snapshot(),
  };
  ring.push(entry);
  if (ring.length > RING) ring.splice(0, ring.length - RING);
  persist(level === 'error' || level === 'fatal', level === 'fatal');
  for (const fn of listeners) { try { fn(entry); } catch { /* a listener is not allowed to take the log down */ } }
  return entry;
}

/** Hook everything. Idempotent; call it as early as the page allows. */
export function install(opts: { ignore?: RegExp[] } = {}): void {
  if (opts.ignore) ignore = [...IGNORE, ...opts.ignore];
  if (installed || typeof window === 'undefined') return;
  installed = true;

  try {
    const stored = JSON.parse(localStorage.getItem(STORE) ?? '[]') as CrashEntry[];
    if (Array.isArray(stored)) {
      ring = stored.slice(-RING);
      const lastLoad = ring.length ? ring[ring.length - 1].load : null;
      previousTail = lastLoad ? ring.filter((e) => e.load === lastLoad).slice(-40) : [];
    }
  } catch { ring = []; }

  // The previous load that never said goodbye: a tab crash, an OOM kill, or
  // a reload the page did not get to see. Not a fatal on its own — mobile
  // browsers discard background tabs without a word — but worth its line.
  const prevEnd = previousTail[previousTail.length - 1];
  if (prevEnd && prevEnd.source !== 'unload') {
    record('warn', 'boot', `the previous load (${prevEnd.load}) ended without unloading; its last line: [${prevEnd.level}] ${prevEnd.source}: ${prevEnd.msg.split('\n')[0]}`);
  }
  record('info', 'boot', `load ${LOAD} · ${location.pathname}${location.search}`);

  window.addEventListener('error', (e) => {
    // A resource that failed to load arrives here too, with no message.
    if (!e.message && e.target && e.target !== window) return;
    record('error', 'window', `${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno}:${e.colno})` : ''}${e.error?.stack ? `\n${String(e.error.stack).split('\n').slice(1, 4).join('\n')}` : ''}`);
  });
  window.addEventListener('unhandledrejection', (e) => record('error', 'promise', describe(e.reason)));

  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    let inside = false;
    console[level] = (...args: unknown[]) => {
      if (!inside) {
        inside = true;
        const text = args.map(describe).join(' ');
        try { record(level, /WebGPU/.test(text) ? 'gpu' : 'console', text); } finally { inside = false; }
      }
      original(...args);
    };
  }

  window.addEventListener('pagehide', () => { record('info', 'unload', 'pagehide'); persist(true, true); });
  document.addEventListener('visibilitychange', () => {
    // A hidden tab gets no frames and that is not a stall; start counting again.
    lastAdvance = performance.now();
    if (document.visibilityState === 'hidden') persist(true, true);
  });

  setInterval(() => {
    if (seenFrames < 0) return;                  // no frame yet: not armed
    const now = performance.now();
    if (frames !== seenFrames) {
      if (stalled) record('info', 'heartbeat', `frames resumed after ${((now - lastAdvance) / 1000).toFixed(1)}s`);
      seenFrames = frames;
      lastAdvance = now;
      stalled = 0;
      return;
    }
    if (document.visibilityState !== 'visible') return;
    const quiet = now - lastAdvance;
    if (stalled < 1 && quiet > STALL_S * 1000) {
      stalled = 1;
      record('error', 'heartbeat', `no frame for ${STALL_S}s with the tab visible (${frames} drawn this load)`);
    } else if (stalled < 2 && quiet > STOP_S * 1000) {
      stalled = 2;
      record('fatal', 'heartbeat', `no frame for ${STOP_S}s with the tab visible (${frames} drawn this load): the plate has stopped`);
    }
  }, 1000);
}

/** One frame drawn. The render loop calls this; it is the heartbeat's only input. */
export function beat(): void {
  frames++;
  if (seenFrames < 0) { seenFrames = frames; lastAdvance = performance.now(); }
}

/**
 * A device loss, from the handler that recovers from it. The loss's own line
 * is its `console.error`; this counts them, because one is a recovery and
 * three in a minute is a machine that will not hold a device — a stop.
 */
export function deviceLost(reason: string): void {
  const now = performance.now() / 1000;
  losses.push(now);
  while (losses.length && now - losses[0] > LOSS_WINDOW_S) losses.shift();
  if (losses.length >= LOSS_FATAL) record('fatal', 'gpu', `${losses.length} device losses in ${LOSS_WINDOW_S}s (last: ${reason || 'unknown'}); recovery is not holding`);
}

/** The recovery finished: a new device, the look laid again. */
export function recovered(what: string): void {
  record('info', 'recovery', what);
}

/** Contribute to every line's snapshot. Returns the remover. */
export function provide(key: string, fn: () => CrashSnapshot): () => void {
  providers.set(key, fn);
  return () => { if (providers.get(key) === fn) providers.delete(key); };
}

/** The report's larger parts: the full debug state, the look, the GPU, a frame. */
export function provideReport(parts: {
  debug?: () => unknown;
  look?: () => unknown;
  gpu?: () => Record<string, unknown>;
  grab?: () => Promise<{ width: number; height: number; pixels: Uint8Array; painted: boolean } | null> | null;
}): void {
  if (parts.debug) debugState = parts.debug;
  if (parts.look) lookState = parts.look;
  if (parts.gpu) gpuInfo = parts.gpu;
  if (parts.grab) grab = parts.grab;
}

export function subscribe(fn: (e: CrashEntry) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const entries = (): CrashEntry[] => ring.slice();
export const thisLoad = (): CrashEntry[] => ring.filter((e) => e.load === LOAD);
export const previous = (): CrashEntry[] => previousTail.slice();
/** The newest line, whichever load wrote it. */
export const latest = (): CrashEntry | null => ring[ring.length - 1] ?? null;
/**
 * The line that preceded the death: the last one the previous load wrote.
 * After the reload a crash usually ends in, this is the one to read.
 */
export const last = (): CrashEntry | null => [...previousTail].reverse().find((e) => e.source !== 'unload') ?? null;
/** The last fatal of this load, or of the previous one if it ended on one. */
export const lastFatal = (): CrashEntry | null =>
  [...thisLoad()].reverse().find((e) => e.level === 'fatal')
  ?? [...previousTail].reverse().find((e) => e.level === 'fatal')
  ?? null;
export const loadId = LOAD;
export function clear(): void { ring = []; previousTail = []; persist(true, true); }

/**
 * Whatever the debug object holds, made JSON-safe: functions dropped, typed
 * arrays and GPU objects summarised, cycles cut, depth and width capped, so a
 * report never carries a megabyte of dye field or throws on a dead device.
 */
export function jsonSafe(v: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'bigint') return String(v);
  if (typeof v !== 'object') return undefined;   // functions, symbols, undefined
  if (seen.has(v)) return '[cycle]';
  if (ArrayBuffer.isView(v)) return `[${v.constructor.name} ×${(v as unknown as { length?: number }).length ?? v.byteLength}]`;
  if (v instanceof ArrayBuffer) return `[ArrayBuffer ${v.byteLength}B]`;
  const ctor = (v as { constructor?: { name?: string } }).constructor?.name ?? '';
  if (/^GPU/.test(ctor)) return `[${ctor}]`;
  if (typeof Element !== 'undefined' && v instanceof Element) return `[${v.tagName.toLowerCase()}]`;
  if (depth >= 5) return '[…]';
  seen.add(v);
  if (Array.isArray(v)) {
    const out = v.slice(0, 48).map((x) => jsonSafe(x, depth + 1, seen));
    if (v.length > 48) out.push(`[+${v.length - 48}]`);
    return out;
  }
  if (v instanceof Map) return jsonSafe(Object.fromEntries(v), depth, seen);
  if (v instanceof Set) return jsonSafe([...v], depth, seen);
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const key of Object.keys(v)) {
    if (++n > 80) { out['…'] = `+${Object.keys(v).length - 80} keys`; break; }
    let x: unknown;
    try { x = (v as Record<string, unknown>)[key]; } catch (e) { x = `[threw: ${describe(e)}]`; }
    const safe = jsonSafe(x, depth + 1, seen);
    if (safe !== undefined) out[key] = safe;
  }
  return out;
}

/** A frame as a JPEG no wider than `maxWidth`, or null — never a throw, never a hang. */
async function screenshot(maxWidth = 960): Promise<CrashReport['screenshot']> {
  if (!grab) return null;
  try {
    const pending = grab();
    if (!pending) return null;
    const shot = await Promise.race([pending, new Promise<null>((r) => setTimeout(() => r(null), 2000))]);
    if (!shot || !shot.width || !shot.height) return null;
    const full = document.createElement('canvas');
    full.width = shot.width;
    full.height = shot.height;
    full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(shot.pixels.buffer, shot.pixels.byteOffset, shot.pixels.byteLength), shot.width, shot.height), 0, 0);
    const scale = Math.min(1, maxWidth / shot.width);
    const out = document.createElement('canvas');
    out.width = Math.round(shot.width * scale);
    out.height = Math.round(shot.height * scale);
    out.getContext('2d')!.drawImage(full, 0, 0, out.width, out.height);
    return { dataUrl: out.toDataURL('image/jpeg', 0.85), width: out.width, height: out.height, painted: shot.painted };
  } catch (e) {
    record('warn', 'report', `screenshot failed: ${describe(e)}`);
    return null;
  }
}

/**
 * The whole report, as one JSON-ready object. Every part is fenced: a report
 * from a page whose device is destroyed still returns, with `screenshot: null`.
 */
export async function buildReport(opts: { note?: string; screenshot?: boolean; settings?: boolean } = {}): Promise<CrashReport> {
  const guard = <T,>(fn: (() => T) | null): T | { failed: string } | null => {
    if (!fn) return null;
    try { return fn(); } catch (e) { return { failed: describe(e) }; }
  };
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    kind: 'chromaglass-crash-report',
    version: 1,
    at: new Date().toISOString(),
    note: opts.note ?? '',
    url: location.href,
    env: {
      userAgent: nav.userAgent,
      platform: nav.platform,
      language: nav.language,
      cores: nav.hardwareConcurrency,
      memoryGB: nav.deviceMemory,
      screen: { width: screen.width, height: screen.height, dpr: devicePixelRatio, window: [innerWidth, innerHeight] },
      visibility: document.visibilityState,
      load: LOAD,
      upSeconds: +((performance.now() - T0) / 1000).toFixed(1),
      framesThisLoad: frames,
      gpu: jsonSafe(guard(gpuInfo)),
    },
    snapshot: snapshot(),
    debug: jsonSafe(guard(debugState)),
    look: opts.settings === false ? null : jsonSafe(guard(lookState)),
    log: thisLoad(),
    previous: previous(),
    history: entries(),
    screenshot: opts.screenshot === false ? null : await screenshot(),
  };
}

/** Where Send goes. Unset, there is no Send. */
export const REPORT_URL: string | undefined = import.meta.env?.VITE_CRASH_REPORT_URL || undefined;

export async function sendReport(report: CrashReport): Promise<void> {
  if (!REPORT_URL) throw new Error('no report endpoint configured');
  const res = await fetch(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
  if (!res.ok) throw new Error(`the endpoint answered ${res.status}`);
}

/** What `chromaglassDebug().crash` exposes. */
export const crashApi = {
  last, latest, entries, previous, thisLoad, lastFatal, clear, record,
  report: (note?: string) => buildReport({ note }),
  load: LOAD,
  /** Frames the render loop has got through this load: the heartbeat's own count. */
  beats: () => frames,
};
