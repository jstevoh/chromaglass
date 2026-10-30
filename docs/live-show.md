# The live show: where the Mac app can stream, and how

PLAN §37x-4. Researched 2026-10-29 for the owner's weekly album show: the album plays
from a streaming app, the Mac app hears it as system audio (#550), and the app sends the
plate and that audio out live. This page is the research; the build is in the plan
(37x-4a to 37x-4e) and, as each part ships, in `docs/guide.md`.

Most of what follows came from the platforms' own help pages where they could be read and
from current third-party guides where they could not (Twitch's, TikTok's and Instagram's
help pages render only in a browser). Rules at these companies move: check the help page
on the day before relying on a number.

## What every platform takes

Every platform below takes the same thing: an **RTMP or RTMPS push** of **H.264 video and
AAC audio** in an FLV stream, to a server URL plus a secret **stream key**. That is what OBS
sends, and what the Mac app will send. Common encoder settings across them: H.264 (High
profile, a keyframe every 2 seconds, constant bitrate), AAC-LC stereo at 128 to 192 kbps,
44.1 or 48 kHz. Bitrates: YouTube asks 6 Mbps minimum and recommends about 17 Mbps for
1080p60; the others sit in 4 to 8 Mbps for 1080p; and the upload link needs about 20%
headroom over the sum of every destination's bitrate.

| Platform | Takes a stream from software? | Needs | Orientation | Key |
|---|---|---|---|---|
| **YouTube** | Yes: `rtmps://a.rtmps.youtube.com/live2` (RTMPS preferred). An API (`liveStreams`, `liveBroadcasts.bind`, `transition`) can make the broadcast and read its key. | A verified channel, no live restriction in 90 days, 16+. **Enabling live for the first time takes up to 24 hours**: enable it now, days before the first show. | 16:9 | Persistent per stream resource; the API makes one per broadcast or reuses one. |
| **Twitch** | Yes: RTMPS ingests by region, a persistent key from the Creator Dashboard. | An account. | 16:9 | Persistent, resettable. |
| **Facebook** | Yes: Live Producer's "Streaming software" gives `rtmps://live-api-s.facebook.com:443/rtmp/` and a key; to a profile, a Page, a group or an event. | An account; a Page for a business. | 16:9 (9:16 shows with bars) | Per stream unless "Persistent stream key" is on. |
| **Instagram** | Yes, through **Live Producer** on the desktop site: a key and URL per stream. | A Professional account (Creator or Business); some guides say a follower minimum (1,000 is quoted), unconfirmed on Meta's page. The browser tab must stay open; the key refreshes every stream. | **9:16** (720×1280 recommended) | New each stream. |
| **TikTok** | Yes, for accounts that have **LIVE access with a stream key** ("Server" in the LIVE Center; LIVE Studio is Windows-only). | 18+ and, in most regions, **1,000 followers**; the key is not given to every eligible account and is region-dependent. | **9:16** | Per stream in most accounts. |
| **X** | Yes: Live Studio (in Creator Studio, the successor of Media Studio Producer) gives an RTMP URL and key. | **X Premium** (Live Studio is a Premium beta). | 16:9 | Per livestream. |
| **Kick** | Yes: the Creator Dashboard's Stream page gives an RTMPS URL (per account and region) and a key. | An account. | 16:9 | Persistent, resettable. |
| **LinkedIn** | Only through a tool: LinkedIn itself cannot stream. Its preferred partners (Restream, StreamYard, Switcher, SocialLive) or a custom RTMP stream key from the event. | A profile or Page with **more than 150 followers or connections, 30 days old**, in good standing; the first event from a tool triggers the eligibility review. | 16:9 | Per event. |

So the ones the app can reach with one key pasted once are YouTube, Twitch, Facebook,
Kick and X. Instagram and TikTok take a stream too, but each needs its key fetched on the
day (a browser tab for Instagram), 9:16 video, and a follower count the owner may not
have yet.

## Simulcasting: allowed, and how

- **Allowed by the platforms.** Twitch dropped its exclusivity rule in October 2023:
  anyone may simulcast to any service, provided the Twitch stream is of the same quality,
  the stream does not send viewers to the other services (no third-party links or
  overlays in the stream), and the streamer has no exclusivity contract. YouTube,
  Facebook, Kick, X and LinkedIn do not forbid it; Instagram says it is "not natively
  supported" but lets a simulcasting tool add it as a custom RTMP destination.
- **Content ID** (YouTube) and the equivalents at Facebook and TikTok listen during a
  live stream of a popular album and can mute or cut it (§37x-6). An artist who agreed
  (§37x-2) can whitelist the channel; the cleared-music channel is not at risk.
- **Two ways to fan out.** (1) *From the Mac:* one encode, the same packets written to N
  sockets. The cost is upload bandwidth, N × the bitrate (three 1080p destinations at
  6 Mbps need about 22 Mbps of upload), and nothing else: the encode is done once. A 9:16
  destination is a second, smaller encode of a vertical crop. (2) *Through a relay* such as
  Restream (free for two destinations with a watermark, $19 a month for more): one stream
  up, the relay fans out, and it also holds the Instagram and TikTok dance. The relay adds
  a second to latency and a monthly cost, and the owner's keys sit at a third party. The
  app does (1); (2) stays as an option the panel can take by treating the relay as one
  more RTMP destination.

## How the app does it

Three designs were weighed on 2026-10-29. The app **encodes in process and speaks RTMPS
itself**:

- *A bundled `ffmpeg`* (what §37x-4 first said) would push with its `tee` muxer and
  `onfail=ignore`. It costs about 80 MB in the installer, an LGPL notice and a second
  process to babysit, and the plate's frames would cross a pipe uncompressed at 1080p60
  (about 370 MB/s). Rejected for that; kept as the fallback if the in-process encoder
  cannot hold the rate.
- *Encode in process.* Record already encodes the plate as H.264 and AAC with WebCodecs
  (`lib/render.ts`: `VideoEncoder` on VideoToolbox, `AudioEncoder` on AudioToolbox), the
  same frames and the same audio the show hears. The live path reuses those encoders and
  hands each encoded packet to the Mac app's main process, which wraps it in FLV tags and
  RTMP chunks and writes it to one TLS socket per destination (`desktop/live.js`). No
  binary, no pipe of raw frames, one encode for every 16:9 destination, and a per-socket
  health readout (bytes behind, dropped frames) for free. Chosen.
- *A relay* (Restream): see above; one more destination, not the design.

What the app keeps where: stream keys in the **macOS Keychain** (`desktop/keys.js`,
`security` by the app's bundle id), never in `show.json`, the log or the crash report; the
destination list (name, server, orientation) in userData. The Live Show panel is the Mac
app's and Pro only (§23's tier gates); the phone's Play screen shows live state and can
stop the stream (§37x-4's phone version).

## What the owner does once

1. YouTube: **enable live streaming now** (YouTube Studio → Go live); the first enable can
   take 24 hours. Verify the channel (a phone number) if it is not.
2. Decide the destinations for the weekly show: YouTube alone for the album show, or
   YouTube + Twitch + Kick + Facebook for the cleared-music shows. Instagram and TikTok
   wait on their follower counts.
3. Test streams are **unlisted** YouTube broadcasts; the first public one is the owner's.

## What is built (37x-4b, 2026-10-29)

The encoder and its destinations, with no panel yet (37x-4d): in the Mac app's console,

```js
await __cgLive.keys.set('youtube', '<the stream key from YouTube Studio>');   // once; kept in the keychain store
await __cgLive.start({ url: 'rtmps://a.rtmps.youtube.com/live2', keyName: 'youtube', width: 1920, height: 1080, fps: 30 });
await __cgLive.state();   // frames taken and skipped, packets, the client's bytes behind, drops, acks, the server's words
await __cgLive.stop();
```

Several at once, and a portrait one (37x-4c):

```js
await __cgLive.start({ destinations: [
  { name: 'youtube', url: 'rtmps://a.rtmps.youtube.com/live2', keyName: 'youtube' },
  { name: 'twitch', url: 'rtmps://live.twitch.tv/app', keyName: 'twitch' },
  { name: 'tiktok', url: '<the server URL TikTok gives>', keyName: 'tiktok', orientation: 'portrait' },
] });
(await __cgLive.state()).transport.destinations;   // per destination: kbps, secondsBehind, videoDropped, reconnects, phase
```

`src/lib/liveStream.ts` encodes the plate's canvas and the sound the show hears (whichever
source is open: a song, the microphone, the Mac's system audio); `desktop/live.js` speaks
RTMPS from the main process; `desktop/keys.js` keeps the keys (Electron's `safeStorage`
through the login Keychain; a key is named by the page and never read by it); `npm run live`
measures the stream against a local RTMP server (`scripts/rtmpListener.mjs`, which also runs
by hand: `node scripts/rtmpListener.mjs --port 1935 --out scratch/stream.flv` records a stream
from the app or from OBS as a `.flv`). Pro only. What the stream is: 1080p by default at the
frame rate asked, H.264 High with a keyframe every two seconds, AAC at 160 kbps; the panel and the phone's Stop are 37x-4d.

Several destinations (37x-4c): the landscape encode is made once and its packets written to
every landscape destination's socket; a portrait destination adds one more encode, 720x1280
by default, of the middle of the plate (cropped, never squeezed; `portrait.fit: 'contain'`
shows all of it with black above and below), and the sound is one encode for all.
`desktop/liveSession.js` keeps each connection on its own: one that cannot keep up drops
its own video to the next keyframe once it is two seconds of stream behind (judged on the
server's acknowledgements of what it has received, which the client asks for every 256
KB; on the socket's own buffer if a server never acknowledges, which sees a slow link only
once the kernel's buffers are full, seconds late: PLAN 37x-4c), and sends again once it is
back under one; audio is never dropped. A lost connection is tried again after 2, 4, 8, 15
then every 30 seconds with the key it was started with, and joins at the next keyframe; a
refused key is not asked again. The show starts when the first destination is live and fails
only when none is. `npm run livedrop` measures all of it against throttled, hanging-up and
refusing listeners.
