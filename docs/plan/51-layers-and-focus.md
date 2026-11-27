# 51. Projectors that blend on the wall, and focus that moves (asked 2026-11-27)

*Asked 2026-11-27, after the owner watched Liquid Light Lab's films: "A lot of the show
dynamics comes from blending the surfaces dynamically and using elements of focus and depth.
I want to control that with midi controls and generally expand our features to do this."
Research only; nothing here is built. The ranked page for the owner:
https://claude.ai/artifact/Ms43NeDCc6hYHfyacz5NnV*

**What was read and watched.** The captions of eleven Liquid Light Lab videos (the overhead
projector and two-plate tutorials, the triple-plate demo, the Vidicon 2020 demos, Light Show
Review episode 4 and the two Joshua Light Show episodes); three of their films through
`npm run watch` with a per-second sharpness curve (Epic Rig, the performance montage, Mixing
Two Plates); C. Scott Taylor's account in *Dancecult*, the Liquid Fidelity lexicon and the
Wild Bohemian how-to. Kept on the owner's Mac under
`chromaglass-films/watch/layers-focus-2026-11-27/` (captions and the three films).

**What a real show is.** Two to four projectors (up to about twenty for the Joshua Light
Show) adding light on one dark wall, each with its own lamp dimmer (a variac, which dims or
overdrives to 160 V), a shutter (a vane, a card, a hand, a dollar bill over the stage, because
the lamp must stay lit to stay cool), an aim, and a focus knob, mixed by one person. The
dynamics are in the mix: one slow, soft layer holds while a sharp one comes and goes; a dark
plate and a light plate "reveal and hide each other"; a layer arrives from a side or rises
from below. The players rarely talk about focus, but the films use it: Epic Rig at 17:50 holds
a blue ribbon out of focus throughout and racks a sharp oil disc into a red glow in six
seconds (Laplacian variance about 280 to 10), then changes the scene. Mixing Two Plates keys
two squeeze plates together on a video mixer with black ink in the alcohol (4:50 to 6:40);
the analog version is the same thing, because black passes no light.

**What Chromaglass has today** (mapped 2026-11-27). Two plates at most
(`LiquidVisualizer.tsx`, `Math.min(2, …)`); with `twoProjectors` their light adds, otherwise
the lamp's light passes through both. The Mixer has a level, grade, blend (including key) and
fade time per row, but no A/B crossfader. Look fades interpolate settings on one plate. One
`projectorFocus` plane drives 18e's edge lines and the glitter's lens; the camera's `focus`
and `aperture` blur by the dye's painted height (31a, 38q). `gelWheel` and `gelSpeed` exist,
one wheel in the Mixer's order. Open elsewhere and built on here: **16d** up to four plates,
**16e** a Mixer row per plate, **31a** focus across the two dishes, **31f** Lens Type, **36b**
one picture across several projectors, **47d** the camera's depth of field.

**Ranked.** By what a performer gains for the work. Every dial runs from gentle to past real;
the physics stays at the core. Each item ships with its phone control and its MIDI-learnable
keys (the operating rules), and each is its own thread.

1. **51a** a bank of projectors: lamps, shutters and an A/B crossfade.
2. **51b** each projector's own focus, and riding it between the dishes (builds 31a).
3. **51c** focus dissolve: change looks behind a rack.
4. **51d** hands, cards and irises: cut-ins with real edges.
5. **51e** aim and throw: each projector its own place and size on the wall.
6. **51f** one colour wheel across several projectors.
7. **51g** a dark plate and a light plate that reveal each other.
8. **51h** a Projectors layout for the APC40 mkII.

## 51a. One plate fades; projectors don't

*Shipped on today's two plates 2026-11-27 (Lamp A and B, Shutter A and B, A/B Crossfade at the
top of the Mixer, so on the desk, the settings sheet, the phone and the remote; MIDI-learnable;
`lib/projectorBank.ts`, `gpu/wgsl/projectors.ts`; `npm run projectors`). Four plates are 51a-3.*

A show is several projectors with their own lamps and shutters, mixed live; ours has two
plates and a Mixer level per row, no crossfader and no shutter. Model the wall as each
projector's light through its own dish, added in linear light, divided by its throw squared
(16-many-plates notes the blend is still done in the canvas's values: this fixes that for
the projector rows). A lamp dimmer follows an incandescent lamp's own laws, light as V^3.4
and colour temperature as V^0.42 (the existing `lampWarmth` is the temperature), so a
projector pulled down goes dimmer and amber, and past 100% it brightens and cools, as a
variac overdrive does. The A/B crossfade is linear in light, because light adds: an
equal-power curve, as in audio, brightens the middle. The shutter is a vane closing in about
80 ms close to the lens, so it dims the whole picture evenly (the near-pupil case of 51d).
Ship first on the two plates plus the film and LED rows, then on 16d's four.

Check first: a lab render with two projectors at known lamp levels, the wall's linear sum
within 1% of the two alone added, the crossfade's mean light flat within 2% across its
travel, and a dimmed lamp's white point moving warm by the law's amount.

What shipped, measured (`npm run projectors`, 6 of 6, on the lab's software WebGPU): the
defaults multiply nothing, to the byte, one projector and two; a lamp at 0.6 is the law's
colour on clear glass to 0.005 per channel (0.506/0.448/0.338 of the lamp in display values);
a shutter half across dims every lit pixel to 0.730 (0.5 to 1/2.2) within 0.008, the frame's
edge as its middle; the crossfade's centre is half of each projector alone in linear light,
worst 1.32 levels of 255, where the old display-value sum is off by 5.8 on average; the wall's
mean light across the crossfade is linear to 0.02%, and a bare lamp flat to 0.00%. The old
`npm run lamp` line 5 now asks for the linear sum (9 of 9). No shipped look had Two Projectors
on, so moving the add into linear light moved no saved look.

Found while building it, not done:

- **51a-2 · A lamp may follow the sound** (S). A colour organ is a 1960s light show's own
  tool: lamps on the bass, mids and highs. The bank's keys are hands only for now (sceneMap's
  NOT_A_TARGET), as the house dimmer is; a cord on a lamp would need the flash guard's limit
  and the lamp's thermal lag (51a-5) so a kick does not strobe the wall.
- **51a-3 · Four projectors** (L, with 16d). Two plates are the most the plate composites
  (`LiquidVisualizer.tsx`, `Math.min(2, …)`); each projector is one more solver. Measure the
  frame on the Air through the film queue at three and four (numbers only), degrade to fewer
  solver steps on the back projectors before dropping one, and expect the MacBook Pro to carry
  more.
- **51a-4 · The film and LED rows on a side of the crossfade** (S). The film projector and the
  LED ring are projectors too; each could be put on A, B or neither, so one fader takes the
  plate down and a film up.
- **51a-5 · A lamp has thermal lag** (S). A tungsten filament takes about 0.1 to 0.3 s to heat
  and cool (its heat capacity over the power it radiates), so a variac yanked to zero glows
  down rather than cuts, and an overdriven lamp rises slower than it falls. The fader is
  instantaneous today; the lag is the filament's temperature as a first-order state, walked on
  the stage clocks as the shutters are.

## 51b. Each layer is always sharp, and focus never moves

*Proposed. M. Claude. Builds 31a (the same disc blur), which this replaces in the running
order.*

Players ride focus by feel ("a little out of focus there, there we go"; "manual focus, then
you can blend it"), and Epic Rig holds one layer soft while racking another. Thin lens: an
overhead's stage sits about 0.36 m below a lens of about 0.32 m focal length, so a glass Δz
from the focal plane blurs into a disc of Δz times the pupil over 0.36 m. The pupil is the
lamp's image, because the Fresnel focuses the lamp into the lens: the blur takes the lamp's
shape (a short bar for a halogen coil, round for an arc lamp), and its size is smaller than
the glass alone would give. A squeeze plate's two glasses about 10 mm apart give 0.3 to 0.8%
of the frame, the size of a real show's soft edges (1.2 to 2.4%, 47v); the knob's real travel
reaches about 2.3%, and the dial ramps past it to a full melt. The blur is done in linear
light and keeps the light, so a defocused cell becomes a glow, not a dark smudge. One focus
per projector, in the head's height; the same Δz is 18e's shadowgraph distance and the
existing `projectorFocus`, so nothing is told two things about one lens (31f-1).

Check first: a lab plate with a sharp step edge on each glass, the edge width at each focus
setting within 10% of the thin-lens disc, the total light unchanged within 1% as focus moves.

## 51c. A look change is a fade or a cut, never hidden in the blur

*Proposed. S after 51b. Antigravity, with a check Claude writes.*

Epic Rig's rack melts the disc into a glow before the scene changes, and a lumia "spreads it
across the whole thing, then focuses it". One move of 51b and the look fade: rack the
projector out (to about 10% of the frame) over the fade time, swap the look or dish at the
peak where the swap can't be seen, rack back in. With two projectors A racks out while B
racks in, 51a's crossfade carrying the light. Fade lengths are today's `FADE_CHOICES`.

Check first: during a focus dissolve the frame's sharpness has one minimum at the swap, and
the frame-to-frame change at the swap is under a quarter of a hard cut's.

## 51d. Nothing can block the beam between the stage and the lens

*Proposed. S to M. Antigravity, with a check Claude writes.*

A card circle taped on the stage frames the art; an iris closes the light; a bill or a hand
blacks out the stage between songs; Joshua Light Show layers "come in from different angles
or pull up from the ground, not just bam on the screen". Something blocking light at height z
above the stage casts a shadow whose edge blurs by the pupil times z over (0.36 m − z): crisp
on the stage (the mask), a soft wipe halfway up, and at the lens no edge at all, only an
even dimming (the shutter vane). An iris on the stage shrinks a sharp circle; an iris at the
lens only dims and deepens the focus range (with 51b). One Hand with a height and a side, and
one Iris, per projector. `dishVignette` stays the dish's own rim.

Check first: the wipe's edge width at three heights within 10% of the formula, and at the
lens height the picture dims with no edge (its light falls evenly within 2% across the frame).

## 51e. Every projector lands in the same place at the same size

*Proposed. M. Antigravity for the geometry; Claude reviews the light.*

The Joshua Light Show threw 18 ft with projectors spread wide on two levels and found it
"nicer to make collages"; Epic Rig overlaps a disc, a ribbon and a bubble field at different
sizes; "the closer the distance, the more bright and saturated the light". The picture's size
grows with throw and its light falls as one over throw squared; aiming at angle θ stretches it
by 1/cos θ and dims it by cos³θ on a flat wall. Changing throw without refocusing defocuses:
a Focus Follow switch re-racks, or lets 51b's blur show. Today each output has corners
(`outputConfig.ts`); this is aim and size per projector inside the plate's wall composite.
`layerScaleVariety` folds into it.

## 51f. The gel wheel cannot reverse, and covers whatever the Mixer order says

*Proposed. S. Antigravity.*

Three or four projectors aim through one shared wheel; wheel motors slow, stop and reverse on
dimmers; a dark segment on a fast wheel strobes. Add a speed that reverses (centre stops),
which projectors the wheel covers (A, B or all), and an optional dark segment. The gel filters
each covered projector's light before the wall, as now over the lamp.

## 51g. No ink is black, so a dark plate can't let another projector through

*Proposed. S, once 51a is in. Antigravity.*

"Double liquids, one dark and one light, would reveal and hide each other"; "use the
darkness"; pressing a plate flares it and "burns out" the slide; Liquid Light Lab puts black
inkjet ink in the alcohol so it keys out. With projectors that add (51a) this is the physics,
no key needed: a black plate passes no light, so the other projector shows; pressing thins the
gap and that projector flares (Beer–Lambert, already in the solver). What is missing is a
broadband black absorber among the colours and a pair of looks built on one dark plate and
one light.

## 51h. The controller has no page for the projectors

*Proposed. S, after the remap in "Remap the MIDI controller for live play" (2026-11-27) and
each feature it maps. Antigravity.*

One more APC40 mkII layout beside the remap's, on Bank ◀ ▶, taking the crossfader only while
it shows: faders 1–4 projector lamps, 5–8 the film, LED, wash and wheel rows, master all lamps
(today's `dimmer`); the A|B buttons and crossfader for 51a; Activator the shutter, Solo a flash
while held; track knobs 1–4 focus (51b), 5–8 iris (51d); Track Select picks a projector for the
right-hand knobs (Aim X, Aim Y, Throw, Turn, Aperture, Hand height, Wheel speed, Rack time);
the Clip Stop row a hand wipe; Scene Launch 1–5 a focus dissolve to looks 1–5 (51c). The phone
gets the same per-projector strip.

## Left out on purpose

Depth of field inside a deep tank belongs with 47n; a filmed close-up's rack focus is 47d; a
cue list from the record is the song shows; light past the frame is 36b.
