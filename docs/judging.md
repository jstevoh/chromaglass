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

Pushes Dye (Squish Plate, under the ferrofluid) is on full in Ferro Paint:
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

---

## Reading the frame time while you do it

`?debug` puts `chromaglassDebug()` on the window. `status.frameMs` is the real
frame interval, `status.label` is the solver and grid actually running, and
`status.steppedDown` says whether the governor has had to retreat. `?set=` takes
any setting by name, semicolon separated, and lasts for that page load only —
nothing it does reaches a saved look.
