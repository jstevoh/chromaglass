/**
 * Silence for the live stream's audio track (PLAN.md 37x-4f).
 *
 * What was reported (2026-11-09): the Mac app streamed to YouTube for
 * minutes at 10 to 11 Mbps with no error, YouTube answered the publish, and
 * Studio showed "No data" the whole time; ffmpeg's test pattern with the same
 * key showed at once. Compared message by message with ffmpeg's on a local
 * server, the app's wire and media were the same but for one thing: the
 * encoder took its sound from the show's sound source, and with the source
 * at None (how the app opens, the owner's rule) there was no track to read,
 * so the stream went out as video alone, its onMetaData naming no audio
 * codec. A local server takes that (ours and ffmpeg's both decoded it);
 * YouTube's ingest is known not to start a broadcast without audio, and the
 * reference that landed carried a tone. Every encoder YouTube is used with
 * sends audio whether there is sound or not: OBS always carries its mix,
 * silent or not, and the advice for an ffmpeg camera stream is to add a
 * silent source (`anullsrc`) for exactly this.
 *
 * So the stream always carries an audio track. With no source, it is
 * silence, encoded by the same AAC encoder on the stream's clock; and when
 * the source's track ends while the show is on air (a source switched off
 * mid-set), silence carries on from the last sample, so the track never has
 * a hole a server could read as the audio ending.
 *
 * Why made here and not with an AudioContext: a context made by the stream,
 * not by a click, can start suspended under an autoplay policy, and a
 * suspended context makes no samples, so a silent track from one could
 * itself be no track. Zeros counted from the clock cannot be withheld.
 */

/** The rate and channels of the silent track when there is no source to take them from: what AAC is most often given, and what YouTube asks for. */
export const SILENCE_RATE = 48000;
export const SILENCE_CHANNELS = 2;
/**
 * How often the silence is topped up, in ms. Each top-up writes the samples
 * from where the track ends up to now, so a late timer makes a longer chunk,
 * never a hole; this only sets how far behind real time the silent audio
 * runs, a fiftieth of a second, against the AAC encoder's own 21 ms frames.
 */
export const SILENCE_STEP_MS = 20;
/** The longest chunk one top-up makes, in seconds: a page stalled for minutes catches up in pieces, not one huge buffer. */
const MAX_CHUNK_SECONDS = 1;

/**
 * Silent audio from `fromUs` (where the track ends, on the AudioData clock)
 * up to `toUs`, or null when less than a millisecond is due. One chunk of at
 * most a second: call again until it returns null to catch up a long gap.
 */
export function silenceChunk(fromUs: number, toUs: number, sampleRate: number, channels: number): AudioData | null {
  const due = Math.floor(((toUs - fromUs) * sampleRate) / 1e6);
  if (due < sampleRate / 1000) return null;
  const n = Math.min(due, sampleRate * MAX_CHUNK_SECONDS);
  return new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round(fromUs), data: new Float32Array(n * channels) });
}
