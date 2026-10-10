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
 * the relay keeps no state about who wants what (it has none by design). The
 * cost of that: while any remote asks, the relay hands the pictures to every
 * linked remote, and one left on Controls drops them unpainted (PLAN
 * 8-draw-a-2, a relay that routes them only to the askers).
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
   *
   * Paced by a due time rather than a gap since the last: a show drawing
   * at 18 frames a second has a frame every 55 ms, and "at least 64 ms since
   * the last" took every other one, 9 a second; against a due time with
   * half a frame of slack it takes 15 when the frames allow, and every
   * frame when they come slower than that.
   */
  tap(canvas: HTMLCanvasElement): void {
    const t = this.now();
    if (this.busy && t - this.since > 2000) this.busy = false;   // an encode that never answered
    if (this.busy || t < this.due - 8) return;
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
    this.due = Math.max(this.due + 1000 / PAD_PICTURE_FPS, t);
    this.busy = true;
    this.since = t;
    const seq = ++this.seq;
    const done = (src: string | null, size: number) => {
      if (seq !== this.seq) return;   // answered after the watchdog gave up on it
      this.busy = false;
      if (!src) return;
      this.sent++;
      this.bytes += size;
      this.send({ type: 'picture', src, w, h, aspect, seq });
    };
    /*
      The encode, in a worker. It was `toBlob` here, and on the Mac's show
      (CI, the app at 18 frames a second) that came to 2 pictures a second:
      Chromium runs a canvas's `toBlob` in the page's idle time, and a page
      drawing a plate every frame has next to none. A worker has all of
      its own. `createImageBitmap` copies the small picture out now; the
      worker draws it on its own canvas and encodes there. Without workers
      or OffscreenCanvas, `toBlob` as before.
    */
    const worker = this.encoder();
    if (worker) {
      createImageBitmap(small).then((bmp) => {
        if (seq !== this.seq) { bmp.close(); return; }
        this.waiting = { seq, done };
        worker.postMessage({ bmp, quality: QUALITY, seq }, [bmp]);
      }, () => done(null, 0));
      return;
    }
    // `toBlob` can throw (an encoder that fails, a canvas that is not
    // origin-clean): then nothing is in flight, and a stuck `busy` would end
    // the pictures until a reload.
    try { small.toBlob((blob) => {
      if (!blob) { done(null, 0); return; }
      const reader = new FileReader();
      reader.onloadend = () => done(typeof reader.result === 'string' ? reader.result : null, blob.size);
      reader.readAsDataURL(blob);
    }, 'image/jpeg', QUALITY); } catch { done(null, 0); }
  }

  private due = -Infinity;
  private since = 0;
  private worker: Worker | null | undefined;
  private waiting: { seq: number; done: (src: string | null, size: number) => void } | null = null;

  /** Where the pictures are encoded: 'worker', or 'toBlob' where a worker cannot (for the checks). */
  get via(): 'worker' | 'toBlob' | 'none' { return this.worker ? 'worker' : this.worker === null ? 'toBlob' : 'none'; }

  /** The encoding worker, made once; null where a worker cannot encode (then `toBlob`). */
  private encoder(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    this.worker = null;
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
    try {
      const url = URL.createObjectURL(new Blob([ENCODER], { type: 'text/javascript' }));
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      // Only the answer to the picture asked for: one the watchdog gave up on is dropped.
      w.onmessage = (e: MessageEvent<{ seq: number; src: string | null; size: number }>) => {
        const wait = this.waiting;
        if (!wait || wait.seq !== e.data.seq) return;
        this.waiting = null;
        wait.done(e.data.src, e.data.size);
      };
      w.onerror = () => { const wait = this.waiting; this.waiting = null; wait?.done(null, 0); this.worker = null; };
      this.worker = w;
    } catch {
      this.worker = null;
    }
    return this.worker;
  }
}

/** The worker: a bitmap in, a JPEG data URL out. */
const ENCODER = `
let c = null;
onmessage = async (e) => {
  const { bmp, quality, seq } = e.data;
  try {
    if (!c || c.width !== bmp.width || c.height !== bmp.height) c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0);
    bmp.close();
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality });
    postMessage({ seq, src: new FileReaderSync().readAsDataURL(blob), size: blob.size });
  } catch (err) {
    postMessage({ seq, src: null, size: 0 });
  }
};
`;

/*
  The frame task is in LiquidVisualizer and the link is in App; the display
  has one of each, so the sender is held here rather than threaded through
  the visualizer's props (a prop change there re-renders the plate's host).
*/
let current: PadPictureSender | null = null;
export function setPadPictureSender(s: PadPictureSender | null): void { current = s; }
export function padPictureSender(): PadPictureSender | null { return current; }
/** Called by the frame task with the canvas it just drew. Never throws into it: a pad's picture is not worth a frame. */
export function tapPadPicture(canvas: HTMLCanvasElement): void {
  try { current?.tap(canvas); } catch { /* the next frame tries again */ }
}
