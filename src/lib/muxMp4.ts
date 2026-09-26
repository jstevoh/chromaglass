/**
 * An MP4 writer: H.264 or VP9 video, AAC or Opus audio, streamed.
 *
 * H.264 and AAC in MP4 is the film a render should give back where the
 * browser can encode them, which is Chrome on the Mac (VideoToolbox does
 * H.264 in hardware): it opens in QuickTime, Final Cut and every phone, and
 * uploads anywhere without a conversion. VP9 and Opus are here too, not
 * because anyone wants a VP9 MP4 but because it is how this writer is tested
 * end to end in a cloud session, whose Chromium cannot encode H.264: the lab
 * check muxes its VP9 frames into both containers and plays both back.
 *
 * A plain ("progressive") MP4 rather than a fragmented one, because
 * QuickTime and editing software treat fragmented files as second class, and
 * a render is a file to keep and cut, not a stream. What is written:
 *
 *     ftyp               isom
 *     mdat               the samples, as they come; its size patched at
 *                        the end (a 64-bit size, so a long 4K render fits)
 *     moov               at the end, once every sample's size, place and
 *                        time is known: one trak per track, each with its
 *                        sample table (stts, ctts when frames are reordered,
 *                        stss, stsc, stsz, stco or co64)
 *
 * The moov at the end means a player must read the end of the file before
 * the start, which every player does for a local file; it is a "fast start"
 * web file that would want it at the front, and moving it there means
 * rewriting every chunk offset after the fact, which a streamed render
 * cannot do without holding the whole film. The samples themselves are
 * streamed to the sink as they arrive; only their sizes and times (a few
 * bytes each) are held until the end.
 *
 * As in the WebM writer, nothing depends on when it was written: creation
 * and modification times are 0 (1904-01-01, which is what "unknown" is in
 * this format), track IDs are 1 and 2.
 */
import { Bytes, Interleaver, type ByteSink, type MuxSample } from './muxShared.ts';
import { opusHead } from './muxWebm.ts';

export interface Mp4VideoConfig {
  /** WebCodecs codec string: `avc1.…` or `vp09.…`. */
  codec: string;
  width: number;
  height: number;
  fps: number;
}
export interface Mp4AudioConfig {
  codec: 'aac' | 'opus';
  sampleRate: number;
  channels: number;
  /** AAC: the AudioSpecificConfig; Opus: the OpusHead. Null to write one. */
  description?: Uint8Array | null;
  /** Average bitrate, for the esds (0 when not known). */
  bitrate?: number;
}

interface TrackState {
  timescale: number;
  sizes: number[];
  /** Presentation times, in the track's timescale, in decode (arrival) order. */
  pts: number[];
  durations: number[];
  keys: boolean[];
  /** Runs of samples written next to each other: file offset and how many. */
  chunks: { offset: number; count: number }[];
}

/** A box: size, type, body. */
function box(type: string, ...body: Uint8Array[]): Uint8Array {
  let n = 8;
  for (const b of body) n += b.length;
  const out = new Bytes().u32(n).ascii(type);
  for (const b of body) out.bytes(b);
  return out.done();
}
/** A full box: a box whose body starts with a version and 24 bits of flags. */
function full(type: string, version: number, flags: number, ...body: Uint8Array[]): Uint8Array {
  return box(type, new Bytes().u8(version).u24(flags).done(), ...body);
}
const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

/** The avc1/vp09 sample entry's fixed part (ISO 14496-12 VisualSampleEntry). */
function visualEntry(type: string, w: number, h: number, config: Uint8Array): Uint8Array {
  const b = new Bytes().zeros(6).u16(1).zeros(16).u16(w).u16(h)
    .u32(0x00480000).u32(0x00480000).u32(0).u16(1)
    .zeros(32) // compressorname: empty, so nothing about the writer is in it
    .u16(0x0018).i16(-1);
  return box(type, b.done(), config);
}

/** VP9's codec configuration box (the VP Codec ISO Media File Format Binding, vpcC version 1), from a `vp09.PP.LL.DD` string. */
function vpcC(codec: string): Uint8Array {
  const [, p = '0', l = '10', d = '8'] = codec.split('.');
  const profile = Number(p) || 0, level = Number(l) || 10, depth = Number(d) || 8;
  // Chroma 1 is 4:2:0 with chroma co-sited with luma, what WebCodecs VP9 gives;
  // colour 1/1/1 is BT.709 throughout, limited range.
  return full('vpcC', 1, 0, new Bytes().u8(profile).u8(level).u8((depth << 4) | (1 << 1) | 0).u8(1).u8(1).u8(1).u16(0).done());
}

const SAMPLE_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
/** An AAC-LC AudioSpecificConfig (ISO 14496-3 §1.6.2.1), for an encoder that gave none. */
export function aacConfig(sampleRate: number, channels: number): Uint8Array {
  const idx = SAMPLE_RATES.indexOf(sampleRate);
  if (idx < 0) throw new Error(`AAC has no index for ${sampleRate} Hz`);
  return new Uint8Array([(2 << 3) | (idx >> 1), ((idx & 1) << 7) | (channels << 3)]);
}

/** An MPEG-4 descriptor: tag, length (one byte: everything here is short), body. */
function descriptor(tag: number, body: Uint8Array): Uint8Array {
  if (body.length > 127) throw new Error('descriptor too long for a one-byte length');
  return new Bytes().u8(tag).u8(body.length).bytes(body).done();
}

function esds(asc: Uint8Array, bitrate: number): Uint8Array {
  const dsi = descriptor(0x05, asc);
  // objectTypeIndication 0x40 (MPEG-4 audio), streamType 5 (audio) << 2 | reserved 1.
  const dcd = descriptor(0x04, new Bytes().u8(0x40).u8(0x15).u24(0).u32(bitrate).u32(bitrate).bytes(dsi).done());
  const sl = descriptor(0x06, new Uint8Array([0x02]));
  const es = descriptor(0x03, new Bytes().u16(0).u8(0).bytes(dcd).bytes(sl).done());
  return full('esds', 0, 0, es);
}

/** Opus in ISOBMFF's dOps (the Opus-in-MP4 mapping, §4.3.2), from an OpusHead: the same fields, big-endian. */
function dOps(head: Uint8Array): Uint8Array {
  const le16 = (i: number) => head[i] | (head[i + 1] << 8);
  const le32 = (i: number) => (head[i] | (head[i + 1] << 8) | (head[i + 2] << 16) | (head[i + 3] << 24)) >>> 0;
  return box('dOps', new Bytes().u8(0).u8(head[9]).u16(le16(10)).u32(le32(12)).i16((le16(16) << 16) >> 16).u8(head[18] ?? 0).done());
}

function audioEntry(a: Mp4AudioConfig): Uint8Array {
  const fixed = new Bytes().zeros(6).u16(1).zeros(8).u16(a.channels).u16(16).u16(0).u16(0)
    .u32((a.sampleRate << 16) >>> 0).done();
  if (a.codec === 'aac') return box('mp4a', fixed, esds(a.description?.length ? a.description : aacConfig(a.sampleRate, a.channels), a.bitrate ?? 0));
  const head = a.description && a.description.length >= 19 ? a.description : opusHead(a.channels, a.sampleRate);
  return box('Opus', fixed, dOps(head));
}

/** Runs of equal values, as (count, value): stts and ctts are written this way. */
function runs(values: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const v of values) {
    const last = out[out.length - 1];
    if (last && last[1] === v) last[0]++;
    else out.push([1, v]);
  }
  return out;
}

export class Mp4Muxer {
  private pos = 0;
  private mdatAt = 0;
  private lastTrack = -1;
  private readonly tracks: TrackState[];
  private readonly order: Interleaver<MuxSample & { track: 0 | 1 }>;
  private videoDescription: Uint8Array | null = null;
  private finished = false;
  private readonly sink: ByteSink;
  private readonly video: Mp4VideoConfig;
  private readonly audio: Mp4AudioConfig | null;

  constructor(sink: ByteSink, video: Mp4VideoConfig, audio: Mp4AudioConfig | null) {
    this.sink = sink;
    this.video = video;
    this.audio = audio;
    if (!/^(avc1|vp09)/.test(video.codec)) throw new Error(`this MP4 writer cannot carry ${video.codec}`);
    // 90 kHz for video, which every usual frame rate divides (24, 25, 30, 50,
    // 60), so a frame's duration is a whole number of ticks and every frame
    // is exactly as long as the next. The audio's own rate for the audio.
    const vScale = 90000 % video.fps === 0 ? 90000 : Math.round(video.fps) * 1000;
    const state = (timescale: number): TrackState => ({ timescale, sizes: [], pts: [], durations: [], keys: [], chunks: [] });
    this.tracks = [state(vScale), ...(audio ? [state(audio.sampleRate)] : [])];
    this.order = new Interleaver((track, s) => this.sample(track, s), audio ? 2 : 1);

    const brands = ['isom', 'iso2', 'mp41', ...(video.codec.startsWith('avc1') ? ['avc1'] : [])];
    const ftyp = new Bytes().ascii('isom').u32(0x200);
    for (const b of brands) ftyp.ascii(b);
    this.out(box('ftyp', ftyp.done()));
    // mdat with a 64-bit size (size 1, then the real one), patched at the end.
    this.mdatAt = this.pos;
    this.out(new Bytes().u32(1).ascii('mdat').u64(0).done());
  }

  private out(bytes: Uint8Array): void {
    this.sink.write(bytes);
    this.pos += bytes.length;
  }

  /**
   * One encoded video frame. `description` is the encoder's decoder config
   * (the avcC for H.264), which arrives with the first chunk's metadata and
   * is only needed when the moov is written.
   */
  addVideo(s: MuxSample, description?: Uint8Array | null): void {
    if (this.finished) throw new Error('addVideo after finish');
    if (description && description.length && !this.videoDescription) this.videoDescription = description.slice();
    this.order.push(0, { ...s, track: 0 });
  }
  addAudio(s: MuxSample): void {
    if (this.finished) throw new Error('addAudio after finish');
    if (!this.audio) throw new Error('this file has no audio track');
    this.order.push(1, { ...s, track: 1 });
  }
  endAudio(): void { if (this.audio) this.order.end(1); }

  private sample(track: 0 | 1, s: MuxSample): void {
    const t = this.tracks[track];
    const tick = (us: number) => Math.round((us * t.timescale) / 1e6);
    t.sizes.push(s.data.length);
    t.pts.push(tick(s.timestampUs));
    t.durations.push(Math.max(0, tick(s.timestampUs + s.durationUs) - tick(s.timestampUs)));
    t.keys.push(track === 1 || s.key);
    if (this.lastTrack === track) t.chunks[t.chunks.length - 1].count++;
    else t.chunks.push({ offset: this.pos, count: 1 });
    this.lastTrack = track;
    this.out(s.data);
  }

  private trak(index: 0 | 1, movieScale: number): Uint8Array {
    const t = this.tracks[index];
    const isVideo = index === 0;
    const n = t.sizes.length;
    /*
      Decode times. Frames come out of an encoder in decode order; without
      B-frames that is presentation order and each frame's decode time is its
      own timestamp. With them (an H.264 encoder may reorder), the decode
      times are the presentation times sorted, each frame's composition
      offset is the difference, and a version-1 ctts carries the offsets
      signed. Durations follow the decode times.
    */
    const sorted = [...t.pts].sort((a, b) => a - b);
    const reordered = t.pts.some((p, i) => p !== sorted[i]);
    const dts = reordered ? sorted : t.pts;
    const durations = dts.map((d, i) => (i + 1 < n ? dts[i + 1] - d : t.durations[i]));
    const mediaDuration = n ? dts[n - 1] + durations[n - 1] - dts[0] : 0;
    const movieDuration = Math.round((mediaDuration * movieScale) / t.timescale);

    const stts = new Bytes();
    const sttsRuns = runs(durations);
    stts.u32(sttsRuns.length);
    for (const [count, delta] of sttsRuns) stts.u32(count).u32(delta);
    const tables: Uint8Array[] = [];
    const entry = isVideo
      ? visualEntry(this.video.codec.startsWith('avc1') ? 'avc1' : 'vp09', this.video.width, this.video.height,
        this.video.codec.startsWith('avc1') ? box('avcC', this.videoDescription ?? new Uint8Array(0)) : vpcC(this.video.codec))
      : audioEntry(this.audio!);
    tables.push(full('stsd', 0, 0, new Bytes().u32(1).done(), entry));
    tables.push(full('stts', 0, 0, stts.done()));
    if (reordered) {
      const ctts = new Bytes();
      const cttsRuns = runs(t.pts.map((p, i) => p - dts[i]));
      ctts.u32(cttsRuns.length);
      for (const [count, off] of cttsRuns) ctts.u32(count).i32(off);
      tables.push(full('ctts', 1, 0, ctts.done()));
    }
    if (isVideo && t.keys.some((k) => !k)) {
      const stss = new Bytes();
      const keys = t.keys.map((k, i) => (k ? i + 1 : 0)).filter(Boolean);
      stss.u32(keys.length);
      for (const k of keys) stss.u32(k);
      tables.push(full('stss', 0, 0, stss.done()));
    }
    const stsc = new Bytes();
    const stscRows: [number, number][] = [];
    t.chunks.forEach((c, i) => { if (!stscRows.length || stscRows[stscRows.length - 1][1] !== c.count) stscRows.push([i + 1, c.count]); });
    stsc.u32(stscRows.length);
    for (const [first, count] of stscRows) stsc.u32(first).u32(count).u32(1);
    tables.push(full('stsc', 0, 0, stsc.done()));
    const stsz = new Bytes().u32(0).u32(n);
    for (const s of t.sizes) stsz.u32(s);
    tables.push(full('stsz', 0, 0, stsz.done()));
    const wide = t.chunks.some((c) => c.offset > 0xffffffff);
    const stco = new Bytes().u32(t.chunks.length);
    for (const c of t.chunks) { if (wide) stco.u64(c.offset); else stco.u32(c.offset); }
    tables.push(full(wide ? 'co64' : 'stco', 0, 0, stco.done()));

    const tkhd = new Bytes().u32(0).u32(0).u32(index + 1).u32(0).u32(movieDuration)
      .zeros(8).u16(0).u16(isVideo ? 0 : 1).u16(isVideo ? 0 : 0x0100).u16(0);
    for (const m of MATRIX) tkhd.u32(m);
    tkhd.u32(isVideo ? this.video.width * 65536 : 0).u32(isVideo ? this.video.height * 65536 : 0);
    // 'und': the language packed as three 5-bit letters.
    const mdhd = new Bytes().u32(0).u32(0).u32(t.timescale).u32(mediaDuration).u16(0x55c4).u16(0);
    const hdlr = new Bytes().u32(0).ascii(isVideo ? 'vide' : 'soun').zeros(12).ascii(isVideo ? 'VideoHandler' : 'SoundHandler').u8(0);
    const mediaHeader = isVideo ? full('vmhd', 0, 1, new Bytes().zeros(8).done()) : full('smhd', 0, 0, new Bytes().zeros(4).done());
    const dinf = box('dinf', full('dref', 0, 0, new Bytes().u32(1).done(), full('url ', 0, 1)));
    return box('trak',
      full('tkhd', 0, 3, tkhd.done()),
      box('mdia', full('mdhd', 0, 0, mdhd.done()), full('hdlr', 0, 0, hdlr.done()),
        box('minf', mediaHeader, dinf, box('stbl', ...tables))));
  }

  /** Write what is waiting and the moov, and patch the mdat's size. */
  finish(): { videoFrames: number; audioPackets: number; durationMs: number; bytes: number } {
    if (this.finished) throw new Error('finish twice');
    this.finished = true;
    this.order.flush();
    if (this.video.codec.startsWith('avc1') && !this.videoDescription) throw new Error('no avcC: the H.264 encoder gave no decoder description');
    const mdatSize = this.pos - this.mdatAt;
    const movieScale = 1000;
    const traks = this.tracks.map((_, i) => this.trak(i as 0 | 1, movieScale));
    const ms = (t: TrackState) => {
      const n = t.pts.length;
      if (!n) return 0;
      const first = Math.min(...t.pts);
      let last = 0;
      for (let i = 0; i < n; i++) last = Math.max(last, t.pts[i] + t.durations[i]);
      return ((last - first) * 1000) / t.timescale;
    };
    const durationMs = Math.max(...this.tracks.map(ms));
    const mvhd = new Bytes().u32(0).u32(0).u32(movieScale).u32(Math.round(durationMs))
      .u32(0x00010000).u16(0x0100).zeros(10);
    for (const m of MATRIX) mvhd.u32(m);
    mvhd.zeros(24).u32(this.tracks.length + 1);
    this.out(box('moov', full('mvhd', 0, 0, mvhd.done()), ...traks));
    this.sink.patch(this.mdatAt + 8, new Bytes().u64(mdatSize).done());
    return {
      videoFrames: this.tracks[0].sizes.length,
      audioPackets: this.tracks[1]?.sizes.length ?? 0,
      durationMs,
      bytes: this.pos,
    };
  }
}
