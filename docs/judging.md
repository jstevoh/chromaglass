# Things that need your eyes and a real GPU

Everything in this file was changed on evidence that a sandbox can produce —
arithmetic, kernels, deterministic simulations — and none of it has been seen on
a machine that renders the plate at sixty frames a second. This is how to judge
each one in about a minute, and how to put it back if you disagree.

The sandbox this was built in rasterises in software at two or three frames a
second. That is enough to prove a kernel and useless for judging a look, so
the first four are the decisions where my evidence stops and yours starts. The
last two were measured on an M4 on frozen frames, and they are still taste.

## 1. The reconstruction filter — the one I care about

Every read of the dye went through a cubic B-spline sitting under a comment that
said Catmull-Rom. B-spline does not pass through its samples: at a texel centre
its weights are (1, 4, 1)/6, so every fetch returned a blurred neighbourhood
instead of the value in the cell. About six tenths of a cell of low-pass over
the whole plate, before anything else got a chance to soften it.

```
?filter=bspline      the old one, for comparison
```

Load the plate, let it fill, then add and remove that parameter. If the new one
does not look sharper, the whole premise of the blur work is wrong and I want to
know.

## 2. Beads at 0.18 rather than 0

The plate is oil on water and the reference for the look is a dish of it —
hundreds of small dark-rimmed droplets. `beads` shipped at zero, so thirty of
the thirty-two presets had none and the only hard edges on those plates were
whatever the dye happened to make.

```
?set=beads=0         back to none
?set=beads=0.5       further than I went
```

This is a taste change across thirty looks, not a measurement. It is the one on
this list most likely to be wrong.

## 3. Sharpness, still at zero

The anti-diffusion pass had a real bug — its gate was read per channel, so where
one dye met another at the same thickness it read zero and cancelled itself,
which is the one boundary the pass exists for. Fixed. Turning it *on* did not
follow: three arms at one frame time on Fillmore gave edge fractions of 8.7,
8.3 and 8.5 percent at 0, a half and full, which is flat.

```
?set=sharpness=0.5   what the fixed pass does
?set=sharpness=1     as far as it goes
```

Watch a shallow dish for a minute at 1. The failure mode the old note warns
about is pale terraces growing out of a smooth wash.

## 4. The hosted grid ceiling, now 512²

Hosted capped at 384². The governor already measures the real frame interval and
steps down within seconds, so the cap was a safety net written as a ceiling —
and a machine that can hold 512² was rendering cells nearly three screen pixels
wide on a 1080p projector.

```
?sim=384             what hosted used to give you
?sim=512             what it gives you now
?sim=768             local only, for reference
```

If a first visit on your slowest machine stutters before the governor catches
it, the cap goes back.

## 5. Light through the dye, at half

The plate used to draw each dye as one colour at any thickness, so a thin wash
and a thick pool differed only in opacity. Light Through Dye (Lamp & Light) puts
the lamp through the dye instead: a thin wash goes pale, a thick pool deep, and
two dyes on top of each other go darker. It is at 0.5 in every look. At 1 a dense
blue goes nearly black and Galaxy loses a third of its brightness, and 0.5 is where
the depth arrived without that.

```
?set=transmission=0     the flat glow it replaced
?set=transmission=1     the whole effect
```

This changes every look, which is why it is here.

## 6. The display's neighbourhood, worked out per texel

The normal, the interface line and the gooey blur used to be worked out around
every screen pixel, about sixty-five reads a pixel a plate. They are now worked
out once per texel and interpolated, which on a frozen classic frame at 3x takes
the frame from 43 ms to 18. On frozen frames the two paths come out within one
8-bit step on most looks, with a few boundary pixels a few steps apart.

```
?derived=0              the per-pixel path, for comparison
```

If a highlight or an interface line looks faceted, softer or shifted with it
on, that is the thing to report.

## 7. Drops, not rings

`beadDrops` (Settings, Show, under Oil Beads; MIDI-learnable) turns the beads from
dark-rimmed lenses into drops of colour: each takes a dye from the look's palette,
is a lens over what is under it (see below), presses flat against
its neighbours, and keeps a smaller drop it swallowed visible inside it for
fifteen to thirty-five seconds. It ships at zero everywhere, so nothing changes
until you ask. `npm run drops` measures the field and the mask; the lab
photographed the shading on software WebGPU, which cannot say whether it looks
like oil or like sweets.

```
?set=beads=0.8;beadDrops=1       Fillmore's field, all drops
?set=beads=0.8;beadDrops=0.5     half way: rings taking on colour
```

Three things to look at. Whether a crowd reads as liquid or as candy:
after your "very cartoon like", the beads and drops were matched to
photographs and then to the optics of a projector, and you chose both. On the
plate each drop is drawn as a projector throws it: its middle upright and as
bright as the plate, and dark round its edge where the curve bends the light
out of the lens, the outer three tenths of a droplet and a hair round a big
pool. Zoom into the closeup and it is drawn as a camera sees it: a small drop
shows the plate round it upside down, a big one is flat on top, a thin dark
line at the contact. No highlight in either. How dark the edge is comes from
one number, the projector's effective aperture (NA 0.25 in `plate.ts`); the
bare lens of an overhead projector (0.08) blacks out two thirds of every
droplet, which is how the physics reads but was a field of black doughnuts in
the lab, so tell me if the edges want to be heavier or lighter. A narrower
gap (a press, or the plate's curve) flattens every drop and thins every edge,
since the gap sets where a ball becomes a pool: Clock Glass, whose glasses bow
apart in the middle, now has rounder drops there and thin-edged pools near its
rim. Zooming in, the drops change from the projector's to the camera's near
1.45x, all at once over a few hundredths of the zoom; say if that reads as a
jump. The closeup's lens is measured with the closeup's own paint
detail (cells, lacing, relief) turned off, since that is laid over the whole
frame; with it on, whether a drop still reads as a lens is for your eye. This changes the rings in every look
that has beads, not only the drops. And the frame time: the drops' mask
is drawn a pixel at a time on the main thread: about 15 ms for the crowd of
about 530 with droplets and curved walls (11 to 12 with straight ones), against 6.7 ms for the 330 without them and the
rings' canvas at 3.9, in the sandbox's Chromium. If
`frameMs` climbs with it on, that is the number to report.

Merges now take time. Two drops that run together become an oval along the
line they met on and round off in a time that goes as the cube of their size
(half a second for a four-cell drop, a few frames for a two-cell one). That
constant (`MERGE_TAU_S` in `beads.ts`) is chosen, not measured: real oil under
glass rounds in milliseconds at these sizes, too quick to see, so say if the
ovals linger too long or not long enough. In the closeup the camera's lens
was written for round drops; in the lab's picture of a freshly merged oval
(merged-drops-stretched.png in the project's files) the view through it came
out as two bright lobes side by side until it rounds, so say if a drawn-out
drop's lens reads wrong.

New drops are now born at log-normal sizes, the law for a shaken emulsion
(`dropRadius` in `beads.ts`). The plate holds the same amount of oil and the
same biggest and smallest drops as before; what changes is that most drops
are near one size, about a cell and a quarter, where before the smallest
size was the commonest: there are about half as many of the smallest drops. It is a small change and may not
show at a glance. Look for whether a crowded plate reads as one emulsion
with a typical drop, or as too even, too much the same size; the spread
(`DROP_SIGMA`, 0.7) is already at the wide end of what the research gives.

## 8. The closeup's cells, riding the paint

At about 6x the closeup's drawn cells and lacing used to shake: they slid by
the flow times the frame's own measured time, and a browser's frames are never
quite equal. They now slide on a clock the solver's steps advance by exactly as
far as they move the dye, so on steady paint they should sit still at any
zoom. They also now go at the paint's speed: before, at the default Speed they
lagged at about a quarter of it on a 60 Hz screen and half on 120 Hz, and on
fast looks raced ahead of it several times over. A faster pour now cycles its
cells faster; at the default Advection they breathe at the pace they did.
The plate's own cells at 1x are untouched, and now slide in over the first
notches of the zoom instead of jumping when it leaves 1x.

Push in to 6x and past on a filled plate, with and without music. What to
report: any shimmer still there; whether cells now stretch or smear more in a
swirl, since keeping up with the paint means about four times the slide they
had at the default Speed on a 60 Hz screen; and on fast, changing paint
whether the cells hop. The solver keeps its velocity in half float, and on the fastest paint a
changing flow crossing one of its steps can still hop the cells by about a
frame's travel (`npm run cellride` prints it); if that shows, the fixes are a
full-float velocity or shorter-lived cells when zoomed in.

## 9. Bubbles as air pockets

The bubbles were drawn as a camera with a front light sees a soap bubble: a
bright crescent, a white highlight, film colour round the rim. The research on
bubbles and drops found that a bubble between a projector's glasses is none of
that. It is a pocket of air, and its curved edge bends the lamp's light three
times as hard as an oil drop does, out of the projection lens. So on the plate
a small bubble is now a dark disc round a pin-point of light, and a big one a
clear, flat window edged in a dark band about two cells wide, narrower when
the glasses are pressed. No highlight unless the second lamp is on, and no
film colour at the default Iridescence; the looks that set it higher (0.6,
0.9) still get a soap film over the window. Below the default the plate's
bubbles have none at all, so on the plate Iridescence now does something only
from a quarter up (the closeup's bubbles still use the whole range). Zoom into the closeup and the
bubbles are the camera's again, shine and film as before, changing over near
1.45x as the drops do. `npm run airlens` measures it on one bubble.

```
?set=bubbles=0.6              any look, bubbles on
```

Three things to look at. Whether a field of small bubbles reads as air in
liquid or as pepper: the physics says small ones are nearly black, and that
is how air reads in footage of real projected shows, but the same effective
aperture as the drops sets how dark (`AIR_DARK` and `DROP_NA` in `plate.ts`),
so say if they want to be lighter. Whether the big bubbles' band reads as an
edge or as a cartoon outline; its inner edge is sharp to a pixel, as a
focused projector draws it. And on a pressed plate, the band is drawn two or
three pixels (at 3x) wider than the gap says, since it is then thinner than
the air field can place (`npm run airlens` prints it). This changes the
bubbles in every look that has them.

## 10. Maze Detail, and Ferro Maze at 0.5

The Labyrinth's fingers can now be up to three times finer (Maze Detail), and
Ferro Maze uses 0.5, about half the old finger width. It has only been seen in
the lab, on software WebGPU at 512². Two things to look at. On the hosted site
(512²), Ferro Maze and Maze Detail pushed to the top: past about 0.6 the
slider does nothing there, and right at that point some half-formed fingers
draw as brown film rather than black. On a local run (768² or 1024²), the
full range: whether the finest maze stays black and solid, with no grid
printed through it, since the maze's force per cell is strongest there and
`npm run maze` only measures 512². What to report: the setting where it
starts to look like the references, and any shimmer or brown haze.

## 11. Film Physics

The film colour (Thin Film, and the bubbles' Iridescence) can now be a real
soap film's instead of a rainbow (research item 8; `lib/filmTable.ts`). It
is 0 by default, so nothing changes until it is turned up.

```
?set=thinFilm=1;iridescence=0.9;filmPhysics=1;bubbles=0.6
```

Three things to look at. In the closeup, whether a bubble's gold-to-olive
film (film-bubble.png in the project's files, bottom right) reads as soap or
as dirty; the rainbow was never grey and a real film often is. On the
plate, the projected bubbles lose their film almost entirely, a pale grey
window with a faint blue: that is what a projector throws through a film,
so say whether the plate's Iridescence should keep a rainbow anyway (the
setting can be left below 1 for a mix). And on Thin Film looks, whether the
dye's thin edges show the black film and the straw and purple bands, or
wash out; the film's thickness is read from the dye amount and does not
drift with time as the rainbow's hue did.

## 12. Ferro Paint's colour pushed by the black

Pushes Dye (Ferrofluid, under Phase Edge) is on full in Ferro Paint:
where the black grows the colour leaves, and it packs as a bright line along
the black's edges instead of sitting still under it. Seen only in the lab,
on software WebGPU at 256². Two things to look at: whether the packed edge
reads as the references' colour pushed into cells, or as a coloured outline
drawn round the black; and, on a look with a lot of ferrofluid poured on
dye, whether colour visibly seeps out of a pool for the first seconds.

```
?set=phaseDisplace=0    the black over still colour, as before
```

## 10. No grating over the dye at 2.8x

Red Cabbage at 2.8x drew a fine blue and white lattice over the violet: a
checkerboard one grid cell across, seen along its diagonal, which the dye kept
because a look with no diffusion had nothing to take it out and the closeup
stretches thin dye's contrast about ten times. The dye now loses that one
pattern (`dampGrid`, 5% of it left after a second) in every look whose
diffusion does not already remove it. Measured only in the lab (`npm run
grating`), which never drew the lattice itself: the app's frames cannot be
read on software WebGPU. Two things to look at, on Red Cabbage and one other
look with no diffusion (Diffusion Rate at 0), at 2.8x and above:
whether the lattice is gone, including on dye that has sat still for a minute;
and whether the finest diagonal wisps look softer than they did (texture four
cells across keeps 81% over a second, so a slow softening of the very finest
diagonal detail is the price, if there is one to see). And the cost: the pass
is new work on every step of those looks, not yet timed on a real GPU.
`npm run stages` (or `?stages`) times each stage, `dye grid` among them; its
milliseconds on Red Cabbage at your usual grid are the number to report.

## 13. The Mixer

The Mixer (the Perform desk's Mixer button, Settings → Mixer, the phone's
Mix button) orders the LED ring, both plates, the film and the logo, and
grades each. The lab measures that each move changes only where that
source is and that each grade does what it says (`npm run mixer`); it
cannot say whether the choices are the useful ones. Three things to look
at, with a film and a logo loaded on a two-plate look: the film moved
under the back plate (does it read as the film *between* the glasses, or
just as a dimmer film?); the LED ring raised above the front plate (a beam
screened over the plate, the plate lit by the plain lamp: is that a look
you would use, or should the beam go over the film too by default?); and
whether 0–200% is the right travel for brightness, contrast and
saturation on a projector, or too much at the top.

The gel wheel and the lumia are rows too (PLAN.md §11 step 2). Two more
things to look at: the gel raised over the front plate, a filter on the lens
that multiplies the picture by its colour at the same density as over the
lamp (is 1.5 the right gain there, or does it burn the dye out?), and the
lumia raised over the front plate, a beam screened over the dye (does it
read as a second projector, or as fog?).

Each row but the front plate has a blend now (PLAN.md §11 step 3): Own (the
way it always came in), Screen, Add, Multiply and Key, in the row's Grade
drawer. The lab holds each to its formula; what it cannot say is whether the
key's edge (a row's dark dropping out between luma 0.18 and 0.36, where Film
Key starts, and on the film at Film Key itself) is the right place on a real film, and whether Add over a
bright plate blows out too soon to be useful on a projector.

Each row has a take button and a fade time in bars now (PLAN.md §11 step 4).
`npm run rowfade` holds the curve and `npm run phone` watches the front plate
walk out on a phone; what neither can say is how a two-bar fade of a real
film looks on the wall at 60 fps (is smoothstep's slow start read as a late
start on a projector?), and whether a film filmed with the tool (`film.yml`,
by hand) coming in from a pad shows no hard cut in its motion table.

## 14. Oil & Water as two bodies

Oil & Water now pours oil as bodies that keep their own colour (Oil Bodies,
roadmap §I): amber oil drops round up on teal water, merge when they touch,
and carry their colour when they move, and teal does not creep into them.
Seen only in the lab on software WebGPU (`npm run bodies`); the app's frames
cannot be read there. Things to look at, on Oil & Water:

- whether the drops read as oil on water, bodies with an edge, or as
  coloured blobs drawn on top;
- whether their rims are clean or show a fine radial hatching where the flow
  shears them (the lab showed a faint one);
- two drops that have just merged: in the lab a faint seam where their
  rims met stays inside the body for a few seconds before it fades; say
  whether it reads as two oils blending or as a line drawn inside;
- dragging a finger through a drop: it should go with the finger and keep
  its colour;
- after a few minutes of pouring: the pours stop adding oil once the bodies
  cover about a third of the plate, and you should see that as the plate
  filling, not as the oil stopping at an odd moment.

Every look with Oil Tension (Oil on Water among them) also has the rebuilt
surface tension: a drop rounds in about a second and should no longer go
dark inside. Say if Oil on Water looks different from before in any other way.

```
?set=oilBodies=0      Oil & Water as it was, one dye
```

And the cost: the bodies add several passes to every step of that one look,
not yet timed on a real GPU. `npm run stages` (or `?stages`) times each stage;
`bodies` and `advect dye` on Oil & Water are the numbers to report.

---

## 15. A press goes down round and lifts into fingers

Fingering used to draw its spokes while the glass went down; now the press
goes down round and the spokes come as it lifts (`npm run lift` measures it
in the lab). Worth looking at:

- the Press tool held on Fillmore East, 1969, then let go: a round disc with
  a bright rim while held, and fingers running in from the rim over about a
  second once the hand is off;
- two fingers on the phone with the Press, one let go while the other
  holds: the one let go should lift into fingers where it was;
- Beat Squeeze, new: until now it never reached the plate (its press landed
  a fraction of a cell off the grid), so every look with music playing
  changes. On Fillmore East, 1969 and on a default look with the band
  playing (Sound → Simulated), each kick should press the big dish, the dye
  spreading out in a ring and settling back within half a second, with
  at most a faint ripple at the rim as it lets go (the big sunburst is still
  a hand's); the middle of the dish should
  never go flat black. Too faint, too strong, or the plate pumping instead
  of breathing are all worth a word (PLAN §10 step 4);
- Crowd Plate with someone standing still and then walking off.

```
?set=fingering=0      the press as a plain round squeeze, no fingers at all
```

## 16. The iPhone app, and switching it to the laptop's remote

The app (PLAN.md §12) is the website's build inside a Capacitor shell. It has
never run on a phone: CI only compiles it for the simulator. On the Mac, with
Xcode 26 and the iPhone plugged in, `npm run ios` builds the site, copies it
into the app and opens Xcode; pick the phone, sign with your Apple ID (a free
one is enough for your own phone) and press Run. Worth looking at:

- the plate as it played in Safari: same looks, fingers, frame rate. The app
  starts on the website's quality ladder (512² at most), not the laptop's;
- the microphone: Sound → Mic asks once, the plate hears the room, and music
  still comes out of the speaker, not the earpiece, while the mic is on;
- the screen does not dim or lock mid-set, and the status bar stays hidden;
- More › Laptop remote, with `npm run remote` running on the laptop: paste
  the Phone line it printed (or type the laptop's address and the key). iOS
  asks once to find devices on the local network; say yes. The remote
  should say Linked and drive the laptop's show. Play here goes back to the
  plate; More › Laptop remote again goes straight back to the same laptop;
- Record: known not to save yet (PLAN §12 step 5).

## 17. The back plate's own look

PLAN.md §16a. On the desk, cue a look with two plates in mind (Oil & Water on
the front, say), press Go, then cue a different one (Boiling Point, Ferro
Paint) and press **To Back Plate**. Worth looking at:

- over the fade, the back plate's liquid changes how it moves and what colour
  it pours while the front keeps its own; nothing cuts, and the front does not
  thin or re-lay;
- the Mixer's Back Plate row says "On" and the look's name; grading it and
  moving it in the stack behave as before;
- a Go on the front (and a cut from the preset strip) leaves the back plate on
  its look;
- **Follow Front** fades the back plate back into the front's twin; on a
  one-plate front look the back plate goes when that fade lands;
- the same from the phone: the looks sheet's Back plate switch, then a look;
- whether two looks on two plates read as two projectors or as a muddle is
  the judgement this is for.

---

## 16. The Magnet pulls a pool out in fingers

A pool bigger than the spikes' reach used to stay a round blob past them
under the Magnet tool: on Magnet Garden what it pushed out thinned to a grey
the plate does not draw. Now, on the looks with a Labyrinth, the edge goes out in black fingers round the magnet,
the sunflower in the references (PLAN §9i; `npm run fingers` measures it in the
lab). Worth looking at:

- pour a big pool on Ferro Paint, Ferro Maze and Magnet Garden and hold the
  Magnet over it for five seconds: spikes in the middle, thin black fingers
  with round tips running out all round, each about as wide as the gaps;
- drop ferrofluid on Classic and do the same: it should gather under the
  magnet as before, with spikes and no fingers (PLAN §9o);
- let go: the fingers should stay where they are and slowly round off, not
  spring back into a disc;
- the same with two fingers on the phone, one over each of two pools;
- on Magnet Garden, drag the Magnet slowly: the pool should still follow it
  (PLAN §9l).

```
?set=ferroLabyrinth=0.8   what Magnet Garden's own field adds to the hand's
```

---

## 17. Blow and Finger move the ferrofluid

They used to leave it where it was (PLAN §9n; `npm run ferrohands` measures
the carry in the lab). Worth looking at, on Magnet Garden or Ferro Paint:

- a Finger drawn through a pool drags a tongue of ferrofluid along with the
  dye, and the pool closes behind it;
- Blow held over a pool opens a hole under it; moved across, even slowly, it
  pushes a tongue of ferrofluid ahead of it and does not leave a row of holes;
- with Automation on, the ferrofluid stays put between hands (only a hand
  carries it);
- the same on the phone, with a finger on Finger or Blow; a finger on the
  Magnet is still a magnet.

## 18. The Press on oil (PLAN 15d)

A press used to push the colour out of an oil body and leave the oil where it was,
clear, with a ring of the body's colour in the water round it. Now the oil goes with
its colour, out onto the same ring, and the colour goes straight out from where it was
under the palm instead of evenly round the whole ring.

On Oil & Water (Oil Bodies on):

- press and hold on a body: the body should thin under the palm and its colour and
  its oil go out together, the ring amber where the body was, teal where the water was;
- press with the palm half over a body's edge: the oil and its colour should go out
  on the body's side only, and the water's side stay the water's colour;
- press near a corner: nothing should vanish at the edge;
- on Classic (no Oil Bodies), a press should still clear a ring the way it did, now
  going straight out: a stripe under the palm should come out as a stripe, not a smear
  round the whole ring. Say if the old even ring looked better.

## 19. Thin Gap: the plate as a thin layer of liquid (PLAN 18a)

Every look moves by a speed clamp: whatever pushes the liquid, it is cut back to
one small speed at the end of the step, so a push lasts one frame. Thin Gap
(Settings → Squish Plate, under Depth Drag) replaces the clamp with the drag of two
glasses a few millimetres apart: a push lasts as long as the liquid and the gap say.
It is off in every look, and nothing changes until you turn it on. `?set=thinGap=1`
turns it on for a page load.

On Classic, then Oil & Water, then a look with a Plate Shape:

- turn it on: the plate should keep moving the way the look moves, not freeze or
  race. The first time in a show it takes a few seconds to switch (its pipelines are
  built then, off the frame), and there should be no stop while it does. Say if the look's stirring now reads as too strong or too weak;
- Finger through the colour at Thickness 0 (water), 0.45 (the default, a light oil)
  and 1 (glycerine): in water the liquid should keep sliding for a second or two
  after the finger stops; at 1 it should stop the moment the finger does;
- Press and hold, then let go: the colour should be pushed out by the press and drawn
  back in when the glass lifts, and under the press the colour should pale (less
  liquid between the glasses there) and come back as it lifts. At the dish's edge the
  liquid should go out of the dish, not bunch up against it;
- on a look with Plate Shape up: where the glasses are tight, the colour should
  move slower than where they are open;
- the frame time with it on and off: measured on the Mac GPU (`npm run stages`, 2026-10-07, PLAN 18a-11):
  At 768²:
  - Thin Gap off: 31.7 ms a solver step across both layers (16.5 ms Layer 0, 15.2 ms Layer 1), 20.4 steps/s, 50.4 ms/frame.
  - Thin Gap on: 67.8 ms a solver step (51.1 ms Layer 0, 16.7 ms Layer 1), 11.4 steps/s, 90.6 ms/frame.
    Thin Gap projection (~7.1 ms/layer) costs about the same as the incompressibility projection it replaces (~6.7 ms/layer). The difference is Layer 0's conservative height-advected dye transport (36.1 ms vs 1.3 ms).
  At 512² (the hosted grid ceiling):
  - Thin Gap on (steps=60): 19.7 ms a solver step (12.7 ms Layer 0, 7.0 ms Layer 1), 32.8 steps/s, 33.4 ms/frame (30 fps).
  - Thin Gap on with H2b (steps=30): 14.95 ms a solver step, 27.5 steps/s (92% speed), 19.2 ms/frame (52 fps).
  Thin Gap runs smoothly on the hosted ceiling and requires no look turned off;
- the same on the phone (Settings → Squish Plate → Thin Gap), and a MIDI pad
  learned to it.

---

## 19. A held Drop with Drop Height up drops six times a second, not every step

The held Drop's clock stayed at zero on frames of one solver step each, so with
Drop Height up it let go of a splashing drop on every step (sixty a second at the
display's rate) until a frame happened to owe two. It now drops as the finger lands
and then every tenth step. Only Bass Drop (Drop Height 0.9) and Boiling Point (0.7)
ship with it up, so those two look different under a held Drop now:

- hold the Drop still on each for two seconds: a beat of separate drops, each with
  its own splash and ring, where it was a near-continuous gush;
- the pool should be about a tenth of what it used to be for the same hold. Say if
  the old gush was the look you wanted on either, and it can be a setting instead.

## 20. The fingering push taken out (PLAN §0)

Classic drew stripes a few cells across over its pools, and after a while red dots
in a lattice with labyrinths between them. It was a push, set by Polarity, that
moved the dye along its own slope by a slow noise, and ran diffusion backwards
through the inside of every pool. It is gone, on every look.

On Classic, and on Velvet Underground on the iPhone (where it drew a fine
crosshatch pinned to the grid), and one other look with Polarity up and Blob
Surface Tension low (which made the push strongest):

- leave it for ten minutes or more: no stripes, dots or labyrinths inside the
  pools, and the plate should hold its dye rather than thin out;
- watch a pool's edge: the slow pushing out and drawing back the push added is
  gone. Say whether you miss it; real fingering, from a lift or a pour, is the
  plan's next step for it, not a noise;
- the Finger through a pool: it should carry the dye and not seem to add any.

## 21. A projector picks its source

PLAN.md §16b. With a projector (or a second window) on, open Settings,
Mapping, add two rectangles side by side, and set one's Source to **Front** and
the other's to **Back**, on a two-plate look (Classic). Worth looking at:

- each rectangle carries one plate, and the two are the same liquid, turned
  opposite ways, moving together;
- **Film** on a surface with a film playing shows the film alone, graded as
  the Mixer's film row is, with none of the plate's liquid in it;
- the logo is on the front plate's projector and not the back's;
- grading a row in the Mixer (the back plate's brightness, say) changes that
  plate on its own projector as on the wall; the dimmer and a blackout take
  every projector down;
- the frame time with two or three sources on against one (`chromaglassDebug()`,
  `webgpu.timings`: `plate`, `plate front`, `plate back`, `plate film`);
- whether two plates on two projectors, overlapping on a wall, read as a light
  show's two projectors is the judgement this is for (16c makes their overlap add).

## 22. Colour between the domes

The Magnet's domes used to stand in a dark amber film (PLAN §9f; `npm run
domes` measures it in the lab). Worth looking at, on Magnet Garden with the
Magnet pressed under a pool:

- the gaps between the domes show the dye's own colour, not a brown film;
  they are still narrow near the middle of the pool (PLAN §9t);
- no seam or grid in the dye where the pool was, and the dye does not fade
  under the pool over a minute of holding;
- the same with a finger held on the Magnet on the phone.

---

## 23. The Press on the ferrofluid (PLAN 15d)

A press on a pool of ferrofluid used to turn it a brownish grey under the palm and
leave it the size it was. Now, with Thin Gap on (Settings → Squish Plate → Thin Gap),
a pool pressed between the glasses stays black and spreads, the way a drop of paint
does between two plates, and draws back to its own size when the glass lifts. With
Thin Gap off nothing has changed.

On Ferro Paint, then Magnet Garden, with Thin Gap on:

- press and hold on a pool: it should spread out under the palm, black all the way,
  not grey, and stay spread while you hold;
- let go: it should shrink back to about the pool it was over the next second;
- press a pool with a ragged edge, at the default Thickness: its edge should push
  out into the clear liquid in fingers rather than a smooth round front (the
  ferrofluid is thinner than the default liquid). At Thickness 0 (water) the same
  press should spread it rounder. Say if either is too weak to see;
- hold the Magnet under a pool and press over it: the pool should still answer the
  magnet, more slowly where the glass is down. The spikes under the palm do not yet
  flatten (they should; PLAN 15d's open items);
- with Thin Gap on, the ferrofluid now has its own viscosity in the gap, so the pool
  answers the magnet faster at the default Thickness (about four times) and slower in
  water (about five times). Say if either feels wrong for the liquid it is in;
- the frame time with Thin Gap on, in a ferrofluid look (`?debug`,
  `status.frameMs`): the ferrofluid's carry now runs six substeps under Thin Gap
  where it ran fewer before, plus one small pass. Say if the governor steps down;
- the same on the phone: Thin Gap on the settings sheet, a finger on the Press.

## 24. Beams, and tiles with no seam

PLAN.md §16c. In Settings, Mapping, two rectangles overlapping by a fifth,
both with Light on **Add**:

- one on **Front** and one on **Back**: where they cross is brighter, both
  plates at once, and reads as two beams meeting;
- both on **Wall**, each showing its own slice (Its own slice): the join
  should vanish, no brighter band and no darker one, and the picture carries
  on across it;
- a little Edge on each: the outer edges soften and the join stays invisible;
- whether the overlap of two plates is a light show's overlap is the
  judgement this is for.

## 24. The ferrofluid stands up in domes (PLAN 9t)

Under the hand's Magnet the ferrofluid used to pack into a black disc studded with
drawn-on spikes. Now the pool stands up into separate black domes with the colour
showing between them, because the plate keeps the ferrofluid's volume under the
magnet rather than its area: a dome rising takes its liquid from round it.

On Magnet Garden, then Ferro Paint:

- hold the Magnet still under a pool for four seconds: the pool should part into
  round black domes, about a fingertip apart on the projection, the dish's colour
  between them, a white point on the top of each. Say if they come out as bars or
  worms instead, or in a cross along the screen's axes;
- the domes start about a second and a half after the magnet arrives. A real pool
  stands up faster: say if the wait reads as wrong (PLAN 9t-4);
- let go, or turn the Magnet's strength down: the domes should sink back over a
  second or two. Held long enough to part the layer to the glass, they leave puddles
  that join slowly rather than one pool at once; say if that reads as wrong;
- move the Magnet slowly: the domes ahead of it rise as it arrives, those it leaves
  sink back. They do not slide along with it (the magnet's pull is not in the film
  yet, 9t-2);
- a big pool (Magnet Garden's pour) under the Magnet: domes in the middle, the
  fingers past them at its edge (9i), as many as before the domes (in the lab
  9/12/9/5 on the fingers check's circles, against 12/9/9/3 before). Say if the
  pool's middle reads as a patch cut out of it, a ring round the domes where the
  fingering starts;
- the Magnet no longer draws the fixed ring lattice of stars over the pool (the grid
  the owner saw during shows): the domes are the liquid's own, wherever it stands;
- the frame time with the Magnet held (`?debug`, `status.frameMs`), and on the
  phone with three fingers on the Magnet: each finger runs its own patch of the
  film (9t-6). Say if the governor steps down;
- the same on the phone: each finger on the Magnet raises its own domes.

---

## 25. The Magnet: it moves only the ferrofluid that is there, and its Size (PLAN 9x, 9y)

On Classic (a look with no ferrofluid), desk and phone:

- pick the Magnet (M, or its button): the plate should not change at all;
- touch and hold on the bare plate: nothing should appear. The Magnet brings no
  ferrofluid (the owner: "it should only work on ferrofluid that is already
  there");
- pick the Ferrofluid bottle and drop some with the Dropper, then pick the Magnet
  and hold it over the drops: they should stand up into spikes; drag, and they
  should come with you;
- right-click the Magnet on the desk (or tap it twice on the phone) and move
  Size: a small magnet raises a few spikes under the fingertip, a big one a wide
  hedgehog and pulls more gently from further off. Say whether the range is right
  at both ends;
- a pool still reads as a black disc with domes round its rim, not domes with
  colour between them. That is the standing-domes work (PLAN 9t), not this.

---

## 26. The Mac app, on the Mac and on a projector

The app (`desktop/`, PLAN.md §13 step 1) is the website's build and the show
server in one Electron app. CI opens the packed app on its Mac runner and
measures it (`npm run desktop`): offline, a lit plate, OSC, a projector with
no click (a stand-in second screen), and quitting. What only a real Mac with
a real projector can say. Get it from Actions → *Mac app* → *Run workflow*,
or `npm run mac-app`; `desktop/README.md` has the first-launch steps.

- Wi-Fi off before opening it: the show opens and plays, and the music
  shelf plays its songs;
- the plate at 60 fps against the same look in Chrome (`?debug`'s
  `frameMs`): the app is the same Chromium, so a difference is a finding;
- a projector plugged in *before* opening: the show is on it in full screen
  with no title bar and no click. Unplug and plug back in: it comes back.
  Settings → Wall → Ask: the chip is back, and Auto again sends it;
- the laptop window covered by another app, and minimised: the wall keeps
  moving, and the sound still moves it;
- Show → Show Server Details…: the phone's address works, the key is the same
  after quitting and reopening, and a phone linked before the restart
  relinks by itself;
- OSC from Resolume or TouchDesigner to UDP 9000, and Art-Net if the rig is
  there;
- the MIDI controller: works with no prompt;
- the lid closed with the projector as the only screen: the show stays up;
- the projector's full screen is macOS's own. With System Settings → Desktop
  & Dock → "Displays have separate Spaces" off, a full-screen window takes
  every display, so the laptop's screen may go black too. Say which it is on
  your Mac; if it does, the app should use a borderless window over the
  projector's screen instead.

## 27. Roy, 1963: the plate printed as a comic (PLAN 21)

Pick Roy, 1963 (a Light show look). The picture should read as a Lichtenstein
panel: flat red, yellow and blue on white, a black line round every solid shape
and where two colours meet, and the pale washes round the shapes as even dots.

- are the dots the right size on the wall (32 rows down the picture), and the line
  heavy enough? Say if either wants to be bigger or smaller;
- does it hold up moving: do the dots sit still while the colour slides under them,
  and does the line stay a line, not a flicker, as the shapes move and merge;
- Ben-Day Dots (Settings → Look) from 0 to 100 % on Roy, and on Classic: is there a
  point between where it looks better than either end;
- zoom in to 2.8x: the dots stay the size they were (PLAN 21c). Say if you want
  them to grow with the zoom, as the accidental ones did.

## 28. Spinning the dish (PLAN 22)

Nothing on the laptop has seen the dish spun with the liquid lagging behind it: the
lab measured the swirl (`npm run dish`), not the picture. On the Mac:

- the Spin tool (N): drag round the middle. The glass should go round with the
  pointer, coast when you let go and stop when you hold still. On Classic (thick)
  the picture should follow almost at once; on a thin look (Viscosity thin) the
  liquid should visibly trail the glass for a couple of seconds, then catch up;
- press (P) and hold with a spinning dish: the liquid under the palm should go round
  with the glass while the rest lags, a whirl round the palm;
- on Oil & Water, spun: the oil bodies should go round with the glass and the water
  between them lag, and after a while of spinning hard (Spin Rate 30 or more), the
  heavy dye should creep outward and the oil in;
- Auto Spin at Rate 6: a slow, even turn; Reverse Spin turns it back through a stop,
  not a jump;
- Auto Spin at Tempo, 16 beats a turn, with music: the dish should turn once every
  four bars and stay with the music; a flick with the Spin tool knocks it off and
  it should come back to the beat within a bar or two, not settle somewhere new;
- the phone: the Spin tool with one finger round the middle, and Auto Spin on the
  Play sheet; the remote: the Spin pad, and the Auto Spin and Spin Rate sliders.

- the look's own turning on the same dish (PLAN 22h): flick a thin look (Galaxy,
  Acid Trip, or any look with Viscosity thin) with the Spin pad or a flick on the
  phone's Play sheet: the glass goes round at once but the picture should stay put
  for a moment and catch up over about three seconds; on Classic (thick) it goes with
  the glass. Then play music on the nine thin looks with music routed to rotation
  (Galaxy, Cyberpunk, Acid Trip, Timbre Shifter, Boiling Point, Aurora Borealis, Solar
  Flare, Fractal Dream, Stardust Collapse) against the last deploy before this one:
  their sway is now through the water (within 2° of where it was) and the swirl runs
  while they play. Say if any of them reads worse, and whether the frame rate dropped.

- the look's motor without its stir (PLAN 22j): the Rotation Speed dial used to stir
  the middle of the plate round as well as turning the dish, a swirl fastest at the
  centre and still at the rim, so the middle wound itself into a spiral. The stir is
  gone: a dish turning steadily drags its liquid round with it and then nothing in
  the liquid moves against anything else. Each look's dial was turned up so its dish
  turns the liquid in view about as fast as the stir did, but now the whole picture
  goes round together, rim included. Against the last deploy before this one, watch
  the ones that moved most: Acid Trip (a turn every 20 s now), Cyberpunk and Stardust
  Collapse (about a minute), Boiling Point, Timbre Shifter, Solar Flare, Fractal Dream
  (three to five minutes), and Galaxy and Classic, which turned so slowly the change
  is mostly the spiral that is no longer wound. Say which ones lost something they
  need: a real way to wind the middle against the rim is a second, smaller glass
  turned against the dish (PLAN 22l). Quiet bars no longer turn a music look's dish
  backwards (the band's sway still does when it is playing).

Say if the lag is too long or too short to read as a liquid, and whether the swirl a
press makes is visible or wants more.

```
?set=spinAuto=1;spinRpm=12     a dish turning at 12 rev/min, anticlockwise
?set=spinAuto=2;spinBeats=8    a turn every 8 beats of the music
```

---

---

## 29. Blow's wind (PLAN 15c)

The Blow drawn across the plate used to wipe a trail out of the colour. Now it
pushes the colour along and keeps it. On Classic, with a pool laid:

- draw the Blow slowly through the pool: a tongue of colour should be pushed ahead
  of the hand and pile up where it stopped, with no dark trail behind it;
- stop and hold: the straw's bubble should start within about a sixth of a second (a
  little later on a machine drawing under 20 frames a second), a drag should no longer
  leave a string of small straw bubbles behind it, and a drag should not start with a
  bubble where it was pressed;
- on the phone, hold one finger (the straw) and drag a second across the colour: the
  second pushes it; hold the second still and it should blow a small clear ring;
- on Oil & Water, blow across a body: the oil and its colour should go together.

Say if the wind now reads as too strong or too weak next to the Finger.

---

## 30. The Press draws the liquid back when you let go (Thin Gap, PLAN 18a), in every look

With Thin Gap on, the Press no longer moves the colour out to a ring by hand: the
glass bends into a bowl under the palm, the liquid it squeezes out carries the
colour and the oil with it, and when you let go the glass comes back up in about a
second and a half (half way, at the default Press Lift) and draws them back in.
Thin Gap is on in every look since PLAN 18a-every (#248, the owner's pick of 2026-10-03),
and in looks you saved before it. To see the old plate beside it, turn it off with
Settings → Squish Plate → Thin Gap, `?set=thinGap=0`, or on the phone on the
Press's own Amount (tap Press twice).

On Classic, then Oil & Water (Oil Bodies), then the look you play most, then the
rest of the looks you play, since every look now moves the thin-gap way and none
has been seen at 60 fps like this:

- press and hold for a second, then let go: the colour under the palm should go out
  in a smooth ring and come back in as the glass lifts, most of the way within a
  few seconds. Say if the return is too slow or too fast; Press Lift sets it (on the
  phone, "Press · glass lifts");
- on Oil & Water, the oil should go out and come back with its colour, not leave it
  behind;
- press near the dish's edge: what goes over the rim should come back over it;
- with Fingering up: the lift still breaks into the spokes, now only as the glass
  opening along them (the colour is drawn in by the flow, not pushed);
- the frame time while pressing (below): the colour's carry runs in up to 33 short
  substeps for the few steps the glass is closing fastest, and in one otherwise;
- a small pool right under the middle of the palm now spreads only a little while
  held (as a film between closing glasses does: about 2.5 times wider at a sixth of
  the gap), where the old plate threw it out to a ring; say if the press reads as
  too weak;
- every look, not only the Press: a push now lasts as long as the liquid and the gap
  say, and the rim is open, so each look's drift and stirring may read differently.
  Name any look that feels wrong, and whether it is better with Thin Gap off;
- the opening, from a cold start (a new browser profile): the show now builds the
  thin gap's pipelines before its first frame moves (PLAN 18a), so say if it opens
  noticeably later than before;
- a look you saved before this should open with Thin Gap on; one you save with it
  off should stay off.

## 31. The lamp through the dye (Lamp Ground, PLAN 18b)

Settings → Lamp & Light → **Lamp Ground** (also MIDI, the desks, the remote and the
phone's Looks sheet). At 0, as every look ships, the dye glows on black as it always
has. At 1 the lamp under the dish shines up through it, as a projector does: clear
liquid is the lamp's white, two dyes over each other darken where they cross, a deep
pool goes saturated and then dark, a gel or the LED ring under the glass shows
through the dye, and the back plate is a second filter in the light. It turns the
picture over, so it is a choice per look, not a fix: the pale lace of the reference
still (PLAN 20) can only show on it. Please say:

- ~~which looks you want on the lamp ground~~ **answered by rule (#262, PLAN 18b-1)**: eleven
  looks ship on the lamp (Timbre Shifter, Microscopic Chaos, Poster 1969, Fillmore East
  1969, Crowd Plate, Milk Marbling, Red Cabbage, Chemical Clock, Home Movie, Clock
  Glass, and Sensual Laboratory, which you found washed out on black); the gallery page linked from #262 has every look on both grounds with the
  reason for its pick. Say which you would overrule (Save Look keeps your choice); the
  dishes too dark on the lamp with their black-ground dye are PLAN 18b-8;
- whether the fade between the two (a MIDI fader on Lamp Ground) is worth playing,
  or only a setting;
- edges on the lamp: the meniscus, the boundary line, lacing and cells were drawn
  for black and are carried over as a darkening or brightening of the light through
  the dye; say if they read wrong (18e makes them from refraction instead);
- Roy, 1963 stays on black (#262): a print with its own paper, and on the lamp every
  pool printed as black ink (100% of the dish);
- a look with the chemistry (Red Cabbage, Chemical Clock, Agate) on the lamp: the
  pH, BZ and Liesegang colours are now filters in the light, so a BZ wave is a pale
  blue band through the orange with the dye still showing.

## 32. The plate's forces as forces (Thin Gap, PLAN 18a-2)

On a thin gap (every look) four of a look's forces now act as the thing they stand
for, and the rest answer the liquid's thickness. Nothing changes with Thin Gap off.

- **Rain Drip** (Settings → Squish Plate, eighteen looks set it): the colour is
  heavier than the clear liquid and falls through it down the plate, in fingers that
  grow by themselves, while the clear liquid rises between them. Before, the whole
  plate slid downhill and drained out of the bottom of the dish. Say if the fall is
  too slow or too fast against how those looks felt; it falls along Tilt Direction.
- **Glass Smear**: the glass slides over the liquid and carries all of it at half its
  speed, colour and clear alike. On an even gap that is a drift, not a shear; where
  a press or a domed plate changes the gap the drift turns. It moves the colour as
  fast as before. Say if a look misses its old smear.
- **Updraft** (nine looks): a draught dragging the liquid's surface, now on all the
  liquid, not only the colour, half as hard where the glass is pressed. It blows the
  same way Rain Drip falls, as it always has; say if it should rise instead.
- **Thickness** (Settings → Squish Plate; on the phone, the Settings tile): turn it
  up from its default and the magnet's pull, the oil's surface tension, Rain Drip
  and Updraft should all slow down as a thicker liquid would, while Turbulence (the
  hand stir) keeps its pace. Turn it down to water and they speed up. At the default
  nothing should look different.
- Vibration does almost nothing on a thin gap (PLAN 18a-2's open item); that is
  known, not this change.

## 36. The intro while the show opens (PLAN 14v)

Open the site in a private window (a cold cache) on the Mac, and once on a phone.

- From the very first moment the mark turns slowly over three pools of blue, teal
  and green, with "Warming the lamp" breathing under the name. When the desk
  arrives the intro should shrink into the plate's preview without a jump in the
  swirl, and never cover the desk's controls.
- **The swirl holds still on purpose** for a few seconds near the start, while the
  plate's drawing shaders compile (PLAN 14v-4: turning through them stopped the
  page's frames on the Mac). Say whether that pause reads as a pause or as a crash,
  and whether the desk still answers a click while it is held. Say also whether it
  freezes earlier, as Chromium starts the GPU (PLAN 14v's open item).
- When the plate is ready the intro should fade into it in about a second, with the
  plate already moving underneath; it should never sit over a plate that is ready.
- A key or a click on the intro skips it to the black plate; a click on the desk
  does not. The projector window and the phone remote never show it.
## 34. Several areas of interest: Velvet Underground, Lumia and Cell Bloom (PLAN 25a)

The owner found Velvet Underground, Lumia and Cell Bloom underwhelming, with one area of
interest. All three are now built on areas of the dish (`src/lib/plateAreas.ts`): a few places apart
on the plate, each with its own liquid and dye, where the look's hands and its music
land. Every other look plays as before.

- **Velvet Underground**, with music: three pools apart on deep violet. Top left, a
  magenta glycerine pool the mids circle; right, a raspberry well where every kick
  lands (its ring, its push and a drop of soap, which carries the colour off the
  surface into a ring); low in the middle, ultramarine syrup that glitters with the
  treble. Say whether the three stay three for a few minutes or run together, and
  whether the dark between them is too much (Dye Budget, now 0.45, sets it).
- **Lumia**, without a beat: three veils of colour in different parts of a nearly
  clear plate, under Wilfred's folded light. The light layer is unchanged; say if it
  now covers the veils too much (the Lumia slider), or if the veils are too faint.
- **Cell Bloom**: three small pools turning slowly under the magnifier on violet,
  packed with paint cells (none were drawn at its zoom before). Say if the cells
  are too big now (Cell Size, 0.6) or the pools drift out of the frame.
- The Go into any of the three and the sequencer stepping onto it should pour into
  the same places.
- **Fillmore East, 1969** (PLAN 25g): its two plates now fill the screen rather than
  sitting as two dishes on black. Say if the two plates over each other read too busy
  without the black between them.

---

## 33. The Finger drags the liquid (PLAN 15b)

The Finger used to move the colour by a hand-written carry, a little taken from behind
it and put a hop ahead, while the push it gave the liquid itself did nothing. Now it is
a solid in the liquid: what it touches moves at your hand's speed, the liquid round it
parts to let it through, and the flow carries the colour, the oil and the ferrofluid
together. It changes how the Finger feels. On Classic:

- draw the Finger slowly across bands or blobs of colour: the colour on its path should
  be pulled along it in chevrons, the way a stylus pulls marbling, and the colour a
  little to either side should bend back the other way as the hand passes;
- draw it fast, then stop: the liquid should stop with the hand within a fraction of a
  second, not coast on;
- draw it through a pool on a ferrofluid look (Magnet Garden, or any with ferrofluid):
  the pool should be drawn out after the hand into a tongue and, once the hand lifts,
  pull itself back into a rounder drop at the tongue's head;
- on Oil & Water: an oil body should go with the hand, its colour inside it;
- on a thick look (Thickness high) the drag should reach less far round the finger
  than on a thin one;
- on the phone, drag a finger across the plate with the Finger tool: the same;
- the remote's pad Finger (the phone driving the laptop): say if it stutters;
- the frame time while dragging over ferrofluid: its carry takes more substeps while a
  fast hand is down.

Say if the Finger now feels too strong, too sticky (a blob that rides along under the
hand), or not enough like a finger in liquid.

## 35. Picking a bottle pours nothing (PLAN 15i)

Picking a liquid, on the desk's shelf, the Design desk or the phone's Dye sheet, puts it
in your hand and nothing on the plate.

- On a look with no ferrofluid (Classic), pick Ferrofluid: nothing lands, and the plate
  stays as it was for as long as you leave it. Pour with the Dropper: only what you
  poured shows, where you poured it.
- Pick Oil, Soap, Milk, then a dye, each without touching the plate: nothing lands.
- With Ferrofluid in your hand, open Magnet Garden: its own ferrofluid is there as
  before. Open Classic from it, then pour one drop of Ferrofluid: only the drop shows,
  not Magnet Garden's ring coming back with it.
- After pouring some, Go to another look with a fade: no ring of ferrofluid lands half
  way through.

---

## 34. A clear film that tears into lace (Clear Film, PLAN 20b)

Settings → Oil & Soap → **Clear Film** (also MIDI, the desks,
the remote and the phone's Dye sheet). 0 in every look. Up, a clear oil film is laid
over the plate, that thick (1 is most of the gap), and it tears open by itself: thin
parts and the dish's specks of dust first, and wherever a drop of Alcohol or Soap
lands. Nothing draws the holes; they are the film dewetting. The film is clear, so
it shows as the lamp's white only with **Lamp Ground** up (§31); on black it is a
darkening of the colour, with the colour full strength in the holes. Try it on Lamp
Ground 1 over a look with dense colour, at Clear Film about 0.4 (tears in a second
or two) and about 0.9 (holds until you drop Alcohol on it). Please say:

- whether it reads as the pale lace of the reference still, and what is most unlike
  it (the holes here grow a raised rim and the film retracts into a thin network;
  the still's holes are cut clean with wide film between them, which is 20c's
  viscous film, not built yet);
- the pace: a thin film tears in a second or two and a thick one holds for twenty
  seconds and more; say if it should be slower or faster (FILM_RATE);
- the size of the holes and of the lace on the wall (they are set by the film's own
  physics on a 384² grid; at 1080p a cell is about three pixels);
- the gestures: Alcohol from the Dropper punches a hole, Oil thickens the film where
  it lands, and moving Clear Film pours more film over everything or draws it off,
  which fills the holes back in (these pours are not in a check: the lab pours
  straight into the film, not through the Dropper);
- a fade into a look with a thick film: on its way up the film passes through the
  thin range that tears over the dust, so it may arrive already torn; say whether
  that reads as a feature or a fault;
- on a look with BZ, whether the reaction's fringe looks as it did (its activator
  is now packed in eight bits to make room for the film);
- the cost on the Mac with the film on (the film is twelve small passes twice a
  frame on a 384² grid; `npm run stages` in the console, or the frame time below).

---

## 33. A click on the laptop is not a beat (PLAN 14x)

On the laptop's own microphone, in a quiet room (no music), with any look:

- Pick tools one after another, press the Speed ride and other rides, and type a
  few keys. The plate should not pulse, squeeze or ring on any of them. Before
  this, a click was heard as a kick and the plate took it as one.
- Clap once, or knock on the table away from the trackpad, with no hand on the
  laptop: the plate should still pulse. That is the microphone hearing the room.
- Then with music playing through speakers and Follow Beat on: ride a fader and
  pick tools through a chorus. The beat should carry on through the clicks.
- On the phone, on its microphone: tap tools and the Amount slider. Same as above.
## 37. More colours, and the hues between them (PLAN 18l)

Every look except Velvet Underground, Lumia, Cell Bloom, the Fillmores, Sensual
Laboratory, Clock Glass, the ferrofluid looks, Roy and the three chemistry and liquid
looks now carries five or six dyes of one family (Classic: yellow, amber, hot pink,
magenta, ultramarine, blue), and five are on the plate at once. Each dye now changes
with depth: a thin wash is a pale tint of it, a deep pool saturates, and a deep yellow
goes amber, a deep pink crimson. Where two colours meet, the mixture should walk
through the hues between them rather than switching.

- Play Classic, Galaxy, Acid Trip, Solar Flare and Oil Wheel for a minute each. Count
  the colours on the plate at once; it was two in most looks.
- Look inside a pool, rim to core: a ramp of one colour, not a flat disc.
- Where two neighbouring colours meet: a band of in-between hues, not a seam.
- If a look now reads muddy (opposite colours meeting go dark), or too pale at its thin
  edges, say which; each look's dyes are a line in `src/presetPlate.ts`.
- On the phone: the same looks show the same colours.

---

## 37. The Magnet is a real magnet (PLAN 9v)

The magnet under the glass was a point; it is a cylinder magnet now, a rod 20 mm
across and 40 mm long at the tool's own size on the 20 cm dish, and Magnet Size
makes it a wider rod held at the same gap (10 mm to 40 mm across), not the same
magnet scaled away. On Classic, desk and phone:

- at the tool's own Size the spikes should stand as far out and as tall as before
  (`npm run disc`: out to 0.157 of the plate against 0.156);
- Size all the way up: the hedgehog should be wider and the spikes taller than
  before at the same Size (on its axis 2.2 times the tool's own field, where the
  deepened point stayed at 0.95), and a pool dragged with it should stay with it
  from further out;
- Size all the way down: a few spikes under the fingertip, now weaker than the
  tool's own size (a quarter of its field), where before they were as strong;
- Ferro Maze and Ferro Paint: their own magnets were turned up (0.3 to 0.45, 0.5
  to 0.6) because a magnet's strength is now its field, whose pull far off goes as
  its square. Say whether each still gathers its ferrofluid as it did. A look you
  saved with a low Magnet Strength was not turned up: at 0.3 its far pull is now
  about a third of what it was. Say if Strength should read the old way (it would
  need a saved-look version, PLAN 9v-height);
- the frame time with the Magnet held (below): the field is now worked out from
  elliptic integrals wherever the magnet reaches, on the plate and in the solver.

## 38. Roy, 1963 opens as a panel (PLAN 21e)

Pick Roy, 1963. It should open as a Lichtenstein panel: flat red, yellow and blue
shapes and brushstrokes apart on white, outlined in black, with fields of Ben-Day
dots, and no black stain. The opening is measured (`npm run royopen`); a minute of
the show is not:

- watch it for a minute with music: do the pours and drops keep it a print, or do
  the inks run together into dark patches again? Its Dye Budget is now 0.45 (was
  0.9): say if it reads too empty, or still muddies;
- are the dot fields big enough, and is there enough colour? Say which way.
- add a green, then a purple, with the bottles: they should print as a bright
  comic green and a violet, flat and outlined, not as yellow or blue (QA-16).

## 39. Clock Glass and Ferro Paint after their references (PLAN 4a-clock)

- **Clock Glass** now lays a purple water with a dozen bodies of red, amber and cobalt
  oil scattered over the dish, each with a dark rim, the way a clock-glass dish at the
  Fillmore looked. Bodies that touch merge and mix their colours, as dyed oils do. Say
  whether there are enough of them, whether they are too big, and whether the purple
  should be another water colour. The automation's drops still land any of the dyes
  anywhere, so over a minute or two watch whether the water keeps one colour or drifts.
- **Ferro Paint** opens with amber, teal and coral in their own patches instead of
  one green. They still blur together over a minute as new drops land.
- **Oil & Water**, and any plate where oil is poured with colour already on it: the
  oil now keeps the colour that was in it when its bodies are first tracked, instead
  of letting it run out into the water. If oil you pour onto a coloured plate looks
  more tinted than before, that is why.
- Ferro Maze, Magnet Garden and Ferro Paint's maze are unchanged: still coarser than
  the references, with a brown haze. That is PLAN 9aa, its own change.

## 40. The dye's edges, on the laptop (PLAN 1a–1d)

The looks were reported as "very pixelated ... very digital" on the laptop's web app. The
largest cause was the pigment's grain thresholding every dye edge into a fringe of single
lit and dark flecks; the grain now sits inside the colour and the edges are smooth lines.
On the laptop, in the browser, full screen:

- Classic, Velvet Underground, Jellyfish Bloom, Oil & Water and Colorful Cosmos: look
  closely at where one colour meets another or the dark. The edge should be a soft line
  the way a liquid's is, with no crawling dots along it, and the colour inside should
  still have a fine pigment texture (the Granulation control turns it up and down);
- say whether any look still reads as "digital", and where: a regular grid of dots
  (Agate's rings are one, PLAN 1b), blocky steps along an edge, or the picture soft and
  upscaled overall (PLAN 1c);
- with `?debug`, run `chromaglassDebug().engine` in the console after half a minute on
  each: it says which grid the laptop settled on (`WebGPU · 512² · 1.5x` is the top).
  On CI's Mac every look settled on 256² (PLAN 1d); if yours does too, say which looks.

## 41. The magnet's thin fingers (PLAN 9ab)

A finger the magnet pulls out thinner than the plate's grid used to be drawn as nothing,
because the plate draws only past the ferrofluid's half-full line. Now it's drawn as thin
ferrofluid: brown where it's thin, near black at two-fifths full. On Magnet Garden and
Ferro Maze, desk and phone, hold the Magnet close to a pool's edge:
- the fingers should run out to their thin tips and fade to brown there, not stop short
  with bare dye beyond them (`npm run fingers`: 13 fingers 0.12 out, where 2 used to be drawn);
- the edge of a thick domain should stay a razor line with no brown smudge round it;
- say whether Ferro Maze's haze between its domains (PLAN 9aa) reads browner than before.
  The haze is the same ferrofluid under half full, so it is drawn by the same rule.

## 42. Each poured liquid as thick as it is (PLAN 18d-1)

Glycerine, syrup, milk and alcohol now carry their real viscosity into the flow. Glycerine is
fifty times the default clear liquid, syrup five, and milk and alcohol are thinner than it.
Before, all four were one "body" number that dragged a little. Pick Glycerine, then Syrup,
and drop them with the Dropper (desk and phone) on Glycerine Drift, Deep Ocean, Aurora Borealis, Velvet Underground and Lumia:
- a drop of glycerine should sit and crawl while the plate's flow goes round it, not ride
  along with it (`npm run thick`: a pool of it falls at 0.049 of a pool of colour);
- syrup should do the same, less strongly;
- on a thick look, a drop of syrup should run ahead into the liquid round it;
- milk (Galaxy, Jellyfish Bloom, Poster 1969, Milk Marble, Roy) is now as thin as milk really is.
  Its edge still holds, through its own "repel". Say if those looks lost a slowness you liked.

## 43. A pour is liquid, and glycerine stays until it is flushed (PLAN 18c-1, 18d-2)

Every bottle you pour now adds liquid to the plate: on a thin gap (every look) it pushes
what is already there out of its way, and what reaches the rim leaves the dish. A held
bottle lets go as a squeezed dropper does, half a millilitre a second. And a poured liquid no longer fades: glycerine
stays thick until clear liquid poured after it has pushed it out. On the desk and the phone:
- hold the Dropper of Water in the middle of a colourful plate (Deep Ocean, Aurora Borealis):
  the colour round it should be pushed outward into rings, slowly, as water dropped into a
  real dish pushes it (`npm run flush`: a ring moves out by 1.006 of the volume poured);
- drop Glycerine on Glycerine Drift, wait a minute: the pool should still be thick (before,
  it had thinned to a third in 22 s). Then hold Water in its middle: the glycerine should be
  pushed out into a ring and the middle run free again;
- leave Glycerine Drift, Deep Ocean, Aurora Borealis, Velvet Underground and Lumia running
  ten minutes each: say if any goes stiff and stays stiff (the automation stops pouring
  glycerine at 0.3 of the dish, and only its water and soap pours flush it, PLAN 18d-2a);
- say whether the push from a held bottle is too weak, too strong, or right (PLAN 18c-5).

## 44. Each liquid in its own colour, and a dye in it (PLAN 18d-12)

Each bottle now pours what the liquid itself looks like until you pick a dye for it: Syrup
amber, Oil a pale gold, Ferrofluid black, Milk white, and Glycerine, Alcohol, Silicone,
Soap, Acid and Base clear. Water still comes with a blue dye in it. A dye picked for a
bottle goes into the liquid rather than replacing it, and **Natural**, at the head of the
dye swatches (the shelf, the Design desk, the phone's Dye sheet, the remote), takes it back
out. On the desk and the phone:
- pick Glycerine and pour into a colourful plate (Deep Ocean): no colour should land, only
  the clear hole it opens; on a look with Lamp Ground up the hole should be lamp-white;
- pick Cherry Red with Glycerine: it should pour red. Pick Natural: clear again;
- pour Syrup on a dark look: amber, darkening where it pools deep. Pick a blue for it: a
  dark green-blue, the amber still in it;
- pour Milk: a white body on a black-ground look. On a Lamp Ground look it reads as clear,
  where real milk would throw a grey shadow (PLAN 18d-12c, 18j);
- say if any liquid's own colour looks wrong to you, or if Oil's pale gold is too faint to
  be worth it.

## 45. Beat Squeeze, Plate Rock and Turbulence do something (PLAN 27a–c)

With music playing (a song with a clear kick), on Classic and on Fillmore East, on the
Perform desk and on the phone:
- **Beat Squeeze** from 0 to the top: each kick should press the whole picture outward from
  near the middle and let it come back, a breath on the beat. At the default 0.5 it should
  be plain without being a lurch; say if full is too much;
- **Plate Rock** from 0 to the top: the colours should slosh one way on a kick and swing
  back, the thicker colour sliding through the thinner. At 0 nothing sloshes. Say if full
  pours the colour off the dish. The picture as a whole should not move: since 27a-7 the
  cover glass sloshes the whole picture only with **Frame Sway** up (0 by default), so an
  evenly coloured look barely moves with Plate Rock alone;
- **Turbulence** from 0 to the top: at a look's own value it should look as it did; past
  the middle it should start churning, and at the top stir the plate into streaks within
  a second or two. Say where on the slider it stops being pleasant.

---

## Reading the frame time while you do it

`?debug` puts `chromaglassDebug()` on the window. `status.frameMs` is the real
frame interval, `status.label` is the solver and grid actually running, and
`status.steppedDown` says whether the governor has had to retreat. `?set=` takes
any setting by name, semicolon separated, and lasts for that page load only —
nothing it does reaches a saved look.

## 44. Blow as air on the film (PLAN 15g)

The moving Blow no longer carries the colour by hand: its breath drags the liquid's
surface, and the flow it makes moves the colour, the oil and the ferrofluid. On Classic,
then a thick look (Thickness up), then a ferro look, draw a Blow slowly across a pool:

- Does the colour stream along the way you blow, with the liquid either side curling
  back (the flow round a jet), rather than a blob hopping ahead of the cursor?
- Is it about as strong as before? If it feels weak or too strong, say which way: the
  breath's speed (8 m/s at the surface, PLAN 15g-6) is a guess to set by eye.
- In a thick look it should move much less. Does that read as the liquid being thick,
  or as the tool not working?
- A Blow held still (not the straw) still does what it did; that is 15g-2.


## 46. Turing Print (PLAN 26d)

Pick **Turing Print** on the Perform desk, then on the phone. With music, give it half a
minute: labyrinths should grow out from where the reagent drops land, blue-black on the
white lamp, every stripe about the same width. Then stir it with a hand or a Blow:

- Do the stripes read as a print, black and white, or as soft grey worms? The edge is the
  chemistry's own, about a fifth of a stripe; say if you want it harder (PLAN 26d-2);
- After a stir, do the stripes drag into whorls and heal back to their own width within
  a few seconds?
- Are the stripes the size you want? Pattern Width on the Design desk or the phone's
  Looks sheet moves it; say where you would set it;
- On Sensual Laboratory and Neon Coral Reef the coral is now half the size it was, and
  grows where it grew. Better, or did the bigger coral suit those looks?
- Pour a bottle of colour into Turing Print (PLAN 26d-3): does it show through the
  stripes, or do they hide it? Where the colour and the dark print meet, is the
  multiplied look right, or should the print win (26d-3b)?
- Print Ink (the lamp pins, the phone's Settings rail): drag it from Starch round the wheel.
  Is each hue a solid colour on the white lamp, with the same stripe edge as the indigo?
  Does a Go between two looks with different inks switch cleanly?
- Let Turing Print run with music and Evolve for a minute: pours now pile up under the
  stripes (the dye budget counts the pours, not the print). Is the paper darkening under the
  print too much by then, so the budget on this look should be lower than 0.35?
- Drain the plate while Turing Print is on: the print should drop away as the dye drains
  (it no longer holds still), then the plate empties and the print grows back.

## 47. The test pattern and Identify on a real wall (PLAN 8e)

With the projector up, open Load-in and switch **Test pattern** on in the Wall panel:

- Is the grid square and the circle round once the corners are dragged right? The grid is
  kept square by the shape of the projected quad, so a keystone shows as cells that are not;
- Are the lines bright and thin enough to drag a corner against from where the audience
  will stand, and are the corner numbers (1 to 4, clockwise from the top left, as the
  corner handles are) readable from there?
- With shapes in Mapping, does each carry its own number in its middle, and does
  **Identify** flash every number clearly enough to find the shape called 3?
- With **Rear** on, the pattern is mirrored with the show (it is drawn as the picture is).
  Is that the way round you want it, standing behind the screen?

And the header at 1024 (PLAN 8h): with the window that narrow the dots fold into one
**Status** button. Is one dot (green while anything is connected, red while recording)
enough, or should the button carry a dot per input (PLAN 8h-1)?

## 48. A panel on a second display (PLAN 8g)

With a monitor beside the laptop, open a panel's own window from its header (the button
left of float, or right-click the title, **Open in its own window**) and drag the window
to the monitor:

- Does the panel look as it does on the desk (fonts, colours, knobs), and do its controls
  move the plate on the laptop at once?
- With the focus in that window, the show's keys (Go, Blackout, R) do nothing yet (PLAN
  8g-1). Is that a problem at a gig, or is the window only touched with the mouse?
- After a reload the panels are back on the desk (a browser will not reopen windows by
  itself). Is one click to put them back worth adding (PLAN 8g-2)?

## 49. Preview builds on a copy (PLAN 8b)

With the projector window up (or a cast), put the plate bar on **Preview** and change the
look: pick another, ride a few sliders, clear the plate. The wall should carry on with
the look it had, while the desk's preview shows the copy. Then click **Wall** in the
header (or ⌘⏎; the plate bar's Send to wall button went in PLAN 35c-4): the wall should
fade to the copy's look over the Go's fade.

- Does the wall stay exactly as it was while you build? The dimmer, the mixer and the
  music still move it on purpose; nothing else should.
- Does Send to wall look like a Go, the colours handed over rather than cut?
- Switch to **Live** with unsent changes: the desk goes back to the wall's look and the
  changes are dropped. Is that what you want, or should Live send them (PLAN 8b)?
- The copy is a second engine. Does the laptop keep its frame rate in Preview with a wall
  up, and does the wall's?
- The wall's look stands still under the drift until it is sent (PLAN 8b-2). Noticeable?

## 50. Draw shows the wall, and lands under the finger (PLAN 8-draw-a)

With the show server running (`npm run show`) and the projector up, open the remote on a
phone and an iPad (Draw is the screen it opens on).

1. The frame shows the wall, moving, within a blink of the projector: drop with one
   finger and the colour appears under it on the pad as it does on the wall.
2. Drop near each corner of the frame and on the edges: the colour lands under the
   finger on the wall too, with the dish turning (Classic) and with the closeup in.
3. Lock the phone for ten seconds and unlock it: the picture comes back on its own.
4. Say if the lag reads as a delay under the finger; if it does, the size or the rate
   (`lib/padPicture.ts`) is the trade to revisit.

## 51. Evolve changes slowly with the song (PLAN §10 step 8)

On the Mac, a look you know (Classic, then a ferrofluid look), Evolve on at its default
speed, ten minutes with a song that has builds and drops, then five with nothing playing.

1. The look should change by itself in slow moves you can follow: the oil thickening,
   the glass going glossier, the chemistry coming up. One thing at a time, never a jump,
   and never anything that sways, spins or presses the whole picture.
2. After a drop it should lean busier over the next half minute; through a breakdown it
   should settle. The colours of new drops change at a drop or a breakdown.
3. With nothing playing it should still wander, more slowly.
4. Say if a minute's glide reads as nothing happening (the moves are too small) or as
   the look drifting away from itself (too big).

## 52. Bass Drop moves the frame, nothing else does, and three looks answer the hits (PLAN 28f)

On the Mac, a song with a band's drums (the showreel's, or anything with a kick and a snare).

1. Bass Drop is the one look whose picture moves with the music: the plate rocks on each
   kick, a hard kick harder, the frame sliding a little with it (Frame Sway 0.35). Say if
   it is too much, or not enough to be worth having on one look.
2. Cyberpunk: each kick churns the neon, the snare curls it tight, the hats raise fine
   beads, and between the hits it settles. Fillmore East: more colour while the bass is
   in, a small stir on each hit. Lava Lamp: the plumes a little livelier under the bass,
   the colours turning sooner on a held chord, nothing jumping on a hit.
3. Oil Wheel turns at its motor's speed whatever the band does. Any look not named: the
   frame holds still with the music.
4. Say whether each of the three answers the music the way an operator's hand would, or
   twitches. They are the pattern the other looks will follow.

## 53. The closeup holds still through the song (PLAN 27a-8, QA-31)

On the Mac, Macro Bead or Ferro Paint pushed in to 6x, a song with a hard kick, Frame Sway
at 0 (the default).

1. In Hold, Follow and Auto the frame should not punch, pump or shiver with the music: the
   drop drifts, the dye moves round it, and nothing else moves. Turn Frame Sway up to 1
   and the punch-in on the kick, the push and the treble tremor come back; at 0 they are
   gone to the pixel.
2. In Auto a cut should land on the drop's middle and stay, not slide the last stretch to
   it. In Follow a drop drifting fast should sit near the middle of the frame, not trail
   behind it.
3. With nothing playing, a drop on still paint should sit dead still at 6x: no shimmer at
   its edge from frame to frame.
4. Say whether Auto's slow breathing zoom, which is not from the sound, is a signature
   worth keeping or one more move the rig should not make (27a-8-1).

## 54. Ferrofluid halos are blacker and ripening slower in every look (PLAN 29c)

The thin gap's Cahn–Hilliard step (`phaseCHVolume`) now uses a degenerate mobility,
`4m(1 − m)` at each face's mean share, and `phaseCompress` returns what the flux limiter
withheld at a moving edge. Because every look opens on Thin Gap, ferrofluid halos are
blacker (less brown leak into the oil round a drop or domain, `npm run ferrorest`: cells
over 0.01 grow +94 at rest against +248 before, and the drop holds 90 of 100 half-full
cells against 84) and Ostwald ripening across the oil is slower in every look with
ferrofluid:
- On Magnet Garden, Ferro Maze and Ferro Paint, watch a poured drop and the domains' edges
  over a minute: the rims should stay blacker with a narrower brown halo, and small drops
  sitting apart from a pool should hold their size longer instead of bleeding into the oil.
- A drop dragged fast by hand still sheds its trailing rim into the oil's return flow
  (PLAN 29c-8).
- The magnet's pull on a drop is felt at its rim first. The force a cell gets is the
  Kelvin gradient times the cell's ferrofluid share times (ν_clear/ν_ff)^(1−φ): a cell
  of ferrofluid alone moves about four and a half times faster than the same push on the
  oil, and a drop in the oil goes at about 0.8 of the reference speed, so the rim runs
  ahead of the oil and a drop should lean into the pull and then follow the magnet as a
  whole, not tear. `phaseMomentum` carries the ferrofluid share along itself, so a
  dragged drop should keep its edge rather than smearing behind it. Drag a drop slowly
  at a deep magnet and then fast at a strong one: slowly it should hold together at
  Darcy's speed; fast it may leave a thin trailing film (29c-8), but its front should
  stay sharp.

## 55. The Turing Print keeps changing (PLAN 26d-6)

Turing Print now has a Drift control (`turingDrift`; the look sets 0.7), which slides the
reaction's feed and kill across the plate on a 40 to 90 second clock so the maze keeps
rearranging after the chemicals meet. In the lab a settled maze correlated 0.90 with itself
fifty seconds later without it, 0.64 with it at 0.7 and 0.59 at 1.0 (0.67 and 0.50 before the
stripes-to-spots glide of PLAN 26d-6a). The Mac's numbers for
the same line are unmeasured: read them off the first run of the `fifth` shard. On a real GPU:
- Open Turing Print, pour reagent, and watch for two minutes without touching the plate. The
  stripes should keep sliding, branching and joining in different parts of the plate at
  different times, slowly enough that no single frame looks like motion, and with no music
  playing or with music: the music must not change the pace.
- The grey patch should be gone, at 0.7 and at 1.0: the lab's flattest tile (searched every
  16 pixels) keeps 0.93 and 0.77 of the stripes' contrast. If a soft grey area still shows on the Mac, that is Metal's
  rounding and the cap line needs refitting there (PLAN 26d-6a).
- Watch for stripes breaking into dots in some regions and dots running back into stripes
  in others, over a minute or two. It should read as the chemistry changing, not the plate
  emptying and refilling; if a region goes nearly bare for a moment between the two, the
  glide is too fast. Is Drift 0.7 the right pace, or too busy?
- Drift at 0 should be the print as it was: settled, then only creeping.
- The control is on the Perform desk's lamp pins, the phone's Settings rail and the remote,
  and it takes a MIDI knob.

## 56. A bubble's middle is the plate, not a tinted disc (PLAN 33e)

Bubbles were drawn with a dim dye-coloured disc inside a dark band, the donut. The middle
is now the plate itself with at most a tenth of the film's tint. The lab's numbers are in
`docs/plan-shipped.md` §33e; the Mac's are unmeasured (`bubblelook` runs in the open
shard on software WebGPU). On a real GPU:
- Pour a dye, blow bubbles with Bubbles at the default, and look at a small and a large
  bubble on a dark look and on a lamp-ground look. A large one should be a clear window
  edged in a thin dark line; a small one a dark dot with a pin-point; neither a coloured
  disc inside a ring.
- A bubble in clear water should not be a grey disc. It is drawn at 70 % strength there
  (PLAN 33e, third bullet); say whether that reads as a flaw.
- Zoom in past the middle of the zoom's fade: the closeup's bubble is lit and domed, as
  before, and the change between the two views is as smooth as it was.

## 57. No soft glow round a bubble's hole (PLAN 33b)

The dye beside the hole a bubble cuts was lit like a ridge, a pale soft ring two to four
cells wide. The dye's normal is now flat beside the air. The lab's numbers are in
`docs/plan-shipped.md` §33b; the Mac's are unmeasured (`holeline` runs on software WebGPU).
On a real GPU:
- Pour a dye with Edge Relief at the default, blow bubbles and look at the dye round a
  small and a large one on a dark look and on a lamp-ground look. There should be no pale
  ring outside the bubble's own dark edge.
- Look at the pool's own edge into clear liquid: it should keep its relief as before.
- Where two dyes meet beside a bubble the relief may be weaker within a few cells of the
  bubble (PLAN 33b-2); say whether that shows.


## 58. Tilting sloshes the liquid (PLAN 18a-13)

The new **Slosh** dial (0 by default) makes a tilt send the liquid across the plate, pile
on the low side and come back when the tilt is reversed. The CPU half's numbers are in
`docs/plan-shipped.md` §18a-13 (`npm run slosh`); the GPU half is unmeasured here. On a
real GPU:
- Pour two or three dyes, raise Slosh to about half, then tip with Tilt Direction (or
  the phone's Tilt) one way and, a second later, the other. The colour should slop across
  and back and mix. Say whether the pace is right: the top of the dial is the fastest the
  scheme is stable at (`SLOSH_LEAN`), and the owner may want it faster.
- At the default Thickness the liquid does not ring, it flows to the new level (about 1%
  overshoot). Lower Thickness to about 0.3 and tip again: it should now run past the
  level and return. Say whether the default should be thinner for this.
- With Slosh at 0, and with no tilt, the plate should look exactly as before.
- Shake or music: nothing should slosh from sound, Plate Rock or Frame Sway. (Gravity itself
  can be moved by a look, Evolve or a patch on it, and the slosh follows that tilt; say if
  that should be held out.)
- On the phone, a held tilt fades out of the remote 2.5 s after the last reading, so the
  liquid runs back to level on its own while the phone is held still: the same fade Plate
  Rock has, now visible as a slop. Say whether it reads wrong.

## 59. The closeup is the liquid, not cells (PLAN 33g)

Paint Cells and Macro Lacing now default to 0, and the closeup's relief is lit by a lower
lamp. The lab's numbers are in `docs/plan-shipped.md` §33g; the Mac's are unmeasured
(`macroview` runs on software WebGPU). On a real GPU:
- Pour a dye, stir it, and zoom in to 4x and 6x (the pinch, the Auto camera) on `classic`,
  `jellyfish-bloom` and a dark look. It should read as the same liquid seen nearer: a
  glossy, domed surface with a raking highlight, no ring-packed cells and no dark
  filaments.
- Say whether it is 3d enough. If not, the next steps are PLAN 33g-2 (refraction, depth of
  field, parallax); the lamp's lowering and the dome gain (×14) are the two numbers to move.
- Say whether the highlight burns out on a bright pool, and whether a pool's edge reads
  as relief without a drawn outline.
- `macro-bead`, `cell-bloom` and `lace-run` draw no cells now either (the owner, 2026-10-29,
  PLAN 33g-3); Lacing Run alone keeps its dendritic lacing. Open Macro Bead, Cell Bloom
  and Lacing Run at their own zoom: Cell Bloom should read as three turning pools of
  silicone and oil, Macro Bead as domed wet beads, Lacing Run as lacing without cells.
  Say whether Cell Bloom's name should change now that it has none.

  *(33g-2a, 2026-10-30.)* In the closeup the oil beads are laid twice the size scale, and
  Macro Bead's Beads dial is 0.7 (was 0.35). Open Macro Bead and Lens Pools (Cell Bloom,
  renamed) and look at 3x to 5x: the beads should read as glass lenses with the plate upside
  down in them and a dark ring, big enough to be the picture. Say whether they are too big
  or too many (the factor is `MACRO_BEAD_SCALE` in `lib/beads.ts`, the dial the look's
  Beads), and whether the lens beads over the dye's dark ground look like glass or like
  holes. Beads already on a plate keep their size until they retire, so switch looks, not
  only zoom, to see the full effect.

  *(33g-2b, 2026-10-30.)* The beads' edges are drawn from the dome's exact cone now, and a
  big bead (over about 3 cells across its radius) is a clear window with a thin rim and no
  dimple. Look at Macro Bead and Lens Pools at 4x to 6x: the rims should be perfect circles
  with a crisp dark line, a big bead should look like a flat disc of oil (the plate seen
  through it as it is), and a small one a ball with a small upside-down picture. Say whether
  a bead of three to four cells, where the two kinds meet, shows a ring that looks wrong
  (the map folds there, as a real lens does), and whether the upside-down picture is what you
  want or an upright, slightly magnified one (a camera looking at the dye a few radii under
  the bead sees it upright; the macro photographs are of beads over a distant background).

## 60. The kick's dye burst is clumps, and has a dial (PLAN 27f-1)

Play a look with a clear kick (Classic, Poster 1969) at Audio Impact 0.6. Each kick should
throw a burst of dye droplets that breaks into two or three uneven clumps at different angles
and distances, some small and some large, not an even wreath round one circle. Kick Bloom
(Show section; remote; MIDI) at 0 should stop it entirely and Beat Squeeze 0 and Plate Rock
unchanged should leave only the tilt; at 1 it should be as much dye as before, at 1.5 more.
Check that the burst reads as the kick, not as the plate being pressed.

## 61. Plate Rock rocks with the bar, Beat Squeeze presses where the kick lands (PLAN 27f-2, 27f-3)

Play Classic with a band at 120 bpm or so, Plate Rock at its 0.45 and Beat Squeeze at 0.5,
Kick Bloom at 0, then at 1. Plate Rock should be the slow move: the heavier colour sliding one
way across a half bar and back across the next, the direction turning a little each time, and
nothing jolting on the kick itself. Beat Squeeze should be the quick one: each kick a dent
where it lands, a fifth of the dish across on the default oil, the colour pushed out of it and
running back in a third of a second later (fingering back in where Fingering is up). Turn
Thickness up: the dent should tighten to a fingertip; down toward water, it should widen.
Bass Drop should still press the whole glass. Say whether the rock's pace (one lean every two
beats) is right or wants one a bar, and whether the dent wants to be bigger.

## 62. The landing page (PLAN 34a)

Open the site in a private window, at a laptop's width and on a phone. The page should say what
ChromaGlass is in the first screen, and "Play free" should be the one obvious thing to press; the
sign-in then opens over the page. Say whether: the headline and the line under it are the words you
would use (they are drafts); the hero's cross-fade of five frames is slow enough not to be noticed
and not so soft on a big screen that it looks like a blur (it is 480 px frames, PLAN 34a-3); "From
the maker" is something you would sign, and the 14-day refund line matches what you will honour;
the Free, Home and Pro cards promise only what the app does today. Then sign in, sign out and come
back: the page should not flash for a returning visit.


## 63. Bass Boost presses harder (PLAN 27g)

Play a track with a clear kick and bass line (the Sound panel's Bass Boost, in Audio Input; on the
phone, the same slider in Settings). At 1 nothing has changed. Turn it to 2, then 3: each kick and
bass note should dent the glass visibly deeper, the colour pushed out from under it harder and
running back as the bass falls, and each kick's dye should throw further. It should read as more
bass, not as a busier or shakier plate, and nothing should move the whole frame. Say whether 3
is too much (the press at 3 is three times the default's depth), and whether 2 feels like the
bass you wanted.

## 64. Oil sloshes on water, and bores (PLAN 18a-13a, 13d)

The slosh dish is two layers now, oil lenses riding on water, solved on the GPU with a
Riemann flux, so a hard tip makes a running jump (a bore) instead of a smooth slope. The
numbers are in `docs/plan-shipped.md` §18a-13a (`npm run slosh`, `sloshgpu`); the Metal run
is the plate shard. On a real GPU:
- On a look with oil on the plate, raise Slosh to about half and tip one way,
  then the other. The water should run ahead and the oil lag behind it and shear past it:
  two speeds, not one sheet. Say whether the oil reads as floating.
- Lower Thickness to about 0.2 and tip hard and fast: the first wave should steepen into a
  sharp front that runs to the rim and back. Say whether it reads as a wave or as a jolt.
- Bass Drop with music: its Beat Squeeze should now send a ring out from each kick that runs
  to the rim and back, and its Plate Rock should slosh the whole dish, a little (Frame Sway
  0.35). Off Bass Drop, Beat Squeeze's ring starts from the sheet's one dent where the kick
  lands (27f-3), narrower. Say whether the whole-dish slosh is too much (the frame-motion rule).
- Any other look (Frame Sway 0) with Plate Rock up: the rock should tip the dye as it did,
  and not slosh the whole dish.
- With Slosh at 0, Plate Rock at 0 and Beat Squeeze at 0, the plate should look exactly as
  before.

## 65. A new song brings a new look, on its beat (PLAN 14z)

Settings, Audio Input, On a New Song: pick New preset (it opens on Keep until you have judged
this; on the phone, the same control in Settings). Then play your own music the ways you play it
at a show, through the microphone in the room as well as through the laptop:

- An album or playlist with gaps: the new look should come in about a second into each new
  song, on one of its first beats, fading in over a second. Nothing should change during a quiet
  bridge, a stop before a last chord, or a long fade-out.
- A crossfade (a DJ set, or a player's crossfade setting): the change waits for the show to
  recognise the song, usually 7 to 8 s into it for a song it has heard before, and then blends in
  slowly under the music (about four seconds). A song it has never heard waits for the song
  recognition service, up to about 35 s.

Say whether a change ever lands in the middle of a song, whether one is ever missed, and whether
the speeds feel right; if they do, On a New Song can open on New preset again (14z-4).

## 66. The cartoons, poured and filmed (PLAN 14ac)

On the desk, the Dye panel has a Cartoons shelf under Image… and Video…; on the phone, it is at
the bottom of the dye sheet. Each cartoon has Pour and Film.

- **Pour** The Skeleton Dance on a dark look (Classic) and then on a pale one. It pours the
  picture's light as dye, so a cartoon with a light background lays a lot of white; say whether
  that reads as the cartoon or as a wash, and whether pouring the *drawing* (the dark ink) would
  be better (14ac-2).
- **Film** Swing You Sinners! with Film Mix at its default and at full: does the cartoon read
  through the dye, and does the grey picture want the look's colours (14ac-4)?
- Leave one pouring for a whole loop (five to seven minutes) and say whether it ever stutters
  or the plate slows; the pour's stutter every frame is fixed (14ab-1), but its per-pixel work
  on the CPU is still open (14ab-2).
- Say which of the four earn a place, and whether you want more (Ruttmann's abstract
  Lichtspiel films are the next candidates, 14ac-3).

## 67. Areas that listen for themselves (PLAN 25h)

Three looks now play their music in parts of the plate rather than over all of it. With a
record on, through the room microphone and through the laptop:

- **Velvet Underground.** Each kick should warm and fold the raspberry soap well on the right
  (the paddle turns the other way on each kick), the mids should fold the magenta glycerine
  top left slowly, and the hats should drop ultramarine and purple into the syrup low in the
  middle. The violet between should stay dark. Say whether each pool reads as following its
  own instrument, and whether the soap well's fold is too busy or too slight.
- **Jellyfish Bloom.** Its four bells now sit in fixed places, a band each: the lowest, middle
  bell should pulse pink and teal on the kick, the top bell's fringe should ruffle on the hats
  (and go icy blue when the top end is bright), the two side bells should fill on the mids.
  Before, the bells were scattered at random and the music landed in the middle.
- **Bass Drop.** Kicks should take three wells in turn (crimson, blues, magenta) instead of
  all landing in the middle, and the wells should stay apart (its Center Gravity went 0.4 to
  0.15 so they do not slide together). Say whether it lost the weight it had.

Settings, Patches, on any of the three: each patch has a thumbnail of the plate with the
look's areas; tap one to aim the patch there, and Fire on a hit gives it a gate. On the phone,
the same sheet. Say whether the picker is clear and big enough under a thumb.

## 68. Beat Squeeze's sheet gives back at the liquid's own pace (PLAN 27f-4)

Classic with a band at 120 bpm, Beat Squeeze at 0.5, Kick Bloom at 0, Frame Sway 0. Each kick
should still be a dent where it lands, but now its letting go is the liquid's: on the default oil
most of it springs back at once and the last of it settles over a fifth of a second, with a faint
ring of colour pushed out round the dent and drawn back. Turn Thickness to full: the dent should
tighten and hold, coming back slowly over a second or two, the ring round it plainer. Toward water
it should be wide and gone almost as it lands. Little outside the dent and its ring should move on
the kick (under half of what the old dent moved there). Say whether the thick liquid's slow give-back reads as syrup or as lag, and whether
the default oil's dent still reads as a press. A real sheet on a thin liquid would not just give back: on the
default oil and toward water it would swing past rest once or twice (a slow wave under the sheet,
about a quarter of a second a swing) before it settled, which the solve leaves out (PLAN 27f-8(f)).
Say whether the give-back looks too dead next to that, which would make the inertial sheet worth
building.

## 71. One Record button (PLAN 14ae)

On the desk, press the Record button in the header (or R): a plate video starts, the button
turns red with one clock, and a single Rec dot appears. Press it again: it stops and the file
is in the Record panel (the sliders button) under Plate video. In the panel, turn on Take as
well and press Record again: both run from the one press, and the dot says "Plate video + Take".
Paint a little, stop, and the take is under Takes with Replay. Say whether "Record · Plate
video" on a wide desk reads at a glance, whether "Plate video" and "Take" are the words you
want, and whether the Song film row belongs in the Record panel. On the phone: More, then Record
makes, pick Take and press Record.

## 69. Any camera, and which camera does what (PLAN 14ad)

With a second camera plugged in (a USB webcam, a capture card or OBS's Virtual Camera):

- **Settings, Film.** Pick the second camera under Webcam, then press Webcam: its picture
  should be on the plate, and the Source line should name it. Pick the laptop's camera while
  it shows: it should switch without pressing anything else.
- **Pull the cable** while it shows: the film should go off with a line saying it was
  unplugged. Plug it back in: it should come back by itself. Say how long that takes on a
  real camera (the code waits for the browser to list it, not a timer).
- **Settings, Motion camera.** Does the first line make it obvious that this one stirs and
  is never shown, and that Webcam is the one that shows a picture? Pick a camera for it and
  switch it on; the film's camera should stay what it was.
- On the phone, both pickers are on the Settings sheet's Film and Motion camera tabs.

## 70. On reads on (PLAN 35a)

On the laptop in a dark room, and on the phone, with no reading of labels:

- **Film.** Load a demo loop with Film: its Film button and Video file in Source should be lit
  violet, the row should say "playing as film", and Off should not be. Pour another: its Pour
  lights too. Say whether you can tell which loop is doing what from across the room.
- **The desk.** The layout switch, the tools, the layers, the bottles and the palette list: the
  chosen one is a solid violet now, not a lighter grey. Blackout is grey until pressed, then
  solid red. Say whether the violet is too loud anywhere, or
  whether anything that is on still looks off.
- **The phone and the remote.** The dock's open sheet, the tools, Looks and the Motion sheet's
  tiles. Pause is lit while the plate is paused. The remote's Blackout is grey until it is on.

## 75. The Mac app downloads, and finds its own updates (PLAN 13-update)

On the Mac, signed in on the site as Pro: Profile & Store should show a Mac app card with
Download for Mac. It downloads ChromaGlass-mac-arm64.dmg; drag it into Applications over the
copy that is there, and open it. Install 1.3.692 or later: it is signed and notarised, so it
opens on a double-click with no warning, and the card and the landing page no longer tell the
way round (an older ad hoc copy, 1.3.622 or 1.3.642, still needs System Settings → Privacy &
Security → Open Anyway). On a phone the same card should say to open
the page on the Mac, and a Free or Home account should read "comes with Pro". After the next
release (Actions → Mac app → Run workflow, release ticked), open the installed app and wait a
minute: one notification should say the new version is out, the ChromaGlass menu should offer
Download ChromaGlass <version>…, and the profile card the same button. Nothing should pop up
while a projector is up. The signed release is out (1.3.692, 2026-10-27), so what is owed is the
last step: install 1.3.692, make another release, and check that 1.3.692 downloads it and
becomes the new version after a quit, replacing itself in place.

## 72. A look saved in Chrome is in the Mac app (PLAN 23.18)

Once the licence Worker is deployed with `/sync` (23.18-deploy), signed in to the Pro account:

1. In Chrome at chromaglass.art, open Profile & Store. *Cloud sync* says On and, within a few
   seconds, "Up to date".
2. Save a look, learn one control on the MIDI map, and change a tool's amount.
3. Open the Mac app, signed in to the same account. Within a minute (or at once with
   *Sync now*) the look is in the preset menu and the MIDI map is the one from Chrome. The
   projector layout on the Mac is still the Mac's.
4. Delete the look on the Mac. Back in Chrome, focus the window: the look goes, and does not
   come back after a reload.
5. On the phone, open the Account pill: the same card, readable and tappable at phone width.
6. Turn the Wi-Fi off on the Mac, save a look, turn it back on: the look reaches Chrome.

Bad: a look that comes back after being deleted, a set list replaced by an empty one, or the
plate stuttering when a sync lands mid-show.

## 73. The seven groups (PLAN 35b)

On the desk, press ⌘P (the panel browser) in Load-in, then in Build, and open Settings (⌘K, All settings…):

1. The panel browser's headings are Play, Pour, Feed, Motion, Chemistry, Look, Stage, in that order,
   and the desk's own panels (Cues, Rides, Recipe, Score under Play; Bottles, Dyes, Tools under Pour)
   sit under the same headings as the settings sections. In Build and Gig there is no Stage heading.
2. Settings' rail shows the same seven. Each section is where you would look for it: Film under Feed,
   Kaleidoscope under Motion, Lamp & Light under Look.
3. On the phone, More → Settings: the strip names the same seven above their tabs, and every tab still
   takes a tap.

Bad: a section where you would not look first (tell me which and where it should be), a heading that
cuts a name short on the phone, or a saved layout whose panels came back in a different place.

## 74. Squish Plate in five (PLAN 35c)

On the desk, open Settings (⌘K, All settings…) and look under Chemistry and Motion:

1. Chemistry now lists Squish Plate, Oil & Soap, Ferrofluid and Reactions; Motion lists Tilt & Rock
   beside Kaleidoscope, Automation and Fluid Physics. Squish Plate holds only the glass (pressure,
   shape, gap, smear, rain, viscosity).
2. Every control you used to find under Squish Plate is in one of them: Oil Tension, Oil Bodies,
   Soap Bursts, Clear Film and Polarity in Oil & Soap; the ferrofluid and the magnet in Ferrofluid;
   pH, BZ, Liesegang and the Turing pattern (it was in Lamp & Light) in Reactions; Gravity, Tilt
   Direction, Slosh and Plate Rock in Tilt & Rock.
3. The same on the phone: More → Settings, the Chemistry and Motion tabs. A saved layout that had
   the Squish Plate or Fluid Physics panel opens with them where they were; Fluid Physics now holds
   only the flow (its knobs are fewer).

Bad: a control you went looking for in the old place and could not find by the search box, or a
section with so few controls that it should have been joined to another.

## 75. One home per setting, second half (PLAN 35c-2)

On the desk and on the phone's Settings strip:

1. Motion lists **Plate Spin**: Rotation Speed, the Flick buttons, Auto Spin, Spin Rate, Beats a
   Turn, Reverse Spin, Spin Direction, Spin Wander, Spin From Music, Flick Strength and Plate Drag.
   Plates & LED (Stage) keeps only Layers, the blend, and the LED platform. In Build you can dock
   Plate Spin beside the set.
2. **Flash Limit** has one switch, in Master. Wall shows a line saying whether it is on, and no
   switch. Turn it off in Master and the Wall line turns amber.
3. Each Drive has its Impact under it: Room Drive / Room Impact in the Motion camera, Film Drive /
   Film Impact in Film, Sound Drive / Sound Impact in Sound. Shapes Impact is the only master left
   in Patches, which links to the other three.
4. Build's deck now holds Squish Plate after Fluid Physics (a layout you had saved is unchanged).
5. Songs: "Stage sequences…" is a button like the ones above it, with a list-music icon.
6. The track panel's Takes is one button that opens the Record panel, where takes are started,
   replayed and deleted.

Bad: a control you used all the time that is now in a place you do not expect, or a Build deck that
runs out of room with Squish Plate in it.

## 76. One home for MIDI on and the audio source (PLAN 35c-3)

On the desk (the phone already had one of each):

1. Settings → Sound: Source shows one line (Off, Mic, System, File, Band or Instrument) and a
   **Change in Sound…** button. The button closes Settings and opens the Sound sheet, where the six
   tiles choose. Pick Band there, reopen Settings → Sound, and the line says Band.
2. The Mic dot still lands on Settings → Sound, with the device picker under the Source line.
3. Settings → Controller turns MIDI on, picks the port in and the LEDs out, loads a factory map and
   auto-maps. Plug a controller in and check all four there.
4. The MIDI dot opens the MIDI sheet. It says "MIDI is on · <controller>" or "MIDI is off", has
   **Set up…** (opens Settings → Controller), and still teaches: Learn, banks, bindings, the picture,
   Save and Load file. It no longer has a switch, a port picker, factory chips or Auto-map.


## 77. Coloured knob caps, tool keycaps, a snail and a hare (PLAN 35d)

On the desk (Build, with Recipe, Fluid Physics, Lens and Tools open):

1. Every knob's cap wears the colour of its group: Play off-white, Pour blue, Feed orange, Motion
   green, Chemistry teal, Look yellow, Stage grey. The same colour is the small tick before a panel's
   title and the dot on a Settings rail heading. Violet still means on and red still means live; no cap
   should read as either.
2. Speed and Evolve Speed (and Gel Speed, Chase Speed, Kaleido Spin where you pin them) have a snail
   at the slow end of the ring and a hare at the fast end, faint until the knob is at that end. Kaleido
   Spin has a hare at each end, since it turns either way.
3. The Tools panel is ten keycaps: a drawn picture, the name, the letter in the corner. The held tool
   is lit violet and sits 2 px lower. Press a letter on the keyboard and the held key moves.

On the phone: the dock's ten tools carry the same pictures (the held one lit and 2 px lower); Motion's
Evolve speed and Play's Speed have the snail and hare at the ends of the track, and the thumb takes its
group's colour.

Bad: a cap you read as "on" or "live", a colour you cannot tell from its neighbour at arm's length, a
picture that does not say what its tool does, or a snail and hare you do not see until you look for them.


## 78. Bottles that tip, drops that fall, a bulb in kelvin (PLAN 35e)

On the desk (Build, with Bottles open) and in Settings:

1. Pick a bottle. It leans forward once, with a little overshoot, and stands still; its outline and name
   stay lit violet. Pour with it for a minute: its level sinks as the plate fills toward the Dye Budget,
   and rises as the plate empties. Lower Dye Budget and the level drops sooner; raise it and it holds. The
   other bottles stand full.
2. In Settings, Viscosity (Squish Plate): hover **thin** and a small drop forms and falls in under a
   second; hover **thick** and the drop hangs and strings out for about five. Choosing one runs it once.
   At rest each is a drop hanging at the lip.
3. In Settings, Lamp & Light, Lamp Warmth has a bulb at the left. At 0 it reads 6500 K and glows white;
   turn it up and it falls to 5100 K at full, the filament going from white to cream. The figure is the
   temperature of the grade the slider applies to the picture, not a label.

On the phone: the Dye sheet's picked bottle leans and shows its level, and the dock's dye button holds the
bottle in hand, leaning while the sheet is open. Settings has the same drops and bulb.

Bad: a level that sits still while the plate fills, a lean that keeps moving, a drop that falls in the same
time on both buttons, a bulb whose number does not follow the slider, anything that moves with reduced
motion on, or a violet or red that is not "on" or "live". Decide too: the 5100 K top is what the grade does
today; if you would rather it reached a 3200 K halogen, that is PLAN 35e-2.

## 79. The Splodascope, and Film Hold (PLAN 28k)

Open the Splodascope look on the lamp, with the owner's photograph beside it (in the project's
shared files, `references/splodascope-2026-10-25.png`).

1. A crowd of round drops of yellow, green, red and magenta oil in a cobalt water, from small to
   cells a fifth of the plate across, a few with a drop of another colour inside a ring of water.
2. Leave it a minute: drops press against one another and stay two, with a thin dark wall between
   them. Some merge, slowly; the crowd should still be a crowd after a minute, not a few big blobs.
3. With music: a kick presses the glass and now and then breaks a wall so two neighbours run
   together. Nothing moves the frame as a whole.
4. Settings → Oil & Soap → Film Hold to 0: the drops run together within a few seconds (that is the
   plate as it was). Back to 1: the drops laid from then on hold again.

On the phone: the look in the list, and Film Hold under Oil Bodies in Settings → Oil & Soap.

Bad: walls between drops so thick the crowd reads as a lattice; drops that jitter against each
other; colours going brown or black inside the drops; or a crowd that has merged into blobs within
half a minute with no music playing.

today (widened in §80).

## 80. Lamp Warmth reaches a 3200 K halogen (PLAN 35e-2)

In Settings, Lamp & Light, on any look with some colour on the plate (the bulb is also on the phone's Settings):

1. Lamp Warmth now runs from 6500 K at 0 to 3200 K at the right-hand end, and the bulb's figure follows it, even
   steps of colour all the way. The old 0 to 1 is the first quarter and looks as it did.
2. Drag it slowly to the end. The picture should go from white through cream and amber to the orange of an old
   overhead projector's lamp; blues and violets should die away first, as under a real tungsten lamp, and reds
   and oranges hold. The warm end is dimmer on purpose; Exposure brings it back.
3. Bad: a jump or a band as you drag, a look that changed colour with the slider where it was, a bulb figure that
   does not follow, a dark corner that gets worse beyond the old end (the vignette is meant to stop at 1).
4. Decide: Home Movie (0.45) and Velvet Underground (0.25) kept their colour. Try Home Movie at 2 or 3, which is
   what an old projector's lamp is; say if you want it, and if you want the end held at the same brightness
   instead of dimmer (PLAN 35e-3).

## 81. Tape reels, a tap pad, a VU needle, a lens cap, a strobe ring (PLAN 35f)

On the desk and the phone, with a band or a microphone playing:

1. Press R (or Record). Two small reels appear in the button beside the clock. The left one starts full and
   turns slowly, the right one starts bare and turns about twice as fast; over several minutes the left
   empties onto the right and the two turn rates come together and cross. Stop and they stop. On the phone,
   the Play screen's Record pill shows the same two reels, still while it waits, turning while it records,
   the clock under them, and the pill is red while it runs.
2. Settings, Audio Input, Tempo: tap the Tap pad four times. The four pips fill, the tempo shows in segment
   digits, and a small light on the pad blinks on the beat you tapped, staying with your tap if you tap a
   fifth time a little late. On the phone it is in the Sound sheet. Listen clears it.
3. The Sound sheet (desk and phone) has a small dial. With a source playing, the needle swings up on each
   kick, about a third of a second to arrive and a soft fall; stop the sound and it lies on its stop; unplug a
   USB input and the dial says "deaf". It is the only thing here that moves with sound.
4. Blackout (header on the desk, Settings, the remote, Draw): off it is a bare lens; on, a cap snaps over the
   lens once and the button is solid red. Draw's off state is no longer red. The remote has one Blackout now,
   in the bar under the thumb.
5. Settings, Plate Spin, above Auto Spin: a ring of dots. In Rate it turns at the dish's speed. In Tempo
   with a tempo tapped or heard, and Beats a Turn at 16, the dots stand still while the dish turns. Set
   Beats a Turn to 48 and they creep backward slowly (the alias). Off, the ring is dim and still.

Bad: reels that turn at one speed, a beat light that drifts off your taps, a needle that jumps or sticks
after the sound stops, a cap that is red when the room is lit, a ring that turns while locked, anything that
moves with reduced motion on (the reels and ring stop and the needle shows the number instead), or a violet
or red that is not "on" or "live". Decide too: the VU dial is the plate's own 0 to 100 volume, not decibels
(PLAN 35f-2).

## 82. Looks as slides in a tray (PLAN 35g)

On the desk and the phone:

1. Click the preset name at the top left. Every look in the menu is a small square slide: cardboard mount, one
   clipped corner, a landscape window with the look's two colours on the film. The slide is the same cardboard
   on every row; the look you are on keeps its violet row, nothing about the slide itself changes colour.
2. Open the set list. Each row is a slide where the little colour square was. Cue a look: the cue bar shows the
   one on stage as a slide, a round tray to its left, and the cued one as a slide behind the arrow.
3. Press Go. The tray clicks one slot, a quick turn with a small overshoot, and settles; nothing else moves.
   Go to a look earlier in the list and it clicks back; to a look far away and it still clicks only one slot.
4. On the phone: the look button at the top shows the slide, the look's name and a small tray that clicks
   when the look changes. The Looks sheet lists slides. On the Play screen the Looks strip is a row of slides
   you flick; each flick stops on one slide (it cannot coast past several), the one up has the violet ring and
   its name in the lit chip, and the tray beside "Looks" clicks when you tap one.
5. With reduced motion on, the tray does not turn.

Bad: a slide whose mount turns violet or red, a tray that spins freely or turns on the beat, a strip that
coasts past slides, a ring clipped at the slide's corner, a click that is a slide-sized jump of the layout, or a
tray on a screen that shows no look. Decide too: ten slots on the drum, a real tray has eighty (PLAN 35g-2).


## 83. The Mac app opens only on a Home or Pro licence (PLAN 23.17d)

After the next Mac release (Actions → Mac app → Run workflow, release ticked), on a Mac:

1. Install the new app over the old one and open it. If this Mac already had a key, the show opens at once,
   with no screen in front of it. Otherwise a sign-in screen is drawn where the plate would be, and nothing
   plays behind it.
2. Sign in with the email and password of an account that has bought nothing. The screen asks you to confirm
   your email if the account is new, then offers Buy Home and Buy Pro. The show does not open.
3. Sign out, and choose Continue with Google. Your own browser opens on the app's address (localhost), you
   sign in there, that tab says you can go back to the app, and the app's window opens the show by itself
   within a few seconds. The tier in the profile sheet is the one you bought.
4. Quit, turn Wi-Fi off and open the app again. It still opens straight to the show.
5. With the app open, open `http://localhost:` and the app's port in Chrome on the same Mac. Chrome shows the
   same sign-in screen, not the show.

Bad: the show visible for a frame before the sign-in screen, a Google sign-in that opens inside the app's
window and is refused, a browser tab that signs in but the app never notices, a licensed app that asks again
with Wi-Fi off, or Chrome on localhost playing the show free. Decide too: offline, a refunded key keeps working
until the app next goes online (no grace period, PLAN 23.17h).

## 84. Home Movie on a Super 8 lamp, and the warm end as bright as the white (PLAN 35e-4)

1. Open Home Movie. It should now be the amber of a home-movie projector, lamp reading 3560 K (Settings, Lamp &
   Light), with orange and coral held and the teal gone dark and quiet, not a brown wash.
2. Drag Lamp Warmth from 1 to the end on any look. The picture should change colour and not get darker; before, it
   lost a third of its light by the end. Exposure still dims it if you want a dim lamp.
3. Bad: a bright red or coral that goes flat and clipped at the warm end (the red is multiplied up to 1.36 at Home Movie, 1.48 at the end), a step
   in brightness at 1, or Velvet Underground, Lucky or any look under 1 that changed.
4. Decide: is 3 (3560 K) the right amber for Home Movie, or the full 3.75 (3200 K)? And is the red clipping on
   hot reds acceptable, or should the end hold only half the brightness back?

## 85. The colour cartoons (PLAN 14ac, 14ac-4)

Five cartoons in colour on the Cartoons shelf (the desk's Dye panel, the phone's dye sheet), marked "colour":
Fiddlesticks, Jack Frost, Balloon Land, Somewhere in Dreamland and Gulliver's Travels.

1. **Pour** Jack Frost on Classic, then on a pale look. The dye should be the picture's own colours (the blues of
   the winter forest, the orange of the autumn), not grey.
2. **Film** Balloon Land and Fiddlesticks with Film Mix at its default and at full. Fiddlesticks is a two-colour
   print, orange and teal with no true blue or yellow; say whether it reads as a feature of the plate or as a
   brown wash (14ac-5).
3. **Gulliver's Travels** is 74 minutes. Pick it on the phone over mobile data: it should start within a few
   seconds and not stall, since the file streams. Say whether a feature is wanted on the shelf at all (14ac-6).
4. Bad: a colour cartoon that pours grey, Pour or Film that does not start on a colour one, or a picture so
   muddy at 384 px that you cannot tell what it is.
5. Decide: do you want the palette to tint them (Film's grade can already), and is there a colour cartoon you
   expected that is not here?

## 86. The tabs across the top are yours (PLAN 8-tabs)

1. Open the desk on a laptop. The chips should read Perform, Sequence, Setup, with a pencil beside them. Perform has
   the set list, bottles, rides, dyes, tools and the knobs Build had; Sequence the set list, Songs, Sequences and the
   score; Setup the controller, Sound, Music & Drone, the Wall and Mapping.
2. Press the pencil. Rename Setup to the venue's name, move it first, add a New tab and put two panels on it with
   + Panel, then reload: all of it should come back as you left it. Delete the new tab (two presses), and "Put the
   shipped tabs back" puts the three back.
3. On the phone: More › Tabs shows the same three, each tab's panels stacked; Setup's Wall and Sound draw in place,
   Perform's bottles and set list are buttons to the phone's own Dye and Looks sheets.
4. Bad: a control you used under Build, Gig, Load-in, Sequence or Sound that you cannot find now on any tab or in
   + Panel; the pencil's list hanging off the screen; a renamed tab losing its panels.
5. Decide: are the three defaults the right split, and is anything on Perform too crowded at 1280?

## 89. The site's security headers (PLAN 19ag)

`firebase.json` now sends a Content-Security-Policy that blocks framing and `<object>`/`<base>` tricks (enforced), a
fuller policy that only logs (report-only), Referrer-Policy, Permissions-Policy and nosniff. Nothing should look
different. The things to try are the ones a policy can break and the cloud cannot reach.

1. After the deploy, open https://chromaglass.art with the browser console open (Cmd-Option-J) and clear it. Sign in
   with Google (the popup), then with an email link or password. Both should work as before.
2. Play a song from the music shelf, open Lyrics, use Song ID, the buy links, the licence key box and a Send of the
   crash report. Open a cast window and the remote on a phone.
3. In the console, lines that begin "[Report Only] Refused to ..." are the policy telling us what it would block if it
   were enforced. Copy them to the thread: each one is an address to add before 19ag-2 turns it on. A line that begins
   "Refused to ..." without "[Report Only]", or a sign-in, song, cast or video that fails, is a bug in this PR.
4. Bad: any sign-in, song, cast, remote or video that stops working.
5. Decide: are you happy to leave the full policy on report-only until the console is clean?


## 87. System audio and Ambient TV mode in the Mac app (PLAN 23.8)

`npm run desktop` verifies that clicking **System audio** in the Mac app intercepts `getDisplayMedia` with no tab picker and routes the System audio pipeline to the ear (using `CHROMAGLASS_AUDIO_TAP=1`, since `CHROMAGLASS_OFFLINE` skips macOS's TCC screen-capture prompt). The real ScreenCaptureKit loopback path needs macOS permission and a streaming app playing on the Mac:

1. Open the Mac app, open **Sound**, and pick **System audio** (where the browser shows **Another tab**). No browser tab picker should appear; on the first run macOS asks once for Screen & System Audio Recording permission.
2. Play an album in a streaming app (Apple Music, Spotify, or another app on the Mac). The sound bar in the Sound panel and the plate's motion (kicks, bass, swell) should follow the album in stereo with no microphone bleed from the room.
3. Quit and reopen the Mac app while the album is still playing: **System audio** is remembered across launches in the Mac app and resumes without asking for a tab.
4. Turn on **Ambient TV mode (cool & quiet)** from the Sound panel, from **Show → Ambient TV Mode (Cool & Quiet)** (`Cmd+Shift+A`), or from the phone's Play sheet tile: the plate steps at 30 Hz, caps display draws at 60 Hz (`DrawGate`), and stays at or below the opening rung so the Mac stays cool and quiet over a long listening session.

## 88. The plate does not stutter now and then (PLAN 14aa)

Play any look for five minutes on the laptop, then with the wall up, the way a show runs. Watch
the liquid's own motion, not the music's: before this, a plate on a machine with room to spare
could stop for a frame and jump two, in bursts of a second or two a few times a minute, worst on a
120 Hz screen. It should glide evenly the whole time. If it still hitches, say roughly how often,
whether the wall and the laptop hitch together, and whether the hitch is the liquid or the whole
picture (the second is a dropped frame, a different thing). Also say if the quality ever visibly
steps down and back up again: it should do that once at most, early, not every minute and a half.

Measured: `npm run cadence` (the old loop, modelled, stopped or doubled the liquid on 7–40 % of
frames on 60, 59.94 and 120 Hz displays, by the median of nine seeds; the new clock on none, and
it keeps time with the wall up at another refresh rate); `npm run encode` (a step's garbage 506 KB → 31 KB);
`npm run rungs` (a rung the machine cannot hold retried 38 times in half an hour → 10).

## 90. The game controller's ring, and the ear after its detectors changed (PLAN 14ab-7, 14ab-8)

Both are meant to look and sound as before; this is the look at that, on a real pad and a
real song. (§88 is the stutter, §89 the headers.)

1. Plug in or pair a controller. Push the left stick: a ring should follow the plate under it, as smooth as the
   mouse's pointer, and swell and tint when you hold the right trigger. Let go and it should fade after about
   two and a half seconds. On the phone nothing changes (no ring without a pad).
2. With the pad connected, open the Perform desk's clock and the meters: nothing else on the page should be
   busier than with the pad unplugged.
3. Play a song with clear drums. The kick and snare triggers (Sound › patch bay, the plate's kick bloom) should
   land on the same hits as before this change: the readings are the same to the bit on the checks' songs.
4. Bad: a ring that lags behind the stick, jumps to a corner when it first appears, or stays after the stick is
   released; a beat that used to fire and does not.

## 91. The wall's "isn't full screen" chip goes when it should, and can be hidden (PLAN 14af)

The chip at the top of the desk that says the wall window isn't full screen. It used to be
stuck there, unexplained, with no way to close it.

1. Send to wall with a projector (or a second screen) connected. The wall should fill its
   screen by itself, and no chip should show on the laptop.
2. Click the wall and press Escape. Within half a second the laptop should show "The wall
   window isn't full screen, so its title bar shows on the wall". Click **Make it full
   screen**: the wall fills again and the chip goes.
3. Escape on the wall again, then in the Mac app use the wall window's green button instead:
   the chip should go too (the window's own full screen has no title bar in the app).
4. Escape once more and click the chip's X: it should stay away until a new wall window is
   opened, even though the wall is still framed.
5. Bad: a chip that stays up over a wall with no title bar; a button that does nothing and
   says nothing; an X that comes back a second later.

## 92. The live stream, to an unlisted YouTube broadcast (PLAN 37x-4b)

The lab streams to its own server and measures the stream; only a real platform can say it
takes ours, and only a camera can say the sound and the plate agree after the Mac's
system-audio path. Unlisted, never public, until you say so.

1. In YouTube Studio, Go live → Stream, an **unlisted** broadcast; copy the stream key. Open the
   Mac app, the console (View → Toggle Developer Tools), and `docs/live-show.md`'s four lines
   with that key. Within thirty seconds Studio's preview should show the plate, "Excellent
   connection", no dropped frames in `__cgLive.state()`.
2. Open the album in Qobuz or YouTube Music with the app's sound source on *System audio*.
   Watch the broadcast on a phone (it runs twenty or so seconds behind): a hit in the music
   should bloom the plate right after the hit, as it does on the laptop, not before it.
3. Clap once in front of the laptop's camera with the microphone as the source: in the
   broadcast, the clap and the plate's bloom should fall together within a frame or two.
4. Stop with `__cgLive.stop()`; the broadcast should end cleanly in Studio within a few seconds.
5. Bad: Studio never shows a picture (the key or the RTMPS path), the sound runs ahead of or
   behind the plate by more than a frame or two (the Mac's clock, the plan's note under
   37x-4b), frames dropped with a good upload, or the app's frame rate falling while live
   (`npm run stutter`'s two-step frames, 37x-4c).
6. Several at once (37x-4c), with whichever second account exists (Twitch, Kick, a Facebook
   Page; or a second unlisted YouTube stream): keep both keys in the store, then
   `await __cgLive.start({ destinations: [{ name: 'youtube', url: 'rtmps://a.rtmps.youtube.com/live2', keyName: 'youtube' }, { name: 'twitch', url: 'rtmps://live.twitch.tv/app', keyName: 'twitch' }] })`.
   Both previews should show the plate; `(await __cgLive.state()).transport.destinations`
   gives each one's kbps, seconds behind and dropped frames. `measuredAt` should read
   `server` for YouTube (it acknowledges what it receives; if it reads `socket`, the
   seconds-behind figure only sees the Mac's own buffer: say so).
7. If Instagram or TikTok live is open to the account: add a destination with
   `orientation: 'portrait'`. On a phone it should fill the screen with the middle of the plate,
   sharp, not squeezed; the landscape one beside it unchanged.
8. Turn the Wi-Fi off for ten seconds and on again while live: each destination should come
   back on its own within half a minute (`reconnects: 1`), the broadcast resuming, not a new
   one. A wrong key on one destination should fail that one alone, once, with the
   platform's words, while the others stream.
9. The panel (37x-4d), instead of the console: + Panel → Live Show. Add the unlisted YouTube
   broadcast (paste its key; the field should empty and say "Key kept"), press **For tests**
   on it, and **Test**: the same picture as step 1. Add a second destination, leave it on,
   and press **Go live**: it should ask "Go live to …? Press again" and do nothing until the
   second press (use the unlisted one turned on, not a public key). While live, each row
   should show its Mb/s and seconds behind; on the phone remote a red Live chip with the
   clock on Draw and Controls, and two taps on it should stop the stream on the Mac. After
   a stream, the line under the buttons should name the upload the stream carried.

## 93. The rig, with free programs: OSC, Art-Net, MIDI, Ableton, Resolume (PLAN 34a-7f)

`npm run rig` plays every part of a rig with sockets of its own: an OSC sender, a fixture, a
lighting desk, a controller and a DAW's clock, against the real show server with a Pro key. It
cannot say that the programs a buyer owns send and read what it does. One sitting, about an
hour, all free. Install first: **QLC+ 4** (qlcplus.org, open source), **TouchDesigner**
(derivative.ca, the free Non-Commercial key with a Derivative account), **Ableton Live 12
trial** (ableton.com/trial, 30 days, an Ableton account), **Resolume Arena demo**
(resolume.com/download, a watermark and a spoken reminder, no time limit), **Protokol**
(hexler.net, free), and for the video route **OBS** with **DistroAV** (`brew install --cask
distroav`, which asks for the free NDI runtime). Syphon, NDI and Ableton Link out of the app
are "on the way" on `/pro`, so there is nothing of ours to test there yet (no Syphon Simple
Client or LinkHut this time).

0. In the repo on the Mac: `npm run rig`. Every line ok, including the two the cloud skips
   (the plate's colours on the fixture, and an OSC blackout blacking out the rig).
1. **OSC in, from TouchDesigner.** Mac app → Show → OSC input → *This Mac only*. In
   TouchDesigner add an **OSC Out DAT** (network address 127.0.0.1, port 9000), then in the
   Textport: `op('oscout1').sendOSC('/chromaglass/setting/audioImpact', [0.8])`. Sound Impact
   on the Design desk reads 0.8. Then `sendOSC('/chromaglass/action/blackout-toggle', [1])`:
   the plate goes black, sent again it comes back; and `sendOSC('/chromaglass/dye',
   ['#ff8800'])` makes the dropper orange. Bad: nothing moves (the Show menu, the port), or a
   value arrives scaled wrong.
2. **OSC in, from Resolume.** Arena demo → Preferences → OSC: output on, 127.0.0.1, port 9000.
   Shortcuts → Edit OSC, a new preset, click a layer's opacity slider, tick OSC *output*, pick
   *custom* and type `/chromaglass/setting/audioImpact`. Move the slider: Sound Impact follows.
   Say whether the custom address was there; if Resolume can only send its own addresses, the
   page's "send it from Resolume" needs a line on how (PLAN 34a-7g).
3. **Art-Net out, into QLC+.** Quit the app, then start it from Terminal so it reads the
   settings (34a-7c: there is no panel yet):
   `ARTNET_HOST=127.0.0.1 ARTNET_FIXTURES=4 /Applications/ChromaGlass.app/Contents/MacOS/ChromaGlass`.
   QLC+ → Inputs/Outputs → universe 1: tick Art-Net *Input* on 127.0.0.1 and *Passthrough*;
   open the **DMX Monitor**. Channels 1–12 should move with the plate's colours (four RGB
   fixtures), dim when the glass thins, and go to zero on a blackout. Bad: all zero on a full
   plate, colours that lag the screen by more than a beat, or channels out of order.
4. **Art-Net in, from QLC+.** In QLC+ untick universe 1's Art-Net input (it holds port 6454)
   and tick Art-Net *Output* to 127.0.0.1 instead. Start the app from Terminal with
   `ARTNET_IN=1:audioImpact` and no `ARTNET_HOST` (with both, the app ignores the universe it
   sends on, which here is QLC+'s universe 1, Art-Net 0). In QLC+'s **Simple Desk**, move
   channel 1: Sound Impact follows, 0 to 255 as 0 to 1.
5. **MIDI clock and CC, from Ableton.** Audio MIDI Setup → MIDI Studio → IAC Driver: *Device is
   online*. In Live → Settings → Link, Tempo & MIDI: IAC Driver Bus 1 output, **Sync** and
   **Track** on. In the app, Settings → Inputs → Controller: MIDI on, input IAC Driver Bus 1;
   Settings → Sound → Tempo: MIDI clock. Press Play in Live at 128 BPM: the app's tempo reads
   128 within a few beats, and Stop in Live stops the show. Change Live's tempo to 100: the app
   follows. Then a MIDI track sending to IAC with a CC lane; MIDI-learn it to a control in the
   app and play: the control rides the automation, on the bar it was drawn on.
6. **MIDI out, into Protokol.** In the app's MIDI section pick IAC Driver Bus 1 as the LED
   output too; open Protokol's MIDI tab. Moving a learned control from the screen sends one CC
   per change on that control's number (not a stream, and nothing while your hand is on it).
7. **Video into Resolume.** OBS: a Window Capture of the app's projector window, then Tools →
   DistroAV NDI Settings → Main Output on. In the Resolume demo's Sources, the OBS NDI source
   appears; drop it on a layer: the plate plays in Resolume at full frame rate. This is the
   route `/pro` gives for Resolume, MadMapper and TouchDesigner until Syphon and NDI ship.

Write down, per step, ok or what you saw. A step that fails is an item in PLAN §34a-7.

## 94. The melody walks across the plate (PLAN 24.3-place)

Aurora Borealis and Oil & Water now let go of a drop for each note of a tune, low notes on one side of the plate and
high notes on the other. Melody Walk is in the desk's Show section (beside Kick Bloom) and the remote's sliders, 0 on
every other look.

1. Load Oil & Water, play a song with a clear lead (a piano, a voice, a synth line) through the microphone. A bead
   of amber oil should land for most notes, left for low and right for high, a harder note a bigger bead; a tune
   that goes up and comes back should draw there and back.
2. Load Aurora Borealis with the same song: jade and lavender drops along the top of the curtains.
3. Turn Melody Walk to 0 on each: no drops. Turn it up on Classic: a row of drops across the middle.
4. Play a song with only drums: nothing should land. A song with a loud kick under a lead: the lead should still
   land (about two notes in three; 24.3-place-2).
5. Bad: a drop that lands a note late (a tenth of a second is the design), a drop for every kick or snare, drops
   that all pile up at one end, or the plate filling with oil from a long song.
6. Decide: is the line in the right place on each look, which looks want one next, and should the music's colour
   (True Synesthesia) move to the finer pitch (24.3-place-4)?

## 95. Ableton Link with Live (PLAN 13.5-link)

`npm run link` plays a Link session against the show server with a stand-in for Live written
from the same reading of the protocol, so only Live can say the two agree.

1. Live and the Mac app on the same Mac. In Live, Preferences → Link, Tempo & MIDI → Link on,
   and the Link button in the transport bar lit. In the app, Settings → Sound → Tempo → **Link**.
   Within a second or two the line beside it says "following 1 app", the tempo readout says
   Live's tempo and "Link", and Live's transport bar says **1 Link**.
2. Play a four-on-the-floor clip at 124. The plate's kicks should land with Live's kick, the
   same way a MIDI clock's do; Beat Lead at 0. Change Live's tempo to 132 mid-clip: the readout
   follows within half a second and the kicks stay on the beat.
3. With the app open *first* and Live opened after: Live keeps its own tempo (the app must
   never hand Live its 120).
4. On two machines on the same Wi-Fi (Live on one, the app on the other): as step 2.
5. Link off: Live's count goes back to 0 within a second, the readout to "listening".
6. Bad: "looking for a session" for more than a few seconds with Live's Link on (a firewall
   prompt for the app, or the protocol), kicks a steady few milliseconds early or late (the
   clock offset), Live's tempo changing when the app joins.

## 96. Colour that answers the music (PLAN 25i)

Three looks now take their colour from the music without a hue being turned. `npm run areacords`
holds the arithmetic and the plate in the lab; only a real plate says whether it reads as music.

1. Load **Poster, 1969** and play a song with a clear lead (a voice, a synth line, a piano) through
   the microphone. The kick pours into the left shape; the colour of each pour should follow the
   tune: notes C to D# orange, E to G ultramarine, G# to B purple. A tune that moves should leave
   a run of colours in the shape; a held note, the same colour pour after pour.
2. Load **Red Cabbage** with a song with drums. Each snare should bloom pink in the left well and
   each kick turn the right well green, with no pink or green paint poured: the colour should come
   up through the violet where the drop landed and spread as the liquid moves. Where the two
   meet across the middle they should go back to violet.
3. Load **Chemical Clock** with the same song. Each kick should start a ring in one of three
   places (upper left, upper right, bottom), taking them in turn; a ring passing through a place
   should hold back the next touch there until the gel recovers.
4. Bad: Poster's colour changing on the drums rather than the tune, a pour that changes colour
   halfway (a pour keeps the bottle it was picked up with), Red Cabbage's wells saturating to one
   flat colour within a minute, or Chemical Clock's rings coming so often they wash the spirals out.
5. Decide: which other looks should hear the note (25i-1), and whether Chemical Clock wants the
   snare and hats touching places of their own as well.

## 97. The oil beads drawn on the GPU (PLAN 14ab-6)

The beads' mask is drawn by the plate now, not by a canvas and an upload. `npm run beadmask`
holds the drops to the CPU's drawing to a level, but the rings' edges were the canvas's
antialiasing and are now each pixel's coverage, so an edge can sit a few levels apart.

1. Fillmore with Oil Beads at 0.8 and Drops at 0, then Drops at 1, a minute of each with
   music. The beads should look as they did: rings with a thin dark rim, drops with their
   colours, walls and passengers. Nothing should flicker, lag a frame behind the flow, or
   draw a bead where none is.
2. The closeup at 3x on a crowd of rings: their rims should be as thin and even as before,
   with no staircase of dark squares round the edge (droplens's old fault).
3. The governor's readout with Drops at 1, before this change and after if you have the
   last build: the frame should be cheaper, most on the busiest crowds.
4. Bad: a stripe or square of mask missing (a tile the list did not reach), drops drawn
   upside down against the flow, a passenger outside its drop.

## 98. Every dial from very gentle to very extreme (PLAN 27h-1)

Twenty-five dials go further than they did (the list is in PLAN 27h-1). The looks have not
moved: every look's own value is where it was, so a look should open exactly as before.

1. Any look, each widened dial at its first step and at its top, with music. The first step
   should be barely there; the top should be more than nature, never black, one flat colour or
   frozen. Magnet Strength at 3 over ferrofluid should stand the spikes up full, which 1 never
   did at the default height. Saturation at 0 is a grey plate.
2. The curved dials (Gel Speed, Film Grain, Grain Size, Gate Weave, Grain Fineness, Shot Length,
   Bass Boost, Evaporation, Flick Strength, Evolve Speed, Plate Rock, Kick Bloom, Hue Journey,
   Macro Zoom): the look's own value should sit a third or so along the slider, not hard
   against the left stop, on the panel, a pinned desk fader, the phone and a MIDI fader alike.
3. Evolve on for five minutes: it should wander the widened dials no further than before.
4. Bad: a dial whose top does nothing more than the old top did (a clamp left behind), or a
   plate that blows up at a top.
