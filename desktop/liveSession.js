/**
 * One live show, several destinations (PLAN.md 37x-4c).
 *
 * The owner (2026-10-29) wants the show "on all of the popular streaming
 * platforms", several at once. Each platform is its own RTMPS connection
 * (live.js), but the picture and the sound are encoded once in the page
 * (src/lib/liveStream.ts) and the same packets are written to every socket
 * that wants them: two landscape destinations cost one encode, not two. A
 * vertical one (Instagram and TikTok take 9:16 only, docs/live-show.md) is a
 * second video output, its own encode of a crop of the same plate; the audio
 * is one encode for all of them.
 *
 * Why each socket is on its own:
 *
 *   - Falling behind is a property of one connection. A slow ingest, or one
 *     platform's server across an ocean, fills its own socket; the client
 *     drops that socket's video to the next keyframe (live.js), and the
 *     others carry on with every frame. Nothing here waits on the slowest.
 *   - A lost connection (the Wi-Fi blinks, a server restarts) is reconnected
 *     on its own, with the key it was started with still held in this process
 *     (the page never had it, and the keychain is not asked again), after 2,
 *     4, 8, 15 then every 30 seconds, as OBS backs off; the new connection
 *     joins at the next keyframe. A server that refused the stream (a wrong
 *     key, live not enabled on the channel) is not asked again: it would say
 *     the same thing every 30 seconds, and the panel should say it once.
 *   - At the start, every destination is connected side by side, and the show
 *     goes live when the first says yes; one that could not be reached is
 *     tried again as if it had been lost. Only when none can be reached does
 *     the start fail, with each one's reason.
 *
 * The health readout is `state().destinations`: per destination its phase,
 * the kilobits a second reaching the server, the seconds of stream it is
 * behind and whose word that is (the server's acknowledgements, or only the
 * socket's), frames sent and dropped, audio packets, reconnects and the time
 * to the next try. The panel (37x-4d) draws it; `npm run livedrop` measures
 * it against a throttled listener.
 *
 * No Electron here, so the checks drive it in node; `wireLive` at the end is
 * what main.js hands ipcMain to.
 */
import { EventEmitter } from 'node:events';
import { LiveClient, parseRtmpUrl } from './live.js';

/** The wait before each try after a connection is lost; the last repeats. OBS's default is 2 s and doubling, capped. */
export const RECONNECT_DELAYS_MS = [2000, 4000, 8000, 15000, 30000];
/** Tries in a row before a destination is given up on: twenty, about nine minutes of a server that does not come back. */
export const RECONNECT_TRIES = 20;
/** The most destinations one show sends to: the platforms in docs/live-show.md, with room. */
export const MAX_DESTINATIONS = 8;

const ENDED = new Set(['refused', 'gave up', 'closed']);

export class LiveSession extends EventEmitter {
  /**
   * `outputs`: [{ id, meta }], each a video encode the page makes (meta as
   * LiveClient's: width, height, fps, videoBitrate, audio).
   * `destinations`: [{ name, url, key, output }], output an output's id.
   */
  constructor({ outputs, destinations, reconnectDelaysMs = RECONNECT_DELAYS_MS, tries = RECONNECT_TRIES }) {
    super();
    if (!Array.isArray(outputs) || !outputs.length) throw new Error('no video output to stream');
    if (!Array.isArray(destinations) || !destinations.length) throw new Error('no destination to stream to');
    if (destinations.length > MAX_DESTINATIONS) throw new Error(`at most ${MAX_DESTINATIONS} destinations`);
    this.outputs = new Map(outputs.map((o) => [String(o.id), { id: String(o.id), meta: o.meta ?? {}, videoConfig: null }]));
    const names = new Set();
    this.destinations = destinations.map((d, i) => {
      const name = String(d.name ?? `destination ${i + 1}`);
      if (names.has(name)) throw new Error(`two destinations named "${name}"`);
      names.add(name);
      const output = String(d.output ?? outputs[0].id);
      if (!this.outputs.has(output)) throw new Error(`${name}: no output "${output}"`);
      parseRtmpUrl(String(d.url ?? ''));
      return {
        name, output, url: String(d.url), key: String(d.key ?? ''),
        client: null, phase: 'idle', error: null, refused: false,
        reconnects: 0, tries: 0, retryAt: 0, timer: null,
        // What earlier connections sent, so the readout counts the whole show and not only the current socket.
        before: { videoFrames: 0, videoDropped: 0, dropRuns: 0, audioPackets: 0, bytesSent: 0, joinSkipped: 0, acks: 0, pings: 0, serverAcks: 0 },
        status: [],
      };
    });
    this.delays = reconnectDelaysMs;
    this.tries = tries;
    this.phase = 'idle';
    this.error = null;
    this.audioConfigured = null;
  }

  /** Connect every destination side by side; live when one is. Resolves { ok, error } with each one's word in `state()`. */
  async start() {
    if (this.phase !== 'idle') throw new Error(`already ${this.phase}`);
    this.phase = 'starting';
    await Promise.all(this.destinations.map((d) => this.open(d, false)));
    if (this.phase !== 'starting') return { ok: false, error: this.error ?? 'stopped while starting' };
    if (!this.destinations.some((d) => d.client?.phase === 'live')) {
      this.error = this.destinations.map((d) => `${d.name}: ${d.error ?? d.phase}`).join('; ');
      this.end('failed');
      return { ok: false, error: this.error };
    }
    this.phase = 'live';
    // The ones that could not be reached at the start are tried again, as if lost.
    for (const d of this.destinations) if (!d.client) this.retry(d);
    return { ok: true };
  }

  /** A connection for `d`; `join` when the stream has already begun, so it starts at a keyframe. Resolves true when live. */
  async open(d, join) {
    const out = this.outputs.get(d.output);
    const client = new LiveClient({ url: d.url, key: d.key, meta: out.meta, join });
    d.client = client;
    d.phase = 'connecting';
    client.on('status', (line) => { d.status.push(line); if (d.status.length > 5) d.status.shift(); });
    client.on('failed', (err) => this.lost(d, client, err));
    try {
      await client.connect();
    } catch (e) {
      this.lost(d, client, client.error ?? e.message);
      return false;
    }
    if (d.client !== client) return false;
    if (this.phase !== 'starting' && this.phase !== 'live') { client.close(); return false; }
    d.phase = 'live';
    d.error = null;
    if (out.videoConfig) client.videoConfig(out.videoConfig);
    if (this.audioConfigured) client.audioConfig(this.audioConfigured.codec, this.audioConfigured.description);
    this.emit('destination', { name: d.name, event: join ? 'reconnected' : 'live' });
    return true;
  }

  /** A connection ended without being asked to: its counts kept, and, when the show is on, another tried. */
  lost(d, client, err) {
    if (d.client !== client) return;
    const c = client.state();
    for (const k of Object.keys(d.before)) d.before[k] += c[k] ?? 0;
    d.client = null;
    d.error = String(err ?? 'lost');
    d.refused = d.refused || client.refused;
    d.phase = d.refused ? 'refused' : 'lost';
    this.emit('destination', { name: d.name, event: d.phase, error: d.error });
    if (this.phase === 'live') this.retry(d);
  }

  retry(d) {
    if (d.refused) { d.phase = 'refused'; this.checkEnded(); return; }
    if (d.tries >= this.tries) { d.phase = 'gave up'; this.checkEnded(); return; }
    const delay = this.delays[Math.min(d.tries, this.delays.length - 1)];
    d.tries++;
    d.phase = 'waiting';
    d.retryAt = Date.now() + delay;
    d.timer = setTimeout(async () => {
      d.timer = null;
      if (this.phase !== 'live') return;
      if (await this.open(d, true)) { d.reconnects++; d.tries = 0; }
    }, delay);
    d.timer.unref?.();
  }

  /** With every destination refused or given up on, the show has nowhere to go: it ends, and the page stops encoding. */
  checkEnded() {
    if (this.phase === 'live' && this.destinations.every((d) => ENDED.has(d.phase))) {
      this.error = this.destinations.map((d) => `${d.name}: ${d.error ?? d.phase}`).join('; ');
      this.end('failed');
    }
  }

  live(output) {
    return this.destinations.filter((d) => d.client?.phase === 'live' && (output === undefined || d.output === output)).map((d) => d.client);
  }

  /** An output's AVC sequence header: kept for connections made later, and sent to the live ones that carry it. */
  videoConfig(output, description) {
    const out = this.outputs.get(String(output));
    if (!out) return;
    out.videoConfig = description;
    for (const c of this.live(out.id)) c.videoConfig(description);
  }

  audioConfig(codec, description) {
    this.audioConfigured = { codec, description };
    for (const c of this.live()) c.audioConfig(codec, description);
  }

  /** One frame of one output, to every destination that carries it; each decides alone whether it is dropped. */
  video(output, timestampMs, key, data) {
    for (const c of this.live(String(output))) c.video(timestampMs, key, data);
  }

  /** One audio packet, to every destination. */
  audio(timestampMs, data) {
    for (const c of this.live()) c.audio(timestampMs, data);
  }

  health(d) {
    const c = d.client?.state() ?? null;
    const sum = (k) => d.before[k] + (c?.[k] ?? 0);
    return {
      name: d.name, output: d.output,
      phase: c && c.phase !== 'live' && d.phase === 'live' ? c.phase : d.phase,
      error: d.error, status: d.status.slice(),
      kbps: c?.kbps ?? 0,
      secondsBehind: c?.secondsBehind ?? 0,
      bytesBehind: c?.bytesBehind ?? 0,
      measuredAt: c?.measuredAt ?? null,
      dropping: c?.dropping ?? false,
      videoFrames: sum('videoFrames'), videoDropped: sum('videoDropped'), dropRuns: sum('dropRuns'),
      audioPackets: sum('audioPackets'), bytesSent: sum('bytesSent'), joinSkipped: sum('joinSkipped'),
      acks: sum('acks'), pings: sum('pings'), serverAcks: sum('serverAcks'),
      reconnects: d.reconnects,
      retryInMs: d.phase === 'waiting' ? Math.max(0, d.retryAt - Date.now()) : null,
      seconds: c?.seconds ?? 0,
    };
  }

  state() {
    return { phase: this.phase, error: this.error, destinations: this.destinations.map((d) => this.health(d)) };
  }

  end(phase) {
    if (this.phase === 'closed' || this.phase === 'failed') return;
    this.phase = phase;
    for (const d of this.destinations) {
      if (d.timer) { clearTimeout(d.timer); d.timer = null; }
      if (d.client) {
        const c = d.client.state();
        for (const k of Object.keys(d.before)) d.before[k] += c[k] ?? 0;
        d.client.close();
        d.client = null;
      }
      if (!ENDED.has(d.phase)) d.phase = 'closed';
    }
    this.emit(phase);
  }

  /** Stop the show: every connection closed, every retry cancelled. */
  close() { this.end('closed'); }
}

/**
 * The IPC the page uses (desktop/preload.cjs exposes it as
 * `__CHROMAGLASS_NATIVE__.live`): one show at a time, to as many destinations
 * as it names.
 *
 *   live-start  { outputs: [{ id, meta }], destinations: [{ name, url,
 *               keyName, output }] }, or 37x-4b's one destination
 *               { url, keyName, meta }; from the repo only a destination may
 *               carry `key` itself (a packed app takes a key only from its
 *               keychain store, keys.js, so a page can never hold or read
 *               one); answers when the first destination is live, or with
 *               each one's error
 *   live-config { output, video: description } / { audio: { codec, description } }
 *   live-packet (send, not invoke: nothing to wait for) one encoded packet,
 *               `output` naming a video packet's encode
 *   live-stop   ends the show
 *   live-state  the session's state, with each destination's health
 *   live-event  (to the page) 'destination' (one went live, was lost,
 *               reconnected or refused), 'failed', 'closed'
 */
export function wireLive(ipcMain, { keys, isPackaged, send }) {
  let session = null;
  const tell = (event, detail) => { try { send('chromaglass:live-event', { event, detail: detail ?? null, state: session?.state() ?? null }); } catch { /* window gone */ } };
  ipcMain.handle('chromaglass:live-start', async (_e, req) => {
    if (session && (session.phase === 'live' || session.phase === 'starting')) return { ok: false, error: `a stream is already ${session.phase}` };
    const r = req && typeof req === 'object' ? req : {};
    const outputs = Array.isArray(r.outputs) && r.outputs.length ? r.outputs : [{ id: 'wide', meta: r.meta ?? {} }];
    const asked = Array.isArray(r.destinations) && r.destinations.length ? r.destinations : [{ url: r.url, keyName: r.keyName, key: r.key, output: outputs[0].id }];
    const destinations = [];
    for (const [i, d] of asked.entries()) {
      let key = null;
      if (typeof d?.keyName === 'string') key = await keys.read(d.keyName);
      else if (!isPackaged && typeof d?.key === 'string') key = d.key;
      const name = String(d?.name ?? d?.keyName ?? `destination ${i + 1}`);
      if (!key) return { ok: false, error: d?.keyName ? `${name}: no key named "${d.keyName}" in the keychain` : `${name}: no stream key` };
      destinations.push({ name, url: String(d.url ?? ''), key, output: d.output ?? outputs[0].id });
    }
    try {
      session = new LiveSession({ outputs, destinations });
    } catch (e) {
      return { ok: false, error: e.message };
    }
    session.on('destination', (detail) => tell('destination', detail));
    session.on('failed', () => tell('failed', session?.error));
    session.on('closed', () => tell('closed'));
    const started = await session.start();
    return { ...started, state: session.state() };
  });
  ipcMain.handle('chromaglass:live-config', (_e, cfg) => {
    if (!session || !cfg) return false;
    if (cfg.video) session.videoConfig(cfg.output ?? session.outputs.keys().next().value, new Uint8Array(cfg.video));
    if (cfg.audio) session.audioConfig(cfg.audio.codec === 'aac' ? 'aac' : 'opus', new Uint8Array(cfg.audio.description));
    return true;
  });
  ipcMain.on('chromaglass:live-packet', (_e, p) => {
    if (!session || !p) return;
    const data = p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data);
    if (p.kind === 'video') session.video(p.output ?? session.outputs.keys().next().value, Number(p.timestampMs) || 0, Boolean(p.key), data);
    else if (p.kind === 'audio') session.audio(Number(p.timestampMs) || 0, data);
  });
  ipcMain.handle('chromaglass:live-stop', () => { session?.close(); return session?.state() ?? null; });
  ipcMain.handle('chromaglass:live-state', () => session?.state() ?? null);
  ipcMain.handle('chromaglass:live-key-set', (_e, name, key) => keys.set(String(name), String(key)));
  ipcMain.handle('chromaglass:live-key-list', () => keys.list());
  ipcMain.handle('chromaglass:live-key-remove', (_e, name) => keys.remove(String(name)));
  return { current: () => session };
}
