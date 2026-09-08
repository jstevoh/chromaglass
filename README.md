# ChromaGlass

A psychedelic liquid light show visualizer that reacts to your microphone or system audio in real time. Inspired by 1960s overhead projector light shows — colored oils squeezed between glass plates, heated from below, and projected onto a wall.

## Features

- **Real-time fluid simulation** — incompressible Navier-Stokes (Stam stable fluids) with squeeze-film flow, buoyancy, immiscibility and fingering instabilities; MacCormack advection keeps thin filaments alive
- **GPU solver** — the whole solve runs in WebGL2 fragment shaders on a 256–768² grid where the hardware allows it, and falls back to the 192² CPU solver everywhere else (Settings → Simulation → Fluid Grid)
- **Audio-reactive** — Microphone or system audio drives fluid velocity, density, color, rotation, and bubbles via configurable mappings
- **Automatic room calibration** — learns the room's noise floor and dynamics, fits the analyser's dB window to it and normalises every band against its own range, so the same visuals read well in a quiet living room or a loud bar
- **Built-in presets** — Classic Light Show, Deep Ocean, Cyberpunk Neon, Lava Lamp, Monochrome Ink, Acid Trip, Bass Drop, Timbre Shifter, Boiling Point, Microscopic Chaos, and three macro closeups: Macro Bead, Cell Bloom, Lacing Run
- **Multi-layer compositing** — Up to 5 independent fluid layers with configurable blend modes (screen, lighter, exclusion, multiply, overlay)
- **LED platform modes** — Simulated backlight with rainbow, ocean, fire, cyberpunk, or single-color conic gradients
- **Macro closeup** — a tracking camera magnifies the plate and chases a single bead of liquid, with synthesised paint cells, lacing filaments and shallow depth of field for extreme detail at high magnification
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

## Phone Remote

The laptop runs the show — microphone, GPU, full UI — and your phone becomes a
control surface for it over the local network.

```bash
npm run build
npm run remote
```

The server prints two URLs: open the first on the laptop, the second
(`?remote=1`) on the phone. Both devices need to be on the same network.

The phone gets presets, sound drive, speed, the macro camera and the one-shot
gestures (seed, random, drain, clear) — the things you reach for mid-show. The
laptop stays authoritative and publishes a state snapshot on every change, so a
phone that joins or reloads mid-show immediately shows what's actually running.

This runs over plain http on your LAN, which is deliberate: a slider should move
the visuals in a couple of milliseconds rather than a couple of hundred through
a datacentre, and the show keeps working when the internet doesn't. The tradeoff
is that a page loaded from the hosted `https://` site can't open a `ws://` socket
to your laptop (mixed content), so remote control means running the show from
`npm run remote`.

## Simulation Engine

The solver is Jos Stam's stable-fluids scheme — diffuse, project, advect,
project — with the extras a liquid light show needs: a Hele-Shaw squeeze-film
term for the plate pressure, immiscibility and fingering forces, curl-noise
turbulence and a self-regulating dye budget. Two things are worth knowing:

- **Where it runs.** On `auto` (the default) the solve moves onto the GPU as a
  chain of WebGL2 fragment passes at the largest grid the hardware can hold at
  frame rate (256², 384², 512² or 768²), and falls back to the 192² CPU solver
  when the GPU can't render to float textures. Settings → Simulation → Fluid
  Grid pins a size or forces the CPU path, and shows which engine is live.
- **Advection.** Both paths use MacCormack advection (a forward and a backward
  semi-Lagrangian pass, corrected and clamped), which is what lets a thin
  filament of dye survive more than a few steps instead of blurring away.

For testing, `?sim=cpu`, `?sim=auto` or `?sim=<size>` on the URL override the
setting for that page load, and `?debug` exposes `window.chromaglassDebug()`
with the live solver state.

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
| Macro toggle | Magnify the plate and chase a single bead of liquid |
| Phone remote | Presets, drive, speed, macro and gestures from `?remote=1` on another device |
| Eye toggle | Minimize/maximize the UI |
| Settings gear | Open the full settings panel |

## Tech Stack

- **React 19** + **TypeScript**
- **Vite** for dev/build
- **Tailwind CSS v4** for UI styling
- **Framer Motion** (via `motion/react`) for UI animations
- **simplex-noise** for coherent noise fields
- **Web Audio API** for real-time FFT analysis (1024-point)
- **WebGL2** for both the fluid solve (float ping-pong textures, Jacobi pressure iterations) and the lit, relief-shaded render

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
    useRemoteLink.ts           # WebSocket link, either end, with reconnect
  lib/
    musicTypes.ts              # Music intelligence interfaces
    musicDb.ts                 # IndexedDB persistence (song maps, track evolution)
    evolution.ts               # ISRC-seeded visual identity + per-listen evolution
    gpuFluid.ts                # WebGL2 fluid solver: the CPU pipeline as fragment passes
    macroCamera.ts             # Macro closeup: bead detection, tracking, whip cuts
    audioCalibration.ts        # Room calibration: adaptive floor/ceiling per feature
    remoteProtocol.ts          # Phone-remote message types and socket URL
    fingerprint.ts             # Snippet capture + fingerprint proxy client
    songMap.ts                 # Listen recorder, offline analysis orchestration
    songMapWorker.ts           # Web Worker: FFT, chroma, segmentation, pitch tracking
    lyrics.ts                  # LRCLIB fetch, LRC parsing, word-triggers, sentiment
  components/
    LiquidVisualizer.tsx       # CPU fluid solver, GPU solver driver + WebGL2 renderer
    SettingsPanel.tsx          # Full settings UI panel
    TrackPanel.tsx             # Now playing, evolution, listen history/replay
    LyricsOverlay.tsx          # Kinetic typography lyric overlay
  components/
    RemoteControl.tsx          # The phone control surface
server/
  fingerprint-worker.js        # Cloudflare Worker proxy for AudD/ACRCloud
  remote-server.js             # LAN static server + control relay (npm run remote)
```

## Deploying

Pushes to `main` are typechecked, built and published to Firebase Hosting by
`.github/workflows/deploy.yml`. Before the first run, add a repository secret
named `FIREBASE_SERVICE_ACCOUNT` containing a service-account JSON key with the
**Firebase Hosting Admin** role on the `chromaglass` project (Firebase console →
Project settings → Service accounts → Generate new private key). Optionally add
`VITE_FINGERPRINT_PROXY_URL` to enable automatic song identification.

To deploy by hand instead:

```bash
npm run build
npx firebase deploy --only hosting
```

## License

MIT
