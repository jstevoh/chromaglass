/**
 * The live stream's destination: an RTMP or RTMPS client (PLAN.md 37x-4b).
 *
 * The owner (2026-10-29): "open my mac app ... configure the live show. I can
 * then stream it on all of the popular streaming platforms". Every one of
 * those platforms takes what OBS sends (docs/live-show.md): an RTMPS
 * connection carrying H.264 video and AAC audio as FLV tags. The page encodes
 * the plate and the sound with WebCodecs (src/lib/liveStream.ts, the Record
 * feature's encoders) and hands each packet to this process over IPC; this
 * file speaks RTMP to the server and writes the packets down the socket. No
 * ffmpeg, no second process, no pipe of raw frames (the three designs weighed
 * are in docs/live-show.md).
 *
 * What a connection does, in order:
 *
 *   1. a TLS (rtmps, port 443) or plain (rtmp, 1935) socket to the server
 *   2. the handshake (rtmp.js)
 *   3. Set Chunk Size 4096 and Window Acknowledgement Size, then `connect`
 *      with the app name from the URL (`live2` in YouTube's
 *      rtmps://a.rtmps.youtube.com/live2) and wait for its `_result`
 *   4. `releaseStream` and `FCPublish` (what FMLE and OBS send; a server that
 *      does not know them ignores them), `createStream` and its `_result`,
 *      which carries the message stream id every tag is sent on
 *   5. `publish` with the stream key as the stream name, `live` as the type,
 *      and wait for `onStatus` NetStream.Publish.Start: the stream is live
 *   6. `@setDataFrame onMetaData` (size, rates, codecs), the AVC and AAC
 *      sequence headers from the encoders' descriptions, then every packet
 *      as it arrives, each on its own chunk stream with its own timestamp
 *
 * Meanwhile the server's messages are read: its Set Chunk Size changes how
 * its chunks are cut, its Window Acknowledgement Size asks for an
 * Acknowledgement every so many bytes (a server that asks and never hears
 * one stops reading after a while), a ping is answered with a pong, and an
 * `onStatus` with an error level (a bad key: NetStream.Publish.BadName) ends
 * the stream with that message, which the page shows.
 *
 * Falling behind. A socket that cannot take the bytes as fast as the encoder
 * makes them (the upload link is slower than the bitrate, or has dipped)
 * grows its write buffer; left alone the stream arrives seconds late and the
 * process holds minutes of video. So, as OBS does, the client watches how
 * far behind the socket is and, past a bound, drops video frames until the
 * next keyframe (a frame between keyframes cannot be decoded without the ones
 * before it, so once one is dropped the rest to the next keyframe must be);
 * audio is never dropped, since it is small and a hole in it is heard at
 * once.
 *
 * How far behind is measured in seconds of the stream, not bytes (37x-4c):
 * the media timestamp of the newest packet written against that of the
 * newest packet the server has, so one bound means the same for a 6 Mbps
 * landscape stream and a 3 Mbps vertical one. "The server has" is the
 * server's own word where it gives it: RTMP's Acknowledgement, the bytes it
 * has received, which the client asks for every `WINDOW_ACK` bytes. The
 * socket's write buffer alone does not say it: a reader throttled to 100 KB/s
 * on loopback (the cloud's Linux, 2026-10-30) left the kernel's own buffers
 * holding 4.7 MB before node's buffer held a byte, six seconds of a 6 Mbps
 * stream that `writableLength` never saw. A server that never acknowledges is
 * judged on what node has handed the kernel, the most that can be known.
 * The readout (`state()`: kbps out, seconds behind, frames dropped) is the
 * panel's health line (37x-4d); several sockets off one encode, each
 * dropping its own and reconnecting on its own, are `liveSession.js`.
 *
 * A connection made after the stream began (a reconnect, or a destination
 * that could not be reached at the start) joins at a keyframe: until one
 * comes, its video and audio wait, and its timestamps start from that
 * keyframe's, as OBS starts each connection's clock at its first packet. A
 * server meeting a new publish whose first frame says minute forty may wait
 * forty minutes to show it.
 *
 * The stream key never appears in a log, an error or the state: a server's
 * `onStatus` description can quote the stream name, so it is cut from the
 * message before it is kept.
 *
 * This file has no Electron in it, so the lab's check (scripts/live.mjs)
 * drives it in plain node against the check's own listener
 * (scripts/rtmpListener.mjs); `wireLive` at the end is what main.js hands
 * ipcMain to.
 */
import { connect as tlsConnect } from 'node:tls';
import { connect as netConnect } from 'node:net';
import { EventEmitter } from 'node:events';
import { amfDecode, amfEncode, EcmaArray, ChunkReader, chunkMessage, clientHandshake, CSID, MSG, u32, userControl, USER_CONTROL, avcTag, aacTag, opusTag } from './rtmp.js';

export const CHUNK_SIZE = 4096;
/**
 * How often the server is asked to acknowledge what it has received. OBS and
 * FFmpeg ask every 2.5 MB, which on a 6 Mbps stream is one word every three
 * seconds and on a throttled link one a minute: too coarse to say how far
 * behind the stream is. 256 KB is a third of a second at 6 Mbps; each
 * acknowledgement is a 16-byte message.
 */
export const WINDOW_ACK = 262144;
/** Past this many seconds of the stream not yet at the server, video frames are dropped to the next keyframe, which is sent once it is back under half. */
export const BEHIND_LIMIT_SECONDS = 2;
/** A server's acknowledgement older than this is taken as one that has stopped acknowledging, and the socket's own word is used instead. */
const ACK_STALE_MS = 5000;
const CONNECT_TIMEOUT_MS = 15000;

/** `rtmps://host[:port]/app[/more]` into what the connection needs. The key is never in the URL. */
export function parseRtmpUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error('not an rtmp:// or rtmps:// address'); }
  if (u.protocol !== 'rtmp:' && u.protocol !== 'rtmps:') throw new Error('not an rtmp:// or rtmps:// address');
  const tls = u.protocol === 'rtmps:';
  const port = u.port ? Number(u.port) : tls ? 443 : 1935;
  const app = u.pathname.replace(/^\/+|\/+$/g, '');
  if (!app) throw new Error('the address has no application after the host (YouTube\'s is /live2)');
  return { tls, host: u.hostname, port, app, tcUrl: `${u.protocol}//${u.hostname}:${port}/${app}` };
}

/** A server's message with the stream key, if it quoted it, cut out. */
function withoutKey(text, key) {
  if (!key || !text) return text;
  return String(text).split(key).join('<key>');
}

export class LiveClient extends EventEmitter {
  /**
   * `url` the server (rtmps://a.rtmps.youtube.com/live2), `key` the stream
   * key, `meta` what onMetaData says: width, height, fps, videoBitrate (bps),
   * audio { codec 'aac'|'opus', sampleRate, channels, bitrate }.
   */
  constructor({ url, key, meta, join = false }) {
    super();
    this.target = parseRtmpUrl(url);
    this.key = String(key);
    this.meta = meta;
    this.socket = null;
    this.reader = new ChunkReader();
    this.streamId = 0;
    this.txn = 0;
    this.pending = new Map();
    this.phase = 'idle';
    this.error = null;
    this.status = [];
    this.counts = { bytesSent: 0, videoFrames: 0, videoDropped: 0, dropRuns: 0, audioPackets: 0, acks: 0, pings: 0, serverAcks: 0, joinSkipped: 0 };
    this.dropping = false;
    /** Set when the server itself said no (a bad key, a refused app): not a connection to make again. */
    this.refused = false;
    /** The stream-clock time this connection's timestamps start from: 0 for the stream's first, the joining keyframe's for a later one (null until it comes). */
    this.base = join ? null : 0;
    /**
     * What has been written and what has arrived: `queue` holds, for each
     * media packet written and not yet known to have arrived, the byte count
     * at its end and its timestamp. `flushed` is the bytes node has handed the
     * kernel (each write's callback, in order); `serverAck` what the server
     * last said it has (its count wraps at 2^32, unwrapped here).
     */
    this.delivery = { queue: [], head: 0, flushed: 0, serverAck: 0, serverAckAt: 0, lastAckRaw: 0, wraps: 0, writtenTs: 0, deliveredTs: 0, rate: [] };
    this.ackedAt = 0;
    this.peerWindow = 0;
    this.startedAt = 0;
    this.sequenced = { video: false, audio: false };
  }

  state() {
    const behind = this.behind();
    return {
      phase: this.phase,
      error: this.error,
      status: this.status.slice(-5),
      bytesBehind: behind.bytes,
      secondsBehind: behind.seconds,
      behindLimit: BEHIND_LIMIT_SECONDS,
      measuredAt: behind.by,
      kbps: this.kbps(),
      dropping: this.dropping,
      seconds: this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0,
      ...this.counts,
    };
  }

  /**
   * How far behind the stream is: the bytes written that the server is not
   * known to have, and the seconds of the stream they hold. `by` says whose
   * word it is: 'server' (its acknowledgements) or 'socket' (what node has
   * handed the kernel, when the server is not acknowledging).
   */
  behind() {
    const d = this.delivery;
    const fresh = d.serverAckAt > 0 && Date.now() - d.serverAckAt < ACK_STALE_MS;
    const arrived = fresh ? Math.min(d.serverAck, d.flushed) : d.flushed;
    while (d.head < d.queue.length && d.queue[d.head][0] <= arrived) d.deliveredTs = d.queue[d.head++][1];
    if (d.head > 4096) { d.queue = d.queue.slice(d.head); d.head = 0; }
    const now = Date.now();
    const last = d.rate[d.rate.length - 1];
    if (!last || now - last[0] >= 250) { d.rate.push([now, arrived]); while (d.rate.length > 1 && now - d.rate[0][0] > 3000) d.rate.shift(); }
    const waiting = d.head < d.queue.length;
    return { bytes: Math.max(0, this.counts.bytesSent - arrived), seconds: waiting ? Math.max(0, (d.writtenTs - d.deliveredTs) / 1000) : 0, by: fresh ? 'server' : 'socket' };
  }

  /** Kilobits a second arriving, over the last two to three seconds (`behind` keeps the samples). */
  kbps() {
    const r = this.delivery.rate;
    if (r.length < 2) return 0;
    const [t0, b0] = r[0], [t1, b1] = r[r.length - 1];
    return t1 > t0 ? Math.round(((b1 - b0) * 8) / (t1 - t0)) : 0;
  }

  /** Connect, handshake, publish. Resolves when the server says the stream has started. */
  async connect() {
    if (this.phase !== 'idle') throw new Error(`already ${this.phase}`);
    const { tls, host, port, app, tcUrl } = this.target;
    this.phase = 'connecting';
    let socket;
    try {
      socket = await new Promise((resolve, reject) => {
        const s = tls ? tlsConnect({ host, port, servername: host }) : netConnect({ host, port });
        const timer = setTimeout(() => { s.destroy(); reject(new Error(`no answer from ${host}:${port} in ${CONNECT_TIMEOUT_MS / 1000} s`)); }, CONNECT_TIMEOUT_MS);
        s.once(tls ? 'secureConnect' : 'connect', () => { clearTimeout(timer); resolve(s); });
        s.once('error', (e) => { clearTimeout(timer); reject(e); });
      });
    } catch (e) {
      // A server that cannot be reached fails like one that hung up, so whoever is listening for 'failed' (a session's reconnect) hears it.
      this.fail(e);
      throw new Error(this.error ?? String(e));
    }
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on('error', (e) => this.fail(e));
    socket.on('close', () => { if (this.phase !== 'closed' && this.phase !== 'failed') this.fail(new Error('the server closed the connection')); });
    try {
      this.phase = 'handshake';
      const rest = await clientHandshake(socket);
      socket.on('data', (d) => this.onData(d));
      if (rest.length) this.onData(rest);
      this.phase = 'connect';
      this.send(CSID.CONTROL, MSG.SET_CHUNK_SIZE, u32(CHUNK_SIZE));
      this.send(CSID.CONTROL, MSG.WINDOW_ACK_SIZE, u32(WINDOW_ACK));
      await this.command('connect', [{ app, type: 'nonprivate', flashVer: 'FMLE/3.0 (compatible; ChromaGlass)', tcUrl }], { wait: true });
      this.command('releaseStream', [null, this.key]);
      this.command('FCPublish', [null, this.key]);
      const created = await this.command('createStream', [null], { wait: true });
      this.streamId = typeof created[3] === 'number' ? created[3] : 1;
      this.phase = 'publish';
      const started = new Promise((resolve, reject) => { this.publishWait = { resolve, reject }; });
      this.command('publish', [null, this.key, 'live'], { msid: this.streamId, csid: CSID.DATA });
      await started;
      this.phase = 'live';
      this.startedAt = Date.now();
      this.sendMetadata();
      this.emit('live');
    } catch (e) {
      this.fail(e);
      throw new Error(this.error ?? String(e));
    }
  }

  /** The chunk size the writer uses: ours, which we told the server. */
  send(csid, type, body, { msid = 0, timestamp = 0, media = false } = {}) {
    if (!this.socket || this.socket.destroyed) return false;
    const bytes = chunkMessage({ csid, msid, type, timestamp, body }, CHUNK_SIZE);
    this.counts.bytesSent += bytes.length;
    const d = this.delivery;
    if (media) {
      // Kept on the stream's clock, before the connection's base is taken off, so a join's seconds compare with the rest.
      const at = timestamp + (this.base ?? 0);
      d.queue.push([this.counts.bytesSent, at]);
      if (at > d.writtenTs) d.writtenTs = at;
    }
    const n = bytes.length;
    return this.socket.write(bytes, () => { d.flushed += n; });
  }

  command(name, args, { wait = false, msid = 0, csid = CSID.COMMAND } = {}) {
    const txn = wait ? ++this.txn : 0;
    const body = amfEncode([name, txn, ...args]);
    this.send(csid, MSG.COMMAND, body, { msid });
    if (!wait) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(txn); reject(new Error(`the server did not answer ${name}`)); }, CONNECT_TIMEOUT_MS);
      this.pending.set(txn, { name, resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    });
  }

  sendMetadata() {
    const m = this.meta || {};
    const a = m.audio || null;
    const data = {
      width: m.width, height: m.height, framerate: m.fps, videocodecid: 7, videodatarate: Math.round((m.videoBitrate || 0) / 1000),
      encoder: 'ChromaGlass',
      ...(a ? { audiocodecid: a.codec === 'aac' ? 10 : 'Opus', audiosamplerate: a.sampleRate, audiosamplesize: 16, stereo: a.channels === 2, audiodatarate: Math.round((a.bitrate || 0) / 1000) } : {}),
    };
    this.send(CSID.DATA, MSG.DATA, amfEncode(['@setDataFrame', 'onMetaData', new EcmaArray(data)]), { msid: this.streamId });
  }

  /** The AVC sequence header: the encoder's description, which comes with its first keyframe. */
  videoConfig(description) {
    if (this.phase !== 'live') return;
    this.send(CSID.VIDEO, MSG.VIDEO, avcTag('config', description), { msid: this.streamId, timestamp: 0 });
    this.sequenced.video = true;
  }

  /** The audio sequence header: the AudioSpecificConfig (AAC) or OpusHead (Opus) the encoder gave with its first packet. */
  audioConfig(codec, description) {
    if (this.phase !== 'live') return;
    const tag = codec === 'aac' ? aacTag('config', description) : opusTag('config', description);
    this.send(CSID.AUDIO, MSG.AUDIO, tag, { msid: this.streamId, timestamp: 0 });
    this.audioCodec = codec;
    this.sequenced.audio = true;
  }

  /** One encoded frame, AVCC NAL units, at `timestampMs` on the stream's clock. Returns false when it was dropped. */
  video(timestampMs, key, data) {
    if (this.phase !== 'live') return false;
    // A frame before the sequence header has nothing to describe it; it is dropped, and counted.
    if (!this.sequenced.video) { this.counts.videoDropped++; return false; }
    // A connection that joined late starts at a keyframe, its clock from there.
    if (this.base === null) {
      if (!key) { this.counts.joinSkipped++; return false; }
      this.base = timestampMs;
    }
    const { seconds } = this.behind();
    if (seconds > BEHIND_LIMIT_SECONDS && !this.dropping) { this.dropping = true; this.counts.dropRuns++; }
    if (this.dropping) {
      // Back under half the bound, not the bound itself: a keyframe sent the moment it dips under would push it straight back over.
      if (!key || seconds > BEHIND_LIMIT_SECONDS / 2) { this.counts.videoDropped++; return false; }
      this.dropping = false;
    }
    this.send(CSID.VIDEO, MSG.VIDEO, avcTag(key ? 'key' : 'delta', data), { msid: this.streamId, timestamp: timestampMs - this.base, media: true });
    this.counts.videoFrames++;
    return true;
  }

  /** One encoded audio packet (a raw AAC frame or an Opus packet) at `timestampMs`. Never dropped for being behind; before a join's keyframe it is not yet this connection's. */
  audio(timestampMs, data) {
    if (this.phase !== 'live' || !this.sequenced.audio) return false;
    if (this.base === null || timestampMs < this.base) { this.counts.joinSkipped++; return false; }
    const tag = this.audioCodec === 'aac' ? aacTag('frame', data) : opusTag('frame', data);
    this.send(CSID.AUDIO, MSG.AUDIO, tag, { msid: this.streamId, timestamp: timestampMs - this.base, media: true });
    this.counts.audioPackets++;
    return true;
  }

  onData(d) {
    let msgs;
    try { msgs = this.reader.push(d); } catch (e) { this.fail(e); return; }
    for (const m of msgs) this.onMessage(m);
    if (this.peerWindow > 0 && this.reader.bytes - this.ackedAt >= this.peerWindow) {
      this.ackedAt = this.reader.bytes;
      this.send(CSID.CONTROL, MSG.ACK, u32(this.reader.bytes));
      this.counts.acks++;
    }
  }

  onMessage(m) {
    switch (m.type) {
      case MSG.WINDOW_ACK_SIZE:
        if (m.body.length >= 4) this.peerWindow = m.body.readUInt32BE(0);
        break;
      case MSG.ACK:
        // The server's count of the bytes it has received, which wraps at 2^32.
        if (m.body.length >= 4) {
          const d = this.delivery;
          const raw = m.body.readUInt32BE(0);
          if (raw < d.lastAckRaw) d.wraps++;
          d.lastAckRaw = raw;
          d.serverAck = d.wraps * 2 ** 32 + raw;
          d.serverAckAt = Date.now();
          this.counts.serverAcks++;
        }
        break;
      case MSG.SET_PEER_BANDWIDTH:
        if (m.body.length >= 4) { this.peerWindow = m.body.readUInt32BE(0); this.send(CSID.CONTROL, MSG.WINDOW_ACK_SIZE, u32(this.peerWindow)); }
        break;
      case MSG.USER_CONTROL:
        if (m.body.length >= 6 && m.body.readUInt16BE(0) === USER_CONTROL.PING_REQUEST) {
          this.send(CSID.CONTROL, MSG.USER_CONTROL, userControl(USER_CONTROL.PING_RESPONSE, m.body.readUInt32BE(2)));
          this.counts.pings++;
        }
        break;
      case MSG.COMMAND: {
        let cmd;
        try { cmd = amfDecode(m.body); } catch { return; }
        const [name, txn, , info] = cmd;
        if (name === '_result' || name === '_error') {
          const p = this.pending.get(txn);
          if (!p) return;
          this.pending.delete(txn);
          if (name === '_error') this.refused = true;
          if (name === '_error') p.reject(new Error(`${p.name}: ${withoutKey(info?.description ?? info?.code ?? 'refused', this.key)}`));
          else p.resolve(cmd);
        } else if (name === 'onStatus') {
          const code = info?.code ?? '';
          const line = `${code}${info?.description ? `: ${withoutKey(info.description, this.key)}` : ''}`;
          this.status.push(line);
          this.emit('status', line);
          if (code === 'NetStream.Publish.Start' && this.publishWait) { this.publishWait.resolve(); this.publishWait = null; }
          else if (info?.level === 'error') {
            this.refused = true;
            const err = new Error(line);
            if (this.publishWait) { this.publishWait.reject(err); this.publishWait = null; }
            this.fail(err);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  fail(e) {
    if (this.phase === 'closed' || this.phase === 'failed') return;
    this.phase = 'failed';
    this.error = withoutKey(e?.message ?? String(e), this.key);
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
    if (this.publishWait) { this.publishWait.reject(e); this.publishWait = null; }
    try { this.socket?.destroy(); } catch { /* gone */ }
    this.emit('failed', this.error);
  }

  /** End the stream: FCUnpublish and deleteStream, then the socket closed once they are written. */
  close() {
    if (this.phase === 'closed' || this.phase === 'failed') return;
    const live = this.phase === 'live';
    this.phase = 'closed';
    if (live && this.socket && !this.socket.destroyed) {
      this.command('FCUnpublish', [null, this.key]);
      this.command('deleteStream', [null, this.streamId]);
      this.socket.end();
      setTimeout(() => this.socket?.destroy(), 2000).unref();
    } else {
      this.socket?.destroy();
    }
    this.emit('closed');
  }
}
