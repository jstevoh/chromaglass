import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SceneSense, type SceneReading, type SceneSenseOptions } from '../lib/sceneSense';

/**
 * The camera that watches the room.
 *
 * It owns the device and the clock; `sceneSense` owns the arithmetic. A frame
 * is drawn to a small square canvas, read back once, and handed over.
 *
 * Three decisions worth knowing:
 *
 *   - **A square crop.** The fluid grid is square, so taking the middle square
 *     of the camera's frame means a wave of an arm travels across the plate at
 *     the speed it travelled across the room, rather than being stretched by
 *     whatever aspect the webcam happens to have.
 *   - **A timer, not an animation frame.** The projector window is often in
 *     front of the laptop's own, and a hidden tab stops animating while the
 *     room, and the people in it, carry on. The gamepad hook does the same.
 *   - **A ref, not state.** The reading changes twenty times a second and only
 *     the render loop reads it; putting it in state would re-render the app on
 *     every frame of it. What the panel needs — a meter and a cost — comes back
 *     as state at a rate a person can read.
 *
 * Frames are analysed in the page and never leave it. Nothing is recorded.
 */

/** The analysis frame's edge. 96² is 9,216 pixels — a millisecond of work. */
const FRAME = 96;
/** Default analysis rate. The camera itself rarely beats 30 fps. */
const DEFAULT_HZ = 20;

export interface SceneCameraOptions extends SceneSenseOptions {
  enabled: boolean;
  /** `deviceId` from `enumerateDevices`, or '' for whatever the browser picks. */
  deviceId?: string;
  /** Flip left for right — a camera facing the audience sees the room mirrored. */
  mirror: boolean;
  hz?: number;
  /** A canvas to draw the sensor's own view into, for aiming it. */
  preview?: React.RefObject<HTMLCanvasElement | null>;
}

export interface SceneCameraState {
  active: boolean;
  /** Why it is not running, in words that belong on screen. */
  error: string | null;
  /** The device it actually opened. */
  device: string | null;
  /** Milliseconds the last analysis took. */
  ms: number;
  /** Motion as the room's own range makes it, 0..1 — the meter. */
  energy: number;
  /** Motion before normalisation, so a dead camera is distinguishable from a still room. */
  raw: number;
  people: number;
}

export interface SceneCameraHandle {
  /** The latest reading. Null until the camera is running and has two frames. */
  reading: React.MutableRefObject<SceneReading | null>;
  state: SceneCameraState;
  devices: MediaDeviceInfo[];
  refreshDevices: () => Promise<void>;
  /** The open stream, so the film projector can show what the sensor sees. */
  stream: React.MutableRefObject<MediaStream | null>;
}

const IDLE: SceneCameraState = { active: false, error: null, device: null, ms: 0, energy: 0, raw: 0, people: 0 };

export function useSceneCamera(opts: SceneCameraOptions): SceneCameraHandle {
  const reading = useRef<SceneReading | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<SceneCameraState>(IDLE);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter(d => d.kind === 'videoinput'));
    } catch { /* no permission yet: the list fills in once the camera is open */ }
  }, []);

  const { enabled, deviceId = '', hz = DEFAULT_HZ } = opts;

  useEffect(() => {
    if (!enabled) {
      reading.current = null;
      setState(IDLE);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState({ ...IDLE, error: 'This browser has no camera access.' });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let video: HTMLVideoElement | null = null;
    let local: MediaStream | null = null;
    const sense = new SceneSense();
    const canvas = document.createElement('canvas');
    canvas.width = FRAME;
    canvas.height = FRAME;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const start = async () => {
      try {
        local = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch (err) {
        if (cancelled) return;
        // The common ones are worth naming: a laptop will often not hand the
        // browser a camera another app already holds.
        const name = (err as DOMException)?.name ?? '';
        const message =
          name === 'NotAllowedError' ? 'Camera permission was refused.'
          : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'That camera is not there any more.'
          : name === 'NotReadableError' ? 'Another app is holding this camera.'
          : 'The camera would not open.';
        setState({ ...IDLE, error: message });
        return;
      }
      if (cancelled) { local.getTracks().forEach(t => t.stop()); return; }

      stream.current = local;
      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = local;
      try { await video.play(); } catch { /* autoplay policy: the next gesture starts it */ }

      const label = local.getVideoTracks()[0]?.label ?? null;
      setState(s => ({ ...s, active: true, error: null, device: label }));
      void refreshDevices();

      let last = performance.now();
      let uiAt = 0;

      const tick = () => {
        const now = performance.now();
        const dt = (now - last) / 1000;
        last = now;
        const v = video;
        if (!ctx || !v || v.readyState < 2 || v.videoWidth === 0) return;

        // The middle square of the frame, so the room maps onto the square
        // grid without a stretch.
        const side = Math.min(v.videoWidth, v.videoHeight);
        const sx = (v.videoWidth - side) / 2, sy = (v.videoHeight - side) / 2;
        const o = optsRef.current;
        ctx.save();
        if (o.mirror) { ctx.translate(FRAME, 0); ctx.scale(-1, 1); }
        ctx.drawImage(v, sx, sy, side, side, 0, 0, FRAME, FRAME);
        ctx.restore();

        const frame = ctx.getImageData(0, 0, FRAME, FRAME);
        const r = sense.push(frame.data, FRAME, FRAME, dt, now, {
          deadzone: o.deadzone,
          smooth: o.smooth,
          people: o.people,
        });
        reading.current = r.ready ? r : null;

        if (o.preview?.current) drawPreview(o.preview.current, frame, r);

        // The panel gets a figure it can read, not one per analysis.
        if (now - uiAt > 120) {
          uiAt = now;
          setState(s => (
            s.ms === r.ms && s.energy === r.energy && s.people === r.people.length
              ? s
              : { ...s, ms: r.ms, energy: r.energy, raw: r.raw, people: r.people.length }
          ));
        }
      };

      timer = setInterval(tick, Math.max(20, Math.round(1000 / Math.max(1, hz))));
    };

    void start();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (local) local.getTracks().forEach(t => t.stop());
      if (video) { video.pause(); video.srcObject = null; }
      stream.current = null;
      reading.current = null;
    };
  }, [enabled, deviceId, hz, refreshDevices]);

  return { reading, state, devices, refreshDevices, stream };
}

/**
 * What the sensor sees, for aiming it: the frame it is working from, the flow
 * it found drawn over the cells carrying it, and a ring round everyone it is
 * holding. Without this a camera in a dark venue is aimed by guesswork.
 */
function drawPreview(canvas: HTMLCanvasElement, frame: ImageData, r: SceneReading) {
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // The frame itself, dimmed, so the overlay reads over it.
  const tmp = previewFrame(frame);
  ctx.globalAlpha = 1;
  ctx.drawImage(tmp, 0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, w, h);

  const L = r.lattice;
  const cw = w / L, chh = h / L;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(120, 230, 255, 0.85)';
  ctx.beginPath();
  for (let c = 0; c < L * L; c++) {
    const m = r.motion[c];
    if (m < 0.08) continue;
    const x = (c % L + 0.5) * cw, y = (((c / L) | 0) + 0.5) * chh;
    // A vector long enough to read, capped so a burst does not draw a web.
    const len = Math.min(cw * 2.2, Math.hypot(r.flowX[c], r.flowY[c]) * w * 0.35);
    const a = Math.atan2(r.flowY[c], r.flowX[c]);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
  }
  ctx.stroke();

  for (const p of r.people) {
    const x = p.x * w, y = p.y * h;
    const rad = Math.max(6, Math.sqrt(p.area) * w * 0.9);
    ctx.strokeStyle = p.still > 0.4 ? 'rgba(255, 196, 96, 0.95)' : 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(String(p.id), x + rad + 2, y + 3);
  }
}

/** One reused canvas for the preview's source frame. */
let previewCanvas: HTMLCanvasElement | null = null;
function previewFrame(frame: ImageData): HTMLCanvasElement {
  if (!previewCanvas || previewCanvas.width !== frame.width) {
    previewCanvas = document.createElement('canvas');
    previewCanvas.width = frame.width;
    previewCanvas.height = frame.height;
  }
  previewCanvas.getContext('2d')?.putImageData(frame, 0, 0);
  return previewCanvas;
}
