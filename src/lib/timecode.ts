/**
 * MIDI timecode: the show on somebody else's clock.
 *
 * A festival or a theatre runs to a timeline — the desk, the playback rig and
 * the lighting console all follow the same position, and a visual that runs on
 * its own timer drifts away from it over an evening. MTC is how that position
 * travels on a cable that is already plugged in for the faders.
 *
 * It arrives in eighths. A quarter-frame message is `0xF1` and one data byte
 * holding a piece index and four bits of value, and it takes eight of them to
 * spell out one timecode — which means the position is two frames old by the
 * time the last piece lands, because two frames have gone by while it was
 * being sent. Everything that reads MTC has to add those two frames back or
 * the show sits permanently eighty milliseconds behind the desk.
 *
 * A full-frame message (`F0 7F <dev> 01 01 hh mm ss ff F7`) carries the whole
 * position at once and is what a desk sends when it locates rather than rolls,
 * so a jump to the top of a cue is not spelled out one nibble at a time.
 *
 * Nothing here talks to the browser. It is fed bytes and asked for a position,
 * which is what makes it testable without a desk in the room.
 */

/** The four rates MTC can carry. 29.97 drop-frame counts frames, not seconds. */
export type TimecodeRate = 24 | 25 | 29.97 | 30;
const RATES: TimecodeRate[] = [24, 25, 29.97, 30];

export interface TimecodePosition {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  rate: TimecodeRate;
  /** Position in seconds from 00:00:00:00, which is what a show actually wants. */
  at: number;
}

/**
 * How long a timecode is believed after the last quarter-frame.
 *
 * A rolling desk sends four of these a frame — at least 96 a second — so a
 * tenth of a second of silence means it stopped, and the show should go back
 * to its own clock rather than freezing on the last position it heard.
 */
const STALE_MS = 120;

/** Format for a status line: 01:23:45:12. */
export const formatTimecode = (p: TimecodePosition | null): string =>
  p === null ? '--:--:--:--'
    : [p.hours, p.minutes, p.seconds, p.frames].map(n => String(n).padStart(2, '0')).join(':');

export class TimecodeReader {
  /** The eight nibbles, as they arrive. */
  private piece = new Array<number>(8).fill(0);
  /** Which pieces have been seen since the last complete frame: all eight, or trust nothing. */
  private have = 0;
  private lastAt = -1e9;
  private position: TimecodePosition | null = null;

  /**
   * One quarter-frame byte (the data byte after 0xF1).
   *
   * Pieces arrive 0 to 7 when the desk rolls forward and 7 to 0 when it rolls
   * back. Only the forward case completes a position here: a desk being
   * shuttled backwards through a timeline is not a thing a light show should
   * try to follow frame by frame, and it still hears the full-frame message
   * when the operator lands somewhere.
   */
  quarter(data: number, nowMs: number): TimecodePosition | null {
    const index = (data >> 4) & 0x07;
    const value = data & 0x0f;
    this.piece[index] = value;
    // A run that does not start at 0 is one we joined mid-frame; wait for the
    // next 0 rather than assembling a position out of half a stale frame.
    this.have = index === 0 ? 1 : this.have | (1 << index);
    this.lastAt = nowMs;
    if (index !== 7 || this.have !== 0xff) return null;
    this.have = 0;

    const frames = this.piece[0] | (this.piece[1] << 4);
    const seconds = this.piece[2] | (this.piece[3] << 4);
    const minutes = this.piece[4] | (this.piece[5] << 4);
    const hours = this.piece[6] | ((this.piece[7] & 0x01) << 4);
    const rate = RATES[(this.piece[7] >> 1) & 0x03];
    // The two frames that went by while those eight messages were being sent.
    this.position = build(hours, minutes, seconds, frames + 2, rate);
    return this.position;
  }

  /** A full-frame SysEx: the whole position at once, which is what a locate sends. */
  full(data: Uint8Array | number[], nowMs: number): TimecodePosition | null {
    if (data.length < 10) return null;
    if (data[0] !== 0xf0 || data[1] !== 0x7f || data[3] !== 0x01 || data[4] !== 0x01) return null;
    const rate = RATES[(data[5] >> 5) & 0x03];
    const position = build(data[5] & 0x1f, data[6] & 0x3f, data[7] & 0x3f, data[8] & 0x1f, rate);
    this.lastAt = nowMs;
    this.have = 0;
    this.position = position;
    return position;
  }

  /** The last position heard, or null when the desk has gone quiet. */
  read(nowMs: number): TimecodePosition | null {
    return nowMs - this.lastAt > STALE_MS ? null : this.position;
  }

  /** Is a desk sending at all? Separate from `read` so a status line can say "locked" between frames. */
  running(nowMs: number): boolean {
    return nowMs - this.lastAt <= STALE_MS;
  }

  reset(): void {
    this.have = 0;
    this.lastAt = -1e9;
    this.position = null;
  }
}

function build(hours: number, minutes: number, seconds: number, frames: number, rate: TimecodeRate): TimecodePosition {
  // Frames can arrive past the rate once the two-frame offset is added, which
  // carries into seconds the way a clock does.
  const per = Math.round(rate);
  let f = frames, s = seconds, m = minutes, h = hours;
  if (f >= per) { s += Math.floor(f / per); f %= per; }
  if (s >= 60) { m += Math.floor(s / 60); s %= 60; }
  if (m >= 60) { h += Math.floor(m / 60); m %= 60; }
  return { hours: h % 24, minutes: m, seconds: s, frames: f, rate, at: (h % 24) * 3600 + m * 60 + s + f / rate };
}
