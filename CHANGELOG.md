# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed — one engine: the app runs on WebGPU

**The renderer is WebGPU, and nothing else is.** The WebGL2 renderer, every line
of GLSL and the CPU solver's fallback rung are gone; the solver is compute
shaders, the composite is one WGSL pass, and the post chain, the camera, the
projector and the flash probe are passes beside it. A browser without WebGPU
gets a screen that says so rather than a slower show. The port ran as P0–P7 of
`docs/webgpu-plan.md`, over #93–#103.

**What it bought.** The flash guard is a true average over the frame instead of
a sample of it. The governor judges a rung by the GPU's own timestamps rather
than by how long the CPU spent submitting work — it was being told half a
millisecond of encoding and climbing into grids the card could not hold. Splats,
image and text pours and the plate's measurements are all on the GPU, so a pour
is no longer bounded by what could be read back to JavaScript. The device can be
taken away and the show comes back.

**Nine bugs surfaced during the port, and one of them was in a shader.** The
other eight were in the wiring between passes: canvas input that never
registered its listeners, a pipeline built for the wrong attachment format, a
painter reading fields a rung change had already disposed of, a quality ladder
offering a rung the stage could not draw, and four harness checks that had
quietly started measuring nothing. The lesson is written into the plan: the
harnesses that compared shader against shader proved every shader correct and
could not see any of it, because both engines were handed the same inputs. What
found them was the app's own suite, moved onto a real GPU in CI.

**The suite runs where there is a picture.** CI is two jobs now: arithmetic on
Ubuntu, and everything with a frame in it on macOS, where the canvas can
actually be presented.

**Gone with it:** the `?renderer=` flag, `?sim=cpu`, the CPU · 192² option in
the settings, `?filter=bspline`, `?derived=0`, the five shader-parity harnesses,
and the Raspberry Pi appliance and its service files.

### Changed — a new mark: the press

**The icon is a press on the glass.** Blue and green dye fingering outward
from a hand on the plate — the Fillmore sunburst the app draws with Fingering
up — and at its centre a C, a bright meniscus round a dark pool: the old
orange paint cell, opened up into a letter. It replaces the favicon, the
installed-app icons (with a proper maskable one this time, instead of the same
picture Android then cropped the corners off), the iOS touch icon and the
share card.

**The name is in the header, with the mark.** The dish beside the name, and
one finger of dye running out of it and under both halves of it. It is on the
phone-width header, the phone remote and the cast display's waiting card, and
it is new on the laptop desks, which had never said what app they were: the
whole wordmark from 1280 wide, the dish alone below that, where the left of
the header already gives way to the centred mode switch.

**Drawn by code.** `npm run brand` writes every size from
`scripts/brand/art.mjs`, so a change to the mark is one change. The letters
are Jost (SIL Open Font License), turned into shapes once by
`scripts/brand/outline.mjs`, so the wordmark looks the same on every screen and
needs no font to load. `docs/brand/` holds the full-detail files and the sizes
other services ask for.

### Added — the controller shows the show, and says what it is doing

**Knob LED rings follow the settings.** Feedback handled presets, dyes and
actions and ended with `if (level === null) continue` — settings were the one
target kind it skipped, so a controller with rings round its knobs showed
nothing at all. Worse, it showed nothing *differently* from the truth the
moment a preset loaded and moved forty settings the hardware knew nothing
about. Load Crowd Plate and the rings now follow it.

Three things that decides:

- **Absolute controls only.** An endless encoder has no position to show. A
  motorised fader is driven to the value, which is what a motorised fader is
  for.
- **Nothing is sent twice.** Feedback used to run only when a preset, a dye, a
  toggle or the bank changed — a handful of times a minute — so writing every
  control each time cost nothing. It now also runs on a timer, because a
  setting has no event to hang off: a preset moves forty at once, a fader on
  screen moves one, the sequencer moves them over minutes. Forty controls ten
  times a second is four hundred messages a second down a cable that also
  carries the clock, so each control is written only when what it should show
  has actually changed. In the steady state that is no traffic at all.
- **A new port is a controller that knows nothing.** The cache of what each
  control was last told is dropped when the output changes or MIDI comes back,
  or every LED would stay dark until something happened to change it.

**A hideable readout of what the controller is doing.** ⌘K → *Show what the
controller is doing*, or the checkbox in the MIDI panel. The desk shows six
rides and a controller can reach ninety settings, so riding one of the other
eighty-four meant either spending a ride slot on it or riding blind. This is
the third option: a running list of what was just changed and where it landed.

Nothing in it can be clicked except the button that hides it — a thing that
reports the controller should never become a second place to argue with it. It
buffers rather than rendering per message: a fader sweep is a hundred messages
a second, and setting React state on each would re-render the list a hundred
times a second to show a number nobody can read at that rate. Events land in a
ref and the list is rebuilt ten times a second.

`settingLed` came out of the hook so it could be checked: that a sweep survives
the round trip unchanged (a knob at its stop lighting 126 while a preset at the
same value lights 127 is invisible but makes the ring flicker whenever both
happen), that a travel not starting at zero still reads right, that a preset
carrying a value past the end of a binding's range is clamped rather than
wrapped into a number that is not a MIDI value at all, and that a range of
nothing does not divide by it.

### Added — the screen says what the controller hit

A fader always showed itself: the ride's bar and the hardware go through the
same number, so a hand on a fader moved the bar. A **pad** showed nothing.
Press a preset and the look changes, but the row that preset lives on sits
there exactly as it did — which in a dark room reads as "did that work?", and
the answer arrives a second later when the plate crossfades. Long enough to
press it again.

Bindings now publish what they fired, and the matching control rings white for
about a quarter of a second: the cue row for a preset, the swatch for a dye,
the button for an action. A ride's **CC** chip lights while its fader is
moving, which answers the other question a full strip raises — not *is it
working* but *which one have I got hold of*.

White rather than a colour. The design system gives each of its three chromatic
colours exactly one meaning — violet is cued, red is live, green is connected —
and a fourth meaning painted in one of them would make that one stop reading. A
ring rather than a fill or a nudge, because a row that grew or shifted on every
pad press would make a cue list jump under a hand reaching for it.

Three things decided the shape of it:

- **Not React state.** A fader sweep is a hundred messages a second and a MIDI
  clock is twenty-four a beat. Through `useState` at the top of the app that
  would re-render the desk, the cue list and the plate's wrapper on every one.
  It is a plain map of listeners, so a preset press wakes exactly the one row
  bound to that preset.
- **Keyed by what was hit, not by what hit it.** The screen cares that *Crowd
  Plate* fired, not that it was note 37 on channel 1.
- **A moment, not a state.** There is no "untouch"; listeners are told when,
  and decide how long to wear it.

`scripts/panel.mjs` checks the bus itself — that a listener hears what it asked
for and nothing else, that it stops when it lets go, that it leaves no key
behind (at MIDI rate a listener map that only grows is a leak that shows up an
hour into a set), and that a row unmounting mid-press does not silence the
listeners after it. `npm run qa` fires a press through a debug hook, because
the browser it drives has no Web MIDI, and checks that the right row lights,
that only that row lights, and that the light goes out again — a flash that
never clears is not feedback, it is a highlight stuck on the wrong row for the
rest of the night.

Found on the way: the project has no `@types/react`, which is why `ui/index.tsx`
carries its own `Keyed` interface to put `key` back on a component's props. That
is also the root cause of the settings-access gap noted in the patch bay work —
`useRef` resolves as `any` in `LiquidVisualizer.tsx` for the same reason.

### Added — auto-map any controller

Five controllers had factory maps. They are still the right answer when you own
one, because a person read the manual and they know which pads are a grid and
where the master fader is. Everything else — and everything else is most of
what gets carried to a gig — meant MIDI learn, one control at a time, forty
times, in a venue, before doors.

**Auto-map this controller** watches what the hardware sends and works the
surface out from the shape of the messages alone. No device list, nothing to
keep up to date:

- a **fader or knob** sends many distinct values spread across its range;
- an **endless encoder** has no stop, so it reports nudges that huddle at the
  two ends and never sit in the middle — bound as an absolute fader it would
  slam the setting to one end on the first click;
- a **pad** sends a note;
- a **button wired to a CC** sends 0 and 127 and nothing between.

Then it assigns for a show rather than in address order. The **rightmost**
continuous control becomes the dimmer — the master fader's place since the
seventies, and the one control that takes the room down should be where a hand
finds it without looking. The rest ride Sound Drive first (the one that makes
the plate look like it is listening), then Speed, Evolve, Turbulence, the beat
kick, the zoom. A block of pads becomes the preset grid, with its last row kept
for dyes when the block can spare them. Stray buttons become the transport, Go
first. More settings than faders spill onto shift layers, and a spare button is
given Bank + to reach them.

Nothing reaches the show while it is listening. Sweeping the dimmer to build a
map should not black the room out on the way.

The classification is arithmetic over a list of messages, so `scripts/panel.mjs`
drives it with surfaces made up on the spot — a nine-fader desk, a pad grid with
transport keys beside it, both encoder conventions, a button on a CC, a single
lonely knob, a four-fader box with more settings than it can hold, and a stray
handshake message that is not a control at all.

One of those found a real bug before any hardware did: a CC button sending
0 and 127 was classified as an encoder, because it also never sends a middle
value. The thing that tells them apart is zero — a button sends 0 for "off",
and an encoder never does, because on an encoder 0 would mean "no change". Left
alone, every transport button on a cheap controller would have come out as a
knob.

### Added — a patch bay

The room camera could ride a setting. Then the film could too, but only in
lockstep with the room, through one master each. Each time the missing thing
was not a feature but a *routing*, so this is the routing: a patch is a source,
a feature of it, a control it moves, how far, and which plate it lands on.

- **Three sources.** The room's camera, the film projector and the sound. The
  first two are the same analysis over different pixels and offer the same nine
  features; the sound offers its own seven, and switching source moves the patch
  onto a feature the new source actually has — a microphone cannot tell you how
  many people are in the room, and a patch left pointing at a feature its source
  does not have would read zero for ever without saying so.
- **Sound is a source at last.** It was wired to exactly four destinations —
  velocity, density, colour, rotation — and could reach nothing else. Those four
  stay, because the solver reads them directly; the patch bay is the other way
  in, and it reaches everything.
- **Eighty-one destinations, up from forty-two.** Patches could only aim at what
  a MIDI fader can learn, which left out most of the physics: viscosity's
  damping, buoyancy, advection, diffusion, surface tension. They now draw from
  the same registry the desk's pin chips use, which already had to exist.
- **Twenty-two of them can be aimed at one plate.** A reel driving layer 1 while
  the bass drives layer 2. That number is not a choice — it is whatever
  `FluidSimulation.step` reads off the settings object it is handed, because
  that object is the only thing about a layer that can differ. Everything else
  is done once over the finished picture or read from the global fold, so the
  plate selector greys out instead of offering a choice that does nothing.
- **Old looks load unchanged.** `source` and `layer` are optional: absent means
  room, and every plate — which is exactly what every mapping written before
  there was a choice meant. No migration step to get wrong.

Two things the checks caught that review would not have:

**Patches on the same control overwrote each other.** The fold read each
patch's starting value from the *original* settings rather than from the
running total, so two patches aimed at one control silently became whichever
was last in the list. `two patches add` in `scripts/scene.mjs` is the only
thing that could see it.

**`PER_LAYER` was written from memory and was wrong six ways.** It named
heatIntensity, boilingPoint, fingering, beatSqueeze, rotationSpeed and plateRock
as per-plate; the solver reads none of them — three are read in the render loop
and one is passed as a parameter. It also left off fifteen the solver does read.
`scripts/panel.mjs` now reads the solver's own source and checks the list in
both directions: nothing offered that the solver ignores, nothing it reads left
off. A dropdown that offers a choice doing nothing is worse than one that does
not offer it.

`scripts/scene.mjs` grew from 24 checks to 33, over source routing, per-plate
routing, masters, staleness, clamping, and that a patch aimed at a plate which
is not on stage tonight is skipped rather than throwing.

### Added — the film drives the plate

The film projector was a slide. A loop, a camera or a captured window went
through the dye and contributed light and nothing else, while the room camera
had been read back as a *sensor* since it was built — flow into the liquid,
features onto settings. The film now gets the same treatment, because there was
never a reason it should not: the analysis is a pure function over a pixel
buffer and the stir takes a reading, not a camera.

- **Film Drive** puts the reel's own motion into the liquid. A pan drags the
  dye the way it pans, a crowd scene stirs it, a locked-off shot does nothing —
  which is correct, because nothing is moving.
- **Film Impact** reads the same mappings The Room uses. Deliberately not a
  second list: "how busy → Turbulence" means the same thing whether the
  busyness is a crowd or a chase sequence, and an operator who had to build the
  mapping twice would build it once and wonder why the other source was silent.
  With both masters up the offsets add, and the clamp to each setting's own
  travel is what stops that running away.
- Both default to zero and the sensor does not run at all until one is turned
  up, so a projector used the way it always was costs exactly what it always
  did, and a look saved before this shows the same picture and moves the same
  way.

Three things the film is deliberately not given: no people tracking (the
tracker is for a room with dancers in it; on a film it would read a face in
close-up as someone standing still and press the plate with it, and skipping it
is a third cheaper), no mirror (a film is already the way round it was shot),
and no analysis while paused (a still frame is twenty readings of nothing a
second, at a real cost).

`videoSense.ts` is new and holds the part both sources share — the square crop,
the small canvas, the read-back. The square crop especially: the fluid grid is
square, so taking the middle square means a movement travels across the plate
at the speed it travelled across the frame instead of being stretched, and a
film is 16:9 or 4:3 or 2.39:1 — exactly the case a second copy would have got
wrong. The room camera's hook now goes through it, and `npm run scene` still
passes all seventeen of its original checks.

`sceneMap.ts` is new for the same reason: the mapping fold stopped being
single-source, and summing two sources while holding each one's staleness and
clamping to a setting's travel is three chances to be subtly wrong in a way
that looks like "that's a bit much" rather than like a bug. It takes its clock
as an argument so staleness can be tested without waiting, and `scene.mjs` has
seven new checks over it — verified by breaking the summation and watching
`two sources add` go red.

### Added — a film that is not on your laptop

The film projector could be fed by a video file or by the camera, and both need
the footage to already be on the machine. The third source is **Window**: press
it, pick a tab or a screen from the browser's own chooser, and whatever is
playing there goes through the dye.

This is the only way that can work, which is worth writing down because the
obvious alternative looks easy and is not. A cross-origin video will play in a
page, but the moment WebGL reads it back into a texture the texture is tainted
and the call throws; setting `crossOrigin` does not help, it only makes the load
fail earlier. It needs a CORS header on the media response, and the Internet
Archive does not send one — checked: none on `/download/`, none on the data node
it redirects to, and `OPTIONS` there answers 405, so there is no preflight
either. Their search and metadata APIs *are* open (`access-control-allow-origin:
*`, no key), so finding a film from inside the app is easy; it is only the
pixels that cannot be fetched. A captured window has no origin, so it sidesteps
all of it — and reaches a media player, a slide deck or another copy of this app
at the same time.

The Archive's Prelinger collection is thousands of public-domain reels from
exactly the era these shows come from, which is the pairing this was built for.

Nothing is requested until the button is pressed, the browser's picker decides
what is shared, and a capture stopped from the browser's side puts the panel
back to "off" rather than leaving it claiming a window that has gone.

### Changed — the gate no longer costs most of an hour

A deploy waited forty-six minutes to publish a build that takes fifty seconds,
and nobody had measured which part of that was expensive. From the run that
published the previous commit: the seven pure-logic harnesses 0.5 min, the wall
9.8 min, the show night 34.3 min, the publish itself 0.8 min.

- **The wall and the show night are parallel jobs.** They were two steps of
  one, so the gate cost both added together and the ten minutes were pure
  latency on top of the thirty-four. They share nothing but the build.
- **Superseded pull request runs are cancelled.** A second push left three
  runners grinding on a commit nobody was waiting for, one of them for most of
  an hour. Deploys are exempt — `deploy.yml` holds its own concurrency group on
  the live channel.
- **Every check in `qa` prints when it was reached and what it cost**, with a
  slowest-checks table at the end. Which check is expensive is not something
  that can be read off the source: half of them wait on a renderer running at a
  few frames a second. The first profile found single clicks costing 133 and 54
  seconds — and the fixed waits, the obvious suspect, accounting for 69 seconds
  across all seventy-three of them.
- **`?dpr=`, and what it was for.** `ps` during a run: the browser's GPU process
  at 309% CPU shading fragments through SwiftShader, the process running React
  and the fluid solver at 9%. Three of four cores, and every step of the harness
  queueing behind them. So the lever is the pixel count, and fragment cost falls
  with its square — measured, for one round trip to the page at 1440×900:

  | `?dpr=` | canvas | one `page.evaluate` |
  |---|---|---|
  | 1 | 1440×900 | 2831 ms |
  | 0.5 | 720×450 | 789 ms |
  | 0.35 | 504×315 | 446 ms |
  | 0.25 | 360×225 | 293 ms |
  | 0.2 | 288×180 | 228 ms |

  It flattens below 0.35 as the cost that is not the canvas takes over. The show
  night runs at 0.35 and the wall at 0.5 — the wall more conservatively, since
  it is the harness that makes precise claims about geometry, and even there
  each of its 32×18 grid cells is still a mean over sixteen by twenty source
  pixels. Nothing either of them asserts depends on resolution: layout and
  geometry are CSS, and both reduce the canvas to a coarse grid addressed in
  fractions of the picture. `QA_DPR=1` and `WALL_DPR=1` run them at full size.
  The override is query-string only, so no preset, fader or saved look can reach
  it, and a plain visit renders at full resolution.

### Changed — a settings screen you can find something in twice

The panel held sixteen sections and eighty-six controls in one scrolling column
with a three-way filter on top, and neither half of that worked. The filter hid
ten sections behind a tab nobody had reason to press; setting it to *All* — which
is what both desks did — made the column eight screens deep. Either way the
answer to "where is the thing that turns the video on and tracks people" was to
scroll and hope.

- **A rail and one section at a time.** Seventeen named places in four groups —
  Inputs, Look, Plate, Stage — and a click puts you in one of them. The search
  box still spans everything and searches what a section is *about* rather than
  what it is called, and while a query is in it the rail narrows to the hits, so
  it reads as a result list rather than a menu whose rows mostly lead nowhere.
  `npm run qa` clicks every row on the rail and checks it lands where it says,
  with nothing else in the pane and no section more than three screens deep
- **Any control can go on a desk.** Every slider in the panel carries two chips,
  **P** and **D**: put me on the Perform desk, put me on the Design bench. Both
  strips now draw from one registry (`src/lib/deskPins.ts`) covering all
  eighty-seven controls rather than the forty MIDI knows, and Design's recipe —
  which was a hard-coded eight, so the one screen whose job is building a look
  could only build it out of eight of the ninety things a look is made of — has
  the same Choose picker the rides have had. Both lists persist per machine.
  `npm run panel` is new: it reads the panel's own source and fails if a slider
  appears there with no entry in the registry, because two lists that must agree
  and cannot be derived from each other is the shape that drifts in silence.
  `npm run desk`, which has existed since the desk was built and had never run
  in CI, is now in the gate alongside it
- **Sound Drive is in Settings.** The headline ride — the first fader on every
  factory map — existed only in the narrow-screen toolbar, which a desktop never
  draws. The panel that claims to hold every setting did not hold the most
  important one

### Added — the controller, back where it can be found

Factory maps for five controllers, MIDI learn, soft takeover, shift banks, LED
feedback and a picture of the hardware drawn to scale had all been in the app for
a long time. On a desktop none of it was reachable except through ⌘K, because the
button that opened it lived in the narrow-screen toolbar the desks replaced.

- **Settings → Inputs → Controller**: turn MIDI on, pick the port, and — if the
  port's own name is one we recognise — take its factory map as a single button,
  *Set up the APC40 mkII*. Everything past that is still the MIDI panel, one
  click away
- **The MIDI status dot opens it.** It was already in the header of both desks,
  reporting all evening that no controller was connected, with no way from there
  to the screen that would connect one
- **One list of controllers.** The settings section and the MIDI panel draw their
  factory-map buttons from the same list in `src/lib/midi.ts`, which also carries
  the patterns that recognise the hardware, so they cannot come to disagree about
  which devices are supported

### Added — the wall, and the things that stop a show going dark on it

Six findings from reading the app against the history and craft of liquid light
shows, and against what a projectionist actually does on a show night.

- **A lost GPU comes back.** Plugging a projector into a running laptop, a Mac
  switching between its integrated and discrete GPU, a driver resetting under
  load: the browser takes the WebGL context away and everything in it, and
  nothing was listening. The canvas stayed black for good and the only fix was
  a reload, which mid-set also loses the plate, the cue list and the
  sequencer's place. Now caught and rebuilt, with the look laid again on the
  other side. The first version restored the machinery onto an empty plate —
  with the GPU solver the dye lives in GPU textures and `dropGpu` throws it
  away rather than stall on a dead context — which on a wall is the same black
  rectangle as not recovering at all. `npm run qa` takes the context away with
  `WEBGL_lose_context` and checks the only thing an audience can see
- **Nothing dims, sleeps or screensaves.** The phone remote held a wake lock;
  the laptop actually driving the projector did not, and the README's answer
  was to turn off sleep by hand. It needs a secure context, so the panel says
  plainly when an address cannot have one rather than promising something that
  never happened
- **The Wall** (Settings → Projectors) — rear-projection mirror, a four-corner
  keystone, feathered edge blanking, and an output gain and gamma for the room.
  Load-in work that every liquid light show has done since 1965, and the one
  part of the craft the app had no answer for except "capture the window in OBS
  and fix it in Resolume". It is a property of the venue, not of a look: kept
  on the machine, never written into a preset, and out of reach of every fader.
  `npm run wall` measures it — every gate a statement about which pixels are
  black, so they hold whatever the plate happens to be doing
- **Three flashes a second, and no more.** Nothing here was built to strobe and
  the code says so in several places, but that was a habit rather than a
  guarantee: any audio band can be mapped onto any setting, `dimmer` is one of
  them, and a bass-driven master brightness at 150 bpm is a 2.5 Hz full-field
  flash nobody decided on. A probe reads back what actually reached the screen;
  the guard counts flashes by the clinical rule and scales the master dimmer
  only when there are too many. Counting rather than smoothing is the design: a
  single hard hit on a kick is left completely alone
- **A tempo that is not a guess** — MIDI clock on the port the faders are
  already on (0xF8 is one byte and `parseMidi` wanted two, so clock had been
  falling on the floor all along), four taps, or a typed bpm. Each sets the bar
  as well as the tempo, which is the half that matters
- **Shift layers on the controller**, so nine faders reach forty settings; and
  Go, Back, cue stepping and Tap Tempo as actions, so the desk's safe way to
  change a look in front of a room is finally something a pad can do

### Fixed — ten of the sixteen settings groups could not be found
- The settings sheet splits into Perform and Setup so that eight screens of
  scrolling is not what you meet mid-show. What it also did was hide ten of the
  sixteen groups behind a tab nothing gave anyone a reason to press, on a panel
  that opened on the other one — so the room camera, the projectors and the
  wall, the solver and the physics were all there and none of them could be
  reached. On the desk, which owns the window above 1024px, the only way in at
  all was ⌘K, which you have to already know about
- Three ways in now, all of them checked. **All settings…** is a pinned button
  on both desks — under the recipe on the bench, under the rides on the desk —
  because a surface that cannot reach the whole of what it is running is not a
  control surface, however deliberately few controls it shows. The sheet has an
  **All** tab and opens on it whichever door you came through. And ⌘K carries
  one row per group, so "the room" lands on the room rather than on the top of
  a panel that has it somewhere
- Opening on All is a rule rather than a mode: it was first `design ? all :
  perform`, and then Perform grew the same button — which landed you on six of
  the sixteen groups, so a button named "All settings…" was lying about what it
  did. The Perform and Setup halves are a filter you pick now, never a default
  that hides ten groups from someone who just asked for all of them
- A **search box** that matches what a group is *about* rather than only what
  it is called: "camera", "video", "people" and "crowd" all find The Room, and
  none of those words is in its heading
- The first version of the button was at the end of the recipe column, which
  scrolls — so the one control whose entire job is to be findable was itself
  below the fold. The harness checks that it is on screen, not that it exists

### Fixed — the mode switch moved when you used it
- Design carries Save and Send to wall in the header and Perform carries
  nothing, and the header was laid out with `justify-between` — so the middle
  group slid sideways by the width of two buttons, measured at 137px, every
  time you switched. The one control whose whole job is to be in the same place
  every time was the one that moved when you pressed it
- Pinning it with a three-column grid fixed the movement and clipped Design's
  status dots instead, because at 1440 the right-hand cluster needs more than
  half of what is left over. It is out of the flow now: centred on the header
  itself, sides at their natural width. Measured at 1280, 1440 and 1920 —
  exactly centred, identical in both modes, nothing clipped

### Fixed — what a review of the above found
- **A keystone on a photographic preset was a black wall.** The output pass's
  own target was allocated only on the branch where no camera pass existed, so
  with one on — Oil on Water, Colorful Cosmos, Sunny Side Up — the camera
  rendered into a framebuffer with nothing attached and the output pass then
  sampled a texture with no storage. `npm run wall` now runs its masking and
  corner-pin gates a second time through a camera; reverting the fix turns
  three of them red
- **Every CI run would have failed.** The new workflow asked for Node 20, and
  four of the harnesses run their TypeScript directly through
  `--experimental-strip-types`, which arrived in 22.6 — and `deploy.yml` waits
  on those harnesses, so nothing would ever have deployed again
- **Two taps in the same millisecond hung the tab.** A pad that double-sends
  gives a zero interval, and folding zero into the tempo range doubles it for
  ever. Taps closer together than a fortieth of a second are now one press
  arriving twice, which is what they are
- **One fader drove two settings.** A control with both an always-live binding
  and one on the current bank fired both. The bank-specific binding now
  shadows the always-live one, and the LEDs decide once per control rather
  than once per binding — where before an out-of-bank binding could blank a
  pad that was live through its other one, depending on list order
- **A luminance reading that went backwards in time.** Both of the frame
  probe's buffers can land in the same frame after a stall, and draining them
  by slot index rather than by when the read was issued left the older one
  winning — which to a guard counting peaks and troughs is a flash that never
  happened
- **A check that could never fail**, in the harness for the guard: it asserted
  that a debug hook returned an object, which it does whatever the guard is
  doing

### Fixed — the fluid solver threw away readbacks it had just paid for
- Pre-existing, found while measuring the above: `readbackAsync` started a read
  into a pack buffer every frame whether or not the previous one had come back,
  which discards it — two downsample passes and two `readPixels` for a result
  nothing would ever look at, on exactly the machines least able to afford
  them, with the driver saying so about six times every twenty seconds
- It now collects whatever has landed, in the order the reads were issued, and
  starts a new one only into a buffer nobody is waiting on. Measured on the GPU
  path: 0 warnings in 51 seconds, against 9 in 30 before

### Added — a first visit that shows what this is
- `audioSource` started at `'none'` and nothing opened on its own — a good
  decision about permissions with the side effect of landing every stranger on
  a plate with nothing driving it. The synthesised band now starts on the first
  gesture: silent, no device, no permission. "Never chosen" is now a different
  question from "chose silence", which is what makes that safe

### Added — checks before a deploy, and pictures in the README
- The deploy workflow ran `tsc` and `vite build` and nothing else, so the six
  numeric harnesses and the browser walkthrough were run by nobody but a person
  remembering to. Since `npm run show` pulls main on show night, that added up
  to: an untested main is what turns up at the venue. `checks.yml` now runs
  them on every pull request and gates every deploy
- They could not have run there as they were: each hard-coded the sandbox's
  Chromium path, so anywhere else the launch failed rather than falling back to
  the browser Playwright had just downloaded
- `npm run shots` drives the app and reads its canvas (a screenshot never
  resolves over a canvas that repaints sixty times a second) and writes the
  frames the README had never had


### Fixed — a blank screen on the live site after a deploy
- The build itself was fine: it rendered the whole desk in a clean browser at every
  width from 390px to 2560px. What was not fine was what a *returning* browser had
  stored — and no harness had ever looked at that, because every harness runs in a
  fresh context where no service worker exists
- Firebase Hosting rewrites anything that does not match a file to `/index.html`, which
  is what makes deep links work. It applies to `/assets/` too, so a chunk from a
  previous deploy does not 404 after the next one — measured against the live site,
  `GET /assets/App-DOESNOTEXIST.js` returns **200, `text/html`, 1320 bytes**
- The service worker cached `/assets/**` cache-first and stored anything with `res.ok`,
  so a stale page asking for its old chunk wrote **HTML under a `.js` URL**. The cache
  name was a constant unchanged since the worker landed, and `activate` only deletes
  caches whose *name* differs, so that entry was permanent. Reproduced against the
  deployed worker before changing anything
- The app is one lazy import behind a `<Suspense>` whose fallback is a black rectangle
  the size of the window, and **nothing caught a rejected import**. So: black screen,
  every reload, for good
- A 200 of HTML under a script URL is a file that is gone. It is never cached now, and
  never served from the cache if an older worker left one there; the cache name is
  bumped so v1's contents are dropped on activate
- And a boot failure is no longer silent. A chunk that will not load clears the caches,
  unregisters the worker and reloads once; if a clean copy still cannot start, the page
  says what went wrong and offers a button rather than staying black. A chunk that
  simply never arrives turns into the same button after eight seconds

### Added — `npm run sw`, which would have caught it
- Serves the build behind a stand-in for Firebase — static files, everything else
  rewritten to index.html with 200, which is the one property of the host that matters
  here — then checks that a rewritten page is never written to the cache under a script
  URL, and that a chunk which is genuinely gone puts a readable message and a way out on
  the screen instead of the black fallback


### Fixed — the plate took no brush at all
- The desk is `fixed z-10` and its preview is a transparent hole in it; the plate was
  `fixed` with no z-index. So the plate showed *through* the hole while the desk stayed
  the topmost element over it, and every mousedown landed on the hole. The canvas's own
  listeners never fired: **the bottles, the dyes and all seven tools did nothing on
  either desk**
- From the room that reads as the preset carrying on untouched — which on a blue look
  is a red bottle "coming out blue". It is the user report this was chased for, and it
  was never the dye. Frozen, so nothing advects and nothing mixes, the dropper injects
  **(1, 0.002, 0.002)** for Cherry Red and **(0.224, 1, 0.078)** for Limpid Green on the
  GPU solver — the `PALETTE` entries to three places. The absorption store, the
  renderer, the subtractive mix and the bottle are all exonerated
- Raising the framed plate to `z-20` is safe because a framed plate is clipped to the
  hole it was measured into: it covers the preview and nothing else, and stays under the
  sheets (z-50) and the palette (z-80)
- Behind it, a second fault: `drawnRect()` corrected for letterboxing only when a
  projector stage was attached, but `objectFit: contain` is set for the desk's preview
  too. A 1200×800 buffer shown in a 582×606 hole is **109px of vertical error and a 2×
  scale error** — so even with the pointer reaching the canvas the brush would have
  landed somewhere else

### Changed — the desk, rebuilt to the design
- **Perform and Design share one frame**: `272px 1fr 312px` by `48px 1fr 28px`, a common
  header with the breadcrumb, the mode switch, the status dots and the ⌘K chip. The
  plate is a hole in the middle that the WebGL canvas is painted over and never
  re-parented into — a remount would lose the context
- **⌘K replaces the preset menu.** Looks, tools, actions and panels in one list with
  subsequence matching; `⏎` arms a look, `⇧⏎` sends it now. Most of the app is reachable
  only this way under a desk, which is the point: the desk shows what a hand needs
  mid-show and the palette holds the rest
- **The bench**: Design gets the same three columns — bottles, the dye grid and palettes
  on the left, the plate labelled *not on wall* in the middle with all seven tools, the
  recipe on the right, and Macro plus a guarded Randomise along the bottom
- **Settings, MIDI and Sequence are sheets** rather than floating panels
- **The rides** are assignable from `LEARNABLE_SETTINGS`, the same list MIDI learn
  offers, and move live when a controller moves them
- **The remotes**: a tap on the phone *arms* a look rather than firing it, with a fixed
  transport bar; the iPad gets a cue rail of its own. The wall captions a blackout so a
  dark screen is never ambiguous
- **Hit targets**: the ride sliders had a 22px grab strip over an 8px track. 32px now,
  with a 22px thumb

### Changed — bubbles belong to the liquid now
- They read as stickers over the plate rather than air in it. Each one is now tinted by
  the film underneath it and fades with that film's thickness, so a bubble on thin
  liquid is barely there and one on a thick dye carries its colour
- And there are fewer: the default drops from **0.5 to 0.2**, every preset's value is
  halved, and the room and spawn chances come down with it. Count and per-bubble
  strength are set on separate curves — scaling both by the same number was how a
  "stronger" setting could put twelve bubbles on the plate and change zero pixels

### Fixed — Esc closed three panels out of seven
- The handler listed Settings, Help and the track panel. MIDI, the sequencer, Save and
  the command palette stayed up

### Changed — harnesses that can tell one dye from another
- `npm run qa` is 57 checks. Two of them used to be `check(..., true)` — a condition
  that is the literal `true`, which is how painting could die on both desks without a
  single check going red. The plate one now freezes the liquid, drags, and reads what
  the brush laid down
- `npm run dye` was rewritten around the same freeze. Photographing the plate before and
  after a stroke measures the dye only on a plate that is otherwise still; on Galaxy it
  read **362,366 of 583,000 pixels** as "changed". Bracketing against the plate's own
  drift did not save it either — a still brush still showed 2,549 cells gaining density
  where the dropper reaches 69, and it returned the same 219° for a red bottle and a
  green one. It paints a control colour as well as red now, because a check that cannot
  tell red from green is not measuring dye whatever number it prints
- Its engine check was vacuous too: it read the label once at startup, and the governor
  steps the solver *down* mid-run. A run that opened on `GPU · 384²` was measured on
  `CPU · 192²` forty seconds later. The grid is pinned with `?sim=384` and the engine is
  read at each measurement
- Both suites now ask the question hit-testing answers rather than the one geometry
  does: the desk's columns clearing the preview hole says nothing about whether the
  pointer can reach the plate through it


### Changed — the settings panel is a control surface, not a document
- The panel was **eight screens** of vertical scroll (7309px in a 900px window) with
  **722 words** of prose in it. One paragraph ran to 198 words directly above a fader
  someone wants to move mid-song
- Split in two: **Perform** holds what a hand reaches for during a show — Light Show
  Look, Show, Lamp, Macro Closeup, Automation, the Mixer. **Setup** holds what is
  decided once — the audio device, the audio wiring, the camera, the room, the other
  projectors, the solver grid, and the physics that define a look rather than ride it.
  Perform is **2.8 screens**, Setup 4.8, and Perform opens first
- All fourteen explanations are behind an **ⓘ** now, closed until asked for. The writing
  stays — several of these carry the one fact that stops a control being used wrongly,
  like aiming the room camera at the floor rather than at the screen — it simply is no
  longer standing between the projectionist and the sliders
- The bottles are paired two-up. Nine in a single column ran the bench past the bottom
  of a laptop screen, which put the four that change the plate below the fold; the left
  column is 1.3 screens now rather than 1.6
- `npm run qa` checks the split holds: Perform must be the shorter half and fit in
  about three screens, every explanation must start closed, and clicking one must open
  exactly one

### Added — the desk (plan batch 8b–8f)
- **Perform**, beside Design: the plate becomes a preview and the controls get the
  room, because during a show the plate is already on a wall behind you and the thing
  you cannot see is the desk. Design — the plate filling the window — stays, and is
  still the right shape for building a look. Checked in `npm run qa`: toggling to
  Perform does not change the canvas's backing store by one pixel (1440×900 in both,
  while the box it is drawn in goes 1440 → 688 wide), because with a projector
  attached the render size comes from the projector and never from this window
- **On the faders**: six controls always out, at 44px of grabbable height, chosen from
  `LEARNABLE_SETTINGS` — the same list MIDI learn offers, so the desk and the
  controller map cannot disagree about what is rideable. In Perform the three floating
  sliders that duplicated them are hidden
- **A status line**: what is live and for how long, the sequencer's stage and progress,
  the audio source and its level, and whether the projector, MIDI, room camera and
  recorder are on. Nearly all of it was already computed and never shown
- **Lucky is guarded**: it replaces all eighty settings from one click, next to controls
  used mid-show. It now keeps the look it replaced, so Revert brings it straight back,
  and in Perform it asks once before firing

### Changed — readable in a dark room
- Measured rather than judged, and the measurement corrected an assumption: **no**
  actionable control was ever under 60% opacity. What was real was size — eleven
  controls carried text at 8, 9 or 10px, the dye swatches were 20px square, and three
  sliders had a 4px-tall hit area. Type now has an 11px floor and nothing clickable is
  under 24px, both checked by `npm run qa`
- The plan asked for 44px hit targets. Measurement showed that to be the wrong target:
  it would give the sixteen dye swatches 704px of column to themselves

### Added — the desk, part one: Cue and Go (plan batch 8a)
- Clicking a preset used to put it on the wall that instant, through `applyPreset` —
  which clears every layer and reseeds. That is right while you are *building* a look
  and wrong at 11pm with the plate on a wall behind you: the clear is a hard cut
  through near-black in front of a room. A look is now **cued** instead, and nothing
  reaches the stage until **Go**
- **Go** adopts the new preset's dyes onto the plate that is already there and walks
  the ~80 settings across over a chosen time (cut, 1, 2, 4 or 8 seconds), so the dye is
  never wiped. `src/lib/lookFade.ts` is pure, so `npm run desk` drives a whole fade and
  measures what came out — over all 992 pairs of presets a faded change never sags
  below either end at all, while the clearing path drops the stage to 2%. **Load**
  stays on each row for when landing on clean glass is the point
- **Revert**: one step back to the look before the last Go, at the same fade. The
  fastest fix mid-show is undo, and a menu is not fast

### Fixed — a sequence changing to one of your own looks cut to black
- `adoptPreset` is the non-destructive path, but a *user* preset's dyes live in its file
  rather than in the plate's maps, so the only way to register them was `applyPreset` —
  which clears. A sequence that changed to a built-in glided; the same sequence changing
  to one of your own saved looks wiped the plate. `adoptPreset` takes the dyes directly
  now

### Fixed — a fade that did not quite land where it was aimed
- `a + (b - a) * 1` is not `b` in floating point: fading 0.5 to 0.05 landed on
  0.04999999999999999. Too small to see, but it means the look you cued is not the look
  you got, so fading back and forth would drift rather than return
- The crossfade runs on a timer rather than `requestAnimationFrame`, for the reason the
  dimmer already did: the laptop's window spends a show behind the projector's, and a
  hidden tab stops animating. A Go fired from a MIDI pad while the operator is watching
  the wall would otherwise freeze half-way through and stay there

### Added — the manual, in the app
- **About ChromaGlass** (the `?` button, or `?` on the keyboard): a fourteen-section
  guide — getting started, the mental model of the plate, a reference for every group
  of controls, a section on how they interact, and a history of the app. The
  interaction section is the one that earns it: the app has about eighty controls and
  a dozen real couplings between them, and the couplings are what nothing else
  documents (Dye Budget and Evaporation and Evolve Speed are one loop; Blob Surface
  Tension does nothing at all with Polarity at zero)
- It replaces a five-line help popover which, by the time anyone read it, had two
  lines wrong — it was still sending people to the settings panel for presets months
  after the presets moved to the title

### Added — the bottles, where a hand can reach them
- The dropper's nine liquids are shown in two groups, **Dye** and **Changes the
  plate**, with the selected one's description under the list. They were one flat row
  of coloured chips, which made Soap look like a pale green dye and Milk like an
  off-white one — nothing said that four of the nine write into a field the plate
  keeps acting on
- The phone and iPad pad gained a **Bottle** row. It had dye colours only, so the
  most performable gesture in the app — a drop of soap on a full plate — was reachable
  from the laptop and nowhere else. A new `liquid` message sets the display's selected
  bottle; an id the display does not know is ignored, so a newer pad and an older
  display do not have to agree

### Added — the room in the plate (plan batch 7)
- **The Room** (Settings → The Room): the camera has always been able to show through
  the dye as a film loop; it is read back now instead. `src/lib/sceneSense.ts` takes
  pixels and gives a reading — a 24² Lucas–Kanade flow lattice, a presence mask against
  a creeping background, and the scalars worth mapping — with no DOM and no WebGL, so
  `npm run scene` can judge it against painted rooms rather than a webcam and a sofa
- **Room Drive** (`sceneDrive`): the flow lattice upsampled onto the grid and added as
  velocity each solver step. With the GPU solver attached the CPU arrays are that step's
  deltas, so one loop drives both engines and neither needed a new upload path. A wave
  of an arm reaches the plate 100 ms after it happens
- **Hands** (`sceneHands`): everyone the sensor holds becomes a projectionist — still is
  a palm on the top glass (so **Fingering** breaks it into spokes), moving is a puff of
  air the way they are going, arriving is a drop. All of it through `performGesture`,
  which is the body `applyGesture` always had, lifted out so the handle and the room
  share one path. A track's id picks its dye from the preset's palette contract, so the
  same dancer keeps the same colour across a set
- **On the controls** (`sceneMappings`, `sceneImpact`): how busy the floor is, how many
  people, how spread out, where they are, which way they are going, how light the room
  is and what colour — any of them on any control a MIDI fader can learn, over the same
  travel table the faders use, with one master depth. Folded into the settings once a
  frame into a reused object, so nothing downstream knows the camera exists
- **Room Drive**, **Room Hands** and **Room Impact** are MIDI-learnable and **Watch the
  Room** is an action, so the camera can be brought in and killed from a pad mid-show
- Preset **Crowd Plate**: a plate deliberately calm to start with so what the room adds
  is what is seen moving, the music down to 0.35 so it is not the loudest hand, and six
  dyes in the contract rather than the usual two or three — a crowd wants more colours
  to hand out than a clock face does
- Whether a camera is watching, and which one, lives in localStorage rather than in the
  settings: loading someone else's preset should not open your camera. Frames are read
  in the page and never leave it, and nothing is recorded

### Fixed — the camera that opened and was never read
- `await video.play()` on a video element that is not in the document can never settle,
  so the state update that marks the sensor live and the interval that does the analysis
  were both dead code: the panel said Watching, the camera light was on, the preview was
  blank, and no error said why. Found by driving the built app in a browser

### Added — a band in the box, and nothing opened unasked
- **Band**, beside Mic, System and File: a synthesised kick, snare, hats, bass and pad
  in verses, choruses and a break at 122 bpm, played silently into the analyser
  (`src/lib/simulatedMusic.ts`). It is a stream rather than a set of numbers, so the
  analyser, the room calibration, the beat clock's tempo lock and the band mappings all
  run exactly as they do on a microphone. No device, so no permission and nothing to ask
- The app opened the microphone on load, every load, putting a permission prompt over
  the plate before anyone had asked for one. Where the show listened last is remembered
  now, and the microphone only comes back where the Permissions API already says
  granted. The room camera gets the same rule: a click may prompt, a remembered setting
  may not

### Fixed — track intelligence: the gap it could never hear, the song it never heard
- The song-boundary detector timed silence against `calibration.signal`, the room gate
  held open 1.5 s so the visuals do not strobe between beats. Its release alone is
  2.85 s and the boundary wanted 2.5 s on top, so a song could not end until 5.35 s of
  silence — longer than the gap between almost any two tracks. Measured with
  `npm run music`: of a 1 s, 2 s, 3 s and 6 s gap, only the six-second one ever fired.
  The unsmoothed verdict is exposed as `calibration.sound` and timed against over 1.8 s
  of the boundary's own; a CD's two seconds, a playlist's three, a long gap and a gap in
  a loud room now all fire the instant the next song starts, while a crossfade and a
  rest inside a song still do not
- The local fingerprint matcher's confidence test was the winner against the best
  alignment on *another* track, so with one track in the library there was no runner-up,
  the test was vacuous, and it named that track for every song put in front of it — and
  a library of one is where everyone starts. The winner must now also stand 3× over its
  own track's 90th-percentile alignment. Measured over twelve genuine snippets, clean
  and through a simulated microphone, and twelve from tracks never heard: genuine
  3.9–5.0×, strangers 1.5–2.1×. After the gate, 12/12 genuine still match with position
  good to 0.03 s, and 0/12 strangers and no white noise do
- Local re-matching while a track is known drops from 20 s to 12 s — the only thing that
  catches a change on a gapless service, where no boundary can be heard and the API is
  on a 35-second leash to spare its quota

### Added — judging it by numbers
- `npm run scene`: the room sensor against painted rooms through the real analysis,
  plus a closed feedback loop run for forty seconds and a person who walks in and stops
- `npm run music`: level traces through the real calibration into the boundary detector,
  and synthetic songs through the real matcher
- `npm run qa`: builds, serves and walks a browser through a show night — a preset
  applied, every slider ridden, every panel opened, the camera switched on, the band
  started, the plate dragged, a reload, a phone-width screen — watching the console

### Changed — which preset is active, derived rather than stored
- It was state re-derived by an effect on every settings change, walking every preset
  and comparing every key. It is a question about the settings, not a separate fact to
  keep in step with them, so it is computed during render. No measurable speed-up — a
  CPU profile puts that sweep's cost in the software-WebGL fluid solver, with React
  at about 2 % — but one effect, one render pass and a class of drift gone

### Added — a projector on HDMI, noticed and used
- **Second Screen** (Settings → Projectors, and the chip): **Ask** offers the projector in one click as before; **Automatic** sends the show there by itself, fullscreen on the projector, on the next click or key press anywhere in the app, and again whenever the projector is plugged back in (`src/hooks/useProjector.ts`, watching `screenschange`); **Off** offers nothing. Closing the projector window by hand does not re-send for the same screen. The choice is kept in localStorage
- The Second display window opens as a fullscreen popup placed on the projector's own bounds when the screen is known, so no click on the projector window is needed for fullscreen

### Changed — Fillmore on a plate that keeps its dye
- With the drain gone the Fillmore dish saturated (a density mean of 1.4 against the 1.2 budget, most of the core at the top of the render) and a press could hardly show: its budget is 0.9 now, where the regulator that never used to reach holds the dish full but not solid

### Added — pigment in the liquid (plan batch 1, second half)
- **Granulation** and **Grain Size** (`granulation`, `grainScale`, Settings → Liquid,
  MIDI-learnable): heavy pigment does not stay in suspension, it separates into a fine
  speckle, and that is part of why a filmed pour carries texture everywhere rather than
  only at its boundaries. The speckle rides on the dye's thickness, so the colour and
  the lighting follow it instead of it being painted over the top.
- The coordinates it is sampled at come from the solver, which carries them along with
  the flow (`seedGrain` in gpuFluid.ts), so the texture is painted on the liquid rather
  than on the glass. Coordinates advected for long enough stretch into streaks, so two
  phases are carried at once and reseeded half a period apart, each one's weight zero
  at the moment it resets and one at the middle of its life; neither the reset nor the
  crossover is visible. Contexts without float render targets, and the CPU solver, fall
  back to a screen-fixed grain.
- Measured inside the plate rather than across the frame (most of the frame is the
  black surround, which drags every whole-image statistic toward zero): pixels on a
  hard edge 4.8 % → 6.1 % against a filmed pour's 5.6–7.3 %, typical local contrast
  2.7 → 3.3 against 6.5–7.2. Structure at 4 and 8 px barely moves, which is as expected:
  a speckle is not mid-scale structure, and that gap is what lacing and drops are for.

### Fixed — a thread is a few pixels wide, on a rim or on a fifty-cell ramp
- Width as a fraction of the whole change reads right at a boundary and turns into a pale
  bar a fifth of the band across on a wide one, because the change is spread over that
  many pixels — measured on the projector, a rim got a 3 px thread and a fifty-cell ramp a
  15–20 px smear. That is what replaced the stacks rather than removing them. The width is
  set in pixels now and only then capped by the change, which keeps a narrow band's thread
  inside its own boundary
- **The walk stops on a fraction of a step, not a whole one.** Stopping on a cell made the
  reach, the middle and the width piecewise constant over patches of the plate, so the
  threads carried cell-sized stair-steps along their edges and broke into dashes where the
  patches were small. Blending the last step by how far the colour got through it makes
  all three continuous, for no extra samples

### Changed — one thread, found by walking the boundary out
- A wide *steep* band still stacked four or five threads, at the default and not only at
  full strength, and no threshold closed it without taking the real boundaries too: the
  band is as steep per cell as a real boundary, so nothing sampled at the pixel tells them
  apart. What it has that a boundary does not is **more than one level crossing across the
  one change** — because the spacing came from a fixed ±4-cell window whose ends fall
  inside a change that wide, so the level repeats
- The pass now walks out along the normal, two cells at a time, while the colour is still
  changing at a boundary's rate, and draws a single thread at the middle of the whole
  change. There is one middle, so there is one thread, whatever the band's width. The
  repeating level and its frequency are gone
- One thread carries what a stack used to, so it is drawn bolder than any one line of that
  stack was

### Changed — the steepness gate, where the plate says it belongs
- The gate that decides whether a boundary is worth outlining opened at a colour change of
  0.03 per cell. Measured on the plate, a soft ramp changes by 0.07–0.09 a cell and only a
  real boundary carries 0.2, so the gate stood open over 64 % of the laced dish and the
  isoline stacks it was meant to stop were only being hidden by the curvature term. It
  opens at 0.08 and is full at 0.20 now: the ramps' parallel lines go, the boundaries keep
  their thread, and around the cyan core three or four lines become one
- Fillmore East, 1969 goes to 0.55, which is the braid the projector desk asked for

### Changed — sharpening is off everywhere
- The test this work set itself has been run at the grid the show actually falls to, and
  the pass fails it. At 256², where a solver cell is nearly three screen pixels and
  sharpening should matter most, switching it on and off **on one plate** moves the 10–90 %
  edge width by less than the plate's own drift: −1.25 to +1.33 px at 0.5 and −0.3 px at
  full strength. Across separate pages it narrows edges by a pixel in two captures of
  five, at different frame counts in the two sets, and at 384° the sign flips
- What it does add over hundreds of frames on a coarse grid is pale terraces inside the
  colour and torn, ragged lips on the tongues — the old fault arriving slowly. Tying it to
  the governor's rung would switch that on exactly when the machine is already struggling
- So `sharpness` defaults to 0 and no preset sets it. The control stays: on the CPU solver
  at 192² it measurably steepens (mean gradient 0.091 → 0.104), and that is the engine a
  weak machine runs

### Changed — lacing: a thread on a boundary, a hair on a straight run
- **A boundary worth outlining is one that changes quickly**, not merely one that
  changes. Without that second test a wide soft ramp was still a span, and laying threads
  across it drew the contour map the pass exists to avoid: a fifty-cell ramp took six or
  seven parallel lines where it wanted none. The curvature term had been hiding most of
  them rather than preventing them
- **A floor under the curvature term**, so a straight boundary gets its hair. Without one
  the thread there was a fraction of a pixel wide at under half weight — no thread at all
  — and the pass drew only the curls, with blank edges between them
- **Never thinner than the pixel it is drawn on.** A sub-pixel thread samples as a row of
  broken dots, which is what the plate drawn small in a second dish was showing: two
  thirds of its lit pixels had no lit neighbour. It draws a continuous filament now
- Fillmore East, 1969 goes to 0.5

### Changed — lacing, after the projector saw it
- **It was drawing a contour map.** The level spacing came from the colour change per
  cell, so a soft ramp got a stack of four to six evenly spaced parallel lines instead of
  a thread at the boundary. The spacing now comes from the whole colour change across the
  boundary — one and a half threads laid across that span, whatever it is — so a wide ramp
  gets a line at its middle and a hard edge gets a tight braid
- **The plate drawn small in a second dish got stipple, not threads**, because its level
  lines fell under a screen pixel. Lines are now never allowed closer than a few pixels,
  measured from the screen derivative of the fluid coordinates, so every dish draws
  filaments at the size a filament should be
- **The width no longer comes from the strain rate.** The strain across the interface is
  the truer quantity and is what the pass was written against, but measured on the plate
  its sign holds for only three or four cells — about ten pixels — so along one thread it
  changes too often to read as anything, and the projector desk could not see it at all.
  A boundary that folds is a boundary that curves, and a curve holds over the whole length
  of a curl, so the thread's width and brightness now come from the level line's own bend:
  a braid where it curls, a hair along a straight run

### Added — lacing (plan batch 2)
- **Lacing** (`lacing`, Settings → Liquid, MIDI-learnable, 0 by default so no preset
  changes under anyone): the pale hair-thin threads that outline every colour boundary in
  a poured film. Fillmore East, 1969 carries it at 0.45
- They cannot be found in the dye, because the solver has no structure below its own grid:
  a boundary there is a smooth ramp a few cells wide. So they are made as level lines of
  the colour as it changes across the boundary, which means each thread follows the
  boundary's own shape rather than being noise sprayed near it, and where the boundary is
  steep they crowd into a braid the way a stretched film does
- What the flow decides is the width: the strain rate across the interface — the velocity
  difference either side of the boundary, projected along the boundary's normal — draws a
  thread out to a hair where the two sides pull apart and piles it into a thicker,
  brighter one where they fold. Only where dye lies on both sides, so a blob's outer
  silhouette against bare glass is left alone
- Measured on a seeded plate with the grain and cells off, a 380 px crop inside the dish:
  pixels on a hard edge 6.5 % → 8.5 % at the default and 13.8 % at full, typical local
  contrast 3.2 → 4.6 → 5.8. Both are inside the filmed references' band for the first
  time (4.2–7.3 % and 2.0–7.2). Structure at 4 and 8 px moved only 0.4 % → 0.5 %, so that
  half of the batch's gate is not met and has moved to batch 3, where the drops and cells
  that actually carry mid-scale structure live

### Fixed — the pigment grain was never drawn for the first nine hundred steps
- Seeding the grain's pigment coordinates bound the very texture it was drawing into,
  which is a feedback loop; WebGL refused the draw and dropped it silently. The
  coordinates stayed at zero, the first advection copied the zeros over the other phase,
  and the shader painted **no grain at all** until the phase clock reseeded a phase some
  nine hundred steps later — a quarter of a minute on a quiet machine, two minutes on a
  loaded one. Each target is seeded from the other one now
- Measured in a headless GPU page at 512², granulation 1.0: four `INVALID_OPERATION`s on
  the seed draw become none, and the fine texture in the plate at eight seconds goes from
  0.27 to 4.19 — fifteen times as much, which is the grain arriving on the first frame
  rather than after the first period
- What looked like a mottle creeping over the plate after two minutes was this: the grain
  switching on late. Anything judged in a page's first minute was judged without it

### Changed — where a long name comes apart
- A break inside a word's own parts reads as a different word for a moment, which on a
  dark stage is the cost the picture exists to avoid. A compound now comes apart at its
  prefix: **Back-ground**, **Micro-scopic**, **Under-ground**, **Cyber-punk**, with the
  consonant-pair and after-a-vowel rules behind it (**Irides-cence**, **Granu-lation**,
  **Labora-tory**)
- A name that would need three lines inside a circle takes its short form instead, so the
  Background Loop knob reads "Bg Loop" on one line rather than three crowded ones

### Changed — long names break rather than shrink
- A name too long for its control is hyphenated and set at full size rather than set
  smaller: "Irides-cence" on a knob, "Under-ground" on a pad. The break goes between two
  consonants where it can, or after a vowel, and near the middle of the word; a word
  under nine letters is never broken, because "Evo-lve" reads worse than "Evolve" a size
  down. 203 of 210 lines on the APC40 picture are now at full size, against 189 before,
  and none is cut or over its outline

### Fixed — sharpening that stops before it builds a staircase
- The gate on how much dye a cell holds was the wrong axis. Backward diffusion grows
  whatever curvature it is given, so over a long settle it does not only steepen
  boundaries: it takes the faint curvature of a smooth wash and grows that into flat
  terraces, whatever the density. What tells a wash from a boundary is whether the
  curvature is already an edge, so the pass now ignores curvature below 8 % of the local
  range of the dye and keeps nearly all of a real edge's
- Measured on the settled plate with the grain off, 90 s, Fillmore, CPU 192², over the
  two dishes separately (the shallow dish holds a wash with no boundaries, so every step
  in it is an artefact). At the default, main dish: mean gradient 0.091 unsharpened →
  0.104, where the old pass reached 0.328 by terracing, and roughness 0.0068 → 0.046
  against the old 0.93. Shallow dish: roughness 0.0011 unsharpened → 0.011, against the
  old 0.66 — sixty times less. At the top of the slider the main dish reaches the old
  pass's steepening (0.120) with a tenth of its staircase
- The slider is useful over its whole travel again rather than dangerous at the top: a
  wash carries no curvature above the floor, so turning it up cannot start a terrace

### Changed — the cheat sheet, third pass
- Labels are measured at the size they are drawn in. A system font with optical sizes —
  SF on a Mac — sets small type wider and more loosely, so measuring once at a large
  size made every label on that machine 14–17 % narrower than it drew, which ate the
  margin and put eight names on their outlines
- A name switches to its short form when the full one has to be set small **or** pushed
  against its outline, so Clean Screen and Background Loop now use theirs on a machine
  where they do not fit comfortably

### Changed — sharpening that knows how much liquid is there
- The sharpening pass fades in with the dye a cell actually holds, so the full dish
  keeps every bit of the steepening and a thin wash is left alone. Measured on the
  settled plate (CPU, 192², mean gradient and the high-frequency energy that is the
  staircase): in the body, gradient 0.095 → 0.096 and roughness 0.083 → 0.087 at the
  default, i.e. unchanged; in thin dye, roughness 0.043 → 0.016, down 62 %, and at the
  top of the slider 0.165 → 0.051, down 69 %. That is the axis-aligned blockiness the
  shallow dish showed on the projector, taken out without touching the look of the
  main plate

### Changed — the cheat sheet, second pass
- Labels are set at the largest readable size that holds the whole name, trying a
  comfortable margin first and a tight one only when the alternative is a smaller
  size: 186 of 200 labels are now at full size, none is cut, and none sits on its
  outline
- A fader's track line breaks wider around its label, so the longer names on the tall
  faders have air either side rather than the line running into the first letter
- Ink is measured against the control's own fill rather than the bare panel, which is
  what the label actually sits on: Hot Pink and Cherry Red were at 2.2 against their
  own pads on paper and now clear 3.6
- A few names that are longer than any button — Random Evolve, Clean Screen, the
  sequencer four, Background Loop — have short forms used only where the full name
  would have to be set small; the list beside the picture always says the full thing
- The four arrow keys are drawn as the cluster they are on the hardware. Laid out in a
  list they wrapped across rows, so Next Preset sat to the left of Previous Preset —
  the one pair a hand reaches for blind
- Random moves to the top of the scene column, so the button directly above Drain is a
  harmless one
- Swatches carry an outline (Pure White was a blank square on paper), the assign list
  keeps its full weight in paper mode, and the saved PNG has a title band naming the
  map, how many controls are assigned and the date

### Changed — a cheat sheet you can read in the dark
- Labels on the controller picture are measured against the type they are drawn in and
  shrink and wrap to fit, so the whole word is there: no more `Sunsh…` twice in a row on
  two different dyes, and nothing spilling past the shape it belongs to
- A fader's track line runs along the fader whichever way it lies and breaks around its
  own label, instead of being drawn upright through the crossfader's name
- A colour that is the colour of the panel it sits on — Crimson on black, Icy Blue on
  paper — is lifted or dropped until it separates, keeping its hue
- **On paper** turns the whole sheet to paper, the list beside the picture included, so
  what is printed or photographed is what is on screen
- The APC40 mkII factory map is laid out for a hand in the dark: dyes move from the
  track-select row onto the bottom row of clip pads, which are full colour and light in
  the dye they drop; Drain and Clear leave the row that carries Seed for the two buttons
  under the scene column; the arrows step presets; and the crossfader and cue encoder
  take Sharpness and Granulation

### Changed — the top of the sharpness slider
- Sharpening holds its middle and compresses its top: 0.5 is the strength measured on the
  projector, and 1.0 now stops three-quarters of the way up, short of where a bright rim
  appeared along boundaries and thin dye went blocky

### Added — the controller, drawn
- **APC40 mkII picture** (MIDI panel): the whole control surface to scale, every control carrying
  the MIDI address it really sends, taken from Akai's Communications Protocol v1.2 rather than
  guessed. Touch a control on the hardware and the picture selects it, then pick what it should do
  from the list beside it. Each control is labelled with what it does and coloured by what kind of
  thing that is, dyes in their own colour.
- The same picture is the cheat sheet: **On paper** switches it to black on white and **Save PNG**
  writes it at twice size for the phone or the desk. It works before the controller is plugged in,
  so a map can be built in advance, and Escape closes it.
- `src/lib/controllerSurface.ts` holds the layout, so another controller is a data change.

### Changed — sharpening without the grid showing
- The Mac's look at the first sharpening build found its artefacts ran along the grid axes:
  stair-steps on angled boundaries at the default, fur combed along x and y at full strength. The
  pass uses the isotropic nine-point weights now, and the slider maps to half its old strength
  since the wider stencil pushes about twice as hard per unit. At the default: the same steepening
  as before (field mean gradient 0.073 against 0.075) with a third of the high-frequency energy
  (0.039 against 0.097).

### Added — sharp liquid (plan batch 1, first half)
- **Sharpness** (`sharpness`, Settings → Liquid, MIDI-learnable): interface sharpening in
  both solvers. Every step advects and diffuses the dye, so a boundary that starts as a
  step becomes a ramp within a second and the plate goes soft; measured against frames
  of filmed liquid, ours put 2.4 % of its pixels on a hard edge where a pour puts
  4.2–7.3 %. The new pass runs diffusion backwards along the dye's own gradient, which
  steepens any profile that is not already straight. Two things make that safe: each
  cell may only move inside the range its four neighbours already span, so the pass can
  undo smearing but never invent a value and never grow the checkerboard that
  unlimited anti-diffusion produces; and each face's flux is gated by how much of an
  interface the two cells straddle, so a boundary against empty glass is left alone
  rather than being drained until a hole opens. All four channels sharpen, so a red
  edge against blue of the same thickness sharpens as well as a thickness edge.
  Measured on the Fillmore plate: pixels on a hard edge 4.5 % → 5.4 %, hardest edges
  +14 %, the field's own mean gradient +25 %, mass drift under 0.3 % over 20 s, no NaN.
- `npm run detail` reports the same numbers for any frame, so the rest of the batch is
  judged the same way.

### Fixed — the plate emptied on the GPU
- The Fillmore dish (and every plate, more slowly) lost its dye over a minute on the GPU solver with evaporation at its lowest, while the CPU solver held it: the Mac measured a loss of a part in seven hundred every step against the setting's four parts in a hundred thousand. The dye field was stored in half floats, and every one of the several writes a step rounds a ten-bit mantissa; the dye and its advection intermediates are 32-bit floats now wherever the context can filter them (`OES_texture_float_linear`), with half floats kept as the fallback

### Fixed — after the seventh look on the Mac's GPU
- A press left a hard-edged bright blob where the palm was instead of clear glass: the press tool calls the squeeze at three nested radii, and each radius piled dye at its own tip band, so the three bands tiled the palm; and the per-press step count restarted whenever a drifting finger crossed a grid cell. Only the outermost radius piles now, a press is one press while it keeps coming, and the pile is ×1.017 a step for its first forty-five steps
- Picking a light-show preset after a Photograph or Closeup preset kept the camera pass on (presets are overlays and the light-show presets never mention the camera); a preset now resets the camera along with the closeup and render style

### Fixed — the plate going black
- **The Camera slider, the Photograph presets and the Closeup presets drew black.** The oil beads' mask texture was bound on texture unit 9, the unit the camera pass reads its scene from; whenever the camera pass was on and the beads were not rebinding the unit, the plate pass sampled the very texture it was drawing into, WebGL refused the draw as a feedback loop, and the frame stayed black. The bead mask has its own unit (11) and is bound every frame; the camera pass creates and sizes its targets on its own units
- Settings sliders remounted on every change (the slider component was defined inside the panel, so it was a new component type each render), which broke a drag after its first step. It is a module-level component now
- Sliders that cannot do anything with the current settings are greyed out and inert, with the reason in place of their value: Focus, Aperture, Bloom, Chromatic Aberration and Refraction need Camera above 0; Gel Speed needs a Gel Wheel; Film Mix and Film Key need a film loop or the camera; Layer Scale Variety and Background Loop need two or more Projector Layers

### Changed — the show stays where it was put
- A few seconds into every set the show switched itself to a built-in preset picked for the identified song (Jellyfish Bloom, as often as not): the track-matched pick is gone. An identified song changes the look only when a preset or sequence was made for that very song; the Auto Preset toggle is gone with it
- The Presets button is gone from the right-hand panel; the preset menu lives under the title at the top left
- **Macro zoom at will**: + and − (also = and _) step the closeup's magnification, + with the closeup off turns it on at 2×, the wheel over the plate zooms while the closeup is on, and a chip below the title shows the magnification with − and + buttons. The Zoom slider in Settings, the remote's Zoom slider and MIDI learn on Macro Zoom still work

### Changed — after the sixth look on the Mac's GPU
- The carpet of small rings in the Fillmore dish, called "the beads" in every report since the third, was the **plate cells** shader at 0.55; the bead field underneath was already in patches with mixed sizes. The preset now runs cells at 0.2 and beads at 0.8 (the Fillmore sequence's stages likewise), so the oil beads carry the look
- The Fillmore dish drained to a few blobs in about a minute with no music: the dye budget regulator was pulling a full dish back to a 0.95 mean. The preset's budget is 1.2, the most the regulator allows
- The pile at the fingers' tips is stronger and sits in a band hugging each spoke's own tip, with the channel's thinning stopping short of it, so the rim can stand
- Governor: the climb threshold is 18.5 ms (17.5 sat on top of the 60 Hz interval's jitter, so the eight-second clock kept resetting and the Mac never left 512²), a long frame between 18.5 and 20 ms holds the clock instead of resetting it, and a rung that failed while a tool was held is retried after thirty seconds rather than ninety

### Added — the projector window fills its screen from the laptop
- A title bar on the projector window (the app's name, or the address) is the browser's frame: the OS's full screen keeps it, the browser's own removes it, and that needs a gesture on the window. The show window now hands its own gesture over (capability delegation on `postMessage`): while the projector window has its frame, any click or key on the laptop's show fills it, a chip says so with a button, the projector window shows a hint along its bottom edge until it fills the screen (and explains the green button if the window is OS-fullscreen), and F, Enter or Space on the projector window do it too. `requestFullscreen` asks for `navigationUI: 'hide'`

### Changed — after the fifth look on the Mac's GPU
- Beads gather in patches now, measurably: the patch field is a hard mask rather than a lean (where it is zero no bead is placed, so the bare stretches stay bare even when the dense patches are packed and the count is not reached; the old probability filled the plate evenly because every bead the packed patches refused landed between them), its lattice is coarser (four cells across the plate) with the contrast stretched, and the small beads span four to one in diameter within a patch
- A press piles the dye it pushes out into a rim just past each finger's tip for its first moments (forty-five steps, counted per solver step, restarting when the press pauses), so the fingers end in bright edges as in the reference rather than fading out
- The quality governor no longer gives up on a grid for the whole session: a rung that failed while a tool was held is not marked failed at all (a press costs a burst of work that says nothing about the rung), and a rung that failed under other load (another tab, a camera app) is offered again after ninety seconds of fast frames, so a show that fell to 256² during a busy moment climbs back

### Added — Fillmore East, 1969
- **Fingering** (`fingering`): a press (the tool, the pad, a kick with Beat Squeeze, OSC) thins the film more along a ring of spokes and shoves the outflow along them, so the front breaks into radial fingers (Saffman–Taylor, the thin liquid shooting through the thick one) instead of a smooth ring. The spoke phase is fixed by where the press is, so a held press keeps its fingers
- **Oil beads** (`beads`, `src/lib/beads.ts`): up to four hundred small immiscible beads that lag the flow, crowd without overlapping, merge now and then, and are shoved by drops and presses; drawn from a 512² mask texture (interiors red, rims green) as a dark meniscus ring with the ground lit inside. Hundreds of them are too many for uniforms, so the mask is a 2D canvas uploaded when it changes
- **Projectors** (`dishSpread`): each layer its own dish on a black screen, the lead large and right of centre, the second smaller at the left, both inside the plate's inscribed circle so the square glass never shows a corner. Each dish is a whole plate (the dish disc maps to the plate's inscribed circle, rotated with the plate), and the mouse mapping mirrors it so the brush lands under the cursor
- **Plate cells** (`cells`): the macro camera's cell field on the lead plate at show scale, carried by the dye (the velocity texture is bound whenever cells are on), dark-edged, strongest in the thick dye and toward the lead dish's centre
- **Fillmore East, 1969** preset: two layers on screen blend, dyes orange / yellow / cherry / icy blue / emerald / purple, a seeded plate with a cool core, a warm ring the beads sit in and green and purple wisps at the rim, fingering, beads, cells and projectors on, beat squeeze high; plus the **Fillmore East** sequence (the wash, the dish comes in, sunburst, burn out) and a stage in the Set Journey
- The four new settings are MIDI-learnable and have sliders in Settings → Show

### Changed — after the first look on the Mac's GPU
- Fingering carves the dye out of the spoke channels as well as pushing it, so the fingers stay visible once the gap has bottomed out and the squeeze flow stops (on the GPU the press pinned the gap within a few steps and the front stayed smooth)
- Beads: a long-tailed size distribution (many small, a few big), looser and uneven packing instead of a honeycomb, gathering in the thick dye rather than spread evenly over the glass, no rim on bare glass, and an interior drawn as a small dome (a ramp channel in the mask) darker toward the rim with the lamp caught on the side facing it
- The Fillmore preset's edges softened: boundary contrast 0.18, edge relief 0.12, no gloss, so the cool core has no hard bright rim

- Second GPU look: the fingers were a perfect turbine. Each press now gets its own spoke count and phase, each spoke its own width, length and strength, a second harmonic shifts the spacing, and the carving is gentler and stops at each spoke's own length, so dye survives between ragged fingers. Bead crowding only pushes apart on a hard overlap, by a per-bead amount, so the small beads no longer settle into a honeycomb. The preset's boundary contrast is 0.05 and edge relief 0.05, so no cool blob carries a hard bright rim

- Third GPU look: the beads gather in patches now (a smooth noise field over the plate decides where they spawn: dense patches, near-empty stretches) and the small ones span a wider size range, so the warm field is scattered lenses rather than an even carpet; under the palm of a press the glass clears, the dye pushed out to the fingers' tips

### Fixed
- Choosing a preset after Fillmore East kept its projectors, beads, cells and fingering, since presets merge over the previous settings and older presets do not mention the new ones; `applyPreset` now resets the four the way it resets the macro camera
- Seeded blobs were square: `splatBlob` evaluated its Gaussian in a square window that cut it off where it was still 14% strong, so a fresh plate showed square blobs with soft middles until the flow smeared them. The window is round now and wide enough for the Gaussian to die away


### Added — The stage kit
- **Press**: a tool, a tablet pad mode, a game-controller trigger and an OSC address for a hand on the top glass. The film thins under it (three nested squeezes of the Hele-Shaw gap) and the dye spreads out in a ring, the Joshua Light Show's rhythm plate worked by hand; pen pressure and trigger travel set how hard
- **Dimmer** (`dimmer`, default 1) as the last stage of the plate shader, so the camera pass sees a darker plate and bloom fades with it; **Blackout** (`B`, the phone, Settings → Sound, a MIDI or OSC action) fades it to black over a second and back to where it was, on a timer so it works while the laptop's window is behind the projector's
- **Input picker** (Settings → Sound): the audio interface fed from the desk instead of the built-in microphone; remembered, reopened when changed
- **Music file** (the File button): an MP3/WAV/FLAC/OGG played through the speakers and heard by the show via the element's own stream (an AudioContext route where `captureStream` is missing), with a small player: play/pause, seek, close
- **Record** (the red button by Cast, or the *Record* action): `canvas.captureStream` + the music into MediaRecorder, VP9/VP8 WebM or MP4 as the browser has it, saved as a download on stop (`src/hooks/useRecorder.ts`)
- **Factory MIDI maps** for the APC40 mkII, Launchpad Mini mk3 / X (programmer mode) and Launch Control XL, alongside the APC mini mk2 and nanoKONTROL2; the dimmer is learnable and the new actions (blackout, record) are on every map
- **OSC in** on the show server (UDP 9000, LAN only, `OSC_PORT`): a small OSC 1.0 reader (bundles, i/f/d/h/s/b/T/F) mapping `/chromaglass/setting/<key>`, `/action/<name>`, `/preset`, `/blow`, `/drop`, `/press`, `/tilt`, `/dye` onto the relay's own messages, so Resolume, TouchDesigner, Max and Ableton drive the show like a phone does
- **Installable**: a web manifest (standalone window, icons, shortcuts for the remote and a network display) and a light service worker (hashed assets cached, the page network-first, the relay and remote-info never touched), registered on built sites only. Chrome and Edge offer "Install app"
- **A projector, noticed**: with the window-management permission already granted, a second external screen on load shows a one-click "send the show there" chip; the Second display cast now prefers the screen that is not built in
- The remote gets a Dimmer slider and Blackout / Record buttons; the display's state carries `blackout` and `recording`

### Fixed — The show server, after review
- A socket that never said hello with the show key was still relayed to the display (the key was decorative); relay-only message types (`denied`, `request-state`, `mirrors`, `request-cast`, `hello`) sent by a client were forwarded too, and a forged `denied` made the display stop reconnecting. Both dropped now
- A text frame `null` (JSON.parse succeeds, `.type` throws), a malformed percent-encoded path (`decodeURIComponent` throws) and a WebSocket protocol error with no `error` listener each took the whole server down
- Ping/pong every thirty seconds terminates a network display that has dropped off Wi-Fi without a FIN, and show frames are skipped for a socket whose send buffer is over a megabyte, instead of queueing thirty a second forever
- `firebase.json` listed the catch-all `no-store` header after `/assets/**`, so the hashed bundles were served uncacheable; the order is fixed and assets are immutable again


### Added — MIDI controllers, game controllers, and the iPad as a plate
- **MIDI** (`src/lib/midi.ts`, `src/hooks/useMidi.ts`, `MidiPanel.tsx`, the MIDI toolbar button): a controller's faders ride settings, its pads cue presets and dye colours, its buttons fire the one-shots and drive the sequencer. Factory maps for the Akai APC mini mk2 and Korg nanoKONTROL2; **MIDI learn** for any other (pick a target — thirty settings, every action, every preset, every dye — then touch the control); endless encoders as relative nudges; **soft takeover** so a fader that disagrees with the app waits until it passes through the value; **LED feedback** lights preset pads in the preset's lead dye (dim until active), dye pads in their colour, toggles on or off, using the Launchpad / APC velocity palette and 127/0 for CC LEDs. Maps live in the browser and as `.chromaglass-midi.json` files (Save file / Load file), and MIDI comes back on by itself next visit
- **Game controller** (`src/hooks/useGamepad.ts`): left stick moves a cursor ring over the plate, right stick blows air from it in the direction pushed, right trigger drops dye as much as it is pulled, left trigger puffs, shoulders cycle the dye, d-pad steps presets and plates, face buttons seed / drain / random / clean screen, Start play/pause, Back Random Evolve, R3 Macro, L3 recentres. Polled on a timer so it keeps working while the laptop's window is behind the projector's
- **The tablet remote** (`RemoteControl.tsx`): two columns on an iPad with the projectionist's pad filling the left half and kept in view; several fingers at once; a pen's pressure sets how much dye a drop lays down and its tilt which way a blow goes (barrel button blows in drop mode); a row of dye colours picks what the pad drops and the laptop's dropper with it; a **Full** button gives the pad the whole screen; the screen stays awake while linked; the preset list is the laptop's own, saved files included; sequencer Stop and preset previous/next
- Gestures from any hand carry an `amount` (pressure, trigger travel) and, for a blow, a direction (`dx`/`dy`): `applyGesture` scales the drop and the puff and adds a directed `blowDirected`; the remote protocol carries them, plus a `dye` message and the display's preset list in its state


### Added — Beats ahead of the microphone
- A microphone hears late — capture buffer, analyser window and smoothing, band smoothing, the wait for the onset threshold — so a kick on the plate landed after the kick in the room. `src/lib/beatClock.ts` is a phase-locked clock: it collects onsets, finds a period once the last few intervals agree (folded into 60–200 bpm), then nudges the period and snaps the phase on every on-beat onset, gaining confidence with each hit and losing it on syncopations, misses and silence. Once confident it fires each beat `beatLead` ms (default 80) before the onset would be heard and absorbs the heard onset of the same beat so nothing fires twice; when it loses the beat it hands back to detection
- Every kick reaction — the plate rock, the beat squeeze, the beat ring of dye, bubble release, the macro camera's cut — now reads one verdict per frame instead of its own threshold crossing, so they land together. `beatPrediction` (default 0.7) is how much the show trusts the clock; 0 is detection only. Settings → Sound

### Changed — Bubbles in the dye, not over it
- Bubbles rode the velocity field but the dye slid underneath them as if they were painted on a sheet above the plate. Now each bubble's footprint carries a standing squeeze in the solver, so the dye keeps pumping out to the bubble's rim and flows round it (`applySquish` per bubble per step, on the lead plate)
- Whatever lands on the plate lands on the bubbles: dye from the dropper, spray, pour, streak or splatter bursts the bubble under it into two or three satellites and shoves the bubbles along the spreading front; a blow of air shoves harder and bursts nothing. The same for the phone's pad, replayed performances and automation drops (`BubbleField.disturb`)

### Added — A new song, a new look
- `onNewSong` (Settings → Sound → On a New Song: Keep / New preset / Random, default New preset). A new song is detected two ways: a boundary heard in the audio — music that has run at least twenty seconds, then quiet for at least two and a half, then sound again (`src/lib/songBoundary.ts`; a rest inside a song is too short, a crossfaded set never goes quiet) — or track identification naming a different song than before. Either picks another non-closeup preset or rolls a random look; a gap and an identification close together count once; the sequencer keeps control while it is running

### Fixed — The toolbar's preset menu was black on black
- The menu opened from the toolbar's Presets button is portalled to the page body to escape the toolbar's clipping, and the body sets no text colour, so its text fell back to black: the Save and Load buttons and the group headings were unreadable. The menu now carries its own text colour

### Added — Save and load presets from Settings too
- Settings → Presets now has **Save current** (asks for a name) and **Load file**, and lists your own presets under *Yours* above the built-ins, the same library the preset menu shows

### Added — One command to update everything
- `npm run ship` pulls main, installs, builds, publishes to Firebase Hosting and starts the show server; `npm run update` and `npm run deploy` are its halves

### Added — Files made for a song
- A preset or sequence file can name the song it was made for (`song: { title, artist, isrc?, durationSec? }`; `src/lib/songRef.ts` matches by ISRC when both sides have a real one, else by title and artist with remaster tags and punctuation stripped). The preset menu's save form offers "Made for <the song playing now>"; the sequencer's editor has a Song row to make a sequence for the song playing, or forget it
- When track identification (fingerprint or a manual tag) names a song, a sequence made for it starts at the song's current position — stages laid end to end by their seconds, the settings already where that stage would have them — and a preset made for it is applied. A song-bound sequence stops when the song's known duration runs out or another song takes its place, rather than looping into the next song (`startAt` on the sequencer)

### Added — Presets and sequences as files
- **Save current** in the preset menu writes the look to a human-readable JSON file (`<name>.chromaglass-preset.json`: every setting named in the order the defaults declare them, plus `contract` — the dyes the plate may use — and `injectStyles`) and to a library in the browser, listed under *Yours* in the preset menu, apart from the built-ins; each entry can be saved again as a file or removed. **Load file** reads a preset file from a file chooser, validates it (unknown keys dropped, missing ones defaulted, the solver grid left to the machine), adds it to the library and applies it, dyes and all (`src/lib/userPresets.ts`, `src/hooks/useUserPresets.ts`)
- The Show Sequencer's **Save file** writes the selected sequence to `<name>.chromaglass-sequence.json`, embedding any of your presets its stages use; **Load file** reads one in, adding those presets to the library. Stages can name your presets; the sequencer applies them with their own dyes

### Changed — Random Evolve, slower and in reach
- Random Evolve added a drop or a blow up to nine times a second: the music term in its chance stood on its own and the rate slider hardly mattered (and a rate of 0 silently became 0.5). The rate now scales the whole chance — at the default a drop or a blow every second or so, quickening with the music, the old frenzy only at full — and an **Evolve Speed** slider sits under the Random Evolve toggle at the top of the toolbar (and in Settings → Automation, and on the phone)

### Changed — The projector on HDMI mirrors the laptop's canvas
- **Second display** no longer runs a second copy of the show fed by messages. The window it opens on the projector, having an opener on the same machine, mirrors the show window's canvas pixel for pixel every frame, and tells the show window how many pixels the projector has; the visualizer then renders at that size (the governor's rung as a fraction of it) and letterboxes itself in the laptop window behind the controls, with pointer mapping through the drawn rectangle so the brush still lands under the cursor. One render at the projector's resolution, zero added latency, nothing sent, and every stroke on the laptop on the wall the same frame. A page presented by Chrome or opened over the network still runs the show itself as before (`StageMirror` in `src/components/CastDisplay.tsx`, `setStage` on the visualizer)

### Changed — A calmer macro camera
- The closeup moved far too fast once the beat clock fired on every beat: a 20 % zoom punch and a chase whip a beat, a hi-hat tremor at 9–23 Hz, cuts as often as every half second. Now: the chase follows at a fraction of the old rate; only a strong kick punches in, by 6 %, and eases out over a longer time; the tremor is a third the size at a quarter the speed; a beat can bring a cut forward no sooner than two seconds after the last; loud passages spend the hold a little faster rather than twice as fast; bead tracking blends by time instead of by frame. Defaults: chase 0.4, music sync 0.5; the closeup presets retuned to match

### Added — The show key, and a tunnel for complex networks
- The show server prints a four-digit **show key** at start (`SHOW_KEY` in the environment for a fixed one) and refuses phones and network displays that do not carry it (`?key=1234`); the printed addresses include it, the relay's info endpoint gives it only to requests that did not come through a proxy or tunnel, and the show window on the laptop picks it up from there. A refused phone says so instead of spinning
- `npm run tunnel` runs a Cloudflare quick tunnel to the show server, so a projector in another building or on another access point reaches it through the internet with the key keeping strangers out; the cast menu explains, and shows the tunnel address when the show itself was opened through one

### Added — Network display
- Chrome's cast discovery finds some devices and not others (a Nest display yes, a Google TV projector no), and the app can do nothing about that. So the show server now feeds the show to any browser on the network: open `http://<laptop-ip>:3000/?cast=true` on a projector or TV with its own browser, a tablet, anything, and it joins the relay as a *mirror* and receives the same messages a cast receiver gets — a settings snapshot on join and on every change, the audio bands thirty times a second, the triggers — while phones never see that traffic. The cast menu shows the address and how many network displays are connected; the relay's info endpoint now lists the laptop's LAN addresses (`server/remote-server.js`, `useRemoteLink` mirror role, `CastDisplay`)

### Fixed — Casting
- The cast button is a menu. Chrome's device picker only lists Chromecasts and shows nothing for a display plugged into the laptop, which is what most shows are; **Second display** now opens the receiver in its own window and, with the Window Management API and a second screen present, places it on that screen at full size. **Chromecast** goes to Chrome's picker as before; a Google TV that Chrome's picker will not present to is reached by casting the Second display window as a tab, which the menu and the README now say
- Casting to a Chromecast or a second display showed "Source window closed" and nothing else. The receiver page mirrored the show window's canvas through `window.opener`, which only exists when the receiver is a popup; a page presented through the Presentation API runs in its own context with no opener. The receiver now runs its own copy of the visualizer and is fed by the show window — a snapshot of the settings when it connects and on every change, the audio bands thirty times a second, and the seed, clear and drain triggers — over the PresentationConnection, or over a BroadcastChannel when it was opened as a popup (`src/lib/castProtocol.ts`, `src/hooks/useCastSession.ts`, `src/components/CastDisplay.tsx`). Choosing a preset re-seeds the receiver's plate too, and the user's palette lock carries across
- The receiver says when the show window has gone quiet instead of freezing on the last frame

### Added — Presets at the top
- The preset's name under the ChromaGlass title is now a menu, and a **Presets** button sits at the top of the toolbar: every preset one click away, grouped Light show / Photograph / Closeup, the current one marked, closing on a pick, a click outside or Escape (`src/components/PresetMenu.tsx`)

### Added — The photograph
- **Two-pass renderer** (`src/lib/cameraPass.ts`). The plate pass can now draw to a texture, with a second attachment carrying per pixel the surface normal, the dye's height and whether a bubble sits there, and a camera pass looks at that picture the way a lens and a sensor would: refraction of the finished plate through drops and bubbles, a focal plane with depth of field (twelve-tap disc), bloom around the highlights, chromatic aberration at refracting edges and the frame's corners, an ACES roll-off, vignette and grain. Off by default (`camera` 0), so the projected show is drawn straight to the screen as before; the pass builds itself the first frame it is asked for
- **Photograph render style** (`renderStyle: 'photo'`): a lit paper backdrop in two colours (`paperA`/`paperB`) with a soft join and the tooth of the paper; dye composited as transmission over it, mixing subtractively so a thin wash vanishes into the paper and a mixed drop deepens; each drop a dome from its normal — a dark meniscus deeper away from the lamp, a thicker middle that absorbs more, the softbox reflected as a bright crescent on the lamp side, a rim that catches the sky
- **Satellite droplets** (`microDroplets`): two sizes of tiny lenses on a jittered grid, more where the dye is, each shaded like the bubbles — dim toward the lamp, bright away from it, a point of the lamp on its dome
- **Thin film** (`thinFilm`): interference bands where the dye runs thinnest, following the thickness
- Camera controls: `focus`, `aperture`, `bloom`, `chromaticAberration`, `refraction`; Settings → Camera; sequencer stages can glide the camera, aperture, bloom, droplets and thin film
- Presets **Oil on Water** (yellow oil over blue paper, packed bubbles, droplets, shallow focus), **Colorful Cosmos** (big drops over a teal-to-orange gradient, two lamps, deep fall-off) and **Sunny Side Up** (thin sheets over hot orange, every edge running with interference colour); a photographed stage in the Set Journey sequence
- Choosing a preset returns the render style to the light show unless the preset says otherwise, as with the macro camera

### Added — The lamp
- **One light for every material.** Until now each pass assumed its own fixed sun: dye gloss lit from one corner, the meniscus from another, the macro relief from a third, and every bubble's highlight stamped at the same offset. Now a projector lamp sits under the plate at a point (`u_lamp`), so the light reaches each place from its own direction, and everything that shades asks it: a bubble to the left of the lamp is lit from its right, one on the far side from below
- **Bubbles as lenses** (`lightPlay`, default 0.6). From the reference photographs: the rim toward the lamp darkens as the light is bent away, the far rim carries the bright caustic arc, the lamp's reflection sits on the lamp side of the dome, the interior shows the plate behind magnified toward the centre, and a little of the plate on the far side sits in the bubble's shadow — so a field of bubbles reads as one light falling across them
- **Dye rims under the lamp**: the meniscus glows in the dye's own colour on the side facing the lamp and sits in its own shadow on the far side; straight under the lamp both sides match
- **The hot-spot** (`lampHotspot`, default 0.35): brightest over the lamp, falling away toward the rim, with a slight warmth at the centre
- **Lamp motion** (`lampMotion`, default 0.5): the lamp wanders slowly under the plate and moves with the plate's rock, so a tilted plate is lit from a new side and the light keeps moving across everything
- **Second lamp** (`secondLamp`, default 0): a cooler lamp from the other side of the plate — two lights across every bubble and edge, a cool arc and reflection against the warm one, and a cool pool on the ground
- **Iridescence** (`iridescence`, default 0.25): thin-film colour running round bubble rims, stronger over bright ground
- Settings → Lamp; Lucky rolls them; Oil Wheel and Poster 1969 carry their own; `?set=key=value;…` pins any setting for one page load

### Added — The show over time
- **Show Sequencer** (`src/lib/sequencer.ts`, `src/hooks/useShowSequencer.ts`, `src/components/SequencerPanel.tsx`). Until now the show only evolved by dice: a random re-pick of the harmony, automation rolling drops. A sequence is a list of stages; each adopts a preset (its dyes and injection style, the plate kept rather than cleared), glides any of sixteen settings toward a target over a transition, sets how many of the preset's dyes are in play and which leads, and can force the macro camera on or off. A stage hands over after a time, when the song changes section (from Track intelligence's song map, with a minimum dwell), or holds until Next. Built-ins: *Slow Build* (one dye on bare glass, the others arriving over four minutes, then the wheel turning), *Verse / Chorus* (quiet verse, pressed and rocked chorus, bridge in close-up; advances on section changes), *Set Journey* (classic wheel → oil wheel → mirrored dish → chemistry bench → 1969 poster → lumia). Copy a built-in or start fresh, edit stages, reorder, save (localStorage). A **Sequence** button in the toolbar, and a transport (play/pause, previous, next, progress bar) on the phone remote
- **Hue journey** (`hueJourney`, minutes per step, default 3). The 45-second random re-pick is replaced by a deterministic walk through the preset's contract: a window one dye short of the set slides by one dye each step, so one colour drains while the next arrives and the plate never jumps. At 0 the old behaviour returns
- **Beat squeeze** (`beatSqueeze`, default 0.5). The rhythm plate: on every kick a domed press goes into the lead plate near its middle, the dye spreading out in a ring and relaxing back
- **Background loop** (`backgroundLoop`, default 0.5). The plates behind the lead run slower and calmer, so a two-layer show reads as a live plate worked over a slow loop, the way the recordings stack a slide-loop behind the hands-on plate
- **Kaleidoscope** (`kaleidoscope`: off, 2, 4, 6) — the plate mirrored into wedges around the centre, seams meeting edge to edge, the rig turning slowly; and **Round dish** (`dishVignette`) — black beyond the rim with a thin bright ring at the glass edge, the projected clock face seen whole. Both in Settings → Show
- **Poster, 1969** preset: two opaque dyes on one plate, flat and hard-edged, no gloss or meniscus, screen-print saturation
- Lucky rolls the new fields; `window.chromaglassDebug()` now reports the harmony, contract, palette window and journey

### Added — Solver
- **GPU fluid solver.** The whole step — squeeze-film pressure, forces, viscous diffusion, pressure projection, advection, decay — now runs as WebGL2 fragment passes over float ping-pong textures, at 256², 384², 512² or 768² depending on the hardware, instead of the 192² JavaScript loop. Injection stays in logical 192² coordinates and is uploaded as a delta texture, and a box-filtered readback feeds the pieces that still need the field on the CPU (bead tracking, the dye regulator), so nothing outside the solver had to change (`src/lib/gpuFluid.ts`)
- Settings → Simulation → **Fluid Grid**: `auto` picks the largest grid the GPU can hold, or pin a size, or force the CPU solver. A readout shows which engine is live. Machines without float render targets fall back to the CPU path on their own (`simResolution`)
- `?sim=cpu|auto|<size>` and `?debug` URL overrides for testing
- **Frame-time governor.** `auto` no longer means the largest grid the GPU can allocate — an integrated GPU allocates 512² and then crawls. A governor watches the real frame interval and walks a ladder of quality rungs (solver grid × canvas pixel density): down within ~1.5 s of dropped frames, up one rung after ~8 s of sustained room, never retrying a rung that failed this session, with a settling period after every move (`src/lib/governor.ts`)
- **Tiers, not builds.** One build serves the hosted page, a local `npm run remote` show and (later) a native shell; only the assumed headroom differs. Hosted caps at 384² and 1.5x pixels so a first visit never stutters; local and native run the full ladder to 768² at native pixel density. Tier comes from where the page was loaded, GPU class from the renderer string; software GL goes straight to the CPU solver (`src/lib/platform.ts`)
- The canvas now renders at device pixel density on machines with room for it — previously it was always 1x, a 2x upscale on every Retina display
- **Run-it-locally card** on the hosted build, shown once the governor has stepped down or the GPU solver is unavailable: what happened, and the three commands that run the same build on the viewer's own machine (`src/components/RunLocallyCard.tsx`)
- Settings → Simulation shows the live engine, pixel density and frame rate, and whether Auto has had to step down on this machine
- `?tier=` and `?gpu=` URL overrides for testing a tier on the wrong machine

### Changed — Bubbles, second pass, from the references
- A second reference study (48 photographs, 24 video timelines) showed the same bubble everywhere: small, round, gathered in packed fields inside the oil, a bright lens over the lamp with a thin edge in the dye's own colour — large deforming bubbles are the exception. So: up to forty, spawned small and in threes into the densest dye; shape only for the big ones, and slowly; they drift together and rest edge to edge before merging; the membrane is the dye seen edge-on with a lifted centre, never a drawn ring

### Changed — Bubbles that behave
- Bubbles are drawn as one implicit (metaball) surface instead of stamped circles, so two pulling together neck into each other and merge, and the membrane is a thin dark line with a bright refracted edge inside it rather than a band a quarter of the radius wide
- Each bubble now has a shape: it stretches along whatever is dragging it, wobbles in second- and third-order modes after a knock (a merge, a split, fresh air), and relaxes when the plate goes quiet
- New behaviour: a bubble stretched hard enough by shear tears in two; one popping (end of life, the plate's edge, or shaken loose by the treble) leaves a short-lived spray of smaller bubbles and puffs air into the dye where it was; the treble agitates the whole population

### Added — Macro camera on the beat
- **Music sync** for the closeup camera (`macroSync`, Settings → Macro Closeup and the phone): a kick brings the cut forward once the shot has had a fair run, so the edit lands on the music instead of a private timer; each kick punches in with the bass and eases back; loud passages spend the hold faster and tighten the chase; the treble adds a few cells of handheld tremor. At 0 the camera keeps its own time as before

### Fixed — Lag and jitter
- **The GPU path no longer stalls every frame.** The bead tracker and dye regulator read the field back from the GPU each frame with a blocking `readPixels`, which forces the GPU to finish before the CPU can continue and serialises the two — the stutter was the pipeline draining sixty times a second. The read now goes through pixel-pack buffers with fences, collected a frame later
- **Catch-up no longer compounds a hitch.** When a solver step already costs most of a frame, owing four of them after a slow frame only produced a run of slow frames; the cap now adapts to the measured step cost, so the show runs a little slow instead of stuttering
- **Cheaper CPU step.** MacCormack advection stays on the dye, where it keeps filaments, and velocity and heat take first-order transport — about a third of the step on a field nobody sees directly
- **The phone remote responds again.** Its slider and button components were defined inside the render body, so every state message from the laptop gave them a new identity and remounted the control under the thumb dragging it; they are module-level now. Slider patches are throttled to ~20 a second, the laptop applies them in 50 ms batches, and its state snapshots back to phones are coalesced
- The shell no longer re-renders once a second for the frame-rate readout; the settings panel polls the live reading itself while open

### Removed
- The Monochrome Ink preset — a grey plate however it was tuned

### Added — The other projectors
Six expansions from the same comparison — the machines a light show crew stacked on one screen besides the clock face:
- **Lumia.** Thomas Wilfred's aurora as a layer under the dye: a slow folded height field read as sheets of light, two harmony colours drifting through each other on a scale of minutes, no beat and no dye (`lumia`; preset **Lumia**)
- **Chemistry.** Mark Boyle's Sensual Laboratory put reactions on the platen instead of oil in a dish. A Gray–Scott reaction–diffusion field grows cells and coral in place and deposits dye where it is active; the flow carries the dye off while the pattern keeps growing underneath. Seeded by kicks (`chemistry`, `src/lib/chemistry.ts`; preset **Sensual Laboratory**)
- **Film loops and a gel wheel.** A film projector that plays a video file through the dye — keyed on its own brightness, refracted by the dye's surface, tinted where the dye is — and a four-segment colour gel turning over the lamp at a chosen rpm, its colours from the working harmony (`filmMix`, `filmKey`, `gelWheel`, `gelSpeed`; Settings → Projectors → Load loop)
- **A real plate in the mix.** The same film path takes the camera: point a phone or webcam at a real dish of oil on a lamp and it is composited through the solver's lighting (Settings → Projectors → Camera)
- **Two projectionists.** The phone remote gains a pad: dragging blows air along the finger's path, a tap drops dye, each phone chooses which plate it works, and the phone's tilt streams into the plate as an external tilt that fades out if the link drops (`blow` / `drop` / `tilt` messages; `applyGesture` takes a layer; `setExternalTilt`)
- **Sealed wheel.** A halogen grade — warm tint and a soft vignette — and a preset, **Oil Wheel**, that runs thick dye on convection at half a revolution a minute, yellows, greens and blues, no hands on it (`lampWarmth`)
- **Exposure** plate-wide: the macro camera's histogram floor is now a setting, so a thin film between dye structures renders as bare glass — Sensual Laboratory runs on it (`exposure`)
- A Projectors section in Settings with all of the above; Lucky rolls the projectors one at a time

### Changed — The look, against the tradition
Six changes from a comparison of the app's frames with the liquid light show canon (SF light painting, the Joshua Light Show, Mad Alchemy, Optikinetics wheels, macro liquid-light photography):
- **Palette contracts.** A projected clock face carries two or three dyes; the richness of a show comes from stacking plates, not rainbow dye. Every preset now names the palette indices it may use, and seeding, automation, beat injection and the slow harmony rotation all draw from inside that set (a song's identity harmony is intersected with it). Galaxy, Cyberpunk Neon and Fractal Dream stop drifting into full-spectrum haze. A user's palette lock still wins outright
- **Meniscus at every edge, at any zoom.** The dark rim and refracted highlight a bead has between two plates were only rendered in the macro closeup; a lighter version now runs plate-wide from the sobel normal (`edgeRelief`)
- **Bubbles.** Trapped air is the most recognisable analog element after the blob. A small particle field rides the velocity field, climbs against the plate's tilt, merges on contact and pops at the edge or the end of its life; the renderer draws each as a lens — lighter interior, dark rim, one highlight. Born from the Blow tool, automation's air bursts and bass hits (`bubbles`, `src/lib/bubbles.ts`)
- **Rock the plate.** A hand on the clock face: each kick tips the whole plate one way and a damped spring rocks it back, with a slow sway between beats, so the field sloshes instead of only churning. Applied as a uniform acceleration on both solver paths (`plateRock`)
- **Less haze.** Film grain fades out almost entirely below the shadows so dark frames stay black; treble sparks are fewer and larger — a handful of real droplets instead of a cloud of one-cell specks that blurred into fog
- **Two scales in one frame.** The second layer is viewed magnified about the centre with its own slow drift, like a second projector at a different throw; the brush maps through the same view (`layerScaleVariety`). Off in the macro presets, whose camera frames one plate
- **Dye budget per preset.** The regulator's target fullness is now a setting (`dyeBudget`), so a preset can run mostly clear glass with dye structures on it
- Five new sliders under Light Show Look: Dye Budget, Edge Relief, Bubbles, Plate Rock, Layer Scale Variety; Lucky rolls them

### Added — Clean screen
- **Clean Screen** chip next to Hide UI: removes every overlay — logo, chips, meters, lyrics, the cursor — leaving only the liquid, for a projected show. **Esc** brings everything back (with the overlays up, Esc closes whichever panel is open); on a touch screen a finger held still for a moment does the same. A hint saying so shows for four seconds after hiding
- The phone remote has a matching button, so the laptop's screen can be cleaned from across the room (`overlays-off` / `overlays-on` actions, `overlaysVisible` in the state snapshot)

### Changed — Solver
- **MacCormack advection** on both paths, for velocity and dye: a forward and a backward semi-Lagrangian pass, corrected by half the round-trip error and clamped to the neighbourhood the forward pass sampled. First-order semi-Lagrangian transport smeared a thin filament away within a few steps; the same filaments now hold their edges
- Momentum diffuses at a viscosity derived from the plate's thin/thick setting rather than at the dye's diffusion rate, which is a different physical quantity — the two had been sharing one number

### Added — Macro Closeup
- **Bead camera** — a tracking macro camera that magnifies the plate and rides a single bead of dye: it locks onto the most compact, isolated bead it can find, follows it with a velocity lead so a fast bead never trails off-frame, and when the bead dissolves or its shot runs out it whips to a new one with a dolly-out that hides the cut (`macroMode`, `macroZoom`, `macroChase`, `macroHold`; `src/lib/macroCamera.ts`)
- **Synthesised micro-detail** — at 4-6x the 192-cell solver only supplies the large shape, so the renderer adds fluid-space structure that magnifies with the camera: packed paint cells (dark cores in bright, dark-outlined rings) carried along by the dye, dendritic lacing stretched along the flow, a fractal silhouette warp, dome shading, contact shadow and substrate grain (`macroCells`, `macroCellScale`, `macroLacing`, `macroDepth`, `macroEdgeDetail`)
- **Shallow depth of field** — defocus grows away from the frame centre, the way a macro lens behaves wide open
- Three macro presets — Macro Bead, Cell Bloom, Lacing Run — each with its own seed pattern of separated beads for the camera to choose between
- Macro toggle in the main toolbar and a Macro Closeup section in Settings; Lucky rolls closeup framing one time in four

### Added — Deployment
- GitHub Actions workflow that typechecks, builds and publishes to Firebase Hosting on every push to `main` (needs a `FIREBASE_SERVICE_ACCOUNT` repository secret)
- Favicon, Apple touch icon, share card and page metadata — the built site previously served a bare `index.html` with no icon and no description

### Added — Phone Remote
- **Laptop drives, phone controls.** `npm run remote` serves the built app on the LAN and relays control messages, so the laptop runs the show (mic, GPU, full UI) while a phone at `?remote=1` becomes a control surface: presets, sound drive, speed, the macro camera and the one-shot gestures (`server/remote-server.js`, `src/components/RemoteControl.tsx`, `src/hooks/useRemoteLink.ts`)
- The laptop is authoritative and publishes a state snapshot on every change, so a phone joining or reloading mid-show sees what is actually running rather than what it last remembered; the link reconnects on its own with backoff, and stays dormant when no relay is present so the hosted build is unaffected
- Deliberately a LAN WebSocket rather than a cloud round-trip: a slider should move the visuals in milliseconds, and the show should survive the internet going down
- The laptop probes for the show server (`/remote-info.json`) before opening a socket, so a hosted or previewed build no longer logs a refused WebSocket handshake on every load; it looks again every 30 s in case the relay is started later

### Added — Audio
- **Automatic room calibration** — the analyser learns the room instead of asking the listener to find a sensitivity number: it tracks the noise floor and signal ceiling in dBFS, fits the AnalyserNode's own dB window to them (the defaults waste almost the whole 0-255 spectrum on a quiet room, which is the mechanical reason a distant mic drives the visuals so weakly), and normalises every band against its own learned range so bass, mids and treble each use their full travel wherever the app is running (`src/lib/audioCalibration.ts`, `autoCalibrate`)
- Calibration readout and a Recalibrate button in Settings → Audio Input, showing the learned floor and peak
- **Raw microphone capture** — echo cancellation, noise suppression and auto gain are now switched off. They are tuned for speech on a call and are hostile to music: suppression ducks a steady groove as background noise, AGC flattens the dynamics, and echo cancellation can null out the speakers in the room
- A smoothed signal gate so the silences between beats don't strobe the visuals, and a noise-floor rule that lifts only from levels near the floor — a floor that chased the running level would climb to meet sustained music and squeeze the range shut a minute into every song

### Added — Depth
- **Surface relief** — the frame is lit from a real height field assembled at three scales: the bead's own dome, the meniscus of every cell (analytic, from each cell's radial slope) and the grooves the lacing cuts. Wet specular highlights, a refracting rim and occlusion in the recesses (`macroRelief`)
- Two-tap contact shadow — one tight to the bead, one wider and softer behind it, which is what lifts the paint off the ground instead of leaving it pasted flat on

### Changed — Audio
- The sensitivity slider is now a trim either side of the calibrated level rather than the control that has to be right; its default maps to unity gain
- Moving a slider no longer tears down and rebuilds the AudioContext, so trims don't glitch the audio or discard the room calibration mid-song

### Changed — Rendering
- **Dark ink reads as dark ink.** Opacity now accounts for how much of the spectrum the dye absorbs, so black hides the lit ground behind it instead of sitting over it at the same opacity as a yellow and greying out; cell cores darken the whole way rather than being scaled down by the patch mask; film grain is scaled by brightness, since a fixed offset on near-black pixels is a grey haze
- **The solver runs on wall-clock time**, not one step per rendered frame. The light show used to run in slow motion on a weak GPU and at double speed on a 120 Hz display; steps are now driven by elapsed time and capped, so a slow frame catches up rather than falling behind
- Each cell is evaluated against every neighbour's profile rather than being assigned to its nearest centre, so crowded cells keep complete circular rings instead of being clipped into polygons
- The silhouette warp no longer deforms the cells themselves — bent circles read as lumps rather than as bubbles

### Changed — Macro Closeup
- Macro frames expose against the plate's own density histogram each frame: dye below the level where the top ~14% of the plate begins renders as bare ground, and the range above it is stretched to full opacity, so a closeup always has a subject, a silhouette and visible surface under the paint
- The dye budget drops from a near-full plate to a sparse one while the closeup camera is running — a saturated plate magnified is just one flat colour
- Defocused pixels skip the 8-tap normal and the interface pass, which more than pays for the macro detail: the closeup renders faster than the plate-wide view

## [1.2.0] - 2026-07-28

### Added
- **Local song recognition** — each first listen's recording is reduced to a Shazam-style spectral-peak constellation fingerprint (stored in IndexedDB). Repeat listens are recognized locally in seconds — offline, free, with sample-accurate playback position — and the AudD API becomes a fallback for unknown tracks only. Manually tagged tracks also become auto-recognized after one listen.
- Per-track auto-preset: identification picks a visualizer preset matched to the music's energy/bass/brightness, deterministic per ISRC and remembered across listens (toggleable)
- Palette lock: pin any of 13 curated color harmonies from a new left-panel section, overriding drains/seeds/auto-rotation/music (persists across sessions)
- Dye Color swatch grid for one-click recoloring of the manual tools
- Beat-triggered color rings, audio-reactive turbulence, mid/treble vorticity, three multi-hue ambient injection orbits, treble dye sparks

### Changed
- Fluid sim grid 128 → 192 with sqrt-encoded density textures — smoother edges, no gradient banding; solver iterations tuned per use so net cost stays at or below the old build
- Identification latency: first attempt fires as soon as sound is present, 5s snippets, 10s retries; between-song dips trigger instant re-identification
- First-listen recordings are trimmed at the true track boundary before analysis

### Fixed
- Plate saturation washout: self-regulating dye budget (density-aware evaporation + per-cell thickness cap) keeps blobs, boundaries and empty glass in equilibrium
- Silent fingerprint-capture failures from forced sample rates / suspended AudioContexts
- Side control columns overlapping the top bar on short windows

## [1.1.0] - 2026-07-28

### Added — Liquid Light Show rendering
- Multi-octave curl-noise turbulence in the velocity field — structure at every scale, from whole-blob motion down to ripples and filament trails (`turbulenceScale`, `turbulenceDetail`)
- Blob surface tension parameter trading cohesion against shear — low values give amoeba-like elongation and pinching instead of static circles (`blobSurfaceTension`)
- Bright interface line where two distinct dye colors meet, faking the oil-water boundary look without a multi-fluid solve (`boundaryContrast`)
- Saturation multiplier in the final color grade to counteract muddy blending (`saturationBoost`)
- New "Light Show Look" section in Settings exposing all rendering parameters

### Changed — Liquid Light Show rendering
- Specular/Fresnel lighting pass now gated behind a `glossiness` parameter defaulting to 0 — fluid renders as flat, evenly-lit matte dye (the projected light show look) instead of glossy 3D spheres; Lava Lamp keeps a faint sheen
- Gooey post-blur is parametrized (`postBlurRadius`) and defaults far lower, so fine turbulent detail survives to the screen
- Signature presets (Classic, Galaxy, Acid Trip, Lava Lamp) tuned for the new parameters

### Added — Music Intelligence layer
- Song identification via AudD/ACRCloud fingerprinting behind a Cloudflare Worker proxy (`server/fingerprint-worker.js`, key stays server-side); manual track tagging fallback when no proxy is configured
- First-listen song map generation: the listen is recorded client-side and analyzed offline in a Web Worker (FFT → chroma/energy/centroid features → self-similarity novelty segmentation into intro/verse/chorus/bridge/outro, plus autocorrelation pitch curve and RMS energy curve), cached in IndexedDB by ISRC
- Structure-synced visuals: known song structure drives turbulence, saturation and audio impact over the track timeline (choruses surge, intros/outros calm)
- Synced lyrics via LRCLIB (free, no key) with LRC parsing, rough energy-based alignment fallback for unsynced lyrics, semantic word-triggers (fire/water/sky/earth/love/dark/light/motion themed dye bursts), lexicon-based sentiment arc per section, and an optional kinetic typography overlay
- Deterministic per-track visual identity: ISRC hash seeds palette harmony, turbulence and density offsets so every song has a consistent look
- Evolution across listens: complexity ramps, palette drifts and new trigger themes unlock as listen count grows; every listen's parameter snapshot is stored
- Track Intelligence panel: now playing with section timeline, evolution progress, listen history with one-tap replay of any past listen's frozen visual parameters, library view and music settings (lyric triggers, sentiment arc, lyrics overlay, evolution speed)

## [1.0.0] - 2026-04-05

### Added
- Real-time Navier-Stokes fluid simulation with squeeze-film flow, buoyancy, immiscibility, and fingering
- Microphone and system audio input via Web Audio API
- 1024-point FFT audio analysis with per-feature smoothing (bass, mid, treble, energy, timbre, complexity)
- Frequency-aware band splitting (20-250 Hz bass, 250-4000 Hz mid, 4000+ Hz treble)
- Configurable audio-to-physics mappings (velocity, density, color, rotation, bubbles)
- 10 built-in presets (Classic Light Show, Deep Ocean, Cyberpunk Neon, Lava Lamp, Monochrome Ink, Acid Trip, Bass Drop, Timbre Shifter, Boiling Point, Microscopic Chaos)
- Multi-layer compositing (up to 5 layers) with blend modes (screen, lighter, exclusion, multiply, overlay)
- LED platform simulation with 5 gradient modes (single, rainbow, ocean, fire, cyberpunk)
- Interactive dropper and blow tools with mouse and touch support
- Automation mode for hands-free audio-reactive visuals
- 3D Phong lighting on fluid surface
- Bubble system with merging, splitting, and buoyancy physics
- Rain drip, glass smear, and airflow effects
- Film grain post-processing
- Full settings panel with sliders for all simulation parameters
- Responsive UI with minimize/maximize toggle

### Performance
- Pre-allocated ImageData objects to eliminate per-frame GC pressure
- Pre-baked film grain textures (replaced 200 fillRect calls/frame with single drawImage)
- Cached hex-to-RGB conversion for hot-path color lookups
- Shared constants module eliminating 9 duplicate color palette definitions
- Unified getAudioValue utility replacing 3 duplicated switch statements
