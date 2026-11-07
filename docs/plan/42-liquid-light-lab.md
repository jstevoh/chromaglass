# 42. What Liquid Light Lab's tutorials and gear showed (asked 2026-11-07)

Asked 2026-11-07: go through the tutorials linked from Liquid Light Lab's Linktree (a working
New York liquid light show, active since the late 2000s) and find what the app could learn,
in the controls and in the physics.

**What was reached and what was not.** The Linktree links the YouTube channel, the main site,
the shop, a magazine interview and a history blog. The channel's how-to videos were listed
(below) but none could be watched or transcribed from a cloud session: YouTube refuses the
video and its captions to a cloud address (`.claude/skills/watch/SKILL.md`, "YouTube from a
cloud session"). What *was* read in full: the shop's product pages, written by the performer
about the glass, dyes, dishes, turntables and transparencies he uses and why; the gear tour's
chapter list; the interview. Every item below names which of those it rests on. Where only a
title was seen, the item says so and does not guess at what the video shows; **42m** is the
pass that watches them.

The how-to videos, by title: *How To Make A Liquid Light Show, Pro Tutorial, Part 1* (16:54)
and *Part 2, The Overhead Projector* (10:04); *Mixing Two Plates & How to Fix Some Problems*
(6:55); *Fast Glass vs Slow Glass* (2:19); *Quick Tutorial* (2:11); *(Demo) Classic Mixture,
Super Color Dancer, Triple Plate, and Evaporation Plate*; *How To Make A Color Wheel* (12:23);
*Warping a Ripple Wheel* (3:26); *Analog-Digital Gear Tour* (31:35, chapters: signal flow,
video mixer, MIDI controller, camera arms, LED turntables, moiré transparencies, "shiny
things", digital feedback, kaleidoscope, oscilloscope and lasers); a short on the diffraction
film over an oscilloscope; *Analog Video Signal Flow, Video Feedback*.

What the shop says the craft turns on, in its own words:

- **The glass pair is the instrument.** Matched clock-style glasses, a 15" bottom and a 10.5"
  top, 1/8" (3.4 mm) thick, both curved so the bottom spins. "The relationship of the top and
  bottom glass affect the patterns possible, along with control. More space between them
  leads to easier, faster control, while less space between them creates a broader, slower
  'squish'." *Fast* glass: a very curved top against the bottom, "speed and accuracy... tight
  control... great for beginners". *Slow* glass: flatter, "a broader, tighter squish... big
  gooey, bubbly shapes much easier... can even be used as 'set and forget' plates."
- **A triple plate**: 15" bottom, 12" middle, 10.5" top, "individual movement for both the
  middle and top plate".
- **Open dishes**: 6" borosilicate petri dishes "for blow plates, floaters, and plates where a
  flat bottom with spherical outline is desired".
- **The classic mixture**: concentrated, transparent, vegetable-based oil dyes that "mix easily
  with mineral oil, and float well on top of water"; "only require a few drops".
- **Light from underneath that moves on its own**: an RGB turntable (6" and 12") with 12 solid
  colours and 366 patterns ("scanning, scrolling, spinning, breathing, fading, and blending"),
  and a platter whose spin, direction and speed are on a second remote, independent of the
  light.
- **Moiré transparencies on a ball-bearing lazy Susan**: "line up patterns and spin them
  perfectly on top of one another... a very tight and mesmerizing interference effect, which
  is not achievable by hand."

Already in the app, so not items: a gel wheel over the lamp (the colour wheel), the LED
platform under the plate with its own rotation, the Spin tool and Auto Spin, two projectors
and five layers with the Mixer, a film layer that takes a live camera, kaleidoscope (Show),
MIDI with factory maps, OSC, Syphon and Resolume (§13), Evaporation and the lamp's heat (38f).
Video feedback is a VJ tool's job downstream of the plate (§31's "Not copied"), so it is not
an item.

## Items

- **42a. A glass pair, not a unitless Plate Shape** (*proposed*, M; physics at the core).
  *The evidence:* the shop's Fast and Slow glass and its rule of thumb above; the *Fast Glass
  vs Slow Glass* video (title only). *Today:* the gap at rest is already a dome
  (`wgsl/fluid/gap.ts`, `gapRest` and `squeezeUpdate`: `GAP_REST·(1 − plateCurve·(2r² − 1))`),
  but its curve is **Plate Shape**, a −1…1 number no preset sets, and the code's own comment
  says the shape "has never been visible". *The physics:* a top glass of radius R_t resting
  convex side down in a bottom glass of radius R_b leaves a gap h(r) = h₀ + r²/2·(1/R_t − 1/R_b),
  the same r² the shader already draws; Fast is R_t well under R_b, Slow is the two close. The
  gap's flow is a Hele-Shaw cell, mobility ∝ h³, so liquid pressed out from the middle runs
  through Fast glass's wide rim many times faster than through Slow glass's narrow one: that
  cube *is* "easier, faster control" against "broader, slower squish", and it needs no new
  force, only the real shape. h₀ is not free either: the top glass floats on the liquid, so
  the volume poured sets it (the Liquid amount dial proposed with 38r part 2, #655). *Build:* a **Glass** choice (Parallel, as
  today and the default, keeping every look; Fast; Slow; and a custom pair in R_t and R_b, or
  in each glass's sag measured with a ruler and a straightedge, R = r²/2·sag) that sets the
  dome from those numbers; Plate Shape becomes the custom curve's dial and may still ramp past
  any real glass. The top glass's own diameter (10.5" over 15") bounds the squeezed region,
  with the open ring outside it (the open-rim rule #655 adds). Desk, MIDI, phone's Play
  sheet. *Check:* the same press on Fast, Slow and Parallel: the pressed ring's spread speed
  ordered Fast > Parallel > Slow, by the h³ ratio at the ring's radius within a stated
  tolerance, and the liquid's volume conserved on each (extend `npm run gap`). Lands after
  #655 (38r part 2, 2 mm), whose rest gap it shapes; the owner's own glass, measured, answers
  38r's "a guess to confirm".
- **42b. Turn and slide the top glass by hand** (*proposed*, M). *The evidence:* "tight control
  over liquids in the right hands" (the shop, of the Fast top); the triple plate's "individual
  movement" of the top. *Today:* the Spin tool turns the dish (the bottom glass); the Press
  presses the top; Plate Rock and Frame Sway slide the cover by its shear on the film, but
  no tool lets the hand drag or twist the top glass. *The physics:* Couette shear across the
  gap, the film's depth-averaged velocity half the cover's, on top of the pressure-driven
  flow; twisting the top over a still bottom winds the middle against the rim (what 22l says
  nothing does now). *Build:* a Cover hand on the Spin tool (a modifier, or a second finger on
  touch) that drags or turns the top glass, coasting on the film's drag when let go; the
  phone's pad the same. *Check:* a turned cover over a still dish carries dye at half the
  cover's speed in the film (Couette), and the dish under it stays still.
- **42c. A triple plate** (*proposed*, L; after 42a and 42b). *The evidence:* the shop's triple
  plate set; the *Demo* video's title. *Today:* up to five layers, but each is its own dish;
  none shares a glass with another. *The physics:* two gaps with the middle glass between
  them: the middle glass's motion shears both films, and pressing the top presses the middle
  and so both gaps. *Build:* a layer may be set as the gap *above* another, sharing its middle
  glass's motion and press; the Mixer shows the pair as one stack. *Check:* turning the middle
  glass moves dye in both gaps the same way; turning the top moves only the upper gap.
- **42d. An open dish: blow plates and floaters** (*proposed*, L). *The evidence:* the shop's
  petri dishes "for blow plates, floaters"; a short titled "You're not blowing" (a petri dish
  on an overhead, title only). *Today:* every plate is a covered sandwich; Blow makes air
  pockets between glasses (38b), which is right for a covered plate and wrong for a dish with
  no lid (15g-3 says the same). *The physics:* a free surface: a straw's jet dimples it
  (Δh = p/ρg, about 2 mm at 6 m/s, 15g-2) and shears it outward, so a blow plate pushes the
  floating oil aside in a ring instead of trapping a bubble; floaters ride the surface. Shares
  15g-3's moving height (dh/dt + ∇·(hu) = 0) and decides 38r-1 (an open dish sloshes; a
  sandwich does not). *Build:* a **Dish** choice, Sandwich (today) or Open, round and flat
  bottomed; on Open, Blow is a surface jet. *Check:* on Open a held blow clears a ring of oil
  that closes when the breath stops, with volume conserved; on Sandwich, Blow is unchanged.
- **42e. The classic mixture's real numbers** (*proposed*, S; folds into 18d-3 / 38s).
  *The evidence:* the shop's dyes ("mix easily with mineral oil, and float well on top of
  water"; a few drops of concentrate) and the *Classic Mixture* demo (title only). *Today:*
  the oil bottle's numbers are scattered (38s lists them); 38e (#624) gives oil its σ in N/m.
  *Build:* the oil bottle named and set as light mineral oil: ρ ≈ 850 kg/m³, μ ≈ 15–30 mPa·s,
  oil–water interfacial tension ≈ 0.04–0.05 N/m (handbook ranges; pick one value per bottle
  and cite it), its dye soluble in the oil and not the water, so colour stays with the oil
  body (Oil Bodies already keeps the two colours). *Check:* the bottle's table entry is read
  by every reader 38s names (`npm run gap`'s grep pattern, one number per liquid).
- **42f. The RGB turntable: patterns that breathe and scan, apart from the spin**
  (*proposed*, S–M). *The evidence:* the shop's Color Dancer pages; the gear tour's "LED
  Turntables" chapter. *Today:* LED platform modes are static conic gradients (rainbow,
  ocean, fire, cyberpunk, single colour) with an LED Rotation Speed. *Build:* LED patterns
  that move in time (breathe, scan, chase, fade between solids) on the beat clock or free;
  the light's rotation kept apart from the dish's Spin, as the real unit's two remotes are;
  both on MIDI, the desks and the phone. The light stays the lamp: it goes through the dye by
  Beer–Lambert (18b), so a red light under a blue dye goes dark as it does on glass, never a
  colour painted over the plate. *Check:* a breathing pattern's lamp brightness follows its
  period; with Spin at 0 the LED pattern turns and the dye does not.
- **42g. Moiré transparencies on a turntable** (*proposed*, M). *The evidence:* the shop's
  moiré sets and lazy Susan; the gear tour's "Moiré Transparencies" chapter. *Today:* nothing.
  *The physics:* two transparencies in the beam multiply their transmissions; two line
  gratings of pitch d at an angle θ beat into fringes of spacing d / (2·sin(θ/2)), so a slow
  turn sweeps the fringes fast and wide. *Build:* a Moiré layer in the Mixer (a pair from a
  small set: lines, rings, dots), one sheet turning at a rate or by hand, its angle on MIDI;
  through the lamp like the gel wheel, so it darkens the plate where the lines block it.
  It is an object in the beam, not a warp of the picture, so §31's "Not copied" does not
  cover it. *Check:* the fringe spacing measured off the frame matches d / (2·sin(θ/2)) at
  three angles.
- **42h. A diffraction film in the beam** (*proposed*, S–M; low). *The evidence:* the short
  "how the diffraction film over the oscilloscope works" (title only); the gear tour's
  "shiny things" chapter (title only). *The physics:* a grating film throws each bright
  point into spectra at sin θ = mλ/d; on the plate the lamp's hot spot, bubble glints and
  clear pools would fan into rainbow streaks along the grating's axis. *Build:* a Diffraction
  sheet in the Mixer (pitch, axis, strength), applied to the light, not painted.
  *Check:* the first order's red sits farther out than its blue by the ratio of wavelengths.
- **42i. A ripple wheel** (*the owner's call*). *The evidence:* *Warping a Ripple Wheel*
  (title only). A disc of rippled glass turning in front of the lens; its displacement is
  refraction, (n − 1)·t·∇h of the glass's surface. §31 put "Ripple and Displacement warps"
  under "Not copied", as a VJ warp; a turning wheel of real glass in the beam is closer to
  the gel wheel than to a warp, but it does move the whole picture. Written down so the owner
  can say yes or leave it under "Not doing".
- **42m. Watch the tutorials on the owner's Mac** (*proposed*, S; before 42a's numbers are
  final). The how-to videos above could not be reached from the cloud. On the Mac, `npm run
  watch` takes each URL (the watch skill's first choice): contact sheets, a timeline and the
  captions for *Pro Tutorial* parts 1 and 2, *Mixing Two Plates & How to Fix Some Problems*,
  *Fast Glass vs Slow Glass*, the *Demo* (classic mixture, triple plate, evaporation plate)
  and *Warping a Ripple Wheel*. Then revise 42a–42i from what they show, and add what they
  teach that the shop does not: the problems and their fixes, the evaporation plate, the
  order a performer builds a plate in (which 36c's practice plate should follow).
