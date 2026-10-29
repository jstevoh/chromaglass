# 14. The show at the gig: hearing, timing, speed and the picture on the wall: what shipped (continued)

Part 2 of 4 of §14's archive; it begins at 14v. The section starts in `14-show-at-the-gig.md`.

## Second pass (moved 2026-10-04) (continued)

### 14v. The show takes a long time to load on the web

- **Shipped:** the opening's pipelines are built three at a time (`?lanes=N` to time
  other counts, `?lanes=1` the old way); the built page asks for the app's chunks
  alongside the entry (`vite.config.ts`), but not for the remote or a cast; and
  `main.tsx` asks for the GPU before it imports the app (`gpu/device.ts`).
  `npm run loadtime` holds the order (Brotli, 100 ms round trips, 10 Mb/s): the
  app's chunks asked at 0.12 s, before the entry is in (was 0.30 s, after it); the
  GPU asked at 0.41 s (was 0.88 s); in a cloud session with `PW_WEBGPU=1`, the
  device given at 0.42 s (was 0.95 s) and the first shader handed over at 0.81 s
  (was 0.96 s). On the Mac (`npm run startup`, cold), two at a time built the
  fifty in 10.86 s against 11.46, 13.57 and 11.83 s one at a time: the
  forty-nine after the first (which waits on Chromium starting the GPU) a fifth
  faster, 7.17 s against 8.93 and 9.17 s, with no frame gap over 0.67 s; three at
  a time built them in 8.76 s, the plate stepping at 9.52 s (was 12.15, 17.62 and
  12.49 s), with no frame gap over 0.58 s (run 37174580232).
- `npm run loadtime` runs in Measure's browser part (`checks.yml`, "The load").
- **Shipped (the owner asked, 2026-10-04): the intro covers the black plate.** "Could
  we add a ChromaGlass intro for the first load? It could cover the latency of things
  loading in the background." The mark (its burst turning under the C), the name and
  "Warming the lamp" over three slow pools of the mark's dyes, drawn by `index.html`
  itself so it is in the page's first frame, before any of the app has arrived: a
  video would have been one more download in front of what it covers for. It moves
  by transform and opacity only, which the compositor runs while the page's thread
  is held at the GPU's start. Once the app is up the plate's frame takes it in
  (`lib/intro.ts`), so on the desk it fills the preview's hole and not the desk, and
  on the phone it sits under the dock; it starts its 0.9 s fade on the frame the
  plate first steps (the first drawn, if the show opens paused), never holding the
  plate back. A press on it or a key skips it, a press on the desk does not; the
  failure screen and the slow-download button take it away; the remote and a cast
  (the projector's window, the network display) never show it; it gives up after a
  minute. The brand's art draws its three layers (`npm run brand`,
  `public/intro-*.svg`). `npm run intro`, in Measure's browser part on SwiftShader:
  the intro in the first frame at 0.61 s with the app's chunk in at 1.78 s (100 ms
  round trips, 10 Mb/s); leaving on the very frame the plate first stepped (12.79 s
  on SwiftShader); covered 12.08 of the 12.08 s from the first paint to the first
  step; the page's first contentful paint is now the intro's, 0.70 s. `npm run
  startup` prints its times on the Mac ("the intro: …") for the cold opening.

- **Shipped, 14v-4: the intro held still while the opening's render pipelines
  compile.** The first deploy carrying the intro (run 37233245217) went red on
  `npm run startup`'s "no stop in the opening": no animation frame for 2.82 s from
  3.15 s with the page neither busy nor held, exactly while `plate/display` compiled
  (4.30 s from 2.71 s), and again for about 1.9 s while `plate/derive` did; through
  the compute kernels after them the frames ran on. Before the intro the display's
  compile stopped nothing (no gap over 0.62 s on #254's run, display 3.46 s): a page
  with nothing new to draw needs nothing of the GPU process, a turning burst needs it
  every frame, and on the Mac such a frame waits there behind a render pipeline's
  compile (inferred from the timings; a compute kernel's compile does not hold it).
  So `prepareShow` pauses the intro's animations (`.cg-still`, `introStill`) two
  frames before the first of the opening's render pipelines is asked for and lets it
  turn again when the last has settled (`Quiet` in `gpu/prepare.ts`). `npm run intro`
  line 9 holds every frame against the opening's render compiles, read from outside
  the app: 242 frames up during them, none moving, held 2.02–6.18 s on SwiftShader,
  then turning on all 354 frames after; with the hold taken out, 178 of 178 moving
  and the line red. Its first version held still as each lane took its first render pipeline, which let three lanes ask for three at once (PR #283's first Mac run: a 2.15 s frame gap with `air/air splat` compiling 3.32 s); it now holds still before the lanes start, and line 9 also holds the opening to one render compile at a time (2 of 4 asked while another compiled with the first version). The Mac's `npm run startup` is what says the stop has gone; its intro line prints the stretches held still. This
  answers the open question of whether the swirl freezes: around the display's and
  the derive's compiles it does, and now it does so on purpose, still and not stalled.
- **Shipped, 14v-5: the intro starts still, and turns once the opening's render
  pipelines are built** (PR #335, 2026-10-10). What was reported: `npm run
  startup`'s "no stop in the opening" went red on about half of 10-10's Mac runs,
  across PRs that never touched the opening (2.17 s, 2.57 s against the 2 s bar), and
  held up deploys. What was measured: over the open shard's 176 runs from 27 September
  (`ci-flakes/startup-intro/open-shard-runs.txt` in the project's files), the show's
  longest wait for a frame was a median 0.53 s (p90 0.78 s) on the 57 runs before the
  intro merged (#274, 10-04 20:13 UTC) and 1.73 s (p90 2.20 s, 19 of 119 over 2 s) on
  every run since; the GPU device went from a median 0.09 s to be given to 1.63 s in
  the same hour. The stops lay inside the device request with the intro turning, or
  in the first compile after it. Holding it still around the render compiles (14v-4)
  had caught the second and not the first, and taking out the pools' blend mode
  neither. PR #335's first push opened the show three times each way on CI's Mac,
  cold: as shipped 2.35, 2.13, 2.32 s; without the intro 0.47, 0.47, 0.82 s; without
  its colour pools but turning 1.93, 2.33, 2.17 s; still from the first paint 1.18,
  0.85, 0.92 s. So it is the motion, not what moves: a turning picture is a new frame
  every refresh for the compositor to present through the GPU process, which on a
  cold Mac is busy starting the device and compiling, and each frame waits there.
  The fix: `index.html` starts `#cg-intro` with `.cg-still`, `installIntro` records
  the hold from 0, and `Quiet`'s `go` lets it turn once the opening's render
  pipelines are built, as before. `npm run intro` line 9b holds every frame from the
  first to the last render compile still, with some seen before the first compile
  was asked (SwiftShader: 328 frames, none moving, 86 before the first ask at 2.27 s;
  with the markup's `.cg-still` taken out, 83 of 85 moving before the first ask and
  the line red).
- **Shipped, 14v-6: the opening asks its first fills before the display, after the
  mount frames settle** (2026-10-18, this PR). Over 2026-10-11 to 18 (`npm run
  flakes -- --check 'no stop in the opening'`), `startup`'s "no stop in the opening"
  went red on 26 of 167 Mac runs (16%; 11 of the 26 green on the same commit). PR #396
  tried warming the compiler at
  boot (an empty kernel, a built fill-shaped kernel, and that kernel run once) and
  went red on all three Mac runs of its own PR; its third run showed that the stop is
  not Metal's compiler starting (the warm started it in 0.13–0.20 s), but the
  opening's own `fluid/fill:rgba32float` compiling 4.32 s from 2.64 s beside
  `plate/display` (2.64 s) while a frame asked at 3.42 s waited for the GPU process
  until 6.80 s. This PR's first version (fills first, display held until they settle)
  still went red on its own first Mac run (39189617869): fills asked at 2.42 s,
  `fluid/fill` 2.67 s, a frame gap of 2.07 s from 2.59 s, with a long animation frame
  that began at 2.61 s and did not render until 4.74 s, and the page's frames
  numbering 8 at 2.25 s and 11 at 2.82 s, so the desk's mount frames were still being
  presented when the fills were asked. Three changes (`src/hooks/usePreviewFrame.ts`,
  `src/lib/intro.ts`, `src/gpu/prepare.ts`):
  - `usePreviewFrame` measures the desk's preview hole in `useLayoutEffect` instead of
    `useEffect`, so `plate-frame` and `#cg-intro` mount directly in the preview
    rectangle on `App`'s first paint instead of painting full-window and resizing on
    the next frame.
  - `introStill()` waits four animation frames plus a macrotask (with a 1.5 s safety
    cap for a tab hidden mid-wait, and resolving at once if already hidden) even when
    `#cg-intro` already has `.cg-still` from `index.html`. On run 39189617869, a 200 ms
    cap fired at 2.42 s before the first post-mount frame at 2.50 s had rendered,
    leaving frames at 2.50–2.59 s to wait 2.07 s on `fluid/fill`.
  - `prepareShow` ranks the three `fluid/fill:*` compute kernels ahead of
    `plate/display` and holds `plate/display` (and the remaining kernels) in
    `buildInTurn` until the opening's `fluid/fill:*` kernels are given (`fillLeft`),
    then asks `plate/display` alongside the remaining compute kernels.
  Not reproduced locally: the Mac's compiled-shader cache is warm there (the opening
  took 0.24 s), so `npm run startup`'s "no stop in the opening" passed on the warm
  cache and proves nothing about the cold stall; emptying that cache
  (`STARTUP_COLD=1`) is the owner's to allow, and CI's cold runner is the judge. On
  the Mac: `npm run intro` 13/13, `npm run loadtime` 4/4, `npm run lint`. Judged over
  the week after merge against the week before by `npm run flakes -- --check 'no stop
  in the opening'`.
- **Shipped:** the opening asks for its render pipelines first, the display first of
  all (`gpu/prepare.ts`): with three in flight it had been asked forty-fifth, and the
  last 1.34 s of the opening was the display compiling alone with the other lanes dry
  (run 37174580232, "slowest ahead"). And two solver kernels that did what another
  did are gone: `pressureClear` was `mgZero` with its count read off the Sim, and
  `mgProlong0` was `mgProlong` but for level 0's packed index (now `A.a.y`): one fewer
  compile in every opening on a thin gap (every look, since 18a-every), two in one
  opening with Thin Gap off. Each build ahead now records its compile and its first
  use apart (`Prepared.raw`), and `npm run startup` prints them ("each build ahead
  from its own ask"), to say whether the next cut is fewer kernels or waiting once for
  all the first uses rather than one at a time. Its first Mac run (37190509856, with
  #248's thin gap now in every opening) answered: built ahead 0.54 → 11.24 s, first
  step 11.54 s, and 6.31 s of the lanes' time was first uses, 6.18 s of it the
  display's, the derive's and the air's first draws, 2.06 s each and all at once,
  every lane idle while the GPU warmed. So a first use is now handed to the GPU and
  not waited for in its lane; the opening waits once for all of them at the end
  (`useWait`, printed by `startup`). On the next Mac run (37192204661): first uses
  1.17 s of lane time (was 6.31), the one wait at the end 0.00 s, built ahead 0.49 →
  10.16 s and first step 10.69 s (was 11.54 s on this PR's first run, the same
  opening), no frame gap over 0.62 s. The lanes now spend 27.4 of their 29 s
  compiling, so what is left is the compiles themselves: 48 of them, the first three
  ### 14n. One malformed message can end the plate

**Shipped** (#322): one `sanitizePatch` against the settings registry for the socket, MIDI map loader and loaded looks; gestures dropped if non-finite; `hexCache` bounded with 512-entry eviction; verified with `npm run sanitize` and `npm run remotemix`.

**Read in the code; the chain was followed by hand, not run.** The display applies a
remote `patch` as it comes (`case 'patch': queuePatch(message.settings)` →
`updateSettings`, `App.tsx`): any key, of any type. `{"simResolution":"x"}` gives
`Math.round("x")`, `NaN`, in `resolveSimResolution` (`LiquidVisualizer.tsx`); `new
WebGPUFluid(device, NaN)` throws on `createTexture`, and the catch calls
`governor.failRung()`, which marks the rung failed forever (`governor.ts`). Each rung in
turn fails the same way, until the plate stands on "no WebGPU": a one-way door in the
sense of `docs/stability-plan.md`. A phone on an older build that sends a renamed or
retyped key does the same by accident. The OSC path already drops non-finite numbers
(`oscToMessage`'s `num()`); the socket does not. Two more doors of the kind:

- a MIDI map file's setting binding keeps any key and, for a key not in
  `LEARNABLE_BY_KEY`, its own `min` and `max` unchecked (`parseMidiMap`, `midi.ts`),
  where `parseSoundBindings` drops unknown keys;
- gestures: `dx`/`dy` sent as strings become `NaN` in the CPU velocity
  (`blowDirected`), and every distinct `drop.color` string becomes a key in `hexCache`
  (`constants.ts`), which never forgets one.

*Fix:* one `sanitizePatch` against the settings registry (known keys, the default's
`typeof`, finite numbers clamped to the setting's range), used by the socket, the MIDI
map loader and a loaded look alike; gestures typed as OSC's are; `hexCache` bounded.
*Measure:* a node check beside `npm run remotemix` that sends `simResolution: "x"`, a
`NaN`, an unknown key and a 1,000-character colour, and finds the settings, the
governor's ladder and the cache as they were.

#### 14v-7. A frame gap while the intro is held still counts only the page's own work

Shipped 2026-10-24, the owner's choice on a card ("judge pauses the audience sees").
`npm run startup`'s "no stop in the opening" was the loudest check on CI: 41 FAIL of 193
Mac runs in the week to 10-24 (`npm run flakes`), 25 branches, 4 of them main's, 20 green
on the same commit; the week before 14v-6 it was 16%. Every one of the 41 logs read:

- the longest frame gap 2.02 to 3.97 s, beginning 0.24 to 4.08 s in;
- inside Chromium's own waits: the device given up to 3.7 s after it was asked, or the
  first compute kernel of all (`fluid/fill`, a few lines) given 2.4 to 4.6 s after;
- the page's own long tasks in the gap 0.83 s at most, none in 38 of them, and nothing
  made, written or submitted in it;
- every gap over before the intro let go of its still (4.64 to 11.96 s), the stretch
  `introStill` (14v-5) holds the mark still exactly because the GPU stops the frames then.

4b already took out the time the page's thread was held as well; in these the thread ran
and only the frames stopped. Two fixes on the app's side had failed (#396 warmed the
compiler, 14v-6 reordered the asks), and nothing a page does makes Chromium give it a
device sooner. So, in `openingGaps`, a frame gap that would count past the bar loses,
inside the still stretch, the time the page was seen free: between two ticks of its own
100 ms timer no more than `TICK_FREE_MS` (250 ms) apart. At most `STILL_IDLE_CAP_S`
(4.5 s, above the 41 gaps' 3.97 s and Chromium's start's 4.18 s) comes out all told, only
of a still that let go (capped at the intro's leaving), and only when long tasks and the
timer can be seen at all. Outside the still stretch, and for heartbeats and steps,
nothing changed, and the 2 s bar did not move. The line prints how much of its gap was
the still intro with the page seen free.

The first draft took out everything but the page's long tasks and pagehold's after-await
stretches. The check-skeptic fed it synthetic openings: 2.5 s of the page's code after a
pipeline's promise at 3.5 s, or a chain of 0.45 s continuations, read as idle, since such
code is not a long task in every Chromium and pagehold's stretches begin only in the first
3 s; a still that never let go excused everything up to the intro's 60 s cap. The timer
answers all three, and `stillCases` now runs six such openings on every run (excused,
code after an await, a continuation chain, a gap across the still's end, a still never let
go, the cap), each of which a mutant of the rule turns red. Replayed on the 41 logs by
their printed long tasks: 0 red; the timer's ticks inside the gaps are not printed (its
median was 108 to 118 ms in all 41), so the week after, by `npm run flakes -- --check 'no stop in the opening'`, decides. The
new count is never more than the old, so no green run turns red.

Named limit: a stop the GPU process makes for the page while the intro is still (its
compiles of the app's shaders) is no longer counted here; its length is held by checks 1
and 1b and the first step's cap. Weighed and not taken: one automatic re-run (about 4%
red instead of 21%, and it hides a real one-in-five), warming Chromium's GPU in a page
before the measured one (untested, and #396's warm in the same page did not help).
- **Shipped, 14v-9: the webpage loads only itself first, and leaves the GPU for Play**
  (2026-10-28, asked by the owner the same day: "speed up the first load"). Measured
  against the live site from a cloud browser: chromaglass.art fetched 811 kB, 590 kB of
  it the show's own chunks (App, castProtocol and four more, preloaded by the page for a
  show the visitor had not opened), while the webpage's own chunk (4 kB) was asked only
  once the entry had arrived and run, at 1.40 s, and its pictures at 1.67 s; and
  `main.tsx` asked for the GPU at once, whose start holds the page's thread (0.6 to
  4.5 s on CI's Mac, `npm run startup`'s "held" line) while a visitor reads. Now the
  page's preload script (vite.config.ts) tells the webpage's address the way
  `landingFirst` does and preloads the webpage's chunk there; `main.tsx` asks for the
  app once the webpage's eager pictures are in (4 s at most) and for the GPU when a
  pointer or the keyboard reaches Play, or at Play itself. `npm run loadtime` 4a to 4d,
  on a second build with a demo sign-in (on today's code 4a, 4b and 4c are red; on a
  10 Mb/s, 100 ms line the first picture is in at 0.46 s, from 0.83 s). Also: the
  webpage's pictures, the intro's drawings and `/video/` were served `no-store`, so
  every visit fetched them again; they are now cached for an hour (firebase.json).
  Named cost: a visitor who presses Play without the pointer resting on it first waits
  for Chromium's GPU start (1.8 to 4.3 s cold on CI's Mac) inside the intro, where
  before the webpage had paid it while being read.

### 14m. Anyone on the venue's network can drive the show

**Shipped** (this PR). What changed, in `server/remote-server.js` unless named:

- The show key is eight digits from `crypto.randomInt`, compared with `timingSafeEqual`,
  kept in `server/.show-key` (mode 600, ignored by git) so a restart keeps it, and the
  Mac app's key is eight digits too (`desktop/main.js`; a four-digit key is replaced, so
  each phone scans the new code once).
- Only the laptop is handed a key: `/remote-info.json` answers `key` and `displayKey`
  to a loopback socket with a localhost Host and no forwarding headers. The display has
  its own 32-hex key, new each launch, so a phone's key cannot take the display role.
- Three wrong keys from an address, each within 5 minutes of the last, lock it out for
  5 minutes (`denied` with `reason: 'locked'`, which the phone shows and waits out); a
  good key no longer clears the count, so a guest's own join cannot reset a guesser on a
  shared address. Past 30 wrong keys a minute across all addresses, new joins from all
  but the laptop are refused for 60 s, so a guesser spread over a /48 of IPv6 needs
  years (PLAN 14m-budget). A display hello with no key is not a guess and is not counted,
  and the laptop's page at its Wi-Fi address, which is given no display key, no longer
  knocks. At most 4 sockets per address may be open without having said hello. The
  upgrade checks Origin (none, from
  the native apps and the checks; a page this server served; the iPhone app; a page on
  this machine); `maxPayload` is 512 KiB (close 1009); a socket
  has 5 s to say hello; 16 sockets per address and 200 in all.
- `useRemoteLink.ts`: a relay that was there and went away is looked for on the short
  backoff, not the 30 s probe, so a laptop and phone come back after a restart by
  themselves; a frame over the cap is dropped with a warning rather than sent.
- Art-Net: an input universe (`artnetInUniverse`) and the `ARTNET_*` numbers falling
  back to their defaults when they are not numbers (`npm run lights`, 30 of 30).

*Measured:* `npm run showkey` on the old server 11 of 33, now 33 of 33. With the server
down for 4 s under a linked phone and laptop, a change on the laptop had not reached
the phone in 25 s before; now it does in 3.6 s. `applink`, `draw`, `drawwall` read the
display's key from `/remote-info.json`, and `remotemix`, `phonelink`, `panel` pass.


**Read in the code** (`server/remote-server.js` unless named).

- The show key is four random digits (`SHOW_KEY`), about 13 bits, compared with `!==`,
  and a wrong `hello` only closes that socket: nothing counts failures or slows the next
  try. Through `npm run tunnel` the 9,000 keys fall in minutes.
- On the LAN it need not be guessed. `/remote-info.json` hands the key to any request
  without `x-forwarded-for` or `cf-connecting-ip` (`isLocalRequest`), which is every
  device on the venue's Wi-Fi, not only the machine `remoteProtocol.ts` says it is for.
  The socket checks no Origin or Host either, so a web page open on any phone in the
  room can reach `ws://<laptop>:3000/remote-ws`.
- With the key, a `hello` as `display` receives every phone's commands, and can push
  `state` and `cast` to the phones and to the network display on the wall, set the
  Art-Net `lights`, and toggle Record and Blackout.
- Frames are taken up to the `ws` default of 100 MiB (`new WebSocketServer({ server,
  path })`); the 512 KB limit is checked after the frame is buffered and made a string.
  A socket that never says hello is never closed, and nothing caps connections. A few
  large frames stop the Node process, and every phone, network display, OSC and Art-Net
  with it.
- A restart with the generated key answers every phone and network display `denied`,
  and `useRemoteLink.ts` stops retrying for good on that, though the server's comment
  says it is restartable mid-show.
- Art-Net in reads every universe but its own output (`packet.universe ===
  artnet.universe` is the only filter) into one `seen` map, so on a rig with four
  universes each mapped setting jumps between their values. A non-numeric `ARTNET_RATE`
  makes the rate `NaN`, and `setInterval(…, NaN)` sends every millisecond.

*Fix:* the key only to a loopback `req.socket.remoteAddress`, and an Origin check on the
upgrade; a longer key from `crypto.randomInt`, compared with `timingSafeEqual`, and an
address locked out after a few wrong hellos; a display key apart from the phones', so a
phone's key cannot take the display role; `maxPayload: 512 * 1024`, a 5 s deadline for
the hello and a cap per address; the generated key kept in a file beside the server, so
a restart keeps it; an input universe, and the `ARTNET_*` numbers validated. The phone's
join and the iPhone app's laptop remote (`appLink.ts`) must keep working.

Once the server has roles, a **guest key** is a small step (*proposed*): a key whose
socket may only drop, blow and finger, rate-limited, in the palette's dyes, onto a
chosen plate, with a Guests level and a kill on the desk and the phone. A singer's
tablet, a second projectionist, or at a party the audience's phones through a QR code
on a card.

*Measure:* extend `npm run remotemix`: a request from a LAN address gets no key; three
wrong keys lock the address out; a 1 MB frame is refused without the process growing; a
silent socket is closed at 5 s; a restart keeps the key and the phone rejoins; a guest
socket's `patch` is dropped.

### 14m-mark. A big logo never reached the network display

**Shipped** (the PR after #391). 14m made the relay close a socket on a frame over 512 KB
and the desk's link drop any message that large, and the mark crosses the relay as a data
URL, once, when a network display joins: a print-sized PNG logo is several megabytes, so
after 14m the network display showed no logo. The cap stays (it is what keeps the relay
from holding a stranger's megabytes); the desk sends the network display a copy that fits
(`src/lib/markFit.ts`): a mark under 400 KB goes byte for byte as before, a larger one is
redrawn at most 1920 px on its long side as WebP (which keeps transparency; JPEG would
paint the clear parts black) and shrunk in steps until it fits. Safari writes no WebP from
a canvas and falls back to PNG, which keeps transparency too. The laptop's plate and a cast
window on the same machine keep the original. `npm run phonelink`: a 2.2 MB PNG with a
clear border reaches a mirror socket as a 287 KB WebP at 700×700, border alpha 0 and centre
255; a mirror joining afterwards is handed the same mark (the desk's link survived); a
48-pixel logo crosses byte for byte. On the code before it: no mark reaches either mirror.

### 14m-lan. The laptop's page at its Wi-Fi address

**Shipped** (with 14m-mark). The plan said the page would sit quiet with no display key;
measured, it never got that far: a browser gives WebGPU only to a secure page, and
`http://<laptop-ip>:3000/` is not one, so the page stopped at the first shader module with
"GPUTextureUsage is not defined" and nothing else. The failure screen (`src/main.tsx`) now
says why, and links `http://localhost:<port>/` on the same port; a network display
(`?cast=true`) is told why and is not sent to its own localhost, which is not the laptop
(the network display's own problem is PLAN 14m-https). In a browser told to treat the
address as secure, the Phone · iPad panel says to open the page at localhost and draws no
code: it used to draw one of the remote with no key in it, which a phone could scan and
never join with. `npm run phonelink` asks all of it, with a WebSocket count that must see
the localhost desk's socket so that "opens no socket" cannot pass by counting nothing:
29 of 36 on the code before, 36 of 36 now.

### 14o. The song-ID Worker is open to anyone

**Shipped** (with 14m). `server/fingerprint-worker.js` now, before anything costs: an
Origin from the site, a localhost, the show server on a private address or the iPhone
app (403 otherwise, and for none); its counter store bound (503); a `Content-Length` of
at most 2 MB read before `formData()` (411 / 413), and the file measured again after;
30 an hour per address, per /64 on IPv6 (429); 1000 a day across everyone, or
`FINGERPRINT_DAILY_LIMIT` (503 `busy`), and a counter store that throws is `busy` too,
with CORS, not a bare 500. The app reads any refusal as no match.
`wrangler.toml` binds `FINGERPRINT_LIMITS`, which the owner creates before redeploying.
*Measured:* `npm run fingerprint-worker`, 7 of 19 on the old Worker, now 19 of 19; each
refusal also shows the service was not called.


**Read in the code.** `server/fingerprint-worker.js` answers any origin
(`Access-Control-Allow-Origin: *`) with no key and no rate limit, and its URL is built
into the public bundle (`VITE_FINGERPRINT_PROXY_URL`, `deploy.yml`). Anyone who reads
the bundle can identify songs on the owner's AudD or ACRCloud account, from a script or
from their own site. It also parses the whole multipart body (`request.formData()`)
before its 2 MB check. The report Worker already has what this one lacks
(`ALLOWED_ORIGINS`, a per-address limit in KV; `docs/crash-plan.md`).

*Fix:* the same origin list and per-address limit (per /64 on IPv6), a refusal on
`Content-Length` before parsing, and a daily ceiling that answers "busy" rather than
spending. The show's own origins (the site, the show server, the Mac app) stay allowed.
*Measure:* a node harness in the manner of `npm run report-worker`: a foreign origin
refused, the 31st request in an hour refused, a 3 MB body refused before `formData()`.

### 14s. The ear: the input picker (shipped)

**Shipped 2026-10-05.** `chooseAudioInput` (`App.tsx`) was memoised on `[audioSource]`
alone and called the `handleSourceChange` of the render in which the source last
changed, when `audioStream` was still `null` and `audioInputId` the old one. Measured
2026-09-28 with Chromium's fake devices, and again by `npm run inputpick` on main
before the fix: picking Input 1 and then Input 2 made three `getUserMedia` calls, none
with a `deviceId`, and all three tracks stayed live ("3 live tracks: default, default,
default", 2/5). The interface picked at soundcheck was not the one the show heard until
a reload, and each pick left another microphone open. Now the stream and the input are
refs beside their state, the picker calls this render's handler through a ref with the
id it was given, and a device that answers after a newer pick is closed rather than
heard. `npm run inputpick` goes through the desk's Mic dot and the settings' list: each
pick asks for its own input by id, one track is live at the end, Input 2's (5/5). It
runs in Measure's browser part. Safari's second song and song ID's latch stay open in
PLAN.md 14s.

### 14x. The microphone hears the hand on the laptop (shipped)

**Reported by the owner 2026-10-04:** pressing some controls (the Speed ride) or
picking a tool sometimes made the plate pulse, as if it took a beat or a press. The
show was on the laptop's microphone, which is opened raw (no noise suppression, for the
music's sake), a few centimetres from the trackpad. A click is a sharp knock with a
thump in the case, and the ear's kick onset is built to call exactly that; the plate's
kick (the squeeze, the centre pulse, the ring, the rock) follows it. Not the band's
drift at Audio Impact 0, and not a press: nothing reached the plate but the kick.

*Shipped:* `src/lib/handSounds.ts` marks every press, release, key and finger landing
on the page, and on the microphone alone a reading taken in the 250 ms after a gesture calls no
onset (`AudioFeatures.update`'s `hand`). The levels still move,
and a locked beat clock fires its predicted beats through the moment. `npm run clicks`:
in arithmetic, a quiet room's clicks were 46 of 46 kicks and are none; with the band
playing, the beat clock fired 303 kicks for the band's 258 and fires 257; in the app,
on the Perform desk 10 kicks for 10 presses and none, on the phone 9 for 9 taps and
none, while knocks with no hand on anything are still all heard.
