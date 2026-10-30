# 8. The desk: the laptop is a control surface, not the show: what shipped

How §8's shipped items were found, built and measured. The open work is in
[`docs/plan/08-desk.md`](../plan/08-desk.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## First pass (moved 2026-10-04)

### 8. The desk: the laptop is a control surface, not the show

`src/App.tsx`, `src/components/PerformDesk.tsx` (new), `src/lib/lookFade.ts` (new),
`src/components/SettingsPanel.tsx`, `scripts/desk.mjs` (new)

The laptop screen is about ninety per cent canvas, and the canvas is the one thing the
operator does not need to look at — it is on the wall behind them, larger. Everything
they *do* need is either in a panel that has to be opened and scrolled, or not shown at
all. That was the right shape when the browser window was the show. It stopped being
the right shape the day the projector window arrived.

Two facts from the code decide how this is built.

**The render is already decoupled.** When a projector window opens it announces its
pixel size and the show window renders *that many* pixels (`setStage`); the laptop
displays that canvas scaled by CSS. So shrinking the laptop's canvas to a preview costs
the audience nothing — not one pixel. The desk is a layout change, not a rendering one.
This is the fact that makes the whole batch cheap, and it was not obvious: the obvious
reading of "mirror the canvas" is that the laptop's size is the stage's size.

**A look change is destructive.** `applyPreset` calls `clearAll()` on every layer and
reseeds. On a projector, mid-song, that is a hard cut through near-black. The
non-destructive path already exists — `adoptPreset` takes on the new dyes, styles and
liquids without wiping the plate, and the sequencer has been using it all along. What is
missing is a timed interpolation of the ~80 settings between the two looks. So the
single most valuable change here is not layout at all.

The order below is by what a show night would miss most, not by what is most visible.

**8a. Cue and Go.** Arm a preset; nothing reaches the audience until Go. Go crossfades
over a set time by interpolating the settings and adopting the dyes, never clearing.
The clearing path stays, as the thing you use when *building* a look. Plus one-step
revert to the previous look, because the fastest fix mid-show is undo.

> **Gate:** driving the app through a preset change, the stage's mean luminance never
> falls below 60% of where it started, at any frame, over a two-second fade. Today's
> `applyPreset` is the control: it should fail this, and by a lot.

**8b. Perform and Design.** Perform: a preview of the stage, and the controls around it.
Design: today's full-bleed canvas, for building looks. Perform is the default once a
projector is attached.

> **Gate:** with a stage attached, the canvas's backing store is the same size in both
> modes. If Perform costs the projector resolution, it is wrong.

**8c. The ride strip.** Six to eight controls always out, with hit targets a hand can
find in the dark, chosen by the user from `LEARNABLE_SETTINGS` — the same list MIDI
learn uses, so the desk and the controller map cannot disagree about what is rideable.

**8d. A status line that tells the truth.** What is live and how long it has been up,
the sequencer's stage and time to the next, the audio source and its level, the engine's
rung, and whether the projector, MIDI, camera and recorder are connected. Nearly all of
this is already computed and simply never shown.

**8e. Guard what cannot be undone.** *Lucky* replaces all ~80 settings from one
unguarded click, next to controls used mid-show. It gets a confirm, or a revert, or it
leaves Perform.

**8f. Legibility in a dark room.** The UI leans on `text-white/30` and 7–10px uppercase.
That reads well in a screenshot and badly at arm's length with eyes adapted to a
projection.

> **Gate:** measured over the rendered app, no actionable control below 11px or below
> 0.6 effective contrast against its background, and no hit target under 44px. Measure
> the current state first and record it, so the claim is a number rather than a taste.

**The risk worth naming.** This moves controls that someone has muscle memory for, and
muscle memory is most of what playing an instrument is. Design mode exists so nothing
is *taken away*, and the desk is judged on whether a show can be played from it, not on
whether it is tidier.

*Proposed 2026-09-28:* **pictures, not swatches, in the cue list.** In the dark a look is
picked by its name and one colour swatch (`lookSwatch`, `PhoneStage.tsx`, and the desk's
pick lists). `gallery.yml` already photographs every preset; ship those photographs as
thumbnails, and have Save Look keep a still of the plate in the preset file, sent to a
receiver once rather than in every cast state (the lesson of S0's logo, in
`docs/stability-plan.md`). The phone's Looks sheet, where rows are smallest, gains most.
*Measure:* `npm run desk` and `npm run phone` find a picture on every built-in look's
row; the cast state's size is unchanged.

## Second pass (moved 2026-10-04)

#### 8-v2. Desk v2: one desk, three layouts (2026-10-10)

`src/components/desk/Desk.tsx`, `DeskPanels.tsx`, `PanelBrowser.tsx` (new),
`src/lib/deskLayout.ts`, `src/hooks/useDeskLayout.ts` (new), `src/components/ui`
(`Knob`, `PanelFrame`), `SettingsPanel.tsx` (`embed`, `scope="stage"`), `App.tsx`;
`PerformDesk.tsx` and `DesignDesk.tsx` removed. Checks: `npm run desklayout` (new),
`npm run layout` (extended).

The owner's design (a design project, handed over as a zip) replaced the two
fixed desks with one desk whose cells are filled from a layout. Every settings section
is a panel under its own id, beside the desk's own panels (cues, rides, recipe,
bottles, dyes, tools, the phone link). A panel docks in the left or right column or the
deck under the plate, floats over the plate, folds to its header or closes; its grip
drags it between them. Build (the Design desk's job), Gig (the Perform desk's) and
Load-in (new: the controller, the sound, the wall and its mapping) are three shipped
layouts; each remembers where its panels were, stored only once it differs from the
shipped one, the rides' lesson. ⌘1/2/3 switch them, ⌘P opens the panel browser (the
sheet's search, by what a section is about), ⌘, the Stage sheet (the room and the
machine), ⌥D folds the deck, Tab hides the floating panels.

What was kept, and why:

- **Preview is the old Design desk's hold.** The plate bar's Live | Preview replaces the
  Perform/Design split. `designing` in App is now "the plate in Preview", so the
  sequencer, a song's show and a new song's look hold off while a look is built, as on
  the bench. Build ships in Preview (the design drew it Live) so the bench behaves as it
  did; a true offline copy is 8b.
- **The old ids.** The root is `design-desk` in Build and `perform-desk` in Gig, the header
  still says `design`/`perform` underneath, and every control kept its test id, so
  `qa`, `saves`, `bubbles` and the rest find what they found.
- **Knobs are real range inputs**, drawn over. An encoder or nothing learned gets a knob,
  a fader a slider (the design's rule). The rides stay sliders.
- **A section on a desk is held to the desk's rules.** Drawing them as panels found what
  the sheet never had measured: a 4 px rail on the Wall's masks and gain, two 20 px
  switches in Audio Input, a 22 px ⓘ and inline links. Each is 24 px now, and `layout`
  docks every panel there is and measures it.
- **One control, once.** Blackout moved to the header in every layout (the sheet's copy
  is gone under a desk); the recipe leaves Evolve and All settings to the rides when
  both are out.

Measured: `npm run layout` 39 → 58 checks, all green, at 1440/1280/1024 and phone
widths, with all 33 panels docked at once (511 controls) each drawing its body; `npm run desklayout`
40/40 (it found two real faults in `sanitizeLayout` on its first run: a panel twice in
one list kept both, and a stored array read as an empty layout). `panel` 180/180,
`desk`, `saves` 33/33, `phone` 292/292, `remotemix`, `rowfade`, `backplate`, `intro`
12/12 unchanged in what they assert.
#### 8-draw. Draw: the phone or iPad as the wall's pad (2026-10-10)

`src/components/DrawScreen.tsx` (new), `RemoteControl.tsx`. Check: `npm run draw` (new,
in the Measure job's browser part); `applink` and `remotemix` now start on Draw.

The Desk v2 design's #3c (phone) and #3d (iPad). The remote already had the pad as a
full screen, behind the Projectionist's Full button, with the tools and dyes as chip
rows under it. Draw makes it the screen the remote opens on, with dyes down one edge,
the four tools (Drop, Blow, Press, Stir) down the other, and Amount, Lucky, Freeze and
Blackout along the bottom; the iPad adds the bottle list, a Layer row and Clear. The
old page is Controls, one tap away, and which of the two a device was left on is kept
on it, so a tablet set up as the Gig remote opens as that again after a reload.

- **Nothing on the wire changed.** Draw is handed RemoteControl's own pad handlers
  (the 30 Hz drag, the 60 Hz held press, the press repeats), not a copy of them.
- **A touch lands in the wall's 16:9 frame**, the largest that fits the pad, and a
  touch outside it on its edge. The old full pad stretched the wall over the whole
  screen, so on a portrait phone a circle came out on the wall as a flat ellipse.
- **Amount** multiplies what a touch lays, 0.1×–2×: the display reads a pad's amount
  as 0.05–1 with a finger at 0.5, so that is the whole range and nothing past it.
- **Blackout** is tap to fade (latched) and hold to go dark while held, both through the
  display's one toggle, which fades over 1.1 s; a true snap is 8-draw-c.
- **A phone on its side** keeps the phone layout (the short side decides, as
  `lib/phone.ts` does) with the bottom bar in one row: 316 to 444 px of frame width.
- In the app, a wrong key or a missing laptop puts Change laptop in the frame, under
  the words that ask for it.

Measured (cloud): `draw` 76/76 (phone, phone on its side, iPad both ways, wrong key),
`applink` 49/49, `remotemix` 17/17. Pictures: the project's draw-8 folder.



#### 8-draw-a. The wall under Draw's pad, and touches that land under the finger (2026-10-10)

`src/lib/padPicture.ts` (new), `DrawScreen.tsx`, `RemoteControl.tsx`, `App.tsx`,
`LiquidVisualizer.tsx` (the frame task's tap and `wallToPlate`), `remoteProtocol.ts`.
Check: `npm run drawwall` (new; Measure's browser part) and `drawwall -- --app` (the
Mac's tools shard).

Reported: Draw's frame was black, so a hand drew blind on the phone. The laptop now
sends what it drew: in the frame task (the only place a presented WebGPU canvas can be
read; the projector window is drawn the same way), a copy as wide as the pad's frame
(160–480 px) is encoded as a JPEG in a worker and sent over the relay, at most 15 a
second, up to three in flight. Not the canvas's `toBlob`: Chromium runs it in the page's
idle time, and the Mac's show, drawing every frame, got 2 pictures a second from it. Not one
in flight: each round trip (bitmap, worker, answer) waits for gaps between the show's frames,
and one at a time came to 4.3 a second at 18 frames. On WebGPU, not from the canvas at all:
a 2D canvas's copy is the GPU's too, and its readback waited behind the plate, 6.3 a second
at 30 frames with three in flight. The engine shrinks the frame's texture in one small pass
on its own device and reads it back a frame or two behind, as the flash probe does
(`gpu/padGrab.ts`), and the worker encodes the bytes on the CPU. Not a WebRTC video track: that needs signalling through
the relay, ICE on a show network that may not route between two Wi-Fi clients, and a
decoder that buffers, which is latency a hand feels. Nothing is sent until a remote on
Draw asks; it renews a three-second lease every second, so a phone that locks or leaves
Draw stops the pictures without saying goodbye, and the relay stays stateless. The pad
paints each picture by hand on a canvas (no React render per picture), latest-wins,
dims it when pictures stop for 2 s, hides it while unlinked, and takes its shape.

Found while building it: the pad's touches were the plate's points, and the wall shows
the middle of a plate half again as wide (1/1.5 of it across a 16:9 wall, 0.375 of it
up), turned with the dish. A touch at the frame's top went to plate y = 1, off the wall,
and on a turned dish (Classic's was about 110° round in the cloud probe) a touch away
from the middle landed round from the finger. Pad
messages now carry `wall: true` and the laptop maps them through its own pointer's
camera (`wallToPlate`: overscan, the dish's turn, the closeup, layer 2's view); a stroke
maps both ends, a pen's lean is turned and keeps its length, and Spin leaves the dish's
turn out (it reads the hand's angle as the room sees it). Without the flag (OSC, an
older remote) the point is the plate's, as before.

Measured (cloud): `drawwall` 16/16 (15.0 pictures/s, 6.2 kB each on a textured 4:3
test card; quarters the right way up; frame 333×250 = 4:3); controls: a lease that never
lapses fails "stops sending" (161 → 176), a frame that ignores the picture's shape fails
"4:3" (444×250). `draw` 76/76, `phone` 351, `layout` 58, `applink` 49, `remotemix` 17,
`panel` 180. On the Mac (`drawwall --app`): the pad's picture is the plate's colour
(159,53,82 against grabFrame's 159,53,82); on a dish turned a radian, four drops from
the pad changed the finger's cell by 287 (median cell 4, drift 5, centre 0.69,0.58 for
0.69,0.58); the same point without the dish's turn changed it by 11 (it landed at
0.56,0.82), and the old plate point by 3.

**8-draw-a-4. A slow show starved the pad (2026-10-29).** `drawwall --app`'s "the
laptop's own frames reach Draw, at least 8 a second" was red on #390 (7.0/s) and #436
(6.3/s, run 40094781104), PRs that touched only static pages, both on Mac runners
whose display had fallen to 14 frames a second. Not the count: it is the pictures
painted on the remote, and 14 frames could have given 14. The sender let three
pictures out at once (and the GPU grab kept three slots), and a picture's trip (the
read behind the plate's queued frames, the worker's encode, its answer) is counted in
frames, about seven at 14, 480 ms, so the pad got three a trip. The trip is longest in
time exactly when every frame is needed. Across 384 tools jobs (10-17 to 10-29) the
pad's rate was 0.41–0.52 of the display's frames on every run (median 0.485, 8.0–13.0/s
at 16–27 frames), so it was starved always, and red (28 of them, 6.3–7.7/s) whenever a
runner fell under about 16.5 frames, 11 of 31 jobs on 10-27 as the runners slowed. Now eight (`PAD_PICTURE_IN_FLIGHT`, shared by
the slots, which are made only when every one is out). The stand-in check holds each
GPU read four more frames, the Mac's trip: 6.0/s at 14.3 frames with three, 14.3/s
with eight; a new line checks the grab hands out as many slots as the sender lets out.
The sender keeps a trace (frames offered, passed over full, round trips split into read
and encode), printed beside every rate line, so the next slow run says what held it.
#### 8-play. Play: the phone's listening screen (2026-10-10)

`src/components/phone/PhonePlay.tsx`, `src/lib/playGesture.ts`, `src/components/ui/TouchSlider.tsx`
(new); `src/lib/phone.ts` (`phoneScreen`, `/play`), `PhoneStage.tsx` (Play screen in More),
`App.tsx`. Check: `npm run phone`'s Play part.

Desk v2 shipped with the phone unchanged, and the owner asked for the phone and tablet
versions. The design's screens 3a and 3b are Play, "a standalone phone app for casual use",
for the buyers the owner wants beside the VJs: someone with a record on at home. The phone
layout before it (PhoneStage, #173) is a performer's, sixteen buttons in a performer's words.
So a phone now opens on Play: the plate edge to edge, the look's name with Shuffle and
Record over it, and a glass tray of eight dyes and Drop, Blow and Press. The tray's handle
pulls up the sheet: Speed, Turbulence, Swirl, Soap, Zoom and Evolve as touch sliders (44
rows, the desk's travel and Speed's curve), the looks as tiles to swipe, Follow the music
(the microphone, with Sound Drive brought to the middle on a look that has none, 8-play-d)
and Wander on its own (Evolve), then Shuffle, Clear plate and Share clip (the phone's share
sheet with the take as a file, or a download). Save is at the top while the sheet is up.
All controls on the tray is the full phone layout; Play screen in its More sheet comes
back, and the choice is kept on the phone. `/play` is Play on anything, which is how an iPad
gets it, at the design system's iPad sizes (dyes 56, hands 72); `?play=0` is the full layout,
which the checks written against it now open.

With Drop on the tray the touch picks its own hand, as the hint over the tray says on the
first three visits: a tap drops, a drag streaks, two fingers blow, a still hold (450 ms)
presses. Each is a tool the plate already has with its own physics; the reading only picks
which, and a touch keeps the hand it became until every finger is off. On the closeup two
fingers stay the camera (the plate's pinch), and the hint says "pinch zooms" there. Save
asks for a name every time, as QA-18 has it everywhere else.

Measured: `npm run phone` 292 → 368 under `PW_WEBGPU=1` (the hands' six, read from the
tool and the hands the plate's loop holds, need the plate; without it they are reported as
not run, and the Mac shard requires them). `saves` 33 → 38 (Play's Save), `layout` 58/58,
`applink` 48/48 (Play here now lands on Play, and the Laptop remote is reached through All
controls, 8-play-a), `intro` 12/12, `panel` 180/180, `desk` 27/27.

#### 8b. Preview builds on a copy (2026-10-10)

`App.tsx` (`drafting`, `wallLook`, `sendDraftToWall`, `wallRef`), `LiquidVisualizer.tsx`
(`draft`, `hidden`), `desk/Desk.tsx` and `deskProps.ts` (`onOpenWall`), `scripts/draftwall.mjs` (new).

What was wrong: Preview held the sequencer, a song's show and a new song's look, but the
plate being built was the plate on the wall. The projector window is painted from the
show's one canvas (`__chromaglassMirror`, in the frame task), so every slider tried while
choosing the next look was on the wall as it was tried, under a plate bar that said
"preview · not on wall".

What it does now: while Preview is on and a wall is up (the projector window, a cast
receiver or a network display), App mounts a second visualizer, `draft`, in the desk's
preview. The first carries on drawing the wall, hidden from the desk (`visibility`, so it
keeps its size and its frames), with the look it had when Preview took the desk off it.
The desk edits go to the copy without each call knowing: `visualizerRef` is the copy then,
and the show's calls (the music's harmony and triggers, the sequencer, a song's show, the
remote's hands, the projector's size, the render) go through `wallRef`. The room's
settings (the dimmer, the mixer, the logo's and the film's levels, `RIG_KEYS`) still reach
the wall from the desk, and so does the music. The desk's clears, seeds and drains do not.
A receiver that draws its own plate is sent the wall's look too.

Send to wall (⌘⏎) hands the copy's look to the wall as a Go does: the dyes and pours
adopted, the colours handed over, the settings faded over the Go's fade. With no wall up,
Send to wall opens the projector window as before, and the header's Wall dot always does.
Live puts the desk back on the wall's look, counters and all, so switching to Live never
changes what the room sees; the copy's unsaved changes are dropped. The wall closing
mid-Preview takes the copy down, and the desk carries on from the copy's look on the one
engine.

Why a whole second engine and not a third plate in the first: the frame loop walks every
plate it holds (tilt, stir, evolve, pours, the hands), so a draft plate there would be
moved with the live ones and drawn into the wall's frame. A second engine is its own
device, solvers and passes; it leaves alone what is the show's (the projector's paint
hook and frame asks, the debug hooks, the crash log's providers and heartbeat, the
recorder's `#liquid-canvas`). With no wall up Preview stays one engine, so a Build session
on a laptop pays for one solver, not two.

The pre-push review found the edges, all fixed and measured: in the render where Preview
ends the copy is gone before the desk is put back, and the wall's engine and a receiver
were handed the copy's plates and counters for that one render (a plate dropped in front
of the room; a receiver kept the copy's look). The wall's engine and a receiver now follow
`wallLook` while it is held, not `drafting`. Live in the middle of a Send's fade landed
halfway; it lands on the look being sent. The copy is composed at the wall's shape
(`setStage`), the palette lock and the mark reach both engines, a film goes to the wall,
the desk's Spin to the copy, Live puts back the saved look that was open and the wall's
back plate, and a built-in's id is never handed a null contract (the plate tables are
module constants both engines read).

Measured: `npm run draftwall` 20/20 (new; Measure's browser part, and the Mac's open
shard with `--frames`, where the line on what the projector window draws from must see
frames). It reads every plate count and clear an engine was handed and every state sent to
a receiver (`handed` on the debug hook, `sent` on the cast hook), because a value handed
for one render is gone before a poll can see it. Controls: the wall's engine handed the
desk's settings fails "and not the wall's engine" and "across the fade" (16/18); the wall
following `drafting` instead of `wallLook` fails "nor for a render" (plates 1/2/1/2, clears
2/0/2/0); the clear line's own control is in the run (with one engine the same clear
reaches the wall, 0 → 1). `layout` 72/72, `phone` 352/352, `panel` 180/180, `desk` 40/40,
`desklayout` 40/40. Found along the way: 8b-1 to 8b-5.

Afterwards (2026-10-11): "across the fade" read the wall once, 0.4 s after Send, and
went red on main's deploy after #339 with the fade 0% along; four green Mac runs had it 20,
14, 6 and 3% along, so the reading measured how soon a loaded page answered the key. It
now reads the wall until it lands and asks for three or more readings between the looks
and at least 1 s from the last on the old look to the first on the new (2.02 s here, 36
readings). Controls: an instant Send fails (0 readings, 0.05 s), a 0.3 s fade fails (0.38
s), and so does a page stalled 1.1 s inside the Send (the wall's fade cut to 0.92 s).

#### 8g. A panel in a window of its own (2026-10-10)

`desk/PanelWindow.tsx` (new), `desk/Desk.tsx`, `ui/index.tsx` (`PanelFrame`), `desk/DeskPanels.tsx`.

Every panel's header has a fourth button (and its menu a row), Open in its own window: the
panel moves to a window of its own, sized as it was drawn, for a second display at a gig,
and its place on the desk becomes a card that says so and brings it back. The window is a
blank one with the page's stylesheets and theme copied in, and the panel is the desk's own
React tree portalled into it, not a second copy of the app: every control in it is the
desk's state, so there is nothing to keep in step and no second solver or sound. The
window is kept beside the layout, never in it (a reload has no window to put it in), and
closing it, by its Bring it back button or by the system, puts the panel back where it
was. The clean screen on the laptop leaves the windows up (the desk is kept mounted, not
drawn, where it used to be unmounted); the page closing closes them. The Rides' Mixer sheet, the Dyes'
palette menu and the Tools' options open in the panel's own window (a `PortalBody` context), not on the other
screen. A browser set to refuse windows floats the panel instead. A phone has no second
display, and the remote has no panels, so this is the laptop's.

Measured (cloud): `layout` 68 → 72 (a deck panel opens in its own window with its 8 knobs
and the desk's background, rgb(17, 17, 19), while its place on the desk holds the card and
no knobs; a clean screen keeps the window and its panel, and Esc brings the desk back with
the card; a knob turned in the window 0.313 → 0.564 reads 0.564 back on the desk after the
window is closed; with `window.open` refused it floats). Controls: with the stylesheets not
copied the first check fails (the window's panel reads rgba(0, 0, 0, 0)); with the desk
unmounted on a clean screen, as it was, the window is gone and the clean-screen check fails.

#### 8c, 8d, 8e, 8f, 8h. The rest of Desk v2's small pieces (2026-10-10)

`src/lib/knobDrag.ts`, `src/lib/qr.ts`, `scripts/qr.mjs`, `scripts/wallpattern.mjs` (new);
`ui/index.tsx` (Knob, Slider), `ui/TouchSlider.tsx`, `desk/DeskPanels.tsx`, `desk/DeskHeader.tsx`,
`OutputPanel.tsx`, `lib/midi.ts` (`controlKindOf`), `lib/outputConfig.ts` (`WallTest`),
`gpu/output.ts` and `gpu/wgsl/output.ts` (the wall test), `App.tsx`, `PhonePlay.tsx`.

- **8c** A knob takes hold where the hand does: on its cap it is the vertical drag it was
  (0.5% of the range a pixel); on its ring it follows the hand round, a full 270° sweep
  being its whole travel. The two disagree about the same motion (up on the ring's right
  side is anticlockwise), so the knob decides once, at the hold. A double-click puts a knob
  or a desk slider back to the look's own value (`lookOf` of the open document, or of the
  built-in it came from); a rig setting such as the dimmer has none and stays. On a phone
  every knob is a touch slider, so Play's five setting sliders take a double tap instead.
- **8d** The desk drew every absolute CC as a fader, because a binding only says absolute or
  relative. `controlKindOf` names which CCs turn on the boards the factory maps are for (the
  APC40's device and track knobs and its two encoders, the Launch Control XL's three rows,
  the nanoKONTROL2's eight), from the map's device or else the port; an unknown board keeps
  today's rule.
- **8e** Load-in's Wall panel (and the Stage sheet's) has a Test pattern switch and Identify,
  and Output gain and Gamma as 56 px knobs. The pattern is drawn in the projector's own pass,
  so it goes through the same corner pin, flip and blanking as the show: per quad a grid kept
  square by the quad's shape on the wall, both diagonals, a circle 0.8 of the height across,
  a white border, the corners numbered 1 to 4 clockwise from the top left as the pin's
  handles are, and the quad's number in the middle (a mapped shape's place in the Mapping
  list). Identify flashes each quad's number, half the height tall, for three seconds over
  whatever is up. Neither is ever stored with the output config (a show reopened on a test
  pattern would put a grid in front of the room); App keeps it beside the config and lays it
  on for the plate and the cast state, so a receiver drawing its own plate shows it too.
  The design puts the switch in Load-in's plate bar; the bar is one bar in every layout
  (`npm run panel`), so that is 8e-2.
- **8f** The Phone · iPad panel draws its link as a QR code: an encoder written here (byte
  mode, level M, versions 1–10, the eight masks scored by the standard's penalty rules),
  drawn as one SVG path in whole pixels per module, black on white with its quiet zone.
- **8f-1** The Phone · iPad panel's code whenever nothing is linked, and Link another while phones are (2026-10-11; check `npm run phonelink`). On the hosted site the panel had said "No phone linked." over three lines of words and no code. The desk never knew whether a phone was linked: `status.phone` was the display's own socket to the relay, so with the Mac app up and no phone in the room the panel said "A phone is linked and driving the show" and the footer "phone linked". The relay (`server/remote-server.js`) now counts phones (`controllers`) for the display as it counts network displays (`mirrors`), and gives a display the count on its hello; the desk counts them, puts the code away while one is on, and a Link another button brings it back. With no show server behind the page the code is the page's own address (`/`), which opens the show on the phone itself, and the words say how to get a show server.
- **8h** The header at 1024 measured 342 px of cluster against 337 of room right of the
  centred switch, so the Sound dot sat 5 px under it. The header now has three measured
  levels: the dots' words beside them, under them (12 px from the switch, as before), and
  folded into one Status button (only when the cluster actually reaches the switch), whose
  dot is red while recording and green while anything is connected, and which opens every
  dot as it was. At 1024 the folded cluster is 73 px clear. Where the dots unfold depends on the
  fonts: 1280 keeps every dot in sight in a cloud session, CI's Linux runner folds there and
  unfolds by 1440, so the check finds the width rather than assuming it.

Measured (cloud): `desk` 27 → 40 (8c's ring arithmetic, 8d's four boards and an unknown one
as the control); `qr` 13/13 new (every symbol read back from its modules: format and
version words against their BCH codes, every Reed–Solomon block's syndromes zero, the bytes;
three flipped modules make 35 syndromes non-zero, the control), and all eight cases decoded
by OpenCV's reader in the session; `wallpattern` 20/20 new under `PW_WEBGPU=1` (on CI's open shard) (off is the
pass byte for byte; on, the grid, cross, border, circle and corner digits where they should
be, following a pulled pin, swapped by a flip, under a mask, one number per mapped shape,
Identify over the show, ungraded); `map` 44 → 47 (a config saved with the pattern up is stored without it); `layout` 58 → 68 (a knob turned round its
ring 0.113 → 0.779, a cap drag sideways leaves it, a double-click back to the look's 0.313;
the Wall panel's four controls and the pattern never stored; the QR drawn module for module;
the header clear of the switch at 1024 with a seventh dot in it, folding and unfolding where
the dots fit, and a take's Rec dot folding a full header and unfolding it when the take stops; the "every status dot is labelled" check opens the fold and counts the five dots inside
it, not the one button); `phone` 369/369 with Play's double tap back to the look's speed; `panel` 180/180; `wgsl`;
`desklayout` 40/40.

**8i, shipped 2026-10-10: fewer panels, each usable at any size.** Three asks from the
owner in one evening, with screenshots. *No setting alone on a panel*: a knobs panel draws
the numbers of its section, so Sound Mappings (Sound Drive and four band pickers) was a
panel of one knob and Heat Slide one of two. Sound Mappings went into Sound (Sound Drive
first, the bands under "What the sound moves"), where Room Drive and Film Drive already
sit with their sources; Heat Slide went into Fluid Physics beside Heat Spread and
Buoyancy. `MERGED_SECTIONS` in `settingsMap.ts` sends the old ids on: a saved layout
naming them opens the merged panel in the same place (`sanitizeLayout`), and
`openSettingsAt` follows them. Build's deck has Sound where Sound Mappings was. MIDI maps
and presets name settings, not sections, so nothing in them moved. *Fade and Go
smaller*: the strip under the cue list went from 140px to 68px (a fade row that fills the
column, so 8s no longer ran past it, and a 36px Go); Back and Freeze are off it, and
stay on ⌫ and F, ⌘K, and their MIDI actions. *Panels as windows resize*: the frame
clips its rounded corners, and the Dyes body did not scroll, so on Gig's 236px deck
Palette, Image and Video were out of reach; and the palette list opened below its button
whatever was there. Every panel body now scrolls (never sideways), the swatch grid fits
as many 28px swatches a row as there is room for, the palette list opens over its button
when there is no room under it and is never taller than the window, and the Sound
section's source switch and the Video section's source buttons narrow or wrap to a
312px panel. Measured: `desklayout` 40/45 on main → 45/45 (no knobs panel under three,
the old ids landing on the merged panels, never twice); `layout`'s new reach check
(every control in every panel, scrolled into view only by what a hand can scroll, then
hit with a pointer: the three shipped layouts at 1024, 1280, 1440, 1920 and an iPad's
1180, every panel in the deck, in a column and floating) is red on main (Gig's Dyes
panel: Image and Video out of reach, and the palette list 667–1087px in a 700px window;
Load-in's Sound: Band cut off) and 4,162 controls in 255 panels over 23 desks reachable
after. `layout` 72 → 73. It takes the run from about one minute to under three.

## Third pass (moved 2026-10-29, 19m)

### 8. The desk: the laptop is a control surface, not the show

- ~~**8j** What a knob is called, and what it does~~ (the owner, 2026-10-22: the names
  on the deck's knobs were cut to the knob's width, and a drag swapped the name for the
  value under a chip laid over the row above, so a hand could not tell which knob it
  had). A hover or focus card with the whole name, one plain line on what it does and
  the live value, drawn into the body so no panel clips it and never over the knob; it
  stays up through a drag, and the knob keeps its own name while it is turned. One line
  for each of the 205 controls in `src/lib/controlHelp.ts` (`npm run panel` fails on a
  pinnable control without one). On the phone there is no hover: the name is the button,
  dotted underlined, and a tap or a hold opens the same card (`TouchSlider`, the touch
  `Slider`, a knob's label on a coarse pointer). Checks: `npm run panel`, `npm run
  layout` (hover, drag, release), `npm run phone` (the tap). Not changed: what any
  control does.

## Fourth pass (moved 2026-10-29, 19m-2)

### 8. The desk: the laptop is a control surface, not the show

#### 8j-2. Cards that stuck and stacked

  - ~~**8j-2** Cards that stuck and stacked~~ (the owner, 2026-10-24: Macro Zoom's card
    stayed up under Evolve Speed's). **Shipped.** A knob whose mouse-up never reached the
    page thought a hand was still on it: Chromium then sends no pointerup, only a
    lostpointercapture on the next buttonless move, which the knob did not hear. The
    drag now ends on a lost capture, a release or cancel anywhere in the window, a move
    with no button down, or the window losing focus; and one card is up at a time,
    whatever asked for it. Checks: `npm run layout` (two knobs with swallowed releases;
    a focused card replaced by a hovered one), `npm run phone` (a tap on another name
    swaps the card). Which gesture on the owner's Mac swallowed the release is not known.

#### 8j-3. Hover cards wait much longer

  - ~~**8j-3** Hover cards wait much longer~~ (the owner, 2026-10-27: "tool tips on
    hover over are getting annoying"). **Shipped.** One constant, `TIP_DELAY_MS` (1.5 s,
    `src/lib/tipDelay.ts`), was 380 ms for the knob and fader cards, and the browser's own
    `title=` tips (about 240 of them, near a second, not slowable) came up on top. Both
    now wait the one number, counted afresh on every control with no grace between
    neighbours: `src/lib/titleTips.ts` lifts a `title` off the element under a mouse or
    pen, draws its words on a card after the wait and puts it back when the hand goes,
    presses, types or scrolls (also in a panel's own window). The phone is unchanged: a
    touch never starts the wait and the name tap still opens its card at once. Checks:
    `npm run layout` (a knob's card and a `title=` are each absent at 60% of the wait and
    up after it; the title is back and the card gone after), `npm run phone`.
    Not changed: the remote page and the cast page, which do not install it.
