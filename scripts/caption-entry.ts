// Bundled into a blank page by `npm run caption` (scripts/caption.mjs): the
// song caption's own module (src/lib/songCaption.ts) and the live stream's
// encoder (src/lib/liveStream.ts), so the check can draw the card and stream
// a plate with the card up, then decode what the stream carried.
import { drawSongCaption, parseSongCaption, showSongCaption, clearSongCaption, songCaptionAlpha, songCaptionLines, songCaptionNow, SONG_CAPTION_MS, SONG_CAPTION_IN_MS, SONG_CAPTION_HOLD_MS, SONG_CAPTION_OUT_MS } from '../src/lib/songCaption.ts';
import { LiveEncoder, liveConsolePlan, type LiveTransport } from '../src/lib/liveStream.ts';

/** The share of sampled pixels in a box of an RGBA picture that are near white, and that are near black. */
function box(d: Uint8ClampedArray, w: number, x0: number, y0: number, x1: number, y1: number): { white: number; dark: number } {
  let n = 0, white = 0, dark = 0;
  for (let y = Math.floor(y0); y < y1; y += 2) for (let x = Math.floor(x0); x < x1; x += 2) {
    const k = (y * w + x) * 4;
    const lo = Math.min(d[k], d[k + 1], d[k + 2]), hi = Math.max(d[k], d[k + 1], d[k + 2]);
    if (lo > 215) white++;
    if (hi < 70) dark++;
    n++;
  }
  return { white: white / n, dark: dark / n };
}

/** The four corners of a picture, each a box of a third of its width and a quarter of its height. */
function corners(d: Uint8ClampedArray, w: number, h: number) {
  return {
    bottomLeft: box(d, w, 0, h * 0.7, w / 2, h),
    // The card's left edge: it starts a fifteenth in, so its first letters are inside the left eighth.
    leftEdge: box(d, w, 0, h * 0.7, w / 8, h),
    bottomRight: box(d, w, w / 2, h * 0.7, w, h),
    topLeft: box(d, w, 0, 0, w / 2, h * 0.3),
    topRight: box(d, w, w / 2, 0, w, h * 0.3),
  };
}

/** A plate to lay the card on: a flat colour, or bright cream, the hardest ground for white letters. */
function plate(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
}

const api = {
  pure() {
    const full = parseSongCaption({ artist: 'Legendary Flower Punk', title: 'Beatroot', album: 'Beatroot 2020', label: 'Self-released' });
    const noTitle = parseSongCaption({ artist: 'Somebody' });
    const dirty = parseSongCaption({ title: 'A\u0000B\nC  ' + 'x'.repeat(200), artist: 7, album: { x: 1 } });
    const alphas = [-1, 0, SONG_CAPTION_IN_MS / 2, SONG_CAPTION_IN_MS, SONG_CAPTION_IN_MS + SONG_CAPTION_HOLD_MS / 2, SONG_CAPTION_MS - 1, SONG_CAPTION_MS, SONG_CAPTION_MS + 1000, SONG_CAPTION_MS - SONG_CAPTION_OUT_MS / 2].map((t) => ({ t, a: songCaptionAlpha(t) }));
    return { lines: full ? songCaptionLines(full) : null, noTitle, dirty, dirtyLines: dirty ? songCaptionLines(dirty) : null, alphas, total: SONG_CAPTION_MS };
  },

  /** The card drawn on a plate of `colour` at w x h, and the same plate without it: each corner's white and dark shares. */
  draw(w: number, h: number, colour: string) {
    const c = new OffscreenCanvas(w, h); const ctx = c.getContext('2d')!;
    plate(ctx, w, h, colour);
    const before = corners(ctx.getImageData(0, 0, w, h).data, w, h);
    drawSongCaption(ctx, w, h, songCaptionLines(parseSongCaption({ artist: 'Legendary Flower Punk', title: 'Beatroot', album: 'Beatroot 2020', label: 'Self-released' })!), 1);
    const after = corners(ctx.getImageData(0, 0, w, h).data, w, h);
    return { before, after };
  },

  /** The module's own clock: the card shows after it goes up, and is gone when its time is. */
  clock() {
    const t0 = 1000;
    showSongCaption({ artist: 'A', title: 'T' }, t0);
    const at = (ms: number) => songCaptionNow(t0 + ms)?.alpha ?? 0;
    const r = { mid: at(3000), up: songCaptionNow(t0 + 3000) !== null, gone: songCaptionNow(t0 + SONG_CAPTION_MS + 10) === null };
    clearSongCaption();
    return r;
  },

  /**
   * Stream a 640x360 plate (the landscape encode, and a portrait 360x640
   * one cropped from it) for `ms`: `upAt` ms in, a card goes up, and at
   * `downAt` it is taken down. Returns each output's decoded frames with
   * their corners' shares. Through the encoder as the app runs it, with a
   * transport that keeps what it is handed rather than sending it.
   */
  async stream(ms: number, upAt: number, downAt: number) {
    const W = 640, H = 360;
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = canvas.getContext('2d')!;
    plate(ctx, W, H, '#2b3a66');
    const desc: Record<string, Uint8Array> = {};
    const chunks: Record<string, { ts: number; key: boolean; data: Uint8Array }[]> = {};
    const transport: LiveTransport = {
      start: async () => ({ ok: true, state: { phase: 'live', error: null } }),
      config: (cfg) => { if (cfg.output && cfg.video) desc[cfg.output] = cfg.video; },
      packet: (p) => { if (p.kind === 'video' && p.output) (chunks[p.output] ??= []).push({ ts: p.timestampMs, key: !!p.key, data: p.data }); },
      stop: async () => null,
      state: async () => ({ phase: 'live', error: null }),
    };
    const plan = liveConsolePlan({ destinations: [{ name: 'wide', url: 'rtmp://x/app', key: 'a' }, { name: 'tall', url: 'rtmp://x/app', key: 'b', orientation: 'portrait' }], width: W, height: H, portrait: { width: H, height: W }, videoBitrate: 1500000 });
    const enc = new LiveEncoder({ canvas, audio: null, transport, outputs: plan.outputs, destinations: plan.destinations, fps: 30 });
    await enc.start();
    const t0 = performance.now();
    let upMs = NaN, downMs = NaN;
    setTimeout(() => { upMs = performance.now() - t0; showSongCaption({ artist: 'Legendary Flower Punk', title: 'Beatroot', album: 'Beatroot 2020' }); }, upAt);
    setTimeout(() => { downMs = performance.now() - t0; clearSongCaption(); }, downAt);
    await new Promise((r) => setTimeout(r, ms));
    await enc.stop();
    const out: Record<string, { w: number; h: number; frames: { ts: number; c: ReturnType<typeof corners> }[]; error: string | null }> = {};
    for (const id of Object.keys(chunks)) {
      const frames: { ts: number; c: ReturnType<typeof corners> }[] = [];
      let error: string | null = null, w = 0, h = 0;
      const dec = new VideoDecoder({
        output: (f) => {
          w = f.displayWidth; h = f.displayHeight;
          const oc = new OffscreenCanvas(w, h); const cx = oc.getContext('2d')!;
          cx.drawImage(f, 0, 0, w, h);
          frames.push({ ts: f.timestamp / 1000, c: corners(cx.getImageData(0, 0, w, h).data, w, h) });
          f.close();
        },
        error: (e) => { error = e.message; },
      });
      dec.configure({ codec: 'avc1.640028', description: desc[id] });
      for (const ch of chunks[id]) dec.decode(new EncodedVideoChunk({ type: ch.key ? 'key' : 'delta', timestamp: Math.round(ch.ts * 1000), data: ch.data }));
      try { await dec.flush(); } catch (e) { error ??= (e as Error).message; }
      out[id] = { w, h, frames: frames.sort((a, b) => a.ts - b.ts), error };
    }
    return { outputs: out, upMs, downMs };
  },
};

(window as unknown as { captionLab: typeof api }).captionLab = api;
