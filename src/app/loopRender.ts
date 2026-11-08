import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { SongRenderHost, SongRenderState } from '../hooks/useSongRender';
import { beginFixedClock, endFixedClock, tickFixedClock } from '../lib/showClock';
import { setShowSeed, showSeed } from '../lib/rng';
import { decodeSong, SongEar, type DecodedSong } from '../lib/songTrack';
import type { LevelParams } from '../lib/soundLevels';
import {
  avcCodec,
  frameTiming,
  openRenderSink,
  RenderCancelled,
  RenderEncoder,
  renderSupport,
  videoBitrate,
  vp9Codec,
  type RenderFormat,
  type RenderSink,
} from '../lib/render';
import {
  drawChromaGlassWatermark,
  FREE_RENDER_MAX_HEIGHT,
  isFreeTierGated,
} from '../lib/tierGates';
import {
  blendRgba,
  fadeWeight,
  LOOP_DEFAULT_SECONDS,
  LOOP_FADE_SECONDS,
  LOOP_MAX_SECONDS,
  LOOP_MIN_SECONDS,
  LOOP_SEARCH_EXTRA_SECONDS,
  LOOP_THUMB_SIZE,
  pickLoudestWindow,
  pickSeam,
  rgbaToGrey,
} from '../lib/loopSeam';

/**
 * Render a seamless Canvas loop from the loaded song (PLAN 43b).
 *
 * A real fluid never repeats, so a loop is an edit of the finished film's
 * frames and never a trick in the plate shader or the solver:
 *
 *   1. Decode the song and find the search window (`loopFrames + fadeFrames`
 *      plus ~2 s of search margin). Unless the person typed a start time, the
 *      window begins at the song's loudest stretch measured from the offline
 *      bands (`SongEar`, PLAN §6).
 *   2. Pass 1 (seam search): lay the look from `seed` on the fixed show clock
 *      and step the plate across the search window, downscaling each frame to a
 *      64x64 grey thumbnail (4 KB) and closing the full-size `VideoFrame` at
 *      once. `pickSeam` chooses the start offset `s` whose frames `s` and
 *      `s + loopFrames` are closest.
 *   3. Pass 2 (render and encode): reset the clock, seed, app state and plate
 *      to the exact starting state of Pass 1 (a render is frame-exact on a
 *      seed, `npm run render-app`). Step to `s`, hold only the half-second
 *      fade's early frames (`s .. s + fadeFrames - 1`), stream the middle
 *      frames (`s + fadeFrames .. s + loopFrames - 1`) straight to the H.264
 *      encoder, and finish by blending the held early frames with the late
 *      frames (`s + loopFrames .. s + loopFrames + fadeFrames - 1`) using
 *      `fadeWeight(u + 1, fadeFrames)`.
 *
 * Writing the crossfade last means at most half a second of uncompressed RGBA
 * frames (15 frames at 30 fps) is ever held in memory instead of the whole
 * loop, and the last frame in the file (`u = fadeFrames - 1`, weight 1 on
 * `s + fadeFrames - 1`) wraps into the first frame in the file (`s + fadeFrames`)
 * as a single ordinary step of the unedited film.
 */

export interface LoopOptions {
  /** Loop duration in seconds (clamped to 3..8, default 8). */
  seconds: number;
  /** Optional start time in the song (seconds); absent picks the loudest stretch. */
  startSec?: number;
  /** When false (for `npm run loopseam -- --app`'s control), renders the same pick with no crossfade. */
  crossfade?: boolean;
}

export interface LoopRenderRequest {
  song: string | Blob;
  name: string;
  width: number;
  height: number;
  fps: number;
  seed: number;
  levels: LevelParams;
  loop: LoopOptions;
  test?: { keepInMemory: boolean };
}

export interface LoopRenderState extends SongRenderState {
  loop?: { startFrame: number; seconds: number; distance: number } | null;
}

const IDLE: LoopRenderState = {
  phase: 'idle',
  frame: 0,
  frames: 0,
  message: '',
  format: null,
  elapsedS: 0,
  remainingS: null,
  summary: null,
  frameHashes: null,
  frameDigests: null,
  bytes: null,
  loop: null,
};

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

async function pickLoopFormat(width: number, height: number, fps: number): Promise<RenderFormat | null> {
  if (!renderSupport().webcodecs) return null;
  const candidates = [
    { videoCodec: avcCodec(width, height, fps), label: 'H.264 in MP4 (no audio)' },
    { videoCodec: vp9Codec(width, height, fps), label: 'VP9 in MP4 (no audio)' },
  ];
  for (const c of candidates) {
    const vb = videoBitrate(c.videoCodec, width, height, fps);
    try {
      const cfg: VideoEncoderConfig = {
        codec: c.videoCodec,
        width,
        height,
        bitrate: vb,
        framerate: fps,
        latencyMode: 'quality',
        ...(c.videoCodec.startsWith('avc1') ? { avc: { format: 'avc' } } : {}),
      } as VideoEncoderConfig;
      const v = await VideoEncoder.isConfigSupported(cfg);
      if (!v.supported) continue;
      return {
        container: 'mp4',
        videoCodec: c.videoCodec,
        audioCodec: 'aac',
        audioCodecString: 'mp4a.40.2',
        label: c.label,
        ext: 'mp4',
        mime: 'video/mp4',
        videoBitrate: vb,
        audioBitrate: 0,
      };
    } catch {
      /* try next codec */
    }
  }
  return null;
}

/**
 * Extract the `windowFrames` of offline audio readings for the search window.
 * When `startSec` is not given, scans the song's offline bands (`SongEar`) to
 * locate the loudest contiguous stretch of `windowFrames` first.
 */
function buildWindowAudio(
  mono: Float32Array,
  sampleRate: number,
  fps: number,
  levels: LevelParams,
  windowFrames: number,
  startSec?: number,
): { windowStart: number; windowAudio: AudioData[] } {
  const firstEar = new SongEar(mono, sampleRate, fps, levels);
  const totalFrames = firstEar.frames;
  if (startSec !== undefined && Number.isFinite(startSec)) {
    const windowStart = Math.max(0, Math.min(totalFrames - windowFrames, Math.round(startSec * fps)));
    for (let i = 0; i < windowStart; i++) firstEar.next();
    const windowAudio: AudioData[] = [];
    for (let i = 0; i < windowFrames; i++) windowAudio.push(firstEar.next());
    return { windowStart, windowAudio };
  }

  // For songs up to a minute, keep the readings from the single scan pass; for
  // longer tracks, keep only the per-frame band sum (4 bytes a frame) during
  // the scan and re-read the chosen window so we never hold a long song's
  // spectra in memory.
  const keepAll = totalFrames <= 60 * fps;
  const allAudio: AudioData[] | null = keepAll ? [] : null;
  const energy = new Float32Array(totalFrames);
  for (let i = 0; i < totalFrames; i++) {
    const a = firstEar.next();
    if (allAudio) allAudio.push(a);
    const bands = a.features?.bands;
    let sum = 0;
    if (bands) for (let b = 0; b < bands.length; b++) sum += bands[b];
    energy[i] = sum;
  }
  const windowStart = pickLoudestWindow(energy, windowFrames);
  if (allAudio) {
    return { windowStart, windowAudio: allAudio.slice(windowStart, windowStart + windowFrames) };
  }
  const secondEar = new SongEar(mono, sampleRate, fps, levels);
  for (let i = 0; i < windowStart; i++) secondEar.next();
  const windowAudio: AudioData[] = [];
  for (let i = 0; i < windowFrames; i++) windowAudio.push(secondEar.next());
  return { windowStart, windowAudio };
}

export function useLoopRender(host: SongRenderHost) {
  const [state, setState] = useState<LoopRenderState>(IDLE);
  const hostRef = useRef(host);
  hostRef.current = host;
  const cancelRef = useRef<(() => void) | null>(null);
  const running = state.phase === 'preparing' || state.phase === 'audio' || state.phase === 'frames' || state.phase === 'finishing';

  const cancel = useCallback(() => { cancelRef.current?.(); }, []);
  const reset = useCallback(() => setState(IDLE), []);

  const start = useCallback(async (req: LoopRenderRequest): Promise<LoopRenderState> => {
    const began = performance.now();
    let cancelled = false;
    let encoder: RenderEncoder | null = null;
    let sink: RenderSink | null = null;
    cancelRef.current = () => { cancelled = true; void encoder?.cancel(); };
    const elapsed = () => (performance.now() - began) / 1000;
    let last: LoopRenderState = { ...IDLE, phase: 'preparing', message: 'Choosing a format…' };
    const set = (patch: Partial<LoopRenderState>) => {
      last = { ...last, ...patch, elapsedS: elapsed() };
      setState(last);
      return last;
    };
    set({});
    const support = renderSupport();

    const freeGated = isFreeTierGated();
    let renderWidth = req.width;
    let renderHeight = req.height;
    if (freeGated && (req.height > FREE_RENDER_MAX_HEIGHT || req.width > 1280)) {
      if (req.height > req.width) {
        renderWidth = FREE_RENDER_MAX_HEIGHT;
        renderHeight = 1280;
      } else if (req.height === req.width) {
        renderWidth = FREE_RENDER_MAX_HEIGHT;
        renderHeight = FREE_RENDER_MAX_HEIGHT;
      } else {
        renderWidth = 1280;
        renderHeight = FREE_RENDER_MAX_HEIGHT;
      }
    }

    const loopSeconds = Math.max(LOOP_MIN_SECONDS, Math.min(LOOP_MAX_SECONDS, req.loop.seconds || LOOP_DEFAULT_SECONDS));
    const crossfade = req.loop.crossfade !== false;
    const loopFrames = Math.round(loopSeconds * req.fps);
    const fadeFrames = Math.max(1, Math.round(LOOP_FADE_SECONDS * req.fps));

    let format: RenderFormat | null = null;
    let song: DecodedSong | null = null;
    let restoreApp: (() => void) | null = null;
    let clockTaken = false;
    let seedBefore: number | null = null;
    let plateTaken = false;
    try {
      if (!support.webcodecs) {
        return set({ phase: 'failed', message: 'This browser cannot render a loop: it has no WebCodecs (Chrome and Edge do).' });
      }
      format = await pickLoopFormat(renderWidth, renderHeight, req.fps);
      if (!format) {
        return set({ phase: 'failed', message: `This browser cannot encode ${renderWidth}x${renderHeight} at ${req.fps} fps in MP4.` });
      }
      set({
        format: `${format.label}${support.streamsToDisk && !req.test?.keepInMemory ? ', written to disk as it renders' : ', kept in memory and downloaded at the end'}`,
        watermarked: freeGated,
        renderedWidth: renderWidth,
        renderedHeight: renderHeight,
      });
      const base = `${req.name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'song'}-canvas_${renderWidth}x${renderHeight}_${loopSeconds}s_seed${req.seed}_${stamp()}`;
      try {
        sink = await openRenderSink(`${base}.${format.ext}`, format, !!req.test?.keepInMemory);
      } catch {
        return set({ phase: 'cancelled', message: 'No file chosen: nothing was rendered.' });
      }
      if (req.test?.keepInMemory && sink.kind === 'memory') {
        const inner = sink;
        sink = { ...inner, close: async () => {} };
      }

      set({ message: 'Hearing the song…' });
      song = await decodeSong(req.song, 48000);
      // A Canvas loop carries no audio track; only the mono mix is needed for the ear.
      song.channels = [];
      const totalSongFrames = Math.ceil((song.mono.length * req.fps) / song.sampleRate);
      if (totalSongFrames < loopFrames + fadeFrames) {
        throw new Error(`the song (${song.seconds.toFixed(1)} s) is shorter than a ${loopSeconds} s loop and its ${LOOP_FADE_SECONDS} s crossfade`);
      }
      const searchExtraFrames = Math.round(LOOP_SEARCH_EXTRA_SECONDS * req.fps);
      const windowFrames = Math.min(totalSongFrames, Math.max(loopFrames + fadeFrames, loopFrames + searchExtraFrames));
      const { windowStart, windowAudio } = buildWindowAudio(
        song.mono,
        song.sampleRate,
        req.fps,
        req.levels,
        windowFrames,
        req.loop.startSec,
      );
      if (cancelled) throw new RenderCancelled();

      const plate = hostRef.current.render();
      if (!plate) throw new Error('the plate is not up yet: wait for the picture, then render');

      // ── Pass 1: render the search window to 64x64 grey thumbnails and pick the seam ──
      restoreApp = hostRef.current.prepare();
      seedBefore = showSeed();
      setShowSeed(req.seed);
      beginFixedClock(req.fps);
      clockTaken = true;
      plateTaken = true;
      const laid = await plate.begin({ fps: req.fps, width: renderWidth, height: renderHeight });

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = LOOP_THUMB_SIZE;
      thumbCanvas.height = LOOP_THUMB_SIZE;
      const thumbCtx = thumbCanvas.getContext('2d', { willReadFrequently: true });
      if (!thumbCtx) throw new Error('could not create 64x64 thumbnail canvas');

      const thumbs: Uint8Array[] = [];
      let shown = performance.now();
      // Total plate steps across both passes (estimated before pickSeam as windowFrames + loopFrames + fadeFrames).
      const estTotalSteps = windowFrames + loopFrames + fadeFrames;
      set({
        phase: 'frames',
        frames: estTotalSteps,
        message: `Finding the cleanest loop seam on ${laid.lookId}…`,
      });
      for (let f = 0; f < windowFrames; f++) {
        if (cancelled) throw new RenderCancelled();
        const audio = windowAudio[f];
        flushSync(() => {
          if (f > 0) tickFixedClock();
          hostRef.current.setAudio(audio);
        });
        const { timestampUs, durationUs } = frameTiming(f, req.fps);
        const raw = plate.step(audio, timestampUs, durationUs);
        try {
          thumbCtx.drawImage(raw, 0, 0, LOOP_THUMB_SIZE, LOOP_THUMB_SIZE);
        } finally {
          raw.close();
        }
        thumbs.push(rgbaToGrey(thumbCtx.getImageData(0, 0, LOOP_THUMB_SIZE, LOOP_THUMB_SIZE).data));
        await plate.settle();
        const now = performance.now();
        if (now - shown > 250) {
          shown = now;
          const rate = (f + 1) / Math.max(1e-3, elapsed());
          set({ frame: f + 1, remainingS: Math.max(0, (estTotalSteps - f - 1) / rate) });
        }
      }

      const pick = pickSeam(thumbs, loopFrames, fadeFrames);
      thumbs.length = 0;
      const s = pick.start;
      const startFrame = windowStart + s;
      const pass2Steps = s + loopFrames + fadeFrames;
      const totalSteps = windowFrames + pass2Steps;

      // Reset clock, plate, sound and app state before Pass 2 so Pass 2 starts
      // from the exact state Pass 1 began in on `req.seed`.
      endFixedClock();
      clockTaken = false;
      setShowSeed(seedBefore);
      plate.end();
      plateTaken = false;
      hostRef.current.setAudio(null);
      restoreApp();
      restoreApp = null;

      // ── Pass 2: render from the picked start and encode the seamless loop ──
      restoreApp = hostRef.current.prepare();
      setShowSeed(req.seed);
      beginFixedClock(req.fps);
      clockTaken = true;
      plateTaken = true;
      await plate.begin({ fps: req.fps, width: renderWidth, height: renderHeight });

      encoder = new RenderEncoder({
        format,
        width: renderWidth,
        height: renderHeight,
        fps: req.fps,
        sink,
        audio: null,
      });
      const enc = encoder;

      let workCanvas: HTMLCanvasElement | null = null;
      let workCtx: CanvasRenderingContext2D | null = null;
      let workImg: ImageData | null = null;
      if (crossfade || freeGated) {
        workCanvas = document.createElement('canvas');
        workCanvas.width = renderWidth;
        workCanvas.height = renderHeight;
        workCtx = workCanvas.getContext('2d', { willReadFrequently: crossfade });
        if (!workCtx) throw new Error('could not create loop blend canvas');
        if (crossfade) workImg = workCtx.createImageData(renderWidth, renderHeight);
      }

      const heldFade: (Uint8ClampedArray | null)[] = new Array(fadeFrames).fill(null);
      set({
        frames: totalSteps,
        message: `Encoding ${loopSeconds} s loop from ${(startFrame / req.fps).toFixed(1)} s…`,
      });

      for (let f = 0; f < pass2Steps; f++) {
        if (cancelled) throw new RenderCancelled();
        const audio = windowAudio[f];
        flushSync(() => {
          if (f > 0) tickFixedClock();
          hostRef.current.setAudio(audio);
        });

        if (f < s) {
          // Advance the plate to the picked seam start `s`.
          const { timestampUs, durationUs } = frameTiming(f, req.fps);
          const raw = plate.step(audio, timestampUs, durationUs);
          raw.close();
        } else if (f < s + fadeFrames) {
          // Early half-second of the seam (`s .. s + fadeFrames - 1`): hold
          // only these `fadeFrames` frames so they can be blended at the end.
          const u = f - s;
          const { timestampUs, durationUs } = frameTiming(f, req.fps);
          const raw = plate.step(audio, timestampUs, durationUs);
          try {
            if (crossfade && workCtx) {
              workCtx.drawImage(raw, 0, 0, renderWidth, renderHeight);
              if (freeGated) drawChromaGlassWatermark(workCtx, renderWidth, renderHeight);
              heldFade[u] = workCtx.getImageData(0, 0, renderWidth, renderHeight).data;
            }
          } finally {
            raw.close();
          }
        } else if (f < s + loopFrames) {
          // Middle of the loop (`s + fadeFrames .. s + loopFrames - 1`):
          // streamed straight to the encoder as frames `0 .. loopFrames - fadeFrames - 1`.
          await enc.addFrame((ts, dur) => {
            const raw = plate.step(audio, ts, dur);
            if (freeGated && workCanvas && workCtx) {
              workCtx.drawImage(raw, 0, 0, renderWidth, renderHeight);
              drawChromaGlassWatermark(workCtx, renderWidth, renderHeight);
              raw.close();
              return new VideoFrame(workCanvas, { timestamp: ts, duration: dur });
            }
            return raw;
          });
        } else {
          // Late half-second (`s + loopFrames .. s + loopFrames + fadeFrames - 1`):
          // blended with `heldFade[u]` using `fadeWeight(u + 1, fadeFrames)` so
          // the last frame of the file lands at weight 1 (`s + fadeFrames - 1`),
          // one ordinary film step before frame 0 (`s + fadeFrames`).
          const u = f - (s + loopFrames);
          await enc.addFrame((ts, dur) => {
            const raw = plate.step(audio, ts, dur);
            if (!crossfade) {
              if (freeGated && workCanvas && workCtx) {
                workCtx.drawImage(raw, 0, 0, renderWidth, renderHeight);
                drawChromaGlassWatermark(workCtx, renderWidth, renderHeight);
                raw.close();
                return new VideoFrame(workCanvas, { timestamp: ts, duration: dur });
              }
              return raw;
            }
            const early = heldFade[u];
            heldFade[u] = null;
            workCtx!.drawImage(raw, 0, 0, renderWidth, renderHeight);
            if (freeGated) drawChromaGlassWatermark(workCtx!, renderWidth, renderHeight);
            raw.close();
            if (early && workImg) {
              const w = fadeWeight(u + 1, fadeFrames);
              if (w >= 1) {
                workImg.data.set(early);
              } else {
                const late = workCtx!.getImageData(0, 0, renderWidth, renderHeight).data;
                blendRgba(early, late, w, workImg.data);
              }
              workCtx!.putImageData(workImg, 0, 0);
            }
            return new VideoFrame(workCanvas!, { timestamp: ts, duration: dur });
          });
        }

        await plate.settle();
        const doneSteps = windowFrames + f + 1;
        const now = performance.now();
        if (now - shown > 250 || f === pass2Steps - 1) {
          shown = now;
          const rate = doneSteps / Math.max(1e-3, elapsed());
          set({ frame: doneSteps, remainingS: Math.max(0, (totalSteps - doneSteps) / rate) });
        }
      }

      set({ phase: 'finishing', message: 'Finishing the loop file…' });
      const summary = await enc.finish();
      return set({
        phase: 'done',
        summary,
        frame: totalSteps,
        frames: totalSteps,
        remainingS: 0,
        bytes: req.test?.keepInMemory ? sink.bytes?.() ?? null : null,
        watermarked: freeGated,
        renderedWidth: renderWidth,
        renderedHeight: renderHeight,
        loop: { startFrame, seconds: loopSeconds, distance: pick.distance },
        message: `Rendered ${loopSeconds} s Canvas loop (${loopFrames} frames from ${(startFrame / req.fps).toFixed(1)} s) in ${Math.round(elapsed())} s: ${(summary.bytes / 1e6).toFixed(1)} MB of ${format.label}.`,
      });
    } catch (e) {
      const wasCancelled = e instanceof RenderCancelled || cancelled;
      await encoder?.cancel().catch(() => {});
      const left = await sink?.abort().catch(() => null);
      const leftover = left?.left === 'left-empty'
        ? ` An empty file, ${left.name}, is left where you chose to save it; the browser would not remove it.`
        : '';
      if (wasCancelled) {
        return set({ phase: 'cancelled', message: `Cancelled: nothing was kept.${leftover}` });
      }
      console.error('ChromaGlass: the loop render failed', e);
      return set({ phase: 'failed', message: `The loop render failed: ${(e instanceof Error ? e.message : String(e)).replace(/\.?$/, '.')}${leftover}` });
    } finally {
      const step = (what: string, fn: () => void) => {
        try { fn(); } catch (e) { console.error(`ChromaGlass: after the loop render, ${what} failed`, e); }
      };
      if (clockTaken) step('handing back the clock', () => endFixedClock());
      if (seedBefore !== null) { const s = seedBefore; step('putting the seed back', () => setShowSeed(s)); }
      if (plateTaken) step('handing back the plate', () => hostRef.current.render()?.end());
      step('handing back the sound', () => hostRef.current.setAudio(null));
      if (restoreApp) { const r = restoreApp; step('putting the show back', () => r()); }
      cancelRef.current = null;
    }
  }, []);

  return { state, running, start, cancel, reset };
}
