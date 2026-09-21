# Plan: filters and effects

*Written 2026-09-19 against `origin/main` at `4a4033b` (#88); line numbers drift, so the
symbol names are what to search for. **F0, the post chain, shipped as #92**, and was
rebuilt in WGSL during the port (#100). The cutover the effects were waiting for landed
2026-09-20, so E1–E8 are ready to build — as H5 in [the roadmap](roadmap.md), which says
where this sits in the order.*

This plan covers eight effects, the period film look that replaces the VHS/CRT idea, and
the tools that make them playable rather than merely switchable.

> **Built on WebGPU** (`docs/webgpu-plan.md`; decided 2026-09-19, landed 2026-09-20).
> F0 below was written for WebGL, and this is what became of it — all of it done:
> - **Moot:** the texture-unit registry and the unit-11 clash, because WebGPU has no
>   texture units.
> - **Moved into the WebGPU port (P4):** the true-average flash probe, now a compute
>   reduction (`src/gpu/probe.ts`).
> - **The scene target** is `rgba16float` everywhere, with no
>   `EXT_color_buffer_float` check.
> - **The rest** — the finish pass, the history ring, the seeded clock, `npm run fx`,
>   cast triggers and the governor's post level — is in `src/gpu/post.ts` and
>   `src/gpu/wgsl/post.ts`, and its costs come from timestamp queries.
>
> One thing the port added that an effect author needs: **a pass that writes a texture
> another pass samples must flip clip space**, through the `FLIP_Y` override constant.
> WebGPU puts `uv.y = 1` at row 0 where a framebuffer puts 0 there, and getting this
> wrong is invisible in a shader test and upside down on the glass.

| # | Effect | In one line |
|---|---|---|
| E1 | **The camera on the wall** (video feedback) | A camera pointed at the projection, with the screen's knobs, a half-mirror, a delay line and a "trap" button |
| E1c | **Coupled loops** | Two cameras, two loops, each folding the other in through its glass — the video's "insanity mode" |
| E2 | **Prism lens** | 3–8 translucent offset copies of the picture, turning, with a rainbow fringe |
| E3 | **Letters as windows** | The liquid shows only inside a band name, a logo or a title |
| E4 | **Slit-scan** | Different parts of the picture show different moments |
| E5 | **Iris and wipes** | The projectionist's iris, and real two-picture transitions between looks |
| E6 | **Film** | 1960s stock and projector: grain, weave, dirt, flicker, halation, cadence, the overhead projector's Fresnel |
| E7 | **Kick ripple** | A lens ripple spreading from the press on each kick |
| E8 | **Colour finishing** | Loadable LUTs, and the poster grades as LUT files |
| T | **Performance tools** | 16-step cut patterns, recorded knob loops, rotation detents |

## Principles

1. **Everything is a thing a 1967–72 light-show crew could have had.**
   - a camera and a monitor (feedback);
   - a multi-image prism;
   - cut-paper masks and an iris;
   - slide dissolves;
   - 16mm loops;
   - the overhead projector itself.

   There is no VHS, no CRT scanlines, no datamosh. "Film" is the period texture.
2. **Off means today's picture.** Every new setting defaults to off, and with all of
   them off the canvas is identical (to within 1/255) to `main` today. PLAN.md's
   operating rules also hold: every setting is MIDI-learnable, reachable from the phone,
   and defaults to current behaviour.
3. **Every look is complete (#88).**
   - Effects are look settings unless they describe the venue; those go in `RIG_KEYS`.
   - A look that doesn't name an effect turns it off.
4. **Every control is patchable.**
   - Sound, room, film and shapes can drive any of them.
   - The effects are global, never per-plate, so none of them go in `PER_LAYER`.
5. **Deterministic.**
   - Time comes from the frame count, and every random number comes from a seeded hash.
   - This is so PLAN.md §6 (Render a song) can make the same film twice, and the cast
     receivers, which run their own renderer, look alike.
6. **All light passes the flash guard.**
   - Anything that can strobe (feedback, flicker, iris, ripple) sits upstream of the gain
     the guard applies.
   - The feedback buffer stores light from before that gain, so the gain can't compound
     round the loop.
7. **Cost is declared and measured.** Each effect is a full-screen pass, so its cost is
   fill-bound. Each declares a cost class and a half-resolution fallback, and none ships
   without a `bench` reading at 1080p and at a projector's 4K.

## Where the effects go

What happens today (from reading the code):
- The patch fold, the solver and the derive pass run first.
- Then **one large fragment shader** draws everything, inline, in this order:
  1. the kaleidoscope fold;
  2. the plate;
  3. lamp, gel, lumia, film;
  4. the round dish;
  5. saturation;
  6. grain;
  7. `*= u_dimmer`, where the flash guard's gain lives;
  8. the **mark** (the Logo & Titles overlay);
  9. dither.
- The result goes to the canvas, or first through `CameraPass`, `OutputPass`, or both.
- `FrameProbe` reads the finished canvas for the guard.

The order with the effects added:

```
plate (main shader, now without dimmer and mark)
  → CameraPass            (photograph style, when on)
  → optics                E2 prism, E7 ripple
  → time                  E1 feedback (one loop, or two coupled), E4 slit-scan   (share one frame-history ring)
  → matte                 E3 letters as windows
  → iris / wipe           E5
  → film                  E6 stock, gate, dirt, projector
  → finish                E8 LUT · dimmer × flash gain · mark · dither
  → OutputPass            keystone, masks, rear mirror, gain/gamma (the venue)
  → canvas → FrameProbe
```

- **Optics before time,** so the feedback loop can recurse the prism.
- **Film after the effects,** so its grain and gate cover everything, the iris's edge
  included.
- **The mark stays last and exempt,** as it is today.

## F0 — The foundation: a post chain

The effects can't be built cleanly without this. One PR, with no visible change.

1. **Scene target.** When any effect is on, the main shader draws into a canvas-size scene
   texture instead of the canvas. It uses RGBA16F where `EXT_color_buffer_float` exists,
   and RGBA8 otherwise.
   - A flag, `u_finishInMain`, keeps the dimmer, mark and dither in the main shader when
     no effect is on, so "off" really is today's code path.
2. **Finish pass.** When the chain runs, it applies the dimmer and the flash gain, the
   mark, the LUT and dither.
3. **Texture-unit registry.**
   - Units are handed out from one table: free today are 4, 5 and 15.
   - This fixes the existing clash: `OutputPass` rebinds unit 11 on a resize, and 11 is
     also the bead mask. On the frame it reallocates, that most likely makes the plate
     draw a feedback loop and a black frame.
4. **`PostPass` class.**
   - Program; uniforms located from their own source, so none can silently fail to set —
     today a uniform left out of `uniformNames` never sets.
   - `ensure`/resize, dispose (next to the existing disposals), and a rebuild on
     context loss.
5. **Frame-history ring.** N recent frames at a pixel budget, not at canvas size:
   - half resolution RGBA8 at 1080p, 32 frames, about 66 MB;
   - quarter resolution at 4K.

   Feedback's delay, slit-scan, wipes (as the snapshot of the outgoing look) and PLAN.md
   §5's *Shutter* all use it.
6. **Effect clock and random numbers.** `u_frame` and `u_seed`, and a shared GLSL hash.
   No `Math.random` in an effect.
7. **The guard sees true averages.**
   - `FrameProbe` point-samples a 16×16 blit, about 256 samples. A small flash can slip
     between them.
   - Build the probe from mipmaps (an area average) so a flash counts in proportion to
     its size. This is a safety fix worth doing before feedback exists.
8. **The governor knows about effects.**
   - Add a post-quality level: full, then heavy passes at half resolution, then heavy
     passes off.
   - The engine label says which. Today, below its top levels the governor can only
     shrink the solver grid, which doesn't help a fill-bound pass.
9. **Cast triggers.** New one-shot messages (`trap`, `release`, `wipe`) in
   `castProtocol`, so network displays run the same actions.
10. **`npm run fx`.** A new harness, added to Measure. For each effect:
    - off equals the pre-change frame;
    - on changes the pixels;
    - two runs with the same seed are identical;
    - the effect's own bounds hold;
    - with every effect on, 60 fps at 512² on the M4.

**Gate:** all effects off matches `main` on a frozen plate (to within 1/255); `wall`,
`panel`, `desk`, `qa` and `fx` pass; `bench` shows no cost with everything off.

## E1 — The camera on the wall (video feedback)

**What it is:** a camera films the projection and feeds itself back. Each frame is the
last one refilmed: zoomed, turned, blurred, brightened. The BBC called it *howlround* and
built the 1963 *Doctor Who* titles from it. It is 60s–70s video art; and James
Crutchfield's 1984 paper treated it as a physical dynamical system — spirals and
labyrinths set by the zoom, rotation, focus and brightness.

**The model is physical, not a trails effect.** Generic trails is Milkdrop. What gives
analog feedback its structure is **blur + a contrast non-linearity + a little sensor
noise** inside the loop. Without those, digital feedback only smears.

**One frame of the loop:**

```
prev = history[delay]
  → camera: zoom, turn, shift, with glide
  → focus: blur
  → screen: gain, contrast S-curve, hue step, saturation
  → + sensor noise
  → glass: + a mirrored second tap with its own zoom and turn, folded in
  → key the live picture in: mix, luma key or chroma key, with clip and gain
  → loop buffer (RGBA16F, full resolution where the budget allows)
  → blend into the picture by `feedback`
```

**Settings** (look keys, default off, all patchable):

| Group | Keys |
|---|---|
| The screen's knobs | `feedbackGain` (0.5–1.5, fine), `feedbackContrast` (0–2), `feedbackHue` (−30–30° per pass), `feedbackSaturation` (0–2) |
| The camera | `feedbackZoom` (0.85–1.15), `feedbackTurn` (−180–180°), `feedbackShiftX`/`Y`, `feedbackFocus` (0–4 px), `feedbackGlide` (0–2 s), `feedbackDetent` (off, 3, 4, 5, 6, 8) |
| The loop | `feedback` (0 = off … 1), `feedbackKey` (mix, luma, chroma), `feedbackKeyClip`, `feedbackKeyGain`, `feedbackNoise` (0–0.05), `feedbackGlow`, `feedbackDelay` (0–30 frames), `feedbackRate` (60, 24, 18 fps) |
| The glass | `feedbackGlass` (0–1, the 50/50 mirror), `feedbackGlassMirror` (x, y, xy), `feedbackGlassZoom`, `feedbackGlassTurn` |
| Hold | `feedbackHold` (0–1): keeps the loop's mean brightness inside the working band (see the video notes) |

**Actions** (desk, MIDI, phone, OSC `/chromaglass/action/trap`):
- **Trap** seeds the loop with a source, then cuts the live picture out. The image
  "lives in the wires" and slowly degrades. Sources (`trapSource`): the plate as it is
  now, the Logo & Titles image, E3's text, the room camera, or the film projector.
- **Release** fades the live picture back in.

**Driving it:**
- **Tiller** — Drag on the phone pad to turn and zoom the camera, like the rod in the video.
- **Gamepad** — Both sticks can steer the camera.
- **Presets:**
  - *Howlround* — kick → zoom punch, bass → gain, bar LFO → turn.
  - *Fair Captive* — trap with a slow decay.
  - *Rosette* — detent at 6, glass on.
  - *Labyrinth* — focus with high contrast.

**Safety:**
- The hold assist prevents a white-out runaway.
- There is a hard ceiling on gain.
- The flash guard sits downstream.
- The loop stores light from before the guard's gain.

**The accidental loop:**
- The Window source's picker excludes only this tab, so the projector popup can still be
  captured. Exclude it too.
- Keep the README's warning, and point people to E1 instead.

**Coupled loops:** see E1c. The glass tap is the coupling path.

## E1c — Coupled loops

**What it is:** two cameras, two loops, and each loop's glass reflects *the other* loop
instead of itself. This is the video's "insanity mode" (18:06): shapes in one loop seed
the other, which feeds back, so "they're both making each other". It is the most alive
and the least stable thing in this plan.

**How it builds on E1:** loop A is E1's loop. Coupling adds loop B (a second buffer and
pass) and changes one thing: each loop's glass tap reads the other loop.

```
A' = screenA(cameraA(A[delayA])) ⊕ coupling·(from B) · glassA(B[delayB]) ⊕ key(live picture)
B' = screenB(cameraB(B[delayB])) ⊕ coupling·(from A) · glassB(A[delayA])
```

Both are computed from the previous frame's A and B (ping-pong), so neither loop sees the
other's current frame. The physical rig has that same one-frame lag.

**Settings** (look keys, default off, all patchable):

| Key | Range | What |
|---|---|---|
| `coupled` | 0 = off … 1 | Coupling strength: how much of each loop the other's glass carries |
| `coupledBalance` | −1 … 1 | Who drives whom: −1 = A feeds B only, 1 = B feeds A only, 0 = both equally |
| `coupledView` | A, B, blend, split | What the wall shows. Split puts A and B side by side, like the video's two monitor structures |
| `coupledInput` | A, B, both | Which loop the live picture keys into, like the video's switchers. A cut pattern can alternate it |
| `loopBZoom`, `loopBTurn`, `loopBShiftX`/`Y`, `loopBFocus` | as E1 | Loop B's camera |
| `loopBGain`, `loopBContrast`, `loopBHue`, `loopBSaturation` | as E1 | Loop B's screen knobs |
| `loopBDelay` | 0–30 frames | Loop B's own delay, from the shared ring |

Noise, keys and glow are shared with loop A, to keep the panel manageable.

**Actions:**
- Trap A, Trap B.
- **Cross-trap:** seed one loop with the other's current picture.
- **Swap:** exchange the two loops.
- **Calm:** ease coupling to zero over one bar. This is the panic button.

**Keeping it alive, not blinding.** The video: "it's really hard to maintain anything
without everything going into complete chaos."
- **A hold assist per loop:** E1's, run independently on A and on B.
- **A coupling limiter:**
  - It watches each loop's mean brightness and frame-to-frame change, using the probe's
    new area averages from F0.
  - When either loop runs away — whiting out, collapsing, or swinging fast — it eases
    `coupled` down smoothly, then lets it back up.
  - It sits upstream of the flash guard, so chaos is tamed before it becomes strobe. The
    guard stays downstream as the backstop.
- **Two meters:** each loop's working band, side by side in the panel and on the desk
  pin.

**Playing it:**
- **Phone pad:** one finger drives A's camera; two fingers (or a toggle) drive B's.
- **Gamepad:** each stick drives one camera.
- **Cut patterns:** alternate `coupledInput`, or fire Cross-trap on the beat — the
  video's rhythmic switching between structures.
- **Presets:**
  - *Each Other* — symmetric coupling, split view.
  - *Call and Response* — balance 0.8, bass → coupling.
  - *Mirror Rooms* — B mirrored, blend view.

**Cost and memory:** twice E1: a second loop buffer and a second pass.
- At 1080p, the two RGBA16F ping-pong pairs are about 66 MB.
- On a projector's 4K, loop B runs at half resolution, and loop A too if the budget needs
  it.
- The governor's post level drops B to half resolution first, then A.

**Cast:** coupled loops are chaotic by nature, so a receiver's loops diverge from the
sender's within seconds. Network displays show the same *kind* of picture, never the
same one. Documented, not chased.

**Verification** (`npm run fx`):
- With `coupled` at 0, the picture equals single-loop E1 pixel for pixel.
- With both hold assists on, both loops stay inside their working band through 60 s of
  the simulated band.
- A forced-chaos run (high gain, full coupling) never trips the flash guard with the
  limiter on, and does trip it with the limiter off. That proves the limiter is doing the
  work.
- Swap and Cross-trap move the pictures they should, compared by each loop's statistics
  before and after.

## E2 — Prism lens

**What it is:** a 1960s–70s multi-image prism filter. The picture is repeated 3–8 times
around the centre as translucent offset copies, with a faint rainbow fringe where glass
disperses light. It differs from the kaleidoscope, which mirrors wedges of the plate:
the prism overlaps whole copies of the finished picture.

**Settings:**
- `prism` (0 = off, 2–8 facets, stepped)
- `prismSpread`
- `prismSpin` (deg/s)
- `prismDispersion`
- `prismCentre` (keep an unshifted central copy)

**How:**
- N taps, each shifted per colour channel for the dispersion, averaged so the picture
  doesn't brighten.
- About 24 texture reads a pixel at most; cheap.
- Kick → a spin jump, and `feedbackDetent` shares the snap-to-360/n logic.

**Decide:** PLAN.md's "Not doing" list rejects tiling. A prism is overlapping copies, not
tiles, but it is your call.

## E3 — Letters as windows

**What it is:** the liquid shows only inside a shape — a band name, a logo, a song title
— on black, with a soft or glowing edge. It is the reverse of the Logo & Titles overlay.

**Settings:**
- `matte` (0–1)
- `matteSource` (logo image, text)
- `matteText` (a string)
- `matteInvert`
- `matteFeather`
- `matteGlow`
- `matteScale`, `matteX`, `matteY`

These are room keys (`RIG_KEYS`): the band name belongs to the night, not the look.

**How:**
- Text is drawn with Canvas2D into a mask texture, in Jost (ship a runtime woff2; it is
  the same OFL font as the wordmark).
- The logo reuses the mark texture, unit 14, as an alpha mask.
- It sits after optics and time, so a feedback loop can live inside the letters, and
  before film, so the grain covers the edges.

**Ties:**
- `matteText` can follow the identified song title.
- A recorded clip's title card could use this, which is far sharper than an Image Dye
  pour on the 192² grid.

## E4 — Slit-scan (time displacement)

**What it is:** every part of the picture shows a different moment — the centre now,
the edges a second ago — so the liquid seems to melt through time. It is the digital
cousin of Douglas Trumbull's slit-scan Stargate in *2001* (1968).

**Settings:**
- `slitScan` (0 = off, up to 1 s of spread)
- `slitShape` (vertical, horizontal, radial, by brightness)
- `slitInvert`

**How:** each pixel reads the history ring at its own delay, blending two neighbouring
frames. Two texture reads; the memory is the shared ring's.

## E5 — Iris and wipes

**Iris** — a projectionist's iris, round or bladed, soft-edged:
- `iris` (0 = open … 1 = closed), `irisSoft`, `irisBlades` (round, 5–9), `irisX`, `irisY`.
- A multiply in the post chain, before film.

**Wipes** — two-picture transitions between looks. Today a look change only
interpolates settings, every 33 ms in `blendLooks` and every 250 ms in the sequencer,
so no two frames ever blend.
- **How:**
  1. On a go or cue, snapshot the outgoing picture into the history ring.
  2. Reveal the new look through a moving mask, animated on the render clock.
- **Styles:** dissolve (the slide-projector dissolve unit, *the* 60s multimedia
  technique), iris, horizontal, ink bleed (a mask grown from noise), film burn (from
  E6).
- **Where they're chosen:** styles and times sit next to the existing fade-time choices
  and in sequencer stages. They are transition choices, not look keys.
- **Harness:** `npm run desk` models brightness as dye × dimmer × saturation and would
  flag an iris wipe's deliberate dip. Model wipes in it, or exempt them explicitly.

## E6 — Film (instead of VHS/CRT)

**What it is:** the texture of the era's projected film. Light shows ran 16mm loops and
slides beside the liquid plates, all projected, and the plate itself sat on an overhead
projector.

**Naming:** the existing `film*` settings belong to the film *projector*, the one that
plays a video through the dye. This effect uses `stock*` so the two can't be confused.

**Stock:**
- `stock` (0 = off … 1)
- `stockType`, "in the manner of":
  - 16mm reversal, cool and saturated;
  - a slide stock, warm with deep blacks;
  - faded 60s colour negative (magenta cast, lifted blacks);
  - Super 8 (soft, warm, heavy grain);
  - black-and-white reversal with a sepia or cyan tone.
- Each type is a characteristic curve (toe and shoulder), a per-channel crossover, and a
  saturation response.

**Grain:**
- `stockGrain`, `stockGrainSize` (Super 8, 16mm, 35mm).
- Dye-cloud grain, per channel and by luminance (mid-tones heaviest), re-rolled every
  film frame and seeded.
- The shader's old grain turns off while `stock` is on, so there is never double grain.

**Transport:**
- `stockWeave`: sub-pixel wander of the gate at the film rate.
- `stockCadence` (off, 24, 18 fps): holds frames in a 3:2 pattern on a 60 Hz display,
  the same idea as the video's 24 fps router switch.
- `stockGate`: the projector gate's soft, rounded frame edge.
- Occasional splice bumps.

**Projector:**
- `stockFlicker`: shutter and lamp flicker, capped at an amplitude the flash guard
  never counts.
- `stockHalation`: the red-orange glow film grows around highlights. This is film's
  bloom; today bloom exists only in photograph mode.
- `stockBreathing`: slow focus breathing.

**Dirt:**
- `stockDirt`: dust specks, dark on a projected positive.
- `stockScratches`: vertical lines that persist and drift; cyan or green on colour film.
- A hair in the gate.
- Optional reel-change cue marks, the circles in the top right.
- All from a seeded schedule.

**Overhead projector:**
- `projectorFresnel`: faint concentric rings from the stage's Fresnel lens, colour
  fringing at the edge, and fall-off.
- A room key: it describes the projector, not the look.

**Film burn** is a wipe style (E5) and an optional end-of-reel event.

**Presets:**
- *16mm 1968*
- *Slide carousel*
- *Faded reel*
- *Home movie*

**Verification:**
- Curves are monotonic, and halation appears only above its threshold.
- Weave, flicker and dirt stay within their bounds.
- Flicker never trips the guard.
- `detail.mjs` judges looks with `stock` off, because grain inflates its structure
  measure.

## E7 — Kick ripple

**What it is:** on each kick, a lens ripple (displacement, not light) spreads from where
the plate was pressed, or from the centre. It makes the beat readable at phone size.

**Settings:** `ripple` (0–1), `rippleSpeed`, `rippleWidth`, `rippleOrigin` (centre,
press point).

**How:**
- Up to 4 rings live at once, as uniform arrays.
- **The hook:** read `kickRef` once per frame, where the macro camera reads it. Beat
  Squeeze's `kickStep` is dropped on frames with no solver step — every other frame at
  120 Hz.
- **The press point:** store Beat Squeeze's centre; today it isn't kept anywhere.

**Overlap:** PLAN.md §5's sound-learn kick triggers ("a zoom punch"). Build on one kick
path.

## E8 — Colour finishing

- **LUTs:**
  - `lut` (none, built-ins, user) and `lutMix`.
  - A `.cube` parser (17³ or 33³) into a `texture_3d<f32>`, sampled in the finish pass.
    (Written for WebGL2's 3D textures; WGSL has the same thing, and `layoutFromWgsl`
    in `gpu/kit.ts` needs `texture_3d` added beside the array case before it can bind
    one.)
  - A look that uses a user LUT carries its data (about 15 KB at 17³), so the look file
    arrives whole.
- **Poster grades as LUT files, not shader modes:**
  - *Poster 1969*, a posterise;
  - *Sabattier*, a solarise;
  - *Cyanotype*;
  - *Warm projector*.
- **Decide:** PLAN.md's "Not doing" list rejects posterise and solarise. Shipping them
  only as optional LUT files keeps the renderer free of those modes. Or drop them.

## T — Performance tools

The video shows the operator performing the knobs as much as setting them.

- **Cut patterns.** A new *Steps* shape type in the patch bay: 16 steps, synced to the
  beat clock, MIDI clock or tap tempo.
  - Steps can drive any control.
  - They can also fire any action: trap, iris pulse, prism jump, wipe.
  - Quantised to 1/16. The video's rhythmic switcher does exactly this.
- **Knob loops.** A *Recorded* shape type: record a control's movement over 1–8 bars and
  loop it. The video's operator built this so one hand could hold a slow fade while the
  other played.
- **Detents.** Snap-to-360/n turn for the feedback camera, the prism and the
  kaleidoscope. n-fold rosettes appear when the loop turns by 360/n (the video, 29:10 to
  32:30).
- **Fine control.** Feedback's working band is narrow. Offer MIDI fine mode on its knobs
  (14-bit where the controller sends it, or a ÷10 shift layer), and a *working band*
  meter next to the hold assist.

## What the video added

*The Light Herder*, "4K Analog Video Feedback Fractal Device Finally Complete!"
(youtube.com/watch?v=koDCabeh5kQ). Reviewed from the transcript, a storyboard contact
sheet and full frames.

| In the video | In this plan |
|---|---|
| Everything happens in a narrow middle zone between white-out and black-out, found by tiny knob moves (5:10) | Hold assist, working-band meter, fine MIDI control |
| Hue, saturation, brightness and contrast knobs on every screen (0:16, 3:23) | E1's screen knobs |
| The camera slides in and out and turns 360° on a rod, smoothly (8:20) | Zoom, turn, glide; the phone-pad tiller |
| A 50/50 teleprompter glass folds a second, mirrored image into the loop: the step from feedback to fractals (7:35) | The glass tap with its own zoom and turn |
| Trapping: cut the screen from a source to the camera, and the image lives on in the loop (12:00–13:50) | Trap and Release actions, and their sources |
| Logos, a poem's text, a flower, a guitarist as inputs (15:35–16:30) | Trap sources; E3 text |
| A 0–30 frame delay in the loop slows the decay; dotted spiral trails (24:10) | `feedbackDelay` on the history ring |
| A 60 fps / 24 fps router switch for a stuttery loop (22:54) | `feedbackRate`; E6 cadence |
| Luma and chroma keys with clip and gain (21:14, 23:07) | `feedbackKey`, clip and gain |
| Rhythmic cuts quantised to 16ths (22:07) | T: cut patterns |
| Recorded knob automation (24:48) | T: knob loops |
| Two loops feeding each other ("insanity mode", 18:06) | E1c coupled loops, with a coupling limiter, per-loop hold and Calm |
| Resolution multiplies the visible recursions (3:43, 4:09) | Full-resolution RGBA16F loop buffer where the budget allows |
| Stills: labyrinths with speckled rims (6:40), rings with dark cores (29:10), 3- to 6-fold rosettes (29:10–32:30), soft defocused plasma (31:40) | Noise, contrast and focus in the loop; detents |

The frames at 6:40 and 29:10 look strikingly like ChromaGlass's own chemistry mode and
oil beads. Optical feedback and the plate reach similar forms by different physics,
which is the case for putting them side by side.

What not to take:
- **The hardware ethos** ("no computer"). We model the physics instead.
- **Multi-screen rigs.** A second loop is enough.

## Build order

Each step is one PR, off by default, and merged only when every check passes.

| Batch | Contents | Why here |
|---|---|---|
| **F0** | The post chain, finish pass, unit registry and bug fix, history ring, seeded clock, true-average flash probe, governor post level, cast triggers, `npm run fx` | Everything depends on it; the probe fix is safety |
| **F1** | E6 Film, and the overhead projector | Lowest risk, the biggest period payoff, and it retires the old grain |
| **F2** | E1 core: camera, screen, focus, noise, key, trap and release, hold | The headline |
| **F3** | E1 glass, delay and rate; T cut patterns and detents | What turns feedback into fractals and makes it playable |
| **F4** | E1c coupled loops: loop B, coupling, limiter, Swap, Cross-trap, Calm | The glass tap is the coupling path; needs F3's delay and cut patterns |
| **F5** | E2 prism, E7 ripple | Cheap optics; the ripple unifies the kick path with PLAN §5 |
| **F6** | E3 letters as windows | Needs the runtime font; gives recorded clips their titles |
| **F7** | E5 iris and wipes | Touches `lookFade`, the sequencer and the desk harness |
| **F8** | E4 slit-scan | Uses the ring F0 built |
| **F9** | E8 LUTs (and the poster grades, if kept); T knob loops | Finishing |

## Every new setting still needs the full wiring

1. `types.ts`: the field, and a `DEFAULT_SETTINGS` value that means off.
2. The pass's uniforms. F0's located-from-source uniforms remove the silent-failure trap.
3. `SettingsPanel`: a `<Slider … settingKey>` inside a `data-section`.
4. `deskPins.ts`: a `FROM_PANEL` entry with the sheet's exact range, section, and `step`
   if it's stepped.
5. **Optional:**
   - sequencer `GLIDES`;
   - phone sliders;
   - readout units;
   - the random-look generator;
   - a new `SETTINGS_SECTIONS` entry — *Effects*, with sub-headings per effect.
6. **Automatic:**
   - patch targets;
   - search;
   - look fades;
   - user presets;
   - cast state;
   - OSC and Art-Net;
   - `?set=`.
7. `RIG_KEYS` only for venue keys: `matte*` and `projectorFresnel`.
8. `npm run panel` enforces 3 and 4.

## Open decisions

- **PLAN.md "Not doing"** rejects tiling, tunnel, posterise and solarise. The prism
  (overlapping copies), feedback (whose tunnels are an emergent case, not a mode) and the
  poster LUTs brush against it. Confirm or amend the list.
- **Memory at 4K on a projector:** the ring's budget (quarter resolution) and the loop's
  (RGBA8 or half resolution at 4K).
- **Cast receivers** will look alike, not identical, especially with feedback, whose
  state diverges per machine. Document it rather than chase it.
- **Decided, 2026-09-19:** coupled loops are in (E1c, batch F4).
