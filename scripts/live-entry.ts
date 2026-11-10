// Bundled into the lab page by `npm run live` (scripts/live.mjs): the lab's
// real plate shader drawn onto a canvas, a sound beside it, and the live
// stream's encoder (src/lib/liveStream.ts) streaming both through a bridge
// the check exposes, to the same RTMP session the Mac app uses, in node:
// a landscape encode to two destinations and a portrait one to a third
// (37x-4c).
import './lab-entry.ts';
import { liveVideoConfig, liveVideoBitrate } from '../src/lib/liveRate.ts';
import { LiveEncoder, chooseAcceleration, liveCrop, liveConsolePlan, type LiveDestinationSpec, type LivePacket, type LiveStartRequest, type LiveTransport, type LiveTransportState } from '../src/lib/liveStream.ts';


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
  __liveConfig(cfg: { output?: string; video?: number[]; audio?: { codec: string; description: number[] } }): Promise<unknown>;
  __livePacket(p: { kind: string; output?: string; timestampMs: number; key?: boolean; data: string }): Promise<unknown>;
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
  config: (cfg) => bridge.__liveConfig({ output: cfg.output, ...(cfg.video ? { video: Array.from(cfg.video) } : {}), ...(cfg.audio ? { audio: { codec: cfg.audio.codec, description: Array.from(cfg.audio.description) } } : {}) }),
  packet: (p: LivePacket) => { void bridge.__livePacket({ kind: p.kind, output: p.output, timestampMs: p.timestampMs, key: p.key, data: b64(p.data) }); },
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

  /**
   * Start streaming to `url`, one destination per key: a destination is
   * portrait when its orientation says so, and then the stream has a second
   * encode of `portrait` (360x640: the lab's canvas is 640x360). Planned as
   * the Mac app's console plans it (`liveConsolePlan`), so the check streams
   * what `__cgLive.start({ destinations })` would. The plate steps on and is
   * redrawn every `plateMs`.
   */
  async start(url: string, keys: { key: string; orientation?: 'landscape' | 'portrait' }[], fps: number, audioCodec?: 'aac' | 'opus', plateMs = 700, silent = false): Promise<unknown> {
    if (!canvas || !stream) throw new Error('setup first');
    const plan = liveConsolePlan({ destinations: keys.map((k) => ({ name: k.key, url, key: k.key, orientation: k.orientation })), width: W, height: H, portrait: { width: H, height: W }, videoBitrate: 1500000 });
    const destinations: LiveDestinationSpec[] = plan.destinations;
    // `silent`: the app with its sound source at None, which hands the encoder no stream at all (37x-4f).
    encoder = new LiveEncoder({ canvas, audio: silent ? null : stream, transport, outputs: plan.outputs, destinations, fps, audioBitrate: 96000, audioCodec });
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
  /** The crop the portrait encode takes of the canvas, for the check to print and test. */
  crop: (cw: number, ch: number, w: number, h: number, fit: 'cover' | 'contain') => liveCrop(cw, ch, w, h, fit),
  plate: () => ({ redraws, errors: plateErrors.slice(0, 3) }),
  /**
   * The sound source switched off on air: the tone's track is stopped, which
   * ends the encoder's reader as a source the owner turns off would, and a
   * fresh tone is made for any stream started after (37x-4f).
   */
  endTone(): void {
    if (!ac || !stream) throw new Error('setup first');
    for (const t of stream.getAudioTracks()) t.stop();
    const dest = ac.createMediaStreamDestination();
    const tone = ac.createOscillator(); tone.frequency.value = 220;
    const g = ac.createGain(); g.gain.value = 0.05;
    tone.connect(g).connect(dest); tone.start();
    stream = dest.stream;
    (window as unknown as { __liveDest: MediaStreamAudioDestinationNode }).__liveDest = dest;
  },
  /**
   * A sound source opened on air (37x-4f-2): a fresh tone, in a context of
   * its own at `rate` (44.1 kHz, against the silent track's 48, so the
   * encoder has to resample it), handed to the running stream as
   * useAudioAnalyzer hands the app's (`setLiveAudio` → `setAudio`). The tone
   * is silent for its first `stepInMs` and then steps up: a mark at a known
   * instant, so the check can find where the source's sound landed on the
   * stream's clock. Its onset alone could not tell: the track is read from
   * whenever the hand-over happens, and a hole or a cut at the switch moves
   * everything after it (Chromium's AudioEncoder stamps its packets by
   * sample count, so a gap in the input is not a gap in the output, it is
   * the rest of the sound arriving early; the check-skeptic's control put
   * 100 ms of hole at the switch and an onset line still read 8 ms). The
   * step's stream time is its render time, worked out as `event()` does.
   */
  async openTone(rate = 44100, stepInMs = 1000): Promise<{ openedMs: number; stepMs: number; rate: number }> {
    if (!encoder) throw new Error('start first');
    const c = new AudioContext({ sampleRate: rate });
    await c.resume();
    const dest = c.createMediaStreamDestination();
    const tone = c.createOscillator(); tone.frequency.value = 220;
    const g = c.createGain();
    const t0 = encoder['t0'] as number;
    // A context just resumed reports no output timestamp yet (0 and 0, which read as a step a minute in the past): wait for its first.
    let pair = c.getOutputTimestamp();
    for (let i = 0; i < 50 && !(pair.performanceTime && pair.contextTime); i++) { await new Promise((r) => setTimeout(r, 10)); pair = c.getOutputTimestamp(); }
    const ctxNow = pair.contextTime ?? c.currentTime, perfNow = pair.performanceTime ?? performance.now();
    const renderAheadMs = Math.max(0, c.currentTime - ctxNow) * 1000;
    g.gain.setValueAtTime(0, 0); g.gain.setValueAtTime(0.05, ctxNow + stepInMs / 1000);
    tone.connect(g).connect(dest); tone.start();
    const openedMs = performance.now() - t0;
    encoder.setAudio(dest.stream);
    return { openedMs, stepMs: perfNow + stepInMs - renderAheadMs - t0, rate: c.sampleRate };
  },
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
  async decode(video: { description: string; frames: { ts: number; key: boolean; data: string }[]; band?: { x0: number; x1: number } }, audio: { codec: string; description: string; sampleRate: number; channels: number; packets: { ts: number; data: string }[] } | null) {
    const frames: { ts: number; mean: number; band: number | null }[] = [];
    let size: { width: number; height: number } | null = null;
    let videoError: string | null = null;
    const vdec = new VideoDecoder({
      output: (f) => {
        const w = f.codedWidth, h = f.codedHeight;
        size ??= { width: f.displayWidth, height: f.displayHeight };
        const c = new OffscreenCanvas(w, h); const cx = c.getContext('2d')!;
        cx.drawImage(f, 0, 0);
        const d = cx.getImageData(0, 0, w, h).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 16) sum += d[i] + d[i + 1] + d[i + 2];
        // The mean over a band of columns too, when asked: the landscape's middle, which the portrait should be.
        let band: number | null = null;
        if (video.band) {
          let bs = 0, bn = 0;
          const x0 = Math.round(video.band.x0), x1 = Math.round(video.band.x1);
          for (let y = 0; y < h; y += 2) for (let x = x0; x < x1; x += 2) { const k = (y * w + x) * 4; bs += d[k] + d[k + 1] + d[k + 2]; bn++; }
          band = bn ? bs / bn / 3 : null;
        }
        frames.push({ ts: f.timestamp / 1000, mean: sum / (d.length / 16) / 3, band });
        f.close();
      },
      error: (e) => { videoError = e.message; },
    });
    vdec.configure({ codec: 'avc1.640028', description: fromB64(video.description) });
    for (const fr of video.frames) vdec.decode(new EncodedVideoChunk({ type: fr.key ? 'key' : 'delta', timestamp: Math.round(fr.ts * 1000), data: fromB64(fr.data) }));
    try { await vdec.flush(); } catch (e) { videoError = videoError ?? (e as Error).message; }
    if (vdec.state !== 'closed') vdec.close();

    const levels: { ts: number; rms: number }[] = [];
    /*
      And its pitch, every tenth of a second, from the rising zero crossings
      (interpolated between samples) of the first channel: the tone is 220 Hz
      and a pure sine, which this reads to a fraction of a hertz. A source
      at 44.1 kHz fed unconverted into a 48 kHz track reads 239.5.
    */
    const pitch: { ts: number; hz: number }[] = [];
    let pBuf: number[] = [], pTs = 0, pRate = 0;
    const pitchOf = () => {
      const ups: number[] = [];
      for (let i = 1; i < pBuf.length; i++) if (pBuf[i - 1] < 0 && pBuf[i] >= 0) ups.push(i - 1 + -pBuf[i - 1] / (pBuf[i] - pBuf[i - 1]));
      if (ups.length >= 3) pitch.push({ ts: pTs, hz: ((ups.length - 1) * pRate) / (ups[ups.length - 1] - ups[0]) });
    };
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
          if (!pBuf.length) { pTs = a.timestamp / 1000; pRate = a.sampleRate; }
          for (let i = 0; i < n; i++) pBuf.push(buf[i]);
          if (pBuf.length >= a.sampleRate / 10) { pitchOf(); pBuf = []; }
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
    return { frames, size, videoError, levels, pitch, audioError, audioSeconds, primingMs };
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

/**
 * The rate the live encoder makes (37x-4h): `seconds` of a moving picture
 * at a size and frame rate, through the stream's own configuration
 * (liveVideoConfig) at the stream's own rate for that size unless one is
 * given, and the bytes that come out. Not the lab's plate: on software WebGPU
 * it redraws a few times in ten seconds, a near-still picture that any CBR
 * encoder that does not pad leaves far under its rate (64 kb/s of 1500 asked,
 * measured on the first try), and the line would have measured the plate,
 * not the encoder. The show's picture changes everywhere a little every
 * frame, with detail at every scale; so does this one: three planes of
 * low-passed noise at three scales, each sliding its own way, two of them
 * cross-faded on a slow sine, so no one motion vector predicts a block and
 * every macroblock has something to say, but nothing like white noise, which
 * no encoder can hold at any sane rate. The timestamps are the stream's
 * (i / fps), so rate control sees the frame rate it was told, however fast
 * the frames are fed. The acceleration hint is the one the stream itself
 * takes (`chooseAcceleration`, which picks the software encoder where the
 * default cannot hold the rate, as on GitHub's Mac VM), so the line measures
 * the encoder the stream would use; and a probe that has not finished in
 * a minute stops and says so, so a slow runner fails this line by name and
 * not the shard by its clock. `constant` is what the browser says it will
 * run (isConfigSupported echoes the mode back): an encoder in VBR can land
 * on the average rate too, so the average alone does not say CBR.
 */
async function rateProbe(width: number, height: number, fps: number, seconds: number, bitrate?: number): Promise<{ asked: number; madeKbps: number; frames: number; bytes: number; keyframes: number; firstSecondKbps: number; restKbps: number; acceleration: string; mode: string | null; ms: number; error: string | null }> {
  const asked = bitrate ?? liveVideoBitrate(width, height, fps);
  const t0 = performance.now();
  const { acceleration } = await chooseAcceleration(width, height, fps);
  const cfg = liveVideoConfig(width, height, fps, asked, acceleration);
  const support = await VideoEncoder.isConfigSupported(cfg).catch(() => null);
  const out = { asked, madeKbps: 0, frames: 0, bytes: 0, keyframes: 0, firstSecondKbps: 0, restKbps: 0, acceleration: String(acceleration), mode: (support?.config?.bitrateMode as string | undefined) ?? null, ms: 0, error: null as string | null };
  // Three planes of low-passed noise, each drawn once at full size with a
  // margin to slide in: the frames are sums of them at moving offsets.
  const M = 256, pw = width + M, ph = height + M;
  const plane = (seed: number, cell: number) => {
    const gw = Math.ceil(pw / cell) + 2, g = new Float32Array(gw * (Math.ceil(ph / cell) + 2));
    let x = seed >>> 0;
    for (let i = 0; i < g.length; i++) { x = (x * 1664525 + 1013904223) >>> 0; g[i] = x / 4294967296; }
    const out = new Uint8Array(pw * ph);
    for (let y = 0; y < ph; y++) for (let xx = 0; xx < pw; xx++) {
      const u = xx / cell, v = y / cell, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * gw + i;
      out[y * pw + xx] = 255 * ((g[k] * (1 - fu) + g[k + 1] * fu) * (1 - fv) + (g[k + gw] * (1 - fu) + g[k + gw + 1] * fu) * fv);
    }
    return out;
  };
  const [pa, pb, pc] = [plane(7, 9), plane(11, 31), plane(13, 5)];
  const rgba = new Uint8ClampedArray(width * height * 4);
  const n = Math.round(seconds * fps);
  const sizes: { ts: number; bytes: number }[] = [];
  const enc = new VideoEncoder({
    output: (c) => { sizes.push({ ts: c.timestamp, bytes: c.byteLength }); if (c.type === 'key') out.keyframes++; },
    error: (e) => { out.error = String(e?.message ?? e); },
  });
  try {
    enc.configure(cfg);
    for (let i = 0; i < n && !out.error; i++) {
      // Each plane slides its own way and the first two cross-fade, so no one
      // motion vector predicts a block: every pixel changes a little, as dye does.
      const t = i / fps, w = Math.round(128 + 127 * Math.sin(t * 1.7));
      const oa = (Math.floor(t * 37) % M) * pw + (Math.floor(t * 53) % M);
      const ob = (Math.floor(t * 23) % M) * pw + (M - 1 - (Math.floor(t * 41) % M));
      const oc = (M - 1 - (Math.floor(t * 29) % M)) * pw + (Math.floor(t * 17) % M);
      for (let y = 0, p = 0; y < height; y++) {
        const row = y * pw;
        for (let x = 0; x < width; x++, p += 4) {
          const m = (pa[oa + row + x] * (255 - w) + pb[ob + row + x] * w) >> 8, c = pc[oc + row + x];
          rgba[p] = m; rgba[p + 1] = (m * 7 + c) >> 3; rgba[p + 2] = 255 - ((m * 4) / 5); rgba[p + 3] = 255;
        }
      }
      const frame = new VideoFrame(rgba, { format: 'RGBA', codedWidth: width, codedHeight: height, timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      // A keyframe every two seconds, as LiveEncoder asks for one.
      enc.encode(frame, { keyFrame: i % Math.round(2 * fps) === 0 });
      frame.close();
      while (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 1));
      if (performance.now() - t0 > 60_000) { out.error = `not done in a minute: ${i + 1} of ${n} frames under ${acceleration}`; break; }
    }
    await enc.flush();
  } catch (e) { out.error ??= String((e as Error)?.message ?? e); }
  if (enc.state !== 'closed') enc.close();
  out.ms = Math.round(performance.now() - t0);
  out.frames = sizes.length;
  out.bytes = sizes.reduce((k, s) => k + s.bytes, 0);
  out.madeKbps = out.bytes * 8 / seconds / 1000;
  const first = sizes.filter((s) => s.ts < 1e6).reduce((k, s) => k + s.bytes, 0);
  out.firstSecondKbps = first * 8 / 1000;
  out.restKbps = seconds > 1 ? (out.bytes - first) * 8 / (seconds - 1) / 1000 : 0;
  return out;
}
(window as unknown as { liveLab: typeof api & { rateProbe: typeof rateProbe } }).liveLab = { ...api, rateProbe };
