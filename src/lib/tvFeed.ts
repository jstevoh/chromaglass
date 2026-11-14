/**
 * The plate on a living-room TV (PLAN 12-tv, route 2): the show's own
 * picture, sent from the laptop to a TV on the same network as a WebRTC
 * video track.
 *
 * What was asked (the owner, 2026-11-08): a Google TV app that plays the
 * show on a big screen at home, for Home and Pro. What decides how is the
 * TV's GPU. The plate is WebGPU only, and the boxes people own are phone
 * chips from years ago (the Google TV Streamer's PowerVR GE9215, a Chromecast's
 * Mali-G31); Android TV has no Chrome, and its WebView gets only a
 * compatibility-mode WebGPU from Chrome 146. A network display (`?cast=true`)
 * runs its own copy of the solver, which such a box cannot. So the laptop,
 * which already draws the plate, sends what it drew, and the TV only decodes
 * video, which every one of those boxes does in hardware.
 *
 * Why WebRTC and not the pictures the remote's Draw gets (lib/padPicture.ts):
 * a JPEG at 480 wide fifteen times a second is the right thing for a thumb
 * on a phone, and the wrong thing for a 55-inch screen across a room, where
 * 1080p at thirty frames is 30 MB/s as JPEGs and a few Mb/s as H.264. Draw's
 * comment weighed WebRTC and turned it down for a show network where two
 * Wi-Fi clients may have no route between them; a home network almost always
 * has one, the laptop is often on a cable, and a TV holds a frame or two to
 * smooth the network, which a viewer on a sofa does not feel and a hand on a
 * pad does. Why not RTMP to the TV, as the Live Show sends to YouTube
 * (desktop/live.js): that wants a server on the TV and a second or more of
 * buffer. WebRTC gives the browser's own encoder (VideoToolbox on a Mac), a
 * jitter buffer of tens of milliseconds, and a decoder on the TV with no
 * server there at all.
 *
 * How it is wired, all through the show server's relay, which keeps no state
 * about it beyond who is connected:
 *
 *   1. a TV opens `/tv?key=…` on the laptop's show server and says hello as
 *      a `tv` with the show key, as a network display does;
 *   2. the relay tells the display `tv-join` with an id it made up for that
 *      socket (and again for every TV already there, when a display joins);
 *   3. the display, if this copy may (Home or Pro, `tierGates`), makes an
 *      offer with the plate's track and sends it `tv-signal` to that id; the
 *      TV answers, ICE candidates go both ways the same road;
 *   4. `tv-leave` (the TV's socket closed) closes its connection.
 *
 * The picture. A presented WebGPU canvas read outside the frame task that
 * drew it answers black (lib/frameTaps.ts), so the frame task hands the wall's
 * canvas to `tapTvFeed`, which copies it into a 2D stage canvas no bigger than
 * 1080p, at most thirty times a second, and only while a TV is connected;
 * `captureStream` on that stage is the track, one track for every TV. A frame
 * of the stage is sent when the stage is drawn, so a plate that is not
 * drawing sends nothing and the TV holds its last frame, which is what a TV
 * should do (the Live Show's encoder repeats frames because a stream server
 * stalls without them; a peer connection does not).
 *
 * The codec. A TV box decodes H.264 in hardware, and VP8 on its CPU, which on
 * a Cortex-A55 at 1080p is a slideshow. Chrome on a Mac offers VP8 first, so
 * the offer puts H.264 first (`preferTvCodecs`) wherever both ends have it,
 * and falls back to whatever they share.
 */
import type { RemoteMessage, TvSignal } from './remoteProtocol';

/** Frames a second the stage is drawn at, at most: the plate's own pace on a TV, and half a 60 Hz panel. */
export const TV_FPS = 30;
/** The stage's width at most: 1080p. A 4K projector's canvas is halved, which a TV across a room does not show. */
export const TV_MAX_WIDTH = 1920;
/** Bits a second the encoder may use: a home network's Wi-Fi carries it, and a fluid's fine edges need it (a 1080p fluid at 4 Mb/s smears its fronts). */
export const TV_MAX_BITRATE = 8_000_000;
/** TVs at once. Each is its own encode on the laptop's GPU; three rooms is a big house, and a fourth is refused rather than slowing the show. */
export const TV_MAX = 3;

/**
 * The codecs in the order a TV wants them: H.264 first (hardware decode on
 * every TV box), with the constrained-baseline, packetization-mode 1 profile
 * first among those since that is the one every decoder takes; then the rest
 * as the browser listed them. Pure, so the check runs it in node. A codec
 * with no `mimeType` (never seen) sorts last.
 */
export function preferTvCodecs<T extends { mimeType?: string; sdpFmtpLine?: string }>(codecs: readonly T[]): T[] {
  const rank = (c: T): number => {
    const mime = (c.mimeType ?? '').toLowerCase();
    if (mime !== 'video/h264') return mime ? 2 : 3;
    const fmtp = (c.sdpFmtpLine ?? '').toLowerCase();
    return fmtp.includes('packetization-mode=1') && fmtp.includes('profile-level-id=42e0') ? 0 : 1;
  };
  return codecs.map((c, i) => ({ c, i, r: rank(c) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.c);
}

/** The stage's size for a canvas of this size: no wider than TV_MAX_WIDTH, both sides even (an encoder's need), never zero. */
export function tvStageSize(width: number, height: number): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return { width: 2, height: 2 };
  const scale = Math.min(1, TV_MAX_WIDTH / width);
  const even = (n: number) => Math.max(2, Math.round(n * scale / 2) * 2);
  return { width: even(width), height: even(height) };
}

/**
 * The bit rate the encoder starts at, in kb/s. Chrome's own first guess is
 * 300 kb/s, a 320 x 180 picture, and it climbs only as fast as its bandwidth
 * estimate does: measured by `npm run tv` on loopback, about twelve seconds of
 * mush on a big screen before the picture reached 1280 wide. A home network
 * carries this from the first frame; one that cannot is found within a second
 * and stepped down, as any start is.
 */
export const TV_START_KBPS = 4000;

/**
 * The TV's answer with a starting bit rate on each video codec. Not a standard
 * field: `x-google-start-bitrate` is libwebrtc's own fmtp parameter, read by
 * the sending side from the remote description, and the one way a page has to
 * tell Chrome where to start. A browser that does not know it ignores it.
 * Pure, so the check runs it in node.
 */
export function withStartBitrate(sdp: string, kbps = TV_START_KBPS): string {
  const lines = sdp.split(/\r\n/);
  let video = false;
  const out = lines.map((line) => {
    if (line.startsWith('m=')) video = line.startsWith('m=video');
    if (!video || !/^a=fmtp:\d+ /.test(line) || /apt=/.test(line) || /x-google-start-bitrate/.test(line)) return line;
    return `${line};x-google-start-bitrate=${kbps}`;
  });
  return out.join('\r\n');
}

/** Why a TV was turned away, as the TV prints it. */
export type TvRefusal = 'tier' | 'full';

interface Peer { pc: RTCPeerConnection; }

/**
 * The display's end: one per relay link, as `PadPictureSender` is. `allowed`
 * is asked at every join (a licence can arrive after the page opened).
 */
export class TvFeedSender {
  private peers = new Map<string, Peer>();
  /**
   * The stage and its context outlive the stream: when the last TV leaves the
   * tap stops drawing (`ctx` goes null) but the stage keeps its last picture,
   * so the next TV to join a plate that has since stopped drawing (Freeze, a
   * hidden window) is sent that picture and not a black one (found in review:
   * a TV joining a frozen plate after the others had left went live on a 2 x 2
   * black stage).
   */
  private stage: HTMLCanvasElement | null = null;
  private stageCtx: CanvasRenderingContext2D | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private lastDraw = -Infinity;
  private beat: ReturnType<typeof setInterval> | null = null;
  /** Called with the number of TVs showing the plate, for the cast menu. */
  onCount: ((n: number) => void) | null = null;

  private send: (m: RemoteMessage) => void;
  private allowed: () => boolean;

  constructor(send: (m: RemoteMessage) => void, allowed: () => boolean) {
    this.send = send;
    this.allowed = allowed;
  }

  get count(): number { return this.peers.size; }
  /** Whether the frame task's tap copies anything: only while a TV is connected. */
  get tapping(): boolean { return this.ctx !== null; }

  /** The frame task's copy (see the file's comment). Cheap when no TV is connected: one null check. */
  tap(canvas: HTMLCanvasElement): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = performance.now();
    // A little under a frame's time, so a 60 Hz loop's jitter does not halve the rate.
    if (now - this.lastDraw < 1000 / TV_FPS - 4) return;
    this.lastDraw = now;
    const stage = ctx.canvas;
    const want = tvStageSize(canvas.width, canvas.height);
    if (stage.width !== want.width || stage.height !== want.height) { stage.width = want.width; stage.height = want.height; }
    ctx.drawImage(canvas, 0, 0, stage.width, stage.height);
  }

  /** The relay says a TV is here. */
  async join(id: string): Promise<void> {
    this.leave(id);
    const refusal: TvRefusal | null = !this.allowed() ? 'tier' : this.peers.size >= TV_MAX ? 'full' : null;
    if (refusal) { this.send({ type: 'tv-signal', to: id, signal: { kind: 'refused', reason: refusal } }); return; }
    const stream = this.ensureStream();
    const track = stream?.getVideoTracks()[0];
    if (!stream || !track) return;
    // No ICE servers: a TV in the same house is reached by its address on the
    // network. The Mac app gives its real address rather than an mDNS name
    // (desktop/main.js), for routers that drop multicast.
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.peers.set(id, { pc });
    this.onCount?.(this.peers.size);
    pc.onicecandidate = (e) => {
      this.send({ type: 'tv-signal', to: id, signal: { kind: 'ice', candidate: e.candidate ? e.candidate.toJSON() : null } });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.leave(id);
    };
    const tx = pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] });
    try {
      const caps = (RTCRtpReceiver as unknown as { getCapabilities?: (k: string) => RTCRtpCapabilities | null }).getCapabilities?.('video');
      if (caps?.codecs?.length && tx.setCodecPreferences) tx.setCodecPreferences(preferTvCodecs(caps.codecs));
    } catch { /* the browser's own order, VP8 first: slower on a TV box, still a picture */ }
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (this.peers.get(id)?.pc !== pc) return;
      this.send({ type: 'tv-signal', to: id, signal: { kind: 'offer', sdp: pc.localDescription?.sdp ?? offer.sdp ?? '' } });
      // The bitrate is a sender parameter, settable once the encoding exists.
      const p = tx.sender.getParameters();
      if (p.encodings?.length) {
        p.encodings[0].maxBitrate = TV_MAX_BITRATE;
        p.encodings[0].maxFramerate = TV_FPS;
        (p as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = 'maintain-framerate';
        await tx.sender.setParameters(p).catch(() => { /* the browser's own bitrate */ });
      }
    } catch {
      this.leave(id);
    }
  }

  /** A signal from a TV: its answer or a candidate. */
  async signal(id: string, s: TvSignal): Promise<void> {
    const pc = this.peers.get(id)?.pc;
    if (!pc) return;
    try {
      if (s.kind === 'answer') await pc.setRemoteDescription({ type: 'answer', sdp: withStartBitrate(s.sdp) });
      else if (s.kind === 'ice') await pc.addIceCandidate(s.candidate ?? undefined);
    } catch { /* a stale candidate after a restart: ignored, ICE goes on with the rest */ }
  }

  /** The relay says the TV went. */
  leave(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    try { peer.pc.close(); } catch { /* closed */ }
    this.onCount?.(this.peers.size);
    if (this.peers.size === 0) this.dropStream();
  }

  /** The relay link went, or the page is closing. */
  close(): void {
    for (const id of [...this.peers.keys()]) this.leave(id);
    this.dropStream();
  }

  private ensureStream(): MediaStream | null {
    if (this.stream) return this.stream;
    if (typeof document === 'undefined') return null;
    let stage = this.stage, ctx = this.stageCtx;
    if (!stage || !ctx) {
      stage = document.createElement('canvas');
      stage.width = 2; stage.height = 2;
      ctx = stage.getContext('2d', { alpha: false });
      if (!ctx || !('captureStream' in stage)) return null;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 2, 2);
      this.stage = stage;
      this.stageCtx = ctx;
    }
    const stream = (stage as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(TV_FPS);
    // A fluid is motion: hold the frame rate, give up sharpness first when the network dips.
    const track = stream.getVideoTracks()[0];
    if (track) track.contentHint = 'motion';
    this.ctx = ctx;
    this.stream = stream;
    this.lastDraw = -Infinity;
    /*
      A plate that is not drawing (Freeze, a hidden window's slow ticks, a
      software GPU at a frame every few seconds) sends no frames, and a TV that
      joins then has nothing to decode: measured with the real app on the
      cloud's software GPU, the TV sat connected with no picture and started
      over every ten seconds. So once a second with no new frame, the stage is
      sent again as it is: the last picture, which a joining TV needs and a
      watching one does not mind (an unchanged frame encodes to a few bytes).
    */
    this.beat = setInterval(() => {
      if (performance.now() - this.lastDraw < 1000) return;
      // Drawn onto itself, which marks the canvas changed: `requestFrame()`
      // on the track was tried first and sent nothing from an unchanged
      // canvas (Chromium captures a canvas only when it has been drawn).
      ctx.drawImage(stage, 0, 0);
    }, 1000);
    // And once now, so a joining TV has a frame even before the first tick.
    ctx.drawImage(stage, 0, 0);
    return stream;
  }

  private dropStream(): void {
    if (this.beat) { clearInterval(this.beat); this.beat = null; }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx = null;
  }
}

let sender: TvFeedSender | null = null;
/** The relay link's sender, set while the link is up (app/useRemote.ts), as padPicture's is. */
export function setTvFeedSender(s: TvFeedSender | null): void { sender = s; }
/** Called by the frame task (lib/frameTaps.ts) with the wall's canvas it just drew. Never throws into it. */
export function tapTvFeed(canvas: HTMLCanvasElement): void {
  if (!sender) return;
  try { sender.tap(canvas); } catch { /* the next frame tries again */ }
}
