# 8. The desk: the laptop is a control surface, not the show

**Shipped**, with the proposals below open. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

~~**8-v2** Desk v2, the owner's design of 2026-10-10: one desk in three layouts (Build,
Gig, Load-in), every panel docked, floated, folded or closed, knobs for encoders, the
panel browser (⌘P) and the Stage sheet (⌘,)~~ (shipped; story in `docs/plan-shipped.md`
§8; checks `npm run desklayout` and `npm run layout`).

~~**8-tabs** The tabs are the owner's (asked 2026-10-27): every chip across the top is a
set of panels, renamed, reordered, added (empty or a copy) and deleted from the pencil
beside them, with Perform, Sequence and Setup shipped as the three to start from. Build
and Gig fold into Perform, Load-in and the Sound screen into Setup; the Sequence and
Sound screens are panels (Songs, Sequences, Music & Drone); an older desk's rearranged
layout is kept as a tab of its own; the phone has the same tabs in More › Tabs~~ (shipped;
`src/lib/deskTabs.ts`; checks `npm run desklayout`, `npm run layout`, `npm run phone`).
Open from it:

- **8-tabs-a** (S) The tabs live in the browser's storage, so a phone and a laptop each
  have their own. Carry them with the account (cloud sync, judging §72) so a venue's
  Setup tab made on the laptop is the phone's too.
- **8-tabs-b** (S) The phone draws a desk-own panel (bottles, set list, rides) as a
  button to its own sheet, not the panel itself. Draw them in place once each has a
  touch-sized body, so a tab on the phone is the whole tab.
- **8-tabs-c** (S) A chip dragged along the strip to reorder, beside the editor's arrows.

Open from Desk v2, each its own thread (the UI lane):

- ~~**8-play** (M) Play, the design's screens 3a and 3b: a phone's own screen for
  someone listening, not performing (the plate edge to edge, eight dyes, Drop · Blow ·
  Press, six sliders, the looks, Follow the music, Share clip). A phone opens on it;
  `/play` is it on an iPad or a laptop~~ (shipped; story in `docs/plan-shipped.md` §8;
  check `npm run phone`'s Play part).
- **8-play-a** (S) The iPhone app's Laptop remote from Play. Play here lands on Play,
  and the way back to the remote is All controls › More › Laptop remote, two taps
  deeper than it was. Draw (8-draw, shipped) is the remote's new face; Play's tray
  could gain a "Draw on the wall" entry in the app only. *Measure:* `npm run applink`
  from Play.
- **8-play-b** (S) Play's looks strip draws each look as its two-colour swatch, as the
  cue lists do; the design's tiles are pictures of the look. The proposal below
  (pictures, not swatches) gives Play the most, since the strip is all it has.
- **8-play-c** (S) Play keeps the app's settings, not its own. The design's README has
  Play keep "its own `VisualizerSettings`", which only matters once the same browser is
  also a desk; today a phone is one or the other. Revisit with 8b's offline Preview.
- **8-play-d** (S) Follow the music brings a look's Sound Drive to 0.5 when the look
  has none, so the chip never reads on and does nothing. A look built to ignore sound
  (a still photograph) then moves with it; whether such looks should say so on the chip
  instead is the owner's call on a phone.
- ~~**8-draw** Draw: the phone or iPad as the wall's pad~~ (shipped; story in
  `docs/plan-shipped.md` §8; check `npm run draw`). Found along the way:
  - ~~**8-draw-a** The wall under the pad~~ (shipped; story in `docs/plan-shipped.md`
    §8-draw-a; check `npm run drawwall`, and `-- --app` on the Mac). Found along the way:
    - **8-draw-a-1** (S) The picture is the canvas after the output pass, so a wall
      corner-pinned or masked in Output shows warped on the pad, while a touch is mapped
      through the camera only. With Output's corners at their defaults (most rooms) the
      two agree. *Measure:* `drawwall --app` with corners moved.
    - **8-draw-a-2** (S) Every remote gets the pictures once one asks: the relay keeps no
      state, so a tablet left on Controls as the Gig remote is sent 100–400 kB/s it does
      not paint. A relay that routes `picture` only to sockets that sent `pad-picture`
      in the last 3 s would stop that. *Measure:* bytes to a Controls remote.
    - **8-draw-a-3** (S) OSC's `/blow`, `/drop`, `/press` still take the plate's point,
      not the wall's, so a TouchOSC pad has the old pad's fault (only its middle lands
      under the finger). A `/wall/...` form, or a flag argument, as the remote's `wall`.
  - **8-draw-b** (S) The phone's Draw has no bottle, Spin or Tilt (the design's four
    tools only); they are in Controls. A bottle tile on the phone, or a long press on
    Drop for the bottle list, would put soap on the plate from Draw.
  - **8-draw-c** (S) Blackout's hold-to-snap. The display has one blackout, a toggle
    that fades over 1.1 s, so Draw's hold is a fade both ways. A snap needs a
    `blackout-snap` action the display honours at once (protocol, App, MIDI).
  - **8-draw-d** (S) The wall's real shape: the frame now takes the laptop's picture's
    shape (8-draw-a), so a 4:3 wall is a 4:3 frame; before the first picture, and with
    an older laptop, it is still 16:9. A dome is another frame. And the design's dashed "+" (an image as dye) has no message yet.
- ~~**8b** A true Preview: with a wall up, the desk builds on a copy the wall does not
  see until Send to wall~~ (shipped; story in `docs/plan-shipped.md` §8; check
  `npm run draftwall`). Found along the way:
  - **8b-1** (S) The copy and the wall draw from the same dice. The plate's random
    streams (`DICE` in LiquidVisualizer, `lib/rng.ts`) are module constants, so the
    copy's pours take draws the wall's would have, and laying a look on the copy re-keys
    the wall's streams. The wall stays random, but not the run it would have been: a
    render or a reproduced report must not be made with Preview's copy up. Per-engine
    streams would fix it (`DICE` into the component, `doseLiquid` handed its stream).
  - **8b-2** (S) The drift waits for Send to wall. The drift (`lib/drift.ts`) wanders
    the desk's settings, which in Preview are the copy's, so the wall's look stands
    still under the music until it is sent. The music's own overrides and the room
    still move it. The drift could wander the wall's look as well.
  - **8b-3** (S) The copy's plate when the wall closes mid-Preview. The desk carries
    on, on the wall's engine, from the copy's look by its id (`adoptPreset`): the
    copy's poured plate goes with it, and dyes changed on the copy and not saved fall
    back to the look's own.
  - **8b-4** (S) What else in Preview goes to the copy. The phone's Play sliders, a
    MIDI fader, and a Go, Back or Next look from the remote or a MIDI pad write the
    desk's settings, so in Preview they move the copy, not the wall (the keyboard's Go
    is held in Preview). A back-plate look (Send back, 16a) goes to the copy, and Live
    puts the wall's back back. Right for a hand at the desk, perhaps not for a phone at
    the wall: a remote's Go could go to the wall, or be held as the keyboard's is. The
    film and the mark are the room's and go to the wall (the mark to the copy too); a
    film is not seen in the copy.
  - **8b-5** (S) The projector window's pixels. `draftwall --frames` (Mac) shows the
    window is painted from the wall's canvas and never the copy's, and which settings
    each engine was handed; a picture of the window against a look changed in Preview
    would be the last word (`docs/judging.md` §49 for the owner's eye meanwhile).
  - ~~**8b-6** `draftwall`'s fade line read one moment, 0.4 s after Send~~ (fixed
    2026-10-11: it watches the whole fade; story in `docs/plan-shipped.md`, 8b).
- ~~**8c** Knobs turn round their ring as well as up and down; a double-click goes back to
  the look's own value (a double tap on Play's sliders)~~ (shipped; story in
  `docs/plan-shipped.md` §8; checks `npm run desk`, `npm run layout`, `npm run phone`).
- ~~**8d** A control's kind from the controller's profile: the APC40's, the Launch Control
  XL's and the nanoKONTROL2's knobs draw as knobs~~ (shipped; check `npm run desk`).
- ~~**8e** Load-in's Wall panel: the test pattern and Identify, and Output's Gain and Gamma
  as knobs~~ (shipped; checks `npm run wallpattern`, `npm run map`, `npm run layout`).
  - **8e-1** (S) The wall test from the phone. The remote has no Load-in at all (no
    corner pin, no masks), so the test pattern and Identify are on the laptop only. A
    `wall-test` action in the remote protocol (App, MIDI too) would let someone at the
    wall walk the corners with the pattern up. After 8-draw-a lands, which is in
    `RemoteControl.tsx` now.
  - **8e-2** (S) The design's Load-in plate bar reads "Live | Test pattern" with
    Identify beside it. Today the bar is the same in every layout (`npm run panel`, "the
    same actions on both"), so the switch is in the Wall panel, which Load-in opens by
    default. Moving it to the bar means deciding with the owner whether the bar may
    differ by layout.
- ~~**8f** A QR code on the Phone · iPad panel, drawn without a library~~ (shipped; checks
  `npm run qr`, `npm run layout`).
  - ~~**8f-1** The code whenever nothing is linked, and Link another while phones are~~ (shipped; check `npm run phonelink`).
- ~~**8g** A panel in a window of its own, for a laptop and a monitor at a gig~~ (shipped;
  check `npm run layout`).
  - **8g-1** (S) The keys in a panel's window. ⌘1–3, ⌘P, Tab and the show's keys (Go,
    Blackout, R) are listened for on the desk's window, so with the focus in a panel's
    own window they do nothing. Forwarding them (or listening on both) wants a look at
    which keys a panel's text fields must keep. Esc too: the Mixer sheet in a panel's
    window closes on Esc pressed on the laptop, not in its own window.
  - **8g-2** (S) A panel's window after a reload. A browser will not open a window
    without a click, so a reload brings every panel back to the desk; a "Reopen the
    windows" button in the header after a reload would put them back in one click.
  - **8g-3** (S) A panel out in its window whose place goes. A layout switched to one
    without the panel, or the panel's guard closing it after an error, leaves it in its
    window with no away card, and Bring it back then puts it nowhere: it should dock it
    in the deck. And the desk itself going (the laptop's window narrowed under 1024, a
    phone-sized window) still closes every panel window; the clean screen does not.
- ~~**8h** The header at 1024: its dots fold into one Status button when they do not
  fit~~ (shipped; check `npm run layout`).
  - **8h-1** (S) Folded, the Status button's one dot is green while anything is
    connected, so a wall that drops while the sound is up still reads green until the
    button is opened. A dot per input inside the button (no words) costs about 40 px,
    which 1024 has (73 px spare folded); the owner's call on a laptop.

- ~~**8i** Fewer panels, each one usable at any window size: Sound Mappings folded into
  Sound and Heat Slide into Fluid Physics (no panel holds one or two knobs), Fade and Go
  in 68px with Back and Freeze left to their keys, and every panel's body scrolls and
  reflows~~ (shipped; story in `docs/plan-shipped.md` §8; checks `npm run desklayout`
  and `npm run layout`'s "every control in every panel can be reached").
  - **8i-1** (S) A panel floated or popped out narrower than 312px. The reach check
    floats every panel at the size a panel floats at; a hand can drag one down to
    220px, where the Mixer's and the patch bay's rows have not been measured. Either a
    minimum width per panel (`deckWidth`) or rows that wrap below it.
  - **8i-2** (S) Three knobs is the floor now (`npm run desklayout`): Kaleidoscope,
    Master and Manual Interaction sit on it. Kaleidoscope was split out of Show on
    purpose (`settingsMap.ts`); the other two are the owner's call if three still reads
    as too thin on a deck.

- ~~**8j** What a knob is called, and what it does~~ (the owner, 2026-10-22: the names on
  the deck's knobs were cut to the knob's width, and a drag swapped the name for the value
  under a chip laid over the row above, so a hand could not tell which knob it had). Story
  in `docs/plan-shipped.md` §8j (moved 2026-10-29, 19m).
  - **8j-1** (S) The remote page (`RemoteControl.tsx`) has its own sliders and no card;
    its names are whole, but the line would help there too.
  - ~~**8j-2** Cards that stuck and stacked~~ (the owner, 2026-10-24). **Shipped**: a drag ends on a lost capture, a release anywhere, a buttonless move or lost focus, and one card is up at a time (`npm run layout`, `npm run phone`). Which gesture on the owner's Mac swallowed the release is not known. Story in `docs/plan-shipped.md` §8j-2 (moved 2026-10-29, 19m-2).
  - ~~**8j-3** Hover cards wait much longer~~ (the owner, 2026-10-27). **Shipped** (#509): one `TIP_DELAY_MS` (1.5 s) for the knob cards and the `title=` tips (`src/lib/titleTips.ts`; `npm run layout`, `npm run phone`); the remote and cast pages do not install it. Story in `docs/plan-shipped.md` §8j-3 (moved 2026-10-29, 19m-2).

*Proposed 2026-09-28:* **pictures, not swatches, in the cue list.** In the dark a look is
picked by its name and one colour swatch (`lookSwatch`, `PhoneStage.tsx`, and the desk's
pick lists). `gallery.yml` already photographs every preset; ship those photographs as
thumbnails, and have Save Look keep a still of the plate in the preset file, sent to a
receiver once rather than in every cast state (the lesson of S0's logo, in
`docs/stability-plan.md`). The phone's Looks sheet, where rows are smallest, gains most.
*Measure:* `npm run desk` and `npm run phone` find a picture on every built-in look's
row; the cast state's size is unchanged.
