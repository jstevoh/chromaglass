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
3. **48c** bioluminescent trails: a dark plate that glows where the liquid is sheared
4. **48d** lift the glass: air fingers branch into ferns
5. **48e** oil-slick rainbows from a real spreading film
6. **48f** Faraday waves: the music's vibration stands up as a pattern, through a cord

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

- **48f. Faraday waves: the music's vibration stands up as a pattern** (M–L; through a
  cord only; kin to **34d** Chladni figures, which are sand on a ringing plate). A liquid
  layer shaken up and down past a threshold grows standing waves at half the drive's
  frequency: stripes, squares, hexagons, and at two frequencies quasi-crystals. The drive
  is the cord's amplitude and the pattern's scale is set by the dispersion relation of the
  layer's depth, so a bass note gives big cells and a high one fine ones, and the pattern
  grows and decays with the note rather than flashing. Model: a surface height on the
  liquid (the thin gap's free layer, as the open dish §42d has) with the parametric
  forcing of the Mathieu equation; light through it by the same optical path as 48b. Why it
  looks great: the audience sees the music make a shape, and it is the shape a physicist
  would draw. It stays inside the rule: the sound only shakes the dish through a cord the
  owner patches, and the pattern is the liquid's. Check: no pattern under the threshold
  amplitude, and the pattern's wavelength follows the dispersion relation within 10% at
  three drive frequencies.

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
