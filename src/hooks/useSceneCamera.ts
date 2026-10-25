import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { type SceneReading, type SceneSenseOptions } from '../lib/sceneSense';
import { VideoSampler, SENSE_FRAME } from '../lib/videoSense';
import { cameraError, cameraPresent, openCamera } from '../lib/cameras';

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
 *     The cost of that choice, measured under software WebGL at 0.6 frames a
 *     second: a saturated main thread starves the timer, so the sensor slows
 *     down exactly when the machine is already struggling. At any normal frame
 *     rate it is nowhere near the budget, and if it ever needs to stop
 *     competing, the analysis is a pure function over a pixel buffer and moves
 *     to a worker as a transfer rather than a rewrite.
 *   - **A ref, not state.** The reading changes twenty times a second and only
 *     the render loop reads it; putting it in state would re-render the app on
 *     every frame of it. What the panel needs — a meter and a cost — comes back
 *     as state at a rate a person can read.
 *
 * Frames are analysed in the page and never leave it. Nothing is recorded.
 */

/** The analysis frame's edge, shared with every other source. */
const FRAME = SENSE_FRAME;
/** Default analysis rate. The camera itself rarely beats 30 fps. */
const DEFAULT_HZ = 20;

export interface SceneCameraOptions extends SceneSenseOptions {
  enabled: boolean;
  /**
   * True when `enabled` came from a click in this session rather than from a
   * setting remembered across a reload. Only a click may let the browser ask.
   */
  userAsked?: boolean;
  /** `deviceId` from `enumerateDevices`, or '' for whatever the browser picks. */
  deviceId?: string;
  /**
   * The cameras plugged in now (`useCameras`). Read only to notice the chosen
   * camera coming back after it was pulled out, or turning up after the
   * browser's pick stood in for it; never to restart on every change.
   */
  cameras?: readonly MediaDeviceInfo[];
  /** Called once a camera opens, the moment the browser starts naming the cameras. */
  onOpened?: () => void;
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
  /** The chosen camera was not plugged in, so the browser's pick is the one open. */
  fellBack: boolean;
  /** The camera was pulled out while it ran; it opens again when it is back. */
  lost: boolean;
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
  /** The open stream, so the film projector can show what the sensor sees. */
  stream: React.MutableRefObject<MediaStream | null>;
}

const IDLE: SceneCameraState = { active: false, error: null, device: null, fellBack: false, lost: false, ms: 0, energy: 0, raw: 0, people: 0 };

export function useSceneCamera(opts: SceneCameraOptions): SceneCameraHandle {
  const reading = useRef<SceneReading | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<SceneCameraState>(IDLE);
  /** Bumped to open the camera again: it came back, or the chosen one turned up. */
  const [retry, setRetry] = useState(0);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const { enabled, deviceId = '', hz = DEFAULT_HZ, userAsked = false, cameras } = opts;

  /*
    A knocked cable at a gig (PLAN 14g, 14ad). A camera pulled out ends its
    track; the sensor said "opening…" for ever after, because nothing listened
    for the end. Now the end is heard (below) and, when the same camera is
    plugged back in, it opens again by itself. That is not a camera opened
    behind anyone's back: it was switched on by hand in this session and never
    switched off, and the light coming back on is the camera they chose
    coming back. The same goes for a chosen camera that was not plugged in
    when it was switched on: the browser's pick stood in, and the chosen one
    takes over when it arrives.
  */
  useEffect(() => {
    if (!enabled || !cameras) return;
    const wanted = state.lost || (state.fellBack && deviceId !== '');
    if (wanted && cameraPresent(cameras, deviceId)) setRetry(r => r + 1);
  }, [cameras, enabled, deviceId, state.lost, state.fellBack]);

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
    // The crop, the mirror, the small canvas and the read-back live in
    // `videoSense` now, because the film projector needs exactly the same
    // middle out of a video that is 16:9 rather than 4:3.
    const sampler = new VideoSampler(FRAME);

    const start = async () => {
      /*
        A camera is not opened behind anyone's back, and permission is not the
        same as consent.

        This used to check whether the browser had *already granted* camera
        permission, and open the camera silently when it had. The reasoning
        was about the browser's prompt — "a reload never puts a prompt over
        the plate" — and it protected the wrong thing. A permission granted in
        some earlier session is not somebody asking for the camera now: the
        light came on, in a room, with nothing on screen saying why.

        So `userAsked` is the whole gate. Nothing else may open it, whatever
        the permission state, and a switch remembered from last time is an
        *offer* the app makes on screen rather than something it acts on. See
        the resume notice in App.
      */
      if (!userAsked) {
        setState({ ...IDLE, error: 'Switch the motion camera on to use it.' });
        return;
      }
      let opened;
      try {
        opened = await openCamera(deviceId, 'user', { width: 640, height: 480 });
      } catch (err) {
        if (cancelled) return;
        // The common ones are worth naming: a laptop will often not hand the
        // browser a camera another app already holds.
        setState({ ...IDLE, error: cameraError(err) });
        return;
      }
      local = opened.stream;
      if (cancelled) { local.getTracks().forEach(t => t.stop()); return; }
      const track = local.getVideoTracks()[0];
      track?.addEventListener('ended', () => {
        if (cancelled) return;
        reading.current = null;
        setState({ ...IDLE, lost: true, error: 'The camera was unplugged. It comes back on when it is plugged in again.' });
      });

      stream.current = local;
      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = local;

      // Never await this. On a video element that is not in the document the
      // promise can simply never settle — not resolve, not reject — and every
      // line after it is then dead code: the sensor held the camera open,
      // reported itself as still opening, and drew nothing, with no error
      // anywhere to say why. The analysis loop starts regardless and each tick
      // checks `readyState` for itself, which is the check that actually
      // matters.
      void video.play().catch(() => { /* a gesture will start it */ });

      setState(s => ({ ...s, active: true, error: null, lost: false, device: opened.label, fellBack: opened.fellBack }));
      optsRef.current.onOpened?.();

      let last = performance.now();
      let uiAt = 0;

      const tick = () => {
        const now = performance.now();
        const dt = (now - last) / 1000;
        last = now;
        const v = video;
        if (!v) return;

        const o = optsRef.current;
        const got = sampler.sample(v, dt, now, {
          deadzone: o.deadzone,
          smooth: o.smooth,
          people: o.people,
          mirror: o.mirror,
        });
        if (!got) return;
        const r = got.reading;
        reading.current = r.ready ? r : null;

        if (o.preview?.current) drawPreview(o.preview.current, got.pixels, r);

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
  }, [enabled, deviceId, hz, userAsked, retry]);

  return { reading, state, stream };
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
