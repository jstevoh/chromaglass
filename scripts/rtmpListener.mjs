#!/usr/bin/env node
/**
 * A local RTMP server that records what it is sent (PLAN.md 37x-4b).
 *
 *   import { startRtmpListener } from './rtmpListener.mjs';
 *   const l = await startRtmpListener();           // l.port, l.url ('rtmp://127.0.0.1:<port>/live')
 *   l.on('publish', (s) => ...);                   // s.key, s.app; s.tags fills as the stream arrives
 *   node scripts/rtmpListener.mjs [--port 1935] [--out stream.flv]   // by hand: record one stream
 *
 * The app's live stream (desktop/live.js) is judged against this, not against
 * YouTube: a check that needed a channel and a key would run only on the
 * owner's machine, and would say nothing about what arrived. This listener
 * is the other end of the same wire (desktop/rtmp.js): it takes the
 * handshake, answers `connect`, `createStream` and `publish` as a server
 * does, and keeps every audio, video and data message with the timestamp it
 * came with. `toFlv()` is those tags as a .flv file, which ffprobe or a
 * player reads, and `scripts/live.mjs` decodes them back in the browser to
 * measure the seconds of audio, the frame rate and the sync.
 *
 * It behaves like the servers the app will meet, so the client's answers are
 * exercised: it sends Window Acknowledgement Size and Set Peer Bandwidth (so
 * the client has to send Acknowledgements, and `acks` counts them), sets its
 * own chunk size, and pings once a stream is up (`pongs` counts the answers).
 * A `publish` with a stream name the listener was told to refuse
 * (`refuse: 'badkey'`) is answered with NetStream.Publish.BadName, which is
 * what a platform says to a wrong key, so the client's failure path is
 * measurable too.
 *
 * For the drop test (37x-4c, `npm run livedrop`) it acts as a slow or broken
 * ingest: it acknowledges the bytes it has read, every Window Acknowledgement
 * Size the client asked for, as real servers do (`acknowledge: false` for
 * one that does not, so the client's fallback is measured too);
 * `conn.throttle(bytesPerSecond)` reads the socket no faster than that (null
 * lifts it), which is a slow upload as the client sees it: the bytes back up
 * behind it in the kernel and then in the client; `conn.kill()` drops the
 * connection, as a server restart or a lost Wi-Fi would. `refusals` counts
 * the publishes it refused, so a client that kept asking with a bad key shows.
 */
import { createServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { amfDecode, amfEncode, ChunkReader, chunkMessage, serverHandshake, CSID, MSG, u32, userControl, USER_CONTROL, describeTag, flvFile } from '../desktop/rtmp.js';

const SERVER_CHUNK = 4096;

export async function startRtmpListener({ port = 0, refuse = null, pingAfterMs = 1500, ackWindow = 256, acknowledge = true } = {}) {
  const em = new EventEmitter();
  const streams = [];
  const sockets = new Set();
  let refusals = 0;
  const server = createServer((socket) => {
    const conn = { socket, reader: new ChunkReader(), app: null, key: null, tags: [], meta: null, pongs: 0, acks: 0, acksSent: 0, ackSize: 0, ackedAt: 0, closed: false, started: 0, rate: null };
    sockets.add(socket);
    socket.setNoDelay(true);
    // The throttle: a budget of bytes each tenth of a second; past it the socket
    // is paused until the budget is back above zero. The overdraft carries
    // over: node reads up to 64 KB at a time, so a budget reset each tick
    // would let a 15 KB-a-tick throttle read 640 KB a second (the first run).

    let budget = Infinity;
    let pacer = null;
    conn.throttle = (bytesPerSecond) => {
      conn.rate = bytesPerSecond ?? null;
      if (pacer) { clearInterval(pacer); pacer = null; }
      if (conn.rate === null) { budget = Infinity; socket.resume(); return; }
      budget = conn.rate / 10;
      pacer = setInterval(() => { budget = Math.min(conn.rate / 10, budget + conn.rate / 10); if (budget > 0 && !socket.destroyed) socket.resume(); }, 100);
      pacer.unref();
    };
    conn.kill = () => socket.destroy();
    socket.on('close', () => { if (pacer) clearInterval(pacer); sockets.delete(socket); });
    const send = (csid, type, body, msid = 0, timestamp = 0) => { if (!socket.destroyed) socket.write(chunkMessage({ csid, msid, type, timestamp, body }, SERVER_CHUNK)); };
    const result = (txn, ...args) => send(CSID.COMMAND, MSG.COMMAND, amfEncode(['_result', txn, ...args]));
    const status = (msid, level, code, description) => send(CSID.DATA, MSG.COMMAND, amfEncode(['onStatus', 0, null, { level, code, description }]), msid);
    socket.on('error', () => {});
    socket.on('close', () => { conn.closed = true; if (conn.key) em.emit('end', conn); });
    serverHandshake(socket).then((rest) => {
      // A small window, so the client has to acknowledge within the first
      // few hundred bytes this side sends (a real server's is megabytes, and
      // sends so little that a client which never acknowledged would pass).
      send(CSID.CONTROL, MSG.WINDOW_ACK_SIZE, u32(ackWindow));
      send(CSID.CONTROL, MSG.SET_PEER_BANDWIDTH, Buffer.concat([u32(ackWindow), Buffer.from([2])]));
      send(CSID.CONTROL, MSG.SET_CHUNK_SIZE, u32(SERVER_CHUNK));
      const onData = (d) => {
        budget -= d.length;
        if (budget <= 0) socket.pause();
        let msgs;
        try { msgs = conn.reader.push(d); } catch (e) { em.emit('error', e); socket.destroy(); return; }
        for (const m of msgs) {
          if (m.type === MSG.AUDIO || m.type === MSG.VIDEO) {
            conn.tags.push({ type: m.type, timestamp: m.timestamp, body: m.body, at: Date.now() });
          } else if (m.type === MSG.DATA) {
            conn.tags.push({ type: m.type, timestamp: m.timestamp, body: m.body, at: Date.now() });
            try { const v = amfDecode(m.body); if (v[0] === '@setDataFrame' && v[1] === 'onMetaData') conn.meta = v[2]; } catch { /* not ours to judge */ }
          } else if (m.type === MSG.ACK) {
            conn.acks++;
          } else if (m.type === MSG.WINDOW_ACK_SIZE) {
            if (m.body.length >= 4) conn.ackSize = m.body.readUInt32BE(0);
          } else if (m.type === MSG.USER_CONTROL) {
            if (m.body.length >= 2 && m.body.readUInt16BE(0) === USER_CONTROL.PING_RESPONSE) conn.pongs++;
          } else if (m.type === MSG.COMMAND) {
            let cmd;
            try { cmd = amfDecode(m.body); } catch { continue; }
            const [name, txn, obj, ...args] = cmd;
            if (name === 'connect') {
              conn.app = obj?.app ?? null;
              result(txn, { fmsVer: 'FMS/3,5,7,7009', capabilities: 31, mode: 1 }, { level: 'status', code: 'NetConnection.Connect.Success', description: 'Connection succeeded.', objectEncoding: 0 });
            } else if (name === 'createStream') {
              result(txn, null, 1);
            } else if (name === 'publish') {
              const key = String(args[0] ?? '');
              if (refuse !== null && key === refuse) {
                refusals++;
                status(m.msid, 'error', 'NetStream.Publish.BadName', `${key} is not a valid stream name`);
                setTimeout(() => socket.destroy(), 200);
                continue;
              }
              conn.key = key;
              conn.started = Date.now();
              send(CSID.CONTROL, MSG.USER_CONTROL, userControl(USER_CONTROL.STREAM_BEGIN, m.msid));
              status(m.msid, 'status', 'NetStream.Publish.Start', `${key} is now published.`);
              streams.push(conn);
              em.emit('publish', conn);
              if (pingAfterMs > 0) setTimeout(() => send(CSID.CONTROL, MSG.USER_CONTROL, userControl(USER_CONTROL.PING_REQUEST, Date.now() & 0x7fffffff)), pingAfterMs).unref();
            } else if (name === 'FCUnpublish' || name === 'deleteStream') {
              if (name === 'deleteStream') socket.end();
            } else if (typeof txn === 'number' && txn > 0) {
              result(txn, null, undefined);
            }
          }
        }
      };
      // What a server does with the client's window: an Acknowledgement of the bytes read so far each time another window's worth has come in.
      const ackingData = (d) => {
        onData(d);
        if (acknowledge && conn.ackSize > 0 && conn.reader.bytes - conn.ackedAt >= conn.ackSize) {
          conn.ackedAt = conn.reader.bytes;
          send(CSID.CONTROL, MSG.ACK, u32(conn.reader.bytes % 2 ** 32));
          conn.acksSent++;
        }
      };
      socket.on('data', ackingData);
      if (rest.length) ackingData(rest);
    }).catch((e) => { em.emit('error', e); socket.destroy(); });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const bound = server.address().port;
  // A getter, defined rather than assigned: Object.assign would copy the count once, as it stood.
  Object.defineProperty(em, 'refusals', { get: () => refusals });
  return Object.assign(em, {
    port: bound,
    url: `rtmp://127.0.0.1:${bound}/live`,
    streams,
    toFlv: (conn) => flvFile(conn.tags),
    summarize,
    close: () => new Promise((resolve) => { for (const s of sockets) s.destroy(); server.close(() => resolve()); }),
  });
}

/** What arrived: counts and spans by kind, the codecs, the headers seen, from a stream's tags. */
export function summarize(conn) {
  const out = { app: conn.app, key: conn.key, meta: conn.meta, acks: conn.acks, pongs: conn.pongs, video: { frames: 0, keyframes: 0, header: false, firstMs: null, lastMs: null, bytes: 0, codec: null }, audio: { packets: 0, header: false, firstMs: null, lastMs: null, bytes: 0, codec: null } };
  for (const t of conn.tags) {
    const d = describeTag(t.type, t.body);
    if (d.kind !== 'video' && d.kind !== 'audio') continue;
    const k = out[d.kind];
    k.codec = d.codec;
    if (d.header) { k.header = true; continue; }
    if (d.kind === 'video') { k.frames++; if (d.key) k.keyframes++; } else k.packets++;
    k.bytes += t.body.length;
    if (k.firstMs === null) k.firstMs = t.timestamp;
    k.lastMs = t.timestamp;
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const arg = (name, d) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : d; };
  const l = await startRtmpListener({ port: Number(arg('--port', 1935)) });
  const out = arg('--out', 'scratch/stream.flv');
  console.log(`listening at ${l.url} (any stream key); the first stream is written to ${out} when it ends`);
  l.on('publish', (s) => console.log(`publishing: app ${s.app}, ${s.key.length} characters of key`));
  l.on('end', (s) => {
    writeFileSync(out, l.toFlv(s));
    console.log(JSON.stringify(summarize(s), null, 1));
    void l.close();
  });
}
