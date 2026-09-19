# Four things that need your eyes and a real GPU

Everything in this file was changed on evidence that a sandbox can produce —
arithmetic, kernels, deterministic simulations — and none of it has been seen on
a machine that renders the plate at sixty frames a second. This is how to judge
each one in about a minute, and how to put it back if you disagree.

The sandbox this was built in rasterises in software at two or three frames a
second. That is enough to prove a kernel and useless for judging a look, so
these are the four decisions where my evidence stops and yours starts.

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

---

## Reading the frame time while you do it

`?debug` puts `chromaglassDebug()` on the window. `status.frameMs` is the real
frame interval, `status.label` is the solver and grid actually running, and
`status.steppedDown` says whether the governor has had to retreat. `?set=` takes
any setting by name, semicolon separated, and lasts for that page load only —
nothing it does reaches a saved look.
