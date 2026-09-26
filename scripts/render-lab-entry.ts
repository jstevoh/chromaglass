// Bundled into the lab page by `npm run render-lab` (scripts/render-lab.mjs):
// the lab's real solver and plate shader, plus the song render's encoders and
// muxers, so a render can be made end to end on a machine whose app cannot
// read back its own frames (software WebGPU, a cloud session).
import './lab-entry.ts';
import {
  RenderEncoder, memorySink, pickRenderFormat, renderSupport, avcCodec, vp9Codec, videoBitrate, hashVideoFrame, type RenderFormat,
} from '../src/lib/render.ts';
import { makeRng } from '../src/lib/rng.ts';
import { readWebm, readMp4 } from './media-read.mjs';

type LabApi = {
  create(N?: number, L?: number): Promise<{ N: number; L: number }>;
  dye(x: number, y: number, r: number, rgb: [number, number, number], d?: number): void;
  vel(x: number, y: number, r: number, v: [number, number, number, number]): void;
  flush(dt?: number): void;
  step(n: number): Promise<void>;
  render(size: number): Promise<number[]>;
};
const lab = (window as unknown as { lab: LabApi }).lab;

/** The formats a test asks for by name, independent of what `pickRenderFormat` prefers. */
function formatFor(kind: 'webm' | 'mp4-vp9' | 'mp4-avc', w: number, h: number, fps: number): RenderFormat {
  const vp9 = vp9Codec(w, h, fps), avc = avcCodec(w, h, fps);
  if (kind === 'webm') return { container: 'webm', videoCodec: vp9, audioCodec: 'opus', audioCodecString: 'opus', label: 'VP9 + Opus in WebM', ext: 'webm', mime: 'video/webm', videoBitrate: videoBitrate(vp9, w, h, fps), audioBitrate: 128_000 };
  if (kind === 'mp4-vp9') return { container: 'mp4', videoCodec: vp9, audioCodec: 'opus', audioCodecString: 'opus', label: 'VP9 + Opus in MP4', ext: 'mp4', mime: 'video/mp4', videoBitrate: videoBitrate(vp9, w, h, fps), audioBitrate: 128_000 };
  return { container: 'mp4', videoCodec: avc, audioCodec: 'aac', audioCodecString: 'mp4a.40.2', label: 'H.264 + AAC in MP4', ext: 'mp4', mime: 'video/mp4', videoBitrate: videoBitrate(avc, w, h, fps), audioBitrate: 192_000 };
}

/** A seeded little song: a kick on every beat at 120 bpm and a chord, stereo, 48 kHz. */
function song(seconds: number, seed: number): { sampleRate: number; channels: Float32Array[] } {
  const sr = 48000, n = Math.round(seconds * sr);
  const rng = makeRng(seed, 'render-lab.song');
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const pad = 0.05 * (Math.sin(2 * Math.PI * 330 * t) + Math.sin(2 * Math.PI * 415 * t));
    L[i] = pad + rng.signed() * 1e-4; R[i] = pad * 0.8 + rng.signed() * 1e-4;
  }
  for (let beat = 0; beat < seconds; beat += 0.5) {
    for (let k = 0; k < sr * 0.2; k++) {
      const i = Math.round(beat * sr) + k;
      if (i >= n) break;
      const t = k / sr;
      const v = 0.7 * Math.sin(2 * Math.PI * (50 + 60 * Math.exp(-t / 0.02)) * t) * Math.exp(-t / 0.1);
      L[i] += v; R[i] += v;
    }
  }
  return { sampleRate: sr, channels: [L, R] };
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const api = {
  support: () => renderSupport(),
  /** What this browser would render a film of this size as, and what it cannot. */
  async formats(w: number, h: number, fps: number) {
    const picked = await pickRenderFormat(w, h, fps, 48000, 2);
    const each: Record<string, boolean> = {};
    for (const kind of ['mp4-avc', 'webm'] as const) {
      const f = formatFor(kind, w, h, fps);
      const v = await VideoEncoder.isConfigSupported({ codec: f.videoCodec, width: w, height: h, framerate: fps, bitrate: f.videoBitrate }).catch(() => ({ supported: false }));
      const a = await AudioEncoder.isConfigSupported({ codec: f.audioCodecString, sampleRate: 48000, numberOfChannels: 2, bitrate: f.audioBitrate }).catch(() => ({ supported: false }));
      each[`${f.videoCodec} (${f.label.split(' in ')[0].split(' + ')[0]})`] = !!v.supported;
      each[`${f.audioCodecString} (${f.label.split(' in ')[0].split(' + ')[1]})`] = !!a.supported;
    }
    return { picked: picked?.label ?? null, each };
  },
  /**
   * Render `frames` frames of the lab's plate at `fps`, seeded, through the
   * real encoders and muxer, into memory. The plate is laid from the seed:
   * where the drops go, their colours and the stir.
   */
  async run(o: { seed: number; frames: number; fps: number; size: number; grid: number; kind: 'webm' | 'mp4-vp9' | 'mp4-avc' }) {
    await lab.create(o.grid);
    const rng = makeRng(o.seed, 'render-lab.plate');
    for (let k = 0; k < 7; k++) {
      lab.dye(rng.range(0.25, 0.75), rng.range(0.25, 0.75), rng.range(0.06, 0.14), [rng.range(0.2, 2), rng.range(0.2, 2), rng.range(0.2, 2)], 1);
    }
    lab.vel(0.5, 0.5, 0.3, [rng.signed() * 40, rng.signed() * 40, 0, 0]);
    lab.flush();
    const format = formatFor(o.kind, o.size, o.size, o.fps);
    const sink = memorySink('lab', format.mime, false);
    const enc = new RenderEncoder({
      format, width: o.size, height: o.size, fps: o.fps, sink, audio: song(o.frames / o.fps, o.seed), hashFrames: true, keySeconds: 1,
    });
    await enc.encodeAudio();
    // Solver steps a frame: the app's 60 steps a second, whatever the film's rate.
    const perFrame = Math.max(1, Math.round(60 / o.fps));
    for (let i = 0; i < o.frames; i++) {
      await lab.step(perFrame);
      const rgba = new Uint8Array(await lab.render(o.size));
      await enc.addFrame((timestamp, duration) => new VideoFrame(rgba, { format: 'RGBA', codedWidth: o.size, codedHeight: o.size, timestamp, duration }));
    }
    const summary = await enc.finish();
    const bytes = sink.bytes!();
    return { bytes: base64(bytes), frameHashes: enc.frameHashes, summary, audioDescription: enc.audioDescription ? Array.from(enc.audioDescription) : null, format: format.label };
  },
  /** Play a file in a <video> to its end: what a browser's own demuxer and decoder make of it. */
  async play(b64: string, mime: string) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    document.body.appendChild(video);
    const events: string[] = [];
    const result = await new Promise<{ duration: number; width: number; height: number; error: string | null }>((resolve) => {
      video.onloadedmetadata = () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight, error: null });
      video.onerror = () => resolve({ duration: NaN, width: 0, height: 0, error: video.error?.message || `code ${video.error?.code}` });
      video.src = url;
    });
    if (result.error) return { ...result, frames: 0, dropped: 0, presented: 0, events, canPlay: video.canPlayType(mime) };
    let presented = 0;
    const counting = typeof video.requestVideoFrameCallback === 'function';
    const onFrame = () => { presented++; video.requestVideoFrameCallback(onFrame); };
    if (counting) video.requestVideoFrameCallback(onFrame);
    await new Promise<void>((resolve) => {
      video.onended = () => { events.push('ended'); resolve(); };
      setTimeout(() => { events.push('timeout'); resolve(); }, 60_000);
      void video.play().catch((e) => { events.push(`play failed: ${e.message}`); resolve(); });
    });
    const q = video.getVideoPlaybackQuality();
    const out = { ...result, frames: q.totalVideoFrames, dropped: q.droppedVideoFrames, presented, events, canPlay: video.canPlayType(mime), ended: video.ended, currentTime: video.currentTime };
    video.remove();
    URL.revokeObjectURL(url);
    return out;
  },
  /**
   * Decode a file's video samples with WebCodecs and hash each decoded frame:
   * what "the same film" means if an encoder turns out not to be
   * byte-deterministic.
   */
  async decodeHashes(b64: string, kind: 'webm' | 'mp4') {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const parsed = kind === 'webm' ? readWebm(bytes) : readMp4(bytes);
    const track = parsed.tracks[0];
    let codec = 'vp09.00.10.08';
    let description: Uint8Array | undefined;
    if (kind === 'mp4' && track.codec === 'avc1') {
      // H.264 cannot be decoded without its parameter sets: the avcC box,
      // after the 78 bytes of the visual sample entry's own fields.
      const e = track.entry as { body: number; end: number };
      const dv = new DataView(bytes.buffer, bytes.byteOffset);
      for (let at = e.body + 78; at + 8 <= e.end;) {
        const size = dv.getUint32(at);
        if (String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === 'avcC') { description = bytes.slice(at + 8, at + size); break; }
        if (size < 8) break;
        at += size;
      }
      if (!description) throw new Error('an avc1 entry with no avcC');
      const hex = (n: number) => n.toString(16).padStart(2, '0');
      codec = `avc1.${hex(description[1])}${hex(description[2])}${hex(description[3])}`;
    }
    const hashes: string[] = [];
    const pending: Promise<void>[] = [];
    const dec = new VideoDecoder({
      output: (f) => { pending.push(hashVideoFrame(f).then((h) => { hashes.push(h); f.close(); })); },
      error: (e) => { throw e; },
    });
    dec.configure({ codec, ...(description ? { description } : {}) });
    for (const s of track.samples) dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: Math.round(s.timeUs), data: s.data }));
    await dec.flush();
    await Promise.all(pending);
    dec.close();
    return hashes;
  },
};
(window as unknown as { renderLab: typeof api }).renderLab = api;
