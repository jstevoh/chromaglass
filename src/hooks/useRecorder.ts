import { useCallback, useEffect, useRef, useState } from 'react';

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
}

export interface LastTake {
  blob: Blob;
  url: string;
  sizeBytes: number;
  seconds: number;
  filename: string;
  timestamp: number;
}

export interface Recorder {
  recording: boolean;
  /** Seconds since recording began, updated once a second. */
  seconds: number;
  error: string | null;
  supported: boolean;
  options: RecorderOptions;
  setOptions: (update: Partial<RecorderOptions>) => void;
  start: (canvas: HTMLCanvasElement, audio: MediaStream | null, overrideOptions?: Partial<RecorderOptions>) => void;
  stop: () => void;
  toggle: (canvas: HTMLCanvasElement | null, audio: MediaStream | null, overrideOptions?: Partial<RecorderOptions>) => void;
  lastTake: LastTake | null;
  clearLastTake: () => void;
}

export const DEFAULT_RECORDER_OPTIONS: RecorderOptions = {
  includeAudio: true,
  quality: 'standard',
  fps: 60,
  format: 'auto',
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
  const MR = (window as unknown as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } }).MediaRecorder;
  if (!MR) return null;

  const mp4List = opts.includeAudio ? MIME_MP4_AUDIO : MIME_MP4_SILENT;
  const webmList = opts.includeAudio ? MIME_WEBM_AUDIO : MIME_WEBM_SILENT;

  let candidates: string[];
  if (opts.format === 'mp4') {
    candidates = [...mp4List, ...webmList];
  } else if (opts.format === 'webm') {
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

export function useRecorder(): Recorder {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastTake, setLastTake] = useState<LastTake | null>(null);

  const [options, setOptionsState] = useState<RecorderOptions>(() => {
    if (typeof window === 'undefined') return DEFAULT_RECORDER_OPTIONS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_RECORDER_OPTIONS, ...parsed };
      }
    } catch { /* ignore storage error */ }
    return DEFAULT_RECORDER_OPTIONS;
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
    if (recRef.current) return;
    setError(null);

    const activeOpts: RecorderOptions = { ...optionsRef.current, ...overrideOptions };
    const mime = pickMime(activeOpts);
    if (!mime) { setError('This browser cannot record video in the requested format.'); return; }

    const fps = activeOpts.fps || 60;
    let stream: MediaStream;
    try {
      stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(fps);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The canvas refused to be captured.');
      return;
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
      setError(e instanceof Error ? e.message : 'Could not start the recorder.');
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onerror = () => setError('Recording failed.');
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime.split(';')[0] });
      chunksRef.current = [];
      for (const t of stream.getTracks()) t.stop();
      recRef.current = null;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setRecording(false);

      if (blob.size === 0) return;
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      const url = URL.createObjectURL(blob);
      const filename = `chromaglass_${stamp()}.${ext}`;

      // Trigger automatic file download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      const elapsed = Math.max(1, Math.round((performance.now() - beganRef.current) / 1000));
      setLastTake({
        blob,
        url,
        sizeBytes: blob.size,
        seconds: elapsed,
        filename,
        timestamp: Date.now(),
      });
    };

    recRef.current = rec;
    rec.start(1000);
    setRecording(true);
    setSeconds(0);
    beganRef.current = performance.now();
    timerRef.current = setInterval(() => setSeconds(Math.floor((performance.now() - beganRef.current) / 1000)), 500);
  }, []);

  const toggle = useCallback((canvas: HTMLCanvasElement | null, audio: MediaStream | null, overrideOptions?: Partial<RecorderOptions>) => {
    if (recRef.current) stop();
    else if (canvas) start(canvas, audio, overrideOptions);
  }, [start, stop]);

  useEffect(() => () => { stop(); if (timerRef.current) clearInterval(timerRef.current); }, [stop]);

  return { recording, seconds, error, supported, options, setOptions, start, stop, toggle, lastTake, clearLastTake };
}
