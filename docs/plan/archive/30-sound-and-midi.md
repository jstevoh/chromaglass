# Archive: 30. Shaping the sound and the MIDI: what Imaginando's VS rig showed (2026-10-11)

The closed items of [`docs/plan/30-sound-and-midi.md`](../30-sound-and-midi.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## ~~30a. A sound cord has only a depth~~ (shipped 2026-10-26)

Shipped (`npm run soundcords`, 34/34 lines in `scripts/checks.json`). Story in
`docs/plan-shipped.md` §30a (moved 2026-10-29, 19m).

## ~~30b. The LFOs and envelopes are fixed~~ (shipped 2026-11-08)

Shipped (`npm run soundowed`, id `lfo` taken out of `--owed` in `scripts/checks.json`; `npm run shapes` 15/15). Story in `docs/plan-shipped.md` §30b.

## ~~48c. Bioluminescent trails: the water glows where it is sheared~~ (shipped 2026-11-21)

Shipped behind Glow, Glow Shear and Glow Recharge (`npm run glow` 15/15 on the lab's software
WebGPU). Story in `docs/plan-shipped.md` §48c; written here beside the cords because the music
plays it through them. Not yet seen on the Mac (`docs/judging.md` §145). Three shortcuts are
named in the code and each is an item:
- ~~**48c-5. A look made for the glow.**~~ (shipped 2026-11-27, `npm run glow`, `npm run plate`)
  Night Sea (src/presetsGlow.ts): dark water and a few drops of dye, the lamp off, Glow 1.4 at
  Glow Shear 20 (0.02 Pa in seawater, Latz's low end), the dish on a 30 Hz shaker at 0.03 g
  (a third of the water's 0.084 g threshold), Music Shake 0.15 on the bass and the kick on the glass. The owner judges
  it on the Mac (judging §145, step 6).
- ~~**48c-6. The music's shake lights the sea.**~~ (shipped 2026-11-27, `npm run glow` section 6)
  A Faraday wave is a flow inside the water, and its strain is what lights a shaken flask of
  dinoflagellates. The glow step reads the shaker's amplitude field (wgsl/glow.ts part 3): the
  linear wave's strain at every height of the 3 mm layer from its potential, the share of the
  depth past the threshold in closed form, and the floor's Stokes layer. Measured on the lab
  (2026-11-27): under the threshold dark (brightest 0, charge 1); at 1 g on 30 Hz the lattice
  lights (mean charge spent 0.62), cell by cell as a share worked out independently by sampling
  a thousand heights (r 1.000 over all 65,536 cells, means 0.840 and 0.840; the wave read upside
  down r −0.16); ten times the Glow Shear spends 0.018 against 0.62; the shaker off, dark in a
  second.

## ~~30c. The controller's pads play the liquid~~ (shipped 2026-11-27)

- **What was asked.** The owner, 2026-11-27, for the controller used before (the APC40
  mkII, its map found in the Mac app): "I want the pads to be reactive to momentary
  presses - splatter, presses, etc. can we also combine colors, liquids, and a tool into
  rows in various ways?", then "sliders and dials should make sense and be related to
  each other".
- **What shipped.** A pad is a hold (lib/padHits.ts): note-on starts it with the velocity
  as the squeeze, aftertouch (now parsed: poly and channel pressure) changes it, note-off
  ends it. Drip drips on (Tate's drop, the pace the squeeze over the viscosity through
  Poiseuille's tip), Pour pours (Torricelli or Poiseuille, the lesser), Spray mists (less
  as the Ohnesorge number grows), Splatter re-flicks as the brush empties, Streak climbs
  its lane, Press, Blow and Stir hold. A column is a lane on the wall. Four grid layouts
  (lib/padLayouts.ts: Looks, Tools × Colours, Liquids × Colours, Liquids × Tools), the
  third axis on Track Select, stepped by Bank ◀ ▶ or Settings → Controller, keeping every
  binding off the grid. The APC40's columns are strips (a knob and its fader on one
  subject), the device knobs each tool's Amount (the pads have no velocity), Shift the
  lamp and lens, the crossfader and cue encoder the tilt. `applyGesture` carries a pad's
  own liquid and size (`PlateGesture.liquid`, `gain`). The phone: Motion → Pads, the same
  three layouts through lib/padDoor.ts into the same holds. Check `npm run padhits`.
- **30c-6** **shipped** (S, found 2026-11-28 running the checks for 49c-2) `npm run switches` is red on main, 1119/1127: eight phone Pads lines (`phone-pads-pick-5` to `-7` among them) read "on lights against off 1.00:1 by fill" (`#101012` both ways), so a picked pad on the phone's Pads sheet does not look picked. Make the picked pad lit the way the desk's is. **Shipped:** the picked pad takes `LIT`, as the layout row above it does; `npm run switches` 1133/1133 (was 1119/1127), `npm run phone` 367/367.

## ~~48c. Bioluminescent trails: the water glows where it is sheared~~ (shipped 2026-11-21)

- ~~**48c-1. The plankton are spread evenly.**~~ (shipped 2026-11-28) Every cell of the plate's water holds the same
  population, so a stroke anywhere lights the same. A real bloom is patchy and is carried: a
  concentration field over the plate, carried and diffused with the water as the dye is,
  poured from a bottle (a "Plankton" liquid on the bench) and thinned where the water is
  flushed, would scale both the light and the charge. Its cost: one more field on the glow's
  256² grid and its carry.
- ~~**48c-2. The threshold is a shear rate at seawater's viscosity.**~~ (shipped 2026-11-28) The cells answer the
  stress on them (Latz et al. measure it in pascals), μ·S. The step compares the strain rate
  with Glow Shear as if every liquid were seawater (1 mPa·s), so a stroke through glycerine
  or syrup, which stresses the cells hundreds of times harder at the same rate, lights no
  more than water. The fix reads the local liquid's viscosity (the mix's, 18d-1) and
  compares the stress with a threshold in pascals.
- ~~**48c-3. The light is not filtered by the dye.**~~ (shipped 2026-11-28) The emission is added over the plate's
  colour, so a glow under a thick dye shows as brightly as one in bare water. Real light from
  the water passes through the dye on its way to the lens and is absorbed by it as the
  lamp's is (18b): attenuate it by the dye's absorbance over the path, Beer–Lambert, with
  the blue's own extinction per dye.
- ~~**48c-7. The wave's strain and the flow's are two, taken as the larger**~~ (shipped 2026-11-28) (S). The stroke's
  shear is the gap's (two glasses 2 mm apart) and the wave's the open layer's (48f's 3 mm of
  water with a free surface), and a cell's share is the larger of the two rather than one
  strain from both flows together. One geometry for both (the open dish's layer with the
  stroke's flow in it, or the wave in the gap, 48f-3) would let them add as one tensor.
- ~~**48c-8. The wave does not carry the plankton**~~ (shipped 2026-11-28) (S–M). A standing Faraday wave drives a
  steady streaming (Stokes drift and the boundary layers' own), which over seconds gathers
  floating matter under the lattice's nodes; the glow's state is carried by the plate's flow
  alone. Add the streaming velocity of the amplitude field to the carry, so a long bass note
  herds the bloom into the lattice.
