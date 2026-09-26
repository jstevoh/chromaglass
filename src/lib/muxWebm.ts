/**
 * A WebM writer: VP9 (or VP8, or AV1) video and Opus audio, streamed.
 *
 * The container a song render uses where the browser cannot encode H.264 and
 * AAC, which is every open-source Chromium, and so the one the checks in a
 * cloud session can run end to end (`npm run render-lab` encodes the lab's
 * plate through it and plays the file back in a `<video>`).
 *
 * WebM is a subset of Matroska, which is EBML: every element is an ID, a
 * length and a body, nested. What is written, in order:
 *
 *     EBML header        DocType "webm", version 4 (the version that allows
 *                        the Opus CodecDelay and SeekPreRoll below)
 *     Segment            size patched at the end
 *       SeekHead         where Info, Tracks and Cues are, so a player can
 *                        find the Cues without reading the whole file
 *       Info             1 ms timestamps, the duration (patched at the end)
 *       Tracks           video 1, audio 2
 *       Cluster …        one per video keyframe, each a run of SimpleBlocks
 *       Cues             a cue per cluster, for seeking
 *
 * Streamed: a cluster goes out as soon as the next one starts, so the file
 * is never held in memory, and the three things only known at the end (the
 * segment's size, the duration, where the cues are) are written into space
 * left for them, through the sink's `patch`. Every field that is patched is
 * written at a fixed width from the start, so a patch never changes a length.
 *
 * Nothing in the file depends on when or where it was written: no date, no
 * random UIDs (the track UIDs are 1 and 2), and "ChromaGlass" as the
 * muxing and writing app. The same samples always make the same bytes.
 */
import { Bytes, Interleaver, type ByteSink, type MuxSample } from './muxShared.ts';

export interface WebmVideoConfig {
  /** WebCodecs codec string: `vp09.…`, `vp8` or `av01.…`. */
  codec: string;
  width: number;
  height: number;
  /** Frames a second, for DefaultDuration. */
  fps: number;
}
export interface WebmAudioConfig {
  /** `opus` is the only audio WebM carries here. */
  codec: 'opus';
  sampleRate: number;
  channels: number;
  /** The encoder's OpusHead (its `decoderConfig.description`), or null to write one. */
  description?: Uint8Array | null;
}

const ID = {
  EBML: 0x1a45dfa3, EBMLVersion: 0x4286, EBMLReadVersion: 0x42f7, EBMLMaxIDLength: 0x42f2,
  EBMLMaxSizeLength: 0x42f3, DocType: 0x4282, DocTypeVersion: 0x4287, DocTypeReadVersion: 0x4285,
  Segment: 0x18538067, SeekHead: 0x114d9b74, Seek: 0x4dbb, SeekID: 0x53ab, SeekPosition: 0x53ac,
  Info: 0x1549a966, TimestampScale: 0x2ad7b1, Duration: 0x4489, MuxingApp: 0x4d80, WritingApp: 0x5741,
  Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, TrackUID: 0x73c5, TrackType: 0x83,
  FlagLacing: 0x9c, CodecID: 0x86, CodecPrivate: 0x63a2, CodecDelay: 0x56aa, SeekPreRoll: 0x56bb,
  DefaultDuration: 0x23e383, Video: 0xe0, PixelWidth: 0xb0, PixelHeight: 0xba,
  Audio: 0xe1, SamplingFrequency: 0xb5, Channels: 0x9f,
  Cluster: 0x1f43b675, Timestamp: 0xe7, SimpleBlock: 0xa3,
  Cues: 0x1c53bb6b, CuePoint: 0xbb, CueTime: 0xb3, CueTrackPositions: 0xb7, CueTrack: 0xf7, CueClusterPosition: 0xf1,
} as const;
export const WEBM_IDS = ID;

/** An element ID's own bytes: IDs carry their length marker, so they are written as they are. */
function idBytes(id: number): number[] {
  const out: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  return out;
}

/** An EBML variable-length size, in the fewest bytes (or exactly `width`). */
export function vint(n: number, width?: number): number[] {
  let w = 1;
  while (w < 8 && n >= 2 ** (7 * w) - 1) w++;
  if (width !== undefined) {
    if (width < w) throw new Error(`${n} does not fit a ${width}-byte size`);
    w = width;
  }
  const out: number[] = new Array(w).fill(0);
  let v = n;
  for (let i = w - 1; i >= 0; i--) { out[i] = v % 256; v = Math.floor(v / 256); }
  out[0] |= 0x80 >> (w - 1);
  return out;
}

/** An unsigned integer body in the fewest bytes (at least one), or exactly `width`. */
function uintBody(n: number, width?: number): number[] {
  const out: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) out.unshift(v % 256);
  if (out.length === 0) out.push(0);
  if (width !== undefined) {
    if (out.length > width) throw new Error(`${n} does not fit ${width} bytes`);
    while (out.length < width) out.unshift(0);
  }
  return out;
}

function el(id: number, body: ArrayLike<number>): Uint8Array {
  return new Bytes().bytes(idBytes(id)).bytes(vint(body.length)).bytes(body).done();
}
const uint = (id: number, n: number, width?: number) => el(id, uintBody(n, width));
const str = (id: number, s: string) => el(id, Array.from(s, (c) => c.charCodeAt(0)));
const f64 = (id: number, v: number) => el(id, new Bytes().f64(v).done());
const join = (...parts: Uint8Array[]) => { const b = new Bytes(); for (const p of parts) b.bytes(p); return b.done(); };

/**
 * An OpusHead for a stream whose encoder did not give one (RFC 7845 §5.1):
 * version 1, the channel count, a pre-skip of 312 samples (libopus's
 * lookahead at 48 kHz, which is what Chrome's encoder uses), the input rate,
 * no gain, mapping family 0.
 */
export function opusHead(channels: number, sampleRate: number, preSkip = 312): Uint8Array {
  const b = new Bytes().ascii('OpusHead').u8(1).u8(channels);
  // OpusHead is little-endian, unlike everything else in both containers.
  b.u8(preSkip & 0xff).u8(preSkip >> 8);
  b.u8(sampleRate & 0xff).u8((sampleRate >> 8) & 0xff).u8((sampleRate >> 16) & 0xff).u8((sampleRate >>> 24) & 0xff);
  return b.u8(0).u8(0).u8(0).done();
}

/** The pre-skip an OpusHead declares, in 48 kHz samples. */
export const opusPreSkip = (head: Uint8Array): number => head.length >= 12 ? head[10] | (head[11] << 8) : 312;

const CODEC_IDS: [RegExp, string][] = [[/^vp09/, 'V_VP9'], [/^vp8$/, 'V_VP8'], [/^av01/, 'V_AV1']];

/** The longest a cluster may run, so a block's 16-bit relative time never overflows. */
const MAX_CLUSTER_MS = 30_000;
/** With no keyframe for this long, start a cluster anyway (audio-only, or a long GOP). */
const SOFT_CLUSTER_MS = 5_000;

export class WebmMuxer {
  private pos = 0;
  private segmentData = 0;
  private durationAt = 0;
  private cuesSeekAt = 0;
  private cluster: { start: number; parts: Uint8Array[]; size: number } | null = null;
  private readonly cues: { time: number; position: number }[] = [];
  private readonly lastEnd = [0, 0];
  private readonly counts = [0, 0];
  private readonly order: Interleaver<MuxSample & { track: 0 | 1 }>;
  private finished = false;
  private readonly sink: ByteSink;
  private readonly audio: WebmAudioConfig | null;

  constructor(sink: ByteSink, video: WebmVideoConfig, audio: WebmAudioConfig | null) {
    this.sink = sink;
    this.audio = audio;
    const codecId = CODEC_IDS.find(([re]) => re.test(video.codec))?.[1];
    if (!codecId) throw new Error(`WebM cannot carry ${video.codec}`);
    this.order = new Interleaver((track, s) => this.block(track, s), audio ? 2 : 1);

    this.out(join(
      el(ID.EBML, join(
        uint(ID.EBMLVersion, 1), uint(ID.EBMLReadVersion, 1), uint(ID.EBMLMaxIDLength, 4),
        uint(ID.EBMLMaxSizeLength, 8), str(ID.DocType, 'webm'), uint(ID.DocTypeVersion, 4), uint(ID.DocTypeReadVersion, 2),
      )),
    ));
    // The segment's size is unknown until the end: 8 bytes, all ones, which
    // EBML reads as "unknown", and patched to the real size in `finish`.
    this.out(new Uint8Array([...idBytes(ID.Segment), 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));
    this.segmentData = this.pos;

    const tracks = [el(ID.TrackEntry, join(
      uint(ID.TrackNumber, 1), uint(ID.TrackUID, 1), uint(ID.TrackType, 1), uint(ID.FlagLacing, 0),
      str(ID.CodecID, codecId), uint(ID.DefaultDuration, Math.round(1e9 / video.fps)),
      el(ID.Video, join(uint(ID.PixelWidth, video.width), uint(ID.PixelHeight, video.height))),
    ))];
    if (audio) {
      const head = audio.description && audio.description.length >= 19 ? audio.description : opusHead(audio.channels, audio.sampleRate);
      tracks.push(el(ID.TrackEntry, join(
        uint(ID.TrackNumber, 2), uint(ID.TrackUID, 2), uint(ID.TrackType, 2), uint(ID.FlagLacing, 0),
        str(ID.CodecID, 'A_OPUS'), el(ID.CodecPrivate, head),
        // The decoder's delay and the pre-roll a seek needs, in nanoseconds,
        // as the WebM Opus mapping asks: the pre-skip, and 80 ms.
        uint(ID.CodecDelay, Math.round((opusPreSkip(head) / 48000) * 1e9)), uint(ID.SeekPreRoll, 80_000_000),
        el(ID.Audio, join(f64(ID.SamplingFrequency, audio.sampleRate), uint(ID.Channels, audio.channels))),
      )));
    }
    const info = el(ID.Info, join(uint(ID.TimestampScale, 1_000_000), str(ID.MuxingApp, 'ChromaGlass'), str(ID.WritingApp, 'ChromaGlass'), f64(ID.Duration, 0)));
    const tracksEl = el(ID.Tracks, join(...tracks));
    // Every position in the SeekHead is 8 bytes wide, so its size is known
    // before the positions are, and the Cues' can be patched in at the end.
    const seek = (id: number, at: number) => el(ID.Seek, join(el(ID.SeekID, idBytes(id)), uint(ID.SeekPosition, at, 8)));
    const seekLen = (n: number) => el(ID.SeekHead, join(...Array.from({ length: n }, () => seek(ID.Info, 0)))).length;
    const headLen = seekLen(3);
    const infoAt = headLen, tracksAt = headLen + info.length;
    const head = el(ID.SeekHead, join(seek(ID.Info, infoAt), seek(ID.Tracks, tracksAt), seek(ID.Cues, 0)));
    // The Cues' SeekPosition body is the last 8 bytes of the SeekHead.
    this.cuesSeekAt = this.pos + head.length - 8;
    this.out(head);
    // Duration's float body is the last 8 bytes of Info.
    this.durationAt = this.pos + info.length - 8;
    this.out(info);
    this.out(tracksEl);
  }

  private out(bytes: Uint8Array): void {
    this.sink.write(bytes);
    this.pos += bytes.length;
  }

  /** One encoded video frame. Timestamps in microseconds, from zero, in presentation order. */
  addVideo(s: MuxSample): void {
    if (this.finished) throw new Error('addVideo after finish');
    this.order.push(0, { ...s, track: 0 });
  }
  /** One encoded audio packet. */
  addAudio(s: MuxSample): void {
    if (this.finished) throw new Error('addAudio after finish');
    if (!this.audio) throw new Error('this file has no audio track');
    this.order.push(1, { ...s, track: 1 });
  }
  /** No more audio is coming: video waiting on it can be written. */
  endAudio(): void { if (this.audio) this.order.end(1); }

  private closeCluster(): void {
    const c = this.cluster;
    if (!c) return;
    this.cluster = null;
    const bytes = new Bytes().bytes(idBytes(ID.Cluster)).bytes(vint(c.size));
    for (const p of c.parts) bytes.bytes(p);
    this.out(bytes.done());
  }

  private block(track: 0 | 1, s: MuxSample): void {
    const ms = Math.round(s.timestampUs / 1000);
    const c = this.cluster;
    const startsCluster = !c
      || (track === 0 && s.key && ms > c.start)
      || ms - c.start > (track === 0 ? MAX_CLUSTER_MS : SOFT_CLUSTER_MS)
      || ms < c.start;
    if (startsCluster) {
      this.closeCluster();
      if (track === 0 && s.key) this.cues.push({ time: ms, position: this.pos - this.segmentData });
      const time = uint(ID.Timestamp, ms);
      this.cluster = { start: ms, parts: [time], size: time.length };
    }
    const cl = this.cluster!;
    const body = new Bytes().u8(0x80 | (track + 1)).i16(ms - cl.start).u8(s.key || track === 1 ? 0x80 : 0).bytes(s.data).done();
    const block = el(ID.SimpleBlock, body);
    cl.parts.push(block);
    cl.size += block.length;
    this.counts[track]++;
    this.lastEnd[track] = Math.max(this.lastEnd[track], s.timestampUs + s.durationUs);
  }

  /** Write what is waiting, the cues and the patched header; the sink then holds the whole file. */
  finish(): { videoFrames: number; audioPackets: number; durationMs: number; bytes: number } {
    if (this.finished) throw new Error('finish twice');
    this.finished = true;
    this.order.flush();
    this.closeCluster();
    const cuesAt = this.pos - this.segmentData;
    if (this.cues.length) {
      this.out(el(ID.Cues, join(...this.cues.map((c) => el(ID.CuePoint, join(
        uint(ID.CueTime, c.time),
        el(ID.CueTrackPositions, join(uint(ID.CueTrack, 1), uint(ID.CueClusterPosition, c.position))),
      ))))));
    }
    const durationMs = Math.max(this.lastEnd[0], this.lastEnd[1]) / 1000;
    this.sink.patch(this.durationAt, new Bytes().f64(durationMs).done());
    this.sink.patch(this.cuesSeekAt, new Uint8Array(uintBody(this.cues.length ? cuesAt : 0, 8)));
    this.sink.patch(this.segmentData - 8, new Uint8Array(vint(this.pos - this.segmentData, 8)));
    return { videoFrames: this.counts[0], audioPackets: this.counts[1], durationMs, bytes: this.pos };
  }
}
