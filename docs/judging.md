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

## 7. The closeup's cells, riding the paint

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

## 8. Maze Detail, and Ferro Maze at 0.5

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

---

## Reading the frame time while you do it

`?debug` puts `chromaglassDebug()` on the window. `status.frameMs` is the real
frame interval, `status.label` is the solver and grid actually running, and
`status.steppedDown` says whether the governor has had to retreat. `?set=` takes
any setting by name, semicolon separated, and lasts for that page load only —
nothing it does reaches a saved look.
