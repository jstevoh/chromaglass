/**
 * The live stream's encoder (PLAN.md 37x-4b): the plate and the sound the
 * show hears, encoded as they happen and handed, packet by packet, to
 * whatever carries them to the server.
 *
 * The owner (2026-10-29) wants the Mac app to "stream it on all of the
 * popular streaming platforms", which all take H.264 video and AAC audio over
 * RTMPS (docs/live-show.md). Record (lib/render.ts) already encodes the
 * plate with WebCodecs' `VideoEncoder` and `AudioEncoder`, which on a Mac are
 * VideoToolbox and AudioToolbox: the same codecs OBS would use, at the same
 * cost, and no second process. Record's encoder works on a clock of its own
 * (a frame at i/fps, every sample of the song first); a live stream runs on
 * the wall clock, so this is a second, small encoder beside it, not a mode
 * of it: a frame is taken from the canvas every 1/fps of real time, and the
 * audio comes off the show's own `MediaStream` (the one `useAudioAnalyzer`
 * listens to: the microphone, the music, or the Mac's system audio), as it
 * plays.
 *
 * Why its own frames rather than `canvas.captureStream()`: a stream's server
 * wants frames at a steady rate, and the plate draws at whatever rate the
 * GPU allows (the governor, lib/governor.ts, may hold it at thirty or drop a
 * frame); `captureStream` hands over a frame only when the canvas has been
 * drawn again, so a quiet plate would send nothing for a while and the
 * player would stall. A frame taken on the clock is the last picture drawn,
 * sent again if it has not changed, which a realtime encoder turns into a
 * few bytes.
 *
 * Time. Every packet carries a timestamp on one clock, the stream's, which
 * starts at zero when the server has said the stream is live. A frame's is
 * the moment it was taken (`performance.now()` against that start). The
 * audio's chunks come off the track with timestamps of their own, and in
 * Chromium those are on the same clock, `performance.now()`'s (measured
 * 2026-10-29: a chunk from a MediaStreamDestination arrives about 9 ms after
 * its timestamp, which is the chunk's start, and a microphone's within a
 * millisecond), so the audio is stamped from its own timestamps against the
 * same start, and nothing is guessed from when a chunk happened to arrive.
 * An earlier draft anchored the audio clock at the first chunk's arrival,
 * and read 17 to 22 ms early for it: a chunk is handed over once rendered,
 * and the context renders ahead of the moment the sound is for. Should a
 * browser stamp its chunks on some other clock (a first chunk more than a
 * second from `performance.now()`), the arrival anchoring is the fallback,
 * and `state().audioClock` says so. Chunks from before the stream's start
 * are dropped, not stamped at zero. The check (scripts/live.mjs) decodes
 * what arrived and measures a flash on the canvas against a click in the
 * sound; the flash is seen at the next frame taken, so the picture reads up
 * to one frame after the sound, and never before it.
 *
 * Falling behind. A frame is taken only when the encoder has room (fewer
 * than three frames queued); when it has not, the frame due is skipped and
 * counted, and the next is taken on time, so a slow encoder lowers the
 * frame rate and never builds a queue. The transport's own count of frames
 * dropped on a slow upload is beside it in `state()`.
 *
 * The transport is an interface: in the Mac app it is the preload's
 * `__CHROMAGLASS_NATIVE__.live`, which hands each packet to the main
 * process's RTMPS client (desktop/live.js); in the lab it is a bridge the
 * check exposes, carrying the same packets to the same client in node. The
 * stream key never passes through here: the app's transport is given the
 * key's name and the main process looks it up (desktop/keys.js).
 */
import { avcCodec, videoBitrate as bitrateFor } from './render';

export interface LivePacket { kind: 'video' | 'audio'; timestampMs: number; key?: boolean; data: Uint8Array }
export interface LiveAudioMeta { codec: 'aac' | 'opus'; sampleRate: number; channels: number; bitrate: number }
export interface LiveMeta { width: number; height: number; fps: number; videoBitrate: number; audio: LiveAudioMeta | null }
export interface LiveStartRequest { url: string; keyName?: string; key?: string; meta: LiveMeta }
export interface LiveTransportState { phase: string; error: string | null; status?: string[]; bytesBehind?: number; bytesSent?: number; videoFrames?: number; videoDropped?: number; audioPackets?: number; acks?: number; pings?: number; seconds?: number }

export interface LiveTransport {
  start(req: LiveStartRequest): Promise<{ ok: boolean; error?: string; state?: LiveTransportState | null }>;
  config(cfg: { video?: Uint8Array; audio?: { codec: 'aac' | 'opus'; description: Uint8Array } }): Promise<unknown> | unknown;
  packet(p: LivePacket): void;
  stop(): Promise<unknown> | unknown;
  state(): Promise<LiveTransportState | null>;
}

export interface LiveOptions {
  canvas: HTMLCanvasElement;
  /** What the show hears, or null for a silent stream. */
  audio: MediaStream | null;
  transport: LiveTransport;
  url: string;
  keyName?: string;
  /** From the repo only (a packed app's main process refuses it): the key itself. */
  key?: string;
  width: number;
  height: number;
  fps: number;
  videoBitrate?: number;
  audioBitrate?: number;
  /** A keyframe this often, in seconds. The platforms ask for 2 (docs/live-show.md). */
  keySeconds?: number;
  /** The lab's: the audio codec to use, when the machine has both. */
  audioCodec?: 'aac' | 'opus';
}

export interface LiveState {
  phase: 'idle' | 'starting' | 'live' | 'stopped' | 'failed';
  error: string | null;
  seconds: number;
  frames: number;
  /** Frames due that were not taken: the encoder still had three queued. */
  skipped: number;
  keyframes: number;
  audioPackets: number;
  audioCodec: 'aac' | 'opus' | null;
  audioClock: 'track' | 'arrival' | null;
  timing: { grabMs: number; firstOutMs: number | null; firstEncodeAt: number; outputs: number };
  encodeQueue: number;
  transport: LiveTransportState | null;
}

export function liveSupport(): boolean {
  const g = globalThis as unknown as { VideoEncoder?: unknown; AudioEncoder?: unknown; VideoFrame?: unknown; MediaStreamTrackProcessor?: unknown };
  return typeof g.VideoEncoder === 'function' && typeof g.AudioEncoder === 'function' && typeof g.VideoFrame === 'function';
}

/** The audio codec this machine can encode for a stream: AAC where there is an AAC encoder (a Mac), Opus otherwise (the lab on Linux). */
export async function liveAudioCodec(sampleRate: number, channels: number, bitrate: number, prefer?: 'aac' | 'opus'): Promise<'aac' | 'opus' | null> {
  const order: ('aac' | 'opus')[] = prefer === 'opus' ? ['opus', 'aac'] : ['aac', 'opus'];
  for (const c of order) {
    try {
      const r = await AudioEncoder.isConfigSupported({ codec: c === 'aac' ? 'mp4a.40.2' : 'opus', sampleRate, numberOfChannels: channels, bitrate });
      if (r.supported) return c;
    } catch { /* not this one */ }
  }
  return null;
}

export class LiveEncoder {
  readonly opts: LiveOptions;
  private video: VideoEncoder | null = null;
  private audio: AudioEncoder | null = null;
  private reader: ReadableStreamDefaultReader<AudioData> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private t0 = 0;
  /** The two-second bucket the last keyframe was in: a keyframe at the first frame of each, on the schedule, not two seconds after the last one landed (which drifts later by each tick's lateness). */
  private lastKeyBucket = -1;
  /** 'track' when the chunks' own timestamps are on performance.now()'s clock (Chromium); 'arrival' is the fallback. */
  private audioClock: 'track' | 'arrival' | null = null;
  private audioOriginUs = 0;
  private audioBaseMs = 0;
  private audioCodec: 'aac' | 'opus' | null = null;
  private videoDescribed = false;
  private audioDescribed = false;
  private transportState: LiveTransportState | null = null;
  private counts = { frames: 0, skipped: 0, keyframes: 0, audioPackets: 0 };
  /**
   * Where each frame is drawn at the stream's size before it is encoded. A
   * VideoFrame made straight from the plate's canvas is the canvas's size
   * (the window's, 1024x653 in the Mac check), and an encoder configured for
   * another size converts and scales it on the CPU after reading the GPU
   * canvas back: the first Mac run of `npm run desktop` took 24 frames in
   * four seconds that way, skipping 97. Drawing the canvas onto a 2D canvas
   * of the stream's size is one GPU blit, and a frame from a 2D canvas is the
   * path the lab's check already measured at the stream's rate.
   */
  private stage: OffscreenCanvas | HTMLCanvasElement | null = null;
  private stageCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  /** For the checks: ms spent making frames, ms from the first encode to the first packet out, packets out. */
  readonly timing = { grabMs: 0, firstOutMs: null as number | null, firstEncodeAt: 0, outputs: 0 };
  private phase: LiveState['phase'] = 'idle';
  private error: string | null = null;
  private stopping = false;

  constructor(opts: LiveOptions) { this.opts = opts; }

  state(): LiveState {
    return {
      phase: this.phase, error: this.error,
      seconds: this.t0 ? (performance.now() - this.t0) / 1000 : 0,
      ...this.counts,
      audioCodec: this.audioCodec,
      audioClock: this.audioClock,
      timing: { ...this.timing },
      encodeQueue: this.video?.encodeQueueSize ?? 0,
      transport: this.transportState,
    };
  }

  /** Connect, then encode until `stop`. Resolves once the server has taken the stream. */
  async start(): Promise<void> {
    if (this.phase !== 'idle') throw new Error(`already ${this.phase}`);
    if (!liveSupport()) throw new Error('this browser cannot encode a stream (no WebCodecs)');
    this.phase = 'starting';
    const { width, height, fps, audio, transport, url, keyName, key } = this.opts;
    const videoBitrate = this.opts.videoBitrate ?? bitrateFor(avcCodec(width, height, fps), width, height, fps);
    const audioBitrate = this.opts.audioBitrate ?? 160000;
    try {
      // The audio's rate and channels are the track's: read its first chunk before anything is configured.
      let first: AudioData | null = null;
      let audioMeta: LiveAudioMeta | null = null;
      const track = audio?.getAudioTracks()[0] ?? null;
      if (track) {
        const Processor = (globalThis as unknown as { MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<AudioData> } }).MediaStreamTrackProcessor;
        if (!Processor) throw new Error('this browser cannot read the audio track (no MediaStreamTrackProcessor)');
        this.reader = new Processor({ track }).readable.getReader();
        const r = await this.reader.read();
        if (r.done || !r.value) throw new Error('the audio track ended before the stream began');
        first = r.value;
        const channels = Math.min(2, first.numberOfChannels);
        const codec = await liveAudioCodec(first.sampleRate, channels, audioBitrate, this.opts.audioCodec);
        if (!codec) throw new Error(`no audio encoder for ${channels} channels at ${first.sampleRate} Hz`);
        this.audioCodec = codec;
        audioMeta = { codec, sampleRate: first.sampleRate, channels, bitrate: audioBitrate };
      }
      const vcfg: VideoEncoderConfig = { codec: avcCodec(width, height, fps), width, height, framerate: fps, bitrate: videoBitrate, bitrateMode: 'constant', latencyMode: 'realtime', avc: { format: 'avc' } } as VideoEncoderConfig;
      const vs = await VideoEncoder.isConfigSupported(vcfg);
      if (!vs.supported) throw new Error(`no H.264 encoder for ${width}x${height} at ${fps} fps`);

      const meta: LiveMeta = { width, height, fps, videoBitrate, audio: audioMeta };
      const started = await transport.start({ url, keyName, key, meta });
      this.transportState = started.state ?? null;
      if (!started.ok) throw new Error(started.error ?? 'the server refused the stream');

      this.t0 = performance.now();
      this.video = new VideoEncoder({
        output: (chunk, m) => this.onVideo(chunk, m),
        error: (e) => this.fail(e),
      });
      this.video.configure(vcfg);
      if (first && audioMeta) {
        this.audio = new AudioEncoder({
          output: (chunk, m) => this.onAudio(chunk, m),
          error: (e) => this.fail(e),
        });
        this.audio.configure({ codec: audioMeta.codec === 'aac' ? 'mp4a.40.2' : 'opus', sampleRate: audioMeta.sampleRate, numberOfChannels: audioMeta.channels, bitrate: audioBitrate });
      }
      this.phase = 'live';
      if (first) { this.takeAudio(first); void this.pumpAudio(); }
      this.tick(0);
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }

  /** The frame timer: the next frame at t0 + n/fps; late ones skipped, never queued. */
  private tick(n: number): void {
    if (this.phase !== 'live' || !this.video) return;
    const { fps, canvas, keySeconds = 2 } = this.opts;
    const frameMs = 1000 / fps;
    const now = performance.now() - this.t0;
    // n is the frame due now; if more than one is due, the ones between are skipped.
    const due = Math.max(n, Math.floor(now / frameMs));
    if (due > n) this.counts.skipped += due - n;
    if (this.video.encodeQueueSize < 3) {
      const bucket = Math.floor(now / (keySeconds * 1000));
      const keyFrame = bucket > this.lastKeyBucket;
      let frame: VideoFrame | null = null;
      try {
        const t = performance.now();
        frame = new VideoFrame(this.staged(canvas), { timestamp: Math.round(now * 1000), duration: Math.round(frameMs * 1000) });
        if (this.counts.frames === 0) this.timing.firstEncodeAt = t;
        this.video.encode(frame, { keyFrame });
        this.timing.grabMs += performance.now() - t;
        if (keyFrame) { this.lastKeyBucket = bucket; this.counts.keyframes++; }
        this.counts.frames++;
      } catch (e) {
        this.fail(e);
        return;
      } finally {
        frame?.close();
      }
    } else {
      this.counts.skipped++;
    }
    const next = this.t0 + (due + 1) * frameMs;
    this.timer = setTimeout(() => this.tick(due + 1), Math.max(0, next - performance.now()));
  }

  /** The canvas drawn at the stream's size (see `stage`); the canvas itself when it already is. */
  private staged(canvas: HTMLCanvasElement): HTMLCanvasElement | OffscreenCanvas {
    const { width, height } = this.opts;
    if (canvas.width === width && canvas.height === height) return canvas;
    if (!this.stage) {
      this.stage = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
      this.stageCtx = this.stage.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    }
    if (!this.stageCtx) throw new Error('no 2D context to stage the stream\'s frames on');
    this.stageCtx.drawImage(canvas, 0, 0, width, height);
    return this.stage;
  }

  private onVideo(chunk: EncodedVideoChunk, m?: EncodedVideoChunkMetadata): void {
    if (this.timing.outputs++ === 0) this.timing.firstOutMs = performance.now() - this.timing.firstEncodeAt;
    const desc = m?.decoderConfig?.description;
    if (desc && !this.videoDescribed) {
      this.videoDescribed = true;
      void this.opts.transport.config({ video: copyBytes(desc) });
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.opts.transport.packet({ kind: 'video', timestampMs: chunk.timestamp / 1000, key: chunk.type === 'key', data });
  }

  private async pumpAudio(): Promise<void> {
    while (this.reader && this.phase === 'live') {
      let r: ReadableStreamReadResult<AudioData>;
      try { r = await this.reader.read(); } catch (e) { if (this.phase === 'live') this.fail(e); return; }
      if (r.done) return;
      if (this.phase !== 'live') { r.value.close(); return; }
      this.takeAudio(r.value);
    }
  }

  private takeAudio(ad: AudioData): void {
    try {
      if (this.audioClock === null) {
        const now = performance.now();
        if (Math.abs(ad.timestamp / 1000 - now) < 1000) {
          this.audioClock = 'track';
          this.audioOriginUs = this.t0 * 1000;
          this.audioBaseMs = 0;
        } else {
          this.audioClock = 'arrival';
          this.audioOriginUs = ad.timestamp;
          this.audioBaseMs = Math.max(0, (now - this.t0) - (ad.numberOfFrames / ad.sampleRate) * 1000);
        }
      }
      // Sound from before the stream began (the chunks read while the server was answering) is not the stream's.
      if (this.audioClock === 'track' && ad.timestamp < this.audioOriginUs) return;
      if (this.audio && this.audio.state === 'configured') {
        if (ad.numberOfChannels > 2) {
          // The encoder was told two channels: keep the first two.
          const n = ad.numberOfFrames;
          const buf = new Float32Array(2 * n);
          ad.copyTo(buf.subarray(0, n), { planeIndex: 0, format: 'f32-planar' });
          ad.copyTo(buf.subarray(n), { planeIndex: 1, format: 'f32-planar' });
          const two = new AudioData({ format: 'f32-planar', sampleRate: ad.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: ad.timestamp, data: buf });
          this.audio.encode(two);
          two.close();
        } else {
          this.audio.encode(ad);
        }
      }
    } catch (e) {
      this.fail(e);
    } finally {
      ad.close();
    }
  }

  private onAudio(chunk: EncodedAudioChunk, m?: EncodedAudioChunkMetadata): void {
    const desc = m?.decoderConfig?.description;
    if (desc && !this.audioDescribed && this.audioCodec) {
      this.audioDescribed = true;
      void this.opts.transport.config({ audio: { codec: this.audioCodec, description: copyBytes(desc) } });
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    const ts = this.audioBaseMs + (chunk.timestamp - this.audioOriginUs) / 1000;
    this.counts.audioPackets++;
    this.opts.transport.packet({ kind: 'audio', timestampMs: Math.max(0, ts), data });
  }

  private fail(e: unknown): void {
    if (this.phase === 'failed' || this.phase === 'stopped') return;
    this.error = e instanceof Error ? e.message : String(e);
    this.phase = 'failed';
    void this.teardown();
  }

  /** The newest word from the transport, for `state()`. */
  async refresh(): Promise<LiveState> {
    try { this.transportState = await this.opts.transport.state(); } catch { /* the transport is gone */ }
    return this.state();
  }

  /** End the stream: the encoders flushed, the transport told, the audio reader released. */
  async stop(): Promise<LiveState> {
    if (this.phase === 'live' || this.phase === 'starting') this.phase = 'stopped';
    await this.teardown();
    return this.state();
  }

  private async teardown(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    try { if (this.video && this.video.state === 'configured') await this.video.flush(); } catch { /* failed already */ }
    try { if (this.audio && this.audio.state === 'configured') await this.audio.flush(); } catch { /* failed already */ }
    try { this.video?.close(); } catch { /* closed */ }
    try { this.audio?.close(); } catch { /* closed */ }
    try { await this.reader?.cancel(); } catch { /* released */ }
    this.reader = null;
    try { this.transportState = (await this.opts.transport.stop()) as LiveTransportState | null ?? this.transportState; } catch { /* gone */ }
  }
}

function copyBytes(desc: AllowSharedBufferSource): Uint8Array {
  if (desc instanceof ArrayBuffer) return new Uint8Array(desc.slice(0));
  const v = desc as ArrayBufferView;
  return new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
}

// --- The Mac app's transport and its console -----------------------------------

interface NativeLive {
  start(req: LiveStartRequest): Promise<{ ok: boolean; error?: string; state?: LiveTransportState | null }>;
  config(cfg: unknown): Promise<unknown>;
  packet(p: LivePacket): void;
  stop(): Promise<unknown>;
  state(): Promise<LiveTransportState | null>;
  onEvent(fn: (e: { event: string; detail: unknown; state: LiveTransportState | null }) => void): () => void;
  keys: { set(name: string, key: string): Promise<boolean>; list(): Promise<{ name: string; set: string | null }[]>; remove(name: string): Promise<boolean> };
}

/** The Mac app's bridge to its RTMPS client (desktop/preload.cjs), or null outside the app. */
export function nativeLive(): NativeLive | null {
  const w = globalThis as unknown as { __CHROMAGLASS_NATIVE__?: { live?: NativeLive } };
  return w.__CHROMAGLASS_NATIVE__?.live ?? null;
}

export interface LiveConsoleOptions {
  url: string;
  keyName?: string;
  key?: string;
  width?: number;
  height?: number;
  fps?: number;
  videoBitrate?: number;
  audioBitrate?: number;
}

/**
 * `window.__cgLive` in the Mac app (37x-4b: "driven first from the console
 * and the check"; the panel is 37x-4d): `start({ url, keyName })`, `stop()`,
 * `state()`, `keys.set(name, key)`, `keys.list()`, `keys.remove(name)`.
 * `allowed` is the Pro gate, asked at each start.
 */
export function installLiveConsole(deps: { canvas: () => HTMLCanvasElement | null; audio: () => MediaStream | null; allowed: () => boolean }): void {
  const native = nativeLive();
  if (!native) return;
  let current: LiveEncoder | null = null;
  const transport: LiveTransport = {
    start: (req) => native.start(req),
    config: (cfg) => native.config(cfg),
    packet: (p) => native.packet(p),
    stop: () => native.stop(),
    state: () => native.state(),
  };
  native.onEvent((e) => {
    if (current) current['transportState'] = e.state;
    if ((e.event === 'failed' || e.event === 'closed') && current && current.state().phase === 'live') void current.stop();
  });
  const api = {
    async start(o: LiveConsoleOptions): Promise<LiveState> {
      if (!deps.allowed()) throw new Error('the live show is a Pro feature');
      if (current && (current.state().phase === 'live' || current.state().phase === 'starting')) throw new Error('already live: stop() first');
      const canvas = deps.canvas();
      if (!canvas) throw new Error('no plate to stream');
      const width = o.width ?? 1920, height = o.height ?? Math.round(width * 9 / 16), fps = o.fps ?? 30;
      current = new LiveEncoder({ canvas, audio: deps.audio(), transport, url: o.url, keyName: o.keyName, key: o.key, width, height, fps, videoBitrate: o.videoBitrate, audioBitrate: o.audioBitrate });
      await current.start();
      return current.state();
    },
    stop: () => current ? current.stop() : Promise.resolve(null),
    state: () => current ? current.refresh() : Promise.resolve(null),
    keys: native.keys,
  };
  (globalThis as unknown as { __cgLive?: unknown }).__cgLive = api;
}
