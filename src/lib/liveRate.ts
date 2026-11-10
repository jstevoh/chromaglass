/**
 * The live stream's video rate (PLAN.md 37x-4h): how many bits a second each
 * encode is given, for the size and frame rate the owner chose, the places it
 * goes and the upload the last stream measured.
 *
 * What was reported (2026-11-10, the private rehearsal): the stream on
 * YouTube looked softer and flatter than the app beside it. The colours were
 * the same (the canvas is sRGB and so is the stream); the bits were not. The
 * stream took its rate from render.ts's `videoBitrate`, the rate Record's
 * films use: 0.1 bit a pixel a frame, 6.2 Mb/s at 1080p30, and the panel
 * streamed 30 frames a second while the app draws 60. About 790 kB/s went
 * up to YouTube. A film is written once and kept; a stream is compressed by
 * us in real time with no second pass, then decoded and compressed again by
 * YouTube for every viewer's ladder rung, so whatever fine grain, thin rim
 * or dark edge our encode gave up is gone before YouTube starts, and its own
 * pass takes more. Fluid on glass is the worst case for that: the whole frame
 * moves a little every frame, with detail at every scale, and none of it is
 * the flat sky or still background an encoder saves its bits on.
 *
 * Why not the film's rule with a bigger number: bits a pixel a frame says a
 * 60 fps stream needs twice a 30 fps one. It does not. At twice the frames
 * each frame differs from the last by half as much, and an H.264 P-frame
 * pays for the difference, not the picture. Encoders' own guidance and
 * YouTube's table both land near the square root: 1080p60 asks about one and
 * a half times 1080p30, not two. So the rate here is `pixels × √fps × K`,
 * with K set so that 1080p60 is 14 Mb/s, inside what YouTube's live encoder
 * page recommends for 1080p60 H.264 (docs/live-show.md quotes 6 Mb/s as its
 * floor and about 17 as its top): 9.9 Mb/s at 1080p30, 6.2 at 720p60, 4.4 at
 * 720p30, the portrait 720x1280 encode the same as 720p. Against the film
 * rule: 1080p30 goes from 6.2 to 9.9 Mb/s, and 1080p60 from 12.4 to 14.
 * Most of what the rehearsal lost was the 30: the panel now opens at 60 fps
 * (`DEFAULT_FORMAT`), the rate the plate is drawn at.
 *
 * Each platform takes only so much: Twitch's ingest holds a stream under
 * about 6 Mb/s of video unless it is a partner's (more and it drops frames or
 * refuses), Kick about 8, Facebook and X about 9. One landscape encode goes to
 * every landscape destination (liveSession.js writes the same packets to each
 * socket), so it goes at the least any of them takes: with YouTube and Twitch
 * on together both get Twitch's 6. A second landscape encode just for YouTube
 * would cost the Mac a second encoder and a second readback of the plate;
 * that is 37x-4h-1, not this. The numbers move: docs/live-show.md says to
 * check a platform's page on the day before relying on one.
 *
 * And the link: when the last stream filled the upload (`saturatedKbps`, a
 * destination more than a second behind on the server's own count, liveShow's
 * `noteUpload`), this stream's video is scaled down to fit it with the 20%
 * headroom the research asks for, never below the floor. A stream that falls
 * behind is cut by the session (2 s behind) and reconnects: a sharp picture
 * that stutters and drops is worse than a slightly softer one that holds.
 * What is measured is the last stream's ceiling, so a stream fitted to it
 * never fills the link and never measures it again; liveShow keeps the
 * ceiling until a stream carries more than it, or for half a day at most
 * (`keepCeiling`): a ceiling met on a bad minute of hotel Wi-Fi must not
 * soften every show after it on a wired link. Turning the
 * rate down while on air, when the link sags mid-show, is 37x-4h-2.
 *
 * Record keeps render.ts's rate: a file is not recompressed by a live
 * ladder, and its size is the owner's disk.
 */
import { avcCodec } from './render';
import type { LiveFormat, LiveServiceId, LiveOrientation, LiveUpload } from './liveShow';

/** The sound's rate on every stream, kilobits a second (LiveEncoder's default `audioBitrate`). */
export const AUDIO_KBPS = 160;
/** The headroom docs/live-show.md asks for over the sum of the destinations' bitrates. */
export const HEADROOM = 1.2;

/** bits a second per pixel per √(frames a second): 14 Mb/s at 1920x1080 and 60 fps. */
export const LIVE_RATE_K = 14e6 / (1920 * 1080 * Math.sqrt(60));
/** No encode below this, however short the link: under it 720p turns to blocks on every swirl. */
export const LIVE_FLOOR_KBPS = 2000;
/** Nor above it: past here a link, not the picture, is the limit. */
export const LIVE_CEILING_KBPS = 40000;

/** A stream's video rate, bits a second, for its size and frame rate, before any platform's cap or the link. */
export function liveVideoBitrate(width: number, height: number, fps: number): number {
  const r = width * height * Math.sqrt(Math.max(1, fps)) * LIVE_RATE_K;
  return Math.round(Math.min(LIVE_CEILING_KBPS * 1000, Math.max(LIVE_FLOOR_KBPS * 1000, r)));
}

/**
 * The H.264 configuration every live encode runs (LiveEncoder's outputs and
 * its speed probe): constant bitrate, realtime, length-prefixed NALs for the
 * FLV tags. One place, so `npm run live`'s rate line measures the same
 * configuration the stream uses, not a copy of it.
 */
export function liveVideoConfig(width: number, height: number, fps: number, bitrate: number, hardwareAcceleration?: HardwareAcceleration): VideoEncoderConfig {
  return {
    codec: avcCodec(width, height, fps), width, height, framerate: fps, bitrate, bitrateMode: 'constant', latencyMode: 'realtime',
    ...(hardwareAcceleration ? { hardwareAcceleration } : {}), avc: { format: 'avc' },
  } as VideoEncoderConfig;
}

/**
 * The most video each platform's ingest takes, kilobits a second, or null
 * for none we know of (YouTube takes far more than 1080p needs; a server the
 * owner pasted is the owner's). From the platforms' help pages, 2026-11-10.
 */
export const SERVICE_MAX_KBPS: Record<LiveServiceId, number | null> = {
  youtube: null, twitch: 6000, kick: 8000, facebook: 9000, x: 9000, instagram: 4000, tiktok: 6000, other: null,
};

/** Why an encode goes at less than its size asks for. */
export type LiveRateLimit = 'size' | 'platform' | 'upload';
/** An encode's rate; `wanted` what it would go at without the limit named (the size's rate, or the platform's ceiling when the upload limits it); `by` the platform whose ceiling applied. */
export interface LiveEncodeRate { kbps: number; wanted: number; limit: LiveRateLimit; by?: LiveServiceId }
export interface LiveRates { landscape: LiveEncodeRate | null; portrait: LiveEncodeRate | null }

/** The two encodes' sizes for a format: the landscape one 16:9 at its height, the portrait one 720x1280 (liveConsolePlan's). */
export const landscapeSize = (f: LiveFormat) => ({ width: Math.round(f.height * 16 / 9), height: f.height });
export const PORTRAIT_SIZE = { width: 720, height: 1280 };

/**
 * The rate of each encode the destinations need: the size's rate, capped by
 * the strictest platform on that encode, then fitted to the last stream's
 * measured ceiling when the sum (each destination its own copy, plus its
 * sound) would not fit under it with the headroom.
 */
export function liveRates(list: { service: LiveServiceId; orientation: LiveOrientation }[], f: LiveFormat, upload?: LiveUpload | null, now = Date.now()): LiveRates {
  const one = (o: LiveOrientation, size: { width: number; height: number }): LiveEncodeRate | null => {
    const on = list.filter((d) => d.orientation === o);
    if (on.length === 0) return null;
    const wanted = Math.round(liveVideoBitrate(size.width, size.height, f.fps) / 1000);
    let r: LiveEncodeRate = { kbps: wanted, wanted, limit: 'size' };
    for (const d of on) {
      const cap = SERVICE_MAX_KBPS[d.service];
      if (cap != null && cap < r.kbps) r = { kbps: cap, wanted, limit: 'platform', by: d.service };
    }
    return r;
  };
  const rates: LiveRates = { landscape: one('landscape', landscapeSize(f)), portrait: one('portrait', PORTRAIT_SIZE) };
  const ceiling = upload?.saturatedKbps;
  if (ceiling == null || ceiling <= 0 || !ceilingFresh(upload?.saturatedAt ?? upload?.at, now)) return rates;
  const copies = (o: LiveOrientation) => list.filter((d) => d.orientation === o).length;
  const video = (rates.landscape?.kbps ?? 0) * copies('landscape') + (rates.portrait?.kbps ?? 0) * copies('portrait');
  const room = ceiling / HEADROOM - AUDIO_KBPS * list.length;
  if (video <= 0 || video <= room) return rates;
  const scale = Math.max(0, room) / video;
  for (const k of ['landscape', 'portrait'] as const) {
    const r = rates[k];
    if (r) rates[k] = { kbps: Math.max(LIVE_FLOOR_KBPS, Math.round(r.kbps * scale)), wanted: r.kbps, limit: 'upload', ...(r.by ? { by: r.by } : {}) };
  }
  return rates;
}

/** How long a measured ceiling is trusted: a show's evening, not the next week's. */
export const CEILING_HOURS = 12;
const ceilingFresh = (at: string | undefined, now: number) => {
  const t = at ? Date.parse(at) : NaN;
  return Number.isFinite(t) && now - t <= CEILING_HOURS * 3600e3;
};

/**
 * The ceiling to keep after a stream (see the header): the one it measured
 * (`fresh`), or, when it never filled the link, the one before with its own
 * time, while it is under half a day old and no stream has carried more than
 * it (the link got faster, or the ceiling was a bad minute). Exported for the
 * check.
 */
export function keepCeiling(cur: { heldKbps: number; saturatedKbps: number | null }, before: LiveUpload | null, now = Date.now()): { kbps: number; at: string; fresh: boolean } | null {
  if (cur.saturatedKbps != null) return { kbps: cur.saturatedKbps, at: new Date(now).toISOString(), fresh: true };
  const old = before?.saturatedKbps ?? null;
  const at = before?.saturatedAt ?? before?.at;
  return old != null && cur.heldKbps < old && ceilingFresh(at, now) ? { kbps: old, at: at!, fresh: false } : null;
}
