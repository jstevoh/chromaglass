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
2. **14t-pc**: Program Change picks a look or a set-list item.
3. **24.3**, moved up: notes as voices, with an envelope per note and notes as a source.
4. **13.5-link** before **13.5-osc**: Link first.
5. **30b**, below: LFOs and envelopes you set.
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

Shipped (`npm run soundcords`, 34/34 lines in `scripts/checks.json`). Story in
`docs/plan-shipped.md` §30a (moved 2026-10-29, 19m).

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
  the window no longer opens on a plate still climbing; the bar is unchanged.

## 30b. The LFOs and envelopes are fixed

`modulators.ts` has four LFOs locked to bars and two envelopes, all fixed: an eight-bar
and a two-bar sine, a one-bar triangle, a stepped LFO every beat, a snap and a swell,
and a MIDI note fires both envelopes. A fixed eight-bar sine fits some songs and fights
others. Let each LFO pick its rate in bars (a quarter to sixteen) and its shape (sine,
triangle, ramp, stepped), and each envelope its attack and decay and what fires it (the
kick, the snare, a note channel, a pad, or anything, as today). Today's rates and shapes
are the defaults, so a look saved before keeps its motion; an LFO aimed at a setting
that moves the frame stays off by default as every frame-moving source is. On the phone,
rate and shape on the patch view. *Measure:* `npm run shapes` with each rate and shape
set: the period within a frame of its bars at 120 and at 90 bpm, and an envelope fired
by the kick on a recorded loop once per kick.
*Added from VS 2 (2026-10-24).* Two shapes VS has and this lacks: a smoothed random (a new
random target each period, glided to rather than stepped) beside the stepped one; and an
LFO that restarts its cycle on a trigger (a note on a channel, the kick, a pad), so a
sweep begins with the phrase rather than wherever the bar clock left it. The measure adds
the smoothed random's slope bounded (no step larger than a frame's share of its range)
and a restart landing within a frame of each kick on the recorded loop.

**Not copied.** A shader editor and imports from Shadertoy, ISF or GLSL Sandbox: the
plate is a simulated liquid, not a stack of shaders (the owner's rule to model the real
phenomenon), and VS sells pasting shaders made by a chatbot, which fails the rule that
nothing in the app seems like AI. The "Business Plan" section below used to list
"custom ISF shader imports" as a Pro feature; the owner dropped it on 2026-10-11. A feedback layer: the liquid already carries its own memory. The tunnel in
the post's video, which zooms the whole frame on the sound: frame motion, off by default.
ChromaGlass itself as an AUv3 inside AUM: the plate needs WebGPU and more memory than an
audio extension gets (inferred), the same reason as §13's "not doing a plugin inside
the host"; 13.7-ipad is the part of it that fits.
