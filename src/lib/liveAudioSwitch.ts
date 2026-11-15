/**
 * A sound source changed under a running live stream (PLAN.md 37x-4f-2).
 *
 * What was reported (2026-11-09, after 37x-4f): the encoder took the show's
 * sound once, at Go. The app opens with its source at None (the owner's
 * rule), so a set that starts the stream first and the music second, the
 * natural order on a night, streamed silence for the whole set: the track
 * that 37x-4f added so YouTube would show the picture at all, and nothing in
 * it. The same held for any change of source on air (the music player to the
 * microphone, the band to the drone): the stream stayed on whatever it was
 * reading at Go, or on silence once that track ended.
 *
 * The plan item asked for "an audio bus the encoder reads", and the obvious
 * bus is an AudioContext: every source connected into one
 * MediaStreamAudioDestinationNode, the encoder reading its one track at one
 * rate. Not done, for the reason `liveSilence.ts` gives for the silence: a
 * context the stream makes, not a click, can start suspended under an
 * autoplay policy and then makes no samples at all, so the bus itself could
 * be the hole YouTube reads as no audio. It would also put a context's
 * render quantum and output latency between every source and the stream,
 * where today the source at Go is read straight off its own track and the
 * sync line of `npm run live` holds the click to its flash within a frame.
 *
 * So the encoder keeps one AAC encoder at the rate and channels it opened
 * with (an RTMP stream names its audio once, in its sequence header, and
 * YouTube does not take a second), and when the source changes it stops
 * reading the old track and reads the new one, with silence (liveSilence)
 * carrying the track until the new source's first chunk arrives, or for as
 * long as it never does. What a new track brings is fitted to the encoder:
 *
 * - its channels to the encoder's (the first two kept; mono duplicated;
 *   stereo into a mono encoder averaged, not one side dropped);
 * - its rate to the encoder's. The silent track opens at 48 kHz, and a
 *   source can run at 44.1 (headless Chromium's default rate, a song file's
 *   own, an interface set so): fed as they come, 44.1 kHz samples in a
 *   48 kHz encoder play 9% fast and a semitone and a half sharp, and run out
 *   of real time by 5 s a minute. Resampled here by Catmull-Rom cubic
 *   interpolation, carried across chunk edges so a chunk boundary makes no
 *   click. A cubic is not a polyphase filter: it lets a little of the
 *   images above 20 kHz through and softens the top octave by a decibel or
 *   two, which a stream's 160 kbit AAC throws away anyway. Most Macs run
 *   48 kHz and pass through untouched;
 * - its timestamps to the stream's clock. A track whose chunks are stamped
 *   on `performance.now()`'s clock (Chromium's, the 'track' case the
 *   encoder already tells at Go) is placed by its stamps; any other is
 *   placed with its first chunk ending as it was read. The first chunk is
 *   cut or padded to meet the track exactly where it stands, so the sound
 *   lands at the stream time it was made; after that the chunks run on
 *   end to end, and the track is only cut or padded again if the source's
 *   own clock wanders more than `SWITCH_SLACK_US` from the stream's (a
 *   sound card's crystal against the system clock, tens of parts per
 *   million: a correction an hour or so, of a few ms of sound).
 */

/** How far a switched source's stamps may wander from where the stream's track has got before the track is cut or padded to meet them, in µs. Under an AAC frame (21 ms), inside what a viewer hears as in sync. */
export const SWITCH_SLACK_US = 20000;

/**
 * How far behind now the silence floor under a switched source runs, in µs:
 * past how late any chunk of a working source is (a chunk or two, 10 to
 * 20 ms), and soon enough that a stalled source never leaves the server
 * without audio. The floor's silence follows on from the track's last
 * sample, so its stamps leave no hole; it only goes out this much later
 * than sound would.
 */
export const SWITCH_FLOOR_US = 150000;

/**
 * Where a switched source's chunks sit on the stream's audio clock: the
 * offset to add to a chunk's own timestamp. `streamUsAtRead` is the stream's
 * clock at `readAtMs` (the `performance.now()` the first chunk was read).
 * Stamped on `performance.now()`'s clock (within a second of the read, as
 * the encoder judges at Go): placed by the stamp. Otherwise: the chunk taken
 * to have ended as it was read.
 */
export function switchedOffsetUs(timestampUs: number, frames: number, sampleRate: number, readAtMs: number, streamUsAtRead: number): number {
  if (Math.abs(timestampUs / 1000 - readAtMs) < 1000) return streamUsAtRead - readAtMs * 1000;
  return streamUsAtRead - (frames / sampleRate) * 1e6 - timestampUs;
}

/** A source's sound fitted to the encoder's rate and channels, across chunks. Plain state; `fitChunk` advances it. */
export interface AudioFit {
  inRate: number; inChannels: number; outRate: number; outChannels: number;
  /** Input samples per output sample. */
  step: number;
  /** The next output sample's position in the working buffer (three samples of history, then the new chunk). */
  pos: number;
  /** The last three input samples of each output channel, for the cubic across the chunk edge. */
  hist: Float32Array[];
}

const HISTORY = 3;

export function makeAudioFit(inRate: number, inChannels: number, outRate: number, outChannels: number): AudioFit {
  return { inRate, inChannels, outRate, outChannels, step: inRate / outRate, pos: HISTORY, hist: Array.from({ length: outChannels }, () => new Float32Array(HISTORY)) };
}

/** Whether a chunk can go through this fit (a source can change its rate or channels mid-way: a new device). */
export const fitMatches = (f: AudioFit, ad: { sampleRate: number; numberOfChannels: number }) => f.inRate === ad.sampleRate && f.inChannels === ad.numberOfChannels;

/**
 * One chunk's sound at the encoder's rate and channels, as planes, skipping
 * its first `skip` frames. Equal rates pass through (channels still
 * fitted); otherwise each output sample is the cubic through the four input
 * samples around its position, and the last two input samples wait for the
 * next chunk, a latency of two samples (45 µs).
 */
export function fitChunk(f: AudioFit, ad: AudioData, skip = 0): Float32Array[] {
  const n = Math.max(0, ad.numberOfFrames - skip);
  const read = (plane: number): Float32Array => {
    const all = new Float32Array(ad.numberOfFrames);
    ad.copyTo(all, { planeIndex: plane, format: 'f32-planar' });
    return skip ? all.subarray(skip) : all;
  };
  const a = read(0);
  const b = f.inChannels > 1 ? read(1) : a;
  let mixed: Float32Array[];
  if (f.outChannels === 1) {
    if (b === a) mixed = [a];
    else { const m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = 0.5 * (a[i] + b[i]); mixed = [m]; }
  } else mixed = [a, b];
  if (f.inRate === f.outRate) return mixed;

  const len = n + HISTORY;
  const out: Float32Array[] = [];
  // Positions are shared by the channels: count once.
  let count = 0;
  for (let p = f.pos; Math.floor(p) <= len - 3; p += f.step) count++;
  for (let c = 0; c < f.outChannels; c++) {
    const h = f.hist[c], x = mixed[c];
    const at = (i: number) => (i < HISTORY ? h[i] : x[i - HISTORY]);
    const y = new Float32Array(count);
    let p = f.pos;
    for (let k = 0; k < count; k++, p += f.step) {
      const i = Math.floor(p), t = p - i;
      const xm1 = at(i - 1), x0 = at(i), x1 = at(i + 1), x2 = at(i + 2);
      y[k] = x0 + 0.5 * t * (x1 - xm1 + t * (2 * xm1 - 5 * x0 + 4 * x1 - x2 + t * (3 * (x0 - x1) + x2 - xm1)));
    }
    out.push(y);
    // The new history: the last three samples of the working buffer.
    const nh = new Float32Array(HISTORY);
    for (let i = 0; i < HISTORY; i++) nh[i] = at(len - HISTORY + i);
    f.hist[c] = nh;
  }
  f.pos += count * f.step - n;
  return out;
}
