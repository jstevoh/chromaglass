# 35. Clear controls: on reads on, one name for one thing (asked 2026-10-24)

*Asked 2026-10-24, the Video panel open with a loop playing: "I really can't tell what
buttons are turned on/off ... I can't tell what state things are in." Then: "there are
multiple buttons called video!" The owner likes the modular panels (dock, float, fold)
and wants them kept as they are: what changes is how state is drawn, what things are
called, and later where they go. The audit behind this (heuristics from Nielsen Norman's
visibility of system status and consistency, WCAG 1.4.11's 3:1 for a state's cue, every
desk panel, phone sheet, the remote and Draw) is in the project's shared files.*

- ~~**35a** One look for on, every name unique (phase 1).~~ Shipped: the lit token, `Button
  pressed`, the Film section's Source and demo loops, the renames, `npm run states` and the
  3:1 bar in `npm run switches`. Story in `docs/plan-shipped/35-clear-controls.md` §35.
- **35a-2** What phase 1 left, each because it moves a check's input or a layout:
  - Sliders standing in for switches: the phone's Press · thin gap and Two Projectors
    (`phone.mjs` drives the first as a range by keyboard), the remote's three (788, 822,
    848 as of 4397c83), Settings' Auto Spin and Spin Direction (stepped sliders with three
    named stops, which want a Segmented that keeps MIDI learn and the pins).
  - Touch targets under 44 px: the Play handle, the remote's layer dots, tool chips, dye
    swatches and cue strip, LaptopLink's button, Settings' rail on a phone, `Toggle`'s
    36 px row and `PanelFrame`'s 24 px icons.
  - The remote's two Blackouts share the test id `remote-blackout` (one per layout).
  - The phone dock's Motion dot stands for two states (Evolve or Tilt) at once.
  - Groups dimmed to 50% while their parent is off (the phone's Show, Evolve and Spin
    rows): legible, but a third way of saying off; make them `disabled` with the reason.
  - ~~"All settings…" twice on the desk (DeskPanels' rides and recipe) beside "+ Panel".~~ The
    status bar's alone since 35c-5.
  - ~~"Sound" in the layout switch next to the Sound dot that opens the same panel.~~ Gone with the
    layout switch: the tabs are Perform, Sequence and Setup (found in 35c-5's sweep).
  - The hand-built pick-one grids in Settings (On a New Song, Render Style, Film Stock,
    folds, Second Screen, Viscosity) are lit and stated now; the shared `Segmented` would
    draw them once, once it takes a title per option and a number id.
- ~~**35b** Regroup the panels into seven.~~ Shipped: Play, Pour, Feed, Motion, Chemistry, Look,
  Stage, one vocabulary for the rail, the panel browser, the sections' `data-group`, the desk's own
  panels and the phone's Settings strip (now with its headings drawn). Story in
  `docs/plan-shipped/35-clear-controls.md` §35.
- **35b-2** What regrouping showed, none of it moved in 35b because each is a change inside a
  section (35c's work) or a different surface:
  - ~~Plates & LED holds the platform's spin, which is Motion's.~~ Moved to Plate Spin in 35c-2.
  - The pin picker (`PickList`) and the command palette still list by section, not by the seven
    groups; the same headings would find a setting faster there.
- ~~**35c-1** Squish Plate in five.~~ Story in `docs/plan-shipped/35-clear-controls.md` §35c-1 (moved
  2026-10-29, 19m).
- ~~**35c-2** One home per setting, second half.~~ **Shipped**: Flash Limit's one switch, each Impact master under its source's Drive, Plate Spin, Squish Plate in Build's deck, the sequencer button, Takes as a pointer. Story in `docs/plan-shipped/35-clear-controls.md` §35c-2 (moved 2026-10-29, 19m-2).
- **35c-3** One home for **MIDI on** and the **audio source**. *Shipped*: Settings' Controller section is MIDI's one home, the Sound sheet the source's. Story in `docs/plan-shipped/35-clear-controls.md` §35c-3 (moved 2026-10-29, 19m-2). Left from it:
  - ~~The Sound sheet's microphone picker (`sound-input-picker`) and Settings' Input
    (`audio-input`) are still two pickers for the one device; the dot lands on Settings'.~~
    Settings' Input alone since 35c-5.
  - 35b-2's pin picker and command palette still list by section, not by the seven groups.
  - Each Drive/Impact pair (now side by side under its source) is still two knobs: whether
    each becomes one Strength per input is undecided, and 14ad-2 waits on it (from 35c-2's
    first statement, moved 2026-10-29, 19m-2).
- ~~**35c-4** One control, one place on a tab; Send to wall is the Wall.~~ **Shipped** 2026-10-29:
  the plate bar's Send to wall button gone (the header's Wall sends Preview's copy), and the Rides,
  Recipe and section panels never draw one control twice on a tab. Story in `docs/plan-shipped/35-clear-controls.md`
  §35c-4. Left from it:
  - The Recipe's and Rides' Choose list does not say a control is drawn on another panel of the
    tab, so picking Speed onto the Recipe beside the Rides answers with the line under the dials,
    not in the list where the pick was made.
- ~~**35c-5** One home each, the second sweep.~~ **Shipped** 2026-10-30: All settings… in the status
  bar alone, Beat Prediction in Sound alone (the rides' Follow beat switch gone), the no-controller
  route the header's MIDI light alone, the plates' music route in Plate Spin alone, the microphone in
  Settings' Input alone (the Sound sheet says which and leads there). Then the three the sweep left, on the owner's "fix all this stuff": Change
  in Sound… steps aside while Music & Drone is on the tab, the set's button says "Save set", and
  `npm run shelf` reaches the shelf through Setup and runs in the browser shard. Story in
  `docs/plan-shipped/35-clear-controls.md` §35c-5.
- ~~**35d** Colour and keys (batch A of the owner's playful-controls choice, 2026-10-25).~~
  Story in `docs/plan-shipped/35-clear-controls.md` §35d (moved 2026-10-29, 19m).
- ~~**35e** Liquid in the controls (batch B of the playful-controls choice, 2026-10-25).~~
  Story in `docs/plan-shipped/35-clear-controls.md` §35e (moved 2026-10-29, 19m).
- ~~**35e-2** The lamp's grade tops out at 5100 K.~~ Story in `docs/plan-shipped/35-clear-controls.md` §35e-2
  (moved 2026-10-29, 19m).
- ~~**35e-4** Home Movie's lamp, and the warm end's brightness.~~ Story in
  `docs/plan-shipped/35-clear-controls.md` §35e-4 (moved 2026-10-29, 19m).
- **35e-3** What the readings left, none changed because each moves a look or waits on another step:
  - **The lamp's colour is a multiply on the finished picture,** which is the lamp's spectrum times a white
    surface exactly, and the lamp's spectrum times a dye only to the eye's three responses. The real thing is the
    Planck spectrum entering `spectralThrough`'s six bands before the eye sums them, so a deep blue dye under
    3200 K goes darker and more violet than a multiplied blue does (it already goes to a near black in the
    lab picture). Named shortcut; replace it. (The warm end's brightness is settled: see 35e-4.) Two more shortcuts: the neutral is the 6500 K blackbody, not D65 (sRGB's white,
    which sits a little off the blackbody curve), so the figure is approximate; and the full blackbody ratio is
    what a camera or film balanced for daylight records, where an eye in the room would partly adapt to the warm
    light and see less orange.
  - **Velvet Underground (0.25) keeps its colour** to under 2% in blue, because its number kept its meaning. Lucky
    still draws 0 to 0.8, so it never reaches the halogen. (Home Movie moved: 35e-4.)
  - **Evolve wanders Lamp Warmth by a fifth of its travel,** which is now a fifth of 3.75: from a look at 0.25 up
    to 1, from a look at 3 over the whole warm end. Pull it in (a per-dial span) if that reads as too much.
  - **The viscosity drip is slow motion at one factor.** The ratio between thin and thick is the
    physics (Stokes's terminal speed, the solver's 1 and 20 mm²/s); the thread behind a thick drop is
    drawn stretching at the drop's speed, not solved, and a real thread at this viscosity pinches off in
    microseconds. Named shortcut.
  - **One tank, one bottle.** The Dye Budget is a number for the whole plate and each layer, so the
    bottle in hand shows it and the rest stand full; a per-liquid supply (a bottle that empties and is
    refilled) waits for the volume model (18c-2).
  - The legacy bench's bottle list in `App.tsx` (the `liquid-…` test ids) still draws round swatches.
  - The remote has no bottles or bulb (the owner's remote has Dye Budget and Lamp Warmth as sliders).
- ~~**35f** Show hardware (batch C of the playful-controls choice, 2026-10-25; items 7 to
  11).~~ Story in `docs/plan-shipped/35-clear-controls.md` §35f (moved 2026-10-29, 19m).
- ~~**35g** Looks as slides in a tray (item 12 of the playful-controls choice,
  2026-10-25).~~ Story in `docs/plan-shipped/35-clear-controls.md` §35g (moved 2026-10-29, 19m).
- **35g-2** What the tray left:
  - **The drum has 10 slots, a real tray has 80.** At 28 px 80 slots is a grey ring, so one click turns the
    drawing 36 degrees, not 4.5. Named shortcut of the picture; nothing about any look.
  - **The tray does not know about the phone's cue.** It clicks when the stage's look changes (the tray is
    the stage, not the cue); a cued look on the desk shows only its mount behind the arrow.
  - **The remote and the Sequencer's stage list still show flat swatches** (`RemoteControl`, `SequencerPanel`,
    the command palette and Add to Set sheet); the film could go there too.
  - **The film is two colours.** The mount shows the first two palette colours of a look's contract, as the
    cue rows always did, not a render of the look; a photograph of each look (the gallery's) would be a
    truer slide.
- **35f-2** What batch C left:
  - **The VU reads the plate's volume, not decibels.** The dial is marked 0 to 100 in the plate's own volume
    unit (the loud end of the ear's range at 85, `soundLevels.ts`), because that is what the ear gives and the
    gain stages before it are not the app's to know. A dial in dBFS would need the analyser's raw peak.
  - **A take is not a tape with an end.** The reels fill in ten minutes (`TAPE_SECONDS`) and a longer take
    leaves the right reel full and still turning at v / r. Named shortcut of the picture, not of any recording.
  - **The ring stands still only up to 32 beats a turn.** Past that it has too few dots for the dish's turn
    between two beats and creeps at the alias (48 beats at 120 bpm: 7.5 degrees a second back).
  - **The mic-heard tempo lights the ring but not the tap pad's beat light.** The pad polls the tempo source
    (tap, MIDI clock, typed), which a heard beat does not set; the ring takes the beat grid's tempo when
    nothing was tapped. Lighting the pad from the grid is a follow-up if the owner wants it.
  - The remote's Record, Auto Spin and tempo are still plain buttons and sliders (35d-2's remote list grows
    by these), and the Settings Source row has no meter (the needle is in the Sound sheet).
- **35d-2** What batch A left: the remote's own sliders (Speed and Evolve Speed in `RemoteControl.tsx`) have
  no snail and hare, and the remote has no group colours; the phone's Settings sheet takes the cap colours
  only on its rail headings, since its sliders are the white-thumbed `set-range`; Kaleido Spin on a knob has
  its hare at both ends but no snail at the stop in the middle (the slider has one under the track). Batches B
  (liquid in the controls) and C (show hardware) have shipped (35e, 35f), and item 12 (35g), the last.
