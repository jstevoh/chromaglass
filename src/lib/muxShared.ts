/**
 * What the two muxers (lib/muxWebm.ts, lib/muxMp4.ts) share: a byte builder,
 * the order samples are written in, and where the bytes go.
 *
 * Written here rather than taken from npm because the render's gate is that
 * the same song gives the same *bytes* twice (PLAN.md §6), and a container
 * writer is exactly where a library likes to put a creation date, a random
 * track UID or a version string. Everything a container needs for a
 * render — two tracks, whole frames, timestamps we made ourselves — is a few
 * hundred lines, and every byte of it is ours to account for.
 *
 * Pure: no DOM, no clock, no randomness. `npm run render` writes files with
 * both muxers in node and parses them back with independent readers.
 */

/** One encoded frame or audio packet, as WebCodecs hands it over, in microseconds. */
export interface MuxSample {
  data: Uint8Array;
  timestampUs: number;
  durationUs: number;
  key: boolean;
}

/**
 * Where a muxer's bytes go. `write` appends; `patch` overwrites bytes that
 * were written earlier (a header's size or duration, known only at the end)
 * and never extends the file. Both may return a promise; the muxer does not
 * wait for them, the caller awaits `settle()` on the sink when it must.
 */
export interface ByteSink {
  write(bytes: Uint8Array): void;
  patch(position: number, bytes: Uint8Array): void;
}

/** A growable big-endian byte builder. */
export class Bytes {
  private buf = new Uint8Array(256);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private room(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  u8(v: number): this { this.room(1); this.buf[this.length++] = v & 0xff; return this; }
  u16(v: number): this { this.room(2); this.view.setUint16(this.length, v); this.length += 2; return this; }
  i16(v: number): this { this.room(2); this.view.setInt16(this.length, v); this.length += 2; return this; }
  u24(v: number): this { return this.u8(v >>> 16).u16(v & 0xffff); }
  u32(v: number): this { this.room(4); this.view.setUint32(this.length, v >>> 0); this.length += 4; return this; }
  i32(v: number): this { this.room(4); this.view.setInt32(this.length, v | 0); this.length += 4; return this; }
  /** An unsigned 64-bit integer from a JavaScript number (exact below 2^53). */
  u64(v: number): this {
    if (!(v >= 0) || v > Number.MAX_SAFE_INTEGER) throw new Error(`u64 out of range: ${v}`);
    return this.u32(Math.floor(v / 4294967296)).u32(v % 4294967296);
  }
  f32(v: number): this { this.room(4); this.view.setFloat32(this.length, v); this.length += 4; return this; }
  f64(v: number): this { this.room(8); this.view.setFloat64(this.length, v); this.length += 8; return this; }
  bytes(b: ArrayLike<number>): this { this.room(b.length); this.buf.set(b, this.length); this.length += b.length; return this; }
  ascii(s: string): this { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); return this; }
  zeros(n: number): this { this.room(n); this.buf.fill(0, this.length, this.length + n); this.length += n; return this; }
  /** A copy of what has been built. */
  done(): Uint8Array { return this.buf.slice(0, this.length); }
}

/**
 * Samples from two encoders, written in timestamp order.
 *
 * A player reads a file front to back, so a file whose audio is all at the
 * end (or all at the start) makes it seek back and forth for every second of
 * film, and some players simply stall. So video and audio wait here and go
 * out in order of time: a sample is released once the other track has
 * something at or after it, or once that track has said it is finished.
 * Ties go to video, which is what both containers' conventions expect at a
 * cluster or chunk start. The order depends only on the timestamps, never on
 * which encoder happened to answer first, so the same samples always make
 * the same file.
 */
export class Interleaver<T extends { timestampUs: number }> {
  private readonly queues: T[][] = [[], []];
  private readonly ended = [false, false];
  private readonly emit: (track: 0 | 1, sample: T) => void;
  // No parameter properties anywhere here: `npm run render` loads these
  // files with node's type stripping, which does not support them.
  constructor(emit: (track: 0 | 1, sample: T) => void, tracks: 1 | 2) {
    this.emit = emit;
    if (tracks === 1) this.ended[1] = true;
  }
  push(track: 0 | 1, sample: T): void {
    if (this.ended[track]) throw new Error(`a sample on track ${track} after it ended`);
    this.queues[track].push(sample);
    this.drain();
  }
  end(track: 0 | 1): void {
    this.ended[track] = true;
    this.drain();
  }
  private drain(): void {
    const [v, a] = this.queues;
    for (;;) {
      const vh = v[0], ah = a[0];
      if (vh && ah) {
        if (vh.timestampUs <= ah.timestampUs) this.emit(0, v.shift()!);
        else this.emit(1, a.shift()!);
      } else if (vh && this.ended[1]) this.emit(0, v.shift()!);
      else if (ah && this.ended[0]) this.emit(1, a.shift()!);
      else return;
    }
  }
  /** Whatever is still waiting, in order (for `finish`). */
  flush(): void { this.ended[0] = this.ended[1] = true; this.drain(); }
}

/**
 * A sink that keeps the file in memory, for a browser with no File System
 * Access (and for the checks). Chunks are kept as written; `patch` writes
 * into the ones it lands on, and `blob()` / `bytes()` join them at the end.
 */
export class MemorySink implements ByteSink {
  readonly chunks: Uint8Array[] = [];
  private readonly starts: number[] = [];
  size = 0;
  write(bytes: Uint8Array): void {
    this.starts.push(this.size);
    this.chunks.push(bytes);
    this.size += bytes.length;
  }
  patch(position: number, bytes: Uint8Array): void {
    if (position < 0 || position + bytes.length > this.size) throw new Error(`patch outside the file: ${position}+${bytes.length} of ${this.size}`);
    // The chunk holding `position`: a binary search, since a long render has thousands.
    let lo = 0, hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= position) lo = mid; else hi = mid - 1;
    }
    let done = 0;
    for (let c = lo; done < bytes.length; c++) {
      const chunk = this.chunks[c];
      const at = position + done - this.starts[c];
      const n = Math.min(chunk.length - at, bytes.length - done);
      chunk.set(bytes.subarray(done, done + n), at);
      done += n;
    }
  }
  /** Let go of everything written: the Blob made from it keeps its own copy. */
  clear(): void {
    this.chunks.length = 0;
    this.starts.length = 0;
    this.size = 0;
  }
  bytes(): Uint8Array {
    const out = new Uint8Array(this.size);
    for (let c = 0; c < this.chunks.length; c++) out.set(this.chunks[c], this.starts[c]);
    return out;
  }
}
