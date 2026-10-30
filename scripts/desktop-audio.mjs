/*
  The desktop check's System audio line (PLAN.md 23.8), moved out of
  scripts/desktop.mjs on 2026-10-28 when that file reached its size ceiling.

  On the Mac app, "System audio" replaces "Another tab", intercepts
  getDisplayMedia with no tab picker, and routes the System audio source's
  pipeline to the ear (fed here through CHROMAGLASS_AUDIO_TAP=1, since
  CHROMAGLASS_OFFLINE skips macOS TCC screen capture; the real
  ScreenCaptureKit path is docs/judging.md §87).

  The tone, and when the ear is read. Until 2026-10-26 the check sent 1.2 s
  of tone in 0.56 s (a child process, run to its end) and read the ear once,
  the moment it returned: about 0.9 s after the click. The packed app on
  e1380fa read "ear reads 9, volume 0" there, with the picker intercepted and
  the tap open, and the same app built the same way, packed and unpacked, in
  a cloud session read 61 and 46. Nothing on the audio path changed between
  the run that passed (033c845) and that one. What that one read is a moment:
  the first sound the page makes in a run starts Chromium's audio service and
  the Mac's output device, and both of the System audio source's contexts
  (the tap's and the ear's) count no time and pass no sound until it is up.
  A runner that takes longer than 0.9 s to get there read silence, however
  well the pipeline worked.

  So the tone plays in real time (one 2048-sample packet every 40 ms, a hair
  ahead of 42.7 ms of sound, so the tap's queue never runs dry) for as long
  as the ear has not heard it, up to TONE_DEADLINE_MS, and the ear is read
  every 100 ms meanwhile. The bar is as it was, a reading above 5 with the
  picker intercepted.

  What the line prints, and why (2026-10-28). Eleven runs of the packed
  check that afternoon: eight heard the tone 0.7–1.0 s after the click, and
  three (two on #544, one on #537, each green on a re-run) heard nothing in
  10 s with both contexts "running" from 0.01–0.08 s and 239 packets sent;
  the three were on the faster runners (the opening rung two steps higher,
  the plate at 384²). A context's state is not its clock: Chromium sets
  "running" when it asks the audio service for an output stream, and
  `currentTime` stays at zero until the device answers. The state alone could
  not say whether the runner's output device was dead for ten seconds or a
  wire between the tap and the ear was. So the line reads both clocks (the
  tap's and the ear's), how many packets reached the page and where the next
  one is scheduled, the destination track's state and what getDisplayMedia
  answered (`window.__systemTap()` under ?debug, lib/systemTap.ts), prints
  them at the old moment and at the end, and when the tone was not heard
  asks a fresh context of its own, with an oscillator, whether any sound at
  all can be rendered in the page just then: a dead device fails that too, a
  dead wire does not.

  What the first red with those numbers said (run 40770856220, the same
  evening, the seventh run of this line on that head): the tap's clock ran,
  first moving 0.43 s after the click and at 9.30 s at the end, 232 of 234
  packets in the page and scheduled to 9.90 s, the track live; the ear's
  context, made a few milliseconds after the tap's, reported "running" and its
  clock never left zero; and the fresh context at the end reported 44100 Hz
  where the first two had 48000 (the renderer's fallback parameters when the
  output device cannot be opened) with its clock at zero too, oscillator peak
  0. So the wire was sound and the runner's output device, having opened one
  stream, opened no second one for the rest of the run. The fix is in the
  app, not here: the ear now analyses the System audio source inside the
  tap's own context (lib/systemTap.ts, useAudioAnalyzer's `sharedContext`),
  so the source and its analysis are the one stream the device did open. The
  line keeps printing both clocks and the probe: with one context the two
  clocks are one, and a run on which even that stream does not open says so
  in the probe, and fails.
*/

/**
 * Run the System audio line. `check(name, ok, detail)` is the check's own
 * printer, `sleep(ms)` its timer, `createSocket` node's dgram.
 */
export async function systemAudioLine({ page, electronApp, check, sleep, createSocket }) {
  await page.locator('[data-testid=mode-segmented-setup]').click();
  await page.locator('[data-testid=sound-source-system]').waitFor({ timeout: 5_000 });
  const sysLabel = (await page.locator('[data-testid=sound-source-system]').textContent())?.trim() ?? '';
  const asksBefore = await electronApp.evaluate(() => globalThis.__chromaglassSystemAudioAsks ?? 0);
  const TONE_DEADLINE_MS = 10_000;
  await page.locator('[data-testid=sound-source-system]').click();
  const clickedAt = Date.now();
  const audioPort = await electronApp.evaluate(() => globalThis.__chromaglassAudioPort ?? 0);
  const toneSock = createSocket('udp4');
  const pkt = Buffer.alloc(12 + 2048 * 4);
  pkt.write('CGPCM1\0\0', 0, 8, 'ascii');
  pkt.writeUInt32LE(48000, 8);
  let phase = 0;
  let sent = 0;
  const toneTimer = audioPort > 0 ? setInterval(() => {
    for (let i = 0; i < 2048; i++) {
      pkt.writeFloatLE(Math.sin(phase) * 0.85, 12 + i * 4);
      phase += (2 * Math.PI * 220) / 48000;
    }
    toneSock.send(pkt, audioPort, '127.0.0.1');
    sent++;
  }, 40) : null;
  const readEar = () => page.evaluate(() => {
    const cs = window.chromaglassCastState?.();
    const r = cs?.ear?.reads;
    const tap = window.__systemTap?.() ?? null;
    return {
      reads: r ? (r.frame ?? 0) + (r.ask ?? 0) + (r.tick ?? 0) : 0,
      volume: cs?.audio?.volume ?? 0,
      ear: cs?.ear?.state ?? 'none',
      earTime: cs?.ear?.currentTime ?? null,
      earRate: cs?.ear?.sampleRate ?? null,
      tap: tap?.state ?? window.__systemTapContext?.state ?? 'none',
      tapTime: tap?.currentTime ?? null,
      tapRate: tap?.sampleRate ?? null,
      packets: tap?.packets ?? null,
      scheduled: tap?.scheduled ?? null,
      nextTime: tap?.nextTime ?? null,
      track: tap?.track ?? null,
      display: tap?.display ?? null,
    };
  }).catch(() => ({ reads: 0, volume: 0, ear: 'unread', tap: 'unread', earTime: null, tapTime: null, packets: null }));
  const ms = () => Date.now() - clickedAt;
  let atOldMoment = null;
  let earRanAt = null;
  let tapRanAt = null;
  let earTickedAt = null;
  let tapTickedAt = null;
  let soundHeard = { reads: 0, volume: 0, ear: 'none', tap: 'none', earTime: null, tapTime: null, packets: null };
  let heardAt = null;
  while (ms() < TONE_DEADLINE_MS) {
    soundHeard = await readEar();
    const t = ms();
    if (atOldMoment === null && t >= 900) atOldMoment = { t, ...soundHeard };
    if (earRanAt === null && soundHeard.ear === 'running') earRanAt = t;
    if (tapRanAt === null && soundHeard.tap === 'running') tapRanAt = t;
    if (earTickedAt === null && soundHeard.earTime > 0) earTickedAt = t;
    if (tapTickedAt === null && soundHeard.tapTime > 0) tapTickedAt = t;
    if (soundHeard.reads > 0 && soundHeard.volume > 5) { heardAt = t; break; }
    await sleep(100);
  }
  if (toneTimer) clearInterval(toneTimer);
  toneSock.close();
  // Not heard: can this page render any sound at all right now? A context of
  // the line's own, an oscillator into an analyser into the destination, read
  // after a second. A dead output device leaves its clock at zero and its
  // analyser silent; a wire broken between the tap and the ear leaves this
  // one sounding.
  // Raced against three seconds: on a device that will not open, resume()
  // or close() may never settle, and the line's numbers must still print.
  const probe = heardAt !== null ? null : await Promise.race([
    sleep(3000).then(() => ({ error: 'the probe did not settle in 3 s' })),
    page.evaluate(async () => {
    try {
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      const osc = ctx.createOscillator();
      osc.frequency.value = 220;
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      const mute = ctx.createGain();
      mute.gain.value = 0.0001;
      osc.connect(an);
      an.connect(mute);
      mute.connect(ctx.destination);
      osc.start();
      const t0 = ctx.currentTime;
      await new Promise((r) => setTimeout(r, 1000));
      const data = new Uint8Array(an.fftSize);
      an.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      const out = { state: ctx.state, clock: ctx.currentTime - t0, peak, sampleRate: ctx.sampleRate, outputLatency: ctx.outputLatency };
      osc.stop();
      await ctx.close();
      return out;
    } catch (e) {
      return { error: String(e?.message ?? e) };
    }
  }).catch((e) => ({ error: String(e?.message ?? e) })),
  ]);
  const asksAfter = await electronApp.evaluate(() => globalThis.__chromaglassSystemAudioAsks ?? 0);
  const when = (t) => (t === null ? 'never' : `${(t / 1000).toFixed(2)} s`);
  const secs = (t) => (t === null || t === undefined ? '?' : `${Number(t).toFixed(2)} s`);
  const clocks = (s) => `tap clock ${secs(s.tapTime)}${s.tapRate ? ` at ${s.tapRate} Hz` : ''}, ear clock ${secs(s.earTime)}${s.earRate ? ` at ${s.earRate} Hz` : ''}, ${s.packets ?? '?'} packets in the page (${s.scheduled ?? '?'} scheduled), the next at ${secs(s.nextTime)}, track ${s.track ? `${s.track.readyState}${s.track.muted ? ' muted' : ''}${s.track.enabled ? '' : ' disabled'}` : 'none'}, display ${s.display ?? '?'}`;
  const systemHeard =
    sysLabel === 'System audio' &&
    audioPort > 0 &&
    sent > 0 &&
    asksAfter > asksBefore &&
    heardAt !== null;
  check(
    'system audio: the System audio source\'s pipeline reaches the ear, and the picker was intercepted',
    systemHeard,
    `label "${sysLabel}", picker intercepted ${asksAfter - asksBefore} time(s), audio port ${audioPort}, ${sent} packets sent; ` +
      `${heardAt !== null ? `heard ${when(heardAt)} after the click` : `not heard in ${TONE_DEADLINE_MS / 1000} s`}, ear reads ${soundHeard.reads}, volume ${Math.round(soundHeard.volume)}; ` +
      `the contexts ran at ${when(tapRanAt)} (tap) and ${when(earRanAt)} (ear), their clocks first moved at ${when(tapTickedAt)} (tap) and ${when(earTickedAt)} (ear); ` +
      `at the end ${clocks(soundHeard)}; ` +
      `at ${atOldMoment ? when(atOldMoment.t) : 'the old moment (not reached)'}, where the line used to read: ${atOldMoment ? `tap ${atOldMoment.tap}, ear ${atOldMoment.ear}, volume ${Math.round(atOldMoment.volume)}, ${clocks(atOldMoment)}` : 'heard before it'}` +
      (probe ? `; a fresh context then: ${probe.error ? `threw ${probe.error}` : `${probe.state}, clock moved ${secs(probe.clock)} in 1 s, oscillator peak ${probe.peak} of 127, ${probe.sampleRate} Hz, output latency ${secs(probe.outputLatency)}`}` : ''),
  );
}
