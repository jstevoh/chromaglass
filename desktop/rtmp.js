/**
 * RTMP, the wire: the handshake, chunks and AMF0 (PLAN.md 37x-4b).
 *
 * Every platform the owner can stream to (docs/live-show.md) takes the same
 * thing OBS sends: an RTMP connection, over TLS or not, carrying FLV audio and
 * video tags cut into chunks, with the commands between client and server
 * written in AMF0. This file is the part of that which both ends share: the
 * app's client (live.js) and the check's listener (scripts/rtmpListener.mjs)
 * read and write the same chunks, so a listener that understands the client
 * is one the client can also be measured against. Nothing here knows about
 * Electron or a socket: bytes in, messages out, and back.
 *
 * The protocol, in the few lines it takes (Adobe's RTMP specification, 2012):
 *
 *   handshake   C0 is one byte, the version 3. C1 is 1536 bytes: a time, four
 *               zero bytes, and random filling. The server answers S0, S1 (its
 *               own 1536) and S2 (C1 echoed, with the time it was read); the
 *               client ends with C2 (S1 echoed). Flash players had a second,
 *               signed handshake for DRM; an encoder never needs it, and
 *               YouTube, Twitch and the rest take the plain one from OBS.
 *   chunks      a message (one FLV tag, one command) is cut into chunks of at
 *               most the chunk size (128 bytes until Set Chunk Size says
 *               otherwise). Each chunk starts with a basic header (its format
 *               and chunk stream id), then a message header whose size the
 *               format picks: 0 carries everything (timestamp, length, type,
 *               message stream id), 1 and 2 reuse the last message's on the
 *               same chunk stream, 3 carries nothing. A timestamp past
 *               0xFFFFFF is written as 0xFFFFFF and the real one follows in
 *               four more bytes, on every chunk of that message.
 *   messages    type 1 Set Chunk Size, 3 Acknowledgement, 4 User Control (ping
 *               and pong, Stream Begin), 5 Window Acknowledgement Size, 6 Set
 *               Peer Bandwidth, 8 audio, 9 video, 18 data (onMetaData),
 *               20 an AMF0 command (connect, createStream, publish, _result,
 *               onStatus).
 *   AMF0        number (0x00, a big-endian double), boolean (0x01), string
 *               (0x02, a 16-bit length), object (0x03, name-value pairs ended
 *               by an empty name and 0x09), null (0x05), undefined (0x06),
 *               ECMA array (0x08, a count then the same pairs), strict array
 *               (0x0A), date (0x0B), long string (0x0C).
 *
 * The writer here puts a full header (format 0) on every message. Formats 1 to
 * 3 save eight bytes a message; at thirty video tags and fifty audio tags a
 * second that is under a kilobyte a second against a stream of megabits, and
 * a header that says everything is one no server can misread when a chunk
 * stream's timestamps go backwards for a moment (the audio clock and the
 * frame clock are not one clock). Continuation chunks of one message are
 * format 3, as they must be.
 */

// --- AMF0 ------------------------------------------------------------------

/** One AMF0 value, encoded. Objects become AMF0 objects; `EcmaArray` marks the array form OBS writes its metadata in. */
export class EcmaArray { constructor(entries) { this.entries = entries; } }

export function amfEncode(values) {
  const parts = [];
  for (const v of values) encodeOne(v, parts);
  return Buffer.concat(parts);
}

function encodeOne(v, parts) {
  if (v === null) { parts.push(Buffer.from([0x05])); return; }
  if (v === undefined) { parts.push(Buffer.from([0x06])); return; }
  if (typeof v === 'number') { const b = Buffer.alloc(9); b[0] = 0x00; b.writeDoubleBE(v, 1); parts.push(b); return; }
  if (typeof v === 'boolean') { parts.push(Buffer.from([0x01, v ? 1 : 0])); return; }
  if (typeof v === 'string') { parts.push(encodeString(v, true)); return; }
  if (v instanceof EcmaArray) {
    const keys = Object.keys(v.entries);
    const head = Buffer.alloc(5); head[0] = 0x08; head.writeUInt32BE(keys.length, 1);
    parts.push(head);
    for (const k of keys) { parts.push(encodeString(k, false)); encodeOne(v.entries[k], parts); }
    parts.push(Buffer.from([0x00, 0x00, 0x09]));
    return;
  }
  if (Array.isArray(v)) {
    const head = Buffer.alloc(5); head[0] = 0x0A; head.writeUInt32BE(v.length, 1);
    parts.push(head);
    for (const x of v) encodeOne(x, parts);
    return;
  }
  if (typeof v === 'object') {
    parts.push(Buffer.from([0x03]));
    for (const k of Object.keys(v)) { parts.push(encodeString(k, false)); encodeOne(v[k], parts); }
    parts.push(Buffer.from([0x00, 0x00, 0x09]));
    return;
  }
  throw new Error(`AMF0 cannot encode a ${typeof v}`);
}

function encodeString(s, marker) {
  const text = Buffer.from(s, 'utf8');
  if (text.length > 0xFFFF) {
    const head = Buffer.alloc(marker ? 5 : 4); let o = 0;
    if (marker) head[o++] = 0x0C;
    head.writeUInt32BE(text.length, o);
    return Buffer.concat([head, text]);
  }
  const head = Buffer.alloc(marker ? 3 : 2); let o = 0;
  if (marker) head[o++] = 0x02;
  head.writeUInt16BE(text.length, o);
  return Buffer.concat([head, text]);
}

/** Every AMF0 value in `buf`, in order. An ECMA array and an object both come back as a plain object. */
export function amfDecode(buf) {
  const out = [];
  let o = 0;
  const str = (long) => {
    const n = long ? buf.readUInt32BE(o) : buf.readUInt16BE(o); o += long ? 4 : 2;
    const s = buf.toString('utf8', o, o + n); o += n; return s;
  };
  const pairs = () => {
    const obj = {};
    for (;;) {
      if (o + 3 <= buf.length && buf[o] === 0 && buf[o + 1] === 0 && buf[o + 2] === 0x09) { o += 3; return obj; }
      const k = str(false);
      obj[k] = one();
    }
  };
  const one = () => {
    const t = buf[o++];
    switch (t) {
      case 0x00: { const v = buf.readDoubleBE(o); o += 8; return v; }
      case 0x01: return buf[o++] !== 0;
      case 0x02: return str(false);
      case 0x03: return pairs();
      case 0x05: return null;
      case 0x06: return undefined;
      case 0x08: o += 4; return pairs();
      case 0x0A: { const n = buf.readUInt32BE(o); o += 4; const a = []; for (let i = 0; i < n; i++) a.push(one()); return a; }
      case 0x0B: { const v = new Date(buf.readDoubleBE(o)); o += 10; return v; }
      case 0x0C: return str(true);
      case 0x10: { str(false); return pairs(); }
      default: throw new Error(`AMF0 type 0x${t.toString(16)} at ${o - 1}`);
    }
  };
  while (o < buf.length) out.push(one());
  return out;
}

// --- Message types -----------------------------------------------------------

export const MSG = { SET_CHUNK_SIZE: 1, ABORT: 2, ACK: 3, USER_CONTROL: 4, WINDOW_ACK_SIZE: 5, SET_PEER_BANDWIDTH: 6, AUDIO: 8, VIDEO: 9, DATA: 18, COMMAND: 20 };
/** The chunk streams this side writes on; any distinct ids above 2 would do, these are OBS's habit. */
export const CSID = { CONTROL: 2, COMMAND: 3, AUDIO: 4, VIDEO: 6, DATA: 5 };
export const DEFAULT_CHUNK_SIZE = 128;

// --- Writing chunks ----------------------------------------------------------

/**
 * One message as chunks: a format-0 header on the first, format 3 on the rest,
 * each with the extended timestamp when the timestamp needs it.
 */
export function chunkMessage({ csid, msid = 0, type, timestamp = 0, body }, chunkSize) {
  const ts = Math.max(0, Math.floor(timestamp)) % 0x100000000;
  const ext = ts >= 0xFFFFFF;
  const parts = [];
  const head = Buffer.alloc(ext ? 16 : 12);
  writeBasic(head, 0, 0, csid);
  const o = csid >= 64 ? (csid >= 320 ? 3 : 2) : 1;
  head.writeUIntBE(ext ? 0xFFFFFF : ts, o, 3);
  head.writeUIntBE(body.length, o + 3, 3);
  head[o + 6] = type;
  head.writeUInt32LE(msid, o + 7);
  if (ext) head.writeUInt32BE(ts, o + 11);
  parts.push(head.subarray(0, o + 11 + (ext ? 4 : 0)));
  let off = 0;
  let first = true;
  while (first || off < body.length) {
    const n = Math.min(chunkSize, body.length - off);
    if (!first) {
      const b = Buffer.alloc(3 + (ext ? 4 : 0));
      writeBasic(b, 0, 3, csid);
      if (ext) b.writeUInt32BE(ts, o);
      parts.push(b.subarray(0, o + (ext ? 4 : 0)));
    }
    parts.push(body.subarray(off, off + n));
    off += n;
    first = false;
  }
  return Buffer.concat(parts);
}

function writeBasic(buf, at, fmt, csid) {
  if (csid < 64) { buf[at] = (fmt << 6) | csid; return 1; }
  if (csid < 320) { buf[at] = fmt << 6; buf[at + 1] = csid - 64; return 2; }
  buf[at] = (fmt << 6) | 1; buf.writeUInt16LE(csid - 64, at + 1); return 3;
}

// --- Reading chunks ----------------------------------------------------------

/**
 * Bytes in, messages out. `push(buf)` returns the messages completed by those
 * bytes, each `{ csid, msid, type, timestamp, body }`, and applies the other
 * side's Set Chunk Size itself, since it changes how the very next chunk is
 * cut. `bytes` is everything read, for the Acknowledgement the other side
 * may ask for.
 */
export class ChunkReader {
  constructor() {
    this.chunkSize = DEFAULT_CHUNK_SIZE;
    this.buf = Buffer.alloc(0);
    this.streams = new Map();
    this.bytes = 0;
  }

  push(data) {
    this.bytes += data.length;
    this.buf = this.buf.length ? Buffer.concat([this.buf, data]) : data;
    const out = [];
    for (;;) {
      const r = this.readChunk();
      if (r === null) break;
      if (r !== undefined) out.push(r);
    }
    return out;
  }

  /** One chunk off the front: a finished message, undefined for a partial one, null for not enough bytes yet. */
  readChunk() {
    const b = this.buf;
    if (b.length < 1) return null;
    const fmt = b[0] >> 6;
    let csid = b[0] & 0x3f;
    let o = 1;
    if (csid === 0) { if (b.length < 2) return null; csid = b[1] + 64; o = 2; }
    else if (csid === 1) { if (b.length < 3) return null; csid = b.readUInt16LE(1) + 64; o = 3; }
    let s = this.streams.get(csid);
    if (!s) { s = { timestamp: 0, delta: 0, length: 0, type: 0, msid: 0, ext: false, body: null, got: 0 }; this.streams.set(csid, s); }
    const headLen = [11, 7, 3, 0][fmt];
    if (b.length < o + headLen) return null;
    let ts = 0;
    if (fmt <= 2) ts = b.readUIntBE(o, 3);
    if (fmt <= 1) { s.length = b.readUIntBE(o + 3, 3); s.type = b[o + 6]; }
    if (fmt === 0) s.msid = b.readUInt32LE(o + 7);
    o += headLen;
    // A format-3 chunk continuing a message whose first chunk had an extended
    // timestamp carries it too; one starting a new message with format 3
    // repeats the previous message's header, extended timestamp included.
    const ext = fmt <= 2 ? ts === 0xFFFFFF : s.ext;
    if (ext) { if (b.length < o + 4) return null; ts = b.readUInt32BE(o); o += 4; }
    if (s.body === null) {
      // The start of a message on this chunk stream.
      if (fmt === 0) { s.timestamp = ts; s.delta = 0; }
      else if (fmt <= 2) { s.delta = ts; s.timestamp = (s.timestamp + ts) % 0x100000000; }
      else s.timestamp = (s.timestamp + s.delta) % 0x100000000;
      if (fmt <= 2) s.ext = ext;
      s.body = Buffer.alloc(s.length);
      s.got = 0;
    }
    const n = Math.min(this.chunkSize, s.length - s.got);
    if (b.length < o + n) return null;
    b.copy(s.body, s.got, o, o + n);
    s.got += n;
    this.buf = b.subarray(o + n);
    if (s.got < s.length) return undefined;
    const msg = { csid, msid: s.msid, type: s.type, timestamp: s.timestamp, body: s.body };
    s.body = null;
    if (msg.type === MSG.SET_CHUNK_SIZE && msg.body.length >= 4) this.chunkSize = Math.max(1, msg.body.readUInt32BE(0) & 0x7fffffff);
    return msg;
  }
}

// --- The handshake -------------------------------------------------------------

export const HANDSHAKE_SIZE = 1536;

function handshakeBlock(time) {
  const b = Buffer.alloc(HANDSHAKE_SIZE);
  b.writeUInt32BE(time >>> 0, 0);
  for (let i = 8; i < HANDSHAKE_SIZE; i++) b[i] = (Math.random() * 256) | 0;
  return b;
}

/** The client's side: C0 and C1 out, S0 to S2 in, C2 out. Resolves with any bytes read past the handshake. */
export function clientHandshake(socket, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const c1 = handshakeBlock(0);
    let got = Buffer.alloc(0);
    const timer = setTimeout(() => { cleanup(); reject(new Error('the server did not finish the RTMP handshake')); }, timeoutMs);
    const onData = (d) => {
      got = Buffer.concat([got, d]);
      if (got.length < 1 + 2 * HANDSHAKE_SIZE) return;
      if (got[0] !== 3) { cleanup(); reject(new Error(`the server speaks RTMP version ${got[0]}, not 3`)); return; }
      const s1 = got.subarray(1, 1 + HANDSHAKE_SIZE);
      const c2 = Buffer.from(s1);
      c2.writeUInt32BE(Math.floor(Date.now() / 1000) >>> 0, 4);
      socket.write(c2);
      cleanup();
      resolve(got.subarray(1 + 2 * HANDSHAKE_SIZE));
    };
    const onErr = (e) => { cleanup(); reject(e); };
    const cleanup = () => { clearTimeout(timer); socket.off('data', onData); socket.off('error', onErr); socket.off('close', onErr); };
    socket.on('data', onData);
    socket.on('error', onErr);
    socket.on('close', () => onErr(new Error('the connection closed during the handshake')));
    socket.write(Buffer.concat([Buffer.from([3]), c1]));
  });
}

/** The server's side: C0 and C1 in, S0 to S2 out, C2 in. Resolves with any bytes read past the handshake. */
export function serverHandshake(socket, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let got = Buffer.alloc(0);
    let sent = false;
    const timer = setTimeout(() => { cleanup(); reject(new Error('the client did not finish the RTMP handshake')); }, timeoutMs);
    const onData = (d) => {
      got = Buffer.concat([got, d]);
      if (!sent && got.length >= 1 + HANDSHAKE_SIZE) {
        if (got[0] !== 3) { cleanup(); reject(new Error(`the client speaks RTMP version ${got[0]}, not 3`)); return; }
        const c1 = got.subarray(1, 1 + HANDSHAKE_SIZE);
        const s2 = Buffer.from(c1);
        s2.writeUInt32BE(0, 4);
        socket.write(Buffer.concat([Buffer.from([3]), handshakeBlock(0), s2]));
        sent = true;
      }
      if (sent && got.length >= 1 + 2 * HANDSHAKE_SIZE) { cleanup(); resolve(got.subarray(1 + 2 * HANDSHAKE_SIZE)); }
    };
    const onErr = (e) => { cleanup(); reject(e); };
    const cleanup = () => { clearTimeout(timer); socket.off('data', onData); socket.off('error', onErr); socket.off('close', onErr); };
    socket.on('data', onData);
    socket.on('error', onErr);
    socket.on('close', () => onErr(new Error('the connection closed during the handshake')));
  });
}

// --- Control messages ----------------------------------------------------------

export function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0, 0); return b; }

/** A User Control message's body: a 16-bit event and its 32-bit argument (a stream id, or a ping's time). */
export function userControl(event, arg) { const b = Buffer.alloc(6); b.writeUInt16BE(event, 0); b.writeUInt32BE(arg >>> 0, 2); return b; }
export const USER_CONTROL = { STREAM_BEGIN: 0, STREAM_EOF: 1, PING_REQUEST: 6, PING_RESPONSE: 7 };

// --- FLV tag bodies --------------------------------------------------------------

/**
 * What goes inside an RTMP audio or video message is exactly an FLV tag's
 * body (the FLV tag header is what the RTMP message header carries), so the
 * same bytes the client sends are what the listener writes to its .flv.
 *
 * Video, AVC: a frame type and codec byte (0x17 a keyframe, 0x27 any other
 * frame, codec id 7 = AVC), an AVC packet type (0 the sequence header, the
 * AVCDecoderConfigurationRecord that WebCodecs hands over as the encoder's
 * `description`; 1 one or more NAL units, each with a four-byte length,
 * which is the 'avc' format WebCodecs emits), a three-byte composition time
 * offset (0: no B-frames in a realtime encode), then the data.
 *
 * Audio, AAC: 0xAF (AAC, 44 kHz, 16-bit, stereo: AAC players read the real
 * rate from the AudioSpecificConfig and ignore those bits), then an AAC
 * packet type (0 the sequence header, the AudioSpecificConfig that is the
 * encoder's `description`; 1 a raw AAC frame, no ADTS header).
 *
 * Audio, Opus: not in the 2010 FLV specification; the Enhanced RTMP
 * specification (Veovera, 2023-) adds it: a first byte whose high nibble 9
 * says "extended header", low nibble the packet type (0 sequence start, 1
 * coded frames), then the codec's FourCC ('Opus'), then the body, the
 * sequence start's body being the OpusHead. It is here for the check's sake:
 * a Linux machine has no AAC encoder in Chromium, so the lab there streams
 * Opus to the listener and says so (scripts/live.mjs); the Mac app's stream
 * is AAC, which every platform in docs/live-show.md takes.
 */
export function avcTag(kind, data) {
  const head = Buffer.alloc(5);
  head[0] = kind === 'key' || kind === 'config' ? 0x17 : 0x27;
  head[1] = kind === 'config' ? 0 : kind === 'end' ? 2 : 1;
  return Buffer.concat([head, Buffer.from(data.buffer, data.byteOffset, data.byteLength)]);
}

export function aacTag(kind, data) {
  return Buffer.concat([Buffer.from([0xAF, kind === 'config' ? 0 : 1]), Buffer.from(data.buffer, data.byteOffset, data.byteLength)]);
}

export function opusTag(kind, data) {
  return Buffer.concat([Buffer.from([0x90 | (kind === 'config' ? 0 : 1)]), Buffer.from('Opus', 'ascii'), Buffer.from(data.buffer, data.byteOffset, data.byteLength)]);
}

/** What a recorded tag was: its codec and whether it is a header, for a listener or a reader of the .flv. */
export function describeTag(type, body) {
  if (type === MSG.VIDEO) {
    const codec = body[0] & 0x0f;
    if (codec !== 7) return { kind: 'video', codec: `flv-video-${codec}`, header: false, key: (body[0] >> 4) === 1 };
    return { kind: 'video', codec: 'avc', header: body[1] === 0, key: (body[0] >> 4) === 1, payload: body.subarray(5) };
  }
  if (type === MSG.AUDIO) {
    const fmt = body[0] >> 4;
    if (fmt === 10) return { kind: 'audio', codec: 'aac', header: body[1] === 0, payload: body.subarray(2) };
    if (fmt === 9) return { kind: 'audio', codec: body.toString('ascii', 1, 5).toLowerCase(), header: (body[0] & 0x0f) === 0, payload: body.subarray(5) };
    return { kind: 'audio', codec: `flv-audio-${fmt}`, header: false, payload: body.subarray(1) };
  }
  return { kind: type === MSG.DATA ? 'data' : `type-${type}`, header: false };
}

/** An FLV file: the header, then every tag with its previous-tag size, as a player or ffprobe reads it. */
export function flvFile(tags, { audio = true, video = true } = {}) {
  const head = Buffer.from([0x46, 0x4C, 0x56, 1, (audio ? 4 : 0) | (video ? 1 : 0), 0, 0, 0, 9, 0, 0, 0, 0]);
  const parts = [head];
  for (const t of tags) {
    const h = Buffer.alloc(11);
    h[0] = t.type;
    h.writeUIntBE(t.body.length, 1, 3);
    const ts = Math.floor(t.timestamp) >>> 0;
    h.writeUIntBE(ts & 0xFFFFFF, 4, 3);
    h[7] = (ts >>> 24) & 0xff;
    // stream id, three zero bytes
    parts.push(h, t.body, u32(11 + t.body.length));
  }
  return Buffer.concat(parts);
}
