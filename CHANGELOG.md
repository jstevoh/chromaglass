# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
