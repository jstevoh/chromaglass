# 37. Marketing and social media: what shipped

How §37's shipped items were found, built and measured. The open work is in
[`docs/plan/37-marketing.md`](../plan/37-marketing.md), where each keeps a one-line stub naming
its id here. Its first stories shipped after the archive was split (19m-3), so they stand
under that heading alone.

## Shipped after the split

### 37x-4c. Several destinations, and a vertical one

  - **37x-4c. Several destinations, and a vertical one (shipped 2026-10-30).** The owner
    wants the show "on all of the popular streaming platforms" at once. The page's encoder
    (`src/lib/liveStream.ts`) now makes one video encode per output, a landscape one for
    YouTube, Twitch, Facebook, Kick and X and, when a destination asks for portrait, a
    second of the plate's middle at 720x1280 for Instagram and TikTok (cropped, never
    stretched: 37x-4b squeezed a 1024x653 window into 16:9, which makes the round dish an
    oval; `liveCrop`), each with its own keyframe schedule and its own skips, and one audio
    encode for all. `desktop/liveSession.js` writes each output's packets to every socket
    that carries it (two landscape destinations: one encode, the same bytes twice, checked
    byte for byte), connects them side by side and goes live on the first yes, retries one
    it could not reach or lost after 2, 4, 8, 15 then every 30 s with the key still held in
    the main process, joining at the next keyframe on a clock from zero (as OBS restarts
    each connection's clock), and never asks again where the server refused. The client
    (`desktop/live.js`) measures how far behind it is in seconds of stream, not bytes: the
    newest timestamp written against the newest the server has acknowledged (it asks every
    256 KB; a throttled reader on loopback showed the kernel holding 4.7 MB, six seconds of
    a 6 Mbps stream, before node's write buffer held a byte), drops video past 2 s until it
    is back under 1 s at a keyframe, never audio, and reports kbps out, seconds behind and
    whose word that is, frames dropped and drop runs; the session adds reconnects and the
    time to the next try. `__cgLive.start({ destinations: [{ name, url, keyName,
    orientation }] })` in the Mac app. Checks: `npm run livedrop` (node: five destinations,
    a 5 Mbps made-up stream with numbered packets; the throttled one drops 247 of 570
    frames in one run, its readout within 0.02 s of the truth and its kbps 1211 against the
    throttle's 1200, every frame after a gap a keyframe, all 950 audio packets through, the
    last three seconds complete after; the one beside it all 570; a dropped connection
    back in 0.5 s at a keyframe from 0 ms; the refused key asked once; a server that never
    acknowledges judged on the socket), `npm run live` to three destinations (32 lines: the
    second landscape byte-identical, the portrait at 360x640 and 30.0 fps, decoded, the
    flash in its first frame after, 2.04 times the landscape's brightness between flashes
    as a crop of the middle should be), and the Mac app's `desktop` line streaming a
    landscape and a portrait destination through its IPC (119 and 119 frames in 4 s), its
    probe now also timing encoders on buffer-made frames (37x-4b's found item on GitHub's
    Mac). The phone's part (the Play screen's live state and Stop) is 37x-4d's, with the
    panel; nothing here is on a screen yet.

### 37x-4b. The encoder and one destination (#577)

  - **37x-4b. The encoder and one destination (shipped 2026-10-29).** The owner: "open my mac
    app ... configure the live show. I can then stream it on all of the popular streaming
    platforms". The app now encodes and speaks RTMPS itself, as `docs/live-show.md` chose:
    `src/lib/liveStream.ts` takes a frame from the plate's canvas every 1/fps of wall time
    (not `captureStream`, which sends nothing while the plate is still) and the show's own
    `MediaStream` through a `MediaStreamTrackProcessor`, encodes H.264 (`latencyMode:
    realtime`, a keyframe every 2 s) and AAC (Opus where a machine has no AAC encoder),
    stamps both on one clock (the audio on the track's timestamps, which Chromium puts on
    `performance.now()`'s clock: an arrival-anchored draft read 17–22 ms early), and hands
    each packet over IPC. `desktop/rtmp.js` is the wire (the handshake, chunks with a full
    header on each message, AMF0, FLV tag bodies); `desktop/live.js` the client (connect,
    releaseStream, FCPublish, createStream, publish, onMetaData, the sequence headers, acks
    when the server asks, pings answered, a server's error ending the stream with its words
    and the key cut from them, video dropped to the next keyframe past 1.5 MB behind, never
    audio); `desktop/keys.js` the key store (Electron's `safeStorage`, the login Keychain's
    key over a file of ciphertext; the `security` command was set aside because it takes the
    password on its command line). The page names a key; a packed app reads one from the
    store only. Headless: `window.__cgLive.start({ url, keyName })`, `stop()`, `state()`,
    `keys.set/list/remove` in the Mac app, Pro only (`canUseProFeature`), installed from
    `useAudioAnalyzer` where the show's sound and the plate meet.
    *Measured:* `npm run live` (30 s of the lab's plate and a tone to
    `scripts/rtmpListener.mjs`, a pure-node RTMP server that records FLV; shards `lab` and
    `fifth`): the server took the stream and its onMetaData; the AVC and audio headers first;
    30.0 s of audio with no gap over 21 ms (bar 100 ms); 30.0 fps over 901 frames (bar 24–31.5),
    none out of order, none over 3 frames apart; 22 keyframes, the first at 0, never over 1.4 s
    apart (bar 2.5 s); Chromium decodes every frame and every packet; five flashes against
    five clicks, the picture 36 ms after the sound every time (bar 0..43 ms: a flash is seen at
    the next frame taken, 33 ms, plus a 10 ms audio block), where the arrival-anchored draft
    read 44–55 and the output-time pairing 59–79; one ack and one pong; a refused key fails
    with `NetStream.Publish.BadName` and no key in the message; the key store lists names and
    not keys, the file holds no plaintext, no encryption refuses. `npm run desktop` gained a
    `live` line: the page's stream through the app's IPC to a listener, 72 frames in 4 s
    under software WebGPU (50 skipped, as the encoder is meant to when a frame is slow to
    take), the key kept by name where the machine has a keychain.
