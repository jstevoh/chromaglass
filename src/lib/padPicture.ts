/**
 * The wall under the pad (PLAN 8-draw-a): the laptop's own picture, small and
 * often, sent to a remote that is drawing on Draw.
 *
 * What was reported: Draw's frame was black. The remote gets the laptop's
 * settings, not its frames, so a hand drew blind on the phone and looked up
 * at the wall to see where the colour went. The relay already carries a
 * picture of the show to network displays, but that is the `cast` (settings
 * and audio bands, thirty times a second), from which a mirror re-runs the
 * plate on its own GPU. A phone cannot afford a second plate, and a re-run
 * plate is not this plate: the drops it has been handed are not the drops
 * the laptop laid, so it would show colour where there is none.
 *
 * So the laptop sends what it drew. In the frame task that drew it (a
 * presented WebGPU canvas reads back black; see the projector window in
 * CastDisplay, which is drawn the same way and for the same reason), the
 * canvas is drawn into a small 2D canvas, encoded as a JPEG off the frame,
 * and sent over the relay as a `picture`. Why not a video track
 * (`captureStream` over WebRTC), which would be smaller on the wire: it needs
 * an offer and answer through the relay, ICE on a show network that may have
 * no route between two Wi-Fi clients, and a decoder on the phone that holds
 * frames to build a buffer, which is latency a hand feels. A JPEG a sixtieth
 * of a megabyte, fifteen times a second, is 200–400 kB/s on a LAN, needs
 * nothing the relay does not already do, and is painted the moment it lands.
 *
 * Nothing is sent unless a remote asks. A remote on Draw renews a lease
 * (`pad-picture`) every second; the laptop sends while a lease is under three
 * seconds old, so a phone that locks, leaves Draw or drops off the network
 * stops the pictures within three seconds without anyone saying goodbye, and
 * the relay keeps no state about who wants what (it has none by design).
 */
import type { RemoteMessage } from './remoteProtocol';

/** Frames a second at most. Enough to see where a drop landed while the finger is still down. */
export const PAD_PICTURE_FPS = 15;
/** The picture's width range, in pixels; a remote asks for its frame's width inside it. */
export const PAD_PICTURE_MIN_WIDTH = 160;
export const PAD_PICTURE_MAX_WIDTH = 480;
/** A lease lasts this long; a remote renews it every `PAD_PICTURE_RENEW_MS`. */
export const PAD_PICTURE_LEASE_MS = 3000;
export const PAD_PICTURE_RENEW_MS = 1000;
/** JPEG quality. A soft picture of a soft liquid; 0.6 is a third of 0.9's bytes. */
const QUALITY = 0.6;
/** The largest picture a remote will paint, as a data URL. A 480-wide JPEG is about 40k of it. */
export const PAD_PICTURE_MAX_CHARS = 400_000;

export type PadPictureMessage = Extract<RemoteMessage, { type: 'picture' }>;

/** The width a remote asks for, kept inside the range whatever it sent. */
export function padPictureWidth(asked: unknown): number {
  const w = typeof asked === 'number' && Number.isFinite(asked) ? Math.round(asked) : PAD_PICTURE_MIN_WIDTH;
  return Math.max(PAD_PICTURE_MIN_WIDTH, Math.min(PAD_PICTURE_MAX_WIDTH, w));
}

/** Whether a `picture` from the wire is one a remote should paint. */
export function isPadPicture(m: { src?: unknown; aspect?: unknown }): boolean {
  return typeof m.src === 'string' && m.src.length <= PAD_PICTURE_MAX_CHARS
    && /^data:image\/(jpeg|webp|png);base64,/.test(m.src)
    && typeof m.aspect === 'number' && Number.isFinite(m.aspect) && m.aspect > 0.2 && m.aspect < 5;
}

/**
 * The laptop's end: holds the leases and turns the frame task's canvas into
 * `picture` messages. One per display.
 */
export class PadPictureSender {
  private leases: { width: number; until: number }[] = [];
  private last = -Infinity;
  private busy = false;
  private seq = 0;
  private small: HTMLCanvasElement | null = null;
  /** Pictures sent, and the bytes they came to, for `chromaglassDebug().padPicture`. */
  sent = 0;
  bytes = 0;

  constructor(private send: (m: RemoteMessage) => void, private now: () => number = () => performance.now()) {}

  /** A remote on Draw asked (again) for pictures this wide. */
  want(width: unknown): void {
    const t = this.now();
    this.leases = this.leases.filter(l => l.until > t);
    this.leases.push({ width: padPictureWidth(width), until: t + PAD_PICTURE_LEASE_MS });
    // A remote renews once a second: keep only the newest few, so a long
    // night does not grow the list. Two remotes on Draw is a lot.
    if (this.leases.length > 16) this.leases.splice(0, this.leases.length - 16);
  }

  /** Whether any remote wants pictures now. */
  get wanted(): boolean {
    const t = this.now();
    return this.leases.some(l => l.until > t);
  }

  /**
   * The frame task's canvas, just drawn. Cheap when nobody is watching (a
   * time compare); when a remote is, one small `drawImage` here, while the
   * canvas still holds the frame, and the encode off the frame.
   */
  tap(canvas: HTMLCanvasElement): void {
    const t = this.now();
    if (this.busy || t - this.last < 1000 / PAD_PICTURE_FPS - 2) return;
    const live = this.leases.filter(l => l.until > t);
    if (live.length === 0 || canvas.width === 0 || canvas.height === 0) return;
    // The widest frame asking: the iPad's, when a phone and an iPad both are.
    const width = Math.max(...live.map(l => l.width));
    const aspect = canvas.width / canvas.height;
    const w = Math.min(width, canvas.width);
    const h = Math.max(1, Math.round(w / aspect));
    const small = this.small ??= document.createElement('canvas');
    if (small.width !== w || small.height !== h) { small.width = w; small.height = h; }
    const ctx = small.getContext('2d');
    if (!ctx) return;
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(canvas, 0, 0, w, h);
    } catch {
      return;   // a canvas that cannot be read this frame; the next one will be
    }
    this.last = t;
    this.busy = true;
    const seq = ++this.seq;
    small.toBlob((blob) => {
      if (!blob) { this.busy = false; return; }
      const reader = new FileReader();
      reader.onloadend = () => {
        this.busy = false;
        if (typeof reader.result !== 'string') return;
        this.sent++;
        this.bytes += blob.size;
        this.send({ type: 'picture', src: reader.result, w, h, aspect, seq });
      };
      reader.readAsDataURL(blob);
    }, 'image/jpeg', QUALITY);
  }
}

/*
  The frame task is in LiquidVisualizer and the link is in App; the display
  has one of each, so the sender is held here rather than threaded through
  the visualizer's props (a prop change there re-renders the plate's host).
*/
let current: PadPictureSender | null = null;
export function setPadPictureSender(s: PadPictureSender | null): void { current = s; }
export function padPictureSender(): PadPictureSender | null { return current; }
/** Called by the frame task with the canvas it just drew. */
export function tapPadPicture(canvas: HTMLCanvasElement): void { current?.tap(canvas); }
