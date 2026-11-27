# 48. Ideas: more compelling visuals from real phenomena (brainstormed 2026-11-21)

*Asked 2026-11-21, with the plan's refactor: "lets reprioritize the remaining work to focus
on beautiful visualizations/physics for this week. Let's also brainstorm more ideas for how to
make the visuals more compelling." These are ideas, not commitments: each is a phenomenon a
real dish, lamp or tank shows, why it would look good on a wall in front of an audience or
under a performer's hands, and a rough cost. The owner picks; a picked idea becomes an item
in the section it belongs to (or keeps its 48 id), with its check written first, like every
other item.*

The rules every idea keeps (PLAN.md's operating rules and the owner's standing ones): the
physics is at the core and the dials may ramp past real; the plate shader draws what the
solver makes and fakes no motion or mixing; sound reaches the plate only through cords and
preset patches; no whole-frame motion or flash from the music; a new setting defaults to
today's look, is MIDI-learnable and reachable from the desks and the phone; and the phone
version ships in the same PR.

Cost, as §38 counts it: S is under a day, M a few days, L a week or more. "Builds on" names
what already exists, so the cost is the new part only.

## The short list (put to the owner 2026-11-21)

Ranked by what an audience would see change against what it costs, with the owner's love of
the chemical clock counted in:

1. **48a** the chemical clock steered by light, and stirring itself
2. **48b** every oil drop a lens: caustic rims and focused light on the wall
3. **48c** bioluminescent trails: a dark plate that glows where the liquid is sheared (shipped 2026-11-21)
4. **48d** lift the glass: air fingers branch into ferns
5. **48e** oil-slick rainbows from a real spreading film
6. **48f** Faraday waves: the music's vibration stands up as a pattern, through a cord (shipped 2026-11-21)

**The owner's pick, 2026-11-21:** "lest do anything that can be impacted by the music itself.
Like lke the standing-wave patterns for example." So the music-driven ideas go first, each
through a cord the owner patches (never the solver's step taking sound): **48f** now, then
**48c**, **48a**, **48d** and **48i**, the ones a cord can move.

## The ideas

- **48a. The chemical clock, steered by light and stirring itself** (M; builds on the BZ
  stage in `src/gpu/wgsl/fluid/reactions.ts`, the Chemical Clock look, the force pass).
  Two real things the Belousov–Zhabotinsky reaction does that the Oregonator stage does not
  yet: (1) with the ruthenium catalyst instead of ferroin, light *inhibits* the reaction (the
  photosensitive BZ of Kuhnert and Steinbock), so a lit patch holds the waves back and a
  spiral's tip can be pushed around by a spot of light; (2) a wave front changes the
  liquid's density and surface tension, so in a thin open layer the waves drive their own
  convection (chemo-hydrodynamic coupling) and the spirals wobble, fold and break into
  scrolls rather than turning like clockwork. On the plate: the performer's hand (or the
  lamp's own pattern, or a projected gobo) paints where the waves may not go, and the
  spirals curl round it; the clock stops looking like a screensaver because the liquid
  answers it. Why it is first: the owner loves the chemical clock, and nothing else in
  VJ software is a living chemistry you can steer. The model: one inhibition term in the
  Oregonator's activator equation scaled by the local light (Φ), and the BZ state's
  density and σ fed to the existing buoyancy and Marangoni forces. Check: a lit disc holds
  a wave out (the front's speed inside the disc under a tenth of outside), and with the
  coupling on the front's shape bends where the flow does.

- **48b. Every oil drop a lens: caustic rims and focused light on the wall** (M; builds on
  **47j** caustics, **47z-4** each drop a lens, **18e**'s optical path, **18c-4** lens or
  film by the spreading coefficient). In a real overhead-projector show the brightest thing
  on the wall is light the oil *focused*: every drop's meniscus is a lens, so a drop throws a
  bright rim or a bright point and a dark collar, and a field of drops throws a network of
  caustics that crawls as they move. The derive pass already has the optical path; the
  missing step is to trace the projector's rays through its slope to the wall and pile the
  light where they land, in linear light, so the bright lines come from the liquid's shape
  and nothing is painted. Why it looks great: it is the single biggest difference between
  a real projected show and a picture of coloured liquid, and it makes every drop sparkle
  at the size of the wall. Check: a drop of known curvature focuses at the distance a thin
  lens of that curvature does, and a flat layer throws no caustic at all.

- **48c. Bioluminescent trails: the dark plate glows where the liquid is sheared** (S–M;
  builds on the velocity field, a dye channel as the organisms' charge). Dinoflagellates
  (Noctiluca, Pyrocystis) flash blue when the water round them is sheared past a threshold,
  then need seconds to recharge: a hand drawn through dark water leaves a glowing wake, and
  the same stroke a second later glows less. Model it as that: a light source per cell
  where the shear rate |∇u| passes a threshold, spending a charge that refills with a time
  constant, the light emitted. §38h's rule (nothing on a lit plate makes light) is about
  light the shader invents; this light is a real emitter's, so it belongs to looks with the
  lamp low or off, and the owner says whether it fits the rule. Why it looks
  great: in the dark sections of a set (real shows are 30–60% near-black) the performer's
  hands and the music's cords draw in light that fades, and an audience understands it at
  once. Check: no glow on a still plate, glow along a stroke and only there, and a second
  stroke on the same path within the recharge time glows less than the first.

- **48d. Lift the glass: air fingers branch into ferns** (M–L; after **38r-16** the pinch
  and the air edge; builds on the thin gap, 18a). The liquid light shows' oldest trick: two
  glasses pressed together with oil between, then lifted, and air invades the thinning
  liquid as branching, tip-splitting fingers (Saffman–Taylor in a lifted Hele-Shaw cell),
  leaving tree and fern shapes. The plate is already a Hele-Shaw gap with its own gap
  height; a lift is the gap growing in time, the pressure dropping in the middle and the air
  coming in from the rim along the instability. A hand (Press, held and pulled) or a cord
  would drive the lift. Why it looks great: fractal branching is something every person
  recognises from frost and lightning, it is unmistakably physical, and it is the move
  operators make by hand on real shows. Check: the fingers' width scales with the gap and
  the lift speed as the Saffman–Taylor wavelength does (narrower when lifted faster), and a
  slow lift gives fewer, fatter fingers.

- **48e. Oil-slick rainbows from a real spreading film** (M–L; builds on the soap film's
  thickness solver in §32, `filmTable.ts`'s Airy sum, the Thin Film setting). A drop of oil
  on water spreads into a film a few hundred nanometres thick, and interference paints it
  in Newton's series, thickest in the middle, the bands moving as it spreads and thins.
  Today Thin Film's colour comes from a noise (one of 38u-9's dormant drawn dials). Carry a
  film thickness per oil body, spread it by its spreading coefficient and thin it by
  gravity and evaporation, and read its colour from the table at the angle the lamp makes.
  Why it looks great: rainbow slicks round every oil body, the bands rippling with the
  flow, are what people remember from a puddle in the street, and they would replace a
  drawn dial with physics. Check: the band order from the middle out is Newton's series,
  and a film that has spread twice as wide shows bands of the colours of half the
  thickness.

- **48g. Thermochromic liquid-crystal dye that shows the heat** (M; builds on the heat field
  of **18f**, **18f-2** Bénard–Marangoni cells). Cholesteric liquid crystals reflect a
  colour set by their pitch, and the pitch changes with temperature: red, gold, green, blue
  across a few degrees. A bottle of it on the plate turns the lamp's heat and the convection
  it drives into a moving rainbow, cool edges red and the plumes blue. Why it looks great: a
  colour that moves on its own, slowly, in the calm parts of a set, and it is a real product
  painters and science shows use. Check: the reflected hue follows a measured
  colour–temperature table, and an unheated plate stays one colour.

- **48h. The cells the heat makes** (M; this is **18f-2**, raised). A heated thin layer
  breaks into hexagonal Bénard–Marangoni cells, the dye swept to their walls: the honeycomb
  real shows got from their lamps' heat. 18f-2 is written; this idea asks for it to be on
  the list because it is one of the most recognisable patterns of the genre, and the lamp
  already heats the plate.

- **48i. Ferrofluid stripes that turn with the field** (S–M; builds on the labyrinth, 38d,
  and the magnet's field, 9v). In a field laid along the plate rather than through it, a
  ferrofluid labyrinth straightens into parallel stripes along the field, and turning the
  field turns the stripes. A knob on the desk (and a cord) that rotates an in-plane field
  would make the labyrinth the performer's instrument. Check: the stripes' mean direction
  follows the field's within 15° after the turn settles, and a field through the plate
  keeps the labyrinth isotropic.

- **48j. Colour from stress in cellophane art** (S–M; after **31p-1** and **31p-3**
  polarised light). Layers of stretched cellophane or tape between crossed polarisers make
  the Michel-Lévy colours, set by each layer's retardance, and stacked layers make stained
  glass. A slide of such layers on the stage (an art pack like the moiré sheets, §45), drawn
  by the same Jones calculus as 31p, with the liquid's own flow birefringence on top, and the
  analyser turned by a knob. Check: one layer's colour at a known retardance matches the
  Michel-Lévy chart, and turning the analyser 90° gives the complementary colour.

- **48k. Ink drops that roll into vortex rings and split** (M; builds on the tank, **47n**,
  and **47k** threads that bead). A drop of ink falling into still water rolls up into a
  vortex ring, which slows, goes unstable and breaks into a crown of smaller rings, each of
  which does the same: the most famous macro shot of liquid. The tank's solver is a 2D
  slice; the ring is axisymmetric, so an axisymmetric solve of the same equations is the
  honest form. Check: the ring's speed falls with time as a viscous ring's does, and it
  splits into a number of daughter rings set by its Reynolds number.

- **48l. Salt fingers in the tank** (M; builds on **47n**). Warm salty water over cool fresh
  water is stable by density but not by diffusion, because heat diffuses faster than salt,
  so thin fingers sink and rise in a regular comb (double-diffusive convection). In the
  side view, a pour of warm dyed brine grows a curtain of fingers on its own. Check: the
  fingers' width scales with the quarter power of the diffusivities against the gradient as
  the theory says.

- **48m. Frost: crystals that grow as the solvent dries** (L). An evaporating salt or sugar
  solution grows dendrites from its edge: branching, six-fold or four-fold by the crystal,
  slower in the calm. A phase-field growth model fed by the solvent the plate already loses
  at its rim (18g-3's evaporation) would grow ferns of crystal across a corner of the plate
  over a slow song. Why it looks great: slow growth suits a quiet section and every person
  knows frost on a window. Check: tip speed and branch spacing follow the model's
  undercooling, and the symmetry is the one chosen.

- **48n. The Tyndall colours of a milky liquid** (S; builds on **18j** milk's scattering).
  Fine particles scatter blue more than red (Rayleigh), so a faintly milky liquid looks blue
  from the side and casts an orange light through it: an opal glass. Make 18j's scattering
  depend on wavelength by the particle size, so a thin milky veil turns the wall amber and
  its edges blue. Check: the transmitted colour's ratio of red to blue follows λ⁻⁴ for
  particles much smaller than the light, and goes grey for large ones.

- **48o. Kelvin–Helmholtz billows where two layers slide** (S to look, M to build). When
  the plate spins or the top glass is pushed, two liquids sliding over each other roll their
  interface into cat's-eye billows. First check whether the solver already makes them at
  the grid it runs (a spun two-layer interface, `npm run spin`'s setup); if it does not, the
  missing piece is the shear layer's resolution, which is a solver item, not a drawing one.

- **48p. Dichroic glass on the gel wheel** (S; builds on the mixer's gel wheel, §11). A
  dichroic filter is a stack of thin films whose colour shifts with the angle the light
  meets it, cyan to magenta to gold. A dichroic gel that the performer tilts by a knob would
  change the whole lamp's colour the way real dichroic slides do, and the colour would come
  from the same interference table as the soap film. Check: the passband shifts to shorter
  wavelengths as the tilt grows, by the thin-film law.

- **48q. The liquid looks move at a real show's pace** (M; found 2026-11-12, not an item
  until now). The study that filmed every look against the owner's references and real
  shows (`/mnt/project-files/looks-vs-references-2026-11-12/`, page
  <https://claude.ai/artifact/AGacG985eJtgmijoJ7geUh>) found 25 of 33 liquid looks slower
  than the real shows, and a closer view does not fix it: Classic at three times the zoom
  turns over in 7–10 s against a real show's 1.5–2.4 s. That is the physics' forcing, not
  the camera. The fix is the liquid worked harder by the things that work a real dish (the
  operator's tilts and presses, heat, the pour's momentum) on the looks that should be
  lively, measured by `npm run watch`'s turnover and lifetime against the reference
  library, never by speeding the clock (38u-6 is the clock's own item).

  **First part shipped** (#944, `npm run pace`): four lively looks (Oil and Water, Home
  Movie, Red Cabbage, Crowd Plate) run in a thin water-and-glycerine (4–8 cSt, Thickness
  0.2–0.3) instead of light oil (22 cSt), with a firmer Plate Rock, Beat Squeeze and pours
  (`src/presetsPace.ts`). In the thin gap a body force moves the liquid at h²Δρg sinθ/12μ
  and a push coasts for h²/12ν, so the thinner liquid is the real lever: the harder hand
  alone at light oil gave a 1.07x median. Filmed on the Mac after the flower fix (#949),
  one clean run of 60 s takes, turnover went 5.8→2.8, 8.6→4.1, 5.7→3.4 and 4.3→3.5 s
  (median 1.87x), each keeping 90% of its colourfulness and half its dark. Still slower
  than a real show's 1.5–2.4 s; the rest is below.

- **48q-1. The viscosity mode is dead on the thin gap** (S; found 2026-11-22 in 48q). With
  the thin gap on (every look), the plate's viscosity comes from Thickness alone
  (`thicknessViscosity`), so a look's `viscosity: 'thin'` (Galaxy's, the fixture's) does
  nothing. Either the mode feeds the gap's liquid or it goes from the looks and the desk.
  Check: a look's viscosity mode changes its filmed turnover, or no look carries one.
- **48q-2. Water stirs to mud: real, or the grid?** (M; found 2026-11-22 in 48q). At 1 cSt
  (Thickness 0) the paced looks turned over fast (Red Cabbage 1.8x, Oil and Water 3.4x) and stirred their colours
  into one: Red Cabbage's colourfulness 83→51, Home Movie a flat yellow plate. Real water does
  stir dyes together, but a real dish of water keeps sharp filaments far longer than the
  plate's semi-Lagrangian advection, whose numerical diffusion grows with the speed. Measure
  a filament's width against time at 1 cSt on two grids: if it thins with the grid it is
  numerics (sharper advection, 32c), if not it is the stirring and the looks stay thicker.
- **48q-3. The calm looks and the rest still to pace** (M; found 2026-11-22 in 48q). Galaxy
  and Milk Marble did not turn over faster at light oil with a harder hand, at water, or at
  4–8 cSt (Galaxy 7.7 s before, 8.0, 9.3, 8.0 after; Milk Marble 6.4, then 7.2, 6.4, 7.6):
  what thins and stirs them grows their forms as fast as it speeds them. Their pace may come
  from heat or from more, smaller pours rather than the liquid. Classic waits for #923; the
  other slow looks in the 2026-11-12 study are not yet in `PACE`. Check: `npm run pace`
  with `--film`, the same bars.
- **48q-4. Comet's pace is its stream** (S; found 2026-11-22 in 48q). Comet is a torrent
  that carries its ink off the plate, so a thinner liquid only empties it sooner: filmed at
  5.6, 11 and 16 cSt its colourfulness fell from 33 to 3, 16 and 24 while it turned over
  little faster (4.55 s, then 4.0 at 16 cSt). Its pace should come from `cometSpeed` and
  the pours that feed it, held to the same film's colour bar.
- **48q-5. Splodascope's pace** (S; found 2026-11-23 in 48q). Paced like the others (rock
  0.65, squeeze 0.4, pours 0.16, Thickness 0.3) it turned over 1.30x as fast on the film
  before the plate's slope fix (#949), but after it, two takes a setting on the same code,
  its old settings turned over in 3.74 s at colourfulness 134 and the paced ones in 4.36 s
  at 83 (4.50 s and 89 at Thickness 0.4): slower and muddier, its crowd of oil drops (Film
  Hold) broken up by the harder hand. So it stays as it was. Its pace may come from the
  drops' own motion (more drops, a gentler tilt that lets them slide) rather than a harder
  push. Check: `npm run pace -- --film` with it back in `PACE`, the same bars.

- **48r. Timbre and harmony as cord sources** (S–M; asked 2026-11-21 with the owner's pick:
  "what music aspects can we send through cords? ... like melody, timbre?"). A cord today
  reads the level, the kick, bass, snare and hats, the pitched part (`note`) and the
  sustained part in three registers (`tonalLow`, `tonalMid`, `tonalHigh`), eight EQ bands,
  hits as events, the lead's pitch (`pitch`, the melody's height) and which of the twelve
  notes it is on (`noteClass`), the beat and the bar, the song's build, drop and breakdown,
  and MIDI notes. The ear already works out two more that no cord can take: the sound's
  brightness (`brightness` and `timbre` in `audioFeatures.ts`, the spectral centroid: a
  bright synth or a cymbal against a warm pad) and its harmony (`chroma`, the twelve notes
  sounding, which only the song follower reads). Offer both as sources: timbre as a level,
  and harmony as how much the chord changes (the distance between this and the last
  second's chroma) and whether it is major or minor. For the music-driven ideas these are
  the natural drives: brightness to 48f's drive frequency (a brighter sound, a finer
  pattern), a chord change to 48a's light. Check: a sweep from a sine to a sawtooth at one
  pitch raises the timbre source and leaves `pitch` alone; a chord change moves the harmony
  source and a held chord does not.

## Second pass: the real phenomena still missing (2026-11-27)

*Asked 2026-11-27: "Are there any liquid physics we're missing that could make things even
more realistic and visually awesome?" Research only, nothing built. Checked against §18, §20,
§31, §32, §38 (all passes), §47, the ideas above and the solver's own kernels, so each line
below is something no item already holds. The owner's priorities that day weigh the ranking:
beautiful pictures with as little jitter as possible, and clean code, so GPU cost counts and a
phenomenon that grows smoothly from a field beats one that needs random nucleation or
sub-cell droplets. Ranked by what a person watching the wall would see against what it costs.*

| Rank | Item | On the wall | GPU cost | Build |
|---|---|---|---|---|
| 1 | 48s ouzo clouding (shipped #PRNUM; its check is 48s-1) | a clear pour blooms into opal clouds where it mixes | low: one carry and two per-cell passes, only with Ouzo on the plate | built; Claude's check owed |
| 2 | 48t chemical gardens | a pour grows its own coloured walls, spirals and coral | medium: one reaction pass, a solid mask | Claude |
| 3 | 48u shear-thinning gum | fingers turn from tulips into sharp cracks and lightning | low–medium: a viscosity per cell | Claude |
| 4 | 48v electric field on the oil | a voltage pulls drops into needles that spray fine jets | medium: one potential solve, reuses the magnet's stress | Claude |
| 5 | 48w Marangoni bursting | an alcohol drop explodes into a firework of droplets | medium, short bursts | Claude |
| 6 | 48x dancing droplets | food-colour drops on dry glass chase and flee each other | low: one coarse vapour field | Claude |
| 7 | 48y thermocapillary drift | drops creep slowly into the lamp's hot spot | low: a term in a force pass | Claude's check, then AG |
| 8 | 48z partial coalescence | a drop merges in steps, shrinking by half each time (closeup) | medium, closeup only | Claude |

Looked at and left out, so a later pass does not raise them again: von Kármán vortex streets
(the gap's Reynolds number is far below shedding, so a street there would be a fake);
Rayleigh–Taylor fingers on a tilted plate (the Boussinesq density force in `forces.ts` already
makes them when the dish tilts); dispersion of the oil's index (§31, per band in 18e's
shadowgraph); the Cheerios effect (needs a free surface the sandwiched gap does not have; the
bubbles' crowding is 38g); the coffee ring (in §18 with evaporation as solvent loss); Bénard
cells (18f-2, 48h); salt fingers (48l); Kelvin–Helmholtz (48o).

- **48s. Ouzo clouding: a clear pour turns milky where it mixes** (shipped #PRNUM, 2026-11-27;
  builds on **18j** milk's scattering). A fifteenth bottle, **Ouzo**: anise oil in alcohol at a
  kitchen extract's strength (3% oil in 75% alcohol; the drink's 0.2% is only a haze in a
  2 mm dish). The solver carries its ethanol and its oil in a field of their own (`solvent`,
  made at the first pour of the bottle, laid by the species' pour and moved by the species'
  carry), and once a step each cell is put on the measured binodal of water / ethanol /
  trans-anethole (53 cloud points, arXiv:2404.18524, fitted as ln s = −9.38 + 6.23 f + 4.93 f²
  in the solvent's ethanol volume fraction f): the oil over what the cell's solvent holds is
  droplets, the rest dissolved, the two always summing to the oil carried there
  (`ouzoCloud`, `src/lib/ouzo.ts`). The droplets' scattering (μs′ = 209 per mm for each unit
  of their volume fraction: one-micron droplets, Mie) is added to the channel milk's rides in
  and the plate draws it as it draws milk, unchanged. No seed, noise or timer. The Alcohol
  bottle is now ethanol to the solver, so poured on a cloud it dissolves it. Off for every
  look: no look pours the bottle, and without it no field is made and no pass runs.
  Measured in the lab with a scratch script (in the PR): the cloud agrees with `ouzoDrops`
  cell for cell, none appears in an unmixed cell or on the clear side of the curve, and the
  oil is the same to seven figures through a water pour and an alcohol pour.
- **48s-1. The ouzo's check** (S; owed by 48s, which shipped measured by a scratch script).
  A lab check, `npm run ouzo`: a water pour into a laid ouzo layer gives droplets only in
  cells on the two-phase side of `OUZO_BINODAL` at their own gap, to float precision against
  `ouzoDrops`; none in a cell with no oil or at the bottle's own strength; Σ(dissolved +
  droplets) unchanged while nothing has reached the rim; Alcohol poured on the cloud lowers
  the droplets there and leaves the oil; the plate handed for the species is the species
  plus 209 times the droplets in b; and a plate with milk or glycerine and no Ouzo makes no
  `solvent` field and renders byte for byte as before.
- **48s-2. Alcohol poured before any Ouzo is not remembered** (S; a shortcut 48s took for
  cost). The `solvent` field starts at the first pour that brings anise oil, so a plate that
  only ever sees Alcohol carries nothing new; ethanol poured before that first Ouzo is
  therefore not in the field, and an Ouzo poured into a pool of Alcohol clouds as though the
  pool were water. Real: the alcohol there would hold the oil. Either start the field at any
  ethanol pour (one more carry a step while Alcohol is on the plate; measure its cost on the
  Mac first), or lay the field from the species at its start when Alcohol is the only poured
  liquid so far.
- **48s-3. The ouzo's droplets ripen** (S–M; with **48n**). The droplets are taken at the one
  micron they form at; real ones grow to three over hours by Ostwald ripening, faster in
  less alcohol (Sitnikova and others 2005), and μs′ per unit of oil falls from 209 to 108
  per mm as they do, with the blue-to-red ratio going from 1.20 to 1.09. Carry the droplets'
  number beside their volume (the field's first channel is free for it) so the mean size is
  volume over number, and give 48n's Tyndall colours the size.
- **48s-4. The ouzo's front is as thin as the plate's mixing** (M; waits on **48w** and
  **18d-5**). On the thin gap a pour pushes the liquid before it aside more than it mixes
  with it, so the cloud is a ring a few cells wide at the pour's edge and wherever water is
  poured back in. In a real dish alcohol meeting water spreads and stirs itself (its lower
  surface tension pulls it out over the water, and it is lighter), which is what makes a
  louche billow. When the plate has that flow the cloud will follow it with no change here.
- **48s-5. A bottle's ethanol and anise oil as Liquid Designer dials, and a look that pours
  Ouzo** (S; the owner's call on the look). The two numbers are a bottle's behaviour
  (`ethanol`, `anise` in `LiquidBehaviour`) and the Designer does not show them yet: with
  them a performer could make a stronger or weaker louche (past real: more oil than alcohol
  can hold is already cloudy in the bottle). No look's dish pours Ouzo; a slow look whose
  automation pours it into coloured water is the obvious home.
- **48t. Chemical gardens in the gap** (M–L; builds on the Liesegang precipitate,
  `LIES_GRID`, and the pours). A metal salt pushed into silicate between two glasses grows a
  membrane of precipitate at the front, and the front's speed against its reaction sets the
  shape: spirals, flowers, worms and filaments (Haudin, Cartwright, Brau and De Wit 2014,
  confined chemical gardens). The precipitate becomes solid: the cell's permeability falls to
  zero and the liquid flows around what it grew, so the picture builds coral the flow then
  works around. Slow and continuous, so no jitter. *Check:* the same pour at two injection
  rates gives the paper's two regimes (spirals at low, filaments at high), no liquid crosses a
  grown wall, and the reactants are conserved.
- **48u. A shear-thinning gum: fingers that crack** (M; sharpens **37x-10h**, which names the
  gum, and **48d**, the glass lifted). A polymer or clay in the liquid thins where it is
  sheared, so the viscous fingers of a pour or a lift narrow from round tulips into sharp,
  branched cracks, and at strong thinning the pattern looks like fracture (Lemaire, Levitz,
  Daccord and Van Damme 1991; Lindner, Bonn and Meunier 2000). In the gap it is a viscosity
  per cell from the local shear rate (a power law with an index n set by the dial), which the
  Hele-Shaw drag already takes cell by cell. *Check:* the same lift with n = 1 and n = 0.5,
  the finger width falls as the papers measure and the branch count rises; n = 1 is today's
  plate to the bit.
- **48v. An electric field on the oil** (M; builds on the ferrofluid's magnetic stress,
  **38d**, **38k**). Electrodes at the dish's rim and a voltage: a leaky dielectric drop
  stretches along the field (or flattens across it, by the ratio of its charge-relaxation
  time to the oil's), and past a threshold tip-streams fine jets from its ends; under DC some
  drops spin by Quincke rotation (G. I. Taylor 1966; the leaky dielectric model of Melcher and
  Taylor; in a Hele-Shaw cell, Mirzadeh and Bazant 2017 on electric control of fingering). The
  maths is the magnet's with permittivity for permeability, so the stress kernel is shared. A
  new instrument for any oil look, a knob or a cord, the way the magnet is for ferrofluid.
  *Check:* a drop's aspect ratio against Taylor's small-deformation law at three fields, and
  the sign flips with the conductivity ratio as the theory says.
- **48w. Marangoni bursting: a drop explodes into droplets** (M; builds on the oil's
  Cahn–Hilliard field, the Marangoni stress and evaporation). A water and alcohol drop laid
  on an oil layer spreads, the alcohol evaporates fastest at its rim, the surface tension
  gradient pulls the rim outward, and the rim breaks into hundreds of droplets that fly out
  in a ring (Keiser, Bense, Colinet, Bico and Reyssat 2017). A firework on every drop; a cord
  can lay one on a kick. The droplets are near the cell size, so it wants the closeup's finer
  grid or the fine dye; on the wall at 1x it reads as a radial spray. *Check:* the burst's
  radius grows as the paper's law in time, the number of droplets rises with the alcohol
  fraction, and the oil and water are conserved.
- **48x. Dancing droplets on dry glass** (S–M; builds on the dewetting of **20b** and the
  Marangoni stress). Two-component drops of water and propylene glycol with food colouring,
  on clean glass, sense each other through the vapour they give off: a neighbour's vapour
  slows evaporation on a drop's near side, which raises its surface tension there and pulls
  it closer, so drops pair, line up, and (of unequal mix) chase and flee, all on their own
  and slowly (Cira, Benusiglio and Prakash 2015). One vapour field on a coarse grid
  (one diffusion pass) and the Marangoni force at the drop's rim. A plate that is alive
  without any noise, and calm enough for a quiet look. *Check:* two drops of equal mix
  attract, two of unequal mix chase in the direction the paper measured, and with the
  vapour turned off nothing moves.
- **48y. Drops drift towards the lamp's heat** (S; sharpens **18f-2** and **38f**). A drop
  in a temperature gradient moves to the hot side, because the surface tension is lower
  there and its surface flows to the cold (Young, Goldstein and Block 1959). 18f-2 puts the
  thermal Marangoni stress inside a layer; this is the same stress on every oil drop's rim,
  so drops gather slowly round the lamp's hot spot and wander as it moves. A term in a force
  pass the plate already runs. *Check:* a drop's drift speed against the Young–Goldstein–Block
  law at two gradients, and none on a uniform plate.
- **48z. Partial coalescence: a drop merges in steps** (M; closeup and tank only, **§47**,
  builds on **33f** and **38r**). A drop resting on a layer of its own liquid across a thin
  film of the other merges only partly: the neck pinches and a daughter about half its size
  springs back, rests, and merges again, four to six times (Thoroddsen and Takehara 2000;
  Blanchette and Bigioni 2006). A rhythmic shrinking blink, small on the wall, striking in
  the macro view. *Check:* the daughter's radius ratio near 0.5 over the cascade and the
  cascade stops at the Ohnesorge number the papers give.
