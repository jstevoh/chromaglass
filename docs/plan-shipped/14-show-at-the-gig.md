# 14. The show at the gig: hearing, timing, speed and the picture on the wall: what shipped

How §14's shipped items were found, built and measured. The open work is in
[`docs/plan/14-show-at-the-gig.md`](../plan/14-show-at-the-gig.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

Part 1 of 4; it goes on in `14-show-at-the-gig-2.md`.

## First pass (moved 2026-10-04)

### 14a. The show goes deaf when its window is hidden

**Read in the code.** The sound analysis runs only on the show window's animation
frames (`requestAnimationFrame(update)`, `src/hooks/useAudioAnalyzer.ts`), and it is
the only place the analyser is read. The app already knows the show window spends a
set hidden behind the projector's (the comment over the look fade's timer in
`App.tsx`), which is why the picture, the fades and the gamepad were all moved off
animation frames. The analysis was not. So the moment the performer goes fullscreen
on the projector, or switches to Ableton, the wall keeps moving on the last reading
it had, which may be the top of a kick, and stops hearing the music. This is the one
item here that can quietly ruin a whole set.

**Shipped** (asked "Do #1 now", 2026-09-27). `lib/earClock.ts` decides who reads:
the window's own frames always, as before; the projector's frame ask
(`__chromaglassFrame` calls `wallAsked`) only while those frames have stopped for
50 ms, so the plate hears once per frame the wall draws; and a worker's 16 ms tick
only while neither is coming (covered with no wall, which is still a show on a
network display or the phone). Taking the frames first keeps one reading per drawn
frame, which matters because the level smoothing is per reading. A watchdog on its
own timer calls the ear deaf when the audio context is not running or nothing has
been read for half a second; the desk's sound line then starts "not hearing" and the
phone's Sound dot turns amber with a line in its sheet. A suspended context is asked
back on its `statechange` and on the next touch or key (Chrome starts one suspended
on a page nobody has touched; iOS interrupts one for a call). Whether a finger's
lift wakes it on the iPhone is not yet tried. The wall and the tick read 50 ms after the
frames stop while the page says it is hidden (Chrome says so of a covered window),
and only after a quarter second while it says it is visible, so a visible window at
15 fps, 240 Hz or with ragged frames reads exactly its frames, as before. (A stall
measured from the frames alone went red on the Mac runner's first run: its busy app
drew 28 frames a second, and the tick read between them. The same went red on its
second run behind the wall: covered, the wall drew 44 a second and the tick read 5
times in its gaps. The tick now gives the wall's asks a quarter second whether the
page is hidden or not, so it takes over a quarter second after the wall closes. On
its third run a visible page read 3 ticks against 46 frames: the Mac's show is still
building pipelines behind it for its first half minute, and its frames stalled past a
quarter second, which is what the tick is for; the check now holds each tick or ask a
visible page reads against the page's last frame before it (more than 250 ms), which
a broken build with a long task or a slow uncover cannot pass. Queued ticks after a
long task read once, not once each.)

`npm run ears` (26 checks, no GPU needed; on the Mac's `open` shard) measures it. A
headless window is never hidden, so it withholds the show's animation frames itself.
Covered, with the wall asking: 38 distinct levels in two seconds, one reading per
frame asked for (120 over 121); with no wall, 38 on the tick; the control on the
same page (frames withheld, no ask, the tick stopped, the ear as it was before)
holds **one** level and is called deaf. A build whose ear reads on frames alone went
red on all three "keeps hearing" lines. Visible with the wall asking, only the frames
read (122 frame, 0 ask).

### 14b. With the wall up, the plate may draw twice a refresh and the governor cannot see it

**Read in the code; the doubling is inferred.** The projector window asks the show
for a frame on every one of its own refreshes (`CastDisplay.tsx`). The guard in
`__chromaglassFrame` (`LiquidVisualizer.tsx`) only compares against the projector's
previous ask (`lastExternalFrame`); the show's own frames never set it. With the desk
visible on the laptop and the wall fullscreen on the projector, both windows get
animation frames on different displays' clocks, and each ask cancels the show's
pending frame and draws another. Every draw carries the readback and the mirror copy.
The governor is fed the interleaved intervals, so two half-rate clocks look like one
full-rate one and it never steps down while the wall is up.

*Fix:* stamp the time of every draw, whichever window asked for it, and skip any ask
within about 0.6 of a refresh of the last draw; feed the governor the interval
between real draws. *Measure:* extend `npm run wall` with the mirror popup and both
windows animating: frames drawn a second no more than about 1.1 times one display's
refresh.

**Shipped** (2026-09-27). `lib/drawGate.ts` stamps every draw, the show's own frame
or the projector's ask, and turns down any offer within 0.6 of a refresh of the last
draw. The refresh is the median of the faster clock's own recent gaps (each window's
offers, drawn or not, so the gate's own skipping cannot talk it down), never shorter
than 240 Hz's and with no slow bound (a first bound at 30 Hz let two clocks at 20 a
second both through, 40.0 draws a second, tried), 60 Hz until measured. Three changes
from the fix as written, each found red first:

- *The show's own frames are gated too*, while the projector is asking. With the asks
  alone gated, a projector more than 0.6 of a refresh behind still doubles (its ask
  draws, and the show's next frame lands 0.4 of a refresh later), which is 40 % of
  the phases a drifting projector passes through: 120 draws a second in the
  arithmetic where the gate draws 60, and 113.6 in the app at ¾ of a refresh.
- *Nothing is gated unless both clocks are running*, so with no wall every one of the
  show's frames draws, and with the show covered every ask draws, however ragged a
  busy machine makes them. A gate on the asks alone drew 61 of 121 covered asks
  handed over alternately on time and 12 ms late, each missing one a frame the wall
  shows twice.
- *Every offer carries its refresh's own time*, not the time its callback ran: the
  show's frames their `requestAnimationFrame` timestamp, the projector's asks its own,
  moved onto the show's clock by the two windows' `timeOrigin`s (`CastDisplay`), and
  the time now for an ask with none. Both windows share one main thread, so when both
  clocks land in one refresh the second callback runs after the first one's draw; the
  first version stamped with `performance.now()` there, and once a draw cost more than
  0.6 of a refresh the second looked like the next refresh's and drew too (found in
  review: 87 a second at 60 Hz with 10.5 ms draws), and the governor was fed the draw's
  own cost as the interval.

Only let-through frames reach the loop, so the governor's `frameS` is the interval
between real draws; an ask that is turned down does not offer the ear a reading either
(one reading per drawn frame, 14a).

`npm run wall` measures it twice, and holds every rate to a floor as well as a
ceiling (a gate that froze the plate, or turned down one frame in two, passed the
ceilings alone in review). In arithmetic (node, one main thread with a draw cost):
laptop and projector at 60/60, 60/59.94, 120/60, 60/120, 60/50, and a busy 28/28 and
20/20 Hz, twenty phases each, with and without 2 ms of jitter, with free draws and
with draws of 0.7 of a refresh: between 0.99 and 1.02 times the faster display at
every phase (27.7 to 28.3 on 28/28, 59.7 to 60.3 on 60/60); the old guard 1.25 to 2.0
times it on the same clocks (120 on 60/60, 180 on 120/60); the gate stamped with when
its callback ran 80.0 on 60/60 and 156.0 on 120/60 once draws cost 0.7 of a refresh;
the median interval fed to the governor a whole refresh (16.7 ms; the old guard 0 to
11.7, stamped when run 11.7); covered, every ask of a 30, 60 and 120 Hz projector
draws, and every one of asks 20 to 200 ms apart.

In the app: the real projector window (`?cast=true`), both windows animating, the
projector's frames handed to it 0, ¼, ½ and ¾ of a refresh late to stand in for a
second display's clock. On this tree, one run each:

| | before (the old guard) | the first gate (stamped when run) | after |
|---|---|---|---|
| the four phases, draws a second | 120.0, 120.1, 120.2, 119.1 (2.0×) | 59.7 to 60.4 | 59.9, 60.3, 59.8, 59.8 (1.0×) |
| draws of 11.7 ms, both on one refresh | 72.3 (2.0× the 36.1 the held thread managed) | 68.7 (1.3×) | 60.0 (1.0×) |
| covered, projector's frames ragged | 61 of 121 asks drawn | 120 of 120 | 120 of 120 |

With every phase: at least 0.9 times what the show drew alone (since 14b-2 below,
what either window was handed in the same two seconds; a gate turning
everything down drew 0.0, one at 1.3 of a refresh 29.9 to 39.9, against 53.8), and
about one offer turned down a refresh (59.8 to 60.3 a second), which is what says both
clocks were running. `npm run ears` 26/26 (123 asks read over 123 frames asked for).
Counted, not photographed, so the app half runs in a cloud session with no GPU at all:
there the loop is started by the projector's first ask and runs on the show's frames
from then on, and there is no governor to read.

On the Mac runner, with a renderer up (#203's run on a9ba205), each window was
handed 50.5 to 56.4 of a 60 Hz display's refreshes a second, the gate drew 51.5 to
55.4, and the governor was fed a median 17.0 ms at half a refresh behind. The
display's rate misleads there, so the wall's ceiling and the governor's bar are no
longer taken from it. They are taken from the refreshes either window was handed,
counted in slots as the gate spaces its draws: the wall's refreshes at the time its
frames are handed over, and a new slot only 0.6 of a refresh after the last began.
Draws are held to 1.05 of the slots, and the governor's median to 0.9 of the median
gap between them. Matching the two windows' timestamps instead (tried first) reads a
working gate as doubling at ¾ of a refresh behind whenever both windows miss a
refresh, which a busy Mac does: two reviewers modelled 1.03 to 1.2 times at 3 to 30 %
of refreshes missed. Controls on this tree, in a cloud session: the gate stamped when
its callback ran, with 11.6 ms draws, 68.6 and 71.4 drawn for 59.8 and 59.5 slots
(1.15 and 1.20, red; it passed the display's ceiling at 65.8). A gate that never
turns anything down: 1.2 to 2.0 times (red). The gate: 1.00 to 1.01 at every line,
also with a 22 ms long task every 150 ms. The cloud drops no refreshes, so how the
slot count reads a Mac that does is still owed to the Mac's `tools` shard.

### 14c. The projector's resolution comes from the laptop's pixel ratio

**Read in the code.** `qualityLadder` builds its rungs from `devicePixels()`, the
laptop's ratio, and with a stage attached `canvasPixelsFor` scales the stage by
`dpr / devicePx`. Two ways this goes wrong on a wall:

- *A Retina laptop:* the show opens on the `dpr: 1` rung, so a 1920×1080 projector
  starts at **960×540** (`npm run rungs` asserts exactly this half), and the 1024²
  rung, written for projectors, is gated on `dpr <= 1` and never offered. At 150 %
  Windows scaling it is 1280×720, stretched by 1.5. The mirror then scales with
  `drawImage` and `imageSmoothingQuality` is never set, so it stays at `'low'`.
- *A 1x laptop on a 4K projector:* `frac` is 1 on every rung, so every rung draws the
  full 3840×2160, and the governor has only the grid to give up while the plate's
  shading, which is bound by pixels, stays where it was.

*Fix:* when a stage is attached, build the pixel rungs from the stage (1.0, 0.75,
0.5 of it) rather than from the laptop, offer 1024² by the stage's ratio, and set the
mirror's smoothing to `'high'`. *Measure:* two new cases in `npm run rungs` (it runs
anywhere): a Retina laptop with a 1080p stage starts at the stage's own pixels and
offers 1024²; a 1x laptop with a 4K stage has a bottom rung with fewer pixels than its
top. Then `npm run ladder` on the Mac with a stage.

**Shipped** (2026-09-27). With a stage attached the ladder is the stage's
(`stageLadder`, `lib/platform.ts`): a rung's `dpr` is its share of the projector's own
width and height, and the laptop's ratio is not read. The show opens at the grid its
GPU class opens on at every pixel the projector has; above that the grids climb at
full pixels; at it the pixel rungs come first (0.75, then 0.5 of the stage), then the
smaller grids at half. `canvasPixelsFor` draws a stage at the rung's share and no
longer takes the laptop's ratio, so a fixed grid (the governor off), which asks for 1,
now fills a Retina laptop's projector too. The governor is built again when a wall
comes or goes, and only when the rungs differ; when the rung it is on is still among
them (a wall window crossing 1920×1200 gains or loses only 1024²) it stays on it. After
the GPU runs out of memory on a wall, the ladder is built again under the grid that
failed and opens at the whole stage, where stepping down would have walked its pixel
rungs to half the stage for good (`npm run rungs`: out of memory at 512², now 384² at
1920×1080, walked down 384² at 960×540). The wall window scales with
`imageSmoothingQuality` 'high', set after every resize because a canvas's new width
resets it. With no stage the ladder is exactly what it was.

1024² is offered by the stage's *pixels*, not its ratio: at most 1920×1200. The gate
was measured as a pixel count (1024² held at 1.0 Mpx and fell to 22 fps at 4.1 Mpx,
with the same step cost), and a projector's ratio stands for its pixels badly: a 4K
projector at 1x has 8.3 Mpx, and a 1080p one behind 150 % scaling has a ratio of 1.5
and the same 2.1 Mpx as at 100 %.

`npm run rungs`, 73 of 73 (the old code, bridged to the new `canvasPixelsFor` signature,
fails every new stage case). Two stage ladders are written out rung by rung, and the
1024² gate is held at 1920×1200 (offered) and 2560×1440 (not). The Mac's
`webgpu-smoke` asks the running show which ladder it is on (a rung at 0.75 of the wall
while it is up, none once it closes) and reads the wall's smoothing across a resize that
changes the canvas. A Retina laptop (2x) on a 1080p
wall opened at **960×540** (1280×720 at 1.5x), now at **1920×1080**, on the hosted page
and locally, for every GPU class. 1024² was not offered (grids 768, 512, 512, 384, 256),
now at 1920×1080. A 1x laptop on a 4K wall had **8.29 Mpx** on its top rung and its
bottom one; now 8.29 at the top (768²) and **2.07** at the bottom (256² at 1920×1080),
and it is no longer offered 1024² at 8.3 Mpx. The canvas sizes a 1080p or 4K wall gets
were five different ladders from a 1x, 1.25x, 1.5x, 2x and 3x laptop; now one. The old
assertion that a rung of 1 drew a Retina laptop's wall at 960 of 1920 was this bug
written down, and is replaced by what a share draws (1920×1080 at 1, 960×540 at 0.5).
Eighteen no-stage ladders, printed before the change for every tier at 1x to 3x
(phones included), are a fixture the new ladder matches rung for rung and start for
start. The mirror's smoothing, read by hand from a wall window opened by the built app
in a cloud session: 'low' when it opened and 'low' after a resize before, 'high' and
'high' after; `npm run webgpu` asks the same on the Mac.

*The phone:* no phone version, because a phone has no stage. The wall that follows a
stage's pixels is the wall window (`StageMirror`), a second window on the same machine
mirroring the show's canvas; the phone's own controls have no wall button, and a phone
on a wall goes there through the phone's screen mirroring (AirPlay, Android's cast
screen), which the page cannot see and which shows the phone's own pixels, or through
a Chromecast, whose receiver runs its own show at its own pixels with no stage. The
phone keeps the no-stage ladder, which the fixture holds (its 2.625x and 3x lines).

### 14d. The beat clock hears a smoothed bass level, not the kick

**Read in the code.** The frame loop feeds `BeatClock.update` with
`currentAudioData.bass / 70` and the clock calls an onset when that crosses 0.45
(`beatClock.ts`). That level has been smoothed twice (the analyser's time constant,
then `LEVEL_SMOOTHING.bass`), so where the crossing lands moves by roughly 30–55 ms
with how loud the kick is (worked from the constants), while the flux onset that
`audioFeatures.ts` already computes for the kick goes unused here. `hear()` then snaps
the phase fully to each onset, so that jitter goes straight into the next predicted
beat. At the shipped trust of 0.7 the clock needs about seven kicks to lock, some
three seconds at 120 bpm. `npm run learn` feeds the clock the flux kick at trust 1,
so its "ahead of the microphone" figure (§5) describes a path the live show does not
take.

*Fix:* feed the clock the kick onset and its time, and pull the phase toward each
onset by a gain (about 0.3) rather than snapping it. *Measure:* a `learn` case that
drives the clock the way the live loop does (smoothed bass, trust 0.7) and prints
kicks to lock and the spread of the lead.

**Shipped.** The loop hands the clock the kick's onset and the time it landed (the
reading's `at`, watched for a change, so no kick is lost between frames), and `npm
run learn` drives the clock that way at the shipped trust, 0.7. `npm run kicks`
measures it on the band's own score: locked after 8 kicks at 60, 30 and 20 fps (8
or 9 before, the heard kicks it did lock on being early ones), 170 of 256 kicks
fired ahead at 20 fps against 99, lead −8 ± 13 ms (−14 ± 20 before). The phase
pull was tried at 0.3 and did no better on this band (spread 18 ms against 13 at
20 fps), so `hear()` still snaps: with the onset's own time the snap's jitter is
the onset's, a few ms, not the smoothed level's 30–55.

## Second pass (moved 2026-10-04)

### 14b. With the wall up, the plate may draw twice a refresh and the governor cannot see it

*14b-2, the gate on a busy machine (shipped 2026-10-03).* `wall`'s floor went red on
starved Mac runners (#231: 36.4 drawn against 37.7; once 23.3 against 25.0) with the
draw gate untouched. Two things were wrong. The floor was 0.9 of what the show drew
alone at the start of the run, a different two seconds on a runner whose rate moves by
a third, so it judged the runner more than the gate. Judged against what either window
was handed in the same seconds, the 53 Mac runs of 2026-09-28 to 10-03 read 0.86 to
1.0, and the three under 0.9 were the gate: both clocks on one refresh, 24.3 drawn a
second where the show's own window was handed 28.3 (and 24.4 of 28.3; 34.8 where the wall's was handed 38.7). A
window handed only some refreshes has gaps of one, two or three, the gate's median of
them read two, its 0.6 of that 1.2 refreshes, and the show's next frame one refresh
after its own draw was turned down with nothing in its place: the wall costing the
show frames on exactly the machines least able to spare them. Now a clock's own next
refresh is never turned down (one turned down per clock per draw, which is all one
refresh holds), and the floor is 0.9 of the more of the two windows' frames handed in
the same seconds. `npm run wall` makes the busy machine on purpose (half the
refreshes missed by both windows together, checked to be the same ones; a cloud
browser misses none under load): the gate as it was drew 23.4 of 29.4 handed with both
clocks on one refresh and 26.0 of 29.5 half a refresh apart (both red), now 29.5 of
29.5 at each; in its
arithmetic on a 60 Hz display missing refreshes, 0.75 of either window alone at worst
before and 0.99 after, never more than one draw a slot. The regular-clock sweep is
unchanged (28 and 20 a second, 120/60, 11.7 ms draws).

### 14f. Sound and MIDI reach the plate a frame late, through a whole-app render

**Shipped, the sound's half (2026-09-27).** Measured first under `?debug` with the
simulated band: the App rendered 69.8–70.3 times a second against 60 readings, and
with no sound at all 5 times a second, every one of those a poll (the layer badges,
the tempo label, the song's shape, the timecode, and where a plate draws the engine
status) setting a value it already had, which React renders the App to find out
whenever anything else is pending. Now the ear keeps every reading in a ref the
moment it makes it (`Ear.live`), tells React ten times a second (`EAR_VIEW_MS`), and
hands every reading to listeners on its own clock (`Ear.onReading`), which the cast's
audio feed uses so it keeps its 30 a second behind the wall. The plate asks for the
reading at the top of each frame (`hear`), and its frame first offers the ear that
frame (`plateFrame`), so the frame hears a reading taken on itself whichever of the
two loops runs first. The polls compare against what they last set. `npm run
renders`, on the Perform desk: React told 10.0 times a second, the App rendering
11.0 (those and the desk's "live for" clock), every commit on the page the same,
laptop and phone; the old ear 69.9–70.6, red. The ear tells React on a 100 ms
schedule, not 100 ms after the last time: readings come on frames, and "the first
frame past 100 ms" fell to 7.5 a second at 15 frames a second (by the rule; a slow
Mac draws 24 to 42), where the schedule keeps 10.0 down to 10. A quiet page renders
its clock and nothing else, 1.0 a second (the old engine-status pattern 1.3–1.7,
red). A frozen view (0.0 told), a dead render counter and a dead commit counter are
red too. On the Mac `open` shard (#211's first run) the plate heard a reading taken
on its own frame on every frame it drew (95 of 95 and 126 of 126 laptop, 72 of 72
and 93 of 93 phone), with React told 9.9–10.3 a second at 24 to 42 frames a second
and the App rendering 10.9–11.6. The ear's reading for the plate's frame runs
guarded, so a throw in it costs that frame its reading, not the plate its loop.

**Shipped, the MIDI fader's half (2026-10-11).** A fader handed React every move on an
animation frame (`rideSetting`), and the MIDI hook set its "last event" state twelve
times a second and its clock lamp twice a second whatever it held, so with one fader
swept at sixty messages a second (`npm run renders`, a stubbed controller on CC 7 bound
to the Dimmer) the App rendered 121 times a second, laptop and phone, and at rest with
MIDI on twice a second, against the desk clock's once. Now the plate reads the ride
itself at the top of every frame (`ride` on `LiquidVisualizer`, `SettingRide.lay`), put
where every reader in the frame loop reads, and React is handed the ride every 100 ms
(`RIDE_VIEW_MS`), for the desk's number; the last event is a store only the MIDI panel
and the on-screen controller subscribe to (`useMidiLastEvent`), and the lamp is set only
when it changes. Measured: the desk's Dimmer changes 9.7 to 10.3 times a second (59.9 before),
the App renders 11.0 a second, commits the same (121 before), where the fader stops is
where the Dimmer lands, and a second after letting go the App renders its clock alone,
1.0 a second (2.0 before). #348 had tried the split and taken it back for three faults,
each answered: `lay` lays a key only while what React rendered disagrees with it, so
once React has a move no frame copies anything (`npm run panel`: 0 of 3600 frames,
where the first try copied all 3600); App's `ridePlate` keeps the ride off a key the
identified track overrides, and off the wall's non-room keys while the desk builds on a
copy; and the frame puts the result in the one `settingsRef` the whole loop reads. On
the Mac `renders` also holds that at least half the frames during the sweep draw a move
React has not rendered yet, and that none does once the fader is let go. The same PR
treats a ride as a hand's write for Evolve (14t): a glide on the dial is dropped at the
first message, the drift's anchor moves to where the fader put it, and the drift skips a
dial a fader holds that React has not rendered yet. On the Mac (#360's run) the plate's
Dimmer moved 33 to 38 times a second on the laptop page against the desk's 8, and 19 to
21 on the phone page drawing 20 frames a second, with 86 to 94% of frames laying the ride;
none once let go. The same run found the desk at 7.0 to 7.3 a second on the phone page:
the flush was timed from the last flush, so each late timer and each wait for the next
message lengthened the period. It is stepped on the ear's schedule now. Found in review and fixed in the
same PR: a receiver that draws its own plate (a Chromecast, a mirror) is sent the state
with the ride laid over it, and a ride asks the cast's throttle for a send, so it still
hears a fader at the cast's 15 a second rather than React's 10; a preset, a Go or a desk
slider landing within the tenth of a second before a flush hands React the ride first
(`flushRide`), so the newer write wins as it did when the window was a frame; a look fade
starts from where the fader has the plate, not where React last heard it; and the MIDI
panel's activity light renders itself out 400 ms after the last message, which the App's
renders used to do for it.
