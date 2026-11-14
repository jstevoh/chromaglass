import { useCallback, useEffect, useRef, useState } from 'react';
import {
  drawChromaGlassWatermark,
  FREE_RECORD_MAX_SECONDS,
  isFreeTierGated,
} from '../lib/tierGates';
import { clipContainer, coverCrop, isPortrait, type ClipShape } from '../lib/clipFrame';

/**
 * Record the show to a video file, straight from the canvas.
 *
 * `canvas.captureStream` gives the frames as they are drawn directly from the
 * WebGPU canvas (no readback, no DOM overlays, pure visual plate); the audio the show
 * is listening to is muxed in optionally when enabled.
 *
 * MediaRecorder writes WebM or MP4 depending on options and browser capabilities.
 * Supports configurable quality presets (Master, Standard, Compact), frame rate,
 * format selection, and optional audio track inclusion.
 */

export type VideoQuality = 'master' | 'standard' | 'compact';
export type VideoFormat = 'auto' | 'webm' | 'mp4';

export interface RecorderOptions {
  includeAudio: boolean;
  quality: VideoQuality;
  fps: number;
  format: VideoFormat;
  /** The frame: the plate as it is, or a 9:16 clip for Reels and TikTok (lib/clipFrame.ts, PLAN 34f). */
  shape: ClipShape;
}

export interface LastTake {
  blob: Blob;
  url: string;
  sizeBytes: number;
  seconds: number;
  filename: string;
  timestamp: number;
  watermarked?: boolean;
  /** Pixels of the file, to tell the panel what it made. */
  width?: number;
  height?: number;
  shape?: ClipShape;
}

export interface Recorder {
  recording: boolean;
  /** Seconds since recording began, updated once a second. */
  seconds: number;
  error: string | null;
  supported: boolean;
  options: RecorderOptions;
  setOptions: (update: Partial<RecorderOptions>) => void;
  /** Whether a recording began: false where the browser cannot, so a caller that changed the canvas for it can put it back. */
  start: (canvas: HTMLCanvasElement, audio: MediaStream | null, overrideOptions?: Partial<RecorderOptions>) => boolean;
  stop: () => void;
  toggle: (canvas: HTMLCanvasElement | null, audio: MediaStream | null, overrideOptions?: Partial<RecorderOptions>) => void;
  lastTake: LastTake | null;
  clearLastTake: () => void;
  maxDurationSec: number | null;
  watermarked: boolean;
}

export const DEFAULT_RECORDER_OPTIONS: RecorderOptions = {
  includeAudio: true,
  quality: 'standard',
  fps: 60,
  format: 'auto',
  shape: 'plate',
};

const STORAGE_KEY = 'chromaglass-recorder-options';

const MIME_WEBM_AUDIO = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

const MIME_WEBM_SILENT = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

const MIME_MP4_AUDIO = [
  'video/mp4;codecs=avc1.64002A,mp4a.40.2',
  'video/mp4;codecs=avc1.64002A,opus',
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
];

const MIME_MP4_SILENT = [
  'video/mp4;codecs=avc1.64002A',
  'video/mp4;codecs=avc1',
  'video/mp4',
];

const pickMime = (opts: RecorderOptions): string | null => {
  const format = clipContainer(opts.shape, opts.format);
  const MR = (window as unknown as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } }).MediaRecorder;
  if (!MR) return null;

  const mp4List = opts.includeAudio ? MIME_MP4_AUDIO : MIME_MP4_SILENT;
  const webmList = opts.includeAudio ? MIME_WEBM_AUDIO : MIME_WEBM_SILENT;

  let candidates: string[];
  if (format === 'mp4') {
    candidates = [...mp4List, ...webmList];
  } else if (format === 'webm') {
    candidates = [...webmList, ...mp4List];
  } else {
    // Auto: Master prefers MP4 for hardware encoding where available; otherwise WebM
    candidates = opts.quality === 'master' ? [...mp4List, ...webmList] : [...webmList, ...mp4List];
  }

  for (const m of candidates) {
    if (!MR.isTypeSupported || MR.isTypeSupported(m)) return m;
  }
  return null;
};

/** `?rec=<Mbps>`, or null for standard preset bitrates. */
function masterBitrate(): number | null {
  let mbps = NaN;
  try { mbps = Number(new URLSearchParams(window.location.search).get('rec')); } catch { /* no query */ }
  return Number.isFinite(mbps) && mbps > 0 ? Math.min(100, Math.max(4, mbps)) : null;
}

function qualityBitrate(quality: VideoQuality): number {
  switch (quality) {
    case 'master': return 30_000_000;
    case 'compact': return 5_000_000;
    case 'standard':
    default:
      return 12_000_000;
  }
}

function recorderBitrates(opts: RecorderOptions, audio: MediaStream | null): { videoBitsPerSecond: number; audioBitsPerSecond?: number } {
  const urlMbps = masterBitrate();
  const videoBitsPerSecond = urlMbps !== null ? Math.round(urlMbps * 1_000_000) : qualityBitrate(opts.quality);
  if (!opts.includeAudio || !audio) {
    return { videoBitsPerSecond };
  }
  const channels = audio.getAudioTracks()[0]?.getSettings?.().channelCount ?? 2;
  const audioBitsPerSecond = channels >= 2 ? 320_000 : 160_000;
  return { videoBitsPerSecond, audioBitsPerSecond };
}

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export function useRecorder(defaults: Partial<RecorderOptions> = {}): Recorder {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastTake, setLastTake] = useState<LastTake | null>(null);

  // `defaults` is what this device starts with when it has never chosen: a
  // phone opens on the portrait clip its screen is nearly the shape of.
  const [options, setOptionsState] = useState<RecorderOptions>(() => {
    const base = { ...DEFAULT_RECORDER_OPTIONS, ...defaults };
    if (typeof window === 'undefined') return base;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...base, ...parsed };
      }
    } catch { /* ignore storage error */ }
    return base;
  });

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const setOptions = useCallback((update: Partial<RecorderOptions>) => {
    setOptionsState(prev => {
      const next = { ...prev, ...update };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beganRef = useRef<number>(0);
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;

  const stop = useCallback(() => {
    const r = recRef.current;
    if (!r) return;
    try { if (r.state !== 'inactive') r.stop(); } catch { /* already stopped */ }
  }, []);

  const clearLastTake = useCallback(() => {
    if (lastTake?.url) {
      try { URL.revokeObjectURL(lastTake.url); } catch { /* ignore */ }
    }
    setLastTake(null);
  }, [lastTake]);

  const start = useCallback((canvas: HTMLCanvasElement, audio: MediaStream | null, overrideOptions?: Partial<RecorderOptions>) => {
    if (recRef.current) return false;
    setError(null);

    const activeOpts: RecorderOptions = { ...optionsRef.current, ...overrideOptions };
    const mime = pickMime(activeOpts);
    if (!mime) { setError('This browser cannot record video in the requested format.'); return false; }

    const fps = activeOpts.fps || 60;
    const freeGated = isFreeTierGated();
    const maxSec = freeGated ? FREE_RECORD_MAX_SECONDS : null;
    let captureTarget: HTMLCanvasElement = canvas;
    let watermarkRaf: number | null = null;
    /** Paints the canvas of our own once more, for the frame the stream is waiting on. */
    let paintAgain: (() => void) | null = null;
    /*
      A portrait clip is drawn onto a canvas of its own whose size is fixed
      here, at the start, and never again: the encoder is given one size for
      the whole file (`avc1` in an MP4 cannot change it, and the recorder
      stops with an error when it does), while the canvas it is drawn from
      is not constant. A stage given a clip changes size under the
      governor's resolution ladder (`rung.dpr`), and the first frames after
      `setStage` land on the old size. From a canvas that is already 9:16 the
      clip is the whole canvas, scaled; from one that is not (a projector owns
      its shape, or this is a phone) it is the widest centred 9:16 slice of it,
      and the slice's source follows the canvas if that moves.
    */
    const portrait = activeOpts.shape === 'portrait';
    const sliced = portrait && !isPortrait(canvas.width, canvas.height);
    const even = (v: number) => Math.max(2, 2 * Math.floor(v / 2));
    // The free site's marked plate video is held to its starting size too: the same
    // governor moves its canvas, and a proxy that followed it changed the encoder's
    // resolution mid-file (seen in the clip check as a recording that ended without a file).
    const fixed = portrait
      ? coverCrop(canvas.width || 1280, canvas.height || 720)
      : freeGated ? { outW: even(canvas.width || 1280), outH: even(canvas.height || 720) } : null;
    let outW = canvas.width || 1280, outH = canvas.height || 720;

    if ((freeGated || portrait) && typeof document !== 'undefined') {
      const proxy = document.createElement('canvas');
      proxy.width = Math.max(1, fixed ? fixed.outW : canvas.width || 1280);
      proxy.height = Math.max(1, fixed ? fixed.outH : canvas.height || 720);
      const ctx = proxy.getContext('2d');
      if (ctx) {
        const paint = () => {
          if (!fixed) {
            if (proxy.width !== canvas.width && canvas.width > 0) proxy.width = canvas.width;
            if (proxy.height !== canvas.height && canvas.height > 0) proxy.height = canvas.height;
          }
          // Black under the plate: a canvas that has not drawn yet is transparent, and a
          // transparent frame is both an unchanged canvas (no frame for the stream) and
          // whatever colour the player's background is.
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, proxy.width, proxy.height);
          try {
            if (sliced) {
              const c = coverCrop(canvas.width, canvas.height);
              ctx.drawImage(canvas, c.sx, c.sy, c.sw, c.sh, 0, 0, proxy.width, proxy.height);
            } else {
              ctx.drawImage(canvas, 0, 0, proxy.width, proxy.height);
            }
          } catch { /* canvas not ready */ }
          if (freeGated) drawChromaGlassWatermark(ctx, proxy.width, proxy.height);
        };
        const drawMarked = () => { paint(); watermarkRaf = requestAnimationFrame(drawMarked); };
        drawMarked();
        paintAgain = paint;
        captureTarget = proxy;
        outW = proxy.width; outH = proxy.height;
      }
    }

    let stream: MediaStream;
    try {
      stream = (captureTarget as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(fps);
    } catch (e) {
      if (watermarkRaf !== null) cancelAnimationFrame(watermarkRaf);
      setError(e instanceof Error ? e.message : 'The canvas refused to be captured.');
      return false;
    }

    // Audio is muxed only if enabled in options and an audio stream is supplied
    if (activeOpts.includeAudio && audio) {
      for (const t of audio.getAudioTracks()) {
        stream.addTrack(t.clone());
      }
    }

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, ...recorderBitrates(activeOpts, audio) });
    } catch (e) {
      if (watermarkRaf !== null) cancelAnimationFrame(watermarkRaf);
      setError(e instanceof Error ? e.message : 'Could not start the recorder.');
      return false;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onerror = () => setError('Recording failed.');
    rec.onstop = () => {
      if (watermarkRaf !== null) { cancelAnimationFrame(watermarkRaf); watermarkRaf = null; }
      const blob = new Blob(chunksRef.current, { type: mime.split(';')[0] });
      chunksRef.current = [];
      for (const t of stream.getTracks()) t.stop();
      recRef.current = null;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setRecording(false);

      if (blob.size === 0) return;
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      const url = URL.createObjectURL(blob);
      const filename = `chromaglass_${activeOpts.shape === 'portrait' ? '9x16_' : ''}${stamp()}.${ext}`;

      // Trigger automatic file download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      const rawElapsed = Math.max(1, Math.round((performance.now() - beganRef.current) / 1000));
      const elapsed = maxSec !== null ? Math.min(maxSec, rawElapsed) : rawElapsed;
      setLastTake({
        blob,
        url,
        sizeBytes: blob.size,
        seconds: elapsed,
        filename,
        timestamp: Date.now(),
        watermarked: freeGated,
        width: outW,
        height: outH,
        shape: activeOpts.shape,
      });
    };

    recRef.current = rec;
    rec.start(1000);
    /*
      The proxy was painted before the stream was made from it, so the stream's
      first frame depends on the page's next animation frame: on a machine whose
      frames take seconds that is seconds with nothing to encode, and a clip
      that ends first has audio and no picture. Painted again now, a frame is
      certain from the first moment.
    */
    paintAgain?.();
    // And twice more inside the first second, off the animation frame: one painted frame is not
    // always a video track (a recorder that saw a single frame before the stream settled wrote a
    // file with sound and no picture), and these do not wait on the page's frames.
    for (const ms of [300, 900]) setTimeout(() => { if (recRef.current === rec) paintAgain?.(); }, ms);
    setRecording(true);
    setSeconds(0);
    beganRef.current = performance.now();
    timerRef.current = setInterval(() => {
      const elapsedSec = Math.floor((performance.now() - beganRef.current) / 1000);
      setSeconds(maxSec !== null ? Math.min(maxSec, elapsedSec) : elapsedSec);
      if (maxSec !== null && elapsedSec >= maxSec) {
        try { if (rec.state !== 'inactive') rec.stop(); } catch { /* already stopped */ }
      }
    }, 250);
    return true;
  }, []);

  const toggle = useCallback((canvas: HTMLCanvasElement | null, audio: MediaStream | null, overrideOptions?: Partial<RecorderOptions>) => {
    if (recRef.current) stop();
    else if (canvas) start(canvas, audio, overrideOptions);
  }, [start, stop]);

  useEffect(() => () => { stop(); if (timerRef.current) clearInterval(timerRef.current); }, [stop]);

  const freeGated = isFreeTierGated();
  return {
    recording,
    seconds,
    error,
    supported,
    options,
    setOptions,
    start,
    stop,
    toggle,
    lastTake,
    clearLastTake,
    maxDurationSec: freeGated ? FREE_RECORD_MAX_SECONDS : null,
    watermarked: freeGated,
  };
}
