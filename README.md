# ChromaGlass

A psychedelic liquid light show visualizer that reacts to your microphone or system audio in real time. Inspired by 1960s overhead projector light shows — colored oils squeezed between glass plates, heated from below, and projected onto a wall.

## Features

- **Real-time fluid simulation** — incompressible Navier-Stokes (Stam stable fluids) with squeeze-film flow, buoyancy, immiscibility and fingering instabilities; MacCormack advection keeps thin filaments alive
- **GPU solver with a frame-time governor** — the whole solve runs in WebGL2 fragment shaders on a 256–768² grid; a governor measures the real frame rate and picks the largest grid and pixel density the machine holds at 60 fps, and falls back to the 192² CPU solver where float render targets are missing (Settings → Simulation → Fluid Grid)
- **Audio-reactive** — Microphone or system audio drives fluid velocity, density, color, rotation, and bubbles via configurable mappings
- **Beats ahead of the microphone** — a phase-locked beat clock listens to the onsets, settles on the tempo, and once confident fires every kick a little before the onset would be heard, absorbing the real onset when it arrives; a breakdown or silence hands back to plain detection (Settings → Sound → Beat Prediction and Beat Lead)
- **A new song, a new look** — when a new song starts (heard as a gap of a few seconds between tracks, or named by track identification) the show switches to another preset or rolls a random look; Settings → Sound → On a New Song, with Keep to turn it off
- **Automatic room calibration** — learns the room's noise floor and dynamics, fits the analyser's dB window to it and normalises every band against its own range, so the same visuals read well in a quiet living room or a loud bar
- **Built-in presets** — Classic Light Show, Deep Ocean, Cyberpunk Neon, Lava Lamp, Acid Trip, Bass Drop, Timbre Shifter, Boiling Point, Microscopic Chaos, Lumia, Sensual Laboratory, Oil Wheel, Poster 1969, three photographs (Oil on Water, Colorful Cosmos, Sunny Side Up), and three macro closeups: Macro Bead, Cell Bloom, Lacing Run
- **Your presets and sequences as files** — save the current look as a plain JSON preset file (every setting named, plus the dyes the plate may use and how the automation injects), load anyone's preset file from a file chooser, and keep a library of your own presets apart from the built-ins, listed under *Yours* in the preset menu. Sequences save and load the same way, and a sequence file carries any of your presets its stages use, so it arrives whole. Either kind of file can be **made for a song** (title and artist, ISRC when known): a preset made for a song is applied whenever that song is identified, and a sequence made for a song starts when it is identified, at the right point in it, and stops when the song ends or the next one begins
- **Show Sequencer** — a script for how the show evolves over a song or a set instead of dice: stages that adopt a preset, glide chosen settings over a transition, open the palette from one dye to the full set, and hand over on a clock or when the song changes section. Three built-in sequences (Slow Build, Verse / Chorus, Set Journey), an editor for your own, and a transport on the phone
- **The photograph** — a second render style: a lit paper backdrop in two colours, dye as transmission over it, every drop a dome with a dark meniscus, a softbox crescent and a rim that catches the sky, hundreds of satellite droplets on the glass, interference colour where the oil runs thinnest; then a camera pass over the finished plate with real refraction through drops and bubbles, a focal plane with depth of field, bloom, chromatic aberration, a filmic roll-off, vignette and grain (Settings → Camera). Presets Oil on Water, Colorful Cosmos and Sunny Side Up
- **One lamp for everything** — a projector lamp under the plate that every material is lit from: bubbles shaded as lenses (dark rim toward the lamp, a caustic arc on the far side, the lamp's reflection on the lamp side, the plate magnified inside), dye rims bright toward the lamp and shadowed away from it, a hot-spot that falls away toward the rim, the lamp wandering and following the plate's rock, an optional second cooler lamp from the other side, and thin-film iridescence round bubble rims (Settings → Lamp)
- **The show over minutes** — a hue journey that walks the preset's dyes one at a time (a set drifts its colours, never jumps), a rhythm plate pressed on every kick, a slower background loop on the plates behind the live one, a kaleidoscope mirror rig (2, 4 or 6 folds) and the round edge of a projected dish (Settings → Show)
- **Multi-layer compositing** — Up to 5 independent fluid layers with configurable blend modes (screen, lighter, exclusion, multiply, overlay)
- **LED platform modes** — Simulated backlight with rainbow, ocean, fire, cyberpunk, or single-color conic gradients
- **Macro closeup** — a tracking camera magnifies the plate and chases a single bead of liquid, with synthesised paint cells, lacing filaments and shallow depth of field for extreme detail at high magnification
- **Interactive tools** — Dropper (add colored dye) and Blow (straw air bubbles) with touch support
- **Automation mode** — Auto-generates dye drops and air bursts driven by audio energy
- **Light Show Look controls** — Multi-octave curl-noise turbulence, blob surface tension, dye-boundary glow, meniscus edge relief, trapped-air bubbles, plate rocking on the beat, a second layer at its own magnification, saturation grade, glossiness (default: flat matte backlit dye) and post-blur, all exposed in Settings
- **The other projectors** — a Wilfred lumia layer (slow folded sheets of light under the plate), a rotating gel wheel over the lamp, a film projector that plays a video loop or a live camera through the dye, a reaction-diffusion "chemistry" mode that grows coral and cells on the plate the way Mark Boyle's Sensual Laboratory projected reactions, and a halogen grade for the sealed oil-wheel look — with presets Lumia, Sensual Laboratory and Oil Wheel
- **Bubbles in the dye, not over it** — a bubble is air between the plates: a standing squeeze on its footprint keeps the dye pumping out to its rim so the field flows round it, dye dropped on a bubble bursts it into satellites, and dye or air landing nearby shoves the bubbles along the spreading front, from the dropper, the phone pad, replayed performances and automation alike
- **Two projectionists** — the phone remote has a pad: a finger on it blows air or drops dye at that point of the laptop's plate, each phone works one layer, and tilting the phone rocks the plate
- **Palette contracts** — each preset names the two to four dyes it may use, and everything that adds colour (seeding, automation, beat hits, the slow harmony rotation, a song's identity) stays inside them, the way a projected plate carries a few dyes rather than a rainbow
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

## A projector on HDMI

The best picture is the cable. Plug the projector in as a second display, then **Cast → Second display**. The show window opens on the projector's screen, moves itself there, and mirrors the laptop's canvas: the laptop renders once, at the projector's pixel size, and shows itself a scaled copy letterboxed behind the controls. With the window-management permission it opens fullscreen on the projector; if not, the next click anywhere on the laptop's show fills it (or click the projector window, or press F on it). Nothing is encoded or sent; the projector shows the same frame the laptop drew, so brush strokes, presets, the sequencer and the phone remote all land on the wall as they happen. Keep the laptop window visible (not minimised), since the browser stops drawing a hidden window.

In System Settings → Displays, give the projector its native resolution and keep it as a separate display rather than mirroring, so the controls stay off the wall.

When macOS asks *What do you want to show on the projector?*, choose **Extended Display** (not Mirror): the projector becomes a second screen the show window can move to, and the menus stay on the laptop.

The app also notices the cable itself. With the window-management permission granted (the Cast menu's **Second display**, or the chip below, asks for it once), the app sees every screen and hears one being plugged in; a screen that is not built in is the projector. **Settings → Projectors → Second Screen** chooses what happens then:

- **Ask** (the default): a chip names the projector and offers to send the show there in one click.
- **Automatic**: the show goes there by itself, fullscreen on the projector, on your next click or key press anywhere in the app (a browser opens no window without a gesture, so the first one is the earliest it can), and again whenever the projector is plugged back in. Closing the projector window by hand does not send it back until the cable is unplugged and replugged.
- **Off**: nothing is offered; the Cast menu still works.

The chip has the same **automatic** switch, and its × turns the offer off. The choice is kept on this machine.

**A title bar on the projector window** (the app's name, or the laptop's address) is the browser's window frame. The Mac's green full-screen button keeps it; only the browser's own full screen removes it, and that takes a click. The window asks for one along its bottom edge until it fills the screen, and a chip on the laptop says so: any click or key on the laptop's show is passed to the projector window (Chrome hands the gesture over), or click the projector window itself, or press F on it. Esc on the projector window brings the frame back.

## Phone and Tablet Remote

The laptop runs the show — microphone, GPU, full UI — and your phone or iPad becomes a
control surface for it over the local network.

On a phone the remote is one column. On an iPad (or any screen wider than a phone) it is two: the **projectionist's pad** fills the left half as a plate you work with your fingers, and the dials, sequencer and presets sit on the right. Several fingers are several hands. An Apple Pencil or any stylus adds two things a finger cannot: how hard it presses sets how much dye a drop lays down, and which way it leans sets which way a blow of air goes; the pen's barrel button blows even in drop mode. A row of dye colours under the pad picks what the pad drops (and the laptop's dropper with it), the **Full** button gives the pad the whole screen (add the page to the home screen on iOS for no browser chrome at all), the screen stays awake while linked, and the preset list is the laptop's own — the presets you have saved as files included.

```bash
npm run build
npm run remote
```

The server also prints a **network display** address, `http://<laptop-ip>:3000/?cast=true&key=…`. Open it in any browser on the same network — a projector or TV that runs its own browser, a tablet on a stand — and it shows the show, fed the settings and audio bands by the laptop through the relay. Nothing needs to be discovered by Chrome.

## On stage

Playing the visuals for a band is a different job from running them in a living room: the audio-reactive code does the micro-syncing (the kick lands on the plate), and the projectionist does the macro-syncing (the mood, the transitions, the energy). What the app gives that projectionist:

- **A clean feed, not a microphone.** Ask the sound desk for an aux send or matrix out into a USB audio interface (a Scarlett 2i2 is plenty) and pick it under Settings → Sound → **Input**. Ask for a mix heavy on kick, snare and bass. The choice is remembered.
- **A music file, played here.** The **File** button under the Mic and System buttons plays an MP3, WAV, FLAC or OGG through the speakers and drives the show from it: the straightest signal there is, for rehearsing a set to the studio recordings.
- **The dimmer and blackout.** `dimmer` is the house lights for the plate; ride it from a fader (it is the master fader on the APC40 mkII and Launch Control XL factory maps). **B** on the keyboard, the Blackout button on the phone and in Settings → Sound, or the *Blackout* action from any controller fades the plate to black in a second and back again when the band comes in.
- **Pressing the plate.** The **Press** tool, the pad's *press* mode on a tablet, the left trigger on a game controller, or `/chromaglass/press` over OSC: a hand on the top glass. The film thins under it and the dye spreads out in a ring, the way the Joshua Light Show worked its rhythm plate; **Beat Squeeze** (Settings → Show) does the same on every kick. With **Fingering** up, the press breaks into radial spokes instead of a smooth ring: the thin liquid shooting through the thick one, the Fillmore sunburst.
- **The Fillmore look.** The *Fillmore East, 1969* preset (and the *Fillmore East* sequence) is the Joshua Light Show behind the Mothers: **Projectors** (Settings → Show) spreads the layers into their own dishes on a black screen, each dish a whole plate, the lead large and right of centre and the second smaller at the left; **Oil Beads** fills the dye with hundreds of small dark-rimmed droplets that ride the flow and merge; **Plate Cells** lays the fine cell network in the dish core; fingering and beat squeeze press the big dish into a sunburst on every kick.
- **Freeze, pause, wash out.** Play/Pause holds the plate where it is; Drain washes it; a breakdown can also be a stage in the sequencer with the turbulence low and the palette narrow.
- **The cue sheet is the sequencer.** Write the song as stages (verse: cool, slow; chorus: bright, fast; bridge: hard cut to red), bind it to the song, and it starts itself when the song is identified.
- **Record it.** The red button by the Cast button (or the *Record* action) writes the show to a `.webm` file straight from the canvas, with the music muxed in, for the band's socials.
- **Masks.** Front-projecting onto the band means light on faces. A browser cannot output Syphon or NDI directly; to mask, capture the projector window with OBS (Window Capture → NDI or Syphon plugin) into Resolume, HeavyM or MadMapper, or rear-project onto a gauze and avoid the problem.
- **Fewer things to go wrong.** Install the app (below), turn off sleep and updates on the laptop, run the show from `npm run remote`, and put the phone or the controller in charge so nobody has to reach for the trackpad in the dark.

### Which controller

The APC mini mk2 is the cheap, right answer: an 8×8 RGB grid for presets and dyes, nine faders, and USB power. Better, if the budget stretches: the **APC40 mkII** adds a master fader (the dimmer), sixteen knobs and a crossfader, and is what most VJs carry; the **Launch Control XL** is the fader-and-knob desk with no pads; a **Launchpad Mini mk3 / Launchpad X** is the pad grid with no faders, so pair it with a nanoKONTROL2. Factory maps for all of them are in the MIDI panel. Endless encoders (a MIDI Fighter Twister, a Faderfox) work through learn with *Endless encoder* ticked.

## Installing the app

ChromaGlass is a Progressive Web App. In Chrome or Edge, open the site (or the show server's address) and use the install icon at the right of the address bar: it gets its own dock or taskbar icon and opens in a window with no tabs or address bar. The installed app is the same code, updated on the next open.

With the window-management permission granted (the Cast menu's **Second display** asks for it once), the app notices a projector on load and when it is plugged in, and either offers to send the show there in one click or, in Automatic mode, sends it fullscreen on the next click (see *A projector on HDMI*).

## OSC

The show server listens for OSC on UDP port 9000 (`OSC_PORT` to change, `OSC_PORT=0` to turn it off), from the local network only, so Resolume, TouchDesigner, Max, Ableton (Connection Kit) and phone OSC apps can drive the show:

```
/chromaglass/setting/<key> <number>    any numeric setting, e.g. /chromaglass/setting/audioImpact 0.8
/chromaglass/action/<name>             seed clear drain lucky play pause automate-on automate-off
                                       overlays-on overlays-off seq-play seq-pause seq-next seq-prev seq-stop
                                       preset-next preset-prev blackout-toggle record-toggle
/chromaglass/preset <id>               cue a preset (galaxy, oil-on-water, or a user-… id)
/chromaglass/blow x y [amount] [dx dy] air at a point (0..1, y up)
/chromaglass/drop x y [amount]         dye at a point
/chromaglass/press x y [amount]        press the glass at a point
/chromaglass/tilt x y                  rock the plate (-1..1)
/chromaglass/dye #rrggbb               the dropper's colour
```

## MIDI and game controllers

The **MIDI** button in the toolbar (Chrome, Edge or Opera — Safari and Firefox have no Web MIDI) turns a controller on the desk into the show's hands: faders ride settings, pads cue presets and dye colours, buttons fire the one-shots and drive the sequencer.

- **Factory maps** for the Akai APC mini mk2 (pads top-down are presets, the bottom two rows dyes, scene buttons run the sequencer and one-shots, faders ride Sound Drive / Evolve Speed / Speed / Dye Budget / Turbulence / Plate Rock / Bubbles / Saturation / Camera), the Akai APC40 mkII (clip grid presets with the bottom row of pads the dye palette, master fader the dimmer, device knobs the lamp and camera, track knobs the plate, crossfader Sharpness and the cue encoder Granulation, arrows step presets, transport play / blackout / record, and Drain and Clear alone under the scene column, away from Seed), the Novation Launchpad Mini mk3 and Launchpad X in programmer mode (pads presets and dyes, top row one-shots and sequencer, side column toggles), the Novation Launch Control XL (faders, three rows of knobs, two rows of buttons) and the Korg nanoKONTROL2 (faders and knobs, S buttons one-shots, M buttons toggles, transport keys the sequencer). Anything else is a few minutes of learn away.
- **The controller, drawn.** The **APC40 mkII picture** button in the MIDI panel opens the whole panel to scale: forty clip pads, the five button rows under the grid, nine faders, sixteen knobs, the crossfader and the transport, every one carrying the MIDI address it really sends (taken from Akai's Communications Protocol v1.2). Touch a control on the desk and the picture selects it; pick what it should do from the list beside it and it is bound. Every control shows what it does, coloured by what kind of thing that is, with dyes in their own colour. Labels are measured against the type they are drawn in, so they shrink and wrap to fit rather than being cut short, and a colour that would disappear into the panel is lifted or dropped until it reads. **On paper** turns the whole sheet — picture and list — to black on white, and **Save PNG** writes it out at twice size, so the same picture that made the map is the cheat sheet on the phone or taped to the desk. It works before the hardware arrives, and Escape closes it.
- **MIDI learn**: pick what a control should do in the panel (any of thirty settings, every action, every preset, every dye), then touch the control. Tick *Endless encoder* first for a knob with no stop (relative "two's-complement" nudges); the binding list flips any CC between `abs` and `enc` later.
- **Soft takeover**: a fader that disagrees with the app is ignored until it passes through the app's value, so a slider dragged on the phone does not jump back the moment a fader twitches. Turn it off for a controller with motorised faders.
- **LED feedback**: preset pads light in the preset's lead dye (dim until it is the active one), dye pads in their colour, toggle buttons on or off, on the APC mini mk2 / Launchpad velocity palette; CC-driven LEDs get 127/0. *LEDs: Auto* picks the output that shares a name with the input.
- **Maps are files**: **Save file** writes a `.chromaglass-midi.json` next to your presets and sequences; **Load file** reads one in. The map also lives in the browser, and MIDI comes back on by itself on the next visit.

A **game controller** needs no setup: plug it in (or pair it) and press a button. The left stick moves a cursor over the plate, the right stick blows air from the cursor in the direction it is pushed, the right trigger drops dye (as much as it is pulled), the left trigger presses the glass, the shoulders cycle the dye colour, the d-pad steps presets (left/right) and plates (up/down), A seeds, B drains, X rolls a random look, Y cleans the screen, Start is play/pause, Back is Random Evolve, R3 is Macro, L3 recentres the cursor. The Gamepad API carries no gyro, so rocking the plate stays with the phone's tilt.

### The show key

Every start prints a four-digit **show key**, and phones and network displays must carry it in their address (`&key=1234`) to join; the printed addresses include it. Set `SHOW_KEY=1234 npm run remote` for one that stays the same. The key is what makes it safe to expose the server beyond the room.

### Across buildings, other access points, or the internet

A home with several access points often puts devices on segments that cannot see each other, and a projector in another building may not be on the laptop's network at all. Rather than fight the network, open a tunnel: the projector reaches the laptop's show server through the internet, with the key keeping strangers out.

```bash
brew install cloudflared
npm run tunnel
```

The tunnel prints an `https://….trycloudflare.com` address. On the projector open `https://<that address>/?cast=true&key=<show key>`, and on a phone `…/?remote=1&key=<show key>`. Keep `npm run remote` running in its own window; the tunnel only forwards to it. The tunnel adds tens of milliseconds, which the show absorbs, and it closes when its window does.

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
  chain of WebGL2 fragment passes, and a frame-time governor picks the grid:
  it starts from a guess for the hardware, steps down within a couple of
  seconds if frames are being dropped, and climbs one rung at a time when
  there is sustained room. Machines whose GPU can't render to float textures
  use the 192² CPU solver. Settings → Simulation → Fluid Grid pins a size or
  forces the CPU path, and shows which engine is live and the frame rate.
- **Advection.** Both paths use MacCormack advection (a forward and a backward
  semi-Lagrangian pass, corrected and clamped), which is what lets a thin
  filament of dye survive more than a few steps instead of blurring away.

### One build, three tiers

The same build serves three situations, and only the assumed headroom differs:

| Tier | How it runs | Ladder |
|---|---|---|
| **Hosted** | chromaglass.web.app | up to 384² at 1.5x pixels — never stutters on a first visit |
| **Local** | `npm run remote` on your own machine | up to 768² at native pixel density, plus the phone remote |
| **Native** | a desktop shell around `dist/` (not built yet) | as local |

The tier is detected from where the page was loaded (`localhost`, a private
LAN address or `.local` is local; an Electron/Tauri shell is native), and the
GPU class from the renderer string. When the hosted page has had to step
down, it shows a card with the three commands to run the show locally.

For testing, `?sim=cpu|auto|<size>`, `?tier=hosted|local|native` and
`?gpu=software|weak|mid|strong` override detection for that page load,
`?warp=N` lifts the solver's catch-up cap (steps per frame) so a slow renderer
still keeps up with wall-clock time, and `?debug` exposes
`window.chromaglassDebug()` with the live solver state and governor.

## Controls

| Control | Description |
|---------|-------------|
| Play/Pause | Start or stop the simulation |
| Mic / Monitor | Toggle microphone or system audio input |
| Lucky | Randomize all settings |
| Dropper tool | Click/tap to add colored dye |
| Blow tool | Click/tap to blow air bubbles |
| Press tool | Hold to press the top glass: the film thins under the hand and the dye spreads out in a ring, or into radial fingers with **Fingering** up |
| Macro zoom | With the closeup on: + and − (or = and _), the wheel over the plate, or the − / + chip below the title, from 1× to 16×; + with the closeup off turns it on at 2× |
| Projectors / Oil Beads / Plate Cells | Settings → Show: each layer its own dish on a black screen; a field of dark-rimmed oil droplets; a fine cell network in the dish core. The Fillmore East, 1969 preset uses all three |
| Mic / System / File | Where the show listens: the microphone (or the input chosen in Settings → Sound), system audio, or a music file played here with its own small player |
| Dimmer / Blackout | Settings → Sound: the house lights for the plate; **B** fades to black and back, as does the Blackout button on the phone or from a controller |
| Record | The red button by Cast: the show to a `.webm` file, music included |
| Layer buttons | Switch active fluid layer |
| Clear | Wipe the active layer |
| Random Evolve | Automated dye drops and air blows driven by the music; the **Evolve Speed** slider under it sets how often, from a drop every second or so to a frenzy |
| Macro toggle | Magnify the plate and chase a single bead of liquid |
| Sequence | Open the Show Sequencer: pick a sequence, play, pause, skip stages, or edit and save your own |
| Phone remote | Presets, drive, speed, macro and gestures from `?remote=1` on another device |
| Projectionist pad | On the phone or iPad: drag to blow air, tap to drop dye, pick a dye colour, pick which plate the device works, stream the device's tilt into the plate, or give the pad the whole screen. A pen's pressure sets how much dye, its tilt which way the air goes |
| MIDI | Turn a MIDI controller on, load a factory map (APC mini mk2, APC40 mkII, nanoKONTROL2, Launchpad, Launch Control XL), assign from a picture of the controller that doubles as a printable cheat sheet, or teach yours with MIDI learn; soft takeover, endless encoders, LED feedback; maps saved as `.chromaglass-midi.json` |
| Game controller | Sticks move a cursor and blow, triggers drop dye, shoulders cycle the dye, d-pad steps presets and plates, face buttons are the one-shots |
| Projectors | Settings → Projectors: lumia, chemistry, gel wheel, lamp warmth, exposure, and a film projector fed by a video file or the camera |
| Show | Settings → Show: hue journey, beat squeeze, background loop, kaleidoscope, round dish |
| Lamp | Settings → Lamp: light play, lamp motion, hot-spot, second lamp, iridescence |
| Camera | Settings → Camera: light show or photograph, paper colours, camera, focus, aperture, bloom, chromatic aberration, refraction, micro-droplets, thin film |
| Eye toggle | Minimize/maximize the UI |
| Clean Screen | Hide every overlay and the cursor for a projected show; **Esc** (or a finger held still on a touch screen) brings them back. Also on the phone remote |
| Preset name / Presets | The preset's name under the title, and the Presets button in the toolbar, open a menu of every preset, grouped Light show / Photograph / Closeup, with *Yours* on top; **Save current** writes the look to a `.chromaglass-preset.json` file and your library, **Load file** reads one back |
| Sequence files | In the Show Sequencer, **Save file** writes the selected sequence to a `.chromaglass-sequence.json` file (with any of your presets it uses); **Load file** reads one in |
| Cast | A menu: **Second display** (a projector on HDMI) opens a window on the second screen that mirrors this very canvas pixel for pixel — one render, at the projector's own resolution, every stroke on the laptop on the wall the same frame, the laptop keeping all the controls and a scaled copy (click the window once for fullscreen); **Network display** shows the address any browser on the same Wi-Fi can open to show the show — a projector or TV running its own browser, a tablet — fed through the show server's relay, no Chrome discovery involved; **Chromecast** uses Chrome's device picker — Nest displays take the show directly; a Google TV that does not appear or connect there is reached by opening Second display and then, on that window, Chrome's menu → Cast → the TV → Cast tab. Either way the receiver runs its own copy of the visualizer, fed the settings and audio bands by the show window |
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
    useMidi.ts                 # Web MIDI: devices, bindings, learn, soft takeover, LED feedback
    useGamepad.ts              # Gamepad API: cursor, blow, drop, press, buttons
    useRecorder.ts             # MediaRecorder: the canvas and the music to a video file
  lib/
    musicTypes.ts              # Music intelligence interfaces
    musicDb.ts                 # IndexedDB persistence (song maps, track evolution)
    evolution.ts               # ISRC-seeded visual identity + per-listen evolution
    gpuFluid.ts                # WebGL2 fluid solver: the CPU pipeline as fragment passes
    bubbles.ts                 # Trapped-air bubbles: ride the flow, merge, pop; drawn as lenses
    beads.ts                   # Oil beads: hundreds of dark-rimmed droplets, drawn from a mask texture
    chemistry.ts               # Gray-Scott reaction-diffusion: patterns that grow on the plate and deposit dye
    governor.ts                # Frame-time governor: walks the quality ladder
    platform.ts                # Tier (hosted/local/native), GPU class, quality ladders
    macroCamera.ts             # Macro closeup: bead detection, tracking, whip cuts
    audioCalibration.ts        # Room calibration: adaptive floor/ceiling per feature
    remoteProtocol.ts          # Phone-remote message types and socket URL
    midi.ts                    # MIDI messages, bindings, factory maps, pad colours, map files
    controllerSurface.ts       # Where every control sits on a controller's face, and what it sends
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
    RemoteControl.tsx          # The phone and tablet control surface
    MidiPanel.tsx              # MIDI: devices, factory maps, learn, bindings, files
    ControllerSurface.tsx      # The controller drawn to scale: assign by touching, and the cheat sheet
    RunLocallyCard.tsx         # Hosted-build nudge to run the show locally
server/
  fingerprint-worker.js        # Cloudflare Worker proxy for AudD/ACRCloud
  remote-server.js             # LAN static server + control relay + OSC in (npm run remote)
public/
  manifest.webmanifest         # PWA manifest: installable, standalone window
  sw.js                        # Service worker: light cache, never the relay
```

## Updating everything at once

From the clone on the machine that runs the show:

```bash
npm run ship
```

That pulls main, installs, builds, publishes the build to Firebase Hosting, and then starts the show server in the same window (Ctrl+C stops it). The pieces are also separate: `npm run update` (pull, install, build), `npm run deploy` (publish the build), `npm run remote` (the show server).

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
