# 9. Ferrofluid after the references

**Partly shipped**: the edge and the two looks, the dye riding the ferrofluid, the magnet standing the pool up, fingers past the spikes, Blow and Finger on the ferrofluid, and the Magnet moving only the ferrofluid that is there. What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

`src/gpu/wgsl/plate.ts`, `src/presets.ts`, `src/presetPlate.ts`, `scripts/ferrolook.mjs`

The reference is Chemical Bouillon's ferrofluid films (frames in
`/mnt/project-files/ferrofluid-look/references/`): razor-sharp edges at any zoom, a fine
scale (fingers or cells about 1/60 of the frame, hundreds of them), thin black walls of
ferrofluid between packed cells of coloured dye, and wet gloss. Ferrofluid is the one
liquid here that *should* shine: a projected look has no speculars, because the light
comes through the liquid, but these films are lit from the front.

What watching the lab clips of Ferro Maze, Ferro Paint and Magnet Garden found
(`/mnt/project-files/ferrofluid-look/watch/`), in the order to fix them:

- **9b. Maze detail**, shipped in #167: Maze Detail (0 to 1) divides `MAZE_PERIOD` by up to three, Ferro Maze at 0.5 (`npm run maze`). Whether it now matches the reference is for the Mac. Story in `docs/plan-shipped.md` §9b (moved 2026-10-29, 19m-2).
- **9d. Smaller faults.** A sub-half phase shows as brown ghost smears; Ferro Maze's
  white table clips (32 % of the frame blown); no visible pulse on the kick.

Open, from building 9e (in the order to do them):
- **9g. Domes at the lab's grid.** On 256² a spike's pitch is ten cells and a dome is
  four or five across, so much of each is edge and grey. The app runs 384² and up
  where they are sharper; the Mac should judge whether 256 (the software rung and
  some phones) needs a coarser pitch.
- **9h. Thick walls in Ferro Paint and the maze.** The references' ferrofluid walls
  between dye cells are thin and even; ours still thicken where the maze coarsens.

- **9ab. Fingers thinner than the grid are drawn** (**shipped**): a strand under the half-full line is drawn by Beer–Lambert through its phase's thickness (`npm run fingers`). Judging §41. Open: the maze's haze (9aa) is under half full too and is drawn by the same rule, so it reads browner until 9aa takes the leak out. Story in `docs/plan-shipped.md` §9ab (moved 2026-10-29, 19m-2).
- **9aa. The maze is two to three times coarser than its period, and leaves a haze**
  (measured 2026-10-04, building 4a-clock). Ferro Maze, Ferro Paint and Magnet Garden
  in the Mac gallery are fat black blobs with a brown haze round them, where the
  references are dense thin stripes on clean white. The lab reproduces it (256², Ferro
  Maze's settings and pour, Thin Gap on; with it off the same): after 900 steps the
  domains are about 30 cells wide where the period asked is 12, and the black (cells
  past half full) falls from 21% to 15% of the plate as ferrofluid leaks into a film
  under half full, the haze (9d's "ghost smears"). Tried, each 600 steps, none of them
  a fix on its own:
  - the field coil at full strength under the whole plate (MAZE_UNIFORM 0.45 → 1):
    the same blobs, and the leak faster (black 21% → 11.5%);
  - the double well steepened everywhere, not only under the hand (phaseMu's
    `wellNeed`): the leak slowed (black 17.7% kept, against 15.4%), the blobs stayed;
  - MAZE_GAIN ×4 (the maze's Darcy flow): droplets, and the leak faster (12.5%);
  - the dipoles' repulsion nearly unscreened (m² from 0.16 k*² to 0.005 k*²), which is
    the real physics: parallel dipoles in a thin layer repel at long range, and a
    screening shorter than a pool lets a pool sit as a pool. **The haze went entirely
    and the black stayed at 17.8%**, but at that fill the domains became separate dots
    (with the repulsion ×4 and ×16, smaller dots). Ohta–Kawasaki's dots are right for
    a fifth of the plate: a labyrinth needs about half (Magnetic Pattern I's disc is
    half black).
  So the next step is both: the long-range repulsion, and a pour that fills the
  maze's region to about half (a disc for Ferro Maze, as the reference), with the
  period then set by the sharp-interface balance and not the linear one (the dots
  came out about twice the asked period). Every ferrofluid check moves with it
  (`maze`, `fingers`, `domes`, `spikes`, `ferrodye`, `ferropour`), so it is its own PR
  in lane C after 9t. Probes in `/mnt/project-files/clock-ferro-looks/`.
- **9j. Spikes that follow the music.** A real ferrofluid speaker's spikes jump on the
  kick. The spikes now answer the magnet's field, so the maze's audio breathing
  could drive their height too.

Open, from building 9i:

- **9k. More fingers, and a labyrinth in the middle.** The reference ("Magnetic
  pattern I") has sixty or more fingers round a pool and its middle turns to
  stripes; ours has about sixteen, and the middle stays a field of domes (9e's
  spikes win there). A finger's neck also thins to about half full on its way
  out, so a finger reads as a round tip on a grey stem in the field: the plate
  draws the half-full line and shows it whole in the lab, but a Mac look should
  say whether it breaks up at 60 fps.
- **9l. The magnet still has to pull under a Labyrinth.** Under a maze field the
  pull under the hand was already halved with the spikes (SPIKE_PULL); the longer
  push now works against it too. `npm run magnet` (Mac only) holds that a pool
  still follows the magnet when it is dragged, on Classic; nothing holds it on
  Magnet Garden.
- **9m. The spikes' outline margin is thin.** `npm run spikes` asks for an outline
  2.78 times a disc's; it reads 2.85 now, 2.62 with the finger push reaching all
  the way in. Anything that softens the spikes' repulsion will turn it red.
- **9o. Fingers on Classic.** With no Labyrinth the Magnet only gathers: no
  fingers past the spikes. A push of the hand's own there (tried in 9i) either
  stopped the magnet gathering scattered drops, with the pull eased, or drew
  grey fingers (7, 1, 0 and 0 on `npm run fingers`' circles), with it whole:
  Classic's Phase Edge, 0.35, separates too slowly to keep up with the flow
  pulling them out. Wants a push that switches on only once the liquid has
  gathered under the hand, and a floor on the separation's speed there.
- **9p. What `npm run fingers` does not measure.** The magnet between no spikes
  and full (a low Tool Amount, or a Ferrofluid Scale that holds it higher),
  where the push ramps in; and a maze look's labyrinth far from the hand while
  the hand is held: the hand's share (spikesClose) is one number for the plate,
  so the push leaves the far labyrinth's separation too, and it rests on the
  maze's flow alone there.
- **9q. A Mac check of the hands on the ferrofluid.** `npm run ferrohands` measures
  the carry with the app's own numbers (lib/handCarry.ts) but not the app's calls:
  which method each hand reaches, the Finger's carry waiting on each reading of the
  dye, how often a hand acts, and a moving Blow's held direction. A check through
  the real pointer on Magnet Garden, reading the phase before and after, belongs in
  `npm run tools` on the Mac.
- **9r. The Finger's carry searches when it need not.** `phaseCarry` gathers each
  cell's share from every cell within the hop, which only a puff (straight out)
  needs; along a stroke exactly one cell can land on each, and could be read
  directly as `mixCarry` does. The remote's widest directed Blow at 512² is about
  4000 reads a cell over 28 000 cells. Worth doing if a Mac frame-time reading
  under a held Blow shows it.

- **9t. The ferrofluid stands up as a layer that keeps its volume** (**shipped**). Story in
  `docs/plan-shipped.md` §9t (moved 2026-10-29, 19m).
  - **9t-1. The lift held near the onset.** G under the hand is 2.8 (a real layer's is
    hundreds), so the domes grow at a scale the grid draws; at the lab's G 4.3 they set
    as bars along the grid. A finer film grid under the magnet (the patch at twice the
    plate's cells) would let it rise.
  - **9t-2. No pull under the film (shipped 2026-11-01, with 38k-7).** The plate's pull
    acts under the standing film's window on each cell's own share. Story in
    `docs/plan-shipped.md` §9t-2 + 38k-7.
  - **9t-3. No hysteresis.** Real domes stay a few per cent under the field that raised
    them; turned to 0.95 of the onset on the axis, these were all gone two seconds on.
  - **9t-4. Slower than a real layer.** Domes start a second and a half after the Magnet
    arrives and stand by four; a real layer takes a fraction of a second (9t-1 again).
  - **9t-5. The model's own simplifications:** the lift saturating with the layer's
    height (S(h)), small slopes, a flat water top, no finite-depth correction to the
    lift, a (9, 3) wetting law at a 10° angle, the mobility capped at full, a noise of
    a hundredth of the pressure scale to seed it, the window (full to half the
    patch's half-width, none past three quarters, and no further than 0.083 and 0.125
    of the plate on any grid: at 0.65 and 0.9 the fingers at a pool's rim fell to
    7/5/5/4, against 11/10/9/5 with the film off, 9t-8), and each patch stepping its own magnet in turn
    where two fingers' overlap.
  - **9t-6. The film's cost**, up to four patches of 128² on 384², eight substeps each,
    13 dispatches a substep (eight FFT passes, then pressure, flux, apply, sum and
    take), is not yet measured on a Mac or a phone.
  - **9t-7. 256².** A capillary length is 1.6 cells there, and the domes are coarse
    (9g).
  - **9t-8. Fewer fingers past a pool's rim: fixed in #247.** With the film's window
    stepping the water's flow aside, nothing carried the layer out of it: the window
    kept 7212 of the pool's 13029 where the plate alone kept 5429, the rim had less to
    finger with, and `npm run fingers` counted 6/4/5/2 on the Mac against main's
    12/9/9/3. The flow now carries the layer's mean under the window (wgsl/fluid.ts,
    carried): 9/12/9/5 in 7 sectors, the domes standing (the flow carrying each cell
    as outside instead poured the domes into slabs). Left: the last dome on the
    magnet's axis lies down more slowly when the field is turned down (1.12 at the
    end of `npm run standing`'s leg, 1.06 after 960 steps more; that check now asks under 1.2
    and at most 30 cells past 1.05, where it asked under 1.1), and the window still
    stands in for the film fingering at its own edge, which a real layer does by the
    same repulsion that raises its domes (9t-1).
  - **9t-9. The magnets still reach the plate's uniforms unread.** The plate drew its
    spikes from them; the domes come from the layer now, and the app still computes and
    uploads them every frame (plateUniforms.ts, magnetsOnPlate). Take them out, with the
    harnesses that tell the plate of them.
  - **9t-10. The first Magnet of a session waits for the film's build.** Its nine kernels
    are built behind the show the first time a magnet passes the onset (a moment or two
    on a cold cache), and until then the pool only gathers. Starting the build at half
    the onset would build it on every Magnet Garden show, whose own magnet is there;
    starting it when the Magnet tool is picked would not.
- **9u. A set-down magnet still gathers a pool with no domes.** What the hand leaves
  behind (strength 0.8 at the look's height, 0.225 at Classic's Scale) is a field
  share of 0.15 on its axis, under the spikes' onset (0.18, `spikes.ts`), so it pulls
  the ferrofluid into one flat black pool where the hand let go. A real magnet strong
  enough to pull a pool across the dish raises Rosensweig domes on it, and the pool
  is never one flat disc. That is the pull against the lift: a thin-film lab of the
  Rosensweig instability (2026-10-03, not yet in the repo) found the plate conserves
  the ferrofluid's area where a real layer conserves its volume, so domes standing up
  cannot open gaps, and its magnet case piled the pool 0.84 of a capillary length
  deep before domes came, with the balance of pull and lift left open. It belongs to
  the standing-domes plate PR that lab is for, not to a retune of the set-down
  strength here.
  The liquid's onset is now worked out (38k, 4.0 mT, five times under the lab's), and
  at it this magnet stands its pool up, and since 9t-2 and 38k-7 the plate runs on it.
- **9x. Picking the Magnet poured the hole itself; a magnet you size and play**
  (**shipped**). Story in `docs/plan-shipped.md` §9x (moved 2026-10-29, 19m).
  Open: on one Mac run (PR #230, after main came in) the pool's centre was 0.11 off
  the hand 1.5 s after the touch, before the drag, and the drag then left it behind
  (46% of the way). The lab replaying that run's own step, magnet path and pool kept
  it on the hand and carried it 87–90%, bare plate or dyed, so the cause is in the
  app and not the step. `npm run magnet` now prints the pool as laid, the solver's
  magnet through the first second and a half, the plate's turn, the step count and
  the automation's hands, so a recurrence names it. Main's deploys went red on
  both magnet checks after 9s: `npm run magnet`'s "poured round the middle does not
  gather into it" (the ring pour this item takes away) and `scripts/ferro.mjs`'s
  "not at its mirror", whose two arms ran on two grids when the governor moved the
  solver (384² then 256²); ferro.mjs now pins its grid (`sim=384`).
- **9v. The magnet as a real magnet, not a deepened dipole (shipped).** Story in
  `docs/plan-shipped.md` §9v (moved 2026-10-29, 19m).
  Open, found here:
  - **9v-cost.** The field is elliptic integrals wherever the magnet reaches (in
    the solver five evaluations a cell a magnet, and per pixel on the plate inside
    twice the rim and gap). Measure it with `npm run stages` on the Mac with the
    Magnet held; if it shows, tabulate the magnet's field once per radius and gap
    (it is a function of ρ/a and z/a only) and sample it.
  - **9v-tilt.** The magnet is held upright under the glass here. A hand tilts
    it, and a tilted magnet's field leans: its spikes lean and its pool slides toward the
    lower rim. Needs the magnet's direction in the step.
  - **9v-grade.** Every magnet is one grade, its strength a share of the hand's.
    A real set (ceramic against neodymium) differs in remanence by about three
    times; a Grade choice beside Size would be that, MIDI-learnable.
  - **9v-height.** Magnet Height is still where the old dipole stood, and the
    face is a fixed 0.06 above it (`MAGNET_FACE`), clamped 0.01 under the liquid.
    Saying the setting as the gap itself would be plainer, but changes every
    saved look's magnet; worth doing with a look version bump.
- **9w. Carry the ferrofluid across a new solver** (**shipped**): the old solver copies the ferrofluid, the mix and the reactions on the GPU before it goes (`handOver`/`takeOver` in `gpu/fluid.ts`; `npm run regrid`, `npm run magnet` check 8 on the Mac). Not carried: Oil Bodies' share of the dye, the glass's press, the particles, and 20b's clear film (#259; to be carried the same way). Not checked anywhere yet: that the app keeps the carry until the new solver's first readback, so an out-of-memory retry after a climb gets it, and that after a lost device the app's next solver refuses the old carry and lays the look's ferrofluid as before (the lab checks only a second device's refusal). Story in `docs/plan-shipped.md` §9w (moved 2026-10-29, 19m-2).
- **9z. The dye at its own grid across a new solver.** Found while doing 9w: the
  dye and the flow cross a move of the grid through the CPU's 192² arrays
  (`FluidSimulation.attachGpu`, `pullStateFromGpu`), so a plate on 384² to 1024²
  is carried at 192² and upsampled back: anything finer than about two cells of
  the old grid is smoothed away at every move, and the copy is a frame old.
  Carry the dye and the velocity on the GPU as 9w carries the phase (an area
  mean for the dye, which is an amount; the velocity resampled and projected),
  keeping the CPU path only for a lost device. Measure it first: the dye's fine
  structure (the `grating` or `microscope` measures) before and after one move.
