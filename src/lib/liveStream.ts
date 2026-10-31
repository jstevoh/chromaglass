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
import { listenLiveFrames, type LiveFrameKind } from './liveFrame';

export interface LivePacket { kind: 'video' | 'audio'; timestampMs: number; key?: boolean; data: Uint8Array; /** A video packet's encode (an output's id); audio goes to every destination. */ output?: string }
export interface LiveAudioMeta { codec: 'aac' | 'opus'; sampleRate: number; channels: number; bitrate: number }
export interface LiveMeta { width: number; height: number; fps: number; videoBitrate: number; audio: LiveAudioMeta | null }
/**
 * One video encode of the plate (37x-4c). A landscape output for YouTube,
 * Twitch, Facebook, Kick and X; a portrait one, a second encode, for
 * Instagram and TikTok, which take 9:16 only (docs/live-show.md). `fit`
 * says how the plate's canvas meets an output of another shape: 'cover'
 * (the default) crops the middle of the plate to fill the frame, 'contain'
 * shows all of it with black above and below.
 */
export interface LiveOutputSpec { id: string; width: number; height: number; fit?: 'cover' | 'contain'; videoBitrate?: number }
/** Where an output goes: a server, a key by name (or, from the repo only, the key), and which output. */
export interface LiveDestinationSpec { name?: string; url: string; keyName?: string; key?: string; output?: string }
export interface LiveStartRequest { outputs: { id: string; meta: LiveMeta }[]; destinations: LiveDestinationSpec[] }
/** One destination's health, as desktop/liveSession.js reports it: the panel's readout (37x-4d). */
export interface LiveDestinationHealth {
  name: string; output: string; phase: string; error: string | null; status: string[];
  kbps: number; secondsBehind: number; bytesBehind: number; measuredAt: 'server' | 'socket' | null; dropping: boolean;
  videoFrames: number; videoDropped: number; dropRuns: number; audioPackets: number; bytesSent: number; joinSkipped: number;
  acks: number; pings: number; serverAcks: number; reconnects: number; retryInMs: number | null; seconds: number;
}
export interface LiveTransportState { phase: string; error: string | null; destinations?: LiveDestinationHealth[] }

export interface LiveTransport {
  start(req: LiveStartRequest): Promise<{ ok: boolean; error?: string; state?: LiveTransportState | null }>;
  config(cfg: { output?: string; video?: Uint8Array; audio?: { codec: 'aac' | 'opus'; description: Uint8Array } }): Promise<unknown> | unknown;
  packet(p: LivePacket): void;
  stop(): Promise<unknown> | unknown;
  state(): Promise<LiveTransportState | null>;
}

export interface LiveOptions {
  canvas: HTMLCanvasElement;
  /** What the show hears, or null for a silent stream. */
  audio: MediaStream | null;
  transport: LiveTransport;
  /** The encodes; unset, one landscape output of `width` x `height`. */
  outputs?: LiveOutputSpec[];
  /** Where they go; unset, one destination at `url` with `keyName` (or `key`) on the first output. */
  destinations?: LiveDestinationSpec[];
  url?: string;
  keyName?: string;
  /** From the repo only (a packed app's main process refuses it): the key itself. */
  key?: string;
  width?: number;
  height?: number;
  fps: number;
  /** The first output's bitrate, when `outputs` does not give one. */
  videoBitrate?: number;
  audioBitrate?: number;
  /** A keyframe this often, in seconds. The platforms ask for 2 (docs/live-show.md). */
  keySeconds?: number;
  /** The lab's: the audio codec to use, when the machine has both. */
  audioCodec?: 'aac' | 'opus';
  /** The encoder hint; unset, `start` probes and chooses (see `probeVideoEncoder`). */
  acceleration?: LiveAcceleration;
  /**
   * Where the frames come from. Unset, `canvas` is read when each frame is
   * due, which a 2D canvas allows (the lab's). Set, the frame task hands
   * over that kind of picture as it draws it (lib/liveFrame.ts), and
   * `canvas` gives only its first size: the app's plate is a presented
   * WebGPU canvas, black when read on the stream's own clock (37x-4d-6).
   */
  frames?: LiveFrameKind;
}

export type LiveAcceleration = 'no-preference' | 'prefer-hardware' | 'prefer-software';

export interface LiveProbe {
  acceleration: LiveAcceleration;
  /** Where the probe's frames came from: a 2D canvas (the stream's path) or a buffer of pixels (the encoder alone). */
  source: 'canvas' | 'buffer';
  supported: boolean;
  outputs: number;
  /** ms from the first encode to the first packet out. */
  firstOutMs: number | null;
  /** ms an encoded frame once the encoder is warm (from the first packet to the last); null when none came out. */
  msAFrame: number | null;
  /** ms spent making the probe's frames, on average: the canvas's draw and readback, or nothing much for a buffer. */
  makeMs: number;
  error: string | null;
}

export interface LiveOutputState { id: string; width: number; height: number; fit: 'cover' | 'contain'; videoBitrate: number; frames: number; skipped: number; keyframes: number; encodeQueue: number }

export interface LiveState {
  phase: 'idle' | 'starting' | 'live' | 'stopped' | 'failed';
  error: string | null;
  seconds: number;
  /** The first output's counts (the landscape stream's, in the usual show); every output's are in `outputs`. */
  frames: number;
  /** Frames due that were not taken: the encoder still had three queued. */
  skipped: number;
  keyframes: number;
  audioPackets: number;
  audioCodec: 'aac' | 'opus' | null;
  audioClock: 'track' | 'arrival' | null;
  timing: { grabMs: number; firstOutMs: number | null; firstEncodeAt: number; outputs: number };
  /** The hint the video encoders were configured with, and what the probes read before it was chosen. */
  acceleration: LiveAcceleration | null;
  probes: LiveProbe[];
  encodeQueue: number;
  outputs: LiveOutputState[];
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


/**
 * How fast this machine's H.264 encoder runs at a size under one
 * acceleration hint: `frames` frames of a canvas, encoded as fast as the
 * encoder takes them, timed from the first encode to the last packet out.
 *
 * Why it exists: CI's Mac (GitHub's virtual machine, no GPU of its own) ran
 * the app's 640x360 stream at 5 frames a second twice over, with 0.5 ms a
 * frame spent making frames and 605 ms from the first encode to the first
 * packet, while the lab's Chromium on the same kind of machine held 30 fps
 * at the same size. The frames were not the cost; the encoder behind the
 * default hint was, and WebCodecs does not say which encoder that is. The
 * probe measures each hint instead of guessing, and `start` takes the
 * software encoder when the default cannot hold the frame rate and the
 * software one can. The owner's Mac has a hardware encoder that holds
 * 1080p60; there the default wins its probe and nothing changes.
 *
 * `source: 'buffer'` (37x-4c) makes the probe's frames from a buffer of
 * pixels instead of a canvas, so the encoder is timed alone: on GitHub's Mac
 * the packed app read 171 to 198 ms a frame under every hint while the
 * lab's Chromium on the same machine held 30 fps, and a canvas-made frame
 * there may be a readback through a software GL. Canvas slow and buffer
 * fast says the readback is the cost; both slow says the encoder is.
 */
export async function probeVideoEncoder(width: number, height: number, fps: number, acceleration: LiveAcceleration, frames = 24, source: 'canvas' | 'buffer' = 'canvas'): Promise<LiveProbe> {
  const out: LiveProbe = { acceleration, source, supported: false, outputs: 0, firstOutMs: null, msAFrame: null, makeMs: 0, error: null };
  if (!liveSupport()) { out.error = 'no WebCodecs'; return out; }
  const codec = avcCodec(width, height, fps);
  const cfg = { codec, width, height, framerate: fps, bitrate: bitrateFor(codec, width, height, fps), bitrateMode: 'constant', latencyMode: 'realtime', hardwareAcceleration: acceleration, avc: { format: 'avc' } } as VideoEncoderConfig;
  let enc: VideoEncoder | null = null;
  try {
    const s = await VideoEncoder.isConfigSupported(cfg);
    if (!s.supported) return out;
    out.supported = true;
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) { out.error = 'no 2D context for the probe'; return out; }
    // An I420 picture per frame for the buffer probe, made before the clock starts.
    const yuv = source === 'buffer' ? Array.from({ length: 4 }, (_, k) => {
      const b = new Uint8Array(width * height * 3 / 2);
      for (let i = 0; i < width * height; i++) b[i] = (i * (k + 3) + (i / width) * 7) & 0xff;
      b.fill(128 + k * 20, width * height);
      return b;
    }) : [];
    let t0 = 0;
    let makeMs = 0;
    enc = new VideoEncoder({
      output: () => { if (out.outputs++ === 0) out.firstOutMs = performance.now() - t0; },
      error: (e) => { out.error = String((e as Error)?.message ?? e); },
    });
    enc.configure(cfg);
    t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      // Each frame differs, so the encoder has a picture to code, not a repeat to skip.
      const m0 = performance.now();
      const timing = { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) };
      let f: VideoFrame;
      if (source === 'buffer') {
        f = new VideoFrame(yuv[i % yuv.length], { format: 'I420', codedWidth: width, codedHeight: height, ...timing });
      } else {
        ctx.fillStyle = `hsl(${(i * 37) % 360} 60% ${30 + (i % 5) * 10}%)`; ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#fff'; ctx.fillRect((i * 29) % width, (i * 17) % height, 40, 40);
        f = new VideoFrame(canvas, timing);
      }
      makeMs += performance.now() - m0;
      enc.encode(f, { keyFrame: i === 0 });
      f.close();
    }
    const r = await Promise.race([enc.flush().then(() => 'done' as const), new Promise<'timeout'>((res) => setTimeout(() => res('timeout'), 8000))]);
    const total = performance.now() - t0;
    out.makeMs = makeMs / frames;
    if (r === 'timeout') out.error = `${out.outputs} of ${frames} frames out in 8 s`;
    // The steady rate, after the encoder's warm-up: the first packet's wait is reported on its own.
    out.msAFrame = out.outputs > 1 && out.firstOutMs !== null ? (total - out.firstOutMs) / (out.outputs - 1) : out.outputs ? total : null;
  } catch (e) {
    out.error = String((e as Error)?.message ?? e);
  } finally {
    if (enc && enc.state !== 'closed') enc.close();
  }
  return out;
}

/** Every hint probed in turn on canvas frames, then the default and software encoders on buffer frames: for the console and the checks. */
export async function probeVideoEncoders(width: number, height: number, fps: number): Promise<LiveProbe[]> {
  const r: LiveProbe[] = [];
  for (const a of ['no-preference', 'prefer-hardware', 'prefer-software'] as LiveAcceleration[]) r.push(await probeVideoEncoder(width, height, fps, a));
  for (const a of ['no-preference', 'prefer-software'] as LiveAcceleration[]) r.push(await probeVideoEncoder(width, height, fps, a, 24, 'buffer'));
  return r;
}

/**
 * The hint a stream at this size should run with: the default unless it
 * cannot hold the frame rate and the software encoder can (see
 * `probeVideoEncoder`). The probes come back for the state to report.
 */
export async function chooseAcceleration(width: number, height: number, fps: number): Promise<{ acceleration: LiveAcceleration; probes: LiveProbe[] }> {
  const frameMs = 1000 / fps;
  const first = await probeVideoEncoder(width, height, fps, 'no-preference');
  const holds = (p: LiveProbe) => p.supported && p.msAFrame !== null && p.msAFrame <= frameMs && p.error === null;
  if (holds(first)) return { acceleration: 'no-preference', probes: [first] };
  const soft = await probeVideoEncoder(width, height, fps, 'prefer-software');
  const better = soft.supported && soft.msAFrame !== null && (first.msAFrame === null || soft.msAFrame < first.msAFrame);
  return { acceleration: better ? 'prefer-software' : 'no-preference', probes: [first, soft] };
}

/** One video encode and its own counts, keyframe schedule and staging canvas. */
interface VideoOut {
  spec: Required<Omit<LiveOutputSpec, 'videoBitrate'>> & { videoBitrate: number };
  cfg: VideoEncoderConfig;
  encoder: VideoEncoder | null;
  /** The two-second bucket the last keyframe was in: a keyframe at the first frame of each, on the schedule, not two seconds after the last one landed (which drifts later by each tick's lateness). */
  lastKeyBucket: number;
  described: boolean;
  counts: { frames: number; skipped: number; keyframes: number };
  /**
   * Where each frame is drawn at the output's size before it is encoded. A
   * VideoFrame made straight from the plate's canvas is the canvas's size
   * (the window's, 1024x653 in the Mac check), and an encoder configured for
   * another size converts and scales it on the CPU after reading the GPU
   * canvas back: the first Mac run of `npm run desktop` took 24 frames in
   * four seconds that way, skipping 97. Drawing the canvas onto a 2D canvas
   * of the output's size is one GPU blit, and a frame from a 2D canvas is the
   * path the lab's check already measured at the stream's rate. It is also
   * where the shape is made: the portrait output's crop of the plate.
   */
  stage: OffscreenCanvas | HTMLCanvasElement | null;
  stageCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
}

/**
 * The part of a `cw` x `ch` canvas an output of `w` x `h` shows, and where
 * it is drawn: 'cover' takes the largest rectangle of the output's shape
 * from the middle of the canvas (a 9:16 slice of a 16:9 plate: the middle
 * third of the dish, filling a phone), 'contain' draws all of the canvas
 * inside the output, centred, with black around it. Exported for the check.
 */
export function liveCrop(cw: number, ch: number, w: number, h: number, fit: 'cover' | 'contain'): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } {
  const ca = cw / ch, oa = w / h;
  if (fit === 'contain') {
    const dw = ca > oa ? w : h * ca, dh = ca > oa ? w / ca : h;
    return { sx: 0, sy: 0, sw: cw, sh: ch, dx: (w - dw) / 2, dy: (h - dh) / 2, dw, dh };
  }
  const sw = ca > oa ? ch * oa : cw, sh = ca > oa ? ch : cw / oa;
  return { sx: (cw - sw) / 2, sy: (ch - sh) / 2, sw, sh, dx: 0, dy: 0, dw: w, dh: h };
}

export class LiveEncoder {
  readonly opts: LiveOptions;
  private outs: VideoOut[] = [];
  private destinations: LiveDestinationSpec[] = [];
  private audio: AudioEncoder | null = null;
  private reader: ReadableStreamDefaultReader<AudioData> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private t0 = 0;
  /** 'track' when the chunks' own timestamps are on performance.now()'s clock (Chromium); 'arrival' is the fallback. */
  private audioClock: 'track' | 'arrival' | null = null;
  private audioOriginUs = 0;
  private audioBaseMs = 0;
  private audioCodec: 'aac' | 'opus' | null = null;
  private audioDescribed = false;
  private transportState: LiveTransportState | null = null;
  private audioPackets = 0;
  /** For the checks: the first output's ms spent making frames, ms from its first encode to its first packet out, packets out. */
  readonly timing = { grabMs: 0, firstOutMs: null as number | null, firstEncodeAt: 0, outputs: 0 };
  private acceleration: LiveAcceleration | null = null;
  private probes: LiveProbe[] = [];
  private phase: LiveState['phase'] = 'idle';
  private error: string | null = null;
  private stopping = false;
  /**
   * With `frames`: the frame task copies the next picture only when a frame
   * has gone out since the last. Before its first copy the stage is black,
   * and goes out black: at sixty a second that is a frame or two, and a page
   * whose plate never draws (the panel's check, on a machine with no WebGPU)
   * still makes a stream, its first frame a keyframe, as it always has.
   * Black then is the truth about the plate, not the bug: once a picture has
   * come, the stage keeps it until the next copy, and a plate slower than
   * the stream is repeated, never blacked out. The copy is the first plate
   * frame after a stream frame went out, not the last before the next: at
   * sixty and thirty that is up to one plate frame (17 ms) older than the
   * stream frame's stamp, well inside what a viewer's player smooths over,
   * for half the copies a copy on every frame would cost.
   */
  private want = true;
  private unlisten: (() => void) | null = null;

  constructor(opts: LiveOptions) {
    this.opts = opts;
    const { fps } = opts;
    const specs: LiveOutputSpec[] = opts.outputs?.length ? opts.outputs : [{ id: 'wide', width: opts.width ?? 1920, height: opts.height ?? 1080, videoBitrate: opts.videoBitrate }];
    const ids = new Set<string>();
    for (const [i, o] of specs.entries()) {
      if (ids.has(o.id)) throw new Error(`two outputs named "${o.id}"`);
      ids.add(o.id);
      const codec = avcCodec(o.width, o.height, fps);
      const videoBitrate = o.videoBitrate ?? (i === 0 ? opts.videoBitrate : undefined) ?? bitrateFor(codec, o.width, o.height, fps);
      this.outs.push({
        spec: { id: o.id, width: o.width, height: o.height, fit: o.fit ?? 'cover', videoBitrate },
        cfg: { codec, width: o.width, height: o.height, framerate: fps, bitrate: videoBitrate, bitrateMode: 'constant', latencyMode: 'realtime', avc: { format: 'avc' } } as VideoEncoderConfig,
        encoder: null, lastKeyBucket: -1, described: false, counts: { frames: 0, skipped: 0, keyframes: 0 }, stage: null, stageCtx: null,
      });
    }
    this.destinations = opts.destinations?.length ? opts.destinations : [{ url: opts.url ?? '', keyName: opts.keyName, key: opts.key, output: this.outs[0].spec.id }];
    for (const d of this.destinations) if (d.output !== undefined && !ids.has(d.output)) throw new Error(`${d.name ?? d.url}: no output "${d.output}"`);
  }

  state(): LiveState {
    const first = this.outs[0];
    return {
      phase: this.phase, error: this.error,
      seconds: this.t0 ? (performance.now() - this.t0) / 1000 : 0,
      ...first.counts,
      audioPackets: this.audioPackets,
      audioCodec: this.audioCodec,
      audioClock: this.audioClock,
      timing: { ...this.timing },
      acceleration: this.acceleration,
      probes: this.probes,
      encodeQueue: first.encoder?.encodeQueueSize ?? 0,
      outputs: this.outs.map((o) => ({ ...o.spec, ...o.counts, encodeQueue: o.encoder?.encodeQueueSize ?? 0 })),
      transport: this.transportState,
    };
  }

  /** Connect, then encode until `stop`. Resolves once a server has taken the stream. */
  async start(): Promise<void> {
    if (this.phase !== 'idle') throw new Error(`already ${this.phase}`);
    if (!liveSupport()) throw new Error('this browser cannot encode a stream (no WebCodecs)');
    this.phase = 'starting';
    const { fps, audio, transport } = this.opts;
    const audioBitrate = this.opts.audioBitrate ?? 160000;
    try {
      // The audio's rate and channels are the track's: read its first chunk before anything is configured.
      let first: AudioData | null = null;
      let firstReadAt = 0;
      let audioMeta: LiveAudioMeta | null = null;
      const track = audio?.getAudioTracks()[0] ?? null;
      if (track) {
        const Processor = (globalThis as unknown as { MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<AudioData> } }).MediaStreamTrackProcessor;
        if (!Processor) throw new Error('this browser cannot read the audio track (no MediaStreamTrackProcessor)');
        this.reader = new Processor({ track }).readable.getReader();
        const r = await this.reader.read();
        if (r.done || !r.value) throw new Error('the audio track ended before the stream began');
        first = r.value;
        firstReadAt = performance.now();
        const channels = Math.min(2, first.numberOfChannels);
        const codec = await liveAudioCodec(first.sampleRate, channels, audioBitrate, this.opts.audioCodec);
        if (!codec) throw new Error(`no audio encoder for ${channels} channels at ${first.sampleRate} Hz`);
        this.audioCodec = codec;
        audioMeta = { codec, sampleRate: first.sampleRate, channels, bitrate: audioBitrate };
      }
      // The hint is chosen on the first output's size (the largest, in the usual show) and used for all of them.
      const lead = this.outs[0].spec;
      if (this.opts.acceleration) this.acceleration = this.opts.acceleration;
      else { const c = await chooseAcceleration(lead.width, lead.height, fps); this.acceleration = c.acceleration; this.probes = c.probes; }
      for (const o of this.outs) {
        o.cfg.hardwareAcceleration = this.acceleration;
        const vs = await VideoEncoder.isConfigSupported(o.cfg);
        if (!vs.supported) throw new Error(`no H.264 encoder for ${o.spec.width}x${o.spec.height} at ${fps} fps`);
      }

      const outputs = this.outs.map((o) => ({ id: o.spec.id, meta: { width: o.spec.width, height: o.spec.height, fps, videoBitrate: o.spec.videoBitrate, audio: audioMeta } }));
      const started = await transport.start({ outputs, destinations: this.destinations });
      this.transportState = started.state ?? null;
      if (!started.ok) throw new Error(started.error ?? 'the server refused the stream');

      this.t0 = performance.now();
      for (const o of this.outs) {
        o.encoder = new VideoEncoder({
          output: (chunk, m) => this.onVideo(o, chunk, m),
          error: (e) => this.fail(e),
        });
        o.encoder.configure(o.cfg);
      }
      if (first && audioMeta) {
        this.audio = new AudioEncoder({
          output: (chunk, m) => this.onAudio(chunk, m),
          error: (e) => this.fail(e),
        });
        this.audio.configure({ codec: audioMeta.codec === 'aac' ? 'mp4a.40.2' : 'opus', sampleRate: audioMeta.sampleRate, numberOfChannels: audioMeta.channels, bitrate: audioBitrate });
      }
      this.phase = 'live';
      if (this.opts.frames) this.unlisten = listenLiveFrames(this.opts.frames, (c) => this.take(c));
      if (first) { this.takeAudio(first, firstReadAt); void this.pumpAudio(); }
      this.tick(0);
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }

  /** The frame timer: the next frame at t0 + n/fps, for every output; late ones skipped, never queued. */
  private tick(n: number): void {
    if (this.phase !== 'live') return;
    const { fps, canvas, keySeconds = 2, frames } = this.opts;
    const frameMs = 1000 / fps;
    const now = performance.now() - this.t0;
    // n is the frame due now; if more than one is due, the ones between are skipped.
    const due = Math.max(n, Math.floor(now / frameMs));
    const bucket = Math.floor(now / (keySeconds * 1000));
    for (const [i, o] of this.outs.entries()) {
      if (!o.encoder) continue;
      if (due > n) o.counts.skipped += due - n;
      // Each output is its own encoder: one that is behind skips its own frame, and the others still take theirs.
      if (o.encoder.encodeQueueSize >= 3) { o.counts.skipped++; continue; }
      const keyFrame = bucket > o.lastKeyBucket;
      let frame: VideoFrame | null = null;
      try {
        const t = performance.now();
        frame = new VideoFrame(frames ? this.stageOf(o) : this.staged(canvas, o), { timestamp: Math.round(now * 1000), duration: Math.round(frameMs * 1000) });
        if (i === 0 && o.counts.frames === 0) this.timing.firstEncodeAt = t;
        o.encoder.encode(frame, { keyFrame });
        if (i === 0) this.timing.grabMs += performance.now() - t;
        if (keyFrame) { o.lastKeyBucket = bucket; o.counts.keyframes++; }
        o.counts.frames++;
      } catch (e) {
        this.fail(e);
        return;
      } finally {
        frame?.close();
      }
    }
    this.want = true;
    const next = this.t0 + (due + 1) * frameMs;
    this.timer = setTimeout(() => this.tick(due + 1), Math.max(0, next - performance.now()));
  }

  /**
   * The frame task's picture, copied onto every output's stage while it can
   * still be read (lib/liveFrame.ts), once for each frame the clock has sent
   * since: the plate draws at the display's rate and the stream takes 30.
   * Copied even at the output's own size, unlike `staged`: the canvas
   * itself is unreadable by the time the frame is due.
   */
  private take(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    if (!this.want || this.phase !== 'live') return;
    const t = performance.now();
    for (const o of this.outs) this.stage(canvas, o);
    this.timing.grabMs += performance.now() - t;
    this.want = false;
  }

  /** The canvas drawn at the output's size and shape (see `VideoOut.stage`); the canvas itself when it already is both. */
  private staged(canvas: HTMLCanvasElement, o: VideoOut): HTMLCanvasElement | OffscreenCanvas {
    const { width, height } = o.spec;
    if (canvas.width === width && canvas.height === height) return canvas;
    return this.stage(canvas, o);
  }

  /** The output's staging canvas, made black at its size the first time. */
  private stageOf(o: VideoOut): HTMLCanvasElement | OffscreenCanvas {
    const { width, height } = o.spec;
    if (!o.stage) {
      o.stage = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
      o.stageCtx = o.stage.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
      if (o.stageCtx) { o.stageCtx.fillStyle = '#000'; o.stageCtx.fillRect(0, 0, width, height); }
    }
    return o.stage;
  }

  private stage(canvas: HTMLCanvasElement | OffscreenCanvas, o: VideoOut): HTMLCanvasElement | OffscreenCanvas {
    const { width, height, fit } = o.spec;
    const stage = this.stageOf(o);
    const ctx = o.stageCtx;
    if (!ctx) throw new Error('no 2D context to stage the stream\'s frames on');
    // Cropped, never stretched: a round dish drawn into another shape would be an oval (37x-4b stretched the window's canvas to 16:9).
    const c = liveCrop(canvas.width, canvas.height, width, height, fit);
    if (fit === 'contain') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height); }
    ctx.drawImage(canvas, c.sx, c.sy, c.sw, c.sh, c.dx, c.dy, c.dw, c.dh);
    return stage;
  }

  private onVideo(o: VideoOut, chunk: EncodedVideoChunk, m?: EncodedVideoChunkMetadata): void {
    if (o === this.outs[0] && this.timing.outputs++ === 0) this.timing.firstOutMs = performance.now() - this.timing.firstEncodeAt;
    const desc = m?.decoderConfig?.description;
    if (desc && !o.described) {
      o.described = true;
      void this.opts.transport.config({ output: o.spec.id, video: copyBytes(desc) });
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.opts.transport.packet({ kind: 'video', output: o.spec.id, timestampMs: chunk.timestamp / 1000, key: chunk.type === 'key', data });
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

  /**
   * `readAt` is when the chunk came off the track, which for the first chunk
   * is before the encoder probes and the server's answer: a second or more
   * before `t0` on CI's Mac, where the clock then read as 'arrival' and the
   * sync line found the sound 118 ms late, every click (the AAC encoder's
   * own delay, stamped as if it were the sound's). The browser's clock is
   * judged against the moment the chunk was read, not against now.
   */
  private takeAudio(ad: AudioData, readAt = performance.now()): void {
    try {
      if (this.audioClock === null) {
        const now = performance.now();
        if (Math.abs(ad.timestamp / 1000 - readAt) < 1000) {
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
    this.audioPackets++;
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
    this.unlisten?.(); this.unlisten = null;
    for (const o of this.outs) { try { if (o.encoder && o.encoder.state === 'configured') await o.encoder.flush(); } catch { /* failed already */ } }
    try { if (this.audio && this.audio.state === 'configured') await this.audio.flush(); } catch { /* failed already */ }
    for (const o of this.outs) { try { o.encoder?.close(); } catch { /* closed */ } }
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

// --- The console's plan (the Mac app's console and panel are lib/liveShow.ts) ---

/** A destination as the console takes it: a portrait one goes to the vertical encode. */
export interface LiveConsoleDestination { name?: string; url: string; keyName?: string; key?: string; orientation?: 'landscape' | 'portrait' }

export interface LiveConsoleOptions {
  /** Several destinations at once (37x-4c); or `url` and `keyName` for one. */
  destinations?: LiveConsoleDestination[];
  url?: string;
  keyName?: string;
  key?: string;
  /** The landscape encode's size: 1920 wide and 16:9 unless said. */
  width?: number;
  height?: number;
  /** The portrait encode's size, made only when a destination is portrait: 720x1280 unless said (Instagram's and TikTok's). */
  portrait?: { width?: number; height?: number; fit?: 'cover' | 'contain' };
  fps?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  acceleration?: LiveAcceleration;
}

/**
 * The console's options as the encoder's outputs and destinations: one
 * landscape output, a portrait one only if a destination asks for it.
 * Exported for the check.
 */
export function liveConsolePlan(o: LiveConsoleOptions): { outputs: LiveOutputSpec[]; destinations: LiveDestinationSpec[] } {
  const asked: LiveConsoleDestination[] = o.destinations?.length ? o.destinations : [{ url: o.url ?? '', keyName: o.keyName, key: o.key }];
  const width = o.width ?? 1920, height = o.height ?? Math.round(width * 9 / 16);
  const portrait = asked.some((d) => d.orientation === 'portrait');
  const landscape = asked.some((d) => d.orientation !== 'portrait');
  const outputs: LiveOutputSpec[] = [];
  if (landscape) outputs.push({ id: 'landscape', width, height, videoBitrate: o.videoBitrate });
  if (portrait) {
    const pw = o.portrait?.width ?? 720, ph = o.portrait?.height ?? Math.round(pw * 16 / 9);
    outputs.push({ id: 'portrait', width: pw, height: ph, fit: o.portrait?.fit ?? 'cover' });
  }
  const destinations = asked.map((d) => ({ name: d.name ?? d.keyName, url: d.url, keyName: d.keyName, key: d.key, output: d.orientation === 'portrait' ? 'portrait' : 'landscape' }));
  return { outputs, destinations };
}
