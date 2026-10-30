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
 * once. The counts are in `state()` for the panel's health readout (37x-4d);
 * several sockets off one encode, each dropping its own, are 37x-4c.
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
const WINDOW_ACK = 2500000;
/** Past this many bytes waiting on the socket, video frames are dropped to the next keyframe. About two seconds of a 6 Mbps stream. */
export const BEHIND_LIMIT_BYTES = 1500000;
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
  constructor({ url, key, meta }) {
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
    this.counts = { bytesSent: 0, videoFrames: 0, videoDropped: 0, audioPackets: 0, acks: 0, pings: 0 };
    this.dropping = false;
    this.ackedAt = 0;
    this.peerWindow = 0;
    this.startedAt = 0;
    this.sequenced = { video: false, audio: false };
  }

  state() {
    return {
      phase: this.phase,
      error: this.error,
      status: this.status.slice(-5),
      bytesBehind: this.socket ? this.socket.writableLength : 0,
      behindLimit: BEHIND_LIMIT_BYTES,
      dropping: this.dropping,
      seconds: this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0,
      ...this.counts,
    };
  }

  /** Connect, handshake, publish. Resolves when the server says the stream has started. */
  async connect() {
    if (this.phase !== 'idle') throw new Error(`already ${this.phase}`);
    const { tls, host, port, app, tcUrl } = this.target;
    this.phase = 'connecting';
    const socket = await new Promise((resolve, reject) => {
      const s = tls ? tlsConnect({ host, port, servername: host }) : netConnect({ host, port });
      const timer = setTimeout(() => { s.destroy(); reject(new Error(`no answer from ${host}:${port} in ${CONNECT_TIMEOUT_MS / 1000} s`)); }, CONNECT_TIMEOUT_MS);
      s.once(tls ? 'secureConnect' : 'connect', () => { clearTimeout(timer); resolve(s); });
      s.once('error', (e) => { clearTimeout(timer); reject(e); });
    });
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
  send(csid, type, body, { msid = 0, timestamp = 0 } = {}) {
    if (!this.socket || this.socket.destroyed) return false;
    const bytes = chunkMessage({ csid, msid, type, timestamp, body }, CHUNK_SIZE);
    this.counts.bytesSent += bytes.length;
    return this.socket.write(bytes);
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
    const behind = this.socket.writableLength;
    if (behind > BEHIND_LIMIT_BYTES && !this.dropping) this.dropping = true;
    if (this.dropping) {
      if (!key || behind > BEHIND_LIMIT_BYTES) { this.counts.videoDropped++; return false; }
      this.dropping = false;
    }
    this.send(CSID.VIDEO, MSG.VIDEO, avcTag(key ? 'key' : 'delta', data), { msid: this.streamId, timestamp: timestampMs });
    this.counts.videoFrames++;
    return true;
  }

  /** One encoded audio packet (a raw AAC frame or an Opus packet) at `timestampMs`. */
  audio(timestampMs, data) {
    if (this.phase !== 'live' || !this.sequenced.audio) return false;
    const tag = this.audioCodec === 'aac' ? aacTag('frame', data) : opusTag('frame', data);
    this.send(CSID.AUDIO, MSG.AUDIO, tag, { msid: this.streamId, timestamp: timestampMs });
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
          if (name === '_error') p.reject(new Error(`${p.name}: ${withoutKey(info?.description ?? info?.code ?? 'refused', this.key)}`));
          else p.resolve(cmd);
        } else if (name === 'onStatus') {
          const code = info?.code ?? '';
          const line = `${code}${info?.description ? `: ${withoutKey(info.description, this.key)}` : ''}`;
          this.status.push(line);
          this.emit('status', line);
          if (code === 'NetStream.Publish.Start' && this.publishWait) { this.publishWait.resolve(); this.publishWait = null; }
          else if (info?.level === 'error') {
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

/**
 * The IPC the page uses (desktop/preload.cjs exposes it as
 * `__CHROMAGLASS_NATIVE__.live`): one stream at a time in this version.
 *
 *   live-start  { url, keyName } or, from the repo only, { url, key }
 *               (a packed app takes a key only from its keychain store,
 *               keys.js, so a page can never hold or read one), with the
 *               stream's `meta`; answers when the server says the stream has
 *               started, or with the error
 *   live-config { video: description } / { audio: { codec, description } }
 *   live-packet (send, not invoke: nothing to wait for) one encoded packet
 *   live-stop   ends the stream
 *   live-state  the client's state, for the console and the panel
 *   live-event  (to the page) 'live', 'status', 'failed', 'closed'
 */
export function wireLive(ipcMain, { keys, isPackaged, send }) {
  let client = null;
  const tell = (event, detail) => { try { send('chromaglass:live-event', { event, detail: detail ?? null, state: client?.state() ?? null }); } catch { /* window gone */ } };
  ipcMain.handle('chromaglass:live-start', async (_e, req) => {
    if (client && client.phase !== 'closed' && client.phase !== 'failed') return { ok: false, error: `a stream is already ${client.phase}` };
    const r = req && typeof req === 'object' ? req : {};
    let key = null;
    if (typeof r.keyName === 'string') key = await keys.read(r.keyName);
    else if (!isPackaged && typeof r.key === 'string') key = r.key;
    if (!key) return { ok: false, error: r.keyName ? `no key named "${r.keyName}" in the keychain` : 'no stream key' };
    try {
      client = new LiveClient({ url: String(r.url ?? ''), key, meta: r.meta ?? {} });
    } catch (e) {
      return { ok: false, error: e.message };
    }
    client.on('live', () => tell('live'));
    client.on('status', (line) => tell('status', line));
    client.on('failed', (err) => tell('failed', err));
    client.on('closed', () => tell('closed'));
    try {
      await client.connect();
      return { ok: true, state: client.state() };
    } catch (e) {
      return { ok: false, error: client.error ?? e.message, state: client.state() };
    }
  });
  ipcMain.handle('chromaglass:live-config', (_e, cfg) => {
    if (!client || !cfg) return false;
    if (cfg.video) client.videoConfig(new Uint8Array(cfg.video));
    if (cfg.audio) client.audioConfig(cfg.audio.codec === 'aac' ? 'aac' : 'opus', new Uint8Array(cfg.audio.description));
    return true;
  });
  ipcMain.on('chromaglass:live-packet', (_e, p) => {
    if (!client || !p) return;
    const data = p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data);
    if (p.kind === 'video') client.video(Number(p.timestampMs) || 0, Boolean(p.key), data);
    else if (p.kind === 'audio') client.audio(Number(p.timestampMs) || 0, data);
  });
  ipcMain.handle('chromaglass:live-stop', () => { client?.close(); return client?.state() ?? null; });
  ipcMain.handle('chromaglass:live-state', () => client?.state() ?? null);
  ipcMain.handle('chromaglass:live-key-set', (_e, name, key) => keys.set(String(name), String(key)));
  ipcMain.handle('chromaglass:live-key-list', () => keys.list());
  ipcMain.handle('chromaglass:live-key-remove', (_e, name) => keys.remove(String(name)));
  return { current: () => client };
}
