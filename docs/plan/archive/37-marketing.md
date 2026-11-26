# Archive: 37. Marketing and social media: who hears about it, where, and how we know (asked 2026-10-29)

The closed items of [`docs/plan/37-marketing.md`](../37-marketing.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## Items

- ~~**37k. A press page.**~~ Shipped 2026-11-01 (#666): `chromaglass.art/press`, checked by `npm run presskit`; story in `docs/plan-shipped.md` §37k.

### The album show: a whole album every week (added 2026-10-29)

- **37x-4a. The research.** *(shipped 2026-10-29.)* `docs/live-show.md`: which platforms
  take a stream from software (YouTube, Twitch, Facebook, Kick, X with Premium; Instagram
  and TikTok with a key per stream, 9:16 and a follower count; LinkedIn through a tool,
  150 followers), that simulcasting is allowed everywhere since Twitch dropped its rule
  in 2023, and the three designs weighed. YouTube's first enable takes up to 24 hours,
  so the owner enables it before the first show.
- **37x-4b. The encoder and one destination.** *(shipped 2026-10-29, #577.)* `desktop/live.js`
  (the RTMPS client), `desktop/rtmp.js` (the wire), `desktop/keys.js` (the key store),
  `src/lib/liveStream.ts` (the wall-clock encoder), `window.__cgLive` in the Mac app, and
  `npm run live` against `scripts/rtmpListener.mjs`; story in `docs/plan-shipped.md` §37x-4b.
  Found building it, for the parts after:
  - *The picture is the plate's canvas.* `__cgLive` streams `#liquid-canvas`, the laptop's
    plate, not the projector's pass (§31's Wall output, the mixer's stack). A show with a
    projector up should be able to stream what the wall shows; 37x-4d takes it, as a
    choice in the panel (shipped: 37x-4d-1). Found in 37x-4c: the Wall output runs in the projector's own
    window (`CastDisplay`'s `#stage-canvas`) and carries the wall's keystone, masks and
    warp, which on a stream would be a skewed picture; so the source to offer is the
    mixer's stack before the projector's geometry, not the wall's canvas itself.
  - *The sound's clock, on the Mac.* The stream stamps the audio on the track's own
    timestamps, which Chromium puts on `performance.now()`'s clock (measured, the lab);
    the Mac's system-audio path (#550) schedules each captured chunk into a context 5 to
    60 ms after it was heard, so the stream's sound may sit that far behind the plate's
    reaction to it. Measure on the Mac with a clap on camera (judging §92), and if it
    shows, stamp the tap's chunks with the time they were captured.
  - *The encoder's own keyframes.* OpenH264 (the lab) starts a new group whenever the
    picture changes a lot, on top of the one asked for every two seconds; the check allows
    it. VideoToolbox should not; `npm run live` on the Mac shard says.
  - *The last mark has no room.* (Open, 37x-4b-1.) The keyframe line builds a mark every
    two seconds up to the stream's span, so a run whose frames land on exactly 0..30000
    ms (901 frames, as on #753's lab shard, 2026-11-09) gets a mark at 30000 that is
    the stream's last frame, with no two frames after it, and goes red with every mark
    that has room keyed. Count only the marks with a full two-frame window inside the
    stream (`m + 2 * 1000 / FPS <= lastMs`), and say so above the line.
  - *The app's encoder on GitHub's Mac.* (Open; 37x-4c added the measurement.) On GitHub's macOS runner (a virtual machine with
    no GPU of its own) the packed app encodes 640x360 at 170 ms a frame under every
    WebCodecs hint (`__cgLive.probe()`: no-preference 171, prefer-software 198 ms, hardware
    unsupported), while the lab's Chromium on the same kind of machine holds 30 fps at
    that size (`npm run live -- --codec aac`, the fifth shard). Electron's build reaches a
    different encoder than Chromium's there; find which (`chrome://gpu`'s video encode
    line in the app, `media_use_openh264` in Electron's build args). The app's check
    line wants the frames the probe says the machine can make, so the runner measures
    the bridge, not its own encoder; judging §92 measures the real rate on the owner's Mac.
    37x-4c's probe also times the default and software encoders on frames made from a
    buffer of pixels, no canvas: in the cloud's Electron under xvfb the canvas-made frames
    cost 11 to 17 ms a frame and buffer-made ones 3.6 to 4.7, so the canvas's readback is
    a cost of its own; the next Mac run's `desktop` line says whether it is the 171 ms.
  - *Dropping on a slow upload is counted, not yet measured.* (Shipped in 37x-4c:
    `npm run livedrop`.)
- **37x-4c-2. YouTube's acknowledgements are too coarse to judge by.** *(shipped
  2026-11-08; story in `docs/plan-shipped.md` §37x-4c-2.)*
- **37x-4d. The Live Show panel and the Pro gate.** *(shipped 2026-10-30.)* The Live
  Show panel in the Mac app (`src/components/LiveShowPanel.tsx`, one controller for it,
  the console and the phone in `src/lib/liveShow.ts`), the phone remote's live chip and
  two-tap Stop on Draw and Controls, `npm run liveshow`; story in `docs/plan-shipped.md`
  §37x-4d. Found building it, for the parts after:
  - ~~*37x-4d-1. Stream the mixer's stack, not only the laptop's plate.*~~ *(shipped
    #667; story in `docs/plan-shipped.md` §37x-4d-1.)* `data-testid="live-source"`
    (`plate` default, `stack` for the mixer's stack drawn square without the wall's geometry
    in `src/gpu/output.ts` and tapped inside the frame task via `liveFrameSize('stack')` /
    `tapLiveFrame('stack', ...)`); `stack` leaves `--owed` in `scripts/checks.json`
    (`npm run liveshow -- --stack` unowed).
  - *37x-4d-6. The stream's frames are black.* *(shipped 2026-10-31.)* The frame task
    hands the encoder each picture it draws (`lib/liveFrame.ts`, `lib/frameTaps.ts`);
    story in `docs/plan-shipped.md` §37x-4d-6. The Mixer stack's draw (37x-4d-1) calls
    `tapLiveFrame('stack', canvas)` from the same task and the panel starts the encoder
    with `frames: 'stack'`; it skips its draw unless `liveFrameSize('stack')` is set.
  - *37x-4d-7. The moving line read a looping bar on two frames.* *(shipped 2026-11-09.)*
    `npm run liveshow -- --stack`'s moving line now reads the bar on every frame decoded
    (`barMoves`, `scripts/liveshowstack.mjs`) and proves its judgement on made-up streams
    first; story in `docs/plan-shipped.md` §37x-4d-7.
  - *37x-4d-2. The panel is not on a shipped tab.* The tabs are the owner's, kept in the
    account (`deskTabs.ts`), so a new entry in Perform's shipped layout would reach only a
    new desk; and it would sit on the website's Perform too, where it cannot stream. It
    is one press away in + Panel (search "live"). If the owner wants it on Perform by
    default, the shipped layout gains it only when `nativeLive()` is there.
  - *37x-4d-3. The upload is measured by the last stream.* There is no server of ours to
    time an upload against, so the panel's warning reads what the last stream showed:
    the sum the destinations acknowledged while all kept up (enough for that much), and
    the sum while one was a second behind by the server's own count (all the link
    carries). A Test to one unlisted destination proves only its own rate: the advice
    says "never filled the link" rather than guess. A destination that does not
    acknowledge (37x-4c's item) cannot fill the measure either.
  - *37x-4d-4. The Mac app's narrow window.* Narrowed under the desks' width (1024) the
    app leaves the desks and the Live Show panel with them: a stream running there keeps
    running, unseen. It goes to the floating overlay (`overlayUp` in `usePhoneLayout`),
    not the phone layout as this item first said: `wantsPhoneLayout` wants a coarse
    pointer and a short side under 600, which a Mac's window has not (found writing the
    check, 2026-11-08). The fix is the remote's `LiveRemoteChip` on that overlay, and on
    `PhonePlay` too should the app ever be opened at `/play`. Check written first, red
    on main: `npm run liveshow -- --owed=narrow` (`scripts/liveshownarrow.mjs`): at
    900x800 the chip on screen saying Live with its clock, its first tap only asking;
    and, holding on main, the stream still live back at full width.
  - *37x-4d-5. Instagram's and TikTok's keys are per stream.* The panel keeps a key until
    it is replaced (New key), which suits YouTube, Twitch and Kick. For the two that
    change it each stream, the row could clear the key when a stream ends and say so,
    rather than fail the next show with last week's key.
- **37x-4g. Sound and picture judged on one clock dropped a healthy stream** *(shipped
  2026-11-09; story in docs/plan-shipped.md §37x-4g.)*
  - *37x-4g-1. The audio encoder's queue has no bound.* Video skips a frame at three
    waiting; `audio.encode()` is never gated, so a loaded Mac can emit AAC seconds late
    in write order. Likely source of the rehearsal's skew; the new `audioQueue` and
    "sound X s late" readouts will say. Bound it (drop or skip the oldest audio, never
    the clock) once a rehearsal shows the number.
  - *37x-4g-2. Did 37x-4c-3's 256 KB window share the bug?* Its listener never recovered
    in `npm run livedrop`; the old readout compared against a delivered timestamp that
    went stale across a drop, the same five-runs trap this fix found. Re-run it on main.
- **37x-4h. The stream looked softer and flatter than the app** *(shipped 2026-11-10;
  story in docs/plan-shipped.md §37x-4h.)*
  - *37x-4h-1. YouTube held to Twitch's rate when both are on.* One landscape encode
    feeds every landscape destination, so it goes at the least any takes: YouTube and
    Twitch together both get 6 Mb/s. A second landscape encode for the uncapped ones
    costs a second encoder and readback; measure the Mac's headroom at 1080p60 first.
  - *37x-4h-2. The rate does not follow the link on air.* It is fitted at Go to the last
    stream's ceiling; a link that sags mid-show falls behind and the session drops video
    until the next keyframe. Lower the encoder's rate on air (`VideoEncoder.configure`
    with a new bitrate) when a destination is a second behind on the server's count,
    and raise it back when it keeps up.
  - ~~*37x-4h-5*~~ shipped 2026-11-14: `npm run live`'s "the plate kept redrawing under
    the stream" asks for a redraw in every sixth of the stream and no gap past three of
    the plate's typical ones, not SECONDS / 2 redraws: the 700 ms timer quantizes the
    count to 21 or 14 by the runner's speed, and the bar of 15 sat between (main red at
    14 on 6b241cb; a plate stopped at 12 s reads 3 of 6 sixths, longest gap 16.5 s).
  - *37x-4h-4. The 2 Mb/s floor is too low for 1080p60.* Fitted to a short link the
    encode can drop to 2 Mb/s at 1920x1080 60 fps; on the rate check's moving picture
    openh264 asked for 2 Mb/s made 4.26 (the check-skeptic's run), past the link it was
    fitted to. Below about a third of the size's rate, step the encode down to 720p (or
    30 fps) instead of starving it; measure the plate's own floor first, which is
    smoother than the check's picture.
  - *37x-4h-3. Owed on the Mac.* The rate lines on the Mac shard (VideoToolbox's CBR,
    not openh264's) on the first run; a film of the stream before and after on YouTube;
    the first 1080p60 stream needs about 17 Mb/s of upload for one destination, so its
    upload line says whether the link held.
- **37x-10e. The check's arms on the thin gap too.** *(shipped 2026-11-09 with
  37x-10g: `npm run inktitle -- --thin`.)*
- **37x-10d. Send `pour-text` into 37x-10's ink.** *(shipped 2026-11-08 with 37x-10;
  undone by 37x-10m: `pour-text` is the caption now.)* Today the
  words go through `pourText`, which adds them to the dye in one pour and leaves
  the look's own flow to carry them off: real dye, really advected, but with no wash,
  so on a still look the letters stay readable longer than 37x-10's sweep allows.
  When 37x-10's `pourInk` and wash land, a `pour-text` message goes through them
  (rows as its two lines, the colour as `inkTitleColor`), and the live conductor's
  cue at 0 s of each track gets the sweep the owner asked for.
