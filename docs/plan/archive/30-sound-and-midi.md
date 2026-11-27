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
  Glow Shear 20 (0.02 Pa in seawater, Latz's low end), the dish on a 30 Hz shaker at 0.06 g
  (under the water's 0.084 g threshold), Music Shake 0.15 on the bass and the kick on the glass. The owner judges
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
