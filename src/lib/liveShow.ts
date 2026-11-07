/**
 * The Live Show (PLAN.md 37x-4d): the Mac app's one stream, as the panel,
 * the console (`window.__cgLive`) and the phone remote see it.
 *
 * 37x-4b and 4c built the stream itself (lib/liveStream.ts encodes the plate
 * and the show's sound; desktop/liveSession.js writes it to every
 * destination) and drove it only from the console. The owner asked for "a
 * Live Show panel in the Mac app, Pro only" to stream to every popular
 * platform at once; this file is what that panel stands on:
 *
 *  - one controller, so the panel, the console and the remote's Stop all
 *    act on the same stream. Two (the console's and the panel's, each with
 *    its own encoder) could both start one, and the second would take the
 *    session from the first in the main process with no word on either;
 *  - the destinations the owner has added, kept in this browser's storage
 *    by name, server and shape. Never the key: a key goes once, through the
 *    preload, into the keychain store (desktop/keys.js), and the page from
 *    then on names it (`live-<id>`), as the console's `keyName` does. A
 *    destination read back from storage is rebuilt field by field, so a key
 *    that somehow got in (an old build, a hand edit) is not carried on;
 *  - the upload, measured by the streams themselves. The research
 *    (docs/live-show.md) says the link wants about 20% over the sum of every
 *    destination's bitrate. A speed test would need a server of ours and
 *    measures the wrong path; the stream's own destinations acknowledge what
 *    reached them (37x-4c's `kbps`, bytes the server has confirmed over the
 *    last two to three seconds), so while every destination keeps up, their
 *    sum is an upload the link has carried, and while one falls more than a
 *    second behind, their sum is all the link can carry. The panel compares
 *    the next stream's need against what the last one showed.
 */
import { useSyncExternalStore } from 'react';
import { avcCodec, videoBitrate } from './render';
import {
  LiveEncoder, liveConsolePlan, probeVideoEncoders,
  type LiveConsoleOptions, type LiveDestinationHealth, type LiveStartRequest, type LiveState,
  type LiveTransport, type LiveTransportState, type LivePacket, type LiveSource,
} from './liveStream';
export type { LiveSource } from './liveStream';

// --- The Mac app's bridge ------------------------------------------------------

interface NativeLive {
  start(req: LiveStartRequest): Promise<{ ok: boolean; error?: string; state?: LiveTransportState | null }>;
  config(cfg: unknown): Promise<unknown>;
  packet(p: LivePacket): void;
  stop(): Promise<unknown>;
  state(): Promise<LiveTransportState | null>;
  onEvent(fn: (e: { event: string; detail: unknown; state: LiveTransportState | null }) => void): () => void;
  keys: { set(name: string, key: string): Promise<boolean>; list(): Promise<{ name: string; set: string | null }[]>; remove(name: string): Promise<boolean> };
}

/** The Mac app's bridge to its RTMPS client (desktop/preload.cjs), or null outside the app. */
export function nativeLive(): NativeLive | null {
  const w = globalThis as unknown as { __CHROMAGLASS_NATIVE__?: { live?: NativeLive } };
  return w.__CHROMAGLASS_NATIVE__?.live ?? null;
}

// --- Where it goes -------------------------------------------------------------

export type LiveServiceId = 'youtube' | 'twitch' | 'facebook' | 'kick' | 'x' | 'instagram' | 'tiktok' | 'other';
export type LiveOrientation = 'landscape' | 'portrait';

/**
 * The platforms docs/live-show.md found taking a stream from software, with
 * the server each gives when it gives one fixed address. Kick's, X's,
 * Instagram's and TikTok's come with the key (per account, region or
 * stream), so their server is pasted too. Instagram and TikTok take 9:16 only.
 */
export const LIVE_SERVICES: { id: LiveServiceId; name: string; url: string; orientation: LiveOrientation; hint: string }[] = [
  { id: 'youtube', name: 'YouTube', url: 'rtmps://a.rtmps.youtube.com/live2', orientation: 'landscape', hint: 'YouTube Studio → Go live → Stream key' },
  { id: 'twitch', name: 'Twitch', url: 'rtmps://live.twitch.tv/app', orientation: 'landscape', hint: 'Creator Dashboard → Settings → Stream' },
  { id: 'facebook', name: 'Facebook', url: 'rtmps://live-api-s.facebook.com:443/rtmp/', orientation: 'landscape', hint: 'Live Producer → Streaming software' },
  { id: 'kick', name: 'Kick', url: '', orientation: 'landscape', hint: 'Creator Dashboard → Stream: its server and key' },
  { id: 'x', name: 'X', url: '', orientation: 'landscape', hint: 'Live Studio (Premium): its server and key' },
  { id: 'instagram', name: 'Instagram', url: '', orientation: 'portrait', hint: 'Live Producer on the desktop site: a new server and key each stream' },
  { id: 'tiktok', name: 'TikTok', url: '', orientation: 'portrait', hint: 'LIVE Center → Server: a new key each stream' },
  { id: 'other', name: 'Other', url: '', orientation: 'landscape', hint: 'Any RTMP or RTMPS server and its key' },
];
export const serviceById = (id: string) => LIVE_SERVICES.find((s) => s.id === id) ?? LIVE_SERVICES[LIVE_SERVICES.length - 1];

/** A destination as kept: never its key, which the keychain store holds under `keyNameFor`. */
export interface LiveDestination {
  id: string;
  service: LiveServiceId;
  name: string;
  url: string;
  orientation: LiveOrientation;
  /** Streamed by Go live. */
  on: boolean;
  /** Streamed by Test instead: an unlisted broadcast, a private channel. */
  test: boolean;
}

export const keyNameFor = (d: Pick<LiveDestination, 'id'>) => `live-${d.id}`;
const DESTINATIONS_KEY = 'chromaglass.live.destinations';
const FORMAT_KEY = 'chromaglass.live.format';
const UPLOAD_KEY = 'chromaglass.live.upload';

export const validUrl = (url: string) => /^rtmps?:\/\/[^\s/]+/i.test(url.trim());

/** Why a pasted key will not do, or null. The server pasted as a key is the usual slip. */
export function keyProblem(key: string): string | null {
  const k = key.trim();
  if (!k) return 'paste the stream key';
  if (/^rtmps?:\/\//i.test(k)) return 'that is the server address: the key is the other field';
  if (/\s/.test(k)) return 'a stream key has no spaces in it';
  return null;
}

const read = <T,>(key: string): T | null => {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : null; } catch { return null; }
};
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private window: kept for this page only */ } };

/** Field by field, so nothing but these (and never a key) survives a read or a write. */
export function cleanDestination(raw: unknown): LiveDestination | null {
  const r = raw as Partial<LiveDestination> | null;
  if (!r || typeof r.id !== 'string' || !/^[a-z0-9]{1,24}$/.test(r.id) || typeof r.url !== 'string') return null;
  const service = serviceById(String(r.service)).id;
  return {
    id: r.id, service, url: r.url.trim(),
    name: (typeof r.name === 'string' && r.name.trim() ? r.name.trim() : serviceById(service).name).slice(0, 40),
    orientation: r.orientation === 'portrait' ? 'portrait' : 'landscape',
    on: r.on !== false, test: r.test === true,
  };
}

export function loadDestinations(): LiveDestination[] {
  const raw = read<unknown[]>(DESTINATIONS_KEY);
  return Array.isArray(raw) ? raw.map(cleanDestination).filter((d): d is LiveDestination => d !== null) : [];
}
export function saveDestinations(list: LiveDestination[]): void {
  write(DESTINATIONS_KEY, list.map(cleanDestination).filter(Boolean));
}
/*
  A name for a destination's key in the store, not a draw of the show: from the
  platform's random source (crypto), since the plate's own randomness is seeded
  (`npm run seed`) and an id has no business taking from it.
*/
export const newDestinationId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('');

/** The landscape encode's size, the rate of both, and which picture is streamed (37x-4d-1). The portrait one is 720x1280 (Instagram's and TikTok's). */
export interface LiveFormat { height: 720 | 1080; fps: 30 | 60; source?: LiveSource }
export const DEFAULT_FORMAT: LiveFormat = { height: 1080, fps: 30, source: 'plate' };
export function loadFormat(): LiveFormat {
  const f = read<Partial<LiveFormat>>(FORMAT_KEY);
  return { height: f?.height === 720 ? 720 : 1080, fps: f?.fps === 60 ? 60 : 30, source: f?.source === 'stack' ? 'stack' : 'plate' };
}
export const saveFormat = (f: LiveFormat) => write(FORMAT_KEY, f);

/** Which destinations a press streams: Go live the ones on and not for tests, Test the ones for tests. */
export const chosenFor = (list: LiveDestination[], test: boolean) => list.filter((d) => (test ? d.test : d.on && !d.test) && validUrl(d.url));

/** The console's options for those destinations, keys by name. */
export function liveOptionsFor(list: LiveDestination[], f: LiveFormat): LiveConsoleOptions {
  return {
    destinations: list.map((d) => ({ name: d.name, url: d.url.trim(), keyName: keyNameFor(d), orientation: d.orientation })),
    width: Math.round(f.height * 16 / 9), height: f.height, fps: f.fps,
    ...(f.source === 'stack' ? { source: 'stack' as const } : {}),
  };
}

export const AUDIO_KBPS = 160;
/**
 * What the destinations will push up the link, in kilobits a second: each
 * one is its own copy of its encode (one socket each, liveSession.js), so it
 * is the sum over destinations, not over encodes. The encoder's own rates:
 * render.ts's `videoBitrate` for each output, which is what LiveEncoder sets
 * when none is given, and the 160 kb/s it gives the sound.
 */
export function needKbps(list: LiveDestination[], f: LiveFormat): number {
  const plan = liveConsolePlan(liveOptionsFor(list, f));
  const rate = new Map(plan.outputs.map((o) => [o.id, videoBitrate(avcCodec(o.width, o.height, f.fps), o.width, o.height, f.fps) / 1000]));
  return Math.round(plan.destinations.reduce((sum, d) => sum + (rate.get(d.output ?? '') ?? 0) + AUDIO_KBPS, 0));
}

/** What the streams so far have shown of the upload: carried while keeping up, and the most carried while falling behind. */
export interface LiveUpload { heldKbps: number; saturatedKbps: number | null; at: string }
export const loadUpload = (): LiveUpload | null => {
  const u = read<LiveUpload>(UPLOAD_KEY);
  return u && typeof u.heldKbps === 'number' ? { heldKbps: u.heldKbps, saturatedKbps: typeof u.saturatedKbps === 'number' ? u.saturatedKbps : null, at: String(u.at ?? '') } : null;
};

/** The headroom docs/live-show.md asks for over the sum of the destinations' bitrates. */
export const HEADROOM = 1.2;
export type UploadLevel = 'ok' | 'unknown' | 'unproven' | 'short';
const mbps = (kbps: number) => `${(kbps / 1000).toFixed(1)} Mb/s`;

/** The panel's line about the upload, against what the last stream measured. */
export function uploadAdvice(need: number, m: LiveUpload | null): { level: UploadLevel; text: string } {
  const want = need * HEADROOM;
  if (need <= 0) return { level: 'unknown', text: '' };
  if (!m || (m.heldKbps <= 0 && m.saturatedKbps == null)) return { level: 'unknown', text: `These need about ${mbps(want)} of upload. Not measured yet: a Test measures it.` };
  if (m.saturatedKbps != null && m.saturatedKbps < want) return { level: 'short', text: `These need about ${mbps(want)}; the last stream's upload topped out at ${mbps(m.saturatedKbps)}. Turn one off, or stream 720p.` };
  if (m.heldKbps >= want || (m.saturatedKbps != null && m.saturatedKbps >= want)) return { level: 'ok', text: `These need about ${mbps(want)}; the last stream carried ${mbps(Math.max(m.heldKbps, m.saturatedKbps ?? 0))}.` };
  return { level: 'unproven', text: `These need about ${mbps(want)}; the last stream carried ${mbps(m.heldKbps)} and never filled the link. A Test with all of them says whether it holds.` };
}

/**
 * One reading of the destinations into the session's upload. Kept up: every
 * destination live and none half a second behind, so the link carried their
 * sum with room. Behind: one more than a second behind on the server's own
 * count (`measuredAt` 'server'; a socket-only count sees the Mac's buffer,
 * not the link, 37x-4c), so their sum was all it carried. Exported for the check.
 */
export function noteUpload(u: { heldKbps: number; saturatedKbps: number | null }, ds: LiveDestinationHealth[]): boolean {
  const live = ds.filter((d) => d.phase === 'live');
  if (live.length === 0 || live.length < ds.length) return false;
  const sum = live.reduce((s, d) => s + d.kbps, 0);
  if (sum <= 0) return false;
  if (live.some((d) => d.secondsBehind > 1 && d.measuredAt === 'server')) {
    if (u.saturatedKbps == null || sum > u.saturatedKbps) { u.saturatedKbps = sum; return true; }
  } else if (live.every((d) => d.secondsBehind < 0.5) && sum > u.heldKbps) { u.heldKbps = sum; return true; }
  return false;
}

// --- The one stream ------------------------------------------------------------

export interface LiveShowState {
  phase: LiveState['phase'];
  /** Streaming to the destinations for tests. */
  test: boolean;
  error: string | null;
  seconds: number;
  names: string[];
  destinations: LiveDestinationHealth[];
  frames: number;
  skipped: number;
  grabMs: number;
}
const IDLE: LiveShowState = { phase: 'idle', test: false, error: null, seconds: 0, names: [], destinations: [], frames: 0, skipped: 0, grabMs: 0 };

let snap: LiveShowState = IDLE;
const listeners = new Set<() => void>();
export const liveShowState = () => snap;
export function subscribeLiveShow(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
function publish(next: LiveShowState) { snap = next; for (const l of listeners) l(); }
export const useLiveShow = () => useSyncExternalStore(subscribeLiveShow, liveShowState, liveShowState);
export const onAir = (s: LiveShowState) => s.phase === 'live' || s.phase === 'starting';

interface Deps { canvas: () => HTMLCanvasElement | null; audio: () => MediaStream | null; allowed: () => boolean }
let deps: Deps | null = null;
let current: LiveEncoder | null = null;
let testing = false;
let names: string[] = [];
let poll: ReturnType<typeof setInterval> | null = null;
let upload: { heldKbps: number; saturatedKbps: number | null } | null = null;

function show(s: LiveState): LiveShowState {
  return {
    phase: s.phase, test: testing, error: s.error, seconds: Math.floor(s.seconds), names,
    destinations: s.transport?.destinations ?? [], frames: s.frames, skipped: s.skipped, grabMs: s.timing.grabMs,
  };
}

/** A reading a second while on air: the readout, and the upload it shows. */
async function tick() {
  if (!current) return;
  const s = await current.refresh();
  if (upload && noteUpload(upload, s.transport?.destinations ?? [])) write(UPLOAD_KEY, { ...upload, at: new Date().toISOString() });
  publish(show(s));
  if (s.phase !== 'live' && s.phase !== 'starting' && poll) { clearInterval(poll); poll = null; }
}

/** Whether this page can stream: the Mac app, with the console installed. */
export const liveAvailable = () => nativeLive() !== null && deps !== null;
export const liveAllowed = () => deps?.allowed() ?? false;

export async function startLive(o: LiveConsoleOptions & { test?: boolean }): Promise<LiveState> {
  const native = nativeLive();
  if (!native || !deps) throw new Error('the live show streams from the Mac app');
  if (!deps.allowed()) throw new Error('the live show is a Pro feature');
  if (current && onAir(show(current.state()))) throw new Error('already live: stop() first');
  const canvas = deps.canvas();
  if (!canvas) throw new Error('no plate to stream');
  const { outputs, destinations } = liveConsolePlan(o);
  if (destinations.length === 0 || destinations.some((d) => !d.url)) throw new Error('nowhere to stream to');
  const transport: LiveTransport = {
    start: (req) => native.start(req),
    config: (cfg) => native.config(cfg),
    packet: (p) => native.packet(p),
    stop: () => native.stop(),
    state: () => native.state(),
  };
  testing = o.test === true;
  names = destinations.map((d) => d.name ?? d.url);
  upload = { heldKbps: 0, saturatedKbps: null };
  const enc = new LiveEncoder({ canvas, audio: deps.audio(), transport, outputs, destinations, fps: o.fps ?? 30, audioBitrate: o.audioBitrate, acceleration: o.acceleration, source: o.source });
  current = enc;
  publish({ ...IDLE, phase: 'starting', test: testing, names });
  try {
    await enc.start();
  } catch (e) {
    publish({ ...show(enc.state()), error: enc.state().error ?? String((e as Error)?.message ?? e) });
    throw e;
  }
  publish(show(enc.state()));
  if (!poll) poll = setInterval(() => { void tick(); }, 1000);
  return enc.state();
}

export async function stopLive(): Promise<LiveState | null> {
  if (!current) return null;
  const s = await current.stop();
  if (poll) { clearInterval(poll); poll = null; }
  publish(show(s));
  return s;
}

/**
 * Installed once in the Mac app (useAudioAnalyzer, where the show's sound
 * and the plate meet): the controller's sources, and `window.__cgLive`,
 * the console the checks and the owner drive: `start({ url, keyName })` for
 * one destination or `start({ destinations: [{ name, url, keyName,
 * orientation }] })` for several (37x-4c), `stop()`, `state()` (with each
 * destination's health under `transport.destinations`), `probe({ width,
 * height, fps })`, `keys.set(name, key)`, `keys.list()`, `keys.remove(name)`.
 * `allowed` is the Pro gate, asked at each start. Outside the app (no
 * RTMPS client to hand the packets to) it does nothing.
 */
export function installLiveConsole(d: Deps): void {
  const native = nativeLive();
  if (!native) return;
  if (deps) { deps = d; return; }
  deps = d;
  native.onEvent((e) => {
    if (current) current['transportState'] = e.state;
    // One destination lost or refused is the session's to retry; only the whole session ending stops the encode.
    if ((e.event === 'failed' || e.event === 'closed') && current && current.state().phase === 'live') void stopLive();
    else if (current) publish(show(current.state()));
  });
  const api = {
    start: (o: LiveConsoleOptions) => startLive(o),
    stop: () => stopLive(),
    state: () => current ? current.refresh() : Promise.resolve(null),
    /** Each encoder hint timed at a size (the check's diagnostic; `probeVideoEncoder`). */
    probe: (o: { width?: number; height?: number; fps?: number } = {}) => probeVideoEncoders(o.width ?? 1920, o.height ?? Math.round((o.width ?? 1920) * 9 / 16), o.fps ?? 30),
    keys: native.keys,
  };
  (globalThis as unknown as { __cgLive?: unknown }).__cgLive = api;
}
