# Archive: 8. The desk: the laptop is a control surface, not the show

The closed items of [`docs/plan/08-desk.md`](../08-desk.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
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

- ~~**8-play** (M) Play, the design's screens 3a and 3b: a phone's own screen for
  someone listening, not performing (the plate edge to edge, eight dyes, Drop · Blow ·
  Press, six sliders, the looks, Follow the music, Share clip). A phone opens on it;
  `/play` is it on an iPad or a laptop~~ (shipped; story in `docs/plan-shipped.md` §8;
  check `npm run phone`'s Play part).
- ~~**8-draw-a-4** A slow show starved the pad: 3 pictures out at once gave 6.3/s at
  14 frames~~ (shipped 2026-10-29; `docs/plan-shipped.md` §8-draw-a).
- ~~**8b-6** `draftwall`'s fade line read one moment, 0.4 s after Send~~ (fixed
  2026-10-11: it watches the whole fade; story in `docs/plan-shipped.md`, 8b).
- ~~**8c** Knobs turn round their ring as well as up and down; a double-click goes back to
  the look's own value (a double tap on Play's sliders)~~ (shipped; story in
  `docs/plan-shipped.md` §8; checks `npm run desk`, `npm run layout`, `npm run phone`).
- ~~**8d-1** A CC on a board with no profile is a knob~~ (the owner, 2026-11-14:
  Iridescence, learned to CC 16, sat as a full-width slider above the Recipe's knob
  row). **Shipped**: `controlKindOf` draws an unknown board's absolute CCs as knobs; a
  slider only where a profile knows the fader. Rides still draws every control as a
  fader. Check `npm run desk`.
- ~~**8f** A QR code on the Phone · iPad panel, drawn without a library~~ (shipped; checks
  `npm run qr`, `npm run layout`).
- ~~**8f-1** The code whenever nothing is linked, and Link another while phones are~~ (shipped; check `npm run phonelink`).
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
- ~~**8d** A control's kind from the controller's profile: the APC40's, the Launch Control
  XL's and the nanoKONTROL2's knobs draw as knobs~~ (shipped; check `npm run desk`).
- ~~**8d-2** (S) Profiles for more boards, or a per-control "knob / slider" choice in
  MIDI learn, so a real fader on an unprofiled board can draw as one again.~~ (dropped
  by 8d-3: no panel draws a control by what it is learned to any more.)
- ~~**8d-3** One panel, one kind of control~~ (shipped; check `npm run panelkinds`). The
  owner, 2026-11-22, with a screenshot: the Recipe drew Bubbles and Saturation as
  sliders beside its own and Fluid Physics' knobs, "once again" after Iridescence on
  2026-11-14 (8d-1). The cause was 8d itself: the APC mini mk2's factory map rides those
  two on faders, and the Recipe drew a fader's control as a slider. Now the kind is the
  panel's: Rides, the Mixer and the Wall panel sliders (Gain and Gamma, 8e's two knobs
  among the Wall's slider rows, are rows now), the Recipe and every section's knobs
  panel knobs, the phone sliders. `DeskProps.kindFor` is gone. `panelkinds` renders
  every desk panel and the Wall in node, counts knobs and range inputs, and fails a panel
  that draws both kinds, the other kind, or fewer controls than it holds, and any desk
  or app file that names `controlKindOf` or `kindFor`. On main's code it fails 8 of 21
  lines (with the old lookup told half the controls are faders, the Recipe drew 133
  knobs + 133 sliders); here 21 of 21 pass.
