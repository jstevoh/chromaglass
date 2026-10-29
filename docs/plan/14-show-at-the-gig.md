# 14. The show at the gig: hearing, timing, speed and the picture on the wall

This section is in 3 files, cut between items: `14-show-at-the-gig.md`, `14-show-at-the-gig-2.md`, `14-show-at-the-gig-3.md`.

Asked on 2026-09-27: "What else am I missing in plan.md? What other efficiency,
latency, and quality updates would help us". The code was read for it the same day,
four ways at once (what a frame costs, how late the plate answers, what the wall
shows, what stops a set), against this plan, `docs/roadmap.md`,
`docs/stability-plan.md`, `docs/webgpu-plan.md`, `docs/filters-plan.md` and
`docs/rig-plan.md`, so that nothing below is already written somewhere else. Items have
shipped since; the running order says which. Each item says what the code does now, with where, whether that is read in
the code or inferred from how a browser behaves, and what would measure a fix. The
order is what a performer or an audience would notice first.

What is already handled and so is not here: the wake lock (re-taken on every return
to the page, and held by the projector window too); the picture when the show window
is covered (the projector window drives the frames); fades, the dimmer and the
gamepad on timers rather than animation frames; MIDI unplugged and plugged back in;
the phone link's reconnect; readbacks that skip rather than wait; splats landing in
the frame they were made; dither before every 8-bit screen; the plate's bicubic
upsample. Display-P3 and HDR are H4 in `docs/roadmap.md`, linear-light blending is
deferred in `docs/webgpu-plan.md`, and the soft edge between projectors is rig R3.

## 14a. The show goes deaf when its window is hidden

**Shipped** (#191): the ear keeps hearing behind the wall, and says when it is deaf (`npm run ears`). How it was found, built and measured is in [`docs/plan-shipped/14-show-at-the-gig.md`](../plan-shipped/14-show-at-the-gig.md), under the same number.

*Still owed:* the owner's look on the Mac, covering the show window with another app
for thirty seconds and reading `chromaglassCastState().ear.reads` before and after
(about sixty ticks a second with no wall, and the desk not saying "not hearing").
The worker's tick is chosen because a hidden page's own timers are held to about one
a second; that is Chrome's documented behaviour and cannot be shown headless.

*Found along the way, not done:* the look fade, the dimmer, the drift glides and the
simulated band run on the page's own timers (`showInterval`, `simulatedMusic.ts`),
moved there so a covered window would not freeze them. A hidden page's timers are
held to about one a second (much less after five minutes hidden), so a Go fired from
a MIDI pad while the show window is covered steps through its crossfade a second at a
time instead of gliding. The same worker tick could drive them.

## 14b. With the wall up, the plate may draw twice a refresh and the governor cannot see it

**Shipped** (#203, #236): one draw a refresh with the wall up, and on a busy machine the wall no longer costs the show its own frames (`npm run wall`). How it was found, built and measured is in [`docs/plan-shipped/14-show-at-the-gig.md`](../plan-shipped/14-show-at-the-gig.md), under the same number.

*Still owed:* the owner's look with a real projector on its own display. And stepping down under a wall at all: it is new behaviour, from 14b and
14c together (the governor fed real intervals now, and a ladder built from the stage),
and nobody has seen it happen on the Mac.

*Found along the way, not done:*

- *On a busy machine the wall repeats frames the show missed.* The gate still works to
  the median gap of a clock, which a window missing refreshes reads as two or three, so
  an ask in a refresh the show missed is turned down when it comes under 1.2 refreshes
  after the last draw. `npm run wall` on its busy machine three quarters of a refresh
  behind drew 35.0 for 44.0 slots served (0.8), and the Mac runs 0.68 to 0.91 of the
  slots. The floor does
  not catch it (each window still gets its own frames) and the ceiling allows it. Taking
  the refresh from the shortest gap that recurs, as `wall` measures the display,
  brings it to 0.90 to 0.95 in the arithmetic, at the cost of up to a quarter more draws on a
  machine already short of time; whether the wall's smoothness is worth that is the
  owner's call. Measure: the busy phase's draws against its slots.
- *A 120 Hz laptop with a 60 Hz projector draws 120 a second.* The gate works to the
  faster display so that neither window gets fewer frames than it would alone, which
  keeps the desk at 120 on a ProMotion screen; but every draw carries the mirror
  copy, and the wall shows only every other one. Pacing to the projector while the
  show window is not what the audience is watching would halve that work. Measure:
  the arithmetic case 120/60 with the draws counted against the wall's refresh.
- *The wall's older "asking for one draws one" line cannot fail on the ask.* It asks
  thirty times with the show's own frames running and counts every frame drawn, so
  the show's own clock alone passes it (and did before this: 60 a second is over its
  twenty in half a second). The new "covered, every ask the wall makes draws" line is
  the one that measures an ask; the older one should be run covered, as that one is.
- *The full app on software WebGPU loses its device every few seconds* in a cloud
  session ("A valid external Instance reference no longer exists", after about sixty
  frames, then some six seconds to recover), which is why the app's pixel checks
  cannot run there even with `PW_WEBGPU=1`, not only its readbacks. Worth knowing
  before anyone tries to make them.

## 14c. The projector's resolution comes from the laptop's pixel ratio

**Shipped** (#194): a wall's pixels are the wall's, not the laptop's ratio (`npm run rungs`). How it was found, built and measured is in [`docs/plan-shipped/14-show-at-the-gig.md`](../plan-shipped/14-show-at-the-gig.md), under the same number.

*Still owed, on the Mac:* whether 1024² holds on a 1080p wall. 2.07 Mpx sits between
what was measured to hold (1.0) and to fail (4.1), so what `npm run ladder` with a
stage should show is the canvas at 1920×1080 on the top three rungs, 1440×810 and
960×540 below them, whatever the laptop's ratio, and 1024² at 1920×1080 at or near 30
fps at thirty steps. If it does not hold, the gate comes down to what does. And the
owner's look at a 0.75 rung on a real projector through the 'high' mirror.

*Found along the way, not done:*
- `npm run ladder` cannot attach a stage. It opens one page, and a wall window opened
  from it would share that page's device scale factor, so a Retina laptop driving a
  1x projector cannot be staged in one browser context. A `?stage=1920x1080`
  diagnostic knob, like `?dpr=`, calling `setStage` would let it measure the wall.
- A 4K wall opens at 512² on all 8.3 Mpx, as it did from a 1x laptop before. The start
  rule weighs the GPU class and not the stage's pixels; the governor finds the 0.75
  rung within seconds, but a wall above 1920×1200 could open there.
- The readout says "512² · 1.0x" on a wall too, where 1.0 is now a share of the wall
  rather than a pixel ratio, and the bench's `dpr` reads the same number. On a stage it
  should say so ("of the wall").
- A wall coming or going builds a new governor, which forgets a step rate it had given
  up and waits out its settling period again, and forgets rungs a solver that would not
  start had marked failed (only running out of memory sets the cap it keeps).
- `PW_WEBGPU=1 npm run phone` went red once in two runs on "spreading them zooms in by
  as much as they spread" (3.00 times of 3.40): the zoom was read before the pinch's
  last move landed, on a software plate a few frames a second. Green on the rerun; the
  phone's code was not touched here.

## 14d. The beat clock hears a smoothed bass level, not the kick

**Shipped** (#199): the clock hears the kick's onset, by its time (`npm run kicks`); counting heard kicks in the app on the Mac is 10.4's. How it was found, built and measured is in [`docs/plan-shipped/14-show-at-the-gig.md`](../plan-shipped/14-show-at-the-gig.md), under the same number.

## 14e. The picture and the room disagree about when the kick is

**Read in the code; the output delays are inferred.**

- *The app's own songs* are analysed from `captureStream()`, before the output
  device, and nothing reads `outputLatency`, `baseLatency` or `getOutputTimestamp`.
  On wired output that roughly cancels the analysis delay; on Bluetooth or AirPlay
  (150–300 ms) the plate leads the room by that much, and a locked kick adds Beat
  Lead on top. For a shelf song the precomputed `SongEar` (`songTrack.ts`, used today
  only by Render) could be read at `currentTime − outputLatency`, with no analysis
  delay at all.
- *One Beat Lead for every tempo source.* `beatLead` is described as the
  microphone's latency, but the clock applies it the same to MIDI clock and a tapped
  tempo, which have almost none. Switching from the mic to the desk's clock moves
  every kick by the mic's delay. Split it into the rig's display lag and a measured
  microphone delay, calibrated by tapping along or by a click played out and heard
  back.
- *MIDI clock* is timed with `performance.now()` in the handler (`useMidi.ts`)
  rather than the message's own `timeStamp`, so a slow frame delays the beat; and
  without a Start message, or after a 400 ms dropout, the pulse count starts on
  whichever pulse came first, up to half a beat off. Use `timeStamp`, and let an
  audio onset or a tap set the phase when no Start has come.

*Measure:* `outputLatency` in `chromaglassDebug()`; a unit test with jittered MIDI
timestamps next to `npm run timecode`; a speaker-to-microphone click on the Mac next
to `film`.

## 14f. Sound and MIDI reach the plate a frame late, through a whole-app render

**Partly shipped** (#211 for the sound; the MIDI fader on 2026-10-11): the ear keeps every reading in a ref, tells React ten times a second, and the plate hears a reading taken on its own frame; a fader is read by the plate on its frame and shown on the desk ten times a second (`npm run renders`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped/14-show-at-the-gig.md`](../plan-shipped/14-show-at-the-gig.md), under the same number.

*Shipped so far* (#211, #194): the whole-App render on every reading, what `npm run ears` measured of it, and the fix (the frame loop reads the ear itself, React keeps the meters). Story in `docs/plan-shipped/14-show-at-the-gig.md` §14f (moved 2026-10-29, 19m-2).

Still open here: the reading's two byte arrays are still new each reading (about 60 KB
a second), not reused: a listener may hold an older reading, so reusing them needs the
readers checked first.

## 14g. A knocked cable: the audio interface and the projector do not come back

**Read in the code; what macOS does with the window is inferred.**

- *Audio.* When the input track ends, the handler sets the source to none
  (`track.onended`, `App.tsx`), and `devicechange` only refreshes the list of inputs.
  Plug the interface back in and the plate still plays deaf until someone opens
  Settings; the only sign is "silent" in the desk's audio line. Remember the intended
  input, reopen it when `devicechange` says it is back, and show a loud "input lost"
  on the desk and the phone.
- *Projector.* Automatic sending is skipped while a cast is open (`useProjector.ts`),
  the "send there" chip is hidden while casting, and `openWindow` only focuses a live
  window. Pull the HDMI and push it back, and the projector window has been moved to
  the laptop and out of fullscreen, and the wall shows an empty desktop. On
  `screenschange` while casting, move the window back to the projector; the existing
  next-click refill restores fullscreen.

*Measure:* `npm run shelf` or `npm run music` with a fake stream whose track stops
and comes back; a stubbed `getScreenDetails` with a fake `screenschange` in
`npm run panel`.

## 14h. No internet at the venue

**Read in the code.**

- The service worker saves nothing ahead of time (`install` only calls
  `skipWaiting()`, `public/sw.js`); a built file is cached only once it has been
  fetched. So after a deploy, the projector window's code and the song-map worker may
  not be there offline.
- A failed chunk matches `Failed to fetch` on the error screen, whose `startOver()`
  unregisters every service worker and deletes every cache (`src/main.tsx`): offline,
  that turns one missing file into a site that cannot be reloaded at all.
- The fonts come from Google (`src/index.css`), which the worker does not handle.
  *Found building the Mac app (§13 step 1), 2026-09-27:* they do not, anywhere. The
  `@import url(https://fonts.googleapis.com/…)` comes after `@custom-variant`, and
  CSS ignores an `@import` after any other rule, so the build drops it (`dist/assets`
  has no `googleapis`) and Geist and Geist Mono never load: every page shows the
  fallback fonts. `npm run desktop` saw no request leave the app. Serving the two
  fonts from the site fixes the look and the offline half at once; which one the
  designs were judged in is for the owner's eyes.
- Song ID and lyrics fetch with no timeout (`fingerprint.ts`, `lyrics.ts`), and one
  busy flag gates the local fingerprint match, the song-end detector and the remote
  ID together (`useMusicIntelligence.ts`), so a request that hangs on venue Wi-Fi
  stops songs the local library knows from being recognised.

*Fix:* precache every built file on install; never `startOver()` while
`!navigator.onLine`; serve the fonts from the site; `AbortSignal.timeout(8000)` on
both requests and a busy flag of the local matcher's own. *Measure:* extend
`npm run sw` (load, go offline, open `?cast=true`, reload: the app still draws) and
`npm run music` with a stub that never answers.

## 14i. What the wall shows: clipping, banding and the flash guard

**Read in the code; how visible each is is inferred until the lab renders it.**

- *The projector's gain and gamma work on an 8-bit picture.* The output pass's scene
  is the canvas's format (`output.ts`), and the frame is already dithered to 8 bits
  when `pow(col * gain, gamma)` runs (`wgsl/output.ts`). At gamma 0.5 code 1 becomes
  code 16: dark fades jump off black and the dither grows into speckle. Gain above 1
  clips each channel on its own, so saturated colours change hue (orange at 2.2
  turns yellow). Draw the scene in `rgba16float`, dither once in the output pass, and
  roll off with a shoulder that keeps the hue.
- *The camera caps white at about two thirds of the lamp.* With the camera on, the
  plate draws into the camera's scene in the canvas's 8-bit format (`camera.ts`), so
  the light above 1 the plate leaves unclamped for it is clipped anyway, and
  `aces(col * 1.12)` then peaks at 0.83. Oil on Water, Colorful Cosmos and Sunny Side
  Up use it. `rgba16float` for that scene, and/or an ACES scaled so 1 stays 1.
- *The dye reaches the plate in 8 bits and is then magnified.* `packDye` stores
  `sqrt(d/8)` in `rgba8unorm` (`wgsl/pack.ts`), and each texel covers 5.6 screen pixels
  at 512² on 1080p and 11 at 4K, with the closeup multiplying thin-dye contrast about
  ten times. Bicubic smooths between texels but cannot put the lost levels back, so
  slow gradients can terrace. `docs/webgpu-plan.md` calls it "probably gone"; nothing
  measures it. Sample the float fields or pack to `rgba16float`.
- *The flash guard reads screen values, not light.* `luma()` in `wgsl/probe.ts`
  weights the canvas's encoded values, while the guard's thresholds are relative
  luminance, which is defined on linear light. A strobe between 0.85 and 0.95 reads as
  0.08, under the 0.10 flash step, though in light it is 0.16, so bright strobes go
  uncounted; a kick from black to 0.3 reads 0.3 but is 0.07, so dark shows are dimmed
  for nothing. This is a safety item: decode to linear before the weights.
- *Keystone and corner pins* resample the whole frame bilinearly at the same size
  (`output.ts`), which softens by up to half a pixel and turns pixel-scale grain into
  a fixed pattern. Catmull-Rom (the plate's `textureBicubic`) and the grain after the
  warp.

*Measure:* lab ramps through the output pass at gain 2.2 and gamma 0.6 (largest step
between neighbouring codes, hue drift on colour patches); a flat white plate through
the camera (at least 0.97); a radial dye ramp flat and in the closeup (distinct levels,
widest flat run); flat 0.85/0.95 and 0/0.3 frames through the probe and into
`npm run wall`'s traces; a one-pixel grating through a 5 % keystone.

## 14j. Heat, battery and frames nobody sees

**Read in the code; the thermal behaviour is inferred.**

- *No frame-rate cap.* The loop draws on every animation frame and the readback runs
  in each, so a 120 Hz ProMotion MacBook, a 90/120 Hz Android phone or a 144 Hz
  laptop pays for 120–144 draws a second of a liquid that steps at 60 or 30. Cap the
  draw rate at 60, or twice the step rate when the governor has halved it.
- *A readback every frame, even frozen.* `syncFromGpu()` runs for every layer each
  frame whatever the solver did; with the plate frozen the solver stops but the draw
  and the readback go on at the display's rate. Read back only on a frame that stepped
  or wrote deltas.
- *The governor knows nothing of heat.* It climbs whenever frames are fast and
  retried a failed rung every 90 s, forever (`governor.ts`), so a laptop or phone that
  is warming up climbs, drops frames for a second and a half, steps down, and does it
  again every minute and a half. **The doubling shipped with 14aa** (`npm run rungs`,
  "hunting": 38 rung changes in half an hour → 10, the first retry still at 99 s); what
  follows on the phone's ladder, the adapter and a cool setting is still open. Every
  Apple GPU classes as `strong` (`device.ts`), so
  an iPhone opens at 512² and climbs; the phone layout does not touch the ladder; and
  the adapter is always asked for `high-performance`, which wakes the discrete GPU on
  dual-GPU laptops. Cap a phone's climb
  at its starting rung, and consider a "cool / battery" output setting (low-power
  adapter, 30 steps, a capped top rung) that ships with its phone control.
- *The gamepad* is polled every 16 ms with no pad connected (`useGamepad.ts`); start
  the timer on `gamepadconnected`.

*Measure:* Chromium with `--disable-frame-rate-limit`, draws a second at 65 or fewer
while steps hold; frozen, readbacks a second near 0; `npm run rungs` with a simulated
machine whose capacity sinks, rung changes in ten minutes bounded.

## 14k. Smaller, for the same pass

- *The tablet remote* holds a slider for 50 ms on the tablet and another 50 ms on the
  display, both trailing (`RemoteControl.tsx`, `App.tsx`), then steps the value with
  no easing: at least 100 ms before anything moves. The pad throttles on the leading
  edge with no trailing send, so the end of a flick is dropped. Send the first change
  at once, keep one trailing send, and ease on the display. The cast's audio goes out
  at 30 Hz with no onsets or beat phase, so a network display locks its own kicks.
- *The mouse and fingers on the main canvas* use `mousemove` and `touchmove`, keeping
  the last position, so each frame gets one straight chord and a fast circle is
  flattened. `pointermove` with `getCoalescedEvents` for the path and
  `getPredictedEvents` for the tip (`npm run phone`, and `tools` on the Mac).
- *A check before the show.* Sound moving, projector found and fullscreen, screen
  kept awake, the cache complete, MIDI present, the GPU's rung: every signal exists,
  nothing gathers them. A panel on the desk, and its phone version, with a `panel`
  check.
- *A deploy mid-show can mix versions:* a projector window opened after a deploy runs
  the new build against the old show, and the cast hello carries no build version
  (`castProtocol.ts`). Inferred; send the version and warn on a mismatch.

## 14l. LiquidVisualizer.tsx is one 9,400-line component

**Suggested 2026-09-27 (a review the owner passed on); measured by line count only.** The
show's component holds the WebGPU renderer's lifecycle, the frame loop and its gates,
the pointer, touch and magnet handling, the cast and projector hooks and the debug
surface, in one file several threads edit at once. Split it into a renderer module
the loop drives (no React), hooks for the fingers and the wall, and a thin component,
one piece a PR, each with `lint`, `panel`, `desk`, `phone`, `wall` and the Mac's
`tools` and `qa` green. Not while the file is under active change in other threads.
`React.memo` on the panels only where a render count (the one 14f adds) shows a panel
rendering for props it does not use.

*Found 2026-09-28, not done:* a second reading of the code, this time for what a
stranger on the network, a stale callback or a knocked device does to a set: the show
server, the ear, the desk and the shell, read as the pass above was, against the plans
first. What it found in the recovery paths is `docs/stability-plan.md` S14–S21, the GPU
step's cost `docs/webgpu-plan.md` H2c, the report Worker's limits `docs/crash-plan.md`,
the room's lights, a load-in card and the show kit `docs/rig-plan.md` (R4, R5, R8), and
the checks and the build §19.

## ~~14m. Anyone on the venue's network can drive the show~~

**Shipped, this PR** (`npm run showkey`: 11 of 33 on the old server, 33 of 33 now). Story in `docs/plan-shipped/14-show-at-the-gig-2.md`.
Left open from it:

- **14m-guest** (*proposed*, M; moved up by §36f, with a plate per performer): a **guest key**, now that the server has roles: a key
  whose socket may only drop, blow and finger, rate-limited, in the palette's dyes, onto
  a chosen plate, with a Guests level and a kill on the desk and the phone. A singer's
  tablet, a second projectionist, or at a party the audience's phones through a QR code
  on a card. *Measure:* `npm run showkey`: a guest socket's `patch` is dropped.
- **14m-tunnel** (S, the Mac): behind `npm run tunnel` the server counts each phone by
  `cf-connecting-ip`, so tunnel phones no longer share one address's caps and lock; but
  the upgrade's Origin check assumes the tunnel passes the phone's Host and Origin through
  unchanged, which no cloud session can confirm (`npm run showkey` asks it with the
  headers cloudflared is documented to send). *Measure:* on the Mac, a phone through the
  tunnel joins; if Cloudflare rewrites either header, the check's headers change to match.
- ~~**14m-mark**~~ (S): a big logo reaches the network display. **Shipped** (`npm run phonelink`). Story in `docs/plan-shipped/14-show-at-the-gig-2.md`.
- ~~**14m-lan**~~ (S): the laptop's page at its Wi-Fi address says to open it at localhost. **Shipped** (`npm run phonelink`). Story in `docs/plan-shipped/14-show-at-the-gig-2.md`.
- **14m-https** (M, found in 14m-lan): a **network display cannot start at an `http://`
  Wi-Fi address**. Browsers give WebGPU only to a secure page (https, or localhost), so
  `http://<laptop-ip>:3000/?cast=true&key=…`, the address the README and the server give
  a projector's browser or a second computer, fails at the first shader module with
  "GPUTextureUsage is not defined" (measured in Chromium on 2026-10-24; `npm run
  phonelink` now asks for the plain words on that screen). The phone's remote needs no
  GPU and is unaffected. *Fix, to choose:* the show server serves https on the LAN with a
  certificate the owner's devices trust (mkcert-style; every device installs it once), or
  network displays go through the tunnel's https address, or the network display gets a
  WebGL2 fallback of the plate. *Measure:* a network display opened at the address the
  server prints draws a plate in a browser as it ships (the Mac's `wall`).
- **14m-budget** (S, a trade-off to watch): past 30 wrong keys a minute across every
  address, the server refuses new joins from everyone but the laptop for 60 s. That is
  what keeps a guesser spread over a /48 of IPv6 to about 20,000 guesses a day, so years
  for an eight-digit key; the cost is that a script with a dozen addresses can keep new
  phones out (phones already in, the laptop and its display are untouched). If a venue
  ever meets that, the fix is a longer key for the tunnel, not a looser budget.

## ~~14n. One malformed message can end the plate~~

**Shipped, #322.** Story in `docs/plan-shipped/14-show-at-the-gig-2.md`.

## ~~14o. The song-ID Worker is open to anyone~~

**Shipped, this PR** (`npm run fingerprint-worker`: 7 of 19 on the old Worker, 19 of 19 now).
Story in `docs/plan-shipped/14-show-at-the-gig-2.md`. Left open from it:

- **14o-count** (S): the counters are in Workers KV, which takes one write a second per
  key and, on the free plan, 1000 writes a day; each lookup writes two keys, so the
  free plan meters about 500 lookups a day, and a second lookup from one address in the
  same second can be refused as busy. A store that refuses answers 503 `busy` with CORS
  (`npm run fingerprint-worker`, check 8). *Fix:* a Durable Object counter, or the paid
  plan's quota. *Measure:* the same harness with a store that allows one write a second.
- ~~**14o-smoke**~~ (S): the deployed Worker, measured from a cloud session on 2026-10-24. Story in `docs/plan-shipped/14-show-at-the-gig-4.md` §14o-smoke (moved 2026-10-29, 19m-2). Left: whether a well-known commercial track comes back named, which needs a recording no cloud session should send.

## 14p. Show night runs whatever merged last

**Read in the code.** `npm run show` is `npm run update && npm run remote`, and `update`
is `git pull origin main && npm install && npm run build`. `main` takes several
sessions' merges a day, each as soon as its checks are green (CLAUDE.md), and each
deploys to the site. So the laptop at soundcheck builds whatever landed an hour before,
much of it marked "not yet seen on the Mac" in the running order above, and the hosted
site can change under a show that is playing from it. 14k's mixed versions at the
projector are a symptom of this; this is the cause.

*Fix:* a `show-*` tag, cut when the owner has judged a build on the Mac; `npm run show`
checks out the newest tag unless asked for `main`, and prints which; one command to roll
back to the tag before; a Firebase channel that serves the tag, for a show played from
the site; the Mac app (§13 step 1) bundles a tag, not `main`. *Measure:* `npm run show`
in a scratch clone with a tag behind `main` builds the tag's tree; the cast hello's
version (14k) matches it.

## 14q. The room's lights do not follow the wall

*Moved up by §36g (2026-10-27): the old light shows fought the band's own lighting.*

**Read in the code** (the `lights` effect in `App.tsx`; `server/artnet.js`). Every
50 ms the show sends each layer's mean colour and `master = blackout ? 0 : min(1, fill ×
1.6)`: how much dye the plate holds. It does not see the Dimmer, Pacing's fades toward
black (which ride the flash-gain uniform, not a setting), the flash guard, the Mixer's
levels or the output gain. So in Light Show Night the pars stay up through a near-black
scene the wall has faded into, and Blackout cuts them at once while the wall fades over
a second. The colour is a mean, so a magenta-and-cyan plate lights the room grey, the
fault the roadmap names for `sceneSense`. The flash guard does not reach them (14r).

*Fix:* send the master the wall shows (dimmer, pacing gain, blackout's fade, the guard's
gain, the output gain), and the dominant colour rather than the mean, from the probe's
tiles (14r). Fixtures with places, and sACN, are rig-plan R8. *Measure:* a check on the
master the App sends, beside `npm run lights` (which checks the bytes): at Dimmer 0.2,
through a Pacing fade to black and a blackout's fade, the master follows the wall's
brightness within a frame; a two-colour plate sends one of its colours, not grey.

## 14r. The flash guard reads one number for the whole wall

**Read in the code.** `flashGuard.ts` watches the frame's mean luminance (`probeTiles`
folds every pixel into one sum, `wgsl/probe.ts`). The photosensitivity guidance it is
written against counts a flash over a quarter of the screen: a flash of 0.4 over a
quarter of the wall reads 0.1 as a mean, at the line, and a smaller patch never counts.
The separate rule for saturated red is not implemented, and nothing looks at
high-contrast patterns, of which Ferro Maze (a black labyrinth on a white table, 9d) is
the case. The room's lights (14q) are not guarded. And the probe divides an older
frame's sum by the current frame's pixel count (`probe.ts`), so after a pixel-ratio rung
change (1.5× to 1×) one reading is 2.25× too bright and then drops back, which the guard
counts as a flash.

*Fix, after 14i's decode to linear light:* keep the probe's per-workgroup partials as
tiles; luminance and a red ratio per tile, counted over quarter-wall windows; the pixel
count kept with its sum; the same gain on the Art-Net master. No control on the phone,
by design; the guard's line on the desk and the phone names the rule that is holding.
*Measure:* `npm run wall`'s traces with a quarter-wall flash of 0.4 at 5 Hz (counted), a
full-wall red flash (counted by the red rule) and a 1.5× to 1× rung change (not counted).
