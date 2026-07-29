# ChromaGlass

A psychedelic liquid light show visualizer that reacts to your microphone or system audio in real time. Inspired by 1960s overhead projector light shows — colored oils squeezed between glass plates, heated from below, and projected onto a wall.

## Features

- **Real-time fluid simulation** — Navier-Stokes solver with squeeze-film flow, buoyancy, immiscibility, and fingering instabilities
- **Audio-reactive** — Microphone or system audio drives fluid velocity, density, color, rotation, and bubbles via configurable mappings
- **10 built-in presets** — Classic Light Show, Deep Ocean, Cyberpunk Neon, Lava Lamp, Monochrome Ink, Acid Trip, Bass Drop, Timbre Shifter, Boiling Point, Microscopic Chaos
- **Multi-layer compositing** — Up to 5 independent fluid layers with configurable blend modes (screen, lighter, exclusion, multiply, overlay)
- **LED platform modes** — Simulated backlight with rainbow, ocean, fire, cyberpunk, or single-color conic gradients
- **Interactive tools** — Dropper (add colored dye) and Blow (straw air bubbles) with touch support
- **Automation mode** — Auto-generates dye drops and air bursts driven by audio energy
- **Light Show Look controls** — Multi-octave curl-noise turbulence, blob surface tension, dye-boundary glow, saturation grade, glossiness (default: flat matte backlit dye) and post-blur, all exposed in Settings
- **Music intelligence** — Identifies the playing song (fingerprint proxy or manual tag), records the first listen and analyzes it offline into a song map (verse/chorus structure, pitch and energy curves, cached in IndexedDB), then drives visuals from known structure on every later listen
- **Lyrics layer** — Time-synced lyrics from LRCLIB with themed word-triggers (fire, water, sky…), per-section sentiment arc, and an optional kinetic typography overlay
- **Evolving per-track identity** — Each song's ISRC seeds a stable visual identity that grows more complex with every listen; replay any past listen's exact look from the history panel

## Music Intelligence Setup (optional)

Everything except automatic identification works out of the box. For automatic song ID:

1. Deploy the fingerprint proxy (holds your API key server-side):
   ```bash
   wrangler deploy server/fingerprint-worker.js --name chromaglass-fingerprint
   wrangler secret put AUDD_API_TOKEN   # token from https://audd.io (or set ACR_* for ACRCloud)
   ```
2. Set `VITE_FINGERPRINT_PROXY_URL` in `.env` to the worker URL.

Without the proxy, use the **Tag Track** form in the Track panel — song maps, lyrics, and evolution all work from a manual tag.

## Quick Start

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/jstevoh/chromaglass.git
cd chromaglass
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and allow microphone access when prompted.

## Controls

| Control | Description |
|---------|-------------|
| Play/Pause | Start or stop the simulation |
| Mic / Monitor | Toggle microphone or system audio input |
| Lucky | Randomize all settings |
| Dropper tool | Click/tap to add colored dye |
| Blow tool | Click/tap to blow air bubbles |
| Layer buttons | Switch active fluid layer |
| Clear | Wipe the active layer |
| Auto toggle | Enable automated dye/air injection |
| Eye toggle | Minimize/maximize the UI |
| Settings gear | Open the full settings panel |

## Tech Stack

- **React 19** + **TypeScript**
- **Vite** for dev/build
- **Tailwind CSS v4** for UI styling
- **Framer Motion** (via `motion/react`) for UI animations
- **simplex-noise** for coherent noise fields
- **Web Audio API** for real-time FFT analysis (1024-point)
- **Canvas 2D** for fluid rendering with 3D lighting

## Project Structure

```
src/
  App.tsx                  # Main app shell, audio source management, UI overlay
  types.ts                 # TypeScript interfaces and default settings
  constants.ts             # Shared color palettes, audio utilities
  presets.ts               # 10 built-in visualizer presets
  hooks/
    useAudioAnalyzer.ts        # Web Audio FFT hook (bass/mid/treble/energy/timbre/complexity)
    useMusicIntelligence.ts    # Orchestrates identification, song maps, lyrics, evolution
  lib/
    musicTypes.ts              # Music intelligence interfaces
    musicDb.ts                 # IndexedDB persistence (song maps, track evolution)
    evolution.ts               # ISRC-seeded visual identity + per-listen evolution
    fingerprint.ts             # Snippet capture + fingerprint proxy client
    songMap.ts                 # Listen recorder, offline analysis orchestration
    songMapWorker.ts           # Web Worker: FFT, chroma, segmentation, pitch tracking
    lyrics.ts                  # LRCLIB fetch, LRC parsing, word-triggers, sentiment
  components/
    LiquidVisualizer.tsx       # Fluid simulation engine + WebGL2 renderer
    SettingsPanel.tsx          # Full settings UI panel
    TrackPanel.tsx             # Now playing, evolution, listen history/replay
    LyricsOverlay.tsx          # Kinetic typography lyric overlay
server/
  fingerprint-worker.js        # Cloudflare Worker proxy for AudD/ACRCloud
```

## License

MIT
