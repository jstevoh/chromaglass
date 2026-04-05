# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
