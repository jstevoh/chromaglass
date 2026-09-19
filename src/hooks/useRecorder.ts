import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Record the show to a video file, straight from the canvas.
 *
 * `canvas.captureStream` gives the frames as they are drawn (no readback,
 * no second render); the audio the show is listening to is muxed in when
 * there is one. MediaRecorder writes WebM (VP9 where the browser has it,
 * VP8 otherwise); a browser that only records MP4 gets that. The file is
 * offered as a download when recording stops.
 */
export interface Recorder {
  recording: boolean;
  /** Seconds since recording began, updated once a second. */
  seconds: number;
  error: string | null;
  start: (canvas: HTMLCanvasElement, audio: MediaStream | null, fps?: number) => void;
  stop: () => void;
  toggle: (canvas: HTMLCanvasElement | null, audio: MediaStream | null) => void;
  supported: boolean;
}

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

/**
 * With `?rec=` the recording is a master for another encode, and H.264 comes
 * first where the browser has it: Chrome on a Mac records it on the hardware
 * encoder, where VP9 is software and at a master's bitrate took enough of the
 * CPU to cost a 1080×1920 take a third of its frames.
 */
const MASTER_CANDIDATES = [
  'video/mp4;codecs=avc1.64002A,mp4a.40.2',
  'video/mp4;codecs=avc1.64002A,opus',
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
];

const pickMime = (): string | null => {
  const MR = (window as unknown as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } }).MediaRecorder;
  if (!MR) return null;
  const candidates = masterBitrate() ? [...MASTER_CANDIDATES, ...MIME_CANDIDATES] : MIME_CANDIDATES;
  for (const m of candidates) if (!MR.isTypeSupported || MR.isTypeSupported(m)) return m;
  return null;
};

/** `?rec=<Mbps>`, or null for an ordinary recording. */
function masterBitrate(): number | null {
  let mbps = NaN;
  try { mbps = Number(new URLSearchParams(window.location.search).get('rec')); } catch { /* no query */ }
  return Number.isFinite(mbps) && mbps > 0 ? Math.min(100, Math.max(4, mbps)) : null;
}

/**
 * `?rec=<Mbps>` for a recording that is going to be finished elsewhere.
 *
 * Twelve megabits is plenty for a file someone watches as it is. The clip tool
 * re-encodes the take to 4K for YouTube, and every loss in the recorder is
 * carried into that: at 40 the grain and the thread edges survive. With it
 * set, H.264 is preferred (see MASTER_CANDIDATES) and the audio is asked for
 * explicitly at 320 kbps, rather than left to the encoder's default.
 */
function recorderBitrates(): { videoBitsPerSecond: number; audioBitsPerSecond?: number } {
  const mbps = masterBitrate();
  if (mbps === null) return { videoBitsPerSecond: 12_000_000 };
  return { videoBitsPerSecond: Math.round(mbps * 1_000_000), audioBitsPerSecond: 320_000 };
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
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;

  const stop = useCallback(() => {
    const r = recRef.current;
    if (!r) return;
    try { if (r.state !== 'inactive') r.stop(); } catch { /* already stopped */ }
  }, []);

  const start = useCallback((canvas: HTMLCanvasElement, audio: MediaStream | null, fps = 60) => {
    if (recRef.current) return;
    setError(null);
    const mime = pickMime();
    if (!mime) { setError('This browser cannot record video.'); return; }
    let stream: MediaStream;
    try {
      stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(fps);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The canvas refused to be captured.');
      return;
    }
    // The music goes in alongside the picture; a copy of the track so
    // stopping the recording never stops the show's own listening.
    for (const t of audio?.getAudioTracks() ?? []) stream.addTrack(t.clone());
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, ...recorderBitrates() });
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
      const a = document.createElement('a');
      a.href = url;
      a.download = `chromaglass_${stamp()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };
    recRef.current = rec;
    rec.start(1000);
    setRecording(true);
    setSeconds(0);
    const began = performance.now();
    timerRef.current = setInterval(() => setSeconds(Math.floor((performance.now() - began) / 1000)), 500);
  }, []);

  const toggle = useCallback((canvas: HTMLCanvasElement | null, audio: MediaStream | null) => {
    if (recRef.current) stop();
    else if (canvas) start(canvas, audio);
  }, [start, stop]);

  useEffect(() => () => { stop(); if (timerRef.current) clearInterval(timerRef.current); }, [stop]);

  return { recording, seconds, error, start, stop, toggle, supported };
}
