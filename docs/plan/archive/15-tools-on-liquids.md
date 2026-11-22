# Archive: 15. Every tool on every liquid

The closed items of [`docs/plan/15-tools-on-liquids.md`](../15-tools-on-liquids.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
## 15a. Only the Dropper lays the bottle's liquid (shipped)

**Shipped** (#201): every laying tool lays the bottle's liquid (`npm run bottles`); the Splat line's "following the hand" was fixed in #214. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

## 15i. Picking a bottle pours nothing (shipped)

**Shipped** (2026-10-04): picking a bottle sets the bottle in the hand and pours nothing (`npm run bottles`). How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

  Maze, Ferro Paint) carry their own amount and lay their own pour when they load.

## 15c. Blow's wind erases colour rather than pushing it (shipped)

**Shipped** (#215): Blow's wind carries the colour and the oil the way the hand went, rather than erasing them (`npm run wind`, `npm run tools`). Its follow-ups are 15f and 15g. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*Shipped so far* (#254): the wind is drawn both ways from the plate's middle and each stroke beats the window before it; the drift after turns round with the wind. Story in `docs/plan-shipped.md` §15c (moved 2026-10-29, 19m-2). Not yet seen: the line failing on a wind with its carry turned off.

## 15g. Blow as air on a thin film, not a carry (replaces 15c's shortcut)

- ~~**15g-5 A remote's wind.**~~ **Shipped** with 15g-11: a remote hand's directed Blow
  (the phone's pad, a pen, a game controller, OSC, the assistant, a replayed take) is the
  same air as the pointer's, held a quarter of a second between its messages and laid by
  the solver's step (`holdBreath`, `breatheHeld`, `REMOTE_BREATH_HOLD` in
  `src/lib/breath.ts`); its push and carries no longer run on a thin gap. Story in
  `docs/plan-shipped.md` §15g-11. Not yet driven through the app by a check (15c's last
  note still stands: a gesture sent through the remote's link in `npm run tools`).
- ~~**15g-7 Blow's stroke to the right moves less than to the left in the app.**~~
  **Shipped** (#623): the pointer handler pressed the glass under the pointer (a bowl 24
  cells across) and stirred along the move on every pointer event with the button down, for
  every tool but the Magnet, the Spin, the Drop and the Finger, and the Blow was never taken
  out of it. The pointer leads the pool it blows across, so each press sent the pool's liquid
  back against the breath, and the gap it closed crept open for seconds after; thirty presses
  a stroke whatever the pace against the breath's steps, which came with the runner's. Story
  in `docs/plan-shipped.md` §15g-7; `npm run tools` now counts the glass the hand presses in a
  Blow stroke and asks for none; the touch path shares the fix, and a bubble's squeeze on its
  footprint is counted as the bubble's, not the hand's.
- ~~**15g-8b A bubble's dye accounting across the readback mirror.**~~ **Shipped**: on a thin
  gap a bubble's colour goes where its liquid goes. The air's source in the thin solve is no
  longer clamped at a fortieth of what a bubble put down whole asks; the amounts' carries move
  colour per unit of liquid, a donor with air in it handing on its liquid mixed with what comes
  in (airLiquid, airGive); `airExclude` is off a thin gap and `depositBubbleRims` stands down
  there. Lab (`npm run bubbledye`): whole, growing, drifting and popped bubbles all keep the
  plate's colour to 0.00% (main −2.6%, −3.2%, −6.4%), no ring (deepest 1.01–1.08), 3.3%, 1.0%
  and 4.8% left under them. Story in `docs/plan-shipped.md` §15g-8b.
- ~~**15g-8d Liquid runs through a bubble in the thin solve.**~~ **Shipped**: standing air has
  no mobility in the thin solve, so the liquid goes round a bubble; its drift reads the flow on a
  ring past its rim. Lab: nothing left under a moving or growing bubble (was 6.6%, 1.0%). Story in
  `docs/plan-shipped.md` §15g-8d.
- ~~**15g-11 The breath is a jet along the surface, with a direction.**~~ **Shipped**
  (the owner, 2026-11-13, on the desktop app: "it doesn't blow across the surface like I
  would expect (unless you're blowing hard), it doesn't seem to have a direction in mind").
  The stress landed in a disc under the hand, so nothing ahead of the hand moved, and its
  direction was each pointer move's own, which swings with every pixel and was dropped the
  moment the hand stopped (a hand that stopped became the straw). Now the stress is a wall
  jet's: whole over its landing and a core of five footprints, then falling as one over
  the distance squared, spreading as it goes, 135 mm of reach on the dish
  (`layBreath`, `jetShare`); and the direction is read from a point trailing the hand on a
  leash and kept while the hand is down (`src/lib/blowAim.ts`). Story and numbers in
  `docs/plan-shipped.md` §15g-11; `npm run blowrange`, `npm run airblow` (check 7).
- ~~**15g-12 The wind lays no bubbles, and a straw's bubble is round.**~~ **Shipped** (the
  owner, the same day: "the bubble spawning is weird at best", and flower-like things round
  the floating bubbles after a Blow). The moving wind spawned two bubbles ten times a
  second, a held straw's bubble shed satellites and broke into fingers at a gap 21 times
  too small. A breath does not entrain air through a 2 mm film (it presses it aside), and
  Paterson's fastest mode at the real gap is under one finger for the default liquid, so:
  no bubbles from wind, one round bubble from a straw, fingers only where the liquid is
  thick enough for two or more (`strawFingers` in `src/lib/bubbles.ts`). Story in
  `docs/plan-shipped.md` §15g-12; `npm run blowrange`, `npm run straw`.
- ~~**15g-19 The straw's lobes are clipped at a reach, not conserved**~~ **Shipped**:
  `rimAt` (`src/gpu/wgsl/air.ts`) now applies a zero-mean perturbation in r² (orthogonal
  low-harmonic lobe modulation minus the exact mean `63/256` of `cos^10`) so a fingered
  bubble keeps the round bubble's area (`A = V / b`), and `BubbleField` (`src/lib/bubbles.ts`)
  computes area from volume and the live `gapMetres` with no `rMax` clip (`npm run straw`
  `663` fingered against `669` round, `0.991x`). Story in `docs/plan/archive/15-tools-on-liquids.md`
  §15g-19. (38v, from RS-15.)

*The item as first written* (what air on a thin layer does: shear, pressure, the film, and why the carries were a shortcut) is in `docs/plan-shipped.md` §15g (moved 2026-10-29, 19m-2); its pressure and film halves are 15g-2 and 15g-3.

## 15e. The liquids' own forces on the GPU plate

- ~~**15e-1. The liquids' forces act only on a frame something else is laid in.**~~
  **Shipped** (2026-11-13, met again as 14ab-16): the step runs them itself, once a step,
  on any plate a bottle was poured on (`stepLiquids`); `npm run liquidpush`, and
  `liquidsgpu`'s five "a still plate" lines owed to it gate. Story in
  `docs/plan-shipped.md` §15e-1.
- ~~**15e-10. On a thin gap the liquids' push is momentum, not a drive (found with 15e-1).**~~
  **Shipped** (2026-11-14): a bottle's weight down a rocked thin gap is a drive laid after
  the gap keeps its flow (`liquidDrive`, `driveLiquids`), Darcy's w g sinθ h²/12ν read as
  every body force is; a light bottle's lightness has a field of its own so the carry keeps
  it; the soap's pull and the polar push no longer act between two glasses.
  `npm run liquidfall` (a drop at Hele-Shaw's speed to 4%), and `liquidpush`'s thin-gap
  reach asks the rock's way. Story in `docs/plan-shipped.md` §15e-10.
