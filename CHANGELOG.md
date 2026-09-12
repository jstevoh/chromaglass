# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Beats ahead of the microphone
- A microphone hears late — capture buffer, analyser window and smoothing, band smoothing, the wait for the onset threshold — so a kick on the plate landed after the kick in the room. `src/lib/beatClock.ts` is a phase-locked clock: it collects onsets, finds a period once the last few intervals agree (folded into 60–200 bpm), then nudges the period and snaps the phase on every on-beat onset, gaining confidence with each hit and losing it on syncopations, misses and silence. Once confident it fires each beat `beatLead` ms (default 80) before the onset would be heard and absorbs the heard onset of the same beat so nothing fires twice; when it loses the beat it hands back to detection
- Every kick reaction — the plate rock, the beat squeeze, the beat ring of dye, bubble release, the macro camera's cut — now reads one verdict per frame instead of its own threshold crossing, so they land together. `beatPrediction` (default 0.7) is how much the show trusts the clock; 0 is detection only. Settings → Sound

### Changed — Bubbles in the dye, not over it
- Bubbles rode the velocity field but the dye slid underneath them as if they were painted on a sheet above the plate. Now each bubble's footprint carries a standing squeeze in the solver, so the dye keeps pumping out to the bubble's rim and flows round it (`applySquish` per bubble per step, on the lead plate)
- Whatever lands on the plate lands on the bubbles: dye from the dropper, spray, pour, streak or splatter bursts the bubble under it into two or three satellites and shoves the bubbles along the spreading front; a blow of air shoves harder and bursts nothing. The same for the phone's pad, replayed performances and automation drops (`BubbleField.disturb`)

### Added — A new song, a new look
- `onNewSong` (Settings → Sound → On a New Song: Keep / New preset / Random, default New preset). A new song is detected two ways: a boundary heard in the audio — music that has run at least twenty seconds, then quiet for at least two and a half, then sound again (`src/lib/songBoundary.ts`; a rest inside a song is too short, a crossfaded set never goes quiet) — or track identification naming a different song than before. Either picks another non-closeup preset or rolls a random look; a gap and an identification close together count once; the sequencer keeps control while it is running

### Fixed — Casting
- Casting to a Chromecast or a second display showed "Source window closed" and nothing else. The receiver page mirrored the show window's canvas through `window.opener`, which only exists when the receiver is a popup; a page presented through the Presentation API runs in its own context with no opener. The receiver now runs its own copy of the visualizer and is fed by the show window — a snapshot of the settings when it connects and on every change, the audio bands thirty times a second, and the seed, clear and drain triggers — over the PresentationConnection, or over a BroadcastChannel when it was opened as a popup (`src/lib/castProtocol.ts`, `src/hooks/useCastSession.ts`, `src/components/CastDisplay.tsx`). Choosing a preset re-seeds the receiver's plate too, and the user's palette lock carries across
- The receiver says when the show window has gone quiet instead of freezing on the last frame

### Added — Presets at the top
- The preset's name under the ChromaGlass title is now a menu, and a **Presets** button sits at the top of the toolbar: every preset one click away, grouped Light show / Photograph / Closeup, the current one marked, closing on a pick, a click outside or Escape (`src/components/PresetMenu.tsx`)

### Added — The photograph
- **Two-pass renderer** (`src/lib/cameraPass.ts`). The plate pass can now draw to a texture, with a second attachment carrying per pixel the surface normal, the dye's height and whether a bubble sits there, and a camera pass looks at that picture the way a lens and a sensor would: refraction of the finished plate through drops and bubbles, a focal plane with depth of field (twelve-tap disc), bloom around the highlights, chromatic aberration at refracting edges and the frame's corners, an ACES roll-off, vignette and grain. Off by default (`camera` 0), so the projected show is drawn straight to the screen as before; the pass builds itself the first frame it is asked for
- **Photograph render style** (`renderStyle: 'photo'`): a lit paper backdrop in two colours (`paperA`/`paperB`) with a soft join and the tooth of the paper; dye composited as transmission over it, mixing subtractively so a thin wash vanishes into the paper and a mixed drop deepens; each drop a dome from its normal — a dark meniscus deeper away from the lamp, a thicker middle that absorbs more, the softbox reflected as a bright crescent on the lamp side, a rim that catches the sky
- **Satellite droplets** (`microDroplets`): two sizes of tiny lenses on a jittered grid, more where the dye is, each shaded like the bubbles — dim toward the lamp, bright away from it, a point of the lamp on its dome
- **Thin film** (`thinFilm`): interference bands where the dye runs thinnest, following the thickness
- Camera controls: `focus`, `aperture`, `bloom`, `chromaticAberration`, `refraction`; Settings → Camera; sequencer stages can glide the camera, aperture, bloom, droplets and thin film
- Presets **Oil on Water** (yellow oil over blue paper, packed bubbles, droplets, shallow focus), **Colorful Cosmos** (big drops over a teal-to-orange gradient, two lamps, deep fall-off) and **Sunny Side Up** (thin sheets over hot orange, every edge running with interference colour); a photographed stage in the Set Journey sequence
- Choosing a preset returns the render style to the light show unless the preset says otherwise, as with the macro camera

### Added — The lamp
- **One light for every material.** Until now each pass assumed its own fixed sun: dye gloss lit from one corner, the meniscus from another, the macro relief from a third, and every bubble's highlight stamped at the same offset. Now a projector lamp sits under the plate at a point (`u_lamp`), so the light reaches each place from its own direction, and everything that shades asks it: a bubble to the left of the lamp is lit from its right, one on the far side from below
- **Bubbles as lenses** (`lightPlay`, default 0.6). From the reference photographs: the rim toward the lamp darkens as the light is bent away, the far rim carries the bright caustic arc, the lamp's reflection sits on the lamp side of the dome, the interior shows the plate behind magnified toward the centre, and a little of the plate on the far side sits in the bubble's shadow — so a field of bubbles reads as one light falling across them
- **Dye rims under the lamp**: the meniscus glows in the dye's own colour on the side facing the lamp and sits in its own shadow on the far side; straight under the lamp both sides match
- **The hot-spot** (`lampHotspot`, default 0.35): brightest over the lamp, falling away toward the rim, with a slight warmth at the centre
- **Lamp motion** (`lampMotion`, default 0.5): the lamp wanders slowly under the plate and moves with the plate's rock, so a tilted plate is lit from a new side and the light keeps moving across everything
- **Second lamp** (`secondLamp`, default 0): a cooler lamp from the other side of the plate — two lights across every bubble and edge, a cool arc and reflection against the warm one, and a cool pool on the ground
- **Iridescence** (`iridescence`, default 0.25): thin-film colour running round bubble rims, stronger over bright ground
- Settings → Lamp; Lucky rolls them; Oil Wheel and Poster 1969 carry their own; `?set=key=value;…` pins any setting for one page load

### Added — The show over time
- **Show Sequencer** (`src/lib/sequencer.ts`, `src/hooks/useShowSequencer.ts`, `src/components/SequencerPanel.tsx`). Until now the show only evolved by dice: a random re-pick of the harmony, automation rolling drops. A sequence is a list of stages; each adopts a preset (its dyes and injection style, the plate kept rather than cleared), glides any of sixteen settings toward a target over a transition, sets how many of the preset's dyes are in play and which leads, and can force the macro camera on or off. A stage hands over after a time, when the song changes section (from Track intelligence's song map, with a minimum dwell), or holds until Next. Built-ins: *Slow Build* (one dye on bare glass, the others arriving over four minutes, then the wheel turning), *Verse / Chorus* (quiet verse, pressed and rocked chorus, bridge in close-up; advances on section changes), *Set Journey* (classic wheel → oil wheel → mirrored dish → chemistry bench → 1969 poster → lumia). Copy a built-in or start fresh, edit stages, reorder, save (localStorage). A **Sequence** button in the toolbar, and a transport (play/pause, previous, next, progress bar) on the phone remote
- **Hue journey** (`hueJourney`, minutes per step, default 3). The 45-second random re-pick is replaced by a deterministic walk through the preset's contract: a window one dye short of the set slides by one dye each step, so one colour drains while the next arrives and the plate never jumps. At 0 the old behaviour returns
- **Beat squeeze** (`beatSqueeze`, default 0.5). The rhythm plate: on every kick a domed press goes into the lead plate near its middle, the dye spreading out in a ring and relaxing back
- **Background loop** (`backgroundLoop`, default 0.5). The plates behind the lead run slower and calmer, so a two-layer show reads as a live plate worked over a slow loop, the way the recordings stack a slide-loop behind the hands-on plate
- **Kaleidoscope** (`kaleidoscope`: off, 2, 4, 6) — the plate mirrored into wedges around the centre, seams meeting edge to edge, the rig turning slowly; and **Round dish** (`dishVignette`) — black beyond the rim with a thin bright ring at the glass edge, the projected clock face seen whole. Both in Settings → Show
- **Poster, 1969** preset: two opaque dyes on one plate, flat and hard-edged, no gloss or meniscus, screen-print saturation
- Lucky rolls the new fields; `window.chromaglassDebug()` now reports the harmony, contract, palette window and journey

### Added — Solver
- **GPU fluid solver.** The whole step — squeeze-film pressure, forces, viscous diffusion, pressure projection, advection, decay — now runs as WebGL2 fragment passes over float ping-pong textures, at 256², 384², 512² or 768² depending on the hardware, instead of the 192² JavaScript loop. Injection stays in logical 192² coordinates and is uploaded as a delta texture, and a box-filtered readback feeds the pieces that still need the field on the CPU (bead tracking, the dye regulator), so nothing outside the solver had to change (`src/lib/gpuFluid.ts`)
- Settings → Simulation → **Fluid Grid**: `auto` picks the largest grid the GPU can hold, or pin a size, or force the CPU solver. A readout shows which engine is live. Machines without float render targets fall back to the CPU path on their own (`simResolution`)
- `?sim=cpu|auto|<size>` and `?debug` URL overrides for testing
- **Frame-time governor.** `auto` no longer means the largest grid the GPU can allocate — an integrated GPU allocates 512² and then crawls. A governor watches the real frame interval and walks a ladder of quality rungs (solver grid × canvas pixel density): down within ~1.5 s of dropped frames, up one rung after ~8 s of sustained room, never retrying a rung that failed this session, with a settling period after every move (`src/lib/governor.ts`)
- **Tiers, not builds.** One build serves the hosted page, a local `npm run remote` show and (later) a native shell; only the assumed headroom differs. Hosted caps at 384² and 1.5x pixels so a first visit never stutters; local and native run the full ladder to 768² at native pixel density. Tier comes from where the page was loaded, GPU class from the renderer string; software GL goes straight to the CPU solver (`src/lib/platform.ts`)
- The canvas now renders at device pixel density on machines with room for it — previously it was always 1x, a 2x upscale on every Retina display
- **Run-it-locally card** on the hosted build, shown once the governor has stepped down or the GPU solver is unavailable: what happened, and the three commands that run the same build on the viewer's own machine (`src/components/RunLocallyCard.tsx`)
- Settings → Simulation shows the live engine, pixel density and frame rate, and whether Auto has had to step down on this machine
- `?tier=` and `?gpu=` URL overrides for testing a tier on the wrong machine

### Changed — Bubbles, second pass, from the references
- A second reference study (48 photographs, 24 video timelines) showed the same bubble everywhere: small, round, gathered in packed fields inside the oil, a bright lens over the lamp with a thin edge in the dye's own colour — large deforming bubbles are the exception. So: up to forty, spawned small and in threes into the densest dye; shape only for the big ones, and slowly; they drift together and rest edge to edge before merging; the membrane is the dye seen edge-on with a lifted centre, never a drawn ring

### Changed — Bubbles that behave
- Bubbles are drawn as one implicit (metaball) surface instead of stamped circles, so two pulling together neck into each other and merge, and the membrane is a thin dark line with a bright refracted edge inside it rather than a band a quarter of the radius wide
- Each bubble now has a shape: it stretches along whatever is dragging it, wobbles in second- and third-order modes after a knock (a merge, a split, fresh air), and relaxes when the plate goes quiet
- New behaviour: a bubble stretched hard enough by shear tears in two; one popping (end of life, the plate's edge, or shaken loose by the treble) leaves a short-lived spray of smaller bubbles and puffs air into the dye where it was; the treble agitates the whole population

### Added — Macro camera on the beat
- **Music sync** for the closeup camera (`macroSync`, Settings → Macro Closeup and the phone): a kick brings the cut forward once the shot has had a fair run, so the edit lands on the music instead of a private timer; each kick punches in with the bass and eases back; loud passages spend the hold faster and tighten the chase; the treble adds a few cells of handheld tremor. At 0 the camera keeps its own time as before

### Fixed — Lag and jitter
- **The GPU path no longer stalls every frame.** The bead tracker and dye regulator read the field back from the GPU each frame with a blocking `readPixels`, which forces the GPU to finish before the CPU can continue and serialises the two — the stutter was the pipeline draining sixty times a second. The read now goes through pixel-pack buffers with fences, collected a frame later
- **Catch-up no longer compounds a hitch.** When a solver step already costs most of a frame, owing four of them after a slow frame only produced a run of slow frames; the cap now adapts to the measured step cost, so the show runs a little slow instead of stuttering
- **Cheaper CPU step.** MacCormack advection stays on the dye, where it keeps filaments, and velocity and heat take first-order transport — about a third of the step on a field nobody sees directly
- **The phone remote responds again.** Its slider and button components were defined inside the render body, so every state message from the laptop gave them a new identity and remounted the control under the thumb dragging it; they are module-level now. Slider patches are throttled to ~20 a second, the laptop applies them in 50 ms batches, and its state snapshots back to phones are coalesced
- The shell no longer re-renders once a second for the frame-rate readout; the settings panel polls the live reading itself while open

### Removed
- The Monochrome Ink preset — a grey plate however it was tuned

### Added — The other projectors
Six expansions from the same comparison — the machines a light show crew stacked on one screen besides the clock face:
- **Lumia.** Thomas Wilfred's aurora as a layer under the dye: a slow folded height field read as sheets of light, two harmony colours drifting through each other on a scale of minutes, no beat and no dye (`lumia`; preset **Lumia**)
- **Chemistry.** Mark Boyle's Sensual Laboratory put reactions on the platen instead of oil in a dish. A Gray–Scott reaction–diffusion field grows cells and coral in place and deposits dye where it is active; the flow carries the dye off while the pattern keeps growing underneath. Seeded by kicks (`chemistry`, `src/lib/chemistry.ts`; preset **Sensual Laboratory**)
- **Film loops and a gel wheel.** A film projector that plays a video file through the dye — keyed on its own brightness, refracted by the dye's surface, tinted where the dye is — and a four-segment colour gel turning over the lamp at a chosen rpm, its colours from the working harmony (`filmMix`, `filmKey`, `gelWheel`, `gelSpeed`; Settings → Projectors → Load loop)
- **A real plate in the mix.** The same film path takes the camera: point a phone or webcam at a real dish of oil on a lamp and it is composited through the solver's lighting (Settings → Projectors → Camera)
- **Two projectionists.** The phone remote gains a pad: dragging blows air along the finger's path, a tap drops dye, each phone chooses which plate it works, and the phone's tilt streams into the plate as an external tilt that fades out if the link drops (`blow` / `drop` / `tilt` messages; `applyGesture` takes a layer; `setExternalTilt`)
- **Sealed wheel.** A halogen grade — warm tint and a soft vignette — and a preset, **Oil Wheel**, that runs thick dye on convection at half a revolution a minute, yellows, greens and blues, no hands on it (`lampWarmth`)
- **Exposure** plate-wide: the macro camera's histogram floor is now a setting, so a thin film between dye structures renders as bare glass — Sensual Laboratory runs on it (`exposure`)
- A Projectors section in Settings with all of the above; Lucky rolls the projectors one at a time

### Changed — The look, against the tradition
Six changes from a comparison of the app's frames with the liquid light show canon (SF light painting, the Joshua Light Show, Mad Alchemy, Optikinetics wheels, macro liquid-light photography):
- **Palette contracts.** A projected clock face carries two or three dyes; the richness of a show comes from stacking plates, not rainbow dye. Every preset now names the palette indices it may use, and seeding, automation, beat injection and the slow harmony rotation all draw from inside that set (a song's identity harmony is intersected with it). Galaxy, Cyberpunk Neon and Fractal Dream stop drifting into full-spectrum haze. A user's palette lock still wins outright
- **Meniscus at every edge, at any zoom.** The dark rim and refracted highlight a bead has between two plates were only rendered in the macro closeup; a lighter version now runs plate-wide from the sobel normal (`edgeRelief`)
- **Bubbles.** Trapped air is the most recognisable analog element after the blob. A small particle field rides the velocity field, climbs against the plate's tilt, merges on contact and pops at the edge or the end of its life; the renderer draws each as a lens — lighter interior, dark rim, one highlight. Born from the Blow tool, automation's air bursts and bass hits (`bubbles`, `src/lib/bubbles.ts`)
- **Rock the plate.** A hand on the clock face: each kick tips the whole plate one way and a damped spring rocks it back, with a slow sway between beats, so the field sloshes instead of only churning. Applied as a uniform acceleration on both solver paths (`plateRock`)
- **Less haze.** Film grain fades out almost entirely below the shadows so dark frames stay black; treble sparks are fewer and larger — a handful of real droplets instead of a cloud of one-cell specks that blurred into fog
- **Two scales in one frame.** The second layer is viewed magnified about the centre with its own slow drift, like a second projector at a different throw; the brush maps through the same view (`layerScaleVariety`). Off in the macro presets, whose camera frames one plate
- **Dye budget per preset.** The regulator's target fullness is now a setting (`dyeBudget`), so a preset can run mostly clear glass with dye structures on it
- Five new sliders under Light Show Look: Dye Budget, Edge Relief, Bubbles, Plate Rock, Layer Scale Variety; Lucky rolls them

### Added — Clean screen
- **Clean Screen** chip next to Hide UI: removes every overlay — logo, chips, meters, lyrics, the cursor — leaving only the liquid, for a projected show. **Esc** brings everything back (with the overlays up, Esc closes whichever panel is open); on a touch screen a finger held still for a moment does the same. A hint saying so shows for four seconds after hiding
- The phone remote has a matching button, so the laptop's screen can be cleaned from across the room (`overlays-off` / `overlays-on` actions, `overlaysVisible` in the state snapshot)

### Changed — Solver
- **MacCormack advection** on both paths, for velocity and dye: a forward and a backward semi-Lagrangian pass, corrected by half the round-trip error and clamped to the neighbourhood the forward pass sampled. First-order semi-Lagrangian transport smeared a thin filament away within a few steps; the same filaments now hold their edges
- Momentum diffuses at a viscosity derived from the plate's thin/thick setting rather than at the dye's diffusion rate, which is a different physical quantity — the two had been sharing one number

### Added — Macro Closeup
- **Bead camera** — a tracking macro camera that magnifies the plate and rides a single bead of dye: it locks onto the most compact, isolated bead it can find, follows it with a velocity lead so a fast bead never trails off-frame, and when the bead dissolves or its shot runs out it whips to a new one with a dolly-out that hides the cut (`macroMode`, `macroZoom`, `macroChase`, `macroHold`; `src/lib/macroCamera.ts`)
- **Synthesised micro-detail** — at 4-6x the 192-cell solver only supplies the large shape, so the renderer adds fluid-space structure that magnifies with the camera: packed paint cells (dark cores in bright, dark-outlined rings) carried along by the dye, dendritic lacing stretched along the flow, a fractal silhouette warp, dome shading, contact shadow and substrate grain (`macroCells`, `macroCellScale`, `macroLacing`, `macroDepth`, `macroEdgeDetail`)
- **Shallow depth of field** — defocus grows away from the frame centre, the way a macro lens behaves wide open
- Three macro presets — Macro Bead, Cell Bloom, Lacing Run — each with its own seed pattern of separated beads for the camera to choose between
- Macro toggle in the main toolbar and a Macro Closeup section in Settings; Lucky rolls closeup framing one time in four

### Added — Deployment
- GitHub Actions workflow that typechecks, builds and publishes to Firebase Hosting on every push to `main` (needs a `FIREBASE_SERVICE_ACCOUNT` repository secret)
- Favicon, Apple touch icon, share card and page metadata — the built site previously served a bare `index.html` with no icon and no description

### Added — Phone Remote
- **Laptop drives, phone controls.** `npm run remote` serves the built app on the LAN and relays control messages, so the laptop runs the show (mic, GPU, full UI) while a phone at `?remote=1` becomes a control surface: presets, sound drive, speed, the macro camera and the one-shot gestures (`server/remote-server.js`, `src/components/RemoteControl.tsx`, `src/hooks/useRemoteLink.ts`)
- The laptop is authoritative and publishes a state snapshot on every change, so a phone joining or reloading mid-show sees what is actually running rather than what it last remembered; the link reconnects on its own with backoff, and stays dormant when no relay is present so the hosted build is unaffected
- Deliberately a LAN WebSocket rather than a cloud round-trip: a slider should move the visuals in milliseconds, and the show should survive the internet going down
- The laptop probes for the show server (`/remote-info.json`) before opening a socket, so a hosted or previewed build no longer logs a refused WebSocket handshake on every load; it looks again every 30 s in case the relay is started later

### Added — Audio
- **Automatic room calibration** — the analyser learns the room instead of asking the listener to find a sensitivity number: it tracks the noise floor and signal ceiling in dBFS, fits the AnalyserNode's own dB window to them (the defaults waste almost the whole 0-255 spectrum on a quiet room, which is the mechanical reason a distant mic drives the visuals so weakly), and normalises every band against its own learned range so bass, mids and treble each use their full travel wherever the app is running (`src/lib/audioCalibration.ts`, `autoCalibrate`)
- Calibration readout and a Recalibrate button in Settings → Audio Input, showing the learned floor and peak
- **Raw microphone capture** — echo cancellation, noise suppression and auto gain are now switched off. They are tuned for speech on a call and are hostile to music: suppression ducks a steady groove as background noise, AGC flattens the dynamics, and echo cancellation can null out the speakers in the room
- A smoothed signal gate so the silences between beats don't strobe the visuals, and a noise-floor rule that lifts only from levels near the floor — a floor that chased the running level would climb to meet sustained music and squeeze the range shut a minute into every song

### Added — Depth
- **Surface relief** — the frame is lit from a real height field assembled at three scales: the bead's own dome, the meniscus of every cell (analytic, from each cell's radial slope) and the grooves the lacing cuts. Wet specular highlights, a refracting rim and occlusion in the recesses (`macroRelief`)
- Two-tap contact shadow — one tight to the bead, one wider and softer behind it, which is what lifts the paint off the ground instead of leaving it pasted flat on

### Changed — Audio
- The sensitivity slider is now a trim either side of the calibrated level rather than the control that has to be right; its default maps to unity gain
- Moving a slider no longer tears down and rebuilds the AudioContext, so trims don't glitch the audio or discard the room calibration mid-song

### Changed — Rendering
- **Dark ink reads as dark ink.** Opacity now accounts for how much of the spectrum the dye absorbs, so black hides the lit ground behind it instead of sitting over it at the same opacity as a yellow and greying out; cell cores darken the whole way rather than being scaled down by the patch mask; film grain is scaled by brightness, since a fixed offset on near-black pixels is a grey haze
- **The solver runs on wall-clock time**, not one step per rendered frame. The light show used to run in slow motion on a weak GPU and at double speed on a 120 Hz display; steps are now driven by elapsed time and capped, so a slow frame catches up rather than falling behind
- Each cell is evaluated against every neighbour's profile rather than being assigned to its nearest centre, so crowded cells keep complete circular rings instead of being clipped into polygons
- The silhouette warp no longer deforms the cells themselves — bent circles read as lumps rather than as bubbles

### Changed — Macro Closeup
- Macro frames expose against the plate's own density histogram each frame: dye below the level where the top ~14% of the plate begins renders as bare ground, and the range above it is stretched to full opacity, so a closeup always has a subject, a silhouette and visible surface under the paint
- The dye budget drops from a near-full plate to a sparse one while the closeup camera is running — a saturated plate magnified is just one flat colour
- Defocused pixels skip the 8-tap normal and the interface pass, which more than pays for the macro detail: the closeup renders faster than the plate-wide view

## [1.2.0] - 2026-07-28

### Added
- **Local song recognition** — each first listen's recording is reduced to a Shazam-style spectral-peak constellation fingerprint (stored in IndexedDB). Repeat listens are recognized locally in seconds — offline, free, with sample-accurate playback position — and the AudD API becomes a fallback for unknown tracks only. Manually tagged tracks also become auto-recognized after one listen.
- Per-track auto-preset: identification picks a visualizer preset matched to the music's energy/bass/brightness, deterministic per ISRC and remembered across listens (toggleable)
- Palette lock: pin any of 13 curated color harmonies from a new left-panel section, overriding drains/seeds/auto-rotation/music (persists across sessions)
- Dye Color swatch grid for one-click recoloring of the manual tools
- Beat-triggered color rings, audio-reactive turbulence, mid/treble vorticity, three multi-hue ambient injection orbits, treble dye sparks

### Changed
- Fluid sim grid 128 → 192 with sqrt-encoded density textures — smoother edges, no gradient banding; solver iterations tuned per use so net cost stays at or below the old build
- Identification latency: first attempt fires as soon as sound is present, 5s snippets, 10s retries; between-song dips trigger instant re-identification
- First-listen recordings are trimmed at the true track boundary before analysis

### Fixed
- Plate saturation washout: self-regulating dye budget (density-aware evaporation + per-cell thickness cap) keeps blobs, boundaries and empty glass in equilibrium
- Silent fingerprint-capture failures from forced sample rates / suspended AudioContexts
- Side control columns overlapping the top bar on short windows

## [1.1.0] - 2026-07-28

### Added — Liquid Light Show rendering
- Multi-octave curl-noise turbulence in the velocity field — structure at every scale, from whole-blob motion down to ripples and filament trails (`turbulenceScale`, `turbulenceDetail`)
- Blob surface tension parameter trading cohesion against shear — low values give amoeba-like elongation and pinching instead of static circles (`blobSurfaceTension`)
- Bright interface line where two distinct dye colors meet, faking the oil-water boundary look without a multi-fluid solve (`boundaryContrast`)
- Saturation multiplier in the final color grade to counteract muddy blending (`saturationBoost`)
- New "Light Show Look" section in Settings exposing all rendering parameters

### Changed — Liquid Light Show rendering
- Specular/Fresnel lighting pass now gated behind a `glossiness` parameter defaulting to 0 — fluid renders as flat, evenly-lit matte dye (the projected light show look) instead of glossy 3D spheres; Lava Lamp keeps a faint sheen
- Gooey post-blur is parametrized (`postBlurRadius`) and defaults far lower, so fine turbulent detail survives to the screen
- Signature presets (Classic, Galaxy, Acid Trip, Lava Lamp) tuned for the new parameters

### Added — Music Intelligence layer
- Song identification via AudD/ACRCloud fingerprinting behind a Cloudflare Worker proxy (`server/fingerprint-worker.js`, key stays server-side); manual track tagging fallback when no proxy is configured
- First-listen song map generation: the listen is recorded client-side and analyzed offline in a Web Worker (FFT → chroma/energy/centroid features → self-similarity novelty segmentation into intro/verse/chorus/bridge/outro, plus autocorrelation pitch curve and RMS energy curve), cached in IndexedDB by ISRC
- Structure-synced visuals: known song structure drives turbulence, saturation and audio impact over the track timeline (choruses surge, intros/outros calm)
- Synced lyrics via LRCLIB (free, no key) with LRC parsing, rough energy-based alignment fallback for unsynced lyrics, semantic word-triggers (fire/water/sky/earth/love/dark/light/motion themed dye bursts), lexicon-based sentiment arc per section, and an optional kinetic typography overlay
- Deterministic per-track visual identity: ISRC hash seeds palette harmony, turbulence and density offsets so every song has a consistent look
- Evolution across listens: complexity ramps, palette drifts and new trigger themes unlock as listen count grows; every listen's parameter snapshot is stored
- Track Intelligence panel: now playing with section timeline, evolution progress, listen history with one-tap replay of any past listen's frozen visual parameters, library view and music settings (lyric triggers, sentiment arc, lyrics overlay, evolution speed)

## [1.0.0] - 2026-04-05

### Added
- Real-time Navier-Stokes fluid simulation with squeeze-film flow, buoyancy, immiscibility, and fingering
- Microphone and system audio input via Web Audio API
- 1024-point FFT audio analysis with per-feature smoothing (bass, mid, treble, energy, timbre, complexity)
- Frequency-aware band splitting (20-250 Hz bass, 250-4000 Hz mid, 4000+ Hz treble)
- Configurable audio-to-physics mappings (velocity, density, color, rotation, bubbles)
- 10 built-in presets (Classic Light Show, Deep Ocean, Cyberpunk Neon, Lava Lamp, Monochrome Ink, Acid Trip, Bass Drop, Timbre Shifter, Boiling Point, Microscopic Chaos)
- Multi-layer compositing (up to 5 layers) with blend modes (screen, lighter, exclusion, multiply, overlay)
- LED platform simulation with 5 gradient modes (single, rainbow, ocean, fire, cyberpunk)
- Interactive dropper and blow tools with mouse and touch support
- Automation mode for hands-free audio-reactive visuals
- 3D Phong lighting on fluid surface
- Bubble system with merging, splitting, and buoyancy physics
- Rain drip, glass smear, and airflow effects
- Film grain post-processing
- Full settings panel with sliders for all simulation parameters
- Responsive UI with minimize/maximize toggle

### Performance
- Pre-allocated ImageData objects to eliminate per-frame GC pressure
- Pre-baked film grain textures (replaced 200 fillRect calls/frame with single drawImage)
- Cached hex-to-RGB conversion for hot-path color lookups
- Shared constants module eliminating 9 duplicate color palette definitions
- Unified getAudioValue utility replacing 3 duplicated switch statements
