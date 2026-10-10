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

/**
 * The WebGPU engine's read of the frame it just drew, shrunk to `w` by `h`:
 * RGBA rows from the top, or null. Returns null at once when it cannot start
 * one (`gpu/padGrab.ts`).
 */
export type PadGrab = (w: number, h: number) => Promise<Uint8ClampedArray | null> | null;
type Done = (src: string | null, size: number) => void;

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
  /** Pictures taken and not yet answered: seq → when taken. */
  private inflight = new Map<number, number>();
  private seq = 0;
  /** The newest picture sent; an older one answered after it is dropped. */
  private last = 0;
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
   * The frame just drawn, as the WebGPU engine has it: `grab` shrinks it on
   * the GPU and reads it back a frame or two later (`gpu/padGrab.ts`). The
   * engine calls this from its frame; `tap` below is then left alone, so a
   * frame is taken once.
   *
   * Paced by a due time rather than a gap since the last: a show drawing
   * at 18 frames a second has a frame every 55 ms, and "at least 64 ms since
   * the last" took every other one, 9 a second; against a due time with
   * half a frame of slack it takes 15 when the frames allow, and every
   * frame when they come slower than that.
   *
   * Up to three in flight, not one: a picture's round trip (the read, the
   * post to the worker and its answer) waits for gaps between the page's
   * frames, and one at a time came to 4.3 a second on the Mac's show at 18
   * frames. The pace is the due time's; the round trip only delays each
   * picture by those frames. Answers can come back out of order; one older
   * than a picture already sent is dropped.
   */
  tapGrab(grab: PadGrab, frameWidth: number, frameHeight: number): void {
    this.grabbedAt = this.now();
    this.take(frameWidth, frameHeight, (w, h, seq, done) => {
      const read = grab(w, h);
      if (!read) return false;
      read.then((pixels) => {
        const worker = pixels && this.encoder();
        if (!pixels || !worker) { done(null, 0); return; }
        this.post(worker, seq, { pixels, w, h }, [pixels.buffer], done);
      }, () => done(null, 0));
      return true;
    });
  }

  /**
   * The frame task's canvas, just drawn: the WebGL engine's way, and the
   * cloud check's stand-in. One small `drawImage` here, while the canvas
   * still holds the frame, and the encode off the frame. On WebGPU this was
   * the way too, and the Mac's show got 6.3 pictures a second from it: the
   * 2D canvas is the GPU's, and its readback for the encode waited behind
   * the plate's work, about 375 ms a picture.
   */
  tap(canvas: HTMLCanvasElement): void {
    if (this.now() - this.grabbedAt < 1000) return;   // the engine took this frame on the GPU
    this.take(canvas.width, canvas.height, (w, h, seq, done) => {
      const small = this.small ??= document.createElement('canvas');
      if (small.width !== w || small.height !== h) { small.width = w; small.height = h; }
      const ctx = small.getContext('2d');
      if (!ctx) return false;
      try {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(canvas, 0, 0, w, h);
      } catch {
        return false;   // a canvas that cannot be read this frame; the next one will be
      }
      /*
        The encode, in a worker. It was `toBlob` here, and on the Mac's show
        that came to 2 pictures a second: Chromium runs a canvas's `toBlob`
        in the page's idle time, and a page drawing a plate every frame has
        next to none. `createImageBitmap` copies the small picture out now
        (the copy is taken when it is called, so the next frame may draw
        over `small` while this one is on its way). Without workers or
        OffscreenCanvas, `toBlob`, which also takes its copy when called.
      */
      const worker = this.encoder();
      if (worker) {
        createImageBitmap(small).then((bmp) => {
          if (this.worker !== worker) { bmp.close(); done(null, 0); return; }
          this.post(worker, seq, { bmp }, [bmp], done);
        }, () => done(null, 0));
        return true;
      }
      // `toBlob` can throw (an encoder that fails, a canvas that is not
      // origin-clean): then nothing is in flight, and a place held would
      // narrow the pictures until the watchdog freed it.
      try { small.toBlob((blob) => {
        if (!blob) { done(null, 0); return; }
        const reader = new FileReader();
        reader.onloadend = () => done(typeof reader.result === 'string' ? reader.result : null, blob.size);
        reader.readAsDataURL(blob);
      }, 'image/jpeg', QUALITY); } catch { done(null, 0); }
      return true;
    });
  }

  /**
   * The gate both ways share: the leases, the pace, the places in flight,
   * and the size. `start` begins one picture and says whether it did; `done`
   * is called once with its data URL, or null.
   */
  private take(frameWidth: number, frameHeight: number, start: (w: number, h: number, seq: number, done: Done) => boolean): void {
    const t = this.now();
    // An encode that never answered in two seconds is given up on, so it
    // cannot hold a place in flight until a reload.
    for (const [s, at] of this.inflight) if (t - at > 2000) { this.inflight.delete(s); this.waiting.delete(s); }
    if (this.inflight.size >= IN_FLIGHT || t < this.due - 8) return;
    const live = this.leases.filter(l => l.until > t);
    if (live.length === 0 || frameWidth === 0 || frameHeight === 0) return;
    // The widest frame asking: the iPad's, when a phone and an iPad both are.
    const width = Math.max(...live.map(l => l.width));
    const aspect = frameWidth / frameHeight;
    const w = Math.min(width, frameWidth);
    const h = Math.max(1, Math.round(w / aspect));
    const seq = ++this.seq;
    this.inflight.set(seq, t);
    const done: Done = (src, size) => {
      if (!this.inflight.delete(seq)) return;   // answered after the watchdog gave up on it
      this.waiting.delete(seq);
      if (!src || seq < this.last) return;
      this.last = seq;
      this.sent++;
      this.bytes += size;
      this.send({ type: 'picture', src, w, h, aspect, seq });
    };
    if (!start(w, h, seq, done)) { this.inflight.delete(seq); return; }
    this.due = Math.max(this.due + 1000 / PAD_PICTURE_FPS, t);
  }

  /** Hand one picture to the worker; its answer comes back by `seq`. */
  private post(worker: Worker, seq: number, job: { bmp: ImageBitmap } | { pixels: Uint8ClampedArray; w: number; h: number }, transfer: Transferable[], done: Done): void {
    if (!this.inflight.has(seq)) { done(null, 0); return; }   // the watchdog gave up on it while it was read
    this.waiting.set(seq, done);
    worker.postMessage({ ...job, quality: QUALITY, seq }, transfer);
  }

  private due = -Infinity;
  /** When the engine last took a frame on the GPU (`tapGrab`). */
  private grabbedAt = -Infinity;
  private worker: Worker | null | undefined;
  /** The worker's answers still awaited: seq → what to do with it. */
  private waiting = new Map<number, Done>();

  /** Where the frames are read: on the GPU by the WebGPU engine, or from the canvas (for the checks). */
  get from(): 'gpu' | 'canvas' { return this.now() - this.grabbedAt < 1000 ? 'gpu' : 'canvas'; }

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
      // Only answers still awaited: one the watchdog gave up on is dropped.
      w.onmessage = (e: MessageEvent<{ seq: number; src: string | null; size: number }>) => {
        const done = this.waiting.get(e.data.seq);
        if (!done) return;
        this.waiting.delete(e.data.seq);
        done(e.data.src, e.data.size);
      };
      // A worker that fails is not asked again: the pictures go by `toBlob`.
      w.onerror = () => {
        const all = [...this.waiting.values()];
        this.waiting.clear();
        this.worker = null;
        for (const done of all) done(null, 0);
      };
      this.worker = w;
    } catch {
      this.worker = null;
    }
    return this.worker;
  }
}

/** Pictures taken and not yet sent, at most. */
const IN_FLIGHT = 3;

/**
 * The worker: a bitmap or the GPU's bytes in, a JPEG data URL out. The bytes
 * go on a canvas that is read often (`willReadFrequently`), which keeps it in
 * memory: an encode that went back to the GPU would wait behind the plate,
 * which is what this path is for avoiding.
 */
const ENCODER = `
let c = null, cpu = null;
onmessage = async (e) => {
  const { bmp, pixels, w, h, quality, seq } = e.data;
  try {
    let canvas;
    if (pixels) {
      if (!cpu || cpu.width !== w || cpu.height !== h) cpu = new OffscreenCanvas(w, h);
      cpu.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(pixels, w, h), 0, 0);
      canvas = cpu;
    } else {
      if (!c || c.width !== bmp.width || c.height !== bmp.height) c = new OffscreenCanvas(bmp.width, bmp.height);
      c.getContext('2d').drawImage(bmp, 0, 0);
      bmp.close();
      canvas = c;
    }
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
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
/** Whether a remote wants pictures now: the WebGPU engine asks before it grabs. */
export function padPictureWanted(): boolean { return current?.wanted ?? false; }
/** The WebGPU engine's frame, read on the GPU. Never throws into the frame either. */
export function grabPadPicture(grab: PadGrab, frameWidth: number, frameHeight: number): void {
  try { current?.tapGrab(grab, frameWidth, frameHeight); } catch { /* the next frame tries again */ }
}
