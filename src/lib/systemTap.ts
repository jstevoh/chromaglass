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
*/

export type NativePcmTap = (fn: (samples: ArrayLike<number>, sampleRate: number) => void) => () => void;

export interface SystemTapStats {
  /** The tap context's state and clock. */
  state: AudioContextState;
  currentTime: number;
  sampleRate: number;
  baseLatency: number;
  outputLatency: number;
  /** PCM packets the page received over IPC, and samples in all. */
  packets: number;
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
  let samples = 0;
  const unsubPcm = nativeTap((pcm, sampleRate) => {
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
    if (nextTime < now) nextTime = now + (packets === 0 ? 0.06 : 0.005);
    src.start(nextTime);
    nextTime += buf.duration;
    packets += 1;
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
  void navigator.mediaDevices.getDisplayMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } },
    video: true,
  }).then((ds) => {
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
    stats,
    stop: () => {
      unsubPcm();
      displayStream?.getTracks().forEach(t => t.stop());
      if (ctx.state !== 'closed') void ctx.close();
    },
  };
}
