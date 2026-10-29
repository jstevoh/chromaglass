# 25. Areas of interest: several places on one plate: what shipped

How §25's shipped items were found, built and measured. The open work is in
[`docs/plan/25-areas.md`](../plan/25-areas.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 25. Areas of interest: several places on one plate

**Why a look had one.** Read off the code, every look was built to have a single area
of interest:

- Every look's music worked from the middle of the dish: the kick's ring of dye, the
  burst on the velocity route, the pulse on the density route and Beat Squeeze's press
  were centred on the plate's middle, and the mid's stream circled it at 0.3 of the plate.
- 29 of 41 looks set Center Gravity (a concave dish: heavy dye slides to the middle),
  and the dish turns about the middle.
- Nothing made one part of the plate unlike another for long. A look's liquids were
  laid as fifteen spots anywhere and topped up wherever the automation's drop landed,
  so soap or glycerine was spread thin over the whole glass; each drop's colour was a
  fresh pick from the look's dyes.

Velvet Underground was the plainest case: its four seed pools, Gaussians 18–25 cells
(128-grid) wide, overlapped into one wash covering 92% of the plate (the lab, one lit
region over density 0.3, 4% of the plate dark), bass routed to both the burst and the
pulse in the middle, and Center Gravity 0.35. Lumia laid no dye at all and its
automation dropped one every three minutes, so its picture was the lumia light layer
alone: a texture over the whole frame with no place in it.

**The mechanism (25a, shipped).** `src/lib/plateAreas.ts`: a look may name two to four
areas of the dish, each a place (centre and radius, in the dish's frame), a liquid, a
dye (an index into the look's dyes, each area a different one; a palette lock still
wins, and a hue journey or the sequencer turns all the areas' dyes on together, so they
stay different colours) and a band of the music. Laying the look pours each
area's dye as a pool with its own rim of drops and each area's liquid into it; the
automation's drops land in the areas (weighted by size), in each area's dye and
liquid; the bass's ring, burst, pulse and squeeze land in the bass area (taking several
in turn, kick by kick), the mid's stream circles the mid area's edge, the treble's
sparks fall in the treble area (a look with no mid or treble area of its own takes its
areas in turn, eight seconds each). The Color route still moves the colour, cycling
between an area's dye and the next one, and a kick's ring is the other of the two
against its pool. A Go and the sequencer pour into the same places. A
hand that picks the plate's bottles keeps the areas' places and colours and pours what
was picked. What happens in each area is the liquid's own physics already in the
solver (liquidPhase.ts: glycerine's body, soap's Marangoni, syrup's weight); nothing
paints a region. A look without areas plays exactly as before, its dice drawn in the
same order. `npm run plate` checks every area look: real liquids the look lists, dyes
in its set, inside the plate, areas apart, and the routing the app uses.

Velvet Underground, Lumia and Cell Bloom are rebuilt on it (judging §34):

- **Velvet Underground**: a magenta glycerine pool the mids circle (top left), a
  raspberry soap well the bass breaks open (right), ultramarine syrup glittering with
  the treble (low middle). Center Gravity 0.35 → 0, Dye Budget 0.85 → 0.45 (violet
  between the pools), automation 0.04 → 0.08, liquids ink/glycerine/syrup →
  glycerine/soap/syrup. Lab, laid plate: 1 lit region (92%) → 3 (8.6, 7.6, 7.5%),
  dark 4% → 73%. The same plate run for 15 s of kicks in the lab kept the old one as one
  region (92.5%); the run on the new plate stalled on software WebGPU and is owed (25e).
- **Lumia**: three veils, two in glycerine and one with soap in it (spread thin and
  opened), under the unchanged lumia light. Dye Budget 0.1 → 0.2, automation 0.008 →
  0.03, soap added to its liquids.
- **Cell Bloom** (added by the owner the same afternoon): a closeup look, and its one
  area was its camera's. Follow mode locked onto the pool nearest the middle and rode
  it, and at its 3.5x zoom its Paint Cells were never drawn: at Cell Size 0.32 a cell
  is too small on screen to resolve (`resolved` in wgsl/plate.ts starts the coarse
  cells at 3.9x), so the lab drew it as a plain wash. Now three small pools (silicone
  and magenta, oil and lavender, silicone and ultramarine) sit round the middle
  inside one closeup frame, the camera holds on the middle (follow → hold) and the
  dish's turn carries them round under it, and Cell Size 0.32 → 0.6 so the cells are
  drawn at its zoom.

#### 25h. Areas that listen for themselves (shipped)

The owner, 2026-10-24: the presets want more complexity, more varied palettes and parts of
the canvas reacting to the music; of the four directions explored that day, all taken, this
one first. Areas already took the music's hands by band, but every patch cord moved one
number for the whole plate and every area drew on one palette.

- **A cord aimed at an area** (`SceneMapping.area`, an index into the look's areas) does one
  of four things a hand does to one place (`lib/areaCords.ts`): **Heat here** (heat in
  kelvin, 1.5 K/s at full, carried and cooled as the lamp's is; 25h-1 names that it opens no
  hole until 18f-2), **Stir here** (a paddle drawn round the pool: the Finger's own solid on
  a thin gap, one turn in 1.2 s, turning back on each hit of a gated cord), **Pour here**
  (the area's bottles, 1.5 of density a second, under the look's fill as the music's pours
  are) and **Bottle here** (which bottle pours next). A setting is one number per plate, a
  uniform in the shaders, so an area takes the four acts and nothing else; the patch bay's
  fold leaves an area cord alone. Every act eases to nothing over the area's rim.
- **A gate on an area cord**, the least of 30a: a threshold (closing 0.05 under it, so a
  reading dithering on the line is one hit), an attack and a release, linear, so the
  envelope reaches a hit's height in the attack and falls from it in the release. None of
  the three set, the cord follows its reading as every cord did.
- **A colour family per area** (`PlateArea.dyes`). Absent, the family is the area's dye and
  the next, which is what its pool's second colour and the Color route's cycle already took,
  so Lumia and Cell Bloom lay and play as before. Velvet Underground's contract grew to six
  (lavender, coral and purple after its three), one pair per pool.
- **The looks.** Velvet Underground: the kick warms and stirs the soap well, the mids fold
  the glycerine with a slow paddle, the hats pour the syrup's two bottles in turn. Jellyfish
  Bloom (25b-6): its four bells are areas now and its seed lays them there (`OWN_SEED_AREAS`;
  they were scattered at random), the kick pours the lowest bell's pink and teal, the hats
  ruffle the top bell, the brilliance band picks its bottle (for the treble's sparks that land
  there: the music's own hands in an area read its Bottle cord, `AreaHands.picked`, which the
  first build left to the area's pour cords alone, and that bell had none), the mids pour the
  side bells.
  Bass Drop (25b-3): three soap wells on the bass, taken in turn by the kicks, Center
  Gravity 0.4 → 0.15; the snare stirs the low well and the sub warms the left. Preset depths
  stay at 0.6 or under, the most a one-second look change crossfades within `npm run desk`'s
  0.03 a tick.
- **The panel.** On a look with areas each patch gets an area picker over a thumbnail of the
  plate (`components/phone/AreaPicker.tsx`, the areas drawn where they are in their
  families' colours, 40 px targets for a thumb, the same sheet on the phone), and an area
  cord gets the gate: Fire on a hit, Gate, Rise, Fall.
- **Measured** (`npm run areacords`, the lab on SwiftShader, Velvet's pools on a thin gap,
  laid through the app's own sink, each run against a control of the same plate with no
  cords): one band's cords on the soap well changed the dye there 2×10⁵ times what they
  changed outside every area and kept 1.946 of the 1.967 of density poured there, the flow
  13.6x, and the heat 1.302 K on the run's mean of 1.310 K laid, against nothing outside;
  with two areas on two bands, band 2 worked the well 773x (dye) and 17.4x (flow) more than
  the syrup, and band 7 the syrup 286x and 18.4x more than the well; each gate opened once a
  burst (8 of 8). The flow held to the paddle's own arithmetic (the review): 0.090 cells a step
  meaned over the well, on 0.016 that the paddle's solid laid there and a paddle going 0.337
  round its circle (the floors half and a tenth); with the paddle cut to a cell across (0.05 of
  the area) the well went 0.006 and the check failed, where the ratio alone had passed. In
  node, a hit that grows after the gate opens ends at 0.887 for 0.9 (0.500 with the height
  untracked), and two cords alike keep a gate each. In node, a gate opened 14 times for 8 bursts and 6 stretches dithering on
  its line, where reading the line alone opened 51; rise 0.250 s for 0.25 and fall 0.333 s for
  0.35, for a hit of 0.9 and one of 0.5. The 25e
  count of lit places, each look played by its own cords for four seconds of a groove with
  every act in the plate's middle (where the music landed before areas) and then in its
  areas: Jellyfish Bloom 1 → 3, Velvet Underground 1 → 1 (its cords pour in one pool; the
  other two are stirred and warmed), Bass Drop 0 → 0 (its cords pour nothing; its wells take
  the music's own hands, 25h-7).
