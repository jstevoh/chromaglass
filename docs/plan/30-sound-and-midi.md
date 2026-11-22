# 30. Shaping the sound and the MIDI: what Imaginando's VS rig showed (2026-10-11)

*Asked 2026-10-11: the owner shared Imaginando's post of an iPad running FRMS (a
granular synth) and GRFX (granular effects) inside AUM, driving visuals made in VS, as
an improvised audio-visual set, and asked what ChromaGlass should change or add. The
owner put all of it into the plan the same day.*

**What VS is.** Imaginando's visual synth: up to eight shader layers with blend modes,
four voices a layer, four LFOs, two ADSR envelopes a layer and one modulation matrix.
Its audio modulators either follow peaks (gate) or follow a band picked by dragging on
a live spectrum, each with threshold, gain, attack and release. It reads MIDI notes,
velocity, CC, clock and Program Change, keeps time on its own clock, MIDI clock or
Ableton Link, plays playlists with a duration and a fade per entry, and sends NDI,
Syphon and Spout. FRMS and GRFX are the sound side and have nothing visual to borrow.
AUM is the iPad host: it routes audio, routes and filters MIDI through a matrix, and
keeps everything on Link.

**Where ChromaGlass already stands.** The patch bay is VS's matrix (sources onto any
setting, bipolar depth, per plate: `SceneMapping` in `types.ts`); the named kick, snare,
hats, bass, note and eight bands are its audio modulators; the set list and the
sequencer are its playlists; MIDI learn, clock and timecode come in; Record is its
recorder; and Art-Net puts the plate on the room's lights, which VS does not do at all.
The gap is in how a sound or a note is shaped before it reaches a setting.

**Ranked.** By what a performer gains for the work; each is briefed by Claude with its
check written first and built by Antigravity. None moves the whole frame by default
(the owner's rule), and every reading is a fast one (the owner's rule for sound patches).

1. ~~**30a**, below: shape each sound cord.~~ (Shipped; `npm run soundcords`.)
2. ~~**14t-pc**: Program Change picks a look or a set-list item.~~ (Shipped; `npm run soundowed`.)
3. ~~**24.3**, moved up: notes as voices, with an envelope per note and notes as a source.~~ (Shipped; `npm run soundowed`.)
4. **13.5-link** before **13.5-osc**: Link first.
5. ~~**30b**, below: LFOs and envelopes you set.~~ (Shipped; `npm run soundowed`, `30b-loop` open.)
6. **13.4-ipad**: playing from an iPad in AUM, written up and tried once.
7. **13.7-ipad**, later: an AUv3 bridge for iPad hosts.

NDI, Syphon and Spout out (13.2, 13.3) stay where they are: VS ships all three, so a VJ
expects them. The lights (14q, R8, 14m) stay next. §23 has VS's price.

**Re-read 2026-10-24 (VS 2).** The owner sent VS 2's page and asked what to bring in;
nothing in the list above had shipped. VS 2 shows one thing new to this plan: each
layer listens and modulates on its own. That is **25h** (areas that listen for
themselves), and it goes first, since it answers the owner's same-day ask for parts of
the plate reacting to the music and more varied palettes. The rest folds into items
already here: chords placed across the plate (24.3), a smoothed random and a restarted
LFO (30b), a live picture poured in as dye (§13 step 6, video in) and a portrait clip
(34f). The order now: 25h, 30a, 24.3, 30b, 14t-pc, then the rest as above. Not copied,
as before: the shader editor and imports, the feedback layer, and anything that moves
the frame; VS's oscilloscope and audio-visualizer shaders are 34c and 34d's (the
analyzer look; Chladni figures, real physics). Pricing was left out at the owner's word.

## ~~30a. A sound cord has only a depth~~ (shipped 2026-10-26)
- **30a-1. The dragged band on the cast display and the phone remote.** Decided with 30a:
  on a second screen attached to the laptop (`StageMirror` in `CastDisplay.tsx`), the
  projector mirrors `#liquid-canvas` directly, so it shows the laptop's fold (including
  dragged-band cords) frame for frame. A standalone network `CastReceiver` rebuilds
  `AudioData` from `CastAudio` on the wire with no spectrum behind it (`liveValue`,
  `sceneMap.ts`), so `sound` cords fold and gate there while `bands` cords (fixed or
  dragged) read nothing, matching fixed `bands` cords today. Carrying evaluated `bands`
  cord readings over `CastAudio` if standalone receivers need `bands` patches remains open here.
- **30a-2. Found in the review of #511.** (a) Shipped with it: an area cord on a dragged
  band read 0 for the whole of a look fade (the range was kept per mapping object and a
  fade builds every object again each frame); `AreaHands` now keeps the `BandRange` with
  the cord's gate, and `areacords -- --node` holds it. Open: (b) `soundcords` has no line
  that holds the drag's `AutoRange` minimum span against a quiet, narrow band (its tape's
  band5 always swings far over 12 dB, so a 12 dB span passes); (c) `BandStrip` never
  resets its `BandRange` when the band changes, so after a drag its live level reads
  against the old band's range until it catches up; (d) the rule for when a cord gates is
  written out twice in `SettingsPanel.tsx` beside `gated()` in `areaCords.ts`; import `gated`.
- **30a-3. The plate at Beat Squeeze 0.8 stepped a quarter slower on the Mac runner from
  the first runs carrying #511 (found 2026-10-28, #541).** `npm run squeeze`'s fifth-shard
  log on 42 runs: the window at 0.8 read 220–309 steps in 12 s on every base without
  864b4e2 and 170–217 on every base with it, two of them before the governor (#474)
  merged; the window at 0 right after read the same throughout (208–354, then 302–359).
  One branch whose own diff did not move read 299 on f85afa6 and 210 on a24bf12. #541's
  timeline: warm, 241 steps at 0.8 against 326 at 0, the frames halving (about 25 a second
  against 50) while the squeeze is up. Not seen on the owner's M4 (360 steps in every
  window either side of #511, 2026-10-28). Nothing #511 changed is on the press's path
  that reading finds (`pressKick`, `KickRelease`, `flushDeltas`, the slosh dish's
  presses); its per-reading `spectrum` copy (`AudioFeatures.update`) and the patch bay's
  per-cord state are what it adds every frame. *Measure:* the squeeze's cost on the
  runner, a frame's CPU and GPU time with the squeeze up and down (`timestamp-query`), on
  7230f0c and on 864b4e2; then make the dear part cheaper, and the window at 0.8 back
  near the window at 0. #541 made the check's warm-up wait for the rate over three
  seconds of the page's clock (it took one second of the harness's, which ran long), so
  the window no longer opens on a plate still climbing; the bar is unchanged. With #541 in, #550's
  run on 2026-10-30 read 194 at 0.8 against 331 at 0 (bar 200), so the warm-up was not the cause;
  the quarter is, and the line stays red about half the time until it is found.

## ~~30b. The LFOs and envelopes are fixed~~ (shipped 2026-11-08)
- **30b-loop. A recorded song's onsets driving `Modulators.trigger`.** In `soundowed.mjs` the drum loop is written out; the ear's kick and snare onsets call `trigger('kick')` and `trigger('snare')` in `Modulators.step`, and a check line feeding a recorded song's analysed onsets through the ear to `trigger` remains open here.

**Not copied.** A shader editor and imports from Shadertoy, ISF or GLSL Sandbox: the
plate is a simulated liquid, not a stack of shaders (the owner's rule to model the real
phenomenon), and VS sells pasting shaders made by a chatbot, which fails the rule that
nothing in the app seems like AI. The "Business Plan" section below used to list
"custom ISF shader imports" as a Pro feature; the owner dropped it on 2026-10-11. A feedback layer: the liquid already carries its own memory. The tunnel in
the post's video, which zooms the whole frame on the sound: frame motion, off by default.
ChromaGlass itself as an AUv3 inside AUM: the plate needs WebGPU and more memory than an
audio extension gets (inferred), the same reason as §13's "not doing a plugin inside
the host"; 13.7-ipad is the part of it that fits.

## 48f. Faraday waves: the music's shake stands up as a pattern (shipped 2026-11-21)

Idea 48f of the visuals the music moves, picked by the owner 2026-11-21 ("anything that can be impacted by the music
itself. Like the standing-wave patterns"), written here beside the cords because it is
one: the music reaches it only through Music Shake, a cord from the bass onto Shake. The
story is in `docs/plan-shipped.md` under 48f. Open:

- **48f-2. The saturation's coefficients, derived** (M). The cubic that stops the
  pattern growing (wgsl/faraday.ts) is the curvature's own for ripples and u³ for
  gravity waves, weighted by the capillary share, scaled so a wave settles at a real
  pattern's steepness (S0 = 0.6). Replace the scale with Zhang and Viñals' (1997)
  coefficients for the layer, so which pattern stands (stripes, squares, hexagons,
  quasi-patterns at two frequencies) is the liquid's too. `npm run faraday` prints the
  peaks round the ring today (6, 3 and 9 at 20, 50, 100 Hz: a disordered lattice after a
  few seconds, not yet the squares experiments show for ripples); hold them once derived.
- **48f-3. The dish's wall** (M). The grid is periodic over the plate's square; a real
  dish's rim pins the pattern and launches its own meniscus waves at the drive's own
  frequency. Lay the rim (lib/rimMask) as a wall in the step.
- **48f-4. The drive follows the music's pitch** (S–M). Shaker is a dial; the music only
  moves Shake. A cord from the bass line's pitch onto Shaker would put the big cells
  under low notes and the fine ones under high, which the patch bay has no source for
  yet (a pitch reading as a cord source).
- **48f-5. Two frequencies** (M). A real speaker playing music shakes at many at once;
  two drive frequencies make quasi-crystal patterns (Edwards and Fauve 1993). The step
  takes one.
- **48f-6. The strobe's phase** (S). *Shipped 2026-11-21 as Rock; story in `docs/plan-shipped.md` under 48f-6.*
- **48f-7. A look that opens shaken** (S). No look sits on the shaker yet, so every look
  opens as it did; a look built for it (Shaker on, Music Shake set) would show the
  feature without a hand on the desk. Needs the owner's judging first (docs/judging.md
  §140).
- **48f-8. The mean flow, derived** (M). The waves' own mean flow (wgsl/faraday.ts,
  faradayForce) is the streaming push −Γ ∇²u ∇u, projected and held by the floor's friction,
  with Γ a scale set so a wave's push matches ω k u² at the critical ring: the shape is the
  one the theory gives (a pure gradient on the ring, so only defects, modulation and a
  square's off-ring harmonics stream)
  but the size is not derived. Replace Γ with the Vega, Knobloch and Martel (2001) mean-flow
  coefficients for the layer, and hold `npm run faraday`'s 350 and 830 µm/s (4× and 12×) to
  them. Measured 2026-11-21: at real strength the mean flow barely changes how the pattern
  breaks (corr over 4 s 0.61 with it, 0.64 without, at 12×); the breaking is the
  amplitude equation's own. It does carry the pattern: the dish with it differs from the
  dish without it by 8.6% of the r.m.s. at 4× and 40% at 12×.
- **48f-9. The pattern moves** (M). *Shipped 2026-11-21: it rides the plate's flow, streams
  its own mean flow, breaks up and re-forms at high drive, and Strength throws its light past
  real; story in `docs/plan-shipped.md` under 48f-9.*
- **48f-10. The streaming carries the dye** (M). The waves ride the plate's flow, but their
  own mean flow moves only the waves: a real dish's streaming drifts what floats on it too.
  Add the mean flow (scaled to the plate's units) to the solver's velocity as a force, so the
  dye follows the pattern's defects. Needs 48f-8's size first, or a dial past real.
- **48f-12. Lasting defect chaos** (M). Far past threshold a real dish never settles: its
  pattern goes over to defect chaos, defects born, gliding and dying for as long as it is
  shaken (Kudrolli and Gollub 1996). Ours breaks up and moves for some seconds as it grows,
  then locks into a new pattern: ten seconds on the correlation is 0.99 at 12× and 0.9997
  at the dial's top, 2 g (`npm run faraday`, 2026-11-21), so lasting motion today is the
  Rock's and the plate's flow. The cubic that picks the pattern is the place to look (a
  shortcut, PLAN 48f-2): the real coefficients for the layer, and the mean flow's feedback at
  its derived size (48f-8), are what keep a real one moving. Hold it as a late window that
  still decorrelates.
- **48f-11. Folds drawn as caustics** (S). Where the waves are steep enough to fold the
  light (det(I + D′H) below nought) the plate draws dark (wgsl/plateFaraday.ts); a real
  caustic is the sum of the sheets that land there, brighter not darker. At Strength 4 the
  mean brightness falls 3.5% (`npm run faraday`), part the aperture's real loss and part
  this. Sum the folded sheets' light instead of zeroing it.

