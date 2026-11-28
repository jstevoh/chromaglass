# Archive: 48. Ideas: more compelling visuals from real phenomena (brainstormed 2026-11-21)

The closed items of [`docs/plan/48-ideas-visuals.md`](../48-ideas-visuals.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## The ideas

- **48f. Faraday waves: the music's vibration stands up as a pattern** (shipped 2026-11-21, `npm run faraday`): built in §30 beside the cords, where its open items 48f-2 to 48f-7 live (moving waves next: strobe drift, riding the flow, past a second threshold); the story is in `docs/plan-shipped.md` under 48f.

## Second pass: the real phenomena still missing (2026-11-27)

- **48s. Ouzo clouding: a clear pour turns milky where it mixes** (shipped #1007, 2026-11-27;
  builds on **18j** milk's scattering). A fifteenth bottle, **Ouzo**: anise oil in alcohol at a
  kitchen extract's strength (3% oil in 75% alcohol; the drink's 0.2% is only a haze in a
  2 mm dish; 1% since 48s-6, whose film found 3% a flat white paint). The solver carries its ethanol and its oil in a field of their own (`solvent`,
  made at the first pour of the bottle, laid by the species' pour and moved by the species'
  carry), and once a step each cell is put on the measured binodal of water / ethanol /
  trans-anethole (53 cloud points, arXiv:2404.18524, fitted as ln s = −9.38 + 6.23 f + 4.93 f²
  in the solvent's ethanol volume fraction f): the oil over what the cell's solvent holds is
  droplets, the rest dissolved, the two always summing to the oil carried there
  (`ouzoCloud`, `src/lib/ouzo.ts`). The droplets' scattering (μs′ = 209 per mm for each unit
  of their volume fraction: one-micron droplets, Mie) is added to the channel milk's rides in
  and the plate draws it as it draws milk, unchanged. No seed, noise or timer. The Alcohol
  bottle is now ethanol to the solver, so poured on a cloud it dissolves it. Off for every
  look that was there: none of them pours the bottle, and without it no field is made and no
  pass runs. The bottle's own look, Louche, pours it (48s-5 has why it came with the bottle).
  Measured in the lab with a scratch script (in the PR): the cloud agrees with `ouzoDrops`
  cell for cell, none appears in an unmixed cell or on the clear side of the curve, and the
  oil is the same to seven figures through a water pour and an alcohol pour.
- **48s-1. The ouzo's check** (shipped with 48s-6, 2026-11-27: `npm run ouzo`, the lab shard; owed by 48s, which shipped measured by a scratch script).
  A lab check, `npm run ouzo`: a water pour into a laid ouzo layer gives droplets only in
  cells on the two-phase side of `OUZO_BINODAL` at their own gap, to float precision against
  `ouzoDrops`; none in a cell with no oil or at the bottle's own strength; Σ(dissolved +
  droplets) unchanged while nothing has reached the rim; Alcohol poured on the cloud lowers
  the droplets there and leaves the oil; the plate handed for the species is the species
  plus 209 times the droplets in b; a plate with milk or glycerine and no Ouzo makes no
  `solvent` field and renders byte for byte as before; and the oil and the cloud come
  across a governor's move (`lab.regrid`) as the species does since 18d-10 (the field is
  handed over beside it: a scratch run at 192 → 128 read the oil 25.01537 before and
  25.01725 after, the droplets 14.867 and 14.861, where without the hand-over both were 0).
  As built (`scripts/ouzo.mjs`, 14 lines, about two minutes on SwiftShader): the cells agree
  with `ouzoDrops` to 9e-9; the bottle's own strength is read as the cells at 0.6 ethanol or
  more of a pool laid without its volume (a pour with its volume never stays neat); a pour of
  Alcohol pushes some of the oil from under it, so line 4 reads the dissolved share of what
  stays (52% to 100%); "renders as before" is read as the plate being handed the species
  itself, float for float. Its controls: a curve holding half as much oil again fails line 1
  and keeps the oil; 2% more droplets than the oil fails line 3 (it agrees with `ouzoDrops`
  cell for cell, so line 1 alone cannot catch it); the regrid without the hand-over reads 0.
- **48s-6. Louche retuned so the cloud leads** (shipped 2026-11-27, with 48s-1). The Mac's
  first film of Louche (one take, seed 1) showed dye over 40 to 60% of the dish and the white
  arriving after twenty seconds as one or two flat, opaque lumps, a tenth of the frame. Three
  causes, each fixed: (a) the dye was the five wide pools every look without a seed of its own
  opens on (61% of the dish over 0.2 at the app's grid), and the automation holds a look's dye
  at what its seed laid; Louche now opens on three small drops (`plainSeed` in
  `src/presetPlate.ts`: 9% of the dish, an eighth of the dye). (b) The cloud came only with the
  automation's drops, one Ouzo in about forty-five seconds at Evolve 0.12 with nothing playing;
  Evolve is now 0.36 and half the dish's drops are Ouzo (Ouzo, Ouzo, water, Alcohol), a cloud
  every five to ten seconds anywhere on the dish. (c) The white was paint: at the extract's 3%
  a drop a tenth of the column read 204 of 255 on Louche and every bigger one 210 to 240; the
  bottle is now 1% oil (five times a pastis, a third of the extract: still a real spirit on the
  same measured curve) with a drop half as wide again, and the same drop reads 140, a laid dose
  about 205, and a strong pour keeps a clear middle in a white ring. `npm run ouzo` lines
  10–13 hold the three. Left: the look's opening doses never reach the solver when Louche is
  the page's first look (27f-9o, every look with a dish), and the cloud's billow wants 48s-4.
- **48s-7. Louche in the middle** (shipped 2026-11-27; the owner: "just pick one"). 48s-6's own
  film (Mac, seed 1, 60 s) had the cloud from the first frame but the dish 72 to 80% near black,
  the purple barely there, 1.0 swells a minute against 4.9, and from 0:33 the white gathered into
  opaque ribbons along the bottom. Between the two: four dye drops of radius 9 (`plainSeed`,
  26% of the dish over 0.2 at seed 1, 22 to 26% over three seeds, against 9% and the pools'
  61%); Evolve 0.24 (a drop spreads before the next, so motion stands above its median); the
  dish Ouzo three times, Alcohol twice, water once (half Ouzo still, two thirds of 48s-6's oil
  a minute, two Alcohol for three Ouzo where it was one for two: nothing but Alcohol takes the
  droplets out of a dish, `npm run ouzo` line 3). Lines 10 and 11 of `npm run ouzo` hold the
  seed's bracket and the spirit's share. Filmed on the Mac (seed 1, 60 s, against 48s-6's take):
  near black 72–80% → 59–63%, dye 15/8/8% → 38/28/24% of the frame at 0:10/0:30/0:55, three
  hues not two; the late white 14.8% → 9.2% of the frame, its densest part (luma over 190) 7.5%
  → 2.4%, a thinner ribbon broken by dark holes. Swells did not come back (1.0 a minute both,
  calm 11% → 10%): 48s-8.
- **48s-8. What took Louche's swells** (shipped 2026-11-28). Seven films on the Mac (main
  240d08b, seed 1, 60 s each; `FILM_ONLY=louche npm run film`, read by the replay of
  `watch.mjs` shape() in the project's louche-swells-48s8 folder). The swells were never the
  dropper's: in every Louche film, the first included, they sit at 1, 16, 30, 45 and 57 s, the
  film track's kick-only passages, and they are the music's bass Press (the Velocity route's
  cord, lib/musicCords.ts): with that route at none, 0 a minute and half the beat flicker. Kick
  cord off, Evolve 0.12 and the first dish: 1, 1 and 1 a minute, no change. What rose was the
  plate's motion between them, every kick's bloom of eight dye drops, which barely showed on
  the first version's wide pools and is a bright speck on black on the dark dish: Kick Bloom 0
  takes the median from 1.62 to 0.72 % a sample (4 swells, but near black 60% → 70%), 0.3 to
  0.93 (4 swells, near black 63%). Louche now ships Kick Bloom 0.3: swells 2.0 → 4.0 a
  minute, calm 10% → 29%, motion half-life 0.3 → 2.3 s, brightness 0.17 → 0.16. Judging page
  for the owner (before/after side by side). Still open from 48s-7: why the late cloud gathers
  at the bottom of the frame (Plate Rock's default 0.45 or the rim's carry), and 27f-9o.
