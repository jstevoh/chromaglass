/**
 * Render a song: the encoding half.
 *
 * PLAN.md §6. Recording today (hooks/useRecorder.ts) is MediaRecorder on the
 * canvas: whatever reached the screen, frames dropped whenever the machine was
 * busy, timing that follows the render loop's luck. A render is the opposite:
 * the show is stepped one frame at a time on the show clock
 * (lib/showClock.ts), each frame is handed to WebCodecs' `VideoEncoder` with
 * the timestamp it *should* have, the song's own samples go through
 * `AudioEncoder`, and a muxer written here (lib/muxMp4.ts, lib/muxWebm.ts)
 * streams the result to disk. However long a frame takes to draw and encode,
 * it lands at exactly `i / fps` seconds in the film, so no frame is dropped
 * and none is late: the only thing a slow machine changes is how long the
 * render takes.
 *
 * This file knows nothing about the plate. It takes frames from whoever draws
 * them (the visualizer, or the lab in `npm run render-lab`) and owns only:
 * which codec and container this browser can write, the encoders and their
 * back-pressure, where the bytes go, and a cancel that leaves nothing behind.
 *
 * ## Which codec
 *
 * H.264 and AAC in MP4 first: what every player and editor opens, and what
 * Chrome on a Mac encodes in hardware. Where the browser cannot encode those
 * (open-source Chromium, which is what a cloud session's harnesses run),
 * VP9 and Opus in WebM, which it can. Asked by `isConfigSupported`, never
 * guessed from the user agent: a browser that says no to H.264 at 4K may say
 * yes at 1080p, and the answer decides the container, since this writer only
 * pairs each codec with the container that is its natural home.
 *
 * ## Where the bytes go
 *
 * Chrome's File System Access (`showSaveFilePicker`) where there is one: the
 * film is written to the file as it is made, a three-minute 1080p render is
 * never held in memory, and the header fields that are only known at the end
 * are written into place with a positioned write. Elsewhere the chunks are
 * kept in memory and offered as a download at the end, which is fine for a
 * song and says so for a long one.
 */
import { Mp4Muxer, type Mp4AudioConfig } from './muxMp4.ts';
import { WebmMuxer, opusPreSkip } from './muxWebm.ts';
import { MemorySink, trimAudio, type ByteSink, type MuxSample } from './muxShared.ts';

export type Container = 'mp4' | 'webm';

export interface RenderFormat {
  container: Container;
  /** WebCodecs codec strings. */
  videoCodec: string;
  audioCodec: 'aac' | 'opus';
  audioCodecString: string;
  /** For the UI: "H.264 + AAC in MP4". */
  label: string;
  ext: 'mp4' | 'webm';
  mime: string;
  videoBitrate: number;
  audioBitrate: number;
}

/** What a browser can say about rendering, before anyone presses anything. */
export interface RenderSupport {
  /** WebCodecs is there at all (Chrome, Edge; not Firefox or Safari as of writing). */
  webcodecs: boolean;
  /** The film can be streamed to a file as it is made, rather than held until the end. */
  streamsToDisk: boolean;
}

export function renderSupport(): RenderSupport {
  const g = globalThis as unknown as { VideoEncoder?: unknown; AudioEncoder?: unknown; VideoFrame?: unknown; showSaveFilePicker?: unknown };
  return {
    webcodecs: typeof g.VideoEncoder === 'function' && typeof g.AudioEncoder === 'function' && typeof g.VideoFrame === 'function',
    streamsToDisk: typeof g.showSaveFilePicker === 'function',
  };
}

/**
 * The H.264 level a size and rate need (Table A-1 of the standard, by
 * macroblocks a second), in a High-profile codec string. A level too low is a
 * configuration the encoder refuses; the lowest that fits is what every
 * decoder can play.
 */
export function avcCodec(width: number, height: number, fps: number): string {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const rate = mbs * fps;
  const levels: [number, number, number][] = [
    // [level_idc, max macroblocks a frame, max macroblocks a second]
    [0x1f, 3600, 108000], [0x20, 5120, 216000], [0x28, 8192, 245760], [0x2a, 8704, 522240],
    [0x32, 22080, 589824], [0x33, 36864, 983040], [0x34, 36864, 2073600], [0x3c, 139264, 4177920],
  ];
  const lv = levels.find(([, f, r]) => mbs <= f && rate <= r) ?? levels[levels.length - 1];
  return `avc1.6400${lv[0].toString(16).padStart(2, '0')}`;
}

/** VP9 profile 0, 8-bit, at the level for this size and rate (the VP9 levels table, by luma samples a second). */
export function vp9Codec(width: number, height: number, fps: number): string {
  const rate = width * height * fps;
  const levels: [string, number][] = [['21', 4_608_000], ['30', 20_736_000], ['31', 36_864_000], ['40', 83_558_400], ['41', 160_432_128], ['50', 311_951_360], ['51', 588_251_136], ['52', 1_176_502_272]];
  const lv = levels.find(([, r]) => rate <= r)?.[0] ?? '61';
  return `vp09.00.${lv}.08`;
}

/**
 * Bits a second for a film this size: a fixed number of bits per pixel per
 * frame, which is how bitrates are usually scaled across sizes. 0.1 for
 * H.264 gives 12.4 Mbps at 1080p60, about what YouTube asks for an upload of
 * that size; VP9 does the same picture in about two thirds. Clamped to what
 * the encoders take happily.
 */
export function videoBitrate(codec: string, width: number, height: number, fps: number): number {
  const bpp = codec.startsWith('avc1') ? 0.1 : 0.066;
  return Math.round(Math.min(80e6, Math.max(2e6, width * height * fps * bpp)));
}

/**
 * About how big a film will be, in bytes, before anything is encoded: the
 * H.264 rate (the larger of the two this writer uses) and the AAC rate, for
 * the length of the song. An estimate for a warning, not a promise: the
 * encoders aim at the rate and land near it.
 */
export function estimateFilmBytes(width: number, height: number, fps: number, seconds: number): number {
  return ((videoBitrate('avc1', width, height, fps) + 192_000) * seconds) / 8;
}

/**
 * The best this browser can write for a film of this size, or null when it
 * can write none (no WebCodecs, or no codec at this size).
 */
export async function pickRenderFormat(width: number, height: number, fps: number, sampleRate: number, channels: number): Promise<RenderFormat | null> {
  if (!renderSupport().webcodecs) return null;
  const candidates: Omit<RenderFormat, 'videoBitrate'>[] = [
    { container: 'mp4', videoCodec: avcCodec(width, height, fps), audioCodec: 'aac', audioCodecString: 'mp4a.40.2', label: 'H.264 + AAC in MP4', ext: 'mp4', mime: 'video/mp4', audioBitrate: 192_000 },
    { container: 'webm', videoCodec: vp9Codec(width, height, fps), audioCodec: 'opus', audioCodecString: 'opus', label: 'VP9 + Opus in WebM', ext: 'webm', mime: 'video/webm', audioBitrate: 160_000 },
  ];
  for (const c of candidates) {
    const vb = videoBitrate(c.videoCodec, width, height, fps);
    try {
      const v = await VideoEncoder.isConfigSupported(videoConfig(c.videoCodec, width, height, fps, vb));
      if (!v.supported) continue;
      const a = await AudioEncoder.isConfigSupported({ codec: c.audioCodecString, sampleRate, numberOfChannels: channels, bitrate: c.audioBitrate });
      if (!a.supported) continue;
      return { ...c, videoBitrate: vb };
    } catch { /* a codec string this browser does not know: the next */ }
  }
  return null;
}

function videoConfig(codec: string, width: number, height: number, fps: number, bitrate: number): VideoEncoderConfig {
  return {
    codec, width, height, bitrate, framerate: fps,
    // Quality over latency: nothing is watching this live, and the realtime
    // mode lets the encoder drop quality (or frames) to keep up.
    latencyMode: 'quality',
    // A plain AVC bitstream with its parameter sets in the description
    // (avcC), which is what MP4 carries; the default, said out loud.
    ...(codec.startsWith('avc1') ? { avc: { format: 'avc' } } : {}),
  } as VideoEncoderConfig;
}

/** Where a render's bytes go: a file as it is written, or memory until the end. */
export interface RenderSink extends ByteSink {
  /** Resolves once every write so far has reached the file. */
  settled(): Promise<void>;
  /** Close the file (or hand over the download). */
  close(): Promise<void>;
  /**
   * Throw away what was written, and say what is left: nothing
   * ('discarded', 'removed'), or an empty file where the person chose to
   * save ('left-empty'). Safe to call more than once; every call gets the
   * first one's answer.
   */
  abort(): Promise<SinkAbort>;
  readonly kind: 'file' | 'memory';
  /** The whole file, for a memory sink after `close` (and for the checks). */
  bytes?(): Uint8Array;
}

/**
 * What a cancelled render leaves behind. Chrome's save dialog creates the
 * file the moment it is chosen, empty, and aborting the writer throws away
 * only what was written into it; the empty file stays unless the handle can
 * remove it (`FileSystemHandle.remove`, where the browser has it). So the
 * message after a cancel says which, rather than promising a file is gone
 * that is sitting in the person's folder at 0 bytes.
 */
export type SinkAbort = { left: 'discarded' | 'removed' } | { left: 'left-empty'; name: string };

type SaveFilePicker = (opts: { suggestedName?: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>;

/**
 * The file to write to. Asks where to save when File System Access is there
 * (must be called from a click: the picker needs a user gesture), and falls
 * back to memory and a download otherwise. Rejects if the person cancels the
 * picker.
 */
export async function openRenderSink(suggestedName: string, format: RenderFormat, preferMemory = false): Promise<RenderSink> {
  const picker = (globalThis as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker && !preferMemory) {
    const handle = await picker({ suggestedName, types: [{ description: format.label, accept: { [format.mime]: [`.${format.ext}`] } }] });
    const writable = await handle.createWritable();
    return fileSink(writable, handle);
  }
  return memorySink(suggestedName, format.mime);
}

/**
 * A sink onto a FileSystemWritableFileStream. Writes are positioned, so the
 * muxer's patches land where they belong, and chained, so they reach the file
 * in the order the muxer made them; `settled` is what the render loop waits
 * on so the chain never runs more than a frame or two ahead of the disk.
 */
export function fileSink(writable: FileSystemWritableFileStream, handle?: FileSystemFileHandle): RenderSink {
  let chain: Promise<void> = Promise.resolve();
  let aborted: Promise<SinkAbort> | null = null;
  let pos = 0;
  let error: unknown = null;
  const queue = (position: number, data: Uint8Array) => {
    chain = chain.then(() => writable.write({ type: 'write', position, data: data as unknown as BufferSource })).catch((e) => { error ??= e; });
  };
  return {
    kind: 'file',
    write(bytes) { queue(pos, bytes); pos += bytes.length; },
    patch(position, bytes) { queue(position, bytes); },
    async settled() { await chain; if (error) throw error; },
    async close() { await chain; if (error) throw error; await writable.close(); },
    abort() {
      aborted ??= (async (): Promise<SinkAbort> => {
        try { await chain; } catch { /* aborting anyway */ }
        try { await writable.abort(); } catch { /* already closed */ }
        const remove = (handle as unknown as { remove?: () => Promise<void> } | undefined)?.remove;
        if (handle && remove) {
          try { await remove.call(handle); return { left: 'removed' }; } catch { /* not allowed here: say so below */ }
        }
        return handle ? { left: 'left-empty', name: handle.name } : { left: 'discarded' };
      })();
      return aborted;
    },
  };
}

/** A sink in memory, downloaded as `name` when closed. */
export function memorySink(name: string, mime: string, download = true): RenderSink {
  const mem = new MemorySink();
  return {
    kind: 'memory',
    write: (b) => mem.write(b),
    patch: (p, b) => mem.patch(p, b),
    settled: async () => {},
    bytes: () => mem.bytes(),
    async close() {
      if (!download || typeof document === 'undefined') return;
      const blob = new Blob(mem.chunks as BlobPart[], { type: mime });
      // The Blob holds the film now; the chunks were a second copy of it,
      // which for a long song on a browser with no file streaming is the
      // difference between one film in memory and two.
      mem.clear();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    async abort() { mem.clear(); return { left: 'discarded' as const }; },
  };
}

/** A frame's presentation time and duration, in microseconds, so frames tile the timeline exactly. */
export function frameTiming(index: number, fps: number): { timestampUs: number; durationUs: number } {
  const t = Math.round((index * 1e6) / fps);
  return { timestampUs: t, durationUs: Math.round(((index + 1) * 1e6) / fps) - t };
}

export interface RenderEncoderOptions {
  format: RenderFormat;
  width: number;
  height: number;
  fps: number;
  sink: RenderSink;
  /** The song's samples (planar), or null for a silent film. */
  audio: { sampleRate: number; channels: Float32Array[] } | null;
  /** A keyframe this often, in seconds: seeking and cutting land on one. */
  keySeconds?: number;
  /** Hash every frame's pixels as it goes in, for the checks (costs a readback a frame). */
  hashFrames?: boolean;
}

/**
 * The encoders and the muxer for one render. Audio first (`encodeAudio`), all
 * of it, before the first frame, so its packets are waiting for the frames
 * they belong beside; then `addFrame` once per frame, in order; then
 * `finish`. `cancel` at any point stops everything and discards the file.
 */
export class RenderEncoder {
  readonly opts: RenderEncoderOptions;
  private readonly video: VideoEncoder;
  /**
   * Made once the audio is encoded, not before: WebM writes the audio
   * track's description (the OpusHead) into the header at the top of the
   * file, and the encoder only hands it over with its first packet.
   */
  private mux: Mp4Muxer | WebmMuxer | null = null;
  private error: unknown = null;
  private frames = 0;
  private cancelled = false;
  /** One FNV-1a hash a frame of the pixels that went in, when `hashFrames`. */
  readonly frameHashes: string[] = [];

  constructor(opts: RenderEncoderOptions) {
    this.opts = opts;
    const { format, width, height, fps } = opts;
    this.video = new VideoEncoder({
      output: (chunk, meta) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        const desc = meta?.decoderConfig?.description;
        const description = desc ? new Uint8Array(desc instanceof ArrayBuffer ? desc : (desc as ArrayBufferView).buffer.slice((desc as ArrayBufferView).byteOffset, (desc as ArrayBufferView).byteOffset + (desc as ArrayBufferView).byteLength)) : null;
        const sample: MuxSample = { data, timestampUs: chunk.timestamp, durationUs: chunk.duration ?? Math.round(1e6 / fps), key: chunk.type === 'key' };
        const mux = this.muxer();
        if (mux instanceof Mp4Muxer) mux.addVideo(sample, description);
        else mux.addVideo(sample);
      },
      error: (e) => { this.error ??= e; },
    });
    this.video.configure(videoConfig(format.videoCodec, width, height, fps, format.videoBitrate));
  }

  /** The muxer, made on first use with whatever audio description the encoder gave. */
  private muxer(): Mp4Muxer | WebmMuxer {
    if (this.mux) return this.mux;
    const { format, width, height, fps, sink, audio } = this.opts;
    const channels = audio ? Math.min(2, audio.channels.length) : 0;
    const audioCfg = audio ? { sampleRate: audio.sampleRate, channels, description: this.audioDescription } : null;
    // WebM needs no edit: its Opus track's CodecDelay (from the same
    // pre-skip) is what skips the priming, and the tail past the song is at
    // most one 20 ms packet of the encoder's padding, which `trimAudio`
    // cannot cut finer than a packet and WebM could only cut with a
    // BlockGroup's DiscardPadding.
    this.mux = format.container === 'mp4'
      ? new Mp4Muxer(sink, { codec: format.videoCodec, width, height, fps },
        audioCfg ? { codec: format.audioCodec, ...audioCfg, bitrate: format.audioBitrate, edit: this.audioEdit } as Mp4AudioConfig : null)
      : new WebmMuxer(sink, { codec: format.videoCodec, width, height, fps }, audioCfg ? { codec: 'opus', ...audioCfg } : null);
    return this.mux;
  }

  private check(): void {
    if (this.error) throw this.error instanceof Error ? this.error : new Error(String(this.error));
    if (this.cancelled) throw new RenderCancelled();
  }

  /**
   * The whole song through the audio encoder, its packets into the muxer.
   * Separate from the frames because it needs nothing from the plate, and
   * done first because a container's audio track has to be described before
   * the first packet of it can be written (WebM puts the Opus header in the
   * track entry at the top of the file).
   */
  async encodeAudio(onProgress?: (fraction: number) => void): Promise<void> {
    const audio = this.opts.audio;
    const format = this.opts.format;
    if (!audio) return;
    const channels = audio.channels.slice(0, 2);
    const packets: MuxSample[] = [];
    let description: Uint8Array | null = null;
    let err: unknown = null;
    const enc = new AudioEncoder({
      output: (chunk, meta) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        const desc = meta?.decoderConfig?.description;
        if (desc && !description) description = copyDescription(desc);
        packets.push({ data, timestampUs: chunk.timestamp, durationUs: chunk.duration ?? 0, key: true });
      },
      error: (e) => { err ??= e; },
    });
    const config = { codec: format.audioCodecString, sampleRate: audio.sampleRate, numberOfChannels: channels.length, bitrate: format.audioBitrate };
    enc.configure(config);
    const n = channels[0].length;
    // A second at a time: large enough that the per-call cost vanishes,
    // small enough that the encoder's queue never holds much.
    const block = audio.sampleRate;
    for (let at = 0; at < n; at += block) {
      if (this.cancelled) { enc.close(); throw new RenderCancelled(); }
      const len = Math.min(block, n - at);
      const planar = new Float32Array(len * channels.length);
      channels.forEach((ch, c) => planar.set(ch.subarray(at, at + len), c * len));
      const data = new AudioData({
        format: 'f32-planar', sampleRate: audio.sampleRate, numberOfFrames: len, numberOfChannels: channels.length,
        timestamp: Math.round((at * 1e6) / audio.sampleRate), data: planar,
      });
      enc.encode(data);
      data.close();
      /*
        Back-pressure by waiting for the queue to drain, never by flushing.
        This used to be `await enc.flush()` whenever more than four blocks
        were queued, and on the Mac CI runner that made an 8-second song an
        8072 ms file: a flush is the end of a stream to an AAC encoder, so it
        emptied its lapped transform, closed the stream with one extra packet,
        and started the next second of song as a new stream, with 2112 fresh
        samples of priming and timestamps starting over. The counts fit
        exactly: 238 packets for the first five seconds (ceil((2112 +
        240000) / 1024) + 1) and 144 for the last three, the second run
        stamped from 5000 ms, so the track ended at 5000 + 144 x 21.33 =
        8072 ms, with a burst of silence and a click at five seconds in the
        sound. The encoder's queue is waited on instead, the way `addFrame`
        waits on the video's; a browser whose encoder never fires `dequeue`
        is polled rather than hung. The one flush is at the end.
      */
      while (enc.encodeQueueSize > 4) {
        await new Promise<void>((r) => {
          const t = setTimeout(r, 50);
          enc.addEventListener('dequeue', () => { clearTimeout(t); r(); }, { once: true });
        });
        if (this.cancelled) { enc.close(); throw new RenderCancelled(); }
      }
      onProgress?.(Math.min(1, (at + len) / n));
    }
    await enc.flush();
    enc.close();
    if (err) throw err;
    /*
      The song's stretch of the track: where in it the song starts (past the
      encoder's priming) and which packets hold nothing of it (see
      `trimAudio` in lib/muxShared.ts). Chrome's encoders stamp their first
      packet at the first sample they were given and hide the priming in it,
      so how much there is has to come from somewhere else:
        - Opus says, in the OpusHead it hands over (the pre-skip);
        - AAC does not, so it is measured (`measurePriming`: a short burst
          through a second encoder and back through a decoder, and where it
          comes out), and where that cannot be done, Apple's 2112 (TN2258),
          which is the encoder Chrome uses on the Mac, and which the CI's
          packet counts above agree with.
      An encoder that stamps its priming before zero is believed over all of
      these (`trimAudio` looks first).
    */
    let hidden: number;
    let source: AudioPriming['source'];
    if (format.audioCodec === 'opus') {
      hidden = description ? opusPreSkip(description) : 312;
      source = 'opus-head';
    } else {
      const measured = await measurePriming(config, description, true).catch(() => null);
      hidden = measured ?? AAC_PRIMING;
      source = measured === null ? 'assumed' : 'measured';
    }
    const trim = trimAudio(packets, audio.sampleRate, n, hidden);
    this.priming = { samples: trim.skip, source: trim.priming === 'timestamps' ? 'timestamps' : source, dropped: trim.dropped };
    // The container's audio description is the encoder's own where it gave
    // one (the OpusHead, the AAC config); the muxers write a standard one
    // otherwise.
    this.audioDescription = description;
    this.audioEdit = { skip: trim.skip, length: trim.length };
    const mux = this.muxer();
    for (const p of trim.packets) mux.addAudio(p);
    mux.endAudio();
    this.audioPackets = trim.packets.length;
    // The samples are in the file now (the muxer holds the packets until the
    // frames beside them are written): let go of the song, which for four
    // minutes of stereo is some 90 MB the render no longer needs.
    this.opts.audio = null;
  }
  /** Where the song starts in the audio track and how that was known, once `encodeAudio` is done (for the checks). */
  priming: AudioPriming | null = null;
  /** The song's stretch of the audio track, for the MP4's edit list. */
  private audioEdit: { skip: number; length: number } | null = null;
  audioDescription: Uint8Array | null = null;
  audioPackets = 0;

  /**
   * One frame, at index `this.frames`. `make` builds the VideoFrame for the
   * timestamp and duration this frame must have (from the canvas the plate
   * was just drawn on, or from pixels), and it is closed here once encoded.
   * Resolves once the encoder has room for the next, so a render never runs
   * further ahead of the encoder than a few frames, and never holds more
   * than that in memory.
   */
  async addFrame(make: (timestampUs: number, durationUs: number) => VideoFrame): Promise<void> {
    this.check();
    const { fps, keySeconds = 2, hashFrames } = this.opts;
    const { timestampUs, durationUs } = frameTiming(this.frames, fps);
    const frame = make(timestampUs, durationUs);
    try {
      if (hashFrames) this.frameHashes.push(await hashVideoFrame(frame));
      this.video.encode(frame, { keyFrame: this.frames % Math.max(1, Math.round(keySeconds * fps)) === 0 });
    } finally {
      frame.close();
    }
    this.frames++;
    while (this.video.encodeQueueSize > 2) {
      await new Promise<void>((r) => this.video.addEventListener('dequeue', () => r(), { once: true }));
      this.check();
    }
    await this.opts.sink.settled();
    this.check();
  }

  get framesAdded(): number { return this.frames; }

  /** Flush the encoder, write the file's tail and close it. */
  async finish(): Promise<{ videoFrames: number; audioPackets: number; durationMs: number; bytes: number; priming: AudioPriming | null }> {
    this.check();
    await this.video.flush();
    this.video.close();
    this.check();
    const summary = { ...this.muxer().finish(), priming: this.priming };
    await this.opts.sink.close();
    return summary;
  }

  /** Stop, and throw the file away. Safe to call at any point, more than once. */
  async cancel(): Promise<void> {
    if (this.cancelled) return;
    this.cancelled = true;
    try { if (this.video.state !== 'closed') this.video.close(); } catch { /* already closed */ }
    await this.opts.sink.abort();
  }
}

/** Where the song starts in a render's audio track, and how that was known. */
export interface AudioPriming {
  /** Samples of the encoder's priming before the song's first sample (the MP4 edit's media time). */
  samples: number;
  /**
   * 'timestamps': the encoder stamped its first packet before zero;
   * 'opus-head': the OpusHead's pre-skip; 'measured': `measurePriming`;
   * 'assumed': Apple's 2112, for an AAC encoder that could not be measured.
   */
  source: 'timestamps' | 'opus-head' | 'measured' | 'assumed';
  /** Packets past the song's end that were left out of the file. */
  dropped: number;
}

/** Apple's AAC encoder's priming, in samples (Technical Note TN2258). */
export const AAC_PRIMING = 2112;

function copyDescription(desc: AllowSharedBufferSource): Uint8Array {
  if (desc instanceof ArrayBuffer) return new Uint8Array(desc.slice(0));
  const v = desc as ArrayBufferView;
  return new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
}

/**
 * How many samples of priming an audio encoder puts before the first sample
 * it is given, measured: a third of a second of noise through a fresh
 * encoder with `config`, the packets back through a decoder, and the lag at
 * which what comes out best matches what went in. Null when it cannot be
 * told (no decoder for it, or no clear match).
 *
 * Why measure rather than take 2112 on trust: 2112 is Apple's number, for
 * Apple's encoder, and Chrome uses another platform's encoder elsewhere
 * (Media Foundation on Windows), whose priming nothing here has seen. An
 * edit list that skips the wrong amount puts the sound early or late against
 * the picture by the difference, and no duration check would notice.
 *
 * The noise is the same every time (a fixed linear congruential sequence,
 * not Math.random), so the measurement is too. A decoder that already drops
 * the priming itself (it would have to know it, which an AAC decoder given
 * only an AudioSpecificConfig does not) would give 0, and 0 is returned as
 * null, "cannot tell", so the caller falls back rather than skipping
 * nothing. `describe` false decodes without the encoder's description,
 * which is how the lab measures Opus (whose decoder would otherwise honour
 * the pre-skip and hide it) to prove the measurement against a priming the
 * OpusHead states.
 */
export async function measurePriming(config: AudioEncoderConfig, description: Uint8Array | null, describe: boolean): Promise<number | null> {
  if (typeof AudioDecoder !== 'function') return null;
  const rate = config.sampleRate, ch = config.numberOfChannels;
  const n = 16384, window = 8192, maxLag = 4096;
  const probe = new Float32Array(n);
  let x = 0x2545f491;
  for (let i = 0; i < n; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; probe[i] = (x / 4294967296 - 0.5) * 0.5; }
  const chunks: EncodedAudioChunk[] = [];
  let desc: Uint8Array | null = null;
  let failed = false;
  const enc = new AudioEncoder({
    output: (c, meta) => { chunks.push(c); if (meta?.decoderConfig?.description && !desc) desc = copyDescription(meta.decoderConfig.description); },
    error: () => { failed = true; },
  });
  enc.configure(config);
  const planar = new Float32Array(n * ch);
  for (let c = 0; c < ch; c++) planar.set(probe, c * n);
  const data = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: ch, timestamp: 0, data: planar });
  enc.encode(data);
  data.close();
  await enc.flush();
  enc.close();
  if (failed || !chunks.length) return null;
  const out: Float32Array[] = [];
  const dec = new AudioDecoder({
    output: (a) => {
      const f = new Float32Array(a.numberOfFrames);
      a.copyTo(f, { planeIndex: 0, format: 'f32-planar' });
      out.push(f);
      a.close();
    },
    error: () => { failed = true; },
  });
  const d = describe ? (desc ?? description) : null;
  dec.configure({ codec: config.codec, sampleRate: rate, numberOfChannels: ch, ...(d ? { description: d } : {}) });
  for (const c of chunks) dec.decode(c);
  await dec.flush();
  dec.close();
  if (failed) return null;
  const got = new Float32Array(out.reduce((k, f) => k + f.length, 0));
  let at = 0;
  for (const f of out) { got.set(f, at); at += f.length; }
  if (got.length < maxLag + window) return null;
  let pp = 0;
  for (let i = 0; i < window; i++) pp += probe[i] * probe[i];
  let best = -1, bestLag = -1;
  for (let lag = 0; lag <= maxLag; lag++) {
    let pg = 0, gg = 0;
    for (let i = 0; i < window; i++) { const g = got[lag + i]; pg += probe[i] * g; gg += g * g; }
    const r = gg > 0 ? pg / Math.sqrt(pp * gg) : 0;
    if (r > best) { best = r; bestLag = lag; }
  }
  // A lossy codec at a render's bitrate keeps noise well above 0.5 against
  // itself at the right lag, and nowhere near it at any other.
  return best > 0.5 && bestLag > 0 ? bestLag : null;
}

/** Thrown out of a render that was cancelled, so the loop unwinds without calling it a failure. */
export class RenderCancelled extends Error {
  constructor() { super('render cancelled'); this.name = 'RenderCancelled'; }
}

/**
 * A frame's pixels as a hash (FNV-1a over RGBA), for checks that compare two
 * renders frame by frame whether or not the encoder is deterministic.
 */
export async function hashVideoFrame(frame: VideoFrame): Promise<string> {
  const w = frame.displayWidth, h = frame.displayHeight;
  const buf = new Uint8Array(w * h * 4);
  let bytes: Uint8Array = buf;
  try {
    await frame.copyTo(buf, { format: 'RGBA', rect: { x: 0, y: 0, width: w, height: h } } as VideoFrameCopyToOptions);
  } catch {
    // A browser whose copyTo cannot convert: the frame's own layout, which
    // is as good for telling two frames apart.
    bytes = new Uint8Array(frame.allocationSize());
    await frame.copyTo(bytes);
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { hash ^= bytes[i]; hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
