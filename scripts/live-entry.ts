// Bundled into the lab page by `npm run live` (scripts/live.mjs): the lab's
// real plate shader drawn onto a canvas, a sound beside it, and the live
// stream's encoder (src/lib/liveStream.ts) streaming both through a bridge
// the check exposes, to the same RTMP client the Mac app uses, in node.
import './lab-entry.ts';
import { LiveEncoder, type LivePacket, type LiveStartRequest, type LiveTransport, type LiveTransportState } from '../src/lib/liveStream.ts';


type LabApi = {
  create(N?: number, L?: number): Promise<{ N: number; L: number }>;
  dye(x: number, y: number, r: number, rgb: [number, number, number], d?: number): void;
  flush(dt?: number): void;
  step(n: number): Promise<void>;
  render(size: number): Promise<number[]>;
};
const lab = (window as unknown as { lab: LabApi }).lab;

/** The check's side of the wire, exposed by Playwright: each takes and returns JSON. */
type Bridge = {
  __liveStart(req: LiveStartRequest): Promise<{ ok: boolean; error?: string; state?: LiveTransportState | null }>;
  __liveConfig(cfg: { video?: number[]; audio?: { codec: string; description: number[] } }): Promise<unknown>;
  __livePacket(p: { kind: string; timestampMs: number; key?: boolean; data: string }): Promise<unknown>;
  __liveStop(): Promise<LiveTransportState | null>;
  __liveState(): Promise<LiveTransportState | null>;
};
const bridge = window as unknown as Bridge;

const b64 = (u: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000)));
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const transport: LiveTransport = {
  start: (req) => bridge.__liveStart(req),
  config: (cfg) => bridge.__liveConfig({ ...(cfg.video ? { video: Array.from(cfg.video) } : {}), ...(cfg.audio ? { audio: { codec: cfg.audio.codec, description: Array.from(cfg.audio.description) } } : {}) }),
  packet: (p: LivePacket) => { void bridge.__livePacket({ kind: p.kind, timestampMs: p.timestampMs, key: p.key, data: b64(p.data) }); },
  stop: () => bridge.__liveStop(),
  state: () => bridge.__liveState(),
};

const W = 640, H = 360;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let plate: ImageData | null = null;
let ac: AudioContext | null = null;
let stream: MediaStream | null = null;
let encoder: LiveEncoder | null = null;
/** When each flash was drawn and each click sounded, on the stream's clock (ms after the encoder's start). */
const events: { flashMs: number; clickMs: number }[] = [];
let flashUntil = 0;
let plateTimer: ReturnType<typeof setInterval> | null = null;
/** How often the plate was redrawn while streaming, and what went wrong when it was not: the check prints both. */
let redraws = 0;
const plateErrors: string[] = [];

/** The lab's plate, drawn on a 2D canvas the encoder reads: the lab has no presented canvas of its own. */
async function drawPlate(size: number): Promise<void> {
  const px = await lab.render(size);
  if (!ctx) return;
  const img = new ImageData(size, size);
  for (let i = 0; i < img.data.length; i++) img.data[i] = Math.max(0, Math.min(255, Math.round(px[i] * (px[i] <= 1 ? 255 : 1))));
  plate = img;
  paint();
}

function paint(): void {
  if (!ctx || !canvas) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (plate) {
    const c = document.createElement('canvas'); c.width = plate.width; c.height = plate.height;
    c.getContext('2d')!.putImageData(plate, 0, 0);
    ctx.drawImage(c, (W - H) / 2, 0, H, H);
  }
  if (performance.now() < flashUntil) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
}

const api = {
  /** The canvas, the lab plate on it, and a sound: a quiet tone through a MediaStreamDestination. */
  async setup(grid = 96): Promise<{ sampleRate: number }> {
    canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; canvas.id = 'live-canvas';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    await lab.create(grid);
    for (let i = 0; i < 8; i++) lab.dye(0.2 + 0.6 * ((i * 0.37) % 1), 0.2 + 0.6 * ((i * 0.61) % 1), 0.08, [0.3 + ((i * 0.3) % 1), 0.3 + ((i * 0.7) % 1), 0.3 + ((i * 0.5) % 1)], 1.4);
    lab.flush(); await lab.step(4);
    await drawPlate(192);
    ac = new AudioContext();
    await ac.resume();
    const dest = ac.createMediaStreamDestination();
    const tone = ac.createOscillator(); tone.frequency.value = 220;
    const g = ac.createGain(); g.gain.value = 0.05;
    tone.connect(g).connect(dest); tone.start();
    stream = dest.stream;
    (window as unknown as { __liveDest: MediaStreamAudioDestinationNode }).__liveDest = dest;
    return { sampleRate: ac.sampleRate };
  },

  /** Start streaming to `url` with `key`; the plate steps on and is redrawn every `plateMs`. */
  async start(url: string, key: string, fps: number, audioCodec?: 'aac' | 'opus', plateMs = 700): Promise<unknown> {
    if (!canvas || !stream) throw new Error('setup first');
    encoder = new LiveEncoder({ canvas, audio: stream, transport, url, key, width: W, height: H, fps, videoBitrate: 1500000, audioBitrate: 96000, audioCodec });
    await encoder.start();
    let busy = false;
    plateTimer = setInterval(() => {
      if (busy) return;
      busy = true;
      lab.step(1).then(() => drawPlate(192)).then(() => { redraws++; }).catch((e) => { plateErrors.push(String(e?.message ?? e)); }).finally(() => { busy = false; });
    }, plateMs);
    return encoder.state();
  },

  /**
   * A flash and a click at the same instant, `inMs` from now. The click is
   * scheduled on the audio clock; the flash is drawn by a timer at the
   * `performance.now()` when the context renders that instant's samples.
   * Rendering, not hearing: the context renders ahead of the speaker by its
   * output latency (41 ms in headless Chromium's null sink, measured
   * 2026-10-29; ten or so on a Mac), and what the stream carries is the sound
   * as the page produced it (which, for the Mac's captured system audio, is
   * the sound as it was heard, scheduled in a few ms later), so the stream's
   * two timelines are compared at the moment the page made both. The pair
   * from `getOutputTimestamp` (a context time and the performance time it
   * reaches the speaker) with `currentTime` (how far rendering has got) gives
   * the render time of any context time. Both are kept on the stream's clock
   * for the check to compare with what arrived.
   */
  event(inMs: number): void {
    if (!ac || !encoder) throw new Error('event() before setup() and start()');
    const dest = (window as unknown as { __liveDest: MediaStreamAudioDestinationNode }).__liveDest;
    const pair = ac.getOutputTimestamp();
    const ctxNow = pair.contextTime ?? ac.currentTime, perfNow = pair.performanceTime ?? performance.now();
    const renderAheadMs = Math.max(0, ac.currentTime - ctxNow) * 1000;
    const atCtx = ctxNow + inMs / 1000;
    const atPerf = perfNow + inMs - renderAheadMs;
    const click = ac.createOscillator(); click.frequency.value = 1800;
    const g = ac.createGain(); g.gain.setValueAtTime(0, 0); g.gain.setValueAtTime(0.9, atCtx); g.gain.setValueAtTime(0, atCtx + 0.08);
    click.connect(g).connect(dest); click.start(atCtx); click.stop(atCtx + 0.1);
    const t0 = encoder['t0'] as number;
    setTimeout(() => {
      const now = performance.now();
      flashUntil = now + 120;
      paint();
      // And the flash taken down on its own timer: left to the plate's redraw,
      // a plate that stopped redrawing left the canvas white and every later
      // flash unmeasurable (seen under load, the check-skeptic's control).
      setTimeout(paint, 130);
      events.push({ flashMs: now - t0, clickMs: atPerf - t0 });
    }, Math.max(0, atPerf - performance.now()));
  },

  events: () => events,
  plate: () => ({ redraws, errors: plateErrors.slice(0, 3) }),
  state: async () => encoder ? encoder.refresh() : null,
  async stop(): Promise<unknown> {
    if (plateTimer) clearInterval(plateTimer);
    const s = encoder ? await encoder.stop() : null;
    return s;
  },

  /**
   * What arrived, decoded: each video frame's mean brightness at its
   * timestamp, and each 5 ms of audio's level at its time, from the tags the
   * listener recorded, through Chromium's own decoders with the sequence
   * headers the stream sent. A stream a player can show is one these can
   * decode, frame for frame.
   */
  async decode(video: { description: string; frames: { ts: number; key: boolean; data: string }[] }, audio: { codec: string; description: string; sampleRate: number; channels: number; packets: { ts: number; data: string }[] } | null) {
    const frames: { ts: number; mean: number }[] = [];
    let videoError: string | null = null;
    const vdec = new VideoDecoder({
      output: (f) => {
        const w = f.codedWidth, h = f.codedHeight;
        const c = new OffscreenCanvas(w, h); const cx = c.getContext('2d')!;
        cx.drawImage(f, 0, 0);
        const d = cx.getImageData(0, 0, w, h).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 16) sum += d[i] + d[i + 1] + d[i + 2];
        frames.push({ ts: f.timestamp / 1000, mean: sum / (d.length / 16) / 3 });
        f.close();
      },
      error: (e) => { videoError = e.message; },
    });
    vdec.configure({ codec: 'avc1.640028', description: fromB64(video.description) });
    for (const fr of video.frames) vdec.decode(new EncodedVideoChunk({ type: fr.key ? 'key' : 'delta', timestamp: Math.round(fr.ts * 1000), data: fromB64(fr.data) }));
    try { await vdec.flush(); } catch (e) { videoError = videoError ?? (e as Error).message; }
    if (vdec.state !== 'closed') vdec.close();

    const levels: { ts: number; rms: number }[] = [];
    let audioError: string | null = null;
    let audioSeconds = 0;
    if (audio) {
      const adec = new AudioDecoder({
        output: (a) => {
          const n = a.numberOfFrames;
          const buf = new Float32Array(n);
          a.copyTo(buf, { planeIndex: 0, format: 'f32-planar' });
          const win = Math.round(a.sampleRate * 0.005);
          for (let i = 0; i + win <= n; i += win) {
            let s = 0; for (let j = i; j < i + win; j++) s += buf[j] * buf[j];
            levels.push({ ts: a.timestamp / 1000 + (i / a.sampleRate) * 1000, rms: Math.sqrt(s / win) });
          }
          audioSeconds += n / a.sampleRate;
          a.close();
        },
        error: (e) => { audioError = e.message; },
      });
      // An Opus decoder runs at 48 kHz whatever the source's rate (the OpusHead carries the original); AAC decodes at its own.
      adec.configure({ codec: audio.codec === 'aac' ? 'mp4a.40.2' : 'opus', sampleRate: audio.codec === 'aac' ? audio.sampleRate : 48000, numberOfChannels: audio.channels, description: fromB64(audio.description) });
      for (const p of audio.packets) adec.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(p.ts * 1000), data: fromB64(p.data) }));
      try { await adec.flush(); } catch (e) { audioError = audioError ?? (e as Error).message; }
      if (adec.state !== 'closed') adec.close();
    }
    /*
      What the decoder puts before the sound: an AAC encoder and decoder
      between them delay the signal by their priming (1024 to 2112 samples,
      21 to 44 ms at 48 kHz; Record measures it for its MP4 edit list, the
      same `measurePriming`), and a player that does not trim it (FLV has no
      edit list; most do not) hears the stream's sound that much after its
      stamp. Opus carries its pre-skip in the OpusHead and the decoder trims
      it. Measured here with the stream's own codec and description, so the
      sync line can set the decoded sound back by it and read the stream's
      two clocks against each other, whatever the codec.
    */
    let primingMs: number | null = null;
    if (audio) {
      const samples = await codecDelay(audio.codec, audio.sampleRate, audio.channels);
      primingMs = samples === null ? null : (samples / (audio.codec === 'aac' ? audio.sampleRate : 48000)) * 1000;
    }
    return { frames, videoError, levels, audioError, audioSeconds, primingMs };
  },
};

/**
 * The delay the stream's audio codec puts on the sound, in decoded samples:
 * Record's `measurePriming` (lib/render.ts) with two differences the check
 * needs. It decodes exactly as `decode()` above does (Opus at 48 kHz, which
 * is the only rate an Opus decoder runs at; the stream's own description),
 * and it answers 0 when the signal comes out where it went in (Record reads
 * a zero as "cannot tell", because its AAC never is; the Opus decoder trims
 * the pre-skip and 0 is the right answer). Noise in, the same noise out at
 * some lag: the lag where they correlate above 0.5 is the delay.
 */
async function codecDelay(codec: string, sampleRate: number, channels: number): Promise<number | null> {
  const n = 16384, window = 8192, maxLag = 4096;
  const probe = new Float32Array(n);
  let x = 0x2545f491;
  for (let i = 0; i < n; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; probe[i] = (x / 4294967296 - 0.5) * 0.5; }
  const chunks: EncodedAudioChunk[] = [];
  let desc: Uint8Array | null = null;
  let failed = false;
  const enc = new AudioEncoder({ output: (c, m) => { chunks.push(c); if (m?.decoderConfig?.description && !desc) { const d = m.decoderConfig.description; desc = d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array((d as ArrayBufferView).buffer.slice((d as ArrayBufferView).byteOffset, (d as ArrayBufferView).byteOffset + (d as ArrayBufferView).byteLength)); } }, error: () => { failed = true; } });
  enc.configure({ codec: codec === 'aac' ? 'mp4a.40.2' : 'opus', sampleRate, numberOfChannels: channels, bitrate: 96000 });
  const planar = new Float32Array(n * channels);
  for (let c = 0; c < channels; c++) planar.set(probe, c * n);
  const data = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: channels, timestamp: 0, data: planar });
  try { enc.encode(data); } finally { data.close(); }
  try { await enc.flush(); } catch { failed = true; }
  enc.close();
  if (failed || !chunks.length) return null;
  const out: Float32Array[] = [];
  const dec = new AudioDecoder({ output: (a) => { const f = new Float32Array(a.numberOfFrames); a.copyTo(f, { planeIndex: 0, format: 'f32-planar' }); out.push(f); a.close(); }, error: () => { failed = true; } });
  dec.configure({ codec: codec === 'aac' ? 'mp4a.40.2' : 'opus', sampleRate: codec === 'aac' ? sampleRate : 48000, numberOfChannels: channels, ...(desc ? { description: desc } : {}) });
  for (const c of chunks) dec.decode(c);
  try { await dec.flush(); } catch { failed = true; }
  if (dec.state !== 'closed') dec.close();
  if (failed) return null;
  const got = new Float32Array(out.reduce((k, f) => k + f.length, 0));
  let at = 0;
  for (const f of out) { got.set(f, at); at += f.length; }
  if (got.length < maxLag + window) return null;
  // Opus at a source rate other than 48 kHz comes back resampled: correlate against the probe resampled the same way.
  const ratio = codec === 'aac' ? 1 : 48000 / sampleRate;
  const ref = new Float32Array(window);
  for (let i = 0; i < window; i++) { const t = i / ratio; const j = Math.floor(t); ref[i] = probe[Math.min(n - 1, j)] * (1 - (t - j)) + probe[Math.min(n - 1, j + 1)] * (t - j); }
  let pp = 0;
  for (let i = 0; i < window; i++) pp += ref[i] * ref[i];
  let best = -1, bestLag = -1;
  for (let lag = 0; lag <= maxLag; lag++) {
    let pg = 0, gg = 0;
    for (let i = 0; i < window; i++) { const g = got[lag + i]; pg += ref[i] * g; gg += g * g; }
    const r = gg > 0 ? pg / Math.sqrt(pp * gg) : 0;
    if (r > best) { best = r; bestLag = lag; }
  }
  return best > 0.5 ? bestLag : null;
}

(window as unknown as { liveLab: typeof api }).liveLab = api;
