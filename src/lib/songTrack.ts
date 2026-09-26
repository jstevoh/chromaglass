/**
 * A song, heard in advance: what the show's ear would read on every frame of
 * a render, computed from the file before the first frame is drawn.
 *
 * PLAN.md §6: "Bands and onsets pre-computed per frame from the song file, so
 * the reactivity is fixed to the timeline rather than to the frame rate, and
 * a render at 60 fps matches a render at 30." Live, the plate hears the song
 * through an AnalyserNode sampled whenever an animation frame happens to run,
 * so a kick lands on whichever frame was next, and two plays of one song hear
 * two slightly different songs. Here frame `i` hears exactly the analyser
 * window that ends at `i / fps` seconds into the song, every time.
 *
 * What a frame carries is the whole `AudioData` the live hook produces, not
 * only the named bands: the plate is still played mostly by the old fields
 * (sound drive and the sound mappings read bass, mid, treble and energy, the
 * beat clock's kick is bass over 70, the tempo pace reads energy), and a
 * render that fed only the new readings would drive half the show and leave
 * the rest silent. Each field is made the way the hook makes it, by the same
 * code: `AnalyserEmulator` stands in for the node (lib/audioFeatures.ts),
 * `SoundLevels` does the arithmetic (lib/soundLevels.ts), and the node's own
 * byte conversions are written out in `bytesFromDb` and `waveBytes`.
 *
 * One thing differs from live, on purpose, and it is about time: the
 * per-feature smoothing is scaled to the frame rate (see `smoothLevels`), so
 * the bass at 30 fps rises over the same stretch of the song as at 60, rather
 * than over twice as long. At 60 fps it is the live arithmetic exactly. The
 * room tracker, the ranges and the gate start fresh with each song, as they
 * do live when a new stream starts, so a render's first second learns the
 * song the way the show's first second learns the room.
 *
 * The pure part (`songAudioTrack`) runs in node for `npm run render`. The one
 * browser-only part, decoding the file, is `decodeSong`.
 */
import type { AudioData } from '../hooks/useAudioAnalyzer';
import { AnalyserEmulator, AudioFeatures, ANALYSER_RATE_HZ } from './audioFeatures.ts';
import { SoundLevels, bytesFromDb, smoothLevels, waveBytes, type LevelParams, type SmoothedLevels } from './soundLevels.ts';

/** The live defaults of the Sound panel's trims, for a render that is handed none. */
export const DEFAULT_LEVEL_PARAMS: LevelParams = { sensitivity: 0.4, bassBoost: 1, autoCalibrate: true };

/**
 * One `AudioData` per video frame of a song, frame `i` at `i / fps` seconds:
 * as many frames as it takes to cover the audio, `ceil(duration · fps)`,
 * which is the same count `analysePcm` gives.
 *
 * The `features` of each frame are exactly `analysePcm`'s reading for that
 * frame (`npm run render` compares them), because the named sources are read
 * from the same float spectrum the levels are.
 *
 * Deterministic: the same samples, rate, frame rate and trims give the same
 * frames to the bit, on every run.
 */
export function songAudioTrack(pcm: Float32Array, sampleRate: number, fps: number, params: LevelParams = DEFAULT_LEVEL_PARAMS): AudioData[] {
  const analyser = new AnalyserEmulator(sampleRate);
  const features = new AudioFeatures();
  const bins = analyser.fftSize / 2;
  const levels = new SoundLevels(sampleRate, bins);
  const freq = new Uint8Array(bins);
  const wave = new Uint8Array(bins);
  const frames = Math.ceil((pcm.length * fps) / sampleRate);
  /** Live frames each of ours stands for, for the smoothing (see `smoothLevels`). */
  const span = ANALYSER_RATE_HZ / fps;
  const out: AudioData[] = [];
  let prev: SmoothedLevels | null = null;
  for (let i = 0; i < frames; i++) {
    const end = Math.round((i * sampleRate) / fps);
    const db = analyser.frame(pcm, end, 1 / fps);
    const reading = features.update({ bins: db, scale: 'db', sampleRate, fftSize: analyser.fftSize }, i / fps);
    // The hook's dt: the time since its previous frame, 0 on the first, at
    // most a quarter of a second.
    const dt = i === 0 ? 0 : Math.min(0.25, 1 / fps);
    const win = levels.calibrate(db, dt, params.autoCalibrate);
    bytesFromDb(db, win.minDb, win.maxDb, freq);
    waveBytes(pcm, end, analyser.fftSize, wave);
    const raw = levels.levels(freq, wave, dt, params);
    const smooth = smoothLevels(prev, raw, span);
    prev = smooth;
    out.push({
      frequencyData: new Uint8Array(freq),
      timeDomainData: new Uint8Array(wave),
      ...smooth,
      calibration: raw.calibration ? { ...raw.calibration } : null,
      features: reading,
    });
  }
  return out;
}

/** A song decoded for a render: its channels for the film's sound, and one mono mix for the ear. */
export interface DecodedSong {
  sampleRate: number;
  /** Planar, one array per channel (one or two). */
  channels: Float32Array[];
  /** The analyser's mono: the channels averaged, as an AnalyserNode down-mixes. */
  mono: Float32Array;
  seconds: number;
}

/**
 * The analyser's down-mix, `0.5 · (L + R)` for stereo (the Web Audio spec's
 * speaker rule for mono), the channel itself for mono.
 */
export function monoMix(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  const k = 1 / channels.length;
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] * k;
  return out;
}

/**
 * The file, decoded by the browser at `sampleRate` (48 kHz by default: what
 * AAC and Opus both want, and what a Mac's audio runs at, so the render's ear
 * hears the song at the rate the show's does). Browser only.
 *
 * An OfflineAudioContext decodes rather than the live context, so a render
 * never touches the show's own audio graph, and the decode resamples to the
 * context's rate, which is how every song arrives at the one rate.
 */
export async function decodeSong(data: ArrayBuffer | Blob | string, sampleRate = 48000): Promise<DecodedSong> {
  const bytes = typeof data === 'string'
    ? await (await fetch(data)).arrayBuffer()
    : data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, sampleRate);
  const buf = await ctx.decodeAudioData(bytes);
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) channels.push(new Float32Array(buf.getChannelData(c)));
  return { sampleRate: buf.sampleRate, channels, mono: monoMix(channels), seconds: buf.length / buf.sampleRate };
}
