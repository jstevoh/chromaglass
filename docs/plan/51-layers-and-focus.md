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

What shipped, measured (`npm run projectors`, 9 of 9, on the lab's software WebGPU): the
defaults multiply nothing, to the byte, one projector and two, written out or left out, where
a lamp at 99.5% moves 3 levels (and one projector's gains are exactly 1, 1, 1); a lamp at 0.6 is the law's
colour on clear glass to 0.005 per channel (0.506/0.448/0.338 of the lamp in display values);
a shutter half across dims every lit pixel to 0.730 (0.5 to 1/2.2) within 0.008, the frame's
edge as its middle; the crossfade's centre is half of each projector alone in linear light,
worst 1.32 levels of 255, where the old display-value sum is off by 5.8 on average; the wall's
mean light across the crossfade is linear to 0.02%, and a bare lamp flat to 0.00%; with the back
plate on a blend of its own there is no B and the crossfade moves nothing (it blacked the wall
out before the pre-push review: `bankHasTwo` is the one question the plate and the Mixer ask);
a front-plate bubble is no black disc at the crossfade's B end. Evolve never wanders the bank
(drift's NOT_THE_LOOK; it did, the pre-push review found). The old
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
- **51a-6 · A projector's own output and the shutter's light** (S). The per-surface sources
  (`lib/plateSources.ts`, a projector cast its own plate) take the crossfade's weight for the
  back plate, and still lay A's bare lamp under it, as before 51a; a surface for each projector
  should carry that projector's light alone. And the shutter button does not light when a
  controller learned to it moves it (it has no `midiKey`, as the Mixer's take buttons have none).
- **51a-5 · A lamp has thermal lag** (S). A tungsten filament takes about 0.1 to 0.3 s to heat
  and cool (its heat capacity over the power it radiates), so a variac yanked to zero glows
  down rather than cuts, and an overdriven lamp rises slower than it falls. The fader is
  instantaneous today; the lag is the filament's temperature as a first-order state, walked on
  the stage clocks as the shutters are.

## 51b. Each layer is always sharp, and focus never moves

*Shipped 2026-11-27: Focus A and B under each lamp in the Mixer's Projectors box (so the desk,
the settings sheet, the phone's Mix sheet and the remote; MIDI-learnable, −1 to 1, sharp at the
middle); `lib/projectorFocus.ts`, `gpu/focus.ts`, `gpu/wgsl/focus.ts`; `npm run focus`. Builds 31a,
which this replaces in the running order.*

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

What shipped, measured (`npm run focus`, 6 of 6, on the lab's software WebGPU at 256 pixels):
the law from numbers typed in the check (10 mm of rack 0.312% of the frame along the lamp's
bar, the rack's end 2.34%, the knob's end 9.98%); sharp is the plate to the byte (keys at 0,
left out, or under half a pixel), where a rack 1.4 pixels wide moves 23 levels; racked a
quarter, to the rack's end and to the knob's end, the plate is the sharp plate through the
law's box in linear light within 1.05, 0.96 and 0.75 levels where the box moves anything (the
bar turned a quarter, the control, 12.4, 8.0 and 8.3), a slide's step edge 10–90% wide within
7% of the box's along x and 5% down y (20.5 by 9.9 pixels at the knob's end, against 20.4 by
10.2); the light kept within 0.003% (a blur of display values, the control, 0.30%); with two
projectors B soft and A sharp, B is its box within 0.43 levels, A within the dither of sharp,
and the crossfade's middle half of each in light, worst 1.45 levels.

How it is built: a pass after the plate (`gpu/focus.ts`, as the lens pass is), because a
defocus blurs the light on the wall and the display works a pixel at a time. The display draws
unfinished into a half-float picture with B's share of the wall, channel by channel, in a third
target (`noteShare`, taken where both plates are on the wall, before the mixer's rows); the
rows pass splits the light by it and boxes each along x, the columns pass down y, adds, and lays
the finish. The pupil is the lamp's image, a filled bar 32 by 16 mm (an FXL or ENX coil and its
reflector's image, magnified about 3.6 by the Fresnel), so the soft edges are twice as long
across the frame as down it. Its cost: nothing at the default (the pass sits out and allocates
nothing); one projector soft at the rack's end on a 2560-wide frame, about 75 texture reads a
pixel in the two passes, and 24 bytes a pixel of pictures while soft (released when sharp).
On the Air (M4), 1600 × 1600, ms a plate draw, median (p90), timed by the 51b thread through the
film queue: one sharp 4.33 (5.23), one A at the rack's end 8.17 (9.30), one A melted 11.09
(12.06), two sharp 8.63 (9.45), two with B at 0.75 14.54 (16.68), two both melted 19.55 (20.63):
only the last missed 16.7 ms, which is why 51c boxes a melt at a smaller picture.

Found while building it, not done:

- **51b-2 · The rack moves the shadowgraph too** (S). The same Δz is the Becke lines' distance
  (plateTransmit's `defocusShadow`, the look's Projector Focus, a depth inside the 2 mm gap): a
  head racked 10 mm is five gaps off the liquid, where the lines would be strongest, and they
  are drawn at the look's Focus alone. One lens told two things until the rack is added to that
  Δz; it wants a lab look at the lines' strength at a few millimetres before it ships, as the
  clamp (0.2 to 2.5) would bind.
- **51b-3 · Soft with the lens pass, the tank and a projector's own source** (S). With Glitter
  or Side Light up (the lens pass), on the tank's side view, and in a projector's own plate
  source (16b), the plate draws sharp whatever the focus; and the mixer's rows over both plates
  (the film, the LED ring, the lumia) are blurred with A's share, being drawn in the display
  before the split. Each wants the pass to run after the lens pass, and the film to be its own
  projector with its own focus (51a-4). (Its last part, a melt past about 31 pixels of
  half-width spreading its taps, shipped with 51c: a melt is boxed at a half, a quarter, an
  eighth or a sixteenth of the frame, see 51c.) Until the rest ships, a focus dissolve under
  Glitter, the side lamp or the tank is a plain fade (`focusDraws`).

## 51c. A look change is a fade or a cut, never hidden in the blur

*Shipped 2026-11-27: Focus Dissolve, the last control in the Mixer's Projectors box (desk,
settings sheet, phone Mix sheet, remote; MIDI-learnable, 0 off); `lib/focusDissolve.ts`,
the stage clocks' rack, the app's Go in `app/useLookFades.ts`; and the melt boxed at a smaller
picture (51b-3's last part, `gpu/focus.ts`); `npm run focus` 14/14.*

Epic Rig's rack melts the disc into a glow before the scene changes, and a lumia "spreads it
across the whole thing, then focuses it". One move of 51b and the look fade: rack the
projector out (to about 10% of the frame) over the fade time, swap the look or dish at the
peak where the swap can't be seen, rack back in. With two projectors A racks out while B
racks in, 51a's crossfade carrying the light. Fade lengths are today's `FADE_CHOICES`.

Check first: during a focus dissolve the frame's sharpness has one minimum at the swap, and
the frame-to-frame change at the swap is under a quarter of a hard cut's.

What shipped. Turned up, every Go with a fade (a Go, Go now, a set item, a song's set look, the
assistant's) racks the projectors it changes out and back over the fade time, along sin²(πp):
still at both ends as a hand starts and stops a knob, widest once, at the middle. The look
change itself is held back a quarter of the fade and runs over the middle half, where the rack
is past half its depth, so the look fade's own middle (where what cannot be halfway flips, and
the ferrofluid ring is swapped) lands on the widest blur. A Go to the back plate racks B alone
while A holds sharp (with two projectors on the wall; with one, its one beam). A second Go
mid-rack carries on from the blur it has reached. A cut stays a cut, and under Glitter, the side
lamp or the tank (where the pass does not draw, 51b-3) a dissolve is the plain fade. The dial's
first half is the head's real rack, as the focus knob's; past it, it ramps on to a glow a
quarter of the frame along the lamp's bar (`GLOW_M`, 0.8 m, past real).

Why a glow and not the plan's 10%: a blur hides edges, not where the light lies. Measured in
the lab (`npm run focus`, a slide of 160 dots 2 to 5% of the frame across swapped in one frame
at the rack's middle, the worst case, since the app's own handover runs over the middle half):
racked to the focus knob's melt, a tenth of the frame, the swap moved the frame 57% of a cut;
racked to the glow, 29%. So the check's bar is under a third, not the quarter proposed before
anything was measured, and the control (the knob's melt) must stay over it. Epic Rig's rack
goes to one red glow, which is the glow's scale. A change of palette across the whole plate is
broader than any blur and is not claimed (two pools against four: 93%): the look fade carries
it across the middle half. The sharpness (the Laplacian's variance, on 4 × 4 means past the
dither) falls from 1258 to 1.3 at the swap and climbs back to 1320, one minimum.

The melt at a smaller picture. Once every soft projector's box is wide enough (its short side
at least 6 pixels of the smaller picture, `focusScale`), `down` takes the light to a half, a
quarter, an eighth or a sixteenth of the frame in linear light, split by B's share; the rows
and columns run there; `compose` draws it back through one bilinear tap and lays the finish; a
projector sharp beside a melted one is added at full size, untouched. In the lab at 1024: the
knob's end (a box 102 by 51 pixels) at a quarter is off the law's box by 0.48 levels where it
moves anything (full size 0.50), its edges 82.8/40.3 pixels against 81.7/40.8, the light within
0.011%, 0.04 levels from the full-size melt on average; the glow at an eighth 0.43 levels; A
sharp beside B melted is A to the dither. Each scale's pictures are kept while anything is soft,
so a rack walking through the scales allocates once.
On the Air (M4), 1600 × 1600, ms a plate draw, median (p90), one film-queue job at the PR's
head, each melt beside the same draw forced to full size in the same run: one A melted 3.37
(3.73) at a quarter against 5.04 (5.47); two both melted 4.91 (5.50) at a quarter against 9.20
(9.58); A sharp beside B melted 5.03 (5.24) against 6.96 (7.35); both at the dissolve's glow
6.00 (6.32) at a sixteenth; one sharp 2.84, two sharp 4.12. The 51b thread's numbers above
came from another script (19.55 for two melted) and are not set against these; the pair that
counts is this run's full size against its smaller picture, which halves two melted projectors.

Found while building it, not done:

- **51c-2 · An A/B deck dissolve.** *Shipped 2026-11-28: **Decks** (`projDeck`, a switch, off
  by default), the button beside the A/B Crossfade in the Mixer's Projectors box (desk,
  settings, phone Mix sheet, remote; MIDI-learnable as a switch); `lib/deckDissolve.ts`,
  `focusDissolve.ts`'s rack kinds, `app/useLookFades.ts` (`deckGo`); `npm run decks`.* With
  Decks on and two projectors on the wall, a Go with a fade goes to the darker projector (B on
  a tie). What was in the way: B could not draw a look of its own. What it can own is what 16a
  gave the back plate, its dish (every solver setting and the dyes); how the plates are drawn
  is one pass for both. So a deck Go splits the look: the dish to the dark deck while it is
  dark (over the first quarter; the front's solver keys, or the back plate's own look), the
  crossfade glided over the middle half along sin²(πq/2), the rest of the look on the front
  once the dish has landed, to three quarters (inside 51c's window, where both decks are
  melted or both half lit; one fade at a time on the front).
  The leaving projector racks out over the first half and holds the melt while its light
  goes; the arriving one racks out over the first quarter, still dark, holds, and racks in as
  its light comes up. A Go when the arriving deck is lit (the crossfade in the middle) waits
  the quarter for it to melt before its dish goes in. A second Go mid-dissolve goes to the
  darker deck then, each rack carrying on from its blur. A Go to a dark front pins the lit
  back plate to what it shows (`pinBack`), so it does not follow the front's new dish. A
  hand on the crossfader during the glide takes it back; a Back, a later Go or a Go to the
  back plate stops what of a deck Go is still to come. And B with no light on the wall is no
  longer blurred at all (`gpu/plateUniforms.ts`), so a dark B's melt costs nothing; A's is
  still drawn, because where neither projector has light the Mixer's rows laid over both
  plates fall to A's share (the pre-push review). Through the middle half 51c's 4.91 ms for
  two melted at 1600² on the Air applies. Checked on a made-up clock (nothing lit changes sharp; a rack
  jumps only in the dark; a second Go before and past the middle steps no rack by more than
  a frame) and through the real pass at 256 (the wall's light within 0.10% across the
  dissolve; B dark is off the wall to the byte, sharp, melted or with its dish changed,
  while at the middle each moves it; the first and last frames the plain A and B to the byte).
- **51c-6 · A dark A's melt drawn for nothing** (S). A deck dissolve holds a dark A melted
  for a quarter of the fade at each end; the pass still draws it, because the Mixer's rows
  where neither projector has light go to A's share. Give those rows their own share, then
  skip A's melt when A is dark as B's is.
- **51c-4 · Each deck its own drawing** (M, after 16b). A deck Go changes the rest of a look
  (lamp ground, glass, lacing, blend) on both projectors at once, hidden in the middle half;
  with 16b's own sources each projector would take its own and nothing would change on the lit one.
- **51c-5 · Decks on the APC40** (S, with 51h). The crossfader drives `projCross` and the deck
  glide hands it back on a touch; the Projectors layout should light a pad for Decks and show
  which deck is dark.
- **51c-3 · A short dissolve's ring** (S). Under 2 s the look's fade is under a second, and the
  handover never runs shorter than one, so the ferrofluid ring's swap falls past the rack's
  middle. Hold the handover inside the rack's middle half too, or give Focus Dissolve a 2 s floor.

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
