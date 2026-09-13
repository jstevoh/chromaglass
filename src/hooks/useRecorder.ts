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

const pickMime = (): string | null => {
  const MR = (window as unknown as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } }).MediaRecorder;
  if (!MR) return null;
  for (const m of MIME_CANDIDATES) if (!MR.isTypeSupported || MR.isTypeSupported(m)) return m;
  return null;
};

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
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
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
