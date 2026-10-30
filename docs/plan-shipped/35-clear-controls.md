# 35. Clear controls: on reads on, one name for one thing (asked 2026-10-24): what shipped

How §35's shipped items were found, built and measured. The open work is in
[`docs/plan/35-clear-controls.md`](../plan/35-clear-controls.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 35. Clear controls: on reads on, one name for one thing

#### 35a. One look for on, every name unique (2026-10-24)

Reported: the owner, with the Video panel open and a loop playing, could not tell which of
Load loop, Camera, Window and Off was on (all four were the same grey button; only Off changed,
by greying out), nor which demo loop was playing, and found several buttons called Video.

Measured on main (4397c83): an on or chosen control was drawn nine ways (white fill ×18, white
tint ×19, a brighter border ×8, the accent ×10, the active grey ×4, `bg-text` ×3, amber ×24, raw
purple ×4, and text alone). The shared `Segmented` drew its chosen item in the active grey,
1.19:1 against the panel it sits on. `npm run switches` passed every one: its bar, ΔE 20, is a
difference found by comparing two buttons, not one read off a single button. With a new bar of
3:1 in light (the fill's luminance ratio, or a ring only one state has), 58 of the 516 controls
it reads were under it. And a source read found 88 buttons that change their look with a state
and say no state at all, so neither the browser check nor a screen reader could see them.

What changed: one look for on, `lit` (`#7C4DEB`, 3.47:1 against elevated, white text on it
5.1:1), used by `Segmented`, a new `pressed` on `Button`, and `LIT` for a button a Button cannot
be; `LIVE`, solid red, for on that is live now (Blackout, recording); white stays the one primary
on a surface. The switch's track keeps the accent (3.5:1 against the off track where lit would be
2.9). Every stateful button says `aria-pressed`, `-selected`, `-checked` or `-current`. Backwards
ones turned round: the desk's Blackout (red while off, white while on), the drone (green while
stopped), the phone's and the remote's play button (pressed now means paused, lit), the remote's
second Blackout (red while off). The Film section's Source is one pick-one (Off, Video file,
Webcam, Window), each demo loop row has its own Film and Pour, lit while that loop is doing it,
with a "playing as film" tag (the row was a button with Pour as Dye a span inside it, and Load
Film a span with no handler). Names: Video section → Film, the header dot → Film (it was lit by
the poured video and opened the film), Camera section → Lens, the film's Camera source → Webcam,
the Dye panel's Video… → Pour a
video…, Macro/Wide → Close-up (pressed), the phone dock's Presets → Looks and Play → Motion, Play
screen → Simple screen, Wander on its own → Evolve. Test ids kept.

Shortcut hints off the buttons (the owner, the same afternoon, with Save's ⌘S chip sitting on its
dirty dot: "hover over is probably better for descriptions and shortcut hints"). `Button`'s `kbd`
and `Segmented`'s keys are now in the hover title and `aria-keyshortcuts`, not drawn as a chip;
the tool grid's letters, + Panel's ⌘P, Show deck's ⌥D and the header's ⌘K (now a magnifier) the
same. Menus and the command palette keep theirs at the row's right edge, where they overlap
nothing. The phone has no keys.

The source reader was reviewed by the check-skeptic before it shipped, which found it skipping
`sizeId` (a filter on the word size matched the name; now whole words), a condition with text
before it (`cn('x hover:y', on ? …)`), the second branch, named branches, `&&`, colours not on
its list (it now allows only the tokens) and a constant `aria-pressed={false}`. The browser bar
was made to count a fill only the right way round and in lit, live, ok or the accent, a part
inside only at 15% of the control or more, and a group as disabled only when every member is.

Checks: `npm run states` (new, in Measure) and `npm run switches`' lift bar. Numbers before and
after are in the PR.

#### 35b. Seven groups, one vocabulary (2026-10-25)

Reported: the owner, 2026-10-24, "the grouping is bad": the same sections were sorted four ways
that did not agree, so the panel browser, the search and the phone's Settings disagreed about
where a thing is.

Measured on main (a7dd8e7): `data-group` in `SettingsPanel` said perform, setup, look, inputs or
stage (24 sections, read by nothing), `SETTINGS_CATEGORIES` said Live, Inputs, Look, Plate or
Stage, the panel browser borrowed those five and filed the desk's own panels under `live` and
`plate`, and the phone's Settings strip drew the same five with the headings hidden
(`hidden ... sm:block`), one flat run of 26 tabs.

What changed: `SETTINGS_CATEGORIES` is the one list, Play, Pour, Feed, Motion, Chemistry, Look,
Stage. Play: Master, Mixer and the desk's Cues, Rides, Recipe, Score. Pour: Bottles, Dyes, Tools,
Liquids, Manual Interaction. Feed: Sound, Motion camera, Film, Patches, Controller. Motion:
Kaleidoscope, Automation, Fluid Physics. Chemistry: Squish Plate. Look: Light Show Look, Show,
Lamp & Light, Film Stock, Lens, Macro Closeup. Stage: unchanged (Wall, Mapping, Logo & Titles,
Plates & LED, Simulation, Phone · iPad), so Build and Gig still keep it in the Stage sheet. The
rail, the panel browser and the desk's own panels read the list; each section's `data-group`
comes from it (`groupOf`); the phone's strip draws the seven headings. No section's id, controls
or place on the desk changed, so saved layouts, pins and deep links open as before. The Settings
guide names the seven. `desklayout` holds the list, every panel's group, the markup's
`data-group` and the Stage panels to their names; `phone` reads the seven headings drawn at phone
width.

Squish Plate keeps its name and its 45 controls in Chemistry: splitting it is 35c (done in 35c-1, below).

#### 35c-1. Squish Plate in five (shipped 2026-10-25)

The owner's complaint was that the plate's panel held forty-five controls under one name, and the
desk made it worse: thirty of its pins were filed under Fluid Physics while the sheet drew them under
Squish Plate, so Fluid Physics' knobs on the deck were the glass's, the oil's and the magnet's.

What changed. Chemistry: Squish Plate keeps the glass (Plate Pressure, Plate Shape, Depth Drag, Thin
Gap, Thickness, Press Lift, Glass Smear, Rain Drip, Viscosity); Oil & Soap is Oil Tension, Oil
Bodies, Soap Bursts, Clear Film and Polarity; Ferrofluid is the phase, the six magnet controls,
Labyrinth and Maze Detail; Reactions is pH Indicator, BZ Reaction, Liesegang Rings, and Lamp &
Light's Chemistry, its two pattern controls and the Turing print's three. Motion: Tilt & Rock is
Gravity, Tilt Direction, Slosh and Plate Rock (from Light Show Look). Swirl, Dye Weight and Heat
Spread went to Fluid Physics; Layer Depth and Spectral Mix to Lamp & Light, beside Light Through Dye.
The ids `squish`, `physics` and `lamp` stay and no control's key changed, so saved layouts, pins,
MIDI maps and deep links open as before; the four new ids are in `SETTINGS_SECTIONS`. `panel` now
asks of seven sections that the sliders the markup draws are exactly the ones the registry files
under it, and that the lamp keeps the optics and Reactions the Turing pattern. A saved layout's
Fluid Physics panel now shows only the flow (about a third of the knobs it did).

#### 35c-2. One home per setting, second half (shipped 2026-10-25)

The owner's audit named controls that appear twice, and strengths that come twice for one input.
Checked one by one: the ones that really were two places are now one.

- Flash Limit was a switch in Master and another at the foot of Wall → Output. The switch is in
  Master, where a hand riding a set is; Wall → Output draws a line that says on or off and where the
  switch is, because the wall is where someone checks the safety. The test id `output-flash-guard`
  is gone (no check read it); `flash-limit-master` stays.
- Room, Film and Sound each had a Drive (the sensor stirring the liquid) in its section and an
  Impact (the master over the patches that read it) in Patches. Each Impact sits under its Drive now;
  Shapes Impact has no input section and stays at the bay, which links to the other three. The keys
  are unchanged; only the section a pin is filed under moved (`deskPins` SECTION_OF). This undid the
  earlier gathering of the masters under the bay, on purpose: the owner's later finding was two
  strengths for one input.
- The platform's spin (Rotation Speed, the Flick buttons, Auto Spin, Spin Rate, Beats a Turn,
  Reverse Spin, Spin Direction, Wander, Spin From Music, Flick Strength, Plate Drag) left Plates & LED,
  a Stage section Build and Gig cannot dock, for **Plate Spin** in Motion. No key changed.
- Build's deck takes Squish Plate after Fluid Physics, since the glass's knobs the deck once held
  under Fluid Physics are in Squish Plate now. A layout already saved is untouched.
- Songs' "Stage sequences (the old sequencer)…" 10 px link at 40% opacity is a button of the same
  weight as its neighbours.
- The track panel had its own Start a take and replay/delete list beside the Record panel's. It is
  one button into the Record panel; the take itself, its clock and `T` are unchanged.

Checks. `panel` files each master with its source and each Drive with its master, and asks the
sliders-drawn-equal-sliders-filed rule of Plate Spin, the room, the film and the sound as well.
`qa` reads Film Impact from the film's section.

Blackout was checked and is already one per surface (the desk header on a desk, Settings'
Master only where there is no desk; the remote's two share a test id because there is one per
layout). The unused `desk/PerformanceButton.tsx` was already gone (`record` asserts it).

#### 35c-3. One home for MIDI on and the audio source (shipped 2026-10-25)

Two switches that were each drawn twice, in surfaces whose checks read the control.

- **MIDI on.** Settings' Controller section and the MIDI sheet both drew the switch, the port,
  the factory maps and Auto-map. The section is the home, since it is where a controller is
  plugged in and set up (and where the dot's neighbour, the "Set up the APC40" button, already
  was). It gained the **LEDs** out-port (`settings-midi-output`), which only the sheet drew. The
  sheet is for teaching: Learn, banks, bindings, the picture, the file. It draws a state line
  (`midi-state`, `data-on`) and a **Set up…** button (`midi-setup-open`) that opens the section.
  The activity dot and the last message stay in the sheet, where a hand is touching things.
- **Audio source.** Settings' Sound (five options) and the Sound sheet (six, with the plate as an
  instrument) both chose it. The sheet is the superset and the home; Settings' Sound row is a state
  line (`audio-source-state`, `data-source`) and **Change in Sound…** (`audio-source-open`), which
  closes Settings and opens the sheet. The device picker stays in Settings, where the Mic dot lands.
- The phone had one of each already: its Sound sheet chooses the source, and iOS has no Web MIDI.
  Nothing there changed.

Checks. `panel` reads the section for the switch, both ports and the factory maps, and the sheet for
the absence of its old copies; `qa`'s Mic-dot block reads the state line and follows the link to the
sheet's Mic tile; `opensource` and `kickbubbles` choose the band in the sheet and read the state
line. Harnesses that set `chromaglass-audio-source` in storage are unchanged.

### 35c-4. One control, one place on a tab; Send to wall is the Wall (shipped 2026-10-29)

Two things the owner saw twice on the Perform tab, each reported with a screenshot.

- **Send to wall.** "Why is there a send to wall button when there's the 'Wall' in the menu above
  it. Let's get rid of the big button." In Live the two did the same thing, open the projector
  window (or bring it forward). Only in Preview with a wall up did the button do something of its
  own: send the copy the desk was building to the wall, across the fade (8b). The plate bar's
  button is gone; the header's Wall is handed the send itself (`onSendToWall`), so in Preview with
  a wall up it sends the copy, and otherwise it opens the window as before. Its tooltip says which
  (`wallSends`), the plate bar's status reads "preview · ⌘⏎ sends to wall" while there is a copy to
  send, and ⌘⏎ is unchanged. No MIDI binding pointed at the button. The phone has no Preview and no
  Send to wall, so nothing there changed.
- **Repeated dials.** "Why are there repeated controls in the rides and the recipe groups?" The
  Perform tab ships with the Rides (Gig's strip) and the Recipe (Build's) both out, and with Fluid
  Physics and Macro in its deck: Speed, Turbulence, Soap Bursts, Beat Press and Evolve Speed were
  drawn twice, Zoom three times, Swirl twice. Now a control is drawn once on a tab
  (`drawnElsewhere` in `lib/deskLayout.ts`): the Rides keep all of theirs, the Recipe the rest of its
  own, and a section's knobs panel draws what neither strip has. A panel that gives one up says
  where it went in a faint line under its dials. Nothing is taken off a strip, so a saved Rides or
  Recipe is untouched, and closing the Rides gives the Recipe its whole strip back. `DEFAULT_RIDES`
  moved from `DeskPanels.tsx` to `lib/deskPins.ts`, beside `DEFAULT_RECIPE`.

Checks. `desklayout` counts every control each panel draws on every shipped tab (Perform drew 7
more than once; now none) and holds the order; `panel` reads the Wall being handed the send and no
`send-to-wall` in the desk; `layout` looks for the Wall, once and visible, on every tab, where it
looked for the button, and counts the dials the desk drew (Perform: 46, none twice; with the Recipe's
filter taken out it names the six); `bubbles` slows the plate through the Rides' Speed when the Rides have it.

#### 35d. Colour and keys (shipped 2026-10-25)

The owner, drawn to teenage engineering's hardware, chose all three of twelve playful twists in order; this
is the first batch, the three that need no new behaviour. Colour says where a control lives, never whether
it is on: violet is on and red is live exactly as 35a set them (`npm run states` holds), so the seven group
colours are muted mid-tones kept off both, each holding its knob's pointer at 3.9:1 or better. A setting's
group is the group of the section that draws it, so Speed is the same colour in the Rides panel as in
Settings. The colour reaches the cap through one custom property, `--cap`, set by `data-group` and read by
whatever is inside, which is how the panel header's tick and the phone's thumb take it without a prop. The
tools' pictograms are single lines on a 24 grid, one for what each tool does to the liquid; the desk's are
keycaps with the letter in the corner, the held one pressed 2 px and lit, the phone's the same pictures in
the dock. Snail and hare sit at the ends of the five pace controls and come up from faint when the control
is at that end; they do not move. Judging §77.

#### 35e. Liquid in the controls (shipped 2026-10-25)

Batch B of the owner's playful-controls choice: three controls that behave like the material they set, each
drawn inside its own few pixels and holding still under reduced motion. The bottle in hand leans forward on
the desk's Bottles panel and the phone's Dye sheet and dock, and stands filled to what is left of the Dye
Budget: the plate's mean dye density against the target the regulator holds it to, eased toward the
closeup's own, read a few times a second by the one bottle that is picked (a polled getter, not App state,
so nothing above it re-renders). The surface stays level as the bottle leans, as a real one's does, the
liquid being drawn in the room's frame and clipped by the bottle's. The Viscosity buttons each let a drop go
when hovered, focused or chosen; a drop released in a viscous carrier falls at Stokes's terminal speed,
which is the inverse of the viscosity, so the fall takes twenty times as long for thick as for thin (the
solver's own 20 mm²/s and 1), slowed at one factor for both. Lamp Warmth's bulb names the colour temperature
the grade matches: the blackbody, from Planck's law and a fit of the CIE matching functions, whose red over
blue is the grade's at that position, and glows that blackbody's own colour. The reading is of what the
shader does, and says what the slider never did: it tops out at 5100 K. `npm run panel` holds the kelvin to
the shader's tint, the drop's pace to the solver's viscosities, the bottle's level to its formula and the
wiring, and the reduced-motion rule. Judging §78.

**35e-2, the lamp widened to the halogen (2026-10-25).** The grade read in kelvin topped out at 5100 K, a warm
morning and not the 3200 K of an overhead projector's quartz-halogen lamp. Lamp Warmth is now the lamp's
temperature, stepped evenly in mireds (a million over the kelvin, the unit colour is graded in) from 6500 K to
3200 K, and the plate multiplies the picture by the blackbody's colour there: its red, green and blue against the
neutral's from Planck's law and the Wyman fit of the CIE functions, held to red plus the small red lift the old
grade had, worked out once on the CPU and passed in as `lampTintR/G/B` rather than the fixed `vec3f(1.06, 0.9,
0.7)` mixed in by the slider. The travel is 0 to 3.75, so that the number saved looks hold keeps its meaning:
0 to 1 is still 6500 K to 5100 K, and the new tint is the old grade to 1.45% a channel there, which is why no preset
or saved look moved (the shipped ones that use it: Velvet Underground 0.25, Home Movie 0.45). Measured on the lab's
seeded plate, mean 0 to 255 per channel, old then new: 0.25 (64.4, 44.1, 55.9) then (64.5, 44.3, 55.3); 0.45
(65.5, 43.1, 51.2) then (65.5, 43.3, 50.3); 1 (67.6, 39.6, 37.5) then (67.5, 39.9, 37.4); the halogen end 3.75 is
(68.8, 25.4, 6.0), against 6500 K's (63.5, 45.8, 61.4), a blue dye going nearly black as it does under a real
tungsten lamp. The vignette is unchanged, blended as it was (a first version multiplied by a second blend and was 4 to 6% dark in the corners, which the review caught), and full from 1 on. `npm run panel` holds the shader to the uniforms, the
kelvin to even mireds ending at 3200 K, the tint to the blackbody's ratios, and 0 to 1 to the old grade.

#### 35e-4. Home Movie at 3560 K, the warm end as bright as the white (shipped 2026-10-27)

The owner left both open choices to the session. Home Movie went from Lamp Warmth 0.45 to 3 (3560 K): a Super 8
projector's lamp is a 3200 to 3400 K halogen, and the end of the slider (3.75) is not used because the tint is the
full blackbody ratio, which a camera records and a room-adapted eye sees less of. Brightness: colour temperature does
not set a lamp's output. A lamp run cool on a dimmer does lose light (flux goes as the lamp voltage to the 3.4, its
temperature as the voltage to the 0.42, so about the eighth power of temperature near 3000 K), but that is Exposure,
not the colour. `lampTint` now scales the tint above 1 to keep the luminance it has at 1 (0.924), where it had fallen
to 0.811 at 2, 0.718 at 3 and 0.660 at 3.75. Red rises to 1.36 at 3 and 1.48 at 3.75, so a full-red pigment clips:
named, and the six-band lamp spectrum (35e-3) is its proper fix. 0 to 1 is untouched. `npm run panel` holds the
luminance to 1e-9 from 1 to 3.75.

#### 35f. Show hardware (shipped 2026-10-25)

Batch C of the owner's playful-controls choice, items 7 to 11 (the slide carousel, 12, is its own piece): five
controls drawn as the machines they stand in for, each moving only inside its own few pixels and holding
still under reduced motion. Record is two tape reels. Tape runs past the heads at one speed, so a reel's
turn rate is that speed over the radius of tape on it: the supply reel starts full and slow and speeds up as it
empties onto the take-up, which starts a bare hub and slows as it fills (a compact cassette's 4.76 cm/s, hub
0.9 cm, pack 2.1 cm, a constant-thickness roll so the pack's area, not its radius, is the tape wound on). The
angle a reel has turned through is the integral of v / r, which has a closed form for a radius that is a
square root of time, so the button is stateless: the angle is a function of the clock and a one-second linear
transition carries it round. `npm run panel` integrates the turn rate numerically and holds the closed form
to a tenth of a percent, across the end of the tape too. The phone's Play pill takes the reels in a fixed box
(the pill still does not widen when a clip starts, and is red while it runs, which the audit said it was not),
the More sheet's tile takes them at 20 px. Tap Tempo is a pad with a light that blinks on the beat the source
has locked, four pips that fill with the taps, and the tempo in segment digits. The light is a Web Animations
loop at the source's period and phase, resynced every quarter second if it slipped 30 ms, so a beat renders
nothing. The VU needle is a moving coil: a second-order system with a damping ratio of 0.81 (1.3% overshoot,
inside the standard's 1 to 1.5) and a natural frequency set so its step response first reaches 99% at
300 ms, solved exactly over each step because an Euler step added damping of its own that took the overshoot
to 0.8% and the rise to 208 ms. It reads the plate's volume on its own frame through a ref (nothing
re-renders with it), falls to its stop when the sound stops, writes "deaf" on the dial when the input
is, and under reduced motion shows the number. Blackout is a lens with a cap: the same drawing on the desk
header, Settings, the remote and Draw, the cap snapping on once in 140 ms and in the button's own colours
(red where the button is live, neutral otherwise: Draw's was red while the room was lit); the remote's two
Blackouts are one, the bar under the thumb. Auto Spin has a platter's strobe ring: in Rate the dots drift at
the dish's speed, in Tempo with a tempo heard the dish turns exactly one dot a beat, so lit by the beat the
ring stands still, up to 32 beats a turn and as a slow alias past that. Judging §81.

#### 35g. Looks as slides in a tray (shipped 2026-10-25)

Item 12 and the last of the owner's playful-controls choice. A look is a 35 mm slide and the stage takes it
from a round tray. The slide is drawn at a real mount's proportions (`slideTray.ts`): 50 mm square, one corner
clipped so it can be told right way up in the dark, and a 34 by 22.5 mm aperture, the 3:2 a 24 by 36 mm
frame shows through, with the look's own two palette colours (`swatchOf`, from its contract) on the film. The
mount is one cardboard colour on every look and takes no state colour: lit stays the row's violet ring and
live its red, so the picture says only "a slide". It replaces the flat swatch on the set list rows (`CueRow`),
the cue bar (the look on stage, and the cued one behind the arrow), every row of the preset menu (new: it had
none), the performer's saved list, the phone's look button and Looks sheet, and the Play screen's Looks strip.
The strip is now a tray you flick: a mount a tile, snapping one slide at a time (`snap-mandatory`,
`snap-always`), the lit ring on a wrapper because the clipped corner would cut a ring drawn on the mount.
The round tray (`SlideTray`) is the drum from above with a fixed gate at the top. It clicks one slot when the
look on stage changes, the way the changer pushes one slide back and lifts the next whatever the distance in
the list: forward when the new look stands later in the list, back when earlier, nothing for the first look of
a session or no change (`stepOf`). It holds only its count of pushes, turns in 160 ms with a small overshoot
and settle, and has no loop and no timer. It is on the cue bar and beside the phone's look name and the Looks
heading. Under reduced motion it does not turn. Held by `npm run panel` ("Looks as slides in a tray"). Judging
§82.

## Third pass (moved 2026-10-29, 19m)

### 35. Clear controls: on reads on, one name for one thing (asked 2026-10-24)

- ~~**35c-1** Squish Plate in five.~~ Shipped: Squish Plate (the glass: pressure, shape, depth drag,
  Thin Gap and Thickness, Press Lift, smear, rain, viscosity), Oil & Soap, Ferrofluid and Reactions
  (Chemistry), Tilt & Rock (Motion); Swirl, Dye Weight and Heat Spread went to Fluid Physics, Layer
  Depth and Spectral Mix to Lamp & Light, and the Turing pattern and its print from Lamp & Light to
  Reactions. The registry files each pin under the section that draws it (the desk's Fluid Physics
  panel had been the glass's, the oil's and the magnet's forty knobs), held by `panel`. Story in
  `docs/plan-shipped/35-clear-controls.md` §35.

- ~~**35d** Colour and keys (batch A of the owner's playful-controls choice, 2026-10-25).~~ Shipped: a knob's
  cap, the tick in a panel's header, the dot on a rail heading and the phone's touch thumb wear their group's
  colour (the seven in `index.css`; a setting's group is its section's, `groupOfSetting`); the tools are
  keycaps on the desk and pictograms on the phone's dock (`ToolGlyph`); a snail and a hare mark the ends of
  Master Speed, Evolve Speed, Gel Speed, Chase Speed and Kaleido Spin wherever they are drawn as a knob or a
  slider (`PACE_KEYS`, `PaceTrack`). Judging §77. Story in `docs/plan-shipped/35-clear-controls.md` §35.

- ~~**35e** Liquid in the controls (batch B of the playful-controls choice, 2026-10-25).~~ Shipped: the
  bottle in hand on the desk and the phone leans forward and stands filled to what is left of the Dye
  Budget (`dyeRoom`, `dyeRoomOf`), the others standing full; the Viscosity buttons each let a drop go at
  the pace of the carrier's viscosity (`dripFallSeconds`, 20 to 1); Lamp Warmth has a bulb whose filament
  is the blackbody colour at the temperature its grade matches, written in kelvin (`lampKelvin.ts`,
  6500 K at 0 down to 5100 K at 1). Held by `npm run panel`. Judging §78. Story in `docs/plan-shipped/35-clear-controls.md` §35.

- ~~**35e-2** The lamp's grade tops out at 5100 K.~~ Shipped (2026-10-25): Lamp Warmth reaches a quartz-halogen
  projector's 3200 K. The slider is a temperature, even in mireds, and the plate multiplies by the blackbody's
  own colour at it (`lampTint`, Planck and the CIE fit, worked out once on the CPU and handed in as
  `lampTintR/G/B`), not a tint mixed in by the slider. It runs 0 to 3.75, and 0 to 1 is still 6500 K to 5100 K
  (the new tint is the old grade to 1.5% a channel there), so saved looks, the presets and Lucky keep their
  colour with no migration. The vignette is unchanged (full from 1 on). Held by `npm run panel`. Story in
  `docs/plan-shipped/35-clear-controls.md` §35; judging §80.

- ~~**35e-4** Home Movie's lamp, and the warm end's brightness.~~ Shipped (2026-10-27, the owner left both to the
  session): Home Movie sits at Lamp Warmth 3, 3560 K, and the warm end holds its brightness. A Super 8 projector's
  lamp is a 3200 to 3400 K halogen, the lamp the film was balanced to be shown by; 3 and not the 3.75 end because the
  tint is the full blackbody ratio, which a camera records and a room-adapted eye sees less of (35e-3), so the end
  would over-state the orange. Brightness: colour temperature does not set output (a projector's halogen is as bright
  as it was built to be, and the lens throws no less light for the lamp being amber); a lamp run cool on a dimmer does
  lose light, steeply, about the eighth power of its temperature near 3000 K (flux as V^3.4, temperature as V^0.42),
  but that is Exposure's knob, not the colour's. So `lampTint` keeps the luminance it has at 1 for 1 to 3.75 and 0 to 1
  is untouched. Cost, named: the red channel rises to 1.48 at 3200 K (1.36 at 3560 K), so a pigment already at full
  red clips on a multiply of the finished picture, which the six-band lamp spectrum (35e-3) would handle properly.
  Held by `npm run panel`; judging §84.

- ~~**35f** Show hardware (batch C of the playful-controls choice, 2026-10-25; items 7 to 11).~~ Shipped: Record
  is two tape reels turning at the tape's speed over their radius, the full one slow and the bare one fast
  (`tapeReels.ts`: a compact cassette's 4.76 cm/s, hub 0.9 cm, pack 2.1 cm; angle by closed form, so the
  button holds no clock of its own) on the desk button, the phone's Play pill (a fixed box, so it does not widen,
  and red while it runs) and the More tile; Tap Tempo is a pad with a beat light on the locked beat, four pips
  and the tempo in segment digits (`TapPad`; the light runs on the Web Animations clock from the source's period
  and phase, so the App never re-renders for a beat), on the desk's Tempo row and the phone's Sound sheet; the
  Sound sheet on both has a VU needle with a moving coil's ballistics, 99% of a steady tone in 300 ms and a
  1.3% overshoot, falling to its stop and writing "deaf" on the dial when the input stops (`vuMeter.ts`, moved
  through a ref on its own frame); Blackout is a lens with a red cap on it, one drawing on the desk header,
  Settings, the remote and Draw, and the remote's two Blackouts are one (the bar under the thumb); Auto Spin has
  a strobe ring that drifts at the dish's speed in Rate and stands still in Tempo once a tempo is heard
  (`strobeRing.ts`). Held by `npm run panel`. Judging §81. Story in `docs/plan-shipped/35-clear-controls.md` §35.

- ~~**35g** Looks as slides in a tray (item 12 of the playful-controls choice, 2026-10-25).~~ Shipped: a look is a
  35 mm slide at a real mount's proportions with its own palette on the film, on the set list, the cue bar, the
  preset menu, the saved list and the phone's look button, Looks sheet and Looks strip (now flicked one slide at
  a time); a round tray clicks one slot when the look on stage changes (`slideTray.ts`, `SlideMount`,
  `SlideTray`). Held by `npm run panel`. Judging §82. Story in `docs/plan-shipped/35-clear-controls.md` §35.

## Fourth pass (moved 2026-10-29, 19m-2)

### 35. Clear controls: on reads on, one name for one thing (asked 2026-10-24)

#### 35c-3. One home for MIDI on and the audio source

- **35c-3** One home for **MIDI on** and the **audio source**. Shipped: the Controller section of
  Settings is the one place MIDI is turned on, its ports (in, and now the LEDs out) chosen, a
  factory map loaded and a controller auto-mapped; the MIDI sheet is the teaching surface and says
  the state (`midi-state`) with a **Set up…** button into the section. The Sound sheet is the one
  place the source is chosen (six tiles, with the plate as an instrument); Settings' Sound row is a
  state line (`audio-source-state`) and **Change in Sound…**, the device picker staying beside it.
  The phone already had one home for each (its Sound sheet; Web MIDI is not on iOS). Story in
  `docs/plan-shipped/35-clear-controls.md` §35. Left from it:
