# QA list: what the owner found playing it (from 2026-10-04): what shipped

How the QA list's shipped items were found, built and measured. The open work is in
[`docs/plan/qa.md`](../plan/qa.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Third pass (moved 2026-10-29, 19m)

### QA list: what the owner found playing it

- ~~**QA-29** Choices that did nothing: 20 of the 80 values the menus offer were
  silently dropped (2026-10-09 to 2026-10-11).~~ **Fixed** (#322's type-derived lists,
  held by #367's check): the first `sanitizePatch` kept its own hand-written lists,
  already behind the types, so Lighter and Exclusion on the blend menu, four of the
  five LED modes, Off and Random for a new song and the mixer's Multiply and Key were
  dropped by `updateSettings`, the phone's patches and a saved look. `npm run sanitize`
  now walks every value of every choice setting (80 kept) and runs in CI's logic part.

- ~~**QA-31** The closeup is "even bouncier and twitchier than before": it punches,
  pumps and shivers with the music at Frame Sway 0 (the owner, 2026-10-11).~~ **Fixed**
  (27a-8, `npm run steadycam`): Macro Sync's punch-in on the kick, push with the energy
  and treble tremor were on at its default of 0.5 outside Frame Sway, so at 6x on a 1440
  px frame a 120 bpm song swayed the frame 0.42% of its width (6 px) and pumped the zoom
  3.2% (the frame's edge 23 px) on every beat, and the ear now hears nearly every kick
  where it heard a third; the lead read one cell's solver velocity, so a press of half a
  cell a step threw the frame 0.95% (14 px) in a frame; a cut landed on a lattice cell and
  slid 14% of the frame to the drop; and each drop random-walked 4 px rms a frame. All
  four are 0 now: the song's hand on the frame is 0.000% at Frame Sway 0 in every mode on
  all 70 looks and show stages, the same press moves the frame 0.17% a frame with it and
  without, a cut lands on the drop's middle, and a drop on still paint moves 0.

- ~~**QA-30** A switch that is on looks like one that is off: the Record panel's Include
  Audio Track is a white knob on a white track when on (1.0:1), four Settings switches and
  the remote's are a black knob on a dark track when off (2.0:1), and eight switch styles
  are drawn in all, one of them the design's (the owner, 2026-10-11, with a screenshot).~~
  **Fixed, #381** (the check first, then Antigravity's build, briefed in
  `docs/handoff-switches.md`): `npm run switches` reads every control that says a state in
  both states, on the desk's five layouts, every Settings section, the panels the palette
  opens, the phone with each sheet open, Play with its sheet and the remote, and holds a
  knob against its track to 3:1, on against off to ΔE 20, a switch's on track to the
  accent and the switch to saying its state; a switch that will not flip is red, and each
  surface needs a floor of controls that changed state when clicked. 429 controls and 16
  under the bar before; after, 451 assertions green, 0 under the bar, 498 controls found
  (403 on the desk, 86 on the phone, 9 on the remote) and 374 of the desk's flipped.
  Every switch is now the one `SwitchPill` (`ui/index.tsx`),
  in `Toggle`'s row or in a row of its own; the phone dock's lit sheet button, the Play
  screen's pressed pills and the mixer's Graded take the accent trio; the Wall's chips
  keep their white-when-on style and now say their state; the swatches, the sequencer's
  stages, the Record panel's tabs and options and the MIDI panel's banks and tabs say
  theirs with `aria`. Two undeclared changes in the build were put back in review: the
  desk's tab order, and a Play sheet that opened itself on a `?debug` visit (the check's
  URL; the app must not know it).

- ~~**QA-20** Blow amount isn't sensitive enough.~~ **Fixed, #346**: the moving wind
  laid two bubbles every sixth step whatever the Amount (ten spawns a second at 60
  steps, twenty at 120), and each bubble pumps the colour out from under it; the
  straw's growth had a floor that made every Amount under about a fifth the same
  breath. Now the wind takes air in only past the speed the surface tears at (the
  blowing number ρ_air U²/2√(ρgσ) past 1, 5.4 m/s against a firm breath's 8: Amount
  0.67), as often as before at the default, 6× at Amount 2 and 44× at 5 (the plate's
  cover limit bounds it), a rate a second; the straw grows as the breath's speed
  (`lib/breath.ts` airTaken, strawFlow; `npm run blowrange`). The wind's push already
  went as the Amount squared, and still does (`npm run airblow` line 6: the pool moved 0.003% at Amount 0.05, 0.085% at 0.25, 2.72% at 1, 14.6% at 2.5 and 16.5% at 5 in software, where the colour goes with the hand). What follows is the report as it was:
  Blow amount isn't sensitive enough. At its lowest settings it still blows a ton of ink and creates a lot of bubbles. Needs a gentler bottom end (gentle breeze) and a higher top end (hurricane). This lack of dynamic range may apply to other tools/controls too.

- ~~**QA-4**~~ **Fixed, #293**: with a desk up the chip sits at the top of the plate's box, not the window's; `npm run layout` asks it on both desks at 1440/1280/1024 (main: 3,856 px² over Record).
  Zoomed in, the zoom chip (microscope, − 4.7× +, Hold / Follow / Auto) sits on
  top of **Record performance** and covers it. Desk, Perform tab, any zoom above 1.05×.
  The chip is `fixed top-3 … translate-y-9` in `src/App.tsx` (the `macroZoom > 1.05`
  block, about line 3984) and lands on the desk's top strip, where
  `PerformanceButton` sits (`PerformDesk.tsx:466`; Design has the same button,
  `DesignDesk.tsx:291`, check it there too). Not on the phone (the chip is desk-only).

- ~~**QA-18**~~ **Fixed, this PR** (`npm run saves`, 28 lines, in Measure's browser part; main fails "Save asks
  for a name again with a saved look open"). Save did not let the owner name a new
  preset from the current settings. Desk. It asked for a name once; after that the look
  just saved (or any saved look opened) was the document and Save wrote over it, a toast
  the only sign. Saved presets were in no list on either desk (⌘K found them by name),
  ⌘S on the Perform desk reached the browser's Save Page, and the save sheet's fields
  were 200 px wide in a 480 px sheet. Now Save always asks for a name (button, ⌘S on
  both desks, ⌘K) and makes a new preset; writing over the open one is the sheet's
  "Replace “name”" button and the look menu's "Save over"; the look menu lists your
  presets to open or take out. The phone's Looks sheet has the same Save, landing under
  Yours. The narrow window's preset menu said "Save as file" and promised a download
  that saving stopped doing; it says Save.

- ~~**QA-18a**~~ **Fixed, this PR** (the owner's ask, 2026-10-06; `npm run saves`, 33
  lines). The Perform desk had no list of your saved presets of its own (⌘K and the set
  list's Add found them). It has **Your presets** under the set now: a click cues one
  (Go names it), a double-click sends it, + puts it in the set, and the list folds to
  its heading. Go also names a look cued from outside the set (⌘K): it read "Nothing
  cued", greyed out, while Space would have sent it. Desk.

- ~~**QA-15**~~ **Fixed, #293**: the seed is a laid-out panel, Dye Budget 0.45; `npm run royopen` 6/6 (main 1/6). Story in §21 of `docs/plan-shipped/qa.md`.
  Roy, 1963 always opens on a giant black stain over flat red, filling most of
  the dish (the owner's screenshot, 0:09 in). It should read as an abstract, colourful
  Lichtenstein painting. Wall, desk. The preset is `src/presets.ts` (`'Roy, 1963'`); 21a
  to 21d hold the rest of its open work. Deferred by the owner: fix later.
  Cause, found and measured in the lab: Roy's seed (`seedPreset` 'roy' in
  `LiquidVisualizer.tsx`) passes `splatBlob` radii in cells (`S * fr`), but `splatBlob`
  takes 128-grid units and scales by `GRID_SCALE` itself, so the four pools come out
  4 to 5 times too wide, overlap across the plate, and the three inks stacked print
  black (57 % of the view black, none white, yellow or blue). A fix and a new check
  (`royopen`, 1 of 6 on main, 6 of 6 with the fix) wait in the shared files under
  `handoff/roy-black-stain/`; its PLAN hunk for §21 is to be merged with this entry.

- ~~**QA-17** The phone's **Looks** tab wore a sparkle, the icon apps use for AI, and the
  owner wants nothing in the app to read as AI.~~ Shipped: Looks is a palette; the
  other sparkles (Random on the desk and the remote, Evolve, Automation, the track's
  Evolution, "A band in a box") are a shuffle, an hourglass or a drum, and the MIDI
  auto-map's magic wand is an ear, since it builds the map by listening. Desk, phone,
  remote. No user-facing text said "AI", "magic" or "smart".

- ~~**QA-11**~~ **Fixed, this PR**: Follow wears a crosshair (locked on one subject) and
  Auto names its cut, "Auto cuts 5s" from Shot Length (`shotLabel`, `src/lib/macroCamera.ts`,
  the same `max(0.5, macroHold ?? 5)` the camera rides for), on the desk's chip and the
  phone's camera buttons; the hover titles say "never cuts away" and "then cuts to another".
  On the zoom chip, Follow and Auto look like the same thing. They differ in
  `src/lib/macroCamera.ts`: Follow locks onto the liquid where it is aimed and rides it
  without ever cutting away; Auto picks its own subject, rides it for Shot Length (5 s
  by default) and whip-pans to another. Between Auto's cuts both ride one bead, and
  nothing on the chip says which is which (the difference is only in hover titles).
  Make it obvious on the chip, for example a mark where Follow is locked and Auto's
  cuts named in its label; keep both. Desk (`src/App.tsx`, the zoom chip) and phone
  (`PhoneStage.tsx`, the same three buttons).

## Fourth pass (moved 2026-10-29, 19m-2)

### QA list: what the owner found playing it (from 2026-10-04)

#### QA-19. Interacting with settings switches to and maximizes the performance window

- ~~**QA-19** Interacting with settings switches to and maximizes the performance window.~~
  Main's 5b81f3c removed the auto-fill on the next click (`useCastSession.ts`); the
  open #323 edits the same listener and is superseded (review pass, 2026-10-10).
  What follows is the report as it was. Desk, wall.
  When the additional window that is used for performances is showing and not maximized,
  interacting with settings to change something automatically switches focus to the
  additional window and maximizes it. The performer needs to be able to use the settings
  without the overall extra window changing states (besides the light show settings
  themselves updating). Cause: `useCastSession.ts` captures any `pointerdown`/`keydown`
  outside raw text inputs and delegates `fillWindow()`, forcing the performance receiver window
  fullscreen.

#### QA-28. The whole plate slides under the camera with the sound

- ~~**QA-28** The whole plate slides under the camera with the sound, a jolt on every
  kick: nauseating to watch (the owner, 2026-10-11).~~ **Fixed** (Frame Sway, 27a-7):
  #347's cover glass dragged the whole picture 0.39% of the plate a frame on average
  at the default Plate Rock (0.72% at the peak, a quarter of the plate a second);
  it is seated by default now and slides 0 (`npm run framesway`).

#### QA-5. Layers: + appears only on one-plate looks and there is no −

- **QA-5** Layers: + appears only on one-plate looks and there is no −. Desk, phone.
  **Shipped (#273, §16f)**: + on one layer, − on two, on the desk and the phone's Play
  sheet (a third plate is 16d).

#### QA-16. A green dye on Roy, 1963 prints as another colour

- ~~**QA-16**~~ **Fixed, #293**: a hue past 40° from every ink prints as two inks overprinted, green (cyan over yellow) and violet (magenta, half cyan); `npm run benday` 7 (main: green printed yellow, violet blue). Violet is laid flat, 21f.
  On Roy, 1963 a green dye cannot be added: it prints as another colour.
  Desk (the owner's report from the corner dot, plate `roy`). Likely cause, read in
  the code but not yet run: the Ben-Day print snaps every pixel's hue to the nearest of
  three inks (`benDayInkIndex` in `src/gpu/wgsl/plate.ts`, red, yellow or blue), so a
  green lands on yellow or blue. A real comic printed green as yellow and blue dots
  overlapping on the paper; doing that keeps the three inks and gives back green,
  orange and purple. Next to QA-15; deferred with it.
