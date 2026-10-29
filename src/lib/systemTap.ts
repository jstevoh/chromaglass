/*
  The Mac app's System audio source (PLAN.md 23.8): what the Mac plays, heard
  with no tab to share.

  Two things feed one MediaStream. ScreenCaptureKit's loopback comes back from
  `getDisplayMedia` (main.js's `setDisplayMediaRequestHandler` answers it with
  `audio: 'loopback'` and no picker), about 0.8 s after it is asked; and the
  main process's loopback tap (`CHROMAGLASS_AUDIO_TAP=1`, `npm run desktop`
  only, since the check's runner has no screen-capture permission) hands PCM
  over IPC. Both play into one AudioContext's MediaStreamDestination, and that
  destination's stream is what `useAudioAnalyzer` (the ear), the song ID and
  the recorder are given, so to them System audio is a stream like any other.
  The stream is handed over before `getDisplayMedia` resolves so that no early
  packet is dropped while ScreenCaptureKit starts.

  Why a module of its own (2026-10-28): the desktop check's system-audio line
  went red three times in eleven runs that afternoon, with both contexts
  "running" within 0.1 s of the click, 239 packets sent and the ear reading
  volume 0 for the full 10 s; the other eight heard the tone 0.7–1.0 s after
  the click. A context's state says that `start()` was called, not that its
  clock runs: Chromium sets "running" when it asks the audio service for an
  output stream, and `currentTime` stays at zero until the device answers. So
  the state alone could not tell a dead clock from a broken wire. `stats()`
  reads the things that can: both clocks, how many packets reached the page
  and where the next one is scheduled, the destination track's state, and
  what `getDisplayMedia` answered. The check prints them (scripts/desktop-audio.mjs).

  What the first red with those numbers said (run 40770856220, the same
  evening): the tap's clock ran, 0.43 s after the click to 9.30 s at the end,
  232 of 234 packets in the page and scheduled, the track live; the ear's
  context, made a few milliseconds after it, reported "running" and its clock
  never left zero; and a fresh context made at the end reported 44100 Hz
  where the first two had 48000 (the renderer's fallback parameters when the
  output device cannot be opened) and its clock stayed at zero too. So the
  wire was sound, and the runner's output device, having opened one stream,
  opened no second one for the rest of the run. Eight of eleven runs that day
  did open two; the three that did not were the faster hosts (PLAN.md
  23.8-clock). On a Mac with a real output device Chromium opens as many as
  the page asks for; in the runner's virtual one a second stream can die.

  So the ear analyses the System audio source inside this context: it is
  handed `context` and makes no context of its own (useAudioAnalyzer's
  `sharedContext`). The PCM, the loopback and the analyser then share the one
  output stream the device did open, which is also one fewer stream for the
  Mac to drive at a gig. The check keeps printing both clocks and the probe,
  so a run on which even the first stream does not open says so.
*/

export type NativePcmTap = (fn: (samples: ArrayLike<number>, sampleRate: number) => void) => () => void;

export interface SystemTapStats {
  /** The tap context's state and clock. */
  state: AudioContextState;
  currentTime: number;
  sampleRate: number;
  baseLatency: number;
  outputLatency: number;
  /** PCM packets the page received over IPC, how many of them were scheduled to play, and samples in all. */
  packets: number;
  scheduled: number;
  samples: number;
  /** Where the next packet is scheduled on the tap context's clock. */
  nextTime: number;
  /** The destination stream's one audio track. */
  track: { readyState: MediaStreamTrackState; muted: boolean; enabled: boolean } | null;
  /** What getDisplayMedia answered: not yet, a stream with audio, one without, or a refusal. */
  display: 'pending' | 'audio' | 'video-only' | 'refused';
}

export interface SystemTap {
  /** The stream the rest of the app hears: the destination's. */
  stream: MediaStream;
  /**
   * The context the stream is made in. The ear analyses this source inside
   * it (useAudioAnalyzer's `sharedContext`) rather than in a context of its
   * own: one output stream to the Mac instead of two. See the module comment.
   */
  context: AudioContext;
  stop: () => void;
  stats: () => SystemTapStats;
}

/**
 * Start the System audio source. `stillWanted` says whether the person still
 * wants this source when `getDisplayMedia` answers (another pick in between
 * closes what came late). Under `debug`, `window.__systemTapContext` is the
 * context (what the check read until 2026-10-28) and `window.__systemTap()`
 * its stats.
 */
export function startSystemTap(nativeTap: NativePcmTap, stillWanted: () => boolean, debug: boolean): SystemTap {
  const ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const dest = ctx.createMediaStreamDestination();
  let displayStream: MediaStream | null = null;
  let display: SystemTapStats['display'] = 'pending';
  let nextTime = 0;
  let packets = 0;
  let scheduled = 0;
  let samples = 0;
  const unsubPcm = nativeTap((pcm, sampleRate) => {
    // Counted on arrival, before anything can throw (the preload swallows a
    // throw), so the check's "packets in the page" is the wire and not the scheduling.
    packets += 1;
    if (!pcm || pcm.length === 0 || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') void ctx.resume();
    const sr = sampleRate > 0 ? sampleRate : ctx.sampleRate;
    const buf = ctx.createBuffer(1, pcm.length, sr);
    buf.getChannelData(0).set(pcm);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    const now = ctx.currentTime;
    // Give the first scheduled chunk 60 ms so React has committed `dest.stream`
    // and `useAudioAnalyzer` has connected its `AnalyserNode`.
    if (nextTime < now) nextTime = now + (scheduled === 0 ? 0.06 : 0.005);
    src.start(nextTime);
    nextTime += buf.duration;
    scheduled += 1;
    samples += pcm.length;
  });
  const stats = (): SystemTapStats => {
    const track = dest.stream.getAudioTracks()[0];
    return {
      state: ctx.state,
      currentTime: ctx.currentTime,
      sampleRate: ctx.sampleRate,
      baseLatency: ctx.baseLatency,
      outputLatency: ctx.outputLatency,
      packets,
      scheduled,
      samples,
      nextTime,
      track: track ? { readyState: track.readyState, muted: track.muted, enabled: track.enabled } : null,
      display,
    };
  };
  if (debug) {
    const w = window as unknown as { __systemTapContext?: AudioContext; __systemTap?: () => SystemTapStats };
    w.__systemTapContext = ctx;
    w.__systemTap = stats;
  }
  // Through a resolved promise, so a synchronous throw (no mediaDevices at
  // all) lands in the refusal below and the tap, already made, still has its stop.
  void Promise.resolve().then(() => navigator.mediaDevices.getDisplayMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } },
    video: true,
  })).then((ds) => {
    if (!stillWanted() || ctx.state === 'closed') {
      ds.getTracks().forEach(t => t.stop());
      return;
    }
    displayStream = ds;
    display = ds.getAudioTracks().length > 0 ? 'audio' : 'video-only';
    if (display === 'audio') {
      try {
        ctx.createMediaStreamSource(ds).connect(dest);
      } catch { /* the PCM tap carries on */ }
    }
  }, () => { display = 'refused'; /* the PCM tap carries on */ });
  return {
    stream: dest.stream,
    context: ctx,
    stats,
    stop: () => {
      unsubPcm();
      displayStream?.getTracks().forEach(t => t.stop());
      if (ctx.state !== 'closed') void ctx.close();
    },
  };
}
