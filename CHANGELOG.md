# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Macro Closeup
- **Bead camera** — a tracking macro camera that magnifies the plate and rides a single bead of dye: it locks onto the most compact, isolated bead it can find, follows it with a velocity lead so a fast bead never trails off-frame, and when the bead dissolves or its shot runs out it whips to a new one with a dolly-out that hides the cut (`macroMode`, `macroZoom`, `macroChase`, `macroHold`; `src/lib/macroCamera.ts`)
- **Synthesised micro-detail** — at 4-6x the 192-cell solver only supplies the large shape, so the renderer adds fluid-space structure that magnifies with the camera: packed paint cells (dark cores in bright, dark-outlined rings) carried along by the dye, dendritic lacing stretched along the flow, a fractal silhouette warp, dome shading, contact shadow and substrate grain (`macroCells`, `macroCellScale`, `macroLacing`, `macroDepth`, `macroEdgeDetail`)
- **Shallow depth of field** — defocus grows away from the frame centre, the way a macro lens behaves wide open
- Three macro presets — Macro Bead, Cell Bloom, Lacing Run — each with its own seed pattern of separated beads for the camera to choose between
- Macro toggle in the main toolbar and a Macro Closeup section in Settings; Lucky rolls closeup framing one time in four

### Added — Deployment
- GitHub Actions workflow that typechecks, builds and publishes to Firebase Hosting on every push to `main` (needs a `FIREBASE_SERVICE_ACCOUNT` repository secret)
- Favicon, Apple touch icon, share card and page metadata — the built site previously served a bare `index.html` with no icon and no description

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
